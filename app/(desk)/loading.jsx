'use client';

import { useLanguage } from '../../components/language-provider';

export default function Loading() {
  const { t } = useLanguage();

  return (
    <div className="loading-state" role="status">
      <span>{t('Загружаем рабочее пространство…')}</span>
    </div>
  );
}
