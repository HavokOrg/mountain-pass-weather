/**
 * WMO weather interpretation codes (used by Open-Meteo) mapped to labels.
 * Glyphs are emoji placeholders until the original SVG icon set lands in Phase 3.
 */

export type SkyKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface WeatherDescription {
  label: string;
  glyph: string;
  kind: SkyKind;
}

interface CodeInfo {
  day: string;
  night?: string;
  glyphDay: string;
  glyphNight?: string;
  kind: SkyKind;
}

const CODES: Readonly<Record<number, CodeInfo>> = {
  0: { day: 'Sunny', night: 'Clear', glyphDay: '☀️', glyphNight: '🌙', kind: 'clear' },
  1: { day: 'Mostly Sunny', night: 'Mostly Clear', glyphDay: '🌤️', glyphNight: '🌙', kind: 'clear' },
  2: { day: 'Partly Cloudy', glyphDay: '⛅', glyphNight: '☁️', kind: 'partly' },
  3: { day: 'Cloudy', glyphDay: '☁️', kind: 'cloudy' },
  45: { day: 'Fog', glyphDay: '🌫️', kind: 'fog' },
  48: { day: 'Freezing Fog', glyphDay: '🌫️', kind: 'fog' },
  51: { day: 'Light Drizzle', glyphDay: '🌦️', glyphNight: '🌧️', kind: 'drizzle' },
  53: { day: 'Drizzle', glyphDay: '🌧️', kind: 'drizzle' },
  55: { day: 'Heavy Drizzle', glyphDay: '🌧️', kind: 'drizzle' },
  56: { day: 'Light Freezing Drizzle', glyphDay: '🌧️', kind: 'drizzle' },
  57: { day: 'Freezing Drizzle', glyphDay: '🌧️', kind: 'drizzle' },
  61: { day: 'Light Rain', glyphDay: '🌦️', glyphNight: '🌧️', kind: 'rain' },
  63: { day: 'Rain', glyphDay: '🌧️', kind: 'rain' },
  65: { day: 'Heavy Rain', glyphDay: '🌧️', kind: 'rain' },
  66: { day: 'Light Freezing Rain', glyphDay: '🌧️', kind: 'rain' },
  67: { day: 'Freezing Rain', glyphDay: '🌧️', kind: 'rain' },
  71: { day: 'Light Snow', glyphDay: '🌨️', kind: 'snow' },
  73: { day: 'Snow', glyphDay: '🌨️', kind: 'snow' },
  75: { day: 'Heavy Snow', glyphDay: '❄️', kind: 'snow' },
  77: { day: 'Snow Grains', glyphDay: '🌨️', kind: 'snow' },
  80: { day: 'Light Showers', glyphDay: '🌦️', glyphNight: '🌧️', kind: 'rain' },
  81: { day: 'Showers', glyphDay: '🌧️', kind: 'rain' },
  82: { day: 'Heavy Showers', glyphDay: '🌧️', kind: 'rain' },
  85: { day: 'Snow Showers', glyphDay: '🌨️', kind: 'snow' },
  86: { day: 'Heavy Snow Showers', glyphDay: '❄️', kind: 'snow' },
  95: { day: 'Thunderstorms', glyphDay: '⛈️', kind: 'storm' },
  96: { day: 'Thunderstorms with Hail', glyphDay: '⛈️', kind: 'storm' },
  99: { day: 'Severe Thunderstorms', glyphDay: '⛈️', kind: 'storm' },
};

export function describeWeather(code: number, isDay: boolean): WeatherDescription {
  const info = CODES[code];
  if (!info) return { label: 'Unknown', glyph: '❔', kind: 'cloudy' };
  return {
    label: isDay ? info.day : (info.night ?? info.day),
    glyph: isDay ? info.glyphDay : (info.glyphNight ?? info.glyphDay),
    kind: info.kind,
  };
}
