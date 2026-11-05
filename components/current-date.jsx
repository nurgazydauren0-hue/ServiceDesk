'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { calendarDate } from '../lib/date-format.js';

const CurrentDateContext = createContext(null);

export function CurrentDateProvider({ initialDate, children }) {
  // Reuse the server snapshot during hydration, including at midnight.
  const [today, setToday] = useState(initialDate);

  useEffect(() => {
    const update = () => setToday(calendarDate(new Date().toISOString()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <CurrentDateContext.Provider value={today}>
      {children}
    </CurrentDateContext.Provider>
  );
}

export function useCurrentDate() {
  return useContext(CurrentDateContext);
}
