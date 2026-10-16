// Weather for D5's screens: a normalized ctx.data.weather (simulated from the date when no source is
// wired — a fictional place, plausible numbers) and weather pictograms drawn on the 48-unit glyph grid
// with semantic roles, so every theme paints them (prism glass, paper ink, mono, neon …).
//
// ctx.data.weather (metric; every field but temp optional):
//   { temp °C, code, label?, hi?, lo?, feels?, humidity? 0–1, wind? { speed km/h, dir ° (from) }, precip? 0–1,
//     uv?, sunrise?, sunset? (epoch ms), place?, hourly?: [{ at (epoch ms) | h (local hour), temp, code, precip? }] }
// code: WMO 4677 as most weather APIs send it — 0 clear · 1–2 partly cloudy · 3 overcast · 45/48 fog ·
// 51–57 drizzle · 61–67 rain · 71–77 snow · 80–82 showers · 85–86 snow showers · 95–99 thunderstorm —
// or a word: clear | partly | cloudy | fog | drizzle | rain | snow | storm.

import { hash } from '../../scene/noise.js';
import { clamp, lerp } from '../../scene/easing.js';

const HOUR = 3600000, DAY = 86400000;

/** WMO code (or word) → pictogram kind. */
export function kindOf(code) {
  if (typeof code === 'string') return ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm'].includes(code) ? code : 'cloudy';
  const c = Number(code);
  if (c === 0) return 'clear';
  if (c === 1 || c === 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'cloudy';
}
export const LABEL = { clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm' };
/** The Spectrum hue a pictogram lights in. */
export const KIND_HUE = { clear: 72, partly: 72, cloudy: 243.6, fog: 191.3, drizzle: 217.5, rain: 243.6, snow: 217.5, storm: 86.5, night: 269.8 };
const CODE = { clear: 0, partly: 2, cloudy: 3, fog: 45, drizzle: 53, rain: 63, snow: 73, storm: 95 };

/** A fictional day's weather for the date of `now` (stable all day, varying day to day). */
function simulate(ctx) {
  const tz = (ctx.clock?.tzOffset ?? 0) * 60000, local = ctx.now + tz, day = Math.floor(local / DAY), midnight = day * DAY - tz;
  const r = (k) => hash(day, 4231 + k);
  const lo = Math.round(6 + r(1) * 10), hi = lo + Math.round(6 + r(2) * 7);
  // coolest at 05:00, warmest at 15:00 (two half-cosines)
  const tempAt = (ms) => {
    const h = ((((ms + tz) % DAY) + DAY) % DAY) / HOUR;
    const f = h >= 5 && h <= 15 ? 0.5 - 0.5 * Math.cos((Math.PI * (h - 5)) / 10) : 0.5 + 0.5 * Math.cos((Math.PI * ((h - 15 + 24) % 24)) / 14);
    return lerp(lo, hi, f);
  };
  const kinds = ['partly', 'partly', 'clear', 'cloudy', 'rain', 'partly', 'drizzle', 'clear'];
  const base = kinds[Math.floor(r(3) * kinds.length)];
  const kindAt = (ms) => { const h = Math.floor(((ms + tz) % DAY) / HOUR); const v = hash(day, h, 77); return v < 0.62 ? base : v < 0.8 ? 'partly' : v < 0.92 ? 'cloudy' : 'rain'; };
  const hourly = Array.from({ length: 12 }, (_, i) => { const at = Math.floor(ctx.now / HOUR) * HOUR + (i + 1) * HOUR; const k = kindAt(at); return { at, temp: Math.round(tempAt(at)), code: CODE[k], precip: k === 'rain' ? 0.6 + 0.3 * hash(day, i, 5) : k === 'drizzle' ? 0.4 : 0.05 + 0.15 * hash(day, i, 6) }; });
  const kind = kindAt(ctx.now), temp = Math.round(tempAt(ctx.now));
  return {
    temp, code: CODE[kind], label: LABEL[kind], hi, lo, feels: temp - (r(4) > 0.5 ? 1 : 0),
    humidity: 0.45 + r(5) * 0.4, wind: { speed: Math.round(5 + r(6) * 22), dir: Math.round(r(7) * 359) }, precip: kind === 'rain' ? 0.7 : 0.1 + r(8) * 0.25, uv: Math.round(1 + r(9) * 6),
    sunrise: midnight + (6 * 60 + 12 + Math.round(r(10) * 30)) * 60000, sunset: midnight + (19 * 60 + 18 + Math.round(r(11) * 30)) * 60000,
    place: 'Lakeside', hourly,
  };
}

/** ctx.data.weather, normalized: { …fields, kind, label, live } (simulated when absent). */
export function weatherOf(ctx) {
  const w = ctx.data?.weather;
  const sim = simulate(ctx);
  if (!w || typeof w.temp !== 'number') return { ...sim, kind: kindOf(sim.code), live: false };
  const out = { ...w, live: true };
  out.kind = kindOf(w.code ?? 'cloudy');
  out.label = w.label || LABEL[out.kind];
  if (Array.isArray(w.hourly)) out.hourly = w.hourly.filter((x) => x && Number.isFinite(x.temp));
  return out;
}

/** The local hour (0–23) of an hourly entry. */
export const hourOf = (ctx, e) => (Number.isFinite(e.h) ? e.h : Math.floor((((e.at + (ctx.clock?.tzOffset ?? 0) * 60000) % DAY) + DAY) % DAY / HOUR));
/** True between sunset and sunrise (for the moon). */
export function isNight(ctx, w) {
  const tz = (ctx.clock?.tzOffset ?? 0) * 60000, h = (((ctx.now + tz) % DAY) + DAY) % DAY / HOUR;
  const rise = Number.isFinite(w.sunrise) ? (((w.sunrise + tz) % DAY) + DAY) % DAY / HOUR : 6.3, set = Number.isFinite(w.sunset) ? (((w.sunset + tz) % DAY) + DAY) % DAY / HOUR : 19.5;
  return h < rise || h >= set;
}
export const toF = (c) => Math.round(c * 1.8 + 32);
export const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// ── pictograms (48-unit grid, safe area 6–42, roles not colors) ──────────────

const CLOUD = (g, dx = 0, dy = 0, role = 'line', s = 1) => g.group({ x: dx, y: dy, scale: s, origin: [24, 28] }, () => {
  g.path('M15.5 35.5H33A7 7 0 0 0 33.8 21.55A10 10 0 0 0 14.6 24.1A5.75 5.75 0 0 0 15.5 35.5Z', { role, join: 'round' });
});

function sun(g, cx, cy, r, rays = [0, 45, 90, 135, 180, 225, 270, 315]) {
  g.circle(cx, cy, r, { role: 'accent', fill: true });
  for (const a of rays) { const [x1, y1] = g.polar(cx, cy, r + 3, a), [x2, y2] = g.polar(cx, cy, r + 5.6, a); g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.85 }); }
}
function moon(g, cx, cy, r) {
  g.path(`M${cx + r * 0.25} ${cy - r}A${r} ${r} 0 1 0 ${cx + r} ${cy + r * 0.35}A${r * 0.78} ${r * 0.78} 0 0 1 ${cx + r * 0.25} ${cy - r}Z`, { role: 'accent', fill: true });
}

