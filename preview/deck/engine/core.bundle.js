// prism-deck browser engine, bundled by website/build.mjs (the modules are in the repository under prism-deck/src).
const __d = [], __c = [];
function __m(id) {
  let ns = __c[id];
  if (ns) return ns;
  ns = __c[id] = Object.create(null);
  Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' });
  __d[id](ns);
  return ns;
}
function __e(ns, own, stars, keep) {
  const get = Object.assign(Object.create(null), own);
  for (const id of stars) { const from = __m(id); for (const k of Object.keys(from)) if (!(k in get)) get[k] = () => from[k]; }
  for (const k of keep) Object.defineProperty(ns, k, { enumerable: true, get: get[k] });
  Object.preventExtensions(ns);
}
__d[0] = function (__ns) {

__e(__ns, { "DATA": () => DATA, "DEVICES": () => DEVICES, "DEVICE_IDS": () => DEVICE_IDS, "LCD_DEVICES": () => LCD_DEVICES, "DIAL_DEVICES": () => DIAL_DEVICES, "STRIP_DEVICES": () => STRIP_DEVICES, "SCREEN_DEVICES": () => SCREEN_DEVICES, "FAMILY_DEVICES": () => FAMILY_DEVICES, "KEY_SIZES": () => KEY_SIZES, "getDevice": () => getDevice, "gridDevice": () => gridDevice, "deviceFromInfo": () => deviceFromInfo, "keySize": () => keySize, "GEOM_DECIMALS": () => GEOM_DECIMALS, "r2": () => r2, "spanGrid": () => spanGrid, "stripGrid": () => stripGrid, "screenOf": () => screenOf, "deckLayout": () => deckLayout, "deviceLayout": () => deviceLayout }, [], ["DATA","DEVICES","DEVICE_IDS","DIAL_DEVICES","FAMILY_DEVICES","GEOM_DECIMALS","KEY_SIZES","LCD_DEVICES","SCREEN_DEVICES","STRIP_DEVICES","deckLayout","deviceFromInfo","deviceLayout","getDevice","gridDevice","keySize","r2","screenOf","spanGrid","stripGrid"]);
const DATA = [
{"id":"original","name":"Stream Deck","vendor":"Elgato","type":0,"model":"20GAA9901","status":"discontinued","released":"2017-03-23","family":"classic","aliases":["original-v1","gen1"],"cols":5,"rows":3,"keyPx":{"w":72,"h":72},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":272,"x0":11,"y0":5,"gapX":25,"gapY":25},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":602,"h":428,"r":36}},
{"id":"original-v2","name":"Stream Deck","vendor":"Elgato","type":0,"model":"20GAA9902","status":"discontinued","released":"2019","family":"classic","aliases":["2019"],"cols":5,"rows":3,"keyPx":{"w":72,"h":72},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":272,"x0":11,"y0":5,"gapX":25,"gapY":25},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":602,"h":428,"r":36}},
{"id":"mk2","name":"Stream Deck MK.2","vendor":"Elgato","type":0,"model":"20GBA9901","status":"current","released":"2021-07-15","family":"classic","aliases":["standard","15-key"],"cols":5,"rows":3,"keyPx":{"w":72,"h":72},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":272,"x0":11,"y0":5,"gapX":25,"gapY":25},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":602,"h":428,"r":36}},
{"id":"scissor","name":"Stream Deck Scissor Keys","vendor":"Elgato","type":0,"model":"20GBL9901","status":"current","released":"2025","family":"classic","aliases":["scissor-keys"],"cols":5,"rows":3,"keyPx":{"w":72,"h":72},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":272,"x0":11,"y0":5,"gapX":25,"gapY":25},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":602,"h":428,"r":36}},
{"id":"mini","name":"Stream Deck Mini","vendor":"Elgato","type":1,"model":"20GAI9901","status":"discontinued (superseded by 2022 revision)","released":"2018","family":"mini","aliases":[],"cols":3,"rows":2,"keyPx":{"w":80,"h":80},"display":"lcd","sdk":true,"generic":false,"panel":{"w":320,"h":240,"x0":14,"y0":26,"gapX":27.5,"gapY":28},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":478,"h":340,"r":34}},
{"id":"mini-2022","name":"Stream Deck Mini","vendor":"Elgato","type":1,"model":"20GAI9902","status":"current","released":"2022","family":"mini","aliases":["mini-mk2"],"cols":3,"rows":2,"keyPx":{"w":80,"h":80},"display":"lcd","sdk":true,"generic":false,"panel":{"w":320,"h":240,"x0":14,"y0":26,"gapX":27.5,"gapY":28},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":478,"h":340,"r":34}},
{"id":"mini-discord","name":"Stream Deck Mini Discord Edition","vendor":"Elgato","type":1,"model":"20GAI9901","status":"current","released":"2025","family":"mini","aliases":[],"cols":3,"rows":2,"keyPx":{"w":80,"h":80},"display":"lcd","sdk":true,"generic":false,"panel":{"w":320,"h":240,"x0":14,"y0":26,"gapX":27.5,"gapY":28},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":478,"h":340,"r":34}},
{"id":"xl","name":"Stream Deck XL","vendor":"Elgato","type":2,"model":"20GAT9901","status":"discontinued (superseded by 2022 revision)","released":"2019","family":"xl","aliases":["xl-v1"],"cols":8,"rows":4,"keyPx":{"w":96,"h":96},"display":"lcd","sdk":true,"generic":false,"panel":{"w":1024,"h":600,"x0":14,"y0":47,"gapX":32.29,"gapY":39},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":1176,"h":730,"r":50}},
{"id":"xl-2022","name":"Stream Deck XL","vendor":"Elgato","type":2,"model":"20GAT9902","status":"current","released":"2022","family":"xl","aliases":[],"cols":8,"rows":4,"keyPx":{"w":96,"h":96},"display":"lcd","sdk":true,"generic":false,"panel":{"w":1024,"h":600,"x0":14,"y0":47,"gapX":32.29,"gapY":39},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":1176,"h":730,"r":50}},
{"id":"neo","name":"Stream Deck Neo","vendor":"Elgato","type":9,"model":"20GBJ9901","status":"current","released":"2024","family":"neo","aliases":[],"cols":4,"rows":2,"keyPx":{"w":96,"h":96},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":320,"x0":3,"y0":9,"gapX":30,"gapY":30},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":{"kind":"infobar","w":248,"h":58,"rect":[116,262,248,58],"layout":{"w":232,"h":50}},"body":{"w":620,"h":452,"r":40},"draw":{"touch":[[3,283,96,16,"left"],[381,283,96,16,"right"]]}},
{"id":"plus","name":"Stream Deck +","vendor":"Elgato","type":7,"model":"20GBD9901","status":"current","released":"2022","family":"plus","aliases":["sd+","stream-deck-plus"],"cols":4,"rows":2,"keyPx":{"w":120,"h":120},"display":"lcd","sdk":true,"generic":false,"panel":{"w":800,"h":480,"x0":13,"y0":12,"gapX":99,"gapY":40},"dials":{"count":4,"press":true,"touch":true,"rotate":true},"strip":{"w":800,"h":100,"segments":4,"rect":[0,380,800,100]},"screen":null,"body":{"w":1036,"h":1010,"r":70},"draw":{"panelY":118,"dials":{"d":156,"y":760,"under":"columns"}}},
{"id":"plusxl","name":"Stream Deck + XL","vendor":"Elgato","type":13,"model":"20GBX9901","status":"current","released":"2026-03-03","family":"plus","aliases":["plus-xl","sd+xl"],"cols":9,"rows":4,"keyPx":{"w":112,"h":112},"display":"lcd","sdk":true,"generic":false,"panel":{"w":1280,"h":800,"x0":11,"y0":32,"gapX":31.5,"gapY":31.33},"dials":{"count":6,"press":true,"touch":true,"rotate":true},"strip":{"w":1200,"h":100,"segments":6,"rect":[40,674,1200,100]},"screen":null,"body":{"w":1480,"h":1290,"r":76},"draw":{"panelY":100,"dials":{"d":150,"y":1060,"pitch":216}}},
{"id":"studio","name":"Stream Deck Studio","vendor":"Elgato","type":10,"model":"20GBO9901","status":"current","released":"2024","family":"studio","aliases":[],"cols":16,"rows":2,"keyPx":{"w":144,"h":112},"display":"lcd","sdk":false,"generic":false,"panel":{"w":2584,"h":280,"x0":20,"y0":20,"gapX":16,"gapY":16},"dials":{"count":2,"press":true,"touch":false,"rotate":true},"strip":null,"screen":null,"body":{"w":3110,"h":430,"r":26},"draw":{"dials":{"d":180,"y":215,"xs":[130,2980],"ring":true}}},
{"id":"pedal","name":"Stream Deck Pedal","vendor":"Elgato","type":5,"model":"20GBF9901","status":"current","released":"2022","family":"pedal","aliases":[],"cols":3,"rows":1,"keyPx":null,"display":"none","sdk":true,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":980,"h":520,"r":60},"draw":{"capW":253,"capH":340,"capGap":30,"capR":44}},
{"id":"module-6","name":"Stream Deck Module 6","vendor":"Elgato","type":1,"model":"20GAI9901","status":"current","released":"2025","family":"mini","aliases":[],"cols":3,"rows":2,"keyPx":{"w":80,"h":80},"display":"lcd","sdk":true,"generic":false,"panel":{"w":320,"h":240,"x0":14,"y0":26,"gapX":27.5,"gapY":28},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":420,"h":330,"r":12}},
{"id":"module-15","name":"Stream Deck Module 15","vendor":"Elgato","type":0,"model":"20GBA9901","status":"current","released":"2025","family":"classic","aliases":[],"cols":5,"rows":3,"keyPx":{"w":72,"h":72},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":272,"x0":11,"y0":5,"gapX":25,"gapY":25},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":540,"h":330,"r":12}},
{"id":"module-15-scissor","name":"Stream Deck Module 15","vendor":"Elgato","type":0,"model":"20GBL9901-DIY","status":"current (new)","released":"2026","family":"classic","aliases":[],"cols":5,"rows":3,"keyPx":{"w":72,"h":72},"display":"lcd","sdk":true,"generic":false,"panel":{"w":480,"h":272,"x0":11,"y0":5,"gapX":25,"gapY":25},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":540,"h":330,"r":12}},
{"id":"module-32","name":"Stream Deck Module 32","vendor":"Elgato","type":2,"model":"20GAT9902","status":"current","released":"2025","family":"xl","aliases":[],"cols":8,"rows":4,"keyPx":{"w":96,"h":96},"display":"lcd","sdk":true,"generic":false,"panel":{"w":1024,"h":600,"x0":14,"y0":47,"gapX":32.29,"gapY":39},"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":1100,"h":680,"r":14}},
{"id":"network-dock","name":"Stream Deck Network Dock","vendor":"Elgato","type":null,"model":"20GBW9901","status":"current (accessory)","released":"2025","family":"accessory","aliases":[],"cols":0,"rows":0,"keyPx":null,"display":"none","sdk":false,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null,"body":{"w":600,"h":200,"r":30}},
{"id":"mobile","name":"Stream Deck Mobile","vendor":"Elgato","type":3,"model":null,"status":"current (virtual)","released":null,"family":"virtual","aliases":[],"cols":5,"rows":3,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":true,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"virtual","name":"Virtual Stream Deck","vendor":"Elgato","type":11,"model":"UI Stream Deck","status":"current (virtual)","released":"2025","family":"virtual","aliases":["vsd"],"cols":8,"rows":4,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":true,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"mcp","name":"MCP Deck","vendor":"Elgato","type":14,"model":"AI Stream Deck","status":"current (virtual)","released":"2026-04","family":"virtual","aliases":["mcp-deck","ai-stream-deck"],"cols":8,"rows":4,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":true,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"galleon","name":"Corsair Galleon 100 SD","vendor":"Corsair","type":12,"model":"GRETSCH","status":"current","released":"2026-01-06","family":"galleon","aliases":["galleon-100-sd","gretsch"],"cols":3,"rows":4,"keyPx":{"w":160,"h":160},"display":"lcd","sdk":true,"generic":false,"panel":{"w":720,"h":1280,"x0":56,"y0":443,"gapX":64,"gapY":64},"dials":{"count":2,"press":true,"touch":false,"rotate":true,"layers":2},"strip":null,"screen":{"kind":"galleon","w":720,"h":384,"rect":[0,0,720,384],"layout":{"w":200,"h":100},"widgets":{"cols":2,"rows":2,"w":360,"h":180,"pitchX":360,"pitchY":192,"insetX":0,"insetY":6}},"body":{"w":880,"h":1660,"r":44},"draw":{"panelY":300,"dials":{"d":150,"y":150,"xs":[240,640]}}},
{"id":"galleon-pro-80","name":"Corsair Galleon PRO 80 SD","vendor":"Corsair","type":null,"model":"MARSHALL","status":"unconfirmed / pre-release (only seen inside the Stream Deck 7.6 app)","released":null,"family":"galleon","aliases":["marshall"],"cols":2,"rows":3,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"g-keys","name":"Corsair G-Keys","vendor":"Corsair","type":4,"model":null,"status":"current","released":"2020","family":"corsair","aliases":[],"cols":6,"rows":1,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":true,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"voyager","name":"Corsair Voyager","vendor":"Corsair","type":6,"model":null,"status":"current","released":"2022","family":"corsair","aliases":[],"cols":10,"rows":1,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"scuf","name":"SCUF Envision","vendor":"Corsair (SCUF)","type":8,"model":null,"status":"current","released":null,"family":"corsair","aliases":[],"cols":5,"rows":1,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"xeneon-edge","name":"Corsair Xeneon Edge","vendor":"Corsair","type":11,"model":"XENEON_EDGE","status":"current","released":"2025","family":"corsair","aliases":[],"cols":8,"rows":2,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":true,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":{"kind":"monitor","w":2560,"h":720,"rect":null,"layout":null}},
{"id":"nightsword","name":"Corsair Nightsword v2 Wireless SD","vendor":"Corsair","type":null,"model":"CORSAIR_ANCIENT_MICE","status":"current","released":"2026-06-30","family":"corsair","aliases":[],"cols":4,"rows":2,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"vanguard","name":"Corsair Vanguard 96 / 99","vendor":"Corsair","type":null,"model":"CORSAIR_ROLAND_KBD","status":"current","released":"2025","family":"corsair","aliases":[],"cols":7,"rows":1,"keyPx":{"w":144,"h":144},"display":"software","sdk":true,"generic":false,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
{"id":"plus-lever","name":"Stream Deck + Lever","vendor":"Elgato","type":null,"model":"20GBD9901LL","status":"fictional","released":"2026-04-01","family":"fictional","aliases":[],"cols":0,"rows":0,"keyPx":null,"display":"none","sdk":false,"generic":false,"hidden":true,"dials":{"count":0,"press":false,"touch":false,"rotate":false},"strip":null,"screen":null},
];
const DEVICES = Object.freeze(Object.fromEntries(DATA.map((d) => [d.id, Object.freeze(d)])));
const DEVICE_IDS = DATA.filter((d) => !d.hidden).map((d) => d.id);
const LCD_DEVICES = DEVICE_IDS.filter((id) => DEVICES[id].display === 'lcd' && !DEVICES[id].generic);
const DIAL_DEVICES = DEVICE_IDS.filter((id) => DEVICES[id].dials?.count);
const STRIP_DEVICES = DEVICE_IDS.filter((id) => DEVICES[id].strip);
const SCREEN_DEVICES = DEVICE_IDS.filter((id) => DEVICES[id].screen);
const FAMILY_DEVICES = ['mini', 'mk2', 'xl', 'neo', 'plus', 'plusxl', 'galleon', 'studio'].filter((id) => DEVICES[id]);
const KEY_SIZES = [...new Map(LCD_DEVICES.map((id) => { const k = DEVICES[id].keyPx; return [`${k.w}x${k.h}`, { w: k.w, h: k.h }]; })).values()].sort((a, b) => a.w - b.w || a.h - b.h);
function getDevice(q = 'mk2') {
if (q && typeof q === 'object' && 'cols' in q && 'keyPx' in q) return q;
if (typeof q === 'number') return DATA.find((d) => d.type === q && !d.hidden && !d.generic) || DATA.find((d) => d.type === q) || DEVICES.mk2;
const s = String(q).toLowerCase();
return DEVICES[s] || DATA.find((d) => d.aliases?.includes(s)) || DEVICES.mk2;
}
function gridDevice(base, cols, rows) {
const b = getDevice(base);
const c = cols || b.cols || 5, r = rows || b.rows || 3;
const k = b.display === 'lcd' && !b.generic ? b.keyPx : { w: 72, h: 72 };
const g = b.panel && !b.generic ? b.panel : { x0: 11, y0: 5, gapX: 25, gapY: 25 };
const w = g.x0 * 2 + c * k.w + (c - 1) * g.gapX, h = g.y0 * 2 + r * k.h + (r - 1) * g.gapY;
return { ...b, id: `${b.id}-${c}x${r}`, name: `${b.name} (${c}×${r})`, cols: c, rows: r, keyPx: k, generic: false, gridOf: b.id,
panel: { w, h, x0: g.x0, y0: g.y0, gapX: g.gapX, gapY: g.gapY }, body: { w: w + 120, h: h + 150, r: 36 }, strip: null, screen: null, dials: { count: 0 } };
}
function deviceFromInfo(info = {}) {
const cols = info.size?.columns, rows = info.size?.rows;
const byType = DATA.filter((d) => d.type === info.type && !d.hidden);
const exact = byType.find((d) => !d.generic && (!cols || (d.cols === cols && d.rows === rows)));
if (exact) return exact;
const base = byType[0] || (/galleon/i.test(info.name || '') ? DEVICES.galleon : DEVICES.virtual);
return cols && rows ? gridDevice(base, cols, rows) : base;
}
function keySize(device) {
const d = getDevice(device);
return d.display === 'lcd' && d.keyPx ? { w: d.keyPx.w, h: d.keyPx.h } : { w: 144, h: 144 };
}
const GEOM_DECIMALS = 2;
const r2 = (v) => { const x = Math.round(v * 100) / 100; return Object.is(x, -0) ? 0 : x; };
function spanGrid(device, { col = 0, row = 0, cols, rows, scale = 1 } = {}) {
const d = getDevice(device);
const c = Math.max(1, Math.min(cols ?? d.cols, d.cols - col)), r = Math.max(1, Math.min(rows ?? d.rows, d.rows - row));
const k = keySize(d);
const P = d.panel || { gapX: 25, gapY: 25 };
const kw = k.w * scale, kh = k.h * scale, gx = (P.gapX ?? 25) * scale, gy = (P.gapY ?? 25) * scale;
const cells = [];
for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) cells.push({ i: (row + y) * d.cols + (col + x), col: col + x, row: row + y, x: r2(x * (kw + gx)), y: r2(y * (kh + gy)), w: r2(kw), h: r2(kh) });
return { device: d.id, col, row, cols: c, rows: r, key: { w: r2(kw), h: r2(kh) }, gapX: r2(gx), gapY: r2(gy), w: r2(c * kw + (c - 1) * gx), h: r2(r * kh + (r - 1) * gy), cells };
}
function stripGrid(device) {
const d = getDevice(device);
if (!d.strip) return null;
return { w: d.strip.w, h: d.strip.h, rect: d.strip.rect, segments: Array.from({ length: d.strip.segments }, (_, i) => ({ i, x: i * (d.strip.w / d.strip.segments), w: d.strip.w / d.strip.segments, h: d.strip.h })) };
}
const screenOf = (device) => getDevice(device).screen || null;
function deckLayout(device, scale = 1) {
const d = getDevice(device);
const P = d.panel;
if (!P) return { w: 0, h: 0, keys: [] };
const k = keySize(d);
const keys = [];
for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) keys.push({ i: r * d.cols + c, col: c, row: r, x: r2((P.x0 + c * (k.w + P.gapX)) * scale), y: r2((P.y0 + r * (k.h + P.gapY)) * scale), w: r2(k.w * scale), h: r2(k.h * scale) });
const rect = (q) => (q ? { x: r2(q[0] * scale), y: r2(q[1] * scale), w: r2(q[2] * scale), h: r2(q[3] * scale) } : null);
const out = { w: r2(P.w * scale), h: r2(P.h * scale), scale, keys };
if (d.strip) out.strip = { ...rect(d.strip.rect), segments: d.strip.segments };
if (d.screen?.rect) out.screen = { ...rect(d.screen.rect), kind: d.screen.kind };
return out;
}
function deviceLayout(device) {
const d = getDevice(device);
const draw = d.draw || {};
const cw = draw.capW || 200, ch = draw.capH || 200, gap = draw.capGap || 40;
const body = d.body || (d.panel ? { w: d.panel.w + 120, h: d.panel.h + 150, r: 36 } : { w: d.cols * cw + (d.cols - 1) * gap + 140, h: d.rows * ch + (d.rows - 1) * gap + 140, r: 40 });
const out = { id: d.id, name: d.name, w: body.w, h: body.h, r: body.r, display: d.display, keys: [] };
if (d.display === 'none' || !d.panel) {
const n = d.cols * d.rows || 0;
const x0 = (body.w - (d.cols * cw + (d.cols - 1) * gap)) / 2, y0 = (body.h - (d.rows * ch + (d.rows - 1) * gap)) / 2;
for (let i = 0; i < n; i++) { const c = i % d.cols, r = Math.floor(i / d.cols); out.keys.push({ i, col: c, row: r, x: x0 + c * (cw + gap), y: y0 + r * (ch + gap), w: cw, h: ch, r: draw.capR ?? 40 }); }
return out;
}
const P = d.panel;
const px = draw.panelX ?? (body.w - P.w) / 2;
const py = draw.panelY ?? (body.h - P.h) / 2;
out.panel = { x: px, y: py, w: P.w, h: P.h };
const L = deckLayout(d);
for (const k of L.keys) out.keys.push({ ...k, x: k.x + px, y: k.y + py, r: Math.round(Math.min(k.w, k.h) * 0.14) });
if (L.strip) out.strip = { x: L.strip.x + px, y: L.strip.y + py, w: L.strip.w, h: L.strip.h, r: 10, segments: L.strip.segments };
if (d.screen?.rect) {
const S = { x: d.screen.rect[0] + px, y: d.screen.rect[1] + py, w: d.screen.rect[2], h: d.screen.rect[3], r: d.screen.kind === 'infobar' ? 6 : 10, kind: d.screen.kind };
if (d.screen.kind === 'infobar') out.infobar = S; else out.screen = S;
if (d.screen.widgets) {
const { cols, rows, w: ww = S.w / cols, h: wh = S.h / rows, pitchX = ww, pitchY = wh, insetX = 0, insetY = 0 } = d.screen.widgets;
out.widgets = [];
for (let layer = 0; layer < rows; layer++) for (let dial = 0; dial < cols; dial++) out.widgets.push({ dial, layer, x: S.x + dial * pitchX + insetX, y: S.y + layer * pitchY + insetY, w: ww, h: wh });
}
}
if (draw.touch) out.touch = draw.touch.map(([x, y, w, h, dir], i) => ({ i, x: x + px, y: y + py, w, h, dir }));
if (d.dials?.count && draw.dials) {
const n = d.dials.count, D = draw.dials;
let xs;
if (D.under === 'columns') xs = out.keys.slice(0, n).map((k) => k.x + k.w / 2);
else if (D.xs) xs = D.xs;
else { const c = px + (d.strip ? d.strip.rect[0] + d.strip.rect[2] / 2 : P.w / 2); const pitch = D.pitch || P.w / n; xs = Array.from({ length: n }, (_, i) => c + (i - (n - 1) / 2) * pitch); }
out.dials = xs.map((cx, i) => ({ i, cx, cy: D.y, d: D.d, touch: !!d.dials.touch, layers: d.dials.layers || 1, ring: !!D.ring }));
}
return out;
}
};
__d[1] = function (__ns) {

__e(__ns, { "rng": () => rng, "hash": () => hash, "noise1": () => noise1, "noise2": () => noise2, "fbm1": () => fbm1, "metric": () => metric, "series": () => series }, [], ["fbm1","hash","metric","noise1","noise2","rng","series"]);
function rng(seed = 7) {
let a = (seed >>> 0) || 0x9e3779b9;
return () => {
a = (a + 0x6d2b79f5) >>> 0;
let t = a;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
function hash(...ints) {
let h = 0x811c9dc5;
for (const v of ints) {
h ^= (v | 0) + 0x9e3779b9 + (h << 6) + (h >>> 2);
h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
h ^= h >>> 16;
}
return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
function noise1(x, seed = 0) {
const i = Math.floor(x), f = x - i;
const a = hash(i, seed), b = hash(i + 1, seed);
return a + (b - a) * fade(f);
}
function noise2(x, y, seed = 0) {
const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm1(x, seed = 0, octaves = 3) {
let sum = 0, amp = 0.5, norm = 0, f = 1;
for (let o = 0; o < octaves; o++) { sum += amp * noise1(x * f, seed + o * 101); norm += amp; amp *= 0.5; f *= 2; }
return sum / norm;
}
function metric(t, seed = 0, { lo = 0.15, hi = 0.85, speed = 0.35, jitter = 0.18 } = {}) {
const drift = fbm1(t * speed, seed, 3);
const fast = noise1(t * speed * 6, seed + 977) - 0.5;
const v = drift + fast * jitter;
return lo + (hi - lo) * Math.min(1, Math.max(0, v));
}
function series(t, seed = 0, count = 24, { step = 0.5, ...opts } = {}) {
const end = Math.floor(t / step);
const frac = t / step - end;
const out = [];
for (let i = count - 1; i >= 0; i--) out.push(metric((end - i) * step, seed, opts));
return { values: out, frac };
}
};
__d[2] = function (__ns) {

__e(__ns, { "GALLERIES": () => GALLERIES, "GALLERY_IDS": () => GALLERY_IDS, "getGallery": () => getGallery, "GLYPH_CATEGORIES": () => GLYPH_CATEGORIES }, [], ["GALLERIES","GALLERY_IDS","GLYPH_CATEGORIES","getGallery"]);
const GALLERIES = [
{
id: 'themes', title: 'Themes', icon: 'layers', hue: 296, prefix: ['theme'], surfaces: ['deck'],
blurb: 'One facet per deck theme: the whole device dressed in that material — every glyph, label, state and press.',
categories: ['Signature', 'Dark', 'Light', 'Experimental'],
},
{
id: 'icons', title: 'Icons', icon: 'grid', hue: 269.8, prefix: ['icon'], surfaces: ['key'],
blurb: 'One facet per glyph — 48-unit geometry with states and idle motion, rendered in any theme.',
categories: ['Media', 'Audio', 'Streaming', 'System', 'Status', 'Time', 'Navigation', 'Productivity', 'Dev & Ops', 'Home & Light',
'Building', 'Editing', 'Windows', 'Games'],
},
{
id: 'motion', title: 'Motion', icon: 'pulse', hue: 243.6, prefix: ['press', 'state', 'idle', 'alert'], surfaces: ['key'],
blurb: 'Key animations built for the hardware: press feedback, state transitions, idle loops and alerts.',
categories: ['Press Feedback', 'State Transitions', 'Idle Loops', 'Alerts & Attention'],
},
{
id: 'spans', title: 'Spans', icon: 'waveform', hue: 191.3, prefix: ['span'], surfaces: ['span', 'deck'],
blurb: 'Animations across blocks of keys — the physical gaps are hidden pixels, so motion reads continuous behind the bezel; deck walls carry on across the + strip and the Galleon screen.',
categories: ['Waveforms & Audio', 'Bars & Meters', 'Text & Marquee', 'Ripples & Light', 'Whole Device'],
},
{
id: 'dials', title: 'Dials & Strips', icon: 'sliders', hue: 138.9, prefix: ['dial', 'strip'], surfaces: ['strip'],
blurb: 'Stream Deck + / + XL encoders: 200×100 dial segments and full touch-strip panoramas.',
categories: ['Dial Segments', 'Strip Panoramas', 'Gauges & Scrubbers'],
},
{
id: 'screens', title: 'Screens', icon: 'monitor', hue: 86.5, prefix: ['screen'], surfaces: ['screen', 'strip'],
blurb: 'Display widgets: the Galleon 100 SD screen, the Neo info bar and Stream Deck + strip dashboards.',
categories: ['Galleon Dashboards', 'Neo Info Bar', 'Strip Dashboards'],
},
{
id: 'apps', title: 'Apps', icon: 'cpu', hue: 60.4, prefix: ['app'], surfaces: ['key', 'span', 'strip', 'screen', 'deck'],
blurb: 'Live apps composed from the above plus data sources: audio, system, clocks and timers, controls (meeting, scene and media keys), dashboards.',
categories: ['Audio', 'System', 'Clocks & Timers', 'Controls', 'Dashboards'],
},
{
id: 'games', title: 'Games', icon: 'target', hue: 34.2, prefix: ['game'], surfaces: ['key', 'span', 'deck'],
blurb: 'Games and toys played on the keys: puzzles across a block of keys, chance and reflex games on one — stateful facets (scene/game.js).',
categories: ['Puzzles', 'Chance', 'Reflex', 'Board'],
},
{
id: 'gamelink', title: 'Game Link', icon: 'link', hue: 217.5, prefix: ['gamelink'], surfaces: ['key', 'span', 'strip', 'screen', 'deck'],
blurb: 'Your game on the deck: live Counter-Strike 2 data (Valve Game State Integration) and local companions drive health, ammo, money, rounds and whole-deck moments.',
categories: ['Whole Deck', 'Vitals', 'Round & Bomb', 'Match', 'Strips & Screens'],
},
];
const GALLERY_IDS = GALLERIES.map((g) => g.id);
const BY_ID = new Map(GALLERIES.map((g) => [g.id, g]));
const getGallery = (id) => BY_ID.get(id) || null;
const GLYPH_CATEGORIES = {
media: 'Media', audio: 'Audio', stream: 'Streaming', system: 'System', status: 'Status', time: 'Time',
nav: 'Navigation', productivity: 'Productivity', dev: 'Dev & Ops', home: 'Home & Light',
build: 'Building', edit: 'Editing', window: 'Windows', game: 'Games',
};
};
__d[3] = function (__ns) {

__e(__ns, { "TOKENS": () => TOKENS }, [], ["TOKENS"]);
const TOKENS = {
"source": "design/tokens.json v1.3.0",
"version": "1.3.0",
"modes": {
"night": {
"bg": "#0a0c12",
"bgDeep": "#06070b",
"panel": "#10131c",
"panel2": "#171a25",
"card": "#12151f",
"line": "#252834",
"lineStrong": "#343849",
"lineControl": "#6b6f84",
"ink": "#f0f0f5",
"muted": "#a2a4b4",
"dim": "#8a8c9d",
"faint": "#565a6c",
"accent": "#b8a2f2",
"accentHi": "#cbb9f7",
"accent2": "#a8b9fc",
"accentInk": "#151021",
"info": "#86bdf9",
"pos": "#8bd8ba",
"warn": "#eec36f",
"neg": "#f5877f",
"crit": "#f07fb3",
"glassTop": "#161a27",
"glassMid": "#0b0d14",
"glassBottom": "#06070b",
"edge": "#ffffff",
"edgeOpacity": 0.08,
"beam": "#ffffff",
"beamOpacity": 0.92,
"sheenOpacity": 0.1,
"spectrum": {
"l": 0.715,
"c": 0.13
},
"stops": [
{
"name": "violet",
"h": 296,
"lambda": "436",
"ink": "#c2aef8",
"vivid": "#ab91eb",
"wash": null
},
{
"name": "periwinkle",
"h": 269.8,
"lambda": "472",
"ink": "#a2b9ff",
"vivid": "#839ef4",
"wash": null
},
{
"name": "azure",
"h": 243.6,
"lambda": "479",
"ink": "#7fc4fb",
"vivid": "#52acee",
"wash": null
},
{
"name": "cerulean",
"h": 217.5,
"lambda": "485",
"ink": "#64ceea",
"vivid": "#00b8db",
"wash": null
},
{
"name": "cyan",
"h": 191.3,
"lambda": "492",
"ink": "#61d5d0",
"vivid": "#00c3be",
"wash": null
},
{
"name": "mint",
"h": 165.1,
"lambda": "510",
"ink": "#7dd9b2",
"vivid": "#52cea0",
"wash": null
},
{
"name": "jade",
"h": 138.9,
"lambda": "554",
"ink": "#a5d996",
"vivid": "#94d582",
"wash": null
},
{
"name": "lime",
"h": 112.7,
"lambda": "569",
"ink": "#ccd381",
"vivid": "#c9d168",
"wash": null
},
{
"name": "citrine",
"h": 86.5,
"lambda": "578",
"ink": "#eac779",
"vivid": "#ebc059",
"wash": null
},
{
"name": "amber",
"h": 60.4,
"lambda": "585",
"ink": "#fab880",
"vivid": "#f8a75f",
"wash": null
},
{
"name": "coral",
"h": 34.2,
"lambda": "597",
"ink": "#ffaa96",
"vivid": "#f69077",
"wash": null
},
{
"name": "rose",
"h": 8,
"lambda": "494c",
"ink": "#faa2b2",
"vivid": "#ec8398",
"wash": null
}
]
},
"day": {
"bg": "#f6f5f9",
"bgDeep": "#ecebf3",
"panel": "#ffffff",
"panel2": "#f0eff6",
"card": "#fdfcff",
"line": "#dedce9",
"lineStrong": "#c9c6d8",
"lineControl": "#8a879d",
"ink": "#20202e",
"muted": "#55556a",
"dim": "#68687c",
"faint": "#a9a8b8",
"accent": "#7353bb",
"accentHi": "#6142aa",
"accent2": "#4a62c6",
"accentInk": "#ffffff",
"info": "#2461bf",
"pos": "#1f6b4f",
"warn": "#8a5a00",
"neg": "#bf3434",
"crit": "#b0256f",
"glassTop": "#ffffff",
"glassMid": "#f4f3f8",
"glassBottom": "#e9e7f1",
"edge": "#ffffff",
"edgeOpacity": 1,
"beam": "#7353bb",
"beamOpacity": 0.92,
"sheenOpacity": 0.12,
"spectrum": {
"l": 0.646,
"c": 0.16
},
"stops": [
{
"name": "violet",
"h": 296,
"lambda": "436",
"ink": "#7555b8",
"vivid": "#9876e3",
"wash": "#ebe5ff"
},
{
"name": "periwinkle",
"h": 269.8,
"lambda": "472",
"ink": "#4961bf",
"vivid": "#6783ec",
"wash": "#e1e9ff"
},
{
"name": "azure",
"h": 243.6,
"lambda": "479",
"ink": "#006ca9",
"vivid": "#0090de",
"wash": "#d7edff"
},
{
"name": "cerulean",
"h": 217.5,
"lambda": "485",
"ink": "#007188",
"vivid": "#0096b3",
"wash": "#cbf1fc"
},
{
"name": "cyan",
"h": 191.3,
"lambda": "492",
"ink": "#007471",
"vivid": "#009995",
"wash": "#cbf3f0"
},
{
"name": "mint",
"h": 165.1,
"lambda": "510",
"ink": "#007655",
"vivid": "#009c71",
"wash": "#d1f3e3"
},
{
"name": "jade",
"h": 138.9,
"lambda": "554",
"ink": "#2e760f",
"vivid": "#4c9b32",
"wash": "#dcf1d6"
},
{
"name": "lime",
"h": 112.7,
"lambda": "569",
"ink": "#686c00",
"vivid": "#8a8f00",
"wash": "#e9edcd"
},
{
"name": "citrine",
"h": 86.5,
"lambda": "578",
"ink": "#836300",
"vivid": "#ac8300",
"wash": "#f6e8ca"
},
{
"name": "amber",
"h": 60.4,
"lambda": "585",
"ink": "#9c5600",
"vivid": "#cc7300",
"wash": "#ffe4cf"
},
{
"name": "coral",
"h": 34.2,
"lambda": "597",
"ink": "#b2432a",
"vivid": "#de6448",
"wash": "#ffe2db"
},
{
"name": "rose",
"h": 8,
"lambda": "494c",
"ink": "#b13f5d",
"vivid": "#de5f7d",
"wash": "#ffe1e5"
}
]
}
},
"deck": {
"surfaceHue": 66,
"surfaceLambda": "λ 584",
"safe": {
"bleed": 4,
"content": 6,
"text": 8
},
"grid": 4,
"type": {
"value": {
"size": 22,
"weight": 600,
"tracking": -0.02
},
"label": {
"size": 11,
"weight": 600,
"tracking": 0,
"maxLines": 2
},
"micro": {
"size": 8,
"weight": 600,
"tracking": 0.08,
"caps": true
},
"dialValue": {
"size": 34,
"weight": 600
},
"dialLabel": {
"size": 14,
"weight": 600,
"tracking": 0.1,
"caps": true
},
"minimum": 8
},
"index": {
"w": 16,
"h": 2,
"bottom": 6,
"offOpacity": 0.45,
"glow": 3
},
"ring": {
"on": 1.5,
"alert": 2
},
"notch": 12,
"wash": 0.22,
"alertBreath": {
"hz": 1,
"min": 0.55,
"max": 1,
"holdAfter": 10
},
"busyLap": 1.2,
"fps": {
"cap": 10,
"key": 10,
"span": 10,
"strip": 12,
"screen": 8,
"deck": 8
},
"motion": {
"arrive": 0.4,
"press": 0.24,
"fast": 0.14
}
}
};
};
__d[4] = function (__ns) {
const { TOKENS } = __m(3);
__e(__ns, { "parseHex": () => parseHex, "toHex": () => toHex, "hexToOklab": () => hexToOklab, "oklabToHex": () => oklabToHex, "hexToOklch": () => hexToOklch, "oklch": () => oklch, "mix": () => mix, "shade": () => shade, "saturate": () => saturate, "luminance": () => luminance, "contrast": () => contrast, "bestInk": () => bestInk, "lambdaOf": () => lambdaOf, "hueRamp": () => hueRamp }, [], ["bestInk","contrast","hexToOklab","hexToOklch","hueRamp","lambdaOf","luminance","mix","oklabToHex","oklch","parseHex","saturate","shade","toHex"]);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;
function parseHex(hex) {
const s = String(hex).trim();
let m = s.match(HEX6);
if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
m = s.match(HEX3);
if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
throw new Error(`not a hex color: ${hex}`);
}
function toHex([r, g, b]) {
const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
return `#${h(r)}${h(g)}${h(b)}`;
}
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const oklabMemo = new Map();
function hexToOklab(hex) {
let v = oklabMemo.get(hex);
if (!v) {
if (oklabMemo.size > 1024) oklabMemo.clear();
v = hexToOklabRaw(hex);
oklabMemo.set(hex, v);
}
return [v[0], v[1], v[2]]; 
}
function hexToOklabRaw(hex) {
const [r, g, b] = parseHex(hex).map(toLinear);
const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
return [
0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
];
}
function oklabToLinear(L, a, b) {
const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
return [
4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
];
}
function oklabToHex(L, a, b) {
return toHex(oklabToLinear(L, a, b).map((c) => fromLinear(clamp01(c))));
}
function hexToOklch(hex) {
const [L, a, b] = hexToOklab(hex);
const C = Math.hypot(a, b);
let H = (Math.atan2(b, a) * 180) / Math.PI;
if (H < 0) H += 360;
return [L, C, C < 1e-4 ? 0 : H];
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
function oklch(L, C, H) {
const h = (((H % 360) + 360) % 360) * Math.PI / 180;
const at = (c) => oklabToLinear(L, c * Math.cos(h), c * Math.sin(h));
let rgb = at(C);
if (!inGamut(rgb)) {
let lo = 0, hi = C;
for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (inGamut(at(mid))) lo = mid; else hi = mid; }
rgb = at(lo);
}
return toHex(rgb.map((c) => fromLinear(clamp01(c))));
}
function mix(a, b, t) {
const A = hexToOklab(a), B = hexToOklab(b);
const k = clamp01(t);
return oklabToHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
}
function shade(hex, dl, chroma = 1) {
const [L, C, H] = hexToOklch(hex);
return oklch(clamp01(L + dl), C * chroma, H);
}
function saturate(hex, k) {
const [L, C, H] = hexToOklch(hex);
return oklch(L, C * k, H);
}
function luminance(hex) {
const [r, g, b] = parseHex(hex).map(toLinear);
return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
return (x + 0.05) / (y + 0.05);
}
function bestInk(bg, candidates = ['#ffffff', '#000000']) {
return candidates.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best), candidates[0]);
}
const STOPS = (TOKENS.modes?.night?.stops || []).filter((s) => s.lambda).map((s) => ({ h: s.h, label: s.lambda, nm: parseFloat(s.lambda), comp: /c$/.test(s.lambda) })).sort((a, b) => a.h - b.h);
const FALLBACK = [[0, 640], [25, 625], [50, 605], [75, 588], [100, 574], [130, 556], [150, 532], [180, 506], [205, 490], [235, 474], [260, 460], [285, 440], [305, 422], [330, 404], [360, 640]];
function lambdaOf(hue) {
const h = ((hue % 360) + 360) % 360;
if (STOPS.length) {
const exact = STOPS.find((s) => Math.abs(s.h - h) < 0.05 || Math.abs(s.h - h) > 359.95);
if (exact) return exact.comp ? exact.label : exact.nm;
const i = STOPS.findIndex((s) => s.h > h);
const hi = i < 0 ? STOPS[0] : STOPS[i], lo = i <= 0 ? STOPS[STOPS.length - 1] : STOPS[i - 1];
const span = ((hi.h - lo.h) + 360) % 360 || 360, f = (((h - lo.h) + 360) % 360) / span;
if (lo.comp || hi.comp) { const near = f < 0.5 ? lo : hi; return near.comp ? near.label : near.nm; }
return Math.round(lo.nm + (hi.nm - lo.nm) * f);
}
for (let k = 1; k < FALLBACK.length; k++) {
const [h1, l1] = FALLBACK[k], [h0, l0] = FALLBACK[k - 1];
if (h <= h1) return Math.round(l0 + ((h - h0) / (h1 - h0)) * (l1 - l0));
}
return 640;
}
function hueRamp(h0, h1, n) {
if (n <= 1) return [h0];
return Array.from({ length: n }, (_, i) => h0 + ((h1 - h0) * i) / (n - 1));
}
};
__d[5] = function (__ns) {

__e(__ns, { "SVG_NS": () => SVG_NS, "n": () => n, "esc": () => esc, "attrs": () => attrs, "el": () => el, "g": () => g, "defs": () => defs, "rect": () => rect, "circle": () => circle, "ellipse": () => ellipse, "line": () => line, "path": () => path, "polyline": () => polyline, "polygon": () => polygon, "points": () => points, "url": () => url, "linearGradient": () => linearGradient, "radialGradient": () => radialGradient, "fill": () => fill, "stroke": () => stroke, "translate": () => translate, "rotate": () => rotate, "scale": () => scale, "P": () => P, "roundRectPath": () => roundRectPath, "svgDoc": () => svgDoc, "SvgCanvas": () => SvgCanvas, "svgInner": () => svgInner, "svgWindow": () => svgWindow, "suffixIds": () => suffixIds, "base64": () => base64, "svgDataUrl": () => svgDataUrl }, [], ["P","SVG_NS","SvgCanvas","attrs","base64","circle","defs","el","ellipse","esc","fill","g","line","linearGradient","n","path","points","polygon","polyline","radialGradient","rect","rotate","roundRectPath","scale","stroke","suffixIds","svgDataUrl","svgDoc","svgInner","svgWindow","translate","url"]);
const SVG_NS = 'http://www.w3.org/2000/svg';
function n(v, d = 2) {
if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`svg: non-finite number ${v}`);
const p = 10 ** d;
const r = Math.round(v * p) / p;
return Object.is(r, -0) || r === 0 ? '0' : String(r);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CAMEL = new Set(['viewBox', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
'patternUnits', 'patternTransform', 'preserveAspectRatio', 'stdDeviation', 'filterUnits', 'primitiveUnits', 'textLength', 'lengthAdjust',
'baseFrequency', 'numOctaves', 'tableValues', 'kernelMatrix', 'markerWidth', 'markerHeight', 'refX', 'refY']);
const attrName = (k) => (CAMEL.has(k) || !/[A-Z]/.test(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
function attrs(obj) {
if (!obj) return '';
let out = '';
for (const k in obj) {
const v = obj[k];
if (v === null || v === undefined || v === false) continue;
out += ` ${attrName(k)}="${typeof v === 'number' ? n(v) : esc(v)}"`;
}
return out;
}
const flat = (children) => {
let out = '';
for (const c of children) {
if (c === null || c === undefined || c === false || c === '') continue;
out += Array.isArray(c) ? flat(c) : String(c);
}
return out;
};
function el(tag, a, ...children) {
const body = flat(children);
return body ? `<${tag}${attrs(a)}>${body}</${tag}>` : `<${tag}${attrs(a)}/>`;
}
const g = (a, ...children) => el('g', a, ...children);
const defs = (...children) => el('defs', null, ...children);
const rect = (a) => el('rect', a);
const circle = (a) => el('circle', a);
const ellipse = (a) => el('ellipse', a);
const line = (a) => el('line', a);
const path = (d, a) => el('path', { d: String(d), ...a });
const polyline = (pts, a) => el('polyline', { points: points(pts), ...a });
const polygon = (pts, a) => el('polygon', { points: points(pts), ...a });
const points = (pts) => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
const url = (id) => `url(#${id})`;
const stops = (list) => list.map(([o, c, op]) => el('stop', { offset: n(o, 4), stopColor: c, stopOpacity: op === undefined || op === 1 ? null : op })).join('');
const linearGradient = (id, list, a = {}) => el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...a }, stops(list));
const radialGradient = (id, list, a = {}) => el('radialGradient', { id, cx: 0.5, cy: 0.5, r: 0.5, ...a }, stops(list));
const fill = (color, opacity) => ({ fill: color, fillOpacity: opacity === undefined || opacity >= 1 ? null : Math.max(0, opacity) });
const stroke = (color, width = 1, opacity) => ({ stroke: color, strokeWidth: width, strokeOpacity: opacity === undefined || opacity >= 1 ? null : Math.max(0, opacity) });
const translate = (x, y) => `translate(${n(x)} ${n(y)})`;
const rotate = (a, cx = 0, cy = 0) => `rotate(${n(a)} ${n(cx)} ${n(cy)})`;
const scale = (sx, sy = sx) => `scale(${n(sx, 4)} ${n(sy, 4)})`;
function P() {
const parts = [];
const api = {
M: (x, y) => (parts.push(`M${n(x)} ${n(y)}`), api),
L: (x, y) => (parts.push(`L${n(x)} ${n(y)}`), api),
H: (x) => (parts.push(`H${n(x)}`), api),
V: (y) => (parts.push(`V${n(y)}`), api),
C: (x1, y1, x2, y2, x, y) => (parts.push(`C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)}`), api),
Q: (x1, y1, x, y) => (parts.push(`Q${n(x1)} ${n(y1)} ${n(x)} ${n(y)}`), api),
A: (rx, ry, rot, large, sweep, x, y) => (parts.push(`A${n(rx)} ${n(ry)} ${n(rot)} ${large ? 1 : 0} ${sweep ? 1 : 0} ${n(x)} ${n(y)}`), api),
Z: () => (parts.push('Z'), api),
get d() { return parts.join(''); },
toString() { return parts.join(''); },
};
return api;
}
function roundRectPath(x, y, w, h, r) {
const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
const p = P().M(x + tl, y).H(x + w - tr);
if (tr) p.A(tr, tr, 0, 0, 1, x + w, y + tr);
p.V(y + h - br);
if (br) p.A(br, br, 0, 0, 1, x + w - br, y + h);
p.H(x + bl);
if (bl) p.A(bl, bl, 0, 0, 1, x, y + h - bl);
p.V(y + tl);
if (tl) p.A(tl, tl, 0, 0, 1, x + tl, y);
return p.Z().d;
}
function svgDoc({ w, h, viewBox, body = '', defs: d = '', title }) {
const vb = viewBox || `0 0 ${n(w)} ${n(h)}`;
return `<svg xmlns="${SVG_NS}" width="${n(w)}" height="${n(h)}" viewBox="${vb}">${title ? `<title>${esc(title)}</title>` : ''}${d ? `<defs>${d}</defs>` : ''}${body}</svg>`;
}
class SvgCanvas {
constructor({ w, h, idPrefix = 'pd', title } = {}) {
this.w = w;
this.h = h;
this.idPrefix = idPrefix;
this.title = title;
this._defs = [];
this._body = [];
this._ids = new Set();
}
id(name) {
let base = `${this.idPrefix}-${String(name).replace(/[^a-zA-Z0-9_-]/g, '')}`, out = base, i = 2;
while (this._ids.has(out)) out = `${base}${i++}`;
this._ids.add(out);
return out;
}
def(...markup) { this._defs.push(flat(markup)); return this; }
add(...markup) { this._body.push(flat(markup)); return this; }
get body() { return this._body.join(''); }
get defs() { return this._defs.join(''); }
svg() { return svgDoc({ w: this.w, h: this.h, body: this.body, defs: this.defs, title: this.title }); }
}
function svgInner(svg) {
const a = svg.indexOf('>', svg.indexOf('<svg'));
const b = svg.lastIndexOf('</svg>');
if (a < 0 || b < 0) throw new Error('svgInner: not an <svg> document');
return svg.slice(a + 1, b);
}
function svgWindow(svg, { x, y, w, h, outW = w, outH = h, idSuffix = '' }) {
let inner = svgInner(svg);
if (idSuffix) inner = suffixIds(inner, idSuffix);
return `<svg xmlns="${SVG_NS}" width="${n(outW)}" height="${n(outH)}" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">${inner}</svg>`;
}
function suffixIds(markup, suffix) {
const ids = new Set();
for (const m of markup.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
if (!ids.size) return markup;
return markup
.replace(/\sid="([^"]+)"/g, (m, id) => ` id="${id}${suffix}"`)
.replace(/url\(#([^)]+)\)/g, (m, id) => (ids.has(id) ? `url(#${id}${suffix})` : m))
.replace(/href="#([^"]+)"/g, (m, id) => (ids.has(id) ? `href="#${id}${suffix}"` : m));
}
function base64(str) {
const bytes = new TextEncoder().encode(str);
const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let out = '', i = 0;
for (; i + 2 < bytes.length; i += 3) {
const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
out += T[v >> 18] + T[(v >> 12) & 63] + T[(v >> 6) & 63] + T[v & 63];
}
if (i < bytes.length) {
const v = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8);
out += T[v >> 18] + T[(v >> 12) & 63] + (i + 1 < bytes.length ? T[(v >> 6) & 63] : '=') + '=';
}
return out;
}
function svgDataUrl(svg, { base64: b64 = true } = {}) {
return b64 ? `data:image/svg+xml;base64,${base64(svg)}` : `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
};
__d[6] = function (__ns) {

__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
family: 'Inter',
weight: 400,
unitsPerEm: 2048,
ascender: 1984,
descender: -494,
capHeight: 1490,
xHeight: 1118,
chars: {
"0": [1292, "M 646 -20 Q 480 -20 363 70 Q 246 160 184 330.5 Q 122 501 122 744 Q 122 986 184.5 1157 Q 247 1328 364 1419 Q 481 1510 646 1510 Q 811 1510 928.5 1419 Q 1046 1328 1108 1157 Q 1170 986 1170 744 Q 1170 502 1108.5 331 Q 1047 160 930 70 Q 813 -20 646 -20 Z M 646 146 Q 755 146 831 217 Q 907 288 947 421.5 Q 987 555 987 744 Q 987 934 947 1068.5 Q 907 1203 831 1274 Q 755 1345 646 1345 Q 537 1345 461 1273.5 Q 385 1202 345 1068 Q 305 934 305 744 Q 305 555 345 421.5 Q 385 288 461 217 Q 537 146 646 146 Z"],
"1": [833, "M 653 1490 L 653 0 L 466 0 L 466 1314 L 456 1314 L 96 1047 L 96 1251 L 420 1490 Z"],
"2": [1249, "M 154 0 L 154 137 L 649 674 Q 732 764 787 832 Q 842 900 870 961.5 Q 898 1023 898 1092 Q 898 1170 861 1227 Q 824 1284 761 1314.5 Q 698 1345 618 1345 Q 533 1345 470.5 1310.5 Q 408 1276 374 1213.5 Q 340 1151 340 1067 L 158 1067 Q 158 1199 219 1299 Q 280 1399 385 1454.5 Q 490 1510 623 1510 Q 756 1510 858.5 1454.5 Q 961 1399 1019.5 1305 Q 1078 1211 1078 1094 Q 1078 1013 1049 936.5 Q 1020 860 947 763 Q 874 666 742 526 L 416 179 L 416 167 L 1103 167 L 1103 0 Z"],
"3": [1265, "M 635 -20 Q 489 -20 376 30 Q 263 80 196.5 169 Q 130 258 125 376 L 317 376 Q 323 305 365.5 253.5 Q 408 202 477.5 174.5 Q 547 147 632 147 Q 726 147 798.5 179.5 Q 871 212 913 271 Q 955 330 955 407 Q 955 488 914.5 549.5 Q 874 611 797 646 Q 720 681 609 681 L 488 681 L 488 846 L 609 846 Q 696 846 762.5 877.5 Q 829 909 866 966 Q 903 1023 903 1100 Q 903 1174 870.5 1229 Q 838 1284 778 1314.5 Q 718 1345 637 1345 Q 561 1345 494.5 1317.5 Q 428 1290 385.5 1239 Q 343 1188 340 1115 L 157 1115 Q 161 1232 227 1321 Q 293 1410 401.5 1460 Q 510 1510 641 1510 Q 780 1510 880.5 1454 Q 981 1398 1035 1307 Q 1089 1216 1089 1110 Q 1089 984 1022.5 896 Q 956 808 842 774 L 842 762 Q 937 747 1004.5 698 Q 1072 649 1107.5 574 Q 1143 499 1143 405 Q 1143 283 1077 187 Q 1011 91 896 35.5 Q 781 -20 635 -20 Z"],
"4": [1323, "M 120 303 L 120 458 L 772 1490 L 887 1490 L 887 1252 L 810 1252 L 323 482 L 323 470 L 1205 470 L 1205 303 Z M 821 0 L 821 349 L 822 422 L 822 1490 L 1003 1490 L 1003 0 Z"],
"5": [1215, "M 596 -20 Q 465 -20 361 31.5 Q 257 83 195 172.5 Q 133 262 128 376 L 312 376 Q 318 310 357 258 Q 396 206 458.5 176.5 Q 521 147 596 147 Q 686 147 756.5 189 Q 827 231 867 305 Q 907 379 907 473 Q 907 569 865 645 Q 823 721 750.5 764.5 Q 678 808 584 808 Q 515 808 444 786 Q 373 764 329 730 L 151 752 L 239 1490 L 1023 1490 L 1023 1323 L 399 1323 L 348 888 L 356 888 Q 402 926 472 950.5 Q 542 975 619 975 Q 721 975 807.5 938 Q 894 901 958 833.5 Q 1022 766 1057.5 675 Q 1093 584 1093 476 Q 1093 333 1028.5 221 Q 964 109 852 44.5 Q 740 -20 596 -20 Z"],
"6": [1270, "M 646 -20 Q 553 -20 460 14 Q 367 48 290.5 128 Q 214 208 168 345 Q 122 482 122 688 Q 122 885 159.5 1037.5 Q 197 1190 268.5 1295.5 Q 340 1401 441 1455.5 Q 542 1510 669 1510 Q 794 1510 893 1460 Q 992 1410 1055 1321 Q 1118 1232 1136 1115 L 950 1115 Q 925 1212 855 1277 Q 785 1342 669 1342 Q 555 1342 472.5 1275 Q 390 1208 346 1081.5 Q 302 955 302 776 L 314 776 Q 354 838 410 882.5 Q 466 927 535 950.5 Q 604 974 681 974 Q 809 974 915 911 Q 1021 848 1084.5 736.5 Q 1148 625 1148 481 Q 1148 342 1086 228.5 Q 1024 115 911 47.5 Q 798 -20 646 -20 Z M 646 147 Q 736 147 808 192 Q 880 237 922 312.5 Q 964 388 964 481 Q 964 572 923.5 646.5 Q 883 721 812 765 Q 741 809 651 809 Q 583 809 524.5 782.5 Q 466 756 422 709.5 Q 378 663 353.5 603.5 Q 329 544 329 479 Q 329 391 370 315.5 Q 411 240 483 193.5 Q 555 147 646 147 Z"],
"7": [1159, "M 200 0 L 862 1311 L 862 1323 L 98 1323 L 98 1490 L 1061 1490 L 1061 1313 L 400 0 Z"],
"8": [1267, "M 633 -20 Q 482 -20 366.5 33.5 Q 251 87 186.5 181 Q 122 275 122 396 Q 122 490 160 570.5 Q 198 651 264 705 Q 330 759 413 774 L 413 782 Q 304 810 240 903 Q 176 996 176 1114 Q 176 1228 235 1317.5 Q 294 1407 397 1458.5 Q 500 1510 633 1510 Q 764 1510 867 1458.5 Q 970 1407 1029.5 1317.5 Q 1089 1228 1089 1114 Q 1089 996 1024.5 903 Q 960 810 854 782 L 854 774 Q 935 759 1001 705 Q 1067 651 1106 570.5 Q 1145 490 1145 396 Q 1145 275 1079.5 181 Q 1014 87 898.5 33.5 Q 783 -20 633 -20 Z M 633 145 Q 732 145 804 177.5 Q 876 210 915.5 268.5 Q 955 327 955 406 Q 955 489 913 552.5 Q 871 616 798 652.5 Q 725 689 633 689 Q 539 689 466 652.5 Q 393 616 351 552.5 Q 309 489 309 406 Q 309 327 348 268.5 Q 387 210 460 177.5 Q 533 145 633 145 Z M 633 848 Q 712 848 773 879.5 Q 834 911 869.5 968 Q 905 1025 905 1100 Q 905 1175 871 1230 Q 837 1285 775.5 1315.5 Q 714 1346 633 1346 Q 551 1346 489.5 1315.5 Q 428 1285 394 1230 Q 360 1175 360 1100 Q 360 1025 394.5 968 Q 429 911 491 879.5 Q 553 848 633 848 Z"],
"9": [1270, "M 603 -20 Q 476 -20 377 30 Q 278 80 215 170 Q 152 260 134 379 L 322 379 Q 345 280 415 214 Q 485 148 603 148 Q 717 148 799 215 Q 881 282 925.5 409 Q 970 536 970 716 L 958 716 Q 918 655 862 610.5 Q 806 566 737.5 541.5 Q 669 517 591 517 Q 463 517 356 580.5 Q 249 644 185.5 755.5 Q 122 867 122 1010 Q 122 1149 185 1263.5 Q 248 1378 361.5 1445.5 Q 475 1513 628 1510 Q 720 1509 812 1474.5 Q 904 1440 980 1361 Q 1056 1282 1102 1146 Q 1148 1010 1148 804 Q 1148 606 1110.5 453 Q 1073 300 1002 194.5 Q 931 89 830 34.5 Q 729 -20 603 -20 Z M 619 683 Q 687 683 746 710 Q 805 737 849 783.5 Q 893 830 918 889.5 Q 943 949 943 1015 Q 943 1101 901.5 1175.5 Q 860 1250 788.5 1296.5 Q 717 1343 625 1343 Q 535 1343 463.5 1298.5 Q 392 1254 350 1178.5 Q 308 1103 308 1011 Q 308 920 348.5 845.5 Q 389 771 459 727 Q 529 683 619 683 Z"],
" ": [576, ""],
"!": [589, "M 204 479 L 192 1490 L 396 1490 L 383 479 Z M 295 -13 Q 239 -13 199.5 26.5 Q 160 66 160 121 Q 160 177 199.5 216.5 Q 239 256 295 256 Q 351 256 390 216.5 Q 429 177 429 121 Q 429 66 390 26.5 Q 351 -13 295 -13 Z"],
"\"": [954, "M 232 923 L 210 1490 L 404 1490 L 382 923 Z M 572 923 L 550 1490 L 744 1490 L 722 923 Z"],
"#": [1297, "M 711 0 L 957 1490 L 1108 1490 L 864 0 Z M 34 411 L 59 561 L 1175 561 L 1150 411 Z M 189 0 L 433 1490 L 584 1490 L 340 0 Z M 122 927 L 147 1079 L 1261 1079 L 1238 927 Z"],
"$": [1314, "M 597 -218 L 597 1708 L 717 1708 L 717 -218 Z M 657 -26 Q 496 -26 377.5 26 Q 259 78 192 171.5 Q 125 265 116 390 L 311 390 Q 319 306 368 251.5 Q 417 197 493.5 170.5 Q 570 144 657 144 Q 758 144 838.5 177 Q 919 210 966 270 Q 1013 330 1013 409 Q 1013 481 972.5 526 Q 932 571 865 600 Q 798 629 718 651 L 538 702 Q 358 753 258 848 Q 158 943 158 1091 Q 158 1217 226 1311.5 Q 294 1406 410 1458 Q 526 1510 670 1510 Q 817 1510 930 1458 Q 1043 1406 1108.5 1316.5 Q 1174 1227 1178 1114 L 992 1114 Q 979 1223 888 1282.5 Q 797 1342 664 1342 Q 568 1342 495.5 1310.5 Q 423 1279 383 1224.5 Q 343 1170 343 1100 Q 343 1022 391.5 974.5 Q 440 927 506.5 900.5 Q 573 874 627 859 L 776 818 Q 836 802 908.5 774 Q 981 746 1047 699.5 Q 1113 653 1155.5 581.5 Q 1198 510 1198 406 Q 1198 284 1134.5 186 Q 1071 88 950 31 Q 829 -26 657 -26 Z"],
"%": [2011, "M 523 831 Q 428 831 362.5 872.5 Q 297 914 263.5 983 Q 230 1052 230 1134 L 230 1212 Q 230 1294 264 1362.5 Q 298 1431 363.5 1472.5 Q 429 1514 523 1514 Q 619 1514 683.5 1472.5 Q 748 1431 781 1362.5 Q 814 1294 814 1212 L 814 1134 Q 814 1052 780.5 983 Q 747 914 682.5 872.5 Q 618 831 523 831 Z M 523 962 Q 599 962 630 1014.5 Q 661 1067 661 1134 L 661 1212 Q 661 1278 631 1331 Q 601 1384 523 1384 Q 448 1384 415.5 1331 Q 383 1278 383 1212 L 383 1134 Q 383 1067 414.5 1014.5 Q 446 962 523 962 Z M 1490 -29 Q 1395 -29 1329.5 12.5 Q 1264 54 1230.5 123 Q 1197 192 1197 274 L 1197 352 Q 1197 434 1231 502.5 Q 1265 571 1330.5 612.5 Q 1396 654 1490 654 Q 1586 654 1651 612.5 Q 1716 571 1748.5 502.5 Q 1781 434 1781 352 L 1781 274 Q 1781 192 1747.5 123 Q 1714 54 1649.5 12.5 Q 1585 -29 1490 -29 Z M 1490 102 Q 1566 102 1597 154.5 Q 1628 207 1628 274 L 1628 352 Q 1628 418 1598 471 Q 1568 524 1490 524 Q 1415 524 1382.5 471 Q 1350 418 1350 352 L 1350 274 Q 1350 207 1381.5 154.5 Q 1413 102 1490 102 Z M 404 0 L 1428 1490 L 1597 1490 L 573 0 Z"],
"&": [1319, "M 580 -20 Q 433 -20 326 34.5 Q 219 89 161.5 181.5 Q 104 274 104 389 Q 104 487 144 558 Q 184 629 254.5 690 Q 325 751 414 817 L 635 980 Q 662 1000 694 1028 Q 726 1056 748.5 1095 Q 771 1134 771 1186 Q 771 1257 723.5 1303 Q 676 1349 595 1349 Q 539 1349 496 1326 Q 453 1303 429.5 1262.5 Q 406 1222 406 1168 Q 406 1112 431.5 1061 Q 457 1010 501 955 Q 545 900 601 832 L 1287 0 L 1070 0 L 505 678 Q 425 775 361.5 851.5 Q 298 928 261.5 1003 Q 225 1078 225 1167 Q 225 1266 270 1342 Q 315 1418 397.5 1461 Q 480 1504 590 1504 Q 702 1504 783 1460.5 Q 864 1417 908 1344.5 Q 952 1272 952 1183 Q 952 1115 926.5 1057 Q 901 999 856.5 950 Q 812 901 754 858 L 456 637 Q 364 569 326.5 510.5 Q 289 452 289 383 Q 289 310 324 254.5 Q 359 199 422 168 Q 485 137 567 137 Q 656 137 738 173.5 Q 820 210 885 278 Q 950 346 988 442 Q 1026 538 1026 658 L 1199 658 Q 1199 510 1165 415 Q 1131 320 1087.5 265 Q 1044 210 1015 182 L 979 137 Q 906 58 796.5 19 Q 687 -20 580 -20 Z"],
"'": [614, "M 232 923 L 210 1490 L 404 1490 L 382 923 Z"],
"(": [747, "M 218 607 Q 218 770 251.5 948.5 Q 285 1127 343 1292.5 Q 401 1458 476 1581 L 651 1581 Q 574 1424 517.5 1254 Q 461 1084 431 918.5 Q 401 753 401 607 Q 401 474 427.5 338 Q 454 202 509.5 50.5 Q 565 -101 651 -279 L 476 -279 Q 349 -62 283.5 163 Q 218 388 218 607 Z"],
")": [747, "M 96 -279 Q 185 -96 240 56.5 Q 295 209 320.5 344 Q 346 479 346 607 Q 346 753 316 918.5 Q 286 1084 230 1254 Q 174 1424 96 1581 L 271 1581 Q 346 1458 404.5 1292.5 Q 463 1127 496 948 Q 529 769 529 607 Q 529 384 462.5 159 Q 396 -66 271 -279 Z"],
"*": [1026, "M 441 652 L 454 969 L 186 798 L 114 924 L 396 1070 L 114 1216 L 186 1344 L 454 1173 L 441 1490 L 585 1490 L 573 1173 L 840 1344 L 912 1216 L 630 1070 L 912 924 L 840 798 L 573 969 L 585 652 Z"],
"+": [1355, "M 593 100 L 593 1066 L 762 1066 L 762 100 Z M 195 504 L 195 663 L 1160 663 L 1160 504 Z"],
",": [590, "M 128 -359 L 216 208 L 422 208 L 266 -359 Z"],
"-": [942, "M 798 719 L 798 553 L 144 553 L 144 719 Z"],
".": [590, "M 295 -13 Q 239 -13 199.5 26.5 Q 160 66 160 122 Q 160 178 199.5 217.5 Q 239 257 295 257 Q 351 257 390.5 217.5 Q 430 178 430 122 Q 430 66 390.5 26.5 Q 351 -13 295 -13 Z"],
"/": [738, "M 692 1560 L 212 -224 L 46 -224 L 526 1560 Z"],
":": [590, "M 295 -13 Q 239 -13 199.5 26.5 Q 160 66 160 122 Q 160 178 199.5 217.5 Q 239 257 295 257 Q 351 257 390.5 217.5 Q 430 178 430 122 Q 430 66 390.5 26.5 Q 351 -13 295 -13 Z M 295 796 Q 239 796 199.5 835.5 Q 160 875 160 931 Q 160 987 199.5 1026.5 Q 239 1066 295 1066 Q 351 1066 390.5 1026.5 Q 430 987 430 931 Q 430 875 390.5 835.5 Q 351 796 295 796 Z"],
";": [618, "M 128 -359 L 216 208 L 422 208 L 266 -359 Z M 323 796 Q 267 796 227.5 835.5 Q 188 875 188 931 Q 188 987 227.5 1026.5 Q 267 1066 323 1066 Q 379 1066 418.5 1026.5 Q 458 987 458 931 Q 458 875 418.5 835.5 Q 379 796 323 796 Z"],
"<": [1355, "M 174 520 L 174 646 L 1118 1122 L 1118 926 L 400 585 L 406 597 L 406 569 L 400 579 L 1118 238 L 1118 44 Z"],
"=": [1355, "M 226 717 L 226 883 L 1130 883 L 1130 717 Z M 226 283 L 226 449 L 1130 449 L 1130 283 Z"],
">": [1355, "M 1181 520 L 237 44 L 237 238 L 956 579 L 949 569 L 949 597 L 956 585 L 237 926 L 237 1122 L 1181 646 Z"],
"?": [1047, "M 383 449 L 383 460 Q 383 597 409.5 671.5 Q 436 746 486 789.5 Q 536 833 605 874 Q 671 914 716 975.5 Q 761 1037 761 1124 Q 761 1194 728.5 1244.5 Q 696 1295 641 1323 Q 586 1351 518 1351 Q 459 1351 404.5 1326.5 Q 350 1302 314 1250 Q 278 1198 272 1115 L 82 1115 Q 87 1241 146.5 1329 Q 206 1417 303 1463.5 Q 400 1510 518 1510 Q 648 1510 743.5 1459.5 Q 839 1409 892 1320 Q 945 1231 945 1117 Q 945 996 892 910 Q 839 824 742 765 Q 678 726 638.5 689.5 Q 599 653 581.5 601 Q 564 549 564 460 L 564 449 Z M 476 -13 Q 420 -13 380.5 26.5 Q 341 66 341 121 Q 341 177 380.5 216.5 Q 420 256 476 256 Q 532 256 571 216.5 Q 610 177 610 121 Q 610 66 571 26.5 Q 532 -13 476 -13 Z"],
"@": [1978, "M 1044 -395 Q 821 -395 649 -334 Q 477 -273 359.5 -155.5 Q 242 -38 182 133.5 Q 122 305 122 525 Q 122 738 183 907 Q 244 1076 360.5 1194.5 Q 477 1313 644 1375.5 Q 811 1438 1023 1438 Q 1229 1438 1384.5 1371.5 Q 1540 1305 1645 1191.5 Q 1750 1078 1803 935 Q 1856 792 1856 640 Q 1856 533 1845 425.5 Q 1834 318 1799.5 228.5 Q 1765 139 1696.5 84.5 Q 1628 30 1512 30 Q 1460 30 1399 46 Q 1338 62 1291.5 99 Q 1245 136 1236 198 L 1228 198 Q 1202 134 1135 85.5 Q 1068 37 955 37 Q 822 37 732.5 103 Q 643 169 597.5 281.5 Q 552 394 552 535 Q 552 669 605.5 775 Q 659 881 752.5 942.5 Q 846 1004 965 1004 Q 1061 1004 1125.5 969 Q 1190 934 1217 896 L 1227 896 L 1227 980 L 1385 980 L 1385 321 Q 1385 261 1418.5 216 Q 1452 171 1516 171 Q 1589 171 1628 221 Q 1667 271 1682 375 Q 1697 479 1697 642 Q 1697 766 1655.5 882.5 Q 1614 999 1530 1092 Q 1446 1185 1318 1239.5 Q 1190 1294 1017 1294 Q 845 1294 710 1241.5 Q 575 1189 481 1089 Q 387 989 338 845.5 Q 289 702 289 520 Q 289 336 338 192.5 Q 387 49 484 -49.5 Q 581 -148 723 -199 Q 865 -250 1051 -250 Q 1131 -250 1207.5 -235 Q 1284 -220 1344 -201.5 Q 1404 -183 1433 -173 L 1476 -313 Q 1430 -332 1357.5 -351 Q 1285 -370 1202.5 -382.5 Q 1120 -395 1044 -395 Z M 962 190 Q 1059 190 1118.5 229 Q 1178 268 1205.5 346.5 Q 1233 425 1233 543 Q 1233 663 1203 730.5 Q 1173 798 1113.5 825.5 Q 1054 853 967 853 Q 885 853 827 810.5 Q 769 768 738 697.5 Q 707 627 707 543 Q 707 451 732 370 Q 757 289 813 239.5 Q 869 190 962 190 Z"],
"A": [1413, "M 52 0 L 593 1490 L 813 1490 L 1361 0 L 1161 0 L 845 884 Q 816 966 777.5 1088.5 Q 739 1211 684 1401 L 720 1401 Q 666 1209 626.5 1084.5 Q 587 960 561 884 L 254 0 Z M 324 416 L 324 582 L 1089 582 L 1089 416 Z"],
"B": [1340, "M 180 0 L 180 1490 L 708 1490 Q 864 1490 965.5 1436.5 Q 1067 1383 1116.5 1293.5 Q 1166 1204 1166 1095 Q 1166 999 1132 936.5 Q 1098 874 1042.5 837 Q 987 800 922 782 L 922 768 Q 992 764 1061.5 720 Q 1131 676 1177.5 595 Q 1224 514 1224 397 Q 1224 285 1172.5 195 Q 1121 105 1011 52.5 Q 901 0 725 0 Z M 370 168 L 720 168 Q 894 168 967.5 235 Q 1041 302 1041 399 Q 1041 474 1003 537 Q 965 600 895.5 638 Q 826 676 730 676 L 370 676 Z M 370 836 L 698 836 Q 778 836 843 867.5 Q 908 899 946 956.5 Q 984 1014 984 1091 Q 984 1188 916.5 1255 Q 849 1322 704 1322 L 370 1322 Z"],
"C": [1496, "M 783 -20 Q 592 -20 442.5 72.5 Q 293 165 207.5 336.5 Q 122 508 122 744 Q 122 981 207.5 1152.5 Q 293 1324 442.5 1417 Q 592 1510 783 1510 Q 896 1510 996.5 1477 Q 1097 1444 1177 1380.5 Q 1257 1317 1310.5 1226.5 Q 1364 1136 1384 1021 L 1194 1021 Q 1178 1098 1139.5 1156 Q 1101 1214 1045.5 1254 Q 990 1294 923 1314 Q 856 1334 783 1334 Q 649 1334 541 1266 Q 433 1198 370 1066.5 Q 307 935 307 744 Q 307 554 370.5 422.5 Q 434 291 542 223.5 Q 650 156 783 156 Q 856 156 923 176.5 Q 990 197 1045.5 236.5 Q 1101 276 1139.5 334.5 Q 1178 393 1194 469 L 1384 469 Q 1365 355 1311.5 265 Q 1258 175 1178 111 Q 1098 47 997.5 13.5 Q 897 -20 783 -20 Z"],
"D": [1478, "M 645 0 L 285 0 L 285 168 L 633 168 Q 815 168 934.5 237.5 Q 1054 307 1113 437 Q 1172 567 1172 748 Q 1172 927 1113.5 1055.5 Q 1055 1184 939.5 1253 Q 824 1322 651 1322 L 277 1322 L 277 1490 L 664 1490 Q 882 1490 1036.5 1401 Q 1191 1312 1273.5 1145.5 Q 1356 979 1356 748 Q 1356 515 1273 347.5 Q 1190 180 1031 90 Q 872 0 645 0 Z M 370 1490 L 370 0 L 180 0 L 180 1490 Z"],
"E": [1231, "M 180 0 L 180 1490 L 1088 1490 L 1088 1322 L 370 1322 L 370 836 L 1039 836 L 1039 668 L 370 668 L 370 168 L 1097 168 L 1097 0 Z"],
"F": [1209, "M 180 0 L 180 1490 L 1081 1490 L 1081 1322 L 370 1322 L 370 812 L 1013 812 L 1013 644 L 370 644 L 370 0 Z"],
"G": [1528, "M 789 -20 Q 590 -20 440 73 Q 290 166 206 337.5 Q 122 509 122 744 Q 122 981 206 1152.5 Q 290 1324 438 1417 Q 586 1510 777 1510 Q 895 1510 997.5 1475 Q 1100 1440 1181 1375 Q 1262 1310 1315.5 1220.5 Q 1369 1131 1389 1023 L 1193 1023 Q 1170 1095 1132 1152 Q 1094 1209 1041.5 1250 Q 989 1291 923 1312.5 Q 857 1334 778 1334 Q 647 1334 540 1266.5 Q 433 1199 370 1067.5 Q 307 936 307 744 Q 307 554 370.5 423 Q 434 292 543 224 Q 652 156 789 156 Q 915 156 1011 209.5 Q 1107 263 1160.5 361.5 Q 1214 460 1214 594 L 1271 583 L 828 583 L 828 749 L 1400 749 L 1400 586 Q 1400 401 1321 265 Q 1242 129 1104.5 54.5 Q 967 -20 789 -20 Z"],
"H": [1522, "M 180 0 L 180 1490 L 370 1490 L 370 846 L 1152 846 L 1152 1490 L 1342 1490 L 1342 0 L 1152 0 L 1152 678 L 370 678 L 370 0 Z"],
"I": [550, "M 370 1490 L 370 0 L 180 0 L 180 1490 Z"],
"J": [1169, "M 545 -20 Q 348 -20 224 96 Q 100 212 100 426 L 100 506 L 290 506 L 290 426 Q 290 290 360 218.5 Q 430 147 545 147 Q 659 147 729 218.5 Q 799 290 799 426 L 799 1490 L 989 1490 L 989 426 Q 989 212 865.5 96 Q 742 -20 545 -20 Z"],
"K": [1376, "M 310 426 L 310 629 Q 361 699 411.5 763 Q 462 827 515 888 Q 568 949 624 1009 L 1069 1490 L 1318 1490 L 682 808 L 672 809 Z M 180 0 L 180 1490 L 370 1490 L 370 980 L 367 659 L 370 566 L 370 0 Z M 1094 0 L 555 758 L 673 906 L 1319 0 Z"],
"L": [1158, "M 180 0 L 180 1490 L 370 1490 L 370 168 L 1060 168 L 1060 0 Z"],
"M": [1850, "M 180 0 L 180 1490 L 450 1490 L 817 550 Q 830 517 846.5 467.5 Q 863 418 881.5 360 Q 900 302 917 244.5 Q 934 187 947 138 L 905 138 Q 919 184 936 240.5 Q 953 297 971.5 355.5 Q 990 414 1007 465 Q 1024 516 1037 550 L 1399 1490 L 1670 1490 L 1670 0 L 1483 0 L 1483 851 Q 1483 897 1483.5 956 Q 1484 1015 1485.5 1080 Q 1487 1145 1488.5 1212 Q 1490 1279 1491 1342 L 1507 1342 Q 1486 1273 1462.5 1201.5 Q 1439 1130 1416.5 1063.5 Q 1394 997 1374 942 Q 1354 887 1340 851 L 1007 0 L 842 0 L 504 851 Q 490 886 471 939.5 Q 452 993 429.5 1058.5 Q 407 1124 383 1196.5 Q 359 1269 334 1342 L 352 1342 Q 354 1286 355.5 1221 Q 357 1156 358 1089.5 Q 359 1023 360 961.5 Q 361 900 361 851 L 361 0 Z"],
"N": [1543, "M 180 0 L 180 1490 L 404 1490 L 1010 537 Q 1034 500 1068 442 Q 1102 384 1141.5 311 Q 1181 238 1219 155 L 1192 155 Q 1183 241 1179 319.5 Q 1175 398 1174 464 Q 1173 530 1173 576 L 1173 1490 L 1363 1490 L 1363 0 L 1137 0 L 597 848 Q 560 907 522.5 969.5 Q 485 1032 437 1117.5 Q 389 1203 318 1329 L 353 1329 Q 358 1218 362 1124 Q 366 1030 368.5 960 Q 371 890 371 850 L 371 0 Z"],
"O": [1566, "M 784 -20 Q 593 -20 443.5 72.5 Q 294 165 208 336.5 Q 122 508 122 744 Q 122 981 208 1152.5 Q 294 1324 443.5 1417 Q 593 1510 784 1510 Q 975 1510 1124 1417 Q 1273 1324 1358.5 1152.5 Q 1444 981 1444 744 Q 1444 508 1358.5 336.5 Q 1273 165 1124 72.5 Q 975 -20 784 -20 Z M 784 156 Q 917 156 1024.5 223.5 Q 1132 291 1195.5 422.5 Q 1259 554 1259 744 Q 1259 936 1195.5 1067.5 Q 1132 1199 1024.5 1266.5 Q 917 1334 784 1334 Q 650 1334 542 1266 Q 434 1198 370.5 1066.5 Q 307 935 307 744 Q 307 554 370.5 423 Q 434 292 542 224 Q 650 156 784 156 Z"],
"P": [1308, "M 180 0 L 180 1490 L 690 1490 Q 864 1490 976.5 1426.5 Q 1089 1363 1143.5 1256 Q 1198 1149 1198 1016 Q 1198 883 1143.5 775 Q 1089 667 977 603 Q 865 539 691 539 L 330 539 L 330 706 L 682 706 Q 800 706 872 746.5 Q 944 787 976.5 857.5 Q 1009 928 1009 1016 Q 1009 1104 976.5 1173.5 Q 944 1243 871.5 1283 Q 799 1323 680 1323 L 370 1323 L 370 0 Z"],
"Q": [1566, "M 722 466 L 920 466 L 1086 248 L 1128 190 L 1376 -140 L 1178 -140 L 1016 78 L 974 134 Z M 784 -20 Q 593 -20 443.5 72.5 Q 294 165 208 336.5 Q 122 508 122 744 Q 122 981 208 1152.5 Q 294 1324 443.5 1417 Q 593 1510 784 1510 Q 975 1510 1124 1417 Q 1273 1324 1358.5 1152.5 Q 1444 981 1444 744 Q 1444 508 1358.5 336.5 Q 1273 165 1124 72.5 Q 975 -20 784 -20 Z M 784 156 Q 917 156 1024.5 223.5 Q 1132 291 1195.5 422.5 Q 1259 554 1259 744 Q 1259 936 1195.5 1067.5 Q 1132 1199 1024.5 1266.5 Q 917 1334 784 1334 Q 650 1334 542 1266 Q 434 1198 370.5 1066.5 Q 307 935 307 744 Q 307 554 370.5 423 Q 434 292 542 224 Q 650 156 784 156 Z"],
"R": [1318, "M 180 0 L 180 1490 L 690 1490 Q 864 1490 976.5 1430.5 Q 1089 1371 1143.5 1267 Q 1198 1163 1198 1030 Q 1198 897 1143.5 795 Q 1089 693 977 635.5 Q 865 578 691 578 L 286 578 L 286 747 L 682 747 Q 800 747 871.5 781.5 Q 943 816 976 879.5 Q 1009 943 1009 1030 Q 1009 1119 976 1184.5 Q 943 1250 871 1286.5 Q 799 1323 680 1323 L 370 1323 L 370 0 Z M 1036 0 L 676 671 L 890 671 L 1256 0 Z"],
"S": [1314, "M 657 -26 Q 496 -26 377.5 26 Q 259 78 192 171.5 Q 125 265 116 390 L 311 390 Q 319 306 368 251.5 Q 417 197 493.5 170.5 Q 570 144 657 144 Q 758 144 838.5 177 Q 919 210 966 270 Q 1013 330 1013 409 Q 1013 481 972.5 526 Q 932 571 865 600 Q 798 629 718 651 L 538 702 Q 358 753 258 848 Q 158 943 158 1091 Q 158 1217 226 1311.5 Q 294 1406 410 1458 Q 526 1510 670 1510 Q 817 1510 930 1458 Q 1043 1406 1108.5 1316.5 Q 1174 1227 1178 1114 L 992 1114 Q 979 1223 888 1282.5 Q 797 1342 664 1342 Q 568 1342 495.5 1310.5 Q 423 1279 383 1224.5 Q 343 1170 343 1100 Q 343 1022 391.5 974.5 Q 440 927 506.5 900.5 Q 573 874 627 859 L 776 818 Q 836 802 908.5 774 Q 981 746 1047 699.5 Q 1113 653 1155.5 581.5 Q 1198 510 1198 406 Q 1198 284 1134.5 186 Q 1071 88 950 31 Q 829 -26 657 -26 Z"],
"T": [1322, "M 98 1322 L 98 1490 L 1224 1490 L 1224 1322 L 757 1322 L 757 0 L 567 0 L 567 1322 Z"],
"U": [1524, "M 763 -24 Q 587 -24 455.5 45 Q 324 114 252 234 Q 180 354 180 507 L 180 1490 L 370 1490 L 370 522 Q 370 415 417.5 331.5 Q 465 248 553 200 Q 641 152 763 152 Q 885 152 972.5 200 Q 1060 248 1107 331.5 Q 1154 415 1154 522 L 1154 1490 L 1344 1490 L 1344 507 Q 1344 354 1272 234 Q 1200 114 1069.5 45 Q 939 -24 763 -24 Z"],
"V": [1413, "M 600 0 L 52 1490 L 252 1490 L 567 606 Q 594 530 634.5 403 Q 675 276 729 90 L 692 90 Q 746 281 786 405.5 Q 826 530 852 606 L 1159 1490 L 1361 1490 L 819 0 Z"],
"W": [2018, "M 458 0 L 52 1490 L 246 1490 L 482 576 Q 501 503 518 427.5 Q 535 352 551 274.5 Q 567 197 581 115 L 558 115 Q 573 197 589 274.5 Q 605 352 623 427.5 Q 641 503 660 576 L 901 1490 L 1117 1490 L 1356 576 Q 1376 503 1393.5 427.5 Q 1411 352 1428 274.5 Q 1445 197 1460 115 L 1434 115 Q 1449 197 1465 274.5 Q 1481 352 1499 427.5 Q 1517 503 1535 576 L 1770 1490 L 1966 1490 L 1558 0 L 1337 0 L 1081 944 Q 1056 1036 1033 1144.5 Q 1010 1253 988 1395 L 1028 1395 Q 1006 1261 985 1155.5 Q 964 1050 935 944 L 680 0 Z"],
"X": [1397, "M 57 0 L 640 833 L 640 692 L 90 1490 L 310 1490 L 525 1174 Q 573 1104 603.5 1056 Q 634 1008 659.5 962 Q 685 916 717 852 L 684 852 Q 716 915 741.5 961 Q 767 1007 798.5 1055.5 Q 830 1104 878 1174 L 1097 1490 L 1312 1490 L 763 700 L 763 840 L 1340 0 L 1121 0 L 860 378 Q 818 440 789 484.5 Q 760 529 735 573.5 Q 710 618 679 680 L 720 680 Q 690 621 664.5 576.5 Q 639 532 609.5 486.5 Q 580 441 536 378 L 273 0 Z"],
"Y": [1390, "M 600 0 L 600 610 L 52 1490 L 272 1490 L 567 1009 Q 617 928 655.5 854.5 Q 694 781 735 669 L 659 669 Q 700 783 739 857.5 Q 778 932 825 1009 L 1119 1490 L 1338 1490 L 790 610 L 790 0 Z"],
"Z": [1288, "M 130 0 L 130 134 L 796 1125 Q 841 1192 892 1259.5 Q 943 1327 994 1393 L 1015 1331 Q 923 1325 830 1323.5 Q 737 1322 645 1322 L 122 1322 L 122 1490 L 1158 1490 L 1158 1354 L 502 379 Q 454 308 400.5 237 Q 347 166 294 97 L 273 159 Q 365 165 456.5 166.5 Q 548 168 640 168 L 1166 168 L 1166 0 Z"],
"[": [747, "M 226 -279 L 226 1581 L 624 1581 L 624 1428 L 398 1428 L 398 -126 L 624 -126 L 624 -279 Z"],
"\\": [738, "M 526 -224 L 46 1560 L 212 1560 L 692 -224 Z"],
"]": [747, "M 123 -279 L 123 -126 L 349 -126 L 349 1428 L 123 1428 L 123 1581 L 521 1581 L 521 -279 Z"],
"^": [965, "M 456 1360 L 508 1360 L 508 1285 L 456 1285 Z M 82 814 L 383 1443 L 582 1443 L 883 814 L 706 814 L 475 1315 L 490 1315 L 261 814 Z"],
"_": [934, "M 934 0 L 934 -166 L 0 -166 L 0 0 Z"],
"`": [661, "M 343 1264 L 150 1558 L 351 1558 L 491 1264 Z"],
"a": [1150, "M 471 -26 Q 365 -26 278.5 14 Q 192 54 141 131 Q 90 208 90 318 Q 90 414 128 474 Q 166 534 229.5 568.5 Q 293 603 370 620 Q 447 637 525 647 Q 625 660 688 667 Q 751 674 781.5 691 Q 812 708 812 749 L 812 755 Q 812 825 786 873.5 Q 760 922 708 948 Q 656 974 578 974 Q 498 974 441 949 Q 384 924 348.5 886.5 Q 313 849 295 810 L 122 867 Q 165 969 238 1026.5 Q 311 1084 399 1108 Q 487 1132 573 1132 Q 629 1132 700.5 1118.5 Q 772 1105 838.5 1065 Q 905 1025 948.5 946.5 Q 992 868 992 737 L 992 0 L 815 0 L 815 152 L 803 152 Q 784 113 742 71.5 Q 700 30 633 2 Q 566 -26 471 -26 Z M 502 133 Q 602 133 671 172 Q 740 211 776 273.5 Q 812 336 812 404 L 812 559 Q 801 546 764 535.5 Q 727 525 679.5 517 Q 632 509 587.5 503.5 Q 543 498 517 495 Q 452 487 395.5 467.5 Q 339 448 305 410.5 Q 271 373 271 309 Q 271 251 301 212 Q 331 173 383 153 Q 435 133 502 133 Z"],
"b": [1254, "M 677 -24 Q 571 -24 506 12.5 Q 441 49 406 95.5 Q 371 142 352 173 L 332 173 L 332 0 L 158 0 L 158 1490 L 338 1490 L 338 939 L 352 939 Q 371 969 405 1014.5 Q 439 1060 503 1096 Q 567 1132 676 1132 Q 816 1132 922.5 1062 Q 1029 992 1089.5 862.5 Q 1150 733 1150 556 Q 1150 378 1090 248 Q 1030 118 923.5 47 Q 817 -24 677 -24 Z M 650 137 Q 755 137 825.5 193.5 Q 896 250 931.5 345.5 Q 967 441 967 558 Q 967 674 932 767.5 Q 897 861 826.5 916 Q 756 971 650 971 Q 547 971 477 919 Q 407 867 371.5 774.5 Q 336 682 336 558 Q 336 434 372 339 Q 408 244 478.5 190.5 Q 549 137 650 137 Z"],
"c": [1170, "M 613 -24 Q 461 -24 346.5 48 Q 232 120 168 250 Q 104 380 104 552 Q 104 727 168 857.5 Q 232 988 346.5 1060 Q 461 1132 613 1132 Q 694 1132 766 1111 Q 838 1090 897.5 1050.5 Q 957 1011 1000 953.5 Q 1043 896 1066 823 L 893 774 Q 881 817 856 853 Q 831 889 795.5 915.5 Q 760 942 714 956.5 Q 668 971 613 971 Q 501 971 429 912.5 Q 357 854 322 759 Q 287 664 287 552 Q 287 442 322 347.5 Q 357 253 429 195 Q 501 137 613 137 Q 669 137 716 152 Q 763 167 799.5 194.5 Q 836 222 861 260 Q 886 298 898 343 L 1070 294 Q 1048 219 1004.5 160.5 Q 961 102 901 60.5 Q 841 19 768 -2.5 Q 695 -24 613 -24 Z"],
"d": [1254, "M 577 -24 Q 438 -24 331 47 Q 224 118 164 248 Q 104 378 104 556 Q 104 733 164.5 862.5 Q 225 992 332 1062 Q 439 1132 578 1132 Q 687 1132 751 1096 Q 815 1060 849.5 1014.5 Q 884 969 902 939 L 916 939 L 916 1490 L 1096 1490 L 1096 0 L 922 0 L 922 173 L 902 173 Q 884 142 848.5 95.5 Q 813 49 748.5 12.5 Q 684 -24 577 -24 Z M 604 137 Q 706 137 776 190.5 Q 846 244 882 339 Q 918 434 918 558 Q 918 682 882.5 774.5 Q 847 867 777 919 Q 707 971 604 971 Q 498 971 427.5 916 Q 357 861 322 767.5 Q 287 674 287 558 Q 287 441 322.5 345.5 Q 358 250 429 193.5 Q 500 137 604 137 Z"],
"e": [1194, "M 628 -24 Q 466 -24 348.5 48 Q 231 120 167.5 249 Q 104 378 104 550 Q 104 722 166 853 Q 228 984 341.5 1058 Q 455 1132 607 1132 Q 696 1132 782.5 1102.5 Q 869 1073 939.5 1007.5 Q 1010 942 1052 835 Q 1094 728 1094 573 L 1094 498 L 226 498 L 226 650 L 997 650 L 913 594 Q 913 704 878.5 789.5 Q 844 875 776 923.5 Q 708 972 607 972 Q 506 972 434 922.5 Q 362 873 324 793.5 Q 286 714 286 623 L 286 522 Q 286 398 329 311.5 Q 372 225 449.5 180.5 Q 527 136 629 136 Q 695 136 749 155 Q 803 174 842 212.5 Q 881 251 902 308 L 1076 260 Q 1050 176 988 112 Q 926 48 834.5 12 Q 743 -24 628 -24 Z"],
"f": [758, "M 678 1118 L 678 964 L 20 964 L 20 1118 Z M 240 0 L 240 1267 Q 240 1364 285.5 1429 Q 331 1494 404 1527 Q 477 1560 558 1560 Q 622 1560 664 1549.5 Q 706 1539 726 1530 L 676 1376 Q 662 1381 639.5 1387 Q 617 1393 579 1393 Q 496 1393 458 1350.5 Q 420 1308 420 1227 L 420 0 Z"],
"g": [1256, "M 611 -442 Q 487 -442 396.5 -410.5 Q 306 -379 246 -327 Q 186 -275 151 -214 L 297 -120 Q 321 -152 356.5 -191 Q 392 -230 452.5 -257.5 Q 513 -285 611 -285 Q 745 -285 831.5 -221 Q 918 -157 918 -19 L 918 205 L 901 205 Q 882 173 847.5 129 Q 813 85 748.5 51.5 Q 684 18 576 18 Q 442 18 335 81.5 Q 228 145 166 267 Q 104 389 104 564 Q 104 737 165 864.5 Q 226 992 333.5 1062 Q 441 1132 580 1132 Q 688 1132 752.5 1096.5 Q 817 1061 852 1015 Q 887 969 906 939 L 923 939 L 923 1118 L 1098 1118 L 1098 -29 Q 1098 -173 1033 -264.5 Q 968 -356 857.5 -399 Q 747 -442 611 -442 Z M 606 178 Q 708 178 778 224.5 Q 848 271 884 358.5 Q 920 446 920 568 Q 920 687 884.5 777.5 Q 849 868 779 919.5 Q 709 971 606 971 Q 500 971 429 916.5 Q 358 862 322.5 771 Q 287 680 287 568 Q 287 453 323 365 Q 359 277 430 227.5 Q 501 178 606 178 Z"],
"h": [1211, "M 338 670 L 338 0 L 158 0 L 158 1490 L 338 1490 L 338 847 L 307 847 Q 358 1002 452.5 1067 Q 547 1132 674 1132 Q 787 1132 872.5 1085.5 Q 958 1039 1005.5 945.5 Q 1053 852 1053 710 L 1053 0 L 872 0 L 872 695 Q 872 824 804.5 897 Q 737 970 620 970 Q 540 970 476 935 Q 412 900 375 833 Q 338 766 338 670 Z"],
"i": [496, "M 158 0 L 158 1118 L 338 1118 L 338 0 Z M 249 1301 Q 198 1301 161 1336 Q 124 1371 124 1420 Q 124 1470 161 1504.5 Q 198 1539 249 1539 Q 301 1539 338 1504.5 Q 375 1470 375 1420 Q 375 1371 338 1336 Q 301 1301 249 1301 Z"],
"j": [496, "M 157 1118 L 338 1118 L 338 -80 Q 339 -186 302 -262 Q 265 -338 192 -378 Q 119 -418 10 -418 L -26 -418 L -26 -252 L 7 -252 Q 85 -252 121 -207.5 Q 157 -163 157 -80 Z M 248 1301 Q 197 1301 160 1336 Q 123 1371 123 1420 Q 123 1470 160 1504.5 Q 197 1539 248 1539 Q 300 1539 337 1504.5 Q 374 1470 374 1420 Q 374 1371 337 1336 Q 300 1301 248 1301 Z"],
"k": [1124, "M 327 402 L 327 625 L 360 625 L 838 1118 L 1061 1118 L 544 587 L 524 587 Z M 158 0 L 158 1490 L 338 1490 L 338 0 Z M 865 0 L 437 547 L 565 674 L 1096 0 Z"],
"l": [496, "M 338 1490 L 338 0 L 158 0 L 158 1490 Z"],
"m": [1794, "M 158 0 L 158 1118 L 333 1118 L 334 868 L 320 868 Q 343 959 392.5 1018.5 Q 442 1078 508.5 1108 Q 575 1138 647 1138 Q 769 1138 844.5 1063 Q 920 988 942 866 L 918 866 Q 938 950 991 1011 Q 1044 1072 1119.5 1105 Q 1195 1138 1284 1138 Q 1381 1138 1461 1096 Q 1541 1054 1588.5 969 Q 1636 884 1636 754 L 1636 0 L 1456 0 L 1456 749 Q 1456 870 1388 922 Q 1320 974 1230 974 Q 1155 974 1100.5 942.5 Q 1046 911 1016.5 856 Q 987 801 987 730 L 987 0 L 807 0 L 807 767 Q 807 860 745 917 Q 683 974 588 974 Q 523 974 465.5 943.5 Q 408 913 373 853 Q 338 793 338 704 L 338 0 Z"],
"n": [1210, "M 338 670 L 338 0 L 158 0 L 158 1118 L 331 1118 L 332 847 L 307 847 Q 358 1002 452.5 1067 Q 547 1132 674 1132 Q 787 1132 872 1085.5 Q 957 1039 1004.5 945.5 Q 1052 852 1052 710 L 1052 0 L 872 0 L 872 695 Q 872 824 804.5 897 Q 737 970 620 970 Q 540 970 476 935 Q 412 900 375 833 Q 338 766 338 670 Z"],
"o": [1228, "M 613 -24 Q 461 -24 346.5 48 Q 232 120 168 250 Q 104 380 104 552 Q 104 727 168 857.5 Q 232 988 346.5 1060 Q 461 1132 613 1132 Q 766 1132 881 1060 Q 996 988 1060 857.5 Q 1124 727 1124 552 Q 1124 380 1060 250 Q 996 120 881 48 Q 766 -24 613 -24 Z M 613 137 Q 726 137 799 195 Q 872 253 907 347.5 Q 942 442 942 552 Q 942 663 907 758.5 Q 872 854 799 912.5 Q 726 971 613 971 Q 501 971 429 912.5 Q 357 854 322 759 Q 287 664 287 552 Q 287 442 322 347.5 Q 357 253 429 195 Q 501 137 613 137 Z"],
"p": [1254, "M 158 -418 L 158 1118 L 332 1118 L 332 939 L 352 939 Q 371 969 405 1014.5 Q 439 1060 503 1096 Q 567 1132 676 1132 Q 816 1132 922.5 1062 Q 1029 992 1089.5 862.5 Q 1150 733 1150 556 Q 1150 378 1090 248 Q 1030 118 923.5 47 Q 817 -24 677 -24 Q 571 -24 506 12.5 Q 441 49 406 95.5 Q 371 142 352 173 L 338 173 L 338 -418 Z M 650 137 Q 755 137 825.5 193.5 Q 896 250 931.5 345.5 Q 967 441 967 558 Q 967 674 932 767.5 Q 897 861 826.5 916 Q 756 971 650 971 Q 547 971 477 919 Q 407 867 371.5 774.5 Q 336 682 336 558 Q 336 434 372 339 Q 408 244 478.5 190.5 Q 549 137 650 137 Z"],
"q": [1254, "M 1096 -418 L 916 -418 L 916 173 L 902 173 Q 884 142 848.5 95.5 Q 813 49 748.5 12.5 Q 684 -24 577 -24 Q 438 -24 331 47 Q 224 118 164 248 Q 104 378 104 556 Q 104 733 164.5 862.5 Q 225 992 332 1062 Q 439 1132 578 1132 Q 687 1132 751 1096 Q 815 1060 849.5 1014.5 Q 884 969 902 939 L 922 939 L 922 1118 L 1096 1118 Z M 604 137 Q 706 137 776 190.5 Q 846 244 882 339 Q 918 434 918 558 Q 918 682 882.5 774.5 Q 847 867 777 919 Q 707 971 604 971 Q 498 971 427.5 916 Q 357 861 322 767.5 Q 287 674 287 558 Q 287 441 322.5 345.5 Q 358 250 429 193.5 Q 500 137 604 137 Z"],
"r": [771, "M 158 0 L 158 1118 L 332 1118 L 332 946 L 344 946 Q 375 1031 454.5 1082.5 Q 534 1134 634 1134 Q 654 1134 681.5 1133 Q 709 1132 725 1131 L 725 950 Q 717 952 685 956 Q 653 960 617 960 Q 537 960 473.5 926.5 Q 410 893 374 834.5 Q 338 776 338 700 L 338 0 Z"],
"s": [1081, "M 538 -24 Q 423 -24 333.5 9.5 Q 244 43 186 109 Q 128 175 108 271 L 279 312 Q 303 220 369.5 177 Q 436 134 536 134 Q 653 134 722.5 184 Q 792 234 792 303 Q 792 361 751.5 399.5 Q 711 438 628 457 L 442 501 Q 290 537 216 612.5 Q 142 688 142 806 Q 142 902 196 975.5 Q 250 1049 343.5 1090.5 Q 437 1132 556 1132 Q 671 1132 751.5 1097.5 Q 832 1063 882.5 1002.5 Q 933 942 958 863 L 795 821 Q 772 881 718.5 930 Q 665 979 557 979 Q 457 979 390.5 933 Q 324 887 324 817 Q 324 755 369 717.5 Q 414 680 512 657 L 681 617 Q 833 581 906 505.5 Q 979 430 979 315 Q 979 217 923.5 140.5 Q 868 64 768.5 20 Q 669 -24 538 -24 Z"],
"t": [670, "M 598 1118 L 598 964 L 20 964 L 20 1118 Z M 188 1384 L 368 1384 L 368 290 Q 368 215 398.5 180.5 Q 429 146 500 146 Q 517 146 543.5 150 Q 570 154 592 158 L 629 6 Q 601 -4 565.5 -9 Q 530 -14 495 -14 Q 350 -14 269 62.5 Q 188 139 188 276 Z"],
"u": [1211, "M 537 -14 Q 424 -14 338.5 32.5 Q 253 79 205.5 173 Q 158 267 158 408 L 158 1118 L 338 1118 L 338 423 Q 338 294 406 221 Q 474 148 591 148 Q 671 148 734.5 183 Q 798 218 835 285.5 Q 872 353 872 448 L 872 1118 L 1053 1118 L 1053 0 L 879 0 L 879 271 L 903 271 Q 851 114 755.5 50 Q 660 -14 537 -14 Z"],
"v": [1151, "M 481 0 L 54 1118 L 251 1118 L 489 455 Q 527 352 553.5 249.5 Q 580 147 609 51 L 543 51 Q 572 147 598.5 249.5 Q 625 352 662 455 L 900 1118 L 1097 1118 L 670 0 Z"],
"w": [1676, "M 409 0 L 70 1118 L 261 1118 L 397 630 Q 425 530 457 403.5 Q 489 277 520 117 L 489 117 Q 519 270 550 397 Q 581 524 610 630 L 744 1118 L 936 1118 L 1068 630 Q 1096 527 1126.5 400.5 Q 1157 274 1187 117 L 1155 117 Q 1187 272 1218.5 398.5 Q 1250 525 1279 630 L 1415 1118 L 1606 1118 L 1267 0 L 1088 0 L 943 506 Q 921 583 900 663 Q 879 743 859 827 Q 839 911 818 998 L 858 998 Q 838 912 817.5 827.5 Q 797 743 776 662 Q 755 581 733 506 L 588 0 Z"],
"x": [1118, "M 65 0 L 506 643 L 505 505 L 88 1118 L 298 1118 L 437 901 Q 491 817 530.5 744 Q 570 671 612 603 L 518 603 Q 561 671 596.5 744 Q 632 817 687 901 L 829 1118 L 1035 1118 L 616 497 L 616 630 L 1053 0 L 844 0 L 680 251 Q 627 333 588.5 403.5 Q 550 474 509 539 L 604 539 Q 563 474 528 403.5 Q 493 333 439 251 L 273 0 Z"],
"y": [1151, "M 140 -405 L 186 -249 L 205 -254 Q 260 -268 305 -261.5 Q 350 -255 386 -217 Q 422 -179 449 -99 L 481 -6 L 54 1118 L 251 1118 L 489 455 Q 527 351 553 249 Q 579 147 608 51 L 542 51 Q 571 147 597.5 249.5 Q 624 352 661 455 L 901 1118 L 1097 1118 L 606 -167 Q 572 -256 524.5 -313.5 Q 477 -371 414 -398.5 Q 351 -426 272 -426 Q 224 -426 189 -419 Q 154 -412 140 -405 Z"],
"z": [1131, "M 126 0 L 126 134 L 753 940 L 753 951 L 146 951 L 146 1118 L 985 1118 L 985 975 L 376 178 L 376 167 L 1005 167 L 1005 0 Z"],
"{": [873, "M 144 646 L 144 741 Q 266 741 314 791.5 Q 362 842 362 960 L 362 1190 Q 362 1292 382.5 1366 Q 403 1440 448.5 1487.5 Q 494 1535 568.5 1558 Q 643 1581 750 1581 L 750 1430 Q 623 1431 575.5 1372.5 Q 528 1314 528 1187 L 528 901 Q 528 844 513 797.5 Q 498 751 457 717 Q 416 683 340.5 664.5 Q 265 646 144 646 Z M 750 -279 Q 643 -279 568.5 -256.5 Q 494 -234 448.5 -186.5 Q 403 -139 382.5 -65 Q 362 9 362 112 L 362 340 Q 362 459 314 510 Q 266 561 144 561 L 144 656 Q 265 656 340.5 637 Q 416 618 457 583.5 Q 498 549 513 502 Q 528 455 528 399 L 528 115 Q 528 -12 575.5 -71 Q 623 -130 750 -130 Z M 144 560 L 144 742 L 323 742 L 323 560 Z"],
"|": [681, "M 419 1970 L 419 -480 L 262 -480 L 262 1970 Z"],
"}": [873, "M 729 646 Q 608 646 532.5 664.5 Q 457 683 416 717 Q 375 751 360 797.5 Q 345 844 345 901 L 345 1187 Q 345 1313 298 1371.5 Q 251 1430 123 1430 L 123 1581 Q 230 1581 304 1558 Q 378 1535 423.5 1487.5 Q 469 1440 489.5 1366 Q 510 1292 510 1190 L 510 960 Q 510 842 558.5 791.5 Q 607 741 729 741 Z M 123 -279 L 123 -130 Q 251 -130 298 -71 Q 345 -12 345 115 L 345 399 Q 345 455 360 502 Q 375 549 416 583.5 Q 457 618 532.5 637 Q 608 656 729 656 L 729 561 Q 606 560 558 509 Q 510 458 510 340 L 510 112 Q 510 9 489.5 -65 Q 469 -139 423.5 -186.5 Q 378 -234 304 -256.5 Q 230 -279 123 -279 Z M 729 561 L 549 560 L 549 742 L 729 741 Z"],
"~": [1355, "M 168 439 Q 166 563 207.5 638 Q 249 713 316.5 746.5 Q 384 780 458 780 Q 532 780 593 749 Q 654 718 735 647 Q 788 601 820 582 Q 852 563 890 563 Q 952 563 987.5 608 Q 1023 653 1023 740 L 1187 740 Q 1189 617 1147 542 Q 1105 467 1038 433.5 Q 971 400 897 400 Q 821 400 759 432.5 Q 697 465 620 532 Q 566 579 534.5 597.5 Q 503 616 465 616 Q 407 616 369 575 Q 331 534 332 439 Z"],
"·": [590, "M 295 573 Q 239 573 199.5 612.5 Q 160 652 160 708 Q 160 764 199.5 803.5 Q 239 843 295 843 Q 351 843 390.5 803.5 Q 430 764 430 708 Q 430 652 390.5 612.5 Q 351 573 295 573 Z"],
"•": [1152, "M 576 274 Q 488 274 415 317 Q 342 360 299 433 Q 256 506 256 594 Q 256 683 299 755.5 Q 342 828 415 871 Q 488 914 576 914 Q 665 914 737.5 871 Q 810 828 853 755.5 Q 896 683 896 594 Q 896 506 853 433 Q 810 360 737.5 317 Q 665 274 576 274 Z"],
"…": [1770, "M 295 -13 Q 239 -13 199.5 26.5 Q 160 66 160 122 Q 160 178 199.5 217.5 Q 239 257 295 257 Q 351 257 390.5 217.5 Q 430 178 430 122 Q 430 66 390.5 26.5 Q 351 -13 295 -13 Z M 885 -13 Q 829 -13 789.5 26.5 Q 750 66 750 122 Q 750 178 789.5 217.5 Q 829 257 885 257 Q 941 257 980.5 217.5 Q 1020 178 1020 122 Q 1020 66 980.5 26.5 Q 941 -13 885 -13 Z M 1475 -13 Q 1419 -13 1379.5 26.5 Q 1340 66 1340 122 Q 1340 178 1379.5 217.5 Q 1419 257 1475 257 Q 1531 257 1570.5 217.5 Q 1610 178 1610 122 Q 1610 66 1570.5 26.5 Q 1531 -13 1475 -13 Z"],
"°": [933, "M 468 829 Q 375 829 298.5 874 Q 222 919 176 995.5 Q 130 1072 130 1164 Q 130 1257 176 1334 Q 222 1411 298.5 1456.5 Q 375 1502 468 1502 Q 560 1502 636 1456.5 Q 712 1411 757.5 1334 Q 803 1257 803 1164 Q 803 1072 757.5 995.5 Q 712 919 636 874 Q 560 829 468 829 Z M 468 979 Q 519 979 561 1004 Q 603 1029 628 1071 Q 653 1113 653 1164 Q 653 1216 628 1258 Q 603 1300 561 1325.5 Q 519 1351 468 1351 Q 416 1351 373.5 1325.5 Q 331 1300 306 1258 Q 281 1216 281 1164 Q 281 1113 306 1071 Q 331 1029 373.5 1004 Q 416 979 468 979 Z"],
"–": [1024, "M 1024 719 L 1024 553 L 0 553 L 0 719 Z"],
"—": [2048, "M 2048 719 L 2048 553 L 0 553 L 0 719 Z"],
"×": [1355, "M 1034 112 L 210 936 L 326 1054 L 1150 228 Z M 326 112 L 210 228 L 1034 1054 L 1150 936 Z"],
"↑": [1708, "M 202 862 L 854 1514 L 1506 862 L 1390 746 L 1180 957 Q 1129 1009 1073 1074 Q 1017 1139 964.5 1204.5 Q 912 1270 873 1321 L 905 1293 Q 914 1252 921 1210.5 Q 928 1169 932.5 1127.5 Q 937 1086 937 1044 L 937 0 L 771 0 L 771 1044 Q 771 1086 775.5 1127.5 Q 780 1169 787.5 1210.5 Q 795 1252 803 1293 L 835 1321 Q 806 1282 769 1235.5 Q 732 1189 690.5 1139 Q 649 1089 607.5 1042.5 Q 566 996 528 957 L 318 746 Z"],
"↓": [1708, "M 1506 628 L 854 -24 L 202 628 L 318 744 L 528 533 Q 579 482 635.5 416.5 Q 692 351 744 286 Q 796 221 835 169 L 803 197 Q 795 239 787.5 280.5 Q 780 322 775.5 363.5 Q 771 405 771 446 L 771 1490 L 937 1490 L 937 446 Q 937 405 932.5 363.5 Q 928 322 921 280.5 Q 914 239 905 197 L 873 169 Q 902 208 939 254.5 Q 976 301 1017.5 351 Q 1059 401 1100.5 447.5 Q 1142 494 1180 533 L 1390 744 Z"],
"±": [1355, "M 206 69 L 206 237 L 1150 237 L 1150 69 Z M 206 658 L 206 826 L 1150 826 L 1150 658 Z M 594 364 L 594 1121 L 763 1121 L 763 364 Z"],
"−": [1355, "M 1147 669 L 1147 497 L 210 497 L 210 669 Z"],
"€": [1365, "M 1070 963 L 1002 818 L 52 818 L 105 963 Z M 943 672 L 876 525 L 52 525 L 105 672 Z M 1243 1357 L 1170 1198 Q 1126 1238 1075.5 1268.5 Q 1025 1299 968 1316.5 Q 911 1334 847 1334 Q 725 1334 628 1266.5 Q 531 1199 475 1068 Q 419 937 419 744 Q 419 553 475 421.5 Q 531 290 628 223 Q 725 156 847 156 Q 912 156 968.5 173 Q 1025 190 1074 219 Q 1123 248 1164 282 L 1239 125 Q 1163 53 1061 16.5 Q 959 -20 847 -20 Q 668 -20 529 72.5 Q 390 165 311.5 336.5 Q 233 508 233 744 Q 233 981 311.5 1152.5 Q 390 1324 529 1417 Q 668 1510 847 1510 Q 960 1510 1061 1471.5 Q 1162 1433 1243 1357 Z"],
"£": [1251, "M 110 120 L 110 167 Q 199 167 237.5 218 Q 276 269 273 366 L 252 1050 Q 248 1181 302.5 1285 Q 357 1389 460 1449.5 Q 563 1510 705 1510 Q 819 1510 910.5 1464 Q 1002 1418 1061.5 1334.5 Q 1121 1251 1138 1138 L 965 1110 Q 946 1217 879.5 1280 Q 813 1343 706 1343 Q 611 1343 549 1304.5 Q 487 1266 458 1201 Q 429 1136 431 1055 L 452 373 Q 454 306 428 260.5 Q 402 215 359.5 187 Q 317 159 269 144.5 Q 221 130 178.5 125 Q 136 120 110 120 Z M 110 0 L 110 167 L 886 167 Q 932 167 951 186.5 Q 970 206 970 251 L 970 313 L 1139 313 L 1139 266 Q 1139 133 1076.5 66.5 Q 1014 0 880 0 Z M 110 670 L 110 820 L 921 820 L 921 670 Z"],
"©": [1872, "M 512 744 Q 512 864 570 962 Q 628 1060 726.5 1118 Q 825 1176 944 1176 Q 1048 1176 1135.5 1131.5 Q 1223 1087 1280.5 1011 Q 1338 935 1352 838 L 1176 838 Q 1161 912 1094.5 960 Q 1028 1008 944 1008 Q 872 1008 812 972.5 Q 752 937 716 877 Q 680 817 680 744 Q 680 672 716 612.5 Q 752 553 812 517.5 Q 872 482 944 482 Q 1028 482 1086.5 529.5 Q 1145 577 1160 652 L 1336 652 Q 1323 555 1269 478 Q 1215 401 1131.5 356.5 Q 1048 312 944 312 Q 825 312 726.5 370.5 Q 628 429 570 527 Q 512 625 512 744 Z M 936 -23 Q 777 -23 638 36.5 Q 499 96 393 202 Q 287 308 227.5 447 Q 168 586 168 745 Q 168 904 227.5 1043 Q 287 1182 393 1288 Q 499 1394 638 1453.5 Q 777 1513 936 1513 Q 1095 1513 1234 1453.5 Q 1373 1394 1479 1288 Q 1585 1182 1644.5 1043 Q 1704 904 1704 745 Q 1704 586 1644.5 447 Q 1585 308 1479 202 Q 1373 96 1234 36.5 Q 1095 -23 936 -23 Z M 936 151 Q 1059 151 1166.5 197 Q 1274 243 1356 325 Q 1438 407 1484 514.5 Q 1530 622 1530 745 Q 1530 868 1484 975.5 Q 1438 1083 1356 1165 Q 1274 1247 1166.5 1293 Q 1059 1339 936 1339 Q 813 1339 705.5 1293 Q 598 1247 516 1165 Q 434 1083 388 975.5 Q 342 868 342 745 Q 342 622 388 514.5 Q 434 407 516 325 Q 598 243 705.5 197 Q 813 151 936 151 Z"],
"’": [534, "M 160 923 L 248 1490 L 454 1490 L 298 923 Z"],
"‘": [534, "M 160 923 L 316 1490 L 454 1490 L 366 923 Z"],
"“": [902, "M 160 923 L 316 1490 L 454 1490 L 366 923 Z M 528 923 L 684 1490 L 822 1490 L 734 923 Z"],
"”": [902, "M 160 923 L 248 1490 L 454 1490 L 298 923 Z M 528 923 L 616 1490 L 822 1490 L 666 923 Z"],
},
kern: {"24":-32,"41":-40,"70":-32,"73":-34,"74":-119,"75":-20,"76":-32,"77":40,"78":-29,"79":-20,"97":-40,"C_":-81,"D_":-81,"F.":-69,"F…":-174,"F_":-69,"J_":-104,"K·":-93,"K<":-139,"L-":-104,"L·":-128,"L~":-81,"L*":-81,"L°":-93,"O_":-81,"P&":-69,"P.":-69,"P…":-197,"Q_":-81,"T&":-69,"T/":-104,"T…":-174,"T<":-162,"T_":-116,"U_":-104,"V&":-104,"V@":-69,"V·":-81,"V<":-151,"V_":-162,"W&":-104,"W<":-151,"X·":-93,"X<":-116,"Y&":-128,"Y…":-197,"Y·":-104,"Y<":-209,"Y×":-93,"Z·":-69,"Z<":-128,"f_":-29,"k<":-174,"t<":-58,"u<":-81,"u_":-69,"v…":-151,"v<":-69,"v_":-162,"w&":-69,"y…":-151,"y<":-69,"y_":-162,"&T":-116,"&V":-128,"&W":-81,"&Y":-151,"&v":-69,"&w":-69,"&y":-69,"\\T":-81,"\\v":-104,"\\y":-104,"·V":-81,"·X":-93,"·Y":-104,">T":-162,">V":-151,">W":-151,">X":-116,">Y":-186,">Z":-128,"×T":-116,"_C":-81,"_G":-81,"_O":-81,"_Q":-81,"_T":-116,"_U":-81,"_V":-162,"_j":197,"_v":-162,"_y":-162,"T·":-162,"W·":-69,"X~":-70,"r<":-81,"\\V":-100,"\\W":-116,"·T":-162,"~X":-70,"_B":69,"_D":69,"_E":69,"_F":69,"_H":69,"_I":69,"_K":69,"_L":69,"_M":69,"_N":69,"_P":69,"_R":69,"_b":69,"_h":69,"_i":69,"_k":69,"_l":69,"_m":69,"_n":69,"_p":69,"_r":69,"\"A":-162,"\"J":-337,"\"c":-30,"\"d":-30,"\"e":-30,"\"g":-30,"\"o":-30,"\"q":-30,"$T":-10,"$X":-20,"'A":-162,"'J":-337,"'c":-30,"'d":-30,"'e":-30,"'g":-30,"'o":-30,"'q":-30,"(c":-23,"(d":-23,"(e":-23,"(g":-23,"(j":58,"(o":-23,"(q":-23,"*A":-162,"*C":-23,"*G":-23,"*J":-197,"*O":-23,"*Q":-23,"+A":-69,"+J":-93,"+T":-151,"+V":-104,"+W":-104,"+X":-70,"+Y":-162,"+x":-46,",C":-90,",G":-90,",O":-90,",Q":-90,",T":-69,",Y":-69,"-A":-69,"-J":-93,"-T":-151,"-V":-104,"-W":-104,"-X":-70,"-Y":-162,"-x":-46,".C":-90,".G":-90,".O":-90,".Q":-90,".T":-69,".Y":-69,"/A":-50,"/J":-128,"0V":-20,"0X":-70,"0Y":-69,"0t":30,"1t":30,"1v":10,"1y":10,"3X":-40,"7A":-221,"7J":-197,"7a":-93,"7c":-104,"7d":-104,"7e":-104,"7g":-104,"7m":-104,"7n":-104,"7o":-104,"7p":-104,"7q":-104,"7r":-104,"7s":-81,"8X":-40,"9V":-20,"9X":-70,"9Y":-69,"9t":30,":T":-69,":V":-128,";T":-69,";V":-128,"=A":-104,"=T":-93,"=V":-139,"=W":-128,"=X":-104,"=Y":-197,"=v":-81,"=x":-69,"=y":-81,"?A":-128,"@A":-70,"@T":-61,"@V":-69,"@X":-70,"@Y":-69,"A\"":-162,"A'":-162,"A*":-162,"A+":-69,"A-":-69,"A/":40,"A1":-69,"A=":-104,"A?":-128,"A@":-70,"AA":30,"AC":-70,"AG":-70,"AO":-70,"AQ":-70,"AT":-174,"AU":-40,"AV":-140,"AW":-116,"AY":-151,"A\\":-140,"A^":-162,"Ai":11,"At":-40,"Av":-139,"Aw":-139,"Ay":-139,"A~":-69,"A·":-69,"A•":-69,"A°":-162,"A×":-69,"A±":-104,"A−":-69,"A©":-70,"A’":-209,"A‘":-267,"A“":-267,"A”":-209,"BT":-116,"B‘":-128,"B“":-128,"CA":-40,"CX":-11,"D,":-90,"D.":-90,"D/":-81,"DA":-70,"DT":-61,"DV":-69,"DX":-70,"DY":-69,"D\\":-69,"D…":-90,"D‘":-69,"D“":-69,"F,":-81,"FA":-186,"FJ":-139,"Fa":-50,"Fc":-81,"Fd":-81,"Fe":-81,"Fg":-81,"Fm":-60,"Fn":-60,"Fo":-81,"Fp":-60,"Fq":-81,"Fr":-60,"Fu":-69,"Fv":-69,"Fy":-69,"Fz":-69,"GA":-46,"GT":-61,"GV":-46,"GX":-11,"GY":-46,"G\\":-46,"Ht":30,"Hv":10,"Hy":10,"It":30,"Iv":10,"Iy":10,"J,":-69,"J.":-69,"J/":-116,"JA":-40,"J…":-69,"K$":-20,"K+":-221,"K-":-221,"K=":-69,"K@":-69,"KC":-69,"KG":-69,"KO":-69,"KQ":-69,"KS":-20,"Kc":-81,"Kd":-81,"Ke":-81,"Kg":-81,"Ki":32,"Ko":-81,"Kq":-81,"Ku":-69,"Kv":-81,"Kw":-128,"Ky":-81,"K~":-221,"K•":-69,"K×":-69,"K±":-69,"K−":-221,"K©":-69,"L\"":-186,"L'":-186,"L+":-174,"L1":-93,"L@":-58,"LC":-58,"LG":-58,"LO":-58,"LQ":-58,"LT":-197,"LV":-139,"LY":-69,"L\\":-139,"L^":-267,"Lt":-46,"Lv":-139,"Ly":-139,"L•":-69,"L×":-69,"L−":-174,"L©":-58,"L’":-80,"L‘":-174,"L“":-174,"L”":-80,"Mt":30,"Mv":10,"My":10,"Nt":30,"Nv":10,"Ny":10,"O,":-90,"O.":-90,"O/":-81,"OA":-70,"OT":-61,"OV":-69,"OX":-70,"OY":-69,"O\\":-69,"O…":-90,"O‘":-69,"O“":-69,"P+":-93,"P,":-81,"P-":-93,"PA":-151,"PJ":-197,"Pc":-11,"Pd":-11,"Pe":-11,"Pg":-11,"Po":-11,"Pq":-11,"P~":-93,"P·":-93,"P−":-93,"Q,":-90,"Q.":-90,"Q/":-81,"QA":-70,"QT":-61,"QV":-69,"QX":-70,"QY":-69,"Q\\":-69,"Q…":-90,"Q‘":-69,"Q“":-69,"RV":-34,"RY":-49,"R\\":-34,"Ra":-10,"Rc":-30,"Rd":-30,"Re":-30,"Rg":-30,"Ro":-30,"Rq":-30,"ST":-10,"SX":-20,"T+":-151,"T,":-69,"T-":-151,"T.":-69,"T0":-69,"T4":-139,"T6":-69,"T7":-162,"T:":-69,"T;":-69,"T=":-69,"T@":-61,"TA":-174,"TC":-61,"TG":-61,"TJ":-186,"TO":-61,"TQ":-61,"TY":40,"Ta":-150,"Tc":-160,"Td":-160,"Te":-160,"Tg":-160,"Tm":-116,"Tn":-116,"To":-160,"Tp":-116,"Tq":-160,"Tr":-116,"Ts":-151,"Tt":-209,"Tu":-151,"Tv":-128,"Tw":-128,"Tx":-128,"Ty":-128,"Tz":-93,"T~":-151,"T•":-69,"T×":-69,"T±":-69,"T−":-151,"T©":-61,"U,":-69,"U.":-69,"U/":-116,"UA":-40,"U…":-69,"V+":-104,"V,":-197,"V-":-104,"V.":-197,"V/":-100,"V0":-20,"V4":-69,"V6":-20,"V:":-128,"V;":-128,"V=":-128,"VA":-140,"VC":-69,"VG":-69,"VJ":-197,"VO":-69,"VQ":-69,"VV":30,"V\\":30,"Va":-104,"Vc":-104,"Vd":-104,"Ve":-104,"Vg":-104,"Vo":-104,"Vq":-104,"Vs":-93,"V~":-104,"V•":-81,"V…":-197,"V×":-81,"V±":-128,"V−":-104,"V©":-69,"W+":-104,"W,":-197,"W-":-104,"W.":-197,"W4":-69,"W:":-104,"W;":-104,"W=":-128,"WA":-116,"WJ":-128,"WW":50,"Wa":-104,"Wc":-104,"Wd":-104,"We":-104,"Wg":-104,"Wm":-70,"Wn":-70,"Wo":-104,"Wp":-70,"Wq":-104,"Wr":-70,"Ws":-69,"W~":-104,"W…":-197,"W±":-128,"W−":-104,"X$":-20,"X+":-70,"X-":-70,"X0":-70,"X3":-40,"X4":-81,"X6":-70,"X8":-40,"X=":-104,"X@":-70,"XC":-70,"XG":-70,"XO":-70,"XQ":-70,"XS":-20,"XT":-81,"Xa":-116,"Xc":-58,"Xd":-58,"Xe":-58,"Xg":-58,"Xo":-58,"Xq":-58,"X•":-93,"X×":-93,"X±":-104,"X−":-70,"X©":-70,"Y+":-162,"Y,":-69,"Y-":-162,"Y.":-69,"Y4":-139,"Y:":-128,"Y;":-128,"Y=":-197,"Y@":-69,"YA":-151,"YC":-69,"YG":-69,"YJ":-69,"YO":-69,"YQ":-69,"YT":40,"Ya":-145,"Yc":-157,"Yd":-157,"Ye":-157,"Yg":-157,"Yi":-58,"Ym":-80,"Yn":-80,"Yo":-157,"Yp":-80,"Yq":-157,"Yr":-80,"Ys":-139,"Yu":-81,"Y~":-162,"Y•":-81,"Y±":-197,"Y−":-162,"Y©":-69,"Z+":-81,"Z-":-81,"Z@":-69,"ZC":-69,"ZG":-69,"ZO":-69,"ZQ":-69,"Z~":-81,"Z−":-81,"Z©":-69,"[c":-23,"[d":-23,"[e":-23,"[g":-23,"[j":58,"[o":-23,"[q":-23,"\\A":30,"\\C":-70,"\\G":-70,"\\O":-70,"\\Q":-70,"\\U":-40,"\\Y":-151,"\\i":11,"\\t":-40,"\\w":-139,"^A":-162,"^C":-23,"^G":-23,"^J":-197,"^O":-23,"^Q":-23,"a1":-81,"aT":-140,"aV":-104,"aW":-104,"aY":-151,"a\\":-104,"av":-30,"ay":-30,"a’":-40,"a‘":-93,"a“":-93,"a”":-40,"b\"":-30,"b'":-30,"b)":-23,"b1":-69,"bA":-69,"bT":-160,"bV":-104,"bW":-104,"bX":-58,"bY":-174,"b\\":-104,"b]":-23,"ba":20,"bv":-40,"bw":-37,"bx":-46,"by":-40,"bz":-30,"b}":-23,"b’":-50,"b‘":-128,"b“":-128,"b”":-50,"c\"":-30,"c'":-30,"c)":-23,"c1":-69,"cA":-69,"cT":-160,"cV":-104,"cW":-104,"cX":-58,"cY":-174,"c\\":-104,"c]":-23,"ca":20,"cv":-40,"cw":-37,"cx":-46,"cy":-40,"cz":-30,"c}":-23,"c’":-50,"c‘":-128,"c“":-128,"c”":-50,"dt":30,"dv":10,"dy":10,"e\"":-30,"e'":-30,"e)":-23,"e1":-69,"eA":-69,"eT":-160,"eV":-104,"eW":-104,"eX":-58,"eY":-174,"e\\":-104,"e]":-23,"ea":20,"ev":-40,"ew":-37,"ex":-46,"ey":-40,"ez":-30,"e}":-23,"e’":-50,"e‘":-128,"e“":-128,"e”":-50,"f+":-58,"f,":-116,"f-":-58,"f.":-116,"f/":-58,"f4":-128,"fA":-69,"fJ":-128,"fY":20,"fa":-32,"fc":-60,"fd":-60,"fe":-60,"ff":-80,"fg":-60,"fo":-60,"fq":-60,"fs":-46,"ft":-70,"fw":30,"f~":-58,"f·":-58,"f•":-46,"f…":-116,"f×":-46,"f−":-58,"gT":-104,"h1":-81,"hT":-140,"hV":-104,"hW":-104,"hY":-151,"h\\":-104,"hv":-30,"hy":-30,"h’":-40,"h‘":-93,"h“":-93,"h”":-40,"k+":-93,"k-":-93,"k4":-93,"kT":-116,"kc":-46,"kd":-46,"ke":-46,"kg":-46,"ko":-46,"kq":-46,"k~":-93,"k·":-93,"k−":-93,"lt":30,"lv":10,"ly":10,"m1":-81,"mT":-140,"mV":-104,"mW":-104,"mY":-151,"m\\":-104,"mv":-30,"my":-30,"m’":-40,"m‘":-93,"m“":-93,"m”":-40,"n1":-81,"nT":-140,"nV":-104,"nW":-104,"nY":-151,"n\\":-104,"nv":-30,"ny":-30,"n’":-40,"n‘":-93,"n“":-93,"n”":-40,"o\"":-30,"o'":-30,"o)":-23,"o1":-69,"oA":-69,"oT":-160,"oV":-104,"oW":-104,"oX":-58,"oY":-174,"o\\":-104,"o]":-23,"oa":20,"ov":-40,"ow":-37,"ox":-46,"oy":-40,"oz":-30,"o}":-23,"o’":-50,"o‘":-128,"o“":-128,"o”":-50,"p\"":-30,"p'":-30,"p)":-23,"p1":-69,"pA":-69,"pT":-160,"pV":-104,"pW":-104,"pX":-58,"pY":-174,"p\\":-104,"p]":-23,"pa":20,"pv":-40,"pw":-37,"px":-46,"py":-40,"pz":-30,"p}":-23,"p’":-50,"p‘":-128,"p“":-128,"p”":-50,"qT":-104,"r+":-81,"r,":-128,"r-":-81,"r.":-128,"r/":-69,"rA":-81,"rB":32,"rD":32,"rE":32,"rF":32,"rH":32,"rI":32,"rJ":-116,"rK":32,"rL":32,"rM":32,"rN":32,"rP":32,"rR":32,"rT":-116,"rZ":-69,"rb":32,"rc":-34,"rd":-34,"re":-34,"rf":32,"rg":-34,"rh":32,"ri":20,"rj":32,"rk":32,"rl":32,"rm":32,"rn":32,"ro":-34,"rp":32,"rq":-34,"rr":32,"rt":32,"rv":32,"rw":17,"rx":32,"ry":32,"r|":32,"r~":-81,"r·":-81,"r…":-128,"r−":-81,"r’":32,"r‘":-81,"r“":-81,"r”":32,"sT":-151,"sV":-93,"sW":-69,"sY":-151,"s\\":-93,"s‘":-104,"s“":-104,"t+":-40,"t-":-40,"t4":-29,"tT":-69,"tV":-20,"tW":-20,"tY":-32,"t\\":-20,"ta":10,"tc":-20,"td":-20,"te":-20,"tf":-50,"tg":-20,"tj":20,"to":-20,"tq":-20,"ts":-20,"tv":40,"tw":30,"ty":40,"t~":-40,"t·":-40,"t•":-23,"t×":-23,"t−":-40,"t‘":-81,"t“":-81,"u+":-81,"u-":-81,"u/":-69,"uT":-104,"uY":-116,"u~":-81,"u·":-81,"u−":-81,"u’":29,"u‘":-81,"u“":-81,"u”":29,"v+":-81,"v,":-90,"v-":-81,"v.":-90,"v/":-116,"v=":-81,"vA":-139,"vB":10,"vD":10,"vE":10,"vF":10,"vH":10,"vI":10,"vJ":-128,"vK":10,"vL":10,"vM":10,"vN":10,"vP":10,"vR":10,"vT":-69,"vY":-69,"va":-10,"vb":10,"vc":-40,"vd":-40,"ve":-40,"vf":30,"vg":-40,"vh":10,"vk":10,"vl":10,"vo":-40,"vq":-40,"vt":30,"v|":10,"v~":-81,"v·":-81,"v±":-81,"v−":-81,"w,":-151,"w.":-151,"wA":-139,"wJ":-116,"wT":-104,"wZ":-69,"wc":-37,"wd":-37,"we":-37,"wg":-37,"wo":-37,"wq":-37,"w…":-151,"x+":-46,"x-":-46,"x=":-69,"xT":-128,"xc":-46,"xd":-46,"xe":-46,"xf":40,"xg":-46,"xo":-46,"xq":-46,"xt":40,"x~":-46,"x·":-46,"x±":-69,"x−":-46,"y+":-81,"y,":-90,"y-":-81,"y.":-90,"y/":-116,"y=":-81,"yA":-139,"yB":10,"yD":10,"yE":10,"yF":10,"yH":10,"yI":10,"yJ":-128,"yK":10,"yL":10,"yM":10,"yN":10,"yP":10,"yR":10,"yT":-69,"yY":-69,"ya":-10,"yb":10,"yc":-40,"yd":-40,"ye":-40,"yf":30,"yg":-40,"yh":10,"yk":10,"yl":10,"yo":-40,"yq":-40,"yt":30,"y|":10,"y~":-81,"y·":-81,"y±":-81,"y−":-81,"zT":-69,"zc":-30,"zd":-30,"ze":-30,"zg":-30,"zo":-30,"zq":-30,"{c":-23,"{d":-23,"{e":-23,"{g":-23,"{j":58,"{o":-23,"{q":-23,"|t":30,"|v":10,"|y":10,"~A":-69,"~J":-93,"~T":-151,"~V":-104,"~W":-104,"~Y":-162,"~x":-46,"·A":-69,"·J":-93,"·W":-104,"·x":-46,"•A":-69,"•T":-69,"•V":-81,"•X":-93,"•Y":-93,"…C":-90,"…G":-90,"…O":-90,"…Q":-90,"…T":-69,"…Y":-69,"°A":-162,"°C":-23,"°G":-23,"°J":-197,"°O":-23,"°Q":-23,"×A":-69,"×V":-81,"×X":-93,"×Y":-93,"±A":-104,"±T":-93,"±V":-139,"±W":-128,"±X":-104,"±Y":-197,"±v":-81,"±x":-69,"±y":-81,"−A":-69,"−J":-93,"−T":-151,"−V":-104,"−W":-104,"−X":-70,"−Y":-162,"−x":-46,"©A":-70,"©T":-61,"©V":-69,"©X":-70,"©Y":-69,"’A":-280,"’C":-116,"’G":-116,"’J":-256,"’O":-116,"’Q":-116,"’a":-116,"’c":-128,"’d":-128,"’e":-128,"’g":-128,"’m":-43,"’n":-43,"’o":-128,"’p":-43,"’q":-128,"’r":-43,"’s":-157,"’t":29,"’u":-81,"’v":29,"’y":29,"‘A":-197,"‘J":-302,"‘c":-80,"‘d":-80,"‘e":-80,"‘g":-80,"‘o":-80,"‘q":-80,"‘s":-40,"“A":-197,"“J":-302,"“c":-80,"“d":-80,"“e":-80,"“g":-80,"“o":-80,"“q":-80,"“s":-40,"”A":-280,"”C":-116,"”G":-116,"”J":-256,"”O":-116,"”Q":-116,"”a":-116,"”c":-128,"”d":-128,"”e":-128,"”g":-128,"”m":-43,"”n":-43,"”o":-128,"”p":-43,"”q":-128,"”r":-43,"”s":-157,"”t":29,"”u":-81,"”v":29,"”y":29,"0_":-93,"6_":-93,"7&":-93,"7#":-116,"7<":-186,"7_":-325,"9_":-93,"&\\":-128,"&‘":-186,"&'":-69,"&\"":-69,"&“":-186,"@_":-81,"\\‘":-87,"\\’":-116,"\\“":-87,"\\”":-116,"‘&":-128,"’&":-139,"’#":-256,"’<":-197,"’~":-93,"’_":-81,"'&":-69,"\"&":-69,"“&":-128,"”&":-139,"”#":-256,"”<":-197,"”~":-93,"”_":-81,"·\\":-81,">7":-151,">\\":-151,">‘":-197,">“":-197,"_0":-93,"_1":-221,"_3":-93,"_4":-116,"_5":-93,"_6":-93,"_8":-93,"_9":-93,"_@":-81,"_\\":-162,"_‘":-81,"_“":-81,"_^":-139,"_*":-139,"_©":-81,"_°":-139,"^&":-69,"^_":-139,"*&":-69,"*_":-139,"©_":-81,"°&":-69,"°_":-139,"%‘":-128,"%’":-139,"%“":-128,"%”":-139,"5,":-55,"5.":-55,"5…":-55,"6,":-69,"6.":-69,"6…":-69,"\\\\":-100,",5":-29,",9":-14,".5":-29,".9":-14,"…5":-29,"…9":-14,"_|":69,"\",":-168,"\".":-168,"\"4":-128,"\"…":-168,"',":-168,"'.":-168,"'4":-128,"'…":-168,")‘":-69,")“":-69,"*,":-279,"*.":-279,"*4":-93,"*@":-23,"*…":-279,"*©":-23,"+2":-69,"+3":-23,"+7":-46,"+\\":-104,"+‘":-128,"+“":-128,",\"":-168,",'":-168,",0":-52,",1":-177,",3":-55,",6":-52,",7":-29,",8":-46,",?":-180,",@":-90,",©":-90,",’":-116,",”":-116,"-2":-69,"-3":-23,"-7":-46,"-\\":-104,"-‘":-128,"-“":-128,".\"":-168,".'":-168,".0":-52,".1":-177,".3":-55,".6":-52,".7":-29,".8":-46,".?":-180,".@":-90,".©":-90,".’":-116,".”":-116,"/,":-81,"/.":-81,"/…":-81,"0,":-52,"0.":-52,"07":-40,"0\\":-20,"0…":-52,"0‘":-93,"0“":-93,"3*":-30,"3,":-46,"3.":-46,"3^":-30,"3…":-46,"3°":-30,"4*":-40,"4,":-69,"4.":-69,"4^":-40,"4…":-69,"4°":-40,"7,":-256,"7.":-256,"7:":-69,"7;":-69,"7…":-256,"8*":-30,"8,":-46,"8.":-46,"8^":-30,"8…":-46,"8°":-30,"9,":-52,"9.":-52,"9\\":-20,"9…":-52,"9‘":-93,"9“":-93,":\\":-128,":‘":-93,":“":-93,";\\":-128,";‘":-93,";“":-93,"=\\":-139,"=‘":-116,"=“":-116,"@,":-90,"@.":-90,"@/":-81,"@\\":-69,"@…":-90,"@‘":-69,"@“":-69,"\\\"":-162,"\\'":-162,"\\*":-162,"\\+":-69,"\\-":-69,"\\/":40,"\\1":-69,"\\=":-104,"\\?":-128,"\\@":-70,"\\^":-162,"\\~":-69,"\\·":-69,"\\•":-69,"\\°":-162,"\\×":-69,"\\±":-104,"\\−":-69,"\\©":-70,"]‘":-69,"]“":-69,"^,":-279,"^.":-279,"^4":-93,"^@":-23,"^…":-279,"^©":-23,"}‘":-69,"}“":-69,"~2":-69,"~3":-23,"~7":-46,"~\\":-104,"~‘":-128,"~“":-128,"·2":-69,"·3":-23,"·7":-46,"·‘":-128,"·“":-128,"•\\":-81,"…\"":-168,"…'":-168,"…0":-52,"…1":-177,"…3":-55,"…6":-52,"…7":-29,"…8":-46,"…?":-180,"…@":-90,"…©":-90,"…’":-116,"…”":-116,"°,":-279,"°.":-279,"°4":-93,"°@":-23,"°…":-279,"°©":-23,"×\\":-81,"±\\":-139,"±‘":-116,"±“":-116,"−2":-69,"−3":-23,"−7":-46,"−\\":-104,"−‘":-128,"−“":-128,"©,":-90,"©.":-90,"©/":-81,"©\\":-69,"©…":-90,"©‘":-69,"©“":-69,"’+":-128,"’,":-203,"’-":-128,"’.":-203,"’/":-290,"’0":-93,"’4":-197,"’6":-93,"’7":-128,"’8":-81,"’:":-116,"’;":-116,"’=":-116,"’@":-116,"’·":-128,"’…":-203,"’±":-116,"’−":-128,"’©":-116,"‘,":-174,"‘.":-174,"‘/":-197,"‘4":-128,"‘…":-174,"“,":-174,"“.":-174,"“/":-197,"“4":-128,"“…":-174,"”+":-128,"”,":-203,"”-":-128,"”.":-203,"”/":-290,"”0":-93,"”4":-197,"”6":-93,"”7":-128,"”8":-81,"”:":-116,"”;":-116,"”=":-116,"”@":-116,"”·":-128,"”…":-203,"”±":-116,"”−":-128,"”©":-116},
};
};
__d[7] = function (__ns) {

__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
family: 'Inter',
weight: 600,
unitsPerEm: 2048,
ascender: 1984,
descender: -494,
capHeight: 1490,
xHeight: 1118,
chars: {
"0": [1351, "M 675 -20 Q 495 -20 367 70.5 Q 239 161 171 331.5 Q 103 502 103 744 Q 103 986 171.5 1157 Q 240 1328 367.5 1419 Q 495 1510 675 1510 Q 856 1510 984 1419 Q 1112 1328 1180 1157 Q 1248 986 1248 744 Q 1248 502 1180.5 331.5 Q 1113 161 985 70.5 Q 857 -20 675 -20 Z M 676 204 Q 773 204 840.5 267.5 Q 908 331 943.5 451.5 Q 979 572 979 744 Q 979 917 943.5 1038 Q 908 1159 840.5 1223 Q 773 1287 676 1287 Q 578 1287 510.5 1223 Q 443 1159 407.5 1038 Q 372 917 372 744 Q 372 572 407 451.5 Q 442 331 510 267.5 Q 578 204 676 204 Z"],
"1": [866, "M 717 1490 L 717 0 L 452 0 L 452 1252 L 442 1252 L 94 1002 L 94 1256 L 421 1490 Z"],
"2": [1276, "M 134 0 L 134 192 L 651 701 Q 724 776 773.5 834 Q 823 892 848.5 946.5 Q 874 1001 874 1065 Q 874 1135 841.5 1186 Q 809 1237 753.5 1264.5 Q 698 1292 627 1292 Q 552 1292 496.5 1262 Q 441 1232 411 1176.5 Q 381 1121 381 1044 L 126 1044 Q 126 1185 190.5 1290 Q 255 1395 368.5 1452.5 Q 482 1510 630 1510 Q 779 1510 892 1454 Q 1005 1398 1068 1300.5 Q 1131 1203 1131 1078 Q 1131 995 1100 916 Q 1069 837 989 737.5 Q 909 638 763 498 L 504 234 L 504 223 L 1153 223 L 1153 0 Z"],
"3": [1303, "M 651 -20 Q 494 -20 372.5 34 Q 251 88 181 183.5 Q 111 279 107 404 L 376 404 Q 380 343 416.5 298 Q 453 253 514 228.5 Q 575 204 651 204 Q 731 204 792.5 232 Q 854 260 889.5 310.5 Q 925 361 925 427 Q 925 495 889 547 Q 853 599 786 628.5 Q 719 658 624 658 L 492 658 L 492 864 L 624 864 Q 702 864 761 891.5 Q 820 919 853 968 Q 886 1017 886 1082 Q 886 1145 857.5 1192 Q 829 1239 776.5 1265.5 Q 724 1292 654 1292 Q 585 1292 527 1267.5 Q 469 1243 433 1198 Q 397 1153 395 1089 L 138 1089 Q 140 1214 209.5 1308.5 Q 279 1403 395.5 1456.5 Q 512 1510 656 1510 Q 805 1510 915 1454 Q 1025 1398 1085.5 1304.5 Q 1146 1211 1146 1098 Q 1146 972 1072 887 Q 998 802 877 775 L 877 763 Q 981 749 1053 701.5 Q 1125 654 1162.5 580 Q 1200 506 1200 413 Q 1200 288 1129 190 Q 1058 92 934.5 36 Q 811 -20 651 -20 Z"],
"4": [1364, "M 107 277 L 107 490 L 740 1490 L 916 1490 L 916 1186 L 809 1186 L 380 509 L 380 497 L 1264 497 L 1264 277 Z M 816 0 L 816 341 L 821 438 L 821 1490 L 1072 1490 L 1072 0 Z"],
"5": [1254, "M 618 -20 Q 472 -20 357.5 34.5 Q 243 89 176 185 Q 109 281 105 404 L 365 404 Q 368 343 403 296.5 Q 438 250 494 223.5 Q 550 197 618 197 Q 698 197 759.5 233.5 Q 821 270 856.5 334.5 Q 892 399 892 483 Q 892 568 855.5 634 Q 819 700 755.5 737.5 Q 692 775 610 775 Q 542 775 477.5 749.5 Q 413 724 375 683 L 133 722 L 211 1490 L 1073 1490 L 1073 1266 L 432 1266 L 390 870 L 398 870 Q 440 919 515.5 950.5 Q 591 982 681 982 Q 782 982 868 945.5 Q 954 909 1017.5 842.5 Q 1081 776 1116 686 Q 1151 596 1151 489 Q 1151 341 1083 226.5 Q 1015 112 895 46 Q 775 -20 618 -20 Z"],
"6": [1310, "M 671 -20 Q 565 -20 463.5 16.5 Q 362 53 280.5 136.5 Q 199 220 151 358.5 Q 103 497 103 702 Q 103 894 143.5 1043.5 Q 184 1193 260.5 1297 Q 337 1401 445 1455.5 Q 553 1510 687 1510 Q 826 1510 934.5 1455 Q 1043 1400 1110 1305 Q 1177 1210 1193 1089 L 931 1089 Q 910 1175 847 1227 Q 784 1279 687 1279 Q 583 1279 510.5 1218 Q 438 1157 400.5 1043.5 Q 363 930 363 772 L 374 772 Q 410 837 466.5 883 Q 523 929 594.5 953.5 Q 666 978 745 978 Q 876 978 980.5 915.5 Q 1085 853 1146 743.5 Q 1207 634 1207 492 Q 1207 346 1140 230 Q 1073 114 952.5 47 Q 832 -20 671 -20 Z M 670 197 Q 749 197 812 235.5 Q 875 274 911.5 340 Q 948 406 948 487 Q 948 567 912.5 632 Q 877 697 815 735 Q 753 773 673 773 Q 614 773 563 750.5 Q 512 728 473.5 688 Q 435 648 414 596 Q 393 544 393 486 Q 393 408 429 342 Q 465 276 528 236.5 Q 591 197 670 197 Z"],
"7": [1180, "M 185 0 L 819 1256 L 819 1266 L 83 1266 L 83 1490 L 1097 1490 L 1097 1260 L 463 0 Z"],
"8": [1311, "M 655 -20 Q 494 -20 369 34.5 Q 244 89 173.5 183.5 Q 103 278 103 399 Q 103 492 144 571 Q 185 650 255.5 703 Q 326 756 414 771 L 414 780 Q 299 806 228 898.5 Q 157 991 157 1111 Q 157 1226 221.5 1316 Q 286 1406 398.5 1458 Q 511 1510 655 1510 Q 798 1510 910.5 1458 Q 1023 1406 1088 1316 Q 1153 1226 1153 1111 Q 1153 991 1081.5 898.5 Q 1010 806 897 780 L 897 771 Q 984 756 1054.5 703 Q 1125 650 1166.5 571 Q 1208 492 1208 399 Q 1208 278 1137 183.5 Q 1066 89 941 34.5 Q 816 -20 655 -20 Z M 655 186 Q 739 186 801 215 Q 863 244 897.5 296.5 Q 932 349 932 418 Q 932 490 896 544.5 Q 860 599 797.5 631 Q 735 663 655 663 Q 575 663 512 631.5 Q 449 600 413 545 Q 377 490 377 418 Q 377 349 411 297 Q 445 245 508 215.5 Q 571 186 655 186 Z M 655 865 Q 724 865 777 893 Q 830 921 861 970.5 Q 892 1020 892 1085 Q 892 1150 862 1198 Q 832 1246 778.5 1273 Q 725 1300 655 1300 Q 584 1300 530.5 1273 Q 477 1246 447.5 1198 Q 418 1150 418 1085 Q 418 1020 448 970.5 Q 478 921 532 893 Q 586 865 655 865 Z"],
"9": [1310, "M 625 -21 Q 485 -21 376.5 34 Q 268 89 201 185 Q 134 281 117 403 L 381 403 Q 401 317 463.5 263.5 Q 526 210 625 210 Q 729 210 801 271 Q 873 332 910.5 446 Q 948 560 948 719 L 938 719 Q 902 655 845.5 609 Q 789 563 718 538 Q 647 513 566 513 Q 436 513 330.5 575.5 Q 225 638 164 748 Q 103 858 103 998 Q 103 1145 171 1262 Q 239 1379 360 1446 Q 481 1513 642 1511 Q 748 1511 848.5 1474 Q 949 1437 1030 1354 Q 1111 1271 1159 1132.5 Q 1207 994 1207 789 Q 1207 597 1166.5 447 Q 1126 297 1049.5 192.5 Q 973 88 865.5 33.5 Q 758 -21 625 -21 Z M 637 718 Q 697 718 748.5 741 Q 800 764 838 804 Q 876 844 897.5 896 Q 919 948 919 1007 Q 919 1084 883 1149 Q 847 1214 784.5 1253.5 Q 722 1293 641 1293 Q 562 1293 499.5 1254.5 Q 437 1216 400 1150.5 Q 363 1085 363 1004 Q 363 924 399 859 Q 435 794 496.5 756 Q 558 718 637 718 Z"],
" ": [516, ""],
"!": [658, "M 205 474 L 187 1490 L 470 1490 L 451 474 Z M 329 -17 Q 258 -17 212 27.5 Q 166 72 166 140 Q 166 209 212 253.5 Q 258 298 329 298 Q 400 298 446 253.5 Q 492 209 492 140 Q 492 72 446 27.5 Q 400 -17 329 -17 Z"],
"\"": [1071, "M 232 887 L 205 1490 L 462 1490 L 435 887 Z M 636 887 L 609 1490 L 866 1490 L 839 887 Z"],
"#": [1318, "M 697 0 L 942 1490 L 1144 1490 L 899 0 Z M 26 385 L 60 587 L 1206 587 L 1172 385 Z M 174 0 L 418 1490 L 620 1490 L 376 0 Z M 113 902 L 147 1105 L 1291 1105 L 1258 902 Z"],
"$": [1332, "M 612 -206 L 612 1696 L 732 1696 L 732 -206 Z M 673 -23 Q 500 -23 372.5 31 Q 245 85 173 188 Q 101 291 95 438 L 358 438 Q 365 360 407 308 Q 449 256 518 230.5 Q 587 205 671 205 Q 759 205 826.5 232 Q 894 259 932 307.5 Q 970 356 970 420 Q 970 478 936.5 516 Q 903 554 842.5 580.5 Q 782 607 701 627 L 532 671 Q 345 719 240.5 816 Q 136 913 136 1071 Q 136 1203 207 1302 Q 278 1401 401 1455.5 Q 524 1510 680 1510 Q 839 1510 959 1455 Q 1079 1400 1146.5 1303 Q 1214 1206 1217 1082 L 958 1082 Q 948 1178 872.5 1230.5 Q 797 1283 676 1283 Q 592 1283 531.5 1257.5 Q 471 1232 438.5 1188 Q 406 1144 406 1087 Q 406 1025 444.5 985 Q 483 945 541.5 921 Q 600 897 660 882 L 799 846 Q 882 826 960 793 Q 1038 760 1100.5 709.5 Q 1163 659 1200 587 Q 1237 515 1237 418 Q 1237 287 1170 187.5 Q 1103 88 977 32.5 Q 851 -23 673 -23 Z"],
"%": [2057, "M 515 796 Q 413 796 343 840 Q 273 884 236.5 957 Q 200 1030 200 1116 L 200 1194 Q 200 1281 237 1353.5 Q 274 1426 344.5 1470 Q 415 1514 515 1514 Q 618 1514 687.5 1470 Q 757 1426 792.5 1353.5 Q 828 1281 828 1194 L 828 1116 Q 828 1029 792 956 Q 756 883 686.5 839.5 Q 617 796 515 796 Z M 515 962 Q 585 962 611.5 1009.5 Q 638 1057 638 1116 L 638 1194 Q 638 1252 612.5 1300.5 Q 587 1349 515 1349 Q 446 1349 418.5 1300 Q 391 1251 391 1194 L 391 1116 Q 391 1057 418 1009.5 Q 445 962 515 962 Z M 1543 -27 Q 1441 -27 1370.5 16.5 Q 1300 60 1264 133 Q 1228 206 1228 293 L 1228 371 Q 1228 458 1265 530.5 Q 1302 603 1372 647 Q 1442 691 1543 691 Q 1646 691 1715.5 647 Q 1785 603 1820.5 530.5 Q 1856 458 1856 371 L 1856 293 Q 1856 206 1820 133 Q 1784 60 1714 16.5 Q 1644 -27 1543 -27 Z M 1543 139 Q 1613 139 1639.5 186.5 Q 1666 234 1666 293 L 1666 371 Q 1666 429 1640.5 477.5 Q 1615 526 1543 526 Q 1474 526 1446 477 Q 1418 428 1418 371 L 1418 293 Q 1418 234 1445.5 186.5 Q 1473 139 1543 139 Z M 414 0 L 1438 1490 L 1633 1490 L 609 0 Z"],
"&": [1357, "M 579 -21 Q 428 -21 317.5 34 Q 207 89 148 183 Q 89 277 89 392 Q 89 484 125.5 553.5 Q 162 623 228 681 Q 294 739 379 799 L 643 979 Q 672 1000 699.5 1026 Q 727 1052 744 1084.5 Q 761 1117 761 1157 Q 761 1215 721 1254.5 Q 681 1294 610 1294 Q 562 1294 525.5 1274.5 Q 489 1255 469 1221 Q 449 1187 449 1141 Q 449 1090 474 1041 Q 499 992 542.5 938 Q 586 884 642 818 L 1341 0 L 1057 0 L 478 664 Q 411 744 351 817.5 Q 291 891 253.5 970 Q 216 1049 216 1143 Q 216 1247 264.5 1329.5 Q 313 1412 401 1459.5 Q 489 1507 607 1507 Q 723 1507 807.5 1460.5 Q 892 1414 938 1337 Q 984 1260 984 1165 Q 984 1097 959 1037 Q 934 977 890 926 Q 846 875 786 831 L 484 611 Q 413 558 379.5 509 Q 346 460 346 398 Q 346 336 375.5 289.5 Q 405 243 458 217.5 Q 511 192 581 192 Q 665 192 744.5 228.5 Q 824 265 887.5 332 Q 951 399 989 492.5 Q 1027 586 1027 700 L 1252 700 Q 1252 559 1220.5 455 Q 1189 351 1139.5 280 Q 1090 209 1037 167 L 974 119 Q 895 47 788.5 13 Q 682 -21 579 -21 Z"],
"'": [667, "M 232 887 L 205 1490 L 462 1490 L 435 887 Z"],
"(": [764, "M 186 607 Q 186 772 219 951 Q 252 1130 310 1295 Q 368 1460 444 1581 L 687 1581 Q 614 1425 560.5 1256.5 Q 507 1088 478.5 922 Q 450 756 450 607 Q 450 475 474.5 341.5 Q 499 208 551.5 56.5 Q 604 -95 687 -279 L 444 -279 Q 317 -66 251.5 159 Q 186 384 186 607 Z"],
")": [764, "M 77 -279 Q 162 -91 214 61 Q 266 213 290 345.5 Q 314 478 314 607 Q 314 756 285.5 922 Q 257 1088 204 1256.5 Q 151 1425 77 1581 L 320 1581 Q 396 1460 454 1295 Q 512 1130 545 950.5 Q 578 771 578 607 Q 578 382 512 156.5 Q 446 -69 320 -279 Z"],
"*": [1105, "M 464 652 L 481 947 L 234 784 L 145 938 L 410 1070 L 145 1202 L 234 1358 L 481 1195 L 464 1490 L 640 1490 L 624 1195 L 872 1358 L 960 1202 L 696 1070 L 960 938 L 872 784 L 624 947 L 640 652 Z"],
"+": [1378, "M 576 88 L 576 1094 L 802 1094 L 802 88 Z M 187 485 L 187 698 L 1192 698 L 1192 485 Z"],
",": [653, "M 123 -383 L 211 220 L 479 220 L 305 -383 Z"],
"-": [953, "M 811 728 L 811 513 L 141 513 L 141 728 Z"],
".": [653, "M 326 -17 Q 259 -17 212.5 29 Q 166 75 166 143 Q 166 210 212.5 256 Q 259 302 326 302 Q 394 302 440.5 256 Q 487 210 487 143 Q 487 75 440.5 29 Q 394 -17 326 -17 Z"],
"/": [776, "M 742 1560 L 262 -224 L 34 -224 L 514 1560 Z"],
":": [653, "M 326 -17 Q 259 -17 212.5 29 Q 166 75 166 143 Q 166 210 212.5 256 Q 259 302 326 302 Q 394 302 440.5 256 Q 487 210 487 143 Q 487 75 440.5 29 Q 394 -17 326 -17 Z M 326 747 Q 259 747 212.5 793 Q 166 839 166 907 Q 166 974 212.5 1020 Q 259 1066 326 1066 Q 394 1066 440.5 1020 Q 487 974 487 907 Q 487 839 440.5 793 Q 394 747 326 747 Z"],
";": [674, "M 123 -383 L 211 220 L 479 220 L 305 -383 Z M 348 747 Q 281 747 234.5 793 Q 188 839 188 907 Q 188 974 234.5 1020 Q 281 1066 348 1066 Q 416 1066 462.5 1020 Q 509 974 509 907 Q 509 839 462.5 793 Q 416 747 348 747 Z"],
"<": [1378, "M 169 488 L 169 694 L 1163 1155 L 1163 897 L 455 593 L 464 607 L 464 574 L 455 587 L 1163 283 L 1163 27 Z"],
"=": [1378, "M 207 712 L 207 934 L 1172 934 L 1172 712 Z M 207 247 L 207 471 L 1172 471 L 1172 247 Z"],
">": [1378, "M 1209 488 L 216 27 L 216 283 L 924 587 L 916 574 L 916 607 L 924 593 L 216 897 L 216 1155 L 1209 694 Z"],
"?": [1113, "M 388 455 L 388 474 Q 388 605 411.5 678.5 Q 435 752 480.5 795.5 Q 526 839 590 878 Q 657 920 702.5 974.5 Q 748 1029 748 1107 Q 748 1165 720.5 1207 Q 693 1249 647.5 1272.5 Q 602 1296 545 1296 Q 494 1296 447 1274 Q 400 1252 369.5 1207 Q 339 1162 335 1094 L 80 1094 Q 83 1232 146.5 1324.5 Q 210 1417 315 1463.5 Q 420 1510 546 1510 Q 685 1510 790.5 1461.5 Q 896 1413 955 1323 Q 1014 1233 1014 1111 Q 1014 986 956.5 900.5 Q 899 815 798 755 Q 738 718 700 683 Q 662 648 644.5 600 Q 627 552 627 474 L 627 455 Z M 509 -17 Q 438 -17 391.5 27.5 Q 345 72 345 140 Q 345 209 391.5 253.5 Q 438 298 509 298 Q 580 298 626 253.5 Q 672 209 672 140 Q 672 72 626 27.5 Q 580 -17 509 -17 Z"],
"@": [2046, "M 1056 -417 Q 829 -417 651.5 -354.5 Q 474 -292 351.5 -172.5 Q 229 -53 166 121.5 Q 103 296 103 519 Q 103 734 165 908 Q 227 1082 347.5 1206.5 Q 468 1331 643 1398 Q 818 1465 1044 1465 Q 1257 1465 1423.5 1400 Q 1590 1335 1706 1220 Q 1822 1105 1882.5 953 Q 1943 801 1943 627 Q 1943 508 1924 400.5 Q 1905 293 1860.5 209 Q 1816 125 1741 76.5 Q 1666 28 1553 28 Q 1492 28 1433 45 Q 1374 62 1332.5 99 Q 1291 136 1281 195 L 1273 195 Q 1247 124 1172 76.5 Q 1097 29 981 29 Q 845 29 751.5 93 Q 658 157 609 269.5 Q 560 382 560 529 Q 560 672 614.5 782.5 Q 669 893 766 955.5 Q 863 1018 988 1018 Q 1085 1018 1154 983 Q 1223 948 1251 899 L 1262 899 L 1262 995 L 1452 995 L 1452 325 Q 1452 273 1477.5 239.5 Q 1503 206 1555 206 Q 1622 206 1659.5 249.5 Q 1697 293 1712.5 383.5 Q 1728 474 1728 615 Q 1728 753 1686.5 871.5 Q 1645 990 1561 1078.5 Q 1477 1167 1350 1216 Q 1223 1265 1054 1265 Q 878 1265 743 1214.5 Q 608 1164 515.5 1068 Q 423 972 375.5 834 Q 328 696 328 521 Q 328 344 375.5 206.5 Q 423 69 518 -25 Q 613 -119 752 -167 Q 891 -215 1074 -215 Q 1155 -215 1230.5 -202 Q 1306 -189 1367.5 -171 Q 1429 -153 1466 -138 L 1533 -323 Q 1484 -346 1408.5 -367.5 Q 1333 -389 1242 -403 Q 1151 -417 1056 -417 Z M 1002 222 Q 1090 222 1145.5 257.5 Q 1201 293 1228 362.5 Q 1255 432 1255 534 Q 1255 639 1226.5 700.5 Q 1198 762 1142.5 789 Q 1087 816 1006 816 Q 928 816 873 779.5 Q 818 743 789 679.5 Q 760 616 760 535 Q 760 448 785 377 Q 810 306 864 264 Q 918 222 1002 222 Z"],
"A": [1490, "M 50 0 L 570 1490 L 909 1490 L 1441 0 L 1148 0 L 883 774 Q 844 894 802 1045.5 Q 760 1197 709 1390 L 765 1390 Q 715 1195 674.5 1042.5 Q 634 890 598 774 L 342 0 Z M 353 369 L 353 584 L 1138 584 L 1138 369 Z"],
"B": [1350, "M 150 0 L 150 1490 L 720 1490 Q 881 1490 988 1439 Q 1095 1388 1148 1301 Q 1201 1214 1201 1103 Q 1201 1012 1166 947.5 Q 1131 883 1072.5 843 Q 1014 803 941 786 L 941 771 Q 1020 767 1093 723 Q 1166 679 1212.5 599 Q 1259 519 1259 406 Q 1259 290 1203 198 Q 1147 106 1034.5 53 Q 922 0 751 0 Z M 417 223 L 709 223 Q 857 223 922.5 280 Q 988 337 988 426 Q 988 493 955 546.5 Q 922 600 861.5 631 Q 801 662 718 662 L 417 662 Z M 417 855 L 686 855 Q 757 855 813 881 Q 869 907 901.5 955 Q 934 1003 934 1069 Q 934 1156 873 1212 Q 812 1268 692 1268 L 417 1268 Z"],
"C": [1509, "M 785 -20 Q 589 -20 435 71 Q 281 162 192 333 Q 103 504 103 744 Q 103 985 192.5 1156.5 Q 282 1328 436.5 1419 Q 591 1510 785 1510 Q 907 1510 1013.5 1475.5 Q 1120 1441 1203.5 1374.5 Q 1287 1308 1341 1212 Q 1395 1116 1413 994 L 1144 994 Q 1131 1061 1099.5 1112 Q 1068 1163 1021 1198.5 Q 974 1234 915 1252.5 Q 856 1271 789 1271 Q 667 1271 572.5 1209.5 Q 478 1148 424.5 1030.5 Q 371 913 371 744 Q 371 573 425 456 Q 479 339 573.5 279 Q 668 219 788 219 Q 855 219 914 237.5 Q 973 256 1020.5 291.5 Q 1068 327 1100 378.5 Q 1132 430 1144 496 L 1414 496 Q 1399 389 1348.5 295.5 Q 1298 202 1216 131 Q 1134 60 1025.5 20 Q 917 -20 785 -20 Z"],
"D": [1479, "M 654 0 L 277 0 L 277 231 L 641 231 Q 797 231 901.5 288.5 Q 1006 346 1059 460.5 Q 1112 575 1112 747 Q 1112 917 1059 1031 Q 1006 1145 903.5 1202 Q 801 1259 648 1259 L 269 1259 L 269 1490 L 664 1490 Q 886 1490 1045 1401 Q 1204 1312 1289.5 1145 Q 1375 978 1375 747 Q 1375 514 1289.5 346.5 Q 1204 179 1042.5 89.5 Q 881 0 654 0 Z M 417 1490 L 417 0 L 150 0 L 150 1490 Z"],
"E": [1240, "M 150 0 L 150 1490 L 1118 1490 L 1118 1265 L 417 1265 L 417 863 L 1066 863 L 1066 641 L 417 641 L 417 225 L 1122 225 L 1122 0 Z"],
"F": [1204, "M 150 0 L 150 1490 L 1104 1490 L 1104 1265 L 417 1265 L 417 818 L 1037 818 L 1037 596 L 417 596 L 417 0 Z"],
"G": [1534, "M 793 -20 Q 587 -20 432 73 Q 277 166 190 337 Q 103 508 103 743 Q 103 984 192.5 1155.5 Q 282 1327 436 1418.5 Q 590 1510 785 1510 Q 908 1510 1014.5 1474 Q 1121 1438 1204.5 1371.5 Q 1288 1305 1341.5 1214 Q 1395 1123 1412 1014 L 1139 1014 Q 1121 1074 1089.5 1121 Q 1058 1168 1013.5 1202 Q 969 1236 912.5 1253.5 Q 856 1271 788 1271 Q 668 1271 573.5 1210 Q 479 1149 425 1032 Q 371 915 371 745 Q 371 577 425 459.5 Q 479 342 574 280.5 Q 669 219 794 219 Q 908 219 991.5 263 Q 1075 307 1120.5 388 Q 1166 469 1166 579 L 1227 569 L 822 569 L 822 779 L 1425 779 L 1425 600 Q 1425 409 1343.5 269.5 Q 1262 130 1119.5 55 Q 977 -20 793 -20 Z"],
"H": [1527, "M 150 0 L 150 1490 L 417 1490 L 417 874 L 1110 874 L 1110 1490 L 1377 1490 L 1377 0 L 1110 0 L 1110 649 L 417 649 L 417 0 Z"],
"I": [567, "M 417 1490 L 417 0 L 150 0 L 150 1490 Z"],
"J": [1187, "M 560 -20 Q 339 -20 208.5 99.5 Q 78 219 78 440 L 78 525 L 345 525 L 345 438 Q 345 321 403.5 260.5 Q 462 200 560 200 Q 657 200 715 260.5 Q 773 321 773 438 L 773 1490 L 1038 1490 L 1038 441 Q 1038 220 908.5 100 Q 779 -20 560 -20 Z"],
"K": [1440, "M 343 367 L 343 620 Q 391 698 437.5 766.5 Q 484 835 536.5 902 Q 589 969 654 1044 L 1045 1490 L 1377 1490 L 745 777 L 725 784 Z M 150 0 L 150 1490 L 417 1490 L 417 1048 L 412 689 L 417 558 L 417 0 Z M 1072 0 L 598 701 L 766 902 L 1387 0 Z"],
"L": [1158, "M 150 0 L 150 1490 L 417 1490 L 417 225 L 1075 225 L 1075 0 Z"],
"M": [1889, "M 150 0 L 150 1490 L 552 1490 L 835 721 Q 850 678 868.5 610.5 Q 887 543 906.5 465 Q 926 387 943.5 312.5 Q 961 238 973 181 L 919 181 Q 931 237 948.5 310.5 Q 966 384 985.5 462.5 Q 1005 541 1023.5 609 Q 1042 677 1056 721 L 1336 1490 L 1739 1490 L 1739 0 L 1473 0 L 1473 752 Q 1473 800 1474 868 Q 1475 936 1477 1014 Q 1479 1092 1481 1171.5 Q 1483 1251 1483 1323 L 1502 1323 Q 1482 1244 1458.5 1161.5 Q 1435 1079 1412 1001.5 Q 1389 924 1368.5 859 Q 1348 794 1333 752 L 1058 0 L 831 0 L 552 752 Q 537 794 516.5 857.5 Q 496 921 472.5 998 Q 449 1075 425.5 1158.5 Q 402 1242 379 1323 L 401 1323 Q 402 1256 404 1177.5 Q 406 1099 407.5 1020 Q 409 941 410.5 871.5 Q 412 802 412 752 L 412 0 Z"],
"N": [1555, "M 150 0 L 150 1490 L 452 1490 L 967 669 Q 999 618 1035 553.5 Q 1071 489 1110 409.5 Q 1149 330 1187 233 L 1157 233 Q 1150 317 1144.5 405.5 Q 1139 494 1136.5 573.5 Q 1134 653 1134 708 L 1134 1490 L 1405 1490 L 1405 0 L 1102 0 L 637 739 Q 593 810 554 879 Q 515 948 470 1035 Q 425 1122 361 1245 L 399 1245 Q 405 1136 410 1038.5 Q 415 941 418.5 864 Q 422 787 422 740 L 422 0 Z"],
"O": [1574, "M 788 -20 Q 592 -20 437 71 Q 282 162 192.5 333 Q 103 504 103 744 Q 103 985 192.5 1156.5 Q 282 1328 437 1419 Q 592 1510 788 1510 Q 983 1510 1137.5 1419 Q 1292 1328 1381.5 1156.5 Q 1471 985 1471 744 Q 1471 504 1381.5 332.5 Q 1292 161 1137.5 70.5 Q 983 -20 788 -20 Z M 788 219 Q 909 219 1002.5 279.5 Q 1096 340 1149 457.5 Q 1202 575 1202 744 Q 1202 915 1149 1032.5 Q 1096 1150 1002.5 1210.5 Q 909 1271 788 1271 Q 666 1271 572 1210 Q 478 1149 424.5 1031.5 Q 371 914 371 744 Q 371 575 424.5 458 Q 478 341 572 280 Q 666 219 788 219 Z"],
"P": [1321, "M 150 0 L 150 1490 L 707 1490 Q 878 1490 995 1426 Q 1112 1362 1172 1250.5 Q 1232 1139 1232 997 Q 1232 854 1171.5 743 Q 1111 632 993 568 Q 875 504 703 504 L 334 504 L 334 724 L 668 724 Q 769 724 833.5 759 Q 898 794 928.5 856 Q 959 918 959 997 Q 959 1076 928.5 1137 Q 898 1198 833 1232 Q 768 1266 666 1266 L 417 1266 L 417 0 Z"],
"Q": [1583, "M 704 497 L 944 497 L 1091 306 L 1187 191 L 1436 -129 L 1180 -129 L 1012 84 L 943 182 Z M 788 -20 Q 592 -20 437 71 Q 282 162 192.5 333 Q 103 504 103 744 Q 103 985 192.5 1156.5 Q 282 1328 437 1419 Q 592 1510 788 1510 Q 983 1510 1137.5 1419 Q 1292 1328 1381.5 1156.5 Q 1471 985 1471 744 Q 1471 504 1381.5 332.5 Q 1292 161 1137.5 70.5 Q 983 -20 788 -20 Z M 788 219 Q 909 219 1002.5 279.5 Q 1096 340 1149 457.5 Q 1202 575 1202 744 Q 1202 915 1149 1032.5 Q 1096 1150 1002.5 1210.5 Q 909 1271 788 1271 Q 666 1271 572 1210 Q 478 1149 424.5 1031.5 Q 371 914 371 744 Q 371 575 424.5 458 Q 478 341 572 280 Q 666 219 788 219 Z"],
"R": [1336, "M 150 0 L 150 1490 L 707 1490 Q 878 1490 995 1430 Q 1112 1370 1172 1262.5 Q 1232 1155 1232 1013 Q 1232 871 1171.5 766 Q 1111 661 993 604 Q 875 547 703 547 L 305 547 L 305 768 L 668 768 Q 769 768 833 796.5 Q 897 825 928 880 Q 959 935 959 1013 Q 959 1093 928 1149.5 Q 897 1206 832.5 1236 Q 768 1266 666 1266 L 417 1266 L 417 0 Z M 988 0 L 626 676 L 918 676 L 1287 0 Z"],
"S": [1332, "M 673 -23 Q 500 -23 372.5 31 Q 245 85 173 188 Q 101 291 95 438 L 358 438 Q 365 360 407 308 Q 449 256 518 230.5 Q 587 205 671 205 Q 759 205 826.5 232 Q 894 259 932 307.5 Q 970 356 970 420 Q 970 478 936.5 516 Q 903 554 842.5 580.5 Q 782 607 701 627 L 532 671 Q 345 719 240.5 816 Q 136 913 136 1071 Q 136 1203 207 1302 Q 278 1401 401 1455.5 Q 524 1510 680 1510 Q 839 1510 959 1455 Q 1079 1400 1146.5 1303 Q 1214 1206 1217 1082 L 958 1082 Q 948 1178 872.5 1230.5 Q 797 1283 676 1283 Q 592 1283 531.5 1257.5 Q 471 1232 438.5 1188 Q 406 1144 406 1087 Q 406 1025 444.5 985 Q 483 945 541.5 921 Q 600 897 660 882 L 799 846 Q 882 826 960 793 Q 1038 760 1100.5 709.5 Q 1163 659 1200 587 Q 1237 515 1237 418 Q 1237 287 1170 187.5 Q 1103 88 977 32.5 Q 851 -23 673 -23 Z"],
"T": [1352, "M 83 1265 L 83 1490 L 1269 1490 L 1269 1265 L 810 1265 L 810 0 L 543 0 L 543 1265 Z"],
"U": [1507, "M 754 -22 Q 572 -22 436 46.5 Q 300 115 225 236.5 Q 150 358 150 517 L 150 1490 L 417 1490 L 417 539 Q 417 446 458.5 373 Q 500 300 575.5 258.5 Q 651 217 754 217 Q 857 217 932.5 258.5 Q 1008 300 1049.5 373 Q 1091 446 1091 539 L 1091 1490 L 1358 1490 L 1358 517 Q 1358 358 1282.5 236.5 Q 1207 115 1071.5 46.5 Q 936 -22 754 -22 Z"],
"V": [1490, "M 581 0 L 50 1490 L 343 1490 L 607 716 Q 644 600 687 448.5 Q 730 297 780 106 L 724 106 Q 774 300 815.5 450 Q 857 600 893 716 L 1149 1490 L 1441 1490 L 919 0 Z"],
"W": [2089, "M 452 0 L 50 1490 L 337 1490 L 531 697 Q 551 611 568.5 516 Q 586 421 602.5 325 Q 619 229 634 137 L 591 137 Q 608 229 625 325 Q 642 421 661 516 Q 680 611 701 697 L 903 1490 L 1186 1490 L 1387 697 Q 1409 611 1427.5 516 Q 1446 421 1463.5 325 Q 1481 229 1499 137 L 1453 137 Q 1469 229 1485.5 325 Q 1502 421 1520 516 Q 1538 611 1558 697 L 1751 1490 L 2039 1490 L 1636 0 L 1330 0 L 1113 823 Q 1083 938 1060.5 1073 Q 1038 1208 1012 1359 L 1076 1359 Q 1048 1213 1028 1080.5 Q 1008 948 975 823 L 758 0 Z"],
"X": [1474, "M 53 0 L 657 861 L 657 660 L 96 1490 L 405 1490 L 586 1218 Q 632 1148 662 1094 Q 692 1040 717 989.5 Q 742 939 772 880 L 707 880 Q 738 939 763 989 Q 788 1039 818.5 1093.5 Q 849 1148 896 1218 L 1080 1490 L 1382 1490 L 827 673 L 827 867 L 1421 0 L 1107 0 L 881 334 Q 840 397 813.5 441 Q 787 485 765 526 Q 743 567 714 621 L 760 621 Q 732 569 710 528 Q 688 487 661 442 Q 634 397 590 334 L 360 0 Z"],
"Y": [1461, "M 600 0 L 600 577 L 50 1490 L 362 1490 L 628 1020 Q 670 946 703 876 Q 736 806 771 705 L 701 705 Q 735 807 767.5 878 Q 800 949 840 1020 L 1101 1490 L 1411 1490 L 867 577 L 867 0 Z"],
"Z": [1336, "M 120 0 L 120 166 L 745 1066 Q 797 1140 858.5 1215 Q 920 1290 983 1363 L 1005 1277 Q 908 1268 810 1266.5 Q 712 1265 614 1265 L 116 1265 L 116 1490 L 1216 1490 L 1216 1322 L 602 438 Q 547 360 482.5 282 Q 418 204 353 127 L 331 213 Q 432 222 532 223.5 Q 632 225 732 225 L 1221 225 L 1221 0 Z"],
"[": [764, "M 196 -279 L 196 1581 L 655 1581 L 655 1378 L 447 1378 L 447 -76 L 655 -76 L 655 -279 Z"],
"\\": [776, "M 514 -224 L 34 1560 L 262 1560 L 742 -224 Z"],
"]": [764, "M 109 -279 L 109 -76 L 317 -76 L 317 1378 L 109 1378 L 109 1581 L 567 1581 L 567 -279 Z"],
"^": [986, "M 467 1341 L 519 1341 L 519 1262 L 467 1262 Z M 73 814 L 378 1451 L 608 1451 L 913 814 L 700 814 L 486 1292 L 500 1292 L 287 814 Z"],
"_": [961, "M 961 0 L 961 -209 L 0 -209 L 0 0 Z"],
"`": [719, "M 359 1261 L 157 1567 L 410 1567 L 549 1261 Z"],
"a": [1176, "M 450 -23 Q 344 -23 259 15.5 Q 174 54 125 129 Q 76 204 76 314 Q 76 409 111.5 471 Q 147 533 207.5 570 Q 268 607 344 626 Q 420 645 502 653 Q 599 664 660 672 Q 721 680 749.5 698 Q 778 716 778 754 L 778 759 Q 778 814 756 852.5 Q 734 891 690.5 911.5 Q 647 932 583 932 Q 518 932 470.5 912 Q 423 892 393 860 Q 363 828 349 791 L 108 840 Q 141 939 210 1003.5 Q 279 1068 374.5 1100 Q 470 1132 582 1132 Q 661 1132 741.5 1113.5 Q 822 1095 889 1051 Q 956 1007 997 933 Q 1038 859 1038 747 L 1038 0 L 789 0 L 789 154 L 779 154 Q 754 107 710.5 66.5 Q 667 26 602.5 1.5 Q 538 -23 450 -23 Z M 517 170 Q 598 170 656.5 202 Q 715 234 747.5 286.5 Q 780 339 780 401 L 780 533 Q 767 523 736.5 514 Q 706 505 668.5 498 Q 631 491 594.5 486 Q 558 481 533 478 Q 475 470 428 452 Q 381 434 354.5 401.5 Q 328 369 328 317 Q 328 269 352.5 236.5 Q 377 204 419.5 187 Q 462 170 517 170 Z"],
"b": [1278, "M 728 -20 Q 633 -20 569 12.5 Q 505 45 467 91 Q 429 137 409 177 L 392 177 L 392 0 L 138 0 L 138 1490 L 398 1490 L 398 933 L 409 933 Q 429 973 466 1019 Q 503 1065 566.5 1098.5 Q 630 1132 729 1132 Q 859 1132 963 1066 Q 1067 1000 1128.5 871.5 Q 1190 743 1190 557 Q 1190 373 1130 244 Q 1070 115 965.5 47.5 Q 861 -20 728 -20 Z M 658 194 Q 745 194 804 241.5 Q 863 289 893 371.5 Q 923 454 923 558 Q 923 662 893.5 743.5 Q 864 825 805 871.5 Q 746 918 658 918 Q 572 918 513 873 Q 454 828 423.5 747.5 Q 393 667 393 558 Q 393 449 423.5 367 Q 454 285 513.5 239.5 Q 573 194 658 194 Z"],
"c": [1193, "M 623 -23 Q 460 -23 340 49.5 Q 220 122 154.5 251.5 Q 89 381 89 553 Q 89 727 154.5 857.5 Q 220 988 340 1060 Q 460 1132 623 1132 Q 716 1132 796 1108 Q 876 1084 939 1038.5 Q 1002 993 1044.5 928 Q 1087 863 1105 781 L 862 730 Q 851 773 830.5 808.5 Q 810 844 780 869 Q 750 894 711 907.5 Q 672 921 625 921 Q 534 921 474 872.5 Q 414 824 384 741.5 Q 354 659 354 554 Q 354 451 384 368 Q 414 285 474 236.5 Q 534 188 625 188 Q 673 188 712.5 202 Q 752 216 782.5 242 Q 813 268 834 305 Q 855 342 865 387 L 1108 336 Q 1090 252 1047.5 186 Q 1005 120 941.5 73.5 Q 878 27 797.5 2 Q 717 -23 623 -23 Z"],
"d": [1278, "M 550 -20 Q 418 -20 313.5 47.5 Q 209 115 149 244 Q 89 373 89 557 Q 89 743 150.5 871.5 Q 212 1000 316.5 1066 Q 421 1132 549 1132 Q 649 1132 712.5 1098.5 Q 776 1065 813.5 1019 Q 851 973 870 933 L 881 933 L 881 1490 L 1141 1490 L 1141 0 L 886 0 L 886 177 L 870 177 Q 850 137 811.5 91 Q 773 45 710 12.5 Q 647 -20 550 -20 Z M 621 194 Q 706 194 765 239.5 Q 824 285 855 367 Q 886 449 886 558 Q 886 667 855.5 747.5 Q 825 828 765.5 873 Q 706 918 621 918 Q 533 918 474 871.5 Q 415 825 385 743.5 Q 355 662 355 558 Q 355 454 385 371.5 Q 415 289 474.5 241.5 Q 534 194 621 194 Z"],
"e": [1211, "M 632 -23 Q 463 -23 341.5 48 Q 220 119 154.5 248 Q 89 377 89 552 Q 89 725 153.5 855 Q 218 985 336.5 1058.5 Q 455 1132 615 1132 Q 717 1132 809.5 1099 Q 902 1066 973.5 997 Q 1045 928 1085.5 821.5 Q 1126 715 1126 568 L 1126 486 L 212 486 L 212 663 L 997 663 L 875 611 Q 875 705 846 776.5 Q 817 848 759.5 888 Q 702 928 616 928 Q 530 928 470 887.5 Q 410 847 378.5 779.5 Q 347 712 347 629 L 347 507 Q 347 401 383 328 Q 419 255 484 218 Q 549 181 635 181 Q 692 181 738.5 197.5 Q 785 214 819 246.5 Q 853 279 870 326 L 1109 277 Q 1082 187 1017 119.5 Q 952 52 854.5 14.5 Q 757 -23 632 -23 Z"],
"f": [796, "M 726 1118 L 726 914 L 20 914 L 20 1118 Z M 225 0 L 225 1225 Q 225 1337 271.5 1411 Q 318 1485 397.5 1522.5 Q 477 1560 572 1560 Q 641 1560 694 1549 Q 747 1538 772 1529 L 719 1327 Q 702 1332 677.5 1337.5 Q 653 1343 620 1343 Q 547 1343 515.5 1307 Q 484 1271 484 1205 L 484 0 Z"],
"g": [1281, "M 620 -442 Q 486 -442 386.5 -408 Q 287 -374 223.5 -315.5 Q 160 -257 132 -183 L 352 -104 Q 370 -135 401.5 -168 Q 433 -201 485.5 -222.5 Q 538 -244 619 -244 Q 740 -244 813 -187.5 Q 886 -131 886 -11 L 886 200 L 864 200 Q 845 160 808 117.5 Q 771 75 708.5 46 Q 646 17 549 17 Q 421 17 316.5 77.5 Q 212 138 150.5 259 Q 89 380 89 562 Q 89 746 151 873 Q 213 1000 317.5 1066 Q 422 1132 551 1132 Q 650 1132 714 1099 Q 778 1066 816 1019.5 Q 854 973 874 933 L 888 933 L 888 1118 L 1143 1118 L 1143 -3 Q 1143 -152 1075 -249.5 Q 1007 -347 889 -394.5 Q 771 -442 620 -442 Z M 622 222 Q 707 222 766 262.5 Q 825 303 856 380 Q 887 457 887 564 Q 887 670 856.5 749.5 Q 826 829 767 873.5 Q 708 918 622 918 Q 534 918 474.5 871.5 Q 415 825 385 745.5 Q 355 666 355 564 Q 355 461 385.5 384 Q 416 307 475.5 264.5 Q 535 222 622 222 Z"],
"h": [1254, "M 398 655 L 398 0 L 138 0 L 138 1490 L 394 1490 L 394 842 L 367 842 Q 414 987 505 1059.5 Q 596 1132 733 1132 Q 848 1132 934.5 1083 Q 1021 1034 1068.5 940 Q 1116 846 1116 711 L 1116 0 L 855 0 L 855 671 Q 855 783 797 847 Q 739 911 637 911 Q 568 911 514 881 Q 460 851 429 793.5 Q 398 736 398 655 Z"],
"i": [536, "M 138 0 L 138 1118 L 398 1118 L 398 0 Z M 268 1276 Q 206 1276 161.5 1318 Q 117 1360 117 1418 Q 117 1478 161.5 1519.5 Q 206 1561 268 1561 Q 331 1561 375.5 1519.5 Q 420 1478 420 1419 Q 420 1360 375.5 1318 Q 331 1276 268 1276 Z"],
"j": [536, "M 137 1118 L 398 1118 L 398 -65 Q 398 -186 352.5 -264 Q 307 -342 220 -380 Q 133 -418 11 -418 L -42 -418 L -42 -205 L -4 -205 Q 72 -205 104.5 -168.5 Q 137 -132 137 -62 Z M 267 1276 Q 205 1276 160.5 1318 Q 116 1360 116 1418 Q 116 1478 160.5 1519.5 Q 205 1561 267 1561 Q 330 1561 374.5 1519.5 Q 419 1478 419 1419 Q 419 1360 374.5 1318 Q 330 1276 267 1276 Z"],
"k": [1166, "M 376 352 L 376 667 L 417 667 L 820 1118 L 1125 1118 L 631 567 L 577 567 Z M 138 0 L 138 1490 L 398 1490 L 398 0 Z M 839 0 L 473 509 L 649 693 L 1151 0 Z"],
"l": [536, "M 398 1490 L 398 0 L 138 0 L 138 1490 Z"],
"m": [1844, "M 138 0 L 138 1118 L 382 1118 L 392 849 L 373 849 Q 397 949 447.5 1012 Q 498 1075 565.5 1105.5 Q 633 1136 707 1136 Q 828 1136 902.5 1060 Q 977 984 1008 836 L 977 836 Q 1000 936 1055.5 1002.5 Q 1111 1069 1187.5 1102.5 Q 1264 1136 1351 1136 Q 1452 1136 1532 1092 Q 1612 1048 1659 963.5 Q 1706 879 1706 754 L 1706 0 L 1446 0 L 1446 714 Q 1446 818 1389 866 Q 1332 914 1252 914 Q 1190 914 1144 887 Q 1098 860 1073.5 812.5 Q 1049 765 1049 702 L 1049 0 L 795 0 L 795 726 Q 795 811 742 862.5 Q 689 914 606 914 Q 549 914 501.5 888 Q 454 862 426 811 Q 398 760 398 685 L 398 0 Z"],
"n": [1253, "M 398 655 L 398 0 L 138 0 L 138 1118 L 384 1118 L 388 842 L 367 842 Q 414 987 505 1059.5 Q 596 1132 733 1132 Q 848 1132 934 1083 Q 1020 1034 1067.5 940 Q 1115 846 1115 711 L 1115 0 L 855 0 L 855 671 Q 855 783 797 847 Q 739 911 637 911 Q 568 911 514 881 Q 460 851 429 793.5 Q 398 736 398 655 Z"],
"o": [1247, "M 623 -23 Q 460 -23 340 49.5 Q 220 122 154.5 251.5 Q 89 381 89 553 Q 89 727 154.5 857.5 Q 220 988 340 1060 Q 460 1132 623 1132 Q 787 1132 907 1060 Q 1027 988 1092.5 857.5 Q 1158 727 1158 553 Q 1158 381 1092.5 251.5 Q 1027 122 907 49.5 Q 787 -23 623 -23 Z M 623 188 Q 714 188 774.5 237 Q 835 286 864.5 369 Q 894 452 894 554 Q 894 657 864.5 740 Q 835 823 774.5 872 Q 714 921 623 921 Q 532 921 472.5 872 Q 413 823 383.5 740.5 Q 354 658 354 554 Q 354 452 383.5 369 Q 413 286 472.5 237 Q 532 188 623 188 Z"],
"p": [1278, "M 138 -418 L 138 1118 L 392 1118 L 392 933 L 409 933 Q 429 973 466 1019 Q 503 1065 566.5 1098.5 Q 630 1132 729 1132 Q 859 1132 963 1066 Q 1067 1000 1128.5 871.5 Q 1190 743 1190 557 Q 1190 373 1130 244 Q 1070 115 965.5 47.5 Q 861 -20 728 -20 Q 633 -20 569 12.5 Q 505 45 467 91 Q 429 137 409 177 L 398 177 L 398 -418 Z M 658 194 Q 745 194 804 241.5 Q 863 289 893 371.5 Q 923 454 923 558 Q 923 662 893.5 743.5 Q 864 825 805 871.5 Q 746 918 658 918 Q 572 918 513 873 Q 454 828 423.5 747.5 Q 393 667 393 558 Q 393 449 423.5 367 Q 454 285 513.5 239.5 Q 573 194 658 194 Z"],
"q": [1278, "M 1141 -418 L 881 -418 L 881 177 L 870 177 Q 850 137 811.5 91 Q 773 45 710 12.5 Q 647 -20 550 -20 Q 418 -20 313.5 47.5 Q 209 115 149 244 Q 89 373 89 557 Q 89 743 150.5 871.5 Q 212 1000 316.5 1066 Q 421 1132 549 1132 Q 649 1132 712.5 1098.5 Q 776 1065 813.5 1019 Q 851 973 870 933 L 886 933 L 886 1118 L 1141 1118 Z M 621 194 Q 706 194 765 239.5 Q 824 285 855 367 Q 886 449 886 558 Q 886 667 855.5 747.5 Q 825 828 765.5 873 Q 706 918 621 918 Q 533 918 474 871.5 Q 415 825 385 743.5 Q 355 662 355 558 Q 355 454 385 371.5 Q 415 289 474.5 241.5 Q 534 194 621 194 Z"],
"r": [813, "M 138 0 L 138 1118 L 390 1118 L 390 931 L 402 931 Q 432 1028 507 1080.5 Q 582 1133 678 1133 Q 700 1133 727 1131 Q 754 1129 773 1126 L 773 887 Q 757 892 721 896 Q 685 900 650 900 Q 578 900 520.5 869 Q 463 838 430.5 783.5 Q 398 729 398 658 L 398 0 Z"],
"s": [1125, "M 561 -23 Q 432 -23 333 14 Q 234 51 170.5 122 Q 107 193 88 294 L 331 340 Q 354 257 412.5 216.5 Q 471 176 566 176 Q 662 176 718.5 214.5 Q 775 253 775 310 Q 775 358 738 389.5 Q 701 421 624 438 L 433 479 Q 275 513 197 591 Q 119 669 119 792 Q 119 896 176 972 Q 233 1048 334.5 1090 Q 436 1132 570 1132 Q 697 1132 788.5 1096 Q 880 1060 936.5 995.5 Q 993 931 1015 844 L 783 798 Q 764 857 714 897.5 Q 664 938 573 938 Q 490 938 434.5 901.5 Q 379 865 379 808 Q 379 759 416 727 Q 453 695 538 677 L 728 637 Q 887 603 964 528 Q 1041 453 1041 335 Q 1041 229 980 148.5 Q 919 68 810.5 22.5 Q 702 -23 561 -23 Z"],
"t": [723, "M 655 1118 L 655 914 L 20 914 L 20 1118 Z M 179 1384 L 439 1384 L 439 315 Q 439 254 465 225.5 Q 491 197 550 197 Q 568 197 597.5 201.5 Q 627 206 645 210 L 686 9 Q 643 -4 598 -9.5 Q 553 -15 512 -15 Q 351 -15 265 65 Q 179 145 179 293 Z"],
"u": [1254, "M 521 -14 Q 406 -14 319.5 35 Q 233 84 185.5 178.5 Q 138 273 138 407 L 138 1118 L 398 1118 L 398 447 Q 398 335 456.5 271 Q 515 207 617 207 Q 686 207 740 237 Q 794 267 824.5 325 Q 855 383 855 463 L 855 1118 L 1116 1118 L 1116 0 L 869 0 L 866 276 L 886 276 Q 839 130 747 58 Q 655 -14 521 -14 Z"],
"v": [1202, "M 455 0 L 39 1118 L 317 1118 L 521 510 Q 557 403 583 295 Q 609 187 636 76 L 571 76 Q 599 187 624.5 295 Q 650 403 685 510 L 888 1118 L 1164 1118 L 746 0 Z"],
"w": [1719, "M 377 0 L 44 1118 L 318 1118 L 428 680 Q 453 572 483 443 Q 513 314 540 156 L 507 156 Q 534 310 565 439.5 Q 596 569 624 680 L 737 1118 L 985 1118 L 1095 680 Q 1122 571 1152.5 441.5 Q 1183 312 1211 156 L 1178 156 Q 1205 311 1233.5 440 Q 1262 569 1289 680 L 1399 1118 L 1675 1118 L 1341 0 L 1078 0 L 947 456 Q 927 525 908 604 Q 889 683 871 765.5 Q 853 848 835 924 L 883 924 Q 865 848 846.5 765.5 Q 828 683 809.5 603 Q 791 523 771 456 L 640 0 Z"],
"x": [1165, "M 50 0 L 485 675 L 484 473 L 72 1118 L 358 1118 L 472 928 Q 522 843 561 762 Q 600 681 640 605 L 532 605 Q 574 680 611.5 761.5 Q 649 843 700 928 L 818 1118 L 1098 1118 L 680 469 L 680 666 L 1115 0 L 831 0 L 693 224 Q 643 309 603.5 389 Q 564 469 524 542 L 632 542 Q 592 469 555.5 389 Q 519 309 469 224 L 331 0 Z"],
"y": [1205, "M 127 -399 L 188 -196 L 219 -204 Q 278 -219 324 -212.5 Q 370 -206 401 -172.5 Q 432 -139 445 -75 L 461 -4 L 39 1118 L 317 1118 L 521 510 Q 557 402 580 295 Q 603 188 631 76 L 563 76 Q 590 188 617 295.5 Q 644 403 680 510 L 891 1118 L 1166 1118 L 686 -144 Q 652 -233 601 -296.5 Q 550 -360 476 -393 Q 402 -426 301 -426 Q 246 -426 199.5 -418 Q 153 -410 127 -399 Z"],
"z": [1159, "M 122 0 L 122 166 L 699 892 L 699 901 L 140 901 L 140 1118 L 1018 1118 L 1018 938 L 468 226 L 468 217 L 1037 217 L 1037 0 Z"],
"{": [931, "M 141 639 L 141 771 Q 265 771 313.5 821.5 Q 362 872 362 986 L 362 1180 Q 362 1301 393 1379.5 Q 424 1458 483 1502 Q 542 1546 628 1563.5 Q 714 1581 822 1581 L 822 1379 Q 694 1380 648.5 1326.5 Q 603 1273 603 1159 L 603 918 Q 603 862 585.5 812 Q 568 762 519.5 723 Q 471 684 380 661.5 Q 289 639 141 639 Z M 822 -279 Q 714 -279 628 -261.5 Q 542 -244 483 -200.5 Q 424 -157 393 -78.5 Q 362 0 362 122 L 362 314 Q 362 429 313.5 480 Q 265 531 141 531 L 141 663 Q 289 663 380 640 Q 471 617 519.5 578 Q 568 539 585.5 488.5 Q 603 438 603 382 L 603 143 Q 603 29 648.5 -25 Q 694 -79 822 -79 Z M 141 530 L 141 772 L 378 772 L 378 530 Z"],
"|": [735, "M 488 1970 L 488 -480 L 246 -480 L 246 1970 Z"],
"}": [931, "M 790 639 Q 643 639 552 661.5 Q 461 684 412 723 Q 363 762 345.5 812 Q 328 862 328 918 L 328 1159 Q 328 1273 283 1326 Q 238 1379 109 1379 L 109 1581 Q 218 1581 303 1563.5 Q 388 1546 447.5 1502 Q 507 1458 537.5 1379.5 Q 568 1301 568 1180 L 568 986 Q 568 872 617 821.5 Q 666 771 790 771 Z M 109 -279 L 109 -79 Q 238 -79 283 -25 Q 328 29 328 143 L 328 382 Q 328 438 345.5 488.5 Q 363 539 412 578 Q 461 617 552 640 Q 643 663 790 663 L 790 531 Q 665 530 616.5 479 Q 568 428 568 314 L 568 122 Q 568 0 537.5 -78.5 Q 507 -157 447.5 -200.5 Q 388 -244 303 -261.5 Q 218 -279 109 -279 Z M 790 531 L 552 530 L 552 772 L 790 771 Z"],
"~": [1378, "M 161 416 Q 157 549 196.5 636.5 Q 236 724 306.5 767 Q 377 810 466 810 Q 537 810 598.5 781 Q 660 752 740 681 Q 787 641 817 621.5 Q 847 602 885 602 Q 940 602 974.5 644.5 Q 1009 687 1008 774 L 1218 774 Q 1221 642 1180.5 554.5 Q 1140 467 1070 424 Q 1000 381 912 381 Q 838 381 775 412 Q 712 443 637 509 Q 588 552 559.5 570 Q 531 588 493 588 Q 440 588 404.5 548 Q 369 508 371 416 Z"],
"·": [653, "M 326 547 Q 259 547 212.5 593 Q 166 639 166 707 Q 166 774 212.5 820 Q 259 866 326 866 Q 394 866 440.5 820 Q 487 774 487 707 Q 487 639 440.5 593 Q 394 547 326 547 Z"],
"•": [1031, "M 516 274 Q 428 274 355 317 Q 282 360 239 433 Q 196 506 196 594 Q 196 683 239 755.5 Q 282 828 355 871 Q 428 914 516 914 Q 605 914 677.5 871 Q 750 828 793 755.5 Q 836 683 836 594 Q 836 506 793 433 Q 750 360 677.5 317 Q 605 274 516 274 Z"],
"…": [1958, "M 326 -17 Q 259 -17 212.5 29 Q 166 75 166 143 Q 166 210 212.5 256 Q 259 302 326 302 Q 394 302 440.5 256 Q 487 210 487 143 Q 487 75 440.5 29 Q 394 -17 326 -17 Z M 979 -17 Q 912 -17 865.5 29 Q 819 75 819 143 Q 819 210 865.5 256 Q 912 302 979 302 Q 1047 302 1093.5 256 Q 1140 210 1140 143 Q 1140 75 1093.5 29 Q 1047 -17 979 -17 Z M 1631 -17 Q 1564 -17 1517.5 29 Q 1471 75 1471 143 Q 1471 210 1517.5 256 Q 1564 302 1631 302 Q 1699 302 1745.5 256 Q 1792 210 1792 143 Q 1792 75 1745.5 29 Q 1699 -17 1631 -17 Z"],
"°": [938, "M 470 802 Q 374 802 294.5 849 Q 215 896 167.5 975 Q 120 1054 120 1150 Q 120 1247 167.5 1326.5 Q 215 1406 294.5 1453.5 Q 374 1501 470 1501 Q 566 1501 645 1453.5 Q 724 1406 771 1326.5 Q 818 1247 818 1150 Q 818 1054 771 975 Q 724 896 645 849 Q 566 802 470 802 Z M 470 987 Q 515 987 552.5 1009 Q 590 1031 612 1068 Q 634 1105 634 1150 Q 634 1196 612 1233 Q 590 1270 552.5 1292.5 Q 515 1315 470 1315 Q 425 1315 387.5 1292.5 Q 350 1270 328 1233 Q 306 1196 306 1150 Q 306 1105 328 1068 Q 350 1031 387.5 1009 Q 425 987 470 987 Z"],
"–": [1024, "M 1024 728 L 1024 513 L 0 513 L 0 728 Z"],
"—": [2048, "M 2048 728 L 2048 513 L 0 513 L 0 728 Z"],
"×": [1378, "M 1036 83 L 184 934 L 347 1099 L 1198 245 Z M 347 83 L 184 245 L 1036 1099 L 1198 934 Z"],
"↑": [1805, "M 202 816 L 903 1517 L 1603 816 L 1456 668 L 1230 893 Q 1178 946 1120 1016 Q 1062 1086 1010 1154 Q 958 1222 923 1270 L 969 1252 Q 978 1212 987.5 1161 Q 997 1110 1003.5 1056 Q 1010 1002 1010 955 L 1010 0 L 795 0 L 795 955 Q 795 1002 801.5 1056 Q 808 1110 818 1161 Q 828 1212 836 1252 L 882 1270 Q 856 1234 819 1185.5 Q 782 1137 740 1083.5 Q 698 1030 655.5 980.5 Q 613 931 575 893 L 350 668 Z"],
"↓": [1805, "M 1603 674 L 902 -27 L 202 674 L 350 822 L 575 597 Q 628 544 685.5 474 Q 743 404 795 336 Q 847 268 882 220 L 836 238 Q 828 279 818 330 Q 808 381 801.5 435 Q 795 489 795 535 L 795 1490 L 1010 1490 L 1010 535 Q 1010 489 1003.5 435 Q 997 381 987.5 330 Q 978 279 969 238 L 923 220 Q 950 256 986.5 304.5 Q 1023 353 1065.5 406.5 Q 1108 460 1150 509.5 Q 1192 559 1230 597 L 1455 822 Z"],
"±": [1378, "M 192 61 L 192 278 L 1186 278 L 1186 61 Z M 192 660 L 192 872 L 1186 872 L 1186 660 Z M 577 392 L 577 1141 L 802 1141 L 802 392 Z"],
"−": [1378, "M 1183 705 L 1183 477 L 196 477 L 196 705 Z"],
"€": [1390, "M 1091 971 L 1021 818 L 56 818 L 113 971 Z M 956 672 L 882 515 L 56 515 L 113 672 Z M 1274 1368 L 1174 1153 Q 1140 1181 1095.5 1207.5 Q 1051 1234 996.5 1251.5 Q 942 1269 877 1269 Q 768 1269 685 1211.5 Q 602 1154 555 1038 Q 508 922 508 743 Q 508 566 555 449.5 Q 602 333 685 276.5 Q 768 220 877 220 Q 942 220 995.5 237 Q 1049 254 1092.5 280 Q 1136 306 1168 330 L 1270 117 Q 1192 49 1091 14.5 Q 990 -20 877 -20 Q 691 -20 547.5 71 Q 404 162 322.5 333 Q 241 504 241 743 Q 241 983 322.5 1154.5 Q 404 1326 547.5 1418 Q 691 1510 877 1510 Q 992 1510 1092.5 1474 Q 1193 1438 1274 1368 Z"],
"£": [1289, "M 100 178 L 100 225 Q 185 225 227.5 268.5 Q 270 312 266 396 L 239 1019 Q 232 1168 291.5 1278.5 Q 351 1389 462 1450 Q 573 1511 719 1511 Q 842 1511 940.5 1463.5 Q 1039 1416 1103.5 1328.5 Q 1168 1241 1187 1120 L 942 1082 Q 926 1179 870.5 1232.5 Q 815 1286 723 1286 Q 642 1286 589.5 1254 Q 537 1222 513 1165 Q 489 1108 491 1031 L 511 427 Q 513 354 480 307 Q 447 260 393.5 233.5 Q 340 207 281.5 195.5 Q 223 184 173.5 181 Q 124 178 100 178 Z M 99 0 L 99 225 L 887 225 Q 921 225 936 240.5 Q 951 256 951 290 L 951 348 L 1194 348 L 1194 295 Q 1194 150 1118.5 75 Q 1043 0 891 0 Z M 99 656 L 99 834 L 920 834 L 920 656 Z"],
"©": [1872, "M 524 744 Q 524 860 580.5 955 Q 637 1050 732.5 1106.5 Q 828 1163 943 1163 Q 1045 1163 1130 1119 Q 1215 1075 1271 1000 Q 1327 925 1339 829 L 1139 829 Q 1126 892 1070 932 Q 1014 972 943 972 Q 881 972 829.5 941.5 Q 778 911 746.5 859.5 Q 715 808 715 745 Q 715 682 746.5 631 Q 778 580 829.5 549 Q 881 518 943 518 Q 1014 518 1065 558 Q 1116 598 1129 660 L 1329 660 Q 1317 565 1263.5 489 Q 1210 413 1127.5 369.5 Q 1045 326 943 326 Q 828 326 732.5 382.5 Q 637 439 580.5 534 Q 524 629 524 744 Z M 936 -23 Q 777 -23 638 36.5 Q 499 96 393 202 Q 287 308 227.5 447 Q 168 586 168 745 Q 168 904 227.5 1043 Q 287 1182 393 1288 Q 499 1394 638 1453.5 Q 777 1513 936 1513 Q 1095 1513 1234 1453.5 Q 1373 1394 1479 1288 Q 1585 1182 1644.5 1043 Q 1704 904 1704 745 Q 1704 586 1644.5 447 Q 1585 308 1479 202 Q 1373 96 1234 36.5 Q 1095 -23 936 -23 Z M 936 193 Q 1050 193 1150 235.5 Q 1250 278 1326.5 354.5 Q 1403 431 1445.5 531 Q 1488 631 1488 745 Q 1488 859 1445.5 959 Q 1403 1059 1326.5 1135.5 Q 1250 1212 1150 1254.5 Q 1050 1297 936 1297 Q 822 1297 722 1254.5 Q 622 1212 545.5 1135.5 Q 469 1059 426.5 959 Q 384 859 384 745 Q 384 631 426.5 531 Q 469 431 545.5 354.5 Q 622 278 722 235.5 Q 822 193 936 193 Z"],
"’": [602, "M 164 887 L 252 1490 L 520 1490 L 346 887 Z"],
"‘": [602, "M 164 887 L 338 1490 L 520 1490 L 432 887 Z"],
"“": [1038, "M 164 887 L 338 1490 L 520 1490 L 432 887 Z M 600 887 L 774 1490 L 956 1490 L 868 887 Z"],
"”": [1027, "M 164 887 L 252 1490 L 520 1490 L 346 887 Z M 589 887 L 677 1490 L 945 1490 L 771 887 Z"],
},
kern: {"24":-32,"41":-65,"70":-32,"73":-34,"74":-119,"75":-20,"76":-32,"77":40,"78":-29,"79":-20,"97":-40,"C_":-81,"D_":-81,"F.":-69,"F…":-174,"F_":-69,"J_":-104,"K·":-93,"K<":-139,"L-":-104,"L·":-128,"L~":-81,"L*":-81,"L°":-93,"O_":-81,"P&":-69,"P.":-69,"P…":-197,"Q_":-81,"T&":-69,"T/":-104,"T…":-174,"T<":-162,"T_":-116,"U_":-104,"V&":-104,"V@":-69,"V·":-81,"V<":-151,"V_":-162,"W&":-104,"W<":-151,"X·":-93,"X<":-116,"Y&":-128,"Y…":-197,"Y·":-104,"Y<":-209,"Y×":-93,"Z·":-69,"Z<":-128,"f_":-29,"k<":-174,"t<":-58,"u<":-81,"u_":-69,"v…":-151,"v<":-69,"v_":-162,"w&":-69,"y…":-151,"y<":-69,"y_":-162,"&T":-116,"&V":-128,"&W":-81,"&Y":-151,"&v":-69,"&w":-69,"&y":-69,"\\T":-81,"\\v":-104,"\\y":-104,"·V":-81,"·X":-93,"·Y":-104,">T":-162,">V":-151,">W":-151,">X":-116,">Y":-186,">Z":-128,"×T":-116,"_C":-81,"_G":-81,"_O":-81,"_Q":-81,"_T":-116,"_U":-81,"_V":-162,"_j":197,"_v":-162,"_y":-162,"A<":-52,"H_":25,"I_":25,"M_":25,"N_":25,"T·":-162,"W·":-69,"X~":-70,"d_":25,"l_":25,"r<":-81,"\\V":-100,"\\W":-117,"·T":-162,">A":-52,"~X":-78,"_B":69,"_D":69,"_E":69,"_F":69,"_H":69,"_I":69,"_K":69,"_L":69,"_M":69,"_N":69,"_P":69,"_R":69,"_b":69,"_h":69,"_i":44,"_k":69,"_l":69,"_m":69,"_n":69,"_p":69,"_r":69,"\"A":-162,"\"J":-337,"\"c":-37,"\"d":-37,"\"e":-37,"\"g":-37,"\"o":-37,"\"q":-37,"\"s":-11,"$A":-21,"$T":-14,"$X":-24,"'A":-162,"'J":-337,"'c":-37,"'d":-37,"'e":-37,"'g":-37,"'o":-37,"'q":-37,"'s":-11,"(B":25,"(D":25,"(E":25,"(F":25,"(H":25,"(I":25,"(K":25,"(L":25,"(M":25,"(N":25,"(P":25,"(R":25,"(b":25,"(c":-15,"(d":-15,"(e":-15,"(g":-15,"(h":25,"(j":37,"(k":25,"(l":25,"(m":25,"(n":25,"(o":-15,"(p":25,"(q":-15,"(r":25,"*A":-183,"*C":-31,"*G":-31,"*J":-197,"*O":-31,"*Q":-31,"+A":-69,"+J":-93,"+T":-155,"+V":-96,"+W":-67,"+X":-78,"+Y":-141,"+x":-46,",C":-90,",G":-90,",O":-90,",Q":-90,",T":-69,",Y":-111,"-A":-69,"-J":-93,"-T":-155,"-V":-96,"-W":-67,"-X":-78,"-Y":-141,"-x":-46,".C":-90,".G":-90,".O":-90,".Q":-90,".T":-69,".Y":-111,"/A":-50,"/J":-128,"/V":10,"/W":10,"0V":-42,"0X":-74,"0Y":-69,"0t":34,"1t":30,"1v":17,"1y":17,"3X":-44,"7A":-221,"7J":-197,"7a":-93,"7c":-104,"7d":-104,"7e":-104,"7g":-104,"7m":-104,"7n":-104,"7o":-104,"7p":-104,"7q":-104,"7r":-104,"7s":-81,"8X":-44,"9V":-42,"9X":-74,"9Y":-69,"9t":34,":T":-69,":V":-128,";T":-69,";V":-128,"=A":-104,"=T":-93,"=V":-139,"=W":-128,"=X":-104,"=Y":-197,"=v":-81,"=x":-69,"=y":-81,"?A":-128,"@A":-81,"@T":-64,"@V":-78,"@W":-33,"@X":-95,"@Y":-82,"A\"":-162,"A$":-21,"A'":-162,"A*":-183,"A+":-69,"A-":-69,"A/":29,"A1":-91,"A=":-104,"A?":-128,"A@":-81,"AA":30,"AC":-81,"AG":-81,"AO":-81,"AQ":-81,"AS":-21,"AT":-179,"AU":-40,"AV":-154,"AW":-137,"AY":-158,"A\\":-154,"A^":-183,"Ac":-31,"Ad":-31,"Ae":-31,"Af":-12,"Ag":-31,"Ai":7,"Ao":-31,"Aq":-31,"As":-15,"At":-50,"Av":-139,"Aw":-139,"Ay":-139,"A~":-69,"A·":-69,"A•":-69,"A°":-183,"A×":-69,"A±":-104,"A−":-69,"A©":-81,"A’":-209,"A‘":-267,"A“":-267,"A”":-209,"BT":-116,"B‘":-128,"B“":-128,"CA":-51,"CX":-24,"Cv":8,"Cy":8,"D,":-90,"D.":-90,"D/":-81,"DA":-81,"DT":-64,"DV":-78,"DW":-33,"DX":-95,"DY":-82,"D\\":-78,"D…":-90,"D‘":-69,"D“":-69,"F,":-81,"FA":-186,"FJ":-139,"Fa":-39,"Fc":-66,"Fd":-66,"Fe":-66,"Fg":-66,"Fm":-47,"Fn":-47,"Fo":-66,"Fp":-47,"Fq":-66,"Fr":-47,"Fu":-69,"Fv":-69,"Fy":-69,"Fz":-69,"GA":-58,"GT":-62,"GV":-46,"GX":-24,"GY":-54,"G\\":-46,"H)":25,"H]":25,"Ht":30,"Hv":17,"Hy":17,"H}":25,"I)":25,"I]":25,"It":30,"Iv":17,"Iy":17,"I}":25,"J,":-69,"J.":-69,"J/":-116,"JA":-40,"J…":-69,"K$":-20,"K+":-179,"K-":-179,"K=":-69,"K@":-78,"KC":-78,"KG":-78,"KO":-78,"KQ":-78,"KS":-20,"Kc":-81,"Kd":-81,"Ke":-81,"Kg":-81,"Ki":20,"Ko":-81,"Kq":-81,"Ku":-69,"Kv":-81,"Kw":-128,"Ky":-81,"K~":-179,"K•":-69,"K×":-69,"K±":-69,"K−":-179,"K©":-78,"L\"":-186,"L'":-186,"L+":-149,"L1":-93,"L@":-58,"LC":-58,"LG":-58,"LO":-58,"LQ":-58,"LT":-190,"LV":-152,"LW":-50,"LY":-141,"L\\":-152,"L^":-267,"Lt":-46,"Lv":-139,"Ly":-139,"L•":-69,"L×":-69,"L−":-149,"L©":-58,"L’":-152,"L‘":-174,"L“":-174,"L”":-152,"M)":25,"M]":25,"Mt":30,"Mv":17,"My":17,"M}":25,"N)":25,"N]":25,"Nt":30,"Nv":17,"Ny":17,"N}":25,"O,":-90,"O.":-90,"O/":-81,"OA":-81,"OT":-64,"OV":-78,"OW":-33,"OX":-95,"OY":-82,"O\\":-78,"O…":-90,"O‘":-69,"O“":-69,"P+":-60,"P,":-81,"P-":-60,"PA":-164,"PJ":-197,"Pa":-18,"Pc":-15,"Pd":-15,"Pe":-15,"Pg":-15,"Po":-15,"Pq":-15,"P~":-60,"P·":-60,"P−":-60,"Q,":-90,"Q.":-90,"Q/":-81,"QA":-81,"QT":-64,"QV":-78,"QW":-33,"QX":-95,"QY":-82,"Q\\":-78,"Q…":-90,"Q‘":-69,"Q“":-69,"RV":-38,"RY":-56,"R\\":-38,"Ra":-10,"Rc":-26,"Rd":-26,"Re":-26,"Rg":-26,"Ro":-26,"Rq":-26,"SA":-21,"ST":-14,"SX":-24,"T$":-7,"T+":-121,"T,":-69,"T-":-121,"T.":-69,"T0":-69,"T4":-139,"T6":-69,"T7":-162,"T:":-69,"T;":-69,"T=":-69,"T@":-64,"TA":-179,"TC":-64,"TG":-64,"TJ":-186,"TO":-64,"TQ":-64,"TS":-7,"TY":26,"Ta":-150,"Tc":-160,"Td":-160,"Te":-160,"Tg":-160,"Tm":-116,"Tn":-116,"To":-160,"Tp":-116,"Tq":-160,"Tr":-116,"Ts":-151,"Tt":-209,"Tu":-151,"Tv":-128,"Tw":-128,"Tx":-86,"Ty":-128,"Tz":-93,"T~":-121,"T•":-69,"T×":-69,"T±":-69,"T−":-121,"T©":-64,"U,":-69,"U.":-69,"U/":-116,"UA":-40,"U…":-69,"V+":-113,"V,":-197,"V-":-113,"V.":-197,"V/":-100,"V0":-42,"V4":-69,"V6":-42,"V:":-128,"V;":-128,"V=":-128,"VA":-154,"VC":-78,"VG":-78,"VJ":-197,"VO":-78,"VQ":-78,"VV":30,"V\\":30,"Va":-116,"Vc":-118,"Vd":-118,"Ve":-118,"Vg":-118,"Vm":-11,"Vn":-11,"Vo":-118,"Vp":-11,"Vq":-118,"Vr":-11,"Vs":-93,"V~":-113,"V•":-81,"V…":-197,"V×":-81,"V±":-128,"V−":-113,"V©":-78,"W$":-8,"W+":-91,"W,":-197,"W-":-91,"W.":-197,"W/":-43,"W4":-69,"W:":-104,"W;":-104,"W=":-128,"W@":-33,"WA":-137,"WC":-33,"WG":-33,"WJ":-128,"WO":-33,"WQ":-33,"WS":-8,"WV":10,"WW":46,"W\\":10,"Wa":-113,"Wc":-103,"Wd":-103,"We":-103,"Wg":-103,"Wm":-70,"Wn":-70,"Wo":-103,"Wp":-70,"Wq":-103,"Wr":-70,"Ws":-69,"W~":-91,"W…":-197,"W±":-128,"W−":-91,"W©":-33,"X$":-24,"X+":-78,"X-":-78,"X0":-74,"X3":-44,"X4":-81,"X6":-74,"X8":-44,"X=":-104,"X@":-95,"XC":-95,"XG":-95,"XO":-95,"XQ":-95,"XS":-24,"XT":-81,"Xa":-116,"Xc":-58,"Xd":-58,"Xe":-58,"Xg":-58,"Xo":-58,"Xq":-58,"X•":-93,"X×":-93,"X±":-104,"X−":-78,"X©":-95,"Y+":-141,"Y,":-111,"Y-":-141,"Y.":-111,"Y4":-139,"Y:":-128,"Y;":-128,"Y=":-197,"Y@":-82,"YA":-158,"YC":-82,"YG":-82,"YJ":-69,"YO":-82,"YQ":-82,"YT":26,"Ya":-187,"Yc":-202,"Yd":-202,"Ye":-202,"Yg":-202,"Yi":-48,"Ym":-80,"Yn":-80,"Yo":-202,"Yp":-80,"Yq":-202,"Yr":-80,"Ys":-139,"Yu":-81,"Y~":-141,"Y•":-81,"Y±":-197,"Y−":-141,"Y©":-82,"Z+":-77,"Z-":-77,"Z@":-69,"ZC":-69,"ZG":-69,"ZO":-69,"ZQ":-69,"Z~":-77,"Z−":-77,"Z©":-69,"[B":25,"[D":25,"[E":25,"[F":25,"[H":25,"[I":25,"[K":25,"[L":25,"[M":25,"[N":25,"[P":25,"[R":25,"[b":25,"[c":-15,"[d":-15,"[e":-15,"[g":-15,"[h":25,"[j":37,"[k":25,"[l":25,"[m":25,"[n":25,"[o":-15,"[p":25,"[q":-15,"[r":25,"\\A":30,"\\C":-81,"\\G":-81,"\\O":-81,"\\Q":-81,"\\S":-21,"\\U":-40,"\\Y":-158,"\\c":-31,"\\d":-31,"\\e":-31,"\\f":-12,"\\g":-31,"\\i":7,"\\o":-31,"\\q":-31,"\\s":-15,"\\t":-50,"\\w":-139,"^A":-183,"^C":-31,"^G":-31,"^J":-197,"^O":-31,"^Q":-31,"a\"":-29,"a'":-29,"a1":-81,"aT":-144,"aV":-104,"aW":-104,"aY":-182,"a\\":-104,"av":-34,"ay":-34,"a’":-47,"a‘":-93,"a“":-93,"a”":-47,"b\"":-37,"b'":-37,"b)":-25,"b1":-69,"bA":-69,"bT":-160,"bV":-118,"bW":-103,"bX":-58,"bY":-213,"b\\":-118,"b]":-25,"ba":20,"bv":-38,"bw":-31,"bx":-43,"by":-38,"bz":-37,"b}":-25,"b’":-46,"b‘":-128,"b“":-128,"b”":-46,"c\"":-37,"c'":-37,"c)":-25,"c1":-69,"cA":-69,"cT":-160,"cV":-118,"cW":-103,"cX":-58,"cY":-213,"c\\":-118,"c]":-25,"ca":20,"cv":-38,"cw":-31,"cx":-43,"cy":-38,"cz":-37,"c}":-25,"c’":-46,"c‘":-128,"c“":-128,"c”":-46,"d)":25,"d]":25,"dt":30,"dv":17,"dy":17,"d}":25,"e\"":-37,"e'":-37,"e)":-25,"e1":-69,"eA":-69,"eT":-160,"eV":-118,"eW":-103,"eX":-58,"eY":-213,"e\\":-118,"e]":-25,"ea":20,"ev":-38,"ew":-31,"ex":-43,"ey":-38,"ez":-37,"e}":-25,"e’":-46,"e‘":-128,"e“":-128,"e”":-46,"f+":-48,"f,":-116,"f-":-48,"f.":-116,"f/":-37,"f4":-128,"fA":-69,"fJ":-128,"fY":13,"fa":-37,"fc":-49,"fd":-49,"fe":-49,"ff":-84,"fg":-49,"fi":12,"fj":7,"fo":-49,"fq":-49,"fs":-40,"ft":-77,"fw":37,"f~":-48,"f·":-48,"f•":-40,"f…":-116,"f×":-40,"f−":-48,"gT":-104,"gj":12,"h\"":-29,"h'":-29,"h1":-81,"hT":-144,"hV":-104,"hW":-104,"hY":-182,"h\\":-104,"hv":-34,"hy":-34,"h’":-47,"h‘":-93,"h“":-93,"h”":-47,"k+":-110,"k-":-110,"k4":-93,"kT":-116,"kc":-46,"kd":-46,"ke":-46,"kg":-46,"ko":-46,"kq":-46,"kv":10,"ky":10,"k~":-110,"k·":-110,"k−":-110,"l)":25,"l]":25,"lt":30,"lv":17,"ly":17,"l}":25,"m\"":-29,"m'":-29,"m1":-81,"mT":-144,"mV":-104,"mW":-104,"mY":-182,"m\\":-104,"mv":-34,"my":-34,"m’":-47,"m‘":-93,"m“":-93,"m”":-47,"n\"":-29,"n'":-29,"n1":-81,"nT":-144,"nV":-104,"nW":-104,"nY":-182,"n\\":-104,"nv":-34,"ny":-34,"n’":-47,"n‘":-93,"n“":-93,"n”":-47,"o\"":-37,"o'":-37,"o)":-25,"o1":-69,"oA":-69,"oT":-160,"oV":-118,"oW":-103,"oX":-58,"oY":-213,"o\\":-118,"o]":-25,"oa":20,"ov":-38,"ow":-31,"ox":-43,"oy":-38,"oz":-37,"o}":-25,"o’":-46,"o‘":-128,"o“":-128,"o”":-46,"p\"":-37,"p'":-37,"p)":-25,"p1":-69,"pA":-69,"pT":-160,"pV":-118,"pW":-103,"pX":-58,"pY":-213,"p\\":-118,"p]":-25,"pa":20,"pv":-38,"pw":-31,"px":-43,"py":-38,"pz":-37,"p}":-25,"p’":-46,"p‘":-128,"p“":-128,"p”":-46,"qT":-104,"qj":12,"r+":-77,"r,":-128,"r-":-77,"r.":-128,"r/":-65,"rA":-81,"rB":32,"rD":32,"rE":32,"rF":32,"rH":32,"rI":32,"rJ":-116,"rK":32,"rL":32,"rM":32,"rN":32,"rP":32,"rR":32,"rT":-116,"rZ":-69,"ra":-19,"rb":32,"rc":-45,"rd":-45,"re":-45,"rf":37,"rg":-45,"rh":32,"ri":13,"rj":31,"rk":32,"rl":32,"rm":20,"rn":20,"ro":-45,"rp":20,"rq":-45,"rr":20,"rt":37,"rv":32,"rw":17,"rx":32,"ry":32,"r|":32,"r~":-77,"r·":-77,"r…":-128,"r−":-77,"r’":33,"r‘":-81,"r“":-81,"r”":33,"s\"":-11,"s'":-11,"sT":-151,"sV":-93,"sW":-69,"sY":-151,"s\\":-93,"s‘":-104,"s“":-104,"t+":-36,"t-":-36,"t4":-19,"tB":4,"tD":4,"tE":4,"tF":4,"tH":4,"tI":4,"tK":4,"tL":4,"tM":4,"tN":4,"tP":4,"tR":4,"tT":-69,"tV":-13,"tW":-13,"tY":-20,"t\\":-13,"ta":10,"tb":4,"tc":-20,"td":-20,"te":-20,"tf":-61,"tg":-20,"th":4,"tj":16,"tk":4,"tl":4,"to":-20,"tq":-20,"ts":-17,"tt":-14,"tv":44,"tw":37,"ty":44,"t|":4,"t~":-36,"t·":-36,"t•":-15,"t×":-15,"t−":-36,"t’":15,"t‘":-81,"t“":-81,"t”":15,"u+":-77,"u-":-77,"u/":-69,"uT":-104,"uY":-116,"u~":-77,"u·":-77,"u−":-77,"u’":29,"u‘":-81,"u“":-81,"u”":29,"v+":-81,"v,":-83,"v-":-81,"v.":-83,"v/":-116,"v=":-81,"vA":-139,"vB":6,"vD":6,"vE":6,"vF":6,"vH":6,"vI":6,"vJ":-128,"vK":6,"vL":6,"vM":6,"vN":6,"vP":6,"vR":6,"vT":-69,"vY":-69,"va":-17,"vb":6,"vc":-38,"vd":-38,"ve":-38,"vf":30,"vg":-38,"vh":6,"vk":6,"vl":6,"vo":-38,"vq":-38,"vt":34,"v|":6,"v~":-81,"v·":-81,"v±":-81,"v−":-81,"w,":-151,"w.":-151,"wA":-139,"wJ":-116,"wT":-104,"wZ":-69,"wa":-4,"wc":-31,"wd":-31,"we":-31,"wg":-31,"wo":-31,"wq":-31,"w…":-151,"x+":-46,"x-":-46,"x=":-69,"xT":-86,"xa":-3,"xc":-43,"xd":-43,"xe":-43,"xf":33,"xg":-43,"xo":-43,"xq":-43,"xt":33,"x~":-46,"x·":-46,"x±":-69,"x−":-46,"y+":-81,"y,":-83,"y-":-81,"y.":-83,"y/":-116,"y=":-81,"yA":-139,"yB":6,"yD":6,"yE":6,"yF":6,"yH":6,"yI":6,"yJ":-128,"yK":6,"yL":6,"yM":6,"yN":6,"yP":6,"yR":6,"yT":-69,"yY":-69,"ya":-17,"yb":6,"yc":-38,"yd":-38,"ye":-38,"yf":30,"yg":-38,"yh":6,"yk":6,"yl":6,"yo":-38,"yq":-38,"yt":34,"y|":6,"y~":-81,"y·":-81,"y±":-81,"y−":-81,"zT":-69,"zc":-37,"zd":-37,"ze":-37,"zg":-37,"zo":-37,"zq":-37,"{B":25,"{D":25,"{E":25,"{F":25,"{H":25,"{I":25,"{K":25,"{L":25,"{M":25,"{N":25,"{P":25,"{R":25,"{b":25,"{c":-15,"{d":-15,"{e":-15,"{g":-15,"{h":25,"{j":37,"{k":25,"{l":25,"{m":25,"{n":25,"{o":-15,"{p":25,"{q":-15,"{r":25,"|t":30,"|v":17,"|y":17,"~A":-69,"~J":-93,"~T":-155,"~V":-96,"~W":-67,"~Y":-141,"~x":-46,"·A":-69,"·J":-93,"·W":-67,"·x":-46,"•A":-69,"•T":-69,"•V":-81,"•X":-93,"•Y":-93,"…C":-90,"…G":-90,"…O":-90,"…Q":-90,"…T":-69,"…Y":-111,"°A":-183,"°C":-31,"°G":-31,"°J":-197,"°O":-31,"°Q":-31,"×A":-69,"×V":-81,"×X":-93,"×Y":-93,"±A":-104,"±T":-93,"±V":-139,"±W":-128,"±X":-104,"±Y":-197,"±v":-81,"±x":-69,"±y":-81,"−A":-69,"−J":-93,"−T":-155,"−V":-96,"−W":-67,"−X":-78,"−Y":-141,"−x":-46,"©A":-81,"©T":-64,"©V":-78,"©W":-33,"©X":-95,"©Y":-82,"’A":-280,"’C":-116,"’G":-116,"’J":-256,"’O":-116,"’Q":-116,"’a":-116,"’c":-128,"’d":-128,"’e":-128,"’g":-128,"’m":-53,"’n":-53,"’o":-128,"’p":-53,"’q":-128,"’r":-53,"’s":-147,"’t":19,"’u":-81,"’v":19,"’y":19,"‘A":-197,"‘J":-302,"‘c":-80,"‘d":-80,"‘e":-80,"‘g":-80,"‘o":-80,"‘q":-80,"‘s":-36,"“A":-197,"“J":-302,"“c":-80,"“d":-80,"“e":-80,"“g":-80,"“o":-80,"“q":-80,"“s":-36,"”A":-280,"”C":-116,"”G":-116,"”J":-256,"”O":-116,"”Q":-116,"”a":-116,"”c":-128,"”d":-128,"”e":-128,"”g":-128,"”m":-53,"”n":-53,"”o":-128,"”p":-53,"”q":-128,"”r":-53,"”s":-147,"”t":19,"”u":-81,"”v":19,"”y":19,"0_":-93,"6_":-93,"7&":-93,"7#":-116,"7<":-186,"7_":-325,"9_":-93,"&\\":-128,"&‘":-186,"&'":-69,"&\"":-69,"&“":-186,"@_":-81,"\\‘":-87,"\\’":-116,"\\“":-87,"\\”":-116,"‘&":-128,"’&":-139,"’#":-256,"’<":-197,"’~":-93,"’_":-81,"'&":-69,"\"&":-69,"“&":-128,"”&":-139,"”#":-256,"”<":-197,"”~":-93,"”_":-81,"·\\":-81,">7":-151,">\\":-151,">‘":-197,">“":-197,"_0":-93,"_1":-221,"_3":-93,"_4":-116,"_5":-93,"_6":-93,"_8":-93,"_9":-93,"_@":-81,"_\\":-162,"_‘":-81,"_“":-81,"_^":-139,"_*":-139,"_©":-81,"_°":-139,"^&":-69,"^_":-139,"*&":-69,"*_":-139,"©_":-81,"°&":-69,"°_":-139,"%‘":-128,"%’":-139,"%“":-128,"%”":-139,"1_":25,"5,":-50,"5.":-50,"5…":-50,"5^":-7,"5*":-7,"5°":-7,"6,":-64,"6.":-64,"6…":-64,"|_":25,"\\\\":-100,"\\<":-52,",5":-19,",9":-22,",!":-17,", ":-42,".5":-19,".9":-22,".!":-17,". ":-42,"…5":-19,"…9":-22,"…!":-17,"… ":-42,"_|":69,"\",":-178,"\".":-178,"\"4":-128,"\"…":-178,"',":-178,"'.":-178,"'4":-128,"'…":-178,"(|":25,")‘":-69,")“":-69,"*,":-279,"*.":-279,"*4":-93,"*@":-31,"*…":-279,"*©":-31,"+2":-52,"+3":-15,"+7":-54,"+\\":-96,"+‘":-82,"+“":-82,",\"":-191,",'":-191,",0":-57,",1":-182,",3":-50,",6":-57,",7":-44,",8":-54,",?":-180,",@":-90,",©":-90,",’":-168,",”":-168,"-2":-52,"-3":-15,"-7":-54,"-\\":-96,"-‘":-82,"-“":-82,".\"":-191,".'":-191,".0":-57,".1":-182,".3":-50,".6":-57,".7":-44,".8":-54,".?":-180,".@":-90,".©":-90,".’":-168,".”":-168,"/,":-81,"/.":-81,"/\\":10,"/…":-81,"0,":-57,"0.":-57,"07":-40,"0\\":-42,"0…":-57,"0‘":-93,"0“":-93,"1)":25,"1]":25,"1}":25,"3*":-19,"3,":-44,"3.":-44,"3^":-19,"3…":-44,"3°":-19,"4*":-62,"4,":-69,"4.":-69,"4^":-62,"4…":-69,"4°":-62,"7,":-256,"7.":-256,"7:":-69,"7;":-69,"7…":-256,"8*":-19,"8,":-44,"8.":-44,"8^":-19,"8…":-44,"8°":-19,"9,":-57,"9.":-57,"9\\":-42,"9…":-57,"9‘":-93,"9“":-93,":\\":-128,":‘":-93,":“":-93,";\\":-128,";‘":-93,";“":-93,"=\\":-139,"=‘":-116,"=“":-116,"@,":-90,"@.":-90,"@/":-81,"@\\":-78,"@…":-90,"@‘":-69,"@“":-69,"[|":25,"\\\"":-162,"\\$":-21,"\\'":-162,"\\*":-183,"\\+":-69,"\\-":-69,"\\/":29,"\\1":-91,"\\=":-104,"\\?":-128,"\\@":-81,"\\^":-183,"\\~":-69,"\\·":-69,"\\•":-69,"\\°":-183,"\\×":-69,"\\±":-104,"\\−":-69,"\\©":-81,"]‘":-69,"]“":-69,"^,":-279,"^.":-279,"^4":-93,"^@":-31,"^…":-279,"^©":-31,"{|":25,"|)":25,"|]":25,"|}":25,"}‘":-69,"}“":-69,"~2":-52,"~3":-15,"~7":-54,"~\\":-96,"~‘":-82,"~“":-82,"·2":-52,"·3":-15,"·7":-54,"·‘":-82,"·“":-82,"•\\":-81,"…\"":-191,"…'":-191,"…0":-57,"…1":-182,"…3":-50,"…6":-57,"…7":-44,"…8":-54,"…?":-180,"…@":-90,"…©":-90,"…’":-168,"…”":-168,"°,":-279,"°.":-279,"°4":-93,"°@":-31,"°…":-279,"°©":-31,"×\\":-81,"±\\":-139,"±‘":-116,"±“":-116,"−2":-52,"−3":-15,"−7":-54,"−\\":-96,"−‘":-82,"−“":-82,"©,":-90,"©.":-90,"©/":-81,"©\\":-78,"©…":-90,"©‘":-69,"©“":-69,"’+":-115,"’,":-244,"’-":-115,"’.":-244,"’/":-290,"’0":-93,"’4":-197,"’6":-93,"’7":-128,"’8":-81,"’:":-116,"’;":-116,"’=":-116,"’@":-116,"’·":-115,"’…":-244,"’±":-116,"’−":-115,"’©":-116,"‘,":-204,"‘.":-204,"‘/":-197,"‘4":-128,"‘…":-204,"“,":-204,"“.":-204,"“/":-197,"“4":-128,"“…":-204,"”+":-115,"”,":-244,"”-":-115,"”.":-244,"”/":-290,"”0":-93,"”4":-197,"”6":-93,"”7":-128,"”8":-81,"”:":-116,"”;":-116,"”=":-116,"”@":-116,"”·":-115,"”…":-244,"”±":-116,"”−":-115,"”©":-116},
};
};
__d[8] = function (__ns) {

__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
family: 'Inter',
weight: 700,
unitsPerEm: 2048,
ascender: 1984,
descender: -494,
capHeight: 1490,
xHeight: 1118,
chars: {
"0": [1381, "M 690 -20 Q 502 -20 369 70.5 Q 236 161 165 331.5 Q 94 502 94 744 Q 94 985 165 1156.5 Q 236 1328 369 1419 Q 502 1510 690 1510 Q 878 1510 1011.5 1418.5 Q 1145 1327 1216 1156 Q 1287 985 1287 744 Q 1287 502 1216.5 331.5 Q 1146 161 1012.5 70.5 Q 879 -20 690 -20 Z M 690 233 Q 782 233 845.5 293 Q 909 353 942.5 467 Q 976 581 976 744 Q 976 908 942.5 1023 Q 909 1138 845.5 1198 Q 782 1258 690 1258 Q 599 1258 535 1197.5 Q 471 1137 438 1022.5 Q 405 908 405 744 Q 405 581 438 467 Q 471 353 535 293 Q 599 233 690 233 Z"],
"1": [883, "M 749 1490 L 749 0 L 444 0 L 444 1221 L 434 1221 L 93 979 L 93 1259 L 422 1490 Z"],
"2": [1290, "M 124 0 L 124 220 L 652 715 Q 720 781 766.5 834.5 Q 813 888 837.5 939.5 Q 862 991 862 1051 Q 862 1118 832 1166 Q 802 1214 750 1240 Q 698 1266 631 1266 Q 562 1266 510 1238 Q 458 1210 430 1158 Q 402 1106 402 1033 L 110 1033 Q 110 1178 176.5 1285.5 Q 243 1393 361 1451.5 Q 479 1510 633 1510 Q 791 1510 909 1453.5 Q 1027 1397 1092.5 1298 Q 1158 1199 1158 1070 Q 1158 987 1125.5 906 Q 1093 825 1009.5 724.5 Q 926 624 773 484 L 548 262 L 548 251 L 1178 251 L 1178 0 Z"],
"3": [1322, "M 659 -20 Q 497 -20 371.5 35.5 Q 246 91 173.5 190 Q 101 289 99 418 L 406 418 Q 409 362 442.5 320.5 Q 476 279 533 256 Q 590 233 660 233 Q 734 233 790 258.5 Q 846 284 878 330 Q 910 376 910 437 Q 910 499 876.5 546 Q 843 593 781 619.5 Q 719 646 632 646 L 494 646 L 494 873 L 632 873 Q 705 873 760 898.5 Q 815 924 846.5 968.5 Q 878 1013 878 1073 Q 878 1131 851 1174 Q 824 1217 775.5 1241.5 Q 727 1266 662 1266 Q 597 1266 543 1242.5 Q 489 1219 456 1177 Q 423 1135 422 1077 L 128 1077 Q 130 1204 200.5 1302 Q 271 1400 392 1455 Q 513 1510 664 1510 Q 817 1510 932 1454 Q 1047 1398 1110.5 1303 Q 1174 1208 1174 1092 Q 1174 967 1096.5 883 Q 1019 799 895 775 L 895 764 Q 1003 750 1077.5 703 Q 1152 656 1190 583 Q 1228 510 1228 417 Q 1228 291 1155 192 Q 1082 93 953.5 36.5 Q 825 -20 659 -20 Z"],
"4": [1385, "M 101 265 L 101 506 L 724 1490 L 931 1490 L 931 1154 L 808 1154 L 409 523 L 409 511 L 1293 511 L 1293 265 Z M 814 0 L 814 338 L 820 446 L 820 1490 L 1107 1490 L 1107 0 Z"],
"5": [1274, "M 628 -20 Q 475 -20 355.5 36.5 Q 236 93 166.5 192 Q 97 291 93 418 L 391 418 Q 394 360 426.5 315.5 Q 459 271 512 246.5 Q 565 222 628 222 Q 703 222 760.5 255.5 Q 818 289 851 349 Q 884 409 884 488 Q 884 567 850.5 628.5 Q 817 690 758.5 724 Q 700 758 623 758 Q 556 758 494.5 731.5 Q 433 705 399 660 L 125 708 L 196 1490 L 1098 1490 L 1098 1238 L 449 1238 L 411 861 L 419 861 Q 459 915 537.5 950 Q 616 985 712 985 Q 813 985 898.5 949 Q 984 913 1047 847.5 Q 1110 782 1145 692 Q 1180 602 1180 495 Q 1180 345 1110.5 229 Q 1041 113 916.5 46.5 Q 792 -20 628 -20 Z"],
"6": [1330, "M 684 -20 Q 571 -20 465 18 Q 359 56 275.5 140.5 Q 192 225 143 365 Q 94 505 94 710 Q 94 898 136 1046 Q 178 1194 257 1298 Q 336 1402 447 1456 Q 558 1510 695 1510 Q 842 1510 955 1452.5 Q 1068 1395 1137.5 1297.5 Q 1207 1200 1221 1077 L 921 1077 Q 902 1156 842.5 1201.5 Q 783 1247 695 1247 Q 597 1247 529.5 1189 Q 462 1131 428 1024.5 Q 394 918 394 771 L 404 771 Q 438 836 494.5 883 Q 551 930 624 954.5 Q 697 979 778 979 Q 910 979 1013.5 917.5 Q 1117 856 1177 747 Q 1237 638 1237 498 Q 1237 347 1167 230 Q 1097 113 973 46.5 Q 849 -20 684 -20 Z M 682 222 Q 756 222 814 257.5 Q 872 293 906 353.5 Q 940 414 940 490 Q 940 565 907 625 Q 874 685 816 720.5 Q 758 756 684 756 Q 629 756 582 735 Q 535 714 499.5 677 Q 464 640 444.5 592 Q 425 544 425 489 Q 425 416 458 355.5 Q 491 295 549.5 258.5 Q 608 222 682 222 Z"],
"7": [1191, "M 177 0 L 797 1228 L 797 1238 L 75 1238 L 75 1490 L 1116 1490 L 1116 1234 L 494 0 Z"],
"8": [1333, "M 666 -20 Q 499 -20 370 35 Q 241 90 167.5 185 Q 94 280 94 400 Q 94 493 136.5 571.5 Q 179 650 251.5 702.5 Q 324 755 415 770 L 415 779 Q 296 804 222 896 Q 148 988 148 1110 Q 148 1225 215 1315.5 Q 282 1406 399 1458 Q 516 1510 666 1510 Q 815 1510 932.5 1458 Q 1050 1406 1117.5 1315.5 Q 1185 1225 1185 1110 Q 1185 988 1110 896 Q 1035 804 919 779 L 919 770 Q 1008 755 1080.5 702.5 Q 1153 650 1196.5 571.5 Q 1240 493 1240 400 Q 1240 280 1166 185 Q 1092 90 962.5 35 Q 833 -20 666 -20 Z M 666 206 Q 743 206 800 233.5 Q 857 261 889 310.5 Q 921 360 921 424 Q 921 490 888 540.5 Q 855 591 797.5 620.5 Q 740 650 666 650 Q 592 650 534.5 621 Q 477 592 444 541.5 Q 411 491 411 424 Q 411 360 442.5 311 Q 474 262 532 234 Q 590 206 666 206 Z M 666 874 Q 730 874 779.5 900 Q 829 926 857.5 972 Q 886 1018 886 1077 Q 886 1137 858 1182 Q 830 1227 780.5 1252 Q 731 1277 666 1277 Q 601 1277 551.5 1252 Q 502 1227 474 1182 Q 446 1137 446 1077 Q 446 1018 474 972 Q 502 926 552 900 Q 602 874 666 874 Z"],
"9": [1330, "M 636 -22 Q 489 -22 375.5 36 Q 262 94 193 193 Q 124 292 109 415 L 411 415 Q 429 335 488 288 Q 547 241 636 241 Q 734 241 801.5 299.5 Q 869 358 903.5 465.5 Q 938 573 938 720 L 928 720 Q 894 656 837.5 609 Q 781 562 708.5 536.5 Q 636 511 554 511 Q 422 511 317.5 573 Q 213 635 153.5 744 Q 94 853 94 993 Q 94 1144 164 1261.5 Q 234 1379 359 1446.5 Q 484 1514 649 1512 Q 762 1512 867 1473.5 Q 972 1435 1055.5 1350.5 Q 1139 1266 1188 1126 Q 1237 986 1237 781 Q 1237 592 1194.5 443.5 Q 1152 295 1073.5 191 Q 995 87 884 32.5 Q 773 -22 636 -22 Z M 647 735 Q 702 735 749.5 756.5 Q 797 778 832 814.5 Q 867 851 887 899 Q 907 947 907 1003 Q 907 1075 873.5 1135 Q 840 1195 782 1231.5 Q 724 1268 649 1268 Q 576 1268 517.5 1232.5 Q 459 1197 425 1136.5 Q 391 1076 391 1001 Q 391 926 424.5 866 Q 458 806 515.5 770.5 Q 573 735 647 735 Z"],
" ": [485, ""],
"!": [692, "M 206 472 L 184 1490 L 507 1490 L 485 472 Z M 346 -19 Q 268 -19 218.5 28 Q 169 75 169 150 Q 169 226 218.5 273 Q 268 320 346 320 Q 425 320 474.5 273 Q 524 226 524 150 Q 524 75 474.5 28 Q 425 -19 346 -19 Z"],
"\"": [1130, "M 233 870 L 202 1490 L 491 1490 L 461 870 Z M 669 870 L 638 1490 L 927 1490 L 897 870 Z"],
"#": [1329, "M 690 0 L 935 1490 L 1162 1490 L 917 0 Z M 22 373 L 61 599 L 1221 599 L 1182 373 Z M 167 0 L 411 1490 L 638 1490 L 394 0 Z M 108 890 L 146 1117 L 1306 1117 L 1268 890 Z"],
"$": [1341, "M 620 -201 L 620 1691 L 740 1691 L 740 -201 Z M 681 -22 Q 502 -22 369.5 33 Q 237 88 163 196 Q 89 304 85 462 L 382 462 Q 388 387 427 336.5 Q 466 286 531 261 Q 596 236 678 236 Q 760 236 820.5 259.5 Q 881 283 915 326 Q 949 369 949 426 Q 949 477 918.5 511.5 Q 888 546 831 571 Q 774 596 692 615 L 528 656 Q 339 702 232 800.5 Q 125 899 125 1061 Q 125 1196 197.5 1297 Q 270 1398 396.5 1454 Q 523 1510 685 1510 Q 850 1510 973 1453.5 Q 1096 1397 1165 1296.5 Q 1234 1196 1236 1065 L 941 1065 Q 933 1155 864.5 1204 Q 796 1253 682 1253 Q 605 1253 550 1231 Q 495 1209 466.5 1170 Q 438 1131 438 1081 Q 438 1026 471 989.5 Q 504 953 559 930.5 Q 614 908 676 893 L 811 860 Q 905 839 986 803 Q 1067 767 1128 714.5 Q 1189 662 1222.5 590 Q 1256 518 1256 424 Q 1256 289 1188 188.5 Q 1120 88 991 33 Q 862 -22 681 -22 Z"],
"%": [2080, "M 511 779 Q 405 779 332.5 824 Q 260 869 223 944 Q 186 1019 186 1107 L 186 1185 Q 186 1275 224 1349.5 Q 262 1424 334.5 1469 Q 407 1514 511 1514 Q 617 1514 689.5 1469 Q 762 1424 799 1349.5 Q 836 1275 836 1185 L 836 1107 Q 836 1017 798.5 942.5 Q 761 868 688.5 823.5 Q 616 779 511 779 Z M 511 962 Q 578 962 602.5 1007 Q 627 1052 627 1107 L 627 1185 Q 627 1239 603.5 1285.5 Q 580 1332 511 1332 Q 445 1332 419.5 1284.5 Q 394 1237 394 1185 L 394 1107 Q 394 1052 419.5 1007 Q 445 962 511 962 Z M 1569 -26 Q 1464 -26 1391.5 19 Q 1319 64 1281.5 139 Q 1244 214 1244 302 L 1244 380 Q 1244 470 1282 544.5 Q 1320 619 1393 664 Q 1466 709 1569 709 Q 1676 709 1748 664 Q 1820 619 1857 544.5 Q 1894 470 1894 380 L 1894 302 Q 1894 213 1856.5 138 Q 1819 63 1746.5 18.5 Q 1674 -26 1569 -26 Z M 1569 157 Q 1636 157 1660.5 202.5 Q 1685 248 1685 302 L 1685 380 Q 1685 434 1661.5 480.5 Q 1638 527 1569 527 Q 1503 527 1478 480 Q 1453 433 1453 380 L 1453 302 Q 1453 248 1478 202.5 Q 1503 157 1569 157 Z M 419 0 L 1443 1490 L 1650 1490 L 626 0 Z"],
"&": [1376, "M 579 -22 Q 425 -22 313 34 Q 201 90 141 184 Q 81 278 81 393 Q 81 483 116.5 551 Q 152 619 215.5 676.5 Q 279 734 362 791 L 646 979 Q 677 999 702 1024.5 Q 727 1050 741.5 1079.5 Q 756 1109 756 1143 Q 756 1194 720 1230 Q 684 1266 617 1266 Q 573 1266 540 1249 Q 507 1232 489 1201 Q 471 1170 471 1128 Q 471 1079 495.5 1030.5 Q 520 982 563 929 Q 606 876 662 811 L 1367 0 L 1051 0 L 464 657 Q 403 728 345 800 Q 287 872 249 953.5 Q 211 1035 211 1131 Q 211 1238 261.5 1323.5 Q 312 1409 403 1458.5 Q 494 1508 615 1508 Q 734 1508 820 1460.5 Q 906 1413 953 1333.5 Q 1000 1254 1000 1157 Q 1000 1088 975.5 1027 Q 951 966 907 914 Q 863 862 802 817 L 498 598 Q 437 553 405.5 508.5 Q 374 464 374 405 Q 374 349 401 307 Q 428 265 476 242.5 Q 524 220 588 220 Q 670 220 747.5 256 Q 825 292 888.5 358.5 Q 952 425 989.5 517.5 Q 1027 610 1027 722 L 1278 722 Q 1278 584 1248 475.5 Q 1218 367 1166 288 Q 1114 209 1048 159 L 971 109 Q 889 42 784 10 Q 679 -22 579 -22 Z"],
"'": [694, "M 233 870 L 202 1490 L 491 1490 L 461 870 Z"],
"(": [772, "M 169 607 Q 169 773 202.5 952 Q 236 1131 294 1296 Q 352 1461 427 1581 L 706 1581 Q 634 1426 582 1257.5 Q 530 1089 502.5 923 Q 475 757 475 607 Q 475 476 498.5 343.5 Q 522 211 573 60 Q 624 -91 706 -279 L 427 -279 Q 300 -68 234.5 157.5 Q 169 383 169 607 Z"],
")": [772, "M 67 -279 Q 150 -89 200.5 62.5 Q 251 214 274 346 Q 297 478 297 607 Q 297 757 269.5 923 Q 242 1089 190.5 1257.5 Q 139 1426 67 1581 L 345 1581 Q 421 1461 479 1296 Q 537 1131 570 951.5 Q 603 772 603 607 Q 603 381 537 155.5 Q 471 -70 345 -279 Z"],
"*": [1145, "M 476 652 L 495 936 L 257 777 L 160 945 L 417 1070 L 160 1195 L 257 1365 L 495 1206 L 476 1490 L 668 1490 L 650 1206 L 888 1365 L 983 1195 L 728 1070 L 983 945 L 888 777 L 650 936 L 668 652 Z"],
"+": [1390, "M 568 82 L 568 1108 L 822 1108 L 822 82 Z M 183 475 L 183 715 L 1208 715 L 1208 475 Z"],
",": [684, "M 119 -395 L 207 225 L 507 225 L 323 -395 Z"],
"-": [958, "M 818 733 L 818 493 L 140 493 L 140 733 Z"],
".": [684, "M 342 -19 Q 269 -19 219 30.5 Q 169 80 169 153 Q 169 226 219 275.5 Q 269 325 342 325 Q 415 325 465 275.5 Q 515 226 515 153 Q 515 80 465 30.5 Q 415 -19 342 -19 Z"],
"/": [795, "M 768 1560 L 288 -224 L 28 -224 L 508 1560 Z"],
":": [684, "M 342 -19 Q 269 -19 219 30.5 Q 169 80 169 153 Q 169 226 219 275.5 Q 269 325 342 325 Q 415 325 465 275.5 Q 515 226 515 153 Q 515 80 465 30.5 Q 415 -19 342 -19 Z M 342 723 Q 269 723 219 772.5 Q 169 822 169 895 Q 169 968 219 1017.5 Q 269 1067 342 1067 Q 415 1067 465 1017.5 Q 515 968 515 895 Q 515 822 465 772.5 Q 415 723 342 723 Z"],
";": [702, "M 119 -395 L 207 225 L 507 225 L 323 -395 Z M 360 723 Q 287 723 237 772.5 Q 187 822 187 895 Q 187 968 237 1017.5 Q 287 1067 360 1067 Q 433 1067 483 1017.5 Q 533 968 533 895 Q 533 822 483 772.5 Q 433 723 360 723 Z"],
"<": [1390, "M 166 471 L 166 718 L 1185 1172 L 1185 883 L 483 597 L 492 613 L 492 577 L 483 591 L 1185 306 L 1185 19 Z"],
"=": [1390, "M 197 709 L 197 960 L 1194 960 L 1194 709 Z M 197 230 L 197 482 L 1194 482 L 1194 230 Z"],
">": [1390, "M 1224 471 L 205 19 L 205 306 L 908 591 L 899 577 L 899 613 L 908 597 L 205 883 L 205 1172 L 1224 718 Z"],
"?": [1146, "M 390 458 L 390 482 Q 390 609 412.5 682 Q 435 755 477.5 798.5 Q 520 842 582 879 Q 649 923 695 974 Q 741 1025 741 1098 Q 741 1150 716.5 1188 Q 692 1226 651 1247 Q 610 1268 559 1268 Q 511 1268 468 1247 Q 425 1226 397.5 1185 Q 370 1144 367 1083 L 79 1083 Q 81 1227 146.5 1321.5 Q 212 1416 321 1463 Q 430 1510 560 1510 Q 704 1510 814 1462 Q 924 1414 986.5 1324 Q 1049 1234 1049 1108 Q 1049 980 989 895 Q 929 810 826 749 Q 769 715 731.5 680.5 Q 694 646 676 600 Q 658 554 658 482 L 658 458 Z M 525 -19 Q 447 -19 397 28 Q 347 75 347 150 Q 347 226 397 273 Q 447 320 525 320 Q 604 320 653 273 Q 702 226 702 150 Q 702 75 653 28 Q 604 -19 525 -19 Z"],
"@": [2081, "M 1062 -428 Q 832 -428 652.5 -365 Q 473 -302 348 -181 Q 223 -60 158.5 115.5 Q 94 291 94 516 Q 94 732 156.5 908.5 Q 219 1085 341 1213 Q 463 1341 642.5 1410 Q 822 1479 1054 1479 Q 1271 1479 1443.5 1414.5 Q 1616 1350 1737.5 1234 Q 1859 1118 1923 961.5 Q 1987 805 1987 621 Q 1987 496 1964 388 Q 1941 280 1891.5 199 Q 1842 118 1763.5 72.5 Q 1685 27 1573 27 Q 1508 27 1450 44.5 Q 1392 62 1353 99.5 Q 1314 137 1304 194 L 1296 194 Q 1269 119 1190.5 72.5 Q 1112 26 994 26 Q 857 26 761 89 Q 665 152 614.5 264.5 Q 564 377 564 526 Q 564 673 619 785.5 Q 674 898 772.5 961.5 Q 871 1025 1000 1025 Q 1098 1025 1168.5 990 Q 1239 955 1268 900 L 1279 900 L 1279 1002 L 1485 1002 L 1485 327 Q 1485 279 1507 251 Q 1529 223 1575 223 Q 1638 223 1675 263.5 Q 1712 304 1728 387.5 Q 1744 471 1744 601 Q 1744 747 1702 866.5 Q 1660 986 1576 1072 Q 1492 1158 1366 1204.5 Q 1240 1251 1072 1251 Q 895 1251 759.5 1201.5 Q 624 1152 532 1058 Q 440 964 393.5 828.5 Q 347 693 347 522 Q 347 348 394.5 213.5 Q 442 79 535.5 -12.5 Q 629 -104 766.5 -151 Q 904 -198 1085 -198 Q 1167 -198 1242 -186 Q 1317 -174 1379 -156 Q 1441 -138 1482 -121 L 1561 -329 Q 1512 -353 1434 -376 Q 1356 -399 1261 -413.5 Q 1166 -428 1062 -428 Z M 1022 239 Q 1105 239 1159 272 Q 1213 305 1239.5 370 Q 1266 435 1266 530 Q 1266 626 1238.5 685 Q 1211 744 1157 771 Q 1103 798 1025 798 Q 949 798 895.5 764 Q 842 730 814 670 Q 786 610 786 531 Q 786 447 811.5 381 Q 837 315 889.5 277 Q 942 239 1022 239 Z"],
"A": [1529, "M 49 0 L 558 1490 L 958 1490 L 1480 0 L 1141 0 L 902 719 Q 859 858 814.5 1023.5 Q 770 1189 721 1385 L 788 1385 Q 740 1188 698.5 1021.5 Q 657 855 616 719 L 386 0 Z M 367 346 L 367 585 L 1162 585 L 1162 346 Z"],
"B": [1355, "M 135 0 L 135 1490 L 726 1490 Q 890 1490 999.5 1440.5 Q 1109 1391 1163.5 1305 Q 1218 1219 1218 1107 Q 1218 1019 1183 953.5 Q 1148 888 1087.5 846.5 Q 1027 805 950 787 L 950 772 Q 1034 769 1108.5 724.5 Q 1183 680 1229.5 600.5 Q 1276 521 1276 411 Q 1276 293 1218 200 Q 1160 107 1046.5 53.5 Q 933 0 764 0 Z M 440 251 L 704 251 Q 838 251 900 303 Q 962 355 962 440 Q 962 503 931.5 551.5 Q 901 600 845 627.5 Q 789 655 712 655 L 440 655 Z M 440 864 L 681 864 Q 746 864 798 887.5 Q 850 911 879.5 954.5 Q 909 998 909 1058 Q 909 1139 851.5 1190 Q 794 1241 687 1241 L 440 1241 Z"],
"C": [1515, "M 786 -20 Q 588 -20 431.5 70 Q 275 160 184.5 331 Q 94 502 94 744 Q 94 987 185 1158.5 Q 276 1330 433 1420 Q 590 1510 786 1510 Q 913 1510 1022.5 1474.5 Q 1132 1439 1217 1371 Q 1302 1303 1356 1204.5 Q 1410 1106 1427 980 L 1118 980 Q 1108 1042 1079.5 1089.5 Q 1051 1137 1008.5 1170.5 Q 966 1204 911 1221.5 Q 856 1239 792 1239 Q 676 1239 588.5 1181 Q 501 1123 452.5 1012.5 Q 404 902 404 744 Q 404 583 453 473 Q 502 363 589 307 Q 676 251 791 251 Q 855 251 909.5 268.5 Q 964 286 1007.5 319.5 Q 1051 353 1079.5 401 Q 1108 449 1119 510 L 1428 510 Q 1416 406 1366.5 311 Q 1317 216 1235 141 Q 1153 66 1040 23 Q 927 -20 786 -20 Z"],
"D": [1479, "M 659 0 L 273 0 L 273 263 L 644 263 Q 788 263 885.5 314 Q 983 365 1032 472 Q 1081 579 1081 746 Q 1081 912 1031.5 1018.5 Q 982 1125 885.5 1176 Q 789 1227 646 1227 L 266 1227 L 266 1490 L 664 1490 Q 888 1490 1049.5 1400.5 Q 1211 1311 1298 1144.5 Q 1385 978 1385 746 Q 1385 513 1298 346 Q 1211 179 1048.5 89.5 Q 886 0 659 0 Z M 440 1490 L 440 0 L 135 0 L 135 1490 Z"],
"E": [1244, "M 135 0 L 135 1490 L 1132 1490 L 1132 1237 L 440 1237 L 440 877 L 1080 877 L 1080 628 L 440 628 L 440 253 L 1134 253 L 1134 0 Z"],
"F": [1202, "M 135 0 L 135 1490 L 1115 1490 L 1115 1237 L 440 1237 L 440 821 L 1049 821 L 1049 572 L 440 572 L 440 0 Z"],
"G": [1537, "M 795 -20 Q 586 -20 428.5 72.5 Q 271 165 182.5 336.5 Q 94 508 94 743 Q 94 985 186 1156.5 Q 278 1328 435 1419 Q 592 1510 788 1510 Q 914 1510 1022.5 1473.5 Q 1131 1437 1215.5 1370 Q 1300 1303 1353.5 1211.5 Q 1407 1120 1423 1009 L 1113 1009 Q 1097 1063 1068.5 1105.5 Q 1040 1148 999.5 1178 Q 959 1208 907 1223.5 Q 855 1239 793 1239 Q 678 1239 590 1181.5 Q 502 1124 453 1014 Q 404 904 404 746 Q 404 588 452.5 477.5 Q 501 367 589 309 Q 677 251 797 251 Q 905 251 982 290 Q 1059 329 1100.5 401.5 Q 1142 474 1142 571 L 1206 562 L 818 562 L 818 794 L 1438 794 L 1438 608 Q 1438 412 1355 271.5 Q 1272 131 1127 55.5 Q 982 -20 795 -20 Z"],
"H": [1530, "M 135 0 L 135 1490 L 440 1490 L 440 888 L 1089 888 L 1089 1490 L 1395 1490 L 1395 0 L 1089 0 L 1089 635 L 440 635 L 440 0 Z"],
"I": [575, "M 440 1490 L 440 0 L 135 0 L 135 1490 Z"],
"J": [1197, "M 567 -20 Q 335 -20 201.5 101.5 Q 68 223 68 448 L 68 535 L 373 535 L 373 443 Q 373 336 425.5 281 Q 478 226 567 226 Q 656 226 708 281 Q 760 336 760 444 L 760 1490 L 1062 1490 L 1062 449 Q 1062 223 930 101.5 Q 798 -20 567 -20 Z"],
"K": [1473, "M 360 337 L 360 615 Q 406 698 450 768 Q 494 838 547 908.5 Q 600 979 668 1062 L 1033 1490 L 1406 1490 L 777 762 L 752 771 Z M 135 0 L 135 1490 L 440 1490 L 440 1083 L 435 703 L 440 554 L 440 0 Z M 1061 0 L 619 672 L 812 900 L 1422 0 Z"],
"L": [1158, "M 135 0 L 135 1490 L 440 1490 L 440 253 L 1083 253 L 1083 0 Z"],
"M": [1908, "M 135 0 L 135 1490 L 603 1490 L 845 806 Q 860 758 879.5 682 Q 899 606 919 518 Q 939 430 956.5 347 Q 974 264 985 203 L 926 203 Q 937 263 954.5 345.5 Q 972 428 992 516 Q 1012 604 1031.5 681 Q 1051 758 1066 806 L 1304 1490 L 1774 1490 L 1774 0 L 1467 0 L 1467 702 Q 1467 751 1468.5 824 Q 1470 897 1472.5 981.5 Q 1475 1066 1477 1151.5 Q 1479 1237 1480 1313 L 1499 1313 Q 1480 1230 1457 1141.5 Q 1434 1053 1410.5 970 Q 1387 887 1366 817.5 Q 1345 748 1330 702 L 1083 0 L 826 0 L 575 702 Q 560 748 539 816.5 Q 518 885 494.5 968 Q 471 1051 447 1139.5 Q 423 1228 402 1313 L 425 1313 Q 426 1241 428 1156 Q 430 1071 432.5 985.5 Q 435 900 436.5 826.5 Q 438 753 438 702 L 438 0 Z"],
"N": [1561, "M 135 0 L 135 1490 L 475 1490 L 946 736 Q 982 678 1019 610 Q 1056 542 1094.5 459 Q 1133 376 1171 272 L 1140 272 Q 1133 355 1127.5 449 Q 1122 543 1118 629 Q 1114 715 1114 775 L 1114 1490 L 1426 1490 L 1426 0 L 1085 0 L 657 684 Q 610 761 570 833.5 Q 530 906 486.5 993.5 Q 443 1081 383 1203 L 422 1203 Q 428 1095 434 996 Q 440 897 443.5 816.5 Q 447 736 447 685 L 447 0 Z"],
"O": [1578, "M 789 -20 Q 592 -20 434.5 70 Q 277 160 185.5 331 Q 94 502 94 744 Q 94 987 185.5 1158.5 Q 277 1330 434.5 1420 Q 592 1510 789 1510 Q 987 1510 1144 1420 Q 1301 1330 1392.5 1158.5 Q 1484 987 1484 744 Q 1484 502 1392.5 331 Q 1301 160 1144 70 Q 987 -20 789 -20 Z M 789 251 Q 905 251 991.5 307.5 Q 1078 364 1126 474.5 Q 1174 585 1174 744 Q 1174 905 1126 1015.5 Q 1078 1126 991.5 1182.5 Q 905 1239 789 1239 Q 674 1239 587 1182 Q 500 1125 452 1014.5 Q 404 904 404 744 Q 404 585 452 475 Q 500 365 587 308 Q 674 251 789 251 Z"],
"P": [1327, "M 135 0 L 135 1490 L 716 1490 Q 886 1490 1005 1425.5 Q 1124 1361 1186.5 1247.5 Q 1249 1134 1249 987 Q 1249 839 1185.5 726.5 Q 1122 614 1001.5 550.5 Q 881 487 709 487 L 335 487 L 335 733 L 660 733 Q 754 733 814.5 765.5 Q 875 798 904.5 855 Q 934 912 934 987 Q 934 1062 904.5 1118.5 Q 875 1175 814 1206.5 Q 753 1238 659 1238 L 440 1238 L 440 0 Z"],
"Q": [1591, "M 695 512 L 956 512 L 1094 335 L 1217 191 L 1466 -124 L 1181 -124 L 1011 88 L 928 206 Z M 789 -20 Q 592 -20 434.5 70 Q 277 160 185.5 331 Q 94 502 94 744 Q 94 987 185.5 1158.5 Q 277 1330 434.5 1420 Q 592 1510 789 1510 Q 987 1510 1144 1420 Q 1301 1330 1392.5 1158.5 Q 1484 987 1484 744 Q 1484 502 1392.5 331 Q 1301 160 1144 70 Q 987 -20 789 -20 Z M 789 251 Q 905 251 991.5 307.5 Q 1078 364 1126 474.5 Q 1174 585 1174 744 Q 1174 905 1126 1015.5 Q 1078 1126 991.5 1182.5 Q 905 1239 789 1239 Q 674 1239 587 1182 Q 500 1125 452 1014.5 Q 404 904 404 744 Q 404 585 452 475 Q 500 365 587 308 Q 674 251 789 251 Z"],
"R": [1345, "M 135 0 L 135 1490 L 716 1490 Q 886 1490 1005 1430 Q 1124 1370 1186.5 1261 Q 1249 1152 1249 1005 Q 1249 858 1185.5 751.5 Q 1122 645 1001.5 588.5 Q 881 532 709 532 L 315 532 L 315 779 L 660 779 Q 754 779 814 804.5 Q 874 830 904 880.5 Q 934 931 934 1005 Q 934 1081 904 1132.5 Q 874 1184 813.5 1211 Q 753 1238 659 1238 L 440 1238 L 440 0 Z M 964 0 L 601 678 L 932 678 L 1302 0 Z"],
"S": [1341, "M 681 -22 Q 502 -22 369.5 33 Q 237 88 163 196 Q 89 304 85 462 L 382 462 Q 388 387 427 336.5 Q 466 286 531 261 Q 596 236 678 236 Q 760 236 820.5 259.5 Q 881 283 915 326 Q 949 369 949 426 Q 949 477 918.5 511.5 Q 888 546 831 571 Q 774 596 692 615 L 528 656 Q 339 702 232 800.5 Q 125 899 125 1061 Q 125 1196 197.5 1297 Q 270 1398 396.5 1454 Q 523 1510 685 1510 Q 850 1510 973 1453.5 Q 1096 1397 1165 1296.5 Q 1234 1196 1236 1065 L 941 1065 Q 933 1155 864.5 1204 Q 796 1253 682 1253 Q 605 1253 550 1231 Q 495 1209 466.5 1170 Q 438 1131 438 1081 Q 438 1026 471 989.5 Q 504 953 559 930.5 Q 614 908 676 893 L 811 860 Q 905 839 986 803 Q 1067 767 1128 714.5 Q 1189 662 1222.5 590 Q 1256 518 1256 424 Q 1256 289 1188 188.5 Q 1120 88 991 33 Q 862 -22 681 -22 Z"],
"T": [1367, "M 75 1237 L 75 1490 L 1292 1490 L 1292 1237 L 837 1237 L 837 0 L 531 0 L 531 1237 Z"],
"U": [1499, "M 749 -21 Q 565 -21 426.5 47.5 Q 288 116 211.5 238 Q 135 360 135 523 L 135 1490 L 440 1490 L 440 548 Q 440 461 478.5 393.5 Q 517 326 586.5 287.5 Q 656 249 749 249 Q 843 249 912.5 287.5 Q 982 326 1020.5 393.5 Q 1059 461 1059 548 L 1059 1490 L 1365 1490 L 1365 523 Q 1365 360 1288 238 Q 1211 116 1072.5 47.5 Q 934 -21 749 -21 Z"],
"V": [1529, "M 571 0 L 49 1490 L 388 1490 L 626 771 Q 669 635 713 471.5 Q 757 308 806 114 L 740 114 Q 788 310 830 472.5 Q 872 635 913 771 L 1143 1490 L 1480 1490 L 970 0 Z"],
"W": [2125, "M 449 0 L 49 1490 L 382 1490 L 555 757 Q 576 665 593.5 560.5 Q 611 456 628 350.5 Q 645 245 661 148 L 607 148 Q 625 245 643 350.5 Q 661 456 680 560.5 Q 699 665 722 757 L 904 1490 L 1221 1490 L 1402 757 Q 1425 665 1444 560.5 Q 1463 456 1481.5 350.5 Q 1500 245 1518 148 L 1462 148 Q 1479 245 1495.5 350.5 Q 1512 456 1530.5 560.5 Q 1549 665 1569 757 L 1742 1490 L 2076 1490 L 1675 0 L 1327 0 L 1129 762 Q 1097 889 1074.5 1037 Q 1052 1185 1024 1342 L 1100 1342 Q 1069 1189 1049.5 1043 Q 1030 897 995 762 L 798 0 Z"],
"X": [1512, "M 51 0 L 666 875 L 666 643 L 99 1490 L 453 1490 L 616 1240 Q 662 1169 691.5 1112.5 Q 721 1056 745.5 1003.5 Q 770 951 800 895 L 719 895 Q 749 951 774 1003 Q 799 1055 829 1112 Q 859 1169 905 1240 L 1071 1490 L 1417 1490 L 860 660 L 860 881 L 1461 0 L 1099 0 L 892 312 Q 851 375 825.5 419 Q 800 463 779.5 502.5 Q 759 542 732 591 L 780 591 Q 754 543 733 503.5 Q 712 464 686 419.5 Q 660 375 618 312 L 404 0 Z"],
"Y": [1497, "M 601 0 L 601 560 L 49 1490 L 406 1490 L 658 1026 Q 697 956 727 887 Q 757 818 789 722 L 722 722 Q 753 819 782 888 Q 811 957 848 1026 L 1092 1490 L 1448 1490 L 905 560 L 905 0 Z"],
"Z": [1360, "M 115 0 L 115 183 L 719 1036 Q 775 1114 842 1192.5 Q 909 1271 977 1348 L 1000 1249 Q 900 1240 799.5 1238.5 Q 699 1237 599 1237 L 112 1237 L 112 1490 L 1245 1490 L 1245 1306 L 652 468 Q 593 386 523.5 304.5 Q 454 223 383 142 L 360 241 Q 465 250 569.5 251.5 Q 674 253 778 253 L 1248 253 L 1248 0 Z"],
"[": [772, "M 182 -279 L 182 1581 L 670 1581 L 670 1353 L 471 1353 L 471 -51 L 670 -51 L 670 -279 Z"],
"\\": [795, "M 508 -224 L 28 1560 L 288 1560 L 768 -224 Z"],
"]": [772, "M 102 -279 L 102 -51 L 301 -51 L 301 1353 L 102 1353 L 102 1581 L 591 1581 L 591 -279 Z"],
"^": [997, "M 472 1331 L 524 1331 L 524 1251 L 472 1251 Z M 69 814 L 376 1455 L 621 1455 L 928 814 L 697 814 L 492 1280 L 505 1280 L 300 814 Z"],
"_": [975, "M 975 0 L 975 -231 L 0 -231 L 0 0 Z"],
"`": [748, "M 367 1260 L 161 1571 L 439 1571 L 578 1260 Z"],
"a": [1189, "M 440 -22 Q 334 -22 249.5 15.5 Q 165 53 116.5 127.5 Q 68 202 68 313 Q 68 406 102.5 469 Q 137 532 196.5 570 Q 256 608 331.5 628 Q 407 648 490 656 Q 587 666 646.5 674.5 Q 706 683 733.5 701.5 Q 761 720 761 756 L 761 761 Q 761 809 741 842 Q 721 875 681.5 892.5 Q 642 910 586 910 Q 528 910 485 892.5 Q 442 875 415 846 Q 388 817 375 781 L 100 826 Q 129 924 196 992 Q 263 1060 362.5 1096 Q 462 1132 587 1132 Q 677 1132 762 1110.5 Q 847 1089 914.5 1044 Q 982 999 1021.5 926.5 Q 1061 854 1061 753 L 1061 0 L 777 0 L 777 155 L 767 155 Q 740 103 695 63.5 Q 650 24 586.5 1 Q 523 -22 440 -22 Z M 525 189 Q 596 189 649.5 217 Q 703 245 733 293 Q 763 341 763 400 L 763 521 Q 750 511 723 503 Q 696 495 663 489 Q 630 483 598 478 Q 566 473 541 470 Q 486 462 444 444 Q 402 426 379 396.5 Q 356 367 356 321 Q 356 278 378 248.5 Q 400 219 438 204 Q 476 189 525 189 Z"],
"b": [1291, "M 754 -19 Q 663 -19 600 12 Q 537 43 497.5 88.5 Q 458 134 437 179 L 423 179 L 423 0 L 128 0 L 128 1490 L 428 1490 L 428 930 L 437 930 Q 458 974 496.5 1021 Q 535 1068 598 1100 Q 661 1132 756 1132 Q 880 1132 983 1068 Q 1086 1004 1147.5 876 Q 1209 748 1209 557 Q 1209 371 1149 242.5 Q 1089 114 986 47.5 Q 883 -19 754 -19 Z M 662 222 Q 740 222 793.5 265 Q 847 308 874.5 384 Q 902 460 902 558 Q 902 656 874.5 731 Q 847 806 794 849 Q 741 892 662 892 Q 585 892 531 850.5 Q 477 809 449 734.5 Q 421 660 421 558 Q 421 457 449.5 381.5 Q 478 306 532 264 Q 586 222 662 222 Z"],
"c": [1205, "M 628 -22 Q 459 -22 336.5 50.5 Q 214 123 147.5 252.5 Q 81 382 81 554 Q 81 728 147.5 857.5 Q 214 987 336.5 1059.5 Q 459 1132 628 1132 Q 727 1132 811 1106 Q 895 1080 960 1032 Q 1025 984 1067 915 Q 1109 846 1125 760 L 846 708 Q 837 752 818 786.5 Q 799 821 772 845.5 Q 745 870 709.5 883 Q 674 896 631 896 Q 551 896 496.5 853 Q 442 810 414.5 733 Q 387 656 387 555 Q 387 456 414.5 379 Q 442 302 496.5 258 Q 551 214 631 214 Q 674 214 710 227.5 Q 746 241 774 266.5 Q 802 292 821 328 Q 840 364 848 409 L 1127 358 Q 1111 269 1069 199.5 Q 1027 130 962 80 Q 897 30 812.5 4 Q 728 -22 628 -22 Z"],
"d": [1291, "M 536 -19 Q 408 -19 304.5 47.5 Q 201 114 141 242.5 Q 81 371 81 557 Q 81 748 143 876 Q 205 1004 308 1068 Q 411 1132 535 1132 Q 630 1132 693 1100 Q 756 1068 795 1021 Q 834 974 853 930 L 863 930 L 863 1490 L 1163 1490 L 1163 0 L 868 0 L 868 179 L 853 179 Q 833 134 793.5 88.5 Q 754 43 691 12 Q 628 -19 536 -19 Z M 629 222 Q 705 222 759 264 Q 813 306 841 381.5 Q 869 457 869 558 Q 869 660 841.5 734.5 Q 814 809 760 850.5 Q 706 892 629 892 Q 550 892 496.5 849 Q 443 806 416 731 Q 389 656 389 558 Q 389 460 416.5 384 Q 444 308 497.5 265 Q 551 222 629 222 Z"],
"e": [1220, "M 633 -22 Q 462 -22 338 48 Q 214 118 147.5 247 Q 81 376 81 553 Q 81 726 147 856 Q 213 986 334 1059 Q 455 1132 618 1132 Q 728 1132 823 1097 Q 918 1062 990 991.5 Q 1062 921 1102.5 815 Q 1143 709 1143 565 L 1143 481 L 204 481 L 204 669 L 996 669 L 856 619 Q 856 706 829.5 770.5 Q 803 835 750.5 870.5 Q 698 906 621 906 Q 543 906 488.5 870 Q 434 834 406 772.5 Q 378 711 378 632 L 378 499 Q 378 402 410.5 336 Q 443 270 501.5 237 Q 560 204 638 204 Q 691 204 734 219 Q 777 234 807.5 263.5 Q 838 293 854 336 L 1126 285 Q 1099 193 1032 123.5 Q 965 54 864.5 16 Q 764 -22 633 -22 Z"],
"f": [815, "M 750 1118 L 750 889 L 20 889 L 20 1118 Z M 217 0 L 217 1204 Q 217 1323 264.5 1402 Q 312 1481 394 1520.5 Q 476 1560 580 1560 Q 651 1560 709.5 1548.5 Q 768 1537 795 1529 L 741 1303 Q 722 1308 696.5 1313 Q 671 1318 641 1318 Q 573 1318 544.5 1285.5 Q 516 1253 516 1194 L 516 0 Z"],
"g": [1294, "M 625 -442 Q 485 -442 381 -406.5 Q 277 -371 212 -309 Q 147 -247 122 -168 L 380 -96 Q 394 -127 423.5 -156.5 Q 453 -186 502 -205 Q 551 -224 623 -224 Q 738 -224 803.5 -171.5 Q 869 -119 869 -8 L 869 198 L 846 198 Q 826 153 788 111 Q 750 69 688.5 42.5 Q 627 16 536 16 Q 410 16 307 75 Q 204 134 142.5 255 Q 81 376 81 561 Q 81 750 143.5 877 Q 206 1004 309.5 1068 Q 413 1132 537 1132 Q 631 1132 695 1100.5 Q 759 1069 798.5 1021.5 Q 838 974 858 930 L 871 930 L 871 1118 L 1166 1118 L 1166 9 Q 1166 -142 1096.5 -242 Q 1027 -342 905 -392 Q 783 -442 625 -442 Z M 630 244 Q 707 244 760.5 282 Q 814 320 842 391.5 Q 870 463 870 563 Q 870 662 842 736 Q 814 810 760.5 851 Q 707 892 630 892 Q 551 892 497.5 849.5 Q 444 807 416.5 733 Q 389 659 389 563 Q 389 465 416.5 393.5 Q 444 322 498 283 Q 552 244 630 244 Z"],
"h": [1275, "M 428 647 L 428 0 L 128 0 L 128 1490 L 422 1490 L 422 839 L 398 839 Q 442 979 531.5 1055.5 Q 621 1132 763 1132 Q 879 1132 965.5 1081.5 Q 1052 1031 1100 936.5 Q 1148 842 1148 711 L 1148 0 L 847 0 L 847 659 Q 847 763 793.5 822 Q 740 881 645 881 Q 582 881 532.5 853.5 Q 483 826 455.5 774 Q 428 722 428 647 Z"],
"i": [555, "M 128 0 L 128 1118 L 428 1118 L 428 0 Z M 278 1264 Q 210 1264 162 1309 Q 114 1354 114 1418 Q 114 1482 162 1527 Q 210 1572 278 1572 Q 346 1572 394.5 1527.5 Q 443 1483 443 1418 Q 443 1354 394.5 1309 Q 346 1264 278 1264 Z"],
"j": [555, "M 127 1118 L 428 1118 L 428 -57 Q 428 -185 378 -264.5 Q 328 -344 234.5 -381 Q 141 -418 11 -418 L -50 -418 L -50 -182 L -10 -182 Q 66 -182 96.5 -149.5 Q 127 -117 127 -53 Z M 278 1264 Q 210 1264 162 1309 Q 114 1354 114 1418 Q 114 1482 162 1527 Q 210 1572 278 1572 Q 346 1572 394.5 1527.5 Q 443 1483 443 1418 Q 443 1354 394.5 1309 Q 346 1264 278 1264 Z"],
"k": [1188, "M 400 327 L 400 688 L 445 688 L 811 1118 L 1158 1118 L 675 557 L 604 557 Z M 128 0 L 128 1490 L 428 1490 L 428 0 Z M 826 0 L 490 490 L 691 703 L 1179 0 Z"],
"l": [555, "M 428 1490 L 428 0 L 128 0 L 128 1490 Z"],
"m": [1869, "M 128 0 L 128 1118 L 406 1118 L 421 840 L 399 840 Q 425 943 475.5 1008 Q 526 1073 594 1104 Q 662 1135 737 1135 Q 858 1135 932 1058.5 Q 1006 982 1041 822 L 1006 822 Q 1031 929 1087.5 998.5 Q 1144 1068 1221.5 1101.5 Q 1299 1135 1384 1135 Q 1487 1135 1567.5 1090 Q 1648 1045 1694.5 960.5 Q 1741 876 1741 754 L 1741 0 L 1441 0 L 1441 697 Q 1441 792 1389.5 838 Q 1338 884 1263 884 Q 1207 884 1165.5 859.5 Q 1124 835 1101.5 791 Q 1079 747 1079 688 L 1079 0 L 789 0 L 789 705 Q 789 787 740.5 835.5 Q 692 884 615 884 Q 562 884 519.5 860 Q 477 836 452.5 789.5 Q 428 743 428 676 L 428 0 Z"],
"n": [1275, "M 428 647 L 428 0 L 128 0 L 128 1118 L 411 1118 L 416 839 L 398 839 Q 442 979 531.5 1055.5 Q 621 1132 763 1132 Q 879 1132 965.5 1081.5 Q 1052 1031 1099.5 936.5 Q 1147 842 1147 711 L 1147 0 L 847 0 L 847 659 Q 847 763 793.5 822 Q 740 881 645 881 Q 582 881 532.5 853.5 Q 483 826 455.5 774 Q 428 722 428 647 Z"],
"o": [1256, "M 628 -22 Q 460 -22 337 50.5 Q 214 123 147.5 252.5 Q 81 382 81 554 Q 81 728 147.5 857.5 Q 214 987 337 1059.5 Q 460 1132 628 1132 Q 797 1132 919.5 1059.5 Q 1042 987 1108.5 857.5 Q 1175 728 1175 554 Q 1175 382 1108.5 252.5 Q 1042 123 919.5 50.5 Q 797 -22 628 -22 Z M 628 214 Q 708 214 762 258.5 Q 816 303 843 380.5 Q 870 458 870 555 Q 870 654 843 731 Q 816 808 762 852 Q 708 896 628 896 Q 548 896 494.5 852 Q 441 808 414 731 Q 387 654 387 555 Q 387 458 414 380.5 Q 441 303 494.5 258.5 Q 548 214 628 214 Z"],
"p": [1291, "M 128 -418 L 128 1118 L 423 1118 L 423 930 L 437 930 Q 458 974 496.5 1021 Q 535 1068 598 1100 Q 661 1132 756 1132 Q 880 1132 983 1068 Q 1086 1004 1147.5 876 Q 1209 748 1209 557 Q 1209 371 1149 242.5 Q 1089 114 986 47.5 Q 883 -19 754 -19 Q 663 -19 600 12 Q 537 43 497.5 88.5 Q 458 134 437 179 L 428 179 L 428 -418 Z M 662 222 Q 740 222 793.5 265 Q 847 308 874.5 384 Q 902 460 902 558 Q 902 656 874.5 731 Q 847 806 794 849 Q 741 892 662 892 Q 585 892 531 850.5 Q 477 809 449 734.5 Q 421 660 421 558 Q 421 457 449.5 381.5 Q 478 306 532 264 Q 586 222 662 222 Z"],
"q": [1291, "M 1163 -418 L 863 -418 L 863 179 L 853 179 Q 833 134 793.5 88.5 Q 754 43 691 12 Q 628 -19 536 -19 Q 408 -19 304.5 47.5 Q 201 114 141 242.5 Q 81 371 81 557 Q 81 748 143 876 Q 205 1004 308 1068 Q 411 1132 535 1132 Q 630 1132 693 1100 Q 756 1068 795 1021 Q 834 974 853 930 L 868 930 L 868 1118 L 1163 1118 Z M 629 222 Q 705 222 759 264 Q 813 306 841 381.5 Q 869 457 869 558 Q 869 660 841.5 734.5 Q 814 809 760 850.5 Q 706 892 629 892 Q 550 892 496.5 849 Q 443 806 416 731 Q 389 656 389 558 Q 389 460 416.5 384 Q 444 308 497.5 265 Q 551 222 629 222 Z"],
"r": [834, "M 128 0 L 128 1118 L 418 1118 L 418 923 L 430 923 Q 461 1027 533.5 1080 Q 606 1133 700 1133 Q 723 1133 750 1130.5 Q 777 1128 797 1123 L 797 855 Q 777 862 739 866 Q 701 870 667 870 Q 599 870 544 840.5 Q 489 811 458.5 758.5 Q 428 706 428 636 L 428 0 Z"],
"s": [1147, "M 572 -22 Q 437 -22 333 16.5 Q 229 55 163 128.5 Q 97 202 78 306 L 357 354 Q 379 276 434 237 Q 489 198 581 198 Q 667 198 716.5 230.5 Q 766 263 766 313 Q 766 357 730.5 385 Q 695 413 622 428 L 429 468 Q 267 501 187 580.5 Q 107 660 107 785 Q 107 893 166 970.5 Q 225 1048 330 1090 Q 435 1132 577 1132 Q 709 1132 806 1095.5 Q 903 1059 963 992 Q 1023 925 1043 834 L 777 787 Q 760 844 711.5 880.5 Q 663 917 581 917 Q 507 917 457 886 Q 407 855 407 803 Q 407 761 439.5 732 Q 472 703 551 687 L 752 647 Q 914 614 993 539.5 Q 1072 465 1072 345 Q 1072 235 1008 152.5 Q 944 70 831.5 24 Q 719 -22 572 -22 Z"],
"t": [750, "M 683 1118 L 683 889 L 20 889 L 20 1118 Z M 174 1384 L 474 1384 L 474 327 Q 474 274 497.5 248.5 Q 521 223 576 223 Q 593 223 624 227.5 Q 655 232 671 236 L 714 11 Q 664 -4 614.5 -10 Q 565 -16 520 -16 Q 352 -16 263 66 Q 174 148 174 301 Z"],
"u": [1275, "M 513 -14 Q 397 -14 310 36.5 Q 223 87 175.5 181.5 Q 128 276 128 407 L 128 1118 L 428 1118 L 428 459 Q 428 355 482 296 Q 536 237 630 237 Q 694 237 743 264.5 Q 792 292 819.5 344.5 Q 847 397 847 471 L 847 1118 L 1148 1118 L 1148 0 L 864 0 L 860 279 L 877 279 Q 833 138 742.5 62 Q 652 -14 513 -14 Z"],
"v": [1228, "M 443 0 L 31 1118 L 350 1118 L 538 538 Q 572 429 597.5 318 Q 623 207 650 88 L 586 88 Q 612 207 637 318 Q 662 429 696 538 L 882 1118 L 1197 1118 L 784 0 Z"],
"w": [1741, "M 361 0 L 31 1118 L 346 1118 L 443 705 Q 468 594 497 463.5 Q 526 333 550 175 L 516 175 Q 542 329 573 460.5 Q 604 592 631 705 L 733 1118 L 1009 1118 L 1109 705 Q 1134 592 1165 461.5 Q 1196 331 1223 175 L 1189 175 Q 1213 330 1240.5 460.5 Q 1268 591 1294 705 L 1391 1118 L 1710 1118 L 1378 0 L 1073 0 L 949 431 Q 931 496 913 574.5 Q 895 653 878 734.5 Q 861 816 843 887 L 896 887 Q 879 816 861.5 734.5 Q 844 653 826 574 Q 808 495 790 431 L 666 0 Z"],
"x": [1188, "M 42 0 L 475 691 L 474 457 L 64 1118 L 388 1118 L 489 942 Q 537 855 575.5 770.5 Q 614 686 654 606 L 540 606 Q 581 685 619 770 Q 657 855 707 942 L 812 1118 L 1130 1118 L 712 454 L 712 685 L 1146 0 L 824 0 L 700 210 Q 651 296 611.5 381 Q 572 466 531 544 L 646 544 Q 607 466 569.5 381 Q 532 296 484 210 L 360 0 Z"],
"y": [1233, "M 120 -396 L 189 -170 L 226 -179 Q 286 -195 333 -188 Q 380 -181 408.5 -150 Q 437 -119 443 -63 L 451 -3 L 31 1118 L 350 1118 L 538 538 Q 572 428 593.5 318 Q 615 208 643 88 L 573 88 Q 600 208 627 318.5 Q 654 429 690 538 L 886 1118 L 1201 1118 L 726 -132 Q 692 -222 639 -288 Q 586 -354 507 -390 Q 428 -426 316 -426 Q 256 -426 204 -417.5 Q 152 -409 120 -396 Z"],
"z": [1173, "M 120 0 L 120 182 L 671 868 L 671 876 L 137 876 L 137 1118 L 1034 1118 L 1034 919 L 514 250 L 514 242 L 1053 242 L 1053 0 Z"],
"{": [960, "M 140 636 L 140 786 Q 265 786 314 836.5 Q 363 887 363 999 L 363 1174 Q 363 1306 398.5 1387 Q 434 1468 500 1509.5 Q 566 1551 657.5 1566 Q 749 1581 859 1581 L 859 1354 Q 729 1354 685 1303.5 Q 641 1253 641 1145 L 641 927 Q 641 872 622 819.5 Q 603 767 550.5 726 Q 498 685 399.5 660.5 Q 301 636 140 636 Z M 859 -279 Q 749 -279 657.5 -264.5 Q 566 -250 500 -208 Q 434 -166 398.5 -85.5 Q 363 -5 363 128 L 363 302 Q 363 414 314 465 Q 265 516 140 516 L 140 666 Q 301 666 399.5 641.5 Q 498 617 550.5 575.5 Q 603 534 622 481.5 Q 641 429 641 374 L 641 157 Q 641 50 685 -1.5 Q 729 -53 859 -53 Z M 140 515 L 140 787 L 406 787 L 406 515 Z"],
"|": [761, "M 522 1970 L 522 -480 L 238 -480 L 238 1970 Z"],
"}": [960, "M 820 636 Q 660 636 561 660.5 Q 462 685 409.5 726 Q 357 767 338.5 819.5 Q 320 872 320 927 L 320 1145 Q 320 1253 276 1303.5 Q 232 1354 102 1354 L 102 1581 Q 212 1581 303 1566 Q 394 1551 460 1509.5 Q 526 1468 561.5 1387 Q 597 1306 597 1174 L 597 999 Q 597 887 646.5 836.5 Q 696 786 820 786 Z M 102 -279 L 102 -53 Q 232 -53 276 -1.5 Q 320 50 320 157 L 320 374 Q 320 429 338.5 481.5 Q 357 534 409.5 575.5 Q 462 617 561 641.5 Q 660 666 820 666 L 820 516 Q 695 515 646 464.5 Q 597 414 597 302 L 597 128 Q 597 -5 561.5 -85.5 Q 526 -166 460 -208 Q 394 -250 303 -264.5 Q 212 -279 102 -279 Z M 820 516 L 554 515 L 554 787 L 820 786 Z"],
"~": [1390, "M 157 405 Q 153 542 191.5 636 Q 230 730 302 777.5 Q 374 825 470 825 Q 539 825 601 797 Q 663 769 743 698 Q 786 661 815 641.5 Q 844 622 882 622 Q 935 622 968 663 Q 1001 704 1000 791 L 1233 791 Q 1237 654 1197.5 560 Q 1158 466 1086 418.5 Q 1014 371 920 371 Q 847 371 783.5 401.5 Q 720 432 645 497 Q 598 538 571.5 556 Q 545 574 508 574 Q 456 574 422 535 Q 388 496 390 405 Z"],
"·": [684, "M 342 535 Q 269 535 219 584.5 Q 169 634 169 707 Q 169 780 219 829.5 Q 269 879 342 879 Q 415 879 465 829.5 Q 515 780 515 707 Q 515 634 465 584.5 Q 415 535 342 535 Z"],
"•": [971, "M 485 274 Q 397 274 324 317 Q 251 360 208 433 Q 165 506 165 594 Q 165 683 208 755.5 Q 251 828 324 871 Q 397 914 485 914 Q 574 914 646.5 871 Q 719 828 762 755.5 Q 805 683 805 594 Q 805 506 762 433 Q 719 360 646.5 317 Q 574 274 485 274 Z"],
"…": [2052, "M 342 -19 Q 269 -19 219 30.5 Q 169 80 169 153 Q 169 226 219 275.5 Q 269 325 342 325 Q 415 325 465 275.5 Q 515 226 515 153 Q 515 80 465 30.5 Q 415 -19 342 -19 Z M 1026 -19 Q 953 -19 903 30.5 Q 853 80 853 153 Q 853 226 903 275.5 Q 953 325 1026 325 Q 1099 325 1149 275.5 Q 1199 226 1199 153 Q 1199 80 1149 30.5 Q 1099 -19 1026 -19 Z M 1710 -19 Q 1637 -19 1587 30.5 Q 1537 80 1537 153 Q 1537 226 1587 275.5 Q 1637 325 1710 325 Q 1783 325 1833 275.5 Q 1883 226 1883 153 Q 1883 80 1833 30.5 Q 1783 -19 1710 -19 Z"],
"°": [941, "M 472 788 Q 373 788 292 836 Q 211 884 163 965 Q 115 1046 115 1143 Q 115 1242 163 1323 Q 211 1404 292 1452 Q 373 1500 471 1500 Q 569 1500 649.5 1452 Q 730 1404 778 1323 Q 826 1242 826 1143 Q 826 1046 778 965 Q 730 884 649.5 836 Q 569 788 472 788 Z M 471 990 Q 514 991 548.5 1011.5 Q 583 1032 603.5 1066.5 Q 624 1101 624 1143 Q 624 1186 603.5 1220.5 Q 583 1255 548 1275.5 Q 513 1296 471 1296 Q 429 1296 394 1275.5 Q 359 1255 338.5 1220.5 Q 318 1186 318 1144 Q 318 1102 338.5 1067 Q 359 1032 394 1011.5 Q 429 991 471 990 Z"],
"–": [1024, "M 1024 733 L 1024 493 L 0 493 L 0 733 Z"],
"—": [2048, "M 2048 733 L 2048 493 L 0 493 L 0 733 Z"],
"×": [1390, "M 1037 69 L 171 933 L 357 1121 L 1222 254 Z M 357 69 L 171 254 L 1037 1121 L 1222 933 Z"],
"↑": [1854, "M 202 793 L 927 1518 L 1652 793 L 1488 628 L 1256 861 Q 1202 915 1143.5 987.5 Q 1085 1060 1033.5 1129.5 Q 982 1199 948 1244 L 1002 1231 Q 1010 1192 1020.5 1136 Q 1031 1080 1039 1020 Q 1047 960 1047 910 L 1047 0 L 807 0 L 807 910 Q 807 960 815 1020 Q 823 1080 833.5 1136 Q 844 1192 852 1231 L 905 1244 Q 881 1210 844 1160.5 Q 807 1111 764.5 1056 Q 722 1001 679 950 Q 636 899 599 861 L 367 628 Z"],
"↓": [1854, "M 1652 697 L 926 -28 L 202 697 L 366 862 L 598 629 Q 652 575 710.5 502.5 Q 769 430 821 361 Q 873 292 906 246 L 852 259 Q 844 298 833.5 354.5 Q 823 411 815 470.5 Q 807 530 807 580 L 807 1490 L 1047 1490 L 1047 580 Q 1047 530 1039 470.5 Q 1031 411 1020.5 354.5 Q 1010 298 1002 259 L 949 246 Q 973 280 1010 329.5 Q 1047 379 1089.5 434 Q 1132 489 1175 540 Q 1218 591 1255 629 L 1487 862 Z"],
"±": [1390, "M 185 57 L 185 298 L 1204 298 L 1204 57 Z M 185 661 L 185 895 L 1204 895 L 1204 661 Z M 568 406 L 568 1151 L 822 1151 L 822 406 Z"],
"−": [1390, "M 1202 722 L 1202 467 L 189 467 L 189 722 Z"],
"€": [1402, "M 1101 975 L 1030 818 L 58 818 L 117 975 Z M 963 672 L 886 510 L 58 510 L 117 672 Z M 1290 1374 L 1176 1131 Q 1147 1153 1105 1177.5 Q 1063 1202 1010 1219.5 Q 957 1237 892 1237 Q 790 1237 713.5 1184.5 Q 637 1132 594.5 1023 Q 552 914 552 743 Q 552 572 594.5 463 Q 637 354 713.5 303 Q 790 252 892 252 Q 957 252 1009.5 269 Q 1062 286 1102.5 310 Q 1143 334 1170 354 L 1285 113 Q 1206 47 1105.5 13.5 Q 1005 -20 892 -20 Q 703 -20 557 70.5 Q 411 161 328 332 Q 245 503 245 743 Q 245 984 328 1155.5 Q 411 1327 557 1418.5 Q 703 1510 892 1510 Q 1008 1510 1108 1475.5 Q 1208 1441 1290 1374 Z"],
"£": [1308, "M 94 207 L 94 254 Q 177 254 221.5 293.5 Q 266 333 262 410 L 233 1004 Q 224 1162 286 1275.5 Q 348 1389 463 1450.5 Q 578 1512 726 1512 Q 853 1512 955.5 1463.5 Q 1058 1415 1124.5 1325 Q 1191 1235 1211 1112 L 930 1068 Q 916 1160 866 1209 Q 816 1258 731 1258 Q 657 1258 609.5 1229.5 Q 562 1201 540.5 1147 Q 519 1093 521 1019 L 540 455 Q 543 378 506 330.5 Q 469 283 410.5 257 Q 352 231 288 220.5 Q 224 210 171.5 208.5 Q 119 207 94 207 Z M 94 0 L 94 254 L 887 254 Q 916 254 929 267.5 Q 942 281 942 309 L 942 365 L 1221 365 L 1221 309 Q 1221 158 1139 79 Q 1057 0 897 0 Z M 94 648 L 94 842 L 919 842 L 919 648 Z"],
"©": [1872, "M 530 744 Q 530 859 585.5 952 Q 641 1045 735 1101 Q 829 1157 943 1157 Q 1043 1157 1127.5 1113 Q 1212 1069 1266.5 994.5 Q 1321 920 1333 825 L 1121 825 Q 1109 882 1058 918 Q 1007 954 943 954 Q 886 954 838 926 Q 790 898 761.5 850.5 Q 733 803 733 745 Q 733 688 761.5 640.5 Q 790 593 838 564.5 Q 886 536 943 536 Q 1007 536 1054.5 572 Q 1102 608 1114 664 L 1325 664 Q 1314 570 1261 494.5 Q 1208 419 1125.5 376 Q 1043 333 943 333 Q 829 333 735 388.5 Q 641 444 585.5 537.5 Q 530 631 530 744 Z M 936 -23 Q 777 -23 638 36.5 Q 499 96 393 202 Q 287 308 227.5 447 Q 168 586 168 745 Q 168 904 227.5 1043 Q 287 1182 393 1288 Q 499 1394 638 1453.5 Q 777 1513 936 1513 Q 1095 1513 1234 1453.5 Q 1373 1394 1479 1288 Q 1585 1182 1644.5 1043 Q 1704 904 1704 745 Q 1704 586 1644.5 447 Q 1585 308 1479 202 Q 1373 96 1234 36.5 Q 1095 -23 936 -23 Z M 936 214 Q 1046 214 1142 255 Q 1238 296 1311.5 369.5 Q 1385 443 1426 539 Q 1467 635 1467 745 Q 1467 855 1426 951 Q 1385 1047 1311.5 1120.5 Q 1238 1194 1142 1235 Q 1046 1276 936 1276 Q 826 1276 730 1235 Q 634 1194 560.5 1120.5 Q 487 1047 446 951 Q 405 855 405 745 Q 405 635 446 539 Q 487 443 560.5 369.5 Q 634 296 730 255 Q 826 214 936 214 Z"],
"’": [636, "M 165 870 L 253 1490 L 553 1490 L 369 870 Z"],
"‘": [636, "M 165 870 L 349 1490 L 553 1490 L 465 870 Z"],
"“": [1106, "M 165 870 L 349 1490 L 553 1490 L 465 870 Z M 635 870 L 819 1490 L 1023 1490 L 935 870 Z"],
"”": [1089, "M 165 870 L 253 1490 L 553 1490 L 369 870 Z M 618 870 L 706 1490 L 1006 1490 L 822 870 Z"],
},
kern: {"24":-32,"41":-78,"70":-32,"73":-34,"74":-119,"75":-20,"76":-32,"77":40,"78":-29,"79":-20,"97":-40,"C_":-81,"D_":-81,"F.":-69,"F…":-174,"F_":-69,"J_":-104,"K·":-93,"K<":-139,"L-":-104,"L·":-128,"L~":-81,"L*":-81,"L°":-93,"O_":-81,"P&":-69,"P.":-69,"P…":-197,"Q_":-81,"T&":-69,"T/":-104,"T…":-174,"T<":-162,"T_":-116,"U_":-104,"V&":-104,"V@":-69,"V·":-81,"V<":-151,"V_":-162,"W&":-104,"W<":-151,"X·":-93,"X<":-116,"Y&":-128,"Y…":-197,"Y·":-104,"Y<":-209,"Y×":-93,"Z·":-69,"Z<":-128,"f_":-29,"k<":-174,"t<":-58,"u<":-81,"u_":-69,"v…":-151,"v<":-69,"v_":-162,"w&":-69,"y…":-151,"y<":-69,"y_":-162,"&T":-116,"&V":-128,"&W":-81,"&Y":-151,"&v":-69,"&w":-69,"&y":-69,"\\T":-81,"\\v":-104,"\\y":-104,"·V":-81,"·X":-93,"·Y":-104,">T":-162,">V":-151,">W":-151,">X":-116,">Y":-186,">Z":-128,"×T":-116,"_C":-81,"_G":-81,"_O":-81,"_Q":-81,"_T":-116,"_U":-81,"_V":-162,"_j":197,"_v":-162,"_y":-162,"A<":-78,"H_":37,"I_":37,"M_":37,"N_":37,"T·":-162,"W·":-69,"X~":-69,"d_":37,"l_":37,"r<":-81,"\\V":-100,"\\W":-118,"·T":-162,">A":-78,"~X":-82,"_B":69,"_D":69,"_E":69,"_F":69,"_H":69,"_I":69,"_K":69,"_L":69,"_M":69,"_N":69,"_P":69,"_R":69,"_b":69,"_h":69,"_i":32,"_k":69,"_l":69,"_m":69,"_n":69,"_p":69,"_r":69,"\"A":-162,"\"J":-337,"\"c":-41,"\"d":-41,"\"e":-41,"\"g":-41,"\"o":-41,"\"q":-41,"\"s":-16,"$A":-31,"$T":-15,"$X":-25,"'A":-162,"'J":-337,"'c":-41,"'d":-41,"'e":-41,"'g":-41,"'o":-41,"'q":-41,"'s":-16,"(B":37,"(D":37,"(E":37,"(F":37,"(H":37,"(I":37,"(K":37,"(L":37,"(M":37,"(N":37,"(P":37,"(R":37,"(b":37,"(c":-11,"(d":-11,"(e":-11,"(g":-11,"(h":37,"(j":27,"(k":37,"(l":37,"(m":37,"(n":37,"(o":-11,"(p":37,"(q":-11,"(r":37,"*A":-194,"*C":-35,"*G":-35,"*J":-197,"*O":-35,"*Q":-35,"+A":-69,"+J":-93,"+T":-157,"+V":-92,"+W":-48,"+X":-82,"+Y":-131,"+x":-46,",C":-90,",G":-90,",O":-90,",Q":-90,",T":-69,",Y":-132,"-A":-69,"-J":-93,"-T":-157,"-V":-92,"-W":-48,"-X":-82,"-Y":-131,"-x":-46,".C":-90,".G":-90,".O":-90,".Q":-90,".T":-69,".Y":-132,"/A":-50,"/J":-128,"/V":16,"/W":16,"0V":-52,"0X":-75,"0Y":-69,"0t":35,"1t":30,"1v":21,"1y":21,"3X":-45,"7A":-221,"7J":-197,"7a":-93,"7c":-104,"7d":-104,"7e":-104,"7g":-104,"7m":-104,"7n":-104,"7o":-104,"7p":-104,"7q":-104,"7r":-104,"7s":-81,"8X":-45,"9V":-52,"9X":-75,"9Y":-69,"9t":35,":T":-69,":V":-128,";T":-69,";V":-128,"=A":-104,"=T":-93,"=V":-139,"=W":-128,"=X":-104,"=Y":-197,"=v":-81,"=x":-69,"=y":-81,"?A":-128,"@A":-86,"@T":-65,"@V":-82,"@W":-50,"@X":-108,"@Y":-88,"A\"":-162,"A$":-31,"A'":-162,"A*":-194,"A+":-69,"A-":-69,"A/":24,"A1":-102,"A=":-104,"A?":-128,"A@":-86,"AA":30,"AC":-86,"AG":-86,"AO":-86,"AQ":-86,"AS":-31,"AT":-182,"AU":-40,"AV":-162,"AW":-147,"AY":-161,"A\\":-162,"A^":-194,"Ac":-47,"Ad":-47,"Ae":-47,"Af":-18,"Ag":-47,"Ai":5,"Ao":-47,"Aq":-47,"As":-23,"At":-56,"Av":-139,"Aw":-139,"Ay":-139,"A~":-69,"A·":-69,"A•":-69,"A°":-194,"A×":-69,"A±":-104,"A−":-69,"A©":-86,"A’":-209,"A‘":-267,"A“":-267,"A”":-209,"BT":-116,"B‘":-128,"B“":-128,"CA":-56,"CX":-30,"Cv":12,"Cy":12,"D,":-90,"D.":-90,"D/":-81,"DA":-86,"DT":-65,"DV":-82,"DW":-50,"DX":-108,"DY":-88,"D\\":-82,"D…":-90,"D‘":-69,"D“":-69,"F,":-81,"FA":-186,"FJ":-139,"Fa":-34,"Fc":-59,"Fd":-59,"Fe":-59,"Fg":-59,"Fm":-40,"Fn":-40,"Fo":-59,"Fp":-40,"Fq":-59,"Fr":-40,"Fu":-69,"Fv":-69,"Fy":-69,"Fz":-69,"GA":-64,"GT":-63,"GV":-46,"GX":-30,"GY":-58,"G\\":-46,"H)":37,"H]":37,"Ht":30,"Hv":21,"Hy":21,"H}":37,"I)":37,"I]":37,"It":30,"Iv":21,"Iy":21,"I}":37,"J,":-69,"J.":-69,"J/":-116,"JA":-40,"J…":-69,"K$":-20,"K+":-158,"K-":-158,"K=":-69,"K@":-82,"KC":-82,"KG":-82,"KO":-82,"KQ":-82,"KS":-20,"Kc":-81,"Kd":-81,"Ke":-81,"Kg":-81,"Ki":15,"Ko":-81,"Kq":-81,"Ku":-69,"Kv":-81,"Kw":-128,"Ky":-81,"K~":-158,"K•":-69,"K×":-69,"K±":-69,"K−":-158,"K©":-82,"L\"":-186,"L'":-186,"L+":-136,"L1":-93,"L@":-58,"LC":-58,"LG":-58,"LO":-58,"LQ":-58,"LT":-186,"LV":-158,"LW":-75,"LY":-178,"L\\":-158,"L^":-267,"Lt":-46,"Lv":-139,"Ly":-139,"L•":-69,"L×":-69,"L−":-136,"L©":-58,"L’":-188,"L‘":-174,"L“":-174,"L”":-188,"M)":37,"M]":37,"Mt":30,"Mv":21,"My":21,"M}":37,"N)":37,"N]":37,"Nt":30,"Nv":21,"Ny":21,"N}":37,"O,":-90,"O.":-90,"O/":-81,"OA":-86,"OT":-65,"OV":-82,"OW":-50,"OX":-108,"OY":-88,"O\\":-82,"O…":-90,"O‘":-69,"O“":-69,"P+":-43,"P,":-81,"P-":-43,"PA":-170,"PJ":-197,"Pa":-26,"Pc":-17,"Pd":-17,"Pe":-17,"Pg":-17,"Po":-17,"Pq":-17,"P~":-43,"P·":-43,"P−":-43,"Q,":-90,"Q.":-90,"Q/":-81,"QA":-86,"QT":-65,"QV":-82,"QW":-50,"QX":-108,"QY":-88,"Q\\":-82,"Q…":-90,"Q‘":-69,"Q“":-69,"RV":-40,"RY":-60,"R\\":-40,"Ra":-10,"Rc":-25,"Rd":-25,"Re":-25,"Rg":-25,"Ro":-25,"Rq":-25,"SA":-31,"ST":-15,"SX":-25,"T$":-11,"T+":-107,"T,":-69,"T-":-107,"T.":-69,"T0":-69,"T4":-139,"T6":-69,"T7":-162,"T:":-69,"T;":-69,"T=":-69,"T@":-65,"TA":-182,"TC":-65,"TG":-65,"TJ":-186,"TO":-65,"TQ":-65,"TS":-11,"TY":18,"Ta":-150,"Tc":-160,"Td":-160,"Te":-160,"Tg":-160,"Tm":-116,"Tn":-116,"To":-160,"Tp":-116,"Tq":-160,"Tr":-116,"Ts":-151,"Tt":-209,"Tu":-151,"Tv":-128,"Tw":-128,"Tx":-65,"Ty":-128,"Tz":-93,"T~":-107,"T•":-69,"T×":-69,"T±":-69,"T−":-107,"T©":-65,"U,":-69,"U.":-69,"U/":-116,"UA":-40,"U…":-69,"V+":-117,"V,":-197,"V-":-117,"V.":-197,"V/":-100,"V0":-52,"V4":-69,"V6":-52,"V:":-128,"V;":-128,"V=":-128,"VA":-162,"VC":-82,"VG":-82,"VJ":-197,"VO":-82,"VQ":-82,"VV":30,"V\\":30,"Va":-121,"Vc":-125,"Vd":-125,"Ve":-125,"Vg":-125,"Vm":-16,"Vn":-16,"Vo":-125,"Vp":-16,"Vq":-125,"Vr":-16,"Vs":-93,"V~":-117,"V•":-81,"V…":-197,"V×":-81,"V±":-128,"V−":-117,"V©":-82,"W$":-12,"W+":-85,"W,":-197,"W-":-85,"W.":-197,"W/":-64,"W4":-69,"W:":-104,"W;":-104,"W=":-128,"W@":-50,"WA":-147,"WC":-50,"WG":-50,"WJ":-128,"WO":-50,"WQ":-50,"WS":-12,"WV":16,"WW":45,"W\\":16,"Wa":-118,"Wc":-102,"Wd":-102,"We":-102,"Wg":-102,"Wm":-70,"Wn":-70,"Wo":-102,"Wp":-70,"Wq":-102,"Wr":-70,"Ws":-69,"W~":-85,"W…":-197,"W±":-128,"W−":-85,"W©":-50,"X$":-25,"X+":-82,"X-":-82,"X0":-75,"X3":-45,"X4":-81,"X6":-75,"X8":-45,"X=":-104,"X@":-108,"XC":-108,"XG":-108,"XO":-108,"XQ":-108,"XS":-25,"XT":-81,"Xa":-116,"Xc":-58,"Xd":-58,"Xe":-58,"Xg":-58,"Xo":-58,"Xq":-58,"X•":-93,"X×":-93,"X±":-104,"X−":-82,"X©":-108,"Y+":-131,"Y,":-132,"Y-":-131,"Y.":-132,"Y4":-139,"Y:":-128,"Y;":-128,"Y=":-197,"Y@":-88,"YA":-161,"YC":-88,"YG":-88,"YJ":-69,"YO":-88,"YQ":-88,"YT":18,"Ya":-208,"Yc":-224,"Yd":-224,"Ye":-224,"Yg":-224,"Yi":-42,"Ym":-80,"Yn":-80,"Yo":-224,"Yp":-80,"Yq":-224,"Yr":-80,"Ys":-139,"Yu":-81,"Y~":-131,"Y•":-81,"Y±":-197,"Y−":-131,"Y©":-88,"Z+":-75,"Z-":-75,"Z@":-69,"ZC":-69,"ZG":-69,"ZO":-69,"ZQ":-69,"Z~":-75,"Z−":-75,"Z©":-69,"[B":37,"[D":37,"[E":37,"[F":37,"[H":37,"[I":37,"[K":37,"[L":37,"[M":37,"[N":37,"[P":37,"[R":37,"[b":37,"[c":-11,"[d":-11,"[e":-11,"[g":-11,"[h":37,"[j":27,"[k":37,"[l":37,"[m":37,"[n":37,"[o":-11,"[p":37,"[q":-11,"[r":37,"\\A":30,"\\C":-86,"\\G":-86,"\\O":-86,"\\Q":-86,"\\S":-31,"\\U":-40,"\\Y":-161,"\\c":-47,"\\d":-47,"\\e":-47,"\\f":-18,"\\g":-47,"\\i":5,"\\o":-47,"\\q":-47,"\\s":-23,"\\t":-56,"\\w":-139,"^A":-194,"^C":-35,"^G":-35,"^J":-197,"^O":-35,"^Q":-35,"a\"":-43,"a'":-43,"a1":-81,"aT":-145,"aV":-104,"aW":-104,"aY":-198,"a\\":-104,"av":-35,"ay":-35,"a’":-51,"a‘":-93,"a“":-93,"a”":-51,"b\"":-41,"b'":-41,"b)":-26,"b1":-69,"bA":-69,"bT":-160,"bV":-125,"bW":-102,"bX":-58,"bY":-232,"b\\":-125,"b]":-26,"ba":20,"bv":-37,"bw":-28,"bx":-41,"by":-37,"bz":-41,"b}":-26,"b’":-45,"b‘":-128,"b“":-128,"b”":-45,"c\"":-41,"c'":-41,"c)":-26,"c1":-69,"cA":-69,"cT":-160,"cV":-125,"cW":-102,"cX":-58,"cY":-232,"c\\":-125,"c]":-26,"ca":20,"cv":-37,"cw":-28,"cx":-41,"cy":-37,"cz":-41,"c}":-26,"c’":-45,"c‘":-128,"c“":-128,"c”":-45,"d)":37,"d]":37,"dt":30,"dv":21,"dy":21,"d}":37,"e\"":-41,"e'":-41,"e)":-26,"e1":-69,"eA":-69,"eT":-160,"eV":-125,"eW":-102,"eX":-58,"eY":-232,"e\\":-125,"e]":-26,"ea":20,"ev":-37,"ew":-28,"ex":-41,"ey":-37,"ez":-41,"e}":-26,"e’":-45,"e‘":-128,"e“":-128,"e”":-45,"f+":-42,"f,":-116,"f-":-42,"f.":-116,"f/":-27,"f4":-128,"fA":-69,"fJ":-128,"fY":9,"fa":-40,"fc":-44,"fd":-44,"fe":-44,"ff":-85,"fg":-44,"fi":17,"fj":11,"fo":-44,"fq":-44,"fs":-37,"ft":-81,"fw":41,"f~":-42,"f·":-42,"f•":-37,"f…":-116,"f×":-37,"f−":-42,"gT":-104,"gj":18,"h\"":-43,"h'":-43,"h1":-81,"hT":-145,"hV":-104,"hW":-104,"hY":-198,"h\\":-104,"hv":-35,"hy":-35,"h’":-51,"h‘":-93,"h“":-93,"h”":-51,"k+":-118,"k-":-118,"k4":-93,"kT":-116,"kc":-46,"kd":-46,"ke":-46,"kg":-46,"ko":-46,"kq":-46,"kv":16,"ky":16,"k~":-118,"k·":-118,"k−":-118,"l)":37,"l]":37,"lt":30,"lv":21,"ly":21,"l}":37,"m\"":-43,"m'":-43,"m1":-81,"mT":-145,"mV":-104,"mW":-104,"mY":-198,"m\\":-104,"mv":-35,"my":-35,"m’":-51,"m‘":-93,"m“":-93,"m”":-51,"n\"":-43,"n'":-43,"n1":-81,"nT":-145,"nV":-104,"nW":-104,"nY":-198,"n\\":-104,"nv":-35,"ny":-35,"n’":-51,"n‘":-93,"n“":-93,"n”":-51,"o\"":-41,"o'":-41,"o)":-26,"o1":-69,"oA":-69,"oT":-160,"oV":-125,"oW":-102,"oX":-58,"oY":-232,"o\\":-125,"o]":-26,"oa":20,"ov":-37,"ow":-28,"ox":-41,"oy":-37,"oz":-41,"o}":-26,"o’":-45,"o‘":-128,"o“":-128,"o”":-45,"p\"":-41,"p'":-41,"p)":-26,"p1":-69,"pA":-69,"pT":-160,"pV":-125,"pW":-102,"pX":-58,"pY":-232,"p\\":-125,"p]":-26,"pa":20,"pv":-37,"pw":-28,"px":-41,"py":-37,"pz":-41,"p}":-26,"p’":-45,"p‘":-128,"p“":-128,"p”":-45,"qT":-104,"qj":18,"r+":-75,"r,":-128,"r-":-75,"r.":-128,"r/":-63,"rA":-81,"rB":32,"rD":32,"rE":32,"rF":32,"rH":32,"rI":32,"rJ":-116,"rK":32,"rL":32,"rM":32,"rN":32,"rP":32,"rR":32,"rT":-116,"rZ":-69,"ra":-28,"rb":32,"rc":-50,"rd":-50,"re":-50,"rf":40,"rg":-50,"rh":32,"ri":9,"rj":31,"rk":32,"rl":32,"rm":15,"rn":15,"ro":-50,"rp":15,"rq":-50,"rr":15,"rt":40,"rv":32,"rw":17,"rx":32,"ry":32,"r|":32,"r~":-75,"r·":-75,"r…":-128,"r−":-75,"r’":33,"r‘":-81,"r“":-81,"r”":33,"s\"":-16,"s'":-16,"sT":-151,"sV":-93,"sW":-69,"sY":-151,"s\\":-93,"s‘":-104,"s“":-104,"t+":-34,"t-":-34,"t4":-13,"tB":5,"tD":5,"tE":5,"tF":5,"tH":5,"tI":5,"tK":5,"tL":5,"tM":5,"tN":5,"tP":5,"tR":5,"tT":-69,"tV":-9,"tW":-9,"tY":-15,"t\\":-9,"ta":10,"tb":5,"tc":-20,"td":-20,"te":-20,"tf":-66,"tg":-20,"th":5,"tj":15,"tk":5,"tl":5,"to":-20,"tq":-20,"ts":-15,"tt":-22,"tv":45,"tw":41,"ty":45,"t|":5,"t~":-34,"t·":-34,"t•":-11,"t×":-11,"t−":-34,"t’":23,"t‘":-81,"t“":-81,"t”":23,"u+":-75,"u-":-75,"u/":-69,"uT":-104,"uY":-116,"u~":-75,"u·":-75,"u−":-75,"u’":29,"u‘":-81,"u“":-81,"u”":29,"v+":-81,"v,":-79,"v-":-81,"v.":-79,"v/":-116,"v=":-81,"vA":-139,"vB":5,"vD":5,"vE":5,"vF":5,"vH":5,"vI":5,"vJ":-128,"vK":5,"vL":5,"vM":5,"vN":5,"vP":5,"vR":5,"vT":-69,"vY":-69,"va":-20,"vb":5,"vc":-37,"vd":-37,"ve":-37,"vf":30,"vg":-37,"vh":5,"vk":5,"vl":5,"vo":-37,"vq":-37,"vt":35,"v|":5,"v~":-81,"v·":-81,"v±":-81,"v−":-81,"w,":-151,"w.":-151,"wA":-139,"wJ":-116,"wT":-104,"wZ":-69,"wa":-5,"wc":-28,"wd":-28,"we":-28,"wg":-28,"wo":-28,"wq":-28,"w…":-151,"x+":-46,"x-":-46,"x=":-69,"xT":-65,"xa":-4,"xc":-41,"xd":-41,"xe":-41,"xf":29,"xg":-41,"xo":-41,"xq":-41,"xt":29,"x~":-46,"x·":-46,"x±":-69,"x−":-46,"y+":-81,"y,":-79,"y-":-81,"y.":-79,"y/":-116,"y=":-81,"yA":-139,"yB":5,"yD":5,"yE":5,"yF":5,"yH":5,"yI":5,"yJ":-128,"yK":5,"yL":5,"yM":5,"yN":5,"yP":5,"yR":5,"yT":-69,"yY":-69,"ya":-20,"yb":5,"yc":-37,"yd":-37,"ye":-37,"yf":30,"yg":-37,"yh":5,"yk":5,"yl":5,"yo":-37,"yq":-37,"yt":35,"y|":5,"y~":-81,"y·":-81,"y±":-81,"y−":-81,"zT":-69,"zc":-41,"zd":-41,"ze":-41,"zg":-41,"zo":-41,"zq":-41,"{B":37,"{D":37,"{E":37,"{F":37,"{H":37,"{I":37,"{K":37,"{L":37,"{M":37,"{N":37,"{P":37,"{R":37,"{b":37,"{c":-11,"{d":-11,"{e":-11,"{g":-11,"{h":37,"{j":27,"{k":37,"{l":37,"{m":37,"{n":37,"{o":-11,"{p":37,"{q":-11,"{r":37,"|t":30,"|v":21,"|y":21,"~A":-69,"~J":-93,"~T":-157,"~V":-92,"~W":-48,"~Y":-131,"~x":-46,"·A":-69,"·J":-93,"·W":-48,"·x":-46,"•A":-69,"•T":-69,"•V":-81,"•X":-93,"•Y":-93,"…C":-90,"…G":-90,"…O":-90,"…Q":-90,"…T":-69,"…Y":-132,"°A":-194,"°C":-35,"°G":-35,"°J":-197,"°O":-35,"°Q":-35,"×A":-69,"×V":-81,"×X":-93,"×Y":-93,"±A":-104,"±T":-93,"±V":-139,"±W":-128,"±X":-104,"±Y":-197,"±v":-81,"±x":-69,"±y":-81,"−A":-69,"−J":-93,"−T":-157,"−V":-92,"−W":-48,"−X":-82,"−Y":-131,"−x":-46,"©A":-86,"©T":-65,"©V":-82,"©W":-50,"©X":-108,"©Y":-88,"’A":-280,"’C":-116,"’G":-116,"’J":-256,"’O":-116,"’Q":-116,"’a":-116,"’c":-128,"’d":-128,"’e":-128,"’g":-128,"’m":-58,"’n":-58,"’o":-128,"’p":-58,"’q":-128,"’r":-58,"’s":-141,"’t":13,"’u":-81,"’v":13,"’y":13,"‘A":-197,"‘J":-302,"‘c":-80,"‘d":-80,"‘e":-80,"‘g":-80,"‘o":-80,"‘q":-80,"‘s":-35,"“A":-197,"“J":-302,"“c":-80,"“d":-80,"“e":-80,"“g":-80,"“o":-80,"“q":-80,"“s":-35,"”A":-280,"”C":-116,"”G":-116,"”J":-256,"”O":-116,"”Q":-116,"”a":-116,"”c":-128,"”d":-128,"”e":-128,"”g":-128,"”m":-58,"”n":-58,"”o":-128,"”p":-58,"”q":-128,"”r":-58,"”s":-141,"”t":13,"”u":-81,"”v":13,"”y":13,"0_":-93,"6_":-93,"7&":-93,"7#":-116,"7<":-186,"7_":-325,"9_":-93,"&\\":-128,"&‘":-186,"&'":-69,"&\"":-69,"&“":-186,"@_":-81,"\\‘":-87,"\\’":-116,"\\“":-87,"\\”":-116,"‘&":-128,"’&":-139,"’#":-256,"’<":-197,"’~":-93,"’_":-81,"'&":-69,"\"&":-69,"“&":-128,"”&":-139,"”#":-256,"”<":-197,"”~":-93,"”_":-81,"·\\":-81,">7":-151,">\\":-151,">‘":-197,">“":-197,"_0":-93,"_1":-221,"_3":-93,"_4":-116,"_5":-93,"_6":-93,"_8":-93,"_9":-93,"_@":-81,"_\\":-162,"_‘":-81,"_“":-81,"_^":-139,"_*":-139,"_©":-81,"_°":-139,"^&":-69,"^_":-139,"*&":-69,"*_":-139,"©_":-81,"°&":-69,"°_":-139,"%‘":-128,"%’":-139,"%“":-128,"%”":-139,"1_":37,"5,":-47,"5.":-47,"5…":-47,"5^":-11,"5*":-11,"5°":-11,"6,":-61,"6.":-61,"6…":-61,"|_":37,"\\\\":-100,"\\<":-78,",5":-13,",9":-26,",!":-25,", ":-63,".5":-13,".9":-26,".!":-25,". ":-63,"…5":-13,"…9":-26,"…!":-25,"… ":-63,"_|":69,"\",":-184,"\".":-184,"\"4":-128,"\"…":-184,"',":-184,"'.":-184,"'4":-128,"'…":-184,"(|":37,")‘":-69,")“":-69,"*,":-279,"*.":-279,"*4":-93,"*@":-35,"*…":-279,"*©":-35,"+2":-44,"+3":-11,"+7":-58,"+\\":-92,"+‘":-59,"+“":-59,",\"":-203,",'":-203,",0":-60,",1":-185,",3":-47,",6":-60,",7":-52,",8":-58,",?":-180,",@":-90,",©":-90,",’":-194,",”":-194,"-2":-44,"-3":-11,"-7":-58,"-\\":-92,"-‘":-59,"-“":-59,".\"":-203,".'":-203,".0":-60,".1":-185,".3":-47,".6":-60,".7":-52,".8":-58,".?":-180,".@":-90,".©":-90,".’":-194,".”":-194,"/,":-81,"/.":-81,"/\\":16,"/…":-81,"0,":-60,"0.":-60,"07":-40,"0\\":-52,"0…":-60,"0‘":-93,"0“":-93,"1)":37,"1]":37,"1}":37,"3*":-14,"3,":-43,"3.":-43,"3^":-14,"3…":-43,"3°":-14,"4*":-72,"4,":-69,"4.":-69,"4^":-72,"4…":-69,"4°":-72,"7,":-256,"7.":-256,"7:":-69,"7;":-69,"7…":-256,"8*":-14,"8,":-43,"8.":-43,"8^":-14,"8…":-43,"8°":-14,"9,":-60,"9.":-60,"9\\":-52,"9…":-60,"9‘":-93,"9“":-93,":\\":-128,":‘":-93,":“":-93,";\\":-128,";‘":-93,";“":-93,"=\\":-139,"=‘":-116,"=“":-116,"@,":-90,"@.":-90,"@/":-81,"@\\":-82,"@…":-90,"@‘":-69,"@“":-69,"[|":37,"\\\"":-162,"\\$":-31,"\\'":-162,"\\*":-194,"\\+":-69,"\\-":-69,"\\/":24,"\\1":-102,"\\=":-104,"\\?":-128,"\\@":-86,"\\^":-194,"\\~":-69,"\\·":-69,"\\•":-69,"\\°":-194,"\\×":-69,"\\±":-104,"\\−":-69,"\\©":-86,"]‘":-69,"]“":-69,"^,":-279,"^.":-279,"^4":-93,"^@":-35,"^…":-279,"^©":-35,"{|":37,"|)":37,"|]":37,"|}":37,"}‘":-69,"}“":-69,"~2":-44,"~3":-11,"~7":-58,"~\\":-92,"~‘":-59,"~“":-59,"·2":-44,"·3":-11,"·7":-58,"·‘":-59,"·“":-59,"•\\":-81,"…\"":-203,"…'":-203,"…0":-60,"…1":-185,"…3":-47,"…6":-60,"…7":-52,"…8":-58,"…?":-180,"…@":-90,"…©":-90,"…’":-194,"…”":-194,"°,":-279,"°.":-279,"°4":-93,"°@":-35,"°…":-279,"°©":-35,"×\\":-81,"±\\":-139,"±‘":-116,"±“":-116,"−2":-44,"−3":-11,"−7":-58,"−\\":-92,"−‘":-59,"−“":-59,"©,":-90,"©.":-90,"©/":-81,"©\\":-82,"©…":-90,"©‘":-69,"©“":-69,"’+":-109,"’,":-265,"’-":-109,"’.":-265,"’/":-290,"’0":-93,"’4":-197,"’6":-93,"’7":-128,"’8":-81,"’:":-116,"’;":-116,"’=":-116,"’@":-116,"’·":-109,"’…":-265,"’±":-116,"’−":-109,"’©":-116,"‘,":-218,"‘.":-218,"‘/":-197,"‘4":-128,"‘…":-218,"“,":-218,"“.":-218,"“/":-197,"“4":-128,"“…":-218,"”+":-109,"”,":-265,"”-":-109,"”.":-265,"”/":-290,"”0":-93,"”4":-197,"”6":-93,"”7":-128,"”8":-81,"”:":-116,"”;":-116,"”=":-116,"”@":-116,"”·":-109,"”…":-265,"”±":-116,"”−":-109,"”©":-116},
};
};
__d[9] = function (__ns) {
const { default: inter400 } = __m(6);
const { default: inter600 } = __m(7);
const { default: inter700 } = __m(8);
__e(__ns, { "FACES": () => FACES }, [], ["FACES"]);
const FACES = { 400: inter400, 600: inter600, 700: inter700 };
};
__d[10] = function (__ns) {
const { FACES: SOURCES } = __m(9);
__e(__ns, { "face": () => face, "faceFor": () => faceFor, "FONT_WEIGHTS": () => FONT_WEIGHTS }, [], ["FONT_WEIGHTS","face","faceFor"]);
const REAL = Object.keys(SOURCES).map(Number).sort((a, b) => a - b);
const OPS = { M: 0, L: 1, Q: 2, Z: 3 };
const faces = new Map();
function parse(cmds) {
const t = cmds.split(' ').filter(Boolean);
const ops = [], xs = [];
for (let i = 0; i < t.length;) {
const op = OPS[t[i++]];
ops.push(op);
const n = op === 2 ? 4 : op === 3 ? 0 : 2;
for (let k = 0; k < n; k++) xs.push(+t[i++]);
}
return { ops: Uint8Array.from(ops), xs: Float32Array.from(xs) };
}
function symbols(f, stem) {
const cap = f.capHeight, x = f.xHeight;
const poly = (pts) => {
let area = 0;
for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
const ring = area > 0 ? [...pts].reverse() : pts;
return `M ${ring.map(([a, b]) => `${Math.round(a)} ${Math.round(b)}`).join(' L ')} Z`;
};
const mid = cap * 0.5, half = stem / 2;
const W = Math.round(cap * 1.05);
const head = cap * 0.34, wing = cap * 0.3;
const arrowR = [[60, mid - half], [W - 60 - head, mid - half], [W - 60 - head, mid - wing], [W - 60, mid], [W - 60 - head, mid + wing], [W - 60 - head, mid + half], [60, mid + half]];
const arrowL = arrowR.map(([a, b]) => [W - a, b]);
const disc = Array.from({ length: 24 }, (_, i) => [cap * 0.4 + cap * 0.32 * Math.cos((i / 24) * Math.PI * 2), mid + cap * 0.32 * Math.sin((i / 24) * Math.PI * 2)]);
const up = [[80, 0], [W - 80, 0], [W / 2, cap * 0.78]];
const down = [[80, cap * 0.78], [W - 80, cap * 0.78], [W / 2, 0]];
const check = [[70, mid], [70 + stem * 0.9, mid + stem * 0.6], [W * 0.38, stem * 1.3], [W - 70 - stem * 0.6, cap * 0.86], [W - 70, cap * 0.86 - stem * 0.9], [W * 0.38, 0]];
const lw = Math.round(x * 1.08), top = cap * 1.02, s = stem * 1.15;
const main = [[lw * 0.1, top], [lw * 0.1 + s, top], [lw * 0.95, 0], [lw * 0.95 - s, 0]];
const mx = lerp2(lw * 0.1 + s / 2, lw * 0.95 - s / 2, 0.42), my = top * 0.58;
const leg = [[mx - s * 0.55, my], [mx + s * 0.45, my - s * 0.4], [lw * 0.05 + s, 0], [lw * 0.05, 0]];
return {
'→': [W, poly(arrowR)],
'←': [W, poly(arrowL)],
'▲': [W, poly(up)],
'▼': [W, poly(down)],
'●': [Math.round(cap * 0.8), poly(disc)],
'✓': [W, poly(check)],
'λ': [lw, `${poly(main)} ${poly(leg)}`],
};
}
const lerp2 = (a, b, t) => a + (b - a) * t;
function face(weight = 600) {
const real = REAL.reduce((best, w) => (w <= weight + 49 ? w : best), REAL[0]);
if (faces.has(real)) return faces.get(real);
const f = SOURCES[real];
const glyphs = new Map();
for (const [ch, [adv, cmds]] of Object.entries(f.chars)) glyphs.set(ch, { adv, ...parse(cmds) });
const stem = f.unitsPerEm * (0.082 + (Math.min(700, real) - 400) / 300 * 0.034);
for (const [ch, [adv, cmds]] of Object.entries(symbols(f, stem))) if (!glyphs.has(ch)) glyphs.set(ch, { adv, ...parse(cmds) });
const prepared = { weight: real, upm: f.unitsPerEm, ascender: f.ascender, descender: f.descender, capHeight: f.capHeight, xHeight: f.xHeight, glyphs, kern: new Map(Object.entries(f.kern)) };
prepared.figure = Math.max(...'0123456789'.split('').map((d) => glyphs.get(d)?.adv || 0));
faces.set(real, prepared);
return prepared;
}
function faceFor(weight = 600) {
const w = Math.max(100, Math.min(900, +weight || 600));
const f = face(w);
return { face: f, embolden: w > f.weight + 25 ? 0.024 * ((w - f.weight) / 100) : 0 };
}
const FONT_WEIGHTS = REAL;
};
__d[11] = function (__ns) {
const { faceFor } = __m(10);
const { n, attrs } = __m(5);
__e(__ns, { "layout": () => layout, "measureText": () => measureText, "textOutline": () => textOutline, "textPath": () => textPath, "ellipsize": () => ellipsize, "fitText": () => fitText, "wrapText": () => wrapText, "capHeight": () => capHeight, "xHeight": () => xHeight, "compact": () => compact, "pad2": () => pad2, "clockText": () => clockText }, [], ["capHeight","clockText","compact","ellipsize","fitText","layout","measureText","pad2","textOutline","textPath","wrapText","xHeight"]);
const memo = new Map();
const MEMO_MAX = 600;
const remember = (k, v) => { if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value); memo.set(k, v); return v; };
const upper = (s) => s.replace(/[a-z]/g, (c) => c.toUpperCase());
function layout(str, { size = 16, weight = 600, tracking = 0, tabular = false, caps = false, kerning = true } = {}) {
const { face, embolden } = faceFor(weight);
const s = caps ? upper(String(str ?? '')) : String(str ?? '');
const scale = size / face.upm;
const items = [];
let x = 0, prev = null;
const space = face.glyphs.get(' ');
for (const ch of s) {
let g = face.glyphs.get(ch) || face.glyphs.get(ch.normalize('NFD')[0]) || null;
if (kerning && prev) x += (face.kern.get(prev + ch) || 0) * scale;
let adv, dx = 0;
if (!g) { g = null; adv = (space?.adv || face.upm * 0.28) * scale; }
else if (tabular && ch >= '0' && ch <= '9') { adv = face.figure * scale; dx = (face.figure - g.adv) * scale / 2; }
else adv = g.adv * scale;
if (g) items.push({ g, x: x + dx });
x += adv + tracking * size + embolden * size;
prev = ch;
}
if (s.length) x -= tracking * size + embolden * size;
return { face, scale, embolden, width: Math.max(0, x), items, size };
}
const measureText = (str, opts = {}) => layout(str, opts).width;
function pathData(L, decimals) {
const { scale } = L;
let d = '';
const f = (v) => n(v, decimals);
for (const { g, x } of L.items) {
const { ops, xs } = g;
let k = 0;
for (let i = 0; i < ops.length; i++) {
switch (ops[i]) {
case 0: d += `M${f(x + xs[k] * scale)} ${f(-xs[k + 1] * scale)}`; k += 2; break;
case 1: d += `L${f(x + xs[k] * scale)} ${f(-xs[k + 1] * scale)}`; k += 2; break;
case 2: d += `Q${f(x + xs[k] * scale)} ${f(-xs[k + 1] * scale)} ${f(x + xs[k + 2] * scale)} ${f(-xs[k + 3] * scale)}`; k += 4; break;
default: d += 'Z';
}
}
}
return d;
}
function textOutline(str, opts = {}) {
const size = opts.size ?? 16;
const decimals = opts.decimals ?? (size < 14 ? 2 : 1);
const key = `${str}\u0000${size}|${opts.weight ?? 600}|${opts.tracking || 0}|${opts.tabular ? 1 : 0}|${opts.caps ? 1 : 0}|${opts.kerning === false ? 0 : 1}|${decimals}`;
const hit = memo.get(key);
if (hit) return hit;
const L = layout(str, opts);
return remember(key, { d: pathData(L, decimals), width: L.width, size, embolden: L.embolden * size });
}
function textPath(str, { x = 0, y = 0, size = 16, anchor = 'start', maxWidth, minSize, fill = '#ffffff', fillOpacity, opacity, stroke, strokeWidth, ...opts } = {}) {
let s = String(str ?? ''), px = size;
if (!s) return '';
if (maxWidth) { const fit = fitText(s, { maxWidth, size, minSize: minSize ?? size * 0.75, ...opts }); s = fit.text; px = fit.size; }
const o = textOutline(s, { ...opts, size: px });
if (!o.d) return '';
const x0 = anchor === 'middle' ? x - o.width / 2 : anchor === 'end' ? x - o.width : x;
const bold = o.embolden > 0.01 ? { stroke: stroke ?? fill, strokeWidth: strokeWidth ?? o.embolden, strokeLinejoin: 'round', strokeOpacity: stroke ? undefined : fillOpacity } : stroke ? { stroke, strokeWidth } : null;
return `<path${attrs({ transform: `translate(${n(x0)} ${n(y)})`, d: o.d, fill, fillOpacity, opacity, ...bold })}/>`;
}
function ellipsize(str, maxWidth, opts) {
const s = String(str);
if (measureText(s, opts) <= maxWidth) return s;
const chars = [...s];
for (let k = chars.length - 1; k > 0; k--) {
const t = chars.slice(0, k).join('').trimEnd() + '…';
if (measureText(t, opts) <= maxWidth) return t;
}
return '…';
}
function fitText(str, { maxWidth, size, minSize = size * 0.75, ...opts }) {
const s = String(str ?? '');
const full = measureText(s, { ...opts, size });
if (full <= maxWidth) return { text: s, size, width: full, truncated: false };
let px = Math.max(minSize, Math.floor((size * maxWidth / full) * 2) / 2);
while (px > minSize && measureText(s, { ...opts, size: px }) > maxWidth) px -= 0.5;
if (measureText(s, { ...opts, size: px }) <= maxWidth) return { text: s, size: px, width: measureText(s, { ...opts, size: px }), truncated: false };
const text = ellipsize(s, maxWidth, { ...opts, size: minSize });
return { text, size: minSize, width: measureText(text, { ...opts, size: minSize }), truncated: text !== s };
}
function wrapText(str, { maxWidth, size, minSize = size * 0.8, maxLines = 2, lineHeight = 1.14, ...opts }) {
const words = String(str ?? '').trim().split(/\s+/).filter(Boolean);
const lay = (px) => {
const lines = [];
let cur = '';
for (const w of words) {
const next = cur ? `${cur} ${w}` : w;
if (!cur || measureText(next, { ...opts, size: px }) <= maxWidth) cur = next;
else { lines.push(cur); cur = w; }
}
if (cur) lines.push(cur);
return lines;
};
for (let px = size; px >= minSize - 1e-6; px -= 0.5) {
const lines = lay(px);
if (lines.length <= maxLines && lines.every((l) => measureText(l, { ...opts, size: px }) <= maxWidth)) return { lines, size: px, lineHeight: px * lineHeight };
}
const lines = lay(minSize);
const kept = lines.slice(0, maxLines);
if (lines.length > maxLines) kept[maxLines - 1] = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`;
return { lines: kept.map((l) => ellipsize(l, maxWidth, { ...opts, size: minSize })), size: minSize, lineHeight: minSize * lineHeight };
}
const capHeight = (size, weight = 600) => { const { face } = faceFor(weight); return (face.capHeight / face.upm) * size; };
const xHeight = (size, weight = 600) => { const { face } = faceFor(weight); return (face.xHeight / face.upm) * size; };
function compact(v, { digits = 1, unit = '' } = {}) {
const a = Math.abs(v);
const f = (x, s) => `${+x.toFixed(x < 10 ? digits : 0)}${s}${unit}`;
if (a >= 1e9) return f(v / 1e9, 'G');
if (a >= 1e6) return f(v / 1e6, 'M');
if (a >= 1e4) return f(v / 1e3, 'k');
return `${Number.isInteger(v) ? v : +v.toFixed(digits)}${unit}`;
}
const pad2 = (v) => String(Math.floor(Math.abs(v))).padStart(2, '0');
function clockText(sec) {
const s = Math.max(0, Math.floor(sec));
const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`;
}
};
__d[12] = function (__ns) {

__e(__ns, { "clamp": () => clamp, "lerp": () => lerp, "invLerp": () => invLerp, "remap": () => remap, "smoothstep": () => smoothstep, "linear": () => linear, "inQuad": () => inQuad, "outQuad": () => outQuad, "inOutQuad": () => inOutQuad, "inCubic": () => inCubic, "outCubic": () => outCubic, "inOutCubic": () => inOutCubic, "outQuart": () => outQuart, "inExpo": () => inExpo, "outExpo": () => outExpo, "inOutExpo": () => inOutExpo, "outBack": () => outBack, "inOutSine": () => inOutSine, "outElastic": () => outElastic, "spring": () => spring, "phase": () => phase, "pingpong": () => pingpong, "pulse": () => pulse, "arrive": () => arrive, "wrap360": () => wrap360 }, [], ["arrive","clamp","inCubic","inExpo","inOutCubic","inOutExpo","inOutQuad","inOutSine","inQuad","invLerp","lerp","linear","outBack","outCubic","outElastic","outExpo","outQuad","outQuart","phase","pingpong","pulse","remap","smoothstep","spring","wrap360"]);
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, clamp(invLerp(a0, a1, v)));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const linear = (t) => t;
const inQuad = (t) => t * t;
const outQuad = (t) => 1 - (1 - t) * (1 - t);
const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const inCubic = (t) => t * t * t;
const outCubic = (t) => 1 - (1 - t) ** 3;
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outQuart = (t) => 1 - (1 - t) ** 4;
const inExpo = (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10));
const outExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const inOutExpo = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2);
const outBack = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const outElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
function spring(t, { stiffness = 170, damping = 18 } = {}) {
if (t <= 0) return 0;
const w0 = Math.sqrt(stiffness), zeta = damping / (2 * w0);
if (zeta >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
const wd = w0 * Math.sqrt(1 - zeta * zeta);
return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}
const phase = (t, period) => { const p = (t / period) % 1; return p < 0 ? p + 1 : p; };
const pingpong = (t, period = 1) => { const p = phase(t, period) * 2; return p <= 1 ? p : 2 - p; };
const pulse = (t, period = 1) => 0.5 - 0.5 * Math.cos(phase(t, period) * Math.PI * 2);
const arrive = (since, dur = 0.36, ease = outExpo) => ease(clamp(since / dur));
const wrap360 = (a) => ((a % 360) + 360) % 360;
};
__d[13] = function (__ns) {

__e(__ns, { "parsePath": () => parsePath, "arcBounds": () => arcBounds, "flattenPath": () => flattenPath, "pathBounds": () => pathBounds, "insidePolys": () => insidePolys, "distToPolys": () => distToPolys, "transformPath": () => transformPath }, [], ["arcBounds","distToPolys","flattenPath","insidePolys","parsePath","pathBounds","transformPath"]);
const RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
function parsePath(d) {
const toks = [];
const raw = [];
for (const m of String(d).matchAll(RE)) { toks.push(m[1] || +m[2]); raw.push(m[2] ?? null); }
const out = [];
let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
const num = () => { const v = toks[i++]; if (typeof v !== 'number') throw new Error(`parsePath: expected number in "${String(d).slice(0, 40)}"`); return v; };
const flag = () => {
const r = raw[i];
if (r !== '0' && r !== '1') throw new Error(`parsePath: arc flags must be 0 or 1, space-separated, in "${String(d).slice(0, 40)}"`);
i++;
return +r;
};
while (i < toks.length) {
if (typeof toks[i] === 'string') cmd = toks[i++];
else if (!cmd) throw new Error('parsePath: path must start with a command');
const rel = cmd === cmd.toLowerCase();
const C = cmd.toUpperCase();
const ox = rel ? x : 0, oy = rel ? y : 0;
switch (C) {
case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; out.push({ c: 'M', v: [x, y] }); cmd = rel ? 'l' : 'L'; lc = lq = null; break;
case 'L': x = ox + num(); y = oy + num(); out.push({ c: 'L', v: [x, y] }); lc = lq = null; break;
case 'H': x = (rel ? x : 0) + num(); out.push({ c: 'L', v: [x, y] }); lc = lq = null; break;
case 'V': y = (rel ? y : 0) + num(); out.push({ c: 'L', v: [x, y] }); lc = lq = null; break;
case 'C': { const v = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; out.push({ c: 'C', v }); lc = [v[2], v[3]]; lq = null; x = v[4]; y = v[5]; break; }
case 'S': { const c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const v = [c1[0], c1[1], ox + num(), oy + num(), ox + num(), oy + num()]; out.push({ c: 'C', v }); lc = [v[2], v[3]]; lq = null; x = v[4]; y = v[5]; break; }
case 'Q': { const v = [ox + num(), oy + num(), ox + num(), oy + num()]; out.push({ c: 'Q', v }); lq = [v[0], v[1]]; lc = null; x = v[2]; y = v[3]; break; }
case 'T': { const c1 = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; const v = [c1[0], c1[1], ox + num(), oy + num()]; out.push({ c: 'Q', v }); lq = [v[0], v[1]]; lc = null; x = v[2]; y = v[3]; break; }
case 'A': { const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(); const ex = ox + num(), ey = oy + num(); out.push({ c: 'A', v: [x, y, rx, ry, rot, large, sweep, ex, ey] }); x = ex; y = ey; lc = lq = null; break; }
case 'Z': out.push({ c: 'Z', v: [] }); x = sx; y = sy; lc = lq = null; break;
default: throw new Error(`parsePath: unknown command ${cmd}`);
}
}
return out;
}
function arcCenter(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
if (!rx || !ry || (x1 === x2 && y1 === y2)) return null;
rx = Math.abs(rx); ry = Math.abs(ry);
const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
const sign = fa === fs ? -1 : 1;
const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
if (!fs && dt > 0) dt -= Math.PI * 2; else if (fs && dt < 0) dt += Math.PI * 2;
return { cx, cy, rx, ry, c, s, t1, dt };
}
function arcBounds(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
const pts = [[x1, y1], [x2, y2]];
const A = arcCenter(x1, y1, rx, ry, phi, fa, fs, x2, y2);
if (A) {
const { cx, cy, c, s, t1, dt } = A;
const at = (t) => [cx + A.rx * Math.cos(t) * c - A.ry * Math.sin(t) * s, cy + A.rx * Math.cos(t) * s + A.ry * Math.sin(t) * c];
const tx = Math.atan2(-A.ry * s, A.rx * c), ty = Math.atan2(A.ry * c, A.rx * s);
const lo = Math.min(t1, t1 + dt), hi = Math.max(t1, t1 + dt);
for (const base of [tx, tx + Math.PI, ty, ty + Math.PI]) {
for (let k = -2; k <= 2; k++) { const t = base + k * 2 * Math.PI; if (t > lo && t < hi) pts.push(at(t)); }
}
}
let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
for (const [x, y] of pts) { if (x < X0) X0 = x; if (y < Y0) Y0 = y; if (x > X1) X1 = x; if (y > Y1) Y1 = y; }
return [X0, Y0, X1, Y1];
}
function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2, tol) {
if (!rx || !ry) return [[x2, y2]];
rx = Math.abs(rx); ry = Math.abs(ry);
const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
const sign = fa === fs ? -1 : 1;
const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
if (!fs && dt > 0) dt -= Math.PI * 2; else if (fs && dt < 0) dt += Math.PI * 2;
const steps = Math.max(2, Math.ceil(Math.abs(dt) * Math.max(rx, ry) / Math.max(0.25, tol * 4)));
const pts = [];
for (let k = 1; k <= steps; k++) { const t = t1 + (dt * k) / steps; pts.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
return pts;
}
function flattenPath(d, tol = 0.25) {
const cmds = Array.isArray(d) ? d : parsePath(d);
const out = [];
let cur = null, x = 0, y = 0;
const seg = (n0) => Math.max(1, Math.min(64, Math.ceil(n0)));
for (const { c, v } of cmds) {
if (c === 'M') { cur = { pts: [[v[0], v[1]]], closed: false }; out.push(cur); x = v[0]; y = v[1]; continue; }
if (!cur) { cur = { pts: [[x, y]], closed: false }; out.push(cur); }
if (c === 'L') { cur.pts.push([v[0], v[1]]); x = v[0]; y = v[1]; }
else if (c === 'Q') {
const n = seg(Math.sqrt(Math.hypot(v[0] - x, v[1] - y) + Math.hypot(v[2] - v[0], v[3] - v[1])) / Math.sqrt(tol));
for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.pts.push([u * u * x + 2 * u * t * v[0] + t * t * v[2], u * u * y + 2 * u * t * v[1] + t * t * v[3]]); }
x = v[2]; y = v[3];
} else if (c === 'C') {
const L = Math.hypot(v[0] - x, v[1] - y) + Math.hypot(v[2] - v[0], v[3] - v[1]) + Math.hypot(v[4] - v[2], v[5] - v[3]);
const n = seg(Math.sqrt(L / tol));
for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.pts.push([u * u * u * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4], u * u * u * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5]]); }
x = v[4]; y = v[5];
} else if (c === 'A') { for (const p of arcPoints(...v, tol)) cur.pts.push(p); x = v[7]; y = v[8]; }
else if (c === 'Z') { cur.closed = true; const [sx, sy] = cur.pts[0]; x = sx; y = sy; cur = null; }
}
return out;
}
function pathBounds(d) {
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const pl of flattenPath(d, 0.5)) for (const [x, y] of pl.pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
return x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function insidePolys(px, py, polys) {
let wind = 0;
for (const { pts } of polys) {
for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
const [xi, yi] = pts[i], [xj, yj] = pts[j];
if (yj <= py) { if (yi > py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) > 0) wind++; }
else if (yi <= py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) < 0) wind--;
}
}
return wind !== 0;
}
function distToPolys(px, py, polys) {
let best = Infinity;
for (const { pts, closed } of polys) {
const n = pts.length;
for (let i = 0; i < n - (closed ? 0 : 1); i++) {
const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
if (d < best) best = d;
}
if (n === 1) best = Math.min(best, Math.hypot(px - pts[0][0], py - pts[0][1]));
}
return best;
}
function transformPath(d, [a, b, c, dd, e, f], fmt = (v) => +v.toFixed(2)) {
const T = (x, y) => [a * x + c * y + e, b * x + dd * y + f];
let out = '';
for (const { c: k, v } of parsePath(d)) {
if (k === 'Z') { out += 'Z'; continue; }
if (k === 'A') {
const s = Math.sqrt(Math.abs(a * dd - b * c));
const [ex, ey] = T(v[7], v[8]);
out += `A${fmt(v[2] * s)} ${fmt(v[3] * s)} ${fmt(v[4])} ${v[5]} ${a * dd - b * c < 0 ? 1 - v[6] : v[6]} ${fmt(ex)} ${fmt(ey)}`;
continue;
}
const pts = [];
for (let i = 0; i < v.length; i += 2) pts.push(...T(v[i], v[i + 1]).map(fmt));
out += k + pts.join(' ');
}
return out;
}
};
__d[14] = function (__ns) {
const { oklch, hexToOklch, mix, lambdaOf } = __m(4);
const { rect, url, linearGradient, radialGradient, n, attrs } = __m(5);
const { textPath, fitText, wrapText, capHeight } = __m(11);
const { pulse, lerp, clamp, outExpo } = __m(12);
const { flattenPath, insidePolys, distToPolys, transformPath } = __m(13);
__e(__ns, { "PALETTE_KEYS": () => PALETTE_KEYS, "TONES": () => TONES, "TEXT_ROLES": () => TEXT_ROLES, "BASE_TYPE": () => BASE_TYPE, "BASE_ROLES": () => BASE_ROLES, "BASE_TONES": () => BASE_TONES, "defaultPaint": () => defaultPaint, "BEZEL_INSET": () => BEZEL_INSET, "bezelCorner": () => bezelCorner, "cornerFlag": () => cornerFlag, "helpers": () => helpers, "defineTheme": () => defineTheme, "defaultBackground": () => defaultBackground, "defaultPress": () => defaultPress, "defaultGlyphBox": () => defaultGlyphBox, "defaultText": () => defaultText }, [], ["BASE_ROLES","BASE_TONES","BASE_TYPE","BEZEL_INSET","PALETTE_KEYS","TEXT_ROLES","TONES","bezelCorner","cornerFlag","defaultBackground","defaultGlyphBox","defaultPaint","defaultPress","defaultText","defineTheme","helpers"]);
const PALETTE_KEYS = ['bg', 'surface', 'surface2', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'pos', 'info', 'warn', 'neg', 'crit'];
const TONES = ['idle', 'active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit', 'busy', 'off'];
const TEXT_ROLES = ['eyebrow', 'label', 'value', 'hero', 'caption'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE_TYPE = {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.1, color: 'muted' },
label: { size: 11, weight: 600, color: 'ink', baseline: 6.5 },
value: { size: 22, weight: 600, tabular: true, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, color: 'ink' },
caption: { size: 8.5, weight: 400, color: 'muted' },
};
const BASE_ROLES = {
line: { color: 'ink', width: 3 },
fill: { color: 'ink' },
accent: { color: 'tone', width: 3 },
dim: { color: 'muted', width: 2.5, opacity: 0.85 },
spark: { color: 'tone' },
};
const BASE_TONES = { idle: 'accent', active: 'accent', ok: 'pos', info: 'info', warn: 'warn', neg: 'neg', alert: 'neg', crit: 'crit', busy: 'muted', off: 'dim' };
function defaultBackground(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h, radius = 0 } = {}) {
const C = k.colors;
const bg = k.id('bg');
k.def(linearGradient(bg, [[0, C.surface], [1, C.surface2]]));
k.add(rect({ x, y, width: w, height: h, rx: radius || null, fill: url(bg) }));
if (tone !== 'idle' && tone !== 'off') {
const gl = k.id('tone');
const c = k.tone(tone);
k.def(radialGradient(gl, [[0, c, k.dark ? 0.28 : 0.16], [1, c, 0]], { cx: 0.5, cy: 1.05, r: 0.85 }));
k.add(rect({ x, y, width: w, height: h, fill: url(gl) }));
}
k.add(rect({ x: x + k.m.safe, y, width: w - k.m.safe * 2, height: k.m.hair, fill: C.edge || '#ffffff', fillOpacity: C.edgeOpacity ?? (k.dark ? 0.1 : 0.7) }));
}
function defaultPaint(k, prim, style) {
const op = (style.opacity ?? 1) * (prim.opacity ?? 1);
const w = (style.width ?? 3) * (prim.weight ?? 1);
const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : null;
let out = '';
if (prim.fill) {
if (style.glow) out += `<path${attrs({ d: prim.d, fill: 'none', stroke: style.color, strokeWidth: n(2 + 4 * style.glow), strokeOpacity: n(0.16 * style.glow * op, 3), strokeLinejoin: 'round' })}/>`;
out += `<path${attrs({ d: prim.d, fill: style.color, fillOpacity: op < 1 ? n(op, 3) : null, fillRule: style.fillRule || null })}/>`;
} else {
const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
if (style.glow) out += `<path${attrs({ d: prim.d, fill: 'none', stroke: style.color, strokeWidth: n(w * (1 + 2.6 * style.glow)), strokeOpacity: n(0.18 * style.glow * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
out += `<path${attrs({ d: prim.d, fill: 'none', stroke: style.color, strokeWidth: n(w), strokeOpacity: op < 1 ? n(op, 3) : null, strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
}
return out;
}
function defaultPress(k, { pressed, age }) {
const dur = 0.22;
if (!pressed && !(age < dur)) return null;
const e = pressed ? 1 : 1 - outExpo(clamp(age / dur));
const s = 1 - 0.04 * e, cx = k.w / 2, cy = k.h / 2;
return {
transform: `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})`,
under: rect({ width: k.w, height: k.h, fill: '#000000' }),
overlay: rect({ x: k.m.hair, y: k.m.hair, width: k.w - k.m.hair * 2, height: k.h - k.m.hair * 2, rx: k.m.radius, fill: 'none', stroke: k.tone(k.toneName === 'idle' ? 'active' : k.toneName), strokeWidth: k.m.line, strokeOpacity: n(0.8 * e, 3) }),
};
}
function defaultGlyphBox(k, { labeled }) {
const m = Math.min(k.w, k.h);
const size = labeled ? m * 0.56 : m * 0.72;
return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.42 : k.h / 2) - size / 2, size };
}
function defaultText(k, role, str, o = {}) {
const st = k.typeStyle(role, o);
const color = k.color(o.color ?? st.color);
const base = { size: st.size, weight: st.weight, tracking: st.tracking || 0, caps: !!st.caps, tabular: !!st.tabular, fill: color, fillOpacity: o.opacity };
const safe = k.m.text ?? k.m.safe;
const room = o.maxWidth ?? k.w - safe * 2;
const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : null;
switch (role) {
case 'eyebrow': {
const a = anchor || 'start';
const x = o.x ?? (a === 'start' ? safe : a === 'end' ? k.w - safe : k.w / 2);
return textPath(str, { ...base, x, y: o.y ?? safe + capHeight(st.size, st.weight), anchor: a, maxWidth: room, minSize: st.size * 0.85 });
}
case 'label': {
const by = o.y ?? k.h - (st.baseline ?? 6.5) * k.m.u; 
if ((o.maxLines || 1) > 1) {
const wr = wrapText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.8, maxLines: o.maxLines, weight: st.weight, tracking: st.tracking, caps: st.caps });
return wr.lines.map((ln, i) => textPath(ln, { ...base, size: wr.size, x: o.x ?? k.w / 2, y: by - (wr.lines.length - 1 - i) * wr.lineHeight, anchor: anchor || 'middle' })).join('');
}
return textPath(str, { ...base, x: o.x ?? k.w / 2, y: by, anchor: anchor || 'middle', maxWidth: room, minSize: st.size * 0.8 });
}
case 'value': case 'hero': {
const cy = o.cy ?? k.h * 0.52;
const f = fitText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.55, weight: st.weight, tracking: st.tracking, tabular: st.tabular, caps: st.caps });
return textPath(f.text, { ...base, size: f.size, x: o.x ?? k.w / 2, y: cy + capHeight(f.size, st.weight) / 2, anchor: anchor || 'middle' });
}
default:
return textPath(str, { ...base, x: o.x ?? k.w / 2, y: o.y ?? k.h - safe, anchor: anchor || 'middle', maxWidth: room, minSize: st.size * 0.85 });
}
}
const BEZEL_INSET = 0.08;
function bezelCorner(k, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
const i = Math.max(1, BEZEL_INSET * Math.min(w, h));
return { X: x + w - i, Y: y + i, i };
}
function cornerFlag(k, s, rect) {
const { X, Y } = bezelCorner(k, rect);
return [[X - s, Y], [X, Y], [X, Y + s]];
}
const helpers = {
bezelCorner,
cornerFlag,
glow(k, { cx = 0.5, cy = 1.05, r = 0.85, color, opacity = 0.3, x = 0, y = 0, w = k.w, h = k.h } = {}) {
const id = k.id('glow');
k.def(radialGradient(id, [[0, color, opacity], [0.55, color, opacity * 0.35], [1, color, 0]], { cx, cy, r }));
k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
},
beam(k, { x = k.m.safe, y = 0, w = k.w - k.m.safe * 2, h = k.m.line, colors, opacity = 1, halo = 0.16 } = {}) {
const id = k.id('beam');
const cs = colors || [k.colors.beam || '#ffffff'];
const stops = cs.length === 1 ? [[0, cs[0], 0], [0.5, cs[0], 1], [1, cs[0], 0]] : cs.map((c, i) => [i / (cs.length - 1), c, i === 0 || i === cs.length - 1 ? 0 : 1]);
k.def(linearGradient(id, stops, { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x, y, width: w, height: h, fill: url(id), fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
if (halo) k.add(rect({ x, y, width: w, height: h * 4, fill: url(id), fillOpacity: n(halo * opacity, 3) }));
},
gradient(k, { x = 0, y = 0, w = k.w, h = k.h, stops, rx, vertical = true } = {}) {
const id = k.id('grad');
k.def(linearGradient(id, stops, vertical ? {} : { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x, y, width: w, height: h, rx: rx || null, fill: url(id) }));
},
pulse: (k, period = 1.2) => pulse(k.ctx.t, period),
pixelate(k, prims, styleOf, { cells = 12, gap = 0.12, round = 0 } = {}) {
const cell = 48 / cells;
const shapes = prims.map((p) => {
const d = p.transforms.length ? p.transforms.reduceRight((acc, tf) => applyTf(acc, tf), p.d) : p.d;
const polys = flattenPath(d, 0.3);
const st = styleOf(p);
return { p, polys, st, half: ((st.width ?? 3) * (p.weight ?? 1)) / 2 };
});
let out = '';
const byColor = new Map();
for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell;
for (let i = shapes.length - 1; i >= 0; i--) {
const s = shapes[i];
const hit = s.p.fill ? insidePolys(px, py, s.polys) || distToPolys(px, py, s.polys) < cell * 0.35 : distToPolys(px, py, s.polys) <= Math.max(s.half, cell * 0.42);
if (!hit) continue;
const key = `${s.st.color}|${n((s.st.opacity ?? 1) * (s.p.opacity ?? 1), 2)}`;
if (!byColor.has(key)) byColor.set(key, '');
const g = cell * gap / 2;
byColor.set(key, byColor.get(key) + `M${n(gx * cell + g)} ${n(gy * cell + g)}h${n(cell - g * 2)}v${n(cell - g * 2)}h${n(-(cell - g * 2))}Z`);
break;
}
}
void round;
for (const [key, d] of byColor) { const [c, o] = key.split('|'); out += `<path${attrs({ d, fill: c, fillOpacity: +o < 1 ? o : null })}/>`; }
return out;
},
mix, oklch, lerp, clamp,
};
function applyTf(d, tf) {
let m = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
for (const [, fn, args] of tf.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
const v = args.trim().split(/[\s,]+/).map(Number);
if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
else { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); }
}
return transformPath(d, m);
}
function spectrumTiers(stops) {
const S = stops.map((s) => ({ h: s.h, ink: hexToOklch(s.ink), vivid: hexToOklch(s.vivid), wash: s.wash ? hexToOklch(s.wash) : null })).sort((a, b) => a.h - b.h);
return (hue, tier) => {
const h = ((hue % 360) + 360) % 360;
const i = S.findIndex((s) => s.h > h);
const hi = i < 0 ? S[0] : S[i], lo = i <= 0 ? S[S.length - 1] : S[i - 1];
const span = ((hi.h - lo.h) + 360) % 360 || 360, f = (((h - lo.h) + 360) % 360) / span;
const a = lo[tier] || lo.vivid, b = hi[tier] || hi.vivid;
return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};
}
function defineTheme(def) {
const errs = [];
if (typeof def.id !== 'string' || !KEBAB.test(def.id)) errs.push('id must be kebab-case');
if (!def.title) errs.push('title is required');
if (typeof def.description !== 'string' || def.description.length < 20 || def.description.length > 200) errs.push('description must be 20–200 characters');
const modes = def.modes || {};
const modeNames = Object.keys(modes).filter((m) => m === 'dark' || m === 'light');
if (!modeNames.length) errs.push('modes needs a dark and/or light palette');
for (const m of modeNames) for (const key of PALETTE_KEYS) if (!/^#[0-9a-f]{6}$/i.test(modes[m][key] || '')) errs.push(`modes.${m}.${key} must be #rrggbb`);
for (const [r] of Object.entries(def.roles || {})) if (!BASE_ROLES[r]) errs.push(`unknown role "${r}"`);
if (errs.length) throw new Error(`theme ${def.id || '?'}: ${errs.join('; ')}`);
const roles = Object.fromEntries(Object.keys(BASE_ROLES).map((r) => [r, { ...BASE_ROLES[r], ...(def.roles?.[r] || {}) }]));
const type = Object.fromEntries(TEXT_ROLES.map((r) => [r, { ...BASE_TYPE[r], ...(def.type?.[r] || {}) }]));
const tones = { ...BASE_TONES, ...(def.tones || {}) };
const theme = {
id: def.id, title: def.title, description: def.description, tags: def.tags || [], credits: def.credits || null,
modes: modeNames, defaultMode: modeNames.includes(def.defaultMode) ? def.defaultMode : modeNames[0],
roles, type, tones,
background: def.background || defaultBackground,
surface: def.surface || def.background || defaultBackground,
paint: def.paint || defaultPaint,
paintGlyph: def.paintGlyph || null,
press: def.press || defaultPress,
glyphBox: def.glyphBox || defaultGlyphBox,
text: def.text || defaultText,
glyphs: def.glyphs || {},
file: def.file,
resolve(mode) {
const m = modeNames.includes(mode) ? mode : this.defaultMode;
const C = { ...modes[m] };
const { l, c } = C.spectrum || (() => { const [L, Cc] = hexToOklch(C.accent); return { l: L, c: Math.max(0.09, Cc) }; })();
const tiers = C.stops ? spectrumTiers(C.stops) : null;
const spectral = (h, o = {}) => {
if (tiers && o.l === undefined && o.c === undefined) { const [L, Cc] = tiers(h, o.tier || 'vivid'); return oklch(L + (o.dl || 0), Cc, h); }
return oklch(o.l ?? (l + (o.dl || 0)), o.c ?? c, h);
};
return { mode: m, dark: m === 'dark', colors: Object.freeze(C), spectral, ink: (h) => spectral(h, { tier: 'ink' }), lambda: lambdaOf };
},
};
return Object.freeze(theme);
}
};
__d[15] = function (__ns) {
const { P, path, el, n, line: lineEl, circle } = __m(5);
const { clamp, lerp } = __m(12);
const { oklch, hexToOklch } = __m(4);
__e(__ns, { "polar": () => polar, "arcPath": () => arcPath, "sectorPath": () => sectorPath, "arc": () => arc, "ring": () => ring, "spectrumArc": () => spectrumArc, "ticks": () => ticks, "needle": () => needle, "sparkPoints": () => sparkPoints, "sparkPath": () => sparkPath, "sparkHead": () => sparkHead, "sparkline": () => sparkline, "bars": () => bars, "segments": () => segments, "hairline": () => hairline, "spectrumStops": () => spectrumStops, "glowStops": () => glowStops, "weightOf": () => weightOf }, [], ["arc","arcPath","bars","glowStops","hairline","needle","polar","ring","sectorPath","segments","sparkHead","sparkPath","sparkPoints","sparkline","spectrumArc","spectrumStops","ticks","weightOf"]);
const RAD = Math.PI / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.sin(deg * RAD), cy - r * Math.cos(deg * RAD)];
function arcPath(cx, cy, r, a0, a1) {
let span = a1 - a0;
if (Math.abs(span) < 1e-6) return '';
if (Math.abs(span) >= 359.999) {
const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a0 + 180);
return P().M(x0, y0).A(r, r, 0, 0, 1, x1, y1).A(r, r, 0, 0, 1, x0, y0).d;
}
const sweep = span > 0;
span = Math.abs(span);
const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
return P().M(x0, y0).A(r, r, 0, span > 180, sweep, x1, y1).d;
}
function sectorPath(cx, cy, r0, r1, a0, a1) {
const large = Math.abs(a1 - a0) > 180;
const [ax, ay] = polar(cx, cy, r1, a0), [bx, by] = polar(cx, cy, r1, a1);
const [cx2, cy2] = polar(cx, cy, r0, a1), [dx, dy] = polar(cx, cy, r0, a0);
return P().M(ax, ay).A(r1, r1, 0, large, true, bx, by).L(cx2, cy2).A(r0, r0, 0, large, false, dx, dy).Z().d;
}
function arc({ cx, cy, r, from, to, color, width = 4, opacity, cap = 'round', ...rest }) {
const d = arcPath(cx, cy, r, from, to);
if (!d) return '';
return path(d, { fill: 'none', stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: cap, ...rest });
}
function ring({ cx, cy, r, width = 6, from = -135, to = 135, value = 0, color, track, trackOpacity = 1, cap = 'round' }) {
const v = clamp(value);
const end = lerp(from, to, v);
return arc({ cx, cy, r, from, to, color: track, width, opacity: trackOpacity, cap })
+ (v > 0.002 ? arc({ cx, cy, r, from, to: end, color, width, cap }) : '');
}
function spectrumArc({ cx, cy, r, width = 6, from = -135, to = 135, value = 1, h0 = 300, h1 = 160, l = 0.8, c = 0.13, segments = 24, opacity }) {
const v = clamp(value);
if (v <= 0.002) return '';
const end = lerp(from, to, v);
const count = Math.max(2, Math.round(segments * v));
const step = (end - from) / count;
let out = '';
for (let i = 0; i < count; i++) {
const a0 = from + step * i, a1 = from + step * (i + 1) + (i < count - 1 ? step * 0.08 : 0);
const color = oklch(l, c, lerp(h0, h1, (i + 0.5) / count * v));
out += arc({ cx, cy, r, from: a0, to: a1, color, width, cap: 'butt', opacity });
}
const capAt = (a, k) => { const [x, y] = polar(cx, cy, r, a); return circle({ cx: x, cy: y, r: width / 2, fill: oklch(l, c, lerp(h0, h1, k * v)), fillOpacity: opacity }); };
return out + capAt(from, 0) + capAt(end, 1);
}
function ticks({ cx, cy, r, len = 4, majorLen = len * 1.8, from = -135, to = 135, count = 11, major = 5, color, width = 1, opacity, majorOpacity }) {
let d = '', dm = '';
for (let i = 0; i < count; i++) {
const a = lerp(from, to, count === 1 ? 0 : i / (count - 1));
const isMajor = major && i % major === 0;
const L = isMajor ? majorLen : len;
const [x0, y0] = polar(cx, cy, r, a), [x1, y1] = polar(cx, cy, r - L, a);
const seg = `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
if (isMajor) dm += seg; else d += seg;
}
return (d ? path(d, { stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: 'round' }) : '')
+ (dm ? path(dm, { stroke: color, strokeWidth: width * 1.4, strokeOpacity: majorOpacity ?? opacity, strokeLinecap: 'round' }) : '');
}
function needle({ cx, cy, r, angle, color, width = 3, hub = width * 1.4, tail = r * 0.14 }) {
const [tx, ty] = polar(cx, cy, r, angle);
const [bx, by] = polar(cx, cy, tail, angle + 180);
const [lx, ly] = polar(cx, cy, width / 2, angle - 90), [rx, ry] = polar(cx, cy, width / 2, angle + 90);
return path(P().M(bx, by).L(lx, ly).L(tx, ty).L(rx, ry).Z().d, { fill: color }) + circle({ cx, cy, r: hub, fill: color });
}
function sparkPoints(values, { x = 0, y = 0, w, h, shift = 0, lo = 0, hi = 1 }) {
const k = values.length;
if (k < 3) return values.map((v, i) => [x + (k > 1 ? (i / (k - 1)) * w : 0), y + h - clamp((v - lo) / (hi - lo || 1)) * h]);
const step = w / (k - 2);
const pts = values.map((v, i) => [x + (i - shift) * step, y + h - clamp((v - lo) / (hi - lo || 1)) * h]);
const cut = (a, b, X) => { const f = (X - a[0]) / (b[0] - a[0] || 1); return [X, a[1] + (b[1] - a[1]) * f]; };
if (pts[0][0] < x) pts[0] = cut(pts[0], pts[1], x);
if (pts[k - 1][0] > x + w) pts[k - 1] = cut(pts[k - 2], pts[k - 1], x + w);
return pts;
}
function sparkPath(values, opts) {
const pts = sparkPoints(values, opts);
if (pts.length < 2) return '';
const p = P().M(...pts[0]);
if (opts.smooth === false) { for (let i = 1; i < pts.length; i++) p.L(...pts[i]); return p.d; }
for (let i = 0; i < pts.length - 1; i++) {
const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
p.C(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
}
return p.d;
}
const sparkHead = (values, opts) => { const pts = sparkPoints(values, opts); return pts[pts.length - 1]; };
function sparkline(values, { x = 0, y = 0, w, h, color, width = 1.5, smooth = true, shift = 0, area, areaOpacity = 1, lo, hi }) {
const opts = { x, y, w, h, smooth, shift, lo, hi };
const d = sparkPath(values, opts);
if (!d) return '';
const pts = sparkPoints(values, opts);
const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
return (area ? path(`${d}L${n(x1)} ${n(y + h)}L${n(x0)} ${n(y + h)}Z`, { fill: area, fillOpacity: areaOpacity < 1 ? areaOpacity : null }) : '')
+ path(d, { fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' });
}
function bars(values, { x = 0, y = 0, w, h, gap = 1, radius = 0, color, minH = 0, opacity }) {
const k = values.length;
const bw = (w - gap * (k - 1)) / k;
let out = '';
values.forEach((v, i) => {
const bh = Math.max(minH, clamp(v) * h);
if (bh <= 0) return;
out += el('rect', { x: x + i * (bw + gap), y: y + h - bh, width: bw, height: bh, rx: Math.min(radius, bw / 2, bh / 2) || null, fill: typeof color === 'function' ? color(i, v) : color, fillOpacity: opacity });
});
return out;
}
function segments({ x, y, w, h, count = 10, value = 0, gap = 1.5, radius = 1, on, off, offOpacity = 0.35, vertical = false }) {
const lit = Math.round(clamp(value) * count);
const len = ((vertical ? h : w) - gap * (count - 1)) / count;
let out = '';
for (let i = 0; i < count; i++) {
const isOn = i < lit;
const color = typeof on === 'function' ? on(i, count) : on;
const a = vertical
? { x, y: y + h - (i + 1) * len - i * gap, width: w, height: len }
: { x: x + i * (len + gap), y, width: len, height: h };
out += el('rect', { ...a, rx: radius || null, fill: isOn ? color : off, fillOpacity: isOn ? null : offOpacity });
}
return out;
}
const hairline = (x1, y1, x2, y2, color, width = 1, opacity) => lineEl({ x1, y1, x2, y2, stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: 'round' });
function spectrumStops(h0, h1, { n: count = 5, l = 0.8, c = 0.13, opacity } = {}) {
return Array.from({ length: count }, (_, i) => [i / (count - 1), oklch(l, c, lerp(h0, h1, i / (count - 1))), opacity]);
}
const glowStops = (color, a = 0.6, mid = 0.35) => [[0, color, a], [mid, color, a * 0.4], [1, color, 0]];
const weightOf = (hex) => { const [L, C] = hexToOklch(hex); return { l: L, c: C }; };
};
__d[16] = function (__ns) {
const { P, n } = __m(5);
const { arcPath, polar } = __m(15);
const { textOutline } = __m(11);
__e(__ns, { "GRID": () => GRID, "SAFE": () => SAFE, "ROLES": () => ROLES, "defaultTone": () => defaultTone, "Pen": () => Pen, "defineGlyph": () => defineGlyph, "drawGlyph": () => drawGlyph }, [], ["GRID","Pen","ROLES","SAFE","defaultTone","defineGlyph","drawGlyph"]);
const GRID = 48;
const SAFE = [6, 42];
const ROLES = ['line', 'fill', 'accent', 'dim', 'spark'];
const FILLED_BY_DEFAULT = new Set(['fill', 'spark']);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function defaultTone(state) {
if (/^(on|active|live|playing|open|unlocked|connected|recording|running|focus)$/.test(state)) return 'active';
if (/^(off|muted|disabled|paused|closed|locked|disconnected|stopped|idle|ready|default)$/.test(state)) return state === 'muted' ? 'neg' : 'idle';
if (/^(ok|healthy|done|success)$/.test(state)) return 'ok';
if (/^(warn|warning|degraded)$/.test(state)) return 'warn';
if (/^(busy|syncing|loading|working)$/.test(state)) return 'busy';
if (/^(alert|error|down|failed|critical)$/.test(state)) return 'alert';
return 'idle';
}
class Pen {
constructor() { this.root = { group: true, children: [] }; this.stack = [this.root]; }
get top() { return this.stack[this.stack.length - 1]; }
_prim(d, opts = {}, closed = true) {
const role = opts.role || 'line';
if (!ROLES.includes(role)) throw new Error(`glyph: unknown role "${role}" (use ${ROLES.join(', ')})`);
const fill = opts.fill ?? (FILLED_BY_DEFAULT.has(role) && closed);
this.top.children.push({ d: String(d), role, fill, closed, weight: opts.weight ?? 1, opacity: opts.opacity ?? 1, cap: opts.cap, join: opts.join, dash: opts.dash, ...(opts.text ? { text: true } : {}) });
return this;
}
path(d, opts) { return this._prim(d, opts, /[zZ]\s*$/.test(String(d))); }
line(x1, y1, x2, y2, opts) { return this._prim(P().M(x1, y1).L(x2, y2).d, opts, false); }
polyline(pts, opts) { const p = P().M(...pts[0]); for (const q of pts.slice(1)) p.L(...q); return this._prim(p.d, opts, false); }
polygon(pts, opts) { const p = P().M(...pts[0]); for (const q of pts.slice(1)) p.L(...q); return this._prim(p.Z().d, opts, true); }
circle(cx, cy, r, opts) { return this._prim(P().M(cx + r, cy).A(r, r, 0, 0, 1, cx - r, cy).A(r, r, 0, 0, 1, cx + r, cy).Z().d, opts, true); }
ellipse(cx, cy, rx, ry, opts) { return this._prim(P().M(cx + rx, cy).A(rx, ry, 0, 0, 1, cx - rx, cy).A(rx, ry, 0, 0, 1, cx + rx, cy).Z().d, opts, true); }
rect(x, y, w, h, opts = {}) {
const r = Math.min(opts.r || 0, w / 2, h / 2);
if (!r) return this._prim(P().M(x, y).H(x + w).V(y + h).H(x).Z().d, opts, true);
return this._prim(P().M(x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).V(y + r).A(r, r, 0, 0, 1, x + r, y).Z().d, opts, true);
}
arc(cx, cy, r, a0, a1, opts) { const d = arcPath(cx, cy, r, a0, a1); return d ? this._prim(d, opts, false) : this; }
dot(x, y, r = 1.6, opts = {}) { return this.circle(x, y, r, { role: 'spark', ...opts }); }
text(str, { x = 24, y = 30, size = 12, weight = 700, anchor = 'middle', role = 'fill', tracking = 0, caps = false, tabular = false, opacity } = {}) {
const o = textOutline(str, { size, weight, tracking, caps, tabular, decimals: 2 });
if (!o.d) return this;
const x0 = anchor === 'middle' ? x - o.width / 2 : anchor === 'end' ? x - o.width : x;
return this.group({ x: x0, y }, () => this._prim(o.d, { role, fill: true, opacity, text: true }, true));
}
polar(cx, cy, r, deg) { return polar(cx, cy, r, deg); }
group(opts, fn) {
const { x = 0, y = 0, rotate = 0, scale = 1, origin = [24, 24], opacity = 1 } = opts || {};
let tf = '';
if (x || y) tf += `translate(${n(x)} ${n(y)})`;
if (rotate) tf += `rotate(${n(rotate)} ${n(origin[0])} ${n(origin[1])})`;
if (scale !== 1) tf += `translate(${n(origin[0])} ${n(origin[1])}) scale(${n(scale, 4)}) translate(${n(-origin[0])} ${n(-origin[1])})`;
const g = { group: true, transform: tf || null, opacity, children: [] };
this.top.children.push(g);
this.stack.push(g);
try { fn(this); } finally { this.stack.pop(); }
return this;
}
flat() {
const out = [];
const walk = (node, tfs, op) => {
for (const c of node.children) {
if (c.group) walk(c, c.transform ? [...tfs, c.transform] : tfs, op * (c.opacity ?? 1));
else out.push({ ...c, transforms: tfs, opacity: op * c.opacity });
}
};
walk(this.root, [], 1);
return out;
}
}
function defineGlyph(def) {
const g = { tags: [], loop: 0, ...def };
const errs = [];
if (typeof g.id !== 'string' || !KEBAB.test(g.id)) errs.push('id must be kebab-case');
if (typeof g.title !== 'string' || !g.title) errs.push('title is required');
if (typeof g.category !== 'string' || !KEBAB.test(g.category)) errs.push('category must be kebab-case');
if (typeof g.draw !== 'function') errs.push('draw(g, s) is required');
let states = g.states || { default: 'idle' };
if (Array.isArray(states)) states = Object.fromEntries(states.map((s) => [s, defaultTone(s)]));
for (const [k, v] of Object.entries(states)) {
if (!KEBAB.test(k)) errs.push(`state "${k}" must be kebab-case`);
if (!['idle', 'active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit', 'busy', 'off'].includes(v)) errs.push(`state "${k}" has unknown tone "${v}"`);
}
if (errs.length) throw new Error(`glyph ${g.id || '?'}: ${errs.join('; ')}`);
const stateNames = Object.keys(states);
return Object.freeze({ ...g, states: Object.freeze(states), stateNames, defaultState: g.defaultState && states[g.defaultState] ? g.defaultState : stateNames[0], tags: [...new Set(g.tags.map((t) => String(t).toLowerCase()))] });
}
function drawGlyph(glyph, s = {}, override) {
const pen = new Pen();
const state = s.state && glyph.states[s.state] ? s.state : glyph.defaultState;
const t = s.t || 0;
const scope = {
state, tone: glyph.states[state], t, since: s.since ?? t, pressed: !!s.pressed, pressAge: s.pressAge ?? Infinity,
value: s.value ?? 0.5, level: s.level ?? s.value ?? 0.5, params: s.params || {},
phase: (period = glyph.loop || 1) => { const p = (t / period) % 1; return p < 0 ? p + 1 : p; },
};
(override || glyph.draw)(pen, scope);
return { pen, scope };
}
};
__d[17] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const XS = [11, 17.5, 24, 30.5, 37];
const FLOOR = 37, MIN = 3, MAX = 23;
const REST = [0.5, 0.32, 0.22, 0.32, 0.5];
const PH = [0.1, 0.62, 0.35, 0.83, 0.47], PH2 = [0.7, 0.2, 0.9, 0.4, 0.05];
const TAU = Math.PI * 2;
function live(i, t, level) {
const v = 0.52 + 0.3 * Math.sin(TAU * (t / 1.2 + PH[i])) + 0.18 * Math.sin(TAU * (t / 0.8 + PH2[i])) + 0.12 * Math.sin(TAU * (t / 2.4 + PH[4 - i]));
return clamp(v * (0.45 + 0.75 * level));
}
function peak(i, t, level) {
let p = 0;
for (let j = 0; j <= 14; j++) { const dt = j * 0.05; p = Math.max(p, live(i, t - dt, level) - 1.6 * dt * dt); }
return p;
}
const __default = defineGlyph({
id: 'equalizer',
title: 'Equalizer',
category: 'audio',
tags: ['equalizer', 'eq', 'spectrum', 'visualizer', 'bars', 'audio', 'music'],
states: { off: 'idle', on: 'active' },
loop: 2.4,
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, on ? 0.35 : 0.6);
const t0 = s.t - s.since; 
XS.forEach((x, i) => {
const from = on ? REST[i] : live(i, t0, s.level);
const to = on ? live(i, s.t, s.level) : REST[i];
const v = lerp(from, to, k);
const top = FLOOR - lerp(MIN, MAX, v);
g.line(x, FLOOR, x, top, { role: on ? 'accent' : 'line', weight: 1.35, cap: 'round' });
if (on) {
const p = lerp(REST[i], peak(i, s.t, s.level), k);
const py = Math.min(top - 3.6, FLOOR - lerp(MIN, MAX, p) - 3.6);
g.line(x - 1.4, py, x + 1.4, py, { role: 'line', weight: 0.75, opacity: k });
}
});
},
});
};
__d[18] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'headphones',
title: 'Headphones',
category: 'audio',
tags: ['headphones', 'headset', 'monitor', 'listen', 'audio', 'output'],
states: { off: 'idle', on: 'active' },
loop: 1.2,
draw(g, s) {
const on = s.state === 'on';
const k = on ? arrive(s.since, 0.45) : 1;
const sweep = lerp(24, 90, k);
g.arc(24, 26, 14.5, 360 - sweep, 360, { role: 'line' });
g.arc(24, 26, 14.5, 0, sweep, { role: 'line' });
if (k > 0.98) { g.line(9.5, 26, 9.5, 28); g.line(38.5, 26, 38.5, 28); }
const cup = (x, beat) => {
if (on) {
g.rect(x, 25.5, 9, 14, { r: 3.5, role: 'accent', fill: true, opacity: 0.7 + 0.3 * beat });
g.rect(x + 2.75, 29, 3.5, 7, { r: 1.75, role: 'line', fill: true, opacity: 0.15 + 0.55 * beat });
} else g.rect(x, 25.5, 9, 14, { r: 3.5, role: 'fill' });
};
cup(6.5, on ? pulse(s.t, 1.2) * k : 0);
cup(32.5, on ? pulse(s.t + 0.6, 1.2) * k : 0);
},
});
};
__d[19] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'mic',
title: 'Microphone',
category: 'audio',
tags: ['mic', 'microphone', 'mute', 'voice', 'call', 'meeting'],
states: { on: 'active', off: 'neg' },
loop: 1.6,
draw(g, s) {
const on = s.state === 'on';
g.rect(18.5, 6, 11, 20, { r: 5.5 });
g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
g.line(24, 32.5, 24, 39);
g.line(18, 40, 30, 40);
if (on) {
const a = pulse(s.t, 1.6), b = pulse(s.t + 0.8, 1.6);
g.arc(24, 16, 13.5, 60, 120, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.85 });
g.arc(24, 16, 13.5, 240, 300, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.85 });
g.arc(24, 16, 17.5, 64, 116, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.75 });
g.arc(24, 16, 17.5, 244, 296, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.75 });
} else {
const k = arrive(s.since, 0.32); 
if (k > 0.02) g.line(10, 8, 10 + 28 * k, 8 + 32 * k, { role: 'accent', weight: 1.15 });
}
},
});
};
__d[20] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const XS = [12.5, 24, 35.5];
const PARK = [29, 17.5, 24]; 
const TOP = 9, BOT = 39;
const TAU = Math.PI * 2;
const __default = defineGlyph({
id: 'mixer',
title: 'Mixer',
category: 'audio',
tags: ['mixer', 'faders', 'channels', 'gain', 'levels', 'audio', 'sliders'],
states: { off: 'idle', on: 'active' },
loop: 4.8,
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, 0.5);
XS.forEach((x, i) => {
const ride = Math.sin(TAU * (s.t / 4.8 + i * 0.31)) * 3.2 + Math.sin(TAU * (s.t / 2.4 + i * 0.57)) * 1.4;
const y = on ? lerp(PARK[i], PARK[i] + ride, k) : PARK[i];
if (y - 4 > TOP + 0.5) g.line(x, TOP, x, y - 4, { role: 'dim' });
g.line(x, y + 4, x, BOT, { role: on ? 'accent' : 'dim', opacity: on ? lerp(0.85, 1, k) : 1 });
g.rect(x - 4.5, y - 3, 9, 6, { r: 2, role: 'fill' });
});
},
});
};
__d[21] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, lerp, smoothstep } = __m(12);
const { n } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
function head(cx, cy, rx = 5.4, ry = 4) {
const a = (-22 * Math.PI) / 180, c = Math.cos(a) * rx, sn = Math.sin(a) * rx;
return `M${n(cx + c)} ${n(cy + sn)}A${rx} ${ry} -22 0 1 ${n(cx - c)} ${n(cy - sn)}A${rx} ${ry} -22 0 1 ${n(cx + c)} ${n(cy + sn)}Z`;
}
const __default = defineGlyph({
id: 'music-note',
title: 'Music',
category: 'audio',
tags: ['music', 'note', 'song', 'audio', 'playlist', 'media'],
states: { off: 'idle', playing: 'active' },
loop: 2.4,
draw(g, s) {
const on = s.state === 'playing';
const k = arrive(s.since, 0.4);
const sway = on ? Math.sin((s.t / 1.2) * Math.PI * 2) * 3.5 * k : 0;
const bob = on ? -1.2 * pulse(s.t, 1.2) * k : 0;
g.group({ rotate: sway, origin: [24, 38], y: bob }, () => {
g.path(head(15, 33.5), { role: on ? 'accent' : 'fill', fill: true });
g.path(head(31, 30.5), { role: on ? 'accent' : 'fill', fill: true });
g.line(19.6, 32, 19.6, 13.5, { role: 'line', cap: 'butt' });
g.line(35.6, 29, 35.6, 10.5, { role: 'line', cap: 'butt' });
g.polygon([[18.3, 11.2], [36.9, 7.6], [36.9, 12.6], [18.3, 16.2]], { role: on ? 'accent' : 'fill', fill: true });
});
if (!on) return;
const u = s.phase(2.4);
const fade = smoothstep(0, 0.15, u) * (1 - smoothstep(0.55, 0.85, u));
g.dot(lerp(39, 40.5, u), lerp(16, 7.5, u), lerp(1.8, 1.1, u), { opacity: fade * k });
},
});
};
__d[22] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, clamp, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const R = [7.5, 12.5, 17.5];
const __default = defineGlyph({
id: 'volume',
title: 'Volume',
category: 'audio',
tags: ['volume', 'speaker', 'sound', 'mute', 'audio'],
states: { on: 'active', muted: 'neg' },
loop: 2,
draw(g, s) {
g.polygon([[8, 19], [15, 19], [24, 11], [24, 37], [15, 29], [8, 29]], { role: 'line', join: 'round' });
if (s.state === 'muted') {
const k = arrive(s.since, 0.3);
if (k < 0.02) return; 
g.line(30, 19, 30 + 10 * k, 19 + 10 * k, { role: 'accent' });
g.line(40, 19, 40 - 10 * k, 19 + 10 * k, { role: 'accent' });
return;
}
const lv = clamp(s.level) * 3;
const lead = Math.min(2, Math.max(0, Math.ceil(lv) - 1)); 
R.forEach((r, i) => {
const f = clamp(lv - i);
if (f <= 0) { g.arc(24, 24, r, 52, 128, { role: 'dim', opacity: 0.3 }); return; }
const breathe = i === lead ? 0.45 + 0.55 * pulse(s.t, 2) : 1;
g.arc(24, 24, r, 52, 128, { role: i === 0 ? 'line' : 'accent', opacity: lerp(0.3, 1, f) * breathe });
});
},
});
};
__d[23] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const XS = [9, 14, 19, 24, 29, 34, 39];
const REST = [2, 4, 6.5, 9, 6.5, 4, 2];
const ENV = [0.55, 0.8, 0.95, 1, 0.95, 0.8, 0.55]; 
const TAU = Math.PI * 2;
const sig = (u) => clamp(0.5 + 0.28 * Math.sin(TAU * (u * 2 + 0.1)) + 0.2 * Math.sin(TAU * (u * 5 + 0.4)) + 0.14 * Math.sin(TAU * (u * 9 + 0.75)));
const __default = defineGlyph({
id: 'waveform',
title: 'Waveform',
category: 'audio',
tags: ['waveform', 'audio', 'signal', 'voice', 'sound', 'podcast'],
states: { idle: 'idle', live: 'active' },
loop: 2.4,
draw(g, s) {
const on = s.state === 'live';
const k = on ? arrive(s.since, 0.45) : 1;
const gain = 0.4 + 0.75 * s.level;
XS.forEach((x, i) => {
const u = (i * 0.07 + s.phase(2.4)) % 1;
const a = on ? lerp(REST[i], 2 + 12.5 * sig(u) * gain * ENV[i], k) : REST[i];
g.line(x, 24 - a, x, 24 + a, { role: on ? 'accent' : 'line', weight: 1.1, cap: 'round' });
});
},
});
};
__d[24] = function (__ns) {
const { transformPath } = __m(13);
const { arrive, clamp, outExpo } = __m(12);
const { n } = __m(5);
__e(__ns, { "rot": () => rot, "mirrorX": () => mirrorX, "mirrorY": () => mirrorY, "shift": () => shift, "xf": () => xf, "xfPts": () => xfPts, "enter": () => enter, "press": () => press, "chevron": () => chevron, "capsule": () => capsule, "polyD": () => polyD }, [], ["capsule","chevron","enter","mirrorX","mirrorY","polyD","press","rot","shift","xf","xfPts"]);
const RAD = Math.PI / 180;
function rot(deg, [ox, oy] = [24, 24]) {
const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
return [c, s, -s, c, ox - c * ox + s * oy, oy - s * ox - c * oy];
}
const mirrorX = (cx = 24) => [-1, 0, 0, 1, 2 * cx, 0];
const mirrorY = (cy = 24) => [1, 0, 0, -1, 0, 2 * cy];
const shift = (dx, dy = 0) => [1, 0, 0, 1, dx, dy];
const xf = (d, m) => transformPath(String(d), m);
const xfPts = (pts, m) => pts.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
const enter = (s, dur = 0.45) => arrive(s.since, dur);
const press = (s, dur = 0.45) => (s.pressed ? 1 : s.pressAge < dur ? 1 - outExpo(clamp(s.pressAge / dur)) : 0);
function chevron([x, y], dir, arm = 7.5, half = 45) {
const back = (a) => [x - arm * Math.sin((dir + a) * RAD), y + arm * Math.cos((dir + a) * RAD)];
return [back(-half), [x, y], back(half)];
}
function capsule([x0, y0], [x1, y1], r) {
const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * r, ny = Math.cos(a) * r;
return `M${n(x0 + nx)} ${n(y0 + ny)}L${n(x1 + nx)} ${n(y1 + ny)}A${n(r)} ${n(r)} 0 0 0 ${n(x1 - nx)} ${n(y1 - ny)}L${n(x0 - nx)} ${n(y0 - ny)}A${n(r)} ${n(r)} 0 0 0 ${n(x0 + nx)} ${n(y0 + ny)}Z`;
}
const polyD = (pts, close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join('') + (close ? 'Z' : '');
};
__d[25] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'align',
title: 'Align',
category: 'build',
tags: ['align', 'surface', 'height', 'snap to ground', 'arrange', 'layout', 'build'],
draw(g, s) {
const p = press(s, 0.5);
const k1 = enter(s, 0.5), k2 = enter({ since: s.since - 0.1 }, 0.5);
g.line(7.5, 38, 40.5, 38, { role: 'accent', weight: 1.05 });
g.rect(11, 10 - lerp(3.5, 0, k1) - 2 * p, 10.5, 24, { r: 3, opacity: lerp(0.3, 1, k1) });
g.rect(26.5, 19 - lerp(3.5, 0, k2) - 2 * p, 10.5, 15, { r: 3, opacity: lerp(0.3, 1, k2) });
},
});
};
__d[26] = function (__ns) {
const { n } = __m(5);
const { arrive, clamp } = __m(12);
__e(__ns, { "quadC": () => quadC, "curve": () => curve, "roundPoly": () => roundPoly, "polyLength": () => polyLength, "partialPolyline": () => partialPolyline, "alongPolyline": () => alongPolyline, "arcHead": () => arcHead, "strike": () => strike, "bump": () => bump, "blink": () => blink, "rowSpan": () => rowSpan, "rectAround": () => rectAround }, [], ["alongPolyline","arcHead","blink","bump","curve","partialPolyline","polyLength","quadC","rectAround","roundPoly","rowSpan","strike"]);
const pt = (p) => `${n(p[0])} ${n(p[1])}`;
function quadC(p0, q, p2) {
const c1 = [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])];
const c2 = [p2[0] + (2 / 3) * (q[0] - p2[0]), p2[1] + (2 / 3) * (q[1] - p2[1])];
return `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
}
const curve = (p0, q, p2) => `M${pt(p0)}${quadC(p0, q, p2)}`;
function roundPoly(pts, r) {
const N = pts.length;
const cut = (a, b, rr) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = Math.min(rr / L, 0.5); return [a[0] + dx * k, a[1] + dy * k]; };
let d = '';
for (let i = 0; i < N; i++) {
const v = pts[i], prev = pts[(i - 1 + N) % N], next = pts[(i + 1) % N];
const rr = Array.isArray(r) ? r[i] : r;
const a = cut(v, prev, rr), b = cut(v, next, rr);
d += `${i ? 'L' : 'M'}${pt(a)}${quadC(a, v, b)}`;
}
return `${d}Z`;
}
function polyLength(pts) {
let L = 0;
for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
return L;
}
function partialPolyline(pts, k) {
const total = polyLength(pts) * clamp(k);
const out = [pts[0]];
let acc = 0;
for (let i = 1; i < pts.length; i++) {
const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
if (acc + L >= total) { const f = L ? (total - acc) / L : 0; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); return out; }
out.push(b);
acc += L;
}
return out;
}
function alongPolyline(pts, u) {
const p = partialPolyline(pts, u);
return p[p.length - 1];
}
function arcHead(cx, cy, r, deg, { size = 4.5, dir = 1, lead = 1.2 } = {}) {
const a = (deg * Math.PI) / 180;
const P = [cx + r * Math.sin(a), cy - r * Math.cos(a)];
const T = [Math.cos(a) * dir, Math.sin(a) * dir]; 
const N = [Math.sin(a), -Math.cos(a)]; 
const tip = [P[0] + T[0] * lead, P[1] + T[1] * lead];
const back = [tip[0] - T[0] * size, tip[1] - T[1] * size];
return [[back[0] + N[0] * size, back[1] + N[1] * size], tip, [back[0] - N[0] * size, back[1] - N[1] * size]];
}
function strike(g, s, { from = [10.5, 10.5], to = [37.5, 37.5], role = 'accent', weight = 1.1, dur = 0.32 } = {}) {
const k = arrive(s.since, dur);
if (k <= 0.001) return;
g.line(from[0], from[1], from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, { role, weight });
}
function bump(x, c, w, wrap = false) {
let d = Math.abs(x - c);
if (wrap) d = Math.min(d, 1 - d);
return d >= w ? 0 : 1 - d / w;
}
function blink(p, duty = 0.5, soft = 0.08) {
return p < duty ? Math.min(clamp(p / soft), clamp((duty - p) / soft)) : 0;
}
function rowSpan(poly, y) {
let lo = Infinity, hi = -Infinity;
for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
const [xi, yi] = poly[i], [xj, yj] = poly[j];
if ((yi <= y && yj >= y) || (yj <= y && yi >= y)) {
if (yi === yj) { lo = Math.min(lo, xi, xj); hi = Math.max(hi, xi, xj); continue; }
const x = xi + ((y - yi) / (yj - yi)) * (xj - xi);
lo = Math.min(lo, x); hi = Math.max(hi, x);
}
}
return lo === Infinity ? null : [lo, hi];
}
function rectAround(x0, x1, y0, y1, poly, margin = 1.4, step = 0.5) {
if (x1 - x0 < 0.05) return [];
const rows = [];
for (let y = y0; y <= y1 + 1e-6; y += step) {
let lo = Infinity, hi = -Infinity;
for (const dy of [-margin, -margin / 2, 0, margin / 2, margin]) {
const sp = rowSpan(poly, y + dy);
if (sp) { lo = Math.min(lo, sp[0] - margin); hi = Math.max(hi, sp[1] + margin); }
}
if (lo === Infinity) lo = hi = x1; 
rows.push([Math.min(y, y1), lo, hi]);
}
const out = [];
const left = rows.map(([y, lo]) => [y, Math.max(x0, Math.min(x1, lo))]);
if (left.some(([, x]) => x > x0 + 0.05)) out.push(`M${n(x0)} ${n(y0)}${left.map(([y, x]) => `L${n(x)} ${n(y)}`).join('')}L${n(x0)} ${n(y1)}Z`);
const right = rows.map(([y, , hi]) => [y, Math.min(x1, Math.max(x0, hi))]);
if (right.some(([, x]) => x < x1 - 0.05)) out.push(`M${n(x1)} ${n(y0)}${right.map(([y, x]) => `L${n(x)} ${n(y)}`).join('')}L${n(x1)} ${n(y1)}Z`);
return out;
}
};
__d[27] = function (__ns) {
const { defineGlyph } = __m(16);
const { clamp, inOutSine } = __m(12);
const { flattenPath } = __m(13);
const { enter } = __m(24);
const { partialPolyline, alongPolyline, polyLength } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const D = 'M17 37H31A11 11 0 0 0 31 15H17A11 11 0 0 0 17 37Z';
const LOOP = flattenPath(D, 0.2)[0].pts;
const BUILT = 0.72; 
function span(pts, a, b) {
const head = partialPolyline(pts, b);
const L = polyLength(pts) * a;
let acc = 0;
for (let i = 1; i < head.length; i++) {
const l = Math.hypot(head[i][0] - head[i - 1][0], head[i][1] - head[i - 1][1]);
if (acc + l >= L) { const f = l ? (L - acc) / l : 0; return [[head[i - 1][0] + (head[i][0] - head[i - 1][0]) * f, head[i - 1][1] + (head[i][1] - head[i - 1][1]) * f], ...head.slice(i)]; }
acc += l;
}
return head.slice(-1);
}
const __default = defineGlyph({
id: 'auto-complete',
title: 'Auto-Complete',
category: 'build',
tags: ['auto', 'complete', 'finish', 'auto end', 'close circuit', 'track', 'coaster', 'build'],
draw(g, s) {
const k = enter(s, 0.7);
const built = span(LOOP, 0, BUILT * k);
if (built.length > 1) g.polyline(built, { role: 'line', join: 'round' });
const rest = span(LOOP, BUILT * k, 1);
if (rest.length > 1) g.polyline(rest, { role: 'accent', dash: [2.2, 2.8], weight: 0.9 });
g.line(17, 33, 17, 41, { role: 'line', weight: 1.05 }); 
if (!s.pressed && s.pressAge < 0.9) {
const [x, y] = alongPolyline(LOOP, BUILT + (1 - BUILT) * inOutSine(clamp(s.pressAge / 0.9)));
g.dot(x, y, 2.3);
}
},
});
};
__d[28] = function (__ns) {
const { lerp, clamp, outCubic, inOutSine } = __m(12);
const { alongPolyline } = __m(26);
const { n } = __m(5);
const { xfPts, mirrorX, chevron } = __m(24);
__e(__ns, { "topTrack": () => topTrack, "straightAt": () => straightAt, "curveLeft": () => curveLeft, "sideTrack": () => sideTrack, "crossSection": () => crossSection, "horizon": () => horizon, "spiritLevel": () => spiritLevel, "arcArrow": () => arcArrow, "ride": () => ride, "mirrorX": () => mirrorX, "n": () => n }, [], ["arcArrow","crossSection","curveLeft","horizon","mirrorX","n","ride","sideTrack","spiritLevel","straightAt","topTrack"]);
const RAD = Math.PI / 180;
function topTrack(g, centerAt, length, { gauge = 12, pitch = 7.3, over = 2, run = 0, m = null, opacity = 1, ends = [1.5, 1.5] } = {}) {
const T = (pts) => (m ? xfPts(pts, m) : pts);
const off = (u, d) => { const { x, y, a } = centerAt(u); return [x + Math.cos(a) * d, y + Math.sin(a) * d]; }; 
for (const side of [-1, 1]) {
const pts = [];
for (let i = 0; i <= 48; i++) pts.push(off((i / 48) * length, side * gauge / 2));
g.polyline(T(pts), { role: 'line', join: 'round', opacity });
}
const h = gauge / 2 + over;
for (let u = (run % 1) * pitch + pitch * 0.5; u < length; u += pitch) {
if (u < ends[0] || u > length - ends[1]) continue;
const fade = Math.min(1, (u - ends[0]) / 2.5, (length - ends[1] - u) / 2.5);
g.line(...T([off(u, -h)])[0], ...T([off(u, h)])[0], { role: 'dim', weight: 0.85, opacity: opacity * Math.max(0, fade) });
}
}
const straightAt = (x, y0) => (u) => ({ x, y: y0 - u, a: 0 });
function curveLeft({ cx = 33, yb = 39, ya = 28, rc = 12, xe = 7 } = {}) {
const L1 = yb - ya, L2 = (Math.PI / 2) * rc, ox = cx - rc, oy = ya, L3 = ox - xe;
const at = (u) => {
if (u <= L1) return { x: cx, y: yb - u, a: 0 }; 
if (u <= L1 + L2) {
const th = (u - L1) / rc; 
return { x: ox + rc * Math.cos(th), y: oy - rc * Math.sin(th), a: -th };
}
return { x: ox - (u - L1 - L2), y: oy - rc, a: -Math.PI / 2 };
};
return { at, length: L1 + L2 + L3 };
}
function sideTrack(g, p0, p1, { gap = 4, opacity = 1, spine = true } = {}) {
const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
const nx = -dy / L, ny = dx / L; 
const s = ny < 0 ? -1 : 1; 
g.line(p0[0], p0[1], p1[0], p1[1], { role: 'line', weight: 1.05, opacity });
if (spine) {
g.line(p0[0] + nx * gap * s + dx / L * 2, p0[1] + ny * gap * s + dy / L * 2, p1[0] + nx * gap * s - dx / L * 2, p1[1] + ny * gap * s - dy / L * 2, { role: 'dim', opacity });
for (let i = 1; i < 4; i++) {
const f = i / 4, x = p0[0] + dx * f, y = p0[1] + dy * f;
g.line(x, y, x + nx * gap * s, y + ny * gap * s, { role: 'dim', weight: 0.75, opacity });
}
}
return Math.atan2(dx, -dy) / RAD;
}
function crossSection(g, cx, cy, deg, { half = 13, rail = 7.5, opacity = 1 } = {}) {
const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
const P = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
g.line(...P(-half, 0), ...P(half, 0), { role: 'line', weight: 1.1, opacity });
for (const u of [-rail, rail]) { const [x, y] = P(u, -3.2); g.circle(x, y, 2.3, { role: 'fill', opacity }); }
}
const horizon = (g, y, x0 = 7, x1 = 41, opacity = 1) => g.line(x0, y, x1, y, { role: 'dim', opacity });
function spiritLevel(g, cy, { k = 1, bubble = 0 } = {}) {
g.rect(13, cy - 4.5, 22, 9, { r: 4.5 });
g.line(20, cy - 4.5, 20, cy + 4.5, { role: 'dim', weight: 0.8 });
g.line(28, cy - 4.5, 28, cy + 4.5, { role: 'dim', weight: 0.8 });
g.circle(24 + bubble, cy, 2.4, { role: 'accent', fill: true, opacity: lerp(0.4, 1, k) });
}
function arcArrow(g, cx, cy, r, a0, a1, { role = 'accent', size = 4.2, weight = 1, opacity = 1 } = {}) {
if (Math.abs(a1 - a0) < 1) return;
const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
g.arc(cx, cy, r, lo, hi, { role, weight, opacity });
const dir = a1 > a0 ? 90 : -90;
const [x, y] = [cx + r * Math.sin(a1 * RAD), cy - r * Math.cos(a1 * RAD)];
g.polyline(chevron([x + Math.sin((a1 + dir) * RAD) * 1, y - Math.cos((a1 + dir) * RAD) * 1], a1 + dir, size, 48), { role, weight, join: 'round', opacity });
}
function ride(g, s, pts, dur = 1.1) {
if (s.pressed || !(s.pressAge < dur)) return;
const u = clamp(s.pressAge / dur);
const [x, y] = alongPolyline(pts, inOutSine(u));
g.dot(x, y, 2.4, { opacity: 1 - outCubic(clamp((u - 0.85) / 0.15)) });
}
};
__d[29] = function (__ns) {
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { n } = __m(5);
const { arcArrow } = __m(28);
__e(__ns, { "ball": () => ball, "drawBank": () => drawBank }, [], ["ball","drawBank"]);
const CX = 24, CY = 26.5, R = 12.5, RAD = Math.PI / 180;
function ball(g, deg, { marks = 'dim' } = {}) {
const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
const a = [CX - R * c, CY - R * s], b = [CX + R * c, CY + R * s];
g.path(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}A${R} ${R} 0 0 1 ${n(a[0])} ${n(a[1])}Z`, { role: 'dim', fill: true, opacity: 0.4 });
g.circle(CX, CY, R);
g.line(a[0], a[1], b[0], b[1], { role: 'line', weight: 1.05 });
g.polyline([[16.5, CY], [21, CY], [24, CY + 3], [27, CY], [31.5, CY]], { role: 'accent', weight: 0.9, join: 'round' });
g.line(7, CY, 10, CY, { role: marks, weight: 1.05 });
g.line(38, CY, 41, CY, { role: marks, weight: 1.05 });
}
function drawBank(g, s, side) {
const k = enter(s, 0.6), p = press(s, 0.5);
const target = side === 0 ? -20 : side * 24;
ball(g, lerp(0, target, k) + (side || -1) * 6 * p);
if (side === 0) return;
const a0 = -side * 42, a1 = side * 42;
arcArrow(g, CX, CY, 17.5, a0, lerp(a0, a1, 0.3 + 0.7 * k), { role: 'line', size: 4.4 });
}
};
__d[30] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawBank } = __m(29);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'bank-left',
title: 'Bank Left',
category: 'build',
tags: ['bank', 'left', 'roll', 'tilt', 'track', 'coaster', 'build'],
draw(g, s) { drawBank(g, s, -1); },
});
};
__d[31] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { ball } = __m(29);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'bank-level',
title: 'Level Bank',
category: 'build',
tags: ['level', 'bank', 'flat', 'reset', 'horizon', 'track', 'coaster', 'build'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.5);
ball(g, lerp(-22, 0, k) - 6 * p, { marks: k > 0.9 && p < 0.3 ? 'accent' : 'dim' });
},
});
};
__d[32] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawBank } = __m(29);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'bank-right',
title: 'Bank Right',
category: 'build',
tags: ['bank', 'right', 'roll', 'tilt', 'track', 'coaster', 'build'],
draw(g, s) { drawBank(g, s, 1); },
});
};
__d[33] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawBank } = __m(29);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'bank',
title: 'Bank',
category: 'build',
tags: ['bank', 'roll', 'tilt', 'angle', 'track', 'coaster', 'build'],
draw(g, s) { drawBank(g, s, 0); },
});
};
__d[34] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'booster',
title: 'Booster',
category: 'build',
tags: ['booster', 'boost', 'launch', 'speed', 'accelerate', 'track', 'coaster', 'build'],
draw(g, s) {
const p = press(s, 0.45);
[19.5, 28.5, 37.5].forEach((x, i) => {
const k = enter({ since: s.since - i * 0.09 }, 0.45);
const dx = lerp(-3, 0, k) + 2.2 * p;
g.polyline(chevron([x + dx, 22], 90, 12, 45), { role: i === 2 ? 'accent' : 'line', join: 'round', opacity: lerp(0, [0.45, 0.75, 1][i], k), weight: 1.05 });
});
g.line(8, 37.5, 40, 37.5, { role: 'dim' });
},
});
};
__d[35] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'brake',
title: 'Brakes',
category: 'build',
tags: ['brake', 'brakes', 'stop', 'slow', 'block', 'track', 'coaster', 'build'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const k = enter(s, 0.5), p = press(s, 0.4);
const r = lerp(17.5, on ? 14.5 : 15.5, k) - 1.2 * p;
g.circle(24, 24, 9.5);
g.circle(24, 24, 2.6, { role: 'fill' });
const role = on || p > 0.4 ? 'accent' : 'line';
g.arc(24, 24, r, 222, 318, { role, weight: 1.05 });
g.arc(24, 24, r, 42, 138, { role, weight: 1.05 });
},
});
};
__d[36] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, smoothstep } = __m(12);
const { enter, xf, xfPts, rot, capsule, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const M = rot(-45, [24, 24]); 
const STEP = 8.2; 
const FACE = [2.8, 3.8], EDGE = 5.8;
const LO = -18, HI = 12.5; 
const __default = defineGlyph({
id: 'chain-lift',
title: 'Chain Lift',
category: 'build',
tags: ['chain', 'lift', 'lift hill', 'climb', 'track', 'coaster', 'build'],
states: { off: 'idle', on: 'active' },
loop: 1.6,
draw(g, s) {
const on = s.state === 'on';
const k = enter(s, 0.6);
const run = on ? s.phase(1.6) * STEP * 2 : lerp(-STEP * 2, 0, k);
for (let i = -2; i <= 3; i++) {
const c = -11 + i * STEP + run;
const face = ((i % 2) + 2) % 2 === 0;
const half = face ? FACE[0] + FACE[1] : EDGE;
const fade = smoothstep(LO - 4, LO, c - half) * (1 - smoothstep(HI, HI + 4, c + half));
if (fade < 0.02) continue;
if (face) g.path(xf(capsule([24 + c - FACE[0], 24], [24 + c + FACE[0], 24], FACE[1]), M), { role: 'line', opacity: fade });
else { const [a, b] = xfPts([[24 + c - EDGE, 24], [24 + c + EDGE, 24]], M); g.line(a[0], a[1], b[0], b[1], { role: 'line', opacity: fade }); }
}
const [tip] = xfPts([[24 + 18.5, 24]], M);
g.polyline(chevron(tip, 45, 6.5, 45), { role: on ? 'accent' : 'line', join: 'round', weight: 1.05 });
},
});
};
__d[37] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'falloff',
title: 'Falloff',
category: 'build',
tags: ['falloff', 'fall off', 'brush', 'softness', 'hardness', 'centre', 'even', 'curve'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.45);
const top = lerp(34, 12, k) + 3 * p, base = 36;
g.path(`M7 ${base}C14 ${base} 16 ${top} 24 ${top}C32 ${top} 34 ${base} 41 ${base}`, { role: 'line' });
g.line(7, base + 2.5, 41, base + 2.5, { role: 'dim' });
g.line(24, top + 4, 24, base, { role: 'accent', dash: [2, 2.6], opacity: k });
},
});
};
__d[38] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, pulse, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HEAT = [[0.18, 0.4, 0.55], [0.4, 0.8, 1], [0.22, 0.52, 0.7]];
const X = [8.5, 19.25, 30], S = 9.5;
const __default = defineGlyph({
id: 'heatmap',
title: 'Heatmap',
category: 'build',
tags: ['heatmap', 'heat', 'map', 'overlay', 'density', 'ratings', 'view', 'build'],
states: { off: 'idle', on: 'active' },
loop: 2.4,
draw(g, s) {
const on = s.state === 'on';
HEAT.forEach((row, j) => row.forEach((h, i) => {
const k = clamp((s.since - Math.hypot(i - 2, j - 1) * 0.09) / 0.35); 
const op = lerp(0.12, h, k) * (h === 1 && on ? 0.7 + 0.3 * pulse(s.t, 2.4) : 1);
g.rect(X[i], X[j], S, S, { r: 2.5, role: h >= 0.5 ? 'accent' : 'dim', fill: true, opacity: op });
}));
},
});
};
__d[39] = function (__ns) {
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "drawLength": () => drawLength }, [], ["drawLength"]);
const Y = 31, X0 = 8, X1 = 40;
function drawLength(g, s, sign) {
const k = enter(s, 0.55), p = press(s, 0.45);
const pull = lerp(5, 0, k) - sign * 1.8 * p; 
g.line(X0, Y - 6, X0, Y + 6, { role: 'dim' });
g.line(X1, Y - 6, X1, Y + 6, { role: 'dim' });
const a = X0 + 3.5 + pull, b = X1 - 3.5 - pull;
g.line(a, Y, b, Y);
g.polyline(chevron([a, Y], 270, 5.5, 45), { join: 'round' });
g.polyline(chevron([b, Y], 90, 5.5, 45), { join: 'round' });
const role = p > 0.3 ? 'accent' : 'accent';
g.line(18, 14, 30, 14, { role, weight: 1.15, opacity: lerp(0.5, 1, k) });
if (sign > 0) g.line(24, 8, 24, 20, { role, weight: 1.15, opacity: lerp(0.5, 1, k) });
}
};
__d[40] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawLength } = __m(39);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'length-minus',
title: 'Shorter',
category: 'build',
tags: ['length', 'shorter', 'shrink', 'minus', 'size', 'track', 'path', 'build'],
draw(g, s) { drawLength(g, s, -1); },
});
};
__d[41] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawLength } = __m(39);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'length-plus',
title: 'Longer',
category: 'build',
tags: ['length', 'longer', 'extend', 'plus', 'size', 'track', 'path', 'build'],
draw(g, s) { drawLength(g, s, 1); },
});
};
__d[42] = function (__ns) {
const { defineGlyph } = __m(16);
const { flattenPath } = __m(13);
const { enter } = __m(24);
const { partialPolyline } = __m(26);
const { ride } = __m(28);
__e(__ns, { "default": () => __default }, [], ["default"]);
const D = 'M7 37.5H20C29 37.5 35 31 35 22.5C35 16 30 11 24 11C18 11 13 16 13 22.5C13 31 19 37.5 28 37.5H41';
const PTS = flattenPath(D, 0.2)[0].pts;
const __default = defineGlyph({
id: 'loop',
title: 'Loop',
category: 'build',
tags: ['loop', 'vertical loop', 'inversion', 'element', 'track', 'coaster', 'build'],
draw(g, s) {
const k = enter(s, 0.7);
const pts = k > 0.999 ? PTS : partialPolyline(PTS, k);
if (pts.length > 1) g.polyline(pts, { role: 'line', join: 'round', weight: 1.05 });
ride(g, s, PTS);
},
});
};
__d[43] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'path',
title: 'Path',
category: 'build',
tags: ['path', 'footpath', 'walkway', 'road', 'join', 'queue', 'build'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.5);
g.line(9.5, 39.5, 19.5, 8.5);
g.line(38.5, 39.5, 28.5, 8.5);
const run = (1 - k) + p;
for (let i = -1; i < 4; i++) {
const u = (i + (run % 1)) / 4; 
if (u < 0 || u > 0.92) continue;
const y0 = lerp(37, 10, u), len = lerp(6, 2.2, u);
g.line(24, y0, 24, y0 - len, { role: 'dim', opacity: Math.min(1, (0.92 - u) / 0.15) });
}
},
});
};
__d[44] = function (__ns) {
const { P } = __m(5);
const { polar } = __m(15);
__e(__ns, { "wedge": () => wedge, "smooth": () => smooth, "along": () => along, "arcPoints": () => arcPoints, "roundedPoly": () => roundedPoly, "smoothClosed": () => smoothClosed }, [], ["along","arcPoints","roundedPoly","smooth","smoothClosed","wedge"]);
const K = 2 / 3; 
function wedge(cx, cy, r, a0, a1) {
const span = a1 - a0;
if (span <= 0.25) return '';
if (span >= 359.75) return P().M(cx, cy - r).A(r, r, 0, 0, 1, cx, cy + r).A(r, r, 0, 0, 1, cx, cy - r).Z().d;
const [ax, ay] = polar(cx, cy, r, a0), [bx, by] = polar(cx, cy, r, a1);
return P().M(cx, cy).L(ax, ay).A(r, r, 0, span > 180, true, bx, by).Z().d;
}
function smooth(pts) {
const p = P().M(...pts[0]);
for (let i = 0; i < pts.length - 1; i++) {
const a = pts[i - 1] || pts[i], b = pts[i], c = pts[i + 1], d = pts[i + 2] || c;
p.C(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
}
return p.d;
}
function along(pts, u) {
const seg = [];
let total = 0;
for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
let d = Math.max(0, Math.min(1, u)) * total;
for (let i = 0; i < seg.length; i++) {
if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, d / seg[i]) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
d -= seg[i];
}
return pts[pts.length - 1];
}
function arcPoints(cx, cy, r, a0, a1, steps = 12) {
return Array.from({ length: steps + 1 }, (_, i) => polar(cx, cy, r, a0 + ((a1 - a0) * i) / steps));
}
function roundedPoly(pts, radii) {
const N = pts.length, rs = Array.isArray(radii) ? radii : pts.map(() => radii || 0);
const p = P();
const cut = (a, b, r) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = Math.min(r, l / 2) / l; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
for (let i = 0; i < N; i++) {
const prev = pts[(i + N - 1) % N], c = pts[i], next = pts[(i + 1) % N], r = rs[i];
const a = cut(c, prev, r), b = cut(c, next, r);
if (i === 0) p.M(...a); else p.L(...a);
if (r > 0.01) p.C(a[0] + (c[0] - a[0]) * K, a[1] + (c[1] - a[1]) * K, b[0] + (c[0] - b[0]) * K, b[1] + (c[1] - b[1]) * K, b[0], b[1]); 
}
return p.Z().d;
}
function smoothClosed(pts) {
const N = pts.length, p = P().M(...pts[0]);
for (let i = 0; i < N; i++) {
const a = pts[(i + N - 1) % N], b = pts[i], c = pts[(i + 1) % N], d = pts[(i + 2) % N];
p.C(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
}
return p.Z().d;
}
};
__d[45] = function (__ns) {
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
const { horizon } = __m(28);
const { wedge } = __m(44);
__e(__ns, { "drawPitch": () => drawPitch }, [], ["drawPitch"]);
const RAD = Math.PI / 180;
const L = 32;
function drawPitch(g, s, dir) {
const k = enter(s, 0.6), p = press(s, 0.5);
const up = dir >= 0;
const deg = lerp(12, 32, k) + 5 * p; 
const x0 = 8.5, y0 = up ? 34 : 14;
const x1 = x0 + L * Math.cos(deg * RAD), y1 = y0 + (up ? -1 : 1) * L * Math.sin(deg * RAD);
horizon(g, y0, x0 + 3, 40);
g.line(x0, y0, x1, y1, { role: 'line', weight: 1.1 });
const a = up ? 90 - deg : 90 + deg; 
g.path(wedge(x0, y0, 11, Math.min(90, a), Math.max(90, a)), { role: 'dim', fill: true, opacity: 0.3 });
g.arc(x0, y0, 13, Math.min(90, a), Math.max(90, a), { role: 'accent', weight: 0.95 });
if (dir !== 0) g.polyline(chevron([x1, y1], a, 6.5, 45), { role: 'line', join: 'round', weight: 1.1 });
else g.dot(x1, y1, 2.2, { role: 'fill' });
}
};
__d[46] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawPitch } = __m(45);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'pitch-down',
title: 'Pitch Down',
category: 'build',
tags: ['pitch', 'down', 'dive', 'drop', 'slope', 'track', 'coaster', 'build'],
draw(g, s) { drawPitch(g, s, -1); },
});
};
__d[47] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { spiritLevel } = __m(28);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'pitch-level',
title: 'Flatten',
category: 'build',
tags: ['flat', 'level', 'pitch', 'flatten', 'reset', 'track', 'coaster', 'build'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.5);
const lift = lerp(7, 0, k) + 2.5 * p; 
spiritLevel(g, 16.5, { k, bubble: lerp(6, 0, k) });
g.line(8.5, 32.5, 39.5, 32.5 - lift, { role: 'line', weight: 1.1 });
g.dot(8.5, 32.5, 2.2, { role: 'fill' });
g.dot(39.5, 32.5 - lift, 2.2, { role: 'fill' });
},
});
};
__d[48] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawPitch } = __m(45);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'pitch-up',
title: 'Pitch Up',
category: 'build',
tags: ['pitch', 'up', 'climb', 'slope', 'incline', 'track', 'coaster', 'build'],
draw(g, s) { drawPitch(g, s, 1); },
});
};
__d[49] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawPitch } = __m(45);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'pitch',
title: 'Pitch',
category: 'build',
tags: ['pitch', 'slope', 'incline', 'angle', 'track', 'coaster', 'build'],
draw(g, s) { drawPitch(g, s, 0); },
});
};
__d[50] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { smooth: smoothPath } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const ROUGH = [[7, 29], [10, 23.5], [13.5, 30], [17, 22.5], [20.5, 28], [24, 24.5]];
const CALM = [[7, 27], [10, 26.4], [13.5, 26], [17, 25.6], [20.5, 25.2], [24, 24.5]];
const TAIL = [[24, 24.5], [29.5, 21.8], [35, 22.6], [41, 26]];
const __default = defineGlyph({
id: 'smooth',
title: 'Smooth',
category: 'build',
tags: ['smooth', 'soften', 'flatten', 'terrain', 'sculpt', 'brush', 'build'],
draw(g, s) {
const k = enter(s, 0.7), p = press(s, 0.5);
const rough = lerp(1, 0.75, k) * (1 - 0.45 * p); 
g.polyline(ROUGH.map(([x, y], i) => [x, lerp(CALM[i][1], y, rough)]), { role: 'line', join: 'round' });
g.path(smoothPath(TAIL), { role: 'line' });
g.line(7, 37.5, 41, 37.5, { role: 'dim' });
},
});
};
__d[51] = function (__ns) {
const { defineGlyph } = __m(16);
const { enter } = __m(24);
const { partialPolyline } = __m(26);
const { ride } = __m(28);
__e(__ns, { "default": () => __default }, [], ["default"]);
const R = 2.05, DD = 7.2, YC = 23;
const PTS = (() => {
const x0 = 24 - R * 3 * Math.PI, out = [[7, YC + DD]];
for (let i = 0; i <= 120; i++) { const th = Math.PI + (4 * Math.PI * i) / 120; out.push([x0 + R * th - DD * Math.sin(th), YC - DD * Math.cos(th)]); }
out.push([41, YC + DD]);
return out;
})();
const __default = defineGlyph({
id: 'special',
title: 'Special Element',
category: 'build',
tags: ['special', 'corkscrew', 'roll', 'heartline', 'inversion', 'element', 'track', 'coaster', 'build'],
draw(g, s) {
const k = enter(s, 0.7);
const pts = k > 0.999 ? PTS : partialPolyline(PTS, k);
if (pts.length > 1) g.polyline(pts, { role: 'line', join: 'round', weight: 1.05 });
g.line(9, 37, 39, 37, { role: 'dim', opacity: k });
ride(g, s, PTS, 1.2);
},
});
};
__d[52] = function (__ns) {
const { defineGlyph } = __m(16);
const { clamp } = __m(12);
const { press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'stairs',
title: 'Stairs',
category: 'build',
tags: ['stairs', 'steps', 'staircase', 'gate', 'queue', 'climb', 'path'],
draw(g, s) {
const p = press(s, 0.4);
const pts = [[8, 39]];
for (let i = 0; i < 4; i++) {
const k = clamp((s.since - i * 0.08) / 0.3);
const x = 8 + i * 7.5, y = 39 - i * 7;
if (k <= 0.02) break;
pts.push([x, y - 7 * k], [x + 7.5 * k, y - 7 * k]);
}
if (pts.length > 1) g.polyline(pts, { role: 'line', join: 'round' });
g.line(9, 26, 27, 9.2, { role: p > 0.3 ? 'accent' : 'dim' });
},
});
};
__d[53] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CAR = 'M15.5 34.5V31.5A2.5 2.5 0 0 1 18 29H24.5L26.5 26H30A2.5 2.5 0 0 1 32.5 28.5V34.5Z';
const __default = defineGlyph({
id: 'station',
title: 'Station',
category: 'build',
tags: ['station', 'platform', 'queue', 'dispatch', 'entrance', 'ride', 'coaster', 'build'],
draw(g, s) {
const k = enter(s, 0.7), p = press(s, 0.5);
g.path('M8 17L12.5 10.5H35.5L40 17Z', { join: 'round' });
g.line(12.5, 17, 12.5, 37.5, { role: 'dim' });
g.line(35.5, 17, 35.5, 37.5, { role: 'dim' });
g.line(7.5, 37.5, 40.5, 37.5, { role: 'line' });
g.group({ x: lerp(-7, 0, k) + 2.5 * p, opacity: k }, () => g.path(CAR, { role: p > 0.3 ? 'accent' : 'line', join: 'round' }));
},
});
};
__d[54] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { roundPoly } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BASE = 37.5;
const LAND = [[6.5, BASE], [17, 21.5], [22.5, 29], [29.5, 14], [41.5, BASE]];
const SNOW = [[25.9, 21.7], [28, 24], [30, 21.9], [31.7, 24], [33.4, 21.9]];
const __default = defineGlyph({
id: 'terrain',
title: 'Terrain',
category: 'build',
tags: ['terrain', 'land', 'mountain', 'raise', 'lower', 'sculpt', 'landscape', 'build'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.5);
const h = lerp(0.35, 1, k) * (1 + 0.06 * p);
const up = (pts) => pts.map(([x, y]) => [x, BASE - (BASE - y) * h]);
g.path(roundPoly(up(LAND), [1, 2.5, 2, 2.5, 1]), { join: 'round' });
g.polyline(up(SNOW), { role: 'dim', join: 'round', opacity: k });
},
});
};
__d[55] = function (__ns) {
const { enter, press, mirrorX } = __m(24);
const { topTrack, curveLeft } = __m(28);
__e(__ns, { "drawCurve": () => drawCurve }, [], ["drawCurve"]);
const C = curveLeft({ cx: 34, yb: 40, ya: 30, rc: 14, xe: 7.5 });
function drawCurve(g, s, dir) {
const k = enter(s, 0.55), p = press(s, 0.5);
topTrack(g, C.at, C.length, { gauge: 11, pitch: 8, over: 2, run: (1 - k) + p, m: dir > 0 ? mirrorX() : null, opacity: 0.35 + 0.65 * k });
}
};
__d[56] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawCurve } = __m(55);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'track-curve-left',
title: 'Curve Left',
category: 'build',
tags: ['track', 'curve', 'turn', 'left', 'coaster', 'piece', 'build'],
draw(g, s) { drawCurve(g, s, -1); },
});
};
__d[57] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawCurve } = __m(55);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'track-curve-right',
title: 'Curve Right',
category: 'build',
tags: ['track', 'curve', 'turn', 'right', 'coaster', 'piece', 'build'],
draw(g, s) { drawCurve(g, s, 1); },
});
};
__d[58] = function (__ns) {
const { defineGlyph } = __m(16);
const { enter, press } = __m(24);
const { topTrack, straightAt } = __m(28);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'track-straight',
title: 'Straight Track',
category: 'build',
tags: ['track', 'straight', 'straighten', 'rail', 'coaster', 'piece', 'build'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.5);
topTrack(g, straightAt(24, 40), 32, { gauge: 12, pitch: 8, over: 2.5, run: (1 - k) + p, opacity: 0.35 + 0.65 * k });
},
});
};
__d[59] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive } = __m(12);
const { curve } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 24, BY = 27.5, RX = 8.5, RY = 10.5; 
const LEGS = [[16.2, 21.5, -6, -3, 0], [15.6, 27.5, -6.5, 0, 1], [16.4, 33.5, -6, 3.5, 0]];
const LOOP = 1.2;
const __default = defineGlyph({
id: 'bug',
title: 'Bug',
category: 'dev',
tags: ['bug', 'debug', 'debugger', 'issue', 'defect', 'testing'],
states: { idle: 'idle', debugging: 'active' },
loop: LOOP,
draw(g, s) {
const on = s.state === 'debugging';
const k = on ? arrive(s.since, 0.3) : 0;
const w = Math.sin(s.phase(LOOP) * Math.PI * 4) * k; 
for (const side of [-1, 1]) for (const [hx, hy, fx, fy, grp] of LEGS) {
const swing = (grp === (side < 0 ? 0 : 1) ? w : -w) * 2.2; 
const x = side < 0 ? hx : 2 * CX - hx, dx = side < 0 ? fx : -fx;
g.line(x, hy, x + dx, hy + fy + swing, { weight: 0.85 });
}
const tw = on ? Math.sin(s.phase(LOOP) * Math.PI * 2 * 3) * 1.2 * k : 0;
g.path(curve([21.5, 14.5], [20, 11], [17, 9 + tw]), { role: 'dim', weight: 0.9 });
g.path(curve([26.5, 14.5], [28, 11], [31, 9 - tw]), { role: 'dim', weight: 0.9 });
g.path('M19 18.5a5 5 0 0 1 10 0', { role: 'line' });
g.ellipse(CX, BY, RX, RY, { role: 'line' });
g.line(CX, 19.5, CX, 36, { role: on ? 'accent' : 'dim', weight: 0.8 });
if (on) { g.dot(20.5, 25, 1.4, { opacity: 0.8 * k }); g.dot(27.5, 30, 1.4, { opacity: 0.8 * k }); }
},
});
};
__d[60] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter, xf, xfPts, rot, capsule } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HEAD = 'M17 10.5H31A2.5 2.5 0 0 1 33.5 13V15A2.5 2.5 0 0 1 31 17.5H17L14.5 15.5V12.5Z';
const HANDLE = capsule([24, 17.5], [24, 38.5], 2.6);
const NUDGE = [-2.8, 1.6];
const at = (deg) => { const m = rot(deg); return [m[0], m[1], m[2], m[3], m[4] + NUDGE[0], m[5] + NUDGE[1]]; };
const __default = defineGlyph({
id: 'build',
title: 'Build',
category: 'dev',
tags: ['build', 'hammer', 'compile', 'make', 'construct', 'tools', 'task'],
states: { idle: 'idle', building: 'busy' },
loop: 0.8,
draw(g, s) {
const busy = s.state === 'building';
const k = enter(s, 0.5);
const tap = busy ? Math.max(0, Math.sin(s.phase(0.8) * Math.PI * 2)) : !s.pressed && s.pressAge < 0.35 ? Math.sin(Math.PI * clamp(s.pressAge / 0.35)) : 0;
const M = at(45 + lerp(-20, 0, k) - 10 * tap);
g.path(xf(HANDLE, M), { join: 'round' });
g.path(xf(HEAD, M), { role: busy ? 'accent' : 'line', join: 'round' });
if (busy && tap < 0.2) {
const f = 1 - tap / 0.2, [fx, fy] = xfPts([[34.5, 14]], at(45))[0];
for (const a of [20, 70, 120]) {
const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180);
g.line(fx + 2.5 * sn, fy - 2.5 * c, fx + 5 * sn, fy - 5 * c, { role: 'accent', weight: 0.7, opacity: f });
}
}
},
});
};
__d[61] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, smoothstep } = __m(12);
const { partialPolyline, strike } = __m(26);
const { n } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CL = [15.5, 28, 7], CM = [24, 21.5, 10.5], CR = [33, 27, 8];
const BASE = 35;
function meet(a, b) {
const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
const l = (a[2] * a[2] - b[2] * b[2] + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a[2] * a[2] - l * l));
const mx = a[0] + (dx * l) / d, my = a[1] + (dy * l) / d;
const p1 = [mx + (dy * h) / d, my - (dx * h) / d], p2 = [mx - (dy * h) / d, my + (dx * h) / d];
return p1[1] < p2[1] ? p1 : p2;
}
function arcTo(c, p, q) {
const ang = (pt) => (Math.atan2(pt[1] - c[1], pt[0] - c[0]) * 180) / Math.PI;
const sweep = (((ang(q) - ang(p)) % 360) + 360) % 360;
return `A${n(c[2])} ${n(c[2])} 0 ${sweep > 180 ? 1 : 0} 1 ${n(q[0])} ${n(q[1])}`;
}
const LM = meet(CL, CM), MR = meet(CM, CR);
const OUTLINE = `M${n(CL[0])} ${BASE}${arcTo(CL, [CL[0], BASE], LM)}${arcTo(CM, LM, MR)}${arcTo(CR, MR, [CR[0], BASE])}Z`;
const CHECK = [[18.5, 26.5], [22.5, 30.5], [30, 23]];
const LOOP = 1.2;
const __default = defineGlyph({
id: 'cloud',
title: 'Cloud',
category: 'dev',
tags: ['cloud', 'upload', 'backup', 'deploy', 'hosting', 'online', 'storage'],
states: { online: 'active', uploading: 'busy', offline: 'neg' },
loop: LOOP,
draw(g, s) {
const st = s.state;
g.path(OUTLINE, { role: st === 'offline' ? 'dim' : 'line', join: 'round' });
if (st === 'offline') { strike(g, s, { from: [10.5, 9.5], to: [37.5, 38.5] }); return; }
if (st === 'online') {
const pts = partialPolyline(CHECK, arrive(Math.max(0, s.since - 0.1), 0.4));
if (pts.length > 1) g.polyline(pts, { role: 'accent', weight: 1.05 });
return;
}
for (const off of [0, 0.5]) {
const u = (s.phase(LOOP) + off) % 1;
const y = 30 - u * 11; 
const fade = smoothstep(0, 0.25, u) * (1 - smoothstep(0.65, 1, u));
if (fade > 0.02) g.polyline([[19.5, y + 4.5], [24, y], [28.5, y + 4.5]], { role: 'line', opacity: fade });
}
},
});
};
__d[62] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, smoothstep } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const S0 = [27, 11], S1 = [21, 37]; 
const LOOP = 2.4;
const __default = defineGlyph({
id: 'code',
title: 'Code',
category: 'dev',
tags: ['code', 'editor', 'source', 'develop', 'programming', 'brackets'],
states: { idle: 'idle', editing: 'active' },
loop: LOOP,
draw(g, s) {
const on = s.state === 'editing';
const k = arrive(s.since, 0.4);
const o = on ? lerp(0, 1.5, k) : lerp(1.5, 0, k); 
g.polyline([[16 - o, 14], [7.5 - o * 0.4, 24], [16 - o, 34]], { join: 'round' });
g.polyline([[32 + o, 14], [40.5 + o * 0.4, 24], [32 + o, 34]], { join: 'round' });
g.line(S0[0], S0[1], S1[0], S1[1], { role: on ? 'accent' : 'dim', weight: 1.05 });
if (!on) return;
const p = s.phase(LOOP);
const fade = smoothstep(0, 0.12, p) * (1 - smoothstep(0.62, 0.8, p));
if (fade < 0.02) return;
const u = Math.min(1, p / 0.8);
g.dot(lerp(S0[0], S1[0], u), lerp(S0[1], S1[1], u), 2, { opacity: fade * k });
},
});
};
__d[63] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'definition',
title: 'Definition',
category: 'dev',
tags: ['definition', 'go to definition', 'declaration', 'jump', 'navigate', 'code', 'peek'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
g.rect(19.5, 9, 21, 30, { r: 4 });
g.line(24.5, 16, 35.5, 16, { role: 'dim' });
g.line(24.5, 23, 35.5, 23, { role: 'accent', weight: 1.05 });
g.line(24.5, 30, 32, 30, { role: 'dim' });
const d = lerp(-3, 0, k) + 1.2 * p;
g.path(`M8 38C8 29 10.5 23 ${15.5 + d} 23`, { role: 'line', opacity: lerp(0.3, 1, k) });
g.polyline(chevron([16 + d, 23], 90, 5, 45), { role: 'line', join: 'round', opacity: lerp(0.3, 1, k) });
},
});
};
__d[64] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'diff',
title: 'Diff',
category: 'dev',
tags: ['diff', 'changes', 'compare', 'added', 'removed', 'show change', 'version control'],
draw(g, s) {
const p = press(s, 0.4);
g.rect(10.5, 7.5, 27, 33, { r: 4 });
const k1 = enter(s, 0.4), k2 = enter({ since: s.since - 0.1 }, 0.4);
const h1 = lerp(1.5, 5.5, k1), h2 = lerp(1.5, 5.5, k2);
g.line(24 - h1, 18.5, 24 + h1, 18.5, { role: 'accent', weight: 1.05 });
g.line(24, 18.5 - h1, 24, 18.5 + h1, { role: 'accent', weight: 1.05 });
g.line(24 - h2, 31, 24 + h2, 31, { role: p > 0.3 ? 'accent' : 'line', weight: 1.05 });
},
});
};
__d[65] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'fold',
title: 'Fold',
category: 'dev',
tags: ['fold', 'collapse', 'unfold', 'expand', 'outline', 'region', 'code folding'],
states: { unfolded: 'idle', folded: 'active' },
draw(g, s) {
const m = arrive(s.since, 0.4);
const k = s.state === 'folded' ? m : 1 - m; 
const o = lerp(11, 6.5, k);
g.polyline([[15, 24 - o - 5.5], [24, 24 - o], [33, 24 - o - 5.5]], { role: 'line', join: 'round' });
g.polyline([[15, 24 + o + 5.5], [24, 24 + o], [33, 24 + o + 5.5]], { role: 'line', join: 'round' });
g.line(9, 24, 39, 24, { role: k > 0.5 ? 'accent' : 'dim', weight: k > 0.5 ? 1.05 : 1 });
},
});
};
__d[66] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, smoothstep } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const T = [14.5, 11.5], B = [14.5, 36.5], BR = [33.5, 15.5], NR = 3.6; 
const C = [[BR[0], BR[1] + NR], [BR[0], 27.5], [B[0], 24], [B[0], B[1] - NR]];
const LOOP = 1.8;
const bez = (u) => {
const v = 1 - u;
return [0, 1].map((k) => v * v * v * C[0][k] + 3 * v * v * u * C[1][k] + 3 * v * u * u * C[2][k] + u * u * u * C[3][k]);
};
const __default = defineGlyph({
id: 'git-branch',
title: 'Branch',
category: 'dev',
tags: ['branch', 'git', 'version control', 'merge', 'commit', 'source control'],
states: { idle: 'idle', active: 'active' },
loop: LOOP,
draw(g, s) {
const on = s.state === 'active';
const f = (p) => `${p[0]} ${p[1]}`;
g.line(T[0], T[1] + NR, B[0], B[1] - NR);
g.path(`M${f(C[0])}C${f(C[1])} ${f(C[2])} ${f(C[3])}`, { role: on ? 'accent' : 'dim' });
g.circle(T[0], T[1], NR);
g.circle(B[0], B[1], NR);
const k = arrive(s.since, 0.35);
g.circle(BR[0], BR[1], NR, { role: on ? 'accent' : 'line' });
if (!on) return;
g.circle(BR[0], BR[1], 1.6, { role: 'spark', opacity: k });
for (const off of [0, 0.5]) {
const u = (s.phase(LOOP) + off) % 1;
const fade = smoothstep(0, 0.15, u) * (1 - smoothstep(0.85, 1, u));
const [x, y] = bez(u);
if (fade > 0.02) g.dot(x, y, 1.9, { opacity: fade * k });
}
},
});
};
__d[67] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const C = [33.5, 24];
const FROM = [[11.5, 11.5], [10.5, 24], [11.5, 36.5]];
const __default = defineGlyph({
id: 'references',
title: 'References',
category: 'dev',
tags: ['references', 'find references', 'usages', 'callers', 'who uses', 'code', 'navigate'],
draw(g, s) {
const p = press(s, 0.4);
g.circle(C[0], C[1], 5, { role: p > 0.3 ? 'accent' : 'line' });
g.dot(C[0], C[1], 1.8);
FROM.forEach(([x, y], i) => {
const k = enter({ since: s.since - i * 0.08 }, 0.4);
const dx = C[0] - x, dy = C[1] - y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
const tip = [C[0] - ux * 8, C[1] - uy * 8];
const end = [lerp(x, tip[0], k), lerp(y, tip[1], k)];
g.line(x, y, end[0] - ux, end[1] - uy, { role: 'dim', opacity: lerp(0.2, 1, k) });
g.polyline(chevron(end, (Math.atan2(ux, -uy) * 180) / Math.PI, 4.5, 45), { role: 'line', join: 'round', opacity: k });
});
},
});
};
__d[68] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp, smoothstep } = __m(12);
const { quadC } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 1.2;
const TAU = Math.PI * 2;
const __default = defineGlyph({
id: 'rocket',
title: 'Rocket',
category: 'dev',
tags: ['rocket', 'launch', 'deploy', 'release', 'ship', 'start'],
states: { ready: 'idle', launched: 'active' },
loop: LOOP,
draw(g, s) {
const up = s.state === 'launched';
const k = up ? arrive(s.since, 0.5) : 1 - arrive(s.since, 0.35);
const p = s.phase(LOOP);
const shake = up ? 0.35 * Math.sin(p * TAU * 6) * k : 0;
const dy = -3 * k; 
const X = (x) => +(x + shake).toFixed(2), Y = (y) => +(y + dy).toFixed(2);
if (k > 0.02) {
const fl = 5.5 + 1.6 * Math.sin(p * TAU * 5) + 0.9 * Math.sin(p * TAU * 7 + 1.3);
const len = fl * k, y0 = Y(33.5);
g.path(`M${X(20)} ${y0}${quadC([X(20), y0], [X(20.4), y0 + len * 0.6], [X(24), y0 + len])}${quadC([X(24), y0 + len], [X(27.6), y0 + len * 0.6], [X(28), y0])}Z`, { role: 'accent', fill: true, opacity: 0.9 });
g.path(`M${X(22.3)} ${y0}${quadC([X(22.3), y0], [X(22.5), y0 + len * 0.4], [X(24), y0 + len * 0.62])}${quadC([X(24), y0 + len * 0.62], [X(25.5), y0 + len * 0.4], [X(25.7), y0])}Z`, { role: 'spark', opacity: 0.9 * k });
}
g.path(`M${X(24)} ${Y(9)}C${X(30.5)} ${Y(13)} ${X(32)} ${Y(18)} ${X(32)} ${Y(23)}V${Y(31.5)}H${X(16)}V${Y(23)}C${X(16)} ${Y(18)} ${X(17.5)} ${Y(13)} ${X(24)} ${Y(9)}Z`, { join: 'round' });
g.circle(X(24), Y(20.5), 3.4, { role: up ? 'accent' : 'dim' });
g.path(`M${X(16)} ${Y(24.5)}L${X(10.5)} ${Y(30)}V${Y(35)}L${X(16)} ${Y(31.5)}`, { join: 'round' });
g.path(`M${X(32)} ${Y(24.5)}L${X(37.5)} ${Y(30)}V${Y(35)}L${X(32)} ${Y(31.5)}`, { join: 'round' });
g.line(X(20.5), Y(33.5), X(27.5), Y(33.5), { role: 'dim' });
if (k < 0.98) g.line(10, 39.5, 38, 39.5, { role: 'dim', opacity: 1 - k });
if (up) for (const [x, off, len, ya, yb] of [[7, 0, 5, 10, 37], [41, 0.5, 5, 10, 37], [12, 0.3, 3.5, 8, 19], [36, 0.8, 3.5, 8, 19]]) {
const u = (p * 2 + off) % 1; 
const y = ya + u * (yb - ya);
const fade = smoothstep(0, 0.2, u) * (1 - smoothstep(0.7, 1, u)) * k;
if (fade > 0.02) g.line(x, y, x, clamp(y + len, 6, 41), { role: 'dim', opacity: fade });
}
},
});
};
__d[69] = function (__ns) {
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "drawStep": () => drawStep }, [], ["drawStep"]);
function drawStep(g, s, dir) {
const k = enter(s, 0.45), p = press(s, 0.4);
const d = lerp(-4, 0, k) + 1.8 * p;
g.circle(24, 35.5, 4, { role: 'accent', weight: 1.05 });
if (dir > 0) {
g.line(24, 10.5 + d, 24, 26 + d);
g.polyline(chevron([24, 27 + d], 180, 8, 45), { role: 'line', join: 'round' });
} else {
g.line(24, 28 - d, 24, 10 - d);
g.polyline(chevron([24, 9 - d], 0, 8, 45), { role: 'line', join: 'round' });
}
}
};
__d[70] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawStep } = __m(69);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'step-into',
title: 'Step Into',
category: 'dev',
tags: ['step into', 'debug', 'debugger', 'step', 'breakpoint', 'call'],
draw(g, s) { drawStep(g, s, 1); },
});
};
__d[71] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawStep } = __m(69);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'step-out',
title: 'Step Out',
category: 'dev',
tags: ['step out', 'debug', 'debugger', 'step', 'return', 'call'],
draw(g, s) { drawStep(g, s, -1); },
});
};
__d[72] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, xf, mirrorX } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BRACE = 'M18 9.5C14.5 9.5 14 12 14 15.5V19.5C14 22.2 12.8 24 10 24C12.8 24 14 25.8 14 28.5V32.5C14 36 14.5 38.5 18 38.5';
const __default = defineGlyph({
id: 'symbol',
title: 'Symbol',
category: 'dev',
tags: ['symbol', 'go to symbol', 'outline', 'braces', 'function', 'class', 'code'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const o = lerp(-3, 0, k);
g.group({ x: o }, () => g.path(BRACE, { role: 'line', join: 'round' }));
g.group({ x: -o }, () => g.path(xf(BRACE, mirrorX()), { role: 'line', join: 'round' }));
g.polygon([[24, 18.5], [29.5, 24], [24, 29.5], [18.5, 24]], { role: p > 0.3 ? 'accent' : 'fill', join: 'round', opacity: lerp(0.3, 1, k) });
},
});
};
__d[73] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, smoothstep } = __m(12);
const { blink } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const STEP = 1.2; 
const OUT = [9, 6, 10.5, 7.5]; 
const LOOP = STEP * OUT.length; 
const PITCH = 5; 
const Y_TOP = 15.5, Y_BOT = 32.5; 
const __default = defineGlyph({
id: 'terminal',
title: 'Terminal',
category: 'dev',
tags: ['terminal', 'shell', 'console', 'command line', 'cli', 'prompt'],
states: { idle: 'idle', running: 'active' },
loop: LOOP,
draw(g, s) {
g.rect(7, 9.5, 34, 29, { r: 4.5 });
const run = s.state === 'running';
const k = arrive(s.since, 0.35);
g.polyline([[13.5, 18.5], [19, 24], [13.5, 29.5]], { role: run ? 'accent' : 'line', join: 'round' });
if (!run) {
const on = blink(s.phase(STEP), 0.55, 0.08);
g.line(23.5, 29.5, 31, 29.5, { role: 'line', opacity: 0.15 + 0.85 * on });
return;
}
const u = s.phase(LOOP) * OUT.length, base = Math.floor(u), p = u - base;
for (let j = -1; j < 5; j++) {
const y = Y_BOT - (j + p) * PITCH;
if (y < Y_TOP - 0.01 || y > Y_BOT + 0.01) continue;
const fade = smoothstep(Y_TOP, Y_TOP + 4, y) * (1 - smoothstep(Y_BOT - 3, Y_BOT, y));
const len = OUT[(((base - j) % OUT.length) + OUT.length) % OUT.length];
g.line(23.5, y, 23.5 + len, y, { role: 'dim', opacity: fade * k });
}
},
});
};
__d[74] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, capsule } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const TIP = 'M21.5 25.5C17.5 25.2 14.5 28.3 14.5 31.8C14.5 34.6 12.5 36.5 9.5 37C12 39.6 15.4 40.5 18.2 40.5C22.8 40.5 26.4 37 26.4 32.6C26.4 29.4 24.6 26.6 21.5 25.5Z';
const __default = defineGlyph({
id: 'brush',
title: 'Brush',
category: 'edit',
tags: ['brush', 'paint', 'paintbrush', 'color', 'brush size', 'intensity', 'tool'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const d = lerp(4, 0, k) - 1.4 * p;
g.group({ x: d * 0.707, y: -d * 0.707, opacity: lerp(0.35, 1, k) }, () => {
g.path(capsule([37, 11], [26.5, 21.5], 3.6), { join: 'round' });
g.path(TIP, { role: 'accent', fill: true, opacity: 0.9 });
g.path(TIP, { role: 'accent', join: 'round' });
});
},
});
};
__d[75] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, xf, rot } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const M = rot(-40, [24, 24]);
const BODY = xf('M12 18H33A3.5 3.5 0 0 1 36.5 21.5V28.5A3.5 3.5 0 0 1 33 32H12A3.5 3.5 0 0 1 8.5 28.5V21.5A3.5 3.5 0 0 1 12 18Z', M);
const SPLIT = xf('M20 18V32', M);
const SPLIT_FILL = xf('M12 18H20V32H12A3.5 3.5 0 0 1 8.5 28.5V21.5A3.5 3.5 0 0 1 12 18Z', M);
const __default = defineGlyph({
id: 'clear',
title: 'Clear',
category: 'edit',
tags: ['clear', 'eraser', 'erase', 'wipe', 'clean', 'reset', 'clear formatting'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.45);
const dx = lerp(-6, 0, k) + 2 * p;
g.line(8, 39.5, lerp(8, 23, k), 39.5, { role: 'dim' });
g.group({ x: dx, y: -dx * 0.3, opacity: lerp(0.3, 1, k) }, () => {
g.path(SPLIT_FILL, { role: 'accent', fill: true, opacity: 0.85 });
g.path(BODY, { join: 'round' });
g.path(SPLIT, { role: 'line', weight: 0.85 });
});
},
});
};
__d[76] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { P } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'copy',
title: 'Copy',
category: 'edit',
tags: ['copy', 'duplicate', 'clone', 'dup', 'clipboard', 'copy shift'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.45);
const o = lerp(0, 1, k) + 0.6 * p; 
const bx = 9.5 + 8 * o, by = 17.5 - 8 * o;
g.path(P().M(bx, 17.5).V(by + 4).A(4, 4, 0, 0, 1, bx + 4, by).H(bx + 17).A(4, 4, 0, 0, 1, bx + 21, by + 4).V(by + 17).A(4, 4, 0, 0, 1, bx + 17, by + 21).H(30.5).d, { role: p > 0.3 ? 'accent' : 'line', join: 'round', opacity: lerp(0.3, 1, k) });
g.rect(9.5, 17.5, 21, 21, { r: 4 });
},
});
};
__d[77] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter } = __m(24);
const { blink } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const ROWS = [[13, 24], [24, 33], [35, 19]]; 
const __default = defineGlyph({
id: 'cursor',
title: 'Cursors',
category: 'edit',
tags: ['cursor', 'cursors', 'multi-cursor', 'caret', 'add next', 'select matches', 'text'],
loop: 1.2,
draw(g, s) {
const on = 0.25 + 0.75 * blink(s.phase(1.2), 0.6, 0.1);
ROWS.forEach(([y, x1], i) => {
g.line(8.5, y, x1, y, { role: 'dim' });
const k = enter({ since: s.since - i * 0.08 }, 0.4);
const op = k * lerp(1, on, clamp((s.since - 0.6) / 0.1)), dy = lerp(-2.5, 0, k), cx = x1 + 4.5;
g.line(cx, y - 4.5 + dy, cx, y + 4.5 + dy, { role: 'accent', weight: 1.05, opacity: op });
g.line(cx - 2.2, y - 4.5 + dy, cx + 2.2, y - 4.5 + dy, { role: 'accent', weight: 0.75, opacity: op });
g.line(cx - 2.2, y + 4.5 + dy, cx + 2.2, y + 4.5 + dy, { role: 'accent', weight: 0.75, opacity: op });
});
},
});
};
__d[78] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const PIV = [24, 24];
const __default = defineGlyph({
id: 'cut',
title: 'Cut',
category: 'edit',
tags: ['cut', 'scissors', 'snip', 'trim', 'clip', 'transition'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.35);
const open = lerp(4, 15, k) * (1 - 0.75 * p); 
for (const side of [-1, 1]) {
g.group({ rotate: side * (open - 15), origin: PIV }, () => {
g.line(24 - side * 3.99, 31.22, 24 + side * 8, 9.5, { role: 'line' });
g.circle(24 - side * 6.4, 35.6, 5, { role: 'line' });
});
}
g.dot(PIV[0], PIV[1], 1.7, { role: 'fill' });
},
});
};
__d[79] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'delete',
title: 'Delete',
category: 'edit',
tags: ['delete', 'trash', 'bin', 'remove', 'discard', 'demolish', 'erase'],
states: { ready: 'idle', armed: 'warn' },
draw(g, s) {
const armed = s.state === 'armed';
const k = enter(s, 0.45), p = press(s, 0.45);
g.path('M12.5 16.5L14.3 36.5A3.5 3.5 0 0 0 17.8 39.5H30.2A3.5 3.5 0 0 0 33.7 36.5L35.5 16.5', { role: armed ? 'accent' : 'line', join: 'round' });
g.line(20.5, 21.5, 21, 34, { role: 'dim' });
g.line(27.5, 21.5, 27, 34, { role: 'dim' });
g.group({ y: lerp(-3, 0, k), rotate: -16 * p, origin: [9.5, 12], opacity: lerp(0.3, 1, k) }, () => {
g.line(9.5, 12, 38.5, 12, { role: 'line' });
g.path('M19 12V10A2 2 0 0 1 21 8H27A2 2 0 0 1 29 10V12', { role: 'line', join: 'round' });
});
},
});
};
__d[80] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, smoothstep } = __m(12);
const { enter, press, xf, rot } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const M = rot(45);
const BODY = 'M19 31.5V11A3 3 0 0 1 22 8H26A3 3 0 0 1 29 11V31.5L24 40.5Z';
const BAND = 'M19 14.5H29';
const LEAD = 'M22.1 37.1L25.9 37.1L24 40.5Z';
const LOOP = 2.4;
const __default = defineGlyph({
id: 'edit',
title: 'Edit',
category: 'edit',
tags: ['edit', 'pencil', 'write', 'modify', 'edit mode', 'draw', 'change'],
states: { idle: 'idle', editing: 'active' },
loop: LOOP,
draw(g, s) {
const on = s.state === 'editing';
const k = enter(s, 0.5), p = press(s, 0.4);
const d = lerp(4, 0, k) - 1.6 * p; 
g.group({ x: -d * 0.707, y: d * 0.707, opacity: lerp(0.35, 1, k) }, () => {
g.path(xf(BODY, M), { join: 'round' });
g.path(xf(BAND, M), { role: 'dim' });
g.path(xf(LEAD, M), { role: on ? 'accent' : 'fill', fill: true });
});
if (!on) return;
const u = s.phase(LOOP);
const w = smoothstep(0.05, 0.5, u), fade = 1 - smoothstep(0.75, 0.95, u);
if (w > 0.02) g.line(10.5, 40, lerp(10.5, 22, w), 40, { role: 'accent', weight: 0.9, opacity: fade * k });
},
});
};
__d[81] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outExpo, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'forward',
title: 'Forward',
category: 'edit',
tags: ['forward', 'redo', 'next', 'repeat', 'navigation', 'forward message'],
draw(g, s) {
const k = arrive(s.since, 0.45);
const push = s.pressed ? 1 : s.pressAge < 0.45 ? 1 - outExpo(clamp(s.pressAge / 0.45)) : 0;
const dx = -4 * (1 - k) + 2.5 * push;
g.group({ x: dx, opacity: 0.3 + 0.7 * k }, () => {
g.path('M37 19H20.5A9 9 0 0 0 20.5 37H28.5');
g.polyline([[30, 11.5], [37.5, 19], [30, 26.5]], { role: push > 0.3 ? 'accent' : 'line', join: 'round' });
});
},
});
};
__d[82] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, pulse, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'magnet',
title: 'Magnet',
category: 'edit',
tags: ['magnet', 'stick', 'attract', 'snap', 'lock axes', 'stick to surface'],
states: { off: 'idle', on: 'active' },
loop: 1.6,
draw(g, s) {
const on = s.state === 'on';
const jolt = on ? -1.5 * Math.sin(Math.PI * clamp(s.since / 0.3)) : 0;
g.group({ y: jolt }, () => {
g.path('M11.5 15V26.5A12.5 12.5 0 0 0 36.5 26.5V15H29V26.5A5 5 0 0 1 19 26.5V15Z', { join: 'round' });
g.line(11.5, 20.5, 19, 20.5, { role: on ? 'accent' : 'dim' });
g.line(29, 20.5, 36.5, 20.5, { role: on ? 'accent' : 'dim' });
if (on) {
g.rect(11.5, 15, 7.5, 5.5, { role: 'accent', fill: true, opacity: 0.85 });
g.rect(29, 15, 7.5, 5.5, { role: 'accent', fill: true, opacity: 0.85 });
}
});
if (!on) return;
const k = clamp(s.since / 0.4);
for (const [r, ph] of [[4.6, 0], [8.4, 0.5]]) {
g.arc(24, 15, r, -58, 58, { role: 'accent', weight: 0.8, opacity: k * lerp(0.25, 0.9, pulse(s.t + ph * 1.6, 1.6)) });
}
},
});
};
__d[83] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'move',
title: 'Move',
category: 'edit',
tags: ['move', 'drag', 'pan', 'nudge', 'position', 'translate', 'arrows'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.45);
const R = lerp(17.5, 16, k) + 1.6 * p; 
g.line(24, 24 - R + 1.5, 24, 24 + R - 1.5);
g.line(24 - R + 1.5, 24, 24 + R - 1.5, 24);
for (const dir of [0, 90, 180, 270]) {
const tip = [24 + R * Math.sin((dir * Math.PI) / 180), 24 - R * Math.cos((dir * Math.PI) / 180)];
g.polyline(chevron(tip, dir, 5.5, 45), { role: p > 0.3 ? 'accent' : 'line', join: 'round', opacity: lerp(0.3, 1, k) });
}
g.circle(24, 24, 3, { role: 'fill' });
},
});
};
__d[84] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'paste',
title: 'Paste',
category: 'edit',
tags: ['paste', 'clipboard', 'insert', 'paste shift', 'clip'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.45);
g.path('M17.5 11H14A3.5 3.5 0 0 0 10.5 14.5V36.5A3.5 3.5 0 0 0 14 40H34A3.5 3.5 0 0 0 37.5 36.5V14.5A3.5 3.5 0 0 0 34 11H30.5', { join: 'round' });
g.rect(17.5, 7.5, 13, 7, { r: 2.5, role: 'line' });
const dy = lerp(-5, 0, k) - 2.5 * p;
g.group({ y: dy, opacity: lerp(0, 1, k) }, () => {
g.line(16.5, 22.5, 31.5, 22.5, { role: p > 0.3 ? 'accent' : 'dim' });
g.line(16.5, 28, 31.5, 28, { role: p > 0.3 ? 'accent' : 'dim' });
g.line(16.5, 33.5, 26, 33.5, { role: p > 0.3 ? 'accent' : 'dim' });
});
},
});
};
__d[85] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter } = __m(24);
const { blink } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'rename',
title: 'Rename',
category: 'edit',
tags: ['rename', 'name', 'label', 'title', 'edit text', 'field', 'refactor'],
states: { idle: 'idle', editing: 'active' },
loop: 1.2,
draw(g, s) {
const on = s.state === 'editing';
const k = enter(s, 0.55);
g.rect(7, 15, 34, 18, { r: 4 });
const end = lerp(13, 27, k);
g.line(13, 24, end, 24, { role: on ? 'line' : 'dim', weight: 1.05 });
const b = on ? 0.2 + 0.8 * blink(s.phase(1.2), 0.55, 0.08) : 1;
g.line(end + 3.5, 19, end + 3.5, 29, { role: 'accent', weight: 1.05, opacity: b });
g.line(end + 1, 19, end + 6, 19, { role: 'accent', weight: 0.75, opacity: b });
g.line(end + 1, 29, end + 6, 29, { role: 'accent', weight: 0.75, opacity: b });
},
});
};
__d[86] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { arcHead } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'replace',
title: 'Replace',
category: 'edit',
tags: ['replace', 'swap', 'find and replace', 'substitute', 'exchange'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.45);
g.rect(8, 8, 15, 15, { r: 3.5, role: 'dim' });
g.rect(25, 25, 15, 15, { r: 3.5, role: p > 0.3 ? 'accent' : 'fill', fill: true, opacity: lerp(0.4, 1, k) });
const end = lerp(20, 82, k);
g.arc(26, 22, 10, 0, end, { role: 'line' });
g.polyline(arcHead(26, 22, 10, end, { size: 4.2 }), { role: 'line', join: 'round' });
},
});
};
__d[87] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, outBack, clamp } = __m(12);
const { enter, press, xf, rot } = __m(24);
const { arcHead } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'rotate',
title: 'Rotate',
category: 'edit',
tags: ['rotate', 'turn', 'spin', 'rotate 90', 'orientation', 'pivot'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.45);
const end = 318, op = lerp(0.3, 1, k);
g.arc(24, 24, 15, 42, end, { role: 'line', opacity: op });
g.polyline(arcHead(24, 24, 15, end, { size: 4.4 }), { role: 'line', join: 'round', opacity: op });
const turn = lerp(-30, 0, k) + 90 * (s.pressed ? 0 : s.pressAge < 0.5 ? outBack(clamp(s.pressAge / 0.5)) - 1 : 0) + 15;
g.path(xf('M19.5 17H28.5A2.5 2.5 0 0 1 31 19.5V28.5A2.5 2.5 0 0 1 28.5 31H19.5A2.5 2.5 0 0 1 17 28.5V19.5A2.5 2.5 0 0 1 19.5 17Z', rot(turn)), { role: p > 0.3 ? 'accent' : 'dim', join: 'round' });
},
});
};
__d[88] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'scale',
title: 'Scale',
category: 'edit',
tags: ['scale', 'resize', 'size', 'grow', 'shrink', 'enlarge', 'transform'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.45);
g.rect(8.5, 8.5, 31, 31, { r: 4, role: 'dim', dash: [2.4, 2.8] });
const w = lerp(10, 15, k) + 4 * p;
g.rect(8.5, 39.5 - w, w, w, { r: 3.5, role: 'line' });
const a = 8.5 + w + 3, b = 39.5 - w - 3; 
g.line(a, b, 34.5, 13.5, { role: 'accent' }); 
g.polyline(chevron([35.5, 12.5], 45, 7, 45), { role: 'accent', join: 'round' });
},
});
};
__d[89] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const POINTER = [[23.5, 21], [23.5, 39], [28, 34.8], [31.3, 41], [34.6, 39.4], [31.4, 33.3], [37.4, 33.3]];
const __default = defineGlyph({
id: 'select',
title: 'Select',
category: 'edit',
tags: ['select', 'selection', 'marquee', 'pick', 'select all', 'multi-select', 'add', 'subtract'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const w = lerp(12, 26, k), h = lerp(10, 22, k);
g.rect(8, 8, w, h, { r: 3, role: p > 0.3 ? 'accent' : 'dim', dash: [2.6, 2.6] });
g.group({ x: 1 * p, y: 1 * p }, () => g.polygon(POINTER, { role: 'line', join: 'round' }));
},
});
};
__d[90] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, outBack, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const G = [9, 19, 29, 39]; 
const __default = defineGlyph({
id: 'snap',
title: 'Snap',
category: 'edit',
tags: ['snap', 'grid', 'grid snap', 'angle snap', 'align', 'magnet', 'guides'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const k = on ? outBack(clamp(s.since / 0.4), 2.2) : clamp(s.since / 0.3);
for (const y of G) for (const x of G) {
if ((x === 19 || x === 39) && (y === 19 || y === 39)) continue; 
g.circle(x, y, 1.45, { role: 'dim', fill: true });
}
const o = on ? lerp(-3.5, 0, k) : 0;
g.rect(19 + o, 19 + o, 20, 20, { r: 3.5, role: on ? 'accent' : 'line', opacity: on ? 1 : 0.4 + 0.6 * k });
if (on) for (const [x, y] of [[19, 19], [39, 19], [19, 39], [39, 39]]) g.dot(x + o, y + o, 1.5, { opacity: clamp(k) });
},
});
};
__d[91] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp, pulse } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'beam',
title: 'Beam',
category: 'game',
tags: ['beam', 'beam size', 'ray', 'laser', 'terrain tool', 'cone', 'width'],
states: { idle: 'idle', active: 'active' },
loop: 1.2,
draw(g, s) {
const on = s.state === 'active';
const k = enter(s, 0.5);
g.rect(7, 19, 9, 10, { r: 2.5 });
const half = lerp(3, 12, clamp(s.level)), x1 = lerp(18, 40, k);
const h = lerp(1, half, k);
g.path(`M17.5 22L${x1} ${24 - h}M17.5 26L${x1} ${24 + h}`, { role: on ? 'accent' : 'line' });
g.line(x1, 24 - h, x1, 24 + h, { role: 'dim', opacity: on ? 0.6 + 0.4 * pulse(s.t, 1.2) : 1 });
},
});
};
__d[92] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, pulse } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'boost',
title: 'Boost',
category: 'game',
tags: ['boost', 'sprint', 'speed', 'accelerate', 'thrust', 'afterburner', 'run'],
states: { idle: 'idle', boosting: 'active' },
loop: 0.6,
draw(g, s) {
const on = s.state === 'boosting';
const k = enter(s, 0.45), p = press(s, 0.4);
[[13, 'accent', 0], [25.5, 'line', 0.5]].forEach(([y, role, ph]) => {
const lift = on ? 1.6 * pulse(s.t + ph * 0.6, 0.6) : 0;
g.polyline(chevron([24, y - lift - 2 * p + lerp(4, 0, k)], 0, 13, 45), { role, join: 'round', weight: 1.1, opacity: lerp(0.3, 1, k) });
});
},
});
};
__d[93] = function (__ns) {
const { lerp } = __m(12);
__e(__ns, { "figure": () => figure, "blend": () => blend }, [], ["blend","figure"]);
function figure(g, pose, { role = 'line', opacity = 1 } = {}) {
g.circle(pose.head[0], pose.head[1], 3.4, { role: 'fill', opacity });
g.polyline(pose.spine, { role, weight: 1.15, join: 'round', opacity });
for (const limb of [...pose.arms, ...pose.legs]) g.polyline(limb, { role, weight: 1.1, join: 'round', opacity });
}
function blend(a, b, t) {
const P = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const L = (x, y) => x.map((p, i) => P(p, y[i]));
return { head: P(a.head, b.head), spine: L(a.spine, b.spine), arms: a.arms.map((x, i) => L(x, b.arms[i])), legs: a.legs.map((x, i) => L(x, b.legs[i])) };
}
};
__d[94] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter, chevron } = __m(24);
const { figure, blend } = __m(93);
__e(__ns, { "default": () => __default }, [], ["default"]);
const STAND = { head: [24, 12.5], spine: [[24, 18], [24, 28.5]], arms: [[[24, 19.5], [19.5, 24.5], [18.5, 29]], [[24, 19.5], [28.5, 24.5], [29.5, 29]]], legs: [[[24, 28.5], [21.5, 34], [21, 39.5]], [[24, 28.5], [26.5, 34], [27, 39.5]]] };
const LOW = { head: [24, 19], spine: [[24, 24.5], [24, 31]], arms: [[[24, 26], [18.5, 28.5], [17, 32.5]], [[24, 26], [29.5, 28.5], [31, 32.5]]], legs: [[[24, 31], [15.5, 32.5], [18.5, 39.5]], [[24, 31], [32.5, 32.5], [29.5, 39.5]]] };
const __default = defineGlyph({
id: 'crouch',
title: 'Crouch',
category: 'game',
tags: ['crouch', 'duck', 'sneak', 'squat', 'kneel', 'person', 'action'],
draw(g, s) {
const k = enter(s, 0.5);
const bob = !s.pressed && s.pressAge < 0.45 ? Math.sin(Math.PI * clamp(s.pressAge / 0.45)) : 0;
figure(g, blend(STAND, LOW, clamp(k)));
g.polyline(chevron([24, lerp(9.5, 12, k) + 1.5 * bob], 180, 5.5, 45), { role: 'accent', join: 'round', opacity: k });
g.line(10, 40.5, 38, 40.5, { role: 'dim' });
},
});
};
__d[95] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'exocraft',
title: 'Exocraft',
category: 'game',
tags: ['exocraft', 'rover', 'vehicle', 'buggy', 'summon vehicle', 'drive', 'car'],
draw(g, s) {
const k = enter(s, 0.7);
const bump = !s.pressed && s.pressAge < 0.4 ? -2 * Math.sin(Math.PI * clamp(s.pressAge / 0.4)) : 0;
const x = lerp(-6, 0, k);
g.group({ x, opacity: lerp(0.3, 1, k) }, () => {
g.group({ y: bump }, () => {
g.path('M7.5 29V25.5A2 2 0 0 1 9.5 23.5H16L20.5 16H31.5A2 2 0 0 1 33.3 17.2L36.5 23.5H38.5A2 2 0 0 1 40.5 25.5V29Z', { join: 'round' });
g.line(24.5, 16, 24.5, 23.5, { role: 'dim' });
g.line(29, 16, 31, 9.5, { role: 'line', weight: 0.85 });
g.dot(31.2, 9, 1.5);
});
for (const cx of [12.5, 24, 35.5]) {
g.circle(cx, 34, 4.5, { role: 'line' });
const a = (1 - k) * -540 + cx * 9;
const [sx, sy] = g.polar(cx, 34, 2.2, a);
g.line(cx, 34, sx, sy, { role: 'dim', weight: 0.8 });
}
});
},
});
};
__d[96] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'follow',
title: 'Follow',
category: 'game',
tags: ['follow', 'pursue', 'chase', 'target', 'escort', 'track', 'lock on'],
states: { idle: 'idle', following: 'active' },
loop: 1.2,
draw(g, s) {
const on = s.state === 'following';
const k = enter(s, 0.6);
g.circle(33, 15, 6, { role: on ? 'accent' : 'line' });
g.dot(33, 15, 1.8);
const off = on ? s.phase(1.2) : 0;
for (let i = 0; i < 3; i++) {
const u0 = (i + off) / 3.2, u1 = u0 + 0.14;
if (u1 > 0.95) continue;
g.line(lerp(18, 28.5, u0), lerp(30, 19.5, u0), lerp(18, 28.5, u1), lerp(30, 19.5, u1), { role: 'dim' });
}
const d = lerp(-4, 0, k); 
g.polyline(chevron([16.5 + 0.7 * d, 31.5 - 0.7 * d], 45, 7, 40), { role: 'line', join: 'round', weight: 1.1 });
},
});
};
__d[97] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, pulse } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'freighter',
title: 'Freighter',
category: 'game',
tags: ['freighter', 'capital ship', 'ship', 'fleet', 'summon freighter', 'mothership', 'space'],
loop: 2.4,
draw(g, s) {
const k = enter(s, 0.8);
g.group({ x: lerp(7, 0, k), opacity: lerp(0.25, 1, k) }, () => {
g.path('M7 27.5L13 22H35L36.5 18H40V31.5H33L30 34H14Z', { join: 'round' });
g.path('M24 22V15.5A1.5 1.5 0 0 1 25.5 14H29.5L31.5 17V22', { role: 'line', join: 'round' });
g.line(13.5, 27.5, 31, 27.5, { role: 'dim' });
});
g.rect(40, 21, 2, 7, { r: 1, role: 'accent', fill: true, opacity: k * (0.45 + 0.55 * pulse(s.t, 2.4)) });
},
});
};
__d[98] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter } = __m(24);
const { smooth } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
function arm(a0) {
const pts = [];
for (let i = 0; i <= 10; i++) {
const u = i / 10, r = lerp(3, 15.5, u), a = ((a0 + u * 200) * Math.PI) / 180;
pts.push([24 + r * Math.sin(a), 24 - r * Math.cos(a) * 0.82]);
}
return pts;
}
const ARMS = [arm(0), arm(180)];
const STARS = [[10.5, 13, 1.1], [37.5, 35.5, 1.2], [38.5, 12.5, 0.9]];
const __default = defineGlyph({
id: 'galaxy',
title: 'Galaxy Map',
category: 'game',
tags: ['galaxy', 'galaxy map', 'star map', 'spiral', 'space', 'navigate', 'universe'],
draw(g, s) {
const k = enter(s, 0.7);
g.group({ rotate: lerp(-40, 0, k), opacity: lerp(0.3, 1, k) }, () => {
for (const a of ARMS) g.path(smooth(a), { role: 'line' });
});
g.circle(24, 24, 3, { role: 'accent', fill: true });
for (const [x, y, r] of STARS) g.dot(x, y, r, { opacity: k });
},
});
};
__d[99] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BODY = 'M15 15H33C37.2 15 39.6 18.2 40 22.5L40.6 30.5C40.9 34 38.8 36.5 36 36.5C34 36.5 32.8 35.3 31.9 33.4L30.8 31H17.2L16.1 33.4C15.2 35.3 14 36.5 12 36.5C9.2 36.5 7.1 34 7.4 30.5L8 22.5C8.4 18.2 10.8 15 15 15Z';
const __default = defineGlyph({
id: 'gamepad',
title: 'Gamepad',
category: 'game',
tags: ['gamepad', 'controller', 'game', 'game bar', 'joypad', 'play', 'console'],
draw(g, s) {
const p = press(s, 0.35);
g.path(BODY, { join: 'round' });
g.line(12.5, 23.5, 19.5, 23.5, { role: 'line' });
g.line(16, 20, 16, 27, { role: 'line' });
[[31.5, 21.5], [35, 25.5]].forEach(([x, y], i) => {
const k = clamp((s.since - i * 0.12) / 0.3);
g.circle(x, y, 2, { role: i === 0 && p > 0.3 ? 'accent' : 'fill', fill: true, opacity: lerp(0.25, 1, k) });
});
},
});
};
__d[100] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BASE = 38.5;
const __default = defineGlyph({
id: 'height',
title: 'Height',
category: 'game',
tags: ['height', 'altitude', 'elevation', 'raise', 'lower', 'vertical', 'measure', 'path height'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.45);
const top = lerp(26, 11, k) - 1.5 * p;
g.line(8, BASE, 40, BASE, { role: 'dim' });
g.rect(24, top, 13, BASE - top, { r: 3 });
g.line(9.5, top, 18.5, top, { role: 'dim' });
g.line(15, top + 3.5, 15, BASE - 3.5, { role: 'accent' });
g.polyline(chevron([15, top + 2.5], 0, 4.8, 45), { role: 'accent', join: 'round' });
g.polyline(chevron([15, BASE - 2.5], 180, 4.8, 45), { role: 'accent', join: 'round' });
},
});
};
__d[101] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'jetpack',
title: 'Jetpack',
category: 'game',
tags: ['jetpack', 'jet pack', 'fly', 'thrust', 'boost', 'hover', 'jump'],
states: { idle: 'idle', firing: 'active' },
loop: 0.4,
draw(g, s) {
const on = s.state === 'firing';
const k = enter(s, 0.5), p = press(s, 0.5);
g.rect(11.5, 8, 10, 21, { r: 5 });
g.rect(26.5, 8, 10, 21, { r: 5 });
g.line(21.5, 14, 26.5, 14, { role: 'line' });
g.line(21.5, 22, 26.5, 22, { role: 'dim' });
g.polyline([[13.5, 29], [12.5, 32], [20.5, 32], [19.5, 29]], { role: 'line', join: 'round' });
g.polyline([[28.5, 29], [27.5, 32], [35.5, 32], [34.5, 29]], { role: 'line', join: 'round' });
const burn = on ? k : p;
if (burn < 0.02) return;
const flick = on ? 0.8 + 0.2 * Math.sin(s.phase(0.4) * Math.PI * 2) : 1;
for (const cx of [16.5, 31.5]) {
const h = lerp(2, 8.5, clamp(burn)) * flick;
g.path(`M${cx - 3} 33.5C${cx - 3} ${33.5 + h * 0.5} ${cx - 1} ${33.5 + h * 0.8} ${cx} ${33.5 + h}C${cx + 1} ${33.5 + h * 0.8} ${cx + 3} ${33.5 + h * 0.5} ${cx + 3} 33.5Z`, { role: 'accent', fill: true, opacity: 0.9 });
}
},
});
};
__d[102] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter } = __m(24);
const { figure, blend } = __m(93);
__e(__ns, { "default": () => __default }, [], ["default"]);
const AIR = { head: [24, 9], spine: [[24, 14.5], [24, 25]], arms: [[[24, 16], [19, 12.5], [16.5, 8.5]], [[24, 16], [29, 12.5], [31.5, 8.5]]], legs: [[[24, 25], [18.5, 29], [20, 34]], [[24, 25], [29.5, 29], [28, 34]]] };
const LOW = { head: [24, 15], spine: [[24, 20.5], [24, 29]], arms: [[[24, 22], [18.5, 25], [16.5, 29.5]], [[24, 22], [29.5, 25], [31.5, 29.5]]], legs: [[[24, 29], [18, 33], [20, 38.5]], [[24, 29], [30, 33], [28, 38.5]]] };
const __default = defineGlyph({
id: 'jump',
title: 'Jump',
category: 'game',
tags: ['jump', 'leap', 'hop', 'jetpack', 'person', 'action'],
draw(g, s) {
const k = enter(s, 0.5);
const hop = !s.pressed && s.pressAge < 0.5 ? Math.sin(Math.PI * clamp(s.pressAge / 0.5)) : 0;
const t = clamp(k - hop * 0.7);
figure(g, blend(LOW, AIR, t));
g.line(lerp(17, 18.5, t), 40, lerp(31, 29.5, t), 40, { role: 'dim', opacity: lerp(1, 0.7, t) });
},
});
};
__d[103] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'land',
title: 'Land',
category: 'game',
tags: ['land', 'landing', 'touch down', 'exit ship', 'descend', 'pad', 'dock'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.45);
const d = lerp(-4, 0, k) + 2 * p;
g.line(24, 10.5 + d, 24, 25.5 + d);
g.polyline(chevron([24, 27 + d], 180, 8, 45), { role: 'line', join: 'round' });
g.ellipse(24, 35.5, 14, 4, { role: p > 0.3 ? 'accent' : 'line' });
g.line(7, 35.5, 8.5, 35.5, { role: 'dim' });
g.line(39.5, 35.5, 41, 35.5, { role: 'dim' });
},
});
};
__d[104] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp, outExpo } = __m(12);
const { enter, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 24, CY = 24, RX = 7.5, RY = 14;
const __default = defineGlyph({
id: 'roll',
title: 'Roll',
category: 'game',
tags: ['roll', 'barrel roll', 'spin', 'rotate', 'bank', 'flip', 'rolls'],
draw(g, s) {
const k = enter(s, 0.55);
const spin = s.pressed ? 0 : s.pressAge < 0.5 ? outExpo(clamp(s.pressAge / 0.5)) : 1;
g.line(7.5, CY, 40, CY, { role: 'dim' });
g.polyline(chevron([41, CY], 90, 4.5, 45), { role: 'dim', join: 'round' });
g.path(`M${CX} ${CY - RY}A${RX} ${RY} 0 0 0 ${CX} ${CY + RY}`, { role: 'dim', dash: [2.2, 2.6], opacity: lerp(0.3, 1, k) });
const a = lerp(40, 180, k) * (0.85 + 0.15 * spin); 
const pts = [];
for (let i = 0; i <= 16; i++) { const t = ((a * i) / 16) * Math.PI / 180; pts.push([CX + RX * Math.sin(t), CY - RY * Math.cos(t)]); }
g.polyline(pts, { role: 'line', join: 'round' });
const end = pts[pts.length - 1], prev = pts[pts.length - 2];
const dir = (Math.atan2(end[0] - prev[0], -(end[1] - prev[1])) * 180) / Math.PI;
g.polyline(chevron([end[0], end[1]], dir, 5.5, 45), { role: 'accent', join: 'round' });
},
});
};
__d[105] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter } = __m(24);
const { wedge } = __m(44);
const { bump } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BLIPS = [[30.5, 17, 50], [17.5, 30.5, 225], [29, 32.5, 150]]; 
const __default = defineGlyph({
id: 'scanner',
title: 'Scanner',
category: 'game',
tags: ['scanner', 'scan', 'radar', 'sonar', 'detect', 'ping', 'survey'],
states: { idle: 'idle', scanning: 'active' },
loop: 2,
draw(g, s) {
const on = s.state === 'scanning';
const k = enter(s, 0.5);
const a = on ? s.phase(2) * 360 : lerp(-30, 60, k);
g.path(wedge(24, 24, 15, a - 50, a), { role: 'accent', fill: true, opacity: 0.22 });
g.circle(24, 24, 15.5);
g.circle(24, 24, 8.5, { role: 'dim' });
const [x, y] = g.polar(24, 24, 15, a);
g.line(24, 24, x, y, { role: 'accent', weight: 1.05 });
for (const [bx, by, b] of BLIPS) {
const hit = on ? bump(((a - b) / 360 + 1) % 1, 0.08, 0.3, true) : 0;
g.dot(bx, by, 1.6 + hit, { opacity: on ? 0.35 + 0.65 * hit : 0.8 * k });
}
},
});
};
__d[106] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, pulse } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'sun',
title: 'Sun',
category: 'game',
tags: ['sun', 'day', 'daylight', 'brightness', 'light', 'weather', 'time of day'],
hue: 75, 
loop: 2.4,
draw(g, s) {
const k = enter(s, 0.55);
g.circle(24, 24, 7);
for (let i = 0; i < 8; i++) {
const a = i * 45, long = i % 2 === 0;
const r0 = 11, r1 = r0 + lerp(0.3, long ? 5.5 : 3.5, k) * (long ? 0.85 + 0.15 * pulse(s.t, 2.4) : 1);
const [x0, y0] = g.polar(24, 24, r0, a), [x1, y1] = g.polar(24, 24, r1, a);
g.line(x0, y0, x1, y1, { role: long ? 'accent' : 'line' });
}
},
});
};
__d[107] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter } = __m(24);
const { figure, blend } = __m(93);
__e(__ns, { "default": () => __default }, [], ["default"]);
const A = { head: [26.5, 10], spine: [[25.5, 15.5], [23, 26]], arms: [[[25, 17], [19, 22.5], [16.5, 27]], [[25, 17], [30.5, 21.5], [33.5, 26]]], legs: [[[23, 26], [18.5, 32.5], [15.5, 39]], [[23, 26], [27.5, 32], [29, 39]]] };
const B = { head: [26.5, 10], spine: [[25.5, 15.5], [23, 26]], arms: [[[25, 17], [28.5, 22], [31, 26.5]], [[25, 17], [21, 22.5], [19, 27]]], legs: [[[23, 26], [26, 32.5], [27.5, 39]], [[23, 26], [20.5, 32.5], [17.5, 39]]] };
const __default = defineGlyph({
id: 'walk',
title: 'Walk',
category: 'game',
tags: ['walk', 'auto walk', 'move', 'person', 'stroll', 'pedestrian', 'guest'],
states: { idle: 'idle', walking: 'active' },
loop: 1,
draw(g, s) {
const on = s.state === 'walking';
const k = enter(s, 0.5);
const t = on ? 0.5 - 0.5 * Math.cos(s.phase(1) * Math.PI * 2) : 0;
g.group({ x: lerp(-5, 0, k), opacity: lerp(0.3, 1, k) }, () => figure(g, blend(A, B, t), { role: on ? 'accent' : 'line' }));
},
});
};
__d[108] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, smoothstep } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => [a + (i % 2 ? 8 : -4), i % 2 ? 0.5 : 0]);
const __default = defineGlyph({
id: 'warp',
title: 'Warp',
category: 'game',
tags: ['warp', 'hyperdrive', 'jump', 'light speed', 'pulse', 'travel', 'space'],
states: { ready: 'idle', warping: 'active' },
loop: 0.8,
draw(g, s) {
const on = s.state === 'warping';
const k = enter(s, 0.5);
for (const [a, ph] of RAYS) {
if (on) {
const u = (s.phase(0.8) + ph) % 1;
const r0 = lerp(5, 15, u), r1 = r0 + lerp(2.5, 6.5, u);
const op = smoothstep(0, 0.15, u) * (1 - smoothstep(0.75, 1, u));
const [x0, y0] = g.polar(24, 24, r0, a), [x1, y1] = g.polar(24, 24, Math.min(17.5, r1), a);
g.line(x0, y0, x1, y1, { role: 'accent', opacity: op });
} else {
const r0 = ph ? 9 : 7, r1 = r0 + lerp(0.5, ph ? 6 : 9.5, k);
const [x0, y0] = g.polar(24, 24, r0, a), [x1, y1] = g.polar(24, 24, r1, a);
g.line(x0, y0, x1, y1, { role: ph ? 'dim' : 'line' });
}
}
g.circle(24, 24, 2.6, { role: on ? 'accent' : 'fill', fill: true });
},
});
};
__d[109] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'bulb',
title: 'Light Bulb',
category: 'home',
tags: ['light', 'lamp', 'bulb', 'home', 'scene'],
states: { off: 'off', on: 'active' },
hue: 60.4, 
loop: 2.4,
draw(g, s) {
const on = s.state === 'on';
g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
g.line(19, 32.5, 19, 35.5);
g.line(29, 32.5, 29, 35.5);
g.line(19, 35.5, 29, 35.5);
g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
g.polyline([[20.5, 28], [22.5, 23.5], [24, 27], [25.5, 23.5], [27.5, 28]], { role: on ? 'accent' : 'dim', weight: 0.8 });
if (on) {
const k = arrive(s.since, 0.4);
for (const a of [-60, -30, 0, 30, 60]) {
const [x1, y1] = g.polar(24, 22.5, 13, a), [x2, y2] = g.polar(24, 22.5, 13 + 3 * k, a);
g.line(x1, y1, x2, y2, { role: 'accent', opacity: (0.45 + 0.55 * pulse(s.t + a / 120, 2.4)) * k, weight: 0.8 });
}
}
},
});
};
__d[110] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, phase, clamp } = __m(12);
const { polar, arcPath } = __m(15);
const { smoothClosed } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const C = 24;
const BLADE = [[4.6, 34], [10, 27], [15.2, 11], [16.6, -3], [14.8, -14], [9.5, -14], [5, -6]];
const blade = (a) => smoothClosed(BLADE.map(([r, d]) => polar(C, C, r, a + d)));
const __default = defineGlyph({
id: 'fan',
title: 'Fan',
category: 'home',
tags: ['fan', 'air', 'cooling', 'ventilation', 'speed', 'climate', 'home'],
states: { off: 'off', on: 'active' },
hue: 205, 
loop: 1.2,
draw(g, s) {
const on = s.state === 'on';
const speed = 1 + Math.min(3, Math.floor(clamp(s.level) * 4)); 
const rot = on ? phase(s.t, 1.2) * 120 * speed : 0;
const k = on ? arrive(s.since, 0.6) : 0;
const angles = [0, 120, 240].map((d) => rot + d);
const blades = angles.map(blade).join('');
g.path(blades, { role: 'fill', join: 'round' });
if (on && k > 0.02) {
const len = (8 + 9 * speed) * k;
g.path(angles.map((a) => arcPath(C, C, 18.2, a - 14 - len, a - 14)).join(''), { role: 'accent', weight: 0.7, opacity: 0.3 + 0.12 * speed });
}
g.circle(C, C, 2.6, { role: on ? 'spark' : 'dim', fill: true });
},
});
};
__d[111] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LEAF = 'M10.5 37.5C10.5 21 20 10.5 38 9.5C38.5 27.5 28 37.5 12.5 37.5Z';
const __default = defineGlyph({
id: 'leaf',
title: 'Efficiency',
category: 'home',
tags: ['leaf', 'eco', 'efficiency', 'efficiency mode', 'green', 'power saver', 'battery saver'],
states: { off: 'idle', on: 'active' },
hue: 150,
loop: 2.4,
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, 0.5);
const sway = on ? 3 * Math.sin(s.phase(2.4) * Math.PI * 2) * k : 0;
g.group({ rotate: sway + (on ? lerp(-12, 0, k) : 0), origin: [10.5, 37.5] }, () => {
if (on) g.path(LEAF, { role: 'accent', fill: true, opacity: 0.35 * k });
g.path(LEAF, { role: on ? 'accent' : 'line', join: 'round' });
g.path('M10.5 37.5C17 29 23.5 22.5 31 16.5', { role: on ? 'line' : 'dim' });
});
},
});
};
__d[112] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outBack, clamp, phase, smoothstep } = __m(12);
const { along } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CORD = [[35, 38.5], [27.5, 38.5], [24.7, 37.4], [23.5, 34.5], [23.5, 30.5]];
const __default = defineGlyph({
id: 'plug',
title: 'Smart Plug',
category: 'home',
tags: ['plug', 'outlet', 'socket', 'power', 'smart home', 'switch', 'energy'],
states: { off: 'off', on: 'active' },
hue: 150, 
loop: 1.6,
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, 0.35);
const seat = on ? -1.6 * Math.sin(Math.PI * clamp(s.since / 0.35)) : 0;
g.group({ y: seat }, () => {
g.line(19, 8.5, 19, 16.5, { role: on ? 'accent' : 'line' });
g.line(28, 8.5, 28, 16.5, { role: on ? 'accent' : 'line' });
g.path('M13.5 16.5H33.5V22.5A8 8 0 0 1 25.5 30.5H21.5A8 8 0 0 1 13.5 22.5Z', { join: 'round' });
if (on) {
const b = outBack(clamp(s.since / 0.4), 2);
g.group({ scale: Math.max(0.01, b), origin: [23.5, 23.5] }, () => {
g.polygon([[24.8, 18.6], [20.3, 24.4], [23.3, 24.4], [22.2, 28.4], [26.7, 22.6], [23.7, 22.6]], { role: 'accent', fill: true, join: 'round' });
});
}
});
g.path('M23.5 30.5V34.5A4 4 0 0 0 27.5 38.5H35', { role: on ? 'line' : 'dim' });
if (on) {
const p = phase(s.t, 1.6), [x, y] = along(CORD, p);
g.dot(x, y, 1.5, { opacity: k * smoothstep(0, 0.12, p) * (1 - smoothstep(0.82, 1, p)) });
}
},
});
};
__d[113] = function (__ns) {
const { P } = __m(5);
__e(__ns, { "col": () => col, "row": () => row, "digits": () => digits }, [], ["col","digits","row"]);
const K = 2 / 3; 
const PITCH = 2.4, ORIGIN = 7.2;
const col = (c) => ORIGIN + PITCH * c;
const row = (r) => ORIGIN + PITCH * r;
const D = {
0: [['z', [0, 0, 1], [2, 0, 1], [2, 4, 1], [0, 4, 1]]],
1: [[[0, 1, 0], [1, 0, 0.35], [1, 4, 0]]],
2: [[[0, 0, 0], [2, 0, 1], [2, 2, 1], [0, 2, 1], [0, 4, 0], [2, 4, 0]]],
3: [[[0, 0, 0], [2, 0, 1], [2, 4, 1], [0, 4, 0]], [[1, 2, 0], [2, 2, 0]]],
4: [[[0, 0, 0], [0, 2, 0.6], [2, 2, 0]], [[2, 0, 0], [2, 4, 0]]],
5: [[[2, 0, 0], [0, 0, 0], [0, 2, 0], [2, 2, 1], [2, 4, 1], [0, 4, 0]]],
6: [[[2, 0, 0], [0, 0, 1], [0, 4, 1], [2, 4, 1], [2, 2, 1], [0, 2, 0]]],
7: [[[0, 0, 0], [2, 0, 0.3], [1, 2.6, 0.6], [1, 4, 0]]],
8: [['z', [0, 0, 1], [2, 0, 1], [2, 2, 1], [0, 2, 1]], ['z', [0, 2, 1], [2, 2, 1], [2, 4, 1], [0, 4, 1]]],
9: [[[0, 4, 0], [2, 4, 1], [2, 0, 1], [0, 0, 1], [0, 2, 1], [2, 2, 0]]],
};
function strokePath(list, ox, oy) {
const closed = list[0] === 'z';
const pts = (closed ? list.slice(1) : list).map(([x, y, r]) => [ox + x * PITCH, oy + y * PITCH, (r || 0) * PITCH]);
const N = pts.length, p = P();
const cut = (a, b, r) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = Math.min(r, l / 2) / l; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
for (let i = 0; i < N; i++) {
const c = pts[i], r = c[2];
const prev = closed ? pts[(i + N - 1) % N] : pts[i - 1], next = closed ? pts[(i + 1) % N] : pts[i + 1];
if (!prev || !next || r < 0.01) { if (i === 0) p.M(c[0], c[1]); else p.L(c[0], c[1]); continue; }
const a = cut(c, prev, r), b = cut(c, next, r);
if (i === 0) p.M(...a); else p.L(...a);
p.C(a[0] + (c[0] - a[0]) * K, a[1] + (c[1] - a[1]) * K, b[0] + (c[0] - b[0]) * K, b[1] + (c[1] - b[1]) * K, b[0], b[1]); 
}
if (closed) { const c = pts[0], r = c[2]; if (r >= 0.01) { const a = cut(c, pts[N - 1], r); p.L(...a); } p.Z(); }
return p.d;
}
function digits(g, str, { top = 8, role = 'line', weight = 0.85, opacity = 1 } = {}) {
const s = String(str).replace(/[^0-9]/g, '');
const c0 = 7 - (4 * s.length - 1 - 1) / 2; 
[...s].forEach((ch, i) => {
for (const st of D[ch]) g.path(strokePath(st, col(c0 + i * 4), row(top)), { role, weight, opacity, join: 'round', cap: 'round', fill: false });
});
}
};
__d[114] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, phase, lerp, clamp, smoothstep } = __m(12);
const { digits, col, row } = __m(113);
__e(__ns, { "default": () => __default }, [], ["default"]);
const C = 24, R = 15, A0 = -135, A1 = 135;
const __default = defineGlyph({
id: 'thermostat',
title: 'Thermostat',
category: 'home',
tags: ['thermostat', 'temperature', 'heating', 'cooling', 'climate', 'hvac', 'home'],
states: { off: 'off', heat: 'active', cool: 'info' },
hue: 45, 
loop: 1.6,
draw(g, s) {
const mode = s.state;
const k = arrive(s.since, 0.6);
const v = clamp(s.value);
const end = lerp(A0, lerp(A0, A1, v), mode === 'off' ? 1 : k);
g.arc(C, C, R, A0, A1, { role: 'dim', opacity: 0.6 });
if (end - A0 > 0.5) g.arc(C, C, R, A0, end, { role: mode === 'off' ? 'line' : 'accent' });
if (mode !== 'off' && end - A0 > 8) {
const p = phase(s.t, 1.6), u = mode === 'heat' ? p : 1 - p;
const [px, py] = g.polar(C, C, R, lerp(A0, end, u));
g.dot(px, py, 1.5, { opacity: k * smoothstep(0, 0.15, p) * (1 - smoothstep(0.85, 1, p)) });
}
const [kx, ky] = g.polar(C, C, R, end);
g.circle(kx, ky, 2.9, { role: mode === 'off' ? 'fill' : 'spark' });
const unitF = s.params.unit === 'F';
const c = typeof s.params.temp === 'number' ? s.params.temp : 10 + 20 * v;
const shown = clamp(Math.round(unitF && typeof s.params.temp !== 'number' ? c * 1.8 + 32 : c), 0, 99);
digits(g, shown, { top: 5, role: 'line' }); 
const bob = mode === 'off' ? 0 : 0.9 * Math.sin(phase(s.t, 1.6) * Math.PI * 2);
const L = col(6), M = col(7), Rx = col(8), hi = row(11), lo = row(12);
if (mode === 'heat') g.polyline([[L, lo - bob], [M, hi - bob], [Rx, lo - bob]], { role: 'accent', weight: 0.85, join: 'round' });
else if (mode === 'cool') g.polyline([[L, hi + bob], [M, lo + bob], [Rx, hi + bob]], { role: 'accent', weight: 0.85, join: 'round' });
else g.line(L, row(11.5), Rx, row(11.5), { role: 'dim', weight: 0.85 });
},
});
};
__d[115] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'artist',
title: 'Artist',
category: 'media',
tags: ['artist', 'artists', 'musician', 'singer', 'performer', 'band', 'music'],
draw(g, s) {
const k = enter(s, 0.5);
const hop = !s.pressed && s.pressAge < 0.4 ? -2.5 * Math.sin(Math.PI * clamp(s.pressAge / 0.4)) : 0;
g.circle(19.5, 17.5, 6);
g.path('M8 39.5A11.5 11 0 0 1 31 39.5', { role: 'line' });
g.group({ y: lerp(4, 0, k) + hop, opacity: k }, () => {
g.line(37.5, 9.5, 37.5, 22, { role: 'accent', weight: 0.95 });
g.path('M37.5 9.5C39 11.5 41 12 41 15', { role: 'accent', weight: 0.85 });
g.ellipse(35, 22.5, 2.9, 2.3, { role: 'accent', fill: true });
});
},
});
};
__d[116] = function (__ns) {
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "drawChapter": () => drawChapter }, [], ["drawChapter"]);
function drawChapter(g, s, dir) {
const k = enter(s, 0.45), p = press(s, 0.4);
const X = (x) => (dir > 0 ? x : 48 - x);
const dx = lerp(-3, 0, k) + 1.5 * p;
g.polygon([[X(15 + dx), 11], [X(27 + dx), 19.5], [X(15 + dx), 28]], { role: 'fill', join: 'round', opacity: lerp(0.4, 1, k) });
g.rect(Math.min(X(29.5), X(33.5)), 11, 4, 17, { r: 1.5, role: 'fill' });
[[8, 18], [21.5, 28.5], [32, 40]].forEach(([a, b], i) => {
const lit = dir > 0 ? i === 2 : i === 0;
g.line(X(a), 36.5, X(b), 36.5, { role: lit ? 'accent' : 'dim', weight: lit ? 1.1 : 1, opacity: lit ? lerp(0.6, 1, p) : 1 });
});
}
};
__d[117] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawChapter } = __m(116);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'chapter-next',
title: 'Next Chapter',
category: 'media',
tags: ['next chapter', 'chapter', 'chapters', 'skip', 'section', 'timeline', 'video'],
draw(g, s) { drawChapter(g, s, 1); },
});
};
__d[118] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawChapter } = __m(116);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'chapter-prev',
title: 'Previous Chapter',
category: 'media',
tags: ['previous chapter', 'chapter', 'chapters', 'back', 'section', 'timeline', 'video'],
draw(g, s) { drawChapter(g, s, -1); },
});
};
__d[119] = function (__ns) {
const { lerp, clamp, outExpo } = __m(12);
const { enter } = __m(24);
const { arcHead } = __m(26);
const { digits } = __m(113);
__e(__ns, { "drawSeek": () => drawSeek }, [], ["drawSeek"]);
const R = 13.5;
function drawSeek(g, s, dir, mark) {
const k = enter(s, 0.5);
const spin = s.pressed ? 0 : s.pressAge < 0.45 ? 1 - outExpo(clamp(s.pressAge / 0.45)) : 0;
const head = dir > 0 ? 360 : 0, tail = head - dir * lerp(150, 300, k);
const turn = dir * 24 * spin;
g.group({ rotate: turn, origin: [24, 24] }, () => {
g.arc(24, 24, R, Math.min(head, tail), Math.max(head, tail), { role: 'line' });
g.polyline(arcHead(24, 24, R, head, { size: 4.2, dir }), { role: spin > 0.3 ? 'accent' : 'line', join: 'round' });
});
if (mark === 'play') g.polygon([[21, 18.5], [30, 24], [21, 29.5]], { role: 'fill', join: 'round', opacity: lerp(0.3, 1, k) });
else digits(g, mark, { top: 5, role: 'accent', weight: 0.85, opacity: lerp(0.3, 1, k) });
}
};
__d[120] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSeek } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'forward-10',
title: 'Forward 10 s',
category: 'media',
tags: ['forward 10', 'skip forward', 'seek forward', 'fast forward', 'ff', '10 seconds', 'media'],
draw(g, s) { drawSeek(g, s, 1, '10'); },
});
};
__d[121] = function (__ns) {
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "drawFrameStep": () => drawFrameStep }, [], ["drawFrameStep"]);
function drawFrameStep(g, s, dir) {
const k = enter(s, 0.45), p = press(s, 0.4);
const X = (x) => (dir > 0 ? x : 48 - x);
const dx = (lerp(-3.5, 0, k) + 1.5 * p) * dir;
g.group({ x: dx }, () => {
const x0 = Math.min(X(7.5), X(29.5));
g.rect(x0, 11, 22, 26, { r: 3.5 });
for (const y of [14.5, 33.5]) for (const i of [0, 1, 2]) g.circle(x0 + 5.5 + i * 5.5, y, 1.1, { role: 'dim', fill: true });
g.line(x0, 18.5, x0 + 22, 18.5, { role: 'dim' });
g.line(x0, 29.5, x0 + 22, 29.5, { role: 'dim' });
});
g.polygon([[X(34), 18], [X(40.5), 24], [X(34), 30]], { role: p > 0.3 ? 'accent' : 'fill', join: 'round' });
}
};
__d[122] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawFrameStep } = __m(121);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'frame-next',
title: 'Next Frame',
category: 'media',
tags: ['next frame', 'frame', 'step', 'frame advance', 'film', 'video'],
draw(g, s) { drawFrameStep(g, s, 1); },
});
};
__d[123] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawFrameStep } = __m(121);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'frame-prev',
title: 'Previous Frame',
category: 'media',
tags: ['previous frame', 'frame', 'step back', 'frame', 'film', 'video'],
draw(g, s) { drawFrameStep(g, s, -1); },
});
};
__d[124] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive } = __m(12);
const { P } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const PLAY = [[[16, 11], [26.5, 17.5], [26.5, 30.5], [16, 37]], [[26.5, 17.5], [37, 24], [37, 24], [26.5, 30.5]]];
const PAUSE = [[[14.5, 11], [21.5, 11], [21.5, 37], [14.5, 37]], [[26.5, 11], [33.5, 11], [33.5, 37], [26.5, 37]]];
const lerpPts = (a, b, k) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);
const __default = defineGlyph({
id: 'play-pause',
title: 'Play / Pause',
category: 'media',
tags: ['play', 'pause', 'transport', 'media', 'music'],
states: { paused: 'idle', playing: 'active' },
draw(g, s) {
const m = arrive(s.since, 0.3);
const k = s.state === 'playing' ? m : 1 - m; 
const p = P();
for (let i = 0; i < 2; i++) { const q = lerpPts(PLAY[i], PAUSE[i], k); p.M(...q[0]); for (const v of q.slice(1)) p.L(...v); p.Z(); }
g.path(p.d, { role: 'fill', join: 'round' });
},
});
};
__d[125] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'queue',
title: 'Queue',
category: 'media',
tags: ['queue', 'up next', 'playlist', 'list', 'next up', 'tracks', 'music'],
draw(g, s) {
const p = press(s, 0.45);
[[12, 40], [20, 40], [28, 30]].forEach(([y, x1], i) => {
const k = enter({ since: s.since - i * 0.07 }, 0.4);
g.line(8, y + lerp(3, 0, k) - 2 * p, x1, y + lerp(3, 0, k) - 2 * p, { role: 'dim', opacity: lerp(0.2, 1, k) });
});
g.line(8, 36, 24, 36, { role: 'line' });
g.polygon([[30, 31], [38.5, 36], [30, 41]], { role: p > 0.3 ? 'accent' : 'fill', join: 'round' });
},
});
};
__d[126] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, lerp, outBack, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const R = 15.5; 
const SEGS = 12; 
const __default = defineGlyph({
id: 'record',
title: 'Record',
category: 'media',
tags: ['record', 'rec', 'capture', 'arm', 'recording', 'transport', 'stream'],
states: { ready: 'idle', armed: 'warn', recording: 'alert' },
loop: 2.4,
draw(g, s) {
const k = arrive(s.since, 0.45);
if (s.state === 'ready') {
g.circle(24, 24, R, { role: 'dim' });
g.circle(24, 24, 8.5, { role: 'fill' });
return;
}
if (s.state === 'armed') {
const step = 360 / SEGS, gap = lerp(step * 0.5, step * 0.42, k);
const rot = s.phase(2.4) * step;
for (let i = 0; i < SEGS; i++) {
const a = i * step + rot;
g.arc(24, 24, R, a + gap / 2, a + step - gap / 2, { role: 'line', cap: 'round' });
}
const b = pulse(s.t, 1.2);
g.circle(24, 24, 8.5, { role: 'accent', fill: true, opacity: 0.45 + 0.55 * b });
return;
}
const close = k;
const step = 360 / SEGS, gap = step * 0.42 * (1 - close);
if (gap > 0.5) for (let i = 0; i < SEGS; i++) g.arc(24, 24, R, i * step + gap / 2, (i + 1) * step - gap / 2, { role: 'line' });
else g.circle(24, 24, R, { role: 'line' });
const head = s.phase(2.4) * 360;
g.arc(24, 24, R, head - 70, head, { role: 'accent', opacity: 0.85 * close, weight: 1.05 });
const [hx, hy] = g.polar(24, 24, R, head);
g.dot(hx, hy, 2.1, { opacity: close });
const swell = lerp(8.5, 9.5, outBack(clamp(s.since / 0.5)));
const beat = 1 - 0.06 * pulse(s.t, 1.2);
g.circle(24, 24, swell * beat, { role: 'accent', fill: true });
},
});
};
__d[127] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSeek } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'replay',
title: 'Replay',
category: 'media',
tags: ['replay', 'instant replay', 'replay buffer', 'save replay', 'again', 'clip', 'media'],
draw(g, s) { drawSeek(g, s, -1, 'play'); },
});
};
__d[128] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSeek } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'rewind-10',
title: 'Back 10 s',
category: 'media',
tags: ['rewind 10', 'back 10', 'skip back', 'seek back', 'rewind', '10 seconds', 'media'],
draw(g, s) { drawSeek(g, s, -1, '10'); },
});
};
__d[129] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, smoothstep } = __m(12);
const { n } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const DX = 1.5; 
const Y0 = 15.5, Y1 = 32.5;
const X0 = 13.5 + DX, XC0 = 20.5 + DX, XC1 = 21.5 + DX, XE = 28.5 + DX, X1 = 37 + DX, XS = 8 + DX;
const cubic = (p0, p1, p2, p3, t) => {
const u = 1 - t;
return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};
function subCubic(P, t0, t1) {
const split = (Q, t) => {
const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const a = l(Q[0], Q[1]), b = l(Q[1], Q[2]), c = l(Q[2], Q[3]), d = l(a, b), e = l(b, c), f = l(d, e);
return [[Q[0], a, d, f], [f, e, c, Q[3]]];
};
const right = split(P, t0)[1];
return split(right, (t1 - t0) / (1 - t0))[0];
}
const ctrl = (ya, yb) => [[X0, ya], [XC0, ya], [XC1, yb], [XE, yb]];
const pt = (p) => `${n(p[0])} ${n(p[1])}`;
const seg = (Q) => `C${pt(Q[1])} ${pt(Q[2])} ${pt(Q[3])}`;
function along(ya, yb, u, under) {
const L1 = X0 - XS, LC = 27, L2 = X1 - XE, T = L1 + LC + L2;
const d = u * T;
if (d < L1) return [XS + d, ya, false];
if (d < L1 + LC) { const t = (d - L1) / LC; return [...cubic(...ctrl(ya, yb), t), under && t > 0.37 && t < 0.63]; }
return [XE + (d - L1 - LC), yb, false];
}
const __default = defineGlyph({
id: 'shuffle',
title: 'Shuffle',
category: 'media',
tags: ['shuffle', 'random', 'mix', 'playlist', 'media'],
states: { off: 'idle', on: 'active' },
loop: 2.4,
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, 0.45);
const base = { role: 'line', opacity: on ? lerp(1, 0.7, k) : 1 };
const B = ctrl(Y1, Y0);
const b1 = subCubic(B, 0, 0.37), b2 = subCubic(B, 0.63, 1);
g.path(`M${XS} ${Y1}H${X0}${seg(b1)}`, base);
g.path(`M${pt(b2[0])}${seg(b2)}H${X1}`, base);
g.path(`M${XS} ${Y0}H${X0}${seg(ctrl(Y0, Y1))}H${X1}`, base);
const push = on ? lerp(-3, 0, k) : 0;
for (const y of [Y0, Y1]) {
const x = X1 + push;
g.polyline([[x - 4.5, y - 4.5], [x, y], [x - 4.5, y + 4.5]], { role: on ? 'accent' : 'line' });
}
if (!on) return;
for (const [ya, yb, off, under] of [[Y0, Y1, 0, false], [Y1, Y0, 0.5, true]]) {
const u = (s.phase(2.4) + off) % 1;
const fade = smoothstep(0, 0.1, u) * (1 - smoothstep(0.8, 0.95, u)) * k;
if (fade < 0.02) continue;
const pts = [];
for (let j = 0; j <= 6; j++) pts.push(along(ya, yb, Math.max(0, u - 0.2 + (0.2 * j) / 6), under));
let run = [];
const flush = () => { if (run.length > 1) g.polyline(run, { role: 'accent', weight: 1.45, opacity: fade }); run = []; };
for (const p of pts) { if (p[2]) flush(); else run.push([p[0], p[1]]); }
flush();
const head = pts[pts.length - 1];
if (!head[2]) g.dot(head[0], head[1], 2.5, { opacity: fade });
}
},
});
};
__d[130] = function (__ns) {
const { arrive, outExpo, clamp, lerp } = __m(12);
__e(__ns, { "drawSkip": () => drawSkip }, [], ["drawSkip"]);
const TRI_A = [[9, 13], [21, 24], [9, 35]];
const TRI_B = [[21, 13], [33, 24], [21, 35]];
function drawSkip(g, s, dir) {
const X = (x) => (dir > 0 ? x + 0.5 : 48 - (x + 0.5));
const enter = arrive(s.since, 0.4);
const pressK = s.pressed ? 1 : s.pressAge < 0.5 ? 1 - outExpo(clamp(s.pressAge / 0.5)) : 0;
const shove = -3 * (1 - enter) + 2 * pressK; 
const pts = (tri, dx) => tri.map(([x, y]) => [X(x + dx), y]);
g.rect(Math.min(X(34), X(38)), 13, 4, 22, { r: 1.6, role: 'fill' });
g.polygon(pts(TRI_A, shove), { role: 'fill', opacity: lerp(0.4, 1, enter) });
g.polygon(pts(TRI_B, shove), { role: 'fill', opacity: lerp(0.4, 1, enter) });
if (!s.pressed && s.pressAge < 0.45) {
const e = outExpo(clamp(s.pressAge / 0.45));
g.polygon(pts(TRI_B, 2 + 6 * e), { role: 'fill', opacity: 0.6 * (1 - e) });
}
}
};
__d[131] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSkip } = __m(130);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'skip-next',
title: 'Next Track',
category: 'media',
tags: ['next', 'skip', 'forward', 'track', 'transport', 'media'],
draw(g, s) { drawSkip(g, s, 1); },
});
};
__d[132] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSkip } = __m(130);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'skip-prev',
title: 'Previous Track',
category: 'media',
tags: ['previous', 'skip', 'back', 'rewind', 'track', 'transport', 'media'],
draw(g, s) { drawSkip(g, s, -1); },
});
};
__d[133] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 24, CY = 27, R = 15, A0 = -120, A1 = 120;
const __default = defineGlyph({
id: 'speed',
title: 'Speed',
category: 'media',
tags: ['speed', 'playback speed', 'game speed', 'fast', 'slow', 'pace', 'gauge', 'rate'],
states: { normal: 'idle', fast: 'active' },
loop: 0.6,
draw(g, s) {
const fast = s.state === 'fast';
const k = enter(s, 0.6);
const lv = clamp(fast ? Math.max(s.level, 0.8) : s.level);
const a = lerp(A0, lerp(A0, A1, lv), k) + (fast ? 1.6 * Math.sin(s.phase(0.6) * Math.PI * 2) : 0);
g.arc(CX, CY, R, A0, A1, { role: 'dim' });
if (a > A0 + 1) g.arc(CX, CY, R, A0, a, { role: fast ? 'accent' : 'line' });
for (const t of [-60, 0, 60]) { const [x0, y0] = g.polar(CX, CY, R - 4.5, t), [x1, y1] = g.polar(CX, CY, R - 2.5, t); g.line(x0, y0, x1, y1, { role: 'dim', weight: 0.8 }); }
const [nx, ny] = g.polar(CX, CY, R - 5, a);
g.line(CX, CY, nx, ny, { role: 'accent', weight: 1.05 });
g.circle(CX, CY, 2.6, { role: 'fill' });
},
});
};
__d[134] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'stop',
title: 'Stop',
category: 'media',
tags: ['stop', 'transport', 'media', 'end', 'halt'],
states: { ready: 'idle', stopped: 'active' },
draw(g, s) {
const stopped = s.state === 'stopped';
const k = arrive(s.since, 0.42);
const h = lerp(stopped ? 14.5 : 13.5, 13, k); 
g.rect(24 - h, 24 - h, h * 2, h * 2, { r: 4.5, role: stopped ? 'accent' : 'fill', fill: true });
if (stopped && k < 0.999) {
const o = lerp(4.5, 1.5, k), L = 5, op = 1 - k;
for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
const cx = 24 + sx * (13 + o), cy = 24 + sy * (13 + o);
g.polyline([[cx, cy - sy * L], [cx, cy], [cx - sx * L, cy]], { role: 'accent', opacity: op, weight: 0.8 });
}
}
},
});
};
__d[135] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'address-bar',
title: 'Address Bar',
category: 'nav',
tags: ['address bar', 'url', 'omnibox', 'location', 'web address', 'browser', 'search'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.4);
g.rect(6.5, 16, 35, 16, { r: 8, role: p > 0.3 ? 'accent' : 'line' });
g.circle(14.5, 24, 2.8, { role: 'dim' });
const end = lerp(20.5, 31, k);
g.line(20.5, 24, end, 24, { role: 'line' });
g.line(end + 3, 20, end + 3, 28, { role: 'accent', weight: 0.9, opacity: lerp(0.4, 1, k) });
},
});
};
__d[136] = function (__ns) {
const { lerp } = __m(12);
const { enter, press, chevron, xf, xfPts, rot } = __m(24);
__e(__ns, { "drawArrow": () => drawArrow }, [], ["drawArrow"]);
function drawArrow(g, s, dir, { bar = false } = {}) {
const k = enter(s, 0.45), p = press(s, 0.45);
const M = rot(dir);
const d = lerp(-4, 0, k) + 2 * p; 
const top = bar ? 15.5 : 10.5;
const [a, b] = xfPts([[24, 38.5 - d], [24, top + 1 - d]], M);
g.line(a[0], a[1], b[0], b[1], { opacity: lerp(0.3, 1, k) });
g.polyline(xfPts(chevron([24, top - d], 0, 11, 45), M), { role: p > 0.3 ? 'accent' : 'line', join: 'round', opacity: lerp(0.3, 1, k) });
if (bar) g.path(xf('M11 9.5H37', M), { role: 'accent', weight: 1.05 });
}
};
__d[137] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawArrow } = __m(136);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'arrow-down',
title: 'Arrow Down',
category: 'nav',
tags: ['down', 'lower', 'decrease', 'arrow', 'move down', 'navigation'],
draw(g, s) { drawArrow(g, s, 180); },
});
};
__d[138] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawArrow } = __m(136);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'arrow-left',
title: 'Arrow Left',
category: 'nav',
tags: ['left', 'previous', 'arrow', 'move left', 'navigation'],
draw(g, s) { drawArrow(g, s, 270); },
});
};
__d[139] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawArrow } = __m(136);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'arrow-right',
title: 'Arrow Right',
category: 'nav',
tags: ['right', 'next', 'arrow', 'move right', 'navigation'],
draw(g, s) { drawArrow(g, s, 90); },
});
};
__d[140] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawArrow } = __m(136);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'arrow-up',
title: 'Arrow Up',
category: 'nav',
tags: ['up', 'raise', 'increase', 'higher', 'arrow', 'move up', 'navigation'],
draw(g, s) { drawArrow(g, s, 0); },
});
};
__d[141] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outExpo, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'back',
title: 'Back',
category: 'nav',
tags: ['back', 'return', 'previous', 'undo', 'exit', 'navigation', 'folder up'],
draw(g, s) {
const k = arrive(s.since, 0.45);
const pull = s.pressed ? 1 : s.pressAge < 0.45 ? 1 - outExpo(clamp(s.pressAge / 0.45)) : 0;
const dx = 4 * (1 - k) - 2.5 * pull;
g.group({ x: dx, opacity: 0.3 + 0.7 * k }, () => {
g.path('M11 19H27.5A9 9 0 0 1 27.5 37H19.5');
g.polyline([[18, 11.5], [10.5, 19], [18, 26.5]], { role: pull > 0.3 ? 'accent' : 'line', join: 'round' });
});
},
});
};
__d[142] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'close',
title: 'Close',
category: 'nav',
tags: ['close', 'x', 'dismiss', 'exit', 'close tab', 'close window', 'cancel', 'kill'],
draw(g, s) {
const k = enter(s, 0.4), p = press(s, 0.4);
const h = lerp(3, 13, k) - 1.5 * p; 
const role = p > 0.3 ? 'accent' : 'line';
g.line(24 - h, 24 - h, 24 + h, 24 + h, { role, weight: 1.05 });
g.line(24 + h, 24 - h, 24 - h, 24 + h, { role, weight: 1.05 });
},
});
};
__d[143] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { P } = __m(5);
const { roundedPoly } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const L = 8.5, TOP = 11, TAB = 14, BOT = 38;
const __default = defineGlyph({
id: 'folder',
title: 'Folder',
category: 'nav',
tags: ['folder', 'directory', 'files', 'open', 'browse', 'navigation', 'profile'],
states: { closed: 'idle', open: 'active' },
draw(g, s) {
const m = arrive(s.since, 0.42);
const k = s.state === 'open' ? m : 1 - m; 
const xr = lerp(39.5, 36.5, k), yb = lerp(21, 24, k);
g.path(P().M(L, BOT - 3).V(TAB).A(3, 3, 0, 0, 1, L + 3, TOP).H(18.4).A(2, 2, 0, 0, 1, 20, TOP + 0.8).L(22.5, TAB).H(xr - 3).A(3, 3, 0, 0, 1, xr, TAB + 3).V(yb).d);
if (k > 0.02) {
const st = lerp(24, 18.5, k);
g.path(P().M(13.5, 24).V(st + 1.5).A(1.5, 1.5, 0, 0, 1, 15, st).H(30.5).A(1.5, 1.5, 0, 0, 1, 32, st + 1.5).V(24).d, { role: 'accent', weight: 0.85, opacity: k });
}
const fy = lerp(18.5, 23.5, k);
const front = [[L, fy], [lerp(39.5, 40.5, k), fy], [lerp(39.5, 36.5, k), BOT], [lerp(L, L, k), BOT]];
front[0][0] = lerp(L, 12.5, k);
g.path(roundedPoly(front, [lerp(0, 2, k), lerp(0, 2, k), 3, 3]), { role: 'line', join: 'round' });
},
});
};
__d[144] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const L = 9; 
const __default = defineGlyph({
id: 'fullscreen',
title: 'Full Screen',
category: 'nav',
tags: ['fullscreen', 'full screen', 'maximize', 'expand', 'theater', 'exit full screen', 'video'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const m = arrive(s.since, 0.4);
const k = on ? m : 1 - m; 
for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
const cx = 24 + sx * lerp(15.5, 7.5, k), cy = 24 + sy * lerp(15.5, 7.5, k);
const ax = lerp(-sx, sx, k) * L, ay = lerp(-sy, sy, k) * L;
g.polyline([[cx + ax, cy], [cx, cy], [cx, cy + ay]], { role: on ? 'accent' : 'line', join: 'round', weight: 1.05 });
}
},
});
};
__d[145] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'goto-line',
title: 'Go to Line',
category: 'nav',
tags: ['go to line', 'line', 'jump', 'line number', 'navigate', 'code'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
g.line(20, 12, 40, 12, { role: 'dim' });
g.line(20, 24, 40, 24, { role: 'accent', weight: 1.05 });
g.line(20, 36, 34, 36, { role: 'dim' });
const x = lerp(12.5, 15, k) + 1.2 * p;
g.line(x - 6, 24, x - 0.5, 24, { role: 'line', opacity: k });
g.polyline(chevron([x, 24], 90, 5.5, 45), { role: 'line', join: 'round', opacity: k });
},
});
};
__d[146] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outExpo, clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'home',
title: 'Home',
category: 'nav',
tags: ['home', 'house', 'start', 'main', 'navigation', 'back to top'],
draw(g, s) {
const k = arrive(s.since, 0.5);
const glow = s.pressed ? 1 : s.pressAge < 0.6 ? 1 - outExpo(clamp(s.pressAge / 0.6)) : 0;
g.path('M13 21V35.5A3 3 0 0 0 16 38.5H32A3 3 0 0 0 35 35.5V21');
if (glow > 0.01) g.path('M20.5 38.5V31.5A3.5 3.5 0 0 1 27.5 31.5V38.5Z', { role: 'accent', fill: true, opacity: 0.85 * glow });
g.path('M20.5 38.5V31.5A3.5 3.5 0 0 1 27.5 31.5V38.5', { role: glow > 0.5 ? 'accent' : 'dim' });
g.group({ y: -3.5 * (1 - k), opacity: 0.35 + 0.65 * k }, () => {
g.polyline([[8.5, 23.5], [24, 10], [39.5, 23.5]], { role: 'line', join: 'round', weight: 1.08 });
});
},
});
};
__d[147] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press, xf, rot } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const M = rot(-45);
const __default = defineGlyph({
id: 'link',
title: 'Link',
category: 'nav',
tags: ['link', 'url', 'hyperlink', 'chain', 'copy link', 'insert link', 'attach'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const o = lerp(3.5, 0, k) + 1.4 * p; 
const op = lerp(0.35, 1, k);
g.path(xf(`M${21 - o} 17H${14.5 - o}A7 7 0 0 0 ${14.5 - o} 31H${21 - o}`, M), { role: 'line', opacity: op });
g.path(xf(`M${27 + o} 17H${33.5 + o}A7 7 0 0 1 ${33.5 + o} 31H${27 + o}`, M), { role: p > 0.3 ? 'accent' : 'line', opacity: op });
g.path(xf('M18.5 24H29.5', M), { role: 'line', weight: 1.05 });
},
});
};
__d[148] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outExpo, clamp, lerp } = __m(12);
const { P } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'pages',
title: 'Pages',
category: 'nav',
tags: ['pages', 'page', 'next page', 'profile', 'switch', 'documents', 'navigation'],
draw(g, s) {
const fan = arrive(s.since, 0.5);
const turn = s.pressed ? 1 : s.pressAge < 0.5 ? 1 - outExpo(clamp(s.pressAge / 0.5)) : 0;
const bx = lerp(-6, 0, fan) - 2.5 * turn, by = lerp(4.5, 0, fan) + 1.5 * turn;
g.group({ x: bx, y: by, opacity: lerp(0.4, 1, fan) }, () => {
g.path(P().M(16.5, 9.5).H(34).A(3.5, 3.5, 0, 0, 1, 37.5, 13).V(32.5).d, { role: turn > 0.4 ? 'accent' : 'dim' });
});
g.group({ x: -3 * turn, opacity: 1 - 0.45 * turn }, () => {
g.rect(10.5, 14, 22, 26, { r: 3.5 });
g.line(15.5, 21.5, 27.5, 21.5, { role: 'dim' });
g.line(15.5, 26.5, 27.5, 26.5, { role: 'dim' });
g.line(15.5, 31.5, 22.5, 31.5, { role: 'dim' });
});
},
});
};
__d[149] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { xf, rot } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HEAD = 'M17 8.5H31M19.5 8.5V18.5L14 25.5H34L28.5 18.5V8.5';
const HEAD_FILL = 'M19.5 8.5H28.5V18.5L34 25.5H14L19.5 18.5Z';
const __default = defineGlyph({
id: 'pin',
title: 'Pin',
category: 'nav',
tags: ['pin', 'pinned', 'keep on top', 'always on top', 'stick', 'favorite', 'tack'],
states: { unpinned: 'idle', pinned: 'active' },
draw(g, s) {
const on = s.state === 'pinned';
const m = arrive(s.since, 0.4);
const k = on ? m : 1 - m; 
const M = rot(lerp(30, 0, k), [24, 30]);
const dy = lerp(0, 2, k);
const T = (d) => xf(d, [M[0], M[1], M[2], M[3], M[4], M[5] + dy]);
if (k > 0.02) g.path(T(HEAD_FILL), { role: 'accent', fill: true, opacity: 0.85 * k });
g.path(T(HEAD), { role: on ? 'accent' : 'line', join: 'round' });
g.path(T(`M24 25.5V${lerp(39.5, 37.5, k)}`), { role: 'line', weight: 1.05 });
},
});
};
__d[150] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'radial',
title: 'Radial Menu',
category: 'nav',
tags: ['radial', 'radial menu', 'pie menu', 'wheel', 'quick menu', 'ring', 'select'],
draw(g, s) {
const k = enter(s, 0.5);
const pick = !s.pressed && s.pressAge < 0.6 ? 1 : 0;
const r = lerp(8, 15, k);
[0, 90, 180, 270].forEach((a, i) => {
const lit = i === pick;
g.arc(24, 24, r, a - 33, a + 33, { role: lit ? 'accent' : 'line', weight: lit ? 1.15 : 1 });
});
g.circle(24, 24, 4.5, { role: 'line' });
},
});
};
__d[151] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawArrow } = __m(136);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'scroll-bottom',
title: 'Scroll to Bottom',
category: 'nav',
tags: ['bottom', 'scroll to bottom', 'page bottom', 'last', 'end', 'navigation'],
draw(g, s) { drawArrow(g, s, 180, { bar: true }); },
});
};
__d[152] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawArrow } = __m(136);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'scroll-top',
title: 'Scroll to Top',
category: 'nav',
tags: ['top', 'scroll to top', 'page top', 'first', 'home', 'navigation'],
draw(g, s) { drawArrow(g, s, 0, { bar: true }); },
});
};
__d[153] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'scroll',
title: 'Scroll',
category: 'nav',
tags: ['scroll', 'mouse', 'wheel', 'page', 'scroll up', 'scroll down', 'navigation'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
g.rect(13.5, 7.5, 21, 33, { r: 10.5 });
g.line(13.5, 21.5, 34.5, 21.5, { role: 'dim' });
g.line(24, 7.5, 24, 12, { role: 'dim' });
g.rect(21.5, 12 + 0.6 * p, 5, 7.5, { r: 2.5, role: p > 0.3 ? 'accent' : 'line', opacity: lerp(0.4, 1, k) });
const tread = lerp(14, 17.5, clamp(s.level));
g.line(23, tread, 25, tread, { role: 'accent', weight: 0.7, opacity: k });
},
});
};
__d[154] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, phase, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 21, CY = 21, R = 10.5;
const __default = defineGlyph({
id: 'search',
title: 'Search',
category: 'nav',
tags: ['search', 'find', 'magnifier', 'lookup', 'zoom', 'filter', 'navigation'],
states: { idle: 'idle', searching: 'busy' },
loop: 1.6,
draw(g, s) {
const busy = s.state === 'searching';
const k = busy ? arrive(s.since, 0.5) : 0;
const p = phase(s.t, 1.6);
const ox = 2.2 * k * Math.sin(p * Math.PI * 2), oy = 1.6 * k * Math.sin(p * Math.PI * 4);
g.group({ x: ox, y: oy }, () => {
g.circle(CX, CY, R);
const [x0, y0] = g.polar(CX, CY, R + 1.6, 135), [x1, y1] = g.polar(CX, CY, 23.5, 135);
g.line(x0, y0, x1, y1, { role: 'line', weight: 1.25 });
const a = busy ? lerp(-62, -62 + 360 * p, k) : -62;
g.arc(CX, CY, 6.5, a - 32, a + 18, { role: busy ? 'accent' : 'dim', weight: 0.85 });
});
},
});
};
__d[155] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const X0 = 7, Y0 = 9.5, X1 = 41, Y1 = 38.5, R = 4.5, ROW = 17.5, END = 31;
const __default = defineGlyph({
id: 'tab-group',
title: 'Tab Group',
category: 'nav',
tags: ['tab group', 'group tabs', 'new group', 'tabs', 'organize', 'browser'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.4);
g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: R });
g.rect(10.5, 11.5, 5, 4, { r: 2, role: 'accent', fill: true, opacity: p > 0.3 ? 1 : 0.85 });
g.line(22.5, Y0 + 2, 22.5, ROW - 2, { role: 'dim' });
g.line(END, Y0, END, ROW, { role: 'line' });
g.line(END, ROW, X1, ROW, { role: 'line' });
g.line(X0, ROW, lerp(X0, END, k), ROW, { role: 'accent', weight: 1.1 });
g.line(12, 25, 30, 25, { role: 'dim', opacity: k });
g.line(12, 31.5, 24, 31.5, { role: 'dim', opacity: k });
},
});
};
__d[156] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { P } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const X0 = 7, Y0 = 9.5, X1 = 41, Y1 = 38.5, R = 4.5, ROW = 17;
const __default = defineGlyph({
id: 'tab',
title: 'Tab',
category: 'nav',
tags: ['tab', 'tabs', 'switch tab', 'tab 1', 'browser', 'page', 'navigation'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const w = lerp(6, 14, k); 
g.path(P().M(X0 + w, ROW).V(Y0).H(X0 + R).A(R, R, 0, 0, 0, X0, Y0 + R).V(ROW).Z().d, { role: 'accent', fill: true, opacity: lerp(0.25, 0.4, p) });
g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: R });
g.line(X0 + w, ROW, X1, ROW, { role: 'line' });
g.line(X0 + w, Y0, X0 + w, ROW, { role: p > 0.3 ? 'accent' : 'line' });
g.line(X0 + w + 11, Y0 + 2.5, X0 + w + 11, ROW - 2.5, { role: 'dim', opacity: k });
g.line(12, 24.5, 30, 24.5, { role: 'dim', opacity: k });
},
});
};
__d[157] = function (__ns) {
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { digits } = __m(113);
__e(__ns, { "drawZoom": () => drawZoom }, [], ["drawZoom"]);
const CX = 21, CY = 21, R = 11.5;
function drawZoom(g, s, mode) {
const k = enter(s, 0.45), p = press(s, 0.4);
const r = R + (mode === 'out' ? -0.8 : 0.8) * p;
g.circle(CX, CY, r);
const [x0, y0] = g.polar(CX, CY, r + 1.6, 135), [x1, y1] = g.polar(CX, CY, 24.5, 135);
g.line(x0, y0, x1, y1, { role: 'line', weight: 1.25 });
const h = lerp(1.5, 5, k), role = 'accent';
if (mode === 'in' || mode === 'out') g.line(CX - h, CY, CX + h, CY, { role, weight: 1.05 });
if (mode === 'in') g.line(CX, CY - h, CX, CY + h, { role, weight: 1.05 });
if (mode === 'reset') g.group({ x: CX - 24, y: 0, opacity: k }, () => {
digits(g, '11', { top: 4, role: 'accent', weight: 0.85 });
g.circle(22.8, 19.6, 1.2, { role: 'accent', fill: true });
g.circle(22.8, 23.6, 1.2, { role: 'accent', fill: true });
});
}
};
__d[158] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawZoom } = __m(157);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'zoom-in',
title: 'Zoom In',
category: 'nav',
tags: ['zoom in', 'zoom', 'magnify', 'enlarge', 'bigger', 'plus'],
draw(g, s) { drawZoom(g, s, 'in'); },
});
};
__d[159] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawZoom } = __m(157);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'zoom-out',
title: 'Zoom Out',
category: 'nav',
tags: ['zoom out', 'zoom', 'shrink', 'smaller', 'minus'],
draw(g, s) { drawZoom(g, s, 'out'); },
});
};
__d[160] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawZoom } = __m(157);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'zoom-reset',
title: 'Actual Size',
category: 'nav',
tags: ['zoom reset', 'actual size', '100%', '1:1', 'zoom', 'reset'],
draw(g, s) { drawZoom(g, s, 'reset'); },
});
};
__d[161] = function (__ns) {
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "typeGlyph": () => typeGlyph }, [], ["typeGlyph"]);
function typeGlyph(g, s, fn) {
const k = enter(s, 0.45), p = press(s, 0.4);
g.group({ y: lerp(-3, 0, k), opacity: lerp(0.3, 1, k) }, () => fn(p > 0.3 ? 'accent' : 'line', k, p));
return { k, p };
}
};
__d[162] = function (__ns) {
const { defineGlyph } = __m(16);
const { typeGlyph } = __m(161);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'bold',
title: 'Bold',
category: 'productivity',
tags: ['bold', 'strong', 'weight', 'format', 'text style', 'b'],
draw(g, s) {
typeGlyph(g, s, (role) => {
g.path('M16 10.5H25.5A6.75 6.75 0 0 1 25.5 24H16ZM16 24H27A6.75 6.75 0 0 1 27 37.5H16Z', { role, weight: 1.4, join: 'round', fill: false });
});
},
});
};
__d[163] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'captions',
title: 'Captions',
category: 'productivity',
tags: ['captions', 'subtitles', 'cc', 'closed captions', 'transcript', 'accessibility', 'video'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, 0.35);
g.rect(6.5, 10.5, 35, 24, { r: 4, role: on ? 'accent' : 'line' });
g.arc(18.5, 22.5, 5.2, 135, 405, { role: on ? 'accent' : 'line', weight: 1.05 });
g.arc(30.5, 22.5, 5.2, 135, 405, { role: on ? 'accent' : 'line', weight: 1.05 });
if (on && k > 0.02) g.line(24 - 9 * k, 40, 24 + 9 * k, 40, { role: 'accent', weight: 1.05 });
},
});
};
__d[164] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, phase, smoothstep } = __m(12);
const { smooth } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const WISPS = [[16.5, 0], [21.75, 0.35], [27, 0.68]];
const __default = defineGlyph({
id: 'coffee',
title: 'Coffee',
category: 'productivity',
tags: ['coffee', 'break', 'away', 'cafe', 'mug', 'tea', 'brb'],
states: { cold: 'idle', hot: 'active' },
hue: 55, 
loop: 2.4,
draw(g, s) {
const hot = s.state === 'hot';
g.path('M11 19.5H32V29A7 7 0 0 1 25 36H18A7 7 0 0 1 11 29Z', { join: 'round' });
g.path('M32 22.5H34A4.5 4.5 0 0 1 34 31.5H31.5', { role: 'line' });
g.line(9, 40, 34, 40, { role: 'dim' });
g.line(14.5, 23.5, 28.5, 23.5, { role: hot ? 'accent' : 'dim', weight: 0.8, opacity: hot ? 0.9 : 0.6 });
if (!hot) return;
const k = arrive(s.since, 0.9);
for (const [x, off] of WISPS) {
const p = phase(s.t / 2.4 + off, 1);
const top = 7.5 + 2.5 * (0.5 + 0.5 * Math.cos(p * Math.PI * 2));
const pts = [];
for (let i = 0; i <= 6; i++) {
const y = 16 - (16 - top) * (i / 6);
const sway = 1.6 * Math.sin((i / 6) * Math.PI * 1.6 - p * Math.PI * 2) * (0.35 + 0.65 * (i / 6));
pts.push([x + sway, y]);
}
const op = k * (0.55 + 0.45 * smoothstep(0, 1, 0.5 + 0.5 * Math.sin(p * Math.PI * 2)));
g.path(smooth(pts), { role: 'accent', weight: 0.8, opacity: op });
}
},
});
};
__d[165] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'comment',
title: 'Comment',
category: 'productivity',
tags: ['comment', 'toggle comment', 'line comment', 'slashes', 'code', 'annotate', 'remark'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const role = p > 0.3 ? 'accent' : 'line';
g.line(9, 35, 15.5, 13, { role, weight: 1.1 });
g.line(17.5, 35, 24, 13, { role, weight: 1.1 });
g.line(29, 21, lerp(29, 39.5, k), 21, { role: 'dim' });
g.line(29, 28.5, lerp(29, 36, k), 28.5, { role: 'dim' });
},
});
};
__d[166] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'emoji',
title: 'Emoji',
category: 'productivity',
tags: ['emoji', 'smile', 'smiley', 'face', 'reaction', 'react', 'emoticon'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.35);
g.circle(24, 24, 16);
const w = lerp(25, 62, k);
g.arc(24, 24.5, 9.5, 180 - w, 180 + w, { role: 'accent', weight: 1.05 });
g.circle(18.5, 19.5, 2.2, { role: 'fill' });
if (p > 0.3) g.line(27.3, 19.5, 31.7, 19.5, { role: 'fill', weight: 1 });
else g.circle(29.5, 19.5, 2.2, { role: 'fill' });
},
});
};
__d[167] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { strike } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const lids = (o) => {
const h = lerp(1, 12.5, o);
return `M6.5 24C11 ${24 - h * 0.68} 17 ${24 - h} 24 ${24 - h}C31 ${24 - h} 37 ${24 - h * 0.68} 41.5 24C37 ${24 + h * 0.68} 31 ${24 + h} 24 ${24 + h}C17 ${24 + h} 11 ${24 + h * 0.68} 6.5 24Z`;
};
const __default = defineGlyph({
id: 'eye',
title: 'Visibility',
category: 'productivity',
tags: ['eye', 'visible', 'show', 'hide', 'view', 'preview', 'visibility', 'hide ui', 'source'],
states: { shown: 'active', hidden: 'idle' },
draw(g, s) {
if (s.state === 'hidden') {
g.path(lids(1), { role: 'dim', join: 'round' });
g.circle(24, 24, 6, { role: 'dim' });
strike(g, s, { from: [10, 9.5], to: [38, 38.5] });
return;
}
const o = arrive(s.since, 0.45);
g.path(lids(o), { role: 'line', join: 'round' });
if (o > 0.4) {
const r = lerp(2, 6.5, (o - 0.4) / 0.6);
g.circle(24, 24, r, { role: 'accent', weight: 1.05 });
g.circle(24, 24, r * 0.4, { role: 'fill' });
g.dot(26.6, 21.4, 1.3, { opacity: o });
}
},
});
};
__d[168] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BASE = 37.5;
function A(g, x, h, o) {
const w = h * 0.68, top = BASE - h;
g.polyline([[x, BASE], [x + w / 2, top], [x + w, BASE]], { join: 'round', ...o });
g.line(x + w * 0.2, BASE - h * 0.33, x + w * 0.8, BASE - h * 0.33, o);
}
const __default = defineGlyph({
id: 'font-size',
title: 'Font Size',
category: 'productivity',
tags: ['font size', 'text size', 'zoom text', 'bigger', 'smaller', 'font', 'type'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
A(g, 7.5, lerp(18, 26, k) + 1.5 * p, { role: p > 0.3 ? 'accent' : 'line', weight: 1.1 });
A(g, 29, 14, { role: 'line', weight: 0.95 });
},
});
};
__d[169] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp, outBack } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LINES = [[16, 21, 3], [23, 31, -2], [30, 27, 4], [37, 20, -3]]; 
const SPARK = 'M35 7.5C35.6 11.4 36.6 12.4 40.5 13C36.6 13.6 35.6 14.6 35 18.5C34.4 14.6 33.4 13.6 29.5 13C33.4 12.4 34.4 11.4 35 7.5Z';
const __default = defineGlyph({
id: 'format',
title: 'Format',
category: 'productivity',
tags: ['format', 'format document', 'prettify', 'beautify', 'tidy', 'align', 'code style'],
draw(g, s) {
const k = enter(s, 0.55), p = press(s, 0.5);
const rag = 1 - k + p;
for (const [y, len, off] of LINES) g.line(8.5 + off * rag, y, 8.5 + off * rag + len, y, { role: y === 16 ? 'line' : 'dim' });
const b = s.pressed ? 0.6 : outBack(clamp((s.since - 0.15) / 0.4), 2);
g.group({ scale: Math.max(0.01, lerp(0.4, 1, b)), origin: [35, 13] }, () => g.path(SPARK, { role: 'accent', fill: true }));
},
});
};
__d[170] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
const { bump } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'gif',
title: 'GIF',
category: 'productivity',
tags: ['gif', 'animated', 'animation', 'image', 'reaction', 'chat', 'media'],
loop: 1.8,
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
g.rect(6.5, 13, 35, 22, { r: 4, role: p > 0.3 ? 'accent' : 'line' });
const ph = s.phase(1.8);
const op = (i) => lerp(0.3, 1, k) * (0.65 + 0.35 * bump(ph, i / 3 + 0.16, 0.3, true));
g.path('M21 19.2C20.2 18.4 19 18 17.8 18C15.2 18 13 20.2 13 24C13 27.8 15.2 30 17.8 30C19.8 30 21.3 29 21.5 26.5V24.8H18', { role: 'line', join: 'round', opacity: op(0) });
g.line(26, 18, 26, 30, { role: 'line', opacity: op(1) });
g.polyline([[37, 18], [31, 18], [31, 30]], { role: 'line', join: 'round', opacity: op(2) });
g.line(31, 24, 35.5, 24, { role: 'line', opacity: op(2) });
},
});
};
__d[171] = function (__ns) {
const { defineGlyph } = __m(16);
const { typeGlyph } = __m(161);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'heading',
title: 'Heading',
category: 'productivity',
tags: ['heading', 'title', 'h1', 'h2', 'header', 'outline', 'text style'],
draw(g, s) {
typeGlyph(g, s, (role) => {
g.line(9.5, 11, 9.5, 37, { role, weight: 1.15 });
g.line(24.5, 11, 24.5, 37, { role, weight: 1.15 });
g.line(9.5, 24, 24.5, 24, { role, weight: 1.15 });
});
g.line(31, 26.5, 39.5, 26.5, { role: 'dim' });
g.line(31, 34, 37, 34, { role: 'dim' });
},
});
};
__d[172] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outBack, clamp, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HEART = 'M24 38.5C24 38.5 8 29.5 8 18.5C8 13.5 11.8 10 16.2 10C19.5 10 22.4 12 24 14.8C25.6 12 28.5 10 31.8 10C36.2 10 40 13.5 40 18.5C40 29.5 24 38.5 24 38.5Z';
const __default = defineGlyph({
id: 'heart',
title: 'Like',
category: 'productivity',
tags: ['heart', 'like', 'liked', 'love', 'favorite', 'save', 'follow'],
states: { off: 'idle', on: 'active' },
hue: 12, 
draw(g, s) {
const on = s.state === 'on';
if (!on) {
const f = 1 - arrive(s.since, 0.3);
if (f > 0.02) g.path(HEART, { role: 'accent', fill: true, opacity: 0.9 * f });
g.path(HEART, { role: 'line', join: 'round' });
return;
}
const b = outBack(clamp(s.since / 0.45), 3);
g.group({ scale: Math.max(0.01, lerp(0.7, 1, b)), origin: [24, 25] }, () => {
g.path(HEART, { role: 'accent', fill: true, opacity: 0.9 });
g.path(HEART, { role: 'accent', join: 'round' });
});
},
});
};
__d[173] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'indent',
title: 'Indent',
category: 'productivity',
tags: ['indent', 'tab in', 'increase indent', 'outdent', 'nest', 'format', 'text'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const x = lerp(8.5, 21, k) + 1.5 * p;
g.line(8.5, 11, 39.5, 11, { role: 'line' });
g.line(x, 20, 39.5, 20, { role: 'dim' });
g.line(x, 28, 39.5, 28, { role: 'dim' });
g.line(8.5, 37, 39.5, 37, { role: 'line' });
g.polyline([[9, 18.5], [14.5, 24], [9, 29.5]], { role: 'accent', join: 'round', opacity: k });
},
});
};
__d[174] = function (__ns) {
const { defineGlyph } = __m(16);
const { typeGlyph } = __m(161);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'italic',
title: 'Italic',
category: 'productivity',
tags: ['italic', 'emphasis', 'slant', 'oblique', 'format', 'text style', 'i'],
draw(g, s) {
typeGlyph(g, s, (role) => {
g.line(21, 10.5, 34, 10.5, { role, weight: 1.1 });
g.line(14, 37.5, 27, 37.5, { role, weight: 1.1 });
g.line(27.5, 10.5, 20.5, 37.5, { role, weight: 1.1 });
});
},
});
};
__d[175] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'keyboard',
title: 'Keyboard',
category: 'productivity',
tags: ['keyboard', 'keys', 'shortcuts', 'hotkeys', 'keybindings', 'type', 'input'],
draw(g, s) {
const p = press(s, 0.35);
g.rect(6.5, 13, 35, 22.5, { r: 4 });
[12.5, 18.5, 24.5, 30.5, 35.5].forEach((x, i) => {
for (const [j, y] of [[0, 19.5], [1, 24.5]]) {
const k = clamp((s.since - (i + j) * 0.05) / 0.25);
const hit = i === 2 && j === 0 && p > 0.3;
g.circle(x, y, 1.45, { role: hit ? 'accent' : 'fill', fill: true, opacity: lerp(0.2, 1, k) });
}
});
g.line(16.5, 30, 31.5, 30, { role: 'line' });
},
});
};
__d[176] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SHEET = (y) => `M24 ${y - 8.5}L40 ${y}L24 ${y + 8.5}L8 ${y}Z`;
const __default = defineGlyph({
id: 'layers',
title: 'Layers',
category: 'productivity',
tags: ['layers', 'order', 'arrange', 'stack', 'bring to front', 'send to back', 'z-order'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const gap = lerp(0, 7, k);
g.path(SHEET(24 + gap), { role: 'dim', join: 'round' });
g.path(SHEET(24), { role: 'line', join: 'round' });
g.path(SHEET(24 - gap - 2.5 * p), { role: p > 0.3 ? 'accent' : 'line', join: 'round' });
},
});
};
__d[177] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outBack, clamp, pulse } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BX = 37, BY = 13, BR = 4.2;
const __default = defineGlyph({
id: 'mail',
title: 'Mail',
category: 'productivity',
tags: ['mail', 'email', 'inbox', 'message', 'unread', 'envelope', 'letter'],
states: { read: 'idle', unread: 'active' },
loop: 1.6,
draw(g, s) {
const unread = s.state === 'unread';
const drop = arrive(s.since, 0.45);
g.group({ y: unread ? 0 : -2.5 * (1 - drop) }, () => {
if (unread) {
g.path('M30 13H11.5A4 4 0 0 0 7.5 17V32A4 4 0 0 0 11.5 36H36.5A4 4 0 0 0 40.5 32V19.5');
g.polyline([[9.5, 15.5], [24, 26], [32.8, 19.6]], { role: 'line', join: 'round' });
} else {
g.rect(7.5, 13, 33, 23, { r: 4 });
g.polyline([[9.5, 15.5], [24, 26], [38.5, 15.5]], { role: 'line', join: 'round' });
}
});
if (unread) {
const pop = outBack(clamp(s.since / 0.42), 2.2);
const r = BR * pop * (1 + 0.07 * pulse(s.t, 1.6));
if (r > 0.05) g.circle(BX, BY, r, { role: 'spark' });
}
},
});
};
__d[178] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, phase, clamp, smoothstep, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LINES = [[15.5, 17.5, 32.5], [15.5, 23, 32.5], [15.5, 28.5, 26]];
const __default = defineGlyph({
id: 'note',
title: 'Note',
category: 'productivity',
tags: ['note', 'notes', 'memo', 'write', 'text', 'snippet', 'journal'],
states: { idle: 'idle', editing: 'active' },
loop: 3,
draw(g, s) {
const editing = s.state === 'editing';
g.path('M13 9.5H35A3 3 0 0 1 38 12.5V30.5L30 38.5H13A3 3 0 0 1 10 35.5V12.5A3 3 0 0 1 13 9.5Z', { join: 'round' });
g.path('M38 30.5H33A3 3 0 0 0 30 33.5V38.5', { role: 'line', weight: 0.9, join: 'round' });
LINES.forEach(([x0, y, x1], i) => {
let w = arrive(s.since - i * 0.12, 0.42);
let op = 1;
if (editing && i === LINES.length - 1) {
const p = phase(s.t, 3);
w = smoothstep(0.04, 0.55, p);
op = 1 - smoothstep(0.86, 0.98, p);
const cx = lerp(x0, x1, w) + 2;
const blink = p > 0.55 && p < 0.86 ? (phase(s.t, 0.5) < 0.5 ? 1 : 0) : 1;
g.line(cx, y - 3.2, cx, y + 3.2, { role: 'accent', weight: 0.8, opacity: blink * clamp(1 - smoothstep(0.9, 1, p)) });
}
if (w > 0.02) g.line(x0, y, lerp(x0, x1, w), y, { role: editing && i === LINES.length - 1 ? 'line' : 'dim', opacity: op });
});
},
});
};
__d[179] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp, outBack } = __m(12);
const { enter, press, xf, rot } = __m(24);
const { roundPoly } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const GEAR = (() => {
const pts = [], P = (r, a) => [24 + r * Math.sin((a * Math.PI) / 180), 24 - r * Math.cos((a * Math.PI) / 180)];
for (let i = 0; i < 8; i++) {
const a = i * 45;
pts.push(P(12, a - 14), P(16, a - 8.5), P(16, a + 8.5), P(12, a + 14));
}
return roundPoly(pts, 1.4);
})();
const __default = defineGlyph({
id: 'settings',
title: 'Settings',
category: 'productivity',
tags: ['settings', 'gear', 'preferences', 'options', 'configure', 'cog', 'setup'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.4);
const turn = lerp(-30, 0, k) + 45 * (s.pressed ? 0 : s.pressAge < 0.55 ? outBack(clamp(s.pressAge / 0.55)) - 1 : 0);
g.path(xf(GEAR, rot(turn)), { join: 'round' });
g.circle(24, 24, 5.5, { role: p > 0.3 ? 'accent' : 'line' });
},
});
};
__d[180] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outBack, clamp, lerp } = __m(12);
const { roundPoly } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const STAR = (() => {
const pts = [];
for (let i = 0; i < 10; i++) {
const r = i % 2 ? 7.4 : 16.5, a = (i * 36 * Math.PI) / 180;
pts.push([24 + r * Math.sin(a), 25.5 - r * Math.cos(a)]);
}
return roundPoly(pts, [1.6, 0.6, 1.6, 0.6, 1.6, 0.6, 1.6, 0.6, 1.6, 0.6]);
})();
const __default = defineGlyph({
id: 'star',
title: 'Star',
category: 'productivity',
tags: ['star', 'starred', 'favorite', 'bookmark', 'rate', 'important', 'save'],
states: { off: 'idle', on: 'active' },
hue: 86.5, 
draw(g, s) {
const on = s.state === 'on';
if (!on) {
const f = 1 - arrive(s.since, 0.3);
if (f > 0.02) g.path(STAR, { role: 'accent', fill: true, opacity: 0.9 * f });
g.path(STAR, { role: 'line', join: 'round' });
return;
}
const b = outBack(clamp(s.since / 0.45), 2.5);
g.group({ scale: Math.max(0.01, lerp(0.6, 1, b)), rotate: lerp(-36, 0, clamp(s.since / 0.45)), origin: [24, 25.5] }, () => {
g.path(STAR, { role: 'accent', fill: true, opacity: 0.9 });
g.path(STAR, { role: 'accent', join: 'round' });
});
},
});
};
__d[181] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'sticker',
title: 'Sticker',
category: 'productivity',
tags: ['sticker', 'stickers', 'decal', 'reaction', 'emoji', 'chat'],
draw(g, s) {
const k = enter(s, 0.5), p = press(s, 0.4);
const c = lerp(3, 10, k) * (1 - 0.6 * p); 
const X = 39.5, Y = 39.5;
g.path(`M11.5 8.5H36.5A3 3 0 0 1 39.5 11.5V${Y - c}L${X - c} ${Y}H11.5A3 3 0 0 1 8.5 36.5V11.5A3 3 0 0 1 11.5 8.5Z`, { join: 'round' });
g.path(`M${X} ${Y - c}H${X - c + 3}A3 3 0 0 0 ${X - c} ${Y - c + 3}V${Y}`, { role: 'line', weight: 0.9, join: 'round' });
g.circle(18.5, 19.5, 2, { role: 'fill' });
g.circle(28.5, 19.5, 2, { role: 'fill' });
g.arc(23.5, 24, 7.5, 125, 235, { role: 'accent', weight: 1.05 });
},
});
};
__d[182] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { typeGlyph } = __m(161);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'strike',
title: 'Strikethrough',
category: 'productivity',
tags: ['strikethrough', 'strike', 'cross out', 'delete text', 'format', 'text style'],
draw(g, s) {
const { k } = typeGlyph(g, s, (role) => {
g.path('M32.5 15.5C31 12.3 27.8 10.5 24 10.5C19 10.5 15.5 13.2 15.5 17C15.5 21.3 19.6 22.8 24 24C28.4 25.2 32.5 26.7 32.5 31C32.5 35 29 37.5 24 37.5C20 37.5 16.8 35.8 15.5 32.5', { role, weight: 1.1 });
});
g.line(9, 24, lerp(9, 39, k), 24, { role: 'accent', weight: 1.05 });
},
});
};
__d[183] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, outBack, clamp, phase, lerp, smoothstep } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const C = 24;
const __default = defineGlyph({
id: 'target',
title: 'Target',
category: 'productivity',
tags: ['target', 'goal', 'focus', 'aim', 'objective', 'do not disturb', 'bullseye'],
states: { off: 'idle', focus: 'active' },
loop: 2,
draw(g, s) {
const focus = s.state === 'focus';
const k = arrive(s.since, 0.5);
g.circle(C, C, 15);
g.circle(C, C, 8.5, { role: 'dim' });
if (focus) {
for (const a of [0, 90, 180, 270]) {
const [x0, y0] = g.polar(C, C, lerp(18, 11.5, k), a), [x1, y1] = g.polar(C, C, 18, a);
if (k > 0.02) g.line(x0, y0, x1, y1, { role: 'accent', weight: 0.9 });
}
const p = phase(s.t, 2), r = lerp(4, 15, smoothstep(0, 1, p));
g.circle(C, C, r, { role: 'accent', weight: 0.6, opacity: k * 0.85 * (1 - p) * smoothstep(0, 0.12, p) });
}
const pop = focus ? outBack(clamp(s.since / 0.45), 2.4) : 1;
g.circle(C, C, 3 + (focus ? 0.8 * pop : 0), { role: focus ? 'accent' : 'fill', fill: true });
},
});
};
__d[184] = function (__ns) {
const { defineGlyph } = __m(16);
const { clamp, pulse } = __m(12);
const { roundPoly, blink } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const TRI = [[24, 6.5], [41, 37], [7, 37]];
const LOOP = 2.4;
const shake = (since, dur = 0.5, amp = 1.8) => (since < 0 || since > dur ? 0 : amp * Math.sin(since * 46) * (1 - since / dur));
const __default = defineGlyph({
id: 'alert',
title: 'Alert',
category: 'status',
tags: ['alert', 'warning', 'caution', 'error', 'attention', 'problem'],
states: { warning: 'warn', critical: 'crit', clear: 'idle' },
loop: LOOP,
draw(g, s) {
const st = s.state;
if (st === 'clear') {
g.path(roundPoly(TRI, 4), { role: 'dim', join: 'round' });
g.line(24, 17.5, 24, 26.5, { role: 'dim' });
g.dot(24, 31.5, 1.9, { role: 'dim' });
return;
}
const crit = st === 'critical';
const dx = crit ? shake(Math.min(s.since, s.phase(LOOP) * LOOP), 0.5, 1.6) : shake(s.since);
const tri = TRI.map(([x, y]) => [clamp(x + dx, 6.5, 41.5), y]);
g.path(roundPoly(tri, 4), { role: crit ? 'accent' : 'line', weight: crit ? 1.15 : 1, join: 'round' });
const on = crit ? 0.25 + 0.75 * blink(s.phase(0.8), 0.6, 0.1) : 1;
g.line(24 + dx, 17.5, 24 + dx, 26.5, { role: crit ? 'line' : 'accent', weight: 1.1, opacity: on });
g.dot(24 + dx, 31.5, 2.1, { opacity: crit ? on : 0.55 + 0.45 * pulse(s.t, 1.2) });
},
});
};
__d[185] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp, outCubic } = __m(12);
const { alongPolyline, partialPolyline, polyLength } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const MARK = [[9.5, 25], [19.5, 34.5], [38.5, 13.5]];
const __default = defineGlyph({
id: 'check',
title: 'Check',
category: 'status',
tags: ['check', 'done', 'ok', 'success', 'confirm', 'complete', 'tick'],
states: { pending: 'idle', done: 'ok' },
draw(g, s) {
if (s.state === 'pending') {
const L = polyLength(MARK), count = Math.round(L / 4.6);
for (let i = 0; i <= count; i++) { const [x, y] = alongPolyline(MARK, i / count); g.circle(x, y, 1.45, { role: 'line', fill: true, opacity: 0.8 }); }
return;
}
const k = arrive(s.since, 0.42);
const pts = partialPolyline(MARK, k);
if (pts.length > 1) g.polyline(pts, { role: 'accent', weight: 1.25, cap: 'round', join: 'round' });
const b = clamp((s.since - 0.3) / 0.6);
if (b > 0 && b < 1) g.circle(24, 24, 13 + 4.5 * outCubic(b), { role: 'accent', weight: 0.5, opacity: 0.55 * (1 - b) });
},
});
};
__d[186] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, outBack, pulse } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'info',
title: 'Info',
category: 'status',
tags: ['info', 'information', 'about', 'help', 'details', 'notice'],
states: { info: 'info' },
loop: 2.4,
draw(g, s) {
g.circle(24, 24, 16.5);
const k = arrive(s.since, 0.4);
g.line(24, 33, 24, lerp(33, 22.5, k), { role: 'accent', weight: 1.1 });
const d = arrive(Math.max(0, s.since - 0.12), 0.45, outBack);
g.dot(24, lerp(10.5, 16, d), 2.3, { opacity: (0.7 + 0.3 * pulse(s.t, 2.4)) * Math.min(1, d * 1.5) });
},
});
};
__d[187] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, outBack, outExpo } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BX = 11.5, BY = 22.5, BW = 25, BH = 17; 
const LX = 17.5, RX = 30.5, SR = 6.5; 
const SY = 17; 
const LIFT = 4.5; 
const __default = defineGlyph({
id: 'lock',
title: 'Lock',
category: 'status',
tags: ['lock', 'unlock', 'secure', 'security', 'privacy', 'padlock'],
states: { locked: 'active', unlocked: 'idle' },
draw(g, s) {
const locked = s.state === 'locked';
const lift = locked ? LIFT * (1 - arrive(s.since, 0.42, outBack)) : LIFT * arrive(s.since, 0.4, outExpo);
const cy = +(SY - lift).toFixed(2);
const free = lerp(BY, cy + 5, lift / LIFT); 
g.path(`M${LX} ${BY}V${cy}A${SR} ${SR} 0 0 1 ${RX} ${cy}V${free.toFixed(2)}`, { role: 'line', weight: 1.08 });
g.rect(BX, BY, BW, BH, { r: 4 });
const on = locked ? arrive(Math.max(0, s.since - 0.2), 0.3) : 1 - arrive(s.since, 0.2);
g.circle(24, 29.5, 2.5, { role: on > 0.5 ? 'accent' : 'dim', fill: true, opacity: 0.6 + 0.4 * Math.abs(on * 2 - 1) });
g.line(24, 31, 24, 34.5, { role: on > 0.5 ? 'accent' : 'dim', weight: 0.9, opacity: 0.6 + 0.4 * Math.abs(on * 2 - 1) });
},
});
};
__d[188] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'power',
title: 'Power',
category: 'status',
tags: ['power', 'on', 'off', 'toggle', 'switch'],
states: { off: 'off', on: 'ok' },
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, 0.45);
const open = on ? lerp(150, 36, k) : 36; 
g.arc(24, 25.5, 14.5, open, 360 - open, { role: on ? 'line' : 'dim' });
g.line(24, 8.5, 24, 24, { role: on ? 'accent' : 'line', weight: 1.1 });
if (on) g.dot(24, 8.5, 1.5, { opacity: k });
},
});
};
__d[189] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { arcHead, partialPolyline } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const R = 13;
const ARCS = [[28, 152], [208, 332]]; 
const CHECK = [[18.5, 24.5], [22.5, 28.5], [30, 20]];
const LOOP = 2.4;
const __default = defineGlyph({
id: 'sync',
title: 'Sync',
category: 'status',
tags: ['sync', 'refresh', 'reload', 'update', 'backup', 'syncing'],
states: { idle: 'idle', syncing: 'busy', synced: 'ok', error: 'alert' },
loop: LOOP,
draw(g, s) {
const st = s.state;
let rot = 0;
if (st === 'syncing') rot = s.phase(1.2) * 180;
else if (st === 'synced') rot = lerp(-90, 0, arrive(s.since, 0.7)); 
const role = st === 'error' ? 'dim' : 'line';
const tail = st === 'syncing' ? 0.55 : 1;
for (const [a0, a1] of ARCS) {
const b0 = a0 + rot, b1 = a1 + rot;
if (tail < 1) { g.arc(24, 24, R, b0, b0 + 50, { role, opacity: tail }); g.arc(24, 24, R, b0 + 50, b1, { role, cap: 'butt' }); }
else g.arc(24, 24, R, b0, b1, { role });
g.polyline(arcHead(24, 24, R, b1, { size: 4.4 }), { role, join: 'round' });
}
if (st === 'synced') {
const pts = partialPolyline(CHECK, arrive(Math.max(0, s.since - 0.35), 0.35));
if (pts.length > 1) g.polyline(pts, { role: 'accent', weight: 1.05 });
} else if (st === 'error') {
const k = arrive(s.since, 0.3);
g.line(24, 18, 24, lerp(18, 25.5, k), { role: 'accent', weight: 1.1 });
g.dot(24, 30, 2, { role: 'spark', opacity: k });
}
},
});
};
__d[190] = function (__ns) {
const { defineGlyph } = __m(16);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'broadcast',
title: 'Broadcast',
category: 'stream',
tags: ['live', 'on air', 'broadcast', 'stream', 'podcast'],
states: { offline: 'idle', live: 'alert' },
loop: 1.8,
draw(g, s) {
const live = s.state === 'live';
g.circle(24, 24, 3.8, { role: live ? 'accent' : 'fill', fill: true });
[9, 15.5].forEach((r, i) => {
const ph = live ? (s.phase(1.8) + i * 0.5) % 1 : 0;
const op = live ? 0.3 + 0.7 * (1 - Math.abs(ph - 0.5) * 2) : 0.8;
g.arc(24, 24, r, 42, 138, { role: i ? 'dim' : 'line', opacity: op });
g.arc(24, 24, r, 222, 318, { role: i ? 'dim' : 'line', opacity: op });
});
},
});
};
__d[191] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'camera',
title: 'Camera',
category: 'stream',
tags: ['camera', 'video', 'webcam', 'cam', 'meeting', 'call', 'stream'],
states: { on: 'active', off: 'neg' },
loop: 1.6,
draw(g, s) {
const on = s.state === 'on';
const k = arrive(s.since, on ? 0.4 : 0.32);
g.rect(7, 14, 23.5, 20, { r: 4.5 });
g.polyline([[30.5, 20.5], [40.5, 15.5], [40.5, 32.5], [30.5, 27.5]], { role: on ? 'accent' : 'line', join: 'round' });
if (on) {
g.dot(13, 20, 2.1, { opacity: (0.45 + 0.55 * pulse(s.t, 1.6)) * k });
} else if (k > 0.02) {
g.line(9, 8.5, 9 + 30 * k, 8.5 + 31 * k, { role: 'accent', weight: 1.15 });
}
},
});
};
__d[192] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, outBack, clamp, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BUBBLE = 'M14.5 10H33.5A6.5 6.5 0 0 1 40 16.5V26.5A6.5 6.5 0 0 1 33.5 33H21.5L14 39V33A6 6 0 0 1 8 27V16.5A6.5 6.5 0 0 1 14.5 10Z';
const __default = defineGlyph({
id: 'chat',
title: 'Chat',
category: 'stream',
tags: ['chat', 'message', 'comments', 'talk', 'bubble', 'stream', 'mention'],
states: { quiet: 'idle', active: 'active', mention: 'alert' },
loop: 1.2,
draw(g, s) {
g.path(BUBBLE, { role: 'line', join: 'round' });
if (s.state === 'mention') {
const pop = outBack(clamp(s.since / 0.42), 2.2);
g.group({ scale: lerp(0.4, 1, pop), origin: [24, 21.5], opacity: clamp(s.since / 0.12) }, () => {
g.text('@', { x: 24, y: 27, size: 17, weight: 700, role: 'accent' });
});
return;
}
const active = s.state === 'active';
const k = arrive(s.since, 0.3);
[17, 24, 31].forEach((x, i) => {
const hop = active ? pulse(s.t - i * 0.16, 1.2) ** 3 * k : 0;
g.circle(x, 21.5 - 2.6 * hop, 2.3, { role: active ? 'accent' : 'dim', fill: true, opacity: active ? 0.6 + 0.4 * hop : 1 });
});
},
});
};
__d[193] = function (__ns) {
const { defineGlyph } = __m(16);
const { clamp, inOutSine } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const RAMP = [1, 0.62, 0.34, 0.14];
const __default = defineGlyph({
id: 'fade',
title: 'Fade',
category: 'stream',
tags: ['fade', 'crossfade', 'transition', 'dissolve', 'blend', 'scene', 'stream'],
draw(g, s) {
const run = s.pressed ? 0 : s.pressAge < 0.7 ? clamp(s.pressAge / 0.7) : clamp(s.since / 0.7);
g.rect(7, 10.5, 34, 27, { r: 4 });
RAMP.forEach((o, i) => {
const k = inOutSine(clamp(run * 1.6 - i * 0.2));
if (k > 0.02) g.rect(11 + i * 6.75, 14.5, 5.75, 19, { r: i === 0 ? 1.8 : 0.8, role: 'fill', opacity: o * k });
});
},
});
};
__d[194] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp, clamp, outExpo } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const PX = 17, BASE = 38, TOP = 10;
const __default = defineGlyph({
id: 'marker',
title: 'Marker',
category: 'stream',
tags: ['marker', 'bookmark', 'flag', 'highlight', 'clip', 'timeline', 'stream'],
states: { ready: 'idle', marked: 'ok' },
loop: 2.4,
draw(g, s) {
const marked = s.state === 'marked';
g.line(8, BASE, PX, BASE, { role: 'line' });
g.line(PX, BASE, 40, BASE, { role: 'dim' });
const drop = marked ? outExpo(clamp(s.since / 0.45)) : 1;
const wave = marked ? Math.sin((s.t / 2.4) * Math.PI * 2) * 0.9 : 0;
g.group({ y: lerp(-6, 0, drop), opacity: lerp(0.2, 1, drop) }, () => {
g.line(PX, BASE - 1.5, PX, TOP, { role: 'line' });
const flag = [[PX, TOP], [36, TOP + wave], [31.5, 16.5 - wave * 0.4], [36, 23 + wave], [PX, 23]];
if (marked) g.polygon(flag, { role: 'accent', fill: true, opacity: lerp(0.4, 1, drop) });
g.polygon(flag, { role: marked ? 'accent' : 'line', join: 'round' });
});
if (marked && s.since < 0.9) {
const e = outExpo(clamp((s.since - 0.18) / 0.7));
if (e > 0) g.ellipse(PX, BASE, lerp(2, 11, e), lerp(0.8, 3.2, e), { role: 'accent', weight: 0.6, opacity: 1 - e });
}
},
});
};
__d[195] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'scene',
title: 'Scene',
category: 'stream',
tags: ['scene', 'switcher', 'program', 'preview', 'layout', 'stream'],
states: { off: 'idle', preview: 'ok', live: 'alert' },
loop: 1.2,
draw(g, s) {
const lit = s.state !== 'off';
const k = arrive(s.since, 0.4);
g.path('M13.5 12.5V13A3 3 0 0 1 16.5 10H37A3 3 0 0 1 40 13V27A3 3 0 0 1 37 30H36.5', { role: 'dim' });
const dx = s.state === 'live' ? lerp(6, 0, k) : 0, dy = s.state === 'live' ? lerp(-5, 0, k) : 0;
g.group({ x: dx, y: dy }, () => {
g.rect(7, 15, 26.5, 20, { r: 3.5, role: lit ? 'accent' : 'line' });
g.polyline([[11.5, 30.5], [17.5, 23.5], [21.5, 27.5], [24.5, 25], [29, 30.5]], { role: lit ? 'line' : 'dim', weight: 0.8 });
g.dot(26.5, 20.5, 1.9, { role: lit ? 'spark' : 'dim' });
});
},
});
};
__d[196] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'screenshot',
title: 'Screenshot',
category: 'stream',
tags: ['screenshot', 'capture', 'snip', 'screen capture', 'grab', 'photo', 'clip'],
draw(g, s) {
const k = enter(s, 0.45), p = press(s, 0.4);
const o = lerp(2, 0, k) - 1.2 * p, L = 8;
for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
const cx = 24 + sx * (16 + o), cy = 24 + sy * (14 + o);
g.polyline([[cx, cy - sy * L], [cx, cy], [cx - sx * L, cy]], { role: 'line', join: 'round' });
}
g.circle(24, 24, 6.5, { role: p > 0.3 ? 'accent' : 'line' });
if (p > 0.02) g.circle(24, 24, 3.2, { role: 'accent', fill: true, opacity: p });
else g.dot(24, 24, 1.8, { role: 'fill' });
},
});
};
__d[197] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'viewers',
title: 'Viewers',
category: 'stream',
tags: ['viewers', 'audience', 'people', 'watching', 'users', 'stream', 'count'],
states: { offline: 'idle', live: 'active' },
loop: 2.4,
draw(g, s) {
const live = s.state === 'live';
const k = live ? arrive(s.since, 0.5) : 1;
const crowd = s.level > 0.66 ? 3 : s.level > 0.33 ? 2 : 1;
const ox = crowd === 2 ? -3 : 0; 
const back = (side) => {
const cx = 24 + side * 12.5 + ox;
g.group({ x: side * lerp(2.5, 0, k), opacity: k }, () => {
g.circle(cx, 13.5, 3.75, { role: 'dim', fill: true });
g.arc(cx, 25, 5.25, side < 0 ? 270 : 315, side < 0 ? 405 : 450, { role: 'dim' });
});
};
if (crowd >= 2) back(1);
if (crowd >= 3) back(-1);
if (live) g.circle(24 + ox, 21.5, 4.75, { role: 'accent', fill: true, opacity: (0.55 + 0.45 * pulse(s.t, 2.4)) * k });
g.circle(24 + ox, 21.5, 4.75, { role: 'line' });
g.path(`M${14.5 + ox} 39A9.5 8.5 0 0 1 ${33.5 + ox} 39`, { role: 'line' });
},
});
};
__d[198] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp, lerp, pulse, smoothstep } = __m(12);
const { rectAround } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const X0 = 10, W = 24, Y0 = 17, H = 14; 
const BOLT = [[24.85, 16], [16.3, 25.37], [21.54, 25.37], [19.15, 32], [27.7, 22.63], [22.46, 22.63]];
const LOOP = 1.6;
const __default = defineGlyph({
id: 'battery',
title: 'Battery',
category: 'system',
tags: ['battery', 'charge', 'charging', 'power', 'level', 'low'],
states: { normal: 'active', charging: 'ok', low: 'warn' },
loop: LOOP,
draw(g, s) {
g.rect(6.5, 13.5, 31, 21, { r: 5 });
g.line(40.5, 20, 40.5, 28, { weight: 1.1 });
const st = s.state;
if (st === 'low') {
const lv = Math.min(clamp(s.level), 0.16);
const w = Math.max(2.2, W * lv);
g.rect(X0, Y0, w, H, { r: 1.5, role: 'accent', fill: true, opacity: 0.3 + 0.7 * pulse(s.t, LOOP / 2) }); 
return;
}
if (st === 'charging') {
const lv = clamp(s.level);
const xe = X0 + W * lv;
for (const d of rectAround(X0, xe, Y0, Y0 + H, BOLT, 1.4)) g.path(d, { role: 'accent', fill: true, opacity: 0.5 });
const p = s.phase(LOOP);
const c = lerp(X0 - 4, xe + 4, p), half = 3.5;
const a = Math.max(X0, c - half), b = Math.min(xe, c + half);
const fade = smoothstep(0, 0.15, p) * (1 - smoothstep(0.85, 1, p));
if (b - a > 0.2 && fade > 0.01) for (const d of rectAround(a, b, Y0, Y0 + H, BOLT, 1.4)) g.path(d, { role: 'accent', fill: true, opacity: 0.5 * fade });
const k = arrive(s.since, 0.36);
g.polygon(BOLT.map(([x, y]) => [x, y - 2.5 * (1 - k)]), { role: 'fill', join: 'round', opacity: k });
return;
}
const w = W * clamp(s.level) * arrive(s.since, 0.6);
if (w > 0.3) g.rect(X0, Y0, w, H, { r: Math.min(1.5, w / 2), role: 'accent', fill: true });
},
});
};
__d[199] = function (__ns) {
const { defineGlyph } = __m(16);
const { clamp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'cpu',
title: 'CPU',
category: 'system',
tags: ['cpu', 'processor', 'chip', 'system', 'performance', 'load'],
states: { busy: 'active', idle: 'idle' },
loop: 1.2,
draw(g, s) {
g.rect(13, 13, 22, 22, { r: 3.5 });
for (const p of [18.5, 24, 29.5]) {
g.line(p, 7.5, p, 12, { role: 'dim' });
g.line(p, 36, p, 40.5, { role: 'dim' });
g.line(7.5, p, 12, p, { role: 'dim' });
g.line(36, p, 40.5, p, { role: 'dim' });
}
const busy = s.state === 'busy';
const lead = Math.floor(s.phase(1.2) * 4);
const count = Math.max(1, Math.ceil(clamp(s.level) * 4 - 1e-9));
[[18.5, 18.5], [25, 18.5], [25, 25], [18.5, 25]].forEach(([x, y], i) => {
const rel = (lead - i + 4) % 4; 
const on = busy && rel < count;
g.rect(x, y, 4.5, 4.5, { r: 1, role: on ? 'spark' : 'fill', fill: true, opacity: on ? (rel === 0 ? 1 : 0.72) : 0.5 });
});
},
});
};
__d[200] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp, lerp, pulse } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const C = [24, 20.5], R = 9; 
const P = [32.5, 34], L = 12; 
const LOOP = 2.4;
function armAngle(d) {
const dist = (a) => { const r = (a * Math.PI) / 180; return Math.hypot(P[0] + L * Math.sin(r) - C[0], P[1] - L * Math.cos(r) - C[1]); };
const toC = (Math.atan2(C[0] - P[0], P[1] - C[1]) * 180) / Math.PI; 
let lo = toC, hi = toC + 60;
for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (dist(m) < d) lo = m; else hi = m; }
return (lo + hi) / 2;
}
const A_IN = armAngle(4.5), A_OUT = armAngle(8), A_PARK = armAngle(11);
const __default = defineGlyph({
id: 'disk',
title: 'Disk',
category: 'system',
tags: ['disk', 'drive', 'storage', 'ssd', 'hdd', 'space', 'io'],
states: { active: 'active', idle: 'idle', full: 'warn' },
loop: LOOP,
draw(g, s) {
const st = s.state;
g.rect(10, 8, 28, 32, { r: 4 });
const lv = (st === 'full' ? Math.max(clamp(s.level), 0.95) : clamp(s.level)) * arrive(s.since, 0.6);
g.circle(C[0], C[1], R, { role: 'dim', opacity: 0.6 });
if (lv > 0.01) g.arc(C[0], C[1], R, 0, Math.min(359.9, lv * 360), { role: 'accent', opacity: st === 'full' ? 0.55 + 0.45 * pulse(s.t, 1.2) : 1 });
g.circle(C[0], C[1], 2, { role: 'fill' });
let a;
if (st === 'active') {
const p = s.phase(LOOP) * Math.PI * 2;
const u = 0.5 + 0.32 * Math.sin(p) + 0.18 * Math.sin(3 * p + 0.6);
a = lerp(A_IN, A_OUT, clamp(u));
} else if (st === 'idle') a = lerp(A_OUT, A_PARK, arrive(s.since, 0.5));
else a = lerp(A_IN, A_OUT, 0.5);
const [hx, hy] = g.polar(P[0], P[1], L, a);
g.line(P[0], P[1], hx, hy, { role: 'line', weight: 0.85 });
g.circle(P[0], P[1], 2.2, { role: 'line', weight: 0.85 });
g.dot(hx, hy, 1.5, { role: st === 'active' ? 'spark' : 'fill' });
const p = s.phase(LOOP);
const io = st === 'active' ? (Math.sin(p * Math.PI * 2 * 7) > 0.1 || Math.sin(p * Math.PI * 2 * 3 + 1) > 0.6 ? 1 : 0.25) : st === 'full' ? 1 : 0.3;
g.dot(15.5, 35, 1.5, { role: st === 'idle' ? 'dim' : 'spark', opacity: io });
},
});
};
__d[201] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp } = __m(12);
const { curve } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const FX = 18, FY = 22, FR = 8; 
const FINS = [16.5, 22, 27.5]; 
const BLADES = 3;
const LOOP = 1.2;
const __default = defineGlyph({
id: 'gpu',
title: 'GPU',
category: 'system',
tags: ['gpu', 'graphics', 'video card', 'fan', 'system', 'performance', 'load'],
states: { busy: 'active', idle: 'idle' },
loop: LOOP,
draw(g, s) {
const busy = s.state === 'busy';
g.rect(7, 11, 34, 22, { r: 3.5 });
g.line(12, 36.5, 15.5, 36.5, { role: 'dim' });
g.line(19, 36.5, 30, 36.5, { role: 'dim' });
g.circle(FX, FY, FR, { role: 'dim', opacity: 0.8 });
const lv = clamp(s.level);
const steps = busy ? 1 + Math.round(lv * 2) : 0; 
const spin = (steps * 360 * s.phase(LOOP)) / BLADES;
for (let b = 0; b < BLADES; b++) {
const a = (b * 360) / BLADES + spin;
const [x0, y0] = g.polar(FX, FY, 2.6, a), [xc, yc] = g.polar(FX, FY, 5.6, a + 14), [x1, y1] = g.polar(FX, FY, 5.9, a + 70);
g.path(curve([x0, y0], [xc, yc], [x1, y1]), { role: busy ? 'accent' : 'line', weight: 0.9 });
}
g.dot(FX, FY, 1.7, { role: busy ? 'spark' : 'fill' });
const lit = busy ? Math.ceil(lv * 3 - 1e-9) : 0;
FINS.forEach((y, i) => {
const on = 2 - i < lit;
const k = on ? arrive(Math.max(0, s.since - (2 - i) * 0.1), 0.36) : 0;
g.line(30, y, 36.5, y, { role: on ? 'accent' : 'dim', opacity: on ? 0.4 + 0.6 * k : 0.7 });
});
},
});
};
__d[202] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp } = __m(12);
const { bump } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CHIPS = [11, 18, 25, 32]; 
const CW = 5, CY = 15.5, CH = 10.5;
const PINS = [11.5, 15.5, 19.5, 28.5, 32.5, 36.5]; 
const LOOP = 1.6;
const __default = defineGlyph({
id: 'memory',
title: 'Memory',
category: 'system',
tags: ['memory', 'ram', 'dimm', 'system', 'usage', 'performance'],
states: { normal: 'active', high: 'warn' },
loop: LOOP,
draw(g, s) {
g.rect(7, 11.5, 34, 18.5, { r: 3 });
for (const x of PINS) g.line(x, 33.5, x, 37, { role: 'dim' });
const high = s.state === 'high';
const lv = (high ? Math.max(clamp(s.level), 0.92) : clamp(s.level)) * arrive(s.since, 0.5);
const fillN = lv * 4;
const p = s.phase(LOOP);
CHIPS.forEach((x, i) => {
const f = clamp(fillN - i);
const top = i === Math.ceil(fillN) - 1;
if (f < 1) g.rect(x, CY, CW, CH, { r: 1.2, role: 'dim', fill: true, opacity: 0.32 }); 
if (f <= 0.04) return;
let op = 0.78 + 0.22 * bump(p, (i + 0.5) / 4, 0.3, true);
if (high && top) op = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(p * Math.PI * 4));
const h = CH * f;
g.rect(x, CY + CH - h, CW, h, { r: Math.min(1.2, h / 2), role: 'accent', fill: true, opacity: op });
});
},
});
};
__d[203] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp } = __m(12);
const { strike } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const XD = 16.5, XU = 31.5; 
const TOP = 10, BOT = 38, HW = 5.5; 
const DASH = 3.5, GAP = 3.5, PER = DASH + GAP;
const LOOP = 1.2;
function packets(g, x, y0, y1, off, opts) {
const dir = Math.sign(y1 - y0), len = Math.abs(y1 - y0);
for (let u = -PER + (off % PER); u < len; u += PER) {
const a = Math.max(0, u), b = Math.min(len, u + DASH);
if (b - a > 0.4) g.line(x, y0 + dir * a, x, y0 + dir * b, opts);
}
}
const __default = defineGlyph({
id: 'network',
title: 'Network',
category: 'system',
tags: ['network', 'traffic', 'upload', 'download', 'ethernet', 'lan', 'throughput'],
states: { online: 'active', idle: 'idle', offline: 'neg' },
loop: LOOP,
draw(g, s) {
const st = s.state;
const role = st === 'offline' ? 'dim' : 'line';
g.polyline([[XD - HW, BOT - HW], [XD, BOT], [XD + HW, BOT - HW]], { role });
g.polyline([[XU - HW, TOP + HW], [XU, TOP], [XU + HW, TOP + HW]], { role });
if (st !== 'online') {
g.line(XD, TOP, XD, BOT, { role });
g.line(XU, BOT, XU, TOP, { role });
if (st === 'offline') strike(g, s, { from: [9.5, 11.5], to: [38.5, 36.5] });
return;
}
const k = arrive(s.since, 0.3);
const steps = 1 + Math.round(clamp(s.level) * 2);
const off = s.phase(LOOP) * PER * steps;
packets(g, XD, TOP, BOT - 1, off, { role: 'accent', opacity: k });
packets(g, XU, BOT, TOP + 1, off + PER / 2, { role: 'accent', opacity: k });
if (k < 1) { g.line(XD, TOP, XD, BOT, { role: 'line', opacity: 1 - k }); g.line(XU, BOT, XU, TOP, { role: 'line', opacity: 1 - k }); }
},
});
};
__d[204] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, clamp, pulse } = __m(12);
const { bump, strike } = __m(26);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 24, CY = 34.5; 
const R = [8, 15, 22]; 
const HALF = [44, 46, 47.5]; 
const LOOP = 2.4;
const __default = defineGlyph({
id: 'wifi',
title: 'Wi-Fi',
category: 'system',
tags: ['wifi', 'wireless', 'signal', 'network', 'connection', 'strength'],
states: { connected: 'active', searching: 'busy', off: 'off' },
loop: LOOP,
draw(g, s) {
const st = s.state;
if (st === 'off') {
R.forEach((r, i) => g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'dim', opacity: 0.55 }));
g.circle(CX, CY, 2.6, { role: 'dim', fill: true, opacity: 0.55 });
strike(g, s, { from: [11.5, 11.5], to: [36.5, 36.5] });
return;
}
if (st === 'searching') {
const w = (s.phase(1.2) * 4) % 4;
R.forEach((r, i) => {
const hot = Math.max(bump(w, i + 1, 1.1), bump(w + 4, i + 1, 1.1));
g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'dim', opacity: 0.4 });
if (hot > 0.02) g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'line', opacity: hot });
});
const dot = Math.max(bump(w, 0, 1.1), bump(w, 4, 1.1));
g.circle(CX, CY, 2.6, { role: 'dim', fill: true, opacity: 0.6 });
g.dot(CX, CY, 2.6, { role: 'spark', opacity: dot });
return;
}
const bars = Math.ceil(clamp(s.level) * 3 - 1e-9);
R.forEach((r, i) => {
if (i >= bars) { g.arc(CX, CY, r, -HALF[i], HALF[i], { role: 'dim', opacity: 0.32 }); return; }
const k = arrive(Math.max(0, s.since - i * 0.08), 0.42);
const h = HALF[i] * k;
if (h < 0.5) return;
const outer = i === bars - 1 && bars > 1;
g.arc(CX, CY, r, -h, h, { role: i === 0 ? 'line' : 'accent', opacity: outer ? 0.55 + 0.45 * pulse(s.t, LOOP) : 1 });
});
g.circle(CX, CY, 2.6, { role: 'fill' });
},
});
};
__d[205] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, phase, smoothstep } = __m(12);
const { P } = __m(5);
const { polar } = __m(15);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 24, CY = 27, R = 12;
function bell(deg) {
const b = polar(CX, CY, 15.5, deg);
const [x0, y0] = polar(b[0], b[1], 5, deg - 90), [x1, y1] = polar(b[0], b[1], 5, deg + 90);
return P().M(x0, y0).A(5, 5, 0, 0, 1, x1, y1).Z().d;
}
const __default = defineGlyph({
id: 'alarm',
title: 'Alarm',
category: 'time',
tags: ['alarm', 'wake', 'ring', 'reminder', 'bell', 'clock', 'time'],
states: { off: 'off', set: 'active', ringing: 'alert' },
loop: 1.5,
draw(g, s) {
const ringing = s.state === 'ringing', set = s.state !== 'off';
const p = phase(s.t, 1.5);
const env = ringing ? smoothstep(0, 0.06, p) * (1 - smoothstep(0.6, 0.68, p)) : 0;
const shake = 7 * Math.sin((s.t / 0.25) * Math.PI * 2) * env;
const k = arrive(s.since, 0.4);
g.group({ rotate: shake, origin: [CX, CY] }, () => {
g.path(bell(-42), { role: 'fill', opacity: 0.92 });
g.path(bell(42), { role: 'fill', opacity: 0.92 });
const swing = ringing ? 24 * Math.sin((s.t / 0.25) * Math.PI * 2 + Math.PI / 2) * env : 0;
g.group({ rotate: swing, origin: [CX, CY - R] }, () => {
g.line(CX, CY - R, CX, 10.5, { role: 'line', weight: 0.9 });
g.dot(CX, 9.5, 1.7, { role: ringing ? 'spark' : 'fill' });
});
g.circle(CX, CY, R);
for (const a of [145, 215]) {
const [x0, y0] = polar(CX, CY, R + 0.5, a), [x1, y1] = polar(CX, CY, 16.2, a);
g.line(x0, y0, x1, y1, { role: 'line' });
}
const [hx, hy] = polar(CX, CY, 6, 300), [mx, my] = polar(CX, CY, 8.5 * (set ? 0.75 + 0.25 * k : 1), 60);
g.line(CX, CY, hx, hy, { role: 'line' });
g.line(CX, CY, mx, my, { role: set ? 'accent' : 'dim' });
g.dot(CX, CY, 1.7, { role: 'fill' });
});
if (ringing && env > 0.01) {
const flick = 0.45 + 0.55 * Math.abs(Math.sin((s.t / 0.25) * Math.PI * 2));
for (const [a0, a1] of [[248, 292], [68, 112]]) g.arc(CX, CY, 16.5, a0, a1, { role: 'accent', weight: 0.75, opacity: env * flick });
}
},
});
};
__d[206] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { P } = __m(5);
const { digits } = __m(113);
__e(__ns, { "default": () => __default }, [], ["default"]);
const X0 = 9.5, X1 = 38.5, Y0 = 11, Y1 = 40, HEAD = 19, RAD = 4;
const __default = defineGlyph({
id: 'calendar',
title: 'Calendar',
category: 'time',
tags: ['calendar', 'date', 'day', 'schedule', 'event', 'agenda', 'meeting'],
states: { date: 'idle', event: 'active' },
draw(g, s) {
const event = s.state === 'event';
const k = arrive(s.since, 0.45);
const raw = Math.round(Number(s.params.day));
const day = raw >= 1 && raw <= 31 ? raw : 17;
if (event) {
const hb = lerp(Y0 + RAD, HEAD, k);
g.path(P().M(X0, hb).V(Y0 + RAD).A(RAD, RAD, 0, 0, 1, X0 + RAD, Y0).H(X1 - RAD).A(RAD, RAD, 0, 0, 1, X1, Y0 + RAD).V(hb).Z().d, { role: 'accent', fill: true, opacity: 0.9 });
}
g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: RAD });
g.line(X0, HEAD, X1, HEAD, { role: event ? 'line' : 'dim' });
for (const x of [17.5, 30.5]) g.line(x, 7.5, x, 14, { role: 'line', weight: 1.05 });
g.group({ y: 3.5 * (1 - k), opacity: k }, () => digits(g, day, { top: 7, role: event ? 'accent' : 'line' }));
},
});
};
__d[207] = function (__ns) {
const { defineGlyph } = __m(16);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'clock',
title: 'Clock',
category: 'time',
tags: ['clock', 'time', 'hour', 'analog'],
loop: 12,
draw(g, s) {
g.circle(24, 24, 17);
for (const a of [0, 90, 180, 270]) {
const [x1, y1] = g.polar(24, 24, 13, a), [x2, y2] = g.polar(24, 24, 15.5, a);
g.line(x1, y1, x2, y2, { role: 'dim' });
}
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
const hand = (deg, len, opts) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, opts); };
hand(h * 30, 8.5, { role: 'line', weight: 1.1 });
hand(m * 6, 12.5, { role: 'accent' });
g.dot(24, 24, 1.8);
},
});
};
__d[208] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, clamp } = __m(12);
const { wedge } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CX = 24, CY = 26.5, R = 14;
const LAP = 4; 
const __default = defineGlyph({
id: 'stopwatch',
title: 'Stopwatch',
category: 'time',
tags: ['stopwatch', 'chrono', 'elapsed', 'lap', 'time', 'race'],
states: { ready: 'idle', running: 'active', paused: 'idle' },
loop: 4,
draw(g, s) {
const running = s.state === 'running', paused = s.state === 'paused';
const click = s.state === 'ready' ? 0 : 1.6 * Math.sin(Math.PI * clamp(s.since / 0.28));
g.group({ y: click }, () => {
g.line(CX, 8, CX, 12.5, { role: 'line' });
g.line(20.5, 8, 27.5, 8, { role: 'line', weight: 1.1 });
});
g.circle(CX, CY, R);
const [bx0, by0] = g.polar(CX, CY, R + 2.2, 45), [bx1, by1] = g.polar(CX, CY, R + 4.4, 45);
g.line(bx0, by0, bx1, by1, { role: 'line', weight: 1.05 });
for (const a of [90, 180, 270]) {
const [x1, y1] = g.polar(CX, CY, 9.5, a), [x2, y2] = g.polar(CX, CY, 11.5, a);
g.line(x1, y1, x2, y2, { role: 'dim' });
}
const top = g.polar(CX, CY, 9.5, 0), top2 = g.polar(CX, CY, 11.5, 0);
g.line(top[0], top[1], top2[0], top2[1], { role: running ? 'accent' : 'dim' });
let ang = 0, op = 1;
if (running) ang = ((s.since / LAP) % 1) * 360;
if (paused) { ang = clamp(s.level) * 360; op = 0.35 + 0.65 * (pulse(s.t, 1) > 0.35 ? 1 : 0.25); }
if (running) {
const k = arrive(s.since, 0.4);
const trail = Math.min(ang, 70);
const d = wedge(CX, CY, 10.5, ang - trail, ang);
if (d) g.path(d, { role: 'accent', fill: true, opacity: 0.34 * k });
}
const [hx, hy] = g.polar(CX, CY, 10.5, ang), [tx, ty] = g.polar(CX, CY, 3, ang + 180);
g.line(tx, ty, hx, hy, { role: running || paused ? 'accent' : 'line', opacity: op });
g.dot(CX, CY, 2, { role: 'fill' });
},
});
};
__d[209] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, pulse, phase, lerp, clamp, outExpo } = __m(12);
const { wedge } = __m(44);
__e(__ns, { "default": () => __default }, [], ["default"]);
const C = 24, R = 16.5, W = 12.5; 
const __default = defineGlyph({
id: 'timer',
title: 'Timer',
category: 'time',
tags: ['timer', 'countdown', 'kitchen', 'pomodoro', 'remaining', 'time'],
states: { ready: 'idle', running: 'active', done: 'alert' },
loop: 1,
draw(g, s) {
const k = arrive(s.since, 0.5);
const minutes = typeof s.params.minutes === 'number' && s.params.minutes > 0 ? s.params.minutes : 5;
const set = clamp(s.level);
let rem = set;
if (s.state === 'ready') rem = set * k; 
if (s.state === 'running') rem = clamp(set - s.since / (minutes * 60));
if (s.state === 'done') rem = 0;
const expired = s.state === 'done' || rem <= 0.0005;
g.circle(C, C, R, { role: expired && s.state !== 'ready' ? 'accent' : 'line' });
const a = (1 - rem) * 360; 
const d = wedge(C, C, W, a, 360);
if (d) {
if (s.state === 'running') {
if (k < 1) g.path(d, { role: 'fill', fill: true, opacity: 0.3 * (1 - k) });
g.path(d, { role: 'accent', fill: true, opacity: lerp(0.3, 0.88, k) });
} else g.path(d, { role: 'fill', fill: true, opacity: 0.32 });
}
const [hx, hy] = g.polar(C, C, W, expired ? 0 : a);
g.line(C, C, hx, hy, { role: expired && s.state !== 'ready' ? 'accent' : 'line' });
g.dot(C, C, 2.2, { role: 'fill' });
if (s.state === 'running' && !expired) {
const [sx, sy] = g.polar(C, C, 14.5, a);
const b = pulse(s.t, 1);
g.dot(sx, sy, 1.3 + 0.5 * b, { opacity: 0.55 + 0.45 * b });
}
if (expired && s.state !== 'ready') {
const p = phase(s.t, 0.5), e = outExpo(p);
const r0 = lerp(4.5, 9.5, e), r1 = lerp(6.5, 13, e), op = (1 - p) * (s.state === 'done' ? k : 1);
for (let i = 0; i < 8; i++) {
const ang = 22.5 + i * 45;
const [x0, y0] = g.polar(C, C, r0, ang), [x1, y1] = g.polar(C, C, r1, ang);
g.line(x0, y0, x1, y1, { role: 'accent', weight: 0.75, opacity: op });
}
}
},
});
};
__d[210] = function (__ns) {
const { P } = __m(5);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "X0": () => X0, "Y0": () => Y0, "X1": () => X1, "Y1": () => Y1, "R": () => R, "HEAD": () => HEAD, "frame": () => frame, "header": () => header, "region": () => region, "motion": () => motion, "lerp": () => lerp }, [], ["HEAD","R","X0","X1","Y0","Y1","frame","header","lerp","motion","region"]);
const X0 = 7;
const Y0 = 9.5;
const X1 = 41;
const Y1 = 38.5;
const R = 4.5;
const HEAD = 16;
const frame = (g, o = {}) => g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: R, ...o });
const header = (g, o = {}) => g.line(X0, HEAD, X1, HEAD, { role: 'dim', ...o });
function region(x0, y0, x1, y1) {
const tl = x0 <= X0 && y0 <= Y0 ? R : 0, tr = x1 >= X1 && y0 <= Y0 ? R : 0;
const br = x1 >= X1 && y1 >= Y1 ? R : 0, bl = x0 <= X0 && y1 >= Y1 ? R : 0;
const p = P().M(x0 + tl, y0).H(x1 - tr);
if (tr) p.A(tr, tr, 0, 0, 1, x1, y0 + tr);
p.V(y1 - br);
if (br) p.A(br, br, 0, 0, 1, x1 - br, y1);
p.H(x0 + bl);
if (bl) p.A(bl, bl, 0, 0, 1, x0, y1 - bl);
p.V(y0 + tl);
if (tl) p.A(tl, tl, 0, 0, 1, x0 + tl, y0);
return p.Z().d;
}
const motion = (s) => ({ k: enter(s, 0.5), p: press(s, 0.4) });
};
__d[211] = function (__ns) {
const { defineGlyph } = __m(16);
const { chevron } = __m(24);
const { frame, motion, lerp } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'fit',
title: 'Fit',
category: 'window',
tags: ['fit', 'fit to screen', 'stretch', 'scale to fit', 'bounds', 'resize', 'transform'],
draw(g, s) {
const { k, p } = motion(s);
frame(g, { role: 'dim' });
const o = lerp(7, 0, k) - 1 * p;
const a = 12.5 + o, b = 35.5 - o;
g.line(a, 24, b, 24, { role: 'line' });
g.polyline(chevron([a, 24], 270, 6, 45), { role: 'accent', join: 'round' });
g.polyline(chevron([b, 24], 90, 6, 45), { role: 'accent', join: 'round' });
},
});
};
__d[212] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'hdr',
title: 'HDR',
category: 'window',
tags: ['hdr', 'high dynamic range', 'display', 'brightness', 'monitor', 'color'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const m = arrive(s.since, 0.45);
const k = on ? m : 1 - m;
g.rect(7, 9, 34, 23, { r: 4, role: on ? 'accent' : 'line' });
g.line(24, 32, 24, 37.5, { role: 'line' });
g.line(16, 38.5, 32, 38.5, { role: 'line' });
const r = lerp(3.5, 5, k);
g.path(`M${24 - r} 27.5A${r} ${r} 0 0 1 ${24 + r} 27.5`, { role: on ? 'accent' : 'dim', weight: 1.05 });
for (const a of [-60, -30, 0, 30, 60]) {
const [x0, y0] = g.polar(24, 27.5, r + 2.5, a), [x1, y1] = g.polar(24, 27.5, r + 2.5 + lerp(0.5, 3, k), a);
g.line(x0, y0, x1, y1, { role: on ? 'accent' : 'dim', opacity: lerp(0.5, 1, k) });
}
},
});
};
__d[213] = function (__ns) {
const { defineGlyph } = __m(16);
const { frame, region, motion, lerp, X0, X1, Y0, Y1 } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const XS = 22, YS = 24;
const ZONES = [[X0, Y0, XS, Y1], [XS, Y0, X1, YS], [XS, YS, X1, Y1]];
const __default = defineGlyph({
id: 'layout',
title: 'Snap Layout',
category: 'window',
tags: ['layout', 'snap layout', 'snap', 'arrange', 'tile', 'zones', 'placer', 'window'],
draw(g, s) {
const { k } = motion(s);
const lit = !s.pressed && s.pressAge < 0.6 ? 2 : 0;
g.path(region(...ZONES[lit]), { role: 'accent', fill: true, opacity: 0.32 * k });
frame(g);
const x = lerp(X1 - 2, XS, k), y = lerp(Y1 - 2, YS, k);
g.line(x, Y0, x, Y1, { role: 'line' });
g.line(x, y, X1, y, { role: 'line' });
},
});
};
__d[214] = function (__ns) {
const { defineGlyph } = __m(16);
const { chevron } = __m(24);
const { frame, header, motion, lerp } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'maximize',
title: 'Maximize',
category: 'window',
tags: ['maximize', 'enlarge', 'fill screen', 'restore', 'window', 'grow'],
draw(g, s) {
const { k, p } = motion(s);
frame(g);
header(g);
const y = lerp(31.5, 23.5, k) - 1.8 * p;
g.polyline(chevron([24, y], 0, 9, 45), { role: 'accent', join: 'round', weight: 1.05, opacity: lerp(0.3, 1, k) });
},
});
};
__d[215] = function (__ns) {
const { defineGlyph } = __m(16);
const { chevron } = __m(24);
const { frame, header, motion, lerp } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'minimize',
title: 'Minimize',
category: 'window',
tags: ['minimize', 'hide', 'taskbar', 'shrink', 'window', 'iconify'],
draw(g, s) {
const { k, p } = motion(s);
frame(g);
header(g);
const y = lerp(20.5, 27, k) + 1.5 * p;
g.polyline(chevron([24, y], 180, 8, 45), { role: 'accent', join: 'round', weight: 1.05, opacity: lerp(0.3, 1, k) });
g.line(17, 33, 31, 33, { role: 'accent', weight: 1.05 });
},
});
};
__d[216] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp, clamp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'monitor',
title: 'Monitor',
category: 'window',
tags: ['monitor', 'display', 'screen', 'next monitor', 'move to monitor', 'desktop', 'output'],
draw(g, s) {
const k = enter(s, 0.6), p = press(s, 0.45);
if (p > 0.02) g.rect(7, 9, 34, 23, { r: 4, role: 'accent', fill: true, opacity: 0.3 * p });
g.rect(7, 9, 34, 23, { r: 4 });
g.line(24, 32, 24, 37.5, { role: 'line' });
g.line(16, 38.5, 32, 38.5, { role: 'line' });
const y = lerp(13, 28, clamp(k));
if (k < 0.99) g.line(11.5, y, 36.5, y, { role: 'accent', weight: 0.7, opacity: 1 - k });
g.line(11.5, 13.5, 16.5, 13.5, { role: 'dim', opacity: k });
},
});
};
__d[217] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive } = __m(12);
const { frame, region, lerp, X0, X1, Y1 } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'panel',
title: 'Panel',
category: 'window',
tags: ['panel', 'bottom panel', 'toggle panel', 'output', 'console', 'bottom', 'dock'],
states: { shown: 'active', hidden: 'idle' },
draw(g, s) {
const m = arrive(s.since, 0.4);
const k = s.state === 'shown' ? m : 1 - m; 
const y = lerp(Y1 - 1.5, 28.5, k);
if (k > 0.02) g.path(region(X0, y, X1, Y1), { role: 'accent', fill: true, opacity: 0.28 * k });
frame(g);
g.line(X0, y, X1, y, { role: k > 0.5 ? 'line' : 'dim' });
},
});
};
__d[218] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { frame } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'pip',
title: 'Picture in Picture',
category: 'window',
tags: ['pip', 'picture in picture', 'miniplayer', 'mini player', 'float', 'video', 'overlay'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const m = arrive(s.since, 0.4);
const k = on ? m : 1 - m;
frame(g);
const w = lerp(11, 14, k), h = lerp(8, 10, k);
g.rect(36.5 - w, 34 - h, w, h, { r: 2.5, role: on ? 'accent' : 'fill', fill: true, opacity: lerp(0.75, 1, k) });
},
});
};
__d[219] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive } = __m(12);
const { frame, region, lerp, X0, Y0, Y1 } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'sidebar',
title: 'Sidebar',
category: 'window',
tags: ['sidebar', 'side bar', 'explorer', 'toggle sidebar', 'panel', 'navigation pane', 'drawer'],
states: { shown: 'active', hidden: 'idle' },
draw(g, s) {
const m = arrive(s.since, 0.4);
const k = s.state === 'shown' ? m : 1 - m; 
const x = lerp(X0 + 1.5, 18.5, k);
if (k > 0.02) g.path(region(X0, Y0, x, Y1), { role: 'accent', fill: true, opacity: 0.28 * k });
frame(g);
g.line(x, Y0, x, Y1, { role: k > 0.5 ? 'line' : 'dim' });
},
});
};
__d[220] = function (__ns) {
const { chevron } = __m(24);
const { frame, region, motion, lerp, X0, X1, Y0, Y1 } = __m(210);
__e(__ns, { "drawSnap": () => drawSnap }, [], ["drawSnap"]);
function drawSnap(g, s, side) {
const { k, p } = motion(s);
const w = lerp(4, 17, k);
const [a, b] = side < 0 ? [X0, X0 + w] : [X1 - w, X1];
g.path(region(a, Y0, b, Y1), { role: 'accent', fill: true, opacity: 0.38 });
frame(g);
g.line(side < 0 ? b : a, Y0, side < 0 ? b : a, Y1, { role: 'line' });
const cx = 24 - side * 8.5 + side * 1.5 * p;
g.polyline(chevron([cx + side * 2.5, 24], side < 0 ? 270 : 90, 6, 45), { role: 'line', join: 'round', opacity: k });
}
};
__d[221] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSnap } = __m(220);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'snap-left',
title: 'Snap Left',
category: 'window',
tags: ['snap', 'snap left', 'left half', 'tile', 'arrange', 'window'],
draw(g, s) { drawSnap(g, s, -1); },
});
};
__d[222] = function (__ns) {
const { defineGlyph } = __m(16);
const { drawSnap } = __m(220);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'snap-right',
title: 'Snap Right',
category: 'window',
tags: ['snap', 'snap right', 'right half', 'tile', 'arrange', 'window'],
draw(g, s) { drawSnap(g, s, 1); },
});
};
__d[223] = function (__ns) {
const { defineGlyph } = __m(16);
const { frame, region, motion, lerp, X0, X1, Y1 } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'split-down',
title: 'Split Down',
category: 'window',
tags: ['split', 'split down', 'horizontal split', 'pane', 'rows', 'stack'],
draw(g, s) {
const { k, p } = motion(s);
const y = lerp(33.5, 24, k);
if (p > 0.02) g.path(region(X0, y, X1, Y1), { role: 'accent', fill: true, opacity: 0.3 * p });
frame(g);
g.line(X0, y, X1, y, { role: 'line' });
},
});
};
__d[224] = function (__ns) {
const { defineGlyph } = __m(16);
const { frame, region, motion, lerp, X1, Y0, Y1 } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'split',
title: 'Split Right',
category: 'window',
tags: ['split', 'split right', 'split editor', 'side by side', 'pane', 'columns', 'split view'],
draw(g, s) {
const { k, p } = motion(s);
const x = lerp(36, 24, k);
if (p > 0.02) g.path(region(x, Y0, X1, Y1), { role: 'accent', fill: true, opacity: 0.3 * p });
frame(g);
g.line(x, Y0, x, Y1, { role: 'line' });
},
});
};
__d[225] = function (__ns) {
const { defineGlyph } = __m(16);
const { arrive, lerp } = __m(12);
const { chevron } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'theater',
title: 'Theater Mode',
category: 'window',
tags: ['theater', 'theater mode', 'wide', 'cinema', 'wide player', 'video'],
states: { off: 'idle', on: 'active' },
draw(g, s) {
const on = s.state === 'on';
const m = arrive(s.since, 0.4);
const k = on ? m : 1 - m;
g.rect(6.5, 13, 35, 22, { r: 4, role: on ? 'accent' : 'line' });
g.polygon([[21.5, 19], [29.5, 24], [21.5, 29]], { role: 'fill', join: 'round' });
const o = lerp(0, 2.5, k);
g.polyline(chevron([12 - o, 24], 270, 4.5, 45), { role: 'dim', join: 'round' });
g.polyline(chevron([36 + o, 24], 90, 4.5, 45), { role: 'dim', join: 'round' });
},
});
};
__d[226] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'view-details',
title: 'Details View',
category: 'window',
tags: ['details', 'list', 'list view', 'rows', 'columns', 'view'],
draw(g, s) {
const p = press(s, 0.4);
[12.5, 24, 35.5].forEach((y, i) => {
const k = enter({ since: s.since - i * 0.08 }, 0.4);
g.rect(8, y - 3, 6, 6, { r: 1.8, role: i === 0 && p > 0.3 ? 'accent' : 'fill', fill: true, opacity: lerp(0.2, 1, k) });
g.line(19, y, lerp(19, [40, 35, 38][i], k), y, { role: i === 0 && p > 0.3 ? 'accent' : 'line' });
});
},
});
};
__d[227] = function (__ns) {
const { defineGlyph } = __m(16);
const { lerp } = __m(12);
const { enter, press } = __m(24);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'view-icons',
title: 'Icons View',
category: 'window',
tags: ['icons', 'big icons', 'grid', 'thumbnails', 'tiles', 'view', 'icon size'],
draw(g, s) {
const p = press(s, 0.4);
[[9, 9], [26, 9], [9, 26], [26, 26]].forEach(([x, y], i) => {
const k = enter({ since: s.since - i * 0.07 }, 0.4), h = lerp(4.5, 0, k);
g.rect(x + h, y + h, 13 - 2 * h, 13 - 2 * h, { r: 3, role: i === 0 && p > 0.3 ? 'accent' : 'line', opacity: lerp(0.2, 1, k) });
});
},
});
};
__d[228] = function (__ns) {
const { defineGlyph } = __m(16);
const { frame, header, motion, lerp } = __m(210);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = defineGlyph({
id: 'window',
title: 'Window',
category: 'window',
tags: ['window', 'app', 'switch window', 'window 1', 'focus', 'task', 'desktop'],
draw(g, s) {
const { k, p } = motion(s);
frame(g);
header(g, { role: p > 0.3 ? 'accent' : 'line' });
g.dot(11.5, 12.75, 1.3, { role: 'fill' });
g.dot(15.5, 12.75, 1.3, { role: 'fill', opacity: 0.6 });
g.line(12.5, 23.5, lerp(12.5, 33, k), 23.5, { role: 'dim' });
g.line(12.5, 30.5, lerp(12.5, 26, k), 30.5, { role: 'dim' });
},
});
};
__d[229] = function (__ns) {
const m0 = __m(17);
const m1 = __m(18);
const m2 = __m(19);
const m3 = __m(20);
const m4 = __m(21);
const m5 = __m(22);
const m6 = __m(23);
const m7 = __m(25);
const m8 = __m(27);
const m9 = __m(30);
const m10 = __m(31);
const m11 = __m(32);
const m12 = __m(33);
const m13 = __m(34);
const m14 = __m(35);
const m15 = __m(36);
const m16 = __m(37);
const m17 = __m(38);
const m18 = __m(40);
const m19 = __m(41);
const m20 = __m(42);
const m21 = __m(43);
const m22 = __m(46);
const m23 = __m(47);
const m24 = __m(48);
const m25 = __m(49);
const m26 = __m(50);
const m27 = __m(51);
const m28 = __m(52);
const m29 = __m(53);
const m30 = __m(54);
const m31 = __m(56);
const m32 = __m(57);
const m33 = __m(58);
const m34 = __m(59);
const m35 = __m(60);
const m36 = __m(61);
const m37 = __m(62);
const m38 = __m(63);
const m39 = __m(64);
const m40 = __m(65);
const m41 = __m(66);
const m42 = __m(67);
const m43 = __m(68);
const m44 = __m(70);
const m45 = __m(71);
const m46 = __m(72);
const m47 = __m(73);
const m48 = __m(74);
const m49 = __m(75);
const m50 = __m(76);
const m51 = __m(77);
const m52 = __m(78);
const m53 = __m(79);
const m54 = __m(80);
const m55 = __m(81);
const m56 = __m(82);
const m57 = __m(83);
const m58 = __m(84);
const m59 = __m(85);
const m60 = __m(86);
const m61 = __m(87);
const m62 = __m(88);
const m63 = __m(89);
const m64 = __m(90);
const m65 = __m(91);
const m66 = __m(92);
const m67 = __m(94);
const m68 = __m(95);
const m69 = __m(96);
const m70 = __m(97);
const m71 = __m(98);
const m72 = __m(99);
const m73 = __m(100);
const m74 = __m(101);
const m75 = __m(102);
const m76 = __m(103);
const m77 = __m(104);
const m78 = __m(105);
const m79 = __m(106);
const m80 = __m(107);
const m81 = __m(108);
const m82 = __m(109);
const m83 = __m(110);
const m84 = __m(111);
const m85 = __m(112);
const m86 = __m(114);
const m87 = __m(115);
const m88 = __m(117);
const m89 = __m(118);
const m90 = __m(120);
const m91 = __m(122);
const m92 = __m(123);
const m93 = __m(124);
const m94 = __m(125);
const m95 = __m(126);
const m96 = __m(127);
const m97 = __m(128);
const m98 = __m(129);
const m99 = __m(131);
const m100 = __m(132);
const m101 = __m(133);
const m102 = __m(134);
const m103 = __m(135);
const m104 = __m(137);
const m105 = __m(138);
const m106 = __m(139);
const m107 = __m(140);
const m108 = __m(141);
const m109 = __m(142);
const m110 = __m(143);
const m111 = __m(144);
const m112 = __m(145);
const m113 = __m(146);
const m114 = __m(147);
const m115 = __m(148);
const m116 = __m(149);
const m117 = __m(150);
const m118 = __m(151);
const m119 = __m(152);
const m120 = __m(153);
const m121 = __m(154);
const m122 = __m(155);
const m123 = __m(156);
const m124 = __m(158);
const m125 = __m(159);
const m126 = __m(160);
const m127 = __m(162);
const m128 = __m(163);
const m129 = __m(164);
const m130 = __m(165);
const m131 = __m(166);
const m132 = __m(167);
const m133 = __m(168);
const m134 = __m(169);
const m135 = __m(170);
const m136 = __m(171);
const m137 = __m(172);
const m138 = __m(173);
const m139 = __m(174);
const m140 = __m(175);
const m141 = __m(176);
const m142 = __m(177);
const m143 = __m(178);
const m144 = __m(179);
const m145 = __m(180);
const m146 = __m(181);
const m147 = __m(182);
const m148 = __m(183);
const m149 = __m(184);
const m150 = __m(185);
const m151 = __m(186);
const m152 = __m(187);
const m153 = __m(188);
const m154 = __m(189);
const m155 = __m(190);
const m156 = __m(191);
const m157 = __m(192);
const m158 = __m(193);
const m159 = __m(194);
const m160 = __m(195);
const m161 = __m(196);
const m162 = __m(197);
const m163 = __m(198);
const m164 = __m(199);
const m165 = __m(200);
const m166 = __m(201);
const m167 = __m(202);
const m168 = __m(203);
const m169 = __m(204);
const m170 = __m(205);
const m171 = __m(206);
const m172 = __m(207);
const m173 = __m(208);
const m174 = __m(209);
const m175 = __m(211);
const m176 = __m(212);
const m177 = __m(213);
const m178 = __m(214);
const m179 = __m(215);
const m180 = __m(216);
const m181 = __m(217);
const m182 = __m(218);
const m183 = __m(219);
const m184 = __m(221);
const m185 = __m(222);
const m186 = __m(223);
const m187 = __m(224);
const m188 = __m(225);
const m189 = __m(226);
const m190 = __m(227);
const m191 = __m(228);
__e(__ns, { "GLYPH_MODULES": () => GLYPH_MODULES }, [], ["GLYPH_MODULES"]);
const GLYPH_MODULES = [
['audio/equalizer.js', m0],
['audio/headphones.js', m1],
['audio/mic.js', m2],
['audio/mixer.js', m3],
['audio/music-note.js', m4],
['audio/volume.js', m5],
['audio/waveform.js', m6],
['build/align.js', m7],
['build/auto-complete.js', m8],
['build/bank-left.js', m9],
['build/bank-level.js', m10],
['build/bank-right.js', m11],
['build/bank.js', m12],
['build/booster.js', m13],
['build/brake.js', m14],
['build/chain-lift.js', m15],
['build/falloff.js', m16],
['build/heatmap.js', m17],
['build/length-minus.js', m18],
['build/length-plus.js', m19],
['build/loop.js', m20],
['build/path.js', m21],
['build/pitch-down.js', m22],
['build/pitch-level.js', m23],
['build/pitch-up.js', m24],
['build/pitch.js', m25],
['build/smooth.js', m26],
['build/special.js', m27],
['build/stairs.js', m28],
['build/station.js', m29],
['build/terrain.js', m30],
['build/track-curve-left.js', m31],
['build/track-curve-right.js', m32],
['build/track-straight.js', m33],
['dev/bug.js', m34],
['dev/build.js', m35],
['dev/cloud.js', m36],
['dev/code.js', m37],
['dev/definition.js', m38],
['dev/diff.js', m39],
['dev/fold.js', m40],
['dev/git-branch.js', m41],
['dev/references.js', m42],
['dev/rocket.js', m43],
['dev/step-into.js', m44],
['dev/step-out.js', m45],
['dev/symbol.js', m46],
['dev/terminal.js', m47],
['edit/brush.js', m48],
['edit/clear.js', m49],
['edit/copy.js', m50],
['edit/cursor.js', m51],
['edit/cut.js', m52],
['edit/delete.js', m53],
['edit/edit.js', m54],
['edit/forward.js', m55],
['edit/magnet.js', m56],
['edit/move.js', m57],
['edit/paste.js', m58],
['edit/rename.js', m59],
['edit/replace.js', m60],
['edit/rotate.js', m61],
['edit/scale.js', m62],
['edit/select.js', m63],
['edit/snap.js', m64],
['game/beam.js', m65],
['game/boost.js', m66],
['game/crouch.js', m67],
['game/exocraft.js', m68],
['game/follow.js', m69],
['game/freighter.js', m70],
['game/galaxy.js', m71],
['game/gamepad.js', m72],
['game/height.js', m73],
['game/jetpack.js', m74],
['game/jump.js', m75],
['game/land.js', m76],
['game/roll.js', m77],
['game/scanner.js', m78],
['game/sun.js', m79],
['game/walk.js', m80],
['game/warp.js', m81],
['home/bulb.js', m82],
['home/fan.js', m83],
['home/leaf.js', m84],
['home/plug.js', m85],
['home/thermostat.js', m86],
['media/artist.js', m87],
['media/chapter-next.js', m88],
['media/chapter-prev.js', m89],
['media/forward-10.js', m90],
['media/frame-next.js', m91],
['media/frame-prev.js', m92],
['media/play-pause.js', m93],
['media/queue.js', m94],
['media/record.js', m95],
['media/replay.js', m96],
['media/rewind-10.js', m97],
['media/shuffle.js', m98],
['media/skip-next.js', m99],
['media/skip-prev.js', m100],
['media/speed.js', m101],
['media/stop.js', m102],
['nav/address-bar.js', m103],
['nav/arrow-down.js', m104],
['nav/arrow-left.js', m105],
['nav/arrow-right.js', m106],
['nav/arrow-up.js', m107],
['nav/back.js', m108],
['nav/close.js', m109],
['nav/folder.js', m110],
['nav/fullscreen.js', m111],
['nav/goto-line.js', m112],
['nav/home.js', m113],
['nav/link.js', m114],
['nav/pages.js', m115],
['nav/pin.js', m116],
['nav/radial.js', m117],
['nav/scroll-bottom.js', m118],
['nav/scroll-top.js', m119],
['nav/scroll.js', m120],
['nav/search.js', m121],
['nav/tab-group.js', m122],
['nav/tab.js', m123],
['nav/zoom-in.js', m124],
['nav/zoom-out.js', m125],
['nav/zoom-reset.js', m126],
['productivity/bold.js', m127],
['productivity/captions.js', m128],
['productivity/coffee.js', m129],
['productivity/comment.js', m130],
['productivity/emoji.js', m131],
['productivity/eye.js', m132],
['productivity/font-size.js', m133],
['productivity/format.js', m134],
['productivity/gif.js', m135],
['productivity/heading.js', m136],
['productivity/heart.js', m137],
['productivity/indent.js', m138],
['productivity/italic.js', m139],
['productivity/keyboard.js', m140],
['productivity/layers.js', m141],
['productivity/mail.js', m142],
['productivity/note.js', m143],
['productivity/settings.js', m144],
['productivity/star.js', m145],
['productivity/sticker.js', m146],
['productivity/strike.js', m147],
['productivity/target.js', m148],
['status/alert.js', m149],
['status/check.js', m150],
['status/info.js', m151],
['status/lock.js', m152],
['status/power.js', m153],
['status/sync.js', m154],
['stream/broadcast.js', m155],
['stream/camera.js', m156],
['stream/chat.js', m157],
['stream/fade.js', m158],
['stream/marker.js', m159],
['stream/scene.js', m160],
['stream/screenshot.js', m161],
['stream/viewers.js', m162],
['system/battery.js', m163],
['system/cpu.js', m164],
['system/disk.js', m165],
['system/gpu.js', m166],
['system/memory.js', m167],
['system/network.js', m168],
['system/wifi.js', m169],
['time/alarm.js', m170],
['time/calendar.js', m171],
['time/clock.js', m172],
['time/stopwatch.js', m173],
['time/timer.js', m174],
['window/fit.js', m175],
['window/hdr.js', m176],
['window/layout.js', m177],
['window/maximize.js', m178],
['window/minimize.js', m179],
['window/monitor.js', m180],
['window/panel.js', m181],
['window/pip.js', m182],
['window/sidebar.js', m183],
['window/snap-left.js', m184],
['window/snap-right.js', m185],
['window/split-down.js', m186],
['window/split.js', m187],
['window/theater.js', m188],
['window/view-details.js', m189],
['window/view-icons.js', m190],
['window/window.js', m191],
];
};
__d[230] = function (__ns) {

__e(__ns, { "GLYPH_ALIASES": () => GLYPH_ALIASES }, [], ["GLYPH_ALIASES"]);
const GLYPH_ALIASES = Object.freeze({
axis: { glyph: 'move' }, 
bottom: { glyph: 'scroll-bottom' },
box: { glyph: 'scale' }, 
clipboard: { glyph: 'paste' },
'close-pane': { glyph: 'close' },
discard: { glyph: 'delete' },
duplicate: { glyph: 'copy' },
'eye-off': { glyph: 'eye', state: 'hidden' },
'folder-up': { glyph: 'arrow-up' },
gear: { glyph: 'settings' },
'hidden-files': { glyph: 'eye' },
'hide-ui': { glyph: 'eye', state: 'hidden' },
line: { glyph: 'goto-line' },
'mail-down': { glyph: 'arrow-down' },
'mail-up': { glyph: 'arrow-up' },
'monitor-next': { glyph: 'monitor' },
'page-scroll': { glyph: 'scroll' },
'page-top': { glyph: 'scroll-top' },
paint: { glyph: 'brush' },
'pane-down': { glyph: 'arrow-down' },
'pane-right': { glyph: 'arrow-right' },
'pane-up': { glyph: 'arrow-up' },
panes: { glyph: 'split' },
'path-join': { glyph: 'path' },
pause: { glyph: 'play-pause', state: 'playing' }, 
play: { glyph: 'play-pause', state: 'paused' },
preview: { glyph: 'eye' },
properties: { glyph: 'info' },
redo: { glyph: 'forward' },
'refresh-rate': { glyph: 'monitor' },
reopen: { glyph: 'back' }, 
resize: { glyph: 'scale' },
revert: { glyph: 'back' },
'seek-back': { glyph: 'rewind-10' },
'seek-forward': { glyph: 'forward-10' },
'select-all': { glyph: 'select' },
'select-block': { glyph: 'select' },
'select-lines': { glyph: 'select' },
'select-words': { glyph: 'select' },
'split-auto': { glyph: 'split' },
'split-right': { glyph: 'split' },
'tab-1': { glyph: 'tab' },
'tab-2': { glyph: 'tab' },
'tab-close': { glyph: 'close' },
'tab-last': { glyph: 'tab' },
'tab-move': { glyph: 'tab' },
'tab-next': { glyph: 'arrow-right' },
'tab-prev': { glyph: 'arrow-left' },
'tab-slot': { glyph: 'tab' },
top: { glyph: 'scroll-top' },
transform: { glyph: 'scale' },
trash: { glyph: 'delete' },
undo: { glyph: 'back' },
'width-minus': { glyph: 'length-minus' },
'width-plus': { glyph: 'length-plus' },
'window-close': { glyph: 'close' },
zoom: { glyph: 'zoom-in' },
});
};
__d[231] = function (__ns) {
const { GLYPH_MODULES } = __m(229);
const { GLYPH_ALIASES } = __m(230);
__e(__ns, { "glyphRegistry": () => glyphRegistry, "allGlyphs": () => allGlyphs, "glyphCategories": () => glyphCategories, "resolveGlyph": () => resolveGlyph, "getGlyph": () => getGlyph, "glyphAliases": () => glyphAliases }, [], ["allGlyphs","getGlyph","glyphAliases","glyphCategories","glyphRegistry","resolveGlyph"]);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let cache = null;
function glyphRegistry() {
if (cache) return cache;
const glyphs = new Map(), aliases = new Map(), problems = [];
for (const [file, mod] of GLYPH_MODULES) {
const g = mod.default;
if (!g || typeof g.draw !== 'function' || !g.stateNames) { problems.push(`${file}: default export must be defineGlyph({...})`); continue; }
const [cat, name] = file.split('/');
if (g.category !== cat) problems.push(`${file}: category "${g.category}" must match its folder "${cat}"`);
if (`${g.id}.js` !== name) problems.push(`${file}: glyph id "${g.id}" must match its file name`);
if (glyphs.has(g.id)) problems.push(`duplicate glyph id "${g.id}" (${file})`);
glyphs.set(g.id, Object.freeze({ ...g, file }));
}
for (const [name, a] of Object.entries(GLYPH_ALIASES)) {
const target = glyphs.get(a?.glyph);
if (!KEBAB.test(name)) problems.push(`alias "${name}" must be kebab-case`);
else if (glyphs.has(name)) problems.push(`alias "${name}" shadows the glyph of the same id`);
else if (!target) problems.push(`alias "${name}" → unknown glyph "${a?.glyph}"`);
else if (a.state != null && !target.states[a.state]) problems.push(`alias "${name}" → ${a.glyph} has no state "${a.state}"`);
else aliases.set(name, Object.freeze({ glyph: a.glyph, state: a.state ?? null }));
}
cache = { glyphs, aliases, problems };
return cache;
}
const allGlyphs = () => [...glyphRegistry().glyphs.values()];
const glyphCategories = () => [...new Set(allGlyphs().map((g) => g.category))];
function resolveGlyph(name) {
const id = typeof name === 'string' ? name.split('/').pop() : '';
const { glyphs, aliases } = glyphRegistry();
const g = glyphs.get(id);
if (g) return { glyph: g, state: null, alias: null };
const a = aliases.get(id);
return a ? { glyph: glyphs.get(a.glyph), state: a.state, alias: id } : null;
}
const getGlyph = (id) => glyphRegistry().glyphs.get(id) || resolveGlyph(id)?.glyph || null;
const glyphAliases = () => [...glyphRegistry().aliases].map(([name, a]) => ({ name, ...a }));
};
__d[232] = function (__ns) {
const { defineTheme, bezelCorner } = __m(14);
const { rect, path, circle, polygon, url, linearGradient, radialGradient, n, P, attrs } = __m(5);
const { mix } = __m(4);
const { clamp, lerp, outCubic, outExpo, pulse, phase, arrive } = __m(12);
const { hash } = __m(1);
const { pathBounds } = __m(13);
const { getGlyph } = __m(231);
__e(__ns, { "curtainColors": () => curtainColors, "auroraLayer": () => auroraLayer, "frostLayer": () => frostLayer, "default": () => __default, "pane": () => pane, "paintAurora": () => paintAurora, "ENERGY": () => ENERGY }, [], ["ENERGY","auroraLayer","curtainColors","default","frostLayer","paintAurora","pane"]);
const NIGHT = {
bg: '#04060d', surface: '#0e1426', surface2: '#060912', line: '#1c2440',
ink: '#f1f5ff', muted: '#aab5d1', dim: '#7d88a8', faint: '#4b5472',
accent: '#79eac4', accent2: '#b9a3ff', pos: '#7fe3a9', info: '#86c5ff', warn: '#f5cd72', neg: '#ff8f8f', crit: '#ff86c3',
edge: '#e8f1ff', edgeOpacity: 0.2, beam: '#e6fbff', beamOpacity: 0.85, sheenOpacity: 0.08,
frost: '#dce8ff', sky: '#03050b',
spectrum: { l: 0.81, c: 0.125 },
};
const DAY = {
bg: '#e6eaf4', surface: '#f8f9fd', surface2: '#e9edf6', line: '#cdd4e5',
ink: '#151b2d', muted: '#465069', dim: '#68718e', faint: '#a3aac0',
accent: '#0a7f62', accent2: '#6a4bcf', pos: '#1d7744', info: '#1f60b5', warn: '#875800', neg: '#b03036', crit: '#a31c61',
edge: '#ffffff', edgeOpacity: 0.95, beam: '#6a4bcf', beamOpacity: 0.5, sheenOpacity: 0.2,
frost: '#ffffff', sky: '#dfe4f1',
spectrum: { l: 0.6, c: 0.13 },
};
const ENERGY = { off: 0, idle: 0.42, active: 1, ok: 0.85, info: 0.85, warn: 0.95, neg: 0.95, alert: 1, crit: 1, busy: 0.6 };
const LIT = new Set(['active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit']);
const ALERT = new Set(['warn', 'neg', 'alert', 'crit']);
const TAU = Math.PI * 2;
const keySeed = (k) => { let h = k.ctx.seed | 0; for (const ch of String(k.idPrefix)) h = (h * 31 + ch.charCodeAt(0)) | 0; return hash(h, 17); };
const breath = (k) => (k.ctx.since >= 10 || k.ctx.reduced ? 1 : lerp(0.55, 1.1, pulse(k.ctx.t, 1)));
function curtainColors(k, tone) {
const C = k.colors;
if (tone === 'active') return [k.ctx.tint, k.theme.spectral(k.ctx.hue + 64)];
if (tone === 'idle' || tone === 'busy' || tone === 'off') return [C.accent, C.accent2];
const c = k.tone(tone);
return [c, mix(c, C.accent2, 0.5)];
}
function arcBand(k, { x, y, w, h, cx, cy, r, color, peak, at = 0.7, spread = 0.2, sx = 1 }) {
if (peak <= 0.002) return;
const id = k.id('arc');
const stops = [[0, color, 0], [Math.max(0, at - 0.05), color, 0], [at, color, peak], [Math.min(1, at + spread * 0.35), color, peak * 0.45], [Math.min(1, at + spread), color, 0], [1, color, 0]];
const ex = { cx, cy, r };
if (sx !== 1) ex.gradientTransform = `translate(${n(cx, 3)} ${n(cy, 3)}) scale(${n(sx, 3)} 1) translate(${n(-cx, 3)} ${n(-cy, 3)})`;
k.def(radialGradient(id, stops, ex));
k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
}
function auroraLayer(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h, energy = ENERGY[tone] ?? 0.5, flow = 1 } = {}) {
if (energy <= 0.001) return;
const dark = k.dark;
const [c1, c2] = curtainColors(k, tone);
const s0 = keySeed(k), s1 = hash(Math.floor(s0 * 7919), 3);
const aspect = w / h;
const a = dark ? 1 : 1.25;
const drift = 1 - flow; 
const sx = aspect > 1.2 ? 1 / Math.min(4, aspect) : 1; 
const gid = k.id('hz');
k.def(radialGradient(gid, [[0, c1, (dark ? 0.18 : 0.16) * energy], [0.6, c1, (dark ? 0.05 : 0.05) * energy], [1, c1, 0]], { cx: 0.3 + 0.4 * s1, cy: 1.12, r: 0.7 }));
k.add(rect({ x, y, width: w, height: h, fill: url(gid) }));
arcBand(k, { x, y, w, h, cx: 1.1 - 0.5 * s0, cy: 1.45 + 0.25 * drift, r: 1.45, color: c2, peak: 0.34 * energy * a, at: 0.74, spread: 0.24, sx });
arcBand(k, { x, y, w, h, cx: -0.1 + 0.4 * s0, cy: 1.7 + 0.35 * drift, r: 1.65, color: c1, peak: 0.6 * energy * a, at: 0.72, spread: 0.2, sx });
arcBand(k, { x, y, w, h, cx: -0.1 + 0.4 * s0, cy: 1.7 + 0.35 * drift, r: 1.65, color: dark ? mix(c1, '#ffffff', 0.5) : c1, peak: (dark ? 0.32 : 0.2) * energy, at: 0.725, spread: 0.035, sx });
const bid = k.id('bloom');
k.def(radialGradient(bid, [[0, c2, (dark ? 0.16 : 0.14) * energy], [1, c2, 0]], { cx: 0.15 + 0.7 * s1, cy: -0.05, r: 0.6 }));
k.add(rect({ x, y, width: w, height: h, fill: url(bid) }));
}
function frostLayer(k, { x = 0, y = 0, w = k.w, h = k.h, tone = 'idle', rim = true } = {}) {
const C = k.colors, dark = k.dark, u = k.m.u, key = k.ctx.kind === 'key';
const vid = k.id('veil');
const off = tone === 'off';
k.def(linearGradient(vid, dark
? [[0, C.frost, off ? 0.05 : 0.1], [0.5, C.frost, 0.03], [1, C.frost, off ? 0.03 : 0.065]]
: [[0, C.frost, 0.5], [0.55, C.frost, 0.26], [1, C.frost, 0.42]]));
k.add(rect({ x, y, width: w, height: h, fill: url(vid) }));
const sid = k.id('sheen');
k.def(linearGradient(sid, [[0, C.frost, 0], [0.42, C.frost, dark ? 0.06 : 0.3], [0.5, C.frost, 0], [1, C.frost, 0]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
k.add(rect({ x, y, width: w, height: h, fill: url(sid) }));
const s0 = Math.floor(keySeed(k) * 9973);
const count = key ? 9 : Math.min(40, Math.round((w * h) / (900 * u * u)));
let dots = '';
for (let i = 0; i < count; i++) {
const px = x + w * (0.06 + 0.88 * hash(i, s0, 1)), py = y + h * (0.05 + 0.9 * hash(i, s0, 2)), r = u * (0.35 + 0.55 * hash(i, s0, 3));
dots += `M${n(px - r)} ${n(py)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
}
k.add(path(dots, { fill: dark ? C.frost : '#ffffff', fillOpacity: dark ? (off ? 0.1 : 0.2) : 0.85 }));
if (!rim) return;
const ins = k.m.hair / 2;
const rid = k.id('rim');
k.def(linearGradient(rid, dark
? [[0, C.edge, off ? 0.25 : 0.55], [0.3, C.edge, 0.14], [1, C.edge, 0.06]]
: [[0, '#ffffff', 1], [0.5, '#ffffff', 0.6], [1, '#ffffff', 0.3]]));
const rr = key ? k.m.radius : Math.min(k.m.radius, h / 3);
k.add(rect({ x: x + ins, y: y + ins, width: w - ins * 2, height: h - ins * 2, rx: rr, fill: 'none', stroke: url(rid), strokeWidth: n(k.m.hair) }));
if (!dark) k.add(rect({ x: x + k.m.hair * 1.5, y: y + k.m.hair * 1.5, width: w - k.m.hair * 3, height: h - k.m.hair * 3, rx: Math.max(0, rr - k.m.hair), fill: 'none', stroke: '#3c4766', strokeWidth: n(k.m.hair), strokeOpacity: 0.1 }));
}
function surge(k, { x = 0, y = 0, w = k.w, h = k.h, color }) {
const f = k.ctx.reduced ? 0.5 : phase(k.ctx.t, 1.2);
const id = k.id('surge');
const bw = w * 0.55, bx = x - bw + f * (w + bw);
k.def(linearGradient(id, [[0, color, 0], [0.5, color, k.dark ? 0.34 : 0.26], [1, color, 0]], { x1: bx, y1: 0, x2: bx + bw, y2: 0, gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
k.add(rect({ x: bx + bw * 0.25, y: y + h - k.m.line * 1.4, width: bw * 0.5, height: k.m.line, rx: k.m.line / 2, fill: color, fillOpacity: 0.8 }));
}
function pane(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, ctx = k.ctx;
const sky = k.id('sky');
k.def(linearGradient(sky, k.dark ? [[0, C.sky], [0.55, C.surface2], [1, C.surface]] : [[0, C.surface], [1, C.surface2]]));
k.add(rect({ x, y, width: w, height: h, fill: url(sky) }));
let energy = ENERGY[tone] ?? 0.5;
if (ALERT.has(tone)) energy *= breath(k);
const flow = ctx.reduced ? 1 : clamp(ctx.since / 6);
const settle = LIT.has(tone) ? outCubic(flow) : 1;
auroraLayer(k, { tone, x, y, w, h, energy, flow: settle });
if (tone === 'busy') surge(k, { x, y, w, h, color: k.dark ? C.beam : C.accent2 });
if ((ctx.kind === 'key' || ctx.kind === 'screen') && tone !== 'off') {
const sc = k.id('scrim');
k.def(linearGradient(sc, k.dark ? [[0.5, C.sky, 0], [0.78, C.sky, 0.38], [1, C.sky, 0.55]] : [[0.55, '#ffffff', 0], [0.8, '#ffffff', 0.4], [1, '#ffffff', 0.55]]));
k.add(rect({ x, y, width: w, height: h, fill: url(sc) }));
}
frostLayer(k, { x, y, w, h, tone });
if (ALERT.has(tone)) {
const s = Math.min(w, h) * 0.17, c = k.tone(tone), { X, Y } = bezelCorner(k, { x, y, w, h });
k.add(polygon([[X - s, Y], [X, Y], [X, Y + s]], { fill: c, fillOpacity: n(clamp(0.55 + 0.4 * breath(k) / 1.1), 3) }));
k.add(path(P().M(X - s * 1.45, Y).L(X, Y + s * 1.45).d, { stroke: C.frost, strokeWidth: n(k.m.hair), strokeOpacity: k.dark ? 0.35 : 0.8 }));
}
}
const gradMemo = (k) => k._d3aurora || (k._d3aurora = new Map());
function gridGradient(k, key, stops) {
const memo = gradMemo(k);
let id = memo.get(key);
if (!id) {
id = k.id('ag');
k.def(linearGradient(id, stops, { x1: 0, y1: 7, x2: 0, y2: 41, gradientUnits: 'userSpaceOnUse' }));
memo.set(key, id);
}
return id;
}
const twinkle = (cx, cy, R) => P().M(cx, cy - R).Q(cx, cy, cx + R, cy).Q(cx, cy, cx, cy + R).Q(cx, cy, cx - R, cy).Q(cx, cy, cx, cy - R).Z().d;
function paintAurora(k, prim, style) {
const tone = k.toneName, dark = k.dark, lit = LIT.has(tone);
const op = clamp((style.opacity ?? 1) * (prim.opacity ?? 1));
if (op < 0.005) return '';
const w = (style.width ?? 3) * (prim.weight ?? 1);
const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : null;
const glow = (style.glow || 0) * (tone === 'off' ? 0 : 1);
const haloC = style.halo || style.color;
let paint = style.color;
if (prim.role === 'accent' && tone !== 'off') {
const [c1, c2] = curtainColors(k, tone);
const top = dark ? mix(c2, '#ffffff', 0.15) : c2, bot = dark ? mix(c1, '#ffffff', 0.12) : c1;
paint = url(gridGradient(k, `acc|${tone}|${top}|${bot}`, [[0, top], [1, bot]]));
} else if ((prim.role === 'line' || prim.role === 'fill') && lit && style.color === k.colors.ink) {
const [c1] = curtainColors(k, tone);
const bot = dark ? mix(c1, '#ffffff', 0.45) : mix(c1, k.colors.ink, 0.35);
paint = url(gridGradient(k, `ink|${tone}|${bot}`, [[0, k.colors.ink], [0.45, k.colors.ink], [1, bot]]));
}
let out = '';
const oo = op < 1 ? n(op, 3) : null;
if (prim.role === 'spark') {
const b = pathBounds(prim.d);
const r = Math.max(b.w, b.h) / 2;
if (prim.fill && /A/.test(prim.d) && r < 3.2 && Math.abs(b.w - b.h) < 0.6) {
const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
if (glow) out += `<circle${attrs({ cx: n(cx), cy: n(cy), r: n(r * 2.6), fill: haloC, fillOpacity: n((dark ? 0.16 : 0.12) * op * glow, 3) })}/>`;
out += `<path${attrs({ d: twinkle(cx, cy, r * 2.1), fill: paint, fillOpacity: oo })}/>`;
out += `<path${attrs({ d: prim.d, fill: dark ? '#ffffff' : paint, fillOpacity: n(op * (dark ? 0.9 : 1), 3) })}/>`;
return out;
}
}
if (prim.fill) {
if (glow) out += `<path${attrs({ d: prim.d, fill: 'none', stroke: haloC, strokeWidth: n(2.5 + 4 * glow), strokeOpacity: n((dark ? 0.14 : 0.1) * glow * op, 3), strokeLinejoin: 'round' })}/>`;
out += `<path${attrs({ d: prim.d, fill: paint, fillOpacity: oo, fillRule: style.fillRule || null })}/>`;
return out;
}
if (glow) {
out += `<path${attrs({ d: prim.d, fill: 'none', stroke: haloC, strokeWidth: n(w * (1 + 3.2 * glow)), strokeOpacity: n((dark ? 0.1 : 0.07) * glow * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
out += `<path${attrs({ d: prim.d, fill: 'none', stroke: haloC, strokeWidth: n(w * (1 + 1.3 * glow)), strokeOpacity: n((dark ? 0.16 : 0.1) * glow * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
}
out += `<path${attrs({ d: prim.d, fill: 'none', stroke: paint, strokeWidth: n(w), strokeOpacity: oo, strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
return out;
}
const roleColor = {
line: (k, tone) => (tone === 'off' ? k.colors.dim : k.colors.ink),
accent: (k, tone) => (tone === 'off' ? k.colors.faint : tone === 'idle' || tone === 'busy' ? k.colors.accent : curtainColors(k, tone)[0]),
dim: (k, tone) => (tone === 'off' ? k.colors.faint : k.colors.muted),
spark: (k, tone) => (tone === 'off' ? k.colors.dim : tone === 'idle' || tone === 'busy' ? (k.dark ? k.colors.ink : k.colors.accent) : curtainColors(k, tone)[0]),
};
const haloOf = (k, tone) => (tone === 'off' ? k.colors.dim : curtainColors(k, tone)[0]);
function breathPress(k, { pressed, age }) {
const dur = 0.85;
if (!pressed && !(age < dur)) return null;
const C = k.colors, cx = k.w / 2, cy = k.h / 2;
const e = pressed ? 0 : clamp(age / dur);
const sink = pressed ? 1 : 1 - outExpo(clamp(age / 0.22));
const fog = pressed ? 1 : 1 - outCubic(e);
const hole = pressed ? 0 : outCubic(e) * 1.05;
const id = k.id('fog');
const fa = (k.dark ? 0.34 : 0.55) * fog;
const stops = hole <= 0.001
? [[0, C.frost, fa * 1.1], [0.7, C.frost, fa], [1, C.frost, fa * 0.75]]
: [[0, C.frost, 0], [clamp(hole - 0.22), C.frost, 0], [clamp(hole), C.frost, fa], [1, C.frost, fa * 0.75]];
k.def(radialGradient(id, stops, { cx: 0.5, cy: 0.5, r: 0.72 }));
let overlay = rect({ width: k.w, height: k.h, fill: url(id) });
if (!pressed && e < 1) {
const fl = k.id('flare'), c = haloOf(k, k.toneName === 'off' ? 'idle' : k.toneName);
k.def(radialGradient(fl, [[0, c, (k.dark ? 0.3 : 0.2) * (1 - e)], [1, c, 0]], { cx: 0.5, cy: 1, r: 0.8 }));
overlay += rect({ width: k.w, height: k.h, fill: url(fl) });
}
const s = 1 - 0.035 * sink;
return {
transform: sink > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#9aa3bb' }),
overlay,
};
}
const draw = (id) => getGlyph(id)?.draw;
const GLOBE = 'M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10';
const glyphs = {
bulb(g, s) {
if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
const on = s.state === 'on';
const k = on ? arrive(s.since, 0.6) : 0;
g.path(`${GLOBE}Z`, { role: 'fill', opacity: 0.1 + 0.16 * k });
if (on) g.circle(24, 22.5, 5.5 + 2.5 * k, { role: 'accent', fill: true, opacity: 0.22 * k + 0.12 * k * pulse(s.t, 2.4) });
g.path(GLOBE);
g.line(19, 32.5, 19, 35.5);
g.line(29, 32.5, 29, 35.5);
g.line(19, 35.5, 29, 35.5);
g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
g.path('M21 28.5c0-3 1.4-4.6 3-4.6s3 1.6 3 4.6', { role: on ? 'accent' : 'dim', weight: 0.8 });
if (on) {
g.dot(17.6, 17.4, 1.05, { opacity: k });
g.dot(30.6, 15.6, 0.8, { opacity: k * (0.5 + 0.5 * pulse(s.t + 0.6, 2.4)) });
}
},
waveform(g, s) {
if (s.state !== 'live' && s.state !== 'idle') return draw('waveform')(g, s);
const on = s.state === 'live';
const k = on ? arrive(s.since, 0.5) : 0;
const ph = on ? s.phase(2.4) : 0.15;
const gain = lerp(0.35, 0.55 + 0.6 * clamp(s.level), k);
const ribbon = (amp, freq, off, role, weight, opacity) => {
const pts = [];
for (let i = 0; i <= 18; i++) {
const u = i / 18, x = 8 + 32 * u, env = Math.sin(Math.PI * u);
pts.push([x, 24 + amp * gain * env * Math.sin(TAU * (u * freq + ph * Math.round(freq) + off))]);
}
g.polyline(pts, { role, weight, opacity });
};
ribbon(9, 1.5, 0.62, 'dim', 0.7, 0.75);
ribbon(7, 2, 0.31, 'line', 0.8, 1);
ribbon(12, 1, 0, on ? 'accent' : 'line', 1.05, 1);
},
};
const __default = defineTheme({
id: 'aurora',
title: 'Aurora',
description: 'Frosted keys with the northern lights behind them: soft curtains that rise and flow in the hue when on, lines of light through etched frost, a press that fogs the glass.',
tags: ['aurora', 'frost', 'glass', 'gradient', 'soft', 'dark', 'light', 'opal'],
modes: { dark: NIGHT, light: DAY },
defaultMode: 'dark',
tones: { idle: 'accent', active: 'tint', busy: 'accent2' },
roles: {
line: { color: roleColor.line, width: 2.6, glow: 0.45 },
fill: { color: roleColor.line, glow: 0.35 },
accent: { color: roleColor.accent, width: 2.8, glow: 0.8 },
dim: { color: roleColor.dim, width: 2.2, opacity: 0.85, glow: 0 },
spark: { color: roleColor.spark, glow: 1 },
},
type: {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.14, color: 'muted' },
label: { size: 11, weight: 600, tracking: 0.015, color: 'ink', baseline: 9.5 },
value: { size: 22, weight: 600, tabular: true, tracking: -0.02, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, tracking: -0.03, color: 'ink' },
caption: { size: 8.5, weight: 400, color: 'muted' },
},
background: pane,
surface: pane,
paint(k, prim, style) {
return paintAurora(k, prim, { ...style, halo: haloOf(k, k.toneName) });
},
press: breathPress,
glyphs,
});
};
__d[233] = function (__ns) {
const { defineTheme, defaultText, bezelCorner } = __m(14);
const { rect, path, polygon, url, linearGradient, radialGradient, n, P, attrs } = __m(5);
const { textPath, fitText, capHeight } = __m(11);
const { clamp, lerp, outCubic, outExpo, pulse, phase, arrive } = __m(12);
const { pathBounds, flattenPath } = __m(13);
const { getGlyph } = __m(231);
__e(__ns, { "draftGrid": () => draftGrid, "default": () => __default, "sheet": () => sheet, "paintBlueprint": () => paintBlueprint }, [], ["default","draftGrid","paintBlueprint","sheet"]);
const CYANOTYPE = {
bg: '#061733', surface: '#14407a', surface2: '#0b2a57', line: '#2d5d9c',
ink: '#f4f8ff', muted: '#c4d6f3', dim: '#93b2de', faint: '#6286bb',
accent: '#a6e4ff', accent2: '#ffd892', pos: '#a8f3c9', info: '#c4e6ff', warn: '#ffd77f', neg: '#ffaa9c', crit: '#ffa6d4',
grid: '#dcebff', gridMinor: 0.075, gridMajor: 0.15,
edge: '#ffffff', edgeOpacity: 0.3, beam: '#ffffff', beamOpacity: 0.9, sheenOpacity: 0,
spectrum: { l: 0.87, c: 0.11 },
};
const WHITEPRINT = {
bg: '#e4e9f1', surface: '#f6f8fb', surface2: '#e7edf5', line: '#c4d0e2',
ink: '#0d2f66', muted: '#33548a', dim: '#5b78a6', faint: '#93a7c6',
accent: '#1663c7', accent2: '#c2410c', pos: '#14703f', info: '#1257a6', warn: '#8a5900', neg: '#b42318', crit: '#a3195b',
grid: '#1d4e89', gridMinor: 0.07, gridMajor: 0.13,
edge: '#ffffff', edgeOpacity: 0.9, beam: '#1663c7', beamOpacity: 0.6, sheenOpacity: 0,
spectrum: { l: 0.5, c: 0.15 },
};
const LIT = new Set(['active', 'ok', 'info']);
const TITLE = 19;
const ALERT = new Set(['warn', 'neg', 'alert', 'crit']);
const breath = (k) => (k.ctx.since >= 10 || k.ctx.reduced ? 1 : lerp(0.5, 1, pulse(k.ctx.t, 1)));
const fade = (tone) => (tone === 'off' ? 0.8 : 1);
const gridFade = (tone) => (tone === 'off' ? 0.5 : 1);
const markOf = (k, tone) => (tone === 'active' ? k.ctx.tint : LIT.has(tone) || ALERT.has(tone) ? k.tone(tone) : k.colors.dim);
const crisp = (v, w) => (Math.round(w) % 2 ? Math.floor(v) + 0.5 : Math.round(v));
function draftGrid(k, { x = 0, y = 0, w = k.w, h = k.h, ox = x + w / 2, oy = y + h / 2, opacity = 1 } = {}) {
const C = k.colors, u = k.m.u;
const pitch = Math.max(4, Math.round(6 * u));
const lw = Math.max(1, Math.round(k.m.hair));
let minor = '', major = '';
const i0x = Math.ceil((x - ox) / pitch), i1x = Math.floor((x + w - ox) / pitch);
for (let i = i0x; i <= i1x; i++) { const px = crisp(ox + i * pitch, lw); const s = `M${n(px)} ${n(y)}V${n(y + h)}`; if (i % 4 === 0) major += s; else minor += s; }
const i0y = Math.ceil((y - oy) / pitch), i1y = Math.floor((y + h - oy) / pitch);
for (let i = i0y; i <= i1y; i++) { const py = crisp(oy + i * pitch, lw); const s = `M${n(x)} ${n(py)}H${n(x + w)}`; if (i % 4 === 0) major += s; else minor += s; }
if (minor) k.add(path(minor, { fill: 'none', stroke: C.grid, strokeWidth: lw, strokeOpacity: n(C.gridMinor * opacity, 3) }));
if (major) k.add(path(major, { fill: 'none', stroke: C.grid, strokeWidth: lw, strokeOpacity: n(C.gridMajor * opacity, 3) }));
return pitch;
}
function printBase(k, { x = 0, y = 0, w = k.w, h = k.h, tone = 'idle' }) {
const C = k.colors;
const id = k.id('print');
k.def(radialGradient(id, [[0, C.surface], [0.7, k.dark ? C.surface : C.surface], [1, C.surface2]], { cx: 0.42, cy: 0.36, r: 0.95 }));
k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
if (k.dark && tone !== 'off') {
const ex = k.id('expose');
k.def(linearGradient(ex, [[0, '#2a6bb8', 0.18], [0.5, '#2a6bb8', 0], [1, '#03122e', 0.3]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
k.add(rect({ x, y, width: w, height: h, fill: url(ex) }));
}
}
function cornerMarks(x, y, w, h, i, a) {
const p = P();
p.M(x + i, y + i + a).V(y + i).H(x + i + a);
p.M(x + w - i - a, y + i).H(x + w - i).V(y + i + a);
p.M(x + w - i, y + h - i - a).V(y + h - i).H(x + w - i - a);
p.M(x + i + a, y + h - i).H(x + i).V(y + h - i - a);
return p.d;
}
function sheet(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, u = k.m.u, key = k.ctx.kind === 'key';
const f = fade(tone);
printBase(k, { x, y, w, h, tone });
const gy = key ? y + h * 0.42 : y + h / 2;
draftGrid(k, { x, y, w, h, ox: x + w / 2, oy: gy, opacity: gridFade(tone) });
const lw = Math.max(1, Math.round(k.m.hair));
if (key) {
const cx = crisp(x + w / 2, lw), cy = crisp(gy, lw), inset = k.m.bleed * 1.6;
const dash = `${n(7 * u)} ${n(1.6 * u)} ${n(1.4 * u)} ${n(1.6 * u)}`;
k.add(path(`M${n(cx)} ${n(y + inset)}V${n(y + h * 0.74)}M${n(x + inset)} ${n(cy)}H${n(x + w - inset)}`, { fill: 'none', stroke: C.grid, strokeWidth: lw, strokeOpacity: n(0.2 * gridFade(tone), 3), strokeDasharray: dash }));
}
const b = Math.round(k.m.bleed);
const lit = LIT.has(tone) || ALERT.has(tone);
const mark = markOf(k, tone);
const bw = lit ? Math.max(1, Math.round(k.m.line)) : lw;
const bo = ALERT.has(tone) ? breath(k) : 1;
k.add(rect({ x: crisp(x + b, bw), y: crisp(y + b, bw), width: Math.round(w - b * 2), height: Math.round(h - b * 2), fill: 'none', stroke: lit ? mark : C.ink, strokeWidth: bw, strokeOpacity: n(lit ? 0.9 * bo : 0.32 * f, 3) }));
if (lit) {
const ri = key ? b + k.m.line * 2.2 : b; 
k.add(path(cornerMarks(x, y, w, key ? h - TITLE * u - ri + b * 0.5 : h, ri, Math.max(3, 4.5 * u)), { fill: 'none', stroke: mark, strokeWidth: n(Math.max(1, k.m.line)), strokeOpacity: n(bo, 3), strokeLinecap: 'square' }));
const wid = k.id('wash');
k.def(radialGradient(wid, [[0, mark, (k.dark ? 0.22 : 0.12) * bo], [1, mark, 0]], { cx: 0.5, cy: key ? 0.42 : 0.5, r: 0.62 }));
k.add(rect({ x, y, width: w, height: h, fill: url(wid) }));
}
if (ALERT.has(tone)) {
const s = Math.min(w, h) * 0.2, bz = bezelCorner(k, { x, y, w, h });
const tx = Math.min(x + w - b - s * 0.62, bz.X - s * 0.58), ty = Math.max(y + b + s * 0.16, bz.Y);
const tri = [[tx, ty + s * 0.5], [tx + s * 0.29, ty], [tx + s * 0.58, ty + s * 0.5]];
k.add(polygon(tri, { fill: mark, fillOpacity: n(0.9 * bo, 3), stroke: mark, strokeWidth: n(k.m.hair), strokeLinejoin: 'round' }));
k.add(path(P().M(tx + s * 0.29, ty + s * 0.16).V(ty + s * 0.33).d, { stroke: k.dark ? C.surface2 : '#ffffff', strokeWidth: n(Math.max(1, s * 0.07)), strokeLinecap: 'round' }));
}
if (tone === 'busy') {
const f2 = k.ctx.reduced ? 0.5 : phase(k.ctx.t, 1.2);
const ty = crisp(y + b + 2 + (h - b * 2 - 4) * f2, lw);
const gid = k.id('tsq');
k.def(linearGradient(gid, [[0, C.ink, 0], [0.12, C.ink, 0.85], [0.88, C.ink, 0.85], [1, C.ink, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: x + b, y: ty - lw / 2, width: w - b * 2, height: Math.max(1, k.m.line), fill: url(gid) }));
k.add(rect({ x: x + b, y: ty - 3 * u, width: Math.max(2, 2.2 * u), height: 6 * u, fill: C.ink, fillOpacity: 0.8 }));
}
}
const lengths = new Map();
function lengthOf(d) {
let L = lengths.get(d);
if (L === undefined) {
L = 0;
for (const pl of flattenPath(d, 0.5)) {
for (let i = 1; i < pl.pts.length; i++) L += Math.hypot(pl.pts[i][0] - pl.pts[i - 1][0], pl.pts[i][1] - pl.pts[i - 1][1]);
if (pl.closed && pl.pts.length > 1) L += Math.hypot(pl.pts[0][0] - pl.pts.at(-1)[0], pl.pts[0][1] - pl.pts.at(-1)[1]);
}
if (lengths.size > 4000) lengths.clear();
lengths.set(d, L);
}
return L;
}
const plot = (k) => { const a = k.ctx.pressAge; return k.ctx.kind === 'key' && !k.ctx.pressed && a < 0.65 && !k.ctx.reduced ? clamp(a / 0.65) : 1; };
const pxUnit = (k) => 48 / (Math.min(k.w, k.h) * 0.56);
function paintBlueprint(k, prim, style, i = 0) {
const tone = k.toneName, dark = k.dark;
const op = clamp((style.opacity ?? 1) * (prim.opacity ?? 1)) * fade(tone);
if (op < 0.005) return '';
const w = (style.width ?? 2.2) * (prim.weight ?? 1);
const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
const c = style.color;
const oo = op < 0.999 ? n(op, 3) : null;
const px = pxUnit(k);
const pl = plot(k);
const L = pl < 1 ? lengthOf(prim.d) : 0;
const local = pl < 1 ? outCubic(clamp(pl * 1.5 - (i % 7) * 0.07)) : 1;
const reveal = (attrsIn) => (local < 1 && L > 0 && !attrsIn.strokeDasharray ? { ...attrsIn, strokeDasharray: `${n(L * local)} ${n(L + 1)}` } : attrsIn);
let out = '';
if (prim.role === 'spark') {
const b = pathBounds(prim.d);
const r = Math.max(b.w, b.h) / 2;
if (/A/.test(prim.d) && r < 3.5 && Math.abs(b.w - b.h) < 0.6) {
const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = r * 2.3 + 1.2;
out += `<path${attrs({ d: P().M(cx - R, cy).H(cx + R).M(cx, cy - R).V(cy + R).d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px, 0.9)), strokeOpacity: n(op * 0.9, 3) })}/>`;
out += `<path${attrs({ d: prim.d, fill: c, fillOpacity: n(op * local, 3) })}/>`;
return out;
}
}
if (prim.fill) {
const b = pathBounds(prim.d);
const subpaths = (prim.d.match(/M/g) || []).length;
const big = !prim.text && b.w > 6 && b.h > 6 && subpaths <= 3 && Math.min(k.w, k.h) >= 96;
if (!big) {
const solid = prim.text || b.w <= 6 || b.h <= 6 || subpaths > 3;
out += `<path${attrs({ d: prim.d, fill: c, fillOpacity: n(op * local * (solid ? 1 : 0.42), 3), fillRule: style.fillRule || null })}/>`;
if (!solid) out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px * 1.5, w * 0.55)), strokeOpacity: oo, strokeLinejoin: 'round' }))}/>`;
return out;
}
const clip = k.id('hx');
k.def(`<clipPath id="${clip}"><path d="${prim.d}"/></clipPath>`);
const gap = Math.max(2.4, px * 3.2), hp = P();
const x0 = b.x - b.h, x1 = b.x + b.w;
for (let xx = x0; xx <= x1; xx += gap) hp.M(xx, b.y + b.h).L(xx + b.h, b.y);
out += `<path${attrs({ d: prim.d, fill: c, fillOpacity: n(op * (dark ? 0.12 : 0.08), 3) })}/>`;
out += `<g clip-path="url(#${clip})"><path${attrs({ d: hp.d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px * 1.1, 0.8)), strokeOpacity: n(op * 0.8 * local, 3) })}/></g>`;
out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px * 1.5, w * 0.55)), strokeOpacity: oo, strokeLinejoin: 'round' }))}/>`;
return out;
}
const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : prim.role === 'dim' ? `${n(2.6 * (prim.weight ?? 1))} ${n(1.9 * (prim.weight ?? 1))}` : null;
if (style.bleed && dark) out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(w * 2.3), strokeOpacity: n(0.1 * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash }))}/>`;
out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(w), strokeOpacity: oo, strokeLinecap: dash ? 'butt' : cap, strokeLinejoin: join, strokeDasharray: dash }))}/>`;
return out;
}
function glyphBounds(pen) {
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const p of pen.flat()) {
if (p.transforms.length || (p.opacity ?? 1) < 0.2) continue;
const b = pathBounds(p.d);
if (!b.w && !b.h) continue;
x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
}
return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
function dimensions(k, B, { opacity = 0.6, color }) {
const px = pxUnit(k), lw = Math.max(px, 0.8), tk = 1.6;
const top = Math.max(1.6, B.y0 - 3.6), right = Math.min(46.4, B.x1 + 3.6);
const p = P();
p.M(B.x0, B.y0 - 1.1).V(top - 1.1).M(B.x1, B.y0 - 1.1).V(top - 1.1);
p.M(B.x1 + 1.1, B.y0).H(right + 1.1).M(B.x1 + 1.1, B.y1).H(right + 1.1);
p.M(B.x0, top).H(B.x1).M(right, B.y0).V(B.y1);
for (const [x, y] of [[B.x0, top], [B.x1, top], [right, B.y0], [right, B.y1]]) p.M(x - tk, y + tk).L(x + tk, y - tk);
return `<path${attrs({ d: p.d, fill: 'none', stroke: color, strokeWidth: n(lw), strokeOpacity: n(opacity, 3), strokeLinecap: 'butt' })}/>`;
}
function paintGlyph(k, pen, { tone, styleOf }) {
let i = 0;
const walk = (node) => {
let out = '';
for (const c of node.children) {
if (c.group) {
const inner = walk(c);
out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
} else out += paintBlueprint(k, c, styleOf(c), i++);
}
return out;
};
let out = walk(pen.root);
const B = glyphBounds(pen);
if (B && B.x1 - B.x0 > 4 && B.y1 - B.y0 > 4 && k.ctx.kind === 'key') {
const pl = plot(k);
const o = (tone === 'off' ? 0.25 : 0.55) * (pl < 1 ? clamp((pl - 0.55) / 0.45) : 1);
if (o > 0.01) out += dimensions(k, B, { opacity: o, color: LIT.has(tone) || ALERT.has(tone) ? markOf(k, tone) : k.colors.muted });
}
return out;
}
const roleColor = {
line: (k, tone) => (tone === 'off' ? k.colors.dim : k.colors.ink),
accent: (k, tone) => (tone === 'off' ? k.colors.dim : tone === 'idle' || tone === 'busy' ? k.colors.accent : markOf(k, tone)),
dim: (k, tone) => (tone === 'off' ? k.colors.dim : k.colors.muted),
spark: (k, tone) => (tone === 'off' ? k.colors.dim : tone === 'idle' || tone === 'busy' ? k.colors.accent : markOf(k, tone)),
};
function cropPress(k, { pressed, age }) {
const dur = 0.5;
if (!pressed && !(age < dur)) return null;
const cx = k.w / 2, cy = k.h / 2, u = k.m.u;
const sink = pressed ? 1 : 1 - outExpo(clamp(age / 0.2));
const e = pressed ? 1 : 1 - outCubic(clamp(age / dur));
const inset = lerp(-2 * u, k.m.bleed + 2.5 * u, e);
const arm = 7 * u;
const c = k.toneName === 'off' || k.toneName === 'idle' ? k.colors.accent : markOf(k, k.toneName);
const overlay = path(cornerMarks(0, 0, k.w, k.h, inset, arm), { fill: 'none', stroke: c, strokeWidth: n(Math.max(1.5, 2 * u * 0.75)), strokeOpacity: n(clamp(e * 1.2), 3), strokeLinecap: 'square' });
const s = 1 - 0.03 * sink;
return {
transform: sink > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#8796ad' }),
overlay,
};
}
function lettering(k, role, str, o = {}) {
if (role === 'label' && (o.maxLines || 1) > 1) return defaultText(k, role, str, o);
const st = k.typeStyle(role, o);
const color = k.color(o.color ?? st.color);
const safe = k.m.text ?? k.m.safe;
const room = o.maxWidth ?? k.w - safe * 2;
const base = { weight: st.weight, tracking: st.tracking || 0, caps: !!st.caps, tabular: !!st.tabular, fill: color, fillOpacity: o.opacity };
const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
if (role === 'label' && k.ctx.kind === 'key' && (o.maxLines || 1) === 1) {
const room = o.maxWidth ?? k.w - 2 * (Math.round(k.m.bleed) + 3 * k.m.u);
const fit = fitText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.78, ...base });
const by = o.y ?? k.h - (st.baseline ?? 7.5) * k.m.u;
const ch = capHeight(fit.size, st.weight);
const lw = Math.max(1, Math.round(k.m.hair));
const ry = crisp(Math.min(by - ch - 3.4 * k.m.u, k.h - TITLE * k.m.u), lw);
const b = Math.round(k.m.bleed);
const rule = `<path${attrs({ d: `M${n(b)} ${n(ry)}H${n(k.w - b)}`, fill: 'none', stroke: k.colors.ink, strokeWidth: lw, strokeOpacity: n(0.32 * fade(k.toneName), 3) })}/>`;
const x = o.x ?? (anchor === 'start' ? safe : anchor === 'end' ? k.w - safe : k.w / 2);
return rule + textPath(fit.text, { ...base, size: fit.size, x, y: by, anchor });
}
if (role === 'eyebrow') {
const a = o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : 'start';
const x = o.x ?? (a === 'start' ? safe : a === 'end' ? k.w - safe : k.w / 2);
return textPath(str, { ...base, size: st.size, x, y: o.y ?? safe + capHeight(st.size, st.weight), anchor: a, maxWidth: room, minSize: st.size * 0.85 });
}
if (role === 'value' || role === 'hero') {
const cy = o.cy ?? k.h * 0.52;
const f = fitText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.55, ...base });
return textPath(f.text, { ...base, size: f.size, x: o.x ?? k.w / 2, y: cy + capHeight(f.size, st.weight) / 2, anchor: o.align ? anchor : 'middle' });
}
const by = o.y ?? (role === 'label' ? k.h - (st.baseline ?? 7.5) * k.m.u : k.h - safe);
return textPath(str, { ...base, size: st.size, x: o.x ?? k.w / 2, y: by, anchor, maxWidth: room, minSize: st.size * 0.8 });
}
const draw = (id) => getGlyph(id)?.draw;
const glyphs = {
clock(g, s) {
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
g.circle(24, 24, 16.5);
for (let i = 0; i < 12; i++) {
const a = i * 30, major = i % 3 === 0;
const [x1, y1] = g.polar(24, 24, major ? 12.4 : 14, a), [x2, y2] = g.polar(24, 24, 16.5, a);
g.line(x1, y1, x2, y2, { role: 'line', weight: major ? 0.8 : 0.5 });
}
const ha = h * 30, ma = m * 6;
const hand = (deg, len, opts) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, opts); };
let a0 = ha, a1 = ma;
let span = ((a1 - a0) % 360 + 360) % 360;
if (span > 180) { [a0, a1] = [a1, a0]; span = 360 - span; }
if (span > 8) {
g.arc(24, 24, 7, a0 + 2, a0 + span - 2, { role: 'accent', weight: 0.42 });
for (const a of [a0 + 2, a0 + span - 2]) {
const [x, y] = g.polar(24, 24, 7, a), [x2, y2] = g.polar(24, 24, 8.6, a + (a === a0 + 2 ? 4 : -4)), [x3, y3] = g.polar(24, 24, 5.4, a + (a === a0 + 2 ? 4 : -4));
g.polyline([[x2, y2], [x, y], [x3, y3]], { role: 'accent', weight: 0.42 });
}
}
hand(ha, 9, { role: 'line', weight: 1.15 });
hand(ma, 13, { role: 'accent' });
g.dot(24, 24, 1.4);
},
bulb(g, s) {
if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
const on = s.state === 'on';
g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
g.path('M19 32.5H29V37.5H19Z', { role: 'fill', fill: true });
g.line(21, 40.5, 27, 40.5, { role: 'line', weight: 0.9 });
g.polyline([[21, 32.5], [21, 27], [22.5, 23.5], [24, 27], [25.5, 23.5], [27, 27], [27, 32.5]], { role: on ? 'accent' : 'dim', weight: 0.75 });
if (on) {
const k = arrive(s.since, 0.4);
for (const a of [-60, -30, 0, 30, 60]) {
const [x1, y1] = g.polar(24, 22.5, 13.2, a), [x2, y2] = g.polar(24, 22.5, 13.2 + 3.4 * k, a);
g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.7, opacity: 0.55 + 0.45 * pulse(s.t + a / 120, 2.4) });
}
}
},
cpu(g, s) {
if (s.state !== 'busy' && s.state !== 'idle') return draw('cpu')(g, s);
g.rect(13, 13, 22, 22, { r: 1.5 });
g.circle(16.6, 16.6, 1.1, { role: 'dim', fill: false, weight: 0.6 });
for (const p of [18.5, 24, 29.5]) {
g.rect(p - 1.2, 7.5, 2.4, 5.5, { role: 'dim', weight: 0.7 });
g.rect(p - 1.2, 35, 2.4, 5.5, { role: 'dim', weight: 0.7 });
g.rect(7.5, p - 1.2, 5.5, 2.4, { role: 'dim', weight: 0.7 });
g.rect(35, p - 1.2, 5.5, 2.4, { role: 'dim', weight: 0.7 });
}
const busy = s.state === 'busy';
const lead = Math.floor(s.phase(1.2) * 4);
const count = Math.max(1, Math.ceil(clamp(s.level) * 4 - 1e-9));
[[18.5, 18.5], [25, 18.5], [25, 25], [18.5, 25]].forEach(([x, y], i) => {
const rel = (lead - i + 4) % 4; 
const on = busy && rel < count;
if (on) g.rect(x, y, 4.5, 4.5, { r: 0.6, role: 'accent', fill: true, opacity: rel === 0 ? 1 : 0.72 });
else g.rect(x, y, 4.5, 4.5, { r: 0.6, role: 'dim', weight: 0.7, opacity: busy ? 0.8 : 1 });
});
},
};
const __default = defineTheme({
id: 'blueprint',
title: 'Blueprint',
description: 'White linework on a Prussian-blue drafting grid (deep blue on whiteprint by day): hatched sections, dashed hidden lines, every glyph dimensioned, a plotter that redraws on press.',
tags: ['blueprint', 'drafting', 'technical', 'grid', 'linework', 'cyanotype', 'dark', 'light'],
modes: { dark: CYANOTYPE, light: WHITEPRINT },
defaultMode: 'dark',
tones: { idle: 'accent', active: 'tint', busy: 'ink' },
roles: {
line: { color: roleColor.line, width: 2.1, bleed: true, cap: 'round', join: 'round' },
fill: { color: roleColor.line },
accent: { color: roleColor.accent, width: 2.5, bleed: true },
dim: { color: roleColor.dim, width: 1.7, opacity: 0.95 },
spark: { color: roleColor.spark },
},
type: {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.16, color: 'muted' },
label: { size: 9, weight: 600, caps: true, tracking: 0.1, color: 'ink', baseline: 7.5 },
value: { size: 22, weight: 400, tabular: true, tracking: 0.02, color: 'ink' },
hero: { size: 30, weight: 400, tabular: true, tracking: 0, color: 'ink' },
caption: { size: 8, weight: 600, caps: true, tracking: 0.12, color: 'muted' },
},
background: sheet,
surface: sheet,
paint: (k, prim, style) => paintBlueprint(k, prim, style),
paintGlyph,
press: cropPress,
glyphBox(k, { labeled }) {
const m = Math.min(k.w, k.h);
const size = labeled ? m * 0.56 : m * 0.7;
return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.42 : k.h / 2) - size / 2, size };
},
text: lettering,
glyphs,
});
};
__d[234] = function (__ns) {
const { attrs, n } = __m(5);
const { pathBounds } = __m(13);
__e(__ns, { "stack": () => stack, "onePen": () => onePen, "isLettering": () => isLettering, "minSide": () => minSide, "strokeOf": () => strokeOf, "fillOf": () => fillOf, "strokeOpts": () => strokeOpts, "once": () => once, "castText": () => castText }, [], ["castText","fillOf","isLettering","minSide","once","onePen","stack","strokeOf","strokeOpts"]);
function stack(pen, entriesOf, { layers, offsets = {} } = {}) {
const memo = new Map();
const entries = (p) => {
let e = memo.get(p);
if (!e) {
e = (entriesOf(p) || []).filter(Boolean).map((x) => ({ ...x, d: x.d ?? p.d, key: keyOf(x.a) }));
memo.set(p, e);
}
return e;
};
const walk = (node, L) => {
let out = '', run = null;
const flush = () => { if (run) { out += `<path${attrs({ d: run.d, ...run.a })}/>`; run = null; } };
for (const c of node.children) {
if (c.group) {
flush();
const inner = walk(c, L);
if (inner) out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
continue;
}
for (const e of entries(c)) {
if (e.layer !== L) continue;
if (run && run.key === e.key) run.d += e.d;
else { flush(); run = { key: e.key, a: e.a, d: e.d }; }
}
}
flush();
return out;
};
let out = '';
for (let L = 0; L < layers; L++) {
const body = walk(pen.root, L);
if (!body) continue;
const off = offsets[L];
out += off && (off[0] || off[1]) ? `<g transform="translate(${n(off[0], 3)} ${n(off[1], 3)})">${body}</g>` : body;
}
return out;
}
const keyOf = (a) => { let s = ''; for (const k in a) if (a[k] !== null && a[k] !== undefined) s += `${k}=${a[k]};`; return s; };
const onePen = (prim) => ({ root: { group: true, children: [prim] } });
const isLettering = (prim) => prim.text === true || (prim.text === undefined && prim.fill === true && /Q/.test(prim.d));
const sideMemo = new Map();
function minSide(prim) {
let v = sideMemo.get(prim.d);
if (v === undefined) {
const b = pathBounds(prim.d);
v = Math.min(b.w, b.h);
if (sideMemo.size > 4000) sideMemo.clear();
sideMemo.set(prim.d, v);
}
return v;
}
const strokeOf = (color, width, opacity = 1, { cap = 'round', join = 'round', dash = null } = {}) => ({
fill: 'none', stroke: color, strokeWidth: n(width, 3), strokeOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null,
strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash,
});
const fillOf = (color, opacity = 1, extra = {}) => ({ fill: color, fillOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null, ...extra });
const strokeOpts = (p, st) => ({ cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null });
function once(k, key, make) {
const m = k._d4 || (k._d4 = new Map());
if (!m.has(key)) m.set(key, make());
return m.get(key);
}
function castText(markup, color, dx, dy, opacity) {
const body = markup.replace(/ fill="#[0-9a-fA-F]{6}"/g, ` fill="${color}"`).replace(/ fill-opacity="[^"]*"/g, '');
return `<g transform="translate(${n(dx)} ${n(dy)})"${opacity < 1 ? ` opacity="${n(opacity, 3)}"` : ''}>${body}</g>`;
}
};
__d[235] = function (__ns) {
const { defineTheme, defaultText, bezelCorner } = __m(14);
const { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } = __m(5);
const { mix } = __m(4);
const { clamp, lerp, outCubic, pulse, phase, spring, arrive } = __m(12);
const { hash } = __m(1);
const { getGlyph } = __m(231);
const { stack, onePen, isLettering, strokeOf, fillOf, strokeOpts, once, castText } = __m(234);
__e(__ns, { "default": () => __default, "keyFace": () => keyFace, "plate": () => plate, "paintChrome": () => paintChrome, "stateOf": () => stateOf }, [], ["default","keyFace","paintChrome","plate","stateOf"]);
const NIGHT = {
bg: '#07080a', surface: '#3b4048', surface2: '#1c1f24', line: '#4a5059',
ink: '#f1f4f7', muted: '#b1b8c2', dim: '#7f8792',
accent: '#5cc8ff', accent2: '#ffb45c', pos: '#59e3a0', info: '#6cb6ff', warn: '#ffc451', neg: '#ff6b5e', crit: '#ff63a8',
edge: '#ffffff', edgeOpacity: 0.16, beam: '#ffffff', beamOpacity: 0.9, sheenOpacity: 0.12,
spectrum: { l: 0.8, c: 0.15 },
};
const DAY = {
bg: '#8a9098', surface: '#f2f3f5', surface2: '#c9cdd3', line: '#aeb3bb',
ink: '#111418', muted: '#454b54', dim: '#6c737d',
accent: '#c2460b', accent2: '#1d5fc9', pos: '#0f7a4c', info: '#1d5fc9', warn: '#9c5800', neg: '#c02a20', crit: '#ac1767',
edge: '#ffffff', edgeOpacity: 0.85, beam: '#ffffff', beamOpacity: 0.9, sheenOpacity: 0.5,
spectrum: { l: 0.57, c: 0.17 },
};
const FINISH = {
dark: {
chrome: [[0, '#ffffff'], [0.3, '#d9dee5'], [0.47, '#959ca8'], [0.53, '#5f6671'], [0.61, '#adb4be'], [1, '#e9edf1']],
dome: [[0, '#ffffff'], [0.4, '#d3d8df'], [0.66, '#8e96a1'], [1, '#c9ced5']],
anodized: (c) => [[0, mix(c, '#ffffff', 0.55)], [0.45, c], [0.53, mix(c, '#0b1530', 0.45)], [0.62, mix(c, '#ffffff', 0.15)], [1, mix(c, '#ffffff', 0.4)]],
bevel: [[0, '#a7aeb8'], [0.3, '#60666f'], [0.62, '#2b2f35'], [1, '#141619']],
face: [[0, '#3b4048'], [0.46, '#2d3138'], [0.5, '#33373e'], [1, '#1c1f24']],
matte: [[0, '#2c2f34'], [1, '#202327']],
housing: [[0, '#0c0d10'], [1, '#040506']],
shadow: '#000000', shadowA: 0.62, hiA: 0.32, coreA: 0.75, lipA: 0.16, innerA: 0.7, glowA: 0.22, slotA: 0.55,
streakLight: 0.07, streakDark: 0.28, channel: '#050608', channelA: 0.75,
},
light: {
chrome: [[0, '#626a74'], [0.4, '#2b3037'], [0.5, '#0d0f12'], [0.58, '#3b4149'], [1, '#1b1f24']],
dome: [[0, '#5d646e'], [0.42, '#262a30'], [0.7, '#0f1114'], [1, '#30353c']],
anodized: (c) => [[0, mix(c, '#ffffff', 0.35)], [0.45, c], [0.53, mix(c, '#000000', 0.35)], [0.62, mix(c, '#ffffff', 0.1)], [1, mix(c, '#000000', 0.15)]],
bevel: [[0, '#ffffff'], [0.35, '#eceef1'], [0.7, '#a2a8b1'], [1, '#80868f']],
face: [[0, '#f2f3f5'], [0.45, '#dfe2e6'], [0.5, '#e7e9ec'], [1, '#c9cdd3']],
matte: [[0, '#dcdee1'], [1, '#cfd2d6']],
housing: [[0, '#9aa0a8'], [1, '#7a8088']],
shadow: '#1d232b', shadowA: 0.34, hiA: 0.95, coreA: 0.4, lipA: 0.95, innerA: 0.4, glowA: 0.12, slotA: 0.3,
streakLight: 0.45, streakDark: 0.07, channel: '#6f7680', channelA: 0.7,
},
};
const F = (k) => FINISH[k.dark ? 'dark' : 'light'];
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'on', neg: 'on', alert: 'alert', crit: 'alert', busy: 'busy', off: 'off' };
const stateOf = (tone) => STATE[tone] || 'idle';
const flagged = (tone) => tone === 'warn' || tone === 'alert' || tone === 'crit';
const breath = (k, tone) => (stateOf(tone) !== 'alert' || k.ctx.reduced || k.ctx.since >= 10 ? 1 : lerp(0.55, 1, pulse(k.ctx.t, 1)));
const OFFSETS = { 1: [0.55, 0.8], 2: [-0.35, -0.5], 5: [-0.2, -0.32] };
function grad(k, key, stops, attrs) {
return once(k, key, () => { const id = k.id(key); k.def(linearGradient(id, stops, attrs)); return url(id); });
}
const GRID_V = { x1: 0, y1: 7, x2: 0, y2: 41, gradientUnits: 'userSpaceOnUse' };
const lens = (k, c) => once(k, `lens${c}`, () => {
const id = k.id('lens');
k.def(radialGradient(id, [[0, mix(c, '#ffffff', 0.72)], [0.42, c], [1, mix(c, '#000000', 0.3)]], { cx: 0.38, cy: 0.32, r: 0.78 }));
return url(id);
});
function paintChrome(k, pen, { tone, styleOf }) {
const f = F(k), st = stateOf(tone), lit = st === 'on' || st === 'alert', b = breath(k, tone);
const fine = k.m.u >= 1.3; 
const chrome = grad(k, 'chrome', f.chrome, GRID_V);
const chromeBox = grad(k, 'chromeb', f.dome, { x1: 0.15, y1: 0, x2: 0.6, y2: 1 });
const ano = grad(k, 'ano', f.anodized(k.colors.accent), GRID_V);
const anoBox = grad(k, 'anob', f.anodized(k.colors.accent), {});
const entriesOf = (p) => {
const s = styleOf(p);
const op = clamp((s.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const w = (s.width ?? 2.6) * (p.weight ?? 1), so = strokeOpts(p, s);
const fillP = p.fill;
if (st === 'off') return [{ layer: 4, a: fillP ? fillOf(k.colors.dim, op * 0.8) : strokeOf(k.colors.dim, w, op * 0.8, so) }];
if (isLettering(p)) return [{ layer: 1, a: fillOf(f.shadow, op * f.shadowA * 0.6) }, { layer: 4, a: fillOf(p.role === 'accent' && lit ? s.color : k.colors.ink, op) }];
const kind = p.role === 'dim' ? 'engraved' : p.role === 'spark' ? (lit ? 'led' : 'raised') : p.role === 'accent' ? (lit ? 'led' : 'anodized') : 'raised';
const out = [];
if (kind === 'led') {
const c = s.color, core = mix(c, '#ffffff', k.dark ? 0.62 : 0.4);
if (fillP) {
out.push({ layer: 0, a: strokeOf(c, 3.2, op * f.glowA * 1.4 * b, so) });
out.push({ layer: 3, a: strokeOf('#000000', 1.3, op * f.slotA, so) });
out.push({ layer: 4, a: fillOf(lens(k, c), op) });
} else {
out.push({ layer: 0, a: strokeOf(c, w * 3.1, op * f.glowA * b, so) });
out.push({ layer: 3, a: strokeOf('#000000', w * 1.45, op * f.slotA, so) });
out.push({ layer: 4, a: strokeOf(c, w, op, so) });
out.push({ layer: 5, a: strokeOf(core, w * 0.36, op * (k.dark ? 0.95 : 0.6) * b, so) });
}
return out;
}
if (kind === 'engraved') {
if (fillP) {
out.push({ layer: 1, a: fillOf('#ffffff', op * f.lipA) });
out.push({ layer: 2, a: fillOf(f.shadow, op * f.innerA) });
out.push({ layer: 4, a: fillOf(s.color, op * 0.92) });
} else {
out.push({ layer: 1, a: strokeOf('#ffffff', w, op * f.lipA, so) });
if (fine) out.push({ layer: 2, a: strokeOf(f.shadow, w, op * f.innerA, so) });
out.push({ layer: 4, a: strokeOf(s.color, w * 0.9, op * 0.95, so) });
}
return out;
}
const bodyS = kind === 'anodized' ? ano : chrome, bodyF = kind === 'anodized' ? anoBox : chromeBox;
if (fillP) {
out.push({ layer: 1, a: fillOf(f.shadow, op * f.shadowA) });
out.push({ layer: 2, a: fillOf('#ffffff', op * f.hiA) });
out.push({ layer: 4, a: fillOf(bodyF, op) });
} else {
out.push({ layer: 1, a: strokeOf(f.shadow, w * 1.05, op * f.shadowA, so) });
if (fine) out.push({ layer: 2, a: strokeOf('#ffffff', w, op * f.hiA, so) });
out.push({ layer: 4, a: strokeOf(bodyS, w, op, so) });
out.push({ layer: 5, a: strokeOf('#ffffff', w * 0.28, op * f.coreA, so) });
}
return out;
};
return stack(pen, entriesOf, { layers: 6, offsets: OFFSETS });
}
function streaks(k, x, y, w, h, scale = 1) {
const f = F(k), u = k.m.u;
const count = Math.max(10, Math.round(h / (1.9 * u)));
let light = '', dark = '';
for (let i = 0; i < count; i++) {
const yy = y + (h * (i + 0.5 + (hash(i, 31) - 0.5) * 0.7)) / count;
const x0 = x + w * hash(i, 32) * 0.55, len = w * (0.22 + 0.62 * hash(i, 33)) * scale;
const seg = `M${n(x0)} ${n(yy)}H${n(Math.min(x + w, x0 + len))}`;
if (hash(i, 34) > 0.5) light += seg; else dark += seg;
}
const sw = n(Math.max(0.5, 0.32 * u), 2);
if (light) k.add(path(light, { fill: 'none', stroke: '#ffffff', strokeWidth: sw, strokeOpacity: f.streakLight }));
if (dark) k.add(path(dark, { fill: 'none', stroke: '#000000', strokeWidth: sw, strokeOpacity: f.streakDark }));
}
function sheen(k, d, opacity) {
const id = k.id('sheen');
k.def(linearGradient(id, [[0, '#ffffff', 0], [0.34, '#ffffff', opacity * 0.45], [0.47, '#ffffff', opacity], [0.6, '#ffffff', opacity * 0.3], [1, '#ffffff', 0]], { x1: 0, y1: 0, x2: 1, y2: 0.42 }));
k.add(path(d, { fill: url(id) }));
}
function flag(k, x, y, w, c, opacity = 1) {
const s = Math.min(w, k.h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h: k.h });
k.add(polygon([[X - s, Y], [X, Y], [X, Y + s]], { fill: c, fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
k.add(path(`M${n(X - s)} ${n(Y)}L${n(X)} ${n(Y + s)}`, { fill: 'none', stroke: '#ffffff', strokeWidth: n(Math.max(0.75, k.m.hair * 0.8)), strokeOpacity: k.dark ? 0.35 : 0.6 }));
}
function glint(k, x, y, w, h, r, width) {
const d = roundRectPath(x, y, w, h, r);
const per = 2 * (w + h) - (8 - 2 * Math.PI) * Math.min(r, w / 2, h / 2);
const seg = per * 0.15, off = n(-phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2) * per);
k.add(path(d, { fill: 'none', stroke: k.colors.beam, strokeWidth: n(width * 2.6), strokeOpacity: 0.16, strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: off, strokeLinecap: 'round' }));
k.add(path(d, { fill: 'none', stroke: k.colors.beam, strokeWidth: n(width), strokeOpacity: k.dark ? 0.95 : 0.9, strokeDasharray: `${n(seg * 0.6)} ${n(per - seg * 0.6)}`, strokeDashoffset: n(+off - seg * 0.2), strokeLinecap: 'round' }));
}
function keyGeom(k) {
const u = k.m.u, o = 2 * u, bw = 3.2 * u, R = k.m.radius;
return { o, bw, fi: o + bw, R, r: Math.max(1.5 * u, R - bw) };
}
function keyFace(k, { tone = 'idle' } = {}) {
const f = F(k), C = k.colors, W = k.w, H = k.h, u = k.m.u;
const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
const { o, bw, fi, R, r } = keyGeom(k);
const hid = k.id('housing');
k.def(linearGradient(hid, f.housing));
k.add(rect({ width: W, height: H, fill: url(hid) }));
const bid = k.id('bevel');
k.def(linearGradient(bid, off ? f.matte : f.bevel, { x1: 0, y1: 0, x2: 0.85, y2: 1 }));
k.add(path(roundRectPath(o, o, W - 2 * o, H - 2 * o, R), { fill: url(bid) }));
if (!off) {
const eid = k.id('rim');
k.def(linearGradient(eid, [[0, '#ffffff', k.dark ? 0.55 : 1], [0.45, '#ffffff', 0]]));
k.add(path(roundRectPath(o + k.m.hair / 2, o + k.m.hair / 2, W - 2 * o - k.m.hair, H - 2 * o - k.m.hair, R), { fill: 'none', stroke: url(eid), strokeWidth: n(k.m.hair) }));
}
const faceD = roundRectPath(fi, fi, W - 2 * fi, H - 2 * fi, r);
const fid = k.id('face');
k.def(linearGradient(fid, off ? f.matte : f.face));
k.add(path(faceD, { fill: url(fid) }));
if (!off) {
streaks(k, fi + r * 0.4, fi + u, W - 2 * fi - r * 0.8, H - 2 * fi - 2 * u);
sheen(k, faceD, C.sheenOpacity);
}
const c = lit ? k.tone(tone) : null, b = breath(k, tone);
if (lit) {
const wid = k.id('leak');
k.def(radialGradient(wid, [[0, c, (k.dark ? 0.2 : 0.1) * b], [0.6, c, (k.dark ? 0.06 : 0.03) * b], [1, c, 0]], { cx: 0.5, cy: 1.08, r: 0.95 }));
k.add(path(faceD, { fill: url(wid) }));
}
const ch = Math.max(1, 1.25 * u);
if (!off) k.add(path(faceD, { fill: 'none', stroke: f.channel, strokeWidth: n(ch * 1.5), strokeOpacity: f.channelA }));
if (lit) {
k.add(path(faceD, { fill: 'none', stroke: c, strokeWidth: n(ch * 4), strokeOpacity: n(f.glowA * 1.2 * b, 3) }));
k.add(path(faceD, { fill: 'none', stroke: c, strokeWidth: n(ch), strokeOpacity: b < 1 ? n(b, 3) : null }));
k.add(path(faceD, { fill: 'none', stroke: mix(c, '#ffffff', k.dark ? 0.6 : 0.35), strokeWidth: n(Math.max(0.5, ch * 0.34)), strokeOpacity: n((k.dark ? 0.9 : 0.6) * b, 3) }));
}
if (flagged(tone)) flag(k, 0, 0, W, k.tone(tone), st === 'alert' ? 0.65 + 0.35 * b : 1);
if (st === 'busy') glint(k, o + bw / 2, o + bw / 2, W - 2 * o - bw, H - 2 * o - bw, R - bw / 2, Math.max(1, 1.1 * u));
}
function plate(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const f = F(k), C = k.colors, u = k.m.u;
const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
const fid = k.id('plate');
k.def(linearGradient(fid, off ? f.matte : f.face));
k.add(rect({ x, y, width: w, height: h, fill: url(fid) }));
if (!off) {
streaks(k, x, y + u, w, h - 2 * u, 0.8);
sheen(k, `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`, C.sheenOpacity * 0.8);
k.add(rect({ x, y, width: w, height: Math.max(1, k.m.hair), fill: '#ffffff', fillOpacity: k.dark ? 0.2 : 0.95 }));
k.add(rect({ x, y: y + h - Math.max(1, k.m.hair), width: w, height: Math.max(1, k.m.hair), fill: '#000000', fillOpacity: k.dark ? 0.6 : 0.18 }));
}
if (k.ctx.kind === 'screen' && w >= 300 && h >= 150) {
const s = k.m.safe * 0.5, rr = Math.max(2, k.m.safe * 0.2);
for (const [sx, sy] of [[x + s, y + s], [x + w - s, y + s], [x + s, y + h - s], [x + w - s, y + h - s]]) {
const sid = once(k, 'screw', () => { const id = k.id('screw'); k.def(radialGradient(id, [[0, k.dark ? '#9aa1ab' : '#ffffff'], [1, k.dark ? '#2a2e34' : '#9ba1a9']], { cx: 0.35, cy: 0.3, r: 0.8 })); return url(id); });
k.add(`<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(rr)}" fill="${sid}"/>`);
k.add(path(`M${n(sx - rr * 0.7)} ${n(sy + rr * 0.35)}L${n(sx + rr * 0.7)} ${n(sy - rr * 0.35)}`, { stroke: k.dark ? '#0b0c0e' : '#5c626a', strokeWidth: n(Math.max(0.6, rr * 0.3)) }));
}
}
if (lit || st === 'busy') {
const c = lit ? k.tone(tone) : C.beam, b = breath(k, tone);
const ph = Math.max(1, 1.1 * u), py = y + h - 2.6 * u, px = x + k.m.safe, pw = w - 2 * k.m.safe;
k.add(rect({ x: px, y: py - ph / 2, width: pw, height: ph * 1.8, rx: ph * 0.9, fill: f.channel, fillOpacity: f.channelA }));
if (lit) {
const gid = k.id('pipe');
k.def(linearGradient(gid, [[0, c, 0], [1, c, (k.dark ? 0.28 : 0.14) * b]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
k.add(rect({ x: px, y: py - 9 * u, width: pw, height: 9 * u, fill: url(gid) }));
const lid = k.id('pipel');
k.def(linearGradient(lid, [[0, c, 0], [0.08, c, 1], [0.92, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: px, y: py, width: pw, height: ph * 0.8, rx: ph * 0.4, fill: url(lid), fillOpacity: b < 1 ? n(b, 3) : null }));
k.add(rect({ x: px + pw * 0.08, y: py + ph * 0.2, width: pw * 0.84, height: Math.max(0.5, ph * 0.3), fill: mix(c, '#ffffff', 0.6), fillOpacity: n((k.dark ? 0.85 : 0.5) * b, 3) }));
} else {
const p = phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2), gw = pw * 0.18, gx = px - gw + (pw + gw) * p;
const lid = k.id('pipeg');
k.def(linearGradient(lid, [[0, c, 0], [0.5, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: Math.max(px, gx), y: py, width: Math.max(0.5, Math.min(px + pw, gx + gw) - Math.max(px, gx)), height: ph * 0.8, fill: url(lid) }));
}
if (flagged(tone)) flag(k, x, y, w, k.tone(tone), st === 'alert' ? 0.65 + 0.35 * b : 1);
}
}
function chromeText(k, role, str, o = {}) {
const markup = defaultText(k, role, str, o);
if (stateOf(k.toneName) === 'off' || (role !== 'value' && role !== 'hero') || k.m.u < 1.3) return markup;
const dy = Math.max(0.75, k.m.hair * 0.9);
return (k.dark ? castText(markup, '#000000', 0, dy, 0.7) : castText(markup, '#ffffff', 0, dy, 0.9)) + markup;
}
const draw = (id) => getGlyph(id)?.draw;
const __default = defineTheme({
id: 'chrome',
title: 'Chrome',
description: 'Machined metal: chamfered keys with brushed faces, polished chrome glyphs, engraved detail and LEDs set in milled channels. Black chrome by night, satin aluminum by day.',
tags: ['chrome', 'metal', 'machined', 'industrial', 'dark', 'light'],
modes: { dark: NIGHT, light: DAY },
defaultMode: 'dark',
tones: { idle: 'accent', active: 'tint', busy: 'muted' },
roles: {
line: { color: 'ink', width: 2.7 },
fill: { color: 'ink' },
accent: { color: 'tone', width: 2.7 },
dim: { color: 'muted', width: 2.2, opacity: 1 },
spark: { color: 'tone' },
},
type: {
eyebrow: { size: 8, weight: 700, caps: true, tracking: 0.16, color: 'muted' },
label: { size: 10, weight: 700, caps: true, tracking: 0.1, color: 'ink', baseline: 10.5 },
value: { size: 22, weight: 700, tabular: true, tracking: 0, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
caption: { size: 8.5, weight: 600, tracking: 0.04, color: 'muted' },
},
background: keyFace,
surface: plate,
paintGlyph: paintChrome,
paint(k, prim, style) { return paintChrome(k, onePen(prim), { tone: k.toneName, styleOf: () => style }); },
text: chromeText,
press(k, { pressed, age }) {
const dur = 0.5;
if (!pressed && !(age < dur)) return null;
const f = F(k), W = k.w, H = k.h, u = k.m.u;
const depth = pressed ? 1 : clamp(1 - spring(age, { stiffness: 380, damping: 17 }), -0.35, 1);
const s = 1 - 0.035 * depth, cx = W / 2, cy = H / 2, dy = 0.9 * u * depth;
const { fi, r } = keyGeom(k);
const faceD = roundRectPath(fi, fi, W - 2 * fi, H - 2 * fi, r);
let overlay = '';
if (depth > 0.02) {
const id = k.id('sink');
k.def(linearGradient(id, [[0, '#000000', (k.dark ? 0.6 : 0.32) * depth], [0.3, '#000000', 0], [0.85, '#ffffff', 0], [1, '#ffffff', (k.dark ? 0.12 : 0.5) * depth]]));
overlay += path(faceD, { fill: url(id) });
}
if (!pressed && age > 0.03 && age < 0.4 && !k.ctx.reduced) {
const p = outCubic(clamp((age - 0.03) / 0.37)), bx = lerp(-0.45 * W, 1.45 * W, p), half = W * 0.22;
const id = k.id('glint');
k.def(linearGradient(id, [[0, '#ffffff', 0], [0.5, '#ffffff', (k.dark ? 0.32 : 0.6) * (1 - p * 0.6)], [1, '#ffffff', 0]], { x1: bx - half, y1: 0, x2: bx + half, y2: H * 0.35, gradientUnits: 'userSpaceOnUse' }));
overlay += path(faceD, { fill: url(id) });
}
return {
transform: Math.abs(depth) > 0.002 ? `translate(${n(cx)} ${n(cy + dy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
under: rect({ width: W, height: H, fill: f.housing[1][1] }),
overlay,
};
},
glyphs: {
mic(g, s) {
if (s.state !== 'on' && s.state !== 'off') return draw('mic')(g, s);
const on = s.state === 'on';
g.rect(17.5, 6, 13, 21, { r: 6.5 });
for (const y of [11.5, 15, 18.5, 22]) g.line(21, y, 27, y, { role: 'dim', weight: 0.5 });
g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
g.line(24, 32.5, 24, 39);
g.line(17.5, 40, 30.5, 40);
if (on) {
const a = pulse(s.t, 1.6), b = pulse(s.t + 0.8, 1.6);
g.arc(24, 16.5, 13.5, 60, 120, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.8 });
g.arc(24, 16.5, 13.5, 240, 300, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.8 });
g.arc(24, 16.5, 17.5, 64, 116, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.7 });
g.arc(24, 16.5, 17.5, 244, 296, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.7 });
} else {
const k = arrive(s.since, 0.32);
if (k > 0.02) g.line(10, 8, 10 + 28 * k, 8 + 32 * k, { role: 'accent', weight: 1.1 });
}
},
clock(g, s) {
g.circle(24, 24, 17.5);
for (let i = 0; i < 12; i++) {
const major = i % 3 === 0;
const [x1, y1] = g.polar(24, 24, major ? 10 : 11.8, i * 30), [x2, y2] = g.polar(24, 24, 13.6, i * 30);
g.line(x1, y1, x2, y2, { role: major ? 'line' : 'dim', weight: major ? 0.75 : 0.45, cap: 'butt' });
}
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
const blade = (deg, len, w, role) => {
const [tx, ty] = g.polar(24, 24, len, deg), [bx, by] = g.polar(24, 24, 2.6, deg + 180);
const [lx, ly] = g.polar(24, 24, w / 2, deg - 90), [rx, ry] = g.polar(24, 24, w / 2, deg + 90);
g.polygon([[bx, by], [lx, ly], [tx, ty], [rx, ry]], { role, join: 'round', fill: true });
};
blade(h * 30, 8.6, 3.4, 'fill');
blade(m * 6, 12.8, 2.6, 'accent');
if (typeof s.params.s === 'number') { const [x, y] = g.polar(24, 24, 13, s.params.s * 6); g.line(24, 24, x, y, { role: 'accent', weight: 0.35 }); }
g.dot(24, 24, 1.7);
},
},
});
};
__d[236] = function (__ns) {
const { attrs, n } = __m(5);
const { pathBounds } = __m(13);
__e(__ns, { "layered": () => layered, "coarse": () => coarse, "onePen": () => onePen, "isLettering": () => isLettering, "minSide": () => minSide, "strokeA": () => strokeA, "fillA": () => fillA }, [], ["coarse","fillA","isLettering","layered","minSide","onePen","strokeA"]);
function layered(pen, entriesOf, { layers, offsets = {} } = {}) {
const cache = new Map();
let idx = 0;
const entries = (p) => {
let e = cache.get(p);
if (!e) {
e = (entriesOf(p, idx++) || []).filter(Boolean).map((x) => ({ ...x, d: coarse(x.d ?? p.d, x.soft ? 1 : 1), key: keyOf(x.a) }));
cache.set(p, e);
}
return e;
};
const walk = (node, L) => {
let out = '', run = null, soft = null;
const flushRun = () => { if (run) { out += `<path${attrs({ d: run.d, ...run.a })}/>`; run = null; } };
const flushSoft = () => { if (soft) { for (const s of soft.values()) out += `<path${attrs({ d: s.d, ...s.a })}/>`; soft = null; } };
const flush = () => { flushRun(); flushSoft(); };
for (const c of node.children) {
if (c.group) {
flush();
const inner = walk(c, L);
if (!inner) continue;
out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
continue;
}
for (const e of entries(c)) {
if (e.layer !== L) continue;
if (e.soft) {
flushRun();
soft ??= new Map();
const s = soft.get(e.key);
if (s) s.d += e.d; else soft.set(e.key, { a: e.a, d: e.d });
} else {
flushSoft();
if (run && run.key === e.key) run.d += e.d;
else { flushRun(); run = { key: e.key, a: e.a, d: e.d }; }
}
}
}
flush();
return out;
};
let out = '';
for (let L = 0; L < layers; L++) {
const body = walk(pen.root, L);
if (!body) continue;
const off = offsets[L];
out += off ? `<g transform="translate(${n(off[0])} ${n(off[1])})">${body}</g>` : body;
}
return out;
}
const coarseMemo = new Map();
function coarse(d, decimals = 1) {
const key = decimals + d;
let v = coarseMemo.get(key);
if (v === undefined) {
v = d.replace(/-?\d*\.\d+/g, (m) => { const r = (+m).toFixed(decimals).replace(/\.0+$/, ''); return r === '-0' ? '0' : r; });
if (coarseMemo.size > 6000) coarseMemo.clear();
coarseMemo.set(key, v);
}
return v;
}
const keyOf = (a) => { let s = ''; for (const k in a) if (a[k] !== null && a[k] !== undefined) s += `${k}=${a[k]};`; return s; };
const onePen = (prim) => ({ root: { group: true, children: [prim] } });
const isLettering = (prim) => prim.text === true || (prim.text === undefined && prim.fill === true && /Q/.test(prim.d));
const boundsMemo = new Map();
function minSide(prim) {
let v = boundsMemo.get(prim.d);
if (v === undefined) {
const b = pathBounds(prim.d);
v = Math.min(b.w, b.h);
if (boundsMemo.size > 4000) boundsMemo.clear();
boundsMemo.set(prim.d, v);
}
return v;
}
const strokeA = (color, width, opacity, { cap = 'round', join = 'round', dash = null, dashOffset = null } = {}) => ({
fill: 'none', stroke: color, strokeWidth: n(width, 3), strokeOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null,
strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash, strokeDashoffset: dashOffset,
});
const fillA = (color, opacity) => ({ fill: color, fillOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null });
};
__d[237] = function (__ns) {
const { defineTheme, bezelCorner } = __m(14);
const { rect, path, url, linearGradient, radialGradient, n, P, roundRectPath } = __m(5);
const { mix } = __m(4);
const { clamp, lerp, outCubic, pulse, phase } = __m(12);
const { hash } = __m(1);
const { getGlyph } = __m(231);
const { layered, onePen, strokeA, fillA } = __m(236);
__e(__ns, { "heatOf": () => heatOf, "bellows": () => bellows, "default": () => __default }, [], ["bellows","default","heatOf"]);
const NIGHT = {
bg: '#0b0605', surface: '#1c110c', surface2: '#0d0705', line: '#33211a',
ink: '#ffeedd', muted: '#d2ad8f', dim: '#8f6c56',
accent: '#ff8f33', accent2: '#ffc44d', pos: '#b2d867', info: '#72b6ff', warn: '#ffc93f', neg: '#ff5a36', crit: '#ff3d7a',
smolder: '#f2702a', hot: '#ffb340',
edge: '#ffcf9e', edgeOpacity: 0.07, beam: '#ffb340', beamOpacity: 0.5, sheenOpacity: 0,
spectrum: { l: 0.74, c: 0.14 },
};
const DAY = {
bg: '#e9dcc7', surface: '#f3e8d6', surface2: '#e8d8bf', line: '#d3bf9f',
ink: '#2a170c', muted: '#6b4a31', dim: '#8d6d52',
accent: '#c2410c', accent2: '#9a5b00', pos: '#4f6f12', info: '#1f5fa8', warn: '#965400', neg: '#b3261e', crit: '#a3164f',
smolder: '#b8470f', hot: '#d94e0b', burn: '#3b2416',
edge: '#ffffff', edgeOpacity: 0.6, beam: '#c2410c', beamOpacity: 0.3, sheenOpacity: 0,
spectrum: { l: 0.52, c: 0.14 },
};
const CRUST = '#100805', ASH = '#73685f', ASH_FLECK = '#9a8e85';
const TONE_HEAT = { off: 0, idle: 0.56, active: 1, ok: 0.86, info: 0.86, warn: 0.9, neg: 0.9, alert: 1, crit: 1, busy: 0.46 };
const CRACKS = ['2.6 1.1 0.9 1.6 3.4 0.8', '1.4 0.9 3.1 1.3 1.9 0.7', '3.2 1.4 1.2 0.8 2.2 1.1'];
function heatOf(k, tone) {
const base = TONE_HEAT[tone] ?? 0.8;
if ((tone !== 'alert' && tone !== 'crit') || k.ctx.reduced) return base;
return lerp(0.62, 1.12, pulse(k.ctx.t, tone === 'crit' ? 0.8 : 1.2));
}
function bellows(ctx) {
if (ctx.pressed) return 1.38;
const a = ctx.pressAge;
if (!(a < 0.7)) return 1;
return 1 + 0.38 * (1 - outCubic(clamp(a / 0.7)));
}
const heatAt = (k, tone) => { const b = bellows(k.ctx), h = heatOf(k, tone); return h > 0 ? h * b : (b - 1) * 0.8; };
const hotOf = (c) => mix(c, '#fff1c2', 0.58);
const deepOf = (c) => mix(c, '#4a0b00', 0.5);
function coalGradient(k, c) {
const memo = k._d1coal || (k._d1coal = new Map());
let id = memo.get(c);
if (!id) {
id = k.id('coal');
k.def(radialGradient(id, [[0, hotOf(c)], [0.55, c], [1, deepOf(c)]], { cx: 0.5, cy: 0.42, r: 0.62 }));
memo.set(c, id);
}
return id;
}
function nightEmber(k, p, st, H, i) {
const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const vis = clamp(op * 2.5);
const h = H * (st.heat ?? 1) * (0.35 + 0.65 * op); 
const cold = H <= 0.001;
const c = st.color, w = (st.width ?? 2.6) * (p.weight ?? 1);
const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
const crack = (pat, off) => ({ ...so, dash: so.dash || pat, dashOffset: so.dash ? null : n(off) });
const out = [];
if (p.fill) {
if (!cold) out.push({ layer: 0, a: strokeA(c, 3.8, 0.1 * h * vis, so), soft: true });
out.push({ layer: 1, a: { ...fillA(CRUST, vis), stroke: CRUST, strokeWidth: 1.3, strokeLinejoin: 'round' } });
if (cold) { out.push({ layer: 2, a: fillA(ASH, vis) }); return out; }
out.push({ layer: 2, a: fillA(deepOf(c), vis) });
out.push({ layer: 3, a: { fill: url(coalGradient(k, c)), fillOpacity: h < 0.999 ? n(clamp(h), 3) : null } });
if (p.role === 'spark' && h > 0.6) out.push({ layer: 5, a: fillA('#fffaf0', clamp((h - 0.6) * 2)) });
return out;
}
if (!cold) out.push({ layer: 0, a: strokeA(deepOf(c), w * 3.4, 0.16 * h * vis, so), soft: true });
if (!cold) out.push({ layer: 0, a: strokeA(c, w * 2, 0.12 * h * vis, so), soft: true });
out.push({ layer: 1, a: strokeA(CRUST, w * 1.5, vis, so) });
if (cold) {
out.push({ layer: 2, a: strokeA(ASH, w, vis, so) });
out.push({ layer: 4, a: strokeA(ASH_FLECK, w * 0.3, 0.8 * vis, { ...so, dash: so.dash || '0.6 2.2', cap: 'round' }) });
return out;
}
out.push({ layer: 2, a: strokeA(deepOf(c), w, vis, so) });
out.push({ layer: 3, a: strokeA(c, w * 0.6, clamp(h * 0.8), so) });
out.push({ layer: 4, a: strokeA(hotOf(c), w * 0.44, clamp(h * 1.3 - 0.15), crack(CRACKS[i % 3], (i * 1.7) % 4)) });
if (h > 0.82) out.push({ layer: 5, a: strokeA('#fffaf0', w * 0.15, clamp((h - 0.82) * 3), crack(CRACKS[(i + 1) % 3], (i * 2.3) % 5)) });
return out;
}
function dayBurn(k, p, st, H, i) {
const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const vis = clamp(op * 2.5);
const h = H * (st.heat ?? 1) * op;
const C = k.colors, cold = H <= 0.001;
const burn = p.role === 'accent' || p.role === 'spark' ? mix(st.color, C.burn, 0.35) : p.role === 'dim' ? mix(C.burn, C.surface, 0.32) : C.burn;
const ink = cold ? mix(burn, C.surface, 0.3) : burn;
const w = (st.width ?? 2.6) * (p.weight ?? 1);
const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
const out = [];
if (p.fill) {
out.push({ layer: 0, a: strokeA('#9a5424', 3.2, 0.14 * vis, so), soft: true });
out.push({ layer: 2, a: { ...fillA(ink, vis), stroke: '#6b3416', strokeWidth: 0.9, strokeOpacity: n(0.5 * vis, 3), strokeLinejoin: 'round' } });
if (h > 0.05) out.push({ layer: 3, a: fillA(st.color, clamp(h) * 0.55) });
return out;
}
out.push({ layer: 0, a: strokeA('#9a5424', w * 2.6, (cold ? 0.08 : 0.15) * vis, so), soft: true });
out.push({ layer: 1, a: strokeA('#6b3416', w * 1.45, (cold ? 0.18 : 0.32) * vis, so), soft: true });
out.push({ layer: 2, a: strokeA(ink, w, vis, so) });
if (h > 0.05) out.push({ layer: 3, a: strokeA(st.color, w * 0.4, clamp(h), { ...so, dash: so.dash || CRACKS[i % 3], dashOffset: so.dash ? null : n((i * 1.7) % 4) }) });
return out;
}
function paintEmber(k, pen, { tone, styleOf }) {
const H = heatAt(k, tone);
const fn = k.dark ? nightEmber : dayBurn;
return layered(pen, (p, i) => fn(k, p, styleOf(p), H, i), { layers: 6 });
}
function notch(k, x, y, w, tone, H) {
const s = Math.min(w, k.h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h: k.h }); 
k.add(path(P().M(X - s, Y).H(X).V(Y + s).Z().d, { fill: k.tone(tone), fillOpacity: n(clamp(0.4 + 0.55 * H), 3) }));
}
function firebox(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, ctx = k.ctx, key = ctx.kind === 'key';
const H = heatAt(k, tone);
const b = k.id('box');
if (k.dark) {
k.def(radialGradient(b, [[0, C.surface], [1, C.surface2]], { cx: 0.5, cy: 0.38, r: 0.85 }));
k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
if (H > 0.001) {
const bed = k.id('bed'), c = k.tone(tone);
const a = 0.34 * Math.min(1.3, H);
k.def(radialGradient(bed, [[0, c, a], [0.45, deepOf(c), a * 0.45], [1, deepOf(c), 0]], { cx: 0.5, cy: key ? 1.08 : 1.15, r: key ? 0.72 : 0.9 }));
k.add(rect({ x, y, width: w, height: h, fill: url(bed) }));
}
k.add(rect({ x: x + k.m.radius, y, width: w - k.m.radius * 2, height: k.m.hair, fill: C.edge, fillOpacity: n(C.edgeOpacity * (H > 0 ? 1.4 : 0.7), 3) }));
} else {
k.def(linearGradient(b, [[0, C.surface], [1, C.surface2]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }));
k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
const p = P(), lines = Math.max(4, Math.round(h / (11 * k.m.u)));
for (let i = 0; i < lines; i++) {
const yy = y + ((i + 0.5) / lines) * h, amp = (1.2 + 2 * hash(i, 3)) * k.m.u, ph = hash(i, 9) * 6;
p.M(x, yy);
for (let s = 1; s <= 4; s++) p.Q(x + ((s - 0.5) / 4) * w, yy + amp * Math.sin(ph + s * 1.9), x + (s / 4) * w, yy + amp * 0.4 * Math.sin(ph + s * 2.7));
}
k.add(path(p.d, { fill: 'none', stroke: '#a27a50', strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.13 }));
if (H > 0.001) {
const warm = k.id('warm'), c = k.tone(tone);
k.def(radialGradient(warm, [[0, c, 0.12 * Math.min(1.3, H)], [1, c, 0]], { cx: 0.5, cy: key ? 0.44 : 0.5, r: 0.6 }));
k.add(rect({ x, y, width: w, height: h, fill: url(warm) }));
}
}
if (tone === 'alert' || tone === 'crit') notch(k, x, y, w, tone, H);
if (tone === 'busy') fuse(k, x, y, w, h);
}
function fuse(k, x, y, w, h) {
const i = (k.m.bleed ?? 4 * k.m.u) + k.m.hair * 0.5, r = Math.max(k.m.radius - i * 0.5, k.m.radius * 0.5), ww = w - i * 2, hh = h - i * 2;
const d = roundRectPath(x + i, y + i, ww, hh, r);
const per = 2 * (ww + hh - 4 * r) + 2 * Math.PI * r, seg = per * 0.16;
const off = -phase(k.ctx.reduced ? 0 : k.ctx.t, 1.2) * per;
const hot = k.dark ? '#ffd27a' : '#d94e0b';
k.add(path(d, { fill: 'none', stroke: k.dark ? '#ff6a1a' : '#9a5424', strokeWidth: n(k.m.line * 2.6), strokeOpacity: k.dark ? 0.22 : 0.18, strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(off), strokeLinecap: 'round' }));
k.add(path(d, { fill: 'none', stroke: hot, strokeWidth: n(k.m.line * 0.9), strokeDasharray: `${n(seg * 0.5)} ${n(per - seg * 0.5)}`, strokeDashoffset: n(off - seg * 0.5), strokeLinecap: 'round' }));
}
function sparks(k, age) {
const s = Math.min(k.w, k.h), cx = k.w / 2, cy = k.h * 0.44;
const hot = k.dark ? '#ffd27a' : '#e0560f';
let trails = '', dots = '', cores = '';
for (let i = 0; i < 7; i++) {
const life = 0.45 + 0.35 * hash(i, 3);
const p = age / life;
if (p >= 1) continue;
const x0 = cx + (hash(i, 1) - 0.5) * s * 0.42, y0 = cy + s * (0.02 + 0.1 * hash(i, 4));
const vy = s * (0.55 + 0.5 * hash(i, 2)), drift = (hash(i, 5) - 0.5) * s * 0.3;
const at = (a) => [x0 + drift * a + Math.sin(a * 9 + i) * s * 0.012, y0 - vy * a * (1 - a * 0.45)];
const [x, y] = at(age), [px, py] = at(Math.max(0, age - 0.06));
const r = k.m.u * (0.7 + 0.7 * hash(i, 6)) * (1 - p * 0.5), o = n((1 - p) * (1 - p * 0.3), 3);
trails += `<path d="M${n(px)} ${n(py)}L${n(x)} ${n(y)}" stroke="${hot}" stroke-width="${n(r * 1.1)}" stroke-opacity="${n(0.45 * (1 - p), 3)}" stroke-linecap="round" fill="none"/>`;
dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${hot}" fill-opacity="${o}"/>`;
if (k.dark) cores += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.45)}" fill="#fffaf0" fill-opacity="${o}"/>`;
}
return trails + dots + cores;
}
const draw = (id) => getGlyph(id)?.draw;
const __default = defineTheme({
id: 'ember',
title: 'Ember',
description: 'Warm dark: coals and amber light. Glyphs are live embers with a char crust and glowing cracks; heat is the state, a press works the bellows and throws sparks.',
tags: ['ember', 'fire', 'warm', 'coal', 'dark', 'light', 'pyrography'],
modes: { dark: NIGHT, light: DAY },
defaultMode: 'dark',
tones: { idle: 'smolder', active: 'hot', busy: 'smolder' },
roles: {
line: { color: 'tone', width: 2.7, heat: 1 },
fill: { color: 'tone', width: 2.4, heat: 1 },
accent: { color: 'tone', width: 2.9, heat: 1.22, glow: 1 },
dim: { color: 'tone', width: 2.2, heat: 0.5, opacity: 1 },
spark: { color: 'tone', heat: 1.3, glow: 1 },
},
type: {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.14, color: 'muted' },
label: { size: 11, weight: 600, tracking: 0.005, color: 'ink' },
value: { size: 22, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, tracking: -0.03, color: 'ink' },
caption: { size: 8.5, weight: 400, color: 'muted' },
},
background: firebox,
surface: firebox,
paintGlyph: paintEmber,
paint(k, prim, style) {
return paintEmber(k, onePen(prim), { tone: k.toneName, styleOf: () => style });
},
press(k, { pressed, age }) {
if (!pressed && !(age < 0.8)) return null;
const sink = pressed ? 1 : 1 - outCubic(clamp(age / 0.24));
const s = 1 - 0.035 * sink, cx = k.w / 2, cy = k.h / 2;
let overlay = '';
if (pressed) {
const id = k.id('flare'), c = k.dark ? '#ff9a3c' : '#e0560f';
k.def(radialGradient(id, [[0, c, k.dark ? 0.3 : 0.14], [1, c, 0]], { cx: 0.5, cy: 1.05, r: 0.7 }));
overlay = rect({ width: k.w, height: k.h, fill: url(id) });
} else if (!k.ctx.reduced) overlay = sparks(k, age);
return {
transform: sink > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#6b4a31' }),
overlay,
};
},
glyphs: {
bulb(g, s) {
if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
const on = s.state === 'on';
g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
g.line(19, 32.5, 19, 35.5);
g.line(29, 32.5, 29, 35.5);
g.line(19, 35.5, 29, 35.5);
g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
g.polyline([[21, 32.5], [20.5, 25.5]], { role: 'dim', weight: 0.6 });
g.polyline([[27, 32.5], [27.5, 25.5]], { role: 'dim', weight: 0.6 });
const coil = [];
for (let j = 0; j <= 28; j++) { const u = j / 28; coil.push([20.5 + 7 * u, 25.5 - 2.4 * Math.abs(Math.sin(u * Math.PI * 4))]); }
g.polyline(coil, { role: on ? 'accent' : 'dim', weight: 0.62 });
if (!on) return;
const k = Math.min(1, s.since / 0.5);
for (const a of [-60, -30, 0, 30, 60]) {
const [x1, y1] = g.polar(24, 22.5, 13, a), [x2, y2] = g.polar(24, 22.5, 13 + 3 * k, a);
g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.8, opacity: 0.55 + 0.45 * pulse(s.t + a / 120, 2.4) });
}
},
broadcast(g, s) {
if (s.state !== 'live' && s.state !== 'offline') return draw('broadcast')(g, s);
const live = s.state === 'live';
g.circle(24, 24, live ? 4.4 : 3.8, { role: live ? 'accent' : 'fill', fill: true });
[9, 15.5].forEach((r, i) => {
const ph = live ? (s.phase(1.8) + i * 0.5) % 1 : 0;
const op = live ? 0.4 + 0.6 * (1 - Math.abs(ph - 0.5) * 2) : 0.8;
for (const [a0, a1] of [[44, 136], [224, 316]]) {
const pts = [];
for (let j = 0; j <= 16; j++) {
const a = a0 + ((a1 - a0) * j) / 16;
const rr = r + (live ? 0.75 : 0.35) * Math.sin(j * 1.6 + (live ? s.phase(1.8) * Math.PI * 2 : 0) + i);
pts.push(g.polar(24, 24, rr, a));
}
g.polyline(pts, { role: i ? 'dim' : 'line', opacity: op });
}
});
},
},
});
};
__d[238] = function (__ns) {
const { attrs, n } = __m(5);
const { clamp } = __m(12);
const { rng } = __m(1);
__e(__ns, { "strHash": () => strHash, "layeredPaint": () => layeredPaint, "strokeA": () => strokeA, "fillA": () => fillA, "halftone": () => halftone, "fibers": () => fibers }, [], ["fibers","fillA","halftone","layeredPaint","strHash","strokeA"]);
function strHash(str) {
let h = 0x811c9dc5;
for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
return h >>> 0;
}
const keyOf = (a) => JSON.stringify(a);
function layeredPaint(pen, entriesOf, { layers, offsets = {} } = {}) {
const cache = new Map();
let idx = 0;
const entries = (p) => {
let e = cache.get(p);
if (!e) {
e = (entriesOf(p, idx++) || []).filter(Boolean).map((x) => ({ ...x, d: x.d ?? p.d, key: keyOf(x.a) }));
cache.set(p, e);
}
return e;
};
const walk = (node, L) => {
let out = '', run = null;
const flush = () => { if (run) { out += `<path${attrs({ d: run.d, ...run.a })}/>`; run = null; } };
for (const c of node.children) {
if (c.group) {
flush();
const inner = walk(c, L);
if (!inner) continue;
out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
continue;
}
for (const e of entries(c)) {
if (e.layer !== L) continue;
if (run && run.key === e.key) run.d += e.d;
else { flush(); run = { key: e.key, a: e.a, d: e.d }; }
}
}
flush();
return out;
};
let out = '';
for (let L = 0; L < layers; L++) {
const body = walk(pen.root, L);
if (!body) continue;
const off = offsets[L];
out += off && (off[0] || off[1]) ? `<g transform="translate(${n(off[0])} ${n(off[1])})">${body}</g>` : body;
}
return out;
}
const strokeA = (color, width, opacity = 1, { cap = 'round', join = 'round', dash = null } = {}) => ({
fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: opacity < 0.999 ? n(clamp(opacity), 3) : null,
strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash,
});
const fillA = (color, opacity = 1) => ({ fill: color, fillOpacity: opacity < 0.999 ? n(clamp(opacity), 3) : null });
function halftone({ x = 0, y = 0, w, h, pitch, from = 0.5, maxR = 0.32, gamma = 1.25, color, opacity = 1 }) {
let rows = '';
const row = pitch / 2, top = y + h * from, span = h * (1 - from);
for (let j = 0; ; j++) {
const cy = y + h - row * (j + 0.35);
if (cy < top) break;
const r = maxR * pitch * Math.pow(clamp((cy - top) / span), gamma);
if (r < 0.3) continue;
const x0 = x + (j % 2) * pitch / 2 + pitch / 4, x1 = x + w - pitch * 0.1;
if (x1 > x0) rows += `<path d="M${n(x0, 1)} ${n(cy, 1)}H${n(x1, 1)}" stroke-width="${n(2 * r, 2)}"/>`;
}
return rows ? `<g${attrs({ fill: 'none', stroke: color, strokeOpacity: opacity < 0.999 ? n(clamp(opacity), 3) : null, strokeLinecap: 'round', strokeDasharray: `0.01 ${n(pitch - 0.01, 2)}` })}>${rows}</g>` : '';
}
function fibers(seed, { x = 0, y = 0, w, h, count = 12, len = 8, fleck = 1 }) {
const r = rng(seed);
let d = '', f = '';
for (let i = 0; i < count; i++) {
const x0 = x + r() * w, y0 = y + r() * h, a = r() * Math.PI, L = len * (0.45 + r() * 0.8);
const dx = Math.cos(a) * L, dy = Math.sin(a) * L, bend = (r() - 0.5) * L * 0.7;
d += `M${n(x0, 1)} ${n(y0, 1)}q${n(dx / 2 - dy * bend / L, 1)} ${n(dy / 2 + dx * bend / L, 1)} ${n(dx, 1)} ${n(dy, 1)}`;
}
const flecks = Math.round(count / 3);
for (let i = 0; i < flecks; i++) {
const cx = x + r() * w, cy = y + r() * h, rr = fleck * (0.4 + r() * 0.6);
f += `M${n(cx - rr, 1)} ${n(cy, 1)}a${n(rr, 2)} ${n(rr, 2)} 0 1 0 ${n(2 * rr, 2)} 0a${n(rr, 2)} ${n(rr, 2)} 0 1 0 ${n(-2 * rr, 2)} 0`;
}
return { fibers: d, flecks: f };
}
};
__d[239] = function (__ns) {
const { defineTheme, defaultText, bezelCorner } = __m(14);
const { rect, path, polygon, n, roundRectPath } = __m(5);
const { clamp, outCubic, phase, arrive } = __m(12);
const { pathBounds } = __m(13);
const { capHeight, wrapText } = __m(11);
const { layeredPaint, strokeA, fillA } = __m(238);
const { getGlyph } = __m(231);
__e(__ns, { "default": () => __default, "monoFace": () => face, "monoState": () => stateOf }, [], ["default","monoFace","monoState"]);
const NIGHT = {
bg: '#000000', surface: '#000000', surface2: '#000000', line: '#5e5e5e',
ink: '#ffffff', muted: '#d4d4d4', dim: '#a3a3a3',
accent: '#ffffff', accent2: '#ffd23f', pos: '#4fe08a', info: '#7cc4ff', warn: '#ffd23f', neg: '#ff7a7a', crit: '#ff5fa2',
edge: '#ffffff', edgeOpacity: 0, beam: '#ffffff', beamOpacity: 1, sheenOpacity: 0,
spectrum: { l: 1, c: 0 },
face: '#000000', reverse: '#000000',
};
const DAY = {
bg: '#ffffff', surface: '#ffffff', surface2: '#ffffff', line: '#8a8a8a',
ink: '#000000', muted: '#2b2b2b', dim: '#575757',
accent: '#000000', accent2: '#6e4a00', pos: '#00632a', info: '#00459e', warn: '#6e4a00', neg: '#b0001e', crit: '#86003f',
edge: '#000000', edgeOpacity: 0, beam: '#000000', beamOpacity: 1, sheenOpacity: 0,
spectrum: { l: 0, c: 0 },
face: '#ffffff', reverse: '#ffffff',
};
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'warn', neg: 'alert', alert: 'alert', crit: 'crit', busy: 'busy', off: 'off' };
const stateOf = (tone) => STATE[tone] || 'idle';
const lit = (s) => s === 'on' || s === 'crit';
const marching = (k) => !(k.ctx.reduced || k.ctx.since >= 10);
function frameRect(k, inset, width, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
const i = inset + width / 2;
return roundRectPath(x + i, y + i, w - i * 2, h - i * 2, Math.max(width, k.m.radius - i));
}
function badge(k, color, kind, { x = 0, y = 0, w = k.w } = {}) {
const u = k.m.u, C = k.colors, bz = bezelCorner(k, { x, y, w, h: k.h }), X = bz.X;
y = bz.Y;
if (kind === 'notch') {
const s = Math.min(16 * u, w * 0.24);
k.add(polygon([[X - s, y], [X, y], [X, y + s]], { fill: color }));
const cx = X - s / 3, bw = Math.max(1.4, s * 0.11), bar = s * 0.27, top = y + s / 3 - (bar + bw * 1.9) / 2;
k.add(rect({ x: cx - bw / 2, y: top, width: bw, height: bar, rx: bw / 2, fill: C.face }));
k.add(rect({ x: cx - bw / 2, y: top + bar + bw * 0.9, width: bw, height: bw, rx: bw / 2, fill: C.face }));
return;
}
const s = Math.min(13 * u, w * 0.2), m = 0;
const ax = X - m - s / 2, ay = y + m, hgt = s * 0.88;
k.add(polygon([[ax, ay], [ax + s / 2, ay + hgt], [ax - s / 2, ay + hgt]], { fill: color, strokeLinejoin: 'round', stroke: color, strokeWidth: n(Math.max(1, 0.8 * u)) }));
const bw = Math.max(1.3, s * 0.11);
k.add(rect({ x: ax - bw / 2, y: ay + hgt * 0.32, width: bw, height: hgt * 0.36, rx: bw / 2, fill: C.face }));
k.add(rect({ x: ax - bw / 2, y: ay + hgt * 0.76, width: bw, height: bw, rx: bw / 2, fill: C.face }));
}
function face(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, u = k.m.u, s = stateOf(tone), color = k.tone(tone), R = { x, y, w, h };
const inset = 1.5 * u;
k.add(rect({ x, y, width: w, height: h, fill: C.face }));
const stroke = (d, a) => k.add(path(d, { fill: 'none', ...a }));
const base = Math.max(1, 1.5 * u);
switch (s) {
case 'idle': stroke(frameRect(k, inset, base, R), { stroke: C.line, strokeWidth: n(base) }); break;
case 'on': stroke(frameRect(k, inset, 3.5 * u, R), { stroke: color, strokeWidth: n(3.5 * u) }); break;
case 'warn': {
const rw = 2.6 * u;
stroke(frameRect(k, inset, rw, R), { stroke: color, strokeWidth: n(rw), strokeDasharray: `${n(7 * u)} ${n(3.5 * u)}`, strokeLinecap: 'butt' });
badge(k, color, 'triangle', R);
break;
}
case 'alert': case 'crit': {
const rw = 4 * u, dash = 4.5 * u, gap = 3 * u;
stroke(frameRect(k, inset, rw, R), { stroke: color, strokeWidth: n(rw), strokeDasharray: `${n(dash)} ${n(gap)}`, strokeDashoffset: marching(k) ? n(-phase(k.ctx.t, 1.5) * (dash + gap)) : null, strokeLinecap: 'butt' });
badge(k, color, 'notch', R);
break;
}
case 'busy': {
const d = frameRect(k, inset, base, R);
stroke(d, { stroke: C.line, strokeWidth: n(base) });
const r = Math.max(base, k.m.radius - inset - base / 2), ww = w - (inset + base / 2) * 2, hh = h - (inset + base / 2) * 2;
const per = 2 * (ww + hh) - (8 - 2 * Math.PI) * r, seg = per * 0.2;
stroke(d, { stroke: C.ink, strokeWidth: n(3.5 * u), strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(-phase(k.ctx.t, 2) * per), strokeLinecap: 'round' });
break;
}
default: break; 
}
}
function paintMono(k, pen, { tone, styleOf }) {
const C = k.colors, s = stateOf(tone), off = s === 'off';
return layeredPaint(pen, (p) => {
const st = styleOf(p);
const raw = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
if (raw < 0.02) return [];
const op = 0.55 + 0.45 * raw; 
const w = (st.width ?? 3.4) * (p.weight ?? 1);
const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
const A = (color, width, o) => (p.fill ? fillA(color, o) : strokeA(color, width, o, so));
if (off) return [{ layer: 0, a: A(C.dim, w, op) }];
if (p.role === 'spark') {
const b = pathBounds(p.d), cx = b.x + b.w / 2, cy = b.y + b.h / 2, sc = b.w < 6 ? 1.45 : 1;
const tf = sc !== 1 ? `translate(${n(cx)} ${n(cy)}) scale(${sc}) translate(${n(-cx)} ${n(-cy)})` : null;
return [
{ layer: 3, a: { ...strokeA(C.face, 2.2, 1), transform: tf } },
{ layer: 4, a: { ...fillA(st.color, op), transform: tf } },
];
}
const accent = p.role === 'accent';
if (!accent) return [{ layer: 0, a: A(st.color, w, op) }];
return [
{ layer: 1, a: p.fill ? { ...strokeA(C.face, 2.6, 1, so), fill: C.face } : strokeA(C.face, w + 2.6, 1, so) },
{ layer: 2, a: A(st.color, w, op) },
];
}, { layers: 5 });
}
function monoText(k, role, str, o = {}) {
const s = stateOf(k.toneName);
if (!(role === 'label' && k.ctx.kind === 'key' && lit(s))) return defaultText(k, role, str, o);
const st = k.typeStyle('label', o), u = k.m.u;
const by = o.y ?? k.h - (st.baseline ?? 6.5) * u;
const room = o.maxWidth ?? k.w - (k.m.text ?? k.m.safe) * 2;
const wr = (o.maxLines || 1) > 1 ? wrapText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.8, maxLines: o.maxLines, weight: st.weight, tracking: st.tracking, caps: st.caps }) : null;
const lines = wr ? wr.lines.length : 1;
const top = by - capHeight(st.size, st.weight) - (lines - 1) * (wr ? wr.lineHeight : 0) - 2.6 * u, bot = Math.max(by + 2.6 * u, k.h - 4.4 * u);
const bx = 3.5 * u + 1.5 * u;
const band = rect({ x: bx, y: top, width: k.w - bx * 2, height: bot - top, rx: n(1.6 * u), fill: k.tone(k.toneName) });
return band + defaultText(k, role, str, { ...o, color: k.colors.reverse });
}
const original = (id) => getGlyph(id)?.draw;
const __default = defineTheme({
id: 'mono',
title: 'Mono',
description: 'Maximal contrast for low vision and bright rooms: pure black and white, AAA text, heavy frames, reversed labels for on, shape-coded alerts, ghosted disabled keys, bold type.',
tags: ['accessibility', 'high contrast', 'low vision', 'black', 'white', 'aaa', 'dark', 'light'],
modes: { dark: NIGHT, light: DAY },
defaultMode: 'dark',
tones: { idle: 'ink', active: 'ink', busy: 'ink', off: 'dim' },
roles: {
line: { color: 'ink', width: 3.4 },
fill: { color: 'ink' },
accent: { color: (k, tone) => (tone === 'idle' || tone === 'active' || tone === 'busy' ? k.colors.ink : k.tone(tone)), width: 3.4 },
dim: { color: 'ink', width: 2.6 },
spark: { color: (k, tone) => (tone === 'idle' || tone === 'active' || tone === 'busy' ? k.colors.ink : k.tone(tone)) },
},
type: {
eyebrow: { size: 9.5, weight: 700, caps: true, tracking: 0.06, color: 'muted' },
label: { size: 12.5, weight: 700, caps: false, tracking: 0.005, color: 'ink', baseline: 8 },
value: { size: 24, weight: 700, tabular: true, tracking: -0.01, color: 'ink' },
hero: { size: 32, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
caption: { size: 9.5, weight: 600, color: 'muted' },
},
background: face,
surface: face,
paintGlyph: paintMono,
text: monoText,
glyphBox(k, { labeled }) {
const m = Math.min(k.w, k.h);
const size = labeled ? m * 0.54 : m * 0.74;
return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.4 : k.h / 2) - size / 2, size };
},
press(k, { pressed, age }) {
const dur = 0.16;
if (!pressed && !(age < dur)) return null;
const e = pressed ? 1 : 1 - outCubic(clamp(age / dur));
const u = k.m.u, cx = k.w / 2, cy = k.h / 2, sc = 1 - 0.06 * e, rw = 5 * u;
return {
transform: `translate(${n(cx)} ${n(cy)}) scale(${n(sc, 4)}) translate(${n(-cx)} ${n(-cy)})`,
under: rect({ width: k.w, height: k.h, fill: k.colors.face }),
overlay: path(frameRect(k, 0.5 * u, rw), { fill: 'none', stroke: k.colors.ink, strokeWidth: n(rw), strokeOpacity: e < 1 ? n(e, 3) : null }),
};
},
glyphs: {
cpu(g, s) {
if (s.state !== 'busy' && s.state !== 'idle') return original('cpu')(g, s);
g.rect(12.5, 12.5, 23, 23, { r: 3 });
for (const p of [19.5, 28.5]) {
g.line(p, 7, p, 11.5, { weight: 0.9 });
g.line(p, 36.5, p, 41, { weight: 0.9 });
g.line(7, p, 11.5, p, { weight: 0.9 });
g.line(36.5, p, 41, p, { weight: 0.9 });
}
const count = s.state === 'busy' ? Math.max(1, Math.ceil(clamp(s.level) * 4 - 1e-9)) : 0;
const k = arrive(s.since, 0.25);
[[17.5, 17.5], [25, 17.5], [25, 25], [17.5, 25]].forEach(([x, y], i) => {
if (i < count) g.rect(x, y, 5.5, 5.5, { r: 1, role: 'fill', opacity: i === count - 1 ? k : 1 });
else g.rect(x + 0.6, y + 0.6, 4.3, 4.3, { r: 0.8, role: 'dim', weight: 0.5 });
});
},
broadcast(g, s) {
if (s.state !== 'live' && s.state !== 'offline') return original('broadcast')(g, s);
const live = s.state === 'live';
if (live) g.circle(24, 24, 4.6, { role: 'accent', fill: true });
else g.circle(24, 24, 4, { role: 'line', weight: 0.75 });
[10, 16.5].forEach((r, i) => {
const role = live ? (i ? 'line' : 'accent') : 'dim';
g.arc(24, 24, r, 44, 136, { role, weight: live ? 1 : 0.85 });
g.arc(24, 24, r, 224, 316, { role, weight: live ? 1 : 0.85 });
});
},
clock(g, s) {
g.circle(24, 24, 16.5);
for (const a of [0, 90, 180, 270]) {
const [x1, y1] = g.polar(24, 24, 11.5, a), [x2, y2] = g.polar(24, 24, 14, a);
g.line(x1, y1, x2, y2, { weight: 0.9, cap: 'butt' });
}
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
const hand = (deg, len, o) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, o); };
hand(h * 30, 8, { weight: 1.2 });
hand(m * 6, 11.5, { role: 'accent', weight: 0.95 });
g.circle(24, 24, 2.4, { role: 'fill' });
},
volume(g, s) {
if (s.state !== 'on' && s.state !== 'muted') return original('volume')(g, s);
g.polygon([[8, 19], [15, 19], [23, 11.5], [23, 36.5], [15, 29], [8, 29]], { role: 'line', join: 'round' });
if (s.state === 'muted') {
const k = arrive(s.since, 0.2);
if (k < 0.05) return;
g.line(29.5, 18.5, 29.5 + 11 * k, 18.5 + 11 * k, { role: 'accent' });
g.line(40.5, 18.5, 40.5 - 11 * k, 18.5 + 11 * k, { role: 'accent' });
return;
}
const lv = Math.round(clamp(s.level) * 3);
[7.5, 12.5, 17.5].forEach((r, i) => { if (i < lv) g.arc(23, 24, r, 52, 128, { role: i ? 'accent' : 'line' }); else g.arc(23, 24, r, 70, 110, { role: 'dim', weight: 0.6, dash: [1.4, 2.4] }); });
},
},
});
};
__d[240] = function (__ns) {
const { defineTheme, defaultText, defaultGlyphBox, bezelCorner } = __m(14);
const { rect, path, url, linearGradient, radialGradient, n, P, roundRectPath } = __m(5);
const { mix } = __m(4);
const { clamp, lerp, outExpo, pulse, phase } = __m(12);
const { hash } = __m(1);
const { getGlyph } = __m(231);
const { layered, onePen, isLettering, minSide, strokeA, fillA, coarse } = __m(236);
__e(__ns, { "current": () => current, "gas": () => gas, "default": () => __default }, [], ["current","default","gas"]);
const NIGHT = {
bg: '#030304', surface: '#0c0b10', surface2: '#050508', line: '#1d1b25',
ink: '#fbf2ff', muted: '#aea7c2', dim: '#76718a',
accent: '#ff4fd2', accent2: '#3ef0ff', pos: '#5cff9d', info: '#4db5ff', warn: '#ffb02e', neg: '#ff3b55', crit: '#ff2f8f',
edge: '#ffffff', edgeOpacity: 0.05, beam: '#ffffff', beamOpacity: 0.5, sheenOpacity: 0,
spectrum: { l: 0.76, c: 0.19 },
};
const DAY = {
bg: '#ebe7e1', surface: '#f7f5f1', surface2: '#e9e4dd', line: '#cbc3b8',
ink: '#1b1524', muted: '#575064', dim: '#8b8594',
accent: '#cf1588', accent2: '#00839f', pos: '#00845a', info: '#1d6ccc', warn: '#a35a00', neg: '#c81e3a', crit: '#a8137a',
edge: '#ffffff', edgeOpacity: 0.7, beam: '#cf1588', beamOpacity: 0.3, sheenOpacity: 0,
spectrum: { l: 0.56, c: 0.22 },
};
const GLASS_NIGHT = '#635e71'; 
const GLASS_DAY = '#dcd7cf', RIM_DAY = '#7b7369', SHADOW_DAY = '#2b1d12';
const DAY_WIDTH = 1.18; 
const TONE_CURRENT = { idle: 0.74, active: 1, ok: 0.92, info: 0.92, warn: 0.92, neg: 0.92, alert: 1, crit: 1, busy: 0.6, off: 0 };
function current(k, tone) {
const base = TONE_CURRENT[tone] ?? 0.85;
if ((tone !== 'alert' && tone !== 'crit') || k.ctx.reduced) return base;
const t = k.ctx.t, crit = tone === 'crit';
const slot = Math.floor(phase(t, 2.4) * 24);
if (hash(slot, crit ? 11 : 5) < (crit ? 0.16 : 0.08)) return 0.2;
return lerp(0.55, 1, pulse(t, crit ? 0.8 : 1.2));
}
function gas(ctx) {
if (ctx.reduced) return ctx.pressed ? 0.55 : 1;
if (ctx.pressed) return 0.08;
const a = ctx.pressAge;
if (!(a < 0.62)) return 1;
if (a < 0.08) return 1.3;
if (a < 0.18) return 0.12;
if (a < 0.26) return 0.95;
if (a < 0.34) return 0.36;
return lerp(0.72, 1, outExpo(clamp((a - 0.34) / 0.28)));
}
const switched = (op) => (op >= 0.5 ? 1 : 0.1);
const coreOf = (c) => mix(c, '#ffffff', 0.68);
function nightTube(p, st, L) {
const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const vis = clamp(op * 3);
const lit = L * (st.lit ?? 1) * switched(op);
const c = st.color, so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
const out = [];
const tube = (w) => {
if (lit > 0.02) {
out.push({ layer: 0, a: strokeA(c, w * 5.4, 0.06 * lit, so), soft: true });
out.push({ layer: 0, a: strokeA(c, w * 3.3, 0.1 * lit, so), soft: true });
out.push({ layer: 1, a: strokeA(c, w * 2, 0.24 * Math.min(1.25, lit), so), soft: true });
}
if (lit < 0.99) out.push({ layer: 2, a: strokeA(GLASS_NIGHT, w, vis, so) });
if (lit > 0.02) out.push({ layer: 3, a: strokeA(c, w, Math.min(1, lit), so) });
if (lit > 0.25) out.push({ layer: 4, a: strokeA(coreOf(c), w * 0.42, clamp(lit * 1.2 - 0.25), so) });
if (lit < 0.6) out.push({ layer: 5, a: strokeA('#ffffff', w * 0.22, 0.24 * vis * (1 - lit / 0.6), so) });
};
if (!p.fill) { tube((st.width ?? 2.4) * (p.weight ?? 1)); return out; }
if (isLettering(p) || p.role === 'spark' || minSide(p) < 8.5) {
if (lit > 0.02) {
out.push({ layer: 0, a: strokeA(c, 4.2, 0.08 * lit, so), soft: true });
out.push({ layer: 1, a: strokeA(c, 1.8, 0.24 * Math.min(1.25, lit), so), soft: true });
}
if (lit < 0.99) out.push({ layer: 2, a: fillA(GLASS_NIGHT, vis) });
if (lit > 0.02) out.push({ layer: 3, a: fillA(c, Math.min(1, lit)) });
if (lit > 0.25) out.push({ layer: 4, a: fillA(coreOf(c), clamp(lit * 0.75 - 0.2)) });
return out;
}
if (lit > 0.02) out.push({ layer: 1, a: fillA(c, 0.1 * Math.min(1, lit)), soft: true });
tube((st.width ?? 2.2) * (p.weight ?? 1));
return out;
}
function dayTube(p, st, L) {
const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const vis = clamp(op * 3);
const lit = L * (st.lit ?? 1) * switched(op);
const c = st.color, so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
const on = clamp(lit);
const glassOf = lit > 0.02 ? mix(mix(GLASS_DAY, c, 0.55 + 0.45 * on), '#000000', 0.06) : GLASS_DAY;
const rim = lit > 0.02 ? mix(c, '#000000', 0.5) : RIM_DAY;
const hot = mix(c, '#ffffff', 0.5);
const cast = 0.85 + 0.15 * Math.min(1.25, lit);
const out = [];
const tube = (w) => {
out.push({ layer: 0, a: strokeA(SHADOW_DAY, w * 1.25, 0.24 * vis, so), soft: true }); 
if (lit > 0.02) {
out.push({ layer: 1, a: strokeA(c, w * 7.5, 0.11 * on * cast, so), soft: true }); 
out.push({ layer: 1, a: strokeA(c, w * 3.8, 0.24 * on * cast, so), soft: true });
}
out.push({ layer: 2, a: strokeA(rim, w * 1.24, vis, so) });
out.push({ layer: 3, a: strokeA(glassOf, w * 0.96, vis, so) });
if (lit > 0.25) out.push({ layer: 4, a: strokeA(hot, w * 0.4, on * 0.95, so) }); 
out.push({ layer: 5, a: strokeA('#ffffff', w * 0.17, 0.8 * vis, so) }); 
};
const W0 = (st.width ?? 2.4) * DAY_WIDTH * (p.weight ?? 1);
if (!p.fill) { tube(W0); return out; }
if (isLettering(p) || p.role === 'spark' || minSide(p) < 8.5) {
out.push({ layer: 0, a: fillA(SHADOW_DAY, 0.22 * vis), soft: true });
if (lit > 0.02) out.push({ layer: 1, a: strokeA(c, 3.4, 0.2 * on, so), soft: true });
out.push({ layer: 2, a: { ...fillA(glassOf, vis), stroke: rim, strokeWidth: 0.9, strokeLinejoin: 'round' } });
if (lit > 0.25) out.push({ layer: 4, a: fillA(hot, on * 0.45) });
return out;
}
if (lit > 0.02) out.push({ layer: 1, a: fillA(c, 0.12 * on), soft: true });
tube((st.width ?? 2.2) * DAY_WIDTH * (p.weight ?? 1));
return out;
}
function paintNeon(k, pen, { tone, styleOf }) {
const L = current(k, tone) * gas(k.ctx);
const tubeOf = k.dark ? nightTube : dayTube;
return layered(pen, (p) => tubeOf(p, styleOf(p), L), { layers: 6, offsets: k.dark ? { 5: [-0.4, -0.45] } : { 0: [1.5, 2.3], 5: [-0.4, -0.5] } });
}
function notch(k, x, y, w, tone, L) {
const s = Math.min(w, k.h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h: k.h }); 
const d = P().M(X - s, Y).H(X).V(Y + s).Z().d;
k.add(path(d, { fill: k.tone(tone), fillOpacity: n(clamp(k.dark ? 0.35 + 0.6 * L : 0.9), 3) }));
}
function backing(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, ctx = k.ctx, key = ctx.kind === 'key';
const L = current(k, tone) * gas(ctx);
const b = k.id('back');
if (k.dark) {
k.def(radialGradient(b, [[0, C.surface], [1, C.surface2]], { cx: 0.5, cy: key ? 0.4 : 0.5, r: 0.8 }));
k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
} else {
k.def(linearGradient(b, [[0, C.surface], [1, C.surface2]], { x1: 0, y1: 0, x2: 0.25, y2: 1 }));
k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
const hb = Math.max(9, 12.5 * k.m.u), wb = hb * 2.2, lw = Math.max(1, k.m.hair * 1.2);
const faces = P(), mortar = P(), lip = P();
for (let r = 0, yy = y; yy < y + h; r++, yy += hb) {
const x0 = x + (r % 2 ? wb / 2 : wb * 0.15) - wb;
for (let i = 0, xx = x0; xx < x + w; i++, xx += wb) {
if ((i + r * 2 + Math.floor(hash(r, i) * 3)) % 3 === 0) { const a = Math.max(x, xx + lw), e = Math.min(x + w, xx + wb - lw); if (e > a) faces.M(a, yy + lw).H(e).V(Math.min(y + h, yy + hb - lw)).H(a).Z(); }
if (xx > x && xx < x + w) mortar.M(xx, yy).V(Math.min(y + h, yy + hb));
}
if (r > 0) { mortar.M(x, yy).H(x + w); lip.M(x, yy + lw).H(x + w); }
}
if (faces.d) k.add(path(faces.d, { fill: '#cbbfb0', fillOpacity: 0.16 }));
k.add(path(mortar.d, { fill: 'none', stroke: '#6b5d4f', strokeWidth: n(lw), strokeOpacity: 0.2 }));
k.add(path(lip.d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(lw), strokeOpacity: 0.7 }));
const sun = k.id('sun');
k.def(linearGradient(sun, [[0, '#ffffff', 0.55], [0.5, '#ffffff', 0]], { x1: 0, y1: 0, x2: 0.6, y2: 1 }));
k.add(rect({ x, y, width: w, height: h, fill: url(sun) }));
}
if (L > 0.02) {
const c = k.tone(tone), sp = k.id('spill');
const a = (k.dark ? 0.22 : 0.28) * Math.min(1.25, L) * (tone === 'idle' ? 0.6 : 1);
k.def(radialGradient(sp, [[0, c, a], [0.55, c, a * 0.3], [1, c, 0]], { cx: 0.5, cy: key ? 0.42 : 0.5, r: key ? 0.62 : 0.75 }));
k.add(rect({ x, y, width: w, height: h, fill: url(sp) }));
}
const e = k.m.hair;
if (k.dark) k.add(rect({ x: x + e / 2, y: y + e / 2, width: w - e, height: h - e, rx: k.m.radius, fill: 'none', stroke: '#ffffff', strokeWidth: n(e), strokeOpacity: 0.05 }));
else k.add(rect({ x: x + e / 2, y: y + e / 2, width: w - e, height: h - e, rx: k.m.radius, fill: 'none', stroke: '#4a3f35', strokeWidth: n(e), strokeOpacity: 0.12 }));
if (tone === 'alert' || tone === 'crit') notch(k, x, y, w, tone, L);
if (tone === 'busy') chaser(k, x, y, w, h);
}
function chaser(k, x, y, w, h) {
const i = (k.m.bleed ?? 4 * k.m.u) + k.m.hair * 0.5, r = Math.max(k.m.radius - i * 0.5, k.m.radius * 0.5), ww = w - i * 2, hh = h - i * 2;
const d = roundRectPath(x + i, y + i, ww, hh, r);
const per = 2 * (ww + hh - 4 * r) + 2 * Math.PI * r, seg = per * 0.14;
const off = n(-phase(k.ctx.reduced ? 0 : k.ctx.t, 1.2) * per);
const c = k.dark ? '#ffffff' : k.colors.ink;
const dash = `${n(seg)} ${n(per - seg)}`;
if (k.dark) k.add(path(d, { fill: 'none', stroke: k.colors.accent2, strokeWidth: n(k.m.line * 3.2), strokeOpacity: 0.16, strokeDasharray: dash, strokeDashoffset: off, strokeLinecap: 'round' }));
k.add(path(d, { fill: 'none', stroke: c, strokeWidth: n(k.m.line), strokeOpacity: k.dark ? 0.9 : 0.7, strokeDasharray: dash, strokeDashoffset: off, strokeLinecap: 'round' }));
}
function neonText(k, role, str, o = {}) {
const markup = defaultText(k, role, str, o);
const tone = k.toneName;
const L = current(k, tone) * gas(k.ctx);
const spec = o.color ?? k.theme.type[role]?.color;
if (L < 0.05 || spec === 'dim' || spec === 'muted' || role === 'caption') return markup;
const st = k.typeStyle(role, o);
const hc = k.tone(tone);
const bare = markup.replace(/ (stroke|stroke-width|stroke-linejoin|fill-opacity|opacity)="[^"]*"/g, '').replace(/ d="([^"]*)"/g, (m, d) => ` d="${coarse(d, 0)}"`);
const halo = (w, op) => bare.replace(/ fill="(#[0-9a-fA-F]{6})"/g, ` fill="${hc}" stroke="${hc}" stroke-width="${n(w)}" stroke-linejoin="round" opacity="${n(op * Math.min(1, L), 3)}"`);
const u = k.m.u;
let pool = '';
if (k.dark && role === 'label' && !o.x && !o.align) {
const id = k.id('pool'), cy = (o.y ?? k.h - (st.baseline ?? 6.5) * u) - st.size * 0.36;
k.def(radialGradient(id, [[0, hc, n(0.2 * Math.min(1, L), 3)], [1, hc, 0]]));
pool = `<ellipse cx="${n(k.w / 2)}" cy="${n(cy)}" rx="${n(k.w * 0.4)}" ry="${n(st.size * 1.05)}" fill="url(#${id})"/>`;
}
return pool + (k.dark ? halo(Math.min(st.size * 0.42, 3.6 * u), 0.15) : halo(Math.min(st.size * 0.36, 3 * u), 0.08)) + markup;
}
const strike = (s) => (s >= 0.4 ? 1 : s < 0.08 ? 0.9 : s < 0.16 ? 0.2 : s < 0.24 ? 0.9 : s < 0.32 ? 0.3 : 1);
const draw = (id) => getGlyph(id)?.draw;
const __default = defineTheme({
id: 'neon',
title: 'Neon',
description: 'Glass tubes on black: glyphs glow as gas-filled neon with white-hot cores; tubes switch rather than fade, alerts buzz, and a press re-strikes the gas.',
tags: ['neon', 'glow', 'night', 'sign', 'dark', 'light'],
modes: { dark: NIGHT, light: DAY },
defaultMode: 'dark',
tones: { idle: 'accent', active: 'tint', busy: 'muted' },
roles: {
line: { color: 'tone', width: 2.4, lit: 1 },
fill: { color: 'tone', width: 2.2, lit: 1 },
accent: { color: 'tone', width: 2.6, lit: 1.1, glow: 1 },
dim: { color: 'tone', width: 2, lit: 0.62, opacity: 1 },
spark: { color: 'tone', lit: 1.25, glow: 1 },
},
type: {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.2, color: 'muted' },
label: { size: 10, weight: 600, caps: true, tracking: 0.09, color: 'ink' },
value: { size: 22, weight: 600, tabular: true, tracking: 0.01, color: 'ink' },
hero: { size: 30, weight: 600, tabular: true, tracking: -0.01, color: 'ink' },
caption: { size: 8.5, weight: 400, tracking: 0.02, color: 'muted' },
},
background: backing,
surface: backing,
paintGlyph: paintNeon,
paint(k, prim, style) {
return paintNeon(k, onePen(prim), { tone: k.toneName, styleOf: () => style });
},
text: neonText,
glyphBox(k, o) {
const b = defaultGlyphBox(k, o), s = 0.96;
return { x: b.x + (b.size * (1 - s)) / 2, y: b.y + (b.size * (1 - s)) / 2, size: b.size * s };
},
press(k, { pressed, age }) {
if (!pressed && !(age < 0.62)) return null;
const hold = pressed ? 1 : 1 - outExpo(clamp(age / 0.18));
const s = 1 - 0.024 * hold, cx = k.w / 2, cy = k.h / 2;
let overlay = '';
if (!pressed && age < 0.08 && !k.ctx.reduced) {
const id = k.id('strike'), c = mix(k.tone(k.toneName === 'off' || k.toneName === 'idle' ? 'active' : k.toneName), '#ffffff', 0.45);
k.def(radialGradient(id, [[0, c, k.dark ? 0.4 : 0.25], [0.6, c, 0.07], [1, c, 0]], { cx: 0.5, cy: 0.42, r: 0.64 }));
overlay = rect({ width: k.w, height: k.h, fill: url(id) });
}
return {
transform: hold > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#bdb6ab' }),
overlay,
};
},
glyphs: {
'play-pause'(g, s) {
if (s.state !== 'paused' && s.state !== 'playing') return draw('play-pause')(g, s);
const playing = s.state === 'playing';
const on = s.since >= 0.4 ? 1 : strike(s.since), off = 1 - clamp(s.since / 0.1);
const tri = (op) => g.polygon([[16.5, 11.5], [36.5, 24], [16.5, 36.5]], { role: 'fill', join: 'round', opacity: op });
const bars = (op) => { g.line(18, 12.5, 18, 35.5, { role: 'fill', weight: 2, opacity: op }); g.line(30, 12.5, 30, 35.5, { role: 'fill', weight: 2, opacity: op }); };
if (off > 0) (playing ? tri : bars)(off);
(playing ? bars : tri)(on);
},
broadcast(g, s) {
if (s.state !== 'live' && s.state !== 'offline') return draw('broadcast')(g, s);
const live = s.state === 'live';
g.circle(24, 24, 3.8, { role: live ? 'accent' : 'fill', fill: true });
const step = Math.floor(s.phase(1.8) * 4);
const lit = live ? [[1, 0], [1, 1], [0, 1], [0, 0]][step] : [1, 1];
[9, 15.5].forEach((r, i) => {
const op = lit[i] ? 1 : 0.2;
g.arc(24, 24, r, 42, 138, { role: i ? 'dim' : 'line', opacity: op });
g.arc(24, 24, r, 222, 318, { role: i ? 'dim' : 'line', opacity: op });
});
},
bulb(g, s) {
if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
const on = s.state === 'on';
g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
g.line(19, 32.5, 19, 35.5);
g.line(29, 32.5, 29, 35.5);
g.line(19, 35.5, 29, 35.5);
g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
g.polyline([[20.5, 28], [22.5, 23.5], [24, 27], [25.5, 23.5], [27.5, 28]], { role: on ? 'accent' : 'dim', weight: 0.8, opacity: on ? 1 : 0.3 });
if (!on) return;
const n0 = Math.floor(s.phase(2.4) * 8); 
[-60, -30, 0, 30, 60].forEach((a, i) => {
const [x1, y1] = g.polar(24, 22.5, 13, a), [x2, y2] = g.polar(24, 22.5, 16, a);
g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.8, opacity: n0 < 7 && i <= n0 ? 1 : 0.2 });
});
},
},
});
};
__d[241] = function (__ns) {
const { defineTheme, defaultText, bezelCorner } = __m(14);
const { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } = __m(5);
const { mix } = __m(4);
const { clamp, lerp, outCubic, pulse, phase, arrive } = __m(12);
const { layeredPaint, strokeA, fillA, halftone, fibers, strHash } = __m(238);
const { capHeight, wrapText } = __m(11);
const { getGlyph } = __m(231);
__e(__ns, { "default": () => __default, "paperStock": () => stock, "paperCard": () => card }, [], ["default","paperCard","paperStock"]);
const DAY = {
bg: '#e4d9c6', surface: '#f7f2e7', surface2: '#ede4d1', line: '#d6c8ad',
ink: '#1d1a16', muted: '#5a5043', dim: '#6e6354',
accent: '#c23b22', accent2: '#24508c', pos: '#3a6b2a', info: '#245b9a', warn: '#9b5f00', neg: '#b52a1c', crit: '#8e1b3d',
edge: '#ffffff', edgeOpacity: 0.8, beam: '#c23b22', beamOpacity: 0.5, sheenOpacity: 0,
spectrum: { l: 0.5, c: 0.13 },
shadow: '#6f5d42', fiber: '#8d7a5c', under: '#b9ab92', proof: '#5f5547',
};
const NIGHT = {
bg: '#0c0b0a', surface: '#1d1b18', surface2: '#141311', line: '#3a352d',
ink: '#f3ecdc', muted: '#bcb19d', dim: '#9a8f7d',
accent: '#d9935e', accent2: '#e3c27a', pos: '#9cc58a', info: '#8fb5e8', warn: '#e8b45a', neg: '#ef7a62', crit: '#f06b8d',
edge: '#f3ecdc', edgeOpacity: 0.09, beam: '#d9935e', beamOpacity: 0.5, sheenOpacity: 0,
spectrum: { l: 0.76, c: 0.11 },
shadow: '#000000', fiber: '#d8ccb4', under: '#000000', proof: '#b0a593',
};
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'alert', neg: 'alert', alert: 'alert', crit: 'alert', busy: 'busy', off: 'blind' };
const stateOf = (tone) => STATE[tone] || 'idle';
const inkOf = (k, tone) => (tone === 'idle' || tone === 'active' ? k.ctx.tint : k.tone(tone));
const breath = (k) => (k.ctx.since >= 10 || k.ctx.reduced ? 1 : lerp(0.55, 1, pulse(k.ctx.t, 1)));
const MIS = [0.55, -0.4], LIP = 0.8;
function foil(k, c) {
const memo = k._d5foil || (k._d5foil = new Map());
let id = memo.get(c);
if (!id) {
id = k.id('foil');
k.def(linearGradient(id, [[0, mix(c, '#ffffff', 0.5)], [0.34, c], [0.6, mix(c, '#000000', 0.3)], [0.82, mix(c, '#ffffff', 0.28)], [1, c]], { x1: 8, y1: 6, x2: 40, y2: 42, gradientUnits: 'userSpaceOnUse' }));
memo.set(c, id);
}
return url(id);
}
function foilRect(k, c, { x, y, w, h }) {
const id = k.id('foilr');
k.def(linearGradient(id, [[0, mix(c, '#ffffff', 0.45)], [0.4, c], [0.62, mix(c, '#000000', 0.28)], [1, mix(c, '#ffffff', 0.2)]], { x1: n(x), y1: n(y), x2: n(x + w), y2: n(y + h), gradientUnits: 'userSpaceOnUse' }));
return url(id);
}
function stock(k, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, u = k.m.u, key = k.ctx.kind === 'key';
const g = k.id('stock');
k.def(radialGradient(g, [[0, k.dark ? C.surface : mix(C.surface, '#ffffff', 0.45)], [0.5, C.surface], [1, C.surface2]], { cx: 0.2, cy: 0, r: 1.25, gradientTransform: w > h * 1.6 ? `scale(${n(h / w, 3)} 1)` : null }));
k.add(rect({ x, y, width: w, height: h, fill: url(g) }));
const count = key ? Math.round(5 + Math.min(w, h) / 18) : Math.min(26, Math.round(6 + (w * h) / 4200));
const tex = fibers(strHash(k.idPrefix) ^ Math.round(w * 31 + h), { x, y, w, h, count, len: 7 * u, fleck: Math.max(0.5, 0.45 * u) });
k.add(path(tex.fibers, { fill: 'none', stroke: C.fiber, strokeWidth: n(Math.max(0.5, 0.32 * u)), strokeOpacity: k.dark ? 0.1 : 0.16, strokeLinecap: 'round' }));
if (tex.flecks) k.add(path(tex.flecks, { fill: C.fiber, fillOpacity: k.dark ? 0.14 : 0.26 }));
k.add(rect({ x, y, width: w, height: k.m.hair, fill: C.edge, fillOpacity: C.edgeOpacity }));
k.add(rect({ x, y: y + h - 1.6 * u, width: w, height: 1.6 * u, fill: C.shadow, fillOpacity: k.dark ? 0.3 : 0.07 }));
k.add(rect({ x, y: y + h - 0.7 * u, width: w, height: 0.7 * u, fill: C.shadow, fillOpacity: k.dark ? 0.3 : 0.07 }));
}
function frame(k, s, color, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, u = k.m.u;
const fi = 4.25 * u, r = Math.max(1.5 * u, k.m.radius - fi * 0.85);
const d = roundRectPath(x + fi, y + fi, w - fi * 2, h - fi * 2, r);
const hw = Math.max(1, 0.62 * u);
if (s === 'blind') {
k.add(path(d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(hw * 1.3), strokeOpacity: k.dark ? 0.06 : 0.9, transform: `translate(0 ${n(0.55 * u)})` }));
k.add(path(d, { fill: 'none', stroke: C.shadow, strokeWidth: n(hw), strokeOpacity: k.dark ? 0.5 : 0.16 }));
return;
}
if (s === 'busy') {
const per = 2 * (w + h - fi * 4) - (8 - 2 * Math.PI) * r;
const dash = 2.4 * u, gap = 1.6 * u;
const steps = Math.max(1, Math.round(per / (dash + gap)));
const cell = per / steps;
k.add(path(d, { fill: 'none', stroke: C.muted, strokeWidth: n(hw * 1.2), strokeOpacity: 0.8, strokeDasharray: `${n(cell * 0.6)} ${n(cell * 0.4)}`, strokeDashoffset: n(-phase(k.ctx.t, 0.8) * cell), strokeLinecap: 'butt' }));
return;
}
const lit = s === 'on' || s === 'alert';
const paint = k.dark && lit ? foilRect(k, color, { x: x + fi, y: y + fi, w: w - fi * 2, h: h - fi * 2 }) : lit ? color : C.muted;
const op = s === 'alert' ? 0.65 + 0.35 * breath(k) : lit ? 0.95 : (k.dark ? 0.32 : 0.36);
k.add(path(d, { fill: 'none', stroke: paint, strokeWidth: n(lit ? hw * 1.45 : hw), strokeOpacity: op < 1 ? n(op, 3) : null }));
if (s === 'alert') {
const i2 = fi + 1.9 * u;
k.add(path(roundRectPath(x + i2, y + i2, w - i2 * 2, h - i2 * 2, Math.max(1, r - 1.9 * u)), { fill: 'none', stroke: paint, strokeWidth: n(hw * 0.7), strokeOpacity: n(op * 0.85, 3) }));
return;
}
if (k.ctx.kind !== 'key') return;
const bw = (s === 'on' ? 16 : 12) * u, bh = (s === 'on' ? 2.2 : 1.7) * u;
const bx = x + w / 2 - bw / 2, by = y + h - fi - bh / 2;
k.add(rect({ x: bx - 1.2 * u, y: by - 0.3 * u, width: bw + 2.4 * u, height: bh + 0.6 * u, fill: C.surface2 }));
k.add(rect({ x: bx, y: by, width: bw, height: bh, fill: k.dark && s === 'on' ? foilRect(k, k.ctx.tint, { x: bx, y: by, w: bw, h: bh }) : k.ctx.tint, fillOpacity: s === 'on' ? null : 0.7 }));
}
function dogEar(k, color, { x = 0, y = 0, w = k.w } = {}) {
const C = k.colors, s = Math.min(14 * k.m.u, w * 0.2);
const bz = bezelCorner(k, { x, y, w, h: k.h }), X = bz.X;
y = bz.Y;
k.add(polygon([[X - s, y], [X, y], [X, y + s]], { fill: k.dark ? '#000000' : mix(C.surface2, C.shadow, 0.28) }));
k.add(polygon([[X - s + 0.6 * k.m.u, y + 0.9 * k.m.u], [X + 0.4 * k.m.u, y + s + 1.1 * k.m.u], [X - s + 0.6 * k.m.u, y + s + 1.1 * k.m.u]], { fill: C.shadow, fillOpacity: k.dark ? 0.6 : 0.22 }));
const fl = k.id('flap');
k.def(linearGradient(fl, [[0, mix(color, '#ffffff', k.dark ? 0.1 : 0.25)], [1, mix(color, '#000000', 0.12)]], { x1: 1, y1: 0, x2: 0, y2: 1 }));
k.add(polygon([[X - s, y], [X, y + s], [X - s, y + s]], { fill: url(fl) }));
k.add(path(`M${n(X - s)} ${n(y)}L${n(X)} ${n(y + s)}`, { stroke: '#ffffff', strokeWidth: n(Math.max(0.75, 0.4 * k.m.u)), strokeOpacity: k.dark ? 0.25 : 0.7 }));
}
function card(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const s = stateOf(tone), color = inkOf(k, tone), u = k.m.u;
stock(k, { x, y, w, h });
if (s === 'on' || s === 'alert') {
const fi = 4.25 * u, key = k.ctx.kind === 'key';
const scr = key ? { pitch: Math.max(4, 0.1 * Math.min(w, h)), from: 0.12, maxR: 0.32, gamma: 1 } : { pitch: Math.max(5, 0.075 * h), from: 0.5, maxR: 0.3, gamma: 1.2 };
k.add(halftone({ x: x + fi, y: y + fi, w: w - fi * 2, h: h - fi * 2, ...scr, color, opacity: (k.dark ? 0.5 : 0.42) * (s === 'alert' ? breath(k) : 1) }));
}
frame(k, s, color, { x, y, w, h });
if (s === 'alert') dogEar(k, color, { x, y, w });
}
function paintPrint(k, pen, { tone, styleOf }) {
const C = k.colors, s = stateOf(tone), night = k.dark;
return layeredPaint(pen, (p) => {
const st = styleOf(p);
const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const w = (st.width ?? 2.6) * (p.weight ?? 1);
const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
const fillish = p.fill;
const A = (color, width, o) => (fillish ? fillA(color, o) : strokeA(color, width, o, so));
if (s === 'blind') {
const out = [{ layer: 3, a: A(C.proof, w * 0.92, op) }];
if (!night) out.unshift({ layer: 0, a: A('#ffffff', w, op) });
return out;
}
const spot = p.role === 'accent' || p.role === 'spark';
const color = spot && night ? foil(k, st.color) : st.color;
if (p.role === 'spark') return [{ layer: 5, a: fillA(color, op) }];
const out = [];
if (!night) out.push({ layer: spot ? 1 : 0, a: A('#ffffff', w, (spot ? 0.7 : 0.9) * op) });
if (!spot && p.role !== 'dim') out.push({ layer: 2, a: fillish ? { ...strokeA(st.color, night ? 1.4 : 0.9, (night ? 0.16 : 0.2) * op, so) } : strokeA(st.color, w + (night ? 1.5 : 0.9), (night ? 0.13 : 0.17) * op, so) });
out.push({ layer: spot ? 4 : 3, a: A(color, w, (spot ? 0.95 : 1) * op) });
return out;
}, { layers: 6, offsets: { 0: [0, s === 'blind' ? 0.9 : LIP], 1: [MIS[0], MIS[1] + LIP], 4: MIS, 5: MIS } });
}
function printText(k, role, str, o = {}) {
const ink = defaultText(k, role, str, o);
const s = stateOf(k.toneName);
if (ink && role === 'label' && k.ctx.kind === 'key' && (s === 'on' || s === 'alert')) return knockout(k, str, o) + ink;
return ink;
}
function knockout(k, str, o) {
const st = k.typeStyle('label', o), u = k.m.u;
const by = o.y ?? k.h - (st.baseline ?? 6.5) * u;
const lines = (o.maxLines || 1) > 1 ? wrapText(str, { maxWidth: o.maxWidth ?? k.w - (k.m.text ?? k.m.safe) * 2, size: st.size, minSize: st.size * 0.8, maxLines: o.maxLines, weight: st.weight, tracking: st.tracking, caps: st.caps }) : null;
const n0 = lines ? lines.lines.length : 1, lh = lines ? lines.lineHeight : 0;
const top = by - capHeight(st.size, st.weight) - (n0 - 1) * lh - 2.4 * u, bot = by + 2.2 * u;
const fi = 4.25 * u + Math.max(1, 0.62 * u) * 0.75;
const g = k.id('ko');
k.def(linearGradient(g, [[0, k.colors.surface2, 0], [0.12, k.colors.surface2], [0.88, k.colors.surface2], [1, k.colors.surface2, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
return rect({ x: fi, y: top, width: k.w - fi * 2, height: bot - top, fill: url(g) });
}
const original = (id) => getGlyph(id)?.draw;
const __default = defineTheme({
id: 'paper',
title: 'Paper',
description: 'Ink on warm cotton paper: letterpress cards with impressed glyphs, a spot color printed off register, halftone screens for on, dog-eared alerts. By night, white ink and foil on black card.',
tags: ['light', 'print', 'letterpress', 'paper', 'halftone', 'foil', 'warm'],
modes: { light: DAY, dark: NIGHT },
defaultMode: 'light',
tones: { idle: 'tint', active: 'tint', busy: 'muted', off: 'dim' },
roles: {
line: { color: (k, tone) => (stateOf(tone) === 'blind' ? k.colors.proof : k.colors.ink), width: 2.7 },
fill: { color: (k, tone) => (stateOf(tone) === 'blind' ? k.colors.proof : k.colors.ink) },
accent: { color: (k, tone) => inkOf(k, tone), width: 2.8 },
dim: { color: (k) => mix(k.colors.ink, k.colors.surface, k.dark ? 0.38 : 0.45), width: 2.1, opacity: 0.95 },
spark: { color: (k, tone) => inkOf(k, tone) },
},
type: {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.18, color: 'muted' },
label: { size: 10, weight: 600, caps: true, tracking: 0.08, color: 'ink', baseline: 10 },
value: { size: 22, weight: 600, tabular: true, tracking: -0.01, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, tracking: -0.03, color: 'ink' },
caption: { size: 8.5, weight: 400, color: 'muted' },
},
background: card,
surface: card,
paintGlyph: paintPrint,
text: printText,
glyphBox(k, { labeled }) {
const m = Math.min(k.w, k.h);
const size = labeled ? m * 0.54 : m * 0.7;
return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.41 : k.h / 2) - size / 2, size };
},
press(k, { pressed, age }) {
const dur = 0.36;
if (!pressed && !(age < dur)) return null;
const e = pressed ? 1 : 1 - outCubic(clamp(age / dur));
const C = k.colors, u = k.m.u;
const bite = k.id('bite'), side = k.id('bites');
k.def(linearGradient(bite, [[0, C.shadow, (k.dark ? 0.7 : 0.34) * e], [0.12, C.shadow, (k.dark ? 0.3 : 0.1) * e], [0.36, C.shadow, 0]]));
k.def(linearGradient(side, [[0, C.shadow, (k.dark ? 0.4 : 0.16) * e], [0.07, C.shadow, 0], [0.93, C.shadow, 0], [1, C.shadow, (k.dark ? 0.3 : 0.08) * e]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
let overlay = rect({ width: k.w, height: k.h, fill: url(bite) }) + rect({ width: k.w, height: k.h, fill: url(side) });
if (k.dark) {
const fi = 4.25 * u;
overlay += rect({ x: fi, y: fi, width: k.w - fi * 2, height: k.h - fi * 2, rx: Math.max(1.5 * u, k.m.radius - fi * 0.85), fill: 'none', stroke: foilRect(k, k.ctx.tint, { x: 0, y: 0, w: k.w, h: k.h }), strokeWidth: n(Math.max(1.2, 1.1 * u)), strokeOpacity: n(e, 3) });
}
return { transform: `translate(0 ${n(0.9 * u * e)})`, under: rect({ width: k.w, height: k.h, fill: C.under }), overlay };
},
glyphs: {
clock(g, s) {
g.circle(24, 24, 17, { weight: 1.05 });
g.circle(24, 24, 13.6, { role: 'dim', weight: 0.38 });
for (let i = 0; i < 12; i++) {
const a = i * 30, major = i % 3 === 0;
const [x1, y1] = g.polar(24, 24, major ? 10.2 : 11.8, a), [x2, y2] = g.polar(24, 24, 13.6, a);
g.line(x1, y1, x2, y2, { role: major ? 'line' : 'dim', weight: major ? 0.72 : 0.42, cap: 'butt' });
}
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
const ha = h * 30, ma = m * 6;
const ax = (r) => g.polar(24, 24, r, ha);
const side = (r, d) => { const [x, y] = ax(r); return g.polar(x, y, d, ha + 90); };
g.polygon([g.polar(24, 24, 2.2, ha + 180), side(4.4, 1.9), ax(9.4), side(4.4, -1.9)], { role: 'fill', join: 'round' });
const [mx, my] = g.polar(24, 24, 12.6, ma), [tx, ty] = g.polar(24, 24, 3, ma + 180);
g.line(tx, ty, mx, my, { role: 'accent', weight: 0.6 });
g.circle(24, 24, 1.7, { role: 'fill' });
g.dot(24, 24, 0.7);
},
bulb(g, s) {
if (s.state !== 'on' && s.state !== 'off') return original('bulb')(g, s);
const on = s.state === 'on';
g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
g.arc(24, 22.5, 8, 238, 300, { role: 'dim', weight: 0.42 });
g.arc(24, 22.5, 6.3, 246, 290, { role: 'dim', weight: 0.36 });
g.line(19, 32.5, 19, 35.5);
g.line(29, 32.5, 29, 35.5);
g.line(19, 35.5, 29, 35.5);
g.line(19.8, 37.6, 28.2, 37.6, { role: 'dim', weight: 0.8 });
g.line(21.5, 39.8, 26.5, 39.8, { role: 'dim' });
g.path('M21.6 32.5V27.6c0-2.3 1.1-3.4 2.4-3.4s2.4 1.1 2.4 3.4V32.5', { role: on ? 'accent' : 'dim', weight: 0.72 });
if (on) {
const k = arrive(s.since, 0.45);
[-72, -48, -24, 0, 24, 48, 72].forEach((a, i) => {
const long = i % 2 === 0, r0 = 12.8, r1 = r0 + (long ? 3.2 : 1.9) * k;
const [x1, y1] = g.polar(24, 22.5, r0, a), [x2, y2] = g.polar(24, 22.5, r1, a);
if (k > 0.02) g.line(x1, y1, x2, y2, { role: 'accent', weight: long ? 0.62 : 0.5 });
});
}
},
},
});
};
__d[242] = function (__ns) {

__e(__ns, { "FONT5": () => FONT5, "FONT3": () => FONT3, "charOf": () => charOf, "measureDots": () => measureDots, "textRuns": () => textRuns, "runsPath": () => runsPath, "pickFace": () => pickFace, "fallbackFaces": () => fallbackFaces, "fitFace": () => fitFace }, [], ["FONT3","FONT5","charOf","fallbackFaces","fitFace","measureDots","pickFace","runsPath","textRuns"]);
const rows = (s) => s.trim().split(/\s+/);
const F5 = {
A: '.###. #...# #...# ##### #...# #...# #...#',
B: '####. #...# #...# ####. #...# #...# ####.',
C: '.###. #...# #.... #.... #.... #...# .###.',
D: '####. #...# #...# #...# #...# #...# ####.',
E: '##### #.... #.... ####. #.... #.... #####',
F: '##### #.... #.... ####. #.... #.... #....',
G: '.###. #...# #.... #.### #...# #...# .####',
H: '#...# #...# #...# ##### #...# #...# #...#',
I: '### .#. .#. .#. .#. .#. ###',
J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
L: '#.... #.... #.... #.... #.... #.... #####',
M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
N: '#...# #...# ##..# #.#.# #..## #...# #...#',
O: '.###. #...# #...# #...# #...# #...# .###.',
P: '####. #...# #...# ####. #.... #.... #....',
Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
R: '####. #...# #...# ####. #.#.. #..#. #...#',
S: '.#### #.... #.... .###. ....# ....# ####.',
T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
U: '#...# #...# #...# #...# #...# #...# .###.',
V: '#...# #...# #...# #...# #...# .#.#. ..#..',
W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
Z: '##### ....# ...#. ..#.. .#... #.... #####',
0: '.###. #...# #..## #.#.# ##..# #...# .###.',
1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
2: '.###. #...# ....# ...#. ..#.. .#... #####',
3: '##### ...#. ..#.. ...#. ....# #...# .###.',
4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
5: '##### #.... ####. ....# ....# #...# .###.',
6: '..##. .#... #.... ####. #...# #...# .###.',
7: '##### ....# ...#. ..#.. .#... .#... .#...',
8: '.###. #...# #...# .###. #...# #...# .###.',
9: '.###. #...# #...# .#### ....# ...#. .##..',
' ': '... ... ... ... ... ... ...',
'!': '# # # # # . #',
'"': '#.# #.# ... ... ... ... ...',
'#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
$: '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
'%': '##... ##..# ...#. ..#.. .#... #..## ...##',
'&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
"'": '# # . . . . .',
'(': '.# #. #. #. #. #. .#',
')': '#. .# .# .# .# .# #.',
'*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
'+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
',': '.. .. .. .. .# .# #.',
'-': '.... .... .... #### .... .... ....',
'.': '. . . . . . #',
'/': '..... ....# ...#. ..#.. .#... #.... .....',
':': '. . # . # . .',
';': '.. .. .# .. .# .# #.',
'<': '...# ..#. .#.. #... .#.. ..#. ...#',
'=': '..... ..... ##### ..... ##### ..... .....',
'>': '#... .#.. ..#. ...# ..#. .#.. #...',
'?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
'@': '.###. #...# ....# .##.# #.#.# #.#.# .###.',
'[': '## #. #. #. #. #. ##',
'\\': '..... #.... .#... ..#.. ...#. ....# .....',
']': '## .# .# .# .# .# ##',
'^': '..#.. .#.#. #...# ..... ..... ..... .....',
_: '..... ..... ..... ..... ..... ..... #####',
'`': '#. .# .. .. .. .. ..',
'{': '..# .#. .#. #.. .#. .#. ..#',
'|': '# # # # # # #',
'}': '#.. .#. .#. ..# .#. .#. #..',
'~': '..... ..... .#... #.#.# ...#. ..... .....',
'·': '. . . # . . .',
'•': '... ... .#. ### .#. ... ...',
'…': '..... ..... ..... ..... ..... ..... #.#.#',
'°': '.#. #.# .#. ... ... ... ...',
'–': '.... .... .... #### .... .... ....',
'—': '..... ..... ..... ##### ..... ..... .....',
'×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
'→': '..... ..#.. ...#. ##### ...#. ..#.. .....',
'←': '..... ..#.. .#... ##### .#... ..#.. .....',
'↑': '..#.. .###. #.#.# ..#.. ..#.. ..#.. .....',
'↓': '..... ..#.. ..#.. ..#.. #.#.# .###. ..#..',
'λ': '#.... .#... .#... ..#.. .#.#. #...# #...#',
'±': '..#.. ..#.. ##### ..#.. ..#.. ..... #####',
'€': '..### .#... ####. .#... ####. .#... ..###',
'£': '..##. .#..# .#... ###.. .#... .#... #####',
'©': '.###. #...# #.### #.#.. #.### #...# .###.',
'’': '# # . . . . .',
'‘': '# # . . . . .',
'“': '#.# #.# ... ... ... ... ...',
'”': '#.# #.# ... ... ... ... ...',
'▲': '..... ..... ..#.. .###. ##### ..... .....',
'▼': '..... ..... ##### .###. ..#.. ..... .....',
'●': '..... .###. ##### ##### ##### .###. .....',
'✓': '..... ....# ...#. #.#.. .#... ..... .....',
};
const F3 = {
A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
M: '#...# ##.## #.#.# #...# #...#', N: '#..# ##.# #.## #..# #..#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
Q: '.#. #.# #.# ### .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#...# #...# #.#.# ##.## #...#', X: '#.# #.# .#. #.# #.#',
Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.',
8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
' ': '.. .. .. .. ..', '.': '. . . . #', ',': '.. .. .. .# #.', ':': '. # . # .', ';': '.. .# .. .# #.',
'-': '... ... ### ... ...', '–': '... ... ### ... ...', '—': '.... .... #### .... ....', '+': '... .#. ### .#. ...',
'/': '..# ..# .#. #.. #..', '\\': '#.. #.. .#. ..# ..#', '%': '#.# ..# .#. #.. #.#', '!': '# # # . #', '?': '##. ..# .#. ... .#.',
'·': '. . # . .', '•': '... .#. ### .#. ...', '°': '.#. #.# .#. ... ...', 'λ': '#.. .#. .#. #.# #.#',
'(': '.# #. #. #. .#', ')': '#. .# .# .# #.', '[': '## #. #. #. ##', ']': '## .# .# .# ##',
'×': '... #.# .#. #.# ...', '…': '..... ..... ..... ..... #.#.#', '#': '#.# ### #.# ### #.#', '=': '... ### ... ### ...',
"'": '# # . . .', '’': '# # . . .', '‘': '# # . . .', '"': '#.# #.# ... ... ...', '“': '#.# #.# ... ... ...', '”': '#.# #.# ... ... ...',
_: '... ... ... ... ###', '&': '.#. #.# .#. #.# .##', '@': '### #.# #.# #.. .##', '<': '..# .#. #.. .#. ..#', '>': '#.. .#. ..# .#. #..',
'*': '#.# .#. #.# ... ...', $: '.## ##. .#. .## ##.', '|': '# # # # #', '^': '.#. #.# ... ... ...', '~': '... .## ##. ... ...',
'→': '.... ..#. #### ..#. ....', '←': '.... .#.. #### .#.. ....', '↑': '.#. ### .#. .#. .#.', '↓': '.#. .#. .#. ### .#.',
'▲': '..... ..#.. .###. ##### .....', '▼': '..... ##### .###. ..#.. .....', '●': '... ### ### ### ...', '✓': '... ..# #.# .#. ...',
'±': '.#. ### .#. ... ###', '€': '.## ##. #.. ##. .##', '£': '.## .#. ### .#. ###', '©': '### #.. #.. ### ...',
};
function compile(table, h) {
const out = new Map();
for (const [ch, src] of Object.entries(table)) {
const r = rows(src);
if (r.length !== h) throw new Error(`pixfont: "${ch}" has ${r.length} rows, expected ${h}`);
const w = r[0].length;
if (r.some((x) => x.length !== w)) throw new Error(`pixfont: "${ch}" rows differ in width`);
const runs = [];
r.forEach((line, y) => { for (let x = 0; x < w; x++) if (line[x] === '#') { let e = x; while (line[e + 1] === '#') e++; runs.push([y, x, e - x + 1]); x = e; } });
out.set(String(ch), { w, runs });
}
return out;
}
const FONT5 = { id: 'f5', h: 7, space: 1, map: compile(F5, 7) };
const FONT3 = { id: 'f3', h: 5, space: 1, map: compile(F3, 5) };
const BOX5 = { w: 4, runs: [[0, 0, 4], [1, 0, 1], [1, 3, 1], [2, 0, 1], [2, 3, 1], [3, 0, 1], [3, 3, 1], [4, 0, 1], [4, 3, 1], [5, 0, 1], [5, 3, 1], [6, 0, 4]] };
const BOX3 = { w: 3, runs: [[0, 0, 3], [1, 0, 1], [1, 2, 1], [2, 0, 1], [2, 2, 1], [3, 0, 1], [3, 2, 1], [4, 0, 3]] };
function charOf(font, ch) {
const m = font.map;
return m.get(ch) || m.get(ch.toUpperCase()) || m.get(ch.normalize('NFD')[0]?.toUpperCase()) || (font === FONT3 ? BOX3 : BOX5);
}
function measureDots(str, font = FONT5, tracking = 0) {
const chars = [...String(str)];
if (!chars.length) return 0;
let w = 0;
for (const ch of chars) w += charOf(font, ch).w + font.space + tracking;
return w - font.space - tracking;
}
function textRuns(str, { font = FONT5, d = 1, x = 0, y = 0, tracking = 0 } = {}) {
const out = [];
let cx = x;
for (const ch of String(str)) {
const g = charOf(font, ch);
for (const [r, c, len] of g.runs) out.push([cx + c * d, y + r * d, len * d]);
cx += (g.w + font.space + tracking) * d;
}
return out;
}
function runsPath(runs, d) {
let s = '';
for (const [x, y, len] of runs) s += `M${x} ${y}h${len}v${d}h-${len}Z`;
return s;
}
function pickFace(capPx, { small = true } = {}) {
let best = null, score = Infinity;
for (const font of [FONT5, FONT3]) for (let d = 1; d <= 8; d++) {
const s = Math.abs(font.h * d - capPx) + (font === FONT3 && !small ? 1.5 : 0) + (font === FONT5 && small && capPx < 6.2 ? 1 : 0);
if (s < score - 1e-9) { score = s; best = { font, d }; }
}
return best;
}
function fallbackFaces(face) {
const list = [face];
for (let d = face.d - 1; d >= 1; d--) list.push({ font: face.font, d });
if (face.font === FONT5) list.push({ font: FONT3, d: Math.max(1, Math.round(face.d * 1.2)) }, { font: FONT3, d: 1 });
const seen = new Set();
return list.filter((f) => { const k = `${f.font.id}${f.d}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
function fitFace(str, face, maxWidth, tracking = 0) {
for (const f of fallbackFaces(face)) {
const w = measureDots(str, f.font, tracking) * f.d;
if (w <= maxWidth) return { ...f, text: str, width: w };
}
const f = fallbackFaces(face).pop();
let s = [...String(str)];
while (s.length > 1 && measureDots(`${s.join('')}…`, f.font, tracking) * f.d > maxWidth) s.pop();
const text = `${s.join('')}…`;
return { ...f, text, width: measureDots(text, f.font, tracking) * f.d };
}
};
__d[243] = function (__ns) {
const { path, n } = __m(5);
const { capHeight } = __m(11);
const { pickFace, fitFace, textRuns, runsPath, measureDots } = __m(242);
__e(__ns, { "bitmapText": () => bitmapText }, [], ["bitmapText"]);
function bitmapText(k, role, str, o = {}, { paint } = {}) {
const st = k.typeStyle(role, o);
const color = k.color(o.color ?? st.color);
const cap = capHeight(st.size, st.weight || 600);
const small = role === 'eyebrow' || role === 'caption';
const face0 = pickFace(cap, { small });
const safe = Math.round(k.m.safe);
const room = Math.floor(o.maxWidth ?? k.w - Math.round(k.m.text ?? k.m.safe) * 2);
const tracking = (st.tracking || 0) >= 0.1 ? 1 : 0;
let a = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : null;
const lines = [];
if ((o.maxLines || 1) > 1 && role === 'label') {
for (const f of [face0, { ...face0, d: Math.max(1, face0.d - 1) }]) {
const words = String(str).split(/\s+/);
const out = [];
let cur = '';
for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (measureDots(t, f.font, tracking) * f.d <= room || !cur) cur = t; else { out.push(cur); cur = w; } }
if (cur) out.push(cur);
if (out.length <= o.maxLines) { lines.push(...out.map((s) => fitFace(s, f, room, tracking))); break; }
}
}
if (!lines.length) lines.push(fitFace(String(str), face0, room, tracking));
const f0 = lines[0];
const hpx = f0.font.h * f0.d, lead = hpx + Math.max(2, f0.d * 2);
let top, x;
switch (role) {
case 'eyebrow':
a = a || 'start';
x = o.x ?? (a === 'start' ? safe : a === 'end' ? k.w - safe : k.w / 2);
top = o.y !== undefined ? o.y - hpx : safe;
break;
case 'label':
a = a || 'middle';
x = o.x ?? k.w / 2;
top = (o.y ?? k.h - (st.baseline ?? 6.5) * k.m.u) - hpx - (lines.length - 1) * lead;
break;
case 'value': case 'hero':
a = a || 'middle';
x = o.x ?? k.w / 2;
top = (o.cy ?? k.h * 0.52) - hpx / 2;
break;
default:
a = a || 'middle';
x = o.x ?? k.w / 2;
top = (o.y ?? k.h - safe) - hpx;
}
let runs = [];
lines.forEach((f, i) => {
const x0 = Math.round(a === 'start' ? x : a === 'end' ? x - f.width : x - f.width / 2);
runs = runs.concat(textRuns(f.text, { font: f.font, d: f.d, x: x0, y: Math.round(top + i * lead), tracking }));
});
if (paint) return paint(runs, f0.d, color, o);
let out = '';
if (!k.dark) out += path(runsPath(runs.map(([rx, ry, len]) => [rx + 1, ry + 1, len]), f0.d), { fill: '#000000', fillOpacity: 0.14 });
out += path(runsPath(runs, f0.d), { fill: color, fillOpacity: o.opacity !== undefined && o.opacity < 1 ? n(o.opacity, 3) : null });
return out;
}
};
__d[244] = function (__ns) {
const { defineTheme } = __m(14);
const { rect, path, url, linearGradient, radialGradient, n, attrs } = __m(5);
const { mix } = __m(4);
const { clamp, phase, lerp } = __m(12);
const { Pen } = __m(16);
const { glyphRegistry } = __m(231);
const { bitmapText } = __m(243);
__e(__ns, { "default": () => __default, "tube": () => tube, "raster": () => raster, "scanPath": () => scanPath }, [], ["default","raster","scanPath","tube"]);
function raster(k) {
const m = k.ctx.kind === 'key' ? Math.min(k.w, k.h) : Math.max(72, 72 * k.m.u);
const p = Math.max(3, Math.round(m / 24));
return { p, g: Math.max(1, Math.round(p / 3.2)) };
}
function scanPath(k, x, y, w, h) {
const { p, g } = raster(k);
let d = '';
for (let yy = Math.ceil(y / p) * p - g; yy < y + h; yy += p) if (yy + g > y) d += `M${n(x)} ${Math.max(yy, y)}H${n(x + w)}V${Math.min(yy + g, y + h)}H${n(x)}Z`;
return d;
}
const BLOOM = { idle: 0.04, active: 0.75, ok: 0.5, info: 0.5, warn: 0.52, neg: 0.5, alert: 0.55, crit: 0.62, busy: 0.16, off: 0 };
const HEAT = { off: 0, idle: 0.3, busy: 0.4 };
const heatOf = (tone) => HEAT[tone] ?? 1;
const HOT = new Set(['active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit']);
function excite(k, tone) {
if (k.ctx.reduced || (tone !== 'alert' && tone !== 'crit')) return 1;
const T = tone === 'crit' ? 0.6 : 1.2; 
return 0.35 + 0.65 * Math.exp(-phase(k.ctx.t, T) * T / 0.28);
}
function tube(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, dark = k.dark, off = tone === 'off';
const glass = k.id('glass');
const heat = heatOf(tone);
const lit = dark ? mix(C.surface, C.ink, 0.015 + 0.075 * heat) : mix(C.surface, '#ffffff', 0.12 + 0.62 * heat);
const body = dark ? C.surface : off ? mix(C.surface2, '#6f8a78', 0.32) : C.surface;
const rim = dark ? C.surface2 : off ? mix(C.surface2, '#5d7564', 0.4) : C.surface2;
k.def(radialGradient(glass, [[0, lit], [0.62, body], [1, rim]], { cx: 0.5, cy: 0.46, r: 0.74 }));
k.add(rect({ x, y, width: w, height: h, fill: url(glass) }));
const level = (BLOOM[tone] ?? 0.25) * excite(k, tone);
if (level > 0) {
const bl = k.id('bloom');
const c = k.tone(tone);
const a = (dark ? 1 : 0.55) * level;
k.def(radialGradient(bl, [[0, c, a * 0.55], [0.5, c, a * 0.2], [1, c, 0]], { cx: 0.5, cy: 0.44, r: 0.62 }));
k.add(rect({ x, y, width: w, height: h, fill: url(bl) }));
}
if (tone === 'busy' && !k.ctx.reduced) {
const hb = k.id('hum');
const p = phase(k.ctx.t, 2.4);
const cy = y - h * 0.3 + p * h * 1.6;
k.def(linearGradient(hb, [[0, C.ink, 0], [0.5, C.ink, dark ? 0.09 : 0.18], [1, C.ink, 0]], { x1: 0, y1: cy - h * 0.22, x2: 0, y2: cy + h * 0.22, gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ x, y, width: w, height: h, fill: url(hb) }));
}
k.add(path(scanPath(k, x, y, w, h), { fill: dark ? '#000000' : mix(C.surface2, C.ink, 0.35), fillOpacity: dark ? 0.55 : 0.2 }));
const rf = k.id('refl');
k.def(radialGradient(rf, [[0, '#ffffff', dark ? 0.075 : 0.3], [1, '#ffffff', 0]], { cx: 0.28, cy: 0.1, r: 0.55 }));
k.add(rect({ x, y, width: w, height: h * 0.6, fill: url(rf) }));
const edge = Math.max(1, k.m.bold * 0.9);
k.add(rect({ x: x + edge / 2, y: y + edge / 2, width: w - edge, height: h - edge, rx: k.m.radius * 1.3, fill: 'none', stroke: dark ? '#000000' : mix(C.surface2, C.ink, 0.25), strokeWidth: n(edge), strokeOpacity: dark ? 0.7 : 0.35 }));
}
function beam(k, prim, style, layer) {
const dark = k.dark;
const op = (style.opacity ?? 1) * (prim.opacity ?? 1);
const w = (style.width ?? 2.6) * (prim.weight ?? 1);
const glow = style.glow ?? 0.6;
const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : null;
const hot = dark && (prim.role === 'accent' || prim.role === 'spark' || style.color === k.colors.accent);
const faint = prim.ghost || op < 0.3; 
if (layer === 'halo') {
if (faint || (!dark && prim.fill)) return null;
const a = dark
? (prim.fill ? { stroke: style.color, strokeWidth: n(2 + 4 * glow), strokeOpacity: n(0.2 * op, 3) } : { stroke: style.color, strokeWidth: n(w * (1.7 + 2 * glow)), strokeOpacity: n(0.15 * glow * op, 3) })
: { stroke: style.color, strokeWidth: n(w * 2), strokeOpacity: n(0.08 * op, 3) };
Object.assign(a, { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: dash });
return { key: JSON.stringify(a), d: prim.d, attrs: a };
}
const s = (width, color, o) => `<path${attrs({ d: prim.d, fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: o < 1 ? n(o, 3) : null, strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
const f = (color, o) => `<path${attrs({ d: prim.d, fill: color, fillOpacity: o < 1 ? n(o, 3) : null })}/>`;
if (prim.fill) return f(hot && !faint ? mix(style.color, '#ffffff', 0.3) : style.color, op); 
return s(w, style.color, op) + (hot && !faint ? s(Math.max(0.6, w * 0.38), mix(style.color, '#ffffff', 0.65), 0.8 * op) : '');
}
function paintTree(k, node, tone) {
let out = '';
for (const c of node.children) {
if (c.group) {
const inner = paintTree(k, c, tone);
if (!inner) continue;
out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
} else out += beam(k, c, k.roleStyle(c.role, tone), 'core');
}
return out;
}
function haloOf(k, pen, tone) {
const groups = new Map();
for (const p of pen.flat()) {
const h = beam(k, p, k.roleStyle(p.role, tone), 'halo');
if (!h) continue;
const tf = p.transforms.join(' ');
const key = `${tf}|${h.key}`;
if (!groups.has(key)) groups.set(key, { tf, attrs: h.attrs, d: '' });
groups.get(key).d += h.d;
}
let out = '';
for (const { tf, attrs: a, d } of groups.values()) {
const el = `<path${attrs({ d, ...a })}/>`;
out += tf ? `<g transform="${tf}">${el}</g>` : el;
}
return out;
}
function paintGlyph(k, pen, { tone, box }) {
const bx = box || k._d2g?.box || null;
k._d2g = null;
const out = haloOf(k, pen, tone);
const body = paintTree(k, pen.root, tone);
if (!bx || !k.dark) return out + body; 
const s = bx.size / 48, { p, g } = raster(k);
let d = '';
const y0 = Math.floor(bx.y / p) * p - p, y1 = bx.y + bx.size + p;
const u = (px) => n((px - bx.y) / s, 3);
for (let yy = y0; yy < y1; yy += p) d += `M-24 ${u(yy)}H72V${u(yy + p - g)}H-24Z`;
const id = k.id(`scan${(k._d2n = (k._d2n || 0) + 1)}`);
k.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
return `${out}<g clip-path="url(#${id})">${body}</g>`;
}
const TRAIL = [[0.06, 0.4], [0.12, 0.2], [0.18, 0.09]];
const keyOf = (p) => `${p.role}|${p.transforms.join(';')}|${p.d}`;
function persistent(draw, loop) {
return (g, s) => {
const cur = new Pen();
draw(cur, s);
const seen = new Set(cur.flat().map(keyOf));
let budget = 9, chars = 1400; 
for (const [dt, op] of TRAIL) {
if (budget <= 0) break;
if (s.t < dt) continue;
const t = s.t - dt;
const gp = new Pen();
draw(gp, { ...s, t, since: (s.since ?? s.t) - dt, phase: (period = loop || 1) => { const q = (t / period) % 1; return q < 0 ? q + 1 : q; } });
for (const p of gp.flat()) {
if (p.opacity < 0.3 || seen.has(keyOf(p)) || budget <= 0 || p.d.length > chars) continue;
budget--; chars -= p.d.length;
const { transforms, ...prim } = p;
g.top.children.push({ group: true, transform: transforms.length ? transforms.join(' ') : null, opacity: 1, children: [{ ...prim, ghost: true, opacity: prim.opacity * op }] });
}
}
for (const c of cur.root.children) g.top.children.push(c);
};
}
const BESPOKE = {
clock(g, s) {
g.circle(24, 24, 16.5, { role: 'dim', weight: 0.75, opacity: 0.8 });
for (const a of [0, 90, 180, 270]) { const [x1, y1] = g.polar(24, 24, 12.5, a), [x2, y2] = g.polar(24, 24, 15, a); g.line(x1, y1, x2, y2, { role: 'line', weight: 0.9 }); }
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
const a = m * 6;
[0.05, 0.09, 0.14, 0.2].forEach((op, i) => {
const a0 = a - (4 - i) * 9, a1 = a - (3 - i) * 9;
const [x0, y0] = g.polar(24, 24, 13.5, a0), [x1, y1] = g.polar(24, 24, 13.5, a1);
g.path(`M24 24L${x0.toFixed(2)} ${y0.toFixed(2)}A13.5 13.5 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`, { role: 'accent', fill: true, opacity: op });
});
const hand = (deg, len, o) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, o); };
hand(h * 30, 8, { role: 'line', weight: 1.15 });
hand(a, 13, { role: 'accent' });
g.dot(24, 24, 1.7);
},
volume(g, s) {
g.polygon([[8, 19], [14, 19], [21, 12.5], [21, 35.5], [14, 29], [8, 29]], { role: 'line' });
const muted = s.state === 'muted';
const A = muted ? 0 : 1.5 + 6.5 * clamp(s.level);
const pts = [];
for (let i = 0; i <= 16; i++) {
const x = 25 + (i / 16) * 16;
const env = Math.sin((i / 16) * Math.PI);
pts.push([+x.toFixed(2), +(24 - A * env * Math.sin((i / 16) * Math.PI * 4 - s.phase(2) * Math.PI * 2)).toFixed(2)]);
}
g.polyline(pts, { role: muted ? 'dim' : 'accent', weight: 0.85 });
if (muted) { g.line(29.5, 19.5, 37.5, 27.5, { role: 'accent', weight: 0.9 }); g.line(37.5, 19.5, 29.5, 27.5, { role: 'accent', weight: 0.9 }); }
},
broadcast(g, s) {
const live = s.state === 'live';
g.circle(24, 24, 3.6, { role: live ? 'accent' : 'fill', fill: true });
if (!live) { for (const r of [9, 15.5]) { g.arc(24, 24, r, 42, 138, { role: 'dim' }); g.arc(24, 24, r, 222, 318, { role: 'dim' }); } return; }
for (let i = 0; i < 3; i++) {
const p = (s.phase(1.8) + i / 3) % 1;
const r = 6 + p * 12;
g.circle(24, 24, r, { role: i ? 'accent' : 'line', opacity: (1 - p) ** 1.4, weight: 0.8 });
}
},
};
const GLYPHS = new Proxy({}, {
get(_, id) {
if (typeof id !== 'string') return undefined;
const base = glyphRegistry().glyphs.get(id);
if (!base) return undefined;
return persistent(BESPOKE[id] || base.draw, base.loop);
},
has(_, id) { return typeof id === 'string' && glyphRegistry().glyphs.has(id); },
});
function beamText(k, role, str, o) {
return bitmapText(k, role, str, o, {
paint(runs, d, color0, oo) {
const dark = k.dark;
const color = dark && color0 === k.colors.ink && HOT.has(k.toneName) ? mix(k.colors.ink, k.colors.accent, 0.45) : color0;
const op = oo.opacity ?? 1;
const gap = dark && d >= 3 ? 1 : 0; 
const line = (wid, pad = 0) => runs.map(([x, y, len]) => `M${n(x + d / 2 - pad)} ${n(y + (d - gap) / 2)}h${n(Math.max(0, len - d + pad * 2))}`).join('');
let out = '';
if (dark && d >= 2) out += `<path${attrs({ d: line(0), fill: 'none', stroke: color, strokeWidth: n(d * 1.7 + 1.6), strokeOpacity: n(0.11 * op, 3), strokeLinecap: 'round' })}/>`;
out += `<path${attrs({ d: line(0), fill: 'none', stroke: color, strokeWidth: n(Math.max(1, d - gap)), strokeOpacity: op < 1 ? n(op, 3) : null, strokeLinecap: d >= 2 ? 'round' : 'square' })}/>`;
return out;
},
});
}
const __default = defineTheme({
id: 'phosphor',
title: 'Phosphor',
description: 'Green CRT keys: beam-drawn lines in a phosphor bloom, whole-pixel scanlines, persistence trails on anything that moves, a raster that blooms on press.',
tags: ['crt', 'terminal', 'phosphor', 'retro', 'scanlines', 'green', 'dark', 'light'],
modes: {
dark: {
bg: '#010402', surface: '#061109', surface2: '#020704', line: '#16391f', ink: '#78ffa4', muted: '#45b871', dim: '#2c7c4a',
accent: '#d2ffe0', accent2: '#8af3ff', pos: '#b2ff75', info: '#74d9ff', warn: '#ffc24d', neg: '#ff9248', crit: '#ff5d70',
spectrum: { l: 0.88, c: 0.09 },
},
light: {
bg: '#86d6a0', surface: '#b8f2c9', surface2: '#a2e5b6', line: '#6cbf88', ink: '#03200e', muted: '#174a2a', dim: '#3a7550',
accent: '#005a2b', accent2: '#00506c', pos: '#215b00', info: '#004784', warn: '#6a4100', neg: '#8a2500', crit: '#93002d',
spectrum: { l: 0.4, c: 0.12 },
},
},
defaultMode: 'dark',
tones: { idle: 'ink', active: 'accent', busy: 'muted' },
roles: {
line: { color: (k, tone) => (tone === 'off' ? k.colors.muted : k.dark && HOT.has(tone) ? mix(k.colors.ink, k.colors.accent, 0.5) : k.colors.ink), width: 2.5, glow: 0.55 },
fill: { color: (k, tone) => (tone === 'off' ? k.colors.muted : k.dark && HOT.has(tone) ? mix(k.colors.ink, k.colors.accent, 0.5) : k.colors.ink), glow: 0.5 },
accent: { color: 'tone', width: 2.7, glow: 0.9 },
dim: { color: 'muted', width: 2.1, opacity: 0.9, glow: 0.3 },
spark: { color: 'tone', glow: 1 },
},
type: {
eyebrow: { size: 7, weight: 600, caps: true, tracking: 0.16, color: 'muted' },
label: { size: 10, weight: 600, caps: true, color: 'ink', baseline: 7 },
value: { size: 22, weight: 700, tabular: true, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, color: 'ink' },
caption: { size: 8.5, weight: 400, color: 'muted' },
},
background(k, o) { tube(k, o); },
surface(k, o) { tube(k, o); },
paint(k, prim, style) { const h = beam(k, prim, style, 'halo'); return (h ? `<path${attrs({ d: h.d, ...h.attrs })}/>` : '') + beam(k, prim, style, 'core'); },
paintGlyph,
glyphBox(k, { labeled }) {
const m = Math.min(k.w, k.h);
const size = labeled ? m * 0.56 : m * 0.72;
const box = { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.42 : k.h / 2) - size / 2, size };
k._d2g = { box };
return box;
},
text(k, role, str, o) { return beamText(k, role, str, o); },
press(k, { pressed, age }) {
if (!pressed && !(age < 0.42)) return null;
const e = pressed ? 1 : Math.exp(-age / 0.11);
const s = 1 - 0.035 * e, cx = k.w / 2, cy = k.h / 2;
const C = k.colors;
return {
transform: `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})`,
under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : C.surface2 }),
overlay: rect({ width: k.w, height: k.h, fill: k.dark ? C.ink : '#ffffff', fillOpacity: n((k.dark ? 0.2 : 0.38) * e, 3) })
+ path(scanPath(k, 0, 0, k.w, k.h), { fill: k.dark ? '#000000' : C.ink, fillOpacity: n((k.dark ? 0.3 : 0.12) * e, 3) }),
};
},
glyphs: GLYPHS,
});
};
__d[245] = function (__ns) {
const { flattenPath, insidePolys, distToPolys, transformPath } = __m(13);
__e(__ns, { "MATRIX": () => MATRIX, "LEVELS": () => LEVELS, "applyTf": () => applyTf, "flatD": () => flatD, "quantize": () => quantize, "rasterize": () => rasterize, "bayer": () => bayer, "latticePath": () => latticePath, "cellsToRuns": () => cellsToRuns }, [], ["LEVELS","MATRIX","applyTf","bayer","cellsToRuns","flatD","latticePath","quantize","rasterize"]);
const MATRIX = Object.freeze({ n: 15, x0: 6, span: 36 });
const LEVELS = [1, 0.7, 0.45, 0.25];
function applyTf(d, tf) {
let m = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
for (const [, fn, args] of tf.matchAll(/(translate|rotate|scale|matrix)\(([^)]*)\)/g)) {
const v = args.trim().split(/[\s,]+/).map(Number);
if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
else if (fn === 'matrix') m = mul(m, v);
else { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); }
}
return transformPath(d, m, (x) => +x.toFixed(3));
}
const flatD = (p) => (p.transforms?.length ? p.transforms.reduceRight((acc, tf) => applyTf(acc, tf), p.d) : p.d);
function quantize(op, levels = LEVELS) {
if (op < levels[levels.length - 1] * 0.5) return 0;
let best = levels[0];
for (const l of levels) if (Math.abs(l - op) < Math.abs(best - op)) best = l;
return best;
}
function cellOf(v, x0, cu) {
const f = (v - x0) / cu, r = Math.round(f);
if (Math.abs(f - r) < 1e-6) return v < 24 ? r : r - 1;
return Math.floor(f);
}
function strokeCells(polys, n, x0, cu) {
const out = new Set();
for (const pl of polys) {
const pts = pl.closed && pl.pts.length > 2 ? [...pl.pts, pl.pts[0]] : pl.pts;
const seq = [];
if (pts.length === 1) { const cx = cellOf(pts[0][0], x0, cu), cy = cellOf(pts[0][1], x0, cu); seq.push([cx, cy, false]); }
for (let i = 0; i < pts.length - 1; i++) {
const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
const len = Math.hypot(bx - ax, by - ay);
const steps = Math.max(1, Math.ceil(len / (cu * 0.2)));
const axis = Math.abs(bx - ax) < 1e-6 || Math.abs(by - ay) < 1e-6;
for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
const t = s / steps;
const cx = cellOf(ax + (bx - ax) * t, x0, cu), cy = cellOf(ay + (by - ay) * t, x0, cu);
const last = seq[seq.length - 1];
if (last && last[0] === cx && last[1] === cy) { if (!axis) last[2] = true; continue; }
seq.push([cx, cy, !axis]);
}
}
const keep = [];
for (const c of seq) {
if (keep.length >= 2) {
const a = keep[keep.length - 2], b = keep[keep.length - 1];
const L = (a[0] === b[0] || a[1] === b[1]) && (b[0] === c[0] || b[1] === c[1]) && a[0] !== c[0] && a[1] !== c[1];
if (L && (b[2] || a[2] || c[2])) keep.pop();
}
keep.push(c);
}
for (const [cx, cy] of keep) if (cx >= 0 && cy >= 0 && cx < n && cy < n) out.add(cy * n + cx);
}
return out;
}
function thickCells(polys, n, x0, cu, half) {
const out = new Set();
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
const px = x0 + (x + 0.5) * cu + 1e-4, py = x0 + (y + 0.5) * cu + 1e-4;
if (distToPolys(px, py, polys) < half) out.add(y * n + x);
}
return out;
}
function fillCells(polys, n, x0, cu) {
const out = new Set();
let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
for (const pl of polys) for (const [x, y] of pl.pts) { if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
if (bx0 === Infinity) return out;
const i0 = Math.max(0, cellOf(bx0, x0, cu)), i1 = Math.min(n - 1, cellOf(bx1, x0, cu));
const j0 = Math.max(0, cellOf(by0, x0, cu)), j1 = Math.min(n - 1, cellOf(by1, x0, cu));
for (let y = j0; y <= j1; y++) for (let x = i0; x <= i1; x++) {
const px = x0 + (x + 0.5) * cu + 1e-4, py = x0 + (y + 0.5) * cu + 1e-4;
if (insidePolys(px, py, polys) || distToPolys(px, py, polys) < cu * 0.16) out.add(y * n + x);
}
if (!out.size) {
const cx = cellOf((bx0 + bx1) / 2, x0, cu), cy = cellOf((by0 + by1) / 2, x0, cu);
if (cx >= 0 && cy >= 0 && cx < n && cy < n) out.add(cy * n + cx);
}
return out;
}
function rasterize(prims, styleOf, { n = MATRIX.n, x0 = MATRIX.x0, span = MATRIX.span, levels = LEVELS } = {}) {
const cu = span / n;
const grid = new Array(n * n).fill(null);
prims.forEach((p, z) => {
const st = styleOf(p);
const q = quantize((st.opacity ?? 1) * (p.opacity ?? 1), levels);
if (!q) return;
const polys = flattenPath(flatD(p), 0.3);
if (!polys.length) return;
const hits = p.fill ? fillCells(polys, n, x0, cu) : (p.weight ?? 1) >= 1.45 ? thickCells(polys, n, x0, cu, cu * 0.78) : strokeCells(polys, n, x0, cu);
for (const i of hits) if (!grid[i] || q >= grid[i].q) grid[i] = { color: st.color, q, role: p.role, z };
});
const cells = [];
grid.forEach((c, i) => { if (c) cells.push({ i, x: i % n, y: Math.floor(i / n), ...c }); });
return {
n, cu, x0, grid, cells,
runs(colorOf = (c) => c.color) {
const by = new Map();
for (let y = 0; y < n; y++) {
let x = 0;
while (x < n) {
const c = grid[y * n + x];
const col = c ? colorOf({ ...c, x, y }) : null;
if (!col) { x++; continue; }
let e = x;
while (e + 1 < n && grid[y * n + e + 1] && colorOf({ ...grid[y * n + e + 1], x: e + 1, y }) === col) e++;
if (!by.has(col)) by.set(col, []);
by.get(col).push([x, y, e - x + 1]);
x = e + 1;
}
}
return [...by].map(([color, runs]) => ({ color, runs }));
},
};
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function latticePath(runs, c, ox = 0, oy = 0, inset = 0) {
let s = '';
const f = (v) => +v.toFixed(3);
for (const [x, y, len] of runs) s += `M${f(ox + x * c + inset)} ${f(oy + y * c + inset)}h${f(len * c - inset * 2)}v${f(c - inset * 2)}h${f(-(len * c - inset * 2))}Z`;
return s;
}
function cellsToRuns(list) {
const rows = new Map();
for (const [x, y] of list) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
const runs = [];
for (const [y, xs] of rows) {
xs.sort((a, b) => a - b);
let s = xs[0], p = xs[0];
for (let i = 1; i <= xs.length; i++) {
if (i < xs.length && xs[i] === p + 1) { p = xs[i]; continue; }
if (i < xs.length && xs[i] === p) continue;
runs.push([s, y, p - s + 1]);
if (i < xs.length) { s = xs[i]; p = xs[i]; }
}
}
return runs;
}
};
__d[246] = function (__ns) {
const { defineTheme } = __m(14);
const { rect, path, n, attrs } = __m(5);
const { mix } = __m(4);
const { clamp, phase, smoothstep, arrive } = __m(12);
const { rasterize, bayer, latticePath, cellsToRuns, MATRIX } = __m(245);
const { bitmapText } = __m(243);
__e(__ns, { "cellPx": () => cellPx, "default": () => __default, "lcd": () => lcd, "lattice": () => lattice, "frame": () => frame, "dither": () => dither }, [], ["cellPx","default","dither","frame","lattice","lcd"]);
const N = MATRIX.n; 
const CU = MATRIX.span / N; 
function cellPx(k, labeled) {
const m = Math.min(k.w, k.h);
const key = k.ctx.kind === 'key';
const target = (labeled ? 0.45 : 0.58) * m;
let c = Math.max(1, Math.round(target / N));
const limit = (labeled ? (key ? 0.5 : 0.62) : 0.7) * m;
while (c > 1 && N * c > limit) c--;
return c;
}
function lattice(k) {
if (k._d2lat) return k._d2lat;
let c, ax, ay;
if (k.ctx.kind === 'key') {
c = cellPx(k, true);
({ ax, ay } = artOrigin(k, true, c));
} else {
c = Math.max(2, Math.round(2 * k.m.u));
ax = 0; ay = 0;
}
k._d2lat = { c, ox: ((ax % c) + c) % c, oy: ((ay % c) + c) % c };
return k._d2lat;
}
function artOrigin(k, labeled, c) {
const art = N * c;
const cy = labeled ? k.h * 0.43 : k.h / 2;
return { ax: Math.round((k.w - art) / 2), ay: Math.round(cy - art / 2) };
}
const step = (k, color, q) => (q >= 1 ? color : mix(k.colors.surface, color, q));
function blink(k, tone) {
if (tone !== 'alert' && tone !== 'crit') return 1;
const p = phase(k.ctx.t, tone === 'crit' ? 0.6 : 1.2);
return k.ctx.reduced ? 1 : p < 0.5 ? 1 : p < 0.62 ? 0.5 : 0.2;
}
const GLOW = { idle: 0, off: 0, active: 0.62, ok: 0.5, info: 0.5, warn: 0.55, neg: 0.5, alert: 0.62, crit: 0.7 };
function dither(k, { x, y, w, h, color, level, opacity, from = 0.38 }) {
const L = lattice(k), c = L.c;
const lx0 = Math.ceil((x - L.ox) / c), lx1 = Math.floor((x + w - L.ox) / c) - 1;
const ly0 = Math.ceil((y - L.oy) / c), ly1 = Math.floor((y + h - L.oy) / c) - 1;
const lit = [];
for (let ly = ly0; ly <= ly1; ly++) {
const fy = (L.oy + (ly + 0.5) * c - y) / h;
const vy = smoothstep(from, 1.04, fy);
if (vy <= 0) continue;
for (let lx = lx0; lx <= lx1; lx++) {
const fx = (L.ox + (lx + 0.5) * c - x) / w;
const v = level * vy * (1 - 0.55 * Math.abs(fx - 0.5) ** 1.6 * 2);
if (v > bayer(lx, ly)) lit.push([lx, ly]);
}
}
if (!lit.length) return;
k.add(path(latticePath(cellsToRuns(lit), c, L.ox, L.oy), { fill: color, fillOpacity: n(opacity, 3) }));
}
function frame(k, { x = 0, y = 0, w = k.w, h = k.h, color, opacity = 1, dashed = false, inset }) {
const c = lattice(k).c;
const i = inset ?? (k.ctx.kind === 'key' ? Math.max(1, Math.round(c * 0.5)) : c);
const X0 = Math.round(x + i), Y0 = Math.round(y + i), X1 = Math.round(x + w - i), Y1 = Math.round(y + h - i);
let d = '';
const hrun = (x0, x1, yy) => {
if (!dashed) { d += `M${x0 + c} ${yy}H${x1 - c}v${c}H${x0 + c}Z`; return; }
for (let xx = x0 + c; xx + c <= x1 - c; xx += 2 * c) d += `M${xx} ${yy}h${c}v${c}h${-c}Z`;
};
const vrun = (y0, y1, xx) => {
if (!dashed) { d += `M${xx} ${y0 + c}h${c}V${y1 - c}h${-c}Z`; return; }
for (let yy = y0 + c; yy + c <= y1 - c; yy += 2 * c) d += `M${xx} ${yy}h${c}v${c}h${-c}Z`;
};
hrun(X0, X1, Y0); hrun(X0, X1, Y1 - c); vrun(Y0, Y1, X0); vrun(Y0, Y1, X1 - c);
k.add(path(d, { fill: color, fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
}
function lcd(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const C = k.colors, dark = k.dark;
const off = tone === 'off';
k.add(rect({ x, y, width: w, height: h, fill: off ? C.surface2 : C.surface }));
const b = blink(k, tone);
const level = (GLOW[tone] ?? 0.5) * b;
const col = k.tone(tone);
if (level > 0) dither(k, { x, y, w, h, color: col, level, opacity: dark ? 0.34 : 0.26 });
const lit = tone !== 'idle' && !off;
if (lit) frame(k, { x, y, w, h, color: col, opacity: (dark ? 0.9 : 0.85) * (b < 1 ? (b > 0.4 ? 0.7 : 0.35) : 1) });
else frame(k, { x, y, w, h, color: dark ? mix(C.surface, C.line, 0.9) : C.line, opacity: 1, dashed: off });
}
function paintMatrix(k, pen, { tone, styleOf, box }) {
const C = k.colors, dark = k.dark;
const meta = k._d2g; k._d2g = null;
const c = meta?.c ?? (box ? box.size / 20 : null); 
const px = c ? CU / c : null; 
const R = rasterize(pen.flat(), styleOf);
const b = blink(k, tone);
let out = '';
const X = (v) => n(MATRIX.x0 + v * CU, 3);
out += `<path${attrs({ d: `M${X(0)} ${X(0)}H${X(N)}V${X(N)}H${X(0)}Z`, fill: dark ? mix(C.surface, C.ink, 0.045) : mix(C.surface, C.ink, 0.06) })}/>`;
const colorOf = (cell) => {
let col = cell.color;
if (cell.role === 'spark' && dark) col = mix(col, '#ffffff', 0.35);
let q = cell.q;
if (cell.role === 'accent' && b < 1) q = Math.min(q, b > 0.4 ? 0.7 : 0.45); 
return step(k, col, q);
};
const groups = R.runs(colorOf);
const runPath = (runs, dx = 0, dy = 0) => runs.map(([x, y, len]) => `M${n(MATRIX.x0 + x * CU + dx, 3)} ${n(MATRIX.x0 + y * CU + dy, 3)}h${n(len * CU, 3)}v${n(CU, 3)}h${n(-len * CU, 3)}Z`).join('');
if (!dark && px) {
const all = groups.flatMap((g0) => g0.runs);
if (all.length) out += `<path${attrs({ d: runPath(all, px, px), fill: '#000000', fillOpacity: 0.16 })}/>`;
}
for (const g0 of groups) out += `<path${attrs({ d: runPath(g0.runs), fill: g0.color })}/>`;
if (c && c >= 3 && Number.isInteger(c)) {
let d = '';
for (let i = 1; i <= N; i++) {
d += `M${n(MATRIX.x0 + i * CU - px, 3)} ${X(0)}h${n(px, 3)}V${X(N)}h${n(-px, 3)}Z`;
d += `M${X(0)} ${n(MATRIX.x0 + i * CU - px, 3)}H${X(N)}v${n(px, 3)}H${X(0)}Z`;
}
out += `<path${attrs({ d, fill: dark ? C.surface : mix(C.surface, '#ffffff', 0.25), fillOpacity: c >= 4 ? (dark ? 0.55 : 0.5) : (dark ? 0.4 : 0.38) })}/>`;
}
return out;
}
const S = (s) => s.trim().split(/\s+/).map((r) => [...r]);
function sprite(g, rows, map) {
rows.forEach((row, y) => {
for (let x = 0; x < row.length; x++) {
const st = row[x] === '.' ? null : map(row[x], x, y);
if (!st) continue;
let e = x;
while (e + 1 < row.length && row[e + 1] !== '.') { const nx = map(row[e + 1], e + 1, y); if (!nx || nx.role !== st.role || (nx.opacity ?? 1) !== (st.opacity ?? 1)) break; e++; }
g.rect(MATRIX.x0 + x * CU, MATRIX.x0 + y * CU, (e - x + 1) * CU, CU, { role: st.role, fill: true, opacity: st.opacity });
x = e;
}
});
}
const MIC = S(`
  ......###......
  .....#...#.....
  .....#...#.....
  .....#...#.....
  w.#..#...#..#.w
  w.#..#...#..#.w
  w.#..#...#..#.w
  ..#...###...#..
  ...#.......#...
  ....#.....#....
  .....#####.....
  .......#.......
  .......#.......
  ....#######....
  ...............`);
const PLAY = [S(`
  ...............
  ...............
  ....##.........
  ....####.......
  ....######.....
  ....########...
  ....#########..
  ....##########.
  ....#########..
  ....########...
  ....######.....
  ....####.......
  ....##.........
  ...............
  ...............`), S(`
  ...............
  ...............
  ...###...##....
  ...####..###...
  ...#####.###...
  ...#########...
  ...#########...
  ...##########..
  ...#########...
  ...#########...
  ...#####.###...
  ...####..###...
  ...###...##....
  ...............
  ...............`), S(`
  ...............
  ...............
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...............
  ...............`)];
const BULB = S(`
  .......r.......
  ..r.........r..
  ......###......
  ....##...##....
  r..#.......#..r
  ...#.......#...
  ...#.x...x.#...
  ...#..x.x..#...
  ....#..x..#....
  .....#...#.....
  .....#####.....
  .....#...#.....
  .....#####.....
  ......ddd......
  ...............`);
const POWER = S(`
  ...............
  .......a.......
  .......a.......
  .......a.......
  ...#...a...#...
  ..#....a....#..
  .#.....a.....#.
  .#.....a.....#.
  .#...........#.
  .#...........#.
  .#...........#.
  ..#.........#..
  ...#.......#...
  ....#.....#....
  .....#####.....`);
function ringCells(cx, cy, r) {
const pts = new Map();
let x = 0, y = r, d = 1 - r;
while (x <= y) {
for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) pts.set(`${cx + a},${cy + b}`, [cx + a, cy + b]);
x++;
if (d < 0) d += 2 * x + 1; else { y--; d += 2 * (x - y) + 1; }
}
return [...pts.values()].map(([px, py]) => ({ x: px, y: py, a: (Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI + 360) % 360 })).sort((p1, p2) => p1.a - p2.a);
}
function discCells(cx, cy, r) {
const out = [];
for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) out.push({ x: cx + x, y: cy + y });
return out;
}
const cell = (g, x, y, role, opacity) => g.rect(MATRIX.x0 + x * CU, MATRIX.x0 + y * CU, CU, CU, { role, fill: true, opacity });
const CHAT = S(`
  ...............
  ...............
  ..###########..
  .#...........#.
  #.............#
  #.............#
  #.............#
  #.............#
  #.............#
  #.............#
  .#...........#.
  ..##...######..
  ....#.#........
  ....##.........
  ...............`);
const AT = S(`
  .###.
  #...#
  ....#
  .##.#
  #.#.#
  #.#.#
  .###.`);
const VIEWERS = S(`
  ...............
  ...............
  .bbb.......ccc.
  .bbb..###..ccc.
  .bbb.#...#.ccc.
  .....#...#.....
  .BBB.#...#.CCC.
  B.....###.....C
  B.............C
  .....#####.....
  ....#.....#....
  ...#.......#...
  ...#.......#...
  ...#.......#...
  ...............`);
const OVERRIDES = {
chat(g, s) {
sprite(g, CHAT, () => ({ role: 'line' }));
if (s.state === 'mention') {
if (s.since < 0.12) return; 
sprite(g, [...Array(4).fill('...............'.split('')), ...AT.map((r) => [...'.....', ...r, ...'.....'])], () => ({ role: 'accent' }));
return;
}
const active = s.state === 'active';
[4, 7, 10].forEach((x, i) => {
const hop = active && arrive(s.since, 0.3) > 0.5 && Math.floor(phase(s.t, 1.2) * 6) === i * 2;
cell(g, x, hop ? 6 : 7, active ? 'accent' : 'dim');
});
},
viewers(g, s) {
const live = s.state === 'live';
const k = live ? clamp(s.since / 0.5) : 1;
const crowd = s.level > 0.66 ? 3 : s.level > 0.33 ? 2 : 1;
const ox = crowd === 2 ? -1 : 0; 
const showL = crowd >= 3 && k > 0.4, showR = crowd >= 2 && k > 0.4; 
sprite(g, VIEWERS, (ch) => ((ch === 'b' || ch === 'B') && showL) || ((ch === 'c' || ch === 'C') && showR) ? { role: 'dim' } : null);
for (let y = 3; y <= 7; y++) for (let x = 5; x <= 9; x++) if ((y === 3 || y === 7) ? Math.abs(x - 7) <= 1 : Math.abs(x - 7) === 2) cell(g, x + ox, y, 'line');
if (live) for (let y = 4; y <= 6; y++) for (let x = 6; x <= 8; x++) cell(g, x + ox, y, 'accent', phase(s.t, 2.4) < 0.5 ? 1 : 0.7);
VIEWERS.slice(9).forEach((row, j) => row.forEach((ch, x) => { if (ch === '#') cell(g, x + ox, 9 + j, 'line'); }));
},
record(g, s) {
const ring = ringCells(7, 7, 6);
const dot = discCells(7, 7, 3);
if (s.state === 'ready') {
for (const c of ring) cell(g, c.x, c.y, 'dim');
for (const c of dot) cell(g, c.x, c.y, 'fill');
return;
}
if (s.state === 'armed') {
const shift = Math.floor(phase(s.t, 2.4) * 6) * 15; 
ring.forEach((c) => { if (Math.floor(((c.a + shift + 22.5) % 360) / 45) % 2 === 0) cell(g, c.x, c.y, 'line'); });
for (const c of dot) cell(g, c.x, c.y, 'accent', phase(s.t, 1.2) < 0.5 ? 1 : 0.45);
return;
}
const head = Math.floor(phase(s.t, 2.4) * ring.length);
ring.forEach((c, i) => { const d = (head - i + ring.length) % ring.length; cell(g, c.x, c.y, d < 3 ? 'spark' : 'line'); });
for (const c of dot) cell(g, c.x, c.y, 'accent');
},
mic(g, s) {
const on = s.state === 'on';
const wave = phase(s.t, 1.6) < 0.5 ? 1 : 0.45;
sprite(g, MIC, (ch) => (ch === '#' ? { role: 'line' } : ch === 'w' && on ? { role: 'accent', opacity: wave } : null));
if (!on) {
const cells = Math.round(14 * clamp(s.since / 0.3));
for (let i = 0; i < cells; i++) g.rect(MATRIX.x0 + (0.5 + i) * CU, MATRIX.x0 + i * CU, CU, CU, { role: 'accent', fill: true });
}
},
'play-pause'(g, s) {
const m = clamp(s.since / 0.3);
const k = s.state === 'playing' ? m : 1 - m; 
sprite(g, PLAY[k < 0.34 ? 0 : k < 0.67 ? 1 : 2], () => ({ role: 'fill' }));
},
bulb(g, s) {
const on = s.state === 'on';
const rays = on && s.since > 0.12 ? (phase(s.t, 2.4) < 0.5 ? 1 : 0.45) : 0;
sprite(g, BULB, (ch) => (ch === '#' ? { role: 'line' } : ch === 'd' ? { role: 'dim' } : ch === 'x' ? { role: on ? 'accent' : 'dim' } : ch === 'r' && rays ? { role: 'accent', opacity: rays } : null));
},
power(g, s) {
const on = s.state === 'on';
const reach = on ? Math.PI * (0.25 + 0.75 * Math.ceil(clamp(s.since / 0.36) * 3) / 3) : Math.PI;
sprite(g, POWER, (ch, x, y) => {
if (ch === 'a') return { role: on ? 'accent' : 'line' };
const ang = Math.atan2(Math.abs(x - 7), y - 9); 
return ang <= reach + 1e-6 ? { role: on ? 'line' : 'dim' } : null;
});
},
};
const __default = defineTheme({
id: 'pixel',
title: 'Pixel',
description: '8-bit LCD keys: glyphs on a whole-pixel dot matrix, dithered light from below, bitmap type, and a press that drops the face one pixel.',
tags: ['8-bit', 'pixel', 'lcd', 'retro', 'dither', 'dark', 'light'],
modes: {
dark: {
bg: '#07080f', surface: '#121528', surface2: '#0c0e1b', line: '#2c3256', ink: '#f6f3ff', muted: '#a9acc8', dim: '#6c7096',
accent: '#a98bff', accent2: '#4fe3c1', pos: '#58e38f', info: '#55b6ff', warn: '#ffc53d', neg: '#ff5b6e', crit: '#ff46b4',
spectrum: { l: 0.76, c: 0.17 },
},
light: {
bg: '#b1b6aa', surface: '#d3d7cb', surface2: '#c8ccbf', line: '#959c8d', ink: '#151912', muted: '#454b41', dim: '#6c7365',
accent: '#4a2b9c', accent2: '#0f5c48', pos: '#1b6a30', info: '#1d4f98', warn: '#7a4a00', neg: '#a1172c', crit: '#94105d',
spectrum: { l: 0.42, c: 0.15 },
},
},
defaultMode: 'dark',
tones: { idle: 'accent', active: 'tint' },
roles: {
line: { color: 'ink', width: 3 },
fill: { color: 'ink' },
accent: { color: 'tone', width: 3 },
dim: { color: 'muted', width: 3, opacity: 0.7 },
spark: { color: 'tone' },
},
type: {
eyebrow: { size: 7, weight: 600, caps: true, tracking: 0.16, color: 'muted' },
label: { size: 10, weight: 600, caps: true, color: 'ink', baseline: 7 },
value: { size: 22, weight: 700, tabular: true, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, color: 'ink' },
caption: { size: 8.5, weight: 400, color: 'muted' },
},
background(k, o) { lcd(k, o); },
surface(k, o) { lcd(k, o); },
paintGlyph: paintMatrix,
glyphBox(k, { labeled }) {
const c = cellPx(k, labeled);
const { ax, ay } = artOrigin(k, labeled, c);
k._d2g = { c, ax, ay };
return { x: ax - 2.5 * c, y: ay - 2.5 * c, size: 20 * c };
},
text(k, role, str, o) { return bitmapText(k, role, str, o); },
press(k, { pressed, age }) {
if (!pressed && !(age < 0.1)) return null;
const c = lattice(k).c;
const C = k.colors;
const lit = k.tone(k.toneName === 'idle' ? 'active' : k.toneName);
return {
transform: `translate(${c} ${c})`,
under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : mix(C.surface, '#000000', 0.45) }),
overlay: path(`M0 0H${k.w}V${c}H${c}V${k.h}H0Z`, { fill: k.dark ? '#000000' : mix(C.surface, '#000000', 0.5), fillOpacity: 0.9 })
+ path(`M${k.w - c} ${c}H${k.w}V${k.h}H${c}V${k.h - c}H${k.w - c}Z`, { fill: lit, fillOpacity: 0.85 }),
};
},
glyphs: OVERRIDES,
});
};
__d[247] = function (__ns) {
const { defineTheme, defaultText, bezelCorner } = __m(14);
const { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } = __m(5);
const { mix } = __m(4);
const { clamp, lerp, pulse, phase, outCubic, arrive, outExpo } = __m(12);
const { getGlyph } = __m(231);
const { stack, onePen, isLettering, strokeOf, fillOf, strokeOpts, once } = __m(234);
__e(__ns, { "default": () => __default, "keyTile": () => keyTile, "plaque": () => plaque, "paintPorcelain": () => paintPorcelain, "stateOf": () => stateOf }, [], ["default","keyTile","paintPorcelain","plaque","stateOf"]);
const DAY = {
bg: '#d6d9e1', surface: '#fbfcfe', surface2: '#d6deeb', line: '#c3cbdb',
ink: '#132c6e', muted: '#42568b', dim: '#7886ac',
accent: '#1f4fd0', accent2: '#a3761f', pos: '#1b7754', info: '#1f60c2', warn: '#a05a00', neg: '#ad2530', crit: '#981a5a',
edge: '#ffffff', edgeOpacity: 1, beam: '#c8952c', beamOpacity: 0.9, sheenOpacity: 0.85,
spectrum: { l: 0.52, c: 0.15 },
};
const NIGHT = {
bg: '#040818', surface: '#1d3584', surface2: '#0c1a49', line: '#2c448f',
ink: '#f5f7fd', muted: '#aebbe6', dim: '#7f90c6',
accent: '#e6bb62', accent2: '#8fb3ff', pos: '#82dcb0', info: '#94c2ff', warn: '#ffc963', neg: '#ff8c7c', crit: '#ff88c1',
edge: '#ffffff', edgeOpacity: 0.5, beam: '#f0c873', beamOpacity: 0.9, sheenOpacity: 0.42,
spectrum: { l: 0.78, c: 0.13 },
};
const GLAZE = {
light: {
shelf: [[0, '#e3e6ed'], [1, '#cdd2db']], tile: [[0, '#ffffff'], [0.38, '#f6f8fb'], [0.72, '#e7ecf4'], [1, '#d3dbe9']], bisque: [[0, '#efebe4'], [1, '#ddd8cf']],
shadow: '#55618a', shadowA: 0.22, pool: '#aebbd6', poolA: 0.55, gloss: 0.95, bleed: 0.17, glossStroke: 0.62, bounce: 0.5, gold: '#a3761f', ring: '#1f4fd0',
},
dark: {
shelf: [[0, '#0a1331'], [1, '#03060f']], tile: [[0, '#2c4aa6'], [0.55, '#1b3283'], [1, '#0b1846']], bisque: [[0, '#2d3244'], [1, '#22263a']],
shadow: '#000000', shadowA: 0.55, pool: '#050c2a', poolA: 0.6, gloss: 0.3, bleed: 0.17, glossStroke: 0.34, bounce: 0.12, gold: '#e6bb62', ring: '#e6bb62',
},
};
const G = (k) => GLAZE[k.dark ? 'dark' : 'light'];
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'on', neg: 'on', alert: 'alert', crit: 'alert', busy: 'busy', off: 'off' };
const stateOf = (tone) => STATE[tone] || 'idle';
const flagged = (tone) => tone === 'warn' || tone === 'alert' || tone === 'crit';
const breath = (k, tone) => (stateOf(tone) !== 'alert' || k.ctx.reduced || k.ctx.since >= 10 ? 1 : lerp(0.55, 1, pulse(k.ctx.t, 1)));
const OFFSETS = { 1: [0.35, 0.6], 5: [-0.3, -0.45] };
const glossBox = (k) => once(k, 'glossb', () => { const id = k.id('glossb'); k.def(linearGradient(id, [[0, '#ffffff', 0.7], [0.42, '#ffffff', 0.12], [0.5, '#ffffff', 0]])); return url(id); });
function paintPorcelain(k, pen, { tone, styleOf }) {
const gz = G(k), st = stateOf(tone), lit = st === 'on' || st === 'alert';
const base = k.dark ? k.colors.surface : '#ffffff';
const entriesOf = (p) => {
const s = styleOf(p);
const op = clamp((s.opacity ?? 1) * (p.opacity ?? 1));
if (op < 0.01) return [];
const w = (s.width ?? 2.6) * (p.weight ?? 1), so = strokeOpts(p, s), c = s.color;
if (st === 'off') return [{ layer: 3, a: p.fill ? fillOf(k.colors.dim, op * 0.75) : strokeOf(k.colors.dim, w, op * 0.75, so) }];
if (isLettering(p)) return [{ layer: 3, a: fillOf(c, op) }];
const enamel = (p.role === 'accent' && lit) || p.role === 'spark';
if (enamel) {
if (p.fill) return [
{ layer: 1, a: fillOf(gz.shadow, op * 0.3) },
{ layer: 3, a: fillOf(c, op) },
{ layer: 4, a: fillOf(glossBox(k), op) },
];
return [
{ layer: 1, a: strokeOf(gz.shadow, w * 1.1, op * 0.28, so) },
{ layer: 3, a: strokeOf(c, w, op, so) },
{ layer: 5, a: strokeOf('#ffffff', w * 0.34, op * 0.78, so) },
];
}
const thin = p.role === 'dim';
if (p.fill) return [
{ layer: 0, a: strokeOf(c, 1.7, op * gz.bleed, so) },
{ layer: 2, a: fillOf(mix(c, base, k.dark ? 0.08 : 0.16), op) },
{ layer: 3, a: strokeOf(c, 1.05, op, so) },
{ layer: 4, a: fillOf(glossBox(k), op * (k.dark ? 0.6 : 0.9)) },
];
return [
{ layer: 0, a: strokeOf(c, w * 1.95, op * gz.bleed, so) },
{ layer: 3, a: strokeOf(c, w, op, so) },
thin ? null : { layer: 5, a: strokeOf('#ffffff', w * 0.26, op * gz.glossStroke, so) },
];
};
return stack(pen, entriesOf, { layers: 6, offsets: OFFSETS });
}
function tileGeom(k) {
const u = k.m.u, o = 1.6 * u;
return { o, R: Math.min(13 * u, (Math.min(k.w, k.h) - 2 * o) / 2), band: 4.6 * u, bandW: 2.1 * u, gold: 6.6 * u };
}
function gloss(k, x, y, w, h, r, strength = 1) {
const gz = G(k), u = k.m.u;
const id = k.id('softbox');
k.def(linearGradient(id, [[0, '#ffffff', gz.gloss * strength], [0.6, '#ffffff', gz.gloss * 0.55 * strength], [1, '#ffffff', gz.gloss * 0.18 * strength]]));
const bx = x + Math.max(2.2 * u, r * 0.38), bw = w - 2 * (bx - x);
const by = y + 1.3 * u, bh = h * 0.21, br = Math.min(r * 0.75, h * 0.1);
if (!k.dark) k.add(path(roundRectPath(bx, by + 0.7 * u, bw, bh, br), { fill: '#9fb0cf', fillOpacity: 0.16 * strength }));
k.add(path(roundRectPath(bx, by, bw, bh, br), { fill: url(id) }));
const sid = k.id('spec');
k.def(radialGradient(sid, [[0, '#ffffff', Math.min(1, 1.25 * gz.gloss * strength + 0.15)], [1, '#ffffff', 0]]));
k.add(`<ellipse cx="${n(x + Math.max(r * 0.72, 5 * u))}" cy="${n(y + Math.max(r * 0.5, 3.6 * u))}" rx="${n(2.6 * u)}" ry="${n(1.5 * u)}" fill="${url(sid)}"/>`);
if (gz.bounce) {
const bid = k.id('bounce');
k.def(linearGradient(bid, [[0, '#ffffff', 0], [1, '#ffffff', gz.bounce * strength]]));
k.add(path(roundRectPath(x + r * 0.5, y + h - h * 0.14 - 0.9 * u, w - r, h * 0.14, h * 0.07), { fill: url(bid) }));
}
}
function keyTile(k, { tone = 'idle' } = {}) {
const gz = G(k), C = k.colors, W = k.w, H = k.h, u = k.m.u;
const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
const { o, R, band, bandW, gold } = tileGeom(k);
const sh = k.id('shelf');
k.def(linearGradient(sh, gz.shelf));
k.add(rect({ width: W, height: H, fill: url(sh) }));
k.add(path(roundRectPath(o - 0.4 * u, o + 1.6 * u, W - 2 * o + 0.8 * u, H - 2 * o, R), { fill: gz.shadow, fillOpacity: n(gz.shadowA * 0.45, 3) }));
k.add(path(roundRectPath(o, o + 0.8 * u, W - 2 * o, H - 2 * o, R), { fill: gz.shadow, fillOpacity: n(gz.shadowA, 3) }));
const tileD = roundRectPath(o, o, W - 2 * o, H - 2 * o, R);
const tid = k.id('tile');
k.def(radialGradient(tid, off ? gz.bisque : gz.tile, { cx: 0.42, cy: 0.3, r: 0.9, fx: 0.38, fy: 0.24 }));
k.add(path(tileD, { fill: url(tid) }));
if (!off) k.add(path(roundRectPath(o + 0.9 * u, o + 0.9 * u, W - 2 * o - 1.8 * u, H - 2 * o - 1.8 * u, R - 0.9 * u), { fill: 'none', stroke: gz.pool, strokeWidth: n(1.8 * u), strokeOpacity: gz.poolA }));
const b = breath(k, tone);
if (lit) {
const c = k.tone(tone);
const wid = k.id('pool');
k.def(radialGradient(wid, [[0, c, (k.dark ? 0.22 : 0.12) * b], [0.6, c, (k.dark ? 0.07 : 0.04) * b], [1, c, 0]], { cx: 0.5, cy: 1.05, r: 0.9 }));
k.add(path(tileD, { fill: url(wid) }));
k.add(path(roundRectPath(band, band, W - 2 * band, H - 2 * band, Math.max(u, R - (band - o))), { fill: 'none', stroke: c, strokeWidth: n(bandW), strokeOpacity: b < 1 ? n(b, 3) : null }));
k.add(path(roundRectPath(gold, gold, W - 2 * gold, H - 2 * gold, Math.max(u, R - (gold - o))), { fill: 'none', stroke: gz.gold, strokeWidth: n(Math.max(0.6, 0.55 * u)), strokeOpacity: 0.9 }));
}
if (st === 'busy') luster(k, gold, gold, W - 2 * gold, H - 2 * gold, Math.max(u, R - (gold - o)));
if (!off) gloss(k, o, o, W - 2 * o, H - 2 * o, R);
if (flagged(tone)) enamelCorner(k, o, o, W - 2 * o, H - 2 * o, R, k.tone(tone), st === 'alert' ? 0.6 + 0.4 * b : 1);
}
function luster(k, x, y, w, h, r) {
const gz = G(k), u = k.m.u;
const d = roundRectPath(x, y, w, h, r);
k.add(path(d, { fill: 'none', stroke: gz.gold, strokeWidth: n(Math.max(0.6, 0.55 * u)), strokeOpacity: 0.45 }));
const per = 2 * (w + h) - (8 - 2 * Math.PI) * Math.min(r, w / 2, h / 2), seg = per * 0.16;
const off = -phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2) * per;
k.add(path(d, { fill: 'none', stroke: k.colors.beam, strokeWidth: n(Math.max(1.4, 1.5 * u)), strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(off), strokeLinecap: 'round' }));
k.add(path(d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(Math.max(0.5, 0.5 * u)), strokeOpacity: 0.85, strokeDasharray: `${n(seg * 0.4)} ${n(per - seg * 0.4)}`, strokeDashoffset: n(off - seg * 0.3), strokeLinecap: 'round' }));
}
function enamelCorner(k, x, y, w, h, r, c, opacity) {
const s = Math.min(w, h) * 0.19, rr = Math.min(r * 0.35, s * 0.2);
const { X, Y } = bezelCorner(k); 
const d = `M${n(X - s)} ${n(Y)}H${n(X - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(X)} ${n(Y + rr)}V${n(Y + s)}Z`;
k.add(path(d, { fill: c, fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
k.add(path(`M${n(X - s * 0.82)} ${n(Y + s * 0.08)}L${n(X - s * 0.08)} ${n(Y + s * 0.82)}`, { fill: 'none', stroke: '#ffffff', strokeWidth: n(Math.max(0.6, k.m.hair)), strokeOpacity: 0.55, strokeLinecap: 'round' }));
}
function plaque(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const gz = G(k), C = k.colors, u = k.m.u;
const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
const pid = k.id('plaque');
k.def(linearGradient(pid, off ? gz.bisque : k.dark ? [[0, '#26429c'], [0.6, '#182e7b'], [1, '#0d1b4d']] : [[0, '#ffffff'], [0.6, '#f3f5f9'], [1, '#e2e7ef']]));
k.add(rect({ x, y, width: w, height: h, fill: url(pid) }));
if (!off) {
k.add(rect({ x, y, width: w, height: Math.max(1, 1.1 * u), fill: gz.pool, fillOpacity: gz.poolA * 0.6 }));
k.add(rect({ x, y: y + h - Math.max(1, 1.4 * u), width: w, height: Math.max(1, 1.4 * u), fill: gz.pool, fillOpacity: gz.poolA }));
}
if (k.ctx.kind === 'screen' && w >= 300 && h >= 150 && !off) {
const i1 = k.m.safe * 0.45, i2 = k.m.safe * 0.62;
k.add(path(roundRectPath(x + i1, y + i1, w - 2 * i1, h - 2 * i1, k.m.radius * 0.8), { fill: 'none', stroke: C.muted, strokeWidth: n(Math.max(1, 0.5 * u)), strokeOpacity: 0.5 }));
k.add(path(roundRectPath(x + i2, y + i2, w - 2 * i2, h - 2 * i2, k.m.radius * 0.6), { fill: 'none', stroke: gz.gold, strokeWidth: n(Math.max(0.6, 0.3 * u)), strokeOpacity: 0.7 }));
}
const b = breath(k, tone);
if (lit) {
const c = k.tone(tone), bh = Math.max(1.5, 1.6 * u), by = y + h - 3.4 * u;
const wid = k.id('ppool');
k.def(linearGradient(wid, [[0, c, 0], [1, c, (k.dark ? 0.22 : 0.1) * b]]));
k.add(rect({ x, y: y + h * 0.45, width: w, height: h * 0.55, fill: url(wid) }));
k.add(rect({ x: x + k.m.safe, y: by, width: w - 2 * k.m.safe, height: bh, rx: bh / 2, fill: c, fillOpacity: b < 1 ? n(b, 3) : null }));
k.add(rect({ x: x + k.m.safe, y: by - 1.5 * u, width: w - 2 * k.m.safe, height: Math.max(0.6, 0.4 * u), fill: gz.gold, fillOpacity: 0.85 }));
}
if (st === 'busy') {
const gy = y + h - 3.4 * u, p = phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2), pw = w - 2 * k.m.safe, gw = pw * 0.2;
const gx = x + k.m.safe - gw + (pw + gw) * p;
k.add(rect({ x: x + k.m.safe, y: gy, width: pw, height: Math.max(0.6, 0.4 * u), fill: gz.gold, fillOpacity: 0.45 }));
const lid = k.id('lust');
k.def(linearGradient(lid, [[0, C.beam, 0], [0.5, C.beam, 1], [1, C.beam, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
const x0 = Math.max(x + k.m.safe, gx), x1 = Math.min(x + k.m.safe + pw, gx + gw);
if (x1 > x0) k.add(rect({ x: x0, y: gy - 0.4 * u, width: x1 - x0, height: Math.max(1, 1.2 * u), fill: url(lid) }));
}
if (!off) {
const id = k.id('pgloss');
k.def(linearGradient(id, [[0, '#ffffff', gz.gloss * 0.8], [1, '#ffffff', 0]]));
k.add(rect({ x: x + k.m.safe * 0.5, y: y + 1.2 * u, width: w - k.m.safe, height: Math.min(h * 0.2, 14 * u), rx: Math.min(h * 0.1, 7 * u), fill: url(id) }));
}
if (flagged(tone)) {
const s = Math.min(w, h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h }); 
k.add(polygon([[X - s, Y], [X, Y], [X, Y + s]], { fill: k.tone(tone), fillOpacity: st === 'alert' ? n(0.6 + 0.4 * b, 3) : null }));
}
}
function porcelainText(k, role, str, o = {}) {
const markup = defaultText(k, role, str, o);
if (stateOf(k.toneName) === 'off' || (role !== 'value' && role !== 'hero')) return markup;
const st = k.typeStyle(role, o);
const bare = markup.replace(/ (stroke|stroke-width|stroke-linejoin|fill-opacity|opacity)="[^"]*"/g, '');
const halo = bare.replace(/ fill="(#[0-9a-fA-F]{6})"/g, (m, c) => ` fill="${c}" stroke="${c}" stroke-width="${n(st.size * 0.07)}" stroke-linejoin="round" opacity="${n(G(k).bleed * 1.1, 3)}"`);
return halo + markup;
}
const draw = (id) => getGlyph(id)?.draw;
const __default = defineTheme({
id: 'porcelain',
title: 'Porcelain',
description: 'Glossy white ceramic tiles painted in cobalt: underglaze brushwork, raised enamel when lit, china bands and gold luster. By night, cobalt-glazed porcelain with white slip.',
tags: ['porcelain', 'ceramic', 'glaze', 'cobalt', 'light', 'dark'],
modes: { light: DAY, dark: NIGHT },
defaultMode: 'light',
tones: { idle: 'accent', active: 'tint', busy: 'accent2' },
roles: {
line: { color: 'ink', width: 2.6 },
fill: { color: 'ink' },
accent: { color: (k, tone) => (stateOf(tone) === 'on' || stateOf(tone) === 'alert' ? k.tone(tone) : k.colors.accent), width: 2.7 },
dim: { color: 'muted', width: 2.1, opacity: 1 },
spark: { color: (k, tone) => (stateOf(tone) === 'on' || stateOf(tone) === 'alert' ? k.tone(tone) : k.colors.accent) },
},
type: {
eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.18, color: 'muted' },
label: { size: 11, weight: 600, tracking: 0.01, color: 'ink', baseline: 11 },
value: { size: 22, weight: 600, tabular: true, tracking: -0.01, color: 'ink' },
hero: { size: 30, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
caption: { size: 8.5, weight: 400, tracking: 0.02, color: 'muted' },
},
background: keyTile,
surface: plaque,
paintGlyph: paintPorcelain,
paint(k, prim, style) { return paintPorcelain(k, onePen(prim), { tone: k.toneName, styleOf: () => style }); },
text: porcelainText,
press(k, { pressed, age }) {
const dur = 0.62;
if (!pressed && !(age < dur)) return null;
const gz = G(k), W = k.w, H = k.h, u = k.m.u;
const give = pressed ? 1 : 1 - outExpo(clamp(age / 0.2));
const s = 1 - 0.028 * give, cx = W / 2, cy = H / 2;
const { o, R } = tileGeom(k);
let overlay = '';
if (give > 0.02) {
const id = k.id('tilt');
k.def(linearGradient(id, [[0, gz.shadow, 0.16 * give], [0.4, gz.shadow, 0]]));
overlay += path(roundRectPath(o, o, W - 2 * o, H - 2 * o, R), { fill: url(id) });
}
if (!pressed && !k.ctx.reduced) {
for (const [delay, wgt] of [[0, 1], [0.13, 0.7]]) {
const a = age - delay;
if (a <= 0 || a > 0.48) continue;
const p = outCubic(a / 0.48), rr = lerp(0.16, 0.64, p) * Math.min(W, H);
overlay += `<circle cx="${n(cx)}" cy="${n(H * 0.44)}" r="${n(rr)}" fill="none" stroke="${gz.ring}" stroke-width="${n(Math.max(0.75, 0.9 * u * wgt))}" stroke-opacity="${n(0.55 * (1 - p) * wgt, 3)}"/>`;
}
}
return {
transform: give > 0.002 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
under: rect({ width: W, height: H, fill: gz.shelf[1][1] }),
overlay,
};
},
glyphs: {
clock(g, s) {
g.circle(24, 24, 17.5);
g.circle(24, 24, 15.2, { role: 'dim', weight: 0.42 });
for (let i = 0; i < 12; i++) {
const [x, y] = g.polar(24, 24, 12.4, i * 30);
if (i % 3 === 0) {
const [ax, ay] = g.polar(24, 24, 13.9, i * 30), [bx, by] = g.polar(24, 24, 10.9, i * 30);
const [lx, ly] = g.polar(x, y, 1.1, i * 30 - 90), [rx, ry] = g.polar(x, y, 1.1, i * 30 + 90);
g.polygon([[ax, ay], [lx, ly], [bx, by], [rx, ry]], { role: 'fill' });
} else g.circle(x, y, 0.85, { role: 'dim', fill: true });
}
const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
const stroke = (deg, len, w, role) => {
const [tx, ty] = g.polar(24, 24, len, deg), [mx, my] = g.polar(24, 24, len * 0.42, deg);
const [lx, ly] = g.polar(mx, my, w / 2, deg - 90), [rx, ry] = g.polar(mx, my, w / 2, deg + 90), [bx, by] = g.polar(24, 24, 1.6, deg + 180);
g.polygon([[bx, by], [lx, ly], [tx, ty], [rx, ry]], { role, fill: true, join: 'round' });
};
stroke(h * 30, 9, 3.6, 'fill');
stroke(m * 6, 13, 2.8, 'accent');
g.circle(24, 24, 2, { role: 'spark' });
},
bulb(g, s) {
if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
const on = s.state === 'on';
g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
g.line(19, 32.5, 19, 35.5);
g.line(29, 32.5, 29, 35.5);
g.line(19, 35.5, 29, 35.5);
g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
g.polyline([[20.5, 28], [22.5, 23.5], [24, 27], [25.5, 23.5], [27.5, 28]], { role: on ? 'accent' : 'dim', weight: 0.8 });
if (!on) return;
const k = arrive(s.since, 0.45);
[-72, -36, 0, 36, 72].forEach((a, i) => {
const open = clamp(k * 1.6 - i * 0.12);
if (open <= 0.02) return;
const breathe = 0.82 + 0.18 * pulse(s.t + i * 0.24, 2.4);
const r0 = 12.6, r1 = r0 + 3.6 * open * breathe;
const [bx, by] = g.polar(24, 22.5, r0, a), [tx, ty] = g.polar(24, 22.5, r1, a);
const [lx, ly] = g.polar(24, 22.5, r0 + (r1 - r0) * 0.45, a - 7), [rx, ry] = g.polar(24, 22.5, r0 + (r1 - r0) * 0.45, a + 7);
g.polygon([[bx, by], [lx, ly], [tx, ty], [rx, ry]], { role: 'accent', fill: true, join: 'round' });
});
},
},
});
};
__d[248] = function (__ns) {
const { defineTheme, defaultPaint, cornerFlag } = __m(14);
const { TOKENS } = __m(3);
const { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } = __m(5);
const { lerp, clamp, outExpo, pulse, phase } = __m(12);
__e(__ns, { "STATE": () => STATE, "default": () => __default, "material": () => material, "wash": () => wash, "vividOf": () => vividOf, "inkOf": () => inkOf, "stateOf": () => stateOf }, [], ["STATE","default","inkOf","material","stateOf","vividOf","wash"]);
const G = TOKENS.deck;
const pal = (t) => ({
bg: t.bg, surface: t.glassTop, surface2: t.glassBottom, glassMid: t.glassMid, line: t.line, ink: t.ink, muted: t.muted, dim: t.dim, faint: t.faint,
accent: t.accent, accent2: t.accent2, pos: t.pos, info: t.info, warn: t.warn, neg: t.neg, crit: t.crit,
edge: t.edge, edgeOpacity: t.edgeOpacity, beam: t.beam, beamOpacity: t.beamOpacity, spectrum: t.spectrum, stops: t.stops,
});
const STATE = { idle: 'off', active: 'on', ok: 'on', info: 'on', warn: 'alert', neg: 'alert', alert: 'alert', crit: 'alert', busy: 'busy', off: 'disabled' };
const stateOf = (tone) => STATE[tone] || 'off';
const vividOf = (k, tone) => ({ ok: k.colors.pos, info: k.colors.info, warn: k.colors.warn, neg: k.colors.neg, alert: k.colors.neg, crit: k.colors.crit, off: k.colors.faint })[tone] || k.ctx.tint;
const inkOf = (k, tone) => {
const s = stateOf(tone);
if (s === 'on') return tone === 'active' ? k.theme.ink(k.ctx.hue) : vividOf(k, tone);
if (s === 'alert') return k.colors.ink;
if (s === 'disabled') return k.colors.faint;
return k.colors.muted;
};
const breath = (k, tone) => (k.ctx.since >= G.alertBreath.holdAfter || k.ctx.reduced ? 1 : lerp(G.alertBreath.min, G.alertBreath.max, pulse(k.ctx.t, tone === 'crit' ? 0.6 : 1 / G.alertBreath.hz)));
function material(k, { x = 0, y = 0, w = k.w, h = k.h, edge = true } = {}) {
const C = k.colors;
const id = k.id('glass');
k.def(radialGradient(id, [[0, C.surface], [0.62, C.glassMid || C.surface2], [1, C.surface2]], { cx: 0.5, cy: 0, r: 1.15, fx: 0.5, fy: 0 }));
k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
if (edge) k.add(rect({ x, y, width: w, height: k.m.u, fill: C.edge || '#ffffff', fillOpacity: C.edgeOpacity < 1 ? C.edgeOpacity : null }));
}
function wash(k, color, peak, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
const id = k.id('wash');
k.def(radialGradient(id, [[0, color, peak], [0.6, color, peak * 0.35], [1, color, 0]], { cx: 0.5, cy: 1.05, r: 0.9 }));
k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
}
function keyBackground(k, { tone = 'idle' } = {}) {
const s = stateOf(tone);
const u = k.m.u, C = k.colors;
material(k, { edge: s !== 'disabled' });
if (s === 'disabled') return;
const color = vividOf(k, tone);
if (s === 'on') wash(k, color, G.wash);
if (s === 'alert') wash(k, color, G.wash * breath(k, tone));
if (s === 'on' || s === 'alert') {
const rw = (s === 'on' ? G.ring.on : G.ring.alert) * u;
k.add(rect({ x: rw / 2, y: rw / 2, width: k.w - rw, height: k.h - rw, rx: k.m.radius, fill: 'none', stroke: color, strokeWidth: rw, strokeOpacity: s === 'alert' ? n(breath(k, tone), 3) : null }));
}
if (s === 'busy') {
const inset = k.m.hair, r = k.m.radius;
const d = roundRectPath(inset, inset, k.w - inset * 2, k.h - inset * 2, r);
const per = 2 * (k.w + k.h - inset * 4) - (8 - 2 * Math.PI) * r;
const seg = per * 0.16;
const off = -phase(k.ctx.t, G.busyLap) * per;
k.add(path(d, { fill: 'none', stroke: C.beam || '#ffffff', strokeWidth: k.m.line * 1.6, strokeOpacity: 0.14, strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(off), strokeLinecap: 'round' }));
k.add(path(d, { fill: 'none', stroke: C.beam || '#ffffff', strokeWidth: k.m.line, strokeDasharray: `${n(seg * 0.7)} ${n(per - seg * 0.7)}`, strokeDashoffset: n(off - seg * 0.15), strokeLinecap: 'round' }));
return;
}
if (s === 'alert') k.add(polygon(cornerFlag(k, G.notch * u), { fill: color }));
const iw = G.index.w * u, ih = G.index.h * u, iy = k.h - G.index.bottom * u - ih / 2;
const op = s === 'off' ? G.index.offOpacity : 1;
if (s !== 'off') k.add(rect({ x: k.w / 2 - iw / 2 - G.index.glow * u, y: iy - G.index.glow * u * 0.6, width: iw + G.index.glow * 2 * u, height: ih + G.index.glow * 1.2 * u, rx: (ih + G.index.glow * 1.2 * u) / 2, fill: color, fillOpacity: 0.22 }));
k.add(rect({ x: k.w / 2 - iw / 2, y: iy, width: iw, height: ih, rx: ih / 2, fill: color, fillOpacity: op < 1 ? op : null }));
}
function panelSurface(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
const s = stateOf(tone);
material(k, { x, y, w, h, edge: s !== 'disabled' });
if (s === 'on') wash(k, vividOf(k, tone), G.wash * 0.8, { x, y, w, h });
if (s === 'alert') wash(k, vividOf(k, tone), G.wash * breath(k, tone), { x, y, w, h });
if (s === 'on' || s === 'alert') {
const id = k.id('beam'), c = vividOf(k, tone);
k.def(linearGradient(id, [[0, c, 0], [0.5, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: x + k.m.safe, y, width: w - k.m.safe * 2, height: k.m.line, fill: url(id) }));
}
}
const lit = (tone) => { const s = stateOf(tone); return s === 'on' || s === 'alert'; };
const __default = defineTheme({
id: 'prism',
title: 'Prism',
description: 'Refraction: ink-navy glass lit from the top (pearl by day), a spectral index on every key, rings and washes of light for on and alert, presses that refract.',
tags: ['signature', 'glass', 'spectrum', 'dark', 'light'],
modes: { dark: pal(TOKENS.modes.night), light: pal(TOKENS.modes.day) },
defaultMode: 'dark',
tones: { idle: 'tint', active: 'tint', busy: 'muted' },
roles: {
line: { color: inkOf, width: 2.6 },
fill: { color: inkOf },
accent: { color: (k, tone) => (lit(tone) ? vividOf(k, tone) : stateOf(tone) === 'disabled' ? k.colors.faint : k.colors.dim), width: 2.8, glow: 0.45 },
dim: { color: (k, tone) => (stateOf(tone) === 'on' && tone === 'active' ? k.theme.ink(k.ctx.hue) : stateOf(tone) === 'disabled' ? k.colors.faint : k.colors.dim), width: 2.2, opacity: 0.85 },
spark: { color: (k, tone) => (lit(tone) ? vividOf(k, tone) : k.colors.muted), glow: 0.7 },
},
type: {
eyebrow: { size: G.type.micro.size, weight: G.type.micro.weight, caps: G.type.micro.caps, tracking: G.type.micro.tracking, color: 'muted' },
label: { size: G.type.label.size, weight: G.type.label.weight, tracking: G.type.label.tracking, color: 'ink', baseline: 11 },
value: { size: G.type.value.size, weight: G.type.value.weight, tracking: G.type.value.tracking, tabular: true, color: 'ink' },
hero: { size: 30, weight: 700, tracking: -0.03, tabular: true, color: 'ink' },
caption: { size: G.type.minimum, weight: 400, color: 'muted' },
},
background: keyBackground,
surface: panelSurface,
paint(k, prim, style) { return defaultPaint(k, prim, lit(k.toneName) ? style : { ...style, glow: 0 }); },
press(k, { pressed, age }) {
const dur = G.motion.arrive;
if (!pressed && !(age < dur)) return null;
const e = pressed ? 1 : 1 - outExpo(clamp(age / dur));
const s = 1 - 0.045 * e, cx = k.w / 2, cy = k.h / 2;
const split = k.m.line * 1.6 * e;
const ring = (dx, hue, op) => rect({ x: k.m.hair + dx, y: k.m.hair, width: k.w - k.m.hair * 2, height: k.h - k.m.hair * 2, rx: k.m.radius, fill: 'none', stroke: k.theme.spectral(hue), strokeWidth: k.m.line, strokeOpacity: n(op * e, 3) });
const h = k.ctx.hue;
return {
transform: `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})`,
under: rect({ width: k.w, height: k.h, fill: '#000000' }),
overlay: ring(-split, h - 60, 0.7) + ring(split, h + 60, 0.7) + ring(0, h, 0.9),
};
},
});
};
__d[249] = function (__ns) {
const m0 = __m(232);
const m1 = __m(233);
const m2 = __m(235);
const m3 = __m(237);
const m4 = __m(239);
const m5 = __m(240);
const m6 = __m(241);
const m7 = __m(244);
const m8 = __m(246);
const m9 = __m(247);
const m10 = __m(248);
__e(__ns, { "THEME_MODULES": () => THEME_MODULES }, [], ["THEME_MODULES"]);
const THEME_MODULES = [
['aurora.js', m0],
['blueprint.js', m1],
['chrome.js', m2],
['ember.js', m3],
['mono.js', m4],
['neon.js', m5],
['paper.js', m6],
['phosphor.js', m7],
['pixel.js', m8],
['porcelain.js', m9],
['prism.js', m10],
];
};
__d[250] = function (__ns) {
const { THEME_MODULES } = __m(249);
__e(__ns, { "DEFAULT_THEME": () => DEFAULT_THEME, "themeRegistry": () => themeRegistry, "allThemes": () => allThemes, "THEME_IDS": () => THEME_IDS, "useTheme": () => useTheme }, [], ["DEFAULT_THEME","THEME_IDS","allThemes","themeRegistry","useTheme"]);
const DEFAULT_THEME = 'prism';
let cache = null;
function themeRegistry() {
if (cache) return cache;
const themes = new Map(), problems = [];
for (const [file, mod] of THEME_MODULES) {
const t = mod.default;
if (!t || typeof t.resolve !== 'function') { problems.push(`${file}: default export must be defineTheme({...})`); continue; }
if (`${t.id}.js` !== file) problems.push(`${file}: theme id "${t.id}" must match its file name`);
if (themes.has(t.id)) problems.push(`duplicate theme id "${t.id}"`);
themes.set(t.id, t);
}
cache = { themes, problems };
return cache;
}
const allThemes = () => [...themeRegistry().themes.values()];
const THEME_IDS = () => [...themeRegistry().themes.keys()];
function useTheme(id = DEFAULT_THEME, mode) {
let t = id, m = mode;
if (typeof id === 'string') {
const [name, md] = id.split(':');
m = m || md;
t = themeRegistry().themes.get(name) || themeRegistry().themes.get(DEFAULT_THEME) || allThemes()[0];
}
if (!t) throw new Error('no themes registered');
return Object.freeze({ ...t, ...t.resolve(m) });
}
};
__d[251] = function (__ns) {
const { getDevice, keySize, spanGrid, stripGrid, deckLayout, screenOf } = __m(0);
const { rng: makeRng, hash, noise1, noise2, fbm1, metric, series } = __m(1);
const { getGallery } = __m(2);
const { useTheme } = __m(250);
const { glyphRegistry } = __m(231);
__e(__ns, { "MOTION_LEVELS": () => MOTION_LEVELS, "resolveParams": () => resolveParams, "clockOf": () => clockOf, "SCREEN_TARGETS": () => SCREEN_TARGETS, "screenTarget": () => screenTarget, "DEFAULT_DEVICE": () => DEFAULT_DEVICE, "createContext": () => createContext, "gameGrid": () => gameGrid }, [], ["DEFAULT_DEVICE","MOTION_LEVELS","SCREEN_TARGETS","clockOf","createContext","gameGrid","resolveParams","screenTarget"]);
const DEFAULT_NOW = Date.UTC(2026, 3, 14, 9, 41, 0); 
const MOTION_LEVELS = Object.freeze(['full', 'calm', 'still']);
function resolveParams(decl = {}, overrides = {}) {
const out = {};
for (const [k, p] of Object.entries(decl)) {
let v = overrides && Object.hasOwn(overrides, k) ? overrides[k] : p.default;
if (p.type === 'number' || p.type === 'hue') { v = Number(v); if (!Number.isFinite(v)) v = p.default; if (typeof p.min === 'number') v = Math.max(p.min, v); if (typeof p.max === 'number') v = Math.min(p.max, v); }
else if (p.type === 'bool') v = v === true || v === 'true' || v === 1 || v === '1';
else if (p.type === 'select') { const opts = (p.options || []).map((o) => (typeof o === 'object' ? o.value : o)); if (!opts.includes(v)) v = p.default; }
else if (p.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(String(v))) v = p.default; }
else v = String(v ?? '').slice(0, p.maxLength || 48);
out[k] = v;
}
return out;
}
function clockOf(now, tzOffset = 0) {
const d = new Date(now + tzOffset * 60000);
return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(), tzOffset };
}
const SCREEN_TARGETS = {
galleon: { kind: 'galleon', w: 720, h: 384, widgets: { cols: 2, rows: 2, w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 } },
'galleon-widget': { kind: 'galleon-widget', w: 360, h: 180 },
infobar: { kind: 'infobar', w: 232, h: 50, native: { w: 248, h: 58 } },
monitor: { kind: 'monitor', w: 2560, h: 720 },
};
function screenTarget(name, device) {
if (SCREEN_TARGETS[name]) return SCREEN_TARGETS[name];
const s = screenOf(device);
if (s?.kind === 'infobar') return SCREEN_TARGETS.infobar;
if (s?.kind === 'monitor') return SCREEN_TARGETS.monitor;
return SCREEN_TARGETS.galleon;
}
const DEFAULT_DEVICE = { key: 'mk2', span: 'mk2', strip: 'plus', screen: 'galleon', deck: 'mk2' };
function createContext(facet, opts = {}) {
const kind = facet.surface;
const device = getDevice(opts.device || facet.devices?.[0] || DEFAULT_DEVICE[kind] || 'mk2');
const theme = useTheme(facet.theme || opts.theme || 'prism', opts.mode);
let w, h, grid = null, strip = null, screen = null, deck = null;
if (kind === 'key') {
const s = opts.size ? (typeof opts.size === 'number' ? { w: opts.size, h: opts.size } : opts.size) : keySize(device);
({ w, h } = s);
} else if (kind === 'span') {
const span = { ...(facet.span || {}), ...(opts.span || {}) };
grid = opts.grid || spanGrid(device, { col: span.col || 0, row: span.row || 0, cols: span.cols === 'all' ? undefined : span.cols, rows: span.rows === 'all' ? undefined : span.rows });
({ w, h } = grid);
} else if (kind === 'strip') {
const sg = stripGrid(device.strip ? device : 'plus');
const segs = facet.segments === 1 ? 1 : Math.max(1, Math.min(sg.segments.length, opts.segments || sg.segments.length));
strip = { segments: segs, of: sg.segments.length, segment: opts.segment ?? null };
w = 200 * segs; h = 100;
} else if (kind === 'screen') {
screen = screenTarget(opts.screen || facet.screens?.[0], device);
({ w, h } = screen);
} else if (kind === 'deck') {
deck = deckLayout(device, 1);
grid = { key: keySize(device), cells: deck.keys };
({ w, h } = deck);
} else throw new Error(`unknown surface "${kind}"`);
const params = resolveParams(facet.params, opts.params);
const states = facet.states || [];
const state = states.length ? ((Math.trunc(opts.state || 0) % states.length) + states.length) % states.length : 0;
const stateName = states[state] ?? null;
const gallery = getGallery(facet.gallery);
const hue = typeof params.hue === 'number' ? params.hue : (opts.hue ?? gallery?.hue ?? 296);
const seed = (opts.seed ?? 7) >>> 0;
const t = Math.max(0, +opts.t || 0);
const now = opts.now ?? DEFAULT_NOW + t * 1000;
const idPrefix = opts.idPrefix || `pd${(hash(seed, ...[...String(facet.id || '')].map((c) => c.charCodeAt(0))) * 2176782336 >>> 0).toString(36)}`;
const segCount = strip ? strip.segments : 4;
return {
kind, facet, w, h, size: Math.min(w, h),
device, grid, strip, screen, deck,
theme, colors: theme.colors, glyphs: glyphRegistry().glyphs,
t, frame: opts.frame ?? Math.round(t * 30), fps: opts.fps ?? facet.fps,
state, stateName, states, since: opts.since ?? t, tone: (stateName && facet.tones?.[stateName]) || 'idle',
pressed: !!opts.pressed, pressAge: opts.pressAge ?? Infinity, pressKey: Number.isInteger(opts.pressKey) ? opts.pressKey : null, pressedFor: opts.pressed && Number.isFinite(opts.pressedFor) ? Math.max(0, opts.pressedFor) : 0, heldFor: Number.isFinite(opts.heldFor) ? Math.max(0, opts.heldFor) : 0,
value: typeof opts.value === 'number' ? Math.min(1, Math.max(0, opts.value)) : (typeof params.value === 'number' ? params.value : 0.5),
ticks: opts.ticks || 0, turnAge: Number.isFinite(opts.turnAge) ? Math.max(0, opts.turnAge) : Infinity,
touch: (kind === 'strip' || kind === 'screen') && device.dials?.touch !== false && opts.touch ? { x: +opts.touch.x || 0, y: +opts.touch.y || 0, hold: !!opts.touch.hold, age: Number.isFinite(opts.touch.age) ? Math.max(0, opts.touch.age) : 0 } : undefined,
values: Array.isArray(opts.values) ? opts.values.map((x) => Math.min(1, Math.max(0, +x || 0))) : Array.from({ length: segCount }, (_, i) => [0.35, 0.8, 0.55, 0.2, 0.65, 0.45][i % 6]),
params, hue, tint: theme.spectral(hue),
seed, rng: () => makeRng(seed),
noise: { n1: (x) => noise1(x, seed), n2: (x, y) => noise2(x, y, seed), fbm: (x) => fbm1(x, seed), metric: (tt, o) => metric(tt, seed, o), series: (tt, c, o) => series(tt, seed, c, o) },
now, clock: clockOf(now, opts.tzOffset ?? 0),
data: opts.data || {},
idPrefix, id: (name) => `${idPrefix}-${name}`,
reduced: !!opts.reduced,
motion: opts.reduced ? 'still' : MOTION_LEVELS.includes(opts.motion) ? opts.motion : 'full', 
...(facet.game ? gameFields(facet, opts, { kind, grid, device, seed, params }) : {}),
};
}
function gameGrid({ kind, grid }) {
if (kind === 'key' || !grid?.cells?.length) return { cols: 1, rows: 1, cells: [{ i: 0, col: 0, row: 0 }] };
const cells = grid.cells;
const c0 = Math.min(...cells.map((c) => c.col)), r0 = Math.min(...cells.map((c) => c.row));
return { cols: Math.max(...cells.map((c) => c.col)) - c0 + 1, rows: Math.max(...cells.map((c) => c.row)) - r0 + 1, cells: cells.map((c) => ({ i: c.i, col: c.col - c0, row: c.row - r0 })) };
}
function gameFields(facet, opts, { kind, grid, device, seed, params }) {
let game = opts.game;
if (game === undefined) game = facet.game.init({ seed, device: device.id, grid: gameGrid({ kind, grid }), params });
const ev = opts.gameEvent;
return { game, gamePrev: opts.gamePrev ?? null, gameEvent: ev ? { ...ev, age: Number.isFinite(ev.age) ? Math.max(0, ev.age) : 0 } : null };
}
};
__d[252] = function (__ns) {
const { parsePath, arcBounds } = __m(13);
__e(__ns, { "splitElements": () => splitElements, "parseTransform": () => parseTransform, "pathHullBounds": () => pathHullBounds, "elementBounds": () => elementBounds, "prepareCull": () => prepareCull, "cullInner": () => cullInner }, [], ["cullInner","elementBounds","parseTransform","pathHullBounds","prepareCull","splitElements"]);
const NUM = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
function tagEnd(s, i) {
let gt = s.indexOf('>', i + 1);
while (gt >= 0) {
let q = 0;
for (let j = s.indexOf('"', i); j >= 0 && j < gt; j = s.indexOf('"', j + 1)) q++;
if (q % 2 === 0) return gt;
gt = s.indexOf('>', gt + 1);
}
return -1;
}
const MEMO_MAX = 6000;
const pathMemo = new Map(), elMemo = new Map();
function memo(map, key, fn) {
const hit = map.get(key);
if (hit !== undefined) return hit;
const v = fn();
if (map.size >= MEMO_MAX) map.delete(map.keys().next().value);
map.set(key, v);
return v;
}
function splitElements(s) {
const out = [];
let i = 0;
while (i < s.length) {
const lt = s.indexOf('<', i);
if (lt < 0) break;
let j = lt, depth = 0;
for (;;) {
const gt = tagEnd(s, j);
if (gt < 0) throw new Error('cull: unterminated tag');
const closing = s[j + 1] === '/', selfClosing = s[gt - 1] === '/', decl = s[j + 1] === '!' || s[j + 1] === '?';
if (closing) depth--;
else if (!selfClosing && !decl) depth++;
j = gt + 1;
if (depth <= 0) break;
j = s.indexOf('<', j);
if (j < 0) throw new Error('cull: unclosed element');
}
out.push(s.slice(lt, j));
i = j;
}
return out;
}
function parseElement(str) {
const gt = tagEnd(str, 0);
const open = str.slice(1, gt).replace(/\/$/, '');
const tag = open.match(/^[A-Za-z][\w:.-]*/)[0];
const attrs = {};
for (const m of open.slice(tag.length).matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
const selfClosing = str[gt - 1] === '/';
const inner = selfClosing ? '' : str.slice(gt + 1, str.lastIndexOf('</'));
return { tag, attrs, inner };
}
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function parseTransform(str) {
let m = [1, 0, 0, 1, 0, 0];
const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
let seen = 0, mt;
while ((mt = re.exec(str))) {
seen += mt[0].length;
const v = mt[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
if (v.some((x) => !Number.isFinite(x))) return null;
switch (mt[1]) {
case 'matrix': if (v.length !== 6) return null; m = mul(m, v); break;
case 'translate': m = mul(m, [1, 0, 0, 1, v[0] || 0, v[1] || 0]); break;
case 'scale': m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]); break;
case 'rotate': { const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); break; }
case 'skewX': m = mul(m, [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0]); break;
case 'skewY': m = mul(m, [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0]); break;
default: return null;
}
}
if (str.replace(/[\s,]/g, '').length && !seen) return null;
return m;
}
const boxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return x0 === Infinity ? null : [x0, y0, x1, y1]; };
const grow = (b, d) => (b ? [b[0] - d, b[1] - d, b[2] + d, b[3] + d] : b);
const union = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const applyBox = (b, m) => (b ? boxOf([[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])) : b);
const pathHullBounds = (d) => memo(pathMemo, d, () => {
const pts = [];
for (const { c, v } of parsePath(d)) {
if (c === 'A') { const b = arcBounds(...v); pts.push([b[0], b[1]], [b[2], b[3]]); }
else for (let i = 0; i < v.length; i += 2) pts.push([v[i], v[i + 1]]);
}
return boxOf(pts);
});
const EMPTY = 'empty';
function elementBounds(str, inherited = {}, clips = null) {
if (clips && str.includes('clip-path=')) return bounds(str, inherited, clips); 
const key = `${inherited.stroke || ''}|${inherited.strokeWidth || ''}|${str}`;
return memo(elMemo, key, () => bounds(str, inherited, clips));
}
function bounds(str, inherited, clips) {
let el;
try { el = parseElement(str); } catch { return null; }
const { tag, attrs: a } = el;
const strokeOn = (a.stroke ?? inherited.stroke) && (a.stroke ?? inherited.stroke) !== 'none';
const sw = NUM(a['stroke-width'] ?? inherited.strokeWidth, 1);
const margin = (strokeOn ? sw * 2 : 0) + 1;
let box;
switch (tag) {
case 'rect': { const x = NUM(a.x), y = NUM(a.y), w = NUM(a.width, NaN), h = NUM(a.height, NaN); if (!Number.isFinite(w) || !Number.isFinite(h)) return null; box = [x, y, x + w, y + h]; break; }
case 'circle': { const cx = NUM(a.cx), cy = NUM(a.cy), r = NUM(a.r); box = [cx - r, cy - r, cx + r, cy + r]; break; }
case 'ellipse': { const cx = NUM(a.cx), cy = NUM(a.cy), rx = NUM(a.rx), ry = NUM(a.ry); box = [cx - rx, cy - ry, cx + rx, cy + ry]; break; }
case 'line': box = boxOf([[NUM(a.x1), NUM(a.y1)], [NUM(a.x2), NUM(a.y2)]]); break;
case 'polyline': case 'polygon': { const v = (a.points || '').trim().split(/[\s,]+/).map(Number); const pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]); box = boxOf(pts); if (!box) return EMPTY; break; }
case 'path': { if (!a.d) return EMPTY; try { box = pathHullBounds(a.d); } catch { return null; } if (!box) return EMPTY; break; }
case 'g': {
const clipId = (a['clip-path'] || '').match(/^url\(#([^)]+)\)$/)?.[1];
if (clipId && clips?.has(clipId)) box = clips.get(clipId); 
else {
const inh = { stroke: a.stroke ?? inherited.stroke, strokeWidth: a['stroke-width'] ?? inherited.strokeWidth };
let kids;
try { kids = splitElements(el.inner); } catch { return null; }
for (const k of kids) {
const b = elementBounds(k, inh, clips);
if (b === null) return null;
if (b !== EMPTY) box = union(box, b);
}
if (!box) return EMPTY;
}
if (a.transform) { const m = parseTransform(a.transform); if (!m) return null; box = applyBox(box, m); }
return box;
}
default: return null;
}
box = grow(box, margin);
if (a.transform) { const m = parseTransform(a.transform); if (!m) return null; box = applyBox(box, m); }
return box;
}
const refsIn = (s) => { const out = new Set(); for (const m of s.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) out.add(m[1] || m[2]); return out; };
const CLIP_RECT = /^<clipPath[^>]*><rect([^>]*?)\/><\/clipPath>$/;
function prepareCull(svg) {
try {
const a = svg.indexOf('>', svg.indexOf('<svg'));
const b = svg.lastIndexOf('</svg>');
if (a < 0 || b < 0) return null;
const parts = splitElements(svg.slice(a + 1, b));
let title = '';
const defs = [], body = [], clips = new Map();
for (const p of parts) {
if (p.startsWith('<title')) { title = p; continue; }
if (p.startsWith('<defs')) {
for (const d of splitElements(parseElement(p).inner)) {
const id = (d.match(/^<[^>]*?\sid="([^"]+)"/) || [])[1] || null;
defs.push({ id, str: d, refs: refsIn(d) });
const cm = id && d.startsWith('<clipPath') && !/clipPathUnits="objectBoundingBox"|transform=/.test(d) && d.match(CLIP_RECT);
if (cm) {
const r = parseElement(`<rect${cm[1]}/>`).attrs;
const x = NUM(r.x), y = NUM(r.y), w = NUM(r.width, NaN), h = NUM(r.height, NaN);
if (Number.isFinite(w) && Number.isFinite(h) && !r.transform) clips.set(id, [x, y, x + w, y + h]);
}
}
continue;
}
const box = clips.size && p.includes('clip-path=') ? bounds(p, {}, clips) : elementBounds(p);
body.push({ str: p, box });
}
return { title, defs, body };
} catch { return null; }
}
function cullInner(prep, { x, y, w, h }) {
const X0 = x, Y0 = y, X1 = x + w, Y1 = y + h;
const kept = prep.body.filter((e) => e.box !== EMPTY && (e.box === null || !(e.box[2] <= X0 || e.box[0] >= X1 || e.box[3] <= Y0 || e.box[1] >= Y1)));
const want = new Set();
for (const e of kept) for (const r of refsIn(e.str)) want.add(r);
const byId = new Map(prep.defs.filter((d) => d.id).map((d) => [d.id, d]));
const queue = [...want];
while (queue.length) { const d = byId.get(queue.pop()); if (!d) continue; for (const r of d.refs) if (!want.has(r)) { want.add(r); queue.push(r); } }
const defs = prep.defs.filter((d) => !d.id || want.has(d.id)).map((d) => d.str).join('');
return `${prep.title}${defs ? `<defs>${defs}</defs>` : ''}${kept.map((e) => e.str).join('')}`;
}
};
__d[253] = function (__ns) {
const { createContext } = __m(251);
const { svgWindow, suffixIds, n, SVG_NS } = __m(5);
const { prepareCull, cullInner } = __m(252);
__e(__ns, { "renderFacet": () => renderFacet, "renderWithContext": () => renderWithContext, "render": () => render, "renderKey": () => renderKey, "renderSpan": () => renderSpan, "renderStrip": () => renderStrip, "renderScreen": () => renderScreen, "renderDeck": () => renderDeck, "stillTime": () => stillTime, "nextState": () => nextState }, [], ["nextState","render","renderDeck","renderFacet","renderKey","renderScreen","renderSpan","renderStrip","renderWithContext","stillTime"]);
function renderFacet(facet, opts = {}) {
const ctx = createContext(facet, opts);
const out = facet.render(ctx);
if (typeof out !== 'string') throw new Error(`${facet.id}: render(ctx) must return a string, got ${typeof out}`);
return out;
}
function renderWithContext(facet, opts = {}) {
const ctx = createContext(facet, opts);
const svg = facet.render(ctx);
if (typeof svg !== 'string') throw new Error(`${facet.id}: render(ctx) must return a string, got ${typeof svg}`);
return { ctx, svg };
}
function windowFor(svg, prep, r, opts, suffix) {
const outW = r.w * (opts.outScale || 1), outH = r.h * (opts.outScale || 1);
if (!prep) return svgWindow(svg, { x: r.x, y: r.y, w: r.w, h: r.h, outW, outH, idSuffix: opts.uniqueIds ? suffix : '' });
const inner = cullInner(prep, r);
return `<svg xmlns="${SVG_NS}" width="${n(outW)}" height="${n(outH)}" viewBox="${n(r.x)} ${n(r.y)} ${n(r.w)} ${n(r.h)}">${opts.uniqueIds ? suffixIds(inner, suffix) : inner}</svg>`;
}
function render(facet, opts = {}) {
const { ctx, svg } = renderWithContext(facet, opts);
const out = { surface: ctx.kind, svg, w: ctx.w, h: ctx.h, device: ctx.device.id };
const sliced = ctx.kind === 'span' || ctx.kind === 'deck' || ctx.kind === 'strip' || (ctx.kind === 'screen' && ctx.screen.widgets);
const prep = sliced && opts.cull !== false ? prepareCull(svg) : null;
const win = (s, r, o, suffix) => windowFor(s, prep, r, o, suffix);
if (ctx.kind === 'span') out.keys = ctx.grid.cells.map((c) => ({ i: c.i, col: c.col, row: c.row, svg: win(svg, c, opts, `k${c.i}`) }));
else if (ctx.kind === 'strip') out.segments = Array.from({ length: ctx.strip.segments }, (_, i) => win(svg, { x: i * 200, y: 0, w: 200, h: 100 }, opts, `s${i}`));
else if (ctx.kind === 'screen' && ctx.screen.widgets) {
const { cols, rows, w, h, pitchX = w, pitchY = h, insetX = 0, insetY = 0 } = ctx.screen.widgets;
out.widgets = [];
for (let layer = 0; layer < rows; layer++) for (let dial = 0; dial < cols; dial++) {
const r = { x: dial * pitchX + insetX, y: layer * pitchY + insetY, w, h };
out.widgets.push({ dial, layer, ...r, svg: win(svg, r, opts, `w${dial}${layer}`) });
}
} else if (ctx.kind === 'deck') {
out.keys = ctx.deck.keys.map((c) => ({ i: c.i, col: c.col, row: c.row, svg: win(svg, c, opts, `k${c.i}`) }));
if (ctx.deck.strip) out.segments = Array.from({ length: ctx.deck.strip.segments }, (_, i) => win(svg, { x: ctx.deck.strip.x + i * (ctx.deck.strip.w / ctx.deck.strip.segments), y: ctx.deck.strip.y, w: ctx.deck.strip.w / ctx.deck.strip.segments, h: ctx.deck.strip.h }, opts, `s${i}`));
if (ctx.deck.screen) out.screen = win(svg, ctx.deck.screen, opts, 'scr');
const G = ctx.deck.screen && ctx.device.screen?.widgets;
if (G) {
const S = ctx.deck.screen, { cols, rows, w, h, pitchX = w, pitchY = h, insetX = 0, insetY = 0 } = G;
out.widgets = [];
for (let layer = 0; layer < rows; layer++) for (let dial = 0; dial < cols; dial++) {
const r = { x: S.x + dial * pitchX + insetX, y: S.y + layer * pitchY + insetY, w, h };
out.widgets.push({ dial, layer, ...r, svg: win(svg, r, opts, `w${dial}${layer}`) });
}
}
}
return out;
}
const renderKey = (facet, opts) => renderFacet(facet, opts);
const renderSpan = (facet, opts) => render(facet, opts);
const renderStrip = (facet, opts) => render(facet, opts);
const renderScreen = (facet, opts) => render(facet, opts);
const renderDeck = (facet, opts) => render(facet, opts);
const stillTime = (facet) => (typeof facet.still === 'number' && Number.isFinite(facet.still) ? Math.max(0, facet.still) : facet.animated ? Math.min(facet.loop * 0.4, 6) : 0);
function nextState(facet, state) {
const n = facet.states?.length || 0;
if (!n || facet.press === 'momentary' || facet.press === 'none') return state;
return (state + 1) % n;
}
};
__d[254] = function (__ns) {
const { deviceLayout, getDevice } = __m(0);
const { useTheme } = __m(250);
const { esc, n } = __m(5);
const { textPath, pad2 } = __m(11);
__e(__ns, { "DEVICE_CSS": () => DEVICE_CSS, "infobarSvg": () => infobarSvg, "deviceMarkup": () => deviceMarkup }, [], ["DEVICE_CSS","deviceMarkup","infobarSvg"]);
const SANS = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'Cascadia Mono', Consolas, ui-monospace, monospace";
const DEVICE_CSS = `
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
function infobarSvg(theme = 'prism', { clock = { h: 9, m: 41 }, page = 0, pages = 3 } = {}) {
const T = useTheme(theme);
const dots = Array.from({ length: pages }, (_, i) => `<circle cx="${n(124 - (pages - 1) * 7 + i * 14)}" cy="47" r="${i === page ? 3 : 2.2}" fill="${i === page ? T.colors.accent : '#5b5d6b'}"/>`).join('');
return `<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58" viewBox="0 0 248 58"><rect width="248" height="58" fill="#05060a"/>`
+ `${textPath(`${clock.h}:${pad2(clock.m)}`, { x: 124, y: 33, size: 24, weight: 600, anchor: 'middle', fill: '#f0f0f5', tabular: true })}${dots}</svg>`;
}
function deviceMarkup(model, opts = {}) {
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
};
__d[255] = function (__ns) {
const { TOKENS } = __m(3);
__e(__ns, { "FPS_CAP": () => FPS_CAP, "effectiveFps": () => effectiveFps, "quantize": () => quantize, "createScheduler": () => createScheduler, "createChangeGovernor": () => createChangeGovernor }, [], ["FPS_CAP","createChangeGovernor","createScheduler","effectiveFps","quantize"]);
const FPS_CAP = TOKENS.deck.fps.cap;
function effectiveFps(facet, { cap = FPS_CAP, reduced = false } = {}) {
if (!facet || !facet.animated || reduced) return 0;
return Math.max(1, Math.min(cap, facet.fps || 10));
}
const quantize = (t, fps) => (fps > 0 ? Math.floor(t * fps + 1e-6) / fps : t);
const defaultNow = () => (globalThis.performance?.now ? performance.now() : Date.now());
function createScheduler({ cap = FPS_CAP, now = defaultNow, setTimer, clearTimer, raf = false, budgetMs = 10 } = {}) {
const st = setTimer || ((fn, ms) => setTimeout(fn, ms));
const ct = clearTimer || ((h) => clearTimeout(h));
const slots = new Set();
let timer = null, timerAt = Infinity, running = true, turn = 0;
const stats = { pumps: 0, ticks: 0, skipped: 0 };
const interval = (slot) => 1000 / Math.max(0.1, Math.min(cap, slot.fps || 1));
const wants = (slot) => slot.fps > 0 && (!slot.active || slot.active());
function plan() {
if (!running) return;
let next = Infinity;
for (const s of slots) if (wants(s)) next = Math.min(next, s._due ?? 0);
if (next === Infinity) { if (timer !== null) { ct(timer); timer = null; timerAt = Infinity; } return; }
if (timer !== null && timerAt <= next) return;
if (timer !== null) ct(timer);
timerAt = next;
timer = st(pump, Math.max(0, next - now()));
}
function pump() {
timer = null; timerAt = Infinity;
if (!running) return;
stats.pumps++;
const t0 = now();
const list = [...slots].filter(wants);
const n = list.length;
turn = (turn + 1) % Math.max(1, n);
for (let k = 0; k < n; k++) {
const s = list[(turn + k) % n];
if ((s._due ?? 0) > t0 + 2) continue;
if (now() - t0 > budgetMs) { stats.skipped++; continue; }
const iv = interval(s);
s._due = (s._due ?? t0) + iv;
if (s._due < t0) s._due = t0 + iv;
stats.ticks++;
try { s.tick(t0); } catch (err) { s.onError ? s.onError(err) : (s.fps = 0); }
}
plan();
}
return {
add(slot) {
slot._due = now() + (slot.phase ?? Math.random() * (1000 / Math.max(1, Math.min(cap, slot.fps || 1))));
slots.add(slot);
plan();
return slot;
},
remove(slot) { slots.delete(slot); plan(); },
wake(slot) { if (slot) slot._due = Math.min(slot._due ?? Infinity, now()); plan(); },
stop() { running = false; if (timer !== null) ct(timer); timer = null; timerAt = Infinity; },
start() { if (!running) { running = true; plan(); } },
get size() { return slots.size; },
get active() { return [...slots].filter(wants).length; },
stats,
cap,
raf,
};
}
function createChangeGovernor({ window = 6, budget = 60, min = 1, idle = 2 } = {}) {
const hist = [];
return {
observe(changed) { hist.push(Math.max(0, +changed || 0)); if (hist.length > window) hist.shift(); },
fps(want) {
if (!(want > 0)) return 0;
if (hist.length >= window && hist.every((c) => c === 0)) return Math.min(want, idle);
const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 1;
return Math.max(Math.min(min, want), Math.min(want, budget / Math.max(1, avg)));
},
reset() { hist.length = 0; },
get history() { return [...hist]; },
};
}
};
__d[256] = function (__ns) {

__e(__ns, { "LINK_CHANNELS": () => LINK_CHANNELS, "linksOf": () => linksOf, "validateLink": () => validateLink, "readoutOf": () => readoutOf, "createLinkBus": () => createLinkBus }, [], ["LINK_CHANNELS","createLinkBus","linksOf","readoutOf","validateLink"]);
const LINK_CHANNELS = Object.freeze(['mic.muted', 'camera.on', 'stream.live', 'volume.level', 'volume.muted', 'game']);
const resolved = (facet, params = {}) => {
const out = {};
for (const [k, p] of Object.entries(facet?.params || {})) out[k] = p?.default;
return { ...out, ...(params || {}) };
};
function linksOf(facet, params) {
if (!facet?.link) return [];
let L = facet.link;
if (typeof L === 'function') { try { L = L(resolved(facet, params)); } catch { return []; } }
if (!L || typeof L !== 'object') return [];
const out = [];
for (const [channel, m] of Object.entries(L)) {
if (m === 'value') out.push({ channel, value: true });
else if (m && typeof m === 'object') out.push({ channel, states: m });
}
return out;
}
function validateLink(f) {
const errs = [];
if (f.link === undefined) return errs;
if (typeof f.link !== 'function' && (typeof f.link !== 'object' || f.link === null)) return ['link must be an object or a function of params'];
let L = f.link;
if (typeof L === 'function') { try { L = L(resolved(f, {})); } catch (e) { return [`link(params) threw: ${e.message}`]; } }
for (const [ch, m] of Object.entries(L || {})) {
if (!LINK_CHANNELS.includes(ch)) errs.push(`link channel "${ch}" is not one of ${LINK_CHANNELS.join(', ')}`);
if (m === 'value') continue;
if (!m || typeof m !== 'object') { errs.push(`link "${ch}" must map state names to values, or be 'value'`); continue; }
for (const s of Object.keys(m)) if (!(f.states || []).includes(s)) errs.push(`link "${ch}" names state "${s}", which the facet does not have`);
}
return errs;
}
const split = (ch) => { const i = ch.indexOf('.'); return i < 0 ? [ch, null] : [ch.slice(0, i), ch.slice(i + 1)]; };
const same = (a, b) => a === b || (typeof a === 'object' && a && b && JSON.stringify(a) === JSON.stringify(b));
function readoutOf(facet, state, params) {
const fn = facet?.game?.readout;
if (typeof fn !== 'function' || !state) return null;
try {
const r = fn(state, resolved(facet, params));
if (!r || !Array.isArray(r.cards)) return null;
return { id: facet.id, title: r.title || facet.title, cards: r.cards.slice(0, 4).map((c) => ({ ...c })) };
} catch { return null; }
}
function createLinkBus() {
const vals = new Map();
const subs = new Set();
const bus = {
subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
notify(channels, origin) { if (channels?.length) for (const fn of [...subs]) fn(channels, origin); },
get: (ch) => vals.get(ch),
has: (ch) => vals.has(ch),
set(ch, v) { if (vals.has(ch) && same(vals.get(ch), v)) return false; vals.set(ch, v); return true; },
delete(ch) { return vals.delete(ch); },
clear() { vals.clear(); },
publish(facet, params, { state = 0, value } = {}) {
const out = [];
for (const l of linksOf(facet, params)) {
let v;
if (l.value) { if (typeof value !== 'number' || !Number.isFinite(value)) continue; v = Math.round(value * 1e4) / 1e4; }
else { const name = facet.states?.[state]; if (name === undefined || !Object.hasOwn(l.states, name)) continue; v = l.states[name]; }
if (bus.set(l.channel, v)) out.push(l.channel);
}
return out;
},
stateOf(facet, params, state = 0) {
let want = null;
for (const l of linksOf(facet, params)) {
if (!l.states || !vals.has(l.channel)) continue;
const v = vals.get(l.channel), cur = facet.states?.[state];
if (cur !== undefined && Object.hasOwn(l.states, cur) && same(l.states[cur], v)) return state;
const name = Object.keys(l.states).find((s) => same(l.states[s], v));
const i = name === undefined ? -1 : facet.states.indexOf(name);
if (i >= 0 && want === null) want = i;
}
return want;
},
valueOf(facet, params) {
for (const l of linksOf(facet, params)) if (l.value && typeof vals.get(l.channel) === 'number') return vals.get(l.channel);
return null;
},
listens(facet, params, channels) {
if (!facet) return false;
const own = new Set(linksOf(facet, params).map((l) => l.channel));
const keys = new Set(facet.data || []);
return channels.some((ch) => own.has(ch) || keys.has(split(ch)[0]));
},
data(facet, params, base = {}) {
if (!vals.size || !facet) return base;
const own = new Set(linksOf(facet, params).map((l) => l.channel));
const keys = new Set(facet.data || []);
let out = base;
for (const [ch, v] of vals) {
const [key, field] = split(ch);
if (!own.has(ch) && !keys.has(key)) continue;
if (out === base) out = { ...base };
if (field === null) out[key] = v;
else out[key] = { ...(out[key] && typeof out[key] === 'object' ? out[key] : {}), [field]: v };
}
return out;
},
adopt(facet, params, { state = 0, value } = {}) {
const s = bus.stateOf(facet, params, state);
const v = bus.valueOf(facet, params);
const next = { state: s ?? state, value: v ?? value };
return { ...next, changed: bus.publish(facet, params, next) };
},
snapshot: () => Object.fromEntries(vals),
get size() { return vals.size; },
};
return bus;
}
};
__d[257] = function (__ns) {
const { GALLERIES, getGallery } = __m(2);
const { KEY_SIZES, FAMILY_DEVICES, getDevice } = __m(0);
const { validateLink } = __m(256);
__e(__ns, { "SURFACES": () => SURFACES, "PRESS": () => PRESS, "PARAM_TYPES": () => PARAM_TYPES, "DATA_KEYS": () => DATA_KEYS, "SCREENS": () => SCREENS, "TONES": () => TONES, "GAME_SURFACES": () => GAME_SURFACES, "GAME_TICK_MAX_HZ": () => GAME_TICK_MAX_HZ, "normalizeFacet": () => normalizeFacet, "validateFacet": () => validateFacet, "renderTargets": () => renderTargets }, [], ["DATA_KEYS","GAME_SURFACES","GAME_TICK_MAX_HZ","PARAM_TYPES","PRESS","SCREENS","SURFACES","TONES","normalizeFacet","renderTargets","validateFacet"]);
const SURFACES = ['key', 'span', 'strip', 'screen', 'deck'];
const PRESS = ['cycle', 'toggle', 'momentary', 'none'];
const PARAM_TYPES = ['number', 'hue', 'text', 'select', 'bool', 'color', 'theme', 'glyph'];
const DATA_KEYS = ['audio', 'spectrum', 'cpu', 'mem', 'gpu', 'net', 'disk', 'temp', 'battery', 'uptime', 'clock', 'timer', 'weather', 'calendar', 'media', 'mic', 'camera', 'volume', 'stream', 'game', 'gamelink']; 
const SCREENS = ['galleon', 'galleon-widget', 'infobar', 'monitor'];
const TONES = ['idle', 'active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit', 'busy', 'off'];
const GAME_SURFACES = ['key', 'span', 'deck'];
const GAME_TICK_MAX_HZ = 4; 
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_FPS = { key: 10, span: 12, strip: 12, screen: 10, deck: 10 };
function normalizeFacet(raw, file, index = 0, count = 1) {
const [dir, name] = file.split('/');
const base = name.replace(/\.js$/, '');
const f = {
id: count === 1 ? base : undefined,
gallery: dir,
tags: [],
surface: 'key',
animated: true,
loop: 4,
order: 50 + index,
since: '0.1.0',
params: {},
states: [],
...raw,
};
f.file = file;
f.tags = [...new Set((f.tags || []).map((t) => String(t).toLowerCase()))];
if (f.fps === undefined) f.fps = f.animated ? DEFAULT_FPS[f.surface] ?? 10 : 0;
if (f.press === undefined) f.press = f.states?.length > 1 ? 'cycle' : 'momentary';
if (f.surface === 'strip' && f.segments === undefined) f.segments = 'all';
if (f.surface === 'span' && !f.span) f.span = { cols: 'all', rows: 'all' };
const params = {};
for (const [k, p] of Object.entries(f.params || {})) {
const type = p.type || (typeof p.default === 'number' ? 'number' : typeof p.default === 'boolean' ? 'bool' : p.options ? 'select' : 'text');
params[k] = { label: k[0].toUpperCase() + k.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`), ...p, type };
}
f.params = params;
return f;
}
function validateFacet(f) {
const errs = [];
const at = `${f.file || '?'}${f.id ? ` (${f.id})` : ''}`;
const need = (cond, msg) => { if (!cond) errs.push(`${at}: ${msg}`); };
need(typeof f.id === 'string' && KEBAB.test(f.id), 'id must be kebab-case (set `id` when a file exports several facets)');
const g = getGallery(f.gallery);
need(!!g, `gallery "${f.gallery}" is not one of ${GALLERIES.map((x) => x.id).join(', ')}`);
if (g) {
need(g.categories.includes(f.category), `category "${f.category}" is not in ${g.id}: ${g.categories.join(' | ')}`);
need(g.surfaces.includes(f.surface), `surface "${f.surface}" does not belong in ${g.id} (allowed: ${g.surfaces.join(', ')})`);
if (typeof f.id === 'string') need(g.prefix.some((p) => f.id.startsWith(`${p}-`)), `id must start with ${g.prefix.map((p) => `"${p}-"`).join(' or ')}`);
}
if (f.file) need(f.file.startsWith(`${f.gallery}/`), `lives in ${f.file.split('/')[0]}/ but declares gallery "${f.gallery}"`);
need(typeof f.title === 'string' && f.title.trim().length > 0 && f.title.length <= 40, 'title is required (≤ 40 chars)');
need(typeof f.description === 'string' && f.description.length >= 20 && f.description.length <= 180, 'description must be 20–180 characters');
need(Array.isArray(f.tags) && f.tags.length >= 1, 'tags must be a non-empty array');
need(SURFACES.includes(f.surface), `surface must be one of ${SURFACES.join(', ')}`);
if (f.surface === 'span') need(f.span && ['cols', 'rows'].every((k) => f.span[k] === 'all' || (Number.isInteger(f.span[k]) && f.span[k] >= 1)), "span must be { cols, rows } with whole numbers or 'all'");
if (f.surface === 'strip') need(f.segments === 1 || f.segments === 'all', "segments must be 1 or 'all'");
if (f.surface === 'screen') need(Array.isArray(f.screens) && f.screens.length && f.screens.every((s) => SCREENS.includes(s)), `screens must list targets from ${SCREENS.join(', ')}`);
if (f.devices) need(Array.isArray(f.devices) && f.devices.every((d) => getDevice(d).id === d), 'devices must list devices.js ids');
need(typeof f.animated === 'boolean', 'animated must be true or false');
need(typeof f.loop === 'number' && f.loop > 0 && f.loop <= 600, 'loop must be 0–600 seconds');
if (f.still !== undefined) need(typeof f.still === 'number' && f.still >= 0 && f.still <= 600, 'still must be a time in seconds (0–600)');
need(typeof f.fps === 'number' && f.fps >= 0 && f.fps <= 30 && (f.animated ? f.fps >= 1 : true), 'fps must be 1–30 for animated facets (0 for stills)');
need(Array.isArray(f.states) && f.states.every((s) => typeof s === 'string' && KEBAB.test(s)) && new Set(f.states).size === f.states.length && f.states.length <= 8, 'states must be ≤ 8 unique kebab-case names');
need(PRESS.includes(f.press), `press must be one of ${PRESS.join(', ')}`);
if (f.press === 'toggle') need(f.states.length === 2, 'press: "toggle" needs exactly two states');
if (f.tones) need(Object.entries(f.tones).every(([k, v]) => f.states.includes(k) && TONES.includes(v)), `tones must map state names to ${TONES.join(' | ')}`);
need(f.params && typeof f.params === 'object', 'params must be an object');
for (const [k, p] of Object.entries(f.params || {})) {
need(/^[a-z][a-zA-Z0-9]*$/.test(k), `param "${k}" must be camelCase`);
need(PARAM_TYPES.includes(p.type), `param "${k}" type must be one of ${PARAM_TYPES.join(', ')}`);
need('default' in p, `param "${k}" needs a default`);
if (p.type === 'number' || p.type === 'hue') need(typeof p.default === 'number' && (p.min === undefined || p.default >= p.min) && (p.max === undefined || p.default <= p.max), `param "${k}" default must be a number within min/max`);
if (p.type === 'select') need(Array.isArray(p.options) && p.options.length > 0 && p.options.some((o) => (typeof o === 'object' ? o.value : o) === p.default), `param "${k}" needs options that include its default`);
if (p.type === 'color') need(/^#[0-9a-f]{6}$/i.test(String(p.default)), `param "${k}" default must be #rrggbb`);
}
if (f.data) need(Array.isArray(f.data) && f.data.every((d) => DATA_KEYS.includes(d)), `data must list keys from ${DATA_KEYS.join(', ')}`);
for (const e of validateLink(f)) need(false, e);
if (f.gallery === 'icons') need(typeof f.glyph === 'string', 'icons facets name their `glyph`');
if (f.gallery === 'games') need(f.game !== undefined, 'games facets declare a `game` (scene/game.js)');
if (f.game !== undefined) {
const G = f.game || {};
need(typeof G.init === 'function' && typeof G.reduce === 'function', 'game needs init({ seed, device, grid, params }) and reduce(state, event)');
need(G.tickHz === undefined || (typeof G.tickHz === 'number' && G.tickHz >= 0 && G.tickHz <= GAME_TICK_MAX_HZ), `game.tickHz must be 0–${GAME_TICK_MAX_HZ}`);
if (G.tickHz > 0) need(typeof G.ticking === 'function', 'game.ticking(state) must say when the game needs ticks');
need(G.animate === undefined || (typeof G.animate === 'number' && G.animate >= 0 && G.animate <= 3), 'game.animate must be 0–3 seconds');
need(GAME_SURFACES.includes(f.surface), `games live on ${GAME_SURFACES.join(', ')} surfaces`);
}
if (f.gallery === 'themes') need(typeof f.theme === 'string', 'themes facets name their `theme`');
need(typeof f.render === 'function', 'render(ctx) must be a function returning an SVG string');
return errs;
}
function renderTargets(f) {
const devs = (list) => (f.devices ? list.filter((d) => f.devices.includes(d)) : list);
switch (f.surface) {
case 'key': return (f.devices ? f.devices.map((d) => ({ device: d })) : KEY_SIZES.map((size) => ({ size })));
case 'span': return devs(FAMILY_DEVICES).map((device) => ({ device }));
case 'strip': return f.segments === 1 ? [{ device: 'plus', segments: 1 }] : devs(['plus', 'plusxl']).map((device) => ({ device }));
case 'screen': return f.screens.map((screen) => ({ screen, device: screen === 'infobar' ? 'neo' : 'galleon' }));
case 'deck': return devs(FAMILY_DEVICES).map((device) => ({ device }));
default: return [];
}
}
};
__d[258] = function (__ns) {
const { stillTime } = __m(253);
const { quantize } = __m(255);
const { getDevice, deviceLayout } = __m(0);
const { readoutOf } = __m(256);
__e(__ns, { "DIAL_SWEEP": () => DIAL_SWEEP, "TAP_SLOP": () => TAP_SLOP, "DRAG_PX": () => DRAG_PX, "WHEEL_PX": () => WHEEL_PX, "clamp01": () => clamp01, "dialAngle": () => dialAngle, "dialStep": () => dialStep, "stepValue": () => stepValue, "wheelTicks": () => wheelTicks, "dragTicks": () => dragTicks, "isTap": () => isTap, "segmentAt": () => segmentAt, "HOLD_S": () => HOLD_S, "stripTouch": () => stripTouch, "inputState": () => inputState, "fitWidth": () => fitWidth, "frameTime": () => frameTime, "slotLabel": () => slotLabel, "gameCell": () => gameCell, "gameAnnouncement": () => gameAnnouncement, "keyPool": () => keyPool, "showcaseLayout": () => showcaseLayout, "KEY_SIZE_DEVICES": () => KEY_SIZE_DEVICES, "FAMILY": () => FAMILY, "devicesFor": () => devicesFor }, [], ["DIAL_SWEEP","DRAG_PX","FAMILY","HOLD_S","KEY_SIZE_DEVICES","TAP_SLOP","WHEEL_PX","clamp01","devicesFor","dialAngle","dialStep","dragTicks","fitWidth","frameTime","gameAnnouncement","gameCell","inputState","isTap","keyPool","segmentAt","showcaseLayout","slotLabel","stepValue","stripTouch","wheelTicks"]);
const DIAL_SWEEP = 270;
const TAP_SLOP = 5;
const DRAG_PX = 6;
const WHEEL_PX = 60;
const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
const dialAngle = (v) => -DIAL_SWEEP / 2 + clamp01(v) * DIAL_SWEEP;
function dialStep(facet, params = {}) {
const s = params.step ?? facet?.params?.step?.default;
return typeof s === 'number' && s > 0 ? s : 0.02;
}
function stepValue(value, ticks, step = 0.02) {
return Math.round(clamp01((Number.isFinite(value) ? value : 0) + ticks * step) * 1e6) / 1e6;
}
function wheelTicks(acc, deltaY, deltaMode = 0) {
if (!deltaY) return { ticks: 0, acc };
if (deltaMode === 1 || deltaMode === 2) return { ticks: -Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY) / (deltaMode === 1 ? 3 : 1))), acc: 0 };
if (Math.abs(deltaY) >= WHEEL_PX) return { ticks: -Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY) / 100)), acc: 0 };
const a = acc + deltaY;
const t = Math.trunc(a / WHEEL_PX);
return { ticks: -t || 0, acc: a - t * WHEEL_PX || 0 };
}
function dragTicks(dy, px = DRAG_PX) {
const ticks = Math.trunc(dy / px) || 0;
return { ticks, rest: dy - ticks * px || 0 };
}
const isTap = (dx, dy, slop = TAP_SLOP) => Math.hypot(dx, dy) <= slop;
function segmentAt(x, width, n) {
if (!(n > 0) || !(width > 0)) return 0;
return Math.min(n - 1, Math.max(0, Math.floor((x / width) * n)));
}
const HOLD_S = 0.5;
function stripTouch(px, py, width, height, strip) {
const segs = Math.max(1, strip?.segments || 1), W = strip?.w || 800, H = strip?.h || 100;
const x = clamp01(width > 0 ? px / width : 0) * W, y = clamp01(height > 0 ? py / height : 0) * H;
const segW = W / segs, i = Math.min(segs - 1, Math.floor(x / segW));
return { i, x: Math.round(x), y: Math.round(y), segX: Math.round(x - i * segW) };
}
function inputState({ pressed = false, pressStart = 0, turnAt = -Infinity, touch = null } = {}, t = 0) {
return {
pressedFor: pressed ? Math.max(0, t - pressStart) : 0,
turnAge: turnAt === -Infinity ? Infinity : Math.max(0, t - turnAt),
touch: touch ? { x: touch.x, y: touch.y, hold: !!touch.hold, age: Math.max(0, t - touch.at) } : undefined,
};
}
function fitWidth(device, box = {}) {
const L = deviceLayout(getDevice(device));
const aspect = L.w / L.h;
let w = box.width > 0 ? box.width : L.w;
if (box.height > 0) w = Math.min(w, box.height * aspect);
if (box.max > 0) w = Math.min(w, box.max);
if (box.min > 0) w = Math.max(w, box.min);
return Math.max(40, Math.floor(w));
}
const frameTime = (facet, t, { still = false, fps = 30 } = {}) => (still ? stillTime(facet) : quantize(t, fps || 30));
function slotLabel(facet, { state = 0, role = 'key', value, index } = {}) {
if (!facet) return `${role === 'dial' ? 'Dial' : 'Key'} ${(index ?? 0) + 1} (empty)`;
const st = facet.states?.[state];
const pct = role === 'dial' && Number.isFinite(value) ? ` — ${Math.round(clamp01(value) * 100)}%` : '';
return `${facet.title}${st ? ` — ${st}` : ''}${pct}`;
}
function gameCell(facet, state, k, params = {}) {
const fn = facet?.game?.cell;
if (typeof fn !== 'function' || !state || !Number.isInteger(k) || k < 0) return null;
try {
const r = fn(state, k, params);
if (typeof r === 'string') return r ? { label: r } : null;
if (!r || typeof r !== 'object') return null;
const out = {};
if (typeof r.label === 'string' && r.label) out.label = r.label;
if (typeof r.pressed === 'boolean') out.pressed = r.pressed;
return Object.keys(out).length ? out : null;
} catch { return null; }
}
function gameAnnouncement(facet, prev, state, params = {}) {
const fn = facet?.game?.announce;
if (typeof fn === 'function') {
try { const s = fn(state, prev ?? null, params); if (typeof s === 'string') return s.replace(/\s+/g, ' ').trim(); } catch { }
}
const now = readoutOf(facet, state, params);
if (!now) return '';
const before = prev ? readoutOf(facet, prev, params) : null;
const changed = now.cards.filter((c, i) => {
const p = before?.cards?.[i];
return !p || p.title !== c.title || String(p.value) !== String(c.value);
});
return changed.map((c, i) => `${c.title}: ${c.value}${i === 0 && c.sub ? ` (${c.sub})` : ''}`).join('. ');
}
const GALLERY_ORDER = ['icons', 'apps', 'motion', 'games', 'themes', 'spans', 'dials', 'screens', 'gamelink']; 
const isKey = (f) => f.surface === 'key';
const isDialSeg = (f) => f.surface === 'strip' && (f.segments === 1 || f.segments === '1');
const isFullStrip = (f) => f.surface === 'strip' && !isDialSeg(f);
const onScreen = (f, kind) => f.surface === 'screen' && (f.screens || []).some((s) => String(s).startsWith(kind));
const byGallery = (a, b) => GALLERY_ORDER.indexOf(a.gallery) - GALLERY_ORDER.indexOf(b.gallery);
function keyPool(facets) {
const lanes = new Map();
for (const f of facets.filter(isKey).sort(byGallery)) { if (!lanes.has(f.gallery)) lanes.set(f.gallery, []); lanes.get(f.gallery).push(f); }
const order = [...lanes.keys()];
const weight = { icons: 3, apps: 1, motion: 1 };
const out = [];
const idx = Object.fromEntries(order.map((g) => [g, 0]));
let left = facets.filter(isKey).length;
while (left > 0) {
for (const g of order) {
for (let k = 0; k < (weight[g] || 1); k++) {
const lane = lanes.get(g);
if (idx[g] < lane.length) { out.push(lane[idx[g]++]); left--; }
}
}
}
return out;
}
function showcaseLayout(device, facets, { offset = 0 } = {}) {
const d = getDevice(device);
const out = { keys: [], dials: [], strip: null, screen: null };
if (d.display !== 'lcd' && d.display !== 'software') return out;
const pool = keyPool(facets);
const n = (d.cols || 0) * (d.rows || 0);
for (let i = 0; i < n && pool.length; i++) {
const f = pool[(i + offset) % pool.length];
out.keys.push({ facet: f.id, state: (f.states?.length || 0) > 1 && i % 3 === 1 ? 1 : 0 });
}
if (d.strip) {
const segs = facets.filter(isDialSeg);
if (segs.length) for (let i = 0; i < d.strip.segments; i++) out.dials.push(segs[(i + offset) % segs.length].id);
else out.strip = facets.find(isFullStrip)?.id || null;
}
if (d.screen?.kind) out.screen = facets.find((f) => onScreen(f, d.screen.kind === 'infobar' ? 'infobar' : d.screen.kind))?.id || null;
return out;
}
const KEY_SIZE_DEVICES = ['mk2', 'mini', 'xl', 'plusxl', 'plus', 'studio', 'galleon'];
const FAMILY = ['mini', 'mk2', 'xl', 'neo', 'plus', 'plusxl', 'galleon', 'studio'];
function devicesFor(facet) {
if (!facet) return FAMILY;
if (facet.surface === 'key') return facet.devices?.length ? [...facet.devices] : KEY_SIZE_DEVICES;
if (facet.surface === 'strip') return ['plus', 'plusxl'];
if (facet.surface === 'screen') {
const s = (facet.screens || []).map(String);
return [...new Set([...(s.some((x) => x.startsWith('galleon')) ? ['galleon'] : []), ...(s.includes('infobar') ? ['neo'] : [])])];
}
const t = (facet.targets || []).map((x) => x.device).filter(Boolean);
return t.length ? [...new Set(t)] : FAMILY;
}
};
__d[259] = function (__ns) {
const { createContext, gameGrid } = __m(251);
__e(__ns, { "gameGrid": () => gameGrid, "GAME_EVENTS": () => GAME_EVENTS, "TICK_MAX_HZ": () => TICK_MAX_HZ, "GAME_STATE_MAX": () => GAME_STATE_MAX, "DEFAULT_ANIMATE": () => DEFAULT_ANIMATE, "GAME_FPS": () => GAME_FPS, "GAME_RESET_HOLD_S": () => GAME_RESET_HOLD_S, "rngSeed": () => rngSeed, "rngNext": () => rngNext, "rngInt": () => rngInt, "rngShuffle": () => rngShuffle, "mix32": () => mix32, "gameArgs": () => gameArgs, "isPlainJson": () => isPlainJson, "createGameHost": () => createGameHost, "replayGame": () => replayGame }, [], ["DEFAULT_ANIMATE","GAME_EVENTS","GAME_FPS","GAME_RESET_HOLD_S","GAME_STATE_MAX","TICK_MAX_HZ","createGameHost","gameArgs","gameGrid","isPlainJson","mix32","replayGame","rngInt","rngNext","rngSeed","rngShuffle"]);
const GAME_EVENTS = ['press', 'release', 'rotate', 'touch', 'tick', 'reset'];
const TICK_MAX_HZ = 4;
const GAME_STATE_MAX = 4096; 
const DEFAULT_ANIMATE = 0.6;
const GAME_FPS = 12; 
const GAME_RESET_HOLD_S = 1.5; 
const rngSeed = (seed = 7) => (mix32(seed >>> 0, 0x2545f491) || 0x9e3779b9) >>> 0;
function rngNext(r) {
const a = (r + 0x6d2b79f5) >>> 0;
let t = a;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
function rngInt(r, n) { const [x, r2] = rngNext(r); return [Math.floor(x * n), r2]; }
function rngShuffle(r, list) {
const out = [...list];
for (let i = out.length - 1; i > 0; i--) { let j; [j, r] = rngInt(r, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
return [out, r];
}
function mix32(a, b) {
let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
return (h ^ (h >>> 16)) >>> 0;
}
const gridSig = (g) => `${g.cols}x${g.rows}`;
function gameArgs(facet, opts = {}) {
const ctx = createContext(facet, { ...opts, game: null });
return { seed: ctx.seed, device: ctx.device.id, grid: gameGrid(ctx), params: ctx.params };
}
function isPlainJson(v, depth = 0) {
if (depth > 12) return false;
if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
if (typeof v === 'number') return Number.isFinite(v);
if (Array.isArray(v)) return v.every((x) => isPlainJson(x, depth + 1));
if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v).every((x) => x !== undefined && isPlainJson(x, depth + 1));
return false;
}
function createGameHost(facet, opts = {}) {
const G = facet.game;
if (!G || typeof G.init !== 'function' || typeof G.reduce !== 'function') throw new Error(`${facet.id}: not a game facet (needs game.init and game.reduce)`);
const args = gameArgs(facet, opts);
const grid = args.grid;
const tickHz = Math.min(TICK_MAX_HZ, Math.max(0, +G.tickHz || 0));
const animate = Math.max(0, G.animate ?? DEFAULT_ANIMATE);
const byKey = new Map(grid.cells.map((c, k) => [c.i, k]));
const clock = opts.clock || (() => 0);
const log = opts.log ? [] : null;
let baseSeed = args.seed >>> 0, n = 0, state, prev = null, last = null, nextTick = null;
const snap = opts.snapshot;
if (snap && snap.facet === facet.id && snap.grid === gridSig(grid) && snap.state !== undefined) {
({ seed: baseSeed = baseSeed, n = 0, state } = snap); 
} else state = G.init(args);
const event = (raw) => {
if (!raw || !GAME_EVENTS.includes(raw.type)) throw new Error(`${facet.id}: unknown game event ${JSON.stringify(raw?.type)}`);
const ev = { type: raw.type, t: Number.isFinite(raw.t) ? raw.t : clock(), n: n + 1 };
ev.seed = mix32(baseSeed, ev.n);
if (Number.isInteger(raw.key)) {
ev.key = raw.key;
const k = facet.surface === 'key' ? 0 : byKey.get(raw.key);
ev.cell = k ?? null;
if (k !== undefined) { ev.col = grid.cells[k].col; ev.row = grid.cells[k].row; }
} else if (facet.surface === 'key' && (raw.type === 'press' || raw.type === 'release') && !Number.isInteger(raw.dial)) { ev.cell = 0; ev.col = 0; ev.row = 0; }
if (Number.isInteger(raw.dial)) ev.dial = raw.dial;
if (Number.isFinite(raw.ticks)) ev.ticks = Math.trunc(raw.ticks);
if (raw.type === 'release' && Number.isFinite(raw.heldFor)) ev.heldFor = Math.max(0, raw.heldFor);
if (raw.type === 'touch') { ev.x = +raw.x || 0; ev.y = +raw.y || 0; ev.hold = !!raw.hold; }
return ev;
};
const host = {
facet, grid, tickHz, animate,
get state() { return state; },
get prev() { return prev; },
get last() { return last; },
get n() { return n; },
log,
dispatch(raw) {
const ev = event(raw);
const before = JSON.stringify(state);
let next;
if (ev.type === 'reset') next = G.init({ ...args, seed: ev.seed });
else next = G.reduce(state, ev);
if (next === undefined) next = state;
n = ev.n;
log?.push(ev);
const changed = next !== state && JSON.stringify(next) !== before;
if (changed || ev.type !== 'tick') { 
if (changed) prev = state;
state = next;
if (ev.type !== 'tick' || changed) last = ev;
}
if (!host.needsTick()) nextTick = null;
else if (ev.type === 'tick' || nextTick === null) nextTick = ev.t + 1 / tickHz;
return { state, changed, event: ev };
},
reset(t) { return host.dispatch({ type: 'reset', t }); },
needsTick() { return tickHz > 0 && typeof G.ticking === 'function' && !!G.ticking(state); },
pump(t = clock()) {
if (!host.needsTick()) { nextTick = null; return false; }
if (nextTick === null) { nextTick = t + 1 / tickHz; return false; }
if (t + 1e-6 < nextTick) return false;
return host.dispatch({ type: 'tick', t }).changed;
},
animating(t = clock(), fps = GAME_FPS) { return !!last && last.type !== 'tick' && t - last.t <= animate + 2 / Math.max(1, fps); },
fps(t = clock(), cap = GAME_FPS) {
const f = Math.max(1, Math.min(cap, GAME_FPS, facet.fps || GAME_FPS));
if (host.animating(t, f)) return f;
return host.needsTick() ? tickHz : 0;
},
renderOpts(t = clock()) {
return { game: state, gamePrev: prev, gameEvent: last ? { ...last, age: Math.max(0, t - last.t) } : null };
},
snapshot() { return { v: 1, facet: facet.id, grid: gridSig(grid), seed: baseSeed, n, state }; },
};
return host;
}
function replayGame(facet, opts, events) {
const h = createGameHost(facet, { ...opts, snapshot: null });
for (const ev of events) h.dispatch(ev);
return h.state;
}
};
__d[260] = function (__ns) {
const { render, nextState } = __m(253);
const { getDevice, keySize } = __m(0);
const { deviceMarkup, DEVICE_CSS } = __m(254);
const { createScheduler, effectiveFps, createChangeGovernor } = __m(255);
const { normalizeFacet } = __m(257);
const { esc } = __m(5);
const { dialAngle, dialStep, stepValue, wheelTicks, dragTicks, isTap, stripTouch, inputState, HOLD_S, fitWidth, frameTime, slotLabel, gameCell, gameAnnouncement } = __m(258);
const { createGameHost, GAME_FPS, GAME_RESET_HOLD_S } = __m(259);
const { createLinkBus, readoutOf, linksOf } = __m(256);
__e(__ns, { "putSvg": () => putSvg, "prefersReducedMotion": () => prefersReducedMotion, "setGlobalMotion": () => setGlobalMotion, "isGlobalMotionPaused": () => isGlobalMotionPaused, "deckStats": () => deckStats, "gameInput": () => gameInput, "gameFps": () => gameFps, "DeckView": () => DeckView, "KeyView": () => KeyView, "mountDevice": () => mountDevice, "mountKey": () => mountKey }, [], ["DeckView","KeyView","deckStats","gameFps","gameInput","isGlobalMotionPaused","mountDevice","mountKey","prefersReducedMotion","putSvg","setGlobalMotion"]);
const nowMs = () => performance.now();
const BEAT_MS = 1000 / 15;
const IDLE_FPS = 4; 
const BEAT_BUDGET_MS = 4;
let debt = 0;
const scheduler = createScheduler({
cap: 30, now: nowMs, budgetMs: BEAT_BUDGET_MS,
setTimer: (fn, ms) => {
const now = nowMs();
let wait = Math.max(ms, Math.ceil((now + ms) / BEAT_MS) * BEAT_MS - now);
if (debt >= BEAT_BUDGET_MS) { const beats = Math.min(15, Math.floor(debt / BEAT_BUDGET_MS)); wait += beats * BEAT_MS; debt -= beats * BEAT_BUDGET_MS; }
const run = () => { const t0 = nowMs(); fn(); debt += Math.max(0, nowMs() - t0 - BEAT_BUDGET_MS) / 2; };
return wait <= 17 ? { r: requestAnimationFrame(run) } : { t: setTimeout(() => requestAnimationFrame(run), wait - 10) };
},
clearTimer: (h) => { if (h?.r) cancelAnimationFrame(h.r); if (h?.t) clearTimeout(h.t); },
});
const SVG_TOKEN = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|<!--([\s\S]*?)-->|([^<]+)/g;
const SVG_ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITY[e] ?? (decode.bad = true, m))));
const NS = { xlink: 'http://www.w3.org/1999/xlink', xml: 'http://www.w3.org/XML/1998/namespace' };
function svgTokens(svg) {
const nodes = [];
let sig = '', at = 0;
decode.bad = false;
for (const m of svg.matchAll(SVG_TOKEN)) {
if (m.index !== at) return null;
at = m.index + m[0].length;
if (m[6] !== undefined) { nodes.push([0, decode(m[6])]); sig += '#'; continue; } 
if (m[5] !== undefined) { nodes.push([1, m[5]]); sig += '!'; continue; } 
if (m[1]) { sig += '>'; continue; } 
const attrs = [];
for (const a of m[3].matchAll(SVG_ATTR)) attrs.push([a[1], decode(a[2] ?? a[3] ?? '')]);
nodes.push([2, attrs, m[2]]);
sig += `<${m[2]}${attrs.map((a) => ' ' + a[0]).join('')}${m[4] ? '/' : ''}`;
}
return at === svg.length && !decode.bad ? { sig, nodes } : null;
}
function putSvg(el, svg) {
const prev = el.__svgTok, next = svgTokens(svg);
el.__svg = svg; el.__svgTok = next;
if (prev && next && prev.sig === next.sig && el.firstChild) {
const walk = document.createTreeWalker(el, 0x85); 
let node = walk.nextNode(), ok = true;
for (let i = 0; i < next.nodes.length && ok; i++, node = walk.nextNode()) {
const [kind, v] = next.nodes[i], old = prev.nodes[i][1];
if (!node) { ok = false; break; }
if (kind === 2) {
if (node.nodeType !== 1 || node.localName !== next.nodes[i][2]) { ok = false; break; }
for (let k = 0; k < v.length; k++) {
if (v[k][1] === old[k][1]) continue;
const name = v[k][0], c = name.indexOf(':');
if (name === 'xmlns' || name.startsWith('xmlns:')) { ok = false; break; }
if (c > 0 && NS[name.slice(0, c)]) node.setAttributeNS(NS[name.slice(0, c)], name, v[k][1]); else node.setAttribute(name, v[k][1]);
}
} else if (node.nodeType !== (kind === 0 ? 3 : 8)) ok = false;
else if (v !== old) node.data = v;
}
if (ok && !node) return;
}
el.innerHTML = svg;
}
const runtimes = new Set();
let globalPaused = false, motionChosen = false, uid = 0;
const ACTIVATE_QUIET_MS = 600;
function onActivate(el, fn) {
const stamp = () => { el.pdkInputAt = nowMs(); };
el.addEventListener('pointerdown', stamp); el.addEventListener('pointerup', stamp);
const key = (e) => { if (e.key === 'Enter' || e.key === ' ') stamp(); };
el.addEventListener('keydown', key); el.addEventListener('keyup', key);
el.addEventListener('click', (e) => { if (e.detail === 0 && !(nowMs() - (el.pdkInputAt ?? -Infinity) < ACTIVATE_QUIET_MS)) fn(e); });
}
let reducedQuery;
const prefersReducedMotion = () => {
if (reducedQuery === undefined) reducedQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
return !!reducedQuery?.matches;
};
function setGlobalMotion(paused) { globalPaused = !!paused; motionChosen = true; for (const r of runtimes) r.refresh(); }
const isGlobalMotionPaused = () => globalPaused;
function deckStats() {
let slots = 0, frames = 0, ms = 0, live = 0;
for (const r of runtimes) { if (r.live()) live++; for (const s of r.slots) { slots++; frames += s.frames; ms += s.ms; } }
return { decks: runtimes.size, live, slots, activeSlots: scheduler.active, frames, avgFrameMs: frames ? ms / frames : 0 };
}
function gameInput(host, input, t) {
const { type, ...rest } = input || {};
if (type === 'reset') return host.reset(t);
if (type === 'push') return host.dispatch({ type: 'press', dial: rest.dial, t });
return host.dispatch({ ...rest, type, t });
}
function gameFps(host, t, { still = false, cap = GAME_FPS } = {}) {
if (still) return host.needsTick() ? host.tickHz : 0;
return host.fps(t, cap);
}
const STYLE_ID = 'pdk-style';
const TILE_CSS = `.pdk-tile{position:relative;display:inline-block;overflow:hidden;background:#000;border:0;padding:0;margin:0;border-radius:14%;box-shadow:0 0 0 3px #00000080,inset 0 0 0 1px #ffffff14;transition:transform .12s cubic-bezier(.16,1,.3,1);touch-action:manipulation}
.pdk-tile.pdk-wide{border-radius:8px}.pdk-tile::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(162deg,#ffffff1c,#ffffff08 28%,transparent 46%)}
.pdk-tile .pdk-lcd,.pdk-tile .pdk-lcd>svg{display:block;width:100%;height:100%}.pdk-tile.pdk-down{transform:scale(.965)}.pdk-tile:focus-visible{outline:2px solid #b8a2f2;outline-offset:3px}
button.pdk-tile{cursor:pointer}.pdk-interactive .pdk-dial{touch-action:none}.pdk-interactive .pdk-key,.pdk-interactive .pdk-strip{touch-action:manipulation}
.pdk-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.pdk-strip:focus-visible::before{content:"";position:absolute;z-index:1;top:2px;bottom:2px;left:calc(var(--pdk-seg,0) * 100% / var(--pdk-segn,1));width:calc(100% / var(--pdk-segn,1));box-sizing:border-box;border-radius:6px;box-shadow:inset 0 0 0 2px #b8a2f2;pointer-events:none}
.pdk-day .pdk-strip:focus-visible::before{box-shadow:inset 0 0 0 2px #7353bb}
@media (prefers-reduced-motion:reduce){.pdk-tile{transition:none}}`;
const LIVE = '<span class="pdk-sr" role="status" aria-live="polite" aria-atomic="true"></span>';
function injectStyle(el) {
const root = el.getRootNode?.() || document;
const host = root === document ? document.head : root;
if (host.querySelector?.(`#${STYLE_ID}`)) return;
const st = document.createElement('style');
st.id = STYLE_ID;
st.textContent = DEVICE_CSS + TILE_CSS;
host.appendChild(st);
}
function spec(x, resolve) {
if (!x) return null;
if (typeof x === 'string') { const f = resolve?.(x); if (!f) throw new Error(`prism-deck/web: unknown facet "${x}" (pass facet objects or a resolve(id) option)`); return { facet: ensure(f) }; }
if (x.render) return { facet: ensure(x) };
if (x.facet) return { ...x, facet: ensure(typeof x.facet === 'string' ? resolve?.(x.facet) : x.facet) };
throw new Error('prism-deck/web: expected a facet');
}
function ensure(f) {
if (!f) throw new Error('prism-deck/web: unknown facet');
return f.file && f.press && f.fps !== undefined ? f : normalizeFacet(f, `${f.gallery || 'apps'}/${f.id || 'facet'}.js`);
}
let observer = null;
function observe(rt) {
if (!globalThis.IntersectionObserver) { rt.visible = true; return; }
observer ||= new IntersectionObserver((entries) => { for (const e of entries) { const r = e.target.__pdk; if (r) { r.visible = e.isIntersecting; r.refresh(); } } }, { rootMargin: '160px' });
rt.root.__pdk = rt;
observer.observe(rt.root);
}
class Slot {
constructor(rt, role, index, s, targets) {
Object.assign(this, { rt, role, index, targets, spec: s, facet: s.facet, state: s.state || 0, params: s.params || {}, seed: s.seed ?? rt.opts.seed + index });
this.value = typeof s.value === 'number' ? s.value : typeof this.facet.params?.value?.default === 'number' ? this.facet.params.value.default : 0.5;
this.ticks = 0; this.pressed = false; this.pressAt = -Infinity; this.pressStart = 0; this.pressKey = null; this.turnAt = -Infinity; this.touch = null; this.stateAt = 0; this.frames = 0; this.ms = 0; this.error = null;
this.prefix = `pdk${rt.id}${role[0]}${index}`;
this.gov = createChangeGovernor({ idle: IDLE_FPS });
this.fps = 0;
this.active = () => this.rt.live() && !this.error;
this.tick = () => { if (this.game && this.game.pump(this.rt.time())) { this.rt.publishGame?.(this); this.rt.labelSlot?.(this); } this.draw(true); };
if (this.facet.game) this.bindGame(s.snapshot ?? rt.snapshots?.get(this.key()));
this.onError = (err) => this.fail(err);
}
key() { return `${this.role}:${this.index}:${this.facet.id}`; }
get fps() { return this.gov.fps(this.baseFps); }
set fps(v) { this.baseFps = v; }
bindGame(snapshot) {
const rt = this.rt;
this.game = createGameHost(this.facet, { device: rt.modelId, params: this.params, seed: this.seed, span: this.spec?.span, snapshot, clock: () => rt.time() });
let base = 0;
Object.defineProperty(this, 'fps', { configurable: true, get: () => Math.max(base, gameFps(this.game, rt.time(), { still: rt.still, cap: rt.opts.fpsCap })), set: (v) => { base = v; } });
this.active = () => rt.playing && rt.visible && !globalPaused && !this.error;
}
gameInput(input) {
const t = this.rt.time();
const before = this.game.state;
const r = gameInput(this.game, input, t);
if (r.changed || input.type !== 'tick') { this.draw(); scheduler.wake(this); }
if (r.changed) { this.rt.publishGame?.(this); this.rt.announceGame?.(this, before); }
this.rt.opts.onGame?.({ role: this.role, index: this.index, facet: this.facet.id, event: r.event, state: r.state, changed: r.changed, snapshot: this.game.snapshot() });
return r;
}
opts(t) {
const rt = this.rt;
return { device: rt.modelId, theme: rt.opts.theme, mode: rt.opts.mode, t, since: Math.max(0, t - this.stateAt), state: this.state, params: this.params, seed: this.seed,
pressed: this.pressed, pressAge: this.pressAt === -Infinity ? Infinity : Math.max(0, t - this.pressAt), value: this.value, ticks: this.ticks, values: rt.dialValues?.(),
pressKey: this.pressKey, heldFor: this.heldFor || 0, ...inputState(this, t),
now: rt.opts.now ? rt.opts.now() : Date.now(), tzOffset: rt.opts.tzOffset ?? -new Date().getTimezoneOffset(), reduced: rt.still, motion: rt.still ? 'still' : rt.opts.motion, idPrefix: this.prefix, data: rt.bus.data(this.facet, this.params, rt.opts.data?.() || {}), uniqueIds: true,
...(this.game ? this.game.renderOpts(rt.time()) : {}), ...this.extra };
}
draw(scheduled = false) {
const t0 = nowMs();
const t = frameTime(this.facet, this.rt.time(), { still: this.rt.still, fps: this.game ? this.fps : this.baseFps });
let changed = 0;
try {
const r = render(this.facet, this.opts(t));
const put = (el, svg) => { if (el && el.__svg !== svg) { putSvg(el, svg); changed++; } };
const T = this.targets;
if (r.keys && T.keys) r.keys.forEach((k) => put(T.keys[k.i], k.svg));
if (r.segments && T.segments) r.segments.forEach((svg, i) => put(T.segments[i], svg));
if (r.screen && T.screen) put(T.screen, r.screen);
if (T.el) put(T.el, r.svg);
} catch (err) { this.fail(err); return; }
if (!this.game) { if (scheduled) this.gov.observe(changed); else this.gov.reset(); }
this.frames++;
this.ms += nowMs() - t0;
}
fail(err) {
this.error = err;
console.error(`[prism-deck] facet ${this.facet?.id} failed:`, err);
const el = this.targets.el || this.targets.keys?.[0];
if (el) el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" fill="#1a0d12"/><path d="M26 26l20 20M46 26L26 46" stroke="#f97676" stroke-width="3" stroke-linecap="round"/></svg>`;
}
label() { return slotLabel(this.facet, { state: this.state, role: this.role, value: this.value, index: this.index }); }
}
class Runtime {
constructor(el, opts) {
this.id = (++uid).toString(36);
this.opts = { theme: 'prism', seed: 7, interactive: true, autoPause: true, speed: 1, fpsCap: 15, ...opts };
this.host = el; this.slots = []; this.playing = true; this.visible = !this.opts.autoPause; this.t0 = nowMs();
this.bus = this.opts.bus || createLinkBus();
this.unlink = this.bus.subscribe?.((changed, origin) => { if (origin !== this) this.follow(changed, null); });
injectStyle(el);
runtimes.add(this);
}
time() { return ((nowMs() - this.t0) / 1000) * this.opts.speed; }
get still() { const rm = this.opts.reducedMotion; return rm === true ? true : rm === false ? false : !motionChosen && prefersReducedMotion(); }
live() { return this.playing && this.visible && !globalPaused && !this.still; }
refresh() { for (const s of this.slots) { s.fps = effectiveFps(s.facet, { cap: this.opts.fpsCap }); if (this.visible || !this.opts.autoPause) s.draw(); scheduler.wake(s); } }
add(role, index, sp, targets, extra) {
if (!sp) return null;
const s = new Slot(this, role, index, spec(sp, this.opts.resolve), targets);
s.extra = extra || {};
s.fps = effectiveFps(s.facet, { cap: this.opts.fpsCap });
this.slots.push(s);
scheduler.add(s);
return s;
}
clear() { for (const s of this.slots) scheduler.remove(s); this.slots = []; }
press(s, down, key) {
if (!s) return;
const t = this.time();
if (s.game) {
clearTimeout(s.resetTimer);
if (down) {
s.pressKey = key ?? null; s.pressStart = t; s.pressed = true;
s.gameInput({ type: 'press', key });
s.resetTimer = setTimeout(() => { if (s.pressed) s.gameInput({ type: 'reset' }); }, GAME_RESET_HOLD_S * 1000);
} else { if (!s.pressed) return; s.pressed = false; s.pressAt = t; s.heldFor = Math.max(0, t - s.pressStart); s.gameInput({ type: 'release', key: s.pressKey ?? undefined, heldFor: s.heldFor }); }
this.labelSlot?.(s);
return;
}
if (down) {
if (key !== undefined) s.pressKey = key;
s.pressStart = t;
const before = s.state;
s.state = nextState(s.facet, s.state);
if (s.state !== before) { s.stateAt = t; this.relink(s, t); }
s.pressed = true;
this.opts.onPress?.({ role: s.role, index: s.index, facet: s.facet.id, state: s.state, stateName: s.facet.states?.[s.state] ?? null });
} else { if (!s.pressed) return; s.pressed = false; s.pressAt = t; s.heldFor = Math.max(0, t - s.pressStart); }
s.draw(); scheduler.wake(s); this.labelSlot?.(s);
}
relink(src, t = this.time()) {
const changed = this.bus.publish(src.facet, src.params, { state: src.state, value: src.value });
if (!changed.length) return changed;
this.follow(changed, src, t);
this.bus.notify?.(changed, this);
return changed;
}
follow(changed, src, t = this.time()) {
for (const x of this.slots) {
if (x === src || x.game || !this.bus.listens(x.facet, x.params, changed)) continue;
const st = this.bus.stateOf(x.facet, x.params, x.state);
if (st !== null && st !== x.state) { x.state = st; x.stateAt = t; }
if (x.pressAt === -Infinity) x.pressAt = t - 10; 
const v = this.bus.valueOf(x.facet, x.params);
if (v !== null && v !== x.value) { x.value = v; x.turnAt = t; }
x.draw(); scheduler.wake(x); this.labelSlot?.(x);
}
this.syncDials?.();
}
adopt() {
const changed = new Set();
for (const x of this.slots) {
if (x.game) { if (this.bus.set('game', readoutOf(x.facet, x.game.state, x.params))) changed.add('game'); continue; }
const r = this.bus.adopt(x.facet, x.params, { state: x.state, value: x.value });
x.state = r.state; if (typeof r.value === 'number') x.value = r.value;
for (const c of r.changed) changed.add(c);
}
const t = this.time();
for (const x of this.slots) {
if (x.game || x.pressAt !== -Infinity) continue;
const own = linksOf(x.facet, x.params).map((l) => l.channel);
if (own.length && this.slots.some((y) => y !== x && this.bus.listens(y.facet, y.params, own))) x.pressAt = t - 10;
}
if (changed.size) this.bus.notify?.([...changed], this);
}
publishGame(s) {
if (!this.bus.set('game', readoutOf(s.facet, s.game.state, s.params))) return;
this.follow(['game'], s);
this.bus.notify?.(['game'], this);
}
announceGame(s, prev) {
const text = gameAnnouncement(s.facet, prev, s.game.state, s.params);
if (!text) return;
clearTimeout(this.sayTimer);
const ms = this.still ? 0 : Math.min(3, s.facet.game?.animate || 0) * 1000;
this.sayTimer = setTimeout(() => this.say(text), ms);
}
say(text) {
const el = this.liveEl;
if (!el || !text) return;
el.textContent = '';
clearTimeout(this.sayClear);
this.sayClear = setTimeout(() => { el.textContent = text; }, 40);
}
tap(s, ms = 140, key) { if (!s) return; Runtime.prototype.press.call(this, s, true, key); setTimeout(() => Runtime.prototype.press.call(this, s, false), ms); } 
destroy() { clearTimeout(this.sayTimer); clearTimeout(this.sayClear); this.unlink?.(); this.clear(); runtimes.delete(this); if (this.root) observer?.unobserve(this.root); this.ro?.disconnect(); this.host.innerHTML = ''; }
play() { this.playing = true; this.refresh(); return this; }
pause() { this.playing = false; return this; }
restart() { this.t0 = nowMs(); for (const s of this.slots) { s.stateAt = 0; s.pressAt = -Infinity; if (s.game) s.bindGame(null); } this.refresh(); return this; }
get stats() { let frames = 0, ms = 0; for (const s of this.slots) { frames += s.frames; ms += s.ms; } return { slots: this.slots.length, frames, avgFrameMs: frames ? ms / frames : 0 }; }
}
class DeckView extends Runtime {
constructor(el, opts = {}) {
super(el, opts);
this.modelId = getDevice(this.opts.model || 'mk2').id;
if (this.opts.fit && globalThis.ResizeObserver) {
let pending = 0;
this.ro = new ResizeObserver(() => {
if (pending) return;
pending = requestAnimationFrame(() => { pending = 0; const w = this.fitted(); if (w && Math.abs(w - (this.width || 0)) > 1) this.build(); });
});
this.ro.observe(el);
}
this.build();
}
get model() { return getDevice(this.modelId); }
fitted() {
const r = this.host.getBoundingClientRect?.() || { width: this.host.clientWidth, height: 0 };
if (!r.width) return 0;
return fitWidth(this.model, { width: r.width, height: this.opts.fit === 'contain' ? r.height : this.opts.maxHeight, max: this.opts.maxWidth });
}
build() {
this.snapshots = new Map(this.slots.filter((s) => s.game).map((s) => [s.key(), s.game.snapshot()])); 
this.clear();
if (this.root) observer?.unobserve(this.root);
const d = this.model, o = this.opts;
this.width = o.fit ? this.fitted() || o.width || 600 : o.width || (o.scale ? 0 : this.host.clientWidth || 600);
this.host.innerHTML = deviceMarkup(d.id, { theme: o.theme, mode: o.mode, width: this.width || undefined, scale: o.scale, interactive: o.interactive, label: o.label });
this.root = this.host.firstElementChild;
this.liveEl = null;
if (o.interactive) { this.root.insertAdjacentHTML('beforeend', LIVE); this.liveEl = this.root.lastElementChild; }
const $$ = (sel) => [...this.root.querySelectorAll(sel)];
this.keyBtns = $$('.pdk-key'); this.keyEls = this.keyBtns.map((b) => b.querySelector('.pdk-lcd'));
this.dialEls = $$('.pdk-dial');
this.stripBtn = this.root.querySelector('.pdk-strip');
const stripEl = this.stripBtn?.querySelector('.pdk-lcd');
const screenBox = this.root.querySelector('.pdk-screen, .pdk-info');
const screenEl = screenBox && (screenBox.querySelector('.pdk-lcd') || (() => { screenBox.innerHTML = '<span class="pdk-lcd"></span>'; return screenBox.firstElementChild; })());
this.vals = (o.dialValues || [0.35, 0.8, 0.55, 0.2, 0.65, 0.45]).slice(0, this.dialEls.length);
this.dialSlots = [];
this.dialValues = () => this.vals.map((v, i) => this.dialSlots[i]?.value ?? v);
this.keySlots = [];
this.wide = null;
let deckSegs = null;
const wide = o.facet ? spec(o.facet, o.resolve) : null;
const isDeck = wide?.facet.surface === 'deck';
if (isDeck && stripEl && d.strip) {
stripEl.innerHTML = `<span class="pdk-segs">${Array.from({ length: d.strip.segments }, () => '<span></span>').join('')}</span>`;
deckSegs = [...stripEl.querySelectorAll('.pdk-segs>span')];
}
let covered = null;
if (wide) {
this.wide = this.add('device', 0, wide, { keys: this.keyEls, segments: deckSegs, screen: o.screen ? null : screenEl });
if (o.keys?.length && wide.facet.surface === 'span') {
try { covered = new Set(render(wide.facet, { device: d.id, theme: o.theme, mode: o.mode, t: 0, idPrefix: 'probe' }).keys.map((k) => k.i)); } catch { covered = null; }
}
}
if (!wide || covered) (o.keys || []).slice(0, this.keyEls.length).forEach((k, i) => { if (k && !covered?.has(i)) this.keySlots[i] = this.add('key', i, k, { el: this.keyEls[i] }, { size: keySize(d) }); });
if (stripEl && d.strip && !isDeck) {
if (o.strip) this.add('strip', 0, o.strip, { el: stripEl });
else if (o.dials?.length) {
stripEl.innerHTML = `<span class="pdk-segs">${this.dialEls.map(() => '<span></span>').join('')}</span>`;
const segs = [...stripEl.querySelectorAll('.pdk-segs>span')];
o.dials.slice(0, this.dialEls.length).forEach((f, i) => { if (f) this.dialSlots[i] = this.add('dial', i, f, { el: segs[i] }, { segment: i }); });
}
}
const gameOnKeys = (wide?.facet.game && !isDeck) || this.keySlots.some((s) => s?.game);
const screenSpec = o.screen || (screenEl && d.screen?.kind === 'galleon' && gameOnKeys && o.resolve ? (() => { try { return o.resolve('screen-galleon-game') ? 'screen-galleon-game' : null; } catch { return null; } })() : null);
this.screenSlot = screenEl && screenSpec ? this.add('screen', 0, screenSpec, { el: screenEl }, { screen: d.screen?.kind === 'infobar' ? 'infobar' : 'galleon' }) : null;
this.adopt();
this.syncDials();
this.keyBtns.forEach((_, i) => this.labelKey(i));
if (o.interactive) this.wire();
if (o.autoPause) observe(this); else this.visible = true;
this.refresh();
}
slotOfKey(i) { return this.keySlots[i] || this.wide || null; }
labelKey(i) {
const b = this.keyBtns[i];
if (!b || !this.opts.interactive) return;
const own = this.keySlots[i];
let label = own ? own.label() : this.wide ? `${this.wide.facet.title} — key ${i + 1}` : `Key ${i + 1} (empty)`;
const g = own?.game ? own : !own && this.wide?.game ? this.wide : null;
let pressed = null;
if (g) {
const k = g === own ? 0 : (g.game.grid?.cells || []).findIndex((c) => c.i === i);
const c = gameCell(g.facet, g.game.state, k, g.params);
if (c?.label) label += `: ${c.label}`;
if (c && 'pressed' in c) pressed = c.pressed;
}
b.setAttribute('aria-label', label);
if (pressed === null) b.removeAttribute('aria-pressed'); else b.setAttribute('aria-pressed', String(pressed));
}
labelSlot(s) {
if (s.role === 'key') this.labelKey(s.index);
else if (s.role === 'device') this.keyBtns.forEach((_, i) => this.labelKey(i));
if (s.role === 'dial') this.syncDials();
}
syncDials() {
this.dialEls.forEach((el, i) => {
const v = this.dialValues()[i] ?? 0.5;
el.style.setProperty('--rot', `${dialAngle(v).toFixed(1)}deg`);
if (this.opts.interactive) {
el.setAttribute('aria-label', this.dialSlots[i] ? `Dial ${i + 1}: ${this.dialSlots[i].label()}` : `Dial ${i + 1}`);
el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
el.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
}
});
}
rotate(i, ticks) {
if (!ticks) return;
const s = this.dialSlots[i];
const t = this.time();
if (s) { s.value = stepValue(s.value, ticks, dialStep(s.facet, s.params)); s.ticks += ticks; s.turnAt = t; s.draw(); scheduler.wake(s); this.relink(s, t); }
else if (i < this.vals.length) this.vals[i] = stepValue(this.vals[i], ticks, 0.02);
for (const x of this.slots) if (x.role === 'strip' || x.role === 'device' || x.role === 'screen') { x.turnAt = t; if (x.game) x.gameInput({ type: 'rotate', dial: i, ticks }); else { x.draw(); scheduler.wake(x); } }
this.syncDials();
this.opts.onRotate?.({ index: i, ticks, value: this.dialValues()[i] });
}
press(i) { this.tap(this.slotOfKey(i), 140, i); }
pushDial(i) {
const s = this.dialSlots[i];
if (s) this.tap(s);
else if (this.wide?.game) this.wide.gameInput({ type: 'push', dial: i });
else if (this.screenSlot && this.model.screen?.kind === 'galleon') this.tap(this.screenSlot, 140);
else this.opts.onPress?.({ role: 'dial', index: i, facet: null, state: 0, stateName: null });
}
wire() {
const down = (el, on) => el.classList.toggle('pdk-down', on);
this.keyBtns.forEach((b, i) => {
b.addEventListener('pointerdown', (e) => { if (e.button) return; down(b, true); super.press(this.slotOfKey(i), true, i); b.setPointerCapture?.(e.pointerId); });
const up = () => { if (!b.classList.contains('pdk-down')) return; down(b, false); super.press(this.slotOfKey(i), false); };
b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(b, true); super.press(this.slotOfKey(i), true, i); } });
b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); up(); } });
onActivate(b, () => { down(b, true); setTimeout(() => down(b, false), 140); this.press(i); });
});
this.dialEls.forEach((el, i) => {
el.setAttribute('role', 'slider');
el.setAttribute('aria-valuemin', '0');
el.setAttribute('aria-valuemax', '100');
let acc = 0;
el.addEventListener('wheel', (e) => { e.preventDefault(); const r = wheelTicks(acc, e.deltaY, e.deltaMode); acc = r.acc; this.rotate(i, r.ticks); }, { passive: false });
let g = null;
if (!el.title) el.title = 'Drag up or down, or tap the left / right side, to turn · tap the middle to push';
el.addEventListener('pointerdown', (e) => { if (e.button) return; const r = el.getBoundingClientRect(), fx = r.width ? (e.clientX - r.left) / r.width : 0.5; g = { x: e.clientX, y: e.clientY, ly: e.clientY, rest: 0, moved: false, zone: fx < 0.34 ? -1 : fx > 0.66 ? 1 : 0 }; el.setPointerCapture?.(e.pointerId); down(el, true); });
el.addEventListener('pointermove', (e) => {
if (!g) return;
if (!g.moved && !isTap(e.clientX - g.x, e.clientY - g.y)) g.moved = true;
if (!g.moved) return;
const r = dragTicks(g.ly - e.clientY + g.rest);
g.ly = e.clientY; g.rest = r.rest;
this.rotate(i, r.ticks);
});
const end = (cancel) => { if (!g) return; const tapped = !g.moved && !cancel, zone = g.zone; g = null; down(el, false); if (tapped) { if (zone) this.rotate(i, zone); else this.pushDial(i); } };
el.addEventListener('pointerup', () => end(false)); el.addEventListener('pointercancel', () => end(true));
el.addEventListener('keydown', (e) => {
const turn = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
if (turn) { e.preventDefault(); this.rotate(i, turn * (e.shiftKey && Math.abs(turn) === 1 ? 5 : 1)); }
else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(el, true); this.pushDial(i); setTimeout(() => down(el, false), 140); }
});
onActivate(el, () => { down(el, true); this.pushDial(i); setTimeout(() => down(el, false), 140); });
});
const scr = this.root.querySelector('.pdk-screen');
if (scr && this.model.screen?.kind === 'galleon' && (this.screenSlot || this.wide)) {
scr.style.cursor = 'pointer';
scr.addEventListener('click', (e) => { const r = scr.getBoundingClientRect(); this.pushDial(e.clientX - r.left < r.width / 2 ? 0 : 1); });
}
if (this.stripBtn && this.model.dials?.touch) {
const strip = this.model.strip, n = this.dialEls.length || strip.segments;
const touch = (px, py, w, h, hold) => {
const T = stripTouch(px, py, w, h, { w: strip.w, h: strip.h, segments: n });
choose(T.i, false);
const t = this.time(), dial = this.dialSlots[T.i], full = this.slots.find((x) => x.role === 'strip' || x.role === 'device');
if (dial) dial.touch = { x: T.segX, y: T.y, hold, at: t };
if (full) full.touch = { x: T.x, y: T.y, hold, at: t };
if (!dial && full?.game) full.gameInput({ type: 'touch', x: T.x, y: T.y, hold });
else this.tap(dial || full, 120);
this.opts.onTouch?.({ index: T.i, x: T.x, y: T.y, hold });
};
let down = null;
this.stripBtn.addEventListener('pointerdown', (e) => { if (e.button) return; down = { t: nowMs() }; });
this.stripBtn.addEventListener('pointerup', (e) => {
if (!down) return;
const r = this.stripBtn.getBoundingClientRect(), hold = (nowMs() - down.t) / 1000 >= HOLD_S;
down = null;
touch(e.clientX - r.left, e.clientY - r.top, r.width, r.height, hold);
});
this.stripBtn.addEventListener('pointercancel', () => { down = null; });
const sb = this.stripBtn;
let seg = 0;
const segName = () => { const ds = this.dialSlots[seg]; return `Touch strip — segment ${seg + 1} of ${n}${ds ? `: ${ds.label()}` : ''}`; };
const choose = (v, speak) => { seg = Math.max(0, Math.min(n - 1, v)); sb.style.setProperty('--pdk-seg', String(seg)); sb.setAttribute('aria-label', segName()); if (speak) this.say(segName()); };
sb.style.setProperty('--pdk-segn', String(n));
choose(0, false);
const touchSeg = (hold) => {
const r = sb.getBoundingClientRect();
touch(((seg + 0.5) * r.width) / n, r.height / 2, r.width, r.height, hold);
const ds = this.dialSlots[seg];
if (ds) setTimeout(() => { sb.setAttribute('aria-label', segName()); this.say(ds.label()); }, 160);
};
sb.addEventListener('keydown', (e) => {
const to = { ArrowLeft: seg - 1, ArrowRight: seg + 1, Home: 0, End: n - 1 }[e.key];
if (to !== undefined) { e.preventDefault(); if (to !== seg && to >= 0 && to < n) choose(to, true); return; }
if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); touchSeg(e.shiftKey); }
});
onActivate(sb, () => touchSeg(false));
}
}
set(next = {}) { Object.assign(this.opts, next); if (next.model) this.modelId = getDevice(next.model).id; this.build(); return this; }
setKeys(keys) { return this.set({ keys, facet: null }); }
setFacet(facet) { return this.set({ facet }); }
setTheme(theme, mode) { return this.set({ theme, mode }); }
setModel(model) { return this.set({ model }); }
}
class KeyView extends Runtime {
constructor(el, facet, opts = {}) { super(el, opts); this.sp = spec(facet, this.opts.resolve); this.build(); }
build() {
this.clear();
if (this.root) observer?.unobserve(this.root);
const f = this.sp.facet, o = this.opts;
if (f.surface === 'span' || f.surface === 'deck') throw new Error('mountKey: span and deck facets need mountDevice');
const tag = o.interactive ? 'button' : 'div';
const sz = typeof o.size === 'object' ? o.size : f.surface === 'key' ? { w: o.size || 144, h: o.size || 144 } : null;
const probe = render(f, { size: sz || undefined, theme: o.theme, mode: o.mode, t: 0, idPrefix: 'probe' });
const w = sz?.w || probe.w, h = sz?.h || probe.h;
const css = o.displaySize ? `width:${o.displaySize}px;height:${(o.displaySize * h) / w}px` : `width:${w}px;height:${h}px`;
this.host.innerHTML = `<${tag} class="pdk-tile${f.surface === 'key' ? '' : ' pdk-wide'}"${o.interactive ? ` type="button" aria-label="${esc(f.title)}"` : ' aria-hidden="true"'} style="${css}"><span class="pdk-lcd"></span></${tag}>${o.interactive ? LIVE : ''}`;
this.root = this.host.firstElementChild;
this.liveEl = o.interactive ? this.host.querySelector('.pdk-sr') : null;
this.slot = this.add(f.surface, 0, this.sp, { el: this.root.firstElementChild }, sz ? { size: sz } : {});
if (o.interactive) {
const b = this.root, s = this.slot;
b.addEventListener('pointerdown', (e) => { if (e.button) return; b.classList.add('pdk-down'); this.press(s, true); });
const up = () => { if (!b.classList.contains('pdk-down')) return; b.classList.remove('pdk-down'); this.press(s, false); };
b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); b.classList.add('pdk-down'); this.press(s, true); } });
b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') up(); });
onActivate(b, () => { b.classList.add('pdk-down'); setTimeout(() => b.classList.remove('pdk-down'), 140); this.tap(s); });
if (f.surface === 'strip') {
let acc = 0;
b.addEventListener('wheel', (e) => {
e.preventDefault();
const r = wheelTicks(acc, e.deltaY, e.deltaMode); acc = r.acc;
if (r.ticks) { s.value = stepValue(s.value, r.ticks, dialStep(f, s.params)); s.ticks += r.ticks; s.draw(); this.labelSlot?.(s); }
}, { passive: false });
}
this.labelSlot = () => {
const c = s.game ? gameCell(s.facet, s.game.state, 0, s.params) : null;
b.setAttribute('aria-label', s.label() + (c?.label ? `: ${c.label}` : ''));
if (c && 'pressed' in c) b.setAttribute('aria-pressed', String(c.pressed)); else b.removeAttribute('aria-pressed');
};
this.labelSlot();
}
if (o.autoPause) observe(this); else this.visible = true;
this.refresh();
}
setState(i) { this.slot.state = i; this.slot.stateAt = this.time(); this.slot.draw(); this.labelSlot?.(this.slot); return this; }
set(next = {}) { Object.assign(this.opts, next); if (next.facet) this.sp = spec(next.facet, this.opts.resolve); this.build(); return this; }
}
const mountDevice = (el, opts) => new DeckView(el, opts);
const mountKey = (el, facet, opts) => new KeyView(el, facet, opts);
};
__d[261] = function (__ns) {

__e(__ns, { "createModuleLoader": () => createModuleLoader, "loadIsland": () => loadIsland }, [], ["createModuleLoader","loadIsland"]);
const IMPORT_RE = /(^|\n)(\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?)(['"])([^'"]+)\3/g;
const dirname = (p) => p.slice(0, p.lastIndexOf('/'));
function resolve(from, spec) {
const parts = `${dirname(from)}/${spec}`.split('/');
const out = [];
for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
return out.join('/');
}
function createModuleLoader(sources, { urlFor } = {}) {
const make = urlFor || ((code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
const urls = new Map();
const visiting = new Set();
function url(key) {
if (urls.has(key)) return urls.get(key);
if (!Object.hasOwn(sources, key)) throw new Error(`prism-deck island: no source for ${key}`);
if (visiting.has(key)) throw new Error(`prism-deck island: import cycle through ${key}`);
visiting.add(key);
const code = sources[key].replace(IMPORT_RE, (m, lead, head, q, spec) => (spec.startsWith('.') ? `${lead}${head}${q}${url(resolve(key, spec))}${q}` : m));
visiting.delete(key);
const u = make(code, key);
urls.set(key, u);
return u;
}
return { url, import: (key) => import(url(key)) };
}
async function loadIsland(source = globalThis.document, opts = {}) {
let catalog = source;
if (typeof source === 'string') catalog = JSON.parse(source);
else if (source && typeof source.getElementById === 'function') catalog = JSON.parse(source.getElementById('prism-deck-catalog').textContent);
else if (source && typeof source.textContent === 'string' && !source.facets) catalog = JSON.parse(source.textContent);
if (!catalog?.sources) throw new Error('prism-deck island: no `sources` (a lean catalog cannot run offline)');
const loader = createModuleLoader(catalog.sources, opts);
const byId = new Map(catalog.facets.map((f) => [f.id, f]));
let registry = null;
const engine = () => (registry ||= loader.import('prism-deck/src/facets/index.js'));
return {
catalog,
records: catalog.facets,
record: (id) => byId.get(id) || null,
import: loader.import,
async facet(id) { const reg = await engine(); return reg.findFacet(id); },
engine,
render: async () => loader.import('prism-deck/src/render.js'),
web: async () => loader.import('prism-deck/src/web/index.js'),
};
}
};
__d[262] = function (__ns) {
const __r0 = __m(260);
const __r1 = __m(261);
const __r2 = __m(256);
__m(258);
__e(__ns, { "DeckView": () => __r0.DeckView, "KeyView": () => __r0.KeyView, "mountDevice": () => __r0.mountDevice, "mountKey": () => __r0.mountKey, "setGlobalMotion": () => __r0.setGlobalMotion, "isGlobalMotionPaused": () => __r0.isGlobalMotionPaused, "prefersReducedMotion": () => __r0.prefersReducedMotion, "deckStats": () => __r0.deckStats, "loadIsland": () => __r1.loadIsland, "createModuleLoader": () => __r1.createModuleLoader, "createLinkBus": () => __r2.createLinkBus }, [258], ["DIAL_SWEEP","DRAG_PX","DeckView","FAMILY","HOLD_S","KEY_SIZE_DEVICES","KeyView","TAP_SLOP","WHEEL_PX","clamp01","createLinkBus","createModuleLoader","deckStats","devicesFor","dialAngle","dialStep","dragTicks","fitWidth","frameTime","gameAnnouncement","gameCell","inputState","isGlobalMotionPaused","isTap","keyPool","loadIsland","mountDevice","mountKey","prefersReducedMotion","segmentAt","setGlobalMotion","showcaseLayout","slotLabel","stepValue","stripTouch","wheelTicks"]);

};
__d[263] = function (__ns) {
const { SvgCanvas, svgDoc, n, attrs } = __m(5);
const { drawGlyph, Pen } = __m(16);
__e(__ns, { "metricsFor": () => metricsFor, "KeySurface": () => KeySurface, "PanelSurface": () => PanelSurface, "surface": () => surface }, [], ["KeySurface","PanelSurface","metricsFor","surface"]);
const KEY_METRICS = { bleed: 4, safe: 6, text: 8, radius: 9, hair: 1, line: 1.5, bold: 3, ring: 5 };
function metricsFor(ctx) {
const k = ctx.kind;
let u;
if (k === 'key') u = Math.min(ctx.w, ctx.h) / 72;
else if (k === 'span' || k === 'deck') u = Math.min(ctx.grid?.key?.w || 72, ctx.grid?.key?.h || 72) / 72;
else if (k === 'strip') u = (ctx.h / 100) * 1.45;
else u = (ctx.h / 100) * (ctx.h > 200 ? 0.72 : 1.45);
const fine = Math.min(1, 1.6 / Math.max(1, u));
return {
u,
bleed: KEY_METRICS.bleed * u,
safe: KEY_METRICS.safe * u,
text: KEY_METRICS.text * u,
radius: KEY_METRICS.radius * u,
hair: Math.max(1, KEY_METRICS.hair * u * (0.6 + 0.4 * fine)),
line: Math.max(1.25, KEY_METRICS.line * u * (0.7 + 0.3 * fine)),
bold: KEY_METRICS.bold * u,
ring: KEY_METRICS.ring * u,
};
}
class Surface extends SvgCanvas {
constructor(ctx) {
super({ w: ctx.w, h: ctx.h, idPrefix: ctx.idPrefix });
this.ctx = ctx;
this.theme = ctx.theme;
this.colors = ctx.theme.colors;
this.dark = ctx.theme.dark;
this.m = metricsFor(ctx);
this.toneName = ctx.tone || 'idle';
}
color(spec, tone = this.toneName) {
if (typeof spec === 'function') return spec(this, tone);
if (!spec || spec === 'tone') return this.tone(tone);
if (spec === 'tint') return this.ctx.tint;
if (spec[0] === '#') return spec;
return this.colors[spec] || this.colors.ink;
}
tone(tone = this.toneName) {
const key = this.theme.tones[tone] || 'accent';
return key === 'tint' ? this.ctx.tint : this.colors[key] || this.colors.accent;
}
typeStyle(role, o = {}) {
const st = { ...this.theme.type[role] };
st.size = (o.size ?? st.size * this.m.u);
if (o.weight) st.weight = o.weight;
return st;
}
background(o = {}) {
const tone = o.tone ?? this.toneName;
if (o.tone) this.toneName = o.tone;
(this.ctx.kind === 'key' ? this.theme.background : this.theme.surface)(this, { ...o, tone });
return this;
}
roleStyle(role, tone = this.toneName) {
const r = this.theme.roles[role];
return { ...r, color: this.color(r.color, tone) };
}
glyph(id, o = {}) {
const g = this.ctx.glyphs.get(id);
if (!g) throw new Error(`unknown glyph "${id}"`);
const ctx = this.ctx;
const override = this.theme.glyphs[id];
const { pen, scope } = drawGlyph(g, { state: o.state, t: o.t ?? ctx.t, since: o.since ?? ctx.since, pressed: ctx.pressed, pressAge: ctx.pressAge, value: o.value ?? ctx.value, level: o.level, params: o.params || ctx.params }, override);
const { tone, box } = this.paintPen(pen, { ...o, tone: o.tone || scope.tone });
return { tone, box, state: scope.state };
}
paintPen(pen, o = {}) {
const tone = o.tone || this.toneName;
const box = o.box || (o.size ? { x: (o.x ?? this.w / 2) - o.size / 2, y: (o.y ?? this.h / 2) - o.size / 2, size: o.size } : this.theme.glyphBox(this, { labeled: !!o.labeled }));
const s = box.size / 48;
const body = this.theme.paintGlyph ? this.theme.paintGlyph(this, pen, { tone, box, styleOf: (p) => this.roleStyle(p.role, tone) }) : this._paintTree(pen.root, tone);
this.add(`<g${attrs({ transform: `translate(${n(box.x)} ${n(box.y)}) scale(${n(s, 4)})`, opacity: o.opacity })}>${body}</g>`);
return { tone, box };
}
pictogram(draw, o = {}) {
const pen = new Pen();
draw(pen);
return this.paintPen(pen, o);
}
_paintTree(node, tone) {
let out = '';
for (const c of node.children) {
if (c.group) {
const inner = this._paintTree(c, tone);
out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
} else out += this.theme.paint(this, c, this.roleStyle(c.role, tone));
}
return out;
}
text(role, str, o = {}) {
if (str === undefined || str === null || String(str) === '') return this;
const op = typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.max(0, Math.min(1, o.opacity)) : 1;
if (op <= 0.001) return this;
const inner = this.theme.text(this, role, String(str), { ...o, opacity: undefined });
if (!inner || op >= 0.999) { if (inner) this.add(inner); return this; }
const single = /^<path\b[^<]*\/>$/.test(inner) && !/\s(?:opacity|fill-opacity)=/.test(inner);
this.add(single ? inner.replace(/^<path\b/, `<path opacity="${n(op, 3)}"`) : `<g opacity="${n(op, 3)}">${inner}</g>`);
return this;
}
eyebrow(str, o) { return this.text('eyebrow', str, o); }
label(str, o) { return this.text('label', str, o); }
value(str, o) { return this.text('value', str, o); }
hero(str, o) { return this.text('hero', str, o); }
caption(str, o) { return this.text('caption', str, o); }
lambda(o = {}) {
if (this.ctx.kind === 'key' && Math.min(this.w, this.h) < 110 && !o.force) return this;
return this.eyebrow(`λ${this.theme.lambda(o.hue ?? this.ctx.hue)}`, { align: 'right', color: 'dim', ...o });
}
place(markup, { x = 0, y = 0, scale = 1, opacity } = {}) {
this.add(`<g${attrs({ transform: `translate(${n(x)} ${n(y)})${scale !== 1 ? ` scale(${n(scale, 4)})` : ''}`, opacity })}>${markup}</g>`);
return this;
}
}
class KeySurface extends Surface {
svg() {
const ctx = this.ctx;
const fx = this.theme.press(this, { pressed: ctx.pressed, age: ctx.pressAge ?? Infinity });
if (!fx) return super.svg();
const body = fx.transform ? `<g transform="${fx.transform}">${this.body}</g>` : this.body;
return svgDoc({ w: this.w, h: this.h, defs: this.defs, body: (fx.under || '') + body + (fx.overlay || '') });
}
}
class PanelSurface extends Surface {}
const surface = (ctx) => (ctx.kind === 'key' ? new KeySurface(ctx) : new PanelSurface(ctx));
};
__d[264] = function (__ns) {
const { KeySurface, PanelSurface } = __m(263);
const { n, attrs } = __m(5);
__e(__ns, { "childContext": () => childContext, "compose": () => compose, "keyInto": () => keyInto }, [], ["childContext","compose","keyInto"]);
function childContext(ctx, rect, { kind = 'key', tag = 'c', state, tone, hue } = {}) {
return { ...ctx, kind, w: rect.w, h: rect.h, size: Math.min(rect.w, rect.h), idPrefix: `${ctx.idPrefix}${tag}`, tone: tone ?? 'idle', stateName: state ?? null, hue: hue ?? ctx.hue, tint: hue !== undefined ? ctx.theme.spectral(hue) : ctx.tint, pressed: false, pressAge: Infinity };
}
function compose(parent, rect, draw, { kind = 'key', tag, clip = true, ...rest } = {}) {
const sub = childContext(parent.ctx, rect, { kind, tag: tag ?? `${kind[0]}${Math.round(rect.x)}x${Math.round(rect.y)}`, ...rest });
const k = kind === 'key' ? new KeySurface(sub) : new PanelSurface(sub);
const out = draw(k);
if (k.defs) parent.def(k.defs);
let body = k.body;
if (clip) {
const id = parent.id('clip');
parent.def(`<clipPath id="${id}"><rect width="${n(rect.w)}" height="${n(rect.h)}"/></clipPath>`);
body = `<g clip-path="url(#${id})">${body}</g>`;
}
parent.add(`<g${attrs({ transform: `translate(${n(rect.x)} ${n(rect.y)})` })}>${body}</g>`);
return out;
}
const keyInto = (parent, cell, draw, opts = {}) => compose(parent, cell, draw, { kind: 'key', tag: `k${cell.i ?? ''}`, ...opts });
};
__d[265] = function (__ns) {
const { splitElements, elementBounds } = __m(252);
const { n } = __m(5);
__e(__ns, { "toDeviceSvg": () => toDeviceSvg }, [], ["toDeviceSvg"]);
const PAINT = /\s(?:fill|stroke|fill-opacity|stroke-opacity|opacity|stroke-width|stroke-dasharray|stroke-dashoffset|stroke-linecap|stroke-linejoin|stroke-miterlimit|fill-rule|clip-rule)="[^"]*"/g;
const attrOf = (open, name) => (open.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
function whiten(el, rule) {
const gt = el.indexOf('>');
const selfClosing = el[gt - 1] === '/';
const open = el.slice(0, selfClosing ? gt - 1 : gt);
const tag = (open.match(/^<([A-Za-z][\w:.-]*)/) || [])[1];
const ownRule = attrOf(open, 'clip-rule') || rule;
const cleaned = open.replace(PAINT, '');
if (tag === 'g') {
const inner = el.slice(gt + 1, el.lastIndexOf('</'));
return `${cleaned}>${splitElements(inner).map((c) => whiten(c, ownRule)).join('')}</g>`;
}
const paint = ` fill="#ffffff" stroke="none"${ownRule ? ` fill-rule="${ownRule}"` : ''}`;
return selfClosing ? `${cleaned}${paint}/>` : `${cleaned}${paint}>${el.slice(gt + 1)}`;
}
function clipToMask(str, viewBox) {
const gt = str.indexOf('>');
const open = str.slice(0, gt);
const inner = str.slice(gt + 1, str.lastIndexOf('</clipPath>'));
const id = attrOf(open, 'id');
const units = attrOf(open, 'clipPathUnits') === 'objectBoundingBox' ? 'objectBoundingBox' : 'userSpaceOnUse';
const tf = attrOf(open, 'transform');
const rule = attrOf(open, 'clip-rule');
const kids = splitElements(inner);
let body = kids.map((k) => whiten(k, rule)).join('');
if (tf) body = `<g transform="${tf}">${body}</g>`;
let box = null;
for (const k of kids) { const b = elementBounds(tf ? `<g transform="${tf}">${k}</g>` : k); if (b === null) { box = null; break; } if (b !== 'empty') box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; }
let region;
if (units === 'objectBoundingBox') {
const b = box || [-0.5, -0.5, 1.5, 1.5];
region = `maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="${n(b[0] - 0.01, 4)}" y="${n(b[1] - 0.01, 4)}" width="${n(b[2] - b[0] + 0.02, 4)}" height="${n(b[3] - b[1] + 0.02, 4)}"`;
} else {
const b = box || viewBox;
region = `maskUnits="userSpaceOnUse" x="${n(b[0] - 1)}" y="${n(b[1] - 1)}" width="${n(b[2] - b[0] + 2)}" height="${n(b[3] - b[1] + 2)}"`;
}
return `<mask id="${id}" ${region}>${body}</mask>`;
}
function toDeviceSvg(svg) {
let out = String(svg);
const root = out.match(/^\s*<svg\b[^>]*>/);
if (!root) return out;
const vb = (attrOf(root[0], 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
const viewBox = vb.length === 4 && vb.every(Number.isFinite) ? [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]] : [0, 0, +attrOf(root[0], 'width') || 144, +attrOf(root[0], 'height') || 144];
const ids = new Set();
out = out.replace(/<clipPath\b[^>]*>[\s\S]*?<\/clipPath>/g, (m) => { ids.add(attrOf(m.slice(0, m.indexOf('>')), 'id')); return clipToMask(m, viewBox); });
if (ids.size) out = out.replace(/\sclip-path="url\(#([^)]+)\)"/g, (m, id) => (ids.has(id) ? ` mask="url(#${id})"` : m));
out = out.replace(/\spreserveAspectRatio="[^"]*"/g, '');
out = out.replace(/^(\s*<svg\b[^>]*>)/, (open) => {
const w = parseFloat(attrOf(open, 'width')), h = parseFloat(attrOf(open, 'height'));
if (!(vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0)) return open;
const want = (w * vb[3]) / vb[2];
return Math.abs(want - h) < 0.005 ? open : open.replace(/\sheight="[^"]*"/, ` height="${n(want)}"`);
});
return out;
}
};
__d[266] = function (__ns) {
const __r0 = __m(263);
const __r1 = __m(264);
const __r2 = __m(5);
const __r3 = __m(11);
const __r4 = __m(15);
const __r5 = __m(4);
__m(12);
const __r7 = __m(1);
const __r8 = __m(13);
const __r9 = __m(265);
__e(__ns, { "surface": () => __r0.surface, "KeySurface": () => __r0.KeySurface, "PanelSurface": () => __r0.PanelSurface, "metricsFor": () => __r0.metricsFor, "compose": () => __r1.compose, "keyInto": () => __r1.keyInto, "n": () => __r2.n, "esc": () => __r2.esc, "attrs": () => __r2.attrs, "el": () => __r2.el, "g": () => __r2.g, "defs": () => __r2.defs, "rect": () => __r2.rect, "circle": () => __r2.circle, "ellipse": () => __r2.ellipse, "line": () => __r2.line, "path": () => __r2.path, "polyline": () => __r2.polyline, "polygon": () => __r2.polygon, "points": () => __r2.points, "url": () => __r2.url, "linearGradient": () => __r2.linearGradient, "radialGradient": () => __r2.radialGradient, "fill": () => __r2.fill, "stroke": () => __r2.stroke, "translate": () => __r2.translate, "rotate": () => __r2.rotate, "scale": () => __r2.scale, "P": () => __r2.P, "roundRectPath": () => __r2.roundRectPath, "svgDoc": () => __r2.svgDoc, "SvgCanvas": () => __r2.SvgCanvas, "svgInner": () => __r2.svgInner, "svgWindow": () => __r2.svgWindow, "suffixIds": () => __r2.suffixIds, "base64": () => __r2.base64, "svgDataUrl": () => __r2.svgDataUrl, "textPath": () => __r3.textPath, "textOutline": () => __r3.textOutline, "measureText": () => __r3.measureText, "fitText": () => __r3.fitText, "wrapText": () => __r3.wrapText, "ellipsize": () => __r3.ellipsize, "capHeight": () => __r3.capHeight, "xHeight": () => __r3.xHeight, "compact": () => __r3.compact, "pad2": () => __r3.pad2, "clockText": () => __r3.clockText, "textLayout": () => __r3.layout, "polar": () => __r4.polar, "arcPath": () => __r4.arcPath, "sectorPath": () => __r4.sectorPath, "arc": () => __r4.arc, "ring": () => __r4.ring, "spectrumArc": () => __r4.spectrumArc, "ticks": () => __r4.ticks, "needle": () => __r4.needle, "sparkPoints": () => __r4.sparkPoints, "sparkPath": () => __r4.sparkPath, "sparkHead": () => __r4.sparkHead, "sparkline": () => __r4.sparkline, "bars": () => __r4.bars, "segments": () => __r4.segments, "hairline": () => __r4.hairline, "spectrumStops": () => __r4.spectrumStops, "glowStops": () => __r4.glowStops, "parseHex": () => __r5.parseHex, "toHex": () => __r5.toHex, "hexToOklab": () => __r5.hexToOklab, "oklabToHex": () => __r5.oklabToHex, "hexToOklch": () => __r5.hexToOklch, "oklch": () => __r5.oklch, "mix": () => __r5.mix, "shade": () => __r5.shade, "saturate": () => __r5.saturate, "luminance": () => __r5.luminance, "contrast": () => __r5.contrast, "bestInk": () => __r5.bestInk, "lambdaOf": () => __r5.lambdaOf, "hueRamp": () => __r5.hueRamp, "rng": () => __r7.rng, "hash": () => __r7.hash, "noise1": () => __r7.noise1, "noise2": () => __r7.noise2, "fbm1": () => __r7.fbm1, "metric": () => __r7.metric, "series": () => __r7.series, "parsePath": () => __r8.parsePath, "flattenPath": () => __r8.flattenPath, "pathBounds": () => __r8.pathBounds, "insidePolys": () => __r8.insidePolys, "distToPolys": () => __r8.distToPolys, "transformPath": () => __r8.transformPath, "toDeviceSvg": () => __r9.toDeviceSvg }, [12], ["KeySurface","P","PanelSurface","SvgCanvas","arc","arcPath","arrive","attrs","bars","base64","bestInk","capHeight","circle","clamp","clockText","compact","compose","contrast","defs","distToPolys","el","ellipse","ellipsize","esc","fbm1","fill","fitText","flattenPath","g","glowStops","hairline","hash","hexToOklab","hexToOklch","hueRamp","inCubic","inExpo","inOutCubic","inOutExpo","inOutQuad","inOutSine","inQuad","insidePolys","invLerp","keyInto","lambdaOf","lerp","line","linear","linearGradient","luminance","measureText","metric","metricsFor","mix","n","needle","noise1","noise2","oklabToHex","oklch","outBack","outCubic","outElastic","outExpo","outQuad","outQuart","pad2","parseHex","parsePath","path","pathBounds","phase","pingpong","points","polar","polygon","polyline","pulse","radialGradient","rect","remap","ring","rng","rotate","roundRectPath","saturate","scale","sectorPath","segments","series","shade","smoothstep","sparkHead","sparkPath","sparkPoints","sparkline","spectrumArc","spectrumStops","spring","stroke","suffixIds","surface","svgDataUrl","svgDoc","svgInner","svgWindow","textLayout","textOutline","textPath","ticks","toDeviceSvg","toHex","transformPath","translate","url","wrap360","wrapText","xHeight"]);

};
__d[267] = function (__ns) {
const { compose, rect, path, circle, n, P, url, linearGradient, roundRectPath, PanelSurface } = __m(266);
const { childContext } = __m(264);
const { capHeight, measureText, pad2 } = __m(11);
const { arcPath, polar, sparkPath, sparkPoints } = __m(15);
const { clamp, lerp } = __m(12);
const { mix } = __m(4);
const { hash } = __m(1);
const { Pen } = __m(16);
const { BASE_TYPE } = __m(14);
__e(__ns, { "DAYS": () => DAYS, "MONTHS": () => MONTHS, "HUE": () => HUE, "GALLEON_PARAMS": () => GALLEON_PARAMS, "panelInto": () => panelInto, "frameOf": () => frameOf, "galleon": () => galleon, "activeMark": () => activeMark, "header": () => header, "stat": () => stat, "meter": () => meter, "segmented": () => segmented, "spark": () => spark, "gauge": () => gauge, "pictogram": () => pictogram, "coverArt": () => coverArt, "px": () => px, "infobar": () => infobar, "strip": () => strip, "stripHeader": () => stripHeader, "mmss": () => mmss, "hhmm": () => hhmm, "localParts": () => localParts, "polar": () => polar, "clamp": () => clamp, "lerp": () => lerp, "mix": () => mix }, [], ["DAYS","GALLEON_PARAMS","HUE","MONTHS","activeMark","clamp","coverArt","frameOf","galleon","gauge","header","hhmm","infobar","lerp","localParts","meter","mix","mmss","panelInto","pictogram","polar","px","segmented","spark","stat","strip","stripHeader"]);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HUE = { violet: 296, periwinkle: 269.8, azure: 243.6, cerulean: 217.5, cyan: 191.3, mint: 165.1, jade: 138.9, lime: 112.7, citrine: 86.5, amber: 60.4, coral: 34.2, rose: 8 };
const GALLEON_PARAMS = {
layer: { type: 'select', default: 'top', options: ['top', 'bottom', 'none'], label: 'Active layer (marked under the widgets)' },
};
function panelInto(parent, r, draw, { kind = 'screen', tag = 'p', ...rest } = {}) {
const k = new PanelSurface(childContext(parent.ctx, r, { kind, tag, ...rest }));
const out = draw(k);
if (k.defs) parent.def(k.defs);
const id = parent.id('clip');
parent.def(`<clipPath id="${id}"><rect x="${n(r.x + 0.02)}" y="${n(r.y + 0.02)}" width="${n(r.w - 0.04)}" height="${n(r.h - 0.04)}"/></clipPath>`);
parent.add(`<g clip-path="url(#${id})"><g transform="translate(${n(r.x)} ${n(r.y)})">${k.body}</g></g>`);
return out;
}
function frameOf(p, { pad } = {}) {
const P0 = pad ?? Math.round(Math.max(p.m.text ?? p.m.safe, p.h * 0.112));
const eb = p.typeStyle('eyebrow');
return { x0: P0, x1: p.w - P0, w: p.w - P0 * 2, top: P0, eyebrowY: P0 + capHeight(eb.size, eb.weight), footY: p.h - Math.max(P0, p.h * 0.13), u: p.m.u, cx: p.w / 2, pad: P0 };
}
function galleon(ctx, scr, cells, { hues = [[HUE.violet, HUE.cyan], [HUE.amber, HUE.azure]], tones = [['idle', 'idle'], ['idle', 'idle']] } = {}) {
const { w, h } = ctx, G = ctx.screen?.widgets || {}, ww = G.w ?? w / 2, wh = G.h ?? Math.min(h / 2, ww / 2);
const px = G.pitchX ?? w / 2, py = G.pitchY ?? h / 2, ix = G.insetX ?? (px - ww) / 2, iy = G.insetY ?? (py - wh) / 2;
const active = ctx.params.layer === 'bottom' ? 1 : ctx.params.layer === 'none' ? -1 : 0;
scr.add(rect({ width: w, height: h, fill: '#000000' }));
for (let layer = 0; layer < 2; layer++) for (let dial = 0; dial < 2; dial++) {
panelInto(scr, { x: dial * px + ix, y: layer * py + iy, w: ww, h: wh }, (p) => {
const tone = typeof tones[layer][dial] === 'function' ? tones[layer][dial](ctx) : tones[layer][dial];
p.background({ tone });
const W = frameOf(p);
cells[layer][dial](p, W);
if (layer === active) activeMark(p);
}, { kind: 'screen', tag: `w${dial}${layer}`, hue: hues[layer][dial] });
}
return scr.svg();
}
function activeMark(p) {
const bw = Math.round(p.w * 0.16), bh = Math.max(3, Math.round(p.m.u * 1.25));
p.add(rect({ x: p.w / 2 - bw / 2, y: p.h - bh - Math.max(2, Math.round(p.h * 0.016)), width: bw, height: bh, rx: bh / 2, fill: p.ctx.tint }));
}
function header(p, W, title, meta, { chip = true, metaColor = 'dim', y, metaRole = 'caption', size, metaSize } = {}) {
const eb = p.typeStyle('eyebrow', size ? { size } : {}), ms = p.typeStyle(metaRole, metaSize ? { size: metaSize } : {});
const cap = capHeight(eb.size, eb.weight);
const by = y ?? W.eyebrowY;
let x = W.x0;
if (chip) {
const s = Math.round(cap * 0.78);
p.add(rect({ x, y: by - cap / 2 - s / 2, width: s, height: s, rx: Math.max(1, s * 0.22), fill: p.ctx.tint }));
x += s + Math.round(cap * 0.55);
}
const room = W.x1 - x;
const metaFont = { size: ms.size, weight: ms.weight, caps: ms.caps, tracking: ms.tracking };
const titleW = measureText(title, { size: eb.size, weight: eb.weight, caps: eb.caps, tracking: eb.tracking });
if (Array.isArray(meta)) { 
const opts = meta.filter(Boolean);
meta = opts.find((m) => measureText(m, metaFont) <= room - Math.min(titleW, room * 0.62) - cap * 1.2) ?? opts[opts.length - 1];
}
if (!meta) { p.eyebrow(title, { x, y: by, maxWidth: room, size: eb.size }); return; }
const metaW = measureText(meta, metaFont);
const gap = cap * 1.2, tW = Math.min(titleW, Math.max(room - gap - metaW, room * 0.62));
p.eyebrow(title, { x, y: by, maxWidth: tW + 1, size: eb.size });
const metaRoom = room - tW - gap;
if (metaRoom > ms.size * 1.5) p.text(metaRole, meta, { align: 'right', x: W.x1, y: by, color: metaColor, maxWidth: metaRoom, size: ms.size });
}
function stat(p, { value, unit, xr, xl, base, size, role = 'hero', unitScale = 0.36, color, unitColor = 'muted', maxWidth }) {
const st = p.typeStyle(role, size ? { size } : {});
const px = st.size, cap = capHeight(px, st.weight);
const vw = Math.min(maxWidth ?? Infinity, measureText(String(value), { size: px, weight: st.weight, tabular: !!st.tabular, tracking: st.tracking || 0 }));
if (xr === undefined) xr = (xl ?? 0) + vw; 
p.text(role, String(value), { align: 'right', x: xr, cy: base - cap / 2, size: px, color, maxWidth });
let right = xr;
if (unit) {
const us = Math.max(p.typeStyle('caption').size, px * unitScale);
const gap = px * 0.06;
p.caption(unit, { align: 'left', x: xr + gap, y: base, size: us, color: unitColor });
right = xr + gap + measureText(unit, { size: us, weight: p.typeStyle('caption').weight });
}
return { left: xr - vw, right, base, cap };
}
function meter(p, { x, y, w, h, value, color, track, trackOpacity = 1, marker = false }) {
const v = clamp(value ?? 0), r = h / 2;
let out = rect({ x, y, width: w, height: h, rx: r, fill: track ?? p.colors.line, fillOpacity: trackOpacity < 1 ? trackOpacity : null });
if (v > 0.002) out += rect({ x, y, width: Math.max(h, w * v), height: h, rx: r, fill: color ?? p.ctx.tint });
if (marker) { const mx = x + w * v; out += circle({ cx: mx, cy: y + h / 2, r: h * 1.15, fill: p.colors.ink }) + circle({ cx: mx, cy: y + h / 2, r: h * 0.5, fill: color ?? p.ctx.tint }); }
p.add(out);
}
function segmented(p, { x, y, w, h, value, count = 20, gap, color, off, offOpacity = 1, radius }) {
const g = gap ?? Math.max(2, w / count * 0.28);
const bw = (w - g * (count - 1)) / count, lit = Math.round(clamp(value ?? 0) * count);
let on = '', dim = '';
const rr = radius ?? Math.min(bw, h) * 0.3;
for (let i = 0; i < count; i++) {
const d = roundRectPath(x + i * (bw + g), y, bw, h, rr);
if (i < lit) on += d; else dim += d;
}
if (dim) p.add(path(dim, { fill: off ?? p.colors.line, fillOpacity: offOpacity < 1 ? offOpacity : null }));
if (on) p.add(path(on, { fill: typeof color === 'string' ? color : p.ctx.tint }));
}
function spark(p, values, { x, y, w, h, shift = 0, color, width, area = 0.12, head = true, lo = 0, hi = 1 }) {
const c = color ?? p.ctx.tint, lw = width ?? Math.max(2, p.m.u * 0.9);
const o = { x, y, w, h, shift, lo, hi };
const d = sparkPath(values, o);
if (!d) return;
const pts = sparkPoints(values, o);
if (area) p.add(path(`${d}L${n(pts[pts.length - 1][0])} ${n(y + h)}L${n(pts[0][0])} ${n(y + h)}Z`, { fill: c, fillOpacity: area }));
p.add(path(d, { fill: 'none', stroke: c, strokeWidth: n(lw), strokeLinecap: 'round', strokeLinejoin: 'round' }));
if (head) { const [hx, hy] = pts[pts.length - 1]; p.add(circle({ cx: hx, cy: hy, r: lw * 1.9, fill: p.colors.surface }) + circle({ cx: hx, cy: hy, r: lw * 1.15, fill: c })); }
}
function gauge(p, { cx, cy, r, width, value, from = -130, to = 130, color, track }) {
const v = clamp(value ?? 0);
p.add(path(arcPath(cx, cy, r, from, to), { fill: 'none', stroke: track ?? p.colors.line, strokeWidth: n(width), strokeLinecap: 'round' }));
if (v > 0.004) p.add(path(arcPath(cx, cy, r, from, lerp(from, to, v)), { fill: 'none', stroke: color ?? p.ctx.tint, strokeWidth: n(width), strokeLinecap: 'round' }));
}
function pictogram(p, draw, { x, y, size, hue, tone = 'active', tag = 'pg', state } = {}) {
compose(p, { x, y, w: size, h: size }, (q) => {
const pen = new Pen();
draw(pen, { t: q.ctx.t, since: q.ctx.since, state, phase: (per) => ((q.ctx.t / per) % 1 + 1) % 1 });
const styleOf = (prim) => q.roleStyle(prim.role, tone);
const body = q.theme.paintGlyph ? q.theme.paintGlyph(q, pen, { tone, styleOf }) : paintTree(q, pen.root, tone);
q.add(`<g transform="scale(${n(size / 48, 4)})">${body}</g>`);
}, { kind: 'screen', tag, hue, tone, clip: false });
}
function paintTree(q, node, tone) {
let out = '';
for (const c of node.children) {
if (c.group) { const inner = paintTree(q, c, tone); out += c.transform || c.opacity !== 1 ? `<g${c.transform ? ` transform="${c.transform}"` : ''}${c.opacity !== 1 ? ` opacity="${n(c.opacity, 3)}"` : ''}>${inner}</g>` : inner; }
else out += q.theme.paint(q, c, q.roleStyle(c.role, tone));
}
return out;
}
function coverArt(p, { x, y, size, title = '', artist = '', radius }) {
let hsh = 0;
for (const ch of `${title}|${artist}`) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
const stops = Object.values(HUE);
const h0 = stops[hsh % 12], h1 = stops[(hsh >>> 4) % 12], kind = (hsh >>> 8) % 3;
const T = p.theme, C = p.colors;
const rr = radius ?? size * 0.08;
const clip = p.id('art');
p.def(`<clipPath id="${clip}"><path d="${roundRectPath(x, y, size, size, rr)}"/></clipPath>`);
const base = p.id('artbg');
const deep = mix(C.surface2, T.spectral(h0, { tier: 'ink' }), p.dark ? 0.28 : 0.18);
p.def(linearGradient(base, [[0, mix(deep, C.surface, 0.25)], [1, deep]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
let art = rect({ x, y, width: size, height: size, fill: url(base) });
const c0 = T.spectral(h0), c1 = T.spectral(h1), c2 = T.spectral(h0 + 60);
const s = size;
if (kind === 0) { 
const cx = x + s * (0.38 + 0.24 * hash(hsh, 1)), cy = y + s * (0.4 + 0.2 * hash(hsh, 2));
[0.62, 0.48, 0.34, 0.2].forEach((f, i) => { art += circle({ cx, cy, r: s * f, fill: 'none', stroke: [c0, c1, c2, c0][i], strokeWidth: n(s * 0.035), strokeOpacity: n(0.35 + i * 0.15, 2) }); });
art += circle({ cx, cy, r: s * 0.1, fill: c1 });
} else if (kind === 1) { 
const k = s * 0.16;
[c0, c1, c2, c1, c0].forEach((c, i) => { const o = -s * 0.2 + i * k * 1.25; art += path(P().M(x + o, y + s).L(x + o + k, y + s).L(x + o + k + s * 0.7, y).L(x + o + s * 0.7, y).Z().d, { fill: c, fillOpacity: n(0.85 - i * 0.12, 2) }); });
} else { 
art += circle({ cx: x + s * 0.5, cy: y + s * 0.58, r: s * 0.3, fill: c0 });
for (let i = 0; i < 5; i++) art += rect({ x, y: y + s * (0.6 + i * 0.085), width: s, height: s * (0.03 + i * 0.008), fill: C.surface2, fillOpacity: 0.9 });
art += rect({ x, y: y + s * 0.6, width: s, height: s * 0.4, fill: c1, fillOpacity: 0.18 });
}
p.add(`<g clip-path="url(#${clip})">${art}</g>`);
p.add(path(roundRectPath(x + 0.5, y + 0.5, size - 1, size - 1, rr), { fill: 'none', stroke: C.ink, strokeOpacity: p.dark ? 0.12 : 0.1, strokeWidth: 1 }));
}
const px = (p, role, base) => base * ((p.theme.type[role]?.size ?? BASE_TYPE[role].size) / BASE_TYPE[role].size);
function infobar(ctx, scr, draw, { tone = 'idle' } = {}) {
scr.background({ tone });
const pad = Math.round(Math.max(8, scr.h * 0.18));
draw(scr, { x0: pad, x1: scr.w - pad, w: scr.w - pad * 2, cy: scr.h / 2, pad });
return scr.svg();
}
function strip(ctx, scr, cells, { hues = [], tones = [] } = {}) {
const S = ctx.strip.segments, sw = ctx.w / S;
scr.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
for (let i = 0; i < S; i++) {
panelInto(scr, { x: i * sw, y: 0, w: sw, h: ctx.h }, (p) => {
p.background({ tone: tones[i] || 'idle' });
const pad = Math.round(Math.max(p.m.text ?? p.m.safe, 12));
const eb = p.typeStyle('eyebrow', { size: px(p, 'eyebrow', 13.5) });
const F = { x0: pad, x1: p.w - pad, w: p.w - pad * 2, pad, top: pad, eyebrowY: pad + capHeight(eb.size, eb.weight) + 1, eyebrowSize: eb.size, footY: p.h - pad, u: p.m.u, i };
cells[i % cells.length](p, F);
}, { kind: 'strip', tag: `s${i}`, hue: hues[i % Math.max(1, hues.length)] });
}
return scr.svg();
}
function stripHeader(p, F, title, meta) {
header(p, F, title, meta, { size: F.eyebrowSize, metaSize: px(p, 'caption', 13.5) });
}
const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`; };
const hhmm = (h, m, h12 = false) => (h12 ? `${((h + 11) % 12) + 1}:${pad2(m)}` : `${h}:${pad2(m)}`);
function localParts(ctx, ms) {
const local = ms + (ctx.clock?.tzOffset ?? 0) * 60000;
const days = Math.floor(local / 86400000), rem = local - days * 86400000;
const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
const day = doy - Math.floor((153 * mp + 2) / 5) + 1, month = mp < 10 ? mp + 3 : mp - 9;
return { h: Math.floor(rem / 3600000), m: Math.floor((rem % 3600000) / 60000), dow: ((days % 7) + 11) % 7, day, month };
}
};
__d[268] = function (__ns) {
const { hash, metric, fbm1 } = __m(1);
const { clamp, smoothstep } = __m(12);
__e(__ns, { "BPM": () => BPM, "BEAT": () => BEAT, "PHRASE": () => PHRASE, "pnoise": () => pnoise, "voices": () => voices, "grooveLevel": () => grooveLevel, "grooveBody": () => grooveBody, "simAudio": () => simAudio, "simSpectrum": () => simSpectrum, "SIM_MACHINE": () => SIM_MACHINE, "NET_MAX": () => NET_MAX, "simMetric": () => simMetric, "simSeries": () => simSeries, "simCores": () => simCores, "simSystem": () => simSystem, "PLAYLIST": () => PLAYLIST, "simMedia": () => simMedia, "AGENDA": () => AGENDA, "simCalendar": () => simCalendar }, [], ["AGENDA","BEAT","BPM","NET_MAX","PHRASE","PLAYLIST","SIM_MACHINE","grooveBody","grooveLevel","pnoise","simAudio","simCalendar","simCores","simMedia","simMetric","simSeries","simSpectrum","simSystem","voices"]);
const BPM = 120;
const BEAT = 60 / BPM;
const PHRASE = 16;
const wrap = (x, p) => ((x % p) + p) % p;
const fade = (f) => f * f * (3 - 2 * f);
function pnoise(x, period, seed = 0) {
const i = Math.floor(x), f = x - i;
const a = hash(wrap(i, period), seed), b = hash(wrap(i + 1, period), seed);
return a + (b - a) * fade(f);
}
function voices(x, seed = 0) {
const tx = wrap(x, PHRASE);
const xb = tx / BEAT;
const beat = Math.floor(xb), pb = xb - beat;
const bar = Math.floor(beat / 4), inBar = beat % 4;
const fill = bar === 7 && inBar >= 2; 
const kickOn = !fill && (inBar === 0 || inBar === 2 || (inBar === 3 && hash(bar, seed + 5) > 0.55));
const kick = kickOn ? Math.exp(-pb * 7.5) : 0;
const p16 = (xb * 4) % 1;
const snare = fill ? Math.exp(-p16 * 9) * (0.55 + 0.45 * (xb % 1)) : (inBar === 1 || inBar === 3 ? Math.exp(-pb * 8) : 0);
const p8 = (xb * 2) % 1;
const hat = Math.exp(-p8 * 14) * (Math.floor(xb * 2) % 2 ? 0.7 : 1);
const energy = 0.58 + 0.42 * (0.5 - 0.5 * Math.cos((tx / PHRASE) * Math.PI * 2));
return { kick, snare, hat, energy, bar, beat, pb };
}
function grooveLevel(x, seed = 0) {
const v = voices(x, seed);
const room = 0.05 + 0.07 * pnoise(wrap(x, PHRASE) * 3, PHRASE * 3, seed);
const body = 0.52 * v.kick * v.energy + 0.34 * v.snare * (0.7 + 0.3 * v.energy) + 0.12 * v.hat + 0.13 * v.energy;
const grain = (pnoise(wrap(x, PHRASE) * 30, PHRASE * 30, seed + 1) - 0.5) * 0.26;
return clamp(0.3 + 0.75 * (room + body + grain * (0.35 + body)));
}
const grooveBody = (x, seed = 0) => grooveLevel(x, seed) * (0.5 + 0.18 * pnoise(wrap(x, PHRASE) * 6, PHRASE * 6, seed + 2));
function simAudio(t, seed = 0, { count = 96, rate = 30 } = {}) {
const end = Math.floor(t * rate + 1e-6);
const levels = new Array(count);
for (let i = 0; i < count; i++) levels[i] = grooveLevel((end - (count - 1 - i)) / rate, seed);
let peak = 0;
for (let i = Math.max(0, count - Math.round(rate * 0.6)); i < count; i++) peak = Math.max(peak, levels[i]);
const db = (v) => clamp(0.48 + 0.52 * (v - 0.3) / 0.7);
return { level: db(levels[count - 1]), levels, rate, peak: db(peak), rms: db(grooveBody(end / rate, seed)) * 0.85, frac: t * rate - end };
}
function bandAt(x, f, b, seed) {
const v = voices(x, seed);
const tx = wrap(x, PHRASE);
const tilt = (0.46 - 0.2 * f) * (0.55 + 0.45 * v.energy);
const kick = v.kick * 0.58 * Math.exp(-(((f - 0.05) / 0.13) ** 2));
const note = hash(Math.floor(tx / (BEAT / 2)), seed + 9);
const bass = 0.3 * v.energy * Math.exp(-(((f - (0.1 + 0.1 * note)) / 0.06) ** 2)) * (0.6 + 0.4 * Math.exp(-((tx / (BEAT / 2)) % 1) * 3));
const snare = v.snare * 0.34 * Math.exp(-(((f - 0.52) / 0.26) ** 2));
const hat = v.hat * 0.42 * smoothstep(0.6, 0.96, f);
const c1 = 0.3 + 0.14 * hash(v.bar, seed + 21), c2 = c1 + 0.12 + 0.06 * hash(v.bar, seed + 22);
const shimmer = 0.75 + 0.25 * Math.sin((tx / PHRASE) * Math.PI * 2 * 16 + f * 9);
const melody = 0.26 * v.energy * (Math.exp(-(((f - c1) / 0.05) ** 2)) + 0.7 * Math.exp(-(((f - c2) / 0.05) ** 2))) * shimmer;
const grain = (pnoise(tx * 8, PHRASE * 8, seed + 40 + b * 31) - 0.5) * 0.16;
return clamp(tilt + kick + bass + snare + hat + melody + grain);
}
function simSpectrum(t, seed = 0, { count = 24 } = {}) {
const bands = new Array(count), peaks = new Array(count);
for (let b = 0; b < count; b++) {
const f = count === 1 ? 0.5 : b / (count - 1);
bands[b] = bandAt(t, f, b, seed);
let pk = bands[b];
for (let k = 1; k <= 8; k++) { const dt = k * 0.09; pk = Math.max(pk, bandAt(t - dt, f, b, seed) - 1.4 * dt * dt - 0.05 * dt); }
peaks[b] = clamp(pk);
}
return { bands, peaks };
}
const GIB = 1024 ** 3;
const SIM_MACHINE = { cpuModel: 'Prism Lab 8-core', cpuGhz: 3.6, cores: 8, memTotal: 32 * GIB, diskTotal: 1000e9, gpuName: 'Integrated GPU', host: 'deck-lab.example', platform: 'sim' };
const SIM = {
cpu: (t, s) => metric(t, s, { lo: 0.12, hi: 0.96, speed: 0.22, jitter: 0.12 }),
mem: (t, s) => metric(t, s + 3, { lo: 0.5, hi: 0.72, speed: 0.04, jitter: 0.02 }),
gpu: (t, s) => metric(t, s + 5, { lo: 0.04, hi: 0.9, speed: 0.3, jitter: 0.22 }),
disk: (t, s) => 0.63 + 0.004 * fbm1(t * 0.01, s + 7),
down: (t, s) => { const b = metric(t, s + 9, { lo: 0, hi: 1, speed: 0.5, jitter: 0.3 }); return b * b; },
up: (t, s) => { const b = metric(t, s + 3, { lo: 0.02, hi: 0.7, speed: 0.6, jitter: 0.3 }); return b * b; },
read: (t, s) => { const b = metric(t, s + 13, { lo: 0, hi: 1, speed: 0.7, jitter: 0.4 }); return b ** 3; },
write: (t, s) => { const b = metric(t, s + 17, { lo: 0, hi: 1, speed: 0.5, jitter: 0.4 }); return b ** 4; },
temp: (t, s) => clamp((38 + 44 * metric(t - 2, s, { lo: 0.12, hi: 0.96, speed: 0.12, jitter: 0.04 }) - 30) / 70),
};
const NET_MAX = { down: 118e6, up: 22e6, read: 1.6e9, write: 0.9e9 };
const simMetric = (key, t, seed = 0) => clamp((SIM[key] || SIM.cpu)(t, seed));
function simSeries(key, t, seed = 0, count = 30, step = 0.5) {
const end = Math.floor(t / step);
const values = new Array(count);
for (let i = 0; i < count; i++) values[i] = simMetric(key, (end - (count - 1 - i)) * step, seed);
return { values, frac: t / step - end, step };
}
function simCores(t, seed = 0, count = SIM_MACHINE.cores) {
const cpu = simMetric('cpu', t, seed);
return Array.from({ length: count }, (_, i) => clamp(cpu + (metric(t, seed + 101 + i, { lo: 0, hi: 1, speed: 0.6, jitter: 0.3 }) - 0.5) * 0.7 - (i % 2) * 0.08));
}
function simSystem(t, seed = 0) {
const M = SIM_MACHINE;
const mem = simMetric('mem', t, seed), disk = simMetric('disk', t, seed);
return {
cpu: simMetric('cpu', t, seed),
mem,
gpu: simMetric('gpu', t, seed),
disk,
net: { down: simMetric('down', t, seed) * NET_MAX.down, up: simMetric('up', t, seed) * NET_MAX.up },
temp: 30 + 70 * simMetric('temp', t, seed),
battery: 0.82 - 0.0004 * (t % 600),
uptime: 4 * 3600 + 12 * 60 + t,
sys: {
...M, cores: simCores(t, seed), memUsed: mem * M.memTotal, diskFree: (1 - disk) * M.diskTotal,
diskRead: simMetric('read', t, seed) * NET_MAX.read, diskWrite: simMetric('write', t, seed) * NET_MAX.write,
},
};
}
const PLAYLIST = [
{ title: 'Glass Horizon', artist: 'Lumen Arcade', album: 'Refraction', duration: 214 },
{ title: 'Night Signal', artist: 'The Wavelengths', album: 'Low Light', duration: 187 },
{ title: 'Paper Satellites', artist: 'Mira Vale', album: 'Orbitals', duration: 243 },
{ title: 'Slow Aurora', artist: 'Kepler Youth', album: 'North', duration: 201 },
{ title: 'Spectral Drift', artist: 'Oda & the Prisms', album: 'White Light', duration: 228 },
];
function simMedia(t, seed = 0, { playing = true } = {}) {
const total = PLAYLIST.reduce((a, s) => a + s.duration, 0);
let x = wrap(64 + t, total);
let i = 0;
while (x >= PLAYLIST[i].duration) { x -= PLAYLIST[i].duration; i++; }
const s = PLAYLIST[i];
return { title: s.title, artist: s.artist, album: s.album, position: x, duration: s.duration, playing, index: i };
}
const AGENDA = [
{ at: 9 * 60, dur: 15, title: 'Standup' },
{ at: 10 * 60, dur: 45, title: 'Design review' },
{ at: 11 * 60 + 30, dur: 30, title: '1:1 with Ana' },
{ at: 13 * 60 + 30, dur: 60, title: 'Deck planning' },
{ at: 15 * 60, dur: 30, title: 'Lab sync' },
{ at: 16 * 60 + 30, dur: 45, title: 'Demo hour' },
];
function simCalendar(now, tzOffset = 0) {
const day = 86400000, local = now + tzOffset * 60000;
const midnight = Math.floor(local / day) * day - tzOffset * 60000;
const mins = (local - Math.floor(local / day) * day) / 60000;
const ev = (e, d = 0) => ({ title: e.title, at: midnight + (d * 1440 + e.at) * 60000, end: midnight + (d * 1440 + e.at + e.dur) * 60000 });
const current = AGENDA.find((e) => mins >= e.at && mins < e.at + e.dur);
const next = AGENDA.find((e) => e.at > mins);
return { next: next ? ev(next) : ev(AGENDA[0], 1), ...(current ? { current: ev(current) } : {}) };
}
};
__d[269] = function (__ns) {
const { simAudio, simSpectrum, simSeries, simMetric, simSystem, simMedia, simCalendar, NET_MAX, SIM_MACHINE } = __m(268);
const { clamp } = __m(12);
__e(__ns, { "audioOf": () => audioOf, "resample": () => resample, "spectrumOf": () => spectrumOf, "metricOf": () => metricOf, "tempOf": () => tempOf, "netOf": () => netOf, "seriesOf": () => seriesOf, "sysOf": () => sysOf, "mediaOf": () => mediaOf, "calendarOf": () => calendarOf, "rateText": () => rateText, "bytesText": () => bytesText, "pct": () => pct }, [], ["audioOf","bytesText","calendarOf","mediaOf","metricOf","netOf","pct","rateText","resample","seriesOf","spectrumOf","sysOf","tempOf"]);
const has = (o, k) => o && Object.hasOwn(o, k);
function audioOf(ctx, { count = 96, rate = 30 } = {}) {
const a = ctx.data?.audio;
if (a && Array.isArray(a.levels) && a.levels.length) {
const levels = a.levels.map((v) => clamp(+v || 0));
const level = typeof a.level === 'number' ? clamp(a.level) : levels[levels.length - 1];
return { level, levels, rate: a.rate || rate, peak: clamp(a.peak ?? Math.max(...levels.slice(-Math.round((a.rate || rate) * 0.6)))), rms: clamp(a.rms ?? level * 0.6), frac: 0, live: true };
}
return { ...simAudio(ctx.t, ctx.seed, { count, rate }), live: false };
}
function resample(values, count) {
const n = values.length;
if (n === count) return values.slice();
const out = new Array(count);
for (let i = 0; i < count; i++) {
if (n > count) {
const a = Math.floor((i * n) / count), b = Math.max(a + 1, Math.floor(((i + 1) * n) / count));
let s = 0, m = 0;
for (let j = a; j < b; j++) { s += values[j]; m = Math.max(m, values[j]); }
out[i] = 0.5 * (s / (b - a)) + 0.5 * m;
} else {
const x = count === 1 ? 0 : (i * (n - 1)) / (count - 1), j = Math.floor(x), f = x - j;
out[i] = values[j] + ((values[Math.min(n - 1, j + 1)] ?? values[j]) - values[j]) * f;
}
}
return out;
}
function spectrumOf(ctx, count = 24) {
const s = ctx.data?.spectrum;
if (s && Array.isArray(s.bands) && s.bands.length) {
const bands = resample(s.bands.map((v) => clamp(+v || 0)), count);
const peaks = Array.isArray(s.peaks) && s.peaks.length ? resample(s.peaks.map((v) => clamp(+v || 0)), count).map((p, i) => Math.max(p, bands[i])) : bands.slice();
return { bands, peaks, live: true };
}
return { ...simSpectrum(ctx.t, ctx.seed, { count }), live: false };
}
function metricOf(ctx, key) {
const d = ctx.data;
if (has(d, key)) return typeof d[key] === 'number' && Number.isFinite(d[key]) ? clamp(d[key]) : null;
if (key === 'battery') return simSystem(ctx.t, ctx.seed).battery;
return simMetric(key, ctx.t, ctx.seed);
}
function tempOf(ctx) {
const d = ctx.data;
if (has(d, 'temp')) return typeof d.temp === 'number' && Number.isFinite(d.temp) ? d.temp : null;
return 30 + 70 * simMetric('temp', ctx.t, ctx.seed);
}
function netOf(ctx) {
const d = ctx.data;
if (has(d, 'net')) return d.net && Number.isFinite(d.net.down) ? { down: Math.max(0, d.net.down), up: Math.max(0, +d.net.up || 0) } : null;
return { down: simMetric('down', ctx.t, ctx.seed) * NET_MAX.down, up: simMetric('up', ctx.t, ctx.seed) * NET_MAX.up };
}
function seriesOf(ctx, key, count = 30, step = 0.5) {
const live = ctx.data?.series?.[key];
if (Array.isArray(live) && live.length >= 2) {
let vals = live.slice(-count).map((v) => (Number.isFinite(+v) ? +v : 0));
while (vals.length < count) vals = [vals[0], ...vals];
if (['down', 'up', 'read', 'write'].includes(key)) {
const max = Math.max(1, ...vals);
return { values: vals.map((v) => v / max), frac: 0, live: true, max };
}
return { values: vals.map((v) => clamp(v)), frac: 0, live: true };
}
if (ctx.data && has(ctx.data, key === 'down' || key === 'up' ? 'net' : key) && !Array.isArray(live)) {
const v = key === 'down' || key === 'up' ? (netOf(ctx)?.[key] ?? 0) / NET_MAX[key] : metricOf(ctx, key) ?? 0;
return { values: new Array(count).fill(clamp(v)), frac: 0, live: true };
}
const s = simSeries(key, ctx.t, ctx.seed, count, step);
return { ...s, live: false, max: NET_MAX[key] };
}
function sysOf(ctx) {
const live = ctx.data?.sys;
const sim = has(ctx.data, 'cpu') ? null : simSystem(ctx.t, ctx.seed).sys;
return { ...(sim || { ...SIM_MACHINE, cores: null }), ...(live || {}) };
}
function mediaOf(ctx, { playing } = {}) {
const m = ctx.data?.media;
if (m && typeof m.title === 'string') return { artist: '', album: '', position: 0, duration: 0, playing: !!m.playing, ...m, live: true };
return { ...simMedia(ctx.t, ctx.seed, { playing: playing ?? true }), live: false };
}
function calendarOf(ctx) {
const c = ctx.data?.calendar;
if (c && (c.next || c.current)) return { ...c, live: true };
return { ...simCalendar(ctx.now, ctx.clock?.tzOffset ?? 0), live: false };
}
function rateText(bps, { bits = false } = {}) {
if (bps === null || bps === undefined || !Number.isFinite(bps)) return '—';
const v = bits ? bps * 8 : bps, u = bits ? ['b', 'Kb', 'Mb', 'Gb'] : ['B', 'KB', 'MB', 'GB'];
let i = 0, x = v;
while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
return `${x >= 100 || i === 0 ? Math.round(x) : x.toFixed(1)} ${u[i]}/s`;
}
function bytesText(b) {
if (!Number.isFinite(b)) return '—';
const u = ['B', 'KB', 'MB', 'GB', 'TB'];
let i = 0, x = b;
while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
return `${x >= 100 || i === 0 ? Math.round(x) : x.toFixed(1)} ${u[i]}`;
}
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(clamp(v) * 100)}%`);
};
__d[270] = function (__ns) {
const { path, roundRectPath } = __m(266);
const { capHeight } = __m(11);
const { metricOf, tempOf, netOf, seriesOf, sysOf, rateText, calendarOf } = __m(269);
const { header, stat, meter, segmented, gauge, spark, hhmm, localParts, DAYS, MONTHS, HUE, clamp } = __m(267);
__e(__ns, { "cpuCores": () => cpuCores, "cpuGauge": () => cpuGauge, "gpuGauge": () => gpuGauge, "memory": () => memory, "network": () => network, "volume": () => volume, "clock": () => clock }, [], ["clock","cpuCores","cpuGauge","gpuGauge","memory","network","volume"]);
const split = (s) => { const i = s.lastIndexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
const pctOf = (v) => (v === null ? '—' : Math.round(v * 100));
const tempText = (ctx, f) => { const t = tempOf(ctx); return t === null ? null : f ? `${Math.round(t * 1.8 + 32)} °F` : `${Math.round(t)} °C`; };
const cpuCores = (ctx, { fahrenheit = false } = {}) => (p, W) => {
const sys = sysOf(ctx), v = metricOf(ctx, 'cpu');
const cores = Array.isArray(sys.cores) ? sys.cores : [];
header(p, W, 'CPU', cores.length ? `${cores.length} cores` : sys.cpuGhz ? `${sys.cpuGhz} GHz` : '');
stat(p, { value: pctOf(v), unit: v === null ? '' : '%', xl: W.x0, base: Math.round(p.h * 0.64) });
const tt = tempText(ctx, fahrenheit);
p.caption(tt ? `${tt} package` : sys.cpuModel || '', { align: 'left', x: W.x0, y: W.footY, color: 'muted', maxWidth: W.w * 0.56 });
if (!cores.length) return;
const k = Math.min(16, cores.length), x0 = W.x0 + W.w * 0.6, ww = W.x1 - x0;
const gap = Math.max(3, (ww / k) * 0.34), bw = (ww - gap * (k - 1)) / k;
const top = W.eyebrowY + Math.round(W.pad * 0.9), bot = W.footY, hh = bot - top;
let tr = '', on = '';
for (let i = 0; i < k; i++) {
const x = x0 + i * (bw + gap), bh = Math.max(bw, hh * clamp(cores[i] ?? 0));
tr += roundRectPath(x, top, bw, hh, Math.min(bw / 2, 3));
on += roundRectPath(x, bot - bh, bw, bh, Math.min(bw / 2, 3));
}
p.add(path(tr, { fill: p.colors.line, fillOpacity: 0.6 }));
p.add(path(on, { fill: p.ctx.tint }));
};
const cpuGauge = (ctx) => (p, W) => {
const sys = sysOf(ctx), v = metricOf(ctx, 'cpu');
header(p, W, 'CPU', Array.isArray(sys.cores) && sys.cores.length ? `${sys.cores.length} cores` : sys.cpuGhz ? `${sys.cpuGhz} GHz` : '');
gaugeWithHistory(ctx, p, W, v, 'cpu');
};
const gpuGauge = (ctx) => (p, W) => {
const sys = sysOf(ctx), v = metricOf(ctx, 'gpu');
header(p, W, 'GPU', sys.gpuName || '');
gaugeWithHistory(ctx, p, W, v, 'gpu');
};
function gaugeWithHistory(ctx, p, W, v, key) {
const r = Math.round((W.footY - W.eyebrowY) * 0.4), cx = W.x0 + r + W.u * 2, cy = W.eyebrowY + (W.footY - W.eyebrowY) * 0.56;
gauge(p, { cx, cy, r, width: Math.max(6, Math.round(W.u * 3.2)), value: v ?? 0, from: -135, to: 135 });
const vs = p.typeStyle('value');
p.value(v === null ? '—' : `${Math.round(v * 100)}`, { x: cx, cy, size: vs.size * 0.62, maxWidth: r * 1.5 });
p.caption('%', { x: cx, y: cy + r * 0.78, color: 'muted' });
if (v === null) return; 
const sx = cx + r + W.u * 9, s = seriesOf(ctx, key, 28, 0.5);
spark(p, s.values, { x: sx, y: W.eyebrowY + W.pad * 0.9, w: W.x1 - sx, h: W.footY - W.eyebrowY - W.pad * 1.6, shift: ctx.reduced ? 0 : s.frac || 0 });
p.caption('last 15 s', { align: 'right', x: W.x1, y: W.footY, color: 'dim' });
}
const memory = (ctx) => (p, W) => {
const sys = sysOf(ctx), v = metricOf(ctx, 'mem');
const total = sys.memTotal || 0, used = sys.memUsed ?? (v !== null && total ? v * total : null);
const gb = (b) => { const x = b / 1024 ** 3; return x >= 100 ? `${Math.round(x)}` : x.toFixed(1).replace(/\.0$/, ''); };
header(p, W, 'Memory', v !== null ? [total ? `${Math.round(v * 100)}% of ${gb(total)} GB` : null, `${Math.round(v * 100)}% used`] : total ? `${gb(total)} GB` : '');
const none = used === null || used === undefined;
stat(p, { value: none ? '—' : gb(used), unit: none ? '' : 'GB', xl: W.x0, base: Math.round(p.h * 0.64) });
const bh = Math.max(6, Math.round(W.u * 2.6));
meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: v ?? 0 });
};
const network = (ctx) => (p, W) => {
const net = netOf(ctx);
const up = Number.isFinite(ctx.data?.uptime) ? ctx.data.uptime : 4 * 3600 + 12 * 60 + ctx.t;
header(p, W, 'Network', `up ${Math.floor(up / 3600)}:${String(Math.floor((up % 3600) / 60)).padStart(2, '0')}`);
const base = Math.round(p.h * 0.64), vs = p.typeStyle('value'), cs = p.typeStyle('caption');
const [dn, du] = split(rateText(net?.down ?? null)), [un, uu] = split(rateText(net?.up ?? null));
const aw = Math.round(cs.size * 0.9);
p.caption('↓', { align: 'left', x: W.x0, y: base, color: 'muted' });
const s = stat(p, { role: 'value', value: dn, unit: du, xl: W.x0 + aw, base, size: vs.size });
p.caption(`↑ ${un}${uu ? ` ${uu}` : ''}`, { align: 'left', x: W.x0, y: W.footY, color: 'muted' });
if (!net) return;
const sx = Math.max(s.right + W.u * 6, W.x0 + W.w * 0.6), d = seriesOf(ctx, 'down', 28, 0.5), u = seriesOf(ctx, 'up', 28, 0.5);
const box = { x: sx, y: W.eyebrowY + W.pad * 0.9, w: W.x1 - sx, h: W.footY - W.eyebrowY - W.pad * 0.9 };
spark(p, d.values, { ...box, shift: ctx.reduced ? 0 : d.frac || 0, area: 0.16 });
spark(p, u.values, { ...box, shift: ctx.reduced ? 0 : u.frac || 0, area: 0, head: false, color: p.theme.spectral(HUE.violet), width: Math.max(1.5, W.u * 0.6) });
};
const volume = (ctx, { value, muted = false, meta = 'Speakers' }) => (p, W) => {
const vol = clamp(value);
header(p, W, 'Volume', muted ? 'muted' : meta, { metaColor: muted ? 'neg' : 'dim' });
const gs = Math.round(p.h * 0.52);
p.glyph('volume', { state: muted ? 'muted' : 'on', level: vol, box: { x: W.x0 - gs * 0.16, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.4 - W.u, size: gs } });
stat(p, { value: Math.round(vol * 100), unit: '%', xr: W.x1 - Math.round(p.h * 0.17), base: Math.round(p.h * 0.66), color: muted ? 'dim' : undefined });
const mh = Math.max(6, Math.round(W.u * 3.4));
segmented(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: vol, count: 24, color: muted ? p.colors.dim : p.ctx.tint });
};
const clock = (ctx, { hour12 = false, seconds = true } = {}) => (p, W) => {
const c = ctx.clock;
header(p, W, `${DAYS[c.dow]} · ${c.day} ${MONTHS[c.month - 1]}`, seconds ? `:${String(c.s).padStart(2, '0')}` : '', { metaColor: 'dim' });
const hero = p.typeStyle('hero'), base = Math.round(p.h * 0.66), sz = hero.size;
const hh = hour12 ? ((c.h + 11) % 12) + 1 : c.h;
p.hero(`${hh}:${String(c.m).padStart(2, '0')}`, { align: 'left', x: W.x0 - sz * 0.03, cy: base - capHeight(sz, hero.weight) / 2, size: sz, maxWidth: W.w * 0.78 });
if (hour12) p.caption(c.h < 12 ? 'AM' : 'PM', { align: 'right', x: W.x1, y: base, color: 'muted' });
const cal = calendarOf(ctx), ev = cal.current && cal.current.end > ctx.now ? cal.current : cal.next;
if (ev && ev.at - ctx.now < 12 * 3600000) {
const t = localParts(ctx, ev.at);
p.caption(ev === cal.current ? `Now · ${ev.title}` : `${hhmm(t.h, t.m, hour12)} · ${ev.title}`, { align: 'left', x: W.x0, y: W.footY, color: 'muted', maxWidth: W.w });
} else p.caption(`Week ${weekOf(c)}`, { align: 'left', x: W.x0, y: W.footY, color: 'muted' });
};
function weekOf(c) {
const days = [31, (c.year % 4 === 0 && c.year % 100 !== 0) || c.year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let doy = c.day;
for (let i = 0; i < c.month - 1; i++) doy += days[i];
const dow = ((c.dow + 6) % 7) + 1;
return Math.max(1, Math.floor((doy - dow + 10) / 7));
}
};
__d[271] = function (__ns) {
const { surface } = __m(266);
const { galleon, HUE, GALLEON_PARAMS, clamp } = __m(267);
const { clock, volume, cpuGauge, network } = __m(270);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'screen-galleon-dashboard',
title: 'Galleon Dashboard',
category: 'Galleon Dashboards',
description: 'The Galleon 100 SD screen as an everyday overview: the clock and your next event, volume (turn the right dial), CPU and network, one widget per dial layer.',
tags: ['galleon', 'corsair', 'screen', 'dashboard', 'cpu', 'clock', 'volume', 'network', 'widgets'],
surface: 'screen',
screens: ['galleon'],
data: ['cpu', 'net', 'audio', 'media', 'clock', 'calendar', 'uptime', 'volume'],
dataShape: {
cpu: 'number 0–1', net: '{ up, down } bytes/s', uptime: 'seconds', calendar: '{ next: { title, at, end }, current? }',
media: '{ volume? 0–1, muted? } (system volume)', series: '{ cpu?, down?, up? } (extension)',
},
fps: 4,
loop: 12,
params: {
...GALLEON_PARAMS,
volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (until the right dial turns)' },
hour12: { type: 'bool', default: false, label: '12-hour clock' },
},
order: 10,
render(ctx) {
const m = ctx.data?.media, lv = ctx.data?.volume;
const dial = Array.isArray(ctx.values) && typeof ctx.values[1] === 'number' ? ctx.values[1] : null;
const vol = clamp(dial ?? (typeof lv?.level === 'number' ? lv.level : typeof m?.volume === 'number' ? m.volume : ctx.params.volume));
const volMuted = typeof lv?.muted === 'boolean' ? lv.muted : !!m?.muted;
return galleon(ctx, surface(ctx), [
[clock(ctx, { hour12: ctx.params.hour12 }), volume(ctx, { value: vol, muted: volMuted })],
[cpuGauge(ctx), network(ctx)],
], { hues: [[HUE.periwinkle, HUE.citrine], [HUE.violet, HUE.azure]] });
},
};
};
__d[272] = function (__ns) {
const { surface, compose, keyInto, svgInner, n } = __m(266);
const { createContext } = __m(251);
const { normalizeFacet } = __m(257);
const { default: dashboardModule } = __m(271);
const { glyphRegistry } = __m(231);
const { arc } = __m(15);
const { splitElements } = __m(252);
const { lerp } = __m(12);
__e(__ns, { "SHOWCASE": () => SHOWCASE, "showcaseKey": () => showcaseKey, "themeFacet": () => themeFacet }, [], ["SHOWCASE","showcaseKey","themeFacet"]);
const SHOWCASE = [
['mic', 'on', 'Mic'], ['volume', 'on', 'Volume'], ['play-pause', 'playing', 'Play'], ['broadcast', 'live', 'On Air'],
['cpu', 'busy', 'CPU'], ['clock', 'default', 'Clock'], ['bulb', 'on', 'Lights'], ['power', 'on', 'Power'],
['mic', 'off', 'Muted'], ['volume', 'muted', 'Silent'], ['play-pause', 'paused', 'Paused'], ['broadcast', 'offline', 'Offline'],
['bulb', 'off', 'Lamp'], ['power', 'off', 'Standby'], ['cpu', 'idle', 'Idle'], ['clock', 'default', 'Timer'],
];
function showcaseKey(k, [glyph, state, label], { hue } = {}) {
const reg = glyphRegistry().glyphs;
const g = reg.get(glyph) || reg.values().next().value;
if (!g) return;
const st = g.states[state] ? state : g.defaultState;
k.background({ tone: g.states[st] });
k.glyph(g.id, { state: st, labeled: true });
k.label(label, { color: g.states[st] === 'off' ? 'dim' : undefined });
void hue;
}
const DASHBOARD = normalizeFacet(dashboardModule, 'screens/galleon-dashboard.js');
function screenInto(d, ctx, S) {
const sc = createContext(DASHBOARD, { theme: ctx.facet.theme || ctx.theme.id, mode: ctx.theme.mode, t: ctx.t, now: ctx.now, seed: ctx.seed, data: ctx.data, reduced: ctx.reduced, idPrefix: `${ctx.idPrefix}gs`, tzOffset: ctx.clock?.tzOffset ?? 0 });
let body = svgInner(DASHBOARD.render(sc));
if (body.startsWith('<defs>')) { const e = body.indexOf('</defs>'); d.def(body.slice(6, e)); body = body.slice(e + 7); }
const sx = S.w / sc.w, sy = S.h / sc.h;
const tf = S.x || S.y || sx !== 1 || sy !== 1 ? `translate(${n(S.x)} ${n(S.y)})${sx !== 1 || sy !== 1 ? ` scale(${n(sx, 4)} ${n(sy, 4)})` : ''}` : null;
for (const el of splitElements(body)) d.add(tf ? `<g transform="${tf}">${el}</g>` : el);
}
function dialSegment(p, value, label, i) {
p.background({ tone: i === 0 ? 'active' : 'idle' });
p.eyebrow(label);
p.value(`${Math.round(value * 100)}`, { cy: p.h * 0.48 });
p.add(arc({ cx: p.w / 2, cy: p.h * 0.5, r: p.h * 0.36, from: -135, to: lerp(-135, 135, value), color: p.tone('active'), width: p.m.line * 1.4 }));
}
function themeFacet(themeId, { title, description, category = 'Signature', tags = [], order = 10, keys = SHOWCASE } = {}) {
return {
id: `theme-${themeId}`,
title: title || themeId,
category,
description: description || `The ${themeId} theme across a whole device: every key, the strip and the screen.`,
tags: ['theme', 'preview', ...tags],
surface: 'deck',
theme: themeId,
animated: true,
fps: 8,
loop: 6,
order,
render(ctx) {
const d = surface(ctx);
d.add(`<rect width="${ctx.w}" height="${ctx.h}" fill="#000000"/>`);
ctx.deck.keys.forEach((cell, i) => { const spec = keys[i % keys.length]; const g = glyphRegistry().glyphs.get(spec[0]); keyInto(d, cell, (k) => showcaseKey(k, spec), { tag: `k${i}`, hue: g?.hue }); });
if (ctx.deck.strip) {
const S = ctx.deck.strip, w = S.w / S.segments;
const labels = ['Master', 'Mic', 'Music', 'Chat', 'FX', 'Out'];
for (let i = 0; i < S.segments; i++) compose(d, { x: S.x + i * w, y: S.y, w, h: S.h }, (p) => dialSegment(p, ctx.values[i] ?? 0.5, labels[i], i), { kind: 'strip', tag: `s${i}` });
}
if (ctx.deck.screen && ctx.deck.screen.kind === 'galleon') screenInto(d, ctx, ctx.deck.screen);
if (ctx.deck.screen && ctx.deck.screen.kind === 'infobar') {
compose(d, ctx.deck.screen, (p) => {
p.background({ tone: 'idle' });
p.value('9:41', { align: 'left', x: 10, cy: p.h * 0.5, size: p.h * 0.5 });
p.eyebrow(ctx.theme.title, { align: 'right', x: p.w - 10, y: p.h * 0.58, size: p.h * 0.16 });
}, { kind: 'screen', tag: 'bar' });
}
return d.svg();
},
};
}
};
__d[273] = function (__ns) {
const { themeFacet } = __m(272);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('prism', {
title: 'Prism',
category: 'Signature',
description: 'Refraction on hardware: ink-navy glass keys lit from inside, the spectral Beam on every key that is on, pressed keys refracting.',
tags: ['signature', 'glass', 'spectrum', 'refraction'],
});
};
export { __m, __d, __e };
