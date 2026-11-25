import { prisma } from './prisma.js';
import { ticketScope } from './policies.js';
import { ApiError } from './api-errors.js';
import {
  buildNotificationEvents,
  collectNotificationEvents,
  NOTIFICATION_DAYS,
  NOTIFICATION_LIMIT,
} from './notification-events.js';

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE = 1000;

function validPage(page) {
  return Number.isSafeInteger(page) && page >= 1 && page <= NOTIFICATION_MAX_PAGE;
}

export function parseNotificationArchiveParams(searchParams, { now = new Date() } = {}) {
  const fail = () => { throw new ApiError('Укажите корректные параметры уведомлений.', 400); };
  for (const key of ['scope', 'page', 'asOf'])
    if (searchParams.getAll(key).length > 1) fail();
  const scope = searchParams.get('scope');
  if (scope === null) {
    if (searchParams.has('page') || searchParams.has('asOf')) fail();
    return null;
  }
  if (scope !== 'all') fail();
  const rawPage = searchParams.get('page') ?? '1';
  const page = Number(rawPage);
  if (!/^[1-9]\d{0,3}$/.test(rawPage) || !validPage(page)) fail();
  const asOf = searchParams.get('asOf');
  if (!asOf) {
    if (searchParams.has('asOf')) fail();
    return { page };
  }
  const snapshot = new Date(asOf);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(asOf) ||
      !Number.isFinite(snapshot.getTime()) || snapshot.toISOString() !== asOf || snapshot > now)
    fail();
  return { page, now: snapshot };
}

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

export async function getNotificationPage(user, { page = 1, now = new Date(), db = prisma } = {}) {
  if (!validPage(page)) throw new ApiError('Укажите корректный номер страницы уведомлений.', 400);
  const generatedAt = new Date(now);
  const scope = ticketScope(user);
  const offset = (page - 1) * NOTIFICATION_PAGE_SIZE;
  // Fetch the first K events from each ordered source. The global first K events
  // must belong to that union, including ties. No source can hide another source.
  const take = offset + NOTIFICATION_PAGE_SIZE + 1;
  const [createdTickets, updatedTickets, comments] = await Promise.all([
    db.ticket.findMany({
      where: { AND: [scope, { createdAt: { lte: generatedAt } }] },
      select: ticketSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    }),
    db.ticket.findMany({
      where: { AND: [scope, { updatedAt: { lte: generatedAt, gt: db.ticket.fields.createdAt } }] },
      select: ticketSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
    }),
    db.comment.findMany({
      where: { AND: [
        { ticket: { is: scope } },
        { authorId: { not: user.id } },
        { createdAt: { lte: generatedAt } },
      ] },
      select: {
        id: true,
        authorId: true,
        createdAt: true,
        author: { select: { name: true } },
        ticket: { select: ticketSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { ticketId: 'desc' }, { id: 'desc' }],
      take,
    }),
  ]);
  const events = collectNotificationEvents(
    user, { createdTickets, updatedTickets, comments }, { now: generatedAt },
  );
  return {
    notifications: events.slice(offset, offset + NOTIFICATION_PAGE_SIZE),
    page,
    pageSize: NOTIFICATION_PAGE_SIZE,
    hasMore: events.length > offset + NOTIFICATION_PAGE_SIZE,
    generatedAt: generatedAt.toISOString(),
    since: null,
  };
}
