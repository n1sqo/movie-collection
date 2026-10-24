import { useEffect, useState } from 'preact/hooks'
import { lang, t } from '../i18n'
import { tmdbToken } from '../settings'
import { online } from '../useOnline'
import {
  getMovieDetails,
  posterUrl,
  searchMovies,
  TmdbError,
  type MediaKind,
  type SearchPage,
  type SearchResult
} from '../api/tmdb'
import { Screen } from '../components/Screen'
import { closeSearch, goTo } from '../app'
import { searchIcon } from '../components/TabBar'
import { showToast } from '../components/Toast'
import { removeFromCollection, saveToCollection } from '../data/collection'
import { openMovie } from '../components/MovieSheet'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'

const DEBOUNCE_MS = 400
const MIN_QUERY = 2

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; query: string; media: MediaKind; data: SearchPage }
  | { kind: 'error'; message: string }

// Survive tab switches within a session.
let lastQuery = ''
let lastPage = 1
let lastState: State = { kind: 'idle' }
let lastMedia: MediaKind = 'movie'

export function Search() {
  const [query, setQueryState] = useState(lastQuery)
  const [page, setPageState] = useState(lastPage)
  const [state, setState] = useState<State>(lastState)
  const [media, setMediaState] = useState<MediaKind>(lastMedia)

  const setQuery = (q: string) => {
    lastQuery = q
    setQueryState(q)
    lastPage = 1
    setPageState(1)
  }
  const setMedia = (m: MediaKind) => {
    lastMedia = m
    setMediaState(m)
    lastPage = 1
    setPageState(1)
  }
  const setPage = (p: number) => {
    lastPage = p
    setPageState(p)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    lastState = state
  }, [state])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) {
      setState({ kind: 'idle' })
      return
    }
    // Offline or no key: keep whatever is on screen.
    if (!tmdbToken.value || !online.value) return
    if (state.kind === 'done' && state.query === q && state.media === media && state.data.page === page) return
    const controller = new AbortController()
    const timer = setTimeout(
      async () => {
        setState({ kind: 'loading' })
        try {
          const data = await searchMovies(tmdbToken.value, q, page, lang.value, controller.signal, media)
          setState({ kind: 'done', query: q, media, data })
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
          const kind = err instanceof TmdbError ? err.kind : 'network'
          setState({ kind: 'error', message: t(`errors.${kind}`) })
        }
      },
      page === 1 ? DEBOUNCE_MS : 0
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, page, media, tmdbToken.value, online.value])
  const current = state.kind === 'done' && state.query === query.trim() && state.media === media

  return (
    <Screen title={t('titles.search')}>
      <SearchBar query={query} onQuery={setQuery} />
      <div class="segmented big media-switch" role="tablist" aria-label={t('search.kind')}>
        {(['movie', 'tv'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={media === m}
            class={media === m ? 'active' : ''}
            onClick={() => setMedia(m)}
          >
            {t(`search.kinds.${m}`)}
          </button>
        ))}
      </div>
      {current && state.data.totalResults > 0 && (
        <p class="result-count">
          {t('search.count').replace('{n}', String(state.data.totalResults)).replace('{q}', state.query)}
        </p>
      )}
      <SearchBody state={state} current={current} query={query} page={page} onPage={setPage} />
    </Screen>
  )
}

