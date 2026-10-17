// A tiny VT emulator for tests: replays the escape sequences prism-term emits
// (CUP/CHA/CUU/CUD/CUF/CUB, SGR truecolor/256/16, ED, EL, DEC private modes,
// alt screen) onto a grid, so tests can assert that what a terminal would
// display equals the back buffer the renderer was given.

import { NONE } from '../src/color.js';
import { charWidth } from '../src/width.js';

export class VT {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.x = 0;
    this.y = 0;
    this.fg = NONE;
    this.bg = NONE;
    this.modes = new Map();
    this.alt = false;
    this.clear();
  }

  clear() {
    this.cells = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => ({ ch: ' ', fg: NONE, bg: NONE })));
  }

  feed(s) {
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\x1b') {
        if (s[i + 1] === '[') {
          let j = i + 2;
          while (j < s.length && !/[@-~]/.test(s[j])) j++;
          this.csi(s.slice(i + 2, j), s[j]);
          i = j + 1;
        } else if (s[i + 1] === ']') {
          const end = s.indexOf('\x07', i);
          i = end < 0 ? s.length : end + 1;
        } else i += 2;
        continue;
      }
      if (c === '\r') { this.x = 0; i++; continue; }
      if (c === '\n') { this.y = Math.min(this.height - 1, this.y + 1); i++; continue; }
      const cp = s.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      i += ch.length;
      const w = charWidth(cp);
      if (this.y < this.height && this.x < this.width) {
        this.cells[this.y][this.x] = { ch, fg: this.fg, bg: this.bg };
        if (w === 2 && this.x + 1 < this.width) this.cells[this.y][this.x + 1] = { ch: '', fg: this.fg, bg: this.bg };
      }
      this.x = Math.min(this.width - 1, this.x + w);
    }
  }

  csi(params, final) {
    const priv = params.startsWith('?');
    const nums = (priv ? params.slice(1) : params).split(';').map((n) => (n === '' ? undefined : Number(n)));
    const n0 = nums[0] ?? 1;
    switch (final) {
      case 'H': this.y = (nums[0] ?? 1) - 1; this.x = (nums[1] ?? 1) - 1; break;
      case 'G': this.x = n0 - 1; break;
      case 'A': this.y = Math.max(0, this.y - n0); break;
      case 'B': this.y = Math.min(this.height - 1, this.y + n0); break;
      case 'C': this.x = Math.min(this.width - 1, this.x + n0); break;
      case 'D': this.x = Math.max(0, this.x - n0); break;
      case 'J': if ((nums[0] ?? 0) === 2) this.clear(); break;
      case 'K': for (let x = 0; x < this.width; x++) this.cells[this.y][x] = { ch: ' ', fg: NONE, bg: NONE }; break;
      case 'h': case 'l':
        if (priv) for (const m of nums) { this.modes.set(m, final === 'h'); if (m === 1049) { this.alt = final === 'h'; this.clear(); } }
        break;
      case 'm': this.sgr(nums.map((v) => v ?? 0)); break;
      default: break;
    }
  }

  sgr(p) {
    for (let k = 0; k < p.length; k++) {
      const v = p[k];
      if (v === 0) { this.fg = NONE; this.bg = NONE; }
      else if (v === 39) this.fg = NONE;
      else if (v === 49) this.bg = NONE;
      else if (v === 38 || v === 48) {
        let col;
        if (p[k + 1] === 2) { col = (p[k + 2] << 16) | (p[k + 3] << 8) | p[k + 4]; k += 4; }
        else if (p[k + 1] === 5) { col = 0x1000000 | p[k + 2]; k += 2; } // tagged palette index
        if (v === 38) this.fg = col; else this.bg = col;
      } else if (v >= 30 && v <= 37) this.fg = 0x2000000 | (v - 30);
      else if (v >= 90 && v <= 97) this.fg = 0x2000000 | (v - 82);
      else if (v >= 40 && v <= 47) this.bg = 0x2000000 | (v - 40);
      else if (v >= 100 && v <= 107) this.bg = 0x2000000 | (v - 92);
    }
  }

  text() {
    return this.cells.map((r) => r.map((c) => c.ch).join('').replace(/\s+$/, '')).join('\n');
  }
}

/** A writable that looks like a TTY and records everything written. */
export function fakeTTY({ columns = 40, rows = 12 } = {}) {
  const chunks = [];
  const listeners = {};
  return {
    isTTY: true,
    columns,
    rows,
    chunks,
    get output() { return chunks.join(''); },
    write(s, cb) { chunks.push(String(s)); if (cb) setImmediate(cb); return true; },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return this; },
    off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return this; },
    emit(ev, ...a) { for (const fn of listeners[ev] || []) fn(...a); },
  };
}
