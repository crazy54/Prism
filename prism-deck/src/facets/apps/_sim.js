// Simulated live data for the apps gallery — pure functions of (t, seed), so a facet
// with no data source wired still looks alive, and the simulated sources in
// src/apps/sources/ feed exactly the same numbers into ctx.data.
//
//   simAudio(t, seed, { count, rate })     → ctx.data.audio    { level, levels, rate, peak, rms }
//   simSpectrum(t, seed, { count })        → ctx.data.spectrum { bands, peaks }
//   simSystem(t, seed)                     → { cpu, mem, gpu, disk, net, temp, battery, uptime, sys }
//   simSeries(key, t, seed, count, step)   → { values (0–1), frac } — scrolling history of one metric
//   simMedia(t, seed)                      → ctx.data.media    { title, artist, album, position, duration, playing }
//   simCalendar(now, tzOffset)             → ctx.data.calendar { next: { title, at, end }, current? }
//
// The music is a fictional 120 BPM groove that loops seamlessly every PHRASE seconds
// (kick on 1 and 3, snare on 2 and 4, eighth hats, a swell over eight bars). Every
// name below is invented; nothing refers to a real artist, product or person.

import { hash, metric, fbm1 } from '../../scene/noise.js';
import { clamp, smoothstep } from '../../scene/easing.js';

export const BPM = 120;
export const BEAT = 60 / BPM;
/** The synthetic groove repeats exactly every PHRASE seconds (8 bars). */
export const PHRASE = 16;

const wrap = (x, p) => ((x % p) + p) % p;
const fade = (f) => f * f * (3 - 2 * f);

/** Periodic value noise: lattice step 1, repeats every `period` lattice cells. */
export function pnoise(x, period, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(wrap(i, period), seed), b = hash(wrap(i + 1, period), seed);
  return a + (b - a) * fade(f);
}

/** The groove's voices at time x (s): envelopes 0–1 for kick, snare, hats, plus the phrase energy. */
export function voices(x, seed = 0) {
  const tx = wrap(x, PHRASE);
  const xb = tx / BEAT;
  const beat = Math.floor(xb), pb = xb - beat;
  const bar = Math.floor(beat / 4), inBar = beat % 4;
  const fill = bar === 7 && inBar >= 2;                         // the last bar breaks into a snare fill
  const kickOn = !fill && (inBar === 0 || inBar === 2 || (inBar === 3 && hash(bar, seed + 5) > 0.55));
  const kick = kickOn ? Math.exp(-pb * 7.5) : 0;
  const p16 = (xb * 4) % 1;
  const snare = fill ? Math.exp(-p16 * 9) * (0.55 + 0.45 * (xb % 1)) : (inBar === 1 || inBar === 3 ? Math.exp(-pb * 8) : 0);
  const p8 = (xb * 2) % 1;
  const hat = Math.exp(-p8 * 14) * (Math.floor(xb * 2) % 2 ? 0.7 : 1);
  const energy = 0.58 + 0.42 * (0.5 - 0.5 * Math.cos((tx / PHRASE) * Math.PI * 2));
  return { kick, snare, hat, energy, bar, beat, pb };
}

/** Peak level (0–1, perceptual) of the groove at time x. */
export function grooveLevel(x, seed = 0) {
  const v = voices(x, seed);
  const room = 0.05 + 0.07 * pnoise(wrap(x, PHRASE) * 3, PHRASE * 3, seed);
  const body = 0.52 * v.kick * v.energy + 0.34 * v.snare * (0.7 + 0.3 * v.energy) + 0.12 * v.hat + 0.13 * v.energy;
  const grain = (pnoise(wrap(x, PHRASE) * 30, PHRASE * 30, seed + 1) - 0.5) * 0.26;
  // shaped like src/audio/analyzer.js output (AGC-normalized linear peaks: floor ≈ 0.4, body ≈ 0.5, hits ≈ 0.95)
  return clamp(0.3 + 0.75 * (room + body + grain * (0.35 + body)));
}

/** The RMS-like body under the peak envelope (for an inner core). */
export const grooveBody = (x, seed = 0) => grooveLevel(x, seed) * (0.5 + 0.18 * pnoise(wrap(x, PHRASE) * 6, PHRASE * 6, seed + 2));

/**
 * ctx.data.audio, simulated: `count` peak levels sampled every 1/rate s, oldest first,
 * ending at t (quantized to the sample grid, so it scrolls like a real ring buffer).
 */
