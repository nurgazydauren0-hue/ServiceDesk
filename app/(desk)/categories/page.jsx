import { requireUser } from '../../../lib/auth';
import { CategoriesPage } from '../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Категории');
export default async function Page() {
  await requireUser({ page: true, roles: ['ADMIN'] });
  return <CategoriesPage />;
}
