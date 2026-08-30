import { Hono, type Context } from 'hono';

import {
  AI_SECRET_SETTING_KEYS,
  articleWriteSchema,
  categoryWriteSchema,
  couponWriteSchema,
  planWriteSchema,
  promptWriteSchema,
  studioDraftSchema,
  studioRunSchema,
} from '@pd/shared';
import { clientIp, requireAdmin, requireEditor, withAccess, type Vars } from '../middleware';
import { logAdminAction } from '../services/admin';
import { imageProviderStatus } from '../services/images';
import {
  generateHouseModel,
  generatePromptCover,
  listHouseModels,
  promptsMissingCovers,
} from '../services/images/covers';
import { draftPrompt } from '../services/studio/blueprint';
import { runStudioPipeline, studioStatus } from '../services/studio/pipeline';
import {
  adminGetPrompt,
  adminListPrompts,
  createPrompt,
  deletePrompt,
  setPromptFlags,
  setPromptPublished,
  updatePrompt,
} from '../services/prompts';
import {
  adminListCategories,
  createCategory,
  deleteCategory,
  getCategoryById,
  updateCategory,
} from '../services/categories';
import {
  adminListPlans,
  createPlan,
  deletePlan,
  setPlanActive,
  updatePlan,
} from '../services/plans';
import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  updateCoupon,
} from '../services/coupons';
import {
  adminListArticles,
  createArticle,
  deleteArticle,
  getArticleById,
  updateArticle,
} from '../services/articles';
import {
  adminListUsers,
  adminUpdateUser,
  adminUserDetail,
  listAdminLogs,
  listComments,
  listContactMessages,
  listReports,
  moderateComment,
  pendingModerationCounts,
  resolveReport,
  setContactMessageStatus,
} from '../services/admin';
import {
  dailyGeneratorUsage,
  dailyPremiumConversions,
  dailyPromptCopies,
  dailyPromptViews,
  dailyRevenue,
  dailySignups,
  dailyVisitors,
  platformStats,
  topCategories,
  topPrompts,
  topSearches,
} from '../services/analytics';
import {
  getSettings,
  redactSecretSettings,
  setSettings,
  type SettingValue,
} from '../services/settings';
import { adminListSubscriptions } from '../services/subscriptions';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  storageMode,
  uploadImage,
} from '../services/storage';
import { AppError } from '../lib/errors';
import { adminListPaymentEvents, adminListPayments } from '../services/payments';

/**
 * Admin API. Content routes require an editor; billing, users and settings
 * require a full administrator. Every mutation is written to the audit log.
 */
const admin = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
admin.use('*', withAccess);

type AdminCtx = Context<{ Bindings: Record<string, unknown>; Variables: Vars }>;

function qNum(c: AdminCtx, key: string): number | undefined {
  const v = new URL(c.req.url).searchParams.get(key);
  return v ? Number(v) : undefined;
}

/* ============================== Prompts =============================== */

admin.get('/prompts', async (c) => {
  requireEditor(c);
  const p = new URL(c.req.url).searchParams;
  const result = await adminListPrompts({
    q: p.get('q') ?? undefined,
    category: p.get('category') ?? undefined,
    model: p.get('model') ?? undefined,
    status: (p.get('status') as 'all' | 'published' | 'draft') ?? undefined,
    page: qNum(c, 'page'),
    pageSize: qNum(c, 'pageSize'),
  });
  return c.json({ ok: true, data: result });
});

admin.get('/prompts/:id', async (c) => {
  requireEditor(c);
  const prompt = await adminGetPrompt(c.req.param('id'));
  if (!prompt) return c.json({ ok: false, error: { code: 'not_found', message: 'Prompt not found' } }, 404);
  return c.json({ ok: true, data: prompt });
});

