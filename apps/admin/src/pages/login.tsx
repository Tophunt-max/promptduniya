import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';
import { useAuth } from '@/lib/auth';
import { useMutation } from '@/lib/use-api';

/**
 * Sign-in screen.
 *
 * Previously an unbranded white card on a grey field — nothing on it said which
 * system you were about to enter except a line of bold text. It now carries the
 * console's mark and its navy chrome, so it reads as the same tool you land in
 * rather than a generic form. The backdrop is pure CSS, so no image bytes.
 */
export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const { run, pending, error } = useMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (loading) return <Spinner label="Restoring your session" />;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Soft brand wash behind the card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(46% 38% at 50% 0%, rgb(111 79 247 / 0.16) 0%, transparent 70%), radial-gradient(38% 32% at 82% 96%, rgb(138 114 251 / 0.12) 0%, transparent 70%)',
        }}
      />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <svg width={46} height={46} viewBox="0 0 48 48" aria-hidden="true">
            <defs>
              <linearGradient id="login-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6F4FF7" />
                <stop offset="100%" stopColor="#8A72FB" />
              </linearGradient>
            </defs>
            <rect width="48" height="48" rx="13" fill="url(#login-logo)" />
            <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none">
              <circle cx="24" cy="24" r="9" strokeOpacity="0.9" />
              <path d="M24 11v6M24 31v6M11 24h6M31 24h6" strokeOpacity="0.55" />
            </g>
          </svg>
          <h1 className="mt-3.5 text-lg font-bold text-[var(--text-strong)]">
            promptduniya admin
          </h1>
          <p className="mt-1 text-sm text-[var(--text-body)]">
            Sign in with an administrator or editor account.
          </p>
        </div>

        <div className="card p-6">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => signIn(email, password));
            }}
          >
            {error && <Alert>{error}</Alert>}

            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                placeholder="you@promptduniya.in"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <Button type="submit" className="w-full" loading={pending}>
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-[var(--text-muted)]">
          Internal tool. Activity on this console is logged.
        </p>
      </div>
    </div>
  );
}
