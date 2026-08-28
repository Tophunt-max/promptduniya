import { useEnv, useR2 } from '@pd/db';
import { slugify } from '@pd/shared';

import { AppError } from '../lib/errors';
import { newId } from '../lib/crypto';

/**
 * Media storage on R2.
 *
 * Binary data never touches the database — only the object key, public URL and
 * size are persisted. On Cloudflare the bucket is a native binding, so uploads
 * are a direct `put()` with no SDK and no request signing.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/** Magic-byte signatures — the declared Content-Type alone is not trusted. */
const SIGNATURES: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/gif', test: (b) => ascii(b, 0, 3) === 'GIF' },
  {
    mime: 'image/webp',
    test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  },
  { mime: 'image/avif', test: (b) => ascii(b, 4, 8) === 'ftyp' },
];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  for (const signature of SIGNATURES) {
    if (signature.test(bytes)) return signature.mime;
  }
  return null;
}

export interface StoredObject {
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
}

function publicUrlFor(key: string): string {
  const base = (useEnv().R2_PUBLIC_URL ?? '').replace(/\/$/, '');
  return base ? `${base}/${key}` : `/media/${key}`;
}

/**
 * Validates and stores an uploaded image.
 *
 * Checks performed: size cap, declared MIME allow-list, and magic-byte sniffing
 * so a renamed executable cannot be stored as an "image".
 */
export async function uploadImage(input: {
  file: File;
  folder?: string;
}): Promise<StoredObject & { originalName: string }> {
  const { file } = input;

  if (file.size === 0) throw AppError.badRequest('The uploaded file is empty');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw AppError.badRequest(
      `Images must be smaller than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`,
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw AppError.badRequest('Only JPEG, PNG, WebP, AVIF and GIF images are allowed');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffMime(bytes);
  if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) {
    throw AppError.badRequest('That file is not a valid image');
  }

  const extension = EXTENSION_BY_MIME[sniffed] ?? 'bin';
  const baseName = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'image';
  const folder = input.folder ? `${slugify(input.folder)}/` : '';
  const key = `${folder}${baseName}-${newId().toLowerCase()}.${extension}`;

  await useR2().put(key, bytes, {
    httpMetadata: { contentType: sniffed, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return {
    objectKey: key,
    url: publicUrlFor(key),
    mimeType: sniffed,
    fileSize: bytes.byteLength,
    originalName: file.name,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await useR2().delete(key);
}

/** R2 is always the driver on Cloudflare; kept for parity with the web client. */
export function storageMode(): 'r2' | 'local' {
  return 'r2';
}
