// System adapter — everything the audio sources need from the OS, behind one small
// object so tests can swap in fake binaries and fake child processes, and so this
// module stays importable in browsers (Node built-ins load lazily, only when used).
//
//   const sys = await nodeSystem();                 // real: process.platform, PATH lookup, child_process
//   sys.which('parec') → '/usr/bin/parec' | null
//   await sys.run('pw-record', ['--version'], { timeoutMs: 1500 }) → { code, stdout, stderr, timedOut, error }
//   sys.spawn(cmd, args, opts) → ChildProcess-like (stdout/stderr emitters, on('exit'|'error'|'close'), kill())
//   sys.now(), sys.setTimer(fn, ms), sys.clearTimer(h)   — timers are unref'd: a source never keeps a process alive
//
// Rules: never elevate (no sudo/pkexec — nothing here can), never write files, and
// every probe has a hard timeout (a hung tool is killed, never awaited forever).

/**
 * Pure PATH lookup (testable): first `dir/cmd(+ext)` that `exists()` says is an executable file.
 * win32 tries PATHEXT extensions; a cmd containing a path separator is checked as-is.
 */
export function whichIn(cmd, { platform, env = {}, exists, join, delimiter }) {
  if (!cmd) return null;
  const win = platform === 'win32';
  const sep = delimiter || (win ? ';' : ':');
  const exts = win ? ['', ...String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase())] : [''];
  const hasExt = win && /\.[a-z0-9]+$/i.test(cmd);
  if (/[\\/]/.test(cmd)) {
    for (const ext of hasExt ? [''] : exts) if (exists(cmd + ext)) return cmd + ext;
    return null;
  }
  const PATH = env.PATH ?? env.Path ?? env.path ?? '';
  for (const dir of String(PATH).split(sep)) {
    if (!dir) continue;
    for (const ext of hasExt ? [''] : exts) {
      const p = join(dir.replace(/^"|"$/g, ''), cmd + ext);
      if (exists(p)) return p;
    }
  }
  return null;
}

/**
 * Run a command to completion with a hard timeout; never rejects.
 * → { code, signal, stdout, stderr, timedOut, error }
 */
export function runWith(spawnFn, cmd, args = [], { timeoutMs = 2000, env, maxBytes = 65536, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise((resolve) => {
    let child, out = '', err = '', done = false, timer = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimer(timer);
      resolve({ code: null, signal: null, stdout: out, stderr: err, timedOut: false, error: null, ...r });
    };
    try {
      child = spawnFn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
    } catch (error) { return finish({ error }); }
    const cap = (s, d) => (s.length < maxBytes ? s + String(d) : s);
    child.stdout?.on('data', (d) => { out = cap(out, d); });
    child.stderr?.on('data', (d) => { err = cap(err, d); });
    child.on('error', (error) => finish({ error }));
    child.on('close', (code, signal) => finish({ code, signal }));
    timer = setTimer(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ timedOut: true });
    }, timeoutMs);
  });
}

const unref = (h) => { h?.unref?.(); return h; };

/** Live children of every source in this process — killed on process exit, so nothing is orphaned. */
const LIVE = new Set();
let exitHooked = false;
export function trackChild(child) {
  LIVE.add(child);
  const drop = () => LIVE.delete(child);
  child.once?.('exit', drop);
  child.once?.('error', drop);
  if (!exitHooked && typeof process !== 'undefined' && process.once) {
    exitHooked = true;
    process.once('exit', () => { for (const c of LIVE) { try { c.kill('SIGKILL'); } catch { /* gone */ } } });
  }
  return child;
}
export const liveChildren = () => LIVE.size;

/**
 * The real system (Node). overrides: { platform, env, spawn, which, exists } — anything
 * given replaces the real thing (tests pass fake binaries / fake spawn here).
 */
export async function nodeSystem(overrides = {}) {
  const [cp, fs, path] = await Promise.all([import('node:child_process'), import('node:fs'), import('node:path')]);
  const platform = overrides.platform || process.platform;
  const env = overrides.env || process.env;
  const exists = overrides.exists || ((p) => {
    try { const st = fs.statSync(p); if (!st.isFile()) return false; if (platform !== 'win32') fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
  });
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const spawn = overrides.spawn || cp.spawn;
  const sys = {
    kind: 'node',
    platform,
    env,
    arch: overrides.arch || process.arch,
    which: overrides.which || ((cmd) => whichIn(cmd, { platform, env, exists, join })),
    spawn: (cmd, args, opts) => trackChild(spawn(cmd, args, opts)),
    run: (cmd, args, opts = {}) => runWith(spawn, cmd, args, { env, ...opts, setTimer: sys.setTimer, clearTimer: sys.clearTimer }),
    now: overrides.now || (() => (globalThis.performance?.now ? performance.now() : Date.now())),
    setTimer: overrides.setTimer || ((fn, ms) => unref(setTimeout(fn, ms))),
    clearTimer: overrides.clearTimer || ((h) => clearTimeout(h)),
    exists,
  };
  return sys;
}

/**
 * A system with no processes (browsers, or tests): only synthetic sources work.
 * overrides: { now, setTimer, clearTimer, platform }
 */
export function bareSystem(overrides = {}) {
  return {
    kind: 'bare',
    platform: overrides.platform || 'browser',
    env: {},
    which: () => null,
    spawn: () => { throw Object.assign(new Error('no processes in this runtime'), { code: 'ENOSYS' }); },
    run: async () => ({ code: null, signal: null, stdout: '', stderr: '', timedOut: false, error: new Error('no processes') }),
    now: overrides.now || (() => (globalThis.performance?.now ? performance.now() : Date.now())),
    setTimer: overrides.setTimer || ((fn, ms) => setTimeout(fn, ms)),
    clearTimer: overrides.clearTimer || ((h) => clearTimeout(h)),
    exists: () => false,
  };
}

/** Node when available, else a bare system. */
export async function defaultSystem(overrides) {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  return isNode ? nodeSystem(overrides) : bareSystem(overrides);
}

/**
 * A manual clock for deterministic tests: timers fire only when you advance().
 *   const clock = manualClock(); clock.advance(100);
 */
export function manualClock(start = 0) {
  let t = start, seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer(fn, ms) { const id = ++seq; timers.set(id, { at: t + Math.max(0, ms), fn }); return id; },
    clearTimer(id) { timers.delete(id); },
    /** Advance time, firing due timers in order (timers scheduled while firing run too, if due). */
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next[1].at || (x.at === next[1].at && id < next[0]))) next = [id, x];
        if (!next) break;
        timers.delete(next[0]);
        t = Math.max(t, next[1].at);
        next[1].fn();
      }
      t = end;
    },
    get pending() { return timers.size; },
  };
}
