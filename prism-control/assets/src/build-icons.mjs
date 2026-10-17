// Builds every icon asset of Prism Control from assets/src/icons.src.mjs. Offline, no dependencies.
//
//   node assets/src/build-icons.mjs                    write the assets + src/PrismControl.Core/Art/Icons.g.cs
//   node assets/src/build-icons.mjs --sheets <dir>     also write contact sheets (Night + Day) for review
//   node assets/src/build-icons.mjs --check            write nothing; exit 1 if any output is stale
//
// Outputs (all SVG follows the Stream Deck app's Qt rules: hex colors + opacity attributes, no clipPath, no <text>):
//   imgs/actions/<domain>/<id>/icon.svg   action list, 20×20 (viewBox 24), white on transparent
//   imgs/actions/<domain>/<id>/key.svg    default key image, 144×144 Night (the plugin's default theme)
//   imgs/actions/<domain>/<id>/dial.svg   EncoderIcon for encoder actions, 144×144 Night
//   assets/imgs/actions/default/*         the Prism Control mark (actions without their own art)
//   assets/imgs/plugin/category.svg       28×28 white mark;  assets/src/plugin-icon.svg = master of icon.png / icon@2x.png
// Colors come from src/PrismControl.Core/Render/Tokens/Refraction.g.cs (generated from Prism-ds tokens.json) and the
// domain hues from Hues.Index in src/PrismControl.Core/Art/Art.cs, so the files always match the runtime art.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ACTIONS, DOMAIN_DIRS } from './icons.src.mjs';
import { ROOT, T, WHITE, hueOf, listIcon, keyImage, dialIcon, categoryIcon, pluginIconSvg, iconsCs } from './icon-render.mjs';
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const sheetsAt = argv.indexOf('--sheets') >= 0 ? resolve(argv[argv.indexOf('--sheets') + 1]) : null;

// ------------------------------------------------------------------------------------------- outputs

const files = new Map();
const put = (rel, text) => files.set(rel.replace(/\\/g, '/'), text);

for (const [id, encoder] of ACTIONS) {
  const [domain, name] = id.split('.');
  const dir = `${DOMAIN_DIRS[domain]}/imgs/actions/${domain}/${name}`;
  const hue = hueOf(T.night, domain);
  put(`${dir}/icon.svg`, listIcon(id));
  put(`${dir}/key.svg`, keyImage(id, T.night, hue));
  if (encoder) put(`${dir}/dial.svg`, dialIcon(id, T.night, hue));
}
put('assets/imgs/actions/default/icon.svg', listIcon('prism-control'));
put('assets/imgs/actions/default/key.svg', keyImage('prism-control', T.night, WHITE.night));
put('assets/imgs/actions/default/dial.svg', dialIcon('prism-control', T.night, WHITE.night));
put('assets/imgs/plugin/category.svg', categoryIcon());
put('assets/src/plugin-icon.svg', pluginIconSvg());
put('src/PrismControl.Core/Art/Icons.g.cs', iconsCs());

