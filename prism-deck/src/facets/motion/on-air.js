// state-on-air — the studio lightbox. Off air the glass tubes sit dark in their box; press and
// the tubes strike: a deterministic flicker (ON first, AIR a beat later), then they hold, and
// the live time counts beneath. Press again: the tubes fade out with an afterglow.
// Hardware: 8 fps only during the 0.8 s strike / fade; live, the only change is the clock
// (one update a second, or none with `uptime` off). The tubes take the key's hue (default coral-red).

import { surface, rect, n, url, linearGradient } from '../../scene/index.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, glowText, widthOf, capHeight, mmss, isBig, chip } from '../apps/_d7-kit.js';

const WORDS = { 'on-air': ['ON', 'AIR'], live: ['LIVE'], rec: ['REC'], 'mic-live': ['MIC', 'LIVE'] };
// the strike: tube brightness per 0.1 s (a real starter: a stutter, a pop, a dip, then steady)
const STRIKE = [0.15, 0, 0.7, 0.05, 0.9, 0.35, 1, 0.8, 1];

const strike = (s) => (s >= STRIKE.length * 0.1 ? 1 : STRIKE[Math.max(0, Math.floor(s * 10))]);

export default {
  id: 'state-on-air',
  title: 'On Air',
  category: 'State Transitions',
  description: 'The studio lightbox: press to go live and the tubes strike and hold while the live time counts. Linked with the Galleon studio screen and On Air keys; shows state only.',
  tags: ['on air', 'live', 'stream', 'streaming', 'broadcast', 'sign', 'tally', 'neon', 'creator', 'recording', 'obs-style'],
  surface: 'key',
  fps: 8,
  loop: 4,
  states: ['off-air', 'live'],
  tones: { 'off-air': 'idle', live: 'active' },
  press: 'toggle',
  // linked state (scene/link.js): ON AIR / LIVE signs follow the deck's live state (the Galleon Studio screen, On Air
  // keys); a MIC LIVE sign lights while the mic is not muted
  link: (p) => (p.words === 'mic-live' ? { 'mic.muted': { 'off-air': true, live: false } } : p.words === 'rec' ? {} : { 'stream.live': { 'off-air': false, live: true } }),
  params: {
    words: { type: 'select', default: 'on-air', options: ['on-air', 'live', 'rec', 'mic-live'], label: 'Sign' },
    uptime: { type: 'bool', default: true, label: 'Show the live time' },
    hue: { type: 'hue', default: 25, min: 0, max: 360, label: 'Tube color' },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const live = ctx.stateName === 'live';
    const C = k.colors, u = k.m.u;
    // tube brightness: strike on going live, afterglow on going off (only after a real press)
    let lit;
    if (ctx.reduced) lit = live ? 1 : 0;
    else if (live) lit = 1;
    else lit = Number.isFinite(ctx.pressAge) || ctx.pressed ? clamp(1 - outExpo(clamp(ctx.since / 0.7))) * 0.6 : 0;
    k.background({ tone: live ? 'active' : 'idle' });
    const words = WORDS[ctx.params.words] || WORDS['on-air'];
    const showTime = ctx.params.uptime && (live || isBig(k));
    // the lightbox
    const big = isBig(k);
    const pad = k.m.safe * 0.95;
    const chipText = Math.max(8, (big ? 9.5 : 8) * u);
    const foot = showTime ? chipText / 0.62 + 1.5 * u : 0;
    const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - foot - (foot ? 2 * u : 0);
    const tint = ctx.tint;
    const deep = ctx.theme.spectral(ctx.hue, { tier: 'ink' });
    const any = live ? (ctx.reduced ? 1 : strike(ctx.since)) : lit;
    const weight = k.dark ? 600 : 700, tracking = 0.08;
    const widest = Math.max(...words.map((wd) => widthOf(wd, 100, { weight, tracking })));
    const lines = words.length;
    const capR = capHeight(100, weight) / 100;
    const gapR = lines > 1 ? 0.42 : 0;
    const size = Math.min((bw * 0.78) / (widest / 100), (bh * 0.74) / (capR * lines + gapR * (lines - 1)));
    const block = size * (capR * lines + gapR * (lines - 1));
    const top = by + (bh - block) / 2;
    const lineY = (i) => top + size * capR * (i + 1) + size * gapR * i;
    const rx = n(k.m.radius * 0.55);
    if (k.dark) {
      // Night: neon tubes in a dark glass box
      const glass = mix(C.surface2, '#000000', 0.45);
      const litGlass = mix(glass, tint, 0.16);
      k.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx, fill: mix(glass, litGlass, clamp(any)), stroke: live ? mix(tint, C.line, 0.35) : C.line, strokeWidth: n(Math.max(1, u * 1.1)) }));
      k.add(rect({ x: n(bx + u * 2), y: n(by + u * 1.2), width: n(bw - u * 4), height: n(Math.max(1, u * 0.8)), rx: n(u * 0.4), fill: C.edge || '#ffffff', fillOpacity: n(0.12 * (0.5 + 0.5 * any), 3) }));
      const core = mix(tint, '#ffffff', 0.72);
      const tube = mix(glass, C.muted, 0.35);
      words.forEach((wd, i) => {
        const l = live && !ctx.reduced ? strike(ctx.since - i * 0.18) : lit;  // AIR strikes a beat after ON
        glowText(k, wd, { x: w / 2, y: lineY(i), size, weight, tracking, color: tint, lit: l, halo: size * 0.22, tube, core });
      });
    } else {
      // Day: a backlit acrylic lightbox — the panel lights in the hue, the letters stay white
      const off = mix(C.surface2, C.line, 0.4);
      const gid = k.id('lightbox');
      k.def(linearGradient(gid, [[0, mix(deep, tint, 0.45)], [1, deep]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
      k.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx, fill: off, stroke: C.line, strokeWidth: n(Math.max(1, u)) }));
      if (any > 0.01) k.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx, fill: url(gid), fillOpacity: any < 1 ? n(any, 3) : undefined }));
      k.add(rect({ x: n(bx + u * 2), y: n(by + u * 1.2), width: n(bw - u * 4), height: n(Math.max(1, u * 0.8)), rx: n(u * 0.4), fill: '#ffffff', fillOpacity: n(0.35 + 0.3 * any, 3) }));
      const letter = mix(mix(off, C.muted, 0.55), '#ffffff', clamp(any));
      words.forEach((wd, i) => text(k, wd, { x: w / 2, y: lineY(i), size, weight, tracking, color: letter }));
    }
    if (showTime) {
      const cy = h - pad - foot / 2 + u * 0.5;
      if (live) {
        const ch = chipText / 0.62;
        chip(k, { x: w / 2, y: cy - ch / 2, h: ch, label: `● ${mmss(ctx.since)}`, color: k.dark ? tint : deep, ink: k.dark ? '#000000' : '#ffffff', size: chipText, weight: 700, anchor: 'middle', caps: false, tracking: 0.02 });
      } else text(k, 'Off air', { cy, size: chipText, weight: 600, caps: true, tracking: 0.12, color: 'muted' });
    }
    return k.svg();
  },
};
