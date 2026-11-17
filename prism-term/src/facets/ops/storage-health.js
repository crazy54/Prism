// Disk & Storage: drive health (smartctl 7.4 self-test, brief attribute table), the block-device tree
// (lsblk, LANG=C ASCII tree) as a USB stick comes and goes, and an offline e2fsck 1.47 with its -C0 bar.
// Every screen is a pure function of t % loop, so each loop closes exactly.
import { C, ATTR, writer, clock, typed, blink, pad, lpad } from './_kit.js';
import { phase, watchTitle, drawTranscript, promptParts } from './_watch.js';

const shared = { glyphs: 'ascii', color: '16' };

// ── drive health: smartctl short self-test, watched ───────────────────────────────────────────
const HLOOP = 24;
const WATCH_SMART = `smartctl -a -f brief /dev/sda | grep -E 'Model|Serial|Firmware|overall-health|execution status|of test|^ID#|^ *(1|3|5|9|12|194|197|198|199) '`;
// [ID, ATTRIBUTE_NAME, FLAGS, VALUE, WORST, THRESH, RAW] (WD Red 4 TB; Temperature VALUE is 150 - °C)
const ATTRS = [
  [1, 'Raw_Read_Error_Rate', 'POSR-K', '200', '200', '051', '0'],
  [3, 'Spin_Up_Time', 'POS--K', '178', '171', '021', '6083'],
  [5, 'Reallocated_Sector_Ct', 'PO--CK', '200', '200', '140', '0'],
  [9, 'Power_On_Hours', '-O--CK', '044', '044', '000', '41262'],
  [12, 'Power_Cycle_Count', '-O--CK', '100', '100', '000', '214'],
  [194, 'Temperature_Celsius', '-O---K', null, '104', '000', null],
  [197, 'Current_Pending_Sector', '-O--CK', '200', '200', '000', '8'],
  [198, 'Offline_Uncorrectable', '----CK', '100', '253', '000', '0'],
  [199, 'UDMA_CRC_Error_Count', '-O--CK', '200', '200', '000', '0'],
];
const SMART_BANNER = [
  'smartctl 7.4 2023-08-01 r5530 [x86_64-linux-6.8.0-45-generic] (local build)',
  'Copyright (C) 2002-23, Bruce Allen, Christian Franke, www.smartmontools.org',
];

