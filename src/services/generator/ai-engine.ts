import { aiConfigured, env } from '@/lib/env';
import { templateEngine } from './template-engine';
import type { GeneratedResult, GeneratorEngine, GeneratorInput } from './types';

/**
 * Remote AI engine.
 *
 * The API key is read from the server environment only and never leaves the
 * server. If the upstream call fails for any reason we fall back to the
 * template engine so the user always gets a usable prompt.
 */

const SYSTEM_INSTRUCTION = `You are a senior prompt engineer for AI image generation, specialised in South Asian / Indian visual contexts.
Given a structured brief, write ONE production-ready image prompt.

Rules:
- Respond with strict JSON only: {"title": string, "prompt": string, "negativePrompt": string, "tips": string[]}
- Match the target model's conventions: Midjourney uses comma clauses plus trailing --ar flags; Stable Diffusion/Flux use weighted keyword stacks; Gemini/ChatGPT prefer natural language paragraphs.
- Be culturally specific and respectful. Never sexualise subjects. Never reference real named individuals or brands.
- Keep the prompt under 220 words. Keep "tips" to at most 3 short, practical items.`;

function briefFrom(input: GeneratorInput): string {
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

  return fields
    .filter(([, value]) => value && value.trim().length > 0)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

interface ParsedPayload {
  title?: string;
  prompt?: string;
  negativePrompt?: string;
  tips?: string[];
}

function parsePayload(raw: string): ParsedPayload | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as ParsedPayload;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ParsedPayload;
    } catch {
      return null;
    }
  }
}

class GeminiEngine implements GeneratorEngine {
  readonly name = 'gemini';

  async generate(input: GeneratorInput): Promise<GeneratedResult> {
    const e = env();
    const base = e.AI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    const model = e.AI_MODEL || 'gemini-2.0-flash';

    const response = await fetch(
      `${base}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': e.AI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: briefFrom(input) }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 900, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini responded ${response.status}`);
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parsePayload(text);
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

class OpenAiEngine implements GeneratorEngine {
  readonly name = 'openai';

  async generate(input: GeneratorInput): Promise<GeneratedResult> {
    const e = env();
    const base = e.AI_API_BASE_URL || 'https://api.openai.com/v1';

    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${e.AI_API_KEY!}`,
      },
      body: JSON.stringify({
        model: e.AI_MODEL || 'gpt-4o-mini',
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: briefFrom(input) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) throw new Error(`OpenAI responded ${response.status}`);

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const parsed = parsePayload(body.choices?.[0]?.message?.content ?? '');
    if (!parsed?.prompt) throw new Error('OpenAI returned an unusable payload');

    return {
      prompt: parsed.prompt.trim(),
      negativePrompt: (parsed.negativePrompt ?? '').trim(),
      title: (parsed.title ?? 'AI generated prompt').trim().slice(0, 160),
      engine: this.name,
      tips: (parsed.tips ?? []).slice(0, 3),
    };
  }
}

/** Wraps a remote engine with a template-engine safety net. */
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

/** Returns the configured engine, or the template engine when no AI is set up. */
export function resolveEngine(): GeneratorEngine {
  if (!aiConfigured()) return templateEngine;
  const provider = env().AI_PROVIDER;
  if (provider === 'gemini') return new ResilientEngine(new GeminiEngine());
  if (provider === 'openai') return new ResilientEngine(new OpenAiEngine());
  return templateEngine;
}

export function engineName(): string {
  return resolveEngine().name;
}
