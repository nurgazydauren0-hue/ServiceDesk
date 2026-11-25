import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import nextEnv from '@next/env';
import { prepareDevelopmentSecret, lockDevelopmentDatabase } from './dev-settings.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
nextEnv.loadEnvConfig(projectRoot, true);
const env = { ...process.env, NODE_ENV: 'development' };
let child;
let stopping = false;
let database;
let socket;
let unlock;
let exitCode = 0;

function run(script, args = [], overrides = {}) {
  if (stopping) throw new Error('Запуск остановлен.');
  return new Promise((resolve, reject) => {
    const current = spawn(process.execPath, [join(projectRoot, script), ...args], {
      cwd: projectRoot,
      env: { ...env, ...overrides },
      stdio: 'inherit',
      windowsHide: true,
    });
    child = current;
    current.once('error', reject);
    current.once('exit', (code, signal) => {
      if (child === current) child = undefined;
      if (code === 0 || stopping) resolve();
      else reject(new Error(`Команда ${script} завершилась (${signal || code}).`));
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    child?.kill('SIGTERM');
  });

try {
  await prepareDevelopmentSecret(projectRoot, env);
  const local = !env.DATABASE_URL?.trim();
  if (local) {
    unlock = await lockDevelopmentDatabase(projectRoot);
    const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
      import('@electric-sql/pglite'),
      import('@electric-sql/pglite-socket'),
    ]);
    database = await PGlite.create({ dataDir: join(projectRoot, '.local', 'dev-postgres') });
    socket = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 20 });
    await socket.start();
    env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?schema=public&sslmode=disable`;
    console.log('Локальная PostgreSQL: данные сохраняются в .local/dev-postgres.');
  } else {
    // Preserve explicitly configured PostgreSQL and legacy local clusters.
    await run('prisma/local-db.mjs', ['start-if-configured']);
  }

  await run('node_modules/prisma/build/index.js', ['generate']);
  if (local) {
    await run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
    const adminEmail = env.BOOTSTRAP_ADMIN_EMAIL || 'admin@servicedesk.local';
    await run('prisma/bootstrap.mjs', [], {
      BOOTSTRAP_ADMIN_NAME: env.BOOTSTRAP_ADMIN_NAME || 'Администратор',
      BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      BOOTSTRAP_ADMIN_PASSWORD: env.BOOTSTRAP_ADMIN_PASSWORD || 'servicedesk',
    });
    console.log(`Локальный администратор: ${adminEmail}.`);
  }
  await run('node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)]);
} catch (error) {
  if (!stopping) {
    console.error('Не удалось запустить ServiceDesk:', error.message);
    exitCode = 1;
  }
} finally {
  try {
    try {
      await socket?.stop();
    } finally {
      await database?.close();
    }
  } finally {
    await unlock?.();
    // Closing the WASM runtime can set process.exitCode; keep startup failures.
    process.exitCode = exitCode;
  }
}
