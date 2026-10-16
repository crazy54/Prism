// Synthetic audio — a deterministic little groove, so every audio app has something
// musical to show when no capture backend is available (the simulated fallback), in
// tests, in the web catalog and in thumbnails. Browser-safe, no timers, no randomness:
// sample i is a pure function of (i, seed, sampleRate, bpm).
//
//   const syn = createSynth({ seed: 7, sampleRate: 16000 });
//   syn.render(startIndex, out)            // fills a Float32Array with samples startIndex…
//   simulate(t, { seed }) → { audio, spectrum }   // pure ctx.data snapshot at time t (seconds)
//
// The arrangement: kick on every beat, snare on 2 & 4, off-beat hats, a pumping bass on
// a four-chord loop, a soft pad, a seeded 16th-note arpeggio; every 16 bars a 2-bar
// breakdown drops the drums, so waveforms and spectra breathe instead of looping flat.

import { Analyzer } from './analyzer.js';

const TAU = Math.PI * 2;

/** Integer hash → [-1, 1). Deterministic noise without state. */
export function hashNoise(i, seed) {
  let h = (i ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 2147483648 - 1;
}

const PROGRESSIONS = [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 5], [0, 3, 10, 5]];
const ROOTS = [55, 61.74, 49, 58.27];           // A1, B1, G1, A#1 (Hz)
const ARP = [0, 3, 7, 10, 12, 15, 19, 22];      // minor-7 arpeggio tones (semitones)

/** opts: { seed = 7, sampleRate = 16000, bpm = 118, gain = 0.8 } */
export function createSynth({ seed = 7, sampleRate = 16000, bpm = 118, gain = 0.8 } = {}) {
  const s = seed | 0;
  const prog = PROGRESSIONS[((s % 4) + 4) % 4];
  const root = ROOTS[(((s >> 2) % 4) + 4) % 4];
  const spb = 60 / bpm;                          // seconds per beat

  function sample(i) {
    if (i < 0) return 0;                         // silence before the song starts
    const t = i / sampleRate;
    const bp = t / spb, beat = Math.floor(bp), tb = (bp - beat) * spb;  // seconds since the beat
    const bar = Math.floor(beat / 4), inBar = beat % 4;
    const breakdown = bar % 16 >= 14;
    const f = root * Math.pow(2, prog[bar % 4] / 12);
    const phrase = 0.78 + 0.22 * Math.sin((TAU * t) / (spb * 32));
    let x = 0;
    if (!breakdown) {
      // kick: pitch-dropping sine, phase integrated so the sweep is clean
      const kp = TAU * (46 * tb + (120 * (1 - Math.exp(-tb * 30))) / 30);
      x += Math.sin(kp) * Math.exp(-tb * 8) * 0.95;
      // snare on 2 & 4: noise burst + body
      if (inBar === 1 || inBar === 3) x += (hashNoise(i, s + 3) * 0.55 * Math.exp(-tb * 16) + Math.sin(TAU * 188 * tb) * 0.3 * Math.exp(-tb * 24)) * 0.8;
      // off-beat hats: differenced noise = crude high-pass
      const e8 = bp * 2, h8 = Math.floor(e8);
      if (h8 & 1) { const th = (e8 - h8) * spb / 2; x += (hashNoise(i, s + 5) - hashNoise(i - 1, s + 5)) * 0.16 * Math.exp(-th * 55); }
    }
    // bass, side-chained to the kick
    const duck = breakdown ? 0.75 : 0.3 + 0.7 * (1 - Math.exp(-tb * 7));
    x += (Math.sin(TAU * f * 2 * t) + 0.35 * Math.sin(TAU * f * 4 * t)) * 0.32 * duck;
    // pad: the chord an octave up, slow tremolo
    const trem = 0.8 + 0.2 * Math.sin(TAU * 0.5 * t);
    x += (Math.sin(TAU * f * 4 * t) + Math.sin(TAU * f * 4 * 1.189 * t) + Math.sin(TAU * f * 4 * 1.498 * t)) * 0.045 * trem * (breakdown ? 1.8 : 1);
    // arpeggio: seeded 16ths over the chord
    const e16 = bp * 4, n16 = Math.floor(e16), ts = (e16 - n16) * spb / 4;
    const tone = ARP[Math.floor((hashNoise(n16, s + 11) + 1) * 4) & 7];
    const fa = f * 8 * Math.pow(2, tone / 12);
    x += (Math.sin(TAU * fa * t) + 0.25 * Math.sin(TAU * fa * 2 * t)) * 0.14 * Math.exp(-ts * 18) * (breakdown ? 1.6 : 1);
    return Math.tanh(x * phrase * gain * 1.15) * 0.92;
  }

  return {
    sampleRate, bpm, seed: s,
    sample,
    /** Fill `out` with samples startIndex … startIndex + out.length − 1. */
    render(startIndex, out) { for (let k = 0; k < out.length; k++) out[k] = sample(startIndex + k); return out; },
  };
}

/**
 * Pure simulated ctx.data at time t (seconds): runs the synth through an Analyzer for the
 * history window that ends at t. Same inputs → same output, always. Cost ≈ 10 ms
 * (4 s at 8 kHz); runtimes that render continuously should use a live synthetic source
 * (source.js), which analyses incrementally.
 * opts: { seed, sampleRate = 8000, historySeconds = 4, historyRate = 30, bands = 16, minHz, maxHz, bpm }
 */
export function simulate(t, opts = {}) {
  const { seed = 7, sampleRate = 8000, bpm, ...rest } = opts;
  const a = new Analyzer({ sampleRate, maxHz: Math.min(rest.maxHz || 12000, sampleRate * 0.475), ...rest });
  const syn = createSynth({ seed, sampleRate, bpm });
  const hop = a.hop;
  const hops = a.levels.capacity + Math.ceil(a.size / hop) + 2;   // fill the window and the history
  const end = Math.floor((Math.max(0, t) * sampleRate) / hop) * hop;   // hop-aligned → stable between frames
  const start = end - hops * hop;
  const block = new Float32Array(hop);
  const bandsFrom = end - Math.max(Math.ceil(a.size / hop), 45) * hop;   // ~1.5 s of band smoothing is plenty
  a.skipBands = true;
  for (let i = start; i < end; i += hop) {
    if (i >= bandsFrom) a.skipBands = false;
    a.push(syn.render(i, block));
  }
  return a.snapshot();
}
