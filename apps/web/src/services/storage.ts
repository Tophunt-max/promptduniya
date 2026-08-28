import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';
import { env } from '@/lib/env';

/**
 * Media uploads.
 *
 * The bytes are streamed to the API worker, which writes them into its R2
 * bucket. The website holds no bucket credentials, so a compromised frontend
 * cannot read or overwrite stored media.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — mirrors the API's cap.

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

export interface StoredObject {
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Forwards an upload to the API. Validation (size, MIME allow-list and
 * magic-byte sniffing) is re-run there, which is the authoritative check.
 */
export async function uploadImage(input: {
  file: File;
  folder?: string;
}): Promise<StoredObject & { originalName: string }> {
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();

  const form = new FormData();
  form.set('file', input.file);
  if (input.folder) form.set('folder', input.folder);

  const base = env().API_BASE_URL.replace(/\/$/, '');
  let response: Response;
  try {
    // Sent with `fetch` rather than the JSON client so the multipart body and
    // its boundary header are preserved.
    response = await fetch(`${base}/v1/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: form,
      cache: 'no-store',
    });
  } catch {
    throw AppError.internal('The upload service is temporarily unreachable.');
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: StoredObject & { originalName: string } }
    | { ok: false; error: { code: string; message: string } }
    | null;

  if (!response.ok || !payload?.ok) {
    const message = payload && !payload.ok ? payload.error.message : 'The upload failed.';
    throw AppError.badRequest(message);
  }

  return payload.data;
}

/** Storage is always R2 behind the API. */
export function storageMode(): 'r2' | 'local' {
  return 'r2';
}

export async function uploadConfig(): Promise<{
  maxBytes: number;
  driver: string;
  allowed: string[];
}> {
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  return apiRequest('/v1/admin/upload/config', { token });
}