const driveHealth = {
  ...shared,
  id: 'ops-smartctl',
  since: '0.3.0',
  title: 'smartctl -a',
  category: 'Disk & Storage',
  order: 200,
  description: 'smartctl short self-test on a NAS hard drive: PASSED health, the brief attribute table with 8 pending sectors, and the test counting 90% to done before it is re-run.',
  tags: ['smartctl', 'smart', 'smartmontools', 'disk', 'hdd', 'self-test', 'health', 'sectors', 'watch'],
  kind: 'tui',
  size: { w: 80, h: 22 },
  minSize: { w: 56, h: 8 },
  loop: HLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const full = W >= 70 && H >= 19; // the attribute header is 70 columns
    // Watch view samples every 2 s: 90 % remaining at the first sample, down 10 % a sample, done at 18 s.
    const testAt = (s) => (s >= 18 ? null : { code: 249 - s / 2, left: 90 - (s / 2) * 10 });
    const tempAt = (s) => 34 + Math.round(3 * Math.sin((Math.PI * Math.min(s, 18)) / 18));
    const attrRow = (a, temp) => {
      const [id, name, fl, v, wo, th, raw] = a;
      return `${lpad(id, 3)} ${pad(name, 24)}${pad(fl, 9)}${pad(v ?? String(150 - temp), 6)}${pad(wo, 6)}${pad(th, 7)}${pad('-', 5)}${raw ?? temp}`;
    };
    const attrColor = (id) => (id === 197 ? c.yellow : c.fg);
    function watchView(T, s) {
      const test = testAt(s), temp = tempAt(s);
      const status = test ? `Self-test execution status:      (${lpad(test.code, 4)}) Self-test routine in progress...` : 'Self-test execution status:      (   0) The previous self-test routine completed';
      if (full) {
        watchTitle(w, c, 0, 2, WATCH_SMART, 'db01', s); // watch redraws (and re-reads its clock) every 2 s
        const info = [['Model Family:     ', 'Western Digital Red'], ['Device Model:     ', 'WDC WD40EFRX-68N32N0'], ['Serial Number:    ', 'WD-WCC7K4XJ29R7'], ['Firmware Version: ', '82.00A82']];
        info.forEach(([k, v], i) => w.seg(0, 2 + i, [[k, c.fg], [v, c.fg, ATTR.BOLD]]));
        w.seg(0, 6, [['SMART overall-health self-assessment test result: ', c.fg], ['PASSED', c.green, ATTR.BOLD]]);
        w.put(0, 7, status, test ? c.fg : c.green);
        let y = 8;
        if (test) w.put(40, y++, `${test.left}% of test remaining.`, c.blue, undefined, ATTR.BOLD);
        w.put(0, y++, `ID# ${pad('ATTRIBUTE_NAME', 24)}${pad('FLAGS', 9)}${pad('VALUE', 6)}${pad('WORST', 6)}${pad('THRESH', 7)}${pad('FAIL', 5)}RAW_VALUE`, c.fg, undefined, ATTR.BOLD);
        for (const a of ATTRS) {
          if (y >= H) break;
          const row = attrRow(a, temp);
          w.put(0, y, row.slice(0, 49), attrColor(a[0]));
          w.put(49, y, row.slice(49, 61), c.muted);
          w.put(61, y, row.slice(61), a[0] === 197 ? c.yellow : c.fg, undefined, a[0] === 197 ? ATTR.BOLD : 0);
          y++;
        }
        // The selective self-test log's span rows 1, 3 and 5 match the grep's ID pattern too.
        for (const n of [1, 3, 5]) if (y < H) w.put(0, y++, `${lpad(n, 5)} ${lpad(0, 8)} ${lpad(0, 8)}  Not_testing`, c.muted);
        return;
      }
      // Compact: grep -o style excerpts, the hero values first.
      const rows = [
        [['Device Model:     ', c.fg], ['WDC WD40EFRX-68N32N0', c.fg, ATTR.BOLD]],
        [['overall-health self-assessment test result: ', c.fg], ['PASSED', c.green, ATTR.BOLD]],
        test ? [[`(${lpad(test.code, 4)}) Self-test routine in progress... `, c.fg], [`${test.left}%`, c.blue, ATTR.BOLD]] : [['(   0) The previous self-test routine completed', c.green]],
        [[`194 ${pad('Temperature_Celsius', 24)}`, c.fg], [String(temp), c.fg, ATTR.BOLD]],
        [[`197 ${pad('Current_Pending_Sector', 24)}`, c.yellow], ['8', c.yellow, ATTR.BOLD]],
        [[`  5 ${pad('Reallocated_Sector_Ct', 24)}`, c.fg], ['0', c.fg, ATTR.BOLD]],
        [[`198 ${pad('Offline_Uncorrectable', 24)}`, c.fg], ['0', c.fg, ATTR.BOLD]],
        [[`  9 ${pad('Power_On_Hours', 24)}`, c.fg], ['41262', c.fg, ATTR.BOLD]],
      ];
      rows.slice(0, H).forEach((parts, i) => w.seg(0, i, parts));
    }
    function rerun(T) { // ^C out of watch, start the next test, recall the watch line from history
      const host = 'db01';
      const lines = [promptParts(c, host, `watch -n2 "${WATCH_SMART}"`, false)];
      const ty = typed('sudo smartctl -t short /dev/sda', T, 19.2, 22);
      lines.push(promptParts(c, host, ty.text, !ty.done && blink(T, 0.8)));
      if (ty.done && T >= 20.9) {
        const k = clock(124); // the next cycle's watch starts at the clock's t = 0
        lines.push(...SMART_BANNER.map((s) => [[s, c.fg]]), [],
          [['=== START OF OFFLINE IMMEDIATE AND SELF-TEST SECTION ===', c.fg, ATTR.BOLD]],
          [['Sending command: "Execute SMART Short self-test routine immediately in off-line mode".', c.fg]],
          [['Drive command "Execute SMART Short self-test routine immediately in off-line mode" successful.', c.fg]],
          [['Testing has begun.', c.green, ATTR.BOLD]], [['Please wait 2 minutes for test to complete.', c.fg]],
          [[`Test will complete after ${k.day} ${k.mon} ${k.dd} ${k.hms} ${k.date.slice(0, 4)} UTC`, c.fg]],
          [['Use smartctl -X to abort test.', c.fg]]);
        if (T >= 21.8) lines.push(promptParts(c, host, T >= 22.3 ? `watch -n2 "${WATCH_SMART}"` : '', T < 22.3 && blink(T, 0.8)));
      }
      drawTranscript(w, lines);
    }
    return (t) => {
      const T = phase(t, HLOOP);
      if (T < 18.9) watchView(T, 2 * Math.floor(T / 2));
      else if (T >= 23) watchView(T, 0);
      else rerun(T);
    };
  },
};

