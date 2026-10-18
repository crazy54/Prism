// Audio math — zero dependencies, browser-safe, allocation-free in the hot path.
//
//   fftInPlace(re, im)                       radix-2 complex FFT (length = power of two)
//   windowedMagnitudes(frame, re, im, mags)  Hann-windowed real spectrum; a full-scale sine → 1.0
//   bandLayout(sampleRate, size, bands, minHz, maxHz) → { lo, hi, centers }   log-spaced bands
//   bandAmplitudes(mags, lo, hi, out)        energy per band, normalised so a full-scale sine → 1.0
//   toLevel(amplitude, floorDb)              linear amplitude → 0–1 on a dB scale (floor → 0, 0 dBFS → 1)
//   follow(prev, next, attack, release)      one-pole attack/release smoothing step
//   coef(ms, hz)                             smoothing coefficient for a time constant at an update rate
//
// The four spectrum functions are SELF-CONTAINED (they reference only each other and
// Math): bridge.js stringifies them into the browser AudioWorklet so the page and
// the plugin compute bands with exactly the same code.

/** Smallest power of two ≥ n (n ≥ 1). */
export function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

export const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;

/** In-place iterative radix-2 FFT. `re`/`im` are equal-length arrays (Float64Array recommended). */
export function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Hann-windowed magnitude spectrum of `frame` (length N, a power of two, oldest
 * sample first) into `mags` (length N/2 + 1). Scaled by 4/N, so a full-scale sine
 * centred on a bin reads 1.0 there (periodic Hann: coherent gain 0.5).
 */
export function windowedMagnitudes(frame, re, im, mags) {
  const n = frame.length;
  for (let i = 0; i < n; i++) { re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)); im[i] = 0; }
  fftInPlace(re, im);
  const s = 4 / n, half = n >> 1;
  for (let k = 0; k <= half; k++) mags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * s;
  return mags;
}

/**
 * Log-spaced band layout over FFT bins. Every band owns at least one bin
 * (narrow low bands may share a bin with their neighbour).
 * → { lo: Int32Array, hi: Int32Array (exclusive), centers: number[] (Hz) }
 */
export function bandLayout(sampleRate, size, bands, minHz, maxHz) {
  const binHz = sampleRate / size, maxBin = size >> 1;
  const top = Math.max(binHz * 2, Math.min(maxHz, sampleRate / 2));
  const bottom = Math.max(binHz, Math.min(minHz, top / 2));
  const ratio = Math.pow(top / bottom, 1 / bands);
  const lo = new Int32Array(bands), hi = new Int32Array(bands), centers = new Array(bands);
  for (let b = 0; b < bands; b++) {
    const f0 = bottom * Math.pow(ratio, b), f1 = bottom * Math.pow(ratio, b + 1);
    let k0 = Math.max(1, Math.min(maxBin, Math.ceil(f0 / binHz - 1e-9)));
    let k1 = Math.max(1, Math.min(maxBin + 1, Math.ceil(f1 / binHz - 1e-9)));
    if (k1 <= k0) k1 = Math.min(maxBin + 1, k0 + 1);
    if (k1 <= k0) k0 = k1 - 1;
    lo[b] = k0; hi[b] = k1; centers[b] = Math.round(Math.sqrt(f0 * f1));
  }
  return { lo, hi, centers };
}

/**
 * Energy per band: sqrt(Σ mag² / 1.5) — 1.5 is the Hann window's noise bandwidth
 * in bins, so a full-scale sine whose main lobe falls in the band reads ≈ 1.0 and
 * broadband signals read their true RMS-like energy (pink noise ≈ flat across log bands).
 */
export function bandAmplitudes(mags, lo, hi, out) {
  for (let b = 0; b < lo.length; b++) {
    let e = 0;
    for (let k = lo[b]; k < hi[b]; k++) e += mags[k] * mags[k];
    out[b] = Math.sqrt(e / 1.5);
  }
  return out;
}

/** Linear amplitude (1 = full scale) → 0–1 on a dB scale: floorDb → 0, 0 dBFS → 1, clamped. */
export function toLevel(amplitude, floorDb = -60) {
  if (!(amplitude > 0)) return 0;
  const v = 1 + (20 * Math.log10(amplitude)) / -floorDb;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** 0–1 level → dBFS (inverse of toLevel; 0 → -Infinity). */
export const toDb = (level, floorDb = -60) => (level > 0 ? (1 - level) * floorDb : -Infinity);

/** Smoothing coefficient (0–1) for a time constant `ms` at `hz` updates per second (0 ms → 1 = instant). */
export const coef = (ms, hz) => (ms > 0 ? 1 - Math.exp(-1000 / (ms * hz)) : 1);

/** One attack/release step towards `next` (coefficients from coef()). */
export const follow = (prev, next, attack, release) => prev + (next - prev) * (next > prev ? attack : release);

/** RMS and peak of samples[from, to). */
export function rmsPeak(samples, from = 0, to = samples.length) {
  let sum = 0, peak = 0;
  for (let i = from; i < to; i++) { const v = samples[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
  const n = Math.max(1, to - from);
  return { rms: Math.sqrt(sum / n), peak };
}

/** Resample an array of band values to `count` bands (linear, endpoints kept). */
export function resampleBands(values, count) {
  const n = values.length;
  if (n === count) return Array.from(values);
  if (!n) return new Array(count).fill(0);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : (i / (count - 1)) * (n - 1);
    const i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), f = x - i0;
    out[i] = values[i0] * (1 - f) + values[i1] * f;
  }
  return out;
}
