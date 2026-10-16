# First Light — spec

*White light in. Every color out.* The load moment for Prism, plus the Day ↔ Night relight.

| File | What |
|---|---|
| `first-light.js` | Drop-in module, zero deps. Defines `window.PrismFirstLight`. |
| `first-light.css` | Overlay, arming, and View Transition rules. Needs `../brand/prism-mark.css` (the glass pyramid). |
| `first-light.html` | Standalone prototype over a static mock of the new app (top bar, spectral-index rail, tile grid). Params: `?mode=auto\|full\|echo\|fade\|none`, `?theme=day`, `?t=<ms>` (freeze the timeline there), `?ui=0` (hide the QA panel). Regenerate with `node src/build-proto.mjs`. |
| `frames/` | Key frames (Night, Day, echo, relight at 300 of 600ms) at 1600×1000. |

## The story (Night)

The screen is dark. A clear glass pyramid waits, barely there. A hairline of white light crosses from the left
edge and strikes its left face. The glass flares, light pools inside, and seven spectral rays fan out of the
exit face with a soft haze, labeled `FIRST LIGHT · λ 380–700 NM`. Then the prism lifts off. Still carrying its
spectrum, it flies into the top bar and becomes the brand mark. As the rays sweep across the app, the app
lights up. The rail's spectral index comes on one tick at a time, each in its gallery's hue, and the tiles
refract into place: a red/blue chromatic split converges onto each card, with a fringe glint across its top edge.

**Day** has its own art direction rather than inverting Night: the ground is pearl, the beam is the Day ink-light
(`--rf-beam-core`), the impact is pearl light with an iridescent halo, and the spectrum is laid down in
`multiply` with the Day vivid stops.

## Timeline — full play (ms after the first frame; ≤ 1600)

| Layer | Timing | Notes |
|---|---|---|
| Veil (theme `--bg`) | opaque 0–880, fades 880→1120 | backstop for anything not tagged |
| Measurement grid | in 0→300, out 860→1080 | 34px grid, radial mask on the prism |
| Prism (hero copy) | ghost .11 by 410 · **flare 410→500** (brightness 2.1, Day saturate 1.8) · glow 1.55–1.7 · out 1180→1300 | phase-locked to the real mark so the front edge glints at impact |
| Beam | draws 60→430 `cubic-bezier(.55,0,.2,1)` · out 860→980 | 1px core + 9px bloom; the travelling head spark bursts at 430→520 |
| Impact flash / inner light | 420→500 up · flash out by 820 · inner light .8–.9 through the flight | |
| Internal ray | 430→520 | the refracted path inside the glass |
| Spectrum rays ×7 | 450 + 16·i, 470ms out-expo (open by ~1016) | rotate apart from one line, −7°…+26° (`fan`). **Physically true**: violet bends most, so it leaves at the **bottom** (+26°), rose at the top (−7°); the haze wedge runs rose → violet top to bottom |
| Haze | 470→990 | conic wedge of the 7 stops, radial falloff |
| Label | in 560→760 · out 860→980 | mono, wide-tracked |
| **Flight** | 860→1240 `cubic-bezier(.72,0,.18,1)` | prism translates and scales into the top-bar mark |
| Fan sweep | rides the exit face 860→1240, turns +30°, scales to .72, opacity →.38 · gone by 1400 | the spectrum crossing the app *is* the paint |
| Real top-bar mark | 1180→1300 fade-in | continues turning with the same phase |
| Surfaces (top bar, rail) | 880→1200 | opacity |
| Text (page header) | 940 + 28·i, 520ms | rises out of a 6px blur |
| Spectral index | 960 + 28·i (cascade cap 12 → last at 1268), 320ms each, ends 1588 | each item gets a hue tick spark (`--rf-hue-v`) at its index tick, 330ms |
| Tiles | by distance from the mark: 1000 + 24·i (cap 12 → 1264), 336ms each, **ends 1600** | translateY 10→0, scale .985→1, blur 5→0; ghost frames + fringe glint on the first 12 |

Tokens used: `--rf-beam-core --rf-grid-line --rf-split-a/-b --rf-fringe --rf-s-*-v --rf-hue-v --rf-mono --bg`;
stagger 28ms with a cascade cap of 12 (tokens › motion › stagger); out-expo `cubic-bezier(.16,1,.3,1)`.

