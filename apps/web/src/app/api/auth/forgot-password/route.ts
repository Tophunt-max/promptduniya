import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { forgotPasswordSchema } from '@/lib/validation';
import { requestPasswordReset } from '@/services/auth';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('passwordReset');

  const body = await parseBody(request, forgotPasswordSchema);
  await requestPasswordReset(body.email);

  // Always the same response, whether or not the address is registered — this
  // endpoint must not reveal which emails have accounts.
  return ok({
    sent: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  });
});
