// Pure ASCII — waiting for the machine: an Award BIOS POST into LILO, a ZX
// Spectrum loading from tape, Arch's pacman with ILoveCandy, and the spinning
// wait cursor at poster size. 7-bit glyphs only (0x20–0x7e).
import { hash } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', category: 'ASCII Spinners & Bars', glyphs: 'ascii', color: '16' };
const TAU = Math.PI * 2;
/** Time within the loop, quantized so t and t + loop draw identical frames (flicker keys included). */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fit = (s, w) => (w <= 0 ? '' : s.length > w ? s.slice(0, w) : s);

/** Scripted terminal: lines = [{ at, parts(tau) → [[text, color], …] }]; shows the newest lines that fit. */
function terminal(b, lines, tau, x, y, w, h) {
  const shown = lines.filter((l) => l.at <= tau);
  const tail = shown.slice(Math.max(0, shown.length - h));
  tail.forEach((l, r) => { let cx = x; for (const [s, c] of l.parts(tau)) { cx = b.text(cx, y + r, fit(s, x + w - cx), c); if (cx >= x + w) break; } });
  return tail.length;
}

// ── Award BIOS POST ──────────────────────────────────────────────────────────
const bios = {
  ...shared,
  id: 'ascii-bios-post',
  since: '0.3.0',
  title: 'BIOS POST',
  tags: ['bios', 'post', 'boot', 'award', 'lilo', 'linux', 'retro', 'memory test'],
  order: 300,
  kind: 'progress',
  loop: 22,
  size: { w: 80, h: 24 },
  minSize: { w: 44, h: 12 },
  description: 'An Award-style BIOS POST: the memory test races up in 1024K steps, drives are detected dot by dot, then LILO loads and Linux boots before a warm reboot.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const S = (at, ...parts) => ({ at, parts: typeof parts[0] === 'function' ? parts[0] : () => parts });
    const dots = (t0, n, gaps) => (tau) => {             // dots that tick at irregular waits
      let k = 0, at = t0;
      while (k < n && at + gaps[k % gaps.length] <= tau) { at += gaps[k % gaps.length]; k++; }
      return k;
    };
    const detect = (at, what, result) => S(at, (tau) => {
      const k = dots(at, 3, [0.35, 0.55, 0.25])(tau);
      return [[(W >= 48 ? '  Detecting ' : '  ') + what.padEnd(19) + ' ' + '.'.repeat(k), th.ink], ...(k === 3 && tau >= at + 1.25 ? [[' ' + result, result === 'None' ? th.dim : th.pos]] : [])];
    });
    const fits = (full, short) => (full.length <= W ? full : short);   // narrow screens get whole-word short forms
    const lines = [
      S(0.2, ['Award Modular BIOS v4.51PG', th.info]),
      S(0.3, ['Copyright (C) 1984-98, Award Software, Inc.', th.info]),
      S(0.7, ['PENTIUM-MMX CPU at 233MHz', th.ink]),
      S(1.0, (tau) => {
        const k = Math.min(64, Math.floor((tau - 1) / 0.04));
        return [['Memory Test : ', th.info], [`${String(k * 1024).padStart(6)}K`, th.ink], ...(k >= 64 ? [[' OK', th.pos]] : [])];
      }),
      S(4.0, ['Award Plug and Play BIOS Extension v1.0A', th.info]),
      S(4.1, ['Copyright (C) 1998, Award Software, Inc.', th.info]),
      detect(4.5, 'HDD Primary Master', 'WDC AC22100H'),
      detect(6.0, 'HDD Primary Slave', 'None'),
      detect(7.5, 'HDD Secondary Master', 'ATAPI CDROM'),
      detect(9.0, 'HDD Secondary Slave', 'None'),
      S(10.6, (tau) => [['Verifying DMI Pool Data ', th.ink], ['.'.repeat(Math.min(8, Math.floor((tau - 10.6) / 0.18))), th.ink]]),
      S(12.3, ['LILO boot:', th.ink]),
      S(13.6, (tau) => [['Loading linux', th.ink], ['.'.repeat(Math.min(8, Math.floor((tau - 13.6) / 0.16))), th.ink]]),
      S(15.2, ['Uncompressing Linux... ', th.ink], ['Ok', th.pos], [W >= 46 ? ', booting the kernel.' : '', th.ink]),
      S(15.9, [fits('Linux version 2.2.14 (root@prism) (gcc version egcs-2.91.66) #1', 'Linux version 2.2.14 (root@prism)'), th.muted]),
      S(16.2, ['Detected 233866 kHz processor.', th.muted]),
      S(16.4, ['Console: colour VGA+ 80x25', th.muted]),
      S(16.7, ['Calibrating delay loop... 466.94 BogoMIPS', th.muted]),
      S(17.1, [fits('Memory: 62712k/65536k available (1084k kernel code)', 'Memory: 62712k/65536k available'), th.muted]),
      S(17.5, ['INIT: version 2.78 booting', th.ink]),
      S(18.6, ['INIT: Sending processes the TERM signal', th.ink]),
      S(19.4, ['Restarting system.', th.warn]),
    ];
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 22);
      if (tau >= 20.2) {                                    // warm reboot: a blank screen, the cursor blinking
        if (Math.floor(tau * 3) % 2 === 0) b.set(0, 0, '_', th.ink);
        return;
      }
      const used = terminal(b, lines, tau, 0, 0, W, H - 2);  // the cursor keeps a row of its own below the newest line
      if (Math.floor(tau * 3) % 2 === 0) b.set(0, Math.min(H - 2, used), '_', th.ink);
      if (tau >= 0.15 && tau < 12) b.text(0, H - 1, fits('Press DEL to enter SETUP, ESC to skip memory test', 'Press DEL to enter SETUP'), th.dim);
    };
  },
};

