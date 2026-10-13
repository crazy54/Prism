// Grids & Floorplans: a data-hall rack floorplan with inlet temperatures and
// airflow, and a warehouse floor of robots shuttling shelf pods.
import { mix, gradient } from '../../color.js';
import { glyphs, put, putR, safe, clamp, smooth, ATTR } from '../charts/_data.js';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];

const datacenter = {
  id: 'maps-datacenter',
  title: 'Data Hall Floorplan',
  category: 'Grids & Floorplans',
  description: 'A data-hall floorplan: rack rows with inlet temperatures, cold and hot aisles with moving airflow, CRAC units and a hotspot being cooled.',
  tags: ['datacenter', 'floorplan', 'racks', 'temperature', 'airflow'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 44, h: 12 },
  loop: 20,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const panelW = W >= 70 ? 22 : 0;
    const floorW = W - panelW;
    const racks = Math.max(6, Math.min(12, Math.floor((floorW - 8) / 4)));
    const rw = 4; // " 24" plus a gap
    const x0 = 4;
    // Layout: aisle, back-to-back rack pair, aisle, ... Aisles alternate cold and hot.
    const nRows = H >= 14 ? 6 : 4, pairs = nRows / 2;
    const ah = Math.max(1, Math.min(3, Math.floor((H - 2 - nRows) / (pairs + 1))));
    const aisles = [], rackYs = [];
    let yy = 1;
    for (let p = 0; p <= pairs; p++) {
      aisles.push({ y: yy, h: ah, cold: p % 2 === 0 });
      yy += ah;
      if (p < pairs) { rackYs.push(yy, yy + 1); yy += 2; }
    }
    const floorH = yy; // first row below the floor
    const heat = gradient([th.info, th.pos, th.warn, th.neg]);
    const base = ROWS.map((_, r) => Array.from({ length: 12 }, (_, i) => 21.5 + 2.2 * ctx.noise.noise2(r * 0.9 + 0.3, i * 0.45) + (i > 8 ? 0.8 : 0)));
    const HOT = [2, 6]; // row C, rack 07
    const temp = (r, i, lt) => {
      const d = Math.abs(r - HOT[0]) * 1.4 + Math.abs(i - HOT[1]);
      // The hotspot builds for 8 s, then the CRAC boost pulls it down.
      const k = lt < 8 ? smooth(lt / 8) : lt < 11 ? 1 : 1 - smooth(clamp((lt - 11) / 6, 0, 1));
      return base[r][i] + 11 * k * Math.exp(-d * d * 0.35) + 0.15 * Math.sin(lt * 2 + i + r);
    };
    return (t) => {
      const lt = t % 20;
      const boost = lt >= 9 && lt < 17;
      // Room outline.
      const fx1 = x0 + racks * rw + 1;
      b.text(1, 0, g.tl + g.h.repeat(fx1 - 2) + g.tr, th.line);
      for (let y = 1; y < floorH; y++) { b.set(1, y, g.v, th.line); b.set(fx1, y, g.v, th.line); }
      if (floorH < H) b.text(1, floorH, g.bl + g.h.repeat(fx1 - 2) + g.br, th.line);
      put(b, 3, 0, ` HALL 2 · ROWS A-${ROWS[nRows - 1]} `, fx1 - 4, th.muted);
      // Aisles with drifting airflow marks along their middle row.
      for (const a of aisles) {
        const c = a.cold ? mix(th.bg, th.info, 0.6) : mix(th.bg, th.neg, 0.5);
        const speed = a.cold ? (boost ? 9 : 5) : -4;
        const mid = a.y + Math.floor((a.h - 1) / 2);
        for (let y = a.y; y < a.y + a.h; y++) for (let x = x0; x < fx1 - 1; x++) {
          const ph = (((x - lt * speed + (y - mid) * 2) % 6) + 6) % 6;
          if (y === mid && ph < 1) b.set(x, y, a.cold ? (g.u ? '›' : '>') : (g.u ? '‹' : '<'), c, undefined, ATTR.BOLD);
          else if ((x + y) % 3 === 0) b.set(x, y, g.u ? '·' : '.', mix(th.bg, c, 0.45));
        }
        b.text(2, mid, a.cold ? 'C' : 'H', c, undefined, ATTR.BOLD);
      }
      // Racks with inlet temperature.
      let hottest = { v: 0 };
      for (let r = 0; r < nRows; r++) {
        const y = rackYs[r];
        b.text(2, y, ROWS[r], th.muted, undefined, ATTR.BOLD);
        for (let i = 0; i < racks; i++) {
          const v = temp(r, i, lt);
          if (v > hottest.v) hottest = { v, r, i };
          const k = clamp((v - 18) / 16, 0, 1);
          const bg = mix(th.bg, heat(k), 0.75);
          const x = x0 + i * rw;
          b.text(x, y, ` ${Math.round(v)} `.slice(0, rw - 1).padEnd(rw - 1), v > 30 ? 0xffffff : th.ink, bg, v > 30 ? ATTR.BOLD : 0);
        }
      }
      // CRAC units on the end walls.
      const fan = boost ? 96 : 62;
      for (const a of aisles) if (a.cold) for (let y = a.y; y < a.y + a.h; y++) b.set(fx1, y, g.u ? '█' : '#', boost ? th.info : mix(th.bg, th.info, 0.6));
      if (panelW) {
        const px = W - panelW + 1, pw = panelW - 1;
        let y = 0;
        b.text(px, y++, 'HALL 2', th.ink, undefined, ATTR.BOLD);
        const load = 412 + 6 * Math.sin(t * 0.5);
        put(b, px, y++, `IT load  ${load.toFixed(0)} kW`, pw, th.muted);
        put(b, px, y++, `PUE      ${(1.36 + (hottest.v > 28 ? 0.04 : 0)).toFixed(2)}`, pw, th.muted);
        y++;
        b.text(px, y++, 'HOTTEST INLET', th.dim);
        const hc = hottest.v > 30 ? th.neg : hottest.v > 27 ? th.warn : th.pos;
        put(b, px, y++, `${ROWS[hottest.r]}-${String(hottest.i + 1).padStart(2, '0')}  ${hottest.v.toFixed(1)}°C`, pw, hc, undefined, ATTR.BOLD);
        put(b, px, y++, hottest.v > 30 ? `${g.warn} above 30°C limit` : hottest.v > 27 ? 'rising' : 'within range', pw, hc);
        y++;
        b.text(px, y++, 'COOLING', th.dim);
        for (const name of ['CRAC-1', 'CRAC-2']) {
          if (y >= H) break;
          put(b, px, y++, `${name} fan ${fan}% ${boost ? g.up : ''}`, pw, boost ? th.info : th.muted);
        }
        if (y < H) put(b, px, y++, `supply ${boost ? '16.0' : '18.0'}°C`, pw, th.muted);
        if (H - 1 > y) {
          // Color key.
          const ky = H - 1;
          let x = b.text(px, ky, '18', th.dim);
          for (let k = 0; k < pw - 6; k++) b.set(x + k, ky, ' ', undefined, mix(th.bg, heat(k / (pw - 7)), 0.75));
          b.text(x + pw - 6, ky, '34', th.dim);
        }
      }
    };
  },
};

