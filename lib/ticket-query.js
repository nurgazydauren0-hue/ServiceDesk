import { ticketScope } from './policies.js';
import { parseTicketFilters } from './validation.js';

function ticketOrder(sort) {
  if (sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (sort === 'priority' || sort === 'priority_desc')
    return [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
  if (sort === 'updated') return [{ updatedAt: 'desc' }, { id: 'desc' }];
  if (sort === 'newest') return [{ createdAt: 'desc' }, { id: 'desc' }];

  const [column, direction] = sort.split('_');
  const relations = { category: 'category', assignee: 'assignedTo', author: 'createdBy' };
  const field = relations[column]
    ? { [relations[column]]: { name: direction } }
    : { [column]: direction };
  return [field, { id: direction }];
}

export function buildTicketQuery(user, searchParams = new URLSearchParams()) {
  const { q, status, statusGroup, priority, categoryId, assigneeRole, favoriteIds, sort, mine, page, pageSize } =
    parseTicketFilters(searchParams);
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
  if (status) where.AND.push({ status });
  if (statusGroup === 'resolved')
    where.AND.push({ status: { in: ['RESOLVED', 'CLOSED'] } });
  if (priority) where.AND.push({ priority });
  if (categoryId) where.AND.push({ categoryId });
  if (assigneeRole) where.AND.push({ assignedTo: { is: { role: assigneeRole } } });
  if (favoriteIds !== undefined) where.AND.push({ id: { in: favoriteIds } });

  return {
    page,
    pageSize,
    findMany: {
      where,
      orderBy: ticketOrder(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    },
    // Use the same authorized predicate for rows and total, before pagination.
    count: { where },
  };
}
