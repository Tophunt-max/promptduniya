import {
  BACKGROUNDS,
  CAMERA_STYLES,
  COLOR_TONES,
  EXPRESSIONS,
  LIGHTING,
  LOCATIONS,
  MOODS,
  OUTFITS,
  POSES,
  STYLES,
} from '@pd/shared';
import { pick, titleCase, truncate } from '@pd/shared';
import type { GeneratedResult, GeneratorEngine, GeneratorInput } from './types';

/**
 * Deterministic, dependency-free prompt composer.
 *
 * This is the fallback that keeps `/generator` fully functional without any
 * paid AI API. It is a real composition engine, not a stub: model-specific
 * grammar, sensible defaults for missing fields, and a matching negative prompt.
 */

const DEFAULT_SUBJECTS: Record<string, string> = {
  Portrait: 'a young Indian woman',
  Couple: 'an Indian couple in their late twenties',
  Fashion: 'an Indian fashion model',
  Product: 'a handcrafted brass water bottle',
  Travel: 'a solo traveller with a canvas backpack',
  Cinematic: 'a lone figure in a rain-soaked street',
  Festival: 'a family celebrating together',
  Wedding: 'a bride in bridal jewellery',
  'Social Media': 'a content creator holding a phone',
  Other: 'a person',
};

function fallback<T extends string>(value: string | undefined, pool: readonly T[]): string {
  return value && value.trim().length > 0 ? value.trim() : pick(pool);
}

function subjectPhrase(input: GeneratorInput): string {
  if (input.subject && input.subject.trim().length > 0) return input.subject.trim();
  const base = DEFAULT_SUBJECTS[input.imageType ?? 'Other'] ?? DEFAULT_SUBJECTS.Other!;

  switch (input.gender) {
    case 'male':
      return base.replace('woman', 'man').replace('bride', 'groom');
    case 'couple':
      return 'an Indian couple';
    case 'group':
      return 'a group of friends';
    case 'non-human':
      return 'the product';
    default:
      return base;
  }
}

function qualityClause(quality?: string): string {
  switch (quality) {
    case 'ultra':
      return 'ultra-detailed, 8K resolution, true-to-life skin texture, razor-sharp focus on the eyes';
    case 'high':
      return 'high detail, crisp focus, natural skin texture';
    default:
      return 'clean detail, natural finish';
  }
}

function baseSentences(input: GeneratorInput) {
  const subject = subjectPhrase(input);
  const style = fallback(input.style, STYLES);
  const location = fallback(input.location, LOCATIONS);
  const outfit = fallback(input.outfit, OUTFITS);
  const pose = fallback(input.pose, POSES);
  const expression = fallback(input.expression, EXPRESSIONS);
  const lighting = fallback(input.lighting, LIGHTING);
  const camera = fallback(input.camera, CAMERA_STYLES);
  const background = fallback(input.background, BACKGROUNDS);
  const mood = fallback(input.mood, MOODS);
  const colorTone = fallback(input.colorTone, COLOR_TONES);

  return { subject, style, location, outfit, pose, expression, lighting, camera, background, mood, colorTone };
}

/** Midjourney-style: comma-separated clauses plus trailing parameter flags. */
function composeMidjourney(input: GeneratorInput): string {
  const p = baseSentences(input);
  const clauses = [
    `${p.style} photograph of ${p.subject}`,
    `wearing ${p.outfit.toLowerCase()}`,
    p.pose.toLowerCase(),
    `${p.expression.toLowerCase()} expression`,
    `at ${p.location}`,
    p.background.toLowerCase(),
    p.lighting.toLowerCase(),
    p.camera,
    `${p.colorTone.toLowerCase()} colour grade`,
    `${p.mood.toLowerCase()} mood`,
    qualityClause(input.quality),
  ];

  if (input.additionalInstructions) clauses.push(input.additionalInstructions.trim());

  const flags = [`--ar ${input.aspectRatio ?? '4:5'}`, '--style raw'];
  if (input.quality === 'ultra') flags.push('--q 2');

  return `${clauses.join(', ')} ${flags.join(' ')}`;
}

