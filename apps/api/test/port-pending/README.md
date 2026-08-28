# Port pending

The monolith's service test suite (~3,100 lines), moved here verbatim when the
website became a BFF. These tests cover logic that now lives in
`apps/api/src/services/`, but they still use the monolith's import paths
(`@/db`, `@/services/*`, `@/lib/*`) and a libSQL test database.

They are **excluded from typecheck and from `npm test`** (`tsconfig.json` only
includes `src/**`, and `vitest.config.ts` only picks up `test/*.test.ts`), so
they neither run nor block CI until ported.

Porting each file means:

1. Repoint imports at `@pd/db` / `../../src/services/*` / `../../src/lib/*`.
2. Replace the libSQL harness with the D1 harness in `../helpers.ts`
   (`migrateTestDb`, `truncateAll`, `call`).
3. Move the file up to `apps/api/test/` so vitest collects it.

The original, fully passing suite remains on the `Main` branch alongside the
monolith.
