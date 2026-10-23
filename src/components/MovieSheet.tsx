import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { lang, t } from '../i18n'
import { tmdbToken } from '../settings'
import { db, type Entry, type Movie } from '../db'
import { getMovieDetails, TmdbError } from '../api/tmdb'
import { removeFromCollection, saveToCollection, today, updateEntry } from '../data/collection'
import { useLiveQuery } from '../useLiveQuery'
import { usePosterUrl } from '../usePosterUrl'
import { RatingPicker } from './RatingPicker'

export interface SheetPreview {
  titleUk: string
  titleEn: string
  year?: number
  posterPath?: string
}

export const openMovie = signal<{ id: number; preview?: SheetPreview } | null>(null)

export function MovieSheetHost() {
  const current = openMovie.value
  useEffect(() => {
    document.body.classList.toggle('sheet-open', !!current)
  }, [current])
  if (!current) return null
  return <MovieSheet key={current.id} id={current.id} preview={current.preview} onClose={() => (openMovie.value = null)} />
}

function MovieSheet({ id, preview, onClose }: { id: number; preview?: SheetPreview; onClose: () => void }) {
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
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-header">
          <button class="link" onClick={onClose}>
            {t('movie.close')}
          </button>
        </div>
        <div class="sheet-body">
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

          {movie && entry !== undefined && <EntryEditor movie={movie} entry={entry} onDone={onClose} />}

          {!movie && !error && <div class="spinner" aria-busy="true" />}
          {error && !movie && <p class="notice error">{error}</p>}

          {movie && <MovieDetails movie={movie} />}

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

function EntryEditor({ movie, entry, onDone }: { movie: Movie; entry: Entry | null; onDone: () => void }) {
  const [pickingRating, setPickingRating] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [note, setNote] = useState(entry?.note ?? '')

  useEffect(() => setNote(entry?.note ?? ''), [entry?.note])

  if (!entry) {
    if (pickingRating) {
      return (
        <div class="entry-box">
          <div class="entry-label">{t('movie.chooseRating')}</div>
          <RatingPicker onChange={(myRating) => saveToCollection(movie, { status: 'watched', myRating, watchedAt: today() })} />
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
              onChange={(myRating) => updateEntry(movie.tmdbId, { status: 'watched', myRating, watchedAt: today() })}
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

  return (
    <div class="entry-box">
      <div class="entry-label">{t('movie.myRating')}</div>
      <RatingPicker value={entry.myRating} onChange={(myRating) => updateEntry(movie.tmdbId, { myRating })} />
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
          onDone()
        }}
      >
        {t('movie.done')}
      </button>
    </div>
  )
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
            await removeFromCollection(tmdbId)
            onRemoved()
          }}
        >
          {t('movie.removeYes')}
        </button>
      </div>
    </div>
  )
}
