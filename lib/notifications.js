import { prisma } from './prisma.js';
import { ticketScope } from './policies.js';
import {
  buildNotificationEvents,
  NOTIFICATION_DAYS,
  NOTIFICATION_LIMIT,
} from './notification-events.js';

const ticketSelect = {
  id: true,
  title: true,
  status: true,
  createdById: true,
  assignedToId: true,
  createdAt: true,
  updatedAt: true,
};

export async function getNotifications(user, { now = new Date(), db = prisma } = {}) {
  const generatedAt = new Date(now);
  const since = new Date(generatedAt.getTime() - NOTIFICATION_DAYS * 86_400_000);
  const scope = ticketScope(user);
  const window = { gte: since, lte: generatedAt };

  // Each source is bounded independently so one busy ticket cannot hide comments
  // or newly created tickets elsewhere in the accessible workspace.
  const [createdTickets, updatedTickets, comments] = await Promise.all([
    db.ticket.findMany({
      where: { AND: [scope, { createdAt: window }] },
      select: ticketSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NOTIFICATION_LIMIT,
    }),
    db.ticket.findMany({
      where: { AND: [scope, { updatedAt: window }] },
      select: ticketSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: NOTIFICATION_LIMIT,
    }),
    db.comment.findMany({
      where: {
        AND: [
          { ticket: { is: scope } },
          { authorId: { not: user.id } },
          { createdAt: window },
        ],
      },
      select: {
        id: true,
        authorId: true,
        createdAt: true,
        author: { select: { name: true } },
        ticket: { select: ticketSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { ticketId: 'desc' }, { id: 'desc' }],
      take: NOTIFICATION_LIMIT,
    }),
  ]);

  return {
    notifications: buildNotificationEvents(
      user,
      { createdTickets, updatedTickets, comments },
      { since, now: generatedAt },
    ),
    generatedAt: generatedAt.toISOString(),
    since: since.toISOString(),
  };
}