admin.post('/prompts', async (c) => {
  const claims = requireEditor(c);
  const body = promptWriteSchema.parse(await c.req.json());
  const prompt = await createPrompt(body, claims.sub);
  await logAdminAction({ actorId: claims.sub, action: 'prompt.create', targetType: 'prompt', targetId: prompt?.id, ip: clientIp(c) });
  return c.json({ ok: true, data: prompt }, 201);
});

admin.put('/prompts/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const body = promptWriteSchema.parse(await c.req.json());
  const prompt = await updatePrompt(id, body);
  await logAdminAction({ actorId: claims.sub, action: 'prompt.update', targetType: 'prompt', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: prompt });
});

admin.patch('/prompts/:id/publish', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const { isPublished } = (await c.req.json()) as { isPublished: boolean };
  const prompt = await setPromptPublished(id, Boolean(isPublished));
  await logAdminAction({ actorId: claims.sub, action: 'prompt.publish', targetType: 'prompt', targetId: id, meta: { isPublished }, ip: clientIp(c) });
  return c.json({ ok: true, data: prompt });
});

admin.patch('/prompts/:id/flags', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const body = (await c.req.json()) as Record<string, boolean>;
  const prompt = await setPromptFlags(id, body);
  await logAdminAction({ actorId: claims.sub, action: 'prompt.flags', targetType: 'prompt', targetId: id, meta: body, ip: clientIp(c) });
  return c.json({ ok: true, data: prompt });
});

admin.delete('/prompts/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  await deletePrompt(id);
  await logAdminAction({ actorId: claims.sub, action: 'prompt.delete', targetType: 'prompt', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: { deleted: true } });
});

/* ============================ Categories ============================== */

admin.get('/categories', async (c) => {
  requireEditor(c);
  return c.json({ ok: true, data: { items: await adminListCategories() } });
});

admin.post('/categories', async (c) => {
  const claims = requireEditor(c);
  const body = categoryWriteSchema.parse(await c.req.json());
  const category = await createCategory(body);
  await logAdminAction({ actorId: claims.sub, action: 'category.create', targetType: 'category', targetId: category?.id, ip: clientIp(c) });
  return c.json({ ok: true, data: category }, 201);
});

admin.put('/categories/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const body = categoryWriteSchema.parse(await c.req.json());
  const category = await updateCategory(id, body);
  await logAdminAction({ actorId: claims.sub, action: 'category.update', targetType: 'category', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: category });
});

admin.delete('/categories/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  await deleteCategory(id);
  await logAdminAction({ actorId: claims.sub, action: 'category.delete', targetType: 'category', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: { deleted: true } });
});

/* ============================== Articles ============================== */

admin.get('/articles', async (c) => {
  requireEditor(c);
  const p = new URL(c.req.url).searchParams;
  const result = await adminListArticles({
    q: p.get('q') ?? undefined,
    status: (p.get('status') as 'all' | 'published' | 'draft') ?? undefined,
    page: qNum(c, 'page'),
    pageSize: qNum(c, 'pageSize'),
  });
  return c.json({ ok: true, data: result });
});

admin.get('/articles/:id', async (c) => {
  requireEditor(c);
  const article = await getArticleById(c.req.param('id'));
  if (!article) return c.json({ ok: false, error: { code: 'not_found', message: 'Article not found' } }, 404);
  return c.json({ ok: true, data: article });
});

admin.post('/articles', async (c) => {
  const claims = requireEditor(c);
  const body = articleWriteSchema.parse(await c.req.json());
  const article = await createArticle(body, claims.sub);
  await logAdminAction({ actorId: claims.sub, action: 'article.create', targetType: 'article', targetId: article?.id, ip: clientIp(c) });
  return c.json({ ok: true, data: article }, 201);
});

admin.put('/articles/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const body = articleWriteSchema.parse(await c.req.json());
  const article = await updateArticle(id, body);
  await logAdminAction({ actorId: claims.sub, action: 'article.update', targetType: 'article', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: article });
});