## Hero mode (the website landing) — one continuous shot

`play({ hero: { mark, reveal, entry, exit, fan } })` lands the scene in a hero prism that is already on the page instead of
the top-bar mark. 0–860 is unchanged (the beam travels 60→430, ≥ 250ms). In the flight (860→1240) the prism and its fan
FLIP onto the hero prism and its fan pivot (`entry`/`exit` = where the hero beam ends and its fan pivots, fractions of
`reveal`), the rays already at the hero's angles (`fan`), the prism copy turning in phase with the hero and settling to
its brightness. The beam's tail leaves the copy column in 120ms (out-expo) while its head rides the prism, so no light
crosses the headline as the veil lifts. Hand-off 1160→1320: the copy, fan and beam go as `reveal` comes up (one
prism on screen at every instant). The top-bar mark just fades up with the chrome. Without a visible hero it falls back
to the mark dock. The website tags the art `<figure data-fl="hero" data-fl-hero="entryX entryY exitX exitY fanTop fanBottom">`.

## Steady start

On a busy cold load the first few hundred ms of frames can be dropped, and the beam would be over before it was seen
(the judges measured ~100ms on the landing). `play()` holds every animation on its first frame (targets dark, input never
blocked) until two consecutive frames land < 34ms apart, at most 450ms; `controller.begun` resolves when it starts.

## Echo (later loads in the session) — ≤ 300ms

The mark catches the light (a white spark, 0–280), and a hairline flicks along the top bar's bottom edge (0–300).
The surfaces fade in (0–120). The index (30 + 10·i, 160ms) and the text/tiles (40 + 10·i, 150ms, translateY 4px)
cascade in, with the cascade capped at 12.

## Reduced motion

`decide()` returns `'fade'`: the targets go 0→1 opacity over 120ms, with no overlay, translation, blur, beam or
garnish. The relight becomes a 120ms View Transition cross-fade, or an instant 120ms dissolve without View
Transitions.

## API

```js
const c = PrismFirstLight.play({
  mode: 'auto',                       // full once per session (sessionStorage 'prismFirstLight'), then echo; fade under reduced motion
  mark: '[data-fl="mark"]',           // wrapper of the top-bar .prism-mark: the docking target
  surfaces: '[data-fl="surface"]',    // top bar, rail
  index: '[data-fl="index"]',         // rail items; hue read from --rf-hue-v (set by data-rf-gallery), then --hue, then data-hue
  tick: '[data-fl-tick],.rf-index,.ix',  // the index tick inside an item (where the hue spark lands)
  text: '[data-fl="text"]',           // page header / headings
  tiles: '[data-fl="tile"]',          // selector | Element[] | () => Element[] | Promise<Element[]> (iframe elements OK)
  paintTargets: [{ targets: '.chips', effect: 'fade' }],   // extra groups: surface | index | text | refract | fade
  theme: undefined,                   // 'night' | 'day'; default from data-rf-mode / data-theme / bg luminance
  onStart(info) {}, onDone({ mode, skipped, ms }) {},
  freezeAt: undefined,                // ms: pause everything there (key frames, QA)
});
c.finished.then(info => …);  c.skip();      // or PrismFirstLight.skip()
PrismFirstLight.decide(opts)  // → 'full' | 'echo' | 'fade' | 'none'
PrismFirstLight.relight(applyFn, originEl, { duration: 600, direction: 'auto' | 'ltr' | 'rtl', viewTransition: true | false | 'auto' })  // → Promise (duration capped at 600)
```

Any `pointerdown`, `keydown`, `wheel`, `touchstart` or `scroll` skips the play. Listeners are passive and never
call `preventDefault`, so the event still reaches the app. A skip fast-forwards every animation 12× and fades
the overlay in 160ms; measured, the screen settles about 130ms after the key.

## Integration — Prism.html (shell engineer)

1. **CSS**: inline `brand/prism-mark.css` and `first-light/first-light.css` into `shell-style`, after the theme block.
2. **JS**: inline `first-light.js` anywhere before the boot code; it only defines `window.PrismFirstLight`.
3. **Arm before first paint**: put this in `<head>`, before any stylesheet, so tagged elements start dark instead of flashing.
   ```html
   <script>try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('pfl-armed')}catch(e){}</script>
   ```
   A CSS-only failsafe re-shows everything after 2.2s if the script never runs.
