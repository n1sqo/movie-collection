import { useEffect, useState } from 'preact/hooks'
import { lang, t } from '../i18n'
import { tmdbToken } from '../settings'
import { online } from '../useOnline'
import { posterUrl, searchMovies, TmdbError, type SearchResult } from '../api/tmdb'
import { Screen } from '../components/Screen'
import { tab } from '../app'
import { openMovie } from '../components/MovieSheet'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'

const DEBOUNCE_MS = 400

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; results: SearchResult[] }
  | { kind: 'error'; message: string }

let lastQuery = ''
let lastState: State = { kind: 'idle' }

export function Search() {
  const [query, setQuery] = useState(lastQuery)
  const [state, setState] = useState<State>(lastState)

  useEffect(() => {
    lastQuery = query
  }, [query])
  useEffect(() => {
    lastState = state
  }, [state])

  useEffect(() => {
    const q = query.trim()
    if (!q || !tmdbToken.value || !online.value) {
      if (!q) setState({ kind: 'idle' })
      return
    }
    if (q === lastSearched && state.kind === 'done') return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState({ kind: 'loading' })
      try {
        const results = await searchMovies(tmdbToken.value, q, controller.signal)
        lastSearched = q
        setState({ kind: 'done', results })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const kind = err instanceof TmdbError ? err.kind : 'network'
        setState({ kind: 'error', message: t(`errors.${kind}`) })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, tmdbToken.value, online.value])

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
      <SearchBody state={state} query={query} />
    </Screen>
  )
}

let lastSearched = ''

function SearchBody({ state, query }: { state: State; query: string }) {
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
  if (!online.value) return <p class="notice">{t('search.offline')}</p>
  if (!query.trim()) return <p class="notice muted">{t('search.hint')}</p>
  if (state.kind === 'loading') return <div class="spinner" aria-busy="true" />
  if (state.kind === 'error') return <p class="notice error">{state.message}</p>
  if (state.kind === 'done' && state.results.length === 0) return <p class="notice muted">{t('search.empty')}</p>
  if (state.kind !== 'done') return null
  return <Results results={state.results} />
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