admin.delete('/articles/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  await deleteArticle(id);
  await logAdminAction({ actorId: claims.sub, action: 'article.delete', targetType: 'article', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: { deleted: true } });
});

/* =============================== Plans ================================ */

admin.get('/plans', async (c) => {
  requireAdmin(c);
  return c.json({ ok: true, data: { items: await adminListPlans() } });
});

admin.post('/plans', async (c) => {
  const claims = requireAdmin(c);
  const body = planWriteSchema.parse(await c.req.json());
  const plan = await createPlan(body);
  await logAdminAction({ actorId: claims.sub, action: 'plan.create', targetType: 'plan', targetId: plan.id, ip: clientIp(c) });
  return c.json({ ok: true, data: plan }, 201);
});

admin.put('/plans/:id', async (c) => {
  const claims = requireAdmin(c);
  const id = c.req.param('id');
  const body = planWriteSchema.parse(await c.req.json());
  const plan = await updatePlan(id, body);
  await logAdminAction({ actorId: claims.sub, action: 'plan.update', targetType: 'plan', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: plan });
});

admin.patch('/plans/:id/active', async (c) => {
  const claims = requireAdmin(c);
  const id = c.req.param('id');
  const { isActive } = (await c.req.json()) as { isActive: boolean };
  const plan = await setPlanActive(id, Boolean(isActive));
  await logAdminAction({ actorId: claims.sub, action: 'plan.active', targetType: 'plan', targetId: id, meta: { isActive }, ip: clientIp(c) });
  return c.json({ ok: true, data: plan });
});

admin.delete('/plans/:id', async (c) => {
  const claims = requireAdmin(c);
  const id = c.req.param('id');
  await deletePlan(id);
  await logAdminAction({ actorId: claims.sub, action: 'plan.delete', targetType: 'plan', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: { deleted: true } });
});

/* ============================== Coupons =============================== */

admin.get('/coupons', async (c) => {
  requireAdmin(c);
  return c.json({ ok: true, data: { items: await listCoupons() } });
});

admin.post('/coupons', async (c) => {
  const claims = requireAdmin(c);
  const body = couponWriteSchema.parse(await c.req.json());
  const coupon = await createCoupon(body, claims.sub);
  await logAdminAction({ actorId: claims.sub, action: 'coupon.create', targetType: 'coupon', targetId: coupon.id, ip: clientIp(c) });
  return c.json({ ok: true, data: coupon }, 201);
});

admin.put('/coupons/:id', async (c) => {
  const claims = requireAdmin(c);
  const id = c.req.param('id');
  const body = couponWriteSchema.parse(await c.req.json());
  const coupon = await updateCoupon(id, body);
  await logAdminAction({ actorId: claims.sub, action: 'coupon.update', targetType: 'coupon', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: coupon });
});

admin.delete('/coupons/:id', async (c) => {
  const claims = requireAdmin(c);
  const id = c.req.param('id');
  await deleteCoupon(id);
  await logAdminAction({ actorId: claims.sub, action: 'coupon.delete', targetType: 'coupon', targetId: id, ip: clientIp(c) });
  return c.json({ ok: true, data: { deleted: true } });
});

/* =============================== Users ================================ */

admin.get('/users', async (c) => {
  requireAdmin(c);
  const p = new URL(c.req.url).searchParams;
  const result = await adminListUsers({
    q: p.get('q') ?? undefined,
    status: p.get('status') ?? undefined,
    role: p.get('role') ?? undefined,
    premium: p.get('premium') === '1' || p.get('premium') === 'true',
    page: qNum(c, 'page'),
    pageSize: qNum(c, 'pageSize'),
  });
  return c.json({ ok: true, data: result });
});

admin.get('/users/:id', async (c) => {
  requireAdmin(c);
  return c.json({ ok: true, data: await adminUserDetail(c.req.param('id')) });
});

