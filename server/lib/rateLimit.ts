/** Einfacher In-Memory-Begrenzer (eine Instanz = ein Prozess, das reicht). Größe ist gedeckelt. */
const MAX_KEYS = 50_000
const buckets = new Map<string, { count: number; reset: number }>()

export function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const k = key.slice(0, 200)
  const b = buckets.get(k)
  if (!b || b.reset < now) {
    if (buckets.size >= MAX_KEYS) {
      // Älteste Einträge verwerfen (Map behält die Einfügereihenfolge)
      for (const old of buckets.keys()) {
        buckets.delete(old)
        if (buckets.size < MAX_KEYS * 0.9) break
      }
    }
    buckets.set(k, { count: 1, reset: now + windowMs })
    return true
  }
  b.count++
  return b.count <= limit
}

export function clear(key: string) {
  buckets.delete(key.slice(0, 200))
}

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k)
}, 60_000).unref()
