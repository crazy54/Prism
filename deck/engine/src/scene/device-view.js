// Virtual device markup — pure HTML/CSS strings, so the same device draws in a
// Node-rendered contact sheet (scripts/shoot.mjs) and in the live web runtime
// (src/web/), which hydrates this markup and swaps key images per frame.
//
//   deviceMarkup('plus', { theme: 'prism-dark', width: 640, keys: [svg…], strip: svg, dials: [deg…] })
//
// Geometry comes from devices.js (native panel px); `width` (CSS px) or `scale`
// (CSS px per panel px) sizes it. Night = the black device; Day = the white edition.

import { deviceLayout, getDevice } from '../devices.js';
import { useTheme } from '../themes/_registry.js';
import { esc, n } from './svg.js';
import { textPath, pad2 } from './text.js';

const SANS = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'Cascadia Mono', Consolas, ui-monospace, monospace";

export const DEVICE_CSS = `
.pdk-device{position:relative;display:block;box-sizing:border-box;border-radius:var(--pdk-r);width:var(--pdk-w);height:var(--pdk-h);
  background:linear-gradient(180deg,#1c1e25 0%,#121318 52%,#0b0c10 100%);
  box-shadow:inset 0 1px 0 #ffffff1f,inset 0 0 0 1px #ffffff0a,inset 0 -2px 0 #00000099,0 30px 60px -30px #000000cc,0 8px 18px -8px #00000099;
  font-family:${SANS};-webkit-tap-highlight-color:transparent;user-select:none}
.pdk-device::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(115deg,#b8a2f20d 0%,transparent 30%,transparent 70%,#8bd8ba0a 100%)}
.pdk-device.pdk-day{background:linear-gradient(180deg,#ffffff 0%,#f3f2f7 55%,#e7e5ee 100%);
  box-shadow:inset 0 1px 0 #ffffff,inset 0 0 0 1px #00000008,inset 0 -2px 0 #0000000f,0 30px 60px -30px #2a1f4a40,0 8px 18px -8px #2a1f4a2e}
.pdk-key,.pdk-strip,.pdk-info,.pdk-screen{position:absolute;box-sizing:border-box;overflow:hidden;background:#000;padding:0;margin:0;border:0;font:inherit;color:inherit}
.pdk-key{border-radius:var(--pdk-kr);cursor:default;outline:none;
  box-shadow:0 0 0 calc(var(--pdk-u)*3) #00000080,0 calc(var(--pdk-u)*2) 0 calc(var(--pdk-u)*3) #ffffff0d,inset 0 0 0 1px #ffffff12;
  transition:transform .12s cubic-bezier(.16,1,.3,1)}
.pdk-day .pdk-key{box-shadow:0 0 0 calc(var(--pdk-u)*3) #d9d6e4,0 calc(var(--pdk-u)*2) 0 calc(var(--pdk-u)*3) #ffffff,inset 0 0 0 1px #00000040}
.pdk-key::after,.pdk-strip::after,.pdk-screen::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(162deg,#ffffff1c 0%,#ffffff08 28%,transparent 46%)}
.pdk-lcd,.pdk-lcd>svg{display:block;width:100%;height:100%}
.pdk-lcd>svg{shape-rendering:geometricPrecision}
.pdk-interactive .pdk-key,.pdk-interactive .pdk-dial,.pdk-interactive .pdk-strip{cursor:pointer}
.pdk-key.pdk-down{transform:scale(.965)}
.pdk-key:focus-visible,.pdk-dial:focus-visible,.pdk-strip:focus-visible{outline:2px solid #b8a2f2;outline-offset:3px}
.pdk-day .pdk-key:focus-visible,.pdk-day .pdk-dial:focus-visible,.pdk-day .pdk-strip:focus-visible{outline-color:#7353bb}
.pdk-strip,.pdk-screen{border-radius:var(--pdk-sr);box-shadow:0 0 0 calc(var(--pdk-u)*4) #00000080,inset 0 0 0 1px #ffffff12}
.pdk-day .pdk-strip,.pdk-day .pdk-screen{box-shadow:0 0 0 calc(var(--pdk-u)*4) #d9d6e4,inset 0 0 0 1px #00000040}
.pdk-segs{display:flex;width:100%;height:100%}.pdk-segs>span{flex:1;display:block;min-width:0}.pdk-segs>span>svg{display:block;width:100%;height:100%}
.pdk-widgets{display:grid;width:100%;height:100%}.pdk-widgets>span{position:relative;display:grid;place-items:center;min-width:0;min-height:0}
.pdk-widgets>span>svg{display:block;width:100%;height:auto;max-height:100%}
.pdk-widgets>span.pdk-layer0::after{content:"";position:absolute;left:12%;right:12%;bottom:4%;height:calc(var(--pdk-u)*3);border-radius:9px;background:#ffffffcc}
.pdk-dial{position:absolute;box-sizing:border-box;border-radius:50%;padding:0;margin:0;border:0;outline:none;
  background:radial-gradient(circle at 50% 50%,#24262d 0 52%,transparent 53%),
    repeating-conic-gradient(from 0deg,#2b2d35 0deg 3deg,#101116 3deg 6deg);
  box-shadow:0 0 0 calc(var(--pdk-u)*3) #07080b,0 calc(var(--pdk-u)*7) calc(var(--pdk-u)*12) #000000b3,inset 0 1px 0 #ffffff26}
.pdk-dial::before{content:"";position:absolute;inset:18%;border-radius:50%;
  background:radial-gradient(circle at 38% 30%,#3b3e48 0%,#1a1b21 55%,#101116 100%);box-shadow:inset 0 1px 0 #ffffff1f,inset 0 -1px 0 #00000080}
.pdk-dial::after{content:"";position:absolute;left:50%;top:22%;width:calc(var(--pdk-u)*5);height:18%;margin-left:calc(var(--pdk-u)*-2.5);border-radius:9px;
  background:#b8a2f2;box-shadow:0 0 6px #b8a2f2aa;transform-origin:50% 155%;transform:rotate(var(--rot,0deg))}
.pdk-day .pdk-dial{background:radial-gradient(circle at 50% 50%,#e9e8ef 0 52%,transparent 53%),repeating-conic-gradient(from 0deg,#d6d4de 0deg 3deg,#f7f7fa 3deg 6deg);
  box-shadow:0 0 0 calc(var(--pdk-u)*3) #cfccd9,0 calc(var(--pdk-u)*7) calc(var(--pdk-u)*12) #2a1f4a33,inset 0 1px 0 #ffffff}
.pdk-day .pdk-dial::before{background:radial-gradient(circle at 38% 30%,#ffffff 0%,#efeef4 55%,#dedce6 100%);box-shadow:inset 0 1px 0 #ffffff,inset 0 -1px 0 #00000014}
.pdk-day .pdk-dial::after{background:#7353bb;box-shadow:none}
.pdk-dial.pdk-metal{background:radial-gradient(circle at 50% 50%,#3a3c44 0 60%,transparent 61%),repeating-conic-gradient(from 0deg,#5a5d66 0deg 2deg,#2a2c33 2deg 4deg)}
.pdk-day .pdk-dial.pdk-metal{background:radial-gradient(circle at 50% 50%,#dcdbe3 0 60%,transparent 61%),repeating-conic-gradient(from 0deg,#b9b7c4 0deg 2deg,#eeedf3 2deg 4deg)}
.pdk-dial.pdk-down::before{filter:brightness(.85)}
.pdk-info{border-radius:var(--pdk-ir);box-shadow:0 0 0 calc(var(--pdk-u)*3) #00000080,inset 0 0 0 1px #ffffff10}
.pdk-touch{position:absolute;box-sizing:border-box;border-radius:calc(var(--pdk-u)*8);border:1px solid #ffffff1f;background:linear-gradient(180deg,#ffffff0a,#00000033);display:grid;place-items:center}
.pdk-day .pdk-touch{border-color:#00000017;background:linear-gradient(180deg,#ffffff,#eceaf1)}
.pdk-touch::before{content:"";width:calc(var(--pdk-u)*6);height:calc(var(--pdk-u)*6);border-left:1.5px solid #ffffff73;border-bottom:1.5px solid #ffffff73;transform:rotate(45deg)}
.pdk-touch.pdk-right::before{transform:rotate(-135deg)}
.pdk-day .pdk-touch::before{border-color:#00000059}
.pdk-pedal{position:absolute;box-sizing:border-box;border-radius:calc(var(--pdk-u)*40);background:linear-gradient(180deg,#26282f,#121318);box-shadow:inset 0 1px 0 #ffffff1a,0 6px 14px #00000080}
.pdk-day .pdk-pedal{background:linear-gradient(180deg,#ffffff,#e4e2ea);box-shadow:inset 0 1px 0 #ffffff,0 6px 14px #2a1f4a2e}
.pdk-nodisplay{position:absolute;left:0;right:0;bottom:5%;text-align:center;font:600 11px/1 ${MONO};letter-spacing:.14em;color:#999ba9;text-transform:uppercase}
@media (prefers-reduced-motion:reduce){.pdk-key{transition:none}}
`;

