// screen-galleon-studio — the Galleon 100 SD screen for streaming, wired to its dials and to the keys
// (linked state, scene/link.js). Left dial: the show — top: the ON AIR lightbox with your live time and
// the stream volume (turn the left dial); push a dial to go live or end. Bottom: the stream goal.
// Right dial: you — top: the mic as a 30-notch meter with its volume (turn the right dial); muted, the
// whole widget turns red and says MUTED (any linked mic key mutes it, and vice versa). Bottom: chat pace.
// The live state is shared with On Air keys ('stream.live'), the mic with mic keys ('mic.muted').
// Honest data: the mic level reads ctx.data.audio when a runtime captures sound, the goal is the number
// you type in, and chat is simulated (no chat source exists yet); each widget says so.
// Widgets change at most: the mic 4×/s, the live clock 1×/s, chat every 2 s, the goal on a change.

import { surface, rect, n } from '../../scene/index.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { audioOf } from '../apps/_data.js';
import { mutedPlate } from '../apps/_muted.js';
import { galleon, header, stat, meter, segmented, spark, pictogram, HUE, GALLEON_PARAMS } from './_d5-kit.js';
import { text, glowText, widthOf, mmss } from '../apps/_d7-kit.js';
import { capHeight, compact } from '../../scene/text.js';

const CHATTERS = ['nova_k', 'pixelmoth', 'dr_lumen', 'quietfox', 'atlas.v', 'mira_codes', 'ember77', 'tess', 'bytewren', 'solstice'];
const pct = (v) => `${Math.round(clamp(v) * 100)}%`;

/** The mic, struck through (the pictogram the muted widget shows). */
function mutedMic(g) {
  g.rect(18.5, 6, 11, 20, { r: 5.5 });
  g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
  g.line(24, 32.5, 24, 40, { role: 'dim' });
  g.line(10, 8, 38, 40, { role: 'line', weight: 1.2 });
}