/** Pinned under the status bar while the results scroll, like the iOS search field. */
function SearchBar({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  return (
    <div class="search-bar">
      <div class="search-field floating">
        {searchIcon(20)}
        <input
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={query}
          autoFocus={!query}
          onInput={(e) => onQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {query && (
          <button class="clear" aria-label={t('search.clear')} onClick={() => onQuery('')}>
            ×
          </button>
        )}
      </div>
      <button class="round-btn big" aria-label={t('search.close')} onClick={closeSearch}>
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

function SearchBody({
  state,
  current,
  query,
  page,
  onPage
}: {
  state: State
  current: boolean
  query: string
  page: number
  onPage: (p: number) => void
}) {
  if (!tmdbToken.value) {
    return (
      <div class="notice">
        <p>{t('search.noKey')}</p>
        <button class="btn primary" onClick={() => goTo('options')}>
          {t('search.goSettings')}
        </button>
      </div>
    )
  }
  const offlineNote = !online.value && <p class="inline-note">{t('search.offline')}</p>
  if (state.kind === 'done' && current) {
    if (state.data.results.length === 0) return <p class="notice muted">{t('search.empty')}</p>
    return (
      <>
        {offlineNote}
        <Results results={state.data.results} />
        <Pagination page={page} total={state.data.totalPages} disabled={!online.value} onPage={onPage} />
      </>
    )
  }
  if (!online.value) return <p class="notice">{t('search.offline')}</p>
  if (query.trim().length < MIN_QUERY)
    return <p class="notice muted">{t(query.trim() ? 'search.tooShort' : 'search.hint')}</p>
  if (state.kind === 'error') return <p class="notice error">{state.message}</p>
  return <div class="spinner" aria-busy="true" />
}

/** Page numbers around the current one, with the first and last always reachable. */
export function pageList(page: number, total: number): (number | '…')[] {
  const pages = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total))
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

function Pagination({
  page,
  total,
  disabled,
  onPage
}: {
  page: number
  total: number
  disabled: boolean
  onPage: (p: number) => void
}) {
  if (total <= 1) return null
  return (
    <nav class="pagination" aria-label={t('search.pages')}>
      <button
        class="page-btn"
        disabled={disabled || page === 1}
        onClick={() => onPage(page - 1)}
        aria-label={t('search.prev')}
      >
        ‹
      </button>
      {pageList(page, total).map((p, i) =>
        p === '…' ? (
          <span key={`gap${i}`} class="page-gap">
            …
          </span>
        ) : (
          <button
            key={p}
            class={p === page ? 'page-btn active' : 'page-btn'}
            aria-current={p === page ? 'page' : undefined}
            disabled={disabled}
            onClick={() => p !== page && onPage(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        class="page-btn"
        disabled={disabled || page === total}
        onClick={() => onPage(page + 1)}
        aria-label={t('search.next')}
      >
        ›
      </button>
    </nav>
  )
}

function Results({ results }: { results: SearchResult[] }) {
  const ids = results.map((m) => m.id)
  const entries = useLiveQuery(() => db.entries.bulkGet(ids), [ids.join(',')])
  const statusById = new Map(entries?.filter((e) => e).map((e) => [e!.tmdbId, e!]) ?? [])

  return (
    <ul class="results">
      {results.map((m) => {
        const primary = lang.value === 'uk' ? m.titleUk : m.titleEn
        const secondary = lang.value === 'uk' ? m.titleEn : m.titleUk
        const extra = secondary !== primary ? secondary : m.originalTitle !== primary ? m.originalTitle : ''
        return (
          <li
            key={m.id}
            class="result"
            onClick={() =>
              (openMovie.value = {
                id: m.id,
                preview: { titleUk: m.titleUk, titleEn: m.titleEn, year: m.year, posterPath: m.posterPath }
              })
            }
          >
            {m.posterPath ? (
              <img class="thumb" src={posterUrl(m.posterPath, 'w185')} alt="" loading="lazy" />
            ) : (
              <div class="thumb placeholder" />
            )}
            <div class="result-text">
              <div class="result-title">{primary}</div>
              {extra && <div class="result-sub">{extra}</div>}
              {m.year && <div class="result-year">{m.year}</div>}
            </div>
            <ResultStatus id={m.id} entry={statusById.get(m.id)} />
          </li>
        )
      })}
    </ul>
  )
}

function ResultStatus({ id, entry }: { id: number; entry?: { status: string; myRating?: number } }) {
  const [busy, setBusy] = useState(false)
  if (entry?.status === 'watchlist') return <span class="status-pill">{t('search.inList')}</span>
  if (entry) {
    return (
      <span class="status-pill rated" aria-label={t('movie.inCollection')}>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M5 12l5 5 9-10" />
        </svg>
        {entry.myRating ?? ''}
      </span>
    )
  }
  async function add(e: Event) {
    e.stopPropagation()
    setBusy(true)
    try {
      const movie = await getMovieDetails(tmdbToken.value, id)
      await saveToCollection(movie, { status: 'watchlist' })
      showToast(t('search.added'), {
        label: t('movie.undo'),
        run: () => void removeFromCollection(id)
      })
    } catch (err) {
      showToast(t(`errors.${err instanceof TmdbError ? err.kind : 'network'}`))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button class="add-btn" aria-label={t('search.addToWatchlist')} disabled={busy || !online.value} onClick={add}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  )
}
