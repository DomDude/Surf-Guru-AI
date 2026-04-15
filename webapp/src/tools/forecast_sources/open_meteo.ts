import { z } from 'zod';
import type { ForecastSource, ForecastPoint } from './types';
import type { MarineData } from '../fetch_marine_data';

// ---------------------------------------------------------------------------
// Zod schemas — moved here from fetch_marine_data.ts so they live with the
// source that produces them.
// ---------------------------------------------------------------------------

const NullableNum = z.number().nullable();

const MarineCurrentSchema = z.object({
  time: z.string(),
  interval: z.number(),
  wave_height: NullableNum,
  swell_wave_height: NullableNum,
  swell_wave_period: NullableNum,
  swell_wave_direction: NullableNum,
});

const MarineHourlySchema = z.object({
  time: z.array(z.string()),
  wave_height: z.array(NullableNum),
  swell_wave_height: z.array(NullableNum),
  swell_wave_period: z.array(NullableNum),
  swell_wave_direction: z.array(NullableNum),
});

const MarineApiResponseSchema = z.object({
  current: MarineCurrentSchema,
  hourly: MarineHourlySchema,
});

const WeatherCurrentSchema = z.object({
  time: z.string(),
  interval: z.number(),
  wind_speed_10m: NullableNum,
  wind_direction_10m: NullableNum,
  temperature_2m: NullableNum,
});

const WeatherHourlySchema = z.object({
  time: z.array(z.string()),
  wind_speed_10m: z.array(NullableNum),
  wind_direction_10m: z.array(NullableNum),
  temperature_2m: z.array(NullableNum),
});

const WeatherApiResponseSchema = z.object({
  current: WeatherCurrentSchema,
  hourly: WeatherHourlySchema,
});

// ---------------------------------------------------------------------------
// Unit converters — null-preserving.
// ---------------------------------------------------------------------------

const mToFt   = (m: number | null)   => m   === null ? null : parseFloat((m   * 3.28084).toFixed(1));
const kmhToKnots = (k: number | null) => k   === null ? null : parseFloat((k   * 0.539957).toFixed(1));
const cToF    = (c: number | null)   => c   === null ? null : parseFloat(((c * 9 / 5) + 32).toFixed(1));

// ---------------------------------------------------------------------------
// Core fetch logic — shared by the ForecastSource adapter and fetchMarineData.
// ---------------------------------------------------------------------------

/**
 * Fetches current conditions + 48 h forecast from Open-Meteo (ECMWF default
 * model). Returns the full MarineData shape so fetch_marine_data.ts can keep
 * its existing public API unchanged.
 *
 * Returns null on any unrecoverable error (network, invalid response shape).
 */
export async function fetchOpenMeteoData(lat: number, lon: number): Promise<MarineData | null> {
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction` +
    `&current=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction` +
    `&timezone=auto&forecast_days=2`;

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m,temperature_2m` +
    `&current=wind_speed_10m,wind_direction_10m,temperature_2m` +
    `&timezone=auto&forecast_days=2`;

  try {
    const [marineRes, weatherRes] = await Promise.all([
      fetch(marineUrl),
      fetch(weatherUrl),
    ]);

    if (!marineRes.ok || !weatherRes.ok) {
      console.error('open_meteo: HTTP error', marineRes.status, weatherRes.status);
      return null;
    }

    const marineData  = MarineApiResponseSchema.parse(await marineRes.json());
    const weatherData = WeatherApiResponseSchema.parse(await weatherRes.json());

    const mc = marineData.current;
    const wc = weatherData.current;

    const cWaveM  = mc.wave_height        ?? null;
    const cSwellM = mc.swell_wave_height  ?? null;
    const cWindK  = wc.wind_speed_10m     ?? null;
    const cTempC  = wc.temperature_2m     ?? null;

    const current: ForecastPoint = {
      time:              mc.time,
      wave_height_m:     cWaveM,
      wave_height_ft:    mToFt(cWaveM),
      swell_height_m:    cSwellM,
      swell_height_ft:   mToFt(cSwellM),
      swell_period_s:    mc.swell_wave_period    ?? null,
      swell_direction:   mc.swell_wave_direction ?? null,
      wind_speed_kmh:    cWindK,
      wind_speed_knots:  kmhToKnots(cWindK),
      wind_direction:    wc.wind_direction_10m   ?? null,
      temp_c:            cTempC,
      temp_f:            cToF(cTempC),
    };

    // Find the first hourly index at or before current.time so that
    // forecast_48h[0] is the current hour, not local midnight.
    const times = marineData.hourly.time;
    let startIdx = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] <= mc.time) startIdx = i;
      else break;
    }

    const forecast_48h: ForecastPoint[] = [];
    for (let i = startIdx; i < times.length; i += 3) {
      const wM  = marineData.hourly.wave_height[i]          ?? null;
      const sM  = marineData.hourly.swell_wave_height[i]    ?? null;
      const wKh = weatherData.hourly.wind_speed_10m[i]      ?? null;
      const tC  = weatherData.hourly.temperature_2m[i]      ?? null;

      forecast_48h.push({
        time:             times[i],
        wave_height_m:    wM,
        wave_height_ft:   mToFt(wM),
        swell_height_m:   sM,
        swell_height_ft:  mToFt(sM),
        swell_period_s:   marineData.hourly.swell_wave_period[i]    ?? null,
        swell_direction:  marineData.hourly.swell_wave_direction[i] ?? null,
        wind_speed_kmh:   wKh,
        wind_speed_knots: kmhToKnots(wKh),
        wind_direction:   weatherData.hourly.wind_direction_10m[i]  ?? null,
        temp_c:           tC,
        temp_f:           cToF(tC),
      });
    }

    return { current, forecast_48h };
  } catch (err) {
    // ZodError → Open-Meteo changed shape; log full details.
    console.error('open_meteo: fetch/parse error', JSON.stringify(err, null, 2));
    return null;
  }
}

// ---------------------------------------------------------------------------
// ForecastSource adapter — returns only forecast_48h to satisfy the interface.
// The `current` reading is a real-time reading, not a forecast point, so it
// doesn't belong in the multi-source ensemble array (Task 2A.5).
// ---------------------------------------------------------------------------

export const openMeteoSource: ForecastSource = {
  name: 'open-meteo-ecmwf',

  async fetch(lat: number, lon: number): Promise<ForecastPoint[] | null> {
    const data = await fetchOpenMeteoData(lat, lon);
    return data ? data.forecast_48h : null;
  },
};
