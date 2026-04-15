/**
 * Public API for fetching marine + weather data.
 *
 * The actual fetch/parse logic lives in forecast_sources/open_meteo.ts (Task 2A.2).
 * This file keeps its existing public interface so route.ts and test_fetch.ts
 * don't need to change.
 *
 * Phase 2A.5: the aggregation layer will call openMeteoSource.fetch() and
 * other adapters directly; this wrapper remains for the single-source path.
 */

export type { ForecastPoint } from './forecast_sources/types';
import type { ForecastPoint } from './forecast_sources/types';
import { fetchOpenMeteoData } from './forecast_sources/open_meteo';

export interface MarineData {
  current:      ForecastPoint;
  forecast_48h: ForecastPoint[];
}

export async function fetchMarineData(lat: number, lon: number): Promise<MarineData | null> {
  return fetchOpenMeteoData(lat, lon);
}
