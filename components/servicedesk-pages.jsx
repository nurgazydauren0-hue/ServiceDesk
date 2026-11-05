'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  Headset,
  Inbox,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react';
import { initials, roleLabels, useCurrentUser } from './servicedesk-shell';
import AnimatedNavIcon from './animated-nav-icon';
import SupportScene from './support-scene';
import { useLanguage } from './language-provider';
import { useCurrentDate } from './current-date';
import { formatDate as date, formatLongDate } from '../lib/date-format.js';
import { filterTeamUsers } from '../lib/team-filters.js';
import './dashboard-interactions.css';
import './team-filters.css';

export const statusLabels = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  WAITING: 'Ожидание',
  RESOLVED: 'Решена',
  CLOSED: 'Закрыта',
};
export const priorityLabels = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};
const statusColors = {
  NEW: '#5c8df6',
  IN_PROGRESS: '#6e63d9',
  WAITING: '#efad4f',
  RESOLVED: '#3197d5',
  CLOSED: '#e0525e',
};
const priorityColors = {
  LOW: '#91a6bb',
  MEDIUM: '#5b8def',
  HIGH: '#e9a64b',
  URGENT: '#e46b73',
};
const builtInCategories = new Set([
  'Оборудование',
  'Программное обеспечение',
  'Сеть и интернет',
  'Доступы и учётные записи',
  'Другое',
]);

const categoryLabel = (name, t) => builtInCategories.has(name) ? t(name) : name;

