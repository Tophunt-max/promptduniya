import type { Metadata } from 'next';

import { RegisterForm } from '@/components/auth/auth-forms';
import { requireGuestPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Create a free account',
  description:
    'Create a free promptduniya account to save prompts, copy more each day and use the AI prompt generator.',
  path: '/register',
});

export default async function RegisterPage() {
  await requireGuestPage();
  return <RegisterForm />;
}
