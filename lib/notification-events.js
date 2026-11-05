import { canReadTicket } from './policies.js';

export const NOTIFICATION_LIMIT = 40;
export const NOTIFICATION_DAYS = 30;

function timestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function buildNotificationEvents(
  user,
  { createdTickets = [], updatedTickets = [], comments = [] },
  { since, now, limit = NOTIFICATION_LIMIT },
) {
  const start = timestamp(since);
  const end = timestamp(now);
  const events = new Map();
  const inWindow = (value) => value && value >= start && value <= end;

  function ticketEvent(type, ticket, createdAt, extra = {}, key = '') {
    if (!canReadTicket(user, ticket) || !inWindow(createdAt)) return;
    const id = `${type}:${ticket.id}:${key ? `${key}:` : ''}${createdAt}`;
    events.set(id, {
      id,
      type,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      createdAt,
      // This is the ticket's current status, not a historical transition.
      status: ticket.status,
      ...extra,
    });
  }

  for (const ticket of createdTickets) {
    ticketEvent('ticket_created', ticket, timestamp(ticket.createdAt));
  }
  for (const ticket of updatedTickets) {
    const createdAt = timestamp(ticket.createdAt);
    const updatedAt = timestamp(ticket.updatedAt);
    // There is no audit log: only report the latest update we can establish.
    if (createdAt && updatedAt && updatedAt > createdAt)
      ticketEvent('ticket_updated', ticket, updatedAt);
  }
  for (const comment of comments) {
    if (comment.authorId === user.id || !comment.ticket) continue;
    ticketEvent(
      'comment_added',
      comment.ticket,
      timestamp(comment.createdAt),
      { authorName: comment.author.name },
      comment.id,
    );
  }

  return [...events.values()]
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
      if (a.ticketId !== b.ticketId) return b.ticketId - a.ticketId;
      return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
    })
    .slice(0, Math.min(NOTIFICATION_LIMIT, Math.max(0, limit)));
}
