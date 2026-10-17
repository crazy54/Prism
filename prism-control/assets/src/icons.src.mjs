// Prism Control icon family: the single source of truth for every action-list icon, default key image and dial icon.
//
//   24 px grid · 1.5 px stroke · round caps + joins · live area ~3–21. Prism's "Refraction" hairline grammar
//   (Prism-ds design/icons): quiet instruments at rest; on a key the glass facets fill with the domain hue.
//   Edit here, then run:  node assets/src/build-icons.mjs        (writes the SVG assets and Core/Art/Icons.g.cs)
//
// A glyph is a list of parts. Kinds:
//   s  stroke in ink                 a  stroke in the accent (the domain hue on keys, white in the action list)
//   f  facet fill (hue wash on keys, nothing in the action list; draw it under the strokes)
//   d  solid fill in ink             ad solid fill in the accent
// An optional third value is the part's opacity.
// No trademarks: the music glyphs are generic notes (never the Spotify logo).

const r = (n) => +n.toFixed(2);
const pt = (cx, cy, rad, deg) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
const P = ([x, y]) => `${r(x)} ${r(y)}`;

/** Arc from a0 to a1 (degrees, screen space: 0 = right, 90 = down; clockwise when a1 > a0). */
export function arc(cx, cy, rad, a0, a1, move = true) {
  const s = pt(cx, cy, rad, a0), e = pt(cx, cy, rad, a1);
  const sweep = a1 > a0 ? 1 : 0, large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `${move ? `M${P(s)}` : ''}A${r(rad)} ${r(rad)} 0 ${large} ${sweep} ${P(e)}`;
}
export const circle = (cx, cy, rr) => `M${r(cx - rr)} ${r(cy)}a${r(rr)} ${r(rr)} 0 1 0 ${r(2 * rr)} 0a${r(rr)} ${r(rr)} 0 1 0 ${r(-2 * rr)} 0Z`;
export function rrect(x, y, w, h, rr) {
  return `M${r(x + rr)} ${r(y)}H${r(x + w - rr)}A${rr} ${rr} 0 0 1 ${r(x + w)} ${r(y + rr)}V${r(y + h - rr)}A${rr} ${rr} 0 0 1 ${r(x + w - rr)} ${r(y + h)}` +
    `H${r(x + rr)}A${rr} ${rr} 0 0 1 ${r(x)} ${r(y + h - rr)}V${r(y + rr)}A${rr} ${rr} 0 0 1 ${r(x + rr)} ${r(y)}Z`;
}
/** Arrowhead (two strokes) at the end of an arc that travels from a0 towards a1. */
function arcHead(cx, cy, rad, a1, dir, len = 3, spread = 40) {
  const [x, y] = pt(cx, cy, rad, a1);
  const travel = ((a1 + (dir > 0 ? 90 : -90)) * Math.PI) / 180, back = travel + Math.PI;
  const h1 = [x + len * Math.cos(back + (spread * Math.PI) / 180), y + len * Math.sin(back + (spread * Math.PI) / 180)];
  const h2 = [x + len * Math.cos(back - (spread * Math.PI) / 180), y + len * Math.sin(back - (spread * Math.PI) / 180)];
  return `M${P(h1)}L${P([x, y])}L${P(h2)}`;
}
/**
 * Fan rotor: n swept blades around a solid hub. Each blade has straight-ish edges, a tip on the outer circle and a
 * root that follows the hub, so the blades never touch each other (clean at 20 px) and lean clockwise.
 */
