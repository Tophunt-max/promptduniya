# Deployment

Taking promptduniya from a checkout to production on Cloudflare, on your own domain.

Everything runs on Cloudflare: three Workers, D1, KV and R2. The only external services are Razorpay (payments), and optionally an AI provider and Resend (email) — both of which have working no-key fallbacks.

---

1. [Before you start](#before-you-start)
2. [Step 1 — Provision the resources](#step-1--provision-the-resources)
3. [Step 2 — Secrets](#step-2--secrets)
4. [Step 3 — Schema and catalogue](#step-3--schema-and-catalogue)
5. [Step 4 — Deploy](#step-4--deploy)
6. [Step 5 — Custom domains](#step-5--custom-domains)
7. [Step 6 — Razorpay](#step-6--razorpay)
8. [Step 7 — Media on R2](#step-7--media-on-r2)
9. [Step 8 — Email](#step-8--email)
10. [Step 9 — The nightly job](#step-9--the-nightly-job)
11. [Step 10 — First admin login](#step-10--first-admin-login)
12. [Local development](#local-development)
13. [Updating a live deployment](#updating-a-live-deployment)
14. [Pre-launch checklist](#pre-launch-checklist)
15. [Troubleshooting](#troubleshooting)
16. [Rollback](#rollback)

---

## Before you start

You need:

- Node.js 20 or newer
- A Cloudflare account with Workers Paid ($5/mo) — required for **service bindings**, **cron triggers** and R2
- A domain on Cloudflare DNS
- `npx wrangler login` completed

```bash
git clone https://github.com/Tophunt-max/promptduniya.git
cd promptduniya
npm install
npx wrangler login
```

Three Workers get deployed:

| Worker | Serves | Contains |
| --- | --- | --- |
| `promptduniya-api` | `api.yourdomain` | All business logic; owns D1, KV, R2 |
| `promptduniya-web` | `yourdomain` | Public website (Next.js via OpenNext) |
| `promptduniya-admin` | `admin.yourdomain` | Admin console (static SPA) |

---

## Step 1 — Provision the resources

```bash
npm run provision:dry-run   # review what it will do
npm run provision
```

This creates the D1 database, four KV namespaces and the R2 bucket, then writes the returned ids into `apps/api/wrangler.jsonc` and `apps/web/wrangler.jsonc`.

Doing this by hand is the easiest step to get wrong: `apps/api/wrangler.jsonc` contains three identical `REPLACE_WITH_KV_ID` placeholders, and swapping two of them produces a system that works until sessions or rate limits behave strangely. The script matches each binding by name, so the ids cannot be transposed. It is safe to re-run — existing resources are detected and their ids read back.

Commit the resulting config changes; the ids are not secrets.

<details>
<summary>Doing it manually</summary>

```bash
cd apps/api
wrangler d1 create promptduniya
wrangler kv namespace create promptduniya-rate-limit
wrangler kv namespace create promptduniya-sessions
wrangler kv namespace create promptduniya-cache
wrangler kv namespace create promptduniya-next-cache
wrangler r2 bucket create promptduniya-media
```

Then paste: the D1 id into `database_id`; the first three KV ids into the `RATE_LIMIT`, `SESSIONS` and `CACHE` entries of `apps/api/wrangler.jsonc`; and the fourth into `NEXT_INC_CACHE_KV` in `apps/web/wrangler.jsonc`.
</details>

---

## Step 2 — Secrets

Generate one signing key and use it for **both** the API and the website:

```bash
openssl rand -base64 48    # AUTH_SECRET
openssl rand -base64 32    # CRON_SECRET
```

`AUTH_SECRET` must be byte-identical in both Workers. The website verifies the API's JWT signatures locally to avoid a network call per request; if the keys differ, every visitor is treated as signed out.

**API:**

```bash
cd apps/api
wrangler secret put AUTH_SECRET
wrangler secret put CRON_SECRET
wrangler secret put RAZORPAY_KEY_ID
wrangler secret put RAZORPAY_KEY_SECRET
wrangler secret put RAZORPAY_WEBHOOK_SECRET
wrangler secret put AI_API_KEY          # optional
wrangler secret put RESEND_API_KEY      # optional
```

**Website:**

```bash
cd ../web
wrangler secret put AUTH_SECRET         # the same value
wrangler secret put CRON_SECRET         # the same value
```

The admin console takes no secrets. Its only configuration is `VITE_API_BASE_URL`, inlined at build time.

Non-secret settings live in the `vars` blocks of the wrangler configs. Update these in `apps/api/wrangler.jsonc` before deploying:

```jsonc
"WEB_ORIGIN":   "https://yourdomain",
"ADMIN_ORIGIN": "https://admin.yourdomain",
"R2_PUBLIC_URL": "https://media.yourdomain"
```

`WEB_ORIGIN` and `ADMIN_ORIGIN` are the CORS allow-list. The admin console cannot log in until `ADMIN_ORIGIN` matches its real origin exactly, because the refresh cookie is `SameSite=None` and needs credentialed CORS.

In `apps/web/wrangler.jsonc`, set `API_BASE_URL` and `PRIMARY_DOMAIN`. `API_BASE_URL` is only a fallback — the service binding is used in practice — but it must still be a valid absolute URL.

---

## Step 3 — Schema and catalogue

```bash
npm run db:setup:remote
```

That runs the D1 migrations and then applies the seed. The seed is compiled from the TypeScript catalogue in `apps/api/scripts/seed/` into `apps/api/seed/seed.sql`, because D1 only accepts a SQL file.

It ships 26 categories, 30 prompts, 44 tags, 4 plans, 3 articles and four demo accounts. Every statement is an upsert keyed on a natural key, so re-running converges instead of duplicating. Two deliberate exceptions use `DO NOTHING`: **site settings** and **user rows** — a re-seed must never overwrite settings you changed in the admin panel or reset a password.

Set the seed passwords first, or the defaults are used:

```bash
# apps/api/.dev.vars — only read by the generator, never deployed
SEED_ADMIN_EMAIL=you@yourdomain
SEED_ADMIN_PASSWORD=<a strong password>
SEED_DEMO_PASSWORD=<another>
```

To skip the demo content and start empty, run `npm run db:migrate:remote` alone.

---

## Step 4 — Deploy

Order matters. The website declares a service binding to `promptduniya-api`, and that binding cannot resolve until the API exists.

```bash
npm run deploy:api
npm run deploy:web
npm run deploy:admin
```

Verify the API before moving on:

```bash
curl https://promptduniya-api.<your-subdomain>.workers.dev/health
# {"ok":true,"data":{"status":"healthy","ts":...}}
```

`deploy:web` runs `opennextjs-cloudflare build` first, which runs `next build`. **Keep the API reachable during that build**: `generateStaticParams` fetches the prompt and article slugs to pre-render. Failures are caught so the build never breaks, but the pre-render list comes back empty and those pages fall back to on-demand rendering.

For `deploy:admin`, point the SPA at the API first:

```bash
cd apps/admin
echo 'VITE_API_BASE_URL=https://api.yourdomain' > .env.production
npm run build && npm run deploy
```

---

## Step 5 — Custom domains

In the Cloudflare dashboard, under each Worker → **Settings → Domains & Routes → Add custom domain**:

| Worker | Domain |
| --- | --- |
| `promptduniya-web` | `yourdomain` and `www.yourdomain` |
| `promptduniya-api` | `api.yourdomain` |
| `promptduniya-admin` | `admin.yourdomain` |

For R2 media, open the bucket → **Settings → Public access → Connect custom domain** → `media.yourdomain`.

Then reconcile the config with reality:

- `apps/api/wrangler.jsonc` → `WEB_ORIGIN`, `ADMIN_ORIGIN`, `R2_PUBLIC_URL`
- `apps/web/wrangler.jsonc` → `API_BASE_URL`, `PRIMARY_DOMAIN`, and `NEXT_PUBLIC_SITE_URL` in `apps/web/.env.production`
- `apps/admin/public/_headers` → the `connect-src` in the CSP must list `https://api.yourdomain`, otherwise the browser blocks every admin request
- `apps/admin/.env.production` → `VITE_API_BASE_URL`

Redeploy all three afterwards.

---

## Step 6 — Razorpay

1. Create a Razorpay account and complete KYC (required for live keys).
2. Copy the Key ID and Key Secret from **Settings → API Keys**.
3. Add a webhook at **Settings → Webhooks**:
   - URL: `https://api.yourdomain/v1/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`, `refund.processed`, `subscription.charged`, `subscription.cancelled`
   - Copy the signing secret.
4. Store all three as API secrets (Step 2), then flip `"PAYMENTS_MOCK_MODE": "false"` in `apps/api/wrangler.jsonc` and redeploy.

While `PAYMENTS_MOCK_MODE` is `true`, `POST /v1/payments/mock-complete` simulates a purchase. It is not a shortcut: it generates a genuinely signed payload and runs it through the same `verifyCheckout` path as production, so the signature check, amount cross-check and idempotency logic are all exercised. It refuses to run once real credentials are configured.

The webhook route is mounted outside the CORS and auth middleware; its authenticity comes from the HMAC signature alone. Deliveries are recorded in `payment_events` with a unique `(provider, event_key)`, so a replayed delivery is a no-op — visible in the admin console under **Billing → Webhook log**.

---

## Step 7 — Media on R2

The bucket is created in Step 1 and bound to the API as `MEDIA`. Uploads go through `POST /v1/admin/upload`, which validates the size cap (8 MB), the MIME allow-list, and the file's **magic bytes** — a renamed executable is rejected even if it claims to be a PNG.

The website never holds bucket credentials. It streams the multipart body to the API, which performs the write.

After connecting `media.yourdomain`, set `R2_PUBLIC_URL` to it and redeploy the API. `apps/web/next.config.ts` already allow-lists `media.promptduniya.in` under `images.remotePatterns` — change that to your own host or `next/image` will refuse to optimise your media.

---

## Step 8 — Email

`EMAIL_PROVIDER` in `apps/api/wrangler.jsonc` selects the adapter:

- `console` (default) — writes the message to the Worker log. Verification and reset links are fully usable; `wrangler tail` to read them. No account needed.
- `resend` — set `RESEND_API_KEY` as a secret and `EMAIL_FROM` in `vars`. Verify your sending domain in Resend first, or delivery fails silently.

Called over `fetch`, so no SDK is bundled.

---

## Deploying (all three Workers)

```bash
export CLOUDFLARE_API_TOKEN=...     # 'Edit Cloudflare Workers' template, 40 chars
export CLOUDFLARE_ACCOUNT_ID=...    # 32 hex characters
# or, instead of both:  npx wrangler login

npm run deploy                      # migrate, then api → web → admin
npm run deploy -- api               # one app only
npm run deploy -- --skip-migrate
```

Three things about this deployment are easy to get wrong by hand, which is why
`scripts/deploy.sh` exists rather than three `wrangler deploy` calls:

- **Order.** `apps/web` holds a service binding to `promptduniya-api`, so the API
  has to go first. Deploying the website first is not a hard error — it is a site
  that half works, which is harder to notice.
- **Migrations.** The Worker has to be deployed *after* its migrations reach the
  remote D1, or every automation endpoint throws "no such table" while the console
  looks healthy. They are additive, so applying them first is safe.
- **The web build.** `next build` alone is not deployable; Cloudflare needs the
  bundle from `opennextjs-cloudflare build`.

The script verifies the API token against Cloudflare before doing anything, warns
about missing Worker secrets, and stops without deploying if a migration fails.

---

## Step 9 — The scheduled jobs

`apps/api/wrangler.jsonc` declares two cron triggers. Both register on deploy with
no extra setup, and `scheduled()` dispatches on which expression fired.

| Expression | When | What it does |
|---|---|---|
| `30 19 * * *` | 19:30 UTC / 01:00 IST | Nightly maintenance: recompute trending scores, expire lapsed subscriptions, warn members whose plan ends within five days, release abandoned queue items, and purge automation logs past their retention window. |
| `0 * * * *` | Every hour | Publish prompts whose scheduled time has passed, then tick the content automation. |

Publishing runs hourly rather than nightly because `prompts.scheduled_for` is
stored to the second: while it only ran at 19:30 UTC, a prompt scheduled for 09:00
did not appear until 01:00 the following morning.

The hourly tick is also what makes the automation schedule editable. Cron
expressions are fixed at deploy time, so the Worker wakes every hour and the
`automation.publish_hours` setting decides which of those wake-ups actually
generate. **Change the posting schedule from Admin → Automation, not from
`wrangler.jsonc`.**

To run either on demand:

```bash
curl -X POST https://api.yourdomain/v1/cron/maintenance \
  -H "x-cron-secret: $CRON_SECRET"

curl -X POST https://api.yourdomain/v1/cron/hourly \
  -H "x-cron-secret: $CRON_SECRET"
```

Confirm both are registered under the Worker → **Settings → Trigger Events**.

### Turning the automation on

It ships disabled, so nothing is generated until you say so:

1. Set a text provider. Workers AI is the default and needs no key; `AI_API_KEY`
   (Gemini) or `OPENAI_API_KEY` follow the JSON schema more reliably, which
   matters because the pipeline parses the reply. Check readiness on the
   Automation screen's provider card.
2. Open **Admin → Automation → Controls**, press **Discover** on the Trends tab to
   seed some topics, then **Generate now** to watch one cycle end to end.
3. Review what it produced under the Queue tab. Anything scoring below the
   threshold is held as a draft with the failed checks listed.
4. Only once you are happy with the output: tick **Automation enabled**, and
   separately **Auto-publish posts that pass**. Leaving auto-publish off gives you
   a pipeline that generates continuously and still waits for a human.

---

## Step 10 — First admin login

Sign in at `https://admin.yourdomain` with the seeded admin account, then immediately:

1. **Change the password** — the seed defaults are in a public repository.
2. **Settings** → set the site name, tagline, contact email and social links. Check the integration badges read `razorpay` and, if configured, `configured` for AI.
3. **Plans** → confirm the prices. These are the authoritative amounts; the client never supplies a price at checkout.
4. **Users** → delete or suspend the `free@`, `editor@` and `premium@` demo accounts.

If you seeded on a schema without any admin, promote an existing account directly:

```bash
cd apps/api
wrangler d1 execute promptduniya --remote --command \
  "INSERT INTO user_roles (user_id, role_id, created_at)
   SELECT u.id, r.id, unixepoch() FROM users u, roles r
   WHERE u.email_normalized = 'you@yourdomain' AND r.name = 'admin'
   ON CONFLICT DO NOTHING"
```

---

## Local development

```bash
npm install
npm run provision                                    # or reuse existing resources

cp apps/api/.dev.vars.example apps/api/.dev.vars      # set AUTH_SECRET
cp apps/web/.env.example      apps/web/.env           # the same AUTH_SECRET
cp apps/admin/.env.example    apps/admin/.env

npm run db:setup:local                                # local D1 in .wrangler/

npm run dev:api      # 127.0.0.1:8787   Worker with local D1/KV/R2
npm run dev:web      # localhost:3000   next dev, with local bindings
npm run dev:admin    # localhost:5173
```

`apps/web/next.config.ts` calls `initOpenNextCloudflareForDev()`, so `next dev` gets the same local bindings the deployed Worker sees — including the `API` service binding. Local development therefore uses the same transport as production rather than a divergent HTTP path.

To run the website in the actual Workers runtime instead of Node:

```bash
npm run preview --workspace apps/web
```

Before pushing:

```bash
npm run verify     # typecheck + lint + build, all workspaces
```

---

## Updating a live deployment

```bash
git pull
npm install
npm run verify

npm run db:migrate:remote      # only if packages/db/migrations changed
npm run deploy:api
npm run deploy:web
npm run deploy:admin
```

Schema changes:

```bash
# edit packages/db/src/schema.ts, then
npm run db:generate            # writes a new migration
npm run db:migrate:local       # try it locally first
npm run db:migrate:remote
```

Apply migrations **before** deploying the API when a change is additive, and deploy first when it is destructive — otherwise the running Worker briefly queries columns that no longer exist.

---

## Pre-launch checklist

**Security**

- [ ] `AUTH_SECRET` is 32+ random bytes and identical in both Workers
- [ ] `CRON_SECRET` set in both
- [ ] Seeded demo accounts removed or suspended; admin password changed
- [ ] `WEB_ORIGIN` / `ADMIN_ORIGIN` are exact production origins — no wildcards
- [ ] `PAYMENTS_MOCK_MODE` is `"false"`
- [ ] Admin CSP `connect-src` lists your real API host

**Payments**

- [ ] Live Razorpay keys stored as secrets
- [ ] Webhook registered and its secret stored
- [ ] One real ₹1 purchase completed end to end, premium granted, receipt visible in **Billing**
- [ ] Refund tested; entitlement revoked

**Content and SEO**

- [ ] Plans priced correctly
- [ ] `NEXT_PUBLIC_SITE_URL` matches the live domain (drives canonicals, sitemap, Open Graph)
- [ ] `/sitemap.xml` and `/robots.txt` resolve and list real URLs
- [ ] A premium prompt viewed while signed out shows the paywall and **no prompt text in the HTML source**

**Operations**

- [ ] Cron trigger listed under Trigger Events
- [ ] `/health` returns `ok`
- [ ] Custom domains resolve over HTTPS, including `media.`
- [ ] Observability enabled (it is on by default in all three configs)

---

## Troubleshooting

**Website shows every visitor as signed out.** `AUTH_SECRET` differs between the two Workers. The website verifies the JWT locally; a mismatched key fails every verification silently. Re-set both from the same value and redeploy.

**Admin login fails with a CORS or network error.** `ADMIN_ORIGIN` in the API config must equal the admin origin exactly, scheme included. The refresh cookie is `SameSite=None`, which requires credentialed CORS and an exact origin match — a wildcard will not work.

**Admin loads but every request 401s.** The refresh cookie is scoped `Path=/v1/auth`. Confirm the SPA is calling the API host directly (`VITE_API_BASE_URL`) and not a proxy that strips cookies.

**Deep links into the admin console 404.** `not_found_handling: "single-page-application"` is missing from `apps/admin/wrangler.jsonc`. Without it, only `/` resolves.

**Website deploy fails on the service binding.** Deploy the API first; the binding cannot resolve against a Worker that does not exist.

**Pages render but lists are empty.** The API was unreachable during `next build`, so pre-rendering produced nothing. The service binding also only exists in the deployed Worker — during a CI build the HTTP transport is used, so `API_BASE_URL` must be publicly reachable from the build environment.

**`no such table` from D1.** Migrations have not been applied to that database. Run `npm run db:migrate:remote`, and note `--local` and `--remote` are separate databases.

**Uploads rejected as "not a valid image".** The magic-byte check failed. The file is not actually a JPEG/PNG/WebP/AVIF/GIF regardless of its extension.

**Rate limits feel too aggressive.** Limits are per named rule in `apps/api/src/lib/rate-limit.ts` and are multiplied per viewer tier (4× premium, 2× signed-in, 1× guest).

**Logs:** `npx wrangler tail --name promptduniya-api` (or `-web`).

---

## Rollback

```bash
# List and roll back to a previous version
npx wrangler deployments list --name promptduniya-api
npx wrangler rollback --name promptduniya-api
```

Roll back the API and website together when their contract changed — the website's local JWT verification and the API's token claims must stay in step.

D1 has no automatic rollback. Before a destructive migration:

```bash
npx wrangler d1 export promptduniya --remote --output backup.sql
```

Take that export as part of any release that drops or renames a column.
