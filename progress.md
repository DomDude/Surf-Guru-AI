# Progress

> **Note (2026-04-11):** Project handbook was upgraded. A new `CLAUDE.md` now holds developer conventions and parallel-session protocol; `task_plan.md` was rewritten into phased parallel tracks (A/B/C/D/E); `findings.md` was populated with API quirks, competitor intel, and known debts. New sessions should start by reading `CLAUDE.md` → `gemini.md` → `task_plan.md` → `findings.md`. No code changes in this pass.

## Track 1A — 2026-04-12

**1A.1 (verification only):** `git log --all -- webapp/.env.local` returned empty — key was never committed to git history. User should still consider rotating the key if it was shared or copied outside the repo. No action needed on the git side.

**1A.2:** Added `webapp/.env.example` listing `GEMINI_API_KEY=`. Fixed `webapp/.gitignore` to include `!.env.example` exception so the example file is committable while all real env files remain ignored.

**1A.3:** Replaced boilerplate `create-next-app` metadata in `webapp/src/app/layout.tsx` with real Surf Guru AI title, description, OG tags, `metadataBase`, and favicon reference.

**1A.4:** Rewrote `webapp/README.md` — real project description, local dev instructions, env var table, project structure, A.N.T. architecture summary, and links to `CLAUDE.md` / `gemini.md` / `task_plan.md`.

**1A.5:** Moved five test scripts (`test_fetch.ts`, `test_gemini.ts`, `test_geo.ts`, `test_geocoding.ts` from `src/tools/`; `test_route.ts` from `webapp/`) into `webapp/tests/` with updated relative imports. Deleted empty root-level `.tmp/` and `tools/` directories. Deleted empty root `.env`.

**1A.6:** Updated `progress.md` with this entry. `task_plan.md` is already the detailed phased version (rewritten 2026-04-11); no further changes needed.

---

## What was done, errors, tests, results
- Project initialized. Memory files generated.
- `gemini.md` updated with rigorous schemas.
- Set up Next.js `webapp` without Tailwind CSS.
- Completed Phase 2: Verified API connectivity for Open-Meteo & Gemini.
- Created Backend Tools (Layer 3): `geocoding.ts` and `fetch_marine_data.ts`.
- Built API Route `api/chat/route.ts` linking Layer 1, Layer 2, and Layer 3.
- Styled global CSS to a premium, dark, editorial Surf aesthetic.
- **Bug Fix 1 (Geocoding):** Open-Meteo Geocoding failed to find specific surf spots like "Pipeline".
  - *Resolution:* Replaced Open-Meteo geocoding with a dedicated Gemini-powered Geocoding Agent to accurately fetch coordinates for obscure surf spots globally.
- **Bug Fix 2 (Forecast Alignment):** Data was pulling from `hourly` index `0` instead of the realtime timezone.
  - *Resolution:* Refactored `fetch_marine_data.ts` to utilize the Open-Meteo `current` condition endpoint synced to the native `timezone=auto`.
- **Feature Add (Advanced Forecasting & Regional Knowledge):** User noted the forecast couldn't see "tomorrow" and requested specialized knowledge for Portugal (Sagres/Algarve).
  - *Resolution:* Upgraded `fetch_marine_data.ts` to retrieve a full 48-hour forecast separated by 3-hour increments. Upgraded the `route.ts` system prompt to feed this array to Gemini to allow it to accurately read the future like Surfline. Hardcoded instructions ensuring Gemini references 15-20 min driving radius substitutes specifically for the Portugal/Algarve region.
