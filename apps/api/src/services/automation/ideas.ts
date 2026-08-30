import { categories, db } from '@pd/db';
import { AI_MODEL_IDS } from '@pd/shared';
import { eq } from 'drizzle-orm';

import { AppError } from '../../lib/errors';
import { themeAlreadyUsed } from '../studio/duplicates';
import { resolveTextEngine } from '../studio/text';
import { logAutomation, logError } from './logs';
import { takeUnusedSignals } from './trends';
import type { AutomationConfig } from './config';

/**
 * Idea generation — turning a signal into a brief the pipeline can execute.
 *
 * `blueprint.draftPrompt` expands a theme into a full prompt record, but it needs
 * a theme to start from, and before this module the only source of themes was an
 * operator typing them one per line into a textarea. That is the single missing
 * link between "we know what is trending" and "a post exists about it".
 *
 * An idea is not just a string. To be executable it needs a category (the queue
 * row requires one, and the category shapes the drafting instruction) and an
 * input mode. So this returns briefs rather than themes, and routes each one to a
 * real category — falling back to a sensible default rather than failing, because
 * a brief that cannot be enqueued is worth nothing.
 */

export interface GeneratedIdea {
  theme: string;
  categoryId: string;
  categoryName: string;
  inputMode: 'text-to-image' | 'photo-edit';
  isPremium: boolean;
  aiModel: string;
  /** Signal this idea came from, so the caller can mark it used. */
  trendSignalId: string | null;
  /** Why this idea exists — surfaced in the admin preview. */
  rationale: string;
  engine: string;
}

const IDEA_SYSTEM = `You are a content planner for an Indian AI image prompt catalogue.

Turn each direction you are given into one specific, shootable photo theme for adult Indian subjects.

Rules:
- Name an occasion or setting, a look, and something about the light or mood.
- 6 to 14 words. No trailing punctuation.
- Never name a real person, a celebrity, or a trademarked brand.
- No children, no teenagers, nothing sexual.
- Every theme in your list must be visually distinct from the others.

Respond with a single JSON object and nothing else:
{ "ideas": [ { "theme": "...", "category": "one of the listed categories" } ] }`;

function ideaUserMessage(input: {
  directions: string[];
  count: number;
  categoryNames: string[];
}): string {
  const directions = input.directions.length
    ? input.directions.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : 'No specific direction. Propose evergreen themes Indian creators search for consistently.';

  return `Directions:
${directions}

Categories to choose from: ${input.categoryNames.join(', ')}

Return exactly ${input.count} ideas.`;
}

interface ParsedIdea {
  theme: string;
  category: string;
}

/** Tolerates fences, chatty wrappers, and a bare array instead of an object. */
function parseIdeas(raw: unknown): ParsedIdea[] {
  const coerce = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const cleaned = value
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.search(/[[{]/);
      const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
      if (start === -1 || end <= start) return null;
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  };

  const parsed = coerce(raw);
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown> | null)?.ideas ??
      (parsed as Record<string, unknown> | null)?.themes);

  if (!Array.isArray(list)) return [];

  const out: ParsedIdea[] = [];
  for (const item of list) {
    // Accept both { theme, category } and a bare string, because models drop the
    // wrapper object roughly one time in five.
    if (typeof item === 'string') {
      out.push({ theme: item.trim(), category: '' });
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const theme = typeof record.theme === 'string' ? record.theme.trim() : '';
      const category = typeof record.category === 'string' ? record.category.trim() : '';
      if (theme) out.push({ theme, category });
    }
  }

  return out.filter((idea) => idea.theme.length >= 8 && idea.theme.length <= 200);
}

/**
 * Deterministic spread of a percentage across a list.
 *
 * `Math.random()` would work but makes a batch impossible to reason about or
 * test: asking for 10 ideas at a 25% premium ratio should reliably give roughly
 * 2-3 premium items, not 0 one run and 6 the next. Interleaving by index gives
 * the configured ratio exactly and spreads the marked items through the batch
 * rather than clustering them at the front.
 */
function spread(index: number, percent: number): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  const step = 100 / percent;
  return Math.floor(index % step) === 0;
}

/** Best-effort mapping of a model's category answer onto a real category. */
function matchCategory(
  answer: string,
  available: { id: string; name: string; slug: string }[],
): { id: string; name: string } | null {
  const needle = answer.toLowerCase().trim();
  if (!needle) return null;

  const exact = available.find(
    (c) => c.name.toLowerCase() === needle || c.slug.toLowerCase() === needle,
  );
  if (exact) return { id: exact.id, name: exact.name };

  const partial = available.find(
    (c) => needle.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(needle),
  );
  return partial ? { id: partial.id, name: partial.name } : null;
}

/**
 * Infers a category from the theme text when the model did not supply a usable
 * one. Longest category name first, so "Pre Wedding" wins over "Wedding" for a
 * pre-wedding theme rather than losing to whichever happened to be checked first.
 */
