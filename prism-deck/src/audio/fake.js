// Fakes for testing anything that hosts an audio source — no real binaries, no real
// audio, no real time (pair with system.js manualClock()). Browser-safe.
//
//   const clock = manualClock();
//   const sys = fakeSystem({ platform: 'linux', bins: ['parec', 'pactl'], clock,
//     run: { 'pw-record --version': { stdout: 'Compiled with libpipewire 1.4.7' } },
//     behave: { parec: tone({ freq: 440 }), arecord: exitWith(1, 'no soundcards') } });
//   const src = createAudioSource({ system: sys }); await src.start(); clock.advance(500);
//
// Behaviours (what a spawned fake does): tone(), silence(), hang(), exitWith(), stallAfter(), lines().

class Emitter {
  constructor() { this.l = new Map(); }
  on(n, f) { (this.l.get(n) || this.l.set(n, []).get(n)).push(f); return this; }
  once(n, f) { const w = (...a) => { this.off(n, w); f(...a); }; return this.on(n, w); }
  off(n, f) { const a = this.l.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } return this; }
  emit(n, ...a) { for (const f of [...(this.l.get(n) || [])]) f(...a); return this; }
}

let PID = 1000;

/** A ChildProcess look-alike. kill() exits it on the next tick unless it ignores that signal. */
export class FakeChild extends Emitter {
  constructor({ cmd, args, env, sys, ignore = [] } = {}) {
    super();
    this.cmd = cmd; this.args = args; this.env = env; this.sys = sys;
    this.stdout = new Emitter(); this.stderr = new Emitter();
    this.pid = ++PID; this.killed = false; this.exitCode = null; this.signals = [];
    this.ignore = new Set(ignore);
    this.timers = new Set();
  }
  /** Schedule on the owning system's clock (manual in tests). */
  after(ms, fn) { const h = this.sys.setTimer(() => { this.timers.delete(h); if (this.exitCode === null) fn(); }, ms); this.timers.add(h); return h; }
  write(bytes) { if (this.exitCode === null) this.stdout.emit('data', bytes); }
  err(text) { if (this.exitCode === null) this.stderr.emit('data', text); }
  exit(code = 0, signal = null) {
    if (this.exitCode !== null) return;
    this.exitCode = code ?? -1;
    for (const h of this.timers) this.sys.clearTimer(h);
    this.timers.clear();
    queueMicrotask(() => { this.emit('exit', code, signal); this.emit('close', code, signal); });
  }
  kill(signal = 'SIGTERM') {
    this.signals.push(signal);
    if (this.exitCode !== null) return false;
    if (this.ignore.has(signal)) return true;
    this.killed = true;
    this.exit(null, signal);
    return true;
  }
}

/** s16le bytes of a sine (deterministic). */
export function sineBytes(n, { freq = 440, rate = 16000, amp = 0.5, start = 0 } = {}) {
  const b = new Uint8Array(n * 2), dv = new DataView(b.buffer);
  for (let i = 0; i < n; i++) dv.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * freq * (start + i)) / rate) * amp * 32767), true);
  return b;
}

// ── behaviours ──────────────────────────────────────────────────────────────

/** Stream a sine as s16le chunks every chunkMs (split at odd byte offsets to exercise the carry). */
export const tone = ({ freq = 440, rate = 16000, amp = 0.5, chunkMs = 20, delayMs = 10, oddSplit = true } = {}) => (child) => {
  let i = 0;
  const per = Math.round((rate * chunkMs) / 1000);
  const tick = () => {
    const bytes = sineBytes(per, { freq, rate, amp, start: i });
    i += per;
    if (oddSplit) { child.write(bytes.subarray(0, 3)); child.write(bytes.subarray(3)); } else child.write(bytes);
    child.after(chunkMs, tick);
  };
  child.after(delayMs, tick);
};
/** Stream digital silence. */
export const silence = (o = {}) => tone({ ...o, amp: 0 });
/** Never write anything, never exit (until killed). ignore: signals it shrugs off (e.g. ['SIGTERM']). */
export const hang = ({ ignore = [] } = {}) => (child) => { for (const s of ignore) child.ignore.add(s); };
/** Write stderr and exit after `ms`. */
export const exitWith = (code = 1, stderr = '', ms = 5) => (child) => child.after(ms, () => { if (stderr) child.err(`${stderr}\n`); child.exit(code); });
/** Stream for `ms`, then go quiet without exiting (a stalled capture). */
export const stallAfter = (ms = 200, o = {}) => (child) => {
  tone(o)(child);
  child.after(ms, () => { for (const h of child.timers) child.sys.clearTimer(h); child.timers.clear(); });
};
/** Emit text lines on stdout at given times: [[ms, 'line'], …] (for `pactl subscribe`). */
export const lines = (script = []) => (child) => { for (const [ms, text] of script) child.after(ms, () => child.write(new TextEncoder().encode(`${text}\n`))); };

/**
 * A fake system for detect/source tests.
 * opts: { platform, env, bins: string[] | { name: path }, run: { 'cmd args…': { code, stdout, stderr, hangMs } } | fn,
 *         behave: { cmd: behaviour } | fn(cmd, args) → behaviour, clock (manualClock), kind = 'fake' }
 * sys.spawned → every FakeChild created (assert on argv / env / kill signals).
 */
export function fakeSystem(opts = {}) {
  const clock = opts.clock;
  const bins = Array.isArray(opts.bins) ? Object.fromEntries(opts.bins.map((b) => [b, `/usr/bin/${b}`])) : opts.bins || {};
  const sys = {
    kind: opts.kind || 'fake',
    platform: opts.platform || 'linux',
    env: opts.env || { PATH: '/usr/bin' },
    spawned: [],
    runs: [],
    which: (cmd) => bins[cmd] || null,
    now: clock ? clock.now : () => Date.now(),
    setTimer: clock ? clock.setTimer : (fn, ms) => { const h = setTimeout(fn, ms); h.unref?.(); return h; },
    clearTimer: clock ? clock.clearTimer : (h) => clearTimeout(h),
    exists: () => false,
    spawn(cmd, args = [], o = {}) {
      const name = String(cmd).split(/[\\/]/).pop();
      if (!bins[name] && !Object.values(bins).includes(cmd) && !(opts.spawnAny)) throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' });
      const child = new FakeChild({ cmd, args, env: o.env, sys });
      sys.spawned.push(child);
      const b = typeof opts.behave === 'function' ? opts.behave(name, args) : opts.behave?.[name];
      (b || tone())(child);
      return child;
    },
    async run(cmd, args = [], o = {}) {
      const key = [String(cmd).split(/[\\/]/).pop(), ...args].join(' ');
      sys.runs.push(key);
      const r = typeof opts.run === 'function' ? opts.run(key) : opts.run?.[key];
      if (!r) return { code: null, signal: null, stdout: '', stderr: '', timedOut: false, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) };
      if (r.hangMs) {
        // a probe that hangs longer than its timeout: resolve as timed out at the timeout (like runWith)
        const ms = o.timeoutMs ?? 2000;
        if (r.hangMs > ms) { await new Promise((res) => { const h = setTimeout(res, ms); h.unref?.(); }); return { code: null, signal: 'SIGKILL', stdout: '', stderr: '', timedOut: true, error: null }; }
        await new Promise((res) => { const h = setTimeout(res, r.hangMs); h.unref?.(); });
      }
      return { code: r.code ?? 0, signal: null, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: false, error: null };
    },
  };
  return sys;
}
