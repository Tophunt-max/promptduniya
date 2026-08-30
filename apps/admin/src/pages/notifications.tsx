import { useState } from 'react';

import {
  Alert,
  Button,
  Card,
  Cell,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Row,
  Select,
  Spinner,
  Table,
  Textarea,
  cn,
  formatDateTime,
  formatNumber,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

/**
 * Notification broadcasts.
 *
 * `notifyMany` has been sitting in the notification service since it was written,
 * with no route, no page and no caller — so a platform whose entire premise is
 * publishing content had no way to tell its members that anything had been
 * published.
 *
 * The screen is built around one uncomfortable fact: a broadcast cannot be
 * recalled. Everything here exists to slow the operator down at the right moment:
 *
 *   - recipient counts are shown per segment *before* composing
 *   - a preview step spells out exactly who will receive it
 *   - the confirm button restates the number
 *   - "ignore preferences" is a separate, explicitly-scary toggle
 *
 * The suppressed count in the result is the other thing worth understanding.
 * `productUpdates` defaults to false for every member, so an un-forced broadcast
 * legitimately reaches almost nobody at first. Reporting delivered-versus-
 * suppressed makes that visible immediately instead of leaving someone to
 * conclude the feature is broken.
 */

interface Segment {
  id: string;
  label: string;
  size: number;
}

interface SentBroadcast {
  title: string;
  body: string | null;
  href: string | null;
  sentAt: number;
  recipients: number;
}

interface BroadcastsResponse {
  segments: Segment[];
  recent: SentBroadcast[];
}

interface BroadcastResult {
  segment: string;
  recipients: number;
  delivered: number;
  suppressed: number;
}

export function NotificationsPage() {
  const data = useQuery<BroadcastsResponse>('/v1/admin/broadcasts');
  const send = useMutation();

  const [segment, setSegment] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [href, setHref] = useState('');
  const [force, setForce] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const segments = data.data?.segments ?? [];
  const chosen = segments.find((entry) => entry.id === segment);
  const canSend = title.trim().length >= 3 && (chosen?.size ?? 0) > 0;

  async function submit() {
    const sent = await send.run(() =>
      api.post<BroadcastResult>('/v1/admin/broadcasts', {
        segment,
        title: title.trim(),
        body: body.trim() || undefined,
        href: href.trim() || undefined,
        force,
      }),
    );
    setConfirming(false);
    if (sent) {
      setResult(sent);
      setTitle('');
      setBody('');
      setHref('');
      setForce(false);
      data.reload();
    }
  }

  if (data.loading && !data.data) return <Spinner label="Loading segments" />;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Send an in-app announcement to a group of members. Sends cannot be undone."
      />

      {send.error && <Alert>{send.error}</Alert>}

      {result && (
        <div className="mb-4">
          <Alert tone={result.delivered === 0 ? 'warning' : 'success'}>
            Sent to {formatNumber(result.recipients)} member(s):{' '}
            {formatNumber(result.delivered)} delivered
            {result.suppressed > 0 && (
              <>
                , {formatNumber(result.suppressed)} suppressed by their notification preferences.
                Members must opt in to product updates, so this is expected unless you tick
                &ldquo;ignore preferences&rdquo;.
              </>
            )}
            {result.suppressed === 0 && '.'}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Compose" description="Appears in the member's notification inbox.">
            <div className="space-y-4">
              <Field label="Audience">
                <Select value={segment} onChange={(event) => setSegment(event.target.value)}>
                  {segments.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label} — {formatNumber(entry.size)} member
                      {entry.size === 1 ? '' : 's'}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Title"
                hint="Keep it short; this is the line they see in the inbox list."
                error={send.fieldErrors.title}
              >
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="200 new Diwali prompts are live"
                  maxLength={160}
                />
              </Field>

              <Field label="Body" hint="Optional. One or two sentences." error={send.fieldErrors.body}>
                <Textarea
                  rows={3}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={600}
                />
              </Field>

              <Field
                label="Link"
                hint="Optional. Where tapping the notification takes them, e.g. /category/festival."
                error={send.fieldErrors.href}
              >
                <Input
                  value={href}
                  onChange={(event) => setHref(event.target.value)}
                  placeholder="/explore"
                />
              </Field>

              <div className="rounded-lg border border-[var(--border-line)] p-3">
                <Checkbox
                  label="Ignore notification preferences"
                  checked={force}
                  onChange={(event) => setForce(event.target.checked)}
                />
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  Members opt in to product updates, and most have not. Leave this off for anything
                  promotional. Turn it on only for something they need to know regardless — a pricing
                  change, or a security notice.
                </p>
              </div>
            </div>
          </Card>

          {/* Preview. A notification is a small amount of text, so showing it
              rendered is cheap and catches the mistakes that matter — a title
              that is truncated, or a link left as a placeholder. */}
          {title.trim() && (
            <Card title="Preview">
              <div className="flex gap-3 rounded-lg border border-[var(--border-line)] p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-200">
                  ★
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
                  {body.trim() && (
                    <p className="mt-0.5 text-sm text-[var(--text-body)]">{body}</p>
                  )}
                  {href.trim() && (
                    <p className="mt-1 text-xs text-brand-600">{href}</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--text-muted)]">just now</p>
                </div>
              </div>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!canSend} onClick={() => setConfirming(true)}>
              Review and send
            </Button>
            {chosen && chosen.size === 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                That segment has no members right now.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Audiences" description="Resolved live, excluding suspended accounts.">
            <ul className="space-y-1">
              {segments.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2 py-1.5 text-sm',
                    entry.id === segment && 'bg-[var(--surface-sunken)]',
                  )}
                >
                  <span className="text-[var(--text-body)]">{entry.label}</span>
                  <span className="tabular font-semibold text-[var(--text-strong)]">
                    {formatNumber(entry.size)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Already sent">
            {(data.data?.recent.length ?? 0) === 0 ? (
              <EmptyState>Nothing has been broadcast yet.</EmptyState>
            ) : (
              <Table head={['Announcement', 'Sent', 'To']}>
                {(data.data?.recent ?? []).map((entry, index) => (
                  <Row key={`${entry.title}-${index}`}>
                    <Cell>
                      <p className="text-sm font-medium text-[var(--text-strong)]">{entry.title}</p>
                      {entry.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                          {entry.body}
                        </p>
                      )}
                    </Cell>
                    <Cell className="whitespace-nowrap text-xs">
                      {formatDateTime(entry.sentAt)}
                    </Cell>
                    <Cell className="tabular text-sm">{formatNumber(entry.recipients)}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>

      {confirming && chosen && (
        <Modal title="Send this announcement?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-[var(--text-body)]">
            This will reach <strong>{formatNumber(chosen.size)}</strong> member
            {chosen.size === 1 ? '' : 's'} in <strong>{chosen.label.toLowerCase()}</strong>.
          </p>

          <div className="mt-3 rounded-lg bg-[var(--surface-sunken)] p-3">
            <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
            {body.trim() && <p className="mt-1 text-sm text-[var(--text-body)]">{body}</p>}
          </div>

          {force ? (
            <div className="mt-3">
              <Alert tone="warning">
                Preferences will be ignored, so every member in this segment receives it whether they
                opted in or not.
              </Alert>
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Members who have not opted in to product updates will not receive it. You will see how
              many were suppressed.
            </p>
          )}

          <p className="mt-3 text-xs font-semibold text-[var(--text-muted)]">
            A broadcast cannot be recalled.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button loading={send.pending} onClick={() => void submit()}>
              Send to {formatNumber(chosen.size)}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
