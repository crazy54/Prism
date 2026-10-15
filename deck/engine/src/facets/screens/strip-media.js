// screen-strip-media — the Stream Deck + touch strip as a music console, one dial per job: the track
// (generated cover art, title, artist — press plays / pauses), seek, volume, and the output spectrum
// (the + XL adds what's up next and the output level). Each 200 × 100 segment is its own theme panel.
//
// ctx.data (optional; a fictional playlist otherwise):
//   media { title, artist, position s, duration s, playing, volume? 0–1, muted?, next?: { title, artist } }
//   spectrum { bands: number[] 0–1 } · audio { level 0–1, levels }   media: null = nothing playing

import { surface, path, roundRectPath } from '../../scene/index.js';
import { capHeight, wrapText } from '../../scene/text.js';
import { mediaOf, spectrumOf, audioOf } from '../apps/_data.js';
import { PLAYLIST } from '../apps/_sim.js';
import { strip, stripHeader, stat, meter, segmented, coverArt, mmss, px, HUE, clamp, lerp } from './_d5-kit.js';

export default {
  id: 'screen-strip-media',
  title: 'Strip Music Console',
  category: 'Strip Dashboards',
  description: 'The Stream Deck + touch strip as a music console, one dial per job: the track with generated cover art, seek, volume and the output spectrum.',
  tags: ['plus', 'plus xl', 'strip', 'touch strip', 'media', 'music', 'now playing', 'volume', 'spectrum', 'dashboard'],
  surface: 'strip',
  segments: 'all',
  data: ['media', 'spectrum', 'audio'],
  dataShape: { media: '{ title, artist, position s, duration s, playing, volume? 0–1, muted?, next?: { title, artist } }', spectrum: '{ bands: number[] }', audio: '{ level, levels }' },
  states: ['playing', 'paused'],
  press: 'toggle',
  fps: 10,
  loop: 16,
  params: { volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (when no source sends one)' } },
  order: 31,
  render(ctx) {
    const none = ctx.data && Object.hasOwn(ctx.data, 'media') && ctx.data.media === null;
    const m = none ? null : mediaOf(ctx, { playing: ctx.stateName !== 'paused' });
    const playing = m ? (m.live ? !!m.playing : ctx.stateName !== 'paused') : false;
    const vol = clamp(typeof m?.volume === 'number' ? m.volume : ctx.params.volume), muted = !!m?.muted;
    const base = (p) => Math.round(p.h * 0.66);

    const track = (p, F) => {
      const art = p.h - F.pad * 2;
      if (m) coverArt(p, { x: F.x0, y: F.pad, size: art, title: m.title, artist: m.artist, radius: 6 });
      const x = F.x0 + art + 10, room = F.x1 - x;
      const ls = px(p, 'label', 15), cs = px(p, 'caption', 12.5), lab = p.typeStyle('label', { size: ls });
      // the title takes up to two lines from the top; the artist sits on the bottom line
      const wr = wrapText(m ? m.title : 'Nothing playing', { maxWidth: room, size: ls, minSize: ls * 0.85, maxLines: 2, weight: lab.weight, tracking: lab.tracking, caps: lab.caps });
      let y = F.pad + capHeight(wr.size, lab.weight) + 1;
      for (const line of wr.lines) { p.label(line, { align: 'left', x, y, size: wr.size, maxWidth: room }); y += wr.lineHeight; }
      if (m) p.caption(m.artist, { align: 'left', x, y: F.footY, size: cs, color: 'muted', maxWidth: room });
    };
    const seek = (p, F) => {
      const dur = m?.duration || 0, pos = m ? clamp(m.position / (dur || 1)) * dur : 0;
      stripHeader(p, F, 'Seek', m ? `–${mmss(dur - pos)}` : '');
      const vs = px(p, 'value', 22) * 1.05;
      p.value(mmss(pos), { align: 'left', x: F.x0, cy: base(p) - capHeight(vs) / 2, size: vs, maxWidth: F.w * 0.7 });
      const gs = Math.round(capHeight(vs) * 1.45);
      p.glyph('play-pause', { state: playing ? 'playing' : 'paused', box: { x: F.x1 - gs * 0.9, y: base(p) - capHeight(vs) / 2 - gs / 2, size: gs } });
      meter(p, { x: F.x0, y: F.footY - 4, w: F.w, h: 5, value: dur ? pos / dur : 0, marker: true });
    };
    const volume = (p, F) => {
      stripHeader(p, F, 'Volume', muted ? 'muted' : '');
      stat(p, { role: 'value', value: Math.round(vol * 100), unit: '%', xl: F.x0, base: base(p), size: px(p, 'value', 22) * 1.05, unitScale: 0.45, color: muted ? 'dim' : undefined });
      segmented(p, { x: F.x0, y: F.footY - 6, w: F.w, h: 6, value: vol, count: 16, color: muted ? p.colors.dim : p.ctx.tint });
    };
    const spectrum = (p, F) => {
      const spec = spectrumOf(ctx, 16);
      stripHeader(p, F, 'Output', '');
      const top = F.eyebrowY + 8, bot = F.footY, hh = bot - top, k = spec.bands.length, gap = 2.5, bw = (F.w - gap * (k - 1)) / k;
      spec.bands.forEach((v, i) => {
        const bh = Math.max(2, hh * clamp(v));
        p.add(path(roundRectPath(F.x0 + i * (bw + gap), bot - bh, bw, bh, [Math.min(bw / 2, 2), Math.min(bw / 2, 2), 0, 0]), { fill: p.theme.spectral(lerp(HUE.violet, HUE.amber, i / (k - 1))) }));
      });
    };
    const next = (p, F) => {
      const n = m?.next || (m && !m.live ? PLAYLIST[((m.index ?? 0) + 1) % PLAYLIST.length] : null);
      stripHeader(p, F, 'Up next', '');
      const ls = px(p, 'label', 15), cs = px(p, 'caption', 12.5);
      p.label(n ? n.title : '—', { align: 'left', x: F.x0, y: F.eyebrowY + 10 + capHeight(ls), size: ls, maxWidth: F.w });
      if (n?.artist) p.caption(n.artist, { align: 'left', x: F.x0, y: F.footY, size: cs, color: 'muted', maxWidth: F.w });
    };
    const level = (p, F) => {
      const a = audioOf(ctx), db = a.level > 0.001 ? 20 * Math.log10(a.level) : -60;
      stripHeader(p, F, 'Level', db > -0.05 ? '0 dB' : `–${Math.abs(db).toFixed(1)} dB`);
      const L = clamp(a.level), R = clamp(a.levels[a.levels.length - 2] ?? a.level);
      segmented(p, { x: F.x0, y: base(p) - 16, w: F.w, h: 7, value: L, count: 20, color: p.ctx.tint });
      segmented(p, { x: F.x0, y: base(p) - 4, w: F.w, h: 7, value: R, count: 20, color: p.ctx.tint });
      p.caption('L  R', { align: 'left', x: F.x0, y: F.footY, size: px(p, 'caption', 12), color: 'dim' });
    };
    return strip(ctx, surface(ctx), [track, seek, volume, spectrum, next, level], { hues: [HUE.violet, HUE.azure, HUE.citrine, HUE.cyan, HUE.periwinkle, HUE.mint] });
  },
};
