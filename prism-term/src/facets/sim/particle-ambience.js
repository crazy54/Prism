// Quiet particle studies: bubbles nucleating up a glass, dust motes drifting
// through a window's light shaft, and iron filings combing themselves along
// the field of a wandering bar magnet. Deterministic via ctx.rng / ctx.noise.
import { NONE, mix, scale } from '../../color.js';
import { clamp, smoothstep } from '../../easing.js';
import { fadeMark } from '../../palettes.js';

const bubbles = {
  id: 'sim-bubbles',
  since: '0.3.0',
  title: 'Sparkling Glass',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['bubbles', 'glass', 'carbonation', 'fizz', 'drink'],
  order: 230,
  description: 'Carbonation in a glass: bubbles nucleate at pinned sites, wobble up faster as they grow, and pop into the surface chop.',
  size: { w: 46, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 10,
  color: '256',
  setup(ctx) {
    const W = ctx.width, H = ctx.height, b = ctx.buffer;
    const rand = ctx.rng, th = ctx.theme;
    const gx0 = Math.max(1, Math.round(W * 0.17)), gx1 = W - 1 - gx0;
    const gy0 = 1, gy1 = H - 2, waterY = gy0 + 1;
    const innerW = Math.max(1, gx1 - gx0 - 1);
    const waterBg = mix(th.bg, th.info, th.mode === 'light' ? 0.13 : 0.2);
    const TIERS = ['·', 'o', 'O', '○']; // · o O ○ — all fold to 7-bit
    const hue = mix(th.info, th.mode === 'light' ? th.ink : 0xffffff, 0.45);
    const ns = Math.max(3, Math.floor(innerW / 4));
    const sites = Array.from({ length: ns }, (_, i) => {
      const stream = rand() < 0.22; // a champagne thread
      return {
        x: gx0 + 1 + Math.min(innerW - 1, Math.floor(rand() * innerW)),
        y: rand() < 0.2 ? waterY + 1 + Math.floor(rand() * Math.max(1, gy1 - waterY - 2)) : gy1 - 1,
        p: stream ? 0.16 + rand() * 0.1 : 0.6 + rand() * 1.7,
        next: rand() * 1.5, sz: stream ? 0 : rand() * 1.4,
      };
    });
    const bub = [], pops = [];
    return (t, dt) => {
      // water, glass, surface
      b.fill(gx0 + 1, waterY + 1, innerW, Math.max(0, gy1 - waterY - 1), ' ', th.ink, waterBg);
      for (let y = gy0; y < gy1; y++) { b.set(gx0, y, '│', th.line); b.set(gx1, y, '│', th.line); }
      b.set(gx0, gy1, '╰', th.line); b.set(gx1, gy1, '╯', th.line);
      for (let x = gx0 + 1; x < gx1; x++) b.set(x, gy1, '─', th.line);
      for (let x = gx0 + 1; x < gx1; x++) {
        const lit = 0.45 + 0.35 * Math.sin(x * 0.9 - t * 2.2);
        b.set(x, waterY, '~', fadeMark(th, mix(th.info, th.ink, 0.35), clamp(lit, 0.2, 1)), waterBg);
      }
      // nucleation
      for (const s of sites) {
        if (t < s.next) continue;
        s.next = t + s.p * (0.75 + rand() * 0.5);
        if (bub.length < 90) bub.push({ x: s.x, y: s.y, ph: rand() * 6.28, w: 2 + rand() * 3, sz: s.sz, born: t });
      }
      for (let i = bub.length - 1; i >= 0; i--) {
        const p = bub[i];
        const span = Math.max(1, gy1 - 1 - waterY);
        const prog = clamp((gy1 - 1 - p.y) / span, 0, 1);
        const tier = Math.min(TIERS.length - 1, Math.floor(p.sz + prog * 2.4));
        p.y -= (1.1 + 0.6 * tier) * dt;
        if (p.y <= waterY + 0.6) {
          pops.push({ x: p.x, t0: t });
          bub.splice(i, 1);
          continue;
        }
        const xr = Math.round(p.x + Math.sin(t * p.w + p.ph) * (0.5 + 0.35 * tier));
        const yr = Math.round(p.y);
        if (xr > gx0 && xr < gx1 && yr > waterY && yr < gy1)
          b.set(xr, yr, TIERS[tier], fadeMark(th, hue, 0.45 + 0.55 * prog), waterBg);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i], age = t - p.t0;
        if (age > 0.22) { pops.splice(i, 1); continue; }
        b.set(p.x, waterY, age < 0.1 ? '*' : '·', fadeMark(th, th.ink, 1 - age * 3), waterBg);
        if (age < 0.1 && waterY - 1 >= 0) b.set(p.x, waterY - 1, '·', fadeMark(th, hue, 0.8));
      }
    };
  },
};

