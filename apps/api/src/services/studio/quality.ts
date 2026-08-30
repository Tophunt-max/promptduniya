import type { DraftedPrompt } from './blueprint';

/**
 * Quality scoring for a generated prompt.
 *
 * The pipeline can run unattended, which means something has to hold the line
 * that a human editor used to hold. `blueprint.ts` already refuses a prompt body
 * under 120 characters, but that only catches the model returning nothing. It
 * does not catch the far more common failure: a reply that is well-formed,
 * parses cleanly, and is still not worth publishing — three sentences of generic
 * "beautiful cinematic portrait, high quality, 8k" with no place, no fabric and
 * no light in it.
 *
 * So this scores the draft against the house style the system instruction asks
 * for, and the runner refuses to auto-publish below a configurable threshold.
 *
 * Design notes:
 *
 * - Deterministic and dependency-free. Using a language model to grade another
 *   language model would double the cost and the latency of every item, and
 *   would fail in exactly the situations where grading matters most (a quota
 *   exhausted mid-run). Every check here is a string operation.
 * - Weighted checks, not a pass/fail gate. A prompt missing a camera note is
 *   worth publishing; a prompt missing a subject is not. Returning a score plus
 *   a per-check breakdown lets the operator see *why* something was held, which
 *   a single boolean never could.
 * - `blocking` checks zero the score outright. These are the cases where
 *   publishing would be actively wrong — no prompt body, banned content, a
 *   photo-edit prompt that forgot to mention the uploaded photo.
 *
 * Scores are advisory for a human and authoritative for the machine, which is
 * why the report is stored on the queue row alongside the number.
 */

export interface QualityCheck {
  id: string;
  label: string;
  /** Contribution to the score when it passes. Ignored for blocking checks. */
  weight: number;
  passed: boolean;
  /** Shown in the admin console when the check fails. */
  detail?: string;
  /** A failure here forces a score of 0 regardless of everything else. */
  blocking?: boolean;
}

export interface QualityReport {
  /** 0-100. */
  score: number;
  checks: QualityCheck[];
  /** Labels of the failed checks, for a one-line summary. */
  failed: string[];
  /** True when a blocking check failed — never publish these. */
  blocked: boolean;
  /** Human-readable summary, safe to show in a table cell. */
  summary: string;
}

export interface QualityInput {
  draft: DraftedPrompt;
  inputMode: string;
  /** Set once the cover exists, so the image check can be scored honestly. */
  hasCover?: boolean;
  /** When false, the missing-cover check is skipped rather than failed. */
  coverRequired?: boolean;
}

/**
 * Filler that models reach for when they have nothing specific to say.
 *
 * Not banned — "cinematic" is a legitimate word and appears in the style enum.
 * But a prompt whose *only* descriptive content is words from this list has
 * described nothing, so density is measured rather than presence.
 */
const FILLER_TERMS = [
  'high quality',
  'best quality',
  'masterpiece',
  'ultra realistic',
  'very detailed',
  'highly detailed',
  '8k',
  '4k',
  'hdr',
  'award winning',
  'trending on artstation',
  'stunning',
  'beautiful',
  'amazing',
  'perfect',
];

/**
 * Syntax the house style forbids.
 *
 * The catalogue's prompts are prose, because they are meant to be pasted into
 * Gemini and ChatGPT as much as into Midjourney. Weight syntax and CLI flags
 * either do nothing or actively confuse those models, so a draft containing them
 * has ignored the instruction and needs a human look.
 */
const FORBIDDEN_SYNTAX: { pattern: RegExp; label: string }[] = [
  { pattern: /\([^)]{1,60}:\s*\d+(\.\d+)?\s*\)/, label: 'weight syntax like (term:1.2)' },
  { pattern: /--(ar|v|q|style|no|seed|chaos)\b/i, label: 'CLI flags like --ar' },
  { pattern: /\bstep(s)?\s*:\s*\d+/i, label: 'sampler settings' },
];

/**
 * Content that must never reach the public catalogue.
 *
 * The system instruction already forbids minors and named people, but an
 * instruction is a request and this is a gate. Deliberately narrow and literal:
 * a broad regex here would reject legitimate prompts about, say, a family
 * gathering, and an over-eager filter that operators learn to override is worse
 * than none.
 */
const BLOCKED_TERMS = [
  'child',
  'children',
  'kid',
  'kids',
  'toddler',
  'baby',
  'infant',
  'teen',
  'teenage',
  'teenager',
  'schoolgirl',
  'schoolboy',
  'minor',
  'underage',
  'nude',
  'naked',
  'nsfw',
  'explicit',
  'topless',
  'lingerie',
];

