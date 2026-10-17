// Token-bucket rate limits for plugin commands (browser.md §9.4: <= 60/s overall, plus tighter
// buckets for commands that can hurt the user if a bug or a stuck key repeats them).

export class TokenBucket {
  /** @param {{rate:number, burst:number, clock:{now():number}}} o  rate = tokens per second */
  constructor({ rate, burst, clock }) {
    this.rate = rate;
    this.burst = burst;
    this.clock = clock;
    this.tokens = burst;
    this.last = clock.now();
  }
  take(n = 1) {
    const now = this.clock.now();
    const dt = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + dt * this.rate);
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Per-op limits on top of the global bucket. Ops not listed only use the global bucket. */
export const OP_LIMITS = Object.freeze({
  'tab.close': { rate: 4, burst: 8 },
  'tab.create': { rate: 2, burst: 4 },
  'session.restore': { rate: 2, burst: 4 },
  'session.recent': { rate: 2, burst: 4 },
  'tab.move': { rate: 10, burst: 20 },
  'window.state': { rate: 4, burst: 8 },
  'panic': { rate: 1, burst: 2 },
  'perm.hostRequest': { rate: 0.5, burst: 2 },
  'perm.openOptions': { rate: 0.5, burst: 2 },
  'preview.subscribe': { rate: 2, burst: 4 },
  'download.path': { rate: 2, burst: 4 },
  'download.cancel': { rate: 2, burst: 4 },
  'img.get': { rate: 4, burst: 8 },
});

export class CommandLimiter {
  constructor({ clock, perSec = 60 }) {
    this.clock = clock;
    this.global = new TokenBucket({ rate: perSec, burst: perSec, clock });
    this.perOp = new Map();
  }
  /** True if the command may run now. */
  allow(op) {
    const lim = OP_LIMITS[op];
    if (lim) {
      let b = this.perOp.get(op);
      if (!b) { b = new TokenBucket({ ...lim, clock: this.clock }); this.perOp.set(op, b); }
      // Check the op bucket first so a flood of one op doesn't drain the global bucket.
      if (!b.take()) return false;
    }
    return this.global.take();
  }
}
