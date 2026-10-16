// Media and meeting controls on keys.
//
//   app-now-playing    generated cover art (no images) with the track's progress as a beam; press = play / pause
//   app-media-key      a transport key (play-pause / next / previous / stop) that knows the live player state
//   app-meeting-mic    live / muted; the halo follows your voice; talking while muted makes it ask "Speaking?"
//   app-meeting-camera on / off, with an on-air tally while the camera is on
//   app-meeting-hand   raise / lower your hand; raised, it waves gently in amber until lowered
//   app-meeting-leave  the hang-up key: red, with the call you're in; a press drops the handset
//   app-next-meeting   your next meeting as a countdown ring; amber in the last five minutes, then "Join"
//
// Data (all optional, simulated otherwise): media { title, artist, position, duration, playing } ·
// audio { level } (the microphone, when the runtime captures it) · calendar { next, current? } ·
// mic { muted } / camera { on } (extensions — a runtime that knows the call state overrides the key's own).

import { surface, rect, path, circle, n, arcPath, roundRectPath } from '../../scene/index.js';
import { clockText } from '../../scene/text.js';
import { arrive, pulse, clamp } from '../../scene/easing.js';
import { mediaOf, audioOf, calendarOf } from './_data.js';
import { colorAt, glowDot } from './_kit.js';
import { coverArt, pictogram, hhmm, localParts } from '../screens/_d5-kit.js';
import { mutedPlate, strike } from './_muted.js';

const big = (k) => Math.min(k.w, k.h) >= 110;
const MIN = 60000;

/** The raised hand (an original drawing on the 48-unit grid): four fingers, palm, thumb. */
function hand(g, s) {
  const tops = [13, 9.5, 10.5, 14];
  for (let i = 0; i < 4; i++) { const x0 = 15 + i * 4.5; g.path(`M${x0} 28V${tops[i] + 2.25}A2.25 2.25 0 0 1 ${x0 + 4.5} ${tops[i] + 2.25}V28`, { role: 'line', join: 'round' }); }
  g.path('M15 26V33.5C15 38.5 19 42 24 42C29 42 33 38.5 33 33.5V26', { role: 'line' });
  g.path('M15 34L10.4 28.6A2.4 2.4 0 0 1 14 25.4L15 26.6', { role: 'line', join: 'round' });
  if (s.state === 'raised') { g.arc(24, 24, 17, -58, -36, { role: 'accent' }); g.arc(24, 24, 17, 36, 58, { role: 'accent' }); }
}
/** The hang-up handset (original): a handset lying flat, ear and mouth pieces turned down. */
function handset(g, s) {
  const drop = s.drop || 0;
  g.group({ x: 0, y: drop * 6, rotate: drop * 8, origin: [24, 26] }, (q) => {
    q.path('M8.5 27.5C14 21 34 21 39.5 27.5L37.4 31.4C37 32.2 36 32.5 35.2 32.1L31.2 30C30.6 29.7 30.3 29.1 30.3 28.4V25.9C26.2 24.7 21.8 24.7 17.7 25.9V28.4C17.7 29.1 17.4 29.7 16.8 30L12.8 32.1C12 32.5 11 32.2 10.6 31.4Z', { role: 'line', join: 'round' });
  });
}

/** A glyph-box for ad-hoc pen art, matching where the theme puts glyphs. */
const boxOf = (k, labeled = true) => k.theme.glyphBox(k, { labeled });

