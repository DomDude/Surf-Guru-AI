# Findings

> **Purpose.** Non-obvious stuff a future session (yours or a parallel one) would otherwise re-learn the hard way. API quirks, "this looks wrong but isn't," competitor intel, debts we're carrying, and ideas we decided to defer. Organized **by topic**, not chronology. Append to the right section; don't delete entries — mark them `[resolved]` if they stop being true.

---

## Open-Meteo quirks

### The "current conditions" trap
**Symptom.** `fetchMarineData` treats `hourly[0]` as "current conditions."
**Reality.** With `timezone=auto`, Open-Meteo returns `hourly.time[0]` as **local midnight of today**, not "now." So your "current wave height" can be up to 24 hours stale.
**Fix.** Either (a) use `&current=wave_height,swell_wave_height,...` on the marine endpoint and `&current=wind_speed_10m,...` on the weather endpoint, then parse the returned `current` object; or (b) compute the current-hour index yourself from `utc_offset_seconds`.
**Status.** Open. Scheduled in Task 1B.1.
**Why it matters.** This is the most embarrassing bug in the app right now — every "current" reading may be wrong, silently.

### Sampling offset
Same root cause: `for (let i = 0; i < times.length; i += 3)` in `fetch_marine_data.ts` starts at index 0 (= midnight). The 48h forecast view should start at "now" and step every 3 hours forward. If you fix the current bug, remember to fix the sampling too. Tracked as 1B.3.

### Missing data as zero
`wave_height[i] || 0` silently renders nulls as flat water. Use `?? null` and propagate nullability. Tracked as 1B.2.

### Marine API does not return wind
`open-meteo.com/v1/marine` doesn't reliably include wind. You have to hit `api.open-meteo.com/v1/forecast` separately for `wind_speed_10m`, `wind_direction_10m`, `temperature_2m`. We already do this — documented here so nobody "optimizes" by dropping the second call.

### Models parameter
Open-Meteo supports `&models=gfs_wave025,ecmwf_wam025,ncep_gfs025,icon_seamless` on the marine endpoint. Use this to get a second independent forecast without paying for Stormglass. Relevant for Task 2A.3.

---

## Gemini API quirks

