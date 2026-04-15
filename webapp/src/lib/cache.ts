/**
 * Simple map-based LRU cache with TTL.
 *
 * Map insertion order is used for LRU tracking — the oldest (least recently
 * used) entry sits at the front; every get/set moves an entry to the back.
 *
 * Phase 5 replaces this with Upstash Redis (Task 2D.3) behind the same
 * `withCache` interface, so callers don't need to change.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly map: Map<string, CacheEntry<T>>;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // Refresh LRU position.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict least recently used (first key in insertion order).
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) this.map.delete(lruKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton caches — one per data type, sized for expected load.
// ---------------------------------------------------------------------------

const FORECAST_TTL_MS = 30 * 60 * 1000;   // 30 min — conditions change faster than tides
const GEOCODE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 h — coordinates don't move

// Keyed by `lat:lon:hour` (hour = ISO-8601 hour string in UTC).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const forecastCache = new LRUCache<any>(200, FORECAST_TTL_MS);

// Keyed by the normalised location string (lower-cased, trimmed).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const geocodeCache  = new LRUCache<any>(500, GEOCODE_TTL_MS);

// ---------------------------------------------------------------------------
// Cache-through helper
// ---------------------------------------------------------------------------

/**
 * Returns the cached value for `key` if present and unexpired; otherwise
 * calls `fn`, stores the result (unless null), and returns it.
 */
export async function withCache<T>(
  cache: LRUCache<T>,
  key: string,
  fn: () => Promise<T | null>,
): Promise<T | null> {
  const hit = cache.get(key);
  if (hit !== null) return hit;
  const result = await fn();
  if (result !== null) cache.set(key, result);
  return result;
}
