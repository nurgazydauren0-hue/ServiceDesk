import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

// Keep a random secret across restarts without putting it in Git or the browser.
export async function prepareDevelopmentSecret(projectRoot, env) {
  const configured = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (configured) {
    env.AUTH_SECRET = configured;
    return;
  }
  if ([1, 2, 3].some((index) => env[`AUTH_SECRET_${index}`])) return;

  const directory = join(projectRoot, '.local');
  const path = join(directory, 'auth-secret');
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(path, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const secret = (await readFile(path, 'utf8')).trim();
  if (!secret) throw new Error('Локальный секрет авторизации пуст: проверьте .local/auth-secret.');
  env.AUTH_SECRET = secret;
}

// PGlite must never open the same data directory in two processes.
export async function lockDevelopmentDatabase(projectRoot) {
  const directory = join(projectRoot, '.local');
  const path = join(directory, 'dev-postgres.lock');
  await mkdir(directory, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(path, String(process.pid), { flag: 'wx', mode: 0o600 });
      return () => unlink(path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(path, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error('Проверьте файл блокировки .local/dev-postgres.lock.');
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
        await unlink(path);
        continue;
      }
      throw new Error('Локальная база уже открыта. Остановите другой npm run dev в этой папке.');
    }
  }
  throw new Error('Не удалось заблокировать локальную базу. Повторите запуск.');
}
