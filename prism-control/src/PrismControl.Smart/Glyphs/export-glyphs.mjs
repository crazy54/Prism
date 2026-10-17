// Exports Prism Deck's glyph library (48-unit, role-based geometry) to prism-glyphs.json for the Smart module.
// Read-only use of prism-deck: it imports the glyph registry and draws each glyph once per state at a settled
// instant (arrival animations finished, not pressed), then writes plain primitives (absolute path data in grid
// units, role, fill, stroke weight multiplier, opacity, caps, dash) that C# paints with SvgDocument.
//
//   node src/PrismControl.Smart/Glyphs/export-glyphs.mjs [<prism-deck root>] [<out.json>]
//
// Defaults: Prism-ds/prism-deck next to the Prism-control folder (five levels up from this script) and
// prism-glyphs.json next to this script. Zero dependencies (Node built-ins only). Re-run when prism-deck adds or changes glyphs.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const deckRoot = resolve(process.argv[2] || join(here, '../../../../../Prism-ds/prism-deck'));
const out = resolve(process.argv[3] || join(here, 'prism-glyphs.json'));
const imp = (rel) => import(pathToFileURL(join(deckRoot, rel)).href);

const registry = await imp('src/glyphs/_registry.js');
const { allGlyphs, glyphRegistry } = registry;
const { drawGlyph, GRID, SAFE } = await imp('src/glyphs/_glyph.js');
const { transformPath } = await imp('src/scene/geom.js');

const { problems } = glyphRegistry();
if (problems.length) { console.error('prism-deck glyph registry problems:\n  ' + problems.join('\n  ')); process.exit(1); }

// 2D affine matrices [a b c d e f] from SVG transform strings (translate / rotate / scale / matrix, as Pen emits them).
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function parseTransform(s) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of String(s).matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let t;
    if (fn === 'translate') t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (fn === 'scale') t = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (fn === 'matrix') t = v;
    else if (fn === 'rotate') {
      const r = (v[0] * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), cx = v[1] || 0, cy = v[2] || 0;
      t = mul(mul([1, 0, 0, 1, cx, cy], [cs, sn, -sn, cs, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else throw new Error(`unsupported transform ${fn}`);
    m = mul(m, t);
  }
  return m;
}

const r2 = (v) => Math.round(v * 1000) / 1000;
const glyphs = {};
let primCount = 0;
for (const g of allGlyphs().sort((a, b) => a.id.localeCompare(b.id))) {
  const frames = {};
  for (const state of g.stateNames) {
    // Settled: arrived long ago, not pressed; animated glyphs sit at a quarter of their loop (a mid, readable pose).
    const t = (g.loop || 1) * 0.25;
    const { pen } = drawGlyph(g, { state, t, since: 60, pressed: false, pressAge: Infinity, value: 0.6, level: 0.6 });
    frames[state] = pen.flat().map((p) => {
      let m = [1, 0, 0, 1, 0, 0];
      for (const tf of p.transforms) m = mul(m, parseTransform(tf));
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const prim = { d: transformPath(p.d, m), role: p.role, fill: !!p.fill };
      const w = (p.weight ?? 1) * scale;
      if (!prim.fill && Math.abs(w - 1) > 1e-3) prim.w = r2(w);
      if ((p.opacity ?? 1) < 0.999) prim.o = r2(p.opacity);
      if (p.cap) prim.cap = p.cap;
      if (p.join) prim.join = p.join;
      if (p.dash) prim.dash = p.dash.map((x) => r2(x * scale));
      if (p.text) prim.text = true;
      primCount++;
      return prim;
    }).filter((p) => p.d && p.d.length > 1 && (p.o ?? 1) > 0.01);
  }
  glyphs[g.id] = { title: g.title, category: g.category, tags: g.tags, states: g.states, defaultState: g.defaultState, frames };
}

// Aliases (prism-deck src/glyphs/_aliases.js, when the registry has them): other names for existing glyphs
// ("trash" → delete, "pause" → play-pause showing its pause bars). Each is written as a full entry (the
// target's frames, its own default state) plus "alias": <target id>, so GlyphLibrary needs no changes.
const aliasList = typeof registry.glyphAliases === 'function' ? registry.glyphAliases() : [];
for (const a of aliasList) {
  const t = glyphs[a.glyph];
  if (!t || glyphs[a.name]) continue;
  glyphs[a.name] = { ...t, defaultState: a.state && t.frames[a.state] ? a.state : t.defaultState, alias: a.glyph };
}

const deckPkg = JSON.parse(readFileSync(join(deckRoot, 'package.json'), 'utf8'));
const data = {
  format: 'prism-glyphs/1',
  source: `prism-deck ${deckPkg.version ?? ''} src/glyphs`.trim(),
  grid: GRID,
  safe: SAFE,
  // The Prism theme's role styles (src/themes/prism.js): widths in grid units at 48.
  roles: { line: { width: 2.6 }, fill: {}, accent: { width: 2.8 }, dim: { width: 2.2, opacity: 0.85 }, spark: {} },
  glyphs,
};
const json = JSON.stringify(data);
data.sha256 = createHash('sha256').update(json).digest('hex');
writeFileSync(out, JSON.stringify(data, null, 0) + '\n');
console.log(`wrote ${out}: ${Object.keys(glyphs).length - aliasList.length} glyphs + ${aliasList.length} aliases, ${primCount} primitives, ${(json.length / 1024).toFixed(1)} KiB`);
