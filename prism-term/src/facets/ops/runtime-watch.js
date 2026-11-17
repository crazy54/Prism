// Live runtime views: a GPU training node under `watch nvidia-smi` (550 driver table), supervisord
// managing a Python app from a small shell pane, and strace following an API worker's network and file calls.
// Screens are pure functions of t % loop; every loop ends on the same beat it starts with.
import { G, C, ATTR, writer, clock, typed, blink, hash, pad, lpad } from './_kit.js';
import { phase, cut, watchTitle, drawTranscript, promptParts } from './_watch.js';

const shared = { glyphs: 'ascii', color: '16' };
const hms = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const ctime = (k) => `${k.day} ${k.mon} ${k.dd} ${k.hms} ${k.date.slice(0, 4)}`;

// ── GPU monitor: watch -n1 nvidia-smi on a two-GPU training node ──────────────────────────────
const GLOOP = 20;
const BAR = `+${'-'.repeat(89)}+`, CELLS = (a, b, c) => `${a}${'-'.repeat(41)}${b}${'-'.repeat(24)}${b}${'-'.repeat(22)}${c}`;
const SEP = CELLS('|', '+', '+'), GSEP = CELLS('+', '+', '+'), EQ = `|${'='.repeat(41)}+${'='.repeat(24)}+${'='.repeat(22)}|`;
const TOTAL = 81559;
// One 10 s cycle, sampled once a second (watch -n1); a checkpoint save at p = 7 drains the GPUs.
const UTIL = [97, 99, 98, 100, 99, 97, 99, 8, 61, 96];
const POWER = [688, 692, 690, 695, 693, 689, 691, 121, 452, 668];
const TEMP = [66, 67, 67, 67, 67, 67, 67, 65, 63, 64];
const CKPT = (p) => (p === 7 || p === 8 ? 4096 : 0); // the gathered state dict sits on the GPU during the save
const GPUS = [{ bus: '00000000:18:00.0', mem: 71234, proc: 71212, dU: 0, dP: 0, dT: 0 }, { bus: '00000000:2A:00.0', mem: 75510, proc: 69104, dU: -2, dP: -17, dT: -3 }];
const GPU_NAME = 'NVIDIA H100 80GB HBM3';
const QUERY = 'nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,temperature.gpu,power.draw --format=csv; nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv';

