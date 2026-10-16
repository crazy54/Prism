// Prism Deck plugin entry. The Stream Deck app (or OpenDeck on Linux) launches
// bin/plugin.js with `-port -pluginUUID -registerEvent -info`; this connects, starts
// the runtime and — only while the user allows AI editing — the live control channel.
//
//   node bin/plugin.js -port 28196 -pluginUUID <id> -registerEvent registerPlugin -info '{…}'
//
// Zero dependencies; runs on the app's bundled Node 20 (no global WebSocket needed).

import { StreamDeckConnection, parseLaunchArgs } from './connection.js';
import { PrismRuntime } from './runtime.js';
import { LiveController } from './control.js';
import { createDataHub } from './data.js';

export { StreamDeckConnection, parseLaunchArgs, detectHost, hostFeatures } from './connection.js';
export { PrismRuntime, createRuntime, PLUGIN_UUID } from './runtime.js';
export { LiveController, API_VERSION as LIVE_API_VERSION } from './control.js';
export { DeviceBudget, allocateFps, DEFAULT_LIMITS } from './budget.js';

export const PLUGIN_VERSION = '0.7.0.0';

/**
 * Start the plugin. opts: { argv, env, connect, exit, log, controlFile, handleProcess,
 *   audio (an AudioSource, or null for none), data (a data hub; default createNodeHub()) } (tests inject these).
 * Env: PRISM_DECK_AUDIO=off (no capture), PRISM_DECK_LIVE_DATA=off (no system probes / child processes).
 * Resolves with { conn, runtime, live, stop() } once registered.
 */
export async function main({ argv = process.argv.slice(2), env = process.env, connect, exit = (code) => process.exit(code), controlFile, log, handleProcess = true, audio, data: injected } = {}) {
  const args = parseLaunchArgs(argv);
  const conn = new StreamDeckConnection({ port: args.port, pluginUUID: args.pluginUUID, registerEvent: args.registerEvent || 'registerPlugin', info: args.info, ...(connect ? { connect } : {}) });
  const write = log || ((level, msg) => {
    if (level === 'debug') return;
    process.stderr.write(`[prism-deck] ${level}: ${msg}\n`);
    if (level === 'error' || level === 'warn') conn.logMessage(`[prism-deck] ${level}: ${msg}`);
  });
  // Live data (src/apps/sources): system metrics, media, calendar, with simulated fallbacks. Audio is
  // handled by the runtime itself (per-frame snapshots), so the hub runs without it.
  let data = injected;
  if (!data) {
    if (env.PRISM_DECK_LIVE_DATA === 'off') data = createDataHub();
    else {
      try { const { createNodeHub } = await import('../apps/sources/node.js'); data = await createNodeHub({ audio: false }); } catch (e) { write('warn', 'live data hub unavailable: ' + e.message); data = createDataHub(); }
    }
  }
  // Qt output stage (scene/qt.js): clipPath → luminance mask, no preserveAspectRatio. Guarded: older engines lack it.
  let deviceSvg = null;
  try { ({ toDeviceSvg: deviceSvg } = await import('../scene/qt.js')); } catch { write('warn', 'scene/qt.js missing: payloads are sent without the Qt output stage'); }
  let raster = null;
  try { raster = await import('../raster/index.js'); } catch { /* optional: only the 'png' format needs it */ }
  // Live audio (src/audio): capture starts only while a visible facet draws audio / spectrum.
  let audioSource = env.PRISM_DECK_AUDIO === 'off' ? null : audio;   // PRISM_DECK_AUDIO=off: no capture (smoke tests, kiosks)
  if (audioSource === undefined) {
    try { const { createAudioSource } = await import('../audio/index.js'); audioSource = createAudioSource({ input: 'monitor', onLog: (m) => write('debug', m) }); } catch { audioSource = null; }
  }
  const runtime = new PrismRuntime({ conn, data, log: write, version: PLUGIN_VERSION, raster, audio: audioSource, deviceSvg });
  const live = new LiveController({ runtime, controlFile, version: PLUGIN_VERSION, log: write, env });
  let stopping = false;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    try { await live.stop('plugin exit'); } catch { /* best effort */ }
    runtime.stop();
    try { await audioSource?.stop?.(); } catch { /* best effort */ }
    conn.close();
    exit(code);
  };
  conn.on('close', () => { stop(0); });
  conn.on('ws-error', (e) => write('warn', `socket: ${e.message}`));
  runtime.start();
  await conn.connect();
  write('info', `registered (${conn.host}, ${process.platform}, node ${process.versions.node})`);
  if (handleProcess) {
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => stop(0));
    process.on('uncaughtException', (e) => write('error', `uncaught: ${e.stack || e.message}`));
  }
  return { conn, runtime, live, stop };
}
