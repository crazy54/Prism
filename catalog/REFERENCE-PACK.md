# The reference theme pack: Cloudscape

**Cloudscape is the reference implementation every theme pack mirrors.** It is not a
special case bolted onto the shell — it rides the exact same theme registry, the same
`:root`-token contract, and the same MCP mirror that the F6 scaffolder
(`_scaffold_ds.mjs`) emits for every Phase-2 system. If you want to know what a *correct*
pack looks like end-to-end, read Cloudscape's wiring; the scaffolder produces a structural
copy of it with a different palette.

This is the promise of the theme-packs epic (JFH-33): a design system is **pure `:root`
token overrides** over identical component HTML/CSS. No bespoke per-theme chrome CSS, no
per-id branching in the shell. Cloudscape proves the contract holds for the built-in
system, so any pack built the same way inherits the same guarantees.

---

## The three places a pack lives (and Cloudscape's entries)

A pack is wired in exactly three files. The scaffolder patches all three idempotently; here
is what Cloudscape looks like in each, as the canonical shape to match.

### 1. `Prism.html` — `THEME_REGISTRY` (the single source of truth)

Two entries (one per color mode), each pointing at a **`:root`-only** CSS const. This is
the ONE source the shell (`applyTheme`/`themeMatrix`) and the Variant-Matrix picker read —
adding a pack is pushing entries here.

```js
// each CSS const is a PURE :root token block — nothing else (F1/F2):
var CS_DARK_CSS  = ':root{--bg:#0f1621;--panel:#192534;…;--cardgrad:…;}';
var CS_LIGHT_CSS = ':root{--bg:#f2f3f3;--panel:#ffffff;…;--cardgrad:…;}';

var THEME_REGISTRY = [
  {id:'cloudscape-dark',  ds:'cloudscape', name:'Cloudscape Dark',  mode:'dark',  accent:'#539fe5', builtin:true, css:CS_DARK_CSS},
  {id:'cloudscape-light', ds:'cloudscape', name:'Cloudscape Light', mode:'light', accent:'#0972d3', builtin:true, css:CS_LIGHT_CSS}
];
```

Entry shape: `{id, ds, name, mode, accent, builtin, css}`. `ds` is the design-system family
(the `data-spectrum` axis); `accent` is the primary brand color for that mode; `css` is the
`:root` block. A scaffolded pack differs only in `builtin:false` and its palette — the
structure is identical.

The **only** difference between the two modes is the token values inside `:root`. There is
no mode-specific chrome CSS in the const — see §"Why `:root`-only works" below.

### 2. `prism-mcp-server/utils/themes.js` — the MCP mirror

`THEMES[]` mirrors the registry so MCP tooling can answer palette/variant questions
offline. Cloudscape Dark is `isDefault` and is the `BASE_TOKENS` every other mode/pack
layers over; Light is expressed as `overrides` vs that base (computed by `diff()`):

```js
export const THEMES = [
  { id:'cloudscape-dark',  ds:'cloudscape', dsName:'Cloudscape', name:'Cloudscape Dark',  mode:'dark',  builtin:true, isDefault:true, tokens: merge({}) },
  { id:'cloudscape-light', ds:'cloudscape', dsName:'Cloudscape', name:'Cloudscape Light', mode:'light', builtin:true, tokens: merge(CLOUDSCAPE_LIGHT_OVERRIDES) },
  // ▼ scaffolded theme packs (F6) — do not hand-edit; see catalog/_scaffold_ds.mjs
].map((t) => ({ ...t, overrides: diff(t.tokens) }));
```

`packTokens(mode, overrides)` is how a scaffolded pack fills a complete `:root` from a
sparse profile: it starts from `baseTokensFor(mode)` (the Cloudscape base for that mode) and
layers the pack's brand overrides on top. So even a profile that only sets `--accent` yields
a full, coherent token map — because it inherits everything else from Cloudscape. **This is
why the base tokens must match the app registry exactly**; the whole mirror is derived from
them.

Everything else in the MCP surface is self-maintaining off `THEMES[]`: `THEME_IDS`,
`themeIdList()`, `themesSummary()`, the tool descriptions, and the `variants.test.js`
theme-count assertions all derive from this array. A scaffolded pack surfaces with no
further MCP edits.

