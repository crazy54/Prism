// Four postcards from the sunset strip: a side-scrolling coastal drive past
// palms and glitter water; a braille wireframe flyover with hidden-line
// mountains; 80s chrome lettering floating over a scanline horizon; and a
// striped sun that pulses on the chiptune's kick.
import { lerpc, fract, hash2, textMask, fontPx } from './_kit.js';
import { songAt, LOOP as SL } from './_music.js';

const TAU = Math.PI * 2;
const addc = (a, b, k) => {
  if (k <= 0) return a;
  const r = Math.min(255, ((a >> 16) & 255) + ((b >> 16) & 255) * k);
  const g = Math.min(255, ((a >> 8) & 255) + ((b >> 8) & 255) * k);
  const bl = Math.min(255, (a & 255) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
};

// ───────────────────────────────────────────────────────────── sunset drive ──
const SPR = [
  '...........bbbbbbbbb........',
  '.........bbwwwwwwwwbb.......',
  '......bbbbwwwwwwwwwwbb......',
  '..bbbbbbbbbbbbbbbbbbbbbbL...',
  'Tbbbbbbbbbbbbbbbbbbbbbbbb...',
  '...tttt...........tttt......',
  '...tHHt...........tHHt......',
];
const sunsetDrive = {
  id: 'retro-sunset-drive',
  since: '0.3.0',
  title: 'Sunset Drive',
  category: 'Outrun',
  kind: 'scene',
  order: 200,
  tags: ['sunset', 'drive', 'coast', 'palms', 'side-scroller', 'parallax', 'ocean', 'outrun'],
  description: 'A side-view coastal cruise at dusk: striped sun over glitter water, parallax palms, a guardrail, and a convertible with spinning wheels.',
  size: { w: 80, h: 22 },
  minSize: { w: 24, h: 8 },
  loop: 16,
  canvas: 'field',
  palette: 'sunset',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { width: PW, height: PH, px } = cv;
    const b = ctx.buffer;
    const L = 16;
    const hy = Math.max(1, Math.floor(PH * 0.5));
    const royTop = Math.max(hy + 1, Math.floor(PH * 0.72));
    const roadTop = Math.min(PH - 1, royTop + Math.max(1, Math.round(PH * 0.05)));
    const sunX = PW * 0.66, sunR = Math.max(2, Math.min(PW * 0.17, hy * 0.85));
    const sunY = hy - sunR * 0.25;
    const P = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < PW && y >= 0 && y < PH) px[y * PW + x] = c; };
    // pattern speeds quantized so every scroll closes exactly at the loop
    const VR = (126 * Math.max(1, Math.round((PW * 3) / 126))) / L;
    const spanF = Math.round(PW * 2), spanN = Math.round(PW * 2);
    const vF = spanF / L, vN = (spanN * 2) / L;
    const palmsF = Array.from({ length: 5 }, (_, i) => hash2(i, 41) * spanF);
    const palmsN = Array.from({ length: 4 }, (_, i) => hash2(i, 42) * spanN);
    const spanC = Math.round(PW * 1.6), vC = spanC / L;
    const clouds = Array.from({ length: 3 }, (_, i) => [hash2(i, 43) * spanC, Math.round(hy * (0.2 + 0.2 * i)), Math.round(PW * (0.2 + hash2(i, 44) * 0.2))]);
    const sil = lerpc(0x1c0530, 0x000000, 0.25);
    const palm = (bx, by, hgt, c) => {
      const lean = hgt * 0.16;
      for (let i = 0; i <= 24; i++) {
        const f = i / 24, x = bx + lean * f * f, y = by - hgt * f;
        const w = Math.max(1, hgt * 0.07 * (1 - f * 0.45));
        for (let o = 0; o < w; o++) P(x + o - w / 2, y, c);
      }
      const tx = bx + lean, ty = by - hgt;
      for (let a = 0; a < 7; a++) {
        const ang = -Math.PI + (a / 6) * Math.PI;
        const len = hgt * 0.48 * (0.75 + 0.25 * hash2(a, 3));
        for (let i = 0; i <= 14; i++) {
          const f = i / 14;
          P(tx + Math.cos(ang) * len * f, ty + Math.sin(ang) * len * f * 0.45 + len * f * f * 0.5, c);
        }
      }
    };
    const cs = Math.max(1, Math.floor(PW / 52));
    const carH = 7 * cs;
    const carX = Math.round(PW * 0.14);
    const SPRC = { b: lerpc(0x33123a, pal(0.25), 0.35), w: lerpc(pal(0.8), 0x33184a, 0.55), t: 0x0a0712, L: 0xffe9a0, T: 0xff4050 };
    return (t) => {
      const lt = t % L;
      // sky and sun
      for (let y = 0; y < hy; y++) px.fill(pal(0.04 + (y / hy) * 0.52), y * PW, (y + 1) * PW);
      for (let y = Math.max(0, Math.floor(sunY - sunR)); y < hy; y++) {
        for (let x = Math.max(0, Math.floor(sunX - sunR)); x < Math.min(PW, sunX + sunR + 1); x++) {
          const dx = x + 0.5 - sunX, dy = y + 0.5 - sunY;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < sunR) {
            const v = (dy / sunR + 1) / 2;
            const band = fract(v * 6 - (lt * 3) / L);
            if (band > (v - 0.5) * 1.3) px[y * PW + x] = pal(0.96 - v * 0.36);
          } else if (d < sunR * 1.45) {
            const i = y * PW + x;
            px[i] = lerpc(px[i], pal(0.78), Math.pow(1 - (d - sunR) / (sunR * 0.45), 2) * 0.4);
          }
        }
      }
      for (const [c0, cy2, len] of clouds) {
        const xs = Math.floor((((c0 - lt * vC) % spanC) + spanC) % spanC) - Math.floor(PW * 0.3);
        for (let d2 = 0; d2 < len; d2++) {
          const x = xs + d2;
          P(x, cy2, lerpc(sil, pal(0.8), 0.35));
          if (d2 > 2 && d2 < len - 3) P(x, cy2 + 1, sil);
        }
      }
      // ocean with a glitter path
      for (let y = hy; y < royTop; y++) {
        const k = (y - hy) / Math.max(1, royTop - hy);
        const base = y === hy ? lerpc(0x1c0c34, pal(0.9), 0.55) : lerpc(0x241040, 0x120920, k);
        for (let x = 0; x < PW; x++) {
          let c = base;
          const dxs = Math.abs(x + 0.5 - sunX);
          const pw2 = sunR * (0.25 + k * 1.3);
          if (y > hy && dxs < pw2 && hash2(x, y, Math.floor(t * 6) % 97) < 0.45 * (1 - dxs / pw2) + 0.06) {
            c = lerpc(base, pal(0.88), 0.4 + 0.4 * hash2(x, y, 9));
          }
          px[y * PW + x] = c;
        }
      }
      // far palms on the headland across the water
      for (let j = 0; j < palmsF.length; j++) {
        const sx = Math.floor((((palmsF[j] - lt * vF) % spanF) + spanF) % spanF) - Math.floor(PW * 0.4);
        palm(sx, royTop - 1, PH * (0.2 + hash2(j, 45) * 0.1), lerpc(sil, pal(0.6), 0.25));
      }
      // shoulder, guardrail, road
      const sand = lerpc(0x4a2c44, pal(0.62), 0.22);
      for (let y = royTop; y < roadTop; y++) px.fill(sand, y * PW, (y + 1) * PW);
      for (let x = 0; x < PW; x++) {
        P(x, royTop, 0x1a0e24);
        if (fract((x + lt * VR) / 18) < 0.08) for (let y = royTop; y < roadTop; y++) P(x, y, 0x140a1c);
      }
      for (let y = roadTop; y < PH; y++) {
        const k = (y - roadTop) / Math.max(1, PH - roadTop);
        px.fill(lerpc(0x191326, 0x0f0b18, k), y * PW, (y + 1) * PW);
      }
      const midR = Math.min(PH - 1, Math.round((roadTop + PH - 1) / 2));
      for (let x = 0; x < PW; x++) if (fract((x + lt * VR) / 14) < 0.45) P(x, midR, lerpc(0x191326, 0xffd79a, 0.75));
      // the car
      const spin = Math.floor(lt * 10) % 2;
      const bobY = Math.floor(lt * 6) % 2 ? cs : 0;
      const carTop = PH - 1 - Math.round((PH - roadTop) * 0.12) - carH + 1 - bobY;
      for (let sy = 0; sy < 7; sy++) for (let sx = 0; sx < 28; sx++) {
        const ch = SPR[sy][sx];
        if (ch === '.') continue;
        let c = SPRC[ch];
        if (ch === 'H') c = spin ? 0xd8c8e0 : 0x403048;
        for (let oy = 0; oy < cs; oy++) for (let ox2 = 0; ox2 < cs; ox2++) P(carX + sx * cs + ox2, carTop + sy * cs + oy, c);
      }
      for (let d2 = 1; d2 <= 6 * cs; d2++) {
        const x = carX + 25 * cs + d2, y = carTop + 3 * cs;
        if (x >= 0 && x < PW && y >= 0 && y < PH) px[y * PW + x] = addc(px[y * PW + x], 0xffe9a0, 0.3 * (1 - d2 / (6 * cs)));
      }
      // near palms sweep past in the foreground
      for (let j = 0; j < palmsN.length; j++) {
        const sx = Math.floor((((palmsN[j] - lt * vN) % spanN) + spanN) % spanN) - Math.floor(PW * 0.4);
        palm(sx, PH - 1, PH * (0.5 + hash2(j, 46) * 0.16), lerpc(sil, 0x000000, 0.2));
      }
      cv.paint(b);
    };
  },
};

