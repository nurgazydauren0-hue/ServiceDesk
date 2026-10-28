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
import './dashboard-interactions.css';

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
  CLOSED: '#a3aebc',
};
const priorityColors = {
  LOW: '#91a6bb',
  MEDIUM: '#5b8def',
  HIGH: '#e9a64b',
  URGENT: '#e46b73',
};
const date = (value, withTime = false) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: withTime ? 'numeric' : undefined,
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(value))
    : '—';
export async function request(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
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
      typeof data.error === 'string'
        ? data.error
        : 'Не удалось выполнить действие. Проверьте данные и повторите попытку.',
    );
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
export function Message({ children, success = false }) {
  return children ? (
    <div
      className={`notice ${success ? 'notice-success' : 'notice-error'}`}
      role={success ? 'status' : 'alert'}
    >
      {success ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
      <span>{children}</span>
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>Загружаем данные…</span>
    </div>
  );
}
function ResourceError({ error, retry }) {
  return (
    <div className="empty-state">
      <span className="empty-icon error-icon">
        <CircleAlert size={25} />
      </span>
      <h3>Не удалось загрузить данные</h3>
      <p>{error}</p>
      <button className="button secondary" onClick={retry}>
        <RefreshCw size={16} /> Повторить попытку
      </button>
    </div>
  );
}
function Empty({
  title = 'Заявок пока нет',
  text = 'Создайте первую заявку — команда поддержки поможет решить вашу задачу.',
  action = true,
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Link href="/tickets/new" className="button primary">
          <AnimatedNavIcon kind="create" size={17} /> Создать заявку
        </Link>
      )}
    </div>
  );
}
function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function NewButton() {
  return (
    <Link className="button primary" href="/tickets/new">
      <AnimatedNavIcon kind="create" size={18} /> Создать заявку
    </Link>
  );
}
function Status({ value }) {
  return (
    <span className={`badge status-${value?.toLowerCase()}`}>
      <i />
      {statusLabels[value] || value}
    </span>
  );
}
function Priority({ value }) {
  return (
    <span className={`priority priority-${value?.toLowerCase()}`}>
      <span className="priority-bars">
        <i />
        <i />
        <i />
      </span>
      {priorityLabels[value] || value}
    </span>
  );
}
function UserName({ user }) {
  return user ? (
    <span className="user-cell">
      <span className="mini-avatar">{initials(user.name)}</span>
      <span>{user.name}</span>
    </span>
  ) : (
    <span className="muted">Не назначен</span>
  );
}
function TicketTable({ tickets, compact = false, support = false }) {
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>Заявка</th>
            {!compact && <th>{support ? 'Автор обращения' : 'Категория'}</th>}
            <th>Приоритет</th>
            <th>Статус</th>
            <th>Исполнитель</th>
            <th>Создана</th>
            <th>
              <span className="sr-only">Открыть</span>
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
                    {ticket.category?.name}
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
                      {ticket.category?.name || '—'}
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
              <td className="date-cell">{date(ticket.createdAt)}</td>
              <td>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="table-arrow"
                  aria-label={`Открыть заявку ${ticket.id}`}
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
            <span>{label}</span>
            <span className={`stat-icon ${color}`}>
              <Icon size={21} />
            </span>
          </div>
          <strong>{value ?? 0}</strong>
          <p>
            <span className={`stat-dot ${color}`} />
            {caption}
          </p>
        </article>
      ))}
    </div>
  );
}
function StatusChart({ statuses = [], total = 0 }) {
  const [activeStatus, setActiveStatus] = useState(null);
  const entries = Object.entries(statusLabels).map(([status, label]) => ({
    status, label, count: statuses.find((entry) => entry.status === status)?.count || 0,
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
        <svg className="status-ring" viewBox="0 0 220 220" role="img" aria-label={`Заявки по статусам. ${entries.map((entry) => `${entry.label}: ${entry.count}`).join(', ')}`}>
          <circle className="status-ring-track" cx="110" cy="110" r="78" fill="none" strokeWidth="22" />
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
                stroke={statusColors[entry.status]} strokeWidth="22"
                strokeDasharray={`${sum === entry.count ? 100 : Math.max(.1, fraction * 100 - 1.5)} 100`}
                strokeDashoffset={-start}
                transform="rotate(-90 110 110)"
                onPointerEnter={() => setActiveStatus(entry.status)}
              />
            );
          })}
          {active && active.count === 0 && (
            <circle className="status-ring-empty-highlight" cx="110" cy="110" r={sum ? 94 : 78} fill="none" stroke={statusColors[active.status]} strokeWidth={sum ? 4 : 28} />
          )}
        </svg>
        <div className={`donut-center ${active ? 'is-highlighted' : ''}`}>
          <strong>{active ? active.count : total}</strong>
          <span>{active ? active.label : 'всего заявок'}</span>
          {active && <small>{sum ? `${Math.round(active.count / sum * 100)}% от всех` : 'Пока нет заявок'}</small>}
        </div>
      </div>
      <div className="chart-legend interactive-status-legend" aria-label="Выделить статус на диаграмме">
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
            <strong>{entry.count}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
