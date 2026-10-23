import { requireUser } from '../../../lib/auth';
import { TeamPage } from '../../../components/servicedesk-pages';
export const metadata = { title: 'Команда' };
export default async function Page() {
  await requireUser({ page: true, roles: ['ADMIN'] });
  return <TeamPage />;
}
