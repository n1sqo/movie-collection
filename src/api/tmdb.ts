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

export async function searchMovies(token: string, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = encodeURIComponent(query)
  const [uk, en] = await Promise.all(
    (['uk-UA', 'en-US'] as const).map((language) =>
      request<{ results: RawMovie[] }>(token, `/search/movie?query=${q}&language=${language}&include_adult=false`, signal)
    )
  )
  const enTitles = new Map(en.results.map((m) => [m.id, m.title]))
  const merged = new Map<number, RawMovie>(uk.results.map((m) => [m.id, m]))
  // Results only found by the English search (e.g. English-only query) go after the Ukrainian ones.
  for (const m of en.results) if (!merged.has(m.id)) merged.set(m.id, m)
  return [...merged.values()].map((m) => ({
    id: m.id,
    titleUk: m.title,
    titleEn: enTitles.get(m.id) ?? m.title,
    originalTitle: m.original_title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : undefined,
    posterPath: m.poster_path ?? undefined
  }))
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
