'use client';

import { useEffect, useState } from 'react';
import Icon from './icon';
import MovieCard from './movie-card';
import MovieForm, { Dialog } from './movie-form';
import { GENRES } from '../lib/movie-constants';
import { useSidebar, SidebarToggle } from './sidebar-controls';

const sections = [
  { value: '', label: 'Моя коллекция', icon: 'grid' },
  { value: 'planned', label: 'Хочу посмотреть', icon: 'bookmark' },
  { value: 'watching', label: 'Смотрю сейчас', icon: 'play' },
  { value: 'watched', label: 'Просмотрено', icon: 'circleCheck' },
];

async function request(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (response.status === 204) return null;
  let data;
  try { data = await response.json(); } catch { throw new Error('Сервер временно недоступен. Попробуй ещё раз.'); }
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}

export default function MovieLibrary() {
  const sidebar = useSidebar();
  const [movies, setMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState(null);
  const [about, setAbout] = useState(false);

  // Запрос идёт в настоящий backend. AbortController отменяет устаревший поиск.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams({ q: search.trim(), status, genre, sort });
        const [filtered, collection] = await Promise.all([
          request(`/api/movies?${params}`, { signal: controller.signal }),
          request('/api/movies', { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setMovies(filtered.movies);
          setAllMovies(collection.movies);
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, status, genre, sort, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const total = allMovies.length;
  const watched = allMovies.filter((movie) => movie.status === 'watched').length;
  const planned = allMovies.filter((movie) => movie.status === 'planned').length;
  const ratings = allMovies.filter((movie) => movie.rating !== null);
  const average = ratings.length ? (ratings.reduce((sum, movie) => sum + movie.rating, 0) / ratings.length).toFixed(1) : '—';

  function notify(text, error = false) { setToast({ text, error }); }
  function reload() { setRefresh((value) => value + 1); }
  function resetFilters() { setSearch(''); setGenre(''); setStatus(''); setSort('newest'); }

  async function saveMovie(data, id) {
    await request(id ? `/api/movies/${id}` : '/api/movies', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setForm(null);
    // Новый фильм должен быть виден, даже если до добавления был выбран фильтр.
    if (!id) resetFilters();
    reload();
    notify(id ? 'Изменения сохранены' : 'Фильм добавлен в коллекцию');
  }

  async function toggleMovie(movie) {
    setBusy(true);
    const nextStatus = movie.status === 'watched' ? 'planned' : 'watched';
    try {
      await request(`/api/movies/${movie.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) });
      reload();
      notify(nextStatus === 'watched' ? 'Ещё одна история в копилке!' : 'Фильм снова в планах');
    } catch (error) { notify(error.message, true); } finally { setBusy(false); }
  }

  async function deleteMovie() {
    setBusy(true);
    setDeleteError('');
    try {
      await request(`/api/movies/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      reload();
      notify('Фильм удалён из коллекции');
    } catch (error) { setDeleteError(error.message); } finally { setBusy(false); }
  }

  return (
    <div className={`app-shell ${sidebar.className}`}>
      <a className="skip-link" href="#collection">Перейти к фильмам</a>
      {sidebar.mobile && sidebar.mobileOpen && <button type="button" className="sidebar-scrim" onClick={sidebar.close} tabIndex={-1} aria-label="Закрыть боковую панель" />}
      <aside className="sidebar" id="movie-sidebar" ref={sidebar.sidebarRef}
        inert={!sidebar.open} aria-hidden={!sidebar.open}
        role={sidebar.mobile && sidebar.mobileOpen ? 'dialog' : undefined}
        aria-modal={sidebar.mobile && sidebar.mobileOpen ? true : undefined}
        aria-label="Боковая панель MovieList">
        <div className="sidebar-heading">
          <button type="button" className="brand" onClick={() => { resetFilters(); sidebar.afterNavigate(); }} aria-label="MovieList — вся коллекция"><span className="brand-symbol"><Icon name="film" size={24} /></span>Movie<span>List</span><i /></button>
          <button type="button" className="icon-button sidebar-close" ref={sidebar.closeRef} onClick={sidebar.close} title="Скрыть панель" aria-label="Скрыть панель"><Icon name="close" size={19} /></button>
        </div>
        <p className="nav-caption">ЛИЧНОЕ ПРОСТРАНСТВО</p>
        <nav aria-label="Разделы коллекции">
          {sections.map((section) => <button type="button" key={section.value} className={`nav-item ${status === section.value ? 'active' : ''}`} aria-pressed={status === section.value} onClick={() => { setStatus(section.value); sidebar.afterNavigate(); }}>
            <Icon name={section.icon} /><span>{section.label}</span><small>{section.value ? allMovies.filter((movie) => movie.status === section.value).length : total}</small>
          </button>)}
        </nav>
        <div className="sidebar-note"><span className="small-star">✦</span><h3>Больше хорошего кино.</h3><p>Сохраняй то, что хочется посмотреть. Возвращайся к тому, что запомнилось.</p><span className="note-line" /></div>
        <button type="button" className="about-link" onClick={() => { sidebar.afterNavigate(); setAbout(true); }}><Icon name="info" size={18} />О MovieList<Icon name="arrow" size={16} /></button>
        <div className="sidebar-footer"><span className="avatar">M</span><div>Твоя фильмотека<small>Истории на любой вечер</small></div><span className="online-dot" /></div>
      </aside>

      <div className="main-shell" inert={sidebar.mobile && sidebar.mobileOpen}>
        <header className="topbar">
          <div className="topbar-start">
            <SidebarToggle sidebar={sidebar} />
            <div className="breadcrumb"><span className="breadcrumb-root">Моё пространство</span><span className="breadcrumb-separator">/</span><strong>{sections.find((section) => section.value === status).label}</strong></div>
          </div>
          <span className="topbar-tag"><span />Для любви к кино</span>
        </header>
        <main>
          <section className="hero" aria-labelledby="page-title">
            <div className="hero-content"><p className="eyebrow"><span /> ТВОЙ СЛЕДУЮЩИЙ КИНОВЕЧЕР</p><h1 id="page-title">Хорошие истории.<br /><em>В одном месте.</em></h1><p className="hero-description">Фильмы, которые ждут своего вечера.<br className="desktop-break" /> Впечатления, которые хочется сохранить.</p><button type="button" className="primary-button hero-button" onClick={() => setForm({ movie: null })}><Icon name="plus" size={19} />Добавить фильм</button></div>
            <div className="hero-art" aria-hidden="true"><div className="hero-glow" /><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-planet" /><div className="ticket ticket-back"><span>ONE MORE STORY</span><strong>НАЧАЛО</strong><small>ВОЙДИ В ДРУГУЮ РЕАЛЬНОСТЬ</small><div className="ticket-lines" /></div><div className="ticket ticket-front"><span>MOVIELIST PRESENTS</span><div className="ticket-sun" /><strong>ВЕЧЕР<br />ДЛЯ КИНО</strong><small>МЕСТО ДЛЯ ТВОЕЙ ИСТОРИИ</small><div className="ticket-bottom">БИЛЕТ № 001 <Icon name="star" size={12} /></div></div><span className="art-label">PRESS PLAY. FEEL MORE.</span></div>
          </section>

          <section className="stats" aria-label="Статистика коллекции">
            <div className="stat-card"><span className="stat-icon"><Icon name="film" /></span><div><p>Всего в коллекции</p><strong>{total}<small>фильмов</small></strong></div></div>
            <div className="stat-card"><span className="stat-icon green"><Icon name="circleCheck" /></span><div><p>Уже просмотрено</p><strong>{watched}<small>из {total}</small></strong></div>{total > 0 && <div className="tiny-progress" role="img" aria-label={`Просмотрено ${watched} из ${total}`} style={{ '--progress': `${(watched / total) * 100}%` }} />}</div>
            <div className="stat-card"><span className="stat-icon gold"><Icon name="star" /></span><div><p>Средняя моя оценка</p><strong>{average}<small>{ratings.length ? '/ 10' : 'пока нет оценок'}</small></strong></div></div>
          </section>

          <section className="collection" id="collection" aria-labelledby="collection-title">
            <div className="section-heading"><div><h2 id="collection-title">{sections.find((section) => section.value === status).label}<span>{loading ? '…' : movies.length}</span></h2><p>{status === 'watched' ? 'Истории, которые уже стали частью твоей.' : 'У каждого фильма здесь есть свой повод.'}</p></div><button type="button" className="text-button" onClick={() => setForm({ movie: null })}><Icon name="plus" size={17} />Новый фильм</button></div>
            <div className="filters"><label className="search-field"><Icon name="search" size={19} /><span className="sr-only">Поиск фильма по названию</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} placeholder="Найти тот самый фильм…" /></label><label className="filter-select"><span className="sr-only">Жанр</span><select aria-label="Жанр" value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">Все жанры</option>{GENRES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select sort-select"><span className="sr-only">Сортировка</span><select aria-label="Сортировка" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Сначала новые</option><option value="title">По названию</option><option value="year">По году выпуска</option><option value="rating">По моей оценке</option></select></label></div>
            <div className="mobile-tabs" aria-label="Статус фильмов">{sections.map((section) => <button type="button" key={section.value} className={status === section.value ? 'selected' : ''} onClick={() => setStatus(section.value)} aria-pressed={status === section.value}>{section.value ? section.label : 'Все фильмы'}</button>)}</div>
            {loadError ? <div className="empty-state" role="alert"><Icon name="info" size={32} /><h3>Не получилось загрузить фильмы</h3><p>{loadError}</p><button type="button" className="secondary-button" onClick={reload}><Icon name="refresh" size={16} />Повторить</button></div> : <div aria-busy={loading} aria-label="Список фильмов">
              {loading && movies.length === 0 ? <div className="movie-grid">{[1, 2, 3].map((i) => <div className="skeleton-card" key={i}><div /><span /><span /></div>)}</div> : movies.length > 0 ? <div className={`movie-grid ${loading ? 'updating' : ''}`}>{movies.map((movie) => <MovieCard key={movie.id} movie={movie} onEdit={(selected) => setForm({ movie: selected })} onDelete={(selected) => { setDeleteError(''); setDeleting(selected); }} onToggle={toggleMovie} busy={busy || loading} />)}</div> : <div className="empty-state"><Icon name="film" size={36} /><h3>{total ? 'Пока ничего не нашлось' : 'Твоя история начинается здесь'}</h3><p>{total ? 'Попробуй другое название или сбрось фильтры.' : 'Добавь первый фильм в свою коллекцию.'}</p><button type="button" className="primary-button" onClick={total ? resetFilters : () => setForm({ movie: null })}>{total ? 'Сбросить фильтры' : 'Добавить первый фильм'}</button></div>}
            </div>}
          </section>
          <footer className="page-footer"><span>MovieList <i>✦</i> Создано для хороших историй</span><span>{planned ? `${planned} в планах на следующие вечера` : 'Твоя следующая история уже близко'}</span></footer>
        </main>
      </div>
      {form && <MovieForm movie={form.movie} onClose={() => setForm(null)} onSave={saveMovie} />}
      {deleting && <Dialog title="Удалить фильм?" subtitle={`«${deleting.title}» исчезнет из коллекции вместе с оценкой и заметкой.`} onClose={() => setDeleting(null)} busy={busy}>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setDeleting(null)} disabled={busy}>Оставить</button><button type="button" className="danger-button" onClick={deleteMovie} disabled={busy}><Icon name="trash" size={18} />{busy ? 'Удаляем…' : 'Удалить фильм'}</button></div></Dialog>}
      {about && <Dialog title="Каждому фильму — своё место" onClose={() => setAbout(false)}><div className="about-content"><p>MovieList — твоя небольшая фильмотека. Собирай идеи для просмотра, отмечай пройденные истории и оставляй оценки от 1 до 10.</p><p>Добавь фильм, выбери жанр и статус. После просмотра сохрани впечатление в заметке — чтобы однажды захотеть пересмотреть.</p><p>Картинка выбирается автоматически по жанру. Это общая тематическая обложка, а не официальный постер конкретного фильма.</p><p className="about-note">В этой версии список общий для всех, кто открывает один и тот же запущенный MovieList.</p></div><div className="dialog-actions"><button type="button" className="primary-button" onClick={() => setAbout(false)}>К моей коллекции<Icon name="arrow" size={18} /></button></div></Dialog>}
      {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}><Icon name={toast.error ? 'info' : 'circleCheck'} size={20} />{toast.text}<button type="button" className="icon-button" aria-label="Закрыть уведомление" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}
    </div>
  );
}
