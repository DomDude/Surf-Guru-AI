# Surf Guru AI — webapp

AI-first surf forecasting for intermediate and advanced surfers. Multi-source forecasts, scraped local knowledge, and a natural-language surf guide — combined into a single experience. Europe-first coverage, honest free tier, topography-aware interpretation.

## What it does

A surfer types or taps a region, sees the best conditions right now with a stoke score, plain-language reasoning, and a 48-hour window — in under 3 seconds. The AI interprets the raw forecast using spot-specific topography and local knowledge, not just model numbers.

## Running locally

```bash
# from this directory (webapp/)
npm install
npm run dev          # dev server at http://localhost:3000
npm run build        # production build
npx tsc --noEmit    # typecheck only
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values.

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key — get one at [Google AI Studio](https://aistudio.google.com/app/apikey) |

Never commit `.env.local`. It is gitignored.

## Project structure

```
webapp/
├── src/
│   ├── app/
│   │   ├── page.tsx          # UI (client component, Layer 1)
│   │   ├── layout.tsx        # Next.js root layout + metadata
│   │   ├── globals.css       # Hand-written dark editorial CSS (no Tailwind)
│   │   └── api/chat/route.ts # Orchestration layer (Layer 2)
│   └── tools/                # Pure deterministic tools (Layer 3)
│       ├── geocoding.ts      # Gemini-powered geocoder (Phase 2 replaces with gazetteer)
│       └── fetch_marine_data.ts  # Open-Meteo Marine + Weather API
└── tests/                    # Ad-hoc tool test scripts (not part of the build)
```

## Architecture

The app follows the A.N.T. model (Architecture / Navigation / Tools):

- **Layer 1 — Logic & Prompting:** Persona and rules live in `../gemini.md`. System prompts in `route.ts`. Gemini reasons over real data — it never invents facts.
- **Layer 2 — Navigation:** `api/chat/route.ts` orchestrates tool calls, bundles results, calls Gemini, returns the payload.
- **Layer 3 — Tools:** Pure deterministic functions in `src/tools/`. One job each. No LLM calls for factual data.

## Related docs

- [`../CLAUDE.md`](../CLAUDE.md) — developer handbook, conventions, parallel-session protocol
- [`../gemini.md`](../gemini.md) — product constitution (schemas, rules, persona)
- [`../task_plan.md`](../task_plan.md) — phased task list
- [`../findings.md`](../findings.md) — API quirks, known debts, competitor intel
