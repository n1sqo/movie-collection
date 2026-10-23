const API = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p'

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
