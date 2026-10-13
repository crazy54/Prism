// donut.c, done properly: a torus splatted into a z-buffer at a density matched
// to the canvas resolution (surface points, normals and materials precomputed
// once; one 3×3 matrix per frame), Lambert + Blinn-Phong lit, hole-filled, and
// dressed in glossy frosting with a wavy drip edge and sprinkles. It spins on
// its axis, wobbles, and flips over every few seconds. `--set style=solid`
// renders a theme-lit ring instead.
export default {
  title: 'Donut',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['donut', 'torus', 'donut.c', '3d', 'lighting'],
  order: 10,
  description: 'The donut.c torus, z-buffered and properly lit — frosted with sprinkles, or --set style=solid.',
  canvas: 'hires',
  palette: 'candy',
  setup(ctx) {
    const cv = ctx.canvas(undefined, { dither: true });
    const solid = ctx.param('style', ctx.params.palette ? 'solid' : 'frosted') === 'solid';
    const sprinkleColors = ctx.palette('candy');
    const ramp = ctx.params.palette
      ? ctx.palette()
      : ctx.palette([0x05060a, ctx.theme.accent, ctx.theme.info, 0xffffff]);
    const frost = ctx.param('frosting', '#ff6fae');
    const frostC = typeof frost === 'string' ? parseInt(frost.replace('#', ''), 16) : frost;
    const flipEvery = ctx.param('flip', 9);
    const { width: W, height: H, px, aspect } = cv;
    const zbuf = new Float32Array(W * H);
    const R = 1, r = 0.46, dist = 5;
    const scale = Math.min(W, H * aspect) * 0.29 * dist;
    const kmax = scale / (dist - (R + r));
    const nP = Math.ceil(2 * Math.PI * (R + r) * kmax * 1.05);
    const nT = Math.ceil(2 * Math.PI * r * kmax * 1.1);
    const N = nP * nT;

    // Surface samples: position, normal, material (0 dough, 1 frosting, 2+ sprinkle).
    const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), mat = new Uint8Array(N), tone = new Float32Array(N);
    const sprink = [];
    const rand = ctx.rng;
    for (let k = 0; k < 14; k++) sprink.push(sprinkleColors(k / 14));
    const cellsP = 46, cellsT = 12, seeds = [];
    for (let a = 0; a < cellsT * cellsP; a++) seeds.push(rand() < 0.62 ? { u: rand(), v: rand(), ang: rand() * Math.PI, c: 2 + Math.floor(rand() * 14) } : null);
    for (let i = 0, n = 0; i < nT; i++) {
      const th = (i / nT) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      for (let j = 0; j < nP; j++, n++) {
        const ph = (j / nP) * Math.PI * 2, cp = Math.cos(ph), sp = Math.sin(ph);
        const ring = R + r * ct;
        P[n * 3] = ring * cp; P[n * 3 + 1] = r * st; P[n * 3 + 2] = ring * sp;
        Nn[n * 3] = ct * cp; Nn[n * 3 + 1] = st; Nn[n * 3 + 2] = ct * sp;
        tone[n] = 0.5 + 0.5 * st;
        if (solid) continue;
        const edge = 0.18 + 0.13 * Math.sin(ph * 9 + Math.sin(ph * 4) * 2) + 0.06 * Math.sin(ph * 23);
        if (st > edge) continue; // dough (underside)
        let m = 1;
        // Sprinkles: one jittered sugar strand per parameter-space cell.
        const fu = (ph / (Math.PI * 2)) * cellsP, fv = (th / (Math.PI * 2)) * cellsT;
        const cu = Math.floor(fu), cvv = Math.floor(fv);
        const s = seeds[cvv * cellsP + cu];
        if (s && st < edge - 0.12) {
          const du = (fu - cu - (0.25 + s.u * 0.5)) * 1.6, dv = (fv - cvv - (0.25 + s.v * 0.5)) * 3.2;
          const along = du * Math.cos(s.ang) + dv * Math.sin(s.ang), across = -du * Math.sin(s.ang) + dv * Math.cos(s.ang);
          if (Math.abs(along) < 0.36 && Math.abs(across) < 0.09) m = s.c;
        }
        mat[n] = m;
      }
    }

    // Light from upper-left-front (screen y grows downward, camera looks along +z).
    const L = [-0.45, -0.7, -0.55], ll = Math.hypot(...L);
    const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
    const hl = Math.hypot(lx, ly, lz - 1);
    const hx = lx / hl, hy = ly / hl, hz = (lz - 1) / hl;
    const back = new Int32Array(W * H);
    const plainBg = cv.mode === 'ascii' || cv.mode === 'braille';
    const glow = ctx.theme.panel, base = ctx.bg === -1 ? 0 : ctx.bg;
    for (let y = 0, i = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        const dx = (x - W / 2) / W, dy = ((y - H / 2) * aspect) / W;
        const k = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.6);
        back[i] = plainBg ? -1 : mixc(base, glow, k * k);
      }
    const smooth = (u) => u * u * (3 - 2 * u);

    return (t) => {
      // Spin about its own axis, present the frosted top tilted toward us, roll gently,
      // and every `flipEvery` seconds do a full somersault.
      const spin = t * 0.8;
      const fp = flipEvery > 0 ? (t % flipEvery) / flipEvery : 0;
      const flip = fp > 0.8 ? smooth((fp - 0.8) / 0.2) * Math.PI * 2 : 0;
      const tilt = 1.0 + Math.sin(t * 0.6) * 0.35 + flip, roll = Math.sin(t * 0.37) * 0.45;
      const cs = Math.cos(spin), ss = Math.sin(spin), ca = Math.cos(tilt), sa = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
      // M = Rz(roll) · Rx(tilt) · Ry(spin)
      const b10 = sa * ss, b11 = ca, b12 = -sa * cs;   // row 1 of Rx·Ry (row 0 is [cs, 0, ss])
      const b20 = -ca * ss, b21 = sa, b22 = ca * cs;   // row 2
      const M00 = cr * cs - sr * b10, M01 = -sr * b11, M02 = cr * ss - sr * b12;
      const M10 = sr * cs + cr * b10, M11 = cr * b11, M12 = sr * ss + cr * b12;
      const M20 = b20, M21 = b21, M22 = b22;

      px.set(back);
      zbuf.fill(0);
      const ox = W / 2, oy = H / 2;
      for (let n = 0, q = 0; n < N; n++, q += 3) {
        const nx0 = Nn[q], ny0 = Nn[q + 1], nz0 = Nn[q + 2];
        const nx = M00 * nx0 + M01 * ny0 + M02 * nz0;
        const ny = M10 * nx0 + M11 * ny0 + M12 * nz0;
        const nz = M20 * nx0 + M21 * ny0 + M22 * nz0;
        if (nz > 0.42) continue; // back-facing even at the widest view angle — skip before transforming the point
        const x0 = P[q], y0 = P[q + 1], z0 = P[q + 2];
        const x = M00 * x0 + M01 * y0 + M02 * z0;
        const y = M10 * x0 + M11 * y0 + M12 * z0;
        const d = M20 * x0 + M21 * y0 + M22 * z0 + dist;
        if (nx * x + ny * y + nz * d >= 0) continue;
        const iz = 1 / d, k = scale * iz;
        const sx = (ox + x * k) | 0, sy = (oy + (y * k) / aspect) | 0;
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const p = sy * W + sx;
        if (iz <= zbuf[p]) continue;
        zbuf[p] = iz;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        const sd = Math.max(0, nx * hx + ny * hy + nz * hz);
        if (solid) {
          const s2 = sd * sd, s4 = s2 * s2, s8 = s4 * s4, s32 = s8 * s8 * s8 * s8;
          px[p] = ramp(Math.min(1, 0.12 + diff * 0.72 + s32 * 0.5));
          continue;
        }
        const m = mat[n];
        let rr, gg, bb, gloss;
        if (m === 0) {
          const tn = tone[n];
          rr = 196 + 40 * tn; gg = 120 + 52 * tn; bb = 58 + 40 * tn;
          const s2 = sd * sd, s4 = s2 * s2;
          gloss = s4 * s4 * s4 * 0.12;
        } else {
          const c = m === 1 ? frostC : sprink[m - 2];
          rr = (c >> 16) & 255; gg = (c >> 8) & 255; bb = c & 255;
          const s2 = sd * sd, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8;
          gloss = s16 * s16 * s16 * 0.85;
        }
        const lit = 0.24 + diff * 0.86, g255 = gloss * 255;
        rr = rr * lit + g255; gg = gg * lit + g255; bb = bb * lit + g255;
        px[p] = ((rr > 255 ? 255 : rr) << 16) | ((gg > 255 ? 255 : gg) << 8) | (bb > 255 ? 255 : bb | 0);
      }
      // Fill single-pixel splat gaps: an empty pixel flanked by surface on both sides.
      for (let y = 1; y < H - 1; y++)
        for (let x = 1, p = y * W + 1; x < W - 1; x++, p++) {
          if (zbuf[p] !== 0) continue;
          if (zbuf[p - 1] && zbuf[p + 1]) { px[p] = zbuf[p - 1] > zbuf[p + 1] ? px[p - 1] : px[p + 1]; zbuf[p] = zbuf[p - 1]; }
          else if (zbuf[p - W] && zbuf[p + W]) { px[p] = px[p - W]; zbuf[p] = zbuf[p - W]; }
        }
      cv.paint(ctx.buffer);
    };
  },
};

function mixc(a, b, t) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | (bl | 0);
}