/** Vocabulary that indicates the prompt actually describes a photograph. */
const CRAFT_TERMS = {
  light: [
    'light',
    'lighting',
    'lit',
    'sunlight',
    'daylight',
    'golden hour',
    'backlit',
    'rim light',
    'shadow',
    'diffused',
    'overcast',
    'kelvin',
    'flame',
    'lamp',
    'neon',
    'glow',
  ],
  camera: [
    'mm',
    'lens',
    'f/',
    'aperture',
    'depth of field',
    'bokeh',
    'close-up',
    'wide shot',
    'portrait',
    'telephoto',
    'macro',
    'angle',
    'framing',
    'composition',
  ],
  wardrobe: [
    'saree',
    'sari',
    'lehenga',
    'kurta',
    'sherwani',
    'dupatta',
    'silk',
    'cotton',
    'linen',
    'chiffon',
    'georgette',
    'banarasi',
    'chikankari',
    'velvet',
    'wool',
    'denim',
    'embroider',
    'jewellery',
    'jewelry',
    'fabric',
    'wearing',
    'dressed',
  ],
  environment: [
    'background',
    'behind',
    'street',
    'room',
    'wall',
    'floor',
    'field',
    'temple',
    'ghat',
    'market',
    'terrace',
    'balcony',
    'courtyard',
    'garden',
    'studio',
    'beach',
    'mountain',
    'city',
    'village',
    'indoors',
    'outdoors',
  ],
} as const;

