// Steps & pipelines — multi-part work as the real tools print it.
//
// Every number agrees with every other: bytes done never exceed totals, counts
// match the lines on screen, percentages are floor(done/total), and finished
// states hold until the loop restarts.
import { ATTR } from '../../buffer.js';
import { rgb } from '../../color.js';
import { stringWidth, truncate } from '../../width.js';
import { phase, transfer, glyphs, bytes, clock, commas, clamp01 } from './_sim.js';
import { segs, visible } from './_log.js';

const C = 'Steps & Pipelines';
const pct = (f) => `${String(Math.floor(clamp01(f) * 100)).padStart(3)}%`;
const hex = (rng, n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
const spinAt = (t, u) => (u ? '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' : '-\\|/')[Math.floor(t * 12) % (u ? 10 : 4)];
/** Docker / go-units HumanSize: decimal units, 4 significant digits ("5.243MB"). */
const human = (n) => {
  const u = ['B', 'kB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${Number(n.toPrecision(4))}${u[i]}`;
};

export default [
  // ── parallel downloads ───────────────────────────────────────────────
  {
    id: 'progress-multi-bar', title: 'Parallel Downloads', category: C, order: 10, kind: 'progress',
    description: 'Six downloads sharing one link, each with its own bar and rate, plus a total line whose bytes, rate and ETA add up.',
    tags: ['multi', 'parallel', 'downloads', 'total'], size: { w: 76, h: 8 }, minSize: { w: 36, h: 3 }, loop: 10, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const files = [
        ['base-image.tar.zst', 48.2], ['models/encoder.bin', 31.6], ['assets.pak', 12.9],
        ['locale-pack.tar', 6.4], ['docs.zip', 3.1], ['checksums.txt', 0.004],
      ].map(([name, mib], i) => {
        const total = mib * 1048576, start = i * 0.35, secs = 0.3 + mib / 7 + ctx.rng() * 0.8;
        return { name, total, start, secs, sim: transfer(ctx.rng, { total, seconds: secs, burst: 0.6 }) };
      });
      const grand = files.reduce((n, f) => n + f.total, 0);
      const lastEnd = files.reduce((m, f) => Math.max(m, f.start + f.secs), 0);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const gap = H >= 5 ? 1 : 0;
        const rows = Math.max(1, Math.min(files.length, H - 1 - gap));
        const nameW = W >= 60 ? 20 : 12;
        const tail = W >= 64 ? 15 : 5;
        const bw = Math.max(6, W - 3 - nameW - tail);
        let doneAll = 0, rateAll = 0, allDone = true;
        files.forEach((f, i) => {
          const s = f.sim.at(Math.max(0, local - f.start));
          doneAll += s.done;
          if (!s.finished) allDone = false;
          if (!s.finished && local >= f.start) rateAll += s.smooth;
          if (i >= rows) return;
          b.text(1, i, truncate(f.name, nameW - 1, g.ell), s.finished ? th.muted : th.ink);
          const n = s.frac * bw, full = Math.floor(n);
          for (let k = 0; k < bw; k++) {
            const lit = k < full || s.finished;
            const head = !s.finished && k === full && n - full >= 0.5;
            b.set(1 + nameW + k, i, g.unicode ? (head ? '╸' : '━') : (lit || head ? '=' : '-'), s.finished ? th.pos : lit || head ? th.accent : th.line);
          }
          const tx = 2 + nameW + bw;
          if (s.finished) b.text(tx, i, tail > 5 ? `${g.ok} ${bytes(f.total, { digits: 1 })}` : ` ${g.ok}`, th.pos);
          else if (local < f.start) b.text(tx, i, tail > 5 ? 'queued' : ' ...', th.dim);
          else b.text(tx, i, tail > 5 ? `${pct(s.frac)} ${bytes(s.smooth, { digits: 1 })}/s`.slice(0, tail) : pct(s.frac), th.muted);
        });
        if (H >= 2) {
          const y = Math.min(H - 1, rows + gap);
          const eta = rateAll > 0 ? (grand - doneAll) / rateAll : 0;
          const wide = W >= 56;
          const doneTxt = wide ? `${bytes(allDone ? grand : doneAll, { digits: 1 })} / ${bytes(grand, { digits: 1 })}` : `${((allDone ? grand : doneAll) / 1048576).toFixed(1)}/${(grand / 1048576).toFixed(1)} MiB`;
          segs(b, 1, y, W - 2, [
            ['total ', th.ink, ATTR.BOLD],
            [doneTxt, th.ink],
            [` ${wide ? ' ' : ''}${allDone ? '100%' : pct(doneAll / grand).trim()}`, th.accent],
            allDone ? [wide ? `  ${g.ok} ${files.length} files in ${lastEnd.toFixed(1)}s` : ` ${g.ok}`, th.pos]
              : [wide ? `  ${bytes(rateAll, { digits: 1 })}/s  eta ${clock(eta, { short: true })}` : ` eta ${clock(eta, { short: true })}`, th.muted],
          ], g.ell);
        }
      };
    },
  },

  // ── docker pull ──────────────────────────────────────────────────────
  {
    id: 'progress-docker-pull', title: 'docker pull', category: C, order: 20, kind: 'progress',
    description: 'Layers going Waiting → Downloading → Extracting → Pull complete, three at a time; like docker, bars only show past 110 columns.',
    tags: ['docker', 'container', 'layers', 'pull'], size: { w: 112, h: 11 }, minSize: { w: 44, h: 4 }, loop: 14, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme;
      const layers = [29.13, 0, 41.02, 9.81, 3.27, 0.82, 0.12].map((mb) => ({ id: hex(ctx.rng, 12), cached: mb === 0, total: mb * 1e6 }));
      // At most three concurrent downloads; extraction is strictly in layer order.
      const slots = [0.5, 0.5, 0.5];
      for (const L of layers) {
        if (L.cached) continue;
        const s = slots.indexOf(Math.min(...slots));
        L.dlStart = slots[s];
        L.dlSecs = 0.6 + L.total / 7.5e6;
        L.dlEnd = L.dlStart + L.dlSecs;
        L.sim = transfer(ctx.rng, { total: L.total, seconds: L.dlSecs, burst: 0.5 });
        slots[s] = L.dlEnd + 0.1;
      }
      let prevEx = 0;
      for (const L of layers) {
        if (L.cached) continue;
        L.exStart = Math.max(L.dlEnd + 0.3, prevEx);
        L.exSecs = 0.35 + L.total / 22e6;
        prevEx = L.exStart + L.exSecs;
      }
      const finished = prevEx + 0.2;
      const digest = hex(ctx.rng, 64);
      const image = 'registry.example.net/prism/demo:1.4.2';
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 14, 1);
        // jsonmessage only draws its 50-column bar when the terminal is wider than 110.
        const bar = (f) => {
          if (W <= 110) return '';
          const p = Math.min(50, Math.floor(f * 100) >> 1);
          return `[${'='.repeat(p)}>${' '.repeat(Math.max(0, 50 - p))}] `;
        };
        const nums = (cur, tot) => `${human(cur).padStart(8)}/${human(tot)}`;
        const rows = [[['1.4.2: Pulling from prism/demo', th.ink]]];
        for (const L of layers) {
          const head = [`${L.id}: `, th.ink];
          if (L.cached) rows.push([head, ['Already exists', th.muted]]);
          else if (local < 0.25) rows.push([head, ['Pulling fs layer', th.muted]]);
          else if (local < L.dlStart) rows.push([head, ['Waiting', th.dim]]);
          else if (local < L.dlEnd) {
            const s = L.sim.at(local - L.dlStart);
            rows.push([head, ['Downloading ', th.info], [bar(s.frac) + nums(s.done, L.total), th.info]]);
          } else if (local < L.exStart) rows.push([head, [local < L.dlEnd + 0.15 ? 'Verifying Checksum' : 'Download complete', th.muted]]);
          else if (local < L.exStart + L.exSecs) {
            const f = (local - L.exStart) / L.exSecs;
            rows.push([head, ['Extracting ', th.warn], [bar(f) + nums(f * L.total, L.total), th.warn]]);
          } else rows.push([head, ['Pull complete', th.pos]]);
        }
        if (local >= finished) {
          rows.push([['Digest: sha256:', th.muted], [digest, th.dim]]);
          rows.push([['Status: Downloaded newer image for ', th.ink], [image, th.ink, ATTR.BOLD]]);
          rows.push([[image, th.muted]]);
        }
        rows.slice(-H).forEach((r, i) => segs(b, 0, i, W, r, '.'));
      };
    },
  },

  // ── cargo build ──────────────────────────────────────────────────────
  {
    id: 'progress-cargo-build', title: 'cargo build', category: C, order: 30, kind: 'progress',
    description: 'Green "Compiling" lines scrolling above cargo\'s pinned Building bar; the count and the crates in flight match the log.',
    tags: ['cargo', 'rust', 'build', 'compile'], size: { w: 80, h: 10 }, minSize: { w: 40, h: 3 }, loop: 12, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme;
      const names = ['proc-macro2 v1.0.89', 'unicode-ident v1.0.13', 'libc v0.2.161', 'cfg-if v1.0.0', 'autocfg v1.4.0', 'once_cell v1.20.2',
        'quote v1.0.37', 'syn v2.0.85', 'serde v1.0.214', 'serde_derive v1.0.214', 'memchr v2.7.4', 'itoa v1.0.11', 'ryu v1.0.18',
        'bytes v1.8.0', 'pin-project-lite v0.2.15', 'smallvec v1.13.2', 'scopeguard v1.2.0', 'lock_api v0.4.12', 'parking_lot_core v0.9.10',
        'parking_lot v0.12.3', 'log v0.4.22', 'tracing-core v0.1.32', 'tracing v0.1.40', 'mio v1.0.2', 'socket2 v0.5.7', 'tokio-macros v2.4.0',
        'tokio v1.41.0', 'futures-core v0.3.31', 'futures-util v0.3.31', 'serde_json v1.0.132', 'http v1.1.0', 'httparse v1.9.5',
        'http-body v1.0.1', 'hyper v1.5.0', 'tower-service v0.3.3', 'tower v0.5.1', 'axum-core v0.4.5', 'axum v0.7.7', 'clap_lex v0.7.2',
        'clap_builder v4.5.20', 'clap v4.5.20', 'prism-core v0.9.2 (/srv/build/prism/core)', 'prism-cli v0.9.2 (/srv/build/prism/cli)'];
      const heavy = /^(syn |serde_derive|tokio |serde_json|hyper |axum |clap_builder|prism-)/;
      const crates = names.map((name, i) => {
        const start = 0.3 + i * 0.19;
        return { name, short: name.split(' ')[0], start, end: start + (heavy.test(name) ? 0.75 : 0.3) + ctx.rng() * 0.2 };
      });
      const total = crates.length;
      const run = crates.reduce((m, c) => Math.max(m, c.end), 0);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 12, 1);
        const finished = local >= run;
        const started = crates.filter((c) => c.start <= local);
        const shown = started.slice(-(H - 1)).slice(0, H - 1);
        shown.forEach((c, i) => segs(b, 0, i, W, [['   Compiling', th.pos, ATTR.BOLD], [` ${c.name}`, th.ink]], '...'));
        if (finished) {
          segs(b, 0, Math.min(H - 1, shown.length), W, [['    Finished', th.pos, ATTR.BOLD], [` \`release\` profile [optimized] target(s) in ${run.toFixed(2)}s`, th.ink]], '...');
          return;
        }
        const n = crates.filter((c) => c.end <= local).length;
        const inflight = started.filter((c) => c.end > local).map((c) => c.short).join(', ');
        const barW = Math.max(8, Math.min(27, W - 40));
        const filled = Math.floor((n / total) * barW);
        const barStr = filled > 0 ? '='.repeat(filled - 1) + '>' + ' '.repeat(barW - filled) : ' '.repeat(barW);
        // Like cargo, the bar is the line under the newest log line, not pinned to the screen bottom.
        segs(b, 0, Math.min(H - 1, shown.length), W, [['    Building', th.info, ATTR.BOLD], [` [${barStr}] ${n}/${total}: `, th.ink], [inflight, th.ink]], '...');
      };
    },
  },

  // ── CI pipeline ──────────────────────────────────────────────────────
  {
    id: 'progress-ci-pipeline', title: 'CI Pipeline', category: C, order: 40, kind: 'progress',
    description: 'lint → build → test → deploy as connected stages with timings; on alternate runs a test fails, is retried, then passes.',
    tags: ['ci', 'pipeline', 'stages', 'deploy', 'failure', 'retry'], size: { w: 78, h: 7 }, minSize: { w: 40, h: 3 }, loop: 14, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const stages = [{ name: 'lint', secs: 1.2 }, { name: 'build', secs: 2.6 }, { name: 'test', secs: 3.0, cases: 580 }, { name: 'deploy', secs: 2.0 }];
      const plans = [false, true].map((flaky) => {
        const plan = [];
        let at = 0.3;
        for (const s of stages) {
          if (s.cases && flaky) { plan.push({ s, start: at, end: at + 1.6, fail: true }); at += 2.5; }
          plan.push({ s, start: at, end: at + s.secs });
          at += s.secs + 0.15;
        }
        return plan;
      });
      const bx = g.unicode ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', arrow: '▶' } : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', arrow: '>' };
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local, k } = phase(t, 14, 1);
        const flaky = k % 2 === 1, plan = plans[k % 2];
        const state = stages.map((s) => {
          const runs = plan.filter((p) => p.s === s);
          const cur = runs.find((p) => local >= p.start && local < p.end);
          const ended = runs.filter((p) => local >= p.end);
          const last = ended[ended.length - 1];
          const retried = runs.length > 1;
          if (cur) return { s, status: 'running', p: (local - cur.start) / (cur.end - cur.start), attempt: runs.indexOf(cur) + 1, retried };
          if (last) return { s, status: last.fail ? 'failed' : 'passed', secs: last.end - last.start, retried };
          return { s, status: 'pending' };
        });
        const icon = { passed: [g.ok, th.pos], failed: [g.fail, th.neg], running: [spinAt(t, g.unicode), th.info], pending: [g.hollow, th.dim] };
        const sub = (st) => {
          if (st.status === 'running') return st.s.cases ? `${Math.floor(st.p * st.s.cases)}/${st.s.cases}` : `${(st.p * st.s.secs).toFixed(1)}s`;
          if (st.status === 'passed') return `${st.secs.toFixed(1)}s${st.retried ? ' retry' : ''}`;
          if (st.status === 'failed') return '3 failed';
          return 'pending';
        };
        const tall = H >= 5;
        if (tall) {
          const boxW = Math.max(9, Math.min(17, Math.floor((W - 9) / 4)));
          const conn = Math.max(1, Math.floor((W - boxW * 4) / 3));
          state.forEach((st, i) => {
            const x = i * (boxW + conn);
            const [ic, c] = icon[st.status];
            const bc = st.status === 'pending' ? th.line : c;
            b.text(x, 0, bx.tl + bx.h.repeat(boxW - 2) + bx.tr, bc);
            for (const y of [1, 2]) { b.text(x, y, bx.v, bc); b.text(x + boxW - 1, y, bx.v, bc); }
            b.text(x, 3, bx.bl + bx.h.repeat(boxW - 2) + bx.br, bc);
            b.text(x + 2, 1, truncate(`${ic} ${st.s.name}`, boxW - 3, g.ell), st.status === 'pending' ? th.dim : th.ink, undefined, st.status === 'running' ? ATTR.BOLD : 0);
            b.text(x + 2, 2, truncate(sub(st), boxW - 3, g.ell), st.status === 'failed' ? th.neg : th.muted);
            if (i < 3) b.text(x + boxW, 1, bx.h.repeat(Math.max(0, conn - 1)) + bx.arrow, state[i + 1].status === 'pending' ? th.line : th.muted);
          });
        } else {
          const parts = [];
          state.forEach((st, i) => {
            const [ic, c] = icon[st.status];
            parts.push([`${ic} ${st.s.name}`, c]);
            if (i < 3) parts.push([` ${g.arrow} `, th.dim]);
          });
          segs(b, 0, 0, W, parts, g.ell);
        }
        const msgY = tall ? (H >= 6 ? 5 : 4) : 1;
        if (H <= msgY) return;
        const runIdx = state.findIndex((s) => s.status === 'running');
        const failed = state.some((s) => s.status === 'failed');
        let msg;
        if (state.every((s) => s.status === 'passed')) msg = [[`${g.ok} pipeline #${1842 + k} passed`, th.pos, ATTR.BOLD], [`  ${flaky ? 'after 1 retry' : 'first try'}`, th.muted]];
        else if (failed) msg = [[`${g.fail} test: 3 of 580 failed`, th.neg, ATTR.BOLD], ['  test_refund_window, test_idempotent_pay, +1 more', th.muted]];
        else if (runIdx >= 0) msg = [[`${spinAt(t, g.unicode)} ${stages[runIdx].name}`, th.info], [state[runIdx].attempt > 1 ? '  attempt 2 of 2' : '  running', th.muted]];
        else msg = [['waiting for a runner', th.dim]];
        segs(b, 0, msgY, W, msg, g.ell);
        if (H > msgY + 1 && failed) segs(b, 0, msgY + 1, W, [[`${g.arrow} retrying failed job (flaky-test policy: 1 retry)`, th.warn]], g.ell);
      };
    },
  },

  // ── wizard steps ─────────────────────────────────────────────────────
  {
    id: 'progress-step-wizard', title: 'Step Wizard', category: C, order: 50, kind: 'progress',
    description: 'A setup wizard\'s step indicator — finished steps filled, the current one ringed, the rest hollow — with a caption.',
    tags: ['steps', 'wizard', 'onboarding', 'stepper'], size: { w: 70, h: 5 }, minSize: { w: 30, h: 2 }, loop: 9, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const steps = ['Account', 'Network', 'Storage', 'Review', 'Deploy'];
      const captions = ['Create the admin account', 'Pick a VPC and subnets', 'Attach a 200 GB volume', 'Check the plan', `Deploying${g.ell}`];
      const dash = g.unicode ? '—' : '-';
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 9, 1);
        const n = steps.length;
        const cur = Math.min(n, Math.floor(local / 1.5));
        const gap = Math.max(4, Math.floor((W - 4) / (n - 1)));
        const x0 = Math.max(1, Math.floor((W - gap * (n - 1)) / 2));
        const cy = H >= 4 ? 1 : 0;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * gap;
          const done = i < cur, now = i === cur;
          if (i < n - 1) b.text(x + 1, cy, (g.unicode ? '━' : '=').repeat(gap - 1), done ? th.pos : th.line);
          b.text(x, cy, done ? (g.unicode ? '●' : '*') : now ? (g.unicode ? '◉' : '@') : g.hollow, done ? th.pos : now ? th.accent : th.dim, undefined, now ? ATTR.BOLD : 0);
          if (H >= 2) {
            const label = gap >= 9 ? steps[i] : String(i + 1);
            const lx = Math.max(0, Math.min(W - label.length, x - Math.floor(label.length / 2)));
            b.text(lx, cy + 1, label, done ? th.muted : now ? th.ink : th.dim, undefined, now ? ATTR.BOLD : 0);
          }
        }
        if (H >= 4) {
          const caption = cur >= n ? `${g.ok} All set ${dash} prism-node-03 is live` : `Step ${cur + 1} of ${n}  ${g.dot}  ${captions[cur]}`;
          b.text(1, H - 1, truncate(caption, W - 2, g.ell), cur >= n ? th.pos : th.muted);
        }
      };
    },
  },

  // ── checklist ────────────────────────────────────────────────────────
  {
    id: 'progress-checklist', title: 'Runbook Checklist', category: C, order: 60, kind: 'progress',
    description: 'A maintenance runbook ticking through its steps with timings; on alternate runs the smoke test fails once and is retried.',
    tags: ['checklist', 'tasks', 'runbook', 'retry'], size: { w: 64, h: 7 }, minSize: { w: 32, h: 3 }, loop: 12, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const tasks = [
        { name: 'Check free disk space', secs: 0.6 },
        { name: 'Drain prism-api from the load balancer', secs: 1.2 },
        { name: 'Migrate database', secs: 2.8, rows: 18400 },
        { name: 'Start prism-api 0.9.2', secs: 1.1 },
        { name: 'Run smoke tests', secs: 1.4, flaky: true },
        { name: 'Return to the load balancer', secs: 0.7 },
      ];
      const plans = [false, true].map((flaky) => {
        let at = 0.2;
        return tasks.map((task) => {
          const r = { ...task, start: at };
          if (task.flaky && flaky) { r.failAt = at + 0.9; r.retryStart = at + 1.8; at = r.retryStart + task.secs; }
          else at += task.secs;
          r.end = at;
          at += 0.15;
          return r;
        });
      });
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local, k } = phase(t, 12, 1);
        const rows = plans[k % 2];
        const listH = Math.min(rows.length, H);
        const active = rows.findIndex((r) => local < r.end);
        const focus = active < 0 ? rows.length - 1 : active;
        const first = Math.max(0, Math.min(rows.length - listH, focus - listH + 2));
        rows.slice(first, first + listH).forEach((r, i) => {
          let ic, c, tail = '', tc = th.dim;
          if (local >= r.end) { ic = g.ok; c = th.pos; tail = `${(r.end - r.start).toFixed(1)}s${r.failAt ? ' (retried)' : ''}`; }
          else if (r.failAt && local >= r.failAt && local < r.retryStart) { ic = g.fail; c = th.neg; tail = '1 failed, retrying'; tc = th.neg; }
          else if (local >= r.start) {
            ic = spinAt(t, g.unicode); c = th.info; tc = th.muted;
            const from = r.retryStart && local >= r.retryStart ? r.retryStart : r.start;
            tail = r.rows ? `${commas(clamp01((local - r.start) / r.secs) * r.rows)}/${commas(r.rows)} rows` : `${(local - from).toFixed(1)}s`;
          } else { ic = g.hollow; c = th.dim; }
          // ASCII status marks are two columns wide ("OK", "XX"), so the name column moves over.
          const nx = g.unicode ? 3 : 4;
          b.text(1, i, ic, c);
          const tw = stringWidth(tail);
          b.text(nx, i, truncate(r.name, Math.max(4, W - nx - 2 - tw), g.ell), local >= r.start ? th.ink : th.dim);
          if (tail) b.text(W - 1 - tw, i, tail, tc);
        });
        if (H > rows.length) {
          const done = rows.filter((r) => local >= r.end).length;
          const all = done === rows.length;
          const elapsed = all ? rows[rows.length - 1].end - rows[0].start : Math.max(0, local - rows[0].start);
          b.text(1, H - 1, truncate(`${done}/${rows.length} steps  ${g.dot}  ${all ? 'done in ' : ''}${elapsed.toFixed(1)}s`, W - 2, g.ell), all ? th.pos : th.muted, undefined, all ? ATTR.BOLD : 0);
        }
      };
    },
  },

  // ── apt ──────────────────────────────────────────────────────────────
  {
    id: 'progress-apt', title: 'apt install', category: C, order: 70, kind: 'progress',
    description: 'apt fetching then unpacking packages while dpkg\'s progress line holds the bottom row: Progress: [ 64%] [####....].',
    tags: ['apt', 'dpkg', 'debian', 'ubuntu', 'packages'], size: { w: 80, h: 12 }, minSize: { w: 40, h: 3 }, loop: 13, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme;
      const pkgs = [['libprism0', 'amd64', '0.9.2-1', 412], ['prism-cli', 'amd64', '0.9.2-1', 968], ['prism-data', 'all', '0.9.2-1', 3104]];
      const totalKb = pkgs.reduce((n, p) => n + p[3], 0);
      const L = (at, text, c = th.ink) => ({ at, parts: [[text, c]] });
      const script = [
        L(0, 'Reading package lists... Done'),
        L(0.3, 'Building dependency tree... Done'),
        L(0.45, 'Reading state information... Done'),
        L(0.6, 'The following NEW packages will be installed:'),
        L(0.62, `  ${pkgs.map((p) => p[0]).join(' ')}`),
        L(0.75, `0 upgraded, ${pkgs.length} newly installed, 0 to remove and 0 not upgraded.`),
        L(0.85, `Need to get ${commas(totalKb)} kB of archives.`),
        L(0.9, 'After this operation, 17.9 MB of additional disk space will be used.'),
        ...pkgs.map((p, i) => ({ at: 1.1 + i * 0.7, parts: [[`Get:${i + 1} `, th.ink], [`http://pkg.example/apt stable/main amd64 ${p[0]} ${p[1]} ${p[2]}`, th.muted], [` [${commas(p[3])} kB]`, th.ink]] })),
        L(3.3, `Fetched ${commas(totalKb)} kB in 2s (${commas(totalKb / 2)} kB/s)`),
      ];
      const dpkgStart = 3.6;
      let at = dpkgStart;
      const steps = [];
      for (const p of pkgs) {
        script.push(L(at, `Selecting previously unselected package ${p[0]}:${p[1]}.`));
        if (p === pkgs[0]) script.push(L(at + 0.07, '(Reading database ... 214783 files and directories currently installed.)'));
        script.push(L(at + 0.15, `Preparing to unpack .../${p[0]}_${p[2]}_${p[1]}.deb ...`));
        script.push(L(at + 0.3, `Unpacking ${p[0]}:${p[1]} (${p[2]}) ...`));
        steps.push(at, at + 0.3);
        at += 0.9;
      }
      for (const p of pkgs) { script.push(L(at, `Setting up ${p[0]}:${p[1]} (${p[2]}) ...`)); steps.push(at); at += 0.6; }
      script.push(L(at, 'Processing triggers for man-db (2.11.2-2) ...'));
      steps.push(at);
      const end = at + 0.6;
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 13, 1);
        const dpkg = local >= dpkgStart && local < end;
        visible(script, local, dpkg ? H - 1 : H).forEach((l, i) => segs(b, 0, i, W, l.parts, '.'));
        if (!dpkg) return;
        const done = steps.filter((s) => s <= local).length;
        const f = done / (steps.length + 1);
        const label = `Progress: [${String(Math.floor(f * 100)).padStart(3)}%]`;
        b.text(0, H - 1, label, th.bg, th.pos);
        const bw = Math.max(4, W - label.length - 3);
        const n = Math.floor(f * bw);
        b.text(label.length + 1, H - 1, `[${'#'.repeat(n)}${'.'.repeat(bw - n)}]`, th.ink);
      };
    },
  },

  // ── pip install ──────────────────────────────────────────────────────
  {
    id: 'progress-pip-install', title: 'pip install', category: C, order: 80, kind: 'progress',
    description: 'pip collecting wheels with its rich bar — pink run, green size, red rate, cyan ETA — then installing and reporting.',
    tags: ['pip', 'python', 'wheel', 'rich'], size: { w: 80, h: 9 }, minSize: { w: 44, h: 3 }, loop: 11, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const wheels = [
        { req: 'prism-sdk==2.4.0', name: 'prism-sdk', ver: '2.4.0', file: 'prism_sdk-2.4.0-py3-none-any.whl', mb: 5.2 },
        { req: 'httpx>=0.27 (from prism-sdk==2.4.0)', name: 'httpx', ver: '0.27.2', file: 'httpx-0.27.2-py3-none-any.whl', mb: 0.076, cached: true },
        { req: 'numpy>=2.0 (from prism-sdk==2.4.0)', name: 'numpy', ver: '2.1.2', file: 'numpy-2.1.2-cp312-cp312-manylinux_2_17_x86_64.whl', mb: 16.3 },
      ];
      let at = 0;
      for (const w of wheels) {
        w.at = at;
        w.secs = w.cached ? 0 : 0.8 + w.mb / 5;
        if (!w.cached) w.sim = transfer(ctx.rng, { total: w.mb * 1e6, seconds: w.secs, burst: 0.4 });
        at += w.cached ? 0.5 : 0.35 + w.secs + 0.3;
      }
      const installAt = at + 0.2, doneAt = installAt + 1.4;
      // pip's rich theme: rgb(249,38,114) while running, rgb(114,156,31) when finished, gray remainder.
      const running = rgb(249, 38, 114), fin = rgb(114, 156, 31), rest = rgb(58, 58, 58);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 11, 1);
        const rows = [];
        for (const w of wheels) {
          if (local < w.at) break;
          rows.push([[`Collecting ${w.req}`, th.ink]]);
          if (w.cached) { rows.push([[`  Using cached ${w.file} (${Math.round(w.mb * 1000)} kB)`, th.muted]]); continue; }
          if (local < w.at + 0.35) continue;
          rows.push([[`  Downloading ${w.file} (${w.mb.toFixed(1)} MB)`, th.muted]]);
          const s = w.sim.at(local - w.at - 0.35);
          const bw = Math.max(8, Math.min(40, W - 34));
          const n = s.frac * bw, full = Math.floor(n), half = !s.finished && n - full >= 0.5;
          const on = (g.unicode ? '━' : '=').repeat(full) + (half ? (g.unicode ? '╸' : '-') : '');
          const off = (g.unicode ? '━' : ' ').repeat(Math.max(0, bw - full - (half ? 1 : 0)));
          const rate = (s.finished ? s.avg : s.smooth) / 1e6;
          rows.push([['     ', th.ink], [on, s.finished ? fin : running], [off, rest],
            [` ${(s.done / 1e6).toFixed(1)}/${w.mb.toFixed(1)} MB`, fin], [` ${rate.toFixed(1)} MB/s`, th.neg], [` eta ${s.finished ? '0:00:00' : clock(s.eta)}`, th.info]]);
        }
        if (local >= installAt) rows.push([[`Installing collected packages: ${wheels.map((w) => w.name).reverse().join(', ')}`, th.ink]]);
        if (local >= doneAt) rows.push([[`Successfully installed ${wheels.map((w) => `${w.name}-${w.ver}`).sort().join(' ')}`, th.ink]]);
        rows.slice(-H).forEach((r, i) => segs(b, 0, i, W, r, g.ell));
      };
    },
  },

  // ── git clone ────────────────────────────────────────────────────────
  {
    id: 'progress-git-clone', title: 'git clone', category: C, order: 90, kind: 'progress',
    description: 'git\'s counters in order — enumerating, counting, compressing, receiving with size and rate, resolving deltas, updating files.',
    tags: ['git', 'clone', 'objects', 'deltas'], size: { w: 80, h: 8 }, minSize: { w: 44, h: 3 }, loop: 10, glyphs: 'ascii', color: 'mono',
    setup(ctx) {
      const th = ctx.theme;
      // Counted + pack-reused objects make the total; reused objects come from the counted ones.
      const objects = 4821, counted = 812, compress = 390, deltas = 2210, files = 1203, mib = 63.47;
      const recvSecs = 4.4;
      const recv = transfer(ctx.rng, { total: objects, seconds: recvSecs, burst: 0.5 });
      const Tenum = 0.4, Tcount = 0.7, Tcomp = 1.3, Trecv = 1.8, Ttotal = Trecv + recvSecs - 0.6, Tres = Trecv + recvSecs + 0.1, Tupd = Tres + 1.1;
      const counter = (label, f, n, extra = '') => `${label}${String(Math.floor(f * 100)).padStart(3)}% (${Math.floor(f * n)}/${n})${extra}`;
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const rows = ["Cloning into 'prism-demo'..."];
        const stage = (at, secs) => clamp01((local - at) / secs);
        if (local >= Tenum) rows.push(`remote: Enumerating objects: ${objects}, done.`);
        if (local >= Tcount) rows.push(counter('remote: Counting objects: ', stage(Tcount, 0.5), counted, local >= Tcount + 0.5 ? ', done.' : ''));
        if (local >= Tcomp) rows.push(counter('remote: Compressing objects: ', stage(Tcomp, 0.4), compress, local >= Tcomp + 0.4 ? ', done.' : ''));
        if (local >= Ttotal) rows.push(`remote: Total ${objects} (delta ${deltas}), reused 640 (delta 412), pack-reused ${objects - counted}`);
        if (local >= Trecv) {
          const s = recv.at(local - Trecv);
          const rate = (s.finished ? s.avg : s.smooth) / objects * mib;
          rows.push(counter('Receiving objects: ', s.frac, objects, `, ${(s.frac * mib).toFixed(2)} MiB | ${rate.toFixed(2)} MiB/s${s.finished ? ', done.' : ''}`));
        }
        if (local >= Tres) rows.push(counter('Resolving deltas: ', stage(Tres, 1.0), deltas, local >= Tres + 1.0 ? ', done.' : ''));
        if (local >= Tupd) rows.push(counter('Updating files: ', stage(Tupd, 0.6), files, local >= Tupd + 0.6 ? ', done.' : ''));
        rows.slice(-H).forEach((r, i) => b.text(0, i, truncate(r, W, '.'), r.startsWith('remote:') ? th.muted : th.ink));
      };
    },
  },

  // ── npm install ──────────────────────────────────────────────────────
  {
    id: 'progress-npm-install', title: 'npm install', category: C, order: 100, kind: 'progress',
    description: 'npm\'s gauge — a bracketed fill, a spinner and the current reify step — ending in the added, funding and audit summary.',
    tags: ['npm', 'node', 'gauge', 'javascript'], size: { w: 80, h: 7 }, minSize: { w: 40, h: 2 }, loop: 9, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const pkgs = ['tslib', 'esbuild', 'typescript', '@types/node', 'undici', 'zod', 'picocolors', 'semver', 'prism-term'];
      const run = 6;
      const ms = pkgs.map(() => Math.round(40 + ctx.rng() * 1600));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 9, 1);
        const rows = [[['~/prism-web', th.info], [' $ ', th.dim], ['npm install', th.ink]]];
        if (local >= run) {
          rows.push([[`added 214 packages, and audited 215 packages in ${run}s`, th.ink]], [['', th.ink]],
            [['38 packages are looking for funding', th.ink]], [['  run `npm fund` for details', th.muted]], [['', th.ink]],
            [['found ', th.ink], ['0', th.pos, ATTR.BOLD], [' vulnerabilities', th.ink]]);
        } else {
          const f = clamp01(local / run);
          const i = Math.min(pkgs.length - 1, Math.floor(f * pkgs.length));
          const stage = f < 0.25 ? `idealTree:${pkgs[i]}: timing idealTree:#root Completed in ${ms[i]}ms`
            : f < 0.92 ? `reify:${pkgs[i]}: timing reifyNode:node_modules/${pkgs[i]} Completed in ${ms[i]}ms` : 'auditReport: timing auditReport Completed in 412ms';
          const gw = Math.max(8, Math.min(18, W - 50));
          const n = Math.floor(f * gw);
          rows.push([['(', th.dim], ['#'.repeat(n), th.ink], [(g.unicode ? '⠂' : '.').repeat(gw - n), th.dim], [') ', th.dim], [spinAt(t, g.unicode), th.ink], [` ${stage}`, th.muted]]);
        }
        rows.slice(-H).forEach((r, y) => segs(b, 0, y, W, r, g.ell));
      };
    },
  },
];
