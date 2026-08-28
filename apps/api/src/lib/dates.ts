/** Unix epoch seconds — the canonical time unit across the database. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function addDays(seconds: number, days: number): number {
  return seconds + days * 86_400;
}

export function addMonths(seconds: number, months: number): number {
  const d = new Date(seconds * 1000);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return Math.floor(d.getTime() / 1000);
}

export function addYears(seconds: number, years: number): number {
  return addMonths(seconds, years * 12);
}

/** IST-aware day bucket (YYYY-MM-DD); daily limits reset at Indian midnight. */
export function dayBucket(seconds: number = nowSec(), offsetMinutes = 330): string {
  const shifted = new Date((seconds + offsetMinutes * 60) * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function lastNDayBuckets(n: number, from: number = nowSec()): string[] {
  return Array.from({ length: n }, (_, i) => dayBucket(from - (n - 1 - i) * 86_400));
}
