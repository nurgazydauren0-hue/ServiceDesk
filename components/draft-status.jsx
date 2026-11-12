'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useLanguage } from './language-provider';
import './draft-status.css';

export default function DraftStatus({ ready, storageError, updatedAt, hasContent, onClear, disabled = false }) {
  const { t } = useLanguage();
  const checked = useRef(ready);
  const [restoredAt, setRestoredAt] = useState(ready && hasContent ? updatedAt : null);

  useEffect(() => {
    if (ready && !checked.current) {
      checked.current = true;
      if (hasContent && updatedAt) setRestoredAt(updatedAt);
    }
  }, [ready, hasContent, updatedAt]);

  const restored = hasContent && !!restoredAt && updatedAt === restoredAt;
  const Icon = !ready ? LoaderCircle : storageError ? CircleAlert : restored ? RotateCcw : Check;
  const message = !ready
    ? 'Проверяем сохранённый черновик…'
    : storageError
      ? 'Автосохранение недоступно. Не закрывайте страницу, чтобы не потерять текст.'
      : restored
        ? 'Черновик восстановлен из этого браузера.'
        : hasContent && updatedAt
          ? 'Черновик сохранён в этом браузере.'
          : hasContent
            ? 'Сохраняем черновик в этом браузере…'
            : 'Черновик сохраняется только в этом браузере.';

  return (
    <aside className={`draft-status${storageError ? ' is-unavailable' : ''}`}>
      <span className="draft-status-message" role="status" aria-live="polite">
        <Icon size={14} className={!ready ? 'spin' : undefined} aria-hidden="true" />
        {t(message)}
      </span>
      {ready && hasContent && (
        <button type="button" className="draft-status-discard" onClick={onClear} disabled={disabled}>
          <Trash2 size={13} aria-hidden="true" /> {t('Удалить черновик')}
        </button>
      )}
    </aside>
  );
}
