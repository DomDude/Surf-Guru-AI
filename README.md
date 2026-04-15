# 🏄 Surf Guru AI

An AI-powered surf forecast app that delivers detailed wave, wind & swell reports — powered by the **Gemini API** with a premium dark-mode UI.

> Your personal surf guru that analyzes real ocean data and tells you when to paddle out.

---

## ✨ Features

- 🤖 **AI Surf Analysis** — Gemini-powered natural language surf reports with detailed breakdowns
- 🌊 **Real Marine Data** — Wave height, swell period & direction, wind speed via Open-Meteo Marine API
- 🗺 **Global Coverage** — Search any surf spot worldwide with geocoding (+ offline gazetteer fallback)
- 🌙 **Premium Dark UI** — Editorial design inspired by modern surf media
- ⚡ **Smart Caching** — Rate-limited API calls with in-memory cache for fast repeated queries
- 📊 **Forecast Stats** — Computed statistics for swell, wind, and tide conditions

## 🛠 Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16
- **Language:** TypeScript
- **AI:** [Google Gemini API](https://ai.google.dev/) (`@google/genai`)
- **Data Sources:** [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api)
- **Geocoding:** Nominatim + offline gazetteer fallback
- **UI:** React 19, custom CSS design system
- **Validation:** Zod

## 📁 Project Structure

```
webapp/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main chat interface
│   │   ├── globals.css           # Design system & dark theme
│   │   └── api/chat/route.ts     # Gemini API route with tool calling
│   ├── tools/
│   │   ├── fetch_marine_data.ts  # Open-Meteo marine API client
│   │   ├── compute_stats.ts      # Forecast statistics engine
│   │   ├── geocoding.ts          # Location search
│   │   ├── geocode_nominatim.ts  # Nominatim fallback
│   │   └── forecast_sources/     # Modular data source adapters
│   ├── data/
│   │   └── gazetteer.json        # Offline surf spot database
│   └── lib/
│       ├── cache.ts              # In-memory response cache
│       ├── rate_limit.ts         # API rate limiter
│       └── log.ts                # Structured logging
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key

### Setup

```bash
cd webapp

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Add your Gemini API key to .env.local:
# GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and ask about surf conditions anywhere in the world!

### Example Queries

- *"How's the surf in Biarritz this weekend?"*
- *"Best time to surf Pipeline today?"*
- *"Wellenvorhersage für Sylt"*

## 📄 License

Private project — not open source.