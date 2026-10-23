import { useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import {
  applySnapshot,
  backupNow,
  backupStatus,
  BackupError,
  checkConnection,
  fetchBackup,
  githubConfig,
  hasUnsavedChanges,
  isConfigured,
  lastBackupAt,
  saveGithubConfig,
  type Snapshot
} from '../backup/github'

type Action =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'message'; text: string; error?: boolean }
  | { kind: 'restore'; snapshot: Snapshot; confirmReplace?: boolean }

const errorText = (err: unknown) => t(`backup.errors.${err instanceof BackupError ? err.kind : 'network'}`)

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(lang.value === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function BackupSettings() {
  const [form, setForm] = useState(githubConfig.value)
  const [action, setAction] = useState<Action>({ kind: 'idle' })
  const dirtyForm =
    form.owner.trim() !== githubConfig.value.owner ||
    form.repo.trim() !== githubConfig.value.repo ||
    form.token.trim() !== githubConfig.value.token
  const ready = isConfigured({ owner: form.owner.trim(), repo: form.repo.trim(), token: form.token.trim() })

  async function run(label: string, task: () => Promise<Action | void>) {
    setAction({ kind: 'busy', label })
    try {
      if (dirtyForm) await saveGithubConfig(form)
      setAction((await task()) ?? { kind: 'idle' })
    } catch (err) {
      setAction({ kind: 'message', text: errorText(err), error: true })
    }
  }

  const status = backupStatus.value
  const statusLine =
    status.state === 'running'
      ? t('backup.running')
      : status.state === 'error'
        ? t(`backup.errors.${status.kind}`)
        : hasUnsavedChanges.value && isConfigured()
          ? t('backup.unsaved')
          : lastBackupAt.value
            ? t('backup.last').replace('{date}', formatDateTime(lastBackupAt.value))
            : isConfigured()
              ? t('backup.never')
              : t('backup.notConfigured')

  const field = (key: 'owner' | 'repo' | 'token', label: string, type: 'text' | 'password' = 'text') => (
    <label class="field">
      <span>{label}</span>
      <input
        type={type as 'text'}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        value={form[key]}
        onInput={(e) => setForm({ ...form, [key]: e.currentTarget.value })}
      />
    </label>
  )

  return (
    <>
      <h2 class="group-title">{t('backup.title')}</h2>
      <div class="group stack">
        {field('owner', t('backup.owner'))}
        {field('repo', t('backup.repo'))}
        {field('token', t('backup.token'), 'password')}
        {dirtyForm && (
          <button class="btn" disabled={!ready} onClick={() => run(t('backup.save'), () => saveGithubConfig(form))}>
            {t('backup.save')}
          </button>
        )}
        <div class={status.state === 'error' ? 'status error' : 'status muted'}>{statusLine}</div>
        <div class="button-list">
          <button
            class="btn"
            disabled={!ready || action.kind === 'busy'}
            onClick={() =>
              run(t('backup.checking'), async () => {
                await checkConnection()
                return { kind: 'message', text: t('backup.connected') }
              })
            }
          >
            {t('backup.check')}
          </button>
          <button
            class="btn"
            disabled={!ready || action.kind === 'busy'}
            onClick={() => run(t('backup.running'), () => backupNow())}
          >
            {t('backup.backupNow')}
          </button>
          <button
            class="btn"
            disabled={!ready || action.kind === 'busy'}
            onClick={() => run(t('backup.checking'), async () => ({ kind: 'restore', snapshot: await fetchBackup() }))}
          >
            {t('backup.restore')}
          </button>
        </div>
        {action.kind === 'busy' && <p class="status muted">{action.label}</p>}
        {action.kind === 'message' && <p class={action.error ? 'status error' : 'status ok'}>{action.text}</p>}
        {action.kind === 'restore' && (
          <div class="restore-box">
            <p>{t('backup.restoreFound').replace('{n}', tn('collection.count', action.snapshot.entries.length))}</p>
            {action.confirmReplace && <p class="status error">{t('backup.replaceConfirm')}</p>}
            <div class="row-buttons">
              <button
                class="btn"
                onClick={() =>
                  run(t('backup.running'), async () => {
                    await applySnapshot(action.snapshot, 'merge')
                    return { kind: 'message', text: t('backup.restoreDone') }
                  })
                }
              >
                {t('backup.merge')}
              </button>
              <button
                class="btn destructive"
                onClick={() =>
                  action.confirmReplace
                    ? run(t('backup.running'), async () => {
                        await applySnapshot(action.snapshot, 'replace')
                        return { kind: 'message', text: t('backup.restoreDone') }
                      })
                    : setAction({ ...action, confirmReplace: true })
                }
              >
                {t('backup.replace')}
              </button>
            </div>
          </div>
        )}
      </div>
      <p class="group-footer">{t('backup.tokenHint')}</p>
    </>
  )
}
