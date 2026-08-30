/**
 * D1 statement limits.
 *
 * D1 caps a single query at 100 bound parameters — far lower than SQLite's own
 * 999 — and a multi-row `INSERT` binds one parameter per column per row. So the
 * safe number of rows per statement is a function of how wide the row is, not a
 * constant: 40 notification rows is fine at two columns and impossible at eight.
 *
 * Hardcoded chunk sizes are what this replaces. They were picked per call site
 * and drifted out of range as columns were added — `trend_signals` inserted 20
 * rows of 9 columns (180 parameters) and failed every discovery pass, silently,
 * because the error was caught and logged rather than surfaced.
 *
 * @see https://developers.cloudflare.com/d1/platform/limits/
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Splits rows into batches that each stay within D1's parameter ceiling.
 *
 * Width is measured as the widest row in the set, because a multi-row insert
 * binds the union of the keys present: one row carrying an extra optional column
 * widens the statement for every row in that batch.
 *
 * `undefined` values are not counted — Drizzle omits those keys and lets the
 * column default apply, so they cost no parameter. `null` *is* counted, since it
 * is bound as a value.
 */
export function batchByParams<T extends Record<string, unknown>>(rows: T[]): T[][] {
  if (rows.length === 0) return [];

  let widest = 1;
  for (const row of rows) {
    let count = 0;
    for (const value of Object.values(row)) if (value !== undefined) count += 1;
    if (count > widest) widest = count;
  }

  const perBatch = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / widest));

  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += perBatch) batches.push(rows.slice(i, i + perBatch));
  return batches;
}
