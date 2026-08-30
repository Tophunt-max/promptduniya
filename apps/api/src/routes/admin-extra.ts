import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { cleanText, idSchema, paginationSchema } from '@pd/shared';

import { clientIp, limit, requireAdmin, requireEditor, withAccess, type Vars } from '../middleware';
import { AppError } from '../lib/errors';
import { logAdminAction } from '../services/admin';
import {
  BROADCAST_SEGMENTS,
  SEGMENT_LABELS,
  adminCancelSubscription,
  recentBroadcasts,
  segmentSizes,
  sendBroadcast,
} from '../services/broadcast';
import {
  dailyFavorites,
  dailyGeneratorUsage,
  dailyLikes,
  dailyPageViews,
  dailyPremiumConversions,
  dailyPromptCopies,
  dailyPromptViews,
  dailyRevenue,
  dailySignups,
  dailyVisitors,
  topCategories,
  topPages,
  topPrompts,
  topReferrers,
  topSearches,
  topTags,
} from '../services/analytics';
import {
  bulkAddTags,
  bulkClearSchedule,
  bulkDelete,
  bulkRemoveTags,
  bulkSchedule,
  bulkSetCategory,
  bulkSetFlags,
  bulkSetPublished,
} from '../services/prompts-bulk';
import {
  adminListTags,
  createTag,
  deleteTag,
  mergeTags,
  promptsForTag,
  pruneUnusedTags,
  recountTags,
  renameTag,
} from '../services/tags';
import { deleteManyMedia, deleteMedia, findMediaUsage, listMedia } from '../services/storage';
import { promptsNeedingSeo, regeneratePromptSeo } from '../services/studio/reseo';

/**
 * The second half of the admin API.
 *
 * Mounted at /v1/admin alongside routes/admin.ts, which is past 700 lines and
 * already covers a dozen resources. Splitting by "what was missing" rather than
 * by resource is admittedly arbitrary as a permanent boundary, but it keeps this
 * change reviewable and it keeps the existing file untouched. Hono merges the two
 * route tables, so the split is invisible to callers.
 *
 * Everything here backs a console screen that previously had no API to call, or
 * an API that no screen could reach.
 *
 * Authorisation follows the established split: editors do content work, full
 * administrators do anything that touches money, membership or a mass send.
 */
const extra = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
extra.use('*', withAccess);

type Ctx = Context<{ Bindings: Record<string, unknown>; Variables: Vars }>;

function query(c: Ctx): Record<string, string> {
  return Object.fromEntries(new URL(c.req.url).searchParams);
}

/* ================================== Tags ================================== */

const tagQuerySchema = paginationSchema.extend({
  q: cleanText(80).optional(),
  unusedOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .optional(),
});

extra.get('/tags', async (c) => {
  requireEditor(c);
  const params = tagQuerySchema.parse(query(c));
  return c.json({ ok: true, data: await adminListTags(params) });
});

extra.get('/tags/:id/prompts', async (c) => {
  requireEditor(c);
  const items = await promptsForTag(c.req.param('id'));
  return c.json({ ok: true, data: { items } });
});

extra.post('/tags', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = z.object({ name: cleanText(60, 1) }).parse(await c.req.json());
  const tag = await createTag(body.name);

  await logAdminAction({
    actorId: claims.sub,
    action: 'tag.create',
    targetType: 'tag',
    targetId: tag.id,
    meta: { name: tag.name },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: tag }, 201);
});

extra.patch('/tags/:id', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  const body = z.object({ name: cleanText(60, 1) }).parse(await c.req.json());
  const tag = await renameTag(id, body.name);

  await logAdminAction({
    actorId: claims.sub,
    action: 'tag.rename',
    targetType: 'tag',
    targetId: id,
    meta: { name: tag.name, slug: tag.slug },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: tag });
});

/**
 * Merges tags. Destructive and hard to reverse by hand, so administrator-only:
 * the source tags are deleted and their prompt links repointed.
 */
