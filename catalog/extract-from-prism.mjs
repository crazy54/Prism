/* ============================================================================
   Prism catalog extractor (current path) → manifest.json + index.json
   ----------------------------------------------------------------------------
   The original extract-manifest.mjs read standalone _merged-originals/*.html via
   Playwright. Those source files no longer exist and Playwright isn't installed;
   the source of truth is now the pg-* templates INSIDE Prism.html. This extractor
   loads Prism.html in headless Chrome (CDP, no deps), drives the SPA to each
   gallery, and runs the same in-page extraction against the live iframe DOM.

   Run: node catalog/extract-from-prism.mjs
   Then: node catalog/_embed-catalog.mjs   (embeds manifest into the #prism-catalog island)
   ========================================================================== */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveChrome } from './_chrome.mjs';
import { EXTRACT_FN } from './extract-in-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = HERE;
// PRISM_HTML lets tooling point the extractor at an alternate file (e.g. a temp copy
// with staged additions) for verification; defaults to the repo's Prism.html.
const TARGET = process.env.PRISM_HTML ? resolve(process.env.PRISM_HTML) : resolve(HERE, '../Prism.html');
const FILE = 'file://' + TARGET.replace(/\\/g, '/');
const CHROME = resolveChrome();
const PORT = 9366;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const GALLERIES = [
  { gallery: 'charts', title: 'Charts & Metrics' },
  { gallery: 'fx', title: 'FX Store' },
  { gallery: 'lab', title: 'Animation Lab' },
  { gallery: 'ai', title: 'AI Working' },
  { gallery: 'objects', title: 'Animated Objects' },
  { gallery: 'input', title: 'Input Methods' },
  { gallery: 'text', title: 'Text Effects' },
  { gallery: 'shapes', title: 'Text Shapes' },
  { gallery: 'maps', title: 'Maps & Geo' },
  { gallery: 'notify', title: 'Notifications & Status' },
  { gallery: 'arch', title: 'Architecture Diagrams' },
  { gallery: 'callouts', title: 'Callouts & Annotations' },
  // These three are real content galleries with pg-* templates + nav links in
  // Prism.html. Omitting them silently dropped 433 effects (obsidian 130,
  // menus 37, spectrums 266), leaving a 1235-effect manifest vs the island's
  // 1668 — the stale-manifest root cause. Titles match the #prism-catalog island.
  { gallery: 'obsidian', title: 'Obsidian Facets' },
  { gallery: 'menus', title: 'Menus & Actions' },
  { gallery: 'spectrums', title: 'Spectrums' },
];

// extractInPage() lives in ./extract-in-page.mjs (shared with the island-sync tool).


let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => { const m = ++id; ws.send(JSON.stringify({ id: m, method, params })); return new Promise(r => pending.set(m, r)); };

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + mkdtempSync(tmpdir() + '/prism-'),
  'about:blank',
], { stdio: 'ignore' });

