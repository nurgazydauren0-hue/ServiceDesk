import { apiRoute } from '../../../../lib/http.js';
import { ApiError, readJsonBody } from '../../../../lib/api-errors.js';
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
    const id = (await context.params).id;
    if (await prisma.ticket.count({ where: { categoryId: id } }))
      throw new ApiError(
        'Категория используется в заявках. Сначала переведите их в другую категорию.',
        409,
      );
    await prisma.category.delete({ where: { id } });
    return new Response(null, { status: 204 });
  },
  { mutation: true, roles: ['ADMIN'] },
);
