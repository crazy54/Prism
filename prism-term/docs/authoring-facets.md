# Authoring terminal facets

A **facet** is one entry in Prism's terminal catalog: a scene, widget, spinner, progress meter, chart, piece of text art, TUI control, diagram or ops view, drawn with the prism-term engine. Facets are browsable in the terminal (`prism-term`), on the web catalog (rendered live in the browser), on the curl-able terminal site, and by AI agents through the terminal JSON island.

## Where they live

```
prism-term/src/facets/
  galleries.js          the taxonomy: 17 galleries and their categories (source of truth)
  schema.js             the contract + validator
  index.js              the registry (allFacets, findFacet, catalogTree, searchFacets)
  manifest.js           GENERATED static list of modules — `npm run facets:manifest`
  <gallery>/<name>.js   facet modules; files starting with "_" are gallery-private helpers
```

A module default-exports **one facet or an array of facets**. A single-facet module's id defaults to its file name; in an array every facet sets `id`.

## The contract

```js
// src/facets/progress/odometer.js
import { ATTR } from '../../buffer.js';

export default {
  id: 'progress-odometer',          // unique, kebab-case
  title: 'Rolling Odometer',
  gallery: 'progress',              // must match the folder
  category: 'Counters & Odometers', // must be one of the gallery's categories (galleries.js)
  description: 'Digits roll over like a mechanical counter, with eased motion-blur between values.', // 20–180 chars
  tags: ['counter', 'odometer', 'digits'],
  kind: 'progress',                 // scene | widget | spinner | progress | text | chart | tui | diagram | art
  size: { w: 40, h: 5 },            // preferred cells — tiles, snapshots and the curl site use it
  minSize: { w: 24, h: 3 },         // smallest it still reads at
  animated: true,                   // false → rendered once at t = 0
  loop: 6,                          // seconds per cycle (recordings/thumbnails)
  glyphs: 'unicode',                // minimum: ascii | unicode | braille | sextant
  color: '256',                     // minimum depth to look right: mono | 16 | 256 | truecolor
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },   // --set speed=2
  setup(ctx) {
    const speed = ctx.param('speed', 1);
    return (t) => { /* draw everything into ctx.buffer */ };
  },
};
```

`setup(ctx)` runs once per size/theme/mode; the returned `frame(t, dt)` draws the whole picture each frame. The runner clears `ctx.buffer` to `ctx.bg` first. `ctx` gives you: `width`, `height`, `buffer` (a Surface — may be a clipped View), `theme` (packed colors: bg, panel, panel2, line, ink, muted, dim, accent, info, pos, warn, neg, crit), `caps`, `canvas(kind, opts)`, `palette(name)`, `param(key, default)`, `rng` (seeded), `noise`, `seed`.

## Rules (the conformance test enforces most of them)

1. **Browser-safe.** Import only engine modules that run anywhere: `color`, `canvas`, `buffer`, `palettes`, `easing`, `noise`, `math3d`, `width`, `widgets/*`, `text/*`, `spinners`. Never `node:*`, `process`, `fs`, timers, `Date.now()` or `Math.random()`.
2. **Deterministic.** Everything derives from `t`, `ctx.rng` and `ctx.noise`. Same seed → same frames.
3. **Draw through the Surface API** — `set`, `get`, `text`, `fill`, `clear`, `view`, `Canvas.paint`. Never touch `buffer.ch/fg/bg/at` arrays; the buffer may be a View inside a bigger screen, and nothing may land outside it.
4. **Any size.** Render sensibly from `minSize` up to 160×48; lay out from `ctx.width/height`, never hard-coded positions. Degrade (drop labels, fewer rows) instead of overflowing.
5. **Every mode.** Canvas-based facets must read in braille, sextant, quad, half and ascii (`--mode`). If `glyphs: 'ascii'`, the facet must emit only printable 7-bit ASCII when caps.unicode is false.
6. **Theme-aware.** Use `ctx.theme` tokens (and `ctx.palette()`) for color so `--theme` reskins it. The default palette, `prism`, is Refraction's spectrum and already picks the right tier for Night or Day. Light themes must stay legible: light on glass reads at a whisper, ink on paper doesn't — fade trails with `fadeMark(theme, color, k)` instead of `mix(theme.bg, color, k)`, run pale art colors through `legible(theme, color, 3)` when they become ink, and shade toward `theme.line` rather than black by Day (`shade()` in `retro/_kit.js`). Night-sky subjects (galaxies, fireworks, starfields) may keep their own dark sky by Day; say so in a comment. Check both `--theme prism-dark` and `--theme prism-light` contact sheets.
7. **Budget.** ≤ 8 ms per frame at 160×48 is the target; the test fails above 25 ms.
8. **Honest data.** Sample numbers, hostnames and log lines are fictional and plausible; use `.example` domains and RFC 5737/1918 addresses.
9. **ids are global.** In widget-style galleries (`loaders`, `progress`, `charts`, `ai`, `status`, `ops`, `diagrams`, `callouts`, `input`, `maps`, `lab`, `ascii`) prefix ids with the gallery (`progress-odometer`, `ops-htop`). Art galleries (`fx`, `objects`, `sim`, `retro`, `text`) may use bare names. The registry reports duplicates.
10. **Quality bar.** It should look like something a demoscene veteran or a seasoned SRE would be proud to ship: crisp alignment, intentional color, smooth motion, no flicker, no placeholder text. If it isn't great, it doesn't go in.

## Verify

```bash
cd prism-term
npm run facets:manifest                                     # after adding/removing a module
node --test --test-name-pattern="facet progress/" test/facets.test.js   # conformance for one gallery
node scripts/shoot.mjs --gallery progress --sheet --t 2 --out <dir>      # contact sheet PNG — LOOK at it
node scripts/shoot.mjs --gallery progress --sheet --t 2 --theme prism-light --out <dir>   # the same sheet by Day
node scripts/shoot.mjs --ids progress-odometer --t 0.5,2,4 --mode braille --out <dir>
node cli.js play progress-odometer                          # in a real terminal
```

Screenshots render through Chrome's fonts; braille/sextant glyphs can show faint hairlines that real terminals don't.

### Day and Night in a real terminal

Check every facet in both modes before you ship it (rule 6):

- **`d`** flips Day ↔ Night while the facet plays, in the player and in the catalog browser. Inside another theme family it flips that family's dark and light members. **`t`** cycles every theme.
- **`--day`** / **`--night`** start in one mode: `node cli.js play progress-odometer --day`.
- **`PRISM_TERM_THEME=day`** (or `night`, `auto`, or any theme id) pins the theme for every command, snapshots included: `PRISM_TERM_THEME=day node cli.js snapshot progress-odometer`. Without it, interactive runs follow the terminal's background.
- **`--no-intro`** (or `PRISM_TERM_INTRO=0`) skips First Light when you open the browser over and over.
- **`PRISM_REDUCED_MOTION=1`** (or `--reduced-motion`) turns off the intro, the player's wipes and the relight sweep. Your facet still animates, so it must read well without any of them.
- **`prism-term theme <format>`** gives your terminal emulator the Prism Night / Day colors (`--day` for Day), so the terminal around the facet matches it too.
