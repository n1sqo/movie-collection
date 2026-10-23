import { effect, signal } from '@preact/signals'
import { db, getSetting, setSetting, type Entry, type Movie } from '../db'
import { changeCounter } from '../data/collection'
import { downloadPoster } from '../api/tmdb'

const API = 'https://api.github.com'
const FILE = 'collection.json'
const AUTO_DELAY_MS = 10_000

export interface GithubConfig {
  owner: string
  repo: string
  token: string
}

export interface Snapshot {
  version: 1
  exportedAt: string
  movies: Omit<Movie, 'posterBlob'>[]
  entries: Entry[]
}

export type BackupErrorKind = 'unauthorized' | 'forbidden' | 'notFound' | 'network' | 'conflict' | 'server' | 'invalid'

export class BackupError extends Error {
  constructor(public kind: BackupErrorKind) {
    super(kind)
  }
}

export type BackupStatus =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ok' }
  | { state: 'error'; kind: BackupErrorKind }

export const githubConfig = signal<GithubConfig>({ owner: '', repo: 'movie-collection-backup', token: '' })
export const backupStatus = signal<BackupStatus>({ state: 'idle' })
export const lastBackupAt = signal<string | undefined>(undefined)
export const hasUnsavedChanges = signal(false)

export function isConfigured(c = githubConfig.value): boolean {
  return !!(c.owner && c.repo && c.token)
}

export async function loadBackupSettings(): Promise<void> {
  const [config, last, dirty] = await Promise.all([
    getSetting<GithubConfig>('github'),
    getSetting<string>('lastBackupAt'),
    getSetting<boolean>('dirty')
  ])
  if (config) githubConfig.value = config
  lastBackupAt.value = last
  hasUnsavedChanges.value = !!dirty
}

export async function saveGithubConfig(config: GithubConfig): Promise<void> {
  githubConfig.value = { owner: config.owner.trim(), repo: config.repo.trim(), token: config.token.trim() }
  await setSetting('github', githubConfig.value)
}

async function gh(config: GithubConfig, path: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${config.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      }
    })
  } catch {
    throw new BackupError('network')
  }
  if (res.status === 401) throw new BackupError('unauthorized')
  if (res.status === 403) throw new BackupError('forbidden')
  if (res.status === 409 || res.status === 422) throw new BackupError('conflict')
  if (res.status >= 500) throw new BackupError('server')
  return res
}

const contentsPath = (c: GithubConfig) =>
  `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${FILE}`

export async function checkConnection(config = githubConfig.value): Promise<void> {
  const res = await gh(config, `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`)
  if (res.status === 404) throw new BackupError('notFound')
  if (!res.ok) throw new BackupError('server')
  const repo = (await res.json()) as { permissions?: { push?: boolean } }
  if (repo.permissions && repo.permissions.push === false) throw new BackupError('forbidden')
}

async function currentSha(config: GithubConfig): Promise<string | undefined> {
  const res = await gh(config, contentsPath(config))
  if (res.status === 404) {
    // Either the file doesn't exist yet or the repo is unreachable; tell them apart.
    await checkConnection(config)
    return undefined
  }
  if (!res.ok) throw new BackupError('server')
  return ((await res.json()) as { sha: string }).sha
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [movies, entries] = await Promise.all([db.movies.toArray(), db.entries.toArray()])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    movies: movies.map(({ posterBlob: _blob, ...m }) => m),
    entries
  }
}

