/* ============================================================================
   F4 (JFH-37) — Parametric design-system facet generator.
   ----------------------------------------------------------------------------
   Given a design-system PROFILE ({ ds, dsShort, accent, tokenProfile,
   componentSpecs }), emit an additions JSON of exactly 100 native facets for
   that system — the same shape the existing 9 spectrum families use:

     - gallery: "spectrums"
     - each tile tagged data-spectrum="<dsShort>" (joins the MCP family axis),
       data-ctype="<componentType>", data-interact="<interaction>"
     - all styling namespaced under .<dsShort>-root + .<dsShort>-* classes
     - token-only (var(--accent) etc.), self-contained, standalone-copyable
     - every tile carries an always-running animation (so it passes
       catalog/_find_broken.mjs, whose inspector flags no-animation) and a
       prefers-reduced-motion:reduce block that neutralizes it.

   Output merges via the spectrums path in _splice.mjs / _merge_spectrum.mjs and
   regenerates the island via the F3 pipeline.

   Usage:  node catalog/_gen_system.mjs <profile.mjs> [outfile.json]
           node catalog/_gen_system.mjs --self-test
   A profile module default-exports the PROFILE object (see profiles/ for samples).

   Zero deps, node: builtins only, offline.
   ========================================================================== */
import { writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ helpers */
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// HTML-escape for text that lands inside tile markup (names, labels, glyphs are
// authored trusted, but escape to keep the island/HTML well-formed).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ archetypes
   Each archetype is a visual pattern rendered in the system's tokens. It maps to
   one of the 8 canonical spectrum component types. A facet = (archetype × accent
   variant). We spread across component types so a system reads as a whole design
   language, not 100 of one thing. Every archetype emits:
     - css(ns): namespaced rules INCLUDING at least one @keyframes + a rule that
       runs it (guarantees _find_broken sees a running animation), plus real
       surface styling (border-radius / background / border).
     - html(ns, v): the demo markup for accent variant v.
   `ctype` = data-ctype (componentType facet); `interact` = data-interact.
   `motion` names the keyframes so the reduced-motion block can target [class].  */

// A compact palette of accent "roles" that map onto Prism global tokens so facets
// recolor with the active theme. Each variant => one facet instance.
const VARIANTS = [
  { key: 'accent', tok: '--accent', rgb: '--accent-rgb', label: 'Primary' },
  { key: 'info', tok: '--info', rgb: '--info-rgb', label: 'Info' },
  { key: 'pos', tok: '--pos', rgb: '--pos-rgb', label: 'Success' },
  { key: 'warn', tok: '--warn', rgb: '--warn-rgb', label: 'Warning' },
  { key: 'neg', tok: '--neg', rgb: '--neg-rgb', label: 'Danger' },
  { key: 'crit', tok: '--crit', rgb: '--crit-rgb', label: 'Critical' },
];

// The 8 canonical component types the spectrum galleries use.
// Each archetype declares which one it represents.
const ARCHETYPES = [
  {
    slug: 'button', ctype: 'button', interact: 'click auto-play', motion: 'BtnPulse',
    title: 'Pill Button', desc: 'A rounded token-filled button with a soft pulsing glow — the system\'s primary call-to-action.',
    css: (ns) => [
      `@keyframes ${ns}BtnPulse{0%,100%{box-shadow:0 0 0 0 rgba(var(--_rgb),.5)}50%{box-shadow:0 0 0 6px rgba(var(--_rgb),0)}}`,
      `.${ns}-btn{display:inline-flex;align-items:center;gap:8px;padding:9px 18px;border-radius:var(--${ns}-radius,999px);background:var(--_c);color:#fff;font-weight:700;border:0;animation:${ns}BtnPulse 2.4s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<button class="${ns}-btn" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})">${esc(v.label)}</button>`,
  },
  {
    slug: 'toggle', ctype: 'button', interact: 'toggle auto-play', motion: 'TgKnob',
    title: 'Switch Toggle', desc: 'An on/off switch whose knob glides and glows in the token color; a settings-row control.',
    css: (ns) => [
      `@keyframes ${ns}TgKnob{0%,100%{left:2px}50%{left:20px}}`,
      `.${ns}-toggle{position:relative;width:44px;height:24px;border-radius:999px;background:rgba(var(--_rgb),.28);border:1px solid rgba(var(--_rgb),.5)}`,
      `.${ns}-toggle::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--_c);box-shadow:0 0 8px rgba(var(--_rgb),.7);animation:${ns}TgKnob 2.6s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-toggle" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"></div>`,
  },
  {
    slug: 'chip', ctype: 'button', interact: 'auto-play', motion: 'ChipShine',
    title: 'Status Chip', desc: 'A compact filter/label chip with a token tint and a sliding sheen. Used in toolbars and lists.',
    css: (ns) => [
      `@keyframes ${ns}ChipShine{0%{background-position:-160% 0}60%,100%{background-position:260% 0}}`,
      `.${ns}-chip{position:relative;overflow:hidden;display:inline-flex;align-items:center;padding:4px 12px;border-radius:999px;background:rgba(var(--_rgb),.16);border:1px solid rgba(var(--_rgb),.4);color:var(--_c);font-size:12px;font-weight:700}`,
      `.${ns}-chip::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 40%,rgba(var(--_rgb),.4) 50%,transparent 60%);background-size:250% 100%;animation:${ns}ChipShine 3s linear infinite;pointer-events:none}`,
    ],
    html: (ns, v) => `<span class="${ns}-chip" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})">${esc(v.label)}</span>`,
  },
  {
    slug: 'menu', ctype: 'menu', interact: 'hover click', motion: 'MenuSel',
    title: 'Dropdown Menu', desc: 'A surface menu with a highlighted selected row that breathes in the token tint. The system\'s standard menu.',
    css: (ns) => [
      `@keyframes ${ns}MenuSel{0%,100%{background:rgba(var(--_rgb),.12)}50%{background:rgba(var(--_rgb),.26)}}`,
      `.${ns}-menu{min-width:150px;padding:6px;border-radius:var(--${ns}-radius,12px);background:var(--panel2);border:1px solid var(--line)}`,
      `.${ns}-menu .${ns}-mi{padding:7px 10px;border-radius:8px;color:var(--ink);font-size:12px}`,
      `.${ns}-menu .${ns}-sel{color:var(--_c);animation:${ns}MenuSel 2.8s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-menu" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"><div class="${ns}-mi ${ns}-sel">${esc(v.label)}</div><div class="${ns}-mi">Duplicate</div><div class="${ns}-mi">Share…</div></div>`,
  },
  {
    slug: 'notification', ctype: 'notification', interact: 'auto-play', motion: 'NotifIn',
    title: 'Toast Notification', desc: 'A dismissible toast with a token accent bar that slides in on a loop. The system\'s inline alert.',
    css: (ns) => [
      `@keyframes ${ns}NotifIn{0%,100%{transform:translateX(-6px);opacity:.75}50%{transform:translateX(0);opacity:1}}`,
      `.${ns}-toast{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--_c);color:var(--ink);font-size:12px;animation:${ns}NotifIn 3s ease-in-out infinite}`,
      `.${ns}-toast::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--_c);box-shadow:0 0 8px rgba(var(--_rgb),.8)}`,
    ],
    html: (ns, v) => `<div class="${ns}-toast" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})">${esc(v.label)} — saved</div>`,
  },
  {
    slug: 'callout', ctype: 'callout', interact: 'auto-play', motion: 'CalloutEdge',
    title: 'Callout Banner', desc: 'An emphasis banner with a token-tinted fill and a scanning edge highlight. Draws attention inline.',
    css: (ns) => [
      `@keyframes ${ns}CalloutEdge{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}`,
      `.${ns}-callout{position:relative;overflow:hidden;padding:10px 14px;border-radius:10px;background:rgba(var(--_rgb),.1);border:1px solid rgba(var(--_rgb),.35);color:var(--ink);font-size:12px}`,
      `.${ns}-callout::after{content:"";position:absolute;top:0;left:0;height:2px;width:60%;background:linear-gradient(90deg,transparent,var(--_c),transparent);animation:${ns}CalloutEdge 2.6s linear infinite;pointer-events:none}`,
    ],
    html: (ns, v) => `<div class="${ns}-callout" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"><b>${esc(v.label)}:</b> review the changes</div>`,
  },
  {
    slug: 'chart', ctype: 'chart', interact: 'auto-play', motion: 'BarGrow',
    title: 'Mini Bar Chart', desc: 'A tiny token-colored bar chart whose bars rise on a loop. A KPI/trend glance for the system.',
    css: (ns) => [
      `@keyframes ${ns}BarGrow{0%{transform:scaleY(.25)}50%{transform:scaleY(1)}100%{transform:scaleY(.25)}}`,
      `.${ns}-chart{display:flex;align-items:flex-end;gap:5px;height:44px;padding:6px 8px;border-radius:10px;background:var(--panel2);border:1px solid var(--line)}`,
      `.${ns}-chart i{flex:1;background:var(--_c);border-radius:3px 3px 0 0;transform-origin:bottom;animation:${ns}BarGrow 2.4s ease-in-out infinite}`,
      `.${ns}-chart i:nth-child(2){animation-delay:.2s}.${ns}-chart i:nth-child(3){animation-delay:.4s}.${ns}-chart i:nth-child(4){animation-delay:.6s}`,
    ],
    html: (ns, v) => `<div class="${ns}-chart" style="--_c:var(${v.tok})"><i></i><i></i><i></i><i></i></div>`,
  },
  {
    slug: 'input', ctype: 'input', interact: 'auto-play', motion: 'InputCaret',
    title: 'Text Field', desc: 'A labeled input with a token focus ring and a blinking caret. The system\'s form field.',
    css: (ns) => [
      `@keyframes ${ns}InputCaret{0%,49%{opacity:1}50%,100%{opacity:0}}`,
      `.${ns}-field{display:inline-flex;align-items:center;gap:2px;min-width:150px;padding:8px 11px;border-radius:10px;background:var(--panel);border:1px solid var(--_c);box-shadow:0 0 0 3px rgba(var(--_rgb),.18);color:var(--ink);font-size:12px}`,
      `.${ns}-field .${ns}-caret{width:1.5px;height:14px;background:var(--_c);animation:${ns}InputCaret 1.1s step-end infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-field" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})">${esc(v.label)}<span class="${ns}-caret"></span></div>`,
  },
  {
    slug: 'progress', ctype: 'chart', interact: 'auto-play', motion: 'Prog',
    title: 'Progress Bar', desc: 'A track with a token fill that advances on a loop. Determinate-style progress for the system.',
    css: (ns) => [
      `@keyframes ${ns}Prog{0%{width:8%}80%,100%{width:96%}}`,
      `.${ns}-prog{width:150px;height:8px;border-radius:999px;background:rgba(var(--_rgb),.18);overflow:hidden}`,
      `.${ns}-prog i{display:block;height:100%;border-radius:inherit;background:var(--_c);box-shadow:0 0 8px rgba(var(--_rgb),.6);animation:${ns}Prog 3s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-prog" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"><i></i></div>`,
  },
  {
    slug: 'avatar', ctype: 'object', interact: 'auto-play', motion: 'AvRing',
    title: 'Avatar Ring', desc: 'A circular avatar wrapped by a rotating token gradient ring — presence/status object.',
    css: (ns) => [
      `@keyframes ${ns}AvRing{to{transform:rotate(1turn)}}`,
      `.${ns}-avatar{position:relative;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--panel2);color:var(--ink);font-weight:800}`,
      `.${ns}-avatar::before{content:"";position:absolute;inset:-3px;border-radius:50%;background:conic-gradient(from 0deg,var(--_c),transparent 55%,var(--_c));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 3px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 3px));animation:${ns}AvRing 3.4s linear infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-avatar" style="--_c:var(${v.tok})">${esc(v.label.slice(0, 1))}</div>`,
  },
  {
    slug: 'badge', ctype: 'object', interact: 'auto-play', motion: 'BadgePop',
    title: 'Count Badge', desc: 'A number badge that pops on a heartbeat, tinted by the token color. Notification counter object.',
    css: (ns) => [
      `@keyframes ${ns}BadgePop{0%,100%{transform:scale(1)}30%{transform:scale(1.25)}}`,
      `.${ns}-badge{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--_c);color:#fff;font-size:11px;font-weight:800;animation:${ns}BadgePop 2s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<span class="${ns}-badge" style="--_c:var(${v.tok})">9</span>`,
  },
  {
    slug: 'tab', ctype: 'segmented-control', interact: 'toggle auto-play', motion: 'TabSlide',
    title: 'Segmented Tabs', desc: 'A pill-track segmented control with a token active indicator that slides between segments.',
    css: (ns) => [
      `@keyframes ${ns}TabSlide{0%,100%{left:2px}50%{left:calc(50% + 1px)}}`,
      `.${ns}-tabs{position:relative;display:inline-flex;padding:3px;border-radius:999px;background:var(--panel2);border:1px solid var(--line)}`,
      `.${ns}-tabs span{position:relative;z-index:1;padding:5px 14px;font-size:12px;color:var(--ink)}`,
      `.${ns}-tabs::before{content:"";position:absolute;top:3px;bottom:3px;width:calc(50% - 3px);left:2px;border-radius:999px;background:rgba(var(--_rgb),.9);animation:${ns}TabSlide 3.2s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-tabs" style="--_rgb:var(${v.rgb})"><span>On</span><span>Off</span></div>`,
  },
  {
    slug: 'tooltip', ctype: 'callout', interact: 'auto-play', motion: 'TipFloat',
    title: 'Tooltip', desc: 'A small floating tooltip with a token border that bobs gently. Contextual hint for the system.',
    css: (ns) => [
      `@keyframes ${ns}TipFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`,
      `.${ns}-tip{display:inline-block;padding:6px 10px;border-radius:8px;background:var(--panel2);border:1px solid var(--_c);color:var(--ink);font-size:11px;box-shadow:0 4px 14px rgba(var(--_rgb),.3);animation:${ns}TipFloat 2.6s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<span class="${ns}-tip" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})">${esc(v.label)}</span>`,
  },
  {
    slug: 'spinner', ctype: 'object', interact: 'auto-play', motion: 'Spin',
    title: 'Loading Spinner', desc: 'A token-colored arc spinner. The system\'s indeterminate loading indicator.',
    css: (ns) => [
      `@keyframes ${ns}Spin{to{transform:rotate(1turn)}}`,
      `.${ns}-spinner{width:26px;height:26px;border-radius:50%;border:3px solid rgba(var(--_rgb),.22);border-top-color:var(--_c);animation:${ns}Spin 1s linear infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-spinner" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"></div>`,
  },
  {
    slug: 'card', ctype: 'object', interact: 'auto-play', motion: 'CardGlow',
    title: 'Feature Card', desc: 'A surface card with a token accent header and a slow edge glow. The system\'s content container.',
    css: (ns) => [
      `@keyframes ${ns}CardGlow{0%,100%{box-shadow:0 0 0 1px var(--line)}50%{box-shadow:0 0 16px rgba(var(--_rgb),.4)}}`,
      `.${ns}-card{width:150px;padding:12px;border-radius:var(--${ns}-radius,12px);background:var(--card);color:var(--ink);animation:${ns}CardGlow 3.4s ease-in-out infinite}`,
      `.${ns}-card b{color:var(--_c);font-size:12px}.${ns}-card p{margin:4px 0 0;font-size:11px;color:var(--muted)}`,
    ],
    html: (ns, v) => `<div class="${ns}-card" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"><b>${esc(v.label)}</b><p>Design-system card surface.</p></div>`,
  },
  {
    slug: 'checkbox', ctype: 'input', interact: 'toggle auto-play', motion: 'CheckIn',
    title: 'Checkbox', desc: 'A token-filled checkbox whose tick draws in on a loop. The system\'s boolean input.',
    css: (ns) => [
      `@keyframes ${ns}CheckIn{0%,20%{clip-path:inset(0 100% 0 0)}60%,100%{clip-path:inset(0 0 0 0)}}`,
      `.${ns}-check{position:relative;width:22px;height:22px;border-radius:6px;background:var(--_c);display:grid;place-items:center}`,
      `.${ns}-check::after{content:"✓";color:#fff;font-size:14px;font-weight:900;animation:${ns}CheckIn 2.4s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-check" style="--_c:var(${v.tok})"></div>`,
  },
  {
    slug: 'slider', ctype: 'input', interact: 'auto-play', motion: 'SliderThumb',
    title: 'Range Slider', desc: 'A track with a token thumb that travels along it. The system\'s range input.',
    css: (ns) => [
      `@keyframes ${ns}SliderThumb{0%,100%{left:2px}50%{left:calc(100% - 16px)}}`,
      `.${ns}-slider{position:relative;width:150px;height:6px;border-radius:999px;background:rgba(var(--_rgb),.2)}`,
      `.${ns}-slider::before{content:"";position:absolute;top:-5px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--_c);box-shadow:0 0 8px rgba(var(--_rgb),.6);animation:${ns}SliderThumb 3s ease-in-out infinite}`,
    ],
    html: (ns, v) => `<div class="${ns}-slider" style="--_c:var(${v.tok});--_rgb:var(${v.rgb})"></div>`,
  },
];

/* ---------------------------------------------------------------- generation */
export function generateSystem(profile) {
  const { ds, dsShort } = profile;
  const ns = kebab(dsShort);
  if (!ns) throw new Error('profile.dsShort is required and must be non-empty');

  // Deterministic spread: iterate (archetype × variant) round-robin until we hit
  // exactly TARGET facets. This yields a balanced mix across component types.
  const TARGET = 100;
  const tiles = [];
  const cssBlocks = [];
  const seenCss = new Set();
  const seenId = new Set();

  // Per-facet projection: each entry is a standalone { id, name, gallery, html, css, … }
  // exactly as the extractor stores it in the island, so the MCP validateFacet can
  // validate each facet on its own (it validates per-facet, not the combined block).
  const facets = [];
  // Reduced-motion, scoped per archetype so a facet's own css neutralizes its own motion.
  const rmFor = (a) =>
    `@media(prefers-reduced-motion:reduce){.${ns}-${a.slug},.${ns}-${a.slug}::before,.${ns}-${a.slug}::after,` +
    `.${ns}-${a.slug} *,.${ns}-${a.slug} *::before,.${ns}-${a.slug} *::after{animation:none!important}}`;

  let made = 0;
  // Outer loop over variants, inner over archetypes → interleaves component types
  // so the first N are not all buttons. Stop exactly at TARGET.
  outer:
  for (let vi = 0; vi < VARIANTS.length; vi++) {
    for (let ai = 0; ai < ARCHETYPES.length; ai++) {
      if (made >= TARGET) break outer;
      const a = ARCHETYPES[ai];
      const v = VARIANTS[vi];

      const archCss = a.css(ns); // array of rules for this archetype
      // Emit this archetype's CSS once into the combined block (variant-independent;
      // color comes from inline --_c/--_rgb).
      if (!seenCss.has(a.slug)) {
        seenCss.add(a.slug);
        archCss.forEach((rule) => cssBlocks.push(rule));
      }

      const id = `${ns}-${a.slug}-${v.key}`;
      if (seenId.has(id)) continue;
      seenId.add(id);

      const inner = a.html(ns, v);
      const name = `${a.title} · ${v.label}`;
      const desc = a.desc;
      const ref = `.${ns}-${a.slug}`;
      const snip = inner.replace(/'/g, '&#39;'); // safe inside single-quoted data-snip
      tiles.push(
        `<div class="tile is-new" data-fx-id="${id}" data-spectrum="${ns}" data-ctype="${a.ctype}" data-interact="${a.interact}">` +
        `<div class="stage"><div class="${ns}-root">${inner}</div></div>` +
        `<div class="meta"><div class="nm">${esc(name)}</div><span class="ref">${esc(ref)}</span>` +
        `<div class="desc">${esc(desc)}</div>` +
        `<div class="row"><button class="copy" data-snip='${snip}'>Copy snippet</button></div></div></div>`
      );

      // Standalone facet: its own css is this archetype's rules + a scoped reduced-motion
      // block. self-contained (carries all its own CSS), animated, tagged with the family.
      facets.push({
        id, name, gallery: 'spectrums', category: `${ds}`, ref,
        description: desc, html: inner, css: [...archCss, rmFor(a)].join('\n'),
        componentType: a.ctype, interaction: a.interact, spectrum: ns,
        selfContained: false, needsJs: null, isNew: true,
        tags: ['spectrums', ns, a.ctype, 'animated', 'new'],
      });
      made++;
    }
  }

  if (made !== TARGET) {
    throw new Error(`Generator produced ${made} facets, expected ${TARGET}. Add more archetypes/variants (have ${ARCHETYPES.length}×${VARIANTS.length}=${ARCHETYPES.length * VARIANTS.length}).`);
  }

  // Root token profile: the system's tokenProfile mapped onto a namespaced root
  // (mirrors .mat-root etc). Optional radius/extra tokens flow through.
  const rootDecls = Object.entries(profile.tokenProfile || {})
    .map(([k, val]) => `${k.startsWith('--') ? k : '--' + ns + '-' + kebab(k)}:${val}`).join(';');
  const rootRule = `.${ns}-root{${rootDecls}${rootDecls ? ';' : ''}font-family:var(--${ns}-font,inherit)}`;

  // One reduced-motion block that neutralizes every animation in this system.
  const rmBlock =
    `@media(prefers-reduced-motion:reduce){` +
    `.${ns}-root [class*="${ns}-"],.${ns}-root [class*="${ns}-"]::before,.${ns}-root [class*="${ns}-"]::after,` +
    `.${ns}-root [class],.${ns}-root [class]::before,.${ns}-root [class]::after{animation:none!important}}`;

  const css = [
    `/* ===== ${ds} — ${made} native facets (data-spectrum="${ns}"). Token-driven, self-contained. ===== */`,
    rootRule,
    ...cssBlocks,
    rmBlock,
  ].join('\n');

  return {
    gallery: 'spectrums',
    sectionLabel: `◆ ${ds}`,
    containerClass: 'gallery',
    spectrum: ns,
    css,
    tiles,
    facets, // per-facet standalone projection (for MCP validateFacet + island parity)
  };
}

/* ---------------------------------------------------------------- self-test */
function selfTest() {
  const demo = {
    ds: 'Demo System', dsShort: 'demo', accent: '#539fe5',
    tokenProfile: { '--demo-radius': '14px', accentInk: '#fff' },
  };
  const out = generateSystem(demo);
  const problems = [];
  if (out.tiles.length !== 100) problems.push(`tile count ${out.tiles.length} !== 100`);
  const ids = out.tiles.map((t) => (t.match(/data-fx-id="([^"]+)"/) || [])[1]);
  if (new Set(ids).size !== ids.length) problems.push('duplicate ids');
  const idRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  ids.forEach((id) => { if (!idRe.test(id)) problems.push(`bad id ${id}`); });
  out.tiles.forEach((t) => {
    if (!/data-spectrum="demo"/.test(t)) problems.push('tile missing data-spectrum');
    if (!/class="nm"/.test(t)) problems.push('tile missing name');
  });
  // balanced brace check on the whole CSS
  let depth = 0; for (const ch of out.css) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  if (depth !== 0) problems.push(`unbalanced css braces (depth ${depth})`);
  if (!/prefers-reduced-motion/.test(out.css)) problems.push('no reduced-motion block');
  if (problems.length) { console.error('SELF-TEST FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`self-test OK: 100 facets, ${new Set(ids).size} unique ids, ${out.css.split('\n').length} css lines, balanced braces, reduced-motion present.`);
}

/* ---------------------------------------------------------------- cli */
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const arg = process.argv[2];
  if (arg === '--self-test') { selfTest(); }
  else if (!arg) { console.error('Usage: node catalog/_gen_system.mjs <profile.mjs> [out.json]  |  --self-test'); process.exit(1); }
  else {
    const profileMod = await import(pathToFileURL(resolve(arg)).href);
    const profile = profileMod.default || profileMod.PROFILE;
    if (!profile) { console.error('Profile module must default-export the PROFILE object.'); process.exit(1); }
    const out = generateSystem(profile);
    const outFile = process.argv[3] ? resolve(process.argv[3]) : resolve(HERE, 'additions', kebab(profile.dsShort) + '.json');
    writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(`wrote ${basename(outFile)}: ${out.tiles.length} facets (spectrum="${out.spectrum}")`);
  }
}
