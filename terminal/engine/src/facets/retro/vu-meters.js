// Twin analog VU meters on a backlit amber face, needles riding a little
// chiptune with real VU ballistics (300 ms integration), a red zone past 0 dB,
// peak lamps, and fast LED ladders with peak-hold underneath.
import { lerpc } from './_kit.js';
import { songAt } from './_music.js';

const SCALE = [[-20, 0], [-10, 0.28], [-7, 0.4], [-5, 0.5], [-3, 0.62], [-2, 0.69], [-1, 0.76], [0, 0.83], [1, 0.89], [2, 0.95], [3, 1]];
const pos = (db) => {
  if (db <= SCALE[0][0]) return 0;
  for (let i = 1; i < SCALE.length; i++) if (db <= SCALE[i][0]) {
    const [d0, p0] = SCALE[i - 1], [d1, p1] = SCALE[i];
    return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
  }
  return 1;
};
const toDb = (v) => 20 * Math.log10(Math.max(1e-3, v)) + 3;
const lum = (c) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
const clamp = (v) => Math.min(1, Math.max(0, v));

function stereo(t) {
  const s = songAt(t), d = Math.max(s.kick, s.snare);
  return [clamp(0.5 * d + 0.34 * s.bass + 0.22 * s.lead + 0.06 * s.hat), clamp(0.5 * d + 0.22 * s.bass + 0.34 * s.lead + 0.18 * s.hat)];
}

