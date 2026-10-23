import { apiRoute } from '../../../lib/http.js';
import { readJsonBody } from '../../../lib/api-errors.js';
import { parseBody, registrationSchema } from '../../../lib/validation.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword } from '../../../lib/passwords.js';
import { safeUserSelect } from '../../../lib/auth.js';
import { consumeRateLimit } from '../../../lib/rate-limit.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = apiRoute(
  async (request) => {
    const data = parseBody(registrationSchema, await readJsonBody(request));
    await consumeRateLimit('register-email', data.email, 5);
    // Configure the reverse proxy to replace (not append arbitrary client) forwarded headers.
    const address =
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'direct-client';
    await consumeRateLimit('register-address', address, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: 'EMPLOYEE',
      },
      select: safeUserSelect,
    });
    return Response.json({ user }, { status: 201 });
  },
  { mutation: true, isPublic: true },
);
