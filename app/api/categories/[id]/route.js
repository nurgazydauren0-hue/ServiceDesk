import { apiRoute } from '../../../../lib/http.js';
import { readJsonBody } from '../../../../lib/api-errors.js';
import { parseBody, categorySchema } from '../../../../lib/validation.js';
import { prisma } from '../../../../lib/prisma.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const PATCH = apiRoute(
  async (request, context) => {
    const data = parseBody(categorySchema, await readJsonBody(request));
    return Response.json({
      category: await prisma.category.update({
        where: { id: (await context.params).id },
        data,
      }),
    });
  },
  { mutation: true, roles: ['ADMIN'] },
);
export const DELETE = apiRoute(
  async (_request, context) => {
    await prisma.category.delete({ where: { id: (await context.params).id } });
    return new Response(null, { status: 204 });
  },
  { mutation: true, roles: ['ADMIN'] },
);