const gpuMonitor = {
  ...shared,
  id: 'ops-gpu-monitor',
  since: '0.3.0',
  title: 'GPU Monitor',
  category: 'System Monitors',
  order: 200,
  description: 'watch nvidia-smi on a two-GPU training server: utilization pinned near 100% until a checkpoint save drops power to 120 W and steps memory up, then the load returns.',
  tags: ['nvidia-smi', 'gpu', 'cuda', 'training', 'utilization', 'vram', 'watch', 'ml', 'accelerator'],
  kind: 'tui',
  size: { w: 92, h: 29 },
  minSize: { w: 56, h: 8 },
  loop: GLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const table = W >= 76 && H >= 19; // the GPU-Util cell ends at column 75
    const sample = (s) => {
      const p = s % 10;
      return GPUS.map((g, i) => {
        const steady = p !== 7 && p !== 8;
        const jitter = steady ? Math.round(hash(p * 2 + i, 41) * 2) - 1 : 0;
        const util = Math.max(0, Math.min(100, UTIL[p] + g.dU + jitter));
        const watts = POWER[p] + g.dP + jitter * 3 + hash(p * 2 + i, 43);
        return { ...g, i, util, watts, temp: TEMP[p] + g.dT, used: g.mem + CKPT(p), procMem: g.proc + CKPT(p) };
      });
    };
    const procs = (gs) => [[0, 184213, '/opt/conda/bin/python3', gs[0].procMem], [1, 184213, '/opt/conda/bin/python3', gs[1].procMem], [1, 9921, '/opt/tritonserver/bin/tritonserver', 6384]];
    return (t) => {
      const T = phase(t, GLOOP), s = Math.floor(T);
      const gs = sample(s);
      if (!table) { // compact: the CSV query interface, one line per GPU and per compute process
        watchTitle(w, c, 0, 1, QUERY, 'gpu-node-07', s);
        let y = 2;
        w.seg(0, y++, cut([['index, name, utilization.gpu [%], memory.used [MiB], temperature.gpu, power.draw [W]', c.muted]], W));
        for (const g of gs) {
          w.seg(0, y++, cut([[`${g.i}, ${GPU_NAME}, `, c.fg], [`${g.util} %`, g.util >= 90 ? c.yellow : c.fg, ATTR.BOLD], [', ', c.fg],
            [`${g.used} MiB`, g.used / TOTAL >= 0.9 ? c.yellow : c.fg], [', ', c.fg], [String(g.temp), g.temp >= 80 ? c.red : c.fg],
            [', ', c.fg], [`${g.watts.toFixed(2)} W`, g.watts < 200 ? c.blue : c.fg]], W));
        }
        if (y < H) w.seg(0, y++, cut([['pid, process_name, used_gpu_memory [MiB]', c.muted]], W));
        for (const [, pid, name, mem] of procs(gs)) if (y < H) w.seg(0, y++, cut([[`${pid}, ${name}, ${mem} MiB`, c.fg]], W));
        return;
      }
      watchTitle(w, c, 0, 1, 'nvidia-smi', 'gpu-node-07', s);
      const rows = [
        [[`${ctime(clock(s))}       `, c.fg]],
        [[BAR, c.muted]],
        [['| ', c.muted], ['NVIDIA-SMI 550.54.15              Driver Version: 550.54.15      CUDA Version: 12.4', c.muted, ATTR.BOLD], ['     |', c.muted]],
        [[SEP, c.muted]],
        [['| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |', c.muted]],
        [['| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |', c.muted]],
        [['|                                         |                        |               MIG M. |', c.muted]],
        [[EQ, c.muted]],
      ];
      for (const g of gs) {
        const memWarn = g.used / TOTAL >= 0.9, utilWarn = g.util >= 90, watts = Math.round(g.watts);
        rows.push([['|', c.muted], [`   ${g.i}  ${pad(GPU_NAME, 31)}On  `, c.fg, ATTR.BOLD], ['|', c.muted], [`   ${g.bus} Off `, c.fg], ['|', c.muted], [`${lpad('0', 21)} `, c.fg], ['|', c.muted]]);
        rows.push([['|', c.muted], [pad(` N/A   ${lpad(g.temp, 2)}C    P0`, 27), g.temp >= 80 ? c.red : c.fg], [`${lpad(watts, 4)}W / ${lpad(700, 4)}W `, watts < 200 ? c.blue : c.fg],
          ['|', c.muted], [`${lpad(`${g.used}MiB`, 11)} / ${lpad(`${TOTAL}MiB`, 9)} `, memWarn ? c.yellow : c.fg, memWarn ? ATTR.BOLD : 0], ['|', c.muted],
          [lpad(`${g.util}%`, 8), utilWarn ? c.yellow : c.fg, ATTR.BOLD], ['      Default ', c.fg], ['|', c.muted]]);
        rows.push([['|                                         |                        |             Disabled |', c.muted]]);
        rows.push([[GSEP, c.muted]]);
      }
      rows.push([['', c.fg]], [[BAR, c.muted]],
        [['| Processes:                                                                              |', c.muted]],
        [['|  GPU   GI   CI        PID   Type   Process name                              GPU Memory |', c.muted]],
        [['|        ID   ID                                                               Usage      |', c.muted]],
        [[`|${'='.repeat(89)}|`, c.muted]]);
      for (const [gpu, pid, name, mem] of procs(gs)) {
        rows.push([['|', c.muted], [`${lpad(gpu, 5)}${lpad('N/A', 6)}${lpad('N/A', 5)}${lpad(pid, 10)}${lpad('C', 7)}   `, c.fg], [pad(name, 42), c.fg, ATTR.BOLD], [`${lpad(`${mem}MiB`, 10)} `, c.fg], ['|', c.muted]]);
      }
      rows.push([[BAR, c.muted]]);
      rows.slice(0, H - 2).forEach((parts, y) => w.seg(0, 2 + y, cut(parts, W)));
    };
  },
};