const nowPlaying = {
  id: 'app-now-playing', title: 'Now Playing', category: 'Audio',
  description: 'Now playing: generated cover art and the track progress as a beam. Live via playerctl on Linux, simulated elsewhere. A press flips the look; it sends no media key.',
  tags: ['media', 'now playing', 'music', 'cover art', 'progress', 'play', 'pause', 'stream', 'streaming', 'song'],
  surface: 'key', data: ['media'], fps: 2, loop: 30,
  states: ['playing', 'paused'], tones: { playing: 'active', paused: 'idle' }, press: 'toggle',
  params: {},
  order: 40,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const live = ctx.data && Object.hasOwn(ctx.data, 'media');
    const m = live && ctx.data.media === null ? null : mediaOf(ctx, { playing: ctx.stateName !== 'paused' });
    const playing = m ? (live ? !!m.playing : ctx.stateName !== 'paused') : false;
    k.background({ tone: m ? 'idle' : 'off' });
    if (!m) { k.glyph('music-note', { state: undefined, labeled: true }); k.label('Nothing', { color: 'muted' }); return k.svg(); }
    const inset = k.m.safe, size = Math.min(w, h) - inset * 2, x = (w - size) / 2, y = (h - size) / 2;
    coverArt(k, { x, y, size, title: m.title, artist: m.artist, radius: k.m.radius * 0.7 });
    // a scrim at the bottom so the beam and the title read on any art
    const sid = k.id('scrim');
    k.def(`<linearGradient id="${sid}" x1="0" y1="${n(y + size * 0.45)}" x2="0" y2="${n(y + size)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.62"/></linearGradient>`);
    k.add(path(roundRectPath(x, y, size, size, k.m.radius * 0.7), { fill: `url(#${sid})` }));
    const f = m.duration > 0 ? clamp(m.position / m.duration) : 0;
    const by = y + size - k.m.u * 5, bx = x + k.m.u * 5, bw = size - k.m.u * 10;
    k.add(rect({ x: bx, y: by, width: bw, height: Math.max(1.5, k.m.line), rx: k.m.line / 2, fill: '#ffffff', fillOpacity: 0.28 }));
    k.add(rect({ x: bx, y: by, width: Math.max(1.5, bw * f), height: Math.max(1.5, k.m.line), rx: k.m.line / 2, fill: '#ffffff' }));
    if (playing) k.add(glowDot(k, { cx: bx + bw * f, cy: by + k.m.line / 2, r: k.m.line * 1.2, color: '#ffffff', opacity: 0.8 }));
    if (big(k)) k.text('caption', m.title, { align: 'left', x: bx, y: by - k.m.u * 3.5, maxWidth: bw, color: '#ffffff', size: k.m.u * 9 });
    if (!playing) {
      const cs = size * 0.26, cx = x + size / 2, cy = y + size * 0.44;
      k.add(circle({ cx, cy, r: cs / 2, fill: '#000000', fillOpacity: 0.55 }));
      k.add(rect({ x: cx - cs * 0.16, y: cy - cs * 0.2, width: cs * 0.1, height: cs * 0.4, rx: cs * 0.03, fill: '#ffffff' }) + rect({ x: cx + cs * 0.06, y: cy - cs * 0.2, width: cs * 0.1, height: cs * 0.4, rx: cs * 0.03, fill: '#ffffff' }));
    }
    return k.svg();
  },
};

const ACTIONS = { 'play-pause': { glyph: 'play-pause', label: 'Play' }, next: { glyph: 'skip-next', label: 'Next' }, previous: { glyph: 'skip-prev', label: 'Back' }, stop: { glyph: 'stop', label: 'Stop' } };

const mediaKey = {
  id: 'app-media-key', title: 'Media Key', category: 'Controls',
  description: 'A transport key (play / pause, next, previous, stop) that follows the player: live via playerctl on Linux, simulated elsewhere. Shows state; it sends no media keys yet.',
  tags: ['media', 'transport', 'play', 'pause', 'next', 'previous', 'controls', 'music'],
  surface: 'key', data: ['media'], fps: 2, loop: 30,
  params: { action: { type: 'select', default: 'play-pause', options: Object.keys(ACTIONS), label: 'Action' } },
  order: 41,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const A = ACTIONS[p.action] || ACTIONS['play-pause'];
    const live = ctx.data && Object.hasOwn(ctx.data, 'media');
    const m = live && ctx.data.media === null ? null : mediaOf(ctx);
    const playing = !!m?.playing;
    const isPlay = p.action === 'play-pause';
    k.background({ tone: isPlay && playing ? 'active' : m ? 'idle' : 'off' });
    k.glyph(A.glyph, { state: isPlay ? (playing ? 'playing' : 'paused') : undefined, labeled: true });
    if (isPlay && m && m.duration > 0) {
      const f = clamp(m.position / m.duration), r = Math.min(w, h) / 2 - k.m.u * 2.6;
      k.add(path(arcPath(w / 2, h / 2, r, 0, 359.9), { fill: 'none', stroke: k.colors.line, strokeWidth: n(Math.max(1, k.m.hair * 1.2)), strokeOpacity: 0.7 }));
      if (f > 0.003) k.add(path(arcPath(w / 2, h / 2, r, 0, 360 * f), { fill: 'none', stroke: colorAt(ctx, 'auto', 0.7), strokeWidth: n(Math.max(1.25, k.m.line)), strokeLinecap: 'round' }));
    }
    k.label(isPlay ? (playing ? 'Pause' : 'Play') : A.label, { color: m ? 'ink' : 'muted' });
    return k.svg();
  },
};

