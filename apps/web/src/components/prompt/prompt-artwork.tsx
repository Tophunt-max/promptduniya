import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * Prompt cover visual.
 *
 * When an administrator has uploaded a cover image we render it through
 * next/image (AVIF/WebP, lazy, responsive `sizes`). When there is no image we
 * draw an original, deterministic gradient composition derived from the prompt
 * slug — so the grid always looks intentional without shipping a single
 * third-party or copyrighted asset.
 */

const PALETTES: [string, string, string][] = [
  ['#5B3DF5', '#8F75FB', '#FF8A3D'],
  ['#0F766E', '#12B5A5', '#FFD5A2'],
  ['#7F3512', '#F26A12', '#FFB768'],
  ['#2F1E86', '#5B3DF5', '#2DD4C4'],
  ['#9E3F11', '#FF9838', '#FFECD1'],
  ['#1C1157', '#4A2DDB', '#B0A0FF'],
  ['#0D9488', '#2DD4C4', '#E6E0FF'],
  ['#3C25AE', '#7454F7', '#FF8A3D'],
];

function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export type ArtworkRatio = 'portrait' | 'square' | 'wide';

const RATIO_CLASS: Record<ArtworkRatio, string> = {
  portrait: 'aspect-[4/5]',
  square: 'aspect-square',
  wide: 'aspect-[16/10]',
};

export interface PromptArtworkProps {
  seed: string;
  title: string;
  imageUrl?: string | null;
  alt?: string | null;
  ratio?: ArtworkRatio;
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Blurs the artwork for locked premium prompts. */
  locked?: boolean;
}

export function PromptArtwork({
  seed,
  title,
  imageUrl,
  alt,
  ratio = 'portrait',
  priority,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  className,
  locked,
}: PromptArtworkProps) {
  if (imageUrl) {
    return (
      <div className={cn('relative overflow-hidden bg-[var(--surface-sunken)]', RATIO_CLASS[ratio], className)}>
        <Image
          src={imageUrl}
          alt={alt || title}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className={cn(
            'object-cover transition-transform duration-500 group-hover:scale-[1.04]',
            locked && 'blur-md scale-105',
          )}
        />
      </div>
    );
  }

  const seedValue = hash(seed);
  const palette = PALETTES[seedValue % PALETTES.length]!;
  const angle = 25 + (seedValue % 130);
  const blobX = 15 + (seedValue % 60);
  const blobY = 20 + ((seedValue >> 3) % 55);
  const ringOffset = (seedValue >> 5) % 40;
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  return (
    <div
      role="img"
      aria-label={alt || `Abstract cover artwork for ${title}`}
      className={cn(
        'relative overflow-hidden transition-transform duration-500 group-hover:scale-[1.03]',
        RATIO_CLASS[ratio],
        locked && 'blur-[6px]',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${palette[0]} 0%, ${palette[1]} 55%, ${palette[2]} 130%)`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `radial-gradient(38% 34% at ${blobX}% ${blobY}%, rgba(255,255,255,0.5) 0%, transparent 62%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `repeating-linear-gradient(${angle + 90}deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, transparent 1px, transparent ${
            9 + (seedValue % 12)
          }px)`,
        }}
      />
      {/* Aperture-inspired ring motif, echoing the logo mark. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="absolute -right-6 -bottom-8 size-[68%] opacity-25"
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
      >
        <circle cx="50" cy="50" r={26 + (ringOffset % 8)} />
        <circle cx="50" cy="50" r={36 + (ringOffset % 6)} strokeOpacity="0.6" />
        <path d="M50 12v76M12 50h76" strokeOpacity="0.35" />
      </svg>
      <span className="absolute left-4 bottom-3.5 text-3xl font-black tracking-tighter text-white/85 mix-blend-overlay">
        {initials || 'PD'}
      </span>
    </div>
  );
}
