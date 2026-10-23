'use client';
import Link from 'next/link';
export default function Error({ reset }) {
  return (
    <div className="empty-state">
      <span className="empty-icon error-icon">!</span>
      <h1>Не удалось открыть страницу</h1>
      <p>
        Проверьте доступность сервера и подключения к базе данных. Ваши
        сохранённые заявки останутся в системе.
      </p>
      <div className="heading-actions">
        <button className="button primary" onClick={reset}>
          Попробовать снова
        </button>
        <Link className="button secondary" href="/">
          На главную
        </Link>
      </div>
    </div>
  );
}
