import { prisma } from '../lib/prisma.js';
import { DEMO_TICKET_BATCH, demoTicketMarkerFromDescription, generateDemoTicketSpecs } from './demo-ticket-data.mjs';

const args = process.argv.slice(2);

try {
  if (args.some((argument) => !['--apply', '--dry-run'].includes(argument)) ||
      (args.includes('--apply') && args.includes('--dry-run')))
    throw new Error('Usage: node --env-file-if-exists=.env prisma/demo-tickets.mjs [--dry-run | --apply]');
  const apply = args.includes('--apply');
  const referenceDate = new Date();
  const specs = generateDemoTicketSpecs(referenceDate);
  const summary = await prisma.$transaction(async (db) => {
    // Serialize this additive seed batch without changing the application schema.
    if (apply) await db.$queryRaw`SELECT pg_advisory_xact_lock(1904143807, 1702177)::text AS locked`;
    const [users, categories, existing] = await Promise.all([
      db.user.findMany({ select: { id: true, role: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      db.category.findMany({ select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      db.ticket.findMany({
        where: { description: { contains: `[${DEMO_TICKET_BATCH}:` } },
        select: { description: true },
      }),
    ]);
    if (!users.length || !categories.length)
      throw new Error('At least one existing account and category are required. No data was changed.');
    const creators = users.filter((user) => user.role === 'EMPLOYEE');
    if (!creators.length) creators.push(...users);
    const agents = users.filter((user) => user.role === 'AGENT');
    if (!agents.length) agents.push(...users.filter((user) => user.role === 'ADMIN'));
    const knownMarkers = new Set(existing.map((ticket) => demoTicketMarkerFromDescription(ticket.description)));
    const pending = specs.filter((spec) => !knownMarkers.has(spec.marker));
    const records = pending.map((spec) => {
      const index = specs.indexOf(spec);
      const category = categories.find((entry) => entry.name === spec.categoryName) || categories[index % categories.length];
      const agent = agents.length ? agents[index % agents.length] : null;
      return {
        title: spec.title, description: spec.description, status: spec.status, priority: spec.priority,
        categoryId: category.id,
        createdById: creators[index % creators.length].id,
        // New tickets can already belong to an agent's queue before the first reply.
        assignedToId: spec.status === 'NEW' && index % 3 === 0 ? null : agent?.id || null,
        createdAt: spec.createdAt, updatedAt: spec.updatedAt, resolvedAt: spec.resolvedAt,
      };
    });
    let created = [];
    let commentCount = 0;
    if (apply && records.length) {
      created = await db.ticket.createManyAndReturn({ data: records, select: { id: true, description: true } });
      const ticketsByMarker = new Map(created.map((ticket) => [demoTicketMarkerFromDescription(ticket.description), ticket.id]));
      const comments = pending.flatMap((spec) => {
        const index = specs.indexOf(spec);
        const author = agents.length ? agents[index % agents.length] : creators[index % creators.length];
        return spec.comments.map((comment) => ({
          ticketId: ticketsByMarker.get(spec.marker), authorId: author.id,
          content: comment.content, createdAt: comment.createdAt,
        }));
      });
      if (comments.length) commentCount = (await db.comment.createMany({ data: comments })).count;
    }
    return {
      mode: apply ? 'apply' : 'dry-run',
      batch: DEMO_TICKET_BATCH,
      planned: specs.length, alreadyPresent: specs.length - pending.length, toCreate: pending.length,
      createdTickets: created.length, createdComments: commentCount,
      plannedComments: pending.reduce((sum, spec) => sum + spec.comments.length, 0),
      byStatus: Object.fromEntries(['NEW', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((status) => [status, pending.filter((spec) => spec.status === status).length])),
      existingCreators: creators.length, existingAssignees: agents.length, existingCategories: categories.length,
      firstCreatedAt: specs.at(-1).createdAt.toISOString(), lastCreatedAt: specs[0].createdAt.toISOString(),
      accountsAndOriginalTicketsUnchanged: true,
    };
  }, { maxWait: 15_000, timeout: 60_000 });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  // Do not print connection strings, query arguments or account data on failure.
  console.error('Demo tickets:', error.code || (error.message?.startsWith('Usage:') || error.message?.startsWith('At least one') ? error.message : 'The batch could not be completed; transaction rolled back.'));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
