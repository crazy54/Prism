// A tiny deterministic chiptune for the music visualizers to dance to.
// One 64-row pattern at 125 BPM / speed 6 (0.12 s a row, 7.68 s a loop):
// drums, a square-wave bass, a pulse lead and hats over Am–F–C–G. Nothing is
// synthesised to audio — the visualizers just read envelopes, frequencies,
// band energies and a waveform, all pure functions of t.
import { hash2 } from './_kit.js';

export const BPM = 125;
export const ROW = 60 / BPM / 4;
export const ROWS = 64;
export const LOOP = ROW * ROWS;
export const SONG = 'prism_intro.mod';

const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export const noteName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const ROOTS = [45, 41, 48, 43];   // A2 F2 C3 G2
const LEAD = [
  76, 0, 72, 0, 69, 72, 76, 79,
  77, 0, 76, 0, 72, 0, 69, 72,
  79, 0, 76, 72, 67, 0, 72, 76,
  74, 0, 71, 0, 79, 77, 74, 71,
];
export const INSTRUMENTS = ['', 'lead-pulse', 'bass-square', 'kick-808', 'snare-noise', 'hat-closed', 'hat-open'];

/** The pattern: PATTERN[row][ch] = { note, inst, eff } or null. Channels: drums, bass, lead, hats. */
export const PATTERN = Array.from({ length: ROWS }, (_, r) => {
  const bar = r >> 4, step = r & 15;
  const drum = step === 0 || step === 8 || (bar === 3 && step === 10) ? { note: 36, inst: 3, eff: 'C40' }
    : step === 4 || step === 12 || (bar === 3 && step >= 13) ? { note: 38, inst: 4, eff: bar === 3 && step > 12 ? `C${(0x20 + (step - 12) * 8).toString(16).toUpperCase()}` : 'C38' } : null;
  const bass = step % 2 === 0 ? { note: ROOTS[bar] + (step % 4 === 2 ? 12 : 0), inst: 2, eff: step % 4 === 2 ? 'C28' : 'C30' } : null;
  const ln = step % 2 === 0 ? LEAD[bar * 8 + (step >> 1)] : 0;
  const lead = ln ? { note: ln, inst: 1, eff: step === 0 ? '4A2' : 'C30' } : null;
  const hat = step % 2 === 1 ? { note: 72, inst: step === 15 ? 6 : 5, eff: step % 4 === 3 ? 'C18' : 'C10' } : null;
  return [drum, bass, lead, hat];
});

// For each channel and row, the most recent event at or before that row (wrapping).
const LAST = PATTERN[0].map((_, ch) => {
  const out = new Array(ROWS);
  let last = null, lastRow = 0;
  for (let i = 0; i < ROWS * 2; i++) {
    const r = i % ROWS, ev = PATTERN[r][ch];
    if (ev) { last = ev; lastRow = i; }
    if (i >= ROWS) out[r] = { ev: last, back: i - lastRow };
  }
  return out;
});

/** The song's state at time t: row position plus per-voice envelopes and frequencies. */
export function songAt(t) {
  const lt = ((t % LOOP) + LOOP) % LOOP;
  const pos = lt / ROW, row = Math.floor(pos), frac = pos - row;
  const voice = (ch) => {
    const { ev, back } = LAST[ch][row];
    return { ev, age: (back + frac) * ROW };
  };
  const d = voice(0), bs = voice(1), ld = voice(2), ht = voice(3);
  const isKick = d.ev && d.ev.inst === 3;
  const vol = (ev) => (ev ? parseInt(ev.eff.slice(1), 16) / 64 : 0);
  const kick = isKick ? Math.exp(-d.age / 0.11) : 0;
  const snare = d.ev && !isKick ? Math.exp(-d.age / 0.13) * vol(d.ev) * 1.6 : 0;
  const bass = (0.35 + 0.65 * Math.exp(-bs.age / 0.12)) * Math.min(1, vol(bs.ev) * 1.4) * (bs.age < ROW * 2 ? 1 : Math.exp(-(bs.age - ROW * 2) / 0.05));
  const lead = Math.min(1, ld.age / 0.01) * (0.45 + 0.55 * Math.exp(-ld.age / 0.18)) * Math.exp(-ld.age / 1.4);
  const hat = ht.ev ? Math.exp(-ht.age / (ht.ev.inst === 6 ? 0.12 : 0.035)) * vol(ht.ev) * 2.2 : 0;
  return {
    t: lt, row, frac, beat: Math.floor(row / 4), bar: row >> 4,
    kick, snare: Math.min(1, snare), bass, lead, hat: Math.min(1, hat),
    kickAge: d.age,
    bassFreq: bs.ev ? freq(bs.ev.note) : 110,
    leadFreq: ld.ev ? freq(ld.ev.note) * (1 + 0.006 * Math.sin(ld.age * 34) * Math.min(1, ld.age * 4)) : 440,
    bassNote: bs.ev ? bs.ev.note : 45, leadNote: ld.ev ? ld.ev.note : 69,
  };
}

/** Per-channel levels [drums, bass, lead, hats] in 0..1. */
export function levels(s) {
  return [Math.max(s.kick, s.snare), s.bass * 0.85, s.lead * 0.8, s.hat * 0.9];
}

const LO = Math.log2(40), HI = Math.log2(12000);
const bump = (fc, f, w) => { const d = (fc - Math.log2(f)) / w; return Math.exp(-d * d); };

/** Band energies (0..1) for `n` log-spaced bands from 40 Hz to 12 kHz. */
export function bands(t, n, out = new Float32Array(n)) {
  const s = songAt(t);
  for (let i = 0; i < n; i++) {
    const fc = LO + ((i + 0.5) / n) * (HI - LO);
    let e = s.kick * (bump(fc, 58, 0.55) + 0.35 * bump(fc, 120, 0.5));
    for (let h = 1; h <= 7; h += 2) e += (s.bass / h) * bump(fc, s.bassFreq * h, 0.22);
    for (let h = 1; h <= 6; h++) e += (s.lead * 0.8 / h) * bump(fc, s.leadFreq * h, 0.18);
    e += s.snare * (0.55 * bump(fc, 220, 0.6) + 0.7 * bump(fc, 2500, 1.6));
    e += s.hat * 0.8 * bump(fc, 9000, 0.9);
    const shimmer = 0.06 * hash2(i, Math.floor(t * 30), 7);
    out[i] = Math.min(1, Math.sqrt(e * 0.9) * 0.92 + shimmer * (0.3 + e));
  }
  return out;
}

const noise = (t) => hash2(Math.floor(t * 9000), 3, 11) * 2 - 1;

/** A stereo-ish waveform sample at time t: { l, r, mix } in about -1..1. */
export function sample(t, s = songAt(t)) {
  const pb = (t * s.bassFreq) % 1, pl = (t * s.leadFreq) % 1;
  const bass = (pb < 0.5 ? 1 : -1) * 0.34 * s.bass;
  const lead = (pl < 0.25 ? 1 : -1) * 0.24 * s.lead;
  const a = s.kickAge;
  const kick = Math.sin(2 * Math.PI * (48 * a + 110 * 0.035 * (1 - Math.exp(-a / 0.035)))) * 0.62 * s.kick;
  const nz = noise(t);
  const snare = nz * 0.32 * s.snare, hat = nz * 0.14 * s.hat;
  const l = Math.tanh((bass + kick + snare + lead * 0.6 + hat * 0.4) * 1.2);
  const r = Math.tanh((bass * 0.6 + kick + snare + lead + hat) * 1.2);
  return { l, r, mix: (l + r) / 2 };
}
