// Brian's Brain: a three-state automaton (ready → firing → refractory → ready)
// where a ready cell fires when exactly two neighbors are firing. Almost any
// seed boils into a sea of colliding "spaceships". Firing cells burn white-hot,
// refractory cells glow in the accent, and a short afterglow traces where the
// ships have been. Re-seeds itself if activity ever dies down.
import { NONE, mix } from '../../color.js';
import { fadeMark } from '../../palettes.js';

export default {
  title: "Brian's Brain",
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['brians brain', 'cellular automata', 'three-state', 'spaceships', 'chaos'],
  order: 40,
  description: "Brian's Brain: a three-state automaton where nearly any seed boils into colliding spaceships with glowing wakes.",
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: 10,
  canvas: 'field',
  palette: 'theme',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, px = cv.px, th = ctx.theme, rand = ctx.rng;
    const gps = 12 * ctx.param('speed', 1);
    const N = W * H;
    let cur = new Uint8Array(N), nxt = new Uint8Array(N); // 0 ready, 1 firing, 2 refractory
    const glow = new Float32Array(N);
    const xm = new Int32Array(W), xp = new Int32Array(W);
    for (let x = 0; x < W; x++) { xm[x] = (x - 1 + W) % W; xp[x] = (x + 1) % W; }
    const seed = () => {
      // A few dense blobs rather than uniform noise: they burst outward as ship swarms.
      for (let k = 0; k < 3 + Math.floor(rand() * 3); k++) {
        const cx = rand() * W, cy = rand() * H, r = Math.max(3, Math.min(W, H) * (0.12 + rand() * 0.1));
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (Math.hypot(x - cx, y - cy) > r || rand() > 0.35) continue;
          cur[(((y % H) + H) % H) * W + (((x % W) + W) % W)] = 1;
        }
      }
    };
    seed();
    // Firing cells are the hottest ink: white light at Night, deep ink by Day.
    const fire = th.mode === 'light' ? mix(th.ink, th.info, 0.3) : mix(0xffffff, th.info, 0.15);
    const refr = mix(th.bg, th.accent, 0.75), trail = th.info;
    let acc = 0;
    const step = () => {
      let live = 0;
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = r1 + x, s = cur[i];
          if (s === 1) { nxt[i] = 2; continue; }
          if (s === 2) { nxt[i] = 0; continue; }
          const a = xm[x], b = xp[x];
          const n = (cur[r0 + a] === 1) + (cur[r0 + x] === 1) + (cur[r0 + b] === 1) + (cur[r1 + a] === 1) + (cur[r1 + b] === 1) + (cur[r2 + a] === 1) + (cur[r2 + x] === 1) + (cur[r2 + b] === 1);
          if (n === 2) { nxt[i] = 1; live++; } else nxt[i] = 0;
        }
      }
      [cur, nxt] = [nxt, cur];
      for (let i = 0; i < N; i++) glow[i] = cur[i] === 1 ? 1 : glow[i] * 0.72;
      if (live < N * 0.004) seed();
    };

    return (t, dt) => {
      acc += Math.min(0.25, Math.max(0, dt)) * gps;
      for (let k = 0; acc >= 1 && k < 6; k++, acc--) step();
      if (acc > 6) acc = 0;
      for (let i = 0; i < N; i++) {
        const s = cur[i];
        if (s === 1) px[i] = fire;
        else if (s === 2) px[i] = refr;
        else px[i] = glow[i] > 0.06 ? fadeMark(th, trail, glow[i] * 0.45) : NONE;
      }
      cv.paint(ctx.buffer);
    };
  },
};
