// Capture backends — how each system tool is probed and what exact command line it
// runs. Every live backend writes raw PCM to stdout (mono, s16le) at `rate`; nothing is
// written to disk. Command lines follow the team research (research/linux.md §4), where
// the parec line was verified live; the rest are source-read (see docs/linux.md).
//
//   backend = { id, title, platforms, kind: 'spawn' | 'bridge' | 'synthetic',
//               probe(sys, opts) → Promise<{ ok, reason?, version?, device?, host?, notes? }>,
//               plan(opts, probe, sys) → { cmd, args, env, format, channels, sampleRate, latencyMs,
//                                          startTimeoutMs, sniff, monitor, watch?, display } }
//
// opts (shared): { input: 'monitor' (what you hear, default) | 'mic', device?, rate = 16000, follow = true }

export const DEFAULT_RATE = 16000;
const S = (x) => String(x);

// ── parsers (pure; unit-tested) ────────────────────────────────────────────

/** "pw-record --version" → [major, minor, micro] (the libpipewire it was compiled with), or null. */
export function parsePipewireVersion(text = '') {
  const m = /Compiled with libpipewire (\d+)\.(\d+)\.(\d+)/.exec(text) || /libpipewire (\d+)\.(\d+)\.(\d+)/.exec(text) || /version "?(\d+)\.(\d+)\.(\d+)/i.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a ≥ b for [major, minor, micro] versions. */
export function versionGte(a, b) {
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}

/**
 * ffmpeg -list_devices true -f dshow -i dummy (stderr) → [{ name, alt? }] audio devices.
 * Handles both the old sectioned format ("DirectShow audio devices" … "name") and the
 * newer per-line format ('"name" (audio)').
 */
export function parseDshowDevices(text = '') {
  const out = [];
  let section = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/^\[[^\]]*\]\s*/, '');
    if (/DirectShow video devices/i.test(line)) { section = 'video'; continue; }
    if (/DirectShow audio devices/i.test(line)) { section = 'audio'; continue; }
    const alt = /Alternative name\s+"([^"]+)"/i.exec(line);
    if (alt) { if (out.length && !out[out.length - 1].alt) out[out.length - 1].alt = alt[1]; continue; }
    const m = /^"([^"]+)"\s*(?:\((audio|video|none|audio, video|video, audio)\))?\s*$/.exec(line.trim());
    if (!m) continue;
    const kind = m[2] || section;
    if (kind && /audio/.test(kind)) out.push({ name: m[1] });
  }
  return out;
}

/** ffmpeg -f avfoundation -list_devices true -i "" (stderr) → [{ index, name }] audio devices. */
export function parseAvfoundationDevices(text = '') {
  const out = [];
  let audio = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/^\[[^\]]*\]\s*/, '');
    if (/AVFoundation video devices/i.test(line)) { audio = false; continue; }
    if (/AVFoundation audio devices/i.test(line)) { audio = true; continue; }
    const m = /^\[(\d+)\]\s+(.+?)\s*$/.exec(line);
    if (audio && m) out.push({ index: Number(m[1]), name: m[2] });
  }
  return out;
}

/** Names that are (almost always) loopback / "what you hear" capture devices. */
export const LOOPBACK_HINTS = {
  win32: /stereo mix|what u hear|wave out|loopback|virtual-audio-capturer|cable output|voicemeeter out|monitor of/i,
  darwin: /blackhole|loopback audio|soundflower|background music|ishowu/i,
};

/**
 * Choose a capture device from a list. input 'monitor' → a loopback device or null
 * (never silently a microphone); 'mic' → the first non-loopback device (else the first).
 */
export function pickDevice(devices, { input = 'monitor', platform = 'win32' } = {}) {
  const hint = LOOPBACK_HINTS[platform] || LOOPBACK_HINTS.win32;
  if (input === 'monitor') return devices.find((d) => hint.test(d.name)) || null;
  return devices.find((d) => !hint.test(d.name)) || devices[0] || null;
}

// ── shared bits ─────────────────────────────────────────────────────────────

const commonFfmpegOut = (rate) => ['-vn', '-ac', '1', '-ar', S(rate), '-f', 's16le', '-flush_packets', '1', 'pipe:1'];
const isMonitor = (opts) => (opts.input || 'monitor') === 'monitor';

