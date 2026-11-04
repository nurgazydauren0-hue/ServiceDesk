'use client';
import Link from 'next/link';
import { useLanguage } from '../components/language-provider';

export default function Error({ reset }) {
  const { t } = useLanguage();

  return (
    <main
      className="empty-state"
      style={{ minHeight: '90vh', justifyContent: 'center' }}
    >
      <span className="eyebrow">SERVICEDESK</span>
      <h1>{t('Рабочее пространство недоступно')}</h1>
      <p style={{ marginTop: 15 }}>
        {t('Не удалось загрузить данные. Проверьте подключение сервера к базе данных и повторите попытку.')}
      </p>
      <div className="heading-actions">
        <button className="button primary" onClick={reset}>
          {t('Попробовать снова')}
        </button>
        <Link href="/login" className="button secondary">
          {t('К странице входа')}
        </Link>
      </div>
    </main>
  );
}
