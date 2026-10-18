// Ring buffer — fixed-capacity history of numbers, oldest first. Browser-safe.
//
//   const r = new RingBuffer(120, { fill: 0 });   // prefilled: length === capacity from the start
//   r.push(0.4); r.last(30)  → plain number[] (oldest first)
//
// Used for the levels history (ctx.data.audio.levels) and anywhere a bounded,
// allocation-free history is needed. Nothing here ever grows: audio is analysed
// in memory and forgotten.

export class RingBuffer {
  /** @param {number} capacity  @param {{ fill?: number, Type?: Float32ArrayConstructor | Float64ArrayConstructor }} [o] */
  constructor(capacity, { fill, Type = Float32Array } = {}) {
    const n = Math.max(1, Math.floor(capacity) || 1);
    this.buf = new Type(n);
    this.w = 0;            // next write index
    this.n = 0;            // filled entries
    if (fill !== undefined) { this.buf.fill(fill); this.n = n; }
  }

  get capacity() { return this.buf.length; }
  get length() { return this.n; }

  push(v) {
    this.buf[this.w] = v;
    this.w = (this.w + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
    return this;
  }

  pushMany(values) { for (let i = 0; i < values.length; i++) this.push(values[i]); return this; }

  /** i-th entry, 0 = oldest (negative = from the newest: -1 is the newest). */
  at(i) {
    if (i < 0) i += this.n;
    if (i < 0 || i >= this.n) return undefined;
    const start = (this.w - this.n + this.buf.length) % this.buf.length;
    return this.buf[(start + i) % this.buf.length];
  }

  /** The newest value (undefined when empty). */
  get newest() { return this.at(-1); }

  /** The newest `count` entries as a plain array, oldest first. */
  last(count = this.n) {
    const k = Math.max(0, Math.min(this.n, Math.floor(count)));
    const out = new Array(k);
    const L = this.buf.length;
    let r = (this.w - k + L) % L;
    for (let i = 0; i < k; i++) { out[i] = this.buf[r]; r = r + 1 === L ? 0 : r + 1; }
    return out;
  }

  toArray() { return this.last(this.n); }

  /** Copy into a typed array in chronological order (for FFT frames). */
  copyTo(out, count = Math.min(this.n, out.length)) {
    const L = this.buf.length;
    let r = (this.w - count + L) % L;
    for (let i = 0; i < count; i++) { out[i] = this.buf[r]; r = r + 1 === L ? 0 : r + 1; }
    return out;
  }

  clear(fill) {
    if (fill !== undefined) { this.buf.fill(fill); this.n = this.buf.length; } else { this.buf.fill(0); this.n = 0; }
    this.w = 0;
    return this;
  }
}
