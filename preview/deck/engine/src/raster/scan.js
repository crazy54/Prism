// Scan conversion with anti-aliasing.
//
// Each pixel row is sampled by SUB horizontal sub-scanlines; on each one the
// crossings of every active edge are found, sorted, and walked with the fill
// rule (nonzero / evenodd). Inside spans add EXACT horizontal area coverage
// (fractional end pixels + a difference array for the interior run), so
// coverage is analytic along x and SUB-level along y. One fill call takes every
// contour of a shape (or every piece of a stroke) at once, so there are no
// seams between pieces and overlaps resolve through the winding rule.
//
//   const f = new Filler(W, H);
//   f.begin(); f.contour(flatDevicePts) …; f.fill(evenOdd, bounds, sink)
//   sink(y, x0, x1, cov)  — cov[x] for x0 ≤ x < x1 is the coverage 0–1 of pixel (x, y)

export const SUB = 16;

export class Filler {
  constructor(W, H, sub = SUB) {
    this.W = W; this.H = H; this.sub = sub;
    this.cov = new Float32Array(W + 2);
    this.diff = new Float32Array(W + 2);
    this.cap = 0;
    this.grow(512);
    this.xs = new Float64Array(64);
    this.active = new Int32Array(64);
    this.n = 0;
  }

  grow(n) {
    const keep = this.n || 0;
    const re = (A, old) => { const a = new A(n); if (old) a.set(old.subarray(0, keep)); return a; };
    this.top = re(Float64Array, this.top); this.bot = re(Float64Array, this.bot);
    this.x0 = re(Float64Array, this.x0); this.slope = re(Float64Array, this.slope);
    this.dir = re(Int8Array, this.dir);
    this.order = new Uint32Array(n);
    this.cap = n;
  }

  begin() { this.n = 0; this.contours = 0; this.rect = null; this.minX = Infinity; this.minY = Infinity; this.maxX = -Infinity; this.maxY = -Infinity; }

