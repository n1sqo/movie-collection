import { useMemo, useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { usePosterUrl } from '../usePosterUrl'
import { Screen } from '../components/Screen'
import { openMovie } from '../components/MovieSheet'
import { tab } from '../app'
import {
  activeFilterCount,
  applyQuery,
  displayGenres,
  displayTitle,
  emptyFilters,
  type Filters,
  type Item,
  type SortKey
} from '../data/query'

const SORT_KEYS: SortKey[] = ['myRating', 'tmdbRating', 'year', 'watchedAt', 'title', 'addedAt']
const PREFS_KEY = 'collection-view'

interface ViewPrefs {
  sort: SortKey
  asc: boolean
}

function loadPrefs(): ViewPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '')
    if (SORT_KEYS.includes(saved.sort)) return { sort: saved.sort, asc: !!saved.asc }
  } catch {}
  return { sort: 'myRating', asc: false }
}

// Survive tab switches within a session.
let sessionFilters: Filters = emptyFilters

async function loadWatched(): Promise<Item[]> {
  const entries = await db.entries.where('status').equals('watched').toArray()
  const movies = await db.movies.bulkGet(entries.map((e) => e.tmdbId))
  return entries.flatMap((entry, i) => (movies[i] ? [{ entry, movie: movies[i]! }] : []))
}

export function Collection() {
  const items = useLiveQuery(loadWatched)
  const [prefs, setPrefsState] = useState(loadPrefs)
  const [filters, setFiltersState] = useState(sessionFilters)
  const [showFilters, setShowFilters] = useState(false)

  const setPrefs = (next: ViewPrefs) => {
    setPrefsState(next)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    } catch {}
  }
  const setFilters = (next: Filters) => {
    sessionFilters = next
    setFiltersState(next)
  }

  const visible = useMemo(
    () => (items ? applyQuery(items, filters, prefs.sort, prefs.asc, lang.value) : []),
    [items, filters, prefs, lang.value]
  )
  const filterCount = activeFilterCount(filters)

  if (items && items.length === 0) {
    return (
      <Screen title={t('titles.collection')}>
        <div class="notice">
          <p class="muted">{t('collection.empty')}</p>
          <button class="btn" onClick={() => (tab.value = 'search')}>
            {t('collection.goSearch')}
          </button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={t('titles.collection')}>
      <div class="search-field">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
          />
        </svg>
        <input
          type="search"
          autocomplete="off"
          placeholder={t('collection.search')}
          value={filters.text}
          onInput={(e) => setFilters({ ...filters, text: e.currentTarget.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {filters.text && (
          <button class="clear" aria-label="clear" onClick={() => setFilters({ ...filters, text: '' })}>
            ×
          </button>
        )}
      </div>

      <div class="toolbar">
        <label class="sort-select">
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
          class="icon-btn"
          aria-label={prefs.asc ? t('collection.asc') : t('collection.desc')}
          onClick={() => setPrefs({ ...prefs, asc: !prefs.asc })}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class={prefs.asc ? 'flip' : ''}>
            <path fill="currentColor" d="M11 4h2v12.2l4.6-4.6 1.4 1.4-7 7-7-7 1.4-1.4 4.6 4.6V4Z" />
          </svg>
        </button>
        <span class="toolbar-spacer" />
        <button class={showFilters || filterCount ? 'chip-btn active' : 'chip-btn'} onClick={() => setShowFilters(!showFilters)}>
          {t('collection.filters')}
          {filterCount > 0 && <span class="count">{filterCount}</span>}
        </button>
      </div>

      {showFilters && items && <FilterPanel items={items} filters={filters} onChange={setFilters} />}

      {items && <div class="collection-count">{tn('collection.count', visible.length)}</div>}

      {items && visible.length === 0 ? (
        <p class="notice muted">{t('collection.noMatch')}</p>
      ) : (
        <div class="poster-grid">
          {visible.map((item) => (
            <PosterTile key={item.movie.tmdbId} item={item} />
          ))}
        </div>
      )}
    </Screen>
  )
}

function PosterTile({ item }: { item: Item }) {
  const { movie, entry } = item
  const url = usePosterUrl(movie.posterBlob, movie.posterPath, 'w342')
  const title = displayTitle(movie, lang.value)
  return (
    <button class="poster-tile" onClick={() => (openMovie.value = { id: movie.tmdbId })} aria-label={title}>
      {url ? <img src={url} alt="" loading="lazy" /> : <div class="poster-fallback">{title}</div>}
      {entry.myRating !== undefined && <span class="rating-badge">{entry.myRating}</span>}
    </button>
  )
}

function FilterPanel({ items, filters, onChange }: { items: Item[]; filters: Filters; onChange: (f: Filters) => void }) {
  const genres = useMemo(() => {
    const all = new Set(items.flatMap((i) => displayGenres(i.movie, lang.value)))
    return [...all].sort((a, b) => a.localeCompare(b, lang.value))
  }, [items, lang.value])
  const people = useMemo(() => {
    const all = new Set(items.flatMap((i) => [...i.movie.directors, ...i.movie.cast.map((c) => c.name)]))
    return [...all].sort()
  }, [items])
  const num = (v: string) => (v === '' ? undefined : Number(v))
  const ratings = Array.from({ length: 10 }, (_, i) => i + 1)

  return (
    <div class="group filter-panel">
      <label class="filter-row">
        <span>{t('collection.genre')}</span>
        <select value={filters.genre} onChange={(e) => onChange({ ...filters, genre: e.currentTarget.value })}>
          <option value="">{t('collection.anyGenre')}</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <div class="filter-row">
        <span>{t('collection.years')}</span>
        <div class="range">
          <input
            type="number"
            inputMode="numeric"
            placeholder={t('collection.from')}
            value={filters.yearFrom ?? ''}
            onInput={(e) => onChange({ ...filters, yearFrom: num(e.currentTarget.value) })}
          />
          <span>–</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={t('collection.to')}
            value={filters.yearTo ?? ''}
            onInput={(e) => onChange({ ...filters, yearTo: num(e.currentTarget.value) })}
          />
        </div>
      </div>
      <div class="filter-row">
        <span>{t('collection.rating')}</span>
        <div class="range">
          <select value={filters.ratingFrom ?? ''} onChange={(e) => onChange({ ...filters, ratingFrom: num(e.currentTarget.value) })}>
            <option value="">{t('collection.from')}</option>
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span>–</span>
          <select value={filters.ratingTo ?? ''} onChange={(e) => onChange({ ...filters, ratingTo: num(e.currentTarget.value) })}>
            <option value="">{t('collection.to')}</option>
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label class="filter-row">
        <span>{t('collection.person')}</span>
        <input
          type="text"
          list="people"
          autocomplete="off"
          placeholder={t('collection.personPlaceholder')}
          value={filters.person}
          onInput={(e) => onChange({ ...filters, person: e.currentTarget.value })}
        />
        <datalist id="people">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      {activeFilterCount(filters) > 0 && (
        <button class="link" onClick={() => onChange({ ...emptyFilters, text: filters.text })}>
          {t('collection.reset')}
        </button>
      )}
    </div>
  )
}
