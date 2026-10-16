// span-power-on — First Light for the deck itself: the boot sequence a plugin plays when it
// starts. Every key is dark. A single beam of white light enters at the top-left key, crosses
// the deck behind the bezels and strikes a glass prism in the middle key; the prism flares
// and the Spectrum fans out from it, reaching the keys one by one — each flashes in the color
// that lands on it, then settles into its own face (glyph and label in the theme's material).
// The prism key settles last, into a power key. Then it holds, perfectly still.
//
// Slow on purpose: only the keys the beam or the wavefront is in change (≈ 3 at a time), so
// the sequence runs at up to 8 fps inside the device budget on every deck, XL included.
// `replay` loops it (for the catalog); off, it plays once and holds — what a plugin wants.

import { surface, keyInto, radialGradient, linearGradient, url } from '../../scene/index.js';
import { clamp, smoothstep, outExpo, outCubic, lerp } from '../../scene/easing.js';
import { BUDGET, frameClock, Batch, strokeP, fillP, polyD, rectD, f1 } from './_d6-wall.js';

const AXIS = 12 * Math.PI / 180;   // the dispersed fan's center line: just below the horizontal, toward the prism's base
const FACES = ['mic', 'camera', 'volume', 'play-pause', 'scene', 'chat', 'record', 'broadcast', 'bulb', 'timer', 'home', 'lock', 'music-note', 'headphones', 'mail', 'calendar', 'cpu', 'wifi', 'folder', 'search', 'note', 'coffee', 'stopwatch', 'skip-next', 'shuffle', 'terminal', 'code', 'rocket', 'cloud', 'sync', 'target', 'marker', 'mixer', 'viewers', 'alarm', 'fan'];
const BEAM_IN = 0.8, STRIKE = 2.6, FAN = 3.0, SETTLE = 0.9;

