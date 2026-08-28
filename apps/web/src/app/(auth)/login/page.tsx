import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/auth-forms';
import { requireGuestPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Sign in',
  description: 'Sign in to promptduniya to reach your saved prompts, favourites and dashboard.',
  path: '/login',
  noIndex: true,
});

export default async function LoginPage() {
  await requireGuestPage();
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
