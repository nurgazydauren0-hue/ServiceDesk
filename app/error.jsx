'use client';
import Link from 'next/link';
export default function Error({ reset }) {
  return (
    <main
      className="empty-state"
      style={{ minHeight: '90vh', justifyContent: 'center' }}
    >
      <span className="eyebrow">SERVICEDESK</span>
      <h1>Рабочее пространство недоступно</h1>
      <p style={{ marginTop: 15 }}>
        Не удалось загрузить данные. Проверьте подключение сервера к базе данных
        и повторите попытку.
      </p>
      <div className="heading-actions">
        <button className="button primary" onClick={reset}>
          Попробовать снова
        </button>
        <Link href="/login" className="button secondary">
          К странице входа
        </Link>
      </div>
    </main>
  );
}
