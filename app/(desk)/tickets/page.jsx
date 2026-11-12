import { TicketsPage } from '../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Заявки');
export default function Page() {
  return <TicketsPage />;
}
