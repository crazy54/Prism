# Prism · Refraction

> **White light in. Every color out.**
> The design language for Prism: Web facets (Prism.html), Terminal facets (prism-term) and Stream Deck facets (prism-deck). Two modes, separately art-directed: **Prism Night** (`prism-dark`) and **Prism Day** (`prism-light`).

Open **[specimen.html](specimen.html)** — the living style guide (offline, zero dependencies, Night/Day toggle, `?mode=day`). Every engineer matches it.

| File | What it is | Edit? |
|---|---|---|
| `tokens.json` | **Source of truth.** Colors (hex + OKLCH), spectrum tiers, gallery hues + λ, type, radius, space, motion, elevation, terminal palette, Stream Deck grammar | Lead Designer; log every change in `CHANGELOG.md` |
| `themes.js` | `PRISM_DARK_CSS`, `PRISM_LIGHT_CSS` — the registry theme strings, generated | Never by hand — regenerate |
| `prism.css` | The same two themes for standalone use, the hue setters, and the `.rf-*` reference primitives | Theme blocks generated; primitives hand-authored |
| `specimen.html` | The specimen, generated from a source template with prism.css + Inter inlined | Regenerate |
| `CHANGELOG.md` | Every token change after publication, old → new | Append |
| `TOKENS-READY` | Readiness signal + one-paragraph summary | — |
| `tools/` | The build: `gen.mjs` (author + emit + `--check`), `contrast.mjs` (1,061 WCAG checks incl. terminal 256/16, `--check`), `readme.mjs`, `color.mjs`; inputs in `tools/src/` (`primitives.css`, `specimen.src.html`) | Lead Designer |
| `fonts/` | `inter-400/600/700-latin.woff2` — the three bundled Inter faces (Prism.html, website, specimen) | — |
| `first-light/`, `icons/`, `brand/` | First Light load sequence, the hairline icon family, the mark — **owned by the Brand designer**, referenced here, not duplicated | Brand designer |

Version: <!-- gen:version -->1.3.0<!-- /gen:version -->

---

## 1. Principles

1. **Light is the material.** Night is deep ink-navy glass lit from inside. Day is pearl paper that *reflects* light with an iridescent sheen — its own art direction (cast shadows, a printed optics diagram, a rainbow caustic), never an inversion of Night.
2. **The spectrum is the accent system — used deliberately.** One OKLCH ramp, violet → rose. A hue means *identity* (this gallery, this surface), *state* (info/pos/warn/neg/crit) or *the spectrum itself*. Never decoration, never rainbow wallpaper.
3. **White light is the chrome.** Neutral glass and paper carry the UI. App pages that aren't galleries (New Facets, Search, Variant Matrix, Live Demo, Collections) are *white light* — unrefracted — and wear CIE illuminant codes (D65, D50 …) instead of a wavelength.
4. **The Beam.** One hairline of light is the recurring motif: the active nav index, focus rings, progress, tab underlines, dividers that catch a spectral glint, the theme-switch sweep.
5. **Facet edges.** Surfaces read as cut glass: hairline border, a 1 px highlight on the lit top edge, soft radius (8 / 12 / 16). Depth comes from light on the edge, not from drop shadows. Only overlays cast a shadow.
6. **Instrument precision.** Mono, uppercase, wide-tracked eyebrows with coordinates and counts — `01 / CHARTS & METRICS · 209 FACETS · λ 436`. A faint 34 px measurement grid behind hero areas. λ is the *real* dominant wavelength of the hue.
7. **Things arrive by converging.** A slight chromatic split resolves into focus, eased out exponentially, 240–600 ms. Nothing blocks input. Reduced motion gets a fade or nothing.
8. **Three surfaces, one family.** Web, Terminal and Stream Deck share tokens, hues and labels. Each surface owns a hue: Web violet, Terminal phosphor mint, Deck lit-key amber.

---

## 2. Using it

### In Prism.html (App Shell engineer)
1. Paste `PRISM_DARK_CSS` / `PRISM_LIGHT_CSS` from `themes.js` into `shell-script.html` and put two entries **first** in `THEME_REGISTRY`:
   `{id:'prism-dark', ds:'prism', name:'Prism Night', mode:'dark', accent:'#b8a2f2', builtin:true, css:PRISM_DARK_CSS}` and
   `{id:'prism-light', ds:'prism', name:'Prism Day', mode:'light', accent:'#7353bb', builtin:true, css:PRISM_LIGHT_CSS}`.
   Default = `prism-dark`, or `prism-light` when there is no stored choice and `prefers-color-scheme: light`.
2. In `applyTheme` / `applyThemeToFrame`, stamp **`data-rf-mode="night|day"`** on `<html>` of the shell *and* every gallery frame (exactly like `data-ds`). Mode-specific primitives key off it.
3. Stamp **`data-rf-gallery="<id>"`** on each frame's `<html>` (and on nav items), and include the hue-setter block (prism.css §3) in the shell CSS and in `style-prism-frame-chrome`. Every hue-aware rule reads `--rf-hue` / `--rf-hue-v` / `--rf-hue-rgb`.
4. Copy the primitives you need from prism.css §4 into the shell / frame chrome. They are namespaced `.rf-*` and must **never** target `.panel` / `.card` (showcased content).
5. Theme strings are a single `:root{…}` block. **No `{`, `}` or `;` inside values** — `themeMatrix()` parses them by splitting on `;`. The generator enforces this.

### Under other skins (Cloudscape, Material 3 …)
They don't define `--rf-*`. Every Refraction rule falls back to contract tokens (`var(--rf-hue, var(--accent))`, `var(--rf-glass, var(--panel))` …) so the chrome degrades gracefully to the skin's colors.

### Standalone (website, terminal web previews, deck previews)
Link `prism.css`. Night is `:root`; Day is `:root[data-theme="prism-light"]` — also set `data-rf-mode="day"`. Website token mapping: `--panel-alt → --panel2`, `--green → --pos`, `--art-line → --rf-grid-line`, `--accent-ink → --rf-accent-ink`, `--radius → --r-xl`.

### Changing a token
From the repo root:

