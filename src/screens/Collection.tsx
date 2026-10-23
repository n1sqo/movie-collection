import { signal } from '@preact/signals'
import { useMemo, useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { usePosterUrl } from '../usePosterUrl'
import { Screen } from '../components/Screen'
import { openMovie } from '../components/MovieSheet'
import { goTo } from '../app'
import { WatchlistBody } from './Watchlist'
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

export type CollectionView = 'watched' | 'watchlist'
export const collectionView = signal<CollectionView>('watched')

const thisYear = () => String(new Date().getFullYear())

export function Collection() {
  const items = useLiveQuery(loadWatched)
  const watchlistCount = useLiveQuery(() => db.entries.where('status').equals('watchlist').count())
  const [prefs, setPrefsState] = useState(loadPrefs)
  const [filters, setFiltersState] = useState(sessionFilters)
  const [showFilters, setShowFilters] = useState(false)
  const view = collectionView.value

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
  const topGenres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { movie } of items ?? [])
      for (const g of displayGenres(movie, lang.value)) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g)
  }, [items, lang.value])
  const filterCount = activeFilterCount(filters) + (filters.text ? 1 : 0)

  if (items === undefined || watchlistCount === undefined) return <Screen title={t('titles.collection')} />

  if (items.length === 0 && watchlistCount === 0) {
    return (
      <Screen title={t('titles.collection')}>
        <div class="notice">
          <p class="muted">{t('collection.empty')}</p>
          <button class="btn primary" onClick={() => goTo('search')}>
            {t('collection.goSearch')}
          </button>
        </div>
      </Screen>
    )
  }

  const rated = items.filter((i) => i.entry.myRating !== undefined)
  const avg = rated.length ? rated.reduce((s, i) => s + i.entry.myRating!, 0) / rated.length : undefined
  const year = thisYear()
  const watchedThisYear = items.filter((i) => i.entry.watchedAt?.startsWith(year)).length
  const highOnly = filters.ratingFrom === 9 && filters.ratingTo === undefined

  return (
    <Screen
      title={t('titles.collection')}
      action={
        view === 'watched' && (
          <button
            class={showFilters || filterCount ? 'round-btn active' : 'round-btn'}
            aria-label={t('collection.filters')}
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {filterCount > 0 && <span class="dot-count">{filterCount}</span>}
          </button>
        )
      }
    >
      <div class="stat-strip">
        <div class="stat-tile">
          <b>{items.length}</b>
          <span>{t('stats.watchedShort')}</span>
        </div>
        <div class="stat-tile">
          <b class="accent">{avg !== undefined ? formatAvg(avg) : '–'}</b>
          <span>{t('stats.avgShort')}</span>
        </div>
        <div class="stat-tile">
          <b>{watchedThisYear}</b>
          <span>{t('stats.thisYear')}</span>
        </div>
      </div>

      <div class="segmented big" role="tablist" aria-label={t('collection.view')}>
        {(['watched', 'watchlist'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            class={view === v ? 'active' : ''}
            onClick={() => {
              collectionView.value = v
              window.scrollTo(0, 0)
            }}
          >
            {t(`collection.views.${v}`)} · {v === 'watched' ? items.length : watchlistCount}
          </button>
        ))}
      </div>

      {view === 'watchlist' ? (
        <WatchlistBody />
      ) : (
        <>
          <div class="chip-row">
            <label class="chip sort-chip">
              <span class="sr-only">{t('collection.sort')}</span>
              <select
                value={prefs.sort}
                onChange={(e) => setPrefs({ ...prefs, sort: e.currentTarget.value as SortKey })}
              >
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
            <button
              class={highOnly ? 'chip on' : 'chip'}
              aria-pressed={highOnly}
              onClick={() => setFilters({ ...filters, ratingFrom: highOnly ? undefined : 9, ratingTo: undefined })}
            >
              9–10
            </button>
            {topGenres.map((g) => (
              <button
                key={g}
                class={filters.genre === g ? 'chip on' : 'chip'}
                aria-pressed={filters.genre === g}
                onClick={() => setFilters({ ...filters, genre: filters.genre === g ? '' : g })}
              >
                {g}
              </button>
            ))}
          </div>

          {showFilters && <FilterPanel items={items} filters={filters} onChange={setFilters} />}

          {filterCount > 0 && <div class="collection-count">{tn('collection.count', visible.length)}</div>}

          {items.length === 0 ? (
            <p class="notice muted">{t('collection.emptyWatched')}</p>
          ) : visible.length === 0 ? (
            <p class="notice muted">{t('collection.noMatch')}</p>
          ) : (
            <div class="poster-grid">
              {visible.map((item) => (
                <PosterTile key={item.movie.tmdbId} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </Screen>
  )
}

export function formatAvg(n: number): string {
  return n.toLocaleString(lang.value === 'uk' ? 'uk-UA' : 'en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  })
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

function FilterPanel({
  items,
  filters,
  onChange
}: {
  items: Item[]
  filters: Filters
  onChange: (f: Filters) => void
}) {
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
        <span>{t('collection.titleFilter')}</span>
        <input
          type="search"
          autocomplete="off"
          placeholder={t('collection.search')}
          value={filters.text}
          onInput={(e) => onChange({ ...filters, text: e.currentTarget.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
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
          <select
            value={filters.ratingFrom ?? ''}
            onChange={(e) => onChange({ ...filters, ratingFrom: num(e.currentTarget.value) })}
          >
            <option value="">{t('collection.from')}</option>
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span>–</span>
          <select
            value={filters.ratingTo ?? ''}
            onChange={(e) => onChange({ ...filters, ratingTo: num(e.currentTarget.value) })}
          >
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
      {(activeFilterCount(filters) > 0 || filters.text) && (
        <button class="link" onClick={() => onChange(emptyFilters)}>
          {t('collection.reset')}
        </button>
      )}
    </div>
  )
}
