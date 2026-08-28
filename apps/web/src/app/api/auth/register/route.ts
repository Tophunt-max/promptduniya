import { created, handle, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { registerSchema } from '@/lib/validation';
import { registerUser } from '@/services/auth';
import { trackEvent } from '@/services/analytics';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  // CSRF is skipped here: a brand-new visitor has no session cookie yet, so the
  // same-origin check plus a strict signup rate limit is the protection.
  const context = await routeContext(request, { csrf: false });
  await context.limit('signup');

  const body = await parseBody(request, registerSchema);

  const { user, requiresVerification } = await registerUser({
    name: body.name,
    email: body.email,
    password: body.password,
    username: body.username,
    userAgent: context.userAgent,
    ipHash: context.ipHash,
  });

  await trackEvent({ name: 'auth.signup', userId: user.id });

  return created({
    user: { id: user.id, name: user.name, email: user.email, username: user.username },
    requiresVerification,
    redirectTo: '/dashboard',
  });
});
