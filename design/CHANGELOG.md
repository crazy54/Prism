# Refraction — token changelog

Every token change after first publication is logged here with old → new values.
Source of truth: `design/tokens.json`. The theme strings in `design/themes.js` and the
blocks in `design/prism.css` are regenerated from it — if you pasted the strings into
`shell-script.html`, re-paste them after any entry below.

## 1.3.0 — 2026-10-16 — one λ per gallery across surfaces; section type tier (judges' fix J1 §G)

**One λ per gallery.** The terminal catalog used to take its own even steps (t = (order − 1)/16 over its nav
order), so the same gallery had two identities: Charts was λ 436 on the web but λ 505 in `/tty`. Now a terminal
gallery with a web counterpart (same id, or `status` → `notify`, `diagrams` → `arch`) takes that web gallery's
exact hue and λ; the six terminal-only galleries take half-steps of the web ramp, t = (k + ½)/17, spread evenly in
terminal nav order — stops no web gallery uses. `gen.mjs` now fails if two gallery identities share a λ label.
The terminal sidebar is no longer a monotone ramp (identity wins over order). Web galleries, app pages and
surfaces are unchanged. `galleries256` (xterm-256 ink/vivid per terminal gallery) is re-picked from the new colors
by the same designed-index rule (1.2.2); `contrast.mjs`: 1061/1061 pass.

| Terminal gallery | old h° / λ | new h° / λ | Night vivid | Day ink | from |
|---|---|---|---|---|---|
| `fx` | 296 / λ 436 | 279.1 / λ 467 | `#9299f3` | `#5b5cbe` | web `fx` |
| `objects` | 278 / λ 467 | 228.2 / λ 483 | `#2cb3e4` | `#007093` | web `objects` |
| `sim` | 260 / λ 475 | 270.6 / λ 471 | `#859ef4` | `#4a60bf` | half-step t = 1.5/17 |
| `retro` | 242 / λ 480 | 219.8 / λ 485 | `#0ab7dd` | `#00718a` | half-step t = 4.5/17 |
| `text` | 224 / λ 484 | 194.4 / λ 492 | `#00c2c1` | `#007474` | web `text` |
| `loaders` | 206 / λ 488 | 168.9 / λ 506 | `#48cda4` | `#00765a` | half-step t = 7.5/17 |
| `progress` | 188 / λ 494 | 135.1 / λ 558 | `#9dd57e` | `#3b7500` | half-step t = 9.5/17 |
| `charts` | 170 / λ 505 | 296 / λ 436 | `#ab91eb` | `#7555b8` | web `charts` |
| `ai` | 152 / λ 538 | 245.2 / λ 479 | `#55abef` | `#006cad` | web `ai` |
| `status` | 134 / λ 558 | 143.5 / λ 550 | `#89d487` | `#1a781f` | web `notify` |
| `ops` | 116 / λ 568 | 84.2 / λ 578 | `#edbe59` | `#856200` | half-step t = 12.5/17 |
| `diagrams` | 98 / λ 574 | 126.6 / λ 563 | `#afd575` | `#527100` | web `arch` |
| `callouts` | 80 / λ 580 | 109.6 / λ 570 | `#ced065` | `#6c6b00` | web `callouts` |
| `input` | 62 / λ 585 | 211.3 / λ 487 | `#00bbd3` | `#007282` | web `input` |
| `maps` | 44 / λ 592 | 160.5 / λ 519 | `#5fd09a` | `#00774e` | web `maps` |
| `lab` | 26 / λ 604 | 262.1 / λ 474 | `#76a2f4` | `#3664be` | web `lab` |
| `ascii` | 8 / λ 494c | 33.4 / λ 597 | `#f68f78` | `#b2432c` | half-step t = 15.5/17 |

