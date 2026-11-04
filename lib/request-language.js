import { cookies } from 'next/headers';
import { createTranslator, LANGUAGE_COOKIE, normalizeLocale } from './i18n.js';

export async function getRequestLocale() {
  return normalizeLocale((await cookies()).get(LANGUAGE_COOKIE)?.value);
}

export function localizedMetadata(title) {
  return async () => ({ title: createTranslator(await getRequestLocale())(title) });
}
