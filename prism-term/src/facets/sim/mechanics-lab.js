// Five little mechanics rigs: a Verlet cloth flag, a pressurized soft-body
// blob, a domino chain with a resetting pusher, a gravity-assist flyby past an
// orbiting planet, and an analytic Newton's cradle whose loop closes exactly.
// Deterministic: fixed-step integrators, ctx.rng / ctx.noise only.
import { NONE, mix, scale } from '../../color.js';
import { clamp, lerp, smoothstep } from '../../easing.js';
import { fadeMark } from '../../palettes.js';

const cloth = {
  id: 'sim-cloth-flag',
  since: '0.3.0',
  title: 'Cloth Flag',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['cloth', 'flag', 'verlet', 'wind', 'constraints', 'wireframe'],
  order: 200,
  description: 'A striped flag as a Verlet cloth mesh pinned to its pole — gusts ripple down the weave and the taut threads catch the light.',
  size: { w: 70, h: 22 },
  minSize: { w: 20, h: 8 },
  loop: 16,
  canvas: 'line',
  params: { wind: { default: 1, min: 0.1, max: 3, label: 'Wind' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const { width: W, height: H, aspect } = cv;
    const th = ctx.theme, n2 = ctx.noise.noise2;
    const windP = ctx.param('wind', 1);
    const Hv = H * aspect, S = Math.min(W, Hv);
    const poleX = W * 0.07, top = Hv * 0.14;
    const CW = W * 0.62, CH = Hv * 0.5;
    const NX = clamp(Math.floor(CW / 3), 8, 28) | 0, NY = clamp(Math.floor(CH / 3), 6, 14) | 0;
    const rx = CW / (NX - 1), ry = CH / (NY - 1);
    const n = NX * NY;
    const x = new Float32Array(n), y = new Float32Array(n), ox = new Float32Array(n), oy = new Float32Array(n);
    for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) {
      const i = r * NX + c;
      x[i] = ox[i] = poleX + c * rx;
      y[i] = oy[i] = top + r * ry;
    }
    const stripes = [th.accent, th.accent2, th.info];
    const HZ = 90, h = 1 / HZ, h2 = h * h;
    const step = (t) => {
      for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) {
        const i = r * NX + c;
        if (c === 0) continue;
        const wx = S * (0.6 + 0.8 * n2(t * 0.8 + c * 0.06, r * 0.33)) * windP + S * 0.5 * n2(t * 0.45, 3.3) * windP;
        const wy = S * 0.42 + S * 0.3 * n2(t * 1.2 + c * 0.05, 7.1 + r * 0.2);
        const vx = (x[i] - ox[i]) * 0.985, vy = (y[i] - oy[i]) * 0.985;
        ox[i] = x[i]; oy[i] = y[i];
        x[i] += vx + wx * h2; y[i] += vy + wy * h2;
      }
      for (let it = 0; it < 2; it++) {
        for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) {
          const i = r * NX + c;
          if (c < NX - 1) relaxPair(i, i + 1, rx);
          if (r < NY - 1) relaxPair(i, i + NX, ry);
        }
        for (let r = 0; r < NY; r++) { const i = r * NX; x[i] = poleX; y[i] = top + r * ry; }
      }
    };
    function relaxPair(i, j, rest) {
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const d = Math.hypot(dx, dy) || 1e-4;
      const k = ((d - rest) / d) * 0.5;
      x[i] += dx * k; y[i] += dy * k;
      x[j] -= dx * k; y[j] -= dy * k;
    }
    let acc = 0, simT = 0;
    for (let k = 0; k < HZ; k++) { simT += h; step(simT); } // settle into the wind
    return (t, dt) => {
      acc += Math.min(0.25, dt) * HZ;
      for (; acc >= 1; acc--) { simT += h; step(simT); }
      cv.clear();
      cv.line(poleX, Math.max(0, top - 3) / aspect, poleX, (Hv * 0.96) / aspect, th.muted);
      cv.line(poleX - 1, Math.max(0, top - 3) / aspect, poleX - 1, (Hv * 0.96) / aspect, fadeMark(th, th.muted, 0.5));
      cv.circle(poleX, Math.max(1, top - 3.5) / aspect, 1.2, th.ink, true);
      for (let r = 0; r < NY; r++) {
        const sc = stripes[Math.min(2, Math.floor((r / Math.max(1, NY - 1)) * 3))];
        for (let c = 0; c < NX - 1; c++) {
          const i = r * NX + c;
          const d = Math.hypot(x[i + 1] - x[i], y[i + 1] - y[i]);
          const lit = clamp(0.4 + (d / rx - 0.92) * 3.2, 0.25, 1);
          cv.line(x[i], y[i] / aspect, x[i + 1], y[i + 1] / aspect, fadeMark(th, sc, lit));
        }
      }
      for (let c = 1; c < NX; c += 2) {
        for (let r = 0; r < NY - 1; r++) {
          const i = r * NX + c;
          const sc = stripes[Math.min(2, Math.floor((r / Math.max(1, NY - 1)) * 3))];
          cv.line(x[i], y[i] / aspect, x[i + NX], y[i + NX] / aspect, fadeMark(th, sc, 0.3));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};

const blob = {
  id: 'sim-soft-blob',
  since: '0.3.0',
  title: 'Soft-Body Blob',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['soft body', 'blob', 'pressure', 'verlet', 'squash', 'jelly'],
  order: 210,
  description: 'A gas-pressurized Verlet ring that drops, squashes flat, jiggles back round, and hops off the floor when it gets a kick.',
  size: { w: 56, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 18,
  canvas: 'field',
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, aspect } = cv;
    const th = ctx.theme, n2 = ctx.noise.noise2;
    const Hv = H * aspect, S = Math.min(W, Hv);
    const N = 26, R0 = Math.max(2.5, S * 0.17);
    const A0 = Math.PI * R0 * R0, rest = (2 * Math.PI * R0) / N;
    const x = new Float32Array(N), y = new Float32Array(N), ox = new Float32Array(N), oy = new Float32Array(N);
    const fx = new Float32Array(N), fy = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      x[i] = ox[i] = W / 2 + Math.cos(a) * R0;
      y[i] = oy[i] = Hv * 0.3 + Math.sin(a) * R0;
    }
    const floor = Hv * 0.92, grav = S * 1.0, kp = S * 2.4;
    const HZ = 120, h = 1 / HZ, h2 = h * h;
    const KICK = 4.5;
    let kicked = 0; // no kick at t=0: the opening drop is the first beat
    const step = () => {
      let A = 0;
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; A += x[i] * y[j] - x[j] * y[i]; }
      A /= 2;
      const sgn = A >= 0 ? 1 : -1;
      const P = clamp(kp * (A0 / Math.max(1, Math.abs(A)) - 1), -S * 3, S * 3);
      fx.fill(0); fy.fill(0);
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const ex = x[j] - x[i], ey = y[j] - y[i];
        const len = Math.hypot(ex, ey) || 1e-4;
        const nxo = (ey / len) * sgn, nyo = (-ex / len) * sgn; // outward normal
        const f = P * len * 0.5;
        fx[i] += nxo * f; fy[i] += nyo * f;
        fx[j] += nxo * f; fy[j] += nyo * f;
      }
      for (let i = 0; i < N; i++) {
        const vx = (x[i] - ox[i]) * 0.995, vy = (y[i] - oy[i]) * 0.995;
        ox[i] = x[i]; oy[i] = y[i];
        x[i] += vx + fx[i] * h2; y[i] += vy + (fy[i] + grav) * h2;
      }
      for (let it = 0; it < 3; it++) for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const d = Math.hypot(dx, dy) || 1e-4;
        const k = ((d - rest) / d) * 0.5;
        x[i] += dx * k; y[i] += dy * k; x[j] -= dx * k; y[j] -= dy * k;
      }
      for (let i = 0; i < N / 2; i++) { // soft diameter struts: squashy, never folded
        const j = i + N / 2;
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const d = Math.hypot(dx, dy) || 1e-4;
        const k = ((d - 2 * R0) / d) * 0.06;
        x[i] += dx * k; y[i] += dy * k; x[j] -= dx * k; y[j] -= dy * k;
      }
      for (let i = 0; i < N; i++) {
        if (y[i] > floor) { y[i] = floor; oy[i] = y[i]; ox[i] = x[i] - (x[i] - ox[i]) * 0.4; }
        if (y[i] < 1) { y[i] = 1; oy[i] = y[i]; }
        if (x[i] < 1) { x[i] = 1; ox[i] = x[i]; } else if (x[i] > W - 2) { x[i] = W - 2; ox[i] = x[i]; }
      }
    };
    const body = mix(th.accent, th.bg, 0.45), rim = th.accent;
    const shadowC = th.mode === 'light' ? mix(th.bg, th.ink, 0.16) : scale(th.bg, 0.55);
    const eyeC = th.mode === 'light' ? 0x20202a : 0x0b0b12;
    let acc = 0;
    const pts = Array.from({ length: N }, () => [0, 0]);
    return (t, dt) => {
      const kc = Math.floor(t / KICK);
      if (kc !== kicked) {
        kicked = kc;
        const ang = -Math.PI / 2 + n2(kc * 3.7, 5.1) * 1.1;
        const imp = S * (0.005 + 0.002 * (0.5 + 0.5 * n2(kc * 1.3, 9.7)));
        for (let i = 0; i < N; i++) { ox[i] -= Math.cos(ang) * imp * HZ * h; oy[i] -= Math.sin(ang) * imp * HZ * h; }
      }
      acc += Math.min(0.25, dt) * HZ;
      for (; acc >= 1; acc--) step();
      cv.clear();
      let cx = 0, cy = 0;
      for (let i = 0; i < N; i++) { cx += x[i]; cy += y[i]; pts[i][0] = x[i]; pts[i][1] = y[i] / aspect; }
      cx /= N; cy /= N;
      const lift = clamp(1 - (floor - cy) / (R0 * 2.2), 0, 1);
      if (lift > 0.05) cv.ellipse(cx, (floor + 1) / aspect, R0 * (0.7 + 0.9 * lift), Math.max(1, (R0 * 0.22) / aspect), fadeMark(th, shadowC === NONE ? th.muted : shadowC, 0.9), true);
      cv.polygon(pts, body);
      cv.path(pts, rim, true);
      cv.circle(cx - R0 * 0.32, (cy - R0 * 0.38) / aspect, Math.max(1, R0 * 0.16), mix(body, 0xffffff, th.mode === 'light' ? 0.35 : 0.55), true);
      if (S > 34) {
        const look = clamp((x[0] - ox[0]) * 8, -1, 1) * R0 * 0.12;
        for (const exo of [-R0 * 0.3, R0 * 0.3])
          cv.circle(cx + exo + look, (cy - R0 * 0.12) / aspect, Math.max(1, R0 * 0.09), eyeC, true);
      }
      cv.paint(ctx.buffer);
    };
  },
};

