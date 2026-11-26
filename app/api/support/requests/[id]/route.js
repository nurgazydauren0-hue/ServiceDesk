import { apiRoute } from '../../../../../lib/http.js';
import { ApiError, readJsonBody } from '../../../../../lib/api-errors.js';
import { parseBody, supportRequestUpdateSchema } from '../../../../../lib/validation.js';
import { updateSupportRequest } from '../../../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requestId(raw) {
  const value = Number(raw);
  if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new ApiError('Обращение не найдено.', 404);
  return value;
}

export const PATCH = apiRoute(
  async (request, context, user) => {
    const id = requestId((await context.params).id);
    const data = parseBody(supportRequestUpdateSchema, await readJsonBody(request));
    return Response.json({ request: await updateSupportRequest(user, id, data) });
  },
  { mutation: true, roles: ['ADMIN'] },
);
