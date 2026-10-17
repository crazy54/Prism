// Scene switcher for streaming.
//
//   app-scene            one scene on a key: an abstract thumbnail of its layout (camera, screen, split,
//                        be-right-back, starting, ending) and its name; press cycles standby → preview → program.
//                        Program is the on-air state: the alert ring and a "Live" mark (never color alone).
//   app-scene-switcher   a row of scenes across keys; the program scene is on air, the next one is in preview,
//                        and each press cuts to the next scene. Text stays inside its key; nothing crosses a bezel.
// Generic broadcast vocabulary only — no product names or lookalike marks.

import { surface, keyInto, rect, path, circle, n, roundRectPath } from '../../scene/index.js';
import { colorAt, whiteOf, mix } from './_kit.js';

export const LAYOUTS = ['camera', 'screen', 'split', 'brb', 'starting', 'ending'];
/** A scene name → its layout, by keyword (Camera, Desktop, Game + cam, Be right back, Starting soon, Outro …). */
export function layoutOf(name = '') {
  const s = String(name).toLowerCase();
  if (/split|pip|both|\+/.test(s)) return 'split';
  if (/brb|break|away|right back|pause/.test(s)) return 'brb';
  if (/start|intro|soon|wait/.test(s)) return 'starting';
  if (/end|outro|thanks|bye/.test(s)) return 'ending';
  if (/screen|desk|game|slides|code|share/.test(s)) return 'screen';
  return 'camera';
}

/** Draw the thumbnail of a layout inside a 16:9 frame. */
function thumb(k, ctx, layout, { x, y, w, h, on }) {
  const C = k.colors, r = Math.max(2, h * 0.12);
  const fid = k.id('th');
  const base = mix(C.surface2, colorAt(ctx, 'auto', 0.3, 'ink'), k.dark ? 0.22 : 0.12);
  k.def(`<linearGradient id="${fid}" x1="0" y1="${n(y)}" x2="0" y2="${n(y + h)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${mix(base, C.surface, 0.3)}"/><stop offset="1" stop-color="${base}"/></linearGradient>`);
  k.add(path(roundRectPath(x, y, w, h, r), { fill: `url(#${fid})`, stroke: on ? whiteOf(k) : C.line, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: on ? 0.55 : 1 }));
  const ink = k.dark ? '#ffffff' : C.ink, soft = { fill: ink, fillOpacity: 0.78 };
  const cx = x + w / 2, cy = y + h / 2;
  const person = (px, py, s) => circle({ cx: px, cy: py - s * 0.32, r: s * 0.26, ...soft }) + path(`M${n(px - s * 0.52)} ${n(py + s * 0.62)}C${n(px - s * 0.5)} ${n(py + s * 0.1)} ${n(px + s * 0.5)} ${n(py + s * 0.1)} ${n(px + s * 0.52)} ${n(py + s * 0.62)}Z`, soft);
  const win = (wx, wy, ww, wh) => {
    let o = path(roundRectPath(wx, wy, ww, wh, Math.max(1, wh * 0.08)), { fill: 'none', stroke: ink, strokeOpacity: 0.7, strokeWidth: n(Math.max(1, k.m.hair)) });
    o += rect({ x: wx, y: wy + wh * 0.2, width: ww, height: Math.max(0.75, k.m.hair * 0.7), fill: ink, fillOpacity: 0.5 });
    for (let i = 0; i < 3; i++) o += rect({ x: wx + ww * 0.1, y: wy + wh * (0.38 + i * 0.17), width: ww * [0.62, 0.44, 0.54][i], height: Math.max(1, wh * 0.07), rx: wh * 0.035, fill: colorAt(ctx, 'auto', 0.2 + i * 0.3), fillOpacity: 0.85 });
    return o;
  };
  if (layout === 'camera') k.add(person(cx, cy + h * 0.06, h * 0.62));
  else if (layout === 'screen') k.add(win(x + w * 0.14, y + h * 0.16, w * 0.72, h * 0.68));
  else if (layout === 'split') { k.add(win(x + w * 0.08, y + h * 0.16, w * 0.6, h * 0.68)); k.add(circle({ cx: x + w * 0.8, cy: y + h * 0.66, r: h * 0.2, fill: C.surface2 }) + person(x + w * 0.8, y + h * 0.68, h * 0.28)); }
  else if (layout === 'brb') k.value('BRB', { x: cx, cy, size: h * 0.36, maxWidth: w * 0.8, color: ink });
  else if (layout === 'starting') { for (let i = 0; i < 7; i++) { const bh = h * (0.18 + 0.5 * Math.abs(Math.sin(i * 1.7 + ctx.t * 2))); k.add(rect({ x: x + w * (0.2 + i * 0.09), y: cy + h * 0.25 - bh, width: w * 0.05, height: bh, rx: w * 0.02, fill: colorAt(ctx, 'auto', i / 6) })); } }
  else k.value('Thanks', { x: cx, cy, size: h * 0.26, maxWidth: w * 0.84, color: ink });
}

