import { ApiError } from './api-errors.js';

export function ticketScope(user) {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'AGENT')
    return { OR: [{ assignedToId: user.id }, { createdById: user.id }] };
  return { createdById: user.id };
}

export function canReadTicket(user, ticket) {
  return (
    user.role === 'ADMIN' ||
    ticket.createdById === user.id ||
    (user.role === 'AGENT' && ticket.assignedToId === user.id)
  );
}

export function canEditTicket(user, ticket) {
  return (
    user.role === 'ADMIN' ||
    (ticket.createdById === user.id &&
      ticket.status === 'NEW' &&
      ticket.assignedToId === null)
  );
}

export const canDeleteTicket = canEditTicket;
export function canManageTicket(user, ticket) {
  return (
    user.role === 'ADMIN' ||
    (user.role === 'AGENT' && ticket.assignedToId === user.id)
  );
}

export function assertTicketAccess(user, ticket) {
  if (!ticket || !canReadTicket(user, ticket))
    throw new ApiError('Заявка не найдена.', 404);
  return ticket;
}