**Hero tier.** New `type.scale.hero` → `--rf-fs-hero: clamp(46px, 5vw + 16px, 112px)`, `--rf-lh-hero: 1.02`,
`--rf-ls-hero: -0.058em`, weight 700: the fluid landing display (~88px at 1440, 112px from 1920; `display` 66 stays the
fixed First Light / app title).

**Section tier.** New `type.scale.section` → `--rf-fs-section: clamp(40px, 1.25vw + 24px, 48px)`,
`--rf-lh-section: 1.08`, `--rf-ls-section: -0.045em`, weight 700 (between h1 44 and h2 32): website section h2s and
library page headers on large screens — 40px at ≤ 1280, 48px from 1920. The token carries `size` 48 / `min` 40 /
`fluid` (the clamp is what prism.css and the theme strings emit). Existing `--rf-fs-*` values are unchanged.

Consumers re-synced: prism-term `npm run sync-themes` (`TERMINAL_GALLERIES`, read by `src/refraction.js`), prism-deck
`npm run sync-tokens`, `website/scripts/sync-refraction.mjs` (positions.mjs / positions.css), the App Shell build
and the terminal island in Prism.html (`tools/term-island-sync.mjs --write`).

**Physically true spectrum + First Light 1.1.0** (not tokens; same fix wave). Every prism fan now bends violet most:
violet leaves at the **bottom** of the fan, rose at the top (First Light rays and haze, the website hero art and its Day
wavelength screen 700 → 400 top to bottom, the brand sheet, deck `span-power-on`, the new terminal `refraction` facet).
First Light gains hero mode (the landing's intro prism FLIPs into the hero prism: one continuous shot, plays in place
on one-column layouts), a steady start (the timeline waits for steady frames, ≤ 450ms, so the beam is seen travelling)
and a relight that starts at the toggle and travels away from it on the site and in the library alike, behind a
colour-split leading edge. See `first-light/SPEC.md`.

## 1.2.2 — 2026-10-15 — terminal 256 colors keep AA (design review #3)

At 256 colors the terminal used the plain nearest xterm index for everything, and by Day that
lands too light for 8 of 17 gallery inks and 5 spectrum inks (30 `#008787` = 4.09:1 on the Day
terminal). Text and marks now take a **designed index**: the nearest one that clears 4.5:1 (marks 3:1)
on every 256-color surface, keeping the hue (`tools/color.mjs` `pick256`). Colors that already passed
are unchanged; all of Night is unchanged except ANSI 8. Ratios below: on the Day terminal bg `#f8f7fb` / worst over
`surfaces256` (Day bg quantizes to 255 `#eeeeee`).

| Day | old (nearest) | new (designed) |
|---|---|---|
| `galleries256.loaders.ink`, `progress` | 30 `#008787` 4.09 / 3.76 | 23 `#005f5f` 7.03 / 6.46 |
| `galleries256.charts.ink` | 29 `#00875f` 4.25 / 3.91 | 23 `#005f5f` 7.03 / 6.46 |
| `galleries256.ai.ink` | 29 `#00875f` 4.25 / 3.91 | 22 `#005f00` 7.47 / 6.86 |
| `galleries256.status.ink` | 28 `#008700` 4.41 / 4.05 | 22 `#005f00` 7.47 / 6.86 |
| `galleries256.maps.ink` | 130 `#af5f00` 4.41 / 4.06 | 124 `#af0000` 6.97 / 6.41 |
| `galleries256.lab.ink` | 131 `#af5f5f` 4.26 / 3.91 | 124 `#af0000` 6.97 / 6.41 |
| `galleries256.ascii.ink` | 131 `#af5f5f` 4.26 / 3.91 | 125 `#af005f` 6.59 / 6.06 |
| `spectrum256` cyan / mint | 30 / 29 (4.09 / 4.25) | 23 `#005f5f` 7.03 / 6.46 |
| `spectrum256` jade | 28 `#008700` 4.41 / 4.05 | 22 `#005f00` 7.47 / 6.86 |
| `spectrum256` coral / rose | 131 `#af5f5f` 4.26 / 3.91 | 124 `#af0000` / 125 `#af005f` ≥ 6.06 |
| `tokens256.accent2` (new key) | 62 `#5f5fd7` 4.80 / 4.41 | 61 `#5f5faf` 5.26 / 4.84 |

