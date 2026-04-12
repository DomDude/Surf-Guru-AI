# Surf Guru AI - Routing Blueprint

## 1. Goal
Define the exact flow of data from User Input to the final Payload delivered to the UI.

## 2. 3-Layer Execution Flow (A.N.T)

### 2.1 Layer 2: Navigation (The Request)
- **Input:** The User submits a query (e.g., "How is Pipeline looking today for an intermediate surfer?") via the UI.
- **Action:** The Next.js API route (Router) receives the `Input Schema`.

### 2.2 Layer 3: Tools (Deterministic Execution)
- **Step 1 (Geocoding):** Router calls `tools/geocoding.ts` to convert "Pipeline, Hawaii" to `lat: 21.6640` and `lon: -158.0539`.
- **Step 2 (Marine Forecast):** Router calls `tools/fetch_marine_data.ts` using the coordinates to retrieve the `Intermediate Marine Data` schema (Wave Height, Swell Direction, Period, Wind) from the Open-Meteo API.

### 2.3 Layer 1: Logic & Prompting (The Brain)
- **Action:** The intermediate data and the user query are bundled and sent to the **Gemini API**.
- **System Prompt Integrity:** Gemini acts STRICTLY as the "Expert local Surf Guide" (defined in `gemini.md`). It uses the deterministic data to write the forecast, forbidding hallucinations about wave height.

### 2.4 Final Payload Delivery
- **Action:** Responses are formatted into the final `Payload Schema` and streamed/returned to the Next.js UI for rendering.

## 3. Error Handling Edge Cases
- **Geocoding Fails:** Return "I couldn't find that spot, bro. Can you be more specific?"
- **Marine API Fails:** Return "Looks like the buoys are down right now, getting no signal. Try again later."
