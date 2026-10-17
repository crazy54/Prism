// Screen — owns the terminal while an animation runs.
//
// Two modes:
//   fullscreen  alternate screen buffer; the user's scrollback is restored on exit.
//   inline      reserves `height` rows at the cursor and animates in place, then
//               leaves the final frame in scrollback (spinners, banners, progress).
//
// Rendering is double-buffered: draw into `screen.buffer`, call `render()`, and
// only cells that changed since the last frame are emitted — with cursor moves
// and SGR state changes coalesced — inside a DEC 2026 synchronized-output block
// so the terminal paints each frame atomically. If the terminal can't keep up
// (stdout hasn't drained the previous frame) the frame is dropped rather than
// queued, so animations never fall behind real time.
//
// The terminal is always restored (cursor, colors, wrap, alt screen, raw mode,
// window title) on stop(), on process exit, and on SIGINT / SIGTERM / SIGHUP, which
// exit 128 + the signal number (130 / 143 / 129) like a shell reports them. Ctrl-Z
// (and SIGTSTP) suspends: the terminal is handed back, the process stops, and
// SIGCONT (fg) takes the screen again with a full repaint.

import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import { CellBuffer, attrParams, ATTR, lightTerminal, lightText, defaultInk } from './buffer.js';
import { NONE, fgParam, bgParam } from './color.js';
import { cursor, screen as scr, reset } from './ansi.js';
import { detect } from './caps.js';
import { charWidth } from './width.js';
import { ticker } from './loop.js';

// Attributes that make a space's foreground (or a block's background) visible.
const GLYPH_ATTRS = ATTR.UNDERLINE | ATTR.STRIKE | ATTR.INVERSE;

const active = new Set();
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const SIGNUM = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
const JOB_CONTROL = process.platform !== 'win32'; // Windows has no SIGTSTP / SIGCONT
const onExit = () => { for (const s of [...active]) s._restore(); };
const onSignal = (sig) => {
  for (const s of [...active]) s._restore();
  uninstallExitHooks();
  process.exit(128 + (SIGNUM[sig] || 15));
};

/** Ctrl-Z / SIGTSTP: give the terminal back, stop; SIGCONT resumes (see onCont). */
export function suspend() {
  if (!JOB_CONTROL) return false;
  for (const s of active) s._pause();
  process.kill(process.pid, 'SIGSTOP');
  return true;
}
const onTstp = () => suspend();
const onCont = () => { for (const s of active) s._resume(); };

// Signal listeners replace Node's default "exit on Ctrl-C", so they are only
// attached while at least one Screen is live.
function installExitHooks() {
  if (active.size) return;
  process.on('exit', onExit);
  for (const sig of SIGNALS) process.on(sig, onSignal);
  if (JOB_CONTROL) { process.on('SIGTSTP', onTstp); process.on('SIGCONT', onCont); }
}

function uninstallExitHooks() {
  process.off('exit', onExit);
  for (const sig of SIGNALS) process.off(sig, onSignal);
  if (JOB_CONTROL) { process.off('SIGTSTP', onTstp); process.off('SIGCONT', onCont); }
}

