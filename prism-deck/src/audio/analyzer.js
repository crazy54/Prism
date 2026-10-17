// Analyzer — mono samples (or pre-computed meters) → the ctx.data shapes. Browser-safe.
//
//   const a = new Analyzer({ sampleRate: 16000, historySeconds: 4, historyRate: 30, bands: 16 });
//   a.push(float32Samples);          // any chunk size; analysis runs once per hop (sampleRate / historyRate samples)
//   a.pushMeter({ rms, peak, bands }); // one hop from a source that already metered (browser bridge)
//   a.snapshot() → { audio: { level, levels, rate, peak, rms }, spectrum: { bands, peaks, centers } }
//
// ctx.data contract (docs/authoring.md §7), plus optional extras:
//   audio.level    0–1  METER: smoothed peak (fast attack, slow release) on a dB scale (floorDb → 0, 0 dBFS → 1)
//   audio.levels   number[] WAVEFORM ENVELOPE: per-hop peaks 0–1, OLDEST FIRST, linear amplitude with a
//                  gentle auto-gain (the loudest recent peaks reach ~0.9; quiet sources still fill the keys,
//                  silence stays silent) — always `historySeconds × historyRate` long (prefilled with
//                  silence), so a waveform maps it straight across its width. levelsScale: 'db' for dB.
//   audio.rate     levels per second (= historyRate), for facets that show a fixed time window
//   audio.peak / audio.rms   the newest hop, 0–1 on the same dB scale (extras)
//   spectrum.bands number[] 0–1, low → high, log-spaced minHz…maxHz, smoothed (dB scale, bandFloorDb → 0,
//                  tilted +tiltDb per octave around 1 kHz so music reads level across the range)
//   spectrum.peaks number[] falling peak caps for the bands (extra)
//   spectrum.centers number[] band centre frequencies in Hz (extra; static per layout)
//
// Only the last FFT window of samples is held (≤ 8192 floats) — never a recording.

import { RingBuffer } from './ring.js';
import { nextPow2, windowedMagnitudes, bandLayout, bandAmplitudes, toLevel, coef, follow, resampleBands } from './dsp.js';

export const ANALYZER_DEFAULTS = Object.freeze({
  sampleRate: 16000,
  historySeconds: 4,
  historyRate: 30,
  bands: 16,
  minHz: 40,
  maxHz: 12000,
  fftSize: 0,            // 0 = auto: next power of two ≥ 64 ms of audio (1024 @ 16 kHz, 4096 @ 48 kHz)
  floorDb: -60,          // levels: -60 dBFS → 0
  bandFloorDb: -72,      // bands: -72 dB → 0
  tiltDb: 1.5,           // bands: display tilt in dB per octave, 0 at 1 kHz (0 = physically flat)
  levelsScale: 'linear', // levels history: 'linear' (waveform, with agc) | 'db' (same scale as level)
  agc: true,             // levels history: auto-gain up to +24 dB towards a 0.9 peak (gated below -60 dBFS)
  attackMs: 10,
  releaseMs: 300,
  bandAttackMs: 30,
  bandReleaseMs: 260,
  peakHoldMs: 700,
  peakFall: 1.2,         // peak caps fall this many units (0–1) per second after the hold
});

export class Analyzer {
  constructor(opts = {}) {
    this.o = { ...ANALYZER_DEFAULTS, ...opts };
    const o = this.o;
    o.historyRate = Math.max(1, Math.min(120, o.historyRate));
    o.bands = Math.max(0, Math.min(128, Math.floor(o.bands)));
    this.levels = new RingBuffer(Math.max(1, Math.round(o.historySeconds * o.historyRate)), { fill: 0 });
    this.level = 0; this.peak = 0; this.rms = 0;
    this.hops = 0;
    this.gain = 1; this.env = 0;                    // auto-gain state (levels history only)
    this.skipBands = false;                         // set while warming up (simulate) to skip FFTs
    this.sampleRate = 0;
    this.setSampleRate(o.sampleRate);
  }

  /** (Re)configure for a sample rate; keeps the levels history (so a backend switch doesn't jump). */
  setSampleRate(sr) {
    sr = Math.max(1000, Math.min(384000, Math.round(sr || 16000)));
    if (sr === this.sampleRate) return this;
    const o = this.o;
    this.sampleRate = sr;
    this.hop = Math.max(1, Math.round(sr / o.historyRate));
    this.size = o.fftSize > 0 ? nextPow2(o.fftSize) : Math.max(256, Math.min(8192, nextPow2(Math.round(sr * 0.064))));
    this.win = new Float32Array(this.size);       // circular sample window (the only audio held)
    this.wi = 0;
    this.frame = new Float32Array(this.size);
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.mags = new Float32Array((this.size >> 1) + 1);
    if (o.bands) {
      this.layout = bandLayout(sr, this.size, o.bands, o.minHz, o.maxHz);
      this.amps = new Float32Array(o.bands);
      this.tilt = this.layout.centers.map((c) => Math.pow(10, (o.tiltDb * Math.log2(c / 1000)) / 20));
      if (!this.bands || this.bands.length !== o.bands) {
        this.bands = new Float32Array(o.bands);
        this.peaks = new Float32Array(o.bands);
        this.peakAge = new Float32Array(o.bands);
      }
    } else { this.layout = null; this.bands = new Float32Array(0); this.peaks = new Float32Array(0); this.peakAge = new Float32Array(0); }
    this.accN = 0; this.accSum = 0; this.accPeak = 0;
    const hz = o.historyRate;
    this.k = { atk: coef(o.attackMs, hz), rel: coef(o.releaseMs, hz), batk: coef(o.bandAttackMs, hz), brel: coef(o.bandReleaseMs, hz), eatk: coef(40, hz), erel: coef(4000, hz) };
    return this;
  }

