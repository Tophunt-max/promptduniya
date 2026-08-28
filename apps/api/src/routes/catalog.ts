import { Hono } from 'hono';

import { searchQuerySchema, suggestQuerySchema } from '@pd/shared';
import { limit, withAccess, type Vars } from '../middleware';
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

export default catalog;
