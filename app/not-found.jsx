import Link from 'next/link';
export default function NotFound() {
  return (
    <main
      className="empty-state"
      style={{ minHeight: '80vh', justifyContent: 'center' }}
    >
      <span className="eyebrow">SERVICEDESK · 404</span>
      <h1>Страница не найдена</h1>
      <p style={{ marginTop: 15 }}>
        Возможно, ссылка устарела или у вас нет доступа к этому разделу.
      </p>
      <Link className="button primary" href="/">
        В рабочее пространство
      </Link>
    </main>
  );
}
