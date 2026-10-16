// Toasts & Alerts: a sliding toast stack, alert banners, an incident banner,
// an on-call page with an ack countdown, and a deploy-succeeded celebration.
import { mix, scale } from '../../color.js';
import { glyphs, put, putR, clamp, smooth, safe, onFill, ATTR } from '../charts/_data.js';

const TOASTS = [
  ['pos', 'Deploy finished', 'checkout v2.14.2 is live on 12/12 hosts'],
  ['info', 'Backup complete', 'pg-orders snapshot 41.2 GB in 3m 12s'],
  ['warn', 'High latency', 'search p95 at 812 ms (SLO 500 ms)'],
  ['neg', 'Job failed', 'nightly-reindex exited 137 (OOM killed)'],
  ['info', 'Scaled out', 'catalog 6 → 9 replicas (cpu 78%)'],
  ['pos', 'Certificate renewed', 'payments client cert valid 365 days'],
];

const toastStack = {
  id: 'status-toast-stack',
  title: 'Toast Stack',
  category: 'Toasts & Alerts',
  description: 'Notifications slide in from the right, stack, push older ones down and dismiss themselves with a draining timer line.',
  tags: ['toast', 'notification', 'snackbar', 'stack', 'slide in'],
  kind: 'widget',
  size: { w: 50, h: 15 },
  minSize: { w: 30, h: 5 },
  loop: 13.2,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const EVERY = 2.2, LIFE = 6.4, TW = Math.min(W, 44), TH = 4;
    const icon = { pos: g.check, info: g.info, warn: g.warn, neg: g.cross };
    return (t) => {
      const n = Math.floor(t / EVERY);
      const live = [];
      for (let i = n; i >= 0 && i > n - 5; i--) {
        const age = t - i * EVERY;
        if (age < 0 || age > LIFE) continue;
        live.push({ i, age });
      }
      let y = 0;
      for (const { i, age } of live) {
        if (y + TH > H) break;
        const [tone, title, msg] = TOASTS[i % TOASTS.length];
        const c = th[tone];
        const inK = smooth(clamp(age / 0.45, 0, 1)), outK = smooth(clamp((LIFE - age) / 0.45, 0, 1));
        const x = W - TW + Math.round((1 - Math.min(inK, outK)) * (TW + 2));
        const bg = mix(th.bg, th.panel, 0.9);
        for (let yy = 0; yy < TH - 1; yy++) for (let xx = 0; xx < TW; xx++) b.set(x + xx, y + yy, ' ', undefined, bg);
        for (let yy = 0; yy < TH - 1; yy++) b.set(x, y + yy, g.u ? '▌' : '|', c, bg);
        b.set(x + 2, y, icon[tone], c, bg, ATTR.BOLD);
        b.text(x + 4, y, title, th.ink, bg, ATTR.BOLD);
        b.text(x + TW - 2, y, g.u ? '×' : 'x', th.dim, bg);
        put(b, x + 4, y + 1, msg, TW - 6, th.muted, bg);
        const left = clamp(1 - age / LIFE, 0, 1);
        const lw = Math.round(left * (TW - 1));
        for (let k = 1; k < TW; k++) b.set(x + k, y + 2, g.u ? '━' : '-', k <= lw ? scale(c, 0.85) : mix(bg, th.line, 0.5), bg);
        y += TH;
      }
    };
  },
};

const BANNERS = [
  ['info', 'Heads up', 'pg-orders maintenance tonight 02:00–02:30 UTC.'],
  ['pos', 'Resolved', 'Checkout latency is back to normal.'],
  ['warn', 'Degraded', 'Search is slower than usual (p95 1.8 s).'],
  ['neg', 'Outage', 'Payments failing in eu-west-1 — team engaged.'],
];

