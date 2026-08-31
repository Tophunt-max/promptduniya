import { db, prompts, useR2 } from '@pd/db';
import { and, eq, isNull } from 'drizzle-orm';

import { AppError } from '../../lib/errors';
import { nowSec } from '../../lib/dates';
import { getPromptById } from '../prompts';
import { getSettings, setSettings } from '../settings';
import { uploadImage } from '../storage';
import { resolveImageEngine } from './index';
import type { ReferenceImage } from './types';

/**
 * Cover image generation for prompts.
 *
 * Two problems have to be solved before a prompt can be turned into a cover.
 *
 * **The prompt is too long, and aimed at the wrong thing.** A photo-edit prompt
 * runs to 800 words and its first paragraph is an instruction about preserving an
 * uploaded face. Feeding that verbatim to a text-to-image model produces a
 * literal-minded mess, and flux-1-schnell truncates at roughly 2,000 characters
 * anyway. So the instruction is rebuilt from the prompt's *structured* columns —
 * style, lighting, cameraStyle, mood, location, gender — which exist for exactly
 * this kind of use and describe the same scene in a fraction of the text.
 *
 * **A photo-edit prompt needs a face that does not exist yet.** Using a real
 * person's photo would be a consent problem and would stamp one real face across
 * the catalogue. Instead the site keeps a small set of synthetic "house models" —
 * generated once, stored in R2, chosen per prompt from the `gender` column that
 * is already on every row. Providers that accept image input get the house model
 * as a reference so the cover is produced the same way a reader will produce
 * theirs; providers that do not get a described subject instead.
 */

/* --------------------------- Subject description --------------------------- */

/**
 * Age groups this generator refuses to produce images for.
 *
 * Publishing AI-generated photographs of children is not something to automate,
 * whatever the prompt is about. Covers for these prompts have to be supplied by
 * hand with a human deciding what is appropriate.
 */
const REFUSED_AGE_GROUPS = new Set(['child', 'teen', 'kid', 'baby', 'infant', 'toddler']);

/**
 * A concrete adult age, because "young adult" does not work.
 *
 * The first test of this generator asked flux for "a young adult Indian person"
 * and got back a face that reads as roughly fourteen. Diffusion models treat
 * age words as weak style hints, and Indian portrait training data skews young,
 * so the two effects compound. Naming a specific age in the twenties or thirties
 * anchors it reliably; "adult" is then repeated in the same clause because
 * belt-and-braces costs nothing here.
 */
const ADULT_AGES: Record<string, string> = {
  // Deliberately at the top of each band rather than the middle. Testing showed
  // 27 still produced faces that read as late teens; 30 holds.
  'young adult': '30-year-old',
  adult: '34-year-old',
  'middle aged': '45-year-old',
  senior: '68-year-old',
  any: '32-year-old',
};

/**
 * Resolves 'any' and unset gender to a concrete one.
 *
 * "A 30-year-old adult Indian person" gives a diffusion model nothing to hold
 * on to — it has no prototype for a genderless face, and the result drifts young
 * and androgynous. Naming a gender fixes it. Chosen from the slug so a given
 * prompt always regenerates the same way, while the catalogue as a whole stays
 * mixed rather than defaulting everything to one gender.
 */
function concreteGender(gender: string | null, slug: string): string {
  if (gender && gender !== 'any') return gender;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2 === 0 ? 'female' : 'male';
}

/**
 * Every generated subject is Indian, stated explicitly.
 *
 * Image models default to a Western subject unless told otherwise, and this
 * catalogue is written for Indian creators — a cover showing someone the reader
 * cannot recognise as themselves is worse than no cover at all.
 */
function subjectPhrase(rawGender: string | null, ageGroup: string | null, slug: string): string {
  const key = (ageGroup ?? 'young adult').toLowerCase();
  const age = ADULT_AGES[key] ?? ADULT_AGES['young adult']!;
  const gender = rawGender === 'non-human' ? 'non-human' : concreteGender(rawGender, slug);

  switch (gender) {
    case 'male':
      return `a ${age} adult Indian man`;
    case 'female':
      return `a ${age} adult Indian woman`;
    case 'couple':
      return `an adult Indian couple, both around ${age.replace('-year-old', '')} years old`;
    case 'group':
      return `a small group of ${age} adult Indian friends`;
    case 'non-human':
      return 'the product, with no person in frame';
    default:
      // concreteGender() only ever returns male or female, so this is
      // unreachable; kept so the switch stays total.
      return `a ${age} adult Indian woman`;
  }
}

