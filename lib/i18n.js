import { commonMessages } from './i18n-common.js';
import { deskMessages } from './i18n-desk.js';
import { settingsMessages } from './i18n-settings.js';
import { shellMessages } from './i18n-shell.js';

export const LANGUAGE_COOKIE = 'servicedesk-language';
export const languages = [
  { locale: 'kk', code: 'KZ', name: 'Қазақша' },
  { locale: 'ru', code: 'RU', name: 'Русский' },
  { locale: 'en', code: 'EN', name: 'English' },
];

export function normalizeLocale(value) {
  return languages.some(({ locale }) => locale === value) ? value : 'ru';
}

const messages = Object.assign(Object.create(null), shellMessages, settingsMessages, deskMessages, commonMessages);

export function createTranslator(locale) {
  return (source, values) => {
    const variants = messages[source];
    const message = locale === 'ru' ? source : variants?.[locale === 'kk' ? 0 : 1] ?? source;
    return values
      ? message.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match)
      : message;
  };
}
