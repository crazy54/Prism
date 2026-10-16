// prism-deck browser engine, bundled by website/build.mjs (the modules are in the repository under prism-deck/src).
import { __m, __d, __e } from './core.bundle.js';
__d[121] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('aurora', {
title: 'Aurora',
category: 'Dark',
description: 'Frosted keys over the northern lights: curtains rise and flow in each key’s hue when it turns on, light shines through etched frost, a press fogs the glass. By day, opal.',
tags: ['aurora', 'frost', 'glass', 'gradient', 'soft', 'night', 'day', 'opal'],
order: 40,
});
};
__d[122] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('blueprint', {
title: 'Blueprint',
category: 'Experimental',
description: 'White linework on a blue drafting grid: hatched sections, dashed hidden lines, every glyph dimensioned, a plotter that redraws on press. By day, a whiteprint.',
tags: ['blueprint', 'drafting', 'technical', 'grid', 'linework', 'cyanotype', 'whiteprint'],
order: 41,
});
};
__d[123] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('chrome', {
title: 'Chrome',
category: 'Dark',
description: 'Machined metal: chamfered keys with brushed faces, polished chrome glyphs and LEDs set in milled channels; a press travels in and springs back. By day, satin aluminum.',
tags: ['chrome', 'metal', 'machined', 'aluminum', 'led', 'night', 'day'],
order: 40,
});
};
__d[124] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('ember', {
title: 'Ember',
category: 'Dark',
description: 'Warm dark: a cast-iron firebox where glyphs are live embers with glowing cracks, heat is the state language and a press throws sparks. By day, pyrography on birch.',
tags: ['ember', 'fire', 'coal', 'warm', 'amber', 'pyrography'],
order: 21,
});
};
__d[125] = function (__ns) {
const { themeFacet } = __m(119);
const { normalizeFacet } = __m(104);
const { createContext } = __m(98);
const { svgInner, n } = __m(5);
const { default: dashboardModule } = __m(118);
__e(__ns, { "themeFacetWithScreen": () => themeFacetWithScreen }, [], ["themeFacetWithScreen"]);
const dashboard = normalizeFacet(dashboardModule, 'screens/galleon-dashboard.js');
function themeFacetWithScreen(themeId, opts) {
const base = themeFacet(themeId, opts);
return {
...base,
render(ctx) {
const S = ctx.deck?.screen;
if (!S || S.kind !== 'galleon') return base.render(ctx);
const svg = base.render({ ...ctx, deck: { ...ctx.deck, screen: null } });
const sc = createContext(dashboard, { theme: themeId, mode: ctx.theme.mode, t: ctx.t, now: ctx.now, seed: ctx.seed, data: ctx.data, reduced: ctx.reduced, idPrefix: `${ctx.idPrefix}gs`, tzOffset: ctx.clock?.tzOffset ?? 0 });
let defs = '', body = svgInner(dashboard.render(sc));
if (body.startsWith('<defs>')) { const e = body.indexOf('</defs>'); defs = body.slice(6, e); body = body.slice(e + 7); }
const open = svg.indexOf('>', svg.indexOf('<svg')) + 1, end = svg.lastIndexOf('</svg>');
const g = `<g transform="translate(${n(S.x)} ${n(S.y)})">${body}</g>`;
const head = !defs ? svg.slice(0, end) : svg.startsWith('<defs>', open) ? `${svg.slice(0, open + 6)}${defs}${svg.slice(open + 6, end)}` : `${svg.slice(0, open)}<defs>${defs}</defs>${svg.slice(open, end)}`;
return head + g + svg.slice(end);
},
};
}
};
__d[126] = function (__ns) {
const { themeFacetWithScreen } = __m(125);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacetWithScreen('mono', {
title: 'Mono',
category: 'Dark',
description: 'Accessibility first: pure black and white at 21:1, AAA text, bold type, heavy frames and reversed labels for on, shape-coded alerts and gray off keys. Day for bright rooms.',
tags: ['mono', 'accessibility', 'high contrast', 'low vision', 'aaa', 'black', 'white'],
order: 12,
});
};
__d[127] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('neon', {
title: 'Neon',
category: 'Dark',
description: 'Glass tubes on black: every glyph bent from gas-filled neon with a white-hot core; tubes switch, alerts buzz, a press re-strikes the gas. By day, a sign on whitewashed brick.',
tags: ['neon', 'glow', 'sign', 'tubes', 'night', 'day'],
order: 20,
});
};
__d[128] = function (__ns) {
const { themeFacetWithScreen } = __m(125);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacetWithScreen('paper', {
title: 'Paper',
category: 'Light',
description: 'Letterpress on warm cotton stock: impressed glyphs, a spot color off register, halftone for on, dog-eared alerts, proof-gray off keys. By night, white ink and foil on black card.',
tags: ['paper', 'print', 'letterpress', 'halftone', 'foil', 'light', 'warm'],
order: 31,
});
};
__d[129] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('phosphor', {
title: 'Phosphor',
category: 'Dark',
description: 'Green CRT keys: beam-drawn glyphs in a phosphor bloom, whole-pixel scanlines and persistence trails; by day, reverse video.',
tags: ['crt', 'terminal', 'phosphor', 'scanlines', 'retro', 'green'],
});
};
__d[130] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('pixel', {
title: 'Pixel',
category: 'Experimental',
description: '8-bit LCD keys: glyphs on a whole-pixel dot matrix, dithered light from below, bitmap type, and presses that drop the face one pixel.',
tags: ['8-bit', 'pixel', 'lcd', 'retro', 'dither', 'bitmap'],
});
};
__d[131] = function (__ns) {
const { themeFacet } = __m(119);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = themeFacet('porcelain', {
title: 'Porcelain',
category: 'Light',
description: 'Glossy white ceramic tiles painted in cobalt: underglaze brushwork, raised enamel and china bands when lit, gold luster, a press that rings. By night, cobalt glaze.',
tags: ['porcelain', 'ceramic', 'glaze', 'cobalt', 'gold', 'day', 'night'],
order: 40,
});
};
__d[132] = function (__ns) {
const { getGlyph } = __m(78);
const { GLYPH_CATEGORIES } = __m(2);
const { surface } = __m(110);
__e(__ns, { "iconFacet": () => iconFacet }, [], ["iconFacet"]);
function iconFacet(glyphId, extra = {}) {
const g = getGlyph(glyphId);
if (!g) throw new Error(`iconFacet: unknown glyph "${glyphId}" (add src/glyphs/<category>/${glyphId}.js and run npm run facets:manifest)`);
const states = g.stateNames.length > 1 ? g.stateNames : [];
return {
id: `icon-${g.id}`,
title: g.title,
category: GLYPH_CATEGORIES[g.category] || 'Status',
description: extra.description || `The ${g.title.toLowerCase()} glyph${states.length ? ` (${states.join(' / ')})` : ''}: 48-unit geometry, painted by whichever deck theme is active.`.slice(0, 180),
tags: [...new Set(['icon', ...g.tags])],
surface: 'key',
glyph: g.id,
animated: true,
fps: g.loop ? 12 : 10,
loop: g.loop || 2,
states,
tones: states.length ? Object.fromEntries(states.map((s) => [s, g.states[s]])) : undefined,
press: states.length === 2 ? 'toggle' : states.length ? 'cycle' : 'momentary',
params: {
label: { type: 'text', default: extra.label || g.title, label: 'Label', maxLength: 14 },
showLabel: { type: 'bool', default: true, label: 'Show label' },
level: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.05, label: 'Level' },
hue: { type: 'hue', default: g.hue ?? 269.8, min: 0, max: 360, step: 1, label: 'Hue' },
},
order: extra.order ?? 50,
render(ctx) {
const k = surface(ctx);
const state = ctx.stateName || g.defaultState;
const tone = g.states[state];
const labeled = !!(ctx.params.showLabel && ctx.params.label);
k.background({ tone });
k.glyph(g.id, { state, labeled, level: ctx.params.level });
if (labeled) k.label(ctx.params.label, { color: tone === 'off' ? 'dim' : undefined });
return k.svg();
},
};
}
};
__d[133] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('alarm', { label: 'Alarm' });
};
__d[134] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('alert');
};
__d[135] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('back', { label: 'Back' });
};
__d[136] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('battery');
};
__d[137] = function (__ns) {
const { rect, path, n } = __m(113);
const { mix, contrast } = __m(4);
const { arrive } = __m(12);
__e(__ns, { "GLYPH_LINKS": () => GLYPH_LINKS, "pairLink": () => pairLink, "washOf": () => washOf, "mutedPlate": () => mutedPlate, "strike": () => strike, "mutedKey": () => mutedKey }, [], ["GLYPH_LINKS","mutedKey","mutedPlate","pairLink","strike","washOf"]);
const GLYPH_LINKS = Object.freeze({
mic: { channel: 'mic.muted', lit: false, rest: true },
camera: { channel: 'camera.on', lit: true, rest: false },
volume: { channel: 'volume.muted', lit: false, rest: true },
broadcast: { channel: 'stream.live', lit: true, rest: false },
viewers: { channel: 'stream.live', lit: true, rest: false },
});
function pairLink(glyph, [lit = 'on', rest = 'off'] = []) {
const L = GLYPH_LINKS[glyph];
return L ? { [L.channel]: { [lit]: L.lit, [rest]: L.rest } } : {};
}
function washOf(k) {
const C = k.colors;
let a = k.dark ? 0.62 : 0.5;
while (a > 0.2 && contrast(C.ink, mix(C.surface, C.neg, a)) < 4.5) a -= 0.03;
return a;
}
function mutedPlate(k, { x = 0, y = 0, w = k.w, h = k.h, since = Infinity, radius } = {}) {
const u = k.ctx.reduced ? 1 : 0.35 + 0.65 * arrive(since, 0.3);
const a = washOf(k), r = radius ?? k.m.radius;
k.add(rect({ x: n(x), y: n(y), width: n(w), height: n(h), rx: n(r), fill: k.colors.neg, fillOpacity: n(a * u, 3) }));
const ring = Math.max(2, k.m.u * 2.4), inset = (k.m.bleed ?? 4 * k.m.u) + ring / 2;
k.add(rect({ x: n(x + inset), y: n(y + inset), width: n(w - inset * 2), height: n(h - inset * 2), rx: n(Math.max(0, r - inset * 0.5)), fill: 'none', stroke: k.colors.neg, strokeWidth: n(ring) }));
}
function strike(k, box, { since = Infinity } = {}) {
const s = box.size / 48, u = k.ctx.reduced ? 1 : arrive(since, 0.32);
const x0 = box.x + 10 * s, y0 = box.y + 8 * s;
const d = `M${n(x0)} ${n(y0)}L${n(x0 + 28 * s * Math.max(0.05, u))} ${n(y0 + 32 * s * Math.max(0.05, u))}`;
const w = Math.max(2, 3.1 * s);
k.add(path(d, { fill: 'none', stroke: k.dark ? '#000000' : '#ffffff', strokeWidth: n(w * 2.3), strokeOpacity: 0.6, strokeLinecap: 'round' }));
k.add(path(d, { fill: 'none', stroke: k.colors.ink, strokeWidth: n(w), strokeLinecap: 'round' }));
}
function mutedKey(k, { glyph = 'mic', state = 'off', label = 'MUTED', since = Infinity, labeled = true, eyebrow } = {}) {
k.background({ tone: 'neg' });
mutedPlate(k, { since });
const box = k.theme.glyphBox(k, { labeled });
k.glyph(glyph, { state, labeled, since });
strike(k, box, { since });
if (eyebrow) k.eyebrow(eyebrow, { color: 'ink' });
if (labeled) k.label(String(label).toUpperCase(), { color: 'ink' });
}
};
__d[138] = function (__ns) {
const { iconFacet } = __m(132);
const { pairLink } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('broadcast', { label: 'On Air' });
const __default = { ...base, tags: [...new Set([...base.tags, 'on air', 'live', 'stream', 'streaming', 'broadcast', 'obs-style'])], link: pairLink('broadcast', ['live', 'offline']) };
};
__d[139] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('bug');
};
__d[140] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('bulb', { label: 'Lights' });
};
__d[141] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('calendar', { label: 'Calendar' });
const __default = {
...base,
data: ['clock', 'calendar'],
params: { ...base.params, day: { type: 'number', default: 0, min: 0, max: 31, step: 1, label: 'Day (0 = today)' } },
render(ctx) {
const day = ctx.params.day >= 1 ? ctx.params.day : ctx.clock.day;
return base.render({ ...ctx, params: { ...ctx.params, day } });
},
};
};
__d[142] = function (__ns) {
const { iconFacet } = __m(132);
const { pairLink } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('camera', { label: 'Camera' });
const __default = { ...base, link: pairLink('camera', ['on', 'off']) };
};
__d[143] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('chat', { label: 'Chat' });
const __default = { ...base, tags: [...new Set([...base.tags, 'chat', 'live chat', 'stream', 'streaming', 'messages', 'obs-style'])] };
};
__d[144] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('check');
};
__d[145] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('clock');
};
__d[146] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('cloud');
};
__d[147] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('code');
};
__d[148] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('coffee', { label: 'Coffee' });
};
__d[149] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('cpu');
};
__d[150] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('disk');
};
__d[151] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('equalizer', { label: 'EQ' });
};
__d[152] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('fan', { label: 'Fan' });
};
__d[153] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('folder', { label: 'Folder' });
};
__d[154] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('git-branch');
};
__d[155] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('gpu');
};
__d[156] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('headphones', { label: 'Phones' });
};
__d[157] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('home', { label: 'Home' });
};
__d[158] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('info');
};
__d[159] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('lock');
};
__d[160] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('mail', { label: 'Mail' });
};
__d[161] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('marker', { label: 'Marker' });
};
__d[162] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('memory');
};
__d[163] = function (__ns) {
const { iconFacet } = __m(132);
const { surface } = __m(110);
const { mutedKey, pairLink } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('mic', { label: 'Mic', description: 'The mic glyph, live or muted. Muted fills the key red with a struck mic and MUTED; linked keys and screens on the deck follow. Shows state only.' });
const __default = {
...base,
tags: [...new Set([...base.tags, 'microphone', 'mute', 'muted', 'stream', 'streaming', 'meeting'])],
link: pairLink('mic', ['on', 'off']),
render(ctx) {
if (ctx.stateName !== 'off') return base.render(ctx);
const k = surface(ctx);
mutedKey(k, { labeled: !!(ctx.params.showLabel && ctx.params.label), since: ctx.since });
return k.svg();
},
};
};
__d[164] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('mixer', { label: 'Mixer' });
};
__d[165] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('music-note', { label: 'Music' });
};
__d[166] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('network');
};
__d[167] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('note', { label: 'Note' });
};
__d[168] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('pages', { label: 'Pages' });
};
__d[169] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('play-pause', { label: 'Play' });
};
__d[170] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('plug', { label: 'Plug' });
};
__d[171] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('power');
};
__d[172] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('record', { label: 'Record' });
const __default = { ...base, tags: [...new Set([...base.tags, 'rec', 'recording', 'stream', 'streaming', 'broadcast', 'obs-style'])] };
};
__d[173] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('rocket');
};
__d[174] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('scene', { label: 'Scene' });
const __default = { ...base, tags: [...new Set([...base.tags, 'stream', 'streaming', 'broadcast', 'scene', 'scenes', 'obs-style'])] };
};
__d[175] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('search', { label: 'Search' });
};
__d[176] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('shuffle', { label: 'Shuffle' });
};
__d[177] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('skip-next', { label: 'Next' });
};
__d[178] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('skip-prev', { label: 'Previous' });
};
__d[179] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('stop', { label: 'Stop' });
};
__d[180] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('stopwatch', { label: 'Chrono' });
};
__d[181] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('sync');
};
__d[182] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('target', { label: 'Focus' });
};
__d[183] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('terminal');
};
__d[184] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('thermostat', { label: 'Climate' });
const __default = {
...base,
params: {
...base.params,
value: { type: 'number', default: 0.55, min: 0, max: 1, step: 0.025, label: 'Setpoint' },
unit: { type: 'select', default: 'C', options: ['C', 'F'], label: 'Unit' },
},
};
};
__d[185] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('timer', { label: 'Timer' });
const __default = {
...base,
data: ['timer'],
params: { ...base.params, minutes: { type: 'number', default: 5, min: 1, max: 120, step: 1, label: 'Dial minutes' } },
};
};
__d[186] = function (__ns) {
const { iconFacet } = __m(132);
const { pairLink } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('viewers', { label: 'Viewers' });
const __default = { ...base, tags: [...new Set([...base.tags, 'stream', 'streaming', 'audience', 'chat'])], link: pairLink('viewers', ['live', 'offline']) };
};
__d[187] = function (__ns) {
const { iconFacet } = __m(132);
const { pairLink } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const base = iconFacet('volume');
const __default = { ...base, link: pairLink('volume', ['on', 'muted']) };
};
__d[188] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('waveform', { label: 'Waveform' });
};
__d[189] = function (__ns) {
const { iconFacet } = __m(132);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = iconFacet('wifi');
};
__d[190] = function (__ns) {
const { KeySurface, PanelSurface } = __m(110);
const { childContext } = __m(111);
const { n, attrs } = __m(5);
const { polar } = __m(15);
__e(__ns, { "glyphId": () => glyphId, "litState": () => litState, "restState": () => restState, "stateWithTone": () => stateWithTone, "themeBox": () => themeBox, "cellOf": () => cellOf, "snapTo": () => snapTo, "layer": () => layer, "addFaded": () => addFaded, "cellRing": () => cellRing, "squaresPath": () => squaresPath, "breath": () => breath, "stepped": () => stepped, "glyphTime": () => glyphTime }, [], ["addFaded","breath","cellOf","cellRing","glyphId","glyphTime","layer","litState","restState","snapTo","squaresPath","stateWithTone","stepped","themeBox"]);
function glyphId(ctx, want, fallback = 'power') {
if (want && ctx.glyphs.has(want)) return want;
if (ctx.glyphs.has(fallback)) return fallback;
return ctx.glyphs.keys().next().value;
}
const LIT = ['active', 'alert', 'ok', 'warn', 'crit', 'info'];
function litState(g) {
for (const tone of LIT) { const s = g.stateNames.find((x) => g.states[x] === tone); if (s) return s; }
return g.defaultState;
}
function restState(g) {
return g.stateNames.find((x) => g.states[x] === 'idle' || g.states[x] === 'off') || g.defaultState;
}
function stateWithTone(g, tones) {
for (const tone of tones) { const s = g.stateNames.find((x) => g.states[x] === tone); if (s) return s; }
return g.defaultState;
}
const themeBox = (k, labeled = true) => k.theme.glyphBox(k, { labeled });
function cellOf(k, box) {
return (k.theme.tags || []).includes('pixel') ? box.size / 20 : 0;
}
const snapTo = (v, cell) => (cell ? Math.round(v / cell) * cell : Math.round(v));
function layer(k, tone, draw) {
const ctx = childContext(k.ctx, { x: 0, y: 0, w: k.w, h: k.h }, { kind: k.ctx.kind, tag: `l${tone}${(k._d2l = (k._d2l || 0) + 1)}`, tone });
const sub = ctx.kind === 'key' ? new KeySurface(ctx) : new PanelSurface(ctx);
sub.background({ tone });
if (draw) draw(sub);
if (sub.defs) k.def(sub.defs);
return sub.body;
}
function addFaded(k, markup, opacity) {
if (opacity <= 0.01 || !markup) return;
k.add(opacity >= 0.99 ? markup : `<g${attrs({ opacity: n(opacity, 3) })}>${markup}</g>`);
}
function cellRing(cx, cy, r, from, to, cell, { ox = 0, oy = 0 } = {}) {
const seen = new Set(), cells = [];
const steps = Math.max(8, Math.ceil((Math.abs(to - from) / 360) * 2 * Math.PI * r / (cell * 0.5)));
for (let i = 0; i <= steps; i++) {
const [x, y] = polar(cx, cy, r, from + ((to - from) * i) / steps);
const gx = Math.round((x - ox) / cell - 0.5), gy = Math.round((y - oy) / cell - 0.5);
const key = `${gx},${gy}`;
if (seen.has(key)) continue;
seen.add(key);
cells.push([ox + gx * cell, oy + gy * cell]);
}
return cells;
}
const squaresPath = (cells, cell) => cells.map(([x, y]) => `M${n(x)} ${n(y)}h${n(cell)}v${n(cell)}h${n(-cell)}Z`).join('');
function breath(p) {
const q = p < 0.4 ? (p / 0.4) * 0.5 : 0.5 + ((p - 0.4) / 0.6) * 0.5;
return (Math.exp(Math.sin(2 * Math.PI * q - Math.PI / 2)) - 1 / Math.E) / (Math.E - 1 / Math.E);
}
const stepped = (v, cell, steps = 4) => (cell ? Math.round(v * steps) / steps : v);
function glyphTime(ctx, g) {
const gl = g.loop || 0;
if (ctx.reduced) return gl * 0.4;
const L = ctx.facet.loop;
if (!gl || !L) return ctx.t;
const cycles = Math.max(1, Math.round(L / gl));
const p = (ctx.t % L + L) % L;
return (p / L) * cycles * gl;
}
};
__d[191] = function (__ns) {
const { surface, path, rect, n, phase, clamp, arrive, polar, arcPath } = __m(113);
const { cellOf, themeBox, cellRing, squaresPath } = __m(190);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HOLD = 2;
const __default = {
id: 'alert-countdown',
title: 'Countdown',
category: 'Alerts & Attention',
description: 'Counts down to a moment: the ring drains a step each second, the last three turn amber then red with a beat, and zero lands as a flash.',
tags: ['alert', 'countdown', 'timer', 'go live', 'deadline', 'seconds', 'attention'],
surface: 'key',
fps: 10,
loop: 12,
params: {
seconds: { type: 'number', default: 10, min: 3, max: 60, step: 1, label: 'From (s)' },
label: { type: 'text', default: 'Live in', label: 'Eyebrow', maxLength: 12 },
endLabel: { type: 'text', default: 'Live', label: 'At zero', maxLength: 8 },
},
order: 40,
render(ctx) {
const k = surface(ctx);
const N = Math.round(ctx.params.seconds);
const cycle = N + HOLD;
const tc = ctx.reduced ? N * 0.4 : phase(ctx.t, cycle) * cycle;
const done = tc >= N;
const sec = Math.floor(tc), frac = tc - sec;
const left = N - sec; 
const a = arrive(frac, 0.3);
const tone = done ? 'crit' : left <= 1 ? 'crit' : left <= 3 ? 'warn' : 'active';
k.background({ tone });
const color = k.tone(tone);
const box = themeBox(k, false);
const cell = cellOf(k, box);
const cx = k.w / 2, cy = k.h / 2;
const R = Math.min(k.w, k.h) / 2 - k.m.safe * 0.75;
const sw = cell ? Math.max(1, Math.round(cell * 0.75)) : Math.max(1.5, k.m.bold * 0.8);
const value = done ? 1 : (left - a) / N;
if (cell) {
const all = cellRing(cx, cy, R - sw, 0, 360, sw);
const on = cellRing(cx, cy, R - sw, 0, 360 * value, sw);
k.add(path(squaresPath(all, sw), { fill: k.colors.dim, fillOpacity: 0.35 }));
if (value > 0.001) k.add(path(squaresPath(on, sw), { fill: color }));
} else {
k.add(path(arcPath(cx, cy, R - sw / 2, 0, 359.99), { fill: 'none', stroke: k.colors.dim, strokeWidth: n(sw), strokeOpacity: 0.3 }));
if (value > 0.001) k.add(path(arcPath(cx, cy, R - sw / 2, 0, Math.min(359.99, 360 * value)), { fill: 'none', stroke: color, strokeWidth: n(sw), strokeLinecap: 'round' }));
if (!done && value > 0.001) { const [hx, hy] = polar(cx, cy, R - sw / 2, 360 * value); k.add(`<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(sw * 0.9)}" fill="${k.dark ? '#ffffff' : k.colors.ink}"/>`); }
}
if (done) {
const e = Math.exp(-(tc - N) / 0.3);
if (e > 0.02) k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.45 : 0.3) * (cell ? Math.ceil(e * 3) / 3 : e), 3) }));
k.hero(ctx.params.endLabel, { cy, maxWidth: R * 1.5 });
return k.svg();
}
if (left <= 3 && frac < 0.35) k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.16 : 0.1) * (1 - frac / 0.35), 3) }));
const digit = String(left);
const split = (1 - a) * Math.max(2, k.m.bold * 1.2);
const off = cell ? Math.round(split) : split;
if (off > 0.4) {
k.hero(digit, { cy: cy + k.h * 0.04, x: cx - off, color: ctx.theme.spectral(ctx.hue - 60), opacity: 0.55 * (1 - a), maxWidth: R * 1.4 });
k.hero(digit, { cy: cy + k.h * 0.04, x: cx + off, color: ctx.theme.spectral(ctx.hue + 60), opacity: 0.55 * (1 - a), maxWidth: R * 1.4 });
}
k.hero(digit, { cy: cy + k.h * 0.04, opacity: 0.35 + 0.65 * a, maxWidth: R * 1.4 });
k.eyebrow(ctx.params.label, { align: 'center', x: cx, y: cy - R * 0.42, maxWidth: R * 1.3 });
return k.svg();
},
};
};
__d[192] = function (__ns) {
const { surface, rect, circle, n, phase, lerp, clamp, outCubic, arrive } = __m(113);
const { glyphId, stateWithTone, themeBox, cellOf, layer, addFaded, glyphTime } = __m(190);
__e(__ns, { "SEVERITY": () => SEVERITY, "beat": () => beat, "default": () => __default }, [], ["SEVERITY","beat","default"]);
const SEVERITY = { warn: 1.6, alert: 1.2, crit: 0.8 };
const beat = (p) => (p < 0.18 ? outCubic(p / 0.18) : (1 - (p - 0.18) / 0.82) ** 2.2);
const __default = {
id: 'alert-pulse',
title: 'Pulse',
category: 'Alerts & Attention',
description: 'An alert that pulses at its severity: slow for a warning, quicker for an alert, quickest for critical, with a ripple per beat. Press to acknowledge.',
tags: ['alert', 'pulse', 'attention', 'warning', 'critical', 'notification', 'acknowledge'],
surface: 'key',
fps: 10,
loop: 4.8,
states: ['alerting', 'acknowledged'],
tones: { alerting: 'alert', acknowledged: 'idle' },
press: 'toggle',
params: {
glyph: { type: 'glyph', default: 'broadcast', label: 'Glyph' },
label: { type: 'text', default: 'Alert', label: 'Label', maxLength: 14 },
severity: { type: 'select', default: 'alert', options: ['warn', 'alert', 'crit'], label: 'Severity' },
},
order: 10,
render(ctx) {
const k = surface(ctx);
const sev = SEVERITY[ctx.params.severity] ? ctx.params.severity : 'alert';
const gid = glyphId(ctx, ctx.params.glyph, 'broadcast');
const g = ctx.glyphs.get(gid);
const alerting = ctx.stateName !== 'acknowledged';
const color = k.tone(sev);
if (!alerting) {
const s = arrive(ctx.since, 0.5);
k.background({ tone: 'idle' });
addFaded(k, layer(k, sev), 1 - s);
k.glyph(gid, { labeled: true, state: g.defaultState, t: glyphTime(ctx, g) });
k.eyebrow('Seen', { color: 'muted' });
k.label(ctx.params.label, { color: 'muted' });
return k.svg();
}
const T = SEVERITY[sev];
const p = ctx.reduced ? 0.15 : phase(ctx.t, T);
const box = themeBox(k, true);
const cell = cellOf(k, box);
let v = beat(p);
if (cell) v = v > 0.66 ? 1 : v > 0.33 ? 0.6 : 0.25; 
k.background({ tone: sev });
const inset = k.m.hair * 1.5;
k.add(rect({ x: inset, y: inset, width: k.w - inset * 2, height: k.h - inset * 2, rx: cell ? 0 : k.m.radius, fill: 'none', stroke: color, strokeWidth: n(cell ? Math.max(1, Math.round(cell / 2)) : k.m.line * 1.4), strokeOpacity: n(lerp(0.2, 0.95, v), 3) }));
k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.1 : 0.08) * v, 3) }));
const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
const rp = clamp(p / 0.75);
if (!ctx.reduced && rp < 1) {
const r = lerp(box.size * 0.32, Math.hypot(k.w, k.h) * 0.5, outCubic(rp));
if (cell) {
const R = Math.round(r / cell) * cell, sw = Math.max(1, Math.round(cell / 2));
k.add(rect({ x: Math.round(cx - R), y: Math.round(cy - R), width: R * 2, height: R * 2, fill: 'none', stroke: color, strokeWidth: sw, strokeOpacity: n(rp < 0.5 ? 0.8 : 0.4, 2) }));
} else {
k.add(circle({ cx, cy, r, fill: 'none', stroke: color, strokeWidth: n(k.m.line * (1.6 - rp)), strokeOpacity: n((1 - rp) ** 1.3 * 0.85, 3) }));
}
}
k.glyph(gid, { labeled: true, t: glyphTime(ctx, g), state: stateWithTone(g, [sev, 'alert', 'crit', 'warn', 'active']) });
k.label(ctx.params.label, { color: v > 0.6 ? color : 'ink' });
return k.svg();
},
};
};
__d[193] = function (__ns) {
const { surface, path, n, phase, clamp } = __m(113);
const { glyphId, stateWithTone, themeBox, cellOf, snapTo, glyphTime } = __m(190);
const { mutedPlate, strike } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BURST = 0.7;
const __default = {
id: 'alert-shake',
title: 'Shake',
category: 'Alerts & Attention',
description: 'A nudge: the glyph jolts side to side in a short damped burst, then rests, like a tap on the shoulder. Press to quiet it.',
tags: ['alert', 'shake', 'nudge', 'wiggle', 'muted', 'notification', 'attention'],
surface: 'key',
fps: 10,
loop: 2.4,
states: ['nudging', 'quiet'],
tones: { nudging: 'neg', quiet: 'idle' },
press: 'toggle',
params: {
glyph: { type: 'glyph', default: 'mic', label: 'Glyph' },
label: { type: 'text', default: 'Muted', label: 'Label', maxLength: 14 },
tone: { type: 'select', default: 'neg', options: ['neg', 'warn', 'alert', 'info', 'active'], label: 'Tone' },
every: { type: 'select', default: 2.4, options: [1.2, 2.4, 4.8], label: 'Every (s)' },
},
order: 30,
render(ctx) {
const k = surface(ctx);
const gid = glyphId(ctx, ctx.params.glyph, 'mic');
const g = ctx.glyphs.get(gid);
const tone = ctx.params.tone;
const quiet = ctx.stateName === 'quiet';
const state = stateWithTone(g, quiet ? ['idle', 'off'] : [tone === 'alert' ? 'alert' : tone, 'neg', 'alert', 'warn']);
k.background({ tone: quiet ? 'idle' : tone });
const mutedMic = gid === 'mic' && !quiet && tone === 'neg'; 
if (mutedMic) mutedPlate(k, { since: ctx.since });
const box = themeBox(k, true);
const cell = cellOf(k, box);
const ts = phase(ctx.t, Number(ctx.params.every) || 2.4) * (Number(ctx.params.every) || 2.4);
const on = !quiet && !ctx.reduced && ts < BURST;
const A = k.w * 0.075;
const x = on ? A * Math.exp(-ts / 0.24) * Math.cos(2 * Math.PI * 5 * ts) : 0;
const dx = snapTo(x, cell);
const color = k.tone(tone);
if (on && Math.abs(dx) > 0.5) {
const side = dx > 0 ? -1 : 1;
const gx = box.x + box.size / 2 + dx + side * box.size * 0.42;
const cy = box.y + box.size / 2, L = box.size * 0.13, gap = box.size * 0.11;
const sw = cell ? Math.max(1, Math.round(cell * 0.75)) : Math.max(1.25, k.m.line);
let d = '';
for (const j of [-1, 0, 1]) { const yy = Math.round(cy + j * gap), xx = Math.round(gx + side * (j === 0 ? L * 0.4 : 0)); d += `M${n(xx)} ${n(yy)}h${n(side * L)}`; }
k.add(path(d, { stroke: color, strokeWidth: n(sw), strokeOpacity: n(clamp(1 - ts / BURST) * 0.9, 3), strokeLinecap: cell ? 'butt' : 'round' }));
}
k.glyph(gid, { box: { ...box, x: box.x + dx }, state, t: glyphTime(ctx, g) });
if (mutedMic) strike(k, { ...box, x: box.x + dx });
k.label(mutedMic ? String(ctx.params.label).toUpperCase() : ctx.params.label, { color: mutedMic ? 'ink' : on ? color : quiet ? 'muted' : 'ink' });
return k.svg();
},
};
};
__d[194] = function (__ns) {
const { surface, path, rect, radialGradient, linearGradient, url, n, phase, clamp, polar, arrive } = __m(113);
const { glyphId, stateWithTone, themeBox, cellOf, layer, addFaded, glyphTime } = __m(190);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'alert-siren',
title: 'Siren',
category: 'Alerts & Attention',
description: 'A rotating beacon sweeps two beams around the glyph and flashes the key softly as one faces you, or a wig-wag alternates two lamps. Press to silence.',
tags: ['alert', 'siren', 'beacon', 'emergency', 'rotating', 'wigwag', 'attention'],
surface: 'key',
fps: 10,
loop: 2.4,
states: ['sounding', 'silenced'],
tones: { sounding: 'alert', silenced: 'off' },
press: 'toggle',
params: {
style: { type: 'select', default: 'rotate', options: ['rotate', 'wigwag'], label: 'Style' },
glyph: { type: 'glyph', default: 'broadcast', label: 'Glyph' },
label: { type: 'text', default: 'Alarm', label: 'Label', maxLength: 14 },
severity: { type: 'select', default: 'alert', options: ['warn', 'alert', 'crit'], label: 'Severity' },
},
order: 20,
render(ctx) {
const k = surface(ctx);
const sev = ['warn', 'alert', 'crit'].includes(ctx.params.severity) ? ctx.params.severity : 'alert';
const gid = glyphId(ctx, ctx.params.glyph, 'broadcast');
const g = ctx.glyphs.get(gid);
const color = k.tone(sev);
const box = themeBox(k, true);
const cell = cellOf(k, box);
const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
if (ctx.stateName === 'silenced') {
const s = arrive(ctx.since, 0.4);
k.background({ tone: 'off' });
addFaded(k, layer(k, sev), 1 - s);
k.glyph(gid, { labeled: true, state: g.defaultState, t: glyphTime(ctx, g) });
k.label('Silenced', { color: 'dim' });
return k.svg();
}
k.background({ tone: sev });
const R = Math.hypot(k.w, k.h);
let flash = 0;
if (ctx.params.style === 'wigwag') {
const left = ctx.reduced || phase(ctx.t, 0.8) < 0.5;
const id = k.id('lamp');
const x0 = left ? 0 : k.w;
k.def(linearGradient(id, [[0, color, k.dark ? 0.55 : 0.4], [0.55, color, k.dark ? 0.12 : 0.08], [1, color, 0]], { x1: x0, y1: 0, x2: k.w / 2 + (left ? 0.1 : -0.1) * k.w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ x: left ? 0 : k.w / 2, y: 0, width: k.w / 2, height: k.h, fill: url(id) }));
const bar = cell ? Math.max(1, Math.round(cell)) : Math.max(1.5, k.m.line * 1.6);
k.add(rect({ x: left ? 0 : k.w - bar, y: 0, width: bar, height: k.h, fill: color, fillOpacity: 0.9 }));
flash = 0.35;
} else {
const a = ctx.reduced ? 160 : phase(ctx.t, 1.2) * 360;
const id = k.id('beam');
k.def(radialGradient(id, [[0, color, k.dark ? 0.6 : 0.45], [0.35, color, k.dark ? 0.22 : 0.16], [1, color, 0]], { cx, cy, r: R * 0.7, gradientUnits: 'userSpaceOnUse' }));
const wedge = (ang, spread) => { const [x1, y1] = polar(cx, cy, R, ang - spread), [x2, y2] = polar(cx, cy, R, ang + spread); return `M${n(cx)} ${n(cy)}L${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}Z`; };
k.add(path(wedge(a, 24), { fill: url(id) }));
k.add(path(wedge(a + 180, 24), { fill: url(id), fillOpacity: 0.7 }));
const face = (x) => clamp(1 - Math.abs(((x % 360) + 360) % 360 - 180) / 40);
flash = Math.max(face(a), face(a + 180) * 0.7);
if (cell) flash = flash > 0.5 ? 1 : flash > 0.1 ? 0.5 : 0;
}
if (flash > 0.01) k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.2 : 0.14) * flash, 3) }));
k.glyph(gid, { labeled: true, t: glyphTime(ctx, g), state: stateWithTone(g, [sev, 'alert', 'crit', 'warn']) });
k.label(ctx.params.label, { color: flash > 0.5 ? color : 'ink' });
return k.svg();
},
};
};
__d[195] = function (__ns) {
const { rect, path, circle, n, P, linearGradient, url } = __m(5);
const { textPath, textOutline, capHeight, measureText, fitText } = __m(11);
const { arcPath, polar } = __m(15);
const { clamp, lerp, outExpo, inQuad } = __m(12);
const { mix } = __m(4);
__e(__ns, { "isBig": () => isBig, "lightOf": () => lightOf, "text": () => text, "widthOf": () => widthOf, "glowText": () => glowText, "perimeter": () => perimeter, "perimeterStroke": () => perimeterStroke, "perimeterPoint": () => perimeterPoint, "progressArc": () => progressArc, "headDot": () => headDot, "burst": () => burst, "chip": () => chip, "holdAge": () => holdAge, "flapColors": () => flapColors, "flap": () => flap, "DOW": () => DOW, "DOW_LONG": () => DOW_LONG, "MONTH": () => MONTH, "MONTH_LONG": () => MONTH_LONG, "mmss": () => mmss, "strHash": () => strHash, "kelvinHex": () => kelvinHex, "clamp": () => clamp, "lerp": () => lerp, "outExpo": () => outExpo, "mix": () => mix, "n": () => n, "P": () => P, "rect": () => rect, "path": () => path, "circle": () => circle, "url": () => url, "linearGradient": () => linearGradient, "capHeight": () => capHeight, "measureText": () => measureText }, [], ["DOW","DOW_LONG","MONTH","MONTH_LONG","P","burst","capHeight","chip","circle","clamp","flap","flapColors","glowText","headDot","holdAge","isBig","kelvinHex","lerp","lightOf","linearGradient","measureText","mix","mmss","n","outExpo","path","perimeter","perimeterPoint","perimeterStroke","progressArc","rect","strHash","text","url","widthOf"]);
const isBig = (k) => Math.min(k.w, k.h) >= 110;
const lightOf = (k) => (k.dark ? '#ffffff' : k.colors.ink);
function text(k, str, { x = k.w / 2, y, cy, size = 12, weight = 600, anchor = 'middle', color = 'ink', opacity, tabular, tracking, caps, maxWidth, minSize, add = true } = {}) {
if (str === undefined || str === null || String(str) === '') return '';
let s = String(str), px = size;
if (maxWidth) { const f = fitText(s, { maxWidth, size, minSize: minSize ?? size * 0.7, weight, tabular, tracking, caps }); s = f.text; px = f.size; }
const yy = y ?? (cy ?? k.h / 2) + capHeight(px, weight) / 2;
const out = textPath(s, { x, y: yy, size: px, weight, anchor, tabular, tracking, caps, fill: k.color(color), fillOpacity: opacity !== undefined && opacity < 1 ? n(Math.max(0, opacity), 3) : undefined });
if (add) k.add(out);
return out;
}
const widthOf = (str, size, o = {}) => measureText(String(str), { size, weight: 600, ...o });
function glowText(k, str, { x, y, size, weight = 700, anchor = 'middle', color, lit = 1, halo = size * 0.16, tube, tracking = 0, core } = {}) {
const o = textOutline(String(str), { size, weight, tracking });
if (!o.d) return 0;
const x0 = anchor === 'middle' ? x - o.width / 2 : anchor === 'end' ? x - o.width : x;
const tf = `translate(${n(x0)} ${n(y)})`;
const L = clamp(lit);
const tw = Math.max(1.2, size * 0.075); 
k.add(path(o.d, { transform: tf, fill: 'none', stroke: tube ?? k.colors.line, strokeWidth: n(tw), strokeLinejoin: 'round' }));
if (L <= 0.01) return o.width;
const glow = k.dark ? 1 : 0.6;
k.add(path(o.d, { transform: tf, fill: color, fillOpacity: n(0.1 * L, 3), stroke: color, strokeWidth: n(halo * 1.6 + tw), strokeLinejoin: 'round', strokeOpacity: n(0.12 * L * glow, 3) }));
k.add(path(o.d, { transform: tf, fill: 'none', stroke: color, strokeWidth: n(halo * 0.7 + tw), strokeLinejoin: 'round', strokeOpacity: n(0.26 * L * glow, 3) }));
k.add(path(o.d, { transform: tf, fill: 'none', stroke: color, strokeWidth: n(tw), strokeLinejoin: 'round', strokeOpacity: L < 1 ? n(L, 3) : undefined }));
if (core) k.add(path(o.d, { transform: tf, fill: 'none', stroke: core, strokeWidth: n(Math.max(0.6, tw * 0.36)), strokeLinejoin: 'round', strokeOpacity: n(L * 0.95, 3) }));
return o.width;
}
function perimeter(x, y, w, h, r) {
const rr = Math.max(0, Math.min(r, w / 2, h / 2));
const cx = x + w / 2;
const d = P().M(cx, y).H(x + w - rr).A(rr, rr, 0, 0, 1, x + w, y + rr).V(y + h - rr).A(rr, rr, 0, 0, 1, x + w - rr, y + h)
.H(x + rr).A(rr, rr, 0, 0, 1, x, y + h - rr).V(y + rr).A(rr, rr, 0, 0, 1, x + rr, y).H(cx).d;
const len = 2 * (w + h) - 8 * rr + 2 * Math.PI * rr;
return { d, len };
}
function perimeterStroke({ d, len }, f, { color, width, opacity, cap = 'round' }) {
const v = clamp(f);
if (v <= 0.002) return '';
const on = len * v;
return path(d, { fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined, strokeLinecap: cap, strokeLinejoin: 'round', strokeDasharray: v >= 0.999 ? undefined : `${n(on)} ${n(len)}` });
}
function perimeterPoint(x, y, w, h, r, f) {
const rr = Math.max(0, Math.min(r, w / 2, h / 2));
const segs = [
['l', w / 2 - rr, (s) => [x + w / 2 + s, y]],
['a', (Math.PI / 2) * rr, (s) => polar(x + w - rr, y + rr, rr, (s / rr) * (180 / Math.PI))],
['l', h - 2 * rr, (s) => [x + w, y + rr + s]],
['a', (Math.PI / 2) * rr, (s) => polar(x + w - rr, y + h - rr, rr, 90 + (s / rr) * (180 / Math.PI))],
['l', w - 2 * rr, (s) => [x + w - rr - s, y + h]],
['a', (Math.PI / 2) * rr, (s) => polar(x + rr, y + h - rr, rr, 180 + (s / rr) * (180 / Math.PI))],
['l', h - 2 * rr, (s) => [x, y + h - rr - s]],
['a', (Math.PI / 2) * rr, (s) => polar(x + rr, y + rr, rr, 270 + (s / rr) * (180 / Math.PI))],
['l', w / 2 - rr, (s) => [x + rr + s, y]],
];
const total = segs.reduce((a, s) => a + s[1], 0);
let left = clamp(f) * total;
for (const [, L, at] of segs) { if (left <= L) return at(left); left -= L; }
return [x + w / 2, y];
}
function progressArc({ cx, cy, r, value, color, width, opacity, cap = 'round' }) {
const v = clamp(value);
if (v <= 0.002) return '';
if (v >= 0.999) return circle({ cx: n(cx), cy: n(cy), r: n(r), fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined });
return path(arcPath(cx, cy, r, 0, 360 * v), { fill: 'none', stroke: color, strokeWidth: n(width), strokeLinecap: cap, strokeOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined });
}
function headDot(k, x, y, r, color) {
return circle({ cx: n(x), cy: n(y), r: n(r * 2.2), fill: color, fillOpacity: k.dark ? 0.22 : 0.16 }) + circle({ cx: n(x), cy: n(y), r: n(r), fill: k.dark ? '#ffffff' : color });
}
function burst(k, { cx, cy, r0, r1, age, dur = 1.1, count = 12, hue = 0, width, spin = 0 }) {
if (!(age >= 0) || age >= dur) return '';
const p = clamp(age / dur), e = outExpo(p);
const fade = 1 - inQuad(p);
const head = lerp(r0, r1, e), tail = lerp(r0, r1, outExpo(clamp(p * 0.72)));
const sw = width ?? Math.max(1.5, k.m.line * 1.4);
let out = '';
for (let i = 0; i < count; i++) {
const a = spin + (i * 360) / count + (i % 2 ? 360 / count / 2 * 0 : 0);
const len = i % 2 ? 0.82 : 1;
const [x0, y0] = polar(cx, cy, tail * len, a), [x1, y1] = polar(cx, cy, head * len, a);
const c = k.theme.spectral(hue + (i * 360) / count);
if (Math.hypot(x1 - x0, y1 - y0) > 0.4) out += path(P().M(x0, y0).L(x1, y1).d, { stroke: c, strokeWidth: n(sw * (1 - 0.5 * p)), strokeLinecap: 'round', strokeOpacity: n(fade, 3) });
out += circle({ cx: n(x1), cy: n(y1), r: n(sw * 0.9 * (1 - p * 0.6)), fill: c, fillOpacity: n(fade, 3) });
}
return out;
}
function chip(k, { x, y, h, label, color, ink, size = h * 0.62, weight = 700, outline = false, anchor = 'start', pad = h * 0.42, tracking = 0.04, caps = true, opacity } = {}) {
const tw = widthOf(label, size, { weight, tracking, caps });
const w = tw + pad * 2;
const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
k.add(rect({ x: n(x0), y: n(y), width: n(w), height: n(h), rx: n(h / 2), fill: outline ? 'none' : color, stroke: outline ? color : undefined, strokeWidth: outline ? n(Math.max(1, h * 0.08)) : undefined, fillOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined }));
text(k, label, { x: x0 + w / 2, cy: y + h / 2, size, weight, tracking, caps, color: ink ?? (outline ? color : '#ffffff') });
return w;
}
function holdAge(ctx) {
if (ctx.pressed) return { held: ctx.pressedFor || 0, pressed: true, released: 0 };
if (!Number.isFinite(ctx.pressAge)) return { held: 0, pressed: false, released: Infinity };
return { held: Math.max(0, ctx.since - ctx.pressAge), pressed: false, released: ctx.pressAge };
}
function flapColors(k) {
const C = k.colors;
const top = k.dark ? mix(C.surface, '#ffffff', 0.07) : mix(C.surface, '#ffffff', 0.55);
const bot = k.dark ? mix(C.surface2, '#ffffff', 0.04) : mix(C.surface2, C.surface, 0.5);
return { top, bot, ink: C.ink, hinge: k.dark ? '#000000' : mix(C.line, C.ink, 0.25), shade: '#000000', edge: C.edge || '#ffffff' };
}
function flap(k, { x, y, w, h, r, prev, cur, p = 1, size, weight = 700, tag = 'f', color, colors, dy = 0 }) {
const F = colors || flapColors(k);
const mid = y + h / 2, gap = Math.max(1, h * 0.012);
const ink = color ?? F.ink;
const ids = { t: k.id(`${tag}-t`), b: k.id(`${tag}-b`), gt: k.id(`${tag}-gt`), gb: k.id(`${tag}-gb`) };
k.def(`<clipPath id="${ids.t}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h / 2 - gap / 2)}"/></clipPath><clipPath id="${ids.b}"><rect x="${n(x)}" y="${n(mid + gap / 2)}" width="${n(w)}" height="${n(h / 2 - gap / 2)}"/></clipPath>`);
k.def(linearGradient(ids.gt, [[0, F.top], [1, mix(F.top, F.bot, 0.5)]], { x1: 0, y1: n(y), x2: 0, y2: n(mid), gradientUnits: 'userSpaceOnUse' }));
k.def(linearGradient(ids.gb, [[0, F.bot], [1, mix(F.bot, '#000000', k.dark ? 0.25 : 0.06)]], { x1: 0, y1: n(mid), x2: 0, y2: n(y + h), gradientUnits: 'userSpaceOnUse' }));
const half = (top) => path(top
? P().M(x, mid - gap / 2).V(y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(mid - gap / 2).Z().d
: P().M(x, mid + gap / 2).H(x + w).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).Z().d,
{ fill: url(top ? ids.gt : ids.gb) });
const glyph = (str, clip) => `<g clip-path="url(#${clip})">${textPath(String(str), { x: x + w / 2, y: mid + capHeight(size, weight) / 2 + dy, size, weight, anchor: 'middle', tabular: true, fill: ink })}</g>`;
const settled = !(p < 1) || prev === undefined || prev === cur;
const fall = settled ? 1 : clamp(p / 0.78);
const theta = 180 * Math.pow(fall, 1.7); 
k.add(half(true) + glyph(cur, ids.t));
k.add(half(false) + glyph(theta < 90 ? prev : cur, ids.b));
if (!settled) {
if (theta < 90) {
const s = Math.max(0.001, Math.cos((theta * Math.PI) / 180));
k.add(`<g transform="translate(0 ${n(mid)}) scale(1 ${n(s, 4)}) translate(0 ${n(-mid)})">${half(true)}${glyph(prev, ids.t)}${path(P().M(x, mid - gap / 2).V(y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(mid - gap / 2).Z().d, { fill: F.shade, fillOpacity: n(0.62 * (theta / 90), 3) })}${rect({ x: n(x), y: n(y), width: n(w), height: n(Math.max(1, h * 0.012)), fill: F.edge, fillOpacity: n(0.5 * (theta / 90), 3) })}</g>`);
k.add(rect({ x: n(x), y: n(mid + gap / 2), width: n(w), height: n((h / 2) * (1 - s) * 0.9), fill: F.shade, fillOpacity: n(0.28 * (1 - s), 3) }));
} else {
const s = Math.max(0.001, -Math.cos((theta * Math.PI) / 180));
k.add(`<g transform="translate(0 ${n(mid)}) scale(1 ${n(s, 4)}) translate(0 ${n(-mid)})">${half(false)}${glyph(cur, ids.b)}${path(P().M(x, mid + gap / 2).H(x + w).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).Z().d, { fill: F.shade, fillOpacity: n(0.5 * (1 - s), 3) })}</g>`);
}
} else if (p < 1.25 && prev !== undefined && prev !== cur) {
const b = clamp((p - 1) / 0.25);
k.add(rect({ x: n(x), y: n(mid - gap / 2), width: n(w), height: n(gap), fill: F.edge, fillOpacity: n(0.5 * (1 - b), 3) }));
}
k.add(rect({ x: n(x), y: n(mid - gap / 2), width: n(w), height: n(gap), fill: F.hinge }));
const pin = Math.max(1.2, h * 0.035);
k.add(path(`M${n(x - pin * 0.3)} ${n(mid - pin)}h${n(pin * 1.2)}v${n(pin * 2)}h${n(-pin * 1.2)}ZM${n(x + w - pin * 0.9)} ${n(mid - pin)}h${n(pin * 1.2)}v${n(pin * 2)}h${n(-pin * 1.2)}Z`, { fill: F.hinge }));
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function mmss(sec) {
const s = Math.max(0, Math.floor(sec));
const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
return hh ? `${hh}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
function strHash(s) {
let h = 2166136261;
for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
return h;
}
function kelvinHex(kelvin) {
const t = clamp(kelvin, 1000, 40000) / 100;
const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
return `#${h(r)}${h(g)}${h(b)}`;
}
};
__d[196] = function (__ns) {
const { surface, rect, path, n, P, linearGradient, url } = __m(113);
const { clamp, pulse, phase, lerp, outExpo } = __m(12);
const { mix } = __m(4);
const { text, isBig, mmss } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LAMPS = [{ key: 'neg', state: 'failed' }, { key: 'warn', state: 'running' }, { key: 'pos', state: 'passed' }];
const WORD = { running: 'Running', passed: 'Passed', failed: 'Failed' };
const SHORT = { running: 'Run', passed: 'Pass', failed: 'Fail' };
const ago = (s) => (s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);
const __default = {
id: 'alert-build',
title: 'Build Light',
category: 'Alerts & Attention',
description: 'A CI stack light: the amber beacon turns while a build runs, green holds when it passes, red breathes then holds when it fails — with the pipeline and build number.',
tags: ['build', 'ci', 'pipeline', 'status', 'deploy', 'tests', 'stack light', 'dev'],
surface: 'key',
fps: 6,
loop: 2.4,
states: ['running', 'passed', 'failed'],
tones: { running: 'busy', passed: 'ok', failed: 'neg' },
press: 'cycle',
params: {
pipeline: { type: 'text', default: 'main', maxLength: 14, label: 'Pipeline' },
build: { type: 'number', default: 1284, min: 0, max: 999999, step: 1, label: 'Build number' },
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const st = ctx.stateName || 'running';
k.background({ tone: ctx.tone });
const big = isBig(k);
const arrive = ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.4));
const s = k.m.safe;
const tw = Math.round(w * (big ? 0.22 : 0.28)), th = h - s * 2 - (big ? 0 : 0);
const tx = s + (big ? u * 1 : 0), ty = s;
const lensH = (th - u * 4) / 3, lensW = tw - u * 3.2;
const body = k.dark ? mix(C.surface2, '#000000', 0.5) : mix(C.surface2, C.line, 0.5);
k.add(rect({ x: n(tx), y: n(ty), width: n(tw), height: n(th), rx: n(Math.min(tw * 0.3, k.m.radius * 0.7)), fill: body, stroke: C.line, strokeWidth: n(Math.max(1, u * 0.8)) }));
const breath = st === 'failed' && !ctx.reduced && ctx.since < 10 ? lerp(0.55, 1, pulse(ctx.t, 1)) : 1;
LAMPS.forEach((L, i) => {
const lx = tx + (tw - lensW) / 2, ly = ty + u * 1.6 + i * (lensH + u * 0.4);
const color = C[L.key];
const on = L.state === st;
const r = Math.min(lensW, lensH) * 0.32;
const gid = k.id(`lens${i}`);
if (on) {
const a = arrive * breath;
k.def(linearGradient(gid, [[0, mix(color, '#ffffff', k.dark ? 0.45 : 0.3)], [0.55, color], [1, mix(color, '#000000', 0.25)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
k.add(rect({ x: n(lx - u * 1.6), y: n(ly - u * 1.2), width: n(lensW + u * 3.2), height: n(lensH + u * 2.4), rx: n(r * 1.4), fill: color, fillOpacity: n(0.16 * a * (k.dark ? 1 : 0.6), 3) }));
k.add(rect({ x: n(lx), y: n(ly), width: n(lensW), height: n(lensH), rx: n(r), fill: url(gid), fillOpacity: a < 1 ? n(0.35 + 0.65 * a, 3) : undefined }));
if (st === 'running' && !ctx.reduced) {
const p = phase(ctx.t, 1.2);
const bxw = lensW * 0.34, bx = lx - bxw + (lensW + bxw) * p;
const x0 = Math.max(lx, bx), x1 = Math.min(lx + lensW, bx + bxw);
if (x1 - x0 > 0.5) k.add(rect({ x: n(x0), y: n(ly + u * 0.6), width: n(x1 - x0), height: n(lensH - u * 1.2), rx: n(Math.min(r, (x1 - x0) / 2)), fill: '#ffffff', fillOpacity: n(0.55 * Math.sin(Math.PI * p), 3) }));
}
k.add(rect({ x: n(lx + lensW * 0.18), y: n(ly + lensH * 0.16), width: n(lensW * 0.64), height: n(Math.max(1, lensH * 0.12)), rx: n(lensH * 0.06), fill: '#ffffff', fillOpacity: k.dark ? 0.55 : 0.6 }));
} else {
k.add(rect({ x: n(lx), y: n(ly), width: n(lensW), height: n(lensH), rx: n(r), fill: mix(body, color, k.dark ? 0.2 : 0.28), stroke: mix(body, color, 0.35), strokeWidth: n(Math.max(1, u * 0.6)) }));
}
});
const x0 = tx + tw + u * (big ? 6 : 4), x1 = w - k.m.text, room = x1 - x0;
const tone = st === 'passed' ? 'pos' : st === 'failed' ? 'neg' : 'warn';
const ink = k.dark ? C[tone] : ctx.theme.spectral(st === 'passed' ? 150 : st === 'failed' ? 25 : 70, { tier: 'ink' });
if (big) {
text(k, ctx.params.pipeline, { x: x0, y: s + 9 * u, size: 8.5 * u, weight: 600, caps: true, tracking: 0.1, anchor: 'start', color: 'muted', maxWidth: room });
text(k, `#${ctx.params.build}`, { x: x0, y: s + 22 * u, size: 12 * u, weight: 600, anchor: 'start', color: 'ink', tabular: true, maxWidth: room });
text(k, WORD[st], { x: x0, y: h - s - 13 * u, size: 12 * u, weight: 700, anchor: 'start', color: ink, maxWidth: room, minSize: 8 * u });
text(k, st === 'running' ? mmss(ctx.since) : ago(ctx.since), { x: x0, y: h - s - 2.5 * u, size: 8.5 * u, weight: 600, anchor: 'start', color: 'muted', tabular: st === 'running', maxWidth: room });
} else {
text(k, `#${ctx.params.build}`, { x: x0, y: s + 8 * u, size: 8.5 * u, weight: 600, anchor: 'start', color: 'muted', tabular: true, maxWidth: room });
text(k, SHORT[st], { x: x0, cy: h / 2 + u, size: 14 * u, weight: 700, anchor: 'start', color: ink, maxWidth: room });
text(k, st === 'running' ? mmss(ctx.since) : ctx.params.pipeline, { x: x0, y: h - s - 1.5 * u, size: 8.5 * u, weight: 600, anchor: 'start', color: 'muted', tabular: st === 'running', maxWidth: room });
}
void P; void path;
return k.svg();
},
};
};
__d[197] = function (__ns) {
const { surface, rect, path, n, P } = __m(113);
const { clamp, outExpo, outBack, lerp } = __m(12);
const { clockOf } = __m(98);
const { mix } = __m(4);
const { text, isBig, headDot } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HOLD = 2.6, OUT = 0.4;
const stamp = (c) => `${c.h}:${String(c.m).padStart(2, '0')}:${String(c.s).padStart(2, '0')}`;
const __default = {
id: 'press-clip',
title: 'Clip & Marker',
category: 'Press Feedback',
description: 'Save the moment: press and the replay buffer fills as it saves, or a marker pin drops on the timeline — the time of the press is stamped, then the key re-arms.',
tags: ['clip', 'marker', 'replay', 'highlight', 'bookmark', 'stream', 'recording', 'creator', 'confirm'],
surface: 'key',
fps: 10,
loop: 4,
press: 'momentary',
params: {
kind: { type: 'select', default: 'clip', options: ['clip', 'marker'], label: 'Saves a' },
seconds: { type: 'number', default: 30, min: 5, max: 120, step: 5, label: 'Clip length (s)' },
label: { type: 'text', default: '', maxLength: 12, label: 'Label (blank = Clip / Marker)' },
hue: { type: 'hue', default: 8, min: 0, max: 360, label: 'Hue' },
},
order: 32,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const clip = ctx.params.kind !== 'marker';
const age = ctx.pressed ? 0 : ctx.pressAge; 
const active = Number.isFinite(age) && age < HOLD + OUT;
const out = active ? 1 - clamp((age - HOLD) / OUT) : 0; 
const done = active && (clip ? age >= 0.6 : age >= 0.35);
k.background({ tone: active ? (done ? 'ok' : 'active') : 'idle' });
const big = isBig(k);
const arr = !Number.isFinite(ctx.pressAge) && !ctx.pressed && !ctx.reduced ? outExpo(clamp(ctx.since / 0.6)) : 1; 
const x0 = k.m.text, x1 = k.m.text + (w - k.m.text * 2) * arr, ty = h - (big ? 24.5 : 22.5) * u;
const lineCol = C.line;
const tk = P();
for (let i = 0; i <= 8; i++) { const x = lerp(x0, x1, i / 8); tk.M(x, ty - (i % 4 === 0 ? 2.5 : 1.4) * u).V(ty); }
k.add(rect({ x: n(x0), y: n(ty), width: n(x1 - x0), height: n(Math.max(1, u * 0.9)), fill: lineCol }));
k.add(path(tk.d, { stroke: lineCol, strokeWidth: n(Math.max(1, u * 0.7)) }));
const tint = ctx.tint, ok = C.pos;
if (clip) {
const bw = (x1 - x0) * 0.42, bx = x1 - bw, bh = Math.max(3, 3.2 * u);
k.add(rect({ x: n(bx), y: n(ty - bh / 2), width: n(bw), height: n(bh), rx: n(bh / 2), fill: tint, fillOpacity: active ? 0.35 : 0.28 }));
if (active) {
const f = clamp(age / 0.6);
const fw = bw * outExpo(f);
const col = mix(tint, ok, done ? 1 : 0);
k.add(rect({ x: n(x1 - fw), y: n(ty - bh / 2), width: n(Math.max(bh, fw)), height: n(bh), rx: n(bh / 2), fill: col, fillOpacity: out < 1 ? n(out, 3) : undefined }));
if (!done) k.add(headDot(k, x1 - fw + bh / 2, ty, bh * 0.55, col));
const br = P().M(bx + u * 1.5, ty - bh * 1.15).H(bx).V(ty + bh * 1.15).H(bx + u * 1.5).M(x1 - u * 1.5, ty - bh * 1.15).H(x1).V(ty + bh * 1.15).H(x1 - u * 1.5);
k.add(path(br.d, { fill: 'none', stroke: col, strokeWidth: n(Math.max(1, u * 0.9)), strokeOpacity: n(out, 3) }));
}
} else if (active) {
const px = x1 - (x1 - x0) * 0.12;
const d = outBack(clamp(age / 0.35), 2.2);
const top = ty - 14 * u, y = lerp(top - 10 * u, ty, d);
const s = 4.2 * u;
const pin = P().M(px, y).L(px, y - s * 2.2).M(px, y - s * 2.2).L(px + s * 1.5, y - s * 1.7).L(px, y - s * 1.2);
k.add(path(pin.d, { fill: done ? ok : tint, fillOpacity: n(out, 3), stroke: done ? ok : tint, strokeWidth: n(Math.max(1.2, u * 1.1)), strokeLinejoin: 'round', strokeLinecap: 'round', strokeOpacity: n(out, 3) }));
k.add(rect({ x: n(px - u * 2), y: n(ty - u * 0.5), width: n(u * 4), height: n(u * 1.9), rx: n(u), fill: done ? ok : tint, fillOpacity: n(out, 3) }));
}
const gTop = big ? k.m.safe + 10 * u : k.m.safe * 0.6;
const gs = Math.min(w * 0.5, ty - 2.5 * u - gTop);
const gy = gTop + (ty - 2.5 * u - gTop - gs) / 2;
const g = clip ? 'record' : 'marker';
const gstate = clip ? (active && !done ? 'recording' : 'ready') : (active ? 'marked' : 'ready');
k.glyph(g, { box: { x: w / 2 - gs / 2, y: gy, size: gs }, state: gstate, since: active ? age : 9, tone: active ? (done ? 'ok' : clip ? 'alert' : 'active') : 'idle' });
if (active && age < 0.18) k.add(rect({ width: w, height: h, fill: k.dark ? '#ffffff' : C.ink, fillOpacity: n(0.28 * (1 - age / 0.18), 3) }));
const name = ctx.params.label || (clip ? 'Clip' : 'Marker');
const when = active ? clockOf(ctx.now - age * 1000, ctx.clock?.tzOffset ?? 0) : null;
const word = !active ? name : done ? (clip ? `Clip ✓` : 'Marked ✓') : (clip ? 'Saving' : 'Mark');
k.label(word, { color: active && done ? 'pos' : 'ink', opacity: active ? Math.max(0.35, out) : undefined });
if (big) {
if (active && done) k.eyebrow(stamp(when), { color: 'muted', opacity: out, maxWidth: w - k.m.text * 2 });
else if (!active) k.eyebrow(clip ? `last ${ctx.params.seconds} s` : 'timeline', { color: 'dim' });
}
return k.svg();
},
};
};
__d[198] = function (__ns) {
const { surface, path, circle, n, P } = __m(113);
const { clamp, outExpo, lerp } = __m(12);
const { clockOf } = __m(98);
const { mix } = __m(4);
const { isBig, progressArc, widthOf, capHeight } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
function crescentPath(cx, cy, R, ox, oy, r, steps = 36) {
const d = Math.hypot(ox, oy);
const full = () => P().M(cx + R, cy).A(R, R, 0, 0, 1, cx - R, cy).A(R, R, 0, 0, 1, cx + R, cy).Z().d;
if (d >= R + r - 0.01) return full();
if (d + R <= r) return '';
const a = (R * R - r * r + d * d) / (2 * d);
const hh = Math.sqrt(Math.max(0, R * R - a * a));
const ux = ox / d, uy = oy / d;
const bx = cx + a * ux, by = cy + a * uy;
const p1 = [bx - hh * uy, by + hh * ux], p2 = [bx + hh * uy, by - hh * ux];
const ang = (p, c) => Math.atan2(p[1] - c[1], p[0] - c[0]);
const p = P();
let a1 = ang(p1, [cx, cy]), a2 = ang(p2, [cx, cy]);
const toward = Math.atan2(uy, ux);
const norm = (x) => { while (x < 0) x += Math.PI * 2; while (x >= Math.PI * 2) x -= Math.PI * 2; return x; };
let span = norm(a2 - a1);
if (norm(toward - a1) < span) span -= Math.PI * 2;
for (let i = 0; i <= steps; i++) { const t = a1 + (span * i) / steps; const x = cx + R * Math.cos(t), y = cy + R * Math.sin(t); i ? p.L(x, y) : p.M(x, y); }
const sc = [cx + ox, cy + oy];
a1 = ang(p2, sc); a2 = ang(p1, sc);
const away = Math.atan2(-uy, -ux);
span = norm(a2 - a1);
if (norm(away - a1) >= span) span -= Math.PI * 2;
for (let i = 1; i <= steps; i++) { const t = a1 + (span * i) / steps; p.L(sc[0] + r * Math.cos(t), sc[1] + r * Math.sin(t)); }
return p.Z().d;
}
const star = (x, y, s) => P().M(x, y - s).Q(x, y, x + s, y).Q(x, y, x, y + s).Q(x, y, x - s, y).Q(x, y, x, y - s).Z().d;
const __default = {
id: 'state-do-not-disturb',
title: 'Do Not Disturb',
category: 'State Transitions',
description: 'Focus mode: press and a shadow carves the moon into a crescent, stars light, and the key shows how long you are heads-down. Amber when the time is up.',
tags: ['focus', 'do not disturb', 'dnd', 'quiet', 'status', 'presence', 'productivity', 'moon'],
surface: 'key',
fps: 8,
loop: 4,
states: ['available', 'focus'],
tones: { available: 'idle', focus: 'active' },
press: 'toggle',
params: {
minutes: { type: 'number', default: 60, min: 0, max: 480, step: 5, label: 'Focus for (minutes, 0 = until I press)' },
labelOn: { type: 'text', default: 'Focus', maxLength: 14, label: 'Label in focus' },
labelOff: { type: 'text', default: 'Available', maxLength: 14, label: 'Label when available' },
hour12: { type: 'bool', default: false, label: '12-hour clock' },
hue: { type: 'hue', default: 282, min: 0, max: 360, label: 'Hue' },
},
order: 22,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const focus = ctx.stateName === 'focus';
const total = ctx.params.minutes * 60;
const left = total > 0 ? total - ctx.since : Infinity;
const over = focus && left <= 0;
const tone = focus ? (over ? 'warn' : 'active') : 'idle';
k.background({ tone });
const big = isBig(k);
const box = k.theme.glyphBox(k, { labeled: true });
const cx = box.x + box.size / 2, cy = box.y + box.size / 2 + (big ? u * 2 : 0);
const R = box.size * 0.36;
const fresh = !Number.isFinite(ctx.pressAge) && !ctx.pressed;
const e = ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.6));
const f = focus ? e : fresh ? 0 : 1 - e; 
const ox = lerp(R * 2.3, R * 0.52, f), oy = lerp(-R * 1.7, -R * 0.42, f);
const lit = focus ? (over ? C.warn : ctx.tint) : C.muted;
const moonFill = focus ? (k.dark ? mix(lit, '#ffffff', 0.25) : ctx.theme.spectral(ctx.hue, { tier: 'ink' })) : 'none';
if (f > 0.02) {
const d = crescentPath(cx, cy, R, ox, oy, R * 0.86);
if (focus && k.dark) k.add(circle({ cx: n(cx), cy: n(cy), r: n(R * 1.45), fill: lit, fillOpacity: n(0.08 * f, 3) }));
k.add(path(d, { fill: focus ? moonFill : C.muted, fillOpacity: focus ? n(clamp(0.25 + 0.75 * f), 3) : n(0.35 * f, 3), stroke: focus ? lit : C.muted, strokeWidth: n(k.m.line), strokeLinejoin: 'round', strokeOpacity: n(0.4 + 0.6 * f, 3) }));
}
if (f < 0.98) {
const o = 1 - f;
if (fresh && !focus && e < 0.999) k.add(progressArc({ cx, cy, r: R, value: e, color: C.muted, width: k.m.line * 1.2 }));
else k.add(circle({ cx: n(cx), cy: n(cy), r: n(R), fill: 'none', stroke: C.muted, strokeWidth: n(k.m.line * 1.2), strokeOpacity: n(o, 3) }));
const [px, py] = [cx + R * 0.72, cy + R * 0.72];
k.add(circle({ cx: n(px), cy: n(py), r: n(R * 0.3), fill: C.surface2, fillOpacity: n(o, 3) }) + circle({ cx: n(px), cy: n(py), r: n(R * 0.2), fill: C.pos, fillOpacity: n(o, 3) }));
}
if (focus) {
const s1 = clamp((ctx.since - 0.3) / 0.3), s2 = clamp((ctx.since - 0.45) / 0.3);
const st = (x, y, s, a) => (a > 0.02 ? path(star(x, y, s), { fill: k.dark ? '#ffffff' : lit, fillOpacity: n(a, 3) }) : '');
k.add(st(cx + R * 0.95, cy - R * 0.62, R * 0.2, ctx.reduced ? 1 : s1) + st(cx + R * 0.48, cy - R * 0.02, R * 0.12, ctx.reduced ? 1 : s2));
}
const label = focus ? (over ? "Time's up" : ctx.params.labelOn) : ctx.params.labelOff;
k.label(label, { color: focus ? (over ? 'warn' : 'ink') : 'muted' });
if (focus && Number.isFinite(left) && !over && f > 0.5) {
const frac = clamp(Math.ceil(left / 60) / Math.max(1, Math.ceil(total / 60)));
const ebs = k.typeStyle('eyebrow');
const top = big ? k.m.text + capHeight(ebs.size, ebs.weight) + 2.5 * u : k.m.safe * 0.6;
const rr = Math.max(R * 1.12, Math.min(R * 1.32, cy - top)); 
k.add(circle({ cx: n(cx), cy: n(cy), r: n(rr), fill: 'none', stroke: C.line, strokeWidth: n(Math.max(1, u * 0.8)) }));
k.add(progressArc({ cx, cy, r: rr, value: frac, color: lit, width: Math.max(1.25, u * 1.2) }));
}
if (big) {
if (focus && Number.isFinite(left)) {
if (!over) {
const until = clockOf(ctx.now + left * 1000, ctx.clock?.tzOffset ?? 0);
const hh = ctx.params.hour12 ? ((until.h + 11) % 12) + 1 : until.h;
const mins = `${Math.ceil(left / 60)}m`, at = `→ ${hh}:${String(until.m).padStart(2, '0')}`, es = k.typeStyle('eyebrow');
const wo = (str) => widthOf(str, es.size, { weight: es.weight, tracking: es.tracking, caps: es.caps });
if (wo(mins) + wo(at) + 5 * u <= w - k.m.text * 2) {
k.eyebrow(mins, { align: 'right', x: w - k.m.text, color: 'ink' });
k.eyebrow(at, { color: 'muted' });
} else k.eyebrow(`${mins} left`, { color: 'muted', maxWidth: w - k.m.text * 2 });
} else k.eyebrow(`+${Math.floor(-left / 60)}m over`, { color: 'warn' });
} else if (focus) k.eyebrow('DND', { color: 'muted' });
else k.eyebrow('Status', { color: 'dim' });
}
return k.svg();
},
};
};
__d[199] = function (__ns) {
const { surface, rect, n } = __m(113);
const { clamp, lerp, outExpo, inQuad, smoothstep } = __m(12);
const { mix } = __m(4);
const { text, isBig, holdAge, progressArc, headDot, burst, perimeterPoint, capHeight } = __m(195);
const { polar } = __m(15);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LAUNCH = 0.55; 
const SHIPPED = 4; 
const ago = (s) => (s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);
const __default = {
id: 'press-hold-confirm',
title: 'Hold to Deploy',
category: 'Press Feedback',
description: 'Hold to confirm: a ring fills while the rocket strains, letting go early cancels, holding through launches it — then the key deploys and lands on Shipped.',
tags: ['hold', 'confirm', 'deploy', 'release', 'ship', 'safety', 'long press', 'rocket', 'dev'],
surface: 'key',
fps: 10,
loop: 4,
states: ['ready', 'rearmed'],
press: 'toggle',
params: {
label: { type: 'text', default: 'Deploy', maxLength: 12, label: 'Action' },
target: { type: 'text', default: 'prod', maxLength: 12, label: 'Target' },
hold: { type: 'number', default: 1.5, min: 0.5, max: 5, step: 0.1, label: 'Hold for (s)' },
duration: { type: 'number', default: 6, min: 1, max: 120, step: 1, label: 'Deploy takes (s, shown as progress)' },
hue: { type: 'hue', default: 296, min: 0, max: 360, label: 'Hue' },
},
order: 30,
render(ctx) {
const k0 = surface(ctx);
const { w, h } = ctx;
const C = k0.colors, u = k0.m.u;
const H = holdAge(ctx);
const need = ctx.params.hold, dur = ctx.params.duration;
const fired = H.held >= need;
const after = fired ? ctx.since - need : -1; 
let phase = 'ready';
if (H.pressed && !fired) phase = 'holding';
else if (!H.pressed && !fired && H.released < 1.4) phase = 'cancel';
else if (fired && after < LAUNCH) phase = 'launch';
else if (fired && after < LAUNCH + dur) phase = 'deploying';
else if (fired && after < LAUNCH + dur + SHIPPED) phase = 'shipped';
const tone = phase === 'deploying' ? 'busy' : phase === 'shipped' ? 'ok' : phase === 'holding' || phase === 'launch' ? 'active' : phase === 'cancel' ? 'warn' : 'idle';
const k = phase === 'ready' || phase === 'cancel' ? k0 : surface({ ...ctx, pressed: false, pressAge: Infinity });
k.background({ tone });
const big = isBig(k);
const box = k.theme.glyphBox(k, { labeled: true });
const lab = k.typeStyle('label'), eb = k.typeStyle('eyebrow');
const top = big ? k.m.text + capHeight(eb.size, eb.weight) + 3.5 * u : k.m.safe * 0.9;
const bottom = h - (k.theme.type.label?.baseline ?? 6.5) * u - capHeight(lab.size, lab.weight) - 3 * u;
const R = Math.max(8 * u, Math.min((bottom - top) / 2, w / 2 - k.m.safe));
const cx = w / 2, cy = (top + bottom) / 2;
const sw = Math.max(1.5, k.m.bold * 0.9);
const ink = k.dark ? '#ffffff' : C.ink;
const f = phase === 'holding' ? clamp(H.held / need)
: phase === 'cancel' ? clamp(H.held / need) * (1 - outExpo(clamp(H.released / 0.45)))
: phase === 'launch' ? 1 : 0;
const fresh = phase === 'ready' && !Number.isFinite(ctx.pressAge) && !ctx.pressed;
const arr = fresh && !ctx.reduced ? outExpo(clamp(ctx.since / 0.6)) : 1;
if (phase !== 'deploying' && phase !== 'shipped') {
k.add(progressArc({ cx, cy, r: R, value: arr, color: C.line, width: sw * 0.6 }));
if (f > 0.003) {
const col = phase === 'cancel' ? C.warn : mix(ctx.tint, C.warn, smoothstep(0.55, 1, f) * 0.6);
k.add(progressArc({ cx, cy, r: R, value: f, color: col, width: sw }));
if (phase === 'holding') { const [hx, hy] = polar(cx, cy, R, 360 * f); k.add(headDot(k, hx, hy, sw * 0.6, col)); }
}
}
if (phase === 'ready' || phase === 'holding' || phase === 'cancel' || phase === 'launch') {
const strain = phase === 'holding' ? f : phase === 'launch' ? 1 : 0;
const jitter = phase === 'holding' && !ctx.reduced ? (ctx.noise.n1(ctx.t * 23) - 0.5) * box.size * 0.04 * strain : 0;
const lift = phase === 'launch' ? inQuad(clamp(after / LAUNCH)) * (cy + R * 2) : -(1 - arr) * R * 0.35;
const gs = R * 1.55;
k.glyph('rocket', { box: { x: cx - gs / 2 + jitter, y: cy - gs / 2 - lift, size: gs }, state: strain > 0.05 ? 'launched' : 'ready', since: phase === 'holding' ? H.held * 0.6 : phase === 'launch' ? 1 : 9, opacity: arr < 1 ? 0.3 + 0.7 * arr : undefined, tone: phase === 'cancel' ? 'warn' : strain > 0.05 ? 'active' : 'idle' });
if (phase === 'launch') k.add(rect({ width: w, height: h, fill: ink, fillOpacity: n(0.22 * (1 - clamp(after / 0.3)), 3) }));
}
const P = ctx.params;
if (phase === 'ready') {
k.label(P.label, { color: 'ink' });
if (big) k.eyebrow(fired ? `Shipped ${ago(after - LAUNCH - dur)}` : `→ ${P.target}`, { color: fired ? 'pos' : 'muted', maxWidth: w - k.m.text * 2 });
} else if (phase === 'holding') {
k.label(f > 0.7 ? 'Almost…' : 'Hold…', { color: 'ink' });
if (big) k.eyebrow(`→ ${P.target}`, { color: 'muted' });
} else if (phase === 'cancel') {
k.label('Cancelled', { color: 'warn' });
if (big) k.eyebrow('too short', { color: 'muted' });
} else if (phase === 'launch') {
k.label(P.label, { color: 'ink' });
} else if (phase === 'deploying') {
const p = clamp((after - LAUNCH) / dur);
const shown = 1 - (1 - p) ** 1.6;
const by = cy + R * 0.58, bw = w - k.m.text * 2, bh = Math.max(3, u * 3);
text(k, `${Math.floor(shown * 100)}%`, { cy: cy - R * 0.12, size: (big ? 22 : 20) * u, weight: 700, tabular: true, color: 'ink' });
k.add(rect({ x: n(k.m.text), y: n(by), width: n(bw), height: n(bh), rx: n(bh / 2), fill: C.line }));
k.add(rect({ x: n(k.m.text), y: n(by), width: n(Math.max(bh, bw * shown)), height: n(bh), rx: n(bh / 2), fill: ctx.tint }));
k.add(headDot(k, k.m.text + Math.max(bh, bw * shown) - bh / 2, by + bh / 2, bh * 0.55, ctx.tint));
k.label(big ? `Deploying` : 'Deploy…', { color: 'muted' });
if (big) k.eyebrow(`→ ${P.target}`, { color: 'muted' });
} else if (phase === 'shipped') {
const a = after - LAUNCH - dur;
k.add(burst(k, { cx, cy, r0: R * 0.35, r1: R * 1.25, age: a, dur: 1, count: 12, hue: ctx.hue }));
k.glyph('check', { box: { x: cx - R * 0.9, y: cy - R * 0.9, size: R * 1.8 }, state: 'done', since: a, tone: 'ok' });
k.label('Shipped', { color: 'pos' });
if (big) k.eyebrow(`${P.target} ✓`, { color: 'pos' });
}
void lerp; void perimeterPoint;
return k.svg();
},
};
};
__d[200] = function (__ns) {
const { surface, phase, arrive, clamp, n } = __m(113);
const { glyphId, litState, restState, layer, addFaded, breath, stepped, cellOf, themeBox, glyphTime } = __m(190);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'idle-breathe',
title: 'Breathe',
category: 'Idle Loops',
description: 'A standby key that breathes like a sleep light: its glow and glyph swell and settle on a slow, uneven breath. Press to wake it.',
tags: ['idle', 'breathe', 'standby', 'sleep', 'glow', 'calm', 'ambient'],
surface: 'key',
fps: 8,
loop: 8,
states: ['standby', 'awake'],
tones: { standby: 'idle', awake: 'active' },
press: 'toggle',
params: {
glyph: { type: 'glyph', default: 'power', label: 'Glyph' },
label: { type: 'text', default: 'Standby', label: 'Label', maxLength: 14 },
wakeLabel: { type: 'text', default: 'Awake', label: 'Label when awake', maxLength: 14 },
period: { type: 'select', default: 4, options: [2, 4, 8], label: 'Breath (s)' },
},
order: 20,
render(ctx) {
const k = surface(ctx);
const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'power'));
const awake = ctx.stateName === 'awake';
const cell = cellOf(k, themeBox(k));
const b = ctx.reduced ? 0.55 : stepped(breath(phase(ctx.t, Number(ctx.params.period) || 4)), cell, 5);
const w = awake ? arrive(ctx.since, 0.42) : 1 - arrive(ctx.since, 0.6);
const lit = clamp(Math.max(w, 0.08 + b * 0.8));
k.background({ tone: 'idle' });
addFaded(k, layer(k, 'active'), lit);
if (lit < 0.97) k.glyph(g.id, { labeled: true, state: restState(g), t: glyphTime(ctx, g), opacity: n(0.55 * (1 - lit) + 0.2, 3), since: 9 });
if (lit > 0.03) k.glyph(g.id, { labeled: true, state: litState(g), t: glyphTime(ctx, g), opacity: n(lit, 3), since: awake ? ctx.since : 9 });
k.label(awake ? ctx.params.wakeLabel : ctx.params.label, { color: lit > 0.45 ? 'ink' : 'muted' });
return k.svg();
},
};
};
__d[201] = function (__ns) {
const { keyInto, compose, n } = __m(113);
const { clamp } = __m(12);
__e(__ns, { "BUDGET": () => BUDGET, "frameClock": () => frameClock, "materials": () => materials, "inCell": () => inCell, "inPanel": () => inPanel, "cellAt": () => cellAt, "runsInRect": () => runsInRect, "runsPath": () => runsPath, "circlePoints": () => circlePoints, "vClip": () => vClip, "middleRow": () => middleRow, "rowCells": () => rowCells, "spectrumHue": () => spectrumHue, "half": () => half }, [], ["BUDGET","cellAt","circlePoints","frameClock","half","inCell","inPanel","materials","middleRow","rowCells","runsInRect","runsPath","spectrumHue","vClip"]);
const BUDGET = { type: 'number', default: 30, min: 10, max: 240, step: 5, label: 'Device budget (key images/s)' };
function frameClock(ctx, { fps = 10, changing = ctx.grid.cells.length, still = 2 } = {}) {
const budget = typeof ctx.params.budget === 'number' ? ctx.params.budget : 30;
const rate = Math.max(0.5, Math.min(fps, budget / Math.max(1, changing)));
if (ctx.reduced) return { t: still, rate, dt: 1 / rate, frame: Math.round(still * rate) };
const frame = Math.floor(ctx.t * rate + 1e-6);
return { t: frame / rate, rate, dt: 1 / rate, frame };
}
function materials(k, { tone = 'idle', toneOf } = {}) {
const frozen = { ctx: { ...k.ctx, t: 0, since: 60, pressed: false, pressAge: Infinity, reduced: true }, def: (...m) => k.def(...m), add: (...m) => k.add(...m), id: (nm) => k.id(nm) };
for (const c of k.ctx.grid.cells) keyInto(frozen, c, (kk) => kk.background({ tone: toneOf ? toneOf(c) : tone }), { tag: `m${c.i}`, clip: false });
}
const inCell = (k, cell, draw, tag = `c${cell.i}`) => keyInto(k, cell, draw, { tag, clip: false });
const inPanel = (k, rect, draw, tag) => compose(k, rect, draw, { kind: 'span', tag, clip: false });
function cellAt(grid, x, y) {
for (const c of grid.cells) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c;
return null;
}
function runsInRect(pts, r, m = 0) {
const inside = ([x, y]) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;
const runs = [];
let cur = null;
for (let i = 0; i < pts.length; i++) {
if (inside(pts[i])) {
if (!cur) { cur = []; if (i > 0) cur.push(pts[i - 1]); runs.push(cur); }
cur.push(pts[i]);
} else if (cur) { cur.push(pts[i]); cur = null; }
}
return runs;
}
const runsPath = (runs) => runs.map((r) => r.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('')).join('');
function circlePoints(cx, cy, r, step = 6) {
const N = Math.max(24, Math.min(360, Math.ceil((2 * Math.PI * r) / step)));
const pts = [];
for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
return pts;
}
function vClip(cell, x, y0, y1) {
if (x < cell.x || x > cell.x + cell.w) return null;
const a = Math.max(cell.y, Math.min(y0, y1)), b = Math.min(cell.y + cell.h, Math.max(y0, y1));
return b > a ? [a, b] : null;
}
const middleRow = (grid) => grid.row + Math.floor((grid.rows - 1) / 2);
const rowCells = (grid, row) => grid.cells.filter((c) => c.row === row).sort((a, b) => a.col - b.col);
const spectrumHue = (f) => 24 + 276 * clamp(f);
const half = (v) => Math.round(v * 2) / 2;
};
__d[202] = function (__ns) {
const { n, linearGradient, radialGradient, url } = __m(113);
const { mix } = __m(4);
const __r0 = __m(201);
__e(__ns, { "f1": () => f1, "qo": () => qo, "dotD": () => dotD, "ellipseD": () => ellipseD, "rectD": () => rectD, "polyD": () => polyD, "lineD": () => lineD, "starD": () => starD, "flakeD": () => flakeD, "clipPoly": () => clipPoly, "fillP": () => fillP, "strokeP": () => strokeP, "Batch": () => Batch, "backdrop": () => backdrop, "lit": () => lit, "toBg": () => toBg, "isFlat": () => isFlat, "isoPaths": () => isoPaths, "BUDGET": () => __r0.BUDGET, "frameClock": () => __r0.frameClock, "materials": () => __r0.materials, "cellAt": () => __r0.cellAt, "half": () => __r0.half, "spectrumHue": () => __r0.spectrumHue, "inCell": () => __r0.inCell }, [], ["BUDGET","Batch","backdrop","cellAt","clipPoly","dotD","ellipseD","f1","fillP","flakeD","frameClock","half","inCell","isFlat","isoPaths","lineD","lit","materials","polyD","qo","rectD","spectrumHue","starD","strokeP","toBg"]);
const f1 = (v) => n(v, 1);
const qo = (o, steps = 20) => Math.max(0, Math.min(1, Math.round(o * steps) / steps));
const dotD = (x, y, r) => { const R = Math.max(0.3, r); if (R < 1.05) { const d = R * 1.8; return `M${f1(x - d / 2)} ${f1(y - d / 2)}h${f1(d)}v${f1(d)}h${f1(-d)}Z`; } return `M${f1(x - R)} ${f1(y)}a${f1(R)} ${f1(R)} 0 1 0 ${f1(2 * R)} 0a${f1(R)} ${f1(R)} 0 1 0 ${f1(-2 * R)} 0Z`; };
const ellipseD = (x, y, rx, ry) => `M${f1(x - rx)} ${f1(y)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2 * rx)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2 * rx)} 0Z`;
const rectD = (x, y, w, h) => `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}Z`;
const polyD = (pts, close = true) => pts.map(([x, y], i) => `${i ? (i === 1 ? 'L' : ' ') : 'M'}${f1(x)} ${f1(y)}`).join('') + (close ? 'Z' : '');
const lineD = (x0, y0, x1, y1) => `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
const starD = (x, y, r, w = 0.22) => polyD([[x, y - r], [x + r * w, y - r * w], [x + r, y], [x + r * w, y + r * w], [x, y + r], [x - r * w, y + r * w], [x - r, y], [x - r * w, y - r * w]]);
function flakeD(x, y, r, rot = 0) {
let d = '';
for (let i = 0; i < 3; i++) {
const a = rot + (i * Math.PI) / 3, c = Math.cos(a) * r, s = Math.sin(a) * r;
d += lineD(x - c, y - s, x + c, y + s);
}
return d;
}
function clipPoly(pts, c) {
const edges = [[(p) => p[0] >= c.x, (a, b) => ix(a, b, 0, c.x)], [(p) => p[0] <= c.x + c.w, (a, b) => ix(a, b, 0, c.x + c.w)], [(p) => p[1] >= c.y, (a, b) => ix(a, b, 1, c.y)], [(p) => p[1] <= c.y + c.h, (a, b) => ix(a, b, 1, c.y + c.h)]];
let out = pts;
for (const [inside, cut] of edges) {
const src = out; out = [];
for (let i = 0; i < src.length; i++) {
const a = src[i], b = src[(i + 1) % src.length];
if (inside(a)) { out.push(a); if (!inside(b)) out.push(cut(a, b)); } else if (inside(b)) out.push(cut(a, b));
}
if (!out.length) return out;
}
return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}
function ix(a, b, axis, v) { const f = (v - a[axis]) / (b[axis] - a[axis]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
const fillP = (color, o = 1, rule) => `fill="${color}"${o < 1 ? ` fill-opacity="${n(qo(o), 2)}"` : ''}${rule ? ` fill-rule="${rule}"` : ''}`;
const strokeP = (color, w, o = 1, cap = 'round') => `fill="none" stroke="${color}" stroke-width="${f1(Math.max(0.5, w))}"${o < 1 ? ` stroke-opacity="${n(qo(o), 2)}"` : ''} stroke-linecap="${cap}" stroke-linejoin="round"`;
class Batch {
constructor(grid, pad = 0) { this.cells = grid.cells; this.pad = pad; this.m = new Map(); }
touched(x0, y0, x1, y1) {
const p = this.pad, out = [];
for (const c of this.cells) if (x1 >= c.x - p && x0 <= c.x + c.w + p && y1 >= c.y - p && y0 <= c.y + c.h + p) out.push(c.i);
return out;
}
add(box, paint, d, layer = 0) {
if (!d) return false;
const cells = this.touched(box[0], box[1], box[2], box[3]);
if (!cells.length) return false;
const key = `${layer}|${cells.join('.')}|${paint}`;
const e = this.m.get(key);
if (e) e.d += d; else this.m.set(key, { layer, paint, d });
return true;
}
raw(box, markup, layer = 0) {
if (!markup || !this.touched(box[0], box[1], box[2], box[3]).length) return false;
this.m.set(`raw${this.m.size}`, { layer, markup });
return true;
}
dot(x, y, r, paint, layer = 0) { return this.add([x - r, y - r, x + r, y + r], paint, dotD(x, y, r), layer); }
seg(x0, y0, x1, y1, w, paint, layer = 0) { return this.add([Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w], paint, lineD(x0, y0, x1, y1), layer); }
poly(pts, paint, layer = 0, close = true) {
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
return this.add([x0, y0, x1, y1], paint, polyD(pts, close), layer);
}
emit(k) {
const all = [...this.m.values()].map((e, i) => ({ ...e, i })).sort((a, b) => a.layer - b.layer || a.i - b.i);
let out = '';
for (const e of all) out += e.markup || `<path d="${e.d}" ${e.paint}/>`;
if (out) k.add(out);
this.m.clear();
}
}
function backdrop(k, stops, { id = 'bd', x1 = 0, y1 = 0, x2 = 0, y2 = k.h, radial, cells = k.ctx.grid.cells } = {}) {
const gid = k.id(id);
if (radial) k.def(radialGradient(gid, stops, { cx: f1(radial.cx), cy: f1(radial.cy), r: f1(radial.r), fx: f1(radial.cx), fy: f1(radial.cy), gradientUnits: 'userSpaceOnUse' }));
else k.def(linearGradient(gid, stops, { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), gradientUnits: 'userSpaceOnUse' }));
let s = '';
for (const c of cells) s += `<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(c.h)}" fill="${url(gid)}"/>`;
k.add(s);
return gid;
}
const lit = (T) => (T.dark ? (T.colors.beam || '#ffffff') : T.colors.ink);
const toBg = (T, c, f) => mix(c, T.colors.bg, f);
const isFlat = (T) => T.spectral(30) === T.spectral(220);
function isoPaths(f, r, step, levels) {
const nx = Math.max(2, Math.ceil(r.w / step)) + 2, ny = Math.max(2, Math.ceil(r.h / step)) + 2;
const sx = r.w / (nx - 2), sy = r.h / (ny - 2);
const X = (i) => r.x + (i - 1) * sx, Y = (j) => r.y + (j - 1) * sy;
const W = nx + 1;
const v = new Float64Array(W * (ny + 1));
for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * W + i] = i === 0 || j === 0 || i === nx || j === ny ? -1e9 : f(X(i), Y(j));
return levels.map((L) => contour(v, W, nx, ny, X, Y, L));
}
function contour(v, W, nx, ny, X, Y, L) {
const pt = new Map();
const point = (e) => {
let p = pt.get(e);
if (p) return p;
const idx = e >> 1, i = idx % W, j = (idx - i) / W;
const a = v[idx], b = e & 1 ? v[idx + W] : v[idx + 1];
const t = Math.max(0, Math.min(1, (L - a) / (b - a || 1e-9)));
p = e & 1 ? [X(i), Y(j) + (Y(j + 1) - Y(j)) * t] : [X(i) + (X(i + 1) - X(i)) * t, Y(j)];
pt.set(e, p);
return p;
};
const adj = new Map();
const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
const tl = v[j * W + i] >= L, tr = v[j * W + i + 1] >= L, br = v[(j + 1) * W + i + 1] >= L, bl = v[(j + 1) * W + i] >= L;
const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
if (c === 0 || c === 15) continue;
const T = 2 * (j * W + i), B = 2 * ((j + 1) * W + i), Lf = 2 * (j * W + i) + 1, R = 2 * (j * W + i + 1) + 1;
switch (c) {
case 1: case 14: link(Lf, B); break;
case 2: case 13: link(B, R); break;
case 3: case 12: link(Lf, R); break;
case 4: case 11: link(T, R); break;
case 6: case 9: link(T, B); break;
case 7: case 8: link(Lf, T); break;
case 5: case 10: {
const mid = (v[j * W + i] + v[j * W + i + 1] + v[(j + 1) * W + i + 1] + v[(j + 1) * W + i]) / 4 >= L;
if ((c === 5) === mid) { link(Lf, T); link(B, R); } else { link(Lf, B); link(T, R); }
break;
}
}
}
let d = '';
const seen = new Set();
for (const start of adj.keys()) {
if (seen.has(start)) continue;
const loop = [];
let prev = -1, cur = start;
while (cur !== undefined && !seen.has(cur)) {
seen.add(cur);
loop.push(point(cur));
const nb = adj.get(cur);
const next = nb[0] !== prev ? nb[0] : nb[1];
prev = cur;
cur = next;
}
if (loop.length > 2) d += simplify(loop);
}
return d;
}
function simplify(pts, tol = 0.35) {
const out = [pts[0]];
for (let i = 1; i < pts.length - 1; i++) {
const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
if (cross / len > tol) out.push(b);
}
out.push(pts[pts.length - 1]);
return polyD(out);
}
};
__d[203] = function (__ns) {
const { radialGradient, url, n } = __m(113);
const { cellOf, themeBox, squaresPath, glyphId, litState, restState, glyphTime } = __m(190);
const { dotD, ellipseD, polyD, rectD, lineD, f1, fillP, strokeP, qo, isoPaths } = __m(202);
__e(__ns, { "cellOf": () => cellOf, "themeBox": () => themeBox, "squaresPath": () => squaresPath, "glyphId": () => glyphId, "litState": () => litState, "restState": () => restState, "glyphTime": () => glyphTime, "dotD": () => dotD, "ellipseD": () => ellipseD, "polyD": () => polyD, "rectD": () => rectD, "lineD": () => lineD, "f1": () => f1, "fillP": () => fillP, "strokeP": () => strokeP, "qo": () => qo, "isoPaths": () => isoPaths, "dots": () => dots, "glow": () => glow }, [], ["cellOf","dotD","dots","ellipseD","f1","fillP","glow","glyphId","glyphTime","isoPaths","lineD","litState","polyD","qo","rectD","restState","squaresPath","strokeP","themeBox"]);
function dots(k, pts, paint, cell = 0) {
if (!pts.length) return;
let d = '';
if (cell) {
const seen = new Set();
for (const [x, y] of pts) {
const gx = Math.round(x / cell - 0.5) * cell, gy = Math.round(y / cell - 0.5) * cell, key = `${gx},${gy}`;
if (seen.has(key)) continue;
seen.add(key);
d += squaresPath([[gx, gy]], cell);
}
} else for (const [x, y, r] of pts) d += dotD(x, y, r);
if (d) k.add(`<path d="${d}" ${paint}/>`);
}
function glow(k, x, y, r, color, o = 1, name = 'glow', stops = [[0, 0.55], [0.35, 0.22], [1, 0]]) {
if (o <= 0.01) return;
const id = k.id(name);
k.def(radialGradient(id, stops.map(([s, a]) => [s, color, n(a * Math.min(1, o), 2)])));
k.add(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${url(id)}"/>`);
}
};
__d[204] = function (__ns) {
const { surface, linearGradient, url, n } = __m(113);
const { mix } = __m(4);
const { smoothstep, phase } = __m(12);
const { glow, polyD, ellipseD, fillP, strokeP, f1, lineD } = __m(203);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 6, TAU = Math.PI * 2;
function teardrop(x, y, H, W, s) {
const pts = [];
const N = 14;
for (let i = 0; i <= N; i++) {
const a = (i / N) * TAU;
const up = 0.5 - 0.5 * Math.cos(a); 
const px = x + Math.sin(a) * W * Math.pow(1 - up, 0.55) + s * up * up;
const py = y - W * 0.2 - (1 - Math.cos(a)) * 0.5 * H;
pts.push([px, py]);
}
return pts;
}
const __default = {
id: 'idle-candle',
title: 'Candle',
category: 'Idle Loops',
description: 'A candle burning in a key: a flickering, leaning flame, a warm halo that breathes with it, a melt pool and a drip. Press and the flame bends low and recovers.',
tags: ['idle', 'candle', 'flame', 'warm', 'cozy', 'focus', 'calm', 'ambient', 'loop'],
surface: 'key',
fps: 8,
loop: LOOP,
press: 'momentary',
params: {
label: { type: 'text', default: 'Focus', label: 'Label', maxLength: 14 },
hue: { type: 'hue', default: 42, min: 0, max: 360, step: 1, label: 'Flame hue' },
},
order: 60,
render(ctx) {
const k = surface(ctx);
const T = ctx.theme, dark = T.dark;
k.background({ tone: 'idle' });
const W = k.w, Hh = k.h, S = Math.min(W, Hh), u = k.m.u;
const labeled = !!ctx.params.label;
const t = ctx.reduced ? 2.2 : phase(ctx.t, LOOP) * LOOP;
const age = ctx.pressed ? 0 : ctx.pressAge;
const gust = age < 1.6 ? (ctx.pressed ? 1 : 1 - smoothstep(0.2, 1.6, age)) : 0;
const a = (t / LOOP) * TAU;
const fl = 0.5 + 0.28 * Math.sin(a * 3 + 0.7) + 0.16 * Math.sin(a * 7 + 2.1) + 0.06 * Math.sin(a * 13);
const sway = (Math.sin(a * 2 + 1.1) * 0.6 + Math.sin(a * 5) * 0.4) * S * 0.035;
const cx = W / 2;
const bottom = labeled ? Hh - k.m.text - S * 0.2 : Hh - S * 0.08;
const top = bottom - S * (labeled ? 0.3 : 0.4);
const cw = S * 0.13;
const wax = dark ? mix('#f4ead6', ctx.theme.spectral(ctx.params.hue), 0.08) : mix('#fffaf0', ctx.theme.spectral(ctx.params.hue), 0.12);
const waxShade = mix(wax, dark ? T.colors.bg : T.colors.ink, dark ? 0.45 : 0.32);
const flameC = T.spectral(ctx.params.hue, { dl: dark ? 0.06 : 0 });
const hot = mix(flameC, '#fffbe8', 0.7);
const fy = top - S * 0.02;
glow(k, cx, fy - S * 0.1, S * 0.62, flameC, (dark ? 0.75 : 0.55) * (0.75 + 0.25 * fl) * (1 - gust * 0.6), 'halo', [[0, 0.5], [0.3, 0.2], [0.7, 0.05], [1, 0]]);
const wg = k.id('wax');
k.def(linearGradient(wg, [[0, waxShade], [0.38, wax], [0.62, wax], [1, waxShade]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(`<path d="M${f1(cx - cw)} ${f1(top)}L${f1(cx - cw)} ${f1(bottom)}Q${f1(cx)} ${f1(bottom + S * 0.025)} ${f1(cx + cw)} ${f1(bottom)}L${f1(cx + cw)} ${f1(top)}Z" fill="${url(wg)}"${dark ? '' : ` stroke="${T.colors.ink}" stroke-opacity="0.22" stroke-width="${f1(Math.max(0.8, u * 0.6))}"`}/>`);
k.add(`<path d="${ellipseD(cx, top, cw, S * 0.025)}" fill="${mix(wax, flameC, 0.35 + 0.25 * fl)}"/>`);
k.add(`<path d="M${f1(cx + cw * 0.35)} ${f1(top)}q${f1(cw * 0.25)} ${f1(S * 0.02)} ${f1(cw * 0.2)} ${f1(S * 0.09)}a${f1(cw * 0.12)} ${f1(cw * 0.12)} 0 0 1 ${f1(-cw * 0.24)} 0q${f1(-cw * 0.02)} ${f1(-S * 0.05)} ${f1(-cw * 0.2)} ${f1(-S * 0.09)}Z" fill="${wax}"/>`);
k.add(`<path d="${lineD(cx, top + 0.5, cx + sway * 0.15 + gust * S * 0.02, top - S * 0.04)}" ${strokeP(dark ? '#2a221c' : '#3a2e24', Math.max(1, u * 1.2))}/>`);
const H = S * (0.2 + 0.07 * fl) * (1 - gust * 0.45), Wf = S * 0.052 * (1 + gust * 0.25);
const lean = sway + gust * S * 0.16;
const by = top - S * 0.035;
k.add(`<path d="${polyD(teardrop(cx, by, H, Wf, lean))}" ${fillP(flameC, 0.95)}/>`);
k.add(`<path d="${polyD(teardrop(cx + lean * 0.05, by - S * 0.004, H * 0.62, Wf * 0.58, lean * 0.7))}" ${fillP(hot, 0.95)}/>`);
k.add(`<path d="${ellipseD(cx, by - Wf * 0.2, Wf * 0.5, Wf * 0.45)}" ${fillP(dark ? '#7fb2ff' : '#4f7fd9', dark ? 0.55 : 0.4)}/>`);
if (gust > 0.05 && gust < 0.95) {
let d = `M${f1(cx)} ${f1(top - S * 0.05)}`;
for (let i = 1; i <= 6; i++) d += `L${f1(cx + Math.sin(i * 1.3 + t * 3) * S * 0.03 + i * S * 0.012)} ${f1(top - S * 0.05 - i * S * 0.05)}`;
k.add(`<path d="${d}" ${strokeP(dark ? '#cfc8bd' : '#8a8178', Math.max(1, u * 0.9), n(0.5 * Math.sin(Math.PI * gust), 2))}/>`);
}
if (labeled) k.label(ctx.params.label);
return k.svg();
},
};
};
__d[205] = function (__ns) {
const { surface } = __m(113);
const { mix } = __m(4);
const { smoothstep, phase } = __m(12);
const { glyphId, restState, glyphTime, cellOf, themeBox, glow, dots, fillP } = __m(203);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 12, TAU = Math.PI * 2;
const flash = (q) => (q < 0.12 ? smoothstep(0, 0.12, q) : q < 0.3 ? 1 : q < 0.75 ? 1 - smoothstep(0.3, 0.75, q) : 0);
const __default = {
id: 'idle-firefly',
title: 'Fireflies',
category: 'Idle Loops',
description: 'Two fireflies drift around the glyph on slow looping paths, blinking on their own rhythms, passing behind and in front; press and they flash together.',
tags: ['idle', 'fireflies', 'glow', 'night', 'blink', 'press', 'calm', 'ambient', 'loop'],
surface: 'key',
fps: 8,
loop: LOOP,
press: 'momentary',
params: {
glyph: { type: 'glyph', default: 'bulb', label: 'Glyph' },
label: { type: 'text', default: 'Night', label: 'Label', maxLength: 14 },
hue: { type: 'hue', default: 100, min: 0, max: 360, step: 1, label: 'Glow hue' },
},
order: 62,
render(ctx) {
const k = surface(ctx);
const T = ctx.theme, dark = T.dark;
k.background({ tone: 'idle' });
const W = k.w, H = k.h, S = Math.min(W, H);
const labeled = !!ctx.params.label;
const box = themeBox(k, labeled), cell = cellOf(k, box);
const t = ctx.reduced ? 2.1 : phase(ctx.t, LOOP) * LOOP;
const a = (t / LOOP) * TAU;
const glowC = T.spectral(ctx.params.hue, { dl: dark ? 0.06 : -0.02 });
const hot = mix(glowC, dark ? '#fffbe6' : '#ffffff', dark ? 0.55 : 0.2);
const age = ctx.pressed ? 0 : ctx.pressAge;
const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'bulb'));
const gcx = box.x + box.size / 2, gcy = box.y + box.size / 2;
const flies = [0, 1].map((i) => {
const ph = i * Math.PI + 0.6;
const x = gcx + Math.sin(a * (1 + i) + ph) * box.size * 0.62;
const y = gcy + Math.sin(a * 2 + ph * 1.3) * box.size * 0.38 - box.size * 0.05;
const z = Math.cos(a * (1 + i) + ph);
const m = i ? 4 : 3; 
const q = ((t / LOOP) * m + i * 0.37) % 1, dur = 1.6 / (LOOP / m);
let b = q < dur ? flash(q / dur) : 0;
if (age < 4) { const lag = age - i * 0.08; b = lag > 0 && lag < 3.6 ? flash((lag % 1.2) / 1.2) : 0; }
return { i, x, y, z, b: Math.round(b * 4) / 4 };
});
const draw = (f) => {
if (f.b <= 0) return;
glow(k, f.x, f.y, S * 0.36, glowC, f.b * (dark ? 1 : 1.2), `g${f.i}`, [[0, 0.7], [0.25, 0.3], [0.6, 0.07], [1, 0]]);
dots(k, [[f.x, f.y, Math.max(1.4, S * 0.036)]], fillP(hot, Math.min(1, 0.45 + 0.55 * f.b)), cell);
};
for (const f of flies) if (f.z <= 0) draw(f);
k.glyph(g.id, { labeled, state: restState(g), t: glyphTime(ctx, g) });
for (const f of flies) if (f.z > 0) draw(f);
if (labeled) k.label(ctx.params.label);
return k.svg();
},
};
};
__d[206] = function (__ns) {
const { surface, path, circle, n, phase } = __m(113);
const { noise1, hash } = __m(1);
__e(__ns, { "default": () => __default }, [], ["default"]);
const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
const ecg = (p) => 0.1 * gauss(p, 0.14, 0.022) - 0.14 * gauss(p, 0.27, 0.008) + gauss(p, 0.3, 0.011) - 0.28 * gauss(p, 0.335, 0.01) + 0.2 * gauss(p, 0.56, 0.04);
const WORDS = { ok: 'Healthy', degraded: 'Degraded', down: 'Down' };
const __default = {
id: 'idle-heartbeat',
title: 'Heartbeat',
category: 'Idle Loops',
description: 'An oscilloscope pulse for a service: steady when healthy, arrhythmic when degraded, a flatline when down. Press to cycle.',
tags: ['health', 'ecg', 'pulse', 'uptime', 'oscilloscope', 'idle', 'alert'],
surface: 'key',
fps: 15,
loop: 2.2,
states: ['ok', 'degraded', 'down'],
tones: { ok: 'ok', degraded: 'warn', down: 'alert' },
params: {
label: { type: 'text', default: 'API', label: 'Service', maxLength: 12 },
bpm: { type: 'number', default: 66, min: 30, max: 160, step: 1, label: 'Beats per minute' },
},
order: 10,
render(ctx) {
const k = surface(ctx);
const { w, h, t, stateName, tone } = ctx;
k.background({ tone });
k.eyebrow(ctx.params.label);
k.lambda();
const x0 = k.m.safe * 0.5, span = w - k.m.safe;
const mid = h * 0.5, amp = h * 0.42;
const sweep = 2.2, head = phase(t, sweep), bps = ctx.params.bpm / 60;
const color = k.tone(tone);
const down = stateName === 'down', degraded = stateName === 'degraded';
const N = Math.round(span / (Math.min(w, h) >= 120 ? 2 : 1.5));
const sample = (age) => {
const tx = t - age * sweep;
if (down) return (noise1(tx * 9, ctx.seed) - 0.5) * 0.05;
if (degraded) {
const warp = tx * bps * 0.8 + 0.35 * Math.sin(tx * 1.7) + 0.2 * noise1(tx * 0.7, ctx.seed);
return hash(Math.floor(warp), ctx.seed + 3) < 0.18 ? (noise1(tx * 7, ctx.seed) - 0.5) * 0.04 : ecg(phase(warp, 1)) * 0.72;
}
return ecg(phase(tx * bps, 1));
};
const BANDS = [0.12, 0.24, 0.42, 0.66, 1], gap = 0.07;
const ds = BANDS.map(() => []);
let prev = null;
for (let i = 0; i <= N; i++) {
const fx = i / N, age = (head - fx + 1) % 1;
if (age > 1 - gap) { prev = null; continue; }
const b = Math.min(BANDS.length - 1, Math.floor((1 - age / (1 - gap)) * BANDS.length));
const p = [x0 + fx * span, mid - sample(age) * amp];
if (prev && prev.b !== b) ds[b].push(prev.p);
ds[b].push(p);
prev = { b, p };
}
BANDS.forEach((op, b) => {
if (ds[b].length < 2) return;
let d = '', px = -1e9;
for (const [x, y] of ds[b]) { d += `${x - px > (span / N) * 1.5 ? 'M' : 'L'}${n(x)} ${n(y)}`; px = x; }
k.add(path(d, { fill: 'none', stroke: color, strokeWidth: k.m.line * 1.1, strokeOpacity: op, strokeLinecap: 'round', strokeLinejoin: 'round' }));
});
const hx = x0 + head * span, hy = mid - sample(0) * amp;
k.add(circle({ cx: hx, cy: hy, r: k.m.bold * 1.6, fill: color, fillOpacity: 0.18 }));
k.add(circle({ cx: hx, cy: hy, r: k.m.line * 1.05, fill: down || !k.dark ? color : '#ffffff' }));
k.label(WORDS[stateName] || 'Healthy', { color: ctx.since < 0.3 ? 'tone' : undefined });
return k.svg();
},
};
};
__d[207] = function (__ns) {
const { surface, linearGradient, url } = __m(113);
const { mix, shade } = __m(4);
const { phase } = __m(12);
const { glyphId, litState, glyphTime, isoPaths, fillP, rectD } = __m(203);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 16, TAU = Math.PI * 2;
const __default = {
id: 'idle-lava',
title: 'Lava Lamp',
category: 'Idle Loops',
description: "A lava lamp behind the glyph: slow wax blobs in the key's hue rise from a pool, neck, part and sink again, under a soft veil so the glyph stays crisp.",
tags: ['idle', 'lava', 'lamp', 'blobs', 'metaballs', 'retro', 'calm', 'ambient', 'loop'],
surface: 'key',
fps: 6,
loop: LOOP,
params: {
glyph: { type: 'glyph', default: 'music-note', label: 'Glyph' },
label: { type: 'text', default: 'Chill', label: 'Label', maxLength: 14 },
hue: { type: 'hue', default: 330, min: 0, max: 360, step: 1, label: 'Wax hue' },
},
order: 63,
render(ctx) {
const k = surface(ctx);
const T = ctx.theme, dark = T.dark;
k.background({ tone: 'idle' });
const W = k.w, H = k.h, S = Math.min(W, H);
const t = ctx.reduced ? 6.4 : phase(ctx.t, LOOP) * LOOP;
const p = t / LOOP;
const wax = T.spectral(ctx.params.hue, { dl: dark ? 0 : -0.02 });
const deep = shade(T.spectral(ctx.params.hue - 18), dark ? -0.14 : -0.1);
const blobs = [0, 1, 2, 3].map((i) => {
const a = TAU * (p * (i % 2 ? 1 : 2) + i * 0.27);
const fr = (((p * (i % 2 ? 1 : 2) + i * 0.27) % 1) + 1) % 1, tri = 1 - Math.abs(2 * fr - 1);
return { x: W * (0.25 + 0.5 * ((i * 0.37) % 1)) + Math.sin(a * 2 + i) * S * 0.06, y: H * 1.08 - tri * H * 1.1, r2: (S * (0.085 + 0.022 * i)) ** 2 * (0.9 + 0.1 * Math.sin(a)) };
});
const pool = S * 0.1;
const field = (x, y) => {
let f = 0;
for (const b of blobs) { const dx = x - b.x, dy = y - b.y; f += b.r2 / (dx * dx + dy * dy + 1); }
const db = Math.max(1, H + S * 0.02 - y);
return f + (pool * pool) / (db * db);
};
const step = Math.max(2.5, S / 26);
const [body] = isoPaths(field, { x: -step, y: -step, w: W + step * 2, h: H + step * 2 }, step, [1]);
const [core] = isoPaths((x, y) => field(x + S * 0.03, y + S * 0.04), { x: -step, y: -step, w: W + step * 2, h: H + step * 2 }, step, [2.8]);
const wg = k.id('wax');
k.def(linearGradient(wg, [[0, deep], [1, mix(wax, '#ffe0b0', dark ? 0.25 : 0.1)]], { x1: 0, y1: 0, x2: 0, y2: H, gradientUnits: 'userSpaceOnUse' }));
k.add(`<path d="${body}" fill="${url(wg)}" fill-rule="evenodd" fill-opacity="${dark ? 0.85 : 0.75}"/>`);
if (core) k.add(`<path d="${core}" ${fillP(mix(wax, '#ffffff', 0.45), dark ? 0.4 : 0.5, 'evenodd')}/>`);
k.add(`<path d="${rectD(0, 0, W, H)}" ${fillP(dark ? T.colors.bg : T.colors.surface, dark ? 0.32 : 0.38)}/>`);
const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'music-note'));
k.glyph(g.id, { labeled: !!ctx.params.label, state: litState(g), t: glyphTime(ctx, g) });
if (ctx.params.label) k.label(ctx.params.label);
return k.svg();
},
};
};
__d[208] = function (__ns) {
const { surface, path, circle, ellipse, n, phase, lerp } = __m(113);
const { glyphId, themeBox, cellOf, squaresPath, glyphTime } = __m(190);
__e(__ns, { "default": () => __default }, [], ["default"]);
const TAIL = 16;
const __default = {
id: 'idle-orbit',
title: 'Orbit',
category: 'Idle Loops',
description: 'A spark of light circles the glyph on a tilted orbit, passing behind and in front of it, trailing a tail dispersed across the Spectrum.',
tags: ['idle', 'orbit', 'spark', 'comet', 'loop', 'ambient', 'spectrum'],
surface: 'key',
fps: 10,
loop: 6,
params: {
glyph: { type: 'glyph', default: 'cpu', label: 'Glyph' },
label: { type: 'text', default: 'Working', label: 'Label', maxLength: 14 },
period: { type: 'select', default: 3, options: [2, 3, 6], label: 'One orbit (s)' },
hue: { type: 'hue', default: 220, min: 0, max: 360, step: 1, label: 'Hue' },
},
order: 30,
render(ctx) {
const k = surface(ctx);
const gid = glyphId(ctx, ctx.params.glyph, 'cpu');
const g = ctx.glyphs.get(gid);
k.background({ tone: 'idle' });
const box = themeBox(k, true);
const cell = cellOf(k, box);
const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
const rx = Math.min(k.w * 0.43, box.size * 0.66), ry = rx * 0.36, tilt = (-16 * Math.PI) / 180;
const T = Number(ctx.params.period) || 3;
const th0 = ctx.reduced ? 0.9 : phase(ctx.t, T) * Math.PI * 2;
const at = (th) => {
const x = rx * Math.cos(th), y = ry * Math.sin(th);
return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt), Math.sin(th)]; 
};
const sw = k.m.line * 1.5;
const spectral = (i) => ctx.theme.spectral(ctx.hue + 40 - i * 9);
const orbit = ellipse({ cx: 0, cy: 0, rx, ry, fill: 'none', stroke: k.colors.dim, strokeWidth: n(k.m.hair), strokeOpacity: 0.35, strokeDasharray: `${n(k.m.hair * 1.5)} ${n(k.m.hair * 3)}` });
if (!cell) k.add(`<g transform="translate(${n(cx)} ${n(cy)}) rotate(-16)">${orbit}</g>`);
const segs = { back: '', front: '' };
const sq = { back: [], front: [] };
for (let i = TAIL - 1; i >= 0; i--) {
const a = at(th0 - i * 0.1), b = at(th0 - (i + 1) * 0.1);
const side = (a[2] + b[2]) / 2 > 0 ? 'front' : 'back';
const f = 1 - i / TAIL;
if (cell) {
if (i % 2 === 0) sq[side].push({ x: Math.round(a[0] / cell - 0.5) * cell, y: Math.round(a[1] / cell - 0.5) * cell, f, i });
continue;
}
segs[side] += path(`M${n(b[0])} ${n(b[1])}L${n(a[0])} ${n(a[1])}`, { stroke: spectral(i), strokeWidth: n(sw * lerp(0.35, 1, f)), strokeOpacity: n(f ** 1.6 * (side === 'back' ? 0.55 : 0.9), 3), strokeLinecap: 'round' });
}
const head = at(th0);
const drawHead = () => {
if (cell) {
const hx = Math.round(head[0] / cell - 0.5) * cell, hy = Math.round(head[1] / cell - 0.5) * cell;
k.add(path(squaresPath([[hx, hy]], cell), { fill: k.dark ? '#ffffff' : k.colors.ink }));
return;
}
k.add(circle({ cx: head[0], cy: head[1], r: sw * 2.2, fill: spectral(0), fillOpacity: 0.22 }));
k.add(circle({ cx: head[0], cy: head[1], r: sw * 0.85, fill: k.dark ? '#ffffff' : k.colors.ink }));
};
const drawSquares = (list) => { for (const s of list) k.add(path(squaresPath([[s.x, s.y]], cell), { fill: spectral(s.i), fillOpacity: n(Math.max(0.25, s.f), 3) })); };
if (cell) drawSquares(sq.back); else k.add(segs.back);
if (head[2] <= 0) drawHead();
k.glyph(gid, { labeled: true, t: glyphTime(ctx, g), state: g.stateNames.includes('busy') ? 'busy' : undefined });
if (cell) drawSquares(sq.front); else k.add(segs.front);
if (head[2] > 0) drawHead();
k.label(ctx.params.label);
return k.svg();
},
};
};
__d[209] = function (__ns) {
const { surface, rect, n, phase, clamp } = __m(113);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 6;
const __default = {
id: 'idle-prompt',
title: 'Prompt',
category: 'Idle Loops',
description: 'A terminal on a key: a prompt types a command, enter prints the answer in green, a block cursor blinks, then it clears and types again.',
tags: ['idle', 'terminal', 'prompt', 'cursor', 'typing', 'shell', 'retro'],
surface: 'key',
fps: 8,
loop: LOOP,
params: {
command: { type: 'text', default: 'deploy', label: 'Command', maxLength: 10 },
answer: { type: 'text', default: 'ok', label: 'Answer', maxLength: 10 },
prompt: { type: 'text', default: '>', label: 'Prompt', maxLength: 2 },
},
order: 60,
render(ctx) {
const k = surface(ctx);
const { w, h } = k;
k.background({ tone: 'idle' });
const cmd = String(ctx.params.command || ''), ans = String(ctx.params.answer || '');
const pr = String(ctx.params.prompt || '>');
const tl = ctx.reduced ? 3.2 : phase(ctx.t, LOOP) * LOOP;
const tType = 0.25, dt = Math.min(0.14, 2 / Math.max(1, cmd.length));
const typed = clamp(Math.floor((tl - tType) / dt) + 1, 0, cmd.length);
const tEnter = tType + cmd.length * dt + 0.45;
const entered = tl >= tEnter && tl < LOOP - 0.35;
const safe = k.m.text ?? k.m.safe;
const cols = Math.max(6, pr.length + 1 + Math.max(cmd.length, ans.length) + 1);
const cw = (w - safe * 2) / cols;
const size = Math.min(k.m.u * 11, cw * 1.55);
const row = (i) => h * (entered ? 0.42 : 0.55) + i * size * 1.45;
const put = (str, col, y, color) => { [...str].forEach((ch, i) => { if (ch !== ' ') k.label(ch, { x: safe + (col + i + 0.5) * cw, y, align: 'center', size, color, maxWidth: cw * 1.6 }); }); };
put(pr, 0, row(0), 'muted');
put(cmd.slice(0, typed), pr.length + 1, row(0), 'ink');
let cur = { col: pr.length + 1 + typed, y: row(0) };
if (entered) {
put(ans, 0, row(1), k.tone('ok'));
cur = { col: ans.length + 1, y: row(1) };
}
const typing = tl >= tType && typed < cmd.length;
const on = typing || ctx.reduced || phase(ctx.t, 1) < 0.5;
if (on && tl < LOOP - 0.35) {
const ch = size * 0.74, cwid = Math.max(2, Math.round(cw * 0.62));
k.add(rect({ x: n(Math.round(safe + cur.col * cw + (cw - cwid) / 2)), y: n(Math.round(cur.y - ch)), width: cwid, height: n(Math.round(ch)), fill: k.tone(entered ? 'ok' : 'active'), fillOpacity: 0.9 }));
}
return k.svg();
},
};
};
__d[210] = function (__ns) {
const { surface, polygon, linearGradient, url, n, clamp, inOutCubic, phase, mix } = __m(113);
const { glyphId, themeBox, cellOf, litState, glyphTime } = __m(190);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SWEEP = 0.9;
const __default = {
id: 'idle-shimmer',
title: 'Shimmer',
category: 'Idle Loops',
description: 'Every few seconds a glint crosses the key like light over glass, catching the glyph on its way. Still in between, so it costs nothing.',
tags: ['idle', 'shimmer', 'glint', 'sheen', 'shine', 'attract', 'ambient'],
surface: 'key',
fps: 12,
loop: 4,
params: {
glyph: { type: 'glyph', default: 'play-pause', label: 'Glyph' },
label: { type: 'text', default: 'Ready', label: 'Label', maxLength: 14 },
lit: { type: 'bool', default: false, label: 'Key is on' },
hue: { type: 'hue', default: 220, min: 0, max: 360, step: 1, label: 'Fringe hue' },
},
order: 40,
render(ctx) {
const k = surface(ctx);
const gid = glyphId(ctx, ctx.params.glyph, 'play-pause');
const g = ctx.glyphs.get(gid);
const tone = ctx.params.lit ? 'active' : 'idle';
const state = ctx.params.lit ? litState(g) : undefined;
k.background({ tone });
const box = themeBox(k, true);
const cell = cellOf(k, box);
k.glyph(gid, { labeled: true, state, t: glyphTime(ctx, g) });
k.label(ctx.params.label);
const p = phase(ctx.t, 4) * 4;
if (ctx.reduced || p > SWEEP) return k.svg();
const { w, h } = k;
const q = cell ? Math.round(clamp(p / SWEEP) * 8) / 8 : inOutCubic(clamp(p / SWEEP));
const slant = h * 0.55, bw = w * (cell ? 0.12 : 0.36);
let x = -bw - slant + q * (w + bw * 2 + slant * 1.2);
if (cell) x = Math.round(x / cell) * cell;
const band = (x0, wid) => [[x0 + slant, 0], [x0 + slant + wid, 0], [x0 + wid, h], [x0, h]];
const white = k.dark ? '#ffffff' : mix('#ffffff', ctx.tint, 0.15);
if (cell) {
const b1 = Math.max(cell, Math.round(bw / cell) * cell), b2 = cell;
k.add(polygon(band(x, b1), { fill: white, fillOpacity: k.dark ? 0.32 : 0.55 }));
k.add(polygon(band(x + b1 + cell, b2), { fill: white, fillOpacity: k.dark ? 0.22 : 0.4 }));
return k.svg();
}
const id = k.id('glint');
const a = k.dark ? 0.42 : 0.75;
k.def(linearGradient(id, [[0, white, 0], [0.42, white, a * 0.7], [0.5, white, a], [0.58, white, a * 0.7], [1, white, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(polygon(band(x, bw), { fill: url(id) }));
const f = Math.max(1, k.m.hair);
k.add(polygon(band(x + bw * 0.16, f), { fill: ctx.theme.spectral(ctx.hue - 70), fillOpacity: 0.55 }));
k.add(polygon(band(x + bw * 0.84 - f, f), { fill: ctx.theme.spectral(ctx.hue + 70), fillOpacity: 0.55 }));
void n;
return k.svg();
},
};
};
__d[211] = function (__ns) {
const { surface, linearGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep, outCubic, phase, lerp } = __m(12);
const { hash } = __m(1);
const { glyphId, litState, cellOf, themeBox, dots, dotD, polyD, fillP, strokeP, f1 } = __m(203);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 8, TAU = Math.PI * 2;
const __default = {
id: 'idle-snowglobe',
title: 'Snow Globe',
category: 'Idle Loops',
description: "The key's glyph inside a snow globe: shaken once a loop or on press, the snow swirls up, drifts down around the glyph and settles in a growing heap.",
tags: ['idle', 'snow', 'globe', 'winter', 'holiday', 'shake', 'press', 'calm', 'loop'],
surface: 'key',
fps: 8,
loop: LOOP,
press: 'momentary',
params: {
glyph: { type: 'glyph', default: 'home', label: 'Glyph' },
label: { type: 'text', default: 'Home', label: 'Label', maxLength: 14 },
shake: { type: 'bool', default: true, label: 'Shake once a loop' },
},
order: 61,
render(ctx) {
const k = surface(ctx);
const T = ctx.theme, dark = T.dark;
k.background({ tone: 'idle' });
const W = k.w, H = k.h, S = Math.min(W, H), u = k.m.u;
const labeled = !!ctx.params.label;
const cell = cellOf(k, themeBox(k, labeled));
const age = ctx.pressed ? 0 : ctx.pressAge;
let s = age < LOOP ? age : ctx.params.shake ? phase(ctx.t, LOOP) * LOOP : LOOP;
if (ctx.reduced) s = 2.6;
const R = S * (labeled ? 0.29 : 0.36);
const cx = W / 2, cy = labeled ? H * 0.4 : H * 0.46;
const glass = dark ? '#ffffff' : T.colors.ink;
const gid = k.id('glass');
const tint = ctx.theme.spectral(ctx.hue, { tier: 'wash' });
k.def(linearGradient(gid, [[0, mix(tint, '#ffffff', 0.4), dark ? 0.16 : 0.32], [1, tint, dark ? 0.06 : 0.14]]));
k.add(`<path d="${dotD(cx, cy, R)}" fill="${url(gid)}"/>`);
const by = cy + R * 0.82, bw = R * 0.95;
const baseC = dark ? mix(T.colors.surface, T.colors.ink, 0.12) : mix(T.colors.surface, T.colors.ink, 0.22);
k.add(`<path d="${polyD([[cx - bw * 0.82, by], [cx + bw * 0.82, by], [cx + bw, by + R * 0.3], [cx - bw, by + R * 0.3]])}" ${fillP(baseC)}/>`);
const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'home'));
const gs = R * 1.05;
k.glyph(g.id, { box: { x: cx - gs / 2, y: cy - gs / 2 + R * 0.05, size: gs }, state: litState(g), t: 0, since: 60 });
const N = 28;
const pts = [];
let landed = 0;
const floorY = cy + R * 0.72;
for (let i = 0; i < N; i++) {
const rx = cx + (hash(i, 1) - 0.5) * R * 1.1, ry = floorY - hash(i, 2) * R * 0.08; 
const ang = hash(i, 3) * TAU, rad = R * (0.2 + 0.65 * Math.sqrt(hash(i, 4)));
const hx = cx + Math.cos(ang) * rad, hy = cy - R * 0.1 + Math.sin(ang) * rad * 0.8; 
const fall = 2.6 + 4.2 * hash(i, 5); 
let x, y;
if (s < 0.7) {
const e = outCubic(s / 0.7), sw = (1 - e) * 1.6;
x = lerp(rx, hx, e) + Math.cos(ang + sw) * R * 0.1 * (1 - e); y = lerp(ry, hy, e);
} else if (s < fall) {
const f = (s - 0.7) / (fall - 0.7);
x = lerp(hx, rx, f) + Math.sin(f * 7 + i) * R * 0.08 * (1 - f); y = lerp(hy, ry, smoothstep(0, 1, f));
} else { x = rx; y = ry; landed++; continue; }
const dx = x - cx, dy = y - cy, dl = Math.hypot(dx, dy), lim = R * 0.9;
if (dl > lim) { x = cx + (dx / dl) * lim; y = cy + (dy / dl) * lim; }
pts.push([x, y, Math.max(0.8, S * (0.012 + 0.008 * hash(i, 6)))]);
}
const heap = clamp(0.25 + 0.75 * (landed / N));
const snowC = dark ? '#ffffff' : mix('#ffffff', T.colors.surface, 0.15);
const hw = R * 0.66, hh = R * 0.16 * heap;
k.add(`<path d="M${f1(cx - hw)} ${f1(floorY + R * 0.04)}Q${f1(cx - hw * 0.4)} ${f1(floorY - hh * 1.6)} ${f1(cx)} ${f1(floorY - hh)}Q${f1(cx + hw * 0.5)} ${f1(floorY - hh * 1.4)} ${f1(cx + hw)} ${f1(floorY + R * 0.04)}Z" ${fillP(snowC, dark ? 0.95 : 1)}${dark ? '' : ` stroke="${T.colors.ink}" stroke-opacity="0.18" stroke-width="${f1(Math.max(0.6, u * 0.5))}"`}/>`);
dots(k, pts, dark ? fillP(snowC, 0.95) : `${fillP(snowC)} stroke="${T.colors.ink}" stroke-opacity="0.35" stroke-width="${f1(Math.max(0.5, u * 0.35))}"`, cell);
k.add(`<path d="${dotD(cx, cy, R)}" ${strokeP(glass, Math.max(1, k.m.line), dark ? 0.55 : 0.45)}/>`);
const ha = -2.3, hb = -1.4;
k.add(`<path d="M${f1(cx + Math.cos(ha) * R * 0.8)} ${f1(cy + Math.sin(ha) * R * 0.8)}A${f1(R * 0.8)} ${f1(R * 0.8)} 0 0 1 ${f1(cx + Math.cos(hb) * R * 0.8)} ${f1(cy + Math.sin(hb) * R * 0.8)}" ${strokeP('#ffffff', Math.max(1.2, k.m.line * 1.4), dark ? 0.55 : 0.85)}/>`);
if (labeled) k.label(ctx.params.label);
return k.svg();
},
};
};
__d[212] = function (__ns) {
const { surface, path, circle, n, clamp, outBack, polar } = __m(113);
const { pad2 } = __m(11);
const { glyphId, cellOf, themeBox, cellRing, squaresPath, glyphTime } = __m(190);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'idle-tick',
title: 'Tick',
category: 'Idle Loops',
description: 'A seconds ring of 60 ticks: each second the hand snaps one tick on with a small overshoot, then holds still until the next. Real seconds when live.',
tags: ['idle', 'tick', 'seconds', 'clock', 'metronome', 'ring', 'time'],
surface: 'key',
fps: 10,
loop: 60,
data: ['clock'],
params: {
center: { type: 'select', default: 'seconds', options: ['seconds', 'glyph'], label: 'Center' },
glyph: { type: 'glyph', default: 'clock', label: 'Glyph (center: glyph)' },
label: { type: 'text', default: 'Sec', label: 'Eyebrow', maxLength: 10 },
trail: { type: 'number', default: 8, min: 0, max: 30, step: 1, label: 'Trail (ticks)' },
},
order: 50,
render(ctx) {
const k = surface(ctx);
const { w, h } = k;
k.background({ tone: 'idle' });
const c = ctx.clock;
const sec = c.s, frac = ctx.reduced ? 1 : c.ms / 1000;
const snap = clamp(frac / 0.24);
const pos = sec - 1 + (snap >= 1 ? 1 : outBack(snap, 2.2));
const cx = w / 2, cy = h / 2;
const R = Math.min(w, h) / 2 - k.m.safe * 0.55;
const len = Math.max(2, k.m.bold * 0.9);
const tint = ctx.tint, dim = k.colors.dim;
const box = themeBox(k, false);
const cell = cellOf(k, box);
const trail = Math.round(ctx.params.trail);
const lit = (i) => { const age = (sec - i + 60) % 60; return age === 0 ? 1 : age <= trail ? 1 - age / (trail + 1) : 0; };
if (cell) {
const sz = Math.max(1, Math.round(cell / 2));
const groups = new Map();
for (let i = 0; i < 60; i++) {
const [x, y] = polar(cx, cy, R - sz, i * 6);
const cl = [Math.round(x - sz / 2), Math.round(y - sz / 2)];
const v = lit(i);
const key = v ? `${tint}|${Math.ceil(v * 4) / 4}` : `${dim}|${i % 5 ? 0.35 : 0.8}`;
if (!groups.has(key)) groups.set(key, []);
groups.get(key).push(cl);
}
for (const [key, cells] of groups) { const [col, op] = key.split('|'); k.add(path(squaresPath(cells, sz), { fill: col, fillOpacity: +op < 1 ? op : null })); }
const [hx, hy] = polar(cx, cy, R - sz, Math.round(pos) * 6);
k.add(path(squaresPath([[Math.round(hx - sz), Math.round(hy - sz)]], sz * 2), { fill: k.dark ? '#ffffff' : k.colors.ink }));
void cellRing;
} else {
let dMinor = '', dMajor = '';
const litD = new Map();
for (let i = 0; i < 60; i++) {
const a = i * 6, major = i % 5 === 0;
const [x1, y1] = polar(cx, cy, R, a), [x2, y2] = polar(cx, cy, R - len * (major ? 1.7 : 1), a);
const seg = `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
const v = lit(i);
if (v) { const q = Math.ceil(v * 5) / 5; litD.set(q, (litD.get(q) || '') + seg); } else if (major) dMajor += seg; else dMinor += seg;
}
k.add(path(dMinor, { stroke: dim, strokeWidth: n(k.m.hair), strokeOpacity: 0.55, strokeLinecap: 'round' }));
k.add(path(dMajor, { stroke: dim, strokeWidth: n(k.m.line), strokeLinecap: 'round' }));
for (const [q, d] of litD) k.add(path(d, { stroke: tint, strokeWidth: n(k.m.line * 1.1), strokeOpacity: n(q, 2), strokeLinecap: 'round' }));
const a = pos * 6;
const [x1, y1] = polar(cx, cy, R + k.m.hair, a), [x2, y2] = polar(cx, cy, R - len * 2.1, a);
k.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: tint, strokeWidth: n(k.m.bold * 1.6), strokeOpacity: 0.22, strokeLinecap: 'round' }));
k.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: k.dark ? '#ffffff' : k.colors.ink, strokeWidth: n(k.m.line * 1.3), strokeLinecap: 'round' }));
k.add(circle({ cx: x2, cy: y2, r: n(k.m.line * 0.9), fill: tint }));
}
if (ctx.params.center === 'glyph') {
const gid = glyphId(ctx, ctx.params.glyph, 'clock');
k.glyph(gid, { size: Math.min(w, h) * 0.46, t: glyphTime(ctx, ctx.glyphs.get(gid)), params: { ...ctx.params, h: c.h, m: c.m, s: c.s } });
} else {
k.value(pad2(sec), { cy: cy + h * 0.02, maxWidth: R * 1.3 });
k.eyebrow(ctx.params.label, { align: 'center', x: cx, y: cy - h * 0.15, maxWidth: R * 1.2 });
}
return k.svg();
},
};
};
__d[213] = function (__ns) {
const { surface, rect, n, url, linearGradient } = __m(113);
const { clamp, outExpo } = __m(12);
const { mix } = __m(4);
const { text, glowText, widthOf, capHeight, mmss, isBig, chip } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const WORDS = { 'on-air': ['ON', 'AIR'], live: ['LIVE'], rec: ['REC'], 'mic-live': ['MIC', 'LIVE'] };
const STRIKE = [0.15, 0, 0.7, 0.05, 0.9, 0.35, 1, 0.8, 1];
const strike = (s) => (s >= STRIKE.length * 0.1 ? 1 : STRIKE[Math.max(0, Math.floor(s * 10))]);
const __default = {
id: 'state-on-air',
title: 'On Air',
category: 'State Transitions',
description: 'The studio lightbox: press to go live and the tubes strike and hold while the live time counts. Linked with the Galleon studio screen and On Air keys; shows state only.',
tags: ['on air', 'live', 'stream', 'streaming', 'broadcast', 'sign', 'tally', 'neon', 'creator', 'recording', 'obs-style'],
surface: 'key',
fps: 8,
loop: 4,
states: ['off-air', 'live'],
tones: { 'off-air': 'idle', live: 'active' },
press: 'toggle',
link: (p) => (p.words === 'mic-live' ? { 'mic.muted': { 'off-air': true, live: false } } : p.words === 'rec' ? {} : { 'stream.live': { 'off-air': false, live: true } }),
params: {
words: { type: 'select', default: 'on-air', options: ['on-air', 'live', 'rec', 'mic-live'], label: 'Sign' },
uptime: { type: 'bool', default: true, label: 'Show the live time' },
hue: { type: 'hue', default: 25, min: 0, max: 360, label: 'Tube color' },
},
order: 20,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const live = ctx.stateName === 'live';
const C = k.colors, u = k.m.u;
let lit;
if (ctx.reduced) lit = live ? 1 : 0;
else if (live) lit = 1;
else lit = Number.isFinite(ctx.pressAge) || ctx.pressed ? clamp(1 - outExpo(clamp(ctx.since / 0.7))) * 0.6 : 0;
k.background({ tone: live ? 'active' : 'idle' });
const words = WORDS[ctx.params.words] || WORDS['on-air'];
const showTime = ctx.params.uptime && (live || isBig(k));
const big = isBig(k);
const pad = k.m.safe * 0.95;
const chipText = Math.max(8, (big ? 9.5 : 8) * u);
const foot = showTime ? chipText / 0.62 + 1.5 * u : 0;
const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - foot - (foot ? 2 * u : 0);
const tint = ctx.tint;
const deep = ctx.theme.spectral(ctx.hue, { tier: 'ink' });
const any = live ? (ctx.reduced ? 1 : strike(ctx.since)) : lit;
const weight = k.dark ? 600 : 700, tracking = 0.08;
const widest = Math.max(...words.map((wd) => widthOf(wd, 100, { weight, tracking })));
const lines = words.length;
const capR = capHeight(100, weight) / 100;
const gapR = lines > 1 ? 0.42 : 0;
const size = Math.min((bw * 0.78) / (widest / 100), (bh * 0.74) / (capR * lines + gapR * (lines - 1)));
const block = size * (capR * lines + gapR * (lines - 1));
const top = by + (bh - block) / 2;
const lineY = (i) => top + size * capR * (i + 1) + size * gapR * i;
const rx = n(k.m.radius * 0.55);
if (k.dark) {
const glass = mix(C.surface2, '#000000', 0.45);
const litGlass = mix(glass, tint, 0.16);
k.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx, fill: mix(glass, litGlass, clamp(any)), stroke: live ? mix(tint, C.line, 0.35) : C.line, strokeWidth: n(Math.max(1, u * 1.1)) }));
k.add(rect({ x: n(bx + u * 2), y: n(by + u * 1.2), width: n(bw - u * 4), height: n(Math.max(1, u * 0.8)), rx: n(u * 0.4), fill: C.edge || '#ffffff', fillOpacity: n(0.12 * (0.5 + 0.5 * any), 3) }));
const core = mix(tint, '#ffffff', 0.72);
const tube = mix(glass, C.muted, 0.35);
words.forEach((wd, i) => {
const l = live && !ctx.reduced ? strike(ctx.since - i * 0.18) : lit; 
glowText(k, wd, { x: w / 2, y: lineY(i), size, weight, tracking, color: tint, lit: l, halo: size * 0.22, tube, core });
});
} else {
const off = mix(C.surface2, C.line, 0.4);
const gid = k.id('lightbox');
k.def(linearGradient(gid, [[0, mix(deep, tint, 0.45)], [1, deep]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
k.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx, fill: off, stroke: C.line, strokeWidth: n(Math.max(1, u)) }));
if (any > 0.01) k.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx, fill: url(gid), fillOpacity: any < 1 ? n(any, 3) : undefined }));
k.add(rect({ x: n(bx + u * 2), y: n(by + u * 1.2), width: n(bw - u * 4), height: n(Math.max(1, u * 0.8)), rx: n(u * 0.4), fill: '#ffffff', fillOpacity: n(0.35 + 0.3 * any, 3) }));
const letter = mix(mix(off, C.muted, 0.55), '#ffffff', clamp(any));
words.forEach((wd, i) => text(k, wd, { x: w / 2, y: lineY(i), size, weight, tracking, color: letter }));
}
if (showTime) {
const cy = h - pad - foot / 2 + u * 0.5;
if (live) {
const ch = chipText / 0.62;
chip(k, { x: w / 2, y: cy - ch / 2, h: ch, label: `● ${mmss(ctx.since)}`, color: k.dark ? tint : deep, ink: k.dark ? '#000000' : '#ffffff', size: chipText, weight: 700, anchor: 'middle', caps: false, tracking: 0.02 });
} else text(k, 'Off air', { cy, size: chipText, weight: 600, caps: true, tracking: 0.12, color: 'muted' });
}
return k.svg();
},
};
};
__d[214] = function (__ns) {
const { phase } = __m(12);
__e(__ns, { "autoplay": () => autoplay, "AUTOPLAY_PARAM": () => AUTOPLAY_PARAM }, [], ["AUTOPLAY_PARAM","autoplay"]);
function autoplay(ctx, { every = ctx.facet.loop, at = 0.4, hold = 0.14 } = {}) {
if (ctx.params.autoplay === false || ctx.pressed || ctx.pressAge !== Infinity || ctx.reduced) return ctx;
const p = phase(ctx.t, every) * every; 
const since = p >= at ? p - at : p - at + every; 
const pressed = since < hold;
return { ...ctx, pressed, pressAge: pressed ? 0 : since - hold, autoplayed: true, pressedFor: since };
}
const AUTOPLAY_PARAM = { autoplay: { type: 'bool', default: true, label: 'Demo press when idle' } };
};
__d[215] = function (__ns) {
const { KeySurface } = __m(110);
const { childContext } = __m(111);
const { attrs, n } = __m(5);
const { drawGlyph, Pen } = __m(16);
const { flattenPath, transformPath } = __m(13);
const { clamp, lerp } = __m(12);
const { autoplay } = __m(214);
const { mutedPlate, strike } = __m(137);
__e(__ns, { "face": () => face, "place": () => place, "about": () => about, "pickGlyph": () => pickGlyph, "statePair": () => statePair, "stateLabel": () => stateLabel, "keyFace": () => keyFace, "pressClock": () => pressClock, "stateClock": () => stateClock, "glyphPrims": () => glyphPrims, "ghost": () => ghost, "morphPen": () => morphPen, "paintPen": () => paintPen }, [], ["about","face","ghost","glyphPrims","keyFace","morphPen","paintPen","pickGlyph","place","pressClock","stateClock","stateLabel","statePair"]);
function face(parent, draw, { tag = 'f', press = true, ...over } = {}) {
const sub = childContext(parent.ctx, { x: 0, y: 0, w: parent.w, h: parent.h }, { kind: 'key', tag });
if (press) { sub.pressed = parent.ctx.pressed; sub.pressAge = parent.ctx.pressAge; }
Object.assign(sub, over);
const k = new KeySurface(sub);
const out = draw(k);
if (k.defs) parent.def(k.defs);
return { body: k.body, k, out };
}
function place(parent, body, { transform, opacity, clip } = {}) {
parent.add(`<g${attrs({ transform, opacity: opacity !== undefined && opacity < 0.999 ? n(Math.max(0, opacity), 3) : null, clipPath: clip ? `url(#${clip})` : null })}>${body}</g>`);
}
const about = (cx, cy, sx, sy = sx, dx = 0, dy = 0) => `translate(${n(cx + dx)} ${n(cy + dy)}) scale(${n(sx, 4)} ${n(sy, 4)}) translate(${n(-cx)} ${n(-cy)})`;
function pickGlyph(ctx) {
const reg = ctx.glyphs;
return reg.get(ctx.params.glyph) || reg.get(ctx.facet.params?.glyph?.default) || reg.values().next().value;
}
const LIT = ['active', 'ok', 'alert', 'warn', 'info', 'crit', 'busy', 'neg'];
const REST = ['idle', 'off', 'neg'];
function statePair(g) {
const names = g.stateNames;
const rank = (list, s) => { const i = list.indexOf(g.states[s]); return i < 0 ? 99 : i; };
const lit = [...names].sort((a, b) => rank(LIT, a) - rank(LIT, b))[0];
const rest = [...names].filter((s) => s !== lit).sort((a, b) => rank(REST, a) - rank(REST, b))[0] ?? lit;
return [lit, rest];
}
const title = (s) => String(s || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const stateLabel = (ctx, i, glyphState) => (i === 0 ? ctx.params.labelOn : ctx.params.labelOff) || title(glyphState);
function keyFace(k, g, state, label, { since, t, opacity, labelOpacity, box, labeled = true } = {}) {
const st = g.states[state] ? state : g.defaultState;
const tone = g.states[st];
const muted = g.id === 'mic' && st === 'off';
k.background({ tone });
if (muted) mutedPlate(k, { since });
const r = k.glyph(g.id, { state: st, labeled: labeled && !!label, since, t, opacity, box });
if (muted) strike(k, box || k.theme.glyphBox(k, { labeled: labeled && !!label }), { since });
if (label) k.label(muted ? String(label).toUpperCase() : label, { color: muted ? 'ink' : tone === 'off' ? 'dim' : undefined, opacity: labelOpacity });
return r;
}
function pressClock(ctx, { at, hold = 0.18 } = {}) {
const c = autoplay(ctx, { at: at ?? Math.max(0, ctx.facet.loop * 0.4 - hold - 0.12), hold });
const down = c.pressed ? (c.pressedFor ?? 0) : c.pressAge + hold;
return { ...c, down };
}
function stateClock(ctx, { dur = 0.6 } = {}) {
const n0 = Math.max(1, ctx.states.length);
const auto = ctx.params.autoplay !== false && !ctx.pressed && ctx.pressAge === Infinity && !ctx.reduced && n0 > 1;
if (!auto) {
const to = ctx.state, from = (to - 1 + n0) % n0;
return { from, to, since: ctx.reduced ? Infinity : ctx.since, auto: false };
}
const half = ctx.facet.loop / 2, u = ctx.t - (ctx.facet.loop * 0.4 - dur * 0.5);
const idx = Math.floor(u / half);
const to = ((idx % 2) + 2) % 2;
return { from: 1 - to, to, since: u - idx * half, auto: true };
}
function applyTfs(d, tfs) {
let out = d;
for (let j = tfs.length - 1; j >= 0; j--) {
let m = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
for (const [, fn, args] of tfs[j].matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
const v = args.trim().split(/[\s,]+/).map(Number);
if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
else { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); }
}
out = transformPath(out, m);
}
return out;
}
function glyphPrims(k, g, state, { t = k.ctx.t, since = 99 } = {}) {
const ctx = k.ctx;
const { pen } = drawGlyph(g, { state, t, since, pressed: ctx.pressed, pressAge: ctx.pressAge, value: ctx.value, params: ctx.params }, k.theme.glyphs[g.id]);
return pen.flat().map((p) => ({ ...p, d: p.transforms.length ? applyTfs(p.d, p.transforms) : p.d }));
}
function ghost(k, g, { state, box, color, opacity = 1, width = 1, t, since } = {}) {
let ds = '', df = '';
for (const p of glyphPrims(k, g, state, { t, since })) { if ((p.opacity ?? 1) < 0.05) continue; if (p.fill) df += p.d; else ds += p.d; }
const lw = (k.theme.roles.line?.width ?? 2.6) * width;
const inner = (ds ? `<path${attrs({ d: ds, fill: 'none', stroke: color, strokeWidth: n(lw), strokeLinecap: 'round', strokeLinejoin: 'round' })}/>` : '')
+ (df ? `<path${attrs({ d: df, fill: color })}/>` : '');
return `<g${attrs({ transform: `translate(${n(box.x)} ${n(box.y)}) scale(${n(box.size / 48, 4)})`, opacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null })}>${inner}</g>`;
}
const plen = (pts, closed) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (closed && pts.length > 1) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]); return L; };
function resample(pts, closed, N) {
const P0 = closed ? [...pts, pts[0]] : pts;
if (P0.length < 2) return Array.from({ length: N }, () => [...(P0[0] || [24, 24])]);
const seg = [];
let total = 0;
for (let i = 1; i < P0.length; i++) { const l = Math.hypot(P0[i][0] - P0[i - 1][0], P0[i][1] - P0[i - 1][1]); seg.push(l); total += l; }
const out = [];
const steps = closed ? N : N - 1;
let j = 0, acc = 0;
for (let s = 0; s < N; s++) {
const want = total > 0 ? (total * s) / steps : 0;
while (j < seg.length - 1 && acc + seg[j] < want) { acc += seg[j]; j++; }
const f = seg[j] > 0 ? clamp((want - acc) / seg[j]) : 0;
out.push([lerp(P0[j][0], P0[j + 1][0], f), lerp(P0[j][1], P0[j + 1][1], f)]);
}
return out;
}
function itemsOf(prims) {
const out = [];
for (const p of prims) {
if ((p.opacity ?? 1) < 0.05) continue;
for (const pl of flattenPath(p.d, 0.35)) {
if (!pl.pts.length) continue;
const closed = pl.closed || (p.fill && pl.pts.length > 2);
let cx = 0, cy = 0;
for (const [x, y] of pl.pts) { cx += x; cy += y; }
cx /= pl.pts.length; cy /= pl.pts.length;
out.push({ role: p.role, fill: !!p.fill, weight: p.weight ?? 1, opacity: p.opacity ?? 1, cap: p.cap, join: p.join, closed, pts: pl.pts, c: [cx, cy], len: plen(pl.pts, closed) });
}
}
return out;
}
function pairUp(A, B) {
const usedA = new Set(), pairs = [];
const order = B.map((b, i) => i).sort((i, j) => B[j].len - B[i].len);
for (const i of order) {
const b = B[i];
let best = -1, score = Infinity;
A.forEach((a, ai) => {
if (usedA.has(ai)) return;
const s = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) + Math.abs(a.len - b.len) * 0.12 + (a.role === b.role ? 0 : 6) + (a.fill === b.fill ? 0 : 4);
if (s < score) { score = s; best = ai; }
});
if (best >= 0 && score < 30) { usedA.add(best); pairs.push([A[best], b]); } else pairs.push([null, b]);
}
A.forEach((a, ai) => { if (!usedA.has(ai)) pairs.push([a, null]); });
return pairs;
}
function align(a, b, closed) {
const N = a.length;
const cost = (bb, sh) => { let s = 0; for (let i = 0; i < N; i += 2) { const q = bb[(i + sh) % N]; s += (a[i][0] - q[0]) ** 2 + (a[i][1] - q[1]) ** 2; } return s; };
if (!closed) { const rev = [...b].reverse(); return cost(rev, 0) < cost(b, 0) ? rev : b; }
let best = b, bc = Infinity;
for (const cand of [b, [...b].reverse()]) for (let sh = 0; sh < N; sh++) { const c = cost(cand, sh); if (c < bc) { bc = c; best = cand.map((_, i) => cand[(i + sh) % N]); } }
return best;
}
const pointPath = (pts, closed) => { let d = `M${n(pts[0][0])} ${n(pts[0][1])}`; for (let i = 1; i < pts.length; i++) d += `L${n(pts[i][0])} ${n(pts[i][1])}`; return closed ? `${d}Z` : d; };
function morphPen(primsA, primsB, p) {
const pairs = pairUp(itemsOf(primsA), itemsOf(primsB));
const pen = new Pen();
for (const [a, b] of pairs) {
const src = a || b, dst = b || a;
const N = Math.max(12, Math.min(72, Math.round(Math.max(src.len, dst.len) / 1.1)));
const closed = p < 0.5 ? src.closed : dst.closed;
const ra = resample(src.pts, src.closed, N);
let rb = resample(dst.pts, dst.closed, N);
rb = align(ra, rb, src.closed && dst.closed);
const from = a ? ra : ra.map(() => [...dst.c]), to = b ? rb : rb.map(() => [...src.c]);
const pts = from.map((q, i) => [lerp(q[0], to[i][0], p), lerp(q[1], to[i][1], p)]);
const role = p < 0.5 ? src.role : dst.role;
const fill = (p < 0.5 ? src.fill : dst.fill) && closed;
const op = a && b ? lerp(a.opacity, b.opacity, p) : a ? a.opacity * (1 - p) : b.opacity * p;
if (op < 0.03) continue;
pen._prim(pointPath(pts, closed), { role, fill, weight: lerp(src.weight, dst.weight, p), opacity: op, cap: (p < 0.5 ? src : dst).cap, join: 'round' }, closed);
}
return pen;
}
function paintPen(k, pen, tone, box, { opacity } = {}) {
const body = k.theme.paintGlyph
? k.theme.paintGlyph(k, pen, { tone, styleOf: (p) => k.roleStyle(p.role, tone) })
: pen.root.children.map((c) => k.theme.paint(k, c, k.roleStyle(c.role, tone))).join('');
k.add(`<g${attrs({ transform: `translate(${n(box.x)} ${n(box.y)}) scale(${n(box.size / 48, 4)})`, opacity: opacity !== undefined && opacity < 0.999 ? n(opacity, 3) : null })}>${body}</g>`);
}
};
__d[216] = function (__ns) {
const { surface, rect, n, clamp, outExpo, outCubic, lerp, mix, url, radialGradient, linearGradient } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { pickGlyph, statePair, pressClock } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HOLD = 0.22, BACK = 0.55;
const __default = {
id: 'press-bloom',
title: 'Bloom',
category: 'Press Feedback',
description: 'Light blooms out of the glyph and floods the key with a Beam across it while held, then draws back into the glyph on release, leaving it lit.',
tags: ['press', 'feedback', 'bloom', 'glow', 'light', 'beam'],
surface: 'key',
fps: 10,
loop: 2.4,
params: {
glyph: { type: 'glyph', default: 'bulb', label: 'Glyph' },
label: { type: 'text', default: 'Bloom', label: 'Label', maxLength: 14 },
intensity: { type: 'number', default: 1, min: 0.3, max: 1.5, step: 0.05, label: 'Intensity' },
...AUTOPLAY_PARAM,
},
order: 13,
render(ctx0) {
const c = pressClock(ctx0, { hold: HOLD });
const k = surface(c);
const g = pickGlyph(c);
const lit = statePair(g)[0], rest = g.defaultState;
const b = c.pressed ? outExpo(clamp(c.down / 0.12)) : c.pressAge < BACK ? 1 - outCubic(clamp(c.pressAge / BACK)) : 0;
const on = c.pressed || c.pressAge < 1.1;
const state = on ? lit : rest;
k.background({ tone: g.states[state] });
const box0 = k.theme.glyphBox(k, { labeled: true });
const gx = box0.x + box0.size / 2, gy = box0.y + box0.size / 2, S = Math.min(k.w, k.h);
const I = c.params.intensity;
if (b > 0.01) {
const tint = k.tone(g.states[lit]);
const col = k.dark ? mix(tint, '#ffffff', 0.3) : tint;
const id = k.id('bloom');
const r = lerp(0.28, 0.95, b) * S;
k.def(radialGradient(id, [[0, col, clamp(0.62 * b * I)], [0.35, col, clamp(0.26 * b * I)], [1, col, 0]], { gradientUnits: 'userSpaceOnUse', cx: n(gx), cy: n(gy), r: n(r) }));
k.add(rect({ width: k.w, height: k.h, fill: url(id) }));
}
const s = 1 + 0.07 * b;
const box = { x: gx - (box0.size * s) / 2, y: gy - (box0.size * s) / 2, size: box0.size * s };
k.glyph(g.id, { state, box, since: on ? c.down : 9 });
if (b > 0.01) {
const L = lerp(0.18, 1.15, b) * k.w, hh = Math.max(1, k.m.line * 0.8);
const id = k.id('beam'), core = k.dark ? '#ffffff' : k.tone(g.states[lit]);
k.def(linearGradient(id, [[0, core, 0], [0.5, core, clamp(0.9 * b * I)], [1, core, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: n(gx - L / 2), y: n(gy - hh / 2), width: n(L), height: n(hh), fill: url(id) }));
k.add(rect({ x: n(gx - L * 0.35), y: n(gy - hh * 2.5), width: n(L * 0.7), height: n(hh * 5), fill: url(id), fillOpacity: n(0.18 * b, 3) }));
}
k.label(c.params.label, { color: g.states[state] === 'off' ? 'dim' : undefined });
return k.svg();
},
};
};
__d[217] = function (__ns) {
const { surface, n, clamp, outExpo, outCubic, mix } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { defaultText } = __m(14);
const { pickGlyph, statePair, pressClock, ghost } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HOLD = 0.2, SETTLE = 0.55;
const __default = {
id: 'press-refract',
title: 'Refract',
category: 'Press Feedback',
description: 'The glyph splits into two spectral copies while the key is held and converges back into focus on release — the Refraction press.',
tags: ['press', 'feedback', 'refraction', 'chromatic', 'spectrum', 'split'],
surface: 'key',
fps: 10,
loop: 2.4,
params: {
glyph: { type: 'glyph', default: 'mic', label: 'Glyph' },
label: { type: 'text', default: 'Refract', label: 'Label', maxLength: 14 },
spread: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.05, label: 'Spread' },
...AUTOPLAY_PARAM,
},
order: 12,
render(ctx0) {
const c = pressClock(ctx0, { hold: HOLD });
const k = surface(c);
const g = pickGlyph(c);
const lit = statePair(g)[0], rest = g.defaultState;
const e = c.pressed ? outExpo(clamp(c.down / 0.1)) : c.pressAge < SETTLE ? 1 - outCubic(clamp(c.pressAge / SETTLE)) : 0;
const on = c.pressed || c.pressAge < 1;
const state = on ? lit : rest;
const tone = g.states[state];
k.background({ tone });
const box = k.theme.glyphBox(k, { labeled: true });
if (e > 0.01) {
const split = box.size * 0.085 * c.params.spread * e, h = c.hue;
const ink = (dh) => (k.dark ? c.theme.spectral(h + dh) : mix(c.theme.spectral(h + dh), '#000000', 0.08));
const at = (dx, dy) => ({ ...box, x: box.x + dx, y: box.y + dy });
k.add(ghost(k, g, { state, box: at(-split, -split * 0.18), color: ink(-75), opacity: 0.78 * e, since: c.down }));
k.add(ghost(k, g, { state, box: at(split, split * 0.18), color: ink(75), opacity: 0.78 * e, since: c.down }));
}
k.glyph(g.id, { state, box, since: on ? c.down : 9, opacity: e > 0.01 ? n(1 - 0.25 * e, 3) : undefined });
if (e > 0.05) {
const off = Math.max(0.6, k.m.u * 0.9) * e * c.params.spread;
k.add(defaultText(k, 'label', c.params.label, { x: k.w / 2 - off, color: c.theme.spectral(c.hue - 75), opacity: 0.55 * e }));
k.add(defaultText(k, 'label', c.params.label, { x: k.w / 2 + off, color: c.theme.spectral(c.hue + 75), opacity: 0.55 * e }));
}
k.label(c.params.label, { color: tone === 'off' ? 'dim' : undefined });
return k.svg();
},
};
};
__d[218] = function (__ns) {
const { surface, circle, n, clamp, outExpo, lerp } = __m(113);
const { autoplay, AUTOPLAY_PARAM } = __m(214);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'press-ripple',
title: 'Spectral Ripple',
category: 'Press Feedback',
description: 'Every press sends three rings of dispersed light racing out from the glyph, over the theme’s own press feedback.',
tags: ['press', 'feedback', 'ripple', 'tap', 'spectrum'],
surface: 'key',
fps: 20,
loop: 2.4,
params: {
glyph: { type: 'glyph', default: 'power', label: 'Glyph' },
label: { type: 'text', default: 'Press', label: 'Label', maxLength: 14 },
...AUTOPLAY_PARAM,
},
order: 10,
render(ctx0) {
const ctx = autoplay(ctx0);
const k = surface(ctx);
k.background({ tone: ctx.pressed || ctx.pressAge < 0.5 ? 'active' : 'idle' });
const { box } = k.glyph(ctx.params.glyph, { labeled: true, state: ctx.pressed || ctx.pressAge < 1 ? 'on' : undefined });
k.label(ctx.params.label);
const since = ctx.pressed ? 0 : ctx.pressAge + 0.14;
const cx = box.x + box.size / 2, cy = box.y + box.size / 2, maxR = Math.hypot(k.w, k.h) * 0.55;
for (let i = 0; i < 3; i++) {
const p = clamp((since - i * 0.09) / 0.75);
if (p <= 0 || p >= 1) continue;
const r = lerp(box.size * 0.3, maxR, outExpo(p));
k.add(circle({ cx, cy, r, fill: 'none', stroke: ctx.theme.spectral(ctx.hue + (i - 1) * 45), strokeWidth: k.m.line * (1.6 - p), strokeOpacity: n((1 - p) * 0.9, 3) }));
}
return k.svg();
},
};
};
__d[219] = function (__ns) {
const { surface, rect, n, clamp, outCubic, inQuad, mix, url, linearGradient, phase } = __m(113);
const { AUTOPLAY_PARAM, autoplay } = __m(214);
const { pickGlyph, statePair, keyFace, stateLabel } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SLATS = 5, CLOSE = 0.12, OPEN = 0.3, STAGGER = 0.035, HOLD = 0.3; 
const __default = {
id: 'press-shutter',
title: 'Shutter',
category: 'Press Feedback',
description: 'Louvers snap shut top to bottom on press, the state changes behind them, and they swing open on release to reveal it. Mechanical, staggered, toggling.',
tags: ['press', 'feedback', 'shutter', 'louver', 'toggle', 'mechanical'],
surface: 'key',
fps: 10,
loop: 3.2,
states: ['on', 'off'],
press: 'toggle',
params: {
glyph: { type: 'glyph', default: 'camera', label: 'Glyph' },
labelOn: { type: 'text', default: '', label: 'Label (on)', maxLength: 14 },
labelOff: { type: 'text', default: '', label: 'Label (off)', maxLength: 14 },
...AUTOPLAY_PARAM,
},
order: 14,
render(ctx0) {
const half = ctx0.facet.loop / 2, at = Math.max(0, phase(ctx0.facet.loop * 0.4, half) * half - HOLD - 0.1);
const c = autoplay(ctx0, { every: half, at, hold: HOLD });
const k = surface({ ...c, pressed: false, pressAge: Infinity });
const g = pickGlyph(c);
const pair = statePair(g);
let shown = c.state, down; 
if (c.autoplayed) {
down = c.pressedFor;
const m = Math.floor((c.t - at) / half); 
shown = (((m + 1) % 2) + 2) % 2;
} else down = c.pressed ? Math.min(c.since, CLOSE + STAGGER * SLATS) : c.pressAge + HOLD;
const held = c.pressed, age = c.pressAge;
const slat = (i) => {
if (c.reduced) return 0;
if (held) return outCubic(clamp((down - i * STAGGER) / CLOSE));
if (!(age < OPEN + STAGGER * SLATS)) return 0;
return 1 - inQuad(clamp((age - i * STAGGER) / OPEN));
};
const closures = Array.from({ length: SLATS }, (_, i) => slat(i));
const allShut = closures.every((v) => v > 0.98);
const behind = held && !allShut ? 1 - shown : shown;
const gs = pair[behind];
keyFace(k, g, gs, stateLabel(c, behind, gs), { since: held ? 9 : Math.max(0, age) });
const H = k.h, W = k.w, sh = H / SLATS, C = k.colors;
const top = k.dark ? mix(C.surface, '#ffffff', 0.14) : mix(C.surface, '#ffffff', 0.4), bot = k.dark ? mix(C.surface2, '#000000', 0.2) : mix(C.surface2, '#000000', 0.12);
let gid = null;
closures.forEach((v, i) => {
if (v < 0.02) return;
if (!gid) { gid = k.id('slat'); k.def(linearGradient(gid, [[0, top], [1, bot]])); }
const hh = sh * v + (v > 0.98 ? 1 : 0), y = i * sh + (sh - hh) / 2;
k.add(rect({ x: 0, y: n(y), width: W, height: n(hh), fill: url(gid) }));
k.add(rect({ x: 0, y: n(y), width: W, height: n(Math.max(1, k.m.hair)), fill: '#ffffff', fillOpacity: n((k.dark ? 0.22 : 0.7) * v, 3) }));
k.add(rect({ x: 0, y: n(y + hh - Math.max(1, k.m.hair)), width: W, height: n(Math.max(1, k.m.hair)), fill: '#000000', fillOpacity: n((k.dark ? 0.6 : 0.18) * v, 3) }));
});
return k.svg();
},
};
};
__d[220] = function (__ns) {
const { surface, rect, n, clamp, spring, roundRectPath, path, mix } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { face, place, about, pickGlyph, statePair, keyFace, pressClock } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HOLD = 0.2;
const __default = {
id: 'press-sink',
title: 'Key Travel',
category: 'Press Feedback',
description: 'The face sinks into the bezel — smaller, lower, out of the light — and springs back with a small overshoot on release. Physical, quiet, five frames.',
tags: ['press', 'feedback', 'sink', 'travel', 'spring', 'tactile'],
surface: 'key',
fps: 10,
loop: 2.4,
params: {
glyph: { type: 'glyph', default: 'power', label: 'Glyph' },
label: { type: 'text', default: 'Press', label: 'Label', maxLength: 14 },
depth: { type: 'number', default: 1, min: 0.3, max: 1.6, step: 0.05, label: 'Travel' },
...AUTOPLAY_PARAM,
},
order: 11,
render(ctx0) {
const c = pressClock(ctx0, { hold: HOLD });
const k = surface({ ...c, pressed: false, pressAge: Infinity });
const g = pickGlyph(c);
const lit = statePair(g)[0], rest = g.defaultState;
const deep = c.params.depth;
const d = c.pressed ? 1 : c.pressAge < 1.2 ? 1 - spring(c.pressAge, { stiffness: 300, damping: 15 }) : 0;
const on = c.pressed || c.pressAge < 0.9;
const W = k.w, H = k.h, cx = W / 2, cy = H / 2;
k.add(rect({ width: W, height: H, fill: k.dark ? '#000000' : mix(k.colors.surface2, '#000000', 0.42) }));
const f = face(k, (fk) => {
keyFace(fk, g, on ? lit : rest, c.params.label, { since: on ? c.down : 9 });
const dd = clamp(d * deep);
if (dd > 0.01) {
fk.add(rect({ width: W, height: H, fill: '#000000', fillOpacity: n(0.16 * dd, 3) }));
const ring = roundRectPath(fk.m.hair, fk.m.hair, W - fk.m.hair * 2, H - fk.m.hair * 2, fk.m.radius);
fk.add(path(ring, { fill: 'none', stroke: '#000000', strokeWidth: n(fk.m.bold * 2.2), strokeOpacity: n(0.5 * dd, 3) }));
}
if (d < -0.02) fk.add(rect({ x: fk.m.radius, y: 0, width: W - fk.m.radius * 2, height: n(Math.max(1, fk.m.hair)), fill: '#ffffff', fillOpacity: n(clamp(-d * 4) * 0.5, 3) }));
}, { tag: 'face', pressed: c.pressed, pressAge: c.pressAge });
const s = 1 - 0.075 * d * deep, dy = 0.022 * H * d * deep;
place(k, f.body, { transform: Math.abs(d) > 0.002 ? about(cx, cy, s, s, 0, dy) : null });
return k.svg();
},
};
};
__d[221] = function (__ns) {
const { surface, clamp, inOutSine, outCubic, smoothstep } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { pairLink } = __m(137);
const { face, place, about, pickGlyph, statePair, keyFace, stateLabel, stateClock } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const DUR = 0.6;
const __default = {
id: 'state-crossfade',
title: 'Crossfade',
category: 'State Transitions',
description: 'The new state dissolves in over the old while converging into place — material, glow, glyph and label cross over in six frames.',
tags: ['state', 'transition', 'crossfade', 'dissolve', 'toggle'],
surface: 'key',
fps: 10,
loop: 3.2,
states: ['on', 'off'],
press: 'toggle',
link: (p) => pairLink(p.glyph, ['on', 'off']), 
params: {
glyph: { type: 'glyph', default: 'mic', label: 'Glyph' },
labelOn: { type: 'text', default: 'Live', label: 'Label (on)', maxLength: 14 },
labelOff: { type: 'text', default: 'Muted', label: 'Label (off)', maxLength: 14 },
...AUTOPLAY_PARAM,
},
order: 20,
render(ctx) {
const k = surface(ctx);
const g = pickGlyph(ctx);
const pair = statePair(g);
const { from, to, since } = stateClock(ctx, { dur: DUR });
const p = inOutSine(clamp(since / DUR));
const cx = k.w / 2, cy = k.h / 2;
if (p >= 0.999) { keyFace(k, g, pair[to], stateLabel(ctx, to, pair[to]), { since }); return k.svg(); }
const la = 1 - smoothstep(0.1, 0.5, p), lb = smoothstep(0.5, 0.9, p);
const old = face(k, (f) => keyFace(f, g, pair[from], stateLabel(ctx, from, pair[from]), { since: 9, labelOpacity: la }), { tag: 'a' });
const nu = face(k, (f) => keyFace(f, g, pair[to], stateLabel(ctx, to, pair[to]), { since, labelOpacity: lb }), { tag: 'b' });
const so = 1 - 0.02 * p, sn = 1 + 0.045 * (1 - outCubic(clamp(since / DUR)));
place(k, old.body, { transform: about(cx, cy, so) });
place(k, nu.body, { transform: about(cx, cy, sn), opacity: p });
return k.svg();
},
};
};
__d[222] = function (__ns) {
const { surface, rect, n, clamp, inOutSine, mix } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { pairLink } = __m(137);
const { face, place, pickGlyph, statePair, keyFace, stateLabel, stateClock } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const DUR = 0.6;
const __default = {
id: 'state-flip',
title: 'Card Flip',
category: 'State Transitions',
description: 'The key turns over like a card about its vertical axis, shading as it goes edge-on, and shows the new state on its back.',
tags: ['state', 'transition', 'flip', 'card', 'turn', '3d', 'toggle'],
surface: 'key',
fps: 10,
loop: 3.2,
states: ['on', 'off'],
press: 'toggle',
link: (p) => pairLink(p.glyph, ['on', 'off']), 
params: {
glyph: { type: 'glyph', default: 'broadcast', label: 'Glyph' },
labelOn: { type: 'text', default: 'On Air', label: 'Label (on)', maxLength: 14 },
labelOff: { type: 'text', default: 'Offline', label: 'Label (off)', maxLength: 14 },
...AUTOPLAY_PARAM,
},
order: 22,
render(ctx) {
const k = surface(ctx);
const g = pickGlyph(ctx);
const pair = statePair(g);
const { from, to, since } = stateClock(ctx, { dur: DUR });
const p = inOutSine(clamp(since / DUR));
if (p >= 0.999) { keyFace(k, g, pair[to], stateLabel(ctx, to, pair[to]), { since: since - DUR }); return k.svg(); }
const W = k.w, H = k.h, cx = W / 2, cy = H / 2;
const a = Math.PI * p, front = p < 0.5;
const sx = Math.max(0.001, Math.abs(Math.cos(a))), turn = Math.sin(a);
const st = front ? from : to;
const f = face(k, (fk) => {
keyFace(fk, g, pair[st], stateLabel(ctx, st, pair[st]), { since: front ? 9 : 0 });
fk.add(rect({ width: W, height: H, fill: '#000000', fillOpacity: n(0.62 * turn, 3) }));
const sp = Math.max(1, fk.m.line);
fk.add(rect({ x: front ? W - sp : 0, y: 0, width: sp, height: H, fill: '#ffffff', fillOpacity: n(0.4 * turn, 3) }));
}, { tag: front ? 'a' : 'b' });
const shear = 0.09 * turn * (front ? 1 : -1), lift = 1 + 0.05 * turn;
k.add(rect({ width: W, height: H, fill: k.dark ? '#000000' : mix(k.colors.surface2, '#000000', 0.42) }));
place(k, f.body, { transform: `translate(${n(cx)} ${n(cy)}) matrix(${n(sx, 4)} ${n(shear * sx, 4)} 0 ${n(lift, 4)} 0 0) translate(${n(-cx)} ${n(-cy)})` });
return k.svg();
},
};
};
__d[223] = function (__ns) {
const { surface, path, n, clamp, outQuad, mix, P, url, linearGradient } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { pairLink } = __m(137);
const { pickGlyph, statePair, keyFace, stateLabel, stateClock } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CLOSE = 0.3, OPEN = 0.4, BLADES = 6;
const __default = {
id: 'state-iris',
title: 'Iris',
category: 'State Transitions',
description: 'Six iris blades sweep shut over the old state, rotating as they close, then open on the new one with a ring of light at the aperture.',
tags: ['state', 'transition', 'iris', 'aperture', 'camera', 'shutter', 'toggle'],
surface: 'key',
fps: 10,
loop: 3.2,
states: ['on', 'off'],
press: 'toggle',
link: (p) => pairLink(p.glyph, ['on', 'off']), 
params: {
glyph: { type: 'glyph', default: 'record', label: 'Glyph' },
labelOn: { type: 'text', default: 'Rec', label: 'Label (on)', maxLength: 14 },
labelOff: { type: 'text', default: 'Ready', label: 'Label (off)', maxLength: 14 },
...AUTOPLAY_PARAM,
},
order: 23,
render(ctx) {
const k = surface(ctx);
const g = pickGlyph(ctx);
const pair = statePair(g);
const { from, to, since } = stateClock(ctx, { dur: CLOSE + OPEN });
const closing = since < CLOSE;
const st = closing ? from : to;
keyFace(k, g, pair[st], stateLabel(ctx, st, pair[st]), { since: closing ? 9 : since - CLOSE });
if (since >= CLOSE + OPEN) return k.svg();
const W = k.w, H = k.h, cx = W / 2, cy = H * 0.46;
const Rmax = Math.hypot(W, H) * 0.56;
const open = closing ? 1 - clamp(since / CLOSE) : outQuad(clamp((since - CLOSE) / OPEN));
const R = Math.max(0.5, Rmax * open);
const rot = 18 + 42 * (1 - open);
const V = Array.from({ length: BLADES }, (_, i) => { const a = ((rot + i * (360 / BLADES)) * Math.PI) / 180; return [cx + R * Math.sin(a), cy - R * Math.cos(a)]; });
const C = k.colors, M = Math.max(W, H) * 2;
const blade = P().M(-M, -M).H(W + M).V(H + M).H(-M).Z().M(...V[0]);
for (const v of V.slice(1)) blade.L(...v);
blade.Z();
const id = k.id('blade');
const b0 = k.dark ? mix(C.surface, '#000000', 0.25) : mix(C.surface2, '#000000', 0.18), b1 = k.dark ? mix(C.surface2, '#000000', 0.55) : mix(C.surface2, '#000000', 0.32);
k.def(linearGradient(id, [[0, b0], [1, b1]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
k.add(path(blade.d, { fill: url(id), fillRule: 'evenodd' }));
const seam = P(), L = M;
V.forEach((v, i) => { const w = V[(i + 1) % BLADES], dx = w[0] - v[0], dy = w[1] - v[1], l = Math.hypot(dx, dy) || 1; seam.M(...v).L(w[0] + (dx / l) * L, w[1] + (dy / l) * L); });
const hair = Math.max(1, k.m.hair);
k.add(path(seam.d, { fill: 'none', stroke: '#000000', strokeWidth: n(hair * 1.6), strokeOpacity: k.dark ? 0.7 : 0.35 }));
k.add(path(seam.d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(hair * 0.8), strokeOpacity: k.dark ? 0.14 : 0.5, transform: `translate(${n(hair)} ${n(hair)})` }));
if (R > 1) {
const rim = P().M(...V[0]);
for (const v of V.slice(1)) rim.L(...v);
k.add(path(rim.Z().d, { fill: 'none', stroke: k.tone(g.states[pair[st]] === 'off' ? 'active' : g.states[pair[st]]), strokeWidth: n(k.m.line), strokeOpacity: n(0.85 * Math.min(1, open * 4), 3), strokeLinejoin: 'round' }));
}
return k.svg();
},
};
};
__d[224] = function (__ns) {
const { surface, clamp, inOutSine, smoothstep } = __m(113);
const { AUTOPLAY_PARAM } = __m(214);
const { pairLink } = __m(137);
const { face, place, pickGlyph, statePair, keyFace, stateLabel, stateClock, glyphPrims, morphPen, paintPen } = __m(215);
__e(__ns, { "default": () => __default }, [], ["default"]);
const DUR = 0.7;
const __default = {
id: 'state-morph',
title: 'Morph',
category: 'State Transitions',
description: 'The glyph’s strokes bend from one state’s shape into the other’s — real geometry tweening, painted by the theme — while the material crossfades.',
tags: ['state', 'transition', 'morph', 'tween', 'shape', 'toggle'],
surface: 'key',
fps: 10,
loop: 3.2,
states: ['on', 'off'],
press: 'toggle',
link: (p) => pairLink(p.glyph, ['on', 'off']), 
params: {
glyph: { type: 'glyph', default: 'volume', label: 'Glyph' },
labelOn: { type: 'text', default: 'Volume', label: 'Label (on)', maxLength: 14 },
labelOff: { type: 'text', default: 'Muted', label: 'Label (off)', maxLength: 14 },
...AUTOPLAY_PARAM,
},
order: 21,
render(ctx) {
const k = surface(ctx);
const g = pickGlyph(ctx);
const pair = statePair(g);
const { from, to, since } = stateClock(ctx, { dur: DUR });
const p = inOutSine(clamp(since / DUR));
if (p >= 0.999) { keyFace(k, g, pair[to], stateLabel(ctx, to, pair[to]), { since: 9 }); return k.svg(); }
const sa = pair[from], sb = pair[to], ta = g.states[sa], tb = g.states[sb];
k.background({ tone: tb });
const old = face(k, (f) => f.background({ tone: ta }), { tag: 'a' });
place(k, old.body, { opacity: 1 - p });
const box = k.theme.glyphBox(k, { labeled: true });
const pen = morphPen(glyphPrims(k, g, sa, { since: 9 }), glyphPrims(k, g, sb, { since: 9 }), p);
paintPen(k, pen, p < 0.5 ? ta : tb, box);
k.toneName = p < 0.5 ? ta : tb;
const la = 1 - smoothstep(0.1, 0.5, p), lb = smoothstep(0.5, 0.9, p);
if (la > 0.01) k.label(stateLabel(ctx, from, sa), { opacity: la, color: ta === 'off' ? 'dim' : undefined });
if (lb > 0.01) k.label(stateLabel(ctx, to, sb), { opacity: lb, color: tb === 'off' ? 'dim' : undefined });
return k.svg();
},
};
};
__d[225] = function (__ns) {
const { surface, polygon, linearGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep, lerp } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, dotD, ellipseD, polyD, lit, clipPoly } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 30, TAU = Math.PI * 2;
function fishShape(kind, wag) {
const body = [], N = 12;
const H = kind === 'angel' ? 0.34 : kind === 'gold' ? 0.3 : kind === 'school' ? 0.14 : 0.16;
for (let i = 0; i <= N; i++) { const u = i / N; body.push([0.5 - u * 0.78, -H * Math.sin(Math.PI * Math.pow(u, 0.72)) ** 0.9]); }
for (let i = N; i >= 0; i--) { const u = i / N; body.push([0.5 - u * 0.78, H * 0.92 * Math.sin(Math.PI * Math.pow(u, 0.72)) ** 0.9]); }
const tx = -0.28, tl = kind === 'gold' ? 0.42 : kind === 'angel' ? 0.24 : 0.22, ts = kind === 'gold' ? 0.3 : 0.17;
const tail = [[tx + 0.02, 0], [tx - tl, -ts + wag * 0.1], [tx - tl * 0.72, wag * 0.12], [tx - tl, ts + wag * 0.1]];
const fins = [];
if (kind === 'angel') {
fins.push([[0.18, -0.26], [-0.02, -0.74], [-0.2, -0.24]]);
fins.push([[0.14, 0.26], [-0.06, 0.78], [-0.22, 0.22]]);
}
if (kind === 'gold') fins.push([[0.1, -0.26], [-0.06, -0.44], [-0.2, -0.24]]);
return { body, tail, fins };
}
const __default = {
id: 'span-aquarium',
title: 'Aquarium',
category: 'Whole Device',
description: 'A fish tank across the device: fish glide behind the bezels from key to key over sand and swaying weed; press a key to drop food and the fish gather there.',
tags: ['aquarium', 'fish', 'water', 'tank', 'bubbles', 'press', 'nature', 'ambient', 'wall', 'calm'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
press: 'momentary',
fps: 6,
loop: LOOP,
params: {
fish: { type: 'number', default: 1, min: 0.5, max: 2, step: 0.1, label: 'Fish' },
bubbles: { type: 'bool', default: true, label: 'Bubbler' },
budget: BUDGET,
},
order: 61,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const nFish = Math.round(clamp(cells.length * 0.45, 3, 10) * ctx.params.fish);
const { t } = frameClock(ctx, { fps: 6, changing: Math.min(cells.length, Math.ceil(nFish * 1.5 + grid.cols * 0.5 + 1)), still: 12 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const sp = (hh, o) => T.spectral(hh, o);
const top = dark ? mix(T.colors.bg, sp(205), flat ? 0 : 0.32) : mix(T.colors.surface, sp(200), flat ? 0 : 0.34);
const deep = dark ? mix(T.colors.bg, sp(235), flat ? 0 : 0.18) : mix(T.colors.surface, sp(215), flat ? 0 : 0.52);
backdrop(k, [[0, top, dark ? 0.92 : 0.85], [1, deep, dark ? 0.94 : 0.88]], { y2: h });
const shaft = k.id('shaft');
const sc = dark ? sp(185, { dl: 0.1 }) : '#ffffff';
k.def(linearGradient(shaft, [[0, sc, dark ? 0.12 : 0.36], [1, sc, 0]], { x1: 0, y1: 0, x2: 0, y2: h * 0.9, gradientUnits: 'userSpaceOnUse' }));
const B = new Batch(grid);
const nShaft = Math.max(2, Math.round(w / (K * 2.2)));
for (let i = 0; i < nShaft; i++) {
const x = w * (i + 0.3 + 0.4 * hash(i, ctx.seed, 9)) / nShaft, sw = K * (0.3 + 0.35 * hash(i, 8));
const pts = [[x, 0], [x + sw, 0], [x + sw * 0.6 + h * 0.35, h * 0.9], [x - sw * 0.3 + h * 0.3, h * 0.9]];
for (const c of cells) {
const cl = clipPoly(pts, c);
if (cl.length > 2) k.add(polygon(cl, { fill: url(shaft) }));
}
}
const bottom = grid.row + grid.rows - 1;
const floorCells = cells.filter((c) => c.row === bottom);
const sand = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(70), 0.42) : mix(T.colors.surface, sp(75), 0.4);
const sand2 = flat ? sand : dark ? mix(T.colors.bg, sp(60), 0.3) : mix(T.colors.surface, sp(60), 0.55);
for (const c of floorCells) {
const y0 = c.y + c.h * 0.8;
const pts = [];
for (let i = 0; i <= 8; i++) { const x = c.x + (c.w * i) / 8; pts.push([x, y0 + Math.sin(x / K * 2.4 + 1) * K * 0.035 + Math.sin(x / K * 5.3) * K * 0.015]); }
pts.push([c.x + c.w, c.y + c.h], [c.x, c.y + c.h]);
B.add([c.x, y0 - K * 0.1, c.x + c.w, c.y + c.h], fillP(sand, flat ? 0.25 : 1), polyD(pts), 0);
let d = '';
for (let j = 0; j < 4; j++) d += ellipseD(c.x + c.w * (0.1 + 0.8 * hash(c.i, j, 1)), c.y + c.h * (0.88 + 0.07 * hash(c.i, j, 2)), K * (0.025 + 0.03 * hash(c.i, j, 3)), K * (0.016 + 0.015 * hash(c.i, j, 3)));
B.add([c.x, c.y + c.h * 0.8, c.x + c.w, c.y + c.h], fillP(sand2, flat ? 0.5 : 1), d, 1);
}
const weedA = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(150), 0.55) : mix(T.colors.ink, sp(150), 0.55);
const weedB = flat ? weedA : dark ? mix(T.colors.bg, sp(135), 0.38) : mix(T.colors.surface, sp(140), 0.55);
const weedR = flat ? weedA : dark ? mix(T.colors.bg, sp(18), 0.42) : mix(T.colors.surface, sp(20), 0.6);
const rockC = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(250), 0.22) : mix(T.colors.ink, sp(250), 0.25);
for (let r = 0; r < Math.max(1, Math.round(floorCells.length / 3)); r++) {
const fc = floorCells[Math.floor(hash(r, ctx.seed, 51) * floorCells.length)];
const cx = fc.x + fc.w * (0.25 + 0.5 * hash(r, ctx.seed, 52)), cy = fc.y + fc.h * 0.86, rw = K * (0.22 + 0.12 * hash(r, 53)), rh = rw * 0.62;
const pts = [];
for (let s = 0; s <= 10; s++) { const a = Math.PI + (s / 10) * Math.PI; pts.push([cx + Math.cos(a) * rw * (1 + 0.08 * Math.sin(s * 2.1 + r)), cy + Math.sin(a) * rh * (1 + 0.1 * Math.cos(s * 1.7))]); }
B.poly(pts, fillP(rockC, flat ? (dark ? 0.35 : 0.5) : 1), 1);
B.poly(pts.slice(1, 5).map(([x, y]) => [x + rw * 0.08, y + rh * 0.12]).concat([[cx - rw * 0.2, cy - rh * 0.55]]), fillP(dark ? '#ffffff' : '#ffffff', dark ? 0.08 : 0.3), 1);
}
const clumps = Math.max(2, Math.round(grid.cols * 0.9));
for (let i = 0; i < clumps; i++) {
const fc = floorCells[Math.floor(hash(i, ctx.seed, 21) * floorCells.length)];
const xr = fc.x + fc.w * (0.15 + 0.7 * hash(i, ctx.seed, 22));
const y0 = fc.y + fc.h * 0.9;
const sway = Math.round(Math.sin((t / LOOP) * TAU * 3 + i * 1.9) * 3) / 3;
const red = i % 4 === 3;
const blades = 3 + Math.floor(hash(i, 24) * 3);
for (let b = 0; b < blades; b++) {
const x0 = xr + (b - blades / 2) * K * 0.05;
const len = Math.min(h * 0.62, K * (0.55 + 1.15 * hash(i, b, 23)) * (red ? 0.6 : 1));
const fan = (b - (blades - 1) / 2) * K * 0.1;
const bw = K * (red ? 0.06 : 0.04 + 0.02 * hash(i, b, 25));
const L = [], R = [];
for (let s = 0; s <= 10; s++) {
const f = s / 10, bend = (sway * K * 0.16 + fan) * f * f + Math.sin(f * 5 + i + b) * K * 0.04 * f;
const ripple = 1 + 0.35 * Math.sin(f * 14 + b);
const x = x0 + bend, y = y0 - len * f, hw = bw * (1 - f * 0.8) * ripple;
L.push([x - hw, y]); R.unshift([x + hw, y]);
}
B.poly([...L, ...R], fillP(red ? weedR : b % 2 ? weedA : weedB, flat ? 0.6 : 0.95), 2);
}
}
if (ctx.params.bubbles) {
const bx = floorCells[floorCells.length - 1].x + floorCells[floorCells.length - 1].w * 0.72;
const bubbleC = dark ? '#ffffff' : flat ? T.colors.ink : mix(T.colors.ink, sp(200), 0.5);
for (let j = 0; j < 7; j++) {
const f = ((t / LOOP) * 6 + j / 7) % 1;
const y = h - K * 0.15 - f * (h + K * 0.2);
const x = bx + Math.sin(f * 9 + j) * K * 0.06;
const r = K * (0.025 + 0.025 * f) * (j % 3 === 0 ? 1.4 : 1);
B.add([x - r, y - r, x + r, y + r], strokeP(bubbleC, Math.max(1, u * 0.8), dark ? 0.6 : 0.55), dotD(x, y, r), 6);
B.dot(x - r * 0.35, y - r * 0.35, Math.max(0.6, r * 0.25), fillP(bubbleC, 0.7), 6);
}
}
const age = ctx.pressed ? 0 : ctx.pressAge;
const pk = ctx.pressKey !== null ? cells.find((c) => c.i === ctx.pressKey) : null;
const pull = age < 8 ? smoothstep(0.3, 2.2, age) * (1 - smoothstep(5.5, 8, age)) : 0;
let food = null;
if (age < 8) {
const c = pk || cells[Math.floor(cells.length / 2)];
food = { x: c.x + c.w / 2, y: Math.min(h - K * 0.3, c.y + c.h * 0.2 + age * K * 0.16) };
const fade = 1 - smoothstep(4.5, 7, age);
const fc = flat ? lit(T) : sp(40, { dl: dark ? 0.04 : -0.06 });
let d = '';
for (let j = 0; j < 6; j++) {
const fx = food.x + (hash(j, 31) - 0.5) * K * 0.5 + Math.sin(age * 1.5 + j) * K * 0.04, fy = food.y + (hash(j, 32) - 0.3) * K * 0.3;
const s = K * 0.022;
d += polyD([[fx - s, fy], [fx, fy - s], [fx + s, fy], [fx, fy + s]]);
}
if (fade > 0.02) B.add([food.x - K * 0.4, food.y - K * 0.3, food.x + K * 0.4, food.y + K * 0.4], fillP(fc, fade), d, 7);
}
const KINDS = ['tetra', 'gold', 'tetra', 'angel', 'school', 'tetra', 'gold', 'school', 'angel'];
for (let i = 0; i < nFish; i++) {
const kind = KINDS[i % KINDS.length];
const m = 1 + (i % 2); 
const dir = i % 2 ? -1 : 1;
const size = K * (kind === 'school' ? 0.26 : kind === 'angel' ? 0.62 : kind === 'gold' ? 0.58 : 0.42);
const margin = size * 1.2;
const pos = (tt) => {
const f = (((tt / LOOP) * m + hash(i, ctx.seed, 41)) % 1 + 1) % 1;
const x = dir > 0 ? -margin + f * (w + margin * 2) : w + margin - f * (w + margin * 2);
const y = h * (0.12 + 0.6 * hash(i, ctx.seed, 42)) + Math.sin((tt / LOOP) * TAU * 2 + i) * K * 0.18;
if (!food || pull <= 0) return [x, y];
const ang = i * 2.4, rr = K * (0.3 + 0.12 * (i % 3));
const tx = food.x + Math.cos(ang + tt * 0.6) * rr, ty = food.y + Math.sin(ang + tt * 0.6) * rr * 0.6;
return [lerp(x, tx, pull), lerp(y, ty, pull)];
};
const [x, y] = pos(t), [xp] = pos(t - 0.4);
const face = Math.abs(x - xp) > 0.5 ? Math.sign(x - xp) : dir;
const wag = Math.sin(t * 7 + i * 2);
const members = kind === 'school' ? [[0, 0], [-0.9, -0.55], [-1.1, 0.6], [-2, 0.05], [0.4, 0.9]] : [[0, 0]];
for (const [mx, my] of members) {
const ox = x + mx * size * face, oy = y + my * size * 0.8;
const S = fishShape(kind, wag);
const P = (pts) => pts.map(([lx, ly]) => [ox + lx * size * face, oy + ly * size]);
const bodyC = flat ? lit(T) : kind === 'gold' ? sp(52, { dl: dark ? 0.02 : -0.04 }) : kind === 'angel' ? (dark ? mix('#ffffff', sp(80), 0.15) : mix(T.colors.ink, sp(250), 0.3)) : kind === 'school' ? (dark ? mix('#ffffff', sp(210), 0.4) : mix(T.colors.ink, sp(210), 0.4)) : sp(215, { dl: dark ? 0.06 : -0.02 });
const tailC = flat ? bodyC : kind === 'tetra' ? sp(22) : kind === 'gold' ? sp(40, { dl: dark ? 0.08 : 0 }) : bodyC;
const body = P(S.body), tail = P(S.tail);
B.poly(tail, fillP(tailC, kind === 'gold' ? 0.8 : 0.9), 10);
for (const fin of S.fins) B.poly(P(fin), fillP(tailC, 0.75), 10);
B.poly(body, fillP(bodyC, flat && !dark ? 1 : 1), 11);
if (kind === 'tetra' && !flat) B.poly(P([[0.2, 0.02], [-0.24, 0.02], [-0.26, 0.11], [0.12, 0.12]]), fillP(sp(20, { dl: dark ? 0.04 : 0 }), 0.95), 12);
if (kind === 'angel') {
const bar = flat ? (dark ? '#000000' : '#ffffff') : dark ? mix(T.colors.bg, sp(260), 0.3) : mix(T.colors.surface, sp(60), 0.3);
B.poly(P([[0.16, -0.3], [0.08, -0.3], [0.08, 0.3], [0.16, 0.28]]), fillP(bar, 0.85), 12);
B.poly(P([[-0.06, -0.33], [-0.14, -0.3], [-0.14, 0.3], [-0.06, 0.33]]), fillP(bar, 0.85), 12);
}
const [ex, ey] = P([[0.34, -0.03]])[0];
const er = Math.max(0.9, size * (kind === 'school' ? 0.04 : 0.035));
B.dot(ex, ey, er, fillP(dark ? '#000000' : flat ? '#ffffff' : T.colors.ink, 1), 13);
if (dark && size > K * 0.3) B.dot(ex + er * 0.3 * face, ey - er * 0.3, Math.max(0.5, er * 0.35), fillP('#ffffff', 0.9), 14);
}
}
B.emit(k);
return k.svg();
},
};
};
__d[226] = function (__ns) {
const { surface, rect, radialGradient, linearGradient, url, n } = __m(113);
const { clamp } = __m(12);
const { noise1, hash } = __m(1);
const { BUDGET, frameClock, materials } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 24, TAU = Math.PI * 2;
function arc(k, { cx, cy, px, py, color, peak, at = 0.82, spread = 0.12, id }) {
const R = Math.hypot(px - cx, py - cy), r = R / at;
const gid = k.id(id);
k.def(radialGradient(gid, [[0, color, 0], [Math.max(0, at - 0.012), color, 0], [at, color, n(peak, 3)], [Math.min(1, at + spread * 0.3), color, n(peak * 0.42, 3)], [Math.min(1, at + spread), color, 0], [1, color, 0]], { cx: n(cx), cy: n(cy), r: n(r), fx: n(cx), fy: n(cy), gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ width: n(k.w), height: n(k.h), fill: url(gid) }));
return { cx, cy, R };
}
const __default = {
id: 'span-aurora',
title: 'Aurora',
category: 'Whole Device',
description: 'The northern lights across the whole device: soft arcs of mint and violet cross the keys, ray curtains shimmer beneath them, stars twinkle, all on long seamless drifts.',
tags: ['aurora', 'northern-lights', 'sky', 'ambient', 'wall', 'calm', 'gradient', 'screensaver'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 6,
loop: LOOP,
params: {
intensity: { type: 'number', default: 1, min: 0.3, max: 1.6, step: 0.05, label: 'Intensity' },
budget: BUDGET,
},
order: 12,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const { t } = frameClock(ctx, { fps: 6, changing: grid.cells.length, still: 7 });
materials(k, { tone: 'off' });
const dark = T.dark, I = ctx.params.intensity * (dark ? 1 : 0.85);
const p = (t / LOOP) * TAU;
const mint = T.spectral(160, { dl: dark ? 0.06 : 0 }), teal = T.spectral(195), violet = T.spectral(300, { dl: dark ? 0.03 : 0 }), rose = T.spectral(345);
if (dark) {
const sky = k.id('sky');
k.def(linearGradient(sky, [[0, '#02030a', 0.55], [0.7, '#050a18', 0.35], [1, '#0a1626', 0.2]], { x1: 0, y1: 0, x2: 0, y2: h, gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ width: n(w), height: n(h), fill: url(sky) }));
for (const c of grid.cells) {
let d = '';
const count = 3 + Math.floor(hash(c.i, 9) * 3);
for (let j = 0; j < count; j++) {
const sx = c.x + c.w * (0.08 + 0.84 * hash(c.i, j, 1)), sy = c.y + c.h * (0.06 + 0.6 * hash(c.i, j, 2));
const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p * (1 + (j % 3)) + hash(c.i, j, 3) * 6));
const r = k.m.u * (0.45 + 0.5 * hash(c.i, j, 4)) * (0.7 + 0.3 * tw);
d += `M${n(sx - r)} ${n(sy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
}
k.add(`<path d="${d}" fill="#ffffff" fill-opacity="0.7"/>`);
}
}
const dx = Math.sin(p) * w * 0.05, dy = Math.cos(p) * h * 0.06;
arc(k, { id: 'a2', cx: w * 0.95 - dx, cy: h * 1.6 + w * 0.4, px: w * 0.42 + dx * 0.5, py: h * 0.16 + dy * 0.6, color: violet, peak: 0.42 * I, at: 0.84, spread: 0.13 });
const main = arc(k, { id: 'a1', cx: -w * 0.1 + dx, cy: h * 1.4 + w * 0.32, px: w * 0.55 - dx * 0.4, py: h * 0.46 + dy, color: mint, peak: 0.66 * I, at: 0.86, spread: 0.11 });
arc(k, { id: 'a1f', cx: main.cx, cy: main.cy, px: w * 0.55 - dx * 0.4, py: h * 0.46 + dy, color: dark ? '#e9fff6' : mint, peak: (dark ? 0.32 : 0.22) * I, at: 0.86, spread: 0.018 });
arc(k, { id: 'a3', cx: w * 0.3 - dx * 0.6, cy: h * 1.5 + w * 0.36, px: w * 0.7, py: h * 0.7 - dy * 0.5, color: teal, peak: 0.3 * I, at: 0.9, spread: 0.1 });
const rid = k.id('ray');
k.def(linearGradient(rid, [[0, mint, 0], [0.7, mint, n(0.22 * I, 3)], [1, rose, 0]]));
const rays = Math.max(8, grid.cols * 5);
for (let i = 0; i < rays; i++) {
const fx = (i + 0.5 + (hash(i, 7) - 0.5) * 0.8) / rays;
const x = fx * w;
const ddx = x - main.cx;
if (Math.abs(ddx) >= main.R) continue;
const yHem = main.cy - Math.sqrt(main.R * main.R - ddx * ddx);
const len = h * (0.22 + 0.3 * hash(i, 8));
const sh = clamp(0.25 + 0.75 * noise1(t * 0.35 + i * 1.37, ctx.seed));
const rw = Math.max(1.5, (w / rays) * (0.22 + 0.3 * hash(i, 9)));
if (yHem - len > h || yHem < 0) continue;
k.add(rect({ x: n(x - rw * 1.2), y: n(yHem - len * 0.9), width: n(rw * 2.4), height: n(len * 0.98), fill: url(rid), fillOpacity: n(sh * 0.32, 3) }));
k.add(rect({ x: n(x - rw * 0.35), y: n(yHem - len), width: n(rw * 0.7), height: n(len * 1.06), fill: url(rid), fillOpacity: n(sh * 0.75, 3) }));
}
const hz = k.id('hz');
k.def(radialGradient(hz, [[0, teal, n(0.22 * I, 3)], [0.6, teal, n(0.06 * I, 3)], [1, teal, 0]], { cx: 0.5 + Math.sin(p) * 0.15, cy: 1.15, r: 0.65 }));
k.add(rect({ width: n(w), height: n(h), fill: url(hz) }));
return k.svg();
},
};
};
__d[227] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, isoPaths, rectD, f1 } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 20, TAU = Math.PI * 2;
const __default = {
id: 'span-caustics',
title: 'Caustics',
category: 'Ripples & Light',
description: 'The floor of a sunlit pool across the device: a net of wavering light lines drifts over the tiles and lane stripe, running on across the bezels; lamp-lit by night.',
tags: ['caustics', 'pool', 'water', 'light', 'summer', 'underwater', 'calm', 'ambient', 'wall'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 4,
loop: LOOP,
params: {
scale: { type: 'number', default: 1, min: 0.6, max: 1.6, step: 0.05, label: 'Pattern size' },
tiles: { type: 'bool', default: true, label: 'Tiles and lane' },
budget: BUDGET,
},
order: 47,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 8 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const sp = (hh, o) => T.spectral(hh, o);
const water0 = flat ? (dark ? '#000000' : '#ffffff') : dark ? mix(T.colors.bg, sp(195), 0.3) : mix(sp(195), '#ffffff', 0.35);
const water1 = flat ? water0 : dark ? mix(T.colors.bg, sp(215), 0.22) : mix(sp(205), '#ffffff', 0.12);
backdrop(k, [[0, water0, 0.95], [1, water1, 0.95]], { x2: w * 0.4, y2: h });
if (dark && !flat) {
const gl = k.id('lamp'), lc = sp(185, { dl: 0.08 });
k.def(radialGradient(gl, [[0, lc, 0.3], [0.5, lc, 0.1], [1, lc, 0]], { cx: f1(w * 0.5), cy: f1(h + K * 0.2), r: f1(Math.max(w, h) * 0.8), fx: f1(w * 0.5), fy: f1(h + K * 0.2), gradientUnits: 'userSpaceOnUse' }));
for (const c of cells) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${url(gl)}"/>`);
}
const B = new Batch(grid);
if (ctx.params.tiles) {
const ts = K / 3.2;
const grout = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(200), 0.45) : mix(sp(205), '#ffffff', 0.55);
const wide = w > h;
const lane = flat ? grout : dark ? mix(T.colors.bg, sp(240), 0.3) : mix(sp(250), T.colors.ink, 0.35);
const mid = cells.reduce((b, c) => (Math.hypot(c.x + c.w / 2 - w / 2, c.y + c.h / 2 - h / 2) < Math.hypot(b.x + b.w / 2 - w / 2, b.y + b.h / 2 - h / 2) ? c : b), cells[0]);
const lx = wide ? null : mid.x + mid.w / 2, ly = wide ? mid.y + mid.h / 2 : null, lw = K * 0.34;
for (const c of cells) {
let d = '';
for (let x = Math.ceil(c.x / ts) * ts; x < c.x + c.w; x += ts) d += `M${f1(x)} ${f1(c.y)}v${f1(c.h)}`;
for (let y = Math.ceil(c.y / ts) * ts; y < c.y + c.h; y += ts) d += `M${f1(c.x)} ${f1(y)}h${f1(c.w)}`;
B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(grout, Math.max(0.8, u * 0.7), flat ? 0.18 : dark ? 0.4 : 0.5, 'butt'), d, 0);
const x0 = wide ? c.x : Math.max(c.x, lx - lw / 2), x1 = wide ? c.x + c.w : Math.min(c.x + c.w, lx + lw / 2);
const y0 = wide ? Math.max(c.y, ly - lw / 2) : c.y, y1 = wide ? Math.min(c.y + c.h, ly + lw / 2) : c.y + c.h;
if (x1 > x0 && y1 > y0) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(lane, flat ? 0.3 : dark ? 0.7 : 0.55), rectD(x0, y0, x1 - x0, y1 - y0), 1);
}
}
const S = K * 0.42 * ctx.params.scale, a = (t / LOOP) * TAU;
const site = (i, j) => {
const ph = hash(i, j, ctx.seed) * TAU, rr = 0.22 + 0.12 * hash(i, j, 5), m = 1 + Math.floor(hash(i, j, 6) * 2);
return [(i + 0.5 + 0.3 * (hash(i, j, 7) - 0.5) + rr * Math.cos(a * m + ph)) * S, (j + 0.5 + 0.3 * (hash(i, j, 8) - 0.5) + rr * Math.sin(a * m + ph)) * S];
};
const sites = new Map();
const siteAt = (i, j) => { const key = i * 4096 + j; let p = sites.get(key); if (!p) { p = site(i, j); sites.set(key, p); } return p; };
const field = (x, y) => {
const wx = x + Math.sin(y / S * 2.1 + a) * S * 0.08, wy = y + Math.cos(x / S * 1.9 - a) * S * 0.08;
const ci = Math.floor(wx / S), cj = Math.floor(wy / S);
let d1 = Infinity, d2 = Infinity;
for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
const [px, py] = siteAt(ci + di, cj + dj);
const ex = wx - px, ey = wy - py, dd = ex * ex + ey * ey;
if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
}
return -(Math.sqrt(d2) - Math.sqrt(d1)); 
};
const light = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(sp(185, { dl: 0.1 }), '#ffffff', 0.45) : '#ffffff';
const step = Math.max(2.5, K / 34);
for (const c of cells) {
const r = { x: c.x - step, y: c.y - step, w: c.w + step * 2, h: c.h + step * 2 };
const [soft, core] = isoPaths(field, r, step, [-K * 0.055, -K * 0.02]);
const box = [c.x, c.y, c.x + c.w, c.y + c.h];
B.add(box, fillP(light, dark ? 0.16 : 0.26, 'evenodd'), soft, 2);
B.add(box, fillP(light, dark ? 0.55 : 0.85, 'evenodd'), core, 3);
}
B.emit(k);
return k.svg();
},
};
};
__d[228] = function (__ns) {
const { surface, circle, n } = __m(113);
const { clamp, outExpo } = __m(12);
const { measureText } = __m(11);
const { materials, inCell, middleRow, rowCells } = __m(201);
const { text, strHash } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const TURN = 4, IN = 0.7;
const CHAT = [
['nova_k', 'that transition was so clean'],
['pixelmoth', 'first time here and loving the vibes'],
['dr_lumen', 'can you show the settings again?'],
['quietfox', 'hydrate check, everyone'],
['atlas.v', 'GG that was close'],
['mira_codes', '@you what keyboard is that?'],
['ember77', 'the new overlay looks great'],
['tess', 'just joined, hi everyone'],
['bytewren', 'the cat cameo was perfect'],
['solstice', 'can we get a replay of that?'],
['kitekid', 'been here since the start, keep it up'],
['owlbert', '@you how long have you been live?'],
];
function flow(words, keys, lines, room, opts) {
const slots = Array.from({ length: keys }, () => []);
let k = 0, cur = '';
const fits = (s) => measureText(s, opts) <= room;
for (let wi = 0; wi < words.length && k < keys; wi++) {
const w = words[wi];
const next = cur ? `${cur} ${w}` : w;
if (fits(next)) { cur = next; continue; }
if (cur) { slots[k].push(cur); cur = ''; if (slots[k].length >= lines) k++; }
if (k >= keys) break;
cur = w; 
}
if (cur && k < keys) slots[k].push(cur);
return slots;
}
const __default = {
id: 'span-chat-ticker',
title: 'Chat Ticker',
category: 'Text & Marquee',
description: 'Chat across a row of keys: the speaker on the first key, the message flowing word by word through the rest — never cut by a bezel. Mentions light up.',
tags: ['chat', 'ticker', 'messages', 'stream', 'creator', 'community', 'marquee', 'span'],
surface: 'span',
span: { cols: 'all', rows: 1 },
fps: 10,
loop: TURN * CHAT.length,
params: {
messages: { type: 'text', default: '', maxLength: 48, label: 'Messages (name: text | …; blank = demo chat)' },
you: { type: 'text', default: '@you', maxLength: 16, label: 'Your handle (highlights mentions)' },
},
order: 25,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const cells = rowCells(grid, middleRow(grid));
const custom = String(ctx.params.messages || '').split('|').map((s) => s.split(':')).filter((p) => p.length > 1 && p[1].trim()).map(([a, ...b]) => [a.trim(), b.join(':').trim()]);
const list = custom.length ? custom : CHAT;
const turn = ctx.reduced ? 5 : Math.floor(ctx.t / TURN);
const into = ctx.reduced ? 9 : ctx.t - Math.floor(ctx.t / TURN) * TURN;
const [name, msg] = list[((turn % list.length) + list.length) % list.length];
const mention = ctx.params.you && msg.toLowerCase().includes(String(ctx.params.you).toLowerCase());
const hue = (strHash(name) % 360);
materials(k, { toneOf: (c) => (c === cells[0] && mention ? 'active' : 'idle') });
const u = Math.min(grid.key.w, grid.key.h) / 72;
const base = (Math.min(grid.key.w, grid.key.h) >= 110 ? 12.5 : 11) * u;
const room = grid.key.w - 8 * u * 1.6;
const words = msg.split(/\s+/).filter(Boolean);
let slots, size, lines;
for (const [L, z] of [[2, 1.06], [3, 0.86], [4, 0.74]]) {
size = base * z; lines = L;
slots = flow(words, Math.max(1, cells.length - 1), L, room, { size, weight: 600 });
if (slots.flat().join(' ').split(' ').filter(Boolean).length >= words.length) break;
}
const lineH = size * 1.3;
cells.forEach((cell, i) => {
inCell(k, cell, (kk) => {
const ku = kk.m.u;
const delay = i * 0.07;
const a = clamp((into - delay) / (IN - 0.2));
const e = outExpo(a);
const lift = (1 - e) * 6 * ku;
if (i === 0) {
const r = Math.min(kk.w, kk.h) * 0.2;
const cx = kk.w / 2, cy = kk.h * 0.4 + lift;
const col = T.spectral(hue), deep = T.spectral(hue, { tier: 'ink' });
kk.add(circle({ cx: n(cx), cy: n(cy), r: n(r * (0.6 + 0.4 * e)), fill: kk.dark ? col : deep, fillOpacity: n(e, 3) }));
text(kk, name[0].toUpperCase(), { x: cx, cy, size: r * 1.05, weight: 700, color: kk.dark ? '#000000' : '#ffffff', opacity: e });
text(kk, name, { x: cx, y: kk.h - kk.m.safe - 3.5 * ku, size: 9 * ku, weight: 700, color: kk.dark ? col : deep, maxWidth: kk.w - kk.m.text * 1.6, minSize: 7 * ku, opacity: Math.max(0.2, e) });
if (mention) kk.eyebrow('@', { color: 'ink' });
return;
}
const s = slots[i - 1] || [];
if (!s.length) return;
const block = s.length * lineH;
const top = (kk.h - block) / 2 + size * 0.95 + lift;
s.forEach((ln, li) => {
const isMention = mention && ln.toLowerCase().includes(String(ctx.params.you).toLowerCase());
text(kk, ln, { x: kk.m.text * 0.8, y: top + li * lineH, size, weight: 600, anchor: 'start', color: isMention ? (kk.dark ? T.spectral(ctx.hue) : T.spectral(ctx.hue, { tier: 'ink' })) : 'ink', maxWidth: kk.w - kk.m.text * 1.6, minSize: size * 0.7, opacity: Math.max(0.05, e) });
});
}, `ct${cell.i}`);
});
return k.svg();
},
};
};
__d[229] = function (__ns) {
const { surface, rect, circle, linearGradient, url } = __m(113);
const { clamp, outExpo, lerp } = __m(12);
const { pad2 } = __m(11);
const { BUDGET, frameClock, materials, inCell, middleRow, rowCells, half } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function plan(nKeys) {
const D = (field, place) => ({ kind: 'd', field, place });
let slots;
if (nKeys >= 8) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1), { kind: 'colon' }, D('s', 0), D('s', 1)];
else if (nKeys >= 5) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1)];
else if (nKeys === 4) slots = [D('h', 0), { ...D('h', 1), dotsRight: true }, { ...D('m', 0), dotsLeft: true }, D('m', 1)];
else slots = [{ kind: 'pair', field: 'h' }, { kind: 'pair', field: 'm' }, { kind: 'pair', field: 's' }].slice(0, Math.max(1, nKeys));
const lead = Math.floor((nKeys - slots.length) / 2);
return Array.from({ length: nKeys }, (_, i) => slots[i - lead] || null);
}
const __default = {
id: 'span-clock',
title: 'Clock Across Keys',
category: 'Text & Marquee',
description: 'The time across a row of keys, one digit per key: changing digits refract into place, the colon blinks, a Beam sweeps the row once a minute.',
tags: ['clock', 'time', 'digits', 'seconds', 'span', 'desk'],
surface: 'span',
span: { cols: 'all', rows: 1 },
data: ['clock'],
fps: 4,
loop: 60,
params: {
hours: { type: 'select', default: '24', options: ['24', '12'], label: 'Hours' },
hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
budget: BUDGET,
},
order: 21,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const row = middleRow(grid);
const cells = rowCells(grid, row);
const { t } = frameClock(ctx, { fps: 4, changing: 3, still: 0 });
materials(k);
const c0 = ctx.clock;
const back = (ctx.t - t); 
let sec = c0.h * 3600 + c0.m * 60 + c0.s + c0.ms / 1000 - back;
sec = ((sec % 86400) + 86400) % 86400;
const H24 = Math.floor(sec / 3600), M = Math.floor((sec % 3600) / 60), S = Math.floor(sec % 60), frac = sec % 1;
const H = ctx.params.hours === '12' ? ((H24 + 11) % 12) + 1 : H24;
const fields = { h: ctx.params.hours === '12' ? String(H).padStart(2, ' ') : pad2(H), m: pad2(M), s: pad2(S) };
const age = {
s1: frac, s0: (S % 10) + frac, m1: S + frac, m0: (M % 10) * 60 + S + frac,
h1: M * 60 + S + frac, h0: (H24 % 10) * 3600 + M * 60 + S + frac,
};
const ink = T.colors.ink, hue = ctx.hue;
const slots = plan(cells.length);
cells.forEach((cell, i) => {
const slot = slots[i];
if (!slot) return;
inCell(k, cell, (kk) => {
const size = kk.h * (slot.kind === 'pair' ? 0.5 : 0.74);
const cy = kk.h * 0.48;
if (slot.kind === 'colon') {
const on = ctx.reduced || frac < 0.5;
const r = Math.max(2, kk.h * 0.045);
for (const dy of [-0.13, 0.13]) kk.add(circle({ cx: kk.w / 2, cy: half(cy + dy * kk.h), r, fill: T.dark ? ink : T.ink(hue), fillOpacity: on ? 1 : 0.28 }));
return;
}
const str = slot.kind === 'pair' ? fields[slot.field] : fields[slot.field][slot.place];
const a = slot.kind === 'pair' ? age[`${slot.field}1`] : age[`${slot.field}${slot.place}`];
const e = ctx.reduced ? 1 : outExpo(clamp(a / 0.5));
if (e < 0.999) {
const off = (1 - e) * kk.w * 0.07;
kk.hero(str, { size, cy, x: kk.w / 2 - off, color: T.spectral(296), opacity: 0.75 * (1 - e) });
kk.hero(str, { size, cy, x: kk.w / 2 + off, color: T.spectral(30), opacity: 0.75 * (1 - e) });
}
kk.hero(str, { size, cy, opacity: lerp(0.35, 1, e) });
if (slot.dotsRight || slot.dotsLeft) {
const r = Math.max(2, kk.h * 0.04), x = slot.dotsRight ? kk.w - kk.m.safe * 0.9 : kk.m.safe * 0.9;
for (const dy of [-0.13, 0.13]) kk.add(circle({ cx: x, cy: half(cy + dy * kk.h), r, fill: ink, fillOpacity: frac < 0.5 || ctx.reduced ? 0.9 : 0.25 }));
}
if (slot.kind === 'pair' && slot.field === 'h' && ctx.params.hours === '12') kk.eyebrow(H24 < 12 ? 'AM' : 'PM', { align: 'right', x: kk.w - kk.m.text, color: 'muted' });
}, `d${cell.i}`);
});
const by = cells[0].y + grid.key.h - k.m.safe * 1.15;
const x0 = cells[0].x + k.m.safe, x1 = cells[cells.length - 1].x + grid.key.w - k.m.safe;
const head = lerp(x0, x1, (S + frac) / 60);
const beamC = T.colors.beam || '#ffffff';
const gid = k.id('run');
k.def(linearGradient(gid, [[0, T.spectral(hue + 60), 0.2], [0.85, T.spectral(hue), 0.9], [1, beamC, 1]], { x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' }));
const lw = Math.max(1, Math.round(k.m.hair * 1.5));
for (const c of cells) {
const a = Math.max(c.x + k.m.safe, x0), b = Math.min(c.x + c.w - k.m.safe, x1);
if (b <= a) continue;
k.add(rect({ x: a, y: by, width: b - a, height: lw, fill: T.colors.line, fillOpacity: T.dark ? 0.9 : 1 }));
const lit = Math.min(b, head) - a;
if (lit > 0.5) k.add(rect({ x: a, y: by, width: half(lit), height: lw, fill: url(gid) }));
if (head >= a && head <= b) k.add(circle({ cx: half(head), cy: by + lw / 2, r: lw * 1.8, fill: T.dark ? beamC : T.ink(hue) }));
}
if (grid.rows > 1 && row + 1 < grid.row + grid.rows) {
const below = rowCells(grid, row + 1);
const lead = below[Math.floor((below.length - 1) / 2)];
inCell(k, lead, (kk) => {
kk.value(String(c0.day), { cy: kk.h * 0.42 });
kk.label(`${DOW[c0.dow]} ${MON[c0.month - 1]}`, { color: 'muted' });
}, `date${lead.i}`);
}
return k.svg();
},
};
};
__d[230] = function (__ns) {
const { surface } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep, outCubic } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, inCell, isFlat, starD, dotD, lit } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SKY = [
{ name: 'Orion', sub: 'The Hunter', stars: [[0.28, 0.2, 0.5], [0.66, 0.24, 1.6], [0.47, 0.06, 3.4], [0.41, 0.52, 1.8], [0.5, 0.49, 1.7], [0.59, 0.46, 2.2], [0.32, 0.88, 2.1], [0.74, 0.84, 0.2], [0.49, 0.64, 3.6]],
lines: [[2, 0], [2, 1], [0, 3], [1, 5], [3, 4], [4, 5], [3, 6], [5, 7], [4, 8]] },
{ name: 'Cassiopeia', sub: 'The Queen', stars: [[0.04, 0.32, 2.3], [0.27, 0.72, 2.2], [0.5, 0.42, 2.1], [0.73, 0.7, 2.7], [0.96, 0.28, 3.4]],
lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
{ name: 'The Plough', sub: 'Ursa Major', stars: [[0.02, 0.22, 1.9], [0.19, 0.28, 2.2], [0.34, 0.37, 1.8], [0.48, 0.47, 3.3], [0.53, 0.8, 2.4], [0.88, 0.86, 2.4], [0.93, 0.5, 1.8]],
lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
{ name: 'Cygnus', sub: 'The Swan', stars: [[0.5, 0.04, 1.3], [0.5, 0.4, 2.2], [0.5, 0.96, 3.1], [0.12, 0.3, 2.5], [0.3, 0.36, 2.9], [0.71, 0.46, 2.5], [0.9, 0.56, 3.2], [0.5, 0.66, 3.9]],
lines: [[0, 1], [1, 7], [7, 2], [3, 4], [4, 1], [1, 5], [5, 6]] },
{ name: 'Leo', sub: 'The Lion', stars: [[0.2, 0.72, 1.4], [0.22, 0.48, 3.5], [0.3, 0.3, 2.0], [0.2, 0.12, 3.4], [0.05, 0.16, 3.0], [0.62, 0.42, 2.6], [0.95, 0.66, 2.1], [0.62, 0.7, 3.3]],
lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 7], [7, 0]] },
{ name: 'Scorpius', sub: 'The Scorpion', stars: [[0.08, 0.1, 2.6], [0.12, 0.26, 2.3], [0.18, 0.4, 2.9], [0.3, 0.36, 1.0], [0.42, 0.42, 2.8], [0.5, 0.58, 2.3], [0.52, 0.76, 3.0], [0.64, 0.9, 2.4], [0.82, 0.92, 1.9], [0.94, 0.8, 1.6], [0.9, 0.68, 2.7]],
lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]] },
];
const ACT = 12; 
const LOOP = ACT * SKY.length;
const __default = {
id: 'span-constellation',
title: 'Constellations',
category: 'Ripples & Light',
description: 'Constellations draw themselves across the device: stars brighten, a hairline of light joins them across the bezels, the name appears, then the next figure begins.',
tags: ['constellation', 'stars', 'night', 'sky', 'astronomy', 'chart', 'ambient', 'wall', 'calm'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 8,
loop: LOOP,
params: {
labels: { type: 'bool', default: true, label: 'Names' },
hue: { type: 'hue', default: 215, min: 0, max: 360, step: 1, label: 'Line hue' },
budget: BUDGET,
},
order: 45,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 8, changing: Math.min(cells.length, 3 + Math.ceil(cells.length / 12)), still: 6 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const ink = lit(T);
const sky0 = dark ? mix(T.colors.bg, T.spectral(250), flat ? 0 : 0.1) : T.colors.surface;
const sky1 = dark ? mix(T.colors.bg, T.spectral(280), flat ? 0 : 0.16) : mix(T.colors.surface, T.spectral(220), flat ? 0 : 0.08);
backdrop(k, [[0, sky0, dark ? 0.9 : 0.7], [1, sky1, dark ? 0.9 : 0.7]], { x2: w, y2: h });
const B = new Batch(grid);
if (!dark) {
const gs = K / 2;
for (const c of cells) {
let d = '';
for (let x = Math.ceil(c.x / gs) * gs; x < c.x + c.w; x += gs) d += `M${x.toFixed(1)} ${c.y.toFixed(1)}v${c.h.toFixed(1)}`;
for (let y = Math.ceil(c.y / gs) * gs; y < c.y + c.h; y += gs) d += `M${c.x.toFixed(1)} ${y.toFixed(1)}h${c.w.toFixed(1)}`;
B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(flat ? T.colors.ink : mix(T.colors.ink, T.spectral(220), 0.5), Math.max(0.6, u * 0.5), flat ? 0.15 : 0.12, 'butt'), d, 0);
}
}
for (const c of cells) {
let d = '';
const nst = 5 + Math.floor(hash(c.i, 1) * 5);
for (let j = 0; j < nst; j++) d += dotD(c.x + c.w * hash(c.i, j, 2), c.y + c.h * hash(c.i, j, 3), Math.max(0.8, u * (0.4 + 0.55 * hash(c.i, j, 4) ** 3)));
B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(ink, dark ? 0.5 : 0.36), d, 1);
}
const ts = t + 2.4;
const act = Math.floor(ts / ACT) % SKY.length, at = ts - Math.floor(ts / ACT) * ACT;
const C = SKY[act];
const xs = C.stars.map((s) => s[0]), ys = C.stars.map((s) => s[1]);
const fw = Math.max(...xs) - Math.min(...xs), fh = Math.max(...ys) - Math.min(...ys);
const turn = (w < h) !== (fw < fh) && Math.abs(fw / fh - 1) > 0.25 && Math.abs(w / h - 1) > 0.25;
const pts = C.stars.map(([x, y]) => (turn ? [1 - y, x] : [x, y]));
const mx = K * 0.32, my = K * 0.32;
const X0 = Math.min(...pts.map((p) => p[0])), X1 = Math.max(...pts.map((p) => p[0])), Y0 = Math.min(...pts.map((p) => p[1])), Y1 = Math.max(...pts.map((p) => p[1]));
const sx = (w - mx * 2) / Math.max(0.01, X1 - X0), sy = (h - my * 2) / Math.max(0.01, Y1 - Y0);
const sc = Math.min(sx, sy, Math.max(sx, sy) * 0.62); 
const ox = (w - (X1 - X0) * sc) / 2 - X0 * sc, oy = (h - (Y1 - Y0) * sc) / 2 - Y0 * sc;
const stars = pts.map(([x, y], i) => {
let px = ox + x * sc, py = oy + y * sc;
let best = null, bd = Infinity;
for (const c of cells) {
const qx = clamp(px, c.x + c.w * 0.16, c.x + c.w * 0.84), qy = clamp(py, c.y + c.h * 0.16, c.y + c.h * 0.84);
const dd = Math.hypot(qx - px, qy - py);
if (dd < bd) { bd = dd; best = [qx, qy]; }
}
[px, py] = best;
return { x: px, y: py, mag: C.stars[i][2] };
});
const nS = stars.length, nL = C.lines.length;
const tStars = 0.4, perStar = 1.6 / nS, tLines = 2.2, perLine = 4.2 / nL, tHold = tLines + 4.2, tFade = 9.4, tEnd = 11.2;
const fade = 1 - smoothstep(tFade, tEnd, at);
const lineC = flat ? ink : T.spectral(ctx.params.hue, { dl: dark ? 0.04 : -0.04 });
const lw = Math.max(1, u * 0.9);
for (let j = 0; j < nL; j++) {
const f = clamp((at - tLines - j * perLine) / perLine);
if (f <= 0) continue;
const [ia, ib] = C.lines[j], a = stars[ia], b = stars[ib];
const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
const gap = K * 0.07;
const e = outCubic(f), len = Math.max(0, (L - gap * 2) * e);
if (len <= 0.5) continue;
const x0 = a.x + ux * gap, y0 = a.y + uy * gap, x1 = x0 + ux * len, y1 = y0 + uy * len;
const op = fade * (dark ? 0.85 : 0.9);
if (op <= 0.02) continue;
if (dark) B.seg(x0, y0, x1, y1, lw * 3.5, strokeP(lineC, lw * 3.5, 0.12 * fade), 2);
B.seg(x0, y0, x1, y1, lw, strokeP(lineC, lw, op), 3);
if (f < 1) B.dot(x1, y1, lw * 1.6, fillP(dark ? '#ffffff' : lineC, fade), 5); 
}
for (let i = 0; i < nS; i++) {
const s = stars[i];
const on = smoothstep(0, 0.35, at - tStars - i * perStar) * fade;
if (on <= 0.02) continue;
const r = Math.max(1.2, K * (0.05 - s.mag * 0.008));
const q = Math.round(on * 5) / 5;
if (dark) B.dot(s.x, s.y, r * 3.2, fillP(lineC, 0.14 * q), 4);
B.dot(s.x, s.y, r, fillP(ink, q), 6);
if (s.mag < 1) B.add([s.x - r * 3, s.y - r * 3, s.x + r * 3, s.y + r * 3], fillP(ink, 0.7 * q), starD(s.x, s.y, r * 3, 0.12), 6);
}
B.emit(k);
if (ctx.params.labels) {
const lo = smoothstep(tHold - 0.6, tHold, at) * fade;
if (lo > 0.02) {
const cx = stars.reduce((s, p) => s + p.x, 0) / nS, cy = stars.reduce((s, p) => s + p.y, 0) / nS;
let best = cells[0], score = -Infinity;
for (const c of cells) {
const inside = stars.filter((s) => s.x >= c.x && s.x <= c.x + c.w && s.y >= c.y + c.h * 0.55 && s.y <= c.y + c.h).length;
const sc2 = -inside * 10 - Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy) / K;
if (sc2 > score) { score = sc2; best = c; }
}
const q = Math.round(lo * 4) / 4;
inCell(k, best, (kk) => {
const room = kk.w - kk.m.text * 2, sub = kk.w >= 96;
const name = kk.w < 100 && C.name.length > 9 ? C.name.split(' ').pop() : C.name;
kk.label(name, { y: sub ? kk.h - kk.m.u * 18 : undefined, opacity: q, maxWidth: room });
if (sub) kk.eyebrow(C.sub, { y: kk.h - kk.m.u * 7.5, align: 'center', opacity: q * 0.85, color: 'muted', maxWidth: room });
}, 'name');
}
}
return k.svg();
},
};
};
__d[231] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, lerp, smoothstep } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, lit, dotD, ellipseD, polyD, clipPoly, rectD, inCell, f1 } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 96;
const pad2 = (v) => String(v).padStart(2, '0');
function keyed(frames, e) {
let i = 0;
while (i < frames.length - 2 && e > frames[i + 1][0]) i++;
const [e0, ...A] = frames[i], [e1, ...Bc] = frames[i + 1];
const f = clamp((e - e0) / (e1 - e0));
return A.map((c, j) => mix(c, Bc[j], f));
}
const __default = {
id: 'span-daylight',
title: 'Daylight',
category: 'Whole Device',
description: 'A window on the day, driven by the clock: the sun arcs across the device, the sky runs dawn, midday, golden hour and a starry night; a house on the hill lights up.',
tags: ['sky', 'sun', 'time', 'day', 'night', 'sunrise', 'sunset', 'clock', 'landscape', 'wall', 'ambient'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
data: ['clock'],
fps: 1,
loop: LOOP,
params: {
source: { type: 'select', default: 'clock', options: ['clock', 'cycle'], label: 'Time (clock or a day per loop)' },
sunrise: { type: 'number', default: 6.5, min: 3, max: 10, step: 0.25, label: 'Sunrise (h)' },
sunset: { type: 'number', default: 19.5, min: 15, max: 22, step: 0.25, label: 'Sunset (h)' },
time: { type: 'bool', default: true, label: 'Show the time' },
budget: BUDGET,
},
order: 67,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const cycle = ctx.params.source === 'cycle';
const { t } = frameClock(ctx, { fps: cycle ? 2 : 1, changing: cycle ? cells.length : 3, still: 30 });
materials(k, { tone: 'off' });
const flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const sp = (hh, o) => T.spectral(hh, o);
const H = cycle ? (5 + (t / LOOP) * 24) % 24 : (ctx.clock.h + ctx.clock.m / 60);
const rise = ctx.params.sunrise, set = Math.max(rise + 4, ctx.params.sunset);
const day = H >= rise && H <= set;
const fd = (H - rise) / (set - rise), fn = (((H - set) % 24) + 24) % 24 / (24 - (set - rise));
const e = day ? Math.sin(Math.PI * fd) : -Math.sin(Math.PI * fn); 
const rowOf = (y) => cells.reduce((b, c) => (Math.abs(c.y + c.h / 2 - y) < Math.abs(b.y + b.h / 2 - y) ? c : b), cells[0]);
const hc = rowOf(h * (grid.rows <= 2 ? 0.72 : 0.66));
const hy = hc.y + hc.h * (grid.rows <= 2 ? 0.42 : 0.5);
const night0 = mix(T.dark ? T.colors.bg : '#0b1024', sp(262), 0.2), night1 = mix('#0d1430', sp(250), 0.3);
const SKY = [
[-1, night0, night0, night1],
[-0.22, mix(night0, sp(270), 0.25), mix(night1, sp(285), 0.3), mix(night1, sp(320), 0.45)],
[-0.04, mix('#1c2150', sp(275), 0.4), mix('#3a3070', sp(315), 0.5), mix('#e0806a', sp(35), 0.5)],
[0.08, mix('#4a6ab0', sp(240), 0.4), mix('#c49ac0', sp(330), 0.3), mix('#ffc27a', sp(60), 0.4)],
[0.3, mix('#5a9be0', sp(230), 0.4), mix('#9fcbef', sp(220), 0.3), mix('#e9eef0', sp(70), 0.15)],
[1, mix('#3f88dd', sp(232), 0.4), mix('#7fb8ee', sp(225), 0.3), mix('#d6ecf8', sp(210), 0.2)],
];
let [top, midC, low] = keyed(SKY, e);
if (flat) top = midC = low = T.dark ? '#000000' : '#ffffff';
const skyCells = cells.filter((c) => c.y < hy);
backdrop(k, [[0, top, 0.96], [0.62, midC, 0.96], [1, low, 0.96]], { y2: hy, cells });
const B = new Batch(grid);
const light = clamp(0.5 + e * 0.9); 
const starO = flat ? (T.dark ? 0.8 : 0) : smoothstep(-0.05, -0.3, e);
if (starO > 0.02) for (const c of skyCells) {
let d = '';
const bottom = Math.min(c.y + c.h, hy);
for (let j = 0; j < 7; j++) d += dotD(c.x + c.w * hash(c.i, j, 1), c.y + (bottom - c.y) * hash(c.i, j, 2) * 0.92, Math.max(0.6, u * 0.45 * (0.6 + hash(c.i, j, 3))));
B.add([c.x, c.y, c.x + c.w, bottom], fillP('#ffffff', Math.round(starO * 0.8 * 4) / 4), d, 0);
}
const arcX = (f) => lerp(w * 0.06, w * 0.94, f), arcY = (s) => hy + K * 0.05 - s * (hy - K * 0.42);
const bodyF = day ? fd : fn, bodyE = Math.abs(e);
let bx = arcX(bodyF), by = arcY(bodyE);
{
const rr = K * 0.18;
const near = cells.reduce((b, c) => { const dx = Math.max(c.x + rr - bx, 0, bx - (c.x + c.w - rr)), dy = Math.max(c.y + rr - by, 0, by - (c.y + c.h - rr)); const d = dx * dx + dy * dy; return d < b.d ? { c, d } : b; }, { c: null, d: Infinity }).c;
bx = clamp(bx, near.x + rr, near.x + near.w - rr); by = clamp(by, near.y + rr, near.y + near.h - rr);
}
const sunC = flat ? lit(T) : day ? mix('#fff7e0', mix('#ff8a4a', sp(40), 0.4), 1 - smoothstep(0.05, 0.35, bodyE)) : mix('#f4f2ea', sp(80), 0.1);
const gr = k.id('sun');
k.def(radialGradient(gr, [[0, sunC, day ? 0.7 : 0.3], [0.3, sunC, day ? 0.26 : 0.1], [1, sunC, 0]], { cx: f1(bx), cy: f1(by), r: f1(K * (day ? 1.4 : 0.9)), fx: f1(bx), fy: f1(by), gradientUnits: 'userSpaceOnUse' }));
for (const c of skyCells) if (Math.abs(c.x + c.w / 2 - bx) < K * 1.4 + c.w / 2 && Math.abs(c.y + c.h / 2 - by) < K * 1.4 + c.h / 2) k.add(`<path d="${rectD(c.x, c.y, c.w, Math.min(c.h, hy - c.y + K * 0.1))}" fill="${url(gr)}"/>`);
const br = K * (day ? 0.16 : 0.13);
if (flat) B.add([bx - br, by - br, bx + br, by + br], strokeP(lit(T), Math.max(1, u * 1.2), 1), dotD(bx, by, br), 1);
else B.dot(bx, by, br, fillP(sunC, 1), 1);
if (!day && !flat) {
const fy = clamp(by / hy), skyAt = fy < 0.62 ? mix(top, midC, fy / 0.62) : mix(midC, low, (fy - 0.62) / 0.38);
B.dot(bx + br * 0.4, by - br * 0.2, br * 0.85, fillP(skyAt, 0.96), 1);
}
const cloudC = flat ? lit(T) : keyed([[-1, mix(night1, '#ffffff', 0.12)], [-0.05, mix('#e9a0a0', sp(340), 0.3)], [0.1, mix('#ffe0d0', sp(30), 0.2)], [0.35, '#ffffff'], [1, '#ffffff']].map(([ee, c]) => [ee, c]), e)[0];
const nC = Math.max(2, Math.round(w / (K * 1.6)));
for (let i = 0; i < nC; i++) {
const span2 = w + K * 3;
const x = ((hash(i, 41) * span2 + (t / LOOP) * span2 * (1 + (i % 2))) % span2) - K * 1.5;
const y = K * 0.3 + (hy - K * 0.9) * hash(i, 42);
const s = K * (0.22 + 0.2 * hash(i, 43));
let d = '';
for (let j = 0; j < 5; j++) d += ellipseD(Math.round(x + (j - 2) * s * 0.55), y - Math.sin((j / 4) * Math.PI) * s * 0.35, s * (0.45 + 0.2 * hash(i, j, 44)), s * (0.3 + 0.15 * hash(i, j, 45)));
B.add([x - s * 1.8, y - s, x + s * 1.8, y + s * 0.5], flat ? strokeP(cloudC, Math.max(1, u), 0.8) : fillP(cloudC, e < 0 ? 0.35 : 0.85), d, 2);
}
if (e > 0.12 && !flat) {
const birdC = mix(top, '#1a2333', 0.6);
for (let i = 0; i < Math.max(2, Math.round(w / (K * 2.2))); i++) {
const span3 = w + K * 2, bxx = ((hash(i, 81) * span3 + (t / LOOP) * span3 * (2 + (i % 2))) % span3) - K;
const byy = K * 0.35 + (hy - K * 1.1) * hash(i, 82), bs = K * (0.05 + 0.03 * hash(i, 83)), flap = Math.round(t * 2 + i) % 2 ? 0.35 : 0.1;
B.add([bxx - bs * 1.2, byy - bs, bxx + bs * 1.2, byy + bs], strokeP(birdC, Math.max(1, u * 0.9), 0.85), `M${f1(bxx - bs)} ${f1(byy - bs * flap)}Q${f1(bxx - bs * 0.4)} ${f1(byy - bs * 0.7)} ${f1(bxx)} ${f1(byy)}Q${f1(bxx + bs * 0.4)} ${f1(byy - bs * 0.7)} ${f1(bxx + bs)} ${f1(byy - bs * flap)}`, 2);
}
}
const shadeOf = (c, f) => (flat ? (T.dark ? '#000000' : '#ffffff') : mix(mix('#05070d', c, 0.3 + 0.7 * light), low, f));
const far = shadeOf(sp(220), 0.35), nearC = shadeOf(sp(150), 0.08), treeC = shadeOf(sp(140), 0);
const hill = (base, amp, fr, ph) => { const pts = []; for (let x = -4; x <= w + 4; x += K / 12) pts.push([x, base - amp * (0.5 + 0.5 * Math.sin(x / K * fr + ph)) - amp * 0.3 * Math.sin(x / K * fr * 2.3 + ph * 1.7)]); return [...pts, [w + 4, h + 4], [-4, h + 4]]; };
const H1 = hill(hy + K * 0.02, K * 0.18, 0.9, 1.3), H2 = hill(hy + K * 0.3, K * 0.32, 0.55, 4.1);
for (const c of cells) {
for (const [pts, col, layer] of [[H1, far, 3], [H2, nearC, 4]]) {
const cl = clipPoly(pts, c);
if (cl.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], flat ? fillP(col, 1) : fillP(col, 1), polyD(cl), layer);
}
if (flat) {
const edge = H2.slice(0, -2).filter(([x]) => x >= c.x - 2 && x <= c.x + c.w + 2).map(([x, y]) => [x, Math.min(Math.max(y, c.y), c.y + c.h)]);
if (edge.length > 1) B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(lit(T), Math.max(1, u * 1.1), 1), polyD(edge, false), 5);
}
}
const ground = (x) => H2[Math.max(0, Math.min(H2.length - 3, Math.round((x + 4) / (K / 12))))][1];
const land = cells.filter((c) => c.row === hc.row);
const nT = Math.max(3, Math.round(w / K * 1.4));
for (let i = 0; i < nT; i++) {
const c = land[Math.floor(hash(i, 51) * land.length)];
const x = c.x + c.w * (0.12 + 0.76 * hash(i, 52)), gy = ground(x);
if (gy < c.y + c.h * 0.2 || gy > c.y + c.h) continue;
const th = K * (0.22 + 0.16 * hash(i, 53));
B.poly([[x, gy - th], [x + th * 0.26, gy - th * 0.35], [x + th * 0.13, gy - th * 0.38], [x + th * 0.32, gy], [x - th * 0.32, gy], [x - th * 0.13, gy - th * 0.38], [x - th * 0.26, gy - th * 0.35]], flat ? strokeP(lit(T), Math.max(1, u), 1) : fillP(treeC, 1), 6);
}
const houseCell = land.find((c) => c.row === hc.row && Math.abs(c.x + c.w / 2 - w * 0.3) < c.w) || land[0];
{
const x = houseCell.x + houseCell.w * 0.5, gy = clamp(ground(x), houseCell.y + houseCell.h * 0.35, houseCell.y + houseCell.h - K * 0.05), s = K * 0.2;
const wall = flat ? (T.dark ? '#000000' : '#ffffff') : shadeOf(sp(40), 0.05);
const roof = flat ? lit(T) : shadeOf(sp(20), 0);
B.add([x - s, gy - s * 1.6, x + s, gy], flat ? strokeP(lit(T), Math.max(1, u), 1) : fillP(wall, 1), rectD(x - s * 0.7, gy - s * 0.9, s * 1.4, s * 0.9), 7);
B.poly([[x - s * 0.85, gy - s * 0.85], [x, gy - s * 1.55], [x + s * 0.85, gy - s * 0.85]], fillP(roof, 1), 7);
const lamp = smoothstep(0.02, -0.12, e);
const winC = flat ? lit(T) : lamp > 0.05 ? mix(wall, mix(sp(85, { dl: 0.2 }), '#fff3c0', 0.4), lamp) : mix(wall, '#000000', 0.25);
B.add([x - s, gy - s, x + s, gy], fillP(winC, 1), rectD(x - s * 0.35, gy - s * 0.62, s * 0.3, s * 0.28) + rectD(x + s * 0.08, gy - s * 0.62, s * 0.3, s * 0.28), 8);
}
const fore = cells.filter((c) => c.row > hc.row);
if (fore.length && grid.rows > 2) {
const ly = fore[0].y + fore[0].h * 0.42, lcx = w * 0.52, lrx = w * 0.38, lry = Math.min(K * 0.3, fore[0].h * 0.3);
const lake = [];
for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, sy = Math.sin(a); lake.push([lcx + Math.cos(a) * lrx * (1 + 0.06 * Math.sin(a * 3)), ly + sy * lry * (sy < 0 ? 0.45 : 1)]); }
const lakeC = flat ? (T.dark ? '#000000' : '#ffffff') : mix(mix(top, midC, 0.5), '#000000', 0.1);
for (const c of fore) {
const cl = clipPoly(lake, c);
if (cl.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], flat ? strokeP(lit(T), Math.max(1, u), 1) : fillP(lakeC, 1), polyD(cl), 9);
if (!flat && cl.length > 2) {
let d = '';
for (let j = 0; j < 4; j++) { const yy = ly + K * (0.06 + j * 0.08), half = K * (0.08 + j * 0.03) * (1 - 0.3 * hash(j, Math.floor(t))); if (yy > c.y && yy < c.y + c.h && bx > c.x - half && bx < c.x + c.w + half) d += rectD(bx - half, yy, half * 2, Math.max(1, u * 0.8)); }
if (d) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(sunC, day ? 0.7 : 0.45), d, 10);
}
let g = '';
for (let j = 0; j < 14; j++) { const x = c.x + c.w * hash(c.i, j, 61), y0 = c.y + c.h, ht = c.h * (0.08 + 0.2 * hash(c.i, j, 62)); g += `M${f1(x - u)} ${f1(y0)}L${f1(x + (hash(c.i, j, 63) - 0.5) * K * 0.08)} ${f1(y0 - ht)}L${f1(x + u)} ${f1(y0)}Z`; }
B.add([c.x, c.y, c.x + c.w, c.y + c.h], flat ? fillP(lit(T), 1) : fillP(treeC, 1), g, 11);
}
}
B.emit(k);
if (ctx.params.time) {
const tr = cells.reduce((b, c) => (c.row < b.row || (c.row === b.row && c.col > b.col) ? c : b), cells[0]);
const hh = Math.floor(H), mm = Math.floor((H - hh) * 60);
inCell(k, tr, (kk) => kk.eyebrow(`${pad2(hh)}:${pad2(mm)}`, { align: 'right', color: flat ? 'ink' : '#ffffff', opacity: 0.85 }), 'time');
}
return k.svg();
},
};
};
__d[232] = function (__ns) {
const { surface } = __m(113);
const { mix } = __m(4);
const { hash } = __m(1);
const { FONT5, charOf } = __m(89);
const { BUDGET, frameClock, materials, Batch, fillP, backdrop, isFlat, lit, f1 } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 24;
const KANA = [
'##### ....# ..##. ..#.. ..#.. .#... #....', '....# ...#. ..##. .#.#. #..#. ...#. ...#.', '..#.. ##### #...# ....# ...#. ..#.. .#...',
'..... ##### ..#.. ..#.. ..#.. ..#.. #####', '..#.. ##### ..#.# ..#.# .#..# .#..# #..##', '..#.. ##### ..#.. ##### ..#.. ..#.. ..#..',
'.#... .#### #...# ....# ...#. ..#.. ##...', '..... ##### ....# ....# ....# ....# #####', '.#.#. ##### .#.#. .#.#. ...#. ..#.. .#...',
'#.... .#..# #...# .#..# ....# ...#. ###..', '##### ....# ...#. ..#.. .#.#. #...# .....', '#.#.# #.#.# ....# ....# ...#. ..#.. ##...',
'.###. ..... ##### ..#.. ..#.. .#... #....', '.#... .#... .##.. .#.#. .#... .#... .#...', '..#.. ##### ..#.. ..#.. ..#.. .#... #....',
'..... .#.#. .#.#. #...# #...# #...# .....', '#.... #...# ####. #.... #.... #.... .####', '....# #..#. .##.. ..#.. .#.#. #...# .....',
'##### ..#.. ##### ..#.. ..#.. ..#.. ..###', '##### ....# ....# ##### ....# ....# #####', '.###. ..... ##### ....# ...#. ..#.. ##...',
'#..#. #..#. #..#. #..#. ...#. ..#.. .#...', '##### #...# #...# ....# ...#. ..#.. ##...', '#.... .#..# ....# ....# ...#. ..#.. ###..',
];
const GLYPHS = [
...KANA.map((s) => {
const runs = [];
s.split(' ').forEach((row, r) => { let c = 0; while (c < 5) { if (row[c] === '#') { let e = c; while (row[e] === '#') e++; runs.push([r, c, e - c]); c = e; } else c++; } });
return runs;
}),
...'0123456789:=+<>'.split('').map((ch) => { const g = charOf(FONT5, ch); const off = Math.floor((5 - g.w) / 2); return g.runs.map(([r, c, l]) => [r, c + off, l]); }),
];
const mirror = (runs) => runs.map(([r, c, l]) => [r, 5 - c - l, l]);
const __default = {
id: 'span-digital-rain',
title: 'Digital Rain',
category: 'Text & Marquee',
description: 'Streams of mirrored glyphs fall down every column of keys: white-hot heads, fading trails, mutating characters, rows that continue behind the bezels.',
tags: ['digital rain', 'code', 'glyphs', 'katakana', 'hacker', 'terminal', 'retro', 'wall', 'ambient'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 6,
loop: LOOP,
params: {
color: { type: 'select', default: 'green', options: ['green', 'spectrum', 'hue'], label: 'Color' },
hue: { type: 'hue', default: 296, min: 0, max: 360, step: 1, label: 'Hue' },
density: { type: 'number', default: 1, min: 0.4, max: 1.6, step: 0.1, label: 'Streams' },
budget: BUDGET,
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, h } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 6, changing: cells.length, still: 9.6 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const KW = grid.key.w;
const d = Math.max(2, Math.floor(KW / 40)); 
const cw = d * 6, ch = d * 8; 
const perKey = Math.floor(KW / cw), padX = (KW - perKey * cw + d) / 2;
const rows = Math.ceil((h + ch) / ch);
backdrop(k, [[0, dark ? mix(T.colors.bg, '#000000', 0.5) : T.colors.surface, 0.94], [1, dark ? mix(T.colors.bg, T.spectral(150), flat ? 0 : 0.06) : T.colors.surface, 0.94]], { y2: h });
const B = new Batch(grid);
const hot = lit(T);
const colorOf = (x) => {
if (flat) return hot;
const m = ctx.params.color;
const hue = m === 'green' ? 145 : m === 'hue' ? ctx.params.hue : 24 + 276 * (x / ctx.w);
return dark ? T.spectral(hue, { dl: 0.04 }) : T.spectral(hue, { tier: 'ink' });
};
const keyCols = [...new Set(cells.map((c) => c.col))].sort((a, b) => a - b);
for (const kc of keyCols) {
const col0 = cells.find((c) => c.col === kc);
for (let s = 0; s < perKey; s++) {
const slot = kc * 16 + s;
if (hash(slot, ctx.seed, 1) > 0.72 * ctx.params.density) continue;
const x = col0.x + padX + s * cw;
const L = 5 + Math.floor(hash(slot, 2) * 9); 
const P = rows + L + 2 + Math.floor(hash(slot, 3) * rows * 0.6); 
const m = 2 + Math.floor(hash(slot, ctx.seed, 4) * 3); 
const head = Math.floor(((t / LOOP) * m + hash(slot, ctx.seed, 5)) % 1 * P) - 1;
const c = colorOf(x);
for (let i = 0; i < L; i++) {
const r = head - i;
if (r < 0 || r >= rows) continue;
const y = r * ch + d;
const b = i === 0 ? 1 : 1 - i / L;
const step = i === 0 ? 'head' : b > 0.7 ? 1 : b > 0.45 ? 0.72 : b > 0.22 ? 0.46 : 0.24;
const g = Math.floor(hash(slot, r, Math.floor(t * 0.5 + hash(slot, r, 9) * 4)) * GLYPHS.length);
let runs = GLYPHS[g];
if (hash(slot, r, 7) < 0.5) runs = mirror(runs);
let dd = '';
for (const [rr, cc, ll] of runs) dd += `M${f1(x + cc * d)} ${f1(y + rr * d)}h${f1(ll * d)}v${f1(d)}h${f1(-ll * d)}Z`;
const paint = step === 'head' ? fillP(hot, 1) : fillP(c, step);
B.add([x, y, x + cw - d, y + ch - d], paint, dd, step === 'head' ? 2 : 1);
}
}
}
B.emit(k);
return k.svg();
},
};
};
__d[233] = function (__ns) {
const { surface, rect, path, polygon, circle, linearGradient, radialGradient, url, n, P } = __m(113);
const { clamp, lerp, smoothstep } = __m(12);
const { noise1 } = __m(1);
const { BUDGET, frameClock, materials } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 16, RAD = Math.PI / 180, BANDS = 12;
const TAU = Math.PI * 2;
const __default = {
id: 'span-dispersion',
title: 'Dispersion',
category: 'Whole Device',
description: 'The whole device as a window onto one glass prism: a white beam enters, bends and fans out as the Spectrum, sweeping slowly across every key and lighting each in its color.',
tags: ['prism', 'dispersion', 'spectrum', 'refraction', 'beam', 'light', 'wall', 'ambient', 'brand'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 6,
loop: LOOP,
params: {
sway: { type: 'number', default: 1, min: 0, max: 2, step: 0.1, label: 'Sway' },
budget: BUDGET,
},
order: 11,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const { t } = frameClock(ctx, { fps: 6, changing: grid.cells.length, still: 4 });
materials(k);
const K = Math.min(grid.key.w, grid.key.h);
const dark = T.dark;
const beamC = dark ? (T.colors.beam || '#ffffff') : T.colors.ink;
const sw = ctx.params.sway * Math.sin((t / LOOP) * TAU);
const breathe = 0.5 + 0.5 * Math.sin((t / LOOP) * TAU * 2 + 1.1);
const rot = w / h < 1.25;
const Wl = rot ? h : w, Hl = rot ? w : h;
const M = rot ? ([x, y]) => [y, x] : (p) => p; 
const Mi = M; 
const pts = (list) => list.map(M);
const S = Math.min(Hl * 0.94, Wl * 0.46) * (Hl < Wl * 0.3 ? 1.25 : 1);
const pcx = Wl * 0.29, pcy = Hl * 0.55;
const A = [pcx, pcy - S * 0.56], B = [pcx - S * 0.62, pcy + S * 0.46], C = [pcx + S * 0.62, pcy + S * 0.46];
const on = (p, q, f) => [lerp(p[0], q[0], f), lerp(p[1], q[1], f)];
const E = on(A, B, 0.52), X = on(A, C, 0.56);
const S0 = [-K * 0.2, E[1] - (E[0] + K * 0.2) * Math.tan((9 + sw * 2) * RAD)];
const spread = (38 + 6 * breathe) * RAD;
const th0 = 11 * RAD - spread / 2 + sw * 4 * RAD;
const L = Math.hypot(w, h) * 1.4;
const ray = (a, d) => [X[0] + Math.cos(a) * d, X[1] + Math.sin(a) * d];
const bandHue = (f) => lerp(18, 300, f);
const Xc = M(X);
for (let i = 0; i < BANDS; i++) {
const a0 = th0 + (spread * i) / BANDS, a1 = th0 + (spread * (i + 1)) / BANDS + (i < BANDS - 1 ? 1.2 / L : 0);
const am = (a0 + a1) / 2;
const c = T.spectral(bandHue((i + 0.5) / BANDS), { dl: dark ? 0.04 : -0.02 });
const shimmer = 0.85 + 0.15 * noise1(t * 0.7 + i * 0.9, ctx.seed);
const gid = k.id(`f${i}`);
const far = M(ray(am, L * 0.62));
k.def(linearGradient(gid, [[0, c, n((dark ? 0.9 : 0.75) * shimmer, 3)], [0.35, c, n((dark ? 0.5 : 0.42) * shimmer, 3)], [1, c, 0]], { x1: n(Xc[0]), y1: n(Xc[1]), x2: n(far[0]), y2: n(far[1]), gradientUnits: 'userSpaceOnUse' }));
k.add(polygon(pts([X, ray(a0, L), ray(a1, L)]), { fill: url(gid) }));
}
for (const c of grid.cells) {
const [cx, cy] = Mi([c.x + c.w / 2, c.y + c.h / 2]);
if (cx <= X[0] + K * 0.2) continue;
const f = (Math.atan2(cy - X[1], cx - X[0]) - th0) / spread;
const inside = smoothstep(-0.12, 0.05, f) * (1 - smoothstep(0.95, 1.12, f));
if (inside < 0.02) continue;
const col = T.spectral(bandHue(clamp(f)));
const gid = k.id(`k${c.i}`);
const a = inside * (dark ? 0.34 : 0.22) * (1 - 0.35 * clamp((cx - X[0]) / Wl));
k.def(radialGradient(gid, [[0, col, n(a, 3)], [0.7, col, n(a * 0.3, 3)], [1, col, 0]], { cx: 0.5, cy: 0.5, r: 0.72 }));
k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gid) }));
k.add(rect({ x: c.x + k.m.safe, y: c.y, width: c.w - k.m.safe * 2, height: k.m.line, fill: col, fillOpacity: n(clamp(inside * 0.9), 3) }));
}
let dots = '';
for (let i = 0; i < 9; i++) {
const f = (i + 0.5) / 9;
const run = ((t / LOOP) * (2 + (i % 3)) + i * 0.37) % 1;
const [px, py] = M(ray(th0 + spread * f, run * L * 0.75));
if (px < 0 || px > w || py < 0 || py > h) continue;
dots += circle({ cx: n(px), cy: n(py), r: n(K * 0.018 * (1.2 - run * 0.6)), fill: dark ? '#ffffff' : T.spectral(bandHue(f)), fillOpacity: n((1 - run) * 0.85, 3) });
}
if (dots) k.add(dots);
const [s0, e0, x0] = pts([S0, E, X]);
const bid = k.id('beam');
k.def(linearGradient(bid, [[0, beamC, 0], [0.4, beamC, dark ? 0.75 : 0.6], [1, beamC, 1]], { x1: n(s0[0]), y1: n(s0[1]), x2: n(e0[0]), y2: n(e0[1]), gradientUnits: 'userSpaceOnUse' }));
const bw = Math.max(1.5, K * 0.024);
k.add(path(P().M(...s0).L(...e0).d, { stroke: url(bid), strokeWidth: n(bw * 3.4), strokeOpacity: 0.18, strokeLinecap: 'round', fill: 'none' }));
k.add(path(P().M(...s0).L(...e0).d, { stroke: url(bid), strokeWidth: n(bw), strokeLinecap: 'round', fill: 'none' }));
k.add(path(P().M(...e0).L(...x0).d, { stroke: beamC, strokeWidth: n(bw * 1.2), strokeOpacity: dark ? 0.45 : 0.35, fill: 'none' }));
const gl = k.id('glass');
const glassC = dark ? '#ffffff' : T.colors.accent;
k.def(linearGradient(gl, [[0, glassC, dark ? 0.12 : 0.1], [0.6, glassC, 0.03], [1, glassC, 0.07]], { x1: 0, y1: 0, x2: 0.4, y2: 1 }));
k.add(polygon(pts([A, B, C]), { fill: url(gl), stroke: dark ? '#ffffff' : T.colors.ink, strokeWidth: n(Math.max(1.5, K * 0.018)), strokeOpacity: dark ? 0.75 : 0.65, strokeLinejoin: 'round' }));
const [h0, h1] = pts([on(A, B, 0.08), on(A, B, 0.45)]);
k.add(path(P().M(...h0).L(...h1).d, { stroke: glassC, strokeWidth: n(K * 0.022), strokeOpacity: 0.55, strokeLinecap: 'round', fill: 'none' }));
const fl = k.id('strike');
k.def(radialGradient(fl, [[0, beamC, 0.8], [0.3, beamC, 0.28], [1, beamC, 0]]));
const r = K * (0.2 + 0.04 * breathe);
k.add(rect({ x: n(e0[0] - r), y: n(e0[1] - r), width: n(r * 2), height: n(r * 2), fill: url(fl) }));
const xr = K * 0.16;
const fx = k.id('exit');
k.def(radialGradient(fx, [[0, beamC, dark ? 0.7 : 0.5], [0.4, beamC, 0.15], [1, beamC, 0]]));
k.add(rect({ x: n(x0[0] - xr), y: n(x0[1] - xr), width: n(xr * 2), height: n(xr * 2), fill: url(fx) }));
return k.svg();
},
};
};
__d[234] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, backdrop, isFlat, f1, dotD } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 24, TAU = Math.PI * 2;
const SYNC = 1.2; 
const flash = (q) => (q < 0.12 ? smoothstep(0, 0.12, q) : q < 0.3 ? 1 : q < 0.75 ? 1 - smoothstep(0.3, 0.75, q) : 0);
const __default = {
id: 'span-fireflies',
title: 'Fireflies',
category: 'Ripples & Light',
description: 'A summer night across the device: fireflies drift and blink above the grass on the bottom row; press a key and the swarm falls into step, flashing together.',
tags: ['fireflies', 'night', 'summer', 'glow', 'nature', 'press', 'ambient', 'wall', 'calm'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
press: 'momentary',
fps: 8,
loop: LOOP,
params: {
density: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Fireflies' },
hue: { type: 'hue', default: 100, min: 0, max: 360, step: 1, label: 'Glow hue' },
sync: { type: 'bool', default: true, label: 'Press to synchronize' },
budget: BUDGET,
},
order: 44,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const count = Math.max(5, Math.round(cells.length * 1.7 * ctx.params.density));
const age = ctx.pressed ? 0 : ctx.pressAge;
const syncing = ctx.params.sync && age < 9;
const { t } = frameClock(ctx, { fps: 8, changing: syncing ? cells.length : Math.max(3, Math.ceil(count * 0.5)), still: 9.6 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const sky = dark ? mix(T.colors.bg, T.spectral(255), flat ? 0 : 0.2) : mix(T.colors.surface, T.spectral(280), flat ? 0 : 0.34);
const ground = dark ? mix(T.colors.bg, T.spectral(165), flat ? 0 : 0.24) : mix(T.colors.surface, T.spectral(50), flat ? 0 : 0.45);
backdrop(k, [[0, sky, dark ? 0.9 : 0.75], [1, ground, dark ? 0.92 : 0.8]], { y2: h });
const B = new Batch(grid);
const bottom = grid.row + grid.rows - 1;
const blade = dark ? mix(T.colors.bg, T.spectral(150), flat ? 0 : 0.35) : (flat ? T.colors.ink : mix(T.colors.ink, T.spectral(150), 0.45));
for (const c of cells.filter((cc) => cc.row === bottom)) {
let d = '';
const nb = 9 + Math.round(c.w / (K / 9));
for (let j = 0; j < nb; j++) {
const x = c.x + c.w * ((j + 0.5 * hash(c.i, j, 1)) / nb);
const ht = c.h * (0.18 + 0.44 * hash(c.i, j, 2) ** 1.5);
const lean = (hash(c.i, j, 3) - 0.5) * K * 0.16;
const bw = K * (0.022 + 0.018 * hash(c.i, j, 4));
d += `M${(x - bw).toFixed(1)} ${(c.y + c.h).toFixed(1)}Q${(x + lean * 0.3).toFixed(1)} ${(c.y + c.h - ht * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(c.y + c.h - ht).toFixed(1)}Q${(x + lean * 0.2 + bw).toFixed(1)} ${(c.y + c.h - ht * 0.5).toFixed(1)} ${(x + bw).toFixed(1)} ${(c.y + c.h).toFixed(1)}Z`;
}
B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(blade, dark ? 0.95 : 0.8), d, 0);
}
const topRow = cells.filter((c) => c.row === grid.row);
if (grid.rows >= 2) {
const starC = dark ? '#ffffff' : T.colors.ink;
for (const c of cells.filter((cc) => cc.row < bottom)) {
let d = '';
const ns = c.row === grid.row ? 6 : 3;
for (let j = 0; j < ns; j++) d += dotD(c.x + c.w * hash(c.i, j, 31), c.y + c.h * hash(c.i, j, 32) * 0.85, Math.max(0.6, u * 0.45 * (0.6 + hash(c.i, j, 33))));
B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(starC, dark ? 0.45 : 0.18), d, 0);
}
const mc = topRow[Math.min(topRow.length - 1, Math.floor(topRow.length * 0.7))];
const mx = mc.x + mc.w * 0.6, my = mc.y + mc.h * 0.38, mr = K * 0.13;
const moonC = dark ? mix('#fff6e0', T.spectral(80), flat ? 0 : 0.1) : flat ? T.colors.ink : mix(T.colors.surface, '#ffffff', 0.6);
B.dot(mx, my, mr * 2.4, fillP(moonC, dark ? 0.06 : 0.25), 0);
B.dot(mx, my, mr, fillP(moonC, dark ? 0.95 : 0.9), 0);
B.dot(mx + mr * 0.42, my - mr * 0.18, mr * 0.86, fillP(sky, flat ? 1 : 0.97), 0);
}
const glow = T.spectral(ctx.params.hue, { dl: dark ? 0.06 : -0.02 });
const hot = flat ? (dark ? '#ffffff' : T.colors.ink) : mix(glow, dark ? '#fffbe6' : '#ffffff', dark ? 0.55 : 0.2);
const gid = k.id('glow');
k.def(radialGradient(gid, [[0, glow, dark ? 0.75 : 0.75], [0.25, glow, dark ? 0.3 : 0.36], [0.6, glow, dark ? 0.06 : 0.1], [1, glow, 0]]));
const press = ctx.pressKey !== null ? cells.find((c) => c.i === ctx.pressKey) : null;
const pc = press ? [press.x + press.w / 2, press.y + press.h / 2] : [w / 2, h / 2];
const sw = syncing ? smoothstep(0, 0.4, age) * (1 - smoothstep(7, 9, age)) : 0;
const vel = Math.hypot(w, h) / 0.7; 
for (let i = 0; i < count; i++) {
const a = (t / LOOP) * TAU;
const fx = 1 + (i % 2), fy = 1 + ((i >> 1) % 2);
const x = w * (0.06 + 0.88 * hash(i, ctx.seed, 1)) + Math.sin(a * fx + hash(i, 2) * TAU) * w * 0.07 + Math.sin(a * 3 + i) * K * 0.12;
const yb = h * (0.12 + 0.8 * (1 - hash(i, ctx.seed, 3) ** 1.6));
const y = yb + Math.sin(a * fy + hash(i, 4) * TAU) * h * 0.06 + Math.cos(a * 2 + i * 1.7) * K * 0.1;
const m = 4 + Math.floor(hash(i, ctx.seed, 5) * 4), q = ((t / LOOP) * m + hash(i, ctx.seed, 6)) % 1;
let b = q * (LOOP / m) < 1.8 ? flash(q * (LOOP / m) / 1.8) : 0;
if (i % 5 === 0) { const q2 = q * (LOOP / m) - 1.4; if (q2 > 0 && q2 < 1.8) b = Math.max(b, 0.8 * flash(q2 / 1.8)); }
if (sw > 0) {
const lag = age - Math.hypot(x - pc[0], y - pc[1]) / vel;
const bs = lag > 0 ? flash((lag % SYNC) / SYNC) : 0;
b = b * (1 - sw) + bs * sw;
}
b = Math.round(clamp(b) * 4) / 4; 
if (b <= 0) continue;
const R = K * 0.34;
B.raw([x - R, y - R, x + R, y + R], `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="${url(gid)}"${b < 1 ? ` fill-opacity="${b}"` : ''}/>`, 1);
B.dot(x, y, Math.max(1.4, K * 0.03), fillP(hot, Math.min(1, 0.4 + 0.6 * b)), 3);
if (!dark) B.dot(x, y + u * 0.6, Math.max(0.8, K * 0.012), fillP(T.colors.ink, 0.7), 4);
}
B.emit(k);
return k.svg();
},
};
};
__d[235] = function (__ns) {
const { surface, keyInto, path, polygon, circle, rect, linearGradient, radialGradient, url, n, P } = __m(113);
const { clamp, lerp, outCubic, outExpo, smoothstep, phase } = __m(12);
const { noise1 } = __m(1);
__e(__ns, { "default": () => __default }, [], ["default"]);
const RAD = Math.PI / 180;
const LOOP = 9;
const __default = {
id: 'span-first-light',
title: 'First Light',
category: 'Whole Device',
description: 'A beam of white light crosses the device, strikes a glass prism inside one key and fans into the Spectrum, lighting every key it reaches.',
tags: ['prism', 'spectrum', 'beam', 'refraction', 'intro', 'ambient', 'brand', 'wall'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 12,
loop: LOOP,
params: { caption: { type: 'text', default: 'First Light', label: 'Caption', maxLength: 16 } },
order: 10,
render(ctx) {
const k = surface(ctx);
const { w, h, theme: T, grid } = ctx;
const tt = ctx.reduced ? 3.6 : phase(ctx.t, LOOP) * LOOP;
const KW = grid.key.w, KH = grid.key.h, K = Math.min(KW, KH);
k.add(`<rect width="${n(w)}" height="${n(h)}" fill="#000000"/>`);
for (const c of grid.cells) keyInto(k, c, (kk) => kk.background({ tone: 'idle' }), { tag: `b${c.i}`, clip: false });
const cols = grid.cols, rows = grid.rows;
const pc = grid.cells.find((c) => c.col - grid.col === Math.round((cols - 1) * 0.4) && c.row - grid.row === Math.floor((rows - 1) / 2)) || grid.cells[0];
const pcx = pc.x + KW / 2, pcy = pc.y + KH / 2;
const S = K * 0.66;
const A = [pcx, pcy - S * 0.56], B = [pcx - S * 0.58, pcy + S * 0.44], C = [pcx + S * 0.58, pcy + S * 0.44];
const onEdge = (p, q, f) => [lerp(p[0], q[0], f), lerp(p[1], q[1], f)];
const E = onEdge(A, B, 0.56), X = onEdge(A, C, 0.5);
const S0 = [0, E[1] + E[0] * Math.tan(7 * RAD)];
const travel = outCubic(clamp(tt / 1.5));
const strike = smoothstep(1.35, 1.75, tt) * (1 - smoothstep(2.2, 3.2, tt) * 0.6);
const open = outExpo(clamp((tt - 1.6) / 1.5));
const live = 1 - smoothstep(7.4, LOOP, tt);
const hueAt = (f) => lerp(28, 300, f); 
const WEDGES = 22;
const th0 = -3 * RAD, th1 = lerp(-3, 34, open) * RAD;
const reach = (th) => (w - X[0] + K) / Math.cos(th);
if (open > 0.001) {
for (let i = 0; i < WEDGES; i++) {
const f0 = i / WEDGES, f1 = (i + 1) / WEDGES;
const a0 = lerp(th0, th1, f0), a1 = lerp(th0, th1, Math.min(1, f1 + 0.15 / WEDGES));
const L = reach(a1) * lerp(0.25, 1, open);
const p0 = [X[0] + Math.cos(a0) * L, X[1] + Math.sin(a0) * L], p1 = [X[0] + Math.cos(a1) * L, X[1] + Math.sin(a1) * L];
const color = T.spectral(hueAt((f0 + f1) / 2), { c: (T.colors.spectrum?.c ?? 0.12) + 0.03 });
const gid = k.id(`w${i}`);
const sh = 0.82 + 0.18 * noise1(ctx.t * 0.9 + i * 0.7, ctx.seed);
k.def(linearGradient(gid, [[0, color, (T.dark ? 0.95 : 0.8) * sh], [0.45, color, (T.dark ? 0.55 : 0.45) * sh], [1, color, 0]], { x1: X[0], y1: X[1], x2: X[0] + Math.cos((a0 + a1) / 2) * L, y2: X[1] + Math.sin((a0 + a1) / 2) * L, gradientUnits: 'userSpaceOnUse' }));
k.add(polygon([X, p0, p1], { fill: url(gid), fillOpacity: n(live, 3) }));
}
if (open > 0.5) {
let dots = '';
for (let i = 0; i < 9; i++) {
const f = (i + 0.5) / 9, a = lerp(th0, th1, f), run = phase(ctx.t * 0.22 + i * 0.37, 1), L = reach(a) * run;
dots += circle({ cx: X[0] + Math.cos(a) * L, cy: X[1] + Math.sin(a) * L, r: K * 0.012 * (1 - run * 0.5), fill: T.dark ? '#ffffff' : T.spectral(hueAt(f)), fillOpacity: n((1 - run) * 0.8 * live, 3) });
}
k.add(dots);
}
}
const span = Math.max(1, rows - 1) + 0.6;
for (const c of grid.cells) {
const cx = c.x + KW / 2, cy = c.y + KH / 2;
const dist = Math.hypot(c.col - pc.col, c.row - pc.row);
let color, level;
if (c === pc) { color = T.dark ? '#ffffff' : T.colors.accent; level = strike * 0.55 + open * 0.3; }
else {
color = T.spectral(hueAt(clamp(((c.row - grid.row) + ((c.col - grid.col) / cols) * 0.6) / span)), { dl: T.dark ? 0.04 : 0 });
const delay = 2.5 + dist * 0.24;
level = smoothstep(delay, delay + 0.55, tt);
const onBeam = cx < E[0] && Math.abs(cy - lerp(S0[1], E[1], cx / E[0])) < KH * 0.6;
if (onBeam) {
const pass = (cx / E[0]) * 1.5;
const flash = smoothstep(pass - 0.1, pass + 0.15, tt) * (1 - smoothstep(pass + 0.3, pass + 1.2, tt));
if (flash > level) { color = T.dark ? '#ffffff' : T.colors.accent; level = flash * 0.6; }
}
}
level *= live;
if (level <= 0.01) continue;
const gid = k.id(`k${c.i}`);
k.def(radialGradient(gid, [[0, color, (T.dark ? 0.5 : 0.3) * level], [0.55, color, (T.dark ? 0.16 : 0.1) * level], [1, color, 0]], { cx: 0.5, cy: 1.05, r: 0.85 }));
k.add(rect({ x: c.x, y: c.y, width: KW, height: KH, fill: url(gid) }));
if (c !== pc) {
const bid = k.id(`e${c.i}`), m = k.m.safe;
k.def(linearGradient(bid, [[0, color, 0], [0.5, color, 1], [1, color, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: c.x + m, y: c.y, width: KW - m * 2, height: k.m.line, fill: url(bid), fillOpacity: n(level, 3) }));
}
}
const head = [lerp(S0[0], E[0], travel), lerp(S0[1], E[1], travel)];
const beamW = K * 0.022, beamC = T.colors.beam || '#ffffff';
const bid = k.id('beam');
k.def(linearGradient(bid, [[0, beamC, 0], [0.35, beamC, T.dark ? 0.7 : 0.55], [1, beamC, 1]], { x1: S0[0], y1: S0[1], x2: Math.max(head[0], S0[0] + 1), y2: head[1], gradientUnits: 'userSpaceOnUse' }));
if (travel > 0.001) {
const d = P().M(...S0).L(...head).d;
k.add(path(d, { stroke: url(bid), strokeWidth: beamW * 3.2, strokeOpacity: n(0.18 * live, 3), strokeLinecap: 'round' }));
k.add(path(d, { stroke: url(bid), strokeWidth: beamW, strokeOpacity: n(live, 3), strokeLinecap: 'round' }));
if (travel < 1) {
const hg = k.id('head');
k.def(radialGradient(hg, [[0, beamC, 0.9], [0.4, beamC, 0.25], [1, beamC, 0]]));
k.add(circle({ cx: head[0], cy: head[1], r: K * 0.09, fill: url(hg) }));
}
}
if (strike > 0.01) k.add(path(P().M(...E).L(...X).d, { stroke: beamC, strokeWidth: beamW * 1.4, strokeOpacity: n(0.5 * Math.max(strike, open * 0.6) * live, 3) }));
const glassId = k.id('glass'), ink = T.dark ? '#ffffff' : T.colors.ink;
k.def(linearGradient(glassId, [[0, T.dark ? '#ffffff' : T.colors.accent, T.dark ? 0.1 : 0.08], [1, T.dark ? '#ffffff' : T.colors.accent, 0.015]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }));
const edgeOp = 0.35 + 0.65 * Math.max(strike, open * 0.7);
k.add(polygon([A, B, C], { fill: url(glassId), stroke: ink, strokeWidth: K * 0.012, strokeOpacity: n(edgeOp * (0.4 + 0.6 * live), 3), strokeLinejoin: 'round' }));
k.add(path(P().M(...A).L(...onEdge(A, C, 0.42)).d, { stroke: T.dark ? '#ffffff' : T.colors.accent, strokeWidth: K * 0.02, strokeOpacity: n(0.25 + 0.6 * strike, 3), strokeLinecap: 'round' }));
if (strike > 0.01) {
const fl = k.id('flash');
k.def(radialGradient(fl, [[0, beamC, 0.85], [0.3, beamC, 0.3], [1, beamC, 0]]));
k.add(circle({ cx: E[0], cy: E[1], r: K * 0.16 * strike, fill: url(fl), fillOpacity: n(strike, 3) }));
}
const words = smoothstep(3.2, 4, tt) * live;
if (words > 0.01) {
const first = grid.cells[0], last = grid.cells[grid.cells.length - 1];
keyInto(k, first, (kk) => kk.eyebrow(ctx.params.caption, { opacity: words }), { tag: 'cap', clip: false });
keyInto(k, last, (kk) => kk.eyebrow('λ380–700', { align: 'right', y: kk.h - kk.m.safe, color: 'dim', opacity: words }), { tag: 'lam', clip: false });
}
return k.svg();
},
};
};
__d[236] = function (__ns) {
const { surface } = __m(113);
const { clamp } = __m(12);
const { mix } = __m(4);
const { materials, inCell, middleRow, rowCells } = __m(201);
const { flap, flapColors, text } = __m(195);
const { capHeight } = __m(11);
__e(__ns, { "default": () => __default }, [], ["default"]);
const FLIP = 0.55; 
function plan(nKeys, seconds) {
const D = (field, place) => ({ kind: 'd', field, place });
let slots;
if (nKeys >= 8) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1), { kind: 'colon' }, D('s', 0), D('s', 1)];
else if (nKeys >= 7 && seconds) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1), { kind: 'pair', field: 's' }];
else if (nKeys >= 5) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1)];
else if (nKeys === 4) slots = [D('h', 0), D('h', 1), D('m', 0), D('m', 1)];
else slots = [{ kind: 'pair', field: 'h' }, { kind: 'pair', field: 'm' }, { kind: 'pair', field: 's' }].slice(0, Math.max(1, nKeys));
if (!seconds) slots = slots.filter((s, i, a) => !(s.field === 's' || (s.kind === 'colon' && a[i + 1]?.field === 's')));
const lead = Math.floor((nKeys - slots.length) / 2);
return Array.from({ length: nKeys }, (_, i) => slots[i - lead] || null);
}
function fieldText(c, field, h12) {
const v = field === 'h' ? (h12 ? ((c.h + 11) % 12) + 1 : c.h) : field === 'm' ? c.m : c.s;
return String(v).padStart(2, '0');
}
const __default = {
id: 'span-flip-clock',
title: 'Split-Flap Clock',
category: 'Text & Marquee',
description: 'A split-flap clock across a row of keys: each digit is a flap unit whose top card falls with gravity, passes the hinge and bounces when the time changes.',
tags: ['clock', 'time', 'split flap', 'flip clock', 'digits', 'retro', 'span'],
surface: 'span',
span: { cols: 'all', rows: 1 },
fps: 10,
loop: 60,
params: {
seconds: { type: 'bool', default: true, label: 'Seconds (when the row has room)' },
hour12: { type: 'bool', default: false, label: '12-hour clock' },
},
order: 24,
render(ctx) {
const k = surface(ctx);
const { grid } = ctx;
const row = middleRow(grid);
const cells = rowCells(grid, row);
const slots = plan(cells.length, ctx.params.seconds);
materials(k);
const now = ctx.clock;
const into = (ctx.clock.ms + 0) / 1000; 
const prevClock = { ...now, ...(() => { const t = now.h * 3600 + now.m * 60 + now.s - 1; const d = ((t % 86400) + 86400) % 86400; return { h: Math.floor(d / 3600), m: Math.floor((d % 3600) / 60), s: d % 60 }; })() };
const age = ctx.reduced ? 9 : into; 
const F = flapColors(k);
cells.forEach((cell, i) => {
const slot = slots[i];
inCell(k, cell, (kk) => {
const u = kk.m.u;
const pad = kk.m.safe * 0.8;
const x = pad, y = pad, cw = kk.w - pad * 2, ch = kk.h - pad * 2;
if (!slot) return;
if (slot.kind === 'colon') {
const r = Math.max(2, 3.6 * u);
flap(kk, { x: x + cw * 0.25, y, w: cw * 0.5, h: ch, r: kk.m.radius * 0.5, cur: '', size: 1, tag: `c${cell.i}`, colors: F });
kk.add(`<circle cx="${kk.w / 2}" cy="${y + ch * 0.32}" r="${r}" fill="${F.ink}"/><circle cx="${kk.w / 2}" cy="${y + ch * 0.68}" r="${r}" fill="${F.ink}"/>`);
return;
}
const cur = slot.kind === 'pair' ? fieldText(now, slot.field, ctx.params.hour12) : fieldText(now, slot.field, ctx.params.hour12)[slot.place];
const prv = slot.kind === 'pair' ? fieldText(prevClock, slot.field, ctx.params.hour12) : fieldText(prevClock, slot.field, ctx.params.hour12)[slot.place];
const p = prv !== cur ? clamp(age / FLIP) * 1.25 : 9;
const size = slot.kind === 'pair' ? ch * 0.62 : ch * 0.8;
const fits = Math.min(size, (cw * (slot.kind === 'pair' ? 0.92 : 0.95)) / (slot.kind === 'pair' ? 1.25 : 0.68));
flap(kk, { x, y, w: cw, h: ch, r: kk.m.radius * 0.6, prev: prv, cur, p, size: fits, weight: 700, tag: `f${cell.i}`, colors: F, dy: 0 });
if (slot.kind === 'pair' && kk.w >= 110) text(kk, slot.field === 'h' ? (ctx.params.hour12 ? (now.h < 12 ? 'AM' : 'PM') : 'HRS') : slot.field === 'm' ? 'MIN' : 'SEC', { x: x + cw - 4 * u, y: y + 4 * u + capHeight(6.5 * u, 600), size: 6.5 * u, anchor: 'end', weight: 600, caps: true, tracking: 0.12, color: mix(F.ink, F.top, 0.55) });
}, `fc${cell.i}`);
});
return k.svg();
},
};
};
__d[237] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, lit, dotD, f1, rectD } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 90, TAU = Math.PI * 2;
const gauss = (a, b) => Math.sqrt(-2 * Math.log(Math.max(1e-6, a))) * Math.cos(TAU * b);
const __default = {
id: 'span-galaxy',
title: 'Galaxy',
category: 'Whole Device',
description: 'A spiral galaxy turning slowly across the device: a warm core mid-deck, blue-white arms beaded with rose knots winding through every key; a star-atlas engraving by day.',
tags: ['galaxy', 'spiral', 'space', 'stars', 'cosmos', 'astronomy', 'calm', 'ambient', 'wall'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 4,
loop: LOOP,
params: {
stars: { type: 'number', default: 1, min: 0.5, max: 1.8, step: 0.1, label: 'Stars' },
arms: { type: 'select', default: 2, options: [2, 3, 4], label: 'Arms' },
budget: BUDGET,
},
order: 66,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 36 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const sp = (hh, o) => T.spectral(hh, o);
const space = dark ? mix(T.colors.bg, '#000000', 0.4) : T.colors.surface;
const mid = cells.reduce((b, c) => (Math.hypot(c.x + c.w / 2 - w / 2, c.y + c.h / 2 - h / 2) < Math.hypot(b.x + b.w / 2 - w / 2, b.y + b.h / 2 - h / 2) ? c : b), cells[0]);
const cx = mid.x + mid.w / 2, cy = mid.y + mid.h / 2;
const tall = h > w;
const reach = Math.max(...cells.map((c) => Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy)));
const sx = tall ? 0.86 : 1, sy = tall ? 1 : 0.62;
const R = reach * 1.08 / Math.max(0.62, Math.min(sx, sy) + 0.2);
const rot = (t / LOOP) * TAU;
backdrop(k, [[0, dark ? mix(space, sp(270), flat ? 0 : 0.1) : space, 0.95], [1, space, 0.95]], { radial: { cx, cy, r: Math.hypot(w, h) / 2 } });
const core = flat ? lit(T) : dark ? mix(sp(70, { dl: 0.1 }), '#ffffff', 0.45) : mix(sp(60), T.colors.ink, 0.35);
const gid = k.id('core');
k.def(radialGradient(gid, [[0, core, dark ? 0.9 : 0.6], [0.2, core, dark ? 0.45 : 0.3], [0.5, core, dark ? 0.12 : 0.08], [1, core, 0]], { cx: f1(cx), cy: f1(cy), r: f1(R * 0.55), fx: f1(cx), fy: f1(cy), gradientTransform: `translate(${f1(cx)} ${f1(cy)}) scale(${f1(sx * 1.1)} ${f1(sy * 1.1)}) translate(${f1(-cx)} ${f1(-cy)})`, gradientUnits: 'userSpaceOnUse' }));
for (const c of cells) if (Math.hypot((c.x + c.w / 2 - cx) / sx, (c.y + c.h / 2 - cy) / sy) < R * 0.55 + c.w) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${url(gid)}"/>`);
const did = k.id('disc');
const discC = flat ? lit(T) : dark ? mix(sp(230, { dl: 0.06 }), '#ffffff', 0.35) : mix(sp(235), T.colors.surface, 0.2);
k.def(radialGradient(did, [[0, discC, dark ? 0.2 : 0.16], [0.45, discC, dark ? 0.09 : 0.08], [0.8, discC, dark ? 0.03 : 0.03], [1, discC, 0]], { cx: f1(cx), cy: f1(cy), r: f1(R), fx: f1(cx), fy: f1(cy), gradientTransform: `translate(${f1(cx)} ${f1(cy)}) scale(${f1(sx)} ${f1(sy)}) translate(${f1(-cx)} ${f1(-cy)})`, gradientUnits: 'userSpaceOnUse' }));
for (const c of cells) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${url(did)}"/>`);
const B = new Batch(grid);
const P = (r, a) => [cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy];
const bg = lit(T);
for (const c of cells) {
let d = '';
for (let j = 0; j < 7; j++) d += dotD(c.x + c.w * hash(c.i, j, 1), c.y + c.h * hash(c.i, j, 2), Math.max(0.6, u * 0.4 * (0.6 + hash(c.i, j, 3))));
B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(bg, dark ? 0.35 : 0.25), d, 0);
}
const armsN = Number(ctx.params.arms) || 2;
const armA = (r, arm) => rot + (arm / armsN) * TAU + Math.log(r / (R * 0.05)) / 0.32 * 0.34;
const haze = flat ? lit(T) : dark ? mix(sp(230, { dl: 0.06 }), '#ffffff', 0.3) : mix(sp(240), T.colors.surface, 0.3);
for (let arm = 0; arm < armsN; arm++) {
for (const [wid, op] of [[0.62, 0.035], [0.42, 0.04], [0.25, 0.05], [0.11, 0.06]]) {
let prev = null;
for (let s2 = 0; s2 <= 36; s2++) {
const f = 0.08 + 0.9 * (s2 / 36), r = R * f, pt = P(r, armA(r, arm));
if (prev) { const ww = K * wid * (1.4 + 0.8 * Math.round(f * 2) / 2); B.seg(prev[0], prev[1], pt[0], pt[1], ww, strokeP(haze, ww, op * 1.1), 0); }
prev = pt;
}
}
}
const arms = armsN;
const N = Math.round(((w * h) / (K * K)) * 46 * ctx.params.stars);
const blue = flat ? lit(T) : dark ? mix(sp(225, { dl: 0.1 }), '#ffffff', 0.5) : mix(sp(240), T.colors.ink, 0.45);
const warm = flat ? lit(T) : dark ? mix(sp(65, { dl: 0.1 }), '#ffffff', 0.4) : mix(sp(50), T.colors.ink, 0.4);
const rose = flat ? lit(T) : dark ? sp(345, { dl: 0.08 }) : sp(345, { tier: 'ink' });
const dust = dark ? mix(space, '#000000', 0.2) : mix(T.colors.surface, T.colors.ink, 0.08);
const pitch = 0.32; 
for (let i = 0; i < N; i++) {
const arm = i % arms;
const f = Math.pow(hash(i, ctx.seed, 1), 0.6); 
const r = R * (0.05 + 0.95 * f);
const spread = 0.1 + 0.3 * (1 - f) + (i % 5 === 0 ? 0.5 : 0); 
const a = rot + (arm / arms) * TAU + Math.log(r / (R * 0.05)) / pitch * 0.34 + gauss(hash(i, 2), hash(i, 3)) * spread;
const rr = r * (1 + gauss(hash(i, 4), hash(i, 5)) * 0.05);
const [x, y] = P(rr, a);
if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
const big = hash(i, 6) > 0.93;
const sz = Math.max(0.7, u * (big ? 1.2 : 0.5 + 0.4 * hash(i, 7)));
const col = f < 0.28 ? warm : blue;
const op = clamp(0.45 + 0.55 * hash(i, 8)) > 0.75 ? 1 : 0.6;
B.dot(x, y, sz, fillP(col, dark ? op : op * 0.85), 1);
}
const knots = Math.round(((w * h) / (K * K)) * 2.5);
for (let i = 0; i < knots; i++) {
const arm = i % arms, f = 0.3 + 0.65 * hash(i, 31);
const r = R * f;
const a = rot + (arm / arms) * TAU + Math.log(r / (R * 0.05)) / pitch * 0.34 + (hash(i, 32) - 0.5) * 0.16;
const [x, y] = P(r, a);
B.dot(x, y, Math.max(0.9, u * (0.9 + 0.8 * hash(i, 33))), fillP(rose, dark ? 0.9 : 0.8), 2);
if (dark) B.dot(x, y, u * 3, fillP(rose, 0.12), 1);
}
for (let arm = 0; arm < arms && !flat; arm++) {
for (let s = 0; s < 70; s++) {
const f = 0.12 + 0.75 * (s / 70), r = R * f;
const a = rot + (arm / arms) * TAU + Math.log(r / (R * 0.05)) / pitch * 0.34 - 0.22;
const [x, y] = P(r, a);
B.dot(x, y, K * (0.016 + 0.02 * (1 - f)), fillP(dust, dark ? 0.4 : 0.35), 3);
}
}
B.dot(cx, cy, Math.max(1.5, K * 0.035), fillP(dark ? '#ffffff' : flat ? lit(T) : core, 0.95), 4);
B.emit(k);
return k.svg();
},
};
};
__d[238] = function (__ns) {
const { surface, rect, path, n, P, linearGradient, url } = __m(113);
const { clamp, outExpo, lerp } = __m(12);
const { mix } = __m(4);
const { materials, inCell, middleRow, rowCells } = __m(201);
const { text, burst, capHeight } = __m(195);
const { compact, measureText } = __m(11);
__e(__ns, { "default": () => __default }, [], ["default"]);
const FILL = 1.6, SETTLE = 2.6;
const __default = {
id: 'span-goal',
title: 'Goal Tanks',
category: 'Bars & Meters',
description: 'A stream goal across a row of keys: a glass tank per milestone fills with light, a burst when you reach it. You set the count (no supporter or donation source yet).',
tags: ['goal', 'milestone', 'progress', 'stream', 'streaming', 'broadcast', 'creator', 'supporters', 'followers', 'donation', 'meter', 'span', 'obs-style'],
surface: 'span',
span: { cols: 'all', rows: 1 },
fps: 8,
loop: 6,
params: {
label: { type: 'text', default: 'Goal', maxLength: 14, label: 'Label' },
current: { type: 'number', default: 412, min: 0, max: 1000000, step: 1, label: 'Count' },
target: { type: 'number', default: 500, min: 1, max: 1000000, step: 1, label: 'Target' },
unit: { type: 'text', default: 'supporters', maxLength: 14, label: 'Unit' },
hue: { type: 'hue', default: 165.1, min: 0, max: 360, label: 'Hue' },
},
order: 33,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const C = T.colors;
const cells = rowCells(grid, middleRow(grid));
const N = cells.length;
const P0 = ctx.params;
const goal = Math.max(1, P0.target), count = Math.max(0, P0.current);
const pTrue = clamp(count / goal);
const reached = count >= goal;
const since = ctx.reduced ? 99 : ctx.since;
const pNow = pTrue * outExpo(clamp(since / FILL));
const slosh = ctx.reduced ? 0 : Math.exp(-since / 0.7) * (since < SETTLE ? 1 : 0);
materials(k, { toneOf: (c) => (reached ? 'ok' : 'idle') });
const hue = ctx.hue;
const liquidTop = T.spectral(hue + 24), liquidBot = T.spectral(hue - 30);
const curI = Math.max(0, Math.min(N - 1, Math.floor(pNow * N - 1e-9)));
cells.forEach((cell, i) => {
inCell(k, cell, (kk) => {
const u = kk.m.u;
const fc = clamp(pNow * N - i); 
const full = fc >= 0.999;
const tx = kk.m.safe, tw = kk.w - kk.m.safe * 2;
const ty = kk.m.text + capHeight(kk.typeStyle('eyebrow').size, 600) + 3.5 * u, th = kk.h - ty - kk.m.safe;
const r = Math.min(kk.m.radius * 0.7, tw / 4);
const tank = P().M(tx, ty + r).A(r, r, 0, 0, 1, tx + r, ty).H(tx + tw - r).A(r, r, 0, 0, 1, tx + tw, ty + r).V(ty + th - r).A(r, r, 0, 0, 1, tx + tw - r, ty + th).H(tx + r).A(r, r, 0, 0, 1, tx, ty + th - r).Z().d;
kk.add(path(tank, { fill: kk.dark ? mix(C.surface2, '#000000', 0.35) : mix(C.surface2, C.line, 0.3), stroke: C.line, strokeWidth: n(Math.max(1, u * 0.8)) }));
if (fc > 0.002) {
const gid = kk.id('liq');
kk.def(linearGradient(gid, [[0, liquidTop], [1, liquidBot]], { x1: 0, y1: n(ty), x2: 0, y2: n(ty + th), gradientUnits: 'userSpaceOnUse' }));
const cid = kk.id('tank');
kk.def(`<clipPath id="${cid}"><path d="${tank}"/></clipPath>`);
const level = ty + th * (1 - fc);
const amp = !full ? th * 0.06 * slosh : 0;
const lp = P();
const steps = amp > 0.05 ? 10 : 1;
lp.M(tx, ty + th);
for (let s = 0; s <= steps; s++) { const x = tx + (tw * s) / steps; lp.L(x, level + amp * Math.sin((s / steps) * Math.PI * 2 + since * 9 + i)); }
lp.L(tx + tw, ty + th).Z();
kk.add(`<g clip-path="url(#${cid})">${path(lp.d, { fill: url(gid), fillOpacity: kk.dark ? 0.92 : 0.85 })}${!full ? rect({ x: n(tx), y: n(level - Math.max(0.6, u * 0.5)), width: n(tw), height: n(Math.max(1, u)), fill: kk.dark ? '#ffffff' : C.ink, fillOpacity: 0.55 }) : ''}</g>`);
}
const mile = Math.round((goal * (i + 1)) / N);
const eb = i === 0 ? P0.label : (full ? `✓ ${compact(mile)}` : compact(mile));
kk.eyebrow(i === 0 && full ? `${P0.label} ✓` : eb, { color: full ? 'pos' : 'muted', maxWidth: kk.w - kk.m.text * 2 });
if (i === curI || (reached && i === N - 1)) {
const big = Math.min(kk.w, kk.h) >= 110;
const cy = ty + th * 0.48;
const shown = Math.round(count * outExpo(clamp(since / FILL)));
const size = (big ? 21 : 18) * u, str = compact(shown);
const pw = Math.min(tw - u * 3, measureText(str, { size, weight: 700, tabular: true }) + 8 * u), ph = size * 1.05;
kk.add(rect({ x: n(kk.w / 2 - pw / 2), y: n(cy - ph / 2), width: n(pw), height: n(ph), rx: n(ph / 2), fill: kk.dark ? '#000000' : C.surface, fillOpacity: kk.dark ? 0.5 : 0.72 }));
text(kk, str, { x: kk.w / 2, cy, size, weight: 700, tabular: true, color: 'ink', maxWidth: tw - u * 5 });
if (big) text(kk, reached ? P0.unit : `of ${compact(goal)}`, { x: kk.w / 2, cy: cy + ph / 2 + 6 * u, size: 7.5 * u, weight: 600, color: kk.dark ? '#ffffff' : C.ink, opacity: 0.85, maxWidth: tw - u * 4 });
}
if (reached) kk.add(burst(kk, { cx: kk.w / 2, cy: ty + th * 0.45, r0: tw * 0.12, r1: tw * 0.62, age: since - FILL * 0.6 - i * 0.08, dur: 1.1, count: 10, hue: hue + i * 30 }));
}, `g${cell.i}`);
});
void lerp;
return k.svg();
},
};
};
__d[239] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix, shade } = __m(4);
const { clamp } = __m(12);
const { hash, noise1 } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, f1, clipPoly, lit } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 24, TAU = Math.PI * 2;
function tongue(x, y, H, W, s, ph) {
const L = [], R = [];
const N = 9;
for (let i = 0; i <= N; i++) {
const f = i / N;
const cx = x + s * f * f + Math.sin(f * 5.5 + ph) * W * 0.35 * f;
const hw = W * Math.pow(1 - f, 0.75) * (1 + 0.18 * Math.sin(f * 9 + ph * 1.7)) * (f < 0.12 ? 0.75 + f * 2 : 1);
L.push([cx - hw, y - H * f]);
R.unshift([cx + hw, y - H * f]);
}
return [...L, ...R.slice(1)];
}
const __default = {
id: 'span-hearth',
title: 'Hearth',
category: 'Whole Device',
description: 'A fire in the hearth across the whole device: logs on the bottom row, flames climbing through the bezel into the keys above, sparks drifting up, warm light on the brick.',
tags: ['fire', 'fireplace', 'hearth', 'flames', 'cozy', 'warm', 'ambient', 'wall', 'calm', 'winter'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 5,
loop: LOOP,
params: {
blaze: { type: 'number', default: 1, min: 0.5, max: 1.5, step: 0.05, label: 'Blaze' },
sparks: { type: 'bool', default: true, label: 'Sparks' },
budget: BUDGET,
},
order: 62,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const bottom = grid.row + grid.rows - 1;
const floorCells = cells.filter((c) => c.row === bottom);
const { t } = frameClock(ctx, { fps: 5, changing: Math.min(cells.length, grid.cols * Math.min(2, grid.rows) + 2 + Math.ceil(grid.cols * grid.rows * 0.25)), still: 9.6 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const sp = (hh, o) => T.spectral(hh, o);
const blaze = ctx.params.blaze;
const soot = dark ? mix(T.colors.bg, sp(30), flat ? 0 : 0.06) : mix(T.colors.surface, sp(60), flat ? 0 : 0.1);
const warm = dark ? mix(T.colors.bg, sp(35), flat ? 0 : 0.32) : mix(T.colors.surface, sp(45), flat ? 0 : 0.34);
backdrop(k, [[0, soot, dark ? 0.94 : 0.75], [0.55, soot, dark ? 0.94 : 0.75], [1, warm, dark ? 0.94 : 0.85]], { y2: h });
const lvl = 0.85 + 0.15 * Math.round(noise1(Math.floor(t / 2) * 0.9, ctx.seed) * 3) / 3;
const gl = k.id('glow');
const glowC = sp(48, { dl: dark ? 0.04 : 0 });
const fy = floorCells[0].y + floorCells[0].h * 0.72;
k.def(radialGradient(gl, [[0, glowC, n2((dark ? 0.5 : 0.32) * lvl * blaze)], [0.45, glowC, n2((dark ? 0.16 : 0.1) * lvl * blaze)], [1, glowC, 0]], { cx: f1(w / 2), cy: f1(fy), r: f1(Math.max(w * 0.7, K * 2.6)), fx: f1(w / 2), fy: f1(fy), gradientUnits: 'userSpaceOnUse' }));
for (const c of cells) k.add(`<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(c.h)}" fill="${url(gl)}"/>`);
const B = new Batch(grid);
const course = K / 4.2, brick = course * 2.3;
const mortar = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(30), 0.5) : mix(T.colors.ink, sp(40), 0.3);
for (const c of cells) {
let d = '';
const r0 = Math.ceil(c.y / course), r1 = Math.floor((c.y + c.h) / course);
for (let r = r0; r <= r1; r++) {
const y = r * course;
if (y > c.y && y < c.y + c.h) d += `M${f1(c.x)} ${f1(y)}h${f1(c.w)}`;
const off = (r % 2) * brick / 2;
for (let x = Math.ceil((c.x - off) / brick) * brick + off; x < c.x + c.w; x += brick) if (x > c.x) d += `M${f1(x)} ${f1(Math.max(c.y, y))}V${f1(Math.min(c.y + c.h, y + course))}`;
}
const fade = 0.35 + 0.65 * clamp((c.y + c.h / 2) / h);
B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(mortar, Math.max(0.8, u * 0.7), (dark ? 0.32 : 0.16) * fade, 'butt'), d, 0);
}
const logC = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(40), 0.22) : mix(T.colors.ink, sp(45), 0.35);
const logHi = flat ? logC : dark ? mix(T.colors.bg, sp(45), 0.35) : mix(T.colors.ink, sp(50), 0.15);
const ember = sp(32, { dl: dark ? 0.06 : -0.02 });
const fx0 = floorCells[0].x, fx1 = floorCells[floorCells.length - 1].x + floorCells[floorCells.length - 1].w;
const logs = [];
const nLogs = Math.max(2, Math.round(floorCells.length * 0.9));
for (let i = 0; i < nLogs; i++) {
const cx = fx0 + (fx1 - fx0) * ((i + 0.5) / nLogs) + (hash(i, 61) - 0.5) * K * 0.3;
const len = Math.min((fx1 - fx0) / nLogs * 1.5, K * 1.6), th = K * (0.15 + 0.04 * hash(i, 62));
const tilt = (hash(i, 63) - 0.5) * 0.35;
const cy = floorCells[0].y + floorCells[0].h * (0.86 - (i % 2) * 0.1);
logs.push({ cx, cy, len, th, tilt });
}
for (const L of logs) {
const ca = Math.cos(L.tilt), sa = Math.sin(L.tilt);
const P = (lx, ly) => [L.cx + lx * ca - ly * sa, L.cy + lx * sa + ly * ca];
const hl = L.len / 2, ht = L.th / 2;
const body = [];
for (let s = 0; s <= 6; s++) { const a = -Math.PI / 2 + (s / 6) * Math.PI; body.push(P(hl + Math.cos(a) * ht * 0.6, Math.sin(a) * ht)); }
for (let s = 0; s <= 6; s++) { const a = Math.PI / 2 + (s / 6) * Math.PI; body.push(P(-hl + Math.cos(a) * ht * 0.6, Math.sin(a) * ht)); }
B.poly(body, fillP(logC, flat ? (dark ? 0.3 : 0.85) : 1), 8);
B.poly([P(-hl * 0.9, -ht * 0.95), P(hl * 0.9, -ht * 0.95), P(hl * 0.9, -ht * 0.55), P(-hl * 0.9, -ht * 0.55)], fillP(logHi, 0.9), 8);
let d = '';
for (let j = 0; j < 3; j++) {
const lx = -hl * 0.6 + j * hl * 0.6 + (hash(j, L.cx | 0) - 0.5) * hl * 0.2;
const [ax, ay] = P(lx, -ht * 0.3), [bx, by] = P(lx + ht * 0.6, ht * 0.4);
d += `M${f1(ax)} ${f1(ay)}L${f1(bx)} ${f1(by)}`;
}
const pulse = Math.round((0.6 + 0.4 * noise1(t * 0.4 + L.cx * 0.01, ctx.seed)) * 3) / 3;
B.add([L.cx - hl - ht, L.cy - ht * 2, L.cx + hl + ht, L.cy + ht * 2], strokeP(ember, Math.max(1, u * 1.3), pulse), d, 9);
}
const outer = flat ? (dark ? '#ffffff' : T.colors.ink) : shade(sp(30), dark ? -0.1 : -0.06);
const mid = flat ? outer : sp(50, { dl: dark ? 0.02 : 0 });
const core = flat ? (dark ? '#000000' : '#ffffff') : dark ? mix(sp(80, { dl: 0.1 }), '#ffffff', 0.55) : sp(80, { dl: 0.04 });
const base = floorCells[0].y + floorCells[0].h * 0.8;
const nF = Math.max(4, Math.round((fx1 - fx0) / (K * 0.5)));
const Hmax = Math.min(h * (grid.rows <= 2 ? 0.78 : 0.62), K * 2.6);
const bed = (lift, amp, ph) => {
const pts = [[fx0 - K * 0.2, base + K * 0.1]];
for (let x = fx0 - K * 0.2; x <= fx1 + K * 0.2; x += K * 0.06) pts.push([x, base - lift - amp * Math.pow(noise1(x / K * 4.2 + t * 0.9 + ph, ctx.seed), 2.2)]);
pts.push([fx1 + K * 0.2, base + K * 0.1]);
return pts;
};
const bedPolys = [[bed(K * 0.12, K * 0.42, 0), 4], [bed(K * 0.05, K * 0.26, 7), 5]];
for (let i = 0; i < nF; i++) {
const x = fx0 + (fx1 - fx0) * ((i + 0.5 + (hash(i, 71) - 0.5) * 0.5) / nF);
const n1 = noise1(t * 0.9 + i * 3.1, ctx.seed), n2v = noise1(t * 1.3 + i * 1.7 + 40, ctx.seed);
const tall = (0.35 + 0.65 * hash(i, 72) ** 1.2) * (i % 3 === 1 ? 1 : 0.8);
const H = Hmax * tall * (0.7 + 0.42 * n1) * blaze;
const W = Math.max(K * 0.12, H * 0.2) * (0.85 + 0.3 * hash(i, 73)) * (0.85 + 0.25 * n2v);
const s = (n2v - 0.5) * H * 0.3;
const ph = t * 2.2 + i * 1.3;
B.poly(tongue(x, base, H, W, s, ph), fillP(outer, dark ? 0.92 : 1), 4);
B.poly(tongue(x + s * 0.1, base, H * 0.72, W * 0.66, s * 0.8, ph + 0.4), fillP(mid, 0.95), 5);
B.poly(tongue(x + s * 0.12, base, H * 0.42, W * 0.36, s * 0.55, ph + 0.9), fillP(core, flat ? 0.6 : 0.95), 6);
}
for (const [pts, layer] of bedPolys) {
const paint = layer === 4 ? fillP(outer, dark ? 0.92 : 1) : layer === 5 ? fillP(mid, 0.95) : fillP(core, flat ? 0.6 : 0.95);
for (const c of floorCells) { const cl = clipPoly(pts, c); if (cl.length > 2) B.poly(cl, paint, layer); }
}
if (ctx.params.sparks) {
const sparkC = dark ? mix(sp(55, { dl: 0.1 }), '#ffffff', 0.35) : flat ? T.colors.ink : sp(35, { dl: -0.04 });
const nS = Math.max(3, Math.round(grid.cols * (1.2 + grid.rows * 0.4)));
for (let j = 0; j < nS; j++) {
const m = 2 + (j % 3), f = (((t / LOOP) * m + hash(j, 81)) % 1 + 1) % 1;
if (f > 0.7) continue;
const life = f / 0.7;
const x = fx0 + (fx1 - fx0) * hash(j, 82, Math.floor((t / LOOP) * m + hash(j, 81))) + Math.sin(life * 7 + j) * K * 0.2;
const y = base - K * 0.6 - life * (h * 0.9);
const r = Math.max(0.9, K * 0.016 * (1 - life * 0.6));
B.dot(x, y, r, fillP(sparkC, Math.round((1 - life) * 4) / 4), 10);
}
}
if (grid.rows >= 3) {
const mRow = grid.row + grid.rows - 3;
const shelf = cells.filter((c) => c.row === mRow).sort((a, b) => a.col - b.col);
const wood = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(40), 0.4) : mix(T.colors.ink, sp(45), 0.45);
const woodHi = flat ? wood : dark ? mix(T.colors.bg, sp(50), 0.62) : mix(T.colors.ink, sp(55), 0.2);
const sy = shelf[0].y + shelf[0].h * 0.74, sh = K * 0.13;
for (const c of shelf) {
B.add([c.x, sy, c.x + c.w, sy + sh * 1.6], fillP(dark ? '#000000' : T.colors.ink, dark ? 0.35 : 0.12), `M${f1(c.x)} ${f1(sy + sh)}h${f1(c.w)}v${f1(sh * 0.6)}h${f1(-c.w)}Z`, 11);
B.add([c.x, sy, c.x + c.w, sy + sh], fillP(wood, flat ? (dark ? 0.3 : 0.85) : 1), `M${f1(c.x)} ${f1(sy)}h${f1(c.w)}v${f1(sh)}h${f1(-c.w)}Z`, 12);
B.add([c.x, sy, c.x + c.w, sy + sh], fillP(woodHi, 1), `M${f1(c.x)} ${f1(sy)}h${f1(c.w)}v${f1(Math.max(1, sh * 0.22))}h${f1(-c.w)}Z`, 13);
}
const holders = shelf.length >= 3 ? [shelf[0], shelf[shelf.length - 1]] : [shelf[0]];
const waxC = dark ? '#efe4cf' : '#fff8ec', flame = sp(45, { dl: dark ? 0.06 : 0 });
holders.forEach((c, j) => {
const x = c.x + c.w * (j ? 0.3 : 0.7), cw = K * 0.06, ch = K * 0.3;
const fl = 0.85 + 0.15 * Math.round(noise1(t * 2 + j * 5, ctx.seed) * 3) / 3;
B.add([x - cw, sy - ch, x + cw, sy], fillP(waxC, flat ? 0.9 : 1), `M${f1(x - cw)} ${f1(sy - ch)}h${f1(cw * 2)}v${f1(ch)}h${f1(-cw * 2)}Z`, 14);
const fh = K * 0.13 * fl, fw = K * 0.035;
B.poly([[x, sy - ch - K * 0.015 - fh], [x + fw, sy - ch - K * 0.015 - fh * 0.35], [x, sy - ch - K * 0.01], [x - fw, sy - ch - K * 0.015 - fh * 0.35]], fillP(flat ? lit(T) : flame, 1), 15);
if (dark && !flat) B.dot(x, sy - ch - fh * 0.5, K * 0.12, fillP(flame, 0.12), 14);
});
}
B.emit(k);
return k.svg();
},
};
const n2 = (v) => Math.round(clamp(v) * 100) / 100;
};
__d[240] = function (__ns) {
const { surface, rect, radialGradient, linearGradient, url } = __m(113);
const { mix, shade } = __m(4);
const { clamp } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, backdrop, isoPaths, isFlat, f1 } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 48, TAU = Math.PI * 2;
const __default = {
id: 'span-lava',
title: 'Lava Lamp',
category: 'Whole Device',
description: 'The whole device as one lava lamp: warm wax pools on the bottom row, swells, lets go of blobs that rise through the keys, merge, pinch apart and sink back.',
tags: ['lava', 'lamp', 'blobs', 'metaballs', 'retro', 'ambient', 'wall', 'calm', 'screensaver'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 4,
loop: LOOP,
params: {
hue: { type: 'hue', default: 36, min: 0, max: 360, step: 1, label: 'Wax hue' },
drift: { type: 'bool', default: false, label: 'Drift through the Spectrum' },
blobs: { type: 'number', default: 1, min: 0.5, max: 1.6, step: 0.1, label: 'Wax amount' },
budget: BUDGET,
},
order: 60,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const { t } = frameClock(ctx, { fps: 4, changing: grid.cells.length, still: 19 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h);
const p = t / LOOP;
const hue = ctx.params.drift ? (ctx.params.hue + 360 * p) % 360 : ctx.params.hue;
const wax = T.spectral(hue, { dl: dark ? 0.02 : -0.04 }), deep = flat ? wax : shade(T.spectral(hue - 14), dark ? -0.12 : -0.1);
const core = flat ? wax : mix(wax, dark ? '#fff4e0' : '#ffffff', dark ? 0.42 : 0.38);
const liquidTop = dark ? mix(T.colors.bg, T.spectral(hue + 220), flat ? 0 : 0.2) : mix(T.colors.surface, T.spectral(hue + 40), flat ? 0 : 0.14);
const liquidLow = dark ? mix(T.colors.bg, T.spectral(hue + 250), flat ? 0 : 0.34) : mix(T.colors.surface, T.spectral(hue + 10), flat ? 0 : 0.26);
backdrop(k, [[0, liquidTop, 0.9], [1, liquidLow, 0.86]], { y2: h });
const gl = k.id('bulb');
k.def(radialGradient(gl, [[0, dark ? shade(wax, 0.08) : wax, dark ? 0.42 : 0.2], [0.55, wax, dark ? 0.12 : 0.06], [1, wax, 0]], { cx: f1(w / 2), cy: f1(h + K * 0.4), r: f1(Math.max(w, h) * 0.75), fx: f1(w / 2), fy: f1(h + K * 0.4), gradientUnits: 'userSpaceOnUse' }));
for (const c of grid.cells) k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gl) }));
const count = Math.round(clamp((w * h) / (K * K) * 0.42, 4, 12) * ctx.params.blobs);
const blobs = [];
for (let i = 0; i < count; i++) {
const cyc = 1 + (i % 3 === 0 ? 1 : 0); 
const ph = hash(i, ctx.seed, 1);
const a = TAU * (p * cyc + ph);
const fr = ((p * cyc + ph) % 1 + 1) % 1, tri = 1 - Math.abs(2 * fr - 1);
const reach = i % 4 === 1 ? 0.62 : i % 4 === 3 ? 0.8 : 1; 
const u = reach * (0.15 * tri * tri * (3 - 2 * tri) + 0.85 * tri);
const y = h + K * 0.25 - u * (h + K * 0.45);
const vy = Math.abs(Math.sin(a));
const x = w * (0.12 + 0.76 * hash(i, ctx.seed, 2)) + Math.sin(a * 2 + i) * K * 0.18;
const r = K * (0.24 + 0.17 * hash(i, ctx.seed, 3)) * (0.85 + 0.15 * Math.sin(a + 1.3));
blobs.push({ x, y, r2: r * r, sy: 1 + 0.35 * vy * (1 - Math.abs(u - 0.5) * 2) });
}
const pool = K * 0.27, top = K * 0.1;
const field = (x, y, ox = 0, oy = 0) => {
x += ox; y += oy;
let f = 0;
for (const b of blobs) {
const dx = x - b.x, dy = (y - b.y) / b.sy;
f += b.r2 / (dx * dx + dy * dy + 1);
}
const db = Math.max(1, h + K * 0.05 - y), dt = Math.max(1, y + K * 0.1);
f += (pool * pool) / (db * db) * (1 + 0.45 * Math.sin(x / K * 2.1 + p * TAU) + 0.25 * Math.sin(x / K * 4.7 - p * TAU * 2));
f += (top * top) / (dt * dt);
return f;
};
const B = new Batch(grid);
const step = Math.max(3, K / 30);
const halo = dark ? 0.16 : 0.12;
const wg = k.id('wax');
k.def(linearGradient(wg, [[0, deep], [0.55, wax], [1, flat ? wax : mix(wax, '#ffe2b0', dark ? 0.35 : 0.15)]], { x1: 0, y1: 0, x2: 0, y2: f1(h), gradientUnits: 'userSpaceOnUse' }));
for (const c of grid.cells) {
const r = { x: c.x - step, y: c.y - step, w: c.w + step * 2, h: c.h + step * 2 };
const [dHalo, dBody] = isoPaths(field, r, step, [0.8, 1]);
const [dCore] = isoPaths((x, y) => field(x, y, K * 0.06, K * 0.08), r, step, [3.2]);
const box = [c.x, c.y, c.x + c.w, c.y + c.h];
B.add(box, fillP(wax, halo, 'evenodd'), dHalo, 0);
B.add(box, flat ? fillP(wax, 1, 'evenodd') : `fill="${url(wg)}" fill-rule="evenodd"`, dBody, 1);
B.add(box, flat ? fillP(dark ? '#000000' : '#ffffff', 0.35, 'evenodd') : fillP(core, dark ? 0.5 : 0.55, 'evenodd'), dCore, 2);
}
B.emit(k);
return k.svg();
},
};
};
__d[241] = function (__ns) {
const { surface, linearGradient, url, n } = __m(113);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, spectrumHue } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const GENS = 48;
function board(grid, per) {
const cell = grid.key.w / per;
const gx = Math.max(1, Math.round(grid.gapX / cell)), gy = Math.max(1, Math.round(grid.gapY / (grid.key.h / per)));
const W = grid.cols * per + (grid.cols - 1) * gx, H = grid.rows * per + (grid.rows - 1) * gy;
return { per, gx, gy, W, H, cw: grid.key.w / per, ch: grid.key.h / per };
}
function simulate(B, epoch, steps, seed) {
const { W, H } = B;
let a = new Uint8Array(W * H), age = new Uint16Array(W * H), dead = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = hash(x, y, epoch, seed) < 0.3 ? 1 : 0;
for (let s = 0; s < steps; s++) {
const b = new Uint8Array(W * H), ag = new Uint16Array(W * H), dd = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
let c = 0;
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += a[((y + dy + H) % H) * W + ((x + dx + W) % W)];
const i = y * W + x, live = a[i] ? c === 2 || c === 3 : c === 3;
b[i] = live ? 1 : 0;
ag[i] = live ? (a[i] ? Math.min(999, age[i] + 1) : 0) : 0;
dd[i] = !live && a[i] ? 1 : 0;
}
a = b; age = ag; dead = dd;
}
return { alive: a, age, dead };
}
const __default = {
id: 'span-life',
title: 'Life',
category: 'Whole Device',
description: "Conway's Game of Life across the whole device — the board continues behind the bezels, so gliders vanish into one key and emerge from the next.",
tags: ['life', 'conway', 'cellular', 'automaton', 'generative', 'ambient', 'wall', 'span'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 2,
loop: 24,
params: {
cells: { type: 'number', default: 6, min: 4, max: 10, step: 1, label: 'Cells per key' },
budget: BUDGET,
},
order: 50,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const { frame } = frameClock(ctx, { fps: 2, changing: grid.cells.length, still: 6 });
materials(k);
const B = board(grid, Math.round(ctx.params.cells));
const epoch = Math.floor(frame / GENS), step = frame % GENS;
const { alive, age, dead } = simulate(B, epoch, step, ctx.seed);
const fadeIn = Math.min(1, (step + 1) / 3), fadeOut = Math.min(1, (GENS - step) / 3);
const vis = Math.min(fadeIn, fadeOut);
const gid = k.id('hue');
const stops = [0, 0.25, 0.5, 0.75, 1].map((f) => [f, T.spectral(spectrumHue(f), { dl: T.dark ? 0.02 : 0 })]);
k.def(linearGradient(gid, stops, { x1: 0, y1: 0, x2: ctx.w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
const pad = Math.max(1, Math.round(k.m.u * 1.1));
const hot = T.dark ? (T.colors.beam || '#ffffff') : T.colors.ink;
for (const c of grid.cells) {
const bx = (c.col - grid.col) * (B.per + B.gx), by = (c.row - grid.row) * (B.per + B.gy);
let mature = '', born = '', ghost = '';
for (let y = 0; y < B.per; y++) for (let x = 0; x < B.per; x++) {
const i = (by + y) * B.W + (bx + x);
const px = c.x + x * B.cw + pad / 2, py = c.y + y * B.ch + pad / 2, w = B.cw - pad, h = B.ch - pad;
const sq = `M${n(px)} ${n(py)}h${n(w)}v${n(h)}h${n(-w)}Z`;
if (alive[i]) { if (age[i] === 0) born += sq; else mature += sq; } else if (dead[i]) ghost += sq;
}
if (ghost) k.add(`<path d="${ghost}" fill="${url(gid)}" fill-opacity="${n(0.22 * vis, 3)}"/>`);
if (mature) k.add(`<path d="${mature}" fill="${url(gid)}"${vis < 1 ? ` fill-opacity="${n(vis, 3)}"` : ''}/>`);
if (born) k.add(`<path d="${born}" fill="${hot}" fill-opacity="${n(0.78 * vis, 3)}"/>`);
}
return k.svg();
},
};
};
__d[242] = function (__ns) {
const { surface, textPath, measureText, capHeight, linearGradient, url, rect, n } = __m(113);
const { BUDGET, frameClock, materials, middleRow, rowCells, spectrumHue, half } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'span-marquee',
title: 'Marquee',
category: 'Text & Marquee',
description: 'Big type sliding across a row of keys: one continuous line of text that passes behind the bezels, colored by the Spectrum as it travels.',
tags: ['marquee', 'text', 'ticker', 'scroll', 'banner', 'headline', 'span'],
surface: 'span',
span: { cols: 'all', rows: 1 },
fps: 10,
loop: 12,
params: {
text: { type: 'text', default: 'WHITE LIGHT IN · EVERY COLOR OUT ·', maxLength: 64, label: 'Text' },
speed: { type: 'number', default: 0.6, min: 0.2, max: 3, step: 0.05, label: 'Speed (keys per second)' },
color: { type: 'select', default: 'spectrum', options: ['spectrum', 'ink', 'hue'], label: 'Color' },
hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
budget: BUDGET,
},
order: 20,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const cells = grid.rows > 1 ? grid.cells : rowCells(grid, grid.row);
const { t } = frameClock(ctx, { fps: 10, changing: cells.length, still: 3.2 });
materials(k);
const str = String(ctx.params.text || ' ').replace(/\s+/g, ' ');
const KW = grid.key.w, KH = grid.key.h;
const pitch = KW + grid.gapX;
const size = grid.rows > 1 ? Math.min(ctx.h * 0.86, KH * grid.rows * 0.8) : KH * 0.66;
const weight = 700;
const tracking = 0.01;
const cap = capHeight(size, weight);
const mid = grid.rows > 1 ? ctx.h / 2 : (cells[0].y + KH / 2);
const base = half(mid + cap / 2);
const textW = measureText(str, { size, weight, tracking });
const period = textW + pitch * 0.9;
const travel = (t * ctx.params.speed * pitch) % period;
let fill;
if (ctx.params.color === 'spectrum') {
const id = k.id('spec');
const stops = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => [f, T.spectral(spectrumHue(1 - f), { dl: T.dark ? 0.03 : -0.02 })]);
k.def(linearGradient(id, stops, { x1: 0, y1: 0, x2: ctx.w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
fill = url(id);
} else fill = ctx.params.color === 'hue' ? T.ink(ctx.hue) : T.colors.ink;
const bid = k.id('beam'), beamC = T.colors.beam || '#ffffff';
k.def(linearGradient(bid, [[0, beamC, 0], [0.5, beamC, 1], [1, beamC, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
for (const c of cells) if (grid.rows === 1 || c.row === middleRow(grid)) k.add(rect({ x: c.x + k.m.safe, y: n(base + size * 0.12), width: c.w - k.m.safe * 2, height: k.m.hair, fill: url(bid), fillOpacity: T.dark ? 0.35 : 0.5 }));
const chars = [...str];
const xs = chars.map((ch, i) => measureText(chars.slice(0, i + 1).join(''), { size, weight, tracking }) - measureText(ch, { size, weight }));
let x0 = ctx.w - travel;
while (x0 > -period) x0 -= period;
for (let start = x0; start < ctx.w + size; start += period) {
chars.forEach((ch, i) => {
if (ch === ' ') return;
const x = half(start + xs[i]);
if (x > ctx.w + 2 || x < -size * 1.2) return;
k.add(textPath(ch, { x, y: base, size, weight, fill }));
});
}
return k.svg();
},
};
};
__d[243] = function (__ns) {
const { surface, keyInto, radialGradient, linearGradient, url } = __m(113);
const { clamp, smoothstep, outExpo, outCubic, lerp } = __m(12);
const { BUDGET, frameClock, Batch, strokeP, fillP, polyD, rectD, f1 } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const AXIS = 12 * Math.PI / 180; 
const FACES = ['mic', 'camera', 'volume', 'play-pause', 'scene', 'chat', 'record', 'broadcast', 'bulb', 'timer', 'home', 'lock', 'music-note', 'headphones', 'mail', 'calendar', 'cpu', 'wifi', 'folder', 'search', 'note', 'coffee', 'stopwatch', 'skip-next', 'shuffle', 'terminal', 'code', 'rocket', 'cloud', 'sync', 'target', 'marker', 'mixer', 'viewers', 'alarm', 'fan'];
const BEAM_IN = 0.8, STRIKE = 2.6, FAN = 3.0, SETTLE = 0.9;
const __default = {
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
const nK = cells.length, sweep = clamp((nK - 1) * 0.3, 2.6, 9.5), stagger = sweep / Math.max(1, nK - 2);
const { t: tq } = frameClock(ctx, { fps: 8, changing: Math.min(nK, Math.ceil((SETTLE + 0.3) / stagger) + 2), still: 5.6 });
const L = 16;
const pace = ctx.params.pace;
let tt = ctx.params.replay ? tq % L : Math.min(tq, L - 1.4);
if (ctx.reduced) tt = L - 1.4;
const tl = tt * pace;
const dark = T.dark;
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const beamC = T.colors.beam && dark ? T.colors.beam : '#ffffff'; 
const prism = cells.reduce((b, c) => (Math.hypot(c.x + c.w / 2 - w / 2, c.y + c.h / 2 - h / 2) < Math.hypot(b.x + b.w / 2 - w / 2, b.y + b.h / 2 - h / 2) ? c : b), cells[0]);
const px = prism.x + prism.w / 2, py = prism.y + prism.h / 2;
const S = K * 0.5;
const A = [px, py - S * 0.5], Bp = [px - S * 0.56, py + S * 0.42], Cp = [px + S * 0.56, py + S * 0.42];
const strike = [lerp(A[0], Bp[0], 0.5), lerp(A[1], Bp[1], 0.5)];
const entry = [-K * 0.25, -K * 0.25];
const order = cells.filter((c) => c !== prism).sort((a, b) => Math.hypot(a.x - prism.x, a.y - prism.y) - Math.hypot(b.x - prism.x, b.y - prism.y) || a.i - b.i);
const span = sweep; 
const at = new Map(order.map((c, j) => [c.i, FAN + (j / Math.max(1, order.length - 1)) * span]));
at.set(prism.i, FAN + span + 0.4);
const end = FAN + span + 0.4 + SETTLE;
const outro = ctx.params.replay ? smoothstep(L - 1.2, L - 0.2, tt) : 0;
const hueOf = (c) => {
const a = Math.atan2(c.y + c.h / 2 - py, c.x + c.w / 2 - px);
let d = Math.abs(a - (AXIS - Math.PI / 2)) % (Math.PI * 2);
if (d > Math.PI) d = Math.PI * 2 - d;
return 24 + 276 * (d / Math.PI);
};
let blk = '';
for (const c of cells) blk += `<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="#000000"/>`;
k.add(blk);
cells.forEach((c, idx) => {
const t0 = at.get(c.i);
const s = tl - t0;
if (s < 0 && c !== prism) return; 
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
const box = kk.theme.glyphBox(kk, { labeled: !!ctx.params.labels });
const grow = 1 + 0.12 * (1 - outCubic(settle));
const size = box.size * grow, off = (1 - outCubic(settle)) * kk.m.u * 3;
kk.glyph(g, { labeled: !!ctx.params.labels, box: { x: box.x + (box.size - size) / 2 - off, y: box.y + (box.size - size) / 2, size }, t: 0, since: 60, state: isPrism && g === 'power' ? 'on' : undefined });
if (ctx.params.labels) kk.label(ctx.glyphs.get(g).title.split(' ')[0]);
kk.add('</g>');
}
if (s >= 0 && s < SETTLE + 0.3 && !(isPrism && s < 0)) {
const flash = (1 - smoothstep(0.05, SETTLE + 0.3, s)) * smoothstep(-0.02, 0.06, s) * (1 - outro);
if (flash > 0.02) {
const col = T.spectral(hue, { dl: dark ? 0.04 : 0 });
const id = kk.id('fl');
const dx = px - (c.x + c.w / 2), dy = py - (c.y + c.h / 2), dl = Math.hypot(dx, dy) || 1;
kk.def(radialGradient(id, [[0, col, f1(0.95 * flash)], [0.55, col, f1(0.45 * flash)], [1, col, f1(0.12 * flash)]], { cx: f1(0.5 + (dx / dl) * 0.45), cy: f1(0.5 + (dy / dl) * 0.45), r: 1 }));
kk.add(`<path d="${rectD(0, 0, kk.w, kk.h)}" fill="${url(id)}"/>`);
kk.add(`<path d="${rectD(kk.m.safe, 0, kk.w - kk.m.safe * 2, kk.m.line)}" fill="${dark ? '#ffffff' : col}" fill-opacity="${f1(flash)}"/>`);
}
}
}, { tag: `f${c.i}`, clip: false });
});
const B = new Batch(grid);
const beamF = clamp((tl - BEAM_IN) / (STRIKE - BEAM_IN));
const fanOut = 1 - smoothstep(FAN + 0.4, FAN + 1.6, tl); 
if (beamF > 0 && fanOut > 0.01 && outro < 0.99) {
const head = [lerp(entry[0], strike[0], outCubic(beamF)), lerp(entry[1], strike[1], outCubic(beamF))];
const bw = Math.max(1.5, K * 0.022);
const op = fanOut * (1 - outro);
B.seg(entry[0], entry[1], head[0], head[1], bw * 4, strokeP(beamC, bw * 4, 0.16 * op), 1);
B.seg(entry[0], entry[1], head[0], head[1], bw, strokeP(beamC, bw, op), 2);
if (beamF < 1) B.dot(head[0], head[1], bw * 2.2, fillP(beamC, op), 3);
}
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
};
__d[244] = function (__ns) {
const { surface, rect, circle, linearGradient, url, n } = __m(113);
const { clamp, lerp, smoothstep, outCubic, phase } = __m(12);
const { noise1 } = __m(1);
const { BUDGET, frameClock, materials, inCell, middleRow, rowCells, half } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const RUN = 11, DONE = 2, LOOP = 14;
function simulated(tt, seed) {
if (tt >= RUN) return 1;
const u = tt / RUN;
const base = u < 0.62 ? outCubic(u / 0.62) * 0.7 : u < 0.74 ? 0.7 + 0.02 * smoothstep(0.62, 0.74, u) : lerp(0.72, 1, smoothstep(0.74, 1, u));
return clamp(base - 0.03 * noise1(tt * 1.7, seed) * (1 - u));
}
const __default = {
id: 'span-progress',
title: 'Progress Across a Row',
category: 'Bars & Meters',
description: 'One progress bar across a row of keys: a Spectrum fill with a white-light head that passes behind the bezels, the percent in the last key, a flash when done.',
tags: ['progress', 'bar', 'upload', 'render', 'export', 'download', 'meter', 'span'],
surface: 'span',
span: { cols: 'all', rows: 1 },
fps: 8,
loop: LOOP,
params: {
label: { type: 'text', default: 'Exporting', maxLength: 16, label: 'Label' },
source: { type: 'select', default: 'simulate', options: ['simulate', 'value'], label: 'Source' },
value: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Value (source: value)' },
hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
budget: BUDGET,
},
order: 31,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const row = middleRow(grid);
const cells = rowCells(grid, row);
const { t } = frameClock(ctx, { fps: 8, changing: 3, still: 6.5 });
const tt = phase(t, LOOP) * LOOP;
const live = ctx.params.source === 'value';
const p = live ? clamp(ctx.value) : simulated(tt, ctx.seed);
const done = p >= 1;
const flash = live ? 0 : smoothstep(RUN, RUN + 0.25, tt) * (1 - smoothstep(RUN + 0.6, RUN + DONE, tt));
const reset = live ? 1 : 1 - smoothstep(RUN + DONE, LOOP, tt);
materials(k);
const KH = grid.key.h, u = k.m.u, hue = ctx.hue;
const y = cells[0].y + KH * 0.64, th = Math.max(3, Math.round(4 * u));
const x0 = cells[0].x + k.m.safe * 1.4, x1 = cells[cells.length - 1].x + grid.key.w - k.m.safe * 1.4;
const head = half(lerp(x0, x1, p));
const fid = k.id('fill');
k.def(linearGradient(fid, [[0, T.spectral(hue + 105)], [0.5, T.spectral(hue)], [1, T.spectral(hue - 52)]], { x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' }));
const beamC = T.colors.beam || '#ffffff';
for (const c of cells) {
const a = Math.max(c.x, x0), b = Math.min(c.x + c.w, x1);
if (b <= a) continue;
k.add(rect({ x: a, y: y - th / 2, width: b - a, height: th, rx: th / 2, fill: T.colors.line, fillOpacity: T.dark ? 0.85 : 1 }));
let ticks = '';
for (let i = 0; i <= 10; i++) { const tx = half(lerp(x0, x1, i / 10)); if (tx >= a && tx <= b) ticks += `M${n(tx)} ${n(y + th * 1.4)}v${n(i % 5 ? th * 0.9 : th * 1.6)}`; }
if (ticks) k.add(`<path d="${ticks}" stroke="${T.colors.dim}" stroke-width="${n(Math.max(1, k.m.hair))}" fill="none"/>`);
const lit = Math.min(b, head) - a;
if (lit > 0.5 && reset > 0.01) k.add(rect({ x: a, y: y - th / 2, width: half(lit), height: th, rx: th / 2, fill: url(fid), fillOpacity: reset < 1 ? n(reset, 3) : null }));
if (head >= a - th && head <= b + th && !done && reset > 0.01) {
k.add(circle({ cx: head, cy: y, r: th * 2.2, fill: beamC, fillOpacity: T.dark ? 0.16 : 0.12 }));
k.add(rect({ x: head - Math.max(1, k.m.hair) / 2, y: y - th * 2.6, width: Math.max(1, k.m.hair), height: th * 5.2, fill: T.dark ? beamC : T.ink(hue), fillOpacity: 0.85 }));
k.add(circle({ cx: head, cy: y, r: th * 0.9, fill: T.dark ? beamC : T.ink(hue) }));
}
if (flash > 0.01) {
const gid = k.id(`ok${c.i}`);
k.def(`<radialGradient id="${gid}" cx="0.5" cy="1.05" r="0.85"><stop offset="0" stop-color="${T.colors.pos}" stop-opacity="${n(0.4 * flash, 3)}"/><stop offset="1" stop-color="${T.colors.pos}" stop-opacity="0"/></radialGradient>`);
k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gid) }));
}
}
const last = cells[cells.length - 1], first = cells[0];
const pct = `${Math.floor(p * 100 + 1e-6)}%`;
inCell(k, last, (kk) => {
if (done && reset > 0.5) kk.value('✓', { cy: kk.h * 0.33, color: 'pos' });
else kk.value(pct, { cy: kk.h * 0.33, opacity: reset > 0.5 ? 1 : 0.4 });
}, `ro${last.i}`);
if (first !== last) inCell(k, first, (kk) => kk.eyebrow(done && reset > 0.5 ? 'Done' : ctx.params.label, { y: kk.h * 0.38, x: kk.m.text, color: done ? 'pos' : 'muted' }), `lb${first.i}`);
return k.svg();
},
};
};
__d[245] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, dotD, ellipseD, f1 } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 30;
const __default = {
id: 'span-rain-glass',
title: 'Rain on Glass',
category: 'Ripples & Light',
description: 'A rainy window across the device: town lights glow out of focus, droplets bead on the glass, and now and then one runs down through the keys, clearing a trail.',
tags: ['rain', 'window', 'glass', 'droplets', 'bokeh', 'evening', 'cozy', 'ambient', 'wall', 'calm'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 6,
loop: LOOP,
params: {
rain: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Rain' },
budget: BUDGET,
},
order: 46,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const runners = Math.max(2, Math.round(grid.cols * 0.8 * ctx.params.rain));
const { t } = frameClock(ctx, { fps: 6, changing: Math.min(cells.length, runners * 1.5 + 2 + Math.ceil(cells.length * 0.12)), still: 12 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const sp = (hh, o) => T.spectral(hh, o);
const p = t / LOOP;
const top = dark ? mix(T.colors.bg, sp(255), flat ? 0 : 0.18) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.14), sp(210), 0.16);
const low = dark ? mix(T.colors.bg, sp(30), flat ? 0 : 0.12) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.1), sp(140), 0.16);
backdrop(k, [[0, top, 0.94], [1, low, 0.94]], { y2: h });
const hues = dark ? [40, 60, 25, 200, 330] : [140, 120, 95, 200, 60];
const grads = hues.map((hh, i) => {
const id = k.id(`bk${i}`), c = flat ? (dark ? '#ffffff' : T.colors.ink) : sp(hh, { dl: dark ? 0.04 : 0.02 });
k.def(radialGradient(id, [[0, c, dark ? 0.42 : 0.36], [0.62, c, dark ? 0.3 : 0.24], [0.85, c, dark ? 0.1 : 0.08], [1, c, 0]]));
return id;
});
for (const c of cells) {
const nb = 2 + Math.floor(hash(c.i, ctx.seed, 1) * 3);
for (let j = 0; j < nb; j++) {
const bx = c.x + c.w * hash(c.i, j, 2), by = c.y + c.h * (0.25 + 0.75 * hash(c.i, j, 3)) * (dark ? 1 : 0.9);
const r = K * (0.12 + 0.2 * hash(c.i, j, 4));
k.add(`<circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(r)}" fill="${url(grads[Math.floor(hash(c.i, j, 5) * grads.length)])}"/>`);
}
}
const B = new Batch(grid);
const lanes = [];
for (let i = 0; i < runners; i++) {
const m = 1 + (i % 2); 
const lap = Math.floor(p * m + hash(i, 11)), f = ((p * m + hash(i, 11)) % 1 + 1) % 1;
const x = w * (0.06 + 0.88 * hash(i, ctx.seed, 12, lap));
const runT = 0.42; 
const s = f < runT ? f / runT : 1;
const steps = 5, q = s * steps, qi = Math.floor(q), qf = q - qi;
const prog = s >= 1 ? 1 : (qi + smoothstep(0.35, 1, qf)) / steps;
const y = -K * 0.1 + prog * (h + K * 0.3);
const fill = clamp((f - runT) / (1 - runT)); 
lanes.push({ x, y, s, fill, wob: hash(i, 13, lap) * 6 });
}
const bead = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(top, '#ffffff', 0.16) : mix(low, '#ffffff', 0.4);
const rim = flat ? bead : dark ? mix(T.colors.bg, '#000000', 0.4) : mix(T.colors.ink, sp(220), 0.3);
const hi = dark ? '#ffffff' : '#ffffff';
const xWob = (L, y) => L.x + Math.sin(y / K * 2.2 + L.wob) * K * 0.08;
for (const c of cells) {
let body = '', shade = '', glint = '';
const nb = Math.round((14 + 12 * hash(c.i, 21)) * ctx.params.rain);
for (let j = 0; j < nb; j++) {
const bx = c.x + c.w * (0.04 + 0.92 * hash(c.i, j, 22)), by = c.y + c.h * (0.04 + 0.92 * hash(c.i, j, 23));
const born = hash(c.i, j, 24), life = hash(c.i, j, 28) < 0.75 ? 1 : 0.5 + 0.4 * hash(c.i, j, 25);
const age = ((p - born) % 1 + 1) % 1;
if (age > life) continue;
if (lanes.some((L) => Math.abs(bx - xWob(L, by)) < K * 0.08 && by < L.y && L.s > 0 && hash(c.i, j, 26) > L.fill)) continue;
const r = Math.max(0.8, K * (0.014 + 0.042 * hash(c.i, j, 27) ** 2));
body += dotD(bx, by, r);
shade += ellipseD(bx, by + r * 0.45, r * 0.85, r * 0.5);
if (r > 1.6) glint += dotD(bx - r * 0.3, by - r * 0.35, Math.max(0.5, r * 0.28));
}
const box = [c.x, c.y, c.x + c.w, c.y + c.h];
B.add(box, fillP(rim, dark ? 0.45 : 0.3), shade, 1);
B.add(box, fillP(bead, flat ? 0.7 : 0.75), body, 2);
B.add(box, fillP(hi, dark ? 0.85 : 0.9), glint, 3);
}
for (const L of lanes) {
if (L.s <= 0) continue;
const r = K * 0.045;
const trailTop = -K * 0.1;
for (const c of cells) {
if (L.x < c.x - K * 0.2 || L.x > c.x + c.w + K * 0.2) continue;
const y0 = Math.max(c.y, trailTop), y1 = Math.min(c.y + c.h, L.y - r);
if (y1 > y0 && L.fill < 0.9) {
const pts = [];
for (let y = y0; y <= y1 + 0.1; y += K * 0.06) pts.push([xWob(L, y), y]);
const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');
B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(dark ? mix(top, '#000000', 0.25) : mix(low, '#ffffff', 0.3), r * 1.1, 0.5 * (1 - L.fill)), d, 4);
B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(hi, Math.max(0.6, u * 0.4), 0.3 * (1 - L.fill)), d, 5);
}
}
if (L.s < 1) {
const hx = xWob(L, L.y);
B.add([hx - r * 2, L.y - r * 2, hx + r * 2, L.y + r * 2], fillP(rim, dark ? 0.55 : 0.4), ellipseD(hx, L.y + r * 0.4, r * 1.05, r * 1.15), 6);
B.add([hx - r * 2, L.y - r * 2, hx + r * 2, L.y + r * 2], fillP(bead, 0.9), ellipseD(hx, L.y, r, r * 1.15), 7);
B.dot(hx - r * 0.35, L.y - r * 0.45, r * 0.3, fillP(hi, 0.95), 8);
}
}
B.emit(k);
return k.svg();
},
};
};
__d[246] = function (__ns) {
const { surface, rect, path, ellipse, linearGradient, url, n } = __m(113);
const { clamp, outCubic } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, vClip, spectrumHue, half } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'span-rain',
title: 'Spectral Rain',
category: 'Ripples & Light',
description: 'Streaks of colored light rain down the whole device, falling through the rows behind the bezels and splashing in the bottom row; calm, sparse and seamless.',
tags: ['rain', 'drops', 'ambient', 'screensaver', 'spectrum', 'calm', 'span'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 10,
loop: 12,
params: {
density: { type: 'number', default: 1.6, min: 0.5, max: 3, step: 0.1, label: 'Density (drops per column)' },
color: { type: 'select', default: 'spectrum', options: ['spectrum', 'hue', 'white'], label: 'Color' },
hue: { type: 'hue', default: 217.5, min: 0, max: 360, label: 'Hue' },
budget: BUDGET,
},
order: 41,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const streams = Math.max(2, Math.round(grid.cols * ctx.params.density));
const { t, dt } = frameClock(ctx, { fps: 10, changing: Math.min(grid.cells.length, Math.ceil(streams * 2)), still: 3.3 });
materials(k);
const KW = grid.key.w, KH = grid.key.h, u = k.m.u;
const bottomRow = grid.row + grid.rows - 1;
const floor = grid.cells.find((c) => c.row === bottomRow).y + KH - k.m.safe; 
const LOOP = 12;
for (let j = 0; j < streams; j++) {
const laps = 2 + Math.floor(hash(j, ctx.seed, 2) * 3); 
const period = LOOP / laps;
const ph = hash(j, ctx.seed, 3);
const f = (t / period + ph) % 1;
const col = grid.cells[j % grid.cols]; 
const x = half(col.x + KW * (0.18 + 0.64 * hash(j, ctx.seed, 4, Math.floor(t / period + ph))));
const fall = 0.72; 
const top = -KH * 0.4, len = floor - top;
const vel = len / (period * fall);
const hue = ctx.params.color === 'spectrum' ? spectrumHue(hash(j, ctx.seed, 5)) : ctx.hue;
const c = ctx.params.color === 'white' ? (T.dark ? (T.colors.beam || '#ffffff') : T.colors.ink) : T.spectral(hue, { dl: T.dark ? 0.04 : 0 });
if (f < fall) {
const yHead = top + (f / fall) * len;
const tail = Math.max(KH * 0.55, vel * dt * 1.15);
const y0 = yHead - tail;
const gid = k.id(`r${j}`);
k.def(linearGradient(gid, [[0, c, 0], [0.8, c, 0.75], [1, c, 1]], { x1: 0, y1: y0, x2: 0, y2: yHead, gradientUnits: 'userSpaceOnUse' }));
const w = Math.max(2, 2.2 * u);
for (const cell of grid.cells) {
const seg = vClip(cell, x, y0, yHead);
if (!seg) continue;
k.add(rect({ x: n(x - w * 2), y: n(seg[0]), width: n(w * 4), height: n(seg[1] - seg[0]), rx: n(w * 2), fill: url(gid), fillOpacity: 0.16 }));
k.add(rect({ x: n(x - w / 2), y: n(seg[0]), width: n(w), height: n(seg[1] - seg[0]), rx: n(w / 2), fill: url(gid) }));
if (yHead >= cell.y && yHead <= cell.y + cell.h) k.add(rect({ x: n(x - w), y: n(yHead - w * 2), width: n(w * 2), height: n(w * 2), rx: n(w), fill: T.dark ? '#ffffff' : c, fillOpacity: 0.9 }));
}
} else {
const s = (f - fall) / (1 - fall);
const cell = grid.cells.find((cc) => cc.row === bottomRow && x >= cc.x && x <= cc.x + cc.w);
if (!cell || s > 0.8) continue;
const e = outCubic(clamp(s / 0.8));
const rx = KW * (0.06 + 0.3 * e), ry = rx * 0.24;
k.add(ellipse({ cx: x, cy: n(floor - ry), rx: n(rx), ry: n(ry), fill: 'none', stroke: c, strokeWidth: n(Math.max(1.25, k.m.line)), strokeOpacity: n((1 - e) * 0.95, 3) }));
if (s < 0.3) for (const sgn of [-1, 1]) k.add(path(`M${n(x + sgn * rx * 0.3)} ${n(floor - ry * 2)}l${n(sgn * KW * 0.05 * (0.5 + e))} ${n(-KH * 0.1 * (1 - e))}`, { stroke: c, strokeWidth: n(Math.max(1, k.m.hair * 1.2)), strokeOpacity: n(1 - s / 0.3, 3), strokeLinecap: 'round', fill: 'none' }));
}
}
return k.svg();
},
};
};
__d[247] = function (__ns) {
const { surface, rect, path, radialGradient, url, n } = __m(113);
const { clamp, smoothstep, outCubic, lerp } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, runsInRect, runsPath, circlePoints, half } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LIFE = 3.2; 
const DROP = 2.2; 
const __default = {
id: 'span-ripple',
title: 'Ripple',
category: 'Ripples & Light',
description: 'Press a key and a ring of light spreads from it across the device, splitting into the Spectrum and lighting each key it crosses; idle, drops fall like rain on a pond.',
tags: ['ripple', 'press', 'wave', 'water', 'refraction', 'touch', 'ambient', 'span'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
press: 'momentary',
fps: 10,
loop: DROP * 4,
params: {
drops: { type: 'bool', default: true, label: 'Idle drops' },
speed: { type: 'number', default: 1, min: 0.4, max: 2.5, step: 0.05, label: 'Wave speed' },
budget: BUDGET,
},
order: 40,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 10, changing: Math.max(Math.ceil(cells.length * 0.55), Math.min(cells.length, 6)), still: 0.9 });
materials(k);
const KW = grid.key.w, KH = grid.key.h, K = Math.min(KW, KH);
const pitch = Math.hypot(KW + grid.gapX, KH + grid.gapY);
const reach = Math.hypot(ctx.w, ctx.h) * 1.05;
const vel = (reach / LIFE) * ctx.params.speed;
const center = (c) => [c.x + c.w / 2, c.y + c.h / 2];
const centerCell = cells.reduce((best, c) => (Math.hypot(...center(c).map((v, i) => v - [ctx.w / 2, ctx.h / 2][i])) < Math.hypot(...center(best).map((v, i) => v - [ctx.w / 2, ctx.h / 2][i])) ? c : best), cells[0]);
const waves = [];
const pressAge = ctx.pressed ? 0 : ctx.pressAge;
const quiet = !(pressAge < LIFE + 1.4);
if (pressAge < LIFE * ctx.params.speed ** -1 + 0.3) {
const origin = cells.find((c) => c.i === ctx.pressKey) || centerCell;
const q = Math.max(0, pressAge - (ctx.t - t)); 
waves.push({ o: center(origin), age: q, gain: 1, held: !!ctx.pressed, cell: origin });
}
if (ctx.params.drops && quiet) {
const idx = Math.floor(t / DROP);
for (const d of [idx - 1, idx]) {
const age = t - d * DROP;
if (age < 0 || age > LIFE / ctx.params.speed) continue;
const c = cells[Math.floor(hash(d, ctx.seed, 41) * cells.length)];
const [cx, cy] = center(c);
waves.push({ o: [cx + (hash(d, 3) - 0.5) * KW * 0.5, cy + (hash(d, 4) - 0.5) * KH * 0.5], age, gain: 0.55, cell: c });
}
}
const hues = [24, 150, 296]; 
const lw = Math.max(1.25, k.m.line * 1.15);
for (const c of cells) {
const cc = center(c);
let glow = 0, glowHue = 191;
let rings = '';
const ringPaths = [];
for (const wv of waves) {
const R = wv.age * vel;
const fade = (1 - smoothstep(0.55, 1, wv.age * ctx.params.speed / LIFE)) * wv.gain;
if (fade <= 0.01) continue;
const d = Math.hypot(cc[0] - wv.o[0], cc[1] - wv.o[1]);
const near = 1 - clamp(Math.abs(d - R) / (pitch * 0.55));
if (near * fade > glow) { glow = near * fade; glowHue = lerp(296, 24, clamp(d / reach * 1.6)); }
if (wv.held && c === wv.cell) glow = Math.max(glow, 0.7);
for (const [lag, gain] of [[0, 1], [0.32, 0.45]]) {
const Rr = (wv.age - lag) * vel;
if (Rr <= 1) continue;
const split = K * 0.06 * (0.6 + 0.8 * clamp(wv.age));
const front = runsInRect(circlePoints(wv.o[0], wv.o[1], Rr, Math.max(3, K / 18)), c, lw * 4);
if (front.length && gain === 1) ringPaths.push({ d: runsPath(front), color: T.colors.beam || '#ffffff', op: fade * (T.dark ? 0.16 : 0.22), width: lw * 5.5 });
hues.forEach((h, j) => {
const r = Rr - (j - 1) * split;
if (r <= 0) return;
const runs = runsInRect(circlePoints(wv.o[0], wv.o[1], r, Math.max(3, K / 18)), c, lw);
if (runs.length) ringPaths.push({ d: runsPath(runs), color: T.spectral(h, { dl: T.dark ? 0.05 : 0 }), op: fade * gain * (j === 1 ? 1 : 0.85), width: lw * (j === 1 ? 1.2 : 1) });
});
}
}
if (glow > 0.02) {
const gid = k.id(`g${c.i}`), col = T.spectral(glowHue);
k.def(radialGradient(gid, [[0, col, n((T.dark ? 0.5 : 0.32) * glow, 3)], [0.6, col, n((T.dark ? 0.16 : 0.1) * glow, 3)], [1, col, 0]], { cx: 0.5, cy: 0.5, r: 0.75 }));
k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gid) }));
}
for (const rp of ringPaths) rings += path(rp.d, { fill: 'none', stroke: rp.color, strokeWidth: n(rp.width), strokeOpacity: n(clamp(rp.op), 3), strokeLinecap: 'round', strokeLinejoin: 'round' });
if (rings) k.add(`<g>${rings}</g>`);
}
for (const wv of waves) {
if (!wv.held && wv.age > 0.35) continue;
const a = wv.held ? 1 : 1 - outCubic(clamp(wv.age / 0.35));
const gid = k.id(`p${Math.round(wv.o[0])}x${Math.round(wv.o[1])}`);
const c = T.colors.beam || '#ffffff';
k.def(radialGradient(gid, [[0, c, n(0.9 * a, 3)], [0.35, c, n(0.3 * a, 3)], [1, c, 0]]));
const r = K * (wv.held ? 0.3 : 0.18 + 0.2 * clamp(wv.age / 0.35));
k.add(rect({ x: half(wv.o[0] - r), y: half(wv.o[1] - r), width: half(r * 2), height: half(r * 2), fill: url(gid) }));
}
return k.svg();
},
};
};
__d[248] = function (__ns) {
const { surface, circle, rect, n } = __m(113);
const { clamp, outExpo } = __m(12);
const { mix } = __m(4);
const { materials, inCell, middleRow, rowCells } = __m(201);
const { flap, flapColors, text, burst, capHeight } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const UNDO = 0.5, FLIP = 0.55;
function plan(nKeys) {
const side = nKeys >= 7 ? 3 : nKeys >= 4 ? 2 : 1;
const mid = Math.max(0, nKeys - side * 2);
const A = side === 3 ? [{ kind: 'name', team: 'a' }, { kind: 'd', team: 'a', place: 0 }, { kind: 'd', team: 'a', place: 1 }]
: side === 2 ? [{ kind: 'd', team: 'a', place: 0, name: true }, { kind: 'd', team: 'a', place: 1 }] : [{ kind: 'pair', team: 'a', name: true }];
const B = A.map((s) => ({ ...s, team: 'b' }));
const B2 = side === 3 ? [B[1], B[2], B[0]] : side === 2 ? [{ ...B[0], name: true }, { ...B[1], name: false }] : B;
if (side === 2) { A[0].name = true; B2[0].name = false; B2[1].name = true; }
const M = Array.from({ length: mid }, (_, i) => ({ kind: i === 0 ? 'vs' : 'blank' }));
return [...A, ...M, ...B2].slice(0, nKeys);
}
const __default = {
id: 'span-scoreboard',
title: 'Scoreboard',
category: 'Text & Marquee',
description: 'Two teams on split-flap cards across a row: tap a team to score, hold half a second to take one back, first-to target lights the winner.',
tags: ['score', 'scoreboard', 'game night', 'tally', 'split flap', 'teams', 'counter', 'span'],
surface: 'span',
span: { cols: 'all', rows: 1 },
animated: false,
fps: 10,
loop: 2,
params: {
teamA: { type: 'text', default: 'Home', maxLength: 10, label: 'Team A' },
teamB: { type: 'text', default: 'Away', maxLength: 10, label: 'Team B' },
hueA: { type: 'hue', default: 243.6, min: 0, max: 360, label: 'Team A hue' },
hueB: { type: 'hue', default: 34.2, min: 0, max: 360, label: 'Team B hue' },
to: { type: 'number', default: 0, min: 0, max: 99, step: 1, label: 'First to (0 = no target)' },
},
game: {
animate: 1,
init({ grid }) { return { a: 0, b: 0, cols: grid.cols, down: null }; },
reduce(s, ev) {
if (ev.type === 'press') {
if (ev.col === undefined || ev.col === null) return s;
const slot = plan(s.cols)[ev.col];
if (!slot || !slot.team) return s;
return { ...s, down: { team: slot.team, t: ev.t } };
}
if (ev.type === 'release' && s.down) {
const held = ev.t - s.down.t;
const team = s.down.team;
const v = Math.max(0, Math.min(99, s[team] + (held >= UNDO ? -1 : 1)));
return { ...s, [team]: v, down: null };
}
return s;
},
},
order: 26,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const C = T.colors;
const cells = rowCells(grid, middleRow(grid));
const slots = plan(cells.length);
const s = ctx.game || { a: 0, b: 0, down: null };
const prev = ctx.gamePrev;
const ev = ctx.gameEvent;
const age = ev ? ev.age : 99;
const P = ctx.params;
const to = P.to;
const winner = to > 0 ? (s.a >= to ? 'a' : s.b >= to ? 'b' : null) : null;
const lead = s.a === s.b ? null : s.a > s.b ? 'a' : 'b';
materials(k, { toneOf: (c) => { const sl = slots[cells.indexOf(c)]; return sl?.team && sl.team === winner ? 'ok' : 'idle'; } });
const F = flapColors(k);
const hueOf = { a: P.hueA, b: P.hueB };
const nameOf = { a: P.teamA, b: P.teamB };
cells.forEach((cell, i) => {
const slot = slots[i];
if (!slot) return;
inCell(k, cell, (kk) => {
const u = kk.m.u;
const pad = kk.m.safe * 0.8;
const team = slot.team;
const tint = team ? T.spectral(hueOf[team]) : C.muted;
const deep = team ? T.spectral(hueOf[team], { tier: 'ink' }) : C.muted;
const ink = kk.dark ? tint : deep;
if (slot.kind === 'vs') {
text(kk, winner ? 'WIN' : 'VS', { cy: kk.h * 0.46, size: 15 * u, weight: 700, tracking: 0.1, color: winner ? 'pos' : 'muted' });
text(kk, to > 0 ? `to ${to}` : lead ? `${nameOf[lead]} leads` : 'tied', { cy: kk.h * 0.7, size: 8 * u, weight: 600, color: 'dim', maxWidth: kk.w - kk.m.text * 2, minSize: 6.5 * u });
return;
}
if (slot.kind === 'blank') return;
if (slot.kind === 'name') {
const r = Math.min(kk.w, kk.h) * 0.16;
kk.add(circle({ cx: n(kk.w / 2), cy: n(kk.h * 0.38), r: n(r), fill: tint }));
if (lead === team || winner === team) kk.add(circle({ cx: n(kk.w / 2), cy: n(kk.h * 0.38), r: n(r * 1.55), fill: 'none', stroke: tint, strokeWidth: n(Math.max(1, u)), strokeOpacity: 0.6 }));
text(kk, nameOf[team], { cy: kk.h * 0.72, size: 12 * u, weight: 700, color: ink, maxWidth: kk.w - kk.m.text * 1.6, minSize: 7 * u });
return;
}
const val = s[team], was = prev ? prev[team] : val;
const str = String(val).padStart(2, '0'), pstr = String(was).padStart(2, '0');
const flipping = ev && ev.type === 'release' && val !== was && !ctx.reduced;
const p = flipping ? clamp(age / FLIP) * 1.25 : 9;
const nameH = slot.name ? 10 * u : 0;
const x = pad, y = pad + nameH, cw = kk.w - pad * 2, ch = kk.h - pad * 2 - nameH;
const cur = slot.kind === 'pair' ? str : str[slot.place];
const prv = slot.kind === 'pair' ? pstr : pstr[slot.place];
const size = slot.kind === 'pair' ? Math.min(ch * 0.66, cw * 0.72) : Math.min(ch * 0.8, cw * 1.25);
flap(kk, { x, y, w: cw, h: ch, r: kk.m.radius * 0.6, prev: prv, cur, p, size, weight: 700, tag: `s${cell.i}`, colors: F });
kk.add(rect({ x: n(x + cw * 0.2), y: n(y + ch - Math.max(1.5, 1.6 * u)), width: n(cw * 0.6), height: n(Math.max(1.5, 1.6 * u)), rx: n(u), fill: tint }));
if (slot.name) text(kk, nameOf[team], { x: kk.w / 2, y: pad + capHeight(8 * u, 600) + u * 0.5, size: 8 * u, weight: 600, caps: true, tracking: 0.1, color: ink, maxWidth: kk.w - kk.m.text * 1.6, minSize: 6.5 * u });
if (s.down && s.down.team === team && ev?.type === 'press' && age > 0.18) {
const o = clamp((age - 0.18) / 0.25);
const undo = age >= UNDO;
kk.add(rect({ x: n(x), y: n(y), width: n(cw), height: n(ch), rx: n(kk.m.radius * 0.6), fill: undo ? C.warn : tint, fillOpacity: n(0.22 * o, 3) }));
if (slot.kind === 'pair' || slot.place === 1) text(kk, undo ? '−1' : '+1', { x: x + cw - 3 * u, y: y + 11 * u, size: 10 * u, anchor: 'end', weight: 700, color: undo ? C.warn : ink, opacity: o });
}
if (winner === team && ev && ev.type === 'release' && prev && prev[team] < to) kk.add(burst(kk, { cx: kk.w / 2, cy: kk.h / 2, r0: cw * 0.15, r1: cw * 0.7, age: age - 0.3, dur: 1, count: 10, hue: hueOf[team] }));
}, `sb${cell.i}`);
});
void mix; void outExpo;
return k.svg();
},
};
};
__d[249] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep } = __m(12);
const { hash, noise1 } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, flakeD, polyD, clipPoly, dotD, f1, lit } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 60, TAU = Math.PI * 2;
const __default = {
id: 'span-snowfall',
title: 'Snowfall',
category: 'Whole Device',
description: 'Snow falls across the device in three depths and settles on the bottom row; the drift deepens through the minute until a gust lifts it off in a glittering spray.',
tags: ['snow', 'winter', 'weather', 'flakes', 'calm', 'ambient', 'wall', 'seasonal', 'screensaver'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 4,
loop: LOOP,
params: {
density: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Snow' },
settle: { type: 'bool', default: true, label: 'Settle on the bottom row' },
budget: BUDGET,
},
order: 63,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 40 });
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const sp = (hh, o) => T.spectral(hh, o);
const skyTop = dark ? mix(T.colors.bg, sp(250), flat ? 0 : 0.2) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.34), sp(235), 0.22);
const skyLow = dark ? mix(T.colors.bg, sp(225), flat ? 0 : 0.3) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.16), sp(225), 0.18);
backdrop(k, [[0, skyTop, 0.92], [1, skyLow, 0.92]], { y2: h });
const snow = flat ? (dark ? '#ffffff' : T.colors.ink) : '#ffffff';
const shadow = flat ? snow : dark ? mix(T.colors.bg, sp(230), 0.55) : mix(T.colors.surface, sp(230), 0.35);
const B = new Batch(grid);
const p = t / LOOP;
const bottom = grid.row + grid.rows - 1;
const floorCells = cells.filter((c) => c.row === bottom);
const floorY = floorCells[0].y + floorCells[0].h;
const grow = smoothstep(0, 0.9, p), gust = smoothstep(0.9, 0.985, p);
const depth = ctx.params.settle ? K * (0.16 + 0.4 * grow * (1 - gust)) : 0;
const surfaceAt = (x) => floorY - depth * (0.7 + 0.3 * noise1(x / K * 1.3, ctx.seed) + 0.15 * Math.sin(x / K * 3.1)) - K * 0.02;
const pine = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(170), 0.3) : mix(T.colors.ink, sp(170), 0.4);
const nP = Math.max(2, Math.round(floorCells.length * 1.2));
for (let i = 0; i < nP; i++) {
const c = floorCells[i % floorCells.length];
const x = c.x + c.w * (0.18 + 0.64 * hash(i, 71)), ph = c.h * (0.62 + 0.3 * hash(i, 72)), pw = ph * 0.34;
if (i % floorCells.length === Math.floor(floorCells.length / 2) && floorCells.length > 1 && i < floorCells.length) continue; 
const yb = floorY - K * 0.06;
const tiers = [[1, 0.34], [0.68, 0.62], [0.4, 0.9]];
for (const [wf, hf] of tiers) {
const top = yb - ph * hf, half = pw * wf;
B.poly([[x, top - ph * 0.12], [x + half, top + ph * 0.3], [x - half, top + ph * 0.3]], fillP(pine, flat ? (dark ? 0.35 : 0.8) : 1), 2);
B.poly([[x, top - ph * 0.12], [x + half * 0.55, top + ph * 0.08], [x, top + ph * 0.03], [x - half * 0.55, top + ph * 0.08]], fillP(snow, dark ? 0.9 : 1), 2);
}
}
const lampCell = floorCells[Math.floor(floorCells.length / 2)];
const lx = lampCell.x + lampCell.w * 0.5, ly = lampCell.y + lampCell.h * 0.26;
const warm = flat ? lit(T) : T.spectral(70, { dl: dark ? 0.1 : 0.02 });
const post = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, '#000000', 0.3) : T.colors.ink;
const lg = k.id('lamp');
k.def(radialGradient(lg, [[0, warm, dark ? 0.5 : 0.45], [0.3, warm, dark ? 0.2 : 0.18], [1, warm, 0]]));
B.raw([lx - K * 0.55, ly - K * 0.45, lx + K * 0.55, ly + K * 0.65], `<circle cx="${f1(lx)}" cy="${f1(ly + K * 0.08)}" r="${f1(K * 0.55)}" fill="${url(lg)}"/>`, 1);
B.add([lx - K * 0.03, ly, lx + K * 0.03, floorY], fillP(post, 1), `M${f1(lx - K * 0.018)} ${f1(ly + K * 0.06)}h${f1(K * 0.036)}V${f1(floorY)}h${f1(-K * 0.036)}Z`, 2);
B.poly([[lx - K * 0.07, ly], [lx + K * 0.07, ly], [lx + K * 0.045, ly + K * 0.09], [lx - K * 0.045, ly + K * 0.09]], fillP(post, 1), 2);
B.add([lx - K * 0.05, ly, lx + K * 0.05, ly + K * 0.08], fillP(warm, 1), `M${f1(lx - K * 0.04)} ${f1(ly + K * 0.015)}h${f1(K * 0.08)}l${f1(-K * 0.02)} ${f1(K * 0.06)}h${f1(-K * 0.04)}Z`, 2);
B.add([lx - K * 0.08, ly - K * 0.05, lx + K * 0.08, ly], fillP(snow, 1), `M${f1(lx - K * 0.08)} ${f1(ly)}q${f1(K * 0.08)} ${f1(-K * 0.07)} ${f1(K * 0.16)} 0Z`, 2);
const inLamp = (x, y) => Math.hypot(x - lx, (y - ly - K * 0.1) * 0.8) < K * 0.42;
const area = (w * h) / (K * K);
const layers = [
{ n: Math.round(area * 4 * ctx.params.density), laps: 1, r: 0.012, o: 0.5, sway: 0.08 },
{ n: Math.round(area * 2.6 * ctx.params.density), laps: 2, r: 0.026, o: 0.8, sway: 0.14 },
{ n: Math.round(area * 0.7 * ctx.params.density), laps: 3, r: 0.055, o: 0.95, sway: 0.22, crystal: true },
];
const H = h + K * 0.4;
layers.forEach((L, li) => {
for (let i = 0; i < L.n; i++) {
const y = ((hash(li, i, 1) + (p * L.laps)) % 1) * H - K * 0.2;
const x = w * hash(li, i, 2) + Math.sin(TAU * (p * (1 + (i % 3)) + hash(li, i, 3))) * K * L.sway;
if (ctx.params.settle && y > surfaceAt(x) - K * L.r) continue; 
const r = Math.max(0.7, K * L.r * (0.75 + 0.5 * hash(li, i, 4)));
if (L.crystal && r > 2.4) {
const rot = TAU * (p * (i % 2 ? 1 : -1) + hash(li, i, 5));
B.add([x - r, y - r, x + r, y + r], strokeP(snow, Math.max(0.8, r * 0.22), L.o), flakeD(x, y, r, rot), 6);
B.dot(x, y, r * 0.22, fillP(snow, L.o), 6);
} else B.dot(x, y, r, fillP(inLamp(x, y) && !flat ? mix(snow, warm, 0.45) : snow, L.o), li + 3);
}
});
if (ctx.params.settle) {
const pts = [];
for (let x = floorCells[0].x - 2; x <= w + 2; x += K / 14) pts.push([x, surfaceAt(x)]);
const body = [...pts, [w + 2, floorY + 2], [floorCells[0].x - 2, floorY + 2]];
const shade = pts.map(([x, y]) => [x, y + K * 0.07 + depth * 0.45]).concat([[w + 2, floorY + 2], [floorCells[0].x - 2, floorY + 2]]);
for (const c of floorCells) {
const a = clipPoly(body, c), b = clipPoly(shade, c);
if (a.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(snow, flat ? (dark ? 0.85 : 0.18) : dark ? 0.92 : 0.96), polyD(a), 4);
if (b.length > 2 && !flat) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(shadow, dark ? 0.3 : 0.3), polyD(b), 5);
if (flat && a.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(snow, Math.max(1, u), 1), polyD(a.filter(([, y]) => y < floorY), false), 5);
}
if (gust > 0 && gust < 1) {
let d = '';
for (let j = 0; j < 40; j++) {
const x0 = w * hash(j, 91), y0 = surfaceAt(x0);
const g = clamp(gust * 1.2 - hash(j, 92) * 0.2);
const x = x0 + g * K * (0.8 + 1.4 * hash(j, 93)), y = y0 - Math.sin(g * Math.PI) * K * (0.5 + 0.9 * hash(j, 94)) - g * K * 0.2;
d += dotD(x, y, Math.max(0.7, K * 0.016));
}
B.add([0, floorCells[0].y - K * 1.6, w, floorY], fillP(snow, 0.8 * (1 - gust)), d, 6);
}
}
B.emit(k);
return k.svg();
},
};
};
__d[250] = function (__ns) {
const { surface, rect, linearGradient, url, n } = __m(113);
const { clamp } = __m(12);
const { noise1, fbm1 } = __m(1);
const { BUDGET, frameClock, materials, spectrumHue } = __m(201);
__e(__ns, { "default": () => __default }, [], ["default"]);
function sim(f, j, t, seed) {
const beat = t * 2; 
const kick = Math.exp(-(beat % 1) * 5.5), snare = Math.exp(-((beat + 0.5) % 2) * 4), hat = Math.exp(-((beat * 2) % 1) * 8);
const tilt = 0.92 - 0.3 * f;
const bass = Math.max(0, 1 - f / 0.32) * 0.72 * kick;
const mid = (0.45 + 0.4 * Math.sin(t * 0.37 + 1.1)) * Math.exp(-(((f - (0.42 + 0.22 * Math.sin(t * 0.83))) / 0.16) ** 2)) * 0.62;
const crack = Math.exp(-(((f - 0.55) / 0.2) ** 2)) * snare * 0.4;
const air = Math.max(0, (f - 0.62) / 0.38) * hat * 0.5;
const grain = 0.55 * noise1(t * (2.2 + 3.5 * f) + j * 7.31, seed) * (0.5 + 0.5 * fbm1(t * 0.6 + j * 0.13, seed + 9));
return clamp(1.12 * Math.pow(Math.max(0, tilt * (0.08 + bass + mid + crack + air + grain * 0.6)), 0.82));
}
function resample(bands, count) {
return Array.from({ length: count }, (_, i) => {
const a = (i / count) * bands.length, b = ((i + 1) / count) * bands.length;
let s = 0, w = 0;
for (let j = Math.floor(a); j < Math.ceil(b); j++) { const o = Math.min(b, j + 1) - Math.max(a, j); s += clamp(+bands[j] || 0) * o; w += o; }
return w ? s / w : 0;
});
}
const __default = {
id: 'span-spectrum',
title: 'Spectrum Bars',
category: 'Bars & Meters',
description: 'Spectrum-analyzer bars across keys, warm bass to violet treble, with falling peak caps; on taller spans the bars rise through the rows behind the bezels.',
tags: ['spectrum', 'analyzer', 'equalizer', 'audio', 'bars', 'music', 'visualizer', 'span'],
surface: 'span',
span: { cols: 'all', rows: 1 },
data: ['spectrum'],
fps: 12,
loop: 8,
params: {
bars: { type: 'number', default: 3, min: 1, max: 6, step: 1, label: 'Bars per key' },
style: { type: 'select', default: 'bars', options: ['bars', 'segments'], label: 'Style' },
budget: BUDGET,
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T } = ctx;
const { t, dt } = frameClock(ctx, { fps: 12, changing: grid.cells.length, still: 2.1 });
materials(k);
const per = Math.round(ctx.params.bars), cols = grid.cols;
const count = cols * per;
const live = ctx.data.spectrum?.bands;
const level = (i, tt) => sim(i / Math.max(1, count - 1), i, tt, ctx.seed);
const vals = live?.length ? resample(live, count) : Array.from({ length: count }, (_, i) => level(i, t));
const peaks = live?.length ? vals : vals.map((v, i) => {
let p = v;
for (let s = 1; s <= 10; s++) { const back = s * Math.max(dt, 0.1); p = Math.max(p, level(i, t - back) - 2.4 * back * back); }
return clamp(p);
});
const u = k.m.u, KW = grid.key.w, KH = grid.key.h;
const pad = k.m.safe * 1.1, gap = Math.max(2, Math.round(3 * u));
const bw = (KW - pad * 2 - gap * (per - 1)) / per;
const top0 = grid.cells[0].y + k.m.safe * 1.2; 
const bot = grid.cells[grid.cells.length - 1].y + KH - k.m.safe * 1.4; 
const H = bot - top0;
const cap = Math.max(2, Math.round(2.2 * u));
const seg = ctx.params.style === 'segments';
const segH = Math.max(3, Math.round(5 * u)), segGap = Math.max(1, Math.round(2 * u));
const cellsByCol = new Map();
for (const c of grid.cells) { if (!cellsByCol.has(c.col)) cellsByCol.set(c.col, []); cellsByCol.get(c.col).push(c); }
for (let i = 0; i < count; i++) {
const col = grid.col + Math.floor(i / per), j = i % per;
const column = cellsByCol.get(col);
if (!column) continue;
const x = column[0].x + pad + j * (bw + gap);
const hue = spectrumHue(i / Math.max(1, count - 1));
const c = T.spectral(hue, { dl: T.dark ? 0.02 : 0 });
const gid = k.id(`b${i}`);
k.def(linearGradient(gid, [[0, c, T.dark ? 0.55 : 0.7], [1, c, 1]], { x1: 0, y1: bot, x2: 0, y2: top0, gradientUnits: 'userSpaceOnUse' }));
const yTop = bot - Math.max(0.02, vals[i]) * H;
const yPeak = Math.round(bot - peaks[i] * H);
for (const cell of column) {
const a = Math.max(cell.y + k.m.safe * 0.6, yTop), b = Math.min(cell.y + cell.h - k.m.safe * 0.6, bot);
if (b > a) {
if (seg) {
let d = '';
for (let yy = bot; yy - segH >= a - segH * 0.5; yy -= segH + segGap) {
const y1 = Math.min(yy, b), y0 = Math.max(yy - segH, cell.y);
if (y0 >= b || y1 <= cell.y || y1 - y0 < 1) continue;
d += `M${n(x)} ${n(y0)}h${n(bw)}V${n(y1)}h${n(-bw)}Z`;
}
if (d) k.add(`<path d="${d}" fill="${url(gid)}"/>`);
} else k.add(rect({ x: n(x), y: n(Math.round(a)), width: n(bw), height: n(Math.round(b) - Math.round(a)), rx: n(Math.min(bw / 2, 2 * u)), fill: url(gid) }));
}
if (yPeak - cap >= cell.y + k.m.safe * 0.4 && yPeak <= cell.y + cell.h - k.m.safe * 0.4 && peaks[i] > vals[i] + 0.015) {
k.add(rect({ x: n(x), y: n(yPeak - cap - Math.max(1, u)), width: n(bw), height: cap, rx: n(cap / 2), fill: T.dark ? (T.colors.beam || '#ffffff') : T.ink(hue), fillOpacity: T.dark ? 0.9 : 1 }));
}
}
}
return k.svg();
},
};
};
__d[251] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, polyD, clipPoly, dotD, ellipseD, f1, lit } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 16, TAU = Math.PI * 2;
const __default = {
id: 'span-swell',
title: 'Ocean Swell',
category: 'Whole Device',
description: 'The open sea across the device: a horizon through the upper keys, long swells rolling toward you, a glitter path under the low sun by day or the moon by night.',
tags: ['ocean', 'sea', 'waves', 'swell', 'horizon', 'water', 'calm', 'ambient', 'wall', 'nature'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 4,
loop: LOOP,
params: {
sky: { type: 'select', default: 'theme', options: ['theme', 'night', 'day'], label: 'Sky (theme = Night/Day)' },
budget: BUDGET,
},
order: 65,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 6.4 });
materials(k, { tone: 'off' });
const flat = isFlat(T);
const night = ctx.params.sky === 'theme' ? T.dark : ctx.params.sky === 'night';
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const sp = (hh, o) => T.spectral(hh, o);
const base = T.dark ? T.colors.bg : T.colors.surface;
let hy = h * (grid.rows <= 2 ? 0.36 : 0.3);
const hc = cells.reduce((b, c) => (Math.abs(c.y + c.h / 2 - hy) < Math.abs(b.y + b.h / 2 - hy) ? c : b), cells[0]);
hy = clamp(hy, hc.y + hc.h * 0.45, hc.y + hc.h * 0.75);
const skyTop = flat ? base : night ? mix(base, sp(260), 0.22) : mix('#ffffff', sp(225), 0.5);
const skyLow = flat ? base : night ? mix(base, sp(235), 0.42) : mix('#ffffff', sp(55), 0.35);
const seaFar = flat ? base : night ? mix(base, sp(230), 0.38) : mix(sp(220), '#ffffff', 0.25);
const seaNear = flat ? base : night ? mix(base, sp(240), 0.16) : mix(sp(235), '#000000', 0.12);
const glow = flat ? lit(T) : night ? mix('#ffffff', sp(220), 0.2) : mix('#fff6dc', sp(70), 0.2);
const skyCells = cells.filter((c) => c.y < hy), seaCells = cells.filter((c) => c.y + c.h > hy);
backdrop(k, [[0, skyTop, 0.94], [1, skyLow, 0.94]], { id: 'sky', y2: hy, cells: skyCells });
const B = new Batch(grid);
const sunCell = cells.filter((c) => c.row === hc.row).reduce((b, c) => (Math.abs(c.x + c.w / 2 - w * 0.66) < Math.abs(b.x + b.w / 2 - w * 0.66) ? c : b), hc);
const sr = K * (night ? 0.16 : 0.18), sx = sunCell.x + sunCell.w * 0.55, sy = Math.max(sunCell.y + sr * 1.4, hy - K * 0.42);
const gl = k.id('glow');
k.def(radialGradient(gl, [[0, glow, night ? 0.35 : 0.85], [0.35, glow, night ? 0.12 : 0.4], [1, glow, 0]], { cx: f1(sx), cy: f1(sy), r: f1(K * 1.6), fx: f1(sx), fy: f1(sy), gradientUnits: 'userSpaceOnUse' }));
for (const c of skyCells) if (Math.abs(c.x + c.w / 2 - sx) < K * 1.6 + c.w / 2) k.add(`<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(Math.min(c.h, hy - c.y))}" fill="${url(gl)}"/>`);
if (night && !flat) {
for (const c of skyCells) {
let d = '';
for (let j = 0; j < 6; j++) { const y = c.y + (Math.min(c.y + c.h, hy) - c.y) * hash(c.i, j, 2) * 0.9; d += dotD(c.x + c.w * hash(c.i, j, 1), y, Math.max(0.7, u * 0.5 * (0.6 + hash(c.i, j, 3)))); }
B.add([c.x, c.y, c.x + c.w, hy], fillP('#ffffff', 0.55), d, 0);
}
}
B.dot(sx, sy, sr, fillP(flat ? lit(T) : night ? mix('#ffffff', sp(80), 0.12) : '#fffaf0', 1), 1);
if (night && !flat) B.dot(sx + sr * 0.35, sy - sr * 0.15, sr * 0.82, fillP(skyLow, 0.55), 1); 
const NB = Math.round(6 + grid.rows * 2.5);
const flow = (t / LOOP) * 2 % 1; 
const yOf = (s) => hy + (h + K * 0.2 - hy) * Math.pow(clamp(s / NB), 1.7);
const crest = (s, x) => {
const near = clamp(s / NB);
const A = K * (0.012 + 0.11 * near * near);
const L = K * (0.35 + 1.5 * near);
return yOf(s) - A * (0.6 * Math.sin((x / L) * TAU + TAU * (t / LOOP) + s * 1.7) + 0.4 * Math.sin((x / L) * TAU * 0.47 - TAU * (t / LOOP) * 2 + s));
};
const cHi = flat ? lit(T) : night ? mix(seaFar, '#ffffff', 0.45) : '#ffffff';
for (let b = -1; b < NB; b++) {
const s0 = b + flow, s1 = b + 1 + flow;
if (s1 < 0) continue;
const near = clamp(s0 / NB);
const col = mix(seaFar, seaNear, Math.pow(near, 0.8));
const face = mix(col, night ? seaFar : '#ffffff', (night ? 0.12 : 0.14) * (1 - near * 0.5));
for (const c of seaCells) {
const top = [], bot = [];
const step = Math.max(3, c.w / 24);
for (let x = c.x; x <= c.x + c.w + 0.01; x += step) { top.push([x, Math.max(hy, crest(Math.max(0, s0), x))]); bot.push([x, Math.max(hy, crest(s1, x))]); }
if (bot.every(([, y]) => y < c.y) || top.every(([, y]) => y > c.y + c.h)) continue;
const band = clipPoly([...top, ...bot.reverse()], c);
if (!flat && band.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(b % 2 ? col : face), polyD(band), 2);
if (s0 >= 0.3) {
const line = top.filter(([, y]) => y >= c.y && y <= c.y + c.h);
if (line.length > 1) B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(cHi, Math.max(0.8, u * (0.5 + 1.2 * near)), flat ? 0.4 + 0.5 * near : (night ? 0.22 : 0.4) * (0.4 + near)), polyD(line, false), 3);
}
}
}
const gC = flat ? lit(T) : night ? '#ffffff' : mix('#ffffff', sp(70), 0.25);
const nG = Math.round((h - hy) / K * 26);
for (let j = 0; j < nG; j++) {
const s = NB * Math.pow(hash(j, 5), 1.3), y = yOf(s);
const spread = K * (0.15 + 0.9 * clamp(s / NB));
const x = sx + (hash(j, 6, Math.floor(t * 2)) - 0.5) * 2 * spread * (0.4 + 0.6 * hash(j, 7));
if (hash(j, 8, Math.floor(t * 2)) < 0.4) continue;
const len = K * (0.03 + 0.1 * clamp(s / NB));
B.add([x - len, y - 2, x + len, y + 2], fillP(gC, night ? 0.75 : 0.9), ellipseD(x, y, len, Math.max(0.6, len * 0.16)), 4);
}
B.emit(k);
return k.svg();
},
};
};
__d[252] = function (__ns) {
const { surface, radialGradient, url } = __m(113);
const { mix } = __m(4);
const { clamp, smoothstep } = __m(12);
const { hash } = __m(1);
const { BUDGET, frameClock, materials, Batch, strokeP, fillP, backdrop, isFlat, lit, f1, rectD } = __m(202);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LOOP = 20;
const speed = (s) => 1 + 3 * smoothstep(11, 14.6, s) + 9 * smoothstep(14.2, 15.2, s) * (1 - smoothstep(15.6, 17.4, s)) - 3 * smoothstep(15.4, 19.6, s);
const N_INT = 400;
const CUM = (() => { const a = new Float64Array(N_INT + 1); for (let i = 1; i <= N_INT; i++) a[i] = a[i - 1] + speed(((i - 0.5) / N_INT) * LOOP) * (LOOP / N_INT); return a; })();
const PASSES = 4;
const dist = (s) => {
const lap = Math.floor(s / LOOP), q = ((s % LOOP) + LOOP) % LOOP, f = (q / LOOP) * N_INT, i = Math.floor(f);
const v = CUM[i] + (CUM[Math.min(N_INT, i + 1)] - CUM[i]) * (f - i);
return (lap + v / CUM[N_INT]) * PASSES;
};
const __default = {
id: 'span-warp',
title: 'Warp',
category: 'Whole Device',
description: 'Stars stream out of a vanishing point at the middle of the device: a calm cruise, the drive spools up, streaks split into the Spectrum, a white flash, then cruise again.',
tags: ['warp', 'stars', 'space', 'hyperspace', 'starfield', 'sci-fi', 'speed', 'wall', 'ambient'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
fps: 4,
loop: LOOP,
params: {
stars: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Stars' },
jump: { type: 'bool', default: true, label: 'Jump every 20 s' },
budget: BUDGET,
},
order: 64,
render(ctx) {
const k = surface(ctx);
const { grid, theme: T, w, h } = ctx;
const cells = grid.cells;
const { t: tc, dt } = frameClock(ctx, { fps: 4, changing: cells.length, still: 5.6 });
const t = tc + 8.4; 
materials(k, { tone: 'off' });
const dark = T.dark, flat = isFlat(T);
const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
const tt = t;
const D = (s) => (ctx.params.jump ? dist(s) : (s / LOOP) * PASSES);
const space0 = dark ? mix(T.colors.bg, '#000000', 0.3) : T.colors.surface;
const space1 = dark ? mix(T.colors.bg, T.spectral(270), flat ? 0 : 0.14) : mix(T.colors.surface, T.spectral(260), flat ? 0 : 0.1);
const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
backdrop(k, [[0, space1, 0.94], [1, space0, 0.94]], { radial: { cx, cy, r: R } });
const ink = lit(T);
const B = new Batch(grid);
const N = Math.round(((w * h) / (K * K)) * 12 * ctx.params.stars);
const f = Math.min(w, h) * 0.22; 
const v = ctx.params.jump ? speed(((tt % LOOP) + LOOP) % LOOP) : 1; 
const trail = Math.max(dt * 1.1, 0.12); 
const d0 = D(tt), d1 = D(tt - trail);
const split = clamp((v - 2.2) / 6); 
for (let i = 0; i < N; i++) {
const a = hash(i, ctx.seed, 1) * Math.PI * 2, rr = 0.15 + 1.6 * Math.sqrt(hash(i, ctx.seed, 2));
const sx = Math.cos(a) * rr, sy = Math.sin(a) * rr;
const z = 1 - ((hash(i, ctx.seed, 3) + d0) % 1), zb = z + (d0 - d1);
if (z < 0.02) continue;
const px = cx + (sx / z) * f, py = cy + (sy / z) * f;
let qx = cx + (sx / Math.min(1.5, zb)) * f, qy = cy + (sy / Math.min(1.5, zb)) * f;
const maxLen = K * (0.14 + 0.45 * (v - 1)), len = Math.hypot(px - qx, py - qy);
if (len > maxLen) { qx = px + (qx - px) * (maxLen / len); qy = py + (qy - py) * (maxLen / len); }
if ((px < -K && qx < -K) || (px > w + K && qx > w + K) || (py < -K && qy < -K) || (py > h + K && qy > h + K)) continue;
const near = clamp(1 - z);
const sw = Math.max(0.8, u * (0.5 + 1.8 * near * near));
const op = clamp(0.25 + 0.75 * near);
const bucket = op > 0.7 ? 1 : 0.5;
if (split > 0.05 && !flat && near > 0.45) {
const mx = (px + qx) / 2, my = (py + qy) / 2;
B.seg(qx, qy, mx, my, sw, strokeP(T.spectral(290), sw, bucket * split), 1);
B.seg(mx, my, px, py, sw, strokeP(T.spectral(200), sw, bucket * split), 1);
B.seg(mx + (px - mx) * 0.6, my + (py - my) * 0.6, px, py, sw, strokeP(T.spectral(30), sw, bucket * split), 2);
}
B.seg(qx, qy, px, py, sw, strokeP(ink, sw, bucket * (1 - split * 0.5)), 3);
if (near > 0.6) B.dot(px, py, sw * 0.9, fillP(dark ? '#ffffff' : ink, bucket), 4);
}
B.emit(k);
const vp = k.id('vp');
const glowC = dark ? '#ffffff' : T.spectral(260);
const flash = ctx.params.jump ? smoothstep(14.9, 15.3, tt % LOOP) * (1 - smoothstep(15.3, 16.1, tt % LOOP)) : 0;
k.def(radialGradient(vp, [[0, glowC, f1(Math.min(1, (dark ? 0.22 : 0.18) + 0.5 * flash))], [0.4, glowC, f1((dark ? 0.06 : 0.05) + 0.3 * flash)], [1, glowC, 0]], { cx: f1(cx), cy: f1(cy), r: f1(K * (1.1 + v * 0.12)), fx: f1(cx), fy: f1(cy), gradientUnits: 'userSpaceOnUse' }));
for (const c of cells) if (Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy) < K * (1.1 + v * 0.12) + c.w) k.add(`<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(c.h)}" fill="${url(vp)}"/>`);
if (flash > 0.05) for (const c of cells) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${dark ? '#ffffff' : T.colors.surface}" fill-opacity="${f1(flash * 0.7)}"/>`);
return k.svg();
},
};
};
__d[253] = function (__ns) {
const { surface, keyInto, path, linearGradient, url, circle, n, P } = __m(113);
const { noise1 } = __m(1);
__e(__ns, { "default": () => __default }, [], ["default"]);
function synth(x, seed) {
const beat = x * 2; 
const kick = Math.exp(-((beat % 1) * 5));
const phrase = 0.55 + 0.45 * Math.sin(x * 0.4 + noise1(x * 0.1, seed) * 3);
const tex = noise1(x * 7, seed + 11);
return Math.min(1, (0.18 + 0.5 * kick * phrase + 0.32 * tex * phrase));
}
const __default = {
id: 'span-waveform',
title: 'Waveform',
category: 'Waveforms & Audio',
description: 'A live audio waveform running across a whole row of keys — one continuous line behind the bezels, newest sound at the right.',
tags: ['audio', 'waveform', 'music', 'live', 'span', 'oscilloscope'],
surface: 'span',
span: { cols: 'all', rows: 1 },
data: ['audio'],
fps: 15,
loop: 8,
params: {
speed: { type: 'number', default: 1, min: 0.25, max: 3, step: 0.05, label: 'Scroll speed' },
},
order: 10,
render(ctx) {
const d = surface(ctx);
const { w, h, t, grid } = ctx;
d.add(`<rect width="${n(w)}" height="${n(h)}" fill="#000000"/>`);
for (const cell of grid.cells) keyInto(d, cell, (k) => { k.background({ tone: 'active' }); }, { tag: `k${cell.i}`, clip: false });
const levels = ctx.data.audio?.levels;
const cols = Math.max(24, Math.round(w / 3));
const seconds = 4 / ctx.params.speed; 
const mid = h / 2, amp = grid.key.h * 0.38;
let top = '', bot = '';
for (let i = 0; i <= cols; i++) {
const x = (i / cols) * w;
const age = (1 - i / cols) * seconds;
const v = levels?.length ? levels[Math.max(0, Math.min(levels.length - 1, Math.round((i / cols) * (levels.length - 1))))] : synth(t - age, ctx.seed);
const a = Math.max(0.03, v) * amp;
top += `${i ? 'L' : 'M'}${n(x)} ${n(mid - a)}`;
bot = `L${n(x)} ${n(mid + a * 0.82)}${bot}`;
}
const gid = d.id('wave');
const hue = ctx.hue;
d.def(linearGradient(gid, [[0, ctx.theme.spectral(hue + 60), 0.25], [0.5, ctx.theme.spectral(hue), 0.85], [1, ctx.theme.spectral(hue - 70), 1]], { x1: 0, y1: 0, x2: w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
d.add(path(`${top}${bot}Z`, { fill: url(gid), fillOpacity: d.dark ? 0.85 : 0.7 }));
d.add(path(P().M(0, mid).L(w, mid).d, { stroke: d.colors.beam || '#ffffff', strokeWidth: d.m.hair, strokeOpacity: 0.35 }));
d.add(circle({ cx: w - d.m.safe, cy: mid, r: d.m.bold, fill: d.dark ? '#ffffff' : d.tone('active') }));
return d.svg();
},
};
};
__d[254] = function (__ns) {
const { svgDoc, path, n, P } = __m(5);
const { arcPath, polar } = __m(15);
const { arrive, clamp, lerp, outExpo } = __m(12);
__e(__ns, { "finish": () => finish, "arrival": () => arrival, "ramp": () => ramp, "spectralArc": () => spectralArc, "tickPaths": () => tickPaths, "signal": () => signal, "dbOf": () => dbOf, "pointer": () => pointer }, [], ["arrival","dbOf","finish","pointer","ramp","signal","spectralArc","tickPaths"]);
function finish(k) {
const ctx = k.ctx;
const fx = ctx.pressed || ctx.pressAge < 2 ? k.theme.press(k, { pressed: ctx.pressed, age: ctx.pressAge }) : null;
if (!fx) return k.svg();
const body = fx.transform ? `<g transform="${fx.transform}">${k.body}</g>` : k.body;
return svgDoc({ w: k.w, h: k.h, defs: k.defs, body: (fx.under || '') + body + (fx.overlay || '') });
}
const arrival = (ctx, dur = 0.45) => (ctx.reduced ? 1 : arrive(ctx.since, dur, outExpo));
const ramp = (ctx, f, spread = 110, center = 0) => ctx.theme.spectral(ctx.hue + center + spread / 2 - f * spread);
function spectralArc(ctx, { cx, cy, r, width, from, to, value, spread = 110, opacity = 1, segments = 28 }) {
const v = clamp(value);
if (v <= 0.002) return '';
const end = lerp(from, to, v), count = Math.max(2, Math.round(segments * v)), step = (end - from) / count;
let out = '';
for (let i = 0; i < count; i++) {
const a0 = from + step * i, a1 = from + step * (i + 1) + (i < count - 1 ? step * 0.12 : 0);
out += path(arcPath(cx, cy, r, a0, a1), { fill: 'none', stroke: ramp(ctx, ((i + 0.5) / count) * v, spread), strokeWidth: n(width), strokeOpacity: opacity < 1 ? n(opacity, 3) : null });
}
const cap = (a, f) => { const [x, y] = polar(cx, cy, r, a); return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(width / 2)}" fill="${ramp(ctx, f * v, spread)}"${opacity < 1 ? ` fill-opacity="${n(opacity, 3)}"` : ''}/>`; };
return out + cap(from, 0) + cap(end, 1);
}
function tickPaths(cx, cy, r, len, majorLen, from, to, count, major = 0) {
const a = P(), b = P();
for (let i = 0; i < count; i++) {
const ang = lerp(from, to, count === 1 ? 0 : i / (count - 1));
const isMajor = major && i % major === 0, L = isMajor ? majorLen : len;
const [x0, y0] = polar(cx, cy, r, ang), [x1, y1] = polar(cx, cy, r - L, ang);
(isMajor ? b : a).M(x0, y0).L(x1, y1);
}
return { minor: a.d, major: b.d };
}
function signal(ctx, key, { speed = 0.35, lo = 0.12, hi = 0.88 } = {}) {
const d = ctx.data?.[key];
if (typeof d === 'number') return clamp(d);
if (d && typeof d.level === 'number') return clamp(d.level);
return ctx.noise.metric(ctx.reduced ? 2 : ctx.t, { lo, hi, speed });
}
const dbOf = (v) => (v >= 0.9995 ? '0.0' : `–${Math.min(60, -20 * Math.log10(Math.max(0.001, v))).toFixed(1)}`);
const pointer = (x, y, s) => P().M(x - s, y).L(x + s, y).L(x, y + s * 1.3).Z().d;
};
__d[255] = function (__ns) {
const { surface, path, rect, sectorPath, oklch, n, P } = __m(113);
const { clamp, lerp, arrive } = __m(12);
const { finish, arrival, pointer } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SECTOR = 5;
const __default = {
id: 'dial-color-wheel',
title: 'Color Wheel',
category: 'Dial Segments',
description: 'A hue wheel that turns under a fixed pointer, one 5° sector per detent, with the chosen color and its hex inside. Push or tap to switch the lamp off.',
tags: ['color', 'hue', 'wheel', 'lights', 'lamp', 'rgb', 'picker', 'dial', 'smart home'],
surface: 'strip',
segments: 1,
fps: 10,
loop: 4,
states: ['on', 'off'],
tones: { on: 'active', off: 'idle' },
press: 'toggle',
params: {
label: { type: 'text', default: 'Lamp', label: 'Label', maxLength: 12 },
value: { type: 'number', default: 0.58, min: 0, max: 1, step: 0.001, label: 'Hue (0–1)' },
step: { type: 'number', default: 0.013889, min: 0.002, max: 0.1, step: 0.001, label: 'Step per detent' },
saturation: { type: 'number', default: 0.85, min: 0, max: 1, step: 0.01, label: 'Saturation' },
brightness: { type: 'number', default: 0.72, min: 0, max: 1, step: 0.01, label: 'Brightness' },
},
order: 60,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const off = ctx.stateName === 'off';
const e = arrival(ctx, 0.55);
const drain = off ? arrive(ctx.since, 0.4) : 0;
k.background({ tone: off ? 'idle' : 'active' });
const hue = (ctx.value * 360) % 360;
const spin = (1 - e) * (off ? 0 : 50); 
const cx = w / 2, cy = 134, r0 = 87, r1 = 101;
const L = k.dark ? 0.74 : 0.67, Cc = lerp(0.15, 0.012, drain);
for (let i = 0; i < 360 / SECTOR; i++) {
const hi = i * SECTOR;
let a = hi - hue + spin;
a = ((a + 540) % 360) - 180;
if (Math.abs(a) > 78) continue;
k.add(path(sectorPath(cx, cy, r0, r1, a - SECTOR / 2, a + SECTOR / 2 + 0.35), { fill: oklch(L, Cc, hi) }));
}
const sel = Math.round(hue / SECTOR) * SECTOR, sa = ((sel - hue + spin + 540) % 360) - 180;
const ink = k.dark ? '#ffffff' : C.ink;
k.add(path(sectorPath(cx, cy, r0 - 1.5, r1 + 1.5, sa - SECTOR / 2 - 0.4, sa + SECTOR / 2 + 0.4), { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinejoin: 'round' }));
const rim = (r) => path(P().M(cx - r * Math.sin(80 * Math.PI / 180), cy - r * Math.cos(80 * Math.PI / 180)).A(r, r, 0, 0, 1, cx + r * Math.sin(80 * Math.PI / 180), cy - r * Math.cos(80 * Math.PI / 180)).d, { fill: 'none', stroke: C.line, strokeWidth: 1, strokeOpacity: 0.9 });
k.add(rim(r0 - 0.5) + rim(r1 + 0.5));
k.add(path(pointer(cx, cy - r1 - 8.5, 4.4), { fill: ink }));
const color = oklch(lerp(0.36, 0.86, ctx.params.brightness), 0.2 * ctx.params.saturation, hue);
const sw = 50, sh = 17, sx = cx - sw / 2, sy = 55;
if (off) k.add(rect({ x: sx, y: sy, width: sw, height: sh, rx: sh / 2, fill: 'none', stroke: C.dim, strokeWidth: 1.4 }));
else {
k.add(rect({ x: sx, y: sy, width: sw, height: sh, rx: sh / 2, fill: color, fillOpacity: e < 1 ? n(e, 3) : null }));
k.add(rect({ x: sx + 0.5, y: sy + 0.5, width: sw - 1, height: sh - 1, rx: sh / 2 - 0.5, fill: 'none', stroke: k.dark ? '#ffffff' : '#000000', strokeWidth: 1, strokeOpacity: 0.22 }));
}
k.label(off ? 'Off' : color.toUpperCase(), { x: cx, y: 89, align: 'center', color: off ? 'dim' : 'ink', maxWidth: 110 });
k.eyebrow(ctx.params.label, { color: off ? 'dim' : 'muted', maxWidth: w * 0.36 });
k.eyebrow(`H ${Math.round(hue)}°`, { align: 'right', x: w - s, color: off ? 'dim' : 'ink', maxWidth: w * 0.36 });
return finish(k);
},
};
};
__d[256] = function (__ns) {
const { surface, path, rect, linearGradient, url, n, P } = __m(113);
const { clamp, lerp, arrive } = __m(12);
const { arrival, ramp } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SEG = 200, Y0 = 53, RANGE = 22, SIGMA = 88, FLOOR = 80;
const NAMES = { 4: ['Low', 'Lo mid', 'Hi mid', 'High'], 6: ['Sub', 'Low', 'Lo mid', 'Hi mid', 'High', 'Air'] };
const hz = (f) => (f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(f < 9950 ? 1 : 0)}k`);
const __default = {
id: 'strip-eq',
title: 'EQ Strip',
category: 'Strip Panoramas',
description: 'A parametric EQ across the whole strip: each band node sits above its dial, turn to boost or cut, the curve reshapes and the spectrum moves behind it. Push for bypass.',
tags: ['eq', 'equalizer', 'parametric', 'audio', 'mix', 'strip', 'touch strip', 'panorama', 'spectrum', 'bands'],
surface: 'strip',
segments: 'all',
data: ['spectrum'],
fps: 4,
loop: 8,
states: ['on', 'bypass'],
tones: { on: 'active', bypass: 'idle' },
press: 'toggle',
params: {
labels: { type: 'text', default: '', label: 'Band names (comma separated; blank = automatic)', maxLength: 60 },
step: { type: 'number', default: 0.02083, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
analyzer: { type: 'bool', default: true, label: 'Spectrum behind the curve' },
hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
},
order: 20,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const count = Math.round(w / SEG);
const bypass = ctx.stateName === 'bypass';
const e = arrival(ctx, 0.6), drain = bypass ? arrive(ctx.since, 0.45) : 0;
const amt = bypass ? 1 - drain : e; 
k.background({ tone: bypass ? 'idle' : 'active' });
const custom = String(ctx.params.labels).split(',').map((x) => x.trim()).filter(Boolean);
const names = Array.from({ length: count }, (_, i) => custom[i] || (NAMES[count] || [])[i] || `Band ${i + 1}`);
const gains = Array.from({ length: count }, (_, i) => ((ctx.values[i] ?? 0.5) - 0.5) * 24); 
const bx = (i) => i * SEG + SEG / 2;
const freq = (x) => 20 * 1000 ** (x / w);
const curve = (x) => { let g = 0; for (let i = 0; i < count; i++) g += gains[i] * Math.exp(-(((x - bx(i)) / SIGMA) ** 2)); return clamp(g * amt, -12, 12); };
const yOf = (g) => Y0 - (g / 12) * RANGE;
const bands = ctx.data?.spectrum?.bands;
const ink = k.dark ? '#ffffff' : C.ink;
for (let i = 0; i < count; i++) {
const xa = i * SEG, xb = xa + SEG;
k.add(rect({ x: xa + (i ? 0 : s), y: Y0 - 0.5, width: SEG - (i ? 0 : s) - (i === count - 1 ? s : 0), height: 1, fill: C.line }));
const grid = P();
for (const g of [-6, 6]) for (let x = xa + (i ? 3 : s); x < xb - (i === count - 1 ? s : 0); x += 6) grid.M(x, yOf(g)).H(x + 2);
for (const f of [100, 1000, 10000]) { const x = (Math.log10(f / 20) / 3) * w; if (x >= xa && x < xb) { grid.M(x, Y0 - RANGE - 1).V(FLOOR); k.caption(f >= 1000 ? `${f / 1000}k` : String(f), { x: x + 2.5, y: FLOOR - 2, align: 'left', color: 'dim', size: 9.5 }); } }
k.add(path(grid.d, { fill: 'none', stroke: C.line, strokeWidth: 1, strokeOpacity: 0.85 }));
if (i) {
const did = k.id(`div${i}`);
k.def(linearGradient(did, [[0, C.ink, 0], [0.5, C.ink, 0.22], [1, C.ink, 0]]));
k.add(rect({ x: xa - 0.5, y: h * 0.1, width: 1, height: h * 0.8, fill: url(did) }));
}
if (ctx.params.analyzer) {
const BARS = 12, pitch = SEG / BARS, bw = pitch * 0.62;
let d = '';
for (let j = 0; j < BARS; j++) {
const x = xa + j * pitch + (pitch - bw) / 2, fx = (x + bw / 2) / w;
if (x < s || x + bw > w - s) continue;
const base = bands?.length ? bands[Math.min(bands.length - 1, Math.floor(fx * bands.length))] : clamp(0.62 - 0.32 * fx + 0.3 * ctx.noise.n2(fx * 9, (ctx.reduced ? 1 : ctx.t) * 1.7));
const lv = clamp(base + (curve(x + bw / 2) / 12) * 0.28);
const bh = Math.max(1, lv * 40);
d += `M${n(x)} ${n(FLOOR - bh)}h${n(bw)}V${FLOOR}h${n(-bw)}Z`;
}
if (d) k.add(path(d, { fill: bypass ? C.dim : ctx.tint, fillOpacity: k.dark ? 0.16 : 0.13 }));
}
const pts = [];
for (let x = xa; x <= xb + 0.01; x += 5) pts.push([x, yOf(curve(x))]);
const line = P().M(...pts[0]);
for (const p of pts.slice(1)) line.L(...p);
const gid = k.id(`eq${i}`);
k.def(linearGradient(gid, [[0, ramp(ctx, xa / w, 150)], [1, ramp(ctx, xb / w, 150)]], { x1: xa, y1: 0, x2: xb, y2: 0, gradientUnits: 'userSpaceOnUse' }));
k.add(path(`${line.d}L${n(xb)} ${n(Y0)}L${n(xa)} ${n(Y0)}Z`, { fill: bypass ? C.dim : url(gid), fillOpacity: 0.16 }));
k.add(path(line.d, { fill: 'none', stroke: bypass ? C.dim : url(gid), strokeWidth: 2.4, strokeLinejoin: 'round', strokeOpacity: bypass ? n(lerp(1, 0.7, drain), 3) : null }));
const nx = bx(i), ny = yOf(curve(nx)), nc = bypass ? C.dim : ramp(ctx, nx / w, 150);
k.add(`<circle cx="${n(nx)}" cy="${n(ny)}" r="6.4" fill="${C.surface2}" stroke="${nc}" stroke-width="2.2"/>`);
k.add(`<circle cx="${n(nx)}" cy="${n(ny)}" r="2.2" fill="${bypass ? C.dim : ink}"/>`);
const g = gains[i] * (bypass ? 1 : e);
k.eyebrow(names[i], { x: xa + s, align: 'left', color: bypass ? 'dim' : 'muted', maxWidth: SEG * 0.5 });
k.caption(hz(freq(nx)), { x: nx, y: 91, align: 'center', color: bypass ? 'dim' : 'muted', maxWidth: SEG * 0.5 });
k.eyebrow(`${g >= 0.05 ? '+' : g <= -0.05 ? '–' : ''}${Math.abs(g).toFixed(1)} dB`, { x: xb - s, align: 'right', color: bypass ? 'dim' : 'ink', maxWidth: SEG * 0.45 });
}
if (bypass) k.caption('Bypass', { x: w / 2, y: Y0 - RANGE - 1, align: 'center', color: 'muted', opacity: drain });
return k.svg();
},
};
};
__d[257] = function (__ns) {
const { surface, path, arcPath, polar, n, P } = __m(113);
const { clamp, lerp } = __m(12);
const { finish, arrival, tickPaths, ramp } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const METRICS = { cpu: { label: 'CPU', off: 0 }, gpu: { label: 'GPU', off: 41 }, mem: { label: 'Memory', off: 83 } };
const __default = {
id: 'dial-gauge',
title: 'Gauge',
category: 'Gauges & Scrubbers',
description: 'An analog half-dial with a sweeping needle on a live metric. Turn to set the red line; past it the segment raises an alert. Push or tap to cycle CPU, GPU, memory.',
tags: ['gauge', 'needle', 'meter', 'cpu', 'gpu', 'memory', 'threshold', 'alert', 'dial', 'analog'],
surface: 'strip',
segments: 1,
data: ['cpu', 'gpu', 'mem'],
fps: 6,
loop: 8,
states: ['cpu', 'gpu', 'mem'],
press: 'cycle',
params: {
value: { type: 'number', default: 0.8, min: 0.05, max: 1, step: 0.01, label: 'Red line' },
step: { type: 'number', default: 0.01, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
},
order: 40,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const key = ctx.stateName || 'cpu', M = METRICS[key];
const live = typeof ctx.data?.[key] === 'number';
const raw = live ? clamp(ctx.data[key]) : ctx.noise.metric((ctx.reduced ? 2 : ctx.t) + M.off, { lo: 0.18, hi: 0.94, speed: 0.32, jitter: 0.12 });
const e = arrival(ctx, 0.7);
const reading = raw * e;
const redline = ctx.value;
const over = e >= 1 && raw >= redline;
k.background({ tone: over ? 'alert' : 'idle' });
const cx = 56, cy = 72, r = 41, FROM = -90, TO = 90;
const tk = tickPaths(cx, cy, r + 8, 2.6, 5.2, FROM, TO, 21, 5);
k.add(path(tk.minor, { fill: 'none', stroke: C.dim, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.6, strokeLinecap: 'round' }));
k.add(path(tk.major, { fill: 'none', stroke: C.muted, strokeWidth: n(Math.max(1.3, k.m.hair * 1.4)), strokeLinecap: 'round' }));
k.add(path(arcPath(cx, cy, r, FROM, TO), { fill: 'none', stroke: C.line, strokeWidth: 4.5, strokeLinecap: 'butt', strokeOpacity: 0.9 }));
if (reading > 0.004) k.add(path(arcPath(cx, cy, r, FROM, lerp(FROM, TO, reading)), { fill: 'none', stroke: over ? k.tone('alert') : ramp(ctx, reading, 90), strokeWidth: 4.5, strokeLinecap: 'butt' }));
const ra = lerp(FROM, TO, redline);
k.add(path(arcPath(cx, cy, r + 4.6, ra, TO), { fill: 'none', stroke: C.neg, strokeWidth: 2.6, strokeLinecap: 'butt', strokeOpacity: 0.9 }));
const [tx, ty] = polar(cx, cy, r + 12.5, ra), [lx, ly] = polar(cx, cy, r + 17, ra - 4), [rx, ry] = polar(cx, cy, r + 17, ra + 4);
k.add(path(P().M(tx, ty).L(lx, ly).L(rx, ry).Z().d, { fill: C.neg }));
const ang = lerp(FROM, TO, clamp(reading + (ctx.reduced ? 0 : 0.006 * Math.sin(ctx.t * 23.7))));
const [nx, ny] = polar(cx, cy, r - 3, ang), [bx, by] = polar(cx, cy, 7, ang + 180);
const [ax, ay] = polar(cx, cy, 2.2, ang - 90), [cx2, cy2] = polar(cx, cy, 2.2, ang + 90);
const ink = k.dark ? '#ffffff' : C.ink;
k.add(path(P().M(bx, by).L(ax, ay).L(nx, ny).L(cx2, cy2).Z().d, { fill: over ? k.tone('alert') : ink }));
k.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="5.2" fill="${C.surface2}" stroke="${ink}" stroke-width="1.6"/>`);
k.caption('0', { x: cx - r, y: cy + 15, align: 'center', color: 'dim' });
k.caption('100', { x: cx + r, y: cy + 15, align: 'center', color: 'dim' });
const x0 = 112;
k.eyebrow(M.label, { x: x0, align: 'left', color: over ? 'neg' : 'muted', maxWidth: w - x0 - s });
k.value(String(Math.round(reading * 100)), { align: 'right', x: w - s, cy: 47, color: 'ink', maxWidth: w - x0 - s });
k.caption(`${over ? 'Over ' : 'Line '}${Math.round(redline * 100)}%`, { align: 'right', x: w - s, y: h - 16, color: over ? 'neg' : 'muted', maxWidth: w - x0 - s + 6 });
return finish(k);
},
};
};
__d[258] = function (__ns) {
const { surface, rect, path, n, P, linearGradient, radialGradient, url } = __m(113);
const { clamp, lerp, outExpo } = __m(12);
const { mix, oklch, hexToOklch } = __m(4);
const { finish, arrival } = __m(254);
const { text, kelvinHex } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'dial-light',
title: 'Key Light',
category: 'Dial Segments',
description: 'A key light on one dial: turn for brightness and the panel glows brighter in its own color temperature; push to switch it off and on.',
tags: ['light', 'lamp', 'key light', 'brightness', 'color temperature', 'kelvin', 'home', 'stream', 'dial'],
surface: 'strip',
segments: 1,
fps: 10,
loop: 4,
states: ['on', 'off'],
tones: { on: 'idle', off: 'off' },
press: 'toggle',
params: {
label: { type: 'text', default: 'Key light', maxLength: 12, label: 'Light' },
kelvin: { type: 'number', default: 4600, min: 2700, max: 7000, step: 100, label: 'Color temperature (K)' },
value: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.01, label: 'Brightness' },
step: { type: 'number', default: 0.02, min: 0.01, max: 0.1, step: 0.01, label: 'Step per detent' },
},
order: 40,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors;
const on = ctx.stateName !== 'off';
const v = clamp(ctx.value);
const e = arrival(ctx, 0.5);
k.background({ tone: on ? 'idle' : 'off' });
const kel = ctx.params.kelvin;
const raw = kelvinHex(kel);
const [, cRaw, hRaw] = hexToOklch(raw);
const lamp = oklch(k.dark ? 0.86 : 0.7, Math.max(0.04, cRaw * (k.dark ? 0.9 : 1.2)), hRaw);
const lit = on ? v * e : 0;
const s = k.m.safe;
const px = s + 3, py = 25, pw = 68, ph = 44;
const gid = k.id('glow');
k.def(radialGradient(gid, [[0, lamp, 0.55 * lit], [0.5, lamp, 0.18 * lit], [1, lamp, 0]], { cx: 0.5, cy: 0.5, r: 0.5 }));
if (lit > 0.01) k.add(rect({ x: n(px - 26), y: n(py - 22), width: n(pw + 52), height: n(ph + 50), fill: url(gid) }));
const did = k.id('diff');
const face = on ? mix(k.dark ? '#1a1d26' : C.surface2, lamp, 0.25 + 0.75 * lit) : mix(C.surface2, C.line, 0.4);
k.def(linearGradient(did, [[0, mix(face, '#ffffff', on ? 0.35 * lit : 0)], [1, face]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
k.add(rect({ x: px, y: py, width: pw, height: ph, rx: 6, fill: k.dark ? '#0b0c10' : C.line, stroke: C.line, strokeWidth: 1.2 }));
k.add(rect({ x: px + 3.5, y: py + 3.5, width: pw - 7, height: ph - 7, rx: 3.5, fill: url(did) }));
let dots = '';
for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = px + 9.5 + c * 9.8, y = py + 11.5 + r * 10.5; dots += `M${n(x + 1.3)} ${n(y)}A1.3 1.3 0 1 1 ${n(x - 1.3)} ${n(y)}A1.3 1.3 0 1 1 ${n(x + 1.3)} ${n(y)}Z`; }
k.add(path(dots, { fill: on ? mix(lamp, '#ffffff', 0.6) : C.dim, fillOpacity: n(on ? 0.35 + 0.65 * lit : 0.5, 3) }));
k.add(path(P().M(px + pw / 2, py + ph).V(py + ph + 9).M(px + pw / 2 - 9, py + ph + 9).H(px + pw / 2 + 9).d, { stroke: C.dim, strokeWidth: 2, strokeLinecap: 'round' }));
const rx0 = px + pw + 14, rx1 = w - s;
k.eyebrow(on ? ctx.params.label : `${ctx.params.label} · off`, { x: s, color: on ? 'muted' : 'dim', maxWidth: w - s * 2 });
const turning = Number.isFinite(ctx.turnAge) && ctx.turnAge < 0.6 && on;
text(k, on ? `${Math.round(v * 100)}%` : 'Off', { x: rx1, cy: 47, size: turning ? 31 : 29, weight: 700, tabular: true, anchor: 'end', color: on ? 'ink' : 'muted', maxWidth: rx1 - rx0 });
text(k, `${kel} K`, { x: rx1, y: 74, size: 11, weight: 600, anchor: 'end', tabular: true, color: on ? 'muted' : 'dim' });
const by = 84, bw = rx1 - rx0, bh = 3.2;
const bid = k.id('beam');
k.def(linearGradient(bid, [[0, mix(lamp, C.surface2, 0.6)], [1, lamp]], { x1: n(rx0), y1: 0, x2: n(rx1), y2: 0, gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ x: n(rx0), y: by, width: n(bw), height: bh, rx: bh / 2, fill: C.line }));
if (on && v > 0.004) {
k.add(rect({ x: n(rx0), y: by, width: n(Math.max(bh, bw * v * e)), height: bh, rx: bh / 2, fill: url(bid) }));
const hx = rx0 + bw * v * e;
k.add(rect({ x: n(hx - 1), y: by - (turning ? 4 : 2.5), width: 2, height: bh + (turning ? 8 : 5), rx: 1, fill: k.dark ? '#ffffff' : C.ink }));
}
void lerp; void outExpo;
return finish(k);
},
};
};
__d[259] = function (__ns) {
const { surface, path, rect, linearGradient, url, n } = __m(113);
const { lerp, clamp, smoothstep } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'strip-refraction',
title: 'Refraction Waves',
category: 'Strip Panoramas',
description: 'Spectral ribbons flow across the whole touch strip; each dial swells the light above it. One labeled channel per dial, one panorama.',
tags: ['strip', 'touch strip', 'panorama', 'eq', 'waves', 'spectrum'],
surface: 'strip',
segments: 'all',
fps: 5, 
loop: 10,
params: { labels: { type: 'text', default: 'Low,Mid,High,Air,FX,Out', label: 'Channel labels (comma separated)', maxLength: 48 } },
order: 10,
render(ctx) {
const k = surface(ctx);
const { w, h, t } = ctx;
k.background({ tone: 'active' });
const seg = 200, count = Math.round(w / seg);
const vals = Array.from({ length: count }, (_, i) => ctx.values[i] ?? 0.5);
const env = (x) => { const f = clamp(x / seg - 0.5, 0, count - 1); const i = Math.floor(f), j = Math.min(count - 1, i + 1); return lerp(vals[i], vals[j], smoothstep(0, 1, f - i)); };
const RIBBONS = 5, STEP = 10, mid = h * 0.58;
for (let r = 0; r < RIBBONS; r++) {
const color = ctx.theme.spectral(ctx.hue + 30 - r * 55);
const k1 = 0.006 + r * 0.0017, sp = 0.6 + r * 0.22, ph = r * 1.7;
const thick = h * (0.05 + (0.025 * (RIBBONS - r)) / RIBBONS);
let top = '', bot = '';
for (let x = 0; x <= w; x += STEP) {
const a = h * (0.08 + 0.26 * env(x));
const y = mid + Math.sin(x * k1 + t * sp + ph) * a + Math.sin(x * k1 * 2.3 - t * sp * 0.7 + ph * 2) * a * 0.3;
const tk = thick * (0.6 + 0.4 * Math.sin(x * 0.011 + t + r));
top += `${x ? 'L' : 'M'}${n(x)} ${n(y - tk)}`;
bot = `L${n(x)} ${n(y + tk)}${bot}`;
}
const gid = k.id(`rib${r}`);
k.def(linearGradient(gid, [[0, color, 0], [0.12, color, 0.55], [0.5, color, 0.75], [0.88, color, 0.55], [1, color, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(path(`${top}${bot}Z`, { fill: url(gid), fillOpacity: k.dark ? 0.62 : 0.5 }));
}
let beam = '';
for (let x = 0; x <= w; x += STEP) { const a = h * (0.08 + 0.26 * env(x)); beam += `${x ? 'L' : 'M'}${n(x)} ${n(mid + Math.sin(x * 0.0072 + t * 0.82 + 1.7) * a * 0.9)}`; }
const bid = k.id('beam'), beamC = k.colors.beam || '#ffffff';
k.def(linearGradient(bid, [[0, beamC, 0], [0.5, beamC, k.dark ? 0.9 : 0.7], [1, beamC, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(path(beam, { fill: 'none', stroke: url(bid), strokeWidth: k.m.line * 0.6 }));
const labels = String(ctx.params.labels).split(',').map((s) => s.trim()).filter(Boolean);
for (let i = 0; i < count; i++) {
const x = i * seg;
if (i) {
const did = k.id(`div${i}`);
k.def(linearGradient(did, [[0, k.colors.ink, 0], [0.5, k.colors.ink, 0.28], [1, k.colors.ink, 0]]));
k.add(rect({ x: x - 0.5, y: h * 0.12, width: 1, height: h * 0.76, fill: url(did) }));
}
k.eyebrow(labels[i] || `Ch ${i + 1}`, { x: x + k.m.safe, maxWidth: seg * 0.6 });
k.eyebrow(String(Math.round(vals[i] * 100)).padStart(2, '0'), { x: x + seg - k.m.safe, align: 'right', color: 'ink', maxWidth: seg * 0.3 });
}
return k.svg();
},
};
};
__d[260] = function (__ns) {
const { surface, rect, path, n, P, linearGradient, url } = __m(113);
const { clamp } = __m(12);
const { mix } = __m(4);
const { text, mmss } = __m(195);
const { panelInto } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SEG = 200;
function chaptersOf(spec) {
const list = String(spec || '').split(',').map((s) => s.split(':')).map(([a, b]) => ({ name: (a || '').trim(), min: Math.max(0.5, +b || 0) })).filter((c) => c.name);
return list.length ? list : [{ name: 'Intro', min: 3 }, { name: 'News', min: 9 }, { name: 'Guest', min: 18 }, { name: 'Q&A', min: 10 }, { name: 'Outro', min: 3 }];
}
const __default = {
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
const T0 = ctx.touch, ta = T0 ? T0.age : Infinity, tt = ctx.turnAge;
let pos, cur, inCh;
if (T0 && ta <= tt) {
if (T0.hold) { pos = ta; cur = null; }
else { const sec = clamp((T0.x - x0) / span) * total; cur = ch.find((q) => sec < q.b) || ch[ch.length - 1]; inCh = ta; pos = cur.a + Math.min(ta, cur.b - cur.a); }
} else if (Number.isFinite(tt)) pos = clamp(ctx.value) * total + tt;
else pos = ctx.reduced ? total * 0.38 : ctx.since;
pos = Math.floor(Math.min(pos, total + 3599)); 
if (!cur) { cur = ch.find((q) => pos < q.b) || ch[ch.length - 1]; inCh = pos - cur.a; }
const ci = ch.indexOf(cur);
const over = pos >= total && ci === ch.length - 1 && inCh >= cur.b - cur.a;
const left = (cur.b - cur.a) - inCh;
const next = ch[ci + 1];
const segs = ctx.strip?.segments || Math.round(w / SEG);
const hueOf = (i) => ctx.hue + (i % 2 ? 26 : -18) + i * 9;
const head = Math.round(xOf(pos) * 2) / 2; 
const laneY = 58, laneH = 30;
for (let sgi = 0; sgi < segs; sgi++) {
const sx = sgi * SEG;
panelInto(k, { x: sx, y: 0, w: SEG, h }, (p) => {
p.background({ tone: 'idle' });
const L = (str, o = {}) => text(p, str, { x: 10, y: 20, size: 9.5, weight: 600, caps: true, tracking: 0.1, anchor: 'start', color: 'muted', maxWidth: SEG - 20, ...o });
const V = (str, o = {}) => text(p, str, { x: 10, y: 44, size: 20, weight: 700, anchor: 'start', color: 'ink', maxWidth: SEG - 20, ...o });
const which = ['now', 'left', 'next', 'show', 'start', 'ends'][sgi] || 'blank';
if (which === 'now') { L(over ? 'Show' : `Now · ${ci + 1}/${ch.length}`); V(over ? 'Wrapped' : cur.name, { color: over ? 'pos' : 'ink' }); }
else if (which === 'left') { const run = left < 0; L(run ? 'Over' : 'Left'); V(run ? `+${mmss(-left)}` : mmss(left), { color: run ? C.warn : 'ink' }); }
else if (which === 'next') { L('Next'); V(next ? next.name : '—', { color: next ? 'ink' : 'dim' }); if (next) text(p, `${next.min} min`, { x: SEG - 10, y: 20, size: 9.5, weight: 600, anchor: 'end', color: 'dim' }); }
else if (which === 'show') { L('Show'); V(`${mmss(Math.min(pos, total))}`, { size: 18 }); text(p, `/ ${mmss(total)}`, { x: SEG - 10, y: 44, size: 11, weight: 600, anchor: 'end', color: 'dim' }); }
else if (which === 'start') { L('Chapters'); V(`${ch.length}`); }
else if (which === 'ends') { L('Remaining'); V(mmss(Math.max(0, total - pos))); }
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
let o = `M${n(aa)} ${laneY + 0.7}H${n(bb)}M${n(aa)} ${laneY + laneH - 0.7}H${n(bb)}`;
if (a >= lx0 - 0.5) o += `M${n(a + 0.7)} ${laneY}V${laneY + laneH}`;
if (b <= lx1 + 0.5) o += `M${n(b - 0.7)} ${laneY}V${laneY + laneH}`;
p.add(path(o, { fill: 'none', stroke: left < 0 ? C.warn : col, strokeWidth: 1.4 }));
}
if (a >= lx0 - 0.5 && a < lx1 - 18) text(p, c.name, { x: a + 5, y: laneY + laneH / 2 + 4, size: 11, weight: 600, anchor: 'start', color: i === ci && !over ? 'ink' : 'muted', maxWidth: Math.min(b, lx1) - a - 8, minSize: 8 });
});
if (dim) p.add(path(dim, { fill: C.line, fillOpacity: p.dark ? 0.55 : 0.6 }));
let tk = '';
ch.forEach((c) => { const x = xOf(c.a) - sx; if (x > lx0 + 0.5 && x < lx1) tk += `M${n(x)} ${laneY - 5}v${laneH + 10}`; });
if (tk) p.add(path(tk, { stroke: C.dim, strokeWidth: 1, fill: 'none' }));
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
};
__d[261] = function (__ns) {
const { surface, rect, circle, n } = __m(113);
const { clamp } = __m(12);
const { finish } = __m(254);
const { flap, flapColors, text } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const FLIP = 0.5;
const __default = {
id: 'dial-score',
title: 'Score Dial',
category: 'Dial Segments',
description: 'A team’s score on split-flap cards: turn right to score, left to take one back, push to mark the serve. Two dials on the Galleon make a scoreboard.',
tags: ['score', 'scoreboard', 'game night', 'counter', 'tally', 'split flap', 'team', 'dial'],
surface: 'strip',
segments: 1,
fps: 10,
loop: 4,
states: ['play', 'serve'],
tones: { play: 'idle', serve: 'active' },
press: 'toggle',
params: {
team: { type: 'text', default: 'Home', maxLength: 10, label: 'Team' },
hue: { type: 'hue', default: 243.6, min: 0, max: 360, label: 'Team hue' },
value: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Score ÷ 100' },
step: { type: 'number', default: 0.01, min: 0.01, max: 0.01, step: 0.01, label: 'One point per detent' },
},
order: 44,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, T = ctx.theme;
const serve = ctx.stateName === 'serve';
k.background({ tone: serve ? 'active' : 'idle' });
const score = Math.min(99, Math.round(clamp(ctx.value) * 100));
const str = String(score).padStart(2, '0');
const turning = Number.isFinite(ctx.turnAge) && ctx.turnAge < FLIP * 1.25 && !ctx.reduced;
const arriving = !turning && !ctx.reduced && !Number.isFinite(ctx.turnAge) && ctx.since < FLIP * 1.25;
const p = turning ? (ctx.turnAge / FLIP) * 1.25 : arriving ? (ctx.since / FLIP) * 1.25 : 9;
const prevOnes = arriving ? '' : String((Number(str[1]) + 9) % 10);
const prevTens = arriving ? '' : str[1] === '0' ? String((Number(str[0]) + 9) % 10) : str[0];
const F = flapColors(k);
const s = k.m.safe;
const tint = T.spectral(ctx.hue), deep = T.spectral(ctx.hue, { tier: 'ink' });
k.add(rect({ x: s, y: 21, width: 4, height: 62, rx: 2, fill: tint }));
text(k, ctx.params.team, { x: s + 11, y: 44, size: 17, weight: 700, anchor: 'start', color: k.dark ? 'ink' : deep, maxWidth: 76, minSize: 11 });
text(k, serve ? 'serving' : 'score', { x: s + 11, y: 62, size: 10, weight: 600, caps: true, tracking: 0.1, anchor: 'start', color: serve ? tint : 'muted' });
if (serve) k.add(circle({ cx: s + 15.5, cy: 77, r: 4, fill: tint }) + circle({ cx: s + 15.5, cy: 77, r: 7.5, fill: 'none', stroke: tint, strokeWidth: 1.2, strokeOpacity: 0.5 }));
const cw = 40, ch = 70, gap = 4, y = 16;
const x1 = w - s - cw, x0 = x1 - gap - cw;
flap(k, { x: x0, y, w: cw, h: ch, r: 5, prev: turning || arriving ? prevTens : undefined, cur: str[0], p, size: 52, weight: 700, tag: 'tens', colors: F });
flap(k, { x: x1, y, w: cw, h: ch, r: 5, prev: turning || arriving ? prevOnes : undefined, cur: str[1], p, size: 52, weight: 700, tag: 'ones', colors: F });
k.add(rect({ x: n(x0 + 6), y: n(y + ch + 3), width: n(cw * 2 + gap - 12), height: 2, rx: 1, fill: tint }));
return finish(k);
},
};
};
__d[262] = function (__ns) {
const { surface, path, rect, n, P } = __m(113);
const { clamp } = __m(12);
const { finish, arrival, pointer } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const PPS = 22; 
const FPS = 24; 
const tc = (sec) => {
const t = Math.max(0, sec), m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * FPS);
return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
};
const amp = (ctx, tau) => {
const a = ctx.noise.n1(tau * 0.9) * 0.55 + ctx.noise.n1(tau * 3.7 + 11) * 0.3 + ctx.noise.n1(tau * 0.17 + 5) * 0.35;
return clamp(0.18 + 0.82 * Math.abs(a) * 1.25);
};
const __default = {
id: 'dial-scrubber',
title: 'Scrubber',
category: 'Gauges & Scrubbers',
description: 'A jog wheel: the ruler and waveform slide under a fixed playhead, each detent jogs about half a second and the timecode follows to the frame. Push or tap to play.',
tags: ['scrub', 'jog', 'shuttle', 'timeline', 'timecode', 'video', 'audio', 'media', 'dial', 'playhead'],
surface: 'strip',
segments: 1,
data: ['media'],
fps: 8,
loop: 8,
states: ['paused', 'playing'],
tones: { paused: 'idle', playing: 'active' },
press: 'toggle',
params: {
label: { type: 'text', default: 'Clip 04', label: 'Clip', maxLength: 14 },
duration: { type: 'number', default: 184, min: 10, max: 3600, step: 1, label: 'Duration (s)' },
value: { type: 'number', default: 0.42, min: 0, max: 1, step: 0.001, label: 'Position' },
step: { type: 'number', default: 0.0025, min: 0.0005, max: 0.05, step: 0.0005, label: 'Step per detent' },
},
order: 50,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const m = ctx.data?.media;
const dur = m && m.duration > 0 ? m.duration : ctx.params.duration;
const playing = m ? !!m.playing : ctx.stateName === 'playing';
let pos = m && typeof m.position === 'number' ? m.position : ctx.value * dur + (playing && !ctx.reduced ? ctx.since : 0);
pos = playing ? ((pos % dur) + dur) % dur : clamp(pos, 0, dur); 
const e = arrival(ctx, 0.5);
k.background({ tone: playing ? 'active' : 'idle' });
const cx = w / 2, half = (w - 2 * s) / 2, lo = pos - half / PPS, hi = pos + half / PPS;
const xOf = (tau) => cx + (tau - pos) * PPS;
const rt = 33, minor = P(), major = P();
for (let q = Math.ceil(lo * 2); q <= Math.floor(hi * 2); q++) {
const tau = q / 2;
if (tau < 0 || tau > dur) continue;
const x = xOf(tau);
(q % 2 ? minor : major).M(x, rt).V(rt + (q % 2 ? 3.2 : q % 10 ? 5.5 : 8));
}
k.add(rect({ x: s, y: rt - 1, width: w - 2 * s, height: 1, fill: C.line }));
k.add(path(minor.d, { fill: 'none', stroke: C.dim, strokeWidth: 1, strokeOpacity: 0.7 }));
k.add(path(major.d, { fill: 'none', stroke: C.muted, strokeWidth: 1.2 }));
for (let q = Math.ceil(lo / 5); q <= Math.floor(hi / 5); q++) {
const tau = q * 5;
if (tau < 0 || tau > dur || Math.abs(xOf(tau) - cx) < 22 || xOf(tau) + 24 > w - s || xOf(tau) < s) continue;
const mm = Math.floor(tau / 60), ss = String(tau % 60).padStart(2, '0');
k.caption(`${mm}:${ss}`, { x: xOf(tau) + 2.5, y: rt + 15.5, align: 'left', color: 'dim', size: 10.5 });
}
const step = 3.2 / PPS, mid = 66.5, amax = 11.5 * e;
const played = P(), ahead = P();
for (let q = Math.ceil(lo / step); q <= Math.floor(hi / step); q++) {
const tau = q * step;
if (tau < 0 || tau > dur) continue;
const x = xOf(tau), a = Math.max(0.8, amp(ctx, tau) * amax);
(tau <= pos ? played : ahead).M(x, mid - a).V(mid + a);
}
k.add(path(ahead.d, { fill: 'none', stroke: C.dim, strokeWidth: 1.9, strokeLinecap: 'round', strokeOpacity: 0.65 }));
k.add(path(played.d, { fill: 'none', stroke: ctx.tint, strokeWidth: 1.9, strokeLinecap: 'round' }));
for (const edge of [0, dur]) if (edge >= lo && edge <= hi) k.add(rect({ x: xOf(edge) - 0.75, y: mid - 15, width: 1.5, height: 30, fill: C.muted }));
const oy = 85, ow = w - 2 * s, f = pos / dur;
k.add(rect({ x: s, y: oy, width: ow, height: 2.4, rx: 1.2, fill: C.line }));
k.add(rect({ x: s, y: oy, width: Math.max(2.4, ow * f), height: 2.4, rx: 1.2, fill: ctx.tint }));
const ink = k.dark ? '#ffffff' : C.ink;
k.add(rect({ x: cx - 0.8, y: rt - 2, width: 1.6, height: oy - rt - 3, fill: ink }));
k.add(path(pointer(cx, rt - 6.5, 4.6), { fill: ink }));
k.add(`<circle cx="${n(s + ow * f)}" cy="${n(oy + 1.2)}" r="3.1" fill="${ink}"/>`);
k.eyebrow(playing ? `▶ ${ctx.params.label}` : ctx.params.label, { color: playing ? 'ink' : 'muted', maxWidth: w * 0.42 });
k.value(tc(pos), { align: 'right', x: w - s, cy: 15.5, size: 19, color: 'ink', maxWidth: w * 0.56 });
return finish(k);
},
};
};
__d[263] = function (__ns) {
const { surface, path, rect, linearGradient, url, polar, n, P } = __m(113);
const { clamp, lerp, outCubic } = __m(12);
const { finish, arrival } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'dial-selector',
title: 'Rotary Selector',
category: 'Dial Segments',
description: 'A detented rotary switch: each detent clicks to the next option and the drum of names rolls by one. Push or tap to recall the selection. Wraps round endlessly.',
tags: ['selector', 'switch', 'preset', 'scene', 'rotary', 'detent', 'menu', 'dial', 'encoder'],
surface: 'strip',
segments: 1,
fps: 10,
loop: 4,
press: 'momentary',
params: {
label: { type: 'text', default: 'Scene', label: 'Label', maxLength: 12 },
options: { type: 'text', default: 'Studio,Stream,Meeting,Music,Game,Night', label: 'Options (comma separated)', maxLength: 72 },
hue: { type: 'hue', default: 296, min: 0, max: 360, label: 'Hue' },
},
order: 70,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const opts = String(ctx.params.options).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
const N = Math.max(1, opts.length || 1);
const idx = (((Math.round(ctx.ticks) % N) + N) % N);
const name = (i) => opts[((i % N) + N) % N] || '—';
const e = arrival(ctx, 0.5);
const recall = ctx.pressed ? 0 : ctx.pressAge; 
const confirming = recall < 1.4;
k.background({ tone: confirming ? 'active' : 'idle' });
const ink = k.dark ? '#ffffff' : C.ink;
const kx = 39, ky = 58, kr = 17, dr = 25.5;
const angOf = (i) => (N === 1 ? 0 : lerp(-150, 150, i / (N - 1)));
for (let i = 0; i < N; i++) {
const [x, y] = polar(kx, ky, dr, angOf(i));
k.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${i === idx ? 3.1 : 1.7}" fill="${i === idx ? ctx.tint : C.dim}"${i === idx ? '' : ' fill-opacity="0.8"'}/>`);
}
k.add(`<circle cx="${kx}" cy="${ky}" r="${kr}" fill="${C.surface2}" stroke="${C.line}" stroke-width="1.4"/>`);
k.add(`<circle cx="${kx}" cy="${ky}" r="${n(kr - 3.5)}" fill="none" stroke="${C.line}" stroke-width="1" stroke-opacity="0.8"/>`);
const a = angOf(idx) * e + (1 - e) * -150;
const [px, py] = polar(kx, ky, kr - 2.5, a), [qx, qy] = polar(kx, ky, 4, a);
k.add(path(P().M(qx, qy).L(px, py).d, { stroke: ink, strokeWidth: 2.6, strokeLinecap: 'round' }));
const x0 = 78, wy0 = 41, wy1 = 71, slide = (1 - e) * 14;
const hid = k.id('win');
k.def(linearGradient(hid, [[0, C.line, 0], [0.15, C.line, 1], [1, C.line, 0.2]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: x0 - 6, y: wy0, width: w - s - x0 + 6, height: 1.2, fill: url(hid) }));
k.add(rect({ x: x0 - 6, y: wy1, width: w - s - x0 + 6, height: 1.2, fill: url(hid) }));
if (N > 1) k.caption(name(idx - 1), { x: x0, y: 33 + slide, align: 'left', color: 'dim', opacity: e * 0.9, maxWidth: w - s - x0 });
k.label(name(idx), { x: x0, y: 63 + slide, align: 'left', size: 19, weight: 700, color: 'ink', opacity: e < 1 ? e : undefined, maxWidth: w - s - x0 });
if (N > 2) k.caption(name(idx + 1), { x: x0, y: 88 + slide, align: 'left', color: 'dim', opacity: e * 0.9, maxWidth: w - s - x0 });
if (!ctx.pressed && recall < 0.55 && !ctx.reduced) {
const p = outCubic(clamp(recall / 0.55)), bx = lerp(x0 - 40, w + 10, p);
const bid = k.id('sweep');
k.def(linearGradient(bid, [[0, ctx.tint, 0], [0.7, ctx.tint, 0.35 * (1 - p * 0.5)], [1, ink, 0.6 * (1 - p * 0.5)]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: Math.max(x0 - 6, bx - 46), y: wy0 + 1.2, width: Math.max(0.5, Math.min(w - s, bx) - Math.max(x0 - 6, bx - 46)), height: wy1 - wy0 - 1.2, fill: url(bid) }));
}
k.eyebrow(confirming ? `${ctx.params.label} ✓` : ctx.params.label, { color: confirming ? 'pos' : 'muted', maxWidth: w * 0.5 });
k.eyebrow(`${idx + 1}/${N}`, { align: 'right', x: w - s, color: 'muted' });
return finish(k);
},
};
};
__d[264] = function (__ns) {
const { surface, path, rect, linearGradient, url, n, P } = __m(113);
const { clamp, lerp } = __m(12);
const { rng: makeRng } = __m(1);
const { arrival, ramp, dbOf, pointer } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SEG = 200;
const LANES = { ruler: [25, 33], video: [39, 56], voice: [59, 72], music: [75, 87] };
const FUNCS = ['Scrub', 'Zoom', 'Video', 'Voice', 'Music', 'Speed'];
const tc = (sec) => { const t = Math.max(0, sec), m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 24); return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`; };
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const memo = new Map();
function edit(seed, dur) {
const key = `${seed}:${dur}`;
if (memo.has(key)) return memo.get(key);
const r = makeRng(seed * 7 + 3);
const video = [], voice = [], markers = [];
for (let t = 0, i = 0; t < dur; i++) { const len = 2.5 + r() * 9; video.push({ a: t, b: Math.min(dur, t + len), i }); t += len + (r() < 0.35 ? 0.4 + r() * 1.2 : 0); }
for (let t = 1 + r() * 3; t < dur;) { const len = 6 + r() * 22; voice.push({ a: t, b: Math.min(dur, t + len) }); t += len + 1.5 + r() * 6; }
for (let t = 6 + r() * 8; t < dur; t += 9 + r() * 22) markers.push(t);
const music = [{ a: 0.5, b: dur * 0.58 }, { a: dur * 0.6, b: dur - 0.5 }];
const out = { video, voice, music, markers };
if (memo.size > 32) memo.clear();
memo.set(key, out);
return out;
}
const __default = {
id: 'strip-timeline',
title: 'Timeline Strip',
category: 'Strip Panoramas',
description: 'An editing timeline across the strip: ruler, video, dialogue and music lanes. Dial 1 scrubs, dial 2 zooms, the rest set levels. Push to play; the playhead sweeps.',
tags: ['timeline', 'edit', 'video', 'nle', 'daw', 'scrub', 'zoom', 'playhead', 'strip', 'touch strip', 'panorama'],
surface: 'strip',
segments: 'all',
data: ['media'],
fps: 6,
loop: 12,
states: ['paused', 'playing'],
tones: { paused: 'idle', playing: 'active' },
press: 'toggle',
params: {
duration: { type: 'number', default: 240, min: 30, max: 3600, step: 1, label: 'Duration (s)' },
step: { type: 'number', default: 0.005, min: 0.001, max: 0.05, step: 0.001, label: 'Step per detent' },
hue: { type: 'hue', default: 243.6, min: 0, max: 360, label: 'Hue' },
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const count = Math.round(w / SEG);
const val = (i, d) => ctx.values[i] ?? d;
const m = ctx.data?.media;
const dur = m && m.duration > 0 ? m.duration : ctx.params.duration;
const playing = m ? !!m.playing : ctx.stateName === 'playing';
const rate = count > 5 ? Math.max(0.25, Math.round(lerp(0.25, 2, val(5, 0.45)) * 4) / 4) : 1;
let pos = m && typeof m.position === 'number' ? m.position : val(0, 0.35) * dur + (playing && !ctx.reduced ? ctx.since * rate : 0);
pos = playing ? ((pos % dur) + dur) % dur : clamp(pos, 0, dur - 0.001);
const win = Math.round(lerp(10, 90, val(1, 0.8)));
const page = Math.floor(pos / win) * win;
const pps = (w - 2 * s) / win, X = (t) => s + (t - page) * pps;
const lv = { video: val(2, 0.55), voice: val(3, 0.2), music: val(4, 0.65) };
const e = arrival(ctx, 0.6);
k.background({ tone: playing ? 'active' : 'idle' });
const E = edit(ctx.seed, dur);
const px = X(pos), ink = k.dark ? '#ffffff' : C.ink;
const nice = (px) => [1, 2, 5, 10, 15, 30, 60, 120, 300].find((st) => st * pps >= px) || 600;
const major = nice(40), every = Math.max(major, nice(110));
for (let i = 0; i < count; i++) {
const xa = i * SEG, xb = xa + SEG;
const ta = page + (xa - s) / pps, tb = page + (xb - s) / pps;
const inSeg = (a, b) => b >= ta && a <= tb;
const clipX = (a, b) => [Math.max(xa, X(a), s), Math.min(xb, X(b), w - s)];
const tk = P(), tkm = P();
const minor = major / 5;
for (let q = Math.ceil(ta / minor); q <= Math.floor(tb / minor); q++) {
const t = q * minor, x = X(t);
if (x < Math.max(xa, s) || x >= Math.min(xb, w - s) || t > dur) continue;
(q % 5 ? tk : tkm).M(x, LANES.ruler[1]).V(LANES.ruler[1] - (q % 5 ? 2.6 : 6));
if (!(q % 5) && Math.abs(t / every - Math.round(t / every)) < 1e-6 && x + 26 < w - s) k.caption(clock(t), { x: x + 2.5, y: LANES.ruler[1] - 2, align: 'left', color: 'dim', size: 10 });
}
k.add(path(tk.d, { fill: 'none', stroke: C.dim, strokeWidth: 1, strokeOpacity: 0.7 }) + path(tkm.d, { fill: 'none', stroke: C.muted, strokeWidth: 1.2 }));
k.add(rect({ x: Math.max(xa, s), y: LANES.ruler[1], width: Math.min(xb, w - s) - Math.max(xa, s), height: 1, fill: C.line }));
let vd = '';
for (const c of E.video) {
if (!inSeg(c.a, c.b)) continue;
const [x0, x1] = clipX(c.a + 0.05, c.b - 0.05);
if (x1 - x0 < 0.6) continue;
const [y0, y1] = LANES.video, hh = (y1 - y0) * e;
k.add(rect({ x: x0, y: y1 - hh, width: x1 - x0, height: hh, rx: 2, fill: ramp(ctx, (c.i % 7) / 6, 120), fillOpacity: n(lerp(0.25, 0.9, lv.video), 3) }));
vd += `M${n(x0)} ${n(y1 - hh + 0.75)}H${n(x1)}`;
}
if (vd) k.add(path(vd, { fill: 'none', stroke: '#ffffff', strokeWidth: 1, strokeOpacity: k.dark ? 0.35 : 0.6 }));
let wave = '';
for (const c of E.voice) {
if (!inSeg(c.a, c.b)) continue;
const [x0, x1] = clipX(c.a, c.b);
if (x1 - x0 < 0.6) continue;
const [y0, y1] = LANES.voice, mid = (y0 + y1) / 2;
k.add(rect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 2, fill: C.line, fillOpacity: 0.75 }));
for (let x = Math.ceil(x0 / 3) * 3 + 1.5; x < x1 - 1; x += 3) {
const t = page + (x - s) / pps;
const a = Math.max(0.6, clamp(0.25 + Math.abs(ctx.noise.n1(t * 1.9) * 1.1 + ctx.noise.n1(t * 7.3 + 3) * 0.4)) * (y1 - y0) * 0.45 * lerp(0.2, 1, lv.voice) * e);
wave += `M${n(x)} ${n(mid - a)}V${n(mid + a)}`;
}
}
if (wave) k.add(path(wave, { fill: 'none', stroke: ramp(ctx, 0.85, 120), strokeWidth: 1.6, strokeLinecap: 'round' }));
for (const c of E.music) {
if (!inSeg(c.a, c.b)) continue;
const [x0, x1] = clipX(c.a, c.b);
if (x1 - x0 < 0.6) continue;
const [y0, y1] = LANES.music;
const env = P().M(x0, y1);
for (let x = x0; x <= x1 + 0.01; x += 4) { const t = page + (Math.min(x, x1) - s) / pps; env.L(Math.min(x, x1), y1 - (y1 - y0) * clamp(0.45 + 0.4 * ctx.noise.n1(t * 0.31 + 9)) * lerp(0.25, 1, lv.music) * e); }
k.add(path(`${env.L(x1, y1).d}Z`, { fill: ramp(ctx, 0.15, 120), fillOpacity: 0.6 }));
k.add(rect({ x: x0, y: y1 - 0.5, width: x1 - x0, height: 1, fill: ramp(ctx, 0.15, 120), fillOpacity: 0.8 }));
}
for (const t of E.markers) { const x = X(t); if (x >= Math.max(xa, s) && x < Math.min(xb, w - s)) k.add(path(P().M(x, LANES.ruler[1] + 0.8).L(x + 2.7, LANES.ruler[1] + 3.4).L(x, LANES.ruler[1] + 6).L(x - 2.7, LANES.ruler[1] + 3.4).Z().d, { fill: C.warn })); }
const vx1 = Math.min(xb, px, w - s), vx0 = Math.max(xa, s);
if (vx1 > vx0) k.add(rect({ x: vx0, y: LANES.video[0] - 1, width: vx1 - vx0, height: LANES.music[1] - LANES.video[0] + 2, fill: k.dark ? '#ffffff' : '#000000', fillOpacity: 0.05 }));
const f = FUNCS[i] || `Dial ${i + 1}`;
const read = [tc(pos), `${win} s`, `${Math.round(lv.video * 100)}%`, `${dbOf(lv.voice)} dB`, `${dbOf(lv.music)} dB`, `${rate}×`][i] ?? '';
k.eyebrow(i === 0 && playing ? `▶ ${f}` : f, { x: xa + (i ? 10 : s), align: 'left', color: i === 0 && playing ? 'ink' : 'muted', maxWidth: SEG * 0.4 });
k.eyebrow(read, { x: xb - (i === count - 1 ? s : 10), align: 'right', color: 'ink', maxWidth: SEG * 0.55 });
if (i) {
const did = k.id(`div${i}`);
k.def(linearGradient(did, [[0, C.ink, 0.28], [1, C.ink, 0]]));
k.add(rect({ x: xa - 0.5, y: 6, width: 1, height: 16, fill: url(did) }));
}
}
k.add(rect({ x: px - 0.8, y: LANES.ruler[0] - 1, width: 1.6, height: LANES.music[1] - LANES.ruler[0] + 3, fill: ink }));
k.add(path(pointer(px, LANES.ruler[0] - 3.5, 3.6), { fill: playing ? ctx.tint : ink }));
return k.svg();
},
};
};
__d[265] = function (__ns) {
const { surface, rect, path, n } = __m(113);
const { clamp, lerp } = __m(12);
const { finish, arrival, ramp } = __m(254);
__e(__ns, { "default": () => __default }, [], ["default"]);
const BARS = 20;
const __default = {
id: 'dial-value-bars',
title: 'Value Bars',
category: 'Dial Segments',
description: 'A stepped wedge of 20 bars: one detent lights one bar, the lead bar fills for finer steps. Push or tap to switch off; the bars drain and stand hollow.',
tags: ['bars', 'level', 'brightness', 'fader', 'dial', 'encoder', 'meter', 'wedge'],
surface: 'strip',
segments: 1,
fps: 10,
loop: 4,
states: ['on', 'off'],
tones: { on: 'active', off: 'idle' },
press: 'toggle',
params: {
label: { type: 'text', default: 'Brightness', label: 'Label', maxLength: 14 },
value: { type: 'number', default: 0.65, min: 0, max: 1, step: 0.01, label: 'Level' },
step: { type: 'number', default: 0.05, min: 0.01, max: 0.1, step: 0.01, label: 'Step per detent' },
hue: { type: 'hue', default: 60.4, min: 0, max: 360, label: 'Hue' },
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, s = k.m.safe;
const off = ctx.stateName === 'off';
const e = arrival(ctx, off ? 0.36 : 0.5);
k.background({ tone: off ? 'idle' : 'active' });
const v = ctx.value, lit = v * BARS;
const reach = off ? lit * (1 - e) : lit * e;
const x0 = s, x1 = w - s, top = 47, bottom = 88, pitch = (x1 - x0) / BARS, bw = pitch * 0.66;
let track = '';
for (let i = 0; i < BARS; i++) {
const bh = (bottom - top) * lerp(0.2, 1, i / (BARS - 1));
const x = x0 + i * pitch + (pitch - bw) / 2, y = bottom - bh;
const f = clamp(reach - i); 
if (f < 1) track += `M${n(x)} ${n(y)}h${n(bw)}v${n(bh)}h${n(-bw)}Z`;
if (f > 0) {
const lead = reach - i < 1.0001 && reach - i > 0;
const fh = bh * f;
k.add(rect({ x, y: bottom - fh, width: bw, height: fh, rx: Math.min(1.2, bw / 4), fill: ramp(ctx, i / (BARS - 1), 120) }));
if (lead && !off) k.add(rect({ x: x - 0.6, y: bottom - fh - 1.6, width: bw + 1.2, height: 2, rx: 1, fill: k.dark ? '#ffffff' : C.ink }));
}
}
if (track) k.add(path(track, off ? { fill: 'none', stroke: C.dim, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.8 } : { fill: C.line, fillOpacity: 0.85 }));
k.eyebrow(off ? `${ctx.params.label} · Off` : ctx.params.label, { color: off ? 'dim' : 'muted', maxWidth: w * 0.62 });
k.value(off ? 'Off' : String(Math.round(v * 100 * (off ? 1 : e))), { align: 'right', x: w - s, cy: 25, color: off ? 'dim' : 'ink', maxWidth: w * 0.36 });
return finish(k);
},
};
};
__d[266] = function (__ns) {
const { surface, path, arcPath, polar, n } = __m(113);
const { clamp, lerp, arrive } = __m(12);
const { finish, arrival, spectralArc, tickPaths, signal, dbOf } = __m(254);
const { mutedPlate, strike } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'dial-volume-arc',
title: 'Volume Arc',
category: 'Dial Segments',
description: 'A 270° spectral arc that follows every detent, with a dB readout and the signal inside. Push or tap to mute. Output or mic; shows the level only.',
tags: ['volume', 'arc', 'dial', 'encoder', 'mute', 'audio', 'level', 'db', 'knob'],
surface: 'strip',
segments: 1,
data: ['audio'],
fps: 6,
loop: 6,
states: ['on', 'muted'],
tones: { on: 'idle', muted: 'neg' },
press: 'toggle',
link: (p) => (p.controls === 'mic' ? { 'mic.muted': { on: false, muted: true } } : { 'volume.level': 'value', 'volume.muted': { on: false, muted: true } }),
params: {
controls: { type: 'select', default: 'output', options: ['output', 'mic'], label: 'Shows (output volume, or your mic)' },
label: { type: 'text', default: 'Master', label: 'Channel', maxLength: 12 },
value: { type: 'number', default: 0.64, min: 0, max: 1, step: 0.01, label: 'Level' },
step: { type: 'number', default: 0.02, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
hue: { type: 'hue', default: 138.9, min: 0, max: 360, label: 'Hue' },
},
order: 20,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u, s = k.m.safe;
const muted = ctx.stateName === 'muted';
const mic = ctx.params.controls === 'mic';
k.background({ tone: muted ? 'neg' : 'idle' });
if (muted && mic) mutedPlate(k, { since: ctx.since });
const e = arrival(ctx);
const drain = muted ? arrive(ctx.since, 0.32) : 0; 
const v = ctx.value, shown = muted ? v : v * e;
const cx = 51, cy = 51, r = 32.5, sw = 6.4;
const FROM = -135, TO = 135;
const tk = tickPaths(cx, cy, r + 9.5, 2.4, 4.6, FROM, TO, 28, 0);
k.add(path(tk.minor, { fill: 'none', stroke: C.dim, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.55, strokeLinecap: 'round' }));
const mj = tickPaths(cx, cy, r + 9.5, 4.6, 4.6, FROM, TO, 3, 1);
k.add(path(mj.major, { fill: 'none', stroke: C.muted, strokeWidth: n(Math.max(1.2, k.m.hair * 1.4)), strokeLinecap: 'round' }));
k.add(path(arcPath(cx, cy, r, FROM, TO), { fill: 'none', stroke: C.line, strokeWidth: n(sw), strokeLinecap: 'round', strokeOpacity: 0.9 }));
if (!muted || drain < 1) k.add(spectralArc(ctx, { cx, cy, r, width: sw, from: FROM, to: TO, value: shown, spread: 110, opacity: 1 - drain }));
if (muted && drain > 0) k.add(path(arcPath(cx, cy, r, FROM, lerp(FROM, TO, Math.max(0.004, v))), { fill: 'none', stroke: C.dim, strokeWidth: n(sw * 0.55), strokeLinecap: 'round', strokeOpacity: n(0.75 * drain, 3) }));
const [mx, my] = polar(cx, cy, r, lerp(FROM, TO, shown));
k.add(`<circle cx="${n(mx)}" cy="${n(my)}" r="${n(sw * 0.62)}" fill="${muted ? C.dim : k.dark ? '#ffffff' : C.ink}"/>`);
k.add(`<circle cx="${n(mx)}" cy="${n(my)}" r="${n(sw * 0.62)}" fill="none" stroke="${C.surface2}" stroke-width="${n(Math.max(1, k.m.hair))}" stroke-opacity="0.7"/>`);
if (!muted) {
const lvl = clamp(signal(ctx, 'audio', { speed: 1.4, lo: 0.25, hi: 0.95 }) * shown);
k.add(path(arcPath(cx, cy, r - 8.6, FROM, TO), { fill: 'none', stroke: C.line, strokeWidth: 2, strokeLinecap: 'round', strokeOpacity: 0.7 }));
if (lvl > 0.01) k.add(path(arcPath(cx, cy, r - 8.6, FROM, lerp(FROM, TO, lvl)), { fill: 'none', stroke: ctx.tint, strokeWidth: 2, strokeLinecap: 'round', strokeOpacity: 0.85 }));
}
const gbox = { x: cx - 13, y: cy - 13, size: 26 };
if (mic) { k.glyph('mic', { state: muted ? 'off' : 'on', level: shown, box: gbox }); if (muted) strike(k, gbox, { since: ctx.since }); }
else k.glyph('volume', { state: muted ? 'muted' : 'on', level: shown, box: gbox });
const x0 = 103;
k.eyebrow(muted ? (mic ? 'MUTED' : 'Muted') : mic && ctx.params.label === 'Master' ? 'Mic' : ctx.params.label, { x: x0, align: 'left', color: muted ? (mic ? 'ink' : 'neg') : 'muted', maxWidth: w - x0 - s });
k.value(String(Math.round(shown * 100)), { align: 'right', x: w - s, cy: h * 0.5, color: muted ? 'dim' : 'ink', maxWidth: w - x0 - s });
k.caption(`${dbOf(shown)} dB`, { align: 'right', x: w - s, y: h - 16, color: muted ? 'dim' : 'muted', maxWidth: w - x0 - s });
return finish(k);
},
};
};
__d[267] = function (__ns) {
const { surface, rect, linearGradient, url, path, n } = __m(113);
const { noise1 } = __m(1);
const { clamp } = __m(12);
const { mutedPlate, strike } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'dial-volume',
title: 'Volume Dial',
category: 'Dial Segments',
description: 'Turn to set a level, push to mute: a spectral Beam with the signal beneath. Pick output or mic; it shows the level only (no system volume control yet).',
tags: ['volume', 'audio', 'dial', 'encoder', 'mute', 'level', 'knob'],
surface: 'strip',
segments: 1,
data: ['audio'],
fps: 15,
loop: 6,
states: ['on', 'muted'],
tones: { on: 'idle', muted: 'neg' },
press: 'toggle',
link: (p) => (p.controls === 'mic' ? { 'mic.muted': { on: false, muted: true } } : { 'volume.level': 'value', 'volume.muted': { on: false, muted: true } }),
params: {
controls: { type: 'select', default: 'output', options: ['output', 'mic'], label: 'Shows (output volume, or your mic)' },
label: { type: 'text', default: 'Master', label: 'Channel', maxLength: 12 },
value: { type: 'number', default: 0.64, min: 0, max: 1, step: 0.01, label: 'Level' },
step: { type: 'number', default: 0.02, min: 0.005, max: 0.1, step: 0.005, label: 'Step per tick' },
},
order: 10,
render(ctx) {
const k = surface(ctx);
const { w, h, t, stateName } = ctx;
const muted = stateName === 'muted';
const s = k.m.safe;
const mic = ctx.params.controls === 'mic';
k.background({ tone: muted ? 'neg' : 'idle' });
if (muted && mic) mutedPlate(k, { since: ctx.since });
k.eyebrow(muted ? (mic ? 'MIC · MUTED' : 'Muted') : mic && ctx.params.label === 'Master' ? 'Mic' : ctx.params.label, { color: muted ? (mic ? 'ink' : 'neg') : 'muted' });
k.lambda();
const v = ctx.value;
const isz = h * 0.42;
const gbox = { x: s * 0.6, y: h * 0.47 - isz / 2, size: isz };
if (mic) { k.glyph('mic', { state: muted ? 'off' : 'on', level: v, box: gbox }); if (muted) strike(k, gbox, { since: ctx.since }); }
else k.glyph('volume', { state: muted ? 'muted' : 'on', level: v, box: gbox });
k.value(String(Math.round(v * 100)), { align: 'right', x: w - s, cy: h * 0.47, color: muted ? 'dim' : 'ink', maxWidth: w - isz - s * 3 });
const bx = s, bw = w - s * 2, by = h * 0.76, bh = k.m.bold * 1.1;
const fill = k.id('level');
k.def(linearGradient(fill, [[0, ctx.theme.spectral(ctx.hue + 50)], [0.55, ctx.theme.spectral(ctx.hue - 40)], [1, ctx.theme.spectral(ctx.hue - 120)]], { x1: bx, y1: 0, x2: bx + bw, y2: 0, gradientUnits: 'userSpaceOnUse' }));
k.add(rect({ x: bx, y: by, width: bw, height: bh, rx: bh / 2, fill: k.colors.line }));
if (v > 0.005) {
k.add(rect({ x: bx, y: by, width: Math.max(bh, bw * v), height: bh, rx: bh / 2, fill: muted ? k.colors.dim : url(fill), fillOpacity: muted ? 0.6 : 0.42 }));
if (!muted) {
const sig = typeof ctx.data.audio?.level === 'number' ? ctx.data.audio.level : clamp(0.35 + 0.45 * (noise1(t * 3.1, ctx.seed) * 0.7 + noise1(t * 13, ctx.seed + 5) * 0.3));
k.add(rect({ x: bx, y: by, width: Math.max(bh, bw * v * sig), height: bh, rx: bh / 2, fill: url(fill) }));
}
const mx = bx + bw * v;
k.add(rect({ x: mx - k.m.line / 2, y: by - bh * 0.6, width: k.m.line, height: bh * 2.2, rx: k.m.line / 2, fill: muted ? k.colors.dim : (k.dark ? '#ffffff' : k.colors.ink) }));
}
let d = '';
for (let i = 0; i <= 10; i++) { const x = bx + (bw * i) / 10; d += `M${n(x)} ${n(by + bh + k.m.line * 1.5)}v${n(i % 5 ? k.m.line * 1.2 : k.m.line * 2.4)}`; }
k.add(path(d, { stroke: k.colors.dim, strokeWidth: k.m.hair, strokeOpacity: 0.7 }));
return k.svg();
},
};
};
__d[268] = function (__ns) {
const { surface, rect, path, n, P, linearGradient, url } = __m(113);
const { clamp, lerp, outExpo } = __m(12);
const { mix } = __m(4);
const { finish, arrival, pointer } = __m(254);
const { text } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const LO = 0.1, HI = 8;
const zoomOf = (v) => LO * (HI / LO) ** clamp(v);
const valueOf = (z) => Math.log(z / LO) / Math.log(HI / LO);
const pct = (z) => `${Math.round(z * 100)}%`;
const __default = {
id: 'dial-zoom',
title: 'Zoom Dial',
category: 'Dial Segments',
description: 'Zoom on a dial: each detent is an even step on a log scale from 10 % to 800 %, a minimap frames the viewport, push to fit. Hold the strip to return to 100 %.',
tags: ['zoom', 'scale', 'magnify', 'design', 'canvas', 'editor', 'fit', 'dial', 'encoder'],
surface: 'strip',
segments: 1,
fps: 10,
loop: 4,
press: 'momentary',
params: {
label: { type: 'text', default: 'Zoom', maxLength: 12, label: 'Label' },
value: { type: 'number', default: Math.round(valueOf(1) * 10000) / 10000, min: 0, max: 1, step: 0.0001, label: 'Zoom (0–1 on the log scale; 100 % ≈ 0.525)' },
step: { type: 'number', default: 0.02, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
hue: { type: 'hue', default: 217.5, min: 0, max: 360, label: 'Hue' },
},
order: 42,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors;
const v = clamp(ctx.value);
const z = zoomOf(v);
const e = arrival(ctx, 0.5);
const fit = ctx.pressed || ctx.pressAge < 1.2;
k.background({ tone: fit ? 'active' : 'idle' });
const s = k.m.safe;
const ink = k.dark ? '#ffffff' : C.ink;
const mx = s + 2, my = 24, mw = 66, mh = 46;
k.add(rect({ x: mx, y: my, width: mw, height: mh, rx: 4, fill: k.dark ? mix(C.surface2, '#000000', 0.4) : mix(C.surface2, C.line, 0.3), stroke: C.line, strokeWidth: 1 }));
const bx = mx + 8, byy = my + 8;
let content = `M${n(bx)} ${n(byy)}h${n(mw * 0.42)}v3.2h${n(-mw * 0.42)}Z`;
for (let i = 0; i < 3; i++) content += `M${n(bx)} ${n(byy + 9 + i * 6)}h${n(mw * (0.72 - i * 0.12))}v2h${n(-mw * (0.72 - i * 0.12))}Z`;
content += `M${n(mx + mw * 0.62)} ${n(my + mh * 0.58)}h${n(mw * 0.26)}v${n(mh * 0.28)}h${n(-mw * 0.26)}Z`;
k.add(path(content, { fill: C.dim, fillOpacity: 0.7 }));
const vw = clamp(mw / z, 6, mw + 10), vh = clamp(mh / z, 4, mh + 8);
const vx = mx + mw / 2 - vw / 2, vy = my + mh / 2 - vh / 2;
const tint = ctx.tint;
const turning = Number.isFinite(ctx.turnAge) && ctx.turnAge < 0.6;
k.add(rect({ x: n(vx), y: n(vy), width: n(vw), height: n(vh), rx: 2.5, fill: tint, fillOpacity: turning ? 0.16 : 0.1, stroke: tint, strokeWidth: turning ? 2 : 1.6 }));
const cm = Math.min(5, vw / 3, vh / 3);
const cx0 = vx, cy0 = vy, cw = vw, chh = vh;
const corners = P().M(cx0, cy0 + cm).V(cy0).H(cx0 + cm).M(cx0 + cw - cm, cy0).H(cx0 + cw).V(cy0 + cm).M(cx0 + cw, cy0 + chh - cm).V(cy0 + chh).H(cx0 + cw - cm).M(cx0 + cm, cy0 + chh).H(cx0).V(cy0 + chh - cm);
k.add(path(corners.d, { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinecap: 'round' }));
const rx0 = mx + mw + 12, rx1 = w - s;
k.eyebrow(fit ? `${ctx.params.label} · fit ✓` : ctx.params.label, { x: s, color: fit ? 'pos' : 'muted', maxWidth: w - s * 2 });
text(k, fit && ctx.pressAge < 1.2 && !ctx.pressed ? 'Fit' : pct(z), { x: rx1, cy: 46, size: turning ? 29 : 27, weight: 700, tabular: true, anchor: 'end', color: 'ink', maxWidth: rx1 - rx0, opacity: e });
const sy = 80, sx0 = rx0, sw = rx1 - rx0;
let tk = '';
for (const m of [0.25, 0.5, 1, 2, 4]) { const x = sx0 + sw * valueOf(m); tk += `M${n(x)} ${n(sy)}v${m === 1 ? 7 : 4.5}`; }
for (let i = 0; i <= 20; i++) { const x = sx0 + (sw * i) / 20; tk += `M${n(x)} ${n(sy)}v1.8`; }
k.add(rect({ x: n(sx0), y: sy - 0.5, width: n(sw), height: 1, fill: C.line }));
k.add(path(tk, { stroke: C.dim, strokeWidth: 1, fill: 'none' }));
text(k, '100', { x: sx0 + sw * valueOf(1), y: sy + 15, size: 8.5, weight: 600, color: 'dim' });
const px = sx0 + sw * v * e + sw * (1 - e) * valueOf(1);
k.add(path(pointer(px, sy - 6.5, 3.6), { fill: tint }));
void lerp; void outExpo; void linearGradient; void url;
return finish(k);
},
};
};
__d[269] = function (__ns) {
const { keyInto, rect, path, P, n, attrs, linearGradient, url } = __m(113);
const { PanelSurface } = __m(110);
const { childContext } = __m(111);
const { gameGrid } = __m(98);
const { Pen } = __m(16);
const { clamp, lerp, outExpo } = __m(12);
__e(__ns, { "HUE": () => HUE, "SPECTRUM": () => SPECTRUM, "spread": () => spread, "ageOf": () => ageOf, "cellsOf": () => cellsOf, "middleCell": () => middleCell, "beamColor": () => beamColor, "beam": () => beam, "sweepX": () => sweepX, "burst": () => burst, "ringWave": () => ringWave, "converge": () => converge, "convergeText": () => convergeText, "progressBeam": () => progressBeam, "readoutCard": () => card, "screenCards": () => screenCards, "readout": () => readout, "hasReadout": () => hasReadout, "statusKey": () => statusKey, "cellKey": () => cellKey, "panelBase": () => panelBase }, [], ["HUE","SPECTRUM","ageOf","beam","beamColor","burst","cellKey","cellsOf","converge","convergeText","hasReadout","middleCell","panelBase","progressBeam","readout","readoutCard","ringWave","screenCards","spread","statusKey","sweepX"]);
const HUE = { rose: 8, coral: 34.2, amber: 60.4, citrine: 86.5, lime: 112.7, jade: 138.9, mint: 165.1, cyan: 191.3, cerulean: 217.5, azure: 243.6, periwinkle: 269.8, violet: 296 };
const SPECTRUM = Object.values(HUE);
function spread(count, from = HUE.rose, to = HUE.violet) {
if (count <= 1) return [lerp(from, to, 0.5)];
return Array.from({ length: count }, (_, i) => +(from + ((to - from) * i) / (count - 1)).toFixed(1));
}
const ageOf = (ctx) => (ctx.reduced || !ctx.gameEvent ? Infinity : ctx.gameEvent.age);
function cellsOf(ctx) {
const G = gameGrid(ctx);
return ctx.grid.cells.map((rect, k) => ({ rect, i: rect.i, col: G.cells[k].col, row: G.cells[k].row, k }));
}
function middleCell(cols, rows) {
let best = 0, bd = Infinity;
for (let i = 0; i < cols * rows; i++) { const d = Math.abs((i % cols) - (cols - 1) / 2) + Math.abs(Math.floor(i / cols) - (rows - 1) / 2); if (d < bd - 1e-9) { bd = d; best = i; } }
return best;
}
const beamColor = (q) => q.colors.beam || (q.dark ? '#ffffff' : q.colors.ink);
const FRINGE = [HUE.rose, HUE.amber, HUE.jade, HUE.azure, HUE.violet];
function beam(q, x, { alpha = 1, slant = 0.2, dir = 1, width, fringe = true, glow = true, axis = 'x' } = {}) {
if (alpha <= 0.01) return;
const u = q.m.u;
const band = axis === 'y'
? (cy, wd) => { const s = slant * q.w / 2; return P().M(0, cy - wd / 2 + s).L(0, cy + wd / 2 + s).L(q.w, cy + wd / 2 - s).L(q.w, cy - wd / 2 - s).Z().d; }
: (cx, wd) => { const s = slant * q.h / 2; return P().M(cx - wd / 2 + s, 0).L(cx + wd / 2 + s, 0).L(cx + wd / 2 - s, q.h).L(cx - wd / 2 - s, q.h).Z().d; };
const c = beamColor(q);
if (glow) {
const id = q.id('beamglow');
q.def(linearGradient(id, [[0, c, 0], [0.5, c, q.dark ? 0.34 : 0.22], [1, c, 0]], axis === 'y' ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 }));
q.add(path(band(x, 16 * u), { fill: url(id), fillOpacity: alpha < 1 ? n(alpha, 3) : null }));
}
if (fringe) FRINGE.forEach((hue, j) => {
q.add(path(band(x - dir * (2.2 + j * 1.7) * u, 1.25 * u), { fill: q.theme.spectral(hue), fillOpacity: n(alpha * (0.75 - j * 0.11), 3) }));
});
q.add(path(band(x, width ?? Math.max(1.2, 1.4 * u)), { fill: c, fillOpacity: alpha < 1 ? n(alpha, 3) : null }));
}
function sweepX(age, { t0 = 0, dur = 0.7, pos = 0, span = 1, w, dir = 1 } = {}) {
const u = clamp((age - t0) / dur, 0, 1);
const g = lerp(-0.4, span + 0.4, outExpo(u) * 0.35 + u * 0.65); 
const local = dir > 0 ? g - pos : span - g - pos;
return { x: local * w, on: u > 0 && u < 1 && local > -0.45 && local < 1.45, u };
}
function burst(q, u, { cx = q.w / 2, cy = q.h / 2, r0, r1, rays = 12, width, alpha = 1, rot = 15, hues = SPECTRUM } = {}) {
if (!(u > 0 && u < 1)) return;
const R0 = r0 ?? Math.min(q.w, q.h) * 0.16, R1 = r1 ?? Math.min(q.w, q.h) * 0.5;
const e = outExpo(u), op = alpha * Math.pow(1 - u, 1.4);
const a = R0 + (R1 - R0) * e * 0.5, b = R0 + (R1 - R0) * e;
for (let i = 0; i < rays; i++) {
const ang = ((rot + (i * 360) / rays) * Math.PI) / 180, sx = Math.sin(ang), sy = -Math.cos(ang);
q.add(path(P().M(cx + sx * a, cy + sy * a).L(cx + sx * b, cy + sy * b).d, { fill: 'none', stroke: q.theme.spectral(hues[i % hues.length]), strokeWidth: n(width ?? Math.max(1.5, 1.9 * q.m.u)), strokeOpacity: n(op, 3), strokeLinecap: 'round' }));
}
}
function ringWave(q, u, { cx = q.w / 2, cy = q.h / 2, r0, r1, color, width, alpha = 1 } = {}) {
if (!(u > 0 && u < 1)) return;
const R = lerp(r0 ?? Math.min(q.w, q.h) * 0.2, r1 ?? Math.min(q.w, q.h) * 0.62, outExpo(u));
q.add(path(P().M(cx + R, cy).A(R, R, 0, 0, 1, cx - R, cy).A(R, R, 0, 0, 1, cx + R, cy).Z().d, { fill: 'none', stroke: color || beamColor(q), strokeWidth: n(width ?? Math.max(1.2, 1.5 * q.m.u)), strokeOpacity: n(alpha * (1 - u), 3) }));
}
function ghostMarkup(pen, color, opacity, sw) {
let out = '';
for (const p of pen.flat()) {
const op = n(opacity * (p.opacity ?? 1), 3);
const a = p.fill ? { d: p.d, fill: color, fillOpacity: op } : { d: p.d, fill: 'none', stroke: color, strokeWidth: n(sw * (p.weight ?? 1)), strokeOpacity: op, strokeLinecap: 'round', strokeLinejoin: 'round' };
const el = `<path${attrs(a)}/>`;
out += p.transforms?.length ? `<g transform="${p.transforms.join(' ')}">${el}</g>` : el;
}
return out;
}
function converge(q, draw, u, { box, tone = 'active', labeled = false, spread: d = 7, hues = [HUE.rose, HUE.violet], opacity = 1 } = {}) {
const B = box || q.theme.glyphBox(q, { labeled });
if (u < 1) {
const pen = new Pen();
draw(pen);
const s = B.size / 48, e = outExpo(clamp(u)), off = d * (1 - e), op = (1 - e) * 0.85 * opacity;
if (op > 0.01) hues.forEach((h, j) => {
const dx = (j ? 1 : -1) * off;
q.add(`<g transform="translate(${n(B.x)} ${n(B.y)}) scale(${n(s, 4)}) translate(${n(dx)} 0)">${ghostMarkup(pen, q.theme.spectral(h), op, 2.6)}</g>`);
});
const a = clamp(e * 1.15) * opacity;
if (a > 0.01) q.paintPen(pen, { box: B, tone, opacity: a < 0.999 ? +a.toFixed(3) : undefined });
return B;
}
q.pictogram(draw, { box: B, tone, opacity: opacity < 1 ? opacity : undefined });
return B;
}
function convergeText(q, role, str, u, o = {}) {
if (u >= 1) { q.text(role, str, o); return; }
if (u <= 0) return; 
const e = outExpo(clamp(u)), off = 3.5 * q.m.u * (1 - e); 
if (1 - e > 0.02) [HUE.rose, HUE.violet].forEach((h, j) => q.text(role, str, { ...o, x: (o.x ?? q.w / 2) + (j ? 1 : -1) * off, color: q.theme.spectral(h), opacity: +((1 - e) * 0.6).toFixed(3) }));
const a = clamp(e * 1.2); 
if (a > 0.01) q.text(role, str, { ...o, opacity: a < 0.999 ? +a.toFixed(3) : undefined });
}
function panelInto(parent, r, draw, { kind = 'screen', tag = 'p', ...rest } = {}) {
const k = new PanelSurface(childContext(parent.ctx, r, { kind, tag, ...rest }));
draw(k);
if (k.defs) parent.def(k.defs);
const id = parent.id(`clip${tag}`);
parent.def(`<clipPath id="${id}"><rect x="${n(r.x + 0.02)}" y="${n(r.y + 0.02)}" width="${n(r.w - 0.04)}" height="${n(r.h - 0.04)}"/></clipPath>`);
parent.add(`<g clip-path="url(#${id})"><g transform="translate(${n(r.x)} ${n(r.y)})">${k.body}</g></g>`);
}
function progressBeam(p, { x, y, w, value, color, h }) {
const H = h ?? Math.max(2, p.m.u * 1.4), v = clamp(value);
p.add(rect({ x, y, width: w, height: H, rx: H / 2, fill: p.colors.line || p.colors.dim, fillOpacity: 0.55 }));
if (v > 0.002) {
p.add(rect({ x, y, width: Math.max(H, w * v), height: H, rx: H / 2, fill: color || p.ctx.tint }));
if (v < 0.998) p.add(rect({ x: x + w * v - H * 0.5, y: y - H * 0.6, width: H, height: H * 2.2, rx: H / 2, fill: beamColor(p) }));
}
}
function card(p, c) {
p.background({ tone: c.tone || 'idle' });
const pad = Math.round(Math.max(p.m.text, p.h * 0.12));
const F = { x0: pad, x1: p.w - pad, w: p.w - pad * 2, top: pad, cy: p.h * 0.54, foot: p.h - pad * 0.9, pad };
if (c.title) {
const eb = p.typeStyle('eyebrow');
const s = Math.round(eb.size * 0.62);
p.add(rect({ x: F.x0, y: F.top + eb.size * 0.36 - s / 2, width: s, height: s, rx: Math.max(1, s * 0.22), fill: p.ctx.tint }));
p.eyebrow(c.title, { x: F.x0 + s * 1.7, y: F.top + eb.size * 0.72, maxWidth: F.w - s * 1.7 });
}
if (c.meta) p.caption(c.meta, { align: 'right', x: F.x1, y: F.top + p.typeStyle('eyebrow').size * 0.72, color: 'dim', maxWidth: F.w * 0.45 });
if (c.draw) c.draw(p, F);
else if (c.value !== undefined && c.value !== null) p.text(c.role || 'hero', String(c.value), { align: 'left', x: F.x0, cy: c.sub || c.bar !== undefined ? p.h * 0.5 : p.h * 0.56, maxWidth: F.w, color: c.color });
if (c.sub) p.caption(c.sub, { align: 'left', x: F.x0, y: c.bar !== undefined ? F.foot - p.m.u * 5 : F.foot, maxWidth: F.w, color: c.subColor || 'muted' });
if (c.bar !== undefined && c.bar !== null) progressBeam(p, { x: F.x0, y: F.foot - p.m.u * 1.4, w: F.w, value: c.bar, color: c.barColor });
}
function screenCards(scr, ctx, cards) {
const W = ctx.screen?.widgets || { w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 };
scr.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
for (let j = 0; j < 4; j++) {
const c = cards[j] || { tone: 'idle' }, dial = j % 2, layer = j >> 1;
panelInto(scr, { x: dial * W.pitchX + (W.insetX || 0), y: layer * W.pitchY + (W.insetY || 0), w: W.w, h: W.h }, (p) => card(p, c), { kind: 'screen', tag: 'w' + j, hue: c.hue ?? ctx.hue });
}
return scr.svg();
}
function readout(d, ctx, cards) {
const D = ctx.deck;
if (!D || !cards?.length) return false;
const S = D.screen;
if (S?.kind === 'galleon') {
const W = ctx.device.screen?.widgets || { w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 };
d.add(rect({ x: S.x, y: S.y, width: S.w, height: S.h, fill: '#000000' }));
for (let j = 0; j < 4; j++) {
const c = cards[j];
if (!c) continue;
const dial = j % 2, layer = j >> 1;
panelInto(d, { x: S.x + dial * W.pitchX + (W.insetX || 0), y: S.y + layer * W.pitchY + (W.insetY || 0), w: W.w, h: W.h }, (p) => card(p, c), { kind: 'screen', tag: `w${j}`, hue: c.hue ?? ctx.hue });
}
return true;
}
if (S?.kind === 'infobar') {
const line = cards.filter((c) => c.title && c.value !== undefined && c.value !== null).slice(0, 3);
panelInto(d, S, (p) => {
p.background({ tone: 'idle' });
const parts = line.map((c) => `${c.short || c.title} ${c.value}`);
p.label(parts.join(' · '), { cy: p.h / 2, y: p.h / 2 + p.typeStyle('label').size * 0.36, maxWidth: p.w - p.m.text * 2 });
}, { kind: 'screen', tag: 'ib', hue: cards[0].hue ?? ctx.hue });
return true;
}
if (D.strip) {
const w = D.strip.w / D.strip.segments;
for (let j = 0; j < D.strip.segments; j++) {
const c = cards[j] || { tone: 'idle' };
panelInto(d, { x: D.strip.x + j * w, y: D.strip.y, w, h: D.strip.h }, (p) => card(p, c), { kind: 'strip', tag: `s${j}`, hue: c.hue ?? ctx.hue });
}
return true;
}
return false;
}
const hasReadout = (ctx) => !!(ctx.deck && (ctx.deck.screen || ctx.deck.strip));
function statusKey(q, { title, value, sub, tone = 'idle', color } = {}) {
q.background({ tone });
if (title) q.eyebrow(title, { align: 'center', x: q.w / 2 });
if (value !== undefined && value !== null) q.value(String(value), { cy: q.h * 0.5, color });
if (sub) q.label(sub, { color: 'muted' });
}
const cellKey = (d, c, draw, { hue, tone } = {}) => keyInto(d, c.rect, draw, { hue, tone, tag: `k${c.i}` });
function panelBase(d, ctx) {
if (ctx.kind === 'deck') d.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
}
};
__d[270] = function (__ns) {
const { surface } = __m(113);
const { screenCards, HUE } = __m(269);
__e(__ns, { "default": () => __default }, [], ["default"]);
const IDLE = [
{ title: 'Scoreboard', value: 'No game', role: 'value', sub: 'put a game on the keys', hue: HUE.violet },
{ title: 'Plays', value: '—', role: 'value', sub: 'tic-tac-toe, dice, coin …', hue: HUE.citrine },
{ title: 'Score', value: '—', role: 'value', sub: 'appears here as you play', hue: HUE.amber },
{ title: 'Best', value: '—', role: 'value', sub: 'kept with the game', hue: HUE.lime },
];
const __default = {
id: 'screen-galleon-game',
title: 'Game Scoreboard',
category: 'Galleon Dashboards',
description: 'The Galleon 100 SD screen as the scoreboard for the game on the keys: the result, the score and the best, one card per dial widget, updated on every move.',
tags: ['galleon', 'corsair', 'screen', 'game', 'games', 'scoreboard', 'score', 'result', 'tic-tac-toe', 'dice', 'coin', 'slots'],
surface: 'screen',
screens: ['galleon'],
data: ['game'],
dataShape: { game: '{ id, title, cards: [{ title, value, sub, bar 0–1, hue, tone, role }] ×4 } (a game facet’s readout)' },
animated: false,
fps: 0,
loop: 4,
params: {},
order: 40,
render(ctx) {
const g = ctx.data?.game;
const cards = g && Array.isArray(g.cards) && g.cards.length ? g.cards : IDLE;
return screenCards(surface(ctx), ctx, cards);
},
};
};
__d[271] = function (__ns) {
const { surface } = __m(113);
const { wrapText, capHeight } = __m(11);
const { mediaOf, spectrumOf, audioOf } = __m(116);
const { galleon, header, meter, coverArt, mmss, HUE, GALLEON_PARAMS, clamp, lerp } = __m(114);
const { volume } = __m(117);
const { path, n, roundRectPath } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
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
const lv = audioOf(ctx).levels.slice(-9);
const bx = W.x1 - bw * 3 - gap * 2, bh = capHeight(eb.size, eb.weight) * 1.15;
let d = '';
[lv[2], lv[5], lv[8]].forEach((v, i) => { const hh = Math.max(bw, bh * (0.3 + 0.7 * clamp(v ?? 0.5))); d += roundRectPath(bx + i * (bw + gap), W.eyebrowY - hh, bw, hh, bw / 2); });
p.add(path(d, { fill: p.ctx.tint }));
}
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
};
__d[272] = function (__ns) {
const { surface, rect, path, n, roundRectPath } = __m(113);
const { wrapText, capHeight } = __m(11);
const { calendarOf, audioOf } = __m(116);
const { AGENDA } = __m(115);
const { mutedPlate, strike } = __m(137);
const { galleon, header, stat, meter, segmented, hhmm, localParts, HUE, GALLEON_PARAMS, clamp } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const MIN = 60000;
function eventsOf(ctx, cal) {
if (Array.isArray(cal.events)) return cal.events.filter((e) => e && Number.isFinite(e.at));
const day = 86400000, tz = (ctx.clock?.tzOffset ?? 0) * 60000;
const midnight = Math.floor((ctx.now + tz) / day) * day - tz;
return AGENDA.map((e) => ({ title: e.title, at: midnight + e.at * MIN, end: midnight + (e.at + e.dur) * MIN }));
}
const minutesText = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim() : `${mins} min`);
const __default = {
id: 'screen-galleon-meeting',
title: 'Galleon Meeting Console',
category: 'Galleon Dashboards',
description: 'The Galleon 100 SD screen for calls: the next meeting with a countdown, a mute you can feel on the right dial, the camera, and today as a timeline.',
tags: ['galleon', 'corsair', 'screen', 'meeting', 'calendar', 'mute', 'mic', 'camera', 'agenda', 'dashboard'],
surface: 'screen',
screens: ['galleon'],
data: ['calendar', 'audio', 'clock', 'mic', 'camera'],
dataShape: {
calendar: '{ next: { title, at, end }, current?: { title, at, end }, events?: [{ title, at, end }] } epoch ms',
audio: '{ level 0–1, levels: number[] } microphone input',
mic: '{ muted } (extension)',
camera: '{ on } (extension)',
},
states: ['live', 'muted'],
tones: { muted: 'neg' },
press: 'toggle',
link: { 'mic.muted': { live: false, muted: true } }, 
fps: 6,
loop: 60,
params: {
...GALLEON_PARAMS,
camera: { type: 'bool', default: true, label: 'Camera on (when no source says)' },
hour12: { type: 'bool', default: false, label: '12-hour times' },
dayStart: { type: 'number', default: 8, min: 0, max: 12, step: 1, label: 'Timeline starts (hour)' },
dayEnd: { type: 'number', default: 18, min: 13, max: 24, step: 1, label: 'Timeline ends (hour)' },
},
order: 21,
render(ctx) {
const scr = surface(ctx);
const P = ctx.params, now = ctx.now;
const cal = calendarOf(ctx);
const muted = typeof ctx.data?.mic?.muted === 'boolean' ? ctx.data.mic.muted : ctx.stateName === 'muted';
const camOn = typeof ctx.data?.camera?.on === 'boolean' ? ctx.data.camera.on : P.camera;
const time = (ms) => { const t = localParts(ctx, ms); return hhmm(t.h, t.m, P.hour12); };
const cur = cal.current && cal.current.end > now ? cal.current : null;
const next = cal.next;
const untilNext = next ? Math.max(0, Math.ceil((next.at - now) / MIN)) : Infinity;
const soon = !cur && untilNext <= 5;
const agenda = (p, W) => {
const ev = cur || next;
if (!ev) { header(p, W, 'Next', 'Nothing scheduled'); p.value('Free', { align: 'left', x: W.x0, cy: p.h * 0.58 }); return; }
header(p, W, cur ? 'Now' : 'Next', cur ? `until ${time(cur.end)}` : `${time(ev.at)}–${time(ev.end)}`, { metaColor: soon ? 'ink' : 'dim' });
const lab = p.typeStyle('label'), v = p.typeStyle('value');
const wr = wrapText(ev.title, { maxWidth: W.w, size: lab.size, minSize: lab.size * 0.82, maxLines: 2, weight: lab.weight, tracking: lab.tracking, caps: lab.caps });
let y = W.eyebrowY + Math.round(W.pad * 0.75) + capHeight(wr.size, lab.weight);
for (const line of wr.lines) { p.label(line, { align: 'left', x: W.x0, y, size: wr.size, maxWidth: W.w }); y += wr.lineHeight; }
if (cur) {
const left = Math.max(0, Math.ceil((cur.end - now) / MIN)), total = Math.max(1, (cur.end - cur.at) / MIN);
const bh = Math.max(6, Math.round(W.u * 2.4));
stat(p, { role: 'value', value: left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left, unit: left >= 60 ? 'h left' : 'min left', xl: W.x0, base: W.footY - bh - Math.round(W.u * 3.5), size: v.size * 0.9 });
meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: 1 - left / total });
return;
}
const base = W.footY;
if (untilNext >= 600) { p.caption(`Tomorrow · ${time(next.at)}`, { align: 'left', x: W.x0, y: base, color: 'muted' }); return; }
p.caption('in', { align: 'left', x: W.x0, y: base, color: 'muted' });
const inW = Math.round(p.typeStyle('caption').size * 1.05);
stat(p, { role: 'value', value: untilNext >= 60 ? `${Math.floor(untilNext / 60)}:${String(untilNext % 60).padStart(2, '0')}` : untilNext, unit: untilNext >= 60 ? 'h' : 'min', xl: W.x0 + inW, base });
};
const mic = (p, W) => {
if (muted) mutedPlate(p, { since: ctx.since, radius: p.m.radius }); 
header(p, W, muted ? 'Mic · muted' : 'Mic', muted ? '' : 'live', { metaColor: muted ? 'ink' : 'dim' });
const gs = Math.round(p.h * 0.5);
const gbox = { x: W.x0 - gs * 0.12, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.5, size: gs };
p.glyph('mic', { state: muted ? 'off' : 'on', box: gbox });
if (muted) strike(p, gbox, { since: ctx.since });
const v = p.typeStyle('value');
const base = Math.round(p.h * 0.6);
p.value(muted ? 'MUTED' : 'Live', { align: 'right', x: W.x1, cy: base - capHeight(v.size, v.weight) / 2, maxWidth: W.w - gs, color: 'ink' });
const a = audioOf(ctx);
const mh = Math.max(6, Math.round(W.u * 3));
const mx = W.x0 + gs * 0.95;
if (muted) p.caption('push dial to unmute', { align: 'right', x: W.x1, y: W.footY, color: 'ink', maxWidth: W.x1 - mx });
else segmented(p, { x: mx, y: W.footY - mh, w: W.x1 - mx, h: mh, value: clamp(a.level * 1.1), count: 14 });
};
const today = (p, W) => {
const evs = eventsOf(ctx, cal).sort((a, b) => a.at - b.at);
const busy = evs.find((e) => e.at <= now && e.end > now), upcoming = evs.filter((e) => e.at > now);
header(p, W, 'Today', busy ? `until ${time(busy.end)}` : upcoming.length ? `next ${time(upcoming[0].at)}` : 'free');
const day = 86400000, tz = (ctx.clock?.tzOffset ?? 0) * 60000, midnight = Math.floor((now + tz) / day) * day - tz;
const h0 = Math.min(P.dayStart, P.dayEnd - 4), h1 = P.dayEnd, t0 = midnight + h0 * 3600000, t1 = midnight + h1 * 3600000;
const X = (ms) => W.x0 + clamp((ms - t0) / (t1 - t0)) * W.w;
const cs = p.typeStyle('caption');
const labelBase = W.footY, barH = Math.max(14, Math.round(p.h * 0.13)), barY = labelBase - capHeight(cs.size, cs.weight) - Math.round(W.u * 4.5) - barH;
p.add(rect({ x: W.x0, y: barY + barH / 2 - 1, width: W.w, height: 2, fill: p.colors.line }));
let ticks = '';
for (let hr = h0; hr <= h1; hr++) { const x = X(midnight + hr * 3600000); ticks += `M${n(x)} ${n(barY + barH + 3)}v${n(W.u * (hr % 2 ? 1.6 : 2.6))}`; }
p.add(path(ticks, { stroke: p.colors.dim, strokeWidth: n(Math.max(1, W.u * 0.5)), strokeLinecap: 'round' }));
for (let hr = h0; hr <= h1; hr += 2) {
const lab = P.hour12 ? `${((hr + 11) % 12) + 1}` : `${hr}`;
const x = X(midnight + hr * 3600000);
p.caption(lab, { align: hr === h0 ? 'left' : hr >= h1 - 0.5 ? 'right' : 'center', x: hr === h0 ? x : hr >= h1 - 0.5 ? x : x, y: labelBase, color: 'dim' });
}
const nextEv = upcoming[0];
for (const e of evs) {
if (e.end < t0 || e.at > t1) continue;
const x0 = X(e.at), x1 = Math.max(x0 + 4, X(e.end) - 2);
const past = e.end <= now, lit = (e.at <= now && e.end > now) || (!busy && e === nextEv);
p.add(path(roundRectPath(x0, barY, x1 - x0, barH, Math.min(barH * 0.3, (x1 - x0) / 2)), { fill: past ? p.colors.line : p.ctx.tint, fillOpacity: past || lit ? null : 0.42 }));
}
if (now >= t0 && now <= t1) {
const x = X(now), lw = Math.max(2, Math.round(W.u * 0.9));
p.add(rect({ x: x - lw / 2, y: barY - W.u * 4, width: lw, height: barH + W.u * 8, rx: lw / 2, fill: p.colors.ink }));
p.add(`<circle cx="${n(x)}" cy="${n(barY - W.u * 4)}" r="${n(lw * 1.9)}" fill="${p.colors.ink}"/>`);
}
};
const camera = (p, W) => {
header(p, W, 'Camera', camOn ? 'video on' : 'video off');
const gs = Math.round(p.h * 0.5);
p.glyph('camera', { state: camOn ? 'on' : 'off', box: { x: W.x0 - gs * 0.08, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.5, size: gs } });
const v = p.typeStyle('value');
const base = Math.round(p.h * 0.6);
p.value(camOn ? 'On' : 'Off', { align: 'right', x: W.x1, cy: base - capHeight(v.size, v.weight) / 2, color: camOn ? undefined : 'muted' });
p.caption(camOn ? 'Others can see you' : 'Video paused', { align: 'right', x: W.x1, y: W.footY, color: 'muted', maxWidth: W.w - gs });
};
return galleon(ctx, scr, [[agenda, mic], [today, camera]], {
hues: [[HUE.periwinkle, muted ? HUE.coral : HUE.mint], [HUE.azure, HUE.cyan]],
tones: [[soon ? 'warn' : 'idle', muted ? 'neg' : 'idle'], ['idle', camOn ? 'idle' : 'idle']],
});
},
};
};
__d[273] = function (__ns) {
const { surface, rect, n } = __m(113);
const { clamp, outExpo } = __m(12);
const { mix } = __m(4);
const { audioOf } = __m(116);
const { mutedPlate } = __m(137);
const { galleon, header, stat, meter, segmented, spark, pictogram, HUE, GALLEON_PARAMS } = __m(114);
const { text, glowText, widthOf, mmss } = __m(195);
const { capHeight, compact } = __m(11);
__e(__ns, { "default": () => __default }, [], ["default"]);
const CHATTERS = ['nova_k', 'pixelmoth', 'dr_lumen', 'quietfox', 'atlas.v', 'mira_codes', 'ember77', 'tess', 'bytewren', 'solstice'];
const pct = (v) => `${Math.round(clamp(v) * 100)}%`;
function mutedMic(g) {
g.rect(18.5, 6, 11, 20, { r: 5.5 });
g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
g.line(24, 32.5, 24, 40, { role: 'dim' });
g.line(10, 8, 38, 40, { role: 'line', weight: 1.2 });
}
const __default = {
id: 'screen-galleon-studio',
title: 'Galleon Studio Console',
category: 'Galleon Dashboards',
description: 'The Galleon 100 SD screen for streaming: ON AIR (push a dial to go live), stream and mic volume on the dials, MUTED in red, the goal and chat pace (demo).',
tags: ['galleon', 'corsair', 'screen', 'stream', 'streaming', 'broadcast', 'on air', 'live', 'mic', 'mute', 'muted', 'volume', 'goal', 'chat', 'creator', 'dashboard', 'obs-style'],
surface: 'screen',
screens: ['galleon'],
data: ['audio', 'mic', 'volume'],
states: ['off-air', 'live'],
tones: { 'off-air': 'idle', live: 'active' },
press: 'toggle',
link: { 'stream.live': { 'off-air': false, live: true } },
fps: 4,
loop: 60,
params: {
...GALLEON_PARAMS,
volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Stream volume (until the left dial turns)' },
micVolume: { type: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Mic volume (until the right dial turns)' },
goal: { type: 'text', default: 'Supporters', maxLength: 14, label: 'Goal name' },
current: { type: 'number', default: 412, min: 0, max: 1000000, step: 1, label: 'Goal count (you type it: no goal source yet)' },
target: { type: 'number', default: 500, min: 1, max: 1000000, step: 1, label: 'Goal target' },
},
order: 25,
render(ctx) {
const scr = surface(ctx);
const P = ctx.params;
const live = ctx.stateName === 'live';
const A = audioOf(ctx, { count: 60, rate: 30 });
const muted = typeof ctx.data?.mic?.muted === 'boolean' ? ctx.data.mic.muted : false;
const V = Array.isArray(ctx.values) ? ctx.values : null;
const showVol = clamp(V?.[0] ?? (typeof ctx.data?.volume?.level === 'number' ? ctx.data.volume.level : P.volume));
const micVol = clamp(V?.[1] ?? P.micVolume);
const onAir = (p, W) => {
header(p, W, live ? 'Live' : 'Off air', live ? ['push dial · end', 'push · end'] : ['push dial · go live', 'push · go live'], { metaColor: live ? 'ink' : 'muted' });
const bx = W.x0, by = W.eyebrowY + W.pad * 0.7, bh = W.footY - by, bw = Math.min(bh * 1.2, W.w * 0.36);
const tint = p.ctx.tint, deep = p.ctx.theme.spectral(p.ctx.hue, { tier: 'ink' });
const lit = live ? (ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.5))) : 0;
const glass = p.dark ? mix(p.colors.surface2, '#000000', 0.45) : mix(p.colors.surface2, p.colors.line, 0.4);
p.add(rect({ x: n(bx), y: n(by), width: n(bw), height: n(bh), rx: n(W.u * 3), fill: p.dark ? mix(glass, tint, 0.16 * lit) : mix(glass, deep, lit), stroke: live ? tint : p.colors.line, strokeWidth: n(Math.max(1, W.u * 0.8)) }));
const size = Math.min((bw * 0.74) / (widthOf('AIR', 1, { weight: 700, tracking: 0.08 })), (bh * 0.66) / (capHeight(1, 700) * 2 + 0.36));
const c = capHeight(size, 700), y1 = by + (bh - (c * 2 + size * 0.36)) / 2 + c, y2 = y1 + c + size * 0.36;
if (p.dark) for (const [wd, y] of [['ON', y1], ['AIR', y2]]) glowText(p, wd, { x: bx + bw / 2, y, size, weight: 600, tracking: 0.08, color: tint, lit, halo: size * 0.2, tube: mix(glass, p.colors.muted, 0.35), core: mix(tint, '#ffffff', 0.72) });
else for (const [wd, y] of [['ON', y1], ['AIR', y2]]) text(p, wd, { x: bx + bw / 2, y, size, weight: 700, tracking: 0.08, color: mix(mix(glass, p.colors.muted, 0.55), '#ffffff', lit) });
const rx0 = bx + bw + W.pad * 0.8, room = W.x1 - rx0;
const mid = by + bh * 0.34;
if (live) p.text('value', mmss(ctx.since), { align: 'right', x: W.x1, cy: mid, maxWidth: room });
else p.text('value', 'Ready', { align: 'right', x: W.x1, cy: mid, color: 'muted', maxWidth: room });
const mh = Math.max(6, Math.round(W.u * 2.2));
p.caption(`Vol ${pct(showVol)}`, { align: 'right', x: W.x1, y: W.footY - mh - W.u * 2.4, color: 'ink', maxWidth: room });
meter(p, { x: rx0, y: W.footY - mh, w: room, h: mh, value: showVol, color: tint });
};
const mic = (p, W) => {
const db = A.level > 0.001 ? Math.round((A.level * micVol - 1) * 60) : null;
if (muted) {
mutedPlate(p, { radius: p.m.radius });
header(p, W, 'Mic · muted', ['mic key unmutes', 'mic key'], { metaColor: 'ink' });
const gs = W.footY - W.eyebrowY - W.pad * 0.4;
pictogram(p, mutedMic, { x: W.x0, y: W.footY - gs, size: gs, tone: 'neg', tag: 'mm' });
p.text('hero', 'MUTED', { align: 'right', x: W.x1, cy: (W.eyebrowY + W.footY) / 2 + W.u * 2, color: 'ink', maxWidth: W.w - gs - W.pad });
return;
}
header(p, W, 'Mic', A.live ? (db === null ? 'silent' : `${db} dB`) : ['demo level', 'demo'], { metaColor: 'dim' });
stat(p, { value: String(Math.round(micVol * 100)), unit: '% vol', xl: W.x0, base: p.h * 0.62 });
const mh = Math.max(8, Math.round(W.u * 3.2));
const v = A.level * micVol;
const zone = v > 0.9 ? p.colors.neg : v > 0.75 ? p.colors.warn : p.colors.pos;
segmented(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: v, count: 30, color: zone });
if (A.peak > 0.02) { const x = W.x0 + W.w * clamp(A.peak * micVol); p.add(rect({ x: n(x - 1), y: n(W.footY - mh - 3), width: 2, height: n(mh + 6), rx: 1, fill: p.dark ? '#ffffff' : p.colors.ink })); }
};
const goal = (p, W) => {
const f = clamp(P.current / Math.max(1, P.target));
const done = P.current >= P.target;
header(p, W, P.goal, done ? 'goal reached ✓' : `${Math.round(f * 100)}%`, { metaColor: done ? 'pos' : 'dim' });
stat(p, { value: compact(P.current), unit: `/ ${compact(P.target)}`, xl: W.x0, base: p.h * 0.64 });
const mh = Math.max(8, Math.round(W.u * 3));
meter(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: f * (ctx.reduced ? 1 : outExpo(clamp(ctx.since / 1.2))), color: done ? p.colors.pos : p.ctx.tint });
let d = '';
for (let i = 1; i < 4; i++) d += `M${n(W.x0 + (W.w * i) / 4)} ${n(W.footY - mh - 3)}v${n(mh + 6)}`;
p.add(`<path d="${d}" stroke="${p.colors.surface}" stroke-width="2" fill="none"/>`);
};
const chat = (p, W) => {
const tq = ctx.reduced ? 30 : Math.floor(ctx.t / 2) * 2;
const vals = Array.from({ length: 30 }, (_, i) => clamp(0.18 + 0.62 * ctx.noise.n1((tq - (29 - i) * 2) / 9) + 0.15 * ctx.noise.n1((tq - (29 - i) * 2) / 2.3 + 40)));
const rate = Math.round(8 + 46 * vals[vals.length - 1]);
const who = CHATTERS[Math.floor(tq / 4) % CHATTERS.length];
header(p, W, 'Chat', [`demo · @${who}`, 'demo'], { metaColor: 'muted' });
stat(p, { value: String(rate), unit: '/ min', xl: W.x0, base: p.h * 0.56, role: 'value' });
const top = p.h * 0.62, hh = W.footY - top;
spark(p, vals, { x: W.x0, y: top, w: W.w, h: hh, color: p.ctx.tint });
};
return galleon(ctx, scr, [[onAir, mic], [goal, chat]], { hues: [[25, HUE.jade], [HUE.mint, HUE.violet]], tones: [[live ? 'active' : 'idle', muted ? 'neg' : 'idle'], ['idle', 'idle']] });
},
};
};
__d[274] = function (__ns) {
const { surface } = __m(113);
const { galleon, HUE, GALLEON_PARAMS } = __m(114);
const { cpuCores, memory, gpuGauge, network } = __m(117);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'screen-galleon-system',
title: 'Galleon System Monitor',
category: 'Galleon Dashboards',
description: 'The Galleon 100 SD screen as a system monitor: CPU with every core, memory, GPU load with its history, and network throughput.',
tags: ['galleon', 'corsair', 'screen', 'system', 'monitor', 'cpu', 'memory', 'gpu', 'network', 'dashboard'],
surface: 'screen',
screens: ['galleon'],
data: ['cpu', 'mem', 'gpu', 'net', 'temp', 'uptime'],
dataShape: {
'cpu/mem/gpu': 'number 0–1 (null = unavailable)',
temp: '°C', net: '{ up, down } bytes/s', uptime: 'seconds',
series: '{ cpu?, gpu?, down?, up?: number[] } oldest first (extension)',
sys: '{ cores: number[], cpuModel, cpuGhz, memTotal, memUsed, gpuName, host } (extension)',
},
fps: 4,
loop: 12,
params: { ...GALLEON_PARAMS, fahrenheit: { type: 'bool', default: false, label: 'Fahrenheit' } },
order: 22,
render(ctx) {
return galleon(ctx, surface(ctx), [[cpuCores(ctx, { fahrenheit: ctx.params.fahrenheit }), memory(ctx)], [gpuGauge(ctx), network(ctx)]], { hues: [[HUE.violet, HUE.cyan], [HUE.jade, HUE.azure]] });
},
};
};
__d[275] = function (__ns) {
const { hash } = __m(1);
const { clamp, lerp } = __m(12);
__e(__ns, { "kindOf": () => kindOf, "LABEL": () => LABEL, "KIND_HUE": () => KIND_HUE, "weatherOf": () => weatherOf, "hourOf": () => hourOf, "isNight": () => isNight, "toF": () => toF, "compass": () => compass, "drawWeather": () => drawWeather, "clamp": () => clamp }, [], ["KIND_HUE","LABEL","clamp","compass","drawWeather","hourOf","isNight","kindOf","toF","weatherOf"]);
const HOUR = 3600000, DAY = 86400000;
function kindOf(code) {
if (typeof code === 'string') return ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm'].includes(code) ? code : 'cloudy';
const c = Number(code);
if (c === 0) return 'clear';
if (c === 1 || c === 2) return 'partly';
if (c === 3) return 'cloudy';
if (c === 45 || c === 48) return 'fog';
if (c >= 51 && c <= 57) return 'drizzle';
if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
if (c >= 95) return 'storm';
return 'cloudy';
}
const LABEL = { clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm' };
const KIND_HUE = { clear: 72, partly: 72, cloudy: 243.6, fog: 191.3, drizzle: 217.5, rain: 243.6, snow: 217.5, storm: 86.5, night: 269.8 };
const CODE = { clear: 0, partly: 2, cloudy: 3, fog: 45, drizzle: 53, rain: 63, snow: 73, storm: 95 };
function simulate(ctx) {
const tz = (ctx.clock?.tzOffset ?? 0) * 60000, local = ctx.now + tz, day = Math.floor(local / DAY), midnight = day * DAY - tz;
const r = (k) => hash(day, 4231 + k);
const lo = Math.round(6 + r(1) * 10), hi = lo + Math.round(6 + r(2) * 7);
const tempAt = (ms) => {
const h = ((((ms + tz) % DAY) + DAY) % DAY) / HOUR;
const f = h >= 5 && h <= 15 ? 0.5 - 0.5 * Math.cos((Math.PI * (h - 5)) / 10) : 0.5 + 0.5 * Math.cos((Math.PI * ((h - 15 + 24) % 24)) / 14);
return lerp(lo, hi, f);
};
const kinds = ['partly', 'partly', 'clear', 'cloudy', 'rain', 'partly', 'drizzle', 'clear'];
const base = kinds[Math.floor(r(3) * kinds.length)];
const kindAt = (ms) => { const h = Math.floor(((ms + tz) % DAY) / HOUR); const v = hash(day, h, 77); return v < 0.62 ? base : v < 0.8 ? 'partly' : v < 0.92 ? 'cloudy' : 'rain'; };
const hourly = Array.from({ length: 12 }, (_, i) => { const at = Math.floor(ctx.now / HOUR) * HOUR + (i + 1) * HOUR; const k = kindAt(at); return { at, temp: Math.round(tempAt(at)), code: CODE[k], precip: k === 'rain' ? 0.6 + 0.3 * hash(day, i, 5) : k === 'drizzle' ? 0.4 : 0.05 + 0.15 * hash(day, i, 6) }; });
const kind = kindAt(ctx.now), temp = Math.round(tempAt(ctx.now));
return {
temp, code: CODE[kind], label: LABEL[kind], hi, lo, feels: temp - (r(4) > 0.5 ? 1 : 0),
humidity: 0.45 + r(5) * 0.4, wind: { speed: Math.round(5 + r(6) * 22), dir: Math.round(r(7) * 359) }, precip: kind === 'rain' ? 0.7 : 0.1 + r(8) * 0.25, uv: Math.round(1 + r(9) * 6),
sunrise: midnight + (6 * 60 + 12 + Math.round(r(10) * 30)) * 60000, sunset: midnight + (19 * 60 + 18 + Math.round(r(11) * 30)) * 60000,
place: 'Lakeside', hourly,
};
}
function weatherOf(ctx) {
const w = ctx.data?.weather;
const sim = simulate(ctx);
if (!w || typeof w.temp !== 'number') return { ...sim, kind: kindOf(sim.code), live: false };
const out = { ...w, live: true };
out.kind = kindOf(w.code ?? 'cloudy');
out.label = w.label || LABEL[out.kind];
if (Array.isArray(w.hourly)) out.hourly = w.hourly.filter((x) => x && Number.isFinite(x.temp));
return out;
}
const hourOf = (ctx, e) => (Number.isFinite(e.h) ? e.h : Math.floor((((e.at + (ctx.clock?.tzOffset ?? 0) * 60000) % DAY) + DAY) % DAY / HOUR));
function isNight(ctx, w) {
const tz = (ctx.clock?.tzOffset ?? 0) * 60000, h = (((ctx.now + tz) % DAY) + DAY) % DAY / HOUR;
const rise = Number.isFinite(w.sunrise) ? (((w.sunrise + tz) % DAY) + DAY) % DAY / HOUR : 6.3, set = Number.isFinite(w.sunset) ? (((w.sunset + tz) % DAY) + DAY) % DAY / HOUR : 19.5;
return h < rise || h >= set;
}
const toF = (c) => Math.round(c * 1.8 + 32);
const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const CLOUD = (g, dx = 0, dy = 0, role = 'line', s = 1) => g.group({ x: dx, y: dy, scale: s, origin: [24, 28] }, () => {
g.path('M15.5 35.5H33A7 7 0 0 0 33.8 21.55A10 10 0 0 0 14.6 24.1A5.75 5.75 0 0 0 15.5 35.5Z', { role, join: 'round' });
});
function sun(g, cx, cy, r, rays = [0, 45, 90, 135, 180, 225, 270, 315]) {
g.circle(cx, cy, r, { role: 'accent', fill: true });
for (const a of rays) { const [x1, y1] = g.polar(cx, cy, r + 3, a), [x2, y2] = g.polar(cx, cy, r + 5.6, a); g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.85 }); }
}
function moon(g, cx, cy, r) {
g.path(`M${cx + r * 0.25} ${cy - r}A${r} ${r} 0 1 0 ${cx + r} ${cy + r * 0.35}A${r * 0.78} ${r * 0.78} 0 0 1 ${cx + r * 0.25} ${cy - r}Z`, { role: 'accent', fill: true });
}
function drawWeather(g, kind, { night = false, t = 0 } = {}) {
switch (kind) {
case 'clear':
if (night) { moon(g, 24, 24, 13); g.dot(36, 12, 1.4); g.dot(38.5, 22, 1); return; }
sun(g, 24, 24, 8.5); return;
case 'partly':
if (night) moon(g, 30, 17.5, 8); else sun(g, 30.5, 18, 5.4, [0, 45, 90, 315, 270]);
CLOUD(g, -3, 3, 'line', 0.92); return;
case 'cloudy':
CLOUD(g, 4, -6, 'dim', 0.78);
CLOUD(g, -2, 2, 'line', 1); return;
case 'fog':
g.line(10, 17, 38, 17); g.line(13, 24, 35, 24, { role: 'dim' }); g.line(9, 31, 39, 31); g.line(15, 38, 31, 38, { role: 'dim' }); return;
case 'drizzle': case 'rain': {
CLOUD(g, 0, -5, 'line', 1);
const drops = kind === 'rain' ? [[17, 0], [24, 0.33], [31, 0.66]] : [[19, 0], [29, 0.5]];
for (const [x, ph] of drops) { const y = 34 + ((t * 0.9 + ph) % 1) * 1.5; g.line(x, y, x - 2, y + (kind === 'rain' ? 6 : 3.5), { role: 'accent', weight: 0.9 }); }
return;
}
case 'snow':
CLOUD(g, 0, -5, 'line', 1);
for (const [x, y] of [[17, 36], [24, 39.5], [31, 36]]) g.dot(x, y, 1.9, { role: 'accent' });
return;
case 'storm':
CLOUD(g, 0, -6, 'line', 1);
g.polygon([[25.5, 27], [19, 35.5], [23.5, 35.5], [21, 42], [29.5, 32], [25, 32], [27.5, 27]], { role: 'accent', fill: true, join: 'round' });
return;
default: CLOUD(g);
}
}
};
__d[276] = function (__ns) {
const { surface, path, circle, n, url, linearGradient, rect } = __m(113);
const { capHeight, measureText } = __m(11);
const { galleon, header, stat, pictogram, hhmm, localParts, HUE, GALLEON_PARAMS, DAYS, MONTHS, clamp, lerp } = __m(114);
const { weatherOf, drawWeather, KIND_HUE, kindOf, hourOf, isNight, toF, compass } = __m(275);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
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
const txt = `${Math.round(clamp(w.precip) * 100)}%`, tw = measureText(txt, { size: cs.size, weight: cs.weight }), ps = Math.round(cs.size * 1.5);
const room = W.x1 - s2.right - W.u * 4;
if (room >= tw + ps) {
p.caption(txt, { align: 'right', x: W.x1, y: base, color: 'muted' });
pictogram(p, (g) => g.path('M24 9C24 9 13 22 13 29.5a11 11 0 0 0 22 0C35 22 24 9 24 9Z', { role: 'accent', fill: true }), { x: W.x1 - tw - ps * 0.95, y: base - ps * 0.82, size: ps, hue: HUE.azure, tag: 'drop' });
}
}
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
};
__d[277] = function (__ns) {
const { surface, rect } = __m(113);
const { capHeight, measureText } = __m(11);
const { calendarOf } = __m(116);
const { infobar, px, hhmm, localParts, clamp } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const MIN = 60000;
const __default = {
id: 'screen-neo-agenda',
title: 'Neo Info-Bar Agenda',
category: 'Neo Info Bar',
description: 'The Neo info bar as a meeting countdown: minutes until the next event (or left in this one), its title and time, and a hairline that fills as it nears.',
tags: ['neo', 'info bar', 'calendar', 'meeting', 'agenda', 'countdown', 'screen'],
surface: 'screen',
screens: ['infobar'],
data: ['calendar', 'clock'],
dataShape: { calendar: '{ next: { title, at, end }, current?: { title, at, end } } epoch ms' },
fps: 1,
loop: 60,
params: { hour12: { type: 'bool', default: false, label: '12-hour times' }, lead: { type: 'number', default: 30, min: 5, max: 120, step: 5, label: 'Countdown window (min)' } },
order: 12,
render(ctx) {
const k = surface(ctx);
const cal = calendarOf(ctx), now = ctx.now;
const cur = cal.current && cal.current.end > now ? cal.current : null, ev = cur || cal.next;
const mins = ev ? Math.max(0, Math.ceil(((cur ? cur.end : ev.at) - now) / MIN)) : 0;
const soon = !cur && !!ev && mins <= 5;
return infobar(ctx, k, (p, F) => {
if (!ev) { p.label('Nothing scheduled', { align: 'left', x: F.x0, y: F.cy + 4, size: px(p, 'label', 13), color: 'muted' }); return; }
const vs = px(p, 'value', 24), cs = px(p, 'caption', 10), ls = px(p, 'label', 12.5);
const big = mins >= 600 ? '—' : mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : `${mins}`;
const st = p.typeStyle('value', { size: vs });
const vw = measureText(big, { size: vs, weight: st.weight, tabular: true, tracking: st.tracking || 0 });
p.value(big, { align: 'left', x: F.x0, cy: F.cy - 3, size: vs });
p.caption(cur ? 'left' : mins >= 60 ? 'h' : 'min', { align: 'left', x: F.x0 + vw + 3, y: F.cy - 3 + capHeight(vs, st.weight) / 2, size: cs, color: 'muted' });
const x = F.x0 + Math.max(vw + 30, 62);
const t0 = localParts(ctx, ev.at), t1 = localParts(ctx, ev.end ?? ev.at), h12 = ctx.params.hour12;
p.label(ev.title, { align: 'left', x, y: F.cy - 2, size: ls, maxWidth: F.x1 - x });
p.caption(cur ? `now · until ${hhmm(t1.h, t1.m, h12)}` : `${hhmm(t0.h, t0.m, h12)}${ev.end ? `–${hhmm(t1.h, t1.m, h12)}` : ''}`, { align: 'left', x, y: F.cy + capHeight(cs) + 4, size: cs, color: 'muted', maxWidth: F.x1 - x });
const f = cur ? clamp((now - cur.at) / Math.max(MIN, cur.end - cur.at)) : clamp(1 - (ev.at - now) / (ctx.params.lead * MIN)); 
const y = p.h - 6.5;
p.add(rect({ x: F.x0, y, width: F.w, height: 1.5, fill: p.colors.line }));
if (f > 0.001) p.add(rect({ x: F.x0, y: y - 0.5, width: Math.max(2, F.w * f), height: 2.5, rx: 1.25, fill: soon ? p.colors.warn : p.ctx.tint }));
}, { tone: soon ? 'warn' : 'idle' });
},
};
};
__d[278] = function (__ns) {
const { surface, rect, linearGradient, url, n } = __m(113);
const { capHeight, measureText, pad2 } = __m(11);
const { calendarOf } = __m(116);
const { infobar, px, hhmm, localParts, DAYS, MONTHS } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'screen-neo-clock',
title: 'Neo Info-Bar Clock',
category: 'Neo Info Bar',
description: 'The Neo info bar as a clock: tabular time, the date as an instrument label, your next event, and a Beam that walks the Spectrum with the seconds.',
tags: ['neo', 'info bar', 'clock', 'time', 'date', 'screen', 'calendar'],
surface: 'screen',
screens: ['infobar'],
data: ['clock', 'calendar'],
dataShape: { calendar: '{ next: { title, at }, current? } epoch ms' },
fps: 1,
loop: 60,
params: { hour12: { type: 'bool', default: false, label: '12-hour clock' }, showNext: { type: 'bool', default: true, label: 'Show the next event' } },
order: 10,
render(ctx) {
const k = surface(ctx);
return infobar(ctx, k, (p, F) => {
const c = ctx.clock, h12 = ctx.params.hour12;
const vs = px(p, 'value', 27), hh = h12 ? ((c.h + 11) % 12) + 1 : c.h, time = `${hh}:${pad2(c.m)}`;
const st = p.typeStyle('value', { size: vs });
p.value(time, { align: 'left', x: F.x0, cy: F.cy - 1, size: vs });
const rx = F.x0 + measureText(time, { size: vs, weight: st.weight, tabular: true, tracking: st.tracking || 0 }) + 10;
const ebs = px(p, 'eyebrow', 9), cs = px(p, 'caption', 10);
const cal = calendarOf(ctx), ev = ctx.params.showNext ? (cal.current && cal.current.end > ctx.now ? cal.current : cal.next) : null;
const near = ev && ev.at - ctx.now < 12 * 3600000;
p.eyebrow(`${DAYS[c.dow]} ${c.day} ${MONTHS[c.month - 1]}${h12 ? ` · ${c.h < 12 ? 'AM' : 'PM'}` : ''}`, { align: 'right', x: F.x1, y: near ? F.cy - 3 : F.cy + capHeight(ebs) / 2, size: ebs, color: 'muted', maxWidth: F.x1 - rx });
if (near) {
const t = localParts(ctx, ev.at);
p.caption(ev === cal.current ? `now · ${ev.title}` : `${hhmm(t.h, t.m, h12)} ${ev.title}`, { align: 'right', x: F.x1, y: F.cy + capHeight(cs) + 3, size: cs, color: 'ink', maxWidth: F.x1 - rx });
}
const f = c.s / 60, id = p.id('sec'), T = ctx.theme;
const o1 = Math.max(0, f - 0.18), o2 = Math.max(o1, f), o3 = Math.max(o2, Math.min(1, f + 0.12));
p.def(linearGradient(id, [[0, T.spectral(ctx.hue - 60), 0], [o1, T.spectral(ctx.hue - 30), 0.35], [o2, p.dark ? '#ffffff' : T.colors.ink, 1], [o3, T.spectral(ctx.hue + 40), 0.35], [1, T.spectral(ctx.hue + 60), 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
p.add(rect({ x: F.x0, y: p.h - 6.5, width: F.w, height: n(1.5), fill: url(id) }));
});
},
};
};
__d[279] = function (__ns) {
const { surface, rect, path, roundRectPath } = __m(113);
const { capHeight } = __m(11);
const { mediaOf, audioOf } = __m(116);
const { infobar, px, coverArt, mmss, clamp } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'screen-neo-now-playing',
title: 'Neo Info-Bar Now Playing',
category: 'Neo Info Bar',
description: 'The Neo info bar as a now-playing strip: generated cover art, title and artist, a play-state pulse and a progress hairline along the bottom edge.',
tags: ['neo', 'info bar', 'media', 'music', 'now playing', 'screen'],
surface: 'screen',
screens: ['infobar'],
data: ['media', 'audio'],
dataShape: { media: '{ title, artist, position s, duration s, playing } (null = nothing playing)', audio: '{ level 0–1, levels }' },
states: ['playing', 'paused'],
press: 'none',
fps: 6,
loop: 16,
params: { showTime: { type: 'bool', default: true, label: 'Show the remaining time' } },
order: 11,
render(ctx) {
const k = surface(ctx);
const none = ctx.data && Object.hasOwn(ctx.data, 'media') && ctx.data.media === null;
const m = none ? null : mediaOf(ctx, { playing: ctx.stateName !== 'paused' });
const playing = m ? (m.live ? !!m.playing : ctx.stateName !== 'paused') : false;
return infobar(ctx, k, (p, F) => {
const art = p.h - 14;
if (m) coverArt(p, { x: F.x0 - 2, y: 7, size: art, title: m.title, artist: m.artist, radius: 4 });
const x = F.x0 - 2 + art + 9;
const ls = px(p, 'label', 13), cs = px(p, 'caption', 10.5);
const tail = playing ? 22 : 4;
const rem = m && ctx.params.showTime && m.duration ? `–${mmss(m.duration - m.position)}` : '';
p.label(m ? m.title : 'Nothing playing', { align: 'left', x, y: F.cy - 2, size: ls, maxWidth: F.x1 - x - tail });
if (m) p.caption(m.artist + (rem ? `  ${rem}` : ''), { align: 'left', x, y: F.cy + capHeight(cs) + 4, size: cs, color: 'muted', maxWidth: F.x1 - x - 2 });
if (playing) {
const lv = audioOf(ctx).levels.slice(-9), bw = 3, gap = 2.5, bx = F.x1 - bw * 3 - gap * 2, bh = capHeight(ls) * 1.2;
let d = '';
[lv[2], lv[5], lv[8]].forEach((v, i) => { const hh = Math.max(bw, bh * (0.3 + 0.7 * clamp(v ?? 0.5))); d += roundRectPath(bx + i * (bw + gap), F.cy - 2 - hh, bw, hh, bw / 2); });
p.add(path(d, { fill: p.ctx.tint }));
}
if (m && m.duration) {
const f = clamp(m.position / m.duration), y = p.h - 6.5, w = F.x1 - x;
p.add(rect({ x, y, width: w, height: 1.5, fill: p.colors.line }));
p.add(rect({ x, y: y - 0.5, width: Math.max(2, w * f), height: 2.5, rx: 1.25, fill: p.ctx.tint }));
}
});
},
};
};
__d[280] = function (__ns) {
const { surface, rect } = __m(113);
const { metricOf, netOf, rateText } = __m(116);
const { NET_MAX } = __m(115);
const { infobar, px, HUE, clamp } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'screen-neo-system',
title: 'Neo Info-Bar System',
category: 'Neo Info Bar',
description: 'The Neo info bar as a three-gauge system strip: CPU, memory and network download, each a number with a hairline meter in its own Spectrum hue.',
tags: ['neo', 'info bar', 'system', 'cpu', 'memory', 'network', 'monitor', 'screen'],
surface: 'screen',
screens: ['infobar'],
data: ['cpu', 'mem', 'net'],
dataShape: { 'cpu/mem': 'number 0–1 (null = unavailable)', net: '{ up, down } bytes/s' },
fps: 2,
loop: 12,
params: {},
order: 13,
render(ctx) {
const k = surface(ctx);
return infobar(ctx, k, (p, F) => {
const cpu = metricOf(ctx, 'cpu'), mem = metricOf(ctx, 'mem'), net = netOf(ctx);
const cols = [
{ label: 'CPU', value: cpu === null ? '—' : `${Math.round(cpu * 100)}%`, f: cpu ?? 0, hue: HUE.violet },
{ label: 'Mem', value: mem === null ? '—' : `${Math.round(mem * 100)}%`, f: mem ?? 0, hue: HUE.cyan },
{ label: 'Down', value: rateText(net?.down ?? null), f: net ? clamp(Math.sqrt(net.down / NET_MAX.down)) : 0, hue: HUE.azure },
];
const gap = 10, cw = (F.w - gap * 2) / 3, ebs = px(p, 'eyebrow', 8.5), ls = px(p, 'label', 14);
cols.forEach((c, i) => {
const x = F.x0 + i * (cw + gap), tint = p.theme.spectral(c.hue);
p.eyebrow(c.label, { align: 'left', x, y: 15, size: ebs, color: 'muted', maxWidth: cw });
p.label(c.value, { align: 'left', x, y: 33, size: ls, maxWidth: cw });
p.add(rect({ x, y: p.h - 9, width: cw, height: 2, rx: 1, fill: p.colors.line }));
if (c.f > 0.004) p.add(rect({ x, y: p.h - 9.5, width: Math.max(3, cw * c.f), height: 3, rx: 1.5, fill: tint }));
});
});
},
};
};
__d[281] = function (__ns) {
const { surface, path, roundRectPath } = __m(113);
const { capHeight, wrapText } = __m(11);
const { mediaOf, spectrumOf, audioOf } = __m(116);
const { PLAYLIST } = __m(115);
const { strip, stripHeader, stat, meter, segmented, coverArt, mmss, px, HUE, clamp, lerp } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
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
};
__d[282] = function (__ns) {
const { surface } = __m(113);
const { metricOf, tempOf, netOf, seriesOf, sysOf, rateText, bytesText } = __m(116);
const { strip, stripHeader, stat, meter, spark, px, HUE, clamp } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const split = (s) => { const i = s.lastIndexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
const __default = {
id: 'screen-strip-system',
title: 'Strip System Monitor',
category: 'Strip Dashboards',
description: 'The Stream Deck + touch strip as a system monitor, one dial per gauge: CPU, memory, GPU and network (the + XL adds temperature and disk).',
tags: ['plus', 'plus xl', 'strip', 'touch strip', 'system', 'monitor', 'cpu', 'memory', 'gpu', 'network', 'dashboard'],
surface: 'strip',
segments: 'all',
data: ['cpu', 'mem', 'gpu', 'disk', 'net', 'temp'],
dataShape: { 'cpu/mem/gpu/disk': 'number 0–1 (null = unavailable)', net: '{ up, down } bytes/s', temp: '°C', series: '{ cpu?, gpu?, down? } (extension)', sys: '{ memTotal, memUsed, diskTotal, diskFree } (extension)' },
fps: 4,
loop: 12,
params: { fahrenheit: { type: 'bool', default: false, label: 'Fahrenheit' } },
order: 30,
render(ctx) {
const sys = sysOf(ctx);
const base = (p) => Math.round(p.h * 0.66);
const big = (p) => px(p, 'value', 22) * 1.05;
const history = (p, F, key, sx) => {
const s = seriesOf(ctx, key, 22, 0.5);
spark(p, s.values, { x: sx, y: F.eyebrowY + 9, w: F.x1 - sx, h: F.footY - F.eyebrowY - 11, shift: ctx.reduced ? 0 : s.frac || 0, width: Math.max(1.6, p.m.u), area: 0.14 });
};
const loadCell = (key, title) => (p, F) => {
const v = metricOf(ctx, key);
stripHeader(p, F, title, key === 'cpu' && Array.isArray(sys.cores) ? `${sys.cores.length} cores` : '');
const s = stat(p, { role: 'value', value: v === null ? '—' : Math.round(v * 100), unit: v === null ? '' : '%', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45 });
if (v !== null) history(p, F, key, Math.max(s.right + 8, F.x0 + F.w * 0.5));
};
const memory = (p, F) => {
const v = metricOf(ctx, 'mem'), total = sys.memTotal || 0, used = sys.memUsed ?? (v !== null && total ? v * total : null);
const gb = (b) => { const x = b / 1024 ** 3; return x >= 100 ? `${Math.round(x)}` : x.toFixed(1).replace(/\.0$/, ''); };
stripHeader(p, F, 'Memory', total ? `of ${gb(total)} GB` : '');
stat(p, { role: 'value', value: used === null || used === undefined ? '—' : gb(used), unit: used === null || used === undefined ? '' : 'GB', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45 });
meter(p, { x: F.x0, y: F.footY - 5, w: F.w, h: 5, value: v ?? 0 });
};
const network = (p, F) => {
const net = netOf(ctx);
const [dn, du] = split(rateText(net?.down ?? null)), [un, uu] = split(rateText(net?.up ?? null));
stripHeader(p, F, 'Network', [`↑ ${un}${uu ? ` ${uu}` : ''}`, `↑ ${un}`]);
const cs = px(p, 'caption', 13.5);
p.caption('↓', { align: 'left', x: F.x0, y: base(p), size: cs, color: 'muted' });
const s = stat(p, { role: 'value', value: dn, unit: du, xl: F.x0 + Math.round(cs * 0.85), base: base(p), size: big(p), unitScale: 0.42 });
if (net) history(p, F, 'down', Math.max(s.right + 8, F.x0 + F.w * 0.62));
};
const temp = (p, F) => {
const t = tempOf(ctx), f = ctx.params.fahrenheit;
stripHeader(p, F, 'Temp', 'package');
stat(p, { role: 'value', value: t === null ? '—' : Math.round(f ? t * 1.8 + 32 : t), unit: t === null ? '' : f ? '°F' : '°C', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45, color: t !== null && t >= 90 ? 'warn' : undefined });
meter(p, { x: F.x0, y: F.footY - 5, w: F.w, h: 5, value: t === null ? 0 : clamp((t - 30) / 70), color: t !== null && t >= 90 ? p.colors.warn : undefined });
};
const disk = (p, F) => {
const v = metricOf(ctx, 'disk');
stripHeader(p, F, 'Disk', Number.isFinite(sys.diskFree) ? `${bytesText(sys.diskFree)} free` : '');
stat(p, { role: 'value', value: v === null ? '—' : Math.round(v * 100), unit: v === null ? '' : '%', xl: F.x0, base: base(p), size: big(p), unitScale: 0.45 });
meter(p, { x: F.x0, y: F.footY - 5, w: F.w, h: 5, value: v ?? 0 });
};
return strip(ctx, surface(ctx), [loadCell('cpu', 'CPU'), memory, loadCell('gpu', 'GPU'), network, temp, disk], { hues: [HUE.violet, HUE.cyan, HUE.jade, HUE.azure, HUE.coral, HUE.citrine] });
},
};
};
__d[283] = function (__ns) {
const { keyInto, compose, rect, path, circle, n, P, linearGradient, url } = __m(113);
const { hexToOklch, mix } = __m(4);
const { clamp, lerp } = __m(12);
__e(__ns, { "PALETTE_OPTIONS": () => PALETTE_OPTIONS, "paletteOf": () => paletteOf, "hueAt": () => hueAt, "colorAt": () => colorAt, "paletteStops": () => paletteStops, "rampFill": () => rampFill, "whiteOf": () => whiteOf, "lift": () => lift, "keyGlass": () => keyGlass, "gridCols": () => gridCols, "gridRows": () => gridRows, "bandPath": () => bandPath, "smoothLine": () => smoothLine, "glowDot": () => glowDot, "meterBar": () => meterBar, "vHair": () => vHair, "barPath": () => barPath, "path": () => path, "rect": () => rect, "circle": () => circle, "n": () => n, "P": () => P, "clamp": () => clamp, "lerp": () => lerp, "mix": () => mix }, [], ["P","PALETTE_OPTIONS","bandPath","barPath","circle","clamp","colorAt","glowDot","gridCols","gridRows","hueAt","keyGlass","lerp","lift","meterBar","mix","n","paletteOf","paletteStops","path","rampFill","rect","smoothLine","vHair","whiteOf"]);
const RAMPS = {
signature: [[0, 300], [0.35, 268], [0.7, 205], [1, 165]],
spectrum: [[0, 22], [0.18, 58], [0.34, 95], [0.52, 150], [0.7, 205], [0.86, 258], [1, 300]],
ember: [[0, 28], [0.5, 52], [1, 80]],
};
const MONO_TAGS = ['crt', 'phosphor', 'mono', 'monochrome', 'blueprint', 'paper', 'ink'];
const PALETTE_OPTIONS = ['auto', 'signature', 'spectrum', 'accent'];
function paletteOf(ctx, name = 'auto') {
if (name !== 'auto') return name;
return ctx.theme.tags?.some((t) => MONO_TAGS.includes(t)) ? 'accent' : 'signature';
}
function hueAt(ctx, name, f) {
const p = paletteOf(ctx, name);
if (p === 'accent') { const h = hexToOklch(ctx.colors.accent)[2] || ctx.hue; return h - 14 + 28 * clamp(f); }
const ramp = RAMPS[p] || RAMPS.signature;
const x = clamp(f);
for (let i = 1; i < ramp.length; i++) if (x <= ramp[i][0]) { const [a, ha] = ramp[i - 1], [b, hb] = ramp[i]; return lerp(ha, hb, (x - a) / (b - a || 1)); }
return ramp[ramp.length - 1][1];
}
const colorAt = (ctx, name, f, tier = 'vivid') => ctx.theme.spectral(hueAt(ctx, name, f), { tier });
function paletteStops(ctx, name, count = 6, opacity, tier = 'vivid') {
return Array.from({ length: count }, (_, i) => { const f = i / (count - 1); return [f, colorAt(ctx, name, f, tier), opacity ? clamp(opacity(f)) : undefined]; });
}
function rampFill(s, stops, { x1 = 0, y1 = 0, x2 = s.w, y2 = 0, name = 'ramp' } = {}) {
const id = s.id(name);
s.def(linearGradient(id, stops, { x1, y1, x2, y2, gradientUnits: 'userSpaceOnUse' }));
return url(id);
}
const whiteOf = (s) => (s.dark ? '#ffffff' : s.colors.ink);
const lift = (s, c, k = 0.45) => mix(c, s.dark ? '#ffffff' : s.colors.ink, k);
function keyGlass(d, grid, { tone = 'idle', toneOf, index = true } = {}) {
d.add(rect({ width: d.w, height: d.h, fill: '#000000' }));
for (const cell of grid.cells) {
const draw = (k) => { k.background({ tone: toneOf ? toneOf(cell) : tone }); };
if (index) keyInto(d, cell, draw, { tag: `g${cell.i}`, clip: false });
else compose(d, cell, draw, { kind: 'screen', tag: `g${cell.i}`, clip: false });
}
}
function gridCols(grid) {
const seen = new Map();
for (const c of grid.cells) if (!seen.has(c.col)) seen.set(c.col, { col: c.col, x: c.x, w: c.w });
return [...seen.values()].sort((a, b) => a.x - b.x);
}
function gridRows(grid) {
const seen = new Map();
for (const c of grid.cells) if (!seen.has(c.row)) seen.set(c.row, { row: c.row, y: c.y, h: c.h });
return [...seen.values()].sort((a, b) => a.y - b.y);
}
function bandPath(top, bottom) {
const p = P();
const curve = (pts, first) => {
if (!pts.length) return;
if (first) p.M(pts[0][0], pts[0][1]); else p.L(pts[0][0], pts[0][1]);
for (let i = 1; i < pts.length; i++) {
const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
p.Q(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
if (i === pts.length - 1) p.L(x1, y1);
}
};
curve(top, true);
curve([...bottom].reverse(), false);
return p.Z().d;
}
function smoothLine(pts) {
const p = P();
if (!pts.length) return '';
p.M(pts[0][0], pts[0][1]);
for (let i = 1; i < pts.length; i++) {
const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
p.Q(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
if (i === pts.length - 1) p.L(x1, y1);
}
return p.d;
}
function glowDot(s, { cx, cy, r, color, opacity = 0.5, rings = 3, core = true }) {
let out = '';
for (let i = rings; i >= 1; i--) out += circle({ cx, cy, r: r * (1 + i * 0.9), fill: color, fillOpacity: n(opacity * 0.16 * (1 + (rings - i) * 0.5), 3) });
if (core) out += circle({ cx, cy, r, fill: color });
return out;
}
function meterBar(s, { x, y, w, h, value, color, track, peak, radius = h / 2 }) {
const v = clamp(value ?? 0);
let out = rect({ x, y, width: w, height: h, rx: radius, fill: track ?? s.colors.line, fillOpacity: s.dark ? null : 0.8 });
if (v > 0.003) out += rect({ x, y, width: Math.max(h, w * v), height: h, rx: radius, fill: color });
if (peak !== undefined && peak !== null) out += rect({ x: x + w * clamp(peak) - s.m.hair / 2, y: y - h * 0.35, width: Math.max(1, s.m.hair), height: h * 1.7, fill: whiteOf(s), fillOpacity: 0.85 });
return out;
}
function vHair(s, { x, y, h, color, opacity = 0.5, name = 'vh' }) {
const id = s.id(name);
const c = color ?? (s.colors.beam || whiteOf(s));
s.def(linearGradient(id, [[0, c, 0], [0.5, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
return rect({ x: x - s.m.hair / 2, y, width: s.m.hair, height: h, fill: url(id), fillOpacity: n(opacity, 3) });
}
const barPath = (x, y0, w, hgt, r) => {
const rr = Math.min(r, w / 2, hgt / 2);
if (hgt <= 0.01) return '';
return P().M(x, y0).V(y0 - hgt + rr).Q(x, y0 - hgt, x + rr, y0 - hgt).H(x + w - rr).Q(x + w, y0 - hgt, x + w, y0 - hgt + rr).V(y0).Z().d;
};
};
__d[284] = function (__ns) {
const { surface, rect, circle, n, linearGradient, url } = __m(113);
const { pad2 } = __m(11);
const { keyGlass, whiteOf, colorAt } = __m(283);
__e(__ns, { "clockLines": () => clockLines, "default": () => __default }, [], ["clockLines","default"]);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function clockLines(cols, c, hour12) {
const hh = pad2(hour12 ? ((c.h + 11) % 12) + 1 : c.h), mm = pad2(c.m), ss = pad2(c.s);
const D = (s) => [...s].map((ch) => ({ ch }));
if (cols >= 8) return [[...D(hh), { colon: true }, ...D(mm), { colon: true }, ...D(ss)]];
if (cols >= 5) return [[...D(hh), { colon: true }, ...D(mm)]];
if (cols === 4) return [[...D(hh).map((x, i) => (i === 1 ? { ...x, edgeColon: true } : x)), ...D(mm)]];
if (cols === 3) return [[...D(hh), { colon: true }], [...D(mm), { small: `:${ss}` }]];
if (cols === 2) return [D(hh), D(mm)];
return [[{ ch: `${hh}` }], [{ ch: mm }]];
}
const __default = {
id: 'app-clock-span',
title: 'Clock Across Keys',
category: 'Clocks & Timers',
description: 'A clock across a block of keys, one digit per key so no bezel splits a number, with a seconds Beam and the date. Real time from your computer’s clock.',
tags: ['clock', 'time', 'span', 'digits', 'date', 'wall clock', 'gap-aware'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
data: ['clock'],
fps: 2,
loop: 60,
params: {
hour12: { type: 'bool', default: false, label: '12-hour clock' },
date: { type: 'bool', default: true, label: 'Show the date' },
},
order: 25,
render(ctx) {
const d = surface(ctx);
const { grid, clock: c, params: p } = ctx;
keyGlass(d, grid, { index: false });
const cols = [...new Set(grid.cells.map((x) => x.col))].sort((a, b) => a - b);
const rows = [...new Set(grid.cells.map((x) => x.row))].sort((a, b) => a - b);
const at = (ci, ri) => grid.cells.find((x) => x.col === cols[ci] && x.row === rows[ri]);
const KW = grid.key.w, KH = grid.key.h, K = Math.min(KW, KH);
const lines = clockLines(cols.length, c, p.hour12);
const dateRow = p.date && rows.length > lines.length;
const used = lines.length + (dateRow ? 1 : 0);
const spare = rows.length - used, r0 = Math.max(0, rows.length > cols.length ? Math.floor(spare / 2) : Math.ceil(spare / 2));
const ink = 'ink';
const tick = c.s % 2 === 0;
lines.forEach((line, li) => {
const ri = r0 + li;
if (ri >= rows.length) return;
const c0 = Math.floor((cols.length - line.length) / 2);
line.forEach((slot, si) => {
const cell = at(c0 + si, ri);
if (!cell) return;
const cx = cell.x + KW / 2, cy = cell.y + KH * 0.5;
if (slot.colon) {
const rr = K * 0.055, op = tick || ctx.reduced ? 1 : 0.35;
for (const dy of [-0.16, 0.16]) d.add(circle({ cx, cy: cy + KH * dy, r: rr, fill: whiteOf(d), fillOpacity: n(op, 2) }));
} else if (slot.small) {
d.value(slot.small, { x: cx, cy, size: K * 0.3, maxWidth: KW * 0.8, color: 'muted' });
} else {
d.hero(slot.ch, { x: cx, cy, size: K * (slot.ch.length > 1 ? 0.44 : 0.66), maxWidth: KW - d.m.text * 2, color: ink });
if (slot.edgeColon) { const rr = K * 0.045, op = tick || ctx.reduced ? 1 : 0.35; for (const dy of [-0.15, 0.15]) d.add(circle({ cx: cell.x + KW - d.m.safe, cy: cy + KH * dy, r: rr, fill: whiteOf(d), fillOpacity: n(op, 2) })); }
}
});
if (li === lines.length - 1) {
const first = at(c0, ri), last = at(c0 + line.length - 1, ri);
if (first && last) {
const x0 = first.x + d.m.safe, x1 = last.x + KW - d.m.safe, y = first.y + KH - d.m.u * 7;
const f = c.s / 60, id = d.id('beam');
const o1 = Math.max(0, f - 0.12), o3 = Math.min(1, f + 0.04);
d.def(linearGradient(id, [[0, colorAt(ctx, 'auto', 0), 0.15], [o1, colorAt(ctx, 'auto', f), 0.45], [f, d.dark ? '#ffffff' : d.colors.ink, 1], [Math.max(f, o3), colorAt(ctx, 'auto', f), 0.3], [1, colorAt(ctx, 'auto', 1), 0.12]], { x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' }));
for (let si = 0; si < line.length; si++) {
const cell = at(c0 + si, ri);
if (!cell) continue;
const a = Math.max(x0, cell.x), b = Math.min(x1, cell.x + KW);
if (b > a) d.add(rect({ x: a, y, width: b - a, height: Math.max(1.25, d.m.line), fill: url(id) }));
}
}
}
});
if (dateRow) {
const ri = r0 + lines.length;
const items = cols.length >= 5 ? [DAYS[c.dow], String(c.day), MONTHS[c.month - 1], String(c.year)] : cols.length >= 3 ? [DAYS[c.dow], String(c.day), MONTHS[c.month - 1]] : [`${DAYS[c.dow]} ${c.day}`];
const c0 = Math.floor((cols.length - items.length) / 2);
items.forEach((txt, i) => {
const cell = at(c0 + i, ri);
if (!cell) return;
const num = /^\d+$/.test(txt);
if (num) d.value(txt, { x: cell.x + KW / 2, cy: cell.y + KH / 2, size: K * (txt.length > 2 ? 0.26 : 0.34), maxWidth: KW - d.m.text * 2, color: 'muted' });
else d.eyebrow(txt, { align: 'center', x: cell.x + KW / 2, y: cell.y + KH / 2 + K * 0.06, size: K * 0.17, maxWidth: KW - d.m.text * 2, color: 'muted' });
});
}
return d.svg();
},
};
};
__d[285] = function (__ns) {
const { surface, path, circle, rect, n, arcPath, polar } = __m(113);
const { clockOf } = __m(98);
const { pad2, clockText } = __m(11);
const { clamp, lerp, pulse, smoothstep } = __m(12);
const { whiteOf, colorAt, glowDot } = __m(283);
__e(__ns, { "default": () => __default }, [], ["default"]);
const big = (k) => Math.min(k.w, k.h) >= 110;
function skyOf(h) {
const dawn = smoothstep(5, 7, h) * (1 - smoothstep(7, 9, h)), dusk = smoothstep(17, 19, h) * (1 - smoothstep(19, 21, h));
const day = smoothstep(6.5, 9, h) * (1 - smoothstep(17.5, 20, h));
if (dawn > 0.35) return { hue: 34, k: 0.55, label: 'dawn' };
if (dusk > 0.35) return { hue: 52, k: 0.55, label: 'dusk' };
return day > 0.5 ? { hue: 86.5, k: 0.4, label: 'day' } : { hue: 280, k: 0.5, label: 'night' };
}
const worldClock = {
id: 'app-world-clock', title: 'World Clock', category: 'Clocks & Timers',
description: 'Any city’s time on one key: hairline hands on a face lit by that city’s sky, with its offset from your local time. Real time from your computer’s clock.',
tags: ['clock', 'time', 'world', 'timezone', 'city', 'analog', 'travel'],
surface: 'key', data: ['clock'], fps: 1, loop: 60,
params: {
city: { type: 'text', default: 'Tokyo', maxLength: 12, label: 'City' },
offset: { type: 'number', default: 9, min: -12, max: 14, step: 0.25, label: 'UTC offset (hours)' },
face: { type: 'select', default: 'analog', options: ['analog', 'digital'], label: 'Face' },
hour12: { type: 'bool', default: false, label: '12-hour clock' },
},
order: 20,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const c = clockOf(ctx.now, Math.round(p.offset * 60));
const local = ctx.clock.tzOffset ?? 0;
const diff = Math.round((p.offset * 60 - local) / 15) / 4;
const rel = diff === 0 ? 'local' : `${diff > 0 ? '+' : '–'}${Math.abs(diff)}h`;
const hr = c.h + c.m / 60 + c.s / 3600;
const sky = skyOf(hr);
k.background({ tone: 'idle' });
const hh = p.hour12 ? ((c.h + 11) % 12) + 1 : c.h;
const digits = `${hh}:${pad2(c.m)}`;
if (p.face === 'digital') {
const id = k.id('sky');
const tint = ctx.theme.spectral(sky.hue, { tier: 'wash' });
k.def(`<radialGradient id="${id}" cx="0.5" cy="1" r="0.9"><stop offset="0" stop-color="${tint}" stop-opacity="${k.dark ? 0.32 : 0.5}"/><stop offset="1" stop-color="${tint}" stop-opacity="0"/></radialGradient>`);
k.add(rect({ width: w, height: h, fill: `url(#${id})` }));
k.caption(rel, { align: 'left', x: k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
k.value(digits, { cy: h * 0.48, maxWidth: w - k.m.text * 2 });
k.label(p.city, { color: 'muted' });
return k.svg();
}
const m = Math.min(w, h), cx = w / 2, cy = big(k) ? h * 0.43 : h * 0.42, r = m * (big(k) ? 0.31 : 0.3);
const fid = k.id('face');
const skyC = ctx.theme.spectral(sky.hue, { tier: k.dark ? 'ink' : 'wash' });
k.def(`<radialGradient id="${fid}" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="${skyC}" stop-opacity="${k.dark ? 0.34 : 0.55}"/><stop offset="1" stop-color="${skyC}" stop-opacity="${k.dark ? 0.08 : 0.18}"/></radialGradient>`);
k.add(circle({ cx, cy, r, fill: `url(#${fid})` }));
k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(Math.max(1, k.m.hair)) }));
let ticks = '';
for (let i = 0; i < 12; i++) {
const major = i % 3 === 0;
const [x1, y1] = polar(cx, cy, r - k.m.u * 1.5, i * 30), [x2, y2] = polar(cx, cy, r - k.m.u * (major ? 5 : 3.2), i * 30);
ticks += `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
}
k.add(path(ticks, { stroke: k.colors.muted, strokeWidth: n(Math.max(1, k.m.hair * 1.2)), strokeLinecap: 'round' }));
const ink = k.dark ? '#ffffff' : k.colors.ink;
const hand = (deg, len, width, color) => { const [x, y] = polar(cx, cy, len, deg), [bx, by] = polar(cx, cy, -len * 0.14, deg); return path(`M${n(bx)} ${n(by)}L${n(x)} ${n(y)}`, { stroke: color, strokeWidth: n(width), strokeLinecap: 'round' }); };
k.add(hand(((c.h % 12) + c.m / 60) * 30, r * 0.52, k.m.bold * 0.9, ink));
k.add(hand((c.m + c.s / 60) * 6, r * 0.78, k.m.line * 1.1, ink));
const [sx, sy] = polar(cx, cy, r, c.s * 6);
k.add(glowDot(k, { cx: sx, cy: sy, r: k.m.line * 1.05, color: colorAt(ctx, 'auto', 0.8), opacity: 0.8 }));
k.add(circle({ cx, cy, r: k.m.line * 1.3, fill: ink }));
k.caption(rel, { align: 'left', x: k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
if (big(k)) k.caption(digits, { align: 'right', x: w - k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
k.label(p.city, { color: 'ink' });
return k.svg();
},
};
const stopwatch = {
id: 'app-stopwatch', title: 'Stopwatch', category: 'Clocks & Timers',
description: 'Press to start, again to stop, again to reset: the seconds sweep the rim as light, tenths tick, laps mark the ring. The stopwatch runs for real on the key.',
tags: ['stopwatch', 'timer', 'chronograph', 'laps', 'time'],
surface: 'key', data: ['timer'], fps: 10, loop: 60,
states: ['ready', 'running', 'stopped'],
tones: { ready: 'idle', running: 'active', stopped: 'ok' },
press: 'cycle',
params: {},
order: 30,
render(ctx) {
const k = surface(ctx);
const { w, h, stateName: st, since } = ctx;
const T = ctx.data?.timer;
const elapsed = T && Number.isFinite(T.elapsed) ? T.elapsed : st === 'running' ? since : st === 'stopped' ? 83.4 : 0;
const laps = Array.isArray(T?.laps) ? T.laps : [];
k.background({ tone: ctx.tone });
const m = Math.min(w, h), cx = w / 2, cy = h * 0.5, r = m * 0.38, sw = k.m.bold * 0.8;
const color = st === 'stopped' ? k.tone('ok') : colorAt(ctx, 'auto', 0.75);
k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(sw * 0.6) }));
const sec = elapsed % 60, frac = sec / 60;
if (elapsed > 0) {
const tail = Math.min(frac * 360, 300);
if (frac > 0.002) k.add(path(arcPath(cx, cy, r, frac * 360 - tail, frac * 360), { fill: 'none', stroke: color, strokeWidth: n(sw), strokeLinecap: 'round', strokeOpacity: st === 'running' ? 1 : 0.7 }));
const [hx, hy] = polar(cx, cy, r, frac * 360);
k.add(glowDot(k, { cx: hx, cy: hy, r: sw * 0.55, color: whiteOf(k), opacity: st === 'running' ? 0.9 : 0.5 }));
}
for (const lap of laps) { const [lx, ly] = polar(cx, cy, r + sw * 0.9, (lap % 60) * 6); k.add(circle({ cx: lx, cy: ly, r: k.m.line * 0.75, fill: k.colors.muted })); }
const mm = Math.floor(elapsed / 60), ss = Math.floor(sec), tenth = Math.floor((elapsed * 10) % 10);
const main = elapsed >= 3600 ? clockText(elapsed) : `${mm}:${pad2(ss)}`;
k.value(main, { cy: cy - k.m.u * 1.5, size: k.m.u * 18, maxWidth: r * 1.5, color: st === 'ready' ? 'muted' : 'ink' });
k.caption(st === 'ready' ? 'Start' : `.${tenth}${st === 'stopped' ? ' · stopped' : ''}`, { y: cy + r * 0.52, maxWidth: r * 1.5, color: st === 'ready' ? 'dim' : 'muted' });
return k.svg();
},
};
const countdown = {
id: 'app-countdown', title: 'Countdown', category: 'Clocks & Timers',
description: 'Press to start a countdown: sixty ticks go out one by one, the last ten pulse, and at zero it alerts and counts overtime. A real timer on the key.',
tags: ['countdown', 'timer', 'kitchen timer', 'alarm', 'time'],
surface: 'key', data: ['timer'], fps: 4, loop: 60,
states: ['ready', 'running'],
tones: { ready: 'idle', running: 'active' },
press: 'toggle',
params: {
minutes: { type: 'number', default: 5, min: 0, max: 180, step: 1, label: 'Minutes' },
seconds: { type: 'number', default: 0, min: 0, max: 59, step: 1, label: 'Seconds' },
label: { type: 'text', default: '', maxLength: 10, label: 'Label' },
},
order: 31,
render(ctx) {
const k = surface(ctx);
const { w, h, stateName: st, since, t, params: p } = ctx;
const total = Math.max(1, p.minutes * 60 + p.seconds);
const T = ctx.data?.timer;
const left = T && Number.isFinite(T.remaining) ? T.remaining : st === 'running' ? total - since : total;
const done = st === 'running' && left <= 0, last = st === 'running' && left > 0 && left <= 10;
k.background({ tone: done ? 'alert' : last ? 'warn' : ctx.tone });
const m = Math.min(w, h), cx = w / 2, cy = h * 0.5, r = m * 0.39;
const frac = clamp(left / total), lit = Math.ceil(frac * 60 - 1e-9);
const on = done ? k.tone('alert') : last ? k.tone('warn') : colorAt(ctx, 'auto', 0.6);
let a = '', b = '';
for (let i = 0; i < 60; i++) {
const major = i % 5 === 0;
const [x1, y1] = polar(cx, cy, r, i * 6), [x2, y2] = polar(cx, cy, r - k.m.u * (major ? 5 : 3), i * 6);
const seg = `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
if (i < lit && !done) a += seg; else b += seg;
}
const tw = n(Math.max(1, k.m.line * (big(k) ? 1 : 0.9)));
k.add(path(b, { stroke: k.colors.line, strokeWidth: tw, strokeLinecap: 'round' }));
if (a) k.add(path(a, { stroke: on, strokeWidth: tw, strokeLinecap: 'round', strokeOpacity: st === 'running' ? 1 : 0.55 }));
if (done && !ctx.reduced) k.add(circle({ cx, cy, r: r * 0.8, fill: on, fillOpacity: n(0.08 + 0.1 * pulse(t, 1), 3) }));
const shown = done ? `+${clockText(-left)}` : clockText(Math.ceil(left));
const beat = last && !ctx.reduced ? 0.75 + 0.25 * pulse(left, 1) : 1;
k.value(shown, { cy: cy - k.m.u, size: k.m.u * 17 * (last ? lerp(0.96, 1.04, beat - 0.75) : 1), maxWidth: r * 1.45, color: done ? 'tone' : st === 'running' ? 'ink' : 'muted' });
k.caption(done ? 'Done' : st === 'ready' ? (p.label || 'Start') : p.label || `of ${clockText(total)}`, { y: cy + r * 0.5, maxWidth: r * 1.4, color: done ? 'tone' : 'dim' });
return k.svg();
},
};
const __default = [worldClock, stopwatch, countdown];
};
__d[286] = function (__ns) {
const { surface, rect, n } = __m(113);
const { clamp, outExpo, arrive } = __m(12);
const { mix } = __m(4);
const { compact } = __m(11);
const { text, isBig, perimeter, perimeterStroke, burst } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const HOLD = 0.8, ROLL = 0.38;
const __default = {
id: 'app-counter',
title: 'Counter',
category: 'Controls',
description: 'A tally key: press to count and the number rolls like an odometer; hold to reset. Optional goal with a celebration. It counts your presses; nothing else is read.',
tags: ['counter', 'tally', 'count', 'clicker', 'score', 'reps', 'tracker', 'productivity', 'stream', 'streaming', 'goal'],
surface: 'key',
animated: false,
fps: 12,
loop: 2,
params: {
label: { type: 'text', default: 'Count', maxLength: 12, label: 'Label' },
step: { type: 'number', default: 1, min: 1, max: 100, step: 1, label: 'Count by' },
goal: { type: 'number', default: 0, min: 0, max: 100000, step: 1, label: 'Goal (0 = none)' },
hue: { type: 'hue', default: 217.5, min: 0, max: 360, label: 'Hue' },
},
game: {
tickHz: 4,
ticking: (s) => s.down !== null,
animate: 1.1,
init({ params }) { return { count: 0, step: Math.max(1, Math.round(params.step)), down: null, resets: 0 }; },
reduce(s, ev) {
if (ev.type === 'press') return { ...s, count: s.count + s.step, down: ev.t };
if (ev.type === 'tick' && s.down !== null && ev.t - s.down >= HOLD) return { ...s, count: 0, down: null, resets: s.resets + 1 };
if (ev.type === 'release' && s.down !== null) return ev.t - s.down >= HOLD ? { ...s, count: 0, down: null, resets: s.resets + 1 } : { ...s, down: null };
return s;
},
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const s = ctx.game || { count: 0, down: null, step: 1 };
const prev = ctx.gamePrev;
const ev = ctx.gameEvent;
const age = ev ? ev.age : 99;
const goal = ctx.params.goal;
const reached = goal > 0 && s.count >= goal;
k.background({ tone: reached ? 'ok' : s.down !== null ? 'active' : 'idle' });
const big = isBig(k);
const cy = h * (goal > 0 ? 0.47 : 0.52);
const size = (big ? 34 : 30) * u * (s.count >= 1000 ? 0.78 : 1);
const room = w - k.m.text * 2;
const changed = prev && prev.count !== s.count && ev && (ev.type === 'press' || ev.type === 'tick' || ev.type === 'release');
const r = changed && !ctx.reduced ? outExpo(clamp(age / ROLL)) : 1;
const up = s.count > (prev?.count ?? 0) ? 1 : -1;
const travel = size * 0.95;
const cid = k.id('win');
k.def(`<clipPath id="${cid}"><rect x="0" y="${n(cy - size * 0.62)}" width="${n(w)}" height="${n(size * 1.24)}"/></clipPath>`);
let roll = '';
if (r < 1) roll += text(k, compact(prev.count), { cy: cy - up * travel * r, size, weight: 700, tabular: true, color: 'ink', opacity: (1 - r) ** 2, maxWidth: room, add: false });
roll += text(k, compact(s.count), { cy: cy + up * travel * (1 - r), size, weight: 700, tabular: true, color: s.count === 0 && !changed ? 'muted' : 'ink', opacity: r < 1 ? r : undefined, maxWidth: room, add: false });
k.add(`<g clip-path="url(#${cid})">${roll}</g>`);
k.eyebrow(ctx.params.label, { color: 'muted', maxWidth: room * 0.7 });
if (changed && up > 0 && age < 0.9 && big) k.eyebrow(`+${s.step}`, { align: 'right', x: w - k.m.text, color: 'ink', opacity: 1 - clamp((age - 0.5) / 0.4) });
if (s.down !== null && ev?.type === 'press') {
const f = clamp((age - 0.15) / (HOLD - 0.15));
const inset = k.m.hair + k.m.line;
const per = perimeter(inset, inset, w - inset * 2, h - inset * 2, k.m.radius * 0.9);
if (f > 0) k.add(perimeterStroke(per, f, { color: C.warn, width: k.m.line * 1.8 }));
if (age > 0.25) k.caption('hold to reset', { y: h - k.m.safe - u, color: 'warn', opacity: clamp((age - 0.25) / 0.2) });
} else if (ev && prev && s.count === 0 && prev.count > 0 && age < 1.1) {
k.caption('reset', { y: h - k.m.safe - u, color: 'warn', opacity: 1 - clamp((age - 0.6) / 0.5) });
} else if (goal > 0) {
const by = h - k.m.safe - 11 * u, bw = room, bh = Math.max(2, 2.4 * u);
const f = clamp(s.count / goal);
k.add(rect({ x: n(k.m.text), y: n(by), width: n(bw), height: n(bh), rx: n(bh / 2), fill: C.line }));
if (f > 0) k.add(rect({ x: n(k.m.text), y: n(by), width: n(Math.max(bh, bw * f)), height: n(bh), rx: n(bh / 2), fill: reached ? C.pos : ctx.tint }));
k.caption(reached ? `goal ${compact(goal)} ✓` : `of ${compact(goal)}`, { y: h - k.m.safe + u * 0.5, color: reached ? 'pos' : 'dim' });
if (reached && changed && prev.count < goal) k.add(burst(k, { cx: w / 2, cy, r0: size * 0.4, r1: Math.min(w, h) * 0.55, age, dur: 1.05, count: 12, hue: ctx.hue }));
}
void arrive; void mix;
return k.svg();
},
};
};
__d[287] = function (__ns) {
const { surface, arc, ticks, polar, circle, mix } = __m(113);
const { metric } = __m(1);
const { lerp } = __m(12);
const { n } = __m(5);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'app-cpu-ring',
title: 'CPU Ring',
category: 'System',
description: 'CPU load on a 270° ring in the theme’s own inks that warms past your thresholds. Live in the plugin (system source); simulated on the web.',
tags: ['cpu', 'system', 'monitor', 'gauge', 'ring', 'percent', 'live'],
surface: 'key',
data: ['cpu'],
fps: 4,
loop: 12,
params: {
label: { type: 'text', default: 'CPU', label: 'Label', maxLength: 10 },
warn: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.05, label: 'Warn at' },
crit: { type: 'number', default: 0.9, min: 0, max: 1, step: 0.05, label: 'Critical at' },
},
order: 10,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const v = typeof ctx.data.cpu === 'number' ? ctx.data.cpu : metric(ctx.t, ctx.seed, { lo: 0.12, hi: 0.96, speed: 0.22, jitter: 0.12 });
const tone = v >= p.crit ? 'alert' : v >= p.warn ? 'warn' : 'idle';
k.background({ tone });
const m = Math.min(w, h);
const cx = w / 2, cy = h * 0.5, r = m * 0.36, sw = k.m.ring;
const lit = tone === 'idle' ? 'active' : tone; 
const dim = k.roleStyle('dim', lit), acc = k.roleStyle('accent', lit), spark = k.roleStyle('spark', lit);
k.add(arc({ cx, cy, r, from: -135, to: 135, color: k.colors.line, width: sw, cap: 'round' }));
if (m >= 110) k.add(ticks({ cx, cy, r: r - sw * 0.95, len: k.m.line * 1.4, from: -135, to: 135, count: 11, major: 5, color: dim.color, width: k.m.hair, opacity: 0.55 }));
const end = lerp(-135, 135, v);
if (v > 0.002) {
if (acc.glow) k.add(arc({ cx, cy, r, from: -135, to: end, color: acc.color, width: sw * (1 + 1.6 * acc.glow), opacity: n(0.16 * acc.glow, 3), cap: 'round' }));
const count = Math.max(2, Math.round((m >= 110 ? 18 : 12) * v)), step = (end + 135) / count;
const at = (i) => mix(mix(dim.color, acc.color, 0.35), acc.color, Math.min(1, (i + 0.5) / count));
k.add(arc({ cx, cy, r, from: -135, to: -135 + step * 0.5, color: at(0), width: sw, cap: 'round' }));
for (let i = 0; i < count; i++) k.add(arc({ cx, cy, r, from: -135 + step * i, to: -135 + step * (i + 1) + (i < count - 1 ? step * 0.08 : 0), color: at(i), width: sw, cap: 'butt' }));
}
const [hx, hy] = polar(cx, cy, r, end);
k.add(circle({ cx: hx, cy: hy, r: sw * 1.25, fill: spark.color, fillOpacity: 0.22 }));
k.add(circle({ cx: hx, cy: hy, r: sw * 0.42, fill: tone === 'idle' ? k.colors.ink : spark.color }));
k.value(`${Math.round(v * 100)}%`, { cy: cy - k.m.u, maxWidth: r * 1.45, color: tone === 'idle' ? 'ink' : 'tone' });
k.label(p.label, { y: cy + r * 0.92, color: 'muted', maxWidth: r * 1.2 });
return k.svg();
},
};
};
__d[288] = function (__ns) {
const { surface, rect, path, circle, n, P, linearGradient, url } = __m(113);
const { clockOf } = __m(98);
const { clamp, outExpo, inQuad } = __m(12);
const { mix } = __m(4);
const { text, isBig, DOW, DOW_LONG, MONTH, MONTH_LONG } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const TEAR = 1.2;
function isoWeek(y, m, d) {
const t = Date.UTC(y, m - 1, d);
const day = (new Date(t).getUTCDay() + 6) % 7;
const th = t - day * 86400000 + 3 * 86400000;
const y0 = Date.UTC(new Date(th).getUTCFullYear(), 0, 4);
return 1 + Math.round(((th - y0) / 86400000 - 3 + ((new Date(y0).getUTCDay() + 6) % 7)) / 7);
}
function page(k, c, { x, y, w, h, big, weekStart }) {
const C = k.colors, u = k.m.u;
const r = k.m.radius * 0.6;
const paper = k.dark ? mix(C.surface, '#ffffff', 0.07) : mix(C.surface, '#ffffff', 0.7);
const band = h * (big ? 0.27 : 0.3);
const tint = k.ctx.tint, deep = k.ctx.theme.spectral(k.ctx.hue, { tier: 'ink' });
const head = k.dark ? mix(tint, '#000000', 0.25) : deep;
let out = path(P().M(x, y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).Z().d, { fill: paper, stroke: C.line, strokeWidth: n(Math.max(1, u * 0.6)) });
out += path(P().M(x, y + band).V(y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(y + band).Z().d, { fill: head });
const rr = Math.max(1.4, 1.9 * u);
for (const fx of [0.3, 0.7]) out += circle({ cx: n(x + w * fx), cy: n(y + rr * 1.6), r: n(rr), fill: k.dark ? '#000000' : C.surface2, stroke: mix(head, '#000000', 0.3), strokeWidth: n(Math.max(0.8, u * 0.5)) });
const month = big ? MONTH_LONG[c.month - 1] : MONTH[c.month - 1];
out += text(k, month, { x: x + w / 2, cy: y + band * 0.6, size: band * 0.42, weight: 700, caps: true, tracking: 0.12, color: '#ffffff', maxWidth: w * 0.84, add: false });
const numY = y + band + (h - band) * (big ? 0.4 : 0.44);
out += text(k, String(c.day), { x: x + w / 2, cy: numY, size: (h - band) * (big ? 0.5 : 0.56), weight: 700, tabular: true, color: 'ink', add: false });
const wd = big ? DOW_LONG[c.dow] : DOW[c.dow];
out += text(k, wd, { x: x + w / 2, cy: y + band + (h - band) * (big ? 0.74 : 0.84), size: (big ? 8.5 : 7.5) * u, weight: 600, caps: true, tracking: 0.1, color: c.dow === 0 || c.dow === 6 ? deep : 'muted', maxWidth: w * 0.9, add: false });
if (big) {
const dy = y + h - (h - band) * 0.09, gap = w * 0.105, dr = Math.max(1.3, 1.5 * u);
let dots = '';
for (let i = 0; i < 7; i++) {
const dow = (weekStart + i) % 7, dx = x + w / 2 + (i - 3) * gap;
if (dow === c.dow) out += circle({ cx: n(dx), cy: n(dy), r: n(dr * 1.45), fill: tint });
else dots += `M${n(dx + dr)} ${n(dy)}A${n(dr)} ${n(dr)} 0 1 1 ${n(dx - dr)} ${n(dy)}A${n(dr)} ${n(dr)} 0 1 1 ${n(dx + dr)} ${n(dy)}Z`;
}
out += path(dots, { fill: C.dim, fillOpacity: 0.7 });
}
return out;
}
const __default = {
id: 'app-date',
title: 'Date Page',
category: 'Clocks & Timers',
description: 'A tear-off calendar page: the month on a band, the day as the hero, the weekday under it. The real date from your computer’s clock; at midnight the page tears away.',
tags: ['date', 'calendar', 'day', 'today', 'week', 'clock'],
surface: 'key',
fps: 8,
loop: 4,
params: {
weekStart: { type: 'select', default: 'mon', options: ['mon', 'sun'], label: 'Week starts on' },
showWeek: { type: 'bool', default: true, label: 'Week number (big keys)' },
hue: { type: 'hue', default: 8, min: 0, max: 360, label: 'Band hue' },
},
order: 23,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const u = k.m.u;
k.background({ tone: 'idle' });
const big = isBig(k);
const c = ctx.clock;
const tz = c.tzOffset ?? 0;
const sod = c.h * 3600 + c.m * 60 + c.s + c.ms / 1000; 
const inset = k.m.safe * 0.75;
const box = { x: inset, y: inset + u, w: w - inset * 2, h: h - inset * 2 - u, big, weekStart: ctx.params.weekStart === 'sun' ? 0 : 1 };
const drop = ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.5));
const today = page(k, c, box);
if (drop < 0.999) k.add(`<g transform="translate(0 ${n(-(1 - drop) * h * 0.18)})" opacity="${n(0.3 + 0.7 * drop, 3)}">${today}</g>`);
else k.add(today);
if (big && ctx.params.showWeek) text(k, `W${isoWeek(c.year, c.month, c.day)}`, { x: box.x + box.w - 3 * u, y: box.y + box.h * 0.27 + 8.5 * u, size: 7.5 * u, weight: 600, anchor: 'end', color: 'dim' });
if (!ctx.reduced && sod < TEAR && ctx.since > 0.5) {
const y = clockOf(ctx.now - 86400000, tz);
const p = clamp(sod / TEAR), th = Math.PI * inQuad(p);
const sy = Math.cos(th);
const top = box.y;
const about = (s) => `translate(0 ${n(top)}) scale(1 ${n(Math.abs(s) < 0.02 ? (s < 0 ? -0.02 : 0.02) : s, 4)}) translate(0 ${n(-top)})`;
if (sy > 0) {
const shade = k.id('tear');
k.def(linearGradient(shade, [[0, '#000000', 0.05], [1, '#000000', 0.45]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
k.add(`<g transform="${about(sy)}">${page(k, y, box)}${rect({ x: n(box.x), y: n(box.y), width: n(box.w), height: n(box.h), rx: n(k.m.radius * 0.6), fill: url(shade), fillOpacity: n(1 - sy, 3) })}</g>`);
} else {
const C = k.colors, back = k.dark ? mix(C.surface, '#ffffff', 0.12) : mix(C.surface2, C.line, 0.2);
k.add(`<g transform="${about(sy)}" opacity="${n(clamp(1.6 - p * 1.6 + 0.4), 3)}">${rect({ x: n(box.x), y: n(box.y), width: n(box.w), height: n(box.h), rx: n(k.m.radius * 0.6), fill: back, stroke: C.line, strokeWidth: n(Math.max(1, u * 0.6)) })}</g>`);
}
}
return k.svg();
},
};
};
__d[289] = function (__ns) {
const { surface, arc, polar, circle } = __m(113);
const { clockText } = __m(11);
const { arrive, clamp, pulse, lerp } = __m(12);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'app-focus-timer',
title: 'Focus Timer',
category: 'Clocks & Timers',
description: 'A pomodoro on one key: press to start focus, again for a break; the ring drains as light and overtime counts up in amber. The timer runs for real on the key.',
tags: ['pomodoro', 'focus', 'timer', 'countdown', 'break', 'productivity'],
surface: 'key',
data: ['timer'],
fps: 4,
loop: 60,
states: ['ready', 'focus', 'break'],
tones: { ready: 'idle', focus: 'active', break: 'ok' },
params: {
focus: { type: 'number', default: 25, min: 1, max: 90, step: 1, label: 'Focus minutes' },
rest: { type: 'number', default: 5, min: 1, max: 30, step: 1, label: 'Break minutes' },
},
order: 10,
render(ctx) {
const k = surface(ctx);
const { w, h, stateName, since } = ctx;
const total = (stateName === 'break' ? ctx.params.rest : ctx.params.focus) * 60;
const running = stateName !== 'ready';
const left = running ? total - since : total;
const over = left < 0;
const tone = over ? 'warn' : ctx.tone;
k.background({ tone });
const m = Math.min(w, h);
const cx = w / 2, cy = h * 0.53, r = m * 0.37, sw = k.m.bold;
const frac = running ? clamp(left / total) : 1;
const color = k.tone(tone === 'idle' ? 'active' : tone);
k.add(arc({ cx, cy, r, from: 0, to: 360, color: k.colors.line, width: sw * 0.55 }));
if (frac > 0) {
const end = 360 * frac * (running ? arrive(since, 0.6) : 1);
k.add(arc({ cx, cy, r, from: 0, to: Math.max(0.5, end), color, width: sw, opacity: running ? 1 : 0.45 }));
if (running) {
const [hx, hy] = polar(cx, cy, r, end);
k.add(circle({ cx: hx, cy: hy, r: sw * 1.3, fill: color, fillOpacity: 0.25 }));
k.add(circle({ cx: hx, cy: hy, r: sw * 0.55, fill: k.dark ? '#ffffff' : color }));
}
}
if (over) k.add(circle({ cx, cy, r: r * 0.86, fill: k.tone('warn'), fillOpacity: 0.06 + 0.06 * pulse(ctx.t, 2) }));
const word = over ? 'Over' : stateName === 'ready' ? 'Ready' : stateName === 'focus' ? 'Focus' : 'Break';
k.eyebrow(word, { align: 'center', x: cx, y: cy - r * 0.32, color: over ? 'warn' : running ? color : 'muted' });
k.value(over ? `+${clockText(-left)}` : clockText(Math.ceil(left)), { cy: cy + k.m.u * 2, maxWidth: r * 1.55, size: k.m.u * 17, color: running || over ? 'ink' : 'muted' });
if (!running) k.caption('press to start', { y: cy + r * 0.62, maxWidth: r * 1.4, color: 'dim' });
void lerp;
return k.svg();
},
};
};
__d[290] = function (__ns) {
const { surface } = __m(113);
const { audioOf } = __m(116);
const { keyGlass, rampFill, bandPath, smoothLine, glowDot, whiteOf, lift, PALETTE_OPTIONS, colorAt, path, rect, n, clamp } = __m(283);
__e(__ns, { "LAYOUTS": () => LAYOUTS, "autoLayout": () => autoLayout, "expand": () => expand, "default": () => __default }, [], ["LAYOUTS","autoLayout","default","expand"]);
const LAYOUTS = ['auto', 'mirror', 'rows', 'skyline', 'pour'];
const autoLayout = () => 'rows';
const expand = (v) => clamp((v - 0.22) / 0.78);
const BODY = expand(0.52);
const gammaFor = (amp, K) => clamp(Math.log(Math.min(0.92, 0.75 / (amp / (K / 2)))) / Math.log(BODY), 0.6, 2.4);
const ampOf = (L, v) => L.amp * (L.floor + (1 - L.floor) * expand(v) ** L.gamma);
function levelAt(A, age, span) {
const N = A.levels.length;
const idx = N - 1 - (age * A.rate - A.frac);
if (idx < -0.5) return 0;
const half = span * A.rate * 0.5;
if (half <= 0.75) {
const c = clamp(idx, 0, N - 1), i = Math.floor(c), f = c - i;
return A.levels[i] + ((A.levels[Math.min(N - 1, i + 1)] ?? A.levels[i]) - A.levels[i]) * f;
}
let m = 0;
for (let i = Math.max(0, Math.floor(idx - half)); i <= Math.min(N - 1, Math.ceil(idx + half)); i++) m = Math.max(m, A.levels[i]);
return m;
}
const ageAt = (L, along, pps) => L.age0 + (L.v ? along - L.o : L.o - along) / pps;
const xy = (L, along, across) => (L.v ? [across, along] : [along, across]);
const cellRange = (L, c) => (L.v ? { a0: c.y, a1: c.y + c.h, c0: c.x, c1: c.x + c.w } : { a0: c.x, a1: c.x + c.w, c0: c.y, c1: c.y + c.h });
function cellEnvelope(A, L, R, pps, step, m) {
const lo = Math.max(R.a0 - m, L.v ? L.o : L.o - L.len), hi = Math.min(R.a1 + m, L.v ? L.o + L.len : L.o);
if (hi <= lo) return null;
const C0 = R.c0 - m, C1 = R.c1 + m;
const k0 = Math.floor(lo / step), k1 = Math.ceil(hi / step);
const oT = [], oB = [], iT = [], iB = [], runsT = [], runsB = [];
let hit = false, runT = null, runB = null;
for (let k = k0; k <= k1; k++) {
const al = clamp(k * step, lo, hi);
const v = levelAt(A, ageAt(L, al, pps), step / pps);
const a = ampOf(L, v), c = a * (0.34 + 0.26 * expand(v));
const top = L.axis - a, bot = L.mirror ? L.axis + a : L.axis;
const t = clamp(top, C0, C1), b = clamp(bot, C0, C1);
if (b - t > 0.05) hit = true;
oT.push(xy(L, al, t)); oB.push(xy(L, al, b));
iT.push(xy(L, al, clamp(L.axis - c, C0, C1))); iB.push(xy(L, al, clamp(L.mirror ? L.axis + c : L.axis, C0, C1)));
if (top >= C0 && top <= C1) { if (!runT) runsT.push((runT = [])); runT.push(xy(L, al, top)); } else runT = null;
if (L.mirror && bot >= C0 && bot <= C1) { if (!runB) runsB.push((runB = [])); runB.push(xy(L, al, bot)); } else runB = null;
}
if (!hit) return null;
const edges = [...runsT, ...runsB].filter((r) => r.length > 1).map(smoothLine).join('');
return { body: bandPath(oT, oB), core: bandPath(iT, iB), edges };
}
function laneBars(A, L, pps, bw) {
const pitch = pps / A.rate;
const group = Math.max(1, Math.ceil((bw * 1.7) / pitch));
const N = A.levels.length, out = [];
for (let k = 0; ; k++) {
const age = (k * group + A.frac) / A.rate;
const s = (age - L.age0) * pps;
if (s > L.len + bw) break;
const i1 = N - 1 - k * group;
if (i1 < 0) break;
if (s < -bw) continue;
let v = 0;
for (let j = 0; j < group && i1 - j >= 0; j++) v = Math.max(v, A.levels[i1 - j]);
const a = ampOf(L, v);
out.push({ along: L.v ? L.o + s : L.o - s, a, c: a * (0.3 + 0.25 * expand(v)) });
}
return out;
}
function cellBars(bars, L, R, bw) {
const cap = bw / 2, C0 = R.c0 - bw, C1 = R.c1 + bw;
let d = '', dc = '';
const seg = (al, p, q) => { const [x1, y1] = xy(L, al, p), [x2, y2] = xy(L, al, q); return `M${n(x1, 1)} ${n(y1, 1)}L${n(x2, 1)} ${n(y2, 1)}`; };
for (const b of bars) {
if (b.along < R.a0 - bw || b.along > R.a1 + bw) continue;
const a = Math.max(cap * 0.2, b.a - cap);
const p = Math.max(L.axis - a, C0), q = Math.min(L.mirror ? L.axis + a : L.axis - cap * 0.2, C1);
if (q - p > 0.05) d += seg(b.along, p, q);
if (b.c > cap * 0.6) {
const pc = Math.max(L.axis - b.c, C0), qc = Math.min(L.mirror ? L.axis + b.c : L.axis - cap * 0.2, C1);
if (qc - pc > 0.05) dc += seg(b.along, pc, qc);
}
}
return { d, dc };
}
const __default = {
id: 'app-waveform',
title: 'Waveform Across Keys',
category: 'Audio',
description: 'Audio flowing across a block of keys, gap-compensated so the wave slips behind each bezel. Live from sound capture in the plugin; simulated until one runs.',
tags: ['audio', 'waveform', 'live', 'span', 'music', 'level', 'oscilloscope', 'gap-compensated', 'stream', 'streaming', 'visualizer'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
data: ['audio'],
fps: 15,
loop: 16,
params: {
style: { type: 'select', default: 'smooth', options: ['smooth', 'bars'], label: 'Style' },
layout: { type: 'select', default: 'auto', options: LAYOUTS, label: 'Layout' },
palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
speed: { type: 'number', default: 1, min: 0.25, max: 3, step: 0.05, label: 'Flow speed' },
gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
},
order: 10,
render(ctx) {
const d = surface(ctx);
const { w, h, grid, params: p } = ctx;
keyGlass(d, grid, { index: false });
const K = Math.min(grid.key.w, grid.key.h);
const layout = p.layout === 'auto' ? autoLayout(grid) : p.layout;
const pitchX = grid.key.w + grid.gapX, pitchY = grid.key.h + grid.gapY;
const vertical = layout === 'pour';
const pps = p.speed * 1.3 * (vertical ? pitchY : pitchX);
const margin = K * 0.1;
const nLanes = layout === 'rows' ? grid.rows : 1;
const seconds = ((vertical ? h : w) * nLanes) / pps + 0.4;
const A0 = audioOf(ctx, { count: Math.ceil(seconds * 30) + 4, rate: 30 });
const A = p.gain === 1 ? A0 : { ...A0, levels: A0.levels.map((v) => clamp(v * p.gain)) };
const lanes = [];
const lane = (o) => lanes.push({ floor: 0.04, mirror: true, v: false, ...o, gamma: gammaFor(o.mirror === false ? o.amp / 2 : o.amp, K) });
if (layout === 'pour') lane({ v: true, o: 0, axis: w / 2, len: h, amp: w / 2 - margin, age0: 0 });
else if (layout === 'rows') {
for (let r = 0; r < grid.rows; r++) lane({ o: w, axis: r * pitchY + grid.key.h / 2, len: w, amp: grid.key.h / 2 - margin * 0.8, age0: ((grid.rows - 1 - r) * w) / pps, row: grid.row + r });
} else if (layout === 'skyline') lane({ o: w, axis: h - margin * 0.7, len: w, amp: h - margin * 1.7, age0: 0, mirror: false, floor: 0.05 });
else lane({ o: w, axis: h / 2, len: w, amp: h / 2 - margin, age0: 0 });
const dark = d.dark, pal = p.palette;
const total = Math.max(1e-6, seconds - 0.4);
const ramp = (f) => 0.14 + 0.86 * f ** 1.3; 
const bw = Math.max(1.5, Math.min(K * 0.034, (pps / A.rate) * 0.56));
const step = Math.max(2, K / 24), m = Math.min(grid.gapX, grid.gapY, K * 0.1) * 0.45;
for (const L of lanes) {
const end = L.v ? L.o + L.len : L.o - L.len;
const geo = L.v ? { x1: L.axis, y1: L.o, x2: L.axis, y2: end } : { x1: L.o, y1: L.axis, x2: end, y2: L.axis };
const newF = (f) => 1 - clamp((L.age0 + (f * L.len) / pps) / total);
const stops = (op, k = 0) => Array.from({ length: 7 }, (_, i) => { const f = i / 6, af = newF(f); const c = colorAt(ctx, pal, 0.12 + 0.88 * af); return [f, k ? lift(d, c, k) : c, op(af)]; });
const cells = grid.cells.filter((c) => L.row === undefined || c.row === L.row);
if (p.style === 'bars') {
const body = rampFill(d, stops((af) => (dark ? 0.95 : 0.9) * ramp(af)), { ...geo, name: 'bars' });
const core = rampFill(d, stops((af) => 0.85 * ramp(af) ** 1.5, dark ? 0.55 : 0.4), { ...geo, name: 'core' });
const bars = laneBars(A, L, pps, bw);
for (const c of cells) {
const B = cellBars(bars, L, cellRange(L, c), bw);
if (B.d) d.add(path(B.d, { fill: 'none', stroke: body, strokeWidth: n(bw), strokeLinecap: 'round' }));
if (B.dc) d.add(path(B.dc, { fill: 'none', stroke: core, strokeWidth: n(bw * 0.5), strokeLinecap: 'round' }));
}
} else {
const body = rampFill(d, stops((af) => (dark ? 0.6 : 0.5) * ramp(af)), { ...geo, name: 'body' });
const core = rampFill(d, stops((af) => 0.85 * ramp(af), dark ? 0.5 : 0.35), { ...geo, name: 'core' });
const edge = rampFill(d, stops((af) => 0.3 + 0.7 * ramp(af)), { ...geo, name: 'edge' });
const ew = Math.max(1, d.m.line * 0.8);
for (const c of cells) {
const g = cellEnvelope(A, L, cellRange(L, c), pps, step, m);
if (!g) continue;
d.add(path(g.body, { fill: body }));
d.add(path(g.core, { fill: core }));
if (g.edges) d.add(path(g.edges, { fill: 'none', stroke: edge, strokeWidth: n(ew), strokeLinejoin: 'round', strokeLinecap: 'round' }));
}
}
if (L.mirror) for (const c of cells) {
const R = cellRange(L, c);
if (L.axis < R.c0 || L.axis > R.c1) continue;
const [x, y] = xy(L, R.a0, L.axis - d.m.hair / 2);
d.add(rect({ x, y, width: L.v ? d.m.hair : R.a1 - R.a0, height: L.v ? R.a1 - R.a0 : d.m.hair, fill: d.colors.beam || whiteOf(d), fillOpacity: dark ? 0.22 : 0.3 }));
}
}
const L0 = layout === 'rows' ? lanes[lanes.length - 1] : lanes[0];
const inset = d.m.safe * 1.2;
const hal = L0.v ? L0.o + inset : L0.o - inset;
const a = Math.max(d.m.bold, ampOf(L0, levelAt(A, inset / pps + L0.age0, 1 / A.rate)));
const cellOf = grid.cells.find((c) => { const R = cellRange(L0, c); return hal >= R.a0 && hal <= R.a1 && L0.axis >= R.c0 && L0.axis <= R.c1; })
|| grid.cells.find((c) => { const R = cellRange(L0, c); return hal >= R.a0 && hal <= R.a1 && L0.axis > R.c1 - 1e-6 && L0.axis <= R.c1 + K; });
const R = cellRange(L0, cellOf || grid.cells[grid.cells.length - 1]);
const p1 = clamp(L0.axis - a, R.c0 + d.m.safe * 0.5, R.c1), p2 = clamp(L0.mirror ? L0.axis + a : L0.axis, R.c0, R.c1 - d.m.safe * 0.5);
const [x1, y1] = xy(L0, hal, p1), [x2, y2] = xy(L0, hal, p2);
const [hx, hy] = xy(L0, hal, clamp(L0.axis, R.c0, R.c1));
d.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: whiteOf(d), strokeWidth: n(Math.max(1.25, d.m.line)), strokeOpacity: 0.92, strokeLinecap: 'round' }));
d.add(glowDot(d, { cx: hx, cy: hy, r: d.m.bold * 0.8, color: colorAt(ctx, pal, 1), opacity: 0.9, core: false }));
d.add(glowDot(d, { cx: hx, cy: hy, r: d.m.line, color: dark ? whiteOf(d) : lift(d, colorAt(ctx, pal, 1), 0.45), opacity: 0.6, rings: 1 }));
return d.svg();
},
};
};
__d[291] = function (__ns) {
const { surface, path, rect, n, roundRectPath } = __m(113);
const { capHeight } = __m(11);
const { header, stat, meter, segmented, spark, coverArt, frameOf, activeMark, panelInto, galleon, mmss, hhmm, localParts, HUE, clamp } = __m(114);
const { clock, cpuGauge, cpuCores, gpuGauge, memory, network, volume } = __m(117);
const { audioOf, spectrumOf, metricOf, seriesOf, sysOf, bytesText, rateText, mediaOf, calendarOf } = __m(116);
const { colorAt, bandPath, smoothLine } = __m(283);
const { expand } = __m(290);
__e(__ns, { "WIDGETS": () => WIDGETS, "WIDGET_KINDS": () => WIDGET_KINDS, "WIDGET_DATA": () => WIDGET_DATA, "widgetScreen": () => widgetScreen, "galleonOf": () => galleonOf }, [], ["WIDGETS","WIDGET_DATA","WIDGET_KINDS","galleonOf","widgetScreen"]);
const MIN = 60000;
const audioWidget = (ctx) => (p, W) => {
const A = audioOf(ctx, { count: 150, rate: 30 });
const db = A.level > 0 ? Math.round((1 - A.level) * -60) : null;
header(p, W, 'Audio', A.live ? (db === null ? 'silent' : `${db} dB`) : 'demo');
const top = W.eyebrowY + W.pad * 0.8, bot = W.footY - W.u * 5.5;
const mid = (top + bot) / 2, amp = (bot - top) / 2;
const seconds = 4, N = A.levels.length, step = Math.max(2, W.w / 90);
const up = [], dn = [];
for (let x = W.x1; x >= W.x0 - 0.01; x -= step) {
const age = ((W.x1 - x) / W.w) * seconds;
const idx = N - 1 - (age * A.rate - (A.frac || 0));
const i = Math.max(0, Math.min(N - 1, Math.round(idx)));
const v = idx < -0.5 ? 0 : A.levels[i];
const a = amp * (0.04 + 0.96 * expand(v) ** 0.9);
up.push([x, mid - a]); dn.push([x, mid + a]);
}
const g = p.id('aw');
p.def(`<linearGradient id="${g}" x1="${n(W.x1)}" y1="0" x2="${n(W.x0)}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${colorAt(ctx, 'auto', 1)}"/><stop offset="0.6" stop-color="${colorAt(ctx, 'auto', 0.5)}" stop-opacity="0.7"/><stop offset="1" stop-color="${colorAt(ctx, 'auto', 0.1)}" stop-opacity="0.25"/></linearGradient>`);
p.add(path(bandPath(up, dn), { fill: `url(#${g})`, fillOpacity: p.dark ? 0.75 : 0.65 }));
p.add(path(smoothLine(up) + smoothLine(dn), { fill: 'none', stroke: `url(#${g})`, strokeWidth: n(Math.max(1.25, W.u * 0.5)), strokeLinejoin: 'round' }));
p.add(rect({ x: W.x0, y: mid - 0.5, width: W.w, height: 1, fill: p.colors.beam || (p.dark ? '#ffffff' : p.colors.ink), fillOpacity: 0.25 }));
const mh = Math.max(5, Math.round(W.u * 2.2));
segmented(p, { x: W.x0, y: W.footY - mh, w: W.w, h: mh, value: A.level, count: 30, color: colorAt(ctx, 'auto', 0.85) });
};
const spectrumWidget = (ctx, { bands = 24 } = {}) => (p, W) => {
const S = spectrumOf(ctx, bands);
header(p, W, 'Spectrum', S.live ? `${bands} bands` : 'demo');
const top = W.eyebrowY + W.pad * 0.9, bot = W.footY, hh = bot - top;
const gap = Math.max(2, (W.w / bands) * 0.3), bw = (W.w - gap * (bands - 1)) / bands, r = Math.min(bw / 2, 3);
let tr = '';
const fills = [];
for (let i = 0; i < bands; i++) {
const x = W.x0 + i * (bw + gap), bh = Math.max(bw * 0.6, hh * S.bands[i]);
tr += roundRectPath(x, top, bw, hh, r);
fills.push(path(roundRectPath(x, bot - bh, bw, bh, r), { fill: colorAt(ctx, 'auto', i / (bands - 1)) }));
const py = bot - hh * S.peaks[i] - 2;
fills.push(rect({ x, y: Math.max(top, py), width: bw, height: 2, rx: 1, fill: p.dark ? '#ffffff' : p.colors.ink, fillOpacity: 0.8 }));
}
p.add(path(tr, { fill: p.colors.line, fillOpacity: 0.35 }));
p.add(fills.join(''));
};
const diskWidget = (ctx) => (p, W) => {
const v = metricOf(ctx, 'disk'), sys = sysOf(ctx);
header(p, W, 'Disk', Number.isFinite(sys.diskFree) ? `${bytesText(sys.diskFree)} free` : '');
const s = stat(p, { value: v === null ? '—' : Math.round(v * 100), unit: v === null ? '' : '%', xl: W.x0, base: Math.round(p.h * 0.6) });
const bh = Math.max(6, Math.round(W.u * 2.6));
meter(p, { x: W.x0, y: W.footY - bh, w: W.w * 0.5, h: bh, value: v ?? 0, color: v !== null && v > 0.9 ? p.colors.warn : undefined });
const rd = seriesOf(ctx, 'read', 28, 0.5), wr = seriesOf(ctx, 'write', 28, 0.5);
const sx = Math.max(s.right + W.u * 6, W.x0 + W.w * 0.58), box = { x: sx, y: W.eyebrowY + W.pad * 0.9, w: W.x1 - sx, h: W.footY - W.eyebrowY - W.pad * 2.2 };
spark(p, rd.values, { ...box, shift: ctx.reduced ? 0 : rd.frac || 0, area: 0.14 });
spark(p, wr.values, { ...box, shift: ctx.reduced ? 0 : wr.frac || 0, area: 0, head: false, color: p.theme.spectral(HUE.amber), width: Math.max(1.5, W.u * 0.6) });
const io = Number.isFinite(sys.diskRead) || Number.isFinite(sys.diskWrite) ? (sys.diskRead || 0) + (sys.diskWrite || 0) : null;
p.caption(io === null ? '' : `IO ${rateText(io)}`, { align: 'right', x: W.x1, y: W.footY, color: 'muted', maxWidth: W.x1 - sx });
};
const mediaWidget = (ctx) => (p, W) => {
const live = ctx.data && Object.hasOwn(ctx.data, 'media');
const m = live && ctx.data.media === null ? null : mediaOf(ctx);
header(p, W, m?.playing ? 'Now playing' : 'Paused', m?.album || '');
const art = Math.round(W.footY - W.eyebrowY - W.pad * 0.9);
const ay = W.footY - art;
if (!m) { p.label('Nothing playing', { align: 'left', x: W.x0, y: p.h * 0.58, color: 'muted' }); return; }
coverArt(p, { x: W.x0, y: ay, size: art, title: m.title, artist: m.artist });
const tx = W.x0 + art + W.u * 6, tw = W.x1 - tx;
const ls = p.typeStyle('label'), cs = p.typeStyle('caption');
const f = m.duration > 0 ? clamp(m.position / m.duration) : 0;
const bh = Math.max(5, Math.round(W.u * 2)), my = W.footY - bh - cs.size * 1.4;
const ty = ay + capHeight(ls.size * 1.15, ls.weight) + W.u, ay2 = ty + ls.size * 1.25;
p.label(m.title, { align: 'left', x: tx, y: ty, size: ls.size * 1.15, maxWidth: tw });
if (ay2 + cs.size * 0.3 < my - W.u) p.caption(m.artist, { align: 'left', x: tx, y: ay2, color: 'muted', maxWidth: tw });
meter(p, { x: tx, y: my, w: tw, h: bh, value: f });
p.caption(mmss(m.position), { align: 'left', x: tx, y: W.footY, color: 'muted' });
p.caption(`–${mmss(Math.max(0, m.duration - m.position))}`, { align: 'right', x: W.x1, y: W.footY, color: 'dim' });
};
const nextWidget = (ctx, { hour12 = false } = {}) => (p, W) => {
const cal = calendarOf(ctx);
const now = ctx.now, cur = cal.current && cal.current.end > now ? cal.current : null, ev = cur || cal.next;
if (!ev) { header(p, W, 'Calendar', ''); p.label('Nothing next', { align: 'left', x: W.x0, y: p.h * 0.58, color: 'muted' }); return; }
const t = localParts(ctx, ev.at);
header(p, W, cur ? 'Now' : 'Next', `${hhmm(t.h, t.m, hour12)}`);
const mins = Math.max(0, Math.ceil(((cur ? ev.end : ev.at) - now) / MIN));
const soon = !cur && mins <= 5;
const big = mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : `${mins}`;
const bh = Math.max(5, Math.round(W.u * 2)), cs = p.typeStyle('caption');
const s = stat(p, { value: big, unit: mins >= 60 ? 'h' : 'min', xl: W.x0, base: Math.round(p.h * 0.6), color: soon ? 'warn' : undefined });
p.caption(cur ? 'left' : soon ? 'starting soon' : '', { align: 'right', x: W.x1, y: s.base, color: soon ? 'warn' : 'dim' });
p.label(ev.title, { align: 'left', x: W.x0, y: W.footY - bh - cs.size * 0.9, size: cs.size * 1.15, maxWidth: W.w, color: cur ? 'ink' : 'muted' });
const span = cur ? (ev.end - ev.at) : 60 * MIN;
const f = cur ? clamp((now - ev.at) / span) : clamp(1 - (ev.at - now) / span);
meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: f, color: soon ? p.colors.warn : undefined });
};
const volFrom = (ctx, params) => { const m = ctx.data?.media, lv = ctx.data?.volume; return clamp(Number.isFinite(ctx.turnAge) && typeof ctx.value === 'number' ? ctx.value : typeof lv?.level === 'number' ? lv.level : typeof m?.volume === 'number' ? m.volume : params?.volume ?? 0.62); };
const WIDGETS = {
clock: { title: 'Clock', hue: HUE.periwinkle, data: ['clock', 'calendar'], paint: (ctx, o) => clock(ctx, { hour12: !!o.hour12 }) },
next: { title: 'Next Event', hue: HUE.citrine, data: ['calendar', 'clock'], paint: (ctx, o) => nextWidget(ctx, { hour12: !!o.hour12 }) },
media: { title: 'Now Playing', hue: HUE.rose, data: ['media'], paint: (ctx) => mediaWidget(ctx) },
volume: { title: 'Volume', hue: HUE.citrine, data: ['media', 'volume'], paint: (ctx, o) => volume(ctx, { value: volFrom(ctx, o), muted: typeof ctx.data?.volume?.muted === 'boolean' ? ctx.data.volume.muted : !!ctx.data?.media?.muted }) },
audio: { title: 'Audio', hue: HUE.mint, data: ['audio'], paint: (ctx) => audioWidget(ctx) },
spectrum: { title: 'Spectrum', hue: HUE.cyan, data: ['spectrum'], paint: (ctx) => spectrumWidget(ctx) },
cpu: { title: 'CPU', hue: HUE.violet, data: ['cpu'], paint: (ctx) => cpuGauge(ctx) },
cores: { title: 'CPU Cores', hue: HUE.violet, data: ['cpu', 'temp'], paint: (ctx, o) => cpuCores(ctx, { fahrenheit: !!o.fahrenheit }) },
gpu: { title: 'GPU', hue: HUE.jade, data: ['gpu'], paint: (ctx) => gpuGauge(ctx) },
memory: { title: 'Memory', hue: HUE.cyan, data: ['mem'], paint: (ctx) => memory(ctx) },
network: { title: 'Network', hue: HUE.azure, data: ['net', 'uptime'], paint: (ctx) => network(ctx) },
disk: { title: 'Disk', hue: HUE.amber, data: ['disk'], paint: (ctx) => diskWidget(ctx) },
};
const WIDGET_KINDS = Object.keys(WIDGETS);
const WIDGET_DATA = [...new Set(Object.values(WIDGETS).flatMap((w) => w.data))];
function widgetScreen(ctx, kind, { tone = 'idle', active = false } = {}) {
const W0 = WIDGETS[kind] || WIDGETS.clock;
const scr = surface(ctx);
scr.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
panelInto(scr, { x: 0, y: 0, w: ctx.w, h: ctx.h }, (p) => {
p.background({ tone });
W0.paint(ctx, ctx.params)(p, frameOf(p));
if (active) activeMark(p);
}, { kind: 'screen', tag: 'w', hue: W0.hue });
return scr.svg();
}
function galleonOf(ctx, kinds) {
const k = (l, d) => WIDGETS[kinds[l][d]] || WIDGETS.clock;
return galleon(ctx, surface(ctx), [[k(0, 0).paint(ctx, ctx.params), k(0, 1).paint(ctx, ctx.params)], [k(1, 0).paint(ctx, ctx.params), k(1, 1).paint(ctx, ctx.params)]], { hues: [[k(0, 0).hue, k(0, 1).hue], [k(1, 0).hue, k(1, 1).hue]] });
}
};
__d[292] = function (__ns) {
const { WIDGET_KINDS, WIDGET_DATA, galleonOf } = __m(291);
const { GALLEON_PARAMS } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const slot = (def, label) => ({ type: 'select', default: def, options: WIDGET_KINDS, label });
const __default = {
id: 'app-galleon-mix',
title: 'Galleon Mix',
category: 'Dashboards',
description: 'The Galleon 100 SD screen with per-widget routing: audio, spectrum, media, system, clock or your next meeting. Each is live from its source in the plugin, else simulated.',
tags: ['galleon', 'corsair', 'screen', 'dashboard', 'routing', 'widgets', 'audio', 'spectrum', 'system'],
surface: 'screen',
screens: ['galleon'],
data: WIDGET_DATA,
fps: 8,
loop: 16,
params: {
dial0Top: slot('clock', 'Left dial · top layer'),
dial1Top: slot('volume', 'Right dial · top layer'),
dial0Bottom: slot('audio', 'Left dial · bottom layer'),
dial1Bottom: slot('spectrum', 'Right dial · bottom layer'),
...GALLEON_PARAMS,
hour12: { type: 'bool', default: false, label: '12-hour clock' },
volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (when no source sends one)' },
},
order: 20,
render(ctx) {
const p = ctx.params;
return galleonOf(ctx, [[p.dial0Top, p.dial1Top], [p.dial0Bottom, p.dial1Bottom]]);
},
};
};
__d[293] = function (__ns) {
const { WIDGETS, widgetScreen } = __m(291);
__e(__ns, { "default": () => __default }, [], ["default"]);
const FPS = { clock: 2, next: 1, media: 2, volume: 4, audio: 12, spectrum: 12, cpu: 4, cores: 4, gpu: 4, memory: 2, network: 4, disk: 2 };
const BLURB = {
clock: 'The time as the hero, the date as an instrument label and your next event (from an .ics calendar, else demo). Real time.',
next: 'Your next meeting as a countdown, its title, and a beam over the last hour. From a local .ics calendar; simulated until you set one.',
media: 'Now playing: generated cover art, title, artist and the track\'s progress. Live via playerctl on Linux; simulated elsewhere.',
volume: 'Volume on the Galleon\'s notched dial: a speaker glyph at its level and a 24-notch meter. Turn the dial; shows the level only (no system control).',
audio: 'The waveform scrolling across the widget over a 30-segment level meter. Live from sound capture in the plugin; else simulated.',
spectrum: 'A 24-band spectrum analyzer with falling peak caps, low to high across the Spectrum. Live from sound capture in the plugin; else simulated.',
cpu: 'CPU load as a gauge with its last 15 seconds of history. Live in the plugin (system source); simulated on the web.',
cores: 'CPU load as the hero number, every core as a column, plus the temperature (Linux). Live in the plugin (system source); else simulated.',
gpu: 'GPU load as a gauge with its history. Live in the plugin where the system source can read the GPU; simulated on the web.',
memory: 'Memory in use in binary units, with a meter of the total. Live in the plugin (system source); simulated on the web.',
network: 'Download and upload rates with both histories scrolling. Live in the plugin (system source); simulated on the web.',
disk: 'Disk space used, free space and read / write activity. Live in the plugin (system source); simulated on the web.',
};
const TAGS = { clock: ['clock', 'time', 'date'], next: ['calendar', 'meeting', 'countdown'], media: ['media', 'now playing', 'music'], volume: ['volume', 'audio'], audio: ['audio', 'waveform', 'level'], spectrum: ['audio', 'spectrum', 'analyzer'], cpu: ['cpu', 'system'], cores: ['cpu', 'cores', 'system'], gpu: ['gpu', 'system'], memory: ['memory', 'ram', 'system'], network: ['network', 'system'], disk: ['disk', 'storage', 'system'] };
const params = (kind) => ({
...(kind === 'clock' || kind === 'next' ? { hour12: { type: 'bool', default: false, label: '12-hour clock' } } : {}),
...(kind === 'volume' ? { volume: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Volume (until the dial turns)' } } : {}),
...(kind === 'cores' ? { fahrenheit: { type: 'bool', default: false, label: 'Fahrenheit' } } : {}),
active: { type: 'bool', default: false, label: 'Mark as the active layer' },
});
const __default = Object.entries(WIDGETS).map(([kind, W], i) => ({
id: `app-widget-${kind}`,
title: `${W.title} Widget`,
category: 'Dashboards',
description: `Galleon widget: ${BLURB[kind]}`.slice(0, 180),
tags: ['galleon', 'widget', 'screen', ...TAGS[kind]],
surface: 'screen',
screens: ['galleon-widget'],
data: W.data,
fps: FPS[kind],
loop: kind === 'clock' || kind === 'next' ? 60 : 12,
params: params(kind),
order: 40 + i,
render(ctx) { return widgetScreen(ctx, kind, { active: ctx.params.active }); },
}));
};
__d[294] = function (__ns) {
const { surface, rect, path, circle, n, arcPath, roundRectPath } = __m(113);
const { clockText } = __m(11);
const { arrive, pulse, clamp } = __m(12);
const { mediaOf, audioOf, calendarOf } = __m(116);
const { colorAt, glowDot } = __m(283);
const { coverArt, pictogram, hhmm, localParts } = __m(114);
const { mutedPlate, strike } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const big = (k) => Math.min(k.w, k.h) >= 110;
const MIN = 60000;
function hand(g, s) {
const tops = [13, 9.5, 10.5, 14];
for (let i = 0; i < 4; i++) { const x0 = 15 + i * 4.5; g.path(`M${x0} 28V${tops[i] + 2.25}A2.25 2.25 0 0 1 ${x0 + 4.5} ${tops[i] + 2.25}V28`, { role: 'line', join: 'round' }); }
g.path('M15 26V33.5C15 38.5 19 42 24 42C29 42 33 38.5 33 33.5V26', { role: 'line' });
g.path('M15 34L10.4 28.6A2.4 2.4 0 0 1 14 25.4L15 26.6', { role: 'line', join: 'round' });
if (s.state === 'raised') { g.arc(24, 24, 17, -58, -36, { role: 'accent' }); g.arc(24, 24, 17, 36, 58, { role: 'accent' }); }
}
function handset(g, s) {
const drop = s.drop || 0;
g.group({ x: 0, y: drop * 6, rotate: drop * 8, origin: [24, 26] }, (q) => {
q.path('M8.5 27.5C14 21 34 21 39.5 27.5L37.4 31.4C37 32.2 36 32.5 35.2 32.1L31.2 30C30.6 29.7 30.3 29.1 30.3 28.4V25.9C26.2 24.7 21.8 24.7 17.7 25.9V28.4C17.7 29.1 17.4 29.7 16.8 30L12.8 32.1C12 32.5 11 32.2 10.6 31.4Z', { role: 'line', join: 'round' });
});
}
const boxOf = (k, labeled = true) => k.theme.glyphBox(k, { labeled });
const nowPlaying = {
id: 'app-now-playing', title: 'Now Playing', category: 'Audio',
description: 'Now playing: generated cover art and the track progress as a beam. Live via playerctl on Linux, simulated elsewhere. A press flips the look; it sends no media key.',
tags: ['media', 'now playing', 'music', 'cover art', 'progress', 'play', 'pause', 'stream', 'streaming', 'song'],
surface: 'key', data: ['media'], fps: 2, loop: 30,
states: ['playing', 'paused'], tones: { playing: 'active', paused: 'idle' }, press: 'toggle',
params: {},
order: 40,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const live = ctx.data && Object.hasOwn(ctx.data, 'media');
const m = live && ctx.data.media === null ? null : mediaOf(ctx, { playing: ctx.stateName !== 'paused' });
const playing = m ? (live ? !!m.playing : ctx.stateName !== 'paused') : false;
k.background({ tone: m ? 'idle' : 'off' });
if (!m) { k.glyph('music-note', { state: undefined, labeled: true }); k.label('Nothing', { color: 'muted' }); return k.svg(); }
const inset = k.m.safe, size = Math.min(w, h) - inset * 2, x = (w - size) / 2, y = (h - size) / 2;
coverArt(k, { x, y, size, title: m.title, artist: m.artist, radius: k.m.radius * 0.7 });
const sid = k.id('scrim');
k.def(`<linearGradient id="${sid}" x1="0" y1="${n(y + size * 0.45)}" x2="0" y2="${n(y + size)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.62"/></linearGradient>`);
k.add(path(roundRectPath(x, y, size, size, k.m.radius * 0.7), { fill: `url(#${sid})` }));
const f = m.duration > 0 ? clamp(m.position / m.duration) : 0;
const by = y + size - k.m.u * 5, bx = x + k.m.u * 5, bw = size - k.m.u * 10;
k.add(rect({ x: bx, y: by, width: bw, height: Math.max(1.5, k.m.line), rx: k.m.line / 2, fill: '#ffffff', fillOpacity: 0.28 }));
k.add(rect({ x: bx, y: by, width: Math.max(1.5, bw * f), height: Math.max(1.5, k.m.line), rx: k.m.line / 2, fill: '#ffffff' }));
if (playing) k.add(glowDot(k, { cx: bx + bw * f, cy: by + k.m.line / 2, r: k.m.line * 1.2, color: '#ffffff', opacity: 0.8 }));
if (big(k)) k.text('caption', m.title, { align: 'left', x: bx, y: by - k.m.u * 3.5, maxWidth: bw, color: '#ffffff', size: k.m.u * 9 });
if (!playing) {
const cs = size * 0.26, cx = x + size / 2, cy = y + size * 0.44;
k.add(circle({ cx, cy, r: cs / 2, fill: '#000000', fillOpacity: 0.55 }));
k.add(rect({ x: cx - cs * 0.16, y: cy - cs * 0.2, width: cs * 0.1, height: cs * 0.4, rx: cs * 0.03, fill: '#ffffff' }) + rect({ x: cx + cs * 0.06, y: cy - cs * 0.2, width: cs * 0.1, height: cs * 0.4, rx: cs * 0.03, fill: '#ffffff' }));
}
return k.svg();
},
};
const ACTIONS = { 'play-pause': { glyph: 'play-pause', label: 'Play' }, next: { glyph: 'skip-next', label: 'Next' }, previous: { glyph: 'skip-prev', label: 'Back' }, stop: { glyph: 'stop', label: 'Stop' } };
const mediaKey = {
id: 'app-media-key', title: 'Media Key', category: 'Controls',
description: 'A transport key (play / pause, next, previous, stop) that follows the player: live via playerctl on Linux, simulated elsewhere. Shows state; it sends no media keys yet.',
tags: ['media', 'transport', 'play', 'pause', 'next', 'previous', 'controls', 'music'],
surface: 'key', data: ['media'], fps: 2, loop: 30,
params: { action: { type: 'select', default: 'play-pause', options: Object.keys(ACTIONS), label: 'Action' } },
order: 41,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const A = ACTIONS[p.action] || ACTIONS['play-pause'];
const live = ctx.data && Object.hasOwn(ctx.data, 'media');
const m = live && ctx.data.media === null ? null : mediaOf(ctx);
const playing = !!m?.playing;
const isPlay = p.action === 'play-pause';
k.background({ tone: isPlay && playing ? 'active' : m ? 'idle' : 'off' });
k.glyph(A.glyph, { state: isPlay ? (playing ? 'playing' : 'paused') : undefined, labeled: true });
if (isPlay && m && m.duration > 0) {
const f = clamp(m.position / m.duration), r = Math.min(w, h) / 2 - k.m.u * 2.6;
k.add(path(arcPath(w / 2, h / 2, r, 0, 359.9), { fill: 'none', stroke: k.colors.line, strokeWidth: n(Math.max(1, k.m.hair * 1.2)), strokeOpacity: 0.7 }));
if (f > 0.003) k.add(path(arcPath(w / 2, h / 2, r, 0, 360 * f), { fill: 'none', stroke: colorAt(ctx, 'auto', 0.7), strokeWidth: n(Math.max(1.25, k.m.line)), strokeLinecap: 'round' }));
}
k.label(isPlay ? (playing ? 'Pause' : 'Play') : A.label, { color: m ? 'ink' : 'muted' });
return k.svg();
},
};
const mic = {
id: 'app-meeting-mic', title: 'Meeting Mic', category: 'Controls',
description: 'Your mic in a call: a halo follows your voice; muted, the key turns red and says MUTED. Shows state only (it does not mute your call yet); linked mic keys follow.',
tags: ['meeting', 'call', 'mic', 'microphone', 'mute', 'voice', 'controls', 'stream', 'streaming', 'muted', 'microphone mute'],
surface: 'key', data: ['audio'], fps: 8, loop: 4,
states: ['live', 'muted'], tones: { live: 'active', muted: 'neg' }, press: 'toggle',
link: { 'mic.muted': { live: false, muted: true } },
params: { threshold: { type: 'number', default: 0.55, min: 0.1, max: 0.95, step: 0.05, label: 'Talking-while-muted level' } },
order: 50,
render(ctx) {
const k = surface(ctx);
const { w, h, t, params: p } = ctx;
const muted = typeof ctx.data?.mic?.muted === 'boolean' ? ctx.data.mic.muted : ctx.stateName === 'muted';
const A = audioOf(ctx, { count: 8 });
const speaking = muted && A.live && A.level >= p.threshold;
k.background({ tone: speaking ? 'warn' : muted ? 'neg' : 'active' });
if (muted) mutedPlate(k, { since: ctx.since });
if (!muted) {
const lv = A.live ? A.level : 0.35 + 0.3 * pulse(t, 1.3) * pulse(t, 0.37);
const r0 = Math.min(w, h) * 0.22, cx = w / 2, cy = h * 0.42;
for (let i = 0; i < 3; i++) {
const r = r0 + k.m.u * (4 + i * 3.6) * clamp(lv * 1.3);
k.add(path(arcPath(cx, cy, r, 200, 340), { fill: 'none', stroke: ctx.tint, strokeWidth: n(Math.max(1, k.m.line * (1 - i * 0.25))), strokeOpacity: n(0.6 - i * 0.18, 2), strokeLinecap: 'round' }));
k.add(path(arcPath(cx, cy, r, 20, 160), { fill: 'none', stroke: ctx.tint, strokeWidth: n(Math.max(1, k.m.line * (1 - i * 0.25))), strokeOpacity: n(0.6 - i * 0.18, 2), strokeLinecap: 'round' }));
}
}
k.glyph('mic', { state: muted ? 'off' : 'on', labeled: true });
if (muted) strike(k, boxOf(k), { since: ctx.since });
k.label(speaking ? 'SPEAKING?' : muted ? 'MUTED' : 'Live', { color: 'ink' });
return k.svg();
},
};
const camera = {
id: 'app-meeting-camera', title: 'Meeting Camera', category: 'Controls',
description: 'Your camera in a call: on with an on-air tally, off in red. Shows state only (it does not switch your camera); linked camera keys follow.',
tags: ['meeting', 'call', 'camera', 'video', 'webcam', 'controls', 'stream', 'streaming'],
surface: 'key', fps: 2, loop: 4,
states: ['on', 'off'], tones: { on: 'active', off: 'neg' }, press: 'toggle',
link: { 'camera.on': { on: true, off: false } },
params: {},
order: 51,
render(ctx) {
const k = surface(ctx);
const { w, t } = ctx;
const on = typeof ctx.data?.camera?.on === 'boolean' ? ctx.data.camera.on : ctx.stateName === 'on';
k.background({ tone: on ? 'active' : 'neg' });
k.glyph('camera', { state: on ? 'on' : 'off', labeled: true });
if (on) { const r = Math.max(2, k.m.u * 2.6), cx = w - k.m.text - r, cy = k.m.text + r; k.add(glowDot(k, { cx, cy, r, color: k.colors.neg, opacity: ctx.reduced ? 0.8 : 0.55 + 0.45 * pulse(t, 2) })); }
k.label(on ? 'Camera' : 'Cam off');
return k.svg();
},
};
const raise = {
id: 'app-meeting-hand', title: 'Raise Hand', category: 'Controls',
description: 'Raise your hand in a call: raised, the hand waves gently in amber until you lower it. Shows state only; no meeting-app source is connected yet.',
tags: ['meeting', 'call', 'raise hand', 'hand', 'question', 'controls'],
surface: 'key', fps: 8, loop: 1.6,
states: ['down', 'raised'], tones: { down: 'idle', raised: 'warn' }, press: 'toggle',
params: {},
order: 52,
render(ctx) {
const k = surface(ctx);
const raised = ctx.stateName === 'raised';
k.background({ tone: raised ? 'warn' : 'idle' });
const b = boxOf(k);
const wave = raised && !ctx.reduced ? Math.sin((ctx.t / 1.6) * Math.PI * 2) * 7 * arrive(ctx.since, 0.5) : 0;
const lift0 = raised ? (1 - arrive(ctx.since, 0.4)) * 6 : 0;
pictogram(k, (g, s) => g.group({ rotate: wave, origin: [24, 42], y: lift0 }, (q) => hand(q, s)), { x: b.x, y: b.y, size: b.size, tone: raised ? 'warn' : 'idle', state: raised ? 'raised' : 'down', tag: 'hand' });
k.label(raised ? 'Hand up' : 'Raise');
return k.svg();
},
};
const leave = {
id: 'app-meeting-leave', title: 'Leave Call', category: 'Controls',
description: 'The hang-up key: red, with the meeting you are in and how long it has run (from a local .ics calendar, else demo). Shows state only; it ends no call.',
tags: ['meeting', 'call', 'leave', 'hang up', 'end call', 'controls'],
surface: 'key', data: ['calendar'], fps: 4, loop: 4, press: 'momentary',
params: {},
order: 53,
render(ctx) {
const k = surface(ctx);
const { w } = ctx;
const cal = calendarOf(ctx);
const cur = cal.current && cal.current.end > ctx.now ? cal.current : null;
k.background({ tone: 'neg' });
const b = boxOf(k);
const drop = ctx.pressed ? 1 : ctx.pressAge < 0.6 ? 1 - arrive(ctx.pressAge, 0.6) : 0;
pictogram(k, (g, s) => handset(g, { ...s, drop }), { x: b.x, y: b.y, size: b.size, tone: 'neg', tag: 'leave' });
if (cur && big(k)) k.caption(clockText((ctx.now - cur.at) / 1000), { align: 'right', x: w - k.m.text, y: k.m.text + k.m.u * 6, color: 'muted' });
k.label(ctx.pressed || ctx.pressAge < 0.6 ? 'Leaving' : 'Leave');
return k.svg();
},
};
const nextMeeting = {
id: 'app-next-meeting', title: 'Next Meeting', category: 'Dashboards',
description: 'Your next meeting as a countdown ring over the last hour, amber in the final five minutes, then Join. From a local .ics calendar; simulated until you set one.',
tags: ['meeting', 'calendar', 'agenda', 'countdown', 'next', 'reminder'],
surface: 'key', data: ['calendar', 'clock'], fps: 1, loop: 60,
params: { hour12: { type: 'bool', default: false, label: '12-hour clock' } },
order: 54,
render(ctx) {
const k = surface(ctx);
const { w, h, t, params: p } = ctx;
const cal = calendarOf(ctx), now = ctx.now;
const cur = cal.current && cal.current.end > now ? cal.current : null, ev = cur || cal.next;
if (!ev) { k.background({ tone: 'off' }); k.glyph('calendar', { state: 'date', labeled: true }); k.label('Free'); return k.svg(); }
const toStart = (ev.at - now) / MIN;
const joining = !cur && toStart <= 1, soon = !cur && toStart <= 5;
const tone = cur ? 'active' : joining ? 'alert' : soon ? 'warn' : 'idle';
k.background({ tone });
const m = Math.min(w, h), cx = w / 2, cy = h * 0.43, r = m * 0.3, sw = k.m.bold * 0.75;
const f = cur ? clamp((now - ev.at) / (ev.end - ev.at)) : clamp(1 - toStart / 60);
const c = tone === 'idle' ? colorAt(ctx, 'auto', 0.75) : k.tone(tone);
k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(sw * 0.6) }));
if (f > 0.003) k.add(path(arcPath(cx, cy, r, 0, 360 * f), { fill: 'none', stroke: c, strokeWidth: n(sw), strokeLinecap: 'round' }));
if (joining && !ctx.reduced) k.add(circle({ cx, cy, r: r * 0.86, fill: c, fillOpacity: n(0.06 + 0.1 * pulse(t, 1), 3) }));
const mins = Math.max(0, Math.ceil(cur ? (ev.end - now) / MIN : toStart));
const lt = localParts(ctx, ev.at);
const big1 = joining ? 'Join' : mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}`;
k.value(big1, { cy, size: k.m.u * (joining ? 13 : 16), maxWidth: r * 1.5, color: tone === 'idle' ? 'ink' : 'tone' });
if (!joining) k.caption(cur ? 'min left' : mins >= 60 ? hhmm(lt.h, lt.m, p.hour12) : 'min', { y: cy + r * 0.62, maxWidth: r * 1.4, color: 'muted', size: k.m.u * 7.5 });
k.label(ev.title, { color: cur ? 'ink' : 'muted' });
return k.svg();
},
};
const __default = [nowPlaying, mediaKey, mic, camera, raise, leave, nextMeeting];
};
__d[295] = function (__ns) {
const { surface, rect, path, n, P } = __m(113);
const { clamp } = __m(12);
const { mix } = __m(4);
const { audioOf } = __m(116);
const { text, isBig } = __m(195);
const { mutedPlate, strike } = __m(137);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'app-mic-meter',
title: 'Mic Level',
category: 'Audio',
description: 'A broadcast LED ladder for your mic, green to red with peak hold. Press: MUTED (shows state only; linked mic keys follow). Level: sound capture, else demo.',
tags: ['mic', 'microphone', 'level', 'meter', 'vu', 'mute', 'audio', 'stream', 'podcast', 'streaming', 'broadcast', 'muted', 'obs-style'],
surface: 'key',
data: ['audio', 'mic'],
fps: 8,
loop: 8,
states: ['live', 'muted'],
tones: { live: 'idle', muted: 'neg' },
press: 'toggle',
link: { 'mic.muted': { live: false, muted: true } },
params: {
label: { type: 'text', default: 'Mic', maxLength: 10, label: 'Label' },
hue: { type: 'hue', default: 150, min: 0, max: 360, label: 'Hue' },
},
order: 12,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const mic = ctx.data?.mic;
const muted = mic && typeof mic.muted === 'boolean' ? mic.muted : ctx.stateName === 'muted';
const A = audioOf(ctx, { count: 90, rate: 30 });
const level = clamp(A.level), peak = clamp(Math.max(A.peak ?? level, level));
const recent = A.levels.slice(-60);
let clipAge = Infinity;
for (let i = recent.length - 1; i >= 0; i--) if (recent[i] >= 0.97) { clipAge = (recent.length - 1 - i) / (A.rate || 30); break; }
const clipped = !muted && clipAge < 2;
const talking = muted && A.live && level > 0.55; 
k.background({ tone: muted ? 'neg' : 'idle' });
if (muted) mutedPlate(k, { since: ctx.since });
const big = isBig(k);
const N = big ? 18 : 12;
const lx = w - k.m.safe - Math.round(w * (big ? 0.2 : 0.24)), lw = Math.round(w * (big ? 0.2 : 0.24));
const ly0 = k.m.safe + (big ? 9 : 7) * u, ly1 = h - k.m.safe;
const segH = (ly1 - ly0) / N, gap = Math.max(1, segH * 0.28);
const zone = (i) => (i >= N - 2 ? 'neg' : i >= N - 6 ? 'warn' : 'pos');
const lit = { pos: '', warn: '', neg: '' };
let off = '';
const peakI = Math.min(N - 1, Math.floor(peak * N - 0.001));
for (let i = 0; i < N; i++) {
const y = ly1 - (i + 1) * segH + gap / 2;
const on = !muted && level * N > i + 0.15;
const isPeak = !muted && i === peakI && peak > 0.05;
const d = `M${n(lx)} ${n(y)}h${n(lw)}v${n(segH - gap)}h${n(-lw)}Z`;
if (on || isPeak) lit[zone(i)] += d; else off += d;
}
const glass = muted ? mix(C.surface2, C.line, 0.5) : mix(C.surface2, C.line, 0.6);
if (off) k.add(path(off, { fill: glass, fillOpacity: k.dark ? 0.8 : undefined }));
for (const z of ['pos', 'warn', 'neg']) if (lit[z]) k.add(path(lit[z], { fill: C[z] }));
const cy0 = k.m.safe + (big ? 1.5 : 0.8) * u, chH = (big ? 6 : 5) * u;
k.add(rect({ x: n(lx), y: n(cy0), width: n(lw), height: n(chH), rx: n(chH * 0.3), fill: clipped ? C.neg : glass }));
if (big) text(k, 'CLIP', { x: lx + lw / 2, cy: cy0 + chH / 2, size: chH * 0.62, weight: 700, tracking: 0.08, color: clipped ? '#ffffff' : C.dim });
const room = lx - k.m.safe - u * 3;
const gs = Math.min(room, h * (big ? 0.46 : 0.5));
const gx = k.m.safe + (room - gs) / 2, gy = big ? k.m.safe + 6 * u : k.m.safe * 0.6;
k.glyph('mic', { box: { x: gx, y: gy, size: gs }, state: muted ? 'off' : 'on', since: 9, tone: muted ? 'neg' : 'active', level });
if (muted) strike(k, { x: gx, y: gy, size: gs }, { since: ctx.since });
const cx = k.m.safe + room / 2;
if (muted) {
text(k, talking ? 'TALKING?' : 'MUTED', { x: cx, y: h - k.m.safe - (big ? 4 : 2) * u, size: (big ? 12 : 10) * u, weight: 700, tracking: 0.04, color: 'ink', maxWidth: room + u * 2, minSize: 7 * u });
} else {
const db = level > 0.001 ? Math.round((level - 1) * 60) : null;
text(k, db === null ? '—' : db === 0 ? '0' : `−${Math.abs(db)}`, { x: cx, y: h - k.m.safe - (big ? 12 : 3) * u, size: (big ? 17 : 12) * u, weight: 700, tabular: true, color: 'ink', maxWidth: room + u * 2 });
if (big) text(k, 'dB', { x: cx, y: h - k.m.safe - 2 * u, size: 8 * u, weight: 600, caps: true, tracking: 0.1, color: 'muted' });
}
if (big) k.eyebrow(ctx.params.label, { color: muted ? 'ink' : 'muted', maxWidth: room });
return k.svg();
},
};
};
__d[296] = function (__ns) {
const { surface, rect, n, linearGradient, url } = __m(113);
const { pad2 } = __m(11);
const { arrive, clamp, phase } = __m(12);
const { mediaOf, calendarOf } = __m(116);
const { colorAt } = __m(283);
const { hhmm, localParts } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGES = ['clock', 'media', 'meeting'];
const DWELL = 8;
const __default = {
id: 'app-neo-info',
title: 'Neo Info Rotator',
category: 'Dashboards',
description: 'The Neo info bar as a rotating glance: the clock, what is playing and your next meeting, 8 s each. Real clock; media and calendar from their sources, else simulated.',
tags: ['neo', 'info bar', 'clock', 'now playing', 'meeting', 'calendar', 'rotating', 'screen'],
surface: 'screen',
screens: ['infobar'],
data: ['clock', 'media', 'calendar'],
fps: 4,
loop: DWELL * PAGES.length,
params: {
show: { type: 'select', default: 'rotate', options: ['rotate', ...PAGES], label: 'Show' },
hour12: { type: 'bool', default: false, label: '12-hour clock' },
},
order: 30,
render(ctx) {
const k = surface(ctx);
const { w, h, t, params: p } = ctx;
k.background({ tone: 'idle' });
const rot = p.show === 'rotate';
const cyc = rot ? phase(t, DWELL * PAGES.length) * PAGES.length : PAGES.indexOf(p.show);
const page = PAGES[Math.floor(cyc) % PAGES.length];
const into = rot && !ctx.reduced ? (cyc % 1) * DWELL : 9;
const e = arrive(into, 0.5), dx = (1 - e) * 10, op = clamp(0.25 + 0.75 * e);
const x0 = 10 + dx, x1 = w - 10;
const c = ctx.clock;
if (page === 'clock') {
k.value(hhmm(c.h, c.m, p.hour12), { align: 'left', x: x0, cy: h * 0.5, size: 26, opacity: op });
k.eyebrow(`${DAYS[c.dow]} ${c.day} ${MONTHS[c.month - 1]}`, { align: 'right', x: x1, y: h * 0.42, size: 8.5, color: 'muted', opacity: op });
k.caption(`:${pad2(c.s)}`, { align: 'right', x: x1, y: h * 0.74, size: 9, color: 'dim', opacity: op });
} else if (page === 'media') {
const live = ctx.data && Object.hasOwn(ctx.data, 'media');
const m = live && ctx.data.media === null ? null : mediaOf(ctx);
k.eyebrow(m ? (m.playing ? 'Now playing' : 'Paused') : 'Media', { align: 'left', x: x0, y: h * 0.36, size: 8, color: 'muted', opacity: op });
k.label(m ? m.title : 'Nothing playing', { align: 'left', x: x0, y: h * 0.68, size: 13, maxWidth: (x1 - x0) * 0.7, opacity: op, color: m ? 'ink' : 'muted' });
if (m) {
k.caption(m.artist, { align: 'right', x: x1, y: h * 0.68, size: 9.5, color: 'muted', maxWidth: (x1 - x0) * 0.32, opacity: op });
const f = m.duration > 0 ? clamp(m.position / m.duration) : 0;
k.add(rect({ x: x0, y: h - 9, width: (x1 - x0) * f, height: 1.5, fill: colorAt(ctx, 'auto', 0.8), fillOpacity: n(op, 3) }));
}
} else {
const cal = calendarOf(ctx), cur = cal.current && cal.current.end > ctx.now ? cal.current : null, ev = cur || cal.next;
if (!ev) k.label('Nothing next', { align: 'left', x: x0, y: h * 0.6, color: 'muted', opacity: op });
else {
const mins = Math.max(0, Math.ceil(((cur ? ev.end : ev.at) - ctx.now) / 60000)), lt = localParts(ctx, ev.at);
const soon = !cur && mins <= 5;
k.eyebrow(cur ? 'Now' : `Next · ${hhmm(lt.h, lt.m, p.hour12)}`, { align: 'left', x: x0, y: h * 0.36, size: 8, color: soon ? 'warn' : 'muted', opacity: op });
k.label(ev.title, { align: 'left', x: x0, y: h * 0.68, size: 13, maxWidth: (x1 - x0) * 0.66, opacity: op });
k.value(cur ? `${mins}m left` : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`, { align: 'right', x: x1, cy: h * 0.55, size: 14, color: soon ? 'warn' : 'ink', opacity: op });
}
}
if (rot) {
const id = k.id('rot');
const f = cyc / PAGES.length;
k.def(linearGradient(id, [[0, colorAt(ctx, 'auto', 0), 0], [Math.max(0, f - 0.1), colorAt(ctx, 'auto', f), 0.3], [f, k.dark ? '#ffffff' : k.colors.ink, 1], [Math.min(1, f + 0.04), colorAt(ctx, 'auto', f), 0.3], [1, colorAt(ctx, 'auto', 1), 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
k.add(rect({ x: 8, y: h - 3.5, width: w - 16, height: 1.25, fill: url(id) }));
}
return k.svg();
},
};
};
__d[297] = function (__ns) {
const { surface, circle, n } = __m(113);
const { clamp, outExpo, arrive, lerp } = __m(12);
const { polar } = __m(15);
const { text, isBig, progressArc, headDot, burst, mmss } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const STATES = ['ready', 'focus-1', 'break-1', 'focus-2', 'break-2', 'focus-3', 'break-3', 'focus-4'];
const __default = {
id: 'app-pomodoro-set',
title: 'Pomodoro Set',
category: 'Clocks & Timers',
description: 'Four focus rounds, short breaks, a long break: press for the next phase. The ring drains as light and a finished round bursts. The timer runs for real on the key.',
tags: ['pomodoro', 'focus', 'timer', 'break', 'productivity', 'rounds', 'deep work'],
surface: 'key',
fps: 4,
loop: 60,
states: STATES,
tones: { ready: 'idle', 'focus-1': 'active', 'focus-2': 'active', 'focus-3': 'active', 'focus-4': 'active', 'break-1': 'ok', 'break-2': 'ok', 'break-3': 'ok' },
press: 'cycle',
params: {
focus: { type: 'number', default: 25, min: 1, max: 90, step: 1, label: 'Focus minutes' },
rest: { type: 'number', default: 5, min: 1, max: 30, step: 1, label: 'Short break minutes' },
longRest: { type: 'number', default: 15, min: 5, max: 60, step: 1, label: 'Long break minutes' },
hue: { type: 'hue', default: 34.2, min: 0, max: 360, label: 'Hue' },
},
order: 11,
render(ctx) {
const k0 = surface(ctx);
const { w, h } = ctx;
const C = k0.colors, u = k0.m.u;
const name = ctx.stateName || 'ready';
const [kind, numStr] = name.split('-');
const round = Number(numStr) || 0;
const P = ctx.params;
const longBreak = kind === 'ready' && (Number.isFinite(ctx.pressAge) || ctx.pressed) && ctx.since < P.longRest * 60 + 30;
const total = (kind === 'focus' ? P.focus : kind === 'break' ? P.rest : longBreak ? P.longRest : P.focus) * 60;
const timing = kind !== 'ready' || longBreak;
const left = timing ? total - ctx.since : total;
const finished = timing && left <= 0;
const tone = kind === 'focus' ? 'active' : kind === 'break' || longBreak ? 'ok' : 'idle';
const k = k0;
k.background({ tone: finished ? 'ok' : tone });
const big = isBig(k);
const tint = kind === 'focus' ? ctx.tint : C.pos;
const dotsH = big ? 10 * u : 8 * u;
const top = big ? k.m.text + 9 * u : k.m.safe;
const bottom = h - k.m.safe - dotsH;
const R = Math.min((bottom - top) / 2, w / 2 - k.m.safe * 1.1);
const cx = w / 2, cy = (top + bottom) / 2;
const sw = Math.max(1.5, k.m.bold * 0.85);
const enter = ctx.reduced ? 1 : arrive(ctx.since, 0.6);
k.add(progressArc({ cx, cy, r: R, value: 1, color: C.line, width: sw * 0.55 }));
if (!finished) {
const frac = timing ? clamp(left / total) * enter : 1;
if (frac > 0) {
k.add(progressArc({ cx, cy, r: R, value: frac, color: tint, width: sw, opacity: timing ? 1 : 0.4 }));
if (timing) { const [hx, hy] = polar(cx, cy, R, 360 * frac); k.add(headDot(k, hx, hy, sw * 0.55, tint)); }
}
const label = kind === 'focus' ? 'Focus' : kind === 'break' ? 'Break' : longBreak ? 'Rest' : 'Ready';
text(k, label, { cy: cy - R * 0.42, size: (big ? 7.5 : 6.5) * u, weight: 600, caps: true, tracking: 0.1, color: timing ? tint : 'muted', maxWidth: R * 1.5, minSize: 6.5 * u });
text(k, mmss(timing ? Math.ceil(left) : total), { cy: cy + R * 0.08, size: R * 0.56, weight: 700, tabular: true, color: timing ? 'ink' : 'muted', maxWidth: R * 1.55 });
if (!timing) text(k, 'start', { cy: cy + R * 0.5, size: (big ? 8 : 7) * u, weight: 400, color: 'dim', maxWidth: R * 1.4 });
} else {
const a = -left;
k.add(burst(k, { cx, cy, r0: R * 0.5, r1: R * 1.45, age: a, dur: 1.2, count: 12, hue: ctx.hue, spin: 15 }));
const close = ctx.reduced ? 1 : outExpo(clamp(a / 0.5));
k.add(progressArc({ cx, cy, r: R, value: close, color: C.pos, width: sw }));
const g = R * 1.05;
k.glyph('check', { box: { x: cx - g / 2, y: cy - g / 2 - R * 0.12, size: g }, state: 'done', since: a, tone: 'ok' });
const next = kind === 'focus' ? (round === 4 ? 'Long break next' : 'Break next') : kind === 'break' ? `Round ${round + 1} next` : 'Set done';
if (big) k.eyebrow(next, { color: 'pos', maxWidth: w - k.m.text * 2 });
else text(k, kind === 'focus' ? 'Break' : kind === 'break' ? 'Focus' : 'Done', { cy: cy + R * 0.62, size: 6.5 * u, weight: 600, caps: true, tracking: 0.08, color: 'pos' });
if (big && a >= 60) text(k, `+${Math.floor(a / 60)}m`, { cy: cy + R * 0.62, size: 7 * u, color: 'muted', weight: 600, tabular: true });
}
if (big && !finished) k.eyebrow(kind === 'focus' ? `${P.focus} min` : kind === 'break' ? `${P.rest} min` : longBreak ? `${P.longRest} min` : `4 × ${P.focus}`, { color: 'muted' });
const doneCount = kind === 'focus' ? round - 1 : kind === 'break' ? round : longBreak ? 4 : 0;
const dr = Math.max(1.6, 2.1 * u), gap = dr * 3.6;
const dy = h - k.m.safe - dotsH / 2 + u;
for (let i = 0; i < 4; i++) {
const x = cx + (i - 1.5) * gap;
const now = kind === 'focus' && i === round - 1 && !finished;
const filled = i < doneCount || (kind === 'focus' && finished && i === round - 1);
if (filled) k.add(circle({ cx: n(x), cy: n(dy), r: n(dr), fill: kind === 'focus' && i === round - 1 ? C.pos : tint }));
else k.add(circle({ cx: n(x), cy: n(dy), r: n(dr - 0.5), fill: now ? tint : 'none', fillOpacity: now ? 0.25 : undefined, stroke: now ? tint : C.dim, strokeWidth: n(Math.max(1, u * 0.7)) }));
}
void lerp;
return k.svg();
},
};
};
__d[298] = function (__ns) {
const { surface, rect, n } = __m(113);
const { clamp, outExpo, arrive } = __m(12);
const { mix } = __m(4);
const { text, isBig, perimeter, perimeterStroke, perimeterPoint, headDot, burst, mmss, capHeight } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SCENES = {
starting: { title: 'Live soon', short: 'Soon', end: "We're live", hue: 191.3 },
brb: { title: 'Be right back', short: 'BRB', end: 'Back now', hue: 60.4 },
ending: { title: 'Ending in', short: 'Ending', end: 'Thanks!', hue: 8 },
};
const __default = {
id: 'app-scene-countdown',
title: 'Scene Countdown',
category: 'Clocks & Timers',
description: 'Starting soon, be right back, ending: press to count down as light drains round the key. A real timer; it does not switch your streaming app’s scenes (no source yet).',
tags: ['countdown', 'starting soon', 'brb', 'intermission', 'scene', 'stream', 'creator', 'timer', 'streaming', 'broadcast', 'obs-style'],
surface: 'key',
data: ['timer'],
fps: 4,
loop: 60,
states: ['ready', 'running'],
tones: { ready: 'idle', running: 'active' },
press: 'toggle',
params: {
scene: { type: 'select', default: 'starting', options: ['starting', 'brb', 'ending'], label: 'Scene' },
minutes: { type: 'number', default: 5, min: 0, max: 60, step: 1, label: 'Minutes' },
seconds: { type: 'number', default: 0, min: 0, max: 59, step: 5, label: 'Seconds' },
title: { type: 'text', default: '', maxLength: 16, label: 'Title (blank = the scene’s)' },
},
order: 14,
render(ctx) {
const S = SCENES[ctx.params.scene] || SCENES.starting;
const c = { ...ctx, hue: S.hue, tint: ctx.theme.spectral(S.hue) };
const k = surface(c);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const total = Math.max(1, ctx.params.minutes * 60 + ctx.params.seconds);
const T = ctx.data?.timer;
const running = ctx.stateName === 'running';
const elapsed = T && typeof T.elapsed === 'number' ? T.elapsed : running ? ctx.since : 0;
const left = total - elapsed;
const done = running && left <= 0;
const big = isBig(k);
k.background({ tone: done ? 'ok' : running ? 'active' : 'idle' });
const tint = done ? C.pos : c.tint;
const inset = k.m.hair + k.m.line * 0.9, r = k.m.radius * 0.92;
const per = perimeter(inset, inset, w - inset * 2, h - inset * 2, r);
const secs = Math.ceil(Math.max(0, left));
const frac = left - Math.floor(left);
const step = ctx.reduced ? 1 : arrive(1 - frac, 0.3);
const f = running ? clamp((secs - (1 - step)) / total) : 1;
if (!done) {
k.add(perimeterStroke(per, 1, { color: C.line, width: k.m.line, opacity: 0.7 }));
if (f > 0) k.add(perimeterStroke(per, f, { color: tint, width: k.m.line * 1.7, opacity: running ? 1 : 0.5 }));
if (running && f > 0.002) { const [hx, hy] = perimeterPoint(inset, inset, w - inset * 2, h - inset * 2, r, f); k.add(headDot(k, hx, hy, k.m.line * 1.1, tint)); }
}
const title = ctx.params.title || (big ? S.title : S.short);
if (done) {
const a = elapsed - total;
k.add(burst(k, { cx: w / 2, cy: h * 0.5, r0: Math.min(w, h) * 0.12, r1: Math.min(w, h) * 0.5, age: a, dur: 1.1, count: 14, hue: S.hue }));
text(k, title, { y: k.m.text + capHeight(7.5 * u, 600), size: 7.5 * u, weight: 600, caps: true, tracking: 0.1, color: 'muted', maxWidth: w - k.m.text * 2, minSize: 6 * u });
text(k, S.end, { cy: h * 0.53, size: (big ? 17 : 15) * u, weight: 700, color: 'ink', maxWidth: w - k.m.text * 2, minSize: 9 * u });
text(k, `+${mmss(a)}`, { cy: h - k.m.safe - 5 * u, size: 8.5 * u, weight: 600, color: 'muted', tabular: true });
return k.svg();
}
text(k, title, { y: k.m.text + capHeight(7.5 * u, 600), size: 7.5 * u, weight: 600, caps: true, tracking: 0.1, color: running ? 'ink' : 'muted', maxWidth: w - k.m.text * 2, minSize: 6 * u });
const digits = mmss(running ? secs : total);
const beat = running && secs <= 10 && !ctx.reduced ? 1 - outExpo(clamp((1 - frac) / 0.35)) : 0;
const size = (big ? 26 : 24) * u * (1 + 0.08 * beat);
const cy = h * 0.53;
const a = running && !ctx.reduced ? arrive(1 - frac, 0.28) : 1;
if (a < 0.98) {
const off = (1 - a) * k.m.bold * 1.1;
text(k, digits, { x: w / 2 - off, cy, size, weight: 700, tabular: true, color: c.theme.spectral(S.hue - 60), opacity: 0.5 * (1 - a), maxWidth: w - k.m.text * 2 });
text(k, digits, { x: w / 2 + off, cy, size, weight: 700, tabular: true, color: c.theme.spectral(S.hue + 60), opacity: 0.5 * (1 - a), maxWidth: w - k.m.text * 2 });
}
text(k, digits, { cy, size, weight: 700, tabular: true, color: running ? (secs <= 10 ? mix(C.ink, tint, 0.35) : 'ink') : 'muted', maxWidth: w - k.m.text * 2, opacity: 0.4 + 0.6 * a });
if (beat > 0.02) k.add(rect({ width: w, height: h, fill: tint, fillOpacity: n((k.dark ? 0.14 : 0.08) * beat, 3) }));
if (!running) k.caption(big ? 'press to start' : 'start', { y: h - k.m.safe - 3 * u, color: 'dim' });
else if (big) k.caption('press to stop', { y: h - k.m.safe - 3 * u, color: 'dim' });
return k.svg();
},
};
};
__d[299] = function (__ns) {
const { surface, keyInto, rect, path, circle, n, roundRectPath } = __m(113);
const { colorAt, whiteOf, mix } = __m(283);
__e(__ns, { "LAYOUTS": () => LAYOUTS, "layoutOf": () => layoutOf, "sceneKey": () => sceneKey, "default": () => __default }, [], ["LAYOUTS","default","layoutOf","sceneKey"]);
const LAYOUTS = ['camera', 'screen', 'split', 'brb', 'starting', 'ending'];
function layoutOf(name = '') {
const s = String(name).toLowerCase();
if (/split|pip|both|\+/.test(s)) return 'split';
if (/brb|break|away|right back|pause/.test(s)) return 'brb';
if (/start|intro|soon|wait/.test(s)) return 'starting';
if (/end|outro|thanks|bye/.test(s)) return 'ending';
if (/screen|desk|game|slides|code|share/.test(s)) return 'screen';
return 'camera';
}
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
function sceneKey(k, ctx, { name, layout, role }) {
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
const __default = [scene, switcher];
};
__d[300] = function (__ns) {
const { surface, path, rect, n, roundRectPath, P } = __m(113);
const { spectrumOf } = __m(116);
const { keyGlass, colorAt, lift, whiteOf, PALETTE_OPTIONS, clamp } = __m(283);
const { panelInto } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const gainOf = (v, g) => clamp(v * g);
const span = {
id: 'app-spectrum',
title: 'Spectrum Across Keys',
category: 'Audio',
description: 'A spectrum analyzer across a block of keys: LED bars climb every row with falling peak caps. Live from sound capture in the plugin; simulated until one runs.',
tags: ['audio', 'spectrum', 'analyzer', 'equalizer', 'bars', 'leds', 'live', 'span', 'gap-compensated', 'stream', 'streaming', 'visualizer'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
data: ['spectrum'],
fps: 15,
loop: 16,
params: {
perKey: { type: 'number', default: 3, min: 1, max: 8, step: 1, label: 'Bars per key' },
segments: { type: 'number', default: 0, min: 0, max: 12, step: 1, label: 'LED segments per key (0 = auto)' },
palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
peaks: { type: 'bool', default: true, label: 'Peak caps' },
gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
},
order: 20,
render(ctx) {
const d = surface(ctx);
const { grid, params: p } = ctx;
keyGlass(d, grid, { index: false });
const K = Math.min(grid.key.w, grid.key.h);
const cols = [...new Set(grid.cells.map((c) => c.col))].sort((a, b) => a - b);
const rows = [...new Set(grid.cells.map((c) => c.row))].sort((a, b) => a - b);
const per = p.perKey, count = cols.length * per;
const S = spectrumOf(ctx, count);
const segPer = p.segments || (K >= 140 ? 8 : K >= 100 ? 7 : 6);
const total = segPer * rows.length;
const pad = K * 0.13, gx = Math.max(2, K * 0.05), gy = Math.max(1.5, K * 0.035);
const bw = (grid.key.w - pad * 2 - gx * (per - 1)) / per;
const sh = (grid.key.h - pad * 2 - gy * (segPer - 1)) / segPer;
const r = Math.min(sh / 2, bw / 2, K * 0.025);
const off = d.colors.line, dark = d.dark;
for (const cell of grid.cells) {
const ci = cols.indexOf(cell.col), ri = rows.length - 1 - rows.indexOf(cell.row); 
let dim = '';
const peaks = [];
const lit = [];
for (let b = 0; b < per; b++) {
const band = ci * per + b, f = count === 1 ? 0.5 : band / (count - 1);
const on = Math.round(gainOf(S.bands[band], p.gain) * total), pk = Math.min(total - 1, Math.round(gainOf(S.peaks[band], p.gain) * total) - 1);
const x = cell.x + pad + b * (bw + gx);
let litD = '', headD = '';
for (let s = 0; s < segPer; s++) {
const gi = ri * segPer + s; 
const y = cell.y + grid.key.h - pad - (s + 1) * sh - s * gy;
const seg = roundRectPath(x, y, bw, sh, r);
if (gi < on) { if (gi === on - 1) headD += seg; else litD += seg; }
else if (p.peaks && gi === pk && pk >= on) peaks.push(path(seg, { fill: dark ? '#ffffff' : lift(d, colorAt(ctx, p.palette, f), 0.45), fillOpacity: dark ? 0.85 : null }));
else dim += seg;
}
const c = colorAt(ctx, p.palette, f);
if (litD) lit.push(path(litD, { fill: c }));
if (headD) lit.push(path(headD, { fill: lift(d, c, dark ? 0.45 : 0.3) }));
}
if (dim) d.add(path(dim, { fill: off, fillOpacity: dark ? 0.55 : 0.6 }));
if (lit.length) d.add(lit.join(''));
if (peaks.length) d.add(peaks.join(''));
}
return d.svg();
},
};
const key = {
id: 'app-spectrum-key',
title: 'Spectrum Key',
category: 'Audio',
description: 'A spectrum analyzer on one key: rounded bars low to high, falling peak caps, a faint reflection. Live from sound capture in the plugin; simulated until one runs.',
tags: ['audio', 'spectrum', 'analyzer', 'equalizer', 'bars', 'live', 'key'],
surface: 'key',
data: ['spectrum'],
fps: 12,
loop: 16,
params: {
bands: { type: 'number', default: 0, min: 0, max: 16, step: 1, label: 'Bands (0 = auto)' },
palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
},
order: 21,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
k.background({ tone: 'idle' });
const m = Math.min(w, h);
const count = p.bands || (m >= 140 ? 12 : m >= 96 ? 10 : 8);
const S = spectrumOf(ctx, count);
const x0 = k.m.text, x1 = w - k.m.text, base = h * 0.7, top = k.m.text * 1.1, hh = base - top;
const gap = Math.max(1.5, (x1 - x0) / count * 0.28), bw = (x1 - x0 - gap * (count - 1)) / count, r = Math.min(bw / 2, m * 0.03);
let reflect = '';
const caps = [];
const bars = [];
for (let i = 0; i < count; i++) {
const x = x0 + i * (bw + gap), v = gainOf(S.bands[i], p.gain), bh = Math.max(bw * 0.7, hh * v);
const c = colorAt(ctx, p.palette, count === 1 ? 0.5 : i / (count - 1));
bars.push(path(roundRectPath(x, base - bh, bw, bh, r), { fill: c }));
reflect += P().M(x, base + gap).H(x + bw).V(base + gap + bh * 0.28).H(x).Z().d;
const py = base - hh * gainOf(S.peaks[i], p.gain) - Math.max(1.5, m * 0.02) - 1;
caps.push(path(roundRectPath(x, Math.max(top - 2, py), bw, Math.max(1.5, m * 0.02), 1), { fill: k.dark ? '#ffffff' : lift(k, c, 0.45), fillOpacity: k.dark ? 0.85 : null }));
}
const rid = k.id('refl');
k.def(`<linearGradient id="${rid}" x1="0" y1="${n(base)}" x2="0" y2="${n(base + hh * 0.3)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${colorAt(ctx, p.palette, 0.5)}" stop-opacity="${k.dark ? 0.28 : 0.22}"/><stop offset="1" stop-color="${colorAt(ctx, p.palette, 0.5)}" stop-opacity="0"/></linearGradient>`);
k.add(path(reflect, { fill: `url(#${rid})` }));
k.add(bars.join(''));
k.add(caps.join(''));
k.add(rect({ x: x0, y: base + gap * 0.25, width: x1 - x0, height: Math.max(1, k.m.hair * 0.75), fill: k.colors.beam || whiteOf(k), fillOpacity: k.dark ? 0.35 : 0.4 }));
return k.svg();
},
};
const RANGES = { 4: ['Bass', 'Low mid', 'High mid', 'Treble'], 6: ['Sub', 'Bass', 'Low mid', 'Mid', 'Presence', 'Air'] };
const strip = {
id: 'app-spectrum-strip',
title: 'Spectrum EQ Strip',
category: 'Audio',
description: 'The touch strip as a spectrum and EQ: each dial names a frequency range and shows its gain. Display only; live from sound capture in the plugin, else simulated.',
tags: ['audio', 'spectrum', 'equalizer', 'eq', 'strip', 'dials', 'stream deck +', 'live'],
surface: 'strip',
segments: 'all',
data: ['spectrum'],
fps: 12,
loop: 16,
params: {
palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
range: { type: 'number', default: 12, min: 3, max: 24, step: 1, label: 'EQ range ± dB' },
},
order: 22,
render(ctx) {
const s = surface(ctx);
const { w, h, params: p } = ctx;
const segs = ctx.strip.segments, sw = w / segs;
const names = RANGES[segs] || RANGES[4];
const perSeg = segs > 4 ? 6 : 8, count = perSeg * segs;
const S = spectrumOf(ctx, count);
s.add(rect({ width: w, height: h, fill: '#000000' }));
for (let i = 0; i < segs; i++) {
const val = ctx.values[i] ?? 0.5, db = Math.round((val - 0.5) * 2 * p.range);
panelInto(s, { x: i * sw, y: 0, w: sw, h }, (q) => {
q.background({ tone: 'idle' });
const pad = 12, top = 30, base = h - 12, hh = base - top;
const gap = 3, bw = (sw - pad * 2 - gap * (perSeg - 1)) / perSeg;
let caps = '';
const bars = [];
for (let b = 0; b < perSeg; b++) {
const band = i * perSeg + b, v = S.bands[band], bx = pad + b * (bw + gap), bh = Math.max(3, hh * v);
bars.push(path(roundRectPath(bx, base - bh, bw, bh, Math.min(2.5, bw / 2)), { fill: colorAt(ctx, p.palette, band / (count - 1)), fillOpacity: 0.9 }));
caps += roundRectPath(bx, Math.max(top - 2, base - hh * S.peaks[band] - 3), bw, 2, 1);
}
q.add(bars.join(''));
q.add(path(caps, { fill: whiteOf(q), fillOpacity: 0.8 }));
const mid = base - hh * 0.5, gy = mid - hh * 0.45 * (val - 0.5) * 2;
q.add(rect({ x: pad, y: mid - 0.5, width: sw - pad * 2, height: 1, fill: q.colors.line, fillOpacity: 0.9 }));
q.add(rect({ x: pad, y: gy - 1, width: sw - pad * 2, height: 2, rx: 1, fill: whiteOf(q), fillOpacity: q.dark ? 0.9 : 0.8 }));
q.eyebrow(names[i] || `Band ${i + 1}`, { align: 'left', x: pad, y: 19, size: 10, maxWidth: sw * 0.55 });
q.caption(`${db > 0 ? '+' : db < 0 ? '–' : '±'}${Math.abs(db)} dB`, { align: 'right', x: sw - pad, y: 19, size: 10.5, color: db === 0 ? 'muted' : 'ink' });
}, { kind: 'strip', tag: `s${i}` });
}
return s.svg();
},
};
const __default = [span, key, strip];
};
__d[301] = function (__ns) {
const { surface, path, rect, circle, n, arcPath, roundRectPath, polar, sparkPath, sparkPoints, spectrumArc } = __m(113);
const { metricOf, seriesOf, netOf, sysOf, rateText, bytesText } = __m(116);
const { colorAt, hueAt, whiteOf, lift, glowDot, clamp, lerp } = __m(283);
__e(__ns, { "default": () => __default }, [], ["default"]);
const toneFor = (v, warn = 0.75, crit = 0.9) => (v === null ? 'off' : v >= crit ? 'alert' : v >= warn ? 'warn' : 'idle');
const pctText = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const THRESH = { warn: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.05, label: 'Warn at' }, crit: { type: 'number', default: 0.9, min: 0, max: 1, step: 0.05, label: 'Critical at' } };
const accentOf = (k, tone, f = 0.6) => (tone === 'idle' ? colorAt(k.ctx, 'auto', f) : k.tone(tone));
const big = (k) => Math.min(k.w, k.h) >= 110;
function area(k, values, { x, y, w, h, shift = 0, color, name = 'area' }) {
const o = { x, y, w, h, shift };
const d = sparkPath(values, o);
if (!d) return;
const pts = sparkPoints(values, o);
const id = k.id(name);
k.def(`<linearGradient id="${id}" x1="0" y1="${n(y)}" x2="0" y2="${n(y + h)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${k.dark ? 0.42 : 0.3}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`);
k.add(path(`${d}L${n(pts[pts.length - 1][0])} ${n(y + h)}L${n(pts[0][0])} ${n(y + h)}Z`, { fill: `url(#${id})` }));
k.add(path(d, { fill: 'none', stroke: color, strokeWidth: n(Math.max(1.25, k.m.line)), strokeLinecap: 'round', strokeLinejoin: 'round' }));
const [hx, hy] = pts[pts.length - 1];
k.add(circle({ cx: hx, cy: hy, r: k.m.line * 1.6, fill: k.colors.surface2 }) + circle({ cx: hx, cy: hy, r: k.m.line, fill: whiteOf(k) }));
}
const cpuGraph = {
id: 'app-cpu-graph', title: 'CPU Graph', category: 'System',
description: 'CPU load as a scrolling chart of the last 30 seconds, warming to amber and red past your thresholds. Live in the plugin (system source); simulated on the web.',
tags: ['cpu', 'system', 'monitor', 'graph', 'history', 'sparkline', 'live'],
surface: 'key', data: ['cpu'], fps: 4, loop: 12,
params: { label: { type: 'text', default: 'CPU', maxLength: 10, label: 'Label' }, ...THRESH },
order: 11,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const v = metricOf(ctx, 'cpu'), tone = toneFor(v, p.warn, p.crit);
k.background({ tone });
const s = seriesOf(ctx, 'cpu', 30, 1);
const c = accentOf(k, tone, 0.3);
if (v !== null) area(k, s.values, { x: k.m.bleed, y: h * 0.5, w: w - k.m.bleed * 2, h: h * 0.3, shift: ctx.reduced ? 0 : s.frac, color: c });
k.eyebrow(p.label, { color: 'muted' });
k.value(pctText(v), { cy: h * 0.36, maxWidth: w - k.m.text * 2, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
return k.svg();
},
};
const cpuCores = {
id: 'app-cpu-cores', title: 'CPU Cores', category: 'System',
description: 'Every CPU core as its own column, lit by its load, with the total underneath. Live in the plugin (system source); simulated on the web.',
tags: ['cpu', 'cores', 'threads', 'system', 'monitor', 'bars', 'live'],
surface: 'key', data: ['cpu'], fps: 4, loop: 12,
params: { ...THRESH },
order: 12,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const v = metricOf(ctx, 'cpu'), tone = toneFor(v, p.warn, p.crit);
k.background({ tone });
const cores = (sysOf(ctx).cores || []).slice(0, 32);
const n0 = cores.length || 8;
const x0 = k.m.text, x1 = w - k.m.text, top = k.m.text, bot = h * 0.66;
const gap = Math.max(1, ((x1 - x0) / n0) * 0.3), bw = (x1 - x0 - gap * (n0 - 1)) / n0, r = Math.min(bw / 2, k.m.u * 2);
let track = '';
const lit = [];
for (let i = 0; i < n0; i++) {
const x = x0 + i * (bw + gap), cv = clamp(cores[i] ?? 0), bh = Math.max(bw * 0.8, (bot - top) * cv);
track += roundRectPath(x, top, bw, bot - top, r);
const ct = cv >= p.crit ? k.tone('alert') : cv >= p.warn ? k.tone('warn') : colorAt(ctx, 'auto', 0.15 + 0.7 * (i / Math.max(1, n0 - 1)));
if (v !== null) lit.push(path(roundRectPath(x, bot - bh, bw, bh, r), { fill: ct }));
}
k.add(path(track, { fill: k.colors.line, fillOpacity: k.dark ? 0.5 : 0.55 }));
k.add(lit.join(''));
k.value(pctText(v), { cy: h * 0.81, size: k.m.u * (big(k) ? 15 : 14), maxWidth: w - k.m.text * 2, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
return k.svg();
},
};
const GIB = 1024 ** 3;
const gbText = (b) => { const x = b / GIB; return x >= 100 ? `${Math.round(x)}` : x.toFixed(1).replace(/\.0$/, ''); };
const mem = {
id: 'app-mem', title: 'Memory', category: 'System',
description: 'Memory in use as LED segments beside the percentage and the gigabytes, in binary units. Live in the plugin (system source); simulated on the web.',
tags: ['memory', 'ram', 'system', 'monitor', 'meter', 'live'],
surface: 'key', data: ['mem'], fps: 2, loop: 12,
params: { ...THRESH, warn: { ...THRESH.warn, default: 0.85 }, crit: { ...THRESH.crit, default: 0.95 } },
order: 13,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const v = metricOf(ctx, 'mem'), tone = toneFor(v, p.warn, p.crit);
k.background({ tone });
const sys = sysOf(ctx);
const count = big(k) ? 12 : 10;
const x = k.m.text, sw = w * 0.2, top = k.m.text, bot = h - k.m.text, g = Math.max(1.25, k.m.u * 1.1);
const sh = (bot - top - g * (count - 1)) / count, lit = v === null ? 0 : Math.round(v * count);
let off = '', on = '', head = '';
for (let i = 0; i < count; i++) {
const y = bot - (i + 1) * sh - i * g, d = roundRectPath(x, y, sw, sh, Math.min(sh / 2, k.m.u * 1.5));
if (i < lit - 1) on += d; else if (i === lit - 1) head += d; else off += d;
}
const c = accentOf(k, tone, 0.55);
k.add(path(off, { fill: k.colors.line, fillOpacity: k.dark ? 0.55 : 0.6 }));
if (on) k.add(path(on, { fill: c }));
if (head) k.add(path(head, { fill: lift(k, c, k.dark ? 0.45 : 0.3) }));
const tx = x + sw + (w - x - sw) / 2, room = w - x - sw - k.m.text;
k.eyebrow('Memory', { align: 'center', x: tx, maxWidth: room });
k.value(pctText(v), { x: tx, cy: h * 0.48, maxWidth: room, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
const used = sys.memUsed ?? (v !== null && sys.memTotal ? v * sys.memTotal : null);
k.caption(used === null || used === undefined ? '' : `${gbText(used)}${sys.memTotal ? ` / ${gbText(sys.memTotal)}` : ''} GB`, { x: tx, y: h * 0.74, maxWidth: room, color: 'muted' });
return k.svg();
},
};
const gpu = {
id: 'app-gpu', title: 'GPU Gauge', category: 'System',
description: 'GPU load on a half gauge that disperses across the Spectrum, with a needle. Live in the plugin where the system source can read the GPU; simulated on the web.',
tags: ['gpu', 'graphics', 'system', 'monitor', 'gauge', 'needle', 'live'],
surface: 'key', data: ['gpu'], fps: 4, loop: 12,
params: { label: { type: 'text', default: 'GPU', maxLength: 10, label: 'Label' }, ...THRESH },
order: 14,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const v = metricOf(ctx, 'gpu'), tone = toneFor(v, p.warn, p.crit);
k.background({ tone });
const m = Math.min(w, h), cx = w / 2, cy = h * 0.6, r = m * 0.36, sw = k.m.ring * 0.85;
k.add(path(arcPath(cx, cy, r, -90, 90), { fill: 'none', stroke: k.colors.line, strokeWidth: n(sw), strokeLinecap: 'round' }));
const S = ctx.colors.spectrum || { l: 0.75, c: 0.12 };
if (v !== null) k.add(spectrumArc({ cx, cy, r, width: sw, from: -90, to: 90, value: v, h0: hueAt(ctx, 'auto', 0.9), h1: hueAt(ctx, 'auto', 0.05), l: S.l, c: S.c + 0.01, segments: big(k) ? 28 : 18 }));
if (m >= 96) for (let i = 0; i <= 4; i++) { const a = -90 + i * 45; const [x1, y1] = polar(cx, cy, r - sw * 1.1, a), [x2, y2] = polar(cx, cy, r - sw * 1.1 - k.m.u * 3, a); k.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: k.colors.dim, strokeWidth: n(k.m.hair), strokeLinecap: 'round' })); }
const a = lerp(-90, 90, v ?? 0);
const [tx, ty] = polar(cx, cy, r - sw * 0.2, a), [l1x, l1y] = polar(cx, cy, k.m.line, a - 90), [l2x, l2y] = polar(cx, cy, k.m.line, a + 90);
const nc = tone === 'idle' ? whiteOf(k) : k.tone(tone);
if (v !== null) k.add(path(`M${n(l1x)} ${n(l1y)}L${n(tx)} ${n(ty)}L${n(l2x)} ${n(l2y)}Z`, { fill: nc }) + circle({ cx, cy, r: k.m.bold * 0.8, fill: nc }) + circle({ cx, cy, r: k.m.line * 0.7, fill: k.colors.surface2 }));
k.eyebrow(p.label, { color: 'muted' });
k.value(pctText(v), { cy: h * 0.82, size: k.m.u * 15, maxWidth: w - k.m.text * 2, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
return k.svg();
},
};
const net = {
id: 'app-net', title: 'Network', category: 'System',
description: 'Network traffic: download as a glowing area, upload as a line, with the rates in bytes per second. Live in the plugin (system source); simulated on the web.',
tags: ['network', 'bandwidth', 'download', 'upload', 'system', 'monitor', 'live'],
surface: 'key', data: ['net'], fps: 4, loop: 12,
params: { bits: { type: 'bool', default: false, label: 'Show bits per second' } },
order: 15,
render(ctx) {
const k = surface(ctx);
const { w, h, params: p } = ctx;
const r = netOf(ctx);
k.background({ tone: r ? 'idle' : 'off' });
if (r) {
const d = seriesOf(ctx, 'down', 30, 1), u = seriesOf(ctx, 'up', 30, 1);
const box = { x: k.m.bleed, y: h * 0.42, w: w - k.m.bleed * 2, h: h * 0.28 };
area(k, d.values, { ...box, shift: ctx.reduced ? 0 : d.frac, color: colorAt(ctx, 'auto', 0.8), name: 'down' });
const ud = sparkPath(u.values.map((x) => x * 0.8), { ...box, shift: ctx.reduced ? 0 : u.frac });
if (ud) k.add(path(ud, { fill: 'none', stroke: colorAt(ctx, 'auto', 0.05), strokeWidth: n(Math.max(1.25, k.m.line * 0.85)), strokeLinecap: 'round', strokeLinejoin: 'round', strokeOpacity: 0.9 }));
}
const short = (b) => rateText(b, { bits: p.bits }).replace('/s', '').replace(' ', '');
const vs = k.m.u * (big(k) ? 12.5 : 12);
k.value(r ? `↓${short(r.down)}` : '—', { cy: h * 0.26, size: vs, maxWidth: w - k.m.text * 2 });
k.caption(r ? `↑ ${rateText(r.up, { bits: p.bits })}` : 'no network data', { y: h - k.m.u * 11.5, maxWidth: w - k.m.text * 2, color: 'muted' });
return k.svg();
},
};
const disk = {
id: 'app-disk', title: 'Disk', category: 'System',
description: 'Disk space used as a donut with the free space underneath; a glint while the disk is busy. Live in the plugin (system source); simulated on the web.',
tags: ['disk', 'storage', 'ssd', 'space', 'system', 'monitor', 'live'],
surface: 'key', data: ['disk'], fps: 4, loop: 12,
params: { ...THRESH, warn: { ...THRESH.warn, default: 0.85 }, crit: { ...THRESH.crit, default: 0.95 } },
order: 16,
render(ctx) {
const k = surface(ctx);
const { w, h, t, params: p } = ctx;
const v = metricOf(ctx, 'disk'), tone = toneFor(v, p.warn, p.crit);
k.background({ tone });
const sys = sysOf(ctx);
const m = Math.min(w, h), cx = w / 2, cy = h * 0.44, r = m * 0.28, sw = k.m.ring * 1.1;
const c = accentOf(k, tone, 0.45);
k.add(circle({ cx, cy, r, fill: 'none', stroke: k.colors.line, strokeWidth: n(sw) }));
if (v !== null && v > 0.005) k.add(path(arcPath(cx, cy, r, 0, 360 * v), { fill: 'none', stroke: c, strokeWidth: n(sw), strokeLinecap: 'butt' }));
const io = (sys.diskRead || 0) + (sys.diskWrite || 0);
const busy = clamp(Math.log10(1 + io / 1e5) / 3.5);
if (v !== null && busy > 0.05 && !ctx.reduced) { const [gx, gy] = polar(cx, cy, r, (t * 220) % 360); k.add(glowDot(k, { cx: gx, cy: gy, r: sw * 0.42, color: whiteOf(k), opacity: 0.35 + 0.65 * busy })); }
k.value(pctText(v), { cy, size: k.m.u * (big(k) ? 13 : 12.5), maxWidth: r * 1.6, color: tone === 'idle' || tone === 'off' ? 'ink' : 'tone' });
k.caption(Number.isFinite(sys.diskFree) ? `${bytesText(sys.diskFree)} free` : 'Disk', { y: h - k.m.u * 11.5, maxWidth: w - k.m.text * 2, color: 'muted' });
return k.svg();
},
};
const DIAL_METRICS = ['cpu', 'mem', 'gpu', 'disk', 'net'];
const DIAL_LABEL = { cpu: 'CPU', mem: 'Memory', gpu: 'GPU', disk: 'Disk', net: 'Network' };
const systemDial = {
id: 'app-system-dial', title: 'System Dial', category: 'System',
description: 'One + dial segment for CPU, memory, GPU, disk or network: an arc, the value and its history. Live in the plugin (system source); simulated on the web.',
tags: ['system', 'monitor', 'dial', 'strip', 'stream deck +', 'cpu', 'memory', 'gpu', 'network', 'live'],
surface: 'strip', segments: 1,
data: ['cpu', 'mem', 'gpu', 'disk', 'net'], fps: 4, loop: 12,
params: { metric: { type: 'select', default: 'cpu', options: DIAL_METRICS, label: 'Metric' }, ...THRESH },
order: 17,
render(ctx) {
const s = surface(ctx);
const { w, h, params: p } = ctx;
const key = p.metric;
const r = key === 'net' ? netOf(ctx) : null;
const v = key === 'net' ? (r ? clamp(seriesOf(ctx, 'down', 2, 1).values.at(-1)) : null) : metricOf(ctx, key);
const tone = key === 'net' ? (r ? 'idle' : 'off') : toneFor(v, p.warn, p.crit);
s.background({ tone });
const cx = 46, cy = 54, rr = 30, sw = 6;
s.add(path(arcPath(cx, cy, rr, -135, 135), { fill: 'none', stroke: s.colors.line, strokeWidth: sw, strokeLinecap: 'round' }));
const c = tone === 'idle' ? colorAt(ctx, 'auto', 0.6) : s.tone(tone);
if (v !== null && v > 0.004) s.add(path(arcPath(cx, cy, rr, -135, lerp(-135, 135, v)), { fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round' }));
const txt = key === 'net' ? (r ? rateText(r.down).replace('/s', '') : '—') : pctText(v);
s.value(txt, { x: cx, cy, size: key === 'net' ? 13 : 17, maxWidth: rr * 1.55 });
s.eyebrow(DIAL_LABEL[key], { align: 'left', x: 92, y: 22, size: 10 });
if (v !== null) {
const ser = seriesOf(ctx, key === 'net' ? 'down' : key === 'disk' ? 'read' : key, 24, 1);
area(s, ser.values, { x: 92, y: 34, w: w - 92 - 10, h: 44, shift: ctx.reduced ? 0 : ser.frac, color: c });
}
s.caption(key === 'net' && r ? `↑ ${rateText(r.up)}` : key === 'disk' ? 'read activity' : '', { align: 'left', x: 92, y: h - 9, size: 9.5, color: 'muted' });
return s.svg();
},
};
const __default = [cpuGraph, cpuCores, mem, gpu, net, disk, systemDial];
};
__d[302] = function (__ns) {
const { surface, rect, path, circle, n, P } = __m(113);
const { clockOf } = __m(98);
const { clamp } = __m(12);
const { mix } = __m(4);
const { text, isBig } = __m(195);
__e(__ns, { "default": () => __default }, [], ["default"]);
const fmt = (c, h12) => `${h12 ? ((c.h + 11) % 12) + 1 : c.h}:${String(c.m).padStart(2, '0')}`;
const __default = {
id: 'app-time-zones',
title: 'Time Zones',
category: 'Clocks & Timers',
description: 'Two time zones on one key: big digits, a sun or a moon, the day offset and, on big keys, working hours so the overlap shows. Real time from your clock.',
tags: ['time zone', 'world clock', 'remote', 'team', 'clock', 'utc', 'overlap'],
surface: 'key',
fps: 1,
loop: 120,
params: {
aName: { type: 'text', default: 'SFO', maxLength: 5, label: 'Zone A name' },
aOffset: { type: 'number', default: -420, min: -720, max: 840, step: 15, label: 'Zone A offset (min from UTC)' },
aLocal: { type: 'bool', default: false, label: 'Zone A follows my local time' },
bName: { type: 'text', default: 'BER', maxLength: 5, label: 'Zone B name' },
bOffset: { type: 'number', default: 120, min: -720, max: 840, step: 15, label: 'Zone B offset (min from UTC)' },
workFrom: { type: 'number', default: 9, min: 0, max: 23, step: 1, label: 'Work day starts (h)' },
workTo: { type: 'number', default: 17, min: 1, max: 24, step: 1, label: 'Work day ends (h)' },
hour12: { type: 'bool', default: false, label: '12-hour clock' },
},
order: 22,
render(ctx) {
const k = surface(ctx);
const { w, h } = ctx;
const C = k.colors, u = k.m.u;
const P0 = ctx.params;
k.background({ tone: 'idle' });
const big = isBig(k);
const offA = P0.aLocal ? (ctx.clock?.tzOffset ?? 0) : P0.aOffset;
const zones = [{ name: P0.aName, off: offA, hue: 243.6 }, { name: P0.bName, off: P0.bOffset, hue: 34.2 }];
const utcDay = Math.floor(ctx.now / 86400000);
const x0 = k.m.text, x1 = w - k.m.text;
const rowH = (h - k.m.safe * 2) / 2;
zones.forEach((z, i) => {
const c = clockOf(ctx.now, z.off);
const day = Math.floor((ctx.now + z.off * 60000) / 86400000) - utcDay - (Math.floor((ctx.now + offA * 60000) / 86400000) - utcDay);
const hour = c.h + c.m / 60;
const isDay = hour >= 6.5 && hour < 19;
const y0 = k.m.safe + i * rowH;
const tint = ctx.theme.spectral(z.hue);
const eb = (big ? 8.5 : 7.5) * u;
text(k, z.name, { x: x0, y: y0 + eb * 0.9 + (big ? u * 2 : u), size: eb, weight: 600, caps: true, tracking: 0.12, anchor: 'start', color: 'muted' });
const mr = (big ? 3.6 : 2.9) * u, mx = x1 - mr * 1.2, my = y0 + eb * 0.55 + (big ? u * 2 : u);
if (day !== 0) text(k, `${day > 0 ? '+' : '−'}${Math.abs(day)}d`, { x: x1 - mr * 3.2, y: y0 + eb * 0.9 + (big ? u * 2 : u), size: eb, weight: 700, anchor: 'end', color: tint });
if (isDay) {
const rays = P();
for (let a = 0; a < 8; a++) { const t = (a * Math.PI) / 4; rays.M(mx + Math.cos(t) * mr * 1.25, my + Math.sin(t) * mr * 1.25).L(mx + Math.cos(t) * mr * 1.7, my + Math.sin(t) * mr * 1.7); }
k.add(circle({ cx: n(mx), cy: n(my), r: n(mr * 0.85), fill: ctx.theme.spectral(86.5) }) + path(rays.d, { stroke: ctx.theme.spectral(86.5), strokeWidth: n(Math.max(1, u * 0.9)), strokeLinecap: 'round' }));
} else {
const r = mr * 0.95;
k.add(path(P().M(mx + r * 0.35, my - r).A(r, r, 0, 1, 0, mx + r, my + r * 0.4).A(r * 0.78, r * 0.78, 0, 1, 1, mx + r * 0.35, my - r).Z().d, { fill: ctx.theme.spectral(269.8), fillOpacity: 0.9 }));
}
const ts = big ? 16 * u : 15 * u;
text(k, fmt(c, P0.hour12), { x: x0 - u * 0.6, y: y0 + (big ? rowH * 0.8 : rowH * 0.92), size: ts, weight: 700, tabular: true, anchor: 'start', color: 'ink', maxWidth: x1 - x0 + u * 0.6 });
if (big) {
const by = y0 + rowH * 0.88, bh = Math.max(2, 2.2 * u), bw = x1 - x0;
k.add(rect({ x: n(x0), y: n(by), width: n(bw), height: n(bh), rx: n(bh / 2), fill: C.line, fillOpacity: k.dark ? 0.9 : 1 }));
const a = clamp(P0.workFrom / 24), b = clamp(Math.max(P0.workFrom + 1, P0.workTo) / 24);
k.add(rect({ x: n(x0 + bw * a), y: n(by), width: n(bw * (b - a)), height: n(bh), rx: n(bh / 2), fill: tint, fillOpacity: 0.75 }));
const nx = x0 + bw * (hour / 24);
k.add(rect({ x: n(nx - Math.max(1, u * 0.7)), y: n(by - bh * 0.9), width: n(Math.max(2, u * 1.4)), height: n(bh * 2.8), rx: n(u * 0.6), fill: k.dark ? '#ffffff' : C.ink }));
}
});
const id = k.id('div');
k.def(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.line}" stop-opacity="0"/><stop offset="0.5" stop-color="${mix(C.line, C.muted, 0.3)}"/><stop offset="1" stop-color="${C.line}" stop-opacity="0"/></linearGradient>`);
k.add(rect({ x: n(x0), y: n(k.m.safe + rowH - 0.5), width: n(x1 - x0), height: n(Math.max(1, u * 0.6)), fill: `url(#${id})` }));
return k.svg();
},
};
};
__d[303] = function (__ns) {
const { surface, path, rect, n } = __m(113);
const { audioOf } = __m(116);
const { colorAt, lift, whiteOf, bandPath, smoothLine, PALETTE_OPTIONS, clamp } = __m(283);
const { expand } = __m(290);
const { panelInto } = __m(114);
__e(__ns, { "default": () => __default }, [], ["default"]);
const __default = {
id: 'app-waveform-strip',
title: 'Waveform Strip',
category: 'Audio',
description: 'Audio flowing along the Stream Deck + touch strip as one waveform across every dial, the level in dB at the head. Live from sound capture in the plugin; simulated until one runs.',
tags: ['audio', 'waveform', 'strip', 'stream deck +', 'live', 'level', 'oscilloscope'],
surface: 'strip',
segments: 'all',
data: ['audio'],
fps: 15,
loop: 16,
params: {
seconds: { type: 'number', default: 5, min: 2, max: 15, step: 0.5, label: 'Seconds on the strip' },
palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
},
order: 15,
render(ctx) {
const s = surface(ctx);
const { w, h, params: p } = ctx;
const segs = ctx.strip.segments, sw = w / segs;
const seconds = p.seconds * (w / 800);
const A = audioOf(ctx, { count: Math.ceil(seconds * 30) + 4, rate: 30 });
const pps = w / seconds, N = A.levels.length;
const mid = h * 0.56, amp = h * 0.36, step = 3;
const lv = (x) => {
const idx = N - 1 - (((w - x) / pps) * A.rate - (A.frac || 0));
if (idx < -0.5) return 0;
const c = clamp(idx, 0, N - 1), i = Math.floor(c), f = c - i;
return clamp((A.levels[i] + ((A.levels[Math.min(N - 1, i + 1)] ?? A.levels[i]) - A.levels[i]) * f) * p.gain);
};
s.add(rect({ width: w, height: h, fill: '#000000' }));
const dark = s.dark;
const stops = (op, k) => Array.from({ length: 7 }, (_, i) => { const f = i / 6; const c = colorAt(ctx, p.palette, 0.1 + 0.9 * f); return `<stop offset="${n(f, 3)}" stop-color="${k ? lift(s, c, k) : c}" stop-opacity="${n(op(f), 3)}"/>`; }).join('');
const ramp = (f) => 0.15 + 0.85 * f ** 1.3;
const gid = (name, op, k) => { const id = s.id(name); s.def(`<linearGradient id="${id}" x1="0" y1="0" x2="${n(w)}" y2="0" gradientUnits="userSpaceOnUse">${stops(op, k)}</linearGradient>`); return `url(#${id})`; };
const body = gid('body', (f) => (dark ? 0.6 : 0.5) * ramp(f)), core = gid('core', (f) => 0.85 * ramp(f), dark ? 0.5 : 0.35), edge = gid('edge', (f) => 0.3 + 0.7 * ramp(f));
for (let i = 0; i < segs; i++) {
const X = i * sw;
panelInto(s, { x: X, y: 0, w: sw, h }, (q) => {
q.background({ tone: 'idle' });
const oT = [], oB = [], iT = [], iB = [];
for (let x = -step; x <= sw + step; x += step) {
const v = lv(X + x), a = amp * (0.03 + 0.97 * expand(v) ** 1.1), c = a * (0.34 + 0.26 * expand(v));
oT.push([x, mid - a]); oB.push([x, mid + a]); iT.push([x, mid - c]); iB.push([x, mid + c]);
}
q.add(`<g transform="translate(${n(-X)} 0)">${[
          path(bandPath(oT.map(([x, y]) => [x + X, y]), oB.map(([x, y]) => [x + X, y])), { fill: body }),
          path(bandPath(iT.map(([x, y]) => [x + X, y]), iB.map(([x, y]) => [x + X, y])), { fill: core }),
          path(smoothLine(oT.map(([x, y]) => [x + X, y])) + smoothLine(oB.map(([x, y]) => [x + X, y])), { fill: 'none', stroke: edge, strokeWidth: 1.25, strokeLinejoin: 'round' }),
        ].join('')}</g>`);
q.add(rect({ x: 0, y: mid - 0.5, width: sw, height: 1, fill: q.colors.beam || whiteOf(q), fillOpacity: dark ? 0.22 : 0.3 }));
for (let k = 1; k <= Math.ceil(seconds); k++) {
const x = w - k * pps - X;
if (x < 4 || x > sw - 4) continue;
q.add(rect({ x: x - 0.5, y: 8, width: 1, height: 6, fill: q.colors.muted, fillOpacity: 0.7 }));
if (x > 18 && x < sw - 18) q.caption(`${k}s`, { x: x + 4, y: 16, align: 'left', size: 9, color: 'dim' });
}
if (i === segs - 1) {
const db = A.level > 0 ? Math.round((1 - A.level) * -60) : null;
q.caption(db === null ? 'silent' : `${db} dB`, { align: 'right', x: sw - 10, y: 16, size: 10, color: A.live ? 'ink' : 'muted' });
const hx = sw - 6, ha = Math.max(3, amp * (0.03 + 0.97 * expand(lv(w - 6)) ** 1.1));
q.add(path(`M${n(hx)} ${n(mid - ha)}L${n(hx)} ${n(mid + ha)}`, { stroke: whiteOf(q), strokeWidth: 1.5, strokeOpacity: 0.9, strokeLinecap: 'round' }));
}
}, { kind: 'strip', tag: `s${i}` });
}
return s.svg();
},
};
};
__d[304] = function (__ns) {
const { polar } = __m(15);
__e(__ns, { "PIECE_NAMES": () => PIECE_NAMES, "PIECES": () => PIECES, "PADS": () => PADS, "arrow": () => arrow, "mark": () => mark }, [], ["PADS","PIECES","PIECE_NAMES","arrow","mark"]);
const ACC = { role: 'accent', fill: true };
const star = (cx, cy, R, r, k = 5, rot = 0) => Array.from({ length: k * 2 }, (_, i) => { const p = polar(cx, cy, i % 2 ? r : R, rot + (i * 180) / k); return [p.x ?? p[0], p.y ?? p[1]]; });
const ngon = (cx, cy, R, k, rot = 0) => Array.from({ length: k }, (_, i) => { const p = polar(cx, cy, R, rot + (i * 360) / k); return [p.x ?? p[0], p.y ?? p[1]]; });
const PIECE_NAMES = ['prism', 'ring', 'diamond', 'star', 'hex', 'moon', 'bolt', 'wave', 'drop', 'leaf', 'cross', 'orbit', 'heart', 'eye', 'sun', 'flag', 'crown', 'cube', 'spark'];
const PIECES = [
(p) => { p.polygon([[24, 8], [41, 38], [7, 38]], ACC); p.line(24, 15, 15.5, 31, { role: 'spark', weight: 0.6, opacity: 0.8 }); },
(p) => { p.circle(24, 24, 14, { role: 'accent', weight: 1.7 }); p.dot(24, 24, 4.5); },
(p) => { p.polygon([[24, 6.5], [40.5, 24], [24, 41.5], [7.5, 24]], ACC); },
(p) => { p.polygon(star(24, 25.5, 18, 7.6), ACC); },
(p) => { p.polygon(ngon(24, 24, 17, 6, 30), ACC); p.polygon(ngon(24, 24, 7, 6, 30), { role: 'spark' }); },
(p) => { p.path('M28.5 8.4 A16 16 0 1 0 40.6 31 A12.5 12.5 0 1 1 28.5 8.4 Z', ACC); },
(p) => { p.polygon([[29, 6], [12, 28], [23, 28], [19, 42], [37, 19], [26, 19]], ACC); },
(p) => { p.path('M7 21 C11 12 16 12 19.5 21 C23 30 28 30 31.5 21 C35 12 39 12 41 17', { role: 'accent', weight: 1.5 }); p.path('M7 32 C11 23 16 23 19.5 32 C23 41 28 41 31.5 32 C35 23 39 23 41 28', { role: 'accent', weight: 1.5, opacity: 0.55 }); },
(p) => { p.path('M24 6.5 C30 15 36.5 21.5 36.5 29 A12.5 12.5 0 0 1 11.5 29 C11.5 21.5 18 15 24 6.5 Z', ACC); p.dot(19, 29, 2.4); },
(p) => { p.path('M9 39 C9 20 21 9 40 9 C40 28 28 39 9 39 Z', ACC); p.line(13, 35, 30, 18, { role: 'spark', weight: 0.6, opacity: 0.85 }); },
(p) => { p.polygon([[18.5, 7], [29.5, 7], [29.5, 18.5], [41, 18.5], [41, 29.5], [29.5, 29.5], [29.5, 41], [18.5, 41], [18.5, 29.5], [7, 29.5], [7, 18.5], [18.5, 18.5]], ACC); },
(p) => { p.group({ rotate: -28 }, (g) => g.ellipse(24, 24, 18, 7.5, { role: 'accent', weight: 1.3 })); p.circle(24, 24, 6, ACC); },
(p) => { p.path('M24 40.5 C10 31 6.5 23 6.5 17.5 A9 9 0 0 1 24 13.5 A9 9 0 0 1 41.5 17.5 C41.5 23 38 31 24 40.5 Z', ACC); },
(p) => { p.path('M6 24 C13 12.5 35 12.5 42 24 C35 35.5 13 35.5 6 24 Z', { role: 'accent', weight: 1.3 }); p.circle(24, 24, 6.5, ACC); p.dot(26.5, 21.5, 1.8); },
(p) => { p.circle(24, 24, 8.5, ACC); for (let i = 0; i < 8; i++) { const a = polar(24, 24, 12.5, i * 45), b = polar(24, 24, 17.5, i * 45); p.line(a.x ?? a[0], a.y ?? a[1], b.x ?? b[0], b.y ?? b[1], { role: 'accent', weight: 1.1 }); } },
(p) => { p.line(13, 7, 13, 42, { role: 'accent', weight: 1.2 }); p.polygon([[13, 8], [39, 15.5], [13, 26]], ACC); },
(p) => { p.polygon([[7, 37], [7, 14], [16, 24], [24, 9], [32, 24], [41, 14], [41, 37]], ACC); },
(p) => { p.polygon(ngon(24, 24, 17.5, 6, 0), { role: 'accent', weight: 1.2 }); p.polyline([[24, 24], [24, 41.5]], { role: 'accent', weight: 1.1 }); p.polyline([[8.8, 15.2], [24, 24], [39.2, 15.2]], { role: 'accent', weight: 1.1 }); p.polygon([[24, 6.5], [39.2, 15.2], [24, 24], [8.8, 15.2]], { role: 'accent', fill: true, opacity: 0.6 }); },
(p) => { p.path('M24 6 C25.5 17 31 22.5 42 24 C31 25.5 25.5 31 24 42 C22.5 31 17 25.5 6 24 C17 22.5 22.5 17 24 6 Z', ACC); },
];
const PADS = [
(p, o = {}) => p.circle(24, 24, 13, { role: 'accent', fill: !!o.fill, weight: 1.2 }),
(p, o = {}) => p.polygon([[24, 9.5], [38.5, 36], [9.5, 36]], { role: 'accent', fill: !!o.fill, weight: 1.2, join: 'round' }),
(p, o = {}) => p.rect(11.5, 11.5, 25, 25, { role: 'accent', fill: !!o.fill, weight: 1.2, r: 3 }),
(p, o = {}) => p.polygon([[24, 8], [40, 24], [24, 40], [8, 24]], { role: 'accent', fill: !!o.fill, weight: 1.2, join: 'round' }),
(p, o = {}) => p.polygon(ngon(24, 24, 15, 6, 30), { role: 'accent', fill: !!o.fill, weight: 1.2, join: 'round' }),
(p, o = {}) => p.polygon(star(24, 25, 16, 7, 5), { role: 'accent', fill: !!o.fill, weight: 1.1, join: 'round' }),
];
const ARROWS = { up: [[24, 11], [38, 33], [10, 33]], down: [[24, 37], [38, 15], [10, 15]], left: [[11, 24], [33, 10], [33, 38]], right: [[37, 24], [15, 10], [15, 38]] };
function arrow(p, dir, o = {}) { p.polygon(ARROWS[dir], { role: o.role || 'line', fill: true, join: 'round', opacity: o.opacity }); }
function mark(p, kind, u = 1) {
if (kind === 'x') {
const a = Math.min(1, u * 2), b = Math.max(0, u * 2 - 1);
if (a > 0) p.line(12, 12, 12 + 24 * a, 12 + 24 * a, { role: 'accent', weight: 1.55 });
if (b > 0) p.line(36, 12, 36 - 24 * b, 12 + 24 * b, { role: 'accent', weight: 1.55 });
} else if (u >= 0.999) p.circle(24, 24, 12.5, { role: 'accent', weight: 1.55 });
else if (u > 0.01) p.arc(24, 24, 12.5, 0, Math.max(1, 359.9 * u), { role: 'accent', weight: 1.55 });
}
};
__d[305] = function (__ns) {
const { surface, rect } = __m(113);
const { rngSeed, rngNext, rngInt } = __m(106);
const { clamp, lerp, outExpo } = __m(12);
const { cellsOf, ageOf, spread, beam, sweepX, burst, ringWave, readout, hasReadout, statusKey, cellKey, panelBase, HUE, middleCell } = __m(269);
const { PIECES } = __m(304);
__e(__ns, { "default": () => __default }, [], ["default"]);
const TICK = 4; 
const LIGHT_HUES = spread(9, HUE.rose, HUE.violet);
function step(s, t) {
const tk = s.tk + 1;
if (tk >= s.dur) return { ...s, tk, phase: 'over', lights: [], best: Math.max(s.best, s.score), overAt: t };
let { rng, gone, combo } = s;
const lights = s.lights.filter((L) => { if (L[1] + L[2] > tk) return true; gone++; combo = 0; return false; });
const N = s.cols * s.rows, f = tk / s.dur;
const cap = Math.max(1, Math.min(N >= 8 ? (f < 0.3 ? 1 : f < 0.7 ? 2 : 3) : f < 0.5 ? 1 : 2, Math.floor(N / 3)));
let x;
[x, rng] = rngNext(rng);
if (lights.length < cap && (lights.length === 0 || x < 0.55)) {
const free = [];
for (let c = 0; c < N; c++) if (!lights.some((L) => L[0] === c) && !(s.lights.some((L) => L[0] === c && L[1] + L[2] <= tk))) free.push(c);
if (free.length) {
let k, b;
[k, rng] = rngInt(rng, free.length);
[b, rng] = rngNext(rng);
const bonus = b < 0.08 ? 1 : 0;
const life = Math.max(3, Math.round(lerp(7, 3, f) * (bonus ? 0.75 : 1)));
lights.push([free[k], tk, life, bonus]);
}
}
return { ...s, tk, lights, gone, combo, rng };
}
const __default = {
id: 'game-catch',
title: 'Catch the Light',
category: 'Reflex',
description: 'Sparks of light land on random keys: press each before its ring closes. Rounds speed up as they go; a rare prism is worth three and streaks build a combo.',
tags: ['game', 'reflex', 'whack', 'reaction', 'speed', 'arcade', 'interactive'],
surface: 'deck',
animated: false,
fps: 12,
loop: 4,
params: {
seconds: { type: 'select', default: '30', options: ['20', '30', '45'], label: 'Round length (s)' },
},
game: {
tickHz: TICK,
ticking: (s) => s.phase === 'run',
animate: 1.2,
init({ seed, grid, params }) {
return { cols: grid.cols, rows: grid.rows, phase: 'ready', tk: 0, dur: (+params.seconds || 30) * TICK, lights: [], score: 0, hits: 0, miss: 0, gone: 0, combo: 0, top: 0, best: 0, overAt: 0, rng: rngSeed(seed) };
},
reduce(s, ev) {
if (ev.type === 'tick') return s.phase === 'run' ? step(s, ev.t) : s;
if (ev.type !== 'press') return s;
const c = ev.cell, keyed = Number.isInteger(c) && c >= 0 && c < s.cols * s.rows;
if (!keyed && !Number.isInteger(ev.dial)) return s;
if (s.phase !== 'run') {
if (s.phase === 'over' && ev.t - s.overAt < 1) return s; 
return step({ ...s, phase: 'run', tk: -1, lights: [], score: 0, hits: 0, miss: 0, gone: 0, combo: 0, top: 0 }, ev.t);
}
if (!keyed) return s;
const L = s.lights.find((x) => x[0] === c);
if (!L) return { ...s, miss: s.miss + 1, combo: 0 };
const combo = s.combo + 1;
return { ...s, lights: s.lights.filter((x) => x !== L), score: s.score + (L[3] ? 3 : 1) + (combo >= 4 ? 1 : 0), hits: s.hits + 1, combo, top: Math.max(s.top, combo) };
},
},
order: 40,
render(ctx) {
const d = surface(ctx);
panelBase(d, ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const age = ageOf(ctx);
const quiet = !hasReadout(ctx), mid = middleCell(s.cols, s.rows);
const sub = ev?.type === 'tick' && Number.isFinite(age) ? clamp(age * TICK, 0, 1) : 0;
const now = s.tk + sub;
const evCell = ev?.type === 'press' && Number.isInteger(ev.cell) ? ev.cell : -1;
const hit = evCell >= 0 && prev?.lights?.find((x) => x[0] === evCell) && !s.lights.find((x) => x[0] === evCell);
const ended = s.phase === 'over' && prev?.phase === 'run';
const remain = s.phase === 'run' ? clamp(1 - now / s.dur) : s.phase === 'over' ? 0 : 1;
for (const c of cellsOf(ctx)) {
const L = s.lights.find((x) => x[0] === c.k);
const gone = !L && prev?.lights?.find((x) => x[0] === c.k) && ev?.type === 'tick' && s.phase === 'run';
const hue = L ? (L[3] ? HUE.amber : LIGHT_HUES[(c.k * 5 + L[1]) % LIGHT_HUES.length]) : HUE.coral;
if (quiet && c.k === mid && s.phase !== 'run' && !L) {
cellKey(d, c, (q) => statusKey(q, s.phase === 'ready' ? { title: 'Catch', value: s.best || '—', sub: 'press' } : { title: 'Score', value: s.score, sub: s.score >= s.best && s.score ? 'new best' : `best ${s.best}`, tone: 'ok' }), { hue: HUE.coral, tone: s.phase === 'over' ? 'ok' : 'idle' });
continue;
}
const isHit = hit && c.k === evCell, isMiss = evCell === c.k && !hit && s.phase === 'run' && prev?.phase === 'run' && age < 0.35;
const tone = L ? 'active' : isHit && age < 0.5 ? 'ok' : isMiss ? 'neg' : 'idle';
cellKey(d, c, (q) => {
q.background({ tone });
const box = q.theme.glyphBox(q, { labeled: false });
if (L) {
const born = clamp((now - L[1]) / 0.8), rem = clamp((L[1] + L[2] - now) / L[2]);
const a = outExpo(born);
if (L[3]) q.pictogram((g) => g.group({ scale: 0.4 + 0.6 * a, rotate: (1 - a) * -90 }, (h) => PIECES[0](h)), { box, tone: 'active' });
else q.pictogram((g) => g.group({ scale: 0.3 + 0.7 * a }, (h) => { h.circle(24, 24, 9.5, { role: 'accent', fill: true }); h.dot(24, 24, 3.6); }), { box, tone: 'active' });
q.pictogram((g) => { if (rem > 0.02) g.arc(24, 24, 17, 0, Math.max(2, 359.9 * rem), { role: 'accent', weight: 1.2, opacity: 0.35 + 0.65 * a }); }, { box, tone: rem < 0.34 ? 'warn' : 'active' });
} else {
q.pictogram((g) => g.circle(24, 24, 3.2, { role: 'dim', fill: false, opacity: s.phase === 'run' ? 0.7 : 0.45 }), { box, tone: 'idle' });
if (gone) q.pictogram((g) => g.circle(24, 24, 6.5 + 6 * clamp(age / 0.3), { role: 'dim', opacity: 1 - clamp(age / 0.3) }), { box, tone: 'idle' });
}
if (isHit) { burst(q, clamp(age / 0.55), { rays: 12 }); ringWave(q, clamp(age / 0.45)); }
if (ended) {
const b = sweepX(age, { t0: 0.1, dur: 0.8, pos: c.col, span: s.cols, w: q.w });
if (b.on) beam(q, b.x);
}
if (quiet && c.row === 0 && s.phase !== 'ready') { 
const f = clamp(remain * s.cols - c.col), y = q.m.bleed + q.m.u * 1.5, h = Math.max(1.5, q.m.u * 1.3);
const x0 = q.m.safe, w = q.w - q.m.safe * 2;
if (f > 0) q.add(rect({ x: x0, y, width: Math.max(h, w * f), height: h, rx: h / 2, fill: remain < 0.2 ? q.colors.warn : q.ctx.tint }));
}
}, { hue, tone });
}
const secs = Math.ceil(remain * s.dur / TICK);
readout(d, ctx, [
{ title: 'Score', value: s.score, sub: s.phase === 'ready' ? 'press any key' : s.phase === 'over' ? (s.score >= s.best && s.score ? 'new best' : 'final') : `${s.hits} caught`, hue: HUE.coral, tone: s.phase === 'over' ? 'ok' : 'idle', short: 'Score' },
{ title: 'Time', value: `0:${String(secs).padStart(2, '0')}`, bar: remain, barColor: remain < 0.2 ? undefined : undefined, hue: remain < 0.2 && s.phase === 'run' ? HUE.rose : HUE.amber, short: 'Time' },
{ title: 'Best', value: s.best || '—', sub: 'highest score', hue: HUE.citrine },
{ title: 'Combo', value: `×${s.combo}`, sub: `${s.gone} got away · top ×${s.top}`, hue: HUE.lime, tone: s.combo >= 4 ? 'active' : 'idle' },
]);
return d.svg();
},
};
};
__d[306] = function (__ns) {
const { surface, keyInto } = __m(113);
const { rngSeed, rngNext } = __m(106);
const { clamp } = __m(12);
const { ageOf, burst, HUE } = __m(269);
__e(__ns, { "default": () => __default }, [], ["default"]);
const SPIN = 0.95;
function coin(p, side, sx, { lift = 0 } = {}) {
const X = (x) => +(24 + (x - 24) * sx).toFixed(3);
p.group({ y: lift }, (g) => {
if (sx < 0.14) { g.rect(X(24) - 1.6, 9, 3.2, 30, { role: 'line', fill: true, r: 1.2 }); return; }
g.ellipse(24, 24, 15.5 * sx, 15.5, { role: 'line', weight: 1.1 });
g.ellipse(24, 24, 12 * sx, 12, { role: 'dim', weight: 0.6, opacity: 0.7 });
if (side === 'h') { 
g.ellipse(24, 24, 4.6 * sx, 4.6, { role: 'accent', fill: true });
for (let i = 0; i < 8; i++) {
const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
g.line(X(24 + s * 7), 24 - c * 7, X(24 + s * 9.6), 24 - c * 9.6, { role: 'accent', weight: 0.75 });
}
} else { 
const k = 0.46, T = (x, y) => `${X(24 + (x - 23) * k)} ${+(24 + (y - 24.5) * k).toFixed(3)}`, R = (r) => `${+(r * k * sx).toFixed(3)} ${+(r * k).toFixed(3)}`;
g.path(`M${T(28.5, 8.4)} A${R(16)} 0 1 0 ${T(40.6, 31)} A${R(12.5)} 0 1 1 ${T(28.5, 8.4)} Z`, { role: 'accent', fill: true });
}
});
}
const __default = {
id: 'game-coin',
title: 'Coin Flip',
category: 'Chance',
description: 'Flip a coin on one key: it leaps, spins edge-on and lands sun (heads) or moon (tails), keeping the streak and the tally. Seeded, so a game replays the same flips.',
tags: ['game', 'coin', 'flip', 'heads', 'tails', 'chance', 'toy', 'interactive'],
surface: 'key',
animated: false,
fps: 12,
loop: 2,
game: {
animate: 1.3,
readout(s) {
const tails = s.flips - s.heads;
return { title: 'Coin', cards: [
s.flips ? { title: 'Flip', value: s.face === 'h' ? 'Heads' : 'Tails', role: 'value', sub: s.face === 'h' ? 'the sun' : 'the moon', hue: s.face === 'h' ? HUE.amber : HUE.periwinkle, tone: 'active' } : { title: 'Coin', value: 'Ready', role: 'value', sub: 'press the key to flip', hue: HUE.amber },
{ title: 'Streak', value: s.flips ? s.streak : 0, sub: s.flips ? (s.face === 'h' ? 'heads' : 'tails') + ' in a row' : 'none yet', hue: HUE.citrine },
{ title: 'Heads', value: s.heads, bar: s.flips ? s.heads / s.flips : 0, hue: HUE.amber },
{ title: 'Tails', value: tails, bar: s.flips ? tails / s.flips : 0, hue: HUE.periwinkle },
] };
},
init({ seed }) {
const [x, rng] = rngNext(rngSeed(seed));
const face = x < 0.5 ? 'h' : 't';
return { face, was: face, flips: 0, heads: 0, streak: 0, rng };
},
reduce(s, ev) {
if (ev.type !== 'press') return s;
const [x, rng] = rngNext(s.rng);
const face = x < 0.5 ? 'h' : 't';
return { ...s, face, was: s.face, flips: s.flips + 1, heads: s.heads + (face === 'h' ? 1 : 0), streak: s.flips && face === s.face ? s.streak + 1 : 1, rng };
},
},
order: 20,
render(ctx) {
const k = surface(ctx);
const s = ctx.game;
const age = ageOf(ctx);
const flipping = age < SPIN && s.flips > 0;
const big = Math.min(k.w, k.h) >= 110;
let side = s.face, sx = 1, lift = 0;
if (flipping) {
const u = age / SPIN, H = s.face === s.was ? 6 : 7;
const th = H * Math.PI * (1 - Math.pow(1 - u, 2.2));
side = Math.floor((th + Math.PI / 2) / Math.PI) % 2 === 0 ? s.was : s.was === 'h' ? 't' : 'h';
sx = Math.abs(Math.cos(th));
lift = -Math.sin(u * Math.PI) * 9;
}
const landed = s.flips > 0 && age >= SPIN && age < SPIN + 0.35;
const hue = side === 'h' ? HUE.citrine : HUE.periwinkle;
const tone = flipping || landed ? 'active' : s.flips ? 'active' : 'idle';
keyInto(k, { x: 0, y: 0, w: k.w, h: k.h, i: 0 }, (q) => {
q.background({ tone });
const box = q.theme.glyphBox(q, { labeled: true });
if (flipping || landed) q.pictogram((g) => g.ellipse(24, 43.5, 10 * (1 + lift / 18), 1.4, { role: 'dim', fill: true, opacity: 0.5 }), { box, tone });
const squash = landed ? 1 + 0.06 * Math.sin(clamp((age - SPIN) / 0.25) * Math.PI) : 1;
q.pictogram((g) => g.group({ scale: squash }, (h) => coin(h, side, sx, { lift })), { box, tone: flipping ? 'active' : tone });
if (landed) burst(q, clamp((age - SPIN) / 0.5), { cy: box.y + box.size / 2, r0: box.size * 0.36, r1: box.size * 0.62, rays: 12, alpha: 0.8, hues: [hue, HUE.amber, hue, HUE.violet] });
q.label(flipping ? '…' : !s.flips ? 'Flip' : s.face === 'h' ? 'Heads' : 'Tails', { color: flipping ? 'muted' : 'ink' });
if (big && s.flips && !flipping) q.eyebrow(s.streak > 1 ? `${s.streak} in a row` : `H ${s.heads} · T ${s.flips - s.heads}`, { align: 'center', x: q.w / 2 });
}, { hue, tone });
return k.svg();
},
};
};
__d[307] = function (__ns) {
const { surface } = __m(113);
const { rngSeed, rngInt } = __m(106);
const { clamp, outExpo } = __m(12);
const { hash } = __m(1);
const { HUE } = __m(269);
__e(__ns, { "default": () => __default }, [], ["default"]);
const ROLL = 0.8; 
const PIPS = { 
1: [[24, 24]],
2: [[16, 16], [32, 32]],
3: [[16, 16], [24, 24], [32, 32]],
4: [[16, 16], [32, 16], [16, 32], [32, 32]],
5: [[16, 16], [32, 16], [24, 24], [16, 32], [32, 32]],
6: [[16, 15], [32, 15], [16, 24], [32, 24], [16, 33], [32, 33]],
};
function roll(rng, count) {
const faces = [];
for (let i = 0; i < count; i++) { let f; [f, rng] = rngInt(rng, 6); faces.push(f + 1); }
return { faces, rng };
}
const __default = {
id: 'game-dice',
title: 'Dice',
category: 'Chance',
description: 'Press to roll one or two dice: they tumble, hop and land on the result, drawn in the deck theme. Seeded, so the same game replays the same rolls.',
tags: ['game', 'dice', 'chance', 'random', 'roll', 'toy', 'interactive'],
surface: 'key',
animated: false,
fps: 12,
loop: 2,
params: {
count: { type: 'number', default: 1, min: 1, max: 2, step: 1, label: 'Dice' },
label: { type: 'text', default: 'Roll', label: 'Label', maxLength: 10 },
},
game: {
animate: 1,
readout(s) {
const sum = s.faces.reduce((a, b) => a + b, 0), two = s.faces.length > 1, dbl = two && s.faces[0] === s.faces[1];
return { title: 'Dice', cards: [
s.rolls ? { title: 'Rolled', value: sum, sub: two ? s.faces.join(' + ') + (dbl ? ' · doubles' : '') : 'one die', hue: HUE.amber, tone: dbl ? 'ok' : 'active' } : { title: 'Dice', value: 'Ready', role: 'value', sub: 'press the key to roll', hue: HUE.amber },
{ title: 'Rolls', value: s.rolls, sub: 'this game', hue: HUE.citrine },
{ title: 'Dice', value: s.faces.length, sub: two ? 'two dice: 2–12' : 'one die: 1–6', hue: HUE.coral },
{ title: 'Odds', value: two ? Math.round((100 * (6 - Math.abs(sum - 7))) / 36) + '%' : '17%', role: 'value', sub: s.rolls ? 'of rolling ' + (two ? sum : s.faces[0]) : 'each face', hue: HUE.lime },
] };
},
init({ seed, params }) {
const count = Math.round(params.count) === 2 ? 2 : 1;
const r = roll(rngSeed(seed), count);
return { count, faces: r.faces, rolls: 0, rng: r.rng };
},
reduce(s, ev) {
if (ev.type !== 'press') return s;
const r = roll(s.rng, s.count);
return { ...s, faces: r.faces, rolls: s.rolls + 1, rng: r.rng };
},
},
order: 10,
render(ctx) {
const k = surface(ctx);
const s = ctx.game, ev = ctx.gameEvent;
const age = ctx.reduced || !ev || ev.type !== 'press' ? Infinity : ev.age;
const rolling = age < ROLL;
k.background({ tone: age < ROLL + 0.6 ? 'active' : 'idle' });
const box = k.theme.glyphBox(k, { labeled: true });
const n = s.faces.length;
const size = n === 2 ? Math.min(box.size * 0.86, k.w * 0.42) : box.size;
const cy = box.y + box.size / 2;
s.faces.forEach((final, j) => {
const cx = n === 2 ? k.w / 2 + (j ? 1 : -1) * size * 0.54 : k.w / 2;
let face = final, rotate = 0, scale = 1, hop = 0;
if (rolling) {
const u = age / ROLL, frame = Math.floor(age * 14);
face = 1 + Math.floor(hash(ev.seed | 0, j, frame) * 6);
rotate = (1 - outExpo(u)) * 540 * (j ? -1 : 1);
scale = 1 + 0.08 * (1 - u);
hop = -Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 7;
} else if (age < ROLL + 0.2) scale = 1 + 0.07 * Math.sin(clamp((age - ROLL) / 0.2) * Math.PI); 
k.pictogram((p) => p.group({ rotate, scale, y: hop }, (g) => {
g.rect(8, 8, 32, 32, { role: rolling ? 'accent' : 'line', r: 7, fill: false });
for (const [x, y] of PIPS[face]) g.circle(x, y, 3.3, { role: 'fill' });
}), { box: { x: cx - size / 2, y: cy - size / 2, size }, tone: rolling ? 'active' : 'idle' });
});
const sum = s.faces.reduce((a, b) => a + b, 0);
k.label(rolling || !s.rolls ? ctx.params.label : n === 2 ? `= ${sum}` : ctx.params.label, { color: rolling ? 'muted' : 'ink' });
return k.svg();
},
};
};
__d[308] = function (__ns) {
const { surface } = __m(113);
const { rngSeed, rngInt } = __m(106);
const { clamp, outExpo, pulse } = __m(12);
const { cellsOf, ageOf, spread, beam, sweepX, burst, readout, hasReadout, statusKey, cellKey, panelBase, HUE, progressBeam, middleCell } = __m(269);
const { PADS } = __m(304);
__e(__ns, { "padLayout": () => padLayout, "padOf": () => padOf, "default": () => __default }, [], ["default","padLayout","padOf"]);
function padLayout(cols, rows) {
let best = null;
for (const [axis, L] of [['c', cols], ['r', rows]]) for (let g = 1; g <= L; g++) {
if (L % g) continue;
const pads = L / g;
if (pads < 3 || pads > 6) continue;
const score = Math.abs(pads - 4) * 10 - pads + (axis === 'c' ? 0 : 0.5);
if (!best || score < best.score) best = { axis, g, pads, score };
}
if (!best) return { axis: 'k', g: 1, pads: Math.max(1, Math.min(6, cols * rows)) };
return { axis: best.axis, g: best.g, pads: best.pads };
}
const padOf = (s, cell) => {
const col = cell % s.cols, row = Math.floor(cell / s.cols);
return s.axis === 'c' ? Math.floor(col / s.g) : s.axis === 'r' ? Math.floor(row / s.g) : cell % s.pads;
};
const onTicks = (s) => (s.seq.length <= 5 ? 2 : 1); 
const start = (s) => { const [p, rng] = rngInt(s.rng, s.pads); return { ...s, seq: String(p), phase: 'show', tk: -2, i: 0, lit: -1, wrong: -1, want: -1, rng }; };
const __default = {
id: 'game-echo',
title: 'Echo',
category: 'Reflex',
description: 'The light plays a sequence across spectral pads, each with its own hue, shape and λ; play it back. Every round adds a note and the pace picks up.',
tags: ['game', 'memory', 'sequence', 'echo', 'reflex', 'spectrum', 'interactive'],
surface: 'deck',
animated: false,
fps: 12,
loop: 4,
params: {
goal: { type: 'select', default: '14', options: ['8', '14', '20', '31'], label: 'Notes for a perfect run' },
},
game: {
tickHz: 4,
ticking: (s) => s.phase === 'show',
animate: 1.4,
init({ seed, grid, params }) {
const L = padLayout(grid.cols, grid.rows);
return { cols: grid.cols, rows: grid.rows, ...L, goal: +params.goal || 14, seq: '', phase: 'ready', tk: 0, i: 0, lit: -1, wrong: -1, want: -1, best: 0, rng: rngSeed(seed) };
},
reduce(s, ev) {
if (ev.type === 'tick') {
if (s.phase !== 'show') return s;
const tk = s.tk + 1, on = onTicks(s), step = Math.floor(tk / (on + 1));
if (tk < 0) return { ...s, tk, lit: -1 };
if (step >= s.seq.length) return { ...s, tk, phase: 'input', i: 0, lit: -1 };
return { ...s, tk, lit: tk % (on + 1) < on ? +s.seq[step] : -1 };
}
if (ev.type !== 'press') return s;
const keyed = Number.isInteger(ev.cell) && ev.cell >= 0 && ev.cell < s.cols * s.rows;
if (!keyed && !Number.isInteger(ev.dial)) return s;
if (s.phase === 'ready' || s.phase === 'over' || s.phase === 'won') return start(s);
if (s.phase !== 'input' || !keyed) return s;
const p = padOf(s, ev.cell), want = +s.seq[s.i];
if (p !== want) return { ...s, phase: 'over', wrong: p, want, best: Math.max(s.best, s.seq.length - 1) };
const i = s.i + 1;
if (i < s.seq.length) return { ...s, i };
if (s.seq.length >= s.goal) return { ...s, i, phase: 'won', best: Math.max(s.best, s.seq.length) };
const [n, rng] = rngInt(s.rng, s.pads);
return { ...s, i: 0, seq: s.seq + n, phase: 'show', tk: -3, lit: -1, rng };
},
},
order: 30,
render(ctx) {
const d = surface(ctx);
panelBase(d, ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const age = ageOf(ctx);
const hues = spread(s.pads);
const evPad = ev?.type === 'press' && Number.isInteger(ev.cell) ? padOf(s, ev.cell) : -1;
const level = (p) => { 
if (s.phase === 'won') return 1;
if (s.phase === 'show' && p === s.lit) return ev?.type === 'tick' ? outExpo(clamp(age / 0.12)) : 1;
if (s.phase === 'show' && prev && prev.lit === p && ev?.type === 'tick') return 1 - clamp(age / 0.16);
if (s.phase === 'over' && p === s.want) return ctx.reduced || age > 1.4 ? 0.7 : 0.25 + 0.75 * pulse(age, 0.35);
if (p === evPad && (s.phase === 'input' || (s.phase === 'show' && prev?.phase === 'input'))) return age < 0.16 ? 1 : 1 - clamp((age - 0.16) / 0.3);
return 0;
};
const quiet = !hasReadout(ctx);
const mid = middleCell(s.cols, s.rows);
const won = s.phase === 'won' && prev && prev.phase !== 'won';
for (const c of cellsOf(ctx)) {
const p = padOf(s, c.k), hue = hues[p], L = level(p), shape = PADS[p % PADS.length];
const wrong = s.phase === 'over' && p === s.wrong;
if (quiet && c.k === mid && (s.phase === 'ready' || s.phase === 'over' || s.phase === 'won')) {
cellKey(d, c, (q) => statusKey(q, s.phase === 'ready' ? { title: 'Echo', value: s.best || '—', sub: 'press' } : s.phase === 'won' ? { title: 'Perfect', value: s.best, sub: 'notes', tone: 'ok' } : { title: 'Round', value: s.seq.length - 1, sub: `best ${s.best}`, tone: 'idle' }), { hue: HUE.coral, tone: s.phase === 'won' ? 'ok' : 'idle' });
continue;
}
const tone = wrong ? 'neg' : L > 0.45 ? 'active' : 'idle';
cellKey(d, c, (q) => {
q.background({ tone });
const big = Math.min(q.w, q.h) >= 110;
const box = q.theme.glyphBox(q, { labeled: false });
if (L < 0.999) q.pictogram((g) => shape(g, { fill: false }), { box, tone: 'active', opacity: s.phase === 'show' || s.phase === 'over' ? 0.45 : 0.8 });
if (L > 0.001) q.pictogram((g) => g.group({ scale: 0.86 + 0.14 * L, opacity: L }, (h) => shape(h, { fill: true })), { box, tone: 'active' });
if (big && ((s.axis === 'r' && c.col === 0) || (s.axis !== 'r' && c.row === 0))) q.lambda({ hue, color: L > 0.45 ? 'ink' : 'dim' });
if (wrong) burst(q, clamp(age / 0.7), { hues: [HUE.rose, HUE.coral, HUE.amber], rays: 10 });
if (won) {
const b = sweepX(age, { t0: 0.05, dur: 0.9, pos: c.col, span: s.cols, w: q.w });
if (b.on) beam(q, b.x);
burst(q, clamp((age - 0.3 - p * 0.1) / 0.7));
}
}, { hue, tone });
}
const len = s.seq.length;
const phaseText = { ready: 'Press any key', show: 'Watch', input: 'Your turn', over: 'Missed', won: 'Perfect' }[s.phase];
readout(d, ctx, [
{ title: 'Round', value: s.phase === 'ready' ? '—' : s.phase === 'over' ? len - 1 : len, sub: s.phase === 'over' ? `missed note ${s.i + 1}` : s.phase === 'ready' ? 'press any key' : 'notes', hue: HUE.coral, short: 'Round', tone: s.phase === 'over' ? 'neg' : 'idle' },
{ title: 'Best', value: s.best || '—', sub: 'longest echo', hue: HUE.amber },
{
title: phaseText, hue: s.phase === 'input' ? HUE.jade : s.phase === 'over' ? HUE.rose : HUE.cyan, tone: s.phase === 'won' ? 'ok' : s.phase === 'input' ? 'active' : 'idle',
draw: (p, F) => { 
if (!len) return;
const done = s.phase === 'input' ? s.i : s.phase === 'show' ? Math.max(0, Math.floor(Math.max(0, s.tk) / (onTicks(s) + 1))) : s.phase === 'over' ? s.i : len;
if (len > 16) { progressBeam(p, { x: F.x0, y: p.h * 0.6, w: F.w, value: done / len }); return; }
const gap = Math.min(F.w / len, p.m.u * 9), r = Math.min(gap * 0.32, p.m.u * 2.6), y = p.h * 0.6;
const dots = (from, to) => { let dd = ''; for (let k = from; k < to; k++) { const x = F.x0 + r + k * gap; dd += `M${(x + r).toFixed(2)} ${y.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x - r).toFixed(2)} ${y.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x + r).toFixed(2)} ${y.toFixed(2)}Z`; } return dd; };
if (done) p.add(`<path d="${dots(0, done)}" fill="${p.ctx.tint}"/>`);
if (done < len) p.add(`<path d="${dots(done, len)}" fill="${p.colors.dim}" fill-opacity="0.6"/>`);
},
},
{ title: 'Goal', value: s.goal, sub: `${Math.min(len, s.goal)} of ${s.goal}`, bar: Math.min(1, (s.phase === 'over' ? len - 1 : len) / s.goal), hue: HUE.violet },
]);
return d.svg();
},
};
};
__d[309] = function (__ns) {
const { surface, keyInto } = __m(113);
const { gameGrid } = __m(98);
const { rngSeed, rngShuffle } = __m(106);
const { clamp, lerp, outExpo } = __m(12);
const { hash } = __m(1);
const { HUE } = __m(269);
__e(__ns, { "toggle": () => toggle, "deal": () => deal, "default": () => __default }, [], ["deal","default","toggle"]);
const BASE = { easy: 2, normal: 4, hard: 7 };
const NEIGHBORS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
function toggle(lights, cols, rows, cell) {
const a = lights.split('');
const c = cell % cols, r = Math.floor(cell / cols);
for (const [dc, dr] of NEIGHBORS) {
const x = c + dc, y = r + dr;
if (x >= 0 && x < cols && y >= 0 && y < rows) { const k = y * cols + x; a[k] = a[k] === '1' ? '0' : '1'; }
}
return a.join('');
}
function deal(cols, rows, rng, level, difficulty = 'normal') {
const N = cols * rows;
const presses = Math.max(1, Math.min(N, (BASE[difficulty] ?? 4) + (level - 1) * 2));
let order;
[order, rng] = rngShuffle(rng, Array.from({ length: N }, (_, i) => i));
let lights = '0'.repeat(N);
for (const k of order.slice(0, presses)) lights = toggle(lights, cols, rows, k);
for (let i = presses; !lights.includes('1'); i++) lights = toggle(lights, cols, rows, order[i % N]);
return { lights, rng, par: presses };
}
const solvedState = (s) => !s.lights.includes('1');
const __default = {
id: 'game-lights-out',
title: 'Lights Out',
category: 'Puzzles',
description: 'The toggle puzzle on any block of keys: a press flips a key and its neighbors; switch every light off. Every board is solvable and each level gets harder.',
tags: ['game', 'puzzle', 'lights out', 'toggle', 'logic', 'interactive'],
surface: 'span',
span: { cols: 'all', rows: 'all' },
animated: false,
fps: 12,
loop: 4,
params: {
difficulty: { type: 'select', default: 'normal', options: ['easy', 'normal', 'hard'], label: 'Difficulty' },
},
game: {
readout(s) {
let lit = 0;
for (const c of s.lights) if (c === '1') lit++;
return { title: 'Lights Out', cards: [
{ title: s.solved ? 'Solved' : 'Lights on', value: s.solved ? 'Dark!' : lit, role: s.solved ? 'value' : 'hero', sub: s.solved ? 'press a key: next level' : 'turn them all off', hue: HUE.citrine, tone: s.solved ? 'ok' : 'active' },
{ title: 'Moves', value: s.moves, sub: 'par ' + s.par, hue: HUE.amber, tone: s.solved && s.moves <= s.par ? 'ok' : 'idle' },
{ title: 'Level', value: s.level, sub: s.difficulty, hue: HUE.violet },
{ title: 'Board', value: s.cols + '×' + s.rows, role: 'value', sub: 'a press flips a cross', hue: HUE.cyan },
] };
},
animate: 0.7,
cell(s, k) { const on = s.lights[k] === '1'; return { label: on ? 'lit' : 'off', pressed: on }; },
init({ seed, grid, params }) {
const { cols, rows } = grid;
const level = 1;
const d = deal(cols, rows, rngSeed(seed), level, params.difficulty);
return { cols, rows, difficulty: params.difficulty, lights: d.lights, moves: 0, level, par: d.par, solved: false, rng: d.rng };
},
reduce(s, ev) {
if (ev.type !== 'press' || ev.cell === null || ev.cell === undefined || ev.cell >= s.cols * s.rows) return s;
if (s.solved) { 
const level = s.level + 1;
const d = deal(s.cols, s.rows, s.rng, level, s.difficulty);
return { ...s, lights: d.lights, moves: 0, level, par: d.par, solved: false, rng: d.rng };
}
const lights = toggle(s.lights, s.cols, s.rows, ev.cell);
const next = { ...s, lights, moves: s.moves + 1 };
next.solved = solvedState(next);
return next;
},
},
order: 10,
render(ctx) {
const k = surface(ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const G = gameGrid(ctx);
const age = ctx.reduced || !ev ? Infinity : ev.age;
const fresh = prev && prev.solved && !s.solved; 
const pressed = ev?.type === 'press' && Number.isInteger(ev.col) ? [ev.col, ev.row] : null;
const mid = G.cells.reduce((best, c, i) => { const d = Math.abs(c.col - (G.cols - 1) / 2) + Math.abs(c.row - (G.rows - 1) / 2); return d < best.d ? { i, d } : best; }, { i: 0, d: Infinity }).i;
ctx.grid.cells.forEach((cell, i) => {
const { col, row } = G.cells[i];
const lit = s.lights[i] === '1';
const dist = pressed ? Math.abs(col - pressed[0]) + Math.abs(row - pressed[1]) : 0;
let on = lit ? 1 : 0;
if (fresh) on *= outExpo(clamp((age - hash(i, s.level) * 0.3) / 0.3));
else if (prev && !s.solved && prev.lights.length === s.lights.length && (prev.lights[i] === '1') !== lit) on = lerp(lit ? 0 : 1, on, outExpo(clamp((age - dist * 0.06) / 0.2)));
keyInto(k, cell, (q) => {
if (s.solved) {
q.background({ tone: 'ok' });
const w = clamp((age - dist * 0.09) / 0.4); 
q.pictogram((p) => {
p.circle(24, 24, 13, { role: 'dim', fill: false });
if (w < 1) p.group({ scale: 0.5 + 0.9 * outExpo(w), opacity: 1 - w }, (g) => g.circle(24, 24, 13, { role: 'accent', fill: false }));
}, { tone: 'ok', labeled: i === mid });
if (i === mid) q.label(s.moves === 1 ? '1 move' : `${s.moves} moves`, { color: 'ink' });
return;
}
const tone = on > 0.5 ? 'active' : 'idle';
q.background({ tone });
q.pictogram((p) => {
if (on < 0.99) p.circle(24, 24, 13, { role: 'dim', fill: false, opacity: 1 - on });
if (on > 0.01) p.group({ scale: 0.35 + 0.65 * on, opacity: on }, (g) => { g.circle(24, 24, 13, { role: 'accent', fill: true }); g.circle(24, 24, 4.5, { role: 'spark' }); });
}, { tone });
}, { tone: s.solved ? 'ok' : on > 0.5 ? 'active' : 'idle' });
});
return k.svg();
},
};
};
__d[310] = function (__ns) {
const { surface, P } = __m(113);
const { rngSeed, rngShuffle } = __m(106);
const { clamp } = __m(12);
const { cellsOf, ageOf, spread, beam, sweepX, burst, converge, readout, statusKey, cellKey, panelBase, HUE, middleCell } = __m(269);
const { PIECES } = __m(304);
__e(__ns, { "dealBoard": () => dealBoard, "default": () => __default }, [], ["dealBoard","default"]);
const HOLD = 1.0; 
const FLIP = 0.34; 
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const BACK = [14, 24, 34].flatMap((y) => [14, 24, 34].map((x) => { const r = x === 24 && y === 24 ? 2.6 : 1.8; return P().M(x + r, y).A(r, r, 0, 0, 1, x - r, y).A(r, r, 0, 0, 1, x + r, y).Z().d; })).join('');
function dealBoard(cols, rows, rng) {
const N = cols * rows;
const pairs = Math.max(1, Math.min(PIECES.length, Math.floor(N / 2)));
let pieces, order;
[pieces, rng] = rngShuffle(rng, PIECES.map((_, i) => i));
pieces = pieces.slice(0, pairs);
const spare = new Set();
if (N - pairs * 2 >= 1) spare.add(middleCell(cols, rows));
for (let i = N - 1; spare.size < N - pairs * 2; i--) if (!spare.has(i)) spare.add(i);
const deck = [];
for (let p = 0; p < pairs; p++) deck.push(p, p);
[order, rng] = rngShuffle(rng, deck);
let k = 0, cards = '';
for (let i = 0; i < N; i++) cards += spare.has(i) ? '.' : B36[order[k++]];
return { cards, pieces, pairs, rng };
}
const fresh = (s, d, extra = {}) => ({ ...s, cards: d.cards, pieces: d.pieces, pairs: d.pairs, left: d.pairs, found: '0'.repeat(d.cards.length), open: -1, miss: [], missAt: 0, hide: [], moves: 0, won: false, last: -1, rng: d.rng, ...extra });
const __default = {
id: 'game-memory',
title: 'Memory',
category: 'Puzzles',
description: 'Pairs of pieces hidden across every key: flip two at a time, they refract into view; match them all in as few moves as you can. The screen or strip keeps score.',
tags: ['game', 'memory', 'pairs', 'concentration', 'puzzle', 'interactive'],
surface: 'deck',
animated: false,
fps: 12,
loop: 4,
game: {
animate: 1.45,
init({ seed, grid }) {
const d = dealBoard(grid.cols, grid.rows, rngSeed(seed));
return fresh({ cols: grid.cols, rows: grid.rows, best: 0, deals: 1 }, d);
},
reduce(s, ev) {
if (ev.type !== 'press') return s;
if (Number.isInteger(ev.dial) && ev.cell === undefined) { 
if (!s.moves && !s.won) return s;
return fresh(s, dealBoard(s.cols, s.rows, s.rng), { deals: s.deals + 1 });
}
const c = ev.cell;
if (!Number.isInteger(c) || c < 0 || c >= s.cards.length || s.cards[c] === '.') return s;
if (s.won) return fresh(s, dealBoard(s.cols, s.rows, s.rng), { deals: s.deals + 1 });
if (s.found[c] === '1' || c === s.open) return s;
const hide = s.miss.length && ev.t - s.missAt < HOLD + FLIP ? s.miss.filter((x) => x !== c) : [];
if (s.open < 0) return { ...s, open: c, miss: [], hide };
const a = s.open, moves = s.moves + 1;
if (s.cards[a] === s.cards[c]) {
const f = s.found.split('');
f[a] = '1'; f[c] = '1';
const left = s.left - 1, won = left === 0;
return { ...s, found: f.join(''), open: -1, miss: [], hide, moves, left, won, last: B36.indexOf(s.cards[c]), best: won ? (s.best ? Math.min(s.best, moves) : moves) : s.best };
}
return { ...s, open: -1, miss: [a, c], missAt: ev.t, hide, moves };
},
},
order: 20,
render(ctx) {
const d = surface(ctx);
panelBase(d, ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const age = ageOf(ctx);
const hues = spread(s.pairs);
const pairOf = (i) => B36.indexOf(s.cards[i]);
const dealt = prev && prev.deals !== s.deals;
const evCell = ev?.type === 'press' && Number.isInteger(ev.cell) ? ev.cell : -1;
const matched = s.last >= 0 && prev && prev.left !== s.left;
for (const c of cellsOf(ctx)) {
const i = c.k;
if (s.cards[i] === '.') { 
cellKey(d, c, (q) => statusKey(q, s.won ? { title: 'Clear', value: s.moves, sub: 'moves', tone: 'ok' } : { title: 'Moves', value: s.moves, sub: `${s.left} left` }), { hue: HUE.coral, tone: s.won ? 'ok' : 'idle' });
continue;
}
const p = pairOf(i), hue = hues[p], piece = PIECES[s.pieces[p]];
const found = s.found[i] === '1', inMiss = s.miss.includes(i), inHide = s.hide.includes(i);
let u;
if (dealt) u = 1 - clamp((age - (c.col + c.row) * 0.05) / FLIP);
else if (found) u = i === evCell ? clamp(age / FLIP) : 1;
else if (inMiss) u = ctx.reduced ? 1 : Math.min(i === evCell ? clamp(age / FLIP) : 1, 1 - clamp((age - HOLD) / (FLIP * 0.8)));
else if (i === s.open) u = i === evCell ? clamp(age / FLIP) : 1;
else if (inHide) u = 1 - clamp(age / (FLIP * 0.8));
else u = 0;
if (dealt && u <= 0) u = 0;
const missing = inMiss && !ctx.reduced && age > FLIP * 0.6 && age < HOLD;
const tone = u < 0.5 ? 'idle' : missing ? 'neg' : found && !s.won ? 'idle' : 'active';
cellKey(d, c, (q) => {
q.background({ tone });
if (u < 0.5) { 
const b = 1 - u * 2;
q.pictogram((g) => g.group({ scale: 0.6 + 0.4 * b, opacity: b }, (h) => h.path(BACK, { role: 'dim', fill: true })), { tone: 'idle' });
}
if (u > 0.25) converge(q, piece, clamp((u - 0.25) / 0.75), { tone: 'active', opacity: found && !s.won ? 0.78 : 1 });
if (matched && found && (i === evCell || i === prev.open)) burst(q, clamp((age - FLIP * 0.7) / 0.6), { hues: [hue, HUE.rose, hue, HUE.violet] , rays: 10 });
if (s.won && !dealt && prev && !prev.won) {
const b = sweepX(age, { t0: 0.35, dur: 0.85, pos: c.col, span: s.cols, w: q.w });
if (b.on) beam(q, b.x);
burst(q, clamp((age - 0.55 - c.col * 0.08) / 0.7), { rays: 12, alpha: 0.85 });
}
}, { hue: u < 0.5 ? HUE.coral : hue, tone });
}
const piece = s.last >= 0 ? PIECES[s.pieces[s.last]] : null;
const galleon = ctx.deck?.screen?.kind === 'galleon';
readout(d, ctx, [
{ title: 'Pairs', value: `${s.pairs - s.left}/${s.pairs}`, bar: (s.pairs - s.left) / s.pairs, hue: HUE.coral, short: 'Pairs' },
{ title: 'Moves', value: s.moves, sub: s.won ? 'cleared' : s.open >= 0 ? 'pick a match' : 'turn two keys', hue: HUE.amber, tone: s.won ? 'ok' : 'idle' },
{ title: 'Best', value: s.best || '—', sub: 'fewest moves', hue: HUE.citrine },
piece
? { title: s.won ? 'Clear' : 'Last pair', hue: hues[s.last], tone: s.won ? 'ok' : 'active', sub: galleon ? 'push a dial · new deal' : undefined, draw: (p, F) => p.pictogram(piece, { box: { x: p.w - F.pad - p.h * 0.62, y: p.h * 0.2, size: p.h * 0.6 }, tone: 'active' }) }
: { title: 'Memory', value: undefined, sub: galleon ? 'push a dial · new deal' : 'find every pair', hue: HUE.coral, draw: (p, F) => p.pictogram(PIECES[0], { box: { x: p.w - F.pad - p.h * 0.62, y: p.h * 0.2, size: p.h * 0.6 }, tone: 'idle' }) },
]);
return d.svg();
},
};
};
__d[311] = function (__ns) {
const { surface } = __m(113);
const { rngSeed, rngNext, rngInt } = __m(106);
const { getDevice } = __m(0);
const { clamp, outExpo } = __m(12);
const { cellsOf, ageOf, beam, sweepX, burst, convergeText, readout, hasReadout, statusKey, cellKey, panelBase, HUE } = __m(269);
const { arrow } = __m(304);
__e(__ns, { "tileHue": () => tileHue, "layout": () => layout, "slide": () => slide, "edgeDir": () => edgeDir, "default": () => __default }, [], ["default","edgeDir","layout","slide","tileHue"]);
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const DIRS = ['left', 'right', 'up', 'down'];
const ARROW_OF = { L: 'left', R: 'right', U: 'up', D: 'down' };
const tileHue = (e) => (e >= 12 ? HUE.violet : +(HUE.violet - (e - 1) * ((HUE.violet - HUE.rose) / 10)).toFixed(1));
function layout(cols, rows) {
const bc = cols - Math.min(4, cols) === 1 ? 3 : Math.min(4, cols), br = Math.min(4, rows);
const bx = Math.floor((cols - bc) / 2), by = Math.floor((rows - br) / 2);
const roles = Array(cols * rows).fill('.');
const at = (c, r, v) => { if (c >= 0 && c < cols && r >= 0 && r < rows && roles[r * cols + c] === '.') roles[r * cols + c] = v; };
for (let r = 0; r < br; r++) for (let c = 0; c < bc; c++) roles[(by + r) * cols + bx + c] = 'b';
if (rows >= 3) { 
for (let r = 0; r < rows; r++) { const v = r === 0 ? 'U' : r === rows - 1 ? 'D' : null; at(bx - 1, r, v || 'L'); at(bx + bc, r, v || 'R'); }
} else {
for (let r = 0; r < rows; r++) { at(bx - 1, r, 'L'); at(bx + bc, r, 'R'); at(bx - 2, r, r === 0 ? 'U' : 'D'); at(bx + bc + 1, r, r === 0 ? 'U' : 'D'); }
}
const free = roles.map((v, i) => (v === '.' ? i : -1)).filter((i) => i >= 0);
if (free.length) roles[free[0]] = 's';
if (free.length > 1) roles[free.find((i) => i % cols >= cols / 2 && Math.floor(i / cols) === Math.floor(free[0] / cols)) ?? free[free.length - 1]] = 'h';
return { bx, by, bc, br, roles: roles.join('') };
}
function lines(bc, br, dir) {
const L = [];
if (dir === 'left' || dir === 'right') for (let r = 0; r < br; r++) { const row = []; for (let c = 0; c < bc; c++) row.push(r * bc + c); L.push(dir === 'left' ? row : row.reverse()); }
else for (let c = 0; c < bc; c++) { const col = []; for (let r = 0; r < br; r++) col.push(r * bc + c); L.push(dir === 'up' ? col : col.reverse()); }
return L;
}
function slide(b, bc, br, dir) {
const out = b.slice(), merged = [];
let gained = 0;
for (const line of lines(bc, br, dir)) {
const vals = line.map((i) => b[i]).filter((v) => v > 0), res = [];
for (let k = 0; k < vals.length; k++) {
if (k + 1 < vals.length && vals[k] === vals[k + 1]) { res.push(vals[k] + 1); gained += 2 ** (vals[k] + 1); merged.push(line[res.length - 1]); k++; } else res.push(vals[k]);
}
line.forEach((i, k) => { out[i] = res[k] || 0; });
}
return { board: out, gained, merged, moved: out.some((v, i) => v !== b[i]) };
}
const decode = (s) => [...s].map((ch) => B36.indexOf(ch));
const encode = (b) => b.map((v) => B36[v]).join('');
const canMove = (b, bc, br) => b.includes(0) || DIRS.some((d) => slide(b, bc, br, d).moved);
function spawn(b, rng) {
const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
if (!empty.length) return { b, rng, at: -1 };
let k, x;
[k, rng] = rngInt(rng, empty.length);
[x, rng] = rngNext(rng);
const out = b.slice();
out[empty[k]] = x < 0.9 ? 1 : 2;
return { b: out, rng, at: empty[k] };
}
function newBoard(s, rng) {
let b = Array(s.bc * s.br).fill(0), r;
r = spawn(b, rng); b = r.b;
r = spawn(b, r.rng); b = r.b;
return { ...s, board: encode(b), score: 0, moves: 0, max: Math.max(...b), over: false, won: false, dir: null, merged: [], spawn: -1, rng: r.rng };
}
function move(s, dir) {
const b = decode(s.board), r = slide(b, s.bc, s.br, dir);
if (!r.moved) return s;
const sp = spawn(r.board, s.rng);
const score = s.score + r.gained, max = Math.max(...sp.b);
return { ...s, board: encode(sp.b), score, best: Math.max(s.best, score), moves: s.moves + 1, max, won: s.won || max >= 11, over: !canMove(sp.b, s.bc, s.br), dir, merged: r.merged, spawn: sp.at, rng: sp.rng };
}
function edgeDir(x, y, bc, br) {
const dx = x - (bc - 1) / 2, dy = y - (br - 1) / 2;
if (!dx && !dy) return null;
return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}
const __default = {
id: 'game-merge',
title: 'Merge',
category: 'Puzzles',
description: 'Slide numbered tiles with dials, arrow keys or the board edges; equal tiles fuse and double. Reach 2048 as the tiles cool from violet to rose, then turn to light.',
tags: ['game', 'puzzle', '2048', 'merge', 'tiles', 'numbers', 'dials', 'interactive'],
surface: 'deck',
animated: false,
fps: 12,
loop: 4,
game: {
animate: 0.9,
init({ seed, grid, device }) {
const L = layout(grid.cols, grid.rows);
return newBoard({ cols: grid.cols, rows: grid.rows, ...L, dials: (getDevice(device).dials?.count || 0) > 0, best: 0 }, rngSeed(seed));
},
reduce(s, ev) {
let dir = null;
if (ev.type === 'press') {
if (s.over) return Number.isInteger(ev.cell) || Number.isInteger(ev.dial) ? newBoard(s, s.rng) : s;
const c = ev.cell;
if (!Number.isInteger(c) || c < 0 || c >= s.roles.length) return s;
const role = s.roles[c];
if (ARROW_OF[role]) dir = ARROW_OF[role];
else if (role === 'b') dir = edgeDir((c % s.cols) - s.bx, Math.floor(c / s.cols) - s.by, s.bc, s.br);
} else if (ev.type === 'rotate' && ev.ticks && !s.over) {
dir = ev.dial % 2 === 0 ? (ev.ticks > 0 ? 'right' : 'left') : ev.ticks > 0 ? 'down' : 'up';
} else if (ev.type === 'touch' && !s.over) {
const seg = Math.floor(ev.x / 200), lx = ev.x - seg * 200;
dir = seg % 2 === 0 ? (lx < 100 ? 'left' : 'right') : lx < 100 ? 'up' : 'down';
}
return dir ? move(s, dir) : s;
},
},
order: 15,
render(ctx) {
const d = surface(ctx);
panelBase(d, ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const age = ageOf(ctx);
const board = decode(s.board), before = prev && prev.bc === s.bc ? decode(prev.board) : null;
const slid = before && s.moves === prev.moves + 1 && s.dir;
const dealt = before && prev.moves > 0 && s.moves === 0;
const ended = s.over && prev && !prev.over, crowned = s.won && prev && !prev.won;
const horiz = s.dir === 'left' || s.dir === 'right', sign = s.dir === 'right' || s.dir === 'down' ? 1 : -1;
const quiet = !hasReadout(ctx);
for (const c of cellsOf(ctx)) {
const role = s.roles[c.k];
if (role === 's' || role === 'h') {
cellKey(d, c, (q) => statusKey(q, role === 's' ? { title: s.over ? 'Final' : 'Score', value: s.score, tone: s.over ? 'ok' : 'idle' } : { title: 'Best', value: s.best }), { hue: role === 's' ? HUE.amber : HUE.citrine, tone: s.over && role === 's' ? 'ok' : 'idle' });
continue;
}
if (role === '.') { cellKey(d, c, (q) => q.background({ tone: 'off' }), { hue: HUE.coral, tone: 'off' }); continue; }
if (ARROW_OF[role]) {
const dir = ARROW_OF[role], used = slid && s.dir === dir && age < 0.3;
const tone = used ? 'active' : 'idle';
cellKey(d, c, (q) => {
q.background({ tone });
q.pictogram((g) => arrow(g, dir), { tone, labeled: false });
if (quiet && role === 'U' && c.row === 0 && !s.roles.includes('s')) q.eyebrow(c.col < s.cols / 2 ? `${s.score}` : `best ${s.best}`, { align: 'center', x: q.w / 2, color: 'muted' });
}, { hue: HUE.coral, tone });
continue;
}
const j = (c.row - s.by) * s.bc + (c.col - s.bx), e = board[j];
const bxl = c.col - s.bx, byl = c.row - s.by;
const changed = before && before[j] !== e;
const isMerge = slid && s.merged.includes(j), isSpawn = slid && s.spawn === j;
const tone = e ? (s.over ? 'idle' : 'active') : 'idle';
cellKey(d, c, (q) => {
q.background({ tone });
if (!e) {
q.pictogram((g) => g.circle(24, 24, 2.6, { role: 'dim', fill: true, opacity: 0.6 }), { tone: 'idle' });
if (slid && before[j] && age < 0.17) q.text('value', String(2 ** before[j]), { cy: q.h * 0.5, color: 'dim', opacity: +(1 - clamp(age / 0.18)).toFixed(3) });
} else {
const label = String(2 ** e);
let u = 1;
if (dealt) u = clamp((age - (bxl + byl) * 0.06) / 0.4);
else if (isSpawn) u = clamp((age - 0.18) / 0.32);
else if (changed && slid) u = clamp(age / 0.22);
const pop = isMerge ? 1 + 0.12 * Math.sin(clamp((age - 0.05) / 0.3) * Math.PI) : 1;
const size = q.typeStyle('value').size * (label.length >= 4 ? 0.86 : 1) * pop;
if (u >= 1) q.value(label, { cy: q.h * 0.5, size, color: s.over ? 'muted' : 'ink' });
else { 
const off = (1 - outExpo(u)) * q.m.u * 7 * -sign;
convergeText(q, 'value', label, u, { cy: q.h * 0.5 + (horiz || dealt ? 0 : off), x: q.w / 2 + (horiz && !dealt ? off : 0), size });
}
if (e >= 12) beam(q, q.w * 0.5, { alpha: 0.5, fringe: true, glow: false });
if (isMerge) burst(q, clamp((age - 0.08) / 0.5), { rays: 10, hues: [tileHue(e), HUE.rose, tileHue(e), HUE.violet] });
if (crowned && e >= 11) burst(q, clamp((age - 0.25) / 0.8), { rays: 12 });
}
if (slid && age < 0.32) { 
const pos = horiz ? bxl : byl, span = horiz ? s.bc : s.br;
const b = sweepX(age, { dur: 0.3, pos: sign > 0 ? pos : span - 1 - pos, span, w: horiz ? q.w : q.h });
if (b.on) beam(q, sign > 0 ? b.x : (horiz ? q.w : q.h) - b.x, { axis: horiz ? 'x' : 'y', dir: sign, alpha: 0.85, slant: 0.1 });
}
if (ended) {
const b = sweepX(age, { t0: 0.1, dur: 0.8, pos: bxl, span: s.bc, w: q.w });
if (b.on) beam(q, b.x);
}
}, { hue: e ? tileHue(e) : HUE.coral, tone });
}
const galleon = ctx.deck?.screen?.kind === 'galleon';
readout(d, ctx, [
{ title: s.over ? 'Final score' : 'Score', value: s.score, meta: '← →', sub: s.over ? 'press any key' : galleon ? 'left dial slides' : 'dial slides', hue: HUE.amber, tone: s.over ? 'ok' : 'idle', short: 'Score' },
{ title: 'Best', value: s.best, meta: '↑ ↓', sub: galleon ? 'right dial slides' : 'dial slides', hue: HUE.citrine, short: 'Best' },
{ title: 'Top tile', value: 2 ** s.max, meta: '← →', sub: s.won ? '2048 reached' : 'aim for 2048', hue: tileHue(s.max), tone: s.won ? 'active' : 'idle' },
{ title: 'Moves', value: s.moves, meta: '↑ ↓', sub: s.over ? 'no moves left' : 'edge keys push too', hue: HUE.coral, tone: s.over ? 'neg' : 'idle' },
]);
return d.svg();
},
};
};
__d[312] = function (__ns) {
const { surface, keyInto } = __m(113);
const { rngSeed, rngInt } = __m(106);
const { clamp } = __m(12);
const { ageOf, beam, sweepX, convergeText, HUE } = __m(269);
__e(__ns, { "ANSWERS": () => ANSWERS, "default": () => __default }, [], ["ANSWERS","default"]);
const ANSWERS = [
[['Yes'], 1], [['Surely'], 1], [['Count', 'on it'], 1], [['Signs', 'say yes'], 1], [['Most', 'likely'], 1], [['Looks', 'bright'], 1], [['No', 'doubt'], 1], [['It is', 'so'], 1],
[['Ask', 'again'], 0], [['Maybe'], 0], [['Too', 'hazy'], 0], [['Not yet', 'clear'], 0], [['Ask', 'later'], 0], [['Can’t', 'say'], 0],
[['No'], -1], [['Doubtful'], -1], [['Unlikely'], -1], [['Not', 'today'], -1], [['Signs', 'say no'], -1], [['Very', 'doubtful'], -1],
];
const HUE_OF = { 1: HUE.jade, 0: HUE.citrine, [-1]: HUE.rose };
const __default = {
id: 'game-oracle',
title: 'Oracle',
category: 'Chance',
description: 'Ask a yes-or-no question and press: the old answer disperses, a beam crosses the key and the new one refracts into focus, jade for yes, citrine for maybe, rose for no.',
tags: ['game', 'oracle', 'fortune', 'answer', 'yes no', 'chance', 'toy', 'interactive'],
surface: 'key',
animated: false,
fps: 12,
loop: 2,
game: {
animate: 1.25,
init({ seed }) { return { a: -1, was: -1, asks: 0, rng: rngSeed(seed) }; },
readout(s) {
const [lines, pol] = s.a >= 0 ? ANSWERS[s.a] : [['Ask'], 0];
const word = s.a < 0 ? 'Ask' : pol > 0 ? 'Yes' : pol < 0 ? 'No' : 'Maybe';
return { title: 'Oracle', cards: [
{ title: 'The oracle says', value: lines.join(' '), role: 'value', sub: s.a < 0 ? 'ask a yes-or-no question' : 'ask again, press again', hue: HUE_OF[pol], tone: s.a < 0 ? 'idle' : 'active' },
{ title: 'Asked', value: s.asks, sub: 'questions', hue: HUE.citrine },
{ title: 'In short', value: word, role: 'value', hue: HUE_OF[pol], tone: s.a < 0 ? 'idle' : pol > 0 ? 'ok' : pol < 0 ? 'neg' : 'warn' },
{ title: 'How', value: 'Ask, press', role: 'value', sub: 'for fun only', hue: HUE.violet },
] };
},
reduce(s, ev) {
if (ev.type !== 'press') return s;
let [k, rng] = rngInt(s.rng, s.a < 0 ? ANSWERS.length : ANSWERS.length - 1);
if (s.a >= 0 && k >= s.a) k++; 
return { ...s, a: k, was: s.a, asks: s.asks + 1, rng };
},
},
order: 30,
render(ctx) {
const k = surface(ctx);
const s = ctx.game;
const age = ageOf(ctx);
const asked = s.asks > 0 && age < 1.25;
const [text, pol] = s.a >= 0 ? ANSWERS[s.a] : [['Ask'], 0];
const old = s.was >= 0 ? ANSWERS[s.was] : null;
const showNew = !asked || age >= 0.42;
const hue = s.a < 0 ? HUE.violet : showNew ? HUE_OF[pol] : old ? HUE_OF[old[1]] : HUE.violet;
const tone = s.a < 0 ? 'idle' : 'active';
keyInto(k, { x: 0, y: 0, w: k.w, h: k.h, i: 0 }, (q) => {
q.background({ tone });
const size = q.typeStyle('label').size * 1.12, lh = size * 1.18, cy = q.h * 0.5;
const say = (lines, u) => lines.forEach((ln, j) => convergeText(q, 'label', ln, u, { size, y: cy + size * 0.36 + (j - (lines.length - 1) / 2) * lh, color: 'ink' }));
if (s.a < 0) { 
const box = q.theme.glyphBox(q, { labeled: true });
q.pictogram((g) => { g.circle(24, 24, 14, { role: 'line' }); g.polygon([[24, 15], [32, 30], [16, 30]], { role: 'accent', fill: true, opacity: 0.85 }); g.dot(24, 15, 1.8); }, { box, tone: 'active' });
q.label('Ask', { color: 'ink' });
return;
}
if (asked && age < 0.42 && old) { 
const u = clamp(age / 0.4);
say(old[0], 1 - u);
}
if (asked) {
const b = sweepX(age, { t0: 0.18, dur: 0.42, pos: 0, span: 1, w: q.w });
if (b.on) beam(q, b.x);
}
if (showNew) say(text, asked ? clamp((age - 0.42) / 0.45) : 1);
}, { hue, tone });
return k.svg();
},
};
};
__d[313] = function (__ns) {
const { surface, keyInto } = __m(113);
const { rngSeed, rngNext } = __m(106);
const { clamp, outExpo } = __m(12);
const { ageOf, beam, burst, ringWave, convergeText, HUE } = __m(269);
__e(__ns, { "rating": () => rating, "default": () => __default }, [], ["default","rating"]);
const rating = (ms) => (ms < 200 ? 'Lightning' : ms < 260 ? 'Sharp' : ms < 340 ? 'Quick' : ms < 500 ? 'Steady' : 'Sleepy');
const __default = {
id: 'game-reaction',
title: 'Reaction',
category: 'Reflex',
description: 'Press to arm, wait in the dark, and hit the key the instant the beam strikes: it shows your reaction time in ms and keeps your best. Jump early and it is a false start.',
tags: ['game', 'reflex', 'reaction', 'timer', 'speed', 'ms', 'toy', 'interactive'],
surface: 'key',
animated: false,
fps: 12,
loop: 2,
game: {
tickHz: 4,
ticking: (s) => s.phase === 'wait',
animate: 0.9,
init({ seed }) { return { phase: 'idle', armAt: 0, delay: 0, goAt: 0, ms: 0, best: 0, tries: 0, last: [], rng: rngSeed(seed) }; },
readout(s) {
const msg = { idle: 'Press to start', wait: 'Wait for it', go: 'Press now!', done: s.ms + ' ms', early: 'Too early' }[s.phase] || '';
const avg = s.last.length ? Math.round(s.last.reduce((a, b) => a + b, 0) / s.last.length) : 0;
return { title: 'Reaction', cards: [
{ title: 'Reaction', value: msg, role: 'value', hue: HUE.lime, tone: s.phase === 'go' ? 'alert' : s.phase === 'early' ? 'warn' : s.phase === 'done' ? 'ok' : 'idle' },
{ title: 'Best', value: s.best ? s.best + ' ms' : '—', role: 'value', hue: HUE.citrine },
{ title: 'Tries', value: s.tries, hue: HUE.amber },
{ title: 'Average', value: avg ? avg + ' ms' : '—', role: 'value', sub: s.last.length ? 'last ' + s.last.length : undefined, hue: HUE.cyan },
] };
},
reduce(s, ev) {
if (ev.type === 'tick') return s.phase === 'wait' && ev.t - s.armAt >= s.delay ? { ...s, phase: 'go', goAt: ev.t } : s;
if (ev.type !== 'press') return s;
if (s.phase === 'wait') return { ...s, phase: 'early' };
if (s.phase === 'go') {
const ms = Math.max(1, Math.round((ev.t - s.goAt) * 1000));
return { ...s, phase: 'done', ms, best: s.best ? Math.min(s.best, ms) : ms, tries: s.tries + 1, last: [...s.last, ms].slice(-5) };
}
const [x, rng] = rngNext(s.rng);
return { ...s, phase: 'wait', armAt: ev.t, delay: +(1.2 + x * 2.8).toFixed(3), rng };
},
},
order: 50,
render(ctx) {
const k = surface(ctx);
const s = ctx.game, prev = ctx.gamePrev;
const age = ageOf(ctx);
const big = Math.min(k.w, k.h) >= 110;
const look = {
idle: { hue: HUE.amber, tone: 'idle' }, wait: { hue: HUE.violet, tone: 'idle' }, go: { hue: HUE.citrine, tone: 'active' },
done: { hue: s.ms < 260 ? HUE.jade : s.ms < 400 ? HUE.cyan : HUE.periwinkle, tone: s.ms < 260 ? 'ok' : 'active' }, early: { hue: HUE.rose, tone: 'neg' },
}[s.phase];
keyInto(k, { x: 0, y: 0, w: k.w, h: k.h, i: 0 }, (q) => {
q.background({ tone: look.tone });
const box = q.theme.glyphBox(q, { labeled: true });
if (s.phase === 'idle' || s.phase === 'wait') {
const w = s.phase === 'wait';
q.pictogram((g) => { g.circle(24, 24, 13, { role: w ? 'dim' : 'line' }); g.dot(24, 24, w ? 2 : 3.2); if (!w) g.line(24, 6.5, 24, 13.5, { role: 'accent', weight: 0.8 }); }, { box, tone: w ? 'idle' : 'active', opacity: w ? 0.6 : undefined });
q.label(w ? 'Wait…' : 'React', { color: w ? 'dim' : 'ink' });
if (big && s.best && !w) q.eyebrow(`best ${s.best}`, { align: 'center', x: q.w / 2 });
} else if (s.phase === 'go') { 
const a = outExpo(clamp(age / 0.1));
q.pictogram((g) => g.group({ scale: 0.6 + 0.4 * a }, (h) => { h.circle(24, 24, 12, { role: 'accent', fill: true }); h.dot(24, 24, 4.5); }), { box, tone: 'active' });
beam(q, q.w / 2, { alpha: a, slant: 0.1 });
burst(q, clamp(age / 0.45), { cy: box.y + box.size / 2, rays: 12 });
q.label('Now!', { color: 'ink' });
} else if (s.phase === 'done') {
const u = prev?.phase === 'go' ? clamp(age / 0.4) : 1;
convergeText(q, 'hero', String(s.ms), u, { cy: box.y + box.size * 0.52 });
q.label(big ? `ms · ${rating(s.ms)}` : 'ms', { color: 'muted' });
if (s.ms === s.best && s.tries > 1) ringWave(q, clamp(age / 0.6));
if (big) q.eyebrow(s.ms === s.best ? 'new best' : `best ${s.best}`, { align: 'center', x: q.w / 2, color: s.ms === s.best ? 'ink' : 'muted' });
} else { 
q.pictogram((g) => { g.arc(24, 24, 13, 30, 330, { role: 'accent' }); g.line(24, 13, 24, 26, { role: 'accent', weight: 1.1 }); g.dot(24, 32, 1.9, { role: 'accent' }); }, { box, tone: 'neg' });
q.label('Too soon', { color: 'ink' });
}
}, { hue: look.hue, tone: look.tone });
return k.svg();
},
};
};
__d[314] = function (__ns) {
const { surface, P } = __m(113);
const { rngSeed, rngNext } = __m(106);
const { clamp } = __m(12);
const { hash } = __m(1);
const { cellsOf, ageOf, beam, sweepX, burst, ringWave, cellKey, HUE, beamColor } = __m(269);
const { PIECES } = __m(304);
__e(__ns, { "SYMBOLS": () => SYMBOLS, "payout": () => payout, "default": () => __default }, [], ["SYMBOLS","default","payout"]);
const SYMBOLS = [
{ piece: 0, hue: HUE.violet, weight: 1, pay: 60, name: 'prism' },
{ piece: 3, hue: HUE.citrine, weight: 2, pay: 25, name: 'star' },
{ piece: 6, hue: HUE.amber, weight: 3, pay: 15, name: 'bolt' },
{ piece: 12, hue: HUE.rose, weight: 3, pay: 12, name: 'heart' },
{ piece: 5, hue: HUE.periwinkle, weight: 4, pay: 10, name: 'moon' },
{ piece: 2, hue: HUE.cyan, weight: 4, pay: 8, name: 'diamond' },
{ piece: 8, hue: HUE.azure, weight: 5, pay: 6, name: 'drop' },
];
const TOTAL = SYMBOLS.reduce((a, s) => a + s.weight, 0);
const PURSE = 20;
const STOP = [0.8, 1.2, 1.6]; 
const TRAVEL = [9, 12, 15]; 
function draw(rng) {
let x;
[x, rng] = rngNext(rng);
let k = x * TOTAL, i = 0;
while (k >= SYMBOLS[i].weight && i < SYMBOLS.length - 1) { k -= SYMBOLS[i].weight; i++; }
return [i, rng];
}
function payout([a, b, c]) {
if (a === b && b === c) return SYMBOLS[a].pay;
if (a === b) return 3;
return 0;
}
const __default = {
id: 'game-slots',
title: 'Slots',
category: 'Chance',
description: 'A three-reel slot machine across three keys: press to spin, the reels stop one by one; three of a kind pays and three prisms are the jackpot. Seeded, never real money.',
tags: ['game', 'slots', 'slot machine', 'reels', 'chance', 'toy', 'interactive'],
surface: 'span',
span: { cols: 3, rows: 1 },
animated: false,
fps: 12,
loop: 4,
game: {
readout(s) {
const names = s.reels.map((i) => SYMBOLS[i]?.name || '?');
return { title: 'Slots', cards: [
s.spins ? { title: s.won ? (s.won === SYMBOLS[0].pay ? 'Jackpot' : 'Win') : 'Spin', value: s.won ? '+' + s.won : 'No win', role: 'value', sub: names.join(' · '), hue: s.won ? HUE.citrine : HUE.violet, tone: s.won ? 'ok' : 'idle' } : { title: 'Slots', value: 'Ready', role: 'value', sub: 'press a reel: one coin', hue: HUE.violet },
{ title: 'Coins', value: s.coins, bar: Math.min(1, s.coins / Math.max(1, s.best)), sub: s.coins < 1 ? 'press to refill' : undefined, hue: HUE.amber, tone: s.coins < 1 ? 'warn' : 'idle' },
{ title: 'Spins', value: s.spins, sub: s.jackpots + (s.jackpots === 1 ? ' jackpot' : ' jackpots'), hue: HUE.cyan },
{ title: 'Best', value: s.best, sub: 'most coins held', hue: HUE.lime },
] };
},
animate: 2.5,
init({ seed }) {
let rng = rngSeed(seed);
const reels = [];
for (let k = 0; k < 3; k++) { let i; [i, rng] = draw(rng); reels.push(i); }
if (payout(reels)) reels[2] = (reels[1] + 2) % SYMBOLS.length; 
return { coins: PURSE, reels, spins: 0, won: 0, best: PURSE, jackpots: 0, rng };
},
reduce(s, ev) {
if (ev.type !== 'press' || !Number.isInteger(ev.cell) || ev.cell < 0 || ev.cell > 2) return s;
if (s.coins < 1) return { ...s, coins: PURSE, won: 0 };
let rng = s.rng;
const reels = [];
for (let k = 0; k < 3; k++) { let i; [i, rng] = draw(rng); reels.push(i); }
const won = payout(reels), coins = s.coins - 1 + won;
return { ...s, coins, reels, spins: s.spins + 1, won, best: Math.max(s.best, coins), jackpots: s.jackpots + (won === SYMBOLS[0].pay ? 1 : 0), rng };
},
},
order: 20,
render(ctx) {
const d = surface(ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const age = ageOf(ctx);
const spun = prev && s.spins === prev.spins + 1;
const settled = !spun || age >= STOP[2] + 0.15;
const jackpot = spun && s.won === SYMBOLS[0].pay;
const three = s.reels[0] === s.reels[1] && s.reels[1] === s.reels[2];
const match = (k) => s.won > 0 && (three || k < 2);
for (const c of cellsOf(ctx)) {
const k = c.k, sym = SYMBOLS[s.reels[k]];
const stopped = !spun || age >= STOP[k];
const winning = spun && settled && match(k) && s.won > 0;
const tone = s.coins < 1 && settled ? 'off' : winning ? 'ok' : stopped && spun && age < STOP[k] + 0.35 ? 'active' : 'idle';
cellKey(d, c, (q) => {
q.background({ tone: tone === 'off' ? 'idle' : tone });
const box = q.theme.glyphBox(q, { labeled: true });
if (!stopped) { 
const T = STOP[k], D = TRAVEL[k], x = clamp(age / T);
const pos = D * (1 - Math.pow(1 - x, 3));
const i0 = Math.floor(pos), frac = pos - i0, speed = 3 * D * Math.pow(1 - x, 2) / T;
const symAt = (i) => (i <= 0 ? SYMBOLS[prev.reels[k]] : i >= D ? sym : SYMBOLS[Math.floor(hash(ev.seed | 0, k, i) * SYMBOLS.length)]);
for (const [i, dy] of [[i0, frac], [i0 + 1, frac - 1]]) {
const S = symAt(i), y = box.y + dy * box.size * 1.25;
const blur = clamp((speed - 6) / 20);
if (blur > 0.05) for (let j = 1; j <= 2; j++) q.pictogram(PIECES[S.piece], { box: { x: box.x, y: y - j * box.size * 0.16 * blur, size: box.size }, tone: 'idle', opacity: +(0.28 * blur / j).toFixed(3) });
q.pictogram(PIECES[S.piece], { box: { ...box, y }, tone: 'idle', opacity: +(1 - blur * 0.45).toFixed(3) });
}
} else {
const bounce = spun && age < STOP[k] + 0.3 ? Math.sin(clamp((age - STOP[k]) / 0.3) * Math.PI) * box.size * 0.07 : 0;
const B = { ...box, y: box.y + bounce };
q.pictogram(PIECES[sym.piece], { box: B, tone: s.coins < 1 ? 'idle' : 'active', opacity: s.coins < 1 ? 0.45 : !winning && spun && settled && s.won ? 0.6 : undefined });
}
const cy = box.y + box.size / 2, nh = Math.max(3, q.m.u * 3.2), nw = Math.max(2.5, q.m.u * 2.6);
const notch = k === 0 ? P().M(q.m.bleed, cy - nh).L(q.m.bleed + nw, cy).L(q.m.bleed, cy + nh).Z().d : k === 2 ? P().M(q.w - q.m.bleed, cy - nh).L(q.w - q.m.bleed - nw, cy).L(q.w - q.m.bleed, cy + nh).Z().d : null;
if (notch) q.add(`<path d="${notch}" fill="${winning ? beamColor(q) : q.colors.muted}"/>`);
if (k === 0) q.label(s.coins < 1 ? 'Empty' : 'Spin', { color: 'muted' });
if (k === 1) q.label(s.coins < 1 ? 'Refill' : `${settled ? s.coins : prev?.coins - 1} coins`, { color: settled && s.won ? 'ink' : 'muted' });
if (k === 2 && settled && s.won) q.label(jackpot ? 'Jackpot' : `+${s.won}`, { color: 'ink' });
if (spun && s.won) {
const t0 = STOP[2] + 0.12;
const b = sweepX(age, { t0, dur: 0.55, pos: k, span: 3, w: q.w });
if (b.on) beam(q, b.x);
if (match(k)) burst(q, clamp((age - t0 - 0.2 - k * 0.06) / 0.7), { cy: cy, rays: jackpot ? 16 : 10 });
if (jackpot) ringWave(q, clamp((age - t0 - 0.35) / 0.6), { cy });
}
}, { hue: sym.hue, tone: tone === 'off' ? 'idle' : tone });
}
return d.svg();
},
};
};
__d[315] = function (__ns) {
const { surface, rect } = __m(113);
const { rngSeed, rngShuffle } = __m(106);
const { clamp, outExpo } = __m(12);
const { cellsOf, ageOf, spread, beam, sweepX, burst, cellKey, HUE, beamColor, middleCell, readout, panelBase } = __m(269);
__e(__ns, { "pinsFor": () => pinsFor, "default": () => __default }, [], ["default","pinsFor"]);
function pinsFor(cols, rows, level) {
const N = cols * rows, p = Array(N).fill('0');
if (N <= 3) { p[0] = '1'; return p.join(''); }
if (level === 'easy') for (let i = 0; i < N; i += 2) p[i] = '1';
else if (level === 'hard') { p[0] = '1'; if (N >= 12) p[N - 1] = '1'; }
else if (N < 12) { p[0] = '1'; p[N - 1] = '1'; }
else { for (const i of [0, cols - 1, N - cols, N - 1]) p[i] = '1'; p[middleCell(cols, rows)] = '1'; }
return p.join('');
}
function deal(s, rng) {
const N = s.cols * s.rows, free = [];
for (let i = 0; i < N; i++) if (s.pins[i] === '0') free.push(i);
let order, perm;
for (let tries = 0; ; tries++) {
[perm, rng] = rngShuffle(rng, free);
order = Array.from({ length: N }, (_, i) => i);
free.forEach((cell, k) => { order[cell] = perm[k]; });
const wrong = order.filter((t, i) => t !== i).length;
if (wrong >= Math.min(free.length, Math.max(2, Math.ceil(free.length * 0.6))) || tries > 6) break;
}
return { ...s, order, sel: -1, moves: 0, solved: false, swap: [], rng };
}
const __default = {
id: 'game-spectrum',
title: 'Spectrum',
category: 'Puzzles',
description: 'Every key holds a color from the Spectrum, shuffled; swap keys two at a time until the light runs rose to violet. Each key reads its λ, so it plays in any theme.',
tags: ['game', 'puzzle', 'color', 'hue', 'sort', 'spectrum', 'wavelength', 'interactive'],
surface: 'deck',
animated: false,
fps: 12,
loop: 4,
params: {
level: { type: 'select', default: 'normal', options: ['easy', 'normal', 'hard'], label: 'Pinned keys' },
},
game: {
animate: 1.3,
init({ seed, grid, params }) {
const base = { cols: grid.cols, rows: grid.rows, pins: pinsFor(grid.cols, grid.rows, params.level), level: params.level, best: 0, deals: 1 };
return deal(base, rngSeed(seed));
},
reduce(s, ev) {
if (ev.type !== 'press' || !Number.isInteger(ev.cell) || ev.cell < 0 || ev.cell >= s.order.length) return s;
const c = ev.cell;
if (s.solved) return { ...deal(s, s.rng), deals: s.deals + 1 };
if (s.pins[c] === '1') return s;
if (s.sel < 0) return { ...s, sel: c, swap: [] };
if (s.sel === c) return { ...s, sel: -1, swap: [] };
const order = s.order.slice();
[order[s.sel], order[c]] = [order[c], order[s.sel]];
const moves = s.moves + 1, solved = order.every((t, i) => t === i);
return { ...s, order, sel: -1, moves, solved, swap: [s.sel, c], best: solved ? (s.best ? Math.min(s.best, moves) : moves) : s.best };
},
},
order: 30,
render(ctx) {
const d = surface(ctx);
panelBase(d, ctx);
const s = ctx.game, prev = ctx.gamePrev;
const age = ageOf(ctx);
const N = s.order.length, hues = spread(N);
const dealt = prev && prev.deals !== s.deals;
const won = s.solved && prev && !prev.solved;
const mid = middleCell(s.cols, s.rows);
for (const c of cellsOf(ctx)) {
const i = c.k, t = s.order[i], hue = hues[t];
const pinned = s.pins[i] === '1', selected = s.sel === i;
let u = 1;
if (dealt) u = clamp((age - ((c.col + c.row * 0.5) * 0.05)) / 0.4);
else if (s.swap.includes(i) && prev && prev.order[i] !== t) u = clamp(age / 0.36);
const tone = s.solved || selected ? 'active' : 'idle';
cellKey(d, c, (q) => {
q.background({ tone });
const box = q.theme.glyphBox(q, { labeled: true });
const lift = selected ? 1.08 : 1;
const sc = box.size / 48, side = 34 * sc * lift, x0 = box.x + box.size / 2 - side / 2, y0 = box.y + box.size / 2 - side / 2, r = 7 * sc * lift;
const e = outExpo(u), off = 5 * sc * (1 - e);
if (u < 1) [HUE.rose, HUE.violet].forEach((h, j) => q.add(rect({ x: x0 + (j ? off : -off), y: y0, width: side, height: side, rx: r, fill: q.theme.spectral(h), fillOpacity: +((1 - e) * 0.6).toFixed(3) })));
if (e > 0.01) q.add(rect({ x: x0, y: y0, width: side, height: side, rx: r, fill: q.theme.spectral(hue), fillOpacity: e < 0.999 ? +e.toFixed(3) : null }));
if (pinned) q.pictogram((g) => g.circle(24, 24, 4.6, { role: 'line', weight: 0.85 }), { box, tone: 'active' });
if (selected) q.add(rect({ x: q.m.bleed * 1.5, y: q.m.bleed * 1.5, width: q.w - q.m.bleed * 3, height: q.h - q.m.bleed * 3, rx: q.m.radius * 0.8, fill: 'none', stroke: beamColor(q), strokeWidth: Math.max(1.5, q.m.u * 1.6) }));
if (s.solved && i === mid) q.label(`${s.moves} moves`, { color: 'ink' });
else q.label(`λ${q.theme.lambda(hue)}`, { color: s.solved ? 'ink' : 'muted' });
if (won) {
const b = sweepX(age, { t0: 0.3, dur: 0.9, pos: c.col, span: s.cols, w: q.w });
if (b.on) beam(q, b.x);
burst(q, clamp((age - 0.55 - c.col * 0.07) / 0.65), { cy: box.y + box.size / 2, rays: 10, hues: [hue, HUE.rose, hue, HUE.violet] });
}
}, { hue, tone });
}
const bar = (list) => (p, F) => {
const y = p.h * 0.42, h = Math.max(6, p.h * 0.26), w = F.w / list.length;
list.forEach((t, j) => p.add(rect({ x: F.x0 + j * w, y, width: w + 0.4, height: h, fill: p.theme.spectral(hues[t]) })));
if (s.sel >= 0 && list === s.order) p.add(rect({ x: F.x0 + s.sel * w, y: y - p.m.u * 2, width: w, height: h + p.m.u * 4, fill: 'none', stroke: beamColor(p), strokeWidth: Math.max(1.2, p.m.u * 0.9) }));
};
readout(d, ctx, [
{ title: s.solved ? 'Solved' : 'Swaps', value: s.moves, sub: s.solved ? 'press for a new spectrum' : s.sel >= 0 ? 'now press its partner' : 'press two keys to swap', hue: HUE.coral, tone: s.solved ? 'ok' : 'idle', short: 'Swaps' },
{ title: 'Best', value: s.best || '—', sub: 'fewest swaps', hue: HUE.amber, short: 'Best' },
{ title: 'Now', hue: HUE.cyan, draw: bar(s.order) },
{ title: 'Goal', meta: 'rose → violet', hue: HUE.violet, draw: bar(s.order.map((_, i) => i)) },
]);
return d.svg();
},
};
};
__d[316] = function (__ns) {
const { surface } = __m(113);
const { rngSeed, rngNext, rngInt } = __m(106);
const { clamp } = __m(12);
const { cellsOf, ageOf, beam, sweepX, burst, ringWave, cellKey, HUE } = __m(269);
const { mark } = __m(304);
__e(__ns, { "winner": () => winner, "aiMove": () => aiMove, "default": () => __default }, [], ["aiMove","default","winner"]);
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const YOU = HUE.azure, PRISM = HUE.coral;
const SQUARE = ['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
function winner(b) {
for (const L of LINES) if (b[L[0]] !== '.' && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) return { who: b[L[0]], line: L };
return b.includes('.') ? null : { who: 'draw', line: null };
}
const put = (b, i, m) => b.slice(0, i) + m + b.slice(i + 1);
const free = (b) => [...b].map((v, i) => (v === '.' ? i : -1)).filter((i) => i >= 0);
const finishing = (b, m) => free(b).find((i) => winner(put(b, i, m))?.who === m);
function minimax(b, m, depth = 0) {
const w = winner(b);
if (w) return w.who === 'o' ? 10 - depth : w.who === 'x' ? depth - 10 : 0;
const scores = free(b).map((i) => minimax(put(b, i, m), m === 'o' ? 'x' : 'o', depth + 1));
return m === 'o' ? Math.max(...scores) : Math.min(...scores);
}
function aiMove(b, level, rng) {
const open = free(b);
let x;
const win = finishing(b, 'o');
if (win !== undefined) return [win, rng];
const block = finishing(b, 'x');
if (level === 'hard') {
let best = open[0], bs = -Infinity;
for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) if (b[i] === '.') { const v = minimax(put(b, i, 'o'), 'x', 1); if (v > bs) { bs = v; best = i; } }
return [best, rng];
}
[x, rng] = rngNext(rng);
if (block !== undefined && (level === 'normal' || x < 0.5)) return [block, rng];
[x, rng] = rngNext(rng);
if (level === 'easy' || x < 0.2) { let k; [k, rng] = rngInt(rng, open.length); return [open[k], rng]; }
if (b[4] === '.') return [4, rng];
const corners = [0, 2, 6, 8].filter((i) => b[i] === '.');
const opposite = corners.find((i) => b[8 - i] === 'x');
if (opposite !== undefined) return [opposite, rng];
if (corners.length) { let k; [k, rng] = rngInt(rng, corners.length); return [corners[k], rng]; }
return [open[0], rng];
}
function settle(s, b, ai) {
const w = winner(b);
if (!w) return { ...s, b, ai };
const score = { ...s.score };
if (w.who === 'x') score.x++; else if (w.who === 'o') score.o++; else score.d++;
return { ...s, b, ai, win: w.who, line: w.line, score };
}
function newGame(s) {
const start = s.start === 'x' ? 'o' : 'x';
let g = { ...s, b: '.........', start, win: null, line: null, games: s.games + 1, ai: -1 };
if (start === 'o') { const [i, rng] = aiMove(g.b, g.level, g.rng); g = { ...g, b: put(g.b, i, 'o'), ai: i, rng }; }
return g;
}
const __default = {
id: 'game-tictactoe',
title: 'Tic-Tac-Toe',
category: 'Board',
description: 'Noughts and crosses on any 3 × 3 block of keys against Prism, a small opponent with three levels. A win beams down the line; the Galleon screen keeps score.',
tags: ['game', 'board', 'tic-tac-toe', 'noughts and crosses', 'versus', 'ai', 'interactive'],
surface: 'span',
span: { cols: 3, rows: 3 },
devices: ['mk2', 'xl', 'galleon', 'plusxl'],
animated: false,
fps: 12,
loop: 4,
params: {
level: { type: 'select', default: 'normal', options: ['easy', 'normal', 'hard'], label: 'Prism plays' },
},
game: {
animate: 1.4,
readout(s) {
const res = s.win === 'x' ? 'You win' : s.win === 'o' ? 'Prism wins' : s.win === 'draw' ? 'Draw' : 'Your move';
const played = s.games - (s.win ? 0 : 1);
return { title: 'Tic-Tac-Toe', cards: [
{ title: 'You', value: s.score.x, sub: 'crosses', hue: YOU, tone: s.win === 'x' ? 'ok' : 'idle' },
{ title: 'Prism', value: s.score.o, sub: 'rings · ' + s.level, hue: PRISM, tone: s.win === 'o' ? 'warn' : 'idle' },
{ title: s.win ? 'Result' : 'Game ' + s.games, value: res, role: 'value', sub: s.win ? 'press a key: next game' : 'press a free key', hue: HUE.violet, tone: s.win ? (s.win === 'x' ? 'ok' : s.win === 'o' ? 'warn' : 'idle') : 'active' },
{ title: 'Draws', value: s.score.d, sub: played + ' played', hue: HUE.citrine },
] };
},
cell(s, k) { const c = s.b[k]; return { label: `${SQUARE[k]}, ${c === 'x' ? 'your cross' : c === 'o' ? "Prism's ring" : 'empty'}` }; },
announce(s, prev) {
if (prev && s.games !== prev.games) return `Game ${s.games}. ${s.ai >= 0 ? `Prism played ${SQUARE[s.ai]}. ` : ''}Your move.`;
const out = [];
if (s.ai >= 0 && (!prev || prev.b[s.ai] !== 'o')) out.push(`Prism played ${SQUARE[s.ai]}.`);
if (s.win) out.push(`${s.win === 'x' ? 'You win!' : s.win === 'o' ? 'Prism wins.' : 'Draw.'} You ${s.score.x}, Prism ${s.score.o}. Press a key for the next game.`);
else out.push('Your move.');
return out.join(' ');
},
init({ seed, params }) {
return { b: '.........', start: 'x', win: null, line: null, level: params.level, score: { x: 0, o: 0, d: 0 }, games: 1, ai: -1, rng: rngSeed(seed) };
},
reduce(s, ev) {
if (ev.type !== 'press' || !Number.isInteger(ev.cell) || ev.cell < 0 || ev.cell > 8) return s;
if (s.win) return newGame(s);
if (s.b[ev.cell] !== '.') return s;
const b = put(s.b, ev.cell, 'x');
if (winner(b)) return settle(s, b, -1);
const [i, rng] = aiMove(b, s.level, s.rng);
return settle({ ...s, rng }, put(b, i, 'o'), i);
},
},
order: 10,
render(ctx) {
const d = surface(ctx);
const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
const age = ageOf(ctx);
const fresh = prev && prev.games !== s.games;
const evCell = ev?.type === 'press' && Number.isInteger(ev.cell) ? ev.cell : -1;
const ended = s.win && prev && !prev.win;
const t0 = s.ai >= 0 ? 0.78 : 0.3; 
const L = s.line, orient = L ? (L[1] - L[0] === 1 ? 'row' : L[1] - L[0] === 3 ? 'col' : L[0] === 0 ? 'diag' : 'anti') : null;
for (const c of cellsOf(ctx)) {
const i = c.k, m = s.b[i];
const inLine = L?.includes(i);
let u = 1;
if (fresh) u = m === '.' ? 1 : clamp((age - 0.45) / 0.3);
else if (i === evCell && m === 'x' && prev?.b[i] === '.') u = clamp(age / 0.28);
else if (i === s.ai && prev?.b[i] === '.') u = clamp((age - 0.42) / 0.32);
const showScore = s.win && c.row === 2;
const lit = m !== '.' && (!s.win || inLine);
const tone = s.win ? (inLine ? (s.win === 'x' ? 'ok' : 'warn') : 'idle') : lit ? 'active' : 'idle';
const hue = m === 'x' ? YOU : m === 'o' ? PRISM : HUE.violet;
cellKey(d, c, (q) => {
q.background({ tone });
if (m !== '.') q.pictogram((g) => mark(g, m, u), { tone: s.win && !inLine ? 'idle' : 'active', labeled: showScore, opacity: s.win && !inLine ? 0.5 : undefined });
else if (!s.win) q.pictogram((g) => g.circle(24, 24, 2.2, { role: 'dim', fill: true, opacity: 0.55 }), { tone: 'idle' });
if (showScore) {
const [who, n] = c.col === 0 ? ['You', s.score.x] : c.col === 1 ? ['Draw', s.score.d] : ['Prism', s.score.o];
q.label(`${who} ${n}`, { color: (c.col === 0 && s.win === 'x') || (c.col === 2 && s.win === 'o') || (c.col === 1 && s.win === 'draw') ? 'ink' : 'muted' });
}
if (ended && inLine) {
const k = L.indexOf(i);
const axis = orient === 'col' ? 'y' : 'x', slant = orient === 'diag' ? -0.9 : orient === 'anti' ? 0.9 : 0.12;
const b = sweepX(age, { t0, dur: 0.6, pos: k, span: 3, w: axis === 'y' ? q.h : q.w });
if (b.on) beam(q, b.x, { axis, slant });
burst(q, clamp((age - t0 - 0.25 - k * 0.07) / 0.7), { rays: 12 });
}
if (ended && s.win === 'draw') ringWave(q, clamp((age - t0 - (c.col + c.row) * 0.06) / 0.6));
}, { hue, tone });
}
return d.svg();
},
};
};
__d[317] = function (__ns) {
const m0 = __m(121);
const m1 = __m(122);
const m2 = __m(123);
const m3 = __m(124);
const m4 = __m(126);
const m5 = __m(127);
const m6 = __m(128);
const m7 = __m(129);
const m8 = __m(130);
const m9 = __m(131);
const m10 = __m(120);
const m11 = __m(133);
const m12 = __m(134);
const m13 = __m(135);
const m14 = __m(136);
const m15 = __m(138);
const m16 = __m(139);
const m17 = __m(140);
const m18 = __m(141);
const m19 = __m(142);
const m20 = __m(143);
const m21 = __m(144);
const m22 = __m(145);
const m23 = __m(146);
const m24 = __m(147);
const m25 = __m(148);
const m26 = __m(149);
const m27 = __m(150);
const m28 = __m(151);
const m29 = __m(152);
const m30 = __m(153);
const m31 = __m(154);
const m32 = __m(155);
const m33 = __m(156);
const m34 = __m(157);
const m35 = __m(158);
const m36 = __m(159);
const m37 = __m(160);
const m38 = __m(161);
const m39 = __m(162);
const m40 = __m(163);
const m41 = __m(164);
const m42 = __m(165);
const m43 = __m(166);
const m44 = __m(167);
const m45 = __m(168);
const m46 = __m(169);
const m47 = __m(170);
const m48 = __m(171);
const m49 = __m(172);
const m50 = __m(173);
const m51 = __m(174);
const m52 = __m(175);
const m53 = __m(176);
const m54 = __m(177);
const m55 = __m(178);
const m56 = __m(179);
const m57 = __m(180);
const m58 = __m(181);
const m59 = __m(182);
const m60 = __m(183);
const m61 = __m(184);
const m62 = __m(185);
const m63 = __m(186);
const m64 = __m(187);
const m65 = __m(188);
const m66 = __m(189);
const m67 = __m(191);
const m68 = __m(192);
const m69 = __m(193);
const m70 = __m(194);
const m71 = __m(196);
const m72 = __m(197);
const m73 = __m(198);
const m74 = __m(199);
const m75 = __m(200);
const m76 = __m(204);
const m77 = __m(205);
const m78 = __m(206);
const m79 = __m(207);
const m80 = __m(208);
const m81 = __m(209);
const m82 = __m(210);
const m83 = __m(211);
const m84 = __m(212);
const m85 = __m(213);
const m86 = __m(216);
const m87 = __m(217);
const m88 = __m(218);
const m89 = __m(219);
const m90 = __m(220);
const m91 = __m(221);
const m92 = __m(222);
const m93 = __m(223);
const m94 = __m(224);
const m95 = __m(225);
const m96 = __m(226);
const m97 = __m(227);
const m98 = __m(228);
const m99 = __m(229);
const m100 = __m(230);
const m101 = __m(231);
const m102 = __m(232);
const m103 = __m(233);
const m104 = __m(234);
const m105 = __m(235);
const m106 = __m(236);
const m107 = __m(237);
const m108 = __m(238);
const m109 = __m(239);
const m110 = __m(240);
const m111 = __m(241);
const m112 = __m(242);
const m113 = __m(243);
const m114 = __m(244);
const m115 = __m(245);
const m116 = __m(246);
const m117 = __m(247);
const m118 = __m(248);
const m119 = __m(249);
const m120 = __m(250);
const m121 = __m(251);
const m122 = __m(252);
const m123 = __m(253);
const m124 = __m(255);
const m125 = __m(256);
const m126 = __m(257);
const m127 = __m(258);
const m128 = __m(259);
const m129 = __m(260);
const m130 = __m(261);
const m131 = __m(262);
const m132 = __m(263);
const m133 = __m(264);
const m134 = __m(265);
const m135 = __m(266);
const m136 = __m(267);
const m137 = __m(268);
const m138 = __m(118);
const m139 = __m(270);
const m140 = __m(271);
const m141 = __m(272);
const m142 = __m(273);
const m143 = __m(274);
const m144 = __m(276);
const m145 = __m(277);
const m146 = __m(278);
const m147 = __m(279);
const m148 = __m(280);
const m149 = __m(281);
const m150 = __m(282);
const m151 = __m(284);
const m152 = __m(285);
const m153 = __m(286);
const m154 = __m(287);
const m155 = __m(288);
const m156 = __m(289);
const m157 = __m(292);
const m158 = __m(293);
const m159 = __m(294);
const m160 = __m(295);
const m161 = __m(296);
const m162 = __m(297);
const m163 = __m(298);
const m164 = __m(299);
const m165 = __m(300);
const m166 = __m(301);
const m167 = __m(302);
const m168 = __m(303);
const m169 = __m(290);
const m170 = __m(305);
const m171 = __m(306);
const m172 = __m(307);
const m173 = __m(308);
const m174 = __m(309);
const m175 = __m(310);
const m176 = __m(311);
const m177 = __m(312);
const m178 = __m(313);
const m179 = __m(314);
const m180 = __m(315);
const m181 = __m(316);
__e(__ns, { "FACET_MODULES": () => FACET_MODULES }, [], ["FACET_MODULES"]);
const FACET_MODULES = [
['themes/aurora.js', m0],
['themes/blueprint.js', m1],
['themes/chrome.js', m2],
['themes/ember.js', m3],
['themes/mono.js', m4],
['themes/neon.js', m5],
['themes/paper.js', m6],
['themes/phosphor.js', m7],
['themes/pixel.js', m8],
['themes/porcelain.js', m9],
['themes/prism.js', m10],
['icons/alarm.js', m11],
['icons/alert.js', m12],
['icons/back.js', m13],
['icons/battery.js', m14],
['icons/broadcast.js', m15],
['icons/bug.js', m16],
['icons/bulb.js', m17],
['icons/calendar.js', m18],
['icons/camera.js', m19],
['icons/chat.js', m20],
['icons/check.js', m21],
['icons/clock.js', m22],
['icons/cloud.js', m23],
['icons/code.js', m24],
['icons/coffee.js', m25],
['icons/cpu.js', m26],
['icons/disk.js', m27],
['icons/equalizer.js', m28],
['icons/fan.js', m29],
['icons/folder.js', m30],
['icons/git-branch.js', m31],
['icons/gpu.js', m32],
['icons/headphones.js', m33],
['icons/home.js', m34],
['icons/info.js', m35],
['icons/lock.js', m36],
['icons/mail.js', m37],
['icons/marker.js', m38],
['icons/memory.js', m39],
['icons/mic.js', m40],
['icons/mixer.js', m41],
['icons/music-note.js', m42],
['icons/network.js', m43],
['icons/note.js', m44],
['icons/pages.js', m45],
['icons/play-pause.js', m46],
['icons/plug.js', m47],
['icons/power.js', m48],
['icons/record.js', m49],
['icons/rocket.js', m50],
['icons/scene.js', m51],
['icons/search.js', m52],
['icons/shuffle.js', m53],
['icons/skip-next.js', m54],
['icons/skip-prev.js', m55],
['icons/stop.js', m56],
['icons/stopwatch.js', m57],
['icons/sync.js', m58],
['icons/target.js', m59],
['icons/terminal.js', m60],
['icons/thermostat.js', m61],
['icons/timer.js', m62],
['icons/viewers.js', m63],
['icons/volume.js', m64],
['icons/waveform.js', m65],
['icons/wifi.js', m66],
['motion/alert-countdown.js', m67],
['motion/alert-pulse.js', m68],
['motion/alert-shake.js', m69],
['motion/alert-siren.js', m70],
['motion/build-status.js', m71],
['motion/clip-marker.js', m72],
['motion/do-not-disturb.js', m73],
['motion/hold-confirm.js', m74],
['motion/idle-breathe.js', m75],
['motion/idle-candle.js', m76],
['motion/idle-firefly.js', m77],
['motion/idle-heartbeat.js', m78],
['motion/idle-lava.js', m79],
['motion/idle-orbit.js', m80],
['motion/idle-prompt.js', m81],
['motion/idle-shimmer.js', m82],
['motion/idle-snowglobe.js', m83],
['motion/idle-tick.js', m84],
['motion/on-air.js', m85],
['motion/press-bloom.js', m86],
['motion/press-refract.js', m87],
['motion/press-ripple.js', m88],
['motion/press-shutter.js', m89],
['motion/press-sink.js', m90],
['motion/state-crossfade.js', m91],
['motion/state-flip.js', m92],
['motion/state-iris.js', m93],
['motion/state-morph.js', m94],
['spans/aquarium.js', m95],
['spans/aurora.js', m96],
['spans/caustics.js', m97],
['spans/chat-ticker.js', m98],
['spans/clock.js', m99],
['spans/constellation.js', m100],
['spans/daylight.js', m101],
['spans/digital-rain.js', m102],
['spans/dispersion.js', m103],
['spans/fireflies.js', m104],
['spans/first-light.js', m105],
['spans/flip-clock.js', m106],
['spans/galaxy.js', m107],
['spans/goal.js', m108],
['spans/hearth.js', m109],
['spans/lava.js', m110],
['spans/life.js', m111],
['spans/marquee.js', m112],
['spans/power-on.js', m113],
['spans/progress.js', m114],
['spans/rain-glass.js', m115],
['spans/rain.js', m116],
['spans/ripple.js', m117],
['spans/scoreboard.js', m118],
['spans/snowfall.js', m119],
['spans/spectrum.js', m120],
['spans/swell.js', m121],
['spans/warp.js', m122],
['spans/waveform.js', m123],
['dials/color-wheel.js', m124],
['dials/eq.js', m125],
['dials/gauge.js', m126],
['dials/light.js', m127],
['dials/refraction.js', m128],
['dials/rundown.js', m129],
['dials/score.js', m130],
['dials/scrubber.js', m131],
['dials/selector.js', m132],
['dials/timeline.js', m133],
['dials/value-bars.js', m134],
['dials/volume-arc.js', m135],
['dials/volume.js', m136],
['dials/zoom.js', m137],
['screens/galleon-dashboard.js', m138],
['screens/galleon-game.js', m139],
['screens/galleon-media.js', m140],
['screens/galleon-meeting.js', m141],
['screens/galleon-studio.js', m142],
['screens/galleon-system.js', m143],
['screens/galleon-weather.js', m144],
['screens/neo-agenda.js', m145],
['screens/neo-clock.js', m146],
['screens/neo-now-playing.js', m147],
['screens/neo-system.js', m148],
['screens/strip-media.js', m149],
['screens/strip-system.js', m150],
['apps/clock-span.js', m151],
['apps/clocks.js', m152],
['apps/counter.js', m153],
['apps/cpu-ring.js', m154],
['apps/date-page.js', m155],
['apps/focus-timer.js', m156],
['apps/galleon-mix.js', m157],
['apps/galleon-widgets.js', m158],
['apps/meeting.js', m159],
['apps/mic-meter.js', m160],
['apps/neo-info.js', m161],
['apps/pomodoro-set.js', m162],
['apps/scene-countdown.js', m163],
['apps/scenes.js', m164],
['apps/spectrum.js', m165],
['apps/system.js', m166],
['apps/time-zones.js', m167],
['apps/waveform-strip.js', m168],
['apps/waveform.js', m169],
['games/catch.js', m170],
['games/coin.js', m171],
['games/dice.js', m172],
['games/echo.js', m173],
['games/lights-out.js', m174],
['games/memory.js', m175],
['games/merge.js', m176],
['games/oracle.js', m177],
['games/reaction.js', m178],
['games/slots.js', m179],
['games/spectrum.js', m180],
['games/tictactoe.js', m181],
];
};
__d[318] = function (__ns) {
const { FACET_MODULES } = __m(317);
const { GALLERIES, GALLERY_IDS, getGallery } = __m(2);
const { normalizeFacet, validateFacet } = __m(104);
__e(__ns, { "facetsOfModule": () => facetsOfModule, "sortFacets": () => sortFacets, "allFacets": () => allFacets, "findFacet": () => findFacet, "catalogTree": () => catalogTree, "searchFacets": () => searchFacets, "GALLERIES": () => GALLERIES, "getGallery": () => getGallery }, [], ["GALLERIES","allFacets","catalogTree","facetsOfModule","findFacet","getGallery","searchFacets","sortFacets"]);
let cache = null;
function facetsOfModule(file, mod) {
const exported = mod.default ?? mod.facets;
const list = Array.isArray(exported) ? exported : exported ? [exported] : [];
const facets = [], problems = [];
list.forEach((raw, i) => {
const f = normalizeFacet(raw, file, i, list.length);
const errs = validateFacet(f);
if (errs.length) problems.push(...errs);
else facets.push(f);
});
return { facets, problems };
}
function sortFacets(list) {
const gi = (g) => GALLERY_IDS.indexOf(g);
const ci = (f) => getGallery(f.gallery).categories.indexOf(f.category);
return list.sort((a, b) => gi(a.gallery) - gi(b.gallery) || ci(a) - ci(b) || a.order - b.order || a.title.localeCompare(b.title));
}
function allFacets({ strict = false } = {}) {
if (cache) {
if (strict && cache.problems.length) throw new Error(`invalid facets:\n  ${cache.problems.join('\n  ')}`);
return cache;
}
const out = [], problems = [];
for (const [file, mod] of FACET_MODULES) {
const r = facetsOfModule(file, mod);
out.push(...r.facets);
problems.push(...r.problems);
}
const seen = new Map();
for (const f of out) {
if (seen.has(f.id)) problems.push(`duplicate id "${f.id}" in ${f.file} and ${seen.get(f.id)}`);
else seen.set(f.id, f.file);
}
cache = sortFacets(out).filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i);
cache.problems = problems;
if (problems.length && strict) throw new Error(`invalid facets:\n  ${problems.join('\n  ')}`);
return cache;
}
function findFacet(query) {
const facets = allFacets();
const q = String(query).toLowerCase();
return facets.find((f) => f.id === q)
|| facets.find((f) => f.title.toLowerCase() === q)
|| (() => { const m = facets.filter((f) => f.id.startsWith(q)); return m.length === 1 ? m[0] : null; })();
}
function catalogTree() {
const facets = allFacets();
return GALLERIES.map((g) => ({
...g,
count: facets.filter((f) => f.gallery === g.id).length,
categories: g.categories
.map((name) => ({ name, facets: facets.filter((f) => f.gallery === g.id && f.category === name) }))
.filter((c) => c.facets.length),
})).filter((g) => g.count);
}
function searchFacets(query, { gallery, kind } = {}) {
const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
return allFacets().filter((f) => {
if (gallery && f.gallery !== gallery) return false;
if (kind && f.kind !== kind) return false;
const hay = `${f.id} ${f.title} ${f.description} ${f.tags.join(' ')} ${f.gallery} ${f.category} ${f.kind}`.toLowerCase();
return terms.every((t) => hay.includes(t));
});
}
};
export { __m };
