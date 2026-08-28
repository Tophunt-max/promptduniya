import { Hono } from 'hono';

import { generatorInputSchema, randomGeneratorSchema, saveGeneratedSchema } from '@pd/shared';
import { limit, requireUser, withAccess, type Vars } from '../middleware';
import { generatePrompt, generateRandom, listGenerated, saveGenerated } from '../services/generator';

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
  const savedOnly = new URL(c.req.url).searchParams.get('saved') === '1';
  return c.json({ ok: true, data: { items: await listGenerated(claims.sub, { savedOnly }) } });
});

gen.post('/save', async (c) => {
  const claims = requireUser(c);
  const body = saveGeneratedSchema.parse(await c.req.json());
  await saveGenerated(claims.sub, body.generatedId, body.title);
  return c.json({ ok: true, data: { saved: true } });
});

export default gen;
