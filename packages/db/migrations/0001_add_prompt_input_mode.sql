-- Adds prompts.input_mode.
--
-- Distinguishes the two kinds of prompt in the catalogue:
--
--   text-to-image  the model invents the entire picture from the prompt
--   photo-edit     the reader uploads their own photo and the prompt rebuilds
--                  the scene around their real face
--
-- Written by hand rather than by `drizzle-kit generate`. The repository does not
-- carry drizzle's migrations/meta journal, so drizzle has no record of
-- 0000_true_mesmero and emits a fresh full-schema CREATE TABLE run instead of an
-- incremental diff. Wrangler tracks applied migrations by filename in its own
-- d1_migrations table, so a hand-written 0001 is applied correctly on top.
--
-- Additive and backfilled, therefore safe to apply BEFORE deploying the Worker:
-- the running Worker simply does not select the column yet.

ALTER TABLE prompts ADD COLUMN input_mode TEXT NOT NULL DEFAULT 'text-to-image';

-- Existing rows all predate the distinction and are text-to-image, which the
-- column default already gives them. The identity-preserving prompts are marked
-- photo-edit by the seed, keyed on their slug prefix.
UPDATE prompts SET input_mode = 'photo-edit' WHERE slug LIKE 'edit-%';

CREATE INDEX IF NOT EXISTS prompts_input_mode_idx ON prompts (input_mode, is_published);
