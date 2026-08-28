import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';

/**
 * OpenNext adapter configuration.
 *
 * The incremental cache is backed by Workers KV, which is what makes ISR and
 * `revalidate` work across the whole edge network rather than per-isolate. The
 * `NEXT_INC_CACHE_KV` binding in `wrangler.jsonc` is where it stores entries.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
