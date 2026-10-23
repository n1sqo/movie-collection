import { signal } from '@preact/signals'
import uk from './uk.json'
import en from './en.json'

export type Lang = 'uk' | 'en'
type Dict = Record<string, unknown>

const dicts: Record<Lang, Dict> = { uk, en }

export const lang = signal<Lang>('uk')

export function t(key: string): string {
  let node: unknown = dicts[lang.value]
  for (const part of key.split('.')) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[part]
    else return key
  }
  return typeof node === 'string' ? node : key
}

/** Plural-aware lookup: `key` points to an object with Intl.PluralRules categories. */
export function tn(key: string, n: number): string {
  const rule = new Intl.PluralRules(lang.value).select(n)
  const text = t(`${key}.${rule}`)
  return (text === `${key}.${rule}` ? t(`${key}.other`) : text).replace('{n}', String(n))
}
