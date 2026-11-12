import { requireUser } from '../../lib/auth';
import ServiceDeskShell from '../../components/servicedesk-shell';
import { CurrentDateProvider } from '../../components/current-date';
import { calendarDate } from '../../lib/date-format.js';
import { WorkspacePreferencesProvider } from '../../components/workspace-preferences';

export default async function DeskLayout({ children }) {
  const user = await requireUser({ page: true });
  const initialDate = calendarDate(new Date().toISOString());
  return (
    <WorkspacePreferencesProvider userId={user.id}>
      <CurrentDateProvider initialDate={initialDate}>
        <ServiceDeskShell user={user}>{children}</ServiceDeskShell>
      </CurrentDateProvider>
    </WorkspacePreferencesProvider>
  );
}