function commitMessage(snapshot: Snapshot): string {
  const d = new Date(snapshot.exportedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `Backup: ${date}, ${snapshot.entries.length} фільмів`
}

let running: Promise<void> | null = null

/** Uploads the whole collection as collection.json. Concurrent calls share one run. */
export function backupNow(): Promise<void> {
  if (running) return running
  running = (async () => {
    const config = githubConfig.value
    if (!isConfigured(config)) return
    const startedAt = changeCounter.value
    backupStatus.value = { state: 'running' }
    try {
      const snapshot = await buildSnapshot()
      const content = toBase64(JSON.stringify(snapshot, null, 2) + '\n')
      for (let attempt = 0; ; attempt++) {
        const sha = await currentSha(config)
        try {
          const res = await gh(config, contentsPath(config), {
            method: 'PUT',
            body: JSON.stringify({ message: commitMessage(snapshot), content, ...(sha ? { sha } : {}) })
          })
          if (res.status === 404) throw new BackupError('notFound')
          if (!res.ok) throw new BackupError('server')
          break
        } catch (err) {
          // Someone else (another device) moved the file: re-read the sha and retry.
          if (err instanceof BackupError && err.kind === 'conflict' && attempt < 2) continue
          throw err
        }
      }
      lastBackupAt.value = snapshot.exportedAt
      await setSetting('lastBackupAt', snapshot.exportedAt)
      if (changeCounter.value === startedAt) {
        hasUnsavedChanges.value = false
        await setSetting('dirty', false)
      }
      backupStatus.value = { state: 'ok' }
    } catch (err) {
      backupStatus.value = { state: 'error', kind: err instanceof BackupError ? err.kind : 'network' }
      throw err
    } finally {
      running = null
    }
  })()
  return running
}

function backupQuietly(): void {
  if (!isConfigured() || !hasUnsavedChanges.value) return
  if (!navigator.onLine) return
  backupNow().catch(() => {})
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Debounced auto-backup after changes, on startup and when the network comes back. */
export function startAutoBackup(): void {
  let first = true
  effect(() => {
    changeCounter.value
    if (first) {
      first = false
      return
    }
    hasUnsavedChanges.value = true
    clearTimeout(timer)
    timer = setTimeout(backupQuietly, AUTO_DELAY_MS)
  })
  window.addEventListener('online', backupQuietly)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && backupQuietly())
  backupQuietly()
}

export async function fetchBackup(config = githubConfig.value): Promise<Snapshot> {
  const res = await gh(config, contentsPath(config), {}, 'application/vnd.github.raw+json')
  if (res.status === 404) {
    await checkConnection(config)
    throw new BackupError('notFound')
  }
  if (!res.ok) throw new BackupError('server')
  return parseSnapshot(await res.text())
}

export function parseSnapshot(text: string): Snapshot {
  let data: Snapshot
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('invalid')
  }
  if (!data || data.version !== 1 || !Array.isArray(data.movies) || !Array.isArray(data.entries)) {
    throw new BackupError('invalid')
  }
  return data
}

/**
 * Applies a snapshot. 'replace' wipes the local collection first; 'merge' keeps whichever
 * entry was updated last. Posters are downloaded afterwards in the background.
 */
export async function applySnapshot(snapshot: Snapshot, mode: 'merge' | 'replace'): Promise<void> {
  await db.transaction('rw', db.movies, db.entries, async () => {
    // Read posters before a replace wipes them, so already-downloaded images survive.
    const existingMovies = new Map((await db.movies.toArray()).map((m) => [m.tmdbId, m]))
    if (mode === 'replace') {
      await db.entries.clear()
      await db.movies.clear()
    }
    const existingEntries = new Map((await db.entries.toArray()).map((e) => [e.tmdbId, e]))
    for (const movie of snapshot.movies) {
      const local = existingMovies.get(movie.tmdbId)
      await db.movies.put({ ...movie, posterBlob: local?.posterBlob })
    }
    for (const entry of snapshot.entries) {
      const local = existingEntries.get(entry.tmdbId)
      if (!local || local.updatedAt < entry.updatedAt) await db.entries.put(entry)
    }
  })
  if (mode === 'merge') {
    // The merged result can differ from the backup; push it back.
    await setSetting('dirty', true)
    changeCounter.value++
  }
  void fillMissingPosters()
}

export async function fillMissingPosters(): Promise<void> {
  const missing = (await db.movies.toArray()).filter((m) => !m.posterBlob && m.posterPath)
  for (const movie of missing) {
    const blob = await downloadPoster(movie.posterPath)
    if (blob) await db.movies.update(movie.tmdbId, { posterBlob: blob })
  }
}
