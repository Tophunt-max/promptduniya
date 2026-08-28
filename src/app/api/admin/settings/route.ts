import { handle, ok, parseBody } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { settingsWriteSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { getSettings, setSettings } from '@/services/settings';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireAdmin();

  return ok({ settings: await getSettings() });
});

/**
 * Writes runtime settings.
 *
 * Only the administrator role may change limits, prices and toggles. Every
 * change is written to the audit log with the keys that were touched.
 */
export const PUT = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireAdmin();

  const body = await parseBody(request, settingsWriteSchema);
  await setSettings(body.values, actor.id);

  await logAdminAction({
    actorId: actor.id,
    action: 'settings.update',
    targetType: 'settings',
    meta: { keys: Object.keys(body.values) },
    ipHash: context.ipHash,
  });

  return ok({ settings: await getSettings() });
});
