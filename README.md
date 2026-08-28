# promptduniya

**Create Better. Imagine More.** — an India-focused AI prompt library, generator and premium membership platform, built as a Cloudflare-native monorepo.

Three independently deployable apps: an **API** (Hono Worker owning D1/KV/R2), a public **website** (Next.js), and an **admin console** (Vite SPA).

> The original single-app monolith lives on the `Main` branch. This branch is the split rebuild.

---

## Architecture

```
   apps/web  (Next.js · SEO)              apps/admin  (Vite SPA)
   ┌─────────────────────┐                ┌──────────────────┐
   │ browser → own origin│                │ browser → API    │
   │ httpOnly cookies    │                │ Bearer in memory │
   └──────────┬──────────┘                └────────┬─────────┘
              │ service binding                    │ fetch (CORS)
              │ (stays inside Cloudflare)          │
              └───────────────┬────────────────────┘
                              ▼
                    apps/api  (Hono Worker)
                    ┌─────────┼─────────┐
                   D1        KV        R2
```

**The API is the only thing that touches data.** The website holds no database binding and no gateway credentials; the admin console holds no secrets at all. Every request either app makes is re-authorised by the API, so a compromised frontend cannot grant itself premium access or read another member's data.

### Why the website proxies instead of calling the API from the browser

The website is a **backend-for-frontend**. The browser only ever talks to the website's own origin, and the website attaches the bearer token server-side. That means:

- no access token in JavaScript, so an XSS cannot exfiltrate a credential
- `connect-src 'self'` in the CSP — no cross-origin allowance needed
- SSR and SSG reach the API over a **service binding**: no public hop, no TLS handshake, no egress cost

The admin console does the opposite (direct cross-origin, token in memory) because it has no SEO requirement and no server of its own.

## Workspace layout

```
packages/
  shared/   constants, zod validation, wire types, password rules   (isomorphic)
  db/       Drizzle schema (36 tables) + D1 driver + request-scoped context
apps/
  api/      Hono Worker — all business logic, D1 + KV + R2, nightly cron
  web/      public website — Next.js on OpenNext, zero data-layer dependencies
  admin/    admin console — Vite + React SPA, static assets only
scripts/
  provision.mjs   creates the Cloudflare resources and writes the ids into the configs
```

## Cloudflare resources

| Resource | Binding | Worker | Purpose |
| --- | --- | --- | --- |
| D1 | `DB` | api | Relational data — the whole 36-table schema |
| KV | `RATE_LIMIT` | api | Rate-limit counters, global across isolates |
| KV | `SESSIONS` | api | Revocable refresh tokens |
| KV | `CACHE` | api | Settings cache and mock-payment state |
| R2 | `MEDIA` | api | Prompt images and uploads |
| KV | `NEXT_INC_CACHE_KV` | web | Next.js incremental cache (ISR / `revalidate`) |
| Service | `API` | web | Website → API, inside Cloudflare's network |
| Cron | `30 19 * * *` | api | 01:00 IST maintenance job |

## Key design decisions

**Binding-agnostic services.** Services `import { db } from '@pd/db'`, which resolves the current request's D1 binding through `AsyncLocalStorage` (`nodejs_compat`). No connection strings, and no threading a context object through every function signature.

**Auth.** Short-lived JWT access tokens (`jose`, HS256) plus revocable refresh tokens in KV.
- The website stores both as httpOnly cookies and verifies the access token's signature *locally* with the shared `AUTH_SECRET`, so resolving a session costs zero network calls. `src/middleware.ts` silently refreshes a token that is within 120 s of expiry and rewrites the forwarded request cookie so the current render already sees the new one.
- The admin SPA keeps the access token in module memory only. Its refresh token is the API's httpOnly `pd_refresh` cookie (`SameSite=None`, `Path=/v1/auth`), so a page reload restores the session without the SPA persisting anything.

**Payment integrity.** The charge amount is always derived from the plan row, never from the client. The gateway signature is verified *and* the payment re-fetched and cross-checked before premium is granted. Webhook processing is idempotent on a unique `(provider, event_key)`.

**Premium content.** Prompt bodies are never included in listing payloads. The single `POST /v1/prompts/copy` endpoint is the only way to obtain one, and it enforces the entitlement and the daily quota first.

**No SDKs on the Worker.** Razorpay is called over `fetch` with `node:crypto` HMAC; R2 uses its native binding; email goes to Resend over `fetch`. Keeps the API bundle at ~159 KiB gzip.

## Quick start

```bash
npm install

# 1. Create D1, KV and R2, and write the ids into the wrangler configs
npm run provision                    # add --dry-run first to preview

# 2. Local secrets
cp apps/api/.dev.vars.example apps/api/.dev.vars     # set AUTH_SECRET
cp apps/web/.env.example      apps/web/.env          # same AUTH_SECRET
cp apps/admin/.env.example    apps/admin/.env

# 3. Schema + catalogue (26 categories, 30 prompts, 4 plans, 3 articles)
npm run db:setup:local

# 4. Run the three apps in separate terminals
npm run dev:api      # http://127.0.0.1:8787
npm run dev:web      # http://localhost:3000
npm run dev:admin    # http://localhost:5173
```