function countMatches(haystack: string, needles: readonly string[]): number {
  return needles.reduce((total, needle) => (haystack.includes(needle) ? total + 1 : total), 0);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Whether the text mentions a concrete adult age.
 *
 * The house style asks for "a 31-year-old Indian woman" rather than "a woman",
 * both because it produces a more consistent image and because it is the
 * clearest possible signal that the subject is an adult.
 */
function hasExplicitAdultAge(text: string): boolean {
  const matches = text.matchAll(/\b(\d{1,2})[\s-]*(?:year|yr)[\s-]*old\b/gi);
  for (const match of matches) {
    const age = Number(match[1]);
    if (Number.isFinite(age) && age >= 21 && age <= 90) return true;
  }
  return false;
}

export function scorePrompt(input: QualityInput): QualityReport {
  const { draft } = input;
  const body = draft.promptText ?? '';
  const lower = body.toLowerCase();
  const words = wordCount(body);
  const coverRequired = input.coverRequired ?? true;

  const checks: QualityCheck[] = [];

  /* ------------------------------- Blocking ------------------------------- */

  checks.push({
    id: 'body-present',
    label: 'Prompt body present',
    weight: 0,
    blocking: true,
    passed: body.trim().length >= 120,
    detail: `Body is ${body.trim().length} characters; at least 120 are required.`,
  });

  const blockedHit = BLOCKED_TERMS.find((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower),
  );
  checks.push({
    id: 'safe-content',
    label: 'No unsafe or age-ambiguous content',
    weight: 0,
    blocking: true,
    passed: !blockedHit,
    detail: blockedHit ? `Contains the disallowed term "${blockedHit}".` : undefined,
  });

  checks.push({
    id: 'title-present',
    label: 'Title present',
    weight: 0,
    blocking: true,
    passed: draft.title.trim().length >= 5,
    detail: 'A title of at least 5 characters is required.',
  });

  // A photo-edit prompt that never mentions the uploaded photo is the wrong
  // prompt: the reader would get a stranger's face back. Worth blocking rather
  // than just deducting, because the post would be actively misleading.
  if (input.inputMode === 'photo-edit') {
    const referencesUpload = /(uploaded|attached|reference|provided|this) (photo|photograph|image|picture|face|selfie)|preserve[^.]{0,40}(face|identity|features)|facial identity/i.test(
      body,
    );
    checks.push({
      id: 'photo-edit-identity',
      label: 'Photo-edit prompt anchors the uploaded face',
      weight: 0,
      blocking: true,
      passed: referencesUpload,
      detail:
        'A photo-edit prompt must tell the model to treat the uploaded photograph as the exact facial identity.',
    });
  } else {
    // And the reverse: a text-to-image prompt telling the reader to upload a
    // photo they were never asked for is equally broken.
    checks.push({
      id: 'text-to-image-standalone',
      label: 'Text-to-image prompt does not ask for an upload',
      weight: 6,
      passed: !/\bupload(ed|ing)?\b/i.test(body),
      detail: 'Mentions uploading a photo, but this prompt is not a photo-edit prompt.',
    });
  }

  /* -------------------------------- Weighted ------------------------------- */

  checks.push({
    id: 'length',
    label: 'Body length in range (180-460 words)',
    weight: 14,
    passed: words >= 180 && words <= 460,
    detail: `Body is ${words} words.`,
  });

  checks.push({
    id: 'adult-age',
    label: 'States an explicit adult age',
    weight: 10,
    passed: hasExplicitAdultAge(body),
    detail: 'No explicit adult age such as "a 31-year-old" was found.',
  });

  checks.push({
    id: 'prose',
    label: 'Written as prose, not parameter syntax',
    weight: 12,
    passed: !FORBIDDEN_SYNTAX.some(({ pattern }) => pattern.test(body)),
    detail: (() => {
      const hit = FORBIDDEN_SYNTAX.find(({ pattern }) => pattern.test(body));
      return hit ? `Contains ${hit.label}.` : undefined;
    })(),
  });

  // Filler density rather than filler presence. Six stock phrases in a
  // 400-word prompt is stylistic; six in an 80-word prompt is the whole prompt.
  const fillerHits = countMatches(lower, FILLER_TERMS);
  const fillerDensity = words > 0 ? fillerHits / (words / 100) : 99;
  checks.push({
    id: 'filler',
    label: 'Low filler density',
    weight: 8,
    passed: fillerDensity <= 2.5,
    detail: `${fillerHits} stock phrases across ${words} words.`,
  });

  checks.push({
    id: 'lighting',
    label: 'Describes lighting',
    weight: 9,
    passed: countMatches(lower, CRAFT_TERMS.light) >= 1,
    detail: 'No lighting description found.',
  });

  checks.push({
    id: 'camera',
    label: 'Describes camera or framing',
    weight: 8,
    passed: countMatches(lower, CRAFT_TERMS.camera) >= 1,
    detail: 'No camera, lens or framing description found.',
  });

  checks.push({
    id: 'wardrobe',
    label: 'Describes wardrobe or materials',
    weight: 7,
    passed: countMatches(lower, CRAFT_TERMS.wardrobe) >= 1,
    detail: 'No wardrobe or fabric description found.',
  });

  checks.push({
    id: 'environment',
    label: 'Describes the environment',
    weight: 7,
    passed: countMatches(lower, CRAFT_TERMS.environment) >= 1,
    detail: 'No environment or background description found.',
  });

  /* ------------------------------- Metadata ------------------------------- */

  checks.push({
    id: 'description',
    label: 'Short description usable',
    weight: 5,
    passed: wordCount(draft.shortDescription) >= 8,
    detail: 'The short description is too short to use as a listing subtitle.',
  });

  checks.push({
    id: 'tags',
    label: 'At least three tags',
    weight: 5,
    passed: draft.tags.length >= 3,
    detail: `Only ${draft.tags.length} tag(s) were produced.`,
  });

  checks.push({
    id: 'seo',
    label: 'SEO title and description present',
    weight: 6,
    passed:
      draft.seoTitle.trim().length >= 10 &&
      draft.seoDescription.trim().length >= 40 &&
      draft.seoTitle.length <= 70,
    detail: 'SEO title must be 10-70 characters and the meta description at least 40.',
  });

  checks.push({
    id: 'negative',
    label: 'Negative prompt present',
    weight: 3,
    passed: draft.negativePrompt.trim().length >= 10,
    detail: 'No negative prompt was produced.',
  });

  checks.push({
    id: 'usage',
    label: 'Usage instructions present',
    weight: 3,
    passed: draft.usageInstructions.trim().length >= 30,
    detail: 'No usage guidance was produced.',
  });

  checks.push({
    id: 'location',
    label: 'Names a specific location',
    weight: 4,
    passed: draft.location.trim().length >= 4,
    detail: 'No specific location was set.',
  });

  // Only scored when a cover was actually attempted. Skipping the image step is
  // a legitimate operator choice (an exhausted image quota), and penalising it
  // would push every item in that run below the threshold for no good reason.
  if (coverRequired) {
    checks.push({
      id: 'cover',
      label: 'Example image generated',
      weight: 10,
      passed: Boolean(input.hasCover),
      detail: 'No example image is attached to this prompt.',
    });
  }

  /* -------------------------------- Scoring ------------------------------- */

  const blocked = checks.some((check) => check.blocking && !check.passed);
  const weighted = checks.filter((check) => !check.blocking);
  const totalWeight = weighted.reduce((sum, check) => sum + check.weight, 0);
  const earned = weighted.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);

  const score = blocked
    ? 0
    : totalWeight === 0
      ? 0
      : Math.round((earned / totalWeight) * 100);

  const failed = checks.filter((check) => !check.passed).map((check) => check.label);

  const summary = blocked
    ? `Blocked: ${
        checks.find((check) => check.blocking && !check.passed)?.label ?? 'failed a required check'
      }`
    : failed.length === 0
      ? 'Passed every check'
      : `${score}/100 — ${failed.length} check(s) failed`;

  return { score, checks, failed, blocked, summary };
}
