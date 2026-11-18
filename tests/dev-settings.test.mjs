import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareDevelopmentSecret, lockDevelopmentDatabase } from '../scripts/dev-settings.mjs';

async function project(t) {
  const directory = await mkdtemp(join(tmpdir(), 'servicedesk-dev-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('новый клон получает случайный секрет, который сохраняется после перезапуска', async (t) => {
  const directory = await project(t);
  const first = {};
  await prepareDevelopmentSecret(directory, first);
  assert.match(first.AUTH_SECRET, /^[A-Za-z0-9_-]{64}$/);
  const restarted = { AUTH_SECRET: '' };
  await prepareDevelopmentSecret(directory, restarted);
  assert.equal(restarted.AUTH_SECRET, first.AUTH_SECRET);
  const other = {};
  await prepareDevelopmentSecret(await project(t), other);
  assert.notEqual(other.AUTH_SECRET, first.AUTH_SECRET);
});

test('настроенные секреты и ротация не заменяются локальным ключом', async (t) => {
  for (const configured of [
    { AUTH_SECRET: 'configured-primary', NEXTAUTH_SECRET: 'legacy' },
    { AUTH_SECRET: '', NEXTAUTH_SECRET: 'configured-legacy' },
    { AUTH_SECRET_1: 'rotation-key' },
    { AUTH_SECRET: '', AUTH_SECRET_3: 'rotation-key' },
  ]) {
    const directory = await project(t);
    const env = { ...configured };
    await prepareDevelopmentSecret(directory, env);
    if (configured.AUTH_SECRET || configured.NEXTAUTH_SECRET)
      assert.equal(env.AUTH_SECRET, configured.AUTH_SECRET || configured.NEXTAUTH_SECRET);
    else assert.deepEqual(env, configured);
    await assert.rejects(access(join(directory, '.local')), { code: 'ENOENT' });
  }
});

test('повреждённый сохранённый секрет не сбрасывает существующие сессии молча', async (t) => {
  const directory = await project(t);
  await mkdir(join(directory, '.local'));
  const path = join(directory, '.local', 'auth-secret');
  await writeFile(path, '');
  await assert.rejects(prepareDevelopmentSecret(directory, {}), /секрет авторизации пуст/);
  assert.equal(await readFile(path, 'utf8'), '');
});

test('второй запуск не открывает занятую базу; освобождение разрешает перезапуск', async (t) => {
  const directory = await project(t);
  const unlock = await lockDevelopmentDatabase(directory);
  await assert.rejects(lockDevelopmentDatabase(directory), /уже открыта/);
  await unlock();
  const releaseAgain = await lockDevelopmentDatabase(directory);
  await releaseAgain();
});

test('после аварийного завершения старого процесса база снова открывается', async (t) => {
  const directory = await project(t);
  const child = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], {
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(child.status, 0);
  const oldPid = Number(child.stdout.trim());
  assert.ok(Number.isSafeInteger(oldPid) && oldPid > 0 && oldPid !== process.pid);
  await mkdir(join(directory, '.local'));
  await writeFile(join(directory, '.local', 'dev-postgres.lock'), String(oldPid));
  const unlock = await lockDevelopmentDatabase(directory);
  assert.equal(await readFile(join(directory, '.local', 'dev-postgres.lock'), 'utf8'), String(process.pid));
  await unlock();
});
