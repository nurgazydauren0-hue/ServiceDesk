import { apiRoute } from '../../../lib/http.js';
import { getSupportCenter } from '../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (_request, _context, user) =>
  Response.json(await getSupportCenter(user)),
);
