import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';
import { safeUserSelect } from './auth.js';
import { ApiError } from './api-errors.js';
import {
  ACTIVE_SUPPORT_REQUEST_STATUSES,
  OPEN_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from './constants.js';
import {
  assertTicketAccess,
  canDeleteTicket,
  canEditTicket,
  canManageTicket,
  ticketScope,
} from './policies.js';
import { buildTicketQuery } from './ticket-query.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { buildTrend, createTrendWindow } from './trend-periods.js';
import { buildAdminConsole, buildAgentDesk, buildRequesterHelp } from './support-center.js';

export const ticketInclude = {
  category: true,
  createdBy: { select: safeUserSelect },
  assignedTo: { select: safeUserSelect },
  _count: { select: { comments: true } },
};
const detailInclude = {
  ...ticketInclude,
  comments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { author: { select: safeUserSelect } },
  },
};

async function transaction(operation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (error.code !== 'P2034' || attempt === 2) throw error;
    }
  }
}

async function freshUser(db, user) {
  const current = await db.user.findUnique({
    where: { id: user.id },
    select: safeUserSelect,
  });
  if (!current) throw new ApiError('Войдите в аккаунт, чтобы продолжить.', 401);
  return current;
}

async function validCategory(db, categoryId) {
  if (
    !(await db.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    }))
  )
    throw new ApiError('Выбранная категория не найдена.', 400);
}

async function validAssignee(db, assignedToId) {
  if (!assignedToId) return;
  const assignee = await db.user.findUnique({
    where: { id: assignedToId },
    select: { role: true },
  });
  if (!assignee || !['AGENT', 'ADMIN'].includes(assignee.role))
    throw new ApiError(
      'Назначить можно только исполнителя или администратора.',
      400,
    );
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

export async function listTicketFilterUsers(user) {
  return prisma.user.findMany({
    where: user.role === 'ADMIN'
      ? {}
      : { assignedTickets: { some: ticketScope(user) } },
    select: { id: true, name: true, role: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export async function listTickets(user, searchParams = new URLSearchParams()) {
  const { findMany, count, page, pageSize } = buildTicketQuery(user, searchParams);
  const [tickets, total] = await prisma.$transaction(
    async (db) => {
      const tickets = await db.ticket.findMany({
        ...findMany,
        include: ticketInclude,
      });
      const total = await db.ticket.count(count);
      return [tickets, total];
    },
    { isolationLevel: 'RepeatableRead' },
  );
  return { tickets, total, page, pageSize };
}

export async function getTicket(user, id) {
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...ticketScope(user) },
    include: detailInclude,
  });
  return assertTicketAccess(user, ticket);
}

export async function createTicket(user, data) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    await validCategory(db, data.categoryId);
    return db.ticket.create({
      data: { ...data, createdById: current.id },
      include: detailInclude,
    });
  });
}

export async function updateTicket(user, id, changes) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    const ticket = assertTicketAccess(
      current,
      await db.ticket.findUnique({ where: { id } }),
    );
    const keys = Object.keys(changes);
    if (current.role !== 'ADMIN') {
      const statusOnly =
        keys.length === 1 &&
        keys[0] === 'status' &&
        canManageTicket(current, ticket);
      const ownDetails =
        canEditTicket(current, ticket) &&
        keys.every((key) =>
          ['title', 'description', 'categoryId', 'priority'].includes(key),
        );
      if (!statusOnly && !ownDetails)
        throw new ApiError(
          'Изменение этой заявки недоступно. Исполнитель может изменять только статус назначенной заявки.',
          403,
        );
    }
    if (changes.categoryId) await validCategory(db, changes.categoryId);
    if (Object.hasOwn(changes, 'assignedToId'))
      await validAssignee(db, changes.assignedToId);
    const data = { ...changes };
    if (changes.status && changes.status !== ticket.status) {
      data.resolvedAt = ['RESOLVED', 'CLOSED'].includes(changes.status)
        ? ticket.resolvedAt || new Date()
        : null;
    }
    return db.ticket.update({ where: { id }, data, include: detailInclude });
  });
}