const dominoes = {
  id: 'sim-domino-run',
  since: '0.3.0',
  title: 'Domino Run',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['dominoes', 'chain reaction', 'toppling', 'rigid body', 'momentum'],
  order: 220,
  description: 'A pusher ball taps the first domino; torque tips each tile onto the next until the row lies leaning, then the chain re-stands.',
  size: { w: 76, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: 12,
  canvas: 'line',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const { width: W, height: H, aspect } = cv;
    const th = ctx.theme, pal = ctx.palette();
    const Hv = H * aspect, S = Math.min(W, Hv);
    const N = clamp(Math.floor(W / 9), 7, 16) | 0;
    const margin = W * 0.09, span = W - margin * 2, gap = span / (N - 1);
    const Lh = clamp(gap * 1.75, 3, Hv * 0.46), wd = Math.max(1, Lh * 0.16);
    const baseY = Hv * 0.88;
    const pxs = Array.from({ length: N }, (_, i) => margin + i * gap);
    const restA = Array.from({ length: N }, (_, i) => (i === N - 1 ? 1.5 : Math.min(1.45, Math.asin(clamp((gap - wd) / Lh, 0.15, 1)) + 0.1)));
    const cols = Array.from({ length: N }, (_, i) => mix(pal(i / N), th.ink, 0.15));
    const LOOP = 12, T0 = 0.45, RISE = LOOP - 4.2;
    const th_ = new Float32Array(N), w_ = new Float32Array(N);
    const trig = new Uint8Array(N);
    const clicks = [];
    let run = -1, acc = 0;
    const HZ = 240, hh = 1 / HZ;
    const step = (local, t) => {
      for (let i = 0; i < N; i++) {
        if (!trig[i] || th_[i] >= restA[i]) continue;
        w_[i] += 16 * Math.sin(th_[i] + 0.06) * hh;
        th_[i] += w_[i] * hh;
        if (i < N - 1 && !trig[i + 1] && pxs[i] + Math.sin(th_[i]) * Lh >= pxs[i + 1] - wd * 0.4) {
          trig[i + 1] = 1; w_[i + 1] = Math.max(0.3, w_[i] * 0.55);
          if (clicks.length < 24) clicks.push({ x: pxs[i + 1], y: baseY - Lh * Math.cos(th_[i]) * 0.72, t0: t });
        }
        if (th_[i] >= restA[i]) { th_[i] = restA[i]; w_[i] = 0; }
      }
    };
    return (t, dt) => {
      const r = Math.floor(t / LOOP);
      if (r !== run) { run = r; th_.fill(0); w_.fill(0); trig.fill(0); clicks.length = 0; acc = 0; }
      const local = t - r * LOOP;
      if (local >= T0 && !trig[0]) { trig[0] = 1; w_[0] = 0.35; }
      if (local < RISE) {
        acc += Math.min(0.25, dt) * HZ;
        for (; acc >= 1; acc--) step(local, t);
      } else {
        for (let i = 0; i < N; i++) { // an unseen hand re-stands them from the far end
          const s = (local - (RISE + ((N - 1 - i) * 2.4) / N)) / 0.4;
          if (s >= 1) { th_[i] = 0; trig[i] = 0; w_[i] = 0; }
          else if (s > 0) { th_[i] = restA[i] * (1 - smoothstep(0, 1, s)); trig[i] = 0; w_[i] = 0; }
        }
      }
      cv.clear();
      cv.line(0, baseY / aspect + 1, W - 1, baseY / aspect + 1, fadeMark(th, th.muted, 0.6));
      for (let i = 0; i < N; i++) {
        const a = th_[i], ux = Math.sin(a), uy = -Math.cos(a), qx = Math.cos(a), qy = Math.sin(a);
        for (let k = 0; k <= 3; k++) {
          const o = (k / 3 - 0.5) * wd;
          cv.line(pxs[i] + qx * o, (baseY + qy * o) / aspect, pxs[i] + qx * o + ux * Lh, (baseY + qy * o + uy * Lh) / aspect, cols[i]);
        }
        cv.line(pxs[i] - qx * wd * 0.5 + ux * Lh, (baseY - qy * wd * 0.5 + uy * Lh) / aspect, pxs[i] + qx * wd * 0.5 + ux * Lh, (baseY + qy * wd * 0.5 + uy * Lh) / aspect, mix(cols[i], th.ink, 0.35));
      }
      // the pusher ball patrols: push, roll along the fallen row, roll back
      const br = Math.max(1, S * 0.03);
      let bx, by = baseY - br;
      if (local < T0) { bx = lerp(-2, pxs[0] - wd - 1, smoothstep(0, 1, local / T0)); by = baseY - Lh * 0.7; }
      else if (local < RISE) { bx = lerp(pxs[0] - wd, margin + span * 0.98, (local - T0) / (RISE - T0)); by = baseY - br - Math.abs(Math.sin(local * 5)) * br * 0.7; }
      else bx = lerp(margin + span * 0.98, -2, (local - RISE) / (LOOP - RISE));
      cv.circle(bx, by / aspect, br, th.ink, true);
      for (let i = clicks.length - 1; i >= 0; i--) {
        const c = clicks[i], age = t - c.t0;
        if (age > 0.28) { clicks.splice(i, 1); continue; }
        cv.circle(c.x, c.y / aspect, 1 + age * 9, fadeMark(th, th.ink, 1 - age * 3.4));
      }
      cv.paint(ctx.buffer);
    };
  },
};