function inferCategory(
  theme: string,
  available: { id: string; name: string; slug: string }[],
): { id: string; name: string } | null {
  const lower = theme.toLowerCase();
  const ordered = [...available].sort((a, b) => b.name.length - a.name.length);

  for (const category of ordered) {
    const name = category.name.toLowerCase();
    if (name.length >= 3 && lower.includes(name)) return { id: category.id, name: category.name };
  }
  return null;
}

export interface IdeaOptions {
  count: number;
  /** Free-text steer. Overrides trend signals when provided. */
  seed?: string;
  /** Forces every idea into this category. */
  categoryId?: string | null;
  useTrends?: boolean;
  config: AutomationConfig;
}

export async function generateIdeas(options: IdeaOptions): Promise<GeneratedIdea[]> {
  const count = Math.min(40, Math.max(1, options.count));

  const available = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.isActive, true));

  if (available.length === 0) {
    throw AppError.badRequest(
      'No active categories exist. Create at least one category before generating ideas.',
    );
  }

  // A forced category short-circuits all routing below.
  const forced = options.categoryId
    ? (available.find((c) => c.id === options.categoryId) ?? null)
    : null;
  if (options.categoryId && !forced) throw AppError.badRequest('Unknown category');

  /* ---- Directions: an explicit seed, or the best unused trend signals ---- */

  const signals = options.useTrends !== false && !options.seed ? await takeUnusedSignals(count) : [];

  const directions = options.seed
    ? [options.seed]
    : signals.map((signal) => signal.label);

  const aiModel = AI_MODEL_IDS.includes(options.config.defaultAiModel as never)
    ? options.config.defaultAiModel
    : 'gemini';

  /* ------------------------------- Ask the model ------------------------------ */

  const started = Date.now();
  let engineName = 'unknown';
  let parsed: ParsedIdea[] = [];

  try {
    const engine = await resolveTextEngine();
    engineName = engine.name;

    const reply = await engine.complete({
      system: IDEA_SYSTEM,
      user: ideaUserMessage({
        directions,
        count,
        categoryNames: available.map((c) => c.name).slice(0, 30),
      }),
      maxTokens: 1400,
    });

    parsed = parseIdeas(reply);

    // Zero parsed ideas means the reply did not honour the JSON contract. The
    // signal-label fallback below keeps the tick productive, but the operator
    // still needs to know the model is not really working — at `info` this was
    // indistinguishable from a healthy run.
    await logAutomation({
      scope: 'idea',
      level: parsed.length === 0 ? 'warn' : 'info',
      message:
        parsed.length === 0
          ? `Generated no usable ideas from ${directions.length} direction(s) — the reply did not parse. Check the text model on the AI providers screen.`
          : `Generated ${parsed.length} idea(s) from ${directions.length} direction(s)`,
      provider: engineName,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    await logError('idea', 'Idea generation failed', {
      provider: engineName,
      durationMs: Date.now() - started,
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
    // Fall through to the trend-signal fallback below rather than throwing. A
    // signal label is a usable theme on its own — worse than a planned idea, but
    // much better than a cron tick that produces nothing.
  }

  /* ------------- Fallback: use the raw signal labels as themes ------------- */

  if (parsed.length === 0) {
    if (directions.length === 0) {
      throw AppError.badRequest(
        'No ideas could be generated and no trend signals are available. Run trend discovery first, or supply a seed topic.',
      );
    }
    parsed = directions.slice(0, count).map((label) => ({ theme: label, category: '' }));
    engineName = `${engineName}:fallback-signals`;
  }

  /* ------------------------------ Assemble briefs ----------------------------- */

  const ideas: GeneratedIdea[] = [];
  const seenThemes = new Set<string>();

  for (const [index, candidate] of parsed.slice(0, count).entries()) {
    const key = candidate.theme.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenThemes.has(key)) continue;
    seenThemes.add(key);

    // Cheap pre-flight. Skipping here costs one indexed query; skipping later
    // costs a full prompt generation and an image.
    if (await themeAlreadyUsed(candidate.theme)) {
      await logAutomation({
        scope: 'idea',
        level: 'info',
        message: `Skipped "${candidate.theme}" — the catalogue already covers it`,
      });
      continue;
    }

    const routed = forced
      ? { id: forced.id, name: forced.name }
      : (options.config.autoCategory
          ? (matchCategory(candidate.category, available) ??
            inferCategory(candidate.theme, available))
          : null) ??
        // Last resort: the category with the fewest prompts, so unroutable ideas
        // fill gaps instead of piling onto whatever is already largest.
        (() => {
          const fallback = available[0]!;
          return { id: fallback.id, name: fallback.name };
        })();

    const signal = signals[index] ?? null;

    ideas.push({
      theme: candidate.theme,
      categoryId: routed.id,
      categoryName: routed.name,
      inputMode: spread(index, options.config.photoEditRatio) ? 'photo-edit' : 'text-to-image',
      isPremium: spread(index, options.config.premiumRatio),
      aiModel,
      trendSignalId: signal?.id ?? null,
      rationale: options.seed
        ? `From the seed topic "${options.seed}".`
        : (signal
            ? `From a ${signal.source} trend signal (score ${Math.round(signal.score)}).`
            : 'Evergreen suggestion.'),
      engine: engineName,
    });
  }

  return ideas;
}
