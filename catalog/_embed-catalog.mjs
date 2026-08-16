/* One-time seed: embed catalog/manifest.json into Prism.html as a JSON island.
   Run: node catalog/_embed-catalog.mjs   (safe to re-run; it replaces the island)
   The in-browser generator (window.prismBuildCatalog) is the ongoing refresh path. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = resolve(HERE, '../Prism.html');
const MANIFEST = resolve(HERE, 'manifest.json');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// Stamp real generation metadata and an AI usage header (non-breaking extra keys).
manifest.generated = new Date().toISOString();
manifest.source = 'Prism.html (seeded from catalog/manifest.json)';
const withHeader = {
  _ai: {
    what: 'Full-fat, offline catalog of every Prism effect (id, name, gallery, tags, params, and self-contained html+css).',
    howToUse: 'JSON.parse the text of <script id="prism-catalog">. Filter effects[] by gallery/tags/description. Each effect ships its own html+css; include tokens.css once globally; if effect.needsJs, run initializers[effect.needsJs].js after inserting the markup.',
    fields: 'effects[]: {id,name,gallery,category,ref,description,classes,keyframes,params,tags,usableAsBackground,needsJs,selfContained,html,css,dataSnip}',
    count: manifest.count,
  },
  ...manifest,
};

// Serialize, then neutralize any "</script" so the island can't terminate early.
// "<\/script" is valid JSON (\/ === /) and parses back to "</script".
const json = JSON.stringify(withHeader, null, 2).replace(/<\/script/gi, '<\\/script');

const ISLAND =
  '<!-- ===== PRISM CATALOG · AI START HERE ===== -->\n' +
  '<script type="application/json" id="prism-catalog">\n' + json + '\n</script>\n' +
  '<!-- ===== /PRISM CATALOG ===== -->\n';

const BREADCRUMB =
  '<!-- ✦ AI-READABLE: a machine catalog of all effects (full html+css) is in ' +
  '<script id="prism-catalog"> at the top of <head>. Jump to id="prism-catalog"; ' +
  'JSON.parse its text; read the "_ai" key first. -->';

let html = readFileSync(HTML, 'utf8');

// Idempotent: strip any prior island + breadcrumb before re-inserting.
// Absorb ALL trailing newlines as [\r\n]* (not \n?) — Prism.html uses CRLF, so a
// \n? / \n* can't consume the leading \r and left a \r\n to accumulate one blank
// line every run. [\r\n]* eats the whole CRLF run; the re-insert re-adds one.
html = html.replace(/<!-- ===== PRISM CATALOG · AI START HERE ===== -->[\s\S]*?<!-- ===== \/PRISM CATALOG ===== -->[\r\n]*/, '');
html = html.replace(/<!-- ✦ AI-READABLE:[\s\S]*?-->[\r\n]*/, '');

// Breadcrumb right after <html lang="en">, island right after </title>.
// Use FUNCTION replacements: a string replacement expands $$, $`, $', $&, $n
// specials, and ISLAND embeds arbitrary effect html/css/regex data — a stray
// $' would splice the rest of the file into the island (corruption). A function
// return is inserted literally, no $-substitution. (Mirrors _splice.mjs.)
html = html.replace('<html lang="en">', () => '<html lang="en">\n' + BREADCRUMB);
html = html.replace('<title>✦ Prism · Unified Gallery</title>',
  () => '<title>✦ Prism · Unified Gallery</title>\n' + ISLAND);

writeFileSync(HTML, html);
console.log('Embedded catalog island: ' + withHeader.count + ' effects, ' +
  (Buffer.byteLength(json) / 1048576).toFixed(2) + ' MB JSON.');