export async function deleteTicket(user, id) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    const ticket = assertTicketAccess(
      current,
      await db.ticket.findUnique({ where: { id } }),
    );
    if (!canDeleteTicket(current, ticket))
      throw new ApiError(
        'Удалить можно только свою новую заявку до назначения исполнителя.',
        403,
      );
    await db.ticket.delete({ where: { id } });
  });
}

export async function addComment(user, id, data) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    assertTicketAccess(current, await db.ticket.findUnique({ where: { id } }));
    const comment = await db.comment.create({
      data: { ...data, ticketId: id, authorId: current.id },
      include: { author: { select: safeUserSelect } },
    });
    await db.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
    return comment;
  });
}

export async function listTeam(user) {
  if (user.role !== 'ADMIN')
    throw new ApiError('У вас нет доступа к команде.', 403);
  const [users, assigned, open] = await prisma.$transaction(
    async (db) => {
      const users = await db.user.findMany({
        select: safeUserSelect,
        orderBy: [{ role: 'desc' }, { name: 'asc' }],
      });
      const assigned = await db.ticket.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null } },
        _count: { id: true },
      });
      const open = await db.ticket.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null }, status: { in: OPEN_STATUSES } },
        _count: { id: true },
      });
      return [users, assigned, open];
    },
    { isolationLevel: 'RepeatableRead' },
  );
  const assignedMap = new Map(
    assigned.map((row) => [row.assignedToId, row._count.id]),
  );
  const openMap = new Map(open.map((row) => [row.assignedToId, row._count.id]));
  return users.map((member) => ({
    ...member,
    assignedCount: assignedMap.get(member.id) || 0,
    openAssignedCount: openMap.get(member.id) || 0,
  }));
}

export async function updateTeamMember(user, id, changes) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    if (current.role !== 'ADMIN')
      throw new ApiError('Только администратор может менять роли.', 403);
    const target = await db.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
    if (!target) throw new ApiError('Сотрудник не найден.', 404);
    if (target.role === changes.role) return target;
    if (current.id === id)
      throw new ApiError(
        'Нельзя изменить собственную роль администратора.',
        409,
      );
    if (
      target.role === 'ADMIN' &&
      (await db.user.count({ where: { role: 'ADMIN' } })) <= 1
    )
      throw new ApiError(
        'В системе должен оставаться хотя бы один администратор.',
        409,
      );
    if (
      changes.role === 'EMPLOYEE' &&
      (await db.ticket.count({
        where: { assignedToId: id, status: { in: OPEN_STATUSES } },
      })) > 0
    )
      throw new ApiError(
        'Сначала переназначьте активные заявки этого исполнителя.',
        409,
      );
    return db.user.update({
      where: { id },
      data: changes,
      select: safeUserSelect,
    });
  });
}

export async function updateProfile(user, data) {
  return transaction(async (db) => {
    const current = await db.user.findUnique({ where: { id: user.id } });
    if (!current) throw new ApiError('Войдите в аккаунт.', 401);
    const sensitiveChange =
      (data.email !== undefined && data.email !== current.email) ||
      data.newPassword !== undefined;
    if (
      sensitiveChange &&
      !(await verifyPassword(data.currentPassword || '', current.passwordHash))
    )
      throw new ApiError(
        'Для изменения email или пароля укажите текущий пароль.',
        400,
      );
    const changes = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.newPassword
        ? { passwordHash: await hashPassword(data.newPassword) }
        : {}),
    };
    return db.user.update({
      where: { id: current.id },
      data: changes,
      select: safeUserSelect,
    });
  });
}

