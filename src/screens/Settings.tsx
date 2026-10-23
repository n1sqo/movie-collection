import { t } from '../i18n'
import { Screen } from '../components/Screen'

export function Settings() {
  return (
    <Screen title={t('titles.settings')}>
      <p class="empty">{t('placeholder.soon')}</p>
    </Screen>
  )
}