// ── ZX Spectrum tape loader ──────────────────────────────────────────────────
// Phases of one load: [start, kind]; kinds: 'pilot' | 'data' | 'quiet'.
const TAPE = [[0, 'pilot'], [2, 'data'], [2.3, 'pilot'], [3.5, 'data'], [4, 'pilot'], [4.6, 'data'], [12.4, 'quiet']];
const RAMP = ' .:-=+*#%@';

const tape = {
  ...shared,
  id: 'ascii-tape-loader',
  since: '0.3.0',
  title: '8-bit Tape Loader',
  tags: ['zx spectrum', 'tape', 'loading', 'border', '8-bit', 'retro', 'cassette'],
  order: 310,
  kind: 'progress',
  loop: 16,
  size: { w: 80, h: 24 },
  minSize: { w: 40, h: 12 },
  description: 'A ZX Spectrum loads from tape: the border rolls with thick pilot stripes and noisy data bands while the picture fills like a venetian blind.',
  credits: 'after the Sinclair ZX Spectrum (1982) ROM loader',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const bx = Math.max(3, Math.round(W * 0.1)), by = Math.max(2, Math.round(H * 0.12));
    const iw = W - 2 * bx, ih = H - 2 * by;
    // the picture (luminance 0..1 per cell): a ringed planet with the title over it
    const pic = new Float32Array(iw * ih), attr = new Int32Array(iw * ih);
    const pcx = iw * 0.62, pcy = ih * 0.58, pr = Math.min(iw * 0.22, ih * 0.42 * 2);
    const tones = [th.info, th.accent2, th.warn, th.pos, th.ink];
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const dx = (x - pcx) / pr, dy = ((y - pcy) * 2) / pr, d = Math.hypot(dx, dy);
      let v = d < 1 ? 0.25 + 0.75 * Math.max(0, 1 - Math.hypot(dx + 0.4, dy + 0.4) * 0.8) : 0;
      const ring = Math.abs(dy * 1 - dx * 0.25) < 0.08 && d > 1.05 && d < 1.7;
      if (ring) v = 0.6;
      if (!v && hash(x, y, 7) < 0.035) v = 0.9;            // stars
      pic[y * iw + x] = v;
      attr[y * iw + x] = ring ? tones[2] : d < 1 ? tones[0] : v ? tones[4] : th.ink;
    }
    const title = 'P L A N E T S', ty = Math.max(0, Math.floor(ih * 0.15)), tx = Math.max(0, Math.floor(iw * 0.08));
    // Spectrum line order: thirds, then line n of every character row, then line n + 1 …
    const order = [], third = Math.max(1, Math.ceil(ih / 3)), L = ih >= 12 ? 3 : 2;
    for (let tr = 0; tr < 3; tr++) for (let line = 0; line < L; line++) for (let cr = 0; cr * L < third; cr++) {
      const y = tr * third + cr * L + line;
      if (y < ih && y < (tr + 1) * third) order.push(y);
    }
    for (let y = 0; y < ih; y++) if (!order.includes(y)) order.push(y);
    const rank = new Int32Array(ih); order.forEach((y, i) => { rank[y] = i; });
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 16);
      let kind = 'pilot';
      for (const [at, k] of TAPE) if (tau >= at) kind = k;
      const blank = tau >= 14.8;
      // the border
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x >= bx && x < W - bx && y >= by && y < H - by) continue;
        let ch = ' ', c = th.dim;
        if (kind === 'pilot') { const band = Math.floor((y + tau * 9) / 2) % 2; ch = band ? '#' : '='; c = band ? th.neg : th.info; }
        else if (kind === 'data') { const r = hash(y, Math.floor(tau * 25)); ch = r < 0.5 ? '#' : '-'; c = r < 0.5 ? th.accent2 : th.warn; }
        else ch = '.';
        b.set(x, y, ch, c);
      }
      // the screen
      const filled = kind === 'quiet' || tau >= 12.4 ? ih : tau >= 4.6 ? Math.floor(((tau - 4.6) / 6.4) * ih) : 0;
      const attrs = tau >= 11 ? clamp01((tau - 11) / 1.4) : 0;
      if (!blank) for (let y = 0; y < ih; y++) {
        if (rank[y] >= filled) continue;
        for (let x = 0; x < iw; x++) {
          const v = pic[y * iw + x];
          if (!v) continue;
          const lit = (y * iw + x) / (iw * ih) < attrs;          // attributes load in linear order
          b.set(bx + x, by + y, RAMP[Math.min(9, Math.round(v * 9))], lit ? attr[y * iw + x] : th.ink);
        }
        if (y === ty) b.text(bx + tx, by + y, title, attrs > 0.1 ? th.warn : th.ink);
      }
      const msgY = H - by - 1;
      if (!blank && tau >= 2.3) b.text(bx + 1, msgY, 'Program: PLANETS', th.ink);
      if (!blank && tau >= 4 && tau < 11) b.text(bx + 1, msgY - 1, 'Bytes: SCREEN$', th.ink);
    };
  },
};

