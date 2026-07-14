/* Build a complete <script type="text/html" id="pg-<id>"> gallery template from:
     - a shared head (design tokens + page chrome + tile/meta CSS + copy helper)
     - a gallery-specific <style> block (read from catalog/drafts/<id>.css if present)
     - a gallery body (sections + tiles, read from catalog/drafts/<id>.body.html)
   Writes the assembled template to catalog/drafts/<id>.tpl.html for splicing.

   Usage: node catalog/_scaffold.mjs <id> "<emoji> <Title>" "<blurb>"
   Bodies/styles are authored separately (by sub-agents) into:
     catalog/drafts/<id>.body.html   (required — the sections + .gallery tiles)
     catalog/drafts/<id>.css         (optional — gallery-specific CSS, no <style> tags)
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [, , id, titleFull, blurb] = process.argv;
if (!id || !titleFull) { console.error('Usage: node _scaffold.mjs <id> "<emoji Title>" "<blurb>"'); process.exit(1); }

const bodyPath = resolve(HERE, 'drafts', id + '.body.html');
const cssPath = resolve(HERE, 'drafts', id + '.css');
if (!existsSync(bodyPath)) { console.error('Missing body file:', bodyPath); process.exit(1); }
const body = readFileSync(bodyPath, 'utf8').replace(/\n+$/, '');
const gcss = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

// Shared head: tokens + chrome + tile CSS + base el-* helpers (mirrors the other galleries).
const HEAD = `<style>
:root{
  --bg:#0b0e17; --panel:#121623; --panel2:#171d2e; --card:#141b2b; --line:#243049;
  --ink:#eaf1f9; --muted:#8593a8; --dim:#5b6678;
  --crit:#c879ff;  --crit-rgb:200,121,255;
  --neg:#f85149;   --neg-rgb:248,81,73;
  --warn:#e0a52b;  --warn-rgb:224,165,43;
  --pos:#3fb950;   --pos-rgb:63,185,80;
  --info:#4493f8;  --info-rgb:68,147,248;
  --accent:#ff9900;--accent-rgb:255,153,0;
  --cardgrad:linear-gradient(157deg,rgba(255,255,255,.05),rgba(255,255,255,0) 55%);
}
.c-crit{--c:var(--crit);--c-rgb:200,121,255}.c-neg{--c:var(--neg);--c-rgb:248,81,73}
.c-warn{--c:var(--warn);--c-rgb:224,165,43}.c-pos{--c:var(--pos);--c-rgb:63,185,80}
.c-info{--c:var(--info);--c-rgb:68,147,248}.c-accent{--c:var(--accent);--c-rgb:255,153,0}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1100px 600px at 85% -10%,rgba(255,153,0,.05),transparent 60%),var(--bg);
  color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding-bottom:90px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
.head{padding:28px 32px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#232f3e,var(--panel));position:relative}
.head h1{margin:0;font-size:25px;font-weight:800;letter-spacing:-.01em}
.head p{margin:7px 0 0;color:var(--muted);font-size:13px;max-width:820px}
.wrap{max-width:1240px;margin:0 auto;padding:22px 32px 0}
h3.sec{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:800;margin:26px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.tile .stage{padding:26px 18px;min-height:130px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,rgba(255,255,255,.012) 0 10px,transparent 10px 20px);position:relative}
.tile .meta{padding:12px 14px;border-top:1px solid var(--line)}
.tile .nm{font-weight:700;font-size:13.5px}
.tile .ref{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--accent);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:2px 7px;display:inline-block;margin-top:6px}
.tile .desc{color:var(--muted);font-size:12px;margin-top:8px}
.tile .row{display:flex;gap:8px;margin-top:10px}
.tile .copy{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:7px;font-size:12px;cursor:pointer;transition:.15s;font-family:inherit}
.tile .copy:hover{border-color:var(--accent);color:var(--accent)}
.tile .copy.ok{border-color:var(--pos);color:var(--pos)}
.el-pill{display:inline-block;background:rgba(var(--c-rgb),.14);color:var(--c);border-radius:11px;padding:3px 10px;font-size:11px;font-weight:800}
@media(prefers-reduced-motion:reduce){*{animation-duration:.001s!important;animation-iteration-count:1!important}}
</style>
<style id="${id}-styles">
${gcss}
</style>`;

const COPY = `<script>
function copyViz(btn){
  var stage=btn.closest('.tile').querySelector('.stage');
  var html=stage.innerHTML.replace(/\\s+$/,'').trim();
  var usedClasses=new Set();
  (html.match(/class="[^"]*"/g)||[]).forEach(function(m){m.replace(/class="/,'').replace(/"/,'').split(/\\s+/).forEach(function(c){if(c)usedClasses.add(c)})});
  var cssRules=[];
  try{var sheets=document.styleSheets;for(var s=0;s<sheets.length;s++){var rules=sheets[s].cssRules;for(var r=0;r<rules.length;r++){var rule=rules[r];if(rule.type===7&&html.indexOf(rule.name)!==-1){cssRules.push(rule.cssText)}if(rule.type===1&&rule.selectorText){for(var uc of usedClasses){if(rule.selectorText.indexOf('.'+uc)!==-1&&!rule.selectorText.includes('.tile')){cssRules.push(rule.cssText);break}}}}}}catch(e){}
  cssRules=[...new Set(cssRules)];
  var output='<!-- Prism Component -->\\n'+html;
  if(cssRules.length>0)output+='\\n\\n<style>\\n'+cssRules.join('\\n')+'\\n</style>';
  function sgCopy(txt){try{if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(txt).catch(function(){return sgCopyFallback(txt);});}}catch(e){}return Promise.resolve(sgCopyFallback(txt));}
  function sgCopyFallback(txt){var ta=document.createElement('textarea');ta.value=txt;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';document.body.appendChild(ta);ta.focus();ta.select();try{ta.setSelectionRange(0,txt.length);}catch(e){}var ok=false;try{ok=document.execCommand('copy');}catch(e){}document.body.removeChild(ta);if(!ok)return Promise.reject(new Error('copy failed'));return true;}
  sgCopy(output).then(function(){var o=btn.dataset.lbl||btn.textContent;btn.dataset.lbl=o;btn.textContent='✓ Copied';btn.classList.add('ok');setTimeout(function(){btn.textContent=o;btn.classList.remove('ok');btn.removeAttribute('data-lbl');},1300);},function(){var o=btn.dataset.lbl||btn.textContent;btn.dataset.lbl=o;btn.textContent='✗ Press ⌘C';btn.classList.add('ok');setTimeout(function(){btn.textContent=o;btn.classList.remove('ok');btn.removeAttribute('data-lbl');},1500);});
}
/* data-snip copy for snippet buttons */
document.addEventListener('click',function(e){var b=e.target.closest('.copy[data-snip]');if(!b)return;var t=b.getAttribute('data-snip');
  function fb(){var ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(ta);}
  (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t).catch(fb):Promise.resolve(fb()));
  var o=b.dataset.lbl||b.textContent;b.dataset.lbl=o;b.textContent='✓ Copied';b.classList.add('ok');setTimeout(function(){b.textContent=o;b.classList.remove('ok');},1300);
});
<${''}\\/script>`;   // literal <\/script> so it can't prematurely close the type="text/html" template

const tpl =
`<script type="text/html" id="pg-${id}"><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titleFull} · Prism</title>
${HEAD}
</head>
<body>
<div class="head">
  <h1>${titleFull}</h1>
  <p>${blurb || ''}</p>
</div>
<div class="wrap">
${body}
</div>
${COPY}
</body>
</html>
<\/script>`;

const out = resolve(HERE, 'drafts', id + '.tpl.html');
writeFileSync(out, tpl);
console.log('Scaffolded', id, '->', out, '(' + (tpl.length / 1024).toFixed(1) + ' KB)');
