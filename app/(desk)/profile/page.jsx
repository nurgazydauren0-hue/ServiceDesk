import ProfilePage from '../../../components/profile-page';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Мой профиль');
export default function Page() {
  return <ProfilePage />;
}
