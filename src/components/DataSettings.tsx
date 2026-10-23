import { useRef, useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { displayGenres } from '../data/query'
import { applySnapshot, buildSnapshot, parseSnapshot, type Snapshot } from '../backup/github'
import { today } from '../data/collection'

type State =
  | { kind: 'idle' }
  | { kind: 'message'; text: string; error?: boolean }
  | { kind: 'import'; snapshot: Snapshot; confirmReplace?: boolean }

async function exportCollection(): Promise<void> {
  const snapshot = await buildSnapshot()
  const name = `movie-collection-${today()}.json`
  const file = new File([JSON.stringify(snapshot, null, 2)], name, { type: 'application/json' })
  // iOS: the share sheet lets you save to Files, AirDrop, etc.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DataSettings() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      setState({ kind: 'import', snapshot: parseSnapshot(await file.text()) })
    } catch {
      setState({ kind: 'message', text: t('data.invalid'), error: true })
    }
  }

  async function apply(snapshot: Snapshot, mode: 'merge' | 'replace') {
    await applySnapshot(snapshot, mode)
    // A file import always differs from the remote backup, so make sure it gets backed up.
    if (mode === 'replace') await applySnapshot(snapshot, 'merge')
    setState({ kind: 'message', text: t('data.importDone') })
  }

  return (
    <>
      <h2 class="group-title">{t('data.title')}</h2>
      <div class="group stack">
        <div class="button-list">
          <button class="btn" onClick={() => exportCollection().catch(() => {})}>
            {t('data.export')}
          </button>
          <button class="btn" onClick={() => fileInput.current?.click()}>
            {t('data.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              onFile(e.currentTarget.files?.[0])
              e.currentTarget.value = ''
            }}
          />
        </div>
        {state.kind === 'message' && <p class={state.error ? 'status error' : 'status ok'}>{state.text}</p>}
        {state.kind === 'import' && (
          <div class="restore-box">
            <p>{t('data.importFound').replace('{n}', tn('collection.count', state.snapshot.entries.length))}</p>
            {state.confirmReplace && <p class="status error">{t('backup.replaceConfirm')}</p>}
            <div class="row-buttons">
              <button class="btn" onClick={() => apply(state.snapshot, 'merge')}>
                {t('backup.merge')}
              </button>
              <button
                class="btn destructive"
                onClick={() =>
                  state.confirmReplace ? apply(state.snapshot, 'replace') : setState({ ...state, confirmReplace: true })
                }
              >
                {t('backup.replace')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export function Stats() {
  const data = useLiveQuery(async () => {
    const [entries, movies] = await Promise.all([db.entries.toArray(), db.movies.toArray()])
    return { entries, movies }
  })
  if (!data || data.entries.length === 0) return null

  const watched = data.entries.filter((e) => e.status === 'watched')
  const rated = watched.filter((e) => e.myRating !== undefined)
  const avg = rated.length ? rated.reduce((s, e) => s + e.myRating!, 0) / rated.length : undefined
  const watchedIds = new Set(watched.map((e) => e.tmdbId))
  const genreCounts = new Map<string, number>()
  for (const m of data.movies) {
    if (!watchedIds.has(m.tmdbId)) continue
    for (const g of displayGenres(m, lang.value)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
  }
  const top = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <>
      <h2 class="group-title">{t('stats.title')}</h2>
      <div class="group stats">
        <div class="stat">
          <b>{watched.length}</b>
          <span>{t('stats.watched')}</span>
        </div>
        <div class="stat">
          <b>{data.entries.length - watched.length}</b>
          <span>{t('stats.watchlist')}</span>
        </div>
        <div class="stat">
          <b>{avg !== undefined ? avg.toFixed(1) : '–'}</b>
          <span>{t('stats.avg')}</span>
        </div>
      </div>
      {top.length > 0 && (
        <p class="group-footer">
          {t('stats.topGenres')}: {top.map(([g, n]) => `${g} (${n})`).join(', ')}
        </p>
      )}
    </>
  )
}
