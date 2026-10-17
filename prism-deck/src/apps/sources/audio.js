// Audio source → ctx.data.audio + ctx.data.spectrum (shapes: README.md). Browser-safe.
//
//   createAudioSource()                                   simulated: the apps groove (same as the facets' fallback)
//   createAudioSource({ stream, format, channels, sampleRate })   live PCM from any capture CLI's stdout
//                                                         (pw-record / parec / arecord / ffmpeg — src/audio/backends.js plans them)
//   createAudioSource({ capture })                        a capture object from src/audio/ (see README: "Capture interface")
//   src.feed(float32Mono)                                 push samples yourself (browser AudioWorklet bridge, tests)
//
// The FFT, band layout, AGC and peak hold are src/audio/analyzer.js (the Linux audio engineer's,
// zero-dep); this adapter decodes PCM, runs it through one Analyzer and serves snapshots at
// ≤ 30 Hz. Nothing is recorded: the analyzer holds one FFT window, the history is levels only.

import { simulatedAudio, AUDIO_KEYS } from './simulated.js';
import { Analyzer } from '../../audio/analyzer.js';
import { createPcmDecoder } from '../../audio/pcm.js';

/** Defaults for the live analyzer: 16 s of 30 Hz levels (span apps on big decks show long windows). */
export const AUDIO_DEFAULTS = Object.freeze({ seconds: 16, rate: 30, bands: 16, sampleRate: 16000 });

export function createAudioSource(opts = {}) {
  const o = { ...AUDIO_DEFAULTS, ...opts };
  const now = o.now || (() => Date.now());
  if (!o.stream && !o.capture && !o.live) return simulatedAudio({ seed: o.seed, rate: o.rate, seconds: o.seconds, bands: o.bands, now });

  const analyzer = new Analyzer({ sampleRate: o.sampleRate, historySeconds: o.seconds, historyRate: o.rate, bands: o.bands });
  let decoder = createPcmDecoder({ format: o.format || 's16le', channels: o.channels || 1, sniff: true, onHeader: (h) => { if (h?.sampleRate) analyzer.setSampleRate(h.sampleRate); } });
  let running = false, key = null, cache = null, lastData = 0, detach = null;
  const feed = (samples) => { if (samples?.length) { analyzer.push(samples); lastData = now(); key = null; } };
  const onChunk = (chunk) => feed(decoder.push(chunk));

  function attach() {
    const cap = o.capture;
    const stream = o.stream || cap?.stream || cap?.stdout;
    if (cap?.sampleRate) analyzer.setSampleRate(cap.sampleRate);
    if (cap?.format || cap?.channels) decoder = createPcmDecoder({ format: cap.format || o.format || 's16le', channels: cap.channels || o.channels || 1, sniff: true });
    if (stream?.on) { stream.on('data', onChunk); detach = () => stream.off?.('data', onChunk) ?? stream.removeListener?.('data', onChunk); }
    else if (typeof cap?.onData === 'function') { const un = cap.onData((x) => (x instanceof Float32Array ? feed(x) : onChunk(x))); detach = typeof un === 'function' ? un : null; }
    cap?.start?.();
  }

  return {
    id: 'audio', provides: [...AUDIO_KEYS], rate: o.rate, mode: 'live',
    get running() { return running; },
    start() { if (!running) { running = true; attach(); } return this; },
    stop() { running = false; try { detach?.(); } catch { /* gone */ } detach = null; try { o.capture?.stop?.(); } catch { /* gone */ } return this; },
    feed,
    /** Latest analysis (cached per 1/rate s); silence scrolls in when capture stalls > 0.5 s. */
    snapshot(nowMs = now()) {
      const q = Math.floor((nowMs / 1000) * o.rate);
      if (q === key && cache) return cache;
      if (running && lastData && nowMs - lastData > 500) { analyzer.silence(Math.min(o.rate, Math.round(((nowMs - lastData) / 1000) * o.rate))); lastData = nowMs; }
      key = q;
      cache = analyzer.snapshot();
      return cache;
    },
    status() { return { id: 'audio', mode: 'live', running, analyzer: analyzer.info, lastDataAgoMs: lastData ? now() - lastData : null }; },
  };
}

/**
 * The capture source for this runtime: src/audio/source.js (the Linux audio engineer's — picks
 * pw-record / parec / arecord / ffmpeg / the browser bridge, follows device changes, restarts on
 * stalls) with `fallback: false`, so while nothing is live it reports no data and the hub serves the
 * simulated groove instead (one synthetic signal, not two). The moment a backend goes live its
 * `mode` getter flips to 'live' and the hub switches every audio facet to it. Never throws:
 * without src/audio (browsers, trimmed builds) → null.
 */
export async function autoAudioSource(opts = {}) {
  try {
    const mod = await import('../../audio/source.js');
    const make = mod.createAudioSource || mod.createSource || mod.default;
    if (typeof make !== 'function') return null;
    const src = await make({ historySeconds: opts.seconds ?? AUDIO_DEFAULTS.seconds, historyRate: AUDIO_DEFAULTS.rate, bands: opts.bands ?? AUDIO_DEFAULTS.bands, fallback: false, ...opts });
    return src && typeof src.snapshot === 'function' ? asSource(src) : null;
  } catch { return null; }
}

/** A capture object that already speaks this layer's interface is used as is; otherwise wrap it (getters stay live). */
function asSource(src) {
  if (Array.isArray(src.provides) && typeof src.start === 'function' && typeof src.stop === 'function' && 'mode' in src) return src;
  return {
    id: 'audio', provides: [...AUDIO_KEYS],
    get rate() { return src.rate || AUDIO_DEFAULTS.rate; },
    get mode() { return src.mode || 'live'; },
    get running() { return !!src.running; },
    start() { src.start?.(); return this; },
    stop() { src.stop?.(); return this; },
    snapshot(nowMs) { const s = src.snapshot(nowMs); return s ? { audio: s.audio, spectrum: s.spectrum } : null; },
    status() { return { id: 'audio', foreign: true, ...(src.status?.() || {}) }; },
  };
}
