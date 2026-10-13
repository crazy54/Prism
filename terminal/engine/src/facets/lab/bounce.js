// The animator's bouncing-ball exercise: a ball thrown across the stage,
// losing a little height each bounce (restitution 0.7), stretching along its
// speed in the air and squashing on every impact — with an onion skin of where
// it was every tenth of a second, so the arcs and the spacing read at a glance.
import { mix } from '../../color.js';
import { put } from './_lab.js';

const RUN = 4.2, HZ = 240, E = 0.7;

export default {
  id: 'lab-bounce',
  title: 'Bounce, Squash & Stretch',
  gallery: 'lab',
  category: 'Springs & Physics',
  kind: 'scene',
  tags: ['bounce', 'squash and stretch', 'onion skin', 'arcs', 'spacing', 'animation principles'],
  order: 20,
  description: 'The bouncing-ball exercise: decaying bounces, stretch in flight, squash on impact and an onion skin of its spacing.',
  size: { w: 64, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: RUN,
  canvas: 'field',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const label = ctx.height >= 10;
    const cv = ctx.canvas('field', { rows: label ? ctx.height - 1 : ctx.height });
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, pal = ctx.palette();
    const HP = H * asp, R = Math.max(1.5, Math.min(W, HP) * 0.075), floor = HP - 2;
    const G = HP * 3.2, ball = pal(0.02);
    let s, run = -1, acc = 0, rec = 0, squash = 0;
    const ghosts = [];
    const reset = () => { s = { x: R * 1.5, y: floor - HP * 0.82, vx: (W - R * 3) / (RUN * 0.92), vy: 0 }; ghosts.length = 0; squash = 0; };
    return (t, dt) => {
      const r = Math.floor(t / RUN);
      if (r !== run) { run = r; reset(); acc = 0; }
      acc += Math.min(0.25, Math.max(0, dt)) * HZ;
      for (; acc >= 1; acc--) {
        s.vy += G / HZ; s.x += s.vx / HZ; s.y += s.vy / HZ;
        if (s.y > floor - R && s.vy > 0) {
          squash = Math.min(0.5, s.vy / (HP * 6)); // harder hits squash more
          s.y = floor - R; s.vy = -s.vy * E;
          if (Math.abs(s.vy) < HP * 0.25) s.vy = 0;
        }
        squash *= Math.pow(0.0005, 1 / HZ);
        if (s.x > W - R) { s.x = W - R; s.vx = 0; }
        if (++rec % (HZ / 10) === 0) { ghosts.push([s.x, s.y]); if (ghosts.length > 14) ghosts.shift(); }
      }
      cv.clear();
      for (let x = 0; x < W; x++) cv.set(x, Math.floor(floor / asp) + 1, mix(th.bg, th.line, 0.9));
      ghosts.forEach(([gx, gy], i) => {
        const k = (i + 1) / ghosts.length;
        cv.ellipse(gx, gy / asp, Math.max(0.6, R * 0.22), Math.max(0.6, R * 0.22) / asp, mix(th.bg, th.muted, 0.35 + 0.5 * k), true);
      });
      // Shadow, tighter as the ball nears the floor.
      const hgt = Math.max(0, (floor - R - s.y) / HP), sw = R * (1 + hgt);
      for (let x = Math.floor(s.x - sw); x <= s.x + sw; x++) {
        const f = 1 - Math.abs(x + 0.5 - s.x) / sw;
        if (f > 0) cv.set(x, Math.floor(floor / asp), mix(th.bg, 0x000000, 0.45 * f * (1 - Math.min(0.8, hgt))));
      }
      // Stretch with vertical speed in the air, squash after an impact (volume kept).
      const speed = Math.abs(s.vy) / (HP * 4);
      const sy = squash > 0.02 ? 1 - squash : 1 + Math.min(0.35, speed * 0.6), sx = 1 / sy;
      const rx = R * sx, ry = R * sy, cy = squash > 0.02 ? floor - ry : s.y;
      for (let y = Math.floor((cy - ry) / asp) - 1; y <= (cy + ry) / asp + 1; y++) for (let x = Math.floor(s.x - rx) - 1; x <= s.x + rx + 1; x++) {
        const nx = (x + 0.5 - s.x) / rx, ny = ((y + 0.5) * asp - cy) / ry, q = nx * nx + ny * ny;
        if (q > 1) continue;
        const lit = Math.max(0, 0.55 - nx * 0.35 - ny * 0.45 + 0.3 * Math.sqrt(1 - q));
        cv.set(x, y, mix(mix(0x000000, ball, 0.35 + 0.65 * Math.min(1, lit)), 0xffffff, Math.max(0, lit - 0.85)));
      }
      cv.paint(ctx.buffer);
      if (label) put(ctx.buffer, 1, ctx.height - 1, 'squash & stretch · restitution 0.7 · onion skin every 0.1 s', th.muted, undefined, undefined, ctx.width - 2);
    };
  },
};
