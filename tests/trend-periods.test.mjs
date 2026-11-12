import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrend, createTrendWindow, trendBucketDate } from '../lib/trend-periods.js';
import { parseTrendFilters } from '../lib/validation.js';

test('период по умолчанию — 14 календарных дней Кызылорды, включая текущий', () => {
  const window = createTrendWindow(undefined, '2026-11-12T10:32:00.000Z');
  assert.equal(window.period, '14d');
  assert.equal(window.granularity, 'day');
  assert.equal(window.timeZone, 'Asia/Qyzylorda');
  assert.equal(window.start.toISOString(), '2026-10-29T19:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-11-12T10:32:00.000Z');
  assert.equal(window.buckets.length, 14);
  assert.equal(window.buckets.at(-1), '2026-11-11T19:00:00.000Z');
  assert.equal(trendBucketDate(window, '2026-11-11T18:59:59.999Z'), '2026-11-10T19:00:00.000Z');
  assert.equal(trendBucketDate(window, '2026-11-11T19:00:00.000Z'), '2026-11-11T19:00:00.000Z');
});

test('последние сутки имеют ровно 24 часовых интервала и точные границы', () => {
  const window = createTrendWindow('day', '2026-11-12T10:32:15.000Z');
  assert.equal(window.start.toISOString(), '2026-11-11T10:32:15.000Z');
  assert.equal(window.granularity, 'hour');
  assert.equal(window.buckets.length, 24);
  assert.equal(trendBucketDate(window, '2026-11-11T10:32:14.999Z'), null);
  assert.equal(trendBucketDate(window, window.start), window.buckets[0]);
  assert.equal(trendBucketDate(window, '2026-11-11T11:32:14.999Z'), window.buckets[0]);
  assert.equal(trendBucketDate(window, '2026-11-11T11:32:15.000Z'), window.buckets[1]);
  assert.equal(trendBucketDate(window, '2026-11-12T10:32:14.999Z'), window.buckets.at(-1));
  assert.equal(trendBucketDate(window, window.end), null);
  assert.equal(trendBucketDate(window, '2026-11-12T10:33:00.000Z'), null);
});

test('месяц отсчитывается по календарю с ограничением последним днём февраля', () => {
  const normal = createTrendWindow('month', '2026-03-31T10:15:30.000Z');
  assert.equal(normal.start.toISOString(), '2026-02-28T10:15:30.000Z');
  assert.equal(normal.buckets[0], '2026-02-27T19:00:00.000Z');
  assert.equal(normal.buckets.at(-1), '2026-03-30T19:00:00.000Z');
  assert.equal(normal.buckets.length, 32);
  assert.equal(trendBucketDate(normal, '2026-02-28T10:15:29.999Z'), null);
  assert.equal(trendBucketDate(normal, normal.start), normal.buckets[0]);
  const leap = createTrendWindow('month', '2024-03-31T10:15:30.000Z');
  assert.equal(leap.start.toISOString(), '2024-02-29T10:15:30.000Z');
  // The calendar date is local: at 20:15 UTC it is already April 1 in Kyzylorda.
  const localNextDay = createTrendWindow('month', '2026-03-31T20:15:30.000Z');
  assert.equal(localNextDay.start.toISOString(), '2026-02-28T20:15:30.000Z');
});

test('год включает точный прошлогодний момент и частичные месяцы по краям', () => {
  const window = createTrendWindow('year', '2026-11-12T10:32:00.000Z');
  assert.equal(window.start.toISOString(), '2025-11-12T10:32:00.000Z');
  assert.equal(window.granularity, 'month');
  assert.equal(window.buckets.length, 13);
  assert.equal(window.buckets[0], '2025-10-31T19:00:00.000Z');
  assert.equal(window.buckets.at(-1), '2026-10-31T19:00:00.000Z');
  assert.equal(trendBucketDate(window, '2025-11-12T10:31:59.999Z'), null);
  assert.equal(trendBucketDate(window, window.start), window.buckets[0]);
  const leap = createTrendWindow('year', '2024-02-29T10:32:00.000Z');
  assert.equal(leap.start.toISOString(), '2023-02-28T10:32:00.000Z');
});

test('в полночь пустой текущий день остаётся на графике, будущие события не учитываются', () => {
  const window = createTrendWindow('14d', '2026-11-11T19:00:00.000Z');
  assert.equal(window.buckets.length, 14);
  assert.equal(window.buckets.at(-1), '2026-11-11T19:00:00.000Z');
  assert.equal(trendBucketDate(window, window.end), null);
  assert.equal(buildTrend(window).at(-1).created, 0);
});

test('создание и решение считаются независимо, пустые интервалы заполнены нулями', () => {
  const window = createTrendWindow('14d', '2026-11-12T10:32:00.000Z');
  const created = trendBucketDate(window, '2026-11-09T10:00:00Z');
  const resolved = trendBucketDate(window, '2026-11-10T22:00:00Z');
  const trend = buildTrend(window,
    [{ date: new Date(created), count: 2 }, { date: created, count: 3 }, { date: '2020-01-01T00:00:00Z', count: 99 }],
    [{ date: resolved, count: 1 }],
  );
  assert.equal(trend.length, 14);
  assert.deepEqual(trend.find((row) => row.date === created), { date: created, created: 5, resolved: 0 });
  assert.deepEqual(trend.find((row) => row.date === resolved), { date: resolved, created: 0, resolved: 1 });
  assert.equal(trend.filter((row) => row.created === 0 && row.resolved === 0).length, 12);
  assert.equal(trend.reduce((sum, row) => sum + row.created, 0), 5);
  assert.equal(trend.reduce((sum, row) => sum + row.resolved, 0), 1);
});

test('период API проверяется строго, неизвестные и повторные значения возвращают 400', () => {
  assert.deepEqual(parseTrendFilters(), { period: '14d' });
  for (const period of ['day', '14d', 'month', 'year'])
    assert.deepEqual(parseTrendFilters(new URLSearchParams({ period })), { period });
  for (const query of ['period=', 'period=all', 'period=year&period=day', 'period=day&extra=1'])
    assert.throws(() => parseTrendFilters(new URLSearchParams(query)), (error) => error.status === 400);
  assert.throws(() => createTrendWindow('all'), RangeError);
  assert.throws(() => createTrendWindow('day', 'invalid'), RangeError);
});

test('границы не зависят от часового пояса операционной системы', () => {
  const before = process.env.TZ;
  try {
    for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
      process.env.TZ = timeZone;
      assert.equal(createTrendWindow('month', '2026-03-31T20:15:30.000Z').start.toISOString(), '2026-02-28T20:15:30.000Z');
      assert.equal(createTrendWindow('year', '2026-11-12T10:32:00.000Z').buckets[0], '2025-10-31T19:00:00.000Z');
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
