import { TicketsPage } from '../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Все заявки');
export default function Page() {
  return <TicketsPage />;
}
