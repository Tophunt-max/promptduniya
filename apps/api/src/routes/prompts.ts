import { Hono } from 'hono';

import { FEATURES, promptCopySchema, promptListQuerySchema, promptIdSchema } from '@pd/shared';
import { AppError } from '../lib/errors';
import { limit, withAccess, requireUser, type Vars } from '../middleware';
import { hasFeature } from '../services/entitlements';
import {
  allPublishedSlugs,
  decorateViewer,
  featuredPrompts,
  getPromptBySlug,
  latestPrompts,
  listPrompts,
  premiumShowcase,
  recordView,
  relatedPrompts,
  trendingPrompts,
} from '../services/prompts';
import { copyPrompt, toggleFavorite, toggleLike } from '../services/engagement';

/**
 * Public prompt endpoints. Listings never include a prompt body; the body is
 * only released by POST /copy, which enforces entitlement and the daily quota.
 */
const promptsRoute = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();

promptsRoute.use('*', withAccess);

promptsRoute.get('/', async (c) => {
  await limit(c, 'search');
  const raw = Object.fromEntries(new URL(c.req.url).searchParams);
  const query = promptListQuerySchema.parse(raw);
  const access = c.get('access');

  const result = await listPrompts({
    q: query.q,
    category: query.category,
    model: query.model,
    access: query.access as 'all' | 'free' | 'premium',
    sort: query.sort as never,
    style: query.style,
    page: query.page,
    pageSize: query.pageSize,
  });
  const items = await decorateViewer(result.items, access.userId);

  return c.json({ ok: true, data: { ...result, items } });
});

promptsRoute.get('/sitemap', async (c) => {
  const slugs = await allPublishedSlugs();
  return c.json({ ok: true, data: { slugs } });
});

/**
 * Home-page rails in a single round trip. Fetching these together keeps the
 * SSR render to one API call instead of four.
 */
promptsRoute.get('/collections', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const size = (key: string, fallback: number) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? Math.min(value, 40) : fallback;
  };
  const viewerId = c.get('access').userId;

  const [trending, latest, featured, premium] = await Promise.all([
    trendingPrompts(size('trending', 8), viewerId),
    latestPrompts(size('latest', 8), viewerId),
    featuredPrompts(size('featured', 6), viewerId),
    premiumShowcase(size('premium', 4), viewerId),
  ]);

  return c.json({ ok: true, data: { trending, latest, featured, premium } });
});

/** Recommendation rails for a detail page. */
promptsRoute.get('/:slug/related', async (c) => {
  const access = c.get('access');
  const prompt = await getPromptBySlug(c.req.param('slug'), { viewerId: access.userId });
  if (!prompt) throw AppError.notFound('Prompt not found');
  const groups = await relatedPrompts(
    {
      id: prompt.id,
      categorySlug: prompt.categorySlug,
      aiModel: prompt.aiModel,
      style: prompt.style,
    },
    access.userId,
  );
  return c.json({ ok: true, data: groups });
});

/** View counter. De-duplicated per visitor per day inside the service. */
promptsRoute.post('/view', async (c) => {
  await limit(c, 'view');
  const body = promptIdSchema.parse(await c.req.json());
  const access = c.get('access');
  await recordView({
    promptId: body.promptId,
    userId: access.userId,
    visitorHash: c.get('visitorHash'),
    referrer: c.req.header('referer') ?? null,
  });
  return c.json({ ok: true, data: { recorded: true } });
});

promptsRoute.get('/:slug', async (c) => {
  const access = c.get('access');
  const canSeePremium = hasFeature(access, FEATURES.premiumPrompts);
  const prompt = await getPromptBySlug(c.req.param('slug'), {
    viewerId: access.userId,
    canSeePremium,
  });
  if (!prompt) throw AppError.notFound('Prompt not found');
  return c.json({ ok: true, data: prompt });
});

promptsRoute.post('/copy', async (c) => {
  await limit(c, 'copy');
  const body = promptCopySchema.parse(await c.req.json());
  const access = c.get('access');

  const result = await copyPrompt({
    access,
    visitorHash: c.get('visitorHash'),
    promptId: body.promptId,
    variant: body.variant,
  });

  return c.json({
    ok: true,
    data: {
      promptText: result.promptText,
      negativePrompt: result.negativePrompt,
      usageInstructions: result.usageInstructions,
      formatted: result.formatted,
      copyCount: result.copyCount,
      usage: {
        used: result.usage.used,
        limit: result.usage.limit,
        remaining: result.usage.unlimited ? -1 : result.usage.remaining,
        unlimited: result.usage.unlimited,
      },
    },
  });
});

promptsRoute.post('/like', async (c) => {
  await limit(c, 'like');
  const claims = requireUser(c);
  const body = promptIdSchema.parse(await c.req.json());
  const result = await toggleLike(claims.sub, body.promptId);
  return c.json({ ok: true, data: result });
});

promptsRoute.post('/favorite', async (c) => {
  await limit(c, 'favorite');
  requireUser(c);
  const body = promptIdSchema.parse(await c.req.json());
  const result = await toggleFavorite(c.get('access'), body.promptId);
  return c.json({
    ok: true,
    data: {
      saved: result.saved,
      usage: {
        used: result.usage.used,
        limit: result.usage.limit,
        remaining: result.usage.unlimited ? -1 : result.usage.remaining,
        unlimited: result.usage.unlimited,
      },
    },
  });
});

export default promptsRoute;
