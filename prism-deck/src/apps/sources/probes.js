// Pure parsers for the read-only system probes the live system source runs. No I/O here —
// everything is unit-tested against captured outputs (test/apps.test.js).
//
//   Linux   /proc/meminfo · /proc/net/dev · /proc/diskstats · /sys/class/thermal · /sys/class/power_supply
//           /sys/class/drm/card*/device/gpu_busy_percent · nvidia-smi --query-gpu
//   macOS   vm_stat · netstat -ibn · ioreg -c IOAccelerator · pmset -g batt
//   Windows typeperf (PDH-CSV stream) · Win32_Battery via PowerShell CIM

// blank → null (typeperf writes " " for a missing sample); a comma is a locale decimal separator (typeperf follows the locale)
const num = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? v : null; };

// ── Linux ────────────────────────────────────────────────────────────────────

/** /proc/meminfo → used fraction (MemTotal − MemAvailable), plus totals in bytes. */
export function parseMeminfo(text = '') {
  const kb = (k) => { const m = new RegExp(`^${k}:\\s+(\\d+)\\s*kB`, 'm').exec(text); return m ? Number(m[1]) * 1024 : null; };
  const total = kb('MemTotal');
  let avail = kb('MemAvailable');
  if (avail === null) { const f = kb('MemFree'), b = kb('Buffers'), c = kb('Cached'); avail = f === null ? null : f + (b || 0) + (c || 0); }
  if (!total || avail === null) return null;
  return { used: Math.min(1, Math.max(0, 1 - avail / total)), total, usedBytes: total - avail };
}

/** Interfaces that would double-count traffic or never leave the box. */
export const VIRTUAL_IF = /^(lo|lo0|docker|veth|br-|virbr|vnet|tap|tun|wg|utun|awdl|llw|bridge|gif|stf|anpi|ap\d)/i;

/** /proc/net/dev → { rx, tx } byte counters summed over real interfaces. */
export function parseNetDev(text = '') {
  let rx = 0, tx = 0, seen = 0;
  for (const line of text.split('\n')) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!m || VIRTUAL_IF.test(m[1])) continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    if (f.length < 9 || !Number.isFinite(f[0]) || !Number.isFinite(f[8])) continue;
    rx += f[0]; tx += f[8]; seen++;
  }
  return seen ? { rx, tx } : null;
}

const WHOLE_DISK = /^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/;
/** /proc/diskstats → { read, write } bytes (sectors × 512) over whole disks (partitions skipped). */
export function parseDiskstats(text = '') {
  let read = 0, write = 0, seen = 0;
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || !WHOLE_DISK.test(f[2])) continue;
    read += Number(f[5]) * 512; write += Number(f[9]) * 512; seen++;
  }
  return seen ? { read, write } : null;
}

/** Thermal zones [{ type, temp (millidegrees text) }] → °C: the CPU package if named, else the hottest. */
export function pickThermal(zones = []) {
  const ok = zones.map((z) => ({ type: String(z.type || '').trim(), c: num(z.temp) / 1000 })).filter((z) => Number.isFinite(z.c) && z.c > 0 && z.c < 150);
  if (!ok.length) return null;
  const cpu = ok.find((z) => /x86_pkg_temp|k10temp|tctl|cpu|soc|coretemp|package/i.test(z.type));
  return Math.round((cpu || ok.reduce((a, b) => (b.c > a.c ? b : a))).c * 10) / 10;
}

/** nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits → 0–1 (max over GPUs). */
export function parseNvidiaSmi(text = '') {
  const v = text.split('\n').map(num).filter((x) => x !== null);
  return v.length ? Math.min(1, Math.max(...v) / 100) : null;
}

// ── macOS ────────────────────────────────────────────────────────────────────

/** vm_stat → used bytes (active + wired + compressed), as Activity Monitor counts "Memory Used". */
export function parseVmStat(text = '') {
  const ps = /page size of (\d+) bytes/.exec(text);
  const page = ps ? Number(ps[1]) : 4096;
  const pages = (label) => { const m = new RegExp(`${label}:\\s+(\\d+)`).exec(text); return m ? Number(m[1]) : 0; };
  const used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page;
  return used > 0 ? { usedBytes: used, page } : null;
}

