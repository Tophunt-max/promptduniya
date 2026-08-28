#!/usr/bin/env node
/**
 * One-shot Cloudflare provisioning for promptduniya.
 *
 * Creates the D1 database, the four KV namespaces and the R2 bucket, then writes
 * the returned ids straight into `apps/api/wrangler.jsonc` and
 * `apps/web/wrangler.jsonc`. Copying ids by hand across two config files with
 * four identical `REPLACE_WITH_KV_ID` placeholders is the single easiest step to
 * get wrong, so it is automated.
 *
 *   node scripts/provision.mjs            # create resources and patch configs
 *   node scripts/provision.mjs --dry-run  # print the commands, change nothing
 *
 * Safe to re-run: existing resources are detected and reused rather than
 * duplicated.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

const D1_NAME = 'promptduniya';
const R2_BUCKET = 'promptduniya-media';

/** KV namespaces, and which config each id belongs to. */
const KV_NAMESPACES = [
  { title: 'promptduniya-rate-limit', binding: 'RATE_LIMIT', app: 'api' },
  { title: 'promptduniya-sessions', binding: 'SESSIONS', app: 'api' },
  { title: 'promptduniya-cache', binding: 'CACHE', app: 'api' },
  { title: 'promptduniya-next-cache', binding: 'NEXT_INC_CACHE_KV', app: 'web' },
];

function heading(text) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

function ok(text) {
  console.log(`  \x1b[32m✓\x1b[0m ${text}`);
}

function warn(text) {
  console.log(`  \x1b[33m!\x1b[0m ${text}`);
}

