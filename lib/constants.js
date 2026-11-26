export const ROLES = ['EMPLOYEE', 'AGENT', 'ADMIN'];
export const TICKET_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'WAITING',
  'RESOLVED',
  'CLOSED',
];
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const ROLE_LABELS = {
  EMPLOYEE: 'Сотрудник',
  AGENT: 'Исполнитель',
  ADMIN: 'Администратор',
};
export const STATUS_LABELS = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  WAITING: 'Ожидание',
  RESOLVED: 'Решена',
  CLOSED: 'Закрыта',
};
export const PRIORITY_LABELS = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};
export const OPEN_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING'];
export const SUPPORT_REQUEST_TYPES = ['COMPLAINT', 'QUESTION', 'QUALITY'];
export const SUPPORT_REQUEST_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED'];
export const ACTIVE_SUPPORT_REQUEST_STATUSES = ['OPEN', 'IN_REVIEW'];