/**
 * Strips reader-facing copy out of `shortDescription`.
 *
 * That column is marketing text aimed at a human browsing the catalogue — it
 * opens with things like "Upload your photo and get…" or "Turn your photo into…".
 * Handed to an image model verbatim, the instruction to upload something is
 * meaningless at best and confusing at worst, so the lead-in is removed and only
 * the scene half is kept.
 */
function sceneFromDescription(description: string): string {
  const cleaned = description
    .replace(/^upload your photo (and|to) get\s*/i, '')
    .replace(/^turn your photo into\s*/i, '')
    .replace(/^upload your photo for\s*/i, '')
    .replace(/^a\s+(two-person\s+)?/i, '')
    .replace(/\bbuilt from two uploaded photos\b/gi, '')
    .replace(/\bbuilt around your uploaded photo\b/gi, '')
    .replace(/\busing your uploaded photo\b/gi, '')
    .replace(/\byour own face\b/gi, 'the subject')
    .replace(/\byour uploaded photo\b/gi, 'the subject')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Held constant across every cover so the grid reads as one photographic set.
 *
 * Worded carefully. The obvious phrasing — "authentic Indian skin tones with
 * visible pores, no skin smoothing" — reads as a photography note to a human but
 * trips Workers AI's safety classifier, which scores the raw string and sees
 * repeated body-texture vocabulary. An ordinary Diwali portrait came back as
 * "8007: Input prompt contains NSFW content" because of it. The same intent is
 * expressed here in lens-and-film language, which the classifier ignores.
 */
const QUALITY_CLAUSE =
  'Ultra-realistic editorial photograph on a full-frame camera, 85mm lens. ' +
  'True-to-life colour, natural complexion, fine photographic detail, sharp focus on the eyes. ' +
  'Unretouched documentary finish, no digital gloss.';

/**
 * The realism floor, safe to append to a prompt that specifies its own optics.
 *
 * Everything in `QUALITY_CLAUSE` that could contradict a body's camera block —
 * the focal length, the finish, the grade — is left out. What remains is the part
 * that has to be said either way, because it is what separates a photograph from
 * the rendered, retouched look these models drift towards unless told otherwise:
 * anatomy that behaves, surfaces that have texture, and light that obeys physics.
 *
 * Worded as things to render rather than things to avoid. The obvious phrasing —
 * "visible pores, no skin smoothing" — reads as a photography note to a human but
 * trips Workers AI's safety classifier, which scores the raw string and sees
 * repeated body-texture vocabulary; an ordinary Diwali portrait came back as
 * "8007: Input prompt contains NSFW content" because of it.
 */
const REALISM_FLOOR =
  'Render as authentic professional photography: correct human anatomy and hand structure, ' +
  'true-to-life Indian complexion with natural tonal variation, fabric that drapes under its own weight, ' +
  'physically accurate light and shadow, detailed environmental surfaces, natural dynamic range, ' +
  'and the subtle imperfections of a real exposure. Not a render, not an illustration, not retouched.';

const BASE_NEGATIVE =
  'text, watermark, logo, signature, readable signage, ' +
  'distorted face, altered facial proportions, artificial symmetry, ' +
  'distorted hands, extra fingers, missing fingers, malformed limbs, unnatural anatomy, ' +
  'plastic skin, waxy skin, doll skin, over-smoothed skin, beauty filter, ' +
  'cartoon, anime, 3D render, CGI, illustration, painting, ' +
  'excessive HDR, oversaturated colour, blown highlights, ' +
  'blurry, low resolution, duplicate people, western features';

interface PromptRow {
  slug: string;
  title: string;
  shortDescription: string;
  /**
   * The prompt itself — the 300-to-500-word body a reader copies.
   *
   * The cover exists to show what this produces, so this is the instruction to
   * send. It was previously ignored in favour of a summary rebuilt from the
   * columns below, which is why covers never resembled the prompt they
   * illustrated: the body names the pose, the wardrobe, the surfaces, the light
   * direction and the grade, and none of that survived being compressed into one
   * sentence of `shortDescription` plus five one-word fields.
   */
  promptText: string | null;
  negativePrompt: string | null;
  inputMode: string;
  style: string | null;
  gender: string | null;
  ageGroup: string | null;
  location: string | null;
  aspectRatio: string | null;
  cameraStyle: string | null;
  lighting: string | null;
  mood: string | null;
}

/** Paragraphs that only make sense when a photograph has actually been supplied. */
const IDENTITY_PARAGRAPH =
  /\b(uploaded|supplied|attached|reference)\s+(photo|photograph|image|picture)\b/i;

/**
 * Rewrites a photo-edit body for an engine that cannot accept a face.
 *
 * A photo-edit prompt opens by instructing the model to treat an upload as the
 * exact facial identity. With no upload that paragraph is not merely useless —
 * it is an instruction to copy something that is not there, and models respond
 * by inventing a face and then holding it rigid. Dropping it and stating the
 * subject plainly gives a cleaner result.
 */
function withoutIdentityBlock(body: string, subject: string): string {
  const kept = body
    .split(/\n\s*\n/)
    .filter((paragraph) => !IDENTITY_PARAGRAPH.test(paragraph))
    .join('\n\n')
    .trim();

  const scene = kept || body;
  return `Photograph of ${subject}.\n\n${scene}`;
}

/**
 * The instruction for a cover: the prompt's own body, near enough verbatim.
 *
 * A cover's entire job is to show a reader what the prompt produces, so the
 * honest instruction is the prompt. This used to compose a summary from the
 * structured columns instead — title, one sentence of description, and five
 * one-word fields — which is a different photograph by construction. The body
 * carries the pose, the hand positions, the named fabrics, the surfaces, the
 * light direction and the colour grade; the summary carried none of it.
 *
 * `QUALITY_CLAUSE` is deliberately *not* appended in that case. It specifies an
 * 85mm lens, and the bodies specify their own optics — "50mm equivalent at
 * f/2.2" in one, "35mm, f/2.8" in another. Two focal lengths in one instruction
 * is a contradiction the model resolves arbitrarily.
 *
 * Rows with no body yet still fall back to the column summary, so a
 * half-finished draft can still get a cover.
 */
export function buildCoverInstruction(prompt: PromptRow, withReference: boolean): string {
  const subject = subjectPhrase(prompt.gender, prompt.ageGroup, prompt.slug);
  const body = (prompt.promptText ?? '').trim();

  if (body.length >= 200) {
    const scene =
      withReference || !IDENTITY_PARAGRAPH.test(body)
        ? body
        : withoutIdentityBlock(body, subject);

    // Only the parts of the realism floor that cannot contradict the body: no
    // lens, no aperture, no grade.
    return [scene, REALISM_FLOOR, framingClause(prompt)].join('\n\n');
  }

  const lines: string[] = [];

  if (withReference && prompt.inputMode === 'photo-edit') {
    lines.push(
      `Use the supplied photograph as the exact facial identity. Preserve that adult face — bone structure, eye shape, nose, lips, jawline and natural asymmetry — without beautifying or reshaping it. Place the person in the scene described below.`,
    );
  } else {
    lines.push(`Photograph of ${subject}, looking directly into the camera.`);
  }

  lines.push(`${prompt.title}. ${sceneFromDescription(prompt.shortDescription)}`);

  const scene: string[] = [];
  if (prompt.location) scene.push(`Setting: ${prompt.location}.`);
  if (prompt.style) scene.push(`Style: ${prompt.style}.`);
  if (prompt.lighting) scene.push(`Lighting: ${prompt.lighting}.`);
  if (prompt.mood) scene.push(`Mood: ${prompt.mood}.`);
  if (prompt.cameraStyle) scene.push(`Camera: ${prompt.cameraStyle}.`);
  if (scene.length) lines.push(scene.join(' '));

  lines.push(QUALITY_CLAUSE);
  lines.push(framingClause(prompt));

  return lines.join('\n\n');
}

/**
 * Restated last because the tail of a prompt is weighted heavily, and the frame
 * shape is the one thing a cover cannot get wrong: the card that displays it is
 * a fixed portrait, so a square or landscape render is cropped on arrival.
 */
function framingClause(prompt: PromptRow): string {
  if (prompt.gender === 'non-human') {
    return `Clean frame, no people. Vertical ${prompt.aspectRatio ?? '4:5'} composition.`;
  }
  return `Single adult subject, clean frame, vertical ${prompt.aspectRatio ?? '4:5'} composition.`;
}

function buildNegative(prompt: PromptRow): string {
  // The prompt's own negatives come first — they are specific to the scene —
  // then the shared floor. Truncated because flux folds negatives into the
  // prompt and the combined text is capped.
  const own = (prompt.negativePrompt ?? '').split(/,\s*/).slice(0, 14).join(', ');
  return [own, BASE_NEGATIVE].filter(Boolean).join(', ').slice(0, 600);
}

/* ------------------------------ House models ------------------------------- */

/** Settings keys under which the generated house model URLs are stored. */
const HOUSE_MODEL_KEY_PREFIX = 'images.house_model.';

export type HouseModelKind = 'male' | 'female' | 'couple';

const HOUSE_MODEL_BRIEFS: Record<HouseModelKind, string> = {
  male:
    'Neutral studio headshot of a young adult Indian man against a plain mid-grey backdrop. ' +
    'Relaxed shoulders, head straight to camera, calm closed-mouth expression, direct eye contact. ' +
    'Plain black crew-neck t-shirt. Soft large softbox key light slightly above eye level with gentle fill. ' +
    'Completely ordinary, unremarkable features — not a model, not a celebrity, not anyone recognisable. ' +
    QUALITY_CLAUSE,
  female:
    'Neutral studio headshot of a young adult Indian woman against a plain mid-grey backdrop. ' +
    'Relaxed shoulders, head straight to camera, calm closed-mouth expression, direct eye contact. ' +
    'Plain black crew-neck top, hair tied back simply, no jewellery. Soft large softbox key light slightly above eye level with gentle fill. ' +
    'Completely ordinary, unremarkable features — not a model, not a celebrity, not anyone recognisable. ' +
    QUALITY_CLAUSE,
  couple:
    'Neutral studio portrait of a young adult Indian couple standing side by side against a plain mid-grey backdrop. ' +
    'Both faces straight to camera, calm closed-mouth expressions, direct eye contact, shoulders touching. ' +
    'Plain black tops. Soft large softbox key light slightly above eye level with gentle fill. ' +
    'Completely ordinary, unremarkable features — neither person a model, a celebrity, or anyone recognisable. ' +
    QUALITY_CLAUSE,
};

/** Maps a prompt's `gender` column onto the house model that suits it. */
function houseModelFor(gender: string | null): HouseModelKind | null {
  switch (gender) {
    case 'male':
      return 'male';
    case 'female':
      return 'female';
    case 'couple':
    case 'group':
      return 'couple';
    case 'non-human':
      return null;
    default:
      return 'female';
  }
}

export async function generateHouseModel(kind: HouseModelKind): Promise<{ url: string; engine: string }> {
  const engine = await resolveImageEngine();
  const image = await engine.generate({
    instruction: HOUSE_MODEL_BRIEFS[kind],
    negative: BASE_NEGATIVE,
    aspectRatio: '4:5',
  });

  const stored = await uploadImage({
    file: new File([new Uint8Array(image.bytes)], `house-model-${kind}.png`, {
      type: image.mimeType,
    }),
    folder: 'house-models',
  });

  await setSettings({ [`${HOUSE_MODEL_KEY_PREFIX}${kind}`]: stored.url });
  return { url: stored.url, engine: image.engine };
}

export async function listHouseModels(): Promise<Record<HouseModelKind, string | null>> {
  const settings = await getSettings();
  const read = (kind: HouseModelKind) => {
    const value = settings[`${HOUSE_MODEL_KEY_PREFIX}${kind}`];
    return typeof value === 'string' && value ? value : null;
  };
  return { male: read('male'), female: read('female'), couple: read('couple') };
}

/**
 * Loads a house model's bytes back out of R2 so they can be handed to the model.
 *
 * Read via the bucket binding rather than fetched over the public r2.dev URL:
 * one less network hop, and it keeps working if public access is ever turned off.
 */
async function loadReference(url: string): Promise<ReferenceImage | null> {
  const key = (() => {
    try {
      return new URL(url).pathname.replace(/^\/+/, '');
    } catch {
      return null;
    }
  })();
  if (!key) return null;

  const object = await useR2().get(key);
  if (!object) return null;
  const buffer = await object.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    mimeType: object.httpMetadata?.contentType ?? 'image/png',
  };
}

