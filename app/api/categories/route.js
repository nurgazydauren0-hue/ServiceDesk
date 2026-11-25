import { apiRoute } from '../../../lib/http.js';
import { readJsonBody } from '../../../lib/api-errors.js';
import { parseBody, categorySchema } from '../../../lib/validation.js';
import { prisma } from '../../../lib/prisma.js';
import { listCategories, listCategoriesWithUsage } from '../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Ticket counts per category are only shown to administrators.
export const GET = apiRoute(async (request, _context, user) => {
  const withUsage = new URL(request.url).searchParams.get('usage') === '1' && user.role === 'ADMIN';
  return Response.json({
    categories: withUsage ? await listCategoriesWithUsage() : await listCategories(),
  });
});
export const POST = apiRoute(
  async (request) => {
    const data = parseBody(categorySchema, await readJsonBody(request));
    return Response.json(
      { category: await prisma.category.create({ data }) },
      { status: 201 },
    );
  },
  { mutation: true, roles: ['ADMIN'] },
);
