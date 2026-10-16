// Health & Uptime: live health checks, a 90-day uptime history with SLO
// budget, a services × regions status matrix and a heartbeat monitor.
import { mix } from '../../color.js';
import { rng } from '../../easing.js';
import { signal, glyphs, put, putR, safe, clamp, light, VBLOCKS, ATTR } from '../charts/_data.js';

const CHECKS = [
  ['api-gateway', 'GET /healthz', 18],
  ['auth', 'GET /v1/ping', 24],
  ['checkout', 'GET /ready', 41],
  ['payments', 'TCP 10.20.4.12:8443', 35],
  ['search', 'GET /_cluster/health', 62],
  ['postgres', 'SELECT 1', 3],
  ['redis', 'PING', 1],
  ['kafka', 'metadata', 9],
];

const healthChecks = {
  id: 'status-health-checks',
  title: 'Health Checks',
  category: 'Health & Uptime',
  description: 'Service health checks re-running in a sweep: live status dots and words, latency, last-checked age and a latency trail per row.',
  tags: ['health check', 'status dot', 'monitoring', 'latency', 'probe'],
  kind: 'widget',
  size: { w: 76, h: 10 },
  minSize: { w: 36, h: 4 },
  loop: 16,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const PERIOD = 4;
    const lat = CHECKS.map(([, , base], i) => signal(ctx, { seed: 200 + i, base, amp: base * 0.3, rate: 1 / PERIOD, spike: base * 0.8, min: 0.5 }));
    const showTrail = W >= 64, showEp = W >= 54;
    const rows = Math.min(CHECKS.length, H - 1);
    // The search cluster degrades and goes down mid-loop, then recovers.
    const verdict = (i, k) => {
      const lt = (k * PERIOD) % 16;
      if (CHECKS[i][0] === 'search') return lt >= 6 && lt < 10 ? 'down' : lt >= 4 && lt < 12 ? 'degraded' : 'ok';
      const v = lat[i].at(k);
      return v > CHECKS[i][2] * 2.1 ? 'degraded' : 'ok';
    };
    const look = { ok: [th.pos, 'OK'], degraded: [th.warn, 'DEGRADED'], down: [th.neg, 'DOWN'] };
    return (t) => {
      const cols = showEp ? [0, 14, 37, 49, 58] : [0, 13, 0, 25, 31];
      b.text(cols[0] + 2, 0, 'SERVICE', th.dim, undefined, ATTR.BOLD);
      if (showEp) b.text(cols[1], 0, 'CHECK', th.dim, undefined, ATTR.BOLD);
      b.text(showEp ? cols[2] : cols[1], 0, 'STATUS', th.dim, undefined, ATTR.BOLD);
      b.text(cols[3], 0, 'LATENCY', th.dim, undefined, ATTR.BOLD);
      if (W >= 40) b.text(cols[4], 0, 'AGE', th.dim, undefined, ATTR.BOLD);
      for (let i = 0; i < rows; i++) {
        const y = i + 1;
        // Rows are probed in a staggered sweep, PERIOD seconds apart.
        const phase = t / PERIOD - i / CHECKS.length;
        const k = Math.floor(phase), since = (phase - k) * PERIOD;
        const checking = since < 0.35;
        const v = verdict(i, k);
        const [c, word] = look[v];
        const pulse = v === 'ok' ? 0.75 + 0.25 * Math.sin(t * 3 + i) : 0.5 + 0.5 * Math.sin(t * 7);
        b.set(0, y, checking ? (g.u ? '◌' : '.') : g.dot, checking ? th.dim : mix(th.bg, c, 0.35 + 0.65 * pulse), undefined, ATTR.BOLD);
        put(b, 2, y, CHECKS[i][0], (showEp ? cols[1] : cols[1]) - 3, th.ink);
        if (showEp) put(b, cols[1], y, CHECKS[i][1], cols[2] - cols[1] - 1, th.muted);
        const sx = showEp ? cols[2] : cols[1];
        if (checking) b.text(sx, y, 'checking', th.dim);
        else b.text(sx, y, word, c, v === 'ok' ? undefined : mix(th.bg, c, 0.15), ATTR.BOLD);
        const ms = v === 'down' ? null : lat[i].at(k) * (v === 'degraded' && CHECKS[i][0] === 'search' ? 9 : 1);
        b.text(cols[3], y, ms == null ? 'timeout' : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`.padStart(7), ms == null ? th.neg : ms > CHECKS[i][2] * 2 ? th.warn : th.ink);
        if (W >= 40) b.text(cols[4], y, checking ? '  now' : `${Math.floor(since)}s ago`.padStart(5), th.dim);
        if (showTrail) {
          const tx = cols[4] + 7, n = W - tx;
          let hi = 0, lo = Infinity;
          const vals = [];
          for (let j = 0; j < n; j++) { const kk = k - n + 1 + j; const vv = verdict(i, kk) === 'down' ? -1 : lat[i].at(kk); vals.push(vv); if (vv >= 0) { hi = Math.max(hi, vv); lo = Math.min(lo, vv); } }
          vals.forEach((vv, j) => {
            if (vv < 0) { b.set(tx + j, y, g.u ? '▁' : '_', th.neg); return; }
            const lvl = clamp(1 + Math.round(((vv - lo) / (hi - lo || 1)) * 7), 1, 8);
            b.set(tx + j, y, g.u ? VBLOCKS[lvl] : '.:-=+*#@'[lvl - 1], vv > CHECKS[i][2] * 2 ? th.warn : mix(th.dim, th.pos, 0.6));
          });
        }
      }
    };
  },
};

const SERVICES = [['API', 0.9995], ['Checkout', 0.999], ['Payments', 0.9995], ['Search', 0.995], ['Webhooks', 0.999]];
const MONTHS = [['Jun', 30], ['Jul', 31], ['Aug', 31], ['Sep', 30], ['Oct', 31]];
/** Calendar date `n` days before Oct 13 (the fictional today). */
function dateOf(n) {
  let m = 4, d = 13 - n;
  while (d <= 0) { m--; d += MONTHS[m][1]; }
  return `${MONTHS[m][0]} ${String(d).padStart(2)}`;
}

const uptime = {
  id: 'status-uptime-slo',
  title: 'Uptime & SLO',
  category: 'Health & Uptime',
  description: 'A status-page uptime history: 90 daily bars per service, uptime against its SLO, the error budget left and a cursor reading each day.',
  tags: ['uptime', 'slo', 'error budget', 'status page', 'history'],
  kind: 'widget',
  size: { w: 80, h: 13 },
  minSize: { w: 40, h: 4 },
  loop: 18,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const nameW = W >= 60 ? 10 : 9, statW = W >= 60 ? 16 : 8;
    const days = Math.max(10, Math.min(90, W - nameW - statW));
    // Per-day downtime minutes, mostly zero with a few incidents.
    const hist = SERVICES.map((_, si) => {
      const r = rng(9100 + si * 31);
      return Array.from({ length: 90 }, () => { const p = r(); return p > 0.985 ? r.int(40, 180) : p > 0.94 ? r.int(2, 30) : 0; });
    });
    hist[3][86] = 95; hist[1][61] = 22;
    const step = H >= 13 ? 2 : 1;
    const rows = Math.min(SERVICES.length, Math.floor((H - (H >= 6 ? 2 : 0)) / step));
    const dayColor = (m) => (m === 0 ? th.pos : m < 15 ? mix(th.pos, th.warn, 0.7) : m < 60 ? th.warn : th.neg);
    const dayGlyph = (m) => (g.u ? (m === 0 ? '█' : m < 15 ? '▇' : m < 60 ? '▆' : '▅') : m === 0 ? '#' : m < 60 ? '=' : '_');
    return (t) => {
      const cursor = Math.floor(((t % 18) / 18) * days);
      for (let r = 0; r < rows; r++) {
        const [name, slo] = SERVICES[r], y = r * step;
        const d = hist[r].slice(90 - days);
        const down = hist[r].reduce((a, m) => a + m, 0);
        const up = 1 - down / (90 * 1440);
        put(b, 0, y, name, nameW - 1, th.ink, undefined, ATTR.BOLD);
        for (let i = 0; i < days; i++) {
          const m = d[i];
          const hot = i === cursor;
          b.set(nameW + i, y, dayGlyph(m), hot ? th.ink : dayColor(m), hot ? mix(th.bg, th.ink, 0.25) : undefined);
        }
        const budget = clamp(1 - (1 - up) / (1 - slo), -1, 1);
        const ok = up >= slo;
        if (statW >= 16) {
          b.text(nameW + days + 1, y, `${(up * 100).toFixed(up > 0.9999 ? 3 : 2)}%`, ok ? th.pos : th.neg, undefined, ATTR.BOLD);
          putR(b, W, y, `${budget >= 0 ? Math.round(budget * 100) : 0}% left`, budget > 0.25 ? th.muted : th.neg);
        } else b.text(nameW + days + 1, y, `${(up * 100).toFixed(1)}`, ok ? th.pos : th.neg);
        if (step === 2 && W >= 60) {
          const bw = Math.min(days, 40);
          const fill = Math.round(clamp(budget, 0, 1) * bw);
          b.text(nameW, y + 1, `SLO ${(slo * 100).toFixed(slo >= 0.999 ? 2 : 1)}%`, th.dim);
          for (let k = 0; k < bw; k++) b.set(nameW + 12 + k, y + 1, g.u ? '━' : '-', k < fill ? (budget > 0.25 ? mix(th.bg, th.accent, 0.7) : th.neg) : mix(th.bg, th.line, 0.6));
          b.text(nameW + 13 + bw, y + 1, 'error budget', th.dim);
        }
      }
      if (H >= 6) {
        const y = rows * step;
        b.text(nameW, y, `${days} days ago`, th.dim);
        putR(b, nameW + days, y, 'today', th.dim);
        const daysAgo = days - 1 - cursor;
        const date = daysAgo === 0 ? 'Today' : dateOf(daysAgo);
        const worst = SERVICES.map((s, i) => [s[0], hist[i][90 - days + cursor]]).sort((a, c) => c[1] - a[1])[0];
        const note = worst[1] ? `${date}: ${worst[0]} ${worst[1]} min down` : `${date}: no downtime`;
        put(b, nameW, y + 1, `${g.arrowR} ${note}`, W - nameW, worst[1] ? dayColor(worst[1]) : th.muted);
      }
    };
  },
};

const MSVCS = ['api', 'auth', 'checkout', 'payments', 'search', 'cdn', 'email', 'kafka'];
const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-north-1', 'ap-south-1', 'ap-east-1'];

const matrix = {
  id: 'status-service-matrix',
  title: 'Service Matrix',
  category: 'Health & Uptime',
  description: 'Services by region as a status grid: an incident starts in one cell, spreads to its neighbors, then heals, with words, not just color.',
  tags: ['status matrix', 'regions', 'services', 'incident', 'grid'],
  kind: 'widget',
  size: { w: 80, h: 11 },
  minSize: { w: 44, h: 5 },
  loop: 16,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const nameW = 10;
    const cw = Math.max(5, Math.min(12, Math.floor((W - nameW) / REGIONS.length)));
    const nR = Math.min(REGIONS.length, Math.floor((W - nameW) / cw));
    const nS = Math.min(MSVCS.length, H - (H >= 7 ? 2 : 1));
    // Incident epicentre: payments × eu-west-1, plus a scheduled maintenance cell.
    const E = [3, 2];
    const state = (s, r, lt) => {
      if (s === 6 && r === 4) return 'maint';
      const d = Math.abs(s - E[0]) + Math.abs(r - E[1]);
      const onset = 2 + d * 1.1, heal = 11 - d * 0.6;
      if (lt < onset || lt > heal) return 'ok';
      if (d === 0 && lt > onset + 1.5 && lt < heal - 1.5) return 'down';
      return d <= 2 ? 'degraded' : 'ok';
    };
    const look = { ok: [th.pos, 'ok'], degraded: [th.warn, 'degr'], down: [th.neg, 'down'], maint: [th.info, 'maint'] };
    return (t) => {
      const lt = t % 16;
      for (let r = 0; r < nR; r++) put(b, nameW + r * cw, 0, cw >= 11 ? REGIONS[r] : REGIONS[r].replace(/-(\w+)-/, (m, a) => a[0]).slice(0, cw - 1), cw - 1, th.muted, undefined, ATTR.BOLD);
      const tally = { ok: 0, degraded: 0, down: 0, maint: 0 };
      for (let s = 0; s < nS; s++) {
        const y = s + 1;
        put(b, 0, y, MSVCS[s], nameW - 1, th.ink);
        for (let r = 0; r < nR; r++) {
          const st = state(s, r, lt), prev = state(s, r, lt - 0.4);
          tally[st]++;
          const [c, word] = look[st];
          const flash = st !== prev;
          const bg = flash ? mix(th.bg, c, 0.45) : st === 'ok' ? undefined : mix(th.bg, c, 0.16);
          const x = nameW + r * cw;
          if (bg) for (let k = 0; k < cw - 1; k++) b.set(x + k, y, ' ', undefined, bg);
          const pulse = st === 'down' ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
          b.set(x, y, st === 'maint' ? (g.u ? '◆' : '#') : g.dot, mix(th.bg, c, 0.4 + 0.6 * pulse), bg);
          if (cw >= 7) b.text(x + 2, y, word, st === 'ok' ? th.muted : c, bg, st === 'ok' ? 0 : ATTR.BOLD);
        }
      }
      if (H >= 7) {
        const y = nS + 1;
        let x = 0;
        for (const k of ['ok', 'degraded', 'down', 'maint']) {
          const [c] = look[k];
          b.set(x, y, k === 'maint' ? (g.u ? '◆' : '#') : g.dot, c);
          x = b.text(x + 2, y, `${tally[k]} ${k}`, k === 'ok' ? th.muted : c) + 2;
        }
        const note = tally.down ? 'INC-2471 payments eu-west-1' : tally.degraded ? 'recovering' : 'all systems normal';
        if (x + note.length <= W) putR(b, W, y, note, tally.down ? th.neg : tally.degraded ? th.warn : th.pos);
      }
    };
  },
};

const heartbeat = {
  id: 'status-heartbeat',
  title: 'Heartbeat Monitor',
  category: 'Health & Uptime',
  description: 'A cron and worker heartbeat monitor drawn as an ECG trace: each check-in is a beat, missed beats flatline red and raise the alarm.',
  tags: ['heartbeat', 'ecg', 'monitor', 'dead man switch', 'braille'],
  kind: 'widget',
  size: { w: 72, h: 9 },
  minSize: { w: 30, h: 4 },
  loop: 24,
  canvas: 'line',
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const head = 1, foot = H >= 6 ? 1 : 0;
    const rows = H - head - foot;
    const cv = ctx.canvas('line', { cols: W, rows });
    const PERIOD = 0.8;
    // Beats 20..22 of every 30 go missing: the worker stalls, then resumes.
    const missed = (k) => { const m = ((k % 30) + 30) % 30; return m >= 20 && m <= 22; };
    const wave = (u) => {
      // One PQRST complex over u in [0,1).
      const gb = (c, w, a) => a * Math.exp(-(((u - c) / w) ** 2));
      return gb(0.18, 0.04, 0.12) - gb(0.36, 0.015, 0.18) + gb(0.4, 0.018, 1) - gb(0.44, 0.02, 0.3) + gb(0.68, 0.06, 0.22);
    };
    return (t) => {
      cv.clear();
      const span = 6; // seconds across the screen
      const mid = cv.height * 0.62, amp = cv.height * 0.55;
      let px = null;
      for (let x = 0; x < cv.width; x++) {
        const ts = t - span + (x / cv.width) * span;
        const k = Math.floor(ts / PERIOD), u = ts / PERIOD - k;
        const miss = missed(k);
        const y = mid - (miss ? 0 : wave(u) * amp);
        const fade = 0.45 + 0.55 * (x / cv.width);
        const c = miss ? mix(th.bg, th.neg, fade) : mix(th.bg, th.pos, fade);
        if (px) cv.line(px[0], px[1], x, y, c); else cv.set(x, y, c);
        px = [x, y];
      }
      cv.set(cv.width - 1, px[1], light(th));
      cv.paint(b, 0, head);
      const k = Math.floor(t / PERIOD);
      let last = k; while (missed(last) && last > k - 20) last--;
      const ago = t - (last * PERIOD + 0.4 * PERIOD);
      const alarm = missed(k) && ago > PERIOD * 1.5;
      let x = b.text(0, 0, 'billing-worker', th.ink, undefined, ATTR.BOLD);
      x = b.text(x + 1, 0, alarm ? ' MISSED ' : ' ALIVE ', th.bg, alarm ? (Math.floor(t * 4) % 2 ? th.neg : th.crit) : th.pos, ATTR.BOLD);
      if (W >= 44) putR(b, W, 0, `every 0.8s · last beat ${Math.max(0, ago).toFixed(1)}s ago`, alarm ? th.neg : th.muted);
      if (foot) {
        const lost = [...Array(15)].reduce((a, _, i) => a + (missed(k - i) ? 1 : 0), 0);
        put(b, 0, H - 1, `${15 - lost}/15 check-ins in the last 12 s · ${lost} missed · alert after 2`, W, lost ? th.warn : th.dim);
      }
    };
  },
};

export default [healthChecks, uptime, matrix, heartbeat];