function trendScopeSql(scope) {
  if (Object.keys(scope).length === 0) return Prisma.sql`TRUE`;
  if (Object.keys(scope).length === 1 && typeof scope.createdById === 'string')
    return Prisma.sql`"createdById" = ${scope.createdById}`;
  if (Object.keys(scope).length === 1 && scope.OR?.length === 2 &&
      Object.keys(scope.OR[0]).length === 1 && typeof scope.OR[0].assignedToId === 'string' &&
      Object.keys(scope.OR[1]).length === 1 && typeof scope.OR[1].createdById === 'string')
    return Prisma.sql`("assignedToId" = ${scope.OR[0].assignedToId} OR "createdById" = ${scope.OR[1].createdById})`;
  // A changed access policy must never silently become an unrestricted query.
  throw new Error('Unsupported ticket access scope for trend aggregation.');
}

async function groupedTrend(db, field, scope, window) {
  const column = field === 'createdAt' ? Prisma.sql`"createdAt"` : Prisma.sql`"resolvedAt"`;
  const start = Prisma.sql`(${window.start}::timestamptz AT TIME ZONE 'UTC')`;
  const end = Prisma.sql`(${window.end}::timestamptz AT TIME ZONE 'UTC')`;
  const bucket = window.granularity === 'hour'
    ? Prisma.sql`date_bin(INTERVAL '1 hour', ${column}, ${start})`
    : Prisma.sql`date_trunc(${window.granularity}, ${column} + INTERVAL '5 hours') - INTERVAL '5 hours'`;
  return db.$queryRaw(Prisma.sql`
    SELECT ${bucket} AS "date", COUNT(*)::int AS "count"
    FROM "Ticket"
    WHERE ${trendScopeSql(scope)} AND ${column} >= ${start} AND ${column} < ${end}
    GROUP BY 1
    ORDER BY 1
  `);
}

// Without an explicit period the chart starts with the shortest window that has activity.
const AUTO_TREND_PERIODS = ['14d', 'month', 'year'];

// Work that needs a decision now: unassigned or urgent tickets for an administrator,
// the agent's own open queue for an agent. Employees do not get this block.
async function getAttention(user) {
  if (!['ADMIN', 'AGENT'].includes(user.role)) return null;
  const open = { status: { in: OPEN_STATUSES } };
  const own = user.role === 'ADMIN' ? {} : { assignedToId: user.id };
  const primaryWhere = user.role === 'ADMIN'
    ? { ...open, assignedToId: null }
    : { ...open, ...own };
  const order = [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }];
  const LIMIT = 5;
  const [primary, urgent, waiting, firstTickets, urgentAssigned] = await Promise.all([
    prisma.ticket.count({ where: primaryWhere }),
    prisma.ticket.count({ where: { ...open, ...own, priority: 'URGENT' } }),
    prisma.ticket.count({ where: { ...own, status: 'WAITING' } }),
    // Unassigned tickets come first for an administrator: they are the ones nobody owns yet.
    prisma.ticket.findMany({ where: primaryWhere, orderBy: order, take: LIMIT, include: ticketInclude }),
    user.role === 'ADMIN'
      ? prisma.ticket.findMany({
          where: { ...open, priority: 'URGENT', assignedToId: { not: null } },
          orderBy: order,
          take: LIMIT,
          include: ticketInclude,
        })
      : [],
  ]);
  const tickets = [...firstTickets, ...urgentAssigned].slice(0, LIMIT);
  return { primary, urgent, waiting, tickets };
}

const supportInclude = {
  ...ticketInclude,
  comments: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    include: { author: { select: safeUserSelect } },
  },
};
const SUPPORT_TICKET_LIMIT = 500;

const supportRequestInclude = {
  ticket: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      createdById: true,
      assignedTo: { select: safeUserSelect },
    },
  },
  author: { select: safeUserSelect },
  handledBy: { select: safeUserSelect },
};
const supportRequestOrder = [{ createdAt: 'desc' }, { id: 'desc' }];