function TrendChart({ data = [] }) {
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
            tickFormatter={(value) => date(value)}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8a95a5' }}
            minTickGap={22}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8a95a5' }}
          />
          <Tooltip
            labelFormatter={(value) => date(value)}
            formatter={(value, name) => [
              value,
              name === 'created' ? 'Создано' : 'Решено',
            ]}
          />
          <Area
            isAnimationActive={false}
            name="created"
            type="monotone"
            dataKey="created"
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="url(#trend-fill)"
          />
          <Area
            isAnimationActive={false}
            name="resolved"
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
  const user = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/dashboard');
  return (
    <>
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">ВАШ РАБОЧИЙ ДЕНЬ, ОДНИМ ВЗГЛЯДОМ</p>
          <h1>Обзор рабочего пространства</h1>
          <p>Здравствуйте, {user.name.split(' ')[0]}. Всё важное — здесь.</p>
        </div>
        <span className="today-label">
          <CalendarDays size={16} />
          {new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}
        </span>
      </div>
      <section className="hero hero--spatial">
        <div className="hero-content">
          <span className="hero-kicker">
            <span /> ПОДДЕРЖКА, КОТОРАЯ РЯДОМ
          </span>
          <h2>
            Управляй заявками.
            <br />
            <span>Решай задачи быстрее.</span>
          </h2>
          <p>
            Все обращения сотрудников, статусы выполнения и работа команды — в
            одной системе.
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
            <h2>Пульс поддержки</h2>
            <span>
              <span className="live-dot" /> Актуальные данные
            </span>
          </div>
          <Stats counts={data.counts} />
          <div className="dashboard-charts">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Заявки по статусам</h2>
                  <p>Как распределены обращения сейчас</p>
                </div>
              </div>
              <StatusChart statuses={data.statuses} total={data.counts.total} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Динамика обращений</h2>
                  <p>Созданные и решённые заявки</p>
                </div>
                <span className="period-label">Последние 14 дней</span>
              </div>
              <TrendChart data={data.trend} />
              <div className="trend-key">
                <span>
                  <i /> Создано
                </span>
                <span>
                  <i /> Решено
                </span>
              </div>
            </section>
          </div>
          <section className="panel recent-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Последние заявки{' '}
                  <span className="count-pill">
                    {data.recentTickets.length}
                  </span>
                </h2>
                <p>Недавно созданные обращения сотрудников</p>
              </div>
              <Link href="/tickets" className="text-link">
                Все заявки <ArrowRight size={15} />
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
            <RefreshCw size={17} /> Обновить
          </button>
        ) : (
          <NewButton />
        )}
      </PageTitle>
      <section className="panel">
        {support && (
          <div className="support-queues" role="group" aria-label="Статус обращений">
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
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="filters">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Поиск заявок"
              value={search}
              placeholder="Поиск по названию или номеру…"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button aria-label="Очистить поиск" onClick={() => setSearch('')}>
                <X size={15} />
              </button>
            )}
          </label>
          {!support && (
            <select
              aria-label="Статус заявки"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Все статусы</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Приоритет заявки"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Все приоритеты</option>
            {Object.entries(priorityLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Сортировка заявок"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="priority">По приоритету</option>
            <option value="updated">По обновлению</option>
          </select>
        </div>
        {(support || filtered) && (
          <div className="filter-summary">
            <span aria-live="polite">
              {loading
                ? 'Загрузка обращений…'
                : error
                  ? 'Данные недоступны'
                  : `Найдено ${support ? 'обращений' : 'заявок'}: ${data.total}`}
            </span>
            {filtered && (
              <button onClick={reset}>
                Сбросить фильтры <X size={13} />
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
                Показано {(page - 1) * data.pageSize + 1}–
                {Math.min(page * data.pageSize, data.total)} из {data.total}
              </span>
              <div>
                <button
                  className="button secondary small"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft size={15} /> Назад
                </button>
                <span>
                  {page} / {Math.ceil(data.total / data.pageSize)}
                </span>
                <button
                  className="button secondary small"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Далее <ArrowRight size={15} />
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
        <ShieldCheck size={14} /> Вы видите заявки в соответствии с правами
        вашей роли.
      </p>
    </>
  );
}

function TicketFields({ values, onChange, categories }) {
  return (
    <>
      <label className="field">
        Название проблемы <span>*</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={160}
          value={values.title}
          onChange={onChange}
          placeholder="Например, не подключается корпоративный Wi-Fi"
        />
        <small>Кратко опишите, с чем нужна помощь.</small>
      </label>
      <label className="field">
        Подробное описание <span>*</span>
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={5000}
          rows={7}
          value={values.description}
          onChange={onChange}
          placeholder="Что произошло? Когда появилась проблема? Что вы уже пробовали?"
        />
        <small>
          Чем больше полезных деталей, тем быстрее мы сможем помочь.
        </small>
      </label>
      <div className="form-grid">
        <label className="field">
          Категория <span>*</span>
          <select
            name="categoryId"
            required
            value={values.categoryId}
            onChange={onChange}
          >
            <option value="">Выберите категорию</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Приоритет <span>*</span>
          <select
            name="priority"
            required
            value={values.priority}
            onChange={onChange}
          >
            {Object.entries(priorityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
export function NewTicketPage() {
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
        <ArrowLeft size={16} /> К списку заявок
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
              <h2>Информация о проблеме</h2>
              <p>Поля со звёздочкой обязательны для заполнения</p>
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
                  Категории пока не настроены. Обратитесь к администратору.
                </Message>
              )}
              <div className="form-actions">
                <Link className="button secondary" href="/tickets">
                  Отмена
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
                  {busy ? 'Отправляем…' : 'Отправить заявку'}
                </button>
              </div>
            </form>
          )}
        </section>
        <aside className="help-panel">
          <span className="help-circle">
            <Headset size={27} />
          </span>
          <h3>Мы здесь, чтобы помочь</h3>
          <p>
            После отправки обращение появится в списке заявок. Вы сможете
            следить за статусом и общаться с исполнителем.
          </p>
          <div className="help-step">
            <span>1</span>
            <div>
              <strong>Опишите проблему</strong>
              <p>Добавьте детали и выберите категорию</p>
            </div>
          </div>
          <div className="help-step">
            <span>2</span>
            <div>
              <strong>Команда подключится</strong>
              <p>Администратор назначит исполнителя</p>
            </div>
          </div>
          <div className="help-step">
            <span>3</span>
            <div>
              <strong>Следите за решением</strong>
              <p>Все обновления будут в карточке заявки</p>
            </div>
          </div>
          <div className="help-tip">
            <Sparkles size={18} />
            <p>
              Срочный приоритет используйте, если проблема блокирует работу
              компании.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function ConfirmDelete({ onClose, onConfirm, busy, error }) {
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
      <h2>Удалить заявку?</h2>
      <p>
        Заявка и все её комментарии будут удалены. Восстановить их не получится.
      </p>
      <Message>{error}</Message>
      <div className="form-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Отмена
        </button>
        <button className="button danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Удаляем…' : 'Удалить заявку'}
        </button>
      </div>
    </dialog>
  );
}
export function TicketDetailPage({ id, created = false }) {
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
        <ArrowLeft size={16} /> К списку заявок
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
            Создана {date(ticket.createdAt, true)} <span>·</span>{' '}
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
              <Pencil size={16} /> Изменить
            </button>
          )}
          {editable && (
            <button
              className="button icon-button danger-ghost"
              aria-label="Удалить заявку"
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
                <h2>Редактирование заявки</h2>
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
                    Отмена
                  </button>
                  <button className="button primary" disabled={busy}>
                    Сохранить изменения
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2>
                  <FileText size={19} /> Описание проблемы
                </h2>
                <p className="description-text">{ticket.description}</p>
              </>
            )}
          </section>
          <section className="panel comments-panel">
            <h2>
              <MessageSquare size={19} /> Обсуждение{' '}
              <span className="count-pill">{ticket.comments?.length || 0}</span>
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
                        <span>{roleLabels[entry.author?.role]}</span>
                        <time>{date(entry.createdAt, true)}</time>
                      </div>
                      <p>{entry.content}</p>
                    </div>
                  </article>
                ))
              ) : (
                <p className="no-comments">
                  Пока без комментариев. Добавьте детали или задайте вопрос
                  команде.
                </p>
              )}
            </div>
            <form onSubmit={addComment} className="comment-form">
              <label className="sr-only" htmlFor="comment">
                Ваш комментарий
              </label>
              <textarea
                id="comment"
                placeholder="Напишите комментарий…"
                required
                minLength={1}
                maxLength={4000}
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={busy}
              />
              <div>
                <span>Комментарии видны участникам заявки</span>
                <button
                  className="button primary small"
                  disabled={busy || !comment.trim()}
                >
                  <Send size={15} /> Отправить
                </button>
              </div>
            </form>
          </section>
        </div>
        <aside className="panel ticket-properties">
          <h2>Детали заявки</h2>
          <dl>
            <div>
              <dt>Статус</dt>
              <dd>
                {canStatus ? (
                  <select
                    aria-label="Изменить статус"
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
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Status value={ticket.status} />
                )}
              </dd>
            </div>
            <div>
              <dt>Приоритет</dt>
              <dd>
                <Priority value={ticket.priority} />
              </dd>
            </div>
            <div>
              <dt>Категория</dt>
              <dd>{ticket.category?.name}</dd>
            </div>
            <div>
              <dt>Исполнитель</dt>
              <dd>
                {user.role === 'ADMIN' ? (
                  <select
                    aria-label="Назначить исполнителя"
                    disabled={busy || team.loading || !!team.error}
                    value={ticket.assignedToId || ''}
                    onChange={(event) =>
                      update(
                        { assignedToId: event.target.value || null },
                        'Исполнитель обновлён.',
                      )
                    }
                  >
                    <option value="">Не назначен</option>
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
                    Не удалось загрузить исполнителей.{' '}
                    <button onClick={team.reload}>Повторить</button>
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Автор заявки</dt>
              <dd>
                <UserName user={ticket.createdBy} />
              </dd>
            </div>
            <div>
              <dt>Дата создания</dt>
              <dd>{date(ticket.createdAt, true)}</dd>
            </div>
            <div>
              <dt>Последнее обновление</dt>
              <dd>{date(ticket.updatedAt, true)}</dd>
            </div>
          </dl>
          <div className="property-note">
            <ShieldCheck size={17} />
            <p>
              История общения и актуальный статус всегда доступны в этой
              карточке.
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
  const current = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/team');
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  async function roleChange(user, role) {
    setBusy(user.id);
    setFailure('');
    setSuccess('');
    try {
      await request(`/api/team/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setSuccess(`Роль пользователя ${user.name} обновлена.`);
      reload();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy('');
    }
  }
  const users =
    data?.users?.filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <PageTitle
        eyebrow="ЛЮДИ, КОТОРЫЕ ПОМОГАЮТ"
        title="Команда и сотрудники"
        description="Управляйте ролями и распределяйте нагрузку команды поддержки."
      />
      <Message>{failure}</Message>
      <Message success>{success}</Message>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            Сотрудники{' '}
            <span className="count-pill">{data?.users?.length || 0}</span>
          </h2>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Поиск сотрудника"
              placeholder="Имя или email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ResourceError error={error} retry={reload} />
        ) : users.length ? (
          <div className="table-scroll">
            <table className="team-table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Назначено заявок</th>
                  <th>В работе / открыто</th>
                  <th>Дата регистрации</th>
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
                              <small className="you-label">это вы</small>
                            )}
                          </strong>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Роль пользователя ${user.name}`}
                        value={user.role}
                        disabled={!!busy || user.id === current.id}
                        onChange={(event) =>
                          roleChange(user, event.target.value)
                        }
                      >
                        {Object.entries(roleLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{user.assignedCount}</td>
                    <td>
                      <span className="count-pill">
                        {user.openAssignedCount}
                      </span>
                    </td>
                    <td className="date-cell">{date(user.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Сотрудники не найдены"
            text="Попробуйте другое имя или email."
            action={false}
          />
        )}
      </section>
      <p className="page-note">
        <ShieldCheck size={15} /> Сотрудник работает со своими заявками.
        Исполнитель решает назначенные. Администратор управляет системой.
      </p>
    </>
  );
}

export function ReportsPage() {
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
          <CalendarDays size={17} /> Общая статистика за всё время
        </span>
        <span>
          <span className="live-dot" /> Данные из системы
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
                  <h2>Распределение по статусам</h2>
                  <p>Текущее состояние всех обращений</p>
                </div>
              </div>
              <StatusChart statuses={data.statuses} total={data.counts.total} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Приоритет обращений</h2>
                  <p>На какие задачи направлено внимание</p>
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
                      tickFormatter={(value) => priorityLabels[value]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => [value, 'Заявок']}
                      labelFormatter={(value) => priorityLabels[value]}
                    />
                    <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
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
                <h2>Динамика работы поддержки</h2>
                <p>Созданные и решённые заявки за последние 14 дней</p>
              </div>
              <span className="period-label">14 дней</span>
            </div>
            <TrendChart data={data.trend} />
            <div className="trend-key">
              <span>
                <i /> Создано
              </span>
              <span>
                <i /> Решено
              </span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
