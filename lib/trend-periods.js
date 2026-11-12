export const TREND_PERIODS = Object.freeze(['day', '14d', 'month', 'year', 'custom']);
export const TREND_TIME_ZONE = 'Asia/Qyzylorda';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Qyzylorda uses UTC+5 throughout the supported recent reporting windows.
const LOCAL_OFFSET = 5 * HOUR;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

export function isTrendCalendarDate(value) {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function trendCalendarDate(now = new Date()) {
  return localDate(timestamp(now)).toISOString().slice(0, 10);
}

function calendarTimestamp(value) {
  return new Date(`${value}T00:00:00.000Z`).getTime() - LOCAL_OFFSET;
}

export function getTrendRangeError({ startDate, endDate } = {}, now = new Date()) {
  if (!startDate || !endDate) return 'Выберите начальную и конечную даты.';
  if (!isTrendCalendarDate(startDate) || !isTrendCalendarDate(endDate))
    return 'Укажите корректные даты в формате ГГГГ-ММ-ДД.';
  if (startDate > endDate) return 'Дата начала не должна быть позже даты окончания.';
  if (endDate > trendCalendarDate(now)) return 'Нельзя выбрать даты в будущем.';
  if (calendarTimestamp(startDate) < subtractCalendarMonths(calendarTimestamp(endDate), 120))
    return 'Выберите диапазон не длиннее 10 лет.';
  return '';
}

export function createTrendWindow(period = '14d', now = new Date(), range = {}) {
  if (!TREND_PERIODS.includes(period)) throw new RangeError('Invalid trend period.');
  const current = timestamp(now);
  let end = current;
  let granularity = period === 'day' ? 'hour' : period === 'year' ? 'month' : 'day';
  let start;
  let selectedEnd;
  if (period === 'custom') {
    const error = getTrendRangeError(range, now);
    if (error) throw new RangeError(error);
    start = calendarTimestamp(range.startDate);
    selectedEnd = calendarTimestamp(range.endDate);
    end = Math.min(selectedEnd + DAY, current);
    const days = Math.round((selectedEnd - start) / DAY) + 1;
    granularity = days <= 90 ? 'day' : 'month';
  } else {
    start = period === 'day' ? end - DAY
      : period === '14d' ? calendarStart(end, 'day') - 13 * DAY
        : subtractCalendarMonths(end, period === 'year' ? 12 : 1);
  }
  const buckets = [];
  let cursor = granularity === 'hour' ? start : calendarStart(start, granularity);
  const lastBucket = period === 'custom' ? calendarStart(selectedEnd, granularity)
    : granularity === 'hour' ? end - 1 : calendarStart(end, granularity);
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
    ...(period === 'custom' ? { startDate: range.startDate, endDate: range.endDate } : {}),
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
