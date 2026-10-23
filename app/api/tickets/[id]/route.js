import { apiRoute } from '../../../../lib/http.js';
import { readJsonBody } from '../../../../lib/api-errors.js';
import {
  parseBody,
  parseId,
  ticketUpdateSchema,
} from '../../../../lib/validation.js';
import {
  deleteTicket,
  getTicket,
  updateTicket,
} from '../../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (_request, context, user) =>
  Response.json({
    ticket: await getTicket(user, parseId((await context.params).id)),
  }),
);
export const PATCH = apiRoute(
  async (request, context, user) => {
    const id = parseId((await context.params).id);
    const data = parseBody(ticketUpdateSchema, await readJsonBody(request));
    return Response.json({ ticket: await updateTicket(user, id, data) });
  },
  { mutation: true },
);
export const DELETE = apiRoute(
  async (_request, context, user) => {
    await deleteTicket(user, parseId((await context.params).id));
    return new Response(null, { status: 204 });
  },
  { mutation: true },
);