/** netstat -ibn → { rx, tx } bytes over real interfaces (link rows only). */
export function parseNetstatIb(text = '') {
  const lines = text.split('\n');
  const head = (lines[0] || '').trim().split(/\s+/);
  const iI = head.indexOf('Ibytes'), iO = head.indexOf('Obytes');
  if (iI < 0 || iO < 0) return null;
  let rx = 0, tx = 0, seen = 0;
  const done = new Set();
  for (const line of lines.slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < head.length - 1 || !/^<Link#/.test(f[2] || '') || VIRTUAL_IF.test(f[0]) || done.has(f[0])) continue;
    // link rows may have an empty Address column: align from the right
    const off = f.length - head.length;
    const a = num(f[iI + off]), b = num(f[iO + off]);
    if (a === null || b === null) continue;
    done.add(f[0]); rx += a; tx += b; seen++;
  }
  return seen ? { rx, tx } : null;
}

/** ioreg -r -d 1 -w 0 -c IOAccelerator → GPU busy 0–1 ("Device Utilization %"). */
export function parseIoregGpu(text = '') {
  const v = [...text.matchAll(/"Device Utilization %"\s*=\s*(\d+)/g)].map((m) => Number(m[1]));
  return v.length ? Math.min(1, Math.max(...v) / 100) : null;
}

/** pmset -g batt → { level 0–1, charging } or null (no battery). */
export function parsePmset(text = '') {
  const m = /(\d+)%;\s*([a-z ]+);/i.exec(text);
  return m ? { level: Number(m[1]) / 100, charging: /charging|charged|finishing/i.test(m[2]) && !/discharging/i.test(m[2]) } : null;
}

// ── Windows ──────────────────────────────────────────────────────────────────

/** The counters the live Windows source streams from one long-running `typeperf`. */
export const TYPEPERF_COUNTERS = [
  '\\Network Interface(*)\\Bytes Received/sec',
  '\\Network Interface(*)\\Bytes Sent/sec',
  '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec',
  '\\PhysicalDisk(_Total)\\Disk Write Bytes/sec',
  '\\GPU Engine(*engtype_3D)\\Utilization Percentage',
];
const VIRTUAL_NIC = /isatap|loopback|teredo|6to4|pseudo|vethernet|virtual|hyper-v|wan miniport|bluetooth/i;

const csvCells = (line) => { const out = []; const re = /"((?:[^"]|"")*)"/g; let m; while ((m = re.exec(line))) out.push(m[1].replace(/""/g, '"')); return out; };

/**
 * typeperf's CSV header → column roles: [{ i, role: 'down' | 'up' | 'read' | 'write' | 'gpu' }].
 * Counter paths carry the machine name ("\\HOST\…"); it is matched past, never kept.
 */
export function typeperfColumns(header = '') {
  const cells = csvCells(header);
  const cols = [];
  cells.forEach((c, i) => {
    if (i === 0) return;
    const inst = /\(([^)]*)\)/.exec(c)?.[1] || '';
    if (/\\Network Interface\(/i.test(c)) { if (VIRTUAL_NIC.test(inst)) return; cols.push({ i, role: /Received/i.test(c) ? 'down' : 'up' }); }
    else if (/\\PhysicalDisk\(/i.test(c)) cols.push({ i, role: /Read/i.test(c) ? 'read' : 'write' });
    else if (/\\GPU Engine\(/i.test(c)) cols.push({ i, role: 'gpu' });
  });
  return cols;
}

/** One typeperf CSV data row → { down, up, read, write, gpu } (bytes/s; gpu 0–1) or null. */
export function typeperfRow(line = '', cols = []) {
  const cells = csvCells(line);
  if (cells.length < 2 || !cols.length) return null;
  const out = { down: 0, up: 0, read: 0, write: 0, gpu: 0 };
  const has = { down: false, up: false, read: false, write: false, gpu: false };
  for (const { i, role } of cols) { const v = num(cells[i]); if (v === null) continue; out[role] += v; has[role] = true; }
  if (!Object.values(has).some(Boolean)) return null;
  out.gpu = has.gpu ? Math.min(1, out.gpu / 100) : null;
  for (const k of ['down', 'up', 'read', 'write']) if (!has[k]) out[k] = null;
  return out;
}

/** PowerShell Win32_Battery average EstimatedChargeRemaining → 0–1, or null (no battery). */
export function parseWinBattery(text = '') {
  const v = num(String(text).trim().split(/\r?\n/).pop() || '');
  return v === null || v <= 0 ? null : Math.min(1, v / 100);
}

/** Counter deltas → rate per second (null on the first sample or a counter reset). */
export function rateOf(prev, next, dtMs) {
  if (!prev || !next || !(dtMs > 0)) return null;
  const out = {};
  for (const k of Object.keys(next)) { const d = next[k] - prev[k]; out[k] = d >= 0 ? (d * 1000) / dtMs : null; }
  return out;
}
