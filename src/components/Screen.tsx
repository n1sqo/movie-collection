import type { ComponentChildren } from 'preact'

export function Screen({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <section>
      <h1 class="large-title">{title}</h1>
      {children}
    </section>
  )
}
