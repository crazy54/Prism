# Authoring for Prism Deck — the contract (API 1.6)

Prism Deck is Prism's third catalog: Stream Deck (and Corsair) artwork that animates on the hardware. Everything renders as **deterministic SVG strings** in the deck SVG subset, so one frame looks the same in the Stream Deck app, in browsers, and in the raster backend (hidraw devices, PNG/GIF exports, golden tests).

There are three things you can author. Each is one ES module; nothing else to register.

| You write | Where | It is | Validated by |
|---|---|---|---|
| a **glyph** | `src/glyphs/<category>/<id>.js` | an icon as pure geometry on a 48 × 48 grid, drawn through semantic roles; declares states and idle motion | `src/glyphs/_glyph.js` |
| a **theme** | `src/themes/<id>.js` | a material: key background, how roles are painted, typography, press feedback, strip/screen styling | `src/themes/_theme.js` |
| a **facet** | `src/facets/<gallery>/<name>.js` | a catalog entry: anything that renders on a surface (a key, a span of keys, a strip, a screen, a whole deck) | `src/facets/schema.js` |

Every glyph renders in every theme (`icons` facets are one line each), and every facet must render in every theme, both modes, at every target the schema lists. Files starting with `_` are helpers (not registered). After adding a module run `npm run facets:manifest`.

---

## 1. Surfaces

A facet declares one `surface`. The engine creates the canvas (`ctx.w × ctx.h`), you draw it, `render()` slices it for the hardware.

