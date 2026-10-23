import { signal } from '@preact/signals'
import { getSetting, setSetting } from './db'
import { lang, type Lang } from './i18n'

export const tmdbToken = signal('')

export async function loadSettings(): Promise<void> {
  const [savedLang, savedToken] = await Promise.all([
    getSetting<Lang>('lang'),
    getSetting<string>('tmdbToken')
  ])
  if (savedLang) lang.value = savedLang
  if (savedToken) tmdbToken.value = savedToken
  document.documentElement.lang = lang.value
}

export async function saveLang(next: Lang): Promise<void> {
  lang.value = next
  document.documentElement.lang = next
  await setSetting('lang', next)
}

export async function saveTmdbToken(token: string): Promise<void> {
  tmdbToken.value = token.trim()
  await setSetting('tmdbToken', tmdbToken.value)
}
