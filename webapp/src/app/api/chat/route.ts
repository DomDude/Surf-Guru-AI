import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { geocodeLocation } from '@/tools/geocoding';
import { fetchMarineData } from '@/tools/fetch_marine_data';

// Keep this deterministic and edge-friendly.
export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const { location_name, user_query, skill_level = 'intermediate' } = await req.json();

        if (!location_name) {
            return NextResponse.json({ error: "No location provided." }, { status: 400 });
        }

        // Step 1: Geocode
        console.log("--> STEP 1: Geocoding Location:", location_name);
        const coords = await geocodeLocation(location_name);
        console.log("--> GEOCODE RESULT:", coords);

        if (!coords) {
            return NextResponse.json({
                forecast_report: "Sorry bro, I couldn't find that spot right now. Can you be more specific on the location?",
                spot_info: { name: location_name, coordinates: null },
                raw_data: null,
                debug: "Geocoding returned null"
            });
        }

        // Step 2: Fetch Marine Data
        console.log("--> STEP 2: Fetching Marine Data for:", coords.latitude, coords.longitude);
        const marineData = await fetchMarineData(coords.latitude, coords.longitude);
        console.log("--> MARINE DATA RETURNED:", marineData ? "YES" : "NO");

        if (!marineData) {
            return NextResponse.json({
                forecast_report: "Looks like the buoys are down right now, getting no signal out there. Try again later, mate.",
                spot_info: coords,
                raw_data: null,
                debug: "fetchMarineData returned null"
            });
        }

        // Step 3: Call Gemini API
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server config error: missing API key." }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        // The Persona Prompts based on gemini.md rules.
        const systemPrompt = `
You are an expert local Surf Guide. You know everything about surfing, global surf spots (even secret ones), and local conditions. 
You are a top specialist in Portugal, specifically the Algarve region (e.g., Sagres, Lagos, Arrifana) and you know all the secret spots there.
Your tone is authentic, experienced, local surfer.
Write a detailed 'Surf Forecast Report' analyzing the wave height, swell direction, wind, and period.
You are talking to an ${skill_level} surfer. Give them a precise recommendation.

CRITICAL PORTUGAL RULES:
- If the user asks for a spot in Portugal (especially the Algarve/Sagres) or asks for recommendations, DO NOT just give data for that one spot. Actively suggest and compare other spots within a 15 to 20 minute driving distance.
- You MUST consider and mention the specific coastlines around Sagres:
  - West Coast spots (e.g., Praia do Telheiro, Praia da Ponta Ruiva, Praia do Tonel) which pick up more swell.
  - South Coast spots (e.g., Praia do Barranco, Mareta, Zavial) which are more sheltered.
- Compare the swell size and conditions accurately as if you were reading Surfline's multi-day forecast.

CRITICAL REPORTING RULES:
- NEVER hallucinate the forecast. ONLY use the API data provided below.
- Format your response in clean Markdown.
- Keep it stoked but honest. If it's flat, say it's flat. If it's blown out, say it's blown out.
- Use localized measurement units (e.g., use Feet/Knots for USA/Hawaii, use Meters/KMH for Europe/Australia).

JSON SCHEMA REQUIREMENT:
You MUST output ONLY valid JSON using the following structure. Do not output markdown code blocks (\`\`\`json) outside the JSON, just the raw JSON object itself.
{
  "condition_rating": "string (e.g., 'POOR', 'FAIR', 'GOOD', 'EPIC')",
  "condition_color": "string (e.g., '#E5A93D' for FAIR, '#00C851' for GOOD, '#ff4444' for POOR, '#33b5e5' for EPIC)",
  "surf_height_human": "string (e.g., 'Chest to head high', 'Knee high', 'Overhead')",
  "tide_trend": "string (Use your local knowledge to estimate a realistic tide stage, e.g., 'Rising - Next High at 1:20pm')",
  "wind_trend": "string (e.g., 'Offshore', 'Onshore', 'Cross-shore')",
  "wetsuit_rec": "string (e.g., '3/2mm wetsuit', 'Boardshorts', '4/3mm + booties')",
  "board_rec": "string (e.g., 'Ride an all-rounder', 'Bring the step-up', 'Log day')",
  "forecast_report": "string (Your detailed markdown report here)"
}

API DATA RECEIVED:
Location: ${coords.name}

48-HOUR FORECAST DATA (In 3-Hour Increments):
${JSON.stringify(marineData.forecast_48h, null, 2)}

USER QUERY:
"${user_query}"
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: systemPrompt,
            config: {
                // Ensure Gemini responds in strict JSON
                responseMimeType: "application/json",
            }
        });

        let aiOutput;
        try {
            aiOutput = JSON.parse(response.text || '{}');
        } catch (e) {
            console.error("Failed to parse Gemini JSON:", response.text);
            aiOutput = {
                forecast_report: "I'm lost for words right now... something went wrong with the AI structure.",
                condition_rating: "UNKNOWN",
                condition_color: "#888888"
            };
        }

        // Step 4: Return Payload
        return NextResponse.json({
            forecast_report: aiOutput.forecast_report,
            ai_stats: {
                condition_rating: aiOutput.condition_rating,
                condition_color: aiOutput.condition_color,
                surf_height_human: aiOutput.surf_height_human,
                tide_trend: aiOutput.tide_trend,
                wind_trend: aiOutput.wind_trend,
                wetsuit_rec: aiOutput.wetsuit_rec || "Standard wetsuit",
                board_rec: aiOutput.board_rec || "Standard shortboard"
            },
            spot_info: {
                name: coords.name,
                coordinates: { lat: coords.latitude, lon: coords.longitude }
            },
            raw_data: marineData.current
        });

    } catch (error) {
        console.error("Chat API Route Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
