'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'servicedesk-theme';
const ThemeContext = createContext(null);
const isTheme = (value) => value === 'light' || value === 'dark';

function savedTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // The theme can still be changed when browser storage is unavailable.
  }
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  // Match the server render; synchronize before paint after hydration.
  const [theme, updateTheme] = useState('light');
  const setTheme = useCallback((nextTheme) => {
    if (!isTheme(nextTheme)) return;
    document.documentElement.dataset.theme = nextTheme;
    updateTheme(nextTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // A blocked storage API must not prevent applying a preference.
    }
  }, []);

  useLayoutEffect(() => {
    const initialTheme = savedTheme();
    // Also restore the attribute after a development Strict Mode remount.
    document.documentElement.dataset.theme = initialTheme;
    updateTheme(initialTheme);

    function syncTheme(event) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const nextTheme = event.newValue === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = nextTheme;
      updateTheme(nextTheme);
    }
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
