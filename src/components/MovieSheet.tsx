import { signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { tmdbToken } from '../settings'
import { db, type Entry, type Movie } from '../db'
import { getMovieDetails, TmdbError } from '../api/tmdb'
import { displayGenres } from '../data/query'
import {
  addRewatch,
  moveToWatchlist,
  removeRewatch,
  removeFromCollection,
  saveToCollection,
  today,
  undoRemove,
  updateEntry
} from '../data/collection'
import { showToast } from './Toast'
import { useLiveQuery } from '../useLiveQuery'
import { usePosterUrl } from '../usePosterUrl'
import { RatingPicker } from './RatingPicker'
import { Trailer } from './Trailer'
import { TagEditor } from './Tags'

export interface SheetPreview {
  titleUk: string
  titleEn: string
  year?: number
  posterPath?: string
}

export const openMovie = signal<{ id: number; preview?: SheetPreview } | null>(null)

export function MovieSheetHost() {
  const current = openMovie.value
  const isOpen = !!current
  useEffect(() => {
    if (!isOpen) return
    // Pin the page under the sheet so iOS doesn't scroll the list behind it.
    const scrollY = window.scrollY
    document.body.style.top = `-${scrollY}px`
    document.body.classList.add('sheet-open')
    return () => {
      document.body.classList.remove('sheet-open')
      document.body.style.top = ''
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])
  if (!current) return null
  return (
    <MovieSheet key={current.id} id={current.id} preview={current.preview} onClose={() => (openMovie.value = null)} />
  )
}

const CLOSE_DRAG_PX = 110

/** iOS-style: pull the sheet down from its top (or from content scrolled to the top) to close it. */
function useSwipeToClose(onClose: () => void) {
  const sheet = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  const setOffset = (dy: number, animate: boolean) => {
    const el = sheet.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.25s ease' : 'none'
    el.style.transform = dy ? `translateY(${dy}px)` : ''
  }

  return {
    sheet,
    body,
    handlers: {
      onTouchStart: (e: TouchEvent) => {
        const atTop = (body.current?.scrollTop ?? 0) <= 0
        drag.current = atTop ? { startY: e.touches[0].clientY, dy: 0 } : null
      },
      onTouchMove: (e: TouchEvent) => {
        if (!drag.current) return
        const dy = e.touches[0].clientY - drag.current.startY
        if (dy <= 0) {
          // Scrolling up inside the content: let it scroll.
          drag.current.dy = 0
          setOffset(0, false)
          return
        }
        drag.current.dy = dy
        if (e.cancelable) e.preventDefault()
        setOffset(dy, false)
      },
      onTouchEnd: () => {
        const dy = drag.current?.dy ?? 0
        drag.current = null
        if (dy > CLOSE_DRAG_PX) onClose()
        else setOffset(0, true)
      }
    }
  }
}

function MovieSheet({ id, preview, onClose }: { id: number; preview?: SheetPreview; onClose: () => void }) {
  const swipe = useSwipeToClose(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const stored = useLiveQuery(() => db.movies.get(id).then((m) => m ?? null), [id])
  const entry = useLiveQuery(() => db.entries.get(id).then((e) => e ?? null), [id])
  const [fetched, setFetched] = useState<Movie>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (stored !== null || fetched) return
    getMovieDetails(tmdbToken.value, id)
      .then(setFetched)
      .catch((err) => setError(t(`errors.${err instanceof TmdbError ? err.kind : 'network'}`)))
  }, [stored, id])

  const movie = stored ?? fetched
  const posterUrl = usePosterUrl(movie?.posterBlob, movie?.posterPath ?? preview?.posterPath)

  const uk = lang.value === 'uk'
  const titleUk = movie?.titleUk ?? preview?.titleUk ?? ''
  const titleEn = movie?.titleEn ?? preview?.titleEn ?? ''
  const primary = uk ? titleUk : titleEn
  const secondary = uk ? titleEn : titleUk
  const original = movie?.originalTitle

  return (
    <div class="sheet-backdrop">
      <div class="sheet" role="dialog" aria-modal="true" aria-label={primary} ref={swipe.sheet} {...swipe.handlers}>
        <div class="sheet-body" ref={swipe.body}>
          <div class="sheet-hero" aria-hidden="true">
            {posterUrl && <img src={posterUrl} alt="" />}
          </div>
          <div class="sheet-grabber" aria-hidden="true" />
          <button class="round-btn sheet-close" aria-label={t('movie.close')} onClick={onClose}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div class="sheet-content">
            <div class="movie-hero">
              {posterUrl ? <img class="hero-poster" src={posterUrl} alt="" /> : <div class="hero-poster placeholder" />}
              <div class="hero-text">
                <h2 class="movie-title">{primary}</h2>
                {secondary && secondary !== primary && <div class="movie-sub">{secondary}</div>}
                {original && original !== titleUk && original !== titleEn && <div class="movie-sub">{original}</div>}
                <div class="movie-meta">
                  {[
                    movie?.kind === 'tv' ? t('tv.series') : '',
                    movie?.year || preview?.year,
                    movie?.kind === 'tv'
                      ? movie.seasons?.length
                        ? tn('tv.seasonCount', movie.seasons.length)
                        : ''
                      : movie?.runtime
                        ? formatRuntime(movie.runtime)
                        : '',
                    movie ? (displayGenres(movie, lang.value)[0] ?? '') : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>

            {movie && entry !== undefined && <EntryEditor movie={movie} entry={entry} />}
            {movie?.kind === 'tv' && entry && <SeasonsEditor movie={movie} entry={entry} />}
            {entry && <TagEditor entry={entry} />}

            {!movie && !error && <div class="spinner" aria-busy="true" />}
            {error && !movie && <p class="notice error">{error}</p>}

            <Trailer tmdbId={id} />

            {movie && <MovieDetails movie={movie} />}

            {entry && <RemoveButton tmdbId={id} onRemoved={onClose} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRuntime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} ${t('movie.min')}`
  return m ? `${h} ${t('movie.hours')} ${m} ${t('movie.min')}` : `${h} ${t('movie.hours')}`
}

function MovieDetails({ movie }: { movie: Movie }) {
  const uk = lang.value === 'uk'
  const genres = uk || !movie.genresEn?.length ? movie.genres : movie.genresEn
  const overview = (uk ? movie.overviewUk || movie.overviewEn : movie.overviewEn || movie.overviewUk) ?? ''
  return (
    <div class="movie-details">
      {genres.length > 0 && (
        <div class="chips">
          {genres.map((g) => (
            <span key={g} class="chip">
              {g}
            </span>
          ))}
        </div>
      )}
      {overview && (
        <section>
          <h2 class="section-h">{t('movie.overview')}</h2>
          <p>{overview}</p>
        </section>
      )}
      {movie.directors.length > 0 && (
        <section>
          <h2 class="section-h">{t(movie.kind === 'tv' ? 'tv.creators' : 'movie.director')}</h2>
          <p>{movie.directors.join(', ')}</p>
        </section>
      )}
      {movie.cast.length > 0 && (
        <section>
          <h2 class="section-h">{t('movie.cast')}</h2>
          <ul class="cast">
            {movie.cast.map((c) => (
              <li key={c.name + c.character}>
                <span>{c.name}</span>
                {c.character && <span class="muted"> · {c.character}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Season grid for a series: tap a season once it is watched in full. */
function SeasonsEditor({ movie, entry }: { movie: Movie; entry: Entry }) {
  const seasons = movie.seasons ?? []
  if (seasons.length === 0) return null
  const done = new Set(entry.seasonsWatched ?? [])
  const save = (next: number[]) =>
    updateEntry(entry.tmdbId, { seasonsWatched: next.length ? next.sort((a, b) => a - b) : undefined })
  const toggle = (n: number) => save(done.has(n) ? [...done].filter((x) => x !== n) : [...done, n])
  const allDone = seasons.every((s) => done.has(s.number))
  return (
    <section class="seasons">
      <div class="seasons-head">
        <span class="entry-label">{t('tv.seasons')}</span>
        <span class="muted">
          {t('tv.progress')
            .replace('{n}', String(seasons.filter((s) => done.has(s.number)).length))
            .replace('{total}', String(seasons.length))}
        </span>
        <button class="link" onClick={() => save(allDone ? [] : seasons.map((s) => s.number))}>
          {t(allDone ? 'tv.none' : 'tv.all')}
        </button>
      </div>
      <div class="season-grid">
        {seasons.map((s) => (
          <button
            key={s.number}
            class={done.has(s.number) ? 'season on' : 'season'}
            aria-pressed={done.has(s.number)}
            aria-label={`${t('tv.season')} ${s.number}, ${tn('tv.episodes', s.episodes)}`}
            onClick={() => toggle(s.number)}
          >
            <b>{s.number}</b>
            <span>{tn('tv.episodesShort', s.episodes)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('sv-SE')
}

function EntryEditor({ movie, entry }: { movie: Movie; entry: Entry | null }) {
  // Rating panel open; an already-rated movie shows a compact summary until «Змінити».
  const [editing, setEditing] = useState(false)

  if (!entry && !editing) {
    return (
      <div class="entry-actions">
        <button class="btn primary big" onClick={() => setEditing(true)}>
          {t('movie.watched')}
        </button>
        <button class="btn big" onClick={() => saveToCollection(movie, { status: 'watchlist' })}>
          {t('movie.wantToWatch')}
        </button>
      </div>
    )
  }

  if (entry?.status === 'watchlist' && !editing) {
    return (
      <div class="entry-box">
        <div class="entry-label">{t('movie.inWatchlist')}</div>
        <button class="btn primary big wide" onClick={() => setEditing(true)}>
          {t('movie.markWatched')}
        </button>
      </div>
    )
  }

  if (entry?.status === 'watched' && !editing) {
    const tmdb = movie.tmdbRating > 0 ? movie.tmdbRating : undefined
    return (
      <>
        <div class="entry-box entry-summary">
          <div class="summary-rating" aria-label={t('movie.myRating')}>
            {entry.myRating ?? '–'}
            <span>/10</span>
          </div>
          <div class="summary-text">
            <div class="summary-date">
              {entry.watchedAt ? `${t('movie.watchedOn')} ${formatDate(entry.watchedAt)}` : t('movie.watched')}
            </div>
            {!!entry.rewatches?.length && (
              <div class="summary-sub rewatch-count">
                {tn('movie.rewatchCount', entry.rewatches.length)} · {formatDate(entry.rewatches.at(-1)!)}
              </div>
            )}
            {tmdb !== undefined && (
              <div class="summary-sub">
                TMDB {tmdb.toLocaleString(lang.value === 'uk' ? 'uk-UA' : 'en-US', { maximumFractionDigits: 1 })}
                {entry.myRating !== undefined && entry.myRating !== Math.round(tmdb) && (
                  <> · {t(entry.myRating > tmdb ? 'movie.higherThanTmdb' : 'movie.lowerThanTmdb')}</>
                )}
              </div>
            )}
          </div>
          <button class="btn small" onClick={() => setEditing(true)}>
            {t('movie.edit')}
          </button>
        </div>
        <button class="btn wide rewatch-btn" onClick={() => rewatch(entry)}>
          {t('movie.rewatch')}
        </button>
        {entry.note && (
          <div class="note-card">
            <div class="entry-label">{t('movie.myNote')}</div>
            {entry.note}
          </div>
        )}
      </>
    )
  }

  return <RatePanel movie={movie} entry={entry} onDone={() => setEditing(false)} />
}

async function rewatch(entry: Entry) {
  await addRewatch(entry)
  const before = entry.rewatches
  showToast(t('movie.rewatchAdded'), {
    label: t('movie.undo'),
    run: () => updateEntry(entry.tmdbId, { rewatches: before, watchedAt: entry.watchedAt })
  })
}

/** Big number, ten large buttons, date in one tap, a note and «Готово». */
function RatePanel({ movie, entry, onDone }: { movie: Movie; entry: Entry | null; onDone: () => void }) {
  const [note, setNote] = useState(entry?.note ?? '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [otherDate, setOtherDate] = useState(false)
  useEffect(() => setNote(entry?.note ?? ''), [entry?.note])

  const watched = entry?.status === 'watched'
  const rating = watched ? entry?.myRating : undefined

  const setRating = (myRating: number | undefined) => {
    if (watched) return updateEntry(movie.tmdbId, { myRating })
    if (!myRating) return
    // The first tap marks the movie as watched today.
    if (entry) return updateEntry(movie.tmdbId, { status: 'watched', myRating, watchedAt: today() })
    return saveToCollection(movie, { status: 'watched', myRating, watchedAt: today() })
  }
  const setDate = (watchedAt: string | undefined) => watched && updateEntry(movie.tmdbId, { watchedAt })

  const noteChanged = note !== (entry?.note ?? '')
  const saveNote = () =>
    entry ? updateEntry(movie.tmdbId, { note: note.trim() || undefined }).then(() => setNoteSaved(true)) : undefined

  const dateKind = !entry?.watchedAt
    ? undefined
    : entry.watchedAt === today()
      ? 'today'
      : entry.watchedAt === yesterday()
        ? 'yesterday'
        : 'other'

  return (
    <div class="entry-box rate-panel">
      <div class="rate-big" aria-live="polite">
        <b class={rating ? '' : 'is-empty'}>{rating ?? '–'}</b>
        <span>{rating ? t(`movie.ratingLabels.${rating}`) : t('movie.chooseRating')}</span>
      </div>
      <RatingPicker value={rating} onChange={setRating} />
      {watched && <p class="hint">{t('movie.clearHint')}</p>}

      {watched && (
        <div class="rate-section">
          <div class="entry-label">{t('movie.watchedAt')}</div>
          <div class="chip-row wrap">
            <button class={dateKind === 'today' ? 'chip on' : 'chip'} onClick={() => setDate(today())}>
              {t('movie.today')}
            </button>
            <button class={dateKind === 'yesterday' ? 'chip on' : 'chip'} onClick={() => setDate(yesterday())}>
              {t('movie.yesterday')}
            </button>
            <button class={dateKind === 'other' || otherDate ? 'chip on' : 'chip'} onClick={() => setOtherDate(true)}>
              {dateKind === 'other' && entry?.watchedAt ? formatDate(entry.watchedAt) : t('movie.otherDate')}
            </button>
          </div>
          {otherDate && (
            <input
              class="date-input"
              type="date"
              aria-label={t('movie.watchedAt')}
              value={entry?.watchedAt ?? ''}
              max={today()}
              onChange={(e) => setDate(e.currentTarget.value || undefined)}
            />
          )}
        </div>
      )}

      {watched && !!entry?.rewatches?.length && (
        <div class="rate-section">
          <div class="entry-label">{t('movie.rewatches')}</div>
          <div class="chip-row wrap">
            {entry.rewatches.map((d, i) => (
              <button
                key={`${d}-${i}`}
                class="chip rewatch-chip"
                aria-label={`${t('movie.removeRewatch')} ${formatDate(d)}`}
                onClick={() => removeRewatch(entry, i)}
              >
                {formatDate(d)} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {watched && (
        <label class="entry-note">
          <span class="entry-label">{t('movie.note')}</span>
          <textarea
            rows={2}
            placeholder={t('movie.notePlaceholder')}
            value={note}
            onInput={(e) => {
              setNote(e.currentTarget.value)
              setNoteSaved(false)
            }}
            // Closing the sheet or tapping elsewhere still keeps what was typed.
            onBlur={() => noteChanged && saveNote()}
          />
        </label>
      )}
      {noteSaved && !noteChanged && <p class="status ok note-status">{t('movie.noteSaved')}</p>}

      {watched ? (
        <>
          <button
            class="btn primary big wide done"
            onClick={async () => {
              if (noteChanged) await saveNote()
              setOtherDate(false)
              onDone()
            }}
          >
            {t('movie.done')}
          </button>
          <button class="link move-back" onClick={() => moveToWatchlist(movie.tmdbId).then(onDone)}>
            {t('movie.moveToWatchlist')}
          </button>
        </>
      ) : (
        <button class="link move-back" onClick={onDone}>
          {t('movie.cancel')}
        </button>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(lang.value === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    // The current year goes without saying.
    year: iso.startsWith(String(new Date().getFullYear())) ? undefined : 'numeric'
  })
}

function RemoveButton({ tmdbId, onRemoved }: { tmdbId: number; onRemoved: () => void }) {
  const [confirm, setConfirm] = useState(false)
  if (!confirm) {
    return (
      <button class="link destructive remove-link" onClick={() => setConfirm(true)}>
        {t('movie.remove')}
      </button>
    )
  }
  return (
    <div class="remove-confirm">
      <p>{t('movie.removeConfirm')}</p>
      <div class="row-buttons">
        <button class="btn" onClick={() => setConfirm(false)}>
          {t('movie.cancel')}
        </button>
        <button
          class="btn destructive"
          onClick={async () => {
            const removed = await removeFromCollection(tmdbId)
            onRemoved()
            if (removed) showToast(t('movie.removed'), { label: t('movie.undo'), run: () => undoRemove(removed) })
          }}
        >
          {t('movie.removeYes')}
        </button>
      </div>
    </div>
  )
}