export default {
  title: 'VU Meters',
  gallery: 'retro',
  category: 'Chiptune Visuals',
  kind: 'scene',
  tags: ['vu', 'meter', 'audio', 'needle', 'led', 'chiptune', 'hifi'],
  order: 10,
  description: 'Twin analog VU meters on a backlit face — needles with real ballistics, a red zone, peak lamps and LED ladders.',
  size: { w: 64, h: 18 },
  minSize: { w: 24, h: 8 },
  loop: 7.68,
  canvas: 'line',
  setup(ctx) {
    const { theme } = ctx;
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const cv = ctx.canvas('line');
    const ladders = H >= 10 ? 2 : 0;
    const dark = lum(theme.bg) < lum(theme.ink) ? theme.bg : theme.ink;
    const face = lerpc(theme.panel, theme.warn, 0.62), faceHi = lerpc(face, 0xffffff, 0.35);
    const red = lerpc(theme.neg, dark, 0.15);
    const mw = Math.floor(W / 2), mh = H - ladders;
    // Geometry in cell units; a cell is about twice as tall as it is wide.
    // Pivot hides at the bottom of the face; the arc's radius is set by the face
    // height and the sweep narrows to fit the width.
    const top = mh >= 12 ? 2.6 : 1.6;
    const R = Math.max(3, (mh - 0.6 - top) * 2);
    const SPAN = Math.min((50 * Math.PI) / 180, Math.asin(Math.min(1, (mw - 4) / (2 * R * 1.05))));
    const labels = mw >= 26 ? [-20, -10, -5, -3, 0, 3] : mw >= 16 ? [-20, -5, 0, 3] : [-20, 0];
    const meters = [0, 1].map((i) => ({ x0: i * mw, cx: i * mw + mw / 2, cy: mh - 0.6, name: i ? 'R' : 'L' }));
    const at = (m, p, r) => {
      const a = -SPAN + p * 2 * SPAN;
      return [(m.cx + r * Math.sin(a)) * cv.sx, (m.cy - (r * Math.cos(a)) / 2) * cv.sy];
    };
    // VU: 300 ms integration. PPM ladders: instant attack, ~1.2 s fall. Both pure in t.
    const vu = (t) => {
      let l = 0, r = 0, w = 0;
      for (let k = 0; k < 12; k++) {
        const [a, c] = stereo(t - k * 0.025), wk = Math.exp(-k / 4);
        l += a * wk; r += c * wk; w += wk;
      }
      return [l / w, r / w];
    };
    const ppm = (t) => {
      const out = [0, 0], hold = [0, 0];
      for (let k = 0; k < 40; k++) {
        const v = stereo(t - k * 0.03), f = Math.exp(-(k * 0.03) / 0.4);
        for (let c = 0; c < 2; c++) { out[c] = Math.max(out[c], v[c] * f); hold[c] = Math.max(hold[c], v[c]); }
      }
      return [out, hold];
    };
    return (t) => {
      b.fill(0, 0, W, H, ' ', theme.ink, theme.bg);
      cv.clear();
      const lv = vu(t);
      meters.forEach((m, i) => {
        // Backlit face: brighter toward the middle.
        for (let y = 0; y < mh; y++) for (let x = m.x0; x < m.x0 + mw - (i ? 0 : 1); x++) {
          const dx = (x + 0.5 - m.cx) / (mw / 2), dy = (y + 0.5 - mh * 0.55) / (mh / 2);
          b.set(x, y, ' ', dark, lerpc(face, faceHi, clamp(1 - Math.sqrt(dx * dx + dy * dy * 0.6))));
        }
        // Scale arc, red zone and ticks.
        for (let s = 0; s <= 200; s++) {
          const p = s / 200;
          for (const k of p > 0.83 ? [0.84, 0.87, 0.9] : [0.86, 0.875]) {
            const [x, y] = at(m, p, R * k);
            cv.set(x, y, p > 0.83 ? red : dark);
          }
        }
        for (const [db, p] of SCALE) {
          const major = labels.includes(db);
          const [x0, y0] = at(m, p, R * (major ? 0.78 : 0.82)), [x1, y1] = at(m, p, R * 0.94);
          cv.line(x0, y0, x1, y1, db > 0 ? red : dark);
        }
        // Needle.
        const p = pos(toDb(lv[i]));
        const [nx0, ny0] = at(m, p, R * 0.06), [nx1, ny1] = at(m, p, R * 1.0);
        cv.line(nx0, ny0, nx1, ny1, dark);
        cv.line(nx0 + 1, ny0, nx1 + 1, ny1, dark);
        // The pivot cover the needle disappears under.
        cv.ellipse(m.cx * cv.sx, m.cy * cv.sy, R * 0.14 * cv.sx, R * 0.07 * cv.sy, dark, true);
      });
      cv.paint(b);
      meters.forEach((m, i) => {
        // Labels sit just outside the arc; the bg is whatever the face set.
        for (const db of labels) {
          const s = db > 0 ? `+${db}` : String(db);
          const [x, y] = at(m, pos(db), R * 1.13);
          const cx = Math.min(m.x0 + mw - 1 - s.length, Math.max(m.x0, Math.round(x / cv.sx - s.length / 2))), cy = Math.floor(y / cv.sy);
          if (cy >= 0) b.text(cx, cy, s, db > 0 ? red : dark);
        }
        const vy = Math.round(m.cy - R * 0.2);
        if (vy > 0 && vy < mh - 1) b.text(Math.round(m.cx - 1), vy, 'VU', dark);
        b.text(m.x0 + 1, mh - 1, m.name, dark);
        const peak = toDb(stereo(t)[i]) > 1.5;
        if (mw >= 12) b.text(m.x0 + mw - (i ? 3 : 4), 0, 'PK', peak ? 0xffffff : lerpc(face, dark, 0.3), peak ? theme.neg : undefined);
      });
      if (!ladders) return;
      const [level, hold] = ppm(t);
      const segs = Math.max(4, W - 8);
      for (let c = 0; c < 2; c++) {
        const y = mh + c;
        b.text(0, y, c ? 'R' : 'L', theme.muted);
        const lit = Math.round(pos(toDb(level[c])) * segs), hi = Math.round(pos(toDb(hold[c])) * segs) - 1;
        for (let s = 0; s < segs; s++) {
          const f = s / segs;
          const col = f < 0.62 ? theme.pos : f < 0.83 ? theme.warn : theme.neg;
          const on = s < lit || s === hi;
          b.set(2 + s, y, '▌', on ? col : lerpc(theme.bg, col, 0.2));
        }
        const db = Math.round(toDb(level[c]));
        b.text(W - 5, y, `${db > 0 ? '+' : ''}${Math.max(-20, db)}`.padStart(4), theme.muted);
      }
    };
  },
};
