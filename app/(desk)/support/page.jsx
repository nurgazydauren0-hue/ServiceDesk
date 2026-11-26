import { SupportCenterPage } from '../../../components/support-center';

import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Центр поддержки');

export default function Page() {
  return <SupportCenterPage />;
}
