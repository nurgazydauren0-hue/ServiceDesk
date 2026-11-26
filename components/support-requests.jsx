'use client';

// Escalations to the support center: a ticket can be sent there as a complaint,
// a question or a claim that it was solved badly. An administrator answers.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  CircleHelp,
  Eye,
  Headset,
  LoaderCircle,
  MessageCircleWarning,
  Send,
  ThumbsDown,
  X,
} from 'lucide-react';
import { useLanguage } from './language-provider';
import { initials, useCurrentUser } from './servicedesk-shell';
import { formatDate } from '../lib/date-format.js';
import { Message, request, useResource } from './servicedesk-pages';
import './support-requests.css';

export const supportRequestTypes = {
  COMPLAINT: { label: 'Жалоба', hint: 'Недовольны работой поддержки: долго, грубо или заявку не решают', Icon: MessageCircleWarning },
  QUESTION: { label: 'Вопрос', hint: 'Нужно разъяснение администратора по этой заявке', Icon: CircleHelp },
  QUALITY: { label: 'Некачественное решение', hint: 'Заявку закрыли, но проблема осталась или решена плохо', Icon: ThumbsDown },
};
export const supportRequestStatuses = {
  OPEN: 'Новое',
  IN_REVIEW: 'На рассмотрении',
  RESOLVED: 'Решено',
};

export const requestCode = (id) => `SR-${String(id).padStart(4, '0')}`;
const ticketCode = (id) => `SD-${String(id).padStart(4, '0')}`;

export function RequestType({ type }) {
  const { t } = useLanguage();
  const entry = supportRequestTypes[type];
  if (!entry) return null;
  const { Icon } = entry;
  return (
    <span className={`sr-type sr-type-${type.toLowerCase()}`}>
      <Icon size={13} /> {t(entry.label)}
    </span>
  );
}

export function RequestStatus({ status }) {
  const { t } = useLanguage();
  return <span className={`sr-status sr-status-${status.toLowerCase()}`}>{t(supportRequestStatuses[status] || status)}</span>;
}

