// Log Lines: a journalctl -f follow with priority colors, JSON lines with
// token coloring, and logfmt with a level filter bar.
import { mix } from '../../color.js';
import { glyphs, put, putR, safe, ATTR } from '../charts/_data.js';
import { tail, stamp, logLine, LEVEL_KEYS, levelColor } from './_logs.js';

/** Fade-in highlight for the newest line; `age` in lines. */
const fresh = (th, c, k) => (k < 1 ? mix(th.bg, c, 0.16 * (1 - k)) : undefined);

const syslog = {
  id: 'status-log-syslog',
  title: 'journalctl -f',
  category: 'Log Lines',
  description: 'A journal follow in syslog format with journald priority colors — red errors, yellow warnings, dim debug — scrolling as lines arrive.',
  tags: ['journalctl', 'syslog', 'logs', 'tail -f', 'priority'],
  kind: 'widget',
  size: { w: 80, h: 14 },
  minSize: { w: 40, h: 4 },
  loop: 20,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const RATE = 2.2;
    // journald conventions: emerg..err red (crit bold), warning yellow, notice bold, info plain, debug dim.
    const style = {
      crit: [th.neg, ATTR.BOLD], error: [th.neg, 0], warn: [th.warn, 0], info: [th.ink, 0], debug: [th.dim, 0],
    };
    return (t) => {
      const head = H >= 8 ? 1 : 0;
      const n = H - head;
      if (head) put(b, 0, 0, '-- Journal begins at Mon 2026-10-12 00:00:01 UTC. --', W, th.dim);
      const lines = tail(11, t, RATE, n);
      const frac = t * RATE - Math.floor(t * RATE);
      lines.forEach((l, r) => {
        const y = head + r;
        const [c, at] = style[l.level];
        const bg = r === n - 1 ? fresh(th, c === th.ink ? th.accent : c, frac * 2) : undefined;
        if (bg) for (let x = 0; x < W; x++) b.set(x, y, ' ', undefined, bg);
        let x = b.text(0, y, stamp(l.i, RATE), th.muted, bg);
        x = b.text(x + 1, y, l.host, th.muted, bg);
        const unit = l.svc === 'kernel' ? 'kernel' : `${l.svc}[${l.pid}]`;
        x = b.text(x + 1, y, `${unit}:`, th.info, bg);
        put(b, x + 1, y, l.msg, W - x - 1, c, bg, at);
      });
    };
  },
};

/** Draw a JSON object on one line with token colors; returns the end column. */
function jsonLine(b, x, y, w, obj, th, levelC, bg) {
  const end = x + w;
  const out = (s, c, at) => { x = put(b, x, y, s, end - x, c, bg, at); };
  out('{', th.dim);
  const keys = Object.keys(obj);
  keys.forEach((k, i) => {
    if (x >= end) return;
    out(`"${k}"`, th.info);
    out(':', th.dim);
    const v = obj[k];
    if (typeof v === 'number') out(String(v), th.warn);
    else if (k === 'level') out(`"${v}"`, levelC, ATTR.BOLD);
    else out(JSON.stringify(v), k === 'msg' ? th.ink : th.pos);
    if (i < keys.length - 1) out(',', th.dim);
  });
  out('}', th.dim);
  return x;
}

const jsonLogs = {
  id: 'status-log-json',
  title: 'JSON Log Lines',
  category: 'Log Lines',
  description: 'Structured JSON logs piped through jq -c: keys, strings, numbers and level values each colored, with errors flagged in the gutter.',
  tags: ['json', 'structured logs', 'jq', 'logs', 'syntax color'],
  kind: 'widget',
  size: { w: 80, h: 14 },
  minSize: { w: 40, h: 4 },
  loop: 20,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const RATE = 1.6;
    return (t) => {
      const head = H >= 8 ? 1 : 0;
      const n = H - head;
      if (head) { const x = b.text(0, 0, '$ ', th.pos, undefined, ATTR.BOLD); put(b, x, 0, 'kubectl logs -f deploy/checkout | jq -c', W - x, th.ink); }
      const lines = tail(23, t, RATE, n);
      const frac = t * RATE - Math.floor(t * RATE);
      lines.forEach((l, r) => {
        const y = head + r, c = levelColor(th, l.level);
        const bad = l.level === 'error' || l.level === 'crit';
        const bg = r === n - 1 ? fresh(th, th.accent, frac * 2) : undefined;
        if (bg) for (let x = 0; x < W; x++) b.set(x, y, ' ', undefined, bg);
        b.set(0, y, bad ? (g.u ? '▌' : '!') : ' ', c, bg);
        const obj = { ts: stamp(l.i, RATE, 'iso').slice(11), level: l.level, svc: l.svc, msg: l.msg };
        if (W >= 100 || !bad) obj.latency_ms = l.fields.latency_ms;
        obj.trace = l.fields.trace;
        jsonLine(b, 2, y, W - 2, obj, th, c, bg);
      });
    };
  },
};

