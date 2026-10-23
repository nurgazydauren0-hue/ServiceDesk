import { assertSameOrigin, errorResponse } from './api-errors.js';
import { requireUser } from './auth.js';

export function apiRoute(
  handler,
  { roles, mutation = false, isPublic = false } = {},
) {
  return async (request, context) => {
    try {
      if (mutation) assertSameOrigin(request);
      const user = isPublic ? null : await requireUser({ roles });
      return await handler(request, context, user);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
