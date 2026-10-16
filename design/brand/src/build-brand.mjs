// Generates the static Prism mark family from one geometry.
//   node design/brand/src/build-brand.mjs
// Geometry is the website mark (assets/prism.svg): apex 20,4 · base 4..36 @ y33 · front edge to x25.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');

const G = { ax: 20, ay: 4, lx: 4, rx: 36, by: 33, fx: 25 };   // apex, base left/right, base y, front-edge foot
const tri = `M${G.ax} ${G.ay} ${G.rx} ${G.by}H${G.lx}Z`;
const left = `M${G.ax} ${G.ay} ${G.fx} ${G.by}H${G.lx}Z`;
const right = `M${G.ax} ${G.ay} ${G.rx} ${G.by}H${G.fx}Z`;

const PAL = {
  night: { edge: ['#ece6ff', '#b8a2f2', '#64ceea'], left: ['#e2d9ff', .46, '#ab91eb', .14, '#839ef4', .04], right: ['#839ef4', .07, '#52cea0', .17],
    lit: '#ffffff', litOp: 1, apex: '#ffffff', spec: ['#ab91eb', '#52acee', '#52cea0', '#ebc059', '#ec8398'], inner: .8 },
  day: { edge: ['#8b70cf', '#7353bb', '#006ca9'], left: ['#9876e3', .26, '#9876e3', .08, '#6783ec', .03], right: ['#6783ec', .05, '#009c71', .12],
    lit: '#4b2f96', litOp: .9, apex: '#7353bb', spec: ['#9876e3', '#0090de', '#009c71', '#ac8300', '#de5f7d'], inner: .75 },
};

