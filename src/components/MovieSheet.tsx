import { signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { lang, t } from '../i18n'
import { tmdbToken } from '../settings'
import { db, type Entry, type Movie } from '../db'
import { getMovieDetails, TmdbError } from '../api/tmdb'
import {
  moveToWatchlist,
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
        <div class="sheet-grabber" aria-hidden="true" />
        <div class="sheet-header">
          <button class="link" onClick={onClose}>
            {t('movie.close')}
          </button>
        </div>
        <div class="sheet-body" ref={swipe.body}>
          <div class="movie-hero">
            {posterUrl ? <img class="hero-poster" src={posterUrl} alt="" /> : <div class="hero-poster placeholder" />}
            <div class="hero-text">
              <h2 class="movie-title">{primary}</h2>
              {secondary && secondary !== primary && <div class="movie-sub">{secondary}</div>}
              {original && original !== titleUk && original !== titleEn && <div class="movie-sub">{original}</div>}
              <div class="movie-meta">
                {[movie?.year || preview?.year, movie?.runtime ? `${movie.runtime} ${t('movie.min')}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {movie && movie.tmdbRating > 0 && (
                <div class="tmdb-rating">
                  {t('movie.tmdbRating')} <b>{movie.tmdbRating.toFixed(1)}</b>
                </div>
              )}
            </div>
          </div>

          {movie && entry !== undefined && <EntryEditor movie={movie} entry={entry} />}

          {!movie && !error && <div class="spinner" aria-busy="true" />}
          {error && !movie && <p class="notice error">{error}</p>}

          {movie && <MovieDetails movie={movie} />}

          <Trailer tmdbId={id} />

          {entry && <RemoveButton tmdbId={id} onRemoved={onClose} />}
        </div>
      </div>
    </div>
  )
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
          <h3>{t('movie.overview')}</h3>
          <p>{overview}</p>
        </section>
      )}
      {movie.directors.length > 0 && (
        <section>
          <h3>{t('movie.director')}</h3>
          <p>{movie.directors.join(', ')}</p>
        </section>
      )}
      {movie.cast.length > 0 && (
        <section>
          <h3>{t('movie.cast')}</h3>
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

function EntryEditor({ movie, entry }: { movie: Movie; entry: Entry | null }) {
  const [pickingRating, setPickingRating] = useState(false)
  // A just-rated movie opens the details editor; an already-rated one shows a compact summary.
  const [editing, setEditing] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [note, setNote] = useState(entry?.note ?? '')

  useEffect(() => setNote(entry?.note ?? ''), [entry?.note])

  if (!entry) {
    if (pickingRating) {
      return (
        <div class="entry-box">
          <div class="entry-label">{t('movie.chooseRating')}</div>
          <RatingPicker
            onChange={(myRating) => {
              if (!myRating) return
              setEditing(true)
              void saveToCollection(movie, { status: 'watched', myRating, watchedAt: today() })
            }}
          />
          <button class="link" onClick={() => setPickingRating(false)}>
            {t('movie.cancel')}
          </button>
        </div>
      )
    }
    return (
      <div class="entry-actions">
        <button class="btn primary" onClick={() => setPickingRating(true)}>
          {t('movie.watched')}
        </button>
        <button class="btn" onClick={() => saveToCollection(movie, { status: 'watchlist' })}>
          {t('movie.wantToWatch')}
        </button>
      </div>
    )
  }

  if (entry.status === 'watchlist') {
    return (
      <div class="entry-box">
        <div class="entry-label">{t('movie.inWatchlist')}</div>
        {pickingRating ? (
          <>
            <div class="entry-label">{t('movie.chooseRating')}</div>
            <RatingPicker
              onChange={(myRating) => {
                if (!myRating) return
                setEditing(true)
                void updateEntry(movie.tmdbId, { status: 'watched', myRating, watchedAt: today() })
              }}
            />
          </>
        ) : (
          <button class="btn primary" onClick={() => setPickingRating(true)}>
            {t('movie.markWatched')}
          </button>
        )}
      </div>
    )
  }

  const noteChanged = note !== (entry.note ?? '')
  const saveNote = () => updateEntry(movie.tmdbId, { note: note.trim() || undefined }).then(() => setNoteSaved(true))

  if (!editing) {
    return (
      <div class="entry-box entry-summary">
        <div class="summary-rating" aria-label={t('movie.myRating')}>
          {entry.myRating ?? '–'}
          <span>/10</span>
        </div>
        <div class="summary-text">
          <div class="entry-label">{t('movie.myRating')}</div>
          {entry.watchedAt && <div class="summary-date">{formatDate(entry.watchedAt)}</div>}
          {entry.note && <div class="summary-note">{entry.note}</div>}
        </div>
        <button class="btn small" onClick={() => setEditing(true)}>
          {t('movie.edit')}
        </button>
      </div>
    )
  }

  return (
    <div class="entry-box">
      <div class="entry-label">{t('movie.myRating')}</div>
      <RatingPicker value={entry.myRating} onChange={(myRating) => updateEntry(movie.tmdbId, { myRating })} />
      <p class="hint">{t('movie.clearHint')}</p>
      <label class="entry-row">
        <span>{t('movie.watchedAt')}</span>
        <input
          type="date"
          value={entry.watchedAt ?? ''}
          max={today()}
          onChange={(e) => updateEntry(movie.tmdbId, { watchedAt: e.currentTarget.value || undefined })}
        />
      </label>
      <label class="entry-note">
        <span>{t('movie.note')}</span>
        <textarea
          rows={3}
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
      {noteChanged ? (
        <button class="btn note-save" onClick={saveNote}>
          {t('movie.saveNote')}
        </button>
      ) : (
        noteSaved && <p class="status ok note-status">{t('movie.noteSaved')}</p>
      )}
      <button
        class="btn primary done"
        onClick={async () => {
          if (noteChanged) await saveNote()
          setNoteSaved(false)
          setEditing(false)
        }}
      >
        {t('movie.done')}
      </button>
      <button class="link move-back" onClick={() => moveToWatchlist(movie.tmdbId)}>
        {t('movie.moveToWatchlist')}
      </button>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(lang.value === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
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
