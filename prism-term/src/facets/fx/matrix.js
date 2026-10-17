// Digital rain with real glyphs: halfwidth katakana, digits and symbols fall
// in per-column streams. Every lit cell decays at its stream's own rate, so
// trail lengths vary; heads burn white, glyphs mutate as they fade, and dimmer
// slow columns read as a second, more distant layer.
const KATAKANA = Array.from({ length: 0xff9d - 0xff66 + 1 }, (_, i) => String.fromCodePoint(0xff66 + i));
const UNICODE_GLYPHS = [...KATAKANA, ...'0123456789', ...'=+-*<>:."|¦_'];
const ASCII_GLYPHS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=-<>?'];

export default {
  title: 'Digital Rain',
  gallery: 'fx',
  category: 'Glitch & Noise',
  kind: 'scene',
  tags: ['matrix', 'digital rain', 'katakana', 'hacker'],
  order: 20,
  description: 'Matrix digital rain in real halfwidth katakana — white-hot heads, per-column speeds and trail lengths, mutating glyphs.',
  canvas: 'ascii',
  palette: 'matrix',
  setup(ctx) {
    const W = ctx.width, H = ctx.height;
    const rand = ctx.rng;
    const pal = ctx.palette();
    const speedK = ctx.param('speed', 1);
    const glyphs = ctx.caps.unicode === false || ctx.mode === 'ascii' ? ASCII_GLYPHS : UNICODE_GLYPHS;
    const pick = () => glyphs[Math.floor(rand() * glyphs.length)];
    const N = W * H;
    const I = new Float32Array(N); // intensity 0..1
    const R = new Float32Array(N); // decay rate (1/s) of the stream that last lit the cell
    const G = new Array(N);
    for (let i = 0; i < N; i++) G[i] = pick();
    const head = new Uint8Array(N);
    // Column depth: a dim, slow back layer and a bright, fast front layer.
    const depth = new Float32Array(W);
    for (let x = 0; x < W; x++) depth[x] = rand() < 0.35 ? 0.35 + rand() * 0.25 : 0.75 + rand() * 0.25;

    const D = W + Math.ceil(W * 0.4 * Math.min(1, H / 30));
    const dc = new Int32Array(D), dy = new Float32Array(D), dv = new Float32Array(D), dl = new Float32Array(D);
    const respawn = (d, initial) => {
      dc[d] = d < W ? d : Math.floor(rand() * W);
      const z = depth[dc[d]];
      dv[d] = (5 + rand() * 18) * (0.45 + z * 0.75);
      dl[d] = 5 + rand() * Math.max(6, H * 0.9);
      dy[d] = initial ? rand() * H * 1.4 - H * 0.4 : -rand() * H * 0.6;
    };
    for (let d = 0; d < D; d++) respawn(d, true);

    let mutateAcc = 0;
    return (t, dt) => {
      // Decay every lit cell at its stream's rate.
      for (let i = 0; i < N; i++) {
        head[i] = 0;
        if (I[i] > 0) { I[i] *= Math.exp(-R[i] * dt); if (I[i] < 0.02) I[i] = 0; }
      }
      // Advance drops, lighting every cell the head passed this frame.
      for (let d = 0; d < D; d++) {
        const x = dc[d], v = dv[d] * speedK;
        const y0 = Math.floor(dy[d]);
        dy[d] += v * dt;
        const y1 = Math.floor(dy[d]);
        const rate = (Math.log(40) * v) / dl[d];
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          const i = y * W + x;
          I[i] = 1; R[i] = rate;
          if (y !== y0) G[i] = pick();
        }
        if (y1 >= 0 && y1 < H) head[y1 * W + x] = 1;
        if (dy[d] - dl[d] > H) respawn(d, false);
      }
      // Glyph mutation: a few percent of lit cells flicker to new symbols per second.
      mutateAcc += N * 0.05 * dt;
      while (mutateAcc >= 1) { mutateAcc--; const i = Math.floor(rand() * N); if (I[i] > 0) G[i] = pick(); }

      const buf = ctx.buffer;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const v = I[i];
          if (v <= 0) continue;
          if (head[i]) buf.set(x, y, G[i], pal(1), undefined, depth[x] > 0.7 ? 1 : 0);
          else buf.set(x, y, G[i], pal(0.12 + 0.82 * Math.pow(v, 0.65) * depth[x]));
        }
      }
    };
  },
};
