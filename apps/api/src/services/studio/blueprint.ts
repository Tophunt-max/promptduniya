import {
  AI_MODEL_IDS,
  ASPECT_RATIOS,
  DIFFICULTIES,
  GENDERS,
  INPUT_MODE_IDS,
  STYLES,
  slugify,
} from '@pd/shared';

import { AppError } from '../../lib/errors';
import { resolveTextEngine } from './text';

/**
 * Turns a one-line brief into a complete, publishable prompt record.
 *
 * The public generator (services/generator) writes prompt *text* from a filled-in
 * form. The studio has to do considerably more: invent the idea, then produce
 * every column the catalogue needs — category, style, gender, lighting, camera,
 * aspect ratio, tags, SEO, and the prompt body itself — so the result can be
 * inserted and published without a human filling in blanks.
 *
 * That means the model's reply has to be parsed, and a model that returns prose
 * where JSON was asked for is the normal case rather than the exception. So the
 * schema is stated twice — once as a field list, once as a worked example — and
 * everything that comes back is coerced against the real enums afterwards.
 * Anything unusable falls back to a safe default instead of failing the run.
 */

export interface StudioBrief {
  /** Free-text theme, e.g. "Chhath Puja portraits at the ghat". */
  theme: string;
  /** Category slug the prompt must belong to. */
  categorySlug: string;
  categoryName: string;
  aiModel: string;
  inputMode: string;
  isPremium: boolean;
}

export interface DraftedPrompt {
  title: string;
  shortDescription: string;
  promptText: string;
  negativePrompt: string;
  usageInstructions: string;
  style: string;
  gender: string;
  ageGroup: string;
  location: string;
  aspectRatio: string;
  cameraStyle: string;
  lighting: string;
  mood: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  engine: string;
}

/* ------------------------------ Instructions ------------------------------ */

const SYSTEM = `You are the senior prompt engineer for promptduniya, an Indian AI image prompt catalogue.

You write production-ready image prompts for Indian creators. Every subject you describe is Indian and is a clearly adult person in their late twenties or older — never a child or a teenager. Be culturally specific and respectful: name real fabrics, real cities, real festivals, real light.

Respond with a single JSON object and nothing else. No markdown fence, no commentary.

Rules for the prompt body:
- Write flowing prose in paragraphs. Never use weight syntax like (term:1.2) and never use CLI flags like --ar.
- Cover, in this order: subject and pose, wardrobe with named fabrics, environment and surfaces, texture, lighting with direction and colour temperature, then camera and colour grade.
- Name a specific adult age, for example "a 31-year-old Indian woman".
- 220 to 400 words.
- Never name a real person, a celebrity, or a trademarked brand.

If the input mode is photo-edit, the prompt must open by instructing the model to treat an uploaded photograph as the exact facial identity and to preserve it without beautifying or reshaping it. If the input mode is text-to-image, the prompt invents the subject entirely and must not mention uploading anything.`;

function userMessage(brief: StudioBrief): string {
  const styles = STYLES.slice(0, 14).join(', ');
  const aspects = ASPECT_RATIOS.map((a) => a.id).join(', ');
  const genders = GENDERS.map((g) => g.id).join(', ');

  return `Write one prompt.

Theme: ${brief.theme}
Category: ${brief.categoryName}
Target AI model: ${brief.aiModel}
Input mode: ${brief.inputMode}
Tier: ${brief.isPremium ? 'premium (make it noticeably more elaborate)' : 'free'}

Return exactly this JSON shape:

{
  "title": "short human title, 3 to 7 words, no quotes",
  "shortDescription": "one sentence, 12 to 28 words, describing the resulting photograph",
  "promptText": "the full prompt body, 220 to 400 words of prose",
  "negativePrompt": "comma separated list of things to avoid",
  "usageInstructions": "two or three sentences of practical advice for getting a good result",
  "style": "one of: ${styles}",
  "gender": "one of: ${genders}",
  "ageGroup": "one of: Young adult, Adult, Middle aged, Senior",
  "location": "specific place, e.g. 'Varanasi ghat at dawn'",
  "aspectRatio": "one of: ${aspects}",
  "cameraStyle": "e.g. '85mm portrait lens, f/2.0'",
  "lighting": "e.g. 'Warm diya flame light'",
  "mood": "single word, e.g. 'Festive'",
  "difficulty": "beginner, intermediate or advanced",
  "tags": ["4 to 7 short lowercase tags"],
  "seoTitle": "under 60 characters",
  "seoDescription": "under 150 characters"
}`;
}