const logfmt = {
  id: 'status-log-logfmt',
  title: 'logfmt Viewer',
  category: 'Log Lines',
  description: 'logfmt key=value lines under a level filter bar with live counts; the filter steps from all levels to warnings and errors only.',
  tags: ['logfmt', 'logs', 'filter', 'level badges', 'key value'],
  kind: 'widget',
  size: { w: 80, h: 14 },
  minSize: { w: 40, h: 4 },
  loop: 18,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const RATE = 3;
    const RANK = { debug: 0, info: 1, warn: 2, error: 3, crit: 4 };
    // Counts per level up to line i, sampled cheaply: a fixed historical base plus a running tally.
    const BASE = 4000;
    const counts = new Map();
    const tally = (upto) => {
      const out = { debug: 0, info: 0, warn: 0, error: 0, crit: 0 };
      for (let i = upto - 400; i <= upto; i++) out[logLine(31, i).level]++;
      const scale = (BASE + upto) / 401;
      for (const k of LEVEL_KEYS) out[k] = Math.round(out[k] * scale);
      return out;
    };
    return (t) => {
      const lt = t % 18;
      const min = lt < 6 ? 0 : lt < 12 ? 2 : 1;
      // The filter bar.
      const upto = Math.floor(t * RATE);
      const key = Math.floor(upto / 8);
      if (!counts.has(key)) { counts.clear(); counts.set(key, tally(key * 8)); }
      const cnt = counts.get(key);
      let x = 0;
      for (const l of LEVEL_KEYS) {
        const on = RANK[l] >= min, c = levelColor(th, l);
        const lab = ` ${l.toUpperCase()} ${cnt[l].toLocaleString('en-US')} `;
        if (x + lab.length > W) break;
        x = b.text(x, 0, lab, on ? th.bg : mix(th.bg, c, 0.7), on ? c : mix(th.bg, c, 0.12), on ? ATTR.BOLD : 0) + 1;
      }
      if (W >= 76) putR(b, W, 0, min ? `level>=${min === 2 ? 'warn' : 'info'}` : 'all', th.muted);
      // Matching lines, newest last.
      const n = H - 1;
      const out = [];
      for (let i = upto + n; out.length < n && i > upto - 200; i--) { const l = logLine(31, i); if (RANK[l.level] >= min) out.push(l); }
      out.reverse().forEach((l, r) => {
        const y = 1 + r, c = levelColor(th, l.level);
        const pairs = [
          ['ts', stamp(l.i, RATE, 'iso').slice(11, 23)], ['level', l.level], ['svc', l.svc],
          ['msg', `"${l.msg.replace(/"/g, "'")}"`], ['latency_ms', String(l.fields.latency_ms)], ['host', l.host], ['trace', l.fields.trace],
        ];
        let cx = 0;
        for (const [k, v] of pairs) {
          if (cx >= W) break;
          cx = put(b, cx, y, k, W - cx, th.dim);
          cx = put(b, cx, y, '=', W - cx, th.dim);
          const vc = k === 'level' ? c : k === 'msg' ? th.ink : k === 'latency_ms' ? (+v > 500 ? th.warn : th.info) : th.muted;
          cx = put(b, cx, y, v, W - cx, vc, undefined, k === 'level' ? ATTR.BOLD : 0) + 1;
        }
      });
    };
  },
};

export default [syslog, jsonLogs, logfmt];