4. **Tag the chrome**:
   - top bar and rail: `data-fl="surface"`
   - each rail link: `data-fl="index"` plus `data-rf-gallery="<id>"` (prism.css hue setter), with its tick as `.rf-index` or `[data-fl-tick]`
   - brand mark wrapper: `data-fl="mark"` containing the `.prism-mark` markup
   - page header: `data-fl="text"`
5. **Boot**: call `play()` as soon as the shell DOM exists, without waiting for the gallery. Tiles live in `#gv`, so pass a promise; late tiles join the running timeline, or get a 220ms rise if they arrive after ~1380ms.
   ```js
   var tiles = new Promise(function (res) { gv.addEventListener('load', function () {
     res(gv.contentDocument.querySelectorAll('.tile')); }, { once: true }); });
   if (document.hidden) document.addEventListener('visibilitychange', function go() {
     if (!document.hidden) { document.removeEventListener('visibilitychange', go); PrismFirstLight.play({ tiles: tiles }); } });
   else PrismFirstLight.play({ tiles: tiles });
   ```
6. **Theme switch**: `PrismFirstLight.relight(function () { applyTheme(next); stampMode(); }, toggleButton)`. `applyFn` runs inside the View Transition update callback and may return a promise. The sweep is **600ms** (`cubic-bezier(.65,0,.35,1)`) and the light **starts at the toggle** (the one pressed; with no origin — keyboard, palette, OS change — the page's own `[data-theme-set]` / `.rf-mode` / `[data-relight-origin]`) and travels away from it, so a top-right toggle sweeps right→left on the website and in the library alike. The new theme is revealed from the toggle's x (`--pfl-rl-x`) behind a colour-split leading edge (red fringe | white core | blue fringe), painted once into the beam's own snapshot and only translated. Both are deliberate departures from the tokens' 900ms left→right, logged in `design/CHANGELOG.md`. It overrides the CSS-only `rf-relight-beam` recipe in `prism.css` while it runs, so use one or the other.
   **Which path** (`viewTransition`): `true` or omitted (the default, the library) = the View Transition sweep where the browser has one; `false` = the fallback (a 240ms dissolve from the old ground with the beam passing over); `'auto'` (the website) = the View Transition only on a capable device — `navigator.hardwareConcurrency >= 8`, `navigator.deviceMemory >= 8` when the browser reports it, no `prefers-reduced-motion`, no Save-Data — else the fallback. The transition's two whole-page snapshots and the re-raster when it ends are cheap on a GPU but, on a slow or software-rastered device, delay the frames of the next interactions by up to ~1 s (website, 4× CPU headless: clicks after a switch 0.9–1.8 s with the transition, ≤ 160 ms with the fallback). The website's QA flags `?vt=1` / `?vt=0` force either path.
7. **Retire** the old `#veil` loader and the "Prism has a new look" reveal; First Light replaces both.

## Performance

- `play()` setup costs 9.6–19ms (5 runs, headless, 1600×1000). One layout-read pass covers every target, then about 145 WAAPI animations of transform, opacity or filter only. No canvas.
- No long tasks during the play (PerformanceObserver `longtask`, first load). The overlay is `pointer-events:none; contain:strict` and is removed at the end, and every animation is cancelled so targets return to their own styles with no residue.
- Off-screen targets are skipped. Ghost frames and glints go on the first 12 tiles only. Hit-testing during the play reaches the app (verified with `elementFromPoint` on a tile).
- Wall time from the `play()` call is about 1.69s on a cold page load: 1.6s of choreography plus first-frame latency.

## Known limits

- **Relight blocks input during the sweep.** Chromium hit-tests `<html>` while a View Transition runs; `pointer-events:none` on `::view-transition` is not honored. Two mitigations: the sweep is capped at 600ms, and any input calls `skipTransition()`, which ends the sweep immediately. Only the click that ends it is lost; the next one lands normally.
- Engines without View Transitions use the fallback: a 240ms dissolve from the old ground, with the beam passing over in about 420ms.
- Requires `color-mix()` (Chrome 111+, Safari 16.2+, Firefox 113+) and WAAPI `getAnimations`/`updatePlaybackRate`; older engines degrade to plain fades.
