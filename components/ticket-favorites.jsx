'use client';

import { useState } from 'react';
import { CircleAlert, Star } from 'lucide-react';
import { useCurrentUser } from './servicedesk-shell';
import { useLanguage } from './language-provider';
import { usePersistentLocalState } from './use-persistent-local-state';
import {
  isFavoriteTicketId,
  MAX_TICKET_FAVORITES,
  toggleFavoriteId,
  validateFavoriteIds,
} from '../lib/ticket-favorites.js';
import './ticket-favorites.css';

const EMPTY_FAVORITES = [];

export function useTicketFavorites(userId) {
  const state = usePersistentLocalState({
    userId,
    name: 'favorites',
    defaultValue: EMPTY_FAVORITES,
    validate: validateFavoriteIds,
  });
  return {
    ...state,
    ids: state.value,
    count: state.value.length,
    toggle: (ticketId) => state.setValue((ids) => toggleFavoriteId(ids, ticketId)),
  };
}

export function FavoriteButton({ ticketId, userId, className = '' }) {
  const currentUser = useCurrentUser();
  const { t } = useLanguage();
  const favorites = useTicketFavorites(userId || currentUser?.id);
  const [attempted, setAttempted] = useState(false);
  const id = Number(ticketId);
  const saved = favorites.ready && favorites.ids.includes(id);
  const atLimit = !saved && favorites.count >= MAX_TICKET_FAVORITES;
  const disabled = !favorites.ready || !isFavoriteTicketId(id) || atLimit;
  const label = t(saved ? 'Убрать заявку {id} из избранного' : 'Добавить заявку {id} в избранное', { id });
  const storageFailed = attempted && !!favorites.storageError;
  const errorLabel = t('Не удалось сохранить избранное в этом браузере.');
  const title = !favorites.ready
    ? t('Загрузка избранного…')
    : atLimit
      ? t('Можно сохранить не более {count} заявок.', { count: MAX_TICKET_FAVORITES })
      : storageFailed ? `${label} · ${errorLabel}` : label;

  return (
    <span className="ticket-favorite-control">
      <button
        type="button"
        className={`ticket-favorite-button${saved ? ' is-saved' : ''}${className ? ` ${className}` : ''}`}
        aria-label={label}
        title={title}
        aria-pressed={saved}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setAttempted(true);
          favorites.toggle(id);
        }}
      >
        <Star size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      {storageFailed && (
        <span className="ticket-favorite-error" role="status" title={errorLabel}>
          <CircleAlert size={13} aria-hidden="true" />
          <span className="sr-only">{errorLabel}</span>
        </span>
      )}
    </span>
  );
}

export function FavoritesToggle({ active = false, onToggle, count = 0, ready = true }) {
  const { t } = useLanguage();
  const total = Number.isInteger(count) && count >= 0 ? count : 0;
  return (
    <button
      type="button"
      className={`ticket-favorites-toggle${active ? ' is-active' : ''}`}
      aria-pressed={active}
      aria-busy={!ready}
      disabled={!ready}
      title={t(active ? 'Показать все заявки' : 'Показать только избранные заявки')}
      onClick={() => onToggle(!active)}
    >
      <Star size={16} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
      <span>{t('Избранные')}</span>
      <span className="ticket-favorites-count">{total}</span>
    </button>
  );
}