/** Runs wrangler in the given workspace and returns stdout (never throws). */
function wrangler(app, args) {
  const command = `wrangler ${args.join(' ')}`;
  if (DRY_RUN) {
    console.log(`  [dry-run] (apps/${app}) ${command}`);
    return '';
  }
  try {
    return execFileSync('npx', ['--no-install', 'wrangler', ...args], {
      cwd: join(ROOT, 'apps', app),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    });
  } catch (error) {
    // Wrangler exits non-zero when a resource already exists; the message is
    // still on stdout/stderr and the caller decides what to do with it.
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

/** Pulls a 32-character hex id out of arbitrary wrangler output. */
function extractId(output) {
  const quoted = /"?id"?\s*[:=]\s*"([0-9a-f]{32})"/i.exec(output);
  if (quoted) return quoted[1];
  const bare = /\b([0-9a-f]{32})\b/i.exec(output);
  return bare ? bare[1] : null;
}

/* ------------------------------- Provisioning ------------------------------ */

function createD1() {
  heading('D1 database');
  const output = wrangler('api', ['d1', 'create', D1_NAME]);
  if (DRY_RUN) return null;

  const id = extractId(output);
  if (id) {
    ok(`${D1_NAME} → ${id}`);
    return id;
  }

  // Already exists: read the id back from the account listing.
  const list = wrangler('api', ['d1', 'list', '--json']);
  try {
    const existing = JSON.parse(list).find((db) => db.name === D1_NAME);
    if (existing?.uuid) {
      warn(`${D1_NAME} already exists → ${existing.uuid}`);
      return existing.uuid;
    }
  } catch {
    /* fall through to the failure path below */
  }

  warn(`could not determine the id for ${D1_NAME}. Output was:\n${output.trim()}`);
  return null;
}

function createKv(namespace) {
  const output = wrangler('api', ['kv', 'namespace', 'create', namespace.title]);
  if (DRY_RUN) return null;

  const id = extractId(output);
  if (id) {
    ok(`${namespace.title} (${namespace.binding}) → ${id}`);
    return id;
  }

  const list = wrangler('api', ['kv', 'namespace', 'list']);
  try {
    const existing = JSON.parse(list).find((ns) => ns.title === namespace.title);
    if (existing?.id) {
      warn(`${namespace.title} already exists → ${existing.id}`);
      return existing.id;
    }
  } catch {
    /* fall through */
  }

  warn(`could not determine the id for ${namespace.title}. Output was:\n${output.trim()}`);
  return null;
}

function createR2() {
  heading('R2 bucket');
  const output = wrangler('api', ['r2', 'bucket', 'create', R2_BUCKET]);
  if (DRY_RUN) return;
  if (/already (exists|owned)/i.test(output)) warn(`${R2_BUCKET} already exists`);
  else ok(`${R2_BUCKET} created`);
}

/* ------------------------------ Config patching ---------------------------- */

/**
 * Replaces the placeholder id for one binding in a wrangler config.
 *
 * Matches the object containing `"binding": "<NAME>"` and rewrites the `id`
 * field inside it, so the four identical KV placeholders can be filled in
 * independently and in any order.
 */
function patchBindingId(source, binding, id) {
  const pattern = new RegExp(
    `(\\{[^{}]*"binding"\\s*:\\s*"${binding}"[^{}]*?"id"\\s*:\\s*")[^"]*(")`,
    's',
  );
  if (pattern.test(source)) return source.replace(pattern, `$1${id}$2`);

  // Same object, but with `id` declared before `binding`.
  const reversed = new RegExp(
    `(\\{[^{}]*"id"\\s*:\\s*")[^"]*("[^{}]*?"binding"\\s*:\\s*"${binding}")`,
    's',
  );
  return source.replace(reversed, `$1${id}$2`);
}

function patchDatabaseId(source, id) {
  return source.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${id}$2`);
}

function writeConfig(app, mutate) {
  const path = join(ROOT, 'apps', app, 'wrangler.jsonc');
  const before = readFileSync(path, 'utf8');
  const after = mutate(before);
  if (before === after) return false;
  if (!DRY_RUN) writeFileSync(path, after, 'utf8');
  return true;
}

/* ---------------------------------- Main ---------------------------------- */

function main() {
  console.log('\n\x1b[1mpromptduniya · Cloudflare provisioning\x1b[0m');
  if (DRY_RUN) console.log('(dry run — nothing will be created or modified)');

  const d1Id = createD1();

  heading('KV namespaces');
  const kvIds = new Map();
  for (const namespace of KV_NAMESPACES) {
    const id = createKv(namespace);
    if (id) kvIds.set(namespace.binding, id);
  }

  createR2();

  heading('Updating wrangler configs');
  let patched = 0;

  if (d1Id || kvIds.size > 0) {
    if (
      writeConfig('api', (source) => {
        let next = source;
        if (d1Id) next = patchDatabaseId(next, d1Id);
        for (const namespace of KV_NAMESPACES.filter((n) => n.app === 'api')) {
          const id = kvIds.get(namespace.binding);
          if (id) next = patchBindingId(next, namespace.binding, id);
        }
        return next;
      })
    ) {
      ok('apps/api/wrangler.jsonc');
      patched += 1;
    }

    if (
      writeConfig('web', (source) => {
        let next = source;
        for (const namespace of KV_NAMESPACES.filter((n) => n.app === 'web')) {
          const id = kvIds.get(namespace.binding);
          if (id) next = patchBindingId(next, namespace.binding, id);
        }
        return next;
      })
    ) {
      ok('apps/web/wrangler.jsonc');
      patched += 1;
    }
  }

  if (patched === 0 && !DRY_RUN) warn('no config changes were necessary');

  heading('Next steps');
  console.log(`  1. Set the API secrets:
       cd apps/api
       wrangler secret put AUTH_SECRET        # openssl rand -base64 48
       wrangler secret put CRON_SECRET
       wrangler secret put RAZORPAY_KEY_ID
       wrangler secret put RAZORPAY_KEY_SECRET
       wrangler secret put RAZORPAY_WEBHOOK_SECRET
       wrangler secret put AI_API_KEY         # optional
       wrangler secret put RESEND_API_KEY     # optional

  2. Set the website secrets (AUTH_SECRET must be byte-identical to the API's):
       cd apps/web
       wrangler secret put AUTH_SECRET
       wrangler secret put CRON_SECRET

  3. Migrate and seed:
       npm run db:setup:remote --workspace apps/api

  4. Deploy, API first so the website's service binding resolves:
       npm run deploy:api
       npm run deploy:web
       npm run deploy:admin
`);
}

main();
