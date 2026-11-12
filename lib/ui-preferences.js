export const DEFAULT_UI_PREFERENCES = Object.freeze({
  density: 'comfortable',
  textSize: 'normal',
  accent: 'default',
  reduceMotion: false,
});

const preferenceKeys = Object.keys(DEFAULT_UI_PREFERENCES);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateUiPreferences(value) {
  if (!isRecord(value) || Object.keys(value).length !== preferenceKeys.length)
    return false;
  if (!preferenceKeys.every((key) => Object.hasOwn(value, key))) return false;
  return ['comfortable', 'compact'].includes(value.density) &&
    ['normal', 'large'].includes(value.textSize) &&
    ['default', 'teal', 'violet'].includes(value.accent) &&
    typeof value.reduceMotion === 'boolean';
}

function copyPreferences(value) {
  return {
    density: value.density,
    textSize: value.textSize,
    accent: value.accent,
    reduceMotion: value.reduceMotion,
  };
}

export function serializeUiPreferences(value) {
  if (!validateUiPreferences(value)) throw new Error('InvalidUiPreferences');
  return JSON.stringify({
    kind: 'servicedesk-ui-preferences',
    version: 1,
    preferences: copyPreferences(value),
  }, null, 2);
}

export function parseUiPreferencesImport(text) {
  if (typeof text !== 'string' || text.length > 16_384)
    throw new Error('InvalidUiPreferencesFile');
  const parsed = JSON.parse(text);
  if (!isRecord(parsed) ||
    Object.keys(parsed).length !== 3 ||
    parsed.kind !== 'servicedesk-ui-preferences' ||
    parsed.version !== 1 ||
    !validateUiPreferences(parsed.preferences))
    throw new Error('InvalidUiPreferencesFile');
  return copyPreferences(parsed.preferences);
}
