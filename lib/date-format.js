const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i;

// Keep names and punctuation identical across Node and browsers with different ICU data.
const months = {
  kk: {
    short: ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'],
    long: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  },
  ru: {
    short: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
    long: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  },
  en: {
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};

const dateTimeParts = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
  timeZone: 'Asia/Qyzylorda',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function validCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parts(value) {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    // A chart's calendar key is a logical day, not midnight in the viewer's zone.
    if (!validCalendarDate(value)) return null;
    const [year, month, day] = value.split('-');
    return { year, month, day, hour: '00', minute: '00' };
  }
  if (
    !(value instanceof Date) &&
    !(typeof value === 'number' && Number.isFinite(value)) &&
    !(typeof value === 'string' && TIMESTAMP.test(value))
  ) return null;
  if (typeof value === 'string' && !validCalendarDate(value.slice(0, 10)))
    return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Object.fromEntries(
    dateTimeParts.formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: part }) => [type, part]),
  );
}

export function calendarDate(value) {
  const date = parts(value);
  return date ? `${date.year.padStart(4, '0')}-${date.month}-${date.day}` : '';
}

export function formatDate(value, locale, withTime = false) {
  const date = parts(value);
  if (!date) return '—';
  const language = Object.hasOwn(months, locale) ? locale : 'ru';
  const month = months[language].short[Number(date.month) - 1];
  const shortDate = language === 'en'
    ? `${month} ${date.day}`
    : `${date.day} ${month}`;
  if (!withTime) return shortDate;

  if (language === 'en') {
    const hour = Number(date.hour);
    const time = `${String(hour % 12 || 12).padStart(2, '0')}:${date.minute} ${hour < 12 ? 'AM' : 'PM'}`;
    return `${shortDate}, ${date.year}, ${time}`;
  }
  const time = `${date.hour}:${date.minute}`;
  return language === 'kk'
    ? `${date.year} ж. ${shortDate}, ${time}`
    : `${shortDate} ${date.year} г., ${time}`;
}

export function formatLongDate(value, locale) {
  const date = parts(value);
  if (!date) return '—';
  const language = Object.hasOwn(months, locale) ? locale : 'ru';
  const month = months[language].long[Number(date.month) - 1];
  const day = Number(date.day);
  if (language === 'kk') return `${date.year} ж. ${day} ${month}`;
  if (language === 'en') return `${month} ${day}, ${date.year}`;
  return `${day} ${month} ${date.year} г.`;
}

export function formatTrendDate(value, locale, granularity = 'day', tooltip = false) {
  const date = parts(value);
  if (!date) return '—';
  const language = Object.hasOwn(months, locale) ? locale : 'ru';
  if (granularity === 'hour') {
    const time = `${date.hour}:${date.minute}`;
    return tooltip ? `${formatDate(value, locale)}, ${time}` : time;
  }
  if (granularity === 'month')
    return `${months[language].short[Number(date.month) - 1]} ${date.year}`;
  return tooltip ? formatLongDate(value, locale) : formatDate(value, locale);
}
