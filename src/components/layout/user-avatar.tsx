'use client';

import Image from 'next/image';

import { cn, initials } from '@/lib/utils';

/**
 * Avatar with a deterministic colour fallback derived from the user's name, so
 * every account has a stable identity even without an uploaded picture.
 */

const GRADIENTS = [
  'from-brand-600 to-brand-400',
  'from-marigold-500 to-marigold-300',
  'from-teal-600 to-emerald-400',
  'from-rose-600 to-pink-400',
  'from-violet-600 to-fuchsia-400',
  'from-sky-600 to-cyan-400',
];

function gradientFor(seed: string): string {
  let value = 0;
  for (let i = 0; i < seed.length; i++) value = (value + seed.charCodeAt(i)) % 997;
  return GRADIENTS[value % GRADIENTS.length]!;
}

export interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  isPremium?: boolean;
  className?: string;
}

export function UserAvatar({ name, avatarUrl, size = 36, isPremium, className }: UserAvatarProps) {
  return (
    <span className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-full place-items-center rounded-full bg-gradient-to-br font-bold text-white',
            gradientFor(name),
          )}
          style={{ fontSize: Math.max(10, size * 0.36) }}
        >
          {initials(name)}
        </span>
      )}
      {isPremium && (
        <span
          aria-label="Premium member"
          title="Premium member"
          className="absolute -bottom-0.5 -right-0.5 grid size-[42%] min-w-3.5 place-items-center rounded-full bg-marigold-500 text-[0.5rem] font-black text-white ring-2 ring-[var(--surface-raised)]"
        >
          ★
        </span>
      )}
      {!avatarUrl && <span className="sr-only">{name}</span>}
    </span>
  );
}
