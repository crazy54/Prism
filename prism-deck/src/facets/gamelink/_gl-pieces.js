// Game Link pictograms (not a facet): generic instrument symbols on the 48-unit glyph grid (safe area 6–42), drawn
// with glyph roles so every theme paints them like its own icons (k.pictogram). No game logos, no weapon models:
// a medical cross, a shield, bullets, a coin, a crosshair, a generic round bomb …
//
//   PICT[name](pen, o)   name: health armor ammo money kills score round bomb kda nades weapon knife gear kit mvp map
//                        eye link flag prism flash smoke he fire scene blank

const ACC = { role: 'accent', fill: true };
const LINE = { role: 'line' };

function shield(p, { helmet = false } = {}) {
  p.path('M24 7 L38.5 12.5 L38.5 23 C38.5 31.5 32.5 38 24 41.5 C15.5 38 9.5 31.5 9.5 23 L9.5 12.5 Z', { role: 'accent', weight: 1.1 });
  if (helmet) p.path('M16 25 C16 19.5 19.5 16 24 16 C28.5 16 32 19.5 32 25 L32 27 L16 27 Z', ACC);
  else p.line(24, 15, 24, 34, { role: 'dim', weight: 0.9 });
}

function bullet(p, x, y, w, h) {
  const r = w / 2;
  p.path(`M${x} ${y + h} L${x} ${y + r * 1.6} C${x} ${y + r * 0.4} ${x + r} ${y - r * 0.2} ${x + r} ${y - r * 0.2} C${x + r} ${y - r * 0.2} ${x + w} ${y + r * 0.4} ${x + w} ${y + r * 1.6} L${x + w} ${y + h} Z`, ACC);
  p.line(x - 0.6, y + h + 2.2, x + w + 0.6, y + h + 2.2, { role: 'dim', weight: 0.9 });
}

function crosshair(p, { dot = true } = {}) {
  p.circle(24, 24, 12.5, { role: 'accent', weight: 1.05 });
  p.line(24, 6.5, 24, 15, LINE); p.line(24, 33, 24, 41.5, LINE); p.line(6.5, 24, 15, 24, LINE); p.line(33, 24, 41.5, 24, LINE);
  if (dot) p.dot(24, 24, 2.6);
}

function star(p, cx = 24, cy = 25, R = 17, r = 7.4) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = ((i * 36 - 90) * Math.PI) / 180, rr = i % 2 ? r : R; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  p.polygon(pts, ACC);
}

