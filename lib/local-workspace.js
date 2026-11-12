export const LOCAL_STATE_VERSION = 1;
const PREFIX = 'servicedesk.local.v1';

export function localStateKey(userId, name) {
  if (typeof userId !== 'string' || !userId || typeof name !== 'string' || !name)
    throw new TypeError('A user and a local setting name are required.');
  const segment = (value) => encodeURIComponent(value).replaceAll('.', '%2E');
  return `${PREFIX}.${segment(userId)}.${segment(name)}`;
}

function storageFailure(error) {
  return error?.name === 'QuotaExceededError' ? 'quota' : 'unavailable';
}

export function readLocalState(storage, key, defaultValue, validate) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    return { value: defaultValue, updatedAt: null, storageError: storageFailure(error) };
  }
  if (raw === null) return { value: defaultValue, updatedAt: null, storageError: null };
  try {
    const entry = JSON.parse(raw);
    if (entry?.version !== LOCAL_STATE_VERSION || !validate(entry.data) ||
        typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt)))
      return { value: defaultValue, updatedAt: null, storageError: 'invalid' };
    return { value: entry.data, updatedAt: entry.updatedAt, storageError: null };
  } catch {
    return { value: defaultValue, updatedAt: null, storageError: 'invalid' };
  }
}

export function writeLocalState(storage, key, value, validate) {
  if (!validate(value)) return { ok: false, updatedAt: null, storageError: 'invalid' };
  const updatedAt = new Date().toISOString();
  try {
    storage.setItem(key, JSON.stringify({ version: LOCAL_STATE_VERSION, data: value, updatedAt }));
    return { ok: true, updatedAt, storageError: null };
  } catch (error) {
    return { ok: false, updatedAt: null, storageError: storageFailure(error) };
  }
}

export function clearLocalState(storage, key) {
  try {
    storage.removeItem(key);
    return { ok: true, storageError: null };
  } catch (error) {
    return { ok: false, storageError: storageFailure(error) };
  }
}

export function localValueUnchanged(expected, current, persisted, options = {}) {
  const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
  if (!same(expected, current)) return false;
  if (persisted.storageError === 'invalid') return false;
  if (persisted.storageError) return true;
  // A failed write may leave an older, known revision in persistent storage.
  if (Object.hasOwn(options, 'fallbackRevision') && Object.hasOwn(options, 'fallbackValue') &&
      persisted.updatedAt === options.fallbackRevision && same(persisted.value, options.fallbackValue))
    return true;
  return same(expected, persisted.value);
}