export default {
  id: 'screen-galleon-studio',
  title: 'Galleon Studio Console',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen for streaming: ON AIR (push a dial to go live), stream and mic volume on the dials, MUTED in red, the goal and chat pace (demo).',
  tags: ['galleon', 'corsair', 'screen', 'stream', 'streaming', 'broadcast', 'on air', 'live', 'mic', 'mute', 'muted', 'volume', 'goal', 'chat', 'creator', 'dashboard', 'obs-style'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['audio', 'mic', 'volume'],
  states: ['off-air', 'live'],
  tones: { 'off-air': 'idle', live: 'active' },
  press: 'toggle',
  link: { 'stream.live': { 'off-air': false, live: true } },
  fps: 4,
  loop: 60,
  params: {
    ...GALLEON_PARAMS,
    volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Stream volume (until the left dial turns)' },
    micVolume: { type: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Mic volume (until the right dial turns)' },
    goal: { type: 'text', default: 'Supporters', maxLength: 14, label: 'Goal name' },
    current: { type: 'number', default: 412, min: 0, max: 1000000, step: 1, label: 'Goal count (you type it: no goal source yet)' },
    target: { type: 'number', default: 500, min: 1, max: 1000000, step: 1, label: 'Goal target' },
  },
  order: 25,
  render(ctx) {
    const scr = surface(ctx);
    const P = ctx.params;
    const live = ctx.stateName === 'live';
    const A = audioOf(ctx, { count: 60, rate: 30 });
    const muted = typeof ctx.data?.mic?.muted === 'boolean' ? ctx.data.mic.muted : false;
    // the dials: ctx.values (both runtimes pass one value per dial for a screen on both dials)
    const V = Array.isArray(ctx.values) ? ctx.values : null;
    const showVol = clamp(V?.[0] ?? (typeof ctx.data?.volume?.level === 'number' ? ctx.data.volume.level : P.volume));
    const micVol = clamp(V?.[1] ?? P.micVolume);

    const onAir = (p, W) => {
      header(p, W, live ? 'Live' : 'Off air', live ? ['push dial · end', 'push · end'] : ['push dial · go live', 'push · go live'], { metaColor: live ? 'ink' : 'muted' });
      // a small lightbox on the left; the live time and the stream volume on the right
      const bx = W.x0, by = W.eyebrowY + W.pad * 0.7, bh = W.footY - by, bw = Math.min(bh * 1.2, W.w * 0.36);
      const tint = p.ctx.tint, deep = p.ctx.theme.spectral(p.ctx.hue, { tier: 'ink' });
      const lit = live ? (ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.5))) : 0;
      const glass = p.dark ? mix(p.colors.surface2, '#000000', 0.45) : mix(p.colors.surface2, p.colors.line, 0.4);
      p.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx: n(W.u * 3), fill: p.dark ? mix(glass, tint, 0.16 * lit) : mix(glass, deep, lit), stroke: live ? tint : p.colors.line, strokeWidth: n(Math.max(1, W.u * 0.8)) }));
      const size = Math.min((bw * 0.74) / (widthOf('AIR', 1, { weight: 700, tracking: 0.08 })), (bh * 0.66) / (capHeight(1, 700) * 2 + 0.36));
      const c = capHeight(size, 700), y1 = by + (bh - (c * 2 + size * 0.36)) / 2 + c, y2 = y1 + c + size * 0.36;
      if (p.dark) for (const [wd, y] of [['ON', y1], ['AIR', y2]]) glowText(p, wd, { x: bx + bw / 2, y, size, weight: 600, tracking: 0.08, color: tint, lit, halo: size * 0.2, tube: mix(glass, p.colors.muted, 0.35), core: mix(tint, '#ffffff', 0.72) });
      else for (const [wd, y] of [['ON', y1], ['AIR', y2]]) text(p, wd, { x: bx + bw / 2, y, size, weight: 700, tracking: 0.08, color: mix(mix(glass, p.colors.muted, 0.55), '#ffffff', lit) });
      const rx0 = bx + bw + W.pad * 0.8, room = W.x1 - rx0;
      const mid = by + bh * 0.34;
      if (live) p.text('value', mmss(ctx.since), { align: 'right', x: W.x1, cy: mid, maxWidth: room });
      else p.text('value', 'Ready', { align: 'right', x: W.x1, cy: mid, color: 'muted', maxWidth: room });
      // stream volume: the left dial
      const mh = Math.max(6, Math.round(W.u * 2.2));
      p.caption(`Vol ${pct(showVol)}`, { align: 'right', x: W.x1, y: W.footY - mh - W.u * 2.4, color: 'ink', maxWidth: room });
      meter(p, { x: rx0, y: W.footY - mh, w: room, h: mh, value: showVol, color: tint });
    };
    const mic = (p, W) => {
      const db = A.level > 0.001 ? Math.round((A.level * micVol - 1) * 60) : null;
      if (muted) {
        // unmissable: the whole widget red, the mic struck through, MUTED (never color alone)
        mutedPlate(p, { radius: p.m.radius });
        header(p, W, 'Mic · muted', ['mic key unmutes', 'mic key'], { metaColor: 'ink' });
        const gs = W.footY - W.eyebrowY - W.pad * 0.4;
        pictogram(p, mutedMic, { x: W.x0, y: W.footY - gs, size: gs, tone: 'neg', tag: 'mm' });
        p.text('hero', 'MUTED', { align: 'right', x: W.x1, cy: (W.eyebrowY + W.footY) / 2 + W.u * 2, color: 'ink', maxWidth: W.w - gs - W.pad });
        return;
      }
      header(p, W, 'Mic', A.live ? (db === null ? 'silent' : `${db} dB`) : ['demo level', 'demo'], { metaColor: 'dim' });
      stat(p, { value: String(Math.round(micVol * 100)), unit: '% vol', xl: W.x0, base: p.h * 0.62 });
      const mh = Math.max(8, Math.round(W.u * 3.2));
      const v = A.level * micVol;
      const zone = v > 0.9 ? p.colors.neg : v > 0.75 ? p.colors.warn : p.colors.pos;
      segmented(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: v, count: 30, color: zone });
      // peak tick
      if (A.peak > 0.02) { const x = W.x0 + W.w * clamp(A.peak * micVol); p.add(rect({ x: n(x - 1), y: n(W.footY - mh - 3), width: 2, height: n(mh + 6), rx: 1, fill: p.dark ? '#ffffff' : p.colors.ink })); }
    };
    const goal = (p, W) => {
      const f = clamp(P.current / Math.max(1, P.target));
      const done = P.current >= P.target;
      header(p, W, P.goal, done ? 'goal reached ✓' : `${Math.round(f * 100)}%`, { metaColor: done ? 'pos' : 'dim' });
      stat(p, { value: compact(P.current), unit: `/ ${compact(P.target)}`, xl: W.x0, base: p.h * 0.64 });
      const mh = Math.max(8, Math.round(W.u * 3));
      meter(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: f * (ctx.reduced ? 1 : outExpo(clamp(ctx.since / 1.2))), color: done ? p.colors.pos : p.ctx.tint });
      // milestones at quarters
      let d = '';
      for (let i = 1; i < 4; i++) d += `M${n(W.x0 + (W.w * i) / 4)} ${n(W.footY - mh - 3)}v${n(mh + 6)}`;
      p.add(`<path d="${d}" stroke="${p.colors.surface}" stroke-width="2" fill="none"/>`);
    };
    const chat = (p, W) => {
      const tq = ctx.reduced ? 30 : Math.floor(ctx.t / 2) * 2;
      const vals = Array.from({ length: 30 }, (_, i) => clamp(0.18 + 0.62 * ctx.noise.n1((tq - (29 - i) * 2) / 9) + 0.15 * ctx.noise.n1((tq - (29 - i) * 2) / 2.3 + 40)));
      const rate = Math.round(8 + 46 * vals[vals.length - 1]);
      const who = CHATTERS[Math.floor(tq / 4) % CHATTERS.length];
      header(p, W, 'Chat', [`demo · @${who}`, 'demo'], { metaColor: 'muted' });
      stat(p, { value: String(rate), unit: '/ min', xl: W.x0, base: p.h * 0.56, role: 'value' });
      const top = p.h * 0.62, hh = W.footY - top;
      spark(p, vals, { x: W.x0, y: top, w: W.w, h: hh, color: p.ctx.tint });
    };
    return galleon(ctx, scr, [[onAir, mic], [goal, chat]], { hues: [[25, HUE.jade], [HUE.mint, HUE.violet]], tones: [[live ? 'active' : 'idle', muted ? 'neg' : 'idle'], ['idle', 'idle']] });
  },
};
