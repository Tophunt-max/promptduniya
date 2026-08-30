import { categories, db, prompts } from '@pd/db';
import { eq } from 'drizzle-orm';

import { nowSec } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { resolveTextEngine } from './text';

/**
 * Rewrites the SEO fields of a prompt that already exists.
 *
 * The gap this fills: SEO metadata could only ever be produced as a side effect
 * of creating a brand new prompt through the studio pipeline. `draftPrompt` takes
 * a *theme* and invents a whole record; there was no way to point at row 412 and
 * say "the title and meta description on this one are weak, write better ones".
 * An operator's only options were to type them by hand or to regenerate the
 * entire prompt and lose the body they were happy with.
 *
 * That matters most for the several hundred prompts seeded before the studio
 * existed, whose `seoTitle`/`seoDescription` fall back to the plain title and
 * short description — technically populated, competing badly.
 *
 * Scoped deliberately narrowly: this reads the prompt and writes back exactly
 * two columns. It never touches `promptText`, because the prompt body is the
 * product and regenerating it is a different, riskier operation that should be a
 * different button.
 */

const SYSTEM = `You write search metadata for an Indian AI image prompt catalogue.

You will be given a prompt's title, description, category and body. Write a better SEO title and meta description for its page.

Rules:
- The SEO title must be at most 60 characters, and must read naturally. No pipes stuffed with keywords, no ALL CAPS, no clickbait.
- The meta description must be 120 to 155 characters, describe what the reader actually gets, and include a reason to click.
- Use the words a person would search for, but never repeat a keyword more than twice across both fields.
- Never invent facts that are not in the prompt you were given.
- Never name a real person, a celebrity, or a trademarked brand.

Respond with a single JSON object and nothing else:
{ "seoTitle": "...", "seoDescription": "..." }`;

function userMessage(input: {
  title: string;
  shortDescription: string;
  categoryName: string;
  promptText: string;
  aiModel: string;
}): string {
  return `Title: ${input.title}
Category: ${input.categoryName}
Target model: ${input.aiModel}
Current description: ${input.shortDescription}

Prompt body (for context, do not summarise it literally):
${input.promptText.slice(0, 1200)}

Write the SEO title and meta description.`;
}

/** Tolerates a fenced or chatty reply, as every other parser here has to. */
function extractJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface ReseoResult {
  promptId: string;
  seoTitle: string;
  seoDescription: string;
  /** What was there before, so the console can offer a revert. */
  previous: { seoTitle: string | null; seoDescription: string | null };
  engine: string;
}

export async function regeneratePromptSeo(promptId: string): Promise<ReseoResult> {
  const rows = await db
    .select({
      id: prompts.id,
      title: prompts.title,
      shortDescription: prompts.shortDescription,
      promptText: prompts.promptText,
      aiModel: prompts.aiModel,
      seoTitle: prompts.seoTitle,
      seoDescription: prompts.seoDescription,
      categoryName: categories.name,
    })
    .from(prompts)
    .leftJoin(categories, eq(prompts.categoryId, categories.id))
    .where(eq(prompts.id, promptId))
    .limit(1);

  const prompt = rows[0];
  if (!prompt) throw AppError.notFound('Prompt not found');

  const engine = await resolveTextEngine();
  const reply = await engine.complete({
    system: SYSTEM,
    user: userMessage({
      title: prompt.title,
      shortDescription: prompt.shortDescription ?? '',
      categoryName: prompt.categoryName ?? 'AI prompts',
      promptText: prompt.promptText ?? '',
      aiModel: prompt.aiModel ?? 'gemini',
    }),
    maxTokens: 400,
  });

  const parsed = extractJson(reply);
  if (!parsed) {
    throw AppError.badRequest(
      `${engine.name} did not return usable JSON. Try again, or switch TEXT_PROVIDER to gemini/openai for stricter formatting.`,
    );
  }

  const seoTitle = text(parsed.seoTitle);
  const seoDescription = text(parsed.seoDescription);

  // Refuse a partial result rather than half-writing the pair. A page with a new
  // title and a stale description is worse than one left alone, because the
  // mismatch is invisible until someone reads the SERP entry.
  if (seoTitle.length < 10 || seoDescription.length < 40) {
    throw AppError.badRequest(
      `${engine.name} returned metadata that was too short to use (title ${seoTitle.length} chars, description ${seoDescription.length}). Regenerate.`,
    );
  }

  const previous = { seoTitle: prompt.seoTitle, seoDescription: prompt.seoDescription };

  await db
    .update(prompts)
    .set({
      seoTitle: seoTitle.slice(0, 190),
      seoDescription: seoDescription.slice(0, 310),
      updatedAt: nowSec(),
    })
    .where(eq(prompts.id, promptId));

  return {
    promptId,
    seoTitle: seoTitle.slice(0, 190),
    seoDescription: seoDescription.slice(0, 310),
    previous,
    engine: engine.name,
  };
}

/**
 * Prompts whose SEO fields are missing or are just a copy of the title.
 *
 * Drives a "fix these" queue in the console. The `seo_title = title` comparison
 * is the interesting half: `draftPrompt` falls back to the title when a model
 * returns nothing usable, so those rows look populated to any NULL check while
 * being exactly as weak as an empty one.
 */
export async function promptsNeedingSeo(limit = 50) {
  return db
    .select({
      id: prompts.id,
      title: prompts.title,
      slug: prompts.slug,
      seoTitle: prompts.seoTitle,
      seoDescription: prompts.seoDescription,
      isPublished: prompts.isPublished,
    })
    .from(prompts)
    .where(
      eq(prompts.isPublished, true),
    )
    .limit(500)
    .then((rows) =>
      rows
        .filter((row) => {
          const title = (row.seoTitle ?? '').trim();
          const description = (row.seoDescription ?? '').trim();
          return (
            title.length === 0 ||
            description.length < 60 ||
            title.toLowerCase() === row.title.trim().toLowerCase()
          );
        })
        .slice(0, limit),
    );
}
