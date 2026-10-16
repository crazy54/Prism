// AudioSource — one uniform live-audio source for every runtime (plugin, hidraw apps,
// tools). It picks the best capture backend for the platform, keeps it running, and
// always has data: when nothing live works it serves the deterministic synthetic groove.
//
//   const audio = createAudioSource({ input: 'monitor' });   // backend 'auto'
//   await audio.start();                // resolves within `deadlineMs`, live or simulated — never hangs
//   audio.snapshot() → { audio: { level, levels, rate, peak, rms }, spectrum: { bands, peaks, centers } }  (null when stopped;
//                      cached per hop; data() is an alias) — plus running / mode / rate / status() for the apps hub
//                      (src/apps/sources/README.md "Capture interface" #1)
//   audio.info()  → { state, backend, kind, sampleRate, latencyMs, command, monitor, device, bridge, … }
//   const off = audio.on('state' | 'data' | 'pcm' | 'log', fn)
//   const release = audio.retain(); … release();   // ref-counted: starts on first retain, stops `idleMs` after the last release
//   await audio.stop();                 // kills children (TERM, then KILL), closes the bridge; bounded by killTimeoutMs
//
// States: idle → starting → live | standby (bridge waiting for its page; simulated data meanwhile)
//         | simulated (synthetic fallback; re-detects every `retryMs`) | unavailable (fallback: false) → stopped.
// Privacy: levels and bands only, in memory. The optional 'pcm' event (opts.pcm) hands raw
// frames to in-process listeners and keeps nothing; no backend ever writes a file.
//
// opts: { backend: 'auto' | id | id[], input: 'monitor' | 'mic', device, rate = 16000,
//         bridge: 'auto' | true | false | { port, token }, fallback = true, retryMs = 30000,
//         analyzer: { historySeconds, historyRate, bands, minHz, maxHz, … }, seed (synthetic), pcm = false,
//         startTimeoutMs (per backend; default from the plan), stallMs = 4000, killTimeoutMs = 1500,
//         deadlineMs = 8000, idleMs = 5000, follow = true (restart on default-device change),
//         system (sys | Promise<sys>, see system.js), onLog }

import { Analyzer } from './analyzer.js';
import { createSynth } from './synthetic.js';
import { createPcmDecoder } from './pcm.js';
import { detectBackends } from './detect.js';
import { BACKENDS, commandLine } from './backends.js';
import { defaultSystem } from './system.js';
import { createBridgeServer } from './bridge.js';

const BACKOFF = [250, 500, 1000, 2000, 4000];
const ANALYZER_KEYS = ['historySeconds', 'historyRate', 'bands', 'minHz', 'maxHz', 'fftSize', 'floorDb', 'bandFloorDb', 'tiltDb', 'levelsScale', 'agc'];
const RUNNING = new Set(['starting', 'live', 'standby', 'simulated']);
const DEC = new TextDecoder();
const text = (d) => (typeof d === 'string' ? d : DEC.decode(d));
const SYNTH_RATE = 16000;

export class AudioSource {
  constructor(opts = {}) {
    this.opts = { backend: 'auto', input: 'monitor', rate: 16000, bridge: 'auto', fallback: true, retryMs: 30000, stallMs: 4000, killTimeoutMs: 1500, deadlineMs: 8000, idleMs: 5000, seed: 7, pcm: false, follow: true, ...opts };
    // analyzer options may come top-level too (the apps hub passes { historySeconds, historyRate, bands, seed })
    const top = Object.fromEntries(ANALYZER_KEYS.filter((k) => opts[k] !== undefined).map((k) => [k, opts[k]]));
    this.analyzer = new Analyzer({ sampleRate: this.opts.rate, ...top, ...(this.opts.analyzer || {}) });
    this.id = 'audio';
    this.provides = ['audio', 'spectrum'];
    this.state = 'idle';
    this.listeners = new Map();
    this.refs = 0;
    this.active = null;          // the running capture { c, plan, child, … }
    this.candidates = [];
    this.lastError = null;
    this.restarts = 0;
    this.timers = new Set();
    this.bridge = null;
    this.synth = null;
    this.watcher = null;
    this.since = 0;
  }

