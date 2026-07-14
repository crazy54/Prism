# Prism new-facet authoring spec (2026-07 drop)

You are authoring **30 new self-contained facets** for ONE Prism gallery, written to a single
draft fragment file. A later splice step inserts your fragment into `Prism.html` between the last
gallery's closing `</div>` and the wrap-closing `</div>`. Then a headless-Chrome check verifies
every new facet animates, is styled, and throws no console errors.

## HARD RULES (violating any = the facet is rejected)
1. **Self-contained. No third-party libs, CDNs, fonts, images, or network.** Pure HTML + CSS, plus
   tiny inline JS ONLY if the effect cannot be done in CSS (and then it must be idempotent and
   scoped — no global leaks, wrap in `(function(){ ... })();`).
2. **Namespace every new class/keyframe** with your gallery prefix + `2026` era to avoid collisions
   with existing classes (see per-gallery prefix below). e.g. `.n3d-cube`, `@keyframes n3dSpin`.
   Grep the file first — DO NOT reuse an existing class or keyframe name.
3. **Every new item gets `is-new`** on its outer `.tile`/`.panel` (green NEW badge is auto-applied).
4. Use the shared design tokens for color: `var(--accent)` #ff9900, `var(--info)` #4493f8,
   `var(--pos)` #3fb950, `var(--warn)`, `var(--neg)`, `var(--crit)`, `var(--ink)`, `var(--muted)`,
   `var(--panel)`, `var(--panel2)`, `var(--line)`, and their `-rgb` variants. NEVER hardcode the
   theme background — effects must survive theme swaps (Prism/OLED/Cyberpunk).
5. Respect `@media(prefers-reduced-motion:reduce)` for anything that moves a lot (pause/steady it).
6. Your fragment is CSS + markup only. Put all your CSS in ONE `<style>` block at the TOP of the
   fragment, then the section header(s) + gallery/grid of tiles. If you need inline JS, put it in
   ONE `<script>` at the END of the fragment, fully self-contained.

## Fragment shape (generic)
```html
<style>
/* ==== <gallery> 2026 new facets — namespaced <prefix>-* ==== */
.<prefix>-foo{ ... }
@keyframes <prefix>Foo{ ... }
</style>

<h3 class="sec">🧊 3D &amp; Perspective</h3>
<div class="gallery">
  <!-- tiles here, see per-gallery markup -->
</div>
<!-- optionally more <h3 class="sec">...<div class="gallery">... sections -->

<script>/* only if needed, self-contained IIFE */</script>
```

## Per-gallery markup (COPY THIS EXACTLY for your gallery)

### charts  — prefix `n3d`/`ncx2`  — container `.tile` with `data-c`, copy via `copyViz`
Valid `data-c` values: kpi, gauge, progress, trend, compare, status, health, fleet, logs, session,
trace, pie, **3d**, advanced, density, rankflow, more, live. Put 3D items under `data-c="3d"`.
```html
<div class="tile is-new" data-c="3d"><div class="stage">
  <div class="n3d-cube"> ...effect markup... </div>
</div><div class="meta"><div class="nm">Effect Name</div><span class="ref">.n3d-cube</span><div class="desc">One-sentence what/when.</div><button class="copy" onclick="copyViz(this)">Copy</button></div></div>
```

### fx  — prefix `nfx2`  — container `.tile` with `data-c`, copy via `data-snip`
`data-c` one of: pos, neg, warn, info, crit, accent. Effects apply to a demo `.el-card`/`.el-kpi`
etc. via a `c-*` color class + your `fx-*`/`nfx2-*` class. `data-snip` is the copy-paste class string.
```html
<div class="tile is-new" data-c="info"><div class="stage"><div class="el-card c-info nfx2-foo"><div class="n">Demo</div><div class="l">label</div></div></div>
  <div class="meta"><div class="nm">Effect Name</div><span class="ref">.nfx2-foo</span><div class="desc">What/when.</div><button class="copy" data-snip='class="el-card c-info nfx2-foo"'>Copy snippet</button></div></div>
```