try {
  let target;
  for (let i = 0; i < 40; i++) {
    try { const j = await (await fetch(`http://localhost:${PORT}/json`)).json();
      target = j.find(t => t.type === 'page'); if (target) break; } catch {}
    await sleep(150);
  }
  if (!target) throw new Error('no devtools target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: FILE });
  await sleep(2600);

  const all = []; const byGallery = {}; const failures = [];
  // Signature of the previously-extracted gallery. If a navigation silently fails the
  // iframe still holds the PREVIOUS gallery, and extractInPage happily relabels those
  // tiles with the requested gallery's id prefix. That is exactly how one run wrote 37
  // "menus" tiles out as spectrums-* ids and dropped 1129 real spectrum facets, with a
  // clean exit code. Comparing consecutive signatures turns that into a hard failure.
  let prevSig = null, prevGallery = null;
  const sigOf = recs => recs.map(r => r.ref + '|' + r.name).join('\n');

  for (const g of GALLERIES) {
    // Navigate via the shell's own router. The old path clicked a[data-page="<gallery>"],
    // but Spectrums has no rail link at all (it is in PAGES; it is not in the rail), so
    // querySelector returned null and `if(a)a.click()` no-opped in silence.
    // window.PrismShell.go() is the supported entry point and routes every PAGES id.
    const nav = await send('Runtime.evaluate', { returnByValue: true, expression:
      `(function(){
         try{ if(window.PrismShell&&window.PrismShell.go){ window.PrismShell.go(${JSON.stringify(g.gallery)}); return 'api'; } }catch(e){}
         var a=document.querySelector('a[data-page=${JSON.stringify(g.gallery)}]');
         if(a){ a.click(); return 'click'; }
         return 'none';
       })()` });
    if (nav.result.value === 'none') {
      console.log(g.gallery.padEnd(9), 'ERROR: unroutable (no PrismShell.go, no rail link)');
      failures.push(g.gallery); continue;
    }

    // Wait for the frame to settle rather than trusting a flat 3.2s. Spectrums alone is
    // ~1.2k tiles and keeps rendering well past any fixed sleep, so poll until the tile
    // count stops growing (two identical non-zero samples) — big galleries can't truncate.
    const countExpr = `(function(){var f=document.getElementById('gv'),d=f&&f.contentDocument;
      if(!d||d.readyState==='loading')return -1;return d.querySelectorAll('.tile,.panel').length;})()`;
    let last = -1, stable = 0;
    for (let i = 0; i < 100; i++) {          // 100 x 300ms = 30s ceiling
      await sleep(300);
      const c = await send('Runtime.evaluate', { expression: countExpr, returnByValue: true });
      const n = c.result.value;
      if (n > 0 && n === last) { if (++stable >= 2) break; } else stable = 0;
      last = n;
    }

    // Run extraction inside the top frame, resolving the iframe document, passing it to the ported fn.
    const expr = `(function(){
      ${EXTRACT_FN}
      var f=document.getElementById('gv'); var d=f&&f.contentDocument;
      if(!d) return JSON.stringify({err:'no iframe doc'});
      try { return JSON.stringify(extractInPage(${JSON.stringify(g.gallery)}, d)); }
      catch(e){ return JSON.stringify({err:String(e&&e.message||e)}); }
    })()`;
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    let recs; try { recs = JSON.parse(r.result.value); } catch { recs = { err: 'parse ' + r.result.value?.slice(0, 120) }; }
    if (recs.err) { console.log(g.gallery.padEnd(9), 'ERROR:', recs.err); failures.push(g.gallery); continue; }
    if (!recs.length) { console.log(g.gallery.padEnd(9), 'ERROR: 0 effects extracted'); failures.push(g.gallery); continue; }
    const sig = sigOf(recs);
    if (sig === prevSig) {
      console.log(g.gallery.padEnd(9), `ERROR: stale frame — byte-identical to "${prevGallery}" (navigation did not take)`);
      failures.push(g.gallery); prevSig = sig; prevGallery = g.gallery; continue;
    }
    prevSig = sig; prevGallery = g.gallery;
    recs.forEach(x => { x.galleryTitle = g.title; });
    byGallery[g.gallery] = { title: g.title, count: recs.length, effects: recs };
    all.push(...recs);
    console.log(g.gallery.padEnd(9), String(recs.length).padStart(4), 'effects');
  }

  if (failures.length) {
    // Throw rather than process.exit() so the finally block still kills Chrome.
    console.error('\nRefusing to write a partial catalog. manifest.json / index.json are unchanged.');
    throw new Error(`${failures.length} of ${GALLERIES.length} galleries did not extract: ${failures.join(', ')}`);
  }

  // Reuse the same tokens + usage blocks as the original manifest (kept identical).
  const tokens = {
    css: ':root{--bg:#0b0e17;--panel:#121623;--panel2:#171d2e;--card:#141b2b;--line:#243049;'
      + '--ink:#eaf1f9;--muted:#8593a8;--dim:#5b6678;'
      + '--crit:#c879ff;--crit-rgb:200,121,255;--neg:#f85149;--neg-rgb:248,81,73;'
      + '--warn:#e0a52b;--warn-rgb:224,165,43;--pos:#3fb950;--pos-rgb:63,185,80;'
      + '--info:#4493f8;--info-rgb:68,147,248;--accent:#ff9900;--accent-rgb:255,153,0;'
      + '--cardgrad:linear-gradient(157deg,rgba(255,255,255,.05),rgba(255,255,255,0) 55%)}'
      + '.c-crit{--c:var(--crit);--c-rgb:200,121,255}.c-neg{--c:var(--neg);--c-rgb:248,81,73}'
      + '.c-warn{--c:var(--warn);--c-rgb:224,165,43}.c-pos{--c:var(--pos);--c-rgb:63,185,80}'
      + '.c-info{--c:var(--info);--c-rgb:68,147,248}.c-accent{--c:var(--accent);--c-rgb:255,153,0}',
    note: 'Include once globally. Effects read --c/--c-rgb for color and --bg/--ink/etc for theming.',
  };

  const manifest = {
    name: 'prism-effects', version: '1.0.0', generated: 'EXTRACTOR_RUN',
    description: 'Catalog of offline, self-contained CSS/SVG animations, effects, components and backdrops, structured for programmatic composition (e.g. an MCP server).',
    galleries: Object.keys(byGallery).map(k => ({ id: k, title: byGallery[k].title, count: byGallery[k].count })),
    categories: [...new Set(all.map(r => r.gallery + ' / ' + r.category))],
    tokens,
    usage: {
      compose: 'To use an effect: ensure tokens.css is present once globally; insert effect.html; include effect.css; if effect.needsJs, run initializers[effect.needsJs].js once after insertion.',
      recolor: 'If params.color is present, set --c and --c-rgb (or add a c-* class) on the effect element to recolor it.',
      markers: 'tags include "new" for latest-release facets and "updated"/"fixed" for repaired/refreshed facets (blue UPDATED badge in the UI).',
    },
    count: all.length,
    effects: all,
  };
  // Last line of defence before overwriting the catalog. The #prism-catalog island in
  // Prism.html is the source of truth, so a healthy extraction can only ever match or
  // exceed its effect count (new facets get spliced into Prism.html first, then
  // extracted). A drop means a gallery came back short — set PRISM_ALLOW_SHRINK=1 to
  // write anyway when facets were genuinely deleted on purpose.
  const islandCount = (() => {
    try {
      const html = readFileSync(TARGET, 'utf8');
      const open = '<script type="application/json" id="prism-catalog">';
      const s = html.indexOf(open); if (s < 0) return null;
      const raw = html.slice(s + open.length, html.indexOf('</script', s + open.length))
        .split('<\\/script').join('</script');
      const c = JSON.parse(raw);
      return Array.isArray(c.effects) ? c.effects.length : (c.count ?? null);
    } catch { return null; }
  })();
  if (islandCount != null && all.length < islandCount && !process.env.PRISM_ALLOW_SHRINK) {
    console.error('\nRefusing to write. manifest.json / index.json are unchanged.');
    console.error('Per-gallery counts above show which one came back short.'
      + ' Set PRISM_ALLOW_SHRINK=1 only if facets were deliberately removed.');
    throw new Error(`extracted ${all.length} effects but the Prism.html island has ${islandCount}`
      + ` — ${islandCount - all.length} would be lost`);
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT + '/manifest.json', JSON.stringify(manifest, null, 2));
  const index = all.map(r => ({ id: r.id, name: r.name, gallery: r.gallery, category: r.category, ref: r.ref, classes: r.classes, params: Object.keys(r.params), tags: r.tags, componentType: r.componentType, interaction: r.interaction, spectrum: r.spectrum, usableAsBackground: r.usableAsBackground, needsJs: r.needsJs, isNew: r.isNew, isFixed: r.isFixed, description: r.description }));
  writeFileSync(OUT + '/index.json', JSON.stringify({ count: index.length, effects: index }, null, 2));
  console.log(`\nTOTAL ${all.length} effects → manifest.json (+ index.json)`);
} catch (e) {
  // Exit non-zero: this used to fall through to a 0 status, so a crashed extraction
  // looked like a success to anything chaining `&& node catalog/_embed-catalog.mjs`.
  console.error('EXTRACT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  proc.kill('SIGKILL');
}
