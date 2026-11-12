import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UI_PREFERENCES,
  parseUiPreferencesImport,
  serializeUiPreferences,
  validateUiPreferences,
} from '../lib/ui-preferences.js';

test('предпочтения принимают только поддерживаемые значения и сохраняют прежний вид по умолчанию', () => {
  assert.deepEqual(DEFAULT_UI_PREFERENCES, {
    density: 'comfortable', textSize: 'normal', accent: 'default', reduceMotion: false,
  });
  assert.equal(validateUiPreferences(DEFAULT_UI_PREFERENCES), true);
  assert.equal(validateUiPreferences({ density: 'compact', textSize: 'large', accent: 'teal', reduceMotion: true }), true);
  for (const value of [
    null, [], {},
    { ...DEFAULT_UI_PREFERENCES, density: 'unknown' },
    { ...DEFAULT_UI_PREFERENCES, textSize: 'huge' },
    { ...DEFAULT_UI_PREFERENCES, accent: 'red' },
    { ...DEFAULT_UI_PREFERENCES, reduceMotion: 'false' },
    { ...DEFAULT_UI_PREFERENCES, role: 'ADMIN' },
  ]) assert.equal(validateUiPreferences(value), false);
});

test('экспорт переносит только настройки интерфейса, импорт возвращает отдельный объект', () => {
  const preferences = { density: 'compact', textSize: 'large', accent: 'violet', reduceMotion: true };
  const file = serializeUiPreferences(preferences);
  const parsed = JSON.parse(file);
  assert.deepEqual(Object.keys(parsed), ['kind', 'version', 'preferences']);
  assert.deepEqual(parsed.preferences, preferences);
  const imported = parseUiPreferencesImport(file);
  assert.deepEqual(imported, preferences);
  imported.accent = 'default';
  assert.equal(preferences.accent, 'violet');
  assert.throws(() => serializeUiPreferences({ ...preferences, secret: 'private' }));
});

test('импорт отклоняет повреждённые, лишние и несовместимые данные', () => {
  const valid = JSON.parse(serializeUiPreferences(DEFAULT_UI_PREFERENCES));
  for (const text of [
    '{', '', 'null', '[]',
    'x'.repeat(16_385),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, kind: 'other-app' }),
    JSON.stringify({ ...valid, DATABASE_URL: 'private' }),
    JSON.stringify({ ...valid, preferences: { ...valid.preferences, role: 'ADMIN' } }),
    JSON.stringify({ ...valid, preferences: { ...valid.preferences, reduceMotion: 1 } }),
  ]) assert.throws(() => parseUiPreferencesImport(text));
});
