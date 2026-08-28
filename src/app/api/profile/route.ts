import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { changePasswordSchema, updateProfileSchema } from '@/lib/validation';
import { changePassword, updateProfile } from '@/services/auth';

export const dynamic = 'force-dynamic';

export const PATCH = handle(async (request: Request) => {
  await routeContext(request);
  const user = await requireUser();

  const body = await parseBody(request, updateProfileSchema);
  await updateProfile(user.id, body);

  return ok({ updated: true, message: 'Profile updated.' });
});

export const PUT = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('passwordReset');

  const user = await requireUser();
  const body = await parseBody(request, changePasswordSchema);

  await changePassword(user.id, body.currentPassword, body.newPassword);
  return ok({ updated: true, message: 'Password changed.' });
});
