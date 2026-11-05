const agentRoleOrder = { AGENT: 0, ADMIN: 1, EMPLOYEE: 2 };

export function filterTeamUsers(users = [], {
  search = '',
  role = 'ALL',
  sort = 'agents',
  locale = 'ru',
} = {}) {
  const query = search.trim().toLocaleLowerCase(locale);
  const compareNames = (first, second) =>
    first.name.localeCompare(second.name, locale, { sensitivity: 'base' }) ||
    first.email.localeCompare(second.email, locale, { sensitivity: 'base' });

  return users
    .filter((user) =>
      (role === 'ALL' || user.role === role) &&
      `${user.name} ${user.email}`.toLocaleLowerCase(locale).includes(query),
    )
    .sort((first, second) => {
      if (sort === 'agents') {
        const byRole = (agentRoleOrder[first.role] ?? 3) - (agentRoleOrder[second.role] ?? 3);
        if (byRole) return byRole;
      }
      if (sort === 'workload') {
        const byWorkload = (second.openAssignedCount ?? 0) - (first.openAssignedCount ?? 0);
        if (byWorkload) return byWorkload;
      }
      return compareNames(first, second);
    });
}
