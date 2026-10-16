// screen-neo-now-playing — the Neo info bar (232 × 50) as a now-playing strip: generated cover art,
// title and artist, a play-state pulse and a progress hairline along the bottom edge.
//
// ctx.data (optional; a fictional playlist otherwise): media { title, artist, position s, duration s, playing },
// audio { level, levels } (drives the play-state bars). media: null = nothing playing.

import { surface, rect, path, roundRectPath } from '../../scene/index.js';
import { capHeight } from '../../scene/text.js';
import { mediaOf, audioOf } from '../apps/_data.js';
import { infobar, px, coverArt, mmss, clamp } from './_d5-kit.js';

export default {
  id: 'screen-neo-now-playing',
  title: 'Neo Info-Bar Now Playing',
  category: 'Neo Info Bar',
  description: 'The Neo info bar as a now-playing strip: generated cover art, title and artist, a play-state pulse and a progress hairline along the bottom edge.',
  tags: ['neo', 'info bar', 'media', 'music', 'now playing', 'screen'],
  surface: 'screen',
  screens: ['infobar'],
  data: ['media', 'audio'],
  dataShape: { media: '{ title, artist, position s, duration s, playing } (null = nothing playing)', audio: '{ level 0–1, levels }' },
  states: ['playing', 'paused'],
  press: 'none',
  fps: 6,
  loop: 16,
  params: { showTime: { type: 'bool', default: true, label: 'Show the remaining time' } },
  order: 11,
  render(ctx) {
    const k = surface(ctx);
    const none = ctx.data && Object.hasOwn(ctx.data, 'media') && ctx.data.media === null;
    const m = none ? null : mediaOf(ctx, { playing: ctx.stateName !== 'paused' });
    const playing = m ? (m.live ? !!m.playing : ctx.stateName !== 'paused') : false;
    return infobar(ctx, k, (p, F) => {
      const art = p.h - 14;
      if (m) coverArt(p, { x: F.x0 - 2, y: 7, size: art, title: m.title, artist: m.artist, radius: 4 });
      const x = F.x0 - 2 + art + 9;
      const ls = px(p, 'label', 13), cs = px(p, 'caption', 10.5);
      const tail = playing ? 22 : 4;
      const rem = m && ctx.params.showTime && m.duration ? `–${mmss(m.duration - m.position)}` : '';
      p.label(m ? m.title : 'Nothing playing', { align: 'left', x, y: F.cy - 2, size: ls, maxWidth: F.x1 - x - tail });
      if (m) p.caption(m.artist + (rem ? `  ${rem}` : ''), { align: 'left', x, y: F.cy + capHeight(cs) + 4, size: cs, color: 'muted', maxWidth: F.x1 - x - 2 });
      if (playing) {
        const lv = audioOf(ctx).levels.slice(-9), bw = 3, gap = 2.5, bx = F.x1 - bw * 3 - gap * 2, bh = capHeight(ls) * 1.2;
        let d = '';
        [lv[2], lv[5], lv[8]].forEach((v, i) => { const hh = Math.max(bw, bh * (0.3 + 0.7 * clamp(v ?? 0.5))); d += roundRectPath(bx + i * (bw + gap), F.cy - 2 - hh, bw, hh, bw / 2); });
        p.add(path(d, { fill: p.ctx.tint }));
      }
      if (m && m.duration) {
        const f = clamp(m.position / m.duration), y = p.h - 6.5, w = F.x1 - x;
        p.add(rect({ x, y, width: w, height: 1.5, fill: p.colors.line }));
        p.add(rect({ x, y: y - 0.5, width: Math.max(2, w * f), height: 2.5, rx: 1.25, fill: p.ctx.tint }));
      }
    });
  },
};
