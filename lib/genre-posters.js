import { LOCAL_GENRE_IMAGES } from './local-genre-images.js';

// Одна и та же фотография для ВСЕХ фильмов одного жанра.
// Это тематические изображения жанров, а не официальные постеры фильмов.
// Название, ID, оценка и статус фильма на выбор картинки не влияют.
const photo = (id, extension = 'jpeg') =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.${extension}?auto=compress&cs=tinysrgb&w=1000&fm=jpg`;

export const GENRE_POSTERS = {
  'Фантастика': {
    key: 'science-fiction',
    remoteSrc: photo(7166829),
    position: '50% 44%',
    description: 'Космонавт в скафандре на тёмном фоне',
    photographer: 'cottonbro studio',
    source: 'https://www.pexels.com/photo/person-wearing-spacesuit-7166829/',
  },
  'Драма': {
    key: 'drama',
    remoteSrc: photo(30783684, 'png'),
    position: '50% 38%',
    description: 'Кинематографичный портрет у окна',
    photographer: 'Anh Nguyen',
    source: 'https://www.pexels.com/photo/moody-portrait-of-a-man-by-the-window-30783684/',
  },
  'Комедия': {
    key: 'comedy',
    remoteSrc: photo(18999459),
    position: '50% 37%',
    description: 'Друзья смеются вместе',
    photographer: 'Matheus Bertelli',
    source: 'https://www.pexels.com/photo/laughing-group-of-people-18999459/',
  },
  'Триллер': {
    key: 'thriller',
    remoteSrc: photo(29494279),
    position: '50% 55%',
    description: 'Силуэт на туманной ночной улице',
    photographer: 'Liana Laur',
    source: 'https://www.pexels.com/photo/mysterious-foggy-street-at-night-with-silhouette-29494279/',
  },
  'Боевик': {
    key: 'action',
    remoteSrc: photo(5697207),
    position: '50% 52%',
    description: 'Два человека в тактическом снаряжении на фоне дыма',
    photographer: 'Nur Andi Ravsanjani Gusma',
    source: 'https://www.pexels.com/photo/men-in-military-gear-standing-in-cloud-of-smoke-5697207/',
  },
  'Мультфильм': {
    key: 'animation',
    remoteSrc: 'https://images.unsplash.com/photo-1593085512500-5d55148d6f0d?auto=format&fit=crop&w=1000&q=85&fm=jpg',
    position: '50% 42%',
    description: 'Яркая игрушечная фигурка мультяшного персонажа',
    photographer: 'Alison Wang',
    source: 'https://unsplash.com/photos/yellow-and-black-robot-toy-mou0S7ViElQ',
  },
  'Другое': {
    key: 'other',
    remoteSrc: photo(7991495),
    position: '50% 48%',
    description: 'Красные кресла в кинозале',
    photographer: 'Tima Miroshnichenko',
    source: 'https://www.pexels.com/photo/red-chairs-of-the-cinema-7991495/',
  },
};

export function getGenrePoster(genre) {
  // Object.hasOwn не позволяет принять __proto__ или toString за название жанра.
  const name = typeof genre === 'string' && Object.hasOwn(GENRE_POSTERS, genre)
    ? genre : 'Другое';
  const poster = GENRE_POSTERS[name];
  return {
    ...poster,
    genre: name,
    src: LOCAL_GENRE_IMAGES.includes(poster.key)
      ? `/genres/${poster.key}.jpg` : poster.remoteSrc,
  };
}
