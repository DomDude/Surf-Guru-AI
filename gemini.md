# Project Constitution

## Data Schemas

### 1. Input Schema (User -> System)
```json
{
  "location_name": "string (e.g., 'Pipeline, Hawaii')",
  "latitude": "float (optional, if known)",
  "longitude": "float (optional, if known)",
  "user_query": "string (e.g., 'Is it good for an intermediate today?')",
  "skill_level": "string (default: 'intermediate')"
}
```

### 2. Intermediate Marine Data (API -> System)
```json
{
  "wave_height_max": "float (meters)",
  "swell_wave_height": "float (meters)",
  "swell_wave_period": "float (seconds)",
  "swell_wave_direction": "int (degrees)",
  "wind_speed": "float (km/h)",
  "wind_direction": "int (degrees)"
}
```

### 3. Payload Schema (System -> User/UI)
```json
{
  "forecast_report": "string (Markdown formatted text by Gemini)",
  "spot_info": {
    "name": "string",
    "coordinates": {"lat": "float", "lon": "float"}
  },
  "raw_data": "object (contains the intermediate marine data)"
}
```

## Behavioral Rules
- **Persona**: Expert local Surf Guide.
- **Knowledge Base**: Supposed to know everything about surfing, surf spots (including secret ones), and local conditions globally.
- **Tone & Style**: Authentic, experienced, local surfer tone. The output should be a detailed "Surf Forecast Report".
- **Analysis Depth**: Deeply analyzes wave height, swell direction, wind, and tides to give precise recommendations. 
- **Target Audience**: Geared especially towards intermediate to advanced surfers.
- **No Hallucination of Forecasts**: Must use real provided API data for the forecast report rather than guessing the current weather.

## Architectural Invariants
- 3-Layer Architecture (A.N.T.)
  - Layer 1: `architecture/` (SOPs and Markdown logic)
  - Layer 2: Navigation (LLM Routing)
  - Layer 3: `tools/` (Deterministic scripts for APIs)
- Deterministic B.L.A.S.T Protocol Focus
- The "Data-First" Rule: Define Data Schema in gemini.md before building tools.
