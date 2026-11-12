import { redirect } from 'next/navigation';
import { localizedMetadata } from '../../../lib/request-language';

export const generateMetadata = localizedMetadata('Заявки');
export default function Page() {
  redirect('/tickets');
}