function rotor(cx, cy, R, n = 4, rot = -90, r0 = 2.6) {
  let d = '';
  for (let k = 0; k < n; k++) {
    const a = rot + (k * 360) / n;
    const A = pt(cx, cy, r0, a - 16), B = pt(cx, cy, R, a + 6), C = pt(cx, cy, R, a + 40), D = pt(cx, cy, r0, a + 22);
    d += `M${P(A)}Q${P(pt(cx, cy, R * 0.66, a - 12))} ${P(B)}A${r(R)} ${r(R)} 0 0 1 ${P(C)}Q${P(pt(cx, cy, R * 0.58, a + 40))} ${P(D)}A${r(r0)} ${r(r0)} 0 0 0 ${P(A)}Z`;
  }
  return d;
}
/** Small fan rotor as single strokes (for fans drawn inside a shroud ring). */
function swirl(cx, cy, R, n = 3, rot = -90) {
  let d = '';
  for (let k = 0; k < n; k++) {
    const a = rot + (k * 360) / n, S = pt(cx, cy, 0.9, a), E = pt(cx, cy, R, a + 85);
    const chord = Math.hypot(E[0] - S[0], E[1] - S[1]);
    d += `M${P(S)}A${r(chord * 0.72)} ${r(chord * 0.72)} 0 0 1 ${P(E)}`;
  }
  return d;
}
/** Pump impeller: n curved vanes from the hub to the rim. */
function vanes(cx, cy, r0, r1, n = 6, rot = -90, sweepDeg = 46) {
  let d = '';
  for (let k = 0; k < n; k++) {
    const a = rot + (k * 360) / n, s = pt(cx, cy, r0, a), e = pt(cx, cy, r1, a + sweepDeg);
    const chord = Math.hypot(e[0] - s[0], e[1] - s[1]);
    d += `M${P(s)}A${r(chord * 0.9)} ${r(chord * 0.9)} 0 0 1 ${P(e)}`;
  }
  return d;
}
// ---------------------------------------------------------------------------- shared shapes

const speakerBody = (dx = 0) =>
  `M${r(4.75 + dx)} 9H${r(7.25 + dx)}L${r(11.5 + dx)} 5.25V18.75L${r(7.25 + dx)} 15H${r(4.75 + dx)}A1.25 1.25 0 0 1 ${r(3.5 + dx)} 13.75V10.25A1.25 1.25 0 0 1 ${r(4.75 + dx)} 9Z`;
const speakerWaves = (dx = 0) => arc(11.5 + dx, 12, 4.25, -45, 45) + arc(11.5 + dx, 12, 8, -48, 48);

function mic(cx, top = 3.5, h = 9.5, w = 5, cradleR = 5.5, cradleY = 10.75, base = 19.5) {
  return {
    capsule: rrect(cx - w / 2, top, w, h, w / 2),
    stand: `M${r(cx + cradleR)} ${cradleY}A${cradleR} ${cradleR} 0 0 1 ${r(cx - cradleR)} ${cradleY}M${r(cx)} ${r(cradleY + cradleR)}V${base}M${r(cx - 3)} ${base}H${r(cx + 3)}`,
  };
}
const swapArrows = (x0 = 14.5, x1 = 20.5) =>
  `M${x0} 8H${x1}M${r(x1 - 2.25)} 5.75L${x1} 8L${r(x1 - 2.25)} 10.25M${x1} 16H${x0}M${r(x0 + 2.25)} 13.75L${x0} 16L${r(x0 + 2.25)} 18.25`;

/** A vertical fader track broken around its knob (outlined knobs stay hairline-clean). */
function fader(x, top, bottom, knobY, kr = 2, gap = 1.25) {
  const a = knobY - kr - gap, b = knobY + kr + gap;
  return (a > top + 0.5 ? `M${x} ${top}V${r(a)}` : '') + (b < bottom - 0.5 ? `M${x} ${r(b)}V${bottom}` : '');
}
function hfader(y, left, right, knobX, kr = 2, gap = 1.25) {
  const a = knobX - kr - gap, b = knobX + kr + gap;
  return (a > left + 0.5 ? `M${left} ${y}H${r(a)}` : '') + (b < right - 0.5 ? `M${r(b)} ${y}H${right}` : '');
}
const noteFlag = (x, top, len = 3.6) => `M${x} ${top}C${r(x + 1.1)} ${r(top + 0.5)} ${r(x + 2.4)} ${r(top + 1.3)} ${r(x + 2.4)} ${r(top + len)}`;

