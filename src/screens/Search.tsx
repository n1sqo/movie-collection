import { t } from '../i18n'
import { Screen } from '../components/Screen'

export function Search() {
  return (
    <Screen title={t('titles.search')}>
      <p class="empty">{t('placeholder.soon')}</p>
    </Screen>
  )
}
