import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';
import { safeUserSelect } from './auth.js';
import { ApiError } from './api-errors.js';
import {
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

export async function getDashboard(user, { period = '14d', now = new Date() } = {}) {
  const scope = ticketScope(user);
  const window = createTrendWindow(period, now);
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
    timeZone: window.timeZone,
    recentTickets,
  };
}

export async function getReports(user, options = {}) {
  if (user.role !== 'ADMIN')
    throw new ApiError('Отчёты доступны только администратору.', 403);
  const dashboard = await getDashboard(user, options);
  const agents = (await listTeam(user)).filter((member) =>
    ['AGENT', 'ADMIN'].includes(member.role),
  );
  const resolved = await prisma.ticket.findMany({
    where: { resolvedAt: { not: null } },
    select: { createdAt: true, resolvedAt: true },
  });
  const resolutionHours = resolved.length
    ? resolved.reduce(
        (sum, ticket) =>
          sum + Math.max(0, ticket.resolvedAt - ticket.createdAt) / 3_600_000,
        0,
      ) / resolved.length
    : null;
  return { ...dashboard, agents, resolutionHours };
}
