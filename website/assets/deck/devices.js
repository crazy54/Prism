// Stream Deck device geometry for the website's virtual devices.
//
// Mirrors prism-deck/src/devices.js (the Deck Architect's model table: native panel
// pixels, key windows, dials, strips, the Galleon's screen). The site keeps its own
// copy only until prism-deck's browser runtime is wired in (docs/CONTRACT-READY);
// then adapter.js takes devices from the package instead.

export const DEVICES = {
  galleon: { id: 'galleon', name: 'Galleon 100 SD', vendor: 'Corsair', cols: 3, rows: 4, keyPx: 160, panel: { w: 720, h: 1280, x0: 56, y0: 443, gapX: 64, gapY: 64 }, body: { w: 880, h: 1660, r: 44 }, screen: { x: 0, y: 0, w: 720, h: 384, widgets: { cols: 2, rows: 2 } }, dials: { count: 2, d: 150, y: 150, above: true }, note: 'Portrait LCD keys · two dials, two layers' },
  plus: { id: 'plus', name: 'Stream Deck +', cols: 4, rows: 2, keyPx: 120, panel: { w: 800, h: 480, x0: 13, y0: 12, gapX: 99, gapY: 40 }, body: { w: 1036, h: 1010, r: 70 }, strip: { x: 0, y: 380, w: 800, h: 100, segments: 4 }, dials: { count: 4, d: 156, y: 760, under: 'columns' }, note: '8 keys · 4 dials · touch strip' },
  mk2: { id: 'mk2', name: 'Stream Deck MK.2', cols: 5, rows: 3, keyPx: 72, panel: { w: 480, h: 272, x0: 11, y0: 5, gapX: 25, gapY: 25 }, body: { w: 602, h: 428, r: 36 }, note: '15 keys' },
  xl: { id: 'xl', name: 'Stream Deck XL', cols: 8, rows: 4, keyPx: 96, panel: { w: 1024, h: 600, x0: 14, y0: 47, gapX: 32.29, gapY: 39 }, body: { w: 1176, h: 730, r: 50 }, note: '32 keys' },
  plusxl: { id: 'plusxl', name: 'Stream Deck + XL', cols: 9, rows: 4, keyPx: 112, panel: { w: 1280, h: 800, x0: 11, y0: 32, gapX: 31.5, gapY: 31.33 }, body: { w: 1480, h: 1290, r: 76 }, strip: { x: 40, y: 674, w: 1200, h: 100, segments: 6 }, dials: { count: 6, d: 150, y: 1060, pitch: 216 }, note: '36 keys · 6 dials · touch strip' },
  neo: { id: 'neo', name: 'Stream Deck Neo', cols: 4, rows: 2, keyPx: 96, panel: { w: 480, h: 320, x0: 3, y0: 9, gapX: 30, gapY: 30 }, body: { w: 620, h: 452, r: 40 }, infobar: { x: 116, y: 262, w: 248, h: 58 }, touch: [{ x: 3, y: 283, w: 96, h: 16 }, { x: 381, y: 283, w: 96, h: 16 }], note: '8 keys · info bar' },
  mini: { id: 'mini', name: 'Stream Deck Mini', cols: 3, rows: 2, keyPx: 80, panel: { w: 320, h: 240, x0: 14, y0: 26, gapX: 27.5, gapY: 28 }, body: { w: 478, h: 340, r: 34 }, note: '6 keys' },
};
export const DEVICE_ORDER = ['galleon', 'plus', 'mk2', 'xl', 'plusxl', 'neo', 'mini'];

/** Front-face layout in body px (same math as prism-deck's deviceLayout). */
export function deviceLayout(id) {
  const d = DEVICES[id] || DEVICES.mk2;
  const P = d.panel;
  const px = (d.body.w - P.w) / 2;
  const py = d.dials?.above ? d.body.h - P.h - (d.body.w - P.w) / 2 : d.strip ? (d.body.w - P.w) / 2 : (d.body.h - P.h) / 2;
  const k = d.keyPx;
  const out = { id: d.id, name: d.name, w: d.body.w, h: d.body.h, r: d.body.r, panel: { x: px, y: py, w: P.w, h: P.h }, keys: [] };
  for (let row = 0; row < d.rows; row++) for (let col = 0; col < d.cols; col++) {
    out.keys.push({ i: row * d.cols + col, col, row, x: px + P.x0 + col * (k + P.gapX), y: py + P.y0 + row * (k + P.gapY), w: k, h: k });
  }
  if (d.strip) out.strip = { x: px + d.strip.x, y: py + d.strip.y, w: d.strip.w, h: d.strip.h, segments: d.strip.segments };
  if (d.dials) {
    const n = d.dials.count;
    let xs;
    if (d.dials.under === 'columns') xs = out.keys.slice(0, n).map((key) => key.x + key.w / 2);
    else if (d.dials.pitch) { const c = px + (d.strip ? d.strip.x + d.strip.w / 2 : P.w / 2); xs = Array.from({ length: n }, (_, i) => c + (i - (n - 1) / 2) * d.dials.pitch); }
    else xs = Array.from({ length: n }, (_, i) => px + (P.w * (i + 0.5)) / n);
    out.dials = xs.map((cx, i) => ({ i, cx, cy: d.dials.y, d: d.dials.d }));
  }
  if (d.infobar) out.infobar = { x: px + d.infobar.x, y: py + d.infobar.y, w: d.infobar.w, h: d.infobar.h };
  if (d.touch) out.touch = d.touch.map((t, i) => ({ i, x: px + t.x, y: py + t.y, w: t.w, h: t.h }));
  if (d.screen) {
    const S = d.screen, ww = S.w / S.widgets.cols, wh = S.h / S.widgets.rows;
    out.screen = { x: px + S.x, y: py + S.y, w: S.w, h: S.h };
    out.widgets = [];
    for (let layer = 0; layer < S.widgets.rows; layer++) for (let dial = 0; dial < S.widgets.cols; dial++) out.widgets.push({ dial, layer, x: px + S.x + dial * ww, y: py + S.y + layer * wh, w: ww, h: wh });
  }
  return out;
}

/** A wall's pixel canvas: every key at `key` px plus the gaps between keys (scaled from the panel). */
export function wallGrid(id, key = 144) {
  const d = DEVICES[id] || DEVICES.mk2;
  const s = key / d.keyPx;
  const gapX = Math.round(d.panel.gapX * s), gapY = Math.round(d.panel.gapY * s);
  const cells = [];
  for (let row = 0; row < d.rows; row++) for (let col = 0; col < d.cols; col++) cells.push({ i: row * d.cols + col, col, row, x: col * (key + gapX), y: row * (key + gapY) });
  return { cols: d.cols, rows: d.rows, key, gapX, gapY, w: d.cols * key + (d.cols - 1) * gapX, h: d.rows * key + (d.rows - 1) * gapY, cells };
}
