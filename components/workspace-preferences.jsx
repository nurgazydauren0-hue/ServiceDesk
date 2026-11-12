'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react';
import { useLanguage } from './language-provider';
import { usePersistentLocalState } from './use-persistent-local-state';
import {
  DEFAULT_UI_PREFERENCES,
  parseUiPreferencesImport,
  serializeUiPreferences,
  validateUiPreferences,
} from '../lib/ui-preferences.js';
import './workspace-preferences.css';

const WorkspacePreferencesContext = createContext(null);
const attributes = {
  density: 'data-workspace-density',
  textSize: 'data-workspace-text-size',
  accent: 'data-workspace-accent',
  reduceMotion: 'data-workspace-motion',
};

export function WorkspacePreferencesProvider({ userId, children }) {
  const preferences = usePersistentLocalState({
    userId,
    name: 'preferences',
    defaultValue: DEFAULT_UI_PREFERENCES,
    validate: validateUiPreferences,
  });
  const { value, ready } = preferences;

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    for (const [key, attribute] of Object.entries(attributes)) {
      if (value[key] === DEFAULT_UI_PREFERENCES[key]) root.removeAttribute(attribute);
      else root.setAttribute(attribute, key === 'reduceMotion' ? 'reduced' : value[key]);
    }
    return () => {
      for (const attribute of Object.values(attributes)) root.removeAttribute(attribute);
    };
  }, [value, ready]);

  return (
    <WorkspacePreferencesContext.Provider value={preferences}>
      {children}
    </WorkspacePreferencesContext.Provider>
  );
}

export function useWorkspacePreferences() {
  return useContext(WorkspacePreferencesContext);
}

export function WorkspacePreferencesSettings() {
  const { t } = useLanguage();
  const { value, setValue, ready, storageError, updatedAt, clear } = useWorkspacePreferences();
  const fileInput = useRef(null);
  const [message, setMessage] = useState('');
  const [importError, setImportError] = useState(false);

  function change(key, nextValue) {
    setMessage('');
    setImportError(false);
    setValue((current) => ({ ...current, [key]: nextValue }));
  }

  function reset() {
    clear();
    setImportError(false);
    setMessage('Настройки интерфейса сброшены.');
  }

  function download() {
    const blob = new Blob([serializeUiPreferences(value)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'servicedesk-interface.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 16_384) throw new Error('InvalidUiPreferencesFile');
      const preferences = parseUiPreferencesImport(await file.text());
      setValue(preferences);
      setImportError(false);
      setMessage('Настройки интерфейса загружены.');
    } catch {
      setImportError(true);
      setMessage('Не удалось загрузить настройки. Выберите файл настроек интерфейса ServiceDesk.');
    }
  }

  return (
    <section className="panel theme-settings workspace-preferences-settings" aria-labelledby="workspace-preferences-title">
      <div className="theme-settings-heading">
        <span className="section-icon"><SlidersHorizontal size={21} /></span>
        <div>
          <h2 id="workspace-preferences-title">{t('Удобство интерфейса')}</h2>
          <p>{t('Настройте плотность, размер текста и акцентный цвет.')}</p>
        </div>
      </div>

      <fieldset className="workspace-preferences-fields" disabled={!ready}>
        <legend className="sr-only">{t('Удобство интерфейса')}</legend>
        <div className="workspace-preferences-grid">
          <label className="workspace-preference-field">
            <span>{t('Плотность таблиц')}</span>
            <select value={value.density} onChange={(event) => change('density', event.target.value)}>
              <option value="comfortable">{t('Обычная')}</option>
              <option value="compact">{t('Компактная')}</option>
            </select>
            <small>{t('Компактный режим показывает больше строк на экране.')}</small>
          </label>
          <label className="workspace-preference-field">
            <span>{t('Размер текста')}</span>
            <select value={value.textSize} onChange={(event) => change('textSize', event.target.value)}>
              <option value="normal">{t('Обычный')}</option>
              <option value="large">{t('Увеличенный')}</option>
            </select>
            <small>{t('Увеличьте текст в таблицах, формах и описаниях.')}</small>
          </label>
        </div>

        <fieldset className="workspace-accent-choices">
          <legend>{t('Акцентный цвет')}</legend>
          {[
            ['default', 'Синий'],
            ['teal', 'Бирюзовый'],
            ['violet', 'Фиолетовый'],
          ].map(([accent, label]) => (
            <label className="workspace-accent-choice" key={accent}>
              <input
                className="sr-only"
                type="radio"
                name="workspace-accent"
                value={accent}
                checked={value.accent === accent}
                onChange={() => change('accent', accent)}
              />
              <span className={`workspace-accent-option workspace-accent-${accent}`}>
                <i aria-hidden="true" />{t(label)}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="workspace-motion-choice">
          <input
            type="checkbox"
            checked={value.reduceMotion}
            onChange={(event) => change('reduceMotion', event.target.checked)}
          />
          <span>
            <strong>{t('Меньше анимации')}</strong>
            <small>{t('Уберите движения и плавные переходы интерфейса.')}</small>
          </span>
        </label>
      </fieldset>

      <div className="workspace-preferences-status" role="status" aria-live="polite">
        {t(storageError
          ? 'Не удалось сохранить настройки в браузере. Они действуют до закрытия страницы.'
          : updatedAt
            ? 'Настройки сохранены в этом браузере.'
            : 'Изменения сохраняются автоматически в этом браузере для вашего аккаунта.')}
      </div>
      {message && <p className={`workspace-preferences-message${importError ? ' is-error' : ''}`} role={importError ? 'alert' : 'status'}>{t(message)}</p>}

      <div className="workspace-preferences-actions">
        <button type="button" className="button secondary small" onClick={reset} disabled={!ready}>
          <RotateCcw size={15} />{t('Сбросить настройки интерфейса')}
        </button>
        <button type="button" className="button secondary small" onClick={download} disabled={!ready}>
          <Download size={15} />{t('Скачать настройки')}
        </button>
        <button type="button" className="button secondary small" onClick={() => fileInput.current?.click()} disabled={!ready}>
          <Upload size={15} />{t('Загрузить настройки')}
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
      </div>
      <p className="workspace-preferences-privacy">{t('Файл содержит только эти настройки интерфейса. Заявки, аккаунт, тема и язык в него не входят.')}</p>
    </section>
  );
}