  /** Add one closed contour (flat [x0, y0, x1, y1, …] in device px; closing edge implied). */
  contour(p, len = p.length) {
    if (len < 6) return;
    if (this.n + len / 2 > this.cap) this.grow(Math.max(this.cap * 2, this.n + len));
    // a lone axis-aligned rectangle gets exact analytic coverage (and skips the scan loop)
    if (++this.contours === 1 && len === 8) {
      let ok = true;
      for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8; if (p[i] !== p[j] && p[i + 1] !== p[j + 1]) { ok = false; break; } }
      const r = [Math.min(p[0], p[4]), Math.min(p[1], p[5]), Math.max(p[0], p[4]), Math.max(p[1], p[5])];
      // a closed 4-point axis-aligned loop is a rectangle unless it doubles back (zero area): check the area
      const area = Math.abs((p[0] * p[3] - p[2] * p[1]) + (p[2] * p[5] - p[4] * p[3]) + (p[4] * p[7] - p[6] * p[5]) + (p[6] * p[1] - p[0] * p[7])) / 2;
      this.rect = ok && Math.abs(area - (r[2] - r[0]) * (r[3] - r[1])) < 1e-6 * (1 + area) ? r : null;
    } else this.rect = null;
    let px = p[len - 2], py = p[len - 1];
    for (let i = 0; i < len; i += 2) {
      const x = p[i], y = p[i + 1];
      if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
      if (y !== py) {
        const k = this.n++;
        if (y > py) { this.top[k] = py; this.bot[k] = y; this.x0[k] = px; this.dir[k] = 1; }
        else { this.top[k] = y; this.bot[k] = py; this.x0[k] = x; this.dir[k] = -1; }
        this.slope[k] = (x - px) / (y - py);
      }
      px = x; py = y;
    }
  }

  /** Device-space bounds of what was added: { x0, y0, x1, y1 } (integers, half-open) or null. */
  bounds() {
    if (!this.n) return null;
    return { x0: Math.floor(this.minX), y0: Math.floor(this.minY), x1: Math.ceil(this.maxX), y1: Math.ceil(this.maxY) };
  }

  /**
   * Scan-convert. clip: { x0, y0, x1, y1 } integer box the output is limited to.
   * sink(y, x0, x1, cov) is called once per row that has coverage.
   */
  fill(evenOdd, clip, sink) {
    const n = this.n;
    if (!n) return;
    const bx0 = Math.max(clip.x0, Math.floor(this.minX), 0), bx1 = Math.min(clip.x1, Math.ceil(this.maxX), this.W);
    const by0 = Math.max(clip.y0, Math.floor(this.minY), 0), by1 = Math.min(clip.y1, Math.ceil(this.maxY), this.H);
    if (bx0 >= bx1 || by0 >= by1) return;
    if (this.rect) { this.fillRect(bx0, by0, bx1, by1, sink); return; }
    const { top, bot, x0: ex0, slope, dir, cov, diff } = this;
    const order = this.order;
    for (let i = 0; i < n; i++) order[i] = i;
    const ord = order.subarray(0, n).sort((a, b) => top[a] - top[b]);
    if (this.active.length < n) this.active = new Int32Array(Math.max(n, this.active.length * 2));
    if (this.xs.length < n) this.xs = new Float64Array(Math.max(n, this.xs.length * 2));
    const active = this.active, xs = this.xs;
    let nAct = 0, next = 0;
    const S = this.sub, inv = 1 / S, fx0 = bx0, fx1 = bx1;
    for (let py = by0; py < by1; py++) {
      let rowMin = bx1, rowMax = bx0 - 1;
      for (let s = 0; s < S; s++) {
        const sy = py + (s + 0.5) * inv;
        while (next < n && top[ord[next]] <= sy) active[nAct++] = ord[next++];
        // drop finished edges and keep `active` sorted by x (insertion sort: the
        // order barely changes between sub-scanlines, so this is ~linear)
        let m = 0;
        for (let k = 0; k < nAct; k++) {
          const e = active[k];
          if (bot[e] <= sy) continue;
          const x = ex0[e] + (sy - top[e]) * slope[e];
          let j = m++;
          while (j > 0 && xs[j - 1] > x) { xs[j] = xs[j - 1]; active[j] = active[j - 1]; j--; }
          xs[j] = x; active[j] = e;
        }
        nAct = m;
        if (m < 2) continue;
        let wind = 0, start = 0;
        for (let k = 0; k < m; k++) {
          const was = evenOdd ? (wind & 1) !== 0 : wind !== 0;
          wind += dir[active[k]];
          const now = evenOdd ? (wind & 1) !== 0 : wind !== 0;
          if (now === was) continue;
          if (now) { start = xs[k]; continue; }
          let xa = start, xb = xs[k];
          if (xa < fx0) xa = fx0;
          if (xb > fx1) xb = fx1;
          if (xb <= xa) continue;
          const ia = xa | 0, ib = xb | 0;
          if (ia === ib) cov[ia] += (xb - xa) * inv;
          else {
            cov[ia] += (ia + 1 - xa) * inv;
            diff[ia + 1] += inv;
            diff[ib] -= inv;
            cov[ib] += (xb - ib) * inv;
          }
          if (ia < rowMin) rowMin = ia;
          if (ib > rowMax) rowMax = ib;
        }
      }
      if (rowMax < rowMin) continue;
      if (rowMax >= bx1) rowMax = bx1 - 1;
      let run = 0;
      for (let x = rowMin; x <= rowMax; x++) { run += diff[x]; diff[x] = 0; cov[x] += run; }
      diff[rowMax + 1] = 0;
      sink(py, rowMin, rowMax + 1, cov);
      cov.fill(0, rowMin, rowMax + 2);
    }
  }

  fillRect(bx0, by0, bx1, by1, sink) {
    const [rx0, ry0, rx1, ry1] = this.rect, cov = this.cov;
    const xa = Math.max(rx0, bx0), xb = Math.min(rx1, bx1);
    if (xb <= xa) return;
    const ia = Math.floor(xa), ib = Math.min(Math.ceil(xb), bx1);
    for (let py = by0; py < by1; py++) {
      const v = Math.min(py + 1, ry1) - Math.max(py, ry0);
      if (v <= 0) continue;
      for (let x = ia; x < ib; x++) cov[x] = v * (Math.min(x + 1, xb) - Math.max(x, xa));
      sink(py, ia, ib, cov);
    }
    cov.fill(0, ia, ib + 1);
  }
}
