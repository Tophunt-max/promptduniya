'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { passwordStrength } from '@/lib/auth/password-strength';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Checkbox, Input } from '../ui/field';
import { AlertIcon, CheckIcon, LockIcon, MailIcon, UserIcon } from '../ui/icon';
import { useToast } from '../ui/toast';

/**
 * Authentication forms.
 *
 * Validation errors from the server arrive as a structured `issues` array, which
 * is mapped back onto the individual fields so the user sees the message next to
 * the input that caused it.
 */

type FieldErrors = Record<string, string>;

function extractFieldErrors(error: unknown): { message: string; fields: FieldErrors } {
  if (error instanceof ApiClientError) {
    const details = error.details as { issues?: { path: string; message: string }[] } | undefined;
    const fields: FieldErrors = {};
    for (const issue of details?.issues ?? []) {
      if (issue.path) fields[issue.path] = issue.message;
    }
    return { message: error.message, fields };
  }
  return { message: 'Something went wrong. Please try again.', fields: {} };
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
    >
      <AlertIcon size={17} className="mt-px shrink-0" />
      {message}
    </p>
  );
}

/* --------------------------------- Login ---------------------------------- */

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  const next = searchParams.get('next') ?? '/dashboard';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});

    const data = new FormData(event.currentTarget);

    try {
      await api.post<{ redirectTo: string }>('/api/auth/login', {
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        remember: data.get('remember') === 'on',
      });
      toast.success('Welcome back');
      router.push(next);
      router.refresh();
    } catch (caught) {
      const extracted = extractFieldErrors(caught);
      setError(extracted.message);
      setFields(extracted.fields);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Welcome back</h1>
      <p className="mt-1.5 text-sm text-body">Sign in to reach your saved prompts and dashboard.</p>

      <form onSubmit={onSubmit} className="mt-7 grid gap-4" noValidate>
        <FormError message={error} />

        <Input
          name="email"
          type="email"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          required
          error={fields.email}
          leadingIcon={<MailIcon size={17} />}
        />

        <Input
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          error={fields.password}
          leadingIcon={<LockIcon size={17} />}
          labelSuffix={
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              Forgot password?
            </Link>
          }
        />

        <Checkbox name="remember" label="Keep me signed in" defaultChecked />

        <Button type="submit" loading={loading} fullWidth size="lg">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        New here?{' '}
        <Link
          href="/register"
          className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          Create a free account
        </Link>
      </p>
    </div>
  );
}

/* -------------------------------- Register -------------------------------- */

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [password, setPassword] = useState('');

  const strength = passwordStrength(password);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});

    const data = new FormData(event.currentTarget);

    try {
      await api.post('/api/auth/register', {
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        acceptTerms: data.get('acceptTerms') === 'on',
      });
      toast.success('Account created', 'Welcome to promptduniya.');
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      const extracted = extractFieldErrors(caught);
      setError(extracted.message);
      setFields(extracted.fields);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Create your free account</h1>
      <p className="mt-1.5 text-sm text-body">
        Save prompts, use the generator and copy more every day. No card needed.
      </p>

      <form onSubmit={onSubmit} className="mt-7 grid gap-4" noValidate>
        <FormError message={error} />

        <Input
          name="name"
          label="Your name"
          placeholder="Ananya Sharma"
          autoComplete="name"
          required
          error={fields.name}
          leadingIcon={<UserIcon size={17} />}
        />

        <Input
          name="email"
          type="email"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          required
          error={fields.email}
          leadingIcon={<MailIcon size={17} />}
        />

        <div>
          <Input
            name="password"
            type="password"
            label="Password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
            minLength={8}
            error={fields.password}
            leadingIcon={<LockIcon size={17} />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      index < strength.score
                        ? strength.score <= 1
                          ? 'bg-rose-500'
                          : strength.score === 2
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        : 'bg-[var(--surface-sunken)]',
                    )}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint" aria-live="polite">
                {strength.label}
                {strength.problems[0] ? ` — ${strength.problems[0]}` : ''}
              </p>
            </div>
          )}
        </div>

        <Checkbox
          name="acceptTerms"
          required
          error={fields.acceptTerms}
          label={
            <>
              I agree to the{' '}
              <Link href="/terms" className="font-semibold text-brand-600 underline dark:text-brand-300">
                terms of service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="font-semibold text-brand-600 underline dark:text-brand-300">
                privacy policy
              </Link>
            </>
          }
        />

        <Button type="submit" loading={loading} fullWidth size="lg">
          Create free account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

