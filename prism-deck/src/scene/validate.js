// The deck SVG subset — what "valid" means for a frame.
//
// One frame must look identical in the Stream Deck app (Qt SVG, roughly SVG Tiny
// 1.2), in browsers, and in the raster backend (src/raster/, which implements
// exactly this subset for hidraw devices, PNG/GIF exports and golden tests):
//
//   elements   svg g defs title path rect circle ellipse line polyline polygon
//              linearGradient radialGradient stop clipPath
//   paint      fill / stroke = #rrggbb | #rgb | none | url(#id); opacity via
//              opacity, fill-opacity, stroke-opacity, stop-opacity (0–1)
//   stroke     stroke-width, stroke-linecap, stroke-linejoin, stroke-dasharray,
//              stroke-dashoffset, stroke-miterlimit; fill-rule / clip-rule
//   geometry   transform (translate / scale / rotate / matrix), clip-path="url(#id)"
//   gradients  x1 y1 x2 y2 / cx cy r fx fy, gradientUnits, gradientTransform, spreadMethod
//
//   ✗ compact arc flags ("a5 5 0 0110 10": write the flags space-separated — Qt, the raster
//     backend and geom.js must all read the same thing), <g> inside <clipPath> (browsers ignore it)
//   ✗ text (draw text with scene/text.js — it emits paths), filter / mask / use /
//     image / foreignObject / style / script / animate*, CSS (style=, <style>),
//     8-digit hex (#AARRGGBB in Qt!), rgba()/hsl(), external href/url(), event
//     handlers, NaN / Infinity / undefined
//
// Also: well-formed XML, one root <svg> with xmlns + width/height/viewBox matching
// the surface, every id carrying the render's idPrefix, a byte budget.

