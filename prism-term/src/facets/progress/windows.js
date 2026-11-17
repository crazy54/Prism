// Windows — time that expires on schedule: an authenticator rotating its
// one-time codes, an API rate-limit window running dry and resetting, and a
// resolver cache whose TTLs tick down and refetch.
import { mix } from '../../color.js';
import { clamp01, clock } from './_sim.js';

/** Time within the loop, quantized so t and t + loop draw identical frames. */
const loopT = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
/** Deterministic hash of two ints → [0, 1). */
const hash = (a, b) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

/** A draining bar: `frac` of `w` cells lit (eighth blocks), the rest as a dim track. */
function bar(b, x, y, w, frac, color, track, u) {
  const v = clamp01(frac) * w, full = Math.floor(v), rem = Math.floor((v - full) * 8);
  for (let i = 0; i < w; i++) {
    if (i < full) b.set(x + i, y, u ? '█' : '#', color);
    else if (i === full && rem && u) b.set(x + i, y, EIGHTHS[rem], color);
    else b.set(x + i, y, u ? '─' : '-', track);
  }
}

// ── authenticator ────────────────────────────────────────────────────────────
const ACCOUNTS = [
  ['GitHub', 'jhall@prism.dev', '482913', '715390'],
  ['AWS', 'prism-prod root', '107554', '948126'],
  ['Okta', 'jeremy.hall', '839201', '302847'],
  ['Cloudflare', 'ops@prism.dev', '266048', '650719'],
];
const PIES = ['○', '◔', '◑', '◕', '●'];

const totp = {
  id: 'progress-totp', title: 'Authenticator Codes', category: 'Timers & Countdowns', order: 210, kind: 'progress',
  since: '0.3.0',
  description: 'An authenticator app: four 6-digit codes share one 30 s window that drains, warns in its last 5 s, then every digit rolls over to a fresh code.',
  tags: ['totp', '2fa', 'mfa', 'authenticator', 'one-time password', 'security', 'countdown'],
  size: { w: 56, h: 10 }, minSize: { w: 30, h: 3 }, loop: 60, color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const header = H >= 6, wide = W >= 50;
    const rows = Math.max(1, Math.min(4, header ? H - 2 : H - 1));
    const step = header && H >= 10 ? 2 : 1;
    const shown = Math.min(rows, Math.floor((H - (header ? 2 : 1)) / step) || 1);
    const codeX = wide ? 34 : W - (u ? 11 : 13);
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 60), win = Math.floor(tau / 30), into = tau - win * 30, left = 30 - into;
      if (header) {
        b.text(1, 0, u ? 'TOTP · 30s · SHA1' : 'TOTP - 30s - SHA1', th.muted);
        const s = `${Math.ceil(left - 1e-9)}s`;
        b.text(W - 1 - s.length, 0, s, left < 5 ? th.warn : th.muted);
      }
      const y0 = header ? (step === 2 ? 2 : 1) : 0;
      for (let r = 0; r < shown; r++) {
        const [issuer, acct, a, c] = ACCOUNTS[r], y = y0 + r * step;
        const now = win ? c : a, before = win ? a : c;
        b.text(1, y, issuer, th.accent, undefined, 1);
        if (wide) b.text(13, y, acct, th.dim);
        // the code: grouped 3+3; in the first 0.25 s each digit spins up from the old code to the new
        let x = codeX;
        for (let i = 0; i < 6; i++) {
          if (i === 3) x++;
          const dur = 0.25 + i * 0.02, from = +before[i], steps = ((+now[i] - from + 10) % 10) || 10;
          const d = into < dur ? (from + 1 + Math.floor((into / dur) * steps)) % 10 : +now[i];  // a reel spinning up to the new digit
          const warn = left < 5, pulse = warn && Math.floor(tau * 4) % 2 === 0;
          b.set(x++, y, String(d), warn ? th.warn : th.ink, undefined, pulse ? 1 : 0);
        }
        const q = Math.min(4, Math.ceil((left / 30) * 4 - 1e-9));     // quarter pie per row
        b.text(x + 2, y, u ? PIES[q] : `${Math.ceil(left - 1e-9)}s`.padStart(3), left < 5 ? th.warn : th.info);
        if (wide && tau >= 8 && tau < 9.6 && r === 0) b.text(x + 4, y, u ? ' Copied ✓ ' : ' Copied! ', th.ink, th.panel2);
      }
      bar(b, 1, H - 1, W - 2, left / 30, left < 5 ? th.warn : th.info, th.line, u);
    };
  },
};

