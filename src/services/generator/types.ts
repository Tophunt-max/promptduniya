import type { GeneratorInput } from '@/lib/validation';

export interface GeneratedResult {
  /** The finished prompt, ready to paste into the target model. */
  prompt: string;
  /** Suggested negative prompt (empty for models that ignore it). */
  negativePrompt: string;
  /** Short human title for saving/sharing. */
  title: string;
  /** Which engine produced this: template, gemini, openai … */
  engine: string;
  /** Extra tips shown beneath the result panel. */
  tips: string[];
}

/**
 * Adapter contract for prompt generation. The template engine implements this
 * with zero external dependencies so the feature always works; remote AI
 * providers implement the same interface and are selected by configuration.
 */
export interface GeneratorEngine {
  readonly name: string;
  generate(input: GeneratorInput): Promise<GeneratedResult>;
}

export type { GeneratorInput };