// ── block devices: lsblk under watch, a USB stick plugged, mounted, unmounted, pulled ─────────
const BLOOP = 20;
// [tree prefix, name, maj:min, rm, size, type, mountpoint]. lsblk sorts by MAJ:MIN, so the stick (8:16) lists first.
const USB = [['', 'sdb', '8:16', 1, '57.3G', 'disk', ''], ['`-', 'sdb1', '8:17', 1, '57.3G', 'part', '/media/ops/BACKUP']];
const BASE = [
  ['', 'nvme0n1', '259:0', 0, '953.9G', 'disk', ''],
  ['|-', 'nvme0n1p1', '259:1', 0, '512M', 'part', '/boot/efi'],
  ['|-', 'nvme0n1p2', '259:2', 0, '1G', 'part', '/boot'],
  ['`-', 'nvme0n1p3', '259:3', 0, '952.4G', 'part', ''],
  ['  `-', 'cryptlvm', '252:0', 0, '952.4G', 'crypt', ''],
  ['    |-', 'vg0-root', '252:1', 0, '100G', 'lvm', '/'],
  ['    |-', 'vg0-swap', '252:2', 0, '16G', 'lvm', '[SWAP]'],
  ['    `-', 'vg0-home', '252:3', 0, '836.4G', 'lvm', '/home'],
];
// libsmartcols sizes NAME to its longest cell plus the one-space gap; a wide row is then NAME_W + 44 at most.
const NAME_W = Math.max(...[...USB, ...BASE].map(([pre, name]) => pre.length + name.length)) + 1;

const blockDevices = {
  ...shared,
  id: 'ops-lsblk',
  since: '0.3.0',
  title: 'lsblk',
  category: 'Disk & Storage',
  order: 210,
  description: 'watch lsblk over NVMe partitions, a LUKS crypt and LVM volumes; a USB stick plugs in as sdb, mounts under /media, then unmounts and is pulled.',
  tags: ['lsblk', 'block devices', 'nvme', 'luks', 'lvm', 'usb', 'mount', 'partitions', 'watch'],
  kind: 'tui',
  size: { w: 72, h: 14 },
  minSize: { w: 48, h: 8 },
  loop: BLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const wide = W >= NAME_W + 44 && H >= 11;
    const cmd = wide ? 'lsblk -o NAME,MAJ:MIN,RM,SIZE,RO,TYPE,MOUNTPOINTS' : 'lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS';
    const nameW = NAME_W;
    return (t) => {
      const T = phase(t, BLOOP), s = Math.floor(T); // watch -n1: the screen changes once a second
      const plugged = s >= 5 && s < 15, fading = s === 14, mounted = s >= 7 && s < 12;
      const fresh = s < 7, freshMount = s < 9;
      let y = 0;
      if (H >= (wide ? 13 : 9)) { watchTitle(w, c, 0, 1, cmd, 'ws-ops', T); y = 2; }
      const head = wide ? `${pad('NAME', nameW)}MAJ:MIN RM   SIZE RO TYPE  MOUNTPOINTS` : `${pad('NAME', nameW)}  SIZE TYPE  MOUNTPOINTS`;
      w.put(0, y++, head, c.fg, undefined, ATTR.BOLD);
      const rows = [...(plugged ? USB.map((r) => ({ r, usb: true })) : []), ...BASE.map((r) => ({ r, usb: false }))];
      for (const { r, usb } of rows) {
        if (y >= H) break;
        const [pre, name, mm, rm, size, type, mnt0] = r;
        const mnt = usb && name === 'sdb1' ? (mounted ? mnt0 : '') : mnt0;
        const ink = usb ? (fading ? c.dim : fresh ? c.accent : c.fg) : c.fg;
        const attr = usb && fresh && !fading ? ATTR.BOLD : 0;
        const [maj, min] = mm.split(':');
        let x = w.put(0, y, pad(pre + name, nameW), ink, undefined, attr);
        if (wide) x = w.put(x, y, `${lpad(maj, 3)}:${pad(min, 3)} ${lpad(rm, 2)} ${lpad(size, 6)}  0 `, ink, undefined, attr);
        else x = w.put(x, y, `${lpad(size, 6)} `, ink, undefined, attr);
        x = w.put(x, y, pad(type, 6), usb && !fading ? ink : c.muted);
        if (mnt) w.put(x, y, mnt, usb ? (fading ? c.dim : freshMount ? c.accent : c.blue) : c.blue, undefined, usb && freshMount ? ATTR.BOLD : 0);
        y++;
      }
    };
  },
};

