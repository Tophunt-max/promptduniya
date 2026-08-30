import { useState } from 'react';

import { cn, formatNumber } from './ui';

/**
 * Charts for the console.
 *
 * Hand-rolled SVG rather than a charting library, continuing the choice the
 * dashboard's inline sparkline already made. The reasoning holds up: recharts
 * lands around 100 kB gzipped and brings its own layout engine, for a console
 * that needs a line, a bar and a ranked list. Everything here is under 300 lines
 * of geometry and inherits the theme's CSS custom properties for free, which no
 * library does without a wrapper.
 *
 * One layout rule runs through all of it. The plot area is an SVG with
 * `preserveAspectRatio="none"` in a normalised 0-100 space, so the geometry
 * stretches to whatever width the card is — and any `<text>` inside it would
 * stretch with it, which is why every label is HTML positioned over or beside the
 * SVG rather than inside it. `vectorEffect="non-scaling-stroke"` keeps the lines
 * an even weight under that same distortion.
 */

export interface Series {
  labels: string[];
  values: number[];
}

type Formatter = (value: number) => string;

/** Trims a YYYY-MM-DD bucket to something readable on an axis. */
function shortDate(label: string): string {
  const parts = label.split('-');
  if (parts.length !== 3) return label;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${names[month] ?? ''}`.trim();
}

/**
 * A "nice" upper bound and the gridline steps to reach it.
 *
 * Without this the top gridline lands on whatever the maximum happens to be —
 * 8,413 — and the axis reads as noise. Rounding up to the next 1/2/5 × 10ⁿ gives
 * labels a person can compare at a glance.
 */
function niceScale(max: number, ticks = 4): { top: number; steps: number[] } {
  if (max <= 0) return { top: 1, steps: [0, 1] };

  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const stepMultiple = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  const step = stepMultiple * magnitude;
  const top = Math.ceil(max / step) * step;

  const steps: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) steps.push(value);
  return { top, steps };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Percentage change between the two halves of the window.
 *
 * Half-over-half rather than day-over-day: on a site with double-digit daily
 * traffic, yesterday-versus-today is almost entirely noise and would show a wild
 * percentage on every render. Splitting the window gives a figure stable enough
 * to be worth showing.
 *
 * Plain arithmetic over at most a few hundred numbers, so it is not memoised —
 * the bookkeeping would cost more than the loop.
 */
function periodDelta(values: number[], enabled: boolean): number | null {
  if (!enabled || values.length < 4) return null;

  const midpoint = Math.floor(values.length / 2);
  const earlier = sum(values.slice(0, midpoint));
  const later = sum(values.slice(midpoint));

  // Growth from nothing is not a percentage. Report it as +100 rather than
  // dividing by zero and rendering "Infinity%".
  if (earlier === 0) return later > 0 ? 100 : null;
  return Math.round(((later - earlier) / earlier) * 100);
}

/* -------------------------------- Sparkline ------------------------------- */

/**
 * Compact trend indicator, for a grid of small cards.
 *
 * Promoted out of dashboard.tsx, where it was a local function no other screen
 * could reach. Behaviour is unchanged apart from the optional formatter and the
 * period-over-period delta.
 */
export function Sparkline({
  series,
  label,
  format = formatNumber,
  showDelta = true,
}: {
  series: Series;
  label: string;
  format?: Formatter;
  showDelta?: boolean;
}) {
  const values = series.values ?? [];
  const max = Math.max(1, ...values);

  const points = values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 0;
      const y = 32 - (value / max) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const total = sum(values);
  const delta = periodDelta(values, showDelta);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {label}
        </p>
        <div className="flex items-baseline gap-1.5">
          <p className="tabular text-base font-bold text-[var(--text-strong)]">{format(total)}</p>
          {delta !== null && (
            <span
              className={cn(
                'text-[0.6875rem] font-bold',
                delta > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : delta < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[var(--text-muted)]',
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta}%
            </span>
          )}
        </div>
      </div>

      {values.length > 1 ? (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="mt-3 h-11 w-full overflow-visible"
          aria-hidden
        >
          {/* Filled area under the line. A bare 1px polyline read as a stray
              diagonal scratch at this size rather than as a chart. */}
          <polygon points={`0,32 ${points} 100,32`} fill="var(--color-brand-500)" opacity="0.12" />
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-brand-500)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <p className="mt-3 h-11 text-xs text-[var(--text-muted)]">Not enough data yet.</p>
      )}
    </div>
  );
}

/* -------------------------------- LineChart ------------------------------- */

export interface LineChartSeries {
  name: string;
  series: Series;
  /** Any CSS colour. Defaults walk the palette below. */
  color?: string;
}

const PALETTE = [
  'var(--color-brand-500)',
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
];

/**
 * Full-size line chart with a value axis, date axis and hover readout.
 *
 * Takes an array of series so two related measures can share one pair of axes —
 * views against copies is far more informative than the same two numbers in
 * separate cards, because the interesting quantity is the ratio between them.
 *
 * Hover is a single transparent overlay rect plus an index derived from the
 * pointer's relative x, rather than a hit target per point. With a 365-day range
 * that is one listener instead of 365, and it still selects the nearest point.
 */
export function LineChart({
  data,
  height = 220,
  format = formatNumber,
  className,
}: {
  data: LineChartSeries[];
  height?: number;
  format?: Formatter;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const labels = data[0]?.series.labels ?? [];
  const pointCount = labels.length;

  const max = Math.max(1, ...data.flatMap((entry) => entry.series.values ?? []));
  const { top, steps } = niceScale(max);

  if (pointCount < 2) {
    return (
      <div
        className={cn('grid place-items-center text-xs text-[var(--text-muted)]', className)}
        style={{ height }}
      >
        Not enough data yet.
      </div>
    );
  }

  const pathFor = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / (pointCount - 1)) * 100;
        const y = 100 - (value / top) * 100;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <div className={cn('relative', className)}>
      <div className="flex gap-3">
        {/* Value axis as HTML — inside the SVG it would be stretched by
            preserveAspectRatio="none" along with the geometry. */}
        <div
          className="flex w-10 shrink-0 flex-col-reverse justify-between text-right text-[0.625rem] tabular-nums text-[var(--text-muted)]"
          style={{ height }}
        >
          {steps.map((step) => (
            <span key={step} className="leading-none">
              {format(step)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden
          >
            {steps.map((step) => {
              const y = 100 - (step / top) * 100;
              return (
                <line
                  key={step}
                  x1="0"
                  y1={y}
                  x2="100"
                  y2={y}
                  stroke="var(--border-line)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {data.map((entry, entryIndex) => {
              const colour = entry.color ?? PALETTE[entryIndex % PALETTE.length];
              const values = entry.series.values ?? [];
              return (
                <g key={entry.name}>
                  {data.length === 1 && (
                    <path
                      d={`${pathFor(values)} L100,100 L0,100 Z`}
                      fill={colour}
                      opacity="0.1"
                    />
                  )}
                  <path
                    d={pathFor(values)}
                    fill="none"
                    stroke={colour}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

            {hovered !== null && (
              <line
                x1={(hovered / (pointCount - 1)) * 100}
                y1="0"
                x2={(hovered / (pointCount - 1)) * 100}
                y2="100"
                stroke="var(--border-strong)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Markers are HTML so they stay circular; an SVG circle would be
              squashed into an ellipse by the same non-uniform scaling. */}
          {hovered !== null &&
            data.map((entry, entryIndex) => {
              const value = entry.series.values?.[hovered] ?? 0;
              return (
                <span
                  key={entry.name}
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface-raised)]"
                  style={{
                    left: `${(hovered / (pointCount - 1)) * 100}%`,
                    top: `${100 - (value / top) * 100}%`,
                    background: entry.color ?? PALETTE[entryIndex % PALETTE.length],
                  }}
                />
              );
            })}

          <div
            className="absolute inset-0"
            onMouseLeave={() => setHovered(null)}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - bounds.left) / bounds.width;
              setHovered(Math.min(pointCount - 1, Math.max(0, Math.round(ratio * (pointCount - 1)))));
            }}
          />

          {hovered !== null && (
            <div
              className="pointer-events-none absolute z-10 min-w-32 rounded-lg border border-[var(--border-line)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-pop)]"
              style={{
                // Flips to the left of the guide past the midpoint so the tooltip
                // never runs off the card.
                left: hovered / (pointCount - 1) > 0.6 ? undefined : `${(hovered / (pointCount - 1)) * 100}%`,
                right:
                  hovered / (pointCount - 1) > 0.6
                    ? `${(1 - hovered / (pointCount - 1)) * 100}%`
                    : undefined,
                top: 4,
                marginLeft: hovered / (pointCount - 1) > 0.6 ? undefined : 8,
                marginRight: hovered / (pointCount - 1) > 0.6 ? 8 : undefined,
              }}
            >
              <p className="font-semibold text-[var(--text-strong)]">
                {shortDate(labels[hovered] ?? '')}
              </p>
              {data.map((entry, entryIndex) => (
                <p key={entry.name} className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: entry.color ?? PALETTE[entryIndex % PALETTE.length] }}
                  />
                  <span className="text-[var(--text-muted)]">{entry.name}</span>
                  <span className="tabular ml-auto font-semibold text-[var(--text-strong)]">
                    {format(entry.series.values?.[hovered] ?? 0)}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Date axis: first, middle and last only. Every label at a 30-day range
          overlaps into an unreadable smear. */}
      {/* Indented past the value axis (w-10 = 2.5rem plus gap-3 = 0.75rem) so the
          date labels line up with the plot area rather than the card edge. */}
      <div className="ml-[3.25rem] mt-1.5 flex justify-between text-[0.625rem] text-[var(--text-muted)]">
        <span>{shortDate(labels[0] ?? '')}</span>
        <span>{shortDate(labels[Math.floor(pointCount / 2)] ?? '')}</span>
        <span>{shortDate(labels[pointCount - 1] ?? '')}</span>
      </div>

      {data.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {data.map((entry, entryIndex) => (
            <span key={entry.name} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2 rounded-full"
                style={{ background: entry.color ?? PALETTE[entryIndex % PALETTE.length] }}
              />
              <span className="text-[var(--text-body)]">{entry.name}</span>
              <span className="tabular font-semibold text-[var(--text-strong)]">
                {format(sum(entry.series.values ?? []))}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- BarChart ------------------------------- */

/**
 * Vertical bars over a date axis.
 *
 * Used where the measure is a discrete count per day rather than a continuous
 * quantity — signups, conversions. A line implies interpolation between points,
 * which is wrong for "three people subscribed on Tuesday".
 */
export function BarChart({
  series,
  height = 180,
  format = formatNumber,
  color = 'var(--color-brand-500)',
  className,
}: {
  series: Series;
  height?: number;
  format?: Formatter;
  color?: string;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const values = series.values ?? [];
  const labels = series.labels ?? [];
  const max = Math.max(1, ...values);

  if (values.length === 0) {
    return (
      <div
        className={cn('grid place-items-center text-xs text-[var(--text-muted)]', className)}
        style={{ height }}
      >
        Not enough data yet.
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-end gap-px" style={{ height }}>
        {values.map((value, index) => (
          <div
            key={labels[index] ?? index}
            className="group relative flex h-full flex-1 items-end"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className="w-full rounded-t-[2px] transition-opacity"
              style={{
                // A floor of 2px so a zero day is still a visible tick on the
                // axis. Without it the chart has gaps that read as missing data
                // rather than as a real zero.
                height: `${Math.max(2, (value / max) * 100)}%`,
                background: color,
                opacity: hovered === null || hovered === index ? 1 : 0.35,
              }}
            />
            {hovered === index && (
              <div
                className={cn(
                  'pointer-events-none absolute -top-1 z-10 whitespace-nowrap rounded-lg border border-[var(--border-line)] bg-[var(--surface-raised)] px-2 py-1 text-xs shadow-[var(--shadow-pop)]',
                  index / values.length > 0.7 ? 'right-0' : 'left-0',
                )}
              >
                <span className="font-semibold text-[var(--text-strong)]">{format(value)}</span>
                <span className="ml-1.5 text-[var(--text-muted)]">
                  {shortDate(labels[index] ?? '')}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex justify-between text-[0.625rem] text-[var(--text-muted)]">
        <span>{shortDate(labels[0] ?? '')}</span>
        <span>{shortDate(labels[labels.length - 1] ?? '')}</span>
      </div>
    </div>
  );
}

/* --------------------------------- BarList -------------------------------- */

export interface BarListItem {
  label: string;
  value: number;
  /** Rendered as a link when set. */
  href?: string;
  hint?: string;
}

/**
 * Ranked horizontal bars.
 *
 * The right shape for a leaderboard, and the reason the four discarded fields on
 * the dashboard were discarded: top categories and top tags are ranked
 * comparisons, and forcing them into the sparkline grid or a bare table loses the
 * one thing that matters, which is relative magnitude. The bar is drawn behind
 * the text so the row stays readable at any width.
 */
export function BarList({
  items,
  format = formatNumber,
  emptyLabel = 'Nothing recorded yet.',
  color = 'var(--color-brand-500)',
}: {
  items: BarListItem[];
  format?: Formatter;
  emptyLabel?: string;
  color?: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ol className="space-y-1">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="relative">
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-md"
            style={{ width: `${(item.value / max) * 100}%`, background: color, opacity: 0.14 }}
          />
          <div className="relative flex items-center gap-2 px-2 py-1.5">
            <span className="w-4 shrink-0 text-[0.625rem] font-bold tabular-nums text-[var(--text-muted)]">
              {index + 1}
            </span>
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-strong)] hover:text-brand-600"
              >
                {item.label}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-strong)]">
                {item.label}
              </span>
            )}
            {item.hint && (
              <span className="shrink-0 text-[0.625rem] text-[var(--text-muted)]">{item.hint}</span>
            )}
            <span className="tabular shrink-0 text-sm font-semibold text-[var(--text-strong)]">
              {format(item.value)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
