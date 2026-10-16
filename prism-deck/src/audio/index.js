// prism-deck/audio — live audio levels for the deck's audio apps (waveform across keys,
// spectrum analyzer, VU dials), zero dependencies. Importable everywhere: Node built-ins
// load lazily, only when a capture backend or the bridge actually starts.
//
//   import { createAudioSource } from 'prism-deck/audio';
//   const audio = createAudioSource({ input: 'monitor' });     // what you hear; 'mic' for the microphone
//   await audio.start();                                       // best backend for this OS, or simulated
//   render(facet, { data: audio.data() ?? {} });               // ctx.data.audio / ctx.data.spectrum
//
// Backends (auto order): Linux parec → pw-record → arecord → ffmpeg; Windows / macOS ffmpeg →
// browser bridge; always a deterministic synthetic fallback. Levels and bands only, in memory —
// nothing is recorded or stored. Never needs elevation. See docs/linux.md (Audio).
//
// Shapes (docs/authoring.md §7, extras marked +):
//   audio    { level 0–1 (meter, dB), levels number[] (waveform envelope, oldest first, fixed length),
//              rate (levels per second), +peak, +rms }
//   spectrum { bands number[] 0–1 low → high, +peaks number[], +centers number[] (Hz) }

export { createAudioSource, AudioSource } from './source.js';
export { Analyzer, ANALYZER_DEFAULTS } from './analyzer.js';
export { RingBuffer } from './ring.js';
export { createSynth, simulate, hashNoise } from './synthetic.js';
export { createPcmDecoder, sniffHeader, PCM_FORMATS } from './pcm.js';
export { fftInPlace, windowedMagnitudes, bandLayout, bandAmplitudes, toLevel, toDb, coef, follow, rmsPeak, resampleBands, nextPow2 } from './dsp.js';
export { detectBackends, backendList } from './detect.js';
export {
  BACKENDS, BACKEND_IDS, AUTO_ORDER, autoOrder, commandLine, DEFAULT_RATE,
  parsePipewireVersion, versionGte, parseDshowDevices, parseAvfoundationDevices, pickDevice, LOOPBACK_HINTS, hostWrap,
} from './backends.js';
export { createBridgeServer, bridgePageHtml, bridgePageScript, bridgeWorkletSource, BRIDGE_PROTOCOL, encodeFrame, createFrameParser, decodeMeter, checkUpgrade } from './bridge.js';
export { nodeSystem, bareSystem, defaultSystem, manualClock, whichIn, runWith, liveChildren } from './system.js';

/** Data keys this module feeds (authoring.md §7). */
export const AUDIO_DATA_KEYS = Object.freeze(['audio', 'spectrum']);

/**
 * Wire a source into a runtime's data hub (src/plugin/data.js): registers 'audio' and
 * 'spectrum' getters. Capture runs only while something retains the source.
 * → unregister()
 */
export function attachAudio(hub, source) {
  const pick = (k) => () => source.data()?.[k];
  hub.register('audio', pick('audio'));
  hub.register('spectrum', pick('spectrum'));
  return () => { hub.register('audio', () => undefined); hub.register('spectrum', () => undefined); };
}
