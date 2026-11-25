import { apiRoute } from '../../../lib/http.js';
import { getNotifications, getNotificationPage, parseNotificationArchiveParams } from '../../../lib/notifications.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (request, _context, user) => {
  const archive = parseNotificationArchiveParams(new URL(request.url).searchParams);
  return Response.json(await (archive ? getNotificationPage(user, archive) : getNotifications(user)), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
});
