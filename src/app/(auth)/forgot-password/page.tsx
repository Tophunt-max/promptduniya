import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Reset your password',
  description: 'Request a password reset link for your promptduniya account.',
  path: '/forgot-password',
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
