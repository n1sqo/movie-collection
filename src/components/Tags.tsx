import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { db, type Entry } from '../db'
import { updateEntry } from '../data/collection'
import { useLiveQuery } from '../useLiveQuery'

/** The list chosen in the collection chips; shared by «Бачив» and «Подивитись». */
export const activeTag = signal('')

/** Every list in use, most used first. */
function useAllTags(): string[] {
  return (
    useLiveQuery(async () => {
      const counts = new Map<string, number>()
      for (const e of await db.entries.toArray())
        for (const tag of e.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag)
    }) ?? []
  )
}

/** Quick-filter chips for the collection's chip row. */
export function TagChips() {
  const tags = useAllTags()
  const active = activeTag.value
  // A list that no movie has any more stops filtering.
  useEffect(() => {
    if (active && !tags.includes(active)) activeTag.value = ''
  }, [active, tags.join('\n')])
  return (
    <>
      {tags.map((tag) => (
        <button
          key={tag}
          class={active === tag ? 'chip tag-chip on' : 'chip tag-chip'}
          aria-pressed={active === tag}
          onClick={() => (activeTag.value = active === tag ? '' : tag)}
        >
          {tag}
        </button>
      ))}
    </>
  )
}

/** «Списки» in the movie sheet: tap a list to add or remove the movie, or make a new one. */
export function TagEditor({ entry }: { entry: Entry }) {
  const all = useAllTags()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const mine = entry.tags ?? []
  const tags = [...new Set([...all, ...mine])]

  const save = (next: string[]) => updateEntry(entry.tmdbId, { tags: next.length ? next : undefined })
  const toggle = (tag: string) => save(mine.includes(tag) ? mine.filter((x) => x !== tag) : [...mine, tag])
  const add = () => {
    const tag = name.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (tag && !mine.includes(tag)) save([...mine, tag])
    setName('')
    setAdding(false)
  }

  return (
    <section class="tag-editor">
      <div class="entry-label">{t('tags.title')}</div>
      <div class="chip-row wrap">
        {tags.map((tag) => (
          <button
            key={tag}
            class={mine.includes(tag) ? 'chip tag-chip on' : 'chip tag-chip'}
            aria-pressed={mine.includes(tag)}
            onClick={() => toggle(tag)}
          >
            {tag}
          </button>
        ))}
        {adding ? (
          <form
            class="tag-form"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={30}
              placeholder={t('tags.placeholder')}
              aria-label={t('tags.new')}
              onInput={(e) => setName(e.currentTarget.value)}
              onBlur={add}
            />
          </form>
        ) : (
          <button class="chip add-tag" onClick={() => setAdding(true)}>
            + {t('tags.new')}
          </button>
        )}
      </div>
      {tags.length === 0 && !adding && <p class="hint">{t('tags.hint')}</p>}
    </section>
  )
}