/** Inside a Flatpak, a host binary runs through `flatpak-spawn --host` (env passed explicitly). */
export function hostWrap(plan, probe) {
  if (!probe?.host) return plan;
  const envArgs = Object.entries(plan.env || {}).map(([k, v]) => `--env=${k}=${v}`);
  return { ...plan, cmd: 'flatpak-spawn', args: ['--host', ...envArgs, plan.cmd, ...plan.args], env: {} };
}

/** Look up a binary locally, or on the host when running inside a Flatpak sandbox. */
export async function findBinary(sys, name) {
  const local = sys.which(name);
  if (local) return { path: local, host: false };
  if (sys.env?.FLATPAK_ID && sys.which('flatpak-spawn')) {
    sys._hostBins ??= sys.run('flatpak-spawn', ['--host', 'sh', '-c', 'for b in parec pactl pw-record arecord ffmpeg stdbuf; do command -v "$b"; done'], { timeoutMs: 2000 })
      .then((r) => new Set(String(r.stdout || '').split(/\r?\n/).map((l) => l.trim().split('/').pop()).filter(Boolean)));
    const bins = await sys._hostBins;
    if (bins.has(name)) return { path: name, host: true };
  }
  return null;
}

// ── backends ───────────────────────────────────────────────────────────────

/** PulseAudio or PipeWire's pulse server: `parec` (verified live; unbuffered; @DEFAULT_MONITOR@ works on both). */
export const pulse = {
  id: 'pulse',
  title: 'PulseAudio / pipewire-pulse (parec)',
  platforms: ['linux', 'freebsd', 'openbsd'],
  kind: 'spawn',
  async probe(sys) {
    const bin = await findBinary(sys, 'parec');
    if (!bin) return { ok: false, reason: 'parec not found (install pulseaudio-utils / libpulse)' };
    const pactl = await findBinary(sys, 'pactl');
    return { ok: true, host: bin.host, pactl: !!pactl };
  },
  plan(opts = {}, probe = {}) {
    const rate = opts.rate || DEFAULT_RATE, mon = isMonitor(opts);
    const device = opts.device || (mon ? '@DEFAULT_MONITOR@' : '@DEFAULT_SOURCE@');
    const plan = {
      cmd: 'parec',
      args: ['-d', device, '--raw', '--format=s16le', `--rate=${rate}`, '--channels=1', '--latency-msec=10', '--client-name=Prism Deck', '--stream-name=Levels'],
      env: { LC_ALL: 'C' },
      format: 's16le', channels: 1, sampleRate: rate, latencyMs: 20, startTimeoutMs: 2500, sniff: false,
      monitor: mon ? 'yes' : 'no', device,
      // the default sink can change; @DEFAULT_MONITOR@ resolves at stream creation → restart on change
      watch: mon && !opts.device && opts.follow !== false && probe.pactl ? { cmd: 'pactl', args: ['subscribe'], env: { LC_ALL: 'C' }, match: /Event 'change' on server/ } : null,
    };
    if (plan.watch && probe.host) plan.watch = hostWrap(plan.watch, probe);
    return hostWrap(plan, probe);
  },
};