const alertBanners = {
  id: 'status-alert-banners',
  title: 'Alert Banners',
  category: 'Toasts & Alerts',
  description: 'Info, success, warning and error banners with accent rails, icons and dismiss marks; the newest one pulses for attention.',
  tags: ['alert', 'banner', 'callout', 'severity', 'message'],
  kind: 'widget',
  size: { w: 72, h: 8 },
  minSize: { w: 30, h: 4 },
  loop: 8,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const icon = { pos: g.check, info: g.info, warn: g.warn, neg: g.cross };
    const step = H >= 8 ? 2 : 1;
    const rows = Math.min(BANNERS.length, Math.floor(H / step));
    return (t) => {
      const hot = Math.floor(t / 2) % rows;
      for (let r = 0; r < rows; r++) {
        const [tone, title, msg] = BANNERS[r];
        const c = th[tone], y = r * step;
        const pulse = r === hot ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
        const bg = mix(th.bg, c, 0.16 + 0.1 * pulse);
        for (let x = 0; x < W; x++) b.set(x, y, ' ', undefined, bg);
        b.set(0, y, g.u ? '▌' : '|', c, bg);
        b.set(2, y, icon[tone], c, bg, ATTR.BOLD);
        const x = b.text(4, y, title, c, bg, ATTR.BOLD);
        put(b, x + 2, y, msg, W - x - 6, th.ink, bg);
        b.text(W - 2, y, g.u ? '×' : 'x', th.muted, bg);
      }
    };
  },
};

const incident = {
  id: 'status-incident-banner',
  title: 'Incident Banner',
  category: 'Toasts & Alerts',
  description: 'A pulsing SEV1 banner with a live elapsed timer, affected-service chips, the incident commander and the bridge link.',
  tags: ['incident', 'sev1', 'outage', 'banner', 'on-call'],
  kind: 'widget',
  size: { w: 72, h: 5 },
  minSize: { w: 34, h: 2 },
  loop: 10,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const svcs = ['checkout', 'payments', 'orders'];
    return (t) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.5);
      const bg = mix(th.bg, th.neg, 0.22 + 0.18 * pulse);
      const rows = Math.min(H, 3);
      for (let y = 0; y < rows; y++) for (let x = 0; x < W; x++) b.set(x, y, ' ', undefined, y === 0 ? bg : mix(th.bg, th.neg, 0.1));
      const secs = 754 + Math.floor(t);
      const timer = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      let x = b.text(1, 0, ` SEV1 `, onFill(th, th.neg), th.neg, ATTR.BOLD);
      x = b.text(x + 1, 0, `${g.dot} INCIDENT  Checkout failing for some customers`, th.ink, bg, ATTR.BOLD);
      putR(b, W - 1, 0, `elapsed ${timer}`, th.ink, bg, ATTR.BOLD);
      if (rows >= 2) {
        let cx = b.text(1, 1, 'affected', th.muted, mix(th.bg, th.neg, 0.1));
        for (const s of svcs) cx = b.text(cx + 1, 1, ` ${s} `, th.ink, mix(th.bg, th.neg, 0.35));
        if (W >= 60) putR(b, W - 1, 1, 'IC: @riley · comms: @sam', th.muted, mix(th.bg, th.neg, 0.1));
      }
      if (rows >= 3) {
        put(b, 1, 2, `bridge: https://status.example/inc/2471 · updates every 15 min · next in ${String(15 - (Math.floor(t / 4) % 15)).padStart(2)} min`, W - 2, th.dim, mix(th.bg, th.neg, 0.1));
      }
      if (H >= 5) {
        const updates = ['14:02 identified: connection pool exhaustion after v2.14.1', '14:09 mitigating: pool resized 20 → 40, recovering'];
        updates.forEach((u, i) => { if (3 + i < H) put(b, 1, 3 + i, `${g.bullet} ${u}`, W - 2, i === updates.length - 1 && Math.floor(t * 2) % 2 ? th.ink : th.muted); });
      }
    };
  },
};

