// Placeholder Stream Deck facets for the website — sketches drawn with Refraction's key
// grammar (design/tokens.json › deck) until prism-deck's catalog and browser runtime land.
//
// Every facet has the shape prism-deck facets use — { id, title, gallery, category, kind,
// description, animated, loop, fps, states, press, render(ctx) } — and render() returns an
// SVG string: keys 144×144 (authored @2x, shown at any size), dial segments 200×100, the
// touch strip 800×100, and walls one canvas across every key of a device.
//
// Key grammar (@144): bleed 8 · content inside 12 · text inside 16 · value 44 Inter 600 top 44 ·
// label 22 Inter 600, 30 above the bottom · micro 16 mono caps · index bar 32×4, 12 above the
// bottom · states off / on / alert / busy / disabled.

import { hueColors } from './hue.js';
export { hueColors };

const WARN = { night: '#eec36f', day: '#8a5a00' }, NEG = { night: '#f5877f', day: '#bf3434' }, POS = { night: '#8bd8ba', day: '#1f6b4f' };
const INK = { night: '#f0f0f5', day: '#20202e' }, MUTED = { night: '#a2a4b4', day: '#55556a' }, FAINT = { night: '#565a6c', day: '#a9a8b8' };
const SANS = 'Inter,"Segoe UI",system-ui,sans-serif', MONO = 'ui-monospace,"Cascadia Mono",Consolas,monospace';
const TAU = Math.PI * 2;
const r1 = (n) => Math.round(n * 10) / 10;