/** Draw a weather kind with a Pen (as a glyph would). */
export function drawWeather(g, kind, { night = false, t = 0 } = {}) {
  switch (kind) {
    case 'clear':
      if (night) { moon(g, 24, 24, 13); g.dot(36, 12, 1.4); g.dot(38.5, 22, 1); return; }
      sun(g, 24, 24, 8.5); return;
    case 'partly':
      if (night) moon(g, 30, 17.5, 8); else sun(g, 30.5, 18, 5.4, [0, 45, 90, 315, 270]);
      CLOUD(g, -3, 3, 'line', 0.92); return;
    case 'cloudy':
      CLOUD(g, 4, -6, 'dim', 0.78);
      CLOUD(g, -2, 2, 'line', 1); return;
    case 'fog':
      g.line(10, 17, 38, 17); g.line(13, 24, 35, 24, { role: 'dim' }); g.line(9, 31, 39, 31); g.line(15, 38, 31, 38, { role: 'dim' }); return;
    case 'drizzle': case 'rain': {
      CLOUD(g, 0, -5, 'line', 1);
      const drops = kind === 'rain' ? [[17, 0], [24, 0.33], [31, 0.66]] : [[19, 0], [29, 0.5]];
      for (const [x, ph] of drops) { const y = 34 + ((t * 0.9 + ph) % 1) * 1.5; g.line(x, y, x - 2, y + (kind === 'rain' ? 6 : 3.5), { role: 'accent', weight: 0.9 }); }
      return;
    }
    case 'snow':
      CLOUD(g, 0, -5, 'line', 1);
      for (const [x, y] of [[17, 36], [24, 39.5], [31, 36]]) g.dot(x, y, 1.9, { role: 'accent' });
      return;
    case 'storm':
      CLOUD(g, 0, -6, 'line', 1);
      g.polygon([[25.5, 27], [19, 35.5], [23.5, 35.5], [21, 42], [29.5, 32], [25, 32], [27.5, 27]], { role: 'accent', fill: true, join: 'round' });
      return;
    default: CLOUD(g);
  }
}
export { clamp };
