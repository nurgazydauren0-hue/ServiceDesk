import { NewTicketPage } from '../../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../../lib/request-language';

export const generateMetadata = localizedMetadata('Новая заявка');
export default function Page() {
  return <NewTicketPage />;
}
