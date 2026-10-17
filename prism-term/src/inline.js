// Inline CLI helpers — spinners, progress, task lists, "AI is thinking", and a
// token-stream typewriter — that animate in place in normal scrollback and
// leave clean final lines behind (ora / listr territory, zero dependencies).
//
// Each live helper owns a small inline Screen region. When the stream is not a
// TTY (CI logs, pipes, files) they degrade to plain line-by-line text with no
// escape codes at all. Transient UI defaults to stderr so stdout stays pipeable;
// typewrite() writes content and defaults to stdout.

import { performance } from 'node:perf_hooks';
import { Screen } from './screen.js';
import { detect } from './caps.js';
import { getTheme, palette as makePalette } from './palettes.js';
import { fgParam, mix } from './color.js';
import { ATTR } from './buffer.js';
import { stringWidth, truncate } from './width.js';
import { reset } from './ansi.js';
import { drawSpinner, getSpinner } from './spinners.js';
import { progressBar } from './widgets/bars.js';
import { col, fmt, fmtDuration } from './widgets/util.js';

const SYMBOLS = {
  unicode: { success: '✔', fail: '✖', warn: '⚠', info: 'ℹ', pending: '○', skip: '↓', start: '-' },
  ascii: { success: '+', fail: 'x', warn: '!', info: 'i', pending: '-', skip: '>', start: '-' },
};

const now = () => performance.now();

/** True when `stream` should get live animation (a real TTY, not TERM=dumb). */
export function isInteractive(stream, opts = {}) {
  if (opts.interactive !== undefined) return !!opts.interactive;
  return !!(stream && stream.isTTY) && process.env.TERM !== 'dumb';
}

/** Log symbols appropriate for a stream's capabilities. */
export function symbols(stream = process.stderr) {
  return detect({ stream }).unicode ? SYMBOLS.unicode : SYMBOLS.ascii;
}

// An inline Screen region that keeps animating across log() calls: logging
// clears the region, prints the line above it, and re-reserves the region.
class LiveRegion {
  constructor({ stream, height, fps = 15, draw }) {
    this.stream = stream;
    this.height = height;
    this.fps = fps;
    this.draw = draw;
    this.t0 = now();
    this.screen = null;
  }

  get t() { return (now() - this.t0) / 1000; }

  start() {
    this.screen = new Screen({ output: this.stream, mode: 'inline', height: this.height, keys: false });
    this.screen.start();
    this._paint();
    this.screen.render({ force: true });
    this.screen.run(() => { this._paint(); }, { fps: this.fps });
    return this;
  }

  _paint() {
    const b = this.screen.buffer;
    b.clear();
    this.draw(b, this.t);
  }

  /** Redraw now (e.g. after a text change) instead of waiting for the next tick. */
  refresh() {
    if (!this.screen) return;
    this._paint();
    this.screen.render();
  }

  log(text) {
    if (!this.screen) { this.stream.write(text + '\n'); return; }
    this.screen.clearOnStop = true;
    this.screen.stop();
    this.stream.write(text + '\n');
    this.start();
  }

  /** Draw a final frame, leave it in scrollback, and release the terminal. */
  finish(drawFinal) {
    if (!this.screen) return;
    const b = this.screen.buffer;
    b.clear();
    drawFinal(b);
    this.screen.render({ force: true });
    this.screen.clearOnStop = false;
    this.screen.stop();
    this.screen = null;
  }

  /** Erase the region and release the terminal. */
  clear() {
    if (!this.screen) return;
    this.screen.clearOnStop = true;
    this.screen.stop();
    this.screen = null;
  }
}

/** Draw "<symbol> <text> <dim suffix>" on row y. */
function drawLine(b, y, symbol, symColor, text, theme, suffix) {
  let x = 0;
  if (symbol) x = b.text(0, y, symbol, symColor, undefined, ATTR.BOLD) + 1;
  const sw = suffix ? stringWidth(suffix) + 1 : 0;
  x = b.text(x, y, truncate(String(text ?? ''), Math.max(0, b.width - x - sw - 1)), theme.ink);
  if (suffix && x + 1 < b.width) b.text(x + 1, y, truncate(suffix, b.width - x - 2), theme.dim);
}

