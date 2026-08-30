-- Content automation: trend signals, runs, the durable content queue, and the
-- machine-side log.
--
-- Written by hand rather than by `drizzle-kit generate`, for the same reason as
-- 0001: this repository does not carry drizzle's migrations/meta journal, so
-- drizzle has no record of 0000_true_mesmero and would emit a fresh full-schema
-- CREATE TABLE run instead of an incremental diff. Wrangler tracks applied
-- migrations by filename in its own d1_migrations table, so a hand-written 0002
-- applies correctly on top.
--
-- Purely additive — four new tables and their indexes, no changes to existing
-- ones — therefore safe to apply BEFORE deploying the Worker. The running
-- Worker simply never selects from them.
--
-- Why these four tables and not one:
--
--   trend_signals    topics discovered before any prompt exists for them, with
--                    a unique normalized key so rescans do not re-enqueue the
--                    same idea, and a status so a used topic is not reused.
--   automation_runs  one cycle (a cron tick or a manual "generate now"), so the
--                    history reads as runs rather than a flat list of jobs.
--   content_queue    one row per intended post. This is what makes the pipeline
--                    resumable: state, attempt count and the original brief all
--                    outlive the request that created them.
--   automation_logs  what the machine did, kept apart from admin_logs, which is
--                    what humans did.

CREATE TABLE IF NOT EXISTS trend_signals (
  id           TEXT PRIMARY KEY NOT NULL,
  label        TEXT NOT NULL,
  normalized   TEXT NOT NULL,
  source       TEXT NOT NULL,
  score        REAL NOT NULL DEFAULT 0,
  rationale    TEXT,
  category_id  TEXT REFERENCES categories (id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'new',
  used_at      INTEGER,
  day_bucket   TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The de-dupe key. A rescan of the same week must not produce four copies of
-- the same topic, so this is a hard constraint rather than an application check.
CREATE UNIQUE INDEX IF NOT EXISTS trend_signals_normalized_uq ON trend_signals (normalized);
CREATE INDEX IF NOT EXISTS trend_signals_status_idx ON trend_signals (status, score);
CREATE INDEX IF NOT EXISTS trend_signals_source_idx ON trend_signals (source, day_bucket);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY NOT NULL,
  trigger       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running',
  requested     INTEGER NOT NULL DEFAULT 0,
  queued        INTEGER NOT NULL DEFAULT 0,
  succeeded     INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  skipped       INTEGER NOT NULL DEFAULT 0,
  stop_reason   TEXT,
  started_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at   INTEGER,
  duration_ms   INTEGER,
  triggered_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  meta_json     TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS automation_runs_started_idx ON automation_runs (started_at);
CREATE INDEX IF NOT EXISTS automation_runs_status_idx ON automation_runs (status, started_at);

CREATE TABLE IF NOT EXISTS content_queue (
  id                  TEXT PRIMARY KEY NOT NULL,
  run_id              TEXT REFERENCES automation_runs (id) ON DELETE SET NULL,
  trend_signal_id     TEXT REFERENCES trend_signals (id) ON DELETE SET NULL,

  theme               TEXT NOT NULL,
  category_id         TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  ai_model            TEXT NOT NULL,
  input_mode          TEXT NOT NULL DEFAULT 'text-to-image',
  is_premium          INTEGER NOT NULL DEFAULT 0,
  publish_mode        TEXT NOT NULL DEFAULT 'draft',
  scheduled_for       INTEGER,
  skip_cover          INTEGER NOT NULL DEFAULT 0,

  status              TEXT NOT NULL DEFAULT 'queued',
  source              TEXT NOT NULL DEFAULT 'manual',
  priority            INTEGER NOT NULL DEFAULT 0,
  attempts            INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 3,

  prompt_id           TEXT REFERENCES prompts (id) ON DELETE SET NULL,
  quality_score       INTEGER,
  quality_report_json TEXT,
  duplicate_of_id     TEXT REFERENCES prompts (id) ON DELETE SET NULL,
  duplicate_score     REAL,
  text_engine         TEXT,
  image_engine        TEXT,
  cover_error         TEXT,
  last_error          TEXT,

  started_at          INTEGER,
  finished_at         INTEGER,
  created_by          TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Serves the claim query: pending items, best priority first, then oldest.
CREATE INDEX IF NOT EXISTS content_queue_claim_idx ON content_queue (status, priority, created_at);
CREATE INDEX IF NOT EXISTS content_queue_status_idx ON content_queue (status, created_at);
CREATE INDEX IF NOT EXISTS content_queue_run_idx ON content_queue (run_id);
CREATE INDEX IF NOT EXISTS content_queue_prompt_idx ON content_queue (prompt_id);
CREATE INDEX IF NOT EXISTS content_queue_source_idx ON content_queue (source, created_at);

CREATE TABLE IF NOT EXISTS automation_logs (
  id          TEXT PRIMARY KEY NOT NULL,
  level       TEXT NOT NULL DEFAULT 'info',
  scope       TEXT NOT NULL,
  message     TEXT NOT NULL,
  job_id      TEXT REFERENCES content_queue (id) ON DELETE CASCADE,
  run_id      TEXT REFERENCES automation_runs (id) ON DELETE CASCADE,
  prompt_id   TEXT REFERENCES prompts (id) ON DELETE SET NULL,
  provider    TEXT,
  model       TEXT,
  duration_ms INTEGER,
  meta_json   TEXT,
  day_bucket  TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS automation_logs_created_idx ON automation_logs (created_at);
CREATE INDEX IF NOT EXISTS automation_logs_level_idx ON automation_logs (level, created_at);
CREATE INDEX IF NOT EXISTS automation_logs_scope_idx ON automation_logs (scope, created_at);
CREATE INDEX IF NOT EXISTS automation_logs_job_idx ON automation_logs (job_id);
CREATE INDEX IF NOT EXISTS automation_logs_run_idx ON automation_logs (run_id);
