import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { geocodeLocation } from '@/tools/geocoding';
import { fetchMarineData } from '@/tools/fetch_marine_data';
import { computeStats } from '@/tools/compute_stats';
import { logStep, logError } from '@/lib/log';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate_limit';
import { randomUUID } from 'crypto';

// Keep this deterministic and Node-only (fs/sqlite coming in Phase 3).
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// 1C.1 — Request body validation (Task 1C.1)
// Matches the Input Schema defined in gemini.md.
// ---------------------------------------------------------------------------

const ChatRequestSchema = z.object({
  location_name: z.string().min(1, 'location_name is required'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  user_query: z.string().optional().default(''),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('intermediate'),
});

type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ---------------------------------------------------------------------------
// 1C.3 — Discriminated error types (Task 1C.3)
// ---------------------------------------------------------------------------

type ErrorCode = 'GEOCODING_FAILED' | 'FORECAST_FAILED' | 'LLM_FAILED' | 'UNKNOWN';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  GEOCODING_FAILED:
    "Sorry bro, couldn't track that spot down. Double-check the name or try a nearby town — sometimes the obscure ones need a hint.",
  FORECAST_FAILED:
    "Looks like the buoys are down right now, getting no signal out there. Try again in a bit, the ocean will still be there.",
  LLM_FAILED:
    "The AI guide went quiet on me. Data came through clean — must be a gremlin in the radio. Give it another go.",
  UNKNOWN:
    "Something went sideways on our end. The waves are still there; we just can't see them right now. Try again shortly.",
};

function errorResponse(code: ErrorCode, status: number, traceId: string) {
  return NextResponse.json(
    {
      error: code,
      message: ERROR_MESSAGES[code],
      traceId,
    },
    { status }
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const traceId = randomUUID();

  // --- Rate limiting (Task 1C.5) ---
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  if (!checkRateLimit(ip)) {
    const retryAfter = retryAfterSeconds(ip);
    return NextResponse.json(
      {
        error: 'RATE_LIMITED',
        message: "Whoa, easy on the requests there. Wait a minute and try again.",
        traceId,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    );
  }

  // --- Parse + validate request body (Task 1C.1) ---
  let body: ChatRequest;
  try {
    const raw = await req.json();
    const parsed = ChatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body.',
          details: parsed.error.flatten().fieldErrors,
          traceId,
        },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Request body must be valid JSON.', traceId },
      { status: 400 }
    );
  }

  const { location_name, user_query, skill_level } = body;

  try {
    // --- Step 1: Geocode ---
    let t = Date.now();
    logStep({ traceId, step: 1, label: 'geocoding_start', spot: location_name });

    const coords = await geocodeLocation(location_name);

    logStep({
      traceId,
      step: 1,
      label: 'geocoding_done',
      spot: location_name,
      duration_ms: Date.now() - t,
      meta: { resolved: coords?.name ?? null },
    });

    if (!coords) {
      return errorResponse('GEOCODING_FAILED', 200, traceId);
    }

    // --- Step 2: Fetch marine data ---
    t = Date.now();
    logStep({ traceId, step: 2, label: 'forecast_fetch_start', spot: coords.name });

    const marineData = await fetchMarineData(coords.latitude, coords.longitude);

    logStep({
      traceId,
      step: 2,
      label: 'forecast_fetch_done',
      spot: coords.name,
      duration_ms: Date.now() - t,
      meta: { dataReceived: marineData !== null },
    });

    if (!marineData) {
      return errorResponse('FORECAST_FAILED', 200, traceId);
    }

    // --- Step 3: Compute deterministic stats ---
    // condition_rating, condition_color, surf_height_human, wind_trend, wetsuit_rec, board_rec
    // are derived from the raw forecast data — no LLM needed for these.
    // See src/tools/compute_stats.ts for thresholds and rationale.
    const aiStats = computeStats(marineData.current, skill_level);

    // --- Step 4: Call Gemini for the narrative report only ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logError({ traceId, step: 4, label: 'missing_api_key', error: 'GEMINI_API_KEY not set' });
      return NextResponse.json(
        { error: 'SERVER_CONFIG_ERROR', message: 'Server configuration error.', traceId },
        { status: 500 }
      );
    }

    t = Date.now();
    logStep({ traceId, step: 4, label: 'llm_call_start', spot: coords.name });

    const ai = new GoogleGenAI({ apiKey });

    // Gemini only writes the narrative — all numeric stats are already computed.
    // tide_trend is intentionally absent (Task 1C.2): real tide data in Phase 2B.
    const systemPrompt = `
You are an expert local Surf Guide. You know everything about surfing, global surf spots (including secret ones), and local conditions.
You are a top specialist in Portugal, specifically the Algarve region (e.g., Sagres, Lagos, Arrifana), and you know all the secret spots there.
Your tone is authentic, experienced, local surfer.

CRITICAL PORTUGAL RULES:
- If the user asks for a spot in Portugal (especially the Algarve/Sagres), actively suggest and compare other spots within a 15–20 minute drive.
- Consider both West Coast spots (Praia do Telheiro, Ponta Ruiva, Tonel) which pick up more swell, and South Coast spots (Barranco, Mareta, Zavial) which are more sheltered.

REPORTING RULES:
- NEVER hallucinate the forecast. ONLY use the API data provided below.
- Write in clean Markdown. Use headers, bullet points where they add clarity.
- Be honest: if it's flat, say flat; if it's blown out, say blown out.
- Respect regional units: Feet/Knots for USA/Hawaii; Meters/KMH for Europe/Australia.
- Target audience: ${skill_level} surfer. Calibrate your recommendation accordingly.
- Output ONLY the report text — no JSON, no code fences, no preamble.

API DATA:
Location: ${coords.name} (${coords.latitude}, ${coords.longitude})

CURRENT CONDITIONS:
${JSON.stringify(marineData.current, null, 2)}

48-HOUR FORECAST (3-hour increments):
${JSON.stringify(marineData.forecast_48h, null, 2)}

USER QUERY: "${user_query}"
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
    });

    logStep({
      traceId,
      step: 4,
      label: 'llm_call_done',
      spot: coords.name,
      duration_ms: Date.now() - t,
    });

    const forecastReport = response.text?.trim() || '';
    if (!forecastReport) {
      logError({ traceId, step: 4, label: 'llm_empty_response', error: 'empty text' });
      return errorResponse('LLM_FAILED', 200, traceId);
    }

    // --- Step 5: Return payload ---
    logStep({ traceId, step: 5, label: 'response_sent', spot: coords.name });

    return NextResponse.json({
      forecast_report: forecastReport,
      ai_stats: aiStats,
      spot_info: {
        name: coords.name,
        coordinates: { lat: coords.latitude, lon: coords.longitude },
      },
      raw_data: marineData.current,
      traceId,
    });
  } catch (error) {
    logError({ traceId, step: 0, label: 'unhandled_error', error });
    return errorResponse('UNKNOWN', 500, traceId);
  }
}
