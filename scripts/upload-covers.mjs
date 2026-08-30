#!/usr/bin/env node
/**
 * Bulk cover-image populator for promptduniya.
 *
 * Reads a folder of images named after prompt slugs, uploads each one to R2
 * through the admin API, and writes the resulting public URL back onto the
 * matching prompt as its cover image. Extra images for the same prompt become
 * example outputs, which the prompt page already renders as a thumbnail strip.
 *
 *   node scripts/upload-covers.mjs ./covers                 # upload and attach
 *   node scripts/upload-covers.mjs ./covers --dry-run       # match only, no writes
 *   node scripts/upload-covers.mjs ./covers --only edit-    # slug prefix filter
 *   node scripts/upload-covers.mjs ./covers --force         # replace existing covers
 *
 * File naming — the part before the extension is the prompt slug:
 *
 *   covers/
 *     edit-diwali-diya-doorway-portrait.webp        -> becomes the cover
 *     edit-diwali-diya-doorway-portrait-2.webp      -> example output 1
 *     edit-diwali-diya-doorway-portrait-3.webp      -> example output 2
 *     gemini-golden-hour-rooftop-portrait.jpg       -> becomes the cover
 *
 * A trailing `-<number>` marks an extra image for the same prompt. The one
 * without a suffix is the cover; ordering of the extras follows the number.
 *
 * Credentials come from the environment:
 *
 *   PD_API_BASE_URL   default https://promptduniya-api.onlineilovegames.workers.dev
 *   PD_ADMIN_EMAIL    an account holding the admin or editor role
 *   PD_ADMIN_PASSWORD
 *
 * Safe to re-run: a prompt that already has a cover is skipped unless --force
 * is passed. Uploads themselves are not deduplicated — each run writes fresh R2
 * objects, so --force leaves the previous objects orphaned in the bucket.
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const DEFAULT_API = 'https://promptduniya-api.onlineilovegames.workers.dev';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};
/** Mirrors MAX_UPLOAD_BYTES in apps/api/src/services/storage.ts. */
const MAX_BYTES = 8 * 1024 * 1024;

/* ------------------------------- Arguments -------------------------------- */

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const onlyIndex = args.indexOf('--only');
const ONLY_PREFIX = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
const directory = args.find((arg) => !arg.startsWith('--') && arg !== ONLY_PREFIX);

const API_BASE = (process.env.PD_API_BASE_URL ?? DEFAULT_API).replace(/\/$/, '');
const EMAIL = process.env.PD_ADMIN_EMAIL;
const PASSWORD = process.env.PD_ADMIN_PASSWORD;

/* --------------------------------- Output --------------------------------- */

const ok = (text) => console.log(`  \x1b[32m✓\x1b[0m ${text}`);
const warn = (text) => console.log(`  \x1b[33m!\x1b[0m ${text}`);
const fail = (text) => console.log(`  \x1b[31m✗\x1b[0m ${text}`);
const heading = (text) => console.log(`\n\x1b[1m${text}\x1b[0m`);

function die(message) {
  console.error(`\n\x1b[31m${message}\x1b[0m\n`);
  process.exit(1);
}

/* ------------------------------- API client ------------------------------- */

let accessToken = null;

/** Unwraps the API's `{ ok, data, error }` envelope. */
async function callApi(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // FormData must not have Content-Type set by hand — the runtime has to
  // generate the multipart boundary.
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok || payload.ok === false) {
    const detail = payload.error?.message ?? JSON.stringify(payload.error ?? payload);
    throw new Error(`${method} ${path} failed (${response.status}): ${detail}`);
  }
  return payload.data;
}

async function login() {
  const data = await callApi('/v1/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!data.user?.isEditor && !data.user?.isAdmin) {
    die(`${EMAIL} is signed in but holds neither the admin nor the editor role.`);
  }
  accessToken = data.accessToken;
  return data.user;
}

/** Walks the admin prompt list and returns every prompt, keyed by slug. */
async function fetchPromptsBySlug() {
  const bySlug = new Map();
  for (let page = 1; page <= 50; page++) {
    const data = await callApi(`/v1/admin/prompts?page=${page}&pageSize=100&status=all`);
    const items = data.items ?? [];
    for (const item of items) bySlug.set(item.slug, item);
    const totalPages = data.totalPages ?? 1;
    if (page >= totalPages || items.length === 0) break;
  }
  return bySlug;
}

async function uploadFile(filePath, mimeType) {
  const bytes = await readFile(filePath);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`${basename(filePath)} is ${(bytes.byteLength / 1_048_576).toFixed(1)} MB — the API cap is 8 MB`);
  }
  const form = new FormData();
  form.set('file', new File([bytes], basename(filePath), { type: mimeType }));
  form.set('folder', 'prompts');
  return callApi('/v1/admin/upload', { method: 'POST', form });
}

/**
 * Writes the cover (and any example images) back onto the prompt.
 *
 * `PUT /v1/admin/prompts/:id` is a full-body replace — there is no PATCH for
 * individual fields — so the existing record has to be echoed back in full with
 * only the image fields changed. Anything omitted here would be silently reset
 * to its schema default, which is why every field is carried across explicitly.
 */