const mic = {
  id: 'app-meeting-mic', title: 'Meeting Mic', category: 'Controls',
  description: 'Your mic in a call: a halo follows your voice; muted, the key turns red and says MUTED. Shows state only (it does not mute your call yet); linked mic keys follow.',
  tags: ['meeting', 'call', 'mic', 'microphone', 'mute', 'voice', 'controls', 'stream', 'streaming', 'muted', 'microphone mute'],
  surface: 'key', data: ['audio'], fps: 8, loop: 4,
  states: ['live', 'muted'], tones: { live: 'active', muted: 'neg' }, press: 'toggle',
  link: { 'mic.muted': { live: false, muted: true } },
  params: { threshold: { type: 'number', default: 0.55, min: 0.1, max: 0.95, step: 0.05, label: 'Talking-while-muted level' } },
  order: 50,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t, params: p } = ctx;
    const muted = typeof ctx.data?.mic?.muted === 'boolean' ? ctx.data.mic.muted : ctx.stateName === 'muted';
    const A = audioOf(ctx, { count: 8 });
    const speaking = muted && A.live && A.level >= p.threshold;
    k.background({ tone: speaking ? 'warn' : muted ? 'neg' : 'active' });
    if (muted) mutedPlate(k, { since: ctx.since });
    if (!muted) {
      const lv = A.live ? A.level : 0.35 + 0.3 * pulse(t, 1.3) * pulse(t, 0.37);
      const r0 = Math.min(w, h) * 0.22, cx = w / 2, cy = h * 0.42;
      for (let i = 0; i < 3; i++) {
        const r = r0 + k.m.u * (4 + i * 3.6) * clamp(lv * 1.3);
        k.add(path(arcPath(cx, cy, r, 200, 340), { fill: 'none', stroke: ctx.tint, strokeWidth: n(Math.max(1, k.m.line * (1 - i * 0.25))), strokeOpacity: n(0.6 - i * 0.18, 2), strokeLinecap: 'round' }));
        k.add(path(arcPath(cx, cy, r, 20, 160), { fill: 'none', stroke: ctx.tint, strokeWidth: n(Math.max(1, k.m.line * (1 - i * 0.25))), strokeOpacity: n(0.6 - i * 0.18, 2), strokeLinecap: 'round' }));
      }
    }
    k.glyph('mic', { state: muted ? 'off' : 'on', labeled: true });
    if (muted) strike(k, boxOf(k), { since: ctx.since });
    k.label(speaking ? 'SPEAKING?' : muted ? 'MUTED' : 'Live', { color: 'ink' });
    return k.svg();
  },
};

const camera = {
  id: 'app-meeting-camera', title: 'Meeting Camera', category: 'Controls',
  description: 'Your camera in a call: on with an on-air tally, off in red. Shows state only (it does not switch your camera); linked camera keys follow.',
  tags: ['meeting', 'call', 'camera', 'video', 'webcam', 'controls', 'stream', 'streaming'],
  surface: 'key', fps: 2, loop: 4,
  states: ['on', 'off'], tones: { on: 'active', off: 'neg' }, press: 'toggle',
  link: { 'camera.on': { on: true, off: false } },
  params: {},
  order: 51,
  render(ctx) {
    const k = surface(ctx);
    const { w, t } = ctx;
    const on = typeof ctx.data?.camera?.on === 'boolean' ? ctx.data.camera.on : ctx.stateName === 'on';
    k.background({ tone: on ? 'active' : 'neg' });
    k.glyph('camera', { state: on ? 'on' : 'off', labeled: true });
    if (on) { const r = Math.max(2, k.m.u * 2.6), cx = w - k.m.text - r, cy = k.m.text + r; k.add(glowDot(k, { cx, cy, r, color: k.colors.neg, opacity: ctx.reduced ? 0.8 : 0.55 + 0.45 * pulse(t, 2) })); }
    k.label(on ? 'Camera' : 'Cam off');
    return k.svg();
  },
};

const raise = {
  id: 'app-meeting-hand', title: 'Raise Hand', category: 'Controls',
  description: 'Raise your hand in a call: raised, the hand waves gently in amber until you lower it. Shows state only; no meeting-app source is connected yet.',
  tags: ['meeting', 'call', 'raise hand', 'hand', 'question', 'controls'],
  surface: 'key', fps: 8, loop: 1.6,
  states: ['down', 'raised'], tones: { down: 'idle', raised: 'warn' }, press: 'toggle',
  params: {},
  order: 52,
  render(ctx) {
    const k = surface(ctx);
    const raised = ctx.stateName === 'raised';
    k.background({ tone: raised ? 'warn' : 'idle' });
    const b = boxOf(k);
    const wave = raised && !ctx.reduced ? Math.sin((ctx.t / 1.6) * Math.PI * 2) * 7 * arrive(ctx.since, 0.5) : 0;
    const lift0 = raised ? (1 - arrive(ctx.since, 0.4)) * 6 : 0;
    pictogram(k, (g, s) => g.group({ rotate: wave, origin: [24, 42], y: lift0 }, (q) => hand(q, s)), { x: b.x, y: b.y, size: b.size, tone: raised ? 'warn' : 'idle', state: raised ? 'raised' : 'down', tag: 'hand' });
    k.label(raised ? 'Hand up' : 'Raise');
    return k.svg();
  },
};

