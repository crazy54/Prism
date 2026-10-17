// Boids: Reynolds flocking — separation, alignment, cohesion — plus soft
// walls and a wandering predator that hunts the flock's center while every
// boid within sight scatters. Boids are little oriented arrowheads colored by
// heading, dragging short fading wakes; the predator is larger and red.
import { NONE } from '../../color.js';
import { fadeMark } from '../../palettes.js';

export default {
  title: 'Boids',
  gallery: 'sim',
  category: 'Life & Flocking',
  kind: 'scene',
  tags: ['boids', 'flocking', 'birds', 'predator'],
  order: 30,
  description: 'Reynolds flocking (separation, alignment, cohesion) with a hunting predator — oriented arrowheads with fading wakes.',
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const trail = ctx.canvas();
    const view = ctx.canvas();
    const { width: W, height: H, aspect } = view;
    const rand = ctx.rng;
    const pal = ctx.palette();
    const th = ctx.theme;
    const speedK = ctx.param('speed', 1);
    const Hv = H * aspect;
    const S = Math.min(W, Hv);
    const N = Math.max(24, Math.min(240, Math.round((ctx.width * ctx.height) / 14)));
    const maxV = S * 0.34 * speedK, minV = maxV * 0.45;
    const rN = S * 0.11, rS = rN * 0.55, rP = S * 0.24, margin = S * 0.08;
    const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      X[i] = W * (0.2 + rand() * 0.6); Y[i] = Hv * (0.2 + rand() * 0.6);
      const a = rand() * Math.PI * 2;
      VX[i] = Math.cos(a) * maxV * 0.7; VY[i] = Math.sin(a) * maxV * 0.7;
    }
    const pred = { x: W * 0.1, y: Hv * 0.5, vx: maxV * 0.6, vy: 0 };
    const size = view.mode === 'braille' ? 3.4 : view.mode === 'ascii' || view.mode === 'half' ? 1.6 : 2.6;
    const bg = ctx.bg === NONE ? 0 : ctx.bg;
    const bgR = (bg >> 16) & 255, bgG = (bg >> 8) & 255, bgB = bg & 255;
    const tp = trail.px;
    const fadeTrail = (k) => {
      for (let i = 0; i < tp.length; i++) {
        const c = tp[i];
        if (c === NONE) continue;
        const r = bgR + (((c >> 16) & 255) - bgR) * k, g = bgG + (((c >> 8) & 255) - bgG) * k, b = bgB + ((c & 255) - bgB) * k;
        tp[i] = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < 14 ? NONE : (r << 16) | (g << 8) | (b | 0);
      }
    };
    const arrow = (x, y, vx, vy, len, c) => {
      const v = Math.hypot(vx, vy) || 1, dx = vx / v, dy = vy / v;
      const nose = [x + dx * len, (y + dy * len) / aspect];
      const l = [x - dx * len * 0.6 - dy * len * 0.55, (y - dy * len * 0.6 + dx * len * 0.55) / aspect];
      const r = [x - dx * len * 0.6 + dy * len * 0.55, (y - dy * len * 0.6 - dx * len * 0.55) / aspect];
      const tail = [x - dx * len * 0.25, (y - dy * len * 0.25) / aspect];
      view.polygon([nose, l, tail, r], c);
      view.line(nose[0], nose[1], tail[0], tail[1], c);
    };
    const steer = (vx, vy, tx, ty, w) => [vx + tx * w, vy + ty * w];

    return (t, dt) => {
      fadeTrail(Math.exp(-dt * 3.2));
      // Predator: drift toward the flock's centroid with a noisy wander.
      let mx = 0, my = 0;
      for (let i = 0; i < N; i++) { mx += X[i]; my += Y[i]; }
      mx /= N; my /= N;
      const wa = ctx.noise.noise2(t * 0.25, 3.7) * Math.PI * 2;
      let pax = (mx - pred.x) * 0.9 + Math.cos(wa) * S * 0.6, pay = (my - pred.y) * 0.9 + Math.sin(wa) * S * 0.6;
      pred.vx += pax * dt; pred.vy += pay * dt;
      const pv = Math.hypot(pred.vx, pred.vy), pmax = maxV * 0.82;
      if (pv > pmax) { pred.vx *= pmax / pv; pred.vy *= pmax / pv; }
      const pox = pred.x, poy = pred.y;
      pred.x += pred.vx * dt; pred.y += pred.vy * dt;
      pred.x = Math.min(W - 1, Math.max(0, pred.x)); pred.y = Math.min(Hv - 1, Math.max(0, pred.y));
      if (pred.x <= 0 || pred.x >= W - 1) pred.vx *= -1;
      if (pred.y <= 0 || pred.y >= Hv - 1) pred.vy *= -1;

      for (let i = 0; i < N; i++) {
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
        const xi = X[i], yi = Y[i];
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const dx = X[j] - xi, dy = Y[j] - yi;
          const d2 = dx * dx + dy * dy;
          if (d2 > rN * rN) continue;
          n++;
          ax += VX[j]; ay += VY[j]; cx += X[j]; cy += Y[j];
          if (d2 < rS * rS) { const d = Math.sqrt(d2) || 0.01; sx -= dx / d * (rS - d); sy -= dy / d * (rS - d); }
        }
        let vx = VX[i], vy = VY[i];
        if (n) {
          [vx, vy] = steer(vx, vy, ax / n - vx, ay / n - vy, 1.1 * dt);
          [vx, vy] = steer(vx, vy, cx / n - xi, cy / n - yi, 0.55 * dt);
        }
        [vx, vy] = steer(vx, vy, sx, sy, 7 * dt);
        const pdx = xi - pred.x, pdy = yi - pred.y, pd = Math.hypot(pdx, pdy);
        if (pd < rP) [vx, vy] = steer(vx, vy, (pdx / (pd || 1)) * maxV, (pdy / (pd || 1)) * maxV, 4 * (1 - pd / rP) * dt);
        // Soft walls.
        if (xi < margin) vx += maxV * 2.5 * dt; else if (xi > W - margin) vx -= maxV * 2.5 * dt;
        if (yi < margin) vy += maxV * 2.5 * dt; else if (yi > Hv - margin) vy -= maxV * 2.5 * dt;
        const v = Math.hypot(vx, vy) || 1;
        const cl = v > maxV ? maxV / v : v < minV ? minV / v : 1;
        VX[i] = vx * cl; VY[i] = vy * cl;
      }

      view.clear();
      for (let i = 0; i < N; i++) {
        const ox = X[i], oy = Y[i];
        X[i] = Math.min(W - 0.5, Math.max(0, X[i] + VX[i] * dt));
        Y[i] = Math.min(Hv - 0.5, Math.max(0, Y[i] + VY[i] * dt));
        const hue = Math.atan2(VY[i], VX[i]) / (Math.PI * 2) + 0.5;
        trail.line(ox, oy / aspect, X[i], Y[i] / aspect, fadeMark(th, pal(hue), 0.45));
      }
      trail.line(pox, poy / aspect, pred.x, pred.y / aspect, fadeMark(th, th.neg, 0.6));
      view.px.set(tp);
      for (let i = 0; i < N; i++) arrow(X[i], Y[i], VX[i], VY[i], size, pal(Math.atan2(VY[i], VX[i]) / (Math.PI * 2) + 0.5));
      arrow(pred.x, pred.y, pred.vx, pred.vy, size * 2.1, th.neg);
      view.paint(ctx.buffer);
    };
  },
};