export class Screen extends EventEmitter {
  /**
   * @param {object} opts
   *   output, input      streams (default process.stdout / process.stdin)
   *   mode               'fullscreen' | 'inline'
   *   width, height      fixed size in cells (default: terminal size; inline height default 1)
   *   depth              force color depth ('truecolor'|'256'|'16'|'mono')
   *   caps               pre-detected capabilities
   *   keys               capture keypresses (default: true in fullscreen)
   *   exitOnCtrlC        Ctrl-C stops the screen and exits the process (default true)
   *   clearOnStop        inline only: erase the region on stop instead of leaving the last frame
   *   title              terminal title while running (callers push / pop the user's: player.js holdTitle;
   *                      a suspend pops it for the shell and a resume pushes and sets it again)
   *   suspend            Ctrl-Z suspends the process (default true; POSIX job control only)
   */
  constructor(opts = {}) {
    super();
    this.output = opts.output || process.stdout;
    this.input = opts.input || process.stdin;
    this.mode = opts.mode === 'inline' ? 'inline' : 'fullscreen';
    this.caps = opts.caps || detect({ stream: this.output });
    this.depth = opts.depth || this.caps.depth;
    this.keys = opts.keys ?? this.mode === 'fullscreen';
    this.exitOnCtrlC = opts.exitOnCtrlC !== false;
    this.clearOnStop = !!opts.clearOnStop;
    this.title = opts.title || null;
    this.suspendOnCtrlZ = opts.suspend !== false;
    this._paused = false;
    this._fixedW = opts.width || 0;
    this._fixedH = opts.height || 0;

    const { width, height } = this._measure();
    this.buffer = new CellBuffer(width, height);
    this.front = new CellBuffer(width, height);
    this._full = true;
    this._pending = false;
    this._running = false;
    this._row = 0; // inline: cursor row relative to region top
    this.frames = 0;
    this.dropped = 0;
    this.bytes = 0;
    this._onResize = () => this._resize();
    this._onKey = (str, key) => this._key(str, key);
  }

  get width() { return this.buffer.width; }
  get height() { return this.buffer.height; }

  _measure() {
    const cols = this.output.columns || this.caps.width || 80;
    const rows = this.output.rows || this.caps.height || 24;
    if (this.mode === 'inline') return { width: this._fixedW || cols, height: Math.min(this._fixedH || 1, rows) };
    return { width: this._fixedW || cols, height: this._fixedH || rows };
  }

  // TTY writes reach the terminal synchronously on every platform (on Windows
  // only the completion callback is deferred), so a write issued during exit or
  // right before process.exit() is never lost. The callback gates frame dropping.
  _write(s) {
    if (!s) return true;
    this.bytes += s.length;
    this._pending = true;
    return this.output.write(s, () => { this._pending = false; });
  }

  start() {
    if (this._running) return this;
    this._running = true;
    installExitHooks();
    active.add(this);
    let out = cursor.hide + scr.wrapOff;
    if (this.title) out += `\x1b]0;${this.title}\x07`; // the caller pushed the user's title first (player.js holdTitle)
    if (this.mode === 'fullscreen') out += scr.altOn + reset + scr.clear + cursor.home;
    else {
      // Reserve the region by scrolling it into existence, then return to its top.
      out += '\r' + '\n'.repeat(this.height - 1) + cursor.up(this.height - 1);
      this._row = 0;
    }
    this._write(out);
    this._full = true;
    if (this.output.isTTY && !this._fixedW) this.output.on('resize', this._onResize);
    if (this.keys && this.input && this.input.isTTY) {
      readline.emitKeypressEvents(this.input);
      this.input.setRawMode(true);
      this.input.on('keypress', this._onKey);
      this.input.resume();
    }
    return this;
  }

  stop() {
    if (!this._running) return this;
    this._restore();
    this.emit('stop');
    return this;
  }

  _restore() {
    if (!this._running) return;
    this._running = false;
    active.delete(this);
    if (!active.size) uninstallExitHooks();
    this.ticker?.stop();
    this.output.off?.('resize', this._onResize);
    if (this.keys && this.input && this.input.isTTY) {
      this.input.off('keypress', this._onKey);
      try { this.input.setRawMode(false); } catch { /* stream already closed */ }
      this.input.pause();
    }
    this._paused = false;
    let out = reset;
    if (this.mode === 'fullscreen') out += scr.altOff;
    else {
      out += cursor.down(this.height - 1 - this._row) + '\r';
      if (this.clearOnStop) {
        for (let i = 0; i < this.height; i++) out += scr.clearLine + (i < this.height - 1 ? cursor.up(1) : '');
      } else out += '\n';
      this._row = 0;
    }
    out += scr.wrapOn + cursor.show;
    this._write(out);
  }