// ── supervisorctl: watch supervisorctl status above a small shell pane ─────────────────────────────
const SLOOP = 30;
const PROGS = [['celery-beat', 1201], ['celery-worker:celery-worker_00', 1202], ['celery-worker:celery-worker_01', 1203], ['flower', 0], ['gunicorn', 1205], ['nginx-exporter', 1206]];
const QUICK_EXIT = 'Exited too quickly (process log may have details)';
// flower dies before startsecs after every `restart all`: backoff 1 s, 2 s, 3 s between retries, then FATAL.
const flowerAt = (s) => (s < 2 ? 'STARTING' : s < 4 ? 'BACKOFF' : s < 6 ? 'STARTING' : s < 9 ? 'BACKOFF' : s < 11 ? 'STARTING' : s < 15 ? 'FATAL' : s < 16 ? 'STARTING' : 'RUNNING');
const START_FLOWER = 13.4, STARTED = 16.0, RESTART_ALL = 24.4, STOPPED_AT = 26.9, RESULTS_AT = 29.1;
const STOP_OUT = PROGS.map(([n]) => `${n}: stopped`);
const START_OUT = PROGS.map(([n]) => (n === 'flower' ? `${n}: ERROR (spawn error)` : `${n}: started`));
// Narrower panes watch a condensed pipeline instead: name, state and uptime.
const CONDENSED = `supervisorctl status | awk '{printf "%-31s%-9s%s\\n", $1, $2, ($2 == "RUNNING" ? $6 : "")}'`;

const processSupervisor = {
  ...shared,
  id: 'ops-supervisorctl',
  since: '0.3.0',
  title: 'supervisorctl status',
  category: 'Processes & Services',
  order: 200,
  description: 'watch supervisorctl status on a supervisord app: flower crash-loops through BACKOFF to FATAL, is started again by hand, then restart all cycles every program.',
  tags: ['supervisord', 'supervisorctl', 'process', 'daemon', 'celery', 'gunicorn', 'backoff', 'workers', 'watch'],
  kind: 'tui',
  size: { w: 80, h: 12 },
  minSize: { w: 56, h: 6 },
  loop: SLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    // The status pane stays dominant; commands are typed in a 2-row shell pane under the border.
    const full = W >= 67; // a whole supervisorctl status row is 67 columns
    const pane = full && H >= 11, head = H >= 8; // head: watch's title row fits above the six programs
    const shellRows = 2, by = H - shellRows - 1;
    const stateColor = { RUNNING: c.green, STARTING: c.blue, STOPPING: c.blue, BACKOFF: c.yellow, FATAL: c.red };
    const state = (name, pid, s) => { // → { st, desc } as supervisorctl prints them
      if (s === 26) return { st: 'STOPPING', desc: '' };
      if (s === 27 || s === 28) return { st: 'STARTING', desc: '' };
      if (name === 'flower') {
        const st = s === 29 ? 'BACKOFF' : flowerAt(s);
        if (st === 'RUNNING') return { st, desc: `pid 1251, uptime ${hms(s - 15)}` };
        return { st, desc: st === 'BACKOFF' || st === 'FATAL' ? QUICK_EXIT : '' };
      }
      return { st: 'RUNNING', desc: `pid ${pid}, uptime ${hms(s >= 29 ? s - 28 : s + 2)}` };
    };
    const host = 'app01', cur = (T) => blink(T, 1);
    // The previous cycle's `restart all` is still on screen when the loop begins.
    const carried = [promptParts(c, host, 'supervisorctl restart all', false), ...STOP_OUT.map((s) => [[s, c.fg]]),
      ...START_OUT.map((s) => [[s, s.includes('ERROR') ? c.red : c.fg]])];
    const shell = (T) => {
      const lines = [...carried];
      const a = typed('supervisorctl start flower', T, START_FLOWER, 18);
      if (T < STARTED) { lines.push(promptParts(c, host, a.text, !a.done && cur(T))); return lines; }
      lines.push(promptParts(c, host, a.text, false), [['flower: started', c.green]]);
      const b = typed('supervisorctl restart all', T, RESTART_ALL, 18);
      lines.push(promptParts(c, host, b.text, !b.done && cur(T)));
      if (T >= STOPPED_AT) lines.push(...STOP_OUT.map((s) => [[s, c.fg]]));
      if (T >= RESULTS_AT) lines.push(...START_OUT.map((s) => [[s, s.includes('ERROR') ? c.red : c.fg]]), promptParts(c, host, '', cur(T)));
      return lines;
    };
    return (t) => {
      const T = phase(t, SLOOP), s = Math.floor(T);
      const y0 = head ? 2 : 0;
      if (head) watchTitle(w, c, 0, 1, full ? 'supervisorctl status' : CONDENSED, host, s);
      PROGS.forEach(([name, pid], i) => {
        if (y0 + i >= H) return;
        const { st, desc } = state(name, pid, s);
        if (!full) {
          const up = desc.startsWith('pid') ? desc.split('uptime ')[1] : '';
          w.seg(0, y0 + i, [[pad(name, 31), c.fg], [pad(st, 9), stateColor[st], st === 'FATAL' ? ATTR.BOLD : 0], [up, c.muted]]);
          return;
        }
        const parts = [[pad(name, 33), c.fg], [pad(st, 10), stateColor[st], ATTR.BOLD]];
        if (desc.startsWith('pid')) { const [p, up] = desc.split(','); parts.push([p, c.muted], [`,${up}`, c.fg]); }
        else if (desc) parts.push([desc, st === 'FATAL' ? c.red : c.yellow]);
        w.seg(0, y0 + i, cut(parts, W));
      });
      if (!pane) return;
      w.hline(0, by, W, g.h, c.green);
      drawTranscript({ width: W, height: shellRows, seg: (x, y, parts) => w.seg(x, by + 1 + y, parts) }, shell(T));
    };
  },
};

