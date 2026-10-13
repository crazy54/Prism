// Radar & Sonar: a phosphor radar sweep painting moving tracks, and an
// active sonar with expanding pings, echoes and a bearing-time waterfall.
import { mix } from '../../color.js';
import { glyphs, put, putR, safe, clamp, ATTR } from '../charts/_data.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const deg = (a) => String(Math.round((a * 180) / Math.PI) % 360).padStart(3, '0');

const radar = {
  id: 'maps-radar',
  title: 'Radar Sweep',
  category: 'Radar & Sonar',
  description: 'A phosphor PPI radar: the sweep paints moving tracks that fade until the next pass, over range rings, with a live track table.',
  tags: ['radar', 'sweep', 'ppi', 'tracks', 'phosphor'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 30, h: 10 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const tableW = W >= 64 ? 30 : 0;
    const cols = W - tableW;
    const cv = ctx.canvas('line', { cols, rows: H });
    const A = cv.aspect, cx = cv.width / 2, cy = cv.height / 2;
    const R = Math.min(cv.width / 2 - 2, (cv.height / 2) * A - 2);
    const REV = 4; // seconds per revolution
    const green = th.pos, dim = mix(th.bg, th.pos, 0.28);
    // Tracks fly straight lines through the scope; positions are in units of R.
    const tracks = Array.from({ length: 7 }, (_, i) => {
      const a = ctx.rng.range(0, TAU), r = ctx.rng.range(0.25, 0.95), h = ctx.rng.range(0, TAU);
      return { id: `${String(410 + i * 7).padStart(3, '0')}`, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: Math.cos(h) * 0.012, vy: Math.sin(h) * 0.012, alt: 80 + ctx.rng.int(0, 30) * 10, spd: 240 + ctx.rng.int(0, 22) * 10 };
    });
    const clutter = Array.from({ length: 26 }, () => { const a = ctx.rng.range(0, TAU), r = ctx.rng.range(0.03, 0.2) ** 1.2; return [Math.cos(a) * r, Math.sin(a) * r]; });
    const pos = (tr, t) => {
      // Bounce inside the scope so every track stays on screen through the loop.
      let x = tr.x + tr.vx * t, y = tr.y + tr.vy * t;
      const ff = (v) => { const m = ((v + 1) % 4 + 4) % 4; return m < 2 ? m - 1 : 3 - m; };
      x = ff(x) * 0.92; y = ff(y) * 0.92;
      return [x, y];
    };
    const toPx = (x, y) => [cx + x * R, cy + (y * R) / A];
    return (t) => {
      const sweep = wrap((t / REV) * TAU - Math.PI / 2);
      cv.clear();
      for (const k of [0.25, 0.5, 0.75, 1]) cv.ellipse(cx, cy, R * k, (R * k) / A, k === 1 ? mix(th.bg, th.pos, 0.5) : dim);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const r0 = i % 3 === 0 ? 0.0 : 0.94;
        cv.line(cx + Math.cos(a) * R * r0, cy + (Math.sin(a) * R * r0) / A, cx + Math.cos(a) * R, cy + (Math.sin(a) * R) / A, i % 3 === 0 ? mix(th.bg, th.pos, 0.18) : dim);
      }
      // The afterglow wedge behind the beam.
      for (let k = 22; k >= 0; k--) {
        const a = sweep - k * 0.035;
        const c = k === 0 ? mix(green, 0xffffff, 0.5) : mix(th.bg, green, 0.55 * (1 - k / 23) ** 1.5);
        cv.line(cx, cy, cx + Math.cos(a) * R, cy + (Math.sin(a) * R) / A, c);
      }
      const glow = (x, y) => {
        const age = wrap(sweep - wrap(Math.atan2(y, x))) / TAU * REV; // seconds since painted
        return Math.exp(-age / 1.6);
      };
      for (const [x, y] of clutter) { const k = glow(x, y); const [px, py] = toPx(x, y); cv.set(px, py, mix(th.bg, green, 0.25 + 0.5 * k)); }
      const fresh = [];
      for (const tr of tracks) {
        const [x, y] = pos(tr, t);
        const k = glow(x, y);
        // Persistence: the last three paints stay as fading history dots.
        for (let h = 3; h >= 1; h--) { const [hx, hy] = pos(tr, t - h * REV); const [px, py] = toPx(hx, hy); cv.set(px, py, mix(th.bg, green, 0.18 + 0.08 * (3 - h))); }
        const [px, py] = toPx(x, y);
        const c = mix(th.bg, mix(green, 0xffffff, 0.35), 0.3 + 0.7 * k);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dy === 0) cv.set(px + dx, py + dy, c);
        fresh.push({ tr, x, y, k, px, py });
      }
      cv.paint(b);
      // Freshly painted tracks carry their id tag until they fade.
      if (cols >= 40) for (const { tr, k, px, py } of fresh) {
        if (k < 0.3) continue;
        const tx = Math.round(px / cv.sx) + 1, ty = Math.round(py / cv.sy) - 1;
        if (ty >= 0 && tx + 3 <= cols) b.text(tx, ty, tr.id, mix(th.bg, th.pos, 0.35 + 0.65 * k));
      }
      // Cardinal labels just inside the outer ring.
      if (H >= 12) {
        const lab = (s, a) => { const x = Math.round((cx + Math.cos(a) * R * 0.86) / cv.sx), y = Math.round((cy + (Math.sin(a) * R * 0.86) / A) / cv.sy); b.text(clamp(x - 1, 0, cols - 3), clamp(y, 0, H - 1), s, mix(th.bg, th.pos, 0.6)); };
        lab('000', -Math.PI / 2); lab('090', 0); lab('180', Math.PI / 2); lab('270', Math.PI);
      }
      if (tableW) {
        const x0 = cols + 1;
        b.text(x0, 0, 'APPROACH  ', th.ink, undefined, ATTR.BOLD);
        putR(b, W, 0, `SWP ${deg(wrap(sweep + Math.PI / 2))}`, th.pos);
        b.text(x0, 1, 'TRK  BRG  RNG  ALT  SPD', th.dim);
        fresh.slice(0, H - 4).forEach(({ tr, x, y, k }, i) => {
          const brg = wrap(Math.atan2(y, x) + Math.PI / 2), rng = Math.hypot(x, y) * 40;
          const c = k > 0.6 ? th.ink : th.muted;
          const row = `${tr.id}  ${deg(brg)}  ${rng.toFixed(0).padStart(3)}  ${String(tr.alt).padStart(3)}  ${tr.spd}`;
          if (k > 0.6) b.set(x0 - 1, 2 + i, g.u ? '▸' : '>', th.pos);
          b.text(x0, 2 + i, row, c, undefined, k > 0.85 ? ATTR.BOLD : 0);
        });
        if (H >= 12) put(b, x0, H - 1, 'RNG nm · ALT FL · SPD kt', W - x0, th.dim);
      }
    };
  },
};

