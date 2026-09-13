// Simple in-memory cache utility for frequently accessed data
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<any>>();

export const cacheService = {
  get<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      cache.delete(key);
      return null;
    }

    return entry.data as T;
  },

  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  },

  clear(pattern?: string): void {
    if (!pattern) {
      cache.clear();
      return;
    }

    const regex = new RegExp(pattern);
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  },

  delete(key: string): void {
    cache.delete(key);
  },

  stats() {
    return {
      size: cache.size,
      keys: Array.from(cache.keys()),
    };
  },
};

export const withCache = async <T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs?: number
): Promise<T> => {
  const cached = cacheService.get<T>(key);
  if (cached) return cached;

  const data = await fn();
  cacheService.set(key, data, ttlMs);
  return data;
};
