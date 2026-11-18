import NotificationsPage from '../../../components/notifications-page';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Уведомления');
export default function Page() {
  return <NotificationsPage />;
}