/** Dialog that sends the ticket to the support center. */
function SendDialog({ ticketId, onClose, onSent }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  const [type, setType] = useState('QUESTION');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${ticketId}/support-requests`, {
        method: 'POST',
        body: JSON.stringify({ type, message }),
      });
      onSent();
    } catch (error) {
      setFailure(error.message);
      setBusy(false);
    }
  }
  return (
    <dialog
      className="confirm-dialog sr-dialog"
      ref={ref}
      aria-labelledby="sr-dialog-title"
      onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}
    >
      <button type="button" className="sr-dialog-close" aria-label={t('Закрыть')} onClick={onClose} disabled={busy}>
        <X size={18} />
      </button>
      <div className="dialog-icon sr-dialog-icon"><Headset size={24} /></div>
      <h2 id="sr-dialog-title">{t('Отправить в центр поддержки')}</h2>
      <p>{t('Обращение получит администратор. Он разберётся и ответит вам здесь же, в карточке заявки.')}</p>
      <form onSubmit={submit}>
        <fieldset className="sr-types" disabled={busy}>
          <legend>{t('Тип обращения')}</legend>
          {Object.entries(supportRequestTypes).map(([key, { label, hint, Icon }]) => (
            <label key={key} className={type === key ? 'is-selected' : ''}>
              <input type="radio" name="type" value={key} checked={type === key} onChange={() => setType(key)} />
              <Icon size={18} />
              <span>
                <strong>{t(label)}</strong>
                <small>{t(hint)}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="sr-field">
          <span>{t('Опишите ситуацию')}</span>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={message}
            disabled={busy}
            placeholder={t('Что случилось и чего вы ожидаете от поддержки?')}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <Message>{failure}</Message>
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {t('Отмена')}
          </button>
          <button className="button primary" disabled={busy || message.trim().length < 10}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            {busy ? t('Отправляем…') : t('Отправить')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function RequestBody({ item, showAuthor = false }) {
  const { t, locale } = useLanguage();
  return (
    <>
      <div className="sr-head">
        <span className="ticket-id">{requestCode(item.id)}</span>
        <RequestType type={item.type} />
        <RequestStatus status={item.status} />
        <time>{formatDate(item.createdAt, locale, true)}</time>
      </div>
      {showAuthor && item.author && (
        <p className="sr-author">
          <span className="sr-avatar" aria-hidden="true">{initials(item.author.name)}</span>
          {item.author.name}
          {item.ticket && (
            <>
              {' · '}
              <Link href={`/tickets/${item.ticket.id}`}>{ticketCode(item.ticket.id)} {item.ticket.title}</Link>
            </>
          )}
        </p>
      )}
      <p className="sr-message">{item.message}</p>
      {item.response ? (
        <div className="sr-response">
          <strong>
            {t('Ответ администратора')}
            {item.handledBy ? ` · ${item.handledBy.name}` : ''}
          </strong>
          <p>{item.response}</p>
        </div>
      ) : item.status === 'IN_REVIEW' ? (
        <p className="sr-pending"><Eye size={14} /> {t('Администратор рассматривает обращение')}</p>
      ) : item.status === 'OPEN' ? (
        <p className="sr-pending">{t('Ждёт рассмотрения администратором')}</p>
      ) : null}
    </>
  );
}

/** Panel in the ticket card: the send button and requests of this ticket. */
export function TicketSupportRequests({ ticketId }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  const { data, loading, error, reload } = useResource(`/api/tickets/${ticketId}/support-requests`);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const requests = data?.requests || [];
  const hasActive = requests.some((item) => item.authorId === user.id && item.status !== 'RESOLVED');
  return (
    <section className="panel sr-panel" id="support-center" aria-labelledby="sr-panel-title">
      <div className="sr-panel-heading">
        <div>
          <h2 id="sr-panel-title">
            <Headset size={19} /> {t('Центр поддержки')}{' '}
            <span className="count-pill">{requests.length.toLocaleString(locale)}</span>
          </h2>
          <p>
            {t(user.role === 'ADMIN'
              ? 'Жалобы и вопросы пользователей по этой заявке'
              : 'Недовольны решением или есть вопрос? Отправьте заявку администратору.')}
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={hasActive}
          title={hasActive ? t('Дождитесь ответа на открытое обращение') : undefined}
          onClick={() => { setSent(false); setOpen(true); }}
        >
          <Headset size={16} /> {t('Отправить в центр поддержки')}
        </button>
      </div>
      {sent && <div className="sr-sent"><Message success>{'Обращение отправлено в центр поддержки.'}</Message></div>}
      {loading && !data ? (
        <p className="sr-empty">{t('Загружаем данные…')}</p>
      ) : error ? (
        <p className="sr-empty">{t(error)}</p>
      ) : requests.length ? (
        <ul className="sr-list">
          {requests.map((item) => (
            <li key={item.id}><RequestBody item={item} showAuthor={user.role === 'ADMIN'} /></li>
          ))}
        </ul>
      ) : (
        <p className="sr-empty">{t('По этой заявке обращений в центр поддержки нет.')}</p>
      )}
      {open && (
        <SendDialog
          ticketId={ticketId}
          onClose={() => setOpen(false)}
          onSent={() => { setOpen(false); setSent(true); reload(); }}
        />
      )}
    </section>
  );
}

/** Administrator's work on one request: take into review, answer and close. */
function AdminRequestCard({ item, onChanged }) {
  const { t } = useLanguage();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  async function save(status) {
    setBusy(status);
    setFailure('');
    try {
      await request(`/api/support/requests/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(status === 'RESOLVED' ? { status, response: answer } : { status }),
      });
      onChanged();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <li className={`sr-card sr-card-${item.type.toLowerCase()}`}>
      <RequestBody item={item} showAuthor />
      <form className="sr-answer" onSubmit={(event) => { event.preventDefault(); save('RESOLVED'); }}>
        <label className="sr-field">
          <span className="sr-only">{t('Ответ пользователю по {id}', { id: requestCode(item.id) })}</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={answer}
            disabled={!!busy}
            placeholder={t('Ответ пользователю…')}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </label>
        <div className="sr-actions">
          {item.status === 'OPEN' && (
            <button type="button" className="button secondary small" disabled={!!busy} onClick={() => save('IN_REVIEW')}>
              <Eye size={14} /> {t(busy === 'IN_REVIEW' ? 'Сохраняем…' : 'Взять в рассмотрение')}
            </button>
          )}
          <Link className="button secondary small" href={`/tickets/${item.ticket?.id}#support-center`}>
            {t('Открыть заявку')}
          </Link>
          <button className="button primary small" disabled={!!busy || answer.trim().length < 2}>
            <CircleCheck size={14} /> {t(busy === 'RESOLVED' ? 'Сохраняем…' : 'Ответить и закрыть')}
          </button>
        </div>
        {failure && <span className="sc-error" role="alert">{t(failure)}</span>}
      </form>
    </li>
  );
}

