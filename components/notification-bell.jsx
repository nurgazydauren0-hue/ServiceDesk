'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck, FilePlus2, MessageSquare, RefreshCw } from 'lucide-react';
import { useLanguage } from './language-provider';
import { formatDate } from '../lib/date-format.js';
import './notification-bell.css';

const labels = {
  ticket_created: 'Новая заявка',
  ticket_updated: 'Заявка обновлена',
  comment_added: 'Новый комментарий',
};

function storedReadIds(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string').slice(-500) : [];
  } catch {
    return [];
  }
}

export default function NotificationBell({ user, onNavigate }) {
  const { t, locale } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const readKey = `servicedesk.notifications.read.${user.id}`;
  const unread = notifications.filter((item) => !readIds.includes(item.id)).length;

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    setNotifications([]);
    setReadIds(storedReadIds(readKey));
  }, [readKey, user.role]);

  useEffect(() => {
    let active = true;
    let pending = false;
    let controller;

    async function load() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      try {
        const response = await fetch('/api/notifications', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('NotificationsUnavailable');
        const result = await response.json();
        if (!Array.isArray(result.notifications)) throw new Error('InvalidNotifications');
        if (active) {
          setNotifications(result.notifications);
          setFailed(false);
        }
      } catch (error) {
        if (active && error.name !== 'AbortError') setFailed(true);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }

    function refreshWhenVisible() {
      if (!document.hidden) load();
    }
    setLoading(true);
    load();
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('servicedesk:ticket-created', load);
    window.addEventListener('servicedesk:ticket-updated', load);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('servicedesk:ticket-created', load);
      window.removeEventListener('servicedesk:ticket-updated', load);
    };
  }, [user.id, user.role, refreshVersion]);

  useEffect(() => {
    function outside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function otherMenu(event) {
      if (event.detail !== 'notifications') setOpen(false);
    }
    function syncRead(event) {
      if (event.key === readKey || event.key === null) setReadIds(storedReadIds(readKey));
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('servicedesk:header-menu', otherMenu);
    window.addEventListener('storage', syncRead);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('servicedesk:header-menu', otherMenu);
      window.removeEventListener('storage', syncRead);
    };
  }, [open, readKey]);

  function markRead(ids) {
    const next = [...new Set([...readIds, ...ids])].slice(-500);
    setReadIds(next);
    try {
      window.localStorage.setItem(readKey, JSON.stringify(next));
    } catch {
      // Reading remains available when browser storage is blocked.
    }
  }

  function toggle() {
    if (!open) {
      window.dispatchEvent(new CustomEvent('servicedesk:header-menu', { detail: 'notifications' }));
      setRefreshVersion((value) => value + 1);
    }
    setOpen((value) => !value);
  }

  return (
    <div className="notification-menu" ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        data-header-menu-trigger
        ref={triggerRef}
        aria-label={unread ? t('Уведомления: непрочитанных {count}', { count: unread }) : t('Уведомления')}
        title={t('Уведомления')}
        aria-expanded={open}
        aria-controls={open ? 'notification-panel' : undefined}
        onClick={toggle}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <section className="notification-panel" id="notification-panel" aria-label={t('Уведомления')}>
          <div className="notification-heading">
            <h2>{t('Уведомления')}</h2>
            <button
              type="button"
              className="notification-mark-all"
              disabled={!unread}
              title={t('Отметить все прочитанными')}
              aria-label={t('Отметить все прочитанными')}
              onClick={() => markRead(notifications.map((item) => item.id))}
            >
              <CheckCheck size={19} aria-hidden="true" />
            </button>
          </div>
          {failed && (
            <div className="notification-error" role="status">
              <span>{t('Не удалось обновить уведомления.')}</span>
              <button type="button" onClick={() => setRefreshVersion((value) => value + 1)}>{t('Повторить')}</button>
            </div>
          )}
          {loading && !notifications.length ? (
            <p className="notification-empty" role="status">{t('Загрузка уведомлений…')}</p>
          ) : !notifications.length && !failed ? (
            <div className="notification-empty">
              <Bell size={25} aria-hidden="true" />
              <strong>{t('Новых уведомлений пока нет')}</strong>
              <p>{t('Здесь появятся новые заявки, изменения и комментарии.')}</p>
            </div>
          ) : notifications.length > 0 ? (
            <ul className="notification-list">
              {notifications.map((item) => {
                const isUnread = !readIds.includes(item.id);
                const Icon = item.type === 'comment_added' ? MessageSquare : item.type === 'ticket_created' ? FilePlus2 : RefreshCw;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/tickets/${item.ticketId}`}
                      className={`notification-item${isUnread ? ' is-unread' : ''}`}
                      onClick={() => { markRead([item.id]); setOpen(false); onNavigate?.(); }}
                    >
                      <span className="notification-icon"><Icon size={17} aria-hidden="true" /></span>
                      <span className="notification-content">
                        <strong>{t(labels[item.type] || 'Заявка обновлена')}</strong>
                        <span className="notification-ticket">SD-{String(item.ticketId).padStart(4, '0')} · {item.ticketTitle}</span>
                        <time dateTime={item.createdAt}>{formatDate(item.createdAt, locale, true)}</time>
                      </span>
                      {isUnread && <span className="notification-unread-dot" aria-label={t('Не прочитано')} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="notification-footnote">{t('Последние события по доступным вам заявкам')}</p>
        </section>
      )}
    </div>
  );
}
