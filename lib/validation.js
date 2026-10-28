import { z } from 'zod';
import { ApiError } from './api-errors.js';
import { ROLES, TICKET_PRIORITIES, TICKET_STATUSES } from './constants.js';

const email = z
  .string()
  .trim()
  .max(254)
  .email('Укажите корректный email.')
  .transform((value) => value.toLowerCase());
const name = z
  .string()
  .trim()
  .min(2, 'Имя должно содержать хотя бы 2 символа.')
  .max(100, 'Имя слишком длинное.');
const password = z
  .string()
  .min(12, 'Используйте пароль не короче 12 символов.')
  .max(128, 'Пароль не должен превышать 128 символов.');
const id = z.string().trim().min(1).max(64);
const ticketFields = {
  title: z
    .string()
    .trim()
    .min(3, 'Название должно содержать хотя бы 3 символа.')
    .max(160, 'Название не должно превышать 160 символов.'),
  description: z
    .string()
    .trim()
    .min(10, 'Опишите проблему подробнее: хотя бы 10 символов.')
    .max(5000, 'Описание не должно превышать 5000 символов.'),
  categoryId: id,
  priority: z.enum(TICKET_PRIORITIES, {
    error: 'Выберите корректный приоритет.',
  }),
};
export const registrationSchema = z.object({ name, email, password }).strict();
// Administrator maintenance is explicit; public registration keeps its own policy.
export const bootstrapAdminSchema = registrationSchema.extend({
  password: z
    .string()
    .min(11, 'Пароль администратора должен содержать хотя бы 11 символов.')
    .max(128, 'Пароль администратора не должен превышать 128 символов.'),
});
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export const ticketCreateSchema = z
  .object({
    ...ticketFields,
    priority: ticketFields.priority.default('MEDIUM'),
  })
  .strict();
export const ticketUpdateSchema = z
  .object({
    ...ticketFields,
    status: z.enum(TICKET_STATUSES),
    assignedToId: id.nullable(),
  })
  .partial()
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'Нет изменений для сохранения.',
  );
export const commentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Введите комментарий.')
      .max(4000, 'Комментарий не должен превышать 4000 символов.'),
  })
  .strict();
export const profileUpdateSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    currentPassword: z.string().max(128).optional(),
    newPassword: password.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.newPassword !== undefined,
    'Нет изменений для сохранения.',
  );
export const teamUpdateSchema = z.object({ role: z.enum(ROLES) }).strict();
export const categorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Название категории слишком короткое.')
      .max(100),
  })
  .strict();

export function parseBody(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      result.error.issues[0]?.message || 'Проверьте введённые данные.',
      400,
    );
  return result.data;
}

export function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) throw new ApiError('Заявка не найдена.', 404);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new ApiError('Заявка не найдена.', 404);
  return value;
}

export function parseTicketFilters(params = new URLSearchParams()) {
  const schema = z.object({
    q: z.string().trim().max(160).default(''),
    status: z.enum(['', ...TICKET_STATUSES]).default(''),
    priority: z.enum(['', ...TICKET_PRIORITIES]).default(''),
    sort: z.enum(['newest', 'oldest', 'priority', 'updated']).default('newest'),
    mine: z.enum(['', '0', '1']).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  });
  return parseBody(schema, Object.fromEntries(params));
}