/** The Neo info bar the app draws (clock + page dots) — virtual devices show the stock look. */
export function infobarSvg(theme = 'prism', { clock = { h: 9, m: 41 }, page = 0, pages = 3 } = {}) {
  const T = useTheme(theme);
  const dots = Array.from({ length: pages }, (_, i) => `<circle cx="${n(124 - (pages - 1) * 7 + i * 14)}" cy="47" r="${i === page ? 3 : 2.2}" fill="${i === page ? T.colors.accent : '#5b5d6b'}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58" viewBox="0 0 248 58"><rect width="248" height="58" fill="#05060a"/>`
    + `${textPath(`${clock.h}:${pad2(clock.m)}`, { x: 124, y: 33, size: 24, weight: 600, anchor: 'middle', fill: '#f0f0f5', tabular: true })}${dots}</svg>`;
}

/**
 * HTML for a virtual device. opts:
 *   theme ('prism-dark' | 'prism-light'), width (CSS px) or scale (CSS px per panel px; default 1)
 *   keys:    array of SVG strings (row-major; missing → blank key)
 *   strip:   SVG for the whole touch strip (+ / + XL); or segments: [svg per dial segment]
 *   screen:  SVG for the whole screen (Galleon 720×384); or widgets: [svg per widget] in order
 *            dial0/layer0, dial1/layer0, dial0/layer1, dial1/layer1
 *   dials:   rotations in degrees per dial
 *   infobar: SVG (Neo; default: the stock clock)
 *   interactive: keys/dials/strip become focusable buttons; labels: aria-labels per key
 *   id / label: DOM id and aria-label of the root
 */
export function deviceMarkup(model, opts = {}) {
  const d = getDevice(model);
  const L = deviceLayout(d);
  const T = useTheme(opts.theme || 'prism', opts.mode);
  const s = opts.width ? opts.width / L.w : opts.scale || 1;
  const px = (v) => `${n(v * s)}px`;
  const box = (r) => `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}`;
  const interactive = !!opts.interactive;
  const tag = interactive ? 'button' : 'div';
  const btn = (label) => (interactive ? ` type="button" aria-label="${esc(label)}"` : ' aria-hidden="true"');
  const style = `--pdk-w:${px(L.w)};--pdk-h:${px(L.h)};--pdk-r:${px(L.r)};--pdk-kr:${px(L.keys[0]?.r || 10)};--pdk-u:${n(s, 4)}px;--pdk-sr:${px(10)};--pdk-ir:${px(6)}`;
  let inner = '';
  if (!L.display) {
    L.keys.forEach((k) => { inner += `<div class="pdk-pedal" data-slot="key:${k.i}" style="${box(k)}"></div>`; });
    inner += `<div class="pdk-nodisplay">No display · pedals drive key states</div>`;
  } else {
    for (const k of L.keys) inner += `<${tag} class="pdk-key" data-slot="key:${k.i}" data-col="${k.col}" data-row="${k.row}"${btn(opts.labels?.[k.i] || `Key ${k.i + 1}`)} style="${box(k)}"><span class="pdk-lcd">${opts.keys?.[k.i] || ''}</span></${tag}>`;
    if (L.strip) {
      const body = opts.strip || (opts.segments ? `<span class="pdk-segs">${Array.from({ length: L.strip.segments }, (_, i) => `<span>${opts.segments[i] || ''}</span>`).join('')}</span>` : '');
      inner += `<${tag} class="pdk-strip" data-slot="strip"${btn('Touch strip')} style="${box(L.strip)}"><span class="pdk-lcd">${body}</span></${tag}>`;
    }
    if (L.screen) {
      const wg = opts.widgets || [];
      const content = opts.screen
        ? `<span class="pdk-lcd">${opts.screen}</span>`
        : `<span class="pdk-widgets" style="grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr">${(L.widgets || []).map((w, i) => `<span class="pdk-layer${w.layer}" data-slot="widget:${w.dial},${w.layer}">${wg[i] || ''}</span>`).join('')}</span>`;
      inner += `<div class="pdk-screen" data-slot="screen" aria-hidden="true" style="${box(L.screen)}">${content}</div>`;
    }
    if (L.infobar) inner += `<div class="pdk-info" data-slot="infobar" aria-hidden="true" style="${box(L.infobar)}"><span class="pdk-lcd">${opts.infobar || infobarSvg(T)}</span></div>`;
    if (L.touch) for (const tp of L.touch) inner += `<div class="pdk-touch pdk-${tp.dir}" data-slot="touch:${tp.i}" aria-hidden="true" style="${box(tp)}"></div>`;
  }
  if (L.dials) for (const dl of L.dials) {
    const rot = opts.dials?.[dl.i] ?? 0;
    inner += `<${tag} class="pdk-dial${dl.touch ? '' : ' pdk-metal'}" data-slot="dial:${dl.i}"${btn(`Dial ${dl.i + 1}`)} style="left:${px(dl.cx - dl.d / 2)};top:${px(dl.cy - dl.d / 2)};width:${px(dl.d)};height:${px(dl.d)};--rot:${n(rot)}deg"></${tag}>`;
  }
  const cls = `pdk-device pdk-${d.id}${T.dark ? '' : ' pdk-day'}${interactive ? ' pdk-interactive' : ''}`;
  return `<div class="${cls}"${opts.id ? ` id="${esc(opts.id)}"` : ''} data-model="${d.id}" role="group" aria-label="${esc(opts.label || `${d.name} (virtual)`)}" style="${style}">${inner}</div>`;
}
