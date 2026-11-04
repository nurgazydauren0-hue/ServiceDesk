'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTranslator, LANGUAGE_COOKIE, languages } from '../lib/i18n.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ initialLocale, children }) {
  const [locale, setLocale] = useState(initialLocale);
  const router = useRouter();
  const t = createTranslator(locale);

  function changeLanguage(nextLocale) {
    if (nextLocale === locale) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LANGUAGE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
    router.refresh();
  }

  useEffect(() => {
    const translate = createTranslator(locale);
    const translatedFields = new Set();

    function clearMessage(event) {
      if (translatedFields.delete(event.target)) event.target.setCustomValidity('');
    }

    function translateInvalid(event) {
      const field = event.target;
      if (!field.validity || typeof field.setCustomValidity !== 'function') return;
      clearMessage(event);
      if (field.validity.customError) return;
      let message;
      if (field.validity.valueMissing) {
        message = translate(field.tagName === 'SELECT' ? 'Выберите вариант из списка.' : 'Заполните это поле.');
      } else if (field.validity.typeMismatch && field.type === 'email') {
        message = translate('Укажите корректный email.');
      } else if (field.validity.tooShort) {
        message = translate('Введите не менее {min} символов.', { min: field.minLength });
      } else if (field.validity.tooLong) {
        message = translate('Введите не более {max} символов.', { max: field.maxLength });
      } else {
        message = translate('Проверьте введённые данные.');
      }
      field.setCustomValidity(message);
      translatedFields.add(field);
    }

    document.addEventListener('invalid', translateInvalid, true);
    document.addEventListener('input', clearMessage, true);
    document.addEventListener('change', clearMessage, true);
    return () => {
      document.removeEventListener('invalid', translateInvalid, true);
      document.removeEventListener('input', clearMessage, true);
      document.removeEventListener('change', clearMessage, true);
      for (const field of translatedFields) field.setCustomValidity('');
    };
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, t, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitcher() {
  const { locale, t, changeLanguage } = useLanguage();

  return (
    <div className="language-switcher" role="group" aria-label={t('Язык интерфейса')}>
      {languages.map(({ locale: value, code, name }) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-label={name}
          title={name}
          aria-pressed={locale === value}
          onClick={() => changeLanguage(value)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