/**
 * Start an inline spinner (like ora().start()).
 * @param {string} text
 * @param {object} [opts]
 * @param {string|object} [opts.style='dots']  spinner name (see SPINNERS) or { frames, interval }
 * @param {*} [opts.color]     spinner color (default: its palette, else theme.accent)
 * @param {*} [opts.theme]
 * @param {NodeJS.WritableStream} [opts.stream=process.stderr]
 * @param {boolean} [opts.timer=false]  show elapsed time
 * @param {boolean} [opts.interactive]  force/disable animation
 */
export function spinner(text = '', opts = {}) {
  const stream = opts.stream || process.stderr;
  const theme = getTheme(opts.theme);
  const live = isInteractive(stream, opts);
  const sym = symbols(stream);
  const style = sym === SYMBOLS.ascii && !opts.style ? 'line' : opts.style || 'dots';
  const color = opts.color === undefined ? undefined : col(opts.color, theme, theme.accent);
  const started = now();
  let current = String(text);
  let running = true;
  const elapsed = () => fmtDuration((now() - started) / 1000);

  const region = live
    ? new LiveRegion({
      stream,
      height: 1,
      fps: Math.min(30, Math.max(8, Math.round(1000 / getSpinner(style).interval))),
      draw: (b, t) => {
        const x = drawSpinner(b, 0, 0, style, t, { color, theme }) + 1;
        const suffix = opts.timer ? elapsed() : '';
        const sw = suffix ? stringWidth(suffix) + 1 : 0;
        const end = b.text(x, 0, truncate(current, Math.max(0, b.width - x - sw - 1)), theme.ink);
        if (suffix) b.text(end + 1, 0, suffix, theme.dim);
      },
    }).start()
    : null;
  if (!live) stream.write(`${sym.start} ${current}\n`);

  const finish = (kind, symColor, finalText) => {
    if (!running) return api;
    running = false;
    const t = finalText === undefined ? current : String(finalText);
    const suffix = opts.timer ? elapsed() : '';
    if (region) region.finish((b) => drawLine(b, 0, sym[kind], symColor, t, theme, suffix));
    else stream.write(`${sym[kind]} ${t}${suffix ? ` (${suffix})` : ''}\n`);
    return api;
  };

  const api = {
    get text() { return current; },
    set text(v) { api.update(v); },
    get isSpinning() { return running; },
    /** Change the spinner's text. */
    update(v) { current = String(v); region?.refresh(); return api; },
    succeed: (t) => finish('success', theme.pos, t),
    fail: (t) => finish('fail', theme.neg, t),
    warn: (t) => finish('warn', theme.warn, t),
    info: (t) => finish('info', theme.info, t),
    /** Stop and keep a custom final line. */
    stopAndPersist({ symbol = '', text: t, color: c } = {}) {
      if (!running) return api;
      running = false;
      const ft = t === undefined ? current : String(t);
      if (region) region.finish((b) => drawLine(b, 0, symbol, col(c, theme, theme.accent), ft, theme));
      else stream.write(`${symbol ? symbol + ' ' : ''}${ft}\n`);
      return api;
    },
    /** Stop and erase the spinner line. */
    stop() {
      if (!running) return api;
      running = false;
      region?.clear();
      return api;
    },
    /** Print a line above the spinner without disturbing it. */
    log(line) {
      if (region && running) region.log(String(line));
      else stream.write(`${line}\n`);
      return api;
    },
    /**
     * Spin until `promise` settles: succeed on resolve, fail (and rethrow) on reject.
     * @param {Promise|function():Promise} promise
     * @param {{success?:string|function(value):string, failure?:string|function(error):string}} [msgs]
     */
    async wrap(promise, msgs = {}) {
      try {
        const v = await (typeof promise === 'function' ? promise() : promise);
        finish('success', theme.pos, typeof msgs.success === 'function' ? msgs.success(v) : msgs.success);
        return v;
      } catch (e) {
        finish('fail', theme.neg, typeof msgs.failure === 'function' ? msgs.failure(e) : msgs.failure ?? `${current} — ${e?.message ?? e}`);
        throw e;
      }
    },
  };
  return api;
}

