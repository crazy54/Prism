// Live inputs for app facets: read ctx.data when a runtime feeds it, simulate otherwise.
//
// Convention (src/apps/sources/README.md): a key that is ABSENT from ctx.data is
// simulated (catalog, tests, no source wired); a key that is NULL means a live source
// is running but cannot measure it on this machine — facets show "—" instead of
// inventing a number next to real ones.

import { simAudio, simSpectrum, simSeries, simMetric, simSystem, simMedia, simCalendar, NET_MAX, SIM_MACHINE } from './_sim.js';
import { clamp } from '../../scene/easing.js';

const has = (o, k) => o && Object.hasOwn(o, k);

/** ctx.data.audio → { level, levels, rate, peak, rms, live }. */
export function audioOf(ctx, { count = 96, rate = 30 } = {}) {
  const a = ctx.data?.audio;
  if (a && Array.isArray(a.levels) && a.levels.length) {
    const levels = a.levels.map((v) => clamp(+v || 0));
    const level = typeof a.level === 'number' ? clamp(a.level) : levels[levels.length - 1];
    return { level, levels, rate: a.rate || rate, peak: clamp(a.peak ?? Math.max(...levels.slice(-Math.round((a.rate || rate) * 0.6)))), rms: clamp(a.rms ?? level * 0.6), frac: 0, live: true };
  }
  return { ...simAudio(ctx.t, ctx.seed, { count, rate }), live: false };
}

/** Resample a band array to `count` bands (averaging down, interpolating up). */
export function resample(values, count) {
  const n = values.length;
  if (n === count) return values.slice();
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    if (n > count) {
      const a = Math.floor((i * n) / count), b = Math.max(a + 1, Math.floor(((i + 1) * n) / count));
      let s = 0, m = 0;
      for (let j = a; j < b; j++) { s += values[j]; m = Math.max(m, values[j]); }
      out[i] = 0.5 * (s / (b - a)) + 0.5 * m;
    } else {
      const x = count === 1 ? 0 : (i * (n - 1)) / (count - 1), j = Math.floor(x), f = x - j;
      out[i] = values[j] + ((values[Math.min(n - 1, j + 1)] ?? values[j]) - values[j]) * f;
    }
  }
  return out;
}

/** ctx.data.spectrum → { bands, peaks, live } with exactly `count` bands. */
export function spectrumOf(ctx, count = 24) {
  const s = ctx.data?.spectrum;
  if (s && Array.isArray(s.bands) && s.bands.length) {
    const bands = resample(s.bands.map((v) => clamp(+v || 0)), count);
    const peaks = Array.isArray(s.peaks) && s.peaks.length ? resample(s.peaks.map((v) => clamp(+v || 0)), count).map((p, i) => Math.max(p, bands[i])) : bands.slice();
    return { bands, peaks, live: true };
  }
  return { ...simSpectrum(ctx.t, ctx.seed, { count }), live: false };
}

/** A 0–1 metric ('cpu' | 'mem' | 'gpu' | 'disk' | 'battery'): number, or null when the live source can't measure it. */
export function metricOf(ctx, key) {
  const d = ctx.data;
  if (has(d, key)) return typeof d[key] === 'number' && Number.isFinite(d[key]) ? clamp(d[key]) : null;
  if (key === 'battery') return simSystem(ctx.t, ctx.seed).battery;
  return simMetric(key, ctx.t, ctx.seed);
}

/** Temperature in °C (or null). */
export function tempOf(ctx) {
  const d = ctx.data;
  if (has(d, 'temp')) return typeof d.temp === 'number' && Number.isFinite(d.temp) ? d.temp : null;
  return 30 + 70 * simMetric('temp', ctx.t, ctx.seed);
}

/** Network rates { down, up } in bytes/s (or null). */
export function netOf(ctx) {
  const d = ctx.data;
  if (has(d, 'net')) return d.net && Number.isFinite(d.net.down) ? { down: Math.max(0, d.net.down), up: Math.max(0, +d.net.up || 0) } : null;
  return { down: simMetric('down', ctx.t, ctx.seed) * NET_MAX.down, up: simMetric('up', ctx.t, ctx.seed) * NET_MAX.up };
}

/**
 * History of a metric, oldest first, as 0–1 values: ctx.data.series[key] when a source
 * keeps one (byte rates are normalized against the window's max), simulated otherwise.
 * → { values, frac, live, max? }
 */
export function seriesOf(ctx, key, count = 30, step = 0.5) {
  const live = ctx.data?.series?.[key];
  if (Array.isArray(live) && live.length >= 2) {
    let vals = live.slice(-count).map((v) => (Number.isFinite(+v) ? +v : 0));
    while (vals.length < count) vals = [vals[0], ...vals];
    if (['down', 'up', 'read', 'write'].includes(key)) {
      const max = Math.max(1, ...vals);
      return { values: vals.map((v) => v / max), frac: 0, live: true, max };
    }
    return { values: vals.map((v) => clamp(v)), frac: 0, live: true };
  }
  if (ctx.data && has(ctx.data, key === 'down' || key === 'up' ? 'net' : key) && !Array.isArray(live)) {
    // a live value without history: hold it flat
    const v = key === 'down' || key === 'up' ? (netOf(ctx)?.[key] ?? 0) / NET_MAX[key] : metricOf(ctx, key) ?? 0;
    return { values: new Array(count).fill(clamp(v)), frac: 0, live: true };
  }
  const s = simSeries(key, ctx.t, ctx.seed, count, step);
  return { ...s, live: false, max: NET_MAX[key] };
}

/** Machine details (cores, model, totals); simulated values fill what a source didn't send. */
export function sysOf(ctx) {
  const live = ctx.data?.sys;
  const sim = has(ctx.data, 'cpu') ? null : simSystem(ctx.t, ctx.seed).sys;
  return { ...(sim || { ...SIM_MACHINE, cores: null }), ...(live || {}) };
}

/** ctx.data.media → { title, artist, album, position, duration, playing, live }. */
export function mediaOf(ctx, { playing } = {}) {
  const m = ctx.data?.media;
  if (m && typeof m.title === 'string') return { artist: '', album: '', position: 0, duration: 0, playing: !!m.playing, ...m, live: true };
  return { ...simMedia(ctx.t, ctx.seed, { playing: playing ?? true }), live: false };
}

/** ctx.data.calendar → { next: { title, at, end }, current?, live }. */
export function calendarOf(ctx) {
  const c = ctx.data?.calendar;
  if (c && (c.next || c.current)) return { ...c, live: true };
  return { ...simCalendar(ctx.now, ctx.clock?.tzOffset ?? 0), live: false };
}

/** Byte rate → short text: 48.2 MB/s, 812 KB/s (decimal units, like task managers). */
export function rateText(bps, { bits = false } = {}) {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return '—';
  const v = bits ? bps * 8 : bps, u = bits ? ['b', 'Kb', 'Mb', 'Gb'] : ['B', 'KB', 'MB', 'GB'];
  let i = 0, x = v;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return `${x >= 100 || i === 0 ? Math.round(x) : x.toFixed(1)} ${u[i]}/s`;
}

/** Bytes → "11.2 GB" / "932 GB" / "1.8 TB". */
export function bytesText(b) {
  if (!Number.isFinite(b)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, x = b;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return `${x >= 100 || i === 0 ? Math.round(x) : x.toFixed(1)} ${u[i]}`;
}

/** 0–1 → "42%" (or "—"). */
export const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(clamp(v) * 100)}%`);
