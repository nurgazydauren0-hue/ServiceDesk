import { apiRoute } from '../../../lib/http.js';
import { getDashboard } from '../../../lib/service-desk.js';
import { parseTrendFilters } from '../../../lib/validation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (request, _context, user) =>
  Response.json(await getDashboard(user, parseTrendFilters(new URL(request.url).searchParams))),
);
