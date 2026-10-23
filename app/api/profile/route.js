import { apiRoute } from '../../../lib/http.js';
import { readJsonBody } from '../../../lib/api-errors.js';
import { parseBody, profileUpdateSchema } from '../../../lib/validation.js';
import { updateProfile } from '../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (_request, _context, user) =>
  Response.json({ user }),
);
export const PATCH = apiRoute(
  async (request, _context, user) => {
    const data = parseBody(profileUpdateSchema, await readJsonBody(request));
    return Response.json({ user: await updateProfile(user, data) });
  },
  { mutation: true },
);
