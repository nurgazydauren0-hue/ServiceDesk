'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'servicedesk.sidebar-collapsed';

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const previouslyMobileOpen = useRef(false);

  // На сервере и при первой отрисовке состояние одинаково.
  // Настройки браузера читаются только после загрузки страницы.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {}
    const media = window.matchMedia('(max-width: 820px)');
    function changeLayout() {
      // При смене ширины фокус не должен оставаться в скрываемой панели.
      if (sidebarRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setMobile(media.matches);
      setMobileOpen(false);
    }
    changeLayout();
    media.addEventListener('change', changeLayout);
    return () => media.removeEventListener('change', changeLayout);
  }, []);

  function saveCollapsed(value) {
    setCollapsed(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
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
    let frame;
    if (previouslyMobileOpen.current && !nowOpen) {
      // После снятия inert возвращаем фокус к той же кнопке.
      // Открытый диалог не теряет свой фокус.
      frame = window.requestAnimationFrame(() => {
        if (!document.querySelector('dialog[open]')) toggleRef.current?.focus();
      });
    }
    previouslyMobileOpen.current = nowOpen;
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [mobile, mobileOpen]);

  useEffect(() => {
    if (!mobile || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Крестика больше нет. Начинаем с активного пункта меню.
    const activeItem = sidebarRef.current?.querySelector('.nav-item.active');
    activeItem?.focus();

    function handleKey(event) {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      // На телефоне доступны панель и единственная кнопка в шапке.
      // Остальное содержимое страницы временно inert.
      const sidebarItems =
        sidebarRef.current?.querySelectorAll(
          'button:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [];
      const items = [toggleRef.current, ...sidebarItems].filter(
        (element) => element && element.getClientRects().length > 0,
      );
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next =
        index < 0
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [mobile, mobileOpen]);

  return {
    collapsed,
    mobile,
    mobileOpen,
    open: mobile ? mobileOpen : !collapsed,
    toggleRef,
    sidebarRef,
    toggle,
    close,
    afterNavigate,
    className: `${collapsed ? 'sidebar-is-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`,
  };
}

export function SidebarToggle({ sidebar }) {
  const label = sidebar.open
    ? 'Скрыть боковую панель'
    : 'Раскрыть боковую панель';
  return (
    <button
      type="button"
      className="sidebar-toggle"
      ref={sidebar.toggleRef}
      onClick={sidebar.toggle}
      aria-controls="desk-sidebar"
      aria-expanded={sidebar.open}
      aria-label={label}
      title={label}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {sidebar.open ? (
          <>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M9 4v16m7-11-3 3 3 3" />
          </>
        ) : (
          <path d="M4 6h16M4 12h16M4 18h16" />
        )}
      </svg>
    </button>
  );
}
