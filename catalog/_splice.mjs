/* Splice a drafted gallery block into Prism.html at a unique anchor.
   Usage: node catalog/_splice.mjs <draftFile> <anchorMode>
   anchorMode identifies the gallery-specific insertion point. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = resolve(HERE, '../Prism.html');
const [, , draftFile, anchorMode] = process.argv;

let draft = readFileSync(resolve(HERE, draftFile), 'utf8').replace(/\n$/, '');
// Each gallery lives in a <script type="text/html" id="pg-*"> template. Any raw
// </script> inside a draft (e.g. the closer of the draft's own inline init script)
// would PREMATURELY TERMINATE that template — dumping the rest of the gallery into
// the live document and throwing "Unexpected token '<'". Escape closers to <\/script>
// (the shell un-escapes them when it loads the page). Idempotent: skips already-escaped.
draft = draft.replace(/<\/script\s*>/gi, '<\\/script>');
let html = readFileSync(HTML, 'utf8');

// Anchors: exact unique string in the target page; draft is inserted BEFORE the
// wrap-closing </div> that precedes the page's trailing <script>.
const ANCHORS = {
  ai: '  </div>\n</div>\n\n<script>\n// --- equalizer bars (build 22) ---',
  charts: '  </div>\n\n</div>\n\n<script>\n// ---- category filter ----',
  fx: '</div>\n\n</div>\n<script>\n// Spotlight-Follow: update --mx/--my from pointer position',
  lab: '  </div>\n\n</div>\n\n<script>\n/* ---- live time-based widgets (countdown ring, MM:SS, stopwatch) ---- *',
  objects: '  </div>\n</div>\n\n<script>\n/* ---- Ambient weather backdrop initializer ---- */',
  input: '  </div>\n\n</div>\n\n<script>\nfunction copyViz(btn){',
  text: '</div>\n\n</div>\n<script>\n// ---- Per-letter splitter',
  shapes: '  </div>\n</div>\n<script>\n// ---- Init: lay out per-letter shaped text',
};
// Some galleries insert between gallery-close and wrap-close (charts pattern);
// others between the last grid-close and wrap-close (ai pattern). The replacement
// keeps the tail identical and injects the draft right after the first line.

const anchor = ANCHORS[anchorMode];
if (!anchor) { console.error('Unknown anchor mode:', anchorMode); process.exit(1); }

const count = html.split(anchor).length - 1;
if (count !== 1) { console.error(`Anchor matched ${count} times (need exactly 1). Aborting.`); process.exit(1); }

// Anchors begin with the closing </div> of the last gallery/grid. Insert the draft
// right after that first line, before the wrap-closing </div> + trailing <script>.
const nl = anchor.indexOf('\n');
const firstLine = anchor.slice(0, nl);   // the gallery/grid close
const rest = anchor.slice(nl);           // starts with '\n' ... wrap close + script
const replacement = firstLine + '\n' + draft + rest;
// IMPORTANT: pass replacement as a FUNCTION, not a string. A string replacement
// makes String.replace interpret $-patterns ($&, $`, $', $n) inside the draft —
// e.g. a `$'` in draft CSS/JS would splice in the entire rest of the file, silently
// duplicating huge regions (the count check still passes). A function returns the
// literal string untouched.
const before = html.length;
html = html.replace(anchor, () => replacement);
// Sanity: the file must grow by roughly the draft size (± the small anchor rewrite),
// never balloon. Guards against any future accidental $-expansion.
const grew = html.length - before;
if (grew > draft.length + 200 || grew < draft.length - 200) {
  console.error(`Splice size sanity FAILED: file grew ${grew} bytes but draft is ${draft.length}. Aborting write.`);
  process.exit(1);
}
writeFileSync(HTML, html);
console.log('Spliced', draftFile, `at anchor "${anchorMode}" (+${grew} bytes).`);