// ────────────────────────────────────────────────────────  wireframe flyover ──
const wireframe = {
  id: 'retro-wireframe-flyover',
  since: '0.3.0',
  title: 'Wireframe Flyover',
  category: 'Outrun',
  kind: 'scene',
  order: 240,
  tags: ['wireframe', 'terrain', 'mountains', 'flyover', 'hidden-line', 'braille', 'vector', 'outrun'],
  description: 'A vector flyover through wireframe mountains: hidden-line ridges sweep under the camera while a striped sun and stars hold the horizon.',
  size: { w: 80, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: 10,
  glyphs: 'braille',
  canvas: 'line',
  palette: 'synthwave',
  params: { speed: { default: 1, min: 0.25, max: 3, label: 'Speed' } },
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer;
    const cv = ctx.canvas('line');
    const pal = ctx.palette();
    const n3 = ctx.noise.noise3;
    const { width: PW, height: PH } = cv;
    const ar = cv.aspect;
    const L = 10, spdW = 4.2 * ctx.param('speed', 1);
    const D = spdW * L;
    const F = PW * 0.5, hz = Math.max(1, Math.floor(PH * 0.42)), camH = 2.1;
    const znear = Math.max(1.2, ((camH * F) / ar) / Math.max(1, PH - hz - 1));
    const zfar = znear * 15;
    const ND = Math.max(5, Math.min(26, Math.round((PH - hz) / 5)));
    const zs = Float32Array.from({ length: ND }, (_, k) => 1 / (1 / znear + (k / (ND - 1)) * (1 / zfar - 1 / znear)));
    const minY = new Float32Array(PW);
    const ease = (k) => (th.mode === 'light' ? 1 - (1 - k) * (1 - k) : k);
    const cols = Array.from({ length: ND }, (_, k) => {
      const kf = k / (ND - 1);
      return lerpc(th.bg, pal(0.44 + 0.3 * (1 - kf) + (k % 3 === 0 ? 0.08 : 0)), ease(0.14 + 0.86 * Math.pow(1 - kf, 1.15)));
    });
    const Rs = Math.max(2, Math.min(PW * 0.2, hz * ar * 0.85));
    const cxs = PW * 0.5, cys = hz - (Rs / ar) * 0.1;
    const stars = Array.from({ length: 46 }, (_, i) => [Math.floor(hash2(i, 51) * PW), Math.floor(hash2(i, 52) * hz * 0.8), hash2(i, 53)]);
    return (t) => {
      const lt = t % L;
      const camZ = lt * spdW;
      const camX = Math.sin((TAU * lt) / L) * 2.4;
      cv.clear();
      minY.fill(PH * 4);
      for (let k = 0; k < ND; k++) {
        const z = zs[k], col = cols[k];
        const aa = (TAU * (camZ + z)) / D;
        const ca = Math.cos(aa) * 1.9, sa = Math.sin(aa) * 1.9;
        for (let x = 0; x < PW; x++) {
          const wx = ((x + 0.5 - PW / 2) * z) / F + camX;
          const nn = n3(wx * 0.14, ca, sa);
          let h = Math.max(0, 1 - Math.abs(nn) * 1.75);
          h = h * h * 3.6 * Math.min(1, Math.abs(wx) * 0.16 + 0.08);
          const y = hz + (((camH - h) * F) / z) / ar;
          if (y < minY[x] - 0.4 && y >= 0) cv.set(x, y, col);
          if (y < minY[x]) minY[x] = y;
        }
      }
      // striped sun and stars show only above the final silhouette
      const rTop = Math.max(0, Math.floor(cys - Rs / ar)), rBot = Math.floor(cys + Rs / ar);
      for (let yy = rTop; yy <= rBot; yy++) {
        const dyv = (yy - cys) * ar;
        if (Math.abs(dyv) > Rs || (yy & 1) === 1) continue;
        if (dyv > Rs * 0.05 && Math.floor((dyv / Rs) * 7) % 2 === 1) continue;
        const hw = Math.sqrt(Rs * Rs - dyv * dyv);
        const sc = pal(0.92 - ((dyv / Rs + 1) / 2) * 0.3);
        for (let xx = Math.max(0, Math.ceil(cxs - hw)); xx <= Math.min(PW - 1, cxs + hw); xx++) {
          if (yy < minY[xx] - 0.5) cv.set(xx, yy, sc);
        }
      }
      for (const [sx, sy, kk] of stars) {
        if (sy < minY[sx] - 1 && Math.sin(TAU * (lt / L) * (1 + Math.floor(kk * 3)) + kk * 20) > 0.2) {
          cv.set(sx, sy, lerpc(th.bg, pal(0.96), ease(0.4 + kk * 0.5)));
        }
      }
      cv.paint(b);
    };
  },
};

