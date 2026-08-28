import { Hono } from 'hono';

import { contactSchema, reportSchema, searchQuerySchema, suggestQuerySchema } from '@pd/shared';
import { clientIp, limit, withAccess, type Vars } from '../middleware';
import { createReport, saveContactMessage } from '../services/admin';
import { allCategorySlugs, featuredCategories, getCategoryBySlug, listCategories, popularTags } from '../services/categories';
import { searchPrompts, suggest } from '../services/search';
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
  const result = await searchPrompts({ query: q, page, category: params.category, model: params.model });
  const items = await decorateViewer(result.items, access.userId);
  return c.json({ ok: true, data: { ...result, items, query: q } });
});

catalog.get('/search/suggest', async (c) => {
  await limit(c, 'search');
  const { q } = suggestQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  return c.json({ ok: true, data: { suggestions: await suggest(q), query: q } });
});

catalog.get('/plans', async (c) => {
  return c.json({ ok: true, data: { items: await listPlans({ activeOnly: true }) } });
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
