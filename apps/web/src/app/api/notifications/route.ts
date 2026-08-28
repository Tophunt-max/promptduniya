import { z } from 'zod';

import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { idSchema, notificationPrefsSchema } from '@/lib/validation';
import {
  listNotifications,
  markRead,
  unreadCount,
  updatePreferences,
} from '@/services/notifications';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  await routeContext(request, { csrf: false });
  const user = await requireUser();

  const [items, unread] = await Promise.all([
    listNotifications(user.id, 30),
    unreadCount(user.id),
  ]);

  return ok({ items, unread });
});

/** Marks one notification (or all of them) as read. */
export const PATCH = handle(async (request: Request) => {
  await routeContext(request);
  const user = await requireUser();

  const body = await parseBody(
    request,
    z.object({ notificationId: idSchema.optional(), all: z.boolean().optional() }),
  );

  await markRead(user.id, body.all ? undefined : body.notificationId);
  return ok({ unread: await unreadCount(user.id) });
});

/** Updates notification preferences. */
export const PUT = handle(async (request: Request) => {
  await routeContext(request);
  const user = await requireUser();

  const body = await parseBody(request, notificationPrefsSchema);
  const preferences = await updatePreferences(user.id, body);

  return ok({ preferences });
});
