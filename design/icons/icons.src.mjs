// Prism "Refraction" icon family — single source of truth.
//
//   24px grid · 1.5px stroke · round caps + joins · currentColor · live area ~3–21.
//   Edit here, then run:  node design/icons/build-icons.mjs
//
// Spectral hooks (all optional, all driven by CSS custom properties so they work
// through <use> shadow trees):
//   F  → "facet" fill    fill:  var(--icon-fill, none)          the glass that fills with light
//   A  → accent stroke   stroke:var(--icon-accent, currentColor) recolors in the spectral state
//   G  → glint stroke    hidden at rest; opacity var(--icon-glint,0), color var(--icon-glint-color)
//   AD → accent dot      fill:  var(--icon-accent, currentColor)
//
// Each icon also carries its terminal fallback: [unicode glyph, 7-bit ASCII].

const r = n => +n.toFixed(2);
const F = ' class="f" style="fill:var(--icon-fill,none);fill-opacity:var(--icon-fill-opacity,1)"';
const FS = ' class="f" stroke="none" style="fill:var(--icon-fill,none);fill-opacity:var(--icon-fill-opacity,1)"';     // fill-only facet
const A = ' class="a" style="stroke:var(--icon-accent,currentColor)"';
const G = ' class="g" style="stroke:var(--icon-glint-color,currentColor);opacity:var(--icon-glint,0)"';
const FA = ' class="f a" style="fill:var(--icon-fill,none);fill-opacity:var(--icon-fill-opacity,1);stroke:var(--icon-accent,currentColor)"';
const dot = (x, y, rr = 1.1, cls = '') => cls === 'a'
  ? `<circle class="a" cx="${x}" cy="${y}" r="${rr}" stroke="none" style="fill:var(--icon-accent,currentColor)"/>`
  : `<circle cx="${x}" cy="${y}" r="${rr}" fill="currentColor" stroke="none"/>`;

const pt = (cx, cy, rad, deg) => [cx + rad * Math.cos(deg * Math.PI / 180), cy + rad * Math.sin(deg * Math.PI / 180)];
const P = ([x, y]) => `${r(x)} ${r(y)}`;

