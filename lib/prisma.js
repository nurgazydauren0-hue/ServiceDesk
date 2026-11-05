import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const prisma =
  globalThis.__serviceDeskPrisma ||
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // Allow the remote database to wake up and finish the TLS handshake.
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      max: 10,
    }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production')
  globalThis.__serviceDeskPrisma = prisma;