/* ----------------------------- Forgot password ---------------------------- */

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(event.currentTarget);

    try {
      await api.post('/api/auth/forgot-password', { email: String(data.get('email') ?? '') });
      setSent(true);
    } catch (caught) {
      setError(extractFieldErrors(caught).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <MailIcon size={22} />
        </span>
        <h1 className="mt-4 text-xl font-extrabold">Check your inbox</h1>
        <p className="mt-2 text-sm leading-relaxed text-body">
          If an account exists for that address, a reset link is on its way. The link is valid for
          60 minutes.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Reset your password</h1>
      <p className="mt-1.5 text-sm text-body">
        Enter the email you signed up with and we&rsquo;ll send you a reset link.
      </p>

      <form onSubmit={onSubmit} className="mt-7 grid gap-4" noValidate>
        <FormError message={error} />
        <Input
          name="email"
          type="email"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          required
          leadingIcon={<MailIcon size={17} />}
        />
        <Button type="submit" loading={loading} fullWidth size="lg">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        <Link href="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

/* ----------------------------- Reset password ----------------------------- */

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  const strength = passwordStrength(password);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post('/api/auth/reset-password', { token, password });
      toast.success('Password updated', 'Sign in with your new password.');
      router.push('/login');
    } catch (caught) {
      setError(extractFieldErrors(caught).message);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
          <AlertIcon size={22} />
        </span>
        <h1 className="mt-4 text-xl font-extrabold">This link is incomplete</h1>
        <p className="mt-2 text-sm text-body">
          The reset link is missing its token. Request a fresh one and try again.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-body">
        Signing in elsewhere will be ended once you save this.
      </p>

      <form onSubmit={onSubmit} className="mt-7 grid gap-4" noValidate>
        <FormError message={error} />
        <Input
          name="password"
          type="password"
          label="New password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          leadingIcon={<LockIcon size={17} />}
          hint={password.length > 0 ? strength.label : undefined}
        />
        <Button type="submit" loading={loading} fullWidth size="lg" disabled={strength.score < 2}>
          Update password
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------ Verify email ------------------------------ */

export function VerifyEmailPanel({ token }: { token: string | null }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function verify() {
    if (!token) return;
    setState('loading');
    try {
      await api.post('/api/auth/verify-email', { token });
      setState('done');
      setMessage('Your email address is verified.');
    } catch (caught) {
      setState('error');
      setMessage(extractFieldErrors(caught).message);
    }
  }

  async function resend() {
    setState('loading');
    try {
      await api.put('/api/auth/verify-email');
      setState('done');
      setMessage('Verification email sent. Check your inbox.');
    } catch (caught) {
      setState('error');
      setMessage(extractFieldErrors(caught).message);
    }
  }

  return (
    <div className="text-center">
      <span
        className={cn(
          'mx-auto grid size-12 place-items-center rounded-2xl',
          state === 'done'
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
            : state === 'error'
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
              : 'bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300',
        )}
      >
        {state === 'done' ? <CheckIcon size={22} /> : <MailIcon size={22} />}
      </span>

      <h1 className="mt-4 text-xl font-extrabold">
        {state === 'done' ? 'All set' : 'Verify your email'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-body">
        {message ||
          (token
            ? 'Confirm your address to unlock saved prompts and the generator.'
            : 'We could not find a verification token in this link. You can send yourself a fresh one.')}
      </p>

      <div className="mt-6 grid gap-2">
        {token && state !== 'done' && (
          <Button onClick={verify} loading={state === 'loading'} fullWidth>
            Verify my email
          </Button>
        )}
        {state !== 'done' && (
          <Button onClick={resend} variant="outline" loading={state === 'loading'} fullWidth>
            Send a new link
          </Button>
        )}
        {state === 'done' && (
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            Go to your dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