const CONTACTS = [
  { id: 'S1', cls: 'merchant', brg: 0.9, r: 0.72, drift: 0.02 },
  { id: 'S2', cls: 'biologic', brg: 2.4, r: 0.38, drift: -0.05 },
  { id: 'S3', cls: 'submerged', brg: 4.1, r: 0.86, drift: 0.035 },
  { id: 'S4', cls: 'fishing', brg: 5.3, r: 0.55, drift: -0.015 },
];

const sonar = {
  id: 'maps-sonar',
  title: 'Active Sonar',
  category: 'Radar & Sonar',
  description: 'An active sonar: pings ripple out, contacts light up and echo as the wavefront reaches them, and a bearing-time waterfall scrolls beside.',
  tags: ['sonar', 'ping', 'waterfall', 'contacts', 'echo'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 30, h: 10 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const fallW = W >= 64 ? Math.floor(W * 0.42) : 0;
    const cols = W - fallW - (fallW ? 1 : 0);
    const cv = ctx.canvas('line', { cols, rows: H });
    const A = cv.aspect, cx = cv.width / 2, cy = cv.height / 2;
    const R = Math.min(cv.width / 2 - 1, (cv.height / 2) * A - 1);
    const PING = 4, SPEED = 1 / 2.6; // a ping reaches the edge in 2.6 s
    const sea = th.info;
    const ramp = g.u ? ' ·∙:;=+*#█' : ' .:-=+*#%@';
    const contactAt = (c, t) => c.brg + c.drift * t;
    return (t) => {
      const ping = Math.floor(t / PING), since = t - ping * PING;
      const front = since * SPEED; // in units of R
      cv.clear();
      for (const k of [0.33, 0.66, 1]) cv.ellipse(cx, cy, R * k, (R * k) / A, mix(th.bg, sea, k === 1 ? 0.45 : 0.18));
      cv.line(cx - R, cy, cx + R, cy, mix(th.bg, sea, 0.12));
      cv.line(cx, cy - R / A, cx, cy + R / A, mix(th.bg, sea, 0.12));
      if (front < 1.05) {
        for (let w = 0; w < 3; w++) {
          const r = (front - w * 0.025) * R;
          if (r > 0) cv.ellipse(cx, cy, r, r / A, mix(th.bg, mix(sea, 0xffffff, 0.4), 0.9 - w * 0.3));
        }
      }
      const lit = [];
      for (const c of CONTACTS) {
        const a = contactAt(c, t);
        const x = cx + Math.sin(a) * c.r * R, y = cy - (Math.cos(a) * c.r * R) / A;
        const hit = since - c.r / SPEED; // seconds since the wavefront reached it
        const k = hit >= 0 ? Math.exp(-hit / 1.2) : Math.exp(-(hit + PING) / 1.2) * 0.6;
        const col = mix(th.bg, c.cls === 'submerged' ? th.warn : mix(sea, 0xffffff, 0.3), 0.25 + 0.75 * k);
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) cv.set(x + dx, y + dy, col);
        // The echo travels back as a small ring.
        if (hit >= 0 && hit < 1) { const er = hit * R * 0.12; cv.ellipse(x, y, er, er / A, mix(th.bg, sea, 0.6 * (1 - hit))); }
        lit.push({ c, x, y, k, a });
      }
      cv.paint(b);
      for (const { c, x, y, k } of lit) {
        const tx = Math.round(x / cv.sx) + 2, ty = Math.round(y / cv.sy);
        if (k > 0.25 && tx + 2 < cols && ty >= 0 && ty < H) b.text(tx, ty, c.id, c.cls === 'submerged' ? th.warn : th.ink, undefined, ATTR.BOLD);
      }
      b.text(0, 0, `PING ${String(ping % 1000).padStart(3, '0')}`, th.info, undefined, ATTR.BOLD);
      if (H >= 12) b.text(0, H - 1, `${(since).toFixed(1)}s`, th.dim);
      if (fallW) {
        // Bearing-time waterfall: newest row on top, contacts as bright streaks.
        const x0 = cols + 1, fw = fallW, head = 1, rows = H - head - (H >= 12 ? 1 : 0);
        b.text(x0, 0, 'BRG 000', th.dim);
        putR(b, x0 + fw, 0, '359', th.dim);
        b.text(x0 + Math.floor(fw / 2) - 1, 0, '180', th.dim);
        for (let r = 0; r < rows; r++) {
          const tt = t - r * 0.5; // each row is half a second older
          for (let i = 0; i < fw; i++) {
            const brg = (i / fw) * TAU;
            let v = 0.18 + 0.22 * (ctx.noise.noise2(i * 0.35, Math.floor(tt * 2) * 0.7) + 0.5);
            for (const c of CONTACTS) {
              let d = Math.abs(wrap(contactAt(c, tt)) - brg); d = Math.min(d, TAU - d);
              v += (c.cls === 'biologic' ? 0.45 : 0.85) * Math.exp(-((d / 0.06) ** 2));
            }
            v = clamp(v, 0, 1);
            const ch = ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
            b.set(x0 + i, head + r, ch, mix(th.bg, sea, 0.25 + 0.75 * v));
          }
        }
        if (H >= 12) {
          const y = H - 1;
          let x = x0;
          for (const c of CONTACTS) { if (x + 8 > x0 + fw) break; x = b.text(x, y, `${c.id} ${deg(wrap(contactAt(c, t)))}`, c.cls === 'submerged' ? th.warn : th.muted) + 2; }
        }
      }
    };
  },
};

export default [radar, sonar];
