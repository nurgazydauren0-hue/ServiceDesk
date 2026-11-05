import './globals.css';
import '../components/theme.css';
import '../components/language-switcher.css';
import { ThemeProvider } from '../components/theme-provider';
import { LanguageProvider } from '../components/language-provider';
import { createTranslator } from '../lib/i18n';
import { getRequestLocale } from '../lib/request-language';
import localFont from 'next/font/local';
import Script from 'next/script';

const merriweather = localFont({
  src: './fonts/Merriweather-Regular.ttf',
  variable: '--font-merriweather',
  weight: '400',
  style: 'normal',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

export async function generateMetadata() {
  const t = createTranslator(await getRequestLocale());
  return {
    title: {
      default: t('ServiceDesk — работа под контролем'),
      template: '%s · ServiceDesk',
    },
    description: t('Заявки сотрудников, работа команды и прозрачная IT-поддержка в одной системе.'),
  };
}

export default async function RootLayout({ children }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} className={merriweather.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <Script
          id="servicedesk-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("servicedesk-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()',
          }}
        />
      </head>
      <body>
        <LanguageProvider initialLocale={locale}>
          <ThemeProvider>{children}</ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
