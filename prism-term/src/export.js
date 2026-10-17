// Export cell buffers as self-contained HTML — the bridge back into Prism.
//
// A terminal frame becomes an offline <pre> (no fonts/scripts fetched, in the
// spirit of Prism.html), and a frame sequence becomes a tiny self-playing
// animation that can be dropped into a Prism gallery or a report.

import { NONE, toHex } from './color.js';
import { ATTR } from './buffer.js';
import { getTheme } from './palettes.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function styleOf(fg, bg, at, theme) {
  let f = fg === NONE ? theme.ink : fg, b = bg;
  if (at & ATTR.INVERSE) [f, b] = [b === NONE ? theme.bg : b, f];
  let s = `color:${toHex(f)}`;
  if (b !== NONE) s += `;background:${toHex(b)}`;
  if (at & ATTR.BOLD) s += ';font-weight:700';
  if (at & ATTR.DIM) s += ';opacity:.6';
  if (at & ATTR.ITALIC) s += ';font-style:italic';
  if (at & (ATTR.UNDERLINE | ATTR.STRIKE)) s += `;text-decoration:${at & ATTR.UNDERLINE ? 'underline' : ''} ${at & ATTR.STRIKE ? 'line-through' : ''}`;
  if (at & ATTR.BLINK) s += ';animation:pt-blink 1.06s steps(1) infinite';
  return s;
}

/** Inner HTML for one frame: rows of style-coalesced spans. */
export function frameHtml(surface, theme = getTheme()) {
  const rows = [];
  for (let y = 0; y < surface.height; y++) {
    let row = '', text = '', key = null, style = '';
    const flush = () => {
      if (text) row += `<span style="${style}">${esc(text)}</span>`;
      text = '';
    };
    for (let x = 0; x < surface.width; x++) {
      const c = surface.get(x, y);
      if (c.ch === '') continue;
      const k = `${c.fg}|${c.bg}|${c.attr}`;
      if (k !== key) {
        flush();
        key = k;
        style = styleOf(c.fg, c.bg, c.attr, theme);
      }
      text += c.ch;
    }
    flush();
    rows.push(row);
  }
  return rows.join('\n');
}

const CSS = (theme, fontSize) => `html,body{margin:0;background:${toHex(theme.bg)}}
.pt{display:inline-block;margin:0;padding:12px 14px;font:${fontSize}px/1.0 "Cascadia Mono","Cascadia Code","JetBrains Mono","DejaVu Sans Mono",Menlo,Consolas,monospace;color:${toHex(theme.ink)};background:${toHex(theme.bg)};white-space:pre;letter-spacing:0;font-variant-ligatures:none}
.pt span{display:inline}
@keyframes pt-blink{50%{opacity:.2}}@media (prefers-reduced-motion:reduce){.pt span{animation:none!important}}`;

/** A complete standalone HTML document showing one frame. */
export function toHtml(surface, { theme, title = 'prism-term', fontSize = 14 } = {}) {
  const th = getTheme(theme || surface.theme);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS(th, fontSize)}</style></head>
<body><pre class="pt">${frameHtml(surface, th)}</pre></body></html>\n`;
}

/** A standalone HTML document that plays a frame sequence on loop. */
export function toAnimatedHtml(frames, { theme, title = 'prism-term', fontSize = 14, fps = 20 } = {}) {
  const th = getTheme(theme || frames[0]?.theme);
  // Styles are shared across frames as short class names, and each frame is a
  // compact array of [text, class] runs per row — a fraction of inline-styled HTML.
  const classes = new Map();
  const cls = (fg, bg, at) => {
    const k = `${fg}|${bg}|${at}`;
    let c = classes.get(k);
    if (c === undefined) { c = classes.size.toString(36); classes.set(k, c); }
    return c;
  };
  const data = frames.map((f) => {
    const rows = [];
    for (let y = 0; y < f.height; y++) {
      const runs = [];
      let text = '', key = null;
      for (let x = 0; x < f.width; x++) {
        const c = f.get(x, y);
        if (c.ch === '') continue;
        const k = cls(c.fg, c.bg, c.attr);
        if (k !== key && text) { runs.push(text, key); text = ''; }
        key = k;
        text += c.ch;
      }
      if (text) runs.push(text, key);
      rows.push(runs);
    }
    return rows;
  });
  let css = '';
  for (const [k, c] of classes) {
    const [fg, bg, at] = k.split('|').map(Number);
    css += `.pt .c${c}{${styleOf(fg, bg, at, th)}}`;
  }
  const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS(th, fontSize)}${css}</style></head>
<body><pre class="pt" id="pt"></pre><script>
(function(){var F=${json},el=document.getElementById('pt'),i=0,H=[],reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');}
function html(f){if(H[f])return H[f];var out=[];F[f].forEach(function(r){var s='';for(var k=0;k<r.length;k+=2)s+='<span class="c'+r[k+1]+'">'+esc(r[k])+'</span>';out.push(s);});return H[f]=out.join('\\n');}
function step(){el.innerHTML=html(i);i=(i+1)%F.length;}step();if(!reduce)setInterval(step,${Math.round(1000 / fps)});})();
</script></body></html>\n`;
}
