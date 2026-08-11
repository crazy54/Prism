/* Static integrity checks for Prism.html (no build):
   1) the #prism-catalog JSON island parses and reports counts,
   2) the two real shell IIFEs parse as JS (via vm.Script).
   Usage: node catalog/_smoke.mjs */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, '../Prism.html'), 'utf8');

// ---- 1) catalog island ----
const openTag = '<script type="application/json" id="prism-catalog">';
const start = html.indexOf(openTag);
if (start < 0) { console.error('FAIL: no prism-catalog island'); process.exit(1); }
const afterOpen = start + openTag.length;
const end = html.indexOf('</script', afterOpen);
let islandRaw = html.slice(afterOpen, end);
// un-escape the protected close-script sequence used inside the island
islandRaw = islandRaw.split('<\\/script').join('</script');
let catalog;
try { catalog = JSON.parse(islandRaw); }
catch (e) { console.error('FAIL: island JSON parse:', e.message); process.exit(1); }
const galleries = catalog.galleries ? catalog.galleries.length : (catalog.galleryCount || '?');
const effects = Array.isArray(catalog.effects) ? catalog.effects.length
  : (catalog.effectCount || (catalog.components ? catalog.components.length : '?'));
console.log('OK island: galleries=' + galleries + ' effects=' + effects);

// ---- 2) shell IIFE syntax ----
// The template <script type="text/html" id="pg-*"> blocks contain nested markup and
// are NOT standalone JS; only <script> blocks with no type= (the shell IIFEs) are.
// Extract every <script ...>...</script> whose open tag has no type attribute.
const re = /<script(\b[^>]*)>([\s\S]*?)<\/script>/g;
let m, checked = 0, failed = 0;
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  if (/\btype\s*=/.test(attrs)) continue;        // skip typed (json / text/html) blocks
  const code = m[2];
  if (!code.trim()) continue;
  checked++;
  try { new vm.Script(code); }
  catch (e) { failed++; console.error('FAIL: shell script #' + checked + ': ' + e.message); }
}
console.log('OK shell scripts parsed: ' + (checked - failed) + '/' + checked);
process.exit(failed ? 1 : 0);
