import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrend, createTrendWindow, getTrendRangeError, isTrendCalendarDate, trendBucketDate, trendCalendarDate } from '../lib/trend-periods.js';
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

test('свой диапазон включает обе выбранные даты целиком по времени Кызылорды', () => {
  const window = createTrendWindow('custom', '2026-11-12T10:32:00.000Z', {
    startDate: '2026-11-01', endDate: '2026-11-03',
  });
  assert.equal(window.period, 'custom');
  assert.equal(window.startDate, '2026-11-01');
  assert.equal(window.endDate, '2026-11-03');
  assert.equal(window.start.toISOString(), '2026-10-31T19:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-11-03T19:00:00.000Z');
  assert.equal(window.granularity, 'day');
  assert.equal(window.buckets.length, 3);
  assert.equal(window.buckets.at(-1), '2026-11-02T19:00:00.000Z');
  assert.equal(trendBucketDate(window, '2026-10-31T18:59:59.999Z'), null);
  assert.equal(trendBucketDate(window, window.start), window.buckets[0]);
  assert.equal(trendBucketDate(window, '2026-11-03T18:59:59.999Z'), window.buckets.at(-1));
  assert.equal(trendBucketDate(window, window.end), null);
});

test('один выбранный день не добавляет следующий, а сегодняшний ограничивается текущим моментом', () => {
  const past = createTrendWindow('custom', '2026-11-12T10:32:00.000Z', {
    startDate: '2026-11-01', endDate: '2026-11-01',
  });
  assert.equal(past.buckets.length, 1);
  assert.equal(past.end - past.start, 86_400_000);
  const today = createTrendWindow('custom', '2026-11-12T10:32:00.000Z', {
    startDate: '2026-11-01', endDate: '2026-11-12',
  });
  assert.equal(today.buckets.length, 12);
  assert.equal(today.end.toISOString(), '2026-11-12T10:32:00.000Z');
  assert.equal(trendBucketDate(today, '2026-11-12T10:32:01.000Z'), null);
  const midnight = createTrendWindow('custom', '2026-11-11T19:00:00.000Z', {
    startDate: '2026-11-12', endDate: '2026-11-12',
  });
  assert.equal(midnight.buckets.length, 1);
  assert.equal(midnight.start.getTime(), midnight.end.getTime());
  assert.equal(buildTrend(midnight)[0].created, 0);
});

test('свой диапазон переходит на месяцы после 90 дат и остаётся ограниченным десятью годами', () => {
  const now = '2026-11-12T10:32:00.000Z';
  const ninety = createTrendWindow('custom', now, { startDate: '2026-03-01', endDate: '2026-05-29' });
  assert.equal(ninety.granularity, 'day');
  assert.equal(ninety.buckets.length, 90);
  const longer = createTrendWindow('custom', now, { startDate: '2026-03-01', endDate: '2026-05-30' });
  assert.equal(longer.granularity, 'month');
  assert.equal(longer.buckets.length, 3);
  assert.equal(longer.buckets[0], '2026-02-28T19:00:00.000Z');
  assert.equal(longer.buckets.at(-1), '2026-04-30T19:00:00.000Z');
  const maximum = createTrendWindow('custom', now, { startDate: '2016-11-12', endDate: '2026-11-12' });
  assert.equal(maximum.granularity, 'month');
  assert.equal(maximum.buckets.length, 121);
  assert.equal(getTrendRangeError({ startDate: '2016-11-11', endDate: '2026-11-12' }, now), 'Выберите диапазон не длиннее 10 лет.');
});

test('даты своего диапазона проверяются строго, включая високосные дни и локальное сегодня', () => {
  for (const value of ['2026-11-12', '2024-02-29', '0001-01-01']) assert.equal(isTrendCalendarDate(value), true);
  for (const value of ['', '2026-02-29', '2026-02-30', '2026-2-01', '0000-01-01', '12.11.2026', '2026-11-12T00:00:00Z', null, 20261112])
    assert.equal(isTrendCalendarDate(value), false);
  assert.equal(trendCalendarDate('2026-11-11T18:59:59.999Z'), '2026-11-11');
  assert.equal(trendCalendarDate('2026-11-11T19:00:00.000Z'), '2026-11-12');
  assert.equal(getTrendRangeError({ startDate: '2026-11-12', endDate: '2026-11-12' }, '2026-11-11T19:00:00.000Z'), '');
  const leap = createTrendWindow('custom', '2024-03-01T10:00:00Z', { startDate: '2024-02-28', endDate: '2024-03-01' });
  assert.equal(leap.buckets.length, 3);
  assert.equal(getTrendRangeError({ startDate: '2014-02-28', endDate: '2024-02-29' }, '2024-03-01T00:00:00Z'), '');
});

test('API требует пару дат только для своего диапазона и отклоняет некорректные параметры', () => {
  const now = '2026-11-12T10:32:00Z';
  const query = (suffix) => new URLSearchParams(`period=custom&${suffix}`);
  assert.deepEqual(parseTrendFilters(query('startDate=2026-11-01&endDate=2026-11-12'), now), {
    period: 'custom', startDate: '2026-11-01', endDate: '2026-11-12',
  });
  for (const params of [
    query(''), query('startDate=2026-11-01'), query('endDate=2026-11-12'),
    query('startDate=2026-02-30&endDate=2026-11-12'),
    query('startDate=2026-11-12&endDate=2026-11-01'),
    query('startDate=2026-11-01&endDate=2026-11-13'),
    query('startDate=2016-11-11&endDate=2026-11-12'),
    query('startDate=2026-11-01&startDate=2026-11-02&endDate=2026-11-12'),
    query('startDate=2026-11-01&endDate=2026-11-12&endDate=2026-11-11'),
    query('startDate=2026-11-01&endDate=2026-11-12&extra=1'),
    new URLSearchParams('period=14d&startDate=2026-11-01&endDate=2026-11-12'),
    new URLSearchParams('startDate=2026-11-01&endDate=2026-11-12'),
  ]) assert.throws(() => parseTrendFilters(params, now), (error) => error.status === 400);
});
