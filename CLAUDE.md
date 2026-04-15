# CLAUDE.md — Surf Guru AI

> **Read this first, every session.** Every new Claude Code session starts cold. This file is the fastest path from "what is this project" to "I can start working on the right task without breaking things." It is paired with three running logs: `task_plan.md`, `progress.md`, `findings.md`.

## Project Overview
**Surf Guru AI** — an AI-first surf companion for intermediate to advanced surfers. Combines multi-source forecasts, scraped local spot knowledge, and a natural-language surf-guide LLM into a single experience. The wedge against Surfline: AI-first reasoning + honest free tier + Europe-first coverage + topography-aware interpretation.

**North star:** a surfer opens the app, types or taps a region, sees the best spot *for them* right now with a stoke score, plain-language reasoning, and a 48-hour window — in under 3 seconds.

**Current state:** Phase 1 WIP. Next.js app with single-source Open-Meteo forecast + Gemini-generated report. Several correctness bugs open (see `findings.md`). No auth, no personalization, no multi-source, no local-knowledge ingestion yet.

## Tech Stack
- **Language:** TypeScript (strict)
- **Framework:** Next.js 15 (App Router)
- **Runtime:** Node.js (not edge — Phase 3 needs fs/sqlite)
- **LLM:** Google Gemini 2.5 Flash via `@google/genai`
- **Forecast data:** Open-Meteo Marine + Weather API (free, no auth). Phase 2 adds a second model.
- **Styling:** Hand-written CSS in `globals.css` (no Tailwind — intentional, keep the dark editorial look)
- **Database:** none yet. Phase 4 adds Neon Postgres + Drizzle.
- **Validation:** Zod
- **Testing:** none yet. Playwright planned for Phase 5.
- **Package Manager:** npm
- **Deployment target:** Vercel (not wired yet)

## Project Structure
```
Surf-Guru-AI/
├── CLAUDE.md                          ← dev handbook (this file)
├── task_plan.md                       ← phased task list with parallel tracks
├── progress.md                        ← chronological log of what was done
├── findings.md                        ← non-obvious discoveries, API quirks, gotchas
└── webapp/                            ← the Next.js app (all dev happens here)
    ├── .env.local                     ← NEVER commit. Contains GEMINI_API_KEY.
    ├── package.json
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx               ← UI (client component)
    │   │   ├── layout.tsx
    │   │   ├── globals.css
    │   │   └── api/chat/route.ts      ← Layer 2 — orchestration
    │   ├── lib/
    │   │   ├── log.ts                 ← structured logging helper
    │   │   └── rate_limit.ts          ← in-memory token bucket
    │   └── tools/                     ← Layer 3 — deterministic tools
    │       ├── geocoding.ts
    │       └── fetch_marine_data.ts
    └── tests/                         ← scratch/ad-hoc tool tests
        ├── test_fetch.ts
        ├── test_gemini.ts
        ├── test_geo.ts
        ├── test_geocoding.ts
        └── test_route.ts
```

## Architectural invariants — the A.N.T. model

Three layers. Do not refactor away.

- **Layer 1 — Logic & Prompting.** Persona, rules, and schemas (defined in this file). System prompts live in `route.ts`. The LLM *reasons and writes* — it never *invents* facts like tide times, coordinates, or wave heights.
- **Layer 2 — Navigation.** `webapp/src/app/api/chat/route.ts` is the orchestrator. It takes a request, calls tools in order, bundles results, calls the LLM, returns the payload.
- **Layer 3 — Tools.** Every file in `webapp/src/tools/` is a pure deterministic function — structured in, structured out, one job. Tools do not call the LLM for factual data.

**Canonical data flow:**
```
Input Schema → geocode → fetch forecast(s) → fetch local knowledge → Gemini reasons → Payload Schema → UI
```

**Execution flow (step by step):**
1. UI submits a query — `POST /api/chat` receives the `Input Schema`.
2. `route.ts` calls `geocoding.ts` → converts location string to `{ lat, lon }`.
3. `route.ts` calls `fetch_marine_data.ts` → returns current + 48h `ForecastPoint[]` from Open-Meteo.
4. Data + user query are bundled and sent to Gemini with the system prompt below.
5. Gemini returns a structured JSON payload matching the `Payload Schema`.
6. `route.ts` validates, enriches, and returns the payload to the UI.

**Error handling:**
- Geocoding fails → `GEOCODING_FAILED` → *"Couldn't find that spot. Can you be more specific?"*
- Marine API fails → `FORECAST_FAILED` → *"Looks like the buoys are down right now. Try again later."*
- LLM fails → `LLM_FAILED` → *"The surf guru is out of signal range. Try again in a moment."*

## Data Schemas

These schemas are load-bearing. Define or update schemas here before building or changing tools that produce or consume them.

### Input Schema (User → System)
```json
{
  "location_name": "string (e.g., 'Pipeline, Hawaii')",
  "latitude": "float (optional, if known)",
  "longitude": "float (optional, if known)",
  "user_query": "string (e.g., 'Is it good for an intermediate today?')",
  "skill_level": "string (default: 'intermediate')"
}
```

### Intermediate Marine Data (API → System)
```json
{
  "wave_height_m": "float | null",
  "swell_wave_height": "float | null",
  "swell_wave_period": "float | null",
  "swell_wave_direction": "int | null",
  "wind_speed": "float | null",
  "wind_direction": "int | null"
}
```

### Payload Schema (System → UI)
```json
{
  "forecast_report": "string (Markdown formatted text by Gemini)",
  "spot_info": {
    "name": "string",
    "coordinates": { "lat": "float", "lon": "float" }
  },
  "raw_data": "object (contains the intermediate marine data)"
}
```

## Persona & Behavioral Rules