// ── rate limit ───────────────────────────────────────────────────────────────
const LIMIT = 60;
const ENDPOINTS = ['/repos/prism/term/issues', '/repos/prism/term/pulls', '/repos/prism/term/commits', '/user', '/repos/prism/term/actions/runs', '/rate_limit'];
// bursts of [start s, requests, spacing s]; 60 by ~19.5 s, then two retries that meet a 429
const BURSTS = [[1, 8, 0.07], [4, 12, 0.06], [8.5, 10, 0.07], [12, 15, 0.05], [16, 10, 0.08], [19, 5, 0.1]];
const REQS = BURSTS.flatMap(([s, n, d], k) => Array.from({ length: n }, (_, i) => s + i * d));
REQS.push(21, 25);

const rateLimit = {
  id: 'progress-rate-limit', title: 'Rate-Limit Window', category: 'Timers & Countdowns', order: 220, kind: 'progress',
  since: '0.3.0',
  description: 'An API client drains its rate-limit window: x-ratelimit headers count down, 429s come back with retry-after, and the quota refills at reset.',
  tags: ['rate limit', 'api', 'quota', '429', 'http', 'retry-after', 'backoff'],
  size: { w: 72, h: 10 }, minSize: { w: 36, h: 4 }, loop: 30, color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const logRows = Math.max(0, H - 5);
    // a log line fits W - 2: the latency drops first, then the path loses leading segments behind an ellipsis
    const ell = u ? '…' : '...';
    const fitPath = (path, room) => {
      if (path.length <= room) return path;
      const seg = path.split('/').filter(Boolean);
      for (let k = 1; k < seg.length - 1; k++) { const p = `${ell}/${seg.slice(k).join('/')}`; if (p.length <= room) return p; }
      return `${ell}/${seg.at(-1)}`;
    };
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 30), reset = 30 - tau;
      const sent = REQS.filter((r) => r <= tau);
      const used = Math.min(LIMIT, sent.length), remaining = LIMIT - used;
      const sweep = clamp01(tau / 0.6);                          // reset: the bar refills left → right
      const head = `x-ratelimit-limit: ${LIMIT} ${u ? '·' : '-'} remaining: ${remaining} ${u ? '·' : '-'} reset in ${clock(reset, { short: true })}`;
      if (W >= 60) b.text(1, 0, head, th.muted);
      else b.text(1, 0, `remaining ${remaining}/${LIMIT} ${u ? '·' : '-'} reset ${clock(reset, { short: true })}`, th.muted);
      // quota bar: one cell per request; just-spent cells flash
      const bw = Math.min(LIMIT, W - 2), per = LIMIT / bw;
      for (let i = 0; i < bw; i++) {
        const idx = Math.floor(i * per);                         // request slot this cell stands for
        const spent = tau < 0.6 ? i / bw >= sweep : idx < used;     // ahead of the sweep the old window is still spent
        const at = sent[idx], fresh = spent && at !== undefined && tau - at < 0.3;
        const refill = tau < 0.6 && i / bw < sweep && i / bw > sweep - 0.08;
        b.set(1 + i, 1, spent ? (u ? '─' : '-') : u ? '█' : '#', fresh ? th.ink : refill ? th.ink : spent ? th.line : th.accent);
      }
      // the log tail, newest last; it keeps scrolling across the reset (last window's lines lead in)
      const lines = [...REQS.map((at, i) => [at - 30, i]), ...REQS.map((at, i) => [at, i])].filter(([at]) => at <= tau).slice(logRows > 0 ? -logRows : Infinity).map(([at, i]) => {
        const over = i >= LIMIT, path = ENDPOINTS[Math.floor(hash(i, 3) * ENDPOINTS.length)], ms = 40 + Math.floor(hash(i, 5) * 140);
        const tail = over ? `  retry-after: ${Math.ceil(30 - (at < 0 ? at + 30 : at))}` : ` ${ms}ms`;
        const keep = over || 8 + path.length + tail.length <= W - 2, p = fitPath(path, W - 10 - (keep ? tail.length : 0));
        return [['GET ', th.muted], [p, th.ink], [over ? ' 429' : ' 200', over ? th.neg : th.pos], ...(keep ? [[tail, over ? th.neg : th.dim]] : [])];
      });
      lines.forEach((parts, r) => { let x = 1; for (const [s, c] of parts) x = b.text(x, 3 + r, s, c); });
      // client backoff while exhausted
      const sy = Math.min(H - 1, 3 + logRows);
      if (remaining === 0 && tau > 19.5) b.text(1, sy, `backing off ${u ? '·' : '-'} retrying in ${clock(reset, { short: true })}`, th.warn);
      else if (sent.length) b.text(1, sy, `last ${sent.length > LIMIT ? 429 : 200} ${u ? '·' : '-'} ${used} of ${LIMIT} used`, sent.length > LIMIT ? th.neg : th.pos);
      else b.text(1, sy, `window reset ${u ? '·' : '-'} ${LIMIT} of ${LIMIT} left`, th.accent);
    };
  },
};

