// Classic demoscene plasma: four interfering sine fields, palette-cycled.
export default {
  title: 'Plasma',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['plasma', 'demoscene', 'sine', 'palette'],
  order: 10,
  description: 'Four interfering sine fields cycling through an Oklab palette — the demoscene classic.',
  canvas: 'field',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px, aspect } = cv;
    const k = 16 / Math.max(W, H * aspect);
    return (t) => {
      const tt = t * speed;
      const cx = Math.sin(tt * 0.3) * W * 0.3, cy = Math.cos(tt * 0.23) * H * 0.3;
      for (let y = 0, i = 0; y < H; y++) {
        const fy = y * aspect * k;
        for (let x = 0; x < W; x++, i++) {
          const fx = x * k;
          const dx = (x - W / 2 - cx) * k, dy = (y - H / 2 - cy) * aspect * k;
          const v = Math.sin(fx + tt) + Math.sin(fy * 0.8 + tt * 1.3)
            + Math.sin((fx + fy) * 0.6 + tt * 0.7) + Math.sin(Math.sqrt(dx * dx + dy * dy) * 1.6 - tt * 1.9);
          px[i] = pal(v * 0.125 + 0.5 + tt * 0.05);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
