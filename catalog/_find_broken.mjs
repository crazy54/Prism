/* Detect broken facets across galleries via headless Chrome (CDP, no deps).
   For each page hash it loads the shell, waits for the iframe, then inspects every
   .tile.is-new / .panel.is-new / .tile.is-fixed / .panel.is-fixed and flags ones that:
     - have no animated descendant (animationName none everywhere), OR
     - have essentially no styling (no border-radius / background / svg / canvas), OR
     - contain an empty container that looks JS-driven but stayed empty (0 child nodes
       in a .stage/.pbody whose siblings suggest generated cells), OR
     - overflow badly / zero-size stage.
   Prints a JSON report per gallery: {ref/name, reasons[]}. Also reports console errors.

   Usage: node catalog/_find_broken.mjs [hash1 hash2 ...]   (default: all 8 main) */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(HERE, '../Prism.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGES = process.argv.slice(2);
if (!PAGES.length) PAGES.push('charts', 'fx', 'lab', 'ai', 'objects', 'input', 'text', 'shapes');
const PORT = 9344;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + mkdtempSync(tmpdir() + '/prism-'),
  'about:blank',
], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => { const m = ++id; ws.send(JSON.stringify({ id: m, method, params })); return new Promise(r => pending.set(m, r)); };

const INSPECT = `(function(){
  var f=document.getElementById('gv'); var d=f&&f.contentDocument; var w=f&&f.contentWindow;
  if(!d) return JSON.stringify({err:'no iframe doc'});
  var items=d.querySelectorAll('.tile.is-new,.panel.is-new,.tile.is-fixed,.panel.is-fixed');
  var report=[];
  items.forEach(function(el){
    var reasons=[];
    var nm=(el.querySelector('.nm,.ptitle')||{}).textContent||'';
    var ref=(el.querySelector('.ref')||{}).textContent||'';
    var stage=el.querySelector('.stage,.pbody,.stage-inner')||el;
    // 1. animation present anywhere?
    var nodes=[el].concat([].slice.call(el.querySelectorAll('*')));
    var anyAnim=false, anyStyle=false, hasSvg=false, hasCanvas=false;
    nodes.forEach(function(n){
      var cs=w.getComputedStyle(n);
      if(cs.animationName && cs.animationName!=='none') anyAnim=true;
      if(cs.borderRadius!=='0px' || cs.backgroundImage!=='none' || (cs.backgroundColor && cs.backgroundColor!=='rgba(0, 0, 0, 0)')) anyStyle=true;
      if(n.tagName==='svg') hasSvg=true;
      if(n.tagName==='CANVAS') hasCanvas=true;
    });
    if(!anyAnim) reasons.push('no-animation');
    if(!anyStyle && !hasSvg) reasons.push('no-styling');
    // 2. empty JS-target container: a stage whose only element children are none but
    //    markup implies generated cells (has an id and is empty)
    var emptyGen=false;
    stage && [].slice.call(stage.querySelectorAll('[id]')).forEach(function(c){
      if(c.children.length===0 && (c.textContent||'').trim()==='' && !/svg|img|input|button/i.test(c.tagName)
         && c.tagName!=='BR' && c.tagName!=='CANVAS'){
        // only flag if it looks like a grid/track meant to be filled
        var cls=(c.className||'')+'';
        if(/grid|track|bars|cells|cal|heat|cohort|swarm|net|matrix|list/.test(cls)) emptyGen=true;
      }
    });
    if(emptyGen) reasons.push('empty-js-container');
    // 3. zero-size stage
    var r=stage.getBoundingClientRect();
    if(r.width<4 || r.height<4) reasons.push('zero-size');
    // 4. overflow: content wider than stage by a lot
    if(stage.scrollWidth > stage.clientWidth+40 && stage.clientWidth>0) reasons.push('overflow-x');
    if(reasons.length) report.push({name:nm.trim(), ref:ref.trim(), reasons:reasons});
  });
  return JSON.stringify({page:location.hash.replace('#',''), totalNew:items.length, broken:report});
})()`;

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
  let errors = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      errors.push('console.error: ' + msg.params.args.map(a => a.value || a.description || '').join(' '));
    else if (msg.method === 'Runtime.exceptionThrown')
      errors.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  };
  await send('Runtime.enable'); await send('Page.enable');
  // Load the shell once (fresh document), let the veil clear + first page mount.
  await send('Page.navigate', { url: FILE });
  await sleep(2600);

  for (const hash of PAGES) {
    errors = [];
    // Drive the real in-app navigation: click the rail link for this page, which
    // rebuilds the iframe via srcdoc. (Changing location.hash alone does NOT reload
    // the SPA — nav is wired to a[data-page] clicks / initial load only.)
    await send('Runtime.evaluate', { expression:
      `(function(){var a=document.querySelector('a[data-page="${hash}"]');if(a){a.click();return 'clicked';}return 'no-link';})()`,
      returnByValue: true });
    await sleep(3200); // transition (200ms) + iframe load + effect init
    // Confirm which page actually mounted (guards against stale inspection).
    const who = await send('Runtime.evaluate', { expression:
      `(function(){var f=document.getElementById('gv');var d=f&&f.contentDocument;return d?((d.title||'')+' | h3:'+((d.querySelector('h3,h2,h1')||{}).textContent||'').trim()):'no-doc';})()`,
      returnByValue: true });
    const r = await send('Runtime.evaluate', { expression: INSPECT, returnByValue: true });
    let rep; try { rep = JSON.parse(r.result.value); } catch { rep = { raw: r.result.value }; }
    console.log('\n===== ' + hash + ' =====  mounted: ' + (who.result.value || '?'));
    console.log('totalNew=' + rep.totalNew + ' broken=' + (rep.broken ? rep.broken.length : '?'));
    (rep.broken || []).forEach(b => console.log('  ✗ [' + b.reasons.join(',') + '] ' + b.name + '  ' + b.ref));
    if (errors.length) console.log('  console errors:', errors.slice(0, 6));
  }
} catch (e) {
  console.error('CHECK FAILED:', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  proc.kill('SIGKILL');
}