export function simAudio(t, seed = 0, { count = 96, rate = 30 } = {}) {
  const end = Math.floor(t * rate + 1e-6);
  const levels = new Array(count);
  for (let i = 0; i < count; i++) levels[i] = grooveLevel((end - (count - 1 - i)) / rate, seed);
  let peak = 0;
  for (let i = Math.max(0, count - Math.round(rate * 0.6)); i < count; i++) peak = Math.max(peak, levels[i]);
  // level / peak / rms are meters on the analyzer's dB scale (−60 dBFS → 0): music sits around −15…−3 dB
  const db = (v) => clamp(0.48 + 0.52 * (v - 0.3) / 0.7);
  return { level: db(levels[count - 1]), levels, rate, peak: db(peak), rms: db(grooveBody(end / rate, seed)) * 0.85, frac: t * rate - end };
}

/** One band (f: 0 = lowest, 1 = highest) of the groove's spectrum at time x. */
function bandAt(x, f, b, seed) {
  const v = voices(x, seed);
  const tx = wrap(x, PHRASE);
  const tilt = (0.46 - 0.2 * f) * (0.55 + 0.45 * v.energy);
  const kick = v.kick * 0.58 * Math.exp(-(((f - 0.05) / 0.13) ** 2));
  const note = hash(Math.floor(tx / (BEAT / 2)), seed + 9);
  const bass = 0.3 * v.energy * Math.exp(-(((f - (0.1 + 0.1 * note)) / 0.06) ** 2)) * (0.6 + 0.4 * Math.exp(-((tx / (BEAT / 2)) % 1) * 3));
  const snare = v.snare * 0.34 * Math.exp(-(((f - 0.52) / 0.26) ** 2));
  const hat = v.hat * 0.42 * smoothstep(0.6, 0.96, f);
  const c1 = 0.3 + 0.14 * hash(v.bar, seed + 21), c2 = c1 + 0.12 + 0.06 * hash(v.bar, seed + 22);
  const shimmer = 0.75 + 0.25 * Math.sin((tx / PHRASE) * Math.PI * 2 * 16 + f * 9);
  const melody = 0.26 * v.energy * (Math.exp(-(((f - c1) / 0.05) ** 2)) + 0.7 * Math.exp(-(((f - c2) / 0.05) ** 2))) * shimmer;
  const grain = (pnoise(tx * 8, PHRASE * 8, seed + 40 + b * 31) - 0.5) * 0.16;
  return clamp(tilt + kick + bass + snare + hat + melody + grain);
}

/** ctx.data.spectrum, simulated: `count` bands 0–1 (low → high) and their falling peak-hold caps. */
export function simSpectrum(t, seed = 0, { count = 24 } = {}) {
  const bands = new Array(count), peaks = new Array(count);
  for (let b = 0; b < count; b++) {
    const f = count === 1 ? 0.5 : b / (count - 1);
    bands[b] = bandAt(t, f, b, seed);
    let pk = bands[b];
    for (let k = 1; k <= 8; k++) { const dt = k * 0.09; pk = Math.max(pk, bandAt(t - dt, f, b, seed) - 1.4 * dt * dt - 0.05 * dt); }
    peaks[b] = clamp(pk);
  }
  return { bands, peaks };
}

// ── system ───────────────────────────────────────────────────────────────────

const GIB = 1024 ** 3;
/** The fictional machine the simulated system monitor describes. */
export const SIM_MACHINE = { cpuModel: 'Prism Lab 8-core', cpuGhz: 3.6, cores: 8, memTotal: 32 * GIB, diskTotal: 1000e9, gpuName: 'Integrated GPU', host: 'deck-lab.example', platform: 'sim' };

const SIM = {
  cpu: (t, s) => metric(t, s, { lo: 0.12, hi: 0.96, speed: 0.22, jitter: 0.12 }),
  mem: (t, s) => metric(t, s + 3, { lo: 0.5, hi: 0.72, speed: 0.04, jitter: 0.02 }),
  gpu: (t, s) => metric(t, s + 5, { lo: 0.04, hi: 0.9, speed: 0.3, jitter: 0.22 }),
  disk: (t, s) => 0.63 + 0.004 * fbm1(t * 0.01, s + 7),
  down: (t, s) => { const b = metric(t, s + 9, { lo: 0, hi: 1, speed: 0.5, jitter: 0.3 }); return b * b; },
  up: (t, s) => { const b = metric(t, s + 3, { lo: 0.02, hi: 0.7, speed: 0.6, jitter: 0.3 }); return b * b; },
  read: (t, s) => { const b = metric(t, s + 13, { lo: 0, hi: 1, speed: 0.7, jitter: 0.4 }); return b ** 3; },
  write: (t, s) => { const b = metric(t, s + 17, { lo: 0, hi: 1, speed: 0.5, jitter: 0.4 }); return b ** 4; },
  temp: (t, s) => clamp((38 + 44 * metric(t - 2, s, { lo: 0.12, hi: 0.96, speed: 0.12, jitter: 0.04 }) - 30) / 70),
};
/** Byte-rate scales: the 0–1 series map onto these for display. */
export const NET_MAX = { down: 118e6, up: 22e6, read: 1.6e9, write: 0.9e9 };