/** Support center block: administrator handles requests, others follow their own. */
export function EscalationsPanel({ escalations, reload }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  if (!escalations) return null;
  if (user.role === 'ADMIN') {
    const active = escalations.active || [];
    const counts = Object.keys(supportRequestTypes).map((type) => [type, active.filter((item) => item.type === type).length]);
    return (
      <section className="panel sr-admin" aria-labelledby="sr-admin-title">
        <div className="panel-heading">
          <div>
            <h2 id="sr-admin-title">
              <MessageCircleWarning size={18} /> {t('Жалобы и вопросы')}{' '}
              <span className="count-pill">{active.length.toLocaleString(locale)}</span>
            </h2>
            <p>{t('Заявки, которые пользователи отправили в центр поддержки. Старые — сверху.')}</p>
          </div>
          <div className="sr-counts">
            {counts.map(([type, count]) => (
              <span key={type}><RequestType type={type} /> {count.toLocaleString(locale)}</span>
            ))}
          </div>
        </div>
        {active.length ? (
          <ul className="sr-list sr-admin-list">
            {active.map((item) => <AdminRequestCard key={item.id} item={item} onChanged={reload} />)}
          </ul>
        ) : (
          <p className="sc-clear"><CircleCheck size={18} /> {t('Открытых жалоб и вопросов нет.')}</p>
        )}
        {escalations.resolved?.length > 0 && (
          <details className="sr-resolved">
            <summary>{t('Недавно закрытые: {count}', { count: escalations.resolved.length })}</summary>
            <ul className="sr-list">
              {escalations.resolved.map((item) => <li key={item.id}><RequestBody item={item} showAuthor /></li>)}
            </ul>
          </details>
        )}
      </section>
    );
  }
  const mine = escalations.mine || [];
  return (
    <section className="panel sr-admin" aria-labelledby="sr-mine-title">
      <div className="panel-heading">
        <div>
          <h2 id="sr-mine-title">
            <MessageCircleWarning size={18} /> {t('Мои жалобы и вопросы')}{' '}
            <span className="count-pill">{mine.length.toLocaleString(locale)}</span>
          </h2>
          <p>{t('Чтобы пожаловаться или задать вопрос, откройте заявку и нажмите «Отправить в центр поддержки».')}</p>
        </div>
      </div>
      {mine.length ? (
        <ul className="sr-list sr-admin-list">
          {mine.map((item) => (
            <li key={item.id} className={`sr-card sr-card-${item.type.toLowerCase()}`}>
              <RequestBody item={item} />
              <Link className="text-link" href={`/tickets/${item.ticket?.id}#support-center`}>
                {ticketCode(item.ticket?.id)} {item.ticket?.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sc-clear">{t('Вы ещё не отправляли жалоб и вопросов.')}</p>
      )}
    </section>
  );
}
