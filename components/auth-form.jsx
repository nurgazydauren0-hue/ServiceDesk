'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  ArrowRight,
  CircleCheck,
  Eye,
  EyeOff,
  Headset,
  LoaderCircle,
  LockKeyhole,
  UsersRound,
} from 'lucide-react';
import { Brand } from './servicedesk-shell';
import { Message } from './servicedesk-pages';
import { LanguageSwitcher, useLanguage } from './language-provider';
import './auth-form.css';

export default function AuthForm({ register = false }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    const fail = (message) => {
      setError(message);
      setBusy(false);
    };
    try {
      if (register) {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: String(form.get('name')).trim(),
            email,
            password,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          return fail(data.error || 'Не удалось создать аккаунт.');
        }
      }
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        if (result.code === 'service_unavailable')
          return fail('Сервис входа временно недоступен. Попробуйте позже.');
        if (result.code === 'rate_limited')
          return fail('Слишком много попыток входа. Повторите через 15 минут.');
        return fail(
          register
            ? 'Аккаунт создан. Войдите с указанными email и паролем.'
            : 'Неверный email или пароль. Проверьте данные и попробуйте снова.',
        );
      }
      router.replace('/');
      router.refresh();
    } catch {
      fail('Не удалось войти. Попробуйте ещё раз.');
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-main">
          <p className="eyebrow">{t('РАБОТА СТАНОВИТСЯ ПРОЩЕ')}</p>
          <h1>
            {t('Хорошая поддержка.')}
            <br />
            <span>{t('Сильная команда.')}</span>
          </h1>
          <p>
            {t('Единое пространство, где обращения находят решение, а команда работает в одном ритме.')}
          </p>
          <div className="auth-feature">
            <span>
              <Headset size={19} />
            </span>
            {t('Вся IT-поддержка в одном месте')}
          </div>
          <div className="auth-feature">
            <span>
              <CircleCheck size={19} />
            </span>
            {t('Прозрачные статусы и понятные процессы')}
          </div>
          <div className="auth-feature">
            <span>
              <UsersRound size={19} />
            </span>
            {t('Командная работа без лишних сложностей')}
          </div>
        </div>
        <div className="auth-story-footer">{t('ServiceDesk · Ваш рабочий ритм')}</div>
        <div className="auth-decoration" />
      </aside>
      <main className="auth-main">
        <div className="auth-language">
          <LanguageSwitcher />
        </div>
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow">{t('ДОБРО ПОЖАЛОВАТЬ В SERVICEDESK')}</p>
          <h2>{t(register ? 'Присоединяйтесь к команде' : 'С возвращением')}</h2>
          <p className="auth-description">
            {t(register
              ? 'Создайте аккаунт и получайте помощь, когда она нужна.'
              : 'Войдите в аккаунт, чтобы продолжить рабочий день.')}
          </p>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {register && (
                <label className="field" htmlFor="name">
                  {t('Имя и фамилия')}
                  <input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder={t('Александр Иванов')}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
              )}
              <label className="field" htmlFor="email">
                {t('Рабочая почта')}
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('you@company.ru')}
                  required
                  maxLength={254}
                />
              </label>
              <label className="field" htmlFor="password">
                {t('Пароль')}
                <div className="password-field">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      register ? 'new-password' : 'current-password'
                    }
                    placeholder={t(
                      register ? 'Придумайте надёжный пароль' : 'Введите пароль'
                    )}
                    required
                    minLength={register ? 12 : 1}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    aria-label={t(
                      showPassword ? 'Скрыть пароль' : 'Показать пароль'
                    )}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {register && (
                  <small className="password-hint">
                    {t('Не менее 12 символов: используйте буквы и цифры.')}
                  </small>
                )}
              </label>
            </fieldset>
            <Message>{error}</Message>
            <button className="button primary" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : null}
              {t(busy
                ? register
                  ? 'Создаём аккаунт…'
                  : 'Входим…'
                : register
                  ? 'Создать аккаунт'
                  : 'Войти в аккаунт')}
              {!busy && <ArrowRight size={16} />}
            </button>
            {register && (
              <p className="registration-note">
                {t('Новый аккаунт получает роль сотрудника. Администратор сможет изменить вашу роль в рабочем пространстве.')}
              </p>
            )}
          </form>
          <p className="auth-link">
            {t(register ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?')}
            <Link href={register ? '/login' : '/register'}>
              {t(register ? 'Войти' : 'Зарегистрироваться')}
            </Link>
          </p>
          <p className="auth-private">
            <LockKeyhole size={12} /> {t('Защищённое рабочее пространство вашей команды')}
          </p>
        </div>
      </main>
    </div>
  );
}
