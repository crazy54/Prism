// Outrun nights, three ways: the cabin view of a rainy drive with a working
// wiper; a per-pixel neon highway tunnel flying past; and a night dashboard
// with real gauge needles, gear shifts and blinking indicators.
import { lerpc, fract, hash2 } from './_kit.js';
import { light } from '../charts/_data.js';

const TAU = Math.PI * 2;
const addc = (a, b, k) => {
  if (k <= 0) return a;
  const r = Math.min(255, ((a >> 16) & 255) + ((b >> 16) & 255) * k);
  const g = Math.min(255, ((a >> 8) & 255) + ((b >> 8) & 255) * k);
  const bl = Math.min(255, (a & 255) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
};

// ──────────────────────────────────────────────────────────────  rain drive ──
const rainDrive = {
  id: 'retro-rain-drive',
  since: '0.3.0',
  title: 'Rain Drive',
  category: 'Outrun',
  kind: 'scene',
  order: 210,
  tags: ['rain', 'night', 'drive', 'wiper', 'windshield', 'neon', 'tail-lights', 'outrun'],
  description: 'Behind the windshield on a rainy night drive: smeared tail-lights, passing lamps, rain streaks, drops that regrow after every wiper sweep.',
  size: { w: 80, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: 12.8,
  canvas: 'field',
  palette: 'synthwave',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { width: PW, height: PH, px } = cv;
    const L = 12.8, Tw = 1.6;
    const hy = Math.max(1, Math.floor(PH * 0.52));
    const dashH = Math.max(1, Math.round(PH * 0.09));
    const cx = PW * 0.5;
    const rowC = new Int32Array(PH);
    const skyHz = lerpc(0x241238, pal(0.5), 0.3);
    for (let y = 0; y < PH; y++) {
      rowC[y] = y < hy
        ? lerpc(0x04030a, skyHz, Math.pow(y / hy, 1.35))
        : lerpc(0x0a0812, 0x171120, (y - hy) / Math.max(1, PH - hy));
    }
    const blob = (bx, by, r, c, k) => {
      const x0 = Math.max(0, Math.floor(bx - r)), x1 = Math.min(PW - 1, Math.ceil(bx + r));
      const y0 = Math.max(0, Math.floor(by - r)), y1 = Math.min(PH - 1, Math.ceil(by + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - bx, dy = y + 0.5 - by;
        const d2 = (dx * dx + dy * dy) / (r * r);
        if (d2 < 1) { const i = y * PW + x; px[i] = addc(px[i], c, k * (1 - d2) * (1 - d2)); }
      }
    };
    const smear = (bx, c, k, lt) => {
      const x = Math.round(bx), len = Math.max(2, Math.round((PH - hy) * 0.8));
      for (let d = 0; d < len; d++) {
        const y = hy + d;
        if (y >= PH) break;
        const xx = x + Math.round(Math.sin(d * 1.1 + (TAU * lt * 16) / L) * 0.8);
        const f = k * Math.exp(-d / (len * 0.5));
        for (let o = -1; o <= 1; o++) {
          const x2 = xx + o;
          if (x2 >= 0 && x2 < PW) px[y * PW + x2] = addc(px[y * PW + x2], c, f * (o ? 0.35 : 1));
        }
      }
    };
    const NR = Math.max(20, Math.round((PW * PH) / 80));
    const rain = Array.from({ length: NR }, (_, i) => ({
      x0: hash2(i, 1) * PW, y0: hash2(i, 2) * PH,
      kf: 12 + Math.floor(hash2(i, 3) * 9), kw: 1 + Math.floor(hash2(i, 4) * 2),
      br: 0.1 + hash2(i, 5) * 0.16,
    }));
    const pivot = { x: cx, y: PH * 1.32 };
    const Lw = PH * 1.22;
    const th0 = -0.62, th1 = 0.62;
    const ND = Math.max(14, Math.round((PW * PH) / 115));
    const drops = Array.from({ length: ND }, (_, i) => {
      const x = hash2(i, 6) * PW, y = hash2(i, 7) * PH * 0.94;
      const ang = Math.atan2(x - pivot.x, pivot.y - y);
      const rad = Math.hypot(x - pivot.x, pivot.y - y);
      const a01 = (ang - th0) / (th1 - th0);
      return { x: Math.floor(x), y: Math.floor(y), a01, wiped: rad < Lw && a01 > 0 && a01 < 1, k: hash2(i, 8) };
    });
    const b = ctx.buffer;
    return (t) => {
      const lt = t % L;
      for (let y = 0; y < PH; y++) px.fill(rowC[y], y * PW, (y + 1) * PW);
      // the car ahead: twin tail-lights, bobbing, braking once a loop
      const bob = Math.sin((TAU * lt) / 3.2) * PH * 0.012;
      const brake = lt > 7.9 && lt < 9.3;
      for (const s of [-1, 1]) {
        const bx = cx + s * PW * 0.078, by = hy - PH * 0.04 + bob;
        blob(bx, by, PW * 0.05, 0xff2432, 0.22);
        blob(bx, by, Math.max(1, PW * (brake ? 0.03 : 0.021)), brake ? 0xff3846 : 0xd81e30, brake ? 1 : 0.8);
        smear(bx, 0xd81e30, brake ? 0.5 : 0.3, lt);
      }
      // oncoming headlights, one car every 3.2 s
      const ph = fract(lt / 3.2);
      const ox = cx - (0.06 + ph * ph * 0.46) * PW, oy2 = hy - PH * 0.02 + ph * PH * 0.15;
      const orr = 0.6 + ph * ph * PW * 0.03;
      for (const s of [-1, 1]) blob(ox + s * orr * 1.3, oy2, orr, 0xfff2d8, 0.9);
      blob(ox, oy2, orr * 3.2, 0xffe9c0, 0.16 + ph * 0.1);
      smear(ox, 0xffe9c0, 0.28 + ph * 0.25, lt);
      // sodium lamps sail overhead, alternating sides
      const phL = fract(lt / 1.6), side = Math.floor(lt / 1.6) % 2 ? -1 : 1;
      const lx = cx + side * (0.04 + Math.pow(phL, 1.7) * 0.58) * PW, ly = hy - PH * (0.06 + phL * 0.3);
      blob(lx, ly, 0.6 + phL * 2.4, 0xffbe5a, 0.8);
      blob(lx, ly, (0.6 + phL * 2.4) * 2.6, 0xffbe5a, 0.1);
      smear(lx, 0xffbe5a, 0.18, lt);
      // rain, slanted with the car's speed
      for (const p of rain) {
        const yy = (p.y0 + (lt / L) * p.kf * PH) % PH;
        const xx = (p.x0 + (lt / L) * p.kw * PW) % PW;
        for (let d = 0; d < 3; d++) {
          const y = Math.floor(yy) - d, x = Math.floor(xx) + (d >> 1);
          if (x >= 0 && x < PW && y >= 0 && y < PH) px[y * PW + x] = addc(px[y * PW + x], 0xaac8e8, d ? p.br * 0.5 : p.br);
        }
      }
      // drops on the glass grow back after each wiper pass
      const u = fract(lt / Tw);
      for (const d of drops) {
        let vis = 0.55 + 0.45 * Math.sin(TAU * d.k + (TAU * lt) / L);
        if (d.wiped) {
          const u1 = d.a01 / 2, u2 = 1 - d.a01 / 2;
          const since = Math.min(fract(u - u1), fract(u - u2)) * Tw;
          vis = Math.min(1, since / 1.3);
        }
        if (vis < 0.12) continue;
        const i = d.y * PW + d.x;
        px[i] = addc(px[i], 0xcfe4ff, 0.12 + 0.3 * vis);
        if (vis > 0.82 && d.y + 1 < PH) px[i + PW] = addc(px[i + PW], 0xcfe4ff, 0.1);
      }
      // the wiper arm, always on top
      const sw = u < 0.5 ? u * 2 : 2 - u * 2;
      const ang = th0 + (th1 - th0) * sw;
      const dirx = Math.sin(ang), diry = -Math.cos(ang);
      for (let i = 0; i < Lw; i++) {
        const X = Math.floor(pivot.x + dirx * i), Y = Math.floor(pivot.y + diry * i);
        if (Y < 0 || Y >= PH) continue;
        const arm = i > Lw * 0.45;
        for (let o = 0; o < 2; o++) if (X + o >= 0 && X + o < PW) px[Y * PW + X + o] = arm ? 0x05060c : 0x0a0b12;
      }
      // dashboard silhouette
      for (let y = PH - dashH; y < PH; y++) px.fill(0x070609, y * PW, (y + 1) * PW);
      const gy = PH - Math.max(1, dashH >> 1) - 0;
      blob(PW * 0.18, gy, 1.4, 0x3ae0ff, 0.5);
      if (fract(lt) < 0.5) blob(PW * 0.82, gy, 1.1, 0xffbe5a, 0.5);
      cv.paint(b);
    };
  },
};

// ──────────────────────────────────────────────────────────────  neon tunnel ──
const neonTunnel = {
  id: 'retro-neon-tunnel',
  since: '0.3.0',
  title: 'Neon Tunnel',
  category: 'Outrun',
  kind: 'scene',
  order: 220,
  tags: ['tunnel', 'neon', 'highway', 'ribs', 'perspective', 'drive', 'outrun', 'synthwave'],
  description: 'Flying down a neon highway tunnel: magenta and cyan light ribs sweep past over a dashed roadway, swaying through a long S-curve.',
  size: { w: 80, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: 8,
  canvas: 'field',
  palette: 'synthwave',
  params: { speed: { default: 1, min: 0.25, max: 3, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: PW, height: PH, px, aspect } = cv;
    const F = PW * 0.52, cx = PW / 2;
    const cyv = PH * 0.52 * aspect;
    const A = 1.05, Bt = 0.8, Bf = 0.85, oyc = 0.22;
    const RS = 2, S = 6 * speed, D = 48 * speed;
    const bloomC = pal(0.82);
    const b = ctx.buffer;
    return (t) => {
      const camZ = t * S;
      const ox = Math.sin((TAU * camZ) / D) * 0.34;
      const lean = Math.cos((TAU * camZ) / D) * 0.03;
      for (let y = 0, i = 0; y < PH; y++) {
        const dy = ((y + 0.5) * aspect - cyv) / F;
        for (let x = 0; x < PW; x++, i++) {
          const dx = (x + 0.5 - cx) / F + lean;
          const zx = dx > 1e-6 ? (A - ox) / dx : dx < -1e-6 ? (-A - ox) / dx : 1e9;
          const zy = dy > 1e-6 ? (Bf - oyc) / dy : dy < -1e-6 ? (-Bt - oyc) / dy : 1e9;
          const wall = zx < zy;
          const z = wall ? zx : zy;
          const w = camZ + z;
          const fog = Math.exp(-z / 24);
          let c;
          if (!wall && dy > 0) {
            const xw = ox + dx * z;
            c = Math.abs(xw) < 0.82 ? 0x0d0c13 : 0x120a1c;
            if (Math.abs(xw) < 0.03 && fract(w / 2.4) < 0.45) c = lerpc(c, 0xffd27a, fog);
            if (Math.abs(Math.abs(xw) - 0.68) < 0.03) c = lerpc(c, 0x9a4fd8, fog * 0.8);
          } else if (!wall) {
            const xw = ox + dx * z;
            c = 0x070510;
            if (Math.abs(xw) < 0.12 && fract(w / 4) < 0.2) c = lerpc(c, 0xcfe9ff, fog);
          } else c = 0x0b0714;
          const fr = fract(w / RS);
          const dRib = Math.min(fr, 1 - fr) * RS;
          const edge = Math.max(0, 1 - dRib / 0.09);
          const halo = Math.exp(-dRib * 2.6) * 0.3;
          c = addc(c, Math.floor(w / RS) & 1 ? 0xff2f9e : 0x25d8f0, (edge * edge + halo) * fog);
          if (z > 30) c = lerpc(c, bloomC, Math.min(1, (z - 30) / 26) * 0.9);
          px[i] = c;
        }
      }
      cv.paint(b);
    };
  },
};

// ───────────────────────────────────────────────────────────  night dashboard ──
const nightDash = {
  id: 'retro-night-dash',
  since: '0.3.0',
  title: 'Night Dashboard',
  category: 'Outrun',
  kind: 'scene',
  order: 230,
  tags: ['dashboard', 'speedometer', 'tachometer', 'gauges', 'cockpit', 'drive', 'night', 'outrun'],
  description: 'A night cockpit: speedo and tach needles ride a cruise with real gear shifts, indicators blink, and oncoming lights drift past the glass.',
  size: { w: 76, h: 20 },
  minSize: { w: 26, h: 9 },
  loop: 12,
  canvas: 'line',
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const cv = ctx.canvas('line');
    const L = 12;
    const ws = H >= 14 ? Math.floor(H * 0.26) : 0;
    const gh = H - ws - 1;
    const lcdY = H - 1;
    const gcy = ws + gh * 0.74;
    const R = Math.max(2.6, Math.min(W * 0.2, (gh - 1.6) * 1.75));
    const SPAN = 2.05;
    const g1x = W * 0.25, g2x = W * 0.75;
    const at = (gx, p, r) => {
      const aa = -SPAN + p * 2 * SPAN;
      return [(gx + r * Math.sin(aa)) * cv.sx, (gcy - (r * Math.cos(aa)) / 2) * cv.sy];
    };
    const panel = lerpc(th.bg, th.panel, 0.85);
    const tickD = lerpc(panel, th.ink, 0.5), tickM = lerpc(panel, th.ink, 0.85);
    const needleC = th.warn;
    const glass = 0x060910;
    const TH = [0, 48, 82, 122, 168, 240];
    const spd = (tt) => 126 + 58 * Math.sin((TAU * tt) / L) + 16 * Math.sin((2 * TAU * tt) / L + 1.1);
    const city = Array.from({ length: 12 }, (_, k) => [Math.floor(hash2(k, 31) * W), Math.max(0, Math.floor(hash2(k, 32) * Math.max(1, ws - 1))), hash2(k, 33)]);
    const lcd = lerpc(th.bg, 0x05080a, th.mode === 'light' ? 0.75 : 0.5);
    const labels = W >= 44;
    const gauge = (gx, max, val, redFrom, step, major) => {
      for (let v2 = 0; v2 <= max; v2 += step) {
        const p = v2 / max, isMaj = v2 % major === 0;
        const col = v2 >= redFrom ? th.neg : isMaj ? tickM : tickD;
        const [x0, y0] = at(gx, p, R * (isMaj ? 0.76 : 0.84));
        const [x1, y1] = at(gx, p, R * 0.95);
        cv.line(x0, y0, x1, y1, col);
      }
      const p = Math.max(0, Math.min(1, val / max));
      const [nx0, ny0] = at(gx, p, R * 0.08), [nx1, ny1] = at(gx, p, R * 0.97);
      cv.line(nx0, ny0, nx1, ny1, needleC);
      cv.line(nx0 + 1, ny0, nx1 + 1, ny1, needleC);
      cv.ellipse(gx * cv.sx, gcy * cv.sy, R * 0.1 * cv.sx, (R * 0.05 * cv.sy) / 2, tickM, true);
    };
    return (t) => {
      const lt = t % L;
      const v = spd(t);
      let g = 1;
      while (g < 5 && v >= TH[g]) g++;
      const rpm = 1.1 + ((v - TH[g - 1]) / (TH[g] - TH[g - 1])) * 5.4;
      if (ws) {
        b.fill(0, 0, W, ws, ' ', th.ink, glass);
        for (const [sx2, sy2, kk] of city) if (Math.sin(TAU * (lt / L) * (1 + Math.floor(kk * 3)) + kk * 25) > -0.2) b.set(sx2, sy2, '·', lerpc(glass, 0xd8e8ff, 0.4 + kk * 0.35));
        for (let k = 0; k < 3; k++) {
          const ph = fract(lt / 4 + k / 3);
          const x = Math.round(W * (0.52 - 0.48 * Math.pow(ph, 1.4)));
          const y = Math.min(ws - 1, Math.round((ws - 1) * (0.3 + ph * 0.7)));
          b.set(x, y, '●', lerpc(glass, 0xffe9b8, 0.25 + ph * 0.75));
          if (ph > 0.3 && x + 1 < W) b.set(x + 1, y, '─', lerpc(glass, 0xffe9b8, ph * 0.4));
        }
      }
      b.fill(0, ws, W, Math.max(1, H - ws - 1), ' ', th.ink, panel);
      cv.clear();
      gauge(g1x, 280, v, 999, 20, 40);
      gauge(g2x, 8, rpm, 6.5, 0.5, 1);
      cv.paint(b);
      if (labels) {
        for (const vl of [0, 80, 160, 240]) {
          const [x, y] = at(g1x, vl / 280, R * 0.58);
          const sVal = String(vl);
          b.text(Math.round(x / cv.sx - sVal.length / 2), Math.floor(y / cv.sy), sVal, lerpc(panel, th.ink, 0.75), panel);
        }
        for (let vl = 0; vl <= 8; vl += 2) {
          const [x, y] = at(g2x, vl / 8, R * 0.58);
          b.text(Math.round(x / cv.sx), Math.floor(y / cv.sy), String(vl), vl >= 7 ? th.neg : lerpc(panel, th.ink, 0.75), panel);
        }
      }
      const mx = Math.round(W / 2);
      const dy0 = ws + Math.max(1, Math.floor(gh * 0.3));
      const sv = String(Math.round(v)).padStart(3);
      b.text(mx - 3, dy0, sv, light(th), panel);
      b.text(mx + 1, dy0, 'km/h'.slice(0, Math.max(0, W - mx - 2)), lerpc(panel, th.muted, 1), panel);
      b.text(mx - 2, dy0 + 1, `G${g}`, th.accent, panel);
      if (W >= 34 && dy0 + 2 < lcdY) b.text(mx - 2, dy0 + 2, `${rpm.toFixed(1)}k`, lerpc(panel, th.muted, 1), panel);
      const lOn = lt >= 2 && lt < 4.5 && fract(lt * 1.5) < 0.5;
      const rOn = lt >= 7.5 && lt < 10 && fract(lt * 1.5) < 0.5;
      b.text(1, ws, '◀', lOn ? th.pos : lerpc(panel, th.pos, 0.3), panel);
      b.text(W - 2, ws, '▶', rOn ? th.pos : lerpc(panel, th.pos, 0.3), panel);
      b.fill(0, lcdY, W, 1, ' ', th.warn, lcd);
      const trip = `TRIP 412.${Math.floor(fract(t / L) * 10)}km`;
      const info = W >= 54 ? `${trip}  FUEL ▮▮▮▮░  OUT 9°C  22:41` : trip;
      b.text(1, lcdY, info.slice(0, W - 2), th.warn, lcd);
      const hb = 'HI-BEAM';
      if (W >= 70) b.text(W - hb.length - 1, lcdY, hb, lerpc(lcd, th.info, 0.8), lcd);
    };
  },
};

export default [rainDrive, neonTunnel, nightDash];
