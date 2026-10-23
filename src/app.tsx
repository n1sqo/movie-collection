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
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'

export const tab = signal<Tab>('collection')

export function App() {
  return (
    <div class="app">
      {!online.value && <div class="banner">{t('offline')}</div>}
      <UpdateBanner />
      <BackupBanner />
      <main class="screen">
        {tab.value === 'search' && <Search />}
        {tab.value === 'collection' && <Collection />}
        {tab.value === 'watchlist' && <Watchlist />}
        {tab.value === 'settings' && <Settings />}
      </main>
      <TabBar
        active={tab.value}
        onChange={(next) => {
          if (next === tab.value) window.scrollTo({ top: 0, behavior: 'smooth' })
          else window.scrollTo(0, 0)
          tab.value = next
        }}
      />
      <MovieSheetHost />
      <ToastHost />
    </div>
  )
}
