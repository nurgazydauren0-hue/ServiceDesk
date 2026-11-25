'use client';

import { useEffect, useRef, useState } from 'react';

const READ_EVENT = 'servicedesk:notifications-read';
const normalize = (value) => Array.isArray(value)
  ? [...new Set(value.filter((id) => typeof id === 'string'))].slice(-500)
  : [];

function storedReadIds(key, fallback = []) {
  try {
    return normalize(JSON.parse(window.localStorage.getItem(key) || '[]'));
  } catch {
    return fallback;
  }
}

export function useNotificationReadState(userId) {
  const key = `servicedesk.notifications.read.${userId}`;
  const [state, setState] = useState({ key: null, ids: [] });
  const latest = useRef(state);

  useEffect(() => {
    function apply(ids) {
      latest.current = { key, ids };
      setState(latest.current);
    }
    function onStorage(event) {
      if (event.key === key || event.key === null) apply(storedReadIds(key));
    }
    function onReadChange(event) {
      if (event.detail?.key === key) apply(normalize(event.detail.ids));
    }
    apply(storedReadIds(key));
    window.addEventListener('storage', onStorage);
    window.addEventListener(READ_EVENT, onReadChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(READ_EVENT, onReadChange);
    };
  }, [key]);

  function update(ids, read) {
    const fallback = latest.current.key === key ? latest.current.ids : [];
    const current = storedReadIds(key, fallback);
    const selected = new Set(ids);
    const next = normalize(read ? [...current, ...ids] : current.filter((id) => !selected.has(id)));
    latest.current = { key, ids: next };
    setState(latest.current);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Both views still stay in sync when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: { key, ids: next } }));
  }

  return {
    readIds: state.key === key ? state.ids : [],
    markRead: (ids) => update(ids, true),
    markUnread: (ids) => update(ids, false),
  };
}
