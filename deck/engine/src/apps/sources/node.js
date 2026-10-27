// Node entry for live data (plugin, hidraw apps, CLI). Zero dependencies; Node ≥ 18 (plugin: the
// Stream Deck app's Node 20). Everything is read-only and throttled; nothing is elevated, nothing
// leaves the machine (Prism Control is a loopback API), every child process is killed on stop() / process exit.
//
//   import { createNodeHub } from './src/apps/sources/node.js';
//   const data = await createNodeHub();                       // live system + simulated audio / media / calendar
//   const runtime = new PrismRuntime({ conn, data, … });      // drop-in for src/plugin/data.js createDataHub()
//
// opts: { system: true | false, audio: 'auto' | 'simulated' | { stream, format, channels, sampleRate } | false,
//         media: 'auto' | 'simulated' | false, calendar: { file: '~/agenda.ics' } | 'simulated' | false,
//         prismControl: 'auto' | false | { dir, …createPrismControl opts } (env PRISM_DECK_PRISM_CONTROL=off),
//         simulate: true (simulated fallbacks for audio / media / calendar), seed, rate, sys (tests), log }
//
// Prism Control (./prism-control.js): when the sibling plugin runs, its sources come first, so per key a live
// Prism Control beats the Node probes, which keep running underneath and serve every key it doesn't fill.
// hub.prismControl is the client (status(), wrapAudio(audioSource) for the plugin's per-frame audio).

import { createHub } from './hub.js?v=b7d3401196';
import { createSystemSource } from './system.js?v=b7d3401196';
import { createPrismControl } from './prism-control.js?v=b7d3401196';
import { createAudioSource, autoAudioSource } from './audio.js?v=b7d3401196';
import { createLinuxMediaSource } from './media.js?v=b7d3401196';
import { createIcsCalendarSource, parseIcs } from './calendar.js?v=b7d3401196';
import { simulatedAudio, simulatedMedia, simulatedCalendar } from './simulated.js?v=b7d3401196';

/** The real OS behind one object: { sys, os, fs } (sys = src/audio/system.js nodeSystem()). */
export async function nodeDeps(overrides = {}) {
  const [os, fsp, { nodeSystem }] = await Promise.all([import('node:os'), import('node:fs/promises'), import('../../audio/system.js?v=b7d3401196')]);
  const sys = overrides.sys || await nodeSystem(overrides.sysOverrides);
  const fs = overrides.fs || { readFile: (p) => fsp.readFile(p, 'utf8'), readdir: (p) => fsp.readdir(p), statfs: typeof fsp.statfs === 'function' ? (p) => fsp.statfs(p) : null };
  return { sys, os: overrides.os || os.default || os, fs };
}

export async function createNodeHub(opts = {}) {
  const { system = true, audio = 'auto', media = 'auto', calendar = 'simulated', simulate = true, seed = 7, rate = 1 } = opts;
  const deps = await nodeDeps(opts);
  const now = () => Date.now();
  const hub = createHub({ now });
  const systemSource = system ? createSystemSource({ ...deps, rate }) : null;
  const pcOpts = opts.prismControl ?? 'auto';
  const pc = pcOpts && deps.sys.env?.PRISM_DECK_PRISM_CONTROL !== 'off' ? createPrismControl({ env: deps.sys.env, log: opts.log, ...(typeof pcOpts === 'object' ? pcOpts : {}), under: { system: systemSource } }) : null;
  if (pc && pc.state !== 'unsupported') {
    const off = new Set([...(system ? [] : ['cpu', 'temp', 'fans']), ...(audio ? [] : ['audio']), ...(media ? [] : ['media'])]);
    for (const s of pc.sources) if (!s.provides.some((k) => off.has(k))) hub.add(s);   // system / audio / media: false skip their Prism Control twins too
    hub.prismControl = pc;
    const stopHub = hub.stop;
    hub.stop = () => { stopHub(); pc.stop(); };
  }
  if (systemSource) hub.add(systemSource);
  if (audio && typeof audio === 'object') hub.add(createAudioSource({ ...audio, now }));
  else if (audio === 'auto') { const live = await autoAudioSource({ seed, system: deps.sys, ...(opts.audioOptions || {}) }); if (live) hub.add(live); }
  if (audio && simulate) hub.add(simulatedAudio({ seed, now }));   // the fallback while no capture is live
  if (media === 'auto') { const m = createLinuxMediaSource(deps); if (m) hub.add(m); }
  if (media && simulate) hub.add(simulatedMedia({ seed, now }));
  const ics = (file, tz) => createIcsCalendarSource({ file: expandHome(file, deps), fs: deps.fs, now, tzOffset: tz ?? -new Date().getTimezoneOffset(), setTimer: deps.sys.setTimer, clearTimer: deps.sys.clearTimer });
  let icsSource = calendar && typeof calendar === 'object' && calendar.file ? hub.add(ics(calendar.file, calendar.tzOffset)) : null;
  if (calendar && simulate) hub.add(simulatedCalendar({ now, tzOffset: -new Date().getTimezoneOffset() }));
  /**
   * Point the calendar at a local .ics file (the plugin's "Data sources" setting), or '' for the demo day.
   * Re-read every 60 s; until it parses, the simulated day stands in (and the plugin badges it DEMO).
   */
  hub.setCalendarFile = (file) => {
    const want = typeof file === 'string' && file ? expandHome(file, deps) : '';
    if ((icsSource?.status().file || '') === want) return icsSource;
    icsSource = hub.replace(icsSource, want ? ics(file) : null);
    return icsSource;
  };
  hub.calendarStatus = () => (icsSource ? icsSource.status() : null);
  /** Read an .ics once (for the property inspector): { ok, events } or { ok: false, error }. Read-only. */
  hub.checkCalendarFile = async (file) => {
    try { return { ok: true, events: parseIcs(await deps.fs.readFile(expandHome(file, deps)), -new Date().getTimezoneOffset()).length }; } catch (e) { return { ok: false, error: e?.code === 'ENOENT' ? 'not found' : 'unreadable' }; }
  };
  // ── Game Link (prism-play) ──
  // opts.gamelink: 'auto' (default) | false | { dir, port, steam, … createGameLink opts } (env PRISM_DECK_GAMELINK=off).
  // The CS2 GSI / companion listener (./gamelink.js) is created here but binds, reads and writes nothing until the
  // plugin's global gamelink.enabled turns it on (the user clicked "Connect CS2"); hub.gameLink is the client.
  // While it's off, the simulated demo round (./gamelink-sim.js) serves ctx.data.gamelink and the plugin tags it DEMO.
  const glOpts = opts.gamelink ?? 'auto';
  if (glOpts && deps.sys.env?.PRISM_DECK_GAMELINK !== 'off') {
    const { createGameLink } = await import('./gamelink.js?v=b7d3401196');
    const gl = createGameLink({ env: deps.sys.env, log: opts.log, ...(typeof glOpts === 'object' ? glOpts : {}) });
    hub.add(gl.source);
    hub.gameLink = gl;
    const stopBeforeGameLink = hub.stop;
    hub.stop = () => { stopBeforeGameLink(); gl.stop().catch(() => {}); };
  }
  if (simulate) { const { simulatedGameLink } = await import('./gamelink-sim.js?v=b7d3401196'); hub.add(simulatedGameLink({ seed, now })); }
  return hub;
}

function expandHome(p, { sys }) {
  const home = sys.env?.HOME || sys.env?.USERPROFILE || '';
  return String(p).replace(/^~(?=$|[\\/])/, home);
}
