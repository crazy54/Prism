# prism-deck/web — virtual Stream Decks in the browser

Zero-dependency browser runtime for Prism Deck. It draws any model in `src/devices.js` — bezel, key windows and the gaps between them, dials, the Stream Deck + touch strip, the Neo info bar, the Corsair Galleon 100 SD screen — and plays facets on keys, spans, strips and screens at their own fps. Every frame comes from `render()`: the same SVG the plugin sends to the hardware and the raster backend draws.

Used by Prism.html's Stream Deck page (fully offline, from the `#prism-deck-catalog` island) and the website's `/deck/`.

```js
import { mountDevice, mountKey, setGlobalMotion } from 'prism-deck/web';
import { findFacet } from 'prism-deck';

const deck = mountDevice(el, {
  model: 'plus',                       // any devices.js id / alias / SDK DeviceType
  theme: 'prism', mode: 'dark',        // deck theme; the device is black for dark, the white edition for light
  width: 560,                          // CSS px — or scale (CSS px per panel px), or fit: true
  keys: ['icon-mic', 'app-cpu-ring'],  // one key facet per key, row-major (objects, specs, or ids with resolve)
  dials: ['dial-volume'],              // one 200×100 dial-segment facet per dial (Stream Deck + / + XL)
  // strip: 'strip-refraction',        // or one full-strip facet
  // facet: 'span-waveform',           // or a span / deck facet over the device (keys a span leaves free still take `keys`)
  screen: 'screen-galleon-dashboard',  // Galleon screen / Neo info bar
  resolve: findFacet,
  onPress({ role, index, facet, state, stateName }) {}, onRotate({ index, ticks, value }) {}, onTouch({ index }) {},
  data: () => ({ cpu: 0.42 }),         // live inputs for ctx.data, read each frame
});
deck.press(0); deck.rotate(0, +3); deck.pushDial(0); deck.set({ model: 'galleon' }); deck.setTheme('neon', 'dark'); deck.pause(); deck.destroy();

const tile = mountKey(el2, findFacet('icon-power'), { size: 144, displaySize: 112, interactive: true });
setGlobalMotion(true);                 // pause every deck on the page (a motion toggle)
```

| file | what | DOM |
|---|---|---|
| `player.js` | `DeckView`, `KeyView`, `mountDevice`, `mountKey`, page-wide motion and stats | yes |
| `core.js` | dial math, wheel / drag / tap gestures, `fitWidth`, labels, `showcaseLayout`, `devicesFor` | no — unit-tested in Node (`test/web.test.js`) |
| `island.js` | `loadIsland`, `createModuleLoader`: run the package straight from the JSON island | no imports, so it bootstraps itself |
| `index.js` | re-exports all three | — |

## Facet specs

