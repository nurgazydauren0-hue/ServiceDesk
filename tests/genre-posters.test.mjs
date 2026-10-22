import test from 'node:test';
import assert from 'node:assert/strict';
import { GENRES } from '../lib/movie-constants.js';
import { GENRE_POSTERS, getGenrePoster } from '../lib/genre-posters.js';

test('Все шесть основных жанров и Другое имеют готовую обложку', () => {
  assert.equal(GENRES.length, 7);
  assert.deepEqual(Object.keys(GENRE_POSTERS).sort(), [...GENRES].sort());
  for (const genre of GENRES) assert.equal(getGenrePoster(genre).genre, genre);
});
test('Разным жанрам соответствуют разные фотографии', () => {
  assert.equal(new Set(GENRES.map((genre) => getGenrePoster(genre).remoteSrc)).size, 7);
  assert.equal(new Set(GENRES.map((genre) => getGenrePoster(genre).key)).size, 7);
});
test('У всех боевиков — одна и та же обложка action', () => {
  const oldMovie = { id: 1, title: 'Старый фильм', genre: 'Боевик', status: 'watched' };
  const newMovie = { id: 900, title: 'Новый фильм', genre: 'Боевик', status: 'planned' };
  assert.equal(getGenrePoster(oldMovie.genre).src, getGenrePoster(newMovie.genre).src);
  assert.equal(getGenrePoster(newMovie.genre).key, 'action');
});
test('При смене жанра выбирается другая обложка, при смене названия — нет', () => {
  const movie = { title: 'Первое название', genre: 'Боевик' };
  const original = getGenrePoster(movie.genre).src;
  movie.title = 'Другое название';
  assert.equal(getGenrePoster(movie.genre).src, original);
  movie.genre = 'Комедия';
  assert.notEqual(getGenrePoster(movie.genre).src, original);
  assert.equal(getGenrePoster(movie.genre).key, 'comedy');
});
test('Неизвестный или пустой жанр безопасно использует Другое', () => {
  for (const value of ['', null, undefined, 'Неизвестно', '__proto__', 'constructor', 'toString', {}, []]) {
    assert.equal(getGenrePoster(value).key, 'other');
  }
});
test('Источники HTTPS, у каждого изображения есть автор и описание', () => {
  for (const poster of Object.values(GENRE_POSTERS)) {
    const url = new URL(poster.remoteSrc);
    assert.equal(url.protocol, 'https:');
    assert.ok(['images.pexels.com', 'images.unsplash.com'].includes(url.hostname));
    assert.ok(poster.photographer.length > 2);
    assert.ok(poster.description.length > 10);
    assert.match(poster.position, /^\d+% \d+%$/);
  }
});
test('getGenrePoster не изменяет общий каталог при работе с результатом', () => {
  const first = getGenrePoster('Боевик');
  first.key = 'changed';
  assert.equal(getGenrePoster('Боевик').key, 'action');
});