// ── DNS cache TTLs ───────────────────────────────────────────────────────────
// [name, ttl, type, rdata variants (round-robin order rotates on each refetch), phase offset]
const RECORDS = [
  ['api.prism.dev.', 60, 'A', ['203.0.113.24'], 21],
  ['cdn.prism.dev.', 30, 'A', ['198.51.100.7', '198.51.100.8'], 4],
  ['edge.prism.dev.', 20, 'A', ['192.0.2.41', '192.0.2.42', '192.0.2.43'], 13],
  ['mail.prism.dev.', 15, 'MX', ['10 mx1.prism.dev.', '20 mx2.prism.dev.'], 9],
  ['status.prism.dev.', 12, 'CNAME', ['prism.statuspage.io.'], 2],
  ['old.prism.dev.', 10, 'SOA', ['NXDOMAIN (negative cache)'], 6],
];

const dnsTtl = {
  id: 'progress-dns-ttl', title: 'Resolver Cache TTLs', category: 'Timers & Countdowns', order: 230, kind: 'progress',
  since: '0.3.0',
  description: 'A dig-style answer section from a resolver cache: each TTL ticks down and drains its bar, then the record refetches and round-robin answers rotate.',
  tags: ['dns', 'ttl', 'cache', 'dig', 'resolver', 'networking', 'expiry'],
  size: { w: 72, h: 9 }, minSize: { w: 36, h: 4 }, loop: 60, glyphs: 'unicode', color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const header = H >= 6;
    const rows = Math.min(RECORDS.length, H - (header ? 2 : 1));
    const wide = W >= 72;                                     // the IN / type / data columns, a cell clear of the bar
    const barW = wide ? 10 : Math.max(4, W - 26);
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 60);
      if (header) b.text(0, 0, W >= 37 ? ';; ANSWER SECTION (cache @127.0.0.53)' : ';; ANSWER SECTION:', th.muted);
      let freshest = Infinity;
      for (let r = 0; r < rows; r++) {
        const [name, ttl, type, rr, off] = RECORDS[r], y = (header ? 1 : 0) + r;
        const age = (tau + off) % ttl, left = ttl - age, fetches = Math.floor((tau + off) / ttl);
        freshest = Math.min(freshest, age);
        const flash = age < 0.6;                                   // just refetched
        const data = rr[fetches % rr.length];                       // round-robin rotates per refetch
        const shownTtl = String(Math.ceil(left - 1e-9));
        const col = left / ttl < 0.1 ? th.neg : left / ttl < 0.3 ? th.warn : th.info;
        let x = b.text(0, y, name.padEnd(wide ? 18 : 16).slice(0, wide ? 18 : 16), th.ink);
        x = b.text(x, y, shownTtl.padStart(3), flash ? th.accent : th.ink);
        if (wide) { x = b.text(x + 2, y, 'IN', th.dim); x = b.text(x + 2, y, type.padEnd(5), th.muted); x = b.text(x + 1, y, data.padEnd(25).slice(0, 25), type === 'SOA' ? th.neg : th.ink); }
        bar(b, W - barW - 3, y, barW, left / ttl, col, th.line, u);
        b.text(W - 2, y, flash ? (u ? '↻' : '@') : ' ', th.accent);
      }
      const qy = (header ? 1 : 0) + rows;
      if (qy < H) b.text(0, qy, freshest < 0.6 ? ';; Query time: 31 msec' : ';; Query time: 0 msec (cached)', freshest < 0.6 ? th.accent : th.muted);
    };
  },
};

export default [totp, rateLimit, dnsTtl];
