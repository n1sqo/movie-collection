import { t } from '../i18n'

export type Tab = 'collection' | 'me' | 'options' | 'search'

const icons: Record<Exclude<Tab, 'search'>, preact.JSX.Element> = {
  collection: (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
    </svg>
  ),
  me: (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  options: (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  )
}

export const searchIcon = (size = 24) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
)

/** Floating pill with the three sections, plus the search button under the thumb. */
export function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav class="tabbar" aria-label={t('tabs.label')}>
      <div class="tab-pill">
        {(['collection', 'me', 'options'] as const).map((tab) => (
          <button
            key={tab}
            class={tab === active ? 'tab active' : 'tab'}
            aria-current={tab === active ? 'page' : undefined}
            onClick={() => onChange(tab)}
          >
            {icons[tab]}
            <span>{t(`tabs.${tab}`)}</span>
          </button>
        ))}
      </div>
      <button class="search-fab" aria-label={t('tabs.search')} onClick={() => onChange('search')}>
        {searchIcon()}
      </button>
    </nav>
  )
}
