# Deployment guide

How to take promptduniya from a local checkout to a production deployment on your own domain.

The reference stack is **Vercel + Turso + Cloudflare R2 + Razorpay + Resend**. Every piece is swappable; the seams are documented below.

---

## Table of contents

1. [Before you start](#before-you-start)
2. [Step 1 — Database (Turso)](#step-1--database-turso)
3. [Step 2 — Generate secrets](#step-2--generate-secrets)
4. [Step 3 — Deploy to Vercel](#step-3--deploy-to-vercel)
5. [Step 4 — Run migrations and seed](#step-4--run-migrations-and-seed)
6. [Step 5 — Custom domain](#step-5--custom-domain)
7. [Step 6 — Razorpay](#step-6--razorpay)
8. [Step 7 — Object storage (R2)](#step-7--object-storage-r2)
9. [Step 8 — Transactional email](#step-8--transactional-email)
10. [Step 9 — Scheduled jobs](#step-9--scheduled-jobs)
11. [Step 10 — Admin setup](#step-10--admin-setup)
12. [Rate limiting at scale](#rate-limiting-at-scale)
13. [Alternative platforms](#alternative-platforms)
14. [Pre-launch checklist](#pre-launch-checklist)
15. [Post-launch monitoring](#post-launch-monitoring)
16. [Troubleshooting](#troubleshooting)
17. [Rollback](#rollback)

---

## Before you start

Verify the build passes locally. This is the same gate CI should enforce:

```bash
npm run verify   # typecheck → lint → test → build
```

All four must pass. Do not deploy a failing build.

You will need accounts for: a host (Vercel), a database (Turso), and — only if you are charging money — Razorpay with completed KYC.

---

## Step 1 — Database (Turso)

Local development uses a SQLite file. Production needs a hosted libSQL server so multiple instances share one database.

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup

turso db create promptduniya --location bom   # bom = Mumbai
turso db show promptduniya --url              # → libsql://promptduniya-xxx.turso.io
turso db tokens create promptduniya           # → your auth token
```

Choose a region close to your users. `bom` (Mumbai) is the right default for an India-focused product — it keeps query latency low for the majority of traffic.

Keep both values for the next step.

---

## Step 2 — Generate secrets

```bash
openssl rand -base64 48
```

This becomes `AUTH_SECRET`. It signs sessions, keys the visitor hashes used for privacy-preserving analytics, and authenticates the cron endpoint.

Rules:
- Generate a **new** value for production. Never reuse a development secret.
- Changing it later signs out every user and invalidates pending verification links.
- Store it in your host's secret manager, never in the repository.

---

## Step 3 — Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel          # link the project, accept the detected Next.js settings
```

Then add environment variables in **Project → Settings → Environment Variables** (Production scope):

| Variable | Value |
| --- | --- |
| `AUTH_SECRET` | From step 2 |
| `DATABASE_URL` | `libsql://promptduniya-xxx.turso.io` |
| `DATABASE_AUTH_TOKEN` | From step 1 |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.in` — no trailing slash |
| `NEXT_PUBLIC_SITE_NAME` | `promptduniya` |
| `NEXT_PUBLIC_SITE_TAGLINE` | `Create Better. Imagine More.` |
| `PRIMARY_DOMAIN` | `yourdomain.in` |
| `NODE_ENV` | `production` |
| `PAYMENTS_MOCK_MODE` | `true` for now — flip to `false` in step 6 |
| `SEED_ADMIN_EMAIL` | Your real admin email |
| `SEED_ADMIN_PASSWORD` | A strong password you generate |

`NEXT_PUBLIC_SITE_URL` must be exact. It drives canonical URLs, Open Graph tags, email links and the CSRF origin check. A trailing slash or a wrong protocol will cause subtle breakage.

---

## Step 4 — Run migrations and seed

Migrations run from your machine against the production database:

```bash
export DATABASE_URL="libsql://promptduniya-xxx.turso.io"
export DATABASE_AUTH_TOKEN="your-token"
export AUTH_SECRET="the-same-secret-as-production"
export SEED_ADMIN_EMAIL="you@yourdomain.in"
export SEED_ADMIN_PASSWORD="a-strong-password"

npm run db:migrate
npm run db:seed
```

`AUTH_SECRET` must match production, because the seeder hashes the admin password with it in scope.

The seeder is idempotent — safe to re-run after adding prompts or categories. It updates existing rows rather than duplicating them, and it will not overwrite settings you have changed in the admin panel.

**If you do not want the demo accounts in production**, remove them afterwards:

```bash
turso db shell promptduniya \
  "delete from users where email_normalized in
   ('editor@promptduniya.in','free@promptduniya.in','premium@promptduniya.in');"
```

Then deploy:

```bash
vercel --prod
```

---

## Step 5 — Custom domain

1. In Vercel: **Project → Settings → Domains → Add** → `yourdomain.in`.
2. At your registrar, add the DNS records Vercel shows (an `A` record for the apex, `CNAME` for `www`).
3. Wait for propagation. TLS is provisioned automatically.
4. Update `NEXT_PUBLIC_SITE_URL` and `PRIMARY_DOMAIN` to the live domain and redeploy.

HSTS is already set with a two-year max-age and `preload`. Only submit to the [HSTS preload list](https://hstspreload.org) once you are certain you will never need plain HTTP on this domain.

---

## Step 6 — Razorpay

Skip this if you are not charging money yet — the platform runs fine with `PAYMENTS_MOCK_MODE=true`.

### Get your keys

1. Sign up at [razorpay.com](https://razorpay.com) and complete KYC (needs PAN, bank account and business documents; approval typically takes 2–3 working days).
2. **Settings → API Keys → Generate Live Key.** The secret is shown once — store it immediately.

### Configure the webhook

**Settings → Webhooks → Add New Webhook**

- **URL:** `https://yourdomain.in/api/payments/webhook`
- **Secret:** generate a strong random string; you will set it as `RAZORPAY_WEBHOOK_SECRET`
- **Active events:**
  - `payment.captured`
  - `payment.authorized`
  - `payment.failed`
  - `refund.created`
  - `refund.processed`
  - `subscription.cancelled`
  - `subscription.halted`

### Set the environment variables

```bash
PAYMENTS_MOCK_MODE=false
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
PAYMENTS_CURRENCY=INR
```

`RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` hold the same value. The key id is public by design (Checkout needs it in the browser); the **secret must never** be given a `NEXT_PUBLIC_` prefix.

Redeploy after setting these.

### Set prices

Go to `/admin/plans` and set real prices. Seeded defaults are ₹99 monthly, ₹699 yearly and ₹1,999 lifetime — treat them as placeholders and price for your own market.

The database is the only source of truth for price. The server reads it at order creation and ignores anything the browser sends.

### Verify before opening up

1. Create a temporary ₹1 plan at `/admin/plans`.
2. Buy it with a real payment method.
3. Confirm at `/admin/payments` that the payment shows `captured` and the webhook shows a **valid** signature and `Handled` status.
4. Confirm the account shows premium at `/admin/users`.
5. Refund it from the Razorpay dashboard, then confirm the webhook revoked access.
6. Deactivate the ₹1 plan.

Do not skip step 5 — a working refund path is what turns a chargeback into a support ticket.

---

## Step 7 — Object storage (R2)

Without this, uploads go to `public/uploads`, which does not survive a redeploy on a serverless host. Configure it before uploading real cover images.

```bash
# Cloudflare dashboard → R2 → Create bucket → "promptduniya-media"
# → Manage R2 API Tokens → Create (Object Read & Write)
# → Bucket → Settings → Public access → enable, note the r2.dev URL
```

```bash
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=promptduniya-media
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

For a custom media domain, connect one in R2 bucket settings and use it as `R2_PUBLIC_URL`. If you use a hostname other than `*.r2.dev`, add it to `images.remotePatterns` in `next.config.ts` so `next/image` will optimise it.

Any S3-compatible provider works — the adapter signs requests with SigV4 directly. Only `R2_ACCOUNT_ID` is Cloudflare-specific (it forms the endpoint hostname).

Verify by uploading an image at `/admin/media` and confirming the returned URL is on your R2 domain.

---

## Step 8 — Transactional email

Without this, verification and reset links are written to the server log — workable for a soft launch, unworkable for real users.

**Resend** is implemented and needs no extra dependency:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="promptduniya <no-reply@yourdomain.in>"
```

Verify your sending domain in Resend and add the DKIM/SPF records they provide, or your mail will land in spam.

> `EMAIL_PROVIDER=smtp` currently falls back to console logging. Adding a mail transport is a deployment choice — install Nodemailer and implement `SmtpAdapter` in `src/services/mailer.ts` if you prefer SMTP. The `EmailAdapter` interface is the only thing you need to satisfy.

Test by registering a new account and confirming the verification email arrives.

---

## Step 9 — Scheduled jobs

`/api/cron/maintenance` publishes scheduled prompts, recomputes trending scores, expires due subscriptions and sends expiry reminders. Without it, trending never updates and expired subscriptions keep their entitlements until someone triggers a sweep.

Add `vercel.json` at the repository root:

```json
{
  "crons": [
    {
      "path": "/api/cron/maintenance",
      "schedule": "0 * * * *"
    }
  ]
}
```

Vercel Cron sends a `GET` without an `Authorization` header, so also set:

```bash
CRON_SECRET=<the same value as AUTH_SECRET>
```

Vercel forwards `CRON_SECRET` as a bearer token automatically. On other platforms, call it yourself:

```bash
# crontab -e — hourly
0 * * * * curl -fsS -X POST https://yourdomain.in/api/cron/maintenance \
  -H "Authorization: Bearer $AUTH_SECRET" > /dev/null
```

The endpoint mutates subscription state, so it is authenticated with a constant-time comparison against `AUTH_SECRET`. Never expose it unauthenticated.

Verify manually once:

```bash
curl -X POST https://yourdomain.in/api/cron/maintenance \
  -H "Authorization: Bearer $AUTH_SECRET"
```

You should get a JSON summary of counts.

---

## Step 10 — Admin setup

1. Sign in at `/login` with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
2. **Change the password immediately** at `/dashboard/settings`.
3. Work through `/admin/settings`:
   - Site name, tagline, primary domain, logo
   - SEO title template and default meta description
   - Free and guest daily limits
   - Contact email and social links
   - Confirm "Accept payments" is on and maintenance mode is off
4. Set real prices at `/admin/plans`.
5. Review the seeded prompts at `/admin/prompts` — keep, edit or unpublish them as you see fit.
6. Check `/admin` for anything in "Needs your attention".

Every privileged action is recorded at `/admin/logs`, including price and role changes.

### Roles

- **admin** — everything, including prices, roles and settings
- **editor** — content only: prompts, categories, tags, articles, moderation
- **creator** — reserved for future creator submissions
- **user** — standard member

Grant the narrowest role that works. Assign roles at `/admin/users`. An admin cannot suspend their own account or remove their own admin role, so you cannot lock yourself out through the UI.

---

## Rate limiting at scale

The default in-memory limiter is correct on a single instance. On serverless or multi-instance hosting, each instance keeps its own counters, so effective limits multiply by the instance count.

This matters most for `login`, `signup` and `passwordReset`. For a small deployment it is usually acceptable. Past that, implement the `RateLimitStore` interface in `src/lib/rate-limit.ts` — it has two methods, `hit()` and `reset()` — back it with Redis, and set:

```bash
RATE_LIMIT_DRIVER=redis
REDIS_URL=rediss://...
```

Nothing else in the application needs to change; `consume()` and `enforce()` go through the store.

---

## Alternative platforms

### Docker

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
```

Run migrations as a separate step before starting containers, not in the entrypoint — concurrent containers racing on migrations will corrupt state.

### Railway, Render, Fly.io

All work with the standard Next.js build. Set the same environment variables, use `npm run build` and `npm start`, and run `npm run db:migrate` as a release command.

### Self-hosted VPS

Use a process manager (`pm2` or a systemd unit) plus Nginx or Caddy as a TLS-terminating reverse proxy. Ensure the proxy forwards `X-Forwarded-For`, or client IP detection — and therefore anonymous rate limiting — will see every request as coming from one address.

With a single instance you can keep `DATABASE_URL=file:./data/promptduniya.db`. Back that file up.

---

## Pre-launch checklist

**Security**

- [ ] `AUTH_SECRET` is freshly generated, 32+ bytes, and not the development value
- [ ] Every seeded password changed; demo accounts removed or given real passwords
- [ ] `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are set and **not** `NEXT_PUBLIC_`
- [ ] `.env` is not committed (`git check-ignore .env` prints `.env`)
- [ ] HTTPS works; `http://` redirects to `https://`
- [ ] Security headers present: `curl -sI https://yourdomain.in | grep -i content-security`
- [ ] `/admin` redirects an anonymous visitor to `/login`
- [ ] A non-admin account is refused at `/admin` (403 page)

**Payments**

- [ ] `PAYMENTS_MOCK_MODE=false` in production
- [ ] `/api/payments/mock-complete` returns 403 — confirms the simulator is off
- [ ] Prices set at `/admin/plans` and correct on `/premium`
- [ ] A real ₹1 payment captured, verified, and visible at `/admin/payments`
- [ ] Webhook shows a valid signature and `Handled` status
- [ ] A refund revoked access
- [ ] Refund policy reflects your actual practice

**Content and SEO**

- [ ] `NEXT_PUBLIC_SITE_URL` matches the live domain exactly
- [ ] `https://yourdomain.in/sitemap.xml` lists your prompts
- [ ] `https://yourdomain.in/robots.txt` disallows `/admin`, `/api/` and `/dashboard`
- [ ] A prompt page has a correct canonical URL and JSON-LD (test in Google Rich Results)
- [ ] Open Graph preview renders (test with a real share on WhatsApp)
- [ ] Sitemap submitted to Google Search Console
- [ ] Legal pages reviewed and contact details correct

**Functionality**

- [ ] Register → verification email arrives → verify works
- [ ] Password reset end to end
- [ ] Copy a prompt; confirm the daily limit triggers at the configured count
- [ ] A premium prompt shows the upgrade panel to a free account
- [ ] Generator produces a prompt for each of Gemini, Midjourney and Flux
- [ ] Random generator rolls and re-rolls
- [ ] Save/unsave and like/unlike persist across reload
- [ ] Contact form delivers to `/admin/messages`
- [ ] Cron endpoint returns a JSON summary
- [ ] Dark and light mode both look right
- [ ] Tested at 320px, 390px, 768px and 1280px

**Operations**

- [ ] Database backups configured (`turso db shell <db> ".dump" > backup.sql`)
- [ ] Cron scheduled and confirmed running
- [ ] Uptime monitoring on `/` and `/api/payments/webhook`
- [ ] You know how to roll back (below)

---

## Post-launch monitoring

**Daily for the first week**

- `/admin` — the "Needs your attention" panel
- `/admin/payments` — any failed payments or invalid webhook signatures
- Host error logs

**Weekly**

- `/admin/analytics` — conversion rate, view-to-copy rate, top searches
- `/admin/moderation` — reports and comments
- Top search terms with zero results — they tell you which prompts to write next

**Watch for**

| Signal | Likely cause |
| --- | --- |
| Invalid webhook signatures | `RAZORPAY_WEBHOOK_SECRET` mismatch between Razorpay and your environment |
| Payments stuck at `created` | Webhook not reaching your server — check the URL and Razorpay's delivery log |
| Users reporting lost sessions | `AUTH_SECRET` changed, or instances have different values |
| Trending never changing | Cron not running |
| Verification emails missing | `EMAIL_PROVIDER` unset, or sending domain unverified |

**Backups**

```bash
turso db shell promptduniya ".dump" > "backup-$(date +%F).sql"
```

Automate this. Test a restore before you need one.

---

## Troubleshooting

**Build fails with "Invalid environment configuration"**
`AUTH_SECRET` is missing or shorter than 16 characters. Set it in your host's environment variables, not just locally.

**"attempt to write a readonly database"**
`DATABASE_AUTH_TOKEN` is missing or lacks write permission. Regenerate with `turso db tokens create promptduniya`.

**Payment succeeds but premium is not granted**
Check `/admin/payments` → Webhook deliveries. If the signature is rejected, the secret does not match. If nothing arrived, the webhook URL is wrong or unreachable. The payment is recoverable — replay it from the Razorpay dashboard once fixed.

**"Your session token is missing or stale" on every form**
`NEXT_PUBLIC_SITE_URL` does not match the browsing origin, so the CSRF origin check fails. Make them identical, including protocol and no trailing slash.

**Uploads vanish after redeploy**
Object storage is not configured, so files went to `public/uploads`, which is ephemeral. Configure R2 (step 7).

**Rate limits feel too generous**
Expected on multi-instance hosting with the in-memory driver. See [Rate limiting at scale](#rate-limiting-at-scale).

**Images not optimised**
The host is not in `images.remotePatterns` in `next.config.ts`. Add your media domain and redeploy.

**Prompt pages return 404 after seeding**
Prompt pages are statically generated. Redeploy, or rely on the 10-minute `revalidate` window.

---

## Rollback

```bash
# Vercel: promote the previous deployment
vercel rollback

# Or from the dashboard: Deployments → pick the last good one → Promote to Production
```

Rolling back code does **not** roll back the database. Migrations in this project are additive, so an older build generally runs fine against a newer schema. If you need to reverse a destructive migration, restore from a backup:

```bash
turso db shell promptduniya < backup-YYYY-MM-DD.sql
```

Take a backup before every migration that drops or renames a column.

---

Anything unclear or broken in this guide is worth reporting — deployment docs rot faster than code.
