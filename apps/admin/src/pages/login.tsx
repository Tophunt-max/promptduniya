import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMutation } from '@/lib/use-api';

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const { run, pending, error } = useMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (loading) return <Spinner label="Restoring your session" />;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-bold tracking-tight text-ink">promptduniya admin</h1>
        <p className="mt-1 text-sm text-body">
          Sign in with an administrator or editor account.
        </p>

        <form
          className="mt-6 space-y-4"
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
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
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
    </div>
  );
}
