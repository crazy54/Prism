// screen-galleon-media — the Galleon 100 SD screen as a music console. The four widgets map to
// what the dials do: left dial = the track (top: now playing, press plays / pauses; bottom: seek),
// right dial = sound (top: volume — the Galleon's default for that dial; bottom: the output spectrum).
//
// ctx.data (all optional — anything missing is simulated with a fictional playlist):
//   media     { title, artist, album?, position (s), duration (s), playing (bool), volume? (0–1), muted? (bool),
//               index? (0-based track number), count? (tracks in the queue) }
//   spectrum  { bands: number[] (0–1, low → high), peaks?: number[] }
//   audio     { level: 0–1, levels: number[] } — used for the peak readout when spectrum is absent
// A live source sending `media: null` shows "Nothing playing".

import { surface } from '../../scene/index.js';
import { wrapText, capHeight } from '../../scene/text.js';
import { mediaOf, spectrumOf, audioOf } from '../apps/_data.js';
import { galleon, header, meter, coverArt, mmss, HUE, GALLEON_PARAMS, clamp, lerp } from './_d5-kit.js';
import { volume } from './_d5-widgets.js';
import { path, n, roundRectPath } from '../../scene/svg.js';

export default {
  id: 'screen-galleon-media',
  title: 'Galleon Music Console',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen as a music console: now playing with generated cover art, seek, volume on the right dial and a live output spectrum.',
  tags: ['galleon', 'corsair', 'screen', 'media', 'music', 'now playing', 'volume', 'spectrum', 'dashboard'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['media', 'spectrum', 'audio'],
  dataShape: {
    media: '{ title, artist, album?, position s, duration s, playing, volume? 0–1, muted?, index?, count? }',
    spectrum: '{ bands: number[] 0–1 low→high, peaks? }',
    audio: '{ level 0–1, levels: number[] }',
  },
  states: ['playing', 'paused'],
  press: 'toggle',
  fps: 10,
  loop: 16,
  params: {
    ...GALLEON_PARAMS,
    volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (when no source sends one)' },
  },
  order: 20,
  render(ctx) {
    const scr = surface(ctx);
    const live = ctx.data && Object.hasOwn(ctx.data, 'media');
    const m = live && ctx.data.media === null ? null : mediaOf(ctx, { playing: ctx.stateName !== 'paused' });
    const playing = m ? (m.live ? !!m.playing : ctx.stateName !== 'paused') : false;
    const vol = clamp(typeof m?.volume === 'number' ? m.volume : ctx.params.volume);
    const muted = !!m?.muted;
    const count = m?.count ?? 5, index = (m?.index ?? 0) + 1;

    const nowPlaying = (p, W) => {
      const art = p.h - W.pad * 2;
      if (m) coverArt(p, { x: W.x0, y: W.pad, size: art, title: m.title, artist: m.artist });
      else p.add(path(roundRectPath(W.x0, W.pad, art, art, art * 0.08), { fill: p.colors.line, fillOpacity: 0.5 }));
      const x = W.x0 + art + Math.round(W.pad * 0.85), room = W.x1 - x;
      const eb = p.typeStyle('eyebrow');
      const bw = Math.max(3, W.u * 1.3), gap = bw * 0.8, barsW = playing ? bw * 3 + gap * 2 + W.u * 2 : 0;
      p.eyebrow(m ? (playing ? 'Playing' : 'Paused') : 'Idle', { x, y: W.eyebrowY, maxWidth: room - barsW });
      if (playing) {
        // three bouncing bars: the play state at a glance
        const lv = audioOf(ctx).levels.slice(-9);
        const bx = W.x1 - bw * 3 - gap * 2, bh = capHeight(eb.size, eb.weight) * 1.15;
        let d = '';
        [lv[2], lv[5], lv[8]].forEach((v, i) => { const hh = Math.max(bw, bh * (0.3 + 0.7 * clamp(v ?? 0.5))); d += roundRectPath(bx + i * (bw + gap), W.eyebrowY - hh, bw, hh, bw / 2); });
        p.add(path(d, { fill: p.ctx.tint }));
      }
      // title (≤ 2 lines), then the artist, then the album if it still fits above the art's bottom edge
      const lab = p.typeStyle('label'), cs = p.typeStyle('caption');
      const title = m ? m.title : 'Nothing playing';
      const wr = wrapText(title, { maxWidth: room, size: lab.size, minSize: lab.size * 0.8, maxLines: 2, weight: lab.weight, tracking: lab.tracking, caps: lab.caps });
      let y = W.eyebrowY + Math.round(W.pad * 0.75) + capHeight(wr.size, lab.weight);
      for (const line of wr.lines) { p.label(line, { align: 'left', x, y, size: wr.size, maxWidth: room }); y += wr.lineHeight; }
      const step = capHeight(cs.size, cs.weight) + Math.round(W.u * 3.2), bottom = W.pad + art;
      y += Math.round(W.u * 1.5) - wr.lineHeight + step;
      if (m?.artist && y <= bottom) { p.caption(m.artist, { align: 'left', x, y, maxWidth: room, color: 'muted' }); y += step; }
      if (m?.album && y <= bottom) p.caption(m.album, { align: 'left', x, y, maxWidth: room, color: 'dim' });
    };

    const seek = (p, W) => {
      const dur = m?.duration || 0, pos = m ? clamp(m.position / (dur || 1)) * dur : 0;
      header(p, W, m && (!m.live || (m.index !== undefined && m.count)) ? `Track ${index} of ${count}` : 'Track', m ? `–${mmss(dur - pos)}` : '');
      const base = Math.round(p.h * 0.6);
      const hero = p.typeStyle('hero'), cap = capHeight(hero.size, hero.weight);
      p.hero(mmss(pos), { align: 'left', x: W.x0, cy: base - cap / 2, maxWidth: W.w * 0.66 });
      const bh = Math.max(6, Math.round(W.u * 2.6));
      meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: dur ? pos / dur : 0, marker: true });
      // the left dial's press: play / pause, drawn as the transport glyph beside the time
      const gs = Math.round(cap * 1.5);
      p.glyph('play-pause', { state: playing ? 'playing' : 'paused', box: { x: W.x1 - gs * 0.86, y: base - cap / 2 - gs / 2, size: gs } });
    };

    const output = (p, W) => {
      const spec = spectrumOf(ctx, 24);
      const lvl = audioOf(ctx).level;
      const db = lvl > 0.001 ? 20 * Math.log10(lvl) : -60;
      header(p, W, 'Output', db > -0.05 ? '0 dB' : `–${Math.abs(db).toFixed(1)} dB`);
      const top = W.eyebrowY + Math.round(W.pad * 0.7), bot = W.footY, hh = bot - top;
      const k = spec.bands.length, gap = Math.max(2, W.w / k * 0.26), bw = (W.w - gap * (k - 1)) / k;
      const T = p.theme;
      let caps = '';
      spec.bands.forEach((v, i) => {
        const bhh = Math.max(bw * 0.6, hh * clamp(v));
        const hue = lerp(HUE.violet, HUE.amber, i / (k - 1));
        p.add(path(roundRectPath(W.x0 + i * (bw + gap), bot - bhh, bw, bhh, [Math.min(bw / 2, 3), Math.min(bw / 2, 3), 0, 0]), { fill: T.spectral(hue) }));
        const pk = bot - hh * clamp(spec.peaks[i]);
        caps += `M${n(W.x0 + i * (bw + gap))} ${n(pk - 2)}h${n(bw)}v${n(Math.max(2, W.u * 0.9))}h${n(-bw)}Z`;
      });
      p.add(path(caps, { fill: p.colors.ink, fillOpacity: 0.7 }));
    };

    return galleon(ctx, scr, [[nowPlaying, volume(ctx, { value: vol, muted })], [seek, output]], { hues: [[HUE.violet, HUE.citrine], [HUE.azure, HUE.cyan]] });
  },
};
