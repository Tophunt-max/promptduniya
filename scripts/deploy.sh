#!/usr/bin/env bash
#
# Deploys all three Workers to Cloudflare, in the order they depend on each other.
#
#   ./scripts/deploy.sh              # migrate, then deploy api, web, admin
#   ./scripts/deploy.sh api          # one app only
#   ./scripts/deploy.sh --skip-migrate
#
# Why a script rather than three `wrangler deploy` calls
# ------------------------------------------------------
# Three things about this deployment are easy to get wrong by hand, and two of
# them fail silently:
#
#   order       apps/web holds a service binding to `promptduniya-api`. Deploying
#               the website first against an older API is not a hard error — it is
#               a site that half works, which is worse.
#
#   migrations  The automation feature added 0002_content_automation.sql. Deploying
#               the Worker without applying it to the *remote* D1 leaves every
#               automation endpoint throwing "no such table" while the console
#               looks perfectly healthy. Migrations here are additive, so they are
#               safe to apply before the code that reads them.
#
#   web build   `npm run build` in apps/web runs `next build`, which is not
#               deployable on its own. Cloudflare needs the OpenNext bundle from
#               `opennextjs-cloudflare build`.
#
# Credentials come from CLOUDFLARE_API_TOKEN, or from an interactive
# `wrangler login`. The token is verified up front, because every failure mode
# after that point is far less obvious than a 401.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

SKIP_MIGRATE=0
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=1 ;;
    api|web|admin)  TARGETS+=("$arg") ;;
    -h|--help)      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# No app named means all of them, in dependency order.
if [ ${#TARGETS[@]} -eq 0 ]; then TARGETS=(api web admin); fi

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

wants() { for t in "${TARGETS[@]}"; do [ "$t" = "$1" ] && return 0; done; return 1; }

# ---------------------------------------------------------------- credentials

step "Checking Cloudflare credentials"

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  # Verified against the API rather than merely checked for presence. A token that
  # is set but malformed produces confusing per-command errors much later on.
  http=$(curl -s -o /tmp/pd-cf-verify.json -w '%{http_code}' \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    https://api.cloudflare.com/client/v4/user/tokens/verify || echo 000)

  if [ "$http" != "200" ]; then
    echo "Cloudflare rejected CLOUDFLARE_API_TOKEN (HTTP $http):"
    sed -e 's/^/    /' /tmp/pd-cf-verify.json 2>/dev/null | head -5
    echo
    die "Create a token with the 'Edit Cloudflare Workers' template at
        https://dash.cloudflare.com/profile/api-tokens
        A Workers API token is 40 characters. Then:
          export CLOUDFLARE_API_TOKEN=...
          export CLOUDFLARE_ACCOUNT_ID=...   # 32 hex characters
        Or drop the token entirely and run: npx wrangler login"
  fi
  echo "API token verified."
else
  # Falls back to whatever `wrangler login` stored.
  (cd apps/api && npx wrangler whoami >/dev/null 2>&1) \
    || die "No Cloudflare credentials. Either set CLOUDFLARE_API_TOKEN or run: npx wrangler login"
  echo "Using the credentials from wrangler login."
fi

# ------------------------------------------------------------------- secrets

if wants api; then
  step "Checking Worker secrets"
  existing=$( (cd apps/api && npx wrangler secret list 2>/dev/null) || echo '[]' )

  for name in AUTH_SECRET CRON_SECRET; do
    if ! printf '%s' "$existing" | grep -q "\"$name\""; then
      warn "$name is not set on promptduniya-api. The API will fail at runtime."
      warn "  cd apps/api && npx wrangler secret put $name"
    fi
  done

  # Deliberately not warned about: AI_API_KEY and OPENAI_API_KEY. Those are now
  # configurable from Admin → AI providers and no longer need to be secrets.
fi

# ------------------------------------------------------------------ migrate

if [ "$SKIP_MIGRATE" -eq 0 ] && wants api; then
  step "Applying D1 migrations to the remote database"
  # CI=1 keeps wrangler non-interactive so this does not hang waiting for a
  # confirmation nobody is there to give.
  (cd apps/api && CI=1 npx wrangler d1 migrations apply promptduniya --remote) \
    || die "Migration failed. The Worker was NOT deployed, so the live site is untouched."
fi

# ------------------------------------------------------------------- deploy

# The API goes first: apps/web service-binds to it, so the binding has to resolve
# to something that already understands the requests the new website will send.
if wants api; then
  step "Deploying the API"
  (cd apps/api && npx wrangler deploy)
fi

if wants web; then
  step "Building the website for Cloudflare (OpenNext)"
  # `next build` alone is not deployable — Cloudflare needs the OpenNext bundle.
  (cd apps/web && npx opennextjs-cloudflare build)

  step "Deploying the website"
  (cd apps/web && npx opennextjs-cloudflare deploy)
fi

if wants admin; then
  step "Building and deploying the admin console"
  # Typechecks as part of `npm run build`, so a broken console cannot ship.
  (cd apps/admin && npm run build && npx wrangler deploy)
fi

# -------------------------------------------------------------------- verify

step "Verifying"

api_origin="https://promptduniya-api.$(
  cd apps/api && npx wrangler deploy --dry-run 2>/dev/null | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1
)"

# Best effort: the health endpoint is public and needs no auth, so it is the
# cheapest proof that the Worker booted and its bindings resolved.
if wants api; then
  health=$(curl -s -m 15 "https://promptduniya-api.onlineilovegames.workers.dev/health" || true)
  if printf '%s' "$health" | grep -q '"healthy"'; then
    echo "API health: ok"
  else
    warn "Could not confirm API health. Check: npx wrangler tail --name promptduniya-api"
  fi
fi

printf '\n\033[1;32mDone.\033[0m Deployed: %s\n' "${TARGETS[*]}"
echo
echo "Next, in the admin console:"
echo "  1. Admin -> AI providers  : paste a Gemini or OpenAI key, pick a model, press Test."
echo "  2. Admin -> Automation    : press Discover, then Generate now, and review the queue."
echo "  3. Turn automation on only once you are happy with what it produced."
