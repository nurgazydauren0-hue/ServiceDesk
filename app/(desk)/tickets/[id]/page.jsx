import { TicketDetailPage } from '../../../../components/servicedesk-pages';
import { localizedMetadata } from '../../../../lib/request-language';

export const generateMetadata = localizedMetadata('Детали заявки');
export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  return <TicketDetailPage id={id} created={query.created === '1'} />;
}
