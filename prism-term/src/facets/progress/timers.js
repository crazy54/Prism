// Timers & countdowns — time that runs out, runs up, or flips over.
//
// Clocks here are internally consistent: "now" plus "time left" always equals
// the target, laps sum to the elapsed time, and nothing reads the real clock —
// every instant is derived from t so frames are reproducible.
import { ATTR } from '../../buffer.js';
import { Canvas } from '../../canvas.js';
import { mix } from '../../color.js';
import { truncate, stringWidth } from '../../width.js';
import { phase, glyphs, clamp01, commas } from './_sim.js';
import { lift } from '../charts/_data.js';
import { FONT47, FONT35, layout } from './_fonts.js';
import { segs } from './_log.js';

const C = 'Timers & Countdowns';
const p2 = (n) => String(Math.floor(n)).padStart(2, '0');
const hms = (s) => `${p2(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)}`;
const spinAt = (t, u) => (u ? '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' : '-\\|/')[Math.floor(t * 12) % (u ? 10 : 4)];

/** Paint big text: half-block 4×7 glyphs (two columns per pixel) or 3×5 '#' glyphs in ASCII. Returns rows used. */
function bigText(b, x, y, text, color, unicode, { scale = 2 } = {}) {
  if (unicode) {
    const L = layout(text, FONT47, { scale });
    const cv = new Canvas(L.w, 4, { mode: 'half' });
    for (const [px, py, k] of L.px) cv.set(px, py, color(px / Math.max(1, L.w - 1), k));
    cv.paint(b, x, y);
    return { w: L.w, h: 4 };
  }
  const L = layout(text, FONT35, { scale });
  for (const [px, py, k] of L.px) b.set(x + px, y + py, '#', color(px / Math.max(1, L.w - 1), k));
  return { w: L.w, h: 5 };
}
const bigWidth = (text, unicode, scale = 2) => layout(text, unicode ? FONT47 : FONT35, { scale }).w;