// Qt-safety self-check (the same rules as Core SvgLint, so a bad edit fails here first).
for (const [rel, text] of files) {
  if (!rel.endsWith('.svg') || rel.endsWith('plugin-icon.svg')) continue;
  const bad = [/rgba?\(/i, /hsla?\(/i, /#[0-9a-f]{8}\b/i, /#[0-9a-f]{4}\b(?![0-9a-f])/i, /clip-?path/i, /<text\b/i, /<foreignObject/i, /feDropShadow/i]
    .filter((re) => re.test(text));
  if (bad.length) { console.error(`${rel}: not Qt-safe (${bad.join(', ')})`); process.exit(1); }
}

let stale = 0;
for (const [rel, text] of files) {
  const abs = join(ROOT, rel);
  const same = existsSync(abs) && readFileSync(abs, 'utf8').replace(/\r\n/g, '\n') === text;
  if (same) continue;
  stale++;
  if (CHECK) { console.error('stale: ' + rel); continue; }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}
if (CHECK) { if (stale) process.exit(1); console.log(`${files.size} icon outputs are up to date`); }
else console.log(`${files.size} outputs (${stale} written) for ${ACTIONS.length} actions + the default mark, category and plugin icon`);

// ------------------------------------------------------------------------------------------- contact sheets

if (sheetsAt && !CHECK) {
  mkdirSync(sheetsAt, { recursive: true });
  const domains = [...new Set(ACTIONS.map(([id]) => id.split('.')[0]))];
  const titles = { audio: 'Audio', cooling: 'Cooling', eq: 'EQ', macros: 'Macros', spotify: 'Spotify', system: 'System', core: 'Core' };
  for (const t of [T.night, T.day]) {
    const dark = t.dark;
    const css = `body{margin:20px;font:11px "Segoe UI",sans-serif;background:${dark ? '#000' : '#d9d8e0'};color:${dark ? '#a2a4b4' : '#444'}}
h1{font-size:15px;margin:0 0 4px;color:${dark ? '#f0f0f5' : '#20202e'}}h2{font-size:12px;margin:16px 0 6px;color:${dark ? '#f0f0f5' : '#20202e'}}
.grid{display:flex;flex-wrap:wrap;gap:10px}.card{display:flex;gap:8px;align-items:flex-end;padding:8px;border-radius:8px;background:${dark ? '#111' : '#cfcdd8'}}
.list{display:flex;flex-direction:column;gap:6px;align-items:center;padding:6px;border-radius:6px;background:${dark ? '#2d2d2d' : '#f4f4f4'}}
.list img{display:block}${dark ? '' : '.list img{filter:brightness(0) opacity(.78)}'}figure{margin:0;text-align:center}figcaption{margin-top:3px;font-size:10px}img{display:block}`;
    let html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>Prism Control icons · ${t.name} · action list 20/40 · key 72/144 · dial 72/144</h1>`;
    html += `<p>Action-list icons are white in the files; the ${dark ? 'dark' : 'light'} panel ${dark ? 'shows them as shipped' : 'shows them tinted dark, as a light app UI would'}. ${dark ? 'Keys and dials are the shipped Night files.' : 'Keys and dials are Day renders (the runtime Day theme; the manifest ships Night).'}</p>`;
    const sheetFile = (rel, text) => { const p = join(sheetsAt, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return rel; };
    const card = (id, label, hue, encoder) => {
      const list = sheetFile(`${t.name}/${id}-icon.svg`, listIcon(id, 20));
      const key = sheetFile(`${t.name}/${id}-key.svg`, keyImage(id, t, hue));
      let c = `<div class="card"><div class="list"><img src="${list}" width="20" height="20"><img src="${list}" width="40" height="40"></div>`;
      c += `<figure><img src="${key}" width="72" height="72"><figcaption>${label}</figcaption></figure><figure><img src="${key}" width="144" height="144"><figcaption>144</figcaption></figure>`;
      if (encoder) {
        const dial = sheetFile(`${t.name}/${id}-dial.svg`, dialIcon(id, t, hue));
        c += `<figure><img src="${dial}" width="72" height="72"><figcaption>dial 72</figcaption></figure><figure><img src="${dial}" width="144" height="144"><figcaption>dial 144</figcaption></figure>`;
      }
      return c + '</div>';
    };
    for (const domain of domains) {
      const hue = hueOf(t, domain);
      html += `<h2>${titles[domain]} · ${hue.name} ${hue.lambda}</h2><div class="grid">`;
      for (const [id, encoder] of ACTIONS.filter(([x]) => x.startsWith(domain + '.'))) html += card(id, id.split('.')[1], hue, encoder);
      if (domain === 'audio') html += card('audio.mic-off', 'mic-off (runtime)', hue, false);
      html += '</div>';
    }
    html += `<h2>Prism Control mark · default action art (white light D65)</h2><div class="grid">${card('prism-control', 'default', WHITE[t.name], true)}</div></body></html>`;
    writeFileSync(join(sheetsAt, `icons-${t.name}.html`), html);
  }

  // The plugin + category mark at their real sizes, next to Prism Deck's for the family check.
  const deck = resolve(ROOT, '..', '..', 'Prism-ds/prism-deck/plugin/com.jeremyfhall.prism.sdPlugin/imgs/plugin');
  writeFileSync(join(sheetsAt, 'category.svg'), categoryIcon());
  writeFileSync(join(sheetsAt, 'plugin-icon.svg'), pluginIconSvg());
  writeFileSync(join(sheetsAt, 'marks.html'), `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:20px;background:#1e1e1e;color:#aaa;font:11px "Segoe UI",sans-serif}
.row{display:flex;gap:22px;align-items:flex-end;margin-bottom:18px}figure{margin:0;text-align:center}figcaption{margin-top:4px}.light{background:#f2f2f2;padding:10px;border-radius:8px}.light img{filter:brightness(0) opacity(.8)}</style></head><body>
<div class="row"><figure><img src="plugin-icon.svg" width="256" height="256"><figcaption>Prism Control 256</figcaption></figure>
<figure><img src="file:///${deck.replace(/\\/g, '/')}/icon.png" width="256" height="256"><figcaption>Prism Deck (sibling) 256</figcaption></figure>
<figure><img src="plugin-icon.svg" width="128" height="128"><figcaption>128</figcaption></figure><figure><img src="plugin-icon.svg" width="64" height="64"><figcaption>64</figcaption></figure><figure><img src="plugin-icon.svg" width="32" height="32"><figcaption>32</figcaption></figure></div>
<div class="row"><figure><img src="category.svg" width="28" height="28"><figcaption>category 28</figcaption></figure><figure><img src="category.svg" width="56" height="56"><figcaption>56</figcaption></figure>
<figure><img src="file:///${deck.replace(/\\/g, '/')}/category.svg" width="28" height="28"><figcaption>Prism Deck 28</figcaption></figure><figure><img src="file:///${deck.replace(/\\/g, '/')}/category.svg" width="56" height="56"><figcaption>56</figcaption></figure>
<div class="light"><img src="category.svg" width="28" height="28"></div><div class="light"><img src="category.svg" width="56" height="56"></div></div></body></html>`);
  console.log('contact sheets: ' + sheetsAt);
}
