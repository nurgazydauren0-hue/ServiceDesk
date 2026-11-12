export const MAX_TICKET_FAVORITES = 100;

export function isFavoriteTicketId(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function validateFavoriteIds(value) {
  return Array.isArray(value)
    && value.length <= MAX_TICKET_FAVORITES
    && Array.from(value).every(isFavoriteTicketId)
    && new Set(value).size === value.length;
}

export function normalizeFavoriteIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isFavoriteTicketId))].slice(0, MAX_TICKET_FAVORITES);
}

export function toggleFavoriteId(value, ticketId) {
  const ids = normalizeFavoriteIds(value);
  if (!isFavoriteTicketId(ticketId)) return ids;
  if (ids.includes(ticketId)) return ids.filter((id) => id !== ticketId);
  // Reaching the limit must not silently remove a previously saved ticket.
  return ids.length < MAX_TICKET_FAVORITES ? [...ids, ticketId] : ids;
}
