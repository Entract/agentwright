import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'

/** Runs a database query and re-runs it whenever the data it read changes. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: (err) => console.error('Database query failed', err),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