// concave four-point sparkle
function sparkle(cx, cy, R, e = R * 0.16) {
  return `M${P([cx, cy - R])}Q${P([cx + e, cy - e])} ${P([cx + R, cy])}Q${P([cx + e, cy + e])} ${P([cx, cy + R])}` +
    `Q${P([cx - e, cy + e])} ${P([cx - R, cy])}Q${P([cx - e, cy - e])} ${P([cx, cy - R])}Z`;
}
// regular star polygon
function star(cx, cy, R, ri, n = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < n * 2; i++) d += (i ? 'L' : 'M') + P(pt(cx, cy, i % 2 ? ri : R, rot + i * 180 / n));
  return d + 'Z';
}
function polygon(cx, cy, R, n, rot) {
  let d = '';
  for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + P(pt(cx, cy, R, rot + i * 360 / n));
  return d + 'Z';
}
// gear with trapezoid teeth
function gear(cx, cy, ro, ri, teeth = 8) {
  const step = 360 / teeth, top = step * 0.2, root = step * 0.3;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = -90 + i * step;
    const seq = [[ri, a - root], [ro, a - top], [ro, a + top], [ri, a + root]];
    seq.forEach(([rad, deg], k) => { d += (i === 0 && k === 0 ? 'M' : 'L') + P(pt(cx, cy, rad, deg)); });
  }
  return d + 'Z';
}
// arc from a0 to a1 (degrees, screen space, clockwise-positive)
function arc(cx, cy, rad, a0, a1) {
  const [x0, y0] = pt(cx, cy, rad, a0), [x1, y1] = pt(cx, cy, rad, a1);
  const sweep = a1 > a0 ? 1 : 0, large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${P([x0, y0])}A${rad} ${rad} 0 ${large} ${sweep} ${P([x1, y1])}`;
}
// arrowhead at the end of an arc travelling from a0 to a1
function arcHead(cx, cy, rad, a1, dir, len = 3.6, spread = 38) {
  const [x, y] = pt(cx, cy, rad, a1);
  const t = (a1 + (dir > 0 ? 90 : -90)) * Math.PI / 180;          // travel direction
  const back = t + Math.PI;
  const h1 = [x + len * Math.cos(back + spread * Math.PI / 180), y + len * Math.sin(back + spread * Math.PI / 180)];
  const h2 = [x + len * Math.cos(back - spread * Math.PI / 180), y + len * Math.sin(back - spread * Math.PI / 180)];
  return `M${P(h1)}L${P([x, y])}L${P(h2)}`;
}
// archimedean spiral as smooth cubic segments (Catmull-Rom)
function spiral(cx, cy, turns, rOut, rIn = 0.6, startDeg = 0) {
  const pts = [], N = Math.round(turns * 18);
  for (let i = 0; i <= N; i++) {
    const t = i / N, rad = rIn + (rOut - rIn) * t, deg = startDeg + t * turns * 360;
    pts.push(pt(cx, cy, rad, deg));
  }
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d;
}
// heart from two circles + tangents to a bottom point
function heart(cx, top, w, bottom) {
  const rad = w / 4, c1 = [cx - rad, top + rad], c2 = [cx + rad, top + rad], tip = [cx, bottom];
  const tangent = (c, side) => {               // outer tangent point from tip to circle c
    const dx = c[0] - tip[0], dy = c[1] - tip[1], dist = Math.hypot(dx, dy);
    const base = Math.atan2(dy, dx), off = Math.asin(rad / dist) * side;
    const ang = base + off, len = Math.sqrt(dist * dist - rad * rad);
    return [tip[0] + len * Math.cos(ang), tip[1] + len * Math.sin(ang)];
  };
  const tL = tangent(c1, -1), tR = tangent(c2, 1);
  return `M${P(tip)}L${P(tL)}A${r(rad)} ${r(rad)} 0 0 1 ${P([cx, top + rad])}A${r(rad)} ${r(rad)} 0 0 1 ${P(tR)}Z`;
}
// crescent: outer circle minus offset circle
function crescent(cx, cy, R, ox, oy, R2) {
  const d = Math.hypot(ox, oy), a = (R * R - R2 * R2 + d * d) / (2 * d), h = Math.sqrt(R * R - a * a);
  const ux = ox / d, uy = oy / d, mx = cx + a * ux, my = cy + a * uy;
  const p1 = [mx - h * uy, my + h * ux], p2 = [mx + h * uy, my - h * ux];
  return `M${P(p1)}A${R} ${R} 0 1 1 ${P(p2)}A${R2} ${R2} 0 0 0 ${P(p1)}Z`;
}
function spokes(cx, cy, r0, r1, n, rot = -90) {
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = rot + k * 360 / n, op = r(1 - k * (0.72 / (n - 1)));
    s += `<path d="M${P(pt(cx, cy, r0, a))}L${P(pt(cx, cy, r1, a))}"${op < 1 ? ` stroke-opacity="${op}"` : ''}/>`;
  }
  return s;
}
function rays(cx, cy, r0, r1, n, rot = -90, attrs = '') {
  let d = '';
  for (let k = 0; k < n; k++) { const a = rot + k * 360 / n; d += `M${P(pt(cx, cy, r0, a))}L${P(pt(cx, cy, r1, a))}`; }
  return `<path${attrs} d="${d}"/>`;
}

// ---------------------------------------------------------------------------
// group: gallery | page | surface | action | terminal
export const ICONS = {
  // ===== Web galleries =====================================================
  charts: { group: 'gallery', label: 'Charts & Metrics', term: ['▅', '%'],
    body: `<rect${F} x="4.75" y="11" width="3.5" height="6.5" rx="1"/><rect${F} x="10.25" y="4.5" width="3.5" height="13" rx="1"/><rect${F} x="15.75" y="8" width="3.5" height="9.5" rx="1"/><path d="M3.5 20.5h17"/><path${G} d="M11.75 7v3"/>` },
  fx: { group: 'gallery', label: 'FX Store', term: ['✺', '*'],
    body: `<circle${F} cx="12" cy="12" r="2.25"/><path d="M12 2.75v4.5M12 16.75v4.5M2.75 12h4.5M16.75 12h4.5"/>${dot(6.4, 6.4, 1.05)}${dot(17.6, 6.4, 1.05)}${dot(6.4, 17.6, 1.05)}${dot(17.6, 17.6, 1.05)}` },
  lab: { group: 'gallery', label: 'Animation Lab', term: ['∿', '~'],
    body: `<path${FS} d="M7.4 14.2c1.53-.9 3.07-.9 4.6 0s3.07.9 4.6 0l2.3 4A1.9 1.9 0 0 1 17.2 21H6.8a1.9 1.9 0 0 1-1.7-2.8Z"/><path d="M9.5 3.25h5M10.5 3.25V8.8L5.1 18.2A1.9 1.9 0 0 0 6.8 21h10.4a1.9 1.9 0 0 0 1.7-2.8L13.5 8.8V3.25"/><path${A} d="M7.4 14.2c1.53-.9 3.07-.9 4.6 0s3.07.9 4.6 0"/>` },
  ai: { group: 'gallery', label: 'AI Working', term: ['✳', '@'],
    body: `<rect x="6" y="6" width="12" height="12" rx="2.75"/><path d="M9.5 2.75V6M14.5 2.75V6M9.5 18v3.25M14.5 18v3.25M2.75 9.5H6M2.75 14.5H6M18 9.5h3.25M18 14.5h3.25"/><path${FA} d="${sparkle(12, 12, 3.4)}"/>` },
  objects: { group: 'gallery', label: 'Animated Objects', term: ['◈', '<>'],
    body: `<path${FS} d="M12 2.75 20 7.37 12 12 4 7.37Z"/><path d="M12 2.75 20 7.37v9.26l-8 4.62-8-4.62V7.37Z"/><path d="M4 7.37 12 12l8-4.63M12 12v9.25"/>` },
  input: { group: 'gallery', label: 'Input Methods', term: ['◉', '(o)'],
    body: `<rect x="2.5" y="6.25" width="19" height="11.5" rx="5.75"/><circle${F} cx="15.75" cy="12" r="3"/><path${G} d="M6.75 12h2.5"/>` },
  text: { group: 'gallery', label: 'Text Effects', term: ['Aa', 'Aa'],
    body: `<path d="M2.75 18.75 8.25 5.25l5.5 13.5M4.85 13.6h6.8"/><circle${F} cx="18" cy="15.75" r="3"/><path d="M21 12.75v6"/>` },
  shapes: { group: 'gallery', label: 'Text Shapes', term: ['◎', '@'],
    body: `<path d="${spiral(12, 12, 2.3, 8.6, 0.4, -40)}"/>${dot(12, 12, 1.15, 'a')}` },
  maps: { group: 'gallery', label: 'Maps & Geo', term: ['◍', '+'],
    body: `<ellipse${F} cx="12" cy="12" rx="3.75" ry="8.75"/><circle cx="12" cy="12" r="8.75"/><path d="M3.9 9h16.2M3.9 15h16.2"/>` },
  notify: { group: 'gallery', label: 'Notifications & Status', term: ['●', 'o'],
    body: `<path${F} d="M6.25 16.25V11.5a5.75 5.75 0 0 1 11.5 0v4.75l1.5 2H4.75Z"/><path d="M10 21h4M12 3.25v2.5"/>${dot(18.5, 5.25, 1.9, 'a')}` },
  arch: { group: 'gallery', label: 'Architecture Diagrams', term: ['┬', '+-'],
    body: `<rect${F} x="8.75" y="3.25" width="6.5" height="5.25" rx="1.5"/><rect x="3.25" y="15.5" width="6.5" height="5.25" rx="1.5"/><rect x="14.25" y="15.5" width="6.5" height="5.25" rx="1.5"/><path d="M12 8.5V12M6.5 15.5v-2a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v2"/>` },
  callouts: { group: 'gallery', label: 'Callouts & Annotations', term: ['▌', '>'],
    body: `<circle${F} cx="6.25" cy="17.75" r="2.75"/><path${A} d="M8.2 15.8 12 12"/><rect x="11.25" y="3.5" width="9.75" height="8.5" rx="2"/><path d="M14.25 7.75h3.75"/>` },
  obsidian: { group: 'gallery', label: 'Obsidian Facets', term: ['◆', '[['],
    body: `<path d="M14 3H7a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7 21h10a2.25 2.25 0 0 0 2.25-2.25V8.25Z"/><path d="M14 3v5.25h5.25"/><path${F} d="M12 10.75 14.75 14 12 17.75 9.25 14Z"/>` },
  menus: { group: 'gallery', label: 'Menus & Actions', term: ['≡', '='],
    body: `<rect x="3.5" y="3" width="17" height="5.5" rx="2"/><path${A} d="m14.5 5 1.5 1.25L17.5 5"/><rect${F} x="3.5" y="11" width="17" height="10" rx="2.25"/><path d="M7 14.5h10M7 17.75h6"/>` },
  spectrums: { group: 'gallery', label: 'Spectrums', term: ['▒', ':'],
    body: `<path${F} d="M5.75 3.5h1.5a2.25 2.25 0 0 1 2.25 2.25v14.75H5.75A2.25 2.25 0 0 1 3.5 18.25V5.75A2.25 2.25 0 0 1 5.75 3.5Z"/><path d="M9.5 7.6l3.9-3.9a2 2 0 0 1 2.83 0l2.07 2.07a2 2 0 0 1 0 2.83l-5.9 5.9"/><path d="M9.5 14.5h9a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-9"/>${dot(6.5, 17, 1.1, 'a')}` },
  idea: { group: 'gallery', label: 'Idea Gallery', term: ['✎', '/'],
    body: `<path${F} d="M9 17v-1.3c0-.9-.4-1.7-1.1-2.3a6 6 0 1 1 8.2 0c-.7.6-1.1 1.4-1.1 2.3V17Z"/><path d="M9.25 19.25h5.5M10.5 21.5h3"/><path${G} d="M12 6.25a2.9 2.9 0 0 1 2.9 2.9"/>` },
  mobile: { group: 'gallery', label: 'Mobile Gallery', term: ['▯', '[]'],
    body: `<rect${F} x="6.25" y="2.5" width="11.5" height="19" rx="2.75"/><path d="M10.5 18.25h3"/><path${G} d="M9.25 6.5l2-2"/>` },
  desktop: { group: 'gallery', label: 'Desktop Gallery', term: ['▭', '[_]'],
    body: `<rect x="2.5" y="3.75" width="19" height="13.25" rx="2.25"/><path d="M8.5 21h7M12 17v4"/><path${F} d="M10 7.25v6.75l1.85-1.85h3.15Z"/>` },

  // ===== App pages =========================================================
  facets: { group: 'page', label: 'New facets', term: ['✦', '*'],
    body: `<path${FS} d="M6.5 4.5h11L21 9H3Z"/><path d="M6.5 4.5h11L21 9l-9 11L3 9Z"/><path d="M3 9h18M8.75 9 12 20l3.25-11M10.25 4.5 8.75 9M13.75 4.5 15.25 9"/>` },
  search: { group: 'page', label: 'Search', term: ['⌕', '/'],
    body: `<circle${F} cx="10.75" cy="10.75" r="6.75"/><path d="m15.75 15.75 4.75 4.75"/><path${G} d="M7.5 10.5a3.25 3.25 0 0 1 3-3"/>` },
  variants: { group: 'page', label: 'Variant matrix', term: ['▞', '::'],
    body: `<path class="t" stroke="none" fill="currentColor" fill-opacity=".3" d="M12 3.5h5.5a3 3 0 0 1 3 3V12H12ZM3.5 12H12v8.5H6.5a3 3 0 0 1-3-3Z"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 3.5v17M3.5 12h17"/>` },
  showcase: { group: 'page', label: 'Live demo', term: ['▣', '[=]'],
    body: `<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 8.5h19M8 8.5V20"/><rect${F} x="10.75" y="11" width="7.75" height="4.5" rx="1"/><path d="M10.75 17.75h4.5"/>` },
  collections: { group: 'page', label: 'Collections', term: ['❏', '{}'],
    body: `<rect${F} x="3" y="9.5" width="18" height="11" rx="2.5"/><path d="M5.5 6.5h13M8 3.5h8"/>` },

  // ===== Surfaces ==========================================================
  web: { group: 'surface', label: 'Web', term: ['◫', 'www'],
    body: `<path${FS} d="M2.5 8.5h19v9a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5Z"/><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 8.5h19"/>${dot(5.4, 6.25, .8)}${dot(7.7, 6.25, .8)}${dot(10, 6.25, .8)}` },
  terminal: { group: 'surface', label: 'Terminal', term: ['❯_', '>_'],
    body: `<path${FS} d="M5 4h14a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-11A2.5 2.5 0 0 1 5 4Z"/><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path${A} d="m6.75 9 3 3-3 3"/><path d="M12.25 15.25h5"/>` },
  deck: { group: 'surface', label: 'Stream Deck', term: ['▦', '[#]'],
    body: `<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><rect${F} x="5" y="7.75" width="3" height="3" rx=".8"/><rect x="10.5" y="7.75" width="3" height="3" rx=".8"/><rect x="16" y="7.75" width="3" height="3" rx=".8"/><rect x="5" y="13.25" width="3" height="3" rx=".8"/><rect x="10.5" y="13.25" width="3" height="3" rx=".8"/><rect x="16" y="13.25" width="3" height="3" rx=".8"/>` },

  // ===== Actions ===========================================================
  copy: { group: 'action', term: ['❐', 'cp'],
    body: `<rect${F} x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>` },
  check: { group: 'action', term: ['✓', 'v'], body: `<path d="M4.5 12.75 9.5 17.5 19.5 6.5"/>` },
  close: { group: 'action', term: ['✕', 'x'], body: `<path d="M6 6l12 12M18 6 6 18"/>` },
  'chevron-left': { group: 'action', term: ['‹', '<'], body: `<path d="M14.5 5.5 8 12l6.5 6.5"/>` },
  'chevron-right': { group: 'action', term: ['›', '>'], body: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>` },
  'chevron-down': { group: 'action', term: ['⌄', 'v'], body: `<path d="M5.5 9.5 12 16l6.5-6.5"/>` },
  'chevron-up': { group: 'action', term: ['⌃', '^'], body: `<path d="M5.5 14.5 12 8l6.5 6.5"/>` },
  'arrow-left': { group: 'action', term: ['←', '<-'], body: `<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>` },
  'arrow-right': { group: 'action', term: ['→', '->'], body: `<path d="M4.5 12h15M13.5 6l6 6-6 6"/>` },
  'arrow-up': { group: 'action', term: ['↑', '^'], body: `<path d="M12 19.5v-15M6 10.5l6-6 6 6"/>` },
  'arrow-down': { group: 'action', term: ['↓', 'v'], body: `<path d="M12 4.5v15M6 13.5l6 6 6-6"/>` },
  play: { group: 'action', term: ['▶', '>'],
    body: `<path${F} d="M7.75 5.1v13.8a1.1 1.1 0 0 0 1.67.94l11.1-6.9a1.1 1.1 0 0 0 0-1.88L9.42 4.16a1.1 1.1 0 0 0-1.67.94Z"/>` },
  pause: { group: 'action', term: ['‖', '||'],
    body: `<rect${F} x="6" y="4.5" width="4" height="15" rx="1.25"/><rect${F} x="14" y="4.5" width="4" height="15" rx="1.25"/>` },
  replay: { group: 'action', term: ['↺', '<<'],
    body: `<path d="${arc(12, 12, 8.5, 268, 535)}"/><path d="${arcHead(12, 12, 8.5, 268, -1, 3.4)}"/><path${F} d="M10.5 9.4v5.2a.6.6 0 0 0 .9.52l4.2-2.6a.6.6 0 0 0 0-1.04l-4.2-2.6a.6.6 0 0 0-.9.52Z"/>` },
  refresh: { group: 'action', term: ['↻', '(R)'],
    body: `<path d="${arc(12, 12, 8, -160, -25)}"/><path d="${arcHead(12, 12, 8, -25, 1)}"/><path d="${arc(12, 12, 8, 20, 155)}"/><path d="${arcHead(12, 12, 8, 155, 1)}"/>` },
  sun: { group: 'action', term: ['☼', '*'],
    body: `<circle${F} cx="12" cy="12" r="3.75"/>${rays(12, 12, 6.6, 8.9, 8)}` },
  moon: { group: 'action', term: ['☾', ')'],
    body: `<path${F} d="${crescent(11.5, 12.5, 8.25, 5.2, -4.4, 6.4)}"/><path${G} d="${sparkle(18.5, 4.75, 2.25, .3)}"/>` },
  contrast: { group: 'action', term: ['◐', 'A'],
    body: `<circle cx="12" cy="12" r="8.5"/><path fill="currentColor" stroke="none" d="M12 3.5a8.5 8.5 0 0 1 0 17Z"/>` },
  github: { group: 'action', term: ['gh', 'gh'],
    body: `<path fill="currentColor" stroke="none" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.1c-3.12.68-3.78-1.33-3.78-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.73 2.62 1.23 3.26.94.1-.73.39-1.23.71-1.51-2.49-.28-5.1-1.24-5.1-5.54 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.15a10.74 10.74 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.31-2.62 5.26-5.12 5.54.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" transform="translate(1.6 1.6) scale(.867)"/>` },
  download: { group: 'action', term: ['↓', 'v'], body: `<path d="M12 3.5V15M7 10l5 5 5-5M4.5 20.5h15"/>` },
  upload: { group: 'action', term: ['↑', '^'], body: `<path d="M12 15V3.5M7 8.5l5-5 5 5M4.5 20.5h15"/>` },
  external: { group: 'action', term: ['↗', '^>'],
    body: `<path d="M13.5 3.5h7v7M20.5 3.5l-8.5 8.5"/><path d="M18 13.75v4.25a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V8.5A2.5 2.5 0 0 1 6 6h4.25"/>` },
  filter: { group: 'action', term: ['∇', 'Y'],
    body: `<path${F} d="M4 4.5h16a.75.75 0 0 1 .58 1.22L14.5 13.25v5.6a.75.75 0 0 1-.45.69l-3 1.3a.75.75 0 0 1-1.05-.69v-6.9L3.42 5.72A.75.75 0 0 1 4 4.5Z"/>` },
  grid: { group: 'action', term: ['⊞', '#'],
    body: `<rect${F} x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>` },
  list: { group: 'action', term: ['☰', '-'],
    body: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/>${dot(4.75, 6.5, 1.15, 'a')}${dot(4.75, 12, 1.15, 'a')}${dot(4.75, 17.5, 1.15, 'a')}` },
  star: { group: 'action', term: ['★', '*'], body: `<path${F} d="${star(12, 12.75, 9, 4.1)}"/>` },
  heart: { group: 'action', term: ['♥', '<3'], body: `<path${F} d="M12 20.25C8.5 17.6 3.25 13.9 3.25 9.1A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 8.75 1.8c0 4.8-5.25 8.5-8.75 11.15Z"/>` },
  plus: { group: 'action', term: ['+', '+'], body: `<path d="M12 5v14M5 12h14"/>` },
  minus: { group: 'action', term: ['−', '-'], body: `<path d="M5 12h14"/>` },
  settings: { group: 'action', term: ['⚙', '*'],
    body: `<path d="${gear(12, 12, 9, 6.6, 8)}"/><circle${F} cx="12" cy="12" r="2.75"/>` },
  info: { group: 'action', term: ['ⓘ', 'i'],
    body: `<circle${F} cx="12" cy="12" r="8.5"/><path d="M12 11v5.25"/>${dot(12, 7.9, 1.1)}` },
  warning: { group: 'action', term: ['⚠', '!'],
    body: `<path${F} d="M10.27 4.5a2 2 0 0 1 3.46 0l7.5 13a2 2 0 0 1-1.73 3H4.5a2 2 0 0 1-1.73-3Z"/><path d="M12 9.5v4.25"/>${dot(12, 16.9, 1.1)}` },
  error: { group: 'action', term: ['✗', 'X'],
    body: `<path${F} d="${polygon(12, 12, 9.1, 8, -112.5)}"/><path d="m9.25 9.25 5.5 5.5M14.75 9.25l-5.5 5.5"/>` },
  success: { group: 'action', term: ['✔', 'ok'],
    body: `<circle${F} cx="12" cy="12" r="8.5"/><path d="m8 12.25 2.75 2.75L16 9.5"/>` },
  keyboard: { group: 'action', term: ['⌨', 'kb'],
    body: `<rect${F} x="2.5" y="5.75" width="19" height="12.5" rx="2.5"/>${[6.5, 10.17, 13.83, 17.5].map(x => dot(x, 9.5, .95)).join('')}${[8.33, 12, 15.67].map(x => dot(x, 12.4, .95)).join('')}<path d="M8.25 15.25h7.5"/>` },
  command: { group: 'action', term: ['⌘', '^'],
    body: `<path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9Zm0 0h6m0 0V6.5A2.5 2.5 0 1 1 17.5 9Zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5Zm0 0H9m0 0v2.5A2.5 2.5 0 1 1 6.5 15Zm0 0V9"/>` },
  menu: { group: 'action', term: ['≡', '='], body: `<path d="M4 7h16M4 12h16M4 17h16"/>` },
  sidebar: { group: 'action', term: ['◧', '|='],
    body: `<path${FS} d="M9.5 4H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h4Z"/><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/><path${G} d="M5.6 8h1.4M5.6 11h1.4"/>` },
  code: { group: 'action', term: ['‹›', '</>'],
    body: `<path d="M8 7.25 3.25 12 8 16.75M16 7.25 20.75 12 16 16.75"/><path${A} d="M13.6 4.75 10.4 19.25"/>` },
  eye: { group: 'action', term: ['⊙', '(o)'],
    body: `<path${F} d="M2.75 12C4.6 8.15 8 5.75 12 5.75s7.4 2.4 9.25 6.25C19.4 15.85 16 18.25 12 18.25S4.6 15.85 2.75 12Z"/><circle cx="12" cy="12" r="3"/>${dot(12, 12, 1, 'a')}` },
  link: { group: 'action', term: ['∞', '&'],
    body: `<path d="M10.25 13.75a3.75 3.75 0 0 0 5.3 0l3.2-3.2a3.75 3.75 0 0 0-5.3-5.3l-1.1 1.1"/><path d="M13.75 10.25a3.75 3.75 0 0 0-5.3 0l-3.2 3.2a3.75 3.75 0 0 0 5.3 5.3l1.1-1.1"/>` },
  sparkle: { group: 'action', term: ['✧', '*'],
    body: `<path${F} d="${sparkle(10.25, 13, 7.75)}"/><path${A} d="${sparkle(18.25, 5.5, 2.75, .35)}"/>` },
  expand: { group: 'action', term: ['⤢', '<>'],
    body: `<path d="M14.25 3.5h6.25v6.25M9.75 20.5H3.5v-6.25M20.5 3.5 14 10M3.5 20.5 10 14"/>` },
  collapse: { group: 'action', term: ['⤡', '><'],
    body: `<path d="M20.5 3.5 14 10M14 4.75V10h5.25M3.5 20.5 10 14M10 19.25V14H4.75"/>` },
  drag: { group: 'action', term: ['⋮', ':'],
    body: [9, 15].map(x => [6, 12, 18].map(y => dot(x, y, 1.3)).join('')).join('') },
  layers: { group: 'action', term: ['⧉', '='],
    body: `<path${F} d="M12 3.5 21 8l-9 4.5L3 8Z"/><path d="M3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>` },
  palette: { group: 'action', term: ['❖', '%'],
    body: `<path${F} d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2.1-.8 2.1-1.9 0-1.3-1.1-1.7-1.1-2.9 0-1 .8-1.7 1.8-1.7h1.9a3.8 3.8 0 0 0 3.8-3.8c0-3.9-3.8-6.7-8.5-6.7Z"/>${dot(7.4, 12.4, 1.25, 'a')}${dot(8.6, 8.2, 1.25, 'a')}${dot(12.6, 6.7, 1.25, 'a')}${dot(16.3, 8.6, 1.25, 'a')}` },
  enter: { group: 'action', term: ['↵', '<'], body: `<path d="M19.5 5v6.5a3 3 0 0 1-3 3H4.75M9 10.25l-4.25 4.25L9 18.75"/>` },
  trash: { group: 'action', term: ['⌫', 'rm'],
    body: `<path d="M4 6.5h16M9.5 6.5V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path${F} d="M6 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 6.5"/><path d="M10 10.5v6M14 10.5v6"/>` },
  prism: { group: 'action', label: 'Prism', term: ['△', '/\\'],
    body: `<path${FS} d="M12 3.5 14.8 19.5H21Z"/><path d="M12 3.5 21 19.5H3Z"/><path d="M12 3.5 14.8 19.5"/>` },

  // ===== Terminal-only galleries (prism-term) ==============================
  sim: { group: 'terminal', label: 'Particles & Simulations', term: ['∴', '.:'],
    body: `<circle${F} cx="14.75" cy="14.75" r="3.25"/><circle cx="7" cy="7.5" r="2.25"/><circle cx="17" cy="5.75" r="1.25"/><circle cx="6.25" cy="17.25" r="1.25"/>${dot(11.5, 10, .95)}${dot(20, 11, .95)}${dot(11, 20.5, .95)}` },
  retro: { group: 'terminal', label: 'Retro & Demoscene', term: ['▚', '%'],
    body: `<rect${F} x="5.25" y="10" width="10" height="8" rx="2"/><rect x="2.75" y="7.5" width="18.5" height="13" rx="3"/><path d="m8.5 3.5 3.5 4 3.5-4"/>${dot(18.25, 11.25, 1)}${dot(18.25, 14.75, 1)}<path${G} d="M7.25 12.5h4"/>` },
  loaders: { group: 'terminal', label: 'Spinners & Loaders', term: ['⠿', '|'],
    body: spokes(12, 12, 4.4, 8.6, 8) },
  progress: { group: 'terminal', label: 'Progress & Counters', term: ['▰', '[=-]'],
    body: `<rect x="2.5" y="8.25" width="19" height="7.5" rx="3.75"/><path${A} stroke-width="2.5" d="M6.25 12h7"/>` },
  ops: { group: 'terminal', label: 'Linux & Ops', term: ['$_', '$_'],
    body: `<rect${F} x="3.5" y="3.75" width="17" height="7" rx="2"/><rect x="3.5" y="13.25" width="17" height="7" rx="2"/>${dot(7.25, 7.25, 1, 'a')}${dot(7.25, 16.75, 1, 'a')}<path d="M11 7.25h5.75M11 16.75h5.75"/>` },
  ascii: { group: 'terminal', label: 'Pure ASCII', term: ['#', '#'],
    body: `<path d="M10.25 3.75 8.25 20.25M15.75 3.75l-2 16.5M4.5 9h15.5M4 15h15.5"/>` },
};

// Aliases resolve to another icon's body (emitted as their own symbols too).
export const ALIASES = {
  auto: 'contrast', new: 'sparkle', 'sidebar-toggle': 'sidebar',
  status: 'notify', diagrams: 'arch', x: 'close', bell: 'notify',
};

// Terminal gallery ids → icon ids (prism-term/src/facets/galleries.js)
export const TERMINAL_GALLERIES = {
  fx: 'fx', objects: 'objects', sim: 'sim', retro: 'retro', text: 'text', loaders: 'loaders',
  progress: 'progress', charts: 'charts', ai: 'ai', status: 'notify', ops: 'ops',
  diagrams: 'arch', callouts: 'callouts', input: 'menus', maps: 'maps', lab: 'lab', ascii: 'ascii',
};