/** Single edit endpoint: status, roles and premium grants in one call. */
admin.patch('/users/:id', async (c) => {
  const claims = requireAdmin(c);
  const body = (await c.req.json()) as {
    status?: 'active' | 'suspended';
    roles?: string[];
    grantPremiumDays?: number;
    revokePremium?: boolean;
  };
  await adminUpdateUser({
    actorId: claims.sub,
    userId: c.req.param('id'),
    status: body.status,
    roles: Array.isArray(body.roles) ? body.roles : undefined,
    grantPremiumDays: body.grantPremiumDays,
    revokePremium: body.revokePremium,
    ip: clientIp(c),
  });
  return c.json({ ok: true, data: { updated: true } });
});

admin.get('/moderation/counts', async (c) => {
  requireEditor(c);
  return c.json({ ok: true, data: await pendingModerationCounts() });
});

/* ============================ Moderation ============================== */

admin.get('/reports', async (c) => {
  requireEditor(c);
  const status = new URL(c.req.url).searchParams.get('status') ?? undefined;
  return c.json({ ok: true, data: { items: await listReports(status) } });
});

admin.patch('/reports/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const body = (await c.req.json()) as { status: 'reviewing' | 'resolved' | 'dismissed'; note?: string };
  await resolveReport(id, { status: body.status, resolvedBy: claims.sub, note: body.note });
  await logAdminAction({ actorId: claims.sub, action: 'report.resolve', targetType: 'report', targetId: id, meta: body, ip: clientIp(c) });
  return c.json({ ok: true, data: { updated: true } });
});

admin.get('/comments', async (c) => {
  requireEditor(c);
  const status = new URL(c.req.url).searchParams.get('status') ?? undefined;
  return c.json({ ok: true, data: { items: await listComments(status) } });
});

admin.patch('/comments/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const { status } = (await c.req.json()) as { status: 'approved' | 'rejected' };
  await moderateComment(id, { status, moderatorId: claims.sub });
  await logAdminAction({ actorId: claims.sub, action: 'comment.moderate', targetType: 'comment', targetId: id, meta: { status }, ip: clientIp(c) });
  return c.json({ ok: true, data: { updated: true } });
});

admin.get('/contact-messages', async (c) => {
  requireEditor(c);
  const status = new URL(c.req.url).searchParams.get('status') ?? undefined;
  return c.json({ ok: true, data: { items: await listContactMessages(status) } });
});

admin.patch('/contact-messages/:id', async (c) => {
  const claims = requireEditor(c);
  const id = c.req.param('id');
  const { status } = (await c.req.json()) as { status: 'new' | 'read' | 'replied' | 'spam' };
  await setContactMessageStatus(id, status);
  await logAdminAction({ actorId: claims.sub, action: 'contact.status', targetType: 'contact', targetId: id, meta: { status }, ip: clientIp(c) });
  return c.json({ ok: true, data: { updated: true } });
});

/* ============================= Analytics ============================== */

admin.get('/stats', async (c) => {
  requireEditor(c);
  return c.json({ ok: true, data: await platformStats() });
});

/** Every dashboard chart and leaderboard in one call. */
admin.get('/stats/series', async (c) => {
  requireEditor(c);
  const days = qNum(c, 'days') ?? 30;
  const [
    visitors,
    promptViews,
    promptCopies,
    generatorUsage,
    signups,
    revenue,
    conversions,
    prompts,
    searches,
    categories,
  ] = await Promise.all([
    dailyVisitors(days),
    dailyPromptViews(days),
    dailyPromptCopies(days),
    dailyGeneratorUsage(days),
    dailySignups(days),
    dailyRevenue(days),
    dailyPremiumConversions(days),
    topPrompts(10),
    topSearches(10, days),
    topCategories(8),
  ]);
  return c.json({
    ok: true,
    data: {
      visitors,
      promptViews,
      promptCopies,
      generatorUsage,
      signups,
      revenue,
      conversions,
      topPrompts: prompts,
      topSearches: searches,
      topCategories: categories,
    },
  });
});

