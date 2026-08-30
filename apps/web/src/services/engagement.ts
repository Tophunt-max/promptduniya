import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';
import type { AccessContext, UsageStatus } from '@/lib/access';

/**
 * Likes, favourites and prompt copying.
 *
 * Prompt bodies are only ever released by the API's copy endpoint, which
 * enforces the premium entitlement and the daily quota before returning
 * anything — which is why listings never carry a body.
 */

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/* --------------------------------- Likes ---------------------------------- */

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

export async function toggleLike(_userId: string, promptId: string): Promise<LikeResult> {
  return apiRequest<LikeResult>('/v1/prompts/like', {
    method: 'POST',
    token: await token(),
    body: { promptId },
  });
}

export interface LikedPromptRow {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  aiModel: string;
  inputMode: string;
  categoryName: string;
  categorySlug: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  isPremium: boolean;
  likeCount: number;
  copyCount: number;
  viewCount: number;
  likedAt: number;
}

export async function listLikedPrompts(
  _userId: string,
  limit = 60,
): Promise<LikedPromptRow[]> {
  const data = await apiRequest<{ items: LikedPromptRow[] }>(
    `/v1/viewer/likes${query({ limit })}`,
    { token: await token() },
  );
  return data.items;
}

/* ------------------------------- Favourites ------------------------------- */

export interface FavoriteResult {
  saved: boolean;
  favoriteCount: number;
  usage: UsageStatus;
}

export async function toggleFavorite(
  _access: AccessContext,
  promptId: string,
  meta: { collectionName?: string; note?: string } = {},
): Promise<FavoriteResult> {
  return apiRequest<FavoriteResult>('/v1/prompts/favorite', {
    method: 'POST',
    token: await token(),
    body: { promptId, ...meta },
  });
}

export type FavoriteSort = 'recent' | 'oldest' | 'title' | 'most-copied';

export interface FavoriteRow {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  aiModel: string;
  inputMode: string;
  categoryName: string;
  categorySlug: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  isPremium: boolean;
  isTrending: boolean;
  difficulty: string;
  style: string | null;
  aspectRatio: string | null;
  gender: string | null;
  isFeatured: boolean;
  isEditorsPick: boolean;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  favoriteCount: number;
  publishedAt: number | null;
  createdAt: number;
  savedAt: number;
  collectionName: string | null;
  note: string | null;
}

export async function listFavorites(
  _userId: string,
  options: { sort?: FavoriteSort; q?: string; model?: string; access?: string; limit?: number } = {},
): Promise<FavoriteRow[]> {
  const data = await apiRequest<{ items: FavoriteRow[] }>(
    `/v1/viewer/favorites${query({
      sort: options.sort,
      q: options.q,
      model: options.model,
      access: options.access,
      limit: options.limit,
    })}`,
    { token: await token() },
  );
  return data.items;
}

export async function removeFavorite(_userId: string, promptId: string): Promise<void> {
  await apiRequest(`/v1/viewer/favorites/${encodeURIComponent(promptId)}`, {
    method: 'DELETE',
    token: await token(),
  });
}

/* --------------------------------- Copying -------------------------------- */

export interface CopyResult {
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
  usage: UsageStatus;
  copyCount: number;
  /** Pre-formatted document, present for the instructions/download variants. */
  formatted?: string;
}

export async function copyPrompt(input: {
  access: AccessContext;
  visitorHash: string | null;
  promptId: string;
  variant: 'plain' | 'instructions' | 'download';
}): Promise<CopyResult> {
  return apiRequest<CopyResult>('/v1/prompts/copy', {
    method: 'POST',
    token: await getAccessToken(),
    body: { promptId: input.promptId, variant: input.variant },
  });
}

/** Pure formatter for the "copy with instructions" and download variants. */
export function withInstructions(input: {
  title: string;
  aiModel: string;
  inputMode: string;
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
}): string {
  const lines = [`# ${input.title}`, '', '## Prompt', input.promptText];

  if (input.negativePrompt) {
    lines.push('', '## Negative prompt', input.negativePrompt);
  }
  if (input.usageInstructions) {
    lines.push('', '## How to use', input.usageInstructions);
  }

  lines.push('', '## Notes', `- Written and tested for: ${input.aiModel}`);

  // A photo-edit prompt is useless without the upload, so the exported document
  // has to say so — someone reading this file a week later has no page around it.
  if (input.inputMode === 'photo-edit') {
    lines.push(
      '- Upload a clear, front-facing photo of yourself in the same message as this prompt.',
      '- The prompt preserves your face; do not remove the identity-lock paragraph at the top.',
    );
  } else {
    lines.push('- Adjust subject, outfit and location to match your reference image.');
  }

  lines.push('- Re-run two or three times and pick the strongest composition.');

  return lines.join('\n');
}

/* -------------------------------- Activity -------------------------------- */

export interface EngagementStats {
  copies: number;
  saves: number;
  likes: number;
  copiesToday: number;
}

export interface CopyActivityRow {
  promptId: string;
  title: string;
  slug: string;
  variant: string;
  createdAt: number;
}

interface ActivityResponse {
  stats: EngagementStats;
  recent: CopyActivityRow[];
}

async function activity(limit = 10): Promise<ActivityResponse> {
  return apiRequest<ActivityResponse>(`/v1/viewer/activity${query({ limit })}`, {
    token: await token(),
  });
}

export async function userEngagementStats(_userId: string): Promise<EngagementStats> {
  return (await activity(1)).stats;
}

export async function recentCopyActivity(
  _userId: string,
  limit = 10,
): Promise<CopyActivityRow[]> {
  return (await activity(limit)).recent;
}