/* -------------------------------- Parsing --------------------------------- */

/** Pulls the first JSON object out of a reply that may be fenced or chatty. */
function extractJson(raw: unknown): Record<string, unknown> | null {
  // Defensive: an engine that hands back a non-string used to crash here with
  // "raw.trim is not a function" rather than falling through to a clear error.
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
    // Llama in particular likes to wrap the object in a sentence.
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

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Coerces a model's free-text answer onto a known option, case-insensitively. */
function oneOf(value: unknown, options: readonly string[], fallback: string): string {
  const candidate = text(value).toLowerCase();
  const hit = options.find((option) => option.toLowerCase() === candidate);
  if (hit) return hit;
  // Models often answer "Cinematic portrait" when the option is "Cinematic".
  const partial = options.find(
    (option) => candidate.includes(option.toLowerCase()) || option.toLowerCase().includes(candidate),
  );
  return partial ?? fallback;
}

const AGE_GROUPS = ['Young adult', 'Adult', 'Middle aged', 'Senior'] as const;

export async function draftPrompt(brief: StudioBrief): Promise<DraftedPrompt> {
  const engine = resolveTextEngine();
  const reply = await engine.complete({
    system: SYSTEM,
    user: userMessage(brief),
    maxTokens: 2200,
  });

  const parsed = extractJson(reply);
  if (!parsed) {
    throw AppError.badRequest(
      `${engine.name} did not return usable JSON. Try again, or switch TEXT_PROVIDER to gemini/openai for stricter formatting.`,
    );
  }

  const promptText = text(parsed.promptText ?? parsed.prompt);
  if (promptText.length < 120) {
    throw AppError.badRequest(
      `${engine.name} returned a prompt body of only ${promptText.length} characters. Regenerate.`,
    );
  }

  const title = text(parsed.title, brief.theme).slice(0, 150);
  const shortDescription = text(
    parsed.shortDescription,
    `${title} — an AI image prompt for ${brief.categoryName}.`,
  ).slice(0, 290);

  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
  const tags = rawTags
    .map((tag) => text(tag).toLowerCase())
    .filter((tag) => tag.length > 1 && tag.length <= 40)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 7);

  return {
    title,
    shortDescription,
    promptText: promptText.slice(0, 7900),
    negativePrompt: text(parsed.negativePrompt).slice(0, 1900),
    usageInstructions: text(parsed.usageInstructions).slice(0, 1900),
    style: oneOf(parsed.style, STYLES, 'Cinematic'),
    gender: oneOf(
      parsed.gender,
      GENDERS.map((g) => g.id),
      'any',
    ),
    ageGroup: oneOf(parsed.ageGroup, AGE_GROUPS, 'Adult'),
    location: text(parsed.location).slice(0, 110),
    aspectRatio: oneOf(
      parsed.aspectRatio,
      ASPECT_RATIOS.map((a) => a.id),
      '4:5',
    ),
    cameraStyle: text(parsed.cameraStyle).slice(0, 110),
    lighting: text(parsed.lighting).slice(0, 110),
    mood: text(parsed.mood).slice(0, 50),
    difficulty: oneOf(
      parsed.difficulty,
      DIFFICULTIES.map((d) => d.id),
      'intermediate',
    ) as DraftedPrompt['difficulty'],
    // Tags always carry the category and input mode so the catalogue stays
    // navigable even when the model returns nothing useful.
    tags: tags.length
      ? tags
      : [brief.categorySlug, brief.inputMode === 'photo-edit' ? 'photo editing' : 'text to image'],
    seoTitle: text(parsed.seoTitle, title).slice(0, 190),
    seoDescription: text(parsed.seoDescription, shortDescription).slice(0, 310),
    engine: engine.name,
  };
}

/** Guards against the enums drifting away from what the instruction advertises. */
export function assertBriefValid(brief: StudioBrief): void {
  if (!brief.theme.trim()) throw AppError.badRequest('A theme is required');
  if (!(AI_MODEL_IDS as readonly string[]).includes(brief.aiModel)) {
    throw AppError.badRequest(`Unknown AI model: ${brief.aiModel}`);
  }
  if (!(INPUT_MODE_IDS as readonly string[]).includes(brief.inputMode)) {
    throw AppError.badRequest(`Unknown input mode: ${brief.inputMode}`);
  }
  if (!slugify(brief.categorySlug)) throw AppError.badRequest('A category is required');
}
