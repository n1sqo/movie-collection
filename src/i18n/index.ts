import { signal } from '@preact/signals'
import uk from './uk.json'
import en from './en.json'

export type Lang = 'uk' | 'en'
type Dict = typeof uk

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
