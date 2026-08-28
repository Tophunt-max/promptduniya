import { cn, formatCompact } from '@/lib/utils';

/**
 * Charts.
 *
 * Hand-drawn SVG rather than a charting library: these are simple series, and
 * a dependency-free implementation keeps the admin bundle small and renders on
 * the server with no hydration cost.
 */

export interface SeriesData {
  labels: string[];
  values: number[];
}

export interface AdminChartProps {
  title: string;
  data: SeriesData;
  /** Formats the tooltip/summary value, e.g. currency. */
  format?: (value: number) => string;
  accent?: 'brand' | 'marigold' | 'teal' | 'rose';
  height?: number;
  className?: string;
}

const ACCENTS = {
  brand: { stroke: '#5b3df5', fill: 'rgba(91,61,245,0.16)' },
  marigold: { stroke: '#f26a12', fill: 'rgba(242,106,18,0.16)' },
  teal: { stroke: '#0d9488', fill: 'rgba(13,148,136,0.16)' },
  rose: { stroke: '#e11d48', fill: 'rgba(225,29,72,0.16)' },
};

export function AdminChart({
  title,
  data,
  format = formatCompact,
  accent = 'brand',
  height = 160,
  className,
}: AdminChartProps) {
  const values = data.values.length > 0 ? data.values : [0];
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  const latest = values[values.length - 1] ?? 0;

  const width = 600;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const colours = ACCENTS[accent];

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 12) - 6;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  // A trend comparison across the two halves of the window.
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half).reduce((s, v) => s + v, 0);
  const secondHalf = values.slice(half).reduce((s, v) => s + v, 0);
  const trend = firstHalf === 0 ? (secondHalf > 0 ? 100 : 0) : Math.round(((secondHalf - firstHalf) / firstHalf) * 100);

  return (
    <figure className={cn('card p-5', className)}>
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-0.5 text-xs text-faint">
            {data.labels.length} day window · latest {format(latest)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold tabular-nums">{format(total)}</p>
          {trend !== 0 && (
            <p
              className={cn(
                'text-xs font-bold',
                trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
            </p>
          )}
        </div>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${title}: ${format(total)} across ${data.labels.length} days`}
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={width}
            y1={height * fraction}
            y2={height * fraction}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}
        <path d={area} fill={colours.fill} />
        <path
          d={line}
          fill="none"
          stroke={colours.stroke}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1]!.x}
            cy={points[points.length - 1]!.y}
            r={4}
            fill={colours.stroke}
          />
        )}
      </svg>

      <div className="mt-2 flex justify-between text-[0.625rem] text-faint">
        <span>{data.labels[0]}</span>
        <span>{data.labels[data.labels.length - 1]}</span>
      </div>
    </figure>
  );
}

/** Horizontal bar list, used for "top prompts" and "top searches". */
export function AdminBarList({
  title,
  items,
  emptyLabel = 'No data yet',
  format = formatCompact,
}: {
  title: string;
  items: { label: string; value: number; href?: string }[];
  emptyLabel?: string;
  format?: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-faint">{emptyLabel}</p>
      ) : (
        <ol className="grid gap-2.5">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                {item.href ? (
                  <a href={item.href} className="min-w-0 truncate font-medium hover:text-brand-600">
                    {item.label}
                  </a>
                ) : (
                  <span className="min-w-0 truncate font-medium">{item.label}</span>
                )}
                <span className="shrink-0 font-bold tabular-nums">{format(item.value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export interface AdminStatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}

export function AdminStat({ label, value, hint, tone = 'default' }: AdminStatProps) {
  return (
    <div className="card p-4">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-extrabold tabular-nums',
          tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'negative' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