/* ---------------------------- Cover generation ----------------------------- */

export interface CoverResult {
  promptId: string;
  slug: string;
  url: string;
  engine: string;
  usedReference: boolean;
  instruction: string;
  /** Set when a fallback engine produced this cover. See `GeneratedImage`. */
  fallbackReason?: string;
}

/**
 * Generates a cover for one prompt and attaches it.
 *
 * Sequential by design — one prompt per call. Image generation takes tens of
 * seconds, so batching several into a single request would risk the Worker's
 * limits for no benefit; the admin client drives the loop and shows progress
 * instead, which also means a failure on prompt 20 does not lose the first 19.
 */
export async function generatePromptCover(
  promptId: string,
  options: { force?: boolean } = {},
): Promise<CoverResult> {
  const prompt = await getPromptById(promptId);
  if (!prompt) throw AppError.notFound('Prompt not found');
  if (prompt.coverImageUrl && !options.force) {
    throw AppError.badRequest('This prompt already has a cover. Pass force to replace it.');
  }
  if (REFUSED_AGE_GROUPS.has((prompt.ageGroup ?? '').trim().toLowerCase())) {
    throw AppError.badRequest(
      `Automatic cover generation is disabled for prompts aimed at children (this one is tagged "${prompt.ageGroup}"). Upload a cover for it by hand instead.`,
    );
  }

  const engine = await resolveImageEngine();

  // A reference face is only worth loading when the prompt is a photo-edit one
  // and the engine can actually use it.
  let reference: ReferenceImage | undefined;
  if (engine.supportsReference && prompt.inputMode === 'photo-edit') {
    const kind = houseModelFor(prompt.gender);
    if (kind) {
      const models = await listHouseModels();
      const url = models[kind];
      if (url) reference = (await loadReference(url)) ?? undefined;
    }
  }

  const instruction = buildCoverInstruction(prompt, Boolean(reference));
  const image = await engine.generate({
    instruction,
    negative: buildNegative(prompt),
    reference,
    aspectRatio: prompt.aspectRatio ?? '4:5',
  });

  const stored = await uploadImage({
    file: new File([new Uint8Array(image.bytes)], `${prompt.slug}.png`, { type: image.mimeType }),
    folder: 'prompts',
  });

  await db
    .update(prompts)
    .set({
      coverImageUrl: stored.url,
      coverImageAlt: `AI generated example output for ${prompt.title}`,
      updatedAt: nowSec(),
    })
    .where(eq(prompts.id, prompt.id));

  return {
    promptId: prompt.id,
    slug: prompt.slug,
    url: stored.url,
    engine: image.engine,
    usedReference: image.usedReference,
    instruction,
    ...(image.fallbackReason ? { fallbackReason: image.fallbackReason } : {}),
  };
}

/**
 * Published prompts with no cover yet — the worklist for the admin batch runner.
 *
 * Returned oldest-first so a partial run leaves the newest prompts uncovered,
 * which is the order an operator would pick by hand anyway.
 */
export async function promptsMissingCovers(): Promise<
  { id: string; slug: string; title: string; inputMode: string }[]
> {
  return db
    .select({
      id: prompts.id,
      slug: prompts.slug,
      title: prompts.title,
      inputMode: prompts.inputMode,
    })
    .from(prompts)
    .where(and(eq(prompts.isPublished, true), isNull(prompts.coverImageUrl)))
    .orderBy(prompts.createdAt);
}