// The Prism Control mark: Prism's prism (apex, front edge to 21/32 of the base) inside a control dial.
// The ring is a knob scale (gap at the bottom); the lit arc and its indicator dot are the "control".
const MARK = (() => {
  const cx = 12, cy = 12.75, R = 9;
  const ax = 12, ay = 7, by = 16.25, half = 5, foot = ax - half + 2 * half * (21 / 32);
  return {
    track: arc(cx, cy, R, 315, 405), lit: arc(cx, cy, R, 135, 315), knob: pt(cx, cy, R, 315),
    tri: `M${ax} ${ay}L${r(ax + half)} ${by}H${r(ax - half)}Z`, face: `M${ax} ${ay}L${r(ax + half)} ${by}H${r(foot)}Z`, edge: `M${ax} ${ay}L${r(foot)} ${by}`,
  };
})();

// ---------------------------------------------------------------------------- the family

export const ICONS = {
  // Prism Control's own mark (default action art, category icon).
  'prism-control': [
    ['f', MARK.face], ['s', MARK.tri], ['s', MARK.edge, 0.6], ['s', MARK.track, 0.45], ['a', MARK.lit], ['ad', circle(...MARK.knob, 1.7)],
  ],

  // ---- audio
  'audio.volume': [['f', speakerBody(0.5)], ['s', speakerBody(0.5)], ['a', speakerWaves(0.5)]],
  'audio.app-volume': [
    ['s', rrect(3, 4, 18, 16, 2.5)], ['s', 'M3 8.25H21'],
    ['s', 'M6.5 12.25H17.5M6.5 16.25H17.5', 0.55], ['ad', circle(13.5, 12.25, 1.75)], ['ad', circle(9.5, 16.25, 1.75)],
  ],
  'audio.mixer': [
    ['s', fader(6, 4, 20, 15) + fader(12, 4, 20, 9.5) + fader(18, 4, 20, 12.5)],
    ['f', circle(6, 15, 2) + circle(12, 9.5, 2) + circle(18, 12.5, 2)], ['a', circle(6, 15, 2) + circle(12, 9.5, 2) + circle(18, 12.5, 2)],
  ],
  'audio.output-device': [['f', speakerBody(-0.5)], ['s', speakerBody(-0.5)], ['a', swapArrows(14.5, 20.75)]],
  'audio.input-device': (() => {
    const m = mic(7.75, 3.5, 9, 5, 4.75, 10.5, 19.5);
    return [['f', m.capsule], ['s', m.capsule], ['s', m.stand], ['a', swapArrows(15, 21)]];
  })(),
  'audio.mic-mute': (() => {
    const m = mic(12);
    return [['f', m.capsule], ['s', m.capsule], ['s', m.stand]];
  })(),
  'audio.mic-off': (() => {
    const m = mic(12);
    return [['s', m.capsule, 0.55], ['s', m.stand, 0.55], ['a', 'M4.5 4L19.5 20']];
  })(),
  'audio.level-meter': [['s', rrect(4.5, 4, 6, 16, 1.75) + rrect(13.5, 4, 6, 16, 1.75)], ['ad', rrect(6, 11, 3, 7.5, 0.75) + rrect(15, 7.5, 3, 11, 0.75)]],

  // ---- cooling
  'cooling.fan': [['s', rrect(3, 3, 18, 18, 4)], ['f', rotor(12, 12, 7)], ['a', rotor(12, 12, 7)], ['d', circle(12, 12, 1.5)]],
  'cooling.pump': [['s', circle(12, 12, 9)], ['a', vanes(12, 12, 3.4, 7)], ['f', circle(12, 12, 2.4)], ['s', circle(12, 12, 2.4)]],
  'cooling.fan-group': [
    ['s', rrect(2.5, 6, 19, 12, 2.5)], ['f', circle(7.5, 12, 3.6) + circle(16.5, 12, 3.6)], ['s', circle(7.5, 12, 3.6) + circle(16.5, 12, 3.6)],
    ['a', swirl(7.5, 12, 2.5) + swirl(16.5, 12, 2.5)],
  ],
  'cooling.dial': [
    ['f', circle(7.75, 12, 5)], ['s', circle(7.75, 12, 5)], ['s', swirl(7.75, 12, 3.5)],
    ['s', 'M14.75 18.5H21', 0.5], ['a', 'M14.75 15L16.75 10L18.75 12.5L21 5.5'],
  ],

  // ---- eq
  'eq.band': [['s', 'M3 19.75H21', 0.45], ['s', 'M3 16C7 16 8.5 7 12 7S17 16 21 16'], ['ad', circle(12, 7, 2.1)]],
  'eq.band-browser': [
    ['a', 'M5.75 8.25L2.5 12L5.75 15.75M18.25 8.25L21.5 12L18.25 15.75'],
    ['s', 'M7.25 15C9.25 15 10.25 9.5 12 9.5S14.75 15 16.75 15'], ['ad', circle(12, 9.5, 1.75)],
  ],
  'eq.preset': [
    ['s', hfader(6.5, 3.5, 20.5, 15) + hfader(12, 3.5, 20.5, 8.5) + hfader(17.5, 3.5, 20.5, 13)],
    ['f', circle(15, 6.5, 2) + circle(8.5, 12, 2) + circle(13, 17.5, 2)], ['a', circle(15, 6.5, 2) + circle(8.5, 12, 2) + circle(13, 17.5, 2)],
  ],
  'eq.toggle': [['s', arc(12, 13, 8, -58, 238)], ['s', 'M12 3.5V9.5'], ['a', 'M7 16.25C9.25 16.25 10.1 11.75 12 11.75S14.75 16.25 17 16.25']],
  'eq.sonar-volume': [
    ['f', speakerBody(-0.25)], ['s', speakerBody(-0.25)], ['s', arc(11.25, 12, 4.25, -45, 45)],
    ['a', arc(11.25, 12, 8, -50, -14) + arc(11.25, 12, 8, 14, 50)], ['ad', circle(19.25, 12, 1.5)],
  ],

  // ---- macros
  'macros.macro': [['s', 'M3.5 6H13M3.5 11H13M3.5 16H8.75'], ['f', 'M14.25 12.25V20.25L20.75 16.25Z'], ['a', 'M14.25 12.25V20.25L20.75 16.25Z']],
  'macros.hotkey': [['s', rrect(3, 3.5, 18, 17, 3.25)], ['f', rrect(5.75, 5.75, 12.5, 9.75, 2)], ['a', rrect(5.75, 5.75, 12.5, 9.75, 2)], ['s', 'M9.9 13.1L12 8.4L14.1 13.1M10.6 11.6H13.4']],
  'macros.type-text': [['s', 'M4 5.5H14M9 5.5V18.5'], ['a', 'M18 4.5V19.5M16.25 4.5H19.75M16.25 19.5H19.75']],
  'macros.launch': [
    ['s', 'M18 13.75V18A2.5 2.5 0 0 1 15.5 20.5H6A2.5 2.5 0 0 1 3.5 18V8.5A2.5 2.5 0 0 1 6 6H10.25'],
    ['a', 'M13.5 3.5H20.5V10.5M20.5 3.5L12 12'],
  ],
  'macros.media': [['s', rrect(3, 4, 18, 16, 3.25)], ['f', 'M7.25 9V15L11.75 12Z'], ['a', 'M7.25 9V15L11.75 12ZM14.75 9.25V14.75M17.5 9.25V14.75']],
  'macros.dial': [
    ['f', circle(12, 12, 4.75)], ['s', circle(12, 12, 4.75)], ['d', circle(12, 9.4, 1.1)],
    ['a', arc(12, 12, 8.75, -62, 22) + arcHead(12, 12, 8.75, 22, 1) + arc(12, 12, 8.75, 118, 202) + arcHead(12, 12, 8.75, 202, 1)],
  ],

  // ---- spotify (generic music glyphs: never the Spotify logo)
  'spotify.now-playing': [
    ['s', rrect(3.5, 3.5, 17, 17, 3)], ['s', 'M11.1 15.75V8.5L17.1 7V14.25'],
    ['f', circle(9.25, 15.75, 1.85) + circle(15.25, 14.25, 1.85)], ['a', circle(9.25, 15.75, 1.85) + circle(15.25, 14.25, 1.85)],
  ],
  'spotify.play-pause': [['f', 'M4 5.75V18.25L13 12Z'], ['a', 'M4 5.75V18.25L13 12Z'], ['s', 'M16.5 6V18M20.5 6V18']],
  'spotify.next': [['f', 'M5 5.75V18.25L14.5 12Z'], ['a', 'M5 5.75V18.25L14.5 12Z'], ['s', 'M18.75 5.5V18.5']],
  'spotify.previous': [['f', 'M19 5.75V18.25L9.5 12Z'], ['a', 'M19 5.75V18.25L9.5 12Z'], ['s', 'M5.25 5.5V18.5']],
  'spotify.like': [
    ['f', 'M12 20.25C8.5 17.6 3.25 13.9 3.25 9.1A4.6 4.6 0 0 1 12 7.3A4.6 4.6 0 0 1 20.75 9.1C20.75 13.9 15.5 17.6 12 20.25Z'],
    ['a', 'M12 20.25C8.5 17.6 3.25 13.9 3.25 9.1A4.6 4.6 0 0 1 12 7.3A4.6 4.6 0 0 1 20.75 9.1C20.75 13.9 15.5 17.6 12 20.25Z'],
  ],
  'spotify.shuffle': [
    ['s', 'M3.5 7H6.25C8.75 7 9.9 8.6 12 12S15.25 17 17.75 17H20.5M3.5 17H6.25C8.75 17 9.9 15.4 12 12S15.25 7 17.75 7H20.5'],
    ['a', 'M18 4.5L20.5 7L18 9.5M18 14.5L20.5 17L18 19.5'],
  ],
  'spotify.repeat': [
    ['s', 'M20 6.75H8A4 4 0 0 0 4 10.75V11.5M4 17.25H16A4 4 0 0 0 20 13.25V12.5'],
    ['a', 'M17.25 4L20 6.75L17.25 9.5M6.75 20L4 17.25L6.75 14.5'],
  ],
  'spotify.volume': [
    ['f', speakerBody(-1)], ['s', speakerBody(-1)],
    ['s', `M18.25 16.25V6.25${noteFlag(18.25, 6.25)}`], ['f', circle(16.35, 16.25, 1.9)], ['a', circle(16.35, 16.25, 1.9)],
  ],
  'spotify.browser': [
    ['s', 'M3.5 6.5H16M3.5 11.5H13.5M3.5 16.5H9.5'],
    ['s', `M18 17.5V9.5${noteFlag(18, 9.5, 3.4)}`], ['f', circle(16.1, 17.5, 1.9)], ['a', circle(16.1, 17.5, 1.9)],
  ],

  // ---- system
  'system.cpu': [
    ['s', rrect(6, 6, 12, 12, 2.25)], ['f', rrect(9.25, 9.25, 5.5, 5.5, 1)], ['a', rrect(9.25, 9.25, 5.5, 5.5, 1)],
    ['s', 'M9 3.5V6M12 3.5V6M15 3.5V6M9 18V20.5M12 18V20.5M15 18V20.5M3.5 9H6M3.5 12H6M3.5 15H6M18 9H20.5M18 12H20.5M18 15H20.5'],
  ],
  'system.gpu': [
    ['s', rrect(2.5, 5, 19, 11.5, 2)], ['f', circle(8.75, 10.75, 3.25)], ['a', circle(8.75, 10.75, 3.25)], ['d', circle(8.75, 10.75, 0.9)],
    ['s', 'M14.75 8.75V12.75M17.75 8.75V12.75M6 16.5V19H13V16.5'],
  ],
  'system.ram': [
    ['s', rrect(2.5, 6.5, 19, 9, 1.5)], ['ad', rrect(5.25, 9, 3, 4, 0.6) + rrect(10.5, 9, 3, 4, 0.6) + rrect(15.75, 9, 3, 4, 0.6)],
    ['s', 'M5.5 15.5V18.25M8.5 15.5V18.25M15.5 15.5V18.25M18.5 15.5V18.25'],
  ],
  'system.disk': [['f', rrect(3, 5, 18, 14, 2.5)], ['s', rrect(3, 5, 18, 14, 2.5)], ['s', 'M3 13.5H21M6.5 16.25H11'], ['ad', circle(17, 16.25, 1.15)]],
  'system.network': [['s', 'M8.5 19.5V4.75M4.75 8.5L8.5 4.75L12.25 8.5'], ['a', 'M15.5 4.5V19.25M11.75 15.5L15.5 19.25L19.25 15.5']],
  'system.dial': [
    ['s', arc(12, 14, 8.5, 150, 390)], ['s', `M${P(pt(12, 14, 8.5, 210))}L${P(pt(12, 14, 6.5, 210))}M12 5.5V7.5M${P(pt(12, 14, 8.5, 330))}L${P(pt(12, 14, 6.5, 330))}`, 0.55],
    ['a', `M12 14L${P(pt(12, 14, 6, 315))}`], ['ad', circle(12, 14, 1.6)],
  ],

  // ---- core
  'core.diagnostics': [['s', rrect(3, 4, 18, 16, 3)], ['a', 'M5.75 12.5H8.5L10.25 8.5L13.75 16.5L15.5 12.5H18.25']],
};

