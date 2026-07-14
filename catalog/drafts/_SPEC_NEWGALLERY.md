# Prism NEW-GALLERY body authoring spec

You are authoring the BODY CONTENT for ONE brand-new Prism gallery. You write TWO files:
- `catalog/drafts/<id>.body.html`  — the section headers + `.gallery` grids of tiles (NO <html>/<head>/<body>, NO <style>, NO <script>; just the content that goes inside `<div class="wrap">…</div>`)
- `catalog/drafts/<id>.css`         — ALL your gallery-specific CSS (raw CSS, NO `<style>` tags)

A scaffold step wraps these in a full page template (design tokens, page chrome, `.tile`/`.meta`/`.gallery`/`h3.sec` CSS, and the copy helper are ALL PROVIDED — do not redefine them). Then it's spliced into Prism.html and render-verified in headless Chrome.

## HARD RULES
1. **Self-contained, offline. NO third-party libs, CDNs, fonts, images, network, or `<img src=http…>`.** Pure HTML + CSS. Tiny inline JS only if an effect truly needs it — put it in a SINGLE `<script>` at the very END of the body file, wrapped in an idempotent IIFE `(function(){ ... })();`, no global leaks. Prefer zero JS.
2. **Namespace every class + keyframe** with the gallery prefix you're given (e.g. `mp-`, `ns-`, `arch-`, `cal-`). Grep Prism.html first so you never collide with an existing class/keyframe.
3. **Every tile gets `is-new`** on its outer `.tile` (green NEW badge auto-applied by the shell).
4. Use design tokens for ALL color: `var(--accent)`#ff9900, `var(--info)`#4493f8, `var(--pos)`#3fb950, `var(--warn)`#e0a52b, `var(--neg)`#f85149, `var(--crit)`#c879ff, plus `var(--ink) --muted --dim --panel --panel2 --card --line`, and the `-rgb` triplet variants (e.g. `rgba(var(--info-rgb),.2)`). NEVER hardcode the page background. Effects must survive theme swaps.
5. Honor reduced motion: the scaffold adds a global `@media(prefers-reduced-motion:reduce)` damper, but don't rely on motion for legibility — every tile must read clearly at a random frozen frame (this is screenshot-QA'd).
6. Aim for continuous, ambient animation where it fits (loops), never a state that sits fully empty/blank at rest.

## Tile markup (COPY EXACTLY)
Each tile:
```html
<div class="tile is-new"><div class="stage">
  <div class="<prefix>-foo"> …the visual… </div>
</div><div class="meta"><div class="nm">Effect Name</div><span class="ref">.<prefix>-foo</span><div class="desc">One concise sentence: what it is / when to use it.</div><button class="copy" onclick="copyViz(this)">Copy</button></div></div>
```
Group tiles under section headers: `<h3 class="sec">SECTION TITLE</h3><div class="gallery"> …tiles… </div>`. Use 4–7 sections that organize your 50 tiles logically.

## Copy button
- Default: `<button class="copy" onclick="copyViz(this)">Copy</button>` — copies the `.stage` innerHTML + the CSS rules it uses (the helper extracts matching class rules + keyframes automatically, so namespacing matters).
- If the effect is best applied as a class to the user's own element (not a whole widget), you MAY instead use `<button class="copy" data-snip='class="<prefix>-foo"'>Copy snippet</button>`.

## Output
Write EXACTLY 50 tiles total across your sections. Return a short summary: tile count, section titles, and the full list of namespaced classes + keyframes you introduced. Do NOT edit Prism.html or the scaffold. Only write your two draft files.
