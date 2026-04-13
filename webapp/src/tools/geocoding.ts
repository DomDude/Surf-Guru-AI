import { z } from 'zod';

export interface SpotCoordinates {
  name: string;
  latitude: number;
  longitude: number;
}

// Zod schema for the JSON Gemini is instructed to return.
// Range checks catch obviously wrong coordinates; the (0, 0) refinement
// rejects "Null Island" — Gemini's known fallback when it can't geocode.
const GeocodeResponseSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).refine(
  (d) => !(d.latitude === 0 && d.longitude === 0),
  { message: 'coordinates are (0, 0) — Gemini fallback for unknown location' }
);

/**
 * Deterministic tool to convert a surf spot or location string into exact coordinates.
 * We use Gemini to act as a Geocoding Agent for surf spots since standard Geocoding APIs
 * don't usually know about specific surf breaks like "Pipeline" or "Teahupoo".
 */
export async function geocodeLocation(locationQuery: string): Promise<SpotCoordinates | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Geocoding failed: Missing GEMINI_API_KEY");
    return null;
  }

  const prompt = `
You are a precision Geography and Surf Spot coordinate locator.
The user is asking for the coordinates of this location or surf spot: "${locationQuery}"
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
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!res.ok) {
      console.error("Geocoding REST API Error:", await res.text());
      return null;
    }

    const jsonFormat = await res.json();
    let txt = jsonFormat.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Safety Net
    txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim();

    console.log("geocodeLocation raw response:", txt);

    const raw = JSON.parse(txt);

    // Gemini returns { "error": "not found" } for unknown spots.
    if (raw.error) {
      console.log(`geocodeLocation: Gemini returned error for "${locationQuery}":`, raw.error);
      return null;
    }

    // Validate shape and coordinate sanity. Log failures so we can grow the
    // gazetteer with spots that trip this (Phase 2 task 2C.3).
    // TODO(2C.3): cross-check against Nominatim before accepting Gemini coordinates.
    const result = GeocodeResponseSchema.safeParse({
      name: raw.name,
      latitude: typeof raw.latitude === 'number' ? raw.latitude : parseFloat(raw.latitude),
      longitude: typeof raw.longitude === 'number' ? raw.longitude : parseFloat(raw.longitude),
    });

    if (!result.success) {
      console.error(`geocodeLocation: invalid coordinates for "${locationQuery}":`, result.error.issues);
      return null;
    }

    return result.data;
  } catch (err) {
    console.error("Geocoding agent error:", err);
    return null;
  }
}