export const PICT = {
  health: (p) => p.polygon([[19, 8], [29, 8], [29, 19], [40, 19], [40, 29], [29, 29], [29, 40], [19, 40], [19, 29], [8, 29], [8, 19], [19, 19]], ACC),
  armor: (p, o = {}) => shield(p, o),
  ammo: (p) => { bullet(p, 10, 12, 7, 23); bullet(p, 20.5, 12, 7, 23); bullet(p, 31, 12, 7, 23); },
  weapon: (p) => { bullet(p, 19, 9, 10, 28); },
  money: (p) => { p.circle(24, 24, 16, { role: 'accent', weight: 1.1 }); p.text('$', { x: 24, y: 31.5, size: 21, weight: 700, role: 'fill' }); },
  kills: (p) => crosshair(p),
  kda: (p) => { p.line(13, 11, 13, 37, { role: 'accent', weight: 1.2 }); p.line(21, 11, 21, 37, { role: 'accent', weight: 1.2 }); p.line(29, 11, 29, 37, { role: 'accent', weight: 1.2 }); p.line(36, 11, 36, 37, { role: 'dim', weight: 1.2 }); p.line(9, 30, 40, 18, LINE); },
  score: (p) => { p.rect(9, 14, 11, 24, { r: 2.5, role: 'accent', fill: true }); p.rect(28, 20, 11, 18, { r: 2.5, role: 'dim', fill: true }); p.dot(24, 10, 2.2); },
  round: (p) => { p.circle(24, 24, 15, { role: 'accent', weight: 1.1 }); p.circle(24, 24, 7, { role: 'dim', weight: 0.9 }); p.dot(24, 24, 2.6); },
  flag: (p) => { p.line(13, 7, 13, 42, { role: 'line', weight: 1.1 }); p.polygon([[13, 8], [38, 13], [13, 25]], ACC); },
  bomb: (p) => {
    p.circle(22, 28, 12.5, ACC);
    p.path('M29.5 18.5 C31 14.5 33.5 12.5 37 12', { role: 'line', weight: 1 });
    p.line(37.5, 6.5, 37.5, 9, { role: 'spark', weight: 0.8 }); p.line(41.5, 11.5, 39.5, 11.5, { role: 'spark', weight: 0.8 }); p.line(40.8, 7.5, 39.2, 9.1, { role: 'spark', weight: 0.8 });
    p.path('M16 24 C17 21.5 19 20 21.5 19.5', { role: 'spark', weight: 0.7, opacity: 0.8 });
  },
  nades: (p) => {
    p.circle(24, 28, 12, ACC);
    p.rect(20, 11, 8, 6, { r: 1.5, role: 'line', fill: true });
    p.path('M28 14 L36 18 L36 24', { role: 'line', weight: 0.9 });
    p.circle(17, 12, 3.5, { role: 'dim', weight: 0.8 });
  },
  flash: (p) => { p.circle(24, 24, 7.5, ACC); for (let i = 0; i < 8; i++) { const a = (i * 45 * Math.PI) / 180; p.line(24 + 11 * Math.cos(a), 24 + 11 * Math.sin(a), 24 + 17 * Math.cos(a), 24 + 17 * Math.sin(a), { role: 'accent', weight: 0.9 }); } },
  smoke: (p) => p.path('M13 34 C7.5 34 7 26.5 12 25 C11 18.5 19 15 22.5 19.5 C25 13 35 14 34.5 21.5 C40.5 21.5 41.5 34 34.5 34 Z', ACC),
  he: (p) => { p.circle(24, 27, 13, ACC); p.rect(20.5, 9.5, 7, 6, { r: 1.5, role: 'line', fill: true }); p.line(27, 12.5, 34, 16, { role: 'line', weight: 0.9 }); },
  fire: (p) => p.path('M24 7 C27 15 35 18.5 35 28.5 A11 11 0 0 1 13 28.5 C13 22 17 19 18.5 14.5 C20.5 18 21.5 20.5 23.5 21.5 C25 17 24 11 24 7 Z', ACC),
  knife: (p) => { p.path('M9 34 L33 10 C37 9 39.5 11.5 38 15 L15 38 Z', ACC); p.line(13, 30, 18, 35, { role: 'line', weight: 1.1 }); p.line(8, 40, 13, 35, { role: 'line', weight: 1.4 }); },
  gear: (p) => { p.rect(9, 16, 30, 22, { r: 4, role: 'accent', weight: 1.1 }); p.path('M18 16 L18 11.5 L30 11.5 L30 16', { role: 'line', weight: 1 }); p.line(9, 25, 39, 25, { role: 'dim', weight: 0.9 }); p.rect(21, 22.5, 6, 5, { r: 1, role: 'accent', fill: true }); },
  kit: (p) => { p.path('M14 9 L22 25', { role: 'accent', weight: 1.3 }); p.path('M34 9 L26 25', { role: 'accent', weight: 1.3 }); p.circle(24, 27, 3, { role: 'line', fill: true }); p.path('M22 29 L15 40', { role: 'line', weight: 1.6 }); p.path('M26 29 L33 40', { role: 'line', weight: 1.6 }); },
  mvp: (p) => star(p),
  map: (p) => { p.path('M24 41 C17 31 12 25.5 12 19 A12 12 0 0 1 36 19 C36 25.5 31 31 24 41 Z', { role: 'accent', weight: 1.1 }); p.circle(24, 19, 4.6, ACC); },
  eye: (p) => { p.path('M6 24 C13 13 35 13 42 24 C35 35 13 35 6 24 Z', { role: 'line', weight: 1 }); p.circle(24, 24, 6, ACC); },
  link: (p) => {
    p.path('M21 27 L27 21', { role: 'accent', weight: 1.1 });
    p.path('M19.5 18.5 L23 15 A7 7 0 0 1 33 25 L29.5 28.5', { role: 'line', weight: 1 });
    p.path('M28.5 29.5 L25 33 A7 7 0 0 1 15 23 L18.5 19.5', { role: 'line', weight: 1 });
  },
  prism: (p) => { p.polygon([[24, 8], [41, 38], [7, 38]], { role: 'accent', weight: 1.1 }); p.line(24, 15, 15.5, 31, { role: 'spark', weight: 0.6, opacity: 0.8 }); },
  scene: () => {},
  blank: () => {},
};

/** The Utility key's four kinds (molotov and incendiary count as one fire). */
export const NADE_KINDS = Object.freeze([['flash', 'flashbang'], ['smoke', 'smoke'], ['he', 'he'], ['fire', 'molotov', 'incendiary']]);