const slingshot = {
  id: 'sim-orbital-slingshot',
  since: '0.3.0',
  title: 'Gravity Assist',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['gravity assist', 'slingshot', 'orbit', 'flyby', 'spacecraft', 'trajectory'],
  order: 230,
  description: 'A probe coasts in, hooks around an orbiting planet and is flung out hot — its trail recolors with the speed the flyby stole.',
  size: { w: 64, h: 26 },
  minSize: { w: 20, h: 10 },
  loop: 15,
  canvas: 'line',
  setup(ctx) {
    const cv = ctx.canvas('line');        // persistent, fading: the trail
    const ov = ctx.canvas('line');        // cleared every frame: bodies, ring, probe
    const { width: W, height: H, aspect } = cv;
    const th = ctx.theme, n2 = ctx.noise.noise2;
    const Hv = H * aspect, S = Math.min(W, Hv);
    const cx = W * 0.5, cy = Hv * 0.5;
    const Rorb = S * 0.33, EP = 7.5, wp = (Math.PI * 2) / EP;
    const planetR = Math.max(1.2, S * 0.045), starR = Math.max(1.5, S * 0.05);
    const Gp = S * S * S * 0.0075, Gs = Gp * 0.03, eps = Math.pow(S * 0.02, 2);
    const tcross = EP * 0.42, phiT = -0.3, phi0 = phiT - wp * tcross;
    const x0 = 2, vx0 = (cx + Rorb - x0) / tcross;
    const probe = { x: 0, y: 0, vx: 0, vy: 0, alive: false, crash: -9, cx: 0, cy: 0 };
    let ep = -1;
    const HZ = 300, hh = 1 / HZ;
    let acc = 0;
    const hot = (k) => (k < 0.5 ? mix(th.info, th.warn, k * 2) : mix(th.warn, th.neg, k * 2 - 1));
    const planetAt = (t) => { const a = phi0 + wp * t; return [cx + Math.cos(a) * Rorb, cy + Math.sin(a) * Rorb]; };
    return (t, dt) => {
      const e = Math.floor(t / EP);
      if (e !== ep) {
        ep = e;
        const nv = n2((e % 2) * 3.7 + 1.3, 5.1); // two alternating approaches: the loop closes
        const aimY = planetAt(e * EP + tcross)[1] - planetR * (2.2 + 0.9 * Math.abs(nv));
        probe.x = x0; probe.y = Hv * 0.82;
        probe.vx = vx0;
        probe.vy = (aimY - probe.y) / tcross;
        probe.alive = true;
      }
      cv.fade(Math.exp(-dt * 0.8));
      acc += Math.min(0.25, dt) * HZ;
      let px0 = probe.x, py0 = probe.y;
      for (; acc >= 1; acc--) {
        if (!probe.alive) continue;
        const tt = t - (acc - 1) * hh; // close enough for the moving planet
        const [qx, qy] = planetAt(tt);
        const dx = probe.x - qx, dy = probe.y - qy;
        const d2 = dx * dx + dy * dy + eps, d = Math.sqrt(d2);
        let ax = (-Gp * dx) / (d2 * d), ay = (-Gp * dy) / (d2 * d);
        const sx = probe.x - cx, sy = probe.y - cy;
        const s2 = sx * sx + sy * sy + eps, sd = Math.sqrt(s2);
        ax -= (Gs * sx) / (s2 * sd); ay -= (Gs * sy) / (s2 * sd);
        probe.vx += ax * hh; probe.vy += ay * hh;
        probe.x += probe.vx * hh; probe.y += probe.vy * hh;
        // draw the trail at substep resolution so the hook stays a thin curve
        const v = Math.hypot(probe.vx, probe.vy);
        cv.line(px0, py0 / aspect, probe.x, probe.y / aspect, hot(clamp((v - vx0) / (vx0 * 1.6), 0, 1)));
        px0 = probe.x; py0 = probe.y;
        if (d < planetR * 1.15 || sd < starR * 1.2) { probe.alive = false; probe.crash = t; probe.cx = probe.x; probe.cy = probe.y; }
        if (probe.x < -6 || probe.x > W + 6 || probe.y < -6 || probe.y > Hv + 6) probe.alive = false;
      }
      ov.clear();
      for (let i = 0; i < 64; i += 2) { // dotted orbit ring
        const a = (i / 64) * Math.PI * 2;
        ov.set(cx + Math.cos(a) * Rorb, (cy + Math.sin(a) * Rorb) / aspect, fadeMark(th, th.muted, 0.4));
      }
      ov.circle(cx, cy / aspect, starR, th.warn, true);
      ov.circle(cx, cy / aspect, starR + 1, fadeMark(th, th.warn, 0.45));
      const [qx, qy] = planetAt(t);
      ov.circle(qx, qy / aspect, planetR, th.info, true);
      ov.circle(qx, qy / aspect, planetR, mix(th.info, th.ink, 0.35));
      if (probe.alive) ov.circle(probe.x, probe.y / aspect, Math.max(1, S * 0.012), th.mode === 'light' ? th.ink : 0xffffff, true);
      const ca = t - probe.crash;
      if (ca >= 0 && ca < 0.4) ov.circle(probe.cx, probe.cy / aspect, 1 + ca * 14, fadeMark(th, th.warn, 1 - ca * 2.4));
      cv.paint(ctx.buffer);
      ov.paint(ctx.buffer);
    };
  },
};

