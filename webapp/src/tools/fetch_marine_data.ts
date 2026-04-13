export interface ForecastPoint {
    time: string;
    wave_height_m: number | null;
    wave_height_ft: number | null;
    swell_height_m: number | null;
    swell_height_ft: number | null;
    swell_period_s: number | null;
    swell_direction: number | null;
    wind_speed_kmh: number | null;
    wind_speed_knots: number | null;
    wind_direction: number | null;
    temp_c: number | null;
    temp_f: number | null;
}

export interface MarineData {
    current: ForecastPoint;
    forecast_48h: ForecastPoint[]; // Data points every 3 hours for the next two days
}

export async function fetchMarineData(lat: number, lon: number): Promise<MarineData | null> {
    // &current= gives us the true "right now" reading — without it, hourly[0] is local midnight, not now.
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction&current=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction&timezone=auto&forecast_days=2`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m&current=wind_speed_10m,wind_direction_10m,temperature_2m&timezone=auto&forecast_days=2`;

    try {
        const [marineRes, weatherRes] = await Promise.all([
            fetch(marineUrl),
            fetch(weatherUrl)
        ]);

        if (!marineRes.ok || !weatherRes.ok) {
            console.error("Failed fetching external data.");
            return null;
        }

        const marineData = await marineRes.json();
        const weatherData = await weatherRes.json();

        // Converters — return null when the source value is null/undefined so missing data
        // is never silently rendered as zero.
        const mToFt = (m: number | null): number | null => m === null ? null : parseFloat((m * 3.28084).toFixed(1));
        const kmhToKnots = (kmh: number | null): number | null => kmh === null ? null : parseFloat((kmh * 0.539957).toFixed(1));
        const cToF = (c: number | null): number | null => c === null ? null : parseFloat(((c * 9 / 5) + 32).toFixed(1));

        // Build true current conditions from the Open-Meteo `current` object (not hourly[0]).
        // The `current` object reflects the actual moment of the request, expressed in the
        // spot's local timezone (timezone=auto). hourly[0] would be local midnight — up to
        // 24 h stale.
        const mc = marineData.current;
        const wc = weatherData.current;

        const cWaveM = mc.wave_height ?? null;
        const cSwellM = mc.swell_wave_height ?? null;
        const cWindKmh = wc.wind_speed_10m ?? null;
        const cTempC = wc.temperature_2m ?? null;

        const current: ForecastPoint = {
            time: mc.time,
            wave_height_m: cWaveM,
            wave_height_ft: mToFt(cWaveM),
            swell_height_m: cSwellM,
            swell_height_ft: mToFt(cSwellM),
            swell_period_s: mc.swell_wave_period ?? null,
            swell_direction: mc.swell_wave_direction ?? null,
            wind_speed_kmh: cWindKmh,
            wind_speed_knots: kmhToKnots(cWindKmh),
            wind_direction: wc.wind_direction_10m ?? null,
            temp_c: cTempC,
            temp_f: cToF(cTempC)
        };

        const times: string[] = marineData.hourly.time;
        const forecast_48h: ForecastPoint[] = [];

        // Find the first hourly entry that is at or before current.time so that
        // forecast_48h[0] is the current hour, not local midnight.
        // Both times are ISO-8601 in the same local timezone (timezone=auto), so
        // lexicographic comparison is correct.
        let startIdx = 0;
        for (let i = 0; i < times.length; i++) {
            if (times[i] <= mc.time) {
                startIdx = i;
            } else {
                break;
            }
        }

        // Sample every 3 hours to reduce payload size while maintaining forecast accuracy.
        for (let i = startIdx; i < times.length; i += 3) {
            const waveM = marineData.hourly.wave_height[i] ?? null;
            const swellM = marineData.hourly.swell_wave_height[i] ?? null;
            const windKmh = weatherData.hourly.wind_speed_10m[i] ?? null;
            const tempC = weatherData.hourly.temperature_2m[i] ?? null;

            forecast_48h.push({
                time: times[i],
                wave_height_m: waveM,
                wave_height_ft: mToFt(waveM),
                swell_height_m: swellM,
                swell_height_ft: mToFt(swellM),
                swell_period_s: marineData.hourly.swell_wave_period[i] ?? null,
                swell_direction: marineData.hourly.swell_wave_direction[i] ?? null,
                wind_speed_kmh: windKmh,
                wind_speed_knots: kmhToKnots(windKmh),
                wind_direction: weatherData.hourly.wind_direction_10m[i] ?? null,
                temp_c: tempC,
                temp_f: cToF(tempC)
            });
        }

        return {
            current,
            forecast_48h
        };
    } catch (err) {
        console.error("Fetch marine data error:", err);
        return null;
    }
}