Seeded accounts (passwords come from `SEED_*` in `apps/api/.dev.vars`):

| Account | Role |
| --- | --- |
| `admin@promptduniya.in` | admin + editor |
| `editor@promptduniya.in` | editor |
| `free@promptduniya.in` | free member |
| `premium@promptduniya.in` | member with a real 365-day subscription |

Deployment is documented in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Scripts

| Command | Effect |
| --- | --- |
| `npm run verify` | typecheck + lint + build, every workspace |
| `npm run dev:api` / `dev:web` / `dev:admin` | run one app locally |
| `npm run provision` | create Cloudflare resources, patch the wrangler configs |
| `npm run db:migrate:local` / `:remote` | apply D1 migrations |
| `npm run db:seed:generate` | compile the TypeScript catalogue to `apps/api/seed/seed.sql` |
| `npm run db:seed:local` / `:remote` | generate, then apply the seed |
| `npm run db:setup:local` / `:remote` | migrate + seed in one step |
| `npm run deploy:api` / `deploy:web` / `deploy:admin` | deploy one app |

## API surface

```
GET    /health

# Auth
POST   /v1/auth/register · login · refresh · logout
GET    /v1/auth/me · /v1/auth/access          (access works for guests too)
POST   /v1/auth/verify-email · forgot-password · reset-password
PUT    /v1/auth/verify-email                  (resend)
GET    /v1/auth/profile      PATCH /v1/auth/profile      PUT /v1/auth/password

# Prompts
GET    /v1/prompts · /v1/prompts/:slug · /sitemap · /collections · /:slug/related
POST   /v1/prompts/copy · like · favorite · view

# Generator
POST   /v1/generator · /random · /save · /unsave
GET    /v1/generator         DELETE /v1/generator/:id

# Catalog (public)
GET    /v1/catalog/categories(/:slug|/slugs|/:id/subcategories) · /tags · /plans · /brand
GET    /v1/catalog/search · /search/suggest · /search/discovery
GET    /v1/catalog/articles(/:slug|/slugs)
POST   /v1/catalog/articles/:id/view · /events · /contact · /reports

# Viewer (signed-in)
GET    /v1/viewer/extras · /notifications · /favorites · /likes · /activity · /usage
PATCH  /v1/viewer/notifications        PUT /v1/viewer/notifications/preferences
DELETE /v1/viewer/favorites/:promptId

# Payments
POST   /v1/payments/order · verify · mock-complete · coupon · subscription/cancel
GET    /v1/payments/history · /subscription

# Admin  (editor for content, admin for money/users/settings)
GET/POST/PUT/PATCH/DELETE  /v1/admin/prompts · categories · articles · plans · coupons
GET    /v1/admin/users · /users/:id       PATCH /v1/admin/users/:id
GET    /v1/admin/reports · comments · contact-messages · moderation/counts
PATCH  /v1/admin/reports/:id · comments/:id · contact-messages/:id
GET    /v1/admin/stats · /stats/series · /logs
GET    /v1/admin/subscriptions · payments · payments/events
POST   /v1/admin/upload                   GET /v1/admin/upload/config
GET    /v1/admin/settings                 PUT /v1/admin/settings

# Machine
POST   /v1/webhooks/razorpay   (HMAC-verified, idempotent, no CORS/auth)
POST   /v1/cron/maintenance    (x-cron-secret; also runs on the cron trigger)
```

## Verification status

Green in CI and locally:

- `tsc --noEmit` clean across all five workspaces
- `eslint` clean at `--max-warnings 0` for web and admin
- `next build` → zero warnings; middleware 39.8 kB; SSG preserved for `/prompt/[slug]` and `/blog/[slug]`
- `opennextjs-cloudflare build` → `.open-next/worker.js`; `wrangler deploy --dry-run` resolves the `API` service binding
- API bundles at ~159 KiB gzip with every binding attached
- Migration + seed applied to a real SQLite database: 36 tables, `PRAGMA foreign_key_check` clean, and re-applying the seed leaves every row count identical (idempotent)

Known gaps, stated plainly:

- **The Workers runtime is not exercised in this environment.** `workerd` cannot start in the build sandbox, so the API's Miniflare integration tests (`apps/api/test/`) have not been run here. They run wherever `workerd` starts normally.
- **`apps/api/test/port-pending/`** holds the monolith's ~3,100-line service suite. It is excluded from typecheck and from `npm test` until it is repointed at the D1 harness; see the README in that folder. The original passing suite remains on `Main`.
- **SSG needs the API reachable at build time.** `generateStaticParams` catches failures and returns an empty list, so a build never breaks — but it also means pre-rendering silently produces nothing if the API is down. Keep it up during CI builds.