/** Native PipeWire: `pw-record` (--raw only on ≥ 1.3.81; stdout needs ≥ 0.3.52; stdio-buffered → stdbuf -o0). */
export const pipewire = {
  id: 'pipewire',
  title: 'PipeWire (pw-record)',
  platforms: ['linux'],
  kind: 'spawn',
  async probe(sys) {
    const bin = await findBinary(sys, 'pw-record');
    if (!bin) return { ok: false, reason: 'pw-record not found (install pipewire / pipewire-bin)' };
    const r = await sys.run(bin.host ? 'flatpak-spawn' : 'pw-record', bin.host ? ['--host', 'pw-record', '--version'] : ['--version'], { timeoutMs: 1500 });
    const version = parsePipewireVersion(`${r.stdout}\n${r.stderr}`);
    if (version && !versionGte(version, [0, 3, 52])) return { ok: false, version, reason: `pw-record ${version.join('.')} cannot write to stdout (needs ≥ 0.3.52) — use parec` };
    const stdbuf = await findBinary(sys, 'stdbuf');
    return { ok: true, version, host: bin.host, stdbuf: !!stdbuf, timedOut: r.timedOut };
  },
  plan(opts = {}, probe = {}) {
    const mon = isMonitor(opts);
    // without stdbuf, stdout arrives in 4 KiB blocks: 128 ms at 16 kHz, 43 ms at 48 kHz → capture at 48 kHz
    const rate = probe.stdbuf ? opts.rate || DEFAULT_RATE : 48000;
    const raw = probe.version ? versionGte(probe.version, [1, 3, 81]) : false;   // unknown → omit and sniff a header
    const a = [...(raw ? ['--raw'] : []), '--format', 's16', '--rate', S(rate), '--channels', '1', '--latency', '20ms',
      ...(opts.device ? ['--target', opts.device] : []),
      ...(mon ? ['-P', '{ stream.capture.sink = true }'] : []), '-'];
    const plan = probe.stdbuf ? { cmd: 'stdbuf', args: ['-o0', 'pw-record', ...a] } : { cmd: 'pw-record', args: a };
    return hostWrap({ ...plan, env: { LC_ALL: 'C' }, format: 's16le', channels: 1, sampleRate: rate, latencyMs: probe.stdbuf ? 20 : 45,
      startTimeoutMs: 2500, sniff: true, monitor: mon ? 'yes' : 'no', device: opts.device || (mon ? 'default sink monitor' : 'default source') }, probe);
  },
};

/** ALSA: `arecord -t raw` (no monitor on pure ALSA — the sound-server plugins get hints via env). */
export const alsa = {
  id: 'alsa',
  title: 'ALSA (arecord)',
  platforms: ['linux'],
  kind: 'spawn',
  async probe(sys) {
    const bin = await findBinary(sys, 'arecord');
    if (!bin) return { ok: false, reason: 'arecord not found (install alsa-utils)' };
    return { ok: true, host: bin.host };
  },
  plan(opts = {}, probe = {}) {
    const rate = opts.rate || DEFAULT_RATE, mon = isMonitor(opts);
    const device = opts.device || 'default';
    return hostWrap({
      cmd: 'arecord',
      args: ['-q', '-t', 'raw', '-f', 'S16_LE', '-r', S(rate), '-c', '1', '-D', device, '--buffer-time=100000', '--period-time=20000', '-'],
      env: { LC_ALL: 'C', ...(mon ? { PULSE_SOURCE: '@DEFAULT_MONITOR@', PIPEWIRE_ALSA: '{ stream.capture.sink = true }' } : {}) },
      format: 's16le', channels: 1, sampleRate: rate, latencyMs: 20, startTimeoutMs: 2500, sniff: true,
      monitor: mon ? 'best-effort' : 'no', device,
    }, probe);
  },
};

