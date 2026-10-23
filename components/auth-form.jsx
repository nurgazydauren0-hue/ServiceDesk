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
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Brand } from './servicedesk-shell';
import { Message } from './servicedesk-pages';

export default function AuthForm({ register = false }) {
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
        if (!response.ok)
          throw new Error(data.error || 'Не удалось создать аккаунт.');
      }
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error)
        throw new Error(
          register
            ? 'Аккаунт создан. Войдите с указанными email и паролем.'
            : 'Неверный email или пароль. Проверьте данные и попробуйте снова.',
        );
      router.replace('/');
      router.refresh();
    } catch (error) {
      setError(error.message || 'Не удалось войти. Попробуйте ещё раз.');
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-main">
          <p className="eyebrow">РАБОТА СТАНОВИТСЯ ПРОЩЕ</p>
          <h1>
            Хорошая поддержка.
            <br />
            <span>Сильная команда.</span>
          </h1>
          <p>
            Единое пространство, где обращения находят решение, а команда
            работает в одном ритме.
          </p>
          <div className="auth-feature">
            <span>
              <Headset size={19} />
            </span>
            Вся IT-поддержка в одном месте
          </div>
          <div className="auth-feature">
            <span>
              <CircleCheck size={19} />
            </span>
            Прозрачные статусы и понятные процессы
          </div>
          <div className="auth-feature">
            <span>
              <UsersRound size={19} />
            </span>
            Командная работа без лишних сложностей
          </div>
        </div>
        <div className="auth-story-footer">ServiceDesk · Ваш рабочий ритм</div>
        <div className="auth-decoration" />
      </aside>
      <main className="auth-main">
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В SERVICEDESK</p>
          <h2>{register ? 'Присоединяйтесь к команде' : 'С возвращением'}</h2>
          <p className="auth-description">
            {register
              ? 'Создайте аккаунт и получайте помощь, когда она нужна.'
              : 'Войдите в аккаунт, чтобы продолжить рабочий день.'}
          </p>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {register && (
                <label className="field" htmlFor="name">
                  Имя и фамилия
                  <input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="Александр Иванов"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
              )}
              <label className="field" htmlFor="email">
                Рабочая почта
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.ru"
                  required
                  maxLength={254}
                />
              </label>
              <label className="field" htmlFor="password">
                Пароль
                <div className="password-field">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      register ? 'new-password' : 'current-password'
                    }
                    placeholder={
                      register ? 'Придумайте надёжный пароль' : 'Введите пароль'
                    }
                    required
                    minLength={register ? 12 : 1}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? 'Скрыть пароль' : 'Показать пароль'
                    }
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {register && (
                  <small className="password-hint">
                    Не менее 12 символов: используйте буквы и цифры.
                  </small>
                )}
              </label>
            </fieldset>
            <Message>{error}</Message>
            <button className="button primary" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : null}
              {busy
                ? register
                  ? 'Создаём аккаунт…'
                  : 'Входим…'
                : register
                  ? 'Создать аккаунт'
                  : 'Войти в аккаунт'}
              {!busy && <ArrowRight size={16} />}
            </button>
            {register && (
              <p className="registration-note">
                Новый аккаунт получает роль сотрудника. Администратор сможет
                изменить вашу роль в рабочем пространстве.
              </p>
            )}
          </form>
          <p className="auth-link">
            {register ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}
            <Link href={register ? '/login' : '/register'}>
              {register ? 'Войти' : 'Зарегистрироваться'}
            </Link>
          </p>
          <p className="auth-private">
            <LockKeyhole size={12} /> Защищённое рабочее пространство вашей
            команды
          </p>
        </div>
      </main>
    </div>
  );
}
