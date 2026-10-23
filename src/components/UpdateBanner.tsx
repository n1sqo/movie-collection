import { t } from '../i18n'
import { reloadToUpdate, updateReady } from '../update'

export function UpdateBanner() {
  if (!updateReady.value) return null
  return (
    <div class="banner update-banner">
      <span>{t('update.available')}</span>
      <button class="banner-link" onClick={reloadToUpdate}>
        {t('update.reload')}
      </button>
    </div>
  )
}
