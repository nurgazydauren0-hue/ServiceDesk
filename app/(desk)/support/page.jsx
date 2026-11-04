import { SupportPage } from '../../../components/servicedesk-pages';

import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Поддержка — обращения пользователей');

export default function Page() {
  return <SupportPage />;
}