/** Sends a ticket to the support center as a complaint, question or quality claim. */
export async function createSupportRequest(user, ticketId, data) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    assertTicketAccess(current, await db.ticket.findUnique({ where: { id: ticketId } }));
    // One active request per ticket and author: the next one waits for an answer.
    const active = await db.supportRequest.findFirst({
      where: { ticketId, authorId: current.id, status: { in: ACTIVE_SUPPORT_REQUEST_STATUSES } },
      select: { id: true },
    });
    if (active)
      throw new ApiError(
        'По этой заявке у вас уже есть открытое обращение в центр поддержки. Дождитесь ответа.',
        409,
      );
    return db.supportRequest.create({
      data: { ...data, ticketId, authorId: current.id },
      include: supportRequestInclude,
    });
  });
}

/** Requests of one ticket: an administrator sees all, everyone else only their own. */
export async function listTicketSupportRequests(user, ticketId) {
  const current = await freshUser(prisma, user);
  await getTicket(current, ticketId);
  return prisma.supportRequest.findMany({
    where: { ticketId, ...(current.role === 'ADMIN' ? {} : { authorId: current.id }) },
    include: supportRequestInclude,
    orderBy: supportRequestOrder,
  });
}

/** Administrator takes a request into review or resolves it with an answer. */
export async function updateSupportRequest(user, id, changes) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    if (current.role !== 'ADMIN')
      throw new ApiError('Обращения в центр поддержки обрабатывает администратор.', 403);
    const existing = await db.supportRequest.findUnique({ where: { id } });
    if (!existing) throw new ApiError('Обращение не найдено.', 404);
    const data = { status: changes.status, handledById: current.id };
    if (changes.response !== undefined) data.response = changes.response || null;
    data.resolvedAt = changes.status === 'RESOLVED' ? existing.resolvedAt || new Date() : null;
    return db.supportRequest.update({ where: { id }, data, include: supportRequestInclude });
  });
}

