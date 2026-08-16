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
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveChrome } from './_chrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = HERE;
const FILE = 'file://' + resolve(HERE, '../Prism.html');
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

// This function is serialized and evaluated INSIDE the gallery iframe. It is a
// faithful port of extract-manifest.mjs's extractInPage, but reads styles from
// the iframe document passed as `d` (the CDP evaluate runs in the top frame, so
// we resolve the iframe doc first and pass it in via a wrapper below).
const EXTRACT_FN = `function extractInPage(gallery, d){
  var docStyleSheets = d.styleSheets;
  function slug(s){return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);}
  function cssFor(html){
    var classes=new Set();
    (html.match(/class="([^"]*)"/g)||[]).forEach(function(m){m.replace(/class="|"/g,'').split(/\\s+/).forEach(function(c){if(c)classes.add(c);});});
    var rulesOut=[]; var kf=new Set();
    function scanAnims(text){
      (text.match(/animation(?:-name)?:\\s*[^;}]+/g)||[]).forEach(function(a){
        a.split(/[\\s:,]+/).forEach(function(t){
          if(/^[a-zA-Z][\\w-]*$/.test(t) && !/^(animation|animation-name|ease|linear|infinite|alternate|reverse|normal|forwards|backwards|both|none|steps|ease-in|ease-out|ease-in-out|paused|running|cubic-bezier|alternate-reverse)$/.test(t)) kf.add(t);
        });
      });
    }
    for(var si=0; si<docStyleSheets.length; si++){
      var rules; try{rules=docStyleSheets[si].cssRules;}catch(e){continue;}
      if(!rules) continue;
      for(var ri=0; ri<rules.length; ri++){
        var rule=rules[ri];
        if(rule.type===1 && rule.selectorText){
          var hit=false;
          classes.forEach(function(c){
            if(hit) return;
            if(rule.selectorText.split(/[\\s,>+~]+/).some(function(sel){return sel.indexOf('.'+c)!==-1 && new RegExp('\\\\.'+c+'(?![\\\\w-])').test(sel);})){hit=true;}
          });
          if(hit){ rulesOut.push(rule.cssText); scanAnims(rule.cssText); }
        }
      }
      for(var rk=0; rk<rules.length; rk++){ if(rules[rk].type===7 && kf.has(rules[rk].name)) rulesOut.push(rules[rk].cssText); }
    }
    return {css:[...new Set(rulesOut)].join('\\n'), classes:[...classes], keyframes:[...kf]};
  }
  function paramsFor(html, css){
    var params={};
    if(/var\\(--c\\b|--c:|--c-rgb/.test(css)) params.color={var:'--c', rgbVar:'--c-rgb', note:'Set --c (hex) and --c-rgb (R,G,B) to recolor', via:'class c-crit|c-neg|c-warn|c-pos|c-info|c-accent or inline style'};
    var dataAttrs={};
    (html.match(/data-[a-z-]+="[^"]*"/g)||[]).forEach(function(m){dataAttrs[m.split('=')[0]]=m.split('"')[1];});
    if(Object.keys(dataAttrs).length) params.dataAttributes=dataAttrs;
    return params;
  }
  var records=[]; var seen={};
  // Walk the WHOLE body in document order (not just the first .wrap). Some galleries
  // have content — including newly-spliced sections — that lands outside/after the
  // first .wrap; scoping to one .wrap silently drops those tiles.
  var root=d.body||d.documentElement;
  var currentCat='General';
  var walker=root.querySelectorAll('h3.sec, .tile, .panel');
  walker.forEach(function(node){
    if(node.matches('h3.sec')){
      // Read the header text WITHOUT the runtime-injected count badge (.sec-count),
      // which the shell appends after mount; leaving it in poisons every category
      // with a trailing digit ("Progress & Ratio" -> "Progress & Ratio7").
      var hc=node.cloneNode(true); var badge=hc.querySelector('.sec-count'); if(badge)badge.remove();
      currentCat=hc.textContent.replace(/^[^A-Za-z0-9]+/,'').split(/[—–-]/)[0].trim(); return;
    }
    var nameEl=node.querySelector('.nm, .ptitle');
    var name=(nameEl?nameEl.textContent:'').replace(/\\s+/g,' ').trim() || 'effect';
    var refEl=node.querySelector('.ref'); var ref=refEl?refEl.textContent.trim():'';
    var descEl=node.querySelector('.desc, .cap'); var description=descEl?descEl.textContent.replace(/\\s+/g,' ').trim():'';
    var demoNode=node.querySelector('.stage'); var html;
    if(demoNode){ html=demoNode.innerHTML.trim(); }
    else { var clone=node.cloneNode(true); var bar=clone.querySelector('.fx-copy'); if(bar)bar.remove(); html=clone.outerHTML; }
    var snipBtn=node.querySelector('[data-snip]');
    var dataSnip=snipBtn?snipBtn.getAttribute('data-snip'):null;
    var id=node.getAttribute('data-fx-id') || (gallery+'-'+slug(name));
    if(seen[id]){seen[id]++;id+='-'+seen[id];}else seen[id]=1;
    var r=cssFor(html);
    var needsJs=null;
    if(/data-weather=/.test(html)) needsJs='amb-particles';
    else if(/data-countdown=|data-timer=|data-stopwatch/.test(html)) needsJs='time-widgets';
    var isBackground=r.classes.some(function(c){return c.indexOf('amb')===0;});
    var selfContained=!r.css.trim();
    var isNew=node.classList.contains('is-new');
    var isFixed=node.classList.contains('is-fixed');
    records.push({
      id:id, name:name, gallery:gallery, category:currentCat, ref:ref, description:description,
      classes:r.classes, keyframes:r.keyframes, params:paramsFor(html,r.css),
      tags:[gallery]
        .concat(isBackground?['background','ambient','behind-content']:[])
        .concat(needsJs?['needs-js']:[])
        .concat(selfContained?['self-contained']:[])
        .concat(r.keyframes.length?['animated']:[])
        .concat(isNew?['new']:[])
        .concat(isFixed?['updated','fixed']:[]),
      usableAsBackground:isBackground, needsJs:needsJs, selfContained:selfContained,
      isNew:isNew, isFixed:isFixed,
      html:html, dataSnip:dataSnip, css:r.css,
    });
  });
  return records;
}`;

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

  const all = []; const byGallery = {};
  for (const g of GALLERIES) {
    await send('Runtime.evaluate', { expression:
      `(function(){var a=document.querySelector('a[data-page="${g.gallery}"]');if(a)a.click();})()` });
    await sleep(3200);
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
    if (recs.err) { console.log(g.gallery.padEnd(9), 'ERROR:', recs.err); continue; }
    recs.forEach(x => { x.galleryTitle = g.title; });
    byGallery[g.gallery] = { title: g.title, count: recs.length, effects: recs };
    all.push(...recs);
    console.log(g.gallery.padEnd(9), String(recs.length).padStart(4), 'effects');
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
  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT + '/manifest.json', JSON.stringify(manifest, null, 2));
  const index = all.map(r => ({ id: r.id, name: r.name, gallery: r.gallery, category: r.category, ref: r.ref, classes: r.classes, params: Object.keys(r.params), tags: r.tags, usableAsBackground: r.usableAsBackground, needsJs: r.needsJs, isNew: r.isNew, isFixed: r.isFixed, description: r.description }));
  writeFileSync(OUT + '/index.json', JSON.stringify({ count: index.length, effects: index }, null, 2));
  console.log(`\nTOTAL ${all.length} effects → manifest.json (+ index.json)`);
} catch (e) {
  console.error('EXTRACT FAILED:', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  proc.kill('SIGKILL');
}
