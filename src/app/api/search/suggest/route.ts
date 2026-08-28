import { handle, ok, parseQuery } from '@/lib/api';
import { publicContext } from '@/lib/route-context';
import { suggestQuerySchema } from '@/lib/validation';
import { suggest } from '@/services/search';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await publicContext(request);
  await context.limit('search');

  const { q } = parseQuery(request, suggestQuerySchema);
  const suggestions = await suggest(q, 8);

  return ok({ suggestions, query: q });
});
