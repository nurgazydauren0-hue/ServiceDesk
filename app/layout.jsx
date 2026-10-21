import './globals.css';

export const metadata = {
  title: 'MovieList — твоя личная фильмотека',
  description: 'Собирай фильмы, планируй просмотр и сохраняй впечатления в своей коллекции MovieList.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
