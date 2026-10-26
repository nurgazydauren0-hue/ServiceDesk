import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// This helper is installed at prisma/local-db.mjs in the ServiceDesk project.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const pgCtl = join(projectRoot, '.local', 'postgres', 'bin', 'pg_ctl.exe');
const pgData = join(projectRoot, '.local', 'postgres-data');
const pgLog = join(projectRoot, '.local', 'postgres.log');
const command = process.argv[2];
const commands = new Set(['start', 'stop', 'status', 'start-if-configured']);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readDatabaseUrl() {
  // An explicitly set process variable, including an empty one, takes priority.
  if (process.env.DATABASE_URL !== undefined) return process.env.DATABASE_URL;
  try {
    return parseEnv(readFileSync(join(projectRoot, '.env'), 'utf8')).DATABASE_URL;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error('Не удалось прочитать локальные настройки .env.');
  }
}

function usesLocalDatabase() {
  const value = readDatabaseUrl();
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase()) &&
      (!url.port || url.port === '5432') &&
      decodeURIComponent(url.pathname) === '/servicedesk' &&
      // Avoid starting the local cluster when query options override its target.
      !['host', 'hostaddr', 'port', 'dbname', 'database'].some((key) =>
        url.searchParams.has(key),
      )
    );
  } catch {
    return false;
  }
}

function runPgCtl(args) {
  const result = spawnSync(pgCtl, args, {
    windowsHide: true,
    shell: false,
    encoding: 'utf8',
    // The detached postgres process can retain pipe handles even with -l.
    stdio: 'ignore',
    timeout: 40_000,
  });
  if (result.error || result.signal || result.status === null)
    throw new Error('Не удалось выполнить pg_ctl. Проверьте локальную установку PostgreSQL и права доступа.');
  return result.status;
}

function main() {
  if (!commands.has(command)) {
    fail('Использование: node prisma/local-db.mjs start|stop|status|start-if-configured');
    return;
  }

  const clusterExists = existsSync(join(pgData, 'PG_VERSION'));
  if (command === 'start-if-configured' && (!clusterExists || !usesLocalDatabase()))
    return;

  if (!clusterExists) {
    if (command === 'status') {
      console.log('Локальная PostgreSQL ещё не настроена.');
      return;
    }
    fail('Локальная PostgreSQL ещё не настроена: каталог кластера отсутствует.');
    return;
  }

  if (!existsSync(pgCtl)) {
    fail('Не найден .local/postgres/bin/pg_ctl.exe. Восстановите локальные бинарники PostgreSQL.');
    return;
  }

  if (command !== 'status' && !usesLocalDatabase()) {
    fail('Команда предназначена для локальной базы servicedesk на localhost:5432. Проверьте DATABASE_URL.');
    return;
  }

  // pg_ctl identifies the server by this fixed data directory, not by its port.
  const status = runPgCtl(['-D', pgData, 'status']);
  if (![0, 3].includes(status)) {
    fail('Не удалось определить состояние локальной PostgreSQL. Проверьте права на каталог кластера.');
    return;
  }

  if (command === 'status') {
    console.log(status === 0 ? 'Локальная PostgreSQL запущена.' : 'Локальная PostgreSQL остановлена.');
    return;
  }

  if (command === 'stop') {
    if (status === 3) {
      console.log('Локальная PostgreSQL уже остановлена.');
      return;
    }
    // Fast shutdown rolls back active transactions and disconnects clients.
    const stopped = runPgCtl(['-D', pgData, '-m', 'fast', '-w', '-t', '30', 'stop']);
    if (stopped !== 0) {
      fail(`Не удалось остановить локальную PostgreSQL. Журнал: ${pgLog}`);
      return;
    }
    console.log('Локальная PostgreSQL остановлена.');
    return;
  }

  if (status === 0) {
    if (command === 'start') console.log('Локальная PostgreSQL уже запущена.');
    return;
  }

  const started = runPgCtl([
    '-D', pgData,
    '-l', pgLog,
    '-o', '-h 127.0.0.1 -p 5432',
    '-w', '-t', '30',
    'start',
  ]);
  if (started !== 0) {
    fail(`Не удалось запустить локальную PostgreSQL. Журнал: ${pgLog}`);
    return;
  }
  console.log('Локальная PostgreSQL запущена на 127.0.0.1:5432.');
}

try {
  main();
} catch (error) {
  fail(error.message);
}
