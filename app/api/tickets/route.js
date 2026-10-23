import { apiRoute } from '../../../lib/http.js';
import { readJsonBody } from '../../../lib/api-errors.js';
import { parseBody, ticketCreateSchema } from '../../../lib/validation.js';
import { createTicket, listTickets } from '../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async (request, _context, user) =>
  Response.json(await listTickets(user, new URL(request.url).searchParams)),
);
export const POST = apiRoute(
  async (request, _context, user) => {
    const data = parseBody(ticketCreateSchema, await readJsonBody(request));
    const ticket = await createTicket(user, data);
    return Response.json(
      { ticket },
      { status: 201, headers: { Location: `/api/tickets/${ticket.id}` } },
    );
  },
  { mutation: true },
);
