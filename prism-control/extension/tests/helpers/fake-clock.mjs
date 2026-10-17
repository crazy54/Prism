// Deterministic clock for the unit tests: timers fire only when the test advances time.
export class FakeClock {
  constructor(start = 1_800_000_000_000) {
    this.t = start;
    this.timers = [];
    this.seq = 1;
  }
  now() { return this.t; }
  setTimeout(fn, ms) {
    const id = this.seq++;
    this.timers.push({ id, at: this.t + Math.max(0, Number(ms) || 0), fn });
    return id;
  }
  clearTimeout(id) { this.timers = this.timers.filter((x) => x.id !== id); }
  pending() { return this.timers.length; }
  /** Runs every timer due within `ms`, in order, letting promises settle between them. */
  async advance(ms) {
    const end = this.t + ms;
    await flush();
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
      await flush();
    }
    this.t = end;
    await flush();
  }
}

/** Lets pending promise chains (and setImmediate work) run. */
export async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}
