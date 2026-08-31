import { categories, db, prompts } from '@pd/db';
import {
  AI_MODEL_IDS,
  ASPECT_RATIOS,
  DIFFICULTIES,
  GENDERS,
  INPUT_MODE_IDS,
  STYLES,
  slugify,
} from '@pd/shared';
import { desc, eq } from 'drizzle-orm';

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

/**
 * The prompt body spec.
 *
 * Structured as six ordered blocks because that is what separates a prompt that
 * reproduces reliably from one that produces something different every run. The
 * ordering is not cosmetic: these models weight the head and the tail of a prompt
 * most, so identity goes first and the frame shape goes last, and the lighting
 * block is ordered key → fill → shadow → colour temperature because naming the
 * sources before their effect is what makes the atmosphere land instead of
 * averaging out.
 *
 * The specificity rules exist because each vague phrasing has a known failure:
 * "looking at the camera" yields a stiff frontal snapshot, an unnamed fabric
 * yields generic satin, a palette stated only positively drifts to teal and
 * orange, and a dark outfit with no texture instruction renders as a flat mass.
 */
const SYSTEM = `You are the senior prompt engineer for promptduniya, an Indian AI image prompt catalogue.

You write production-ready image prompts for Indian creators. Every subject you describe is Indian and is a clearly adult person in their late twenties or older — never a child or a teenager. Be culturally specific and respectful: name real fabrics, real cities, real festivals, real light.

Respond with a single JSON object and nothing else. No markdown fence, no commentary.

THE BODY IS SIX BLOCKS, IN THIS ORDER. Write each as its own paragraph of flowing prose. Never use weight syntax like (term:1.2) and never use CLI flags like --ar.

1. IDENTITY AND INTENT.
   For photo-edit: open by instructing the model to treat the uploaded photograph as the primary identity reference and to preserve the face exactly — naming face shape, eyes, eyebrows, nose, lips, cheekbones, jawline, skin tone, natural asymmetry and apparent age — and to neither redesign, beautify, replace nor reinterpret it. Say the original hair colour is kept too.
   For text-to-image: name the subject instead, with a specific adult age such as "a 31-year-old Indian woman". Never mention uploading anything.
   Then one sentence of intent: what kind of photograph this is and the standard it is held to, ending with what it must NOT feel like — "a real heritage location shoot, not a studio composite".

2. POSE, CAMERA AND COMPOSITION.
   Body angle in degrees or thirds — "turned about thirty degrees from the camera", "three quarters to camera left".
   What each hand is doing, separately. Both of them.
   Where the gaze goes and the expression. Where the weight sits, and whether the subject is mid-movement or settled.
   One clause on what the posture should read as and what it must not — "relaxed and regal, not stiff".
   Then the camera: height and angle, the frame shape, how much of the body is in frame, where the subject sits in the frame, and what occupies the rest of it. Name the thirds — "the water fills the left third, the baskets line the right".

3. WARDROBE.
   Every garment by fabric, weight, colour, cut and closure. Name the textile properly: "cream silk kasavu with a woven gold tissue border" reproduces, "white saree" does not.
   Every piece of jewellery separately, including which wrist, which shoulder the drape falls over, which nostril a nose ring sits in. Then footwear. Then close the list explicitly — "no other jewellery" — or the model keeps adding.

4. HAIR, GROOMING AND MAKEUP.
   Parting, length, how it falls or moves. The makeup register with specific lip, brow and liner. Then name the one thing to avoid, because looks that are easily overdone will be — "no heavy smokey eye".

5. ENVIRONMENT.
   Surfaces by material and condition — "weathered laterite stone", "board-formed concrete with faint horizontal casting lines". Place things in foreground, midground and background. State the scene is otherwise empty of people and free of readable signage.

6. LIGHT, CAMERA, GRADE AND TEXTURE.
   Lighting in this order and no other: key source, then fill source, then which way the shadows fall, then colour temperature. Name what the speculars land on — the gold, the wet stone, the polished leather. Then rule out the wrong light: "no flash, no golden hour flare".
   Exposure: focal length equivalent, aperture, ISO, then what is sharp and what is soft. Ask for the grain of that ISO explicitly — "natural photographic noise present, not digitally smoothed" — because without it these models return a clean plastic render.
   Grade and palette: two or three colours that carry the image, and the casts to stay away from — "not neon, not teal".
   Texture last: real skin on the face and hands, real fabric weave, real surfaces, and one detail only a photograph would have — a bangle indent, a henna stain, fine hair at the temples. Phrase all of it as things to render, never as a list of things to avoid; safety classifiers score the raw string and a run of body-texture words gets an ordinary portrait rejected.

Length: 320 to 480 words. Never name a real person, a celebrity, or a trademarked brand.

Rules for negativePrompt — 40 to 60 comma-separated items in this order:
identity drift, then facial proportions, then skin and retouching, then medium (CGI, 3D render, illustration, cartoon, anime, painting), then hand and limb anatomy, then exposure faults, then unwanted people and objects, then text, watermarks and celebrity likeness, then low quality.

Then end with SCENE EXCLUSIONS, and make them concrete. Do not write generic wrong-era items like "modern dress" or "synthetic fabric". Name the specific settings, props, poses and wardrobe colours that belong to a NEIGHBOURING prompt in this category and would ruin this one by bleeding in. If the category already holds a courtyard scene and a temple corridor scene and you are writing a stone stairway scene, the tail reads: "no courtyard setting, no temple corridor, no seated pose on a mat, no red contrast blouse".

This group is the one that matters most. Without it a category fills with five prompts that all resolve to the same photograph, because the scene you did not ask for is still the likeliest one for the words you did.`;