// ── filesystem check: e2fsck -f -y -C0 on an unmounted LVM volume ─────────────────────────────
const FLOOP = 24;
const DEV = 'prism-data';
// [pass heading, start (s), end (s), overall % at end]: e2fsck weights the passes 70/20/5/1/4.
const PASSES = [
  ['Pass 1: Checking inodes, blocks, and sizes', 2.4, 9.6, 70],
  ['Pass 2: Checking directory structure', 10.1, 14.1, 90],
  ['Pass 3: Checking directory connectivity', 14.1, 14.7, 95],
  ['Pass 4: Checking reference counts', 14.7, 15.3, 96],
  ['Pass 5: Checking group summary information', 15.3, 18.0, 100],
];
const FIX_AT = 6.0, DONE_AT = 18.0, CLEAR_AT = 21.0;

const filesystemCheck = {
  ...shared,
  id: 'ops-e2fsck',
  since: '0.3.0',
  title: 'e2fsck -f -C0',
  category: 'Disk & Storage',
  order: 220,
  description: 'e2fsck -f -y -C0 on an LVM volume: passes 1 to 5 under the progress bar, an extent tree optimized mid-run, then FILE SYSTEM WAS MODIFIED and the counts.',
  tags: ['e2fsck', 'fsck', 'ext4', 'filesystem', 'repair', 'lvm', 'progress', 'e2fsprogs'],
  kind: 'progress',
  size: { w: 80, h: 14 },
  minSize: { w: 50, h: 6 },
  loop: FLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width;
    // e2fsck sizes its bar from a fixed 66 columns (in multiples of 8); narrow terminals get a shorter one.
    const barW = Math.max(8, Math.min(8 * Math.floor((66 - DEV.length) / 8), 8 * Math.floor((W - DEV.length - 12) / 8)));
    // Overall progress: eased within each pass, with two short stalls in pass 1 (inode-table seeks).
    const progress = (T) => {
      let prev = 0;
      for (const [, a, b, end] of PASSES) {
        if (T < a) return prev;
        if (T < b) {
          let u = (T - a) / (b - a);
          if (end === 70) u = u < 0.35 ? u : u < 0.45 ? 0.35 : u < 0.7 ? u - 0.1 : u < 0.78 ? 0.6 : u - 0.18; // stalls
          u = Math.max(0, Math.min(1, end === 70 ? u / 0.82 : u));
          return prev + (end - prev) * (u * u * (3 - 2 * u));
        }
        prev = end;
      }
      return 100;
    };
    const bar = (T, pct) => {
      const i = Math.round((pct * barW) / 100);
      const tip = pct >= 100 ? '|' : '\\|/-'[Math.floor(T * 8) % 4];
      return [[`${DEV}: |`, c.fg], ['='.repeat(i), c.accent, ATTR.BOLD], [`${' '.repeat(barW - i)}${tip} `, c.fg], [`${pct.toFixed(1).padStart(4)}%`, c.fg, ATTR.BOLD]];
    };
    return (t) => {
      const T = phase(t, FLOOP);
      const lines = [];
      if (T >= CLEAR_AT) { // after `clear`: a fresh prompt waiting for the next run
        lines.push(promptParts(c, 'db01', '', blink(T, 0.8)));
        drawTranscript(w, lines);
        return;
      }
      const ty = typed('sudo e2fsck -f -y -C0 /dev/vg0/data', T, 0.3, 22);
      lines.push(promptParts(c, 'db01', ty.text, !ty.done && blink(T, 0.8)));
      if (T >= 2.2) lines.push([['e2fsck 1.47.0 (5-Feb-2023)', c.fg]]);
      for (const [head, a] of PASSES) {
        if (T < a) break;
        lines.push([[head, c.fg, ATTR.BOLD]]);
        if (a === 2.4 && T >= FIX_AT) lines.push([['Inode 1835014 extent tree (at level 1) could be shorter.  Optimize? ', c.yellow], ['yes', c.yellow, ATTR.BOLD]], []);
        if (a === 2.4 && T >= 9.6) lines.push([['Pass 1E: Optimizing extent trees', c.fg, ATTR.BOLD]]);
      }
      if (T >= 2.4 && T < DONE_AT) lines.push(bar(T, progress(T)));
      if (T >= DONE_AT) {
        lines.push([], [[`${DEV}: `, c.fg], ['***** FILE SYSTEM WAS MODIFIED *****', c.yellow, ATTR.BOLD]],
          [[`${DEV}: 48213/6553600 files (0.4% non-contiguous), 1843127/26214144 blocks`, c.fg]]);
        const cl = typed('clear', T, 20.2, 14);
        lines.push(promptParts(c, 'db01', cl.text, T < 20.9 && blink(T, 0.8)));
      }
      drawTranscript(w, lines);
    };
  },
};

export default [driveHealth, blockDevices, filesystemCheck];