// Every shipped action: which glyph it wears. Encoder actions also get a dial icon (EncoderIcon).
// Paths: imgs/actions/<domain>/<id>/{icon,key,dial} (domains ship them in src/PrismControl.<Domain>/plugin/imgs).
export const ACTIONS = [
  ['audio.volume', true], ['audio.app-volume', true], ['audio.mixer', true], ['audio.output-device', true], ['audio.input-device', true],
  ['audio.mic-mute', true], ['audio.level-meter', true],
  ['cooling.fan', false], ['cooling.pump', false], ['cooling.fan-group', false], ['cooling.dial', true],
  ['eq.band', true], ['eq.band-browser', true], ['eq.preset', false], ['eq.toggle', false], ['eq.sonar-volume', true],
  ['macros.macro', false], ['macros.hotkey', false], ['macros.type-text', false], ['macros.launch', false], ['macros.media', false], ['macros.dial', true],
  ['spotify.now-playing', true], ['spotify.play-pause', false], ['spotify.next', false], ['spotify.previous', false], ['spotify.like', false],
  ['spotify.shuffle', false], ['spotify.repeat', false], ['spotify.volume', true], ['spotify.browser', true],
  ['system.cpu', false], ['system.gpu', false], ['system.ram', false], ['system.disk', false], ['system.network', false], ['system.dial', true],
  ['core.diagnostics', true],
];

// Where each domain's assets live (relative to the repo root). "core" is the exe's own action: its art ships from assets/.
export const DOMAIN_DIRS = {
  audio: 'src/PrismControl.Audio/plugin', cooling: 'src/PrismControl.Cooling/plugin', eq: 'src/PrismControl.Eq/plugin',
  macros: 'src/PrismControl.Macros/plugin', spotify: 'src/PrismControl.Spotify/plugin', system: 'src/PrismControl.SystemInfo/plugin',
  core: 'assets',
};
