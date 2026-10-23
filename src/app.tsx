import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { t } from './i18n'
import { TabBar, type Tab } from './components/TabBar'
import { Search } from './screens/Search'
import { Collection } from './screens/Collection'
import { Watchlist } from './screens/Watchlist'
import { Settings } from './screens/Settings'

const tab = signal<Tab>('collection')
const online = signal(navigator.onLine)

export function App() {
  useEffect(() => {
    const update = () => (online.value = navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return (
    <div class="app">
      {!online.value && <div class="banner">{t('offline')}</div>}
      <main class="screen">
        {tab.value === 'search' && <Search />}
        {tab.value === 'collection' && <Collection />}
        {tab.value === 'watchlist' && <Watchlist />}
        {tab.value === 'settings' && <Settings />}
      </main>
      <TabBar active={tab.value} onChange={(next) => (tab.value = next)} />
    </div>
  )
}