- Gallery vivid ticks (3:1), Day: fx 104 → 98, objects 105 → 68, charts 36 → 29, ai 35 → 28, diagrams 136 → 100,
  callouts 136 → 130 (worst 2.42–2.88 → 3.05–4.06).
- `ansi16[].xterm256`, Day: 2 29 → 22, 9 161 → 160, 10 28 → 22, 13 134 → 91, 14 30 → 23, 15 245 → 102 (3:1 slot);
  Night: 8 243 → 102 (3.75 → 4.74 on panel2 `#1c1c1c`).
- New per mode: `galleries256` ({ink, vivid} per `galleries.terminal` id), `surfaces256`, `roles` (the 16-color
  [text, fill] slot of each token, same values prism-term already used), `tokens256` gains `panel2`, `card`, `accent2`;
  `spectrum256[]` entries gain `contrast`. `terminal.note` and `guidance.x256` describe the rule.
- prism-term: `scripts/sync-themes.mjs` bakes these into `src/themes.js` (`ansi256`, `SPECTRUM[].night256/day256`,
  new `TERMINAL_GALLERIES`); `src/palettes.js` pins them (`color.js` `pin256`); `src/refraction.js` reads its gallery
  hues from `TERMINAL_GALLERIES` instead of a hand copy.
- Contrast: 517 → 1,061 checks, all pass. New groups: Terminal 256 (text tokens, spectrum + gallery ink, ANSI text slots
  on every 256-color surface), Terminal 256 tick (gallery vivid), Terminal 16 (text tokens + spectrum hues through their slot).

## 1.2.1 — 2026-10-15 — theme relight follows the Brand motion note

- `--rf-dur-sweep` (`motion.duration.sweep`): `900ms → 600ms`, both themes — now a ceiling. It also times `.rf-beam.is-sweep`.
- `motion.patterns.theme-relight`: "left→right, 900ms" → "away from the toggle that was pressed (origin right of centre →
  right-to-left; no origin → left-to-right), 600ms, any input ends it; implemented by `PrismFirstLight.relight(applyFn, originEl)`".
  `motion.patterns.beam-sweep`: 900ms → 600ms.
- prism.css recipe: new `rf-relight-rtl` / `rf-relight-beam-rtl` keyframes, selected by `html.rf-rtl`. Added
  `.rf-relighting::view-transition{pointer-events:none}`. The recipe comment and README §10 code now compute direction
  from the origin element and call `vt.skipTransition()` on pointerdown / keydown / wheel / touchstart. All `.9s` fallbacks → `.6s`.
- Specimen: the Night/Day toggle and the "Theme relight" demo pass their button as origin (the top-right toggle sweeps
  right → left), and any input ends the sweep. Button labels now read 600ms.
- Contrast: 517 / 517 checks pass (unchanged).

## 1.2.0 — 2026-10-15 — Inter 700, terminal hues, build in the repo

Type (Inter 700 is now bundled: `design/fonts/inter-700-latin.woff2`, next to 400/600):
- Display (`--rf-fs-display`, 66) and h1 (44) at weight 700 now **render at 700** (they rendered at the 600 face before).
  Token values unchanged (`--rf-fw-display: 700`).
- `--head-w`: `650 → 600` (both themes). `type.scale.h2.weight`: `650 → 600`. New `type.weight.heading: 600`.
  Reason: with three static faces, 650 is not a weight — it rendered as 600 before and would snap to 700 now.
  Pinning to 600 keeps headings looking exactly as they did. Rule: use only 400 / 600 / 700.
- `type.family.note` / `type.weight.note` rewritten; new `type.family.files` lists the three woff2 files.
  The specimen now inlines all three faces from `design/fonts/` (it used to read 400/600 out of shell-style).

