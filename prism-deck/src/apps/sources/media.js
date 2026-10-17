// Now-playing source → ctx.data.media { title, artist, album, position s, duration s, playing, volume?, muted? }.
//
// Simulated by default (a fictional playlist). Optional real integration, no network and no
// credentials: on Linux, MPRIS through `playerctl` (any player that speaks MPRIS) and the default
// sink's volume through `wpctl` (PipeWire) or `pactl` (PulseAudio), polled once a second, read-only.
// No player running → media: null (facets show "nothing playing").

import { simulatedMedia } from './simulated.js';
import { stable, createPoller } from './_source.js';

/** `playerctl metadata --format …` output (tab-separated) → media or null. */
export function parsePlayerctl(text = '') {
  const line = String(text).split('\n').find((l) => l.includes('\t'));
  if (!line) return null;
  const [status, artist, title, album, pos, len] = line.split('\t');
  if (!title && !artist) return null;
  const us = (x) => { const v = Number(x); return Number.isFinite(v) ? v / 1e6 : 0; };
  return { title: title || '', artist: artist || '', album: album || '', position: us(pos), duration: us(len), playing: /^playing$/i.test(status || '') };
}

/** `wpctl get-volume @DEFAULT_AUDIO_SINK@` ("Volume: 0.62 [MUTED]") or `pactl get-sink-volume/-mute` → { volume, muted }. */
export function parseVolume(text = '', muteText = '') {
  const w = /Volume:\s*([\d.]+)(\s*\[MUTED\])?/i.exec(text);
  if (w) return { volume: Math.min(1, Number(w[1])), muted: !!w[2] };
  const p = /(\d+)%/.exec(text);
  if (p) return { volume: Math.min(1, Number(p[1]) / 100), muted: /yes/i.test(muteText) };
  return null;
}

export const PLAYERCTL_FORMAT = '{{status}}\t{{artist}}\t{{title}}\t{{album}}\t{{position}}\t{{mpris:length}}';

/** Live media via playerctl (Linux). sys: src/audio/system.js nodeSystem(). Returns null when unsupported. */
export function createLinuxMediaSource({ sys }) {
  if (sys?.platform !== 'linux') return null;
  const playerctl = sys.which('playerctl');
  if (!playerctl) return null;
  const wpctl = sys.which('wpctl'), pactl = wpctl ? null : sys.which('pactl');
  let media = null, vol = null, running = false;
  const probes = [
    { id: 'player', every: 1, async run() {
      const r = await sys.run(playerctl, ['metadata', '--format', PLAYERCTL_FORMAT], { timeoutMs: 900 });
      if (r.timedOut || r.error) return undefined;
      media = r.code === 0 ? parsePlayerctl(r.stdout) : null;
      return true;
    } },
    { id: 'volume', every: 2, async run() {
      if (wpctl) { const r = await sys.run(wpctl, ['get-volume', '@DEFAULT_AUDIO_SINK@'], { timeoutMs: 900 }); vol = r.code === 0 ? parseVolume(r.stdout) : vol; return true; }
      if (pactl) {
        const [a, b] = await Promise.all([sys.run(pactl, ['get-sink-volume', '@DEFAULT_SINK@'], { timeoutMs: 900 }), sys.run(pactl, ['get-sink-mute', '@DEFAULT_SINK@'], { timeoutMs: 900 })]);
        vol = a.code === 0 ? parseVolume(a.stdout, b.stdout) : vol; return true;
      }
      return null;
    } },
  ];
  const poller = createPoller({ probes, rate: 1, now: sys.now, setTimer: sys.setTimer, clearTimer: sys.clearTimer });
  return {
    id: 'media', provides: ['media'], rate: 1, mode: 'live',
    get running() { return running; },
    start() { if (!running) { running = true; poller.start(); } return this; },
    stop() { running = false; poller.stop(); return this; },
    snapshot() { return { media: media ? stable({ ...media, ...(vol || {}) }) : null }; },
    status() { return { id: 'media', mode: 'live', running, player: poller.state('player') }; },
  };
}

export { simulatedMedia };
