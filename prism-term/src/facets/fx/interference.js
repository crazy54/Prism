// Ripple-tank interference: three point sources on slow Lissajous orbits, each
// sending out concentric waves. Where crests meet they reinforce, where crest
// meets trough they cancel — the moiré of nodal lines sweeps as sources move.
import { lerpc } from '../retro/_kit.js';

export default {
  title: 'Interference',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['interference', 'waves', 'moire', 'ripple tank', 'physics', 'rings'],
  order: 60,
  description: 'A ripple tank: three orbiting sources whose concentric waves reinforce and cancel into sweeping moiré nodal lines.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: 20,
  canvas: 'field',
  palette: 'ocean',
  params: {
    sources: { default: 3, min: 2, max: 5, label: 'Sources' },
    wavelength: { default: 1, min: 0.4, max: 3, label: 'Wavelength' },
  },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 512 });
    const { width: W, height: H, px, aspect } = cv;
    const n = Math.max(2, Math.min(5, Math.round(ctx.param('sources', 3))));
    const S = Math.min(W, H * aspect);
    const k = (Math.PI * 2) / (Math.max(5, S * 0.17) * ctx.param('wavelength', 1));
    const src = Array.from({ length: n }, (_, i) => ({ a: 1 + (i % 3), b: 2 + ((i + 1) % 2), ph: i * 2.1, r: 0.22 + 0.06 * i }));
    const pos = new Float32Array(n * 2);
    const omega = (Math.PI * 2) / 1.25;   // a crest every 1.25 s
    // Night: crests glow out of shadowed nodal lines. Day: the nodes are the page and
    // the waves are drawn in the palette's ink range (no washed-out whites).
    const day = ctx.theme.mode === 'light';
    const node = day ? ctx.theme.bg : lerpc(ctx.theme.bg, pal(0), 0.5);
    const spot = day ? ctx.theme.accent : 0xffffff;
    return (t) => {
      const u = (t / 20) * Math.PI * 2;
      src.forEach((s, i) => {
        pos[i * 2] = W / 2 + Math.sin(u * s.a + s.ph) * W * s.r * 1.2;
        pos[i * 2 + 1] = (H * aspect) / 2 + Math.cos(u * s.b + s.ph * 0.7) * H * aspect * s.r;
      });
      const wt = omega * t;
      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y + 0.5) * aspect;
        for (let x = 0; x < W; x++, i++) {
          let v = 0;
          for (let j = 0; j < n; j++) {
            const dx = x + 0.5 - pos[j * 2], dy = vy - pos[j * 2 + 1];
            const d = Math.sqrt(dx * dx + dy * dy);
            v += Math.sin(d * k - wt) / (1 + d * 0.012);
          }
          v /= n;
          // Amplitude picks the color; near-zero (the nodal lines) falls into shadow.
          const a = Math.abs(v);
          px[i] = lerpc(node, pal(day ? 0.45 + v * 0.3 : 0.5 + v * 0.55), Math.min(1, a * 2.4));
        }
      }
      // Bright dots at the sources themselves.
      for (let j = 0; j < n; j++) cv.set(pos[j * 2], pos[j * 2 + 1] / aspect, spot);
      cv.paint(ctx.buffer);
    };
  },
};
