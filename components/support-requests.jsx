'use client';

// Support center = the SupportRequest table: a ticket can be sent there as a
// complaint, a question or a claim that it was solved badly. An administrator answers.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CheckCheck,
  CircleCheck,
  CircleHelp,
  Eye,
  Headset,
  Inbox,
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

/**
 * Form that writes one row to SupportRequest. With `ticketId` the ticket is fixed
 * (dialog in the ticket card); with `tickets` the user picks one (support center page).
 */
function RequestForm({ ticketId, tickets, onSent, onCancel }) {
  const { t } = useLanguage();
  const [ticket, setTicket] = useState(ticketId ? String(ticketId) : '');
  const [type, setType] = useState('QUESTION');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${ticket}/support-requests`, {
        method: 'POST',
        body: JSON.stringify({ type, message }),
      });
      setMessage('');
      if (!ticketId) setTicket('');
      onSent();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="sr-form">
      {!ticketId && (
        <label className="sr-field">
          <span>{t('Заявка')}</span>
          <select required value={ticket} disabled={busy} onChange={(event) => setTicket(event.target.value)}>
            <option value="">{t('Выберите заявку…')}</option>
            {(tickets || []).map((item) => (
              <option key={item.id} value={item.id}>{ticketCode(item.id)} · {item.title}</option>
            ))}
          </select>
        </label>
      )}
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
        {onCancel && (
          <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
            {t('Отмена')}
          </button>
        )}
        <button className="button primary" disabled={busy || !ticket || message.trim().length < 10}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
          {busy ? t('Отправляем…') : t('Отправить в центр поддержки')}
        </button>
      </div>
    </form>
  );
}

function SendDialog({ ticketId, onClose, onSent }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog className="confirm-dialog sr-dialog" ref={ref} aria-labelledby="sr-dialog-title" onCancel={onClose}>
      <button type="button" className="sr-dialog-close" aria-label={t('Закрыть')} onClick={onClose}>
        <X size={18} />
      </button>
      <div className="dialog-icon sr-dialog-icon"><Headset size={24} /></div>
      <h2 id="sr-dialog-title">{t('Отправить в центр поддержки')}</h2>
      <p>{t('Обращение получит администратор. Он разберётся и ответит вам здесь же, в карточке заявки.')}</p>
      <RequestForm ticketId={ticketId} onSent={onSent} onCancel={onClose} />
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
      <p className="sr-author">
        {showAuthor && item.author && (
          <>
            <span className="sr-avatar" aria-hidden="true">{initials(item.author.name)}</span>
            {item.author.name}
            {' · '}
          </>
        )}
        {item.ticket && (
          <Link href={`/tickets/${item.ticket.id}#support-center`}>{ticketCode(item.ticket.id)} {item.ticket.title}</Link>
        )}
        {showAuthor && (
          <span className="sr-assignee">
            {' · '}
            {item.ticket?.assignedTo
              ? t('Исполнитель: {name}', { name: item.ticket.assignedTo.name })
              : t('Исполнитель не назначен')}
          </span>
        )}
      </p>
      <p className="sr-message">{item.message}</p>
      {item.response ? (
        <div className="sr-response">
          <strong>
            {t('Ответ администратора')}
            {item.handledBy ? ` · ${item.handledBy.name}` : ''}
            {item.resolvedAt ? ` · ${formatDate(item.resolvedAt, locale, true)}` : ''}
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
            <li key={item.id} className={`sr-card sr-card-${item.type.toLowerCase()}`}>
              <RequestBody item={item} showAuthor={user.role === 'ADMIN'} />
            </li>
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
        {failure && <span className="sr-error" role="alert">{t(failure)}</span>}
      </form>
    </li>
  );
}

function Kpi({ icon: Icon, value, label, tone }) {
  const { locale } = useLanguage();
  return (
    <div className={`sr-kpi tone-${tone}${value ? '' : ' is-zero'}`}>
      <span className="sr-kpi-icon"><Icon size={18} /></span>
      <span>
        <strong>{value.toLocaleString(locale)}</strong>
        <span>{label}</span>
      </span>
    </div>
  );
}

const statusTabs = [
  ['ACTIVE', 'Открытые'],
  ['OPEN', 'Новые'],
  ['IN_REVIEW', 'На рассмотрении'],
  ['RESOLVED', 'Решённые'],
];

