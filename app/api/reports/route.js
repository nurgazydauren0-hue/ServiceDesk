import { apiRoute } from '../../../lib/http.js';
import { getReports } from '../../../lib/service-desk.js';
import { parseTrendFilters } from '../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(
  async (request, _context, user) => {
    const params = new URL(request.url).searchParams;
    return Response.json(await getReports(user, {
      ...parseTrendFilters(params),
      autoPeriod: !params.has('period'),
    }));
  },
  { roles: ['ADMIN'] },
);
