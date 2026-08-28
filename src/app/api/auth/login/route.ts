import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { loginSchema } from '@/lib/validation';
import { trackEvent } from '@/services/analytics';
import { loginUser } from '@/services/auth';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('login');

  const body = await parseBody(request, loginSchema);

  const user = await loginUser({
    email: body.email,
    password: body.password,
    userAgent: context.userAgent,
    ipHash: context.ipHash,
  });

  await trackEvent({ name: 'auth.login', userId: user.id });

  return ok({
    user: { id: user.id, name: user.name, email: user.email, username: user.username },
    redirectTo: '/dashboard',
  });
});