const SVG_ALLOWED = new Set(['svg', 'g', 'defs', 'title', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath']);
const ATTR_ALLOWED = new Set(['xmlns', 'width', 'height', 'viewBox', 'id', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'opacity', 'transform', 'clip-path', 'clip-rule', 'clipPathUnits', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'preserveAspectRatio']);
const DEVICE_ATTRS = new Set(['mask', 'maskUnits', 'maskContentUnits']);
const COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']);
const COLOR_VALUE = /^(none|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|url\(#[^)]+\)|white|black)$/;
const BAD_TOKENS = [/NaN/, /Infinity/, /undefined/, /\[object /];
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y;

/**
 * Minimal XML parser → { root, errors }. Elements: { tag, attrs, children, text }.
 * `voids` (HTML mode) lists elements that never close.
 */
export function parseXml(src, { voids = null } = {}) {
  const errors = [];
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  const checkEntities = (s, where) => {
    for (let k = s.indexOf('&'); k >= 0; k = s.indexOf('&', k + 1)) {
      ENTITY.lastIndex = k;
      if (!ENTITY.test(s)) { errors.push(`bad entity at ${where}+${k}`); break; }
    }
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const chunk = src.slice(i, lt < 0 ? src.length : lt);
    if (chunk) { checkEntities(chunk, i); top().text += chunk; }
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) { errors.push('unterminated comment'); break; }
      i = end + 3; continue;
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) { const end = src.indexOf('>', lt); i = end < 0 ? src.length : end + 1; continue; }
    const gt = src.indexOf('>', lt);
    if (gt < 0) { errors.push(`unterminated tag at ${lt}`); break; }
    let raw = src.slice(lt + 1, gt);
    // a '>' inside a quoted attribute value: extend to the real end of the tag
    let end = gt;
    while ((raw.match(/"/g) || []).length % 2 === 1) {
      const next = src.indexOf('>', end + 1);
      if (next < 0) { errors.push(`unterminated attribute at ${lt}`); break; }
      end = next; raw = src.slice(lt + 1, end);
    }
    i = end + 1;
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      if (voids?.has(name.toLowerCase())) continue;
      const open = top();
      if (open.tag !== name) { errors.push(`mismatched </${name}> (open <${open.tag}>)`); if (stack.some((e) => e.tag === name)) while (stack.length > 1 && top().tag !== name) stack.pop(); }
      if (stack.length > 1 && top().tag === name) stack.pop();
      continue;
    }
    const selfClose = raw.endsWith('/');
    if (selfClose) raw = raw.slice(0, -1);
    const m = raw.match(/^([A-Za-z][\w:.-]*)/);
    if (!m) { errors.push(`bad tag <${raw.slice(0, 20)}>`); continue; }
    const tag = m[1];
    const attrs = {};
    const rest = raw.slice(tag.length);
    const re = /\s+([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gy;
    let pos = 0;
    re.lastIndex = 0;
    while (pos < rest.length) {
      re.lastIndex = pos;
      const am = re.exec(rest);
      if (!am) { if (rest.slice(pos).trim()) errors.push(`junk in <${tag}>: "${rest.slice(pos, pos + 20).trim()}"`); break; }
      const [, k, dq, sq, bare] = am;
      if (Object.hasOwn(attrs, k)) errors.push(`duplicate attribute ${k} on <${tag}>`);
      if (!voids && dq === undefined) errors.push(`attribute ${k} on <${tag}> must be double-quoted`);
      const v = dq ?? sq ?? bare ?? '';
      checkEntities(v, lt);
      attrs[k] = v;
      pos = re.lastIndex;
    }
    const el = { tag, attrs, children: [], text: '' };
    top().children.push(el);
    if (!selfClose && !voids?.has(tag.toLowerCase())) stack.push(el);
  }
  if (stack.length > 1) errors.push(`unclosed <${stack.slice(1).map((e) => e.tag).join('>, <')}>`);
  return { root, errors };
}

/** True when an arc's flags are written compactly ("0110" for flags 0 1 then 10), which parsers disagree on. */
export function compactArcFlags(d) {
  const toks = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  let cmd = null, k = 0;
  for (const tk of toks) {
    if (/^[A-Za-z]$/.test(tk)) { cmd = tk; k = 0; continue; }
    if (cmd === 'A' || cmd === 'a') { const pos = k % 7; if ((pos === 3 || pos === 4) && tk !== '0' && tk !== '1') return true; k++; }
  }
  return false;
}

function walk(el, fn) { fn(el); for (const c of el.children) walk(c, fn); }

/**
 * Lint one SVG document. opts: { w, h, maxBytes, idPrefix }.
 * → list of problems ([] = valid).
 */
export function validateSvg(svg, { w, h, maxBytes = 16384, idPrefix, profile = 'subset' } = {}) {
  // profile 'device': the output of scene/qt.js toDeviceSvg() — <mask> instead of <clipPath>
  const device = profile === 'device';
  const out = [];
  if (typeof svg !== 'string') return [`not a string (${typeof svg})`];
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > maxBytes) out.push(`${bytes} bytes > budget ${maxBytes}`);
  for (const re of BAD_TOKENS) if (re.test(svg)) out.push(`contains ${re.source}`);
  if (/#[0-9a-fA-F]{8}\b/.test(svg)) out.push('8-digit hex color (Qt reads #AARRGGBB) — use 6-digit hex + *-opacity');
  if (/#[0-9a-fA-F]{4}\b(?![0-9a-fA-F])/.test(svg.replace(/id="[^"]*"|#[0-9a-fA-F]{6}/g, ''))) out.push('4-digit hex color — use 6-digit hex');
  if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.test(svg)) out.push('functional color (rgba()/hsl()…) — use 6-digit hex + *-opacity');
  if (/\bvar\(--/.test(svg)) out.push('CSS custom property — key images are standalone documents');
  const { root, errors } = parseXml(svg.trim());
  out.push(...errors);
  const top = root.children.filter((c) => c.tag !== '#text');
  if (top.length !== 1 || top[0].tag !== 'svg') { out.push('document must be a single <svg> root'); return out; }
  const s = top[0];
  if (root.text.trim()) out.push('text outside <svg>');
  if (s.attrs.xmlns !== 'http://www.w3.org/2000/svg') out.push('root <svg> needs xmlns="http://www.w3.org/2000/svg"');
  // sizes compare at the writer's precision (2 decimals: scene/svg.js n(), devices.js r2()), never on float noise
  const same = (a, b) => Math.round(+a * 100) === Math.round(b * 100);
  if (w !== undefined && !same(s.attrs.width, w)) out.push(`width ${s.attrs.width} ≠ ${w}`);
  if (h !== undefined && !same(s.attrs.height, h)) out.push(`height ${s.attrs.height} ≠ ${h}`);
  if (!s.attrs.viewBox) out.push('root <svg> needs a viewBox');
  const ids = new Set();
  walk(s, (el) => {
    if (device && (el.tag === 'clipPath' || el.attrs['clip-path'])) out.push('clipPath is ignored by the Stream Deck app — run the frame through toDeviceSvg()');
    if (!(SVG_ALLOWED.has(el.tag) || (device && el.tag === 'mask'))) out.push(el.tag === 'text' ? '<text> — draw text with scene/text.js (paths)' : `<${el.tag}> is outside the deck SVG subset`);
    if (el.tag === 'clipPath' && el.children.some((c) => c.tag === 'g')) out.push('<g> inside <clipPath> is ignored by browsers — put the shapes directly in the clipPath');
    if (el.attrs.d && compactArcFlags(el.attrs.d)) out.push(`compact arc flags in d="${el.attrs.d.slice(0, 40)}…" — separate the two flags and the next number with spaces`);
    for (const [k, v] of Object.entries(el.attrs)) {
      if (!(ATTR_ALLOWED.has(k) || (device && DEVICE_ATTRS.has(k)))) out.push(`attribute ${k} on <${el.tag}> is outside the deck SVG subset`);
      if (/^on/i.test(k)) out.push(`event handler ${k}`);
      if (COLOR_ATTRS.has(k) && !COLOR_VALUE.test(v.trim())) out.push(`${k}="${v}" — colors are 6-digit hex (+ *-opacity), none or url(#id); Qt reads 8-digit hex as #AARRGGBB`);
      if (k === 'style') out.push('style= attribute (use presentation attributes)');
      if ((k === 'href' || k === 'xlink:href') && !v.startsWith('#')) out.push(`external ${k}`);
      if (/url\(/.test(v) && !/^url\(#[^)]+\)$/.test(v.trim())) out.push(`${k}="${v}" — only url(#id) references`);
      if (k === 'id') {
        if (ids.has(v)) out.push(`duplicate id "${v}"`);
        ids.add(v);
        if (idPrefix && !v.startsWith(idPrefix)) out.push(`id "${v}" lacks the render prefix "${idPrefix}" (use canvas.id(name))`);
      }
    }
  });
  for (const m of svg.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) {
    const id = m[1] || m[2];
    if (!ids.has(id)) out.push(`reference to missing #${id}`);
  }
  return [...new Set(out)];
}

/** @deprecated name kept for older call sites */
export const lintSvg = validateSvg;