  // ── events ────────────────────────────────────────────────────────────────
  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.listeners.get(name)?.delete(fn);
  }
  emit(name, ...a) { for (const fn of this.listeners.get(name) || []) { try { fn(...a); } catch { /* a listener's problem */ } } }
  log(msg) { this.opts.onLog?.(msg); this.emit('log', msg); }

  // ── timers (all tracked, all cleared on stop) ─────────────────────────────
  later(fn, ms) {
    const h = this.sys.setTimer(() => { this.timers.delete(h); fn(); }, ms);
    this.timers.add(h);
    return h;
  }
  cancel(h) { if (h != null && this.timers.delete(h)) this.sys.clearTimer(h); }
  every(fn, ms) {
    const box = { h: null };
    const tick = () => { box.h = this.later(tick, ms); fn(); };
    box.h = this.later(tick, ms);
    return { stop: () => this.cancel(box.h) };
  }

  // ── public API ──────────────────────────────────────────────────────────────
  /** Start (idempotent). Resolves with info() once live, standby or simulated — bounded by deadlineMs. */
  start() {
    if (this.startPromise && this.state !== 'stopped' && this.state !== 'idle') return this.startPromise;
    this.stopped = false;
    this.setState('starting');
    this.startPromise = (async () => {
      try {
        this.sys = await (this.opts.system || defaultSystem());
        if (this.stopped) return this.info();
        await this.connectBest();
      } catch (e) {                                  // start() never rejects: report and fall back
        this.lastError = `start failed: ${e?.message || e}`;
        this.log(`audio: ${this.lastError}`);
        if (this.sys && !this.stopped && !['live', 'standby', 'simulated'].includes(this.state)) this.goSimulated();
      }
      return this.info();
    })();
    return this.startPromise;
  }

  /**
   * Snapshot in the ctx.data shapes, or null while idle / stopped / unavailable (facets then simulate on
   * their own). Cached per analysis hop: cheap to call every frame; treat the arrays as read-only.
   */
  snapshot() {
    if (!RUNNING.has(this.state)) return null;
    if (this.snap && this.snapHops === this.analyzer.hops && this.snapRate === this.analyzer.sampleRate) return this.snap;
    this.snapHops = this.analyzer.hops; this.snapRate = this.analyzer.sampleRate;
    this.snap = this.analyzer.snapshot();
    return this.snap;
  }
  data() { return this.snapshot(); }

  /** Source-interface fields (src/apps/sources/README.md): running, mode, rate, status(). */
  get running() { return RUNNING.has(this.state); }
  get mode() { return this.state === 'live' ? 'live' : 'simulated'; }
  get rate() { return this.analyzer.o.historyRate; }
  status() { return this.info(); }

  /** Ref-counted start/stop for runtimes: start on the first retain, stop idleMs after the last release. */
  retain() {
    this.refs++;
    if (this.idleTimer != null) { this.cancel(this.idleTimer); this.idleTimer = null; }
    if (this.state === 'idle' || this.state === 'stopped') this.start();
    let done = false;
    return () => {
      if (done) return; done = true;
      this.refs = Math.max(0, this.refs - 1);
      if (this.refs) return;
      Promise.resolve(this.startPromise).then(() => {
        if (this.refs || !this.sys || this.idleTimer != null || this.state === 'stopped') return;
        this.idleTimer = this.later(() => { this.idleTimer = null; if (!this.refs) this.stop(); }, this.opts.idleMs);
      });
    };
  }

  info() {
    const a = this.active, p = a?.plan || this.simPlan || {};
    const b = BACKENDS[this.backendId] || {};
    return {
      state: this.state,
      backend: this.backendId || null,
      title: b.title || null,
      kind: this.state === 'live' ? 'live' : this.state === 'simulated' || this.state === 'standby' ? 'simulated' : null,
      input: this.opts.input,
      monitor: p.monitor || null,
      device: p.device || null,
      command: a ? commandLine(a.plan) : null,
      sampleRate: this.analyzer.sampleRate,
      latencyMs: p.latencyMs ?? null,
      chunkMs: a && a.chunks ? Math.round((a.samples / a.chunks / Math.max(1, a.plan.sampleRate)) * 1000) : null,
      restarts: this.restarts,
      since: this.since,
      lastError: this.lastError,
      candidates: this.candidates.map((c) => ({ id: c.id, ok: c.ok, reason: c.reason || c.failed || null })),
      bridge: this.bridge ? { url: this.bridge.url, port: this.bridge.port, connected: this.bridge.connected, client: this.bridge.client } : null,
      analyzer: this.analyzer.info,
    };
  }

  /** Stop everything. Resolves when children have exited — or after killTimeoutMs + 500 ms regardless. */
  async stop() {
    if (this.state === 'stopped' || this.state === 'idle') { this.state = 'stopped'; return; }
    this.stopped = true;
    this.setState('stopping');
    for (const h of this.timers) this.sys?.clearTimer(h);
    this.timers.clear();
    this.idleTimer = null; this.retryTimer = null; this.watchdog = null;
    this.synth = null; this.simPlan = null;
    this.bridgeLive = false; this.quick = 0;
    const waits = [];
    if (this.active) { waits.push(this.kill(this.active)); this.active = null; }
    if (this.watcher) { waits.push(this.kill(this.watcher)); this.watcher = null; }
    if (this.bridge) { waits.push(this.bridge.close()); this.bridge = null; }
    let guard;
    await Promise.race([Promise.all(waits), new Promise((r) => { guard = setTimeout(r, this.opts.killTimeoutMs + 500); guard.unref?.(); })]);
    clearTimeout(guard);
    this.startPromise = null;
    this.setState('stopped');
  }

  /** Step the synthetic source by `ms` of audio right now (deterministic headless renders / tests). */
  advance(ms) {
    if (!this.synth) return this;
    const n = Math.round((ms / 1000) * this.synth.syn.sampleRate);
    this.feedSynth(n);
    return this;
  }

  // ── internals ───────────────────────────────────────────────────────────────
  setState(s) { if (this.state === s) return; this.state = s; this.since = this.sys ? this.sys.now() : 0; this.emit('state', this.info()); }

  async connectBest(fromIndex = 0) {
    const o = this.opts, sys = this.sys;
    const deadlineAt = sys.now() + o.deadlineMs;
    if (!this.candidates.length || fromIndex === 0) {
      const det = await detectBackends(sys, { ...o, deadlineMs: Math.min(5000, o.deadlineMs) });
      if (this.stopped) return;
      this.candidates = det.candidates;
      this.log(`audio: candidates ${det.candidates.map((c) => `${c.id}${c.ok ? '' : `✗(${c.reason})`}`).join(', ') || 'none'}`);
    }
    for (let i = fromIndex; i < this.candidates.length; i++) {
      const c = this.candidates[i];
      if (this.stopped) return;
      if (!c.ok || c.failed) continue;
      if (sys.now() > deadlineAt) { this.log('audio: start deadline passed'); break; }
      if (c.kind === 'bridge') { if (await this.startBridge(c)) return; continue; }
      if (await this.trySpawn(c, i, deadlineAt)) return;
    }
    if (!this.stopped) this.goSimulated();
  }

  spawnRun(c) {
    const plan = c.plan, sys = this.sys;
    const run = { c, plan, child: null, startedAt: sys.now(), lastDataAt: 0, samples: 0, chunks: 0, stderr: '', exited: false, gotData: false, onFirst: null, onEnd: null };
    run.decoder = createPcmDecoder({ format: plan.format, channels: plan.channels, sniff: plan.sniff, onHeader: (h) => { if (h.sampleRate) run.headerRate = h.sampleRate; } });
    const end = (why) => { if (run.exited) return; run.exited = true; run.exit = why; run.onEnd?.(why); };
    try {
      run.child = sys.spawn(plan.cmd, plan.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...sys.env, ...(plan.env || {}) } });
    } catch (error) { run.exited = true; run.exit = { error }; return run; }
    run.child.stdout?.on('data', (chunk) => {
      const f = run.decoder.push(chunk);
      if (!f.length) return;
      run.lastDataAt = sys.now(); run.samples += f.length; run.chunks++;
      if (!run.gotData) { run.gotData = true; run.onFirst?.(); }
      if (run.live && this.active === run && !this.stopped) this.feed(f);
    });
    run.child.stderr?.on('data', (d) => { run.stderr = (run.stderr + text(d)).slice(-2000); });
    run.child.on?.('error', (error) => end({ error }));
    run.child.on?.('exit', (code, signal) => end({ code, signal }));
    return run;
  }

  /** Kill a run: SIGTERM, then SIGKILL after killTimeoutMs. Resolves on exit (or after the KILL). */
  kill(run) {
    return new Promise((resolve) => {
      if (!run?.child || run.exited) return resolve();
      const prev = run.onEnd;
      let t = null;
      run.onEnd = (why) => { if (t) clearTimeout(t); prev?.(why); resolve(); };
      try { run.child.kill('SIGTERM'); } catch { /* gone */ }
      t = setTimeout(() => { try { run.child.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, this.opts.killTimeoutMs);
      t.unref?.();
    });
  }

  describeExit(run, why) {
    if (why?.error) return why.error.code === 'ENOENT' ? `${run.plan.cmd} not found` : `${run.plan.cmd}: ${why.error.message}`;
    const tail = run.stderr.trim().split(/\r?\n/).pop() || '';
    return `${run.plan.cmd} exited (${why?.signal || `code ${why?.code}`})${tail ? `: ${tail.slice(0, 200)}` : ''}`;
  }

  /** Spawn a candidate; true once its first audio arrives, false on exit / error / timeout. */
  trySpawn(c, index, deadlineAt) {
    const sys = this.sys;
    return new Promise((resolve) => {
      const run = this.spawnRun(c);
      if (run.exited) { c.failed = this.lastError = this.describeExit(run, run.exit); this.log(`audio: ${c.id}: ${c.failed}`); return resolve(false); }
      this.active = run;
      const wait = Math.max(50, Math.min(this.opts.startTimeoutMs ?? c.plan.startTimeoutMs ?? 2500, deadlineAt - sys.now()));
      let settled = false;
      const fail = (reason) => {
        if (settled) return; settled = true;
        this.cancel(timer);
        c.failed = this.lastError = reason;
        this.log(`audio: ${c.id}: ${reason}`);
        if (this.active === run) this.active = null;
        this.kill(run).then(() => resolve(false));
      };
      const timer = this.later(() => fail(`no audio within ${wait} ms`), wait);
      run.onFirst = () => {
        if (settled) return; settled = true;
        this.cancel(timer);
        if (this.stopped) { this.kill(run); return resolve(false); }
        run.onEnd = (why) => this.onLiveEnd(run, why, index);
        this.goLive(run, index);
        resolve(true);
      };
      run.onEnd = (why) => fail(this.describeExit(run, why));
      if (run.exited) fail(this.describeExit(run, run.exit));
    });
  }

  goLive(run, index) {
    this.stopSynth();
    run.live = true;
    this.analyzer.setSampleRate(run.headerRate || run.plan.sampleRate);
    this.backendId = run.c.id;
    this.liveIndex = index;
    this.lastError = null;
    this.silenceFrom = null;
    this.setState('live');
    this.log(`audio: live via ${run.c.id}: ${commandLine(run.plan)}`);
    this.startWatchdog();
    if (run.plan.watch && !this.watcher) this.startWatcher(run.plan.watch);
  }

  /** The live child ended (crash, stall, device change). Restart with backoff; fail over after repeated quick failures. */
  onLiveEnd(run, why, index) {
    if (this.stopped || this.active !== run) return;
    this.active = null;
    const lived = this.sys.now() - run.startedAt;
    const reason = why?.reason || this.describeExit(run, why);
    this.log(`audio: ${run.c.id} ended after ${Math.round(lived)} ms: ${reason}`);
    if (lived > 10000 || why?.reason === 'device changed') this.quick = 0; else this.quick = (this.quick || 0) + 1;
    this.restarts++;
    this.lastError = reason;
    if (this.quick > 3) {
      run.c.failed = `failed ${this.quick} times in a row: ${reason}`;
      this.setState('starting');
      this.connectBest(index + 1);
      return;
    }
    const delay = why?.reason === 'device changed' ? 100 : BACKOFF[Math.min(BACKOFF.length - 1, this.quick)];
    this.later(async () => {
      if (this.stopped) return;
      const ok = await this.trySpawn(run.c, index, this.sys.now() + this.opts.deadlineMs);
      if (!ok && !this.stopped) { this.setState('starting'); this.connectBest(index + 1); }
    }, delay);
  }

  /** While live: keep the history scrolling through gaps (silence), and treat a long stall as an exit. */
  startWatchdog() {
    if (this.watchdog) return;
    const hopMs = 1000 / this.analyzer.o.historyRate;
    this.watchdog = this.every(() => {
      const now = this.sys.now();
      if (this.state !== 'live' && this.state !== 'starting') { this.watchdog.stop(); this.watchdog = null; return; }
      const last = this.bridgeLive ? this.lastMeterAt : this.active?.lastDataAt;
      if (!last) return;
      if (now - last > hopMs * 3) {
        this.silenceFrom ??= last;
        const due = Math.floor((now - this.silenceFrom) / hopMs) - (this.silenceHops || 0);
        if (due > 0) { this.analyzer.silence(Math.min(due, 60)); this.silenceHops = (this.silenceHops || 0) + due; this.emit('data'); }
      } else { this.silenceFrom = null; this.silenceHops = 0; }
      if (now - last > this.opts.stallMs) {
        if (this.bridgeLive) { this.bridgeStandby('no levels from the page'); return; }
        if (this.active && this.state === 'live') {
          const run = this.active;
          this.kill(run);
          run.onEnd?.({ reason: `stalled: no audio for ${this.opts.stallMs} ms` });
        }
      }
    }, 250);
  }

  /** `pactl subscribe`: restart capture when the default device changes (so @DEFAULT_MONITOR@ follows it). */
  startWatcher(w) {
    const sys = this.sys;
    let child;
    try { child = sys.spawn(w.cmd, w.args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env: { ...sys.env, ...(w.env || {}) } }); } catch { return; }
    const run = { child, exited: false, onEnd: null, plan: w };
    this.watcher = run;
    let buf = '', pending = null;
    child.stdout?.on('data', (d) => {
      buf = (buf + text(d)).slice(-4096);
      const lines = buf.split(/\r?\n/); buf = lines.pop();
      if (!lines.some((l) => w.match.test(l)) || pending != null) return;
      pending = this.later(() => {
        pending = null;
        const live = this.active;
        if (!live || this.stopped) return;
        this.log('audio: default device changed — restarting capture');
        this.kill(live);
        live.onEnd?.({ reason: 'device changed' });
      }, 400);
    });
    const end = () => { run.exited = true; run.onEnd?.(); if (this.watcher === run) this.watcher = null; };
    child.on?.('exit', end);
    child.on?.('error', end);
  }

  feed(samples) {
    this.analyzer.push(samples);
    if (this.opts.pcm) this.emit('pcm', samples, this.analyzer.sampleRate);
    this.emit('data');
  }

  // synthetic fallback
  startSynth() {
    if (this.synth) return;
    const syn = createSynth({ seed: this.opts.seed, sampleRate: SYNTH_RATE });
    this.analyzer.setSampleRate(SYNTH_RATE);
    this.simPlan = BACKENDS.synthetic.plan({ rate: SYNTH_RATE });
    this.synth = { syn, index: 0, t0: this.sys.now() };
    const hopMs = 1000 / this.analyzer.o.historyRate;
    const s = this.synth;
    s.timer = this.every(() => {
      if (this.synth !== s) return;
      const target = Math.floor(((this.sys.now() - s.t0) / 1000) * SYNTH_RATE);
      let n = target - s.index;
      if (n > SYNTH_RATE) { s.index = target - SYNTH_RATE; n = SYNTH_RATE; }   // fell far behind: skip, don't burst
      if (n > 0) this.feedSynth(n);
    }, hopMs);
  }
  feedSynth(n) {
    const s = this.synth;
    if (!s) return;
    const block = new Float32Array(n);
    s.syn.render(s.index, block);
    s.index += n;
    this.analyzer.push(block);
    if (this.opts.pcm) this.emit('pcm', block, SYNTH_RATE);
    this.emit('data');
  }
  stopSynth() { if (this.synth) { this.synth.timer?.stop(); this.synth = null; this.simPlan = null; } }

  goSimulated() {
    if (!this.opts.fallback) { this.backendId = null; this.setState('unavailable'); this.log('audio: no live backend and fallback disabled'); this.scheduleRetry(); return; }
    this.backendId = 'synthetic';
    this.startSynth();
    this.setState('simulated');
    this.log(`audio: simulated (${this.lastError || 'no live backend'})`);
    this.scheduleRetry();
  }

  scheduleRetry() {
    if (!(this.opts.retryMs > 0) || this.sys.kind === 'bare' || this.retryTimer != null) return;
    this.retryTimer = this.later(async () => {
      this.retryTimer = null;
      if (this.stopped || (this.state !== 'simulated' && this.state !== 'unavailable')) return;
      for (const c of this.candidates) delete c.failed;
      const det = await detectBackends(this.sys, { ...this.opts, deadlineMs: Math.min(5000, this.opts.deadlineMs) });
      if (this.stopped || (this.state !== 'simulated' && this.state !== 'unavailable')) return;
      this.candidates = det.candidates;
      const deadlineAt = this.sys.now() + this.opts.deadlineMs;
      for (let i = 0; i < det.candidates.length; i++) {
        const c = det.candidates[i];
        if (!c.ok || c.kind !== 'spawn') continue;
        if (await this.trySpawn(c, i, deadlineAt)) return;
        if (this.stopped) return;
      }
      this.scheduleRetry();
    }, this.opts.retryMs);
  }

  // browser bridge
  async startBridge(c) {
    const o = this.opts, a = this.analyzer.o;
    const extra = typeof o.bridge === 'object' && o.bridge ? o.bridge : {};
    try {
      this.bridge = await createBridgeServer({
        ...extra,
        config: { hopHz: a.historyRate, bands: a.bands, minHz: a.minHz, maxHz: a.maxHz },
        onMeter: (m) => {
          if (this.stopped) return;
          this.lastMeterAt = this.sys.now();
          if (!this.bridgeLive) {
            this.bridgeLive = true;
            this.stopSynth();
            this.backendId = 'bridge';
            this.silenceFrom = null;
            this.setState('live');
            this.startWatchdog();
            this.log('audio: live via the browser bridge');
          }
          this.analyzer.pushMeter(m);
          this.emit('data');
        },
        onHello: (h) => this.log(`audio: bridge page capturing ${h.source} at ${h.sampleRate} Hz`),
        onDisconnect: (why) => this.bridgeStandby(why),
        onLog: (m) => this.log(m),
      });
    } catch (e) {
      c.failed = this.lastError = `bridge: ${e.message}`;
      this.log(`audio: ${c.failed}`);
      return false;
    }
    if (this.stopped) { await this.bridge.close(); this.bridge = null; return true; }
    this.backendId = 'bridge';
    this.bridgeStandby('waiting for the page');
    return true;
  }

  bridgeStandby(why) {
    if (this.stopped || !this.bridge) return;
    this.bridgeLive = false;
    this.startSynth();
    this.backendId = 'bridge';
    this.setState('standby');
    this.log(`audio: bridge standby (${why}) — open ${this.bridge.url.replace(/#.*/, '#…')}`);
  }
}

export const createAudioSource = (opts) => new AudioSource(opts);
