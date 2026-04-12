# Open-Meteo Marine API SOP

## 1. Goal
Retrieve current and forecasted wave height, wave period, swell direction, wind speed, and wind direction for a specific location.

## 2. Endpoint Configuration
- **Base URL:** `https://marine-api.open-meteo.com/v1/marine`
- **Authentication:** None required (Free for non-commercial use).

## 3. Request Parameters
- `latitude` (float, required)
- `longitude` (float, required)
- `hourly` (string): Comma-separated list of variables
  - `wave_height`
  - `wave_period`
  - `wave_direction`
  - `wind_wave_height`
  - `wind_wave_direction`
  - `wind_wave_period`
  - `swell_wave_height`
  - `swell_wave_direction`
  - `swell_wave_period`

## 4. Derived Data Mapping to `gemini.md` Schema
- `wave_height_max` -> Maximum of `wave_height` in the forecasted window.
- `swell_wave_height` -> Current/Peak `swell_wave_height`.
- `swell_wave_period` -> Current/Peak `swell_wave_period`.
- `swell_wave_direction` -> Current/Peak `swell_wave_direction`.

*Note: Wind data may need to be fetched from the distinct Open-Meteo Weather API endpoint if it is not reliably returned by the Marine API.*

## 5. Errors
- `400 Bad Request`: Usually invalid coordinates or parameter formatting.
- `429 Too Many Requests`: Open-Meteo limits -> handle with basic exponential backoff, though unlikely in dev.