/**
 * Inline progress bar with rate and ETA.
 * @param {object} [opts]
 * @param {number} [opts.total=100]
 * @param {string} [opts.label='']
 * @param {*} [opts.gradient]   bar gradient (default theme info→accent→pos)
 * @param {number} [opts.width] bar width in cells (default: fits the terminal, max 40)
 * @param {string} [opts.unit=''] appended to counts/rate ("files" → 12 files/s)
 * @param {NodeJS.WritableStream} [opts.stream=process.stderr]
 * @returns {{tick(n?:number, label?:string), update(value:number, label?:string), done(label?:string), fail(label?:string), readonly value:number}}
 */
export function progress(opts = {}) {
  const stream = opts.stream || process.stderr;
  const theme = getTheme(opts.theme);
  const live = isInteractive(stream, opts);
  const sym = symbols(stream);
  const total = Math.max(1, opts.total ?? 100);
  const unit = opts.unit ? ` ${opts.unit}` : '';
  const gradient = opts.gradient ?? [theme.info, theme.accent, theme.pos];
  const started = now();
  let value = 0, label = opts.label || '', rate = 0, lastV = 0, lastT = started, running = true, lastPct = 0;

  const stats = () => {
    const eta = rate > 0 ? (total - value) / rate : NaN;
    return `${fmt(value)}/${fmt(total)}${unit}  ${rate > 0 ? fmt(rate) + unit + '/s' : ''}${Number.isFinite(eta) && value < total ? `  ETA ${fmtDuration(eta)}` : ''}`;
  };

  const draw = (b, t, final) => {
    let x = 0;
    if (final) x = b.text(0, 0, final.symbol, final.color, undefined, ATTR.BOLD) + 1;
    else x = drawSpinner(b, 0, 0, sym === SYMBOLS.ascii ? 'line' : 'dots', t, { theme }) + 1;
    if (label) x = b.text(x, 0, truncate(label, Math.max(8, Math.floor(b.width / 3))), theme.ink, undefined, ATTR.BOLD) + 1;
    const tail = final ? `${fmt(value)}/${fmt(total)}${unit}  ${fmtDuration((now() - started) / 1000)}` : stats();
    const bw = Math.max(4, Math.min(opts.width ?? 40, b.width - x - stringWidth(tail) - 8));
    progressBar(b, x, 0, bw + 5, value / total, { theme, gradient, showPercent: true, ascii: sym === SYMBOLS.ascii });
    x += bw + 5;
    b.text(x + 2, 0, truncate(tail, Math.max(0, b.width - x - 3)), theme.dim);
  };

  const region = live ? new LiveRegion({ stream, height: 1, fps: 12, draw: (b, t) => draw(b, t, null) }).start() : null;

  const plain = (force) => {
    const pct = Math.floor((value / total) * 100);
    const step = Math.floor(pct / 25) * 25;
    if (!force && step <= lastPct) return;
    lastPct = step;
    stream.write(`${label ? label + ' ' : ''}${pct}% (${fmt(value)}/${fmt(total)}${unit})\n`);
  };

  const api = {
    get value() { return value; },
    update(v, l) {
      if (!running) return api;
      const t = now();
      value = Math.max(0, Math.min(total, Number(v) || 0));
      if (l !== undefined) label = String(l);
      const dt = (t - lastT) / 1000;
      if (dt > 0.05) {
        const inst = (value - lastV) / dt;
        rate = rate ? rate * 0.7 + inst * 0.3 : inst;
        lastV = value; lastT = t;
      }
      if (region) region.refresh();
      else if (value < total) plain(false);
      return api;
    },
    tick(n = 1, l) { return api.update(value + n, l); },
    done(l) {
      if (!running) return api;
      value = total;
      if (l !== undefined) label = String(l);
      running = false;
      if (region) region.finish((b) => draw(b, 0, { symbol: sym.success, color: theme.pos }));
      else stream.write(`${sym.success} ${label ? label + ' ' : ''}100% (${fmt(total)}${unit}) in ${fmtDuration((now() - started) / 1000)}\n`);
      return api;
    },
    fail(l) {
      if (!running) return api;
      if (l !== undefined) label = String(l);
      running = false;
      if (region) region.finish((b) => draw(b, 0, { symbol: sym.fail, color: theme.neg }));
      else stream.write(`${sym.fail} ${label ? label + ' ' : ''}failed at ${Math.floor((value / total) * 100)}%\n`);
      return api;
    },
  };
  return api;
}

