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
GET    /v1/admin/studio/status            POST /v1/admin/studio/draft · studio/run

# AI providers  (admin only; keys are write-only and never returned)
GET    /v1/admin/ai-config                PUT /v1/admin/ai-config
POST   /v1/admin/ai-config/test

# AI content automation  (editor; config is admin-only)
GET    /v1/admin/automation/overview      GET/PUT /v1/admin/automation/config
GET    /v1/admin/automation/queue · queue/counts
POST   /v1/admin/automation/queue         POST .../queue/:id/retry · cancel · approve
POST   /v1/admin/automation/process       GET /v1/admin/automation/runs
GET    /v1/admin/automation/trends        POST .../trends · trends/discover · trends/:id/dismiss
POST   /v1/admin/automation/ideas         GET /v1/admin/automation/logs

# Machine
POST   /v1/webhooks/razorpay   (HMAC-verified, idempotent, no CORS/auth)
POST   /v1/cron/maintenance    (x-cron-secret; also runs on the nightly trigger)
POST   /v1/cron/hourly         (x-cron-secret; also runs on the hourly trigger)
```

## AI providers

Which service writes the prompts, which one draws the covers, which model each
uses, and the API keys they need are all configured from **Admin → AI providers**.
None of it requires a redeploy.

- **Keys** are entered in the console and stored encrypted at rest. They are
  write-only: every endpoint returns whether a key exists, where it came from and
  its last four characters — never the value. A key saved here takes priority over
  a deployed `AI_API_KEY` / `OPENAI_API_KEY` secret, and clearing it falls back to
  that secret, so an existing deployment keeps working untouched.
- **Models** are free text with presets as one-click fills, not a dropdown.
  Providers retire models on their own schedule — this codebase already lost
  production time to a pinned Workers AI model being deprecated — so recovering
  from the next deprecation should be typing an id, not shipping a release. The
  Workers AI entry is a comma-separated chain tried in order for the same reason.
- **Test** sends one throwaway prompt to a named provider and reports the model,
  the latency and the provider's own error. Without it, checking a pasted key meant
  starting a studio run and waiting a minute to learn whether the problem was the
  key, the model id, the quota or the prompt.

Defaults match what the engines previously hardcoded (`gemini-2.0-flash`,
`gpt-4o-mini`, `flux-1-schnell`), so turning this on changes nothing until you
change something.

## AI content automation

The catalogue can fill itself. A pipeline discovers what to write about, writes it,
illustrates it, scores it, and publishes what passes — on a schedule, with no
operator in the loop:

```
trend discovery → idea generation → prompt written → duplicate gate
   → saved as draft → cover image → quality score → publish / schedule / hold
```

Everything is configured from **Admin → Automation**, not from environment
variables, so the posting rate and the quality bar change without a redeploy.

- **Trend discovery** mines four signals in ascending order of cost: the site's own
  search log (searches that returned little — literal unmet demand), copy-to-view
  ratios per category, an Indian festival calendar with lead times, and thin
  categories. A language model then expands the strongest of those into concrete,
  shootable themes. Signals are de-duplicated on a unique normalised key and
  marked used, so a rescan does not re-suggest what the catalogue already covers.
- **The content queue** (`content_queue`) is durable. Each row carries the full
  brief, the stage it reached and its attempt count, so a run survives a closed
  tab, a provider outage and a redeploy — and any item can be retried without
  restating the brief. Claiming is compare-and-swap, so a manual "generate now"
  cannot double-process an item the cron tick is already working on.
- **The quality gate** scores every draft 0–100 against the house style —
  lighting, camera, wardrobe, environment, explicit adult age, prose rather than
  weight syntax, SEO completeness, image present. Scoring is deterministic and
  dependency-free: grading a model with another model would double the cost and
  fail exactly when a quota is exhausted. Safety failures (minors, explicit
  content, a photo-edit prompt that forgets the uploaded face) are *blocking* and
  zero the score outright. Anything below the configured threshold is saved as a
  draft and held for review rather than discarded.
- **Duplicate detection** compares titles by token-set overlap and bodies by
  word-shingle overlap, against a candidate set narrowed in SQL via the existing
  `prompts.search_text` index. This is what stops the catalogue slowly filling
  with near-copies of its own most popular post, which also harms search.
- **Scheduling.** Cloudflare cron expressions are fixed at deploy time, so the
  Worker ticks hourly and the `automation.publish_hours` setting decides which
  ticks generate. A run stops on whichever comes first of `max_per_run` items or
  `run_budget_seconds`, so a tick cannot overrun its invocation.
- **Observability.** `automation_logs` records what the machine did — provider,
  latency, and the error text when it failed — kept separate from `admin_logs`,
  which records what people did. Credentials are stripped before anything is
  written. `automation_runs` records one row per cycle, so six posts appearing
  overnight can be told apart from four cycles that mostly failed.

Defaults are deliberately safe: automation ships **disabled**, with
`publish_mode: draft` and `auto_publish: false`, so installing it cannot publish
machine-written posts before anyone has read one.

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
