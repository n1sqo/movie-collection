import Dexie, { type EntityTable } from 'dexie'

export interface CastMember {
  name: string
  character: string
}

export interface Movie {
  tmdbId: number
  titleUk: string
  titleEn: string
  originalTitle: string
  year: number
  releaseDate: string
  genres: string[]
  genresEn: string[]
  directors: string[]
  cast: CastMember[]
  overviewUk: string
  overviewEn: string
  runtime: number
  tmdbRating: number
  posterPath: string
  posterBlob?: Blob
}

export interface Entry {
  tmdbId: number
  status: 'watched' | 'watchlist'
  myRating?: number
  watchedAt?: string
  note?: string
  addedAt: string
  updatedAt: string
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('movie-collection') as Dexie & {
  movies: EntityTable<Movie, 'tmdbId'>
  entries: EntityTable<Entry, 'tmdbId'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  movies: 'tmdbId, year, tmdbRating',
  entries: 'tmdbId, status, myRating, watchedAt, addedAt, updatedAt',
  settings: 'key'
})

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
