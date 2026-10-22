'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'movielist.sidebar-collapsed';

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const closeRef = useRef(null);
  const previouslyMobileOpen = useRef(false);

  // Не читаем window при серверном рендеринге: HTML и первая отрисовка совпадают.
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(STORAGE_KEY) === 'true'); } catch {}
    const media = window.matchMedia('(max-width: 820px)');
    function changeLayout() {
      setMobile(media.matches);
      setMobileOpen(false);
      // При смене ширины фокус не остаётся на скрытой кнопке меню.
      if (media.matches && sidebarRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
    }
    changeLayout();
    media.addEventListener('change', changeLayout);
    return () => media.removeEventListener('change', changeLayout);
  }, []);

  function saveCollapsed(value) {
    setCollapsed(value);
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }

  function close() {
    if (mobile) setMobileOpen(false);
    else {
      toggleRef.current?.focus();
      saveCollapsed(true);
    }
  }

  function toggle() {
    if (mobile) setMobileOpen((value) => !value);
    else saveCollapsed(!collapsed);
  }

  function afterNavigate() {
    if (mobile) close();
  }

  useEffect(() => {
    const nowOpen = mobile && mobileOpen;
    // Возвращаем фокус только ПОСЛЕ снятия inert с основного содержимого.
    if (previouslyMobileOpen.current && !nowOpen && !document.querySelector('dialog[open]')) {
      toggleRef.current?.focus();
    }
    previouslyMobileOpen.current = nowOpen;
  }, [mobile, mobileOpen]);

  useEffect(() => {
    if (!mobile || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = sidebarRef.current?.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [mobile, mobileOpen]);

  return {
    collapsed, mobile, mobileOpen,
    open: mobile ? mobileOpen : !collapsed,
    toggleRef, sidebarRef, closeRef,
    toggle, close, afterNavigate,
    className: `${collapsed ? 'sidebar-is-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`,
  };
}

export function SidebarToggle({ sidebar }) {
  const label = sidebar.open ? 'Скрыть боковую панель' : 'Раскрыть боковую панель';
  return (
    <button type="button" className="sidebar-toggle" ref={sidebar.toggleRef}
      onClick={sidebar.toggle} aria-controls="movie-sidebar" aria-expanded={sidebar.open}
      aria-label={label} title={label}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {sidebar.open ? <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m7-11-3 3 3 3" /></> : <path d="M4 6h16M4 12h16M4 18h16" />}
      </svg>
      <span>{sidebar.open ? 'Скрыть' : 'Меню'}</span>
    </button>
  );
}
