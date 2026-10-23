import { t } from '../i18n'
import { Screen } from '../components/Screen'

export function Collection() {
  return (
    <Screen title={t('titles.collection')}>
      <p class="empty">{t('placeholder.soon')}</p>
    </Screen>
  )
}
