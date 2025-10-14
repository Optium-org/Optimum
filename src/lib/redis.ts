// Lightweight in-memory stubs to avoid external Upstash Redis in dev
// If you later want real Redis, restore the previous implementation.

const memorySet = new Set<string>()

export const redis = {
  async sadd(key: string, value: string) {
    const composite = `${key}:${value}`
    const had = memorySet.has(composite)
    if (!had) memorySet.add(composite)
    // Upstash returns 1 when added, 0 when existed
    return had ? 0 : 1
  },
  async scard(prefix: string) {
    // Count unique entries for the given key prefix
    let count = 0
    for (const item of memorySet) {
      if (item.startsWith(prefix + ":")) count++
    }
    return count
  },
}

export const ratelimit = {
  async limit(_ip: string) {
    // Always allow in dev stub
    return { success: true }
  },
}
