import { effect, signal } from '@preact/signals'
import { db, getSetting, setSetting, type Entry, type Movie, type Tombstone } from '../db'
import { changeCounter, markChanged } from '../data/collection'
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
  /** Removals, so other devices and merges don't bring them back. Absent in older backups. */
  deleted?: Tombstone[]
}

export type BackupErrorKind = 'unauthorized' | 'forbidden' | 'notFound' | 'network' | 'conflict' | 'server' | 'invalid'

export class BackupError extends Error {
  constructor(public kind: BackupErrorKind) {
    super(kind)
  }
}

export type BackupStatus =
  { state: 'idle' } | { state: 'running' } | { state: 'ok' } | { state: 'error'; kind: BackupErrorKind }

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

async function gh(
  config: GithubConfig,
  path: string,
  init: RequestInit = {},
  accept = 'application/vnd.github+json'
): Promise<Response> {
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

interface RemoteFile {
  sha: string
  snapshot: Snapshot
}

/** Reads collection.json with its sha; undefined when the file doesn't exist yet. */
async function readRemote(config: GithubConfig): Promise<RemoteFile | undefined> {
  const res = await gh(config, contentsPath(config))
  if (res.status === 404) {
    // Either the file doesn't exist yet or the repo is unreachable; tell them apart.
    await checkConnection(config)
    return undefined
  }
  if (!res.ok) throw new BackupError('server')
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string }
  // Files over 1 MB come back without inline content; fetch those raw.
  const text =
    meta.encoding === 'base64' && meta.content
      ? fromBase64(meta.content)
      : await (await gh(config, contentsPath(config), {}, 'application/vnd.github.raw+json')).text()
  return { sha: meta.sha, snapshot: parseSnapshot(text) }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [movies, entries, deleted] = await Promise.all([
    db.movies.toArray(),
    db.entries.toArray(),
    db.deleted.toArray()
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    movies: movies.map(({ posterBlob: _blob, ...m }) => m),
    entries,
    deleted
  }
}

/** Compact JSON keeps the file about a third smaller than an indented one. */
export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot)
}

function commitMessage(snapshot: Snapshot): string {
  const d = new Date(snapshot.exportedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `Backup: ${date}, ${pluralUk(snapshot.entries.length, 'фільм', 'фільми', 'фільмів')}`
}

export function pluralUk(n: number, one: string, few: string, many: string): string {
  const rule = new Intl.PluralRules('uk').select(n)
  return `${n} ${rule === 'one' ? one : rule === 'few' ? few : many}`
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
      let snapshot: Snapshot
      for (let attempt = 0; ; attempt++) {
        const remote = await readRemote(config)
        const knownSha = await getSetting<string>('lastBackupSha')
        // Another device wrote since our last backup: fold its changes in first.
        if (remote && remote.sha !== knownSha) await mergeIntoLocal(remote.snapshot)
        snapshot = await buildSnapshot()
        try {
          const res = await gh(config, contentsPath(config), {
            method: 'PUT',
            body: JSON.stringify({
              message: commitMessage(snapshot),
              content: toBase64(serializeSnapshot(snapshot)),
              ...(remote ? { sha: remote.sha } : {})
            })
          })
          if (res.status === 404) throw new BackupError('notFound')
          if (!res.ok) throw new BackupError('server')
          const written = (await res.json()) as { content?: { sha?: string } }
          if (written.content?.sha) await setSetting('lastBackupSha', written.content.sha)
          break
        } catch (err) {
          // The file moved between our read and write: read, merge and try again.
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
    // Reading the signal subscribes this effect to collection changes.
    void changeCounter.value
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
 * Folds a snapshot into the local collection: per movie the newest change wins,
 * and a removal newer than the last edit keeps the movie removed.
 */
async function mergeIntoLocal(snapshot: Snapshot): Promise<void> {
  await db.transaction('rw', db.movies, db.entries, db.deleted, async () => {
    const localEntries = new Map((await db.entries.toArray()).map((e) => [e.tmdbId, e]))
    const tombstones = new Map((await db.deleted.toArray()).map((d) => [d.tmdbId, d]))
    for (const d of snapshot.deleted ?? []) {
      const local = tombstones.get(d.tmdbId)
      if (!local || local.deletedAt < d.deletedAt) tombstones.set(d.tmdbId, d)
    }
    const remoteEntries = new Map(snapshot.entries.map((e) => [e.tmdbId, e]))
    const remoteMovies = new Map(snapshot.movies.map((m) => [m.tmdbId, m]))
    const ids = new Set([...localEntries.keys(), ...remoteEntries.keys(), ...tombstones.keys()])

    for (const id of ids) {
      const local = localEntries.get(id)
      const remote = remoteEntries.get(id)
      const newest = !local ? remote : !remote ? local : remote.updatedAt > local.updatedAt ? remote : local
      const tomb = tombstones.get(id)
      if (tomb && (!newest || tomb.deletedAt >= newest.updatedAt)) {
        if (local) {
          await db.entries.delete(id)
          await db.movies.delete(id)
        }
        await db.deleted.put(tomb)
        continue
      }
      if (tomb) await db.deleted.delete(id)
      if (!newest) continue
      if (newest !== local) await db.entries.put(newest)
      const remoteMovie = remoteMovies.get(id)
      if (remoteMovie && !(await db.movies.get(id))) await db.movies.put(remoteMovie)
    }
  })
}

/**
 * Applies a snapshot from GitHub or a file. 'replace' makes the device match it exactly;
 * 'merge' combines both sides. Posters are downloaded afterwards in the background.
 */
export async function applySnapshot(
  snapshot: Snapshot,
  mode: 'merge' | 'replace',
  options: { markDirty?: boolean } = {}
): Promise<void> {
  if (mode === 'replace') {
    await db.transaction('rw', db.movies, db.entries, db.deleted, async () => {
      // Keep posters already on the device so they don't need downloading again.
      const posters = new Map((await db.movies.toArray()).map((m) => [m.tmdbId, m.posterBlob]))
      await Promise.all([db.entries.clear(), db.movies.clear(), db.deleted.clear()])
      await db.movies.bulkPut(snapshot.movies.map((m) => ({ ...m, posterBlob: posters.get(m.tmdbId) })))
      await db.entries.bulkPut(snapshot.entries)
      await db.deleted.bulkPut(snapshot.deleted ?? [])
    })
  } else {
    await mergeIntoLocal(snapshot)
  }
  // A merge can differ from the backup, and a file import always may: push the result.
  if (mode === 'merge' || options.markDirty) await markChanged()
  void fillMissingPosters()
}

export async function fillMissingPosters(): Promise<void> {
  const missing = (await db.movies.toArray()).filter((m) => !m.posterBlob && m.posterPath)
  for (const movie of missing) {
    const blob = await downloadPoster(movie.posterPath)
    if (blob) await db.movies.update(movie.tmdbId, { posterBlob: blob })
  }
}
