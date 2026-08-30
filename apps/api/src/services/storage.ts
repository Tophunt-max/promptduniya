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


/* ------------------------------ Media library ----------------------------- */

export interface MediaObject {
  objectKey: string;
  url: string;
  size: number;
  uploadedAt: number;
  contentType: string | null;
}

/** Reverse of EXTENSION_BY_MIME, for labelling a listed object. */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

function mimeFromKey(key: string): string | null {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

export interface MediaPage {
  items: MediaObject[];
  /** Opaque cursor for the next page, or null at the end. */
  cursor: string | null;
  /** Distinct top-level prefixes, so the console can offer folder filters. */
  folders: string[];
}

/**
 * Lists objects in the bucket.
 *
 * The media screen previously had no listing at all: it showed only what you had
 * uploaded in the current browser session, and a refresh lost the lot. Anything
 * uploaded yesterday was unreachable — and undeletable, since you need a key to
 * delete and there was no way to discover one.
 *
 * Pagination is R2's own cursor rather than an offset. `list()` is a forward-only
 * scan, so there is no way to jump to page five without walking the four before
 * it; exposing the cursor keeps that honest instead of pretending to random
 * access and quietly re-scanning the bucket on every page change.
 *
 * `delimiter` is deliberately not used for the object list. It would make R2
 * collapse each folder into a single entry, which is the wrong shape here — the
 * screen wants a flat, newest-first list of files. Folder names are collected
 * separately below so the filter dropdown can still exist.
 */
export async function listMedia(options: {
  prefix?: string;
  cursor?: string;
  limit?: number;
} = {}): Promise<MediaPage> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 60));
  const prefix = options.prefix ? `${slugify(options.prefix)}/` : undefined;

  const listing = await useR2().list({ prefix, limit, cursor: options.cursor });

  const items: MediaObject[] = listing.objects.map((object) => ({
    objectKey: object.key,
    url: publicUrlFor(object.key),
    size: object.size,
    uploadedAt: Math.floor(new Date(object.uploaded).getTime() / 1000),
    // Derived from the key rather than requested via `include: ['httpMetadata']`.
    // Every key this app writes ends in an extension chosen from the sniffed MIME
    // type in `uploadImage`, so the extension is already authoritative — and
    // asking R2 for metadata makes the listing measurably slower for a value we
    // can compute for free.
    contentType: mimeFromKey(object.key),
  }));

  // Newest first. R2 returns keys in lexicographic order, and because every key
  // ends in a generated id the order is effectively random by date — which reads
  // as "no order at all" in a gallery.
  items.sort((a, b) => b.uploadedAt - a.uploadedAt);

  return {
    items,
    cursor: listing.truncated ? listing.cursor : null,
    folders: await listFolders(),
  };
}

/**
 * Top-level folder names.
 *
 * A separate delimited list, capped: this is for a filter dropdown, so it needs
 * the handful of prefixes in use rather than an exhaustive walk of the bucket.
 */
async function listFolders(): Promise<string[]> {
  try {
    const listing = await useR2().list({ delimiter: '/', limit: 1000 });
    return (listing.delimitedPrefixes ?? [])
      .map((prefix) => prefix.replace(/\/$/, ''))
      .filter(Boolean)
      .sort();
  } catch {
    // A bucket that cannot be listed by prefix is not a reason to fail the page.
    return [];
  }
}

/**
 * Deletes one object after confirming it exists.
 *
 * R2's `delete()` succeeds silently on a missing key, which would let the console
 * report "deleted" for a typo. The `head()` first turns that into an honest 404.
 */
export async function deleteMedia(key: string): Promise<void> {
  if (!key || key.includes('..')) throw AppError.badRequest('Invalid object key');

  const existing = await useR2().head(key);
  if (!existing) throw AppError.notFound('That file is not in the bucket');

  await useR2().delete(key);
}

/**
 * Deletes several objects, reporting per-key outcomes.
 *
 * Partial success is the norm for a multi-select delete — one key may already be
 * gone — so this resolves with counts instead of rejecting on the first failure
 * and leaving the caller unsure what happened.
 */
export async function deleteManyMedia(
  keys: string[],
): Promise<{ deleted: number; failed: { key: string; reason: string }[] }> {
  const unique = [...new Set(keys)].filter((key) => key && !key.includes('..'));
  if (unique.length === 0) throw AppError.badRequest('No object keys were supplied');
  if (unique.length > 100) throw AppError.badRequest('Delete at most 100 files at a time');

  let deleted = 0;
  const failed: { key: string; reason: string }[] = [];

  for (const key of unique) {
    try {
      await useR2().delete(key);
      deleted += 1;
    } catch (error) {
      failed.push({ key, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { deleted, failed };
}

/**
 * Whether an object is referenced by any prompt.
 *
 * Powers an "unused" hint in the media browser. Deleting a file that is still a
 * prompt's cover breaks that prompt's page silently — the URL keeps resolving to
 * a 404 image — so the console needs to be able to warn before, not after.
 *
 * Matches on the key rather than the full URL because `R2_PUBLIC_URL` can change
 * between environments while stored URLs keep the old host.
 */
export async function findMediaUsage(
  key: string,
): Promise<{ promptCount: number; titles: string[] }> {
  const { db, promptImages, prompts } = await import('@pd/db');
  const { like, or } = await import('drizzle-orm');

  const needle = `%${key}%`;

  const [covers, examples] = await Promise.all([
    db
      .select({ title: prompts.title })
      .from(prompts)
      .where(or(like(prompts.coverImageUrl, needle)))
      .limit(20),
    db
      .select({ promptId: promptImages.promptId })
      .from(promptImages)
      .where(or(like(promptImages.url, needle), like(promptImages.objectKey, needle)))
      .limit(20),
  ]);

  return {
    promptCount: covers.length + examples.length,
    titles: covers.map((row) => row.title),
  };
}
