// strip-rundown — a show rundown across the whole Stream Deck + touch strip (+ XL: 1200 px). The
// chapters (name:minutes, …) are blocks on a timeline; a beam of white light is the playhead and the
// part of the show already done is lit. Above, each dial owns a readout: what's on now, the time
// left in it (amber with "+0:42" once it overruns), what's next, and the whole show's clock.
// Tap a chapter on the strip to jump to it (touch: segment-local taps, mapped strip-wide by the
// runtime); turn dial 1 to scrub; hold the strip to go back to the top. The show runs from the
// latest of those (or from when the strip appeared). Drawn per segment; ≈ 1 segment update a second.

import { surface, rect, path, n, P, linearGradient, url } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, mmss } from '../apps/_d7-kit.js';
import { panelInto } from '../screens/_d5-kit.js';

const SEG = 200;

function chaptersOf(spec) {
  const list = String(spec || '').split(',').map((s) => s.split(':')).map(([a, b]) => ({ name: (a || '').trim(), min: Math.max(0.5, +b || 0) })).filter((c) => c.name);
  return list.length ? list : [{ name: 'Intro', min: 3 }, { name: 'News', min: 9 }, { name: 'Guest', min: 18 }, { name: 'Q&A', min: 10 }, { name: 'Outro', min: 3 }];
}

