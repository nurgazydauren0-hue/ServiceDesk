import { TICKET_PRIORITIES } from './constants.js';

export const EMPTY_TICKET_DRAFT = Object.freeze({
  title: '',
  description: '',
  categoryId: '',
  priority: 'MEDIUM',
});

export function isTicketDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 4 || !keys.every((key) => Object.hasOwn(EMPTY_TICKET_DRAFT, key)))
    return false;
  return (
    typeof value.title === 'string' && value.title.length <= 160 &&
    typeof value.description === 'string' && value.description.length <= 5000 &&
    typeof value.categoryId === 'string' && value.categoryId.length <= 64 &&
    TICKET_PRIORITIES.includes(value.priority)
  );
}

export function hasTicketDraft(value) {
  return isTicketDraft(value) && (
    value.title !== '' || value.description !== '' || value.categoryId !== '' ||
    value.priority !== EMPTY_TICKET_DRAFT.priority
  );
}

export function isCommentDraft(value) {
  return typeof value === 'string' && value.length <= 4000;
}
