'use client';

import { useState } from 'react';
import { getGenrePoster } from '../lib/genre-posters';
import Icon from './icon';

// key сбрасывает состояние картинки, когда при редактировании меняется жанр.
export default function GenreImage({ genre, className = '', eager = false }) {
  const poster = getGenrePoster(genre);
  return <Photo key={poster.src} poster={poster} className={className} eager={eager} />;
}

function Photo({ poster, className, eager }) {
  const [source, setSource] = useState(poster.src);
  const [failed, setFailed] = useState(false);

  function handleError() {
    // Если локальный файл случайно удалили, пробуем оригинальную фотографию.
    if (source !== poster.remoteSrc) setSource(poster.remoteSrc);
    else setFailed(true);
  }

  return (
    <div className={`genre-image genre-${poster.key} ${className}`}>
      {failed ? (
        <div className="genre-image-fallback" role="img" aria-label={`Обложка жанра «${poster.genre}» временно недоступна`}>
          <Icon name="film" size={38} />
          <span>{poster.genre}</span>
          <small>Изображение временно недоступно</small>
        </div>
      ) : (
        <img src={source} alt={`${poster.genre}: ${poster.description}. Общая обложка жанра.`}
          loading={eager ? 'eager' : 'lazy'} decoding="async" width={1000} height={1000}
          style={{ objectPosition: poster.position }} onError={handleError} />
      )}
    </div>
  );
}