/* ------------------------------- Uploads -------------------------------- */

/**
 * Image upload straight to R2. Validation (size, MIME allow-list, magic bytes)
 * happens in the service before a single byte is stored.
 */
admin.post('/upload', async (c) => {
  const claims = requireEditor(c);
  const form = await c.req.formData();
  const file = form.get('file') as unknown;
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
    throw AppError.badRequest('A file is required');
  }

  const folder = form.get('folder');
  const stored = await uploadImage({
    file: file as File,
    folder: typeof folder === 'string' ? folder : undefined,
  });

  await logAdminAction({
    actorId: claims.sub,
    action: 'media.upload',
    targetType: 'media',
    targetId: stored.objectKey,
    meta: { size: stored.fileSize, mime: stored.mimeType },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: stored }, 201);
});

admin.get('/upload/config', async (c) => {
  requireEditor(c);
  return c.json({
    ok: true,
    data: { maxBytes: MAX_UPLOAD_BYTES, driver: storageMode(), allowed: [...ALLOWED_MIME_TYPES] },
  });
});

/* -------------------------- Image generation ---------------------------- */

/**
 * What is wired up, so the admin screen can explain itself rather than failing
 * halfway through a batch.
 */
admin.get('/images/status', async (c) => {
  requireEditor(c);
  const [models, missing] = await Promise.all([listHouseModels(), promptsMissingCovers()]);
  return c.json({
    ok: true,
    data: {
      ...imageProviderStatus(),
      houseModels: models,
      missingCovers: missing,
      missingCount: missing.length,
    },
  });
});

/**
 * Generates a cover for one prompt.
 *
 * One prompt per request on purpose. Generation takes tens of seconds, so the
 * admin client drives the loop and shows progress — a failure partway through a
 * batch then costs one image rather than the whole run.
 */
admin.post('/prompts/:id/cover', async (c) => {
  const claims = requireEditor(c);
  const force = new URL(c.req.url).searchParams.get('force') === 'true';
  const result = await generatePromptCover(c.req.param('id'), { force });

  await logAdminAction({
    actorId: claims.sub,
    action: 'prompt.cover.generate',
    targetType: 'prompt',
    targetId: result.promptId,
    // The engine is logged because a fallback can quietly swap providers, and a
    // cover drawn by a different model looks different.
    meta: { engine: result.engine, usedReference: result.usedReference, url: result.url },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result }, 201);
});

/* ----------------------------- Content studio ---------------------------- */

/** Which providers are wired up, so the studio screen can explain itself. */
admin.get('/studio/status', async (c) => {
  requireEditor(c);
  return c.json({ ok: true, data: studioStatus() });
});

/**
 * Writes one prompt without saving it — a preview so an operator can judge the
 * model's output before committing a batch to the catalogue.
 */
admin.post('/studio/draft', async (c) => {
  requireEditor(c);
  const body = studioDraftSchema.parse(await c.req.json());

  const category = await getCategoryById(body.categoryId);
  if (!category) throw AppError.badRequest('Unknown category');

  const draft = await draftPrompt({
    theme: body.theme,
    categorySlug: category.slug,
    categoryName: category.name,
    aiModel: body.aiModel,
    inputMode: body.inputMode,
    isPremium: body.isPremium ?? false,
  });

  return c.json({ ok: true, data: draft });
});

/**
 * The full pipeline: write, save, illustrate, publish.
 *
 * One prompt per request. Each step takes tens of seconds, so the client loops
 * and shows progress rather than this endpoint accepting a count — a failure on
 * the eighth item then costs one item instead of the whole run.
 */
