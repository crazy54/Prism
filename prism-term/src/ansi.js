// Raw VT/ANSI escape sequences. Everything prism-term writes to a terminal is
// built from these, so this file is also the reference for what we depend on:
// only widely-supported CSI/DEC private modes, nothing terminal-specific.

export const ESC = '\x1b';
export const CSI = '\x1b[';

export const reset = '\x1b[0m';

export const cursor = {
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
  home: '\x1b[H',
  save: '\x1b7',
  restore: '\x1b8',
  /** Absolute move, 0-based. */
  to: (x, y) => `\x1b[${y + 1};${x + 1}H`,
  /** Absolute column on the current row, 0-based. */
  column: (x) => `\x1b[${x + 1}G`,
  up: (n = 1) => (n > 0 ? `\x1b[${n}A` : ''),
  down: (n = 1) => (n > 0 ? `\x1b[${n}B` : ''),
  right: (n = 1) => (n > 0 ? `\x1b[${n}C` : ''),
  left: (n = 1) => (n > 0 ? `\x1b[${n}D` : ''),
};

export const screen = {
  altOn: '\x1b[?1049h',
  altOff: '\x1b[?1049l',
  clear: '\x1b[2J',
  clearDown: '\x1b[J',
  clearLine: '\x1b[2K',
  clearLineRight: '\x1b[K',
  // DEC mode 2026 "synchronized output": the terminal buffers everything between
  // these and paints it atomically — no tearing. Terminals that don't know the
  // mode ignore it, so it is always safe to send.
  syncStart: '\x1b[?2026h',
  syncEnd: '\x1b[?2026l',
  // Autowrap off means writing the bottom-right cell can never scroll the screen.
  wrapOff: '\x1b[?7l',
  wrapOn: '\x1b[?7h',
};

export const mouse = {
  on: '\x1b[?1000h\x1b[?1006h',
  off: '\x1b[?1000l\x1b[?1006l',
};

/** OSC 0 — set the terminal window/tab title. */
export const title = (s) => `\x1b]0;${String(s).replace(/[\x00-\x1f]/g, '')}\x07`;

// CSI … final-byte, OSC … BEL/ST, and lone two-byte escapes.
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

export function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '');
}
