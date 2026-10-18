// Deterministic job simulation for progress facets.
//
// Real transfers aren't linear: the rate bursts, stalls, ramps up after a slow
// start and tails off. `transfer()` precomputes a seeded rate curve once in
// setup, integrates it, and scales it so the job finishes exactly on schedule
// — so every number on screen (done, total, rate, ETA, percent) agrees with
// every other. The ETA uses an exponentially smoothed rate, the way tqdm/pv do,
// so it wobbles early and converges as the job runs.

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Loop phase: the job runs for `active` of each `loop` seconds, then holds the
 * finished state. Returns { u (0..1 progress time), local (s), done (bool), k (loop index) }.
 */
export function phase(t, loop, active = 0.78) {
  const k = Math.floor(t / loop);
  const local = t - k * loop;
  const run = loop * active;
  return { u: clamp01(local / run), local, done: local >= run, k, run };
}

/**
 * A transfer of `total` units completing in `seconds`.
 * @param {function} rng   ctx.rng (seeded)
 * @param {object} o       { total, seconds, steps=480, burst=0.55, stalls=1, warmup=0.12, alpha=0.08 }
 * @returns {{at(sec): {done, frac, rate, avg, eta, elapsed}}}
 */
export function transfer(rng, o) {
  const { total, seconds, steps = 480, burst = 0.55, stalls = 1, warmup = 0.12, alpha = 0.08 } = o;
  const raw = new Float64Array(steps);
  // Low-frequency drift plus bursts plus the occasional stall.
  const f1 = 2 + rng() * 3, f2 = 7 + rng() * 6, p1 = rng() * 6.3, p2 = rng() * 6.3;
  const stallAt = Array.from({ length: stalls }, () => 0.25 + rng() * 0.55);
  for (let i = 0; i < steps; i++) {
    const x = i / steps;
    let r = 1 + burst * 0.6 * Math.sin(x * f1 * 6.283 + p1) + burst * 0.4 * Math.sin(x * f2 * 6.283 + p2) + burst * 0.5 * (rng() - 0.5);
    r *= Math.min(1, 0.25 + x / warmup);                 // slow start (DNS, TLS, TCP slow start)
    for (const s of stallAt) if (Math.abs(x - s) < 0.025) r *= 0.12;   // a stall
    if (x > 0.93) r *= 0.75;                             // tail-off
    raw[i] = Math.max(0.05, r);
  }
  const cum = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i++) cum[i + 1] = cum[i] + raw[i];
  const scale = total / cum[steps];
  const dt = seconds / steps;
  // Smoothed rate per step (units / second), for ETA.
  const ewma = new Float64Array(steps);
  let e = raw[0] * scale / dt * 0.3;
  for (let i = 0; i < steps; i++) { e += alpha * (raw[i] * scale / dt - e); ewma[i] = e; }
  return {
    total,
    seconds,
    at(sec) {
      const x = clamp01(sec / seconds) * steps;
      const i = Math.min(steps - 1, Math.floor(x)), fr = x - Math.floor(x);
      // Past the end the job is exactly done — no 0.9999999 that floors to "99%".
      const done = sec >= seconds ? total : Math.min(total, (cum[i] + raw[i] * fr) * scale);
      const rate = raw[i] * scale / dt;
      const smooth = ewma[i];
      const elapsed = Math.min(sec, seconds);
      const avg = elapsed > 0 ? done / elapsed : 0;
      const eta = done >= total ? 0 : (total - done) / Math.max(1e-9, smooth);
      return { done, frac: done / total, rate, smooth, avg, eta, elapsed, finished: done >= total };
    },
  };
}

// ── formatting the way the real tools do ────────────────────────────────────

const IEC = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
const SI = ['B', 'kB', 'MB', 'GB', 'TB'];

/** 1536 → "1.50 KiB" (iec) or "1.54 kB" (si). */
export function bytes(n, { iec = true, digits = 2, pad = 0 } = {}) {
  const base = iec ? 1024 : 1000, units = iec ? IEC : SI;
  let u = 0, v = n;
  while (v >= base && u < units.length - 1) { v /= base; u++; }
  const s = u === 0 ? `${Math.round(v)} ${units[0]}` : `${v.toFixed(digits)} ${units[u]}`;
  return s.padStart(pad);
}

/** wget-style compact size: 41.2M, 512K. */
export function short(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)}G`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}M`;
  if (n >= 1024) return `${Math.round(n / 1024)}K`;
  return `${Math.round(n)}`;
}

/** 7.3 → "0:00:07", or "00:07" with { short: true }. */
export function clock(s, { short: sh = false } = {}) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return sh && !h ? `${mm}:${ss}` : `${h}:${mm}:${ss}`;
}

/** 1234567 → "1,234,567". */
export const commas = (n) => Math.round(n).toLocaleString('en-US');

/** Pick Unicode or ASCII glyphs for the current caps. */
export const glyphs = (ctx) => {
  const u = ctx.caps.unicode !== false;
  return {
    unicode: u,
    ok: u ? '✔' : 'OK', fail: u ? '✖' : 'XX', warn: u ? '⚠' : '!!', dot: u ? '·' : '-', ell: u ? '…' : '...',
    arrow: u ? '→' : '->', bullet: u ? '●' : '*', hollow: u ? '○' : 'o', full: u ? '█' : '#',
  };
};
