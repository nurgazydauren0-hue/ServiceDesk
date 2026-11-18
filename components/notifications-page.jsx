'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck, FilePlus2, LoaderCircle, MessageSquare, RefreshCw, RotateCcw } from 'lucide-react';
import { useCurrentUser } from './servicedesk-shell';
import { useLanguage } from './language-provider';
import { useNotificationReadState } from './use-notification-read-state';
import { formatDate } from '../lib/date-format.js';
import './notifications-page.css';

const eventLabels = {
  ticket_created: 'Новая заявка',
  ticket_updated: 'Заявка обновлена',
  comment_added: 'Новый комментарий',
};

export default function NotificationsPage() {
  const user = useCurrentUser();
  const { t, locale } = useLanguage();
  const { readIds, markRead, markUnread } = useNotificationReadState(user.id);
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(0);
  const [asOf, setAsOf] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failedRequest, setFailedRequest] = useState(null);
  const controllerRef = useRef(null);
  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;

  const load = useCallback(async (request) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFailedRequest(null);
    setLoading(!request.append);
    setLoadingMore(request.append);
    const query = new URLSearchParams({ scope: 'all', page: String(request.page) });
    if (request.asOf) query.set('asOf', request.asOf);
    try {
      const response = await fetch(`/api/notifications?${query}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('NotificationsUnavailable');
      const result = await response.json();
      if (!Array.isArray(result.notifications) || !Number.isInteger(result.page) ||
          typeof result.hasMore !== 'boolean' || !Number.isFinite(Date.parse(result.generatedAt)))
        throw new Error('InvalidNotifications');
      if (controller.signal.aborted) return;
      setNotifications((previous) => request.append
        ? [...new Map([...previous, ...result.notifications].map((item) => [item.id, item])).values()]
        : result.notifications);
      setPage(result.page);
      setAsOf(result.generatedAt);
      setHasMore(result.hasMore);
    } catch (error) {
      if (!controller.signal.aborted) setFailedRequest(request);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [user.id, user.role]);

  useEffect(() => {
    setNotifications([]);
    setPage(0);
    setAsOf(null);
    setHasMore(false);
    load({ page: 1, append: false, asOf: null });
    return () => controllerRef.current?.abort();
  }, [load]);

  return (
    <div className="notifications-page">
      <div className="page-heading">
        <div>
          <h1>{t('Уведомления')}</h1>
          <p>{t('Новые заявки, изменения и комментарии по доступным вам обращениям.')}</p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={loading || loadingMore}
          onClick={() => load({ page: 1, append: false, asOf: null })}
        >
          <RefreshCw size={16} aria-hidden="true" /> {t('Обновить уведомления')}
        </button>
      </div>

      <section className="notifications-archive" aria-label={t('Лента уведомлений')} aria-busy={loading || loadingMore}>
        <div className="notifications-archive-toolbar">
          <div className="notifications-archive-summary" aria-live="polite">
            <span className="notifications-archive-title"><Bell size={18} aria-hidden="true" /> {t('Все события')}</span>
            {notifications.length > 0 && <p>{t('Загружено: {count}', { count: notifications.length })} · {t('Непрочитанных среди загруженных: {count}', { count: unreadCount })}</p>}
          </div>
          <div className="notifications-archive-actions">
            <button
              type="button"
              className="button secondary small"
              disabled={!unreadCount}
              onClick={() => markRead(notifications.map((item) => item.id))}
            >
              <CheckCheck size={16} aria-hidden="true" /> {t('Отметить загруженные прочитанными')}
            </button>
            <button
              type="button"
              className="button secondary small"
              disabled={!notifications.length || unreadCount === notifications.length}
              onClick={() => markUnread(notifications.map((item) => item.id))}
            >
              <RotateCcw size={15} aria-hidden="true" /> {t('Отметить загруженные непрочитанными')}
            </button>
          </div>
        </div>

        {failedRequest && (
          <div className="notifications-archive-error" role="alert">
            <span>{t('Не удалось обновить уведомления.')}</span>
            <button type="button" className="text-link" onClick={() => load(failedRequest)}>{t('Повторить')}</button>
          </div>
        )}

        {loading && !notifications.length ? (
          <div className="notifications-archive-empty" role="status">
            <LoaderCircle size={26} className="spin" aria-hidden="true" />
            <p>{t('Загрузка уведомлений…')}</p>
          </div>
        ) : !notifications.length && !failedRequest ? (
          <div className="notifications-archive-empty">
            <span className="notifications-archive-empty-icon"><Bell size={27} aria-hidden="true" /></span>
            <h2>{t('Уведомлений пока нет')}</h2>
            <p>{t('Здесь появятся новые заявки, изменения и комментарии.')}</p>
          </div>
        ) : notifications.length > 0 ? (
          <ul className="notifications-archive-list">
            {notifications.map((item) => {
              const isRead = readIds.includes(item.id);
              const Icon = item.type === 'comment_added' ? MessageSquare : item.type === 'ticket_created' ? FilePlus2 : RefreshCw;
              const toggleLabel = t(isRead ? 'Отметить непрочитанным: {title}' : 'Отметить прочитанным: {title}', { title: item.ticketTitle });
              return (
                <li key={item.id} className={`notifications-archive-item${isRead ? '' : ' is-unread'}`}>
                  <Link href={`/tickets/${item.ticketId}`} className="notifications-archive-link" onClick={() => markRead([item.id])}>
                    <span className="notifications-archive-icon"><Icon size={20} aria-hidden="true" /></span>
                    <span className="notifications-archive-content">
                      <span className="notifications-archive-event">
                        <strong>{t(eventLabels[item.type] || 'Заявка обновлена')}</strong>
                        {!isRead && <span className="notifications-archive-dot" aria-label={t('Не прочитано')} />}
                      </span>
                      <span className="notifications-archive-ticket">SD-{String(item.ticketId).padStart(4, '0')} · {item.ticketTitle}</span>
                      {item.authorName && <span className="notifications-archive-author">{t('Автор комментария: {name}', { name: item.authorName })}</span>}
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt, locale, true)}</time>
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="notifications-archive-read-toggle"
                    aria-label={toggleLabel}
                    title={toggleLabel}
                    onClick={() => isRead ? markUnread([item.id]) : markRead([item.id])}
                  >
                    {isRead ? <RotateCcw size={18} aria-hidden="true" /> : <Check size={19} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {hasMore && (
          <div className="notifications-archive-pagination">
            <button
              type="button"
              className="button secondary"
              disabled={loading || loadingMore}
              onClick={() => load({ page: page + 1, append: true, asOf })}
            >
              {loadingMore && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
              {t(loadingMore ? 'Загрузка уведомлений…' : 'Загрузить ещё уведомления')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