function mark(mode, { id = 'pm', size, label = 'Prism', sw = 1.5, foot = true, apex = true, ns = true } = {}) {
  const V = ns ? ' vector-effect="non-scaling-stroke"' : '';
  const p = PAL[mode], u = `${id}-${mode}`;
  const stops = (arr) => arr.map((c, i) => `<stop offset="${(i / (arr.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"${size ? ` width="${size}" height="${size}"` : ''} role="img" aria-label="${label}">
<title>${label}</title>
<defs>
<linearGradient id="${u}-e" x1="6" y1="4" x2="36" y2="33" gradientUnits="userSpaceOnUse">${stops(p.edge)}</linearGradient>
<linearGradient id="${u}-l" x1="11" y1="5" x2="17" y2="33" gradientUnits="userSpaceOnUse"><stop stop-color="${p.left[0]}" stop-opacity="${p.left[1]}"/><stop offset=".55" stop-color="${p.left[2]}" stop-opacity="${p.left[3]}"/><stop offset="1" stop-color="${p.left[4]}" stop-opacity="${p.left[5]}"/></linearGradient>
<linearGradient id="${u}-r" x1="22" y1="5" x2="33" y2="33" gradientUnits="userSpaceOnUse"><stop stop-color="${p.right[0]}" stop-opacity="${p.right[1]}"/><stop offset="1" stop-color="${p.right[2]}" stop-opacity="${p.right[3]}"/></linearGradient>
<linearGradient id="${u}-f" x1="${G.ax}" y1="${G.ay}" x2="${G.fx}" y2="${G.by}" gradientUnits="userSpaceOnUse"><stop stop-color="${p.lit}" stop-opacity="${p.litOp}"/><stop offset=".62" stop-color="${p.lit}" stop-opacity="${(p.litOp * .38).toFixed(2)}"/><stop offset="1" stop-color="${p.lit}" stop-opacity="0"/></linearGradient>
<radialGradient id="${u}-a"><stop stop-color="${p.apex}"/><stop offset=".35" stop-color="${p.apex}" stop-opacity=".7"/><stop offset="1" stop-color="${p.apex}" stop-opacity="0"/></radialGradient>
<linearGradient id="${u}-s" x1="${G.fx}" y1="0" x2="${G.rx}" y2="0" gradientUnits="userSpaceOnUse">${stops(p.spec)}</linearGradient>
</defs>
<path d="${left}" fill="url(#${u}-l)"/>
<path d="${right}" fill="url(#${u}-r)"/>
<path d="${tri}" fill="none" stroke="url(#${u}-e)" stroke-width="${sw}" stroke-linejoin="round"${V}/>
<path d="M${G.ax} ${G.ay} ${G.fx} ${G.by}" fill="none" stroke="url(#${u}-f)" stroke-width="${(sw * .75).toFixed(2)}" stroke-linecap="round"${V}/>
${foot ? `<path d="M${G.fx + .9} ${G.by}H${G.rx - .9}" stroke="url(#${u}-s)" stroke-width="${sw}" stroke-linecap="round" opacity="${p.inner}"${V}/>` : ''}
${apex ? `<circle cx="${G.ax}" cy="${G.ay}" r="${mode === 'day' ? 1.7 : 2}" fill="url(#${u}-a)"/>` : ''}
</svg>
`;
}

// one-color mark for UI (inherits currentColor)
const mono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="img" aria-label="Prism"><title>Prism</title>
<path d="${right}" fill="currentColor" fill-opacity=".1"/>
<path d="${tri}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M${G.ax} ${G.ay} ${G.fx} ${G.by}" fill="none" stroke="currentColor" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round"/>
</svg>
`;

// favicon: heavier strokes, larger in the box, adapts to the tab strip's color scheme
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<style>
.e{stroke:#c9b8fb}.f{stroke:#fff}.l{fill:#b8a2f2;fill-opacity:.42}.r{fill:#64ceea;fill-opacity:.16}.a{fill:#fff}
@media (prefers-color-scheme:light){.e{stroke:#7353bb}.f{stroke:#3d2a7d}.l{fill:#7353bb;fill-opacity:.24}.r{fill:#006ca9;fill-opacity:.1}.a{fill:#7353bb}}
</style>
<path class="l" d="M16 2.6 20.1 28H2.9Z"/><path class="r" d="M16 2.6 29.1 28H20.1Z"/>
<path class="e" d="M16 2.6 29.1 28H2.9Z" fill="none" stroke-width="2.3" stroke-linejoin="round"/>
<path class="f" d="M16 2.6 20.1 28" fill="none" stroke-width="1.7" stroke-linecap="round"/>
</svg>
`;

// app-icon tile (PNG sources): ink-navy glass tile, lit top edge, mark centered
const tile = (px) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">
<defs>
<linearGradient id="tb" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#171a27"/><stop offset="1" stop-color="#0a0c12"/></linearGradient>
<linearGradient id="te" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="th" cx=".5" cy=".62" r=".5"><stop stop-color="#9177f2" stop-opacity=".32"/><stop offset="1" stop-color="#9177f2" stop-opacity="0"/></radialGradient>
</defs>
<rect width="64" height="64" rx="${px <= 32 ? 13 : 14}" fill="url(#tb)"/>
<rect width="64" height="64" rx="${px <= 32 ? 13 : 14}" fill="url(#th)"/>
<path d="M14 .6h36" stroke="url(#te)" stroke-width="1.2"/>
<g transform="translate(7 6.6) scale(1.25)">${mark('night', { id: 'tile', ns: false, sw: px <= 32 ? 2.4 : 1.6, foot: px > 32 }).replace(/^<svg[^>]*>\n<title>[^<]*<\/title>\n/, '').replace(/<\/svg>\n$/, '')}</g>
</svg>
`;

writeFileSync(join(OUT, 'prism-mark.svg'), mark('night'));
writeFileSync(join(OUT, 'prism-mark-day.svg'), mark('day'));
writeFileSync(join(OUT, 'prism-mark-mono.svg'), mono);
writeFileSync(join(OUT, 'favicon.svg'), fav);
writeFileSync(join(OUT, 'src', 'tile-32.svg'), tile(32));
writeFileSync(join(OUT, 'src', 'tile-180.svg'), tile(180));
writeFileSync(join(OUT, 'src', 'tile-512.svg'), tile(512));
export { mark, G, PAL };
console.log('brand svgs written');

// ---- wordmark + lockup ---------------------------------------------------
// Outlines: Inter Bold 700 (design/fonts/inter-700-latin.woff2, SIL OFL) via outline.py → prism-outline.json,
// tracked −0.045em like the website. Regenerate: python outline.py ../../fonts/inter-700-latin.woff2 "prism." -0.045 > prism-outline.json
const OL = JSON.parse(readFileSync(join(OUT, 'src', 'prism-outline.json'), 'utf8'));
const EM = 100, k = EM / OL.upm;
const letters = OL.glyphs.filter(g => g.ch !== '.').map(g => g.d).join('');
const dotG = OL.glyphs.find(g => g.ch === '.');
const wordW = OL.width * k;
function wordmarkG(ink, accent) {
  return `<g transform="scale(${k.toFixed(6)})"><path d="${letters}" fill="${ink}"/><path d="${dotG.d}" fill="${accent}"/></g>`;
}
const WM = { night: ['#f0f0f5', '#b8a2f2'], day: ['#20202e', '#7353bb'] };
function lockup(mode) {
  // mark: triangle 0.80em tall, base on the baseline; gap 0.36em (website: 30px mark, 10px gap, 27px type)
  const s = 80 / 29, mw = 40 * s, gap = 22, top = -33 * s, pad = 8;
  const x0 = pad, wx = x0 + mw * 0.92 + gap - 4 * s;          // the box has 4 units of air left/right
  const W = Math.ceil(wx + wordW + pad), yTop = Math.floor(top + 4 * s - pad), H = Math.ceil(-yTop + 26 + pad);
  const inner = mark(mode, { id: 'lk', sw: 1.6 }).replace(/^<svg[^>]*>\n<title>[^<]*<\/title>\n/, '').replace(/<\/svg>\n$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${yTop} ${W} ${H}" role="img" aria-label="prism.">
<title>prism.</title>
<g transform="translate(${(x0 - 4 * s * 0.5).toFixed(2)} ${top.toFixed(2)}) scale(${s.toFixed(4)})">${inner}</g>
<g transform="translate(${wx.toFixed(2)} 0)">${wordmarkG(...WM[mode])}</g>
</svg>
`;
}
writeFileSync(join(OUT, 'prism-lockup.svg'), lockup('night'));
writeFileSync(join(OUT, 'prism-lockup-day.svg'), lockup('day'));
writeFileSync(join(OUT, 'prism-wordmark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 ${Math.floor(-OL.cap * k - 8)} ${Math.ceil(wordW + 8)} ${Math.ceil(OL.cap * k + 34)}" role="img" aria-label="prism."><title>prism.</title>
<style>.w{fill:currentColor}.d{fill:var(--accent,#b8a2f2)}</style>
<g transform="scale(${k.toFixed(6)})"><path class="w" d="${letters}"/><path class="d" d="${dotG.d}"/></g></svg>
`);
console.log('lockups written');
