// Необязательно. Запуск из папки проекта: node scripts/download-genre-posters.mjs
// Скачивает 7 заранее выбранных фотографий для работы без внешних сайтов.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GENRE_POSTERS } from '../lib/genre-posters.js';
import { LOCAL_GENRE_IMAGES } from '../lib/local-genre-images.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'public', 'genres');
const allowedHosts = new Set(['images.pexels.com', 'images.unsplash.com']);
const ready = new Set(LOCAL_GENRE_IMAGES);
let failures = 0;

await mkdir(target, { recursive: true });
for (const [genre, poster] of Object.entries(GENRE_POSTERS)) {
  try {
    if (!allowedHosts.has(new URL(poster.remoteSrc).hostname)) throw new Error('Недопустимый источник.');
    const response = await fetch(poster.remoteSrc, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Ответ не является изображением.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > 15 * 1024 * 1024) throw new Error('Неожиданный размер файла.');
    // В URL запрошен JPG. Не записываем HTML, PNG или WebP под расширением .jpg.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Сервер не вернул JPEG.');
    const destination = join(target, `${poster.key}.jpg`);
    await writeFile(`${destination}.tmp`, bytes);
    await rename(`${destination}.tmp`, destination);
    ready.add(poster.key);
    console.log(`OK: ${genre} → public/genres/${poster.key}.jpg`);
  } catch (error) {
    failures += 1;
    // Существующий рабочий локальный файл при ошибке повторной загрузки сохраняется.
    try { await readFile(join(target, `${poster.key}.jpg`)); }
    catch { ready.delete(poster.key); }
    console.error(`Не скачано: ${genre}. ${error.message}`);
  }
}
const config = '// Создано scripts/download-genre-posters.mjs.\n'
  + `export const LOCAL_GENRE_IMAGES = ${JSON.stringify([...ready], null, 2)};\n`;
const configPath = join(root, 'lib', 'local-genre-images.js');
await writeFile(`${configPath}.tmp`, config, 'utf8');
await rename(`${configPath}.tmp`, configPath);
console.log(`\nЛокальных обложек: ${ready.size} из 7.`);
console.log('Обнови страницу. Нескачанные картинки продолжат загружаться онлайн.');
if (failures) { console.log('Повтори эту команду позже для недостающих файлов.'); process.exitCode = 1; }