async function supportEscalations(current) {
  if (current.role === 'ADMIN') {
    const [active, resolved] = await Promise.all([
      prisma.supportRequest.findMany({
        where: { status: { in: ACTIVE_SUPPORT_REQUEST_STATUSES } },
        include: supportRequestInclude,
        // Oldest first: whoever complained earlier gets an answer earlier.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
      }),
      prisma.supportRequest.findMany({
        where: { status: 'RESOLVED' },
        include: supportRequestInclude,
        orderBy: [{ resolvedAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    ]);
    return { active, resolved };
  }
  const mine = await prisma.supportRequest.findMany({
    where: { authorId: current.id },
    include: supportRequestInclude,
    orderBy: supportRequestOrder,
    take: 10,
  });
  return { mine };
}

/** Support center data for the current role; see lib/support-center.js. */
export async function getSupportCenter(user, now = new Date()) {
  const current = await freshUser(prisma, user);
  const escalations = await supportEscalations(current);
  return { ...(await supportCenterData(current, now)), escalations };
}

async function supportCenterData(current, now) {
  const open = { status: { in: OPEN_STATUSES } };
  if (current.role === 'ADMIN') {
    // Calendar day in Kazakhstan time (UTC+5), the same zone the trend charts use.
    const DAY = 24 * 60 * 60 * 1000;
    const OFFSET = 5 * 60 * 60 * 1000;
    const startOfDay = new Date(Math.floor((now.getTime() + OFFSET) / DAY) * DAY - OFFSET);
    const [tickets, staff, resolvedToday, activity] = await prisma.$transaction(
      async (db) => [
        await db.ticket.findMany({
          where: open,
          include: supportInclude,
          orderBy: { id: 'asc' },
          take: SUPPORT_TICKET_LIMIT,
        }),
        await db.user.findMany({
          where: { role: { in: ['AGENT', 'ADMIN'] } },
          select: safeUserSelect,
          orderBy: { name: 'asc' },
        }),
        await db.ticket.count({ where: { resolvedAt: { gte: startOfDay, lte: now } } }),
        await db.comment.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
          include: {
            author: { select: safeUserSelect },
            ticket: { select: { id: true, title: true, createdById: true } },
          },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return buildAdminConsole({ tickets, staff, resolvedToday, activity }, now);
  }
  if (current.role === 'AGENT') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [tickets, resolvedWeek] = await Promise.all([
      prisma.ticket.findMany({
        where: { ...open, assignedToId: current.id },
        include: supportInclude,
        take: SUPPORT_TICKET_LIMIT,
      }),
      prisma.ticket.count({
        where: { assignedToId: current.id, resolvedAt: { gte: weekAgo, lte: now } },
      }),
    ]);
    return buildAgentDesk({ tickets, userId: current.id, resolvedWeek }, now);
  }
  const [tickets, categories] = await Promise.all([
    prisma.ticket.findMany({
      where: { createdById: current.id },
      include: supportInclude,
      orderBy: { id: 'desc' },
      take: SUPPORT_TICKET_LIMIT,
    }),
    listCategories(),
  ]);
  return buildRequesterHelp({ tickets, categories, userId: current.id }, now);
}

export async function getDashboard(user, options = {}) {
  const [dashboard, attention] = await Promise.all([
    getDashboardSnapshot(user, options),
    getAttention(user),
  ]);
  return attention ? { ...dashboard, attention } : dashboard;
}

async function getDashboardSnapshot(user, { period = '14d', autoPeriod = false, now = new Date(), startDate, endDate } = {}) {
  const scope = ticketScope(user);
  const candidates = autoPeriod ? AUTO_TREND_PERIODS : [period];
  let window = createTrendWindow(candidates[0], now, { startDate, endDate });
  const [byStatus, byPriority, recentTickets, createdTrend, resolvedTrend] =
    await prisma.$transaction(
      async (db) => {
        const byStatus = await db.ticket.groupBy({
          by: ['status'],
          where: scope,
          _count: { id: true },
        });
        const byPriority = await db.ticket.groupBy({
          by: ['priority'],
          where: scope,
          _count: { id: true },
        });
        const recentTickets = await db.ticket.findMany({
          where: scope,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 6,
          include: ticketInclude,
        });
        if (candidates.length > 1) {
          // One lookup of the latest activity picks the window instead of probing each period.
          const [{ latest } = {}] = await db.$queryRaw(Prisma.sql`
            SELECT GREATEST(MAX("createdAt"), MAX("resolvedAt")) AS "latest"
            FROM "Ticket" WHERE ${trendScopeSql(scope)}
          `);
          const latestTime = latest ? new Date(latest).getTime() : null;
          const fitting = latestTime === null ? null : candidates
            .map((candidate) => createTrendWindow(candidate, now))
            .find((candidate) => latestTime >= candidate.start.getTime());
          if (fitting) window = fitting;
        }
        const createdTrend = await groupedTrend(db, 'createdAt', scope, window);
        const resolvedTrend = await groupedTrend(db, 'resolvedAt', scope, window);
        return [byStatus, byPriority, recentTickets, createdTrend, resolvedTrend];
      },
      { isolationLevel: 'RepeatableRead' },
    );
  const statuses = TICKET_STATUSES.map((status) => ({
    status,
    count: byStatus.find((row) => row.status === status)?._count.id || 0,
  }));
  const priorities = TICKET_PRIORITIES.map((priority) => ({
    priority,
    count: byPriority.find((row) => row.priority === priority)?._count.id || 0,
  }));
  const count = Object.fromEntries(
    statuses.map((row) => [row.status, row.count]),
  );
  const trend = buildTrend(window, createdTrend, resolvedTrend);
  return {
    counts: {
      total: statuses.reduce((sum, row) => sum + row.count, 0),
      new: count.NEW,
      inProgress: count.IN_PROGRESS,
      waiting: count.WAITING,
      resolved: count.RESOLVED,
      closed: count.CLOSED,
      open: count.NEW + count.IN_PROGRESS + count.WAITING,
    },
    statuses,
    priorities,
    trend,
    trendPeriod: window.period,
    trendGranularity: window.granularity,
    trendStart: window.start.toISOString(),
    trendEnd: window.end.toISOString(),
    ...(window.period === 'custom' ? { trendStartDate: window.startDate, trendEndDate: window.endDate } : {}),
    timeZone: window.timeZone,
    recentTickets,
  };
}

const RESOLUTION_HOURS = Prisma.sql`GREATEST(0, EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) / 3600`;

export async function getReports(user, options = {}) {
  if (user.role !== 'ADMIN')
    throw new ApiError('Отчёты доступны только администратору.', 403);
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  // Independent read-only aggregates run in parallel to keep the page responsive.
  const [dashboard, team, overall, byAgent, byCategory, openByCategory, categories, unassigned, resolvedRecently] =
    await Promise.all([
      getDashboardSnapshot(user, options),
      listTeam(user),
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS "count", AVG(${RESOLUTION_HOURS})::float8 AS "hours"
        FROM "Ticket" WHERE "resolvedAt" IS NOT NULL`,
      prisma.$queryRaw`
        SELECT "assignedToId", COUNT(*)::int AS "count", AVG(${RESOLUTION_HOURS})::float8 AS "hours"
        FROM "Ticket" WHERE "resolvedAt" IS NOT NULL AND "assignedToId" IS NOT NULL
        GROUP BY "assignedToId"`,
      prisma.ticket.groupBy({ by: ['categoryId'], _count: { id: true } }),
      prisma.ticket.groupBy({
        by: ['categoryId'],
        where: { status: { in: OPEN_STATUSES } },
        _count: { id: true },
      }),
      listCategories(),
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES }, assignedToId: null } }),
      prisma.ticket.count({ where: { resolvedAt: { gte: since, lte: now } } }),
    ]);
  const resolvedByAgent = new Map(byAgent.map((row) => [row.assignedToId, row]));
  const agents = team
    .filter((member) => ['AGENT', 'ADMIN'].includes(member.role) || member.assignedCount > 0)
    .map((member) => ({
      ...member,
      resolvedCount: resolvedByAgent.get(member.id)?.count || 0,
      resolutionHours: resolvedByAgent.get(member.id)?.hours ?? null,
    }));
  const totalByCategory = new Map(byCategory.map((row) => [row.categoryId, row._count.id]));
  const openByCategoryMap = new Map(openByCategory.map((row) => [row.categoryId, row._count.id]));
  return {
    ...dashboard,
    agents,
    resolutionHours: overall[0]?.hours ?? null,
    resolvedTotal: overall[0]?.count || 0,
    unassignedOpen: unassigned,
    resolvedLast30Days: resolvedRecently,
    categories: categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        total: totalByCategory.get(category.id) || 0,
        open: openByCategoryMap.get(category.id) || 0,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  };
}

export async function listCategoriesWithUsage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { tickets: true } } },
  });
  return categories.map(({ _count, ...category }) => ({
    ...category,
    ticketCount: _count.tickets,
  }));
}

export async function createTeamMember(user, data) {
  return transaction(async (db) => {
    const current = await freshUser(db, user);
    if (current.role !== 'ADMIN')
      throw new ApiError('Только администратор может добавлять сотрудников.', 403);
    if (await db.user.findUnique({ where: { email: data.email }, select: { id: true } }))
      throw new ApiError('Пользователь с таким email уже существует.', 409);
    return db.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash: await hashPassword(data.password),
      },
      select: safeUserSelect,
    });
  });
}

export async function listTicketsForExport(user) {
  if (user.role !== 'ADMIN')
    throw new ApiError('Выгрузка доступна только администратору.', 403);
  return prisma.ticket.findMany({
    orderBy: { id: 'asc' },
    include: {
      category: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { comments: true } },
    },
  });
}