/** One scene key. role: 'program' | 'preview' | 'standby'. */
export function sceneKey(k, ctx, { name, layout, role }) {
  const tone = role === 'program' ? 'alert' : role === 'preview' ? 'ok' : 'idle';
  k.background({ tone });
  const W = k.w, H = k.h, m = Math.min(W, H);
  const tw = m * 0.7, th = tw * 9 / 16;
  thumb(k, ctx, layout, { x: (W - tw) / 2, y: H * 0.42 - th / 2, w: tw, h: th, on: role === 'program' });
  if (role !== 'standby') k.eyebrow(role === 'program' ? 'Live' : 'Next', { color: 'tone' });
  k.label(name || 'Scene', { color: role === 'standby' ? 'muted' : 'ink' });
}

const scene = {
  id: 'app-scene', title: 'Scene', category: 'Controls',
  description: 'One streaming scene on a key: an abstract thumbnail and its name; press for preview, live, standby. Demo: no streaming-app source yet, so it switches nothing.',
  tags: ['streaming', 'scene', 'switcher', 'broadcast', 'live', 'program', 'preview', 'stream', 'obs-style', 'scenes', 'cut', 'demo'],
  surface: 'key', fps: 4, loop: 3,
  states: ['standby', 'preview', 'program'], tones: { standby: 'idle', preview: 'ok', program: 'alert' }, press: 'cycle',
  params: {
    name: { type: 'text', default: 'Camera', maxLength: 14, label: 'Scene name' },
    layout: { type: 'select', default: 'auto', options: ['auto', ...LAYOUTS], label: 'Thumbnail' },
  },
  order: 60,
  render(ctx) {
    const k = surface(ctx);
    const p = ctx.params;
    sceneKey(k, ctx, { name: p.name, layout: p.layout === 'auto' ? layoutOf(p.name) : p.layout, role: ctx.stateName });
    return k.svg();
  },
};

const MAX = 8;
const switcher = {
  id: 'app-scene-switcher', title: 'Scene Switcher', category: 'Controls',
  description: 'Your streaming scenes across a row of keys: program is live, the next waits in preview, a press cuts. Demo: no streaming-app source yet, so it switches nothing.',
  tags: ['streaming', 'scene', 'switcher', 'broadcast', 'live', 'span', 'program', 'preview', 'stream', 'obs-style', 'scenes', 'cut', 'demo'],
  surface: 'span', span: { cols: 'all', rows: 1 }, fps: 4, loop: 3,
  states: Array.from({ length: MAX }, (_, i) => `scene-${i + 1}`), press: 'cycle',
  params: { scenes: { type: 'text', default: 'Starting, Camera, Screen + cam, Screen, BRB, Outro', maxLength: 96, label: 'Scenes (comma-separated)' } },
  order: 61,
  render(ctx) {
    const d = surface(ctx);
    const { grid } = ctx;
    const names = String(ctx.params.scenes).split(',').map((s) => s.trim()).filter(Boolean).slice(0, Math.min(MAX, grid.cells.length));
    const count = Math.max(1, names.length);
    const prog = ctx.state % count, next = (prog + 1) % count;
    d.add(rect({ width: d.w, height: d.h, fill: '#000000' }));
    grid.cells.forEach((cell, i) => {
      keyInto(d, cell, (k) => {
        if (i >= names.length) { k.background({ tone: 'off' }); return; }
        sceneKey(k, ctx, { name: names[i], layout: layoutOf(names[i]), role: i === prog ? 'program' : i === next && count > 1 ? 'preview' : 'standby' });
      }, { tag: `s${cell.i}`, tone: i === prog ? 'alert' : 'idle' });
    });
    return d.svg();
  },
};

export default [scene, switcher];
