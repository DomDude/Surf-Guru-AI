export interface SpotCoordinates {
  name: string;
  latitude: number;
  longitude: number;
}

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

    console.log("🌊 RAW GEOCODING RESPONSE ->", txt);

    const data = JSON.parse(txt);

    if (data.error || !data.latitude || !data.longitude) {
      console.error("❌ Geocoding Agent failed to find valid coordinates:", data);
      return null;
    }

    return {
      name: data.name,
      latitude: typeof data.latitude === 'number' ? data.latitude : parseFloat(data.latitude),
      longitude: typeof data.longitude === 'number' ? data.longitude : parseFloat(data.longitude)
    };
  } catch (err) {
    console.error("Geocoding agent error:", err);
    return null;
  }
}
