import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { promptCopySchema } from '@/lib/validation';
import { copyPrompt, withInstructions } from '@/services/engagement';
import { getPromptById } from '@/services/prompts';

export const dynamic = 'force-dynamic';

/**
 * Serves the prompt body for a copy/download action.
 *
 * This endpoint is the single gate for prompt text: it enforces the premium
 * entitlement and the daily copy quota before returning anything, which is why
 * prompt bodies are never embedded in listing payloads.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('copy');

  const body = await parseBody(request, promptCopySchema);

  const result = await copyPrompt({
    access: context.access,
    visitorHash: context.visitorHash,
    promptId: body.promptId,
    variant: body.variant,
  });

  // The "with instructions" and download variants get a formatted document.
  let formatted: string | undefined;
  if (body.variant !== 'plain') {
    const prompt = await getPromptById(body.promptId);
    if (prompt) {
      formatted = withInstructions({
        title: prompt.title,
        aiModel: prompt.aiModel,
        promptText: result.promptText,
        negativePrompt: result.negativePrompt,
        usageInstructions: result.usageInstructions,
      });
    }
  }

  return ok({
    promptText: result.promptText,
    negativePrompt: result.negativePrompt,
    usageInstructions: result.usageInstructions,
    formatted,
    copyCount: result.copyCount,
    usage: {
      used: result.usage.used,
      limit: result.usage.limit,
      remaining: result.usage.unlimited ? -1 : result.usage.remaining,
      unlimited: result.usage.unlimited,
    },
  });
});