/**
 * Run tasks with a live multi-line status list (listr-style).
 * @param {Array<{title:string, run:function(task):*, skip?:function():(boolean|string)}>} list
 * @param {object} [opts]
 * @param {boolean} [opts.concurrent=false]  run all at once; failures never stop the others
 * @param {boolean} [opts.exitOnError]       sequential default true: skip the rest after a failure
 * @param {string} [opts.style='dots']       spinner for running tasks
 * @param {NodeJS.WritableStream} [opts.stream=process.stderr]
 * @returns {Promise<Array<{title:string, status:'success'|'failed'|'skipped', value?:*, error?:Error, duration:number}>>}
 *
 * Each task's `run(task)` receives { update(msg), title (get/set), skip(reason), log(msg) }.
 */
export async function tasks(list, opts = {}) {
  const stream = opts.stream || process.stderr;
  const theme = getTheme(opts.theme);
  const live = isInteractive(stream, opts);
  const sym = symbols(stream);
  const style = sym === SYMBOLS.ascii && !opts.style ? 'line' : opts.style || 'dots';
  const concurrent = !!opts.concurrent;
  const exitOnError = opts.exitOnError ?? !concurrent;
  const items = (list || []).map((t) => ({ title: String(t.title ?? ''), run: t.run, skip: t.skip, status: 'pending', sub: '', start: 0, end: 0 }));
  const rows = Math.max(1, Math.min(items.length, (stream.rows || 24) - 1));

  const drawItem = (b, y, it, t) => {
    const dur = it.end ? fmtDuration((it.end - it.start) / 1000) : '';
    if (it.status === 'running') {
      const x = drawSpinner(b, 0, y, style, t, { theme }) + 1;
      const end = b.text(x, y, truncate(it.title, Math.max(0, b.width - x - 1)), theme.ink);
      if (it.sub && end + 3 < b.width) b.text(end + 1, y, truncate(`› ${it.sub}`, b.width - end - 2), theme.dim);
    } else if (it.status === 'success') drawLine(b, y, sym.success, theme.pos, it.title, theme, dur);
    else if (it.status === 'failed') {
      drawLine(b, y, sym.fail, theme.neg, it.title, theme, '');
      const end = Math.min(b.width, 2 + stringWidth(it.title));
      if (end + 3 < b.width) b.text(end + 1, y, truncate(`— ${it.error?.message ?? it.error}`, b.width - end - 2), theme.neg);
    } else if (it.status === 'skipped') drawLine(b, y, sym.skip, theme.dim, it.title, theme, it.reason ? `skipped: ${it.reason}` : 'skipped');
    else {
      b.text(0, y, sym.pending, theme.dim);
      b.text(2, y, truncate(it.title, Math.max(0, b.width - 3)), theme.muted);
    }
  };
  const draw = (b, t) => {
    const overflow = items.length > rows;
    const shown = overflow ? rows - 1 : rows;
    // Keep the active part of the list in view.
    const firstActive = Math.max(0, items.findIndex((i) => i.status === 'running' || i.status === 'pending'));
    const start = overflow ? Math.max(0, Math.min(firstActive, items.length - shown)) : 0;
    for (let i = 0; i < shown && start + i < items.length; i++) drawItem(b, i, items[start + i], t);
    if (overflow) b.text(0, rows - 1, `… ${items.length - shown} more`, theme.dim);
  };

  const region = live && items.length ? new LiveRegion({ stream, height: rows, fps: 12, draw }).start() : null;
  const out = (s) => (region ? region.log(s) : stream.write(s + '\n'));

  const runOne = async (it) => {
    if (it.skip) {
      const r = await it.skip();
      if (r) { it.status = 'skipped'; it.reason = typeof r === 'string' ? r : ''; region?.refresh(); if (!live) stream.write(`${sym.skip} ${it.title} (skipped)\n`); return; }
    }
    it.status = 'running';
    it.start = now();
    if (!live) stream.write(`${sym.start} ${it.title}\n`);
    region?.refresh();
    let skipped = null;
    const task = {
      get title() { return it.title; },
      set title(v) { it.title = String(v); region?.refresh(); },
      update(msg) { it.sub = String(msg); region?.refresh(); },
      log(msg) { out(String(msg)); },
      skip(reason = '') { skipped = { reason }; throw skipped; },
    };
    try {
      it.value = await it.run(task);
      it.status = 'success';
    } catch (e) {
      if (e && e === skipped) { it.status = 'skipped'; it.reason = e.reason; }
      else { it.status = 'failed'; it.error = e instanceof Error ? e : new Error(String(e)); }
    }
    it.end = now();
    region?.refresh();
    if (!live) {
      const d = fmtDuration((it.end - it.start) / 1000);
      if (it.status === 'success') stream.write(`${sym.success} ${it.title} (${d})\n`);
      else if (it.status === 'failed') stream.write(`${sym.fail} ${it.title} — ${it.error.message}\n`);
      else stream.write(`${sym.skip} ${it.title} (skipped${it.reason ? ': ' + it.reason : ''})\n`);
    }
  };

  if (concurrent) await Promise.all(items.map(runOne));
  else {
    for (const it of items) {
      if (exitOnError && items.some((i) => i.status === 'failed')) { it.status = 'skipped'; it.reason = 'previous task failed'; continue; }
      await runOne(it);
    }
  }
  region?.finish((b) => draw(b, 0));
  return items.map((i) => ({ title: i.title, status: i.status, value: i.value, error: i.error, duration: i.end ? (i.end - i.start) / 1000 : 0 }));
}

