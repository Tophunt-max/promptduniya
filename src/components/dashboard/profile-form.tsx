'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input, Textarea } from '../ui/field';
import { AlertIcon, CheckIcon, MailIcon } from '../ui/icon';
import { useToast } from '../ui/toast';
import { UserAvatar } from '../layout/user-avatar';

export interface ProfileInitial {
  name: string;
  username: string;
  email: string;
  bio: string;
  avatarUrl: string;
  location: string;
  website: string;
  instagram: string;
  youtube: string;
  emailVerified: boolean;
}

/** Profile editor. Email is read-only — changing it needs re-verification. */
export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resending, setResending] = useState(false);

  function set<K extends keyof ProfileInitial>(key: K, value: ProfileInitial[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});

    try {
      await api.patch('/api/profile', {
        name: form.name,
        username: form.username,
        bio: form.bio,
        avatarUrl: form.avatarUrl,
        location: form.location,
        website: form.website,
        instagram: form.instagram,
        youtube: form.youtube,
      });
      toast.success('Profile updated');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { issues?: { path: string; message: string }[] } | undefined;
        const mapped: Record<string, string> = {};
        for (const issue of details?.issues ?? []) if (issue.path) mapped[issue.path] = issue.message;
        setFieldErrors(mapped);
        toast.error('Could not save', error.message);
      } else {
        toast.error('Could not save', 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    try {
      await api.put('/api/auth/verify-email');
      toast.success('Verification email sent', 'Check your inbox.');
    } catch (error) {
      toast.error(
        'Could not send',
        error instanceof ApiClientError ? error.message : 'Please try again shortly.',
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6" noValidate>
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <UserAvatar name={form.name || 'You'} avatarUrl={form.avatarUrl || null} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{form.name}</p>
          <p className="text-xs text-faint">@{form.username}</p>
        </div>
      </div>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Basics</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Display name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            error={fieldErrors.name}
            required
          />
          <Input
            label="Username"
            value={form.username}
            onChange={(event) => set('username', event.target.value)}
            error={fieldErrors.username}
            hint="Letters, numbers, dots and underscores"
          />
        </div>

        <div>
          <Input
            label="Email address"
            value={form.email}
            readOnly
            disabled
            leadingIcon={<MailIcon size={17} />}
            labelSuffix={
              form.emailVerified ? (
                <Badge tone="success" icon={<CheckIcon size={11} />}>
                  Verified
                </Badge>
              ) : (
                <Badge tone="marigold" icon={<AlertIcon size={11} />}>
                  Not verified
                </Badge>
              )
            }
            hint="Contact support if you need to change your email address."
          />
          {!form.emailVerified && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              loading={resending}
              onClick={resendVerification}
            >
              Resend verification email
            </Button>
          )}
        </div>

        <Textarea
          label="Bio"
          value={form.bio}
          onChange={(event) => set('bio', event.target.value)}
          error={fieldErrors.bio}
          maxLength={300}
          rows={3}
          hint={`${form.bio.length}/300 characters`}
        />

        <Input
          label="Avatar image URL"
          value={form.avatarUrl}
          onChange={(event) => set('avatarUrl', event.target.value)}
          error={fieldErrors.avatarUrl}
          placeholder="https://…"
          hint="Leave blank to use your generated initials avatar."
        />
      </fieldset>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Links</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Location"
            value={form.location}
            onChange={(event) => set('location', event.target.value)}
            placeholder="Bengaluru, India"
          />
          <Input
            label="Website"
            value={form.website}
            onChange={(event) => set('website', event.target.value)}
            error={fieldErrors.website}
            placeholder="https://…"
          />
          <Input
            label="Instagram handle"
            value={form.instagram}
            onChange={(event) => set('instagram', event.target.value)}
            placeholder="yourhandle"
          />
          <Input
            label="YouTube channel"
            value={form.youtube}
            onChange={(event) => set('youtube', event.target.value)}
            placeholder="@yourchannel"
          />
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" loading={saving} size="lg">
          Save changes
        </Button>
      </div>
    </form>
  );
}