// ── syscall trace: strace -f -tt -T -C -w attached to an API worker ──────────────────────────
const TLOOP = 24;
const STRACE = 'sudo strace -f -tt -T -C -w -e trace=openat,read,connect,poll,sendto,recvfrom -p 4182';
const ATTACH_AT = 4.1, DETACH_AT = 18.6, TCLEAR_AT = 22.4;
// [syscall, args, return]: strings are cut at strace's default 32 bytes.
const RECV = ['recvfrom', '11, "GET /v1/facets?gallery=ops HTTP/"..., 8192, 0, NULL, NULL', '214'];
const REQ = [RECV,
  ['openat', 'AT_FDCWD, "/srv/prism/catalog/ops.json", O_RDONLY|O_CLOEXEC', '12'],
  ['read', '12, "{\\"gallery\\":\\"ops\\",\\"facets\\":[{\\"id\\""..., 65536', '48213'],
  ['sendto', '9, "Q\\0\\0\\0003SELECT etag FROM catalog WH"..., 52, MSG_NOSIGNAL, NULL, 0', '52'],
  ['poll', '[{fd=9, events=POLLIN}], 1, 5000', '1 ([{fd=9, revents=POLLIN}])'],
  ['recvfrom', '9, "T\\0\\0\\0\\35\\0\\1etag\\0\\0\\0@\\24\\0\\3\\0\\0\\0\\31\\377\\377\\377\\377\\377\\377\\0\\0D\\0"..., 16384, 0, NULL, NULL', '71'],
  ['sendto', '11, "HTTP/1.1 200 OK\\r\\nContent-Type: a"..., 48420, MSG_NOSIGNAL, NULL, 0', '48420'],
];
const CONFIG = [['openat', 'AT_FDCWD, "/etc/prism/api.toml", O_RDONLY|O_CLOEXEC', '7'], ['read', '7, "[server]\\nbind = \\"0.0.0.0:8080\\"\\nw"..., 4096', '312']];
const MISS = ['openat', 'AT_FDCWD, "/var/lib/prism/cache.db", O_RDWR|O_CLOEXEC', '-1 ENOENT (No such file or directory)'];
const RECONNECT = [['connect', '9, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("10.0.4.12")}, 16', '-1 EINPROGRESS (Operation now in progress)'],
  ['poll', '[{fd=9, events=POLLOUT}], 1, 5000', '1 ([{fd=9, revents=POLLOUT}])']];
// [burst start (s), thread, variant]: requests arrive in bursts with idle gaps (epoll_wait is not traced).
const BURSTS = [[4.6, 4182, 'config'], [5.3, 4190, 'req'], [6.9, 4191, 'miss'], [7.5, 4190, 'req'], [9.7, 4191, 'slow'], [10.3, 4190, 'reconnect'],
  [12.4, 4191, 'req'], [13.8, 4190, 'miss'], [15.0, 4191, 'req'], [16.6, 4190, 'slow'], [17.6, 4191, 'req']];
const RULE = '------ ----------- ----------- --------- --------- ------------------';

