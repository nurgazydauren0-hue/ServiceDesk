import { requireUser } from '../../../lib/auth';
import { TeamPage } from '../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Команда');
export default async function Page() {
  await requireUser({ page: true, roles: ['ADMIN'] });
  return <TeamPage />;
}
