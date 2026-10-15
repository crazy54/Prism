// Node entry for live data (plugin, hidraw apps, CLI). Zero dependencies; Node ≥ 18 (plugin: the
// Stream Deck app's Node 20). Everything is read-only and throttled; nothing is elevated, nothing
// touches the network, every child process is killed on stop() / process exit.
//
//   import { createNodeHub } from './src/apps/sources/node.js';
//   const data = await createNodeHub();                       // live system + simulated audio / media / calendar
//   const runtime = new PrismRuntime({ conn, data, … });      // drop-in for src/plugin/data.js createDataHub()
//
// opts: { system: true | false, audio: 'auto' | 'simulated' | { stream, format, channels, sampleRate } | false,
//         media: 'auto' | 'simulated' | false, calendar: { file: '~/agenda.ics' } | 'simulated' | false,
//         simulate: true (simulated fallbacks for audio / media / calendar), seed, rate, sys (tests) }

import { createHub } from './hub.js';
import { createSystemSource } from './system.js';
import { createAudioSource, autoAudioSource } from './audio.js';
import { createLinuxMediaSource } from './media.js';
import { createIcsCalendarSource } from './calendar.js';
import { simulatedAudio, simulatedMedia, simulatedCalendar } from './simulated.js';

/** The real OS behind one object: { sys, os, fs } (sys = src/audio/system.js nodeSystem()). */
export async function nodeDeps(overrides = {}) {
  const [os, fsp, { nodeSystem }] = await Promise.all([import('node:os'), import('node:fs/promises'), import('../../audio/system.js')]);
  const sys = overrides.sys || await nodeSystem(overrides.sysOverrides);
  const fs = overrides.fs || { readFile: (p) => fsp.readFile(p, 'utf8'), readdir: (p) => fsp.readdir(p), statfs: typeof fsp.statfs === 'function' ? (p) => fsp.statfs(p) : null };
  return { sys, os: overrides.os || os.default || os, fs };
}

export async function createNodeHub(opts = {}) {
  const { system = true, audio = 'auto', media = 'auto', calendar = 'simulated', simulate = true, seed = 7, rate = 1 } = opts;
  const deps = await nodeDeps(opts);
  const now = () => Date.now();
  const hub = createHub({ now });
  if (system) hub.add(createSystemSource({ ...deps, rate }));
  if (audio && typeof audio === 'object') hub.add(createAudioSource({ ...audio, now }));
  else if (audio === 'auto') { const live = await autoAudioSource({ seed, system: deps.sys, ...(opts.audioOptions || {}) }); if (live) hub.add(live); }
  if (audio && simulate) hub.add(simulatedAudio({ seed, now }));   // the fallback while no capture is live
  if (media === 'auto') { const m = createLinuxMediaSource(deps); if (m) hub.add(m); }
  if (media && simulate) hub.add(simulatedMedia({ seed, now }));
  if (calendar && typeof calendar === 'object' && calendar.file) hub.add(createIcsCalendarSource({ file: expandHome(calendar.file, deps), fs: deps.fs, now, tzOffset: calendar.tzOffset ?? -new Date().getTimezoneOffset(), setTimer: deps.sys.setTimer, clearTimer: deps.sys.clearTimer }));
  if (calendar && simulate) hub.add(simulatedCalendar({ now, tzOffset: -new Date().getTimezoneOffset() }));
  return hub;
}

function expandHome(p, { sys }) {
  const home = sys.env?.HOME || sys.env?.USERPROFILE || '';
  return String(p).replace(/^~(?=$|[\\/])/, home);
}
