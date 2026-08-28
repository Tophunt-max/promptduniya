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
  // Clamp e.g. Jan 31 + 1 month → Feb 28/29 instead of rolling into March.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return Math.floor(d.getTime() / 1000);
}

export function addYears(seconds: number, years: number): number {
  return addMonths(seconds, years * 12);
}

/** IST-aware day bucket (YYYY-MM-DD). Daily limits reset at Indian midnight. */
export function dayBucket(seconds: number = nowSec(), offsetMinutes = 330): string {
  const shifted = new Date((seconds + offsetMinutes * 60) * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function lastNDayBuckets(n: number, from: number = nowSec()): string[] {
  return Array.from({ length: n }, (_, i) => dayBucket(from - (n - 1 - i) * 86_400));
}

export function formatDate(seconds: number | null | undefined, locale = 'en-IN'): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function formatDateTime(seconds: number | null | undefined, locale = 'en-IN'): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function relativeTime(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const diff = nowSec() - seconds;
  if (diff < 60) return 'just now';
  if (diff < 3_600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h ago`;
  if (diff < 2_592_000) return `${Math.floor(diff / 86_400)}d ago`;
  return formatDate(seconds);
}

export function daysUntil(seconds: number | null | undefined): number | null {
  if (!seconds) return null;
  return Math.ceil((seconds - nowSec()) / 86_400);
}
