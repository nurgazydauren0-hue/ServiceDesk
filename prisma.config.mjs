import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

try {
  loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --env-file-if-exists=.env prisma/seed.mjs',
  },
  // Generating a client and building the app do not need a running database.
  // Migration commands require the real DATABASE_URL from the environment.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
