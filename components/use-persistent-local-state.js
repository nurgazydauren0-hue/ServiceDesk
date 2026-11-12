'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearLocalState, localStateKey, localValueUnchanged, readLocalState, writeLocalState } from '../lib/local-workspace.js';

const LOCAL_EVENT = 'servicedesk:local-state';
// Failed writes remain consistent between components until this tab is closed.
const fallbackSnapshots = new Map();

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function usePersistentLocalState({ userId, name, defaultValue, validate }) {
  const key = userId ? localStateKey(userId, name) : null;
  const options = useRef({ defaultValue, validate });
  options.current = { defaultValue, validate };
  const [state, setState] = useState({ key, value: defaultValue, ready: false, updatedAt: null, storageError: null });
  const current = useRef(state);

  const publish = useCallback((next) => {
    current.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    function load(external = false) {
      const { defaultValue: fallback, validate: predicate } = options.current;
      const entry = key ? readLocalState(storage(), key, fallback, predicate)
        : { value: fallback, updatedAt: null, storageError: null };
      if (external && !entry.storageError) fallbackSnapshots.delete(key);
      const fallbackEntry = fallbackSnapshots.get(key);
      publish(fallbackEntry && predicate(fallbackEntry.value)
        ? { key, value: fallbackEntry.value, updatedAt: fallbackEntry.updatedAt, storageError: fallbackEntry.storageError, ready: true }
        : { key, ...entry, ready: true });
    }
    function syncStorage(event) {
      if (event.key === key || event.key === null) load(true);
    }
    function syncLocal(event) {
      const entry = event.detail;
      if (entry?.key === key && options.current.validate(entry.value))
        publish({ key, value: entry.value, updatedAt: entry.updatedAt, storageError: entry.storageError, ready: true });
    }
    load();
    window.addEventListener('storage', syncStorage);
    window.addEventListener(LOCAL_EVENT, syncLocal);
    return () => {
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener(LOCAL_EVENT, syncLocal);
    };
  }, [key, publish]);

  const setValue = useCallback((update) => {
    const { defaultValue: fallback, validate: predicate } = options.current;
    const persisted = key ? readLocalState(storage(), key, fallback, predicate)
      : { value: fallback, updatedAt: null };
    const retained = fallbackSnapshots.get(key);
    const previous = current.current.key === key && current.current.ready
      ? current.current.value
      : retained?.value ?? persisted.value;
    const value = typeof update === 'function' ? update(previous) : update;
    if (!predicate(value)) return false;
    const result = key ? writeLocalState(storage(), key, value, predicate)
      : { ok: false, updatedAt: null, storageError: 'unavailable' };
    const next = { key, value, ready: true, updatedAt: result.updatedAt, storageError: result.storageError };
    if (key) {
      if (result.ok) fallbackSnapshots.delete(key);
      else fallbackSnapshots.set(key, { ...next, baseUpdatedAt: retained ? retained.baseUpdatedAt : persisted.updatedAt, baseValue: retained ? retained.baseValue : persisted.value });
    }
    publish(next);
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: next }));
    return result.ok;
  }, [key, publish]);

  const clear = useCallback(() => {
    const retained = fallbackSnapshots.get(key);
    const persisted = key ? readLocalState(storage(), key, options.current.defaultValue, options.current.validate) : null;
    const result = key ? clearLocalState(storage(), key) : { ok: true, storageError: null };
    const next = { key, value: options.current.defaultValue, ready: true, updatedAt: null, storageError: result.storageError };
    if (key) {
      if (result.ok) fallbackSnapshots.delete(key);
      else fallbackSnapshots.set(key, { ...next, baseUpdatedAt: retained ? retained.baseUpdatedAt : persisted?.updatedAt, baseValue: retained ? retained.baseValue : persisted?.value });
    }
    publish(next);
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: next }));
    return result.ok;
  }, [key, publish]);

  const clearIfUnchanged = useCallback((expectedValue) => {
    if (current.current.key !== key || !current.current.ready) return false;
    const { defaultValue: fallback, validate: predicate } = options.current;
    const persisted = key ? readLocalState(storage(), key, fallback, predicate)
      : { value: current.current.value, storageError: 'unavailable' };
    const retained = fallbackSnapshots.get(key);
    const comparison = retained ? { fallbackRevision: retained.baseUpdatedAt, fallbackValue: retained.baseValue } : {};
    if (!localValueUnchanged(expectedValue, current.current.value, persisted, comparison)) return false;
    return clear();
  }, [key, clear]);

  // A different account must never briefly display the previous account's data.
  const visible = state.key === key ? state
    : { value: defaultValue, ready: false, updatedAt: null, storageError: null };
  return { value: visible.value, ready: visible.ready, updatedAt: visible.updatedAt, storageError: visible.storageError, setValue, clear, clearIfUnchanged };
}
