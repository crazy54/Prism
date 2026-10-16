// Simulated sources — deterministic fake data with the exact ctx.data shapes, computed by the
// same functions the app facets fall back to (src/facets/apps/_sim.js), so a deck fed by these
// looks identical to one with nothing wired. Browser-safe: the web catalog and tests use them.

import { simulatedSource } from './_source.js';
import { simAudio, simSpectrum, simSystem, simSeries, simMedia, simCalendar, NET_MAX } from '../../facets/apps/_sim.js';

export const SYSTEM_KEYS = ['cpu', 'mem', 'gpu', 'disk', 'net', 'temp', 'battery', 'uptime', 'sys', 'series'];
export const AUDIO_KEYS = ['audio', 'spectrum'];

/** cpu / mem / gpu / disk / net / temp / battery / uptime + sys details + series history, at `rate` Hz. */
export function simulatedSystem({ seed = 7, rate = 1, history = 60, now } = {}) {
  return simulatedSource({
    id: 'system', provides: SYSTEM_KEYS, rate, seed, now,
    compute(t, s) {
      const d = simSystem(t, s);
      const step = 1 / rate;
      const ser = (k, scale = 1) => simSeries(k, t, s, history, step).values.map((v) => v * scale);
      d.series = { step, cpu: ser('cpu'), mem: ser('mem'), gpu: ser('gpu'), down: ser('down', NET_MAX.down), up: ser('up', NET_MAX.up), read: ser('read', NET_MAX.read), write: ser('write', NET_MAX.write), temp: ser('temp').map((v) => 30 + 70 * v) };
      return d;
    },
  });
}

/** ctx.data.audio + ctx.data.spectrum at 30 Hz (levels: `seconds` of history; bands: `bands`). */
export function simulatedAudio({ seed = 7, rate = 30, seconds = 16, bands = 16, now } = {}) {
  return simulatedSource({
    id: 'audio', provides: AUDIO_KEYS, rate, seed, now,
    compute(t, s) {
      const { frac: _frac, ...audio } = simAudio(t, s, { count: Math.round(seconds * rate), rate });
      return { audio, spectrum: simSpectrum(t, s, { count: bands }) };
    },
  });
}

/** ctx.data.media — a fictional playlist on repeat (1 Hz). */
export function simulatedMedia({ seed = 7, now, volume = 0.62 } = {}) {
  return simulatedSource({ id: 'media', provides: ['media'], rate: 1, seed, now, compute: (t, s) => ({ media: { ...simMedia(t, s), volume, muted: false } }) });
}

/** ctx.data.calendar — the fictional working day, relative to the wall clock (every 15 s). */
export function simulatedCalendar({ now, tzOffset = 0 } = {}) {
  return simulatedSource({ id: 'calendar', provides: ['calendar'], rate: 1 / 15, now, compute: (t) => ({ calendar: simCalendar(t * 1000, tzOffset) }) });
}
