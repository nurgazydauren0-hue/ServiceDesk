import SettingsPage from '../../../components/settings-page';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Настройки');
export default function Page() {
  return <SettingsPage />;
}
