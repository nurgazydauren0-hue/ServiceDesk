import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTrendDate } from '../lib/date-format.js';

test('hourly chart labels use Qyzylorda time and include the calendar day in tooltips', () => {
  const value = '2026-11-11T20:15:00.000Z';
  assert.equal(formatTrendDate(value, 'ru', 'hour'), '01:15');
  assert.equal(formatTrendDate(value, 'ru', 'hour', true), '12 нояб., 01:15');
  assert.equal(formatTrendDate(value, 'kk', 'hour', true), '12 қар., 01:15');
  assert.equal(formatTrendDate(value, 'en', 'hour', true), 'Nov 12, 01:15');
});

test('monthly chart labels distinguish years and use stable month names in all languages', () => {
  assert.equal(formatTrendDate('2025-12-31T19:00:00.000Z', 'ru', 'month'), 'янв. 2026');
  assert.equal(formatTrendDate('2026-11-01T00:00:00.000Z', 'kk', 'month'), 'қар. 2026');
  assert.equal(formatTrendDate('2026-11-01T00:00:00.000Z', 'en', 'month'), 'Nov 2026');
  assert.equal(formatTrendDate('2025-11-01T00:00:00.000Z', 'ru', 'month'), 'нояб. 2025');
});

test('daily chart tooltips include the year and invalid dates remain harmless', () => {
  assert.equal(formatTrendDate('2026-11-12', 'kk', 'day', true), '2026 ж. 12 қараша');
  assert.equal(formatTrendDate('2026-11-12', 'en', 'day', true), 'November 12, 2026');
  assert.equal(formatTrendDate('2026-02-30', 'ru', 'day'), '—');
  assert.equal(formatTrendDate(null, 'ru', 'hour'), '—');
});