/** ffmpeg (only if the user installed it): dshow on Windows, avfoundation on macOS, pulse on Linux. */
export const ffmpeg = {
  id: 'ffmpeg',
  title: 'ffmpeg',
  platforms: ['win32', 'darwin', 'linux', 'freebsd'],
  kind: 'spawn',
  async probe(sys, opts = {}) {
    const bin = await findBinary(sys, 'ffmpeg');
    if (!bin) return { ok: false, reason: 'ffmpeg not found on PATH' };
    const p = sys.platform;
    if (opts.device || p === 'linux' || p === 'freebsd') return { ok: true, host: bin.host, path: bin.path, device: opts.device ? { name: opts.device } : null };
    const exe = bin.path;
    if (p === 'win32') {
      const r = await sys.run(exe, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { timeoutMs: 4000 });
      const devices = parseDshowDevices(`${r.stderr}\n${r.stdout}`);
      const device = pickDevice(devices, { input: opts.input || 'monitor', platform: p });
      if (!device) return { ok: false, path: exe, devices, timedOut: r.timedOut, reason: devices.length ? 'no loopback capture device (enable "Stereo Mix" or install a virtual cable), or choose input "mic"' : 'ffmpeg listed no DirectShow audio devices' };
      return { ok: true, path: exe, device, devices };
    }
    if (p === 'darwin') {
      const r = await sys.run(exe, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { timeoutMs: 4000 });
      const devices = parseAvfoundationDevices(`${r.stderr}\n${r.stdout}`);
      const device = (opts.input || 'monitor') === 'mic' ? { name: 'default', index: 'default' } : pickDevice(devices, { input: 'monitor', platform: p });
      if (!device) return { ok: false, path: exe, devices, timedOut: r.timedOut, reason: 'no loopback device (install BlackHole and route output through it), or choose input "mic"' };
      return { ok: true, path: exe, device, devices };
    }
    return { ok: false, reason: `ffmpeg capture is not wired for ${p}` };
  },
  plan(opts = {}, probe = {}, sys = {}) {
    const rate = opts.rate || DEFAULT_RATE, mon = isMonitor(opts), p = sys.platform;
    const head = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    const cmd = probe.path || 'ffmpeg';
    let input, env = {}, device;
    if (p === 'win32') {
      device = probe.device?.name || opts.device;
      input = ['-f', 'dshow', '-audio_buffer_size', '20', '-i', `audio=${device}`];   // ONE argv element, no quotes
    } else if (p === 'darwin') {
      const d = probe.device || { index: opts.device };
      device = d.name || S(d.index);
      input = ['-f', 'avfoundation', '-i', `:${d.index ?? d.name}`];
    } else {
      device = opts.device || (mon ? '@DEFAULT_MONITOR@' : 'default');
      input = ['-f', 'pulse', '-fragment_size', '1280', '-i', opts.device || 'default'];
      if (mon && !opts.device) env = { PULSE_SOURCE: '@DEFAULT_MONITOR@' };
    }
    return hostWrap({ cmd, args: [...head, ...input, ...commonFfmpegOut(rate)], env, format: 's16le', channels: 1, sampleRate: rate,
      latencyMs: p === 'win32' ? 20 : 40, startTimeoutMs: 5000, sniff: false, monitor: mon ? (p === 'linux' ? 'yes' : 'device') : 'no', device }, probe);
  },
};

/** Browser bridge: a localhost page captures (getUserMedia / getDisplayMedia) and streams levels. */
export const bridge = {
  id: 'bridge',
  title: 'Browser bridge (localhost page)',
  platforms: ['win32', 'darwin', 'linux', 'freebsd'],
  kind: 'bridge',
  async probe(sys) {
    return sys.kind === 'node' || sys.kind === 'fake' ? { ok: true } : { ok: false, reason: 'needs Node (a local HTTP/WebSocket server)' };
  },
  plan(opts = {}) { return { display: 'browser bridge', latencyMs: 35, monitor: (opts.input || 'monitor') === 'monitor' ? 'tab/screen share' : 'no', sampleRate: 0 }; },
};

/** The deterministic synthetic groove (always available; the simulated fallback). */
export const synthetic = {
  id: 'synthetic',
  title: 'Synthetic (simulated)',
  platforms: ['*'],
  kind: 'synthetic',
  async probe() { return { ok: true }; },
  plan(opts = {}) { return { display: 'synthetic', sampleRate: opts.rate || DEFAULT_RATE, latencyMs: 0, monitor: 'n/a' }; },
};

export const BACKENDS = { pulse, pipewire, alsa, ffmpeg, bridge, synthetic };
export const BACKEND_IDS = Object.keys(BACKENDS);

/** Live backends tried by `backend: 'auto'`, best first (synthetic is the fallback, bridge is opt-in on Linux). */
export const AUTO_ORDER = {
  linux: ['pulse', 'pipewire', 'alsa', 'ffmpeg'],
  freebsd: ['pulse', 'ffmpeg'],
  openbsd: ['pulse'],
  win32: ['ffmpeg', 'bridge'],
  darwin: ['ffmpeg', 'bridge'],
};
export const autoOrder = (platform) => AUTO_ORDER[platform] || ['ffmpeg'];

/** Human-readable command line (for logs / info), with argv elements quoted when needed. */
export const commandLine = (plan) => (plan?.cmd ? [plan.cmd, ...(plan.args || [])].map((a) => (/[\s'"{}$]/.test(a) ? JSON.stringify(a) : a)).join(' ') : '');
