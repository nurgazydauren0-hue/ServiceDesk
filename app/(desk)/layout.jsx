import { requireUser } from '../../lib/auth';
import ServiceDeskShell from '../../components/servicedesk-shell';

export default async function DeskLayout({ children }) {
  const user = await requireUser({ page: true });
  return <ServiceDeskShell user={user}>{children}</ServiceDeskShell>;
}