| surface | canvas | sliced into | targets the conformance test renders |
|---|---|---|---|
| `key` | one key at the device's **native** px: 72 (classic 15-key, modules), 80 (Mini), 96 (XL, Neo), 112 (+ XL), 120 (+), **144 × 112** (Studio — not square), 160 (Galleon 100 SD) | — | every native size (`KEY_SIZES`) |
| `span` | a block of keys **including the physical gaps** (`span: { cols, rows }`, numbers or `'all'`) | one SVG per key; the gap pixels are hidden behind the bezel, so motion reads continuous | Mini, MK.2, XL, Neo, +, + XL, Galleon, Studio |
| `strip` | Stream Deck + touch strip 800 × 100 (+ XL: 1200 × 100) with `segments: 'all'`, or one dial's 200 × 100 segment with `segments: 1` | one 200 × 100 SVG per dial (a plugin can't draw across the strip in one call) | + and + XL / one segment |
| `screen` | `screens: [...]`: `galleon` 720 × 384 (4 widgets: 2 dials × 2 layers; each a **2:1 window, 360 × 180, centered in its 360 × 192 quadrant** — 6 px gutters above and below, where the app draws its active-layer highlight; keep content inside the windows), `galleon-widget` 360 × 180, `infobar` 232 × 50 (Neo, SDK layout), `monitor` 2560 × 720 | Galleon: 4 widget windows | each listed target |
| `deck` | the whole LCD panel: every key window + strip + screen in native panel px (`ctx.deck`) | keys, strip segments, screen (+ the Galleon's 4 widget windows) | every family device |

**Slices are culled** (API 1.2): for span, deck, strip and Galleon-widget surfaces, each slice keeps only the top-level elements whose (conservative) bounds touch its window, plus the `<defs>` they use. So draw per cell where you can — `keyInto()` blocks, per-cell paths — and keep ids stable (`k.id('name')`, no frame-dependent names): a key whose own pixels didn't change then produces a byte-identical string and runtimes skip it. One element that crosses many keys (a single waveform path) is carried by every slice it touches; split long geometry per cell on big devices. `render(f, { cull: false })` gives the old whole-canvas slices. The per-slice budget is 96 KB (aim for the 32 KB key budget: every byte is resent base64 on each update).

Geometry lives in `src/devices.js` (generated from the hardware research; see `docs/devices.md`). Don't hard-code positions: lay out from `ctx.w / ctx.h`, `ctx.grid.cells` (span/deck: `{ i, col, row, x, y, w, h }`), `ctx.strip.segments`, `ctx.screen`.

## 2. The render context (`ctx`)

| field | meaning |
|---|---|
| `kind`, `w`, `h`, `size` | surface, canvas px, `min(w, h)` |
| `device`, `grid`, `strip`, `screen`, `deck` | the model and surface geometry |
| `theme`, `colors` | the active theme instance (`theme.spectral(h)`, `theme.lambda(h)`, painters) and its palette |
| `glyphs` | the glyph registry (draw with `surface(ctx).glyph(id)`) |
| `t`, `frame` | seconds since start, frame number |
| `state`, `stateName`, `states`, `since`, `tone` | state index / name, all names, seconds in this state, the state's tone |
| `pressed`, `pressAge` | key held now; seconds since the last release (`Infinity` = never pressed) |
| `pressKey` | span / deck: the device key index (`grid.cells[*].i`) that was pressed, else `null` — so a span can react where it was touched |
| `game`, `gamePrev`, `gameEvent` | game facets only (§ 13): the current state, the state before the last event (or `null`), the last event + its `age` in seconds (or `null`) |
| `pressedFor` | seconds the key has been held so far (0 when released) — presses that build while held (shutter, bloom) |
| `heldFor` | seconds the last finished press lasted (set on release; 0 before any) — hold-to-confirm, long vs short press, without flipping states (API 1.5.1) |
| `turnAge` | seconds since the last dial rotate (`Infinity` = never) — a brief, deterministic "turning" emphasis |
| `touch` | strip / dial surfaces on touch hardware (+, + XL): `{ x, y, hold, age }` — the tap position in surface px, long-touch flag, seconds since; `undefined` otherwise (the Galleon has no touch). What the hardware delivers (hardware lab, app 7.6): a `touchTap` carries a **segment-local** `tapPos` (0–200 × 0–100 within the touched dial's segment) and `hold: true` for a long press; **swipes never reach plugins**. So on a full-strip facet `touch.x` is strip-wide only because the runtime adds `segment × 200`; one-segment facets get the local position. Don't design gestures (drag, swipe) — only taps and long presses |
| `value`, `ticks`, `values` | dial value 0–1, accumulated ticks, strip: one value per segment |
| `params` | resolved parameters (defaults + user overrides, clamped) |
| `hue`, `tint` | the facet's Spectrum position (gallery hue unless `params.hue`) and its color in this theme |
| `seed`, `rng()`, `noise` | seeded randomness (`rng()` returns a fresh generator, so renders stay pure) — `noise.n1/n2/fbm/metric/series` |
| `now`, `clock` | wall-clock ms from the runtime (fixed in tests) and `{ year, month, day, dow, h, m, s, ms }` |
| `data` | live inputs from a runtime (see §7); **always** simulate a fallback |
| `idPrefix`, `id(name)` | collision-free SVG ids |
| `reduced` | reduced motion: draw a meaningful static frame |

## 3. Drawing — the scene API

```js
import { surface, path, rect, circle, P, url, linearGradient, radialGradient, n, lerp, phase } from '../../scene/index.js';

render(ctx) {
  const k = surface(ctx);                       // KeySurface for keys, PanelSurface otherwise
  k.background({ tone: ctx.tone });             // the theme's material
  k.glyph('mic', { state: 'on', labeled: true });   // geometry from the glyph, paint from the theme
  k.eyebrow('Room 2');                          // text roles: eyebrow · label · value · hero · caption
  k.label('Mic');
  return k.svg();                               // keys: the theme's press feedback is applied here
}
```

- **Surface methods**: `background(o)`, `glyph(id, { state, labeled, size | box, level, value, params, opacity })`, `eyebrow / label / value / hero / caption(str, { x, y, cy, align, maxWidth, maxLines, size, color, opacity })`, `lambda()`, `tone(name)`, `color(spec)`, `roleStyle(role, tone)`, `id(name)`, `def(markup)`, `add(markup)`, `place(markup, { x, y, scale })`, `svg()`. `k.m` holds the metrics (`u, safe, radius, hair, line, bold, ring`) scaled to the surface.
- **Compositing**: `compose(parent, rect, (sub) => …, { kind })` / `keyInto(parent, cell, (k) => …)` draw a real key (or panel) inside a span/deck/screen with its own metrics and ids — how theme previews and spans keep each key's material.
- **Builder** (`scene/svg.js`): `el, g, rect, circle, ellipse, line, path, polyline, polygon, linearGradient(id, [[offset, '#hex', opacity]], attrs), radialGradient, url(id), P()` (path builder), `n()` (number formatting — throws on NaN), `svgDoc, svgWindow`.
- **Shapes** (`scene/shapes.js`): `polar` (0° = 12 o'clock, clockwise), `arc, ring, spectrumArc` (an arc dispersed across the Spectrum), `ticks, needle, sparkline / sparkPath / sparkPoints` (scrolling, clipped to the box), `bars, segments`.
- **Text** (`scene/text.js`): `textPath(str, { x, y, size, weight, anchor, tracking, tabular, caps, maxWidth })` draws **Inter outlines as paths** — real advance widths, GPOS kerning; 400/600 are real, other weights synthesized; `tabular` gives clock digits one width. Also `measureText, fitText, wrapText, capHeight, clockText, pad2, compact`. The charset is printable ASCII + `· • … ° – — − × → ← ↑ ↓ λ ± € £ © ’ ‘ “ ” ▲ ▼ ● ✓` (use the real minus `−` for negative numbers; → ← λ ▲ ▼ ● ✓ are drawn by the engine, the rest are Inter).
- **Color** (`scene/color.js`): OKLab/OKLCH math, `oklch(L, C, H)` (gamut-clipped by chroma), `mix`, `shade`, `contrast`; the Spectrum comes from `ctx.theme.spectral(hue)`, the λ label from `ctx.theme.lambda(hue)`.
- **Motion** (`scene/easing.js`): `outExpo` (Refraction's arrival curve), `arrive(since, dur)`, `pulse(t, period)`, `phase(t, period)`, `spring`, `smoothstep`, `lerp`, `clamp`.

## 4. Glyphs (icon designers)

Optional `hue` (OKLCH degrees) gives a glyph its natural color (a lamp is amber); its icons facet defaults its `hue` param to it. `src/glyphs/_starter.js` holds ~60 hairline sketches on a 24 grid (scale × 2) — a starting point, never a finished glyph.

```js
// src/glyphs/audio/mic.js
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse } from '../../scene/easing.js';

export default defineGlyph({
  id: 'mic', title: 'Microphone', category: 'audio', tags: ['mute', 'voice'],
  states: { on: 'active', off: 'neg' },     // state → tone (or an array: tones inferred from names)
  loop: 1.6,                                // idle animation period (s); 0 = static
  draw(g, s) {                              // s: { state, tone, t, since, pressed, pressAge, value, level, params, phase(p) }
    g.rect(18.5, 6, 11, 20, { r: 5.5 });                    // role 'line' (stroked) by default
    g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
    if (s.state === 'off') g.line(10, 8, 10 + 28 * arrive(s.since, 0.32), 8 + 32 * arrive(s.since, 0.32), { role: 'accent' });
    else g.arc(24, 16, 13.5, 60, 120, { role: 'accent', opacity: 0.35 + 0.65 * pulse(s.t, 1.6) });
  },
});
```

- **Grid**: 48 × 48 units, y down. Keep geometry inside the **safe area 6–42** (the test checks it; themes need the margin for glow/extrusion). Centered optical weight: a ~30-unit square glyph reads as large as a ~34-unit circle.
- **Roles** — never colors: `line` (primary stroke), `fill` (solid mass), `accent` (the highlight — stroke, or `{ fill: true }`), `dim` (secondary detail), `spark` (tiny emissive dot, filled). Every primitive takes `{ role, fill, weight (stroke multiplier), opacity, cap, join, dash }`.
- **Pen**: `path(d)`, `line`, `polyline`, `polygon`, `circle`, `ellipse`, `rect(x, y, w, h, { r })`, `arc(cx, cy, r, a0, a1)` (degrees, 0 = up, clockwise), `dot(x, y, r)`, `text(str, { x, y, size, weight, anchor })` (outlines), `polar(cx, cy, r, deg)`, `group({ x, y, rotate, scale, origin, opacity }, fn)`.
- **Strokes**: themes set the width (≈ 2.2–3.2 units). Draw stroke geometry on whole/half units so a 3-unit stroke lands on pixel edges at 48/72/96/144 px.
- **States and motion**: states are named (`on/off`, `playing/paused`, `live/offline` …) with a tone each. Transitions use `s.since` (`arrive(s.since, 0.3)`), idle loops use `s.t` with a period that divides `loop`, so loops are seamless. Nothing may depend on wall time; clocks read `s.params.h / m`.
- Add `src/facets/icons/<id>.js` → `export default iconFacet('<id>');` (the test fails if a glyph has no icons facet).

## 5. Themes (theme designers)

```js
// src/themes/paper.js
import { defineTheme, helpers } from './_theme.js';
export default defineTheme({
  id: 'paper', title: 'Paper', description: 'Ink on warm paper, letterpress keys …', tags: ['light', 'print'],
  modes: { light: { bg, surface, surface2, line, ink, muted, dim, accent, accent2, pos, info, warn, neg, crit } },   // and/or dark
  roles: { line: { color: 'ink', width: 3 }, accent: { color: 'tone', width: 3, glow: 0 }, dim: { color: 'muted', width: 2.4 } },
  type: { label: { weight: 700, caps: true, tracking: 0.08 }, eyebrow: { tracking: 0.2 } },
  tones: { active: 'accent' },              // tone → palette key ('tint' = the facet's Spectrum hue)
  background(k, { tone }) { … },            // key material — draw with k.add / k.def / helpers
  surface(k, o) { … },                      // strips, dial segments, screens, spans (default: background)
  paint(k, prim, style) { … },              // one primitive (grid units) → markup; default: stroke/fill + optional glow
  paintGlyph(k, pen, { tone, box, styleOf }) { … }, // whole-glyph override (e.g. helpers.pixelate); box = { x, y, size } in surface px
  press(k, { pressed, age }) { return { transform, under, overlay }; },
  glyphBox(k, { labeled }) { return { x, y, size }; },
  text(k, role, str, o) { … },              // typography override per text role
  glyphs: { mic(g, s) { … } },              // bespoke art for specific glyphs, same pen API
});
```

- **Palette**: every key in `PALETTE_KEYS` as `#rrggbb` per mode. Optional: `edge, edgeOpacity, beam, beamOpacity, sheenOpacity, spectrum: { l, c }` (OKLCH lightness/chroma of the theme's Spectrum). The test enforces **ink ≥ 7:1, muted ≥ 4.5:1, accent ≥ 3:1** on `surface` and `surface2`.
- **Role styles**: `{ color, width, opacity, glow (0–1), cap, join }`; color specs are palette keys, `'tone'`, `'tint'`, `#hex` or `(k, tone) => hex`.
- **Tones**: `idle · active · ok · info · warn · neg · alert · crit · busy · off`. A key that is *on* should look lit; `alert`/`crit` may pulse (`helpers.pulse(k)`) and must not rely on color alone; `busy` is working (no result yet); `off` is disabled — dim and flat.
- **Spectrum tiers**: `k.theme.spectral(h, { tier: 'vivid' | 'ink' | 'wash' })` (vivid = beams/glows/marks ≥ 3:1, ink = text-safe ≥ 4.5:1, wash = tints) and `k.theme.ink(h)`. A palette with `stops` (the design tokens' 12 stops) interpolates them; otherwise `spectrum: { l, c }` is used.
- **Helpers**: `helpers.glow`, `helpers.beam` (the Refraction hairline), `helpers.gradient`, `helpers.pulse`, `helpers.pixelate(k, pen.flat(), styleOf, { cells })` (rasterize a glyph onto a pixel grid), plus `mix, oklch, lerp, clamp`. `themes/prism.js` exports `glass()` as a worked example.
- A theme is a **material**, not a recolor: material, role painting, type and press must all be considered. Two modes are welcome; one is fine.
- Add the preview facet: `src/facets/themes/<id>.js` → `export default themeFacet('<id>', { title, category, description });`.

## 6. Facets (everyone)

```js
export default {
  id: 'span-waveform', title: 'Waveform', category: 'Waveforms & Audio',
  description: 'A live audio waveform across a row of keys …',   // 20–180 chars
  tags: ['audio', 'waveform'],
  surface: 'span', span: { cols: 'all', rows: 1 },
  data: ['audio'], fps: 15, loop: 8,
  states: [], press: 'momentary',            // 'cycle' | 'toggle' | 'momentary' | 'none'
  params: { speed: { type: 'number', default: 1, min: 0.25, max: 3, step: 0.05, label: 'Scroll speed' } },
  render(ctx) { … return svg; },
};
```

- **Galleries** (`src/facets/galleries.js`; id prefixes in brackets): `themes` [theme-] · `icons` [icon-] · `motion` [press-, state-, idle-, alert-] · `spans` [span-] · `dials` [dial-, strip-] · `screens` [screen-] · `apps` [app-]. Each has fixed categories and allowed surfaces.
- **Params**: `number | hue | text | select | bool | color | theme | glyph`, each with a `default` (and `min/max/step`, `options`, `maxLength`, `label`). They become property-inspector controls in the plugin and knobs in MCP tools.
- **Press**: runtimes advance state on press (`cycle`/`toggle`), or just report `pressed` (`momentary`). Motion facets can `autoplay` a press each loop when nobody presses (`facets/motion/_autoplay.js`).
- **Determinism**: everything derives from `ctx` — `t`, `ctx.rng()`, `ctx.noise`, `ctx.clock`, `ctx.data`. Never `Date.now()`, `Math.random()`, timers, `node:*`, `process`, DOM.
- **Budgets** (the test fails above): key 32 KB / 25 ms, span 384 KB / 120 ms, strip 96 KB / 60 ms, screen 128 KB / 80 ms, deck 512 KB / 250 ms. Aim 5× lower; keys are usually 3–7 KB.

## 7. Live data (`ctx.data`)

Runtimes (plugin, web, hidraw apps) feed what a facet lists in `data`; shapes are fixed so apps and sources interoperate:

| key | shape |
|---|---|
| `audio` | `{ level: 0–1, levels: number[] (recent peaks, oldest first), rate? }` |
| `spectrum` | `{ bands: number[] (0–1, low → high) }` |
| `cpu` / `mem` / `gpu` / `disk` / `battery` | number 0–1 |
| `net` | `{ up, down }` in bytes/s |
| `temp` | °C number |
| `uptime` | seconds |
| `clock` / `timer` | use `ctx.clock` / state + `ctx.since` |
| `media` | `{ title, artist, position, duration, playing }` |
| `weather` / `calendar` | `{ temp, code, label }` / `{ next: { title, at } }` |

## 8. The deck SVG subset

`src/scene/validate.js` defines it (and the conformance test enforces it on every frame and every slice): `svg g defs title path rect circle ellipse line polyline polygon linearGradient radialGradient stop clipPath`; fills/strokes as `#rrggbb`, `none` or `url(#id)` with separate opacities; transforms; gradients. **No** `<text>` (use `textPath`), filters, masks, `use`, images, CSS, 8-digit hex (Qt reads `#AARRGGBB`), `rgba()`/`hsl()`, external references, compact arc flags (write `a5 5 0 0 1 10 10`, never `a5 5 0 0110 10`), `<g>` inside `<clipPath>` (browsers ignore it). Every id carries the render's `idPrefix` (`k.id(name)`).

**On the device** (hardware lab, Stream Deck app 7.6 / Qt 6.11): `<clipPath>` is **ignored** and `preserveAspectRatio` is ignored (the viewBox is stretched onto the key), `rgba()`/`hsl()`/8-digit hex paint opaque black, fonts never load, filters other than blur fail open, and raw SVG strings are rejected (`data:` URLs only). Facets keep using `clipPath` — runtimes pass every frame through `toDeviceSvg(svg)` (`src/scene/qt.js`), which turns each clip into an equivalent luminance `<mask>`, drops `preserveAspectRatio` and gives the root the viewBox's aspect; `validateSvg(svg, { profile: 'device' })` checks the result. Masks stay out of facets (the subset bans them; only the converter emits them).

**Complexity budget** (API 1.4): every frame one key, dial segment, Galleon widget or info bar receives stays **under 300 elements** (counted after `toDeviceSvg`, `<stop>`s and `<defs>` included) — the app keeps up with 300-element frames and collapses near 1,200 (~47 updates/s). The conformance test enforces it. Merge runs of identical paint into one `<path>` (`P()` builds multi-subpath `d`; `_d1-layers.js` / `_d5-print.js` merge glyph layers for you), reuse one gradient per surface, and prefer one path of many dashes or bars to many elements.

## 9. Motion on hardware

- Stream Deck animation = streaming frames (`setImage` never animates GIFs). Elgato's guidance is ≤ 10 updates/s per key; budget ~30 key updates/s per device. Pick the lowest `fps` that reads smooth: clocks 1–2, meters 4–8, waveforms/visualizers 12–15. Runtimes cap and dedupe identical frames — static states cost nothing.
- The app's whole-device ceiling is ~230–300 `setImage`/`setFeedback` calls a second; above it frames queue and the deck lags. Keep frames under the element budget (§ 8).
- Refraction motion: things arrive by converging (`outExpo`, 240–600 ms); a press refracts. Make loops seamless at `loop` (use `phase(t, period)` with periods that divide it).
- `ctx.reduced` → one meaningful still (`render.stillTime(facet)` is what thumbnails use: the facet's `still` if it sets one — e.g. `still: 5.6` for a sequence whose best frame is late — else 40% into the loop, ≤ 6 s).
- Faded text: pass `opacity` to `k.label / value / …` — it fades the theme's whole lettering as one (shadow, halo and plate copies included), so never fade text by `fill-opacity` on one copy.
- **Boot sequence**: `span-power-on` is the deck's start-up. Runtimes play it once when they start — `params: { replay: false }`, `t` = seconds since start — across every key, then hand the keys to their configured facets once it holds (≈ `loop − 1.4` s).

## 10. The Refraction key grammar (signature theme `prism`)

From `design/tokens.json` (`deck.*`, synced into `src/scene/tokens.js` by `npm run sync-tokens`). Metrics at a 72 px key (scale with `k.m.u`; author at 144 = 2×): bleed 4 (the bezel may crop it), content safe 6 (`k.m.safe`), text safe 8 (`k.m.text`), radius 9, hairline 1, line 1.5, bold 3, ring 5. Type: micro/eyebrow 8/600 caps +0.08 em (non-essential only), label 11/600 (≤ 2 lines, ≤ 9 chars a line), value 22/600 tabular −0.02 em (≤ 5 chars), hero 30/700; nothing below 8 px @72. Only Inter 400/600/700. States: **off** — spectral index (16 × 2 bar, 6 above the bottom) at 45%, lit edge only, glyph muted; **on** — index at 100% + glow, 1.5 px inner ring in the hue, glyph in the hue's ink, 22% hue wash from the bottom; **alert** — index + 2 px ring in warn/neg, glyph ink, breathes 1 Hz for 10 s then holds, corner notch; **busy** — no index, a white beam segment travels the perimeter (1.2 s a lap); **disabled** — no index or edge, glyph faint. ≤ 10 fps; static between interactions. LCD keys default to Night; Day is a profile option. The deck surface hue is amber (λ 584); deck galleries sit on the 12 Spectrum stops.

## 11. Verify

```bash
cd prism-deck
npm run facets:manifest                                               # after adding/removing modules
node --test --test-name-pattern="facet icons/" test/facets.test.js    # your gallery
node --test --test-name-pattern="glyph audio/" test/facets.test.js    # your glyph category
node --test --test-name-pattern="theme paper" test/facets.test.js     # your theme's contrast
node scripts/shoot.mjs --sheet --gallery icons --theme paper --mode both --out <dir>     # LOOK at it
node scripts/shoot.mjs --devices galleon,plus,mk2,xl,mini --facet theme-paper --out <dir>
node scripts/shoot.mjs --device plus --keys icon-mic,icon-volume --strip dial-volume --out <dir>
```

## 12. For runtime engineers (plugin, web, raster, hidraw, MCP)

`render(facet, opts)` → `{ surface, svg, w, h, keys?: [{ i, col, row, svg }], segments?: [svg], widgets?: [{ dial, layer, x, y, w, h, svg }], screen? }` — `widgets` for Galleon screen facets **and deck facets** (API 1.5.1; for decks x / y are in the panel) — (Galleon widgets: 360 × 180 windows at `x = dial × 360`, `y = layer × 192 + 6` — map each onto the 200 × 100 encoder canvas **uniformly**, 5/9 on both axes). **Before `setImage` / `setFeedback`, run every frame through `toDeviceSvg(svg)`** (exported from `index.js`), then `svgDataUrl()`. Options: `device, theme ('prism' | 'prism:light'), mode, t, state, since, pressed, pressAge, pressedFor, heldFor, pressKey (span/deck: the pressed key index), value, values, params, seed, data, now, tzOffset, reduced, size, span, segments, screen, outScale, uniqueIds, cull (default true)`. Slices are culled and byte-stable: compare strings per key and send only the keys that changed. `nextState(facet, state)` applies the press rule; `stillTime(facet)` gives the thumbnail instant; `scene/scheduler.js` is a shared frame scheduler with fps caps, plus `createChangeGovernor({ budget })` — observe how many keys each frame actually changed and it caps the unit's fps to the budget (idle probe when nothing changes), so facets need no hand-tuned frame clocks; geometry is rounded to 2 decimals everywhere (`devices.js r2`, the SVG writer and the validator agree); `svgDataUrl(svg)` makes the `setImage` payload (`data:image/svg+xml;base64,…`). Devices: `getDevice(id | alias | DeviceType)`, `deviceFromInfo(registrationInfo.devices[i])`, `keySize`, `spanGrid`, `stripGrid`, `deckLayout`, `deviceLayout`.

## 13. Games — stateful facets (API 1.5)

A facet with a `game` block is a pure state machine plus a pure renderer, so a game can run on a key, a span of keys or a whole deck (gallery `games`; surfaces key / span / deck). Exemplars: `src/facets/games/lights-out.js` (span, any grid) and `src/facets/games/dice.js` (one key). Runtimes host it with `src/scene/game.js` (`createGameHost`); the web player and the hid runner already do; the plugin follows `docs/game-runtime.md`.

```js
game: {
  init({ seed, device, grid, params }) { return { …small plain JSON…, rng: rngSeed(seed) }; },
  reduce(state, ev) { return ev.type === 'press' ? { ...state, … } : state; },   // pure: never mutate state
  tickHz: 2, ticking: (state) => state.running,   // optional clock ticks (≤ 4 Hz), only while ticking() says so
  animate: 0.6,                                   // seconds of transition after each event (default 0.6)
},
render(ctx) { /* ctx.game, ctx.gamePrev, ctx.gameEvent (+ .age) */ },
```

- **grid**: `{ cols, rows, cells: [{ i, col, row }] }` — `i` is the device key index, `col` / `row` are 0-based inside the facet (a span placed at column 2 still starts at col 0). Keys render in `ctx.grid.cells` order, which is the same order (row-major).
- **Events** `{ type, key?, cell?, col?, row?, dial?, ticks?, x?, y?, hold?, t, n, seed }`: `press` / `release` (keys; `dial` when a dial is pushed), `rotate` (`dial`, `ticks`), `touch` (`x`, `y` in strip px, `hold`), `tick`. Use `cell` (null when the key is outside your grid). `reset` never reaches `reduce`: the host re-runs `init` with a fresh seed (runtimes: long-press a game key 1.5 s — not on the Galleon — or a "New game" button).
- **Randomness** only from the state: keep a uint32 `rng` in it and thread it through `rngNext(r) → [x, r']`, `rngInt(r, n)`, `rngShuffle(r, list)` (`src/scene/game.js`). Never `Math.random`, `Date` or `ev.t` for outcomes (`ev.t` is fine for timing, e.g. a reaction time). The same event log must replay to the same state — the conformance test replays every game.
- **State** is plain JSON (numbers, strings, booleans, null, arrays, plain objects), ≤ 4 KB — it is persisted in the Stream Deck action's settings. Strings like `'0110…'` pack boards well. Store what `reduce` needs (grid size, difficulty) in the state: `reduce` gets only `(state, ev)`.
- **Rendering** is a pure function of `(ctx.game, ctx.gamePrev, ctx.gameEvent.age)`: draw the transition from `gamePrev` to `game` over `animate` seconds, and the settled frame once `age ≥ animate` (that frame must be stable — runtimes stop rendering after it). Without runtime input (stills, thumbnails, conformance) `ctx.game` is `init()`'s state, so make the first board look good. Honor `ctx.reduced` (skip the transition).
- **Budget**: set `animated: false` (static between events) and `fps` ≤ 12 for the transitions; tick only while the game needs it; keep every key frame under 300 elements mid-game; draw per key (`keyInto`) so unchanged keys stay byte-identical and are never resent. Custom pieces: `k.pictogram((pen) => …, { box, tone })` draws on the 48-unit glyph grid with glyph roles, painted by the theme (neon pieces glow, paper pieces print).
- **Verify**: `node --test --test-name-pattern="facet games/" test/facets.test.js` (every game: JSON state, frozen-input reduce, replay, resume, valid frames mid-game, in four themes) and `node --test test/games.test.js`.

## 14. Linked state (API 1.6)

Keys, dials and screens on one device that show the same thing agree: mute the mic on a key and every mic key, the Galleon studio / meeting screen and a + mic dial say MUTED; push a Galleon dial to go live and every On Air key lights. A facet declares what it mirrors with `link` (validated by the schema; `src/scene/link.js`):

```js
link: { 'mic.muted': { live: false, muted: true } },               // states ↔ a shared value
link: { 'volume.level': 'value' },                                 // the dial value is the shared value
link: (p) => (p.controls === 'mic' ? { 'mic.muted': { on: false, muted: true } } : {}),   // or a function of params
```

- **Channels**: `mic.muted`, `camera.on`, `stream.live`, `volume.level`, `volume.muted`, and `game` (a game's readout). A channel reaches every facet that links it or lists its data key in `data`, as `ctx.data.mic.muted`, `ctx.data.stream.live`, `ctx.data.volume.level`, `ctx.data.game` — so read the data first and fall back to your own state, as the meeting keys do.
- **Runtimes** keep one bus per device (`createLinkBus()`; the web player per `mountDevice`, or one `opts.bus` shared by several devices on a page; the plugin per physical device): after a press or a turn they `publish`, every slot that mirrors a changed channel flips its state (`stateOf`) / value (`valueOf`) and redraws, and a slot that appears later `adopt`s the device's values.
- **Games** may add `game.readout(state, params) → { title, cards: [{ title, value, sub, bar, hue, tone, role }] ×4 }` (plain data); runtimes publish it on `game` after every move, and `screen-galleon-game` shows it. The web player puts that screen on a Galleon whose page gave it no screen while a key or span game is on the keys.
- **Galleon screens belong to their dials**: both runtimes pass `ctx.values` (one per dial) to a screen on both dials and press the screen facet when a dial is pushed (the web player also when the widget above a dial is clicked). Draw dial-driven readouts (volume) from `ctx.values`.
- **Muted is unmissable**: draw a muted mic with `src/facets/apps/_muted.js` (`mutedKey`, `mutedPlate`, `strike`): the face washes in the theme's neg red (as strong as ink still reads at 4.5:1), a heavy ring, the glyph struck through in ink, the label MUTED — never color alone.
