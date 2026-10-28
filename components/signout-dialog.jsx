'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { CircleAlert, LoaderCircle, LogOut } from 'lucide-react';
import './signout-dialog.css';

export default function SignOutDialog({ onClose }) {
  const dialogRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signOut({ callbackUrl: '/login' });
    } catch {
      setError('Не удалось выйти. Проверьте соединение и повторите попытку.');
      setBusy(false);
    }
  }

  function backdropClick(event) {
    if (busy || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog signout-dialog"
      aria-labelledby="signout-dialog-title"
      aria-describedby="signout-dialog-description"
      aria-busy={busy}
      onClick={backdropClick}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-icon" aria-hidden="true"><LogOut size={25} /></div>
      <h2 id="signout-dialog-title">Выйти из аккаунта?</h2>
      <p id="signout-dialog-description">
        Вы уверены, что хотите выйти? Для продолжения работы потребуется войти снова.
      </p>
      {error && (
        <div className="notice notice-error" role="alert">
          <CircleAlert size={18} /><span>{error}</span>
        </div>
      )}
      <div className="form-actions signout-actions">
        <button type="button" className="button signout-cancel" onClick={onClose} disabled={busy} autoFocus>
          Отмена
        </button>
        <button type="button" className="button danger" onClick={confirm} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}
          {busy ? 'Выходим…' : 'Да, выйти'}
        </button>
      </div>
    </dialog>
  );
}