// ──────────────────────────────────────────────────────────  chrome horizon ──
const chromeHorizon = {
  id: 'retro-chrome-horizon',
  since: '0.3.0',
  title: 'Chrome Horizon',
  category: 'Outrun',
  kind: 'scene',
  order: 250,
  tags: ['chrome', 'logo', 'text', '80s', 'horizon', 'scanlines', 'glint', 'outrun'],
  description: 'An 80s chrome logo floats over a scanline dusk: sky-to-steel letter shading, a sweeping specular glint, star sparkles and a rippled mirror.',
  size: { w: 72, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: 10,
  canvas: 'field',
  palette: 'synthwave',
  params: { text: { default: 'PRISM', label: 'Text' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { width: PW, height: PH, px } = cv;
    const b = ctx.buffer;
    const L = 10;
    const txt = String(ctx.param('text', 'PRISM')).slice(0, 12) || 'PRISM';
    const hz = Math.max(2, Math.floor(PH * 0.64));
    let m = textMask(txt, { font: 'bold' });
    let { sx: spx, sy: spy } = fontPx(cv, Math.max(3, Math.min(9, Math.round(ctx.height * 0.4))));
    const ratio = Math.max(0.25, spy / Math.max(1, spx));
    while (m.w * spx > PW * 0.94 && spx > 1) { spx--; spy = Math.max(1, Math.round(spx * ratio)); }
    if (m.w * spx > PW * 0.98) { m = textMask(txt, { font: 'tiny' }); spx = 1; spy = Math.max(1, Math.round(ratio)); }
    const tiny = m.w * spx > PW;
    const tW = m.w * spx, tH = Math.max(1, m.h * spy);
    const tx0 = Math.max(0, Math.floor((PW - tW) / 2));
    const ty0 = Math.max(0, hz - tH - Math.max(1, Math.round(PH * 0.05)));
    const bit = (mx, my) => (mx < 0 || my < 0 || mx >= m.w || my >= m.h ? 0 : m.bits[my * m.w + mx]);
    const corners = [];
    for (let my = 0; my < m.h; my++) for (let mx = 0; mx < m.w; mx++) {
      if (m.bits[my * m.w + mx] && !bit(mx - 1, my) && !bit(mx, my - 1)) corners.push([mx, my, ctx.rng()]);
    }
    const sparkles = corners.filter((_, i) => i % Math.max(1, Math.floor(corners.length / 7)) === 0).slice(0, 7);
    const rim = 0x0d0618;
    const chrome = (v) => {
      if (v < 0.44) return lerpc(0x1b3f8f, 0xdef2ff, Math.pow(v / 0.44, 1.3));
      if (v < 0.52) return 0xffffff;
      const s = (v - 0.52) / 0.48;
      return Math.floor(s * 5) % 2 === 0 ? lerpc(0xffb24a, 0x6b2f0c, s) : lerpc(0xffd98a, 0x8a4a16, s);
    };
    const rowChrome = Int32Array.from({ length: tH }, (_, my) => chrome(my / Math.max(1, tH - 1)));
    const stars = Array.from({ length: Math.round(PW * 0.4) }, (_, i) => [Math.floor(hash2(i, 61) * PW), Math.floor(hash2(i, 62) * hz * 0.9), hash2(i, 63)]);
    return (t) => {
      const lt = t % L;
      const shift = Math.floor((lt / L) * 36);
      for (let y = 0; y < PH; y++) {
        let c;
        if (y < hz) {
          c = lerpc(pal(0.05), pal(0.4), Math.pow(y / hz, 1.3));
          if ((y + shift) % 3 === 0) c = lerpc(c, 0x000000, 0.22);
        } else if (y === hz) c = pal(0.85);
        else {
          const k = (y - hz) / Math.max(1, PH - hz);
          c = lerpc(0x0c0618, 0x1e0f30, k);
          if ((y - hz) % 4 === 0) c = lerpc(c, pal(0.6), 0.12);
        }
        px.fill(c, y * PW, (y + 1) * PW);
      }
      for (const [sx, sy, kk] of stars) {
        if (Math.sin(TAU * (lt / L) * (1 + Math.floor(kk * 3)) + kk * 30) > 0) px[sy * PW + sx] = lerpc(px[sy * PW + sx], 0xffffff, 0.35 + kk * 0.4);
      }
      if (!tiny) {
        const g = fract(lt / (L / 2));
        for (let myp = 0; myp < tH; myp++) {
          const my = Math.floor(myp / spy);
          const y = ty0 + myp;
          if (y >= PH) break;
          for (let mxp = 0; mxp < tW; mxp++) {
            const mx = Math.floor(mxp / spx);
            if (!m.bits[my * m.w + mx]) continue;
            const edge = !bit(mx - 1, my) || !bit(mx + 1, my) || !bit(mx, my - 1) || !bit(mx, my + 1);
            let c = edge ? rim : rowChrome[myp];
            const d = mxp / tW + (myp / tH) * 0.35 - g * 1.6 + 0.3;
            if (!edge && Math.abs(d) < 0.045) c = lerpc(c, 0xffffff, 0.9);
            px[y * PW + tx0 + mxp] = c;
          }
        }
        const maxRy = Math.min(tH, PH - hz - 1);
        for (let ry = 0; ry < maxRy; ry++) {
          const myp = tH - 1 - ry;
          const y = hz + 1 + ry;
          const off = Math.round(Math.sin(ry * 0.9 + (TAU * lt * 2) / L) * 1.2);
          for (let mxp = 0; mxp < tW; mxp++) {
            const mx = Math.floor(mxp / spx), my = Math.floor(myp / spy);
            if (!m.bits[my * m.w + mx]) continue;
            const x = tx0 + mxp + off;
            if (x < 0 || x >= PW) continue;
            const i = y * PW + x;
            px[i] = lerpc(px[i], rowChrome[myp], 0.32 * (1 - ry / maxRy));
          }
        }
        for (const [mx, my, ph] of sparkles) {
          const tw = Math.max(0, Math.sin(TAU * ((lt / L) * 3 + ph)));
          if (tw < 0.55) continue;
          const sx = tx0 + mx * spx, sy = ty0 + my * spy;
          const len = 1 + Math.round(tw * 2);
          for (let d2 = -len; d2 <= len; d2++) {
            const k2 = 1 - Math.abs(d2) / (len + 1);
            if (sx + d2 >= 0 && sx + d2 < PW && sy >= 0 && sy < PH) px[sy * PW + sx + d2] = addc(px[sy * PW + sx + d2], 0xffffff, tw * k2 * 0.9);
            if (sy + d2 >= 0 && sy + d2 < PH && sx >= 0 && sx < PW) px[(sy + d2) * PW + sx] = addc(px[(sy + d2) * PW + sx], 0xffffff, tw * k2 * 0.7);
          }
        }
      }
      cv.paint(b);
      if (tiny) b.text(Math.max(0, Math.floor((ctx.width - txt.length) / 2)), Math.max(0, Math.floor(ctx.height * 0.4)), txt, pal(0.9));
    };
  },
};

// ───────────────────────────────────────────────────────────────  sun pulse ──
const sunPulse = {
  id: 'retro-sun-pulse',
  since: '0.3.0',
  title: 'Sun Pulse',
  category: 'Outrun',
  kind: 'scene',
  order: 260,
  tags: ['sun', 'pulse', 'retrowave', 'scanlines', 'beat', 'water', 'kick', 'outrun'],
  description: 'A giant striped retrowave sun breathes on the chiptune kick — shockwave rings roll off every beat across a scanline sky and shimmering sea.',
  size: { w: 64, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: SL,
  canvas: 'field',
  palette: 'sunset',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { width: PW, height: PH, px } = cv;
    const b = ctx.buffer;
    const hz = Math.max(1, Math.floor(PH * 0.62));
    const cxs = PW * 0.5;
    const R0 = Math.max(2, Math.min(PW * 0.34, hz * 0.88));
    const cys = hz - R0 * 0.16;
    const seaT = lerpc(0x180a28, 0x241233, 0.5);
    const corona = pal(0.8);
    const birds = PH >= 14;
    return (t) => {
      const s = songAt(t);
      const pulse = s.kick;
      const R = R0 * (1 + 0.07 * pulse);
      const rr = R * 1.08 + s.kickAge * PW * 0.42;
      const rw = 1.6 + pulse;
      const ringA = Math.exp(-s.kickAge * 2.1);
      const shift = Math.floor((t / SL) * 24);
      for (let y = 0; y < PH; y++) {
        const sky = y < hz;
        const yv = sky ? y + 0.5 : hz - 1 - (y - hz) * 0.92 + 0.5;
        const k = sky ? 0 : (y - hz) / Math.max(1, PH - hz);
        const rowBase = sky
          ? lerpc(pal(0.08), pal(0.46), Math.pow(y / hz, 1.25))
          : lerpc(lerpc(pal(0.08), pal(0.46), Math.pow(Math.min(1, Math.max(0, yv) / hz), 1.25)), seaT, 0.4);
        const scan = sky && (y + shift) % 2 === 0;
        const xoff = sky ? 0 : Math.sin((y - hz) * 1.6 + (TAU * t * 4) / SL) * (0.6 + k * 1.8);
        const dy = yv - cys;
        for (let x = 0; x < PW; x++) {
          const dx = x + xoff + 0.5 - cxs;
          const d = Math.sqrt(dx * dx + dy * dy);
          let c = rowBase;
          if (d < R) {
            const v = (dy / R + 1) / 2;
            const band = fract(v * 7 - (t / SL) * 3);
            if (band > (v - 0.44) * 1.35) c = lerpc(pal(0.97 - v * 0.42), 0xfff3c0, pulse * 0.3);
          } else if (d < R * 1.55) {
            c = addc(c, corona, Math.pow(1 - (d - R) / (R * 0.55), 2) * (0.18 + 0.3 * pulse));
          }
          if (Math.abs(d - rr) < rw) c = lerpc(c, 0xffe9b0, ringA * 0.6 * (1 - Math.abs(d - rr) / rw));
          if (scan) c = lerpc(c, 0x000000, 0.18);
          if (!sky) {
            c = lerpc(c, seaT, 0.3 + k * 0.3);
            if (hash2(x, y, Math.floor(t * 8) % 89) < 0.03 + 0.1 * pulse * (1 - k)) c = lerpc(c, pal(0.9), 0.4);
          } else if (hash2(x, y, Math.floor(t * 12) % 83) < 0.012) c = addc(c, 0xffffff, 0.06);
          px[y * PW + x] = c;
        }
      }
      if (birds) for (let k2 = 0; k2 < 2; k2++) {
        const u = fract(t / SL + k2 * 0.5);
        const bx = Math.floor(u * (PW + 10) - 5);
        const by = Math.floor(PH * (0.12 + 0.07 * k2) + Math.sin(TAU * u * 3) * 1.5);
        const wing = fract((t / SL) * 20) < 0.5 ? -1 : 0;
        for (const [ox, oy] of [[-2, wing], [-1, 0], [0, 1], [1, 0], [2, wing]]) {
          const x = bx + ox, y = by + oy;
          if (x >= 0 && x < PW && y >= 0 && y < Math.max(1, hz - 1)) px[y * PW + x] = 0x1a0a20;
        }
      }
      cv.paint(b);
    };
  },
};

export default [sunsetDrive, wireframe, chromeHorizon, sunPulse];
