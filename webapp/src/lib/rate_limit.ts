/**
 * In-memory token-bucket rate limiter, keyed by IP.
 * Limit: 20 requests per 5-minute window per IP.
 * Replace the store with Upstash Redis in Phase 5 (Task 5C.2) for multi-instance safety.
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS = 20;

interface BucketEntry {
  count: number;
  windowStart: number;
}

// Module-level store — persists for the lifetime of the Node.js process.
const buckets = new Map<string, BucketEntry>();

/**
 * Returns `true` if the request is allowed, `false` if it should be rejected (429).
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = buckets.get(ip);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // First request in this window (or window expired — start fresh).
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * How many seconds remain until the current window resets for this IP.
 * Used to populate the Retry-After header on 429 responses.
 */
export function retryAfterSeconds(ip: string): number {
  const entry = buckets.get(ip);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.windowStart;
  return Math.ceil((WINDOW_MS - elapsed) / 1000);
}
