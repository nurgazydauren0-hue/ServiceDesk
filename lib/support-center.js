// Support center: the conversation view of tickets.
// The ticket list answers "what tickets exist"; the support center answers
// "who is waiting for whom": a request waits for support until a staff member
// replies, and waits for the requester after that.
import { OPEN_STATUSES } from './constants.js';

const HOUR = 60 * 60 * 1000;

// First-response targets by priority, in hours.
export const RESPONSE_TARGET_HOURS = Object.freeze({
  URGENT: 2,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
});

const PRIORITY_RANK = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
const PREVIEW_LENGTH = 160;

function preview(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > PREVIEW_LENGTH ? `${clean.slice(0, PREVIEW_LENGTH - 1)}…` : clean;
}

function person(user) {
  return user ? { id: user.id, name: user.name, role: user.role } : null;
}

/**
 * Describes where the conversation of one ticket stands.
 * `ticket.comments` must hold the latest comment first (or be empty).
 */
export function conversationState(ticket, now = new Date()) {
  const last = ticket.comments?.[0] || null;
  const open = OPEN_STATUSES.includes(ticket.status);
  const lastFromRequester = !last || last.authorId === ticket.createdById;
  // WAITING means support has asked the requester for something.
  const awaitingSupport = open && ticket.status !== 'WAITING' && lastFromRequester;
  // Only WAITING asks the requester to act; otherwise support has replied and keeps working.
  const awaitingRequester = open && ticket.status === 'WAITING';
  const since = new Date(last?.createdAt || ticket.createdAt);
  const waitingHours = Math.max(0, (now.getTime() - since.getTime()) / HOUR);
  const targetHours = RESPONSE_TARGET_HOURS[ticket.priority] ?? RESPONSE_TARGET_HOURS.MEDIUM;
  return {
    open,
    awaitingSupport,
    awaitingRequester,
    supportWorking: open && !awaitingSupport && !awaitingRequester,
    // A reply from support the requester has not answered yet.
    supportReplied: !!last && last.authorId !== ticket.createdById,
    overdue: awaitingSupport && waitingHours > targetHours,
    waitingSince: since.toISOString(),
    waitingHours: Math.round(waitingHours * 10) / 10,
    targetHours,
    messages: ticket._count?.comments ?? 0,
    lastMessage: last
      ? { content: preview(last.content), createdAt: new Date(last.createdAt).toISOString(), author: person(last.author) }
      : null,
  };
}

/** Ticket fields the support center sends to the browser, plus its conversation state. */
export function supportItem(ticket, now = new Date()) {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: new Date(ticket.createdAt).toISOString(),
    category: ticket.category ? { id: ticket.category.id, name: ticket.category.name } : null,
    createdBy: person(ticket.createdBy),
    assignedTo: person(ticket.assignedTo),
    assignedToId: ticket.assignedToId ?? null,
    ...conversationState(ticket, now),
  };
}

/** Overdue first, then the most urgent, then whoever has waited longest. */
export function compareByUrgency(a, b) {
  return (
    Number(b.overdue) - Number(a.overdue) ||
    (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
    new Date(a.waitingSince) - new Date(b.waitingSince) ||
    a.id - b.id
  );
}

function sorted(items) {
  return [...items].sort(compareByUrgency);
}

/** Administrator console: the whole support line at once. */
export function buildAdminConsole({ tickets, staff, resolvedToday, activity }, now = new Date()) {
  const items = tickets.map((ticket) => supportItem(ticket, now)).filter((item) => item.open);
  const awaiting = items.filter((item) => item.awaitingSupport);
  const workload = staff.map((member) => {
    const own = items.filter((item) => item.assignedToId === member.id);
    return {
      ...person(member),
      open: own.length,
      awaitingReply: own.filter((item) => item.awaitingSupport).length,
      overdue: own.filter((item) => item.overdue).length,
      urgent: own.filter((item) => item.priority === 'URGENT').length,
    };
  }).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return {
    role: 'ADMIN',
    kpis: {
      awaitingReply: awaiting.length,
      overdue: awaiting.filter((item) => item.overdue).length,
      unassigned: items.filter((item) => !item.assignedToId).length,
      waitingRequester: items.filter((item) => item.status === 'WAITING').length,
      resolvedToday,
    },
    inbox: sorted(awaiting).slice(0, 12),
    unassigned: sorted(items.filter((item) => !item.assignedToId)).slice(0, 8),
    workload,
    activity: activity.map((comment) => ({
      id: comment.id,
      content: preview(comment.content),
      createdAt: new Date(comment.createdAt).toISOString(),
      author: person(comment.author),
      fromRequester: comment.authorId === comment.ticket.createdById,
      ticket: { id: comment.ticket.id, title: comment.ticket.title },
    })),
    targets: RESPONSE_TARGET_HOURS,
  };
}

/** IT specialist desk: own queue split by what the next step is. */
export function buildAgentDesk({ tickets, userId, resolvedWeek }, now = new Date()) {
  const items = tickets
    .filter((ticket) => ticket.assignedToId === userId)
    .map((ticket) => supportItem(ticket, now))
    .filter((item) => item.open);
  const reply = items.filter((item) => item.awaitingSupport);
  const waiting = items.filter((item) => item.status === 'WAITING');
  return {
    role: 'AGENT',
    kpis: {
      awaitingReply: reply.length,
      overdue: reply.filter((item) => item.overdue).length,
      inProgress: items.filter((item) => item.status === 'IN_PROGRESS').length,
      waitingRequester: waiting.length,
      resolvedWeek,
    },
    reply: sorted(reply),
    inWork: sorted(items.filter((item) => !item.awaitingSupport && item.status !== 'WAITING')),
    waiting: sorted(waiting),
    targets: RESPONSE_TARGET_HOURS,
  };
}

/** Requester help center: own conversations and where to start a new one. */
export function buildRequesterHelp({ tickets, categories, userId }, now = new Date()) {
  const items = tickets
    .filter((ticket) => ticket.createdById === userId)
    .map((ticket) => supportItem(ticket, now));
  const active = items
    .filter((item) => item.open)
    .sort((a, b) =>
      Number(b.awaitingRequester) - Number(a.awaitingRequester) ||
      new Date(b.lastMessage?.createdAt || b.createdAt) - new Date(a.lastMessage?.createdAt || a.createdAt));
  return {
    role: 'EMPLOYEE',
    kpis: {
      active: active.length,
      newReplies: active.filter((item) => item.awaitingRequester).length,
      resolved: items.filter((item) => !item.open).length,
    },
    active,
    resolved: items
      .filter((item) => !item.open)
      .sort((a, b) => b.id - a.id)
      .slice(0, 5),
    categories: categories
      .map((category) => ({ id: category.id, name: category.name }))
      // "Другое" is the fallback topic, so it goes last.
      .sort((a, b) => Number(a.name === 'Другое') - Number(b.name === 'Другое')),
    targets: RESPONSE_TARGET_HOURS,
  };
}
