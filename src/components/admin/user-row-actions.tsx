'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { Button } from '../ui/button';
import { Checkbox, Input } from '../ui/field';
import { SettingsIcon } from '../ui/icon';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';

const ROLE_OPTIONS = ['admin', 'editor', 'creator', 'user'] as const;

/**
 * Per-user admin controls: status, roles and manual premium grants.
 *
 * The server rejects self-suspension and self-demotion, so an administrator
 * cannot accidentally lock themselves out through this dialog.
 */
export function UserRowActions({
  userId,
  name,
  status,
  roles,
  isPremium,
}: {
  userId: string;
  name: string;
  status: string;
  roles: string[];
  isPremium: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nextStatus, setNextStatus] = useState<'active' | 'suspended'>(
    status === 'suspended' ? 'suspended' : 'active',
  );
  const [nextRoles, setNextRoles] = useState<string[]>(roles.length > 0 ? roles : ['user']);
  const [grantDays, setGrantDays] = useState('');
  const [revoke, setRevoke] = useState(false);

  function toggleRole(role: string, checked: boolean) {
    setNextRoles((current) =>
      checked ? [...new Set([...current, role])] : current.filter((r) => r !== role),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status: nextStatus,
        roles: nextRoles,
      };
      const days = Number.parseInt(grantDays, 10);
      if (Number.isFinite(days) && days > 0) payload.grantPremiumDays = days;
      if (revoke) payload.revokePremium = true;

      await api.patch(`/api/admin/users/${userId}`, payload);
      toast.success('User updated', name);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not update user',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Manage ${name}`}
        title="Manage user"
        className="grid size-8 place-items-center rounded-lg text-body transition-colors hover:bg-[var(--surface-sunken)] hover:text-brand-600"
      >
        <SettingsIcon size={15} />
      </button>

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title={`Manage ${name}`}
        description="Changes are written to the audit log."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button fullWidth loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        }
      >
        <div className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-bold">Account status</legend>
            {(['active', 'suspended'] as const).map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="status"
                  value={option}
                  checked={nextStatus === option}
                  onChange={() => setNextStatus(option)}
                  className="accent-brand-600"
                />
                <span className="capitalize">{option}</span>
                {option === 'suspended' && (
                  <span className="text-xs text-faint">— blocks sign-in</span>
                )}
              </label>
            ))}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-bold">Roles</legend>
            {ROLE_OPTIONS.map((role) => (
              <Checkbox
                key={role}
                label={role}
                checked={nextRoles.includes(role)}
                onChange={(event) => toggleRole(role, event.target.checked)}
              />
            ))}
            <p className="text-xs text-faint">
              Admins can change settings, prices and roles. Editors can only manage content.
            </p>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-bold">Premium access</legend>
            <Input
              type="number"
              label="Grant premium for (days)"
              value={grantDays}
              onChange={(event) => setGrantDays(event.target.value)}
              min={1}
              max={3650}
              placeholder="e.g. 30"
              hint="Creates a real, date-bounded subscription — no hard-coded flags."
            />
            {isPremium && (
              <Checkbox
                label="Revoke premium access now"
                description="Cancels the active subscription and removes entitlements."
                checked={revoke}
                onChange={(event) => setRevoke(event.target.checked)}
              />
            )}
          </fieldset>
        </div>
      </Modal>
    </>
  );
}
