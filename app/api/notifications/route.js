import { apiRoute } from '../../../lib/http.js';
import { getNotifications } from '../../../lib/notifications.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (_request, _context, user) =>
  Response.json(await getNotifications(user), {
    headers: { 'Cache-Control': 'private, no-store' },
  }),
);