/** Administrator: every row of SupportRequest, handled here. */
export function AdminSupportCenter({ data, reload }) {
  const { t, locale } = useLanguage();
  const [tab, setTab] = useState('ACTIVE');
  const [type, setType] = useState('');
  const k = data.kpis;
  const source = tab === 'RESOLVED' ? data.resolved : data.active;
  const items = source.filter((item) =>
    (tab === 'ACTIVE' || tab === 'RESOLVED' || item.status === tab) && (!type || item.type === type));
  return (
    <>
      <div className="sr-kpis">
        <Kpi icon={Inbox} tone="red" value={k.open} label={t('Новые обращения')} />
        <Kpi icon={Eye} tone="amber" value={k.inReview} label={t('На рассмотрении')} />
        <Kpi icon={MessageCircleWarning} tone="red" value={k.complaints} label={t('Открытые жалобы')} />
        <Kpi icon={CheckCheck} tone="green" value={k.resolvedToday} label={t('Решено сегодня')} />
        <Kpi icon={Headset} tone="blue" value={k.total} label={t('Всего обращений')} />
      </div>
      <section className="panel sr-admin" aria-labelledby="sr-admin-title">
        <div className="panel-heading">
          <div>
            <h2 id="sr-admin-title">
              <MessageCircleWarning size={18} /> {t('Жалобы и вопросы')}{' '}
              <span className="count-pill">{items.length.toLocaleString(locale)}</span>
            </h2>
            <p>{t('Заявки, которые пользователи отправили в центр поддержки. Старые — сверху.')}</p>
          </div>
        </div>
        <div className="sr-filters">
          <div className="sr-tabs" role="group" aria-label={t('Статус обращений')}>
            {statusTabs.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>
                {t(label)}
              </button>
            ))}
          </div>
          <label className="sr-type-filter">
            <span className="sr-only">{t('Тип обращения')}</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">{t('Все типы')}</option>
              {Object.entries(supportRequestTypes).map(([key, { label }]) => (
                <option key={key} value={key}>{t(label)}</option>
              ))}
            </select>
          </label>
        </div>
        {items.length ? (
          <ul className="sr-list sr-admin-list">
            {items.map((item) => (tab === 'RESOLVED'
              ? <li key={item.id} className={`sr-card sr-card-${item.type.toLowerCase()}`}><RequestBody item={item} showAuthor /></li>
              : <AdminRequestCard key={item.id} item={item} onChanged={reload} />))}
          </ul>
        ) : (
          <p className="sr-clear">
            <CircleCheck size={18} />
            {t(tab === 'RESOLVED' ? 'Решённых обращений пока нет.' : 'Открытых жалоб и вопросов нет.')}
          </p>
        )}
      </section>
    </>
  );
}

/** Employee or IT specialist: send a ticket to the support center and follow the answer. */
export function MySupportCenter({ data, reload }) {
  const { t, locale } = useLanguage();
  const [sent, setSent] = useState(false);
  return (
    <div className="sr-layout">
      <section className="panel sr-new" aria-labelledby="sr-new-title">
        <h2 id="sr-new-title"><Send size={17} /> {t('Новое обращение')}</h2>
        <p>{t('Выберите заявку, тип обращения и опишите ситуацию. Ответит администратор.')}</p>
        {sent && <Message success>{'Обращение отправлено в центр поддержки.'}</Message>}
        {data.tickets.length ? (
          <RequestForm tickets={data.tickets} onSent={() => { setSent(true); reload(); }} />
        ) : (
          <p className="sr-empty">{t('У вас пока нет заявок. Сначала создайте заявку.')}</p>
        )}
      </section>
      <section className="panel sr-admin" aria-labelledby="sr-mine-title">
        <div className="panel-heading">
          <div>
            <h2 id="sr-mine-title">
              <MessageCircleWarning size={18} /> {t('Мои жалобы и вопросы')}{' '}
              <span className="count-pill">{data.mine.length.toLocaleString(locale)}</span>
            </h2>
            <p>{t('Открытых: {active} · решённых: {resolved}', { active: data.kpis.active, resolved: data.kpis.resolved })}</p>
          </div>
        </div>
        {data.mine.length ? (
          <ul className="sr-list sr-admin-list">
            {data.mine.map((item) => (
              <li key={item.id} className={`sr-card sr-card-${item.type.toLowerCase()}`}>
                <RequestBody item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="sr-clear">{t('Вы ещё не отправляли жалоб и вопросов.')}</p>
        )}
      </section>
    </div>
  );
}
