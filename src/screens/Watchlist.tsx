import { t } from '../i18n'
import { Screen } from '../components/Screen'

export function Watchlist() {
  return (
    <Screen title={t('titles.watchlist')}>
      <p class="empty">{t('placeholder.soon')}</p>
    </Screen>
  )
}
