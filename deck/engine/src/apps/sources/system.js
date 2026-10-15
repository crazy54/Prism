// Live system source (Node): cpu · mem · gpu · disk · net · temp · battery · uptime, plus
// sys details and series history (README.md). Read-only, throttled, never elevated:
//
//   all       os.cpus() time deltas (total + per core) · os.uptime() · fs.statfs (disk used, every 30 s)
//   linux     /proc/meminfo · /proc/net/dev · /proc/diskstats · thermal zones (5 s) · power_supply (30 s)
//             GPU: /sys/class/drm/card*/device/gpu_busy_percent, else nvidia-smi if on PATH (2 s)
//   darwin    vm_stat (5 s) · netstat -ibn (2 s) · ioreg IOAccelerator (3 s) · pmset -g batt (60 s)
//   win32     os.freemem · one long-running `typeperf … -si 2` for net / disk IO / GPU 3D (restarted every
//             10 min to pick up new GPU processes) · PowerShell CIM Win32_Battery (2 min; stops if none)
//
// A metric the machine can't give is null (facets show "—"), never invented. Dependencies are
// injected — { sys (src/audio/system.js nodeSystem()), os, fs: { readFile, readdir, statfs } } —
// so tests drive it with fake files and fake processes; src/apps/sources/node.js wires the real ones.

import { createPoller, History, stable } from './_source.js';
import * as P from './probes.js';
import { SYSTEM_KEYS } from './simulated.js';

const SERIES = ['cpu', 'mem', 'gpu', 'down', 'up', 'read', 'write', 'temp'];

