/**
 * Canonical types for forecast data sources.
 *
 * ForecastPoint is defined here — the single source of truth for all
 * adapters and consumers. fetch_marine_data.ts re-exports it for
 * backwards compatibility.
 *
 * Normalisation rules (see also findings.md § "Forecast source normalization"):
 *   - Wave / swell height: metres (adapters also provide `_ft`)
 *   - Wind speed: km/h (adapters also provide `knots`)
 *   - Period: seconds
 *   - Direction: degrees, meteorological convention (0° = from North)
 *   - Temperature: °C (adapters also provide °F)
 *   - Time resolution: 3-hour increments over 48 h, starting at the current hour
 *   - Null vs zero: missing data MUST be `null`, never `0`
 */

export interface ForecastPoint {
  time: string;
  wave_height_m:    number | null;
  wave_height_ft:   number | null;
  swell_height_m:   number | null;
  swell_height_ft:  number | null;
  swell_period_s:   number | null;
  swell_direction:  number | null;
  wind_speed_kmh:   number | null;
  wind_speed_knots: number | null;
  wind_direction:   number | null;
  temp_c:           number | null;
  temp_f:           number | null;
}

export interface ForecastSource {
  /** Human-readable identifier, e.g. "open-meteo-ecmwf" or "open-meteo-gfs". */
  name: string;

  /**
   * Fetch a 48-hour forecast for the given coordinates.
   *
   * Returns null on unrecoverable failure (network down, API quota exhausted,
   * etc.) so the caller can fall back to another source or return
   * FORECAST_FAILED to the user.
   *
   * On partial failure (some fields missing) returns the array with those
   * fields set to null — do NOT swallow and return an empty array.
   */
  fetch(lat: number, lon: number): Promise<ForecastPoint[] | null>;
}
