'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { Button } from '../ui/button';
import { Input, Textarea } from '../ui/field';
import { AlertIcon, CheckIcon, MailIcon, UserIcon } from '../ui/icon';
import { useViewer } from '../viewer-provider';

/**
 * Contact form.
 *
 * Anti-spam is a hidden honeypot field plus a strict per-IP rate limit on the
 * server. No captcha, so there is no third-party script and no tracking.
 */
export function ContactForm() {
  const viewer = useViewer();
  const searchParams = useSearchParams();

  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});

    const data = new FormData(event.currentTarget);

    try {
      await api.post('/api/contact', {
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        subject: String(data.get('subject') ?? ''),
        message: String(data.get('message') ?? ''),
        website: String(data.get('website') ?? ''),
      });
      setSent(true);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const details = caught.details as { issues?: { path: string; message: string }[] } | undefined;
        const mapped: Record<string, string> = {};
        for (const issue of details?.issues ?? []) if (issue.path) mapped[issue.path] = issue.message;
        setFields(mapped);
        setError(caught.message);
      } else {
        setError('Could not send your message. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <CheckIcon size={24} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold">Message sent</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-body">
          Thanks for getting in touch. We usually reply within two working days — check your spam
          folder if you don&rsquo;t hear from us.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-4 p-5 sm:p-6" noValidate>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
        >
          <AlertIcon size={17} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="name"
          label="Your name"
          placeholder="Ananya Sharma"
          autoComplete="name"
          defaultValue={viewer.name ?? ''}
          error={fields.name}
          leadingIcon={<UserIcon size={17} />}
          required
        />
        <Input
          name="email"
          type="email"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          defaultValue={viewer.email ?? ''}
          error={fields.email}
          leadingIcon={<MailIcon size={17} />}
          required
        />
      </div>

      <Input
        name="subject"
        label="Subject"
        placeholder="What is this about?"
        defaultValue={searchParams.get('subject') ?? ''}
        error={fields.subject}
        required
      />

      <Textarea
        name="message"
        label="Message"
        placeholder="Tell us what you need. If it's a billing question, include your receipt number."
        rows={6}
        maxLength={4000}
        error={fields.message}
        required
        hint="At least 20 characters."
      />

      {/* Honeypot — hidden from users, ignored by them, filled by bots. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="contact-website">Website (leave empty)</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-faint">
          We&rsquo;ll only use your email to reply to this message.
        </p>
        <Button type="submit" loading={loading}>
          Send message
        </Button>
      </div>
    </form>
  );
}