extra.post('/tags/merge', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const body = z
    .object({ targetId: idSchema, sourceIds: z.array(idSchema).min(1).max(50) })
    .parse(await c.req.json());

  const result = await mergeTags(body);

  await logAdminAction({
    actorId: claims.sub,
    action: 'tag.merge',
    targetType: 'tag',
    targetId: body.targetId,
    meta: { ...result },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

extra.delete('/tags/:id', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  const force = new URL(c.req.url).searchParams.get('force') === 'true';
  await deleteTag(id, { force });

  await logAdminAction({
    actorId: claims.sub,
    action: 'tag.delete',
    targetType: 'tag',
    targetId: id,
    meta: { force },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { id, deleted: true } });
});

extra.post('/tags/prune', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const result = await pruneUnusedTags();

  await logAdminAction({
    actorId: claims.sub,
    action: 'tag.prune',
    meta: { removed: result.removed },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

extra.post('/tags/recount', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const checked = await recountTags();

  await logAdminAction({
    actorId: claims.sub,
    action: 'tag.recount',
    meta: { checked },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { checked } });
});

/* ============================= Bulk prompt ops ============================ */

const idsSchema = z.object({ ids: z.array(idSchema).min(1).max(200) });

/**
 * One endpoint per verb rather than a single `{ action, ids }` switch.
 *
 * A discriminated body would need its own runtime dispatch and would make the
 * audit log entry generic ("prompts.bulk") for every one of these. Separate paths
 * keep each payload precisely typed and each log line specific about what
 * happened.
 */
extra.post('/prompts/bulk/publish', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = idsSchema.extend({ isPublished: z.boolean() }).parse(await c.req.json());
  const result = await bulkSetPublished(body.ids, body.isPublished);

  await logAdminAction({
    actorId: claims.sub,
    action: body.isPublished ? 'prompts.bulk.publish' : 'prompts.bulk.unpublish',
    targetType: 'prompt',
    meta: { ...result, requested: body.ids.length },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

extra.post('/prompts/bulk/schedule', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = idsSchema
    .extend({ scheduledFor: z.number().int().positive().nullable() })
    .parse(await c.req.json());

  const result = body.scheduledFor
    ? await bulkSchedule(body.ids, body.scheduledFor)
    : await bulkClearSchedule(body.ids);

  await logAdminAction({
    actorId: claims.sub,
    action: 'prompts.bulk.schedule',
    targetType: 'prompt',
    meta: { ...result, scheduledFor: body.scheduledFor },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

extra.post('/prompts/bulk/flags', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = idsSchema
    .extend({
      isFeatured: z.boolean().optional(),
      isTrending: z.boolean().optional(),
      isEditorsPick: z.boolean().optional(),
      isPremium: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const { ids, ...flags } = body;
  const result = await bulkSetFlags(ids, flags);

  await logAdminAction({
    actorId: claims.sub,
    action: 'prompts.bulk.flags',
    targetType: 'prompt',
    meta: { ...result, flags },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

extra.post('/prompts/bulk/category', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = idsSchema.extend({ categoryId: idSchema }).parse(await c.req.json());
  const result = await bulkSetCategory(body.ids, body.categoryId);

  await logAdminAction({
    actorId: claims.sub,
    action: 'prompts.bulk.category',
    targetType: 'prompt',
    meta: { ...result, categoryId: body.categoryId },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

extra.post('/prompts/bulk/tags', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = idsSchema
    .extend({
      tags: z.array(cleanText(60, 1)).min(1).max(20),
      mode: z.enum(['add', 'remove']).default('add'),
    })
    .parse(await c.req.json());

  const result =
    body.mode === 'add'
      ? await bulkAddTags(body.ids, body.tags)
      : await bulkRemoveTags(body.ids, body.tags);

  await logAdminAction({
    actorId: claims.sub,
    action: `prompts.bulk.tags.${body.mode}`,
    targetType: 'prompt',
    meta: { ...result, tags: body.tags },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

/** Administrator-only: the one bulk action that cannot be undone. */
extra.post('/prompts/bulk/delete', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const body = z.object({ ids: z.array(idSchema).min(1).max(50) }).parse(await c.req.json());
  const result = await bulkDelete(body.ids);

  await logAdminAction({
    actorId: claims.sub,
    action: 'prompts.bulk.delete',
    targetType: 'prompt',
    meta: { ...result, requested: body.ids.length },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

/* ============================ SEO regeneration ============================ */

extra.get('/prompts/seo/needs-attention', async (c) => {
  requireEditor(c);
  const items = await promptsNeedingSeo();
  return c.json({ ok: true, data: { items, count: items.length } });
});

extra.post('/prompts/:id/seo', async (c) => {
  const claims = requireEditor(c);
  // Spends a provider quota, so it carries the AI limit rather than adminWrite.
  await limit(c, 'aiGenerate');

  const id = c.req.param('id');
  const result = await regeneratePromptSeo(id);

  await logAdminAction({
    actorId: claims.sub,
    action: 'prompt.seo.regenerate',
    targetType: 'prompt',
    targetId: id,
    meta: { engine: result.engine, seoTitle: result.seoTitle },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

/* =============================== Media library ============================ */

extra.get('/media', async (c) => {
  requireEditor(c);
  const params = query(c);
  return c.json({
    ok: true,
    data: await listMedia({
      prefix: params.prefix || undefined,
      cursor: params.cursor || undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    }),
  });
});

/** Whether anything still references a file, so a delete can warn first. */
extra.get('/media/usage', async (c) => {
  requireEditor(c);
  const key = new URL(c.req.url).searchParams.get('key');
  if (!key) throw AppError.badRequest('A key is required');
  return c.json({ ok: true, data: await findMediaUsage(key) });
});

extra.delete('/media', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const key = new URL(c.req.url).searchParams.get('key');
  if (!key) throw AppError.badRequest('A key is required');

  await deleteMedia(key);

  await logAdminAction({
    actorId: claims.sub,
    action: 'media.delete',
    targetType: 'media',
    targetId: key,
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { key, deleted: true } });
});

extra.post('/media/bulk-delete', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = z
    .object({ keys: z.array(z.string().min(1).max(400)).min(1).max(100) })
    .parse(await c.req.json());

  const result = await deleteManyMedia(body.keys);

  await logAdminAction({
    actorId: claims.sub,
    action: 'media.bulk_delete',
    targetType: 'media',
    meta: { deleted: result.deleted, failed: result.failed.length },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

/* ================================ Analytics =============================== */

const rangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

/**
 * The full analytics payload.
 *
 * Separate from `/stats/series`, which the dashboard already calls, because this
 * one is deliberately expensive: eleven series and six leaderboards. Keeping the
 * dashboard's request light and letting the analytics screen ask for everything
 * means the landing page of the console does not pay for charts nobody is looking
 * at yet.
 */
extra.get('/analytics', async (c) => {
  requireEditor(c);
  const { days } = rangeSchema.parse(query(c));

  const [
    pageViewsSeries,
    visitors,
    promptViews,
    copies,
    favorites,
    likes,
    generator,
    signups,
    revenue,
    conversions,
    prompts,
    searches,
    cats,
    tagRows,
    referrers,
    pages,
  ] = await Promise.all([
    dailyPageViews(days),
    dailyVisitors(days),
    dailyPromptViews(days),
    dailyPromptCopies(days),
    dailyFavorites(days),
    dailyLikes(days),
    dailyGeneratorUsage(days),
    dailySignups(days),
    dailyRevenue(days),
    dailyPremiumConversions(days),
    topPrompts(12),
    topSearches(12, days),
    topCategories(12),
    topTags(12),
    topReferrers(10, days),
    topPages(10, days),
  ]);

  return c.json({
    ok: true,
    data: {
      days,
      series: {
        pageViews: pageViewsSeries,
        visitors,
        promptViews,
        promptCopies: copies,
        favorites,
        likes,
        generatorUsage: generator,
        signups,
        revenue,
        conversions,
      },
      leaderboards: {
        topPrompts: prompts,
        topSearches: searches,
        topCategories: cats,
        topTags: tagRows,
        topReferrers: referrers,
        topPages: pages,
      },
    },
  });
});

/* =============================== Broadcasts =============================== */

extra.get('/broadcasts', async (c) => {
  requireAdmin(c);
  const [sizes, recent] = await Promise.all([segmentSizes(), recentBroadcasts()]);
  return c.json({
    ok: true,
    data: {
      segments: BROADCAST_SEGMENTS.map((id) => ({
        id,
        label: SEGMENT_LABELS[id],
        size: sizes[id],
      })),
      recent,
    },
  });
});

/**
 * Sends to a segment.
 *
 * Administrator-only and rate limited hard. This is the only action in the whole
 * console that reaches every member at once and cannot be recalled.
 */
extra.post('/broadcasts', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'broadcast');

  const body = z
    .object({
      segment: z.enum(BROADCAST_SEGMENTS),
      title: cleanText(160, 3),
      body: cleanText(600).optional(),
      href: cleanText(300).optional(),
      force: z.boolean().optional().default(false),
    })
    .parse(await c.req.json());

  const result = await sendBroadcast(body);

  await logAdminAction({
    actorId: claims.sub,
    action: 'broadcast.send',
    targetType: 'notification',
    meta: { ...result, title: body.title, forced: body.force },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result }, 201);
});

/* ============================== Subscriptions ============================= */

extra.post('/subscriptions/:id/cancel', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  const result = await adminCancelSubscription(id);

  await logAdminAction({
    actorId: claims.sub,
    action: 'subscription.cancel',
    targetType: 'subscription',
    targetId: id,
    meta: { ...result },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

export default extra;
