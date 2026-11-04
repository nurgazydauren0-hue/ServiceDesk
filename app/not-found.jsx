'use client';

import Link from 'next/link';
import { useLanguage } from '../components/language-provider';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <main
      className="empty-state"
      style={{ minHeight: '80vh', justifyContent: 'center' }}
    >
      <span className="eyebrow">SERVICEDESK · 404</span>
      <h1>{t('Страница не найдена')}</h1>
      <p style={{ marginTop: 15 }}>
        {t('Возможно, ссылка устарела или у вас нет доступа к этому разделу.')}
      </p>
      <Link className="button primary" href="/">
        {t('В рабочее пространство')}
      </Link>
    </main>
  );
}