Terminal gallery hues (`galleries.terminal`) — the web rule applied to the terminal catalog's own nav order
(`prism-term/src/facets/galleries.js`, t = (order − 1) / 16), so the terminal index reads as one spectrum.
The nav order is unchanged. Shared ids no longer copy their web hue; each entry keeps `web` / `webH` as a pointer.
Each entry now has full `night` / `day` ink, vivid and rgb values plus `lambda` (the `sameAs` / `proposed` fields are gone).

| # | id | old (h, λ) | new (h, λ) | new ink Night / Day |
|---|---|---|---|---|
| 01 | `fx` | 279.1° λ 467 (= web fx) | 296° λ 436 | `#c2aef8` / `#7555b8` |
| 02 | `objects` | 228.2° λ 483 (= web objects) | 278° λ 467 | `#acb6ff` / `#595dbf` |
| 03 | `sim` | 286° λ 460 (proposed) | 260° λ 475 | `#95bdff` / `#3065be` |
| 04 | `retro` | 70° λ 583 (proposed) | 242° λ 480 | `#7dc5fa` / `#006da6` |
| 05 | `text` | 194.4° λ 492 (= web text) | 224° λ 484 | `#69ccef` / `#00708e` |
| 06 | `loaders` | 250° λ 478 (proposed) | 206° λ 488 | `#5ed1df` / `#00737d` |
| 07 | `progress` | 222° λ 484 (proposed) | 188° λ 494 | `#63d5cc` / `#00746e` |
| 08 | `charts` | 296° λ 436 (= web charts) | 170° λ 505 | `#76d8b8` / `#00765c` |
| 09 | `ai` | 245.2° λ 479 (= web ai) | 152° λ 538 | `#90d9a4` / `#00783b` |
| 10 | `status` | 143.5° λ 550 (= web notify) | 134° λ 558 | `#add892` / `#3e7500` |
| 11 | `ops` | 160° λ 519 (proposed) | 116° λ 568 | `#c8d483` / `#636d00` |
| 12 | `diagrams` | 126.6° λ 563 (= web arch) | 98° λ 574 | `#decd7b` / `#786700` |
| 13 | `callouts` | 109.6° λ 570 (= web callouts) | 80° λ 580 | `#efc479` / `#896000` |
| 14 | `input` | 211.3° λ 487 (= web input) | 62° λ 585 | `#fab980` / `#9a5700` |
| 15 | `maps` | 160.5° λ 519 (= web maps) | 44° λ 592 | `#feaf8c` / `#af470a` |
| 16 | `lab` | 262.1° λ 474 (= web lab) | 26° λ 604 | `#fea79e` / `#b3413c` |
| 17 | `ascii` | 205° λ 488 (proposed) | 8° λ 494c | `#faa2b2` / `#b13f5d` |

`galleries.rule` now reads "Per surface: …". Web gallery, app page and surface positions are unchanged.

Build (not tokens): the generators now live in `design/tools/` (`gen.mjs`, `contrast.mjs`, `readme.mjs`, `color.mjs`;
inputs in `design/tools/src/`), use repo-relative paths, and have `--check` modes (exit 1 when stale). Apart from the
values above and the generated-file header comments, the repo build reproduces the 1.1.0 outputs exactly. Contrast: 517 / 517 checks pass (unchanged).

## 1.1.0 — 2026-10-15 — specimen pass (additive, two Day values changed)

Added (both themes; nothing removed or renamed):
- `--rf-s-<stop>-rgb` for all 12 stops (vivid tier as an `r,g,b` triplet, for `rgba()` glows/washes).
  Night violet `171,145,235` … rose `236,131,152`; Day violet `152,118,227` … rose `222,95,125`.
