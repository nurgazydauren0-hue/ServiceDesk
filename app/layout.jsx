import './globals.css';
import '../components/theme.css';
import { ThemeProvider } from '../components/theme-provider';

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
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("servicedesk-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()',
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
