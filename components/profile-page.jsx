'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Pencil,
  ShieldCheck,
  Ticket,
  UserRound,
  X,
} from 'lucide-react';
import { useLanguage } from './language-provider';
import { initials, roleLabels, useCurrentUser } from './servicedesk-shell';
import './profile-page.css';

function joinedAt(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ProfileMessage({ children, success = false }) {
  const { t } = useLanguage();
  if (!children) return null;
  return (
    <div
      className={`notice ${success ? 'notice-success' : 'notice-error'}`}
      role={success ? 'status' : 'alert'}
    >
      {success ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
      <span>{t(children)}</span>
    </div>
  );
}

export default function ProfilePage() {
  const user = useCurrentUser();
  const { t, locale } = useLanguage();
  const role = t(roleLabels[user.role]);
  const [name, setName] = useState(user.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const nameInput = useRef(null);
  const editButton = useRef(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) {
      nameInput.current?.focus();
      nameInput.current?.select();
    } else if (wasEditing.current) {
      editButton.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  function beginEditing() {
    setName(user.name);
    setError('');
    setSuccess('');
    setEditing(true);
  }

  function cancelEditing() {
    setName(user.name);
    setError('');
    setSuccess('');
    setEditing(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (!editing || busy || name.trim() === user.name) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.status === 401) {
        window.location.assign('/login');
        throw new Error('Войдите в аккаунт, чтобы продолжить.');
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Не удалось связаться с сервером. Повторите попытку.');
      }
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Не удалось сохранить изменения. Повторите попытку.',
        );
      }
      user.refreshUser(data.user);
      setName(data.user.name);
      setSuccess('Изменения профиля сохранены.');
      setEditing(false);
    } catch (failure) {
      setError(
        failure instanceof TypeError
          ? 'Не удалось связаться с сервером. Повторите попытку.'
          : failure.message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО')}</p>
          <h1>{t('Мой профиль')}</h1>
          <p>{t('Ваши данные и роль в рабочем пространстве.')}</p>
        </div>
      </div>
      <div className="profile-layout">
        <section className="panel profile-summary">
          <span className="profile-avatar">{initials(user.name)}</span>
          <h2>{user.name}</h2>
          <span className="role-badge">
            <ShieldCheck size={14} />
            {role}
          </span>
          <p>
            <Mail size={15} />
            {user.email}
          </p>
          <div className="profile-divider" />
          <span className="muted">
            {t('В команде с {date}', { date: joinedAt(user.createdAt, locale) })}
          </span>
          <Link href="/my-tickets" className="button secondary">
            <Ticket size={16} /> {t('Мои заявки')}
          </Link>
        </section>
        <div>
          <section className={`panel form-panel profile-information ${editing ? 'is-editing' : ''}`}>
            <div className="form-section-title">
              <span className="section-icon">
                <UserRound size={21} />
              </span>
              <div>
                <h2>{t('Личная информация')}</h2>
                <p>{t('Эти данные видны вашим коллегам')}</p>
              </div>
            </div>
            <form onSubmit={submit} aria-busy={busy}>
              <label className="field">
                {t('Имя и фамилия')}
                <input
                  ref={nameInput}
                  required
                  minLength={2}
                  maxLength={100}
                  value={editing ? name : user.name}
                  onChange={(event) => setName(event.target.value)}
                  readOnly={!editing}
                  disabled={busy}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                {t('Электронная почта')}
                <input value={user.email} type="email" readOnly autoComplete="email" />
                <small>{t('Email используется для входа в систему.')}</small>
              </label>
              <ProfileMessage>{error}</ProfileMessage>
              <ProfileMessage success>{success}</ProfileMessage>
              <div className="form-actions profile-edit-actions">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={cancelEditing}
                      disabled={busy}
                    >
                      <X size={16} /> {t('Отмена')}
                    </button>
                    <button
                      type="submit"
                      className="button primary"
                      disabled={busy || name.trim() === user.name}
                    >
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                      {busy ? t('Сохраняем…') : t('Сохранить изменения')}
                    </button>
                  </>
                ) : (
                  <button
                    ref={editButton}
                    type="button"
                    className="button primary profile-edit-button"
                    onClick={beginEditing}
                  >
                    <Pencil size={16} /> {t('Изменить')}
                  </button>
                )}
              </div>
            </form>
          </section>
          <section className="panel security-panel">
            <span className="section-icon">
              <LockKeyhole size={21} />
            </span>
            <div>
              <h2>{t('Безопасность и доступ')}</h2>
              <p>
                {t('Ваша роль:')} <strong>{role}</strong>.{' '}
                {user.role === 'ADMIN'
                  ? t('Вам доступно управление заявками, назначениями и сотрудниками.')
                  : user.role === 'AGENT'
                    ? t('Вам доступны назначенные заявки, статусы и обсуждения.')
                    : t('Вам доступны ваши заявки и общение с командой поддержки.')}
              </p>
              <p>
                {t('Пароль хранится в защищённом виде. Чтобы завершить текущую сессию, выберите «Выйти из аккаунта» в меню профиля.')}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
