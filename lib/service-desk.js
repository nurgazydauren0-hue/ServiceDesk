import { prisma } from './prisma.js';
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
import { parseTicketFilters } from './validation.js';
import { hashPassword, verifyPassword } from './passwords.js';

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
  const filters = parseTicketFilters(searchParams);
  const { q, status, priority, sort, mine, page, pageSize } = filters;
  const where = {
    AND: [
      ticketScope(user),
      ...(mine === '1' ? [{ createdById: user.id }] : []),
    ],
  };
  if (q)
    where.AND.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        ...(/^#?\d+$/.test(q) && Number(q.replace('#', '')) <= 2147483647
          ? [{ id: Number(q.replace('#', '')) }]
          : []),
      ],
    });
  if (status) where.status = status;
  if (priority) where.priority = priority;
  const orderBy =
    sort === 'oldest'
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : sort === 'priority'
        ? [{ priority: 'desc' }, { createdAt: 'desc' }]
        : sort === 'updated'
          ? [{ updatedAt: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];
  const [tickets, total] = await prisma.$transaction(
    async (db) => {
      const tickets = await db.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      const total = await db.ticket.count({ where });
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

export async function getDashboard(user) {
  const scope = ticketScope(user);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 13);
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
        const createdTrend = await db.ticket.findMany({
          where: { AND: [scope, { createdAt: { gte: since } }] },
          select: { createdAt: true },
        });
        const resolvedTrend = await db.ticket.findMany({
          where: { AND: [scope, { resolvedAt: { gte: since } }] },
          select: { resolvedAt: true },
        });
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
  const trend = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(since);
    day.setUTCDate(day.getUTCDate() + index);
    return { date: day.toISOString().slice(0, 10), created: 0, resolved: 0 };
  });
  const trendMap = new Map(trend.map((day) => [day.date, day]));
  for (const ticket of createdTrend) {
    const day = trendMap.get(ticket.createdAt.toISOString().slice(0, 10));
    if (day) day.created += 1;
  }
  for (const ticket of resolvedTrend) {
    const day = trendMap.get(ticket.resolvedAt.toISOString().slice(0, 10));
    if (day) day.resolved += 1;
  }
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
    recentTickets,
  };
}

export async function getReports(user) {
  if (user.role !== 'ADMIN')
    throw new ApiError('Отчёты доступны только администратору.', 403);
  const dashboard = await getDashboard(user);
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