const dust = {
  id: 'sim-dust-motes',
  since: '0.3.0',
  title: 'Dust in a Sunbeam',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['dust', 'motes', 'sunbeam', 'light shaft', 'brownian', 'calm'],
  order: 240,
  description: 'A shaft of window light crosses a dark room; dust motes drift on slow eddies and only kindle while they hang in the beam.',
  size: { w: 72, h: 22 },
  minSize: { w: 20, h: 8 },
  loop: 20,
  canvas: 'field',
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, aspect, px } = cv;
    const rand = ctx.rng, th = ctx.theme, n2 = ctx.noise.noise2;
    const Hv = H * aspect, S = Math.min(W, Hv);
    const dark = th.mode === 'light' ? 0x0c0d14 : th.bg;
    const warm = mix(th.warn, 0xfff1d6, 0.6);
    // Beam: the region between two parallel rays entering along the top edge.
    const e0 = W * 0.07, e1 = W * 0.32;
    const dl = Math.hypot(0.52, 0.85), dx = 0.52 / dl, dy = 0.85 / dl;
    const Bw = (e1 - e0) * dy, L = (Hv / dy) * 1.05;
    const inten = new Float32Array(W * H);
    const bandIx = new Uint8Array(W * H);
    const baseCol = new Int32Array(W * H).fill(NONE);
    for (let yp = 0; yp < H; yp++) {
      const yu = yp * aspect;
      for (let x = 0; x < W; x++) {
        const rx = x - e0, u = rx * dx + yu * dy, q = rx * dy - yu * dx;
        if (u <= 0 || q < 0 || q > Bw) continue;
        const f = q / Bw;
        let v = smoothstep(0, 0.16, f) * smoothstep(1, 0.84, f) * Math.exp(-u / L) * 0.62;
        if (yu > Hv * 0.9) v *= 1.5; // the pool where the beam meets the floor
        const i = yp * W + x;
        inten[i] = v;
        bandIx[i] = Math.min(7, (u / (L * 1.1) * 8) | 0);
        baseCol[i] = mix(dark, warm, clamp(v, 0, 1));
      }
    }
    const n = Math.round(clamp((W * H) / 140, 30, 220));
    const motes = Array.from({ length: n }, () => ({
      x: rand() * W, y: rand() * Hv,
      vx: 0, vy: 0, ph: rand() * 6.28, tw: 1.5 + rand() * 3, big: rand() < 0.12,
    }));
    const bands = new Float32Array(8);
    const at = (x, yu) => {
      const i = Math.round(yu / aspect) * W + Math.round(x);
      return i >= 0 && i < inten.length ? inten[i] : 0;
    };
    return (t, dt) => {
      if (th.mode === 'light') ctx.buffer.fill(0, 0, ctx.width, ctx.height, ' ', th.ink, dark);
      for (let k = 0; k < 8; k++) bands[k] = 0.84 + 0.32 * (0.5 + 0.5 * n2(k * 0.9 + 2, t * 0.5));
      for (let i = 0; i < px.length; i++) px[i] = inten[i] > 0.004 ? scale(baseCol[i], bands[bandIx[i]]) : NONE;
      const dtc = Math.min(0.1, dt);
      for (const m of motes) {
        const k = at(m.x, m.y);
        m.vx += (n2(m.x * 0.03, m.y * 0.03 + t * 0.12) * S * 0.26 - m.vx * 0.9) * dtc;
        m.vy += ((0.045 * S - k * S * 0.14) + n2(m.y * 0.03 + 40, t * 0.1) * S * 0.1 - m.vy * 0.9) * dtc;
        m.x += m.vx * dtc; m.y += m.vy * dtc;
        if (m.x < 0) m.x += W; else if (m.x >= W) m.x -= W;
        if (m.y < 0) m.y += Hv; else if (m.y >= Hv) m.y -= Hv;
        const lit = clamp(0.1 + k * (1.1 + 0.5 * Math.sin(t * m.tw + m.ph)), 0, 1);
        const yp = m.y / aspect;
        cv.blend(m.x, yp, warm, lit);
        if (m.big) cv.blend(m.x + 1, yp, warm, lit * 0.6);
      }
      cv.paint(ctx.buffer);
    };
  },
};

