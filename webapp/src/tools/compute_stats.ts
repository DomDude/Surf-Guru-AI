import type { ForecastPoint } from './fetch_marine_data';

export interface SurfStats {
  condition_rating: 'POOR' | 'FAIR' | 'GOOD' | 'EPIC';
  condition_color: string;
  surf_height_human: string;
  wind_trend: string;
  wetsuit_rec: string;
  board_rec: string;
}

// Thresholds are intentionally conservative starting points.
// Dominik (surfs Algarve/Sagres regularly) should ground-truth these
// against known sessions and adjust. See findings.md § compute_stats thresholds.

const CONDITION_COLORS: Record<SurfStats['condition_rating'], string> = {
  POOR: '#ff4444',
  FAIR: '#E5A93D',
  GOOD: '#00C851',
  EPIC: '#33b5e5',
};

function computeConditionRating(
  swellHeightM: number | null,
  swellPeriodS: number | null,
  windSpeedKmh: number | null,
): SurfStats['condition_rating'] {
  // No swell data → can't say anything useful
  if (swellHeightM === null) return 'POOR';

  const h = swellHeightM;
  const p = swellPeriodS ?? 6; // pessimistic default if period is missing
  const w = windSpeedKmh ?? 0;

  let rating: SurfStats['condition_rating'];

  if (h < 0.3) {
    rating = 'POOR';
  } else if (h < 0.6) {
    rating = p >= 8 ? 'FAIR' : 'POOR';
  } else if (h < 1.2) {
    if (p >= 10) rating = 'GOOD';
    else if (p >= 7) rating = 'FAIR';
    else rating = 'POOR';
  } else if (h < 2.0) {
    if (p >= 14) rating = 'EPIC';
    else if (p >= 10) rating = 'GOOD';
    else rating = 'FAIR';
  } else {
    // > 2.0m
    rating = p >= 12 ? 'EPIC' : 'GOOD';
  }

  // Strong wind degrades by one level — offshore/onshore distinction
  // requires spot orientation, which we don't have here. Any strong wind
  // is conservatively treated as a negative factor.
  if (w > 35 && rating === 'EPIC') rating = 'GOOD';
  else if (w > 35 && rating === 'GOOD') rating = 'FAIR';
  else if (w > 35 && rating === 'FAIR') rating = 'POOR';

  return rating;
}

function degToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  // Meteorological convention: 0° = wind FROM the north
  return dirs[Math.round(deg / 22.5) % 16];
}

function computeWindTrend(
  windSpeedKmh: number | null,
  windDirection: number | null,
): string {
  if (windSpeedKmh === null) return 'Unknown';

  const dir = windDirection !== null ? degToCompass(windDirection) : '?';

  let strength: string;
  if (windSpeedKmh < 10) strength = 'Light';
  else if (windSpeedKmh < 20) strength = 'Moderate';
  else if (windSpeedKmh < 30) strength = 'Fresh';
  else strength = 'Strong';

  return `${strength} ${dir}`;
}

function computeSurfHeightHuman(waveHeightM: number | null): string {
  if (waveHeightM === null) return 'Unknown';

  if (waveHeightM < 0.3) return 'Ankle high or less';
  if (waveHeightM < 0.6) return 'Knee to waist high';
  if (waveHeightM < 0.9) return 'Waist to chest high';
  if (waveHeightM < 1.2) return 'Chest to head high';
  if (waveHeightM < 1.8) return 'Head high to overhead';
  if (waveHeightM < 2.5) return 'Overhead to double overhead';
  return 'Double overhead+';
}

function computeWetsuitRec(tempC: number | null): string {
  if (tempC === null) return 'Check local conditions';
  if (tempC < 10) return '5/4mm + hood';
  if (tempC < 14) return '4/3mm wetsuit';
  if (tempC < 18) return '3/2mm wetsuit';
  if (tempC < 22) return '2mm shorty or 3/2mm';
  if (tempC < 26) return 'Boardshorts + rash guard';
  return 'Boardshorts';
}

function computeBoardRec(waveHeightM: number | null, skillLevel: string): string {
  const h = waveHeightM ?? 0;

  if (h < 0.3) return 'Longboard or funboard';

  if (h < 0.6) {
    if (skillLevel === 'beginner') return 'Foamboard or longboard';
    if (skillLevel === 'advanced') return 'Longboard or mid-length';
    return 'Longboard or fish';
  }

  if (h < 1.2) {
    if (skillLevel === 'beginner') return 'Longboard';
    if (skillLevel === 'advanced') return 'Standard shortboard';
    return 'Fish or mid-length shortboard';
  }

  if (h < 1.8) {
    if (skillLevel === 'beginner') return 'Longboard — be cautious';
    if (skillLevel === 'advanced') return 'Standard shortboard or step-up';
    return 'Standard shortboard';
  }

  if (h < 2.5) {
    if (skillLevel === 'beginner') return 'Sit this one out';
    if (skillLevel === 'advanced') return 'Step-up';
    return 'Step-up';
  }

  // > 2.5m
  if (skillLevel === 'advanced') return 'Big wave gun or step-up';
  return 'Sit this one out';
}

export function computeStats(current: ForecastPoint, skillLevel: string): SurfStats {
  const condition_rating = computeConditionRating(
    current.swell_height_m,
    current.swell_period_s,
    current.wind_speed_kmh,
  );

  return {
    condition_rating,
    condition_color: CONDITION_COLORS[condition_rating],
    surf_height_human: computeSurfHeightHuman(current.wave_height_m),
    wind_trend: computeWindTrend(current.wind_speed_kmh, current.wind_direction),
    wetsuit_rec: computeWetsuitRec(current.temp_c),
    board_rec: computeBoardRec(current.wave_height_m, skillLevel),
  };
}