/**
 * "AI is thinking" — a gradient shimmer sweeping across the text, a dot-wave
 * spinner, and elapsed seconds.
 * @param {string} [text='Thinking']
 * @param {object} [opts]
 * @param {'shimmer'|'pulse'|'rainbow'} [opts.style='shimmer']
 * @param {string|Array} [opts.palette='aurora']  highlight gradient
 * @param {string} [opts.spinner='thinking']
 * @param {boolean} [opts.timer=true]
 * @param {NodeJS.WritableStream} [opts.stream=process.stderr]
 * @returns {{update(text:string), log(line:string), stop(), succeed(text?:string), fail(text?:string), readonly elapsed:number}}
 */
export function thinking(text = 'Thinking', opts = {}) {
  const stream = opts.stream || process.stderr;
  const theme = getTheme(opts.theme);
  const live = isInteractive(stream, opts);
  const sym = symbols(stream);
  const style = opts.style || 'shimmer';
  const spin = sym === SYMBOLS.ascii && !opts.spinner ? 'line' : opts.spinner || 'thinking';
  const pal = makePalette(style === 'rainbow' ? 'prism' : opts.palette || 'aurora', theme);
  const started = now();
  let current = String(text), running = true;

  const draw = (b, t) => {
    let x = drawSpinner(b, 0, 0, spin, t, { theme, color: style === 'rainbow' ? undefined : theme.accent }) + 1;
    const chars = [...truncate(current, Math.max(0, b.width - x - 8))];
    const n = chars.length;
    const band = Math.max(3, n * 0.18);
    const head = ((t * 22) % (n + band * 4)) - band * 2;
    chars.forEach((ch, i) => {
      let c;
      if (style === 'pulse') c = mix(theme.muted, theme.ink, 0.5 + 0.5 * Math.sin(t * 4));
      else if (style === 'rainbow') c = pal(((i / Math.max(1, n)) * 0.6 + t * 0.35) % 1);
      else {
        const k = Math.max(0, 1 - Math.abs(i - head) / band);
        c = mix(theme.muted, mix(theme.ink, pal(0.55 + 0.45 * ((i / Math.max(1, n) + t * 0.2) % 1)), 0.6), k * k * (3 - 2 * k));
      }
      x = b.text(x, 0, ch, c);
    });
    if (opts.timer !== false) b.text(x + 1, 0, `${Math.floor(t)}s`, theme.dim);
  };

  const region = live ? new LiveRegion({ stream, height: 1, fps: 24, draw }).start() : null;
  if (!live) stream.write(`… ${current}\n`);

  const end = (kind, c, t) => {
    if (!running) return api;
    running = false;
    const ft = t === undefined ? current : String(t);
    const d = fmtDuration((now() - started) / 1000);
    if (region) region.finish((b) => drawLine(b, 0, sym[kind], c, ft, theme, d));
    else stream.write(`${sym[kind]} ${ft} (${d})\n`);
    return api;
  };
  const api = {
    get elapsed() { return (now() - started) / 1000; },
    update(v) { current = String(v); region?.refresh(); return api; },
    log(line) { if (region && running) region.log(String(line)); else stream.write(`${line}\n`); return api; },
    /** Erase the indicator (e.g. right before streaming the answer). */
    stop() { if (running) { running = false; region?.clear(); } return api; },
    succeed: (t) => end('success', theme.pos, t),
    fail: (t) => end('fail', theme.neg, t),
  };
  return api;
}

