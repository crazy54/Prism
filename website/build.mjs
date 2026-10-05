// Build a portable static site. Run from any working directory with Node.js 18+.
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadCatalogFile } from '../prism-mcp-server/utils/catalog.js';

const site = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(site);
const output = path.resolve(process.argv[2] || path.join(repo, 'site-dist'));
if (output === repo || output === site || repo.startsWith(output + path.sep)) throw new Error('Output must be a dedicated build directory.');
const catalog = await loadCatalogFile(path.join(repo, 'Prism.html'));
const ids = ['ai-processing-orb', 'charts-kpi-sparkline', 'fx-aurora', 'objects-atom', 'text-gradient-flow-staple', 'lab-scale-in-bounce'];
const legacy = ':root{--gray:#72869f;--orange:var(--accent);--red:#f85149;--blue:var(--info);--green:var(--pos);--purple:var(--crit)}';
const base = '*{box-sizing:border-box}body{margin:0;min-height:220px;display:flex;align-items:center;justify-content:center;padding:22px;font-family:system-ui,sans-serif;color:var(--ink);background:transparent}.panel{min-width:215px}.ptitle{padding-left:0!important}.atom{width:145px;height:145px}';
const motion = '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition:none!important}}';
await mkdir(path.join(site, 'assets', 'previews'), { recursive: true });
const showcase = [];
for (const id of ids) {
  const effect = catalog.effects.find((item) => item.id === id);
  if (!effect || effect.needsJs) throw new Error(`Preview requires an available CSS-only facet: ${id}`);
  const html = effect.html.replace(/<button\b[^>]*class="pr-playbtn"[\s\S]*?<\/button>/g, '');
  const css = catalog.tokens.css + legacy + base + effect.css + motion;
  const title = effect.name.replace(/[<>]/g, '');
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body>${html}</body></html>`;
  await writeFile(path.join(site, 'assets', 'previews', id + '.html'), doc);
  showcase.push({ id, name: effect.name.replace(/ ★.*/, ''), gallery: effect.gallery, galleryTitle: effect.galleryTitle, snippet: `<style>\n${catalog.tokens.css}\n${legacy}\n${effect.css}\n</style>\n${html}` });
}
await writeFile(path.join(site, 'assets', 'showcase.json'), JSON.stringify(showcase, null, 2) + '\n');
await writeFile(path.join(site, 'assets', 'galleries.json'), JSON.stringify(catalog.galleries, null, 2) + '\n');
const index = await readFile(path.join(site, 'index.html'), 'utf8');
const counts = [...index.matchAll(/class="gallery-count">([\d,]+)/g)].map((match) => Number(match[1].replaceAll(',', '')));
if (counts.reduce((sum, count) => sum + count, 0) !== catalog.effects.length) throw new Error('Landing-page gallery counts need to be updated from the catalog.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'assets']) await cp(path.join(site, file), path.join(output, file), { recursive: true });
await cp(path.join(repo, 'Prism.html'), path.join(output, 'Prism.html'));
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${catalog.effects.length} facets, ${catalog.galleries.length} gallery links, and ${showcase.length} previews into ${output}`);
