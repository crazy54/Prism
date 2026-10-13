// Wireworld on a generated circuit board. Clock loops (cut-corner rings, each
// carrying one electron, period = ring length) fire pulses down tapped traces
// that a router lays out PCB-style — straight runs, diagonal corners, fan-out
// branches — keeping every trace clear of every other. Rules: head → tail,
// tail → copper, copper → head when one or two neighbors are heads.
import { NONE, mix } from '../../color.js';

const EMPTY = 0, WIRE = 1, HEAD = 2, TAIL = 3;
const D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export default {
  title: 'Wireworld',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['wireworld', 'cellular automata', 'circuit', 'electrons', 'pcb', 'clock'],
  order: 30,
  description: 'Wireworld on a generated circuit board: clock loops fire electrons down routed traces that fan out across it.',
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: 12,
  canvas: 'field',
  palette: 'theme',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, px = cv.px, th = ctx.theme, rand = ctx.rng;
    const gps = 14 * ctx.param('speed', 1);
    let cur = new Uint8Array(W * H), nxt = new Uint8Array(W * H);
    const taken = new Uint8Array(W * H); // occupied or reserved by a clock
    const inside = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
    const at = (x, y) => y * W + x;
    // A cell may be laid if all its neighbors are empty except the `allow` cells.
    const clear = (x, y, allow) => {
      if (!inside(x, y) || taken[at(x, y)]) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        if (taken[at(X, Y)] && !allow.includes(at(X, Y))) return false;
      }
      return true;
    };
    const lay = (x, y) => { cur[at(x, y)] = WIRE; taken[at(x, y)] = 1; };
    const ends = []; // trace ends, drawn as vias

    // Route a trace from (x, y) heading d; returns cells laid.
    const route = (x, y, d, prev, budget, depth) => {
      const trail = [...prev];
      let run = 2 + Math.floor(rand() * 4), extra = [];
      for (let n = 0; n < budget; n++) {
        let moved = false;
        // Keep going straight for the rest of the run, turning only when forced;
        // after a run, prefer a turn. (A trunk just past a branch must go straight.)
        const side = rand() < 0.5 ? 1 : 3, other = 4 - side;
        const options = run > 0 ? (extra.length ? [0] : [0, side, other]) : [side, 0, other];
        for (const turn of options) {
          let nx, ny, nd = (d + turn) & 3;
          if (turn) { nx = x + D4[d][0] + D4[nd][0]; ny = y + D4[d][1] + D4[nd][1]; } // diagonal corner
          else { nx = x + D4[d][0]; ny = y + D4[d][1]; }
          if (!clear(nx, ny, [...trail.slice(-2), ...extra])) continue;
          lay(nx, ny); trail.push(at(nx, ny)); x = nx; y = ny; d = nd; moved = true; extra = [];
          run = turn ? 2 + Math.floor(rand() * 5) : run - 1;
          break;
        }
        if (!moved) break;
        // Occasionally fan out a branch at right angles.
        if (depth < 3 && n > 2 && rand() < 0.1) {
          const bd = (d + (rand() < 0.5 ? 1 : 3)) & 3, bx = x + D4[bd][0], by = y + D4[bd][1];
          const allow = trail.slice(-3);
          // The branch's first cell sits diagonal to the trunk's next cell, so let the trunk pass it.
          if (clear(bx, by, allow)) { lay(bx, by); extra = [at(bx, by)]; run = Math.max(run, 1); route(bx, by, bd, [...allow, at(bx, by)], Math.floor(budget * 0.5), depth + 1); }
        }
      }
      if (trail.length) ends.push([x, y]);
      return trail;
    };

    // Clocks: cut-corner rings with one electron and a tap from a side.
    const clocks = Math.max(1, Math.min(7, Math.round((W * H) / 700)));
    for (let c = 0; c < clocks; c++) {
      for (let tries = 0; tries < 30; tries++) {
        // Small boards get small clocks and a one-cell margin.
        const m = W < 30 || H < 14 ? 1 : 2;
        const w = (m === 1 ? 4 : 5) + Math.floor(rand() * 5), h = (m === 1 ? 2 : 3) + Math.floor(rand() * 3);
        const x0 = m + Math.floor(rand() * Math.max(1, W - w - 2 * m)), y0 = m + Math.floor(rand() * Math.max(1, H - h - 2 * m));
        let ok = x0 + w < W - m && y0 + h < H - m;
        for (let y = y0 - 1; ok && y <= y0 + h + 1; y++) for (let x = x0 - 1; x <= x0 + w + 1; x++) if (taken[at(x, y)]) { ok = false; break; }
        if (!ok) continue;
        const ring = [];
        for (let x = x0 + 1; x < x0 + w; x++) ring.push([x, y0]);
        for (let y = y0 + 1; y < y0 + h; y++) ring.push([x0 + w, y]);
        for (let x = x0 + w - 1; x > x0; x--) ring.push([x, y0 + h]);
        for (let y = y0 + h - 1; y > y0; y--) ring.push([x0, y]);
        for (const [x, y] of ring) lay(x, y);
        for (let y = y0; y <= y0 + h; y++) for (let x = x0; x <= x0 + w; x++) taken[at(x, y)] = 1; // keep the interior clear
        cur[at(...ring[1])] = HEAD; cur[at(...ring[0])] = TAIL;
        // Tap out of the middle of the right or left side.
        const right = x0 + w < W * 0.6, ym = y0 + (h >> 1);
        const tx = right ? x0 + w + 1 : x0 - 1, d = right ? 0 : 2;
        const allow = [at(right ? x0 + w : x0, ym - 1), at(right ? x0 + w : x0, ym), at(right ? x0 + w : x0, ym + 1)];
        if (clear(tx, ym, allow)) { lay(tx, ym); route(tx, ym, d, [...allow, at(tx, ym)], W + H, 0); }
        break;
      }
    }

    const copper = mix(th.bg, 0xc8873e, 0.45), via = mix(th.bg, 0xe8c27a, 0.8), headC = mix(0x9fe8ff, th.ink, 0.2), tailC = 0xff7a3c;
    let acc = 0;
    const step = () => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, s = cur[i];
        if (s === EMPTY) { nxt[i] = EMPTY; continue; }
        if (s === HEAD) { nxt[i] = TAIL; continue; }
        if (s === TAIL) { nxt[i] = WIRE; continue; }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const Y = y + dy;
          if (Y < 0 || Y >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx;
            if (X >= 0 && X < W && cur[Y * W + X] === HEAD) n++;
          }
        }
        nxt[i] = n === 1 || n === 2 ? HEAD : WIRE;
      }
      [cur, nxt] = [nxt, cur];
    };

    return (t, dt) => {
      acc += Math.min(0.25, Math.max(0, dt)) * gps;
      for (let k = 0; acc >= 1 && k < 8; k++, acc--) step();
      if (acc > 8) acc = 0;
      for (let i = 0; i < W * H; i++) {
        const s = cur[i];
        px[i] = s === EMPTY ? NONE : s === WIRE ? copper : s === HEAD ? headC : tailC;
      }
      // Vias where traces end (drawing only — not part of the automaton).
      for (const [x, y] of ends) if (cur[at(x, y)] === WIRE) px[at(x, y)] = via;
      cv.paint(ctx.buffer);
    };
  },
};