admin.post('/studio/run', async (c) => {
  const claims = requireEditor(c);
  const body = studioRunSchema.parse(await c.req.json());

  const result = await runStudioPipeline({
    theme: body.theme,
    categoryId: body.categoryId,
    aiModel: body.aiModel,
    inputMode: body.inputMode,
    isPremium: body.isPremium ?? false,
    publishMode: body.publishMode ?? 'draft',
    scheduledFor: body.scheduledFor ?? null,
    skipCover: body.skipCover ?? false,
    authorId: claims.sub,
  });

  await logAdminAction({
    actorId: claims.sub,
    action: 'studio.generate',
    targetType: 'prompt',
    targetId: result.promptId,
    meta: {
      theme: body.theme,
      textEngine: result.textEngine,
      imageEngine: result.imageEngine,
      published: result.published,
      coverError: result.coverError,
    },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result }, 201);
});

/**
 * Generates one synthetic house model — the reference face used for photo-edit
 * covers. Run once per kind; re-running replaces it.
 */
admin.post('/images/house-models/:kind', async (c) => {
  const claims = requireAdmin(c);
  const kind = c.req.param('kind');
  if (kind !== 'male' && kind !== 'female' && kind !== 'couple') {
    throw AppError.badRequest('kind must be one of male, female, couple');
  }

  const result = await generateHouseModel(kind);
  await logAdminAction({
    actorId: claims.sub,
    action: 'images.house_model.generate',
    targetType: 'setting',
    targetId: `images.house_model.${kind}`,
    meta: { engine: result.engine, url: result.url },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { kind, ...result } }, 201);
});

/* --------------------------- Billing records ---------------------------- */

admin.get('/subscriptions', async (c) => {
  requireAdmin(c);
  const status = new URL(c.req.url).searchParams.get('status') ?? undefined;
  const result = await adminListSubscriptions({
    status,
    page: qNum(c, 'page'),
    pageSize: qNum(c, 'pageSize'),
  });
  return c.json({ ok: true, data: result });
});

admin.get('/payments', async (c) => {
  requireAdmin(c);
  const status = new URL(c.req.url).searchParams.get('status') ?? undefined;
  const result = await adminListPayments({
    status,
    page: qNum(c, 'page'),
    pageSize: qNum(c, 'pageSize'),
  });
  return c.json({ ok: true, data: result });
});

admin.get('/payments/events', async (c) => {
  requireAdmin(c);
  const items = await adminListPaymentEvents(qNum(c, 'limit') ?? 50);
  return c.json({ ok: true, data: { items } });
});

admin.get('/logs', async (c) => {
  requireAdmin(c);
  const items = await listAdminLogs({ page: qNum(c, 'page'), pageSize: qNum(c, 'pageSize') });
  return c.json({ ok: true, data: { items } });
});

/* ============================== Settings ============================== */

admin.get('/settings', async (c) => {
  requireAdmin(c);
  // Provider API keys live in this table so they can be entered from the console.
  // They must never be sent back out — see redactSecretSettings.
  return c.json({ ok: true, data: redactSecretSettings(await getSettings()) });
});

admin.put('/settings', async (c) => {
  const claims = requireAdmin(c);
  const body = (await c.req.json()) as Record<string, SettingValue>;

  /*
   * Secrets are not writable through this endpoint.
   *
   * Two reasons. `GET` returns them as the placeholder `__set__`, so a screen that
   * round-tripped the whole map would overwrite a real key with that literal and
   * silently break every AI call. And credentials deserve a route that is
   * explicitly about credentials — PUT /v1/admin/ai-config — rather than arriving
   * in a bag of forty unrelated scalars.
   */
  const rejected = AI_SECRET_SETTING_KEYS.filter((key) => key in body);
  if (rejected.length > 0) {
    throw AppError.badRequest(
      `Set API keys on the AI providers screen, not here (${rejected.join(', ')}).`,
    );
  }

  await setSettings(body, claims.sub);
  await logAdminAction({ actorId: claims.sub, action: 'settings.update', meta: { keys: Object.keys(body) }, ip: clientIp(c) });
  return c.json({ ok: true, data: redactSecretSettings(await getSettings()) });
});

export default admin;
