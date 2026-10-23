import { signal } from '@preact/signals'
import { t } from './i18n'
import { online } from './useOnline'
import { TabBar, type Tab } from './components/TabBar'
import { Search } from './screens/Search'
import { Collection } from './screens/Collection'
import { Watchlist } from './screens/Watchlist'
import { Settings } from './screens/Settings'
import { MovieSheetHost } from './components/MovieSheet'
import { BackupBanner } from './components/BackupBanner'

export const tab = signal<Tab>('collection')

export function App() {
  return (
    <div class="app">
      {!online.value && <div class="banner">{t('offline')}</div>}
      <BackupBanner />
      <main class="screen">
        {tab.value === 'search' && <Search />}
        {tab.value === 'collection' && <Collection />}
        {tab.value === 'watchlist' && <Watchlist />}
        {tab.value === 'settings' && <Settings />}
      </main>
      <TabBar active={tab.value} onChange={(next) => (tab.value = next)} />
      <MovieSheetHost />
    </div>
  )
}
