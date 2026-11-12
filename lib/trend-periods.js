export const TREND_PERIODS = Object.freeze(['day', '14d', 'month', 'year']);
export const TREND_TIME_ZONE = 'Asia/Qyzylorda';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Qyzylorda uses UTC+5 throughout the supported recent reporting windows.
const LOCAL_OFFSET = 5 * HOUR;

function timestamp(value) {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new RangeError('Invalid trend date.');
  return result;
}

function localDate(value) {
  return new Date(value + LOCAL_OFFSET);
}

function calendarStart(value, granularity) {
  const local = localDate(value);
  local.setUTCHours(0, 0, 0, 0);
  if (granularity === 'month') local.setUTCDate(1);
  return local.getTime() - LOCAL_OFFSET;
}

function subtractCalendarMonths(value, months) {
  const local = localDate(value);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return local.getTime() - LOCAL_OFFSET;
}

export function createTrendWindow(period = '14d', now = new Date()) {
  if (!TREND_PERIODS.includes(period)) throw new RangeError('Invalid trend period.');
  const end = timestamp(now);
  const granularity = period === 'day' ? 'hour' : period === 'year' ? 'month' : 'day';
  const start = period === 'day' ? end - DAY
    : period === '14d' ? calendarStart(end, 'day') - 13 * DAY
      : subtractCalendarMonths(end, period === 'year' ? 12 : 1);
  const buckets = [];
  let cursor = granularity === 'hour' ? start : calendarStart(start, granularity);
  const lastBucket = granularity === 'hour' ? end - 1 : calendarStart(end, granularity);
  while (cursor <= lastBucket) {
    buckets.push(new Date(cursor).toISOString());
    if (granularity === 'month') {
      const local = localDate(cursor);
      local.setUTCMonth(local.getUTCMonth() + 1);
      cursor = local.getTime() - LOCAL_OFFSET;
    } else cursor += granularity === 'hour' ? HOUR : DAY;
  }
  return {
    period,
    granularity,
    start: new Date(start),
    end: new Date(end),
    buckets,
    timeZone: TREND_TIME_ZONE,
  };
}

export function trendBucketDate(window, value) {
  const event = timestamp(value);
  const start = window.start.getTime();
  if (event < start || event >= window.end.getTime()) return null;
  const bucket = window.granularity === 'hour'
    ? start + Math.floor((event - start) / HOUR) * HOUR
    : calendarStart(event, window.granularity);
  return new Date(bucket).toISOString();
}

// Only aggregated counts cross the database boundary, including empty buckets.
export function buildTrend(window, createdGroups = [], resolvedGroups = []) {
  const trend = window.buckets.map((date) => ({ date, created: 0, resolved: 0 }));
  const byDate = new Map(trend.map((bucket) => [bucket.date, bucket]));
  for (const [field, groups] of [['created', createdGroups], ['resolved', resolvedGroups]]) {
    for (const group of groups) {
      const bucket = byDate.get(new Date(timestamp(group.date)).toISOString());
      if (bucket) bucket[field] += Number(group.count);
    }
  }
  return trend;
}
