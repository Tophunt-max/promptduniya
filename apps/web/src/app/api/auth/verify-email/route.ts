import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { verifyEmailSchema } from '@/lib/validation';
import { findUserById, issueVerificationEmail, verifyEmail } from '@/services/auth';

export const dynamic = 'force-dynamic';

/** Consumes a verification token from the emailed link. */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('emailVerify');

  const body = await parseBody(request, verifyEmailSchema);
  await verifyEmail(body.token);

  return ok({ verified: true, message: 'Your email address is verified.' });
});

/** Re-sends the verification email to the signed-in user. */
export const PUT = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('emailVerify');

  const sessionUser = await requireUser();
  const user = await findUserById(sessionUser.id);
  if (user) await issueVerificationEmail(user);

  return ok({ sent: true, message: 'Verification email sent. Check your inbox.' });
});
