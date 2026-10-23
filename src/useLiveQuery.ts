import { liveQuery } from 'dexie'
import { useEffect, useState } from 'preact/hooks'

/** Minimal Preact version of dexie-react-hooks' useLiveQuery. */
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>()
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: () => {} })
    return () => sub.unsubscribe()
  }, deps)
  return value
}
