'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { GENRES, STATUSES, STATUS_LABELS } from '../lib/movie-constants';
import Icon from './icon';
import GenreImage from './genre-image';

export function Dialog({ title, subtitle, children, onClose, busy = false }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === ref.current && !busy) onClose(); }}>
      <div className="dialog-content">
        <div className="dialog-heading">
          <div><p className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</p><h2 id={titleId}>{title}</h2></div>
          <button type="button" className="icon-button" aria-label="Закрыть окно" onClick={onClose} disabled={busy}><Icon name="close" /></button>
        </div>
        {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
        {children}
      </div>
    </dialog>
  );
}

export default function MovieForm({ movie, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(movie);
  const [selectedGenre, setSelectedGenre] = useState(movie?.genre || GENRES[0]);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      title: form.get('title').trim(),
      year: Number(form.get('year')),
      genre: form.get('genre'),
      status: form.get('status'),
      rating: form.get('rating') === '' ? null : Number(form.get('rating')),
      description: form.get('description').trim(),
    };
    if (!data.title) { setError('Напиши название фильма.'); return; }
    setError('');
    setBusy(true);
    try {
      await onSave(data, movie?.id);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title={editing ? 'Редактировать фильм' : 'Что посмотрим?'}
      subtitle={editing ? 'Обнови информацию и сохрани впечатления.' : 'Добавь фильм в список — хороший вечер начинается здесь.'}
      onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="movie-form">
        <label>Название фильма <span className="required">*</span>
          <input name="title" placeholder="Например, Интерстеллар" maxLength={100} required defaultValue={movie?.title || ''} autoFocus />
        </label>
        <div className="form-row">
          <label>Год выпуска <span className="required">*</span>
            <input name="year" type="number" min="1888" max="2100" step="1" required defaultValue={movie?.year || new Date().getFullYear()} />
          </label>
          <label>Жанр <span className="required">*</span>
            <select name="genre" value={selectedGenre} onChange={(event) => setSelectedGenre(event.target.value)}>{GENRES.map((genre) => <option key={genre}>{genre}</option>)}</select>
          </label>
        </div>
        <div className="genre-preview">
          <GenreImage genre={selectedGenre} className="genre-preview-image" eager />
          <div>
            <p className="genre-preview-label">АВТОМАТИЧЕСКАЯ ОБЛОЖКА</p>
            <strong>{selectedGenre}</strong>
            <p>Одна картинка для всех фильмов этого жанра. Ссылку вводить не нужно.</p>
          </div>
        </div>
        <div className="form-row">
          <label>Статус
            <select name="status" defaultValue={movie?.status || 'planned'}>{STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
          </label>
          <label>Моя оценка
            <select name="rating" defaultValue={movie?.rating ?? ''}><option value="">Пока без оценки</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((rating) => <option key={rating} value={rating}>{rating} / 10</option>)}</select>
          </label>
        </div>
        <label>Заметка <span className="optional">необязательно</span>
          <textarea name="description" rows={3} maxLength={1000} placeholder="Почему хочешь посмотреть? Что запомнилось?" defaultValue={movie?.description || ''} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="submit" className="primary-button" disabled={busy}><Icon name={editing ? 'check' : 'plus'} />{busy ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Добавить фильм'}</button>
        </div>
      </form>
    </Dialog>
  );
}
