import { requireUser } from '../../../lib/auth';
import { ReportsPage } from '../../../components/servicedesk-pages';
export const metadata = { title: 'Отчёты' };
export default async function Page() {
  await requireUser({ page: true, roles: ['ADMIN'] });
  return <ReportsPage />;
}
