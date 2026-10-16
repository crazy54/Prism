// `prism-deck hid …` — the hidraw command line (dispatched from the package cli.js).
//
//   prism-deck hid list [--json]                     supported decks on /sys/class/hidraw (+ who holds them)
//   prism-deck hid doctor                            platform, permissions, udev rule, python3, raster
//   prism-deck hid run [select] [layout] [options]   drive a deck with facets until Ctrl-C
//   prism-deck hid events [select]                   print input events as JSON lines
//   prism-deck hid bench [select] [--seconds 3]      measure write throughput (reports/s) on key 0
//   prism-deck hid udev                              print the udev rule (pipe it to /etc/udev/rules.d/60-prism-deck.rules)
//
//   select:  --path /dev/hidrawN | --serial S | --model plus     (default: the only deck present)
//   layout:  --layout file.json | --keys a,b,… --span id[@col,row,cols,rows] --strip id --dials a,b,… --screen id --widgets a,b,c,d --deck id
//   options: --theme prism --mode dark|light --brightness 0-100 --fps-cap 10 --budget <reports/s> --quality 90
//            --reduced --force (ignore the "deck app is running" heuristic) --keep (leave the last frame on exit)
//            --audio [monitor|mic] (feed ctx.data.audio / spectrum from src/audio) --seconds N
//            --dry-run (no device: --model required; renders + encodes into a memory transport and prints stats)

import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { listDecks, selectDeck } from './discover.js';
import { MODEL_BY_ID, modelForDevice } from './models.js';
import { findHolders, findDeckApps } from './claim.js';
import { memoryTransport } from './transport.js';
import { HidDeck } from './deck.js';
import { resolveLayout, defaultLayout, parseSpanArg } from './layout.js';
import { createRunner } from './runner.js';
import { udevRules, UDEV_RULES_NAME } from './udev.js';
import { HELPER_PATH } from './helper.js';
import { solid } from './pixels.js';

const HELP = `prism-deck hid — drive Stream Decks and the Corsair Galleon 100 SD directly on Linux (hidraw)

  prism-deck hid list [--json]
  prism-deck hid doctor
  prism-deck hid run [--path /dev/hidrawN | --serial S | --model id] [--layout file.json]
                     [--keys a,b,…] [--span id@col,row,cols,rows] [--strip id] [--dials a,b,…]
                     [--screen id] [--widgets a,b,c,d] [--deck id] [--theme prism] [--mode dark|light]
                     [--brightness 0-100] [--fps-cap 10] [--budget reports/s] [--quality 90]
                     [--audio monitor|mic] [--reduced] [--force] [--keep] [--seconds N] [--dry-run]
  prism-deck hid events [--path … | --serial … | --model …]
  prism-deck hid bench [--path …] [--seconds 3]
  prism-deck hid udev

Opt-in and polite: it refuses a deck that another app (OpenDeck, StreamController, Companion…) holds,
sends only documented image / LED / feature reports, and never touches firmware. See docs/linux.md.`;

