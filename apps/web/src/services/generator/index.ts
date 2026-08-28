import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';
import type { AccessContext, UsageStatus } from '@/lib/access';
import type { GeneratorInput } from '@/lib/validation';

/**
 * Prompt generator, served by the API.
 *
 * The quota and the premium gate on advanced options are enforced server-side,
 * so a crafted client payload cannot buy extra runs or unlock paid controls.
 */

export interface GeneratedResult {
  prompt: string;
  negativePrompt: string;
  title: string;
  engine: string;
  tips: string[];
}

export interface GenerateOutcome extends GeneratedResult {
  id: string;
  usage: UsageStatus;
  aiModel: string;
}

export type { GeneratorInput };

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

export async function generatePrompt(input: {
  access: AccessContext;
  visitorHash: string | null;
  form: GeneratorInput;
  mode?: 'advanced' | 'random';
}): Promise<GenerateOutcome> {
  return apiRequest<GenerateOutcome>('/v1/generator', {
    method: 'POST',
    token: await getAccessToken(),
    body: input.form,
  });
}

export interface RandomSeed extends GeneratorInput {
  imageType: string;
}

export async function generateRandom(input: {
  access: AccessContext;
  visitorHash: string | null;
  aiModel?: string;
}): Promise<GenerateOutcome & { brief: RandomSeed }> {
  return apiRequest<GenerateOutcome & { brief: RandomSeed }>('/v1/generator/random', {
    method: 'POST',
    token: await getAccessToken(),
    body: { aiModel: input.aiModel },
  });
}

/* ------------------------------- Saved runs -------------------------------- */

export interface GeneratedRow {
  id: string;
  title: string | null;
  output: string;
  negativeOutput: string | null;
  aiModel: string;
  mode: string;
  engine: string;
  isSaved: boolean;
  createdAt: number;
}

export interface GeneratorStats {
  total: number;
  saved: number;
  today: number;
  lastRunAt: number | null;
}

interface GeneratedResponse {
  items: GeneratedRow[];
  stats: GeneratorStats;
}

async function load(options: { savedOnly?: boolean; limit?: number }): Promise<GeneratedResponse> {
  return apiRequest<GeneratedResponse>(
    `/v1/generator${query({ saved: options.savedOnly ? 1 : undefined, limit: options.limit })}`,
    { token: await token() },
  );
}

export async function listGenerated(
  _userId: string,
  options: { savedOnly?: boolean; limit?: number } = {},
): Promise<GeneratedRow[]> {
  return (await load(options)).items;
}

export async function generatorStats(_userId: string): Promise<GeneratorStats> {
  return (await load({ limit: 1 })).stats;
}

export async function saveGenerated(
  _userId: string,
  generatedId: string,
  title?: string,
): Promise<void> {
  await apiRequest('/v1/generator/save', {
    method: 'POST',
    token: await token(),
    body: { generatedId, title },
  });
}

export async function unsaveGenerated(_userId: string, generatedId: string): Promise<void> {
  await apiRequest('/v1/generator/unsave', {
    method: 'POST',
    token: await token(),
    body: { generatedId },
  });
}

export async function deleteGenerated(_userId: string, generatedId: string): Promise<void> {
  await apiRequest(`/v1/generator/${encodeURIComponent(generatedId)}`, {
    method: 'DELETE',
    token: await token(),
  });
}
