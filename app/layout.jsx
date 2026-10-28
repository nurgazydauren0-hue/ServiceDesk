import './globals.css';
import '../components/theme.css';
import { ThemeProvider } from '../components/theme-provider';
import localFont from 'next/font/local';

const merriweather = localFont({
  src: './fonts/Merriweather-Regular.ttf',
  variable: '--font-merriweather',
  weight: '400',
  style: 'normal',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

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
    <html lang="ru" className={merriweather.variable} data-theme="light" suppressHydrationWarning>
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