const leave = {
  id: 'app-meeting-leave', title: 'Leave Call', category: 'Controls',
  description: 'The hang-up key: red, with the meeting you are in and how long it has run (from a local .ics calendar, else demo). Shows state only; it ends no call.',
  tags: ['meeting', 'call', 'leave', 'hang up', 'end call', 'controls'],
  surface: 'key', data: ['calendar'], fps: 4, loop: 4, press: 'momentary',
  params: {},
  order: 53,
  render(ctx) {
    const k = surface(ctx);
    const { w } = ctx;
    const cal = calendarOf(ctx);
    const cur = cal.current && cal.current.end > ctx.now ? cal.current : null;
    k.background({ tone: 'neg' });
    const b = boxOf(k);
    const drop = ctx.pressed ? 1 : ctx.pressAge < 0.6 ? 1 - arrive(ctx.pressAge, 0.6) : 0;
    pictogram(k, (g, s) => handset(g, { ...s, drop }), { x: b.x, y: b.y, size: b.size, tone: 'neg', tag: 'leave' });
    if (cur && big(k)) k.caption(clockText((ctx.now - cur.at) / 1000), { align: 'right', x: w - k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
    k.label(ctx.pressed || ctx.pressAge < 0.6 ? 'Leaving' : 'Leave');
    return k.svg();
  },
};

const nextMeeting = {
  id: 'app-next-meeting', title: 'Next Meeting', category: 'Dashboards',
  description: 'Your next meeting as a countdown ring over the last hour, amber in the final five minutes, then Join. From a local .ics calendar; simulated until you set one.',
  tags: ['meeting', 'calendar', 'agenda', 'countdown', 'next', 'reminder'],
  surface: 'key', data: ['calendar', 'clock'], fps: 1, loop: 60,
  params: { hour12: { type: 'bool', default: false, label: '12-hour clock' } },
  order: 54,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t, params: p } = ctx;
    const cal = calendarOf(ctx), now = ctx.now;
    const cur = cal.current && cal.current.end > now ? cal.current : null, ev = cur || cal.next;
    if (!ev) { k.background({ tone: 'off' }); k.glyph('calendar', { state: 'date', labeled: true }); k.label('Free'); return k.svg(); }
    const toStart = (ev.at - now) / MIN;
    const joining = !cur && toStart <= 1, soon = !cur && toStart <= 5;
    const tone = cur ? 'active' : joining ? 'alert' : soon ? 'warn' : 'idle';
    k.background({ tone });
    const m = Math.min(w, h), cx = w / 2, cy = h * 0.43, r = m * 0.3, sw = k.m.bold * 0.75;
    const f = cur ? clamp((now - ev.at) / (ev.end - ev.at)) : clamp(1 - toStart / 60);
    const c = tone === 'idle' ? colorAt(ctx, 'auto', 0.75) : k.tone(tone);
    k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(sw * 0.6) }));
    if (f > 0.003) k.add(path(arcPath(cx, cy, r, 0, 360 * f), { fill: 'none', stroke: c, strokeWidth: n(sw), strokeLinecap: 'round' }));
    if (joining && !ctx.reduced) k.add(circle({ cx, cy, r: r * 0.86, fill: c, fillOpacity: n(0.06 + 0.1 * pulse(t, 1), 3) }));
    const mins = Math.max(0, Math.ceil(cur ? (ev.end - now) / MIN : toStart));
    const lt = localParts(ctx, ev.at);
    const big1 = joining ? 'Join' : mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}`;
    k.value(big1, { cy, size: k.m.u * (joining ? 13 : 16), maxWidth: r * 1.5, color: tone === 'idle' ? 'ink' : 'tone' });
    if (!joining) k.caption(cur ? 'min left' : mins >= 60 ? hhmm(lt.h, lt.m, p.hour12) : 'min', { y: cy + r * 0.62, maxWidth: r * 1.4, color: 'muted', size: k.m.u * 7.5 });
    k.label(ev.title, { color: cur ? 'ink' : 'muted' });
    return k.svg();
  },
};

export default [nowPlaying, mediaKey, mic, camera, raise, leave, nextMeeting];