export default {
  id: 'strip-rundown',
  title: 'Show Rundown',
  category: 'Strip Panoramas',
  description: 'Your show’s chapters across the touch strip: tap one to jump, turn dial 1 to scrub. Each dial reads out now, time left, next and the show clock.',
  tags: ['rundown', 'chapters', 'show', 'podcast', 'stream', 'streaming', 'broadcast', 'agenda', 'timeline', 'touch strip', 'markers', 'presentation'],
  surface: 'strip',
  segments: 'all',
  fps: 4,
  loop: 12,
  press: 'momentary',
  params: {
    chapters: { type: 'text', default: 'Intro:3,News:9,Guest:18,Q&A:10,Outro:3', maxLength: 72, label: 'Chapters (name:minutes, …)' },
    value: { type: 'number', default: 0, min: 0, max: 1, step: 0.001, label: 'Position (dial 1)' },
    step: { type: 'number', default: 0.005, min: 0.001, max: 0.05, step: 0.001, label: 'Scrub per detent' },
    hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
  },
  order: 32,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, T = ctx.theme;
    const ch = chaptersOf(ctx.params.chapters);
    const total = ch.reduce((a, c) => a + c.min * 60, 0);
    let acc = 0;
    for (const c of ch) { c.a = acc; acc += c.min * 60; c.b = acc; }
    const x0 = 10, x1 = w - 10, span = x1 - x0;
    const xOf = (sec) => x0 + (span * clamp(sec / total));
    // where the show is: the latest of a tap, a turn, or the strip's arrival
    const T0 = ctx.touch, ta = T0 ? T0.age : Infinity, tt = ctx.turnAge;
    // a tap pins the show to that chapter (its time can overrun); a turn scrubs; otherwise it follows the plan
    let pos, cur, inCh;
    if (T0 && ta <= tt) {
      if (T0.hold) { pos = ta; cur = null; }
      else { const sec = clamp((T0.x - x0) / span) * total; cur = ch.find((q) => sec < q.b) || ch[ch.length - 1]; inCh = ta; pos = cur.a + Math.min(ta, cur.b - cur.a); }
    } else if (Number.isFinite(tt)) pos = clamp(ctx.value) * total + tt;
    else pos = ctx.reduced ? total * 0.38 : ctx.since;
    pos = Math.floor(Math.min(pos, total + 3599));      // whole seconds: the readouts tick once a second, nothing in between
    if (!cur) { cur = ch.find((q) => pos < q.b) || ch[ch.length - 1]; inCh = pos - cur.a; }
    const ci = ch.indexOf(cur);
    const over = pos >= total && ci === ch.length - 1 && inCh >= cur.b - cur.a;
    const left = (cur.b - cur.a) - inCh;
    const next = ch[ci + 1];
    const segs = ctx.strip?.segments || Math.round(w / SEG);
    const hueOf = (i) => ctx.hue + (i % 2 ? 26 : -18) + i * 9;
    const head = Math.round(xOf(pos) * 2) / 2;          // half-pixel steps: the playhead's segment re-sends only when it visibly moves
    const laneY = 58, laneH = 30;
    for (let sgi = 0; sgi < segs; sgi++) {
      const sx = sgi * SEG;
      panelInto(k, { x: sx, y: 0, w: SEG, h }, (p) => {
        p.background({ tone: 'idle' });
        // the readout for this dial
        const L = (str, o = {}) => text(p, str, { x: 10, y: 20, size: 9.5, weight: 600, caps: true, tracking: 0.1, anchor: 'start', color: 'muted', maxWidth: SEG - 20, ...o });
        const V = (str, o = {}) => text(p, str, { x: 10, y: 44, size: 20, weight: 700, anchor: 'start', color: 'ink', maxWidth: SEG - 20, ...o });
        const which = ['now', 'left', 'next', 'show', 'start', 'ends'][sgi] || 'blank';
        if (which === 'now') { L(over ? 'Show' : `Now · ${ci + 1}/${ch.length}`); V(over ? 'Wrapped' : cur.name, { color: over ? 'pos' : 'ink' }); }
        else if (which === 'left') { const run = left < 0; L(run ? 'Over' : 'Left'); V(run ? `+${mmss(-left)}` : mmss(left), { color: run ? C.warn : 'ink' }); }
        else if (which === 'next') { L('Next'); V(next ? next.name : '—', { color: next ? 'ink' : 'dim' }); if (next) text(p, `${next.min} min`, { x: SEG - 10, y: 20, size: 9.5, weight: 600, anchor: 'end', color: 'dim' }); }
        else if (which === 'show') { L('Show'); V(`${mmss(Math.min(pos, total))}`, { size: 18 }); text(p, `/ ${mmss(total)}`, { x: SEG - 10, y: 44, size: 11, weight: 600, anchor: 'end', color: 'dim' }); }
        else if (which === 'start') { L('Chapters'); V(`${ch.length}`); }
        else if (which === 'ends') { L('Remaining'); V(mmss(Math.max(0, total - pos))); }
        // the lane: chapter blocks clipped to this segment, the done part lit, the playhead
        const lx0 = Math.max(x0, sx) - sx, lx1 = Math.min(x1, sx + SEG) - sx;
        let dim = '';
        ch.forEach((c, i) => {
          const a = xOf(c.a) - sx + (i ? 1.2 : 0), b = xOf(c.b) - sx - (i < ch.length - 1 ? 1.2 : 0);
          const aa = Math.max(a, lx0), bb = Math.min(b, lx1);
          if (bb - aa < 0.5) return;
          const col = T.spectral(hueOf(i));
          const done = clamp((head - sx - aa) / (bb - aa));
          dim += `M${n(aa)} ${laneY}h${n(bb - aa)}v${laneH}h${n(-(bb - aa))}Z`;
          if (done > 0) p.add(rect({ x: n(aa), y: laneY, width: n((bb - aa) * done), height: laneH, fill: col, fillOpacity: i === ci && !over ? 0.55 : 0.32 }));
          if (i === ci && !over) {
            // the current chapter's outline: top and bottom everywhere, the ends only where they are (no seams at the bezels)
            let o = `M${n(aa)} ${laneY + 0.7}H${n(bb)}M${n(aa)} ${laneY + laneH - 0.7}H${n(bb)}`;
            if (a >= lx0 - 0.5) o += `M${n(a + 0.7)} ${laneY}V${laneY + laneH}`;
            if (b <= lx1 + 0.5) o += `M${n(b - 0.7)} ${laneY}V${laneY + laneH}`;
            p.add(path(o, { fill: 'none', stroke: left < 0 ? C.warn : col, strokeWidth: 1.4 }));
          }
          // the chapter name where its block starts (only in the segment holding the start)
          if (a >= lx0 - 0.5 && a < lx1 - 18) text(p, c.name, { x: a + 5, y: laneY + laneH / 2 + 4, size: 11, weight: 600, anchor: 'start', color: i === ci && !over ? 'ink' : 'muted', maxWidth: Math.min(b, lx1) - a - 8, minSize: 8 });
        });
        if (dim) p.add(path(dim, { fill: C.line, fillOpacity: p.dark ? 0.55 : 0.6 }));
        // chapter boundary ticks
        let tk = '';
        ch.forEach((c) => { const x = xOf(c.a) - sx; if (x > lx0 + 0.5 && x < lx1) tk += `M${n(x)} ${laneY - 5}v${laneH + 10}`; });
        if (tk) p.add(path(tk, { stroke: C.dim, strokeWidth: 1, fill: 'none' }));
        // the playhead: a beam of white light
        const hx = head - sx;
        if (hx >= -4 && hx <= SEG + 4) {
          const ink = p.dark ? '#ffffff' : C.ink;
          p.add(rect({ x: n(hx - 4), y: laneY - 8, width: 8, height: laneH + 16, rx: 4, fill: ink, fillOpacity: 0.12 }));
          p.add(rect({ x: n(hx - 1), y: laneY - 8, width: 2, height: laneH + 16, rx: 1, fill: ink }));
        }
      }, { kind: 'strip', tag: `r${sgi}`, hue: ctx.hue });
    }
    void P; void linearGradient; void url; void mix;
    return k.svg();
  },
};
