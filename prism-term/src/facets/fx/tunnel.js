// Demoscene tunnel: an angle/depth lookup table over a 2× oversized window, so
// the camera can wobble by sliding the viewport. Checkered walls stream toward
// the viewer through a cycling palette; neon ribs are anti-aliased to a constant
// pixel width (their world-space width is derived per pixel from the LUT).
export default {
  title: 'Tunnel',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['tunnel', 'demoscene', 'texture', 'lut'],
  order: 30,
  description: 'Textured demoscene tunnel — precomputed angle/depth LUT, neon ribs, palette cycling and camera wobble.',
  canvas: 'field',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const segs = 8;
    const { width: W, height: H, px, aspect } = cv;
    const LW = W * 2, LH = H * 2;
    const ang = new Float32Array(LW * LH), dep = new Float32Array(LW * LH);
    const fog = new Float32Array(LW * LH), wu = new Float32Array(LW * LH), wv = new Float32Array(LW * LH);
    const R = Math.min(W, H * aspect) * 0.5;
    const lineW = Math.max(0.7, R / 40); // rib half-width in pixels
    for (let y = 0, i = 0; y < LH; y++) {
      const dy = (y - LH / 2 + 0.5) * aspect;
      for (let x = 0; x < LW; x++, i++) {
        const dx = x - LW / 2 + 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) + 0.0001;
        ang[i] = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
        dep[i] = (R * 0.8) / r;
        // Pixels per texture unit: depth changes as R·0.8/r², angle as 2πr/segs.
        wv[i] = lineW / Math.max(1e-4, (r * r) / (R * 0.8));
        wu[i] = lineW / ((2 * Math.PI * r) / segs);
        const f = Math.min(1, r / (R * 1.1));
        fog[i] = f * f * (3 - 2 * f);
      }
    }
    const bg = ctx.theme.bg;
    const br = (bg >> 16) & 255, bgc = (bg >> 8) & 255, bb = bg & 255;

    return (t) => {
      const tt = t * speed;
      const ox = Math.floor(W / 2 + Math.sin(tt * 0.61) * W * 0.16);
      const oy = Math.floor(H / 2 + Math.sin(tt * 0.47 + 1) * H * 0.14);
      const twist = tt * 0.06, move = tt * 1.6;
      for (let y = 0, i = 0; y < H; y++) {
        let j = (y + oy) * LW + ox;
        for (let x = 0; x < W; x++, i++, j++) {
          const d = dep[j];
          const u = ang[j] * segs + twist + d * 0.12;
          const v = d + move;
          const fu = u - Math.floor(u), fv = v - Math.floor(v);
          const check = ((Math.floor(u * 2) + Math.floor(v * 2)) & 1) ? 0.16 : 0.34;
          const eu = Math.min(fu, 1 - fu) / wu[j], ev = Math.min(fv, 1 - fv) / wv[j];
          const rib = Math.max(0, 1 - Math.min(eu, ev));
          const c = pal(v * 0.11 - tt * 0.04);
          const f = fog[j];
          const k = f * (check + rib * 0.95);
          const hot = rib * rib * f * 120; // white-hot core on the ribs
          const r = ((c >> 16) & 255) * k + br * (1 - f) + hot;
          const g = ((c >> 8) & 255) * k + bgc * (1 - f) + hot;
          const b = (c & 255) * k + bb * (1 - f) + hot;
          px[i] = ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b | 0);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
