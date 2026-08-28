import { z } from 'zod';

import { handle, noContent, ok, parseBody } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { promptWriteSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import {
  deletePrompt,
  setPromptFlags,
  setPromptPublished,
  updatePrompt,
} from '@/services/prompts';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Quick flag toggles, used by the inline row actions. */
const flagsSchema = z.object({
  isPublished: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isTrending: z.boolean().optional(),
  isEditorsPick: z.boolean().optional(),
});

export const PATCH = handle(async (request: Request, context: Context) => {
  const routeCtx = await routeContext(request);
  await routeCtx.limit('adminWrite');
  const actor = await requireEditor();
  const { id } = await context.params;

  const raw = (await request.clone().json()) as Record<string, unknown>;
  const isFullUpdate = typeof raw.title === 'string' && typeof raw.promptText === 'string';

  if (isFullUpdate) {
    const body = await parseBody(request, promptWriteSchema);
    const result = await updatePrompt(id, body);

    await logAdminAction({
      actorId: actor.id,
      action: 'prompt.update',
      targetType: 'prompt',
      targetId: id,
      meta: { slug: result.slug },
      ipHash: routeCtx.ipHash,
    });

    return ok(result);
  }

  const flags = await parseBody(request, flagsSchema);

  if (flags.isPublished !== undefined) {
    await setPromptPublished(id, flags.isPublished);
  }

  const { isPublished, ...rest } = flags;
  void isPublished;
  if (Object.keys(rest).length > 0) await setPromptFlags(id, rest);

  await logAdminAction({
    actorId: actor.id,
    action: 'prompt.flags',
    targetType: 'prompt',
    targetId: id,
    meta: flags,
    ipHash: routeCtx.ipHash,
  });

  return ok({ id, ...flags });
});

export const DELETE = handle(async (request: Request, context: Context) => {
  const routeCtx = await routeContext(request);
  await routeCtx.limit('adminWrite');
  const actor = await requireEditor();
  const { id } = await context.params;

  await deletePrompt(id);

  await logAdminAction({
    actorId: actor.id,
    action: 'prompt.delete',
    targetType: 'prompt',
    targetId: id,
    ipHash: routeCtx.ipHash,
  });

  return noContent();
});
