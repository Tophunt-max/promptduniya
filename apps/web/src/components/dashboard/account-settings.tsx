'use client';

import { useState } from 'react';

import { passwordStrength } from '@/lib/auth/password-strength';
import { ApiClientError, api } from '@/lib/client-api';
import { ThemeSwitcher } from '../theme/theme-provider';
import { Button } from '../ui/button';
import { Input } from '../ui/field';
import { LockIcon } from '../ui/icon';
import { useToast } from '../ui/toast';

/** Password change and appearance controls. */
export function AccountSettings() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(next);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.put('/api/profile', { currentPassword: current, newPassword: next });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
    } catch (caught) {
      const message =
        caught instanceof ApiClientError ? caught.message : 'Could not change your password.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section aria-labelledby="appearance">
        <h2 id="appearance" className="mb-3 text-base font-bold">
          Appearance
        </h2>
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-semibold">Colour theme</p>
            <p className="mt-0.5 text-xs text-faint">
              Follows your device setting unless you pick one. Saved on this device.
            </p>
          </div>
          <ThemeSwitcher />
        </div>
      </section>

      <section aria-labelledby="security">
        <h2 id="security" className="mb-3 text-base font-bold">
          Security
        </h2>
        <form onSubmit={changePassword} className="card grid gap-4 p-5" noValidate>
          <div>
            <p className="text-sm font-semibold">Change your password</p>
            <p className="mt-0.5 text-xs text-faint">
              Changing your password signs out every other device.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
            >
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="password"
              label="Current password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              leadingIcon={<LockIcon size={17} />}
              required
            />
            <Input
              type="password"
              label="New password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              leadingIcon={<LockIcon size={17} />}
              minLength={8}
              required
              hint={next.length > 0 ? `${strength.label}${strength.problems[0] ? ` — ${strength.problems[0]}` : ''}` : undefined}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={saving}
              disabled={!current || strength.score < 2}
            >
              Update password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
