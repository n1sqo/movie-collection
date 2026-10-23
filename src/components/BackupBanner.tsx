import { useState } from 'preact/hooks'
import { t } from '../i18n'
import { backupStatus } from '../backup/github'
import { goTo, tab } from '../app'

const SERIOUS = ['unauthorized', 'forbidden', 'notFound', 'invalid']

/** Shown once per error kind when the auto-backup hits a problem the user has to fix. */
export function BackupBanner() {
  const [dismissed, setDismissed] = useState<string>()
  const status = backupStatus.value
  if (status.state !== 'error' || !SERIOUS.includes(status.kind) || dismissed === status.kind) return null
  if (tab.value === 'me') return null
  return (
    <div class="banner error-banner">
      <span>{t('backup.banner').replace('{error}', t(`backup.errors.${status.kind}`))}</span>
      <button class="banner-link" onClick={() => goTo('me')}>
        {t('backup.openSettings')}
      </button>
      <button class="banner-close" aria-label="close" onClick={() => setDismissed(status.kind)}>
        ×
      </button>
    </div>
  )
}
