import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { resetPasswordSchema } from '@/lib/validation';
import { resetPassword } from '@/services/auth';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('passwordReset');

  const body = await parseBody(request, resetPasswordSchema);
  await resetPassword(body.token, body.password);

  return ok({
    reset: true,
    message: 'Your password has been updated. Please sign in with your new password.',
  });
});
