import type { GeneratorInput } from '@pd/shared';

import { config } from '../../lib/env';
import { templateEngine } from './template-engine';
import type { GeneratedResult, GeneratorEngine } from './types';

/**
 * Remote AI engine (optional). The API key is read from the Worker secret and
 * never leaves the server. Any failure falls back to the template engine, so
 * the generator always returns a usable prompt.
 */

const SYSTEM = `You are a senior prompt engineer for AI image generation, specialised in Indian visual contexts.
Given a structured brief, write ONE production-ready image prompt.
Respond with strict JSON only: {"title": string, "prompt": string, "negativePrompt": string, "tips": string[]}.
Match the target model's conventions. Be culturally specific and respectful. Never sexualise subjects or reference real named individuals.
Keep the prompt under 220 words and "tips" to at most 3 short items.`;

function brief(input: GeneratorInput): string {
  const fields: [string, string | undefined][] = [
    ['Target model', input.aiModel],
    ['Image type', input.imageType],
    ['Subject', input.subject],
    ['Gender / group', input.gender],
    ['Style', input.style],
    ['Location', input.location],
    ['Outfit', input.outfit],
    ['Pose', input.pose],
    ['Expression', input.expression],
    ['Lighting', input.lighting],
    ['Camera', input.camera],
    ['Background', input.background],
    ['Mood', input.mood],
    ['Colour tone', input.colorTone],
    ['Aspect ratio', input.aspectRatio],
    ['Quality', input.quality],
    ['Additional instructions', input.additionalInstructions],
  ];
  return fields.filter(([, v]) => v && v.trim()).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function parse(raw: string): { title?: string; prompt?: string; negativePrompt?: string; tips?: string[] } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

class GeminiEngine implements GeneratorEngine {
  readonly name = 'gemini';
  async generate(input: GeneratorInput): Promise<GeneratedResult> {
    const c = config();
    const base = 'https://generativelanguage.googleapis.com/v1beta';
    const model = 'gemini-2.0-flash';
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': c.aiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: brief(input) }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 900, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const parsed = parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    if (!parsed?.prompt) throw new Error('Gemini returned an unusable payload');
    return {
      prompt: parsed.prompt.trim(),
      negativePrompt: (parsed.negativePrompt ?? '').trim(),
      title: (parsed.title ?? 'AI generated prompt').trim().slice(0, 160),
      engine: this.name,
      tips: (parsed.tips ?? []).slice(0, 3),
    };
  }
}

class ResilientEngine implements GeneratorEngine {
  readonly name: string;
  constructor(private readonly primary: GeneratorEngine) {
    this.name = primary.name;
  }
  async generate(input: GeneratorInput): Promise<GeneratedResult> {
    try {
      return await this.primary.generate(input);
    } catch (error) {
      console.warn(`[generator] ${this.primary.name} failed, using template engine:`, error);
      const result = await templateEngine.generate(input);
      return { ...result, engine: `${this.primary.name}-fallback:template` };
    }
  }
}

export function resolveEngine(): GeneratorEngine {
  const c = config();
  if (c.aiProvider === 'gemini' && c.aiApiKey) return new ResilientEngine(new GeminiEngine());
  return templateEngine;
}

export function aiConfigured(): boolean {
  const c = config();
  return c.aiProvider !== 'template' && Boolean(c.aiApiKey);
}
