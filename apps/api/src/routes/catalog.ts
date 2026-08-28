import { Hono } from 'hono';

import {
  analyticsEventSchema,
  contactSchema,
  reportSchema,
  searchQuerySchema,
  suggestQuerySchema,
} from '@pd/shared';
import { trackEvent, trackPageView } from '../services/analytics';
import { clientIp, limit, withAccess, type Vars } from '../middleware';
import { createReport, saveContactMessage } from '../services/admin';
import {
  allArticleSlugs,
  getArticleBySlug,
  incrementArticleViews,
  listArticles,
  relatedArticles,
} from '../services/articles';
import { getBrand, getPublicSettings } from '../services/settings';
import { allCategorySlugs, featuredCategories, getCategoryBySlug, listCategories, popularTags } from '../services/categories';
import {
  noResultAlternatives,
  normalizeQuery,
  popularSearches,
  recentSearchesForUser,
  searchPrompts,
  suggest,
  trackSearch,
} from '../services/search';
import { decorateViewer } from '../services/prompts';
import { listPlans } from '../services/plans';

/** Categories, tags, search and the public pricing table. */
const catalog = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
catalog.use('*', withAccess);

catalog.get('/categories', async (c) => {
  const featured = new URL(c.req.url).searchParams.get('featured') === '1';
  const items = featured ? await featuredCategories(12) : await listCategories();
  return c.json({ ok: true, data: { items } });
});

catalog.get('/categories/slugs', async (c) => {
  return c.json({ ok: true, data: { slugs: await allCategorySlugs() } });
});

catalog.get('/categories/:slug', async (c) => {
  const category = await getCategoryBySlug(c.req.param('slug'));
  if (!category || !category.isActive) return c.json({ ok: false, error: { code: 'not_found', message: 'Category not found' } }, 404);
  return c.json({ ok: true, data: category });
});

catalog.get('/tags', async (c) => {
  return c.json({ ok: true, data: { items: await popularTags(24) } });
});

catalog.get('/search', async (c) => {
  await limit(c, 'search');
  const params = Object.fromEntries(new URL(c.req.url).searchParams);
  const { q, page } = searchQuerySchema.parse(params);
  const access = c.get('access');
  const result = await searchPrompts({
    query: q,
    page,
    category: params.category,
    model: params.model,
  });
  const items = await decorateViewer(result.items, access.userId);

  // Record the query so the popular/recent lists stay useful. Opt-out via
  // ?track=0 for prefetches and internal calls.
  if (params.track !== '0' && q.trim()) {
    await trackSearch({
      query: q,
      normalized: normalizeQuery(q),
      resultCount: result.total,
      userId: access.userId,
      visitorHash: c.get('visitorHash'),
    });
  }

  return c.json({ ok: true, data: { ...result, items, query: q } });
});

/** Popular terms, the viewer's recent searches, and empty-state fallbacks. */
catalog.get('/search/discovery', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const access = c.get('access');
  const emptyFor = params.get('q') ?? '';

  const [popular, recent, alternatives] = await Promise.all([
    popularSearches(Number(params.get('limit')) || 8),
    access.userId ? recentSearchesForUser(access.userId, 6) : Promise.resolve([]),
    emptyFor ? noResultAlternatives(emptyFor, 6) : Promise.resolve([]),
  ]);

  return c.json({ ok: true, data: { popular, recent, alternatives } });
});

catalog.get('/search/suggest', async (c) => {
  await limit(c, 'search');
  const { q } = suggestQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  return c.json({ ok: true, data: { suggestions: await suggest(q), query: q } });
});

catalog.get('/plans', async (c) => {
  return c.json({ ok: true, data: { items: await listPlans({ activeOnly: true }) } });
});

/* ------------------------------ Branding -------------------------------- */

/** Site identity + public settings, used by the website's layout and metadata. */
catalog.get('/brand', async (c) => {
  const [brand, settings] = await Promise.all([getBrand(), getPublicSettings()]);
  return c.json({ ok: true, data: { brand, settings } });
});

/* ------------------------------ Articles -------------------------------- */

catalog.get('/articles', async (c) => {
  const p = new URL(c.req.url).searchParams;
  const result = await listArticles({
    page: Number(p.get('page')) || undefined,
    pageSize: Number(p.get('pageSize')) || undefined,
  });
  return c.json({ ok: true, data: result });
});

catalog.get('/articles/slugs', async (c) => {
  return c.json({ ok: true, data: { slugs: await allArticleSlugs() } });
});

catalog.get('/articles/:slug', async (c) => {
  const article = await getArticleBySlug(c.req.param('slug'));
  if (!article) {
    return c.json({ ok: false, error: { code: 'not_found', message: 'Article not found' } }, 404);
  }
  const related = await relatedArticles(article.slug, article.categoryId, 3);
  return c.json({ ok: true, data: { ...article, related } });
});

/** View counter for an article. Fire-and-forget from the client. */
catalog.post('/articles/:id/view', async (c) => {
  await limit(c, 'view');
  await incrementArticleViews(c.req.param('id'));
  return c.json({ ok: true, data: { recorded: true } });
});

/* ------------------------------ Analytics ------------------------------- */

/**
 * First-party page-view / event beacon. Pseudonymous only: the visitor hash is
 * derived server-side from a keyed hash of IP + user agent, never stored raw.
 */
catalog.post('/events', async (c) => {
  await limit(c, 'analytics');
  const body = analyticsEventSchema.parse(await c.req.json());
  const access = c.get('access');
  const visitorHash = c.get('visitorHash');

  if (body.path) {
    await trackPageView({
      path: body.path,
      userId: access.userId,
      visitorHash,
      referrer: c.req.header('referer') ?? null,
    });
  }
  await trackEvent({ name: body.name, userId: access.userId, visitorHash, props: body.props });

  return c.json({ ok: true, data: { recorded: true } });
});

/* ------------------------- Public submissions --------------------------- */

/** Contact form. The honeypot field is validated by the shared schema. */
catalog.post('/contact', async (c) => {
  await limit(c, 'contact');
  const body = contactSchema.parse(await c.req.json());
  await saveContactMessage({
    name: body.name,
    email: body.email,
    subject: body.subject,
    message: body.message,
    ip: clientIp(c),
  });
  return c.json({ ok: true, data: { received: true } }, 201);
});

/** Content report. Works for signed-out visitors too. */
catalog.post('/reports', async (c) => {
  await limit(c, 'report');
  const body = reportSchema.parse(await c.req.json());
  await createReport({
    reporterId: c.get('access').userId,
    targetType: body.targetType,
    targetId: body.targetId,
    reason: body.reason,
    details: body.details,
  });
  return c.json({ ok: true, data: { received: true } }, 201);
});

export default catalog;