/**
 * Stream text at a characters-per-second rate, like an LLM token stream.
 * Accepts a string or an (async) iterable of chunks — chunks are typed as they
 * arrive, speeding up when a backlog builds so output never lags far behind.
 * Non-TTY streams get the text immediately with no escape codes.
 * @param {string|Iterable<string>|AsyncIterable<string>} text
 * @param {object} [opts]
 * @param {number} [opts.cps=60]        characters per second
 * @param {*} [opts.color]              text color (theme token or color)
 * @param {boolean} [opts.newline=true] end with a newline
 * @param {number} [opts.jitter=0.5]    0..1 speed variation for a natural feel
 * @param {NodeJS.WritableStream} [opts.stream=process.stdout]
 * @returns {Promise<string>} the full text written
 */
export async function typewrite(text, opts = {}) {
  const stream = opts.stream || process.stdout;
  const live = isInteractive(stream, opts);
  const newline = opts.newline !== false;
  const isIter = text && typeof text !== 'string' && (typeof text[Symbol.asyncIterator] === 'function' || typeof text[Symbol.iterator] === 'function');

  if (!live) {
    let all = '';
    if (isIter) for await (const chunk of text) { const s = String(chunk); all += s; stream.write(s); }
    else { all = String(text ?? ''); stream.write(all); }
    if (newline) stream.write('\n');
    return all;
  }

  const theme = getTheme(opts.theme);
  const depth = detect({ stream }).depth;
  const prefix = opts.color !== undefined && depth !== 'mono' ? `\x1b[${fgParam(col(opts.color, theme, theme.ink), depth)}m` : '';
  const cps = Math.max(1, opts.cps ?? 60);
  const jitter = Math.max(0, Math.min(1, opts.jitter ?? 0.5));
  const queue = [];
  let all = '', producing = true, failure = null;

  if (isIter) {
    (async () => {
      try { for await (const chunk of text) { const s = String(chunk); all += s; queue.push(...s); } }
      catch (e) { failure = e; }
      finally { producing = false; }
    })();
  } else {
    all = String(text ?? '');
    queue.push(...all);
    producing = false;
  }

  if (prefix) stream.write(prefix);
  await new Promise((resolve) => {
    let acc = 0, last = now();
    const step = () => {
      const t = now(), dt = (t - last) / 1000;
      last = t;
      // Catch up when a backlog builds (keep it under ~0.4s of typing).
      const speed = Math.max(cps, queue.length / 0.4);
      acc += speed * dt * (1 - jitter / 2 + Math.random() * jitter);
      const n = Math.min(queue.length, Math.floor(acc));
      if (n > 0) { acc -= n; stream.write(queue.splice(0, n).join('')); }
      if (!queue.length) acc = Math.min(acc, 1);
      if (!producing && !queue.length) { resolve(); return; }
      setTimeout(step, 16);
    };
    setTimeout(step, 16);
  });
  stream.write((prefix ? reset : '') + (newline ? '\n' : ''));
  if (failure) throw failure;
  return all;
}
