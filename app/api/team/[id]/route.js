import { apiRoute } from '../../../../lib/http.js';
import { readJsonBody } from '../../../../lib/api-errors.js';
import { parseBody, teamUpdateSchema } from '../../../../lib/validation.js';
import { updateTeamMember } from '../../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const PATCH = apiRoute(
  async (request, context, user) => {
    const data = parseBody(teamUpdateSchema, await readJsonBody(request));
    return Response.json({
      user: await updateTeamMember(user, (await context.params).id, data),
    });
  },
  { mutation: true, roles: ['ADMIN'] },
);