export function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { opt[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2), v = argv[i + 1];
      if (v !== undefined && !v.startsWith('--')) { opt[k] = v; i++; } else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

const list = (s) => (s === undefined || s === true ? undefined : String(s).split(',').map((x) => x.trim()).map((x) => (x === '' || x === '-' ? null : x)));

/** Layout spec from --layout / flags; null when none was given. */
export function layoutFromArgs(opt, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  let spec = null;
  if (opt.layout) spec = JSON.parse(readFile(String(opt.layout)));
  const flags = {
    keys: list(opt.keys), dials: list(opt.dials), widgets: list(opt.widgets),
    spans: opt.span ? String(opt.span).split(';').map(parseSpanArg) : undefined,
    strip: typeof opt.strip === 'string' ? opt.strip : undefined,
    screen: typeof opt.screen === 'string' ? opt.screen : undefined,
    deck: typeof opt.deck === 'string' ? opt.deck : undefined,
  };
  for (const [k, v] of Object.entries(flags)) if (v !== undefined) { spec = spec || {}; spec[k] = v; }
  return spec;
}

function fakeInfo(modelId) {
  const m = modelForDevice(modelId) || MODEL_BY_ID[modelId];
  if (!m) throw Object.assign(new Error(`--dry-run needs --model <${Object.keys(MODEL_BY_ID).join(' | ')}>`), { code: 'EUSAGE' });
  return { path: '/dev/hidraw-dry-run', node: 'hidraw-dry-run', id: m.id, model: m, name: m.name, serial: 'DRYRUN', iface: m.iface ?? 0 };
}

export async function main(argv = [], io = {}) {
  const out = (s) => (io.stdout || process.stdout).write(`${s}\n`);
  const err = (s) => (io.stderr || process.stderr).write(`prism-deck hid: ${s}\n`);
  const { pos, opt } = parseArgs(argv);
  const sub = pos[0];
  const env = { sysfs: io.sysfs, dev: io.dev, proc: io.proc, platform: io.platform, release: io.release, rulesDirs: io.rulesDirs };
  try {
    switch (sub) {
      case 'list': return cmdList(opt, out, env);
      case 'doctor': return await cmdDoctor(opt, out, env);
      case 'run': return await cmdRun(opt, out, err, io, env);
      case 'events': return await cmdEvents(opt, out, err, io, env);
      case 'bench': return await cmdBench(opt, out, err, env);
      case 'udev': (io.stdout || process.stdout).write(udevRules()); return 0;
      case undefined: case 'help': out(HELP); return 0;
      default: err(`unknown command "${sub}"`); out(HELP); return 2;
    }
  } catch (e) {
    err(`${e.code && e.code !== 'EUSAGE' ? `[${e.code}] ` : ''}${e.message}`);
    return e.code === 'EUSAGE' ? 2 : 1;
  }
}

function cmdList(opt, out, env) {
  const decks = listDecks({ sysfs: env.sysfs, dev: env.dev });
  const rows = decks.map((d) => ({ path: d.path, id: d.id, name: d.model.name, usb: d.model.usb, serial: d.serial, iface: d.iface, holders: findHolders(d.path, { proc: env.proc }) }));
  if (opt.json) { out(JSON.stringify(rows, null, 2)); return 0; }
  if (!rows.length) { out('no supported decks found (prism-deck hid doctor explains why)'); return 0; }
  for (const r of rows) out(`${r.path.padEnd(14)} ${r.id.padEnd(18)} ${r.usb}  ${(r.serial || '—').padEnd(16)} ${r.name}${r.holders.length ? `  [in use by ${r.holders.map((h) => `${h.comm} ${h.pid}`).join(', ')}]` : ''}`);
  return 0;
}

/**
 * Exit 0 when at least one deck can be driven, 1 when nothing can work (not Linux, no deck, no
 * access). Warnings (no rule file, python3 missing, another app running) don't fail the run.
 */
async function cmdDoctor(opt, out, env) {
  let usable = 0;
  const ok = (b, s) => out(`${b ? 'ok  ' : 'warn'}  ${s}`);
  const bad = (s) => out(`FAIL  ${s}`);
  const platform = env.platform || process.platform;
  if (platform !== 'linux') {
    bad(`platform ${platform}: not Linux. The hidraw driver only exists on Linux, so nothing here can work on this machine`);
    out('      (Windows / macOS: use the Elgato Stream Deck app with the Prism plugin; see docs/plugin.md)');
    return 1;
  }
  const release = env.release || os.release();
  const [maj, min] = release.split('.').map(Number);
  ok(maj > 5 || (maj === 5 && min >= 6), `kernel ${release} ≥ 5.6 (only the 2017 original Stream Deck needs it: 8191-byte reports)`);
  const [nmaj] = process.versions.node.split('.').map(Number);
  ok(nmaj >= 18, `node ${process.versions.node} (≥ 18)`);
  const decks = listDecks({ sysfs: env.sysfs, dev: env.dev });
  (decks.length ? ok.bind(null, true) : bad)(`${decks.length} supported deck(s) in /sys/class/hidraw`);
  for (const d of decks) {
    let rw = true;
    try { fs.accessSync(d.path, fs.constants.R_OK | fs.constants.W_OK); } catch { rw = false; }
    if (rw) usable++;
    ok(rw, `${d.path} ${d.model.name}: ${rw ? 'read/write' : `no access — install ${UDEV_RULES_NAME} (prism-deck hid udev) and replug`}`);
    const holders = findHolders(d.path, { proc: env.proc });
    ok(!holders.length, holders.length ? `${d.path} is open in ${holders.map((h) => `${h.comm} (${h.pid})`).join(', ')}` : `${d.path} is free`);
  }
  const apps = findDeckApps({ proc: env.proc });
  ok(!apps.length, apps.length ? `deck apps running: ${apps.map((a) => `${a.app} (${a.pid})`).join(', ')} — quit them before \`hid run\`` : 'no other deck app running');
  const rule = (env.rulesDirs || ['/etc/udev/rules.d', '/run/udev/rules.d', '/usr/lib/udev/rules.d', '/lib/udev/rules.d']).map((p) => `${p}/${UDEV_RULES_NAME}`).find((p) => fs.existsSync(p));
  let current = true;
  if (rule) { try { current = fs.readFileSync(rule, 'utf8') === udevRules(); } catch { /* unreadable: report as installed */ } }
  ok(!!rule && current, !rule ? `udev rule ${UDEV_RULES_NAME} not installed (systemd ≥ 251 covers some models; see docs/linux.md)`
    : current ? `udev rule ${rule}` : `udev rule ${rule} differs from this version's rule; reinstall it (prism-deck hid udev). Older copies granted every Galleon interface, keyboard included`);
  const py = spawnSync('python3', ['-I', '-c', 'import fcntl'], { stdio: 'ignore', timeout: 5000 });
  ok(py.status === 0, py.status === 0 ? 'python3 + fcntl available (brightness, logo, Galleon keep-alive)' : 'python3 with fcntl not found — brightness falls back to software dimming; the Galleon cannot be driven');
  ok(fs.existsSync(HELPER_PATH), `feature helper ${HELPER_PATH}`);
  if (!usable) bad(decks.length ? 'no deck is accessible to this user' : 'no deck to drive');
  return usable ? 0 : 1;
}

async function openSelected(opt, env, extra = {}) {
  if (opt['dry-run']) {
    const info = fakeInfo(opt.model);
    const transport = memoryTransport({ path: info.path });
    const deck = await HidDeck.open(info, { transport, claim: false, helper: false, pollMs: 0, budget: opt.budget ? Number(opt.budget) : undefined, ...extra, ...(info.model.keepAlive ? { helper: { keepAlive: async () => {}, set: async () => {}, close() {} } } : {}) });
    return { deck, transport };
  }
  const info = selectDeck(listDecks({ sysfs: env.sysfs, dev: env.dev }), { path: opt.path, serial: opt.serial, model: opt.model });
  const deck = await HidDeck.open(info, { force: !!opt.force, proc: env.proc, budget: opt.budget ? Number(opt.budget) : undefined, quality: opt.quality ? { key: Number(opt.quality), lcd: Number(opt.quality) } : undefined, ...extra });
  return { deck };
}

const untilSignal = (seconds) => new Promise((resolve) => {
  const done = (why) => { process.off('SIGINT', onSig); process.off('SIGTERM', onSig); clearTimeout(t); resolve(why); };
  const onSig = () => done('signal');
  process.on('SIGINT', onSig); process.on('SIGTERM', onSig);
  const t = seconds ? setTimeout(() => done('time'), seconds * 1000) : null;
});

async function cmdRun(opt, out, err, io, env) {
  const { deck, transport } = await openSelected(opt, env);
  const m = deck.model;
  if (!m.key && !m.lcd) { await deck.close(); throw Object.assign(new Error(`${m.name} has no display to draw on (try: prism-deck hid events)`), { code: 'EUSAGE' }); }
  const spec = layoutFromArgs(opt) || defaultLayout(m);
  if (opt.theme) spec.theme = String(opt.theme);
  if (opt.mode) spec.mode = String(opt.mode);
  const layout = resolveLayout(m, spec);
  for (const p of layout.problems) err(`layout: ${p}`);
  if (!layout.slots.length) { await deck.close({ blank: false }); throw new Error('nothing to draw (no valid facets in the layout)'); }
  if (opt.brightness !== undefined) out(`brightness ${opt.brightness}% (${await deck.setBrightness(Number(opt.brightness))})`);
  let lost = null;
  const runner = createRunner(deck, layout, {
    fpsCap: opt['fps-cap'] ? Number(opt['fps-cap']) : undefined, reduced: !!opt.reduced,
    onError: (e) => err(`facet ${e.facet}: ${e.message}`),
  });
  const ended = new Promise((resolve) => deck.once('disconnect', (e) => { lost = e; resolve('disconnect'); }));
  await runner.start();
  out(`${m.name} ${deck.info.path}: ${layout.slots.map((s) => s.facet.id).join(', ')} — theme ${spec.theme || 'prism'}${opt['dry-run'] ? ' (dry run)' : ''}; Ctrl-C to stop`);
  const audio = opt.audio ? await startAudio(opt.audio === true ? 'monitor' : String(opt.audio), runner, out, err) : null;
  const t0 = Date.now();
  const why = await Promise.race([untilSignal(opt.seconds ? Number(opt.seconds) : opt['dry-run'] ? 3 : 0), ended]);
  if (audio) await audio.stop();
  await runner.stop();
  const secs = (Date.now() - t0) / 1000;
  const s = { ...runner.stats, ...deck.stats };
  out(`${why}: ${secs.toFixed(1)} s · ${s.renders} renders · ${s.rasterized} rasterized · ${s.frames} frames sent (${s.deduped} identical, ${s.superseded} superseded) · ${s.reports} reports (${(s.reports / Math.max(secs, 0.001)).toFixed(0)}/s, ${(s.bytes / 1024 / Math.max(secs, 0.001)).toFixed(0)} KiB/s)`);
  if (lost) err(`deck lost: ${lost.message}`);
  await deck.close({ blank: !opt.keep });
  if (transport) out(`dry run: ${transport.writes.length} reports captured in memory`);
  return lost ? 1 : 0;
}

/** --audio [monitor|mic]: feed ctx.data.audio / .spectrum from src/audio (levels only, never recorded) at 15 Hz. */
async function startAudio(input, runner, out, err) {
  let mod;
  try { mod = await import('../audio/index.js'); } catch (e) { err(`--audio: src/audio is not available (${e.message})`); return null; }
  const src = mod.createAudioSource({ input });
  await src.start();
  const timer = setInterval(() => { const snap = src.snapshot(); if (snap) runner.setData(snap); }, 1000 / 15);
  const i = src.info?.() || {};
  out(`audio: ${i.title || i.backend || 'simulated'} — ${i.state || src.mode} (${input})`);
  return { async stop() { clearInterval(timer); await src.stop(); } };
}

async function cmdEvents(opt, out, err, io, env) {
  const { deck } = await openSelected(opt, env, { helper: false, reset: false });
  out(`# ${deck.model.name} ${deck.info.path} — press keys / turn dials; Ctrl-C to stop`);
  deck.on('input', (ev) => out(JSON.stringify(ev)));
  const ended = new Promise((resolve) => deck.once('disconnect', () => resolve('disconnect')));
  await Promise.race([untilSignal(opt.seconds ? Number(opt.seconds) : 0), ended]);
  await deck.close({ blank: false });
  return 0;
}

async function cmdBench(opt, out, err, env) {
  const { deck } = await openSelected(opt, env, { budget: 1e6 });
  const m = deck.model;
  if (!m.key) { await deck.close({ blank: false }); throw Object.assign(new Error(`${m.name} has no key displays`), { code: 'EUSAGE' }); }
  const secs = Number(opt.seconds) || 3;
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < secs * 1000) {
    const g = (n++ % 2) * 24; // alternate two near-black frames so dedupe never skips one
    await deck.setKey(0, solid(m.key.w, m.key.h, [g, g, g]));
  }
  await deck.flush();
  const dt = (Date.now() - t0) / 1000;
  out(`${m.name}: ${n} key images, ${deck.stats.reports} reports in ${dt.toFixed(2)} s → ${(n / dt).toFixed(0)} images/s, ${(deck.stats.reports / dt).toFixed(0)} reports/s (use about half of that as --budget)`);
  await deck.close();
  return 0;
}