const warehouse = {
  id: 'maps-warehouse-bots',
  title: 'Warehouse Robots',
  category: 'Grids & Floorplans',
  description: 'A goods-to-person warehouse floor: robots loop the aisles carrying shelf pods to pick stations, with a fleet list of tasks and battery.',
  tags: ['warehouse', 'robots', 'fleet', 'grid', 'logistics'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 44, h: 12 },
  loop: 24,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const panelW = W >= 70 ? 24 : 0;
    const fw = W - panelW, fh = H - 1;
    // Pods sit in 2×(bw) blocks separated by one-cell aisles; stations line the left wall.
    const bw = 6, bh = 2, left = 6;
    const bx = (i) => left + 1 + i * (bw + 1), by = (j) => 1 + j * (bh + 1);
    const nx = Math.max(2, Math.floor((fw - left - 2) / (bw + 1))), ny = Math.max(2, Math.floor((fh - 2) / (bh + 1)));
    const aisleX = (i) => bx(i) - 1, aisleY = (j) => by(j) - 1;
    const stations = Array.from({ length: Math.min(4, ny) }, (_, k) => ({ id: `PS-${k + 1}`, y: aisleY(Math.round(((k + 0.5) / Math.min(4, ny)) * ny)) }));
    // Each robot loops a rectangle of aisles from its station out to a pod block and back.
    const bots = Array.from({ length: 8 }, (_, k) => {
      const st = stations[k % stations.length];
      const tx = 1 + ((k * 3) % (nx - 1)), ty = clamp(Math.round((st.y - 1) / (bh + 1)) + ((k % 3) - 1), 0, ny - 1);
      const x0 = aisleX(0), x1 = aisleX(tx + 1), y0 = Math.min(st.y, aisleY(ty)), y1 = Math.max(st.y, aisleY(ty + 1));
      const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const per = 2 * (x1 - x0) + 2 * (y1 - y0);
      return { id: `R-${String(k + 1).padStart(2, '0')}`, rect, per, ph: ctx.rng(), speed: 5 + ctx.rng() * 3, st, pod: `P-${String(10 + tx * ny + ty).padStart(3, '0')}`, bat: 38 + ctx.rng.int(0, 58) };
    });
    const posOn = (bot, d) => {
      let s = ((d % bot.per) + bot.per) % bot.per;
      const [[x0, y0], [x1], [, y1]] = bot.rect;
      const w = x1 - x0, h = y1 - y0;
      if (s < w) return [x0 + s, y0, 'r'];
      s -= w; if (s < h) return [x1, y0 + s, 'd'];
      s -= h; if (s < w) return [x1 - s, y1, 'l'];
      s -= w; return [x0, y1 - s, 'u'];
    };
    const colors = [th.accent, th.info, th.pos, th.warn, th.crit, th.neg, th.accent, th.info];
    return (t) => {
      // Floor grid: pods and aisles.
      const podC = mix(th.bg, th.muted, 0.38);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
        const x = bx(i) + xx, y = by(j) + yy;
        if (x < fw && y < fh) b.set(x, y, g.u ? '▒' : ':', podC);
      }
      for (const s of stations) {
        b.text(0, s.y, s.id, th.ink, mix(th.bg, th.accent, 0.3), ATTR.BOLD);
        b.set(5, s.y, g.u ? '▌' : '|', th.accent);
      }
      const rows = [];
      bots.forEach((bot, k) => {
        const d = t * bot.speed + bot.ph * bot.per;
        const [x, y, dir] = posOn(bot, d);
        for (let k2 = 1; k2 <= 3; k2++) {
          const [tx, ty] = posOn(bot, d - k2);
          if (tx < fw && ty < fh) b.set(tx, ty, g.u ? '·' : '.', mix(th.bg, colors[k], 0.6 - k2 * 0.15));
        }
        const carrying = dir === 'l' || dir === 'u';
        const glyph = g.u ? ({ r: '▶', l: '◀', u: '▲', d: '▼' })[dir] : ({ r: '>', l: '<', u: '^', d: 'v' })[dir];
        if (x < fw && y < fh) b.set(x, y, glyph, carrying ? th.bg : colors[k], carrying ? colors[k] : undefined, ATTR.BOLD);
        rows.push({ bot, k, carrying });
      });
      if (panelW) {
        const px = fw + 1;
        b.text(px, 0, 'FLEET', th.ink, undefined, ATTR.BOLD);
        putR(b, W, 0, `${bots.length} active`, th.muted);
        rows.slice(0, H - 3).forEach(({ bot, k, carrying }, i) => {
          const y = 1 + i;
          b.set(px, y, g.dot, colors[k]);
          b.text(px + 2, y, bot.id, th.ink);
          put(b, px + 7, y, carrying ? `${bot.pod}${g.u ? '→' : '>'}${bot.st.id}` : `to ${bot.pod}`, 11, carrying ? th.ink : th.muted);
          const bat = Math.round(bot.bat - (t % 24) * 0.2);
          putR(b, W, y, `${bat}%`, bat < 30 ? th.neg : bat < 50 ? th.warn : th.dim);
        });
        const picks = 1840 + Math.floor(t * 1.7);
        put(b, px, H - 2, `picks today ${picks.toLocaleString('en-US')}`, W - px, th.muted);
      }
      put(b, 0, H - 1, `Zone B · ${nx * ny} pod blocks · ${stations.length} pick stations`, fw, th.dim);
    };
  },
};

export default [datacenter, warehouse];
