import type { Movie } from '../db'
const API = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p'

export function posterUrl(posterPath: string, size: string): string {
  return `${IMG}/${size}${posterPath}`
}

export type TmdbErrorKind = 'noKey' | 'unauthorized' | 'network' | 'rateLimit' | 'server'

export class TmdbError extends Error {
  constructor(public kind: TmdbErrorKind) {
    super(kind)
  }
}

export interface SearchResult {
  id: number
  titleUk: string
  titleEn: string
  originalTitle: string
  year?: number
  posterPath?: string
}

interface RawMovie {
  id: number
  title: string
  original_title: string
  release_date?: string
  poster_path?: string | null
}

async function request<T>(token: string, path: string, signal?: AbortSignal): Promise<T> {
  if (!token) throw new TmdbError('noKey')
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new TmdbError('network')
  }
  if (res.status === 401 || res.status === 403) throw new TmdbError('unauthorized')
  if (res.status === 429) throw new TmdbError('rateLimit')
  if (!res.ok) throw new TmdbError('server')
  return res.json() as Promise<T>
}

export async function checkToken(token: string): Promise<void> {
  await request(token, '/authentication')
}

export interface SearchPage {
  results: SearchResult[]
  page: number
  totalPages: number
  totalResults: number
}

/** TMDB caps search at 500 pages of 20 results. */
const MAX_PAGES = 500

/**
 * Searches in Ukrainian and English at once (TMDB matches titles per language) and merges
 * both result lists, ordered by the interface language.
 */
export async function searchMovies(
  token: string,
  query: string,
  page: number,
  primary: 'uk' | 'en',
  signal?: AbortSignal
): Promise<SearchPage> {
  const q = encodeURIComponent(query)
  const [uk, en] = await Promise.all(
    (['uk-UA', 'en-US'] as const).map((language) =>
      request<{ results: RawMovie[]; total_pages?: number; total_results?: number }>(
        token,
        `/search/movie?query=${q}&language=${language}&include_adult=false&page=${page}`,
        signal
      )
    )
  )
  const ukById = new Map(uk.results.map((m) => [m.id, m]))
  const enById = new Map(en.results.map((m) => [m.id, m]))
  const order = primary === 'uk' ? [...uk.results, ...en.results] : [...en.results, ...uk.results]
  const seen = new Set<number>()
  const results: SearchResult[] = []
  for (const m of order) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const ukTitle = ukById.get(m.id)?.title
    const enTitle = enById.get(m.id)?.title
    results.push({
      id: m.id,
      titleUk: ukTitle ?? enTitle ?? m.title,
      titleEn: enTitle ?? ukTitle ?? m.title,
      originalTitle: m.original_title,
      year: m.release_date ? Number(m.release_date.slice(0, 4)) : undefined,
      posterPath: m.poster_path ?? undefined
    })
  }
  const totalPages = Math.min(MAX_PAGES, Math.max(uk.total_pages ?? 1, en.total_pages ?? 1))
  const totalResults = Math.max(uk.total_results ?? 0, en.total_results ?? 0)
  return { results, page, totalPages, totalResults }
}

interface RawDetails {
  id: number
  title: string
  original_title: string
  release_date?: string
  genres: { id: number; name: string }[]
  overview: string
  runtime: number | null
  vote_average: number
  poster_path: string | null
  credits?: {
    cast: { name: string; character: string; order: number }[]
    crew: { name: string; job: string }[]
  }
}

export async function getMovieDetails(token: string, id: number): Promise<Movie> {
  const [uk, en] = await Promise.all([
    request<RawDetails>(token, `/movie/${id}?language=uk-UA&append_to_response=credits`),
    request<RawDetails>(token, `/movie/${id}?language=en-US`)
  ])
  const credits = uk.credits ?? { cast: [], crew: [] }
  return {
    tmdbId: uk.id,
    titleUk: uk.title,
    titleEn: en.title,
    originalTitle: uk.original_title,
    year: uk.release_date ? Number(uk.release_date.slice(0, 4)) : 0,
    releaseDate: uk.release_date ?? '',
    genres: uk.genres.map((g) => g.name),
    genresEn: en.genres.map((g) => g.name),
    directors: credits.crew.filter((c) => c.job === 'Director').map((c) => c.name),
    cast: [...credits.cast]
      .sort((a, b) => a.order - b.order)
      .slice(0, 10)
      .map((c) => ({ name: c.name, character: c.character })),
    overviewUk: uk.overview,
    overviewEn: en.overview,
    runtime: uk.runtime ?? 0,
    tmdbRating: Math.round(uk.vote_average * 10) / 10,
    posterPath: uk.poster_path ?? en.poster_path ?? ''
  }
}

export async function downloadPoster(posterPath: string): Promise<Blob | undefined> {
  if (!posterPath) return undefined
  try {
    const res = await fetch(`${IMG}/w500${posterPath}`)
    return res.ok ? await res.blob() : undefined
  } catch {
    return undefined
  }
}

interface RawVideo {
  key: string
  site: string
  type: string
  official: boolean
  published_at?: string
}

/**
 * YouTube key of the best trailer: Ukrainian first, then English; official trailers
 * before teasers, newest first. Undefined when TMDB has none.
 */
export async function getTrailerKey(token: string, id: number, signal?: AbortSignal): Promise<string | undefined> {
  const rank = (v: RawVideo) => (v.type === 'Trailer' ? 0 : 2) + (v.official ? 0 : 1)
  for (const language of ['uk-UA', 'en-US']) {
    const { results } = await request<{ results: RawVideo[] }>(
      token,
      `/movie/${id}/videos?language=${language}`,
      signal
    )
    const best = results
      .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
      .sort((a, b) => rank(a) - rank(b) || (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0]
    if (best) return best.key
  }
  return undefined
}