// ── a package sync with ILoveCandy ──────────────────────────────────────────────
const PKGS = [['curl-8.11.0-1', 1.2], ['linux-6.12.1.arch1-1', 136.2], ['linux-headers-6.12.1.arch1-1', 35.4], ['mesa-1:24.2.7-1', 9.1], ['openssl-3.4.0-1', 5.3], ['python-3.12.7-1', 11.8], ['systemd-256.8-1', 8.4]];

const pacman = {
  ...shared,
  id: 'ascii-chomp-sync',
  since: '0.3.0',
  title: 'Chomping Package Sync',
  tags: ['arch linux', 'ilovecandy', 'package manager', 'chomp', 'update', 'terminal'],
  order: 320,
  kind: 'progress',
  loop: 20,
  size: { w: 80, h: 16 },
  minSize: { w: 44, h: 6 },
  description: 'Arch\'s package manager with ILoveCandy on: each progress bar is a chomping mouth eating a row of pellets as databases sync, packages download and hooks run.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const bw = Math.max(10, Math.min(24, Math.floor(W * 0.28)));
    // [------C o  o  o ] — the trail behind, the mouth alternating C/c, pellets every third cell ahead
    const candy = (p, tau) => {
      const n = bw - 2, pos = Math.round(clamp01(p) * n);
      const out = [['[', th.ink]];
      for (let i = 0; i < n; i++) {
        if (i < pos || (p >= 1 && i < n)) out.push(['-', th.dim]);
        else if (i === pos) out.push([Math.floor(tau * 10) % 2 ? 'C' : 'c', th.warn]);
        else out.push([(i - pos) % 3 === 0 ? 'o' : ' ', th.ink]);
      }
      out.push([']', th.ink]);
      return out;
    };
    // info(p) → [size, 'rate time']; when narrow only the size stays, as pacman drops columns, so the bar and % always fit
    const row = (at, dur, name, info) => ({ at, parts: (tau) => {
      const p = clamp01((tau - at) / dur), cols = info ? info(p) : null;
      const full = cols && W - bw - 37 >= 8, infoW = !cols ? 0 : full ? 30 : W - bw - 17 >= 8 ? 10 : 0, nameW = Math.max(8, W - bw - 7 - infoW);
      const nm = name.length > nameW ? name.slice(0, nameW - 3) + '...' : name.padEnd(nameW);
      const inf = !infoW ? [] : [[full ? `${cols[0]}  ${cols[1]}`.padStart(29) + ' ' : cols[0].padStart(9) + ' ', th.muted]];
      return [[` ${nm} `, th.ink], ...inf, ...candy(p, tau), [` ${String(Math.round(p * 100)).padStart(3)}%`, th.ink]];
    } });
    const L = (at, ...parts) => ({ at, parts: () => parts });
    const ln = [];
    ln.push({ at: 0, parts: (tau) => [['$ ', th.pos], ['sudo pacman -Syu'.slice(0, Math.floor(clamp01(tau / 0.8) * 16)), th.ink]] });
    ln.push(L(0.9, [':: ', th.info], ['Synchronizing package databases...', th.ink]));
    [['core', 130.3, 912], ['extra', 8499, 6210], ['multilib', 142.7, 1102]].forEach(([n, kb, rate], i) => ln.push(row(1 + i * 0.5, 0.45, n, (p) => [kb >= 1000 ? (kb / 1024).toFixed(1) + ' MiB' : kb + ' KiB', `${rate >= 1000 ? (rate / 1024).toFixed(2) + ' MiB/s' : rate + ' KiB/s'} 00:0${p < 1 ? 1 : 0}`])));
    ln.push(L(2.7, [':: ', th.info], ['Starting full system upgrade...', th.ink]));
    ln.push(L(2.9, ['resolving dependencies...', th.ink]));
    ln.push(L(3.1, ['looking for conflicting packages...', th.ink]));
    ln.push(L(3.4, [`Packages (7) ${PKGS.map(([n]) => n).join('  ')}`, th.ink]));
    ln.push(L(3.6, ['Total Download Size:   207.40 MiB', th.ink]));
    ln.push(L(3.7, ['Total Installed Size:  612.18 MiB', th.ink]));
    ln.push({ at: 4.2, parts: (tau) => [[':: ', th.info], ['Proceed with installation? [Y/n] ', th.ink], [tau >= 5.1 ? 'y' : Math.floor(tau * 3) % 2 ? '_' : ' ', th.ink]] });
    ln.push(L(5.3, [':: ', th.info], ['Retrieving packages...', th.ink]));
    let at = 5.4;
    for (const [n, mib] of PKGS) { const dur = 0.35 + mib / 60; ln.push(row(at, dur, `${n}-x86_64`, (p) => [`${(mib * p).toFixed(1)} MiB`, `9.81 MiB/s 00:${String(Math.max(0, Math.round((1 - p) * mib / 9.8))).padStart(2, '0')}`])); at += dur + 0.05; }
    for (const s of ['checking keys in keyring', 'checking package integrity', 'loading package files', 'checking for file conflicts']) { ln.push(row(at, 0.3, `(7/7) ${s}`)); at += 0.33; }
    ln.push(L(at + 0.1, [':: ', th.info], ['Processing package changes...', th.ink])); at += 0.2;
    PKGS.forEach(([n], i) => { ln.push(row(at, 0.4, `(${i + 1}/7) upgrading ${n.split(/-\d/)[0]}`)); at += 0.43; });
    ln.push(L(at + 0.1, [':: ', th.info], ['Running post-transaction hooks...', th.ink])); at += 0.2;
    ['Arming ConditionNeedsUpdate...', 'Updating module dependencies...', 'Updating linux initcpios...', 'Reloading system manager configuration...'].forEach((s, i) => { ln.push(L(at, [`(${i + 1}/4) ${s}`, th.ink])); at += 0.35; });
    const promptAt = at + 0.2;
    ln.push({ at: promptAt, parts: (tau) => [['$ ', th.pos], ['clear'.slice(0, Math.floor(clamp01((tau - promptAt - 0.4) / 0.5) * 5)), th.ink]] });
    const clearAt = Math.min(19.6, promptAt + 1.2);
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 20);
      if (tau >= clearAt) { b.text(0, 0, '$ ', th.pos); if (Math.floor(tau * 3) % 2) b.set(2, 0, '_', th.ink); return; }
      terminal(b, ln, tau, 0, 0, W, H);
    };
  },
};

