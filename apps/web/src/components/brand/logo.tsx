import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * promptduniya logo.
 *
 * An original mark: a camera aperture whose blades are drawn as marigold petals
 * (Indian craft) around a central spark (generative AI). It reads at 20px for a
 * favicon and scales cleanly to the header and footer.
 */

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="promptduniya"
      className={className}
    >
      <defs>
        <linearGradient id="pd-mark" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5B3DF5" />
          <stop offset="58%" stopColor="#7454F7" />
          <stop offset="100%" stopColor="#FF8A3D" />
        </linearGradient>
      </defs>

      <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#pd-mark)" />

      {/* Aperture petals */}
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.92">
        <path d="M24 9.5c5 3.4 7.6 8 7.6 14.5" />
        <path d="M36.6 16.8c-.7 6-3.6 10.4-9.2 13.6" />
        <path d="M36.6 31.2c-5.3 2.9-10.5 3.3-16.1 1" />
        <path d="M24 38.5c-5-3.4-7.6-8-7.6-14.5" />
        <path d="M11.4 31.2c.7-6 3.6-10.4 9.2-13.6" />
        <path d="M11.4 16.8c5.3-2.9 10.5-3.3 16.1-1" />
      </g>

      {/* Central spark */}
      <path
        d="M24 18.4l1.9 4.1 4.1 1.9-4.1 1.9-1.9 4.1-1.9-4.1-4.1-1.9 4.1-1.9z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({
  size = 32,
  showWordmark = true,
  href = '/',
  className,
  tagline,
}: {
  size?: number;
  showWordmark?: boolean;
  href?: string | null;
  className?: string;
  tagline?: string;
}) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} className="shrink-0 rounded-[0.7rem]" />
      {showWordmark && (
        <span className="grid leading-none">
          <span
            className="text-[1.0625rem] font-extrabold tracking-[-0.03em]"
            style={{ fontSize: size > 34 ? '1.25rem' : undefined }}
          >
            prompt<span className="gradient-text">duniya</span>
          </span>
          {tagline && (
            <span className="mt-1 text-[0.625rem] font-medium tracking-wide text-faint">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="rounded-lg" aria-label="promptduniya home">
      {content}
    </Link>
  );
}
