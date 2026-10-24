import { useMemo, useRef, useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { usePosterUrl } from '../usePosterUrl'
import { RatingPicker } from '../components/RatingPicker'
import { openMovie } from '../components/MovieSheet'
import { showToast } from '../components/Toast'
import { activeTag, TagChips } from '../components/Tags'
import { moveToWatchlist, removeFromCollection, today, undoRemove, updateEntry } from '../data/collection'
import { applyQuery, displayTitle, emptyFilters, type Item, type SortKey } from '../data/query'
import { goTo } from '../app'

const SORT_KEYS: SortKey[] = ['addedAt', 'tmdbRating', 'year', 'title']
const PREFS_KEY = 'watchlist-view'

function loadSort(): { sort: SortKey; asc: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '')
    if (SORT_KEYS.includes(saved.sort)) return { sort: saved.sort, asc: !!saved.asc }
  } catch {}
  return { sort: 'addedAt', asc: false }
}

async function loadWatchlist(): Promise<Item[]> {
  const entries = await db.entries.where('status').equals('watchlist').toArray()
  const movies = await db.movies.bulkGet(entries.map((e) => e.tmdbId))
  return entries.flatMap((entry, i) => (movies[i] ? [{ entry, movie: movies[i]! }] : []))
}

/** The «Подивитись» half of the collection screen. */
export function WatchlistBody() {
  const items = useLiveQuery(loadWatchlist)
  const [rating, setRating] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [prefs, setPrefsState] = useState(loadSort)
  const setPrefs = (next: typeof prefs) => {
    setPrefsState(next)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    } catch {}
  }
  const visible = useMemo(
    () =>
      items
        ? applyQuery(items, { ...emptyFilters, text, tag: activeTag.value }, prefs.sort, prefs.asc, lang.value)
        : [],
    [items, text, prefs, lang.value, activeTag.value]
  )

  if (items && items.length === 0) {
    return (
      <div class="notice">
        <p class="muted">{t('watchlist.empty')}</p>
        <button class="btn primary" onClick={() => goTo('search')}>
          {t('watchlist.goSearch')}
        </button>
      </div>
    )
  }

  return (
    <>
      <div class="search-field inline">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
          />
        </svg>
        <input
          type="search"
          autocomplete="off"
          placeholder={t('watchlist.search')}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {text && (
          <button class="clear" aria-label="clear" onClick={() => setText('')}>
            ×
          </button>
        )}
      </div>
      <div class="chip-row">
        <label class="chip sort-chip">
          <span class="sr-only">{t('collection.sort')}</span>
          <select value={prefs.sort} onChange={(e) => setPrefs({ ...prefs, sort: e.currentTarget.value as SortKey })}>
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`collection.sortBy.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          class="chip icon-chip"
          aria-label={prefs.asc ? t('collection.asc') : t('collection.desc')}
          onClick={() => setPrefs({ ...prefs, asc: !prefs.asc })}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class={prefs.asc ? 'flip' : ''}>
            <path fill="currentColor" d="M11 4h2v12.2l4.6-4.6 1.4 1.4-7 7-7-7 1.4-1.4 4.6 4.6V4Z" />
          </svg>
        </button>
        <TagChips />
      </div>
      {(text || activeTag.value) && <div class="collection-count">{tn('collection.count', visible.length)}</div>}
      {visible.length > 0 && <p class="hint swipe-tip">{t('watchlist.swipeHint')}</p>}
      {items && visible.length === 0 && <p class="notice muted">{t('collection.noMatch')}</p>}
      <ul class="results">
        {visible.map((item) => (
          <WatchlistRow
            key={item.movie.tmdbId}
            item={item}
            rating={rating === item.movie.tmdbId}
            onRate={(open) => setRating(open ? item.movie.tmdbId : null)}
          />
        ))}
      </ul>
    </>
  )
}

function WatchlistRow({ item, rating, onRate }: { item: Item; rating: boolean; onRate: (open: boolean) => void }) {
  const { movie } = item
  const url = usePosterUrl(movie.posterBlob, movie.posterPath, 'w185')
  const title = displayTitle(movie, lang.value)
  const other = lang.value === 'uk' ? movie.titleEn : movie.titleUk

  async function remove() {
    const removed = await removeFromCollection(movie.tmdbId)
    if (removed) showToast(t('movie.removed'), { label: t('movie.undo'), run: () => undoRemove(removed) })
  }
  async function rate(myRating: number) {
    onRate(false)
    await updateEntry(movie.tmdbId, { status: 'watched', myRating, watchedAt: today() })
    showToast(t('watchlist.movedToWatched').replace('{n}', String(myRating)), {
      label: t('movie.undo'),
      run: () => moveToWatchlist(movie.tmdbId)
    })
  }
  const swipe = useSwipe({ onRight: () => onRate(true), onLeft: () => void remove() })

  return (
    <li class="result watch-row">
      <div class="swipe-hint left" aria-hidden="true" style={{ opacity: swipe.dx > 0 ? 1 : 0 }}>
        {t('watchlist.watched')}
      </div>
      <div class="swipe-hint right" aria-hidden="true" style={{ opacity: swipe.dx < 0 ? 1 : 0 }}>
        {t('watchlist.remove')}
      </div>
      <div
        class="watch-main"
        style={{
          transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined,
          transition: swipe.active ? 'none' : undefined
        }}
        {...swipe.handlers}
        onClick={() => !swipe.moved() && (openMovie.value = { id: movie.tmdbId })}
      >
        {url ? <img class="thumb" src={url} alt="" loading="lazy" /> : <div class="thumb placeholder" />}
        <div class="result-text">
          <div class="result-title">{title}</div>
          {other && other !== title && <div class="result-sub">{other}</div>}
          {(movie.year > 0 || movie.kind === 'tv') && (
            <div class="result-year">
              {[movie.kind === 'tv' ? t('tv.series') : '', movie.year || ''].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {!rating && (
          <div class="watch-actions">
            <button
              class="btn small"
              onClick={(e) => {
                e.stopPropagation()
                onRate(true)
              }}
            >
              {t('watchlist.watched')}
            </button>
            <button
              class="icon-btn danger"
              aria-label={t('watchlist.remove')}
              onClick={(e) => {
                e.stopPropagation()
                void remove()
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm3.5 0v8H15v-8h-1.5Z"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
      {rating && (
        <div class="watch-rate">
          <div class="entry-label">{t('watchlist.rate')}</div>
          <RatingPicker onChange={(myRating) => myRating && void rate(myRating)} />
          <button class="link" onClick={() => onRate(false)}>
            {t('watchlist.cancel')}
          </button>
        </div>
      )}
    </li>
  )
}

const SWIPE_PX = 80

/** Horizontal swipe on a row: right opens the rating, left removes. Vertical drags still scroll. */
function useSwipe({ onRight, onLeft }: { onRight: () => void; onLeft: () => void }) {
  const [dx, setDx] = useState(0)
  const [active, setActive] = useState(false)
  const start = useRef<{ x: number; y: number; horizontal?: boolean } | null>(null)
  const wasSwipe = useRef(false)
  // Read on touchend, which can fire before the last move has re-rendered.
  const last = useRef(0)
  return {
    dx,
    active,
    moved: () => wasSwipe.current,
    handlers: {
      onTouchStart: (e: TouchEvent) => {
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        wasSwipe.current = false
      },
      onTouchMove: (e: TouchEvent) => {
        const s = start.current
        if (!s) return
        const x = e.touches[0].clientX - s.x
        const y = e.touches[0].clientY - s.y
        if (s.horizontal === undefined && Math.abs(x) + Math.abs(y) > 10) s.horizontal = Math.abs(x) > Math.abs(y)
        if (!s.horizontal) return
        wasSwipe.current = true
        setActive(true)
        last.current = Math.max(-140, Math.min(140, x))
        setDx(last.current)
      },
      onTouchEnd: () => {
        const d = last.current
        last.current = 0
        start.current = null
        setActive(false)
        setDx(0)
        if (d >= SWIPE_PX) onRight()
        else if (d <= -SWIPE_PX) onLeft()
      }
    }
  }
}