export function createSystemSource({ sys, os, fs, rate = 1, history = 60, typeperfEvery = 2, root } = {}) {
  if (!sys || !os) throw new Error('createSystemSource needs { sys, os } (see src/apps/sources/node.js)');
  const platform = sys.platform;
  const now = () => sys.now();
  const v = { cpu: null, mem: null, gpu: null, disk: null, net: null, temp: null, battery: null, uptime: null };
  const cpus0 = safe(() => os.cpus()) || [];
  const info = { cores: null, cpuModel: String(cpus0[0]?.model || '').replace(/\s+/g, ' ').trim() || null, cpuGhz: cpus0[0]?.speed ? Math.round(cpus0[0].speed / 100) / 10 : null, memTotal: safe(() => os.totalmem()) || null, memUsed: null, diskTotal: null, diskFree: null, diskRead: null, diskWrite: null, charging: null, platform };
  const ser = Object.fromEntries(SERIES.map((k) => [k, new History(history)]));
  const counters = { net: null, disk: null };
  let prevCpu = cpuTimes(os), running = false, child = null, restartAt = 0, restarts = 0, tpTimer = null, gpuPath = null, gpuTool = null;
  const statRoot = root || (platform === 'win32' ? `${sys.env?.SystemDrive || 'C:'}\\` : '/');
  const read = (p) => fs.readFile(p);
  const ok = true;

  // ── probes ────────────────────────────────────────────────────────────────
  const probes = [
    { id: 'cpu', every: 1 / rate, run() {
      const cur = cpuTimes(os);
      if (prevCpu && cur.total > prevCpu.total) {
        v.cpu = clamp01(1 - (cur.idle - prevCpu.idle) / (cur.total - prevCpu.total));
        info.cores = cur.per.map((c, i) => { const p = prevCpu.per[i]; return p && c.total > p.total ? clamp01(1 - (c.idle - p.idle) / (c.total - p.total)) : 0; });
      }
      prevCpu = cur;
      v.uptime = safe(() => os.uptime()) ?? null;
      return ok;
    } },
    { id: 'mem', every: platform === 'darwin' ? 5 : 2, async run() {
      const total = safe(() => os.totalmem());
      if (platform === 'linux' && fs?.readFile) {
        const m = P.parseMeminfo(await read('/proc/meminfo'));
        if (m) { v.mem = m.used; info.memUsed = m.usedBytes; info.memTotal = m.total; return ok; }
      }
      if (platform === 'darwin') {
        const r = await sys.run('vm_stat', [], { timeoutMs: 1500 });
        const m = r.code === 0 ? P.parseVmStat(r.stdout) : null;
        if (m && total) { info.memUsed = Math.min(total, m.usedBytes); v.mem = clamp01(info.memUsed / total); return ok; }
      }
      if (!total) return undefined;
      info.memUsed = total - os.freemem();
      v.mem = clamp01(info.memUsed / total);
      return ok;
    } },
    { id: 'disk', every: 30, async run() {
      if (!fs?.statfs) return null;
      const s = await fs.statfs(statRoot);
      if (!s?.blocks) return null;
      info.diskTotal = s.blocks * s.bsize; info.diskFree = s.bavail * s.bsize;
      v.disk = clamp01(1 - s.bfree / s.blocks);
      return ok;
    } },
  ];
  if (platform === 'linux') probes.push(
    { id: 'net', every: 1, async run() { return applyCounters('net', P.parseNetDev(await read('/proc/net/dev'))); } },
    { id: 'diskio', every: 1, async run() { return applyCounters('disk', P.parseDiskstats(await read('/proc/diskstats'))); } },
    { id: 'gpu', every: 2, async run() {
      if (gpuPath === null) gpuPath = await findDrmBusy(fs) || '';
      if (gpuPath) { const x = Number(String(await read(gpuPath)).trim()); if (Number.isFinite(x)) { v.gpu = clamp01(x / 100); return ok; } }
      if (gpuTool === null) gpuTool = sys.which?.('nvidia-smi') || '';
      if (!gpuTool) return null;
      const r = await sys.run(gpuTool, ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { timeoutMs: 1500 });
      const g = r.code === 0 ? P.parseNvidiaSmi(r.stdout) : null;
      if (g === null) return undefined;
      v.gpu = g; return ok;
    } },
    { id: 'temp', every: 5, async run() {
      const dirs = (await fs.readdir('/sys/class/thermal').catch(() => [])).filter((d) => /^thermal_zone\d+$/.test(d));
      const zones = await Promise.all(dirs.map(async (d) => ({ type: await read(`/sys/class/thermal/${d}/type`).catch(() => ''), temp: await read(`/sys/class/thermal/${d}/temp`).catch(() => '') })));
      const c = P.pickThermal(zones);
      if (c === null) return null;
      v.temp = c; return ok;
    } },
    { id: 'battery', every: 30, async run() {
      const bats = (await fs.readdir('/sys/class/power_supply').catch(() => [])).filter((d) => /^BAT/i.test(d));
      if (!bats.length) return null;
      const cap = Number(String(await read(`/sys/class/power_supply/${bats[0]}/capacity`)).trim());
      const status = String(await read(`/sys/class/power_supply/${bats[0]}/status`).catch(() => '')).trim();
      if (!Number.isFinite(cap)) return undefined;
      v.battery = clamp01(cap / 100); info.charging = /^(charging|full)$/i.test(status); return ok;
    } },
  );
  if (platform === 'darwin') probes.push(
    { id: 'net', every: 2, async run() { const r = await sys.run('netstat', ['-ibn'], { timeoutMs: 1500 }); return r.code === 0 ? applyCounters('net', P.parseNetstatIb(r.stdout)) : undefined; } },
    { id: 'gpu', every: 3, async run() { const r = await sys.run('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'], { timeoutMs: 2000 }); if (r.code !== 0) return undefined; const g = P.parseIoregGpu(r.stdout); if (g === null) return null; v.gpu = g; return ok; } },
    { id: 'battery', every: 60, async run() { const r = await sys.run('pmset', ['-g', 'batt'], { timeoutMs: 1500 }); if (r.code !== 0) return undefined; const b = P.parsePmset(r.stdout); if (!b) return null; v.battery = b.level; info.charging = b.charging; return ok; } },
  );
  if (platform === 'win32') probes.push(
    { id: 'battery', every: 120, async run() {
      const r = await sys.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance -ClassName Win32_Battery | Measure-Object -Property EstimatedChargeRemaining -Average).Average'], { timeoutMs: 8000 });
      if (r.timedOut || r.error) return undefined;
      const b = P.parseWinBattery(r.stdout);
      if (b === null) return null;
      v.battery = b; return ok;
    } },
  );

  function applyCounters(kind, cur) {
    if (!cur) return undefined;
    const t = now(), prev = counters[kind];
    counters[kind] = { ...cur, t };
    if (!prev) return ok;
    const r = P.rateOf(prev, cur, t - prev.t);
    if (kind === 'net') v.net = r && r.rx !== null && r.tx !== null ? { down: r.rx, up: r.tx } : v.net;
    else if (r) { info.diskRead = r.read; info.diskWrite = r.write; }
    return ok;
  }

  // ── Windows: one streaming typeperf ───────────────────────────────────────
  function startTypeperf() {
    if (platform !== 'win32' || !running || child) return;
    let buf = '', cols = null;
    const dec = new TextDecoder();
    try { child = sys.spawn('typeperf', [...P.TYPEPERF_COUNTERS, '-si', String(typeperfEvery)], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); } catch { child = null; return giveUp(); }
    restartAt = now() + 10 * 60 * 1000;
    child.stdout?.on('data', (d) => {
      buf += typeof d === 'string' ? d : dec.decode(d, { stream: true });
      if (buf.length > 1 << 20) buf = buf.slice(-4096);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        if (!cols) { if (line.startsWith('"(PDH-CSV')) cols = P.typeperfColumns(line); continue; }
        const r = P.typeperfRow(line, cols);
        if (!r) continue;
        if (r.down !== null && r.up !== null) v.net = { down: r.down, up: r.up };
        if (r.read !== null) info.diskRead = r.read;
        if (r.write !== null) info.diskWrite = r.write;
        if (r.gpu !== null) v.gpu = r.gpu;
        restarts = 0;
      }
    });
    const gone = () => {
      child = null;
      if (!running) return;
      if (++restarts > 3) return giveUp();
      tpTimer = sys.setTimer(startTypeperf, 5000 * restarts);
    };
    child.on?.('exit', gone);
    child.on?.('error', () => {});
  }
  function giveUp() { v.gpu = v.gpu ?? null; v.net = v.net ?? null; }
  function stopTypeperf() { if (tpTimer !== null) sys.clearTimer(tpTimer); tpTimer = null; const c = child; child = null; try { c?.kill(); } catch { /* gone */ } }

  const poller = createPoller({
    probes, rate, now, setTimer: sys.setTimer, clearTimer: sys.clearTimer,
    onTick() {
      if (platform === 'win32' && child && now() > restartAt) { stopTypeperf(); startTypeperf(); }
      ser.cpu.push(v.cpu ?? 0); ser.mem.push(v.mem ?? 0); ser.gpu.push(v.gpu ?? 0); ser.temp.push(v.temp ?? 0);
      ser.down.push(v.net?.down ?? 0); ser.up.push(v.net?.up ?? 0); ser.read.push(info.diskRead ?? 0); ser.write.push(info.diskWrite ?? 0);
    },
  });

  return {
    id: 'system', provides: [...SYSTEM_KEYS], rate, mode: 'live',
    get running() { return running; },
    start() { if (running) return this; running = true; prevCpu = cpuTimes(os); poller.start(); startTypeperf(); return this; },
    stop() { running = false; poller.stop(); stopTypeperf(); return this; },
    snapshot() {
      const series = { step: 1 / rate };
      for (const k of SERIES) if (ser[k].length >= 2) series[k] = ser[k].values();
      return stable({ ...v, sys: { ...info, memTotal: info.memTotal, cores: info.cores }, series });
    },
    status() {
      return { id: 'system', mode: 'live', running, platform, probes: Object.fromEntries(probes.map((p) => [p.id, poller.state(p.id)])), typeperf: platform === 'win32' ? { running: !!child, restarts } : undefined };
    },
  };
}

function cpuTimes(os) {
  const list = safe(() => os.cpus()) || [];
  let idle = 0, total = 0;
  const per = list.map((c) => { const t = c.times; const tot = t.user + t.nice + t.sys + t.irq + t.idle; idle += t.idle; total += tot; return { idle: t.idle, total: tot }; });
  return { idle, total, per };
}
async function findDrmBusy(fs) {
  const cards = (await fs.readdir('/sys/class/drm').catch(() => [])).filter((d) => /^card\d+$/.test(d));
  for (const c of cards) { const p = `/sys/class/drm/${c}/device/gpu_busy_percent`; if (await fs.readFile(p).then(() => true, () => false)) return p; }
  return null;
}
function safe(fn) { try { return fn(); } catch { return null; } }
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);
