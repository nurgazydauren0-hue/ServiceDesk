import Icon from './icon';
import { STATUS_LABELS } from '../lib/movie-constants';

// Обложки нарисованы CSS: они работают без загрузки постеров и ключей API.
export default function MovieCard({ movie, onEdit, onDelete, onToggle, busy }) {
  let hash = 0;
  for (const letter of movie.title) hash += letter.codePointAt(0);
  const theme = hash % 6;

  return (
    <article className="movie-card">
      <div className={`movie-poster poster-${theme}`} aria-hidden="true">
        <div className="poster-grain" /><div className="poster-orbit" /><div className="poster-orb" /><div className="poster-landscape" />
        <span className="poster-caption">MOVIELIST COLLECTION</span>
        <div className="poster-title">{movie.title}<span>{movie.year} · {movie.genre}</span></div>
        {movie.rating !== null && <span className="poster-rating"><Icon name="star" size={13} />{movie.rating}<span>/ 10</span></span>}
      </div>
      <div className="movie-body">
        <div className="movie-meta"><span>{movie.year}</span><span className="meta-dot">·</span><span>{movie.genre}</span></div>
        <h3 title={movie.title}>{movie.title}</h3>
        <p className={`movie-note ${!movie.description ? 'muted-note' : ''}`}>{movie.description || 'У каждой истории есть своё время.'}</p>
        <div className="card-bottom">
          <span className={`status-badge status-${movie.status}`}><span />{STATUS_LABELS[movie.status]}</span>
          <span className="accessible-rating">{movie.rating === null ? 'Без оценки' : `Моя оценка: ${movie.rating} из 10`}</span>
          <div className="card-tools">
            <button type="button" className="icon-button" title="Редактировать" aria-label={`Редактировать ${movie.title}`} onClick={() => onEdit(movie)} disabled={busy}><Icon name="edit" size={17} /></button>
            <button type="button" className="icon-button delete-icon" title="Удалить" aria-label={`Удалить ${movie.title}`} onClick={() => onDelete(movie)} disabled={busy}><Icon name="trash" size={17} /></button>
          </div>
        </div>
        <button type="button" className={`watch-button ${movie.status === 'watched' ? 'is-watched' : ''}`} onClick={() => onToggle(movie)} disabled={busy}>
          <Icon name={movie.status === 'watched' ? 'bookmark' : 'check'} size={16} />{movie.status === 'watched' ? 'Вернуть в планы' : 'Отметить просмотренным'}
        </button>
      </div>
    </article>
  );
}