  /** Suspend (Ctrl-Z): hand the terminal back as on stop(), but stay live for _resume(). */
  _pause() {
    if (!this._running || this._paused) return;
    this._paused = true;
    if (this.keys && this.input && this.input.isTTY) { try { this.input.setRawMode(false); } catch { /* closed */ } }
    let out = reset;
    if (this.mode === 'fullscreen') out += scr.altOff;
    else out += cursor.down(this.height - 1 - this._row) + '\r\n';
    out += scr.wrapOn + cursor.show;
    if (this.title) out += '\x1b[23;0t';
    this._write(out);
  }

  /** Resume after SIGCONT: take the screen again and repaint everything. */
  _resume() {
    if (!this._running || !this._paused) return;
    this._paused = false;
    if (this.keys && this.input && this.input.isTTY) { try { this.input.setRawMode(true); } catch { /* closed */ } }
    let out = cursor.hide + scr.wrapOff;
    if (this.title) out += `\x1b[22;0t\x1b]0;${this.title}\x07`;
    if (this.mode === 'fullscreen') out += scr.altOn + reset + scr.clear + cursor.home;
    else { out += '\r' + '\n'.repeat(this.height - 1) + cursor.up(this.height - 1); this._row = 0; }
    this._write(out);
    this._full = true;
    this._resize(); // the terminal may have changed size while we were stopped
    this.emit('resume');
  }

  _resize() {
    const { width, height } = this._measure();
    if (width === this.width && height === this.height) return;
    this.buffer.resize(width, height);
    this.front.resize(width, height);
    this._full = true;
    if (this.mode === 'fullscreen') this._write(reset + scr.clear);
    this.emit('resize', { width, height });
  }

  _key(str, key = {}) {
    const k = { name: key.name || str, sequence: key.sequence || str, ctrl: !!key.ctrl, meta: !!key.meta, shift: !!key.shift };
    if (k.ctrl && k.name === 'c' && this.exitOnCtrlC) {
      this.stop();
      process.exit(130);
    }
    // Raw mode swallows the terminal's own Ctrl-Z, so job control is done here.
    if (k.ctrl && k.name === 'z' && this.suspendOnCtrlZ && suspend()) return;
    this.emit('key', k);
  }

  /** Force the next render() to repaint every cell. */
  invalidate() {
    this._full = true;
    return this;
  }

  _moveTo(x, y) {
    if (this.mode === 'fullscreen') return cursor.to(x, y);
    const dy = y - this._row;
    this._row = y;
    return (dy > 0 ? cursor.down(dy) : dy < 0 ? cursor.up(-dy) : '') + cursor.column(x);
  }

  /** Diff the back buffer against what's on screen and write the difference. */
  render({ force = false } = {}) {
    if (!this._running || this._paused) return false; // suspended (Ctrl-Z): the terminal is the shell's
    if (this._pending && !force) { this.dropped++; return false; }
    const out = this.frame();
    if (out) this._write(out);
    this.frames++;
    return true;
  }