### 3. `catalog/systems.json` — the coverage-gate registry

Cloudscape is neither `legacy` nor `themePack` here — **it is the base system**, so it is
not gated for facet coverage. A scaffolded pack is registered under `themePack[]`, which
tells `_check_ds.mjs` to hold its facets to the 100-facet standard once they are authored.

---

## Why `:root`-only works (no bespoke chrome CSS)

Pre-refactor, each theme string carried ~20 lines of `!important` chrome CSS (rail
surfaces, `.sr-*` text, sweep, focus ring). F1/F2 (JFH-34/JFH-35) removed all of it. The
base shell CSS now reads **flip-able chrome tokens** — `--cs-nav-link`, `--cs-nav-title`,
`--cs-brand-line`, `--cs-hover`, `--cs-active-bg`, the topnav tokens, the focus ring — whose
dark defaults live at `:root` and whose light values are supplied by the **`body.cs-light`
mode class**, not by the theme:

```css
/* Prism.html shell CSS — dark defaults at :root … */
:root{ … --cs-nav-link:#b6c2d0; --cs-nav-title:#e9ebed; --cs-brand-line:#2a3847; … }
/* … flipped by the mode class (NOT by any theme string): */
body.cs-light{ --cs-nav-link:#414d5c; --cs-nav-title:#0f141a; --cs-brand-line:#e9ebed; … }
```

Because chrome is token-driven and mode-flipped centrally, **a theme pack ships ONLY a
`:root` token block** and the entire rail + topnav + focus ring reskin for free in both
modes. `applyTheme(name)` sets `body.cs-light` from `REG_BY_ID[name].mode==='light'`, so a
pack's mode entry alone drives the chrome flip.

> Note for verifiers: rail link `color` carries a `transition:…,color .12s`, so if you
> read `getComputedStyle(link).color` in headless Chrome immediately after `setTheme()` you
> will see the *pre-transition* value mid-animation. Wait > 120 ms before asserting, or the
> parity check reads a false negative. (This tripped the F8 verification once — the token
> itself flips instantly; only the animated `color` property lags.)

---

## The token contract (what every `:root` block defines)

Every pack, in both modes, defines the same token keys — the palette differs, the keys do
not. This is what makes an unmodified component reskin across all packs:

| group        | tokens |
|--------------|--------|
| surfaces     | `--bg` `--panel` `--panel2` `--card` `--line` |
| text         | `--ink` `--muted` `--dim` |
| brand/accent | `--accent` `--accent-rgb` `--accent2` `--info` `--info-rgb` |
| status       | `--pos`/`--pos-rgb` `--warn`/`--warn-rgb` `--neg`/`--neg-rgb` `--crit`/`--crit-rgb` |
| decoration   | `--cardgrad` |

Each chromatic token ships a sibling `*-rgb` triple so components can build `rgba()` tints.
Facets reference these **global** tokens (e.g. `var(--accent)`), never raw brand hex — which
is exactly what the `_check_ds.mjs` token-only check enforces for packs.

---

## Verifying a pack against the reference

The same checks that confirm Cloudscape's parity apply to any pack:

1. **Registry** — two entries (`<ds>-dark`, `<ds>-light`), each `css` a `:root`-only block;
   `mode` correct so `body.cs-light` flips; `accent` set per mode.
2. **MCP mirror matches** — `THEMES[]` base/override values equal the app registry's `:root`
   values (the mirror is transcribed, not computed from the HTML).
3. **`:root`-only** — the `css` const contains no rule outside `:root{…}` (no `.sr-*`, no
   `body`, no `@media`); chrome flips come from `body.cs-light`, not the theme.
4. **Both modes reskin** — shell chrome, every gallery iframe, and the Showcase page all
   flip live on `setTheme()` with no reload (mind the 120 ms `color` transition when
   measuring).
5. **Coverage** — `node catalog/_check_ds.mjs --only <ds>` passes once the 100 facets exist.

Cloudscape passes all five today; a scaffolded pack that mirrors this structure passes the
same way (coverage pends its facets).
