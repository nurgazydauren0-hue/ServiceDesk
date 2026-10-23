import { apiRoute } from '../../../lib/http.js';
import { readJsonBody } from '../../../lib/api-errors.js';
import { parseBody, categorySchema } from '../../../lib/validation.js';
import { prisma } from '../../../lib/prisma.js';
import { listCategories } from '../../../lib/service-desk.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = apiRoute(async () =>
  Response.json({ categories: await listCategories() }),
);
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