// ── the key: material, edge, state light, index ─────────────────────────────────────
function keyOpen(c, { state = 'off' } = {}) {
  const P = c.id, day = c.mode === 'day', H = c.hue;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="100%" height="100%" font-family='${SANS}'><defs>`;
  s += day
    ? `<linearGradient id="${P}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f4f3f8"/><stop offset="1" stop-color="#e9e7f1"/></linearGradient>`
    : `<radialGradient id="${P}m" cx=".5" cy="0" r="1.15" fx=".5" fy="0"><stop offset="0" stop-color="#161a27"/><stop offset=".62" stop-color="#0b0d14"/><stop offset="1" stop-color="#06070b"/></radialGradient>`;
  s += `<radialGradient id="${P}w" cx=".5" cy="1.05" r=".95"><stop offset="0" stop-color="${H.vivid}" stop-opacity="${day ? 0.2 : 0.24}"/><stop offset="1" stop-color="${H.vivid}" stop-opacity="0"/></radialGradient>`;
  s += `<linearGradient id="${P}e" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${day ? 1 : 0.16}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  s += `<filter id="${P}g" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
  s += `<rect width="144" height="144" fill="url(#${P}m)"/>`;
  if (state === 'on') s += `<rect width="144" height="144" fill="url(#${P}w)"/>`;
  s += `<rect x="18" y="0" width="108" height="2" fill="url(#${P}e)"/>`;
  return s;
}
function keyClose(c, { state = 'off', index = true } = {}) {
  const H = c.hue, m = c.mode, day = m === 'day';
  let s = '';
  if (state === 'on') s += `<rect x="3" y="3" width="138" height="138" rx="19" fill="none" stroke="${H.vivid}" stroke-width="3" opacity=".95"/>`;
  if (state === 'alert') {
    const col = c.alertColor || WARN[m];
    const breathe = c.reduced ? 1 : 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(c.since * TAU));
    s += `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${col}" stroke-width="4" opacity="${r1(breathe * 100) / 100}"/>`;
    s += `<path d="M144 0V30L114 0Z" fill="${col}"/>`;
  }
  if (state === 'busy') {
    const per = 4 * 120 + 2 * Math.PI * 18, lap = c.reduced ? 0.15 : (c.t / 1.2) % 1;
    s += `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${day ? '#7353bb' : '#ffffff'}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${r1(per * 0.16)} ${r1(per * 0.84)}" stroke-dashoffset="${r1(-lap * per)}" opacity=".95"/>`;
  }
  if (index && state !== 'busy' && state !== 'disabled') {
    const lit = state === 'on' || state === 'alert';
    const col = state === 'alert' ? (c.alertColor || WARN[m]) : H.vivid;
    if (lit) s += `<rect x="56" y="128" width="32" height="4" rx="2" fill="${col}" filter="url(#${c.id}g)" opacity=".9"/>`;
    s += `<rect x="56" y="128" width="32" height="4" rx="2" fill="${col}" opacity="${lit ? 1 : 0.45}"/>`;
  }
  return s + '</svg>';
}
const text = (x, y, size, str, { fill, weight = 600, anchor = 'middle', ls = -0.02, mono = false, opacity } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${r1(ls * size * 10) / 10}" fill="${fill}"${mono ? ` font-family='${MONO}'` : ''}${opacity != null ? ` opacity="${opacity}"` : ''}>${str}</text>`;
const value = (c, str, fill) => text(72, 78, 44, str, { fill: fill || INK[c.mode] });
const label = (c, str, fill) => text(72, 114, 22, str, { fill: fill || (c.stateName === 'disabled' ? FAINT[c.mode] : MUTED[c.mode]), ls: -0.01 });
const micro = (c, str, fill) => text(72, 30, 15, str, { fill: fill || c.hue.ink, mono: true, ls: 0.08 });
const arc = (cx, cy, r, a0, a1) => {
  const p = (a) => `${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`;
  return `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
};
const wave = (t, k) => 0.5 + 0.5 * Math.sin(t * k);
const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

// ── galleries (prism-deck's taxonomy; hues are its provisional OKLCH positions) ─────
export const GALLERIES = [
  { id: 'status', title: 'Status & Health', icon: 'status', hue: 296, blurb: 'Health lights, heartbeats, uptime and incidents at a glance.' },
  { id: 'meters', title: 'Meters & Gauges', icon: 'charts', hue: 268, blurb: 'Rings, needles, bars and thresholds: one number, read from across the room.' },
  { id: 'time', title: 'Timers & Clocks', icon: 'loaders', hue: 240, blurb: 'Clocks, countdowns, stopwatches and focus timers.' },
  { id: 'toggles', title: 'Toggles & States', icon: 'input', hue: 212, blurb: 'Switches, mute and live keys, multi-state cycles and hold-to-confirm.' },
  { id: 'counters', title: 'Counters & Tallies', icon: 'plus', hue: 184, blurb: 'Tallies, scores, goals and streaks. Press to count.' },
  { id: 'media', title: 'Media & Audio', icon: 'play', hue: 156, blurb: 'Transport keys, level meters, visualizers and mixer channels.' },
  { id: 'system', title: 'System Monitors', icon: 'progress', hue: 128, blurb: 'CPU, memory, network, disk and thermals — the box under your desk, live.' },
  { id: 'devops', title: 'Dev & Ops', icon: 'terminal', hue: 100, blurb: 'Builds, deploys, git and on-call on a keypad.' },
  { id: 'stream', title: 'Streaming & Scenes', icon: 'eye', hue: 72, blurb: 'On-air lights, scene switchers, chat and recording keys.' },
  { id: 'productivity', title: 'Productivity', icon: 'star', hue: 44, blurb: 'Focus, calendar, launchers, shortcuts and weather.' },
  { id: 'dials', title: 'Dials & Strips', icon: 'settings', hue: 16, blurb: 'Stream Deck + encoders: 200×100 dial segments and touch-strip panoramas.' },
  { id: 'walls', title: 'Walls', icon: 'grid', hue: 348, blurb: 'One artwork across every key of a device. The gaps become a window.' },
  { id: 'inspector', title: 'Property Inspector', icon: 'layers', hue: 320, blurb: 'Property-inspector components for deck actions.' },
];

// ── facets ───────────────────────────────────────────────────────────────────────
const F = [];
const key = (def) => F.push({ kind: 'key', animated: true, loop: 4, fps: 10, states: ['off', 'on'], press: 'toggle', ...def });

key({ id: 'status-api-health', title: 'API Health', gallery: 'status', category: 'Health Lights', description: 'A status light with a heartbeat trace. Press to acknowledge; alerts ring and notch the corner.', states: ['ok', 'alert', 'off'], press: 'cycle', loop: 2,
  render(c) {
    const st = c.stateName, m = c.mode, on = st === 'ok', alert = st === 'alert';
    const col = alert ? NEG[m] : on ? POS[m] : FAINT[m];
    let s = keyOpen(c, { state: on ? 'on' : 'off' });
    const ph = (c.t % 2) / 2;
    let d = '';
    for (let x = 16; x <= 128; x += 2) {
      const u = ((x - 16) / 112 - ph + 1) % 1;
      const spike = alert ? 0 : u > 0.42 && u < 0.5 ? Math.sin((u - 0.42) / 0.08 * Math.PI) * -26 : u > 0.5 && u < 0.56 ? Math.sin((u - 0.5) / 0.06 * Math.PI) * 10 : 0;
      d += `${x === 16 ? 'M' : 'L'}${x} ${r1(58 + spike + (alert ? Math.sin(x * 0.4 + c.t * 3) * 2 : 0))}`;
    }
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity="${st === 'off' ? 0.5 : 1}"/>`;
    s += text(72, 98, 20, alert ? 'DOWN' : on ? 'OK' : 'IDLE', { fill: alert ? NEG[m] : on ? POS[m] : MUTED[m], mono: true, ls: 0.08 });
    s += label(c, 'api.example');
    c.alertColor = NEG[m];
    return s + keyClose(c, { state: alert ? 'alert' : on ? 'on' : 'off' });
  } });

