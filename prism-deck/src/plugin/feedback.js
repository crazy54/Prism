// Dial / screen canvases. Every Prism encoder draws into one full-canvas pixmap
// ("canvas") of a custom layout, so a facet's art reaches the touch strip, the
// Galleon screen and the Neo info bar exactly as rendered (formats.md §3.3).
//
// Galleon 100 SD (hardware lab, RESULTS.md §3): the 720×384 screen shows all four
// widgets at once, 2×2 — (0,0) top-left · (0,1) bottom-left · (1,0) top-right ·
// (1,1) bottom-right — each 2:1, and the whole 200×100 layout is scaled UNIFORMLY
// into each one, nothing cropped. API 1.4 renders each widget as a 2:1 window
// (360×180, centered in its 360×192 quadrant, 6 px gutters), so widgetCanvas() maps it
// onto the 200×100 canvas at exactly 5/9 on both axes — no squash. Qt ignores
// preserveAspectRatio, so the fit is a plain transform. A non-2:1 window (older
// engines) is letterboxed, never stretched.

import { svgInner, n } from '../scene/svg.js';

export const LAYOUT_SCHEMA_URL = 'https://schemas.elgato.com/streamdeck/plugins/layout.json';
export const CANVAS_KEY = 'canvas';
export const CANVAS_LAYOUT_PATH = 'layouts/prism-canvas.json';
export const INFOBAR_LAYOUT_PATH = 'layouts/prism-infobar.json';

export const CANVAS_LAYOUT = Object.freeze({
  $schema: LAYOUT_SCHEMA_URL,
  id: 'com.jeremyfhall.prism.canvas',
  controller: 'Encoder',
  items: [{ key: CANVAS_KEY, type: 'pixmap', rect: [0, 0, 200, 100], zOrder: 0 }],
});

export const INFOBAR_LAYOUT = Object.freeze({
  $schema: LAYOUT_SCHEMA_URL,
  id: 'com.jeremyfhall.prism.infobar',
  controller: 'Neo',
  items: [{ key: CANVAS_KEY, type: 'pixmap', rect: [0, 0, 232, 50], zOrder: 0 }],
});

/** How a Galleon widget window lands on the 200×100 encoder canvas: uniform ('meet'), as the device shows it. */
export const GALLEON_CANVAS = Object.freeze({ w: 200, h: 100, fit: 'meet' });

const vbOf = (svg) => {
  const m = /viewBox="([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)"/.exec(svg);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
};

/**
 * Re-frame an SVG (a widget window, an info-bar slice) onto a w×h canvas with a plain
 * transform. fit 'meet' = uniform scale, centered (letterbox if the aspects differ);
 * 'stretch' = fill both axes.
 */
export function fitCanvas(svg, { w = 200, h = 100, fit = 'meet' } = {}) {
  const vb = vbOf(svg);
  if (!vb) return svg;
  if (Math.abs(vb.w - w) < 0.01 && Math.abs(vb.h - h) < 0.01 && vb.x === 0 && vb.y === 0) return svg;
  let sx = w / vb.w, sy = h / vb.h, tx = 0, ty = 0;
  if (fit === 'meet') { const s = Math.min(sx, sy); tx = (w - vb.w * s) / 2; ty = (h - vb.h * s) / 2; sx = sy = s; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="translate(${n(tx)} ${n(ty)}) scale(${n(sx, 5)} ${n(sy, 5)}) translate(${n(-vb.x)} ${n(-vb.y)})">${svgInner(svg)}</g></svg>`;
}

/** A Galleon widget window → the encoder canvas. */
export const widgetCanvas = (svg) => fitCanvas(svg, GALLEON_CANVAS);

/** The setFeedback payload for a canvas image. */
export const canvasPayload = (dataUrl) => ({ [CANVAS_KEY]: dataUrl });

/**
 * Rects of the 4 Galleon widgets inside a deck render's screen rect: [{ dial, layer, x, y, w, h }].
 * widgets: devices.js screen.widgets — { cols, rows, w, h, pitchX, pitchY, insetX, insetY } (API 1.4: 360×180
 * windows on a 360×192 pitch, 6 px inset); without pitch/size it splits the screen evenly.
 */
export function galleonWidgetRects(screenRect, widgets = { cols: 2, rows: 2 }) {
  const out = [];
  const px = widgets.pitchX ?? screenRect.w / widgets.cols, py = widgets.pitchY ?? screenRect.h / widgets.rows;
  const w = widgets.w ?? px, h = widgets.h ?? py, ix = widgets.insetX ?? 0, iy = widgets.insetY ?? 0;
  for (let layer = 0; layer < widgets.rows; layer++) for (let dial = 0; dial < widgets.cols; dial++) out.push({ dial, layer, x: screenRect.x + ix + dial * px, y: screenRect.y + iy + layer * py, w, h });
  return out;
}