### lab  — prefix `nlab2`  — container `.tile`, copy via `cpy(this)`; ref shows `keyframe · duration`
```html
<div class="tile is-new"><div class="stage"><div class="box" style="animation:nlab2Foo 1.6s ease infinite"> ⬡ </div></div><div class="meta"><div class="nm">Effect Name</div><div class="ref">nlab2Foo · 1.6s</div><button class="copy" onclick="cpy(this)">Copy</button></div></div>
```
NOTE: lab `cpy(this)` copies the stage inline; keep the effect on an element with an inline
`animation:` referencing your keyframe so the copied snippet is usable, OR on a namespaced class.

### ai  — prefix `nai2`  — container `.panel` inside the `.grid`; copy auto-injected (no button needed)
Panels MUST have `.ptitle` (title, with a `.tdot`) and `.pbody` (the visual). Optional `.cap` caption.
Use `--c` on the panel to theme the dot/accent. Width helpers: `w2` (double width) optional.
```html
<div class="panel is-new" style="--c:var(--info)">
  <div class="ptitle"><span class="tdot"></span>Effect Name</div>
  <div class="pbody"> ...effect markup... </div>
  <div class="cap">Optional one-line caption.</div>
</div>
```

### objects — prefix `nobj2` — container `.tile`; ADD an explicit copy button via `copyViz(this)`
(most old object tiles lack a copy button — new ones SHOULD have one for consistency).
```html
<div class="tile"><div class="stage">
  <div class="nobj2-gizmo"> ...svg/css object... </div>
</div><div class="meta"><div class="nm">Object Name</div><span class="ref">.nobj2-gizmo</span><div class="desc">What it is / when to use.</div><button class="copy" onclick="copyViz(this)">Copy</button></div></div>
```
NOTE: objects has NO copyViz defined in its own scripts. So add copy buttons but ALSO include a tiny
self-contained copyViz fallback in your fragment's trailing `<script>` (guard: `if(!window.copyViz){...}`)
that copies `.stage` innerHTML + a `<style>` note. Keep it simple and idempotent.

### input — prefix `nin2` — container `.tile` with `data-c`, copy via `copyViz`
```html
<div class="tile is-new"><div class="stage"> ...interactive input markup... </div><div class="meta"><div class="nm">Name</div><span class="ref">.nin2-foo</span><div class="desc">What/when.</div><button class="copy" onclick="copyViz(this)">Copy</button></div></div>
```

### text — prefix `ntx2` — container `.tile`, copy via `data-snip`
```html
<div class="tile is-new"><div class="stage"><div class="ntx2-foo">Sample</div></div><div class="meta"><div class="nm">Name</div><span class="ref">.ntx2-foo</span><div class="desc">What/when.</div><button class="copy" data-snip='class="ntx2-foo"'>Copy snippet</button></div></div>
```

### shapes — prefix `nsh2` — container `.tile`, copy via `data-snip`; heavy on 3D tunnels/rings
```html
<div class="tile is-new"><div class="stage"><div class="nsh2-foo">TEXT ON A SHAPE</div></div><div class="meta"><div class="nm">Name</div><span class="ref">.nsh2-foo</span><div class="desc">What/when.</div><button class="copy" data-snip='class="nsh2-foo"'>Copy snippet</button></div></div>
```

## 3D emphasis
charts, objects, shapes: lead with a `<h3 class="sec">🧊 3D &amp; Perspective</h3>` section holding
at least half your 30 as genuine 3D (CSS `transform-style:preserve-3d`, `perspective`, `rotateX/Y`,
`translateZ`). Cubes, prisms, spheres (layered rings), rotating carousels, 3D bar/pie charts, depth
stacks, tunnels, flip-panels, isometric scenes. Make them visibly three-dimensional, not fake.

## Output
Write ONLY the fragment (no ```` ``` ```` fences, no DOCTYPE) to the path you are told. 30 tiles.
Return a short summary: count, section titles, and the list of namespaced classes you introduced.
