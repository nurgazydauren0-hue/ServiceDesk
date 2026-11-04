import { requireUser } from '../../../lib/auth';
import { ReportsPage } from '../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Отчёты');
export default async function Page() {
  await requireUser({ page: true, roles: ['ADMIN'] });
  return <ReportsPage />;
}
