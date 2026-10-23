import { signal } from '@preact/signals'
import { db, setSetting, type Entry, type Movie } from '../db'
import { downloadPoster } from '../api/tmdb'

/** Bumped on every collection change; the GitHub backup listens to it. */
export const changeCounter = signal(0)

export async function markChanged(): Promise<void> {
  await setSetting('dirty', true)
  changeCounter.value++
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export async function saveToCollection(
  movie: Movie,
  patch: Partial<Omit<Entry, 'tmdbId' | 'addedAt' | 'updatedAt'>>
): Promise<void> {
  const now = new Date().toISOString()
  const existingMovie = await db.movies.get(movie.tmdbId)
  const posterBlob = existingMovie?.posterBlob ?? movie.posterBlob ?? (await downloadPoster(movie.posterPath))
  await db.transaction('rw', db.movies, db.entries, db.deleted, async () => {
    await db.movies.put({ ...movie, posterBlob })
    const existing = await db.entries.get(movie.tmdbId)
    const entry: Entry = {
      status: 'watchlist',
      ...existing,
      ...patch,
      tmdbId: movie.tmdbId,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now
    }
    if (entry.status === 'watched' && !entry.watchedAt) entry.watchedAt = today()
    await db.entries.put(entry)
    await db.deleted.delete(movie.tmdbId)
  })
  await markChanged()
}

export async function updateEntry(tmdbId: number, patch: Partial<Entry>): Promise<void> {
  await db.entries.update(tmdbId, { ...patch, updatedAt: new Date().toISOString() })
  await markChanged()
}

/** Moves a watched movie back to the watchlist, dropping its rating and watch date. */
export async function moveToWatchlist(tmdbId: number): Promise<void> {
  await updateEntry(tmdbId, { status: 'watchlist', myRating: undefined, watchedAt: undefined })
}

export interface Removed {
  movie: Movie
  entry: Entry
}

/** Removes a movie and returns what was removed, so the caller can offer Undo. */
export async function removeFromCollection(tmdbId: number): Promise<Removed | undefined> {
  const removed = await db.transaction('rw', db.movies, db.entries, db.deleted, async () => {
    const [movie, entry] = await Promise.all([db.movies.get(tmdbId), db.entries.get(tmdbId)])
    await db.entries.delete(tmdbId)
    await db.movies.delete(tmdbId)
    await db.deleted.put({ tmdbId, deletedAt: new Date().toISOString() })
    return movie && entry ? { movie, entry } : undefined
  })
  await markChanged()
  return removed
}

export async function undoRemove({ movie, entry }: Removed): Promise<void> {
  await db.transaction('rw', db.movies, db.entries, db.deleted, async () => {
    await db.movies.put(movie)
    await db.entries.put({ ...entry, updatedAt: new Date().toISOString() })
    await db.deleted.delete(movie.tmdbId)
  })
  await markChanged()
}