const syscallTrace = {
  ...shared,
  id: 'ops-strace',
  since: '0.3.0',
  title: 'strace -f -p',
  category: 'Processes & Services',
  order: 210,
  description: 'strace -f -tt -T on a live API worker: bursts of openat/read/sendto/recvfrom, an ENOENT, a slow 126 ms poll, then ^C detach and the -C summary table.',
  tags: ['strace', 'syscall', 'trace', 'debugging', 'network', 'ptrace', 'enoent', 'latency', 'linux'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 60, h: 6 },
  loop: TLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const chop = ctx.width < 72;
    // Expand the bursts into timed calls: each takes its own time, with a few µs of user time between.
    const events = [];
    for (const [at, tid, kind] of BURSTS) {
      const calls = kind === 'config' ? CONFIG : kind === 'miss' ? [RECV, MISS, ...REQ.slice(1)] : kind === 'reconnect' ? [RECV, ...RECONNECT, ...REQ.slice(3)] : REQ;
      let ts = at + hash(Math.round(at * 100), 11) * 0.08;
      calls.forEach((call, i) => {
        const n = Math.round(at * 100) + i;
        const slow = kind === 'slow' && call[0] === 'poll';
        const dur = slow ? 0.126391 + hash(n, 3) * 0.004 : 0.000012 + hash(n, 7) * 0.00009 + (call[0] === 'poll' ? 0.0019 : 0);
        events.push({ at: ts, tid, call, dur, slow, err: call[2].startsWith('-1') });
        ts += dur + 0.00004 + hash(n, 9) * 0.0003;
      });
    }
    // The -C summary, from exactly the calls shown (-w: wall-clock time), sorted by time like strace.
    const byName = new Map();
    for (const e of events) {
      const r = byName.get(e.call[0]) ?? { name: e.call[0], us: 0, calls: 0, errors: 0 };
      r.us += Math.round(e.dur * 1e6); r.calls++; r.errors += e.err ? 1 : 0;
      byName.set(r.name, r);
    }
    const table = [...byName.values()].sort((a, b) => b.us - a.us);
    const sum = table.reduce((t, r) => ({ name: 'total', us: t.us + r.us, calls: t.calls + r.calls, errors: t.errors + r.errors }), { us: 0, calls: 0, errors: 0 });
    const sumRow = (r) => `${((r.us / sum.us) * 100).toFixed(2).padStart(6)} ${(r.us / 1e6).toFixed(6).padStart(11)} ${String(Math.floor(r.us / r.calls)).padStart(11)} ${String(r.calls).padStart(9)} ${(r.errors ? String(r.errors) : '').padStart(9)} ${r.name}`;
    const summary = [[['% time     seconds  usecs/call     calls    errors syscall', c.fg, ATTR.BOLD]], [[RULE, c.muted]],
      ...table.map((r) => [[sumRow(r), r === table[0] ? c.yellow : c.fg]]), [[RULE, c.muted]], [[sumRow(sum), c.fg, ATTR.BOLD]]];
    const line = (e) => {
      const k = clock(Math.floor(e.at)), us = String(Math.floor((e.at % 1) * 1e6)).padStart(6, '0');
      const [name, args, ret] = e.call;
      return [[`[pid ${lpad(e.tid, 5)}] `, c.muted], [`${k.hms}.${us} `, c.dim], [name, c.blue, ATTR.BOLD], ['(', c.fg], [args, c.muted], [') = ', c.fg],
        [ret, e.err ? c.red : c.fg, e.err ? ATTR.BOLD : 0], [` <${e.dur.toFixed(6)}>`, e.slow ? c.yellow : c.dim, e.slow ? ATTR.BOLD : 0]];
    };
    return (t) => {
      const T = phase(t, TLOOP);
      if (T >= TCLEAR_AT) { drawTranscript(w, [promptParts(c, 'api02', '', blink(T, 0.8))]); return; }
      const ty = typed(STRACE, T, 0.3, 26);
      const lines = [promptParts(c, 'api02', ty.text, !ty.done && blink(T, 0.8))];
      if (T >= ATTACH_AT) lines.push([['strace: Process 4182 attached with 4 threads', c.fg]]);
      for (const e of events) if (e.at + e.dur <= Math.min(T, DETACH_AT)) lines.push(line(e));
      if (T >= DETACH_AT) {
        const top = lines.length + 4; // the -C table's header, after "^C" and the three thread detaches
        lines.push([['^C', c.fg], ['strace: Process 4182 detached', c.fg]], ...[4189, 4190, 4191].map((p) => [[`strace: Process ${p} detached`, c.fg]]), ...summary);
        const cl = typed('clear', T, 21.7, 14);
        lines.push(promptParts(c, 'api02', cl.text, T < 22.2 && blink(T, 0.8)));
        // Too short for the whole table and the prompt: the view stays scrolled back on the table's top rows.
        if (lines.length - top > ctx.height) { drawTranscript(w, lines.slice(top, top + ctx.height), 0, { chop, marker: c.muted }); return; }
      }
      drawTranscript(w, lines, 0, { chop, marker: c.muted });
    };
  },
};

export default [gpuMonitor, processSupervisor, syscallTrace];
