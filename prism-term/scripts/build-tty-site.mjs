// Generate the curl-able terminal site into a directory.
//
//   node scripts/build-tty-site.mjs <out-dir> [--site https://prism.jeremyfhall.com] [--html]
//
// Writes  tty, tty.txt, tty.24, t/<page>{,.txt,.24}, f/<facet>{,.txt,.24}
// and, with --html, terminal/tty-preview/<page>.html previews of the colored pages.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFacets, catalogTree } from '../src/facets/index.js';
import { buildTtyPages } from '../src/site/tty.js';
import { toHtml } from '../src/export.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'));
export const DEFAULT_SITE = 'https://prism.jeremyfhall.com';

/** Write the site; returns { files, bytes, pages }. */
export function writeTtySite(outDir, { site = DEFAULT_SITE, html = false } = {}) {
  const pages = buildTtyPages({ site, version: pkg.version, galleries: catalogTree(), facets: allFacets({ strict: true }) });
  let bytes = 0, files = 0;
  const write = (rel, data) => {
    const file = path.join(outDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    bytes += Buffer.byteLength(data);
    files++;
  };
  for (const [rel, page] of pages) {
    write(rel, page['256']);
    write(`${rel}.24`, page['24']);
    write(`${rel}.txt`, page.txt);
    if (html && !rel.startsWith('f/')) write(`terminal/tty-preview/${rel.replace('/', '-')}.html`, toHtml(page.buffer, { title: `curl ${site.replace(/^https?:\/\//, '')}/${rel}` }));
  }
  return { files, bytes, pages };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const out = args.find((a) => !a.startsWith('--'));
  if (!out) { console.error('usage: node scripts/build-tty-site.mjs <out-dir> [--site URL] [--html]'); process.exit(1); }
  const si = args.indexOf('--site');
  const t0 = Date.now();
  const r = writeTtySite(path.resolve(out), { site: si >= 0 ? args[si + 1] : DEFAULT_SITE, html: args.includes('--html') });
  console.log(`wrote ${r.files} terminal-site files (${(r.bytes / 1024 / 1024).toFixed(1)} MB, ${r.pages.size} pages) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
