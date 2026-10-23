import { useEffect, useState } from 'preact/hooks'
import { lang, t } from '../i18n'
import { tmdbToken } from '../settings'
import { online } from '../useOnline'
import { posterUrl, searchMovies, TmdbError, type SearchPage, type SearchResult } from '../api/tmdb'
import { Screen } from '../components/Screen'
import { tab } from '../app'
import { openMovie } from '../components/MovieSheet'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'

const DEBOUNCE_MS = 400
const MIN_QUERY = 2

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; query: string; data: SearchPage }
  | { kind: 'error'; message: string }

// Survive tab switches within a session.
let lastQuery = ''
let lastPage = 1
let lastState: State = { kind: 'idle' }

export function Search() {
  const [query, setQueryState] = useState(lastQuery)
  const [page, setPageState] = useState(lastPage)
  const [state, setState] = useState<State>(lastState)

  const setQuery = (q: string) => {
    lastQuery = q
    setQueryState(q)
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
    if (state.kind === 'done' && state.query === q && state.data.page === page) return
    const controller = new AbortController()
    const timer = setTimeout(
      async () => {
        setState({ kind: 'loading' })
        try {
          const data = await searchMovies(tmdbToken.value, q, page, lang.value, controller.signal)
          setState({ kind: 'done', query: q, data })
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
  }, [query, page, tmdbToken.value, online.value])

  return (
    <Screen title={t('titles.search')}>
      <div class="search-field">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
          />
        </svg>
        <input
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          placeholder={t('search.placeholder')}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {query && (
          <button class="clear" aria-label="clear" onClick={() => setQuery('')}>
            ×
          </button>
        )}
      </div>
      <SearchBody state={state} query={query} page={page} onPage={setPage} />
    </Screen>
  )
}

function SearchBody({
  state,
  query,
  page,
  onPage
}: {
  state: State
  query: string
  page: number
  onPage: (p: number) => void
}) {
  if (!tmdbToken.value) {
    return (
      <div class="notice">
        <p>{t('search.noKey')}</p>
        <button class="btn" onClick={() => (tab.value = 'settings')}>
          {t('search.goSettings')}
        </button>
      </div>
    )
  }
  const offlineNote = !online.value && <p class="inline-note">{t('search.offline')}</p>
  if (state.kind === 'done' && state.query === query.trim()) {
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
            <ResultBadge entry={statusById.get(m.id)} />
          </li>
        )
      })}
    </ul>
  )
}

function ResultBadge({ entry }: { entry?: { status: string; myRating?: number } }) {
  if (!entry) return null
  if (entry.status === 'watchlist') {
    return (
      <span class="result-badge watchlist" aria-label={t('movie.inWatchlist')}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
        </svg>
      </span>
    )
  }
  return (
    <span class="result-badge" aria-label={t('movie.inCollection')}>
      {entry.myRating ?? '✓'}
    </span>
  )
}
