// screen-galleon-weather — the Galleon 100 SD screen as a weather station: now (a pictogram and the
// temperature), today's range against the current temperature, the next six hours, and the sun's
// arc with the wind. Pictograms are drawn on the glyph grid with roles, so every theme paints them.
//
// ctx.data.weather — see _d5-weather.js (metric; WMO codes or words). Simulated when absent: a
// fictional place called Lakeside with a plausible day that changes with the date.

import { surface, path, circle, n, url, linearGradient, rect } from '../../scene/index.js';
import { capHeight, measureText } from '../../scene/text.js';
import { galleon, header, stat, pictogram, hhmm, localParts, HUE, GALLEON_PARAMS, DAYS, MONTHS, clamp, lerp } from './_d5-kit.js';
import { weatherOf, drawWeather, KIND_HUE, kindOf, hourOf, isNight, toF, compass } from './_d5-weather.js';

export default {
  id: 'screen-galleon-weather',
  title: 'Galleon Weather Station',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen as a weather station: conditions now, today’s range against the current temperature, the next six hours, and sun and wind.',
  tags: ['galleon', 'corsair', 'screen', 'weather', 'forecast', 'temperature', 'wind', 'sun', 'dashboard'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['weather', 'clock'],
  dataShape: {
    weather: '{ temp °C, code (WMO 4677 | clear|partly|cloudy|fog|drizzle|rain|snow|storm), label?, hi?, lo?, feels?, humidity? 0–1, wind? { speed km/h, dir ° }, precip? 0–1, uv?, sunrise?, sunset? epoch ms, place?, hourly?: [{ at | h, temp, code, precip? }] }',
  },
  fps: 2,
  loop: 12,
  params: {
    ...GALLEON_PARAMS,
    units: { type: 'select', default: 'metric', options: ['metric', 'imperial'], label: 'Units' },
    place: { type: 'text', default: '', maxLength: 18, label: 'Place name (overrides the source)' },
    hour12: { type: 'bool', default: false, label: '12-hour times' },
  },
  order: 23,
  render(ctx) {
    const scr = surface(ctx);
    const w = weatherOf(ctx), night = isNight(ctx, w);
    const imp = ctx.params.units === 'imperial';
    const deg = (c) => (Number.isFinite(c) ? `${imp ? toF(c) : Math.round(c)}°` : '—');
    const time = (ms) => { const t = localParts(ctx, ms); return hhmm(t.h, t.m, ctx.params.hour12); };
    const c = ctx.clock;
    const hueOf = (kind) => (night && (kind === 'clear' || kind === 'partly') ? KIND_HUE.night : KIND_HUE[kind] ?? HUE.azure);

    const now = (p, W) => {
      header(p, W, ctx.params.place || w.place || 'Now', Number.isFinite(w.feels) ? [`feels ${deg(w.feels)}`, deg(w.feels)] : '');
      const gs = Math.round(p.h * 0.62);
      pictogram(p, (g, s) => drawWeather(g, w.kind, { night, t: s.t }), { x: W.x0 - gs * 0.1, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.5 + W.u, size: gs, hue: hueOf(w.kind), tag: 'now' });
      const hero = p.typeStyle('hero'), base = Math.round(p.h * 0.62);
      p.hero(deg(w.temp), { align: 'right', x: W.x1 + hero.size * 0.06, cy: base - capHeight(hero.size, hero.weight) / 2, size: hero.size * 1.1, maxWidth: W.w - gs * 0.9 });
      p.caption(w.label, { align: 'right', x: W.x1, y: W.footY, color: 'muted', maxWidth: W.w - gs * 0.8 });
    };

    const today = (p, W) => {
      header(p, W, 'Today', `${DAYS[c.dow]} ${c.day} ${MONTHS[c.month - 1]}`);
      const cs = p.typeStyle('caption');
      const base = Math.round(p.h * 0.6);
      const lo = Number.isFinite(w.lo) ? w.lo : w.temp - 4, hi = Number.isFinite(w.hi) ? w.hi : w.temp + 4;
      const s1 = stat(p, { role: 'value', value: deg(hi), xl: W.x0 + Math.round(cs.size * 0.9), base });
      p.caption('↑', { align: 'left', x: W.x0, y: base, color: 'muted' });
      p.caption('↓', { align: 'left', x: s1.right + W.u * 5, y: base, color: 'muted' });
      const s2 = stat(p, { role: 'value', value: deg(lo), xl: s1.right + W.u * 5 + Math.round(cs.size * 0.9), base, color: 'muted' });
      if (Number.isFinite(w.precip)) {
        // the chance of rain, if it fits beside the range (it is also in the hourly widget's label)
        const txt = `${Math.round(clamp(w.precip) * 100)}%`, tw = measureText(txt, { size: cs.size, weight: cs.weight }), ps = Math.round(cs.size * 1.5);
        const room = W.x1 - s2.right - W.u * 4;
        if (room >= tw + ps) {
          p.caption(txt, { align: 'right', x: W.x1, y: base, color: 'muted' });
          pictogram(p, (g) => g.path('M24 9C24 9 13 22 13 29.5a11 11 0 0 0 22 0C35 22 24 9 24 9Z', { role: 'accent', fill: true }), { x: W.x1 - tw - ps * 0.95, y: base - ps * 0.82, size: ps, hue: HUE.azure, tag: 'drop' });
        }
      }
      // the range bar: lo → hi on a cool → warm ramp, the current temperature as a ringed dot
      const span = Math.max(4, hi - lo), x0 = W.x0, ww = W.w, bh = Math.max(7, Math.round(W.u * 2.8)), by = W.footY - bh;
      const id = p.id('range');
      p.def(linearGradient(id, [[0, p.theme.spectral(HUE.cerulean)], [0.5, p.theme.spectral(HUE.lime)], [1, p.theme.spectral(HUE.coral)]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      p.add(rect({ x: x0, y: by, width: ww, height: bh, rx: bh / 2, fill: url(id) }));
      const f = clamp((w.temp - lo) / span), dx = x0 + bh / 2 + f * (ww - bh);
      p.add(circle({ cx: dx, cy: by + bh / 2, r: bh * 1.15, fill: p.colors.surface }) + circle({ cx: dx, cy: by + bh / 2, r: bh * 0.78, fill: p.colors.ink }));
    };

    const hourly = (p, W) => {
      const hrs = (w.hourly || []).slice(0, 6);
      header(p, W, 'Hourly', Number.isFinite(w.precip) ? `rain ${Math.round(clamp(w.precip) * 100)}%` : '');
      if (!hrs.length) { p.caption('No forecast', { align: 'left', x: W.x0, y: p.h * 0.6, color: 'muted' }); return; }
      const cw = W.w / hrs.length, cs = p.typeStyle('caption'), lab = p.typeStyle('label');
      const hourBase = W.eyebrowY + Math.round(W.pad * 0.6) + capHeight(cs.size, cs.weight) + W.u * 2;
      const gs = Math.min(cw * 0.86, (W.footY - capHeight(lab.size, lab.weight) - hourBase) * 0.98);
      hrs.forEach((e, i) => {
        const cx = W.x0 + cw * (i + 0.5), hr = hourOf(ctx, e);
        p.caption(ctx.params.hour12 ? `${((hr + 11) % 12) + 1}${hr < 12 ? 'a' : 'p'}` : `${hr}`, { x: cx, y: hourBase, color: 'dim' });
        const k = kindOf(e.code ?? 'cloudy'), nightAt = hr < 6 || hr >= 20;
        pictogram(p, (g) => drawWeather(g, k, { night: nightAt }), { x: cx - gs / 2, y: hourBase + W.u * 1.5, size: gs, hue: nightAt && (k === 'clear' || k === 'partly') ? KIND_HUE.night : KIND_HUE[k], tag: `h${i}` });
        p.label(deg(e.temp), { x: cx, y: W.footY, maxWidth: cw * 0.78, size: Math.min(lab.size, cw * 0.4) });
      });
    };

    const sun = (p, W) => {
      const rise = Number.isFinite(w.sunrise) ? w.sunrise : null, set = Number.isFinite(w.sunset) ? w.sunset : null;
      header(p, W, night ? 'Night' : 'Sun', set && !night ? `sets ${time(set)}` : rise ? `rises ${time(rise)}` : '');
      // the arc: horizon line, the day's path, the sun where it is now
      const aw = W.w * 0.52, cx = W.x0 + aw / 2, r = aw / 2 - W.u * 2, hy = W.footY - W.u * 2;
      p.add(path(`M${n(W.x0)} ${n(hy)}H${n(W.x0 + aw)}`, { stroke: p.colors.line, strokeWidth: n(Math.max(1.5, W.u * 0.6)) }));
      const ry = Math.min(r, hy - W.eyebrowY - W.pad * 0.9);
      const pathD = (f0, f1) => { let d = ''; for (let i = 0; i <= 24; i++) { const f = lerp(f0, f1, i / 24), x = cx - r * Math.cos(Math.PI * f), y = hy - ry * Math.sin(Math.PI * f); d += `${i ? 'L' : 'M'}${n(x)} ${n(y)}`; } return d; };
      p.add(path(pathD(0, 1), { fill: 'none', stroke: p.colors.line, strokeWidth: n(Math.max(1.5, W.u * 0.7)), strokeDasharray: `${n(W.u * 1.5)} ${n(W.u * 1.8)}` }));
      if (rise && set && set > rise) {
        const f = clamp((ctx.now - rise) / (set - rise));
        if (f > 0 && f < 1) p.add(path(pathD(0, f), { fill: 'none', stroke: p.ctx.tint, strokeWidth: n(Math.max(2, W.u * 1)), strokeLinecap: 'round' }));
        const x = cx - r * Math.cos(Math.PI * f), y = hy - ry * Math.sin(Math.PI * f);
        p.add(circle({ cx: x, cy: y, r: W.u * 3.6, fill: p.colors.surface }) + circle({ cx: x, cy: y, r: W.u * 2.6, fill: night ? p.colors.dim : p.ctx.tint }));
      }
      // wind: an arrow pointing where the wind blows, its speed, and the compass point it comes from
      const wd = w.wind;
      const wx = W.x0 + aw + (W.x1 - W.x0 - aw) / 2, wy = W.eyebrowY + (W.footY - W.eyebrowY) * 0.42, wr = Math.min((W.x1 - W.x0 - aw) / 2 - W.u * 2, (W.footY - W.eyebrowY) * 0.3);
      p.add(circle({ cx: wx, cy: wy, r: wr, fill: 'none', stroke: p.colors.line, strokeWidth: n(Math.max(1.5, W.u * 0.6)) }));
      if (wd && Number.isFinite(wd.dir)) {
        const a = ((wd.dir + 180) * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux, L = wr * 0.92;
        const tip = [wx + ux * L, wy + uy * L], tail = [wx - ux * L * 0.75, wy - uy * L * 0.75], hw = wr * 0.32;
        p.add(path(`M${n(tail[0])} ${n(tail[1])}L${n(tip[0] - ux * hw)} ${n(tip[1] - uy * hw)}`, { stroke: p.colors.ink, strokeWidth: n(Math.max(2, W.u * 1)), strokeLinecap: 'round' }));
        p.add(path(`M${n(tip[0])} ${n(tip[1])}L${n(tip[0] - ux * hw * 1.6 + px * hw)} ${n(tip[1] - uy * hw * 1.6 + py * hw)}L${n(tip[0] - ux * hw * 1.6 - px * hw)} ${n(tip[1] - uy * hw * 1.6 - py * hw)}Z`, { fill: p.colors.ink }));
      }
      const spd = wd && Number.isFinite(wd.speed) ? (imp ? Math.round(wd.speed * 0.621) : Math.round(wd.speed)) : null;
      p.caption(spd === null ? '—' : `${spd} ${imp ? 'mph' : 'km/h'}${wd && Number.isFinite(wd.dir) ? ` ${compass(wd.dir)}` : ''}`, { x: wx, y: W.footY, color: 'muted', maxWidth: W.x1 - W.x0 - aw });
    };

    return galleon(ctx, scr, [[now, today], [hourly, sun]], { hues: [[hueOf(w.kind), HUE.coral], [HUE.azure, night ? HUE.periwinkle : HUE.amber]] });
  },
};