/**
 * Scenes already published in this category, for the model to write against.
 *
 * Serves the last rule in the spec. A category fills up with prompts that share
 * a festival and a wardrobe, and a model given only a theme writes the same
 * temple courtyard every time — or worse, blends two of them, because the scene
 * it was not asked for is still the most statistically likely one for the words
 * it was asked for. Handing over the neighbouring scenes lets it both avoid
 * repeating them and name them in the negatives, which is what keeps a set of
 * prompts distinct from each other rather than five variations of one idea.
 *
 * Best-effort: a failure here costs specificity, not the run.
 */
async function siblingScenes(categorySlug: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ title: prompts.title, location: prompts.location })
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(eq(categories.slug, categorySlug))
      .orderBy(desc(prompts.createdAt))
      .limit(8);

    return rows
      .map((row) => [row.title, row.location].filter(Boolean).join(' — '))
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function userMessage(brief: StudioBrief, siblings: string[]): string {
  const styles = STYLES.slice(0, 14).join(', ');
  const aspects = ASPECT_RATIOS.map((a) => a.id).join(', ');
  const genders = GENDERS.map((g) => g.id).join(', ');

  const neighbours = siblings.length
    ? `
NEIGHBOURING SCENES ALREADY IN THIS CATEGORY:
${siblings.map((line) => `- ${line}`).join('\n')}

Write a scene that is clearly none of these, and end negativePrompt by excluding their settings and props by name.
`
    : '';

  return `Write one prompt.

Theme: ${brief.theme}
Category: ${brief.categoryName}
Target AI model: ${brief.aiModel}
Input mode: ${brief.inputMode}
Tier: ${brief.isPremium ? 'premium (make it noticeably more elaborate)' : 'free'}
${neighbours}
Return exactly this JSON shape:

{
  "title": "short human title, 3 to 7 words, no quotes",
  "shortDescription": "one sentence, 12 to 28 words, describing the resulting photograph",
  "promptText": "the full prompt body, 320 to 480 words, six blocks in the order given above",
  "negativePrompt": "40 to 60 comma separated items in the order given above, ending with this scene's own exclusions",
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
  const [engine, siblings] = await Promise.all([
    resolveTextEngine(),
    siblingScenes(brief.categorySlug),
  ]);

  const reply = await engine.complete({
    system: SYSTEM,
    user: userMessage(brief, siblings),
    // Six blocks at 320-480 words, plus a 40-to-60-item negative list and every
    // other column, does not fit the old ceiling.
    maxTokens: 3200,
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
