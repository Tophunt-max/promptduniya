import type { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ProfileForm } from '@/components/dashboard/profile-form';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Your profile',
  path: '/profile',
  noIndex: true,
});

export default async function ProfilePage() {
  const user = await requireUserPage('/profile');

  const profileRows = await db
    .select({
      location: profiles.location,
      website: profiles.website,
      instagram: profiles.instagram,
      youtube: profiles.youtube,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const profile = profileRows[0] ?? { location: null, website: null, instagram: null, youtube: null };

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
