import { signal } from '@preact/signals'
import { db, setSetting, type Entry, type Movie } from '../db'
import { downloadPoster } from '../api/tmdb'

/** Bumped on every collection change; the GitHub backup listens to it. */
export const changeCounter = signal(0)

async function markChanged(): Promise<void> {
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
  await db.transaction('rw', db.movies, db.entries, async () => {
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
  })
  await markChanged()
}

export async function updateEntry(tmdbId: number, patch: Partial<Entry>): Promise<void> {
  await db.entries.update(tmdbId, { ...patch, updatedAt: new Date().toISOString() })
  await markChanged()
}

export async function removeFromCollection(tmdbId: number): Promise<void> {
  await db.transaction('rw', db.movies, db.entries, async () => {
    await db.entries.delete(tmdbId)
    await db.movies.delete(tmdbId)
  })
  await markChanged()
}
