'use client';

import { Check, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';

const themes = [
  { value: 'light', label: 'Светлая', description: 'Чистый светлый фон и мягкие оттенки.', Icon: Sun },
  { value: 'dark', label: 'Тёмная', description: 'Глубокие цвета для спокойной работы.', Icon: Moon },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h1>Настройки</h1>
          <p>Сделайте ServiceDesk удобным для себя.</p>
        </div>
      </div>

      <section className="panel theme-settings" aria-labelledby="appearance-title">
        <div className="theme-settings-heading">
          <span className="section-icon"><Palette size={21} /></span>
          <div>
            <h2 id="appearance-title">Внешний вид</h2>
            <p>Выберите тему оформления интерфейса.</p>
          </div>
        </div>

        <fieldset className="theme-choices">
          <legend className="sr-only">Тема оформления</legend>
          {themes.map(({ value, label, description, Icon }) => (
            <label className="theme-choice" key={value}>
              <input
                className="theme-choice-input sr-only"
                type="radio"
                name="appearance-theme"
                value={value}
                checked={theme === value}
                onChange={() => setTheme(value)}
              />
              <span className="theme-choice-card">
                <span className={`theme-preview theme-preview-${value}`} aria-hidden="true">
                  <span className="theme-preview-sidebar">
                    <span className="theme-preview-brand" />
                    <span className="theme-preview-nav active" />
                    <span className="theme-preview-nav" />
                    <span className="theme-preview-nav" />
                  </span>
                  <span className="theme-preview-main">
                    <span className="theme-preview-topbar"><i /></span>
                    <span className="theme-preview-content">
                      <span className="theme-preview-title" />
                      <span className="theme-preview-stats"><i /><i /><i /></span>
                      <span className="theme-preview-panel"><i /><i /><i /></span>
                    </span>
                  </span>
                </span>
                <span className="theme-choice-label">
                  <Icon size={18} />
                  <strong>{label}</strong>
                  <span className="theme-choice-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                </span>
                <span className="theme-choice-description">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="theme-settings-note">Тема сохраняется автоматически в этом браузере.</p>
      </section>
    </div>
  );
}
