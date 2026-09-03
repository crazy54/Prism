/* ============================================================================
   F4 (JFH-37) — Merge a generated design system into the Spectrums gallery.
   ----------------------------------------------------------------------------
   The spectrums gallery is unlike the single-anchor galleries _splice.mjs
   handles: its CSS lives in a shared <style id="spectrums-styles"> block and its
   tiles live in <h3 class="sec"> + <div class="gallery"> sections in the body.
   A system therefore needs a TWO-POINT insertion, both scoped INSIDE the
   <script type="text/html" id="pg-spectrums"> template (the tiles anchor is not
   globally unique — copyViz is defined in ~10 templates — so we slice to the
   spectrums template first and only touch that region).

   Consumes the additions JSON emitted by _gen_system.mjs
   ({ spectrum, sectionLabel, css, tiles }).

     node catalog/_merge_spectrum.mjs <generated.json>
   Honors PRISM_HTML (defaults to ../Prism.html) so it can target a temp copy.

   Idempotent-guarded: refuses to merge a family whose sectionLabel/spectrum is
   already present, and size-sanity-checks the write. Zero deps.
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = process.env.PRISM_HTML ? resolve(process.env.PRISM_HTML) : resolve(HERE, '../Prism.html');
const draftFile = process.argv[2];
if (!draftFile) { console.error('Usage: node catalog/_merge_spectrum.mjs <generated.json>   (honors PRISM_HTML)'); process.exit(1); }

const out = JSON.parse(readFileSync(resolve(draftFile), 'utf8'));
if (out.gallery !== 'spectrums') { console.error(`Draft gallery is "${out.gallery}", expected "spectrums".`); process.exit(1); }
const { spectrum, sectionLabel, css, tiles } = out;
if (!spectrum || !sectionLabel || !css || !Array.isArray(tiles) || !tiles.length) {
  console.error('Draft missing one of: spectrum, sectionLabel, css, tiles[].'); process.exit(1);
}

let html = readFileSync(HTML, 'utf8');
const EOL = html.includes('\r\n') ? '\r\n' : '\n'; // match the file's line endings (Prism.html is CRLF)

// Any literal </script> inside injected markup would prematurely close the
// text/html template. Escape (the shell un-escapes on load). Idempotent.
const escScript = (s) => s.replace(/<\/script\s*>/gi, '<\\/script>');

// ---- slice the pg-spectrums template ----
const TPL_OPEN = '<script type="text/html" id="pg-spectrums">';
const sliceStart = html.indexOf(TPL_OPEN);
if (sliceStart === -1) { console.error('Could not find the pg-spectrums template.'); process.exit(1); }
const sliceEnd = html.indexOf('</script>', sliceStart); // first real closer (escaped closers are <\/script>)
if (sliceEnd === -1) { console.error('Could not find the end of the pg-spectrums template.'); process.exit(1); }
let slice = html.slice(sliceStart, sliceEnd);

// ---- idempotency: bail if this family is already merged ----
if (slice.includes(`data-spectrum="${spectrum}"`) || slice.includes(`>${sectionLabel}<`)) {
  console.error(`Family "${spectrum}" (or section "${sectionLabel}") already present in the spectrums template. Nothing to do.`);
  process.exit(1);
}

// ---- point 1: CSS into <style id="spectrums-styles"> (before its closing </style>) ----
const STYLE_OPEN = '<style id="spectrums-styles">';
const styleAt = slice.indexOf(STYLE_OPEN);
if (styleAt === -1) { console.error('Could not find <style id="spectrums-styles"> in the spectrums template.'); process.exit(1); }
const styleClose = slice.indexOf('</style>', styleAt);
if (styleClose === -1) { console.error('Could not find the </style> closing spectrums-styles.'); process.exit(1); }
const cssBlock = EOL + escScript(css) + EOL;
slice = slice.slice(0, styleClose) + cssBlock + slice.slice(styleClose);

// ---- point 2: a new <h3 class="sec"> + gallery section in the body ----
// Insert after the LAST gallery's closing </div>, before the .wrap-closing </div>
// and the trailing <script>. The anchor is unique within this template slice.
const TILES_ANCHOR = `</div>${EOL}</div>${EOL}<script>${EOL}function copyViz(btn){`;
if (slice.split(TILES_ANCHOR).length - 1 !== 1) {
  console.error(`Tiles anchor matched ${slice.split(TILES_ANCHOR).length - 1} times in slice (need exactly 1). Aborting.`);
  process.exit(1);
}
const section =
  `<h3 class="sec">${sectionLabel}</h3>${EOL}` +
  `<div class="gallery">${EOL}` +
  tiles.map((t) => '  ' + escScript(t)).join(EOL) + EOL +
  `</div>`;
// anchor = "</div>" (last gallery close) + EOL + "</div>\n<script>\nfunction copyViz(btn){"
// insert `section` between the gallery-close and the wrap-close.
const nl = TILES_ANCHOR.indexOf(EOL);
const galleryClose = TILES_ANCHOR.slice(0, nl);      // last gallery </div>
const rest = TILES_ANCHOR.slice(nl);                 // EOL + wrap close + trailing script
const replacement = galleryClose + EOL + section + rest;
// Function replacement — never a string — so $-sequences in the draft are literal.
slice = slice.replace(TILES_ANCHOR, () => replacement);

// ---- reassemble + size sanity ----
const newHtml = html.slice(0, sliceStart) + slice + html.slice(sliceEnd);
const grew = newHtml.length - html.length;
const expected = cssBlock.length + section.length + EOL.length; // ~ what we injected
if (grew < expected - 200 || grew > expected + 400) {
  console.error(`Merge size sanity FAILED: file grew ${grew} bytes, expected ~${expected}. Aborting write.`);
  process.exit(1);
}
writeFileSync(HTML, newHtml);
console.log(`Merged "${spectrum}" into ${HTML}: +${tiles.length} tiles, +${css.split(EOL).length} css lines (+${grew} bytes).`);
