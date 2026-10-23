import { t } from '../i18n'

export type Tab = 'search' | 'collection' | 'watchlist' | 'settings'

const icons: Record<Tab, string> = {
  search:
    'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
  collection: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  watchlist: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z',
  settings:
    'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm-1.2-6h2.4l.5 2.6 1.8.8 2.2-1.5 1.7 1.7-1.5 2.2.8 1.8 2.6.5v2.4l-2.6.5-.8 1.8 1.5 2.2-1.7 1.7-2.2-1.5-1.8.8-.5 2.6h-2.4l-.5-2.6-1.8-.8-2.2 1.5-1.7-1.7 1.5-2.2-.8-1.8-2.6-.5v-2.4l2.6-.5.8-1.8-1.5-2.2 1.7-1.7 2.2 1.5 1.8-.8.5-2.6Z'
}

const order: Tab[] = ['search', 'collection', 'watchlist', 'settings']

export function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav class="tabbar" aria-label="Tabs">
      {order.map((tab) => (
        <button
          key={tab}
          class={tab === active ? 'tab active' : 'tab'}
          aria-current={tab === active ? 'page' : undefined}
          onClick={() => onChange(tab)}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d={icons[tab]} fill="currentColor" fill-rule="evenodd" />
          </svg>
          <span>{t(`tabs.${tab}`)}</span>
        </button>
      ))}
    </nav>
  )
}
