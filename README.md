# promptduniya

**Create Better. Imagine More.**

An India-first platform for discovering, generating, saving and monetising AI image prompts. Built with Next.js 15, TypeScript and Drizzle ORM, with a Razorpay-based premium membership.

Every prompt in the library is written for a specific model and names its light source, lens, materials and technical constraints — the things that actually change a result.

---

## Table of contents

1. [What's included](#whats-included)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Database setup](#database-setup)
7. [Seed data and demo accounts](#seed-data-and-demo-accounts)
8. [Local development](#local-development)
9. [Payment configuration](#payment-configuration)
10. [Architecture notes](#architecture-notes)
11. [Security model](#security-model)
12. [Testing](#testing)
13. [Scheduled jobs](#scheduled-jobs)
14. [Deployment](#deployment)
15. [Known limitations](#known-limitations)

---

## What's included

**Discovery**
Prompt library with trending/latest/featured rails, 26 categories, tag browsing, and filtering by AI model, access tier, style, subject and aspect ratio. Search covers titles, prompt bodies, tags, categories and models, with debounced live suggestions and recent/popular search terms.

**Prompt pages**
One SEO-optimised page per prompt with breadcrumb, CreativeWork and FAQ structured data, canonical URLs, Open Graph cards generated on the fly, and four internal-linking blocks (related, same category, same model, trending).

**Creation tools**
An advanced generator with 17 configurable fields that writes in the grammar of the target model — comma clauses plus flags for Midjourney, weighted keyword stacks for Flux and Stable Diffusion, structured prose for Gemini and ChatGPT. Plus a random generator that rolls a complete brief. Both work with **no AI API key**; a configured provider is used only when present.

**Accounts and membership**
Email/password auth with verification, password reset, session management and account lockout. Free and premium tiers with server-enforced daily limits. Razorpay checkout supporting UPI, cards, net banking and wallets, with coupons, subscription lifecycle and a full billing history.

**Admin panel**
Prompt CMS with preview, category and tag management, article CMS, user and role management, plan and price editing, coupon management, payments and webhook inspection, moderation queues, analytics with charts, runtime settings, and an audit log of every privileged action.

**Platform**
Dark/light/system theming, mobile bottom navigation, skeleton loaders, accessible dialogs and forms, PWA manifest with offline shell, dynamic sitemap, robots.txt, seven legal pages, and 175 automated tests.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router), React 19 | Server components keep prompt bodies server-side; SSG for prompt pages |
| Language | TypeScript (strict) | No `any` in application code |
| Styling | Tailwind CSS v4 | CSS-first `@theme`; design tokens defined once in `globals.css` |
| Database | Drizzle ORM over libSQL/SQLite | Zero-setup locally, Turso-compatible in production |
| Auth | Custom sessions + bcrypt | Opaque tokens stored as hashes; revocable server-side |
| Validation | Zod | One schema per endpoint, shared with client forms |
| Payments | Razorpay REST + `node:crypto` HMAC | No SDK needed; signature logic is explicit and testable |
| Tests | Vitest | 175 tests against a real database |

Deliberately **not** used: no charting library (custom SVG), no icon library (inline SVG set), no AWS SDK (SigV4 via `fetch`), no Razorpay SDK. This keeps first-load JS at **103 kB shared**.

---

## Project structure

```
promptduniya/
├── src/
│   ├── app/
│   │   ├── (site)/              # Public pages — home, explore, prompt, category,
│   │   │                        #   search, generator, premium, dashboard, legal
│   │   ├── (auth)/              # Login, register, password reset, verification
│   │   ├── admin/               # Admin panel (role-guarded at the layout level)
│   │   ├── api/                 # Route handlers — auth, prompts, generator,
│   │   │                        #   payments, admin, cron, og
│   │   ├── globals.css          # Design system: tokens, themes, components
│   │   ├── sitemap.ts           # Dynamic sitemap
│   │   ├── robots.ts            # Crawl rules
│   │   └── manifest.ts          # PWA manifest
│   ├── components/
│   │   ├── ui/                  # Button, Badge, Field, Modal, Toast, Skeleton…
│   │   ├── layout/              # Header, Footer, MobileNav, CookieConsent
│   │   ├── prompt/              # PromptCard, PromptGrid, PromptViewer, filters
│   │   ├── generator/           # GeneratorForm, GeneratorResult, RandomGenerator
│   │   ├── premium/             # PricingCard, CheckoutButton
│   │   ├── dashboard/           # Dashboard shell and panels
│   │   ├── admin/              # Admin shell, tables, charts, editors
│   │   └── legal/               # Legal page shell, contact form, article renderer
│   ├── db/
│   │   ├── schema.ts            # 30 tables with indexes and relations
│   │   ├── migrations/          # Generated SQL migrations
│   │   └── migrate.ts           # Migration runner
│   ├── lib/                     # env, crypto, dates, ids, api, rate-limit,
│   │                            #   validation, seo, viewer, auth/*
│   └── services/                # Business logic — one module per domain.
│                                #   Payments, auth, admin and generation are
│                                #   isolated from each other.
├── scripts/
│   ├── seed.ts                  # Idempotent seeder
│   └── seed/                    # Seed content (plans, categories, prompts, articles)
├── tests/                       # 10 Vitest suites
├── public/sw.js                 # Service worker (static shell only)
├── .env.example                 # Every variable, documented
└── DEPLOYMENT.md                # Production deployment guide
```

Business logic lives in `src/services/`. Route handlers only parse input, enforce rate limits, call a service and shape the response — they contain no domain logic.

---

## Quick start

```bash
git clone https://github.com/Tophunt-max/promptduniya.git
cd promptduniya
npm install

cp .env.example .env
# Generate a real secret and paste it into .env as AUTH_SECRET:
openssl rand -base64 48

npm run setup      # generate migrations → apply them → seed data
npm run dev        # http://localhost:3000
```

`npm run setup` is equivalent to `db:generate && db:migrate && db:seed`.

The app is fully functional at this point — no payment gateway, AI key or object storage is required to run it.

---

## Environment variables

`.env.example` documents every variable. Only `AUTH_SECRET` must be set by hand; everything else has a working default.

### Required

| Variable | Notes |
| --- | --- |
| `AUTH_SECRET` | 32+ random bytes. `openssl rand -base64 48`. Signs sessions, keys visitor hashes, authenticates the cron endpoint. |

### Core

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/promptduniya.db` | Local SQLite file, or `libsql://…` for Turso |
| `DATABASE_AUTH_TOKEN` | — | Required for a remote libSQL server |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URLs, OG tags, email links. No trailing slash. |
| `PRIMARY_DOMAIN` | `promptduniya.in` | Never hard-coded in source |
| `AUTH_SESSION_DAYS` | `30` | Session lifetime |
| `AUTH_BCRYPT_ROUNDS` | `12` | Password hashing cost |

### Payments

| Variable | Notes |
| --- | --- |
| `PAYMENTS_MOCK_MODE` | `true` runs the local simulator. Set to `false` in production. |
| `RAZORPAY_KEY_ID` / `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Key id — safe to expose to the browser |
| `RAZORPAY_KEY_SECRET` | **Server only.** Verifies checkout signatures. |
| `RAZORPAY_WEBHOOK_SECRET` | **Server only.** Verifies webhook signatures. |

### Optional integrations

| Variable | Fallback when unset |
| --- | --- |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | Template generator (fully functional) |
| `R2_*` | Uploads written to `public/uploads` |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `SMTP_*` | Emails logged to the server console |
| `REDIS_URL` | In-memory rate limiting |

Prices, plan limits, branding, SEO defaults and feature toggles are **not** environment variables — they live in the database and are edited at `/admin/settings` and `/admin/plans`.

---

## Database setup

```bash
npm run db:generate     # Generate SQL from src/db/schema.ts
npm run db:migrate      # Apply pending migrations
npm run db:seed         # Idempotent — safe to re-run
npm run db:studio       # Drizzle Studio GUI
```

The schema has 30 tables:

- **Identity** — `users`, `roles`, `user_roles`, `profiles`, `sessions`, `auth_tokens`
- **Content** — `prompts`, `prompt_images`, `prompt_tags`, `categories`, `tags`, `articles`, `comments`
- **Engagement** — `likes`, `favorites`, `prompt_views`, `prompt_copies`, `generated_prompts`
- **Billing** — `plans`, `subscriptions`, `payments`, `payment_events`, `transactions`, `entitlements`, `coupons`, `coupon_redemptions`
- **Ops** — `notifications`, `notification_preferences`, `reports`, `contact_messages`, `admin_logs`, `site_settings`, `page_views`, `search_queries`, `analytics_events`, `rate_limit_buckets`

Indexed for the access patterns that matter: slug lookups, category and model filters, published/premium/trending flags, `created_at` ordering, and the denormalised `search_text` column.

Money is stored as integer paise. Timestamps are Unix epoch seconds. Daily counters bucket by IST date, so limits reset at Indian midnight.

---

## Seed data and demo accounts

`npm run db:seed` creates 26 categories, 32 tags, 4 plans, 30 original prompts (5 premium), 3 articles and 4 users. Re-running updates rather than duplicating.

Credentials come from environment variables:

```bash
SEED_ADMIN_EMAIL=admin@promptduniya.in
SEED_ADMIN_PASSWORD=ChangeMe!Admin123
SEED_DEMO_PASSWORD=ChangeMe!Demo123
```

| Account | Role | Purpose |
| --- | --- | --- |
| `admin@promptduniya.in` | admin + editor | Full admin panel at `/admin` |
| `editor@promptduniya.in` | editor | Content only — no prices, roles or settings |
| `free@promptduniya.in` | user | Free tier limits |
| `premium@promptduniya.in` | user | Yearly subscription, 365 days |

The premium demo account gets a **real, date-bounded subscription row** rather than a boolean flag, so it exercises the same entitlement path as a paying customer.

> Change every seeded password before deploying anywhere public.

All 30 prompts, 3 articles and every description are original content written for this project.

---

## Local development

```bash
npm run dev          # Dev server with hot reload
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test         # Vitest, single run
npm run test:watch   # Vitest watch mode
npm run build        # Production build
npm run start        # Serve the production build
npm run verify       # typecheck → lint → test → build
```

Run `npm run verify` before pushing. It is the same gate CI should use.

---

## Payment configuration

### Local and CI (default)

With `PAYMENTS_MOCK_MODE=true`, checkout runs against an in-process provider that **computes real HMAC signatures with the same scheme as Razorpay**. The full path — order creation, signature verification, amount cross-check, webhook idempotency — executes exactly as in production. Only the network call is simulated.

Clicking "Upgrade" calls `/api/payments/mock-complete`, which generates a genuinely signed payload and feeds it through the same `verifyCheckout()` used by live traffic. That endpoint refuses to run the moment real credentials are configured.

### Going live

1. Create a Razorpay account and complete KYC.
2. Copy your keys from **Settings → API Keys**.
3. Set in your production environment:
   ```bash
   PAYMENTS_MOCK_MODE=false
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
   RAZORPAY_KEY_SECRET=your_secret
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   ```
4. Add a webhook in the Razorpay dashboard:
   - **URL:** `https://yourdomain.in/api/payments/webhook`
   - **Events:** `payment.captured`, `payment.authorized`, `payment.failed`, `refund.created`, `refund.processed`, `subscription.cancelled`, `subscription.halted`
   - **Secret:** the same value as `RAZORPAY_WEBHOOK_SECRET`
5. Set prices at `/admin/plans`. The database is the only source of truth for price.
6. Test with a ₹1 plan before opening it up.

Inspect deliveries at `/admin/payments`, which shows each event's signature validity, processing result and idempotency key.

---

## Architecture notes

### Prompt bodies never ship to unauthorised clients

`getPromptBySlug()` takes a `canSeePremium` flag resolved server-side. When false it returns `promptText: null` and the page renders an upgrade panel. There is no hidden text in the DOM to reveal with dev tools — verified by test and by inspecting production HTML.

Copying goes through `POST /api/prompts/copy`, the single point where the entitlement check and daily quota are enforced. That is why prompt bodies are absent from listing payloads entirely.

### Access is computed, never stored

`resolveAccess(userId)` walks: authenticate → load subscription → validate status and dates → resolve entitlements → return limits. `users.premium_cached_until` exists only for rendering badges and is re-validated before anything is granted.

Plan-sourced entitlement grants are joined against their subscription, so cancelling or expiring a subscription revokes access immediately rather than waiting for a sweep job.

### The generator degrades honestly

`GeneratorEngine` is a two-method interface. `TemplateEngine` implements it with no dependencies and real model-specific grammar. Remote providers implement the same interface wrapped in `ResilientEngine`, which falls back to the template engine on failure and labels the result `gemini-fallback:template` — the UI shows that label rather than passing a fallback off as an AI result.

### Runtime configuration

Limits, prices, branding, SEO defaults and toggles live in `site_settings` with a 30-second cache. Changing a free-tier limit at `/admin/settings` takes effect without a deploy. Secrets stay in environment variables and are never editable from the browser.

---

## Security model

| Concern | Implementation |
| --- | --- |
| Passwords | bcrypt, cost 12. No function in the codebase can recover a plaintext password. |
| Sessions | Opaque 32-byte tokens; only a SHA-256 hash is stored. A database leak yields no usable cookies. |
| CSRF | Double-submit cookie token **plus** `Origin`/`Sec-Fetch-Site` checks. Both must pass. |
| Payment amounts | Read from the `plans` table. A tampered request changes nothing — proven by test. |
| Payment signatures | HMAC-SHA256 verified in constant time, then the payment is re-fetched from the provider and its amount compared. |
| Webhook idempotency | Unique index on `(provider, event_key)`. Redelivery is a no-op insert. |
| Authorisation | Role checks on every admin route handler *and* the admin layout. Hidden buttons are never treated as security. |
| Rate limiting | 20 named rules across auth, search, generation, copying, payments and admin. Premium members get a 4× multiplier. |
| Input validation | Zod on every endpoint. Control characters stripped, lengths capped, enums closed. |
| Output escaping | JSON-LD escapes `<`. Article markdown is parsed into React elements — no `dangerouslySetInnerHTML` for user content. |
| Uploads | Size cap, MIME allow-list, and magic-byte sniffing. SVG is rejected because it can carry script. |
| Privacy | No raw IP addresses stored — only keyed hashes. No third-party trackers. |
| Headers | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| Lock-out guard | An admin cannot suspend their own account or remove their own admin role. |

Self-imposed rules that the tests enforce: never trust client-side premium status, prices, roles or payment success; never store plaintext passwords; never hard-code premium access.

---

## Testing

```bash
npm run test
```

**175 tests across 10 suites**, running against a real SQLite database rather than mocks:

| Suite | Covers |
| --- | --- |
| `auth` | Hashing, salting, verification, strength rules, duplicate emails, password change |
| `entitlements` | Premium resolution, expiry, cancellation, lifetime plans, revocation, tier multipliers |
| `engagement` | Daily copy limits, guest limits, premium gating, favourite caps, likes |
| `payments` | Amount authority, forged signatures, cross-user orders, idempotency, refunds, amount mismatch |
| `coupons` | Percentage/fixed discounts, windows, usage caps, per-user caps, plan applicability, minimum spend |
| `generator` | Model-specific grammar, quotas, entitlement gating, history, ownership |
| `prompts` | CRUD, slug de-duplication, draft visibility, filtering, pagination, search, trending |
| `admin` | Role changes, lock-out guards, plan pricing, category deletion guards, settings |
| `rate-limit` | Windows, isolation, multipliers, rollover, headers, limit tightness |
| `security` | Crypto helpers, escaping, validation, upload policy, honeypot |

Notable cases: a client sending `amountMinor: 1` for a ₹99 plan is charged ₹99; a webhook signed over a pretty-printed body is rejected when sent compact; an expired subscription with a stale cached flag is denied.

---

## Scheduled jobs

`POST /api/cron/maintenance` publishes scheduled prompts, recomputes trending scores, expires due subscriptions and sends expiry reminders. Authenticate with `AUTH_SECRET` as a bearer token:

```bash
curl -X POST https://yourdomain.in/api/cron/maintenance \
  -H "Authorization: Bearer $AUTH_SECRET"
```

Hourly is recommended. See `DEPLOYMENT.md` for a Vercel Cron example.

---

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide covering Vercel, Turso, Cloudflare R2, webhooks, cron and a pre-launch checklist.

Short version:

```bash
npm i -g vercel && vercel
# Set env vars in the Vercel dashboard (AUTH_SECRET, DATABASE_URL,
# DATABASE_AUTH_TOKEN, NEXT_PUBLIC_SITE_URL, Razorpay keys)
npm run db:migrate && npm run db:seed   # against production DATABASE_URL
vercel --prod
```

---

## Known limitations

Stated plainly, because the alternative is a nasty surprise later.

1. **Rate limiting is per-instance by default.** The in-memory driver is correct for a single server. On multiple instances each has its own counters, so effective limits multiply. `RateLimitStore` is the seam to implement for Redis — set `RATE_LIMIT_DRIVER=redis` and `REDIS_URL`.

2. **SMTP falls back to console.** The `console` and `resend` providers are implemented. Setting `EMAIL_PROVIDER=smtp` currently logs instead of sending — adding a mail transport is a deployment choice, not a code gap. Use Resend, or add Nodemailer.

3. **Search uses SQL `LIKE` on a denormalised column.** Fast and correct for thousands of prompts. Beyond roughly 50,000 you will want SQLite FTS5 or a dedicated search service. There is no typo tolerance or stemming.

4. **Google OAuth is scaffolded but not wired.** The database columns (`oauth_provider`, `oauth_subject`) and environment variables exist; the callback route is not implemented. Email/password is complete.

5. **No image generation.** This platform produces *prompt text*. You run it in your own AI tool. Cover visuals are original CSS/SVG compositions — deliberately no scraped or copyrighted photography.

6. **Recurring billing is charge-based, not subscription-based.** Each purchase creates a Razorpay *order* and a fixed-length subscription row. It does not yet use Razorpay Subscriptions for automatic recurring debits, so renewal requires the member to pay again. The `subscriptions` table and webhook handlers already model recurring state, so this is an extension rather than a rewrite.

7. **Trending needs the cron job.** Scores are recomputed by `/api/cron/maintenance`, not on every request. Without the scheduler, trending stays as last computed.

8. **Creator uploads are designed but disabled.** `profiles.is_creator`, `creator_approved_at` and prompt authorship exist so creator submissions can be enabled without a migration. No submission UI or revenue sharing is implemented.

9. **Comments are moderated but have no public UI.** The table, moderation queue and admin controls exist; the public comment form does not.

10. **Legal pages are templates, not legal advice.** They accurately describe how this software behaves. Have them reviewed by a professional in your jurisdiction before operating commercially.

11. **Lighthouse scores are not measured here.** The build is optimised for them (103 kB shared JS, SSG prompt pages, AVIF/WebP, no blocking third-party scripts, semantic HTML, visible focus states, reduced-motion support), but no audit was run in this environment. Verify against your own deployment.

---

## Licence and content

Application code is yours to use as you see fit. All prompt text, articles and copy are original work written for this project — nothing is scraped or copied from another site.

Model names (Gemini, ChatGPT, Midjourney, Flux, Stable Diffusion, Leonardo AI, Ideogram) are trademarks of their respective owners and are referenced only to indicate which tool a prompt was written for. This project is not affiliated with, endorsed by, or acting for any AI provider.
