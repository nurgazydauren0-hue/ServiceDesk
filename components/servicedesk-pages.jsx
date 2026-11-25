'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  UserX,
  Flame,
  Hourglass,
  Download,
  Timer,
  Tags,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { initials, roleLabels, useCurrentUser } from './servicedesk-shell';
import AnimatedNavIcon from './animated-nav-icon';
import SupportScene from './support-scene';
import { useLanguage } from './language-provider';
import { useCurrentDate } from './current-date';
import { formatDate as date, formatLongDate, formatTrendDate } from '../lib/date-format.js';
import { getTrendRangeError, isTrendCalendarDate } from '../lib/trend-periods.js';
import TicketColumnHeader from './ticket-column-header';
import { FavoriteButton, FavoritesToggle, useTicketFavorites } from './ticket-favorites';
import DraftStatus from './draft-status';
import { usePersistentLocalState } from './use-persistent-local-state';
import { EMPTY_TICKET_DRAFT, hasTicketDraft, isCommentDraft, isTicketDraft } from '../lib/ticket-drafts.js';
import './dashboard-interactions.css';
import './stat-card-links.css';
import './trend-periods.css';
import './admin-workspace.css';

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
function TicketTable({ tickets, compact = false, support = false, controls }) {
  const { t, locale } = useLanguage();
  const filterUsers = (controls?.users || []).filter((member) =>
    !controls.assigneeRole || member.role === controls.assigneeRole,
  );
  // Offer only roles of assignees the viewer can actually see (an employee sees just their agents).
  const roleOptions = Object.entries(roleLabels).filter(([role]) =>
    role === controls?.assigneeRole || (controls?.users || []).some((member) => member.role === role),
  );
  function heading(label, sortAsc, sortDesc, children, filterActive = false) {
    if (!controls) return <th>{t(label)}</th>;
    return (
      <TicketColumnHeader
        label={label}
        sortAsc={sortAsc}
        sortDesc={sortDesc}
        sort={controls.sort}
        onSort={(sort) => controls.update({ sort })}
        filterActive={filterActive}
      >
        {children}
      </TicketColumnHeader>
    );
  }
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            {heading('Заявка', 'title_asc', 'title_desc')}
            {!compact && (support
              ? heading('Автор обращения', 'author_asc', 'author_desc')
              : heading('Категория', 'category_asc', 'category_desc', controls && (
                <label className="ticket-column-filter-field">
                  <span>{t('Категория')}</span>
                  <select
                    aria-label={t('Категория заявки')}
                    value={controls.categoryId}
                    onChange={(event) => controls.update({ categoryId: event.target.value })}
                  >
                    <option value="">{t('Все категории')}</option>
                    {controls.categories.map((category) => (
                      <option key={category.id} value={category.id}>{categoryLabel(category.name, t)}</option>
                    ))}
                  </select>
                </label>
              ), !!controls?.categoryId))}
            {heading('Приоритет', 'priority_asc', 'priority_desc', controls && (
              <label className="ticket-column-filter-field">
                <span>{t('Приоритет')}</span>
                <select
                  aria-label={t('Приоритет заявки')}
                  value={controls.priority}
                  onChange={(event) => controls.update({ priority: event.target.value })}
                >
                  <option value="">{t('Все приоритеты')}</option>
                  {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                </select>
              </label>
            ), !!controls?.priority)}
            {heading('Статус', 'status_asc', 'status_desc', controls && (
              <label className="ticket-column-filter-field">
                <span>{t('Статус')}</span>
                <select
                  aria-label={t('Статус заявки')}
                  value={controls.statusGroup ? `${controls.statusGroup}-group` : controls.status}
                  onChange={(event) => controls.update(event.target.value.endsWith('-group')
                    ? { status: '', statusGroup: event.target.value.replace('-group', '') }
                    : { status: event.target.value, statusGroup: '' })}
                >
                  <option value="">{t('Все статусы')}</option>
                  <option value="open-group">{t('Открытые (новые, в работе, ожидание)')}</option>
                  {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                  <option value="resolved-group">{t('Решённые и закрытые')}</option>
                </select>
              </label>
            ), !!(controls?.status || controls?.statusGroup))}
            {heading('Исполнитель', 'assignee_asc', 'assignee_desc', controls && (
              <>
              {/* With a single possible role the role filter adds nothing, so it is hidden. */}
              {(roleOptions.length > 1 || controls.assigneeRole) && (
              <label className="ticket-column-filter-field">
                <span>{t('Роль исполнителя')}</span>
                <select
                  aria-label={t('Роль исполнителя')}
                  value={controls.assigneeRole}
                  onChange={(event) => controls.update({ assigneeRole: event.target.value, assignedToId: '' })}
                >
                  <option value="">{t('Все роли')}</option>
                  {roleOptions.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                </select>
              </label>
              )}
              <label className="ticket-column-filter-field">
                <span>{t('Пользователь')}</span>
                <select
                  aria-label={t('Пользователь')}
                  value={controls.assignedToId}
                  disabled={controls.usersLoading || !!controls.usersError}
                  onChange={(event) => controls.update({ assignedToId: event.target.value })}
                >
                  <option value="">{t(controls.usersLoading ? 'Загружаем данные…' : 'Все пользователи')}</option>
                  <option value="none">{t('Без исполнителя')}</option>
                  {controls.assignedToId && controls.assignedToId !== 'none' && !filterUsers.some((member) => member.id === controls.assignedToId) && (
                    <option value={controls.assignedToId}>{t('Выбранный пользователь недоступен')}</option>
                  )}
                  {filterUsers.map((member) => (
                    <option key={member.id} value={member.id}>{member.name} · {t(roleLabels[member.role])}</option>
                  ))}
                </select>
              </label>
              {controls.usersError && (
                <div className="ticket-column-filter-error">
                  <span role="alert">{t('Не удалось загрузить пользователей')}</span>
                  <button type="button" className="text-link" onClick={controls.reloadUsers}>{t('Повторить попытку')}</button>
                </div>
              )}
              </>
            ), !!(controls?.assigneeRole || controls?.assignedToId))}
            {heading('Создана', 'oldest', 'newest')}
            <th>
              <span className="sr-only">{t('Открыть')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <div className="ticket-title-with-favorite">
                  <FavoriteButton ticketId={ticket.id} />
                  <Link className="ticket-title" href={`/tickets/${ticket.id}`}>
                    <span className="ticket-id">
                      SD-{String(ticket.id).padStart(4, '0')}
                    </span>
                    <span>{ticket.title}</span>
                  </Link>
                </div>
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
      href: '/tickets',
    },
    {
      label: 'Новые заявки',
      value: counts.new,
      Icon: Inbox,
      color: 'amber',
      caption: 'Ожидают первого ответа',
      href: '/tickets?status=NEW&notifications=new',
    },
    {
      label: 'В работе',
      value: counts.inProgress,
      Icon: Clock3,
      color: 'purple',
      caption: 'Команда уже решает',
      href: '/tickets?status=IN_PROGRESS',
    },
    {
      label: 'Решённые заявки',
      value: counts.resolved + counts.closed,
      Icon: CircleCheck,
      color: 'teal',
      caption: 'Помощь уже оказана',
      href: '/tickets?statusGroup=resolved',
    },
  ];
  return (
    <div className="stats-grid">
      {cards.map(({ label, value, Icon, color, caption, href }) => (
        <Link className="stat-card stat-card-link" key={label} href={href}>
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
        </Link>
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
function TrendChart({ data = [], granularity = 'day' }) {
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
            tickFormatter={(value) => formatTrendDate(value, locale, granularity)}
            interval="preserveStartEnd"
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
            labelFormatter={(value) => formatTrendDate(value, locale, granularity, true)}
            formatter={(value) => value.toLocaleString(locale)}
          />
          <Area
            isAnimationActive={false}
            name={t('Создано')}
            type="monotone"
            dataKey="created"
            dot={data.length === 1 ? { r: 4 } : false}
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="url(#trend-fill)"
          />
          <Area
            isAnimationActive={false}
            name={t('Решено')}
            type="monotone"
            dataKey="resolved"
            dot={data.length === 1 ? { r: 4 } : false}
            stroke="#8293c7"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const trendPeriods = [
  ['day', 'Последний 1 день'],
  ['14d', 'Последние 14 дней'],
  ['month', 'Последний 1 месяц'],
  ['year', 'Последний 1 год'],
  ['custom', 'Свой диапазон'],
];
// "auto" means the server picks the shortest period with activity until the user chooses one.
const isTrendPeriod = (value) => value === 'auto' || trendPeriods.some(([period]) => period === value);
const emptyTrendRange = Object.freeze({ startDate: '', endDate: '' });
const isStoredTrendRange = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 2
  && ['startDate', 'endDate'].every((key) => value[key] === '' || isTrendCalendarDate(value[key]));

function TicketTrendPanel({ initialData, endpoint, title }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  const today = useCurrentDate();
  const rangeId = useId();
  const { value: period, setValue: setPeriod, ready } = usePersistentLocalState({
    userId: user.id,
    name: `trend-period:${endpoint}`,
    defaultValue: 'auto',
    validate: isTrendPeriod,
  });
  // The page data already contains the trend for the automatic (or the same) period.
  const useInitial = period === 'auto' || (period !== 'custom' && period === initialData?.trendPeriod);
  const shownPeriod = period === 'auto' ? initialData?.trendPeriod || '14d' : period;
  const { value: savedRange, setValue: saveRange, ready: rangeReady } = usePersistentLocalState({
    userId: user.id,
    name: `trend-range:${endpoint}`,
    defaultValue: emptyTrendRange,
    validate: isStoredTrendRange,
  });
  const [range, setRange] = useState(emptyTrendRange);
  const [rangeError, setRangeError] = useState('');
  const [result, setResult] = useState({ key: '', data: null, error: '' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!rangeReady) return;
    setRange({
      startDate: savedRange.startDate || (today ? `${today.slice(0, 8)}01` : ''),
      endDate: savedRange.endDate || today || '',
    });
    setRangeError('');
  }, [savedRange.startDate, savedRange.endDate, rangeReady, today]);

  const hasSavedRange = Boolean(savedRange.startDate && savedRange.endDate);
  const savedRangeError = period === 'custom' && hasSavedRange ? getTrendRangeError(savedRange) : '';
  const query = new URLSearchParams({ period });
  if (period === 'custom') {
    query.set('startDate', savedRange.startDate);
    query.set('endDate', savedRange.endDate);
  }
  const trendUrl = useInitial || (period === 'custom' && (!hasSavedRange || savedRangeError))
    ? '' : `${endpoint}?${query}`;

  useEffect(() => {
    if (!ready || !rangeReady || !trendUrl) return;
    const controller = new AbortController();
    setResult({ key: trendUrl, data: null, error: '' });
    request(trendUrl, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key: trendUrl, data, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key: trendUrl, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [trendUrl, ready, rangeReady, revision, initialData]);

  function applyRange(event) {
    event.preventDefault();
    const error = getTrendRangeError(range);
    setRangeError(error);
    if (error) return;
    saveRange({ ...range });
    setRevision((value) => value + 1);
  }

  const current = useInitial ? initialData : result.key === trendUrl ? result.data : null;
  const error = savedRangeError || (result.key === trendUrl && !useInitial ? result.error : '');
  const waitingForRange = period === 'custom' && !hasSavedRange;
  const loading = !waitingForRange && !current && !error;
  const totals = (current?.trend || []).reduce((sum, point) => ({
    created: sum.created + point.created,
    resolved: sum.resolved + point.resolved,
  }), { created: 0, resolved: 0 });
  return (
    <section className="panel ticket-trend-panel" aria-busy={loading}>
      <div className="panel-heading trend-period-heading">
        <div>
          <h2>{t(title)}</h2>
          <p>{t('Созданные и решённые заявки')}</p>
        </div>
        <select
          className="period-label trend-period-select"
          aria-label={t('Период динамики обращений')}
          value={shownPeriod}
          disabled={!ready || !rangeReady}
          onChange={(event) => { setRangeError(''); setPeriod(event.target.value); }}
        >
          {trendPeriods.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </div>
      {period === 'custom' && (
        <form className="trend-range-form" onSubmit={applyRange} noValidate>
          <div className="trend-range-fields">
            <label htmlFor={`${rangeId}-start`}>
              <span>{t('Дата начала')}</span>
              <input
                id={`${rangeId}-start`} type="date" required value={range.startDate}
                max={today || undefined} disabled={!rangeReady}
                aria-invalid={Boolean(rangeError)}
                aria-describedby={`${rangeId}-hint${rangeError ? ` ${rangeId}-error` : ''}`}
                onChange={(event) => { setRange((old) => ({ ...old, startDate: event.target.value })); setRangeError(''); }}
              />
            </label>
            <label htmlFor={`${rangeId}-end`}>
              <span>{t('Дата окончания')}</span>
              <input
                id={`${rangeId}-end`} type="date" required value={range.endDate}
                min={range.startDate || undefined} max={today || undefined} disabled={!rangeReady}
                aria-invalid={Boolean(rangeError)}
                aria-describedby={`${rangeId}-hint${rangeError ? ` ${rangeId}-error` : ''}`}
                onChange={(event) => { setRange((old) => ({ ...old, endDate: event.target.value })); setRangeError(''); }}
              />
            </label>
            <button type="submit" className="button secondary small" disabled={!rangeReady || loading}>{t('Применить')}</button>
          </div>
          <p className="trend-range-hint" id={`${rangeId}-hint`}>{t('Обе даты входят в выбранный период.')}</p>
          {rangeError && <p className="trend-range-error" id={`${rangeId}-error`} role="alert">{t(rangeError)}</p>}
        </form>
      )}
      {period === 'custom' && current && (
        <p className="trend-range-caption">{t('Показан период: {start} — {end}', {
          start: formatLongDate(current.trendStartDate, locale),
          end: formatLongDate(current.trendEndDate, locale),
        })}</p>
      )}
      {waitingForRange ? (
        <div className="trend-chart-state trend-range-placeholder"><p>{t('Укажите даты и нажмите «Применить».')}</p></div>
      ) : loading ? (
        <div className="trend-chart-state"><Loading /></div>
      ) : error ? (
        <div className="trend-chart-state"><ResourceError error={error} retry={() => setRevision((value) => value + 1)} /></div>
      ) : (
        <>
          <TrendChart data={current.trend} granularity={current.trendGranularity || 'day'} />
          <div className="trend-key">
            <span><i /> {t('Создано')}</span>
            <span><i /> {t('Решено')}</span>
          </div>
          <div className="trend-period-summary">
            <span>{t('За период: создано {created}, решено {resolved}', {
              created: totals.created.toLocaleString(locale),
              resolved: totals.resolved.toLocaleString(locale),
            })}</span>
            <span>{t('Время: Кызылорда (UTC+5)')}</span>
          </div>
        </>
      )}
    </section>
  );
}

function AttentionPanel({ attention, onChanged }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  const admin = user.role === 'ADMIN';
  const team = useResource(admin ? '/api/team' : '/api/me');
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const own = admin ? '' : `&assignedToId=${encodeURIComponent(user.id)}`;
  const assignees = (team.data?.users || []).filter((member) => ['AGENT', 'ADMIN'].includes(member.role));
  const metrics = [
    {
      label: admin ? 'Без исполнителя' : 'Мои открытые заявки',
      caption: admin ? 'Ждут назначения' : 'Назначены вам',
      value: attention.primary,
      href: admin ? '/tickets?statusGroup=open&assignedToId=none' : `/tickets?statusGroup=open${own}`,
      Icon: admin ? UserX : Ticket,
      tone: 'amber',
    },
    {
      label: 'Срочные',
      caption: 'Открытые со срочным приоритетом',
      value: attention.urgent,
      href: `/tickets?statusGroup=open&priority=URGENT${own}`,
      Icon: Flame,
      tone: 'red',
    },
    {
      label: 'В ожидании',
      caption: 'Ждут ответа или действия',
      value: attention.waiting,
      href: `/tickets?status=WAITING${own}`,
      Icon: Hourglass,
      tone: 'purple',
    },
  ];
  async function assign(ticket, assignedToId) {
    setBusy(String(ticket.id));
    setFailure('');
    try {
      await request(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
      onChanged();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="panel attention-panel" aria-labelledby="attention-title">
      <div className="panel-heading">
        <div>
          <h2 id="attention-title">
            <CircleAlert size={18} /> {t('Требует внимания')}
          </h2>
          <p>{t(admin ? 'Неназначенные и срочные заявки — назначьте исполнителя прямо здесь' : 'Ваши открытые заявки, самые срочные сверху')}</p>
        </div>
        <NewButton />
      </div>
      <div className="attention-metrics">
        {metrics.map(({ label, caption, value, href, Icon, tone }) => (
          <Link key={label} href={href} className={`attention-metric tone-${tone}${value ? '' : ' is-clear'}`}>
            <span className="attention-metric-icon"><Icon size={18} /></span>
            <span className="attention-metric-text">
              <strong>{value.toLocaleString(locale)}</strong>
              <span>{t(label)}</span>
              <small>{t(caption)}</small>
            </span>
            <ArrowRight size={15} className="attention-metric-arrow" />
          </Link>
        ))}
      </div>
      <Message>{failure}</Message>
      {attention.tickets.length ? (
        <ul className="attention-list">
          {attention.tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/tickets/${ticket.id}`} className="attention-ticket">
                <span className="ticket-id">SD-{String(ticket.id).padStart(4, '0')}</span>
                <span className="attention-ticket-title">{ticket.title}</span>
                <span className="attention-ticket-meta">
                  {categoryLabel(ticket.category?.name, t)} · {t('создана {date}', { date: date(ticket.createdAt, locale) })}
                </span>
              </Link>
              <Priority value={ticket.priority} />
              <Status value={ticket.status} />
              {admin ? (
                <select
                  className="attention-assign"
                  aria-label={t('Назначить исполнителя для {id}', { id: `SD-${String(ticket.id).padStart(4, '0')}` })}
                  value={ticket.assignedToId || ''}
                  disabled={!!busy || team.loading || !!team.error}
                  onChange={(event) => assign(ticket, event.target.value)}
                >
                  <option value="">{t(busy === String(ticket.id) ? 'Сохраняем…' : 'Назначить…')}</option>
                  {assignees.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              ) : (
                <UserName user={ticket.assignedTo} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="attention-empty">
          <CircleCheck size={18} />
          {t(admin ? 'Неназначенных и срочных заявок нет — всё под контролем.' : 'Открытых заявок нет — отличная работа.')}
        </p>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { t, locale } = useLanguage();
  const today = useCurrentDate();
  const user = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/dashboard');
  const staff = user.role === 'ADMIN' || user.role === 'AGENT';
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
      {!staff && (
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
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ResourceError error={error} retry={reload} />
      ) : (
        <>
          {data.attention && <AttentionPanel attention={data.attention} onChanged={reload} />}
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
            <TicketTrendPanel initialData={data} endpoint="/api/dashboard" title="Динамика обращений" />
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
  const favorites = useTicketFavorites(user.id);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.toString();
  const query = searchParams.get('q') || '';
  const status = searchParams.get('status') ?? (support && !searchParams.get('statusGroup') ? 'NEW' : '');
  const priority = searchParams.get('priority') || '';
  const assigneeRole = searchParams.get('assigneeRole') || '';
  const assignedToId = searchParams.get('assignedToId') || '';
  const categoryId = searchParams.get('categoryId') || '';
  const statusGroup = searchParams.get('statusGroup') || '';
  const onlyFavorites = searchParams.get('favorites') === '1';
  const sort = searchParams.get('sort') || (support ? 'oldest' : 'newest');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const [search, setSearch] = useState(query);
  const previousFavoriteIds = useRef(null);

  function updateFilters(changes, resetPage = true) {
    // Merge with the latest URL even when another control changed this frame.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (support && key === 'status' && value === '') next.set(key, '');
      else if (value === '' || value == null || (key === 'page' && Number(value) === 1)) next.delete(key);
      else next.set(key, String(value));
    }
    if (resetPage) next.delete('page');
    next.delete('notifications');
    const value = next.toString();
    window.history.replaceState(null, '', `${pathname}${value ? `?${value}` : ''}`);
  }

  const favoriteSignature = `${user.id}:${favorites.ids.join(',')}`;
  useEffect(() => {
    if (!favorites.ready) return;
    const changed = previousFavoriteIds.current !== null && previousFavoriteIds.current !== favoriteSignature;
    previousFavoriteIds.current = favoriteSignature;
    if (changed && onlyFavorites && page > 1) updateFilters({ page: 1 }, false);
  }, [favoriteSignature, favorites.ready, onlyFavorites, page, pathname]);

  useEffect(() => { setSearch(query); }, [query]);
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      updateFilters({ q: search.trim() });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, query, urlQuery, pathname]);
  const params = new URLSearchParams({
    q: query,
    status,
    priority,
    assigneeRole,
    assignedToId,
    categoryId,
    statusGroup,
    sort,
    page: String(page),
    ...(mine || searchParams.get('mine') === '1' ? { mine: '1' } : {}),
    ...(onlyFavorites ? { favoriteIds: favorites.ids.join(',') } : {}),
  });
  const { data, loading, error, reload } = useResource(
    `/api/tickets?${params}`,
  );
  const { data: categoryData } = useResource('/api/categories');
  const filterUsers = useResource('/api/tickets/filter-options');
  const filtered = !!(query || (!support && status) || priority || assigneeRole || assignedToId || categoryId || statusGroup || onlyFavorites);
  function reset() {
    setSearch('');
    window.history.replaceState(null, '', pathname);
  }
  const controls = {
    sort, status, priority, assigneeRole, assignedToId, categoryId, statusGroup,
    categories: categoryData?.categories || [],
    users: filterUsers.data?.users || [],
    usersLoading: filterUsers.loading,
    usersError: filterUsers.error,
    reloadUsers: filterUsers.reload,
    update: updateFilters,
  };
  return (
    <>
      <PageTitle
        eyebrow={support ? 'СЛУЖБА ПОДДЕРЖКИ' : 'ЦЕНТР ОБРАЩЕНИЙ'}
        title={
          support
            ? user.role === 'EMPLOYEE'
              ? 'Мои обращения в поддержку'
              : 'Обращения пользователей'
            : 'Заявки'
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
                  updateFilters({ status: value, statusGroup: '' });
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
          <FavoritesToggle
            active={onlyFavorites}
            count={favorites.count}
            ready={favorites.ready}
            onToggle={(active) => updateFilters({ favorites: active ? '1' : '' })}
          />
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
        <TicketTable
          tickets={loading || error ? [] : data?.tickets || []}
          support={support}
          controls={controls}
        />
        {loading ? (
          <Loading />
        ) : error ? (
          <ResourceError error={error} retry={reload} />
        ) : data.tickets.length ? (
          <>
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
                  onClick={() => updateFilters({ page: page - 1 }, false)}
                >
                  <ArrowLeft size={15} /> {t('Назад')}
                </button>
                <span>
                  {page.toLocaleString(locale)} / {Math.ceil(data.total / data.pageSize).toLocaleString(locale)}
                </span>
                <button
                  className="button secondary small"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => updateFilters({ page: page + 1 }, false)}
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
  const user = useCurrentUser();
  const router = useRouter();
  const { data, loading, error, reload } = useResource('/api/categories');
  const {
    value: values, setValue: setValues, ready: draftReady,
    storageError: draftStorageError, updatedAt: draftUpdatedAt, clear: clearDraft,
    clearIfUnchanged: clearSubmittedDraft,
  } = usePersistentLocalState({
    userId: user.id,
    name: 'draft:new-ticket',
    defaultValue: EMPTY_TICKET_DRAFT,
    validate: isTicketDraft,
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (!draftReady || busy) return;
    const submittedValues = { ...values };
    setBusy(true);
    setFailure('');
    try {
      const result = await request('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(submittedValues),
      });
      clearSubmittedDraft(submittedValues);
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
              <fieldset disabled={busy || !draftReady}>
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
              <DraftStatus
                ready={draftReady}
                storageError={draftStorageError}
                updatedAt={draftUpdatedAt}
                hasContent={hasTicketDraft(values)}
                onClear={clearDraft}
                disabled={busy}
              />
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
                  disabled={busy || !draftReady || !data.categories.length}
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
  const {
    value: comment, setValue: setComment, ready: commentReady,
    storageError: commentStorageError, updatedAt: commentUpdatedAt, clear: clearCommentDraft,
    clearIfUnchanged: clearSubmittedComment,
  } = usePersistentLocalState({
    userId: user.id,
    name: `draft:comment:${id}`,
    defaultValue: '',
    validate: isCommentDraft,
  });
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
    if (!commentReady || busy || !comment.trim()) return;
    const submittedComment = comment;
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: submittedComment }),
      });
      clearSubmittedComment(submittedComment);
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
          <FavoriteButton ticketId={ticket.id} userId={user.id} className="ticket-favorite-detail" />
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
                disabled={busy || !commentReady}
              />
              <div>
                <span>{t('Комментарии видны участникам заявки')}</span>
                <button
                  className="button primary small"
                  disabled={busy || !commentReady || !comment.trim()}
                >
                  <Send size={15} /> {t('Отправить')}
                </button>
              </div>
              <DraftStatus
                key={`${user.id}:comment:${id}`}
                ready={commentReady}
                storageError={commentStorageError}
                updatedAt={commentUpdatedAt}
                hasContent={comment !== ''}
                onClear={clearCommentDraft}
                disabled={busy}
              />
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

// Readable temporary password without look-alike characters (0/O, 1/l/I).
function temporaryPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

const EMPTY_MEMBER = Object.freeze({ name: '', email: '', role: 'EMPLOYEE', password: '' });

function AddMemberDialog({ onClose, onCreated }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  const [values, setValues] = useState(() => ({ ...EMPTY_MEMBER, password: temporaryPassword() }));
  const [showPassword, setShowPassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  const change = (event) => setValues((old) => ({ ...old, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      const { user } = await request('/api/team', { method: 'POST', body: JSON.stringify(values) });
      onCreated(user);
    } catch (error) {
      setFailure(error.message);
      setBusy(false);
    }
  }
  return (
    <dialog
      className="confirm-dialog member-dialog"
      ref={ref}
      aria-labelledby="member-dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-icon dialog-icon-accent">
        <UserPlus size={24} />
      </div>
      <h2 id="member-dialog-title">{t('Новый сотрудник')}</h2>
      <p>{t('Аккаунт создаётся сразу. Передайте email и временный пароль сотруднику лично — он сможет сменить пароль в профиле.')}</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="field">
            <span>{t('Имя и фамилия')}</span>
            <input name="name" value={values.name} onChange={change} required minLength={2} maxLength={100} autoComplete="off" autoFocus />
          </label>
          <label className="field">
            <span>{t('Рабочая почта')}</span>
            <input name="email" type="email" value={values.email} onChange={change} required maxLength={254} autoComplete="off" placeholder={t('you@company.ru')} />
          </label>
          <label className="field">
            <span>{t('Роль')}</span>
            <select name="role" value={values.role} onChange={change}>
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>{t(label)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('Временный пароль')}</span>
            <span className="member-password">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={values.password}
                onChange={change}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                spellCheck={false}
              />
              <button type="button" className="button secondary small icon-only" aria-label={t(showPassword ? 'Скрыть пароль' : 'Показать пароль')} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button type="button" className="button secondary small" onClick={() => setValues((old) => ({ ...old, password: temporaryPassword() }))}>
                <KeyRound size={15} /> {t('Сгенерировать')}
              </button>
            </span>
            <small>{t('Не менее 12 символов.')}</small>
          </label>
        </fieldset>
        <Message>{failure}</Message>
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {t('Отмена')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? t('Создаём…') : t('Создать аккаунт')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function TeamPage() {
  const { t, locale } = useLanguage();
  const current = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/team');
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const [created, setCreated] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  async function roleChange(user, role) {
    setBusy(user.id);
    setFailure('');
    setSuccess('');
    setCreated('');
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
      >
        <button className="button primary" onClick={() => { setFailure(''); setAdding(true); }}>
          <UserPlus size={17} /> {t('Добавить сотрудника')}
        </button>
      </PageTitle>
      <Message>{failure}</Message>
      {success && (
        <Message success values={{ name: success }}>
          {'Роль пользователя {name} обновлена.'}
        </Message>
      )}
      {created && (
        <Message success values={{ name: created }}>
          {'Сотрудник {name} добавлен. Передайте ему email и временный пароль лично.'}
        </Message>
      )}
      {adding && (
        <AddMemberDialog
          onClose={() => setAdding(false)}
          onCreated={(user) => {
            setAdding(false);
            setSuccess('');
            setCreated(user.name);
            reload();
          }}
        />
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {t('Сотрудники')}{' '}
            <span className="count-pill">{(data?.users?.length || 0).toLocaleString(locale)}</span>
          </h2>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label={t('Поиск сотрудника')}
              placeholder={t('Имя или email')}
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
            text="Попробуйте другое имя или email."
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

function formatDuration(hours, t, locale) {
  if (hours == null) return '—';
  const number = (value) => value.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (hours < 1) return t('{value} мин', { value: Math.max(1, Math.round(hours * 60)).toLocaleString(locale) });
  if (hours < 48) return t('{value} ч', { value: number(hours) });
  return t('{value} дн.', { value: number(hours / 24) });
}

function ReportKpis({ data }) {
  const { t, locale } = useLanguage();
  const cards = [
    {
      label: 'Среднее время решения',
      value: formatDuration(data.resolutionHours, t, locale),
      caption: t('По {count} решённым заявкам', { count: data.resolvedTotal.toLocaleString(locale) }),
      Icon: Timer,
      color: 'blue',
      href: '/tickets?statusGroup=resolved',
    },
    {
      label: 'Открытые заявки',
      value: data.counts.open.toLocaleString(locale),
      caption: t('Новые, в работе и в ожидании'),
      Icon: Inbox,
      color: 'purple',
      href: '/tickets?statusGroup=open',
    },
    {
      label: 'Без исполнителя',
      value: data.unassignedOpen.toLocaleString(locale),
      caption: t(data.unassignedOpen ? 'Нужно назначить исполнителя' : 'Все открытые заявки назначены'),
      Icon: UserX,
      color: 'amber',
      href: '/tickets?statusGroup=open&assignedToId=none',
    },
    {
      label: 'Решено за 30 дней',
      value: data.resolvedLast30Days.toLocaleString(locale),
      caption: t('Решённые и закрытые за месяц'),
      Icon: CircleCheck,
      color: 'teal',
      href: '/tickets?statusGroup=resolved',
    },
  ];
  return (
    <div className="stats-grid">
      {cards.map(({ label, value, caption, Icon, color, href }) => (
        <Link className="stat-card stat-card-link" key={label} href={href}>
          <div className="stat-top">
            <span>{t(label)}</span>
            <span className={`stat-icon ${color}`}><Icon size={21} /></span>
          </div>
          <strong>{value}</strong>
          <p><span className={`stat-dot ${color}`} />{caption}</p>
        </Link>
      ))}
    </div>
  );
}

function CategoryBreakdown({ categories = [] }) {
  const { t, locale } = useLanguage();
  const max = Math.max(1, ...categories.map((category) => category.total));
  return categories.length ? (
    <ul className="category-breakdown">
      {categories.map((category) => (
        <li key={category.id}>
          <Link href={`/tickets?categoryId=${encodeURIComponent(category.id)}`}>
            <span className="category-breakdown-name">{categoryLabel(category.name, t)}</span>
            <span className="category-breakdown-numbers">
              <strong>{category.total.toLocaleString(locale)}</strong>
              <small>{t('открыто {count}', { count: category.open.toLocaleString(locale) })}</small>
            </span>
            <span className="category-breakdown-bar" aria-hidden="true">
              <i style={{ width: `${(category.total / max) * 100}%` }} />
              <b style={{ width: `${(category.open / max) * 100}%` }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <Empty title="Категорий пока нет" text="Добавьте категории, чтобы видеть распределение заявок." action={false} />
  );
}

function AgentPerformance({ agents = [] }) {
  const { t, locale } = useLanguage();
  return agents.length ? (
    <div className="table-scroll">
      <table className="team-table agent-table">
        <thead>
          <tr>
            <th>{t('Исполнитель')}</th>
            <th>{t('Открыто')}</th>
            <th>{t('Решено')}</th>
            <th>{t('Среднее время')}</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td>
                <Link className="team-user" href={`/tickets?assignedToId=${encodeURIComponent(agent.id)}`}>
                  <span className="avatar">{initials(agent.name)}</span>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{t(roleLabels[agent.role])}</span>
                  </div>
                </Link>
              </td>
              <td><span className="count-pill">{agent.openAssignedCount.toLocaleString(locale)}</span></td>
              <td>{agent.resolvedCount.toLocaleString(locale)}</td>
              <td>{formatDuration(agent.resolutionHours, t, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="Исполнителей пока нет" text="Назначьте роль исполнителя на странице сотрудников." action={false} />
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
      >
        <a className="button secondary" href="/api/reports/export" download>
          <Download size={17} /> {t('Выгрузить заявки (CSV)')}
        </a>
      </PageTitle>
      <div className="report-info">
        <span>
          <CalendarDays size={17} /> {t('Общая статистика за всё время')}
        </span>
        <span>
          <span className="live-dot" /> {t('Данные из системы')}
        </span>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ResourceError error={error} retry={reload} />
      ) : (
        <>
          <ReportKpis data={data} />
          <div className="dashboard-charts">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('Заявки по категориям')}</h2>
                  <p>{t('Всего и сколько ещё открыто')}</p>
                </div>
              </div>
              <CategoryBreakdown categories={data.categories} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('Работа исполнителей')}</h2>
                  <p>{t('Нагрузка, решённые заявки и среднее время решения')}</p>
                </div>
              </div>
              <AgentPerformance agents={data.agents} />
            </section>
          </div>
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
          <TicketTrendPanel initialData={data} endpoint="/api/reports" title="Динамика работы поддержки" />
        </>
      )}
    </>
  );
}

function CategoryRow({ category, busy, onRename, onDelete }) {
  const { t, locale } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const used = category.ticketCount > 0;
  async function save(event) {
    event.preventDefault();
    if (name.trim() === category.name) {
      setEditing(false);
      return;
    }
    if (await onRename(category, name.trim())) setEditing(false);
  }
  return (
    <tr>
      <td>
        {editing ? (
          <form className="category-rename" onSubmit={save}>
            <input
              aria-label={t('Новое название категории')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
              autoFocus
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setName(category.name);
                  setEditing(false);
                }
              }}
            />
            <button className="button primary small" disabled={busy}>
              <Save size={15} /> {t('Сохранить')}
            </button>
            <button type="button" className="button secondary small" disabled={busy} onClick={() => { setName(category.name); setEditing(false); }}>
              {t('Отмена')}
            </button>
          </form>
        ) : (
          <span className="category-name">
            <span className="category-name-icon"><Tags size={15} /></span>
            {categoryLabel(category.name, t)}
          </span>
        )}
      </td>
      <td>
        {used ? (
          <Link className="text-link" href={`/tickets?categoryId=${encodeURIComponent(category.id)}`}>
            {category.ticketCount.toLocaleString(locale)}
          </Link>
        ) : (
          <span className="muted">0</span>
        )}
      </td>
      <td>
        {!editing && (
          <div className="category-actions">
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => { setName(category.name); setEditing(true); }}
            >
              <Pencil size={14} /> {t('Переименовать')}
            </button>
            <button
              className="button icon-button danger-ghost small"
              disabled={busy || used}
              title={used ? t('Категория используется в заявках') : t('Удалить категорию')}
              aria-label={t('Удалить категорию {name}', { name: categoryLabel(category.name, t) })}
              onClick={() => onDelete(category)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function CategoriesPage() {
  const { t, locale } = useLanguage();
  const { data, loading, error, reload } = useResource('/api/categories?usage=1');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState({ text: '', values: undefined });
  async function run(operation, message, values) {
    setBusy(true);
    setFailure('');
    setSuccess({ text: '', values: undefined });
    try {
      await operation();
      setSuccess({ text: message, values });
      reload();
      return true;
    } catch (error) {
      setFailure(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(event) {
    event.preventDefault();
    const value = name.trim();
    if (await run(
      () => request('/api/categories', { method: 'POST', body: JSON.stringify({ name: value }) }),
      'Категория «{name}» добавлена.',
      { name: value },
    )) setName('');
  }
  const rename = (category, value) => run(
    () => request(`/api/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name: value }) }),
    'Категория переименована в «{name}».',
    { name: value },
  );
  const remove = (category) => {
    if (!window.confirm(t('Удалить категорию «{name}»?', { name: categoryLabel(category.name, t) }))) return;
    run(
      () => request(`/api/categories/${category.id}`, { method: 'DELETE' }),
      'Категория «{name}» удалена.',
      { name: categoryLabel(category.name, t) },
    );
  };
  const categories = data?.categories || [];
  return (
    <>
      <PageTitle
        eyebrow="СПРАВОЧНИКИ"
        title="Категории заявок"
        description="Категории помогают сотрудникам точнее описать проблему, а вам — видеть, где чаще всего нужна помощь."
      />
      <Message>{failure}</Message>
      <Message success values={success.values}>{success.text}</Message>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {t('Категории')}{' '}
            <span className="count-pill">{categories.length.toLocaleString(locale)}</span>
          </h2>
          <form className="category-add" onSubmit={add}>
            <input
              aria-label={t('Название новой категории')}
              placeholder={t('Например, Принтеры и печать')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
              disabled={busy}
            />
            <button className="button primary" disabled={busy || name.trim().length < 2}>
              <Plus size={16} /> {t('Добавить')}
            </button>
          </form>
        </div>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ResourceError error={error} retry={reload} />
        ) : categories.length ? (
          <div className="table-scroll">
            <table className="team-table category-table">
              <thead>
                <tr>
                  <th>{t('Категория')}</th>
                  <th>{t('Заявок')}</th>
                  <th><span className="sr-only">{t('Действия')}</span></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <CategoryRow key={category.id} category={category} busy={busy} onRename={rename} onDelete={remove} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Категорий пока нет" text="Добавьте первую категорию, чтобы сотрудники могли создавать заявки." action={false} />
        )}
      </section>
      <p className="page-note">
        <ShieldCheck size={15} /> {t('Категорию, в которой есть заявки, удалить нельзя — сначала переведите заявки в другую категорию.')}
      </p>
    </>
  );
}