/** A 0–1 metric at time t ('cpu' | 'mem' | 'gpu' | 'disk' | 'down' | 'up' | 'read' | 'write' | 'temp'). */
export const simMetric = (key, t, seed = 0) => clamp((SIM[key] || SIM.cpu)(t, seed));

/** The last `count` samples of a metric, every `step` s, oldest first; frac slides a sparkline between samples. */
export function simSeries(key, t, seed = 0, count = 30, step = 0.5) {
  const end = Math.floor(t / step);
  const values = new Array(count);
  for (let i = 0; i < count; i++) values[i] = simMetric(key, (end - (count - 1 - i)) * step, seed);
  return { values, frac: t / step - end, step };
}

/** Per-core loads around the total. */
export function simCores(t, seed = 0, count = SIM_MACHINE.cores) {
  const cpu = simMetric('cpu', t, seed);
  return Array.from({ length: count }, (_, i) => clamp(cpu + (metric(t, seed + 101 + i, { lo: 0, hi: 1, speed: 0.6, jitter: 0.3 }) - 0.5) * 0.7 - (i % 2) * 0.08));
}

/** ctx.data for every system key, simulated. */
export function simSystem(t, seed = 0) {
  const M = SIM_MACHINE;
  const mem = simMetric('mem', t, seed), disk = simMetric('disk', t, seed);
  return {
    cpu: simMetric('cpu', t, seed),
    mem,
    gpu: simMetric('gpu', t, seed),
    disk,
    net: { down: simMetric('down', t, seed) * NET_MAX.down, up: simMetric('up', t, seed) * NET_MAX.up },
    temp: 30 + 70 * simMetric('temp', t, seed),
    battery: 0.82 - 0.0004 * (t % 600),
    uptime: 4 * 3600 + 12 * 60 + t,
    sys: {
      ...M, cores: simCores(t, seed), memUsed: mem * M.memTotal, diskFree: (1 - disk) * M.diskTotal,
      diskRead: simMetric('read', t, seed) * NET_MAX.read, diskWrite: simMetric('write', t, seed) * NET_MAX.write,
    },
  };
}

// ── media ────────────────────────────────────────────────────────────────────

/** A fictional playlist (invented titles and artists). */
export const PLAYLIST = [
  { title: 'Glass Horizon', artist: 'Lumen Arcade', album: 'Refraction', duration: 214 },
  { title: 'Night Signal', artist: 'The Wavelengths', album: 'Low Light', duration: 187 },
  { title: 'Paper Satellites', artist: 'Mira Vale', album: 'Orbitals', duration: 243 },
  { title: 'Slow Aurora', artist: 'Kepler Youth', album: 'North', duration: 201 },
  { title: 'Spectral Drift', artist: 'Oda & the Prisms', album: 'White Light', duration: 228 },
];

/** ctx.data.media, simulated: the playlist on repeat, starting 64 s into the first track. */
export function simMedia(t, seed = 0, { playing = true } = {}) {
  const total = PLAYLIST.reduce((a, s) => a + s.duration, 0);
  let x = wrap(64 + t, total);
  let i = 0;
  while (x >= PLAYLIST[i].duration) { x -= PLAYLIST[i].duration; i++; }
  const s = PLAYLIST[i];
  return { title: s.title, artist: s.artist, album: s.album, position: x, duration: s.duration, playing, index: i };
}

// ── calendar ─────────────────────────────────────────────────────────────────

/** A fictional working day (local time, minutes after midnight, duration in minutes). */
export const AGENDA = [
  { at: 9 * 60, dur: 15, title: 'Standup' },
  { at: 10 * 60, dur: 45, title: 'Design review' },
  { at: 11 * 60 + 30, dur: 30, title: '1:1 with Ana' },
  { at: 13 * 60 + 30, dur: 60, title: 'Deck planning' },
  { at: 15 * 60, dur: 30, title: 'Lab sync' },
  { at: 16 * 60 + 30, dur: 45, title: 'Demo hour' },
];

/** ctx.data.calendar, simulated from the wall clock: { next: { title, at, end }, current? } (at/end epoch ms). */
export function simCalendar(now, tzOffset = 0) {
  const day = 86400000, local = now + tzOffset * 60000;
  const midnight = Math.floor(local / day) * day - tzOffset * 60000;
  const mins = (local - Math.floor(local / day) * day) / 60000;
  const ev = (e, d = 0) => ({ title: e.title, at: midnight + (d * 1440 + e.at) * 60000, end: midnight + (d * 1440 + e.at + e.dur) * 60000 });
  const current = AGENDA.find((e) => mins >= e.at && mins < e.at + e.dur);
  const next = AGENDA.find((e) => e.at > mins);
  return { next: next ? ev(next) : ev(AGENDA[0], 1), ...(current ? { current: ev(current) } : {}) };
}