Wherever a facet goes you can pass a normalized facet (`findFacet(id)`), a raw module export, an id string (with `opts.resolve`), or a spec `{ facet, state, params, seed, value }` (`value`: a dial's starting level, 0–1).

## `mountDevice(el, opts)` → `DeckView`

| option | meaning |
|---|---|
| `model` | device id, alias or SDK DeviceType (`getDevice`); default `'mk2'` |
| `theme`, `mode` | deck theme id and `'dark'` / `'light'` |
| `width` · `scale` · `fit` | CSS width; CSS px per panel px; or `fit: true` — fill the host's width (capped by `maxHeight` / `maxWidth`) and re-fit on resize; `fit: 'contain'` also fits the host's height |
| `keys` | one facet spec per key, row-major (missing → blank key) |
| `facet` | a `span` or `deck` facet over the device |
| `dials` · `strip` · `screen` | per-dial segment facets · one full-strip facet · a screen facet |
| `dialValues` | starting levels for dials that have no facet |
| `interactive` | default `true`: keys and the strip are buttons, dials are sliders |
| `autoPause` | default `true`: sleep while off-screen (IntersectionObserver) |
| `reducedMotion` | `true` / `false` to force; default follows `prefers-reduced-motion` → one still per slot (`stillTime`, 40 % into the loop) |
| `fpsCap` | default 15 (Elgato's hardware guidance is ≤ 10 updates/s per key; facets declare their own fps) |
| `seed`, `speed`, `data()`, `now()`, `tzOffset` | seeded randomness, playback speed, live inputs, wall clock for clocks |
| `onPress` · `onRotate` · `onTouch` | `{ role: 'key' \| 'device' \| 'dial', index, facet, state, stateName }` · `{ index, ticks, value }` · `{ index }` |
| `label` | accessible name of the device |

Methods: `set(opts)` (rebuilds), `setKeys`, `setFacet`, `setTheme(theme, mode)`, `setModel`, `press(i)` (tap key i), `rotate(i, ticks)`, `pushDial(i)`, `play`, `pause`, `restart`, `destroy`. Properties: `model`, `width`, `slots`, `stats` → `{ slots, frames, avgFrameMs }`.

### Input

| on | does |
|---|---|
| key: click / tap / Enter / Space | press, then release (the facet's `press` rule: `cycle` / `toggle` advance the state; `momentary` only reports `pressed`) |
| dial: wheel | one detent per mouse notch; trackpad deltas accumulate (`core.wheelTicks`) |
| dial: drag up / down | 6 px per detent (`core.dragTicks`); up is clockwise |
| dial: tap without travel · Enter / Space | push the dial |
| dial: ← → ↑ ↓ (Shift: 5) · Page Up / Page Down (10) | turn |
| touch strip: tap · hold ≥ 0.5 s · Enter / Space | touch (or long-touch) the segment under the pointer: presses that dial's facet and sets its `ctx.touch` |
| touch strip focused: ← → · Home / End, then Enter / Space (Shift: long touch) | choose a segment (outlined; its label is announced), then touch it |

Each slot feeds the render context what happened to it (deck API 1.3): `pressKey` (the device key index a span / deck facet was pressed on), `pressedFor` (seconds held), `turnAge` (seconds since its dial last turned) and, on the + / + XL strip, `touch: { x, y, hold, age }` (strip px for full-strip facets, px inside the segment for dial segments). Slices are per-key culled (API 1.2), and the runtime rewrites a key only when its SVG string changed.

Dials are `role="slider"` with `aria-valuenow` / `aria-valuetext`; keys say their facet's title and state in `aria-label`. Pressed keys and dials get `.pdk-down`.

Games are playable without sight. Every interactive device (and `mountKey` tile) has one polite live region (`.pdk-sr`, `role="status"`): after a game input changes the state it says `core.gameAnnouncement()` — the facet's optional `game.announce(state, prev, params)`, else the readout cards that changed ("Rolled: 7 (3 + 4). Rolls: 2") — once `game.animate` has played. A facet's optional `game.cell(state, k, params)` → `{ label?, pressed? }` describes the key on cell `k`: it is appended to the key's `aria-label`, and `pressed` becomes `aria-pressed` (Lights Out: lit / off; tic-tac-toe: "center, your cross"). Strip segment moves and dial-segment touches are announced in the same region.

## `mountKey(el, facet, opts)` → `KeyView`

One live key, dial segment, strip or screen as a tile: `size` (`{ w, h }` or px; keys default to 144), `displaySize` (CSS width), `theme`, `mode`, `interactive` (press it; wheel on a strip turns it), `autoPause`, `reducedMotion`. Methods: `setState(i)`, `set(opts)`, `play / pause / restart / destroy`. Span and deck facets need `mountDevice`.

## Page-wide

`setGlobalMotion(paused)` (resuming is an explicit choice, so it plays under reduced motion too), `isGlobalMotionPaused()`, `prefersReducedMotion()`, `deckStats()` → `{ decks, live, slots, activeSlots, frames, avgFrameMs }`. One scheduler drives every slot at its own fps with an 8 ms budget per frame; an unchanged frame is never re-inserted into the DOM.

## `core.js` (pure)

`dialAngle(v)` (−135° … +135°) · `dialStep(facet, params)` · `stepValue(v, ticks, step)` · `wheelTicks(acc, deltaY, deltaMode)` · `dragTicks(dy)` · `isTap(dx, dy)` · `segmentAt(x, width, n)` · `fitWidth(device, { width, height, max, min })` · `frameTime(facet, t, { still, fps })` · `stripTouch(px, py, w, h, strip)` · `inputState(slot, t)` · `slotLabel(facet, { state, role, value, index })` · `keyPool(facets)` · `showcaseLayout(device, facets, { offset })` → `{ keys: [{ facet, state }], dials, strip, screen }` (what a page puts on a device to show it off) · `devicesFor(facet)` (where to show a facet: one model per key size for keys, + / + XL for strips, the screen's hosts, else its render targets) · `KEY_SIZE_DEVICES` · `FAMILY`.

## Offline (Prism.html)

The `#prism-deck-catalog` island carries every module in `sources`. `island.js` imports nothing, so it can bootstrap itself:

```js
const cat = JSON.parse(document.getElementById('prism-deck-catalog').textContent);   // in a srcdoc frame: parent.document
const url = URL.createObjectURL(new Blob([cat.sources['prism-deck/src/web/island.js']], { type: 'text/javascript' }));
const { loadIsland } = await import(url);
const deck = await loadIsland(cat);              // every module → a blob: module, relative imports rewired
const web = await deck.web(), reg = await deck.engine();
web.mountDevice(el, { model: 'galleon', facet: 'theme-prism', screen: 'screen-galleon-dashboard', resolve: reg.findFacet });
```

`loadIsland(source, opts)`: `source` is the parsed catalog, its JSON text, the `<script>` element or a Document → `{ catalog, records, record(id), import(key), facet(id), engine(), render(), web() }`. Each module is created once, so module state is shared; nothing touches the network. `createModuleLoader(sources, { urlFor })` is the loader alone (Node tests pass a `urlFor` that writes temp files).

Prism.html's Stream Deck page (`parts/pg-deck.html`) is the reference consumer: stage with any models side by side, theme picker, galleries of live tiles, a detail view with the facet on every device size.

## Styling

The runtime injects `DEVICE_CSS` (`scene/device-view.js`) and its tile CSS once per document or shadow root (`#pdk-style`). Classes are `.pdk-*`. Hosts own layout; devices are absolutely sized from `deviceLayout()`.