### JSON mode vs markdown-wrapped JSON
`responseMimeType: "application/json"` works well when set in `generationConfig`. Do **not** also tell Gemini to output ` ```json` blocks in the prompt — you'll get the raw JSON wrapped in markdown and have to strip it. We're clean on `route.ts` but `geocoding.ts:59` still has the defensive strip (harmless but unnecessary).

### Gemini as geocoder (current debt)
`geocodeLocation` uses Gemini to return `{ name, lat, lon }`. It works surprisingly well for well-known spots (Pipeline, Teahupoo, Supertubos) but has **zero verification**, so we've seen it:
- Return coordinates off by 5–20 km for Algarve spots
- Confidently geocode fictitious places
- Return (0, 0) once for an unknown input

**Mitigation plan.** Phase 2 adds (1) a hand-verified gazetteer as the primary source, (2) Nominatim fallback, (3) Gemini as last-resort with Nominatim cross-check. See Tasks 2C.1–2C.3.

### Gemini will happily invent tide data
`route.ts:80` literally instructs Gemini to "use your local knowledge to estimate a realistic tide stage." This violates `gemini.md` Rule #1 (no hallucinated forecasts) and produces plausible-sounding but wrong tide times. Plan: remove in Task 1C.2, replace with a real tide API in Phase 2B.

### Regional units via location string
The system prompt tells Gemini "Feet/Knots for USA/Hawaii, Meters/KMH for Europe/Australia" and asks it to infer the region from the location name. This mostly works but fails on ambiguous names (there's a "Pipeline" in Australia too). Better approach: derive the unit system from the returned coordinates server-side before composing the prompt. Deferred to Phase 2.

---

## Violations caught and fixed

*(Append as we fix them. Record the rule, how it was violated, and how we fixed it.)*

- **Hallucinated tide times.** Rule #1 violation in `route.ts:80`. Scheduled fix in Task 1C.2.
- **"Current" reading is actually midnight.** Violates implicit truthfulness of the `raw_data` block. Scheduled fix in Task 1B.1.

---

## Competitor intel (from Phase 0 research)

### Market structure (2026)
- **Surfline** is the market leader. ~$70/yr paywall locks the best data. Recently launched Premium+ with AI features: *Crowd Prediction*, *Wave Timeline* (scrub through 20-min windows), *Wave Distribution*, *Smart Clips*. They have 20+ years of human-observed session data for ML.
- **Magicseaweed** shut down May 2023, absorbed into Surfline. A large community of free-tier surfers is homeless.
- **Windy** is the best free alternative — great visualization, 3-model comparison, $4/mo. Not surf-specific.
- **BUIO** — personalized ML forecast from session journaling. You tag sessions ("glassy, peaky") and the app learns your preferences. Requires a lot of manual logging before it's useful.
- **SurfSense.ai** — "daily stoke score" + recommendations. Niche. Thin on substance, strong on framing.
- **Lazy Surfer / Wave Day / Surf Log / SurfTrackr** — session journals. Strong loggers, weak forecasters.
- **Swellinfo** — US East Coast favorite, unique multi-model ensemble comparison. Proves the ensemble angle works.
- **Gonna.surf** — Canary Islands hyperlocal, beats Surfline on topography. Proves the regional-topography angle.

### User pain points with Surfline (from reviews and forums)
- Paywall for basics: **units**, **swell energy**, best forecast data, camera access.
- **Coarse model** misses wave shadowing and topography (La Graciosa blocking La Santa, etc.).
- **Dense UI** — up to 8 separate wave numbers per slot; mixes horizontal and vertical layouts confusingly.
- **Slow during big swells** — exactly when you need it.
- **Geographic bias** — great for USA/AU, patchy for Europe and the rest.

### Our wedge (what's underserved)
1. **Free forever** on the core forecast (Surfline paywalls everything).
2. **Europe-first** coverage with hand-verified spots (Algarve, Ericeira, Peniche, France, Canary Islands).
3. **Topography-aware interpretation** via LLM reasoning on structured gazetteer notes (no CFD model needed).
4. **Multi-model ensemble + agreement score** (Swellinfo-style, but global).
5. **Natural-language AI surf guide** that actually reasons (not just a prompt with pasted JSON).
6. **Local-knowledge ingestion** — Reddit, Wannasurf, YouTube — nothing else does this.
7. **Personalized stoke score** after ≥5 sessions, like BUIO but without forcing manual logging first (use session view as implicit signal).

### Monetization reference
Surfline podcast interview (Paul Ganev): they don't spend on paid acquisition. Free tier is the growth funnel, subscription for committed users. Target conversion for good freemium apps: 3–5%. Excellent: 6–8%. Hard paywalls convert ~6× better but attract ~10× fewer users. We go freemium, with a Pro tier at maybe 3–5€/mo (undercuts Surfline ~6×) for alerts, region ranker, session history beyond 30 days, multi-spot compare.

---

## Forecast source normalization (planning notes for Phase 2)

Each forecast source returns its own shape. We'll normalize to `ForecastPoint[]` from `fetch_marine_data.ts`. The interface for all sources:

```ts
interface ForecastSource {
  name: string;  // "open-meteo-ecmwf", "open-meteo-gfs-wave", "stormglass", ...
  fetch(lat: number, lon: number): Promise<ForecastPoint[]>;
}
```

### Units to normalize
- Wave height: meters (provide `_ft` as derived)
- Wind: km/h (provide `knots` as derived)
- Period: seconds
- Direction: degrees (meteorological: 0° = from North)
- Temperature: °C (provide `°F` as derived)

### Time resolution
Normalize to 3-hour increments over 48h starting from "now", aligned to the nearest past 3h boundary so the first point is always ≤ now + 3h.

### Agreement score
`agreement(t) = 1 - clamp(stddev(sources_wave_height_at_t) / mean(sources_wave_height_at_t), 0, 1)`.
- 1.0 = perfect agreement → high confidence
- < 0.5 = meaningful disagreement → show both and let the surfer decide

---

## Known debts (shortcuts we're carrying)

| # | Debt | Where | Cost if ignored | Scheduled fix |
|---|---|---|---|---|
| 1 | "Current" reading is midnight-local, not now | `fetch_marine_data.ts:72` | All "current" readings silently wrong | 1B.1 |
| 2 | Tide data fabricated by LLM | `route.ts:80` | Rule #1 violation, wrong tide times | 1C.2 + 2B |
| 3 | Geocoder has no verification | `geocoding.ts` | Wrong coordinates → wrong forecast | 2C.3 |
| 4 | `|| 0` hides null forecast data | `fetch_marine_data.ts:50-67` | Shows flat ocean where data is missing | 1B.2 |
| 5 | No Zod validation anywhere | all tools | One Open-Meteo schema change crashes prod | 1B.4, 1C.1 |
| 6 | No caching | all tools | Expensive + slow + burns rate limits | 2D |
| 7 | No rate limiting on `/api/chat` | `route.ts` | $$$ abuse risk if deployed | 1C.5 → 5C |
| 8 | Ad-hoc test scripts in `src/` | `webapp/src/tools/test_*.ts`, `webapp/test_route.ts` | Pollutes build, confuses imports | 1A.5 |
| 9 | Default `create-next-app` metadata and README | `layout.tsx`, `README.md` | Unprofessional on share/embed | 1A.3, 1A.4 |
| 10 | Regional units via LLM inference, not coordinates | `route.ts` system prompt | Wrong units for ambiguous spot names | Phase 2 |
| 11 | No gitignore at project root (only inside `webapp/`) | — | `.env` / `.DS_Store` at root could leak | 1A.2 |
| 12 | Two sources of truth for "tools": `architecture/blueprint.md` references `tools/` but code lives in `webapp/src/tools/` | docs | Confusing for new sessions | 1A.6 |

---

## Parallel-session lessons (update as we learn)

*(Empty for now. Add here when we discover what works and what doesn't.)*

- *(placeholder)* If two sessions ever need the same file, the second one should stop and surface it — don't try to merge blind.
- *(placeholder)* Small commits > big commits when parallel work is happening.

---

## Deferred / "do later" ideas (don't forget)

- **Wave shadowing model** — use NOAA bathymetry + simple ray tracing to compute *actual* effective swell at a spot given the raw offshore reading. Expensive to build, huge differentiator. Post-launch.
- **Crowd estimation from webcam frames** — OpenCV / a small vision model. Surfline's Premium+ has this; we could match it for free once the core product is solid.
- **Multilingual output** — PT, ES, FR, IT for European markets. Easy with Gemini's language support; deferred until we have traction.
- **Voice-first interface** — "hey Surf Guru, is Beliche firing?" — Whisper STT + TTS. Great demo, poor retention driver. Later.
- **Apple Watch complication** — real utility for surfers. Phase 6+.
- **Integration with Strava / GPS watches** for automatic session detection — removes all manual logging friction. Phase 6+.
- **Historical quality tracking** — "your top 10 days at Beliche" based on logged sessions. Low effort, high retention. Early Phase 4 bonus.
- **Wind-model disagreement layer on the map** — Swellinfo-style, but visual. Phase 5+.

---

## Glossary (for future-you or a new contributor)

- **Stoke score** — 0–100 rating of how good it'll be at a spot at a given time, personalized to the user's skill and history. Our signature output.
- **Model agreement** — 0–1 score of how much the multiple forecast sources agree. High agreement = confident prediction.
- **Gazetteer** — hand-verified JSON of surf spots with coordinates, type, best swell/wind direction, skill minimum, and topography notes. The backbone of our regional knowledge.
- **A.N.T.** — the 3-layer architecture (Architecture / Navigation / Tools) documented in `gemini.md` and `architecture/blueprint.md`.
- **B.L.A.S.T.** — the 5-phase delivery protocol from `task_plan.md` (Blueprint / Link / Architect / Stylize / Trigger). Phases map roughly to Phases 1→5 of the current plan.
- **Topography-aware** — our term for LLM reasoning over gazetteer `topography_notes` to interpret raw forecasts. Not a physics model.
