// Transfers & ETA — bytes on the move, printed the way the real tools print
// them, plus a few views of rate and ETA themselves.
//
// Every line is built from a seeded transfer() so size, percent, rate, elapsed
// and ETA agree; formats follow each tool's source (tqdm's format_meter, wget's
// bar.c, curl's progress.c max5data/time2str, pv's -pterab, rsync --progress).
import { ATTR } from '../../buffer.js';
import { Canvas } from '../../canvas.js';
import { mix, gradient } from '../../color.js';
import { sparkline, gauge } from '../../widgets/index.js';
import { truncate, stringWidth } from '../../width.js';
import { phase, transfer, glyphs, clamp01, commas, clock } from './_sim.js';
import { segs, wrapRows } from './_log.js';

const C = 'Transfers & ETA';
const MiB = 1048576;
const p2 = (n) => String(Math.floor(n)).padStart(2, '0');
const mmss = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)}` : `${p2(s / 60)}:${p2(s % 60)}`);
const ASCII_SPARK = ' .:-=+*#';

export default [
  // ── tqdm ─────────────────────────────────────────────────────────────
  {
    id: 'progress-tqdm', title: 'tqdm', category: C, order: 10, kind: 'progress',
    description: 'Nested tqdm bars from a training run: epochs outside, batches inside, with elapsed<remaining, it/s and a live loss postfix.',
    tags: ['tqdm', 'python', 'training', 'ml', 'nested'], size: { w: 80, h: 6 }, minSize: { w: 44, h: 1 }, loop: 13, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const batches = 250, epochs = 5, prior = 46.2;
      const eps = [{ n: 3, secs: 5.4, l0: 0.312, l1: 0.241, val: [0.263, 0.907] }, { n: 4, secs: 5.9, l0: 0.244, l1: 0.206, val: [0.238, 0.918] }];
      let at = 0.2;
      for (const e of eps) { e.start = at; e.sim = transfer(ctx.rng, { total: batches, seconds: e.secs, burst: 0.35, stalls: 1, alpha: 0.3 }); at += e.secs + 0.5; e.end = e.start + e.secs; }
      const noise = Array.from({ length: 256 }, () => ctx.rng() - 0.5);
      const history = ['epoch 1: train_loss=0.512 val_loss=0.448 val_acc=0.861', 'epoch 2: train_loss=0.371 val_loss=0.352 val_acc=0.894'];
      /** tqdm's format_meter: '{l_bar}{bar}{r_bar}' with the bar filling whatever width is left. */
      const meter = (desc, n, total, el, rate, postfix, W) => {
        const pct = `${String(Math.floor((n / total) * 100)).padStart(3)}%`;
        const rateTxt = rate <= 0 ? '?it/s' : rate >= 1 ? `${rate.toFixed(2)}it/s` : `${(1 / rate).toFixed(2)}s/it`;
        const rem = rate > 0 ? mmss((total - n) / rate) : '?';
        const right = `| ${n}/${total} [${mmss(el)}<${rem}, ${rateTxt}${postfix}]`;
        const left = `${desc}: ${pct}|`;
        const bw = Math.max(1, W - left.length - right.length - 1);
        const frac = (n / total) * bw;
        const full = Math.floor(frac);
        let bar;
        if (g.unicode) bar = '█'.repeat(full) + (full < bw ? ' ▏▎▍▌▋▊▉'[Math.floor((frac - full) * 8)] : '') + ' '.repeat(Math.max(0, bw - full - 1));
        else bar = '#'.repeat(full) + (full < bw ? ' 123456789'[Math.floor((frac - full) * 10)] : '') + ' '.repeat(Math.max(0, bw - full - 1));
        return { left, bar: bar.slice(0, bw), right };
      };
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 13, 1);
        const doneEps = eps.filter((e) => local >= e.end);
        const cur = eps.find((e) => local >= e.start && local < e.end);
        const logs = [...history, ...doneEps.map((e) => `epoch ${e.n}: train_loss=${e.l1.toFixed(3)} val_loss=${e.val[0].toFixed(3)} val_acc=${e.val[1].toFixed(3)}`)];
        const nEp = 2 + doneEps.length;
        const outerEl = prior + local;
        const outer = meter('training', nEp, epochs, outerEl, nEp / outerEl, '', W);
        const bars = [outer];
        if (cur) {
          const s = cur.sim.at(local - cur.start);
          const n = Math.floor(s.done);
          const loss = cur.l0 + (cur.l1 - cur.l0) * s.frac + noise[n % 256] * 0.02;
          bars.push(meter(`epoch ${cur.n}`, n, batches, s.elapsed, s.smooth, `, loss=${loss.toFixed(3)}`, W));
        }
        const logRows = Math.max(0, H - bars.length);
        logs.slice(-logRows).forEach((l, i) => b.text(0, i, truncate(l, W, g.ell), th.muted));
        bars.slice(-H).forEach((m, i) => {
          const y = Math.max(0, H - Math.min(H, bars.length)) + i;
          segs(b, 0, y, W, [[m.left, th.ink], [m.bar, i === 0 ? th.muted : th.ink], [m.right, th.ink]], g.ell);
        });
      };
    },
  },

  // ── wget ─────────────────────────────────────────────────────────────
  {
    id: 'progress-wget', title: 'wget', category: C, order: 20, kind: 'progress',
    description: 'wget with its scrolling filename, =====> bar, size, rate and eta; every other run the connection resets and it resumes with +++ for the bytes it had.',
    tags: ['wget', 'download', 'http', 'resume', 'failure'], size: { w: 80, h: 13 }, minSize: { w: 44, h: 2 }, loop: 11, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const total = 68157440, name = 'prism-0.9.2.tgz', url = `https://dl.example.com/${name}`;
      const failByte = 41203712, start = 14 * 3600 + 2 * 60 + 11;
      const q = g.unicode ? ['‘', '’'] : ["'", "'"];
      const full = transfer(ctx.rng, { total, seconds: 7.1, burst: 0.5 });
      const head = transfer(ctx.rng, { total, seconds: 7.4, burst: 0.5 });
      let failAt = 0;
      while (head.at(failAt).done < failByte && failAt < 7.4) failAt += 0.01;
      const resume = transfer(ctx.rng, { total: total - failByte, seconds: 2.9, burst: 0.5 });
      const stamp = (s) => { s = start + Math.floor(s); return `2026-10-13 ${p2(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)}`; };
      const sz = (n) => `${(n / MiB).toFixed(2)}M`;
      const rate = (r) => { const m = r / MiB; return m >= 100 ? `${m.toFixed(0)}MB/s` : m >= 10 ? `${m.toFixed(1)}MB/s` : `${m.toFixed(2)}MB/s`; };
      const eta = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.max(1, Math.round(s))}s`);
      const preamble = (t0, retry) => [
        [t0, `--${stamp(t0)}--  ${retry ? '(try: 2)  ' : ''}${url}`],
        ...(retry ? [] : [[t0 + 0.15, 'Resolving dl.example.com (dl.example.com)... 192.0.2.44']]),
        [t0 + 0.3, 'Connecting to dl.example.com (dl.example.com)|192.0.2.44|:443... connected.'],
        [t0 + 0.5, `HTTP request sent, awaiting response... ${retry ? '206 Partial Content' : '200 OK'}`],
        [t0 + 0.55, retry ? `Length: ${total} (65M), ${total - failByte} (26M) remaining [application/gzip]` : `Length: ${total} (65M) [application/gzip]`],
        [t0 + 0.6, `Saving to: ${q[0]}${name}${q[1]}`],
        [t0 + 0.6, ''],
      ];
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local, k } = phase(t, 11, 1);
        const fails = k % 2 === 1;
        const nameW = Math.max(8, Math.floor(W / 4));
        const shownName = (() => {
          if (name.length <= nameW) return name.padEnd(nameW);
          const span = name.length - nameW + 3;
          const off = Math.floor(local / 0.3) % (span + 4);
          return name.slice(Math.min(off, span - 3), Math.min(off, span - 3) + nameW).padEnd(nameW);
        })();
        // The progress line: name, pct, [bar], size, rate, eta-or-elapsed.
        const bar = (done, have, r, tail, finished) => {
          const pct = `${String(Math.floor((done / total) * 100)).padStart(3)}%`;
          const right = `${sz(done).padStart(8)}  ${rate(r).padStart(8)}    ${tail}`;
          const bw = Math.max(4, W - 1 - nameW - 1 - pct.length - 2 - right.length - 1);
          const n = Math.min(bw, Math.floor((done / total) * bw)), plus = Math.floor((have / total) * bw);
          const body = Array.from({ length: bw }, (_, i) => (i < plus ? '+' : i < n - 1 || (finished && i < bw - 1) ? '=' : i === n - 1 || (finished && i === bw - 1) ? '>' : ' ')).join('');
          return Object.assign([[`${shownName} ${pct}[`, th.ink], [body, th.ink], [`] ${right}`, th.ink]], { noWrap: true });
        };
        const rows = [];
        const add = (txt, c = th.ink) => rows.push([[txt, c]]);
        for (const [at, txt] of preamble(0, false)) if (local >= at) add(txt, txt.startsWith('--') ? th.ink : th.muted);
        const t1 = 0.7;
        if (!fails) {
          if (local >= t1) {
            const s = full.at(local - t1);
            rows.push(bar(s.done, 0, s.finished ? s.avg : s.smooth, s.finished ? `in ${s.elapsed.toFixed(1)}s` : `eta ${eta(s.eta)}`, s.finished));
            if (s.finished && local >= t1 + 7.15) { add(''); add(`${stamp(t1 + 7.15)} (${rate(s.avg).replace('MB/s', ' MB/s')}) - ${q[0]}${name}${q[1]} saved [${total}/${total}]`, th.pos); }
          }
        } else if (local >= t1) {
          const s = head.at(Math.min(local - t1, failAt));
          const broke = local - t1 >= failAt;
          rows.push(bar(s.done, 0, s.smooth, broke ? `in ${failAt.toFixed(1)}s` : `eta ${eta(s.eta)}`, false));
          if (broke) {
            add('');
            add(`${stamp(t1 + failAt)} (${rate(s.done / failAt).replace('MB/s', ' MB/s')}) - Read error at byte ${failByte}/${total} (Connection reset by peer). Retrying.`, th.neg);
            add('');
            const t2 = t1 + failAt + 1.0;
            for (const [at, txt] of preamble(t2, true)) if (local >= at) add(txt, txt.startsWith('--') ? th.ink : th.muted);
            const t3 = t2 + 0.7;
            if (local >= t3) {
              const r = resume.at(local - t3);
              rows.push(bar(failByte + r.done, failByte, r.finished ? r.avg : r.smooth, r.finished ? `in ${r.elapsed.toFixed(1)}s` : `eta ${eta(r.eta)}`, r.finished));
              if (r.finished && local >= t3 + 2.95) { add(''); add(`${stamp(t3 + 2.95)} (${rate(r.avg).replace('MB/s', ' MB/s')}) - ${q[0]}${name}${q[1]} saved [${total}/${total}]`, th.pos); }
            }
          }
        }
        wrapRows(rows, W).slice(-H).forEach((r, i) => segs(b, 0, i, W, r, g.ell));
      };
    },
  },

  // ── curl -# ──────────────────────────────────────────────────────────
  {
    id: 'progress-curl-hash', title: 'curl -#', category: C, order: 30, kind: 'progress',
    description: 'curl\'s hash-bar mode across the full width with a right-hand percentage; on alternate runs a reset is resumed with -C -.',
    tags: ['curl', 'download', 'hash', 'resume', 'failure'], size: { w: 80, h: 7 }, minSize: { w: 40, h: 1 }, loop: 13, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const f1 = transfer(ctx.rng, { total: 1, seconds: 2.6 });
      const f2 = transfer(ctx.rng, { total: 1, seconds: 6.0 });
      const failF = 0.613, total2 = 67108864;
      let failAt = 0;
      while (f2.at(failAt).frac < failF && failAt < 6) failAt += 0.01;
      const rest = transfer(ctx.rng, { total: 1 - failF, seconds: 2.4 });
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local, k } = phase(t, 13, 1);
        const fails = k % 2 === 1;
        // curl: bar->width = cols - 1; the bar gets width - 7 and is followed by ' %5.1f%%'.
        const line = (f) => {
          const bw = Math.max(1, W - 1 - 7);
          return `${'#'.repeat(Math.floor(f * bw)).padEnd(bw)} ${(f * 100).toFixed(1).padStart(5)}%`;
        };
        const rows = [];
        const cmd = (txt) => rows.push([['$ ', th.dim], [txt, th.ink]]);
        cmd('curl -# -O https://dl.example.com/prism/assets-0.9.2.tar');
        if (local >= 0.2) rows.push([[line(f1.at(local - 0.2).frac), th.ink]]);
        const t2 = 3.2;
        if (local >= t2) cmd('curl -# -O https://dl.example.com/prism/models-0.9.2.tar');
        if (local >= t2 + 0.2) {
          const el = local - t2 - 0.2;
          if (!fails || el < failAt) rows.push([[line(f2.at(el).frac), th.ink]]);
          else {
            rows.push([[line(f2.at(failAt).frac), th.ink]]);
            rows.push([['curl: (56) Recv failure: Connection reset by peer', th.neg]]);
            const t3 = failAt + 0.8;
            if (el >= t3) cmd('curl -# -C - -O https://dl.example.com/prism/models-0.9.2.tar');
            if (el >= t3 + 0.1) rows.push([[`** Resuming transfer from byte position ${Math.round(total2 * failF)}`, th.muted]]);
            if (el >= t3 + 0.3) rows.push([[line(failF + rest.at(el - t3 - 0.3).done), th.ink]]);
          }
        }
        rows.slice(-H).forEach((r, i) => segs(b, 0, i, W, r, g.ell));
      };
    },
  },

  // ── curl progress meter ──────────────────────────────────────────────
  {
    id: 'progress-curl-meter', title: 'curl progress meter', category: C, order: 40, kind: 'progress',
    description: 'curl\'s default meter — % Total, % Received, Average Speed, Time Total/Spent/Left, Current Speed — updating once a second as curl does.',
    tags: ['curl', 'download', 'meter', 'table'], size: { w: 80, h: 7 }, minSize: { w: 80, h: 3 }, loop: 12, glyphs: 'ascii', color: 'mono',
    setup(ctx) {
      const th = ctx.theme;
      const total = 67108864, secs = 6.8;
      const sim = transfer(ctx.rng, { total, seconds: secs, burst: 0.5 });
      // progress.c max5data(): always five characters.
      const max5 = (n) => {
        n = Math.floor(n);
        if (n < 100000) return String(n).padStart(5);
        if (n < 10000 * 1024) return `${String(Math.floor(n / 1024)).padStart(4)}k`;
        if (n < 100 * MiB) return `${String(Math.floor(n / MiB)).padStart(2)}.${Math.floor((n % MiB) / (MiB / 10))}M`;
        return `${String(Math.floor(n / MiB)).padStart(4)}M`;
      };
      const time2str = (s) => (s < 0 || !Number.isFinite(s) ? '--:--:--' : `${String(Math.floor(s / 3600)).padStart(2)}:${p2((s % 3600) / 60)}:${p2(s % 60)}`);
      const pct = (n) => String(Math.floor((n / total) * 100)).padStart(3);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 12, 1);
        const run = local - 0.3;
        const done = run >= secs;
        const s = done ? secs : Math.max(0, Math.floor(run));        // the meter refreshes once per second
        const got = sim.at(s).done;
        const avg = s > 0 ? got / s : 0;
        const cur = s > 0 ? (got - sim.at(Math.max(0, s - 5)).done) / Math.min(5, s) : 0;
        const tot = avg > 0 ? total / avg : -1;
        const meter = got <= 0
          ? `  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0`
          : `${pct(got)} ${max5(total)}  ${pct(got)} ${max5(got)}    0     0  ${max5(avg)}      0 ${time2str(Math.round(tot))} ${time2str(Math.round(s))} ${done ? '--:--:--' : time2str(Math.round(tot - s))} ${max5(cur)}`;
        const rows = [
          [['$ ', th.dim], ['curl -o prism-db-01.dump https://dl.example.com/backups/prism-db-01.dump', th.ink]],
          [['  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current', th.ink]],
          [['                                 Dload  Upload   Total   Spent    Left  Speed', th.ink]],
        ];
        if (local >= 0.3) rows.push([[meter, th.ink]]);
        if (local >= secs + 1.0) rows.push([['$ ', th.dim], ['sha256sum -c prism-db-01.dump.sha256', th.ink]]);
        if (local >= secs + 1.5) rows.push([['prism-db-01.dump: OK', th.pos]]);
        rows.slice(-H).forEach((r, i) => segs(b, 0, i, W, r, '.'));
      };
    },
  },

  // ── pv ───────────────────────────────────────────────────────────────
  {
    id: 'progress-pv', title: 'pv', category: C, order: 50, kind: 'progress',
    description: 'pv -pterab on a restore stream: bytes, timer, current and average rate, a full-width bar and ETA, with a stall when the far end pushes back.',
    tags: ['pv', 'pipe', 'throughput', 'restore'], size: { w: 96, h: 4 }, minSize: { w: 66, h: 1 }, loop: 17, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme;
      const total = 2.25 * 1024 ** 3, secs = 14;
      const sim = transfer(ctx.rng, { total, seconds: secs, burst: 0.45, stalls: 1, alpha: 0.25 });
      // pv sizes: three significant figures and an IEC unit ("1.21GiB", " 512MiB").
      const sz = (n) => {
        const u = ['B', 'KiB', 'MiB', 'GiB'];
        let i = 0;
        while (n >= 1000 && i < 3) { n /= 1024; i++; }
        return `${n >= 100 ? n.toFixed(0).padStart(4) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}${u[i]}`;
      };
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 17, 1);
        const run = Math.max(0, local - 0.2);
        const s = sim.at(run);
        const fin = s.finished;
        const left = `${sz(s.done)} ${clock(s.elapsed)} [${sz(fin ? s.avg : s.smooth)}/s] [${sz(s.avg)}/s] [`;
        const right = `] ${String(Math.floor(s.frac * 100)).padStart(3)}% ${fin ? '            ' : `ETA ${clock(s.eta)}`}`;
        const bw = Math.max(4, W - left.length - right.length - 1);
        const n = Math.floor(s.frac * bw);
        const bar = fin ? '='.repeat(bw) : `${'='.repeat(Math.max(0, n - 1))}${n ? '>' : ''}`.padEnd(bw);
        const rows = [[['$ ', th.dim], ["pv -pterab backup.tar.zst | ssh restore@10.20.0.31 'zstd -d | tar x -C /srv/restore'", th.ink]],
          [[left, th.ink], [bar, fin ? th.pos : th.ink], [right, th.ink]]];
        if (fin && local >= secs + 0.8) rows.push([['$ ', th.dim]]);
        rows.slice(-H).forEach((r, i) => segs(b, 0, i, W, r, '.'));
      };
    },
  },

  // ── rsync --progress ─────────────────────────────────────────────────
  {
    id: 'progress-rsync', title: 'rsync --progress', category: C, order: 60, kind: 'progress',
    description: 'rsync -av --progress pushing a tree: per-file bytes, percent, rate and time with xfr#/to-chk counters, then the sent/received summary.',
    tags: ['rsync', 'backup', 'sync', 'files'], size: { w: 80, h: 12 }, minSize: { w: 64, h: 2 }, loop: 14, glyphs: 'ascii', color: '16',
    setup(ctx) {
      const th = ctx.theme;
      const entries = [
        ['./'], ['assets/'], ['assets/atlas-0.png', 6815744], ['assets/atlas-1.png', 6291456], ['assets/fonts/'], ['assets/fonts/inter.woff2', 318212],
        ['assets/sfx.pak', 14680064], ['bin/'], ['bin/prism', 21233664], ['config/'], ['config/prism.toml', 2417], ['docs/'], ['docs/manual.pdf', 3145728],
      ];
      const totalSize = entries.reduce((n, e) => n + (e[1] || 0), 0);
      const nEntries = entries.length;
      const rate = 6.2 * MiB;
      let at = 0.6, xfr = 0;
      const script = [];
      entries.forEach((e, i) => {
        script.push({ at, kind: 'name', text: e[0] });
        at += 0.06;
        if (e[1] !== undefined) {
          const secs = Math.max(0.12, e[1] / rate);
          xfr += 1;
          script.push({ at, kind: 'file', size: e[1], secs, xfr, chk: nEntries - 1 - i, sim: transfer(ctx.rng, { total: e[1], seconds: secs, burst: 0.4, stalls: 0 }) });
          at += secs + 0.05;
        }
      });
      const end = at;
      const sent = totalSize + 12300, received = 465, elapsed = end - 0.3;
      const rateTxt = (r) => (r >= MiB ? `${(r / MiB).toFixed(2)}MB/s` : `${(r / 1024).toFixed(2)}kB/s`);
      const time = (s) => `${String(Math.floor(s / 3600)).padStart(4)}:${p2((s % 3600) / 60)}:${p2(s % 60)}`;
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 14, 1);
        const rows = [[['$ ', th.dim], ['rsync -av --progress ./prism/ backup@10.20.0.31:/srv/backup/prism/', th.ink]]];
        if (local >= 0.4) rows.push([['sending incremental file list', th.ink]]);
        for (const l of script) {
          if (local < l.at) break;
          if (l.kind === 'name') { rows.push([[l.text, th.ink]]); continue; }
          const s = l.sim.at(local - l.at);
          const fin = s.finished;
          const pct = `${String(Math.floor(s.frac * 100)).padStart(3)}%`;
          const line = `${commas(s.done).padStart(15)} ${pct} ${rateTxt(fin ? l.size / l.secs : s.smooth).padStart(11)} ${time(fin ? l.secs : s.eta)}${fin ? ` (xfr#${l.xfr}, to-chk=${l.chk}/${nEntries})` : ''}`;
          rows.push([[line, fin ? th.muted : th.info]]);
        }
        if (local >= end + 0.1) {
          rows.push([['', th.ink]]);
          rows.push([[`sent ${commas(sent)} bytes  received ${commas(received)} bytes  ${((sent + received) / elapsed).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bytes/sec`, th.ink]]);
          rows.push([[`total size is ${commas(totalSize)}  speedup is ${(totalSize / (sent + received)).toFixed(2)}`, th.ink]]);
        }
        rows.slice(-H).forEach((r, i) => segs(b, 0, i, W, r, '.'));
      };
    },
  },

  // ── speed graph ──────────────────────────────────────────────────────
  {
    id: 'progress-speed-graph', title: 'Download Speed Graph', category: C, order: 70, kind: 'progress',
    description: 'A download drawing its own throughput history as a braille area chart, with a dotted average line, peak, now and ETA.',
    tags: ['speed', 'graph', 'throughput', 'braille', 'download'], size: { w: 72, h: 10 }, minSize: { w: 32, h: 3 }, loop: 12, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const total = 470 * 1e6, secs = 10;
      const sim = transfer(ctx.rng, { total, seconds: secs, burst: 0.8, stalls: 2 });
      let peak = 0;
      for (let i = 0; i <= 400; i++) peak = Math.max(peak, sim.at((i / 400) * secs).rate);
      const top = Math.ceil(peak / 1e7) * 1e7;
      const ramp = gradient([th.info, th.accent, th.crit]);
      const mb = (r) => `${(r / 1e6).toFixed(1)} MB/s`;
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 12, 1);
        const s = sim.at(local);
        const head = `prism-dataset-2026q3.tar ${g.dot} ${(s.done / 1e6).toFixed(0)}/${total / 1e6} MB`;
        const pct = s.finished ? `${g.ok} 100%` : `${Math.floor(s.frac * 100)}%`;
        b.text(1, 0, truncate(head, W - 8, g.ell), th.ink);
        b.text(W - 1 - stringWidth(pct), 0, pct, s.finished ? th.pos : th.accent, undefined, ATTR.BOLD);
        const foot = s.finished ? `done in ${secs.toFixed(1)}s ${g.dot} avg ${mb(s.avg)} ${g.dot} peak ${mb(peak)}`
          : `now ${mb(s.smooth)} ${g.dot} avg ${mb(s.avg)} ${g.dot} peak ${mb(peak)} ${g.dot} eta ${clock(s.eta, { short: true })}`;
        if (H >= 3) b.text(1, H - 1, truncate(foot, W - 2, g.ell), th.muted);
        const ch = H - 2 - (H >= 6 ? 1 : 0);
        if (ch < 1) return;
        const lab = W >= 44 ? 9 : 0;
        const cw = W - 2 - lab;
        const y0 = 1;
        if (g.unicode) {
          const cv = new Canvas(cw, ch, { mode: 'braille', threshold: 0 });
          const pw = cv.width, ph = cv.height;
          for (let x = 0; x < pw; x++) {
            const at = ((x + 0.5) / pw) * secs;
            if (at > local) break;
            const r = sim.at(at).rate, h = Math.max(1, Math.round((r / top) * ph));
            for (let y = ph - h; y < ph; y++) cv.set(x, y, ramp(1 - y / ph));
          }
          const ay = ph - 1 - Math.round((s.avg / top) * (ph - 1));
          if (s.avg > 0) for (let x = 0; x < pw; x += 3) cv.set(x, ay, th.ink);
          cv.paint(b, 1, y0);
        } else {
          for (let x = 0; x < cw; x++) {
            const at = ((x + 0.5) / cw) * secs;
            if (at > local) break;
            const r = sim.at(at).rate, h = (r / top) * ch;
            for (let y = 0; y < ch; y++) {
              const fill = h - (ch - 1 - y);
              if (fill > 0) b.set(1 + x, y0 + y, fill >= 1 ? '#' : fill > 0.5 ? '+' : '.', th.accent);
            }
          }
        }
        if (lab) {
          b.text(W - lab, y0, `${(top / 1e6).toFixed(0)} MB/s`.slice(0, lab - 1), th.dim);
          b.text(W - lab, y0 + ch - 1, '0', th.dim);
          if (s.avg > 0 && ch >= 3) b.text(W - lab, y0 + Math.min(ch - 2, Math.max(1, Math.round((1 - s.avg / top) * (ch - 1)))), `${g.dot}${g.dot} avg`, th.ink);
        }
        if (H >= 6) {
          const bw = W - 2, n = Math.round(s.frac * bw);
          for (let i = 0; i < bw; i++) b.set(1 + i, H - 2, g.unicode ? '━' : i < n ? '=' : '-', i < n ? (s.finished ? th.pos : th.accent) : th.line);
        }
      };
    },
  },

  // ── ETA convergence ──────────────────────────────────────────────────
  {
    id: 'progress-eta-converge', title: 'ETA Convergence', category: C, order: 80, kind: 'chart',
    description: 'Why ETAs jump: the instant-rate estimate (dots) against an EWMA-smoothed one (solid) and the true time left (dashed) across stalls.',
    tags: ['eta', 'ewma', 'smoothing', 'chart', 'estimate'], size: { w: 72, h: 12 }, minSize: { w: 36, h: 4 }, loop: 11, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const secs = 9;
      const sim = transfer(ctx.rng, { total: 1, seconds: secs, burst: 0.9, stalls: 2, alpha: 0.015 });
      const tau = (secs / 480 / 0.015).toFixed(1);   // EWMA time constant in seconds
      const yMax = secs * 2;
      const series = (x) => {
        const s = sim.at(x);
        return { raw: s.finished ? 0 : (1 - s.done) / Math.max(1e-9, s.rate), ewma: s.eta, truth: Math.max(0, secs - x) };
      };
      const cRaw = th.warn, cEw = th.accent, cTr = th.ink;
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 11, 1);
        const now = series(Math.min(local, secs));
        const legend = [[g.unicode ? '···' : '...', cRaw], [' instant  ', th.muted], [g.unicode ? '━━' : '**', cEw], [` EWMA ${g.unicode ? 'τ' : 'tau'} ${tau}s  `, th.muted], [g.unicode ? '╌╌' : '--', cTr], [' actual', th.muted]];
        segs(b, 1, 0, W - 2, legend, g.ell);
        const at60 = series(secs * 0.4);
        const foot = local >= secs ? `${g.ok} done ${g.dot} at 40% elapsed: EWMA off by ${Math.abs(at60.ewma - at60.truth).toFixed(1)}s, instant by ${Math.abs(at60.raw - at60.truth).toFixed(1)}s`
          : `left: instant ${clock(Math.min(now.raw, 5999), { short: true })}  ewma ${clock(now.ewma, { short: true })}  actual ${clock(now.truth, { short: true })}`;
        b.text(1, H - 1, truncate(foot, W - 2, g.ell), th.ink);
        const ch = H - 2, lab = 5, cw = W - 2 - lab;
        if (ch < 2) return;
        b.text(1, 1, `${yMax}s`, th.dim);
        b.text(1, ch, '0s', th.dim);
        if (g.unicode) {
          const cv = new Canvas(cw, ch, { mode: 'braille', threshold: 0 });
          const pw = cv.width, ph = cv.height;
          const Y = (v) => Math.round((ph - 1) * (1 - Math.min(1, v / yMax)));
          for (let x = 0; x < pw; x += 2) cv.set(x, ph - 1, th.line);
          let prev = null;
          for (let x = 0; x < pw; x++) {
            const at = (x / (pw - 1)) * secs;
            if (at > local) break;
            const v = series(at);
            if (x % 6 < 4) cv.set(x, Y(v.truth), cTr);
            if (v.raw < yMax && x % 2 === 0) cv.set(x, Y(v.raw), cRaw);
            const y = Y(v.ewma);
            if (prev !== null) { cv.line(x - 1, prev, x, y, cEw); cv.line(x - 1, prev + 1, x, y + 1, cEw); } else cv.set(x, y, cEw);
            prev = y;
          }
          cv.paint(b, 1 + lab, 1);
        } else {
          const Y = (v) => 1 + Math.round((ch - 1) * (1 - Math.min(1, v / yMax)));
          for (let x = 0; x < cw; x++) {
            const at = (x / (cw - 1)) * secs;
            if (at > local) break;
            const v = series(at);
            if (x % 2 === 0) b.set(1 + lab + x, Y(v.truth), '-', cTr);
            if (v.raw < yMax) b.set(1 + lab + x, Y(v.raw), '.', cRaw);
            b.set(1 + lab + x, Y(v.ewma), '*', cEw);
          }
        }
      };
    },
  },

  // ── queue drain ──────────────────────────────────────────────────────
  {
    id: 'progress-queue-drain', title: 'Queue Drain', category: C, order: 90, kind: 'progress',
    description: 'A backlog draining while producers keep adding: consumers autoscale 4 → 8, the net rate sets the ETA, and the depth is charted.',
    tags: ['queue', 'backlog', 'autoscale', 'workers', 'eta'], size: { w: 64, h: 10 }, minSize: { w: 36, h: 2 }, loop: 13, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const dt = 0.05, N = Math.round(13 / dt);
      const start = 18402, scaleUp = 2.5, scaleDown = 11.5;
      const depth = new Float64Array(N + 1), inR = new Float64Array(N + 1), outR = new Float64Array(N + 1), workers = new Uint8Array(N + 1);
      const doneArr = new Float64Array(N + 1);
      let q = start, done = 0;
      for (let i = 0; i <= N; i++) {
        const tt = i * dt;
        const w = tt < scaleUp ? 4 : tt < scaleDown ? 8 : 2;
        const p = 410 + 90 * Math.sin(tt * 1.3) + (ctx.rng() - 0.5) * 120;
        const cap = w * (330 + (ctx.rng() - 0.5) * 60);
        const c = q > 0 ? cap : Math.min(cap, p);
        depth[i] = q; inR[i] = p; outR[i] = c; workers[i] = w; doneArr[i] = done;
        q = Math.max(0, q + (p - c) * dt);
        done += c * dt;
      }
      const at = (tt) => Math.min(N, Math.max(0, Math.round(tt / dt)));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 13, 1);
        const i = at(local);
        // Rates averaged over the last second, the way a dashboard would show them.
        const j = at(local - 1);
        const avg = (arr) => { let s = 0; for (let k = j; k <= i; k++) s += arr[k]; return s / (i - j + 1); };
        const pin = avg(inR), pout = avg(outR), net = pout - pin;
        const d = Math.round(depth[i]);
        const eta = d > 0 && net > 0 ? d / net : 0;
        const w = workers[i];
        const head = `queue thumbnails.render ${g.dot} ${commas(d)} waiting`;
        b.text(1, 0, truncate(head, W - 2, g.ell), d ? th.ink : th.pos, undefined, ATTR.BOLD);
        if (H < 3) { b.text(1, 1, truncate(`in ${Math.round(pin)}/s  out ${Math.round(pout)}/s  eta ${clock(eta, { short: true })}`, W - 2, g.ell), th.muted); return; }
        const bw = W - 2, n = Math.round((d / start) * bw);
        for (let x = 0; x < bw; x++) b.set(1 + x, 1, g.unicode ? (x < n ? '█' : '░') : x < n ? '#' : '.', x < n ? th.warn : th.line);
        const slots = (g.unicode ? '■' : '#').repeat(w) + (g.unicode ? '□' : '.').repeat(8 - Math.min(8, w));
        segs(b, 1, 2, W - 2, [['consumers ', th.muted], [slots, th.info], [`  ${w} running`, th.muted]], g.ell);
        const chartH = H - 6;
        if (chartH >= 1) {
          const len = W - 2;
          const data = Array.from({ length: len }, (_, k) => depth[at(local - (len - 1 - k) * 0.06)]);
          if (g.unicode) sparkline(b, 1, 3, W - 2, data.slice(-(W - 2)), { theme: th, height: chartH, min: 0, max: start * 1.05, color: mix(th.warn, th.bg, 0.45) });
          else data.slice(-(W - 2)).forEach((v, x) => { const h = Math.round((v / (start * 1.05)) * chartH); for (let y = 0; y < h; y++) b.set(1 + x, 3 + chartH - 1 - y, '|', th.warn); });
        }
        const y = H - 3;
        segs(b, 1, y, W - 2, [['in ', th.muted], [`+${Math.round(pin)}/s`, th.ink], ['  out ', th.muted], [`-${Math.round(pout)}/s`, th.ink], ['  net ', th.muted],
          [net > 0 && d > 0 ? `-${Math.round(net)}/s` : '0/s', th.ink], ['  eta ', th.muted], [d > 0 ? clock(eta, { short: true }) : 'drained', d > 0 ? th.accent : th.pos]], g.ell);
        b.text(1, y + 1, truncate(`processed ${commas(doneArr[i])} ${g.dot} produced ${commas(doneArr[i] + depth[i] - start)}`, W - 2, g.ell), th.dim);
        const ev = local >= scaleDown ? [`${g.unicode ? '▼' : 'v'} scaled consumers 8 ${g.arrow} 2 (queue idle 60s)`, th.muted]
          : local >= scaleUp ? [`${g.unicode ? '▲' : '^'} scaled consumers 4 ${g.arrow} 8 (backlog > 10,000)`, th.info] : [`${g.dot} watching backlog (scale-up threshold 10,000)`, th.dim];
        b.text(1, y + 2, truncate(ev[0], W - 2, g.ell), ev[1]);
      };
    },
  },

  // ── throughput gauge ─────────────────────────────────────────────────
  {
    id: 'progress-throughput', title: 'Throughput Gauge', category: C, order: 100, kind: 'progress',
    description: 'A needle gauge of link use during a backup stream, beside the running total, average and peak and a rolling rate sparkline.',
    tags: ['throughput', 'gauge', 'bandwidth', 'network', 'backup'], size: { w: 64, h: 10 }, minSize: { w: 30, h: 2 }, loop: 12, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const link = 1.25e9, secs = 12, base = 18.4e9;
      const sim = transfer(ctx.rng, { total: 0.6 * link * secs, seconds: secs, burst: 0.6, stalls: 1, warmup: 0.02, alpha: 0.3 });
      // Scale the whole run so its fastest instant stays under line rate — a 10GbE link can't burst past 1.25 GB/s.
      let fastest = 0;
      for (let i = 0; i <= 480; i++) fastest = Math.max(fastest, sim.at((i / 480) * secs).rate);
      const k = Math.min(1, (0.97 * link) / fastest);
      const at = (sec) => { const s = sim.at(sec); return { ...s, done: s.done * k, rate: s.rate * k, smooth: s.smooth * k, avg: s.avg * k }; };
      let peak = 0;
      const gb = (n) => `${(n / 1e9).toFixed(2)} GB`;
      const rateTxt = (r) => (r >= 1e9 ? `${(r / 1e9).toFixed(2)} GB/s` : `${Math.round(r / 1e6)} MB/s`);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 12, 1);
        const s = at(local);
        peak = 0;
        for (let i = 0; i <= 60; i++) peak = Math.max(peak, at((i / 60) * local).smooth);
        const u = clamp01(s.smooth / link);
        const gw = H >= 6 && W >= 52 ? Math.min(26, Math.floor(W * 0.42)) : 0;
        if (gw) {
          if (g.unicode) gauge(b, 0, 0, gw, H, u, { theme: th, label: 'egress', valueText: rateTxt(s.smooth), thresholds: [[0.75, 'warn'], [0.92, 'neg']], color: th.pos });
          else {
            const n = Math.round(u * (gw - 4));
            b.text(1, 1, rateTxt(s.smooth), th.ink, undefined, ATTR.BOLD);
            b.text(1, 2, `[${'#'.repeat(n)}${'.'.repeat(gw - 4 - n)}]`, u > 0.92 ? th.neg : u > 0.75 ? th.warn : th.pos);
            b.text(1, 3, 'egress', th.muted);
          }
        }
        const x = gw ? gw + 2 : 1, w = W - x - 1;
        const lines = [
          [['backup stream ', th.muted], [`${g.arrow} 10.20.0.31`, th.ink]],
          [['sent   ', th.muted], [gb(base + s.done), th.ink, ATTR.BOLD]],
          [['now    ', th.muted], [`${rateTxt(s.smooth)}  ${Math.round(u * 100)}% of 10GbE`, u > 0.92 ? th.neg : u > 0.75 ? th.warn : th.ink]],
          [['avg    ', th.muted], [rateTxt(s.avg), th.ink], ['  peak ', th.muted], [rateTxt(peak), th.ink]],
        ];
        const rows = gw ? lines : lines.slice(1, 1 + H);
        rows.forEach((r, i) => { if (i < H) segs(b, x, i, w, r, g.ell); });
        if (gw && H >= 7) {
          const data = Array.from({ length: w * 2 }, (_, i) => at(Math.max(0, local - (w * 2 - 1 - i) * 0.1)).rate);
          if (g.unicode) sparkline(b, x, H - 2, w, data, { theme: th, style: 'braille', height: 2, min: 0, max: link, color: th.info });
          else data.filter((_, k) => k % 2).forEach((v, k) => b.set(x + k, H - 1, ASCII_SPARK[Math.min(7, Math.round((v / link) * 7))], th.info));
          b.text(x, H - 3, truncate('last 6s', w, g.ell), th.dim);
        }
      };
    },
  },
];
