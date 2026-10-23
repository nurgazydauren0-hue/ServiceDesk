import { apiRoute } from '../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (_request, _context, user) =>
  Response.json({ user }),
);
