import type { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ProfileForm } from '@/components/dashboard/profile-form';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';
import { getProfile } from '@/services/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Your profile',
  path: '/profile',
  noIndex: true,
});

export default async function ProfilePage() {
  const user = await requireUserPage('/profile');

  const profile = await getProfile();

  return (
    <DashboardShell title="Your profile" description="How you appear across promptduniya.">
      <ProfileForm
        initial={{
          name: user.name,
          username: user.username,
          email: user.email,
          bio: user.bio ?? '',
          avatarUrl: user.avatarUrl ?? '',
          location: profile.location ?? '',
          website: profile.website ?? '',
          instagram: profile.instagram ?? '',
          youtube: profile.youtube ?? '',
          emailVerified: user.emailVerified,
        }}
      />
    </DashboardShell>
  );
}
