import type { Metadata } from 'next';

import { VerifyEmailPanel } from '@/components/auth/auth-forms';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Verify your email',
  path: '/verify-email',
  noIndex: true,
});

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailPanel token={token ?? null} />;
}
