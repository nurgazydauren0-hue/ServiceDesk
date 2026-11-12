import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isFavoriteTicketId,
  MAX_TICKET_FAVORITES,
  normalizeFavoriteIds,
  toggleFavoriteId,
  validateFavoriteIds,
} from '../lib/ticket-favorites.js';

test('избранное содержит только уникальные ID заявок без скопированных данных', () => {
  assert.equal(validateFavoriteIds([]), true);
  assert.equal(validateFavoriteIds([1, 42, 2_147_483_647]), true);
  for (const invalid of [null, {}, '42', [42, 42], ['42'], [undefined], new Array(1), [0], [-1], [1.5], [NaN], [Infinity], [2_147_483_648], [{ id: 42, title: 'Private title' }]]) {
    assert.equal(validateFavoriteIds(invalid), false);
  }
  assert.equal(isFavoriteTicketId(true), false);
  assert.equal(isFavoriteTicketId(Number.MAX_SAFE_INTEGER), false);
});

test('нормализация ограничивает объём и сохраняет только корректные ID', () => {
  const source = [42, 42, '43', 0, -2, null, { id: 44 }, 1.5, 7, 2_147_483_647];
  const result = normalizeFavoriteIds(source);
  assert.deepEqual(result, [42, 7, 2_147_483_647]);
  assert.equal(validateFavoriteIds(result), true);
  assert.equal(source.length, 10);
  assert.deepEqual(normalizeFavoriteIds({ ids: [42] }), []);
  const large = Array.from({ length: MAX_TICKET_FAVORITES + 20 }, (_, index) => index + 1);
  assert.equal(validateFavoriteIds(large), false);
  assert.deepEqual(normalizeFavoriteIds(large), large.slice(0, MAX_TICKET_FAVORITES));
});

test('переключение добавляет и снимает звезду, не меняя исходный список', () => {
  const source = Object.freeze([42, 7]);
  assert.deepEqual(toggleFavoriteId(source, 43), [42, 7, 43]);
  assert.deepEqual(toggleFavoriteId(source, 42), [7]);
  assert.deepEqual(toggleFavoriteId(source, '43'), [42, 7]);
  assert.deepEqual(source, [42, 7]);
});

test('достижение лимита не удаляет ранее сохранённые заявки', () => {
  const full = Array.from({ length: MAX_TICKET_FAVORITES }, (_, index) => index + 1);
  assert.deepEqual(toggleFavoriteId(full, 101), full);
  const removed = toggleFavoriteId(full, 42);
  assert.equal(removed.length, MAX_TICKET_FAVORITES - 1);
  const added = toggleFavoriteId(removed, 101);
  assert.equal(added.includes(101), true);
  assert.equal(added.includes(42), false);
  assert.equal(validateFavoriteIds(added), true);
});
