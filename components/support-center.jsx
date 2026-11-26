'use client';

// Support center page. Everything on it is the SupportRequest table:
// complaints, questions and quality claims about tickets. Tickets themselves
// live in the "Заявки" section.
import { RefreshCw } from 'lucide-react';
import { useCurrentUser } from './servicedesk-shell';
import { useLanguage } from './language-provider';
import { Loading, PageTitle, ResourceError, useResource } from './servicedesk-pages';
import { AdminSupportCenter, MySupportCenter } from './support-requests';

const headings = {
  ADMIN: {
    eyebrow: 'ЛИНИЯ ПОДДЕРЖКИ',
    description: 'Жалобы, вопросы и претензии к качеству по заявкам. Рассмотрите обращение и ответьте пользователю.',
  },
  OTHER: {
    eyebrow: 'ПОМОЩЬ И ПОДДЕРЖКА',
    description: 'Недовольны решением заявки или есть вопрос? Отправьте обращение — ответит администратор.',
  },
};

export function SupportCenterPage() {
  const { t } = useLanguage();
  const user = useCurrentUser();
  const { data, loading, error, reload } = useResource('/api/support');
  const heading = user.role === 'ADMIN' ? headings.ADMIN : headings.OTHER;
  return (
    <div className="support-center">
      <PageTitle eyebrow={heading.eyebrow} title="Центр поддержки" description={heading.description}>
        <button className="button secondary" onClick={reload} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'spin' : undefined} /> {t('Обновить')}
        </button>
      </PageTitle>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ResourceError error={error} retry={reload} />
      ) : data.role === 'ADMIN' ? (
        <AdminSupportCenter data={data} reload={reload} />
      ) : (
        <MySupportCenter data={data} reload={reload} />
      )}
    </div>
  );
}
