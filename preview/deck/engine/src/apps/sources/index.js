// Prism Deck data sources — the browser-safe entry (no node:* imports). Node runtimes that want
// live system / capture / player data use ./node.js (createNodeHub), which builds on this.
//
//   import { createSimulatedHub } from 'prism-deck/src/apps/sources/index.js';
//   const hub = createSimulatedHub();               // every key, deterministic, offline
//   mountDevice(el, { …, data: () => hub.pick(facet.data) });

import { createHub, lease } from './hub.js';
import { simulatedSystem, simulatedAudio, simulatedMedia, simulatedCalendar, SYSTEM_KEYS, AUDIO_KEYS } from './simulated.js';

export { createHub, lease };
export { simulatedSource, createPoller, History, stable } from './_source.js';
export { simulatedSystem, simulatedAudio, simulatedMedia, simulatedCalendar, SYSTEM_KEYS, AUDIO_KEYS };
export { createAudioSource, autoAudioSource, AUDIO_DEFAULTS } from './audio.js';
export { createTimer } from './timer.js';
export { parseIcs, agendaOf, icsTime, createIcsCalendarSource } from './calendar.js';
export { parsePlayerctl, parseVolume } from './media.js';
export * as probes from './probes.js';
// ── Game Link (prism-play) ── the pure halves only; the listener (./gamelink.js) is Node-only and never re-exported here
export { normalizeCs2, tickCs2, gameLinkView, sanitizeCs2, parseVdf, findCs2, cs2Cfg, cfgState, isPrismCfg, mapTitle, roundReason, ROUND_REASONS, CFG_NAME, GAMELINK_VERSION } from './gamelink-cs2.js';
export { normalizeCompanion } from './gamelink-companion.js';
export { simulatedGameLink } from './gamelink-sim.js';
import { simulatedGameLink } from './gamelink-sim.js';

/** Which source family serves each ctx.data key (README.md). */
export const KEY_SOURCES = Object.freeze({
  cpu: 'system', mem: 'system', gpu: 'system', disk: 'system', net: 'system', temp: 'system', battery: 'system', uptime: 'system', sys: 'system', series: 'system',
  audio: 'audio', spectrum: 'audio', media: 'media', calendar: 'calendar',
  clock: 'runtime (ctx.clock)', timer: 'per key (createTimer)', weather: 'none built in (register a getter)',
  gamelink: 'gamelink',   // Game Link (prism-play): CS2 GSI + companions (./gamelink.js, Node) · simulated demo round
});

/** A hub where everything is simulated (web catalog, tests, demos). */
export function createSimulatedHub({ seed = 7, now, tzOffset = 0 } = {}) {
  return createHub({ now, sources: [simulatedSystem({ seed, now }), simulatedAudio({ seed, now }), simulatedMedia({ seed, now }), simulatedCalendar({ now, tzOffset }), simulatedGameLink({ seed, now })] });
}
