'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface SpotInfo {
  name: string;
  coordinates: {
    lat: number;
    lon: number;
  }
}

interface RawData {
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

interface AIStats {
  condition_rating: string;
  condition_color: string;
  surf_height_human: string;
  wind_trend: string;
  wetsuit_rec: string;
  board_rec: string;
}

interface ChatResponse {
  forecast_report?: string;
  spot_info?: SpotInfo;
  raw_data?: RawData;
  ai_stats?: AIStats;
  error?: string;
  message?: string;
}

// Returns "—" for null/undefined, otherwise the value formatted with a suffix.
function fmt(val: number | null | undefined, suffix: string): string {
  if (val === null || val === undefined) return '—';
  return `${val}${suffix}`;
}

export default function Home() {
  const [location, setLocation] = useState('');
  const [query, setQuery] = useState('');
  const [skillLevel, setSkillLevel] = useState('intermediate');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ChatResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location_name: location,
          user_query: query,
          skill_level: skillLevel
        }),
      });

      const data = await res.json();
      setResponse(data);
    } catch (error) {
      console.error('Failed to fetch forecast:', error);
      setResponse({ message: 'Failed to connect to the Surf Guru. Check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  // Resolve the user-facing error message from either path (API error or network failure).
  const errorMessage = response?.message ?? response?.error;
  const hasError = !!(response && (response.error || response.message) && !response.forecast_report);

  return (
    <main className="container">
      <header className="header">
        <h1>Surf Guru AI</h1>
        <p>Your local surf guide</p>
      </header>

      <div className="app-grid">
        {/* Left Panel: Input Form and Status */}
        <section className="glass-panel left-panel">
          <form onSubmit={handleSubmit} className="surf-form">
            <div className="input-group">
              <label className="input-label" htmlFor="location">Spot / Location *</label>
              <div className="input-with-clear">
                <input
                  id="location"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Pipeline, Hawaii"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
                {location && (
                  <button
                    type="button"
                    className="clear-btn"
                    tabIndex={-1}
                    aria-label="Clear location"
                    onClick={() => setLocation('')}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="skill">Your Skill Level</label>
              <select
                id="skill"
                className="input-field"
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="pro">Pro</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="query">Specific Question</label>
              <textarea
                id="query"
                className="input-field"
                placeholder="Is it too big for my 6'2 shortboard today?"
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <button type="submit" className="submit-btn" disabled={loading || !location.trim()}>
              {loading ? 'Asking the Guru...' : 'Get Forecast'}
            </button>
          </form>

          {/* Surfline Clone Block */}
          {response && response.raw_data && response.ai_stats && (
            <div className="surfline-clone">

              {/* Top Condition Rating Bar */}
              <div className="sl-rating-bar">
                <div className="sl-rating-label">CONDITION RATING</div>
                <div className="sl-rating-value" style={{ color: response.ai_stats.condition_color }}>
                  {response.ai_stats.condition_rating}
                  <div className="sl-rating-blocks">
                    <span style={{ backgroundColor: response.ai_stats.condition_color }}></span>
                    <span style={{ backgroundColor: response.ai_stats.condition_color }}></span>
                    <span style={{ backgroundColor: response.ai_stats.condition_color }}></span>
                    <span style={{ backgroundColor: '#e0e0e0' }}></span>
                  </div>
                </div>
              </div>

              {/* Middle Grid */}
              <div className="sl-grid">

                {/* Height Box */}
                <div className="sl-box">
                  <div className="sl-box-title">SURF HEIGHT</div>
                  <div className="sl-height-val">{fmt(response.raw_data.wave_height_m, 'm')}</div>
                  <div className="sl-height-human">
                    {response.ai_stats.surf_height_human}
                    {response.raw_data.wave_height_ft !== null && (
                      <> ({fmt(response.raw_data.wave_height_ft, 'ft')})</>
                    )}
                  </div>
                </div>

                {/* Swell Box */}
                <div className="sl-box">
                  <div className="sl-box-title">SWELL</div>
                  <div className="sl-swell-row">
                    <strong>{fmt(response.raw_data.swell_height_m, 'm')}</strong> {fmt(response.raw_data.swell_period_s, 's')}
                    <span className="sl-dir">↗ {fmt(response.raw_data.swell_direction, '°')}</span>
                  </div>
                </div>

                {/* Wind Box */}
                <div className="sl-box">
                  <div className="sl-box-title">WIND</div>
                  <div className="sl-wind-val">{fmt(response.raw_data.wind_speed_knots, 'kts')}</div>
                  <div className="sl-wind-human">{response.ai_stats.wind_trend} ({fmt(response.raw_data.wind_direction, '°')})</div>
                </div>

                {/* Tide Box — real data coming in Phase 2 (Task 2B.3) */}
                <div className="sl-box">
                  <div className="sl-box-title">TIDE</div>
                  <div className="sl-tide-coming-soon">Tide data coming soon</div>
                </div>

                {/* Temp Box */}
                <div className="sl-box">
                  <div className="sl-box-title">TEMPERATURE</div>
                  <div className="sl-temp-row">
                    <span>{fmt(response.raw_data.temp_c, '°C')}</span>
                    <span>{fmt(response.raw_data.temp_f, '°F')}</span>
                  </div>
                  <div className="sl-wetsuit-badge">{response.ai_stats.wetsuit_rec}</div>
                </div>

              </div>

              {/* Bottom Board Recommendation */}
              <div className="sl-board-bar">
                <span>{response.ai_stats.board_rec} in {fmt(response.raw_data.wave_height_m, 'm')} waves.</span>
              </div>

            </div>
          )}
        </section>

        {/* Right Panel: Report Area */}
        <section className="glass-panel report-area">
          {loading ? (
            <div className="loader">
              <span></span><span></span><span></span>
            </div>
          ) : response ? (
            hasError ? (
              <div className="empty-state error-state">{errorMessage}</div>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown>{response.forecast_report || ""}</ReactMarkdown>
              </div>
            )
          ) : (
            <div className="empty-state">
              Where are we surfing today? Drop a spot on the left, and I'll give you the read.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