  /** Feed mono samples (−1…1). Runs one analysis per completed hop. */
  push(samples) {
    const win = this.win, size = this.size, hop = this.hop;
    for (let i = 0; i < samples.length; i++) {
      let v = samples[i];
      if (!(v === v)) v = 0;                        // NaN guard
      win[this.wi] = v; this.wi = this.wi + 1 === size ? 0 : this.wi + 1;
      this.accSum += v * v;
      const a = v < 0 ? -v : v;
      if (a > this.accPeak) this.accPeak = a;
      if (++this.accN === hop) {
        const rms = Math.sqrt(this.accSum / hop), peak = this.accPeak;
        this.accN = 0; this.accSum = 0; this.accPeak = 0;
        this._hop(rms, peak, null);
      }
    }
    return this;
  }

  /** One pre-metered hop: { rms, peak } linear amplitudes, bands = linear band amplitudes (any count). */
  pushMeter({ rms = 0, peak = rms, bands } = {}) {
    const clean = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(4, x)) : 0);
    let b = null;
    if (bands && this.o.bands) {
      const arr = Array.from(bands, clean);
      b = arr.length === this.o.bands ? arr : resampleBands(arr, this.o.bands);
    }
    this._hop(clean(rms), clean(peak), b || (this.o.bands ? new Array(this.o.bands).fill(0) : null));
    return this;
  }

  /** Push `n` silent hops (keeps the history scrolling through capture gaps). */
  silence(n = 1) {
    for (let i = 0; i < n; i++) this._hop(0, 0, this.o.bands ? new Array(this.o.bands).fill(0) : null);
    return this;
  }

  _hop(rms, peak, bandAmps) {
    const o = this.o, k = this.k;
    const pl = toLevel(peak, o.floorDb);
    if (o.levelsScale === 'db') this.levels.push(pl);
    else {
      // auto-gain: follow the peak envelope (fast up, slow down) and aim it at 0.9; gate silence
      this.env = follow(this.env, peak, k.eatk, k.erel);
      const target = o.agc && this.env > 0.001 ? Math.max(1, Math.min(16, 0.9 / this.env)) : 1;
      this.gain = follow(this.gain, target, k.erel, k.eatk);   // rise slowly, back off fast
      this.levels.push(Math.min(1, peak * this.gain));
    }
    this.peak = pl;
    this.rms = toLevel(rms, o.floorDb);
    this.level = follow(this.level, pl, k.atk, k.rel);
    if (o.bands && !(this.skipBands && !bandAmps)) {
      let amps = bandAmps;
      if (!amps) {
        // the window in chronological order → spectrum → bands
        const f = this.frame, win = this.win, size = this.size;
        for (let i = 0, r = this.wi; i < size; i++) { f[i] = win[r]; r = r + 1 === size ? 0 : r + 1; }
        windowedMagnitudes(f, this.re, this.im, this.mags);
        amps = bandAmplitudes(this.mags, this.layout.lo, this.layout.hi, this.amps);
      }
      const dt = 1 / o.historyRate;
      for (let b = 0; b < o.bands; b++) {
        const v = toLevel(amps[b] * this.tilt[b], o.bandFloorDb);
        this.bands[b] = follow(this.bands[b], v, k.batk, k.brel);
        if (this.bands[b] >= this.peaks[b]) { this.peaks[b] = this.bands[b]; this.peakAge[b] = 0; }
        else {
          this.peakAge[b] += dt;
          if (this.peakAge[b] * 1000 > o.peakHoldMs) this.peaks[b] = Math.max(this.bands[b], this.peaks[b] - o.peakFall * dt);
        }
      }
    }
    this.hops++;
  }

  /** Fresh plain-array snapshot in the ctx.data shapes (safe to hand to a render). */
  snapshot() {
    const r4 = (x) => Math.round(x * 1e4) / 1e4;   // stable strings → better frame dedupe
    return {
      audio: { level: r4(this.level), levels: this.levels.toArray().map(r4), rate: this.o.historyRate, peak: r4(this.peak), rms: r4(this.rms) },
      spectrum: { bands: Array.from(this.bands, r4), peaks: Array.from(this.peaks, r4), centers: this.layout ? this.layout.centers.slice() : [] },
    };
  }

  /** Reset levels and bands to silence (keeps configuration). */
  reset() {
    this.levels.clear(0);
    this.level = this.peak = this.rms = 0; this.gain = 1; this.env = 0;
    this.win.fill(0); this.wi = 0; this.accN = 0; this.accSum = 0; this.accPeak = 0;
    this.bands.fill(0); this.peaks.fill(0); this.peakAge.fill(0);
    return this;
  }

  get info() { return { sampleRate: this.sampleRate, hop: this.hop, fftSize: this.size, bands: this.o.bands, historyRate: this.o.historyRate, history: this.levels.capacity }; }
}
