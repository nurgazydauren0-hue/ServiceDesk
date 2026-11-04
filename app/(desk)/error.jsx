'use client';
import Link from 'next/link';
import { useLanguage } from '../../components/language-provider';

export default function Error({ reset }) {
  const { t } = useLanguage();

  return (
    <div className="empty-state">
      <span className="empty-icon error-icon">!</span>
      <h1>{t('Не удалось открыть страницу')}</h1>
      <p>
        {t('Проверьте доступность сервера и подключения к базе данных. Ваши сохранённые заявки останутся в системе.')}
      </p>
      <div className="heading-actions">
        <button className="button primary" onClick={reset}>
          {t('Попробовать снова')}
        </button>
        <Link className="button secondary" href="/">
          {t('На главную')}
        </Link>
      </div>
    </div>
  );
}