// ── the spinning wait cursor ─────────────────────────────────────────────────
// angular speed profile over the loop: spin-up, steady with a hitch, spin-down, recovered, hang again
// the hang's spin-up straddles the seam (0 → 0.5 over 10.5–12 s, 0.5 → 1 over 0–1 s), so speed is continuous too
const omegaRaw = (t) => (t < 1 ? 0.5 + 0.5 * t : t < 7.5 ? (Math.abs(t - 4.3) < 0.25 ? 0.25 : 1) : t < 8.5 ? 8.5 - t : t < 10.5 ? 0 : ((t - 10.5) / 1.5) * 0.5);
const BALL = (() => {                                     // integrate, scaled to exactly 6 turns per loop
  const N = 1200, ang = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) ang[i + 1] = ang[i] + omegaRaw(((i + 0.5) / N) * 12) * (12 / N);
  const k = (6 * TAU) / ang[N];
  return (t) => { const x = (t / 12) * N, i = Math.min(N - 1, Math.floor(x)); return (ang[i] + (ang[i + 1] - ang[i]) * (x - i)) * k; };
})();
const ARROW = ['|\\', '|.\\', '|..\\', '|...\\', '|..--', '|/'];

const beachball = {
  ...shared,
  id: 'ascii-beachball',
  since: '0.3.0',
  title: 'Spinning Wait Cursor',
  tags: ['beachball', 'wait cursor', 'not responding', 'spinner', 'macos', 'hang'],
  order: 330,
  kind: 'spinner',
  loop: 12,
  size: { w: 48, h: 22 },
  minSize: { w: 24, h: 11 },
  description: 'The spinning wait cursor at poster size: eight shaded wedges spin up, hitch, wind down as the app recovers and the arrow returns, then it hangs again.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cols = [th.accent, th.accent2, th.info, th.pos, th.warn, th.neg, th.crit, th.ink];
    const capY = H - 2, R = Math.max(4, Math.min((W - 4) / 2, (capY - 1) * 1.0));
    const cx = W / 2, cy = (capY - 1) / 2 + 0.5;
    const SHADE = '@%#*+=-:.';
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 12), rot = BALL(tau);
      const recovered = tau >= 8.5 && tau < 10.5;
      if (!recovered) for (let y = 0; y < capY; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 2, r = Math.hypot(dx, dy) / R;
        if (r > 1) continue;
        const wedge = ((Math.floor(((Math.atan2(dy, dx) + rot) / TAU) * 8) % 8) + 8) % 8;
        const gloss = r > 0.45 && r < 0.75 && Math.abs(Math.atan2(dy, dx) + 2.3) < 0.35;  // a highlight band, fixed in place
        b.set(x, y, gloss ? ':' : SHADE[Math.min(8, Math.floor(r * 9))], gloss ? mix(cols[wedge], th.ink, 0.6) : cols[wedge]);
      }
      else ARROW.forEach((s, i) => b.text(Math.floor(cx) - 1, Math.floor(cy) - 3 + i, s, th.ink));
      const cap = W >= 30 ? (recovered ? 'Finder' : 'Finder -- Not Responding') : recovered ? 'Finder' : 'Not Responding';
      b.text(Math.max(0, Math.floor((W - cap.length) / 2)), capY, cap, th.muted);
    };
  },
};

export default [bios, tape, pacman, beachball];