key({ id: 'status-uptime', title: 'Uptime 30d', gallery: 'status', category: 'Uptime & SLOs', description: 'Thirty days of uptime as a strip of daily ticks, with the SLO up top.', animated: false, states: ['on'], press: 'none',
  render(c) {
    const m = c.mode;
    let s = keyOpen(c, { state: 'on' });
    s += value(c, '99.9');
    for (let i = 0; i < 15; i++) {
      const bad = i === 9;
      s += `<rect x="${17 + i * 7.4}" y="88" width="5" height="${bad ? 8 : 12}" rx="1.5" fill="${bad ? WARN[m] : c.hue.vivid}" opacity="${bad ? 1 : 0.85}" transform="translate(0 ${bad ? 4 : 0})"/>`;
    }
    s += label(c, 'SLO 99.5');
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'meter-cpu-ring', title: 'CPU Ring', gallery: 'meters', category: 'Rings', description: 'Load as a 270° ring that warms toward the threshold. One number, readable across the room.', states: ['on'], press: 'none', loop: 8,
  render(c) {
    const m = c.mode, v = c.reduced ? 0.64 : 0.38 + 0.42 * wave(c.t, 0.8) + 0.08 * Math.sin(c.t * 2.7);
    const hot = v > 0.75, col = hot ? WARN[m] : c.hue.vivid;
    let s = keyOpen(c, { state: 'on' });
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
    s += `<path d="${arc(72, 66, 40, a0, a0 + span)}" fill="none" stroke="${m === 'day' ? '#dedce9' : '#252834'}" stroke-width="9" stroke-linecap="round"/>`;
    s += `<path d="${arc(72, 66, 40, a0, a0 + span * v)}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`;
    s += text(72, 76, 30, `${Math.round(v * 100)}`, { fill: INK[m] });
    s += label(c, 'CPU');
    return s + keyClose(c, { state: 'on', index: false });
  } });

key({ id: 'meter-needle', title: 'Load Needle', gallery: 'meters', category: 'Needles', description: 'A swinging needle over a three-band scale.', states: ['on'], press: 'none', loop: 6,
  render(c) {
    const m = c.mode, v = c.reduced ? 0.55 : 0.5 + 0.38 * Math.sin(c.t * 1.1) * Math.cos(c.t * 0.37);
    let s = keyOpen(c, { state: 'on' });
    const bands = [[0, 0.6, c.hue.vivid], [0.6, 0.85, WARN[m]], [0.85, 1, NEG[m]]];
    for (const [a, b, col] of bands) s += `<path d="${arc(72, 86, 46, Math.PI + a * Math.PI, Math.PI + b * Math.PI - 0.04)}" fill="none" stroke="${col}" stroke-width="7" opacity=".9"/>`;
    const ang = Math.PI + v * Math.PI;
    s += `<path d="M72 86L${r1(72 + 40 * Math.cos(ang))} ${r1(86 + 40 * Math.sin(ang))}" stroke="${INK[m]}" stroke-width="3.5" stroke-linecap="round"/><circle cx="72" cy="86" r="5" fill="${INK[m]}"/>`;
    s += label(c, 'LOAD');
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'time-clock', title: 'Analog Clock', gallery: 'time', category: 'Clocks', description: 'Local time with a sweeping second hand and a λ-style hour scale.', states: ['on'], press: 'none', loop: 60, fps: 10,
  render(c) {
    const m = c.mode, d = new Date(c.now);
    const sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
    let s = keyOpen(c, { state: 'on' });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU - Math.PI / 2, big = i % 3 === 0; s += `<path d="M${r1(72 + 44 * Math.cos(a))} ${r1(64 + 44 * Math.sin(a))}L${r1(72 + (big ? 36 : 40) * Math.cos(a))} ${r1(64 + (big ? 36 : 40) * Math.sin(a))}" stroke="${big ? INK[m] : MUTED[m]}" stroke-width="${big ? 3 : 2}" stroke-linecap="round"/>`; }
    const hand = (v, len, w, col) => { const a = v * TAU - Math.PI / 2; return `<path d="M72 64L${r1(72 + len * Math.cos(a))} ${r1(64 + len * Math.sin(a))}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`; };
    s += hand(hr / 12, 22, 5, INK[m]) + hand(min / 60, 32, 3.5, INK[m]) + hand(sec / 60, 38, 2, c.hue.vivid) + `<circle cx="72" cy="64" r="3.5" fill="${c.hue.vivid}"/>`;
    s += text(72, 130, 16, `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, { fill: MUTED[m], mono: true, ls: 0.04 });
    return s + keyClose(c, { state: 'on', index: false });
  } });

key({ id: 'time-focus', title: 'Focus Timer', gallery: 'time', category: 'Focus Timers', description: 'A 25-minute focus ring. Press to start or pause; it counts down in the gallery hue.', states: ['paused', 'running'], press: 'toggle', loop: 1500,
  render(c) {
    const m = c.mode, running = c.stateName === 'running';
    const left = Math.max(0, 1500 - (running ? c.since * 30 : 0) - 1);
    const v = left / 1500;
    let s = keyOpen(c, { state: running ? 'on' : 'off' });
    s += `<circle cx="72" cy="62" r="42" fill="none" stroke="${m === 'day' ? '#dedce9' : '#1d202b'}" stroke-width="5"/>`;
    s += `<path d="${arc(72, 62, 42, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(0.9999, v))}" fill="none" stroke="${running ? c.hue.vivid : MUTED[m]}" stroke-width="5" stroke-linecap="round"/>`;
    s += text(72, 72, 27, `${pad2(left / 60)}:${pad2(left % 60)}`, { fill: INK[m], ls: -0.03 });
    s += label(c, running ? 'FOCUS' : 'PAUSED');
    return s + keyClose(c, { state: running ? 'on' : 'off' });
  } });

key({ id: 'toggle-mic', title: 'Mic Mute', gallery: 'toggles', category: 'Mute & Live', description: 'Live or muted, never ambiguous: the live state lights the ring, mute strikes the glyph.', states: ['live', 'muted'], press: 'toggle', animated: true, loop: 2,
  render(c) {
    const m = c.mode, live = c.stateName === 'live';
    const col = live ? c.hue.ink : NEG[m];
    let s = keyOpen(c, { state: live ? 'on' : 'off' });
    s += `<g fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="58" y="24" width="28" height="46" rx="14"/><path d="M46 58a26 26 0 0 0 52 0M72 84v12"/></g>`;
    if (live && !c.reduced) { const p = wave(c.t, 6); s += `<path d="M36 44a40 40 0 0 0 0 28M108 44a40 40 0 0 1 0 28" fill="none" stroke="${c.hue.vivid}" stroke-width="3" stroke-linecap="round" opacity="${r1(0.3 + p * 0.5)}"/>`; }
    if (!live) s += `<path d="M40 22L104 94" stroke="${NEG[m]}" stroke-width="5" stroke-linecap="round"/>`;
    s += label(c, live ? 'LIVE' : 'MUTED', live ? INK[m] : NEG[m]);
    return s + keyClose(c, { state: live ? 'on' : 'off' });
  } });

key({ id: 'toggle-switch', title: 'Lights', gallery: 'toggles', category: 'Switches', description: 'A two-state switch with the thumb traveling on press.', states: ['off', 'on'], press: 'toggle', loop: 1,
  render(c) {
    const m = c.mode, on = c.stateName === 'on', k = Math.min(1, c.since / 0.24), e = 1 - Math.pow(1 - k, 4), x = on ? 50 + 44 * e : 94 - 44 * e;
    let s = keyOpen(c, { state: on ? 'on' : 'off' });
    s += `<rect x="28" y="40" width="88" height="44" rx="22" fill="${on ? c.hue.vivid : 'none'}" stroke="${on ? c.hue.vivid : (m === 'day' ? '#8a879d' : '#6b6f84')}" stroke-width="3" opacity="${on ? 0.9 : 1}"/>`;
    s += `<circle cx="${r1(x)}" cy="62" r="16" fill="${on ? (m === 'day' ? '#fff' : '#0b0d14') : MUTED[m]}"/>`;
    s += label(c, on ? 'ON' : 'OFF', on ? INK[m] : MUTED[m]);
    return s + keyClose(c, { state: on ? 'on' : 'off' });
  } });

key({ id: 'counter-tally', title: 'Tally', gallery: 'counters', category: 'Tallies', description: 'Press to count. The number rolls up from below, the index flashes.', states: ['on'], press: 'count', loop: 1,
  render(c) {
    const m = c.mode, n = 12 + c.ticks, roll = Math.min(1, c.pressAge / 0.28), e = 1 - Math.pow(1 - roll, 3);
    let s = keyOpen(c, { state: 'on' });
    s += `<g><g transform="translate(0 ${r1((1 - e) * 26)})" opacity="${r1(0.25 + 0.75 * e)}">${value(c, String(n))}</g></g>`;
    s += micro(c, '+1');
    s += label(c, 'TALLY');
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'counter-streak', title: 'Streak', gallery: 'counters', category: 'Goals & Streaks', description: 'Seven of ten, as dots around a ring. Press to log today.', states: ['on'], press: 'count', animated: false,
  render(c) {
    const m = c.mode, done = Math.min(10, 7 + c.ticks);
    let s = keyOpen(c, { state: 'on' });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2; s += `<circle cx="${r1(72 + 40 * Math.cos(a))}" cy="${r1(62 + 40 * Math.sin(a))}" r="6" fill="${i < done ? c.hue.vivid : 'none'}" stroke="${i < done ? c.hue.vivid : (m === 'day' ? '#c9c6d8' : '#343849')}" stroke-width="2.5"/>`; }
    s += text(72, 74, 32, `${done}`, { fill: INK[m] });
    s += label(c, done >= 10 ? 'DONE' : 'OF 10');
    return s + keyClose(c, { state: 'on', index: false });
  } });

key({ id: 'media-levels', title: 'Level Meter', gallery: 'media', category: 'Levels & Visualizers', description: 'Eight bands of live level with peak holds.', states: ['on'], press: 'none', loop: 8, fps: 12,
  render(c) {
    const m = c.mode;
    let s = keyOpen(c, { state: 'on' });
    for (let i = 0; i < 8; i++) {
      const v = c.reduced ? 0.3 + 0.07 * i : Math.min(1, 0.18 + 0.7 * Math.abs(Math.sin(c.t * (1.3 + i * 0.37) + i * 1.7)) * (1 - i * 0.05));
      const h = Math.round(v * 64), x = 22 + i * 13;
      s += `<rect x="${x}" y="${92 - h}" width="9" height="${h}" rx="2" fill="${v > 0.82 ? WARN[m] : c.hue.vivid}" opacity="${r1(0.55 + v * 0.45)}"/>`;
      s += `<rect x="${x}" y="${88 - Math.round(Math.min(1, v + 0.08) * 64)}" width="9" height="2" fill="${INK[m]}" opacity=".7"/>`;
    }
    s += label(c, 'MIX');
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'media-play', title: 'Play / Pause', gallery: 'media', category: 'Transport', description: 'Transport with a progress beam along the bottom while playing.', states: ['paused', 'playing'], press: 'toggle', loop: 30,
  render(c) {
    const m = c.mode, playing = c.stateName === 'playing';
    let s = keyOpen(c, { state: playing ? 'on' : 'off' });
    s += playing ? `<g fill="${c.hue.ink}"><rect x="50" y="34" width="14" height="46" rx="3"/><rect x="80" y="34" width="14" height="46" rx="3"/></g>`
      : `<path d="M56 32L98 57L56 82Z" fill="${INK[m]}" stroke="${INK[m]}" stroke-width="4" stroke-linejoin="round"/>`;
    const p = ((playing ? c.since : 0) / 30 + 0.34) % 1;
    s += `<rect x="20" y="98" width="104" height="3" rx="1.5" fill="${m === 'day' ? '#dedce9' : '#252834'}"/><rect x="20" y="98" width="${r1(104 * p)}" height="3" rx="1.5" fill="${c.hue.vivid}"/>`;
    s += text(72, 124, 15, `${pad2((p * 214) / 60)}:${pad2((p * 214) % 60)}`, { fill: MUTED[m], mono: true, ls: 0.04 });
    return s + keyClose(c, { state: playing ? 'on' : 'off', index: false });
  } });

key({ id: 'sys-net', title: 'Network', gallery: 'system', category: 'Network', description: 'Throughput as a scrolling sparkline with the current value on top.', states: ['on'], press: 'none', loop: 12,
  render(c) {
    const m = c.mode, f = (x) => 0.45 + 0.25 * Math.sin(x * 0.9) + 0.15 * Math.sin(x * 2.3 + 1) + 0.08 * Math.sin(x * 5.1);
    let d = '', area = '';
    for (let i = 0; i <= 28; i++) { const x = 16 + i * 4, y = 100 - f(c.t * 1.4 + i * 0.35) * 36; d += `${i ? 'L' : 'M'}${x} ${r1(y)}`; }
    area = d + 'L128 104L16 104Z';
    let s = keyOpen(c, { state: 'on' });
    s += value(c, String(Math.round(f(c.t * 1.4 + 28 * 0.35) * 140)));
    s += `<path d="${area}" fill="${c.hue.vivid}" opacity=".18"/><path d="${d}" fill="none" stroke="${c.hue.vivid}" stroke-width="2.5" stroke-linejoin="round"/>`;
    s += micro(c, 'MB/S');
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'sys-gpu-temp', title: 'GPU Temp', gallery: 'system', category: 'Thermals & Power', description: 'Temperature with a warm-up arc; past 80° the key goes to alert.', states: ['on'], press: 'none', loop: 10,
  render(c) {
    const m = c.mode, temp = c.reduced ? 61 : Math.round(62 + 21 * wave(c.t, 0.6));
    const alert = temp >= 80;
    c.alertColor = WARN[m];
    let s = keyOpen(c, { state: alert ? 'off' : 'on' });
    s += value(c, `${temp}°`, alert ? WARN[m] : undefined);
    const v = (temp - 30) / 70;
    s += `<rect x="24" y="92" width="96" height="6" rx="3" fill="${m === 'day' ? '#dedce9' : '#252834'}"/><rect x="24" y="92" width="${r1(96 * v)}" height="6" rx="3" fill="${alert ? WARN[m] : c.hue.vivid}"/>`;
    s += label(c, 'GPU');
    return s + keyClose(c, { state: alert ? 'alert' : 'on' });
  } });

key({ id: 'devops-build', title: 'Build', gallery: 'devops', category: 'Builds & CI', description: 'Busy while a build runs (a beam laps the rim), then passes or fails. Press to re-run.', states: ['busy', 'passed', 'failed'], press: 'cycle', loop: 6,
  render(c) {
    const m = c.mode, st = c.stateName;
    const busy = st === 'busy', ok = st === 'passed';
    c.alertColor = NEG[m];
    let s = keyOpen(c, { state: ok ? 'on' : 'off' });
    if (busy) {
      const dots = c.reduced ? 3 : 1 + (Math.floor(c.t * 3) % 3);
      for (let i = 0; i < 3; i++) s += `<circle cx="${56 + i * 16}" cy="62" r="5" fill="${i < dots ? INK[m] : FAINT[m]}"/>`;
    } else if (ok) s += `<path d="M48 62l16 16 32-32" fill="none" stroke="${POS[m]}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
    else s += `<path d="M52 42l40 40M92 42l-40 40" fill="none" stroke="${NEG[m]}" stroke-width="7" stroke-linecap="round"/>`;
    s += label(c, busy ? 'BUILDING' : ok ? 'PASSED' : 'FAILED', busy ? MUTED[m] : ok ? POS[m] : NEG[m]);
    return s + keyClose(c, { state: busy ? 'busy' : ok ? 'on' : 'alert' });
  } });

key({ id: 'devops-deploy', title: 'Deploy', gallery: 'devops', category: 'Deploys', description: 'Rollout progress across regions, as a stepped beam.', states: ['on'], press: 'none', loop: 8,
  render(c) {
    const m = c.mode, p = c.reduced ? 0.6 : (c.t % 8) / 6;
    let s = keyOpen(c, { state: 'on' });
    s += value(c, `${Math.min(100, Math.round(p * 100))}%`);
    for (let i = 0; i < 4; i++) { const fill = Math.max(0, Math.min(1, p * 4 - i)); s += `<rect x="${20 + i * 27}" y="92" width="23" height="6" rx="3" fill="${m === 'day' ? '#dedce9' : '#252834'}"/><rect x="${20 + i * 27}" y="92" width="${r1(23 * fill)}" height="6" rx="3" fill="${c.hue.vivid}"/>`; }
    s += label(c, 'DEPLOY');
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'stream-on-air', title: 'On Air', gallery: 'stream', category: 'On Air', description: 'The on-air light. Off is quiet glass; on glows warm and counts the time live.', states: ['off', 'on'], press: 'toggle', loop: 2,
  render(c) {
    const m = c.mode, on = c.stateName === 'on';
    const col = on ? NEG[m] : MUTED[m];
    let s = keyOpen(c, { state: on ? 'on' : 'off' });
    if (on) s += `<circle cx="72" cy="50" r="24" fill="${NEG[m]}" opacity="${r1(0.12 + (c.reduced ? 0.1 : 0.12 * wave(c.t, 3)))}"/>`;
    s += `<circle cx="72" cy="50" r="11" fill="${on ? NEG[m] : 'none'}" stroke="${col}" stroke-width="3"/>`;
    s += text(72, 98, 24, 'ON AIR', { fill: on ? INK[m] : MUTED[m], ls: 0.02 });
    s += text(72, 124, 14, on ? `${pad2(c.since / 60)}:${pad2(c.since % 60)}` : 'OFF', { fill: on ? NEG[m] : FAINT[m], mono: true, ls: 0.08 });
    c.hue = { ...c.hue, vivid: on ? NEG[m] : c.hue.vivid };
    return s + keyClose(c, { state: on ? 'on' : 'off', index: false });
  } });

key({ id: 'stream-scene', title: 'Scene Switch', gallery: 'stream', category: 'Scenes', description: 'Cycle scenes; the thumbnail shows the layout you are about to cut to.', states: ['Cam 1', 'Cam 2', 'Screen'], press: 'cycle', animated: false,
  render(c) {
    const m = c.mode, i = c.state;
    let s = keyOpen(c, { state: 'on' });
    const stroke = c.hue.vivid, dim = m === 'day' ? '#c9c6d8' : '#343849';
    s += `<rect x="30" y="26" width="84" height="54" rx="6" fill="none" stroke="${stroke}" stroke-width="3"/>`;
    if (i === 0) s += `<circle cx="72" cy="46" r="10" fill="${stroke}" opacity=".85"/><path d="M50 76a22 14 0 0 1 44 0" fill="${stroke}" opacity=".85"/>`;
    if (i === 1) s += `<circle cx="58" cy="48" r="8" fill="${stroke}" opacity=".85"/><circle cx="86" cy="48" r="8" fill="${stroke}" opacity=".85"/><path d="M42 76a16 11 0 0 1 32 0M70 76a16 11 0 0 1 32 0" fill="${stroke}" opacity=".85"/>`;
    if (i === 2) s += `<rect x="38" y="33" width="68" height="40" rx="3" fill="${dim}"/><rect x="88" y="56" width="22" height="18" rx="3" fill="${stroke}"/>`;
    s += label(c, ['CAM 1', 'CAM 2', 'SCREEN'][i] || 'SCENE', INK[m]);
    return s + keyClose(c, { state: 'on' });
  } });

key({ id: 'prod-weather', title: 'Weather', gallery: 'productivity', category: 'Weather', description: 'Today at a glance: the glyph, the high, a drifting cloud.', states: ['on'], press: 'none', loop: 12,
  render(c) {
    const m = c.mode, dx = c.reduced ? 0 : Math.sin(c.t * 0.5) * 5;
    let s = keyOpen(c, { state: 'on' });
    s += `<g stroke="${WARN[m]}" stroke-width="4" stroke-linecap="round">`;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + (c.reduced ? 0 : c.t * 0.2); s += `<path d="M${r1(58 + 22 * Math.cos(a))} ${r1(44 + 22 * Math.sin(a))}L${r1(58 + 28 * Math.cos(a))} ${r1(44 + 28 * Math.sin(a))}"/>`; }
    s += `</g><circle cx="58" cy="44" r="14" fill="${WARN[m]}"/>`;
    s += `<path d="M${r1(66 + dx)} 70a14 14 0 0 1 4-27a18 18 0 0 1 34 6a11 11 0 0 1 0 21Z" fill="${m === 'day' ? '#ffffff' : '#1d2130'}" stroke="${INK[m]}" stroke-width="3.5" stroke-linejoin="round"/>`;
    s += text(72, 108, 28, '18°', { fill: INK[m] });
    s += text(72, 128, 13, 'H 21 · L 12', { fill: MUTED[m], mono: true, ls: 0.06 });
    return s + keyClose(c, { state: 'on', index: false });
  } });

key({ id: 'prod-launch-editor', title: 'Launch Editor', gallery: 'productivity', category: 'Launchers', description: 'A launcher key with a press ripple. Momentary: it fires, it never stays on.', states: ['ready'], press: 'momentary', animated: false,
  render(c) {
    const m = c.mode, k = Math.min(1, c.pressAge / 0.5);
    let s = keyOpen(c, { state: 'off' });
    if (k < 1) s += `<circle cx="72" cy="56" r="${r1(20 + 60 * k)}" fill="none" stroke="${c.hue.vivid}" stroke-width="3" opacity="${r1(1 - k)}"/>`;
    s += `<g fill="none" stroke="${c.hue.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M56 38L38 56l18 18M88 38l18 18-18 18M78 32L66 80"/></g>`;
    s += label(c, 'EDITOR', INK[m]);
    return s + keyClose(c, { state: k < 1 ? 'on' : 'off' });
  } });

// dials (Stream Deck + segments, 200×100) — micro label 14 mono caps, value 34, beam meter, hue tick
const dial = (def) => F.push({ kind: 'dial', animated: false, loop: 1, fps: 15, states: ['on'], press: 'none', ...def });
function dialSvg(c, name, val, v) {
  const m = c.mode, day = m === 'day', P = c.id;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="100%" height="100%" font-family='${SANS}'><defs><linearGradient id="${P}b" x1="0" x2="1"><stop offset="0" stop-color="${c.hue.vivid}" stop-opacity=".25"/><stop offset="1" stop-color="${c.hue.vivid}"/></linearGradient></defs>`;
  s += `<rect width="200" height="100" fill="${day ? '#f6f5f9' : '#0b0d14'}"/>`;
  s += `<rect x="14" y="22" width="3" height="18" rx="1.5" fill="${c.hue.vivid}"/>`;
  s += text(26, 36, 13, name, { fill: c.hue.ink, mono: true, ls: 0.1, anchor: 'start' });
  s += text(24, 76, 34, val, { fill: INK[m], anchor: 'start' });
  s += `<rect x="14" y="90" width="172" height="3" rx="1.5" fill="${day ? '#dedce9' : '#252834'}"/><rect x="14" y="90" width="${r1(172 * v)}" height="3" rx="1.5" fill="url(#${P}b)"/>`;
  s += `<circle cx="${r1(14 + 172 * v)}" cy="91.5" r="3" fill="${day ? '#7353bb' : '#fff'}"/>`;
  return s + '</svg>';
}
dial({ id: 'dial-volume', title: 'Volume', gallery: 'dials', category: 'Dial Segments', description: 'Turn for volume, press to mute. The beam meter rides the bottom edge.', render: (c) => dialSvg(c, 'VOLUME', `${Math.round(c.value * 100)}%`, c.value) });
dial({ id: 'dial-brightness', title: 'Brightness', gallery: 'dials', category: 'Dial Segments', description: 'Key-light brightness in ten steps.', render: (c) => dialSvg(c, 'KEY LIGHT', `${Math.round(c.value * 100)}`, c.value) });
dial({ id: 'dial-temp', title: 'Color Temp', gallery: 'dials', category: 'Encoders', description: 'Color temperature from 2700 to 6500 K.', render: (c) => dialSvg(c, 'TEMP', `${Math.round(2700 + c.value * 3800)}K`, c.value) });
dial({ id: 'dial-scrub', title: 'Timeline Scrub', gallery: 'dials', category: 'Encoders', description: 'Scrub the timeline frame by frame.', render: (c) => dialSvg(c, 'SCRUB', `${pad2(c.value * 214 / 60)}:${pad2((c.value * 214) % 60)}`, c.value) });

// touch strip panorama (800×100 on +, sliced per dial)
F.push({ id: 'strip-spectrum', title: 'Spectrum Analyzer', gallery: 'dials', category: 'Strip Panoramas', kind: 'strip', animated: true, loop: 8, fps: 15, states: ['on'], press: 'none',
  description: 'A spectrum analyzer across the whole touch strip, its bands in spectral order.',
  render(c) {
    const m = c.mode, W = c.w || 800, n = 40, bw = W / n;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" width="100%" height="100%" preserveAspectRatio="none"><rect width="${W}" height="100" fill="${m === 'day' ? '#f6f5f9' : '#06070b'}"/>`;
    for (let i = 0; i < n; i++) {
      const h = hueColors(296 - (i / (n - 1)) * 288, m).vivid;
      const v = c.reduced ? 0.25 + 0.5 * Math.abs(Math.sin(i * 0.6)) : Math.min(1, 0.12 + 0.75 * Math.abs(Math.sin(c.t * (0.9 + (i % 7) * 0.21) + i * 0.47)) * (1 - Math.abs(i - n * 0.35) / n));
      const bh = Math.round(v * 78);
      s += `<rect x="${r1(i * bw + 2)}" y="${88 - bh}" width="${r1(bw - 4)}" height="${bh}" rx="2" fill="${h}" opacity="${r1(0.5 + v * 0.5)}"/>`;
    }
    return s + `<rect x="0" y="92" width="${W}" height="1" fill="${m === 'day' ? '#c9c6d8' : '#252834'}"/></svg>`;
  } });