export default {
  id: 'span-power-on',
  title: 'Power On',
  category: 'Whole Device',
  description: "First Light for the deck: a beam enters at a corner key, strikes a prism in the middle key, and the Spectrum fans out, lighting each key before it settles into its own face.",
  tags: ['boot', 'startup', 'intro', 'first light', 'prism', 'beam', 'spectrum', 'brand', 'wall'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 8,
  loop: 16,
  params: {
    replay: { type: 'bool', default: true, label: 'Replay (off: play once and hold)' },
    pace: { type: 'number', default: 1, min: 0.5, max: 2, step: 0.05, label: 'Pace' },
    labels: { type: 'bool', default: true, label: 'Labels' },
    budget: BUDGET,
  },
  order: 9,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    // keys in flight at once: the settle time over the stagger (+ the prism key) sets the frame rate
    const nK = cells.length, sweep = clamp((nK - 1) * 0.3, 2.6, 9.5), stagger = sweep / Math.max(1, nK - 2);
    const { t: tq } = frameClock(ctx, { fps: 8, changing: Math.min(nK, Math.ceil((SETTLE + 0.3) / stagger) + 2), still: 5.6 });
    const L = 16;
    const pace = ctx.params.pace;
    // play once and hold, or loop with a fade back to dark at the end
    let tt = ctx.params.replay ? tq % L : Math.min(tq, L - 1.4);
    if (ctx.reduced) tt = L - 1.4;
    const tl = tt * pace;
    const dark = T.dark;
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const beamC = T.colors.beam && dark ? T.colors.beam : '#ffffff';   // the deck is dark when the beam runs, Day or Night
    // the prism key (nearest the middle) and the beam's entry (outside the top-left key)
    const prism = cells.reduce((b, c) => (Math.hypot(c.x + c.w / 2 - w / 2, c.y + c.h / 2 - h / 2) < Math.hypot(b.x + b.w / 2 - w / 2, b.y + b.h / 2 - h / 2) ? c : b), cells[0]);
    const px = prism.x + prism.w / 2, py = prism.y + prism.h / 2;
    const S = K * 0.5;
    const A = [px, py - S * 0.5], Bp = [px - S * 0.56, py + S * 0.42], Cp = [px + S * 0.56, py + S * 0.42];
    const strike = [lerp(A[0], Bp[0], 0.5), lerp(A[1], Bp[1], 0.5)];
    const entry = [-K * 0.25, -K * 0.25];
    // each key's moment: when the fan's wavefront reaches it (outward from the prism), staggered
    const order = cells.filter((c) => c !== prism).sort((a, b) => Math.hypot(a.x - prism.x, a.y - prism.y) - Math.hypot(b.x - prism.x, b.y - prism.y) || a.i - b.i);
    const span = sweep;                                               // seconds the sweep takes
    const at = new Map(order.map((c, j) => [c.i, FAN + (j / Math.max(1, order.length - 1)) * span]));
    at.set(prism.i, FAN + span + 0.4);
    const end = FAN + span + 0.4 + SETTLE;
    const outro = ctx.params.replay ? smoothstep(L - 1.2, L - 0.2, tt) : 0;
    const hueOf = (c) => {
      // the color that lands on a key, physically ordered: the beam comes down from the top-left and
      // the glass bends it toward its base, violet most and red least — so the fan's axis points
      // right, just below the horizontal (AXIS): red sits above it, violet below. A key's color is
      // its angular distance from the red pole (90° above the axis): 0 = red, π = violet. Folding at
      // the poles keeps the color continuous all the way round the prism key.
      const a = Math.atan2(c.y + c.h / 2 - py, c.x + c.w / 2 - px);
      let d = Math.abs(a - (AXIS - Math.PI / 2)) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return 24 + 276 * (d / Math.PI);
    };
    // the dark deck under everything
    let blk = '';
    for (const c of cells) blk += `<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="#000000"/>`;
    k.add(blk);
    // each key: dark → flash → its face
    cells.forEach((c, idx) => {
      const t0 = at.get(c.i);
      const s = tl - t0;
      if (s < 0 && c !== prism) return;                               // still dark: nothing but black (free)
      const isPrism = c === prism;
      const settle = clamp(s / SETTLE);
      const faceO = outExpo(settle) * (1 - outro);
      const glyphId = isPrism ? 'power' : FACES[idx % FACES.length];
      const g = ctx.glyphs.get(glyphId) ? glyphId : 'power';
      const hue = hueOf(c);
      keyInto(k, c, (kk) => {
        if (faceO > 0.01) {
          kk.add(`<g opacity="${f1(faceO)}">`);
          kk.background({ tone: 'idle' });
          // the glyph arrives by converging: a touch large and offset, resolving into place
          const box = kk.theme.glyphBox(kk, { labeled: !!ctx.params.labels });
          const grow = 1 + 0.12 * (1 - outCubic(settle));
          const size = box.size * grow, off = (1 - outCubic(settle)) * kk.m.u * 3;
          kk.glyph(g, { labeled: !!ctx.params.labels, box: { x: box.x + (box.size - size) / 2 - off, y: box.y + (box.size - size) / 2, size }, t: 0, since: 60, state: isPrism && g === 'power' ? 'on' : undefined });
          if (ctx.params.labels) kk.label(ctx.glyphs.get(g).title.split(' ')[0]);
          kk.add('</g>');
        }
        // the flash of color as the light arrives, fading as the face settles
        if (s >= 0 && s < SETTLE + 0.3 && !(isPrism && s < 0)) {
          const flash = (1 - smoothstep(0.05, SETTLE + 0.3, s)) * smoothstep(-0.02, 0.06, s) * (1 - outro);
          if (flash > 0.02) {
            const col = T.spectral(hue, { dl: dark ? 0.04 : 0 });
            const id = kk.id('fl');
            // lit from the side facing the prism
            const dx = px - (c.x + c.w / 2), dy = py - (c.y + c.h / 2), dl = Math.hypot(dx, dy) || 1;
            kk.def(radialGradient(id, [[0, col, f1(0.95 * flash)], [0.55, col, f1(0.45 * flash)], [1, col, f1(0.12 * flash)]], { cx: f1(0.5 + (dx / dl) * 0.45), cy: f1(0.5 + (dy / dl) * 0.45), r: 1 }));
            kk.add(`<path d="${rectD(0, 0, kk.w, kk.h)}" fill="${url(id)}"/>`);
            kk.add(`<path d="${rectD(kk.m.safe, 0, kk.w - kk.m.safe * 2, kk.m.line)}" fill="${dark ? '#ffffff' : col}" fill-opacity="${f1(flash)}"/>`);
          }
        }
      }, { tag: `f${c.i}`, clip: false });
    });
    const B = new Batch(grid);
    // the beam: in from the corner to the strike point, then held while the fan runs
    const beamF = clamp((tl - BEAM_IN) / (STRIKE - BEAM_IN));
    const fanOut = 1 - smoothstep(FAN + 0.4, FAN + 1.6, tl);           // the beam has done its work once the fan runs
    if (beamF > 0 && fanOut > 0.01 && outro < 0.99) {
      const head = [lerp(entry[0], strike[0], outCubic(beamF)), lerp(entry[1], strike[1], outCubic(beamF))];
      const bw = Math.max(1.5, K * 0.022);
      const op = fanOut * (1 - outro);
      B.seg(entry[0], entry[1], head[0], head[1], bw * 4, strokeP(beamC, bw * 4, 0.16 * op), 1);
      B.seg(entry[0], entry[1], head[0], head[1], bw, strokeP(beamC, bw, op), 2);
      if (beamF < 1) B.dot(head[0], head[1], bw * 2.2, fillP(beamC, op), 3);
    }
    // the prism, the strike flare, and the fan of rays toward the keys
    const prismO = smoothstep(STRIKE - 0.5, STRIKE, tl) * (1 - smoothstep(end - SETTLE, end - 0.2, tl)) * (1 - outro);
    if (prismO > 0.01) {
      const glassC = '#ffffff';
      const gl = k.id('glass');
      k.def(linearGradient(gl, [[0, glassC, dark ? 0.16 : 0.12], [1, glassC, 0.04]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }));
      k.add(`<path d="${polyD([A, Bp, Cp])}" fill="${url(gl)}" fill-opacity="${f1(prismO)}" stroke="${glassC}" stroke-width="${f1(Math.max(1.5, K * 0.018))}" stroke-opacity="${f1(0.8 * prismO)}" stroke-linejoin="round"/>`);
      const flare = smoothstep(STRIKE - 0.05, STRIKE + 0.1, tl) * (1 - smoothstep(STRIKE + 0.1, STRIKE + 1.2, tl));
      if (flare > 0.02) {
        const fl = k.id('flare');
        k.def(radialGradient(fl, [[0, beamC, f1(0.9 * flare)], [0.3, beamC, f1(0.3 * flare)], [1, beamC, 0]]));
        const r = K * 0.42;
        k.add(`<path d="${rectD(strike[0] - r, strike[1] - r, r * 2, r * 2)}" fill="${url(fl)}"/>`);
      }
      // rays: a thin spectral ray toward each key about to light, drawn inside the prism key only
      // (a ray across the deck would make every key it crosses change)
      const exit = [lerp(A[0], Cp[0], 0.55), lerp(A[1], Cp[1], 0.55)];
      for (const c of order) {
        const s = tl - at.get(c.i);
        const ro = (smoothstep(-0.9, 0, s) * (1 - smoothstep(0.1, 0.6, s))) * prismO;
        if (ro < 0.03) continue;
        const tx = c.x + c.w / 2, ty = c.y + c.h / 2;
        const dx = tx - exit[0], dy = ty - exit[1], dl = Math.hypot(dx, dy) || 1;
        const room = Math.min(dx > 0 ? (prism.x + prism.w - exit[0]) / dx : dx < 0 ? (prism.x - exit[0]) / dx : Infinity, dy > 0 ? (prism.y + prism.h - exit[1]) / dy : dy < 0 ? (prism.y - exit[1]) / dy : Infinity) * dl;
        const len = Math.min(dl, room - 0.5) * clamp((s + 0.9) / 0.5);
        const ex = exit[0] + (dx / dl) * len, ey = exit[1] + (dy / dl) * len;
        const col = T.spectral(hueOf(c), { dl: dark ? 0.06 : -0.02 });
        B.seg(exit[0], exit[1], ex, ey, Math.max(1.2, u * 1.4), strokeP(col, Math.max(1.2, u * 1.4), ro), 4);
      }
    }
    B.emit(k);
    return k.svg();
  },
};