/** Stable Diffusion / Flux style: weighted keyword stack. */
function composeKeywordStack(input: GeneratorInput): string {
  const p = baseSentences(input);
  const clauses = [
    `(${p.style.toLowerCase()}:1.2)`,
    `${p.subject}`,
    `wearing ${p.outfit.toLowerCase()}`,
    p.pose.toLowerCase(),
    `${p.expression.toLowerCase()} expression`,
    `${p.location}`,
    p.background.toLowerCase(),
    `(${p.lighting.toLowerCase()}:1.1)`,
    p.camera,
    p.colorTone.toLowerCase(),
    `${p.mood.toLowerCase()} atmosphere`,
    qualityClause(input.quality),
  ];

  if (input.aspectRatio) clauses.push(`aspect ratio ${input.aspectRatio}`);
  if (input.additionalInstructions) clauses.push(input.additionalInstructions.trim());

  return clauses.join(', ');
}

/** Gemini / ChatGPT style: natural-language, structured paragraph. */
function composeNarrative(input: GeneratorInput): string {
  const p = baseSentences(input);

  const paragraphs = [
    `Create a ${p.style.toLowerCase()} image of ${p.subject}, ${p.pose.toLowerCase()}, with a ${p.expression.toLowerCase()} expression.`,
    `Wardrobe: ${p.outfit}. Setting: ${p.location}, with ${p.background.toLowerCase()}.`,
    `Lighting: ${p.lighting}. Camera: ${p.camera}. Colour: ${p.colorTone.toLowerCase()}, carrying a ${p.mood.toLowerCase()} mood.`,
    `Technical: ${input.aspectRatio ?? '4:5'} aspect ratio, ${qualityClause(input.quality)}. Keep anatomy correct, hands fully visible and clothing folds natural.`,
  ];

  if (input.additionalInstructions) {
    paragraphs.push(`Additional direction: ${input.additionalInstructions.trim()}`);
  }

  return paragraphs.join('\n\n');
}

function negativeFor(input: GeneratorInput): string {
  const shared = [
    'extra fingers',
    'deformed hands',
    'distorted face',
    'asymmetric eyes',
    'blurry',
    'low resolution',
    'jpeg artifacts',
    'watermark',
    'text overlay',
    'logo',
    'oversaturated skin',
    'plastic skin',
    'duplicate limbs',
    'cropped head',
    'harsh flash',
  ];

  if (input.imageType === 'Product') {
    shared.push('fingerprints on product', 'dusty surface', 'wrong reflections', 'floating object');
  }
  if (input.gender === 'couple' || input.gender === 'group') {
    shared.push('merged bodies', 'inconsistent faces', 'mismatched lighting between subjects');
  }

  // Midjourney has no dedicated negative field; it uses --no instead.
  if (input.aiModel === 'midjourney') return `--no ${shared.slice(0, 8).join(', ')}`;
  return shared.join(', ');
}

function tipsFor(input: GeneratorInput): string[] {
  const tips = [
    'Generate three variations and keep the frame with the most natural hands and eyes.',
    'Swap only one variable at a time (outfit, light or location) so you can tell what changed.',
  ];

  switch (input.aiModel) {
    case 'midjourney':
      tips.push('Use `--seed` to lock a look you like, then vary the wardrobe.');
      break;
    case 'gemini':
      tips.push('Follow up in the same chat with "keep the same face, change the outfit" for a series.');
      break;
    case 'stable-diffusion':
    case 'flux':
      tips.push('Paste the negative prompt into the dedicated negative field, not the main prompt.');
      break;
    case 'chatgpt':
      tips.push('Ask for a second pass with "increase contrast and deepen the shadows" if it looks flat.');
      break;
    default:
      tips.push('If the model ignores a detail, move that detail to the front of the prompt.');
  }

  if (!input.subject) {
    tips.push('Add your own subject description for a much more specific result.');
  }

  return tips;
}

function titleFor(input: GeneratorInput): string {
  const p = baseSentences(input);
  const parts = [p.style, input.imageType ?? 'Prompt', '·', truncate(p.location, 28)];
  return titleCase(parts.join(' ')).replace(' · ', ' · ');
}

export class TemplateEngine implements GeneratorEngine {
  readonly name = 'template';

  async generate(input: GeneratorInput): Promise<GeneratedResult> {
    let prompt: string;

    switch (input.aiModel) {
      case 'midjourney':
        prompt = composeMidjourney(input);
        break;
      case 'stable-diffusion':
      case 'flux':
      case 'leonardo':
        prompt = composeKeywordStack(input);
        break;
      default:
        prompt = composeNarrative(input);
    }

    return {
      prompt,
      negativePrompt: negativeFor(input),
      title: titleFor(input),
      engine: this.name,
      tips: tipsFor(input),
    };
  }
}

export const templateEngine = new TemplateEngine();
