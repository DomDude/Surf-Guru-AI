import { z } from 'zod';
import { geocodeCache, withCache } from '@/lib/cache';
import type { SpotCoordinates } from './geocoding';

// Nominatim usage policy requires a descriptive User-Agent and max 1 req/sec.
// https://operations.osmfoundation.org/policies/nominatim/
const USER_AGENT = 'SurfGuruAI/1.0 (surf-guru-ai; contact via github)';
const MIN_INTERVAL_MS = 1000; // 1 req/sec hard limit

let lastNominatimCall = 0;

// ---------------------------------------------------------------------------
// Zod schema — Nominatim returns an array; we take the first result.
// lat/lon come back as strings, not numbers.
// ---------------------------------------------------------------------------

const NominatimResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
});

const NominatimResponseSchema = z.array(NominatimResultSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractName(displayName: string, query: string): string {
  // Nominatim display_name is a comma-joined hierarchy, e.g.:
  //   "Ribeira d'Ilhas, Ericeira, Mafra, Lisboa, Portugal"
  // Take the first segment if it's meaningful; fall back to the raw query.
  const first = displayName.split(',')[0].trim();
  return first.length > 2 ? first : query;
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Geocode a location string via Nominatim (OpenStreetMap).
 *
 * Rate-limited to 1 req/sec (Nominatim policy). Results are cached for 24 h
 * (same TTL as the Gemini geocoder) to avoid hammering the free service.
 *
 * Returns null when the query returns no results or the response fails
 * validation. The caller (Task 2C.3 smart chain) falls back to Gemini.
 */
export async function geocodeNominatim(query: string): Promise<SpotCoordinates | null> {
  const cacheKey = `nominatim:${query.toLowerCase().trim()}`;

  return withCache(geocodeCache, cacheKey, async () => {
    // Enforce 1 req/sec — if the last call was < 1s ago, wait the remainder.
    const now = Date.now();
    const elapsed = now - lastNominatimCall;
    if (elapsed < MIN_INTERVAL_MS) {
      await wait(MIN_INTERVAL_MS - elapsed);
    }
    lastNominatimCall = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en',
        },
      });
    } catch (err) {
      console.error('geocodeNominatim: network error', err);
      return null;
    }

    if (!res.ok) {
      console.error(`geocodeNominatim: HTTP ${res.status} for "${query}"`);
      return null;
    }

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (err) {
      console.error('geocodeNominatim: JSON parse error', err);
      return null;
    }

    const parsed = NominatimResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`geocodeNominatim: schema mismatch for "${query}"`, parsed.error.issues);
      return null;
    }

    if (parsed.data.length === 0) {
      console.log(`geocodeNominatim: no results for "${query}"`);
      return null;
    }

    const result = parsed.data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Sanity check — reject Null Island and out-of-range values.
    if (
      isNaN(lat) || isNaN(lon) ||
      lat < -90 || lat > 90 ||
      lon < -180 || lon > 180 ||
      (lat === 0 && lon === 0)
    ) {
      console.error(`geocodeNominatim: invalid coordinates for "${query}": ${lat}, ${lon}`);
      return null;
    }

    return {
      name: extractName(result.display_name, query),
      latitude: lat,
      longitude: lon,
    };
  });
}
