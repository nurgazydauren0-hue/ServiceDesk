'use client';

// Support center: a conversation view, not a ticket list.
// Administrator — the whole support line; IT specialist — own queue by next step;
// user — help center with their conversations. The data comes from /api/support.
import { useState } from 'react';
import Link from 'next/link';
import {
  AppWindow,
  ArrowRight,
  BellRing,
  CheckCheck,
  CircleCheck,
  CircleHelp,
  Flame,
  Gauge,
  Headset,
  Hourglass,
  KeyRound,
  LifeBuoy,
  MessagesSquare,
  Monitor,
  Play,
  RefreshCw,
  Reply,
  Timer,
  UserCheck,
  UserX,
  Wifi,
} from 'lucide-react';
import { initials, useCurrentUser } from './servicedesk-shell';
import { useLanguage } from './language-provider';
import { formatDate } from '../lib/date-format.js';
import {
  Loading,
  PageTitle,
  Priority,
  ResourceError,
  Status,
  categoryLabel,
  request,
  useResource,
} from './servicedesk-pages';
import './support-center.css';

const ticketCode = (id) => `SD-${String(id).padStart(4, '0')}`;

function waitLabel(hours, t) {
  if (hours < 1) return t('{value} мин', { value: Math.max(1, Math.round(hours * 60)) });
  if (hours < 48) return t('{value} ч', { value: Math.round(hours) });
  return t('{value} дн.', { value: Math.round(hours / 24) });
}