const filings = {
  id: 'sim-iron-filings',
  since: '0.3.0',
  title: 'Iron Filings',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['magnet', 'iron filings', 'dipole', 'field lines', 'physics class'],
  order: 250,
  description: 'Iron filings comb themselves along the live field of a bar magnet as it wanders and rolls — poles tug the nearest into color.',
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 16,
  canvas: 'line',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const { width: W, height: H, aspect } = cv;
    const rand = ctx.rng, th = ctx.theme;
    const Hv = H * aspect, S = Math.min(W, Hv);
    const stepx = Math.max(3, Math.round(W / 42)), stepy = stepx * 1.12;
    const pts = [];
    for (let y = stepy * 0.6; y < Hv - 1; y += stepy)
      for (let x = stepx * 0.6; x < W - 1; x += stepx)
        pts.push({ x: x + (rand() - 0.5) * 1.6, y: y + (rand() - 0.5) * 1.6 });
    const Lm = Math.max(2, S * 0.17), wm = Math.max(1, S * 0.055);
    const S0 = S * 0.24;
    const T = 16; // Lissajous drift + one full roll per loop: closes exactly
    return (t) => {
      cv.clear();
      const ph = (Math.PI * 2 * t) / T;
      const cx = W / 2 + Math.sin(ph) * W * 0.2;
      const cy = Hv / 2 + Math.sin(2 * ph + 1) * Hv * 0.15;
      const mx = Math.cos(ph), my = Math.sin(ph);          // dipole axis
      const nx = -my, ny = mx;
      for (const p of pts) {
        const rx = p.x - cx, ry = p.y - cy;
        const along = rx * mx + ry * my, across = rx * nx + ry * ny;
        if (Math.abs(along) < Lm + 1.5 && Math.abs(across) < wm + 1.5) continue; // under the bar
        const d = Math.hypot(rx, ry) + 0.001;
        const ux = rx / d, uy = ry / d;
        const mr = mx * ux + my * uy;
        let bx = 3 * ux * mr - mx, by = 3 * uy * mr - my;
        const k = Math.pow(S0 / d, 3);
        const mag = Math.hypot(bx, by) * k;
        const bl = Math.hypot(bx, by) + 1e-6;
        bx /= bl; by /= bl;
        const half = (1.1 + 2.1 * clamp(mag * 0.9, 0, 1)) / 2 + 0.55;
        const prox = clamp((S0 * 1.5) / d, 0, 1);
        const col = mix(th.muted, along > 0 ? th.neg : th.info, prox * 0.85);
        const bri = clamp(0.22 + 0.9 * Math.pow(clamp(mag, 0, 1), 0.55), 0, 1);
        cv.line(p.x - bx * half, (p.y - by * half) / aspect, p.x + bx * half, (p.y + by * half) / aspect, fadeMark(th, mix(col, th.ink, 0.2), bri));
      }
      // the magnet: two solid halves (N red / S blue), inked outline
      for (let k = -2; k <= 2; k++) {
        const ox = (nx * wm * k) / 2, oy = (ny * wm * k) / 2;
        cv.line(cx + ox, (cy + oy) / aspect, cx + mx * Lm + ox, (cy + my * Lm + oy) / aspect, th.neg);
        cv.line(cx - mx * Lm + ox, (cy - my * Lm + oy) / aspect, cx + ox, (cy + oy) / aspect, th.info);
      }
      cv.path([
        [cx + mx * Lm + nx * wm, (cy + my * Lm + ny * wm) / aspect],
        [cx + mx * Lm - nx * wm, (cy + my * Lm - ny * wm) / aspect],
        [cx - mx * Lm - nx * wm, (cy - my * Lm - ny * wm) / aspect],
        [cx - mx * Lm + nx * wm, (cy - my * Lm + ny * wm) / aspect],
      ], th.ink, true);
      cv.paint(ctx.buffer);
      // pole labels sit on top of the painted cells
      const label = (lx, ly, ch) => {
        const bx = Math.round(lx / cv.sx), by = Math.round(ly / aspect / cv.sy);
        if (bx >= 0 && bx < ctx.width && by >= 0 && by < ctx.height) ctx.buffer.set(bx, by, ch, th.ink);
      };
      if (S > 40) {
        label(cx + mx * Lm * 0.62, cy + my * Lm * 0.62, 'N');
        label(cx - mx * Lm * 0.62, cy - my * Lm * 0.62, 'S');
      }
    };
  },
};

export default [bubbles, dust, filings];