export async function request(url, options = {}) {
  function notifyTicketChange() {
    if (options.method && options.method !== 'GET' && /^\/api\/tickets(?:\/|$)/.test(url)) {
      window.dispatchEvent(new CustomEvent('servicedesk:ticket-updated'));
    }
  }
  let response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('Не удалось связаться с сервером. Повторите попытку.');
  }
  if (response.status === 204) {
    notifyTicketChange();
    return null;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Не удалось связаться с сервером. Повторите попытку.');
  }
  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('Войдите в аккаунт, чтобы продолжить.');
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Не удалось выполнить действие. Проверьте данные и повторите попытку.',
    );
  notifyTicketChange();
  return data;
}
function useResource(url, version = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((old) => ({ ...old, loading: true, error: '' }));
    request(url, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ data: null, loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [url, version, refresh]);
  return { ...state, reload: () => setRefresh((value) => value + 1) };
}
export function Message({ children, success = false, values }) {
  const { t } = useLanguage();
  return children ? (
    <div
      className={`notice ${success ? 'notice-success' : 'notice-error'}`}
      role={success ? 'status' : 'alert'}
    >
      {success ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
      <span>{typeof children === 'string' ? t(children, values) : children}</span>
    </div>
  ) : null;
}
function Loading() {
  const { t } = useLanguage();
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>{t('Загружаем данные…')}</span>
    </div>
  );
}
function ResourceError({ error, retry }) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <span className="empty-icon error-icon">
        <CircleAlert size={25} />
      </span>
      <h3>{t('Не удалось загрузить данные')}</h3>
      <p>{t(error)}</p>
      <button className="button secondary" onClick={retry}>
        <RefreshCw size={16} /> {t('Повторить попытку')}
      </button>
    </div>
  );
}
function Empty({
  title = 'Заявок пока нет',
  text = 'Создайте первую заявку — команда поддержки поможет решить вашу задачу.',
  action = true,
}) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{t(title)}</h3>
      <p>{t(text)}</p>
      {action && (
        <Link href="/tickets/new" className="button primary">
          <AnimatedNavIcon kind="create" size={17} /> {t('Создать заявку')}
        </Link>
      )}
    </div>
  );
}
function PageTitle({ eyebrow, title, description, children }) {
  const { t } = useLanguage();
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{t(eyebrow)}</p>}
        <h1>{t(title)}</h1>
        {description && <p>{t(description)}</p>}
      </div>
      {children}
    </div>
  );
}
function NewButton() {
  const { t } = useLanguage();
  return (
    <Link className="button primary" href="/tickets/new">
      <AnimatedNavIcon kind="create" size={18} /> {t('Создать заявку')}
    </Link>
  );
}
function Status({ value }) {
  const { t } = useLanguage();
  return (
    <span className={`badge status-${value?.toLowerCase()}`}>
      <i />
      {statusLabels[value] ? t(statusLabels[value]) : value}
    </span>
  );
}
function Priority({ value }) {
  const { t } = useLanguage();
  return (
    <span className={`priority priority-${value?.toLowerCase()}`}>
      <span className="priority-bars">
        <i />
        <i />
        <i />
      </span>
      {priorityLabels[value] ? t(priorityLabels[value]) : value}
    </span>
  );
}
function UserName({ user }) {
  const { t } = useLanguage();
  return user ? (
    <span className="user-cell">
      <span className="mini-avatar">{initials(user.name)}</span>
      <span>{user.name}</span>
    </span>
  ) : (
    <span className="muted">{t('Не назначен')}</span>
  );
}
function TicketTable({ tickets, compact = false, support = false }) {
  const { t, locale } = useLanguage();
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>{t('Заявка')}</th>
            {!compact && <th>{support ? t('Автор обращения') : t('Категория')}</th>}
            <th>{t('Приоритет')}</th>
            <th>{t('Статус')}</th>
            <th>{t('Исполнитель')}</th>
            <th>{t('Создана')}</th>
            <th>
              <span className="sr-only">{t('Открыть')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <Link className="ticket-title" href={`/tickets/${ticket.id}`}>
                  <span className="ticket-id">
                    SD-{String(ticket.id).padStart(4, '0')}
                  </span>
                  <span>{ticket.title}</span>
                </Link>
                {(compact || support) && (
                  <span className="ticket-category">
                    {categoryLabel(ticket.category?.name, t)}
                  </span>
                )}
              </td>
              {!compact && (
                <td>
                  {support ? (
                    <div className="support-author">
                      <UserName user={ticket.createdBy} />
                      <span className="support-author-email">
                        {ticket.createdBy?.email || '—'}
                      </span>
                    </div>
                  ) : (
                    <span className="category-label">
                      {categoryLabel(ticket.category?.name, t) || '—'}
                    </span>
                  )}
                </td>
              )}
              <td>
                <Priority value={ticket.priority} />
              </td>
              <td>
                <Status value={ticket.status} />
              </td>
              <td>
                <UserName user={ticket.assignedTo} />
              </td>
              <td className="date-cell">{date(ticket.createdAt, locale)}</td>
              <td>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="table-arrow"
                  aria-label={t('Открыть заявку {id}', { id: ticket.id })}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Stats({ counts }) {
  const { t, locale } = useLanguage();
  const cards = [
    {
      label: 'Всего заявок',
      value: counts.total,
      Icon: Ticket,
      color: 'blue',
      caption: 'Все обращения в системе',
    },
    {
      label: 'Новые заявки',
      value: counts.new,
      Icon: Inbox,
      color: 'amber',
      caption: 'Ожидают первого ответа',
    },
    {
      label: 'В работе',
      value: counts.inProgress,
      Icon: Clock3,
      color: 'purple',
      caption: 'Команда уже решает',
    },
    {
      label: 'Решённые заявки',
      value: counts.resolved + counts.closed,
      Icon: CircleCheck,
      color: 'teal',
      caption: 'Помощь уже оказана',
    },
  ];
  return (
    <div className="stats-grid">
      {cards.map(({ label, value, Icon, color, caption }) => (
        <article className="stat-card" key={label}>
          <div className="stat-top">
            <span>{t(label)}</span>
            <span className={`stat-icon ${color}`}>
              <Icon size={21} />
            </span>
          </div>
          <strong>{(value ?? 0).toLocaleString(locale)}</strong>
          <p>
            <span className={`stat-dot ${color}`} />
            {t(caption)}
          </p>
        </article>
      ))}
    </div>
  );
}
function StatusChart({ statuses = [], total = 0 }) {
  const { t, locale } = useLanguage();
  const [activeStatus, setActiveStatus] = useState(null);
  const entries = Object.entries(statusLabels).map(([status, label]) => ({
    status, label: t(label), count: statuses.find((entry) => entry.status === status)?.count || 0,
  }));
  const sum = entries.reduce((value, entry) => value + entry.count, 0);
  const active = entries.find((entry) => entry.status === activeStatus);
  let offset = 0;
  return (
    <div
      className="status-chart-layout interactive-status-chart"
      onPointerLeave={() => setActiveStatus(null)}
      onKeyDown={(event) => { if (event.key === 'Escape') setActiveStatus(null); }}
    >
      <div className="donut-wrap" style={{ '--active-status-color': active ? statusColors[active.status] : undefined }}>
        <svg
          className="status-ring"
          viewBox="0 0 220 220"
          role="img"
          aria-label={t('Заявки по статусам. {breakdown}', {
            breakdown: entries.map((entry) => `${entry.label}: ${entry.count.toLocaleString(locale)}`).join(', '),
          })}
        >
          <circle className="status-ring-track" cx="110" cy="110" r="78" fill="none" strokeWidth="18" />
          {entries.map((entry) => {
            const fraction = sum ? entry.count / sum : 0;
            const start = offset;
            offset += fraction * 100;
            if (!entry.count) return null;
            return (
              <circle
                key={entry.status}
                className={`status-ring-segment ${activeStatus === entry.status ? 'is-highlighted' : ''} ${activeStatus && activeStatus !== entry.status ? 'is-muted' : ''}`}
                cx="110" cy="110" r="78" fill="none" pathLength="100"
                stroke={statusColors[entry.status]} strokeWidth="18"
                strokeDasharray={`${sum === entry.count ? 100 : Math.max(.1, fraction * 100 - 1.5)} 100`}
                strokeDashoffset={-start}
                transform="rotate(-90 110 110)"
                onPointerEnter={() => setActiveStatus(entry.status)}
              />
            );
          })}
          {active && active.count === 0 && (
            <circle className="status-ring-empty-highlight" cx="110" cy="110" r={sum ? 94 : 78} fill="none" stroke={statusColors[active.status]} strokeWidth={sum ? 3 : 20} />
          )}
        </svg>
        <div className={`donut-center ${active ? 'is-highlighted' : ''}`}>
          <strong>{(active ? active.count : total).toLocaleString(locale)}</strong>
          <span>{active ? active.label : t('всего заявок')}</span>
          {active && (
            <small>{sum
              ? t('{percent} от всех', { percent: (active.count / sum).toLocaleString(locale, { style: 'percent' }) })
              : t('Пока нет заявок')}
            </small>
          )}
        </div>
      </div>
      <div className="chart-legend interactive-status-legend" aria-label={t('Выделить статус на диаграмме')}>
        {entries.map((entry) => (
          <button
            type="button" key={entry.status}
            className={`status-legend-item ${activeStatus === entry.status ? 'is-highlighted' : ''}`}
            style={{ '--status-color': statusColors[entry.status] }}
            aria-pressed={activeStatus === entry.status}
            onPointerEnter={() => setActiveStatus(entry.status)}
            onFocus={() => setActiveStatus(entry.status)}
            onBlur={() => setActiveStatus(null)}
            onClick={() => setActiveStatus(entry.status)}
          >
            <span>
              <i style={{ background: statusColors[entry.status] }} />
              {entry.label}
            </span>
            <strong>{entry.count.toLocaleString(locale)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
function TrendChart({ data = [] }) {
  const { t, locale } = useLanguage();
  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          data={data}
          margin={{ top: 18, right: 8, left: -28, bottom: 0 }}
        >
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.19} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 5"
            vertical={false}
            stroke="#edf0f3"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => date(value, locale)}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8a95a5' }}
            minTickGap={22}
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={(value) => value.toLocaleString(locale)}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8a95a5' }}
          />
          <Tooltip
            labelFormatter={(value) => date(value, locale)}
            formatter={(value) => value.toLocaleString(locale)}
          />
          <Area
            isAnimationActive={false}
            name={t('Создано')}
            type="monotone"
            dataKey="created"
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="url(#trend-fill)"
          />
          <Area
            isAnimationActive={false}
            name={t('Решено')}
            type="monotone"
            dataKey="resolved"
            stroke="#8293c7"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardPage() {
  const { t, locale } = useLanguage();
  const today = useCurrentDate();
  const user = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/dashboard');
  return (
    <>
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">{t('ВАШ РАБОЧИЙ ДЕНЬ, ОДНИМ ВЗГЛЯДОМ')}</p>
          <h1>{t('Обзор рабочего пространства')}</h1>
          <p>{t('Здравствуйте, {name}. Всё важное — здесь.', { name: user.name.split(' ')[0] })}</p>
        </div>
        <span className="today-label">
          <CalendarDays size={16} />
          {formatLongDate(today, locale)}
        </span>
      </div>
      <section className="hero hero--spatial">
        <div className="hero-content">
          <span className="hero-kicker">
            <span /> {t('ПОДДЕРЖКА, КОТОРАЯ РЯДОМ')}
          </span>
          <h2>
            {t('Управляй заявками.')}
            <br />
            <span>{t('Решай задачи быстрее.')}</span>
          </h2>
          <p>
            {t('Все обращения сотрудников, статусы выполнения и работа команды — в одной системе.')}
          </p>
          <NewButton />
        </div>
        <SupportScene />
      </section>
      {loading ? (
        <Loading />
      ) : error ? (
        <ResourceError error={error} retry={reload} />
      ) : (
        <>
          <div className="section-line">
            <h2>{t('Пульс поддержки')}</h2>
            <span>
              <span className="live-dot" /> {t('Актуальные данные')}
            </span>
          </div>
          <Stats counts={data.counts} />
          <div className="dashboard-charts">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('Заявки по статусам')}</h2>
                  <p>{t('Как распределены обращения сейчас')}</p>
                </div>
              </div>
              <StatusChart statuses={data.statuses} total={data.counts.total} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('Динамика обращений')}</h2>
                  <p>{t('Созданные и решённые заявки')}</p>
                </div>
                <span className="period-label">{t('Последние 14 дней')}</span>
              </div>
              <TrendChart data={data.trend} />
              <div className="trend-key">
                <span>
                  <i /> {t('Создано')}
                </span>
                <span>
                  <i /> {t('Решено')}
                </span>
              </div>
            </section>
          </div>
          <section className="panel recent-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {t('Последние заявки')}{' '}
                  <span className="count-pill">
                    {data.recentTickets.length.toLocaleString(locale)}
                  </span>
                </h2>
                <p>{t('Недавно созданные обращения сотрудников')}</p>
              </div>
              <Link href="/tickets" className="text-link">
                {t('Все заявки')} <ArrowRight size={15} />
              </Link>
            </div>
            {data.recentTickets.length ? (
              <TicketTable tickets={data.recentTickets} compact />
            ) : (
              <Empty />
            )}
          </section>
        </>
      )}
    </>
  );
}

const supportQueues = [
  ['NEW', 'Новые'],
  ['IN_PROGRESS', 'В работе'],
  ['WAITING', 'Ожидание'],
  ['RESOLVED', 'Решённые'],
  ['CLOSED', 'Закрытые'],
  ['', 'Все обращения'],
];

export function SupportPage() {
  return <TicketsPage support />;
}

export function TicketsPage({ mine = false, support = false }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(support ? 'NEW' : '');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState(support ? 'oldest' : 'newest');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    q: query,
    status,
    priority,
    sort,
    page: String(page),
    ...(mine ? { mine: '1' } : {}),
  });
  const { data, loading, error, reload } = useResource(
    `/api/tickets?${params}`,
  );
  const filtered = !!(query || (!support && status) || priority);
  function reset() {
    setSearch('');
    setQuery('');
    if (!support) setStatus('');
    setPriority('');
    setSort(support ? 'oldest' : 'newest');
    setPage(1);
  }
  return (
    <>
      <PageTitle
        eyebrow={support ? 'СЛУЖБА ПОДДЕРЖКИ' : 'ЦЕНТР ОБРАЩЕНИЙ'}
        title={
          support
            ? user.role === 'EMPLOYEE'
              ? 'Мои обращения в поддержку'
              : 'Обращения пользователей'
            : mine ? 'Мои заявки' : 'Все заявки'
        }
        description={
          support
            ? user.role === 'ADMIN'
              ? 'Просматривайте обращения сотрудников. Откройте заявку, чтобы ответить, назначить исполнителя или изменить статус.'
              : user.role === 'AGENT'
                ? 'Просматривайте доступные вам обращения и отвечайте пользователям в карточке заявки.'
                : 'Проверяйте статус своих обращений и читайте ответы команды поддержки.'
            : mine
              ? 'Следите за обращениями, которые вы создали.'
              : 'Все доступные вам обращения — в одном месте.'
        }
      >
        {support ? (
          <button className="button secondary" onClick={reload} disabled={loading}>
            <RefreshCw size={17} /> {t('Обновить')}
          </button>
        ) : (
          <NewButton />
        )}
      </PageTitle>
      <section className="panel">
        {support && (
          <div className="support-queues" role="group" aria-label={t('Статус обращений')}>
            {supportQueues.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}
        <div className="filters">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label={t('Поиск заявок')}
              value={search}
              placeholder={t('Поиск по названию или номеру…')}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button aria-label={t('Очистить поиск')} onClick={() => setSearch('')}>
                <X size={15} />
              </button>
            )}
          </label>
          {!support && (
            <select
              aria-label={t('Статус заявки')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('Все статусы')}</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {t(label)}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label={t('Приоритет заявки')}
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('Все приоритеты')}</option>
            {Object.entries(priorityLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {t(label)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('Сортировка заявок')}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="newest">{t('Сначала новые')}</option>
            <option value="oldest">{t('Сначала старые')}</option>
            <option value="priority">{t('По приоритету')}</option>
            <option value="updated">{t('По обновлению')}</option>
          </select>
        </div>
        {(support || filtered) && (
          <div className="filter-summary">
            <span aria-live="polite">
              {loading
                ? t('Загрузка обращений…')
                : error
                  ? t('Данные недоступны')
                  : t(support ? 'Найдено обращений: {total}' : 'Найдено заявок: {total}', {
                    total: data.total.toLocaleString(locale),
                  })}
            </span>
            {filtered && (
              <button onClick={reset}>
                {t('Сбросить фильтры')} <X size={13} />
              </button>
            )}
          </div>
        )}
        {loading ? (
          <Loading />
        ) : error ? (
          <ResourceError error={error} retry={reload} />
        ) : data.tickets.length ? (
          <>
            <TicketTable tickets={data.tickets} support={support} />
            <div className="pagination">
              <span>
                {t('Показано {first}–{last} из {total}', {
                  first: ((page - 1) * data.pageSize + 1).toLocaleString(locale),
                  last: Math.min(page * data.pageSize, data.total).toLocaleString(locale),
                  total: data.total.toLocaleString(locale),
                })}
              </span>
              <div>
                <button
                  className="button secondary small"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft size={15} /> {t('Назад')}
                </button>
                <span>
                  {page.toLocaleString(locale)} / {Math.ceil(data.total / data.pageSize).toLocaleString(locale)}
                </span>
                <button
                  className="button secondary small"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t('Далее')} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title={
              filtered ? 'Ничего не найдено'
                : support ? 'В этой очереди пока нет обращений' : undefined
            }
            text={
              filtered
                ? 'Попробуйте изменить поисковый запрос или сбросить фильтры.'
                : support
                  ? user.role === 'EMPLOYEE'
                    ? 'Ваши обращения появятся здесь после отправки через «Создать заявку». Выберите другой статус, чтобы посмотреть историю.'
                    : 'Выберите другой статус или дождитесь новых обращений пользователей.'
                  : undefined
            }
            action={!filtered && !support}
          />
        )}
      </section>
      <p className="page-note">
        <ShieldCheck size={14} /> {t('Вы видите заявки в соответствии с правами вашей роли.')}
      </p>
    </>
  );
}

function TicketFields({ values, onChange, categories }) {
  const { t } = useLanguage();
  return (
    <>
      <label className="field">
        {t('Название проблемы')} <span>*</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={160}
          value={values.title}
          onChange={onChange}
          placeholder={t('Например, не подключается корпоративный Wi-Fi')}
        />
        <small>{t('Кратко опишите, с чем нужна помощь.')}</small>
      </label>
      <label className="field">
        {t('Подробное описание')} <span>*</span>
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={5000}
          rows={7}
          value={values.description}
          onChange={onChange}
          placeholder={t('Что произошло? Когда появилась проблема? Что вы уже пробовали?')}
        />
        <small>
          {t('Чем больше полезных деталей, тем быстрее мы сможем помочь.')}
        </small>
      </label>
      <div className="form-grid">
        <label className="field">
          {t('Категория')} <span>*</span>
          <select
            name="categoryId"
            required
            value={values.categoryId}
            onChange={onChange}
          >
            <option value="">{t('Выберите категорию')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category.name, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('Приоритет')} <span>*</span>
          <select
            name="priority"
            required
            value={values.priority}
            onChange={onChange}
          >
            {Object.entries(priorityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
export function NewTicketPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { data, loading, error, reload } = useResource('/api/categories');
  const [values, setValues] = useState({
    title: '',
    description: '',
    categoryId: '',
    priority: 'MEDIUM',
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      const result = await request('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      window.dispatchEvent(new CustomEvent('servicedesk:ticket-created'));
      router.push(`/tickets/${result.ticket.id}?created=1`);
      router.refresh();
    } catch (error) {
      setFailure(error.message);
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/tickets">
        <ArrowLeft size={16} /> {t('К списку заявок')}
      </Link>
      <PageTitle
        eyebrow="ДАВАЙТЕ РЕШИМ ЭТО ВМЕСТЕ"
        title="Новая заявка"
        description="Расскажите о проблеме — мы передадим её команде поддержки."
      />
      <div className="form-layout">
        <section className="panel form-panel">
          <div className="form-section-title">
            <span className="section-icon">
              <FileText size={21} />
            </span>
            <div>
              <h2>{t('Информация о проблеме')}</h2>
              <p>{t('Поля со звёздочкой обязательны для заполнения')}</p>
            </div>
          </div>
          {loading ? (
            <Loading />
          ) : error ? (
            <ResourceError error={error} retry={reload} />
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={busy}>
                <TicketFields
                  values={values}
                  categories={data.categories}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [event.target.name]: event.target.value,
                    })
                  }
                />
              </fieldset>
              <Message>{failure}</Message>
              {!data.categories.length && (
                <Message>
                  {'Категории пока не настроены. Обратитесь к администратору.'}
                </Message>
              )}
              <div className="form-actions">
                <Link className="button secondary" href="/tickets">
                  {t('Отмена')}
                </Link>
                <button
                  className="button primary"
                  disabled={busy || !data.categories.length}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                  {busy ? t('Отправляем…') : t('Отправить заявку')}
                </button>
              </div>
            </form>
          )}
        </section>
        <aside className="help-panel">
          <span className="help-circle">
            <Headset size={27} />
          </span>
          <h3>{t('Мы здесь, чтобы помочь')}</h3>
          <p>
            {t('После отправки обращение появится в списке заявок. Вы сможете следить за статусом и общаться с исполнителем.')}
          </p>
          <div className="help-step">
            <span>1</span>
            <div>
              <strong>{t('Опишите проблему')}</strong>
              <p>{t('Добавьте детали и выберите категорию')}</p>
            </div>
          </div>
          <div className="help-step">
            <span>2</span>
            <div>
              <strong>{t('Команда подключится')}</strong>
              <p>{t('Администратор назначит исполнителя')}</p>
            </div>
          </div>
          <div className="help-step">
            <span>3</span>
            <div>
              <strong>{t('Следите за решением')}</strong>
              <p>{t('Все обновления будут в карточке заявки')}</p>
            </div>
          </div>
          <div className="help-tip">
            <Sparkles size={18} />
            <p>
              {t('Срочный приоритет используйте, если проблема блокирует работу компании.')}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function ConfirmDelete({ onClose, onConfirm, busy, error }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-icon">
        <Trash2 size={24} />
      </div>
      <h2>{t('Удалить заявку?')}</h2>
      <p>
        {t('Заявка и все её комментарии будут удалены. Восстановить их не получится.')}
      </p>
      <Message>{error}</Message>
      <div className="form-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          {t('Отмена')}
        </button>
        <button className="button danger" disabled={busy} onClick={onConfirm}>
          {busy ? t('Удаляем…') : t('Удалить заявку')}
        </button>
      </div>
    </dialog>
  );
}
export function TicketDetailPage({ id, created = false }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  const router = useRouter();
  const { data, loading, error, reload } = useResource(`/api/tickets/${id}`);
  const categories = useResource('/api/categories');
  const team = useResource(user.role === 'ADMIN' ? '/api/team' : '/api/me');
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState(
    created
      ? 'Заявка создана. Команда поддержки скоро подключится к решению.'
      : '',
  );
  const [deleting, setDeleting] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ResourceError error={error} retry={reload} />;
  const ticket = data.ticket;
  const editable =
    user.role === 'ADMIN' ||
    (user.id === ticket.createdById &&
      ticket.status === 'NEW' &&
      !ticket.assignedToId);
  const canStatus =
    user.role === 'ADMIN' ||
    (user.role === 'AGENT' && ticket.assignedToId === user.id);
  async function update(payload, message = 'Изменения сохранены.') {
    setBusy(true);
    setFailure('');
    setSuccess('');
    try {
      await request(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditing(false);
      setSuccess(message);
      reload();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function addComment(event) {
    event.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: comment }),
      });
      setComment('');
      setSuccess('Комментарий добавлен.');
      reload();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${id}`, { method: 'DELETE' });
      router.push('/tickets');
      router.refresh();
    } catch (error) {
      setFailure(error.message);
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/tickets">
        <ArrowLeft size={16} /> {t('К списку заявок')}
      </Link>
      <div className="detail-heading">
        <div>
          <div className="detail-kicker">
            <span className="ticket-id">
              SD-{String(ticket.id).padStart(4, '0')}
            </span>
            <Status value={ticket.status} />
          </div>
          <h1>{ticket.title}</h1>
          <p>
            {t('Создана {date}', { date: date(ticket.createdAt, locale, true) })} <span>·</span>{' '}
            {ticket.createdBy?.name}
          </p>
        </div>
        <div className="heading-actions">
          {editable && (
            <button
              className="button secondary"
              onClick={() => {
                setValues({
                  title: ticket.title,
                  description: ticket.description,
                  categoryId: ticket.categoryId,
                  priority: ticket.priority,
                });
                setEditing(true);
              }}
            >
              <Pencil size={16} /> {t('Изменить')}
            </button>
          )}
          {editable && (
            <button
              className="button icon-button danger-ghost"
              aria-label={t('Удалить заявку')}
              onClick={() => {
                setFailure('');
                setDeleting(true);
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
      <Message>{failure && !deleting ? failure : ''}</Message>
      <Message success>{success}</Message>
      <div className="detail-layout">
        <div>
          <section className="panel detail-body">
            {editing ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  update(values);
                }}
              >
                <h2>{t('Редактирование заявки')}</h2>
                <fieldset disabled={busy}>
                  <TicketFields
                    values={values}
                    categories={categories.data?.categories || []}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        [event.target.name]: event.target.value,
                      })
                    }
                  />
                </fieldset>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    {t('Отмена')}
                  </button>
                  <button className="button primary" disabled={busy}>
                    {t('Сохранить изменения')}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2>
                  <FileText size={19} /> {t('Описание проблемы')}
                </h2>
                <p className="description-text">{ticket.description}</p>
              </>
            )}
          </section>
          <section className="panel comments-panel">
            <h2>
              <MessageSquare size={19} /> {t('Обсуждение')}{' '}
              <span className="count-pill">{(ticket.comments?.length || 0).toLocaleString(locale)}</span>
            </h2>
            <div className="comments-list">
              {ticket.comments?.length ? (
                ticket.comments.map((entry) => (
                  <article className="comment" key={entry.id}>
                    <span className="avatar comment-avatar">
                      {initials(entry.author?.name)}
                    </span>
                    <div>
                      <div className="comment-meta">
                        <strong>{entry.author?.name}</strong>
                        <span>{t(roleLabels[entry.author?.role] || '')}</span>
                        <time>{date(entry.createdAt, locale, true)}</time>
                      </div>
                      <p>{entry.content}</p>
                    </div>
                  </article>
                ))
              ) : (
                <p className="no-comments">
                  {t('Пока без комментариев. Добавьте детали или задайте вопрос команде.')}
                </p>
              )}
            </div>
            <form onSubmit={addComment} className="comment-form">
              <label className="sr-only" htmlFor="comment">
                {t('Ваш комментарий')}
              </label>
              <textarea
                id="comment"
                placeholder={t('Напишите комментарий…')}
                required
                minLength={1}
                maxLength={4000}
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={busy}
              />
              <div>
                <span>{t('Комментарии видны участникам заявки')}</span>
                <button
                  className="button primary small"
                  disabled={busy || !comment.trim()}
                >
                  <Send size={15} /> {t('Отправить')}
                </button>
              </div>
            </form>
          </section>
        </div>
        <aside className="panel ticket-properties">
          <h2>{t('Детали заявки')}</h2>
          <dl>
            <div>
              <dt>{t('Статус')}</dt>
              <dd>
                {canStatus ? (
                  <select
                    aria-label={t('Изменить статус')}
                    value={ticket.status}
                    disabled={busy}
                    onChange={(event) =>
                      update(
                        { status: event.target.value },
                        'Статус заявки обновлён.',
                      )
                    }
                  >
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Status value={ticket.status} />
                )}
              </dd>
            </div>
            <div>
              <dt>{t('Приоритет')}</dt>
              <dd>
                <Priority value={ticket.priority} />
              </dd>
            </div>
            <div>
              <dt>{t('Категория')}</dt>
              <dd>{categoryLabel(ticket.category?.name, t)}</dd>
            </div>
            <div>
              <dt>{t('Исполнитель')}</dt>
              <dd>
                {user.role === 'ADMIN' ? (
                  <select
                    aria-label={t('Назначить исполнителя')}
                    disabled={busy || team.loading || !!team.error}
                    value={ticket.assignedToId || ''}
                    onChange={(event) =>
                      update(
                        { assignedToId: event.target.value || null },
                        'Исполнитель обновлён.',
                      )
                    }
                  >
                    <option value="">{t('Не назначен')}</option>
                    {team.data?.users
                      ?.filter(
                        (entry) =>
                          entry.role === 'AGENT' || entry.role === 'ADMIN',
                      )
                      .map((entry) => (
                        <option value={entry.id} key={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <UserName user={ticket.assignedTo} />
                )}
                {team.error && user.role === 'ADMIN' && (
                  <small className="field-error">
                    {t('Не удалось загрузить исполнителей.')}{' '}
                    <button onClick={team.reload}>{t('Повторить')}</button>
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('Автор заявки')}</dt>
              <dd>
                <UserName user={ticket.createdBy} />
              </dd>
            </div>
            <div>
              <dt>{t('Дата создания')}</dt>
              <dd>{date(ticket.createdAt, locale, true)}</dd>
            </div>
            <div>
              <dt>{t('Последнее обновление')}</dt>
              <dd>{date(ticket.updatedAt, locale, true)}</dd>
            </div>
          </dl>
          <div className="property-note">
            <ShieldCheck size={17} />
            <p>
              {t('История общения и актуальный статус всегда доступны в этой карточке.')}
            </p>
          </div>
        </aside>
      </div>
      {deleting && (
        <ConfirmDelete
          onClose={() => setDeleting(false)}
          onConfirm={remove}
          busy={busy}
          error={failure}
        />
      )}
    </>
  );
}

export function TeamPage() {
  const { t, locale } = useLanguage();
  const current = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/team');
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('ALL');
  const [sort, setSort] = useState('agents');
  async function roleChange(user, role) {
    setBusy(user.id);
    setFailure('');
    setSuccess('');
    try {
      await request(`/api/team/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setSuccess(user.name);
      reload();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy('');
    }
  }
  const users = filterTeamUsers(data?.users, { search, role, sort, locale });
  return (
    <>
      <PageTitle
        eyebrow="ЛЮДИ, КОТОРЫЕ ПОМОГАЮТ"
        title="Команда и сотрудники"
        description="Управляйте ролями и распределяйте нагрузку команды поддержки."
      />
      <Message>{failure}</Message>
      {success && (
        <Message success values={{ name: success }}>
          {'Роль пользователя {name} обновлена.'}
        </Message>
      )}
      <section className="panel">
        <div className="panel-heading team-panel-heading">
          <h2>
            {t('Сотрудники')}{' '}
            <span className="count-pill">{(data?.users?.length || 0).toLocaleString(locale)}</span>
          </h2>
          <div className="team-controls">
            <label className="team-control">
              <span>{t('Поиск сотрудника')}</span>
              <span className="search-field">
                <Search size={17} />
                <input
                  aria-label={t('Поиск сотрудника')}
                  placeholder={t('Имя или email')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
            </label>
            <label className="team-control">
              <span>{t('Фильтр по роли')}</span>
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="ALL">{t('Все роли')}</option>
                <option value="AGENT">{t('Только исполнители')}</option>
                <option value="EMPLOYEE">{t('Только сотрудники')}</option>
                <option value="ADMIN">{t('Только администраторы')}</option>
              </select>
            </label>
            <label className="team-control">
              <span>{t('Сортировка сотрудников')}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="agents">{t('Исполнители сначала')}</option>
                <option value="name">{t('По имени')}</option>
                <option value="workload">{t('По открытым заявкам')}</option>
              </select>
            </label>
          </div>
        </div>
        {!loading && !error && (
          <p className="team-filter-summary" aria-live="polite">
            {t('Показано сотрудников: {shown} из {total}', {
              shown: users.length.toLocaleString(locale),
              total: (data?.users?.length || 0).toLocaleString(locale),
            })}
          </p>
        )}
        {loading ? (
          <Loading />
        ) : error ? (
          <ResourceError error={error} retry={reload} />
        ) : users.length ? (
          <div className="table-scroll">
            <table className="team-table">
              <thead>
                <tr>
                  <th>{t('Сотрудник')}</th>
                  <th>{t('Роль')}</th>
                  <th>{t('Назначено заявок')}</th>
                  <th>{t('В работе / открыто')}</th>
                  <th>{t('Дата регистрации')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="team-user">
                        <span className="avatar">{initials(user.name)}</span>
                        <div>
                          <strong>
                            {user.name}
                            {user.id === current.id && (
                              <small className="you-label">{t('это вы')}</small>
                            )}
                          </strong>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={t('Роль пользователя {name}', { name: user.name })}
                        value={user.role}
                        disabled={!!busy || user.id === current.id}
                        onChange={(event) =>
                          roleChange(user, event.target.value)
                        }
                      >
                        {Object.entries(roleLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {t(label)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{user.assignedCount.toLocaleString(locale)}</td>
                    <td>
                      <span className="count-pill">
                        {user.openAssignedCount.toLocaleString(locale)}
                      </span>
                    </td>
                    <td className="date-cell">{date(user.createdAt, locale, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Сотрудники не найдены"
            text="Измените роль или поисковый запрос."
            action={false}
          />
        )}
      </section>
      <p className="page-note">
        <ShieldCheck size={15} /> {t('Сотрудник работает со своими заявками. Исполнитель решает назначенные. Администратор управляет системой.')}
      </p>
    </>
  );
}

export function ReportsPage() {
  const { t, locale } = useLanguage();
  const { data, loading, error, reload } = useResource('/api/reports');
  return (
    <>
      <PageTitle
        eyebrow="ПРОЗРАЧНОСТЬ В КАЖДОЙ ЦИФРЕ"
        title="Отчёты и аналитика"
        description="Реальная картина работы поддержки по данным вашей команды."
      />
      <div className="report-info">
        <span>
          <CalendarDays size={17} /> {t('Общая статистика за всё время')}
        </span>
        <span>
          <span className="live-dot" /> {t('Данные из системы')}
        </span>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ResourceError error={error} retry={reload} />
      ) : (
        <>
          <Stats counts={data.counts} />
          <div className="dashboard-charts">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('Распределение по статусам')}</h2>
                  <p>{t('Текущее состояние всех обращений')}</p>
                </div>
              </div>
              <StatusChart statuses={data.statuses} total={data.counts.total} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('Приоритет обращений')}</h2>
                  <p>{t('На какие задачи направлено внимание')}</p>
                </div>
              </div>
              <div className="priority-chart">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={data.priorities}
                    margin={{ top: 15, right: 20, left: -25, bottom: 5 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="4 4"
                      stroke="#edf0f3"
                    />
                    <XAxis
                      dataKey="priority"
                      tickFormatter={(value) => t(priorityLabels[value] || value)}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickFormatter={(value) => value.toLocaleString(locale)}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => value.toLocaleString(locale)}
                      labelFormatter={(value) => t(priorityLabels[value] || value)}
                    />
                    <Bar isAnimationActive={false} dataKey="count" name={t('Заявок')} radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {data.priorities.map((entry) => (
                        <Cell
                          key={entry.priority}
                          fill={priorityColors[entry.priority]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{t('Динамика работы поддержки')}</h2>
                <p>{t('Созданные и решённые заявки за последние 14 дней')}</p>
              </div>
              <span className="period-label">{t('14 дней')}</span>
            </div>
            <TrendChart data={data.trend} />
            <div className="trend-key">
              <span>
                <i /> {t('Создано')}
              </span>
              <span>
                <i /> {t('Решено')}
              </span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
