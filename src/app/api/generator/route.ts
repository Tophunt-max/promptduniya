import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { generatorInputSchema } from '@/lib/validation';
import { generatePrompt } from '@/services/generator';

export const dynamic = 'force-dynamic';

/**
 * Advanced prompt generation.
 *
 * Quota is enforced server-side inside `generatePrompt`, and the `useAi` flag is
 * only honoured for members holding the advanced-generator entitlement — the AI
 * API key never leaves the server either way.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('generator');

  const form = await parseBody(request, generatorInputSchema);

  const result = await generatePrompt({
    access: context.access,
    visitorHash: context.visitorHash,
    form,
  });

  return ok({
    id: result.id,
    title: result.title,
    prompt: result.prompt,
    negativePrompt: result.negativePrompt,
    tips: result.tips,
    engine: result.engine,
    aiModel: result.aiModel,
    usage: {
      used: result.usage.used,
      limit: result.usage.limit,
      remaining: result.usage.unlimited ? -1 : result.usage.remaining,
      unlimited: result.usage.unlimited,
    },
  });
});