// walls — one artwork across every key (gaps are hidden pixels)
F.push({ id: 'wall-first-light', title: 'First Light', gallery: 'walls', category: 'Spectral', kind: 'wall', animated: true, loop: 6, fps: 12, states: ['on'], press: 'none',
  description: 'A beam crosses the device, strikes a prism on the center key and fans into the spectrum across the rest.',
  render(c) {
    const m = c.mode, day = m === 'day', { w, h } = c.grid, P = c.id;
    const cx = w * 0.36, cy = h * 0.5, beamX = c.reduced ? cx : Math.min(cx, ((c.t % 6) / 1.2) * cx);
    const fan = c.reduced ? 1 : Math.max(0, Math.min(1, ((c.t % 6) - 1.2) / 0.8));
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><radialGradient id="${P}r" cx=".36" cy=".5" r=".7"><stop offset="0" stop-color="${day ? '#ffffff' : '#141826'}"/><stop offset="1" stop-color="${day ? '#ecebf3' : '#06070b'}"/></radialGradient><filter id="${P}f" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="${r1(h * 0.012)}"/></filter></defs><rect width="${w}" height="${h}" fill="url(#${P}r)"/>`;
    s += `<path d="M0 ${cy}H${r1(beamX)}" stroke="${day ? '#7353bb' : '#fff'}" stroke-width="${r1(h * 0.012)}" filter="url(#${P}f)"/><path d="M0 ${cy}H${r1(beamX)}" stroke="${day ? '#7353bb' : '#fff'}" stroke-width="${r1(h * 0.004)}"/>`;
    const ps = h * 0.34;
    s += `<path d="M${r1(cx)} ${r1(cy - ps * 0.62)}L${r1(cx + ps * 0.55)} ${r1(cy + ps * 0.42)}H${r1(cx - ps * 0.55)}Z" fill="${day ? 'rgba(152,118,227,.18)' : 'rgba(214,202,255,.12)'}" stroke="${day ? '#6f52bd' : '#d9ccff'}" stroke-width="${r1(h * 0.006)}" stroke-linejoin="round"/>`;
    if (fan > 0) for (let i = 0; i < 7; i++) {
      const col = hueColors(296 - i * 48, m).vivid, a = (-14 + i * 6) * (Math.PI / 180) * fan, len = w;
      const x0 = cx + ps * 0.2, y0 = cy + ps * 0.04;
      s += `<path d="M${r1(x0)} ${r1(y0)}L${r1(x0 + len * Math.cos(a))} ${r1(y0 + len * Math.sin(a))}" stroke="${col}" stroke-width="${r1(h * 0.016)}" opacity=".35" filter="url(#${P}f)"/><path d="M${r1(x0)} ${r1(y0)}L${r1(x0 + len * Math.cos(a))} ${r1(y0 + len * Math.sin(a))}" stroke="${col}" stroke-width="${r1(h * 0.005)}" opacity="${r1(0.9 * fan)}"/>`;
    }
    return s + '</svg>';
  } });

F.push({ id: 'wall-aurora', title: 'Aurora', gallery: 'walls', category: 'Ambient', kind: 'wall', animated: true, loop: 20, fps: 10, states: ['on'], press: 'none',
  description: 'Slow ribbons of light drifting across the whole device.',
  render(c) {
    const m = c.mode, day = m === 'day', { w, h } = c.grid, P = c.id, t = c.reduced ? 3 : c.t;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><filter id="${P}f" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${r1(h * 0.05)}"/></filter></defs><rect width="${w}" height="${h}" fill="${day ? '#f6f5f9' : '#06070b'}"/><g filter="url(#${P}f)" style="mix-blend-mode:${day ? 'multiply' : 'screen'}">`;
    const bands = [[165, 0.25, 0.7], [210, 0.45, 0.5], [296, 0.65, 0.6], [140, 0.35, 0.4]];
    bands.forEach(([hue, yy, op], j) => {
      let d = '';
      for (let i = 0; i <= 24; i++) { const x = (i / 24) * w, y = h * (yy + 0.12 * Math.sin(i * 0.5 + t * (0.3 + j * 0.07) + j * 2)); d += `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }
      s += `<path d="${d}" fill="none" stroke="${hueColors(hue, m).vivid}" stroke-width="${r1(h * 0.14)}" opacity="${op}" stroke-linecap="round"/>`;
    });
    return s + '</g></svg>';
  } });

export const FACETS = F;
export const STILL_TIME = (f) => (f.animated ? Math.min(f.loop * 0.4, 6) : 0);