  /** Build (and commit to the front buffer) the escape string for the next frame. */
  frame() {
    const b = this.buffer, f = this.front, W = b.width, H = b.height, depth = this.depth;
    // 16 colors on a light terminal: a text color's slot depends on the cell's fill (color.js ansi16Text).
    const light = depth === '16' && lightTerminal(b), ink = defaultInk(b); // ink: sent as SGR 39 (--transparent)
    const full = this._full;
    this._full = false;
    let out = '';
    let cx = -1, cy = -1, fg = null, bg = null, at = -1, fgP = null; // fgP: the fg SGR last sent (light 16 only)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ch = b.ch[i], bfg = b.fg[i] === ink ? NONE : b.fg[i], bbg = b.bg[i], bat = b.at[i];
        // A plain space never shows its foreground and a full block never shows its
        // background, so those channels are "don't care": they neither count as a
        // change nor force an SGR — a large saving on half-block color fields.
        const plain = !(bat & GLYPH_ATTRS);
        const noFg = plain && ch === ' ', noBg = plain && ch === '█';
        if (!full && ch === f.ch[i] && bat === f.at[i] && (noFg || bfg === f.fg[i]) && (noBg || bbg === f.bg[i])) continue;
        f.ch[i] = ch; f.fg[i] = bfg; f.bg[i] = bbg; f.at[i] = bat;
        if (ch === '') continue; // right half of a wide glyph — the terminal already advanced
        if (cx !== x || cy !== y) {
          // Bridging a short run of unchanged cells by re-sending them is cheaper
          // than a cursor jump — when they already match the current SGR state.
          let bridge = null;
          if (!light && cy === y && cx >= 0 && x > cx && x - cx <= 4) {
            bridge = '';
            for (let k = y * W + cx; k < i; k++) {
              const c = b.ch[k];
              if (c.length !== 1 || c.charCodeAt(0) >= 0x300 || b.at[k] !== at
                || b.bg[k] !== bg || (b.fg[k] !== fg && c !== ' ')) { bridge = null; break; }
              bridge += c;
            }
          }
          out += bridge ?? this._moveTo(x, y);
        }
        // Light 16: the fg slot depends on the fill and on whether the glyph is text (lightText).
        const fp = light ? fgParam(bfg, depth, bbg, lightText(ch)) : null;
        if (bat !== at) {
          const ap = attrParams(bat);
          out += `\x1b[0${ap ? ';' + ap : ''};${fp ?? fgParam(bfg, depth)};${bgParam(bbg, depth)}m`;
          at = bat; fg = bfg; bg = bbg; fgP = fp;
        } else {
          const wantBg = !noBg && bbg !== bg, wantFg = !noFg && (light ? fp !== fgP : bfg !== fg);
          if (wantFg || wantBg) {
            out += `\x1b[${wantFg ? fp ?? fgParam(bfg, depth) : ''}${wantFg && wantBg ? ';' : ''}${wantBg ? bgParam(bbg, depth) : ''}m`;
            if (wantFg) { fg = bfg; fgP = fp; }
            if (wantBg) bg = bbg;
          }
        }
        out += ch;
        cx = x + (ch.length === 1 && ch.charCodeAt(0) < 0x300 ? 1 : charWidth(ch.codePointAt(0)) || 1);
        cy = y;
        if (cx >= W) cx = -1; // wrap is off; the cursor parks on the last column
      }
    }
    if (!out) return '';
    return scr.syncStart + out + reset + scr.syncEnd;
  }

  /**
   * Drive `frameFn(t, dt, n)` at `fps` without taking ownership of the screen's
   * lifetime: returning false from frameFn (or calling handle.stop()) ends the
   * loop but leaves the screen running. render() is called for you. Returns the
   * ticker handle (pause/resume/toggle/fps) with a `done` promise.
   */
  animate(frameFn, { fps = 30 } = {}) {
    if (!this._running) this.start();
    let finish;
    const done = new Promise((r) => { finish = r; });
    const handle = ticker((t, dt, n) => {
      if (!this._running) { handle.stop(); finish(); return; }
      if (this._pending) { this.dropped++; return; }
      if (frameFn(t, dt, n) === false) {
        this.render({ force: true });
        handle.stop();
        finish();
        return;
      }
      this.render();
    }, { fps });
    const stop = handle.stop;
    const onStop = () => handle.stop();
    handle.stop = () => { stop(); this.off('stop', onStop); finish(); };
    handle.done = done;
    this.ticker = handle;
    this.once('stop', onStop);
    return handle;
  }

  /**
   * Like animate(), but owns the screen: starts it if needed and stops it when
   * frameFn returns false or `duration` seconds elapse. Resolves on stop.
   */
  run(frameFn, { fps = 30, duration = 0 } = {}) {
    if (!this._running) this.start();
    return new Promise((resolve) => {
      this.once('stop', resolve);
      const h = this.animate((t, dt, n) => (frameFn(t, dt, n) === false || (duration && t >= duration) ? false : undefined), { fps });
      h.done.then(() => this.stop());
    });
  }
}

export { NONE };
