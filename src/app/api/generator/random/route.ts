import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { randomGeneratorSchema } from '@/lib/validation';
import { generateRandom } from '@/services/generator';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('randomGenerator');

  const body = await parseBody(request, randomGeneratorSchema);

  const result = await generateRandom({
    access: context.access,
    visitorHash: context.visitorHash,
    aiModel: body.aiModel,
  });

  return ok({
    id: result.id,
    title: result.title,
    prompt: result.prompt,
    negativePrompt: result.negativePrompt,
    tips: result.tips,
    engine: result.engine,
    aiModel: result.aiModel,
    brief: result.brief,
    usage: {
      used: result.usage.used,
      limit: result.usage.limit,
      remaining: result.usage.unlimited ? -1 : result.usage.remaining,
      unlimited: result.usage.unlimited,
    },
  });
});
