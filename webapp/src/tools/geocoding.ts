import { z } from 'zod';
import { geocodeNominatim } from './geocode_nominatim';
import gazetteer from '../data/gazetteer.json';

export interface SpotCoordinates {
  name: string;
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// Zod schema for Gemini geocoder response
// ---------------------------------------------------------------------------

const GeocodeResponseSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).refine(
  (d) => !(d.latitude === 0 && d.longitude === 0),
  { message: 'coordinates are (0, 0) — Gemini fallback for unknown location' }
);

// ---------------------------------------------------------------------------
// Haversine distance in km
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Step 1 — Gazetteer lookup
// Exact or alias match, case-insensitive. O(n) over 50 spots is fine.
// ---------------------------------------------------------------------------

type GazetteerSpot = typeof gazetteer[number];

function lookupGazetteer(query: string): SpotCoordinates | null {
  const q = query.toLowerCase().trim();
  const match = (gazetteer as GazetteerSpot[]).find((spot) => {
    if (spot.name.toLowerCase() === q) return true;
    return spot.aliases.some((alias) => alias.toLowerCase() === q);
  });
  if (!match) return null;
  return { name: match.name, latitude: match.lat, longitude: match.lon };
}

// ---------------------------------------------------------------------------
// Step 3 — Gemini geocoder (last resort)
// TODO(2C.3): Nominatim cross-check is implemented below.
// ---------------------------------------------------------------------------

async function geocodeWithGemini(query: string): Promise<SpotCoordinates | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('geocodeWithGemini: missing GEMINI_API_KEY');
    return null;
  }

  const prompt = `
You are a precision Geography and Surf Spot coordinate locator.
The user is asking for the coordinates of this location or surf spot: "${query}"
Respond ONLY with a valid JSON object representing the location. Do NOT wrap it in markdown blocks.
Format:
{
  "name": "Formatted Name, Region/Country",
  "latitude": 12.3456,
  "longitude": -12.3456
}

If the spot is completely unknown or fictitious, return { "error": "not found" }.
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) {
      console.error('geocodeWithGemini: HTTP error', await res.text());
      return null;
    }

    const json = await res.json();
    let txt: string = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim();

    const raw = JSON.parse(txt);
    if (raw.error) {
      console.log(`geocodeWithGemini: not found for "${query}":`, raw.error);
      return null;
    }

    const result = GeocodeResponseSchema.safeParse({
      name: raw.name,
      latitude:  typeof raw.latitude  === 'number' ? raw.latitude  : parseFloat(raw.latitude),
      longitude: typeof raw.longitude === 'number' ? raw.longitude : parseFloat(raw.longitude),
    });

    if (!result.success) {
      console.error(`geocodeWithGemini: invalid coordinates for "${query}":`, result.error.issues);
      return null;
    }

    return result.data;
  } catch (err) {
    console.error('geocodeWithGemini: error', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Smart geocoding chain
// Order: gazetteer → Nominatim → Gemini + Nominatim cross-check
// ---------------------------------------------------------------------------

const CROSS_CHECK_THRESHOLD_KM = 5;

/**
 * Resolve a surf spot or location string to coordinates.
 *
 * Chain:
 *   1. Gazetteer — hand-verified spots, instant, no network.
 *   2. Nominatim — OSM geocoder, good for towns and well-known spots.
 *   3. Gemini — AI fallback for obscure breaks, cross-checked against
 *      Nominatim. If Nominatim returns a result that disagrees by >5 km,
 *      the Gemini result is rejected and logged for gazetteer growth.
 *
 * Returns null when all three sources fail.
 */
export async function geocodeLocation(locationQuery: string): Promise<SpotCoordinates | null> {
  const query = locationQuery.trim();

  // --- 1. Gazetteer ---
  const gazetteered = lookupGazetteer(query);
  if (gazetteered) {
    console.log(`geocodeLocation: gazetteer hit for "${query}" → ${gazetteered.name}`);
    return gazetteered;
  }

  // --- 2. Nominatim ---
  const nominatim = await geocodeNominatim(query);
  if (nominatim) {
    console.log(`geocodeLocation: Nominatim hit for "${query}" → ${nominatim.name}`);
    return nominatim;
  }

  // --- 3. Gemini + cross-check ---
  console.log(`geocodeLocation: falling back to Gemini for "${query}"`);
  const gemini = await geocodeWithGemini(query);
  if (!gemini) return null;

  // Cross-check: query Nominatim with the name Gemini returned.
  // If Nominatim returns a result that's far from Gemini's coords, reject.
  // If Nominatim returns nothing (obscure break not in OSM), accept with a warning.
  const crossCheck = await geocodeNominatim(gemini.name);
  if (crossCheck) {
    const dist = haversineKm(gemini.latitude, gemini.longitude, crossCheck.latitude, crossCheck.longitude);
    if (dist > CROSS_CHECK_THRESHOLD_KM) {
      console.error(
        `geocodeLocation: Gemini/Nominatim mismatch for "${query}" — ` +
        `Gemini: (${gemini.latitude}, ${gemini.longitude}), ` +
        `Nominatim: (${crossCheck.latitude}, ${crossCheck.longitude}), ` +
        `dist: ${dist.toFixed(1)} km — rejecting. Add to gazetteer.`
      );
      return null;
    }
    console.log(`geocodeLocation: Gemini cross-check passed for "${query}" (${dist.toFixed(1)} km delta)`);
  } else {
    // Nominatim doesn't know this spot — can't verify, but can't disprove either.
    // Accept and log so we can grow the gazetteer.
    console.warn(
      `geocodeLocation: Gemini result for "${query}" unverifiable by Nominatim — ` +
      `accepting (${gemini.latitude}, ${gemini.longitude}). Consider adding to gazetteer.`
    );
  }

  return gemini;
}