These rules govern how Gemini reasons and writes. They are re-stated in the `route.ts` system prompt.

- **Persona:** Expert local surf guide — authentic, experienced, no marketing voice. If it's flat, say flat. If it's blown out, say blown out.
- **Target audience:** Intermediate to advanced surfers. Use surfer language (period, offshore, tide stage, board shape) without over-explaining.
- **No hallucinated data:** Wave heights, wind, tide, temperature, coordinates — all from real APIs. The LLM interprets and writes; it does not invent. If data is missing, omit the field or mark it unknown — never fabricate.
- **Regional units:** Feet/Knots for USA/Hawaii; Meters/KMH for Europe/Australia. Derive from coordinates server-side, not from the LLM guessing based on the location string.
- **Data-first rule:** Define the schema here before building a tool that produces it.

## Commands
All commands run from `webapp/`.

```bash
npm run dev              # local dev on :3000
npm run build            # production build
npm run start            # run built app
npx tsc --noEmit         # typecheck only (no lint script set up yet)
```

Ad-hoc tool tests:
```bash
npx tsx tests/test_gemini.ts
npx tsx tests/test_fetch.ts
npx tsx tests/test_geocoding.ts
npx tsx tests/test_route.ts
```

## Code Conventions
- **Components:** functional, no classes.
- **Exports:** named exports for tools and components. Default export only for Next.js pages/layouts/routes where the framework requires it.
- **File naming:** `snake_case.ts` for tools, `kebab-case.tsx` for React components, `PascalCase` for component *names*, `route.ts` / `page.tsx` / `layout.tsx` are framework-mandated.
- **Quotes:** single quotes in TS, double quotes in JSX attributes (Next.js default).
- **Types:** colocated with their tool. Shared types move to `src/types/` only when 2+ files need them.
- **Comments:** explain *why*, not *what*. No JSDoc unless exported across layers.
- **No new files unless needed.** Prefer editing existing files.

## Important Patterns
- **Error handling:** tool functions return `null` on recoverable failure and throw typed errors on unrecoverable ones. `route.ts` catches and returns a graceful persona-consistent message. Never swallow and return `{}`.
- **External API calls:** every response **must** be validated through Zod before use. Never trust shape.
- **Logging:** `logStep` / `logError` from `src/lib/log.ts` — prints JSON lines with `traceId`, `step`, `duration_ms`, `spot`. Do not use raw `console.log` in `route.ts`.
- **Caching:** none yet. Phase 2 adds Upstash Redis for forecast cache (TTL 30–60 min) and a simple in-memory LRU for dev.
- **State management:** React `useState` + server payload. No global store until we need one.
- **Authentication:** none yet. Phase 4 introduces Clerk or Supabase Auth.

## Hard rules (do not violate)
1. **No hallucinated data.** Wave heights, wind, tide, temperature, coordinates — all from real APIs.
2. **Persona is an honest local.** No marketing voice.
3. **Audience is intermediate/advanced.** Use surfer language without over-explaining.
4. **Data-first rule.** Define the schema here *before* building a tool that produces it.
5. **Regional units.** Derive from coordinates, not LLM inference.
6. **Secrets never in git.** `.env*` is gitignored. If a key leaks, rotate it immediately.

## Things To Avoid
- **Never commit `.env.local`** or stage it with `git add .` / `-A`. Always stage by filename.
- **Never add Tailwind.** CSS is hand-written on purpose.
- **Never bypass the A.N.T. layering** — don't call Gemini from `page.tsx`, don't do business logic in tools.
- **Never use the LLM as a data source** for facts it could get wrong (tide times, specific wind speeds, exact coordinates).
- **Don't add features outside the current phase** in `task_plan.md`. Capture ideas under "Future ideas" in `findings.md`.
- **Don't refactor code you didn't need to touch.**
- **Don't add emojis to code or user-facing output** unless explicitly asked.
- **Don't commit without the user's explicit go-ahead.**
- **Don't switch LLM provider, forecast source, or framework** without a `findings.md` entry explaining why.

## Running logs — how to keep them honest

- **`task_plan.md`** — *what needs doing*, organized by phase and parallel track. Mark `[x]` when done; never delete completed tasks. Add new tasks under the matching track.
- **`progress.md`** — *chronological narrative* of what got done, bugs encountered, fixes applied. Append-only.
- **`findings.md`** — *non-obvious knowledge* future-you or a parallel session would otherwise re-learn. Organized by topic, not chronology. API quirks, "this looks wrong but isn't", competitor notes, debts.

**If you fix a subtle bug, write the cause in `findings.md` before closing the task.**

## Working in parallel sessions
1. **Pick ONE track** from `task_plan.md` and stick to it.
2. **Read `task_plan.md` first** — each task names the files it owns and the files it must not touch.
3. **Check recent commits** (`git log --oneline -20` in `webapp/`) so you're not duplicating work.
4. **Commit frequently**, small and focused.
5. **On finish:** update the task checkbox, append to `progress.md`, add subtleties to `findings.md`, tell the user what you changed.
6. **On collision:** if a file you need is currently owned by another track, stop and surface it to the user.

## How to start a session (the 5-minute ritual)
1. Read this file (you just did).
2. `task_plan.md` — pick your track and task. Read its "files touched" and "do not touch" lists.
3. `findings.md` — 2 minutes, skim for anything relevant.
4. Last ~20 lines of `progress.md` to see where the previous session left off.
5. Work the task. Update all three running logs when done.

## Additional Context
- **Primary user:** Dominik (product owner + domain expert). Surfs Algarve/Sagres regularly — use him as ground truth when the LLM output sounds wrong for a specific spot.
- **Known debts:** see `findings.md` § "Known debts".
- **Deployment:** not wired yet. Target Vercel in Phase 5.