| Command | Does |
|---|---|
| `node design/tools/gen.mjs` | Authors `tokens.json` from the spec in `gen.mjs` (spectrum, tiers and gallery positions are computed in OKLCH there), then writes `prism.css`, `themes.js`, `specimen.html` and the README tables |
| `node design/tools/gen.mjs --emit` | Keeps a hand-edited `tokens.json` and regenerates everything derived from it |
| `node design/tools/gen.mjs --check` | Writes nothing; exits 1 if `tokens.json` or any derived output is stale (`--emit --check` checks only the derived outputs) |
| `node design/tools/contrast.mjs` | Runs the 1,061 WCAG 2.2 checks (web, deck, terminal truecolor / 256 / 16); exits 1 on any failure (`--check` also fails if README's contrast tables are stale) |
| `node design/tools/readme.mjs [--check]` | Refills / verifies only the README tables |

Workflow: change the spec in `gen.mjs` (or hand-edit `tokens.json` and use `--emit`) → run `contrast.mjs` (must stay all-pass) → add an old → new entry to `CHANGELOG.md` → re-paste the theme strings into `shell-script.html`. Hand-edit primitives in `tools/src/primitives.css` and the specimen in `tools/src/specimen.src.html` — never the generated files. The terminal nav order is read from `prism-term/src/facets/galleries.js`.

---

## 3. Color

Neutrals carry a whisper of the ink-violet hue (h ≈ 270–300) so the chrome reads as one material. Every text token clears 4.5:1 on every surface it can sit on (see §12).

<!-- gen:neutrals -->
| Token | Night | Day | Role |
|---|---|---|---|
| `--bg` | `#0a0c12` <sub>(0.155 0.013 270.4)</sub> | `#f6f5f9` <sub>(0.972 0.005 297.7)</sub> | App canvas |
| `--rf-bg-deep` | `#06070b` <sub>(0.129 0.010 271.9)</sub> | `#ecebf3` <sub>(0.943 0.011 291.9)</sub> | Behind hero/First Light, deck keys, terminal well |
| `--panel` | `#10131c` <sub>(0.188 0.019 270.2)</sub> | `#ffffff` <sub>(1.000 0.000 89.9)</sub> | Rails, bars, panels |
| `--panel2` | `#171a25` <sub>(0.220 0.022 272.6)</sub> | `#f0eff6` <sub>(0.955 0.009 292.8)</sub> | Secondary fill — raised at Night: hover rows, wells, segmented tracks |
| `--card` | `#12151f` <sub>(0.198 0.021 271.5)</sub> | `#fdfcff` <sub>(0.993 0.004 301.4)</sub> | Card / tile body surface |
| `--line` | `#252834` <sub>(0.279 0.023 273.9)</sub> | `#dedce9` <sub>(0.900 0.018 293.1)</sub> | Hairline borders (decorative, not a 3:1 boundary) |
| `--rf-line-soft` | `#1b1e29` <sub>(0.237 0.022 272.8)</sub> | `#e9e7f1` <sub>(0.932 0.014 295.3)</sub> | Internal dividers |
| `--rf-line-strong` | `#343849` <sub>(0.344 0.030 274.4)</sub> | `#c9c6d8` <sub>(0.834 0.025 293.5)</sub> | Hover borders, emphasized dividers |
| `--rf-line-control` | `#6b6f84` <sub>(0.546 0.033 276.8)</sub> | `#8a879d` <sub>(0.633 0.033 291.7)</sub> | Control boundaries that must meet 3:1 (input baseline, checkbox, switch track) |
| `--ink` | `#f0f0f5` <sub>(0.957 0.007 286.3)</sub> | `#20202e` <sub>(0.250 0.026 284.3)</sub> | Primary text |
| `--muted` | `#a2a4b4` <sub>(0.722 0.023 280.1)</sub> | `#55556a` <sub>(0.458 0.034 285.0)</sub> | Secondary text |
| `--dim` | `#8a8c9d` <sub>(0.644 0.025 280.3)</sub> | `#68687c` <sub>(0.525 0.031 285.3)</sub> | Tertiary text, captions, counts |
| `--rf-faint` | `#565a6c` <sub>(0.471 0.030 275.4)</sub> | `#a9a8b8` <sub>(0.737 0.023 288.7)</sub> | Disabled text and decorative marks only (exempt; never for meaning) |
| `--accent` | `#b8a2f2` <sub>(0.761 0.115 296.2)</sub> | `#7353bb` <sub>(0.527 0.157 294.6)</sub> | Brand violet: primary actions, links, selected states |
| `--rf-accent-hi` | `#cbb9f7` <sub>(0.822 0.088 297.8)</sub> | `#6142aa` <sub>(0.470 0.159 293.0)</sub> | Accent hover |
| `--rf-accent-lo` | `#a38be8` <sub>(0.696 0.135 294.5)</sub> | `#8b70cf` <sub>(0.613 0.141 295.0)</sub> | Accent pressed |
| `--rf-accent-ink` | `#151021` <sub>(0.189 0.034 296.5)</sub> | `#ffffff` <sub>(1.000 0.000 89.9)</sub> | Text/icons on an accent fill |
| `--accent2` | `#a8b9fc` <sub>(0.797 0.097 273.1)</sub> | `#4a62c6` <sub>(0.531 0.158 270.1)</sub> | Periwinkle partner for two-stop gradients |
| `--info` | `#86bdf9` <sub>(0.783 0.104 251.3)</sub> | `#2461bf` <sub>(0.507 0.161 259.2)</sub> | Information |
| `--pos` | `#8bd8ba` <sub>(0.824 0.088 167.6)</sub> | `#1f6b4f` <sub>(0.474 0.087 164.5)</sub> | Positive / success |
| `--warn` | `#eec36f` <sub>(0.838 0.114 82.8)</sub> | `#8a5a00` <sub>(0.508 0.108 73.3)</sub> | Warning |
| `--neg` | `#f5877f` <sub>(0.742 0.135 25.2)</sub> | `#bf3434` <sub>(0.538 0.176 25.4)</sub> | Negative / error |
| `--crit` | `#f07fb3` <sub>(0.737 0.150 352.4)</sub> | `#b0256f` <sub>(0.514 0.185 353.6)</sub> | Critical — the non-spectral magenta beyond red |

Also in the strings: every status has an `-rgb` triplet (`--accent-rgb`, `--info-rgb` …), `--cardgrad` (a 157° accent light at 7 % / 4.5 %), `--font`, `--r-sm/md/lg/xl` 6/8/12/16, `--elev-1/2`, `--dur` .24s, `--ease` out-expo, `--bd` 1px, `--head-w` 600, `--dens` 1 and the shell's `--cs-topnav-*` (glass top bar).

<!-- /gen:neutrals -->

### Refraction extension layer (`--rf-*`)

<!-- gen:rf -->

**Surfaces & glass**

| Token | Night | Day |
|---|---|---|
| `--rf-raised` | `#171a25` | `#ffffff` |
| `--rf-rail` | `transparent` | `#fcfbfe` |
| `--rf-glass` | `rgba(14,17,26,.72)` | `rgba(255,255,255,.72)` |
| `--rf-glass-strong` | `rgba(16,19,28,.9)` | `rgba(255,255,255,.9)` |
| `--rf-glass-blur` | `18px` | `18px` |
| `--rf-glass-sat` | `140%` | `160%` |
| `--rf-glass-line` | `rgba(255,255,255,.08)` | `rgba(32,24,72,.09)` |
| `--rf-edge` | `rgba(255,255,255,.055)` | `rgba(255,255,255,.95)` |
| `--rf-edge-hi` | `rgba(255,255,255,.1)` | `#ffffff` |
| `--rf-edge-lo` | `rgba(0,0,0,.35)` | `rgba(32,24,72,.07)` |

**Light**

| Token | Night | Day |
|---|---|---|
| `--rf-white` | `#f6f3ff` | `conic-gradient(from 200deg,#de8fb8,#a993ec,#7fb0ea,#79cdb0,#dcbc6c,#de8fb8)` |
| `--rf-beam-core` | `#ffffff` | `#7353bb` |
| `--rf-beam` | `linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.92) 50%,rgba(255,255,255,0))` | `linear-gradient(90deg,rgba(115,83,187,0),#7353bb 22%,#006ca9 52%,#007655 80%,rgba(31,107,79,0))` |
| `--rf-beam-v` | `linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.95) 30%,rgba(255,255,255,.95) 70%,rgba(255,255,255,0))` | `linear-gradient(180deg,rgba(115,83,187,0),#7353bb 25%,#006ca9 60%,rgba(36,97,191,0))` |
| `--rf-beam-glow` | `0 0 10px rgba(205,190,255,.55),0 0 2px rgba(255,255,255,.9)` | `0 0 8px rgba(115,83,187,.28)` |
| `--rf-fringe` | `linear-gradient(90deg,rgba(255,110,140,.0),rgba(255,110,140,.55),rgba(255,214,120,.5),rgba(120,230,190,.5),rgba(110,170,255,.55),rgba(184,140,255,.0))` | `linear-gradient(90deg,rgba(214,66,110,0),rgba(214,66,110,.45),rgba(196,140,20,.4),rgba(31,150,110,.4),rgba(46,110,214,.45),rgba(115,83,187,0))` |
| `--rf-halo` | `rgba(145,119,242,.16)` | `rgba(176,150,240,.22)` |
| `--rf-iris` | `linear-gradient(115deg,rgba(184,162,242,.10),rgba(134,189,249,.06) 40%,rgba(139,216,186,.06) 70%,rgba(238,195,111,.05))` | `linear-gradient(115deg,#ffe1e5 0%,#ebe5ff 26%,#cbf1fc 52%,#d1f3e3 76%,#f6e8ca 100%)` |
| `--rf-iris-edge` | `linear-gradient(115deg,rgba(203,185,247,.75),rgba(134,189,249,.55) 35%,rgba(139,216,186,.5) 65%,rgba(238,195,111,.45))` | `linear-gradient(115deg,#e7a6c8,#b49ff0 30%,#8fb8f2 55%,#86d7bb 78%,#e6c98a)` |
| `--rf-grid-line` | `rgba(255,255,255,.035)` | `rgba(24,18,42,.045)` |
| `--rf-split-a` | `rgba(255,92,130,.6)` | `rgba(214,52,104,.45)` |
| `--rf-split-b` | `rgba(92,170,255,.6)` | `rgba(36,104,222,.45)` |

**Interaction**

| Token | Night | Day |
|---|---|---|
| `--rf-focus` | `#d9ccff` | `#5b3ea8` |
| `--rf-focus-halo` | `rgba(184,162,242,.22)` | `rgba(115,83,187,.2)` |
| `--rf-selection` | `rgba(184,162,242,.32)` | `rgba(115,83,187,.18)` |
| `--rf-scrim` | `rgba(3,4,8,.66)` | `rgba(28,22,56,.3)` |
| `--rf-hover` | `rgba(255,255,255,.045)` | `rgba(32,24,72,.04)` |
| `--rf-press` | `rgba(255,255,255,.07)` | `rgba(32,24,72,.07)` |
| `--rf-accent-wash` | `rgba(184,162,242,.12)` | `rgba(115,83,187,.09)` |
| `--rf-accent-line` | `rgba(184,162,242,.38)` | `rgba(115,83,187,.4)` |

**Code**

| Token | Night | Day |
|---|---|---|
| `--rf-code-bg` | `#0c0e16` | `#f3f1f9` |
| `--rf-code-ink` | `#d8d1f6` | `#3b2f6b` |
| `--rf-syn-keyword` | `#c2aef8` | `#7555b8` |
| `--rf-syn-string` | `#7dd9b2` | `#007655` |
| `--rf-syn-number` | `#eac779` | `#9c5600` |
| `--rf-syn-tag` | `#7fc4fb` | `#006ca9` |
| `--rf-syn-attr` | `#ffaa96` | `#b2432a` |
| `--rf-syn-comment` | `#8a8c9d` | `#68687c` |
| `--rf-syn-punct` | `#a2a4b4` | `#55556a` |

**Shadow (overlays only)**

| Token | Night | Day |
|---|---|---|
| `--rf-shadow-1` | `0 1px 2px rgba(0,0,0,.35)` | `0 1px 2px rgba(32,24,72,.05)` |
| `--rf-shadow-2` | `0 18px 40px -18px rgba(0,0,0,.75),0 2px 6px rgba(0,0,0,.3)` | `0 1px 2px rgba(32,24,72,.05),0 14px 32px -16px rgba(64,40,150,.2)` |
| `--rf-shadow-3` | `0 32px 80px -24px rgba(0,0,0,.85),0 8px 20px -8px rgba(0,0,0,.5)` | `0 28px 70px -24px rgba(48,32,120,.3),0 6px 16px -6px rgba(48,32,120,.12)` |

Type, radius, motion, space and layout tokens are in the strings too: `--rf-fs-*` / `--rf-lh-*` / `--rf-ls-*`, `--rf-fw-*`, `--rf-mono`, `--rf-r-xs/2xl/pill`, `--rf-dur-*`, `--rf-ease-*`, `--rf-stagger`, `--rf-sp-*`, `--rf-topbar-h`, `--rf-rail-w`, `--rf-content-max`, `--rf-tile-min`, `--rf-gutter`, `--rf-grid-cell`, and `--rf-mode` (`night` / `day`).

<!-- /gen:rf -->

**Rules**
- Text: `--ink` (primary), `--muted` (secondary), `--dim` (tertiary, captions, counts, placeholders). `--rf-faint` is for disabled text and decoration only.
- Lines: `--line` is a decorative hairline. Anything a user must *find* to operate — an input's baseline, a checkbox, a switch track — uses `--rf-line-control` (≥3:1).
- Accent is for the primary action, links and selection. Text on an accent fill is always `--rf-accent-ink`.
- Status colors are spectrum positions (info azure · pos mint · warn citrine · neg coral · crit magenta). Badges are status text on its own 12 % wash. Never signal state by color alone — add a word, a dot, a notch.
- Do: one hue per context. Don't: two gallery hues side by side as decoration, multi-hue buttons, the spectrum behind body text.

---

## 4. Spectrum

One continuous ramp: start at the website accent (OKLCH h 296°), walk hue **down in even steps** through periwinkle and mint — the website's gradient — to amber, coral and rose (h 8°). Twelve named stops; galleries sample the same curve.

| Tier | Night | Day | Use |
|---|---|---|---|
| **ink** | L 0.80–0.84, C 0.105 (near-constant lightness) | C 0.15, L solved per hue for 4.9:1 on `--panel2` (constant contrast) | Text, strokes, λ labels, on-state glyphs — ≥4.5:1 everywhere |
| **vivid** | L 0.72–0.84, C 0.13 | C 0.16, L solved for 3.2:1 on `--bg` | Index ticks, beams, glows, data marks, fills — ≥3:1 |
| **wash** | vivid @ 14 % | L 0.935, C 0.042 (pearl tint) | Selected / active backgrounds |
| **sheen** | — (vivid serves) | L 0.74–0.81, C 0.13 | Day decorative gradients only (`--rf-spectrum`, ruler, caustic) |

λ = dominant wavelength (CIE 1931, D65 white) of the Night vivid color, computed — not invented. Purples beyond the spectral locus carry the complementary wavelength with a `c` suffix (rose = `λ 494c`).

<!-- gen:spectrum -->
| # | Stop | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Day wash | Day sheen |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **violet** | 296 | λ 436 | `#c2aef8` | `#ab91eb` | `#7555b8` | `#9876e3` | `#ebe5ff` | `#b299f3` |
| 2 | **periwinkle** | 269.8 | λ 472 | `#a2b9ff` | `#839ef4` | `#4961bf` | `#6783ec` | `#e1e9ff` | `#8ba6fd` |
| 3 | **azure** | 243.6 | λ 479 | `#7fc4fb` | `#52acee` | `#006ca9` | `#0090de` | `#d7edff` | `#5ab3f7` |
| 4 | **cerulean** | 217.5 | λ 485 | `#64ceea` | `#00b8db` | `#007188` | `#0096b3` | `#cbf1fc` | `#19bfe2` |
| 5 | **cyan** | 191.3 | λ 492 | `#61d5d0` | `#00c3be` | `#007471` | `#009995` | `#cbf3f0` | `#00c8c3` |
| 6 | **mint** | 165.1 | λ 510 | `#7dd9b2` | `#52cea0` | `#007655` | `#009c71` | `#d1f3e3` | `#53cea0` |
| 7 | **jade** | 138.9 | λ 554 | `#a5d996` | `#94d582` | `#2e760f` | `#4c9b32` | `#dcf1d6` | `#8fcf7d` |
| 8 | **lime** | 112.7 | λ 569 | `#ccd381` | `#c9d168` | `#686c00` | `#8a8f00` | `#e9edcd` | `#c1c95f` |
| 9 | **citrine** | 86.5 | λ 578 | `#eac779` | `#ebc059` | `#836300` | `#ac8300` | `#f6e8ca` | `#e5ba53` |
| 10 | **amber** | 60.4 | λ 585 | `#fab880` | `#f8a75f` | `#9c5600` | `#cc7300` | `#ffe4cf` | `#f7a65f` |
| 11 | **coral** | 34.2 | λ 597 | `#ffaa96` | `#f69077` | `#b2432a` | `#de6448` | `#ffe2db` | `#fb947c` |
| 12 | **rose** | 8 | λ 494c | `#faa2b2` | `#ec8398` | `#b13f5d` | `#de5f7d` | `#ffe1e5` | `#f48a9f` |

Perceptual evenness (ΔE OKLab between neighbors): Night ink 0.0471–0.0515, Night vivid 0.0569–0.0714; Day ink 0.0416–0.0728, Day vivid 0.0503–0.0728. Day is less even only where sRGB runs out of chroma at text-safe lightness (cyan, lime).

<!-- /gen:spectrum -->

CSS: `--rf-s-<name>` (ink), `--rf-s-<name>-v` (vivid), `--rf-s-<name>-rgb` (vivid triplet), `--rf-spectrum` / `--rf-spectrum-v` (decorative ramp, horizontal / vertical), `--rf-spectrum-ink`, `--rf-spectrum-text` (the website's violet → periwinkle → mint text gradient).

**Use the full ramp only where the spectrum is the subject:** the spectral ruler, the Spectrums gallery index, the palette's beam rule, First Light.

---

## 5. Positions — galleries, app pages, surfaces

Galleries take even steps along the ramp in **navigation order** (t = (order − 1) / 17), so the sidebar reads as one continuous spectrum top to bottom. If the nav order changes, regenerate. Spectrums gets a full-ramp index instead of one hue.

<!-- gen:galleries -->
**Galleries** (web)

| # | id | Gallery | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Index |
|---|---|---|---|---|---|---|---|---|---|
| 01 | `charts` | Charts & Metrics | 296 | λ 436 | `#c2aef8` | `#ab91eb` | `#7555b8` | `#9876e3` | hue tick |
| 02 | `fx` | FX Store | 279.1 | λ 467 | `#adb5ff` | `#9299f3` | `#5b5cbe` | `#7a7eeb` | hue tick |
| 03 | `lab` | Animation Lab | 262.1 | λ 474 | `#98bcff` | `#76a2f4` | `#3664be` | `#5487eb` | hue tick |
| 04 | `ai` | AI Working | 245.2 | λ 479 | `#81c4fc` | `#55abef` | `#006cad` | `#008fe2` | hue tick |
| 05 | `objects` | Animated Objects | 228.2 | λ 483 | `#6dcaf2` | `#2cb3e4` | `#007093` | `#0094c1` | hue tick |
| 06 | `input` | Input Methods | 211.3 | λ 487 | `#60d0e4` | `#00bbd3` | `#007282` | `#0097ac` | hue tick |
| 07 | `text` | Text Effects | 194.4 | λ 492 | `#60d4d3` | `#00c2c1` | `#007474` | `#009999` | hue tick |
| 08 | `shapes` | Text Shapes | 177.4 | λ 499 | `#6dd7c0` | `#2ec9ae` | `#007564` | `#009b85` | hue tick |
| 09 | `maps` | Maps & Geo | 160.5 | λ 519 | `#83d9ad` | `#5fd09a` | `#00774e` | `#009d68` | hue tick |
| 10 | `notify` | Notifications & Status | 143.5 | λ 550 | `#9ed99b` | `#89d487` | `#1a781f` | `#3d9c3e` | hue tick |
| 11 | `arch` | Architecture Diagrams | 126.6 | λ 563 | `#b8d78b` | `#afd575` | `#527100` | `#6d9600` | hue tick |
| 12 | `callouts` | Callouts & Annotations | 109.6 | λ 570 | `#d0d280` | `#ced065` | `#6c6b00` | `#8f8e00` | hue tick |
| 13 | `obsidian` | Obsidian Facets | 92.7 | λ 576 | `#e4cb79` | `#e5c55b` | `#7d6500` | `#a58600` | hue tick |
| 14 | `menus` | Menus & Actions | 75.8 | λ 581 | `#f2c17a` | `#f3b659` | `#8d5e00` | `#b97d00` | hue tick |
| 15 | `spectrums` | Spectrums | 58.8 | λ 586 | `#fbb781` | `#f8a560` | `#9d5500` | `#cf7100` | full ramp |
| 16 | `idea` | Idea Gallery | 41.9 | λ 593 | `#ffae8e` | `#f8956f` | `#b04614` | `#dc6736` | hue tick |
| 17 | `mobile` | Mobile Gallery | 24.9 | λ 605 | `#fea69f` | `#f48a82` | `#b3413e` | `#e0615c` | hue tick |
| 18 | `desktop` | Desktop Gallery | 8 | λ 494c | `#faa2b2` | `#ec8398` | `#b13f5d` | `#de5f7d` | hue tick |

**App pages** (white light)

| id | Page | Label | Index | Color fallback |
|---|---|---|---|---|
| `facets` | New Facets | D65 | `--rf-white` tick | accent |
| `search` | Search | D50 | `--rf-white` tick | accent |
| `variants` | Variant Matrix | D55 | `--rf-white` tick | accent |
| `showcase` | Live Demo | D75 | `--rf-white` tick | accent |
| `collections` | Collections | D93 | `--rf-white` tick | accent |

**Surfaces**

| id | Surface | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Note |
|---|---|---|---|---|---|---|---|---|
| `web` | Web | 296 | λ 436 | `#c2aef8` | `#ab91eb` | `#7555b8` | `#9876e3` | Prism.html web facets — the home violet. |
| `terminal` | Terminal | 163 | λ 514 | `#80d9b0` | `#58cf9d` | `#007652` | `#009d6d` | prism-term — phosphor mint. |
| `deck` | Stream Deck | 66 | λ 584 | `#f8bb7e` | `#f7ac5c` | `#965900` | `#c57700` | prism-deck — the warm amber of a lit key. |

<!-- /gen:galleries -->

CSS per position: `--rf-g-<id>` (ink), `--rf-g-<id>-v` (vivid), `--rf-g-<id>-rgb`; surfaces `--rf-surf-<id>*`. Set the current hue on a subtree with `data-rf-gallery="<id>"` / `data-rf-surface="<id>"`.

**Terminal catalog.** One gallery, one λ on every surface (1.3.0). A terminal gallery with a web counterpart (same id, or `status` → `notify`, `diagrams` → `arch`) takes that web gallery's hue and λ, so Charts is λ 436 in Prism.html, on `/terminal/` and in `curl /tty`. Terminal-only galleries (sim, retro, loaders, progress, ops, ascii) take half-steps of the web ramp, t = (k + ½) / 17, spread evenly in the terminal nav order (`prism-term/src/facets/galleries.js`) — stops no web gallery uses — so every λ label names exactly one gallery (gen.mjs fails on a collision). The terminal sidebar no longer reads as a monotone ramp; the shared identity wins. Tokens: `galleries.terminal[]` (ink / vivid / rgb per mode, λ, web counterpart). The nav order is not changed.

<!-- gen:terminal-galleries -->
| # | id | Terminal gallery | h° | λ | Night ink | Night vivid | Day ink | Day vivid | Web counterpart |
|---|---|---|---|---|---|---|---|---|---|
| 01 | `fx` | FX Store | 279.1 | λ 467 | `#adb5ff` | `#9299f3` | `#5b5cbe` | `#7a7eeb` | `fx` (web h 279.1°) |
| 02 | `objects` | Animated Objects | 228.2 | λ 483 | `#6dcaf2` | `#2cb3e4` | `#007093` | `#0094c1` | `objects` (web h 228.2°) |
| 03 | `sim` | Particles & Simulations | 270.6 | λ 471 | `#a3b9ff` | `#859ef4` | `#4a60bf` | `#6882ec` | — |
| 04 | `retro` | Retro & Demoscene | 219.8 | λ 485 | `#65cdeb` | `#0ab7dd` | `#00718a` | `#0096b6` | — |
| 05 | `text` | Text Effects | 194.4 | λ 492 | `#60d4d3` | `#00c2c1` | `#007474` | `#009999` | `text` (web h 194.4°) |
| 06 | `loaders` | Spinners & Loaders | 168.9 | λ 506 | `#77d8b7` | `#48cda4` | `#00765a` | `#009c78` | — |
| 07 | `progress` | Progress & Counters | 135.1 | λ 558 | `#abd893` | `#9dd57e` | `#3b7500` | `#579927` | — |
| 08 | `charts` | Charts & Metrics | 296 | λ 436 | `#c2aef8` | `#ab91eb` | `#7555b8` | `#9876e3` | `charts` (web h 296°) |
| 09 | `ai` | AI Working | 245.2 | λ 479 | `#81c4fc` | `#55abef` | `#006cad` | `#008fe2` | `ai` (web h 245.2°) |
| 10 | `status` | Notifications & Status | 143.5 | λ 550 | `#9ed99b` | `#89d487` | `#1a781f` | `#3d9c3e` | `notify` (web h 143.5°) |
| 11 | `ops` | Linux & Ops | 84.2 | λ 578 | `#ecc679` | `#edbe59` | `#856200` | `#af8200` | — |
| 12 | `diagrams` | Architecture Diagrams | 126.6 | λ 563 | `#b8d78b` | `#afd575` | `#527100` | `#6d9600` | `arch` (web h 126.6°) |
| 13 | `callouts` | Callouts & Layout | 109.6 | λ 570 | `#d0d280` | `#ced065` | `#6c6b00` | `#8f8e00` | `callouts` (web h 109.6°) |
| 14 | `input` | Input & Menus | 211.3 | λ 487 | `#60d0e4` | `#00bbd3` | `#007282` | `#0097ac` | `input` (web h 211.3°) |
| 15 | `maps` | Maps & Geo | 160.5 | λ 519 | `#83d9ad` | `#5fd09a` | `#00774e` | `#009d68` | `maps` (web h 160.5°) |
| 16 | `lab` | Animation Lab | 262.1 | λ 474 | `#98bcff` | `#76a2f4` | `#3664be` | `#5487eb` | `lab` (web h 262.1°) |
| 17 | `ascii` | Pure ASCII | 33.4 | λ 597 | `#ffaa96` | `#f68f78` | `#b2432c` | `#df634a` | — |

<!-- /gen:terminal-galleries -->

---

## 6. Type

- **Sans:** `Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, …` — Inter is bundled at **400, 600 and 700** (Latin subsets, `design/fonts/inter-{400,600,700}-latin.woff2`): in Prism.html, self-hosted on the website, inlined in the specimen. `font-synthesis: none`. Use only the three real faces — in-between values snap (500 → 400, 650 → 700), so the scale never uses them; `--head-w` is 600.
- **Mono:** `ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono", "Segoe UI Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace` — eyebrows, counts, λ, class refs, code, terminal. Tabular numerals wherever numbers line up.
- No web fonts, no CDNs.

<!-- gen:type -->
| Token | Size / line | Tracking | Weight | Family | Use |
|---|---|---|---|---|---|
| `--rf-fs-display` | 66 / 1.06 | -0.058em | 700 | sans | Hero / First Light title (website h1: 66px / -3.8px) |
| `--rf-fs-hero` | 112 / 1.02 | -0.058em | 700 | sans | Fluid landing display — the website hero h1 on large screens (~88px at 1440, 112px from 1920) |
| `--rf-fs-h1` | 44 / 1.1 | -0.042em | 700 | sans | Gallery page title |
| `--rf-fs-section` | 48 / 1.08 | -0.045em | 700 | sans | Section headings on large screens — website h2s, library page headers (fluid 40 → 48px; 48 from 1920px) |
| `--rf-fs-h2` | 32 / 1.2 | -0.039em | 600 | sans | Section title (website h2: 32px / -1.25px) |
| `--rf-fs-h3` | 22 / 1.3 | -0.025em | 600 | sans | Panel / dialog title |
| `--rf-fs-h4` | 17 / 1.35 | -0.018em | 600 | sans | Card title, group header |
| `--rf-fs-lead` | 16 / 1.75 | -0.006em | 400 | sans | Intro paragraphs |
| `--rf-fs-body` | 14 / 1.6 | -0.004em | 400 | sans | Default text |
| `--rf-fs-ui` | 13 / 1.4 | 0em | 400 | sans | Nav items, buttons, inputs |
| `--rf-fs-small` | 12 / 1.5 | 0em | 400 | sans | Tile meta, help text |
| `--rf-fs-caption` | 11 / 1.45 | 0.005em | 400 | sans | Footnotes, timestamps |
| `--rf-fs-eyebrow` | 10 / 1.2 | 0.15em | 600 | mono · caps | Instrument labels: 01 / CHARTS · 209 FACETS · λ 436 |
| `--rf-fs-code` | 12 / 1.7 | 0em | 400 | mono | Code, class refs, terminal |
| `--rf-fs-count` | 11 / 1.2 | 0.02em | 400 | mono | Counts and λ in nav, chips |

<!-- /gen:type -->

**Rules**
- Display and headings track tight (website h1: 66 px / −3.8 px). Body never tracks tighter than −0.006em.
- Eyebrows: `index / NAME · meta · λ`, mono 10 px, 600, +0.15em, uppercase, hue color; separators and meta in `--dim`.
- **`text-transform: uppercase` turns `λ` into `Λ`.** Wrap every λ inside caps labels in `.rf-lambda` or `.rf-nocase`.
- Sentence case for titles and buttons. US spelling ("color").

---

## 7. Radius, space, density, layout

- Radius: `xs 4` (kbd, tags) · `sm 6` (chips-as-rect, copy, segmented items) · `md 8` (buttons, inputs, nav items) · `lg 12` (tiles, cards) · `xl 16` (panels, dialogs, palette) · `2xl 24` · `pill 999` (filter chips, switches). Contract `--r-sm/md/lg/xl` = 6/8/12/16.
- Space: 4 px base — 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88, 120 (`--rf-sp-<n>`, e.g. `--rf-sp-4` = 16 px). Section rhythm 88–120.
- Density: `--dens` 1 (comfortable) / 0.85 (compact) multiplies vertical padding in chrome rows.
- Layout: top bar 56, rail 264, content max 1480, tile min 296, gutter 16, grid cell 34 (`--rf-topbar-h`, `--rf-rail-w`, …).

---

## 8. Material & light

| Level | Name | Night | Day | Use |
|---|---|---|---|---|
| 0 | canvas | `--bg`, no edge | `--bg` pearl | page |
| 1 | resting | `--card` + `--line` + `--elev-1` (inset top highlight .055) | `--card` + white top edge + 1 px tinted shade | tiles, panels, inputs |
| 2 | raised | `--rf-raised` + `--rf-line-strong` + `--elev-2` | white + tinted soft shadow; iridescent edge on hover | hover, menus, popovers |
| 3 | overlay | `--rf-glass` + blur 18 + `--rf-shadow-3` | white glass + blur 18 + violet-tinted shadow | palette, dialogs, toasts, top bar |

- **The Beam** — `.rf-beam` (rule; `.is-hue`, `.is-glint`, `.is-sweep`), `.rf-beam-v` (vertical indicator), `.rf-progress`. Night beams are white light with a hue halo; Day beams are the light's color made visible on paper (accent → azure → mint foil).
- **Lit edge** — `.rf-lit`: on hover a beam of the hue lands on the top edge (Night); Day swaps the border for the thin-film `--rf-iris-edge`.
- **Glass** — `.rf-glass`: `--rf-glass` + `backdrop-filter: blur(18px) saturate(140–160%)` + `--rf-glass-line` + inset `--rf-edge-hi`. Only on overlays and the top bar.
- **Grid + halo** — `.rf-grid` (34 px, radial mask) + `.rf-halo` (radial hue light). Hero areas and page headers only. Day hero halos become the pearl `--rf-iris` field.
- **Rails** — `--rf-rail`: transparent glass on ink at Night; a white paper sheet on the pearl canvas by Day.
- Don't: drop shadows on resting cards, glass on content blocks, glows on body text, more than one halo per view.

---

## 9. Components (chrome anatomy)

All are drawn in the specimen (§06 Components, §07 App chrome) from prism.css classes. The specimen's glyphs are typographic (→ ↗ ↓ ↵) or CSS; the shipped chrome draws its icons from the hairline family in `design/icons/` (§13).

**Top bar** — 56 px, `--cs-topnav-bg` glass, bottom hairline. Left: mark + `prism.` wordmark (from `design/brand/`), breadcrumb with the current page's index tick. Middle: search trigger (`.rf-search` with `Ctrl K` / `⌘K` kbd). Right: surface switcher, theme switch, `OFFLINE` status (mono, pos dot).

**Sidebar nav with spectral index** — `.rf-nav`, `.rf-nav-group` (mono eyebrow + fading hairline), `.rf-nav-item` = index tick (3 × 14, vivid hue, 80 %) + label (13 px muted) + λ (mono, revealed on hover/active) + count (mono dim). Order: *Library* (white-light pages, `.rf-index.is-white`) then *Galleries · 18* (refracted). Hover: `--rf-hover` fill, ink label, λ slides in. Active (`aria-current="page"`): hue wash gradient from the left, 600 label, λ in hue ink, and the tick becomes a 20 px **white beam haloed in the gallery hue** (Day: hue-ink tick with soft glow). Spectrums uses `.rf-index.is-full`.

**Gallery page header** — `.rf-pagehead` on the gallery hue: `.rf-grid` + `.rf-halo` behind; `.rf-eyebrow` `NN / NAME · N FACETS · λ` (λ in `.rf-nocase`); `.rf-title` (44 / 700 / −0.042em); `.rf-lead` (max 62ch, muted); `.rf-ruler` — the spectral ruler with a tick per gallery and a beam marker where this page sits.

**Filter chips** — `.rf-chip` pills, 30 px, muted text + mono count. Selected (`aria-pressed="true"`): hue wash + hue border + a leading 6 px hue dot (shape, not just color) + count in hue ink. Row scrolls horizontally rather than wrapping to three lines.

**Tabs / segmented** — `.rf-tab` underline is a 2 px hue beam with glow (`aria-selected`); `.rf-seg` for density, theme and surface (`aria-pressed`): a `--panel2` track, the pressed item lifts to `--card` + `--elev-1`.

**Facet tile** — `.rf-tile` (`--card`, `--line`, r 12, `--elev-1`; hover → `--rf-line-strong` + `--elev-2`; add `.rf-lit` for the edge beam). `.rf-tile-stage` (200 px, `--bg`, facet renders as authored) with `.rf-tile-coord` (`01.012`, mono) and `.rf-tile-live` (pos dot) for animating facets. `.rf-tile-meta`: `.rf-tile-name` (13 / 600) + `.rf-tag` NEW, `.rf-ref` class chip (mono, hue ink on code well), `.rf-tile-desc` (2-line clamp). Keep `content-visibility: auto` on off-screen tiles.

**Copy bar** — `.rf-copybar`: `.rf-copy.is-primary` "Copy" + `HTML` / `CSS` + right-aligned `.rf-lambda` with an index dot. On success: `.is-done` (pos text + border, a beam sweeps the bottom edge, 1.6 s), label "Copied", and an `aria-live="polite"` announcement.

**Search / command palette** — `.rf-palette.rf-glass` (640 max, r 16) over `--rf-scrim`. Input row 56 px with CSS lens, caret in accent, `esc` kbd; a full-spectrum `.rf-beam.is-full` under it; grouped results (`.rf-palette-group` eyebrows: GALLERIES / FACETS / COMMANDS); rows = index tick + name (matched run in hue `<mark>`) + where + λ; selected row = hue wash + inset hue hairline + `↵` kbd; footer key hints. `role="dialog"`, focus trapped, arrow keys move `aria-selected`.

**Theme switch** — `.rf-seg` "Night | Day". Switching relights the page with a beam sweep (§10). Persist in `localStorage.prismTheme`.

**Surface switcher** — `.rf-seg` "Web | Terminal | Deck", each with an `.rf-index.is-dot` in its surface hue (`data-rf-surface`). Selected = card lift; the page's `--rf-hue` follows the surface on surface landing pages.

**Toast** — `.rf-toast.rf-glass`: status index (`.rf-index.is-lit` in pos/warn/neg/hue), title (13 / 600), mono detail line, `.rf-progress` timer along the bottom. `role="status"`.

**Buttons** — `.rf-btn` 40 px (`.is-sm` 32, `.is-lg` 46), r 8. Primary: accent fill, `--rf-accent-ink`, inner top highlight, accent glow, a glint crosses on hover. Secondary: `--panel` + `--rf-line-strong`. Ghost: text only. Hover lifts 1 px; press scales .985. Disabled 45 %.

**Inputs** — `.rf-input` 40 px on `--panel2`, hairline border, and a **3:1 baseline** (`inset 0 -1px 0 --rf-line-control`). Focus moves `--rf-focus` onto the border + baseline with a 4 px halo. Invalid: `--neg` border + message. `.rf-switch`, `.rf-check` use `--rf-line-control` boundaries and the accent when on.

---

## 10. Motion

| Token | ms | Use |
|---|---|---|
| `--rf-dur-instant` | 80 | pressed states, color flips |
| `--rf-dur-fast` | 140 | hover, chip select |
| `--rf-dur-base` (= `--dur`) | 240 | UI state, tabs, switches |
| `--rf-dur-slow` | 400 | tile rise, palette open, copy sweep |
| `--rf-dur-deliberate` | 600 | refract-in headers and hero |
| `--rf-dur-sweep` | 600 | beam sweep, theme relight (a ceiling) |
| `--rf-dur-first-light` | 1600 | ceiling — owned by `design/first-light/` |

Easing: `--rf-ease-out-expo` `cubic-bezier(.16,1,.3,1)` (arrivals; = `--ease`), `--rf-ease-out` `(.22,1,.36,1)` (website hover moves), `--rf-ease-in-out` `(.65,0,.35,1)` (sweeps, loops), `--rf-ease-in` `(.7,0,.84,0)` (exits at ~60 % of the arrival duration).

**Patterns**
- **Refract-in** (`.rf-refract-in`, text; `.rf-refract-in-box`, boxes): opacity 0 → 1, translateY 6 → 0, blur 6 → 0, a ±3 px `--rf-split-a`/`--rf-split-b` chromatic split resolving to 0. 600 ms out-expo. Headers, hero type. Box variant uses `drop-shadow` filters — at most ~6 elements at once.
- **Rise** (`.rf-rise`): tiles, opacity + translateY 10 + scale .985, 400 ms, staggered `--rf-stagger` 28 ms via `--rf-i`, capped at 12 (336 ms); later tiles arrive with the 12th.
- **Beam sweep** (`.rf-beam.is-sweep`): a 1 px beam reveals along its axis, 600 ms in-out. Copy confirmation uses a 400 ms version.
- **Glint**: a diagonal highlight crosses a primary button once on hover (600 ms).
- **Theme relight** — View Transitions: the new theme is revealed behind a vertical beam that travels **away from the toggle that was pressed** (toggle right of center → right-to-left; no origin → left-to-right). **600 ms ceiling**; **any input ends it** at once (Chromium routes all input to `<html>` during a View Transition, so the sweep is kept short and interruptible). The shipped implementation is `PrismFirstLight.relight(applyFn, originEl)` in `design/first-light/` — use it in the shell. prism.css carries the equivalent CSS-only recipe:
  ```js
  // needs <i class="rf-relight-beam"></i> once in the shell body (prism.css provides its style)
  if (!document.startViewTransition || reduceMotion) { applyTheme(next); }
  else {
    const r = origin?.getBoundingClientRect();
    html.classList.toggle('rf-rtl', !!r && r.left + r.width / 2 > innerWidth / 2);
    const vt = document.startViewTransition(() => { html.classList.add('rf-relighting'); applyTheme(next); });
    const cut = () => vt.skipTransition(), IN = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    vt.ready.then(() => IN.forEach((t) => addEventListener(t, cut, { capture: true, passive: true })));
    vt.finished.finally(() => { IN.forEach((t) => removeEventListener(t, cut, { capture: true })); html.classList.remove('rf-relighting', 'rf-rtl'); });
  }
  ```
  prism.css animates `::view-transition-new(root)` with a clip-path wipe (`rf-relight`, or `rf-relight-rtl` under `.rf-rtl`) and moves the `rf-relight-beam` group across the viewport in the same direction, over `--rf-dur-sweep` (600 ms). Fallback without View Transitions: instant swap (or a 240 ms cross-fade).
- **First Light** (the load sequence) is specified and built in `design/first-light/` by the Brand designer — ≤ 1.6 s, never blocks input, skippable, once per session with a ~300 ms echo, none for reduced motion. Its tokens (beam, spectrum, durations, easing) come from here.

**Reduced motion** (`prefers-reduced-motion: reduce`, or `[data-rf-motion="reduce"]` set in-app): refract-in / rise become a 120 ms fade with no delay; sweeps, glints, carets, tab-ins and the relight are removed; loops stop; First Light is skipped.

**Performance** — animate only `opacity`, `transform`, `filter`, `clip-path`. No layout properties. No `will-change` at rest. Off-screen tiles keep `content-visibility: auto`.

---

## 11. Surfaces

### Web (Prism.html, website)
Restyle **chrome only**: shell, nav, top bar, page headers, filter bars, tile scaffolding (`.tile .head .bar .copy h3.sec`), palette, toasts. Facets inside `.stage` render as authored; galleries that *demonstrate* other design languages (Spectrums, theme packs) keep their own look. Never restyle `.panel` / `.card` globally. The website keeps its look — it already is Refraction's starting point — and adopts the tokens, the λ eyebrows and the spectrum.

### Terminal (prism-term)
`tokens.json → terminal.night / terminal.day` — background, foreground, cursor, selection and ANSI-16, each with contrast and its designed xterm-256 index; `tokens256` / `spectrum256` / `galleries256` (gallery ink + vivid) for 256-color mode, checked against `surfaces256` (the terminal background and every surface as it quantizes); `roles` = the [text, fill] ANSI slot of each token at 16 colors; `hueToAnsi16` for 16-color gallery hues; detection guidance. Magenta (5) is the Prism violet; bright black (8) is a legible dim. Light terminals: 7 "white" is a readable gray and 15 is a 3:1 decorative gray, following the GitHub-light convention so apps that print "white" stay readable.

<!-- gen:ansi -->
| Slot | Night | ratio | 256 | Day | ratio | 256 |
|---|---|---|---|---|---|---|
| 0 black | `#1d202b` | 1.2 | 234 | `#23222f` | 14.68 | 235 |
| 1 red | `#f28885` | 8.04 | 210 | `#b73232` | 5.6 | 124 |
| 2 green | `#7ad59c` | 11.01 | 79 | `#007240` | 5.66 | 22 |
| 3 yellow | `#ecca76` | 12.36 | 186 | `#835c00` | 5.63 | 94 |
| 4 blue | `#81aaf7` | 8.4 | 111 | `#2a5ec5` | 5.62 | 26 |
| 5 magenta | `#b8a2f2` | 8.83 | 147 | `#7353bb` | 5.34 | 61 |
| 6 cyan | `#67cfe3` | 10.81 | 80 | `#006d7d` | 5.65 | 24 |
| 7 white | `#c6c7d3` | 11.65 | 251 | `#e6e5ee` | 1.17 | 254 |
| 8 brightBlack | `#76798e` | 4.56 | 102 | `#55546a` | 6.88 | 240 |
| 9 brightRed | `#ffaaa7` | 10.76 | 217 | `#cf354b` | 4.62 | 160 |
| 10 brightGreen | `#a5eac1` | 14.09 | 151 | `#00823a` | 4.63 | 22 |
| 11 brightYellow | `#f7e59f` | 15.51 | 222 | `#8d6c00` | 4.6 | 94 |
| 12 brightBlue | `#aac8ff` | 11.56 | 153 | `#006fd8` | 4.62 | 26 |
| 13 brightMagenta | `#d9c6fe` | 12.53 | 189 | `#a04ac2` | 4.63 | 91 |
| 14 brightCyan | `#9eeaf2` | 14.43 | 152 | `#007c87` | 4.65 | 23 |
| 15 brightWhite | `#f6f6fb` | 18.15 | 231 | `#ffffff` | 1.07 | 231 |
| background | `#0a0c12` |  |  | `#f8f7fb` |  |  |
| foreground | `#e6e6ef` |  |  | `#23222f` |  |  |
| cursor | `#b8a2f2` |  |  | `#7353bb` |  |  |
| cursorText | `#0a0c12` |  |  | `#ffffff` |  |  |
| selectionBackground | `#2e2748` |  |  | `#ddd5f3` |  |  |
| selectionForeground | `#f0f0f5` |  |  | `#20202e` |  |  |

Ratios are against each terminal's own background (Night `#0a0c12`, Day `#f8f7fb`). Slot 0 (Night) and slots 7 and 15 (Day: light white and bright white, as in Solarized and Tango light) are background-role colors: fills and text on colored status bars, never text on the background.

<!-- /gen:ansi -->

- Depth: `NO_COLOR` → none · `COLORTERM=truecolor|24bit` → 24-bit · `TERM=*256color*` → 256 · else 16. Never guess truecolor from `TERM` alone.
- Mode: Night unless the terminal is light — `PRISM_TERM_THEME` if set, else `COLORFGBG`, else an `OSC 11` query (100 ms timeout, interactive runs only); background L > 0.6 → Day. `d` flips Day ↔ Night in the browser and player.
- Truecolor: use the hex tokens and spectrum tiers directly; interpolate gradients in OKLCH. 256: surfaces and art take the nearest index by OKLab distance; text takes its designed index — the nearest that still clears 4.5:1 on every 256-color surface (marks 3:1), with the hue kept (`color.mjs` `pick256`; Day teal ink → 23 `#005f5f`, not the too-light nearest 30). Never use 0–15 for brand hues — users remap them. 16: semantic slots only.
- Shipped as color schemes named "Prism Night" / "Prism Day" for 11 emulators — Windows Terminal, iTerm2, Alacritty, kitty, WezTerm, Ghostty, foot, GNOME Terminal, Konsole, Xresources and the VS Code terminal: `prism-term theme <format>` prints one, and `prism-term/themes/` carries them all. The full terminal grammar is in `prism-term/docs/refraction-terminal.md`.

### Stream Deck (prism-deck)
Author every key at **144 × 144** (@2x) and downsample to 72. Units below are @144 (@72 in parentheses).

| Element | Spec |
|---|---|
| Canvas | key 72 / 144 · SD+ key 120 · XL 96 · SD+ dial segment 200 × 100 · touch strip 800 × 100 (4 segments) |
| Grid | 8 px (4) |
| Safe area | bleed 8 (4) may be cropped by the bezel · content inside 12 (6) · text inside 16 (8) |
| Value | 44 (22) Inter 600, −0.02em, ≤ 5 chars, top 44 (22) |
| Label | 22 (11) Inter 600, ≤ 2 lines × 9 chars, 30 (15) above the bottom |
| Micro | 16 (8) mono 600 caps +0.08em — λ / coordinates only, never the only label |
| Index | hue bar 32 × 4 (16 × 2), centered, 12 (6) above the bottom |
| Minimum | nothing below 16 (8) |
| Dial segment | micro label 14 mono caps, value 34 Inter 600, beam meter 3 px along the bottom, hue tick at left |

Material: Night key = `radial-gradient(120% 90% at 50% 0%, #161a27, #0b0d14 62%, #06070b)` + 2 px top edge highlight — the default on hardware (no glare). Day key = pearl `#ffffff → #f4f3f8 → #e9e7f1` as a profile option.

| State | Index | Edge | Glyph | Light |
|---|---|---|---|---|
| off | hue @ 45 % | lit top edge only | muted | none |
| on | hue 100 % + glow | 3 px (1.5) inner ring in the hue | hue ink | radial hue wash 22 % from the bottom |
| alert | warn / neg | 4 px (2) inner ring in warn / neg | ink | ring breathes 1 Hz (≤ 10 s, then holds) + **corner notch** (28 px triangle) — never color alone |
| busy | hidden | a white beam laps the rim, 1.2 s per lap at 10 fps | muted | none |
| disabled | none | none | faint | none |

Animate at ≤ 10 fps with precomputed frames; static between interactions. Reduced motion (plugin setting): no loops; busy = static three dots. A key's hue is its gallery's (`galleries.web[].night.ink/vivid`); surface keys (page/next) use the deck amber.

---

## 12. Accessibility

WCAG 2.2 AA in both modes. Text 4.5:1 (SC 1.4.3); control boundaries, focus indicators, index ticks and vivid marks 3:1 (SC 1.4.11). Ratios computed by script (`design/tools/contrast.mjs`) from `tokens.json`; the specimen also recomputes its subset live.

<!-- gen:contrast -->
Computed by `design/tools/contrast.mjs` from tokens.json v1.3.0 (WCAG 2.2 relative-luminance contrast; rgba washes are composited over the surface they sit on). **1079 / 1079 checks pass.** Text targets 4.5:1 (SC 1.4.3); control boundaries, focus rings, index ticks and vivid marks target 3:1 (SC 1.4.11).

| Check (worst case shown) | Night | Day | Target |
|---|---|---|---|
| `--ink` on bg / panel / panel2 / card | 15.27:1 | 14.06:1 | 4.5:1 |
| `--muted` on bg / panel / panel2 / card | 7.02:1 | 6.35:1 | 4.5:1 |
| `--dim` on bg / panel / panel2 / card | 5.22:1 | 4.76:1 | 4.5:1 |
| `--accent` as text on bg / panel / card | 8.23:1 | 5.25:1 | 4.5:1 |
| `--accent-ink` on `--accent` / `--accent-hi` | 8.41:1 | 5.70:1 | 4.5:1 |
| `--accent` on accent wash (selected chip) | 6.87:1 | 5.05:1 | 4.5:1 |
| `--accent2` on bg | 10.25:1 | 5.02:1 | 4.5:1 |
| Status info/pos/warn/neg/crit on bg / panel / card | 7.28:1 | 5.15:1 | 4.5:1 |
| Status on its own 12% wash (badges) | 6.22:1 | 4.67:1 | 4.5:1 |
| Control boundary `--rf-line-control` | 3.50:1 | 3.05:1 | 3:1 |
| Focus ring `--rf-focus` | 12.17:1 | 7.17:1 | 3:1 |
| Code ink + syntax colors on code bg | 5.80:1 | 4.86:1 | 4.5:1 |
| Spectrum ink — 12 stops on every surface | 8.84:1 | 4.90:1 | 4.5:1 |
| Spectrum vivid — 12 stops on bg | 7.43:1 | 3.20:1 | 3:1 |
| Gallery/surface hue ink on bg / panel | 9.46:1 | 5.16:1 | 4.5:1 |
| Hue ink + `--ink` on the gallery wash (active nav) | 8.53:1 | 4.58:1 | 4.5:1 |
| Gallery vivid index tick on bg | 7.43:1 | 3.20:1 | 3:1 |
| Terminal ANSI text colors + fg on terminal bg | 4.56:1 | 4.60:1 | 4.5:1 |
| Terminal 256 — text tokens, spectrum + gallery ink, ANSI text slots on every 256-color surface | 4.74:1 | 4.53:1 | 4.5:1 |
| Terminal 256 — gallery vivid ticks on every 256-color surface | 5.63:1 | 3.05:1 | 3:1 |
| Terminal 16 — text tokens + spectrum hues in their ANSI slot (Prism scheme) | 4.56:1 | 4.63:1 | 4.5:1 |
| Terminal status bars — light slots on colored fills, dark slots on light fills | 9.67:1 | 4.56:1 | 4.5:1 |
| Stream Deck key text + on-state glyphs | 7.86:1 | 5.07:1 | 4.5:1 |

<details><summary>All 1079 pairs</summary>

| Mode | Group | Foreground | Background | Ratio | Target |
|---|---|---|---|---|---|
| night | Text | --ink `#f0f0f5` | --bg `#0a0c12` | 17.21 | 4.5 |
| night | Text | --muted `#a2a4b4` | --bg `#0a0c12` | 7.92 | 4.5 |
| night | Text | --dim `#8a8c9d` | --bg `#0a0c12` | 5.88 | 4.5 |
| night | Text | --ink `#f0f0f5` | --panel `#10131c` | 16.33 | 4.5 |
| night | Text | --muted `#a2a4b4` | --panel `#10131c` | 7.51 | 4.5 |
| night | Text | --dim `#8a8c9d` | --panel `#10131c` | 5.58 | 4.5 |
| night | Text | --ink `#f0f0f5` | --panel2 `#171a25` | 15.27 | 4.5 |
| night | Text | --muted `#a2a4b4` | --panel2 `#171a25` | 7.02 | 4.5 |
| night | Text | --dim `#8a8c9d` | --panel2 `#171a25` | 5.22 | 4.5 |
| night | Text | --ink `#f0f0f5` | --card `#12151f` | 16.04 | 4.5 |
| night | Text | --muted `#a2a4b4` | --card `#12151f` | 7.38 | 4.5 |
| night | Text | --dim `#8a8c9d` | --card `#12151f` | 5.48 | 4.5 |
| night | Accent | --accent (link/text) `#b8a2f2` | --bg `#0a0c12` | 8.83 | 4.5 |
| night | Accent | --accent (link/text) `#b8a2f2` | --panel `#10131c` | 8.38 | 4.5 |
| night | Accent | --accent (link/text) `#b8a2f2` | --card `#12151f` | 8.23 | 4.5 |
| night | Accent | --accent-ink on --accent `#151021` | --accent `#b8a2f2` | 8.41 | 4.5 |
| night | Accent | --accent-ink on --accent-hi `#151021` | --accent-hi `#cbb9f7` | 10.48 | 4.5 |
| night | Accent | --accent2 `#a8b9fc` | --bg `#0a0c12` | 10.25 | 4.5 |
| night | Accent | --accent on accent-wash (selected chip) `#b8a2f2` | wash/panel `#242436` | 6.87 | 4.5 |
| night | Accent | --ink on accent-wash `#f0f0f5` | wash/panel `#242436` | 13.39 | 4.5 |
| night | Status | --info `#86bdf9` | --bg `#0a0c12` | 9.92 | 4.5 |
| night | Status | --info `#86bdf9` | --panel `#10131c` | 9.42 | 4.5 |
| night | Status | --info `#86bdf9` | --card `#12151f` | 9.25 | 4.5 |
| night | Status | --info on its 12% wash `#86bdf9` | wash/panel `#1e2737` | 7.61 | 4.5 |
| night | Status | --pos `#8bd8ba` | --bg `#0a0c12` | 11.76 | 4.5 |
| night | Status | --pos `#8bd8ba` | --panel `#10131c` | 11.16 | 4.5 |
| night | Status | --pos `#8bd8ba` | --card `#12151f` | 10.96 | 4.5 |
| night | Status | --pos on its 12% wash `#8bd8ba` | wash/panel `#1f2b2f` | 8.74 | 4.5 |
| night | Status | --warn `#eec36f` | --bg `#0a0c12` | 11.80 | 4.5 |
| night | Status | --warn `#eec36f` | --panel `#10131c` | 11.19 | 4.5 |
| night | Status | --warn `#eec36f` | --card `#12151f` | 10.99 | 4.5 |
| night | Status | --warn on its 12% wash `#eec36f` | wash/panel `#2b2826` | 8.83 | 4.5 |
| night | Status | --neg `#f5877f` | --bg `#0a0c12` | 8.06 | 4.5 |
| night | Status | --neg `#f5877f` | --panel `#10131c` | 7.65 | 4.5 |
| night | Status | --neg `#f5877f` | --card `#12151f` | 7.51 | 4.5 |
| night | Status | --neg on its 12% wash `#f5877f` | wash/panel `#2b2128` | 6.41 | 4.5 |
| night | Status | --crit `#f07fb3` | --bg `#0a0c12` | 7.81 | 4.5 |
| night | Status | --crit `#f07fb3` | --panel `#10131c` | 7.41 | 4.5 |
| night | Status | --crit `#f07fb3` | --card `#12151f` | 7.28 | 4.5 |
| night | Status | --crit on its 12% wash `#f07fb3` | wash/panel `#2b202e` | 6.22 | 4.5 |
| night | Non-text | --rf-line-control (control boundary) `#6b6f84` | --bg `#0a0c12` | 3.94 | 3 |
| night | Non-text | --rf-line-control (control boundary) `#6b6f84` | --panel `#10131c` | 3.74 | 3 |
| night | Non-text | --rf-line-control (control boundary) `#6b6f84` | --panel2 `#171a25` | 3.50 | 3 |
| night | Non-text | --rf-line-control (control boundary) `#6b6f84` | --card `#12151f` | 3.67 | 3 |
| night | Non-text | --rf-focus (focus ring) `#d9ccff` | --bg `#0a0c12` | 13.06 | 3 |
| night | Non-text | --rf-focus (focus ring) `#d9ccff` | --panel `#10131c` | 12.40 | 3 |
| night | Non-text | --rf-focus (focus ring) `#d9ccff` | --card `#12151f` | 12.17 | 3 |
| night | Non-text | --accent (fill vs bg) `#b8a2f2` | --bg `#0a0c12` | 8.83 | 3 |
| night | Text | --dim placeholder on input fill (--panel2) `#8a8c9d` | --panel2 `#171a25` | 5.22 | 4.5 |
| night | Code | --rf-code-ink `#d8d1f6` | --rf-code-bg `#0c0e16` | 13.18 | 4.5 |
| night | Code | --rf-syn-keyword `#c2aef8` | --rf-code-bg `#0c0e16` | 9.82 | 4.5 |
| night | Code | --rf-syn-string `#7dd9b2` | --rf-code-bg `#0c0e16` | 11.41 | 4.5 |
| night | Code | --rf-syn-number `#eac779` | --rf-code-bg `#0c0e16` | 11.87 | 4.5 |
| night | Code | --rf-syn-tag `#7fc4fb` | --rf-code-bg `#0c0e16` | 10.27 | 4.5 |
| night | Code | --rf-syn-attr `#ffaa96` | --rf-code-bg `#0c0e16` | 10.50 | 4.5 |
| night | Code | --rf-syn-comment `#8a8c9d` | --rf-code-bg `#0c0e16` | 5.80 | 4.5 |
| night | Spectrum ink | violet ink `#c2aef8` | --bg `#0a0c12` | 9.96 | 4.5 |
| night | Spectrum ink | violet ink `#c2aef8` | --panel `#10131c` | 9.46 | 4.5 |
| night | Spectrum ink | violet ink `#c2aef8` | --panel2 `#171a25` | 8.84 | 4.5 |
| night | Spectrum ink | violet ink `#c2aef8` | --card `#12151f` | 9.29 | 4.5 |
| night | Spectrum vivid | violet vivid `#ab91eb` | --bg `#0a0c12` | 7.43 | 3 |
| night | Spectrum ink | periwinkle ink `#a2b9ff` | --bg `#0a0c12` | 10.17 | 4.5 |
| night | Spectrum ink | periwinkle ink `#a2b9ff` | --panel `#10131c` | 9.65 | 4.5 |
| night | Spectrum ink | periwinkle ink `#a2b9ff` | --panel2 `#171a25` | 9.02 | 4.5 |
| night | Spectrum ink | periwinkle ink `#a2b9ff` | --card `#12151f` | 9.47 | 4.5 |
| night | Spectrum vivid | periwinkle vivid `#839ef4` | --bg `#0a0c12` | 7.60 | 3 |
| night | Spectrum ink | azure ink `#7fc4fb` | --bg `#0a0c12` | 10.42 | 4.5 |
| night | Spectrum ink | azure ink `#7fc4fb` | --panel `#10131c` | 9.89 | 4.5 |
| night | Spectrum ink | azure ink `#7fc4fb` | --panel2 `#171a25` | 9.24 | 4.5 |
| night | Spectrum ink | azure ink `#7fc4fb` | --card `#12151f` | 9.71 | 4.5 |
| night | Spectrum vivid | azure vivid `#52acee` | --bg `#0a0c12` | 7.91 | 3 |
| night | Spectrum ink | cerulean ink `#64ceea` | --bg `#0a0c12` | 10.76 | 4.5 |
| night | Spectrum ink | cerulean ink `#64ceea` | --panel `#10131c` | 10.21 | 4.5 |
| night | Spectrum ink | cerulean ink `#64ceea` | --panel2 `#171a25` | 9.55 | 4.5 |
| night | Spectrum ink | cerulean ink `#64ceea` | --card `#12151f` | 10.03 | 4.5 |
| night | Spectrum vivid | cerulean vivid `#00b8db` | --bg `#0a0c12` | 8.27 | 3 |
| night | Spectrum ink | cyan ink `#61d5d0` | --bg `#0a0c12` | 11.11 | 4.5 |
| night | Spectrum ink | cyan ink `#61d5d0` | --panel `#10131c` | 10.55 | 4.5 |
| night | Spectrum ink | cyan ink `#61d5d0` | --panel2 `#171a25` | 9.86 | 4.5 |
| night | Spectrum ink | cyan ink `#61d5d0` | --card `#12151f` | 10.35 | 4.5 |
| night | Spectrum vivid | cyan vivid `#00c3be` | --bg `#0a0c12` | 8.89 | 3 |
| night | Spectrum ink | mint ink `#7dd9b2` | --bg `#0a0c12` | 11.58 | 4.5 |
| night | Spectrum ink | mint ink `#7dd9b2` | --panel `#10131c` | 10.99 | 4.5 |
| night | Spectrum ink | mint ink `#7dd9b2` | --panel2 `#171a25` | 10.27 | 4.5 |
| night | Spectrum ink | mint ink `#7dd9b2` | --card `#12151f` | 10.79 | 4.5 |
| night | Spectrum vivid | mint vivid `#52cea0` | --bg `#0a0c12` | 9.96 | 3 |
| night | Spectrum ink | jade ink `#a5d996` | --bg `#0a0c12` | 12.07 | 4.5 |
| night | Spectrum ink | jade ink `#a5d996` | --panel `#10131c` | 11.45 | 4.5 |
| night | Spectrum ink | jade ink `#a5d996` | --panel2 `#171a25` | 10.71 | 4.5 |
| night | Spectrum ink | jade ink `#a5d996` | --card `#12151f` | 11.25 | 4.5 |
| night | Spectrum vivid | jade vivid `#94d582` | --bg `#0a0c12` | 11.26 | 3 |
| night | Spectrum ink | lime ink `#ccd381` | --bg `#0a0c12` | 12.29 | 4.5 |
| night | Spectrum ink | lime ink `#ccd381` | --panel `#10131c` | 11.66 | 4.5 |
| night | Spectrum ink | lime ink `#ccd381` | --panel2 `#171a25` | 10.90 | 4.5 |
| night | Spectrum ink | lime ink `#ccd381` | --card `#12151f` | 11.45 | 4.5 |
| night | Spectrum vivid | lime vivid `#c9d168` | --bg `#0a0c12` | 11.92 | 3 |
| night | Spectrum ink | citrine ink `#eac779` | --bg `#0a0c12` | 12.05 | 4.5 |
| night | Spectrum ink | citrine ink `#eac779` | --panel `#10131c` | 11.44 | 4.5 |
| night | Spectrum ink | citrine ink `#eac779` | --panel2 `#171a25` | 10.69 | 4.5 |
| night | Spectrum ink | citrine ink `#eac779` | --card `#12151f` | 11.23 | 4.5 |
| night | Spectrum vivid | citrine vivid `#ebc059` | --bg `#0a0c12` | 11.37 | 3 |
| night | Spectrum ink | amber ink `#fab880` | --bg `#0a0c12` | 11.39 | 4.5 |
| night | Spectrum ink | amber ink `#fab880` | --panel `#10131c` | 10.81 | 4.5 |
| night | Spectrum ink | amber ink `#fab880` | --panel2 `#171a25` | 10.10 | 4.5 |
| night | Spectrum ink | amber ink `#fab880` | --card `#12151f` | 10.61 | 4.5 |
| night | Spectrum vivid | amber vivid `#f8a75f` | --bg `#0a0c12` | 9.95 | 3 |
| night | Spectrum ink | coral ink `#ffaa96` | --bg `#0a0c12` | 10.65 | 4.5 |
| night | Spectrum ink | coral ink `#ffaa96` | --panel `#10131c` | 10.11 | 4.5 |
| night | Spectrum ink | coral ink `#ffaa96` | --panel2 `#171a25` | 9.45 | 4.5 |
| night | Spectrum ink | coral ink `#ffaa96` | --card `#12151f` | 9.93 | 4.5 |
| night | Spectrum vivid | coral vivid `#f69077` | --bg `#0a0c12` | 8.54 | 3 |
| night | Spectrum ink | rose ink `#faa2b2` | --bg `#0a0c12` | 10.12 | 4.5 |
| night | Spectrum ink | rose ink `#faa2b2` | --panel `#10131c` | 9.61 | 4.5 |
| night | Spectrum ink | rose ink `#faa2b2` | --panel2 `#171a25` | 8.98 | 4.5 |
| night | Spectrum ink | rose ink `#faa2b2` | --card `#12151f` | 9.43 | 4.5 |
| night | Spectrum vivid | rose vivid `#ec8398` | --bg `#0a0c12` | 7.70 | 3 |
| night | Gallery hue | charts ink `#c2aef8` | --bg `#0a0c12` | 9.96 | 4.5 |
| night | Gallery hue | charts ink `#c2aef8` | --panel `#10131c` | 9.46 | 4.5 |
| night | Gallery wash | charts ink on own wash `#c2aef8` | hue wash `#1d1c2c` | 8.53 | 4.5 |
| night | Gallery wash | --ink on charts wash `#f0f0f5` | hue wash `#1d1c2c` | 14.73 | 4.5 |
| night | Gallery tick | charts vivid index tick `#ab91eb` | --bg `#0a0c12` | 7.43 | 3 |
| night | Gallery hue | fx ink `#adb5ff` | --bg `#0a0c12` | 10.08 | 4.5 |
| night | Gallery hue | fx ink `#adb5ff` | --panel `#10131c` | 9.57 | 4.5 |
| night | Gallery wash | fx ink on own wash `#adb5ff` | hue wash `#1a1d2d` | 8.61 | 4.5 |
| night | Gallery wash | --ink on fx wash `#f0f0f5` | hue wash `#1a1d2d` | 14.70 | 4.5 |
| night | Gallery tick | fx vivid index tick `#9299f3` | --bg `#0a0c12` | 7.52 | 3 |
| night | Gallery hue | lab ink `#98bcff` | --bg `#0a0c12` | 10.21 | 4.5 |
| night | Gallery hue | lab ink `#98bcff` | --panel `#10131c` | 9.69 | 4.5 |
| night | Gallery wash | lab ink on own wash `#98bcff` | hue wash `#171e2d` | 8.71 | 4.5 |
| night | Gallery wash | --ink on lab wash `#f0f0f5` | hue wash `#171e2d` | 14.67 | 4.5 |
| night | Gallery tick | lab vivid index tick `#76a2f4` | --bg `#0a0c12` | 7.68 | 3 |
| night | Gallery hue | ai ink `#81c4fc` | --bg `#0a0c12` | 10.46 | 4.5 |
| night | Gallery hue | ai ink `#81c4fc` | --panel `#10131c` | 9.93 | 4.5 |
| night | Gallery wash | ai ink on own wash `#81c4fc` | hue wash `#131f2d` | 8.91 | 4.5 |
| night | Gallery wash | --ink on ai wash `#f0f0f5` | hue wash `#131f2d` | 14.65 | 4.5 |
| night | Gallery tick | ai vivid index tick `#55abef` | --bg `#0a0c12` | 7.87 | 3 |
| night | Gallery hue | objects ink `#6dcaf2` | --bg `#0a0c12` | 10.59 | 4.5 |
| night | Gallery hue | objects ink `#6dcaf2` | --panel `#10131c` | 10.05 | 4.5 |
| night | Gallery wash | objects ink on own wash `#6dcaf2` | hue wash `#0e202b` | 9.03 | 4.5 |
| night | Gallery wash | --ink on objects wash `#f0f0f5` | hue wash `#0e202b` | 14.67 | 4.5 |
| night | Gallery tick | objects vivid index tick `#2cb3e4` | --bg `#0a0c12` | 8.08 | 3 |
| night | Gallery hue | input ink `#60d0e4` | --bg `#0a0c12` | 10.84 | 4.5 |
| night | Gallery hue | input ink `#60d0e4` | --panel `#10131c` | 10.28 | 4.5 |
| night | Gallery wash | input ink on own wash `#60d0e4` | hue wash `#092129` | 9.23 | 4.5 |
| night | Gallery wash | --ink on input wash `#f0f0f5` | hue wash `#092129` | 14.66 | 4.5 |
| night | Gallery tick | input vivid index tick `#00bbd3` | --bg `#0a0c12` | 8.42 | 3 |
| night | Gallery hue | text ink `#60d4d3` | --bg `#0a0c12` | 11.04 | 4.5 |
| night | Gallery hue | text ink `#60d4d3` | --panel `#10131c` | 10.47 | 4.5 |
| night | Gallery wash | text ink on own wash `#60d4d3` | hue wash `#092227` | 9.34 | 4.5 |
| night | Gallery wash | --ink on text wash `#f0f0f5` | hue wash `#092227` | 14.56 | 4.5 |
| night | Gallery tick | text vivid index tick `#00c2c1` | --bg `#0a0c12` | 8.83 | 3 |
| night | Gallery hue | shapes ink `#6dd7c0` | --bg `#0a0c12` | 11.29 | 4.5 |
| night | Gallery hue | shapes ink `#6dd7c0` | --panel `#10131c` | 10.72 | 4.5 |
| night | Gallery wash | shapes ink on own wash `#6dd7c0` | hue wash `#0e2325` | 9.44 | 4.5 |
| night | Gallery wash | --ink on shapes wash `#f0f0f5` | hue wash `#0e2325` | 14.38 | 4.5 |
| night | Gallery tick | shapes vivid index tick `#2ec9ae` | --bg `#0a0c12` | 9.39 | 3 |
| night | Gallery hue | maps ink `#83d9ad` | --bg `#0a0c12` | 11.63 | 4.5 |
| night | Gallery hue | maps ink `#83d9ad` | --panel `#10131c` | 11.04 | 4.5 |
| night | Gallery wash | maps ink on own wash `#83d9ad` | hue wash `#142422` | 9.57 | 4.5 |
| night | Gallery wash | --ink on maps wash `#f0f0f5` | hue wash `#142422` | 14.16 | 4.5 |
| night | Gallery tick | maps vivid index tick `#5fd09a` | --bg `#0a0c12` | 10.22 | 3 |
| night | Gallery hue | notify ink `#9ed99b` | --bg `#0a0c12` | 11.96 | 4.5 |
| night | Gallery hue | notify ink `#9ed99b` | --panel `#10131c` | 11.35 | 4.5 |
| night | Gallery wash | notify ink on own wash `#9ed99b` | hue wash `#192420` | 9.78 | 4.5 |
| night | Gallery wash | --ink on notify wash `#f0f0f5` | hue wash `#192420` | 14.06 | 4.5 |
| night | Gallery tick | notify vivid index tick `#89d487` | --bg `#0a0c12` | 11.01 | 3 |
| night | Gallery hue | arch ink `#b8d78b` | --bg `#0a0c12` | 12.22 | 4.5 |
| night | Gallery hue | arch ink `#b8d78b` | --panel `#10131c` | 11.60 | 4.5 |
| night | Gallery wash | arch ink on own wash `#b8d78b` | hue wash `#1e241e` | 9.90 | 4.5 |
| night | Gallery wash | --ink on arch wash `#f0f0f5` | hue wash `#1e241e` | 13.94 | 4.5 |
| night | Gallery tick | arch vivid index tick `#afd575` | --bg `#0a0c12` | 11.73 | 3 |
| night | Gallery hue | callouts ink `#d0d280` | --bg `#0a0c12` | 12.30 | 4.5 |
| night | Gallery hue | callouts ink `#d0d280` | --panel `#10131c` | 11.67 | 4.5 |
| night | Gallery wash | callouts ink on own wash `#d0d280` | hue wash `#22241c` | 9.88 | 4.5 |
| night | Gallery wash | --ink on callouts wash `#f0f0f5` | hue wash `#22241c` | 13.83 | 4.5 |
| night | Gallery tick | callouts vivid index tick `#ced065` | --bg `#0a0c12` | 11.95 | 3 |
| night | Gallery hue | obsidian ink `#e4cb79` | --bg `#0a0c12` | 12.21 | 4.5 |
| night | Gallery hue | obsidian ink `#e4cb79` | --panel `#10131c` | 11.59 | 4.5 |
| night | Gallery wash | obsidian ink on own wash `#e4cb79` | hue wash `#24221b` | 9.94 | 4.5 |
| night | Gallery wash | --ink on obsidian wash `#f0f0f5` | hue wash `#24221b` | 14.01 | 4.5 |
| night | Gallery tick | obsidian vivid index tick `#e5c55b` | --bg `#0a0c12` | 11.61 | 3 |
| night | Gallery hue | menus ink `#f2c17a` | --bg `#0a0c12` | 11.81 | 4.5 |
| night | Gallery hue | menus ink `#f2c17a` | --panel `#10131c` | 11.21 | 4.5 |
| night | Gallery wash | menus ink on own wash `#f2c17a` | hue wash `#26201b` | 9.72 | 4.5 |
| night | Gallery wash | --ink on menus wash `#f0f0f5` | hue wash `#26201b` | 14.17 | 4.5 |
| night | Gallery tick | menus vivid index tick `#f3b659` | --bg `#0a0c12` | 10.84 | 3 |
| night | Gallery hue | spectrums ink `#fbb781` | --bg `#0a0c12` | 11.35 | 4.5 |
| night | Gallery hue | spectrums ink `#fbb781` | --panel `#10131c` | 10.77 | 4.5 |
| night | Gallery wash | spectrums ink on own wash `#fbb781` | hue wash `#271e1b` | 9.47 | 4.5 |
| night | Gallery wash | --ink on spectrums wash `#f0f0f5` | hue wash `#271e1b` | 14.36 | 4.5 |
| night | Gallery tick | spectrums vivid index tick `#f8a560` | --bg `#0a0c12` | 9.81 | 3 |
| night | Gallery hue | idea ink `#ffae8e` | --bg `#0a0c12` | 10.89 | 4.5 |
| night | Gallery hue | idea ink `#ffae8e` | --panel `#10131c` | 10.33 | 4.5 |
| night | Gallery wash | idea ink on own wash `#ffae8e` | hue wash `#271c1d` | 9.21 | 4.5 |
| night | Gallery wash | --ink on idea wash `#f0f0f5` | hue wash `#271c1d` | 14.56 | 4.5 |
| night | Gallery tick | idea vivid index tick `#f8956f` | --bg `#0a0c12` | 8.86 | 3 |
| night | Gallery hue | mobile ink `#fea69f` | --bg `#0a0c12` | 10.40 | 4.5 |
| night | Gallery hue | mobile ink `#fea69f` | --panel `#10131c` | 9.87 | 4.5 |
| night | Gallery wash | mobile ink on own wash `#fea69f` | hue wash `#261b1f` | 8.87 | 4.5 |
| night | Gallery wash | --ink on mobile wash `#f0f0f5` | hue wash `#261b1f` | 14.68 | 4.5 |
| night | Gallery tick | mobile vivid index tick `#f48a82` | --bg `#0a0c12` | 8.20 | 3 |
| night | Gallery hue | desktop ink `#faa2b2` | --bg `#0a0c12` | 10.12 | 4.5 |
| night | Gallery hue | desktop ink `#faa2b2` | --panel `#10131c` | 9.61 | 4.5 |
| night | Gallery wash | desktop ink on own wash `#faa2b2` | hue wash `#251a22` | 8.70 | 4.5 |
| night | Gallery wash | --ink on desktop wash `#f0f0f5` | hue wash `#251a22` | 14.80 | 4.5 |
| night | Gallery tick | desktop vivid index tick `#ec8398` | --bg `#0a0c12` | 7.70 | 3 |
| night | Gallery hue | web ink `#c2aef8` | --bg `#0a0c12` | 9.96 | 4.5 |
| night | Gallery hue | web ink `#c2aef8` | --panel `#10131c` | 9.46 | 4.5 |
| night | Gallery wash | web ink on own wash `#c2aef8` | hue wash `#1d1c2c` | 8.53 | 4.5 |
| night | Gallery wash | --ink on web wash `#f0f0f5` | hue wash `#1d1c2c` | 14.73 | 4.5 |
| night | Gallery tick | web vivid index tick `#ab91eb` | --bg `#0a0c12` | 7.43 | 3 |
| night | Gallery hue | terminal ink `#80d9b0` | --bg `#0a0c12` | 11.61 | 4.5 |
| night | Gallery hue | terminal ink `#80d9b0` | --panel `#10131c` | 11.02 | 4.5 |
| night | Gallery wash | terminal ink on own wash `#80d9b0` | hue wash `#132323` | 9.65 | 4.5 |
| night | Gallery wash | --ink on terminal wash `#f0f0f5` | hue wash `#132323` | 14.31 | 4.5 |
| night | Gallery tick | terminal vivid index tick `#58cf9d` | --bg `#0a0c12` | 10.08 | 3 |
| night | Gallery hue | deck ink `#f8bb7e` | --bg `#0a0c12` | 11.54 | 4.5 |
| night | Gallery hue | deck ink `#f8bb7e` | --panel `#10131c` | 10.96 | 4.5 |
| night | Gallery wash | deck ink on own wash `#f8bb7e` | hue wash `#261f1b` | 9.58 | 4.5 |
| night | Gallery wash | --ink on deck wash `#f0f0f5` | hue wash `#261f1b` | 14.28 | 4.5 |
| night | Gallery tick | deck vivid index tick `#f7ac5c` | --bg `#0a0c12` | 10.25 | 3 |
| night | Terminal | ANSI 1 red `#f28885` | term bg `#0a0c12` | 8.04 | 4.5 |
| night | Terminal | ANSI 2 green `#7ad59c` | term bg `#0a0c12` | 11.01 | 4.5 |
| night | Terminal | ANSI 3 yellow `#ecca76` | term bg `#0a0c12` | 12.36 | 4.5 |
| night | Terminal | ANSI 4 blue `#81aaf7` | term bg `#0a0c12` | 8.40 | 4.5 |
| night | Terminal | ANSI 5 magenta `#b8a2f2` | term bg `#0a0c12` | 8.83 | 4.5 |
| night | Terminal | ANSI 6 cyan `#67cfe3` | term bg `#0a0c12` | 10.81 | 4.5 |
| night | Terminal | ANSI 7 white `#c6c7d3` | term bg `#0a0c12` | 11.65 | 4.5 |
| night | Terminal | ANSI 8 brightBlack `#76798e` | term bg `#0a0c12` | 4.56 | 4.5 |
| night | Terminal | ANSI 9 brightRed `#ffaaa7` | term bg `#0a0c12` | 10.76 | 4.5 |
| night | Terminal | ANSI 10 brightGreen `#a5eac1` | term bg `#0a0c12` | 14.09 | 4.5 |
| night | Terminal | ANSI 11 brightYellow `#f7e59f` | term bg `#0a0c12` | 15.51 | 4.5 |
| night | Terminal | ANSI 12 brightBlue `#aac8ff` | term bg `#0a0c12` | 11.56 | 4.5 |
| night | Terminal | ANSI 13 brightMagenta `#d9c6fe` | term bg `#0a0c12` | 12.53 | 4.5 |
| night | Terminal | ANSI 14 brightCyan `#9eeaf2` | term bg `#0a0c12` | 14.43 | 4.5 |
| night | Terminal | ANSI 15 brightWhite `#f6f6fb` | term bg `#0a0c12` | 18.15 | 4.5 |
| night | Terminal status bar | ANSI 7 white on 0 black `#c6c7d3` | ANSI 0 fill `#1d202b` | 9.67 | 4.5 |
| night | Terminal status bar | ANSI 15 brightWhite on 0 black `#f6f6fb` | ANSI 0 fill `#1d202b` | 15.07 | 4.5 |
| night | Terminal | foreground `#e6e6ef` | term bg `#0a0c12` | 15.76 | 4.5 |
| night | Terminal 256 | --ink → 255 `#eeeeee` | term bg `#0a0c12` | 16.85 | 4.5 |
| night | Terminal 256 | --ink → 255 `#eeeeee` | 256 surface 232 `#080808` | 17.26 | 4.5 |
| night | Terminal 256 | --ink → 255 `#eeeeee` | 256 surface 233 `#121212` | 16.15 | 4.5 |
| night | Terminal 256 | --ink → 255 `#eeeeee` | 256 surface 234 `#1c1c1c` | 14.69 | 4.5 |
| night | Terminal 256 | --muted → 248 `#a8a8a8` | term bg `#0a0c12` | 8.22 | 4.5 |
| night | Terminal 256 | --muted → 248 `#a8a8a8` | 256 surface 232 `#080808` | 8.42 | 4.5 |
| night | Terminal 256 | --muted → 248 `#a8a8a8` | 256 surface 233 `#121212` | 7.88 | 4.5 |
| night | Terminal 256 | --muted → 248 `#a8a8a8` | 256 surface 234 `#1c1c1c` | 7.17 | 4.5 |
| night | Terminal 256 | --dim → 245 `#8a8a8a` | term bg `#0a0c12` | 5.66 | 4.5 |
| night | Terminal 256 | --dim → 245 `#8a8a8a` | 256 surface 232 `#080808` | 5.80 | 4.5 |
| night | Terminal 256 | --dim → 245 `#8a8a8a` | 256 surface 233 `#121212` | 5.43 | 4.5 |
| night | Terminal 256 | --dim → 245 `#8a8a8a` | 256 surface 234 `#1c1c1c` | 4.94 | 4.5 |
| night | Terminal 256 | --accent → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | --accent → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | --accent → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | --accent → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 | --accent2 → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | --accent2 → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | --accent2 → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | --accent2 → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 | --info → 111 `#87afff` | term bg `#0a0c12` | 8.94 | 4.5 |
| night | Terminal 256 | --info → 111 `#87afff` | 256 surface 232 `#080808` | 9.16 | 4.5 |
| night | Terminal 256 | --info → 111 `#87afff` | 256 surface 233 `#121212` | 8.57 | 4.5 |
| night | Terminal 256 | --info → 111 `#87afff` | 256 surface 234 `#1c1c1c` | 7.80 | 4.5 |
| night | Terminal 256 | --pos → 115 `#87d7af` | term bg `#0a0c12` | 11.51 | 4.5 |
| night | Terminal 256 | --pos → 115 `#87d7af` | 256 surface 232 `#080808` | 11.80 | 4.5 |
| night | Terminal 256 | --pos → 115 `#87d7af` | 256 surface 233 `#121212` | 11.03 | 4.5 |
| night | Terminal 256 | --pos → 115 `#87d7af` | 256 surface 234 `#1c1c1c` | 10.04 | 4.5 |
| night | Terminal 256 | --warn → 215 `#ffaf5f` | term bg `#0a0c12` | 10.75 | 4.5 |
| night | Terminal 256 | --warn → 215 `#ffaf5f` | 256 surface 232 `#080808` | 11.01 | 4.5 |
| night | Terminal 256 | --warn → 215 `#ffaf5f` | 256 surface 233 `#121212` | 10.30 | 4.5 |
| night | Terminal 256 | --warn → 215 `#ffaf5f` | 256 surface 234 `#1c1c1c` | 9.37 | 4.5 |
| night | Terminal 256 | --neg → 210 `#ff8787` | term bg `#0a0c12` | 8.44 | 4.5 |
| night | Terminal 256 | --neg → 210 `#ff8787` | 256 surface 232 `#080808` | 8.65 | 4.5 |
| night | Terminal 256 | --neg → 210 `#ff8787` | 256 surface 233 `#121212` | 8.09 | 4.5 |
| night | Terminal 256 | --neg → 210 `#ff8787` | 256 surface 234 `#1c1c1c` | 7.36 | 4.5 |
| night | Terminal 256 | --crit → 211 `#ff87af` | term bg `#0a0c12` | 8.69 | 4.5 |
| night | Terminal 256 | --crit → 211 `#ff87af` | 256 surface 232 `#080808` | 8.90 | 4.5 |
| night | Terminal 256 | --crit → 211 `#ff87af` | 256 surface 233 `#121212` | 8.33 | 4.5 |
| night | Terminal 256 | --crit → 211 `#ff87af` | 256 surface 234 `#1c1c1c` | 7.58 | 4.5 |
| night | Terminal 256 | violet ink → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | violet ink → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | violet ink → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | violet ink → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 | periwinkle ink → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | periwinkle ink → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | periwinkle ink → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | periwinkle ink → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 | azure ink → 117 `#87d7ff` | term bg `#0a0c12` | 12.28 | 4.5 |
| night | Terminal 256 | azure ink → 117 `#87d7ff` | 256 surface 232 `#080808` | 12.58 | 4.5 |
| night | Terminal 256 | azure ink → 117 `#87d7ff` | 256 surface 233 `#121212` | 11.77 | 4.5 |
| night | Terminal 256 | azure ink → 117 `#87d7ff` | 256 surface 234 `#1c1c1c` | 10.71 | 4.5 |
| night | Terminal 256 | cerulean ink → 81 `#5fd7ff` | term bg `#0a0c12` | 11.78 | 4.5 |
| night | Terminal 256 | cerulean ink → 81 `#5fd7ff` | 256 surface 232 `#080808` | 12.06 | 4.5 |
| night | Terminal 256 | cerulean ink → 81 `#5fd7ff` | 256 surface 233 `#121212` | 11.29 | 4.5 |
| night | Terminal 256 | cerulean ink → 81 `#5fd7ff` | 256 surface 234 `#1c1c1c` | 10.27 | 4.5 |
| night | Terminal 256 | cyan ink → 80 `#5fd7d7` | term bg `#0a0c12` | 11.35 | 4.5 |
| night | Terminal 256 | cyan ink → 80 `#5fd7d7` | 256 surface 232 `#080808` | 11.62 | 4.5 |
| night | Terminal 256 | cyan ink → 80 `#5fd7d7` | 256 surface 233 `#121212` | 10.87 | 4.5 |
| night | Terminal 256 | cyan ink → 80 `#5fd7d7` | 256 surface 234 `#1c1c1c` | 9.89 | 4.5 |
| night | Terminal 256 | mint ink → 115 `#87d7af` | term bg `#0a0c12` | 11.51 | 4.5 |
| night | Terminal 256 | mint ink → 115 `#87d7af` | 256 surface 232 `#080808` | 11.80 | 4.5 |
| night | Terminal 256 | mint ink → 115 `#87d7af` | 256 surface 233 `#121212` | 11.03 | 4.5 |
| night | Terminal 256 | mint ink → 115 `#87d7af` | 256 surface 234 `#1c1c1c` | 10.04 | 4.5 |
| night | Terminal 256 | jade ink → 150 `#afd787` | term bg `#0a0c12` | 12.00 | 4.5 |
| night | Terminal 256 | jade ink → 150 `#afd787` | 256 surface 232 `#080808` | 12.30 | 4.5 |
| night | Terminal 256 | jade ink → 150 `#afd787` | 256 surface 233 `#121212` | 11.50 | 4.5 |
| night | Terminal 256 | jade ink → 150 `#afd787` | 256 surface 234 `#1c1c1c` | 10.46 | 4.5 |
| night | Terminal 256 | lime ink → 186 `#d7d787` | term bg `#0a0c12` | 12.99 | 4.5 |
| night | Terminal 256 | lime ink → 186 `#d7d787` | 256 surface 232 `#080808` | 13.31 | 4.5 |
| night | Terminal 256 | lime ink → 186 `#d7d787` | 256 surface 233 `#121212` | 12.45 | 4.5 |
| night | Terminal 256 | lime ink → 186 `#d7d787` | 256 surface 234 `#1c1c1c` | 11.33 | 4.5 |
| night | Terminal 256 | citrine ink → 186 `#d7d787` | term bg `#0a0c12` | 12.99 | 4.5 |
| night | Terminal 256 | citrine ink → 186 `#d7d787` | 256 surface 232 `#080808` | 13.31 | 4.5 |
| night | Terminal 256 | citrine ink → 186 `#d7d787` | 256 surface 233 `#121212` | 12.45 | 4.5 |
| night | Terminal 256 | citrine ink → 186 `#d7d787` | 256 surface 234 `#1c1c1c` | 11.33 | 4.5 |
| night | Terminal 256 | amber ink → 216 `#ffaf87` | term bg `#0a0c12` | 10.92 | 4.5 |
| night | Terminal 256 | amber ink → 216 `#ffaf87` | 256 surface 232 `#080808` | 11.19 | 4.5 |
| night | Terminal 256 | amber ink → 216 `#ffaf87` | 256 surface 233 `#121212` | 10.47 | 4.5 |
| night | Terminal 256 | amber ink → 216 `#ffaf87` | 256 surface 234 `#1c1c1c` | 9.52 | 4.5 |
| night | Terminal 256 | coral ink → 216 `#ffaf87` | term bg `#0a0c12` | 10.92 | 4.5 |
| night | Terminal 256 | coral ink → 216 `#ffaf87` | 256 surface 232 `#080808` | 11.19 | 4.5 |
| night | Terminal 256 | coral ink → 216 `#ffaf87` | 256 surface 233 `#121212` | 10.47 | 4.5 |
| night | Terminal 256 | coral ink → 216 `#ffaf87` | 256 surface 234 `#1c1c1c` | 9.52 | 4.5 |
| night | Terminal 256 | rose ink → 217 `#ffafaf` | term bg `#0a0c12` | 11.17 | 4.5 |
| night | Terminal 256 | rose ink → 217 `#ffafaf` | 256 surface 232 `#080808` | 11.45 | 4.5 |
| night | Terminal 256 | rose ink → 217 `#ffafaf` | 256 surface 233 `#121212` | 10.71 | 4.5 |
| night | Terminal 256 | rose ink → 217 `#ffafaf` | 256 surface 234 `#1c1c1c` | 9.74 | 4.5 |
| night | Terminal 256 | fx ink → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | fx ink → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | fx ink → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | fx ink → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 tick | fx vivid → 105 `#8787ff` | term bg `#0a0c12` | 6.46 | 3 |
| night | Terminal 256 tick | fx vivid → 105 `#8787ff` | 256 surface 232 `#080808` | 6.62 | 3 |
| night | Terminal 256 tick | fx vivid → 105 `#8787ff` | 256 surface 233 `#121212` | 6.19 | 3 |
| night | Terminal 256 tick | fx vivid → 105 `#8787ff` | 256 surface 234 `#1c1c1c` | 5.63 | 3 |
| night | Terminal 256 | objects ink → 81 `#5fd7ff` | term bg `#0a0c12` | 11.78 | 4.5 |
| night | Terminal 256 | objects ink → 81 `#5fd7ff` | 256 surface 232 `#080808` | 12.06 | 4.5 |
| night | Terminal 256 | objects ink → 81 `#5fd7ff` | 256 surface 233 `#121212` | 11.29 | 4.5 |
| night | Terminal 256 | objects ink → 81 `#5fd7ff` | 256 surface 234 `#1c1c1c` | 10.27 | 4.5 |
| night | Terminal 256 tick | objects vivid → 38 `#00afd7` | term bg `#0a0c12` | 7.55 | 3 |
| night | Terminal 256 tick | objects vivid → 38 `#00afd7` | 256 surface 232 `#080808` | 7.74 | 3 |
| night | Terminal 256 tick | objects vivid → 38 `#00afd7` | 256 surface 233 `#121212` | 7.24 | 3 |
| night | Terminal 256 tick | objects vivid → 38 `#00afd7` | 256 surface 234 `#1c1c1c` | 6.58 | 3 |
| night | Terminal 256 | sim ink → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | sim ink → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | sim ink → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | sim ink → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 tick | sim vivid → 111 `#87afff` | term bg `#0a0c12` | 8.94 | 3 |
| night | Terminal 256 tick | sim vivid → 111 `#87afff` | 256 surface 232 `#080808` | 9.16 | 3 |
| night | Terminal 256 tick | sim vivid → 111 `#87afff` | 256 surface 233 `#121212` | 8.57 | 3 |
| night | Terminal 256 tick | sim vivid → 111 `#87afff` | 256 surface 234 `#1c1c1c` | 7.80 | 3 |
| night | Terminal 256 | retro ink → 81 `#5fd7ff` | term bg `#0a0c12` | 11.78 | 4.5 |
| night | Terminal 256 | retro ink → 81 `#5fd7ff` | 256 surface 232 `#080808` | 12.06 | 4.5 |
| night | Terminal 256 | retro ink → 81 `#5fd7ff` | 256 surface 233 `#121212` | 11.29 | 4.5 |
| night | Terminal 256 | retro ink → 81 `#5fd7ff` | 256 surface 234 `#1c1c1c` | 10.27 | 4.5 |
| night | Terminal 256 tick | retro vivid → 38 `#00afd7` | term bg `#0a0c12` | 7.55 | 3 |
| night | Terminal 256 tick | retro vivid → 38 `#00afd7` | 256 surface 232 `#080808` | 7.74 | 3 |
| night | Terminal 256 tick | retro vivid → 38 `#00afd7` | 256 surface 233 `#121212` | 7.24 | 3 |
| night | Terminal 256 tick | retro vivid → 38 `#00afd7` | 256 surface 234 `#1c1c1c` | 6.58 | 3 |
| night | Terminal 256 | text ink → 80 `#5fd7d7` | term bg `#0a0c12` | 11.35 | 4.5 |
| night | Terminal 256 | text ink → 80 `#5fd7d7` | 256 surface 232 `#080808` | 11.62 | 4.5 |
| night | Terminal 256 | text ink → 80 `#5fd7d7` | 256 surface 233 `#121212` | 10.87 | 4.5 |
| night | Terminal 256 | text ink → 80 `#5fd7d7` | 256 surface 234 `#1c1c1c` | 9.89 | 4.5 |
| night | Terminal 256 tick | text vivid → 37 `#00afaf` | term bg `#0a0c12` | 7.22 | 3 |
| night | Terminal 256 tick | text vivid → 37 `#00afaf` | 256 surface 232 `#080808` | 7.39 | 3 |
| night | Terminal 256 tick | text vivid → 37 `#00afaf` | 256 surface 233 `#121212` | 6.91 | 3 |
| night | Terminal 256 tick | text vivid → 37 `#00afaf` | 256 surface 234 `#1c1c1c` | 6.29 | 3 |
| night | Terminal 256 | loaders ink → 115 `#87d7af` | term bg `#0a0c12` | 11.51 | 4.5 |
| night | Terminal 256 | loaders ink → 115 `#87d7af` | 256 surface 232 `#080808` | 11.80 | 4.5 |
| night | Terminal 256 | loaders ink → 115 `#87d7af` | 256 surface 233 `#121212` | 11.03 | 4.5 |
| night | Terminal 256 | loaders ink → 115 `#87d7af` | 256 surface 234 `#1c1c1c` | 10.04 | 4.5 |
| night | Terminal 256 tick | loaders vivid → 43 `#00d7af` | term bg `#0a0c12` | 10.56 | 3 |
| night | Terminal 256 tick | loaders vivid → 43 `#00d7af` | 256 surface 232 `#080808` | 10.81 | 3 |
| night | Terminal 256 tick | loaders vivid → 43 `#00d7af` | 256 surface 233 `#121212` | 10.12 | 3 |
| night | Terminal 256 tick | loaders vivid → 43 `#00d7af` | 256 surface 234 `#1c1c1c` | 9.20 | 3 |
| night | Terminal 256 | progress ink → 150 `#afd787` | term bg `#0a0c12` | 12.00 | 4.5 |
| night | Terminal 256 | progress ink → 150 `#afd787` | 256 surface 232 `#080808` | 12.30 | 4.5 |
| night | Terminal 256 | progress ink → 150 `#afd787` | 256 surface 233 `#121212` | 11.50 | 4.5 |
| night | Terminal 256 | progress ink → 150 `#afd787` | 256 surface 234 `#1c1c1c` | 10.46 | 4.5 |
| night | Terminal 256 tick | progress vivid → 114 `#87d787` | term bg `#0a0c12` | 11.26 | 3 |
| night | Terminal 256 tick | progress vivid → 114 `#87d787` | 256 surface 232 `#080808` | 11.54 | 3 |
| night | Terminal 256 tick | progress vivid → 114 `#87d787` | 256 surface 233 `#121212` | 10.79 | 3 |
| night | Terminal 256 tick | progress vivid → 114 `#87d787` | 256 surface 234 `#1c1c1c` | 9.82 | 3 |
| night | Terminal 256 | charts ink → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | charts ink → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | charts ink → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | charts ink → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 tick | charts vivid → 140 `#af87d7` | term bg `#0a0c12` | 6.77 | 3 |
| night | Terminal 256 tick | charts vivid → 140 `#af87d7` | 256 surface 232 `#080808` | 6.93 | 3 |
| night | Terminal 256 tick | charts vivid → 140 `#af87d7` | 256 surface 233 `#121212` | 6.49 | 3 |
| night | Terminal 256 tick | charts vivid → 140 `#af87d7` | 256 surface 234 `#1c1c1c` | 5.90 | 3 |
| night | Terminal 256 | ai ink → 117 `#87d7ff` | term bg `#0a0c12` | 12.28 | 4.5 |
| night | Terminal 256 | ai ink → 117 `#87d7ff` | 256 surface 232 `#080808` | 12.58 | 4.5 |
| night | Terminal 256 | ai ink → 117 `#87d7ff` | 256 surface 233 `#121212` | 11.77 | 4.5 |
| night | Terminal 256 | ai ink → 117 `#87d7ff` | 256 surface 234 `#1c1c1c` | 10.71 | 4.5 |
| night | Terminal 256 tick | ai vivid → 75 `#5fafff` | term bg `#0a0c12` | 8.44 | 3 |
| night | Terminal 256 tick | ai vivid → 75 `#5fafff` | 256 surface 232 `#080808` | 8.64 | 3 |
| night | Terminal 256 tick | ai vivid → 75 `#5fafff` | 256 surface 233 `#121212` | 8.08 | 3 |
| night | Terminal 256 tick | ai vivid → 75 `#5fafff` | 256 surface 234 `#1c1c1c` | 7.35 | 3 |
| night | Terminal 256 | status ink → 150 `#afd787` | term bg `#0a0c12` | 12.00 | 4.5 |
| night | Terminal 256 | status ink → 150 `#afd787` | 256 surface 232 `#080808` | 12.30 | 4.5 |
| night | Terminal 256 | status ink → 150 `#afd787` | 256 surface 233 `#121212` | 11.50 | 4.5 |
| night | Terminal 256 | status ink → 150 `#afd787` | 256 surface 234 `#1c1c1c` | 10.46 | 4.5 |
| night | Terminal 256 tick | status vivid → 114 `#87d787` | term bg `#0a0c12` | 11.26 | 3 |
| night | Terminal 256 tick | status vivid → 114 `#87d787` | 256 surface 232 `#080808` | 11.54 | 3 |
| night | Terminal 256 tick | status vivid → 114 `#87d787` | 256 surface 233 `#121212` | 10.79 | 3 |
| night | Terminal 256 tick | status vivid → 114 `#87d787` | 256 surface 234 `#1c1c1c` | 9.82 | 3 |
| night | Terminal 256 | ops ink → 186 `#d7d787` | term bg `#0a0c12` | 12.99 | 4.5 |
| night | Terminal 256 | ops ink → 186 `#d7d787` | 256 surface 232 `#080808` | 13.31 | 4.5 |
| night | Terminal 256 | ops ink → 186 `#d7d787` | 256 surface 233 `#121212` | 12.45 | 4.5 |
| night | Terminal 256 | ops ink → 186 `#d7d787` | 256 surface 234 `#1c1c1c` | 11.33 | 4.5 |
| night | Terminal 256 tick | ops vivid → 215 `#ffaf5f` | term bg `#0a0c12` | 10.75 | 3 |
| night | Terminal 256 tick | ops vivid → 215 `#ffaf5f` | 256 surface 232 `#080808` | 11.01 | 3 |
| night | Terminal 256 tick | ops vivid → 215 `#ffaf5f` | 256 surface 233 `#121212` | 10.30 | 3 |
| night | Terminal 256 tick | ops vivid → 215 `#ffaf5f` | 256 surface 234 `#1c1c1c` | 9.37 | 3 |
| night | Terminal 256 | diagrams ink → 150 `#afd787` | term bg `#0a0c12` | 12.00 | 4.5 |
| night | Terminal 256 | diagrams ink → 150 `#afd787` | 256 surface 232 `#080808` | 12.30 | 4.5 |
| night | Terminal 256 | diagrams ink → 150 `#afd787` | 256 surface 233 `#121212` | 11.50 | 4.5 |
| night | Terminal 256 | diagrams ink → 150 `#afd787` | 256 surface 234 `#1c1c1c` | 10.46 | 4.5 |
| night | Terminal 256 tick | diagrams vivid → 150 `#afd787` | term bg `#0a0c12` | 12.00 | 3 |
| night | Terminal 256 tick | diagrams vivid → 150 `#afd787` | 256 surface 232 `#080808` | 12.30 | 3 |
| night | Terminal 256 tick | diagrams vivid → 150 `#afd787` | 256 surface 233 `#121212` | 11.50 | 3 |
| night | Terminal 256 tick | diagrams vivid → 150 `#afd787` | 256 surface 234 `#1c1c1c` | 10.46 | 3 |
| night | Terminal 256 | callouts ink → 186 `#d7d787` | term bg `#0a0c12` | 12.99 | 4.5 |
| night | Terminal 256 | callouts ink → 186 `#d7d787` | 256 surface 232 `#080808` | 13.31 | 4.5 |
| night | Terminal 256 | callouts ink → 186 `#d7d787` | 256 surface 233 `#121212` | 12.45 | 4.5 |
| night | Terminal 256 | callouts ink → 186 `#d7d787` | 256 surface 234 `#1c1c1c` | 11.33 | 4.5 |
| night | Terminal 256 tick | callouts vivid → 185 `#d7d75f` | term bg `#0a0c12` | 12.82 | 3 |
| night | Terminal 256 tick | callouts vivid → 185 `#d7d75f` | 256 surface 232 `#080808` | 13.14 | 3 |
| night | Terminal 256 tick | callouts vivid → 185 `#d7d75f` | 256 surface 233 `#121212` | 12.29 | 3 |
| night | Terminal 256 tick | callouts vivid → 185 `#d7d75f` | 256 surface 234 `#1c1c1c` | 11.18 | 3 |
| night | Terminal 256 | input ink → 80 `#5fd7d7` | term bg `#0a0c12` | 11.35 | 4.5 |
| night | Terminal 256 | input ink → 80 `#5fd7d7` | 256 surface 232 `#080808` | 11.62 | 4.5 |
| night | Terminal 256 | input ink → 80 `#5fd7d7` | 256 surface 233 `#121212` | 10.87 | 4.5 |
| night | Terminal 256 | input ink → 80 `#5fd7d7` | 256 surface 234 `#1c1c1c` | 9.89 | 4.5 |
| night | Terminal 256 tick | input vivid → 38 `#00afd7` | term bg `#0a0c12` | 7.55 | 3 |
| night | Terminal 256 tick | input vivid → 38 `#00afd7` | 256 surface 232 `#080808` | 7.74 | 3 |
| night | Terminal 256 tick | input vivid → 38 `#00afd7` | 256 surface 233 `#121212` | 7.24 | 3 |
| night | Terminal 256 tick | input vivid → 38 `#00afd7` | 256 surface 234 `#1c1c1c` | 6.58 | 3 |
| night | Terminal 256 | maps ink → 115 `#87d7af` | term bg `#0a0c12` | 11.51 | 4.5 |
| night | Terminal 256 | maps ink → 115 `#87d7af` | 256 surface 232 `#080808` | 11.80 | 4.5 |
| night | Terminal 256 | maps ink → 115 `#87d7af` | 256 surface 233 `#121212` | 11.03 | 4.5 |
| night | Terminal 256 | maps ink → 115 `#87d7af` | 256 surface 234 `#1c1c1c` | 10.04 | 4.5 |
| night | Terminal 256 tick | maps vivid → 79 `#5fd7af` | term bg `#0a0c12` | 11.01 | 3 |
| night | Terminal 256 tick | maps vivid → 79 `#5fd7af` | 256 surface 232 `#080808` | 11.28 | 3 |
| night | Terminal 256 tick | maps vivid → 79 `#5fd7af` | 256 surface 233 `#121212` | 10.55 | 3 |
| night | Terminal 256 tick | maps vivid → 79 `#5fd7af` | 256 surface 234 `#1c1c1c` | 9.60 | 3 |
| night | Terminal 256 | lab ink → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | lab ink → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | lab ink → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | lab ink → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 tick | lab vivid → 75 `#5fafff` | term bg `#0a0c12` | 8.44 | 3 |
| night | Terminal 256 tick | lab vivid → 75 `#5fafff` | 256 surface 232 `#080808` | 8.64 | 3 |
| night | Terminal 256 tick | lab vivid → 75 `#5fafff` | 256 surface 233 `#121212` | 8.08 | 3 |
| night | Terminal 256 tick | lab vivid → 75 `#5fafff` | 256 surface 234 `#1c1c1c` | 7.35 | 3 |
| night | Terminal 256 | ascii ink → 216 `#ffaf87` | term bg `#0a0c12` | 10.92 | 4.5 |
| night | Terminal 256 | ascii ink → 216 `#ffaf87` | 256 surface 232 `#080808` | 11.19 | 4.5 |
| night | Terminal 256 | ascii ink → 216 `#ffaf87` | 256 surface 233 `#121212` | 10.47 | 4.5 |
| night | Terminal 256 | ascii ink → 216 `#ffaf87` | 256 surface 234 `#1c1c1c` | 9.52 | 4.5 |
| night | Terminal 256 tick | ascii vivid → 209 `#ff875f` | term bg `#0a0c12` | 8.27 | 3 |
| night | Terminal 256 tick | ascii vivid → 209 `#ff875f` | 256 surface 232 `#080808` | 8.47 | 3 |
| night | Terminal 256 tick | ascii vivid → 209 `#ff875f` | 256 surface 233 `#121212` | 7.92 | 3 |
| night | Terminal 256 tick | ascii vivid → 209 `#ff875f` | 256 surface 234 `#1c1c1c` | 7.21 | 3 |
| night | Terminal 256 | ANSI 1 red → 210 `#ff8787` | term bg `#0a0c12` | 8.44 | 4.5 |
| night | Terminal 256 | ANSI 1 red → 210 `#ff8787` | 256 surface 232 `#080808` | 8.65 | 4.5 |
| night | Terminal 256 | ANSI 1 red → 210 `#ff8787` | 256 surface 233 `#121212` | 8.09 | 4.5 |
| night | Terminal 256 | ANSI 1 red → 210 `#ff8787` | 256 surface 234 `#1c1c1c` | 7.36 | 4.5 |
| night | Terminal 256 | ANSI 2 green → 79 `#5fd7af` | term bg `#0a0c12` | 11.01 | 4.5 |
| night | Terminal 256 | ANSI 2 green → 79 `#5fd7af` | 256 surface 232 `#080808` | 11.28 | 4.5 |
| night | Terminal 256 | ANSI 2 green → 79 `#5fd7af` | 256 surface 233 `#121212` | 10.55 | 4.5 |
| night | Terminal 256 | ANSI 2 green → 79 `#5fd7af` | 256 surface 234 `#1c1c1c` | 9.60 | 4.5 |
| night | Terminal 256 | ANSI 3 yellow → 186 `#d7d787` | term bg `#0a0c12` | 12.99 | 4.5 |
| night | Terminal 256 | ANSI 3 yellow → 186 `#d7d787` | 256 surface 232 `#080808` | 13.31 | 4.5 |
| night | Terminal 256 | ANSI 3 yellow → 186 `#d7d787` | 256 surface 233 `#121212` | 12.45 | 4.5 |
| night | Terminal 256 | ANSI 3 yellow → 186 `#d7d787` | 256 surface 234 `#1c1c1c` | 11.33 | 4.5 |
| night | Terminal 256 | ANSI 4 blue → 111 `#87afff` | term bg `#0a0c12` | 8.94 | 4.5 |
| night | Terminal 256 | ANSI 4 blue → 111 `#87afff` | 256 surface 232 `#080808` | 9.16 | 4.5 |
| night | Terminal 256 | ANSI 4 blue → 111 `#87afff` | 256 surface 233 `#121212` | 8.57 | 4.5 |
| night | Terminal 256 | ANSI 4 blue → 111 `#87afff` | 256 surface 234 `#1c1c1c` | 7.80 | 4.5 |
| night | Terminal 256 | ANSI 5 magenta → 147 `#afafff` | term bg `#0a0c12` | 9.68 | 4.5 |
| night | Terminal 256 | ANSI 5 magenta → 147 `#afafff` | 256 surface 232 `#080808` | 9.92 | 4.5 |
| night | Terminal 256 | ANSI 5 magenta → 147 `#afafff` | 256 surface 233 `#121212` | 9.28 | 4.5 |
| night | Terminal 256 | ANSI 5 magenta → 147 `#afafff` | 256 surface 234 `#1c1c1c` | 8.44 | 4.5 |
| night | Terminal 256 | ANSI 6 cyan → 80 `#5fd7d7` | term bg `#0a0c12` | 11.35 | 4.5 |
| night | Terminal 256 | ANSI 6 cyan → 80 `#5fd7d7` | 256 surface 232 `#080808` | 11.62 | 4.5 |
| night | Terminal 256 | ANSI 6 cyan → 80 `#5fd7d7` | 256 surface 233 `#121212` | 10.87 | 4.5 |
| night | Terminal 256 | ANSI 6 cyan → 80 `#5fd7d7` | 256 surface 234 `#1c1c1c` | 9.89 | 4.5 |
| night | Terminal 256 | ANSI 7 white → 251 `#c6c6c6` | term bg `#0a0c12` | 11.44 | 4.5 |
| night | Terminal 256 | ANSI 7 white → 251 `#c6c6c6` | 256 surface 232 `#080808` | 11.72 | 4.5 |
| night | Terminal 256 | ANSI 7 white → 251 `#c6c6c6` | 256 surface 233 `#121212` | 10.97 | 4.5 |
| night | Terminal 256 | ANSI 7 white → 251 `#c6c6c6` | 256 surface 234 `#1c1c1c` | 9.98 | 4.5 |
| night | Terminal 256 | ANSI 8 brightBlack → 102 `#878787` | term bg `#0a0c12` | 5.44 | 4.5 |
| night | Terminal 256 | ANSI 8 brightBlack → 102 `#878787` | 256 surface 232 `#080808` | 5.57 | 4.5 |
| night | Terminal 256 | ANSI 8 brightBlack → 102 `#878787` | 256 surface 233 `#121212` | 5.21 | 4.5 |
| night | Terminal 256 | ANSI 8 brightBlack → 102 `#878787` | 256 surface 234 `#1c1c1c` | 4.74 | 4.5 |
| night | Terminal 256 | ANSI 9 brightRed → 217 `#ffafaf` | term bg `#0a0c12` | 11.17 | 4.5 |
| night | Terminal 256 | ANSI 9 brightRed → 217 `#ffafaf` | 256 surface 232 `#080808` | 11.45 | 4.5 |
| night | Terminal 256 | ANSI 9 brightRed → 217 `#ffafaf` | 256 surface 233 `#121212` | 10.71 | 4.5 |
| night | Terminal 256 | ANSI 9 brightRed → 217 `#ffafaf` | 256 surface 234 `#1c1c1c` | 9.74 | 4.5 |
| night | Terminal 256 | ANSI 10 brightGreen → 151 `#afd7af` | term bg `#0a0c12` | 12.25 | 4.5 |
| night | Terminal 256 | ANSI 10 brightGreen → 151 `#afd7af` | 256 surface 232 `#080808` | 12.55 | 4.5 |
| night | Terminal 256 | ANSI 10 brightGreen → 151 `#afd7af` | 256 surface 233 `#121212` | 11.74 | 4.5 |
| night | Terminal 256 | ANSI 10 brightGreen → 151 `#afd7af` | 256 surface 234 `#1c1c1c` | 10.68 | 4.5 |
| night | Terminal 256 | ANSI 11 brightYellow → 222 `#ffd787` | term bg `#0a0c12` | 14.26 | 4.5 |
| night | Terminal 256 | ANSI 11 brightYellow → 222 `#ffd787` | 256 surface 232 `#080808` | 14.61 | 4.5 |
| night | Terminal 256 | ANSI 11 brightYellow → 222 `#ffd787` | 256 surface 233 `#121212` | 13.67 | 4.5 |
| night | Terminal 256 | ANSI 11 brightYellow → 222 `#ffd787` | 256 surface 234 `#1c1c1c` | 12.43 | 4.5 |
| night | Terminal 256 | ANSI 12 brightBlue → 153 `#afd7ff` | term bg `#0a0c12` | 13.02 | 4.5 |
| night | Terminal 256 | ANSI 12 brightBlue → 153 `#afd7ff` | 256 surface 232 `#080808` | 13.34 | 4.5 |
| night | Terminal 256 | ANSI 12 brightBlue → 153 `#afd7ff` | 256 surface 233 `#121212` | 12.48 | 4.5 |
| night | Terminal 256 | ANSI 12 brightBlue → 153 `#afd7ff` | 256 surface 234 `#1c1c1c` | 11.35 | 4.5 |
| night | Terminal 256 | ANSI 13 brightMagenta → 189 `#d7d7ff` | term bg `#0a0c12` | 14.01 | 4.5 |
| night | Terminal 256 | ANSI 13 brightMagenta → 189 `#d7d7ff` | 256 surface 232 `#080808` | 14.36 | 4.5 |
| night | Terminal 256 | ANSI 13 brightMagenta → 189 `#d7d7ff` | 256 surface 233 `#121212` | 13.43 | 4.5 |
| night | Terminal 256 | ANSI 13 brightMagenta → 189 `#d7d7ff` | 256 surface 234 `#1c1c1c` | 12.22 | 4.5 |
| night | Terminal 256 | ANSI 14 brightCyan → 152 `#afd7d7` | term bg `#0a0c12` | 12.59 | 4.5 |
| night | Terminal 256 | ANSI 14 brightCyan → 152 `#afd7d7` | 256 surface 232 `#080808` | 12.90 | 4.5 |
| night | Terminal 256 | ANSI 14 brightCyan → 152 `#afd7d7` | 256 surface 233 `#121212` | 12.06 | 4.5 |
| night | Terminal 256 | ANSI 14 brightCyan → 152 `#afd7d7` | 256 surface 234 `#1c1c1c` | 10.98 | 4.5 |
| night | Terminal 256 | ANSI 15 brightWhite → 231 `#ffffff` | term bg `#0a0c12` | 19.55 | 4.5 |
| night | Terminal 256 | ANSI 15 brightWhite → 231 `#ffffff` | 256 surface 232 `#080808` | 20.03 | 4.5 |
| night | Terminal 256 | ANSI 15 brightWhite → 231 `#ffffff` | 256 surface 233 `#121212` | 18.73 | 4.5 |
| night | Terminal 256 | ANSI 15 brightWhite → 231 `#ffffff` | 256 surface 234 `#1c1c1c` | 17.04 | 4.5 |
| night | Terminal 16 | --ink → slot -1 `#e6e6ef` | term bg `#0a0c12` | 15.76 | 4.5 |
| night | Terminal 16 | --muted → slot 7 `#c6c7d3` | term bg `#0a0c12` | 11.65 | 4.5 |
| night | Terminal 16 | --dim → slot 8 `#76798e` | term bg `#0a0c12` | 4.56 | 4.5 |
| night | Terminal 16 | --accent → slot 5 `#b8a2f2` | term bg `#0a0c12` | 8.83 | 4.5 |
| night | Terminal 16 | --accent2 → slot 12 `#aac8ff` | term bg `#0a0c12` | 11.56 | 4.5 |
| night | Terminal 16 | --info → slot 4 `#81aaf7` | term bg `#0a0c12` | 8.40 | 4.5 |
| night | Terminal 16 | --pos → slot 2 `#7ad59c` | term bg `#0a0c12` | 11.01 | 4.5 |
| night | Terminal 16 | --warn → slot 3 `#ecca76` | term bg `#0a0c12` | 12.36 | 4.5 |
| night | Terminal 16 | --neg → slot 1 `#f28885` | term bg `#0a0c12` | 8.04 | 4.5 |
| night | Terminal 16 | --crit → slot 13 `#d9c6fe` | term bg `#0a0c12` | 12.53 | 4.5 |
| night | Terminal 16 | violet → slot 5 `#b8a2f2` | term bg `#0a0c12` | 8.83 | 4.5 |
| night | Terminal 16 | periwinkle → slot 4 `#81aaf7` | term bg `#0a0c12` | 8.40 | 4.5 |
| night | Terminal 16 | azure → slot 4 `#81aaf7` | term bg `#0a0c12` | 8.40 | 4.5 |
| night | Terminal 16 | cerulean → slot 6 `#67cfe3` | term bg `#0a0c12` | 10.81 | 4.5 |
| night | Terminal 16 | cyan → slot 6 `#67cfe3` | term bg `#0a0c12` | 10.81 | 4.5 |
| night | Terminal 16 | mint → slot 2 `#7ad59c` | term bg `#0a0c12` | 11.01 | 4.5 |
| night | Terminal 16 | jade → slot 2 `#7ad59c` | term bg `#0a0c12` | 11.01 | 4.5 |
| night | Terminal 16 | lime → slot 10 `#a5eac1` | term bg `#0a0c12` | 14.09 | 4.5 |
| night | Terminal 16 | citrine → slot 3 `#ecca76` | term bg `#0a0c12` | 12.36 | 4.5 |
| night | Terminal 16 | amber → slot 3 `#ecca76` | term bg `#0a0c12` | 12.36 | 4.5 |
| night | Terminal 16 | coral → slot 1 `#f28885` | term bg `#0a0c12` | 8.04 | 4.5 |
| night | Terminal 16 | rose → slot 13 `#d9c6fe` | term bg `#0a0c12` | 12.53 | 4.5 |
| night | Terminal | selection fg on selection bg `#f0f0f5` | selection `#2e2748` | 12.33 | 4.5 |
| night | Deck | key label --ink `#f0f0f5` | key fill `#0b0d14` | 17.09 | 4.5 |
| night | Deck | key label --muted `#a2a4b4` | key fill `#0b0d14` | 7.86 | 4.5 |
| night | Deck | on-state glyph charts `#c2aef8` | key fill `#0b0d14` | 9.89 | 4.5 |
| night | Deck | on-state glyph fx `#adb5ff` | key fill `#0b0d14` | 10.01 | 4.5 |
| night | Deck | on-state glyph lab `#98bcff` | key fill `#0b0d14` | 10.14 | 4.5 |
| night | Deck | on-state glyph ai `#81c4fc` | key fill `#0b0d14` | 10.38 | 4.5 |
| night | Deck | on-state glyph objects `#6dcaf2` | key fill `#0b0d14` | 10.52 | 4.5 |
| night | Deck | on-state glyph input `#60d0e4` | key fill `#0b0d14` | 10.76 | 4.5 |
| night | Deck | on-state glyph text `#60d4d3` | key fill `#0b0d14` | 10.96 | 4.5 |
| night | Deck | on-state glyph shapes `#6dd7c0` | key fill `#0b0d14` | 11.21 | 4.5 |
| night | Deck | on-state glyph maps `#83d9ad` | key fill `#0b0d14` | 11.55 | 4.5 |
| night | Deck | on-state glyph notify `#9ed99b` | key fill `#0b0d14` | 11.88 | 4.5 |
| night | Deck | on-state glyph arch `#b8d78b` | key fill `#0b0d14` | 12.14 | 4.5 |
| night | Deck | on-state glyph callouts `#d0d280` | key fill `#0b0d14` | 12.21 | 4.5 |
| night | Deck | on-state glyph obsidian `#e4cb79` | key fill `#0b0d14` | 12.12 | 4.5 |
| night | Deck | on-state glyph menus `#f2c17a` | key fill `#0b0d14` | 11.72 | 4.5 |
| night | Deck | on-state glyph spectrums `#fbb781` | key fill `#0b0d14` | 11.27 | 4.5 |
| night | Deck | on-state glyph idea `#ffae8e` | key fill `#0b0d14` | 10.81 | 4.5 |
| night | Deck | on-state glyph mobile `#fea69f` | key fill `#0b0d14` | 10.32 | 4.5 |
| night | Deck | on-state glyph desktop `#faa2b2` | key fill `#0b0d14` | 10.05 | 4.5 |
| day | Text | --ink `#20202e` | --bg `#f6f5f9` | 14.80 | 4.5 |
| day | Text | --muted `#55556a` | --bg `#f6f5f9` | 6.69 | 4.5 |
| day | Text | --dim `#68687c` | --bg `#f6f5f9` | 5.01 | 4.5 |
| day | Text | --ink `#20202e` | --panel `#ffffff` | 16.06 | 4.5 |
| day | Text | --muted `#55556a` | --panel `#ffffff` | 7.26 | 4.5 |
| day | Text | --dim `#68687c` | --panel `#ffffff` | 5.44 | 4.5 |
| day | Text | --ink `#20202e` | --panel2 `#f0eff6` | 14.06 | 4.5 |
| day | Text | --muted `#55556a` | --panel2 `#f0eff6` | 6.35 | 4.5 |
| day | Text | --dim `#68687c` | --panel2 `#f0eff6` | 4.76 | 4.5 |
| day | Text | --ink `#20202e` | --card `#fdfcff` | 15.71 | 4.5 |
| day | Text | --muted `#55556a` | --card `#fdfcff` | 7.10 | 4.5 |
| day | Text | --dim `#68687c` | --card `#fdfcff` | 5.32 | 4.5 |
| day | Accent | --accent (link/text) `#7353bb` | --bg `#f6f5f9` | 5.25 | 4.5 |
| day | Accent | --accent (link/text) `#7353bb` | --panel `#ffffff` | 5.70 | 4.5 |
| day | Accent | --accent (link/text) `#7353bb` | --card `#fdfcff` | 5.58 | 4.5 |
| day | Accent | --accent-ink on --accent `#ffffff` | --accent `#7353bb` | 5.70 | 4.5 |
| day | Accent | --accent-ink on --accent-hi `#ffffff` | --accent-hi `#6142aa` | 7.32 | 4.5 |
| day | Accent | --accent2 `#4a62c6` | --bg `#f6f5f9` | 5.02 | 4.5 |
| day | Accent | --accent on accent-wash (selected chip) `#7353bb` | wash/panel `#f2f0f9` | 5.05 | 4.5 |
| day | Accent | --ink on accent-wash `#20202e` | wash/panel `#f2f0f9` | 14.23 | 4.5 |
| day | Status | --info `#2461bf` | --bg `#f6f5f9` | 5.47 | 4.5 |
| day | Status | --info `#2461bf` | --panel `#ffffff` | 5.94 | 4.5 |
| day | Status | --info `#2461bf` | --card `#fdfcff` | 5.81 | 4.5 |
| day | Status | --info on its 12% wash `#2461bf` | wash/panel `#e5ecf7` | 5.00 | 4.5 |
| day | Status | --pos `#1f6b4f` | --bg `#f6f5f9` | 5.91 | 4.5 |
| day | Status | --pos `#1f6b4f` | --panel `#ffffff` | 6.41 | 4.5 |
| day | Status | --pos `#1f6b4f` | --card `#fdfcff` | 6.27 | 4.5 |
| day | Status | --pos on its 12% wash `#1f6b4f` | wash/panel `#e4edea` | 5.38 | 4.5 |
| day | Status | --warn `#8a5a00` | --bg `#f6f5f9` | 5.46 | 4.5 |
| day | Status | --warn `#8a5a00` | --panel `#ffffff` | 5.93 | 4.5 |
| day | Status | --warn `#8a5a00` | --card `#fdfcff` | 5.80 | 4.5 |
| day | Status | --warn on its 12% wash `#8a5a00` | wash/panel `#f1ebe0` | 5.00 | 4.5 |
| day | Status | --neg `#bf3434` | --bg `#f6f5f9` | 5.15 | 4.5 |
| day | Status | --neg `#bf3434` | --panel `#ffffff` | 5.59 | 4.5 |
| day | Status | --neg `#bf3434` | --card `#fdfcff` | 5.47 | 4.5 |
| day | Status | --neg on its 12% wash `#bf3434` | wash/panel `#f7e7e7` | 4.67 | 4.5 |
| day | Status | --crit `#b0256f` | --bg `#f6f5f9` | 5.79 | 4.5 |
| day | Status | --crit `#b0256f` | --panel `#ffffff` | 6.29 | 4.5 |
| day | Status | --crit `#b0256f` | --card `#fdfcff` | 6.15 | 4.5 |
| day | Status | --crit on its 12% wash `#b0256f` | wash/panel `#f6e5ee` | 5.20 | 4.5 |
| day | Non-text | --rf-line-control (control boundary) `#8a879d` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Non-text | --rf-line-control (control boundary) `#8a879d` | --panel `#ffffff` | 3.48 | 3 |
| day | Non-text | --rf-line-control (control boundary) `#8a879d` | --panel2 `#f0eff6` | 3.05 | 3 |
| day | Non-text | --rf-line-control (control boundary) `#8a879d` | --card `#fdfcff` | 3.41 | 3 |
| day | Non-text | --rf-focus (focus ring) `#5b3ea8` | --bg `#f6f5f9` | 7.17 | 3 |
| day | Non-text | --rf-focus (focus ring) `#5b3ea8` | --panel `#ffffff` | 7.78 | 3 |
| day | Non-text | --rf-focus (focus ring) `#5b3ea8` | --card `#fdfcff` | 7.61 | 3 |
| day | Non-text | --accent (fill vs bg) `#7353bb` | --bg `#f6f5f9` | 5.25 | 3 |
| day | Text | --dim placeholder on input fill (--panel2) `#68687c` | --panel2 `#f0eff6` | 4.76 | 4.5 |
| day | Code | --rf-code-ink `#3b2f6b` | --rf-code-bg `#f3f1f9` | 10.39 | 4.5 |
| day | Code | --rf-syn-keyword `#7555b8` | --rf-code-bg `#f3f1f9` | 5.01 | 4.5 |
| day | Code | --rf-syn-string `#007655` | --rf-code-bg `#f3f1f9` | 5.04 | 4.5 |
| day | Code | --rf-syn-number `#9c5600` | --rf-code-bg `#f3f1f9` | 5.01 | 4.5 |
| day | Code | --rf-syn-tag `#006ca9` | --rf-code-bg `#f3f1f9` | 5.05 | 4.5 |
| day | Code | --rf-syn-attr `#b2432a` | --rf-code-bg `#f3f1f9` | 5.03 | 4.5 |
| day | Code | --rf-syn-comment `#68687c` | --rf-code-bg `#f3f1f9` | 4.86 | 4.5 |
| day | Spectrum ink | violet ink `#7555b8` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Spectrum ink | violet ink `#7555b8` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Spectrum ink | violet ink `#7555b8` | --panel2 `#f0eff6` | 4.90 | 4.5 |
| day | Spectrum ink | violet ink `#7555b8` | --card `#fdfcff` | 5.48 | 4.5 |
| day | Spectrum vivid | violet vivid `#9876e3` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Spectrum ink | periwinkle ink `#4961bf` | --bg `#f6f5f9` | 5.17 | 4.5 |
| day | Spectrum ink | periwinkle ink `#4961bf` | --panel `#ffffff` | 5.61 | 4.5 |
| day | Spectrum ink | periwinkle ink `#4961bf` | --panel2 `#f0eff6` | 4.91 | 4.5 |
| day | Spectrum ink | periwinkle ink `#4961bf` | --card `#fdfcff` | 5.49 | 4.5 |
| day | Spectrum vivid | periwinkle vivid `#6783ec` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Spectrum ink | azure ink `#006ca9` | --bg `#f6f5f9` | 5.20 | 4.5 |
| day | Spectrum ink | azure ink `#006ca9` | --panel `#ffffff` | 5.65 | 4.5 |
| day | Spectrum ink | azure ink `#006ca9` | --panel2 `#f0eff6` | 4.94 | 4.5 |
| day | Spectrum ink | azure ink `#006ca9` | --card `#fdfcff` | 5.53 | 4.5 |
| day | Spectrum vivid | azure vivid `#0090de` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Spectrum ink | cerulean ink `#007188` | --bg `#f6f5f9` | 5.20 | 4.5 |
| day | Spectrum ink | cerulean ink `#007188` | --panel `#ffffff` | 5.65 | 4.5 |
| day | Spectrum ink | cerulean ink `#007188` | --panel2 `#f0eff6` | 4.94 | 4.5 |
| day | Spectrum ink | cerulean ink `#007188` | --card `#fdfcff` | 5.53 | 4.5 |
| day | Spectrum vivid | cerulean vivid `#0096b3` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Spectrum ink | cyan ink `#007471` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Spectrum ink | cyan ink `#007471` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Spectrum ink | cyan ink `#007471` | --panel2 `#f0eff6` | 4.92 | 4.5 |
| day | Spectrum ink | cyan ink `#007471` | --card `#fdfcff` | 5.50 | 4.5 |
| day | Spectrum vivid | cyan vivid `#009995` | --bg `#f6f5f9` | 3.23 | 3 |
| day | Spectrum ink | mint ink `#007655` | --bg `#f6f5f9` | 5.20 | 4.5 |
| day | Spectrum ink | mint ink `#007655` | --panel `#ffffff` | 5.64 | 4.5 |
| day | Spectrum ink | mint ink `#007655` | --panel2 `#f0eff6` | 4.94 | 4.5 |
| day | Spectrum ink | mint ink `#007655` | --card `#fdfcff` | 5.52 | 4.5 |
| day | Spectrum vivid | mint vivid `#009c71` | --bg `#f6f5f9` | 3.23 | 3 |
| day | Spectrum ink | jade ink `#2e760f` | --bg `#f6f5f9` | 5.21 | 4.5 |
| day | Spectrum ink | jade ink `#2e760f` | --panel `#ffffff` | 5.65 | 4.5 |
| day | Spectrum ink | jade ink `#2e760f` | --panel2 `#f0eff6` | 4.95 | 4.5 |
| day | Spectrum ink | jade ink `#2e760f` | --card `#fdfcff` | 5.53 | 4.5 |
| day | Spectrum vivid | jade vivid `#4c9b32` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Spectrum ink | lime ink `#686c00` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Spectrum ink | lime ink `#686c00` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Spectrum ink | lime ink `#686c00` | --panel2 `#f0eff6` | 4.92 | 4.5 |
| day | Spectrum ink | lime ink `#686c00` | --card `#fdfcff` | 5.50 | 4.5 |
| day | Spectrum vivid | lime vivid `#8a8f00` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Spectrum ink | citrine ink `#836300` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Spectrum ink | citrine ink `#836300` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Spectrum ink | citrine ink `#836300` | --panel2 `#f0eff6` | 4.90 | 4.5 |
| day | Spectrum ink | citrine ink `#836300` | --card `#fdfcff` | 5.48 | 4.5 |
| day | Spectrum vivid | citrine vivid `#ac8300` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Spectrum ink | amber ink `#9c5600` | --bg `#f6f5f9` | 5.17 | 4.5 |
| day | Spectrum ink | amber ink `#9c5600` | --panel `#ffffff` | 5.61 | 4.5 |
| day | Spectrum ink | amber ink `#9c5600` | --panel2 `#f0eff6` | 4.91 | 4.5 |
| day | Spectrum ink | amber ink `#9c5600` | --card `#fdfcff` | 5.49 | 4.5 |
| day | Spectrum vivid | amber vivid `#cc7300` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Spectrum ink | coral ink `#b2432a` | --bg `#f6f5f9` | 5.19 | 4.5 |
| day | Spectrum ink | coral ink `#b2432a` | --panel `#ffffff` | 5.63 | 4.5 |
| day | Spectrum ink | coral ink `#b2432a` | --panel2 `#f0eff6` | 4.93 | 4.5 |
| day | Spectrum ink | coral ink `#b2432a` | --card `#fdfcff` | 5.51 | 4.5 |
| day | Spectrum vivid | coral vivid `#de6448` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Spectrum ink | rose ink `#b13f5d` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Spectrum ink | rose ink `#b13f5d` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Spectrum ink | rose ink `#b13f5d` | --panel2 `#f0eff6` | 4.92 | 4.5 |
| day | Spectrum ink | rose ink `#b13f5d` | --card `#fdfcff` | 5.50 | 4.5 |
| day | Spectrum vivid | rose vivid `#de5f7d` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Gallery hue | charts ink `#7555b8` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Gallery hue | charts ink `#7555b8` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Gallery wash | charts ink on own wash `#7555b8` | hue wash `#ebe5ff` | 4.58 | 4.5 |
| day | Gallery wash | --ink on charts wash `#20202e` | hue wash `#ebe5ff` | 13.14 | 4.5 |
| day | Gallery tick | charts vivid index tick `#9876e3` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | fx ink `#5b5cbe` | --bg `#f6f5f9` | 5.20 | 4.5 |
| day | Gallery hue | fx ink `#5b5cbe` | --panel `#ffffff` | 5.65 | 4.5 |
| day | Gallery wash | fx ink on own wash `#5b5cbe` | hue wash `#e4e8ff` | 4.65 | 4.5 |
| day | Gallery wash | --ink on fx wash `#20202e` | hue wash `#e4e8ff` | 13.22 | 4.5 |
| day | Gallery tick | fx vivid index tick `#7a7eeb` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Gallery hue | lab ink `#3664be` | --bg `#f6f5f9` | 5.20 | 4.5 |
| day | Gallery hue | lab ink `#3664be` | --panel `#ffffff` | 5.64 | 4.5 |
| day | Gallery wash | lab ink on own wash `#3664be` | hue wash `#deeaff` | 4.65 | 4.5 |
| day | Gallery wash | --ink on lab wash `#20202e` | hue wash `#deeaff` | 13.25 | 4.5 |
| day | Gallery tick | lab vivid index tick `#5487eb` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Gallery hue | ai ink `#006cad` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Gallery hue | ai ink `#006cad` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Gallery wash | ai ink on own wash `#006cad` | hue wash `#d8edff` | 4.66 | 4.5 |
| day | Gallery wash | --ink on ai wash `#20202e` | hue wash `#d8edff` | 13.37 | 4.5 |
| day | Gallery tick | ai vivid index tick `#008fe2` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | objects ink `#007093` | --bg `#f6f5f9` | 5.17 | 4.5 |
| day | Gallery hue | objects ink `#007093` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Gallery wash | objects ink on own wash `#007093` | hue wash `#cfefff` | 4.67 | 4.5 |
| day | Gallery wash | --ink on objects wash `#20202e` | hue wash `#cfefff` | 13.34 | 4.5 |
| day | Gallery tick | objects vivid index tick `#0094c1` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Gallery hue | input ink `#007282` | --bg `#f6f5f9` | 5.19 | 4.5 |
| day | Gallery hue | input ink `#007282` | --panel `#ffffff` | 5.63 | 4.5 |
| day | Gallery wash | input ink on own wash `#007282` | hue wash `#caf2fa` | 4.72 | 4.5 |
| day | Gallery wash | --ink on input wash `#20202e` | hue wash `#caf2fa` | 13.46 | 4.5 |
| day | Gallery tick | input vivid index tick `#0097ac` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | text ink `#007474` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Gallery hue | text ink `#007474` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Gallery wash | text ink on own wash `#007474` | hue wash `#caf3f2` | 4.70 | 4.5 |
| day | Gallery wash | --ink on text wash `#20202e` | hue wash `#caf3f2` | 13.47 | 4.5 |
| day | Gallery tick | text vivid index tick `#009999` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Gallery hue | shapes ink `#007564` | --bg `#f6f5f9` | 5.19 | 4.5 |
| day | Gallery hue | shapes ink `#007564` | --panel `#ffffff` | 5.63 | 4.5 |
| day | Gallery wash | shapes ink on own wash `#007564` | hue wash `#cdf3e9` | 4.72 | 4.5 |
| day | Gallery wash | --ink on shapes wash `#20202e` | hue wash `#cdf3e9` | 13.46 | 4.5 |
| day | Gallery tick | shapes vivid index tick `#009b85` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | maps ink `#00774e` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Gallery hue | maps ink `#00774e` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Gallery wash | maps ink on own wash `#00774e` | hue wash `#d2f3e0` | 4.70 | 4.5 |
| day | Gallery wash | --ink on maps wash `#20202e` | hue wash `#d2f3e0` | 13.49 | 4.5 |
| day | Gallery tick | maps vivid index tick `#009d68` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | notify ink `#1a781f` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Gallery hue | notify ink `#1a781f` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Gallery wash | notify ink on own wash `#1a781f` | hue wash `#daf1d8` | 4.68 | 4.5 |
| day | Gallery wash | --ink on notify wash `#20202e` | hue wash `#daf1d8` | 13.43 | 4.5 |
| day | Gallery tick | notify vivid index tick `#3d9c3e` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | arch ink `#527100` | --bg `#f6f5f9` | 5.20 | 4.5 |
| day | Gallery hue | arch ink `#527100` | --panel `#ffffff` | 5.64 | 4.5 |
| day | Gallery wash | arch ink on own wash `#527100` | hue wash `#e2efd1` | 4.70 | 4.5 |
| day | Gallery wash | --ink on arch wash `#20202e` | hue wash `#e2efd1` | 13.39 | 4.5 |
| day | Gallery tick | arch vivid index tick `#6d9600` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Gallery hue | callouts ink `#6c6b00` | --bg `#f6f5f9` | 5.17 | 4.5 |
| day | Gallery hue | callouts ink `#6c6b00` | --panel `#ffffff` | 5.61 | 4.5 |
| day | Gallery wash | callouts ink on own wash `#6c6b00` | hue wash `#ebeccd` | 4.65 | 4.5 |
| day | Gallery wash | --ink on callouts wash `#20202e` | hue wash `#ebeccd` | 13.32 | 4.5 |
| day | Gallery tick | callouts vivid index tick `#8f8e00` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Gallery hue | obsidian ink `#7d6500` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Gallery hue | obsidian ink `#7d6500` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Gallery wash | obsidian ink on own wash `#7d6500` | hue wash `#f3e9ca` | 4.64 | 4.5 |
| day | Gallery wash | --ink on obsidian wash `#20202e` | hue wash `#f3e9ca` | 13.25 | 4.5 |
| day | Gallery tick | obsidian vivid index tick `#a58600` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Gallery hue | menus ink `#8d5e00` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Gallery hue | menus ink `#8d5e00` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Gallery wash | menus ink on own wash `#8d5e00` | hue wash `#fae6cb` | 4.62 | 4.5 |
| day | Gallery wash | --ink on menus wash `#20202e` | hue wash `#fae6cb` | 13.19 | 4.5 |
| day | Gallery tick | menus vivid index tick `#b97d00` | --bg `#f6f5f9` | 3.23 | 3 |
| day | Gallery hue | spectrums ink `#9d5500` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Gallery hue | spectrums ink `#9d5500` | --panel `#ffffff` | 5.63 | 4.5 |
| day | Gallery wash | spectrums ink on own wash `#9d5500` | hue wash `#ffe4cf` | 4.62 | 4.5 |
| day | Gallery wash | --ink on spectrums wash `#20202e` | hue wash `#ffe4cf` | 13.19 | 4.5 |
| day | Gallery tick | spectrums vivid index tick `#cf7100` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Gallery hue | idea ink `#b04614` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Gallery hue | idea ink `#b04614` | --panel `#ffffff` | 5.63 | 4.5 |
| day | Gallery wash | idea ink on own wash `#b04614` | hue wash `#ffe3d8` | 4.62 | 4.5 |
| day | Gallery wash | --ink on idea wash `#20202e` | hue wash `#ffe3d8` | 13.18 | 4.5 |
| day | Gallery tick | idea vivid index tick `#dc6736` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | mobile ink `#b3413e` | --bg `#f6f5f9` | 5.17 | 4.5 |
| day | Gallery hue | mobile ink `#b3413e` | --panel `#ffffff` | 5.61 | 4.5 |
| day | Gallery wash | mobile ink on own wash `#b3413e` | hue wash `#ffe2df` | 4.59 | 4.5 |
| day | Gallery wash | --ink on mobile wash `#20202e` | hue wash `#ffe2df` | 13.15 | 4.5 |
| day | Gallery tick | mobile vivid index tick `#e0615c` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | desktop ink `#b13f5d` | --bg `#f6f5f9` | 5.18 | 4.5 |
| day | Gallery hue | desktop ink `#b13f5d` | --panel `#ffffff` | 5.62 | 4.5 |
| day | Gallery wash | desktop ink on own wash `#b13f5d` | hue wash `#ffe1e5` | 4.59 | 4.5 |
| day | Gallery wash | --ink on desktop wash `#20202e` | hue wash `#ffe1e5` | 13.12 | 4.5 |
| day | Gallery tick | desktop vivid index tick `#de5f7d` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Gallery hue | web ink `#7555b8` | --bg `#f6f5f9` | 5.16 | 4.5 |
| day | Gallery hue | web ink `#7555b8` | --panel `#ffffff` | 5.60 | 4.5 |
| day | Gallery wash | web ink on own wash `#7555b8` | hue wash `#ebe5ff` | 4.58 | 4.5 |
| day | Gallery wash | --ink on web wash `#20202e` | hue wash `#ebe5ff` | 13.14 | 4.5 |
| day | Gallery tick | web vivid index tick `#9876e3` | --bg `#f6f5f9` | 3.21 | 3 |
| day | Gallery hue | terminal ink `#007652` | --bg `#f6f5f9` | 5.21 | 4.5 |
| day | Gallery hue | terminal ink `#007652` | --panel `#ffffff` | 5.66 | 4.5 |
| day | Gallery wash | terminal ink on own wash `#007652` | hue wash `#d1f3e2` | 4.75 | 4.5 |
| day | Gallery wash | --ink on terminal wash `#20202e` | hue wash `#d1f3e2` | 13.48 | 4.5 |
| day | Gallery tick | terminal vivid index tick `#009d6d` | --bg `#f6f5f9` | 3.20 | 3 |
| day | Gallery hue | deck ink `#965900` | --bg `#f6f5f9` | 5.19 | 4.5 |
| day | Gallery hue | deck ink `#965900` | --panel `#ffffff` | 5.64 | 4.5 |
| day | Gallery wash | deck ink on own wash `#965900` | hue wash `#fee5cd` | 4.64 | 4.5 |
| day | Gallery wash | --ink on deck wash `#20202e` | hue wash `#fee5cd` | 13.23 | 4.5 |
| day | Gallery tick | deck vivid index tick `#c57700` | --bg `#f6f5f9` | 3.22 | 3 |
| day | Terminal | ANSI 0 black `#23222f` | term bg `#f8f7fb` | 14.68 | 4.5 |
| day | Terminal | ANSI 1 red `#b73232` | term bg `#f8f7fb` | 5.60 | 4.5 |
| day | Terminal | ANSI 2 green `#007240` | term bg `#f8f7fb` | 5.66 | 4.5 |
| day | Terminal | ANSI 3 yellow `#835c00` | term bg `#f8f7fb` | 5.63 | 4.5 |
| day | Terminal | ANSI 4 blue `#2a5ec5` | term bg `#f8f7fb` | 5.62 | 4.5 |
| day | Terminal | ANSI 5 magenta `#7353bb` | term bg `#f8f7fb` | 5.34 | 4.5 |
| day | Terminal | ANSI 6 cyan `#006d7d` | term bg `#f8f7fb` | 5.65 | 4.5 |
| day | Terminal | ANSI 8 brightBlack `#55546a` | term bg `#f8f7fb` | 6.88 | 4.5 |
| day | Terminal | ANSI 9 brightRed `#cf354b` | term bg `#f8f7fb` | 4.62 | 4.5 |
| day | Terminal | ANSI 10 brightGreen `#00823a` | term bg `#f8f7fb` | 4.63 | 4.5 |
| day | Terminal | ANSI 11 brightYellow `#8d6c00` | term bg `#f8f7fb` | 4.60 | 4.5 |
| day | Terminal | ANSI 12 brightBlue `#006fd8` | term bg `#f8f7fb` | 4.62 | 4.5 |
| day | Terminal | ANSI 13 brightMagenta `#a04ac2` | term bg `#f8f7fb` | 4.63 | 4.5 |
| day | Terminal | ANSI 14 brightCyan `#007c87` | term bg `#f8f7fb` | 4.65 | 4.5 |
| day | Terminal status bar | ANSI 7 white on 1 red `#e6e5ee` | ANSI 1 fill `#b73232` | 4.78 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 1 red `#ffffff` | ANSI 1 fill `#b73232` | 5.97 | 4.5 |
| day | Terminal status bar | ANSI 7 white on 2 green `#e6e5ee` | ANSI 2 fill `#007240` | 4.83 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 2 green `#ffffff` | ANSI 2 fill `#007240` | 6.03 | 4.5 |
| day | Terminal status bar | ANSI 7 white on 3 yellow `#e6e5ee` | ANSI 3 fill `#835c00` | 4.81 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 3 yellow `#ffffff` | ANSI 3 fill `#835c00` | 6.01 | 4.5 |
| day | Terminal status bar | ANSI 7 white on 4 blue `#e6e5ee` | ANSI 4 fill `#2a5ec5` | 4.79 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 4 blue `#ffffff` | ANSI 4 fill `#2a5ec5` | 5.99 | 4.5 |
| day | Terminal status bar | ANSI 7 white on 5 magenta `#e6e5ee` | ANSI 5 fill `#7353bb` | 4.56 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 5 magenta `#ffffff` | ANSI 5 fill `#7353bb` | 5.70 | 4.5 |
| day | Terminal status bar | ANSI 7 white on 6 cyan `#e6e5ee` | ANSI 6 fill `#006d7d` | 4.82 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 6 cyan `#ffffff` | ANSI 6 fill `#006d7d` | 6.03 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 9 brightRed `#ffffff` | ANSI 9 fill `#cf354b` | 4.93 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 10 brightGreen `#ffffff` | ANSI 10 fill `#00823a` | 4.94 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 11 brightYellow `#ffffff` | ANSI 11 fill `#8d6c00` | 4.91 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 12 brightBlue `#ffffff` | ANSI 12 fill `#006fd8` | 4.92 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 13 brightMagenta `#ffffff` | ANSI 13 fill `#a04ac2` | 4.94 | 4.5 |
| day | Terminal status bar | ANSI 15 brightWhite on 14 brightCyan `#ffffff` | ANSI 14 fill `#007c87` | 4.96 | 4.5 |
| day | Terminal status bar | ANSI 0 black on 7 white `#23222f` | ANSI 7 fill `#e6e5ee` | 12.53 | 4.5 |
| day | Terminal status bar | ANSI 8 brightBlack on 7 white `#55546a` | ANSI 7 fill `#e6e5ee` | 5.87 | 4.5 |
| day | Terminal status bar | ANSI 0 black on 15 brightWhite `#23222f` | ANSI 15 fill `#ffffff` | 15.66 | 4.5 |
| day | Terminal status bar | ANSI 8 brightBlack on 15 brightWhite `#55546a` | ANSI 15 fill `#ffffff` | 7.34 | 4.5 |
| day | Terminal status bar | foreground on 7 white `#23222f` | ANSI 7 fill `#e6e5ee` | 12.53 | 4.5 |
| day | Terminal status bar | foreground on 15 brightWhite `#23222f` | ANSI 15 fill `#ffffff` | 15.66 | 4.5 |
| day | Terminal | foreground `#23222f` | term bg `#f8f7fb` | 14.68 | 4.5 |
| day | Terminal 256 | --ink → 235 `#262626` | term bg `#f8f7fb` | 14.19 | 4.5 |
| day | Terminal 256 | --ink → 235 `#262626` | 256 surface 255 `#eeeeee` | 13.04 | 4.5 |
| day | Terminal 256 | --ink → 235 `#262626` | 256 surface 15 `#ffffff` | 15.13 | 4.5 |
| day | Terminal 256 | --muted → 240 `#585858` | term bg `#f8f7fb` | 6.67 | 4.5 |
| day | Terminal 256 | --muted → 240 `#585858` | 256 surface 255 `#eeeeee` | 6.13 | 4.5 |
| day | Terminal 256 | --muted → 240 `#585858` | 256 surface 15 `#ffffff` | 7.11 | 4.5 |
| day | Terminal 256 | --dim → 242 `#6c6c6c` | term bg `#f8f7fb` | 4.92 | 4.5 |
| day | Terminal 256 | --dim → 242 `#6c6c6c` | 256 surface 255 `#eeeeee` | 4.53 | 4.5 |
| day | Terminal 256 | --dim → 242 `#6c6c6c` | 256 surface 15 `#ffffff` | 5.25 | 4.5 |
| day | Terminal 256 | --accent → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | --accent → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | --accent → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 | --accent2 → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | --accent2 → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | --accent2 → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 | --info → 25 `#005faf` | term bg `#f8f7fb` | 6.05 | 4.5 |
| day | Terminal 256 | --info → 25 `#005faf` | 256 surface 255 `#eeeeee` | 5.56 | 4.5 |
| day | Terminal 256 | --info → 25 `#005faf` | 256 surface 15 `#ffffff` | 6.45 | 4.5 |
| day | Terminal 256 | --pos → 23 `#005f5f` | term bg `#f8f7fb` | 7.03 | 4.5 |
| day | Terminal 256 | --pos → 23 `#005f5f` | 256 surface 255 `#eeeeee` | 6.46 | 4.5 |
| day | Terminal 256 | --pos → 23 `#005f5f` | 256 surface 15 `#ffffff` | 7.49 | 4.5 |
| day | Terminal 256 | --warn → 94 `#875f00` | term bg `#f8f7fb` | 5.37 | 4.5 |
| day | Terminal 256 | --warn → 94 `#875f00` | 256 surface 255 `#eeeeee` | 4.94 | 4.5 |
| day | Terminal 256 | --warn → 94 `#875f00` | 256 surface 15 `#ffffff` | 5.73 | 4.5 |
| day | Terminal 256 | --neg → 160 `#d70000` | term bg `#f8f7fb` | 5.06 | 4.5 |
| day | Terminal 256 | --neg → 160 `#d70000` | 256 surface 255 `#eeeeee` | 4.65 | 4.5 |
| day | Terminal 256 | --neg → 160 `#d70000` | 256 surface 15 `#ffffff` | 5.40 | 4.5 |
| day | Terminal 256 | --crit → 125 `#af005f` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | --crit → 125 `#af005f` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | --crit → 125 `#af005f` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 | violet ink → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | violet ink → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | violet ink → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 | periwinkle ink → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | periwinkle ink → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | periwinkle ink → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 | azure ink → 25 `#005faf` | term bg `#f8f7fb` | 6.05 | 4.5 |
| day | Terminal 256 | azure ink → 25 `#005faf` | 256 surface 255 `#eeeeee` | 5.56 | 4.5 |
| day | Terminal 256 | azure ink → 25 `#005faf` | 256 surface 15 `#ffffff` | 6.45 | 4.5 |
| day | Terminal 256 | cerulean ink → 24 `#005f87` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | cerulean ink → 24 `#005f87` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | cerulean ink → 24 `#005f87` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 | cyan ink → 23 `#005f5f` | term bg `#f8f7fb` | 7.03 | 4.5 |
| day | Terminal 256 | cyan ink → 23 `#005f5f` | 256 surface 255 `#eeeeee` | 6.46 | 4.5 |
| day | Terminal 256 | cyan ink → 23 `#005f5f` | 256 surface 15 `#ffffff` | 7.49 | 4.5 |
| day | Terminal 256 | mint ink → 23 `#005f5f` | term bg `#f8f7fb` | 7.03 | 4.5 |
| day | Terminal 256 | mint ink → 23 `#005f5f` | 256 surface 255 `#eeeeee` | 6.46 | 4.5 |
| day | Terminal 256 | mint ink → 23 `#005f5f` | 256 surface 15 `#ffffff` | 7.49 | 4.5 |
| day | Terminal 256 | jade ink → 22 `#005f00` | term bg `#f8f7fb` | 7.47 | 4.5 |
| day | Terminal 256 | jade ink → 22 `#005f00` | 256 surface 255 `#eeeeee` | 6.86 | 4.5 |
| day | Terminal 256 | jade ink → 22 `#005f00` | 256 surface 15 `#ffffff` | 7.96 | 4.5 |
| day | Terminal 256 | lime ink → 58 `#5f5f00` | term bg `#f8f7fb` | 6.30 | 4.5 |
| day | Terminal 256 | lime ink → 58 `#5f5f00` | 256 surface 255 `#eeeeee` | 5.79 | 4.5 |
| day | Terminal 256 | lime ink → 58 `#5f5f00` | 256 surface 15 `#ffffff` | 6.72 | 4.5 |
| day | Terminal 256 | citrine ink → 94 `#875f00` | term bg `#f8f7fb` | 5.37 | 4.5 |
| day | Terminal 256 | citrine ink → 94 `#875f00` | 256 surface 255 `#eeeeee` | 4.94 | 4.5 |
| day | Terminal 256 | citrine ink → 94 `#875f00` | 256 surface 15 `#ffffff` | 5.73 | 4.5 |
| day | Terminal 256 | amber ink → 94 `#875f00` | term bg `#f8f7fb` | 5.37 | 4.5 |
| day | Terminal 256 | amber ink → 94 `#875f00` | 256 surface 255 `#eeeeee` | 4.94 | 4.5 |
| day | Terminal 256 | amber ink → 94 `#875f00` | 256 surface 15 `#ffffff` | 5.73 | 4.5 |
| day | Terminal 256 | coral ink → 124 `#af0000` | term bg `#f8f7fb` | 6.97 | 4.5 |
| day | Terminal 256 | coral ink → 124 `#af0000` | 256 surface 255 `#eeeeee` | 6.41 | 4.5 |
| day | Terminal 256 | coral ink → 124 `#af0000` | 256 surface 15 `#ffffff` | 7.44 | 4.5 |
| day | Terminal 256 | rose ink → 125 `#af005f` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | rose ink → 125 `#af005f` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | rose ink → 125 `#af005f` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 | fx ink → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | fx ink → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | fx ink → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 tick | fx vivid → 68 `#5f87d7` | term bg `#f8f7fb` | 3.32 | 3 |
| day | Terminal 256 tick | fx vivid → 68 `#5f87d7` | 256 surface 255 `#eeeeee` | 3.05 | 3 |
| day | Terminal 256 tick | fx vivid → 68 `#5f87d7` | 256 surface 15 `#ffffff` | 3.54 | 3 |
| day | Terminal 256 | objects ink → 24 `#005f87` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | objects ink → 24 `#005f87` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | objects ink → 24 `#005f87` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 tick | objects vivid → 31 `#0087af` | term bg `#f8f7fb` | 3.87 | 3 |
| day | Terminal 256 tick | objects vivid → 31 `#0087af` | 256 surface 255 `#eeeeee` | 3.56 | 3 |
| day | Terminal 256 tick | objects vivid → 31 `#0087af` | 256 surface 15 `#ffffff` | 4.13 | 3 |
| day | Terminal 256 | sim ink → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | sim ink → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | sim ink → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 tick | sim vivid → 68 `#5f87d7` | term bg `#f8f7fb` | 3.32 | 3 |
| day | Terminal 256 tick | sim vivid → 68 `#5f87d7` | 256 surface 255 `#eeeeee` | 3.05 | 3 |
| day | Terminal 256 tick | sim vivid → 68 `#5f87d7` | 256 surface 15 `#ffffff` | 3.54 | 3 |
| day | Terminal 256 | retro ink → 24 `#005f87` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | retro ink → 24 `#005f87` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | retro ink → 24 `#005f87` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 tick | retro vivid → 31 `#0087af` | term bg `#f8f7fb` | 3.87 | 3 |
| day | Terminal 256 tick | retro vivid → 31 `#0087af` | 256 surface 255 `#eeeeee` | 3.56 | 3 |
| day | Terminal 256 tick | retro vivid → 31 `#0087af` | 256 surface 15 `#ffffff` | 4.13 | 3 |
| day | Terminal 256 | text ink → 23 `#005f5f` | term bg `#f8f7fb` | 7.03 | 4.5 |
| day | Terminal 256 | text ink → 23 `#005f5f` | 256 surface 255 `#eeeeee` | 6.46 | 4.5 |
| day | Terminal 256 | text ink → 23 `#005f5f` | 256 surface 15 `#ffffff` | 7.49 | 4.5 |
| day | Terminal 256 tick | text vivid → 30 `#008787` | term bg `#f8f7fb` | 4.09 | 3 |
| day | Terminal 256 tick | text vivid → 30 `#008787` | 256 surface 255 `#eeeeee` | 3.76 | 3 |
| day | Terminal 256 tick | text vivid → 30 `#008787` | 256 surface 15 `#ffffff` | 4.36 | 3 |
| day | Terminal 256 | loaders ink → 23 `#005f5f` | term bg `#f8f7fb` | 7.03 | 4.5 |
| day | Terminal 256 | loaders ink → 23 `#005f5f` | 256 surface 255 `#eeeeee` | 6.46 | 4.5 |
| day | Terminal 256 | loaders ink → 23 `#005f5f` | 256 surface 15 `#ffffff` | 7.49 | 4.5 |
| day | Terminal 256 tick | loaders vivid → 29 `#00875f` | term bg `#f8f7fb` | 4.25 | 3 |
| day | Terminal 256 tick | loaders vivid → 29 `#00875f` | 256 surface 255 `#eeeeee` | 3.91 | 3 |
| day | Terminal 256 tick | loaders vivid → 29 `#00875f` | 256 surface 15 `#ffffff` | 4.53 | 3 |
| day | Terminal 256 | progress ink → 22 `#005f00` | term bg `#f8f7fb` | 7.47 | 4.5 |
| day | Terminal 256 | progress ink → 22 `#005f00` | 256 surface 255 `#eeeeee` | 6.86 | 4.5 |
| day | Terminal 256 | progress ink → 22 `#005f00` | 256 surface 15 `#ffffff` | 7.96 | 4.5 |
| day | Terminal 256 tick | progress vivid → 64 `#5f8700` | term bg `#f8f7fb` | 3.98 | 3 |
| day | Terminal 256 tick | progress vivid → 64 `#5f8700` | 256 surface 255 `#eeeeee` | 3.65 | 3 |
| day | Terminal 256 tick | progress vivid → 64 `#5f8700` | 256 surface 15 `#ffffff` | 4.24 | 3 |
| day | Terminal 256 | charts ink → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | charts ink → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | charts ink → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 tick | charts vivid → 98 `#875fd7` | term bg `#f8f7fb` | 4.24 | 3 |
| day | Terminal 256 tick | charts vivid → 98 `#875fd7` | 256 surface 255 `#eeeeee` | 3.89 | 3 |
| day | Terminal 256 tick | charts vivid → 98 `#875fd7` | 256 surface 15 `#ffffff` | 4.52 | 3 |
| day | Terminal 256 | ai ink → 25 `#005faf` | term bg `#f8f7fb` | 6.05 | 4.5 |
| day | Terminal 256 | ai ink → 25 `#005faf` | 256 surface 255 `#eeeeee` | 5.56 | 4.5 |
| day | Terminal 256 | ai ink → 25 `#005faf` | 256 surface 15 `#ffffff` | 6.45 | 4.5 |
| day | Terminal 256 tick | ai vivid → 32 `#0087d7` | term bg `#f8f7fb` | 3.61 | 3 |
| day | Terminal 256 tick | ai vivid → 32 `#0087d7` | 256 surface 255 `#eeeeee` | 3.32 | 3 |
| day | Terminal 256 tick | ai vivid → 32 `#0087d7` | 256 surface 15 `#ffffff` | 3.86 | 3 |
| day | Terminal 256 | status ink → 22 `#005f00` | term bg `#f8f7fb` | 7.47 | 4.5 |
| day | Terminal 256 | status ink → 22 `#005f00` | 256 surface 255 `#eeeeee` | 6.86 | 4.5 |
| day | Terminal 256 | status ink → 22 `#005f00` | 256 surface 15 `#ffffff` | 7.96 | 4.5 |
| day | Terminal 256 tick | status vivid → 64 `#5f8700` | term bg `#f8f7fb` | 3.98 | 3 |
| day | Terminal 256 tick | status vivid → 64 `#5f8700` | 256 surface 255 `#eeeeee` | 3.65 | 3 |
| day | Terminal 256 tick | status vivid → 64 `#5f8700` | 256 surface 15 `#ffffff` | 4.24 | 3 |
| day | Terminal 256 | ops ink → 94 `#875f00` | term bg `#f8f7fb` | 5.37 | 4.5 |
| day | Terminal 256 | ops ink → 94 `#875f00` | 256 surface 255 `#eeeeee` | 4.94 | 4.5 |
| day | Terminal 256 | ops ink → 94 `#875f00` | 256 surface 15 `#ffffff` | 5.73 | 4.5 |
| day | Terminal 256 tick | ops vivid → 100 `#878700` | term bg `#f8f7fb` | 3.58 | 3 |
| day | Terminal 256 tick | ops vivid → 100 `#878700` | 256 surface 255 `#eeeeee` | 3.29 | 3 |
| day | Terminal 256 tick | ops vivid → 100 `#878700` | 256 surface 15 `#ffffff` | 3.82 | 3 |
| day | Terminal 256 | diagrams ink → 58 `#5f5f00` | term bg `#f8f7fb` | 6.30 | 4.5 |
| day | Terminal 256 | diagrams ink → 58 `#5f5f00` | 256 surface 255 `#eeeeee` | 5.79 | 4.5 |
| day | Terminal 256 | diagrams ink → 58 `#5f5f00` | 256 surface 15 `#ffffff` | 6.72 | 4.5 |
| day | Terminal 256 tick | diagrams vivid → 64 `#5f8700` | term bg `#f8f7fb` | 3.98 | 3 |
| day | Terminal 256 tick | diagrams vivid → 64 `#5f8700` | 256 surface 255 `#eeeeee` | 3.65 | 3 |
| day | Terminal 256 tick | diagrams vivid → 64 `#5f8700` | 256 surface 15 `#ffffff` | 4.24 | 3 |
| day | Terminal 256 | callouts ink → 58 `#5f5f00` | term bg `#f8f7fb` | 6.30 | 4.5 |
| day | Terminal 256 | callouts ink → 58 `#5f5f00` | 256 surface 255 `#eeeeee` | 5.79 | 4.5 |
| day | Terminal 256 | callouts ink → 58 `#5f5f00` | 256 surface 15 `#ffffff` | 6.72 | 4.5 |
| day | Terminal 256 tick | callouts vivid → 100 `#878700` | term bg `#f8f7fb` | 3.58 | 3 |
| day | Terminal 256 tick | callouts vivid → 100 `#878700` | 256 surface 255 `#eeeeee` | 3.29 | 3 |
| day | Terminal 256 tick | callouts vivid → 100 `#878700` | 256 surface 15 `#ffffff` | 3.82 | 3 |
| day | Terminal 256 | input ink → 24 `#005f87` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | input ink → 24 `#005f87` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | input ink → 24 `#005f87` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 tick | input vivid → 31 `#0087af` | term bg `#f8f7fb` | 3.87 | 3 |
| day | Terminal 256 tick | input vivid → 31 `#0087af` | 256 surface 255 `#eeeeee` | 3.56 | 3 |
| day | Terminal 256 tick | input vivid → 31 `#0087af` | 256 surface 15 `#ffffff` | 4.13 | 3 |
| day | Terminal 256 | maps ink → 22 `#005f00` | term bg `#f8f7fb` | 7.47 | 4.5 |
| day | Terminal 256 | maps ink → 22 `#005f00` | 256 surface 255 `#eeeeee` | 6.86 | 4.5 |
| day | Terminal 256 | maps ink → 22 `#005f00` | 256 surface 15 `#ffffff` | 7.96 | 4.5 |
| day | Terminal 256 tick | maps vivid → 29 `#00875f` | term bg `#f8f7fb` | 4.25 | 3 |
| day | Terminal 256 tick | maps vivid → 29 `#00875f` | 256 surface 255 `#eeeeee` | 3.91 | 3 |
| day | Terminal 256 tick | maps vivid → 29 `#00875f` | 256 surface 15 `#ffffff` | 4.53 | 3 |
| day | Terminal 256 | lab ink → 25 `#005faf` | term bg `#f8f7fb` | 6.05 | 4.5 |
| day | Terminal 256 | lab ink → 25 `#005faf` | 256 surface 255 `#eeeeee` | 5.56 | 4.5 |
| day | Terminal 256 | lab ink → 25 `#005faf` | 256 surface 15 `#ffffff` | 6.45 | 4.5 |
| day | Terminal 256 tick | lab vivid → 68 `#5f87d7` | term bg `#f8f7fb` | 3.32 | 3 |
| day | Terminal 256 tick | lab vivid → 68 `#5f87d7` | 256 surface 255 `#eeeeee` | 3.05 | 3 |
| day | Terminal 256 tick | lab vivid → 68 `#5f87d7` | 256 surface 15 `#ffffff` | 3.54 | 3 |
| day | Terminal 256 | ascii ink → 124 `#af0000` | term bg `#f8f7fb` | 6.97 | 4.5 |
| day | Terminal 256 | ascii ink → 124 `#af0000` | 256 surface 255 `#eeeeee` | 6.41 | 4.5 |
| day | Terminal 256 | ascii ink → 124 `#af0000` | 256 surface 15 `#ffffff` | 7.44 | 4.5 |
| day | Terminal 256 tick | ascii vivid → 167 `#d75f5f` | term bg `#f8f7fb` | 3.46 | 3 |
| day | Terminal 256 tick | ascii vivid → 167 `#d75f5f` | 256 surface 255 `#eeeeee` | 3.18 | 3 |
| day | Terminal 256 tick | ascii vivid → 167 `#d75f5f` | 256 surface 15 `#ffffff` | 3.69 | 3 |
| day | Terminal 256 | ANSI 0 black → 235 `#262626` | term bg `#f8f7fb` | 14.19 | 4.5 |
| day | Terminal 256 | ANSI 0 black → 235 `#262626` | 256 surface 255 `#eeeeee` | 13.04 | 4.5 |
| day | Terminal 256 | ANSI 0 black → 235 `#262626` | 256 surface 15 `#ffffff` | 15.13 | 4.5 |
| day | Terminal 256 | ANSI 1 red → 124 `#af0000` | term bg `#f8f7fb` | 6.97 | 4.5 |
| day | Terminal 256 | ANSI 1 red → 124 `#af0000` | 256 surface 255 `#eeeeee` | 6.41 | 4.5 |
| day | Terminal 256 | ANSI 1 red → 124 `#af0000` | 256 surface 15 `#ffffff` | 7.44 | 4.5 |
| day | Terminal 256 | ANSI 2 green → 22 `#005f00` | term bg `#f8f7fb` | 7.47 | 4.5 |
| day | Terminal 256 | ANSI 2 green → 22 `#005f00` | 256 surface 255 `#eeeeee` | 6.86 | 4.5 |
| day | Terminal 256 | ANSI 2 green → 22 `#005f00` | 256 surface 15 `#ffffff` | 7.96 | 4.5 |
| day | Terminal 256 | ANSI 3 yellow → 94 `#875f00` | term bg `#f8f7fb` | 5.37 | 4.5 |
| day | Terminal 256 | ANSI 3 yellow → 94 `#875f00` | 256 surface 255 `#eeeeee` | 4.94 | 4.5 |
| day | Terminal 256 | ANSI 3 yellow → 94 `#875f00` | 256 surface 15 `#ffffff` | 5.73 | 4.5 |
| day | Terminal 256 | ANSI 4 blue → 26 `#005fd7` | term bg `#f8f7fb` | 5.44 | 4.5 |
| day | Terminal 256 | ANSI 4 blue → 26 `#005fd7` | 256 surface 255 `#eeeeee` | 5.00 | 4.5 |
| day | Terminal 256 | ANSI 4 blue → 26 `#005fd7` | 256 surface 15 `#ffffff` | 5.80 | 4.5 |
| day | Terminal 256 | ANSI 5 magenta → 61 `#5f5faf` | term bg `#f8f7fb` | 5.26 | 4.5 |
| day | Terminal 256 | ANSI 5 magenta → 61 `#5f5faf` | 256 surface 255 `#eeeeee` | 4.84 | 4.5 |
| day | Terminal 256 | ANSI 5 magenta → 61 `#5f5faf` | 256 surface 15 `#ffffff` | 5.61 | 4.5 |
| day | Terminal 256 | ANSI 6 cyan → 24 `#005f87` | term bg `#f8f7fb` | 6.59 | 4.5 |
| day | Terminal 256 | ANSI 6 cyan → 24 `#005f87` | 256 surface 255 `#eeeeee` | 6.06 | 4.5 |
| day | Terminal 256 | ANSI 6 cyan → 24 `#005f87` | 256 surface 15 `#ffffff` | 7.03 | 4.5 |
| day | Terminal 256 | ANSI 8 brightBlack → 240 `#585858` | term bg `#f8f7fb` | 6.67 | 4.5 |
| day | Terminal 256 | ANSI 8 brightBlack → 240 `#585858` | 256 surface 255 `#eeeeee` | 6.13 | 4.5 |
| day | Terminal 256 | ANSI 8 brightBlack → 240 `#585858` | 256 surface 15 `#ffffff` | 7.11 | 4.5 |
| day | Terminal 256 | ANSI 9 brightRed → 160 `#d70000` | term bg `#f8f7fb` | 5.06 | 4.5 |
| day | Terminal 256 | ANSI 9 brightRed → 160 `#d70000` | 256 surface 255 `#eeeeee` | 4.65 | 4.5 |
| day | Terminal 256 | ANSI 9 brightRed → 160 `#d70000` | 256 surface 15 `#ffffff` | 5.40 | 4.5 |
| day | Terminal 256 | ANSI 10 brightGreen → 22 `#005f00` | term bg `#f8f7fb` | 7.47 | 4.5 |
| day | Terminal 256 | ANSI 10 brightGreen → 22 `#005f00` | 256 surface 255 `#eeeeee` | 6.86 | 4.5 |
| day | Terminal 256 | ANSI 10 brightGreen → 22 `#005f00` | 256 surface 15 `#ffffff` | 7.96 | 4.5 |
| day | Terminal 256 | ANSI 11 brightYellow → 94 `#875f00` | term bg `#f8f7fb` | 5.37 | 4.5 |
| day | Terminal 256 | ANSI 11 brightYellow → 94 `#875f00` | 256 surface 255 `#eeeeee` | 4.94 | 4.5 |
| day | Terminal 256 | ANSI 11 brightYellow → 94 `#875f00` | 256 surface 15 `#ffffff` | 5.73 | 4.5 |
| day | Terminal 256 | ANSI 12 brightBlue → 26 `#005fd7` | term bg `#f8f7fb` | 5.44 | 4.5 |
| day | Terminal 256 | ANSI 12 brightBlue → 26 `#005fd7` | 256 surface 255 `#eeeeee` | 5.00 | 4.5 |
| day | Terminal 256 | ANSI 12 brightBlue → 26 `#005fd7` | 256 surface 15 `#ffffff` | 5.80 | 4.5 |
| day | Terminal 256 | ANSI 13 brightMagenta → 91 `#8700af` | term bg `#f8f7fb` | 7.43 | 4.5 |
| day | Terminal 256 | ANSI 13 brightMagenta → 91 `#8700af` | 256 surface 255 `#eeeeee` | 6.83 | 4.5 |
| day | Terminal 256 | ANSI 13 brightMagenta → 91 `#8700af` | 256 surface 15 `#ffffff` | 7.93 | 4.5 |
| day | Terminal 256 | ANSI 14 brightCyan → 23 `#005f5f` | term bg `#f8f7fb` | 7.03 | 4.5 |
| day | Terminal 256 | ANSI 14 brightCyan → 23 `#005f5f` | 256 surface 255 `#eeeeee` | 6.46 | 4.5 |
| day | Terminal 256 | ANSI 14 brightCyan → 23 `#005f5f` | 256 surface 15 `#ffffff` | 7.49 | 4.5 |
| day | Terminal 16 | --ink → slot -1 `#23222f` | term bg `#f8f7fb` | 14.68 | 4.5 |
| day | Terminal 16 | --muted → slot 8 `#55546a` | term bg `#f8f7fb` | 6.88 | 4.5 |
| day | Terminal 16 | --dim → slot 8 `#55546a` | term bg `#f8f7fb` | 6.88 | 4.5 |
| day | Terminal 16 | --accent → slot 5 `#7353bb` | term bg `#f8f7fb` | 5.34 | 4.5 |
| day | Terminal 16 | --accent2 → slot 4 `#2a5ec5` | term bg `#f8f7fb` | 5.62 | 4.5 |
| day | Terminal 16 | --info → slot 4 `#2a5ec5` | term bg `#f8f7fb` | 5.62 | 4.5 |
| day | Terminal 16 | --pos → slot 2 `#007240` | term bg `#f8f7fb` | 5.66 | 4.5 |
| day | Terminal 16 | --warn → slot 3 `#835c00` | term bg `#f8f7fb` | 5.63 | 4.5 |
| day | Terminal 16 | --neg → slot 1 `#b73232` | term bg `#f8f7fb` | 5.60 | 4.5 |
| day | Terminal 16 | --crit → slot 13 `#a04ac2` | term bg `#f8f7fb` | 4.63 | 4.5 |
| day | Terminal 16 | violet → slot 5 `#7353bb` | term bg `#f8f7fb` | 5.34 | 4.5 |
| day | Terminal 16 | periwinkle → slot 4 `#2a5ec5` | term bg `#f8f7fb` | 5.62 | 4.5 |
| day | Terminal 16 | azure → slot 4 `#2a5ec5` | term bg `#f8f7fb` | 5.62 | 4.5 |
| day | Terminal 16 | cerulean → slot 6 `#006d7d` | term bg `#f8f7fb` | 5.65 | 4.5 |
| day | Terminal 16 | cyan → slot 6 `#006d7d` | term bg `#f8f7fb` | 5.65 | 4.5 |
| day | Terminal 16 | mint → slot 2 `#007240` | term bg `#f8f7fb` | 5.66 | 4.5 |
| day | Terminal 16 | jade → slot 2 `#007240` | term bg `#f8f7fb` | 5.66 | 4.5 |
| day | Terminal 16 | lime → slot 10 `#00823a` | term bg `#f8f7fb` | 4.63 | 4.5 |
| day | Terminal 16 | citrine → slot 3 `#835c00` | term bg `#f8f7fb` | 5.63 | 4.5 |
| day | Terminal 16 | amber → slot 3 `#835c00` | term bg `#f8f7fb` | 5.63 | 4.5 |
| day | Terminal 16 | coral → slot 1 `#b73232` | term bg `#f8f7fb` | 5.60 | 4.5 |
| day | Terminal 16 | rose → slot 13 `#a04ac2` | term bg `#f8f7fb` | 4.63 | 4.5 |
| day | Terminal | selection fg on selection bg `#20202e` | selection `#ddd5f3` | 11.39 | 4.5 |
| day | Deck | key label --ink `#20202e` | key fill `#f4f3f8` | 14.55 | 4.5 |
| day | Deck | key label --muted `#55556a` | key fill `#f4f3f8` | 6.57 | 4.5 |
| day | Deck | on-state glyph charts `#7555b8` | key fill `#f4f3f8` | 5.08 | 4.5 |
| day | Deck | on-state glyph fx `#5b5cbe` | key fill `#f4f3f8` | 5.11 | 4.5 |
| day | Deck | on-state glyph lab `#3664be` | key fill `#f4f3f8` | 5.11 | 4.5 |
| day | Deck | on-state glyph ai `#006cad` | key fill `#f4f3f8` | 5.07 | 4.5 |
| day | Deck | on-state glyph objects `#007093` | key fill `#f4f3f8` | 5.09 | 4.5 |
| day | Deck | on-state glyph input `#007282` | key fill `#f4f3f8` | 5.10 | 4.5 |
| day | Deck | on-state glyph text `#007474` | key fill `#f4f3f8` | 5.07 | 4.5 |
| day | Deck | on-state glyph shapes `#007564` | key fill `#f4f3f8` | 5.10 | 4.5 |
| day | Deck | on-state glyph maps `#00774e` | key fill `#f4f3f8` | 5.07 | 4.5 |
| day | Deck | on-state glyph notify `#1a781f` | key fill `#f4f3f8` | 5.07 | 4.5 |
| day | Deck | on-state glyph arch `#527100` | key fill `#f4f3f8` | 5.11 | 4.5 |
| day | Deck | on-state glyph callouts `#6c6b00` | key fill `#f4f3f8` | 5.09 | 4.5 |
| day | Deck | on-state glyph obsidian `#7d6500` | key fill `#f4f3f8` | 5.10 | 4.5 |
| day | Deck | on-state glyph menus `#8d5e00` | key fill `#f4f3f8` | 5.09 | 4.5 |
| day | Deck | on-state glyph spectrums `#9d5500` | key fill `#f4f3f8` | 5.10 | 4.5 |
| day | Deck | on-state glyph idea `#b04614` | key fill `#f4f3f8` | 5.10 | 4.5 |
| day | Deck | on-state glyph mobile `#b3413e` | key fill `#f4f3f8` | 5.08 | 4.5 |
| day | Deck | on-state glyph desktop `#b13f5d` | key fill `#f4f3f8` | 5.09 | 4.5 |

</details>

<!-- /gen:contrast -->

- **Focus**: 2 px `--rf-focus` outline + 2 px offset + 6 px `--rf-focus-halo`; ≥ 7:1 on every surface. Never `outline: none` without a replacement. Inputs move the ring onto border + baseline.
- **Color is never alone**: selected chips gain a dot; alerts gain a notch; status toasts carry a title; the spectral index reinforces a label, never replaces one.
- **Keyboard**: skip link; roving focus in nav, chips and palette; `Ctrl/⌘ K` opens the palette; `Esc` closes overlays; `↵` opens; arrows move. First Light is skippable by any key and never blocks input.
- **Motion**: §10 reduced-motion rules everywhere.
- **Glass**: overlay text sits on `--rf-glass` at ≥ 72 % opacity over a scrim, so contrast holds over any content.

---

## 13. Iconography, brand, First Light

Owned by the Brand designer — referenced, not duplicated:
- `design/icons/` — one hairline family on a 24 px grid, 1.5 px stroke, optional spectral fill state. Replaces every emoji in the chrome. Icons take `currentColor`; the spectral fill uses `--rf-hue-v`.
- `design/brand/` — the prism mark and wordmark (the specimen uses the current website mark as a placeholder).
- `design/first-light/` — the load sequence.

---

## 14. Decisions log (formerly open questions)

1. **Inter 700** — bundled (`design/fonts/inter-700-latin.woff2`, ~24 KB). Display and h1 render at a real 700. (v1.2.0)
2. **Website fonts** — the website self-hosts the same three Inter files, so site and app match. (v1.2.0)
3. **Generator in repo** — moved to `design/tools/` with `--check` modes; the repo regenerates the whole system on its own. (v1.2.0)
4. **Terminal hues** — the terminal nav keeps its order; terminal galleries take even spectrum steps in that order. (v1.2.0)
