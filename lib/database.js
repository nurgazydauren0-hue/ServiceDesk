import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const seedMovies = [
  {
    title: "Интерстеллар",
    year: 2014,
    genre: "Фантастика",
    status: "watched",
    rating: 10,
    description: "История о космосе, времени и связи между близкими людьми.",
  },
  {
    title: "Начало",
    year: 2010,
    genre: "Триллер",
    status: "planned",
    rating: null,
    description: "Посмотреть внимательно: здесь несколько уровней сновидений.",
  },
  {
    title: "Дюна",
    year: 2021,
    genre: "Фантастика",
    status: "watching",
    rating: null,
    description: "Большое путешествие на пустынную планету Арракис.",
  },
  {
    title: "Душа",
    year: 2020,
    genre: "Мультфильм",
    status: "watched",
    rating: 9,
    description: "Тёплый мультфильм о музыке и маленьких радостях жизни.",
  },
  {
    title: "1+1",
    year: 2011,
    genre: "Комедия",
    status: "planned",
    rating: null,
    description: "Для вечера, когда хочется доброй истории о дружбе.",
  },
  {
    title: "Побег из Шоушенка",
    year: 1994,
    genre: "Драма",
    status: "planned",
    rating: null,
    description: "Классическая история о надежде и упорстве.",
  },
];

const columns = `
  id, title, year, genre, status, rating, description,
  created_at AS createdAt, updated_at AS updatedAt
`;

function prepareDatabase(database) {
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  database.exec("BEGIN IMMEDIATE");
  try {
    // Проверка схемы позволяет не возвращать примеры после удаления всех фильмов.
    const existed = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'movies'")
      .get();

    database.exec(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),
        year INTEGER NOT NULL CHECK(typeof(year) = 'integer' AND year BETWEEN 1888 AND 2100),
        genre TEXT NOT NULL CHECK(genre IN ('Фантастика','Драма','Комедия','Триллер','Боевик','Мультфильм','Другое')),
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','watching','watched')),
        rating INTEGER CHECK(rating IS NULL OR (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 10)),
        description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    if (!existed) {
      const insert = database.prepare(`
        INSERT INTO movies (title, year, genre, status, rating, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const movie of seedMovies) {
        insert.run(movie.title, movie.year, movie.genre, movie.status, movie.rating, movie.description, now, now);
      }
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getDatabase() {
  // База создаётся во время работы сервера и не должна попадать в сборку.
  const databasePath = resolve(/* turbopackIgnore: true */ process.env.MOVIELIST_DB_PATH || "data/movielist.sqlite");
  const cached = globalThis.__movieListDatabase;
  if (cached && cached.path === databasePath) {
    return cached.connection;
  }

  // globalThis сохраняет соединение при горячей перезагрузке Next.js в dev-режиме.
  mkdirSync(dirname(databasePath), { recursive: true });
  const connection = new DatabaseSync(databasePath);
  try {
    prepareDatabase(connection);
  } catch (error) {
    connection.close();
    throw error;
  }
  if (cached) cached.connection.close();
  globalThis.__movieListDatabase = { path: databasePath, connection };
  return connection;
}

export function listMovies({ q = "", genre = "", status = "", sort = "newest" } = {}) {
  let movies = getDatabase().prepare(`
    SELECT ${columns} FROM movies
    WHERE (? = '' OR genre = ?) AND (? = '' OR status = ?)
    ORDER BY id DESC
  `).all(genre, genre, status, status);

  // JavaScript корректно сравнивает регистр и для кириллицы, и для латиницы.
  if (q) {
    const needle = q.toLocaleLowerCase("ru-RU");
    movies = movies.filter((movie) => movie.title.toLocaleLowerCase("ru-RU").includes(needle));
  }
  if (sort === "title") {
    movies.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  } else if (sort === "year") {
    movies.sort((a, b) => b.year - a.year || b.id - a.id);
  } else if (sort === "rating") {
    movies.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.id - a.id);
  }
  return movies;
}

export function getMovie(id) {
  return getDatabase().prepare(`SELECT ${columns} FROM movies WHERE id = ?`).get(id) || null;
}

export function createMovie(movie) {
  const now = new Date().toISOString();
  const result = getDatabase().prepare(`
    INSERT INTO movies (title, year, genre, status, rating, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(movie.title, movie.year, movie.genre, movie.status, movie.rating, movie.description, now, now);
  return getMovie(Number(result.lastInsertRowid));
}

export function updateMovie(id, changes) {
  const current = getMovie(id);
  if (!current) return null;

  const movie = { ...current, ...changes };
  getDatabase().prepare(`
    UPDATE movies
    SET title = ?, year = ?, genre = ?, status = ?, rating = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(movie.title, movie.year, movie.genre, movie.status, movie.rating, movie.description, new Date().toISOString(), id);
  return getMovie(id);
}

export function deleteMovie(id) {
  const result = getDatabase().prepare("DELETE FROM movies WHERE id = ?").run(id);
  return result.changes > 0;
}