function Kpi({ icon: Icon, value, label, caption, tone, href }) {
  const { locale } = useLanguage();
  const body = (
    <>
      <span className="sc-kpi-icon"><Icon size={18} /></span>
      <span className="sc-kpi-text">
        <strong>{value.toLocaleString(locale)}</strong>
        <span>{label}</span>
        {caption && <small>{caption}</small>}
      </span>
    </>
  );
  const className = `sc-kpi tone-${tone}${value ? '' : ' is-zero'}`;
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

function Avatar({ person, staff = false }) {
  return (
    <span className={`sc-avatar${staff ? ' is-staff' : ''}`} aria-hidden="true">
      {person ? initials(person.name) : '?'}
    </span>
  );
}

/** Who spoke last and what they said. */
function LastMessage({ item }) {
  const { t, locale } = useLanguage();
  if (!item.lastMessage) {
    return <p className="sc-last is-empty">{t('Ответов пока нет — есть только описание обращения')}</p>;
  }
  const fromRequester = item.lastMessage.author?.id === item.createdBy?.id;
  return (
    <p className="sc-last">
      <span className={`sc-speaker${fromRequester ? '' : ' is-staff'}`}>
        {fromRequester ? t('Пользователь') : t('Поддержка')}
        {item.lastMessage.author ? ` · ${item.lastMessage.author.name}` : ''}
      </span>
      <span className="sc-last-text">{item.lastMessage.content}</span>
      <time>{formatDate(item.lastMessage.createdAt, locale)}</time>
    </p>
  );
}

function WaitChip({ item }) {
  const { t } = useLanguage();
  if (item.awaitingSupport) {
    return (
      <span
        className={`sc-wait${item.overdue ? ' is-overdue' : ''}`}
        title={t('Норма первого ответа: {value}', { value: waitLabel(item.targetHours, t) })}
      >
        <Timer size={13} />
        {item.overdue
          ? t('Просрочено · ждёт {value}', { value: waitLabel(item.waitingHours, t) })
          : t('Ждёт ответа {value}', { value: waitLabel(item.waitingHours, t) })}
      </span>
    );
  }
  if (item.awaitingRequester) {
    return (
      <span className="sc-wait is-requester">
        <Hourglass size={13} /> {t('Ждём пользователя {value}', { value: waitLabel(item.waitingHours, t) })}
      </span>
    );
  }
  return null;
}

function TicketHead({ item, showRequester = true }) {
  const { t } = useLanguage();
  return (
    <div className="sc-card-head">
      {showRequester && <Avatar person={item.createdBy} />}
      <div className="sc-card-title">
        <Link href={`/tickets/${item.id}`}>
          <span className="ticket-id">{ticketCode(item.id)}</span> {item.title}
        </Link>
        <small>
          {showRequester && item.createdBy ? `${item.createdBy.name} · ` : ''}
          {categoryLabel(item.category?.name, t)}
          {' · '}
          {t('сообщений: {count}', { count: item.messages })}
        </small>
      </div>
    </div>
  );
}

function ResponseTargets({ targets }) {
  const { t } = useLanguage();
  return (
    <section className="panel sc-targets" aria-labelledby="sc-targets-title">
      <h2 id="sc-targets-title"><Gauge size={17} /> {t('Нормы первого ответа')}</h2>
      <p>{t('Сколько обращение может ждать ответа поддержки, прежде чем считается просроченным')}</p>
      <ul>
        {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((key) => (
          <li key={key}>
            <Priority value={key} />
            <strong>{t('до {value}', { value: waitLabel(targets[key], t) })}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------- Administrator ---------------------------- */

function AssignSelect({ item, staff, onChanged }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function assign(assignedToId) {
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
      onChanged();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="sc-assign">
      <select
        aria-label={t('Назначить исполнителя для {id}', { id: ticketCode(item.id) })}
        value={item.assignedToId || ''}
        disabled={busy}
        onChange={(event) => assign(event.target.value)}
      >
        <option value="">{t(busy ? 'Сохраняем…' : 'Назначить…')}</option>
        {staff.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
            {member.open ? ` · ${member.open}` : ''}
          </option>
        ))}
      </select>
      {failure && <span className="sc-error" role="alert">{t(failure)}</span>}
    </span>
  );
}

function AdminConsole({ data, reload }) {
  const { t, locale } = useLanguage();
  const k = data.kpis;
  const maxOpen = Math.max(1, ...data.workload.map((member) => member.open));
  return (
    <>
      <div className="sc-kpis">
        <Kpi icon={MessagesSquare} tone="blue" value={k.awaitingReply} label={t('Ждут ответа поддержки')} caption={t('Последнее слово за пользователем')} />
        <Kpi icon={Flame} tone="red" value={k.overdue} label={t('Просрочен ответ')} caption={t('Дольше нормы по приоритету')} />
        <Kpi icon={UserX} tone="amber" value={k.unassigned} label={t('Без исполнителя')} caption={t('Ждут назначения')} href="/tickets?statusGroup=open&assignedToId=none" />
        <Kpi icon={Hourglass} tone="purple" value={k.waitingRequester} label={t('Ждём пользователя')} caption={t('Статус «Ожидание»')} href="/tickets?status=WAITING" />
        <Kpi icon={CheckCheck} tone="green" value={k.resolvedToday} label={t('Решено сегодня')} />
      </div>

      <div className="sc-layout">
        <section className="panel sc-inbox" aria-labelledby="sc-inbox-title">
          <div className="panel-heading">
            <div>
              <h2 id="sc-inbox-title"><Headset size={18} /> {t('Очередь ответов')}</h2>
              <p>{t('Обращения, где пользователь ждёт ответа. Просроченные и срочные — сверху.')}</p>
            </div>
          </div>
          {data.inbox.length ? (
            <ul className="sc-list">
              {data.inbox.map((item) => (
                <li key={item.id} className={`sc-card${item.overdue ? ' is-overdue' : ''}`}>
                  <TicketHead item={item} />
                  <LastMessage item={item} />
                  <div className="sc-card-foot">
                    <WaitChip item={item} />
                    <Priority value={item.priority} />
                    <AssignSelect item={item} staff={data.workload} onChanged={reload} />
                    <Link className="button secondary small" href={`/tickets/${item.id}#comment`}>
                      <Reply size={14} /> {t('Ответить')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sc-clear"><CircleCheck size={18} /> {t('Все пользователи получили ответ — очередь пуста.')}</p>
          )}
        </section>

        <div className="sc-side">
          <section className="panel sc-workload" aria-labelledby="sc-workload-title">
            <div className="panel-heading">
              <div>
                <h2 id="sc-workload-title"><UserCheck size={18} /> {t('Загрузка ИТ-специалистов')}</h2>
                <p>{t('Открытые обращения у каждого специалиста')}</p>
              </div>
            </div>
            {data.workload.length ? (
              <ul>
                {data.workload.map((member) => (
                  <li key={member.id}>
                    <Link href={`/tickets?statusGroup=open&assignedToId=${encodeURIComponent(member.id)}`}>
                      <Avatar person={member} staff />
                      <span className="sc-member">
                        <strong>{member.name}</strong>
                        <span className="sc-bar" aria-hidden="true">
                          <i style={{ width: `${(member.open / maxOpen) * 100}%` }} />
                        </span>
                        <small>
                          {t('открыто: {count}', { count: member.open.toLocaleString(locale) })}
                          {member.awaitingReply > 0 && ` · ${t('ждут ответа: {count}', { count: member.awaitingReply })}`}
                          {member.overdue > 0 && <em> · {t('просрочено: {count}', { count: member.overdue })}</em>}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sc-clear">{t('Добавьте исполнителей в разделе «Сотрудники».')}</p>
            )}
          </section>

          {data.unassigned.length > 0 && (
            <section className="panel sc-unassigned" aria-labelledby="sc-unassigned-title">
              <div className="panel-heading">
                <div>
                  <h2 id="sc-unassigned-title"><UserX size={18} /> {t('Нужно назначить')}</h2>
                  <p>{t('Обращения без ответственного специалиста')}</p>
                </div>
              </div>
              <ul>
                {data.unassigned.map((item) => (
                  <li key={item.id}>
                    <Link href={`/tickets/${item.id}`}>
                      <span className="ticket-id">{ticketCode(item.id)}</span> {item.title}
                    </Link>
                    <AssignSelect item={item} staff={data.workload} onChanged={reload} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel sc-feed" aria-labelledby="sc-feed-title">
            <div className="panel-heading">
              <div>
                <h2 id="sc-feed-title"><MessagesSquare size={18} /> {t('Лента переписки')}</h2>
                <p>{t('Последние сообщения пользователей и поддержки')}</p>
              </div>
            </div>
            {data.activity.length ? (
              <ul>
                {data.activity.map((entry) => (
                  <li key={entry.id}>
                    <Avatar person={entry.author} staff={!entry.fromRequester} />
                    <div>
                      <span className={`sc-speaker${entry.fromRequester ? '' : ' is-staff'}`}>
                        {entry.author?.name} · {entry.fromRequester ? t('Пользователь') : t('Поддержка')}
                      </span>
                      <p>{entry.content}</p>
                      <Link href={`/tickets/${entry.ticket.id}`}>
                        {ticketCode(entry.ticket.id)} · {entry.ticket.title}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sc-clear">{t('Сообщений пока нет.')}</p>
            )}
          </section>
        </div>
      </div>
      <ResponseTargets targets={data.targets} />
    </>
  );
}

/* ----------------------------- IT specialist ----------------------------- */

function StatusButton({ item, status, icon: Icon, label, onChanged, primary = false }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function change() {
    setBusy(true);
    setFailure('');
    try {
      await request(`/api/tickets/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      onChanged();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className={`button ${primary ? 'primary' : 'secondary'} small`} onClick={change} disabled={busy}>
        <Icon size={14} /> {t(busy ? 'Сохраняем…' : label)}
      </button>
      {failure && <span className="sc-error" role="alert">{t(failure)}</span>}
    </>
  );
}

function AgentCard({ item, reload }) {
  const { t } = useLanguage();
  return (
    <li className={`sc-card${item.overdue ? ' is-overdue' : ''}`}>
      <TicketHead item={item} />
      <LastMessage item={item} />
      <div className="sc-card-foot">
        <WaitChip item={item} />
        <Priority value={item.priority} />
        <Status value={item.status} />
      </div>
      <div className="sc-card-actions">
        {item.status === 'NEW' && (
          <StatusButton item={item} status="IN_PROGRESS" icon={Play} label="Взять в работу" onChanged={reload} primary />
        )}
        <Link className="button secondary small" href={`/tickets/${item.id}#comment`}>
          <Reply size={14} /> {t('Ответить')}
        </Link>
        <StatusButton item={item} status="RESOLVED" icon={CheckCheck} label="Решена" onChanged={reload} />
      </div>
    </li>
  );
}

function AgentColumn({ title, hint, icon: Icon, tone, items, empty, reload }) {
  const { t, locale } = useLanguage();
  return (
    <section className={`panel sc-column tone-${tone}`}>
      <header>
        <h2><Icon size={17} /> {t(title)} <span className="count-pill">{items.length.toLocaleString(locale)}</span></h2>
        <p>{t(hint)}</p>
      </header>
      {items.length ? (
        <ul className="sc-list">
          {items.map((item) => <AgentCard key={item.id} item={item} reload={reload} />)}
        </ul>
      ) : (
        <p className="sc-clear"><CircleCheck size={17} /> {t(empty)}</p>
      )}
    </section>
  );
}

function AgentDesk({ data, reload }) {
  const { t } = useLanguage();
  const k = data.kpis;
  return (
    <>
      <div className="sc-kpis">
        <Kpi icon={MessagesSquare} tone="blue" value={k.awaitingReply} label={t('Нужен ваш ответ')} caption={t('Пользователь написал последним')} />
        <Kpi icon={Flame} tone="red" value={k.overdue} label={t('Просрочен ответ')} caption={t('Дольше нормы по приоритету')} />
        <Kpi icon={Play} tone="purple" value={k.inProgress} label={t('В работе')} />
        <Kpi icon={Hourglass} tone="amber" value={k.waitingRequester} label={t('Ждём пользователя')} caption={t('Статус «Ожидание»')} />
        <Kpi icon={CheckCheck} tone="green" value={k.resolvedWeek} label={t('Решено за 7 дней')} />
      </div>
      <div className="sc-board">
        <AgentColumn
          title="Нужен ответ" hint="Ответьте пользователю или возьмите обращение в работу"
          icon={Reply} tone="blue" items={data.reply} reload={reload}
          empty="Все пользователи получили ответ."
        />
        <AgentColumn
          title="В работе" hint="Вы ответили — продолжайте решение"
          icon={Play} tone="purple" items={data.inWork} reload={reload}
          empty="Нет обращений в работе."
        />
        <AgentColumn
          title="Ждём пользователя" hint="Вы запросили информацию у пользователя"
          icon={Hourglass} tone="amber" items={data.waiting} reload={reload}
          empty="Никто не должен вам ответ."
        />
      </div>
      <ResponseTargets targets={data.targets} />
    </>
  );
}

/* --------------------------------- User --------------------------------- */

const categoryIcons = {
  'Оборудование': Monitor,
  'Программное обеспечение': AppWindow,
  'Сеть и интернет': Wifi,
  'Доступы и учётные записи': KeyRound,
};
const categoryHints = {
  'Оборудование': 'Компьютер, принтер, монитор',
  'Программное обеспечение': 'Установка, ошибки, обновления',
  'Сеть и интернет': 'Wi‑Fi, VPN, почта',
  'Доступы и учётные записи': 'Пароль, права, новый аккаунт',
  'Другое': 'Всё остальное',
};

function RequesterHelp({ data }) {
  const { t, locale } = useLanguage();
  const user = useCurrentUser();
  const k = data.kpis;
  return (
    <>
      <section className="sc-help-hero">
        <div>
          <span className="sc-help-kicker"><LifeBuoy size={15} /> {t('ЦЕНТР ПОМОЩИ')}</span>
          <h2>{t('{name}, чем мы можем помочь?', { name: user.name.split(' ')[0] })}</h2>
          <p>{t('Выберите тему — форма откроется с уже выбранной категорией, и обращение сразу попадёт к нужному специалисту.')}</p>
        </div>
        <div className="sc-topics">
          {data.categories.map((category) => {
            const Icon = categoryIcons[category.name] || CircleHelp;
            return (
              <Link key={category.id} href={`/tickets/new?categoryId=${encodeURIComponent(category.id)}`} className="sc-topic">
                <span className="sc-topic-icon"><Icon size={20} /></span>
                <strong>{categoryLabel(category.name, t)}</strong>
                {categoryHints[category.name] && <small>{t(categoryHints[category.name])}</small>}
              </Link>
            );
          })}
        </div>
      </section>

      {k.newReplies > 0 && (
        <div className="sc-banner" role="status">
          <BellRing size={18} />
          {t('Специалист ждёт вашего ответа в обращениях: {count}. Откройте их и ответьте, чтобы мы могли продолжить.', { count: k.newReplies })}
        </div>
      )}

      <div className="sc-layout">
        <section className="panel sc-inbox" aria-labelledby="sc-mine-title">
          <div className="panel-heading">
            <div>
              <h2 id="sc-mine-title">
                <MessagesSquare size={18} /> {t('Мои обращения')}{' '}
                <span className="count-pill">{k.active.toLocaleString(locale)}</span>
              </h2>
              <p>{t('Переписка с поддержкой по открытым обращениям')}</p>
            </div>
          </div>
          {data.active.length ? (
            <ul className="sc-list">
              {data.active.map((item) => {
                const newReply = item.awaitingRequester;
                return (
                  <li key={item.id} className={`sc-card${newReply ? ' is-reply' : ''}`}>
                    <TicketHead item={item} showRequester={false} />
                    <LastMessage item={item} />
                    <div className="sc-card-foot">
                      {newReply ? (
                        <span className="sc-wait is-reply"><BellRing size={13} /> {t('Специалист ждёт вашего ответа')}</span>
                      ) : item.supportWorking ? (
                        <span className="sc-wait is-working"><Play size={13} /> {t('Специалист работает над решением')}</span>
                      ) : item.awaitingSupport ? (
                        <span className="sc-wait">
                          <Timer size={13} /> {t('Ответим в течение {value}', { value: waitLabel(item.targetHours, t) })}
                        </span>
                      ) : null}
                      <Status value={item.status} />
                      <span className="sc-assignee">
                        {item.assignedTo
                          ? t('Специалист: {name}', { name: item.assignedTo.name })
                          : t('Специалист ещё не назначен')}
                      </span>
                      <Link className="button secondary small" href={`/tickets/${item.id}#comment`}>
                        <Reply size={14} /> {t(newReply ? 'Ответить' : 'Открыть')}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="sc-clear"><CircleCheck size={18} /> {t('Открытых обращений нет. Если что-то случится — выберите тему выше.')}</p>
          )}
        </section>

        <div className="sc-side">
          <section className="panel sc-steps" aria-labelledby="sc-steps-title">
            <h2 id="sc-steps-title"><CircleHelp size={17} /> {t('Как это работает')}</h2>
            <ol>
              <li><strong>{t('Вы описываете проблему')}</strong><span>{t('Чем подробнее, тем быстрее решение.')}</span></li>
              <li><strong>{t('Администратор назначает специалиста')}</strong><span>{t('Статус меняется на «В работе».')}</span></li>
              <li><strong>{t('Специалист отвечает в переписке')}</strong><span>{t('Если нужна информация — статус «Ожидание», ответьте ему.')}</span></li>
              <li><strong>{t('Проблема решена')}</strong><span>{t('Обращение получает статус «Решена».')}</span></li>
            </ol>
          </section>
          <section className="panel sc-feed" aria-labelledby="sc-resolved-title">
            <div className="panel-heading">
              <div>
                <h2 id="sc-resolved-title"><CheckCheck size={18} /> {t('Недавно решённые')}</h2>
                <p>{t('Всего решено: {count}', { count: k.resolved.toLocaleString(locale) })}</p>
              </div>
            </div>
            {data.resolved.length ? (
              <ul className="sc-resolved">
                {data.resolved.map((item) => (
                  <li key={item.id}>
                    <Link href={`/tickets/${item.id}`}>
                      <span className="ticket-id">{ticketCode(item.id)}</span> {item.title}
                    </Link>
                    <Status value={item.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sc-clear">{t('Решённых обращений пока нет.')}</p>
            )}
          </section>
        </div>
      </div>
      <ResponseTargets targets={data.targets} />
    </>
  );
}

const headings = {
  ADMIN: {
    eyebrow: 'ЛИНИЯ ПОДДЕРЖКИ',
    title: 'Центр поддержки',
    description: 'Кто ждёт ответа, что просрочено и кто из специалистов перегружен — в одном окне.',
  },
  AGENT: {
    eyebrow: 'РАБОЧЕЕ МЕСТО ИТ-СПЕЦИАЛИСТА',
    title: 'Моя очередь поддержки',
    description: 'Обращения, назначенные вам, разложены по следующему шагу: ответить, решить или дождаться пользователя.',
  },
  EMPLOYEE: {
    eyebrow: 'ПОМОЩЬ И ПОДДЕРЖКА',
    title: 'Центр помощи',
    description: 'Сообщите о проблеме и следите за перепиской со специалистом.',
  },
};

export function SupportCenterPage() {
  const { t } = useLanguage();
  const user = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/support');
  const heading = headings[user.role] || headings.EMPLOYEE;
  return (
    <div className="support-center">
      <PageTitle eyebrow={heading.eyebrow} title={heading.title} description={heading.description}>
        <button className="button secondary" onClick={reload} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'spin' : undefined} /> {t('Обновить')}
        </button>
      </PageTitle>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ResourceError error={error} retry={reload} />
      ) : data.role === 'ADMIN' ? (
        <AdminConsole data={data} reload={reload} />
      ) : data.role === 'AGENT' ? (
        <AgentDesk data={data} reload={reload} />
      ) : (
        <RequesterHelp data={data} />
      )}
    </div>
  );
}