async function attachImages(prompt, cover, extras) {
  const detail = await callApi(`/v1/admin/prompts/${prompt.id}`);

  const payload = {
    title: detail.title,
    slug: detail.slug,
    shortDescription: detail.shortDescription,
    promptText: detail.promptText,
    negativePrompt: detail.negativePrompt ?? undefined,
    usageInstructions: detail.usageInstructions ?? undefined,
    aiModel: detail.aiModel,
    inputMode: detail.inputMode ?? 'text-to-image',
    categoryId: detail.categoryId,
    subcategoryId: detail.subcategoryId ?? undefined,
    style: detail.style ?? undefined,
    gender: detail.gender ?? undefined,
    ageGroup: detail.ageGroup ?? undefined,
    location: detail.location ?? undefined,
    aspectRatio: detail.aspectRatio ?? undefined,
    cameraStyle: detail.cameraStyle ?? undefined,
    lighting: detail.lighting ?? undefined,
    mood: detail.mood ?? undefined,
    difficulty: detail.difficulty ?? 'beginner',
    tags: (detail.tags ?? []).map((tag) => tag.name),
    isPremium: Boolean(detail.isPremium),
    isFeatured: Boolean(detail.isFeatured),
    isTrending: Boolean(detail.isTrending),
    isEditorsPick: Boolean(detail.isEditorsPick),
    isPublished: Boolean(detail.isPublished),
    scheduledFor: detail.scheduledFor ?? null,
    seoTitle: detail.seoTitle ?? undefined,
    seoDescription: detail.seoDescription ?? undefined,
    coverImageUrl: cover?.url ?? detail.coverImageUrl ?? undefined,
    coverImageAlt: cover ? `Example output for ${detail.title}` : (detail.coverImageAlt ?? undefined),
    exampleImages: extras.map((image) => ({
      url: image.url,
      alt: `Example output for ${detail.title}`,
    })),
  };

  return callApi(`/v1/admin/prompts/${prompt.id}`, { method: 'PUT', body: payload });
}

/* --------------------------------- Matching -------------------------------- */

/** Groups files by prompt slug, separating the cover from numbered extras. */
function groupBySlug(files) {
  const groups = new Map();
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) continue;

    const stem = basename(file, extname(file));
    const numbered = /^(.*)-(\d+)$/.exec(stem);
    const slug = numbered ? numbered[1] : stem;
    const order = numbered ? Number(numbered[2]) : 0;

    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push({ file, extension, order });
  }
  for (const list of groups.values()) list.sort((a, b) => a.order - b.order);
  return groups;
}

/* ----------------------------------- Main ---------------------------------- */

async function main() {
  console.log('\n\x1b[1mpromptduniya · cover image upload\x1b[0m');
  if (DRY_RUN) console.log('(dry run — nothing will be uploaded or modified)');

  if (!directory) {
    die('Usage: node scripts/upload-covers.mjs <folder> [--dry-run] [--force] [--only <prefix>]');
  }
  if (!DRY_RUN && (!EMAIL || !PASSWORD)) {
    die('Set PD_ADMIN_EMAIL and PD_ADMIN_PASSWORD before running without --dry-run.');
  }

  const folder = resolve(directory);
  let entries;
  try {
    entries = await readdir(folder);
  } catch {
    die(`Cannot read folder: ${folder}`);
  }

  const groups = groupBySlug(entries);
  if (groups.size === 0) {
    die(`No images found in ${folder}. Expected files named <prompt-slug>.webp (or .jpg/.png/.avif/.gif).`);
  }

  heading(`Found ${groups.size} slug${groups.size === 1 ? '' : 's'} in ${folder}`);

  if (DRY_RUN && (!EMAIL || !PASSWORD)) {
    for (const [slug, files] of groups) {
      console.log(`  ${slug} — ${files.length} file${files.length === 1 ? '' : 's'}`);
    }
    console.log('\n  Set PD_ADMIN_EMAIL / PD_ADMIN_PASSWORD to also check these against the catalogue.\n');
    return;
  }

  heading('Signing in');
  const user = await login();
  ok(`${user.email} (${user.isAdmin ? 'admin' : 'editor'})`);

  heading('Loading the prompt catalogue');
  const bySlug = await fetchPromptsBySlug();
  ok(`${bySlug.size} prompts`);

  let attached = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  heading('Processing');
  for (const [slug, files] of groups) {
    if (ONLY_PREFIX && !slug.startsWith(ONLY_PREFIX)) continue;

    const prompt = bySlug.get(slug);
    if (!prompt) {
      warn(`${slug} — no prompt with this slug, skipping`);
      missing += 1;
      continue;
    }
    if (prompt.coverImageUrl && !FORCE) {
      warn(`${slug} — already has a cover (pass --force to replace)`);
      skipped += 1;
      continue;
    }
    if (DRY_RUN) {
      ok(`${slug} — would upload ${files.length} file${files.length === 1 ? '' : 's'}`);
      attached += 1;
      continue;
    }

    try {
      const uploaded = [];
      for (const entry of files) {
        const stored = await uploadFile(
          join(folder, entry.file),
          MIME_BY_EXTENSION[entry.extension],
        );
        uploaded.push(stored);
      }
      // The unsuffixed file sorts to index 0 and becomes the cover; the rest
      // become example outputs, capped at the schema's eight.
      await attachImages(prompt, uploaded[0], uploaded.slice(1, 9));
      ok(`${slug} — cover${uploaded.length > 1 ? ` + ${uploaded.length - 1} example${uploaded.length > 2 ? 's' : ''}` : ''}`);
      attached += 1;
    } catch (error) {
      fail(`${slug} — ${error.message}`);
      failed += 1;
    }
  }

  heading('Summary');
  console.log(`  attached: ${attached}`);
  if (skipped) console.log(`  skipped (already had a cover): ${skipped}`);
  if (missing) console.log(`  no matching prompt: ${missing}`);
  if (failed) console.log(`  failed: ${failed}`);
  console.log(
    DRY_RUN
      ? '\n  Re-run without --dry-run to apply.\n'
      : '\n  Covers are served from R2 and cached immutably. The prompt pages revalidate within 10 minutes.\n',
  );

  if (failed) process.exitCode = 1;
}

main().catch((error) => die(error.stack ?? String(error)));