const pager = {
  id: 'status-oncall-pager',
  title: 'On-call Page',
  category: 'Toasts & Alerts',
  description: 'An incoming page: the alert, its context, ringing indicator and an acknowledge countdown that escalates when it runs out.',
  tags: ['pager', 'on-call', 'alert', 'acknowledge', 'escalation'],
  kind: 'widget',
  size: { w: 56, h: 9 },
  minSize: { w: 34, h: 6 },
  loop: 12,
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    return (t) => {
      const cycle = t % 12, left = Math.max(0, 10 - cycle), escalated = left <= 0;
      const ring = Math.floor(t * 3) % 2 === 0;
      const c = escalated ? th.crit : th.neg;
      const w = Math.min(W, 54), x0 = Math.floor((W - w) / 2);
      const bg = mix(th.bg, th.panel, 0.95);
      for (let y = 0; y < Math.min(H, 8); y++) for (let x = 0; x < w; x++) b.set(x0 + x, y, ' ', undefined, bg);
      b.text(x0 + 1, 0, ring ? (g.u ? '◉' : '*') : (g.u ? '○' : ' '), c, bg, ATTR.BOLD);
      b.text(x0 + 3, 0, escalated ? 'ESCALATED to secondary' : 'PAGE · high urgency', c, bg, ATTR.BOLD);
      putR(b, x0 + w - 1, 0, '14:02:11', th.dim, bg);
      put(b, x0 + 1, 2, 'checkout p95 > 1s for 5 minutes', w - 2, th.ink, bg, ATTR.BOLD);
      put(b, x0 + 1, 3, 'service checkout · env prod · region us-east-1', w - 2, th.muted, bg);
      put(b, x0 + 1, 4, 'runbook: wiki.example/runbooks/checkout-latency', w - 2, th.info, bg);
      if (H >= 7) {
        const bw = w - 14;
        const fill = Math.round((left / 10) * bw);
        b.text(x0 + 1, 6, escalated ? 'ack window' : `ack in ${left.toFixed(0).padStart(2)}s`, th.muted, bg);
        for (let k = 0; k < bw; k++) b.set(x0 + 12 + k, 6, k < fill ? (g.u ? '█' : '#') : (g.u ? '░' : '.'), k < fill ? mix(th.warn, th.neg, 1 - left / 10) : th.line, bg);
      }
      if (H >= 8) {
        b.text(x0 + 1, 7, ' [a] Acknowledge ', th.bg, th.pos, ATTR.BOLD);
        b.text(x0 + 20, 7, ' [e] Escalate ', th.ink, mix(th.bg, th.line, 0.8));
      }
    };
  },
};

const deploy = {
  id: 'status-deploy-success',
  title: 'Deploy Succeeded',
  category: 'Toasts & Alerts',
  description: 'The good-news moment: rollout dots fill host by host, the check lands, confetti falls and the summary — version, hosts, duration — settles in.',
  tags: ['deploy', 'success', 'celebration', 'confetti', 'release'],
  kind: 'widget',
  size: { w: 60, h: 12 },
  minSize: { w: 30, h: 6 },
  loop: 9,
  order: 50,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const colors = [th.accent, th.pos, th.warn, th.crit, th.info, th.neg];
    const bits = Array.from({ length: Math.round(W * H * 0.12) }, () => ({ x: ctx.rng() * W, v: 2 + ctx.rng() * 5, ph: ctx.rng() * 6.28, c: colors[Math.floor(ctx.rng() * colors.length)], ch: ctx.rng.pick(g.u ? ['▪', '•', '◆', '▴', '✦', '·'] : ['*', '+', 'o', '.', '`']) }));
    return (t) => {
      const cyc = t % 9;
      const hosts = 12, done = Math.min(hosts, Math.floor(cyc / 0.22));
      const cx = Math.floor(W / 2);
      if (cyc < hosts * 0.22 + 0.3) {
        const label = `rolling out checkout v2.14.2  ${done}/${hosts}`;
        b.text(Math.max(0, cx - Math.floor(label.length / 2)), Math.floor(H / 2) - 1, label, th.muted);
        let x = cx - hosts;
        for (let i = 0; i < hosts; i++) { b.set(x, Math.floor(H / 2) + 1, i < done ? g.dot : g.ring, i < done ? th.pos : th.line); x += 2; }
        return;
      }
      const k = cyc - (hosts * 0.22 + 0.3);
      for (const p of bits) {
        const y = (k * p.v + p.ph) % (H + 2) - 1;
        const x = Math.round(p.x + Math.sin(k * 2 + p.ph) * 1.5);
        if (y >= 0) b.set(x, Math.floor(y), p.ch, p.c);
      }
      const mid = Math.floor(H / 2) - 1;
      const pop = smooth(clamp(k / 0.35, 0, 1));
      const msg = `${g.check}  Deploy succeeded`;
      b.text(cx - Math.floor(msg.length / 2), mid, msg, pop > 0.5 ? th.pos : th.dim, undefined, ATTR.BOLD);
      if (H >= 6 && k > 0.4) put(b, Math.max(0, cx - 21), mid + 2, 'checkout v2.14.2 · 12/12 hosts healthy · 2m 41s', W, th.ink);
      if (H >= 8 && k > 0.8) put(b, Math.max(0, cx - 21), mid + 3, 'error rate 0.02% · p95 212 ms · no rollbacks', W, th.muted);
    };
  },
};

export default [toastStack, alertBanners, incident, pager, deploy];
