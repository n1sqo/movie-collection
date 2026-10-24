import { signal } from '@preact/signals'
import { t } from './i18n'
import { online } from './useOnline'
import { TabBar, type Tab } from './components/TabBar'
import { Search } from './screens/Search'
import { Collection } from './screens/Collection'
import { Me } from './screens/Me'
import { Options } from './screens/Settings'
import { MovieSheetHost } from './components/MovieSheet'
import { BackupBanner } from './components/BackupBanner'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'

export const tab = signal<Tab>('collection')
/** Where the search screen's close button returns to. */
let returnTab: Tab = 'collection'

export function goTo(next: Tab) {
  if (next === tab.value) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (next === 'search') returnTab = tab.value
  window.scrollTo(0, 0)
  tab.value = next
}

export function closeSearch() {
  goTo(returnTab)
}

export function App() {
  return (
    <div class="app">
      {!online.value && <div class="banner">{t('offline')}</div>}
      <UpdateBanner />
      <BackupBanner />
      <main class={tab.value === 'search' ? 'screen search-screen' : 'screen'}>
        {tab.value === 'search' && <Search />}
        {tab.value === 'collection' && <Collection />}
        {tab.value === 'me' && <Me />}
        {tab.value === 'options' && <Options />}
      </main>
      {tab.value !== 'search' && <TabBar active={tab.value} onChange={goTo} />}
      <MovieSheetHost />
      <ToastHost />
    </div>
  )
}