const cradle = {
  id: 'sim-newtons-cradle',
  since: '0.3.0',
  title: "Newton's Cradle",
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['newtons cradle', 'pendulum', 'momentum', 'impact', 'desk toy'],
  order: 240,
  description: "Newton's cradle on an exact analytic loop: one ball swings in, the far ball takes the momentum, and the middles shiver on impact.",
  size: { w: 56, h: 22 },
  minSize: { w: 20, h: 8 },
  loop: 3.2,
  canvas: 'line',
  params: { speed: { default: 1, min: 0.25, max: 3, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const { width: W, height: H, aspect } = cv;
    const th = ctx.theme;
    const speed = ctx.param('speed', 1);
    const Hv = H * aspect, S = Math.min(W, Hv);
    const NB = 5, r = Math.max(1.2, Math.min(S * 0.052, W / (NB * 2.6)));
    const cx = W / 2;
    const barY = Hv * 0.14, L = Math.min(Hv * 0.5, S * 0.42);
    const restY = barY + L;
    const ax = Array.from({ length: NB }, (_, i) => cx + (i - (NB - 1) / 2) * 2 * r);
    const A = 0.62, T = 3.2, q = T / 4, om = Math.PI / 2 / q;
    const floorY = Hv * 0.94;
    const restBall = mix(th.muted, th.ink, 0.45);
    const spec = th.mode === 'light' ? th.ink : 0xffffff;
    return (t) => {
      const p = ((t * speed) % T + T) % T;
      let thL = 0, thR = 0;
      if (p < q) thL = -A * Math.cos(om * p);
      else if (p < 3 * q) thR = A * Math.sin(om * (p - q));
      else thL = -A * Math.sin(om * (p - 3 * q));
      const since = p < q ? p + q : p < 3 * q ? p - q : p - 3 * q; // time since last impact
      const shiver = 0.55 * Math.exp(-9 * since) * Math.sin(45 * since);
      cv.clear();
      cv.line(ax[0] - r - 3, barY / aspect, ax[NB - 1] + r + 3, barY / aspect, th.muted);
      cv.line(ax[0] - r - 3, (barY + 1) / aspect, ax[NB - 1] + r + 3, (barY + 1) / aspect, fadeMark(th, th.muted, 0.5));
      cv.line(ax[0] - r - 3, barY / aspect, ax[0] - r - 3, floorY / aspect, fadeMark(th, th.muted, 0.7));
      cv.line(ax[NB - 1] + r + 3, barY / aspect, ax[NB - 1] + r + 3, floorY / aspect, fadeMark(th, th.muted, 0.7));
      cv.line(ax[0] - r - 5, floorY / aspect, ax[NB - 1] + r + 5, floorY / aspect, fadeMark(th, th.muted, 0.5));
      for (let i = 0; i < NB; i++) {
        let bx = ax[i], by = restY, moving = false;
        if (i === 0 && thL !== 0) { bx = ax[0] + Math.sin(thL) * L; by = barY + Math.cos(thL) * L; moving = true; }
        else if (i === NB - 1 && thR !== 0) { bx = ax[NB - 1] + Math.sin(thR) * L; by = barY + Math.cos(thR) * L; moving = true; }
        else if (i > 0 && i < NB - 1) bx += shiver * (1 - Math.abs(i - 2) * 0.25);
        cv.line(ax[i], barY / aspect, bx, (by - r * 0.9) / aspect, th.dim);
        cv.circle(bx, by / aspect, r, moving ? th.accent : restBall, true);
        cv.set(bx - r * 0.35, (by - r * 0.35) / aspect, spec);
        cv.line(bx - r * 0.7, (floorY - 0.5) / aspect, bx + r * 0.7, (floorY - 0.5) / aspect, fadeMark(th, th.muted, 0.35));
      }
      const sL = p - q, sR = p - 3 * q;
      for (const [s, side] of [[sL, 0], [sR, 1]]) {
        if (s >= 0 && s < 0.14) {
          const ix = side === 0 ? ax[0] + r : ax[NB - 1] - r;
          cv.circle(ix, restY / aspect, 1 + s * 16, fadeMark(th, th.accent2, 1 - s * 6));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};

export default [cloth, blob, dominoes, slingshot, cradle];
