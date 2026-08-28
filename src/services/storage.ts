import { createHash, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AppError } from '@/lib/api';
import { env, storageConfigured } from '@/lib/env';
import { newId } from '@/lib/id';
import { slugify } from '@/lib/utils';

/**
 * Media storage.
 *
 * Binary data never touches the database — only the object key, public URL and
 * dimensions are persisted. Cloudflare R2 (or any S3-compatible bucket) is used
 * when configured, and a local `public/uploads` directory is the development
 * fallback so image upload works out of the box.
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
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/gif',
    test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF',
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/avif',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
];

function sniffMime(buffer: Buffer): string | null {
  for (const signature of SIGNATURES) {
    if (buffer.length >= 12 && signature.test(buffer)) return signature.mime;
  }
  return null;
}

export interface StoredObject {
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
}

export interface StorageAdapter {
  readonly name: string;
  put(input: { key: string; body: Buffer; mimeType: string }): Promise<StoredObject>;
}

class LocalDiskAdapter implements StorageAdapter {
  readonly name = 'local';

  async put(input: { key: string; body: Buffer; mimeType: string }): Promise<StoredObject> {
    const directory = join(process.cwd(), 'public', 'uploads');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, input.key), input.body);

    return {
      objectKey: input.key,
      url: `/uploads/${input.key}`,
      mimeType: input.mimeType,
      fileSize: input.body.byteLength,
    };
  }
}

/**
 * Minimal S3/R2 PUT using SigV4. Implemented directly with fetch so the project
 * does not need the AWS SDK just to upload a handful of images.
 */
class R2Adapter implements StorageAdapter {
  readonly name = 'r2';

  constructor(
    private readonly accountId: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly bucket: string,
    private readonly publicUrl: string,
  ) {}

  private sign(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data).digest();
  }

  async put(input: { key: string; body: Buffer; mimeType: string }): Promise<StoredObject> {
    const host = `${this.accountId}.r2.cloudflarestorage.com`;
    const path = `/${this.bucket}/${input.key}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(input.body).digest('hex');

    const canonicalHeaders =
      `content-type:${input.mimeType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      path,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.sign(
      this.sign(this.sign(this.sign(`AWS4${this.secretAccessKey}`, dateStamp), 'auto'), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const response = await fetch(`https://${host}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': input.mimeType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: new Uint8Array(input.body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw AppError.internal(`Upload failed with status ${response.status}`);
    }

    const base = this.publicUrl.replace(/\/$/, '');
    return {
      objectKey: input.key,
      url: base ? `${base}/${input.key}` : `https://${host}${path}`,
      mimeType: input.mimeType,
      fileSize: input.body.byteLength,
    };
  }
}

let adapter: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  if (adapter) return adapter;
  const e = env();
  adapter = storageConfigured()
    ? new R2Adapter(
        e.R2_ACCOUNT_ID!,
        e.R2_ACCESS_KEY_ID!,
        e.R2_SECRET_ACCESS_KEY!,
        e.R2_BUCKET!,
        e.R2_PUBLIC_URL ?? '',
      )
    : new LocalDiskAdapter();
  return adapter;
}

export function setStorage(custom: StorageAdapter | null) {
  adapter = custom;
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) {
    throw AppError.badRequest('That file is not a valid image');
  }

  const extension = EXTENSION_BY_MIME[sniffed] ?? 'bin';
  const baseName = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'image';
  const folder = input.folder ? `${slugify(input.folder)}/` : '';
  const key = `${folder}${baseName}-${newId().toLowerCase()}.${extension}`;

  const stored = await storage().put({ key, body: buffer, mimeType: sniffed });
  return { ...stored, originalName: file.name };
}

export function storageMode(): 'r2' | 'local' {
  return storageConfigured() ? 'r2' : 'local';
}
