# promptduniya — Cloudflare monorepo

**Create Better. Imagine More.**

Re-architecture of promptduniya into a Cloudflare-native monorepo: a separate **API** (Hono Worker + D1/KV/R2), a public **website** (Next.js), and an **admin** panel (Vite SPA).

> The original single-app version lives on the `Main` branch. This branch (`cloudflare-monorepo`) is the split rebuild, in progress.

---

## Architecture

```
        apps/web (Next.js, SEO)      apps/admin (Vite SPA)
                 │                            │
   service binding (SSR)              fetch + Bearer JWT
                 └──────────────┬─────────────┘
                                ▼
                     apps/api  (Hono Worker)
                         │      │      │
                        D1     KV     R2
```

## Workspace layout

```
packages/
  shared/   → constants, validation, types, password rules   (isomorphic, zero Node deps)
  db/       → Drizzle schema + D1 driver + request-scoped context
apps/
  api/      → Hono Worker: auth (JWT), prompts, copy…  D1 + KV + R2 bindings
  web/      → public website (Next.js — from the monolith, to be refactored onto the API)
  admin/    → admin SPA (Vite — not started yet)
```

## Cloudflare resources

| Resource | Binding | Used for |
| --- | --- | --- |
| D1 | `DB` | Relational data (same 30-table SQLite schema) |
| KV | `RATE_LIMIT` | Global rate-limit counters |
| KV | `SESSIONS` | Refresh tokens (revocable) |
| KV | `CACHE` | Settings / hot-path cache |
| R2 | `MEDIA` | Prompt images and uploads |

## Key design points

- **Binding-agnostic services.** Services import `db` from `@pd/db`, which resolves the request's D1 binding via `AsyncLocalStorage` (`nodejs_compat`). No connection strings, minimal changes from the monolith's service code.
- **Cross-origin auth.** Short-lived JWT access tokens (jose) + revocable refresh tokens in KV. Refresh also set as an httpOnly cookie for the website's SSR layer.
- **KV rate limiting.** Global across isolates (the monolith's in-memory limiter was per-instance).
- **Same security guarantees.** Premium access computed from subscription state; prompt bodies withheld server-side; entitlement resolution ported verbatim (including the subscription-join fix).

## Status

| # | Task | State |
| --- | --- | --- |
| 1 | Monorepo + `@pd/shared` + `@pd/db` (D1) | ✅ done, typechecks |
| 2 | Binding-agnostic services (auth, entitlements, prompts, engagement, settings) | ✅ vertical slice done |
| 3 | `apps/api` Hono Worker (auth, prompts, copy, rate-limit, CORS, error envelope) | ✅ builds; remaining endpoints follow the same pattern |
| 4 | `apps/web` refactored onto the API | ⏳ next |
| 5 | `apps/admin` Vite SPA | ⏳ next |
| 6 | Deploy configs + docs (wrangler, D1 migrate, service bindings) | 🟡 wrangler.jsonc done; full guide pending |

## Verified so far

- `npm run typecheck` — clean across `@pd/shared`, `@pd/db`, `@pd/api`
- `wrangler deploy --dry-run` — API Worker bundles (≈125 KiB gzip) with all D1/KV/R2 bindings and `nodejs_compat`
- Miniflare integration tests written (`apps/api/test`) covering register/login/me, prompt listing, premium gating and copy quota

> **Sandbox note:** the Cloudflare Workers runtime (`workerd`) cannot start in this build sandbox (CPU-detection crash), so the Miniflare tests are not executed *here*. They run in a normal environment/CI where `workerd` starts. Build + typecheck are the verification available in this sandbox.

## Running the API locally

```bash
npm install

# One-time Cloudflare resources (your account):
cd apps/api
wrangler d1 create promptduniya          # paste the id into wrangler.jsonc
wrangler kv namespace create RATE_LIMIT  # repeat for SESSIONS, CACHE; paste ids
wrangler r2 bucket create promptduniya-media

# Schema + secrets:
npm run db:migrate:local
wrangler secret put AUTH_SECRET           # + RAZORPAY_*, AI_API_KEY as needed

npm run dev                               # local Worker with D1/KV/R2
```

## Next steps

1. Finish the remaining API endpoints (generator, payments, subscriptions, admin, coupons) — the auth/prompts slice establishes the pattern.
2. Refactor `apps/web` to call the API (service binding for SSR, fetch on the client) while keeping SEO/SSG.
3. Build `apps/admin` as a Vite SPA using Bearer-token auth.
4. Write the full Cloudflare deployment guide (D1 migrations, KV/R2, service bindings, custom domains, cron).
