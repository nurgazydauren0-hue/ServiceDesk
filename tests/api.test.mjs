import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { assertSameOrigin } from "../lib/api-errors.js";

const projectPath = fileURLToPath(new URL("../", import.meta.url));
let temporaryDirectory;
let server;
let baseUrl;
let serverOutput = "";

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
  timeout.unref();
  await stopped;
  clearTimeout(timeout);
}

async function startServer() {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = "";
  server = spawn(process.execPath, [
    join(projectPath, "node_modules/next/dist/bin/next"),
    "start", "--hostname", "0.0.0.0", "--port", String(port),
  ], {
    cwd: projectPath,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      MOVIELIST_DB_PATH: join(temporaryDirectory, "test.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const appendOutput = (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-5000); };
  server.stdout.on("data", appendOutput);
  server.stderr.on("data", appendOutput);
  let spawnError;
  server.on("error", (error) => { spawnError = error; });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Тестовый сервер завершился. Сначала выполните npm run build.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/movies`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Во время запуска TCP-порт ещё не открыт.
    }
    await pause(150);
  }
  throw new Error(`Тестовый сервер не запустился за 30 секунд.\n${serverOutput}`);
}

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "movielist-api-test-"));
  await startServer();
});

after(async () => {
  await stopServer();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

function jsonOptions(method, data) {
  // Браузер отправляет Origin: проверяем реальный сценарий при bind 0.0.0.0.
  return { method, headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify(data) };
}

test("API: создание, поиск кириллицей, фильтры, изменение и удаление", async (t) => {
  const marker = `ТестКириллица ${Date.now()}`;
  let id;
  t.after(async () => {
    if (id) await request(`/api/movies/${id}`, { method: "DELETE" });
  });

  const created = await request("/api/movies", jsonOptions("POST", {
    title: `  ${marker}  `,
    year: 2025,
    genre: "Драма",
    description: "Временная запись автоматической проверки.",
  }));
  assert.equal(created.response.status, 201);
  id = created.body.movie.id;
  assert.equal(created.body.movie.title, marker);
  assert.equal(created.body.movie.status, "planned");
  assert.equal(created.body.movie.rating, null);
  assert.equal(created.response.headers.get("location"), `/api/movies/${id}`);

  const item = await request(`/api/movies/${id}`);
  assert.equal(item.response.status, 200);
  assert.equal(item.body.movie.id, id);

  const searched = await request(`/api/movies?q=${encodeURIComponent(marker.toLowerCase())}&genre=${encodeURIComponent("Драма")}&status=planned`);
  assert.equal(searched.response.status, 200);
  assert.deepEqual(searched.body.movies.map((movie) => movie.id), [id]);

  const filteredOut = await request(`/api/movies?q=${encodeURIComponent(marker)}&status=watched`);
  assert.deepEqual(filteredOut.body.movies, []);

  const patched = await request(`/api/movies/${id}`, jsonOptions("PATCH", {
    status: "watched", rating: 8, description: "Изменённая заметка.",
  }));
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body.movie.title, marker);
  assert.equal(patched.body.movie.rating, 8);
  assert.equal(patched.body.movie.status, "watched");
  assert.equal(patched.body.movie.description, "Изменённая заметка.");
  assert.equal(patched.body.movie.createdAt, created.body.movie.createdAt);

  const clearedRating = await request(`/api/movies/${id}`, jsonOptions("PATCH", { rating: null }));
  assert.equal(clearedRating.body.movie.rating, null);

  const deleted = await request(`/api/movies/${id}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 204);
  const missing = await request(`/api/movies/${id}`);
  assert.equal(missing.response.status, 404);
  const missingPatch = await request(`/api/movies/${id}`, jsonOptions("PATCH", { status: "planned" }));
  assert.equal(missingPatch.response.status, 404);
  const missingDelete = await request(`/api/movies/${id}`, { method: "DELETE" });
  assert.equal(missingDelete.response.status, 404);
  id = undefined;
});

test("API: неверные данные отклоняются и не меняют существующую запись", async (t) => {
  const valid = { title: `Проверка валидации ${Date.now()}`, year: 2024, genre: "Комедия" };
  const invalidBodies = [
    null, [], {},
    { ...valid, title: "   " },
    { ...valid, title: "x".repeat(101) },
    { ...valid, year: "2024" },
    { ...valid, year: 1500 },
    { ...valid, genre: "Неизвестный жанр" },
    { ...valid, status: "unknown" },
    { ...valid, rating: 11 },
    { ...valid, rating: 1.5 },
    { ...valid, description: "x".repeat(1001) },
    { ...valid, id: 1 },
  ];
  for (const body of invalidBodies) {
    const result = await request("/api/movies", jsonOptions("POST", body));
    assert.equal(result.response.status, 400, `Ожидалось 400: ${JSON.stringify(body).slice(0,100)}`);
    assert.equal(typeof result.body.error, "string");
  }

  const created = await request("/api/movies", jsonOptions("POST", valid));
  assert.equal(created.response.status, 201);
  const id = created.body.movie.id;
  t.after(async () => { await request(`/api/movies/${id}`, { method: "DELETE" }); });

  for (const body of [{}, { rating: 0 }, { status: "broken" }, { id: 2 }]) {
    const result = await request(`/api/movies/${id}`, jsonOptions("PATCH", body));
    assert.equal(result.response.status, 400);
  }
  const unchanged = await request(`/api/movies/${id}`);
  assert.deepEqual(unchanged.body.movie, created.body.movie);

  const malformed = await request("/api/movies", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(malformed.response.status, 400);
  const wrongType = await request("/api/movies", { method: "POST", body: "text" });
  assert.equal(wrongType.response.status, 415);
  const foreignOrigin = await request("/api/movies", {
    ...jsonOptions("POST", valid),
    headers: { "Content-Type": "application/json", Origin: "https://another-site.example" },
  });
  assert.equal(foreignOrigin.response.status, 403);
});

test("API: неверные ID/фильтры и SQL-подобный поисковый текст обрабатываются безопасно", async () => {
  for (const path of [
    "/api/movies/abc", "/api/movies/0", "/api/movies/-1", "/api/movies/9007199254740992",
    "/api/movies?status=broken", "/api/movies?genre=broken", "/api/movies?sort=broken",
  ]) {
    const result = await request(path);
    assert.equal(result.response.status, 400, path);
  }
  const sqlText = await request(`/api/movies?q=${encodeURIComponent("' OR 1=1; DROP TABLE movies; --")}`);
  assert.equal(sqlText.response.status, 200);
  assert.deepEqual(sqlText.body.movies, []);
  const stillAvailable = await request("/api/movies");
  assert.equal(stillAvailable.response.status, 200);
  assert.ok(Array.isArray(stillAvailable.body.movies));
});

test("Origin: реальный Host учитывается, неверные адреса и протоколы отклоняются", () => {
  function originRequest(origin, host = "localhost:3000") {
    return new Request("http://0.0.0.0:3000/api/movies", { headers: { Origin: origin, Host: host } });
  }

  assert.doesNotThrow(() => assertSameOrigin(originRequest("http://localhost:3000")));
  // HTTPS может завершаться на proxy перед локальным HTTP-сервером.
  assert.doesNotThrow(() => assertSameOrigin(originRequest("https://localhost:3000")));
  assert.doesNotThrow(() => assertSameOrigin(originRequest("http://localhost", "localhost:80")));

  for (const origin of [
    "null", "broken", "ftp://localhost:3000", "file://localhost:3000",
    "http://another-site.example:3000", "http://localhost:3001",
    "http://localhost:3000/path", "http://user@localhost:3000",
  ]) {
    assert.throws(() => assertSameOrigin(originRequest(origin)), (error) => error.status === 403);
  }

  assert.throws(() => assertSameOrigin(new Request("http://0.0.0.0:3000/api/movies", {
    headers: {
      Host: "localhost:3000", Origin: "https://another-site.example",
      "X-Forwarded-Host": "another-site.example",
    },
  })), (error) => error.status === 403);

  assert.doesNotThrow(() => assertSameOrigin(new Request("http://localhost:3000/api/movies", {
    headers: { Origin: "http://localhost:3000" },
  })));
});

test("SQLite: данные сохраняются после перезапуска, удалённые примеры не появляются снова", async () => {
  const created = await request("/api/movies", jsonOptions("POST", {
    title: "Проверка сохранения после перезапуска",
    year: 2026,
    genre: "Другое",
    status: "watched",
    rating: 7,
  }));
  assert.equal(created.response.status, 201);

  await stopServer();
  await startServer();
  const saved = await request(`/api/movies/${created.body.movie.id}`);
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.body.movie, created.body.movie);

  // База изолирована во временной папке; пользовательские записи не затрагиваются.
  const all = await request("/api/movies");
  for (const movie of all.body.movies) {
    const deleted = await request(`/api/movies/${movie.id}`, { method: "DELETE" });
    assert.equal(deleted.response.status, 204);
  }
  await stopServer();
  await startServer();
  const empty = await request("/api/movies");
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.movies, []);
});
