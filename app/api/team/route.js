import { apiRoute } from '../../../lib/http.js';
import { readJsonBody } from '../../../lib/api-errors.js';
import { parseBody, teamCreateSchema } from '../../../lib/validation.js';
import { createTeamMember, listTeam } from '../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(
  async (_request, _context, user) =>
    Response.json({ users: await listTeam(user) }),
  { roles: ['ADMIN'] },
);
export const POST = apiRoute(
  async (request, _context, user) => {
    const data = parseBody(teamCreateSchema, await readJsonBody(request));
    return Response.json(
      { user: await createTeamMember(user, data) },
      { status: 201 },
    );
  },
  { mutation: true, roles: ['ADMIN'] },
);
