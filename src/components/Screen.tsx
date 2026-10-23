import type { ComponentChildren } from 'preact'

export function Screen({
  title,
  action,
  children
}: {
  title: string
  action?: ComponentChildren
  children?: ComponentChildren
}) {
  return (
    <section>
      <div class="screen-header">
        <h1 class="large-title">{title}</h1>
        {action}
      </div>
      {children}
    </section>
  )
}
