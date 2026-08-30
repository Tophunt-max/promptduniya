import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * Prompt cover visual.
 *
 * When an administrator has uploaded a cover image we render it through
 * next/image (AVIF/WebP, lazy, responsive `sizes`). When there is none we draw
 * an original composition in CSS — so the grid always looks deliberate without
 * shipping a single third-party or copyrighted asset.
 *
 * The fallback used to pick its palette by hashing the slug, which meant a
 * snowfall prompt could come back in hot orange and a Diwali prompt in icy
 * teal. The palette is now chosen from the prompt's own category, so the cover
 * agrees with the thing it is covering; the hash survives only to vary geometry
 * within that palette, which is what stops a category page looking like
 * wallpaper.
 */

type Palette = {
  /** Deep shadow tone. */
  base: string;
  /** Mid tone carrying the hue. */
  mid: string;
  /** Highlight the bloom resolves to. */
  lift: string;
};

/**
 * Palette per category family. Keys are category slugs from the seed
 * catalogue; anything unknown falls back to the brand palette.
 */
const CATEGORY_PALETTES: Record<string, Palette> = {
  // Warm festival and devotional
  festival: { base: '#7f3512', mid: '#f26a12', lift: '#ffd5a2' },
  birthday: { base: '#9e3f11', mid: '#ff9838', lift: '#ffecd1' },

  // Traditional Indian textile — maroon into gold
  saree: { base: '#4a1220', mid: '#a8264a', lift: '#ffd5a2' },
  traditional: { base: '#5a1e12', mid: '#b8451f', lift: '#ffe0b0' },
  wedding: { base: '#59132f', mid: '#c02c5e', lift: '#ffd9c0' },

  // Cool and atmospheric
  travel: { base: '#0f3f4a', mid: '#12b5a5', lift: '#d9f5ef' },
  nature: { base: '#0f4034', mid: '#159c6b', lift: '#dcf6e4' },
  architecture: { base: '#1f3347', mid: '#3f7ea8', lift: '#dbeaf5' },

  // Night and expensive
  luxury: { base: '#0b0d24', mid: '#2a2f6b', lift: '#b9c2ff' },
  cars: { base: '#14161c', mid: '#3a4250', lift: '#ffb768' },
  bikes: { base: '#1a1410', mid: '#4a3527', lift: '#ff9838' },
  cinematic: { base: '#12102a', mid: '#3c25ae', lift: '#cfc4ff' },

  // Editorial and social
  fashion: { base: '#2a0f2e', mid: '#8c2a7a', lift: '#ffd0ec' },
  instagram: { base: '#3c1152', mid: '#9333c4', lift: '#f0cdff' },
  'social-media': { base: '#38124e', mid: '#a33bb8', lift: '#f5cdf2' },
  youtube: { base: '#4a1018', mid: '#c22a35', lift: '#ffd2cf' },

  // People
  boys: { base: '#132a45', mid: '#2f6fa8', lift: '#cfe4f7' },
  girls: { base: '#3d1533', mid: '#a83f7a', lift: '#ffd6ea' },
  couples: { base: '#3a1230', mid: '#9c2f57', lift: '#ffd4dc' },
  family: { base: '#2c2413', mid: '#8a6b28', lift: '#ffeec4' },
  portrait: { base: '#1c1157', mid: '#5b3df5', lift: '#cfc4ff' },
  photography: { base: '#161a2e', mid: '#44528c', lift: '#d5dcf5' },

  // Studio / commercial
  business: { base: '#141a26', mid: '#37506e', lift: '#d4dfec' },
  'product-photography': { base: '#1a1a1f', mid: '#4f5058', lift: '#e8e8ee' },

  // Stylised
  anime: { base: '#1d1440', mid: '#6d4bd6', lift: '#ffd9f0' },
  fantasy: { base: '#191046', mid: '#5a34b0', lift: '#c9f0ff' },
};

const DEFAULT_PALETTE: Palette = { base: '#2f1e86', mid: '#5b3df5', lift: '#ffb768' };

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
  /** Category slug — selects the palette family for the generated fallback. */
  category?: string | null;
  /** Style name, surfaced as a small caption on the generated fallback. */
  style?: string | null;
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
  category,
  style,
}: PromptArtworkProps) {
  if (imageUrl) {
    return (
      <div
        className={cn(
          'relative overflow-hidden bg-[var(--surface-sunken)]',
          RATIO_CLASS[ratio],
          className,
        )}
      >
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
  const palette = (category && CATEGORY_PALETTES[category]) || DEFAULT_PALETTE;

  // Geometry varies with the slug so neighbouring cards in one category read as
  // a family rather than a repeat.
  const angle = 145 + (seedValue % 70);
  const bloomX = 22 + (seedValue % 56);
  const bloomY = 18 + ((seedValue >> 3) % 46);
  const hairlineGap = 7 + (seedValue % 6);

  return (
    <div
      role="img"
      aria-label={alt || `Cover artwork for ${title}`}
      className={cn(
        'relative isolate overflow-hidden transition-transform duration-500 group-hover:scale-[1.03]',
        RATIO_CLASS[ratio],
        locked && 'blur-[6px]',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${palette.base} 0%, ${palette.mid} 62%, ${palette.lift} 140%)`,
      }}
    >
      {/* Off-centre bloom — gives the flat gradient a light source. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(42% 38% at ${bloomX}% ${bloomY}%, ${palette.lift}66 0%, transparent 68%)`,
        }}
      />

      {/* Fine diagonal hairlines. Low contrast on purpose: at 8% they read as
          texture, at the previous 16% they read as stripes. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `repeating-linear-gradient(${angle + 74}deg, #fff 0px, #fff 1px, transparent 1px, transparent ${hairlineGap}px)`,
        }}
      />

      {/* Vignette — pulls the eye off the edges and makes overlaid badges legible. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(120% 100% at 50% 0%, transparent 42%, rgb(0 0 0 / 0.34) 100%)',
        }}
      />

      {/* Aperture mark, echoing the logo. Sits under the caption, cropped by the frame. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="absolute -right-10 -bottom-12 size-[74%] opacity-[0.16]"
        fill="none"
        stroke="#fff"
        strokeWidth="1.1"
      >
        <circle cx="50" cy="50" r="30" />
        <circle cx="50" cy="50" r="41" strokeOpacity="0.55" />
        <path d="M50 9v82M9 50h82" strokeOpacity="0.3" />
      </svg>

      {/* A style caption reads as an intentional cover plate. The previous
          oversized initials read as a missing avatar. */}
      {style ? (
        <span className="absolute inset-x-3 bottom-3 truncate text-[0.625rem] font-bold uppercase tracking-[0.18em] text-white/80">
          {style}
        </span>
      ) : null}
    </div>
  );
}
