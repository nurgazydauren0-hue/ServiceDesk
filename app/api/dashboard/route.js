import { apiRoute } from '../../../lib/http.js';
import { getDashboard } from '../../../lib/service-desk.js';
import { parseTrendFilters } from '../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (request, _context, user) => {
  const params = new URL(request.url).searchParams;
  return Response.json(await getDashboard(user, {
    ...parseTrendFilters(params),
    autoPeriod: !params.has('period'),
  }));
});
