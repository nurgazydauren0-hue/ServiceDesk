import { apiRoute } from '../../../../../lib/http.js';
import { readJsonBody } from '../../../../../lib/api-errors.js';
import {
  parseBody,
  parseId,
  supportRequestCreateSchema,
} from '../../../../../lib/validation.js';
import {
  createSupportRequest,
  listTicketSupportRequests,
} from '../../../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (_request, context, user) =>
  Response.json({
    requests: await listTicketSupportRequests(user, parseId((await context.params).id)),
  }),
);
export const POST = apiRoute(
  async (request, context, user) => {
    const id = parseId((await context.params).id);
    const data = parseBody(supportRequestCreateSchema, await readJsonBody(request));
    return Response.json(
      { request: await createSupportRequest(user, id, data) },
      { status: 201 },
    );
  },
  { mutation: true },
);