export default [
  // ── maintenance countdown ────────────────────────────────────────────
  {
    id: 'progress-countdown', title: 'Maintenance Countdown', category: C, order: 10, kind: 'progress',
    description: 'Big T-minus digits to a maintenance window, going amber then red while sessions drain, then counting up once it opens.',
    tags: ['countdown', 'maintenance', 'window', 't-minus'], size: { w: 60, h: 10 }, minSize: { w: 30, h: 2 }, loop: 18, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const lead = 12, opensAt = 2 * 3600;                  // window opens 02:00:00 UTC
      const sessions = 1204;
      const jitter = Array.from({ length: 64 }, () => ctx.rng());
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 18, 1);
        const open = local >= lead;
        const left = Math.max(0, lead - local);
        const now = opensAt - lead + local;
        const shown = open ? local - lead : Math.ceil(left);
        const digits = `${p2(shown / 60)}:${p2(shown % 60)}`;
        const tone = open ? th.pos : left <= 5 ? th.neg : left <= 10 ? th.warn : th.ink;
        const remain = open ? 0 : Math.max(0, Math.round(sessions * Math.pow(left / lead, 1.7) * (0.96 + 0.08 * jitter[Math.floor(local * 4) % 64])));
        const title = open ? `${g.bullet} MAINTENANCE IN PROGRESS` : 'Maintenance window opens in';
        const clockLine = `now ${hms(now)} UTC  ${g.dot}  window 02:00${g.unicode ? '–' : '-'}02:30 UTC`;
        const status = open ? `${g.ok} failover started ${g.dot} writes paused on prism-db-01`
          : left <= 5 ? `${g.warn} final notice sent ${g.dot} ${commas(remain)} sessions still open` : `draining sessions ${g.dot} ${commas(remain)} of ${commas(sessions)} open`;
        const bw = bigWidth(digits, g.unicode);
        const big = H >= 8 && W >= bw + 2;
        if (!big) {
          segs(b, 0, 0, W, [[open ? 'in progress ' : 'opens in ', th.muted], [digits, tone, ATTR.BOLD], [`  ${open ? '' : `${commas(remain)} sessions`}`, th.muted]], g.ell);
          if (H >= 2) b.text(0, 1, truncate(clockLine, W, g.ell), th.dim);
          return;
        }
        b.text(1, 0, truncate(title, W - 2, g.ell), open ? th.pos : th.muted, undefined, open ? ATTR.BOLD : 0);
        const r = bigText(b, Math.floor((W - bw) / 2), 1, digits, () => tone, g.unicode);
        const y = 1 + r.h + 1;
        if (H > y + 2) {
          // Drain bar: open sessions as a share of the starting count.
          const bwid = W - 4, n = Math.round((remain / sessions) * bwid);
          for (let i = 0; i < bwid; i++) b.set(2 + i, y, g.unicode ? (i < n ? '━' : '─') : i < n ? '=' : '-', i < n ? tone : th.line);
        }
        if (H > y + 1) b.text(1, H - 2, truncate(clockLine, W - 2, g.ell), th.dim);
        b.text(1, H - 1, truncate(status, W - 2, g.ell), open ? th.pos : left <= 5 ? th.neg : th.muted);
      };
    },
  },

  // ── stopwatch ────────────────────────────────────────────────────────
  {
    id: 'progress-stopwatch', title: 'Lap Stopwatch', category: C, order: 20, kind: 'progress',
    description: 'A centisecond stopwatch timing benchmark runs; each lap is logged with its delta to the best, and the best lap is marked.',
    tags: ['stopwatch', 'laps', 'benchmark', 'timer'], size: { w: 48, h: 11 }, minSize: { w: 28, h: 2 }, loop: 20, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const laps = [3.12, 2.87, 3.4, 2.71, 2.95, 3.05].map((v) => +(v + (ctx.rng() - 0.5) * 0.1).toFixed(2));
      const ends = laps.reduce((a, v) => [...a, +((a[a.length - 1] || 0) + v).toFixed(2)], []);
      const stopAt = ends[ends.length - 1];
      const fmt = (s) => `${p2(s / 60)}:${p2(s % 60)}.${p2(Math.floor((s * 100) % 100))}`;
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 20, 1);
        const el = Math.min(local, stopAt);
        const stopped = local >= stopAt;
        const doneLaps = ends.filter((e) => e <= el).length;
        const best = doneLaps ? Math.min(...laps.slice(0, doneLaps)) : null;
        const worst = doneLaps > 2 ? Math.max(...laps.slice(0, doneLaps)) : null;
        const state = stopped ? [`${g.unicode ? '■' : '#'} stopped`, th.muted] : [`${g.bullet} running`, th.pos];
        const head = `bench: cold start ${g.dot} lap ${Math.min(laps.length, doneLaps + 1)}/${laps.length}`;
        const digits = fmt(el);
        const bw = bigWidth(digits, g.unicode, 1);
        const big = H >= 9 && W >= bw + 2;
        b.text(1, 0, truncate(head, W - 14, g.ell), th.muted);
        b.text(W - 1 - stringWidth(state[0]), 0, state[0], state[1]);
        let y = 1;
        if (big) {
          const r = bigText(b, Math.floor((W - bw) / 2), 1, digits, () => (stopped ? th.ink : th.accent), g.unicode, { scale: 1 });
          y = 2 + r.h;
        } else if (H >= 2) {
          b.text(1, 1, digits, stopped ? th.ink : th.accent, undefined, ATTR.BOLD);
          if (doneLaps) b.text(14, 1, truncate(`best ${laps.slice(0, doneLaps).reduce((m, v) => Math.min(m, v)).toFixed(2)}s`, W - 15, g.ell), th.pos);
          return;
        }
        const room = H - y;
        const list = laps.slice(0, doneLaps).map((v, i) => ({ v, i })).slice(-room);
        list.forEach(({ v, i }, r) => {
          const tag = v === best ? (g.unicode ? '★ best' : '* best') : v === worst ? 'slowest' : `+${(v - best).toFixed(2)}`;
          const tc = v === best ? th.pos : v === worst ? th.warn : th.muted;
          b.text(2, y + r, `lap ${i + 1}`, th.ink);
          b.text(10, y + r, fmt(v), th.ink);
          b.text(10 + 9 + 3, y + r, `${fmt(ends[i])}`, th.dim);
          if (W >= 42) b.text(W - 1 - stringWidth(tag), y + r, tag, tc, undefined, v === best ? ATTR.BOLD : 0);
        });
      };
    },
  },

  // ── health-check wait ────────────────────────────────────────────────
  {
    id: 'progress-health-wait', title: 'Health-Check Wait', category: C, order: 30, kind: 'progress',
    description: 'Waiting for a service to report healthy within a 12 s budget: probes back off 1-2-4 s, and every other run it times out and rolls back.',
    tags: ['timeout', 'health check', 'backoff', 'deploy', 'failure'], size: { w: 72, h: 9 }, minSize: { w: 36, h: 2 }, loop: 15, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const budget = 12, probes = [0.5, 1.5, 3.5, 7.5];
      const ok = ['connect: connection refused', 'HTTP 503 Service Unavailable (starting)', 'HTTP 503 Service Unavailable (migrations pending)', 'HTTP 200 OK'];
      const bad = ['connect: connection refused', 'HTTP 503 Service Unavailable (starting)', 'HTTP 503 Service Unavailable (migrations pending)', 'HTTP 503 Service Unavailable (migrations pending)'];
      const ms = probes.map(() => Math.round(4 + ctx.rng() * 30));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local, k } = phase(t, 15, 1);
        const fails = k % 2 === 1;
        const replies = fails ? bad : ok;
        const healthyAt = fails ? Infinity : probes[3] + ms[3] / 1000;
        const timedOut = fails && local >= budget;
        const doneAt = Math.min(healthyAt, budget);
        const el = Math.min(local, doneAt);
        const rows = [[['Waiting for ', th.ink], ['prism-api', th.ink, ATTR.BOLD], [' (10.20.0.14:8080/healthz) to become healthy', th.ink]]];
        probes.forEach((p, i) => {
          if (local < p) return;
          const good = replies[i].startsWith('HTTP 200');
          rows.push([[`  probe ${i + 1}  `, th.dim], [good ? g.ok : g.fail, good ? th.pos : th.neg], [` ${replies[i]}`, good ? th.pos : th.muted], [`  ${ms[i]}ms`, th.dim]]);
        });
        if (local >= healthyAt) rows.push([[`${g.ok} healthy after ${healthyAt.toFixed(1)}s`, th.pos, ATTR.BOLD], ['  (4 probes)', th.muted]]);
        if (timedOut) {
          rows.push([[`${g.fail} timed out after ${budget}s`, th.neg, ATTR.BOLD], [` ${g.dot} last reply: HTTP 503`, th.muted]]);
          if (local >= budget + 0.6) rows.push([[`${g.arrow} rolling back to prism-api 0.9.1`, th.warn]]);
        }
        const live = local < doneAt;
        const logRows = live ? H - 1 : H;
        rows.slice(-logRows).forEach((r, i) => segs(b, 0, i, W, r, g.ell));
        if (!live) return;
        // Status line: spinner, time to next probe, and the budget draining.
        const next = [...probes, 15.5].find((p) => p > local);
        const left = budget - el;
        const status = `${spinAt(t, g.unicode)} ${next ? `next probe in ${(next - local).toFixed(1)}s` : 'waiting'}`;
        b.text(0, H - 1, status, th.info);
        const bx = Math.max(stringWidth(status) + 2, 26), bw = W - bx - 12;
        if (bw >= 6) {
          const n = Math.round((left / budget) * bw);
          for (let i = 0; i < bw; i++) b.set(bx + i, H - 1, g.unicode ? (i < n ? '█' : '░') : i < n ? '#' : '.', i < n ? (left < 3 ? th.neg : left < 6 ? th.warn : th.accent) : th.line);
          b.text(bx + bw + 1, H - 1, `${left.toFixed(1)}s left`, th.muted);
        }
      };
    },
  },

  // ── flip clock ───────────────────────────────────────────────────────
  {
    id: 'progress-flip-clock', title: 'Split-Flap Clock', category: C, order: 40, kind: 'progress',
    description: 'A split-flap clock rolling over midnight on New Year\'s Eve — every flap falls at once and the date card turns over with them.',
    tags: ['flip clock', 'split flap', 'clock', 'midnight'], size: { w: 52, h: 7 }, minSize: { w: 20, h: 1 }, loop: 12, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const start = 24 * 3600 - 6;                          // 23:59:54
      const FLIP = 0.32;
      const face = mix(th.bg, th.panel2, 0.95), hinge = mix(th.bg, th.panel2, 0.45), ink = lift(th, th.ink, 0.3);
      const lit = (d, x, y) => y >= 1 && y <= 7 && x >= 1 && x <= 4 && FONT47[d][y - 1][x - 1] === '#';
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 12, 1);
        const sec = start + local, whole = Math.floor(sec), f = sec - whole;
        const at = (s) => { s %= 86400; return `${p2(s / 3600)}${p2((s % 3600) / 60)}${p2(s % 60)}`; };
        const cur = at(whole), prev = at(whole - 1);
        const nextDay = whole >= 86400;
        const date = nextDay ? 'FRI 01 JAN 2027' : 'THU 31 DEC 2026';
        const big = g.unicode && H >= 5 && W >= 47;
        if (!big && !g.unicode && H >= 6 && W >= 29) {
          const txt = `${cur.slice(0, 2)}:${cur.slice(2, 4)}:${cur.slice(4)}`;
          b.text(Math.floor((W - date.length) / 2), 0, date, nextDay ? th.accent : th.muted, undefined, ATTR.BOLD);
          bigText(b, Math.floor((W - bigWidth(txt, false, 1)) / 2), 1, txt, () => ink, false, { scale: 1 });
          return;
        }
        if (!big) {
          const txt = `${cur.slice(0, 2)}:${cur.slice(2, 4)}:${cur.slice(4)}`;
          b.text(Math.max(0, Math.floor((W - 8) / 2)), H >= 3 ? 1 : 0, txt, ink, undefined, ATTR.BOLD);
          if (H >= 3) b.text(Math.max(0, Math.floor((W - date.length) / 2)), 0, date, th.muted);
          return;
        }
        const cv = new Canvas(45, 5, { mode: 'half' });
        let x = 0;
        for (let i = 0; i < 6; i++) {
          const n = +cur[i], o = +prev[i];
          const flipping = n !== o && f < FLIP;
          const p = flipping ? f / FLIP : 1;
          for (let py = 0; py < 10; py++) for (let px = 0; px < 6; px++) {
            let d = n, yy = py, shade = 0;
            if (flipping) {
              if (py <= 4) {
                // Top half: new digit behind; the old top flap folds down toward the hinge.
                const hgt = p < 0.5 ? 5 * (1 - 2 * p) : 0;
                if (py >= 5 - hgt) { d = o; yy = Math.round(5 - (5 - py) * (5 / Math.max(0.01, hgt))); shade = 0.35 * p * 2; }
              } else {
                // Bottom half: old digit until the new flap swings down over it.
                const hgt = p >= 0.5 ? 5 * (2 * p - 1) : 0;
                if (py < 5 + hgt) { yy = Math.round(5 + (py - 5) * (5 / Math.max(0.01, hgt))); shade = 0.7 * (1 - p); } else d = o;
              }
            }
            const base = py === 4 ? hinge : face;
            const on = yy >= 0 && yy <= 9 && lit(d, px, yy);
            cv.set(x + px, py, mix(on ? ink : base, th.bg, shade));
          }
          x += 6;
          if (i % 2 === 0) x += 1;
          else if (i < 5) { cv.set(x + 1, 3, th.muted); cv.set(x + 1, 6, th.muted); x += 3; }
        }
        const x0 = Math.floor((W - 45) / 2);
        if (H >= 6) b.text(Math.floor((W - date.length) / 2), 0, date, nextDay ? th.accent : th.muted, undefined, ATTR.BOLD);
        cv.paint(b, x0, H >= 6 ? 1 : 0);
        if (H >= 7) b.text(Math.floor((W - 34) / 2), 6, truncate(`UTC  ${g.dot}  NTP synced, offset +0.4 ms`, W, g.ell), th.dim);
      };
    },
  },

  // ── sand timer (netplan try) ─────────────────────────────────────────
  {
    id: 'progress-sand-timer', title: 'netplan try', category: C, order: 50, kind: 'progress',
    description: 'netplan try\'s revert countdown beside a braille hourglass that really drains; some runs are confirmed in time, others revert.',
    tags: ['hourglass', 'netplan', 'revert', 'confirm', 'countdown'], size: { w: 80, h: 10 }, minSize: { w: 40, h: 2 }, loop: 14, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const timeout = 10, acceptAt = 6.3;
      const CW = 10, CH = 10, PW = CW * 2, PH = CH * 4, cx = PW / 2, cy = PH / 2;
      const half = (y) => 1 + 7.2 * Math.pow(Math.min(1, Math.abs(y + 0.5 - cy) / (cy - 3)), 0.85);
      const inside = (x, y) => y >= 3 && y < PH - 3 && Math.abs(x + 0.5 - cx) < half(y) - 0.6;
      const top = [], bot = [];
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        if (!inside(x, y)) continue;
        if (y + 0.5 < cy - 1) top.push([x, y]);
        else if (y + 0.5 > cy + 1) bot.push([x, y]);
      }
      // Top bulb drains from its surface, center first (a dip); bottom pile builds a mound.
      top.sort((a, c) => (a[1] + 0.35 * Math.abs(a[0] + 0.5 - cx)) - (c[1] + 0.35 * Math.abs(c[0] + 0.5 - cx)));
      bot.sort((a, c) => (c[1] - 0.6 * Math.abs(c[0] + 0.5 - cx)) - (a[1] - 0.6 * Math.abs(a[0] + 0.5 - cx)));
      const grains = Math.min(top.length, bot.length);
      const sand = mix(th.warn, 0xffd27a, 0.4);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local, k } = phase(t, 14, 1);
        const accept = k % 2 === 0;
        const stopAt = accept ? acceptAt : timeout;
        const el = Math.min(local, stopAt);
        const f = clamp01(el / timeout);
        const left = Math.ceil(timeout - el);
        const running = local < stopAt;
        const moved = Math.round(f * grains);
        const tx = H >= 6 && W >= 52 ? CW + 3 : 0;
        if (tx) {
          if (g.unicode) {
            const cv = new Canvas(CW, CH, { mode: 'braille', threshold: 0 });
            for (let x = 1; x < PW - 1; x++) { cv.set(x, 1, th.muted); cv.set(x, PH - 2, th.muted); }
            for (let y = 3; y < PH - 3; y++) { const h = half(y); cv.set(Math.round(cx - h - 0.5), y, th.line); cv.set(Math.round(cx + h - 0.5), y, th.line); }
            top.slice(Math.min(grains, moved)).forEach(([x, y]) => cv.set(x, y, sand));
            bot.slice(0, moved).forEach(([x, y]) => cv.set(x, y, sand));
            if (running && moved < grains) {
              const pile = bot[moved] ? bot[moved][1] : PH - 4;
              for (let y = Math.floor(cy - 1); y < pile; y++) if ((y + Math.floor(t * 20)) % 3) cv.set(Math.floor(cx) - (y % 2), y, sand);
            }
            cv.paint(b, 1, Math.max(0, Math.floor((H - CH) / 2)));
          } else {
            const art = ['+-----+', ' \\   / ', '  \\ /  ', '   |   ', '  / \\  ', ' /   \\ ', '+-----+'];
            const y0 = Math.max(0, Math.floor((H - 7) / 2));
            art.forEach((r, i) => b.text(2, y0 + i, r, th.line));
            const topCells = [[1, 3], [1, 2], [1, 4], [2, 3]];   // drain order: centre of the surface first
            const botCells = [[5, 3], [5, 2], [5, 4], [4, 3]];
            const q = Math.round(f * 4);
            topCells.slice(q).forEach(([r, c]) => b.text(2 + c, y0 + r, ':', sand));
            botCells.slice(0, q).forEach(([r, c]) => b.text(2 + c, y0 + r, ':', sand));
            if (running && q < 4) b.text(5, y0 + 3, Math.floor(t * 8) % 2 ? ':' : '.', sand);
          }
        }
        const lines = [
          [['$ ', th.dim], ['sudo netplan try --timeout 10', th.ink]],
          [['Do you want to keep these settings?', th.ink]],
          [['', th.ink]],
          [['Press ENTER before the timeout to accept the new configuration', th.ink]],
          [['', th.ink]],
          [['Changes will revert in ', th.ink], [String(left).padStart(3), left <= 3 ? th.neg : th.warn, ATTR.BOLD], [' seconds', th.ink]],
        ];
        if (!running) lines.push(accept ? [['Configuration accepted.', th.pos, ATTR.BOLD]] : [['Reverting.', th.neg, ATTR.BOLD]]);
        const shown = lines.slice(-H);
        const y0 = Math.max(0, Math.floor((H - shown.length) / 2));
        shown.forEach((r, i) => segs(b, tx, y0 + i, W - tx, r, g.ell));
      };
    },
  },

  // ── systemd timers ───────────────────────────────────────────────────
  {
    id: 'progress-systemd-timers', title: 'systemctl list-timers', category: C, order: 60, kind: 'progress',
    description: 'systemctl list-timers with LEFT counting down live; a timer that fires reschedules and re-sorts. Narrow terminals keep NEXT, LEFT, UNIT.',
    tags: ['systemd', 'timers', 'cron', 'schedule', 'linux'], size: { w: 146, h: 11 }, minSize: { w: 40, h: 3 }, loop: 20, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme;
      const now0 = Date.UTC(2026, 9, 13, 13, 59, 50);         // Tue 2026-10-13 13:59:50 UTC
      const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const stamp = (s) => {
        const d = new Date(now0 + s * 1000);
        return `${D[d.getUTCDay()]} ${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`;
      };
      // systemd's format_timestamp_relative: two most significant units.
      const rel = (s) => {
        s = Math.max(0, Math.floor(s));
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        if (s >= 2 * 86400) return `${d} days`;
        if (s >= 25 * 3600) return `${d} day ${h}h`;
        if (s >= 6 * 3600) return `${Math.floor(s / 3600)}h`;
        if (s >= 3600) return `${h}h ${m}min`;
        if (s >= 300) return `${m}min`;
        if (s >= 60) return `${m}min ${sec}s`;
        return `${sec}s`;
      };
      const units = [
        ['prism-healthcheck', 6, 9, 15], ['prism-metrics-flush', 14, 46, 60], ['apt-daily', 11533, 74820, 43200],
        ['logrotate', 36010, 50390, 86400], ['man-db', 41474, 50558, 86400], ['systemd-tmpfiles-clean', 86211, 429, 86400],
        ['fstrim', 471133, 132666, 604800],
      ].map(([name, next, ago, period]) => ({ unit: `${name}.timer`, act: `${name}.service`, next, last: -ago, period }));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 20, 1);
        const rows = units.map((u) => {
          let { next, last } = u;
          while (next <= local) { last = next; next += u.period; }
          return { ...u, next, last, fired: local - last < 1.2 && last >= 0 };
        }).sort((a, c) => a.next - c.next);
        const cells = rows.map((r) => [stamp(r.next), `${rel(Math.ceil(r.next - local))} left`, stamp(r.last), `${rel(local - r.last)} ago`, r.unit, r.act]);
        const head = ['NEXT', 'LEFT', 'LAST', 'PASSED', 'UNIT', 'ACTIVATES'];
        const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
        // Columns and formats are systemd's; a terminal too narrow for the full table keeps
        // NEXT, LEFT and UNIT, dropping ACTIVATES, then LAST, then PASSED, then NEXT.
        const keep = [0, 1, 2, 3, 4, 5];
        const total = () => keep.reduce((a, i) => a + widths[i], 0) + keep.length - 1;
        for (const i of [5, 2, 3, 0]) if (total() > W) keep.splice(keep.indexOf(i), 1);
        const line = (vals, y, color, attr, hl) => {
          let x = 0;
          keep.forEach((i) => {
            if (x >= W) return;
            const s = truncate(vals[i], Math.min(widths[i], W - x), '...');
            b.text(x, y, s, i === 1 && hl ? hl : color, undefined, attr);
            x += widths[i] + 1;
          });
        };
        line(head, 0, th.ink, ATTR.BOLD);
        const body = Math.min(rows.length, Math.max(0, H - 1));
        rows.slice(0, body).forEach((r, i) => line(cells[i], 1 + i, r.fired ? th.pos : th.ink, 0, r.next - local < 10 ? th.accent : null));
        if (H >= rows.length + 4) {
          b.text(0, rows.length + 2, `${rows.length} timers listed.`, th.ink);
          b.text(0, rows.length + 3, truncate('Pass --all to see loaded but inactive timers, too.', W, '...'), th.ink);
        }
      };
    },
  },
];
