import './globals.css';

export const metadata = {
  title: {
    default: 'ServiceDesk — работа под контролем',
    template: '%s · ServiceDesk',
  },
  description:
    'Заявки сотрудников, работа команды и прозрачная IT-поддержка в одной системе.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