- `--rf-raised` — the fill of a raised (level 2) surface. Night `#171a25` (= `--panel2`), Day `#ffffff`.
  Reason: in Day `--panel2` is a *recessed* well (darker than paper), so "raised = panel2" was wrong in Day.
  `.rf-surface.is-raised` now reads `--rf-raised`.
- `--rf-rail` — sidebar/rail surface. Night `transparent` (glass on ink), Day `#fcfbfe` (a paper sheet on the pearl canvas).
- tokens.json: `spectrum.stops[].day.sheen` — a decorative Day tier (L 0.74–0.81, C 0.13) for gradients only.

Changed (Day only):
- `--rf-spectrum` / `--rf-spectrum-v` (Day) now use the sheen tier instead of the vivid tier — the vivid
  ramp went olive/brown through lime–amber and read muddy as a gradient. Marks and ticks still use vivid (3:1).
  - old: `linear-gradient(90deg,#9876e3,#6783ec,#0090de,#0096b3,#009995,#009c71,#4c9b32,#8a8f00,#ac8300,#cc7300,#de6448,#de5f7d)`
  - new: `linear-gradient(90deg,#b299f3,#8ba6fd,#5ab3f7,#19bfe2,#00c8c3,#53cea0,#8fcf7d,#c1c95f,#e5ba53,#f7a65f,#fb947c,#f48a9f)`
- `--rf-white` (Day, the white-light index paint) — stronger iridescence so the tick is visible on paper.
  - old: `conic-gradient(from 200deg,#f3c8dc,#cfc4f6,#bcd8f6,#c5ecdc,#f1e2bd,#f3c8dc)`
  - new: `conic-gradient(from 200deg,#de8fb8,#a993ec,#7fb0ea,#79cdb0,#dcbc6c,#de8fb8)`

Primitives (prism.css, not tokens):
- `:where()` → `:is()` throughout — zero-specificity rules lost to element resets such as
  `button{font:inherit;color:inherit}` (primary buttons rendered white-on-violet). Primitives now have plain class
  specificity; one class in the shell still overrides them.
- `.rf-nocase` utility and `.rf-lambda{text-transform:none}` — uppercase eyebrows turned `λ` into `Λ`.
- `.rf-index.is-white` rests at 55% opacity, 100% when active.
- Ruler line 1px → 2px, opacity .55 → .85; `.rf-palette-input>span` → `>span:first-child` (the esc kbd no longer stretches).

Contrast after the change: 517 / 517 checks pass (unchanged).

## 1.0.0 — 2026-10-15 — first publication

- Published `tokens.json`, `themes.js` (`PRISM_DARK_CSS`, `PRISM_LIGHT_CSS`) and `prism.css`; `TOKENS-READY` written.
- Contract tokens: Night keeps the website values `--bg #0a0c12`, `--panel #10131c`, `--line #252834`,
  `--ink #f0f0f5`, `--accent #b8a2f2`, `--pos #8bd8ba` (website green); Day keeps `--bg #f6f5f9`,
  `--panel #ffffff`, `--line #dedce9`, `--ink #20202e`, `--accent #7353bb`.
- Tuned against the website for hierarchy + AA: Night `--muted #999ba9 → #a2a4b4`, `--dim #858797 → #8a8c9d`;
  Day `--muted #626274 → #55556a`, `--dim #68687a → #68687c`, `--pos #236c52 → #1f6b4f`.

## Motion note — theme relight (Brand, Icons & Motion; agreed with the team lead)

- `motion.patterns.theme-relight`: **900ms → 600ms**, and the direction changes from left→right to **away from the toggle that was pressed** (`PrismFirstLight.relight(applyFn, originEl)`; left→right only when there is no origin). Reason: Chromium routes all input to `<html>` during a View Transition, so a shorter sweep shrinks the lost-click window; any input also ends the sweep at once. Implemented in `design/first-light/`. The `rf-relight` recipe and `--rf-dur-sweep` in `prism.css` / `tokens.json` still say 900ms left→right; Lead Designer to follow. **Done in 1.2.1.**
