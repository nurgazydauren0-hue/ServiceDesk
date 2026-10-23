import { createHash } from 'node:crypto';
import { prisma } from './prisma.js';
import { ApiError } from './api-errors.js';

export async function consumeRateLimit(
  action,
  identifier,
  limit = 15,
  windowMinutes = 15,
) {
  const key = createHash('sha256')
    .update(`${action}:${identifier}`)
    .digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMinutes * 60_000);
  const rows = await prisma.$queryRaw`
    INSERT INTO "AuthRateLimit" ("id", "attempts", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("id") DO UPDATE SET
      "attempts" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now} THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "attempts"`;
  if (rows[0].attempts > limit)
    throw new ApiError('Слишком много попыток. Повторите через 15 минут.', 429);
}
