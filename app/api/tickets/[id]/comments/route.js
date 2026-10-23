import { apiRoute } from '../../../../../lib/http.js';
import { readJsonBody } from '../../../../../lib/api-errors.js';
import {
  parseBody,
  parseId,
  commentSchema,
} from '../../../../../lib/validation.js';
import { addComment } from '../../../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = apiRoute(
  async (request, context, user) => {
    const id = parseId((await context.params).id);
    const data = parseBody(commentSchema, await readJsonBody(request));
    return Response.json(
      { comment: await addComment(user, id, data) },
      { status: 201 },
    );
  },
  { mutation: true },
);
