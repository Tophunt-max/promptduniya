import { Hono } from 'hono';

import { generatorInputSchema, randomGeneratorSchema, saveGeneratedSchema } from '@pd/shared';
import { AppError } from '../lib/errors';
import { limit, requireUser, withAccess, type Vars } from '../middleware';
import {
  deleteGenerated,
  generatePrompt,
  generateRandom,
  generatorStats,
  listGenerated,
  saveGenerated,
  unsaveGenerated,
} from '../services/generator';

const gen = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
gen.use('*', withAccess);

function usage(u: { used: number; limit: number; remaining: number; unlimited: boolean }) {
  return { used: u.used, limit: u.limit, remaining: u.unlimited ? -1 : u.remaining, unlimited: u.unlimited };
}

gen.post('/', async (c) => {
  await limit(c, 'generator');
  const form = generatorInputSchema.parse(await c.req.json());
  const r = await generatePrompt({ access: c.get('access'), visitorHash: c.get('visitorHash'), form });
  return c.json({
    ok: true,
    data: { id: r.id, title: r.title, prompt: r.prompt, negativePrompt: r.negativePrompt, tips: r.tips, engine: r.engine, aiModel: r.aiModel, usage: usage(r.usage) },
  });
});

gen.post('/random', async (c) => {
  await limit(c, 'generator');
  const body = randomGeneratorSchema.parse(await c.req.json().catch(() => ({})));
  const r = await generateRandom({ access: c.get('access'), visitorHash: c.get('visitorHash'), aiModel: body.aiModel });
  return c.json({
    ok: true,
    data: { id: r.id, title: r.title, prompt: r.prompt, negativePrompt: r.negativePrompt, tips: r.tips, engine: r.engine, aiModel: r.aiModel, brief: r.brief, usage: usage(r.usage) },
  });
});

gen.get('/', async (c) => {
  const claims = requireUser(c);
  const p = new URL(c.req.url).searchParams;
  const savedOnly = p.get('saved') === '1';
  const [items, stats] = await Promise.all([
    listGenerated(claims.sub, { savedOnly, limit: Number(p.get('limit')) || undefined }),
    generatorStats(claims.sub),
  ]);
  return c.json({ ok: true, data: { items, stats } });
});

gen.post('/save', async (c) => {
  const claims = requireUser(c);
  const body = saveGeneratedSchema.parse(await c.req.json());
  await saveGenerated(claims.sub, body.generatedId, body.title);
  return c.json({ ok: true, data: { saved: true } });
});

/** Un-stars a generation without deleting it. */
gen.post('/unsave', async (c) => {
  const claims = requireUser(c);
  const { generatedId } = (await c.req.json()) as { generatedId?: string };
  if (!generatedId) throw AppError.badRequest('generatedId is required');
  await unsaveGenerated(claims.sub, generatedId);
  return c.json({ ok: true, data: { saved: false } });
});

gen.delete('/:id', async (c) => {
  const claims = requireUser(c);
  await deleteGenerated(claims.sub, c.req.param('id'));
  return c.json({ ok: true, data: { deleted: true } });
});

export default gen;
