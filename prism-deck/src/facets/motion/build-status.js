// alert-build — a build light. A three-lamp stack light (red · amber · green) beside the
// pipeline, its build number and the result. Running: the amber lamp's beacon turns (a band
// of light sweeps the lens, 6 fps) and the elapsed time counts. Passed: green, steady. Failed:
// red, breathing 1 Hz for 10 s then holding (and a notch: never color alone). States come
// from CI through the runtime (or MCP); a press cycles them by hand.

import { surface, rect, path, n, P, linearGradient, url } from '../../scene/index.js';
import { clamp, pulse, phase, lerp, outExpo } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, isBig, mmss } from '../apps/_d7-kit.js';

const LAMPS = [{ key: 'neg', state: 'failed' }, { key: 'warn', state: 'running' }, { key: 'pos', state: 'passed' }];
const WORD = { running: 'Running', passed: 'Passed', failed: 'Failed' };
const SHORT = { running: 'Run', passed: 'Pass', failed: 'Fail' };

const ago = (s) => (s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);

export default {
  id: 'alert-build',
  title: 'Build Light',
  category: 'Alerts & Attention',
  description: 'A CI stack light: the amber beacon turns while a build runs, green holds when it passes, red breathes then holds when it fails — with the pipeline and build number.',
  tags: ['build', 'ci', 'pipeline', 'status', 'deploy', 'tests', 'stack light', 'dev'],
  surface: 'key',
  fps: 6,
  loop: 2.4,
  states: ['running', 'passed', 'failed'],
  tones: { running: 'busy', passed: 'ok', failed: 'neg' },
  press: 'cycle',
  params: {
    pipeline: { type: 'text', default: 'main', maxLength: 14, label: 'Pipeline' },
    build: { type: 'number', default: 1284, min: 0, max: 999999, step: 1, label: 'Build number' },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const st = ctx.stateName || 'running';
    k.background({ tone: ctx.tone });
    const big = isBig(k);
    const arrive = ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.4));
    // the tower: three lenses on a dark column, left of center
    const s = k.m.safe;
    const tw = Math.round(w * (big ? 0.22 : 0.28)), th = h - s * 2 - (big ? 0 : 0);
    const tx = s + (big ? u * 1 : 0), ty = s;
    const lensH = (th - u * 4) / 3, lensW = tw - u * 3.2;
    const body = k.dark ? mix(C.surface2, '#000000', 0.5) : mix(C.surface2, C.line, 0.5);
    k.add(rect({ x: n(tx), y: n(ty), width: n(tw), height: n(th), rx: n(Math.min(tw * 0.3, k.m.radius * 0.7)), fill: body, stroke: C.line, strokeWidth: n(Math.max(1, u * 0.8)) }));
    const breath = st === 'failed' && !ctx.reduced && ctx.since < 10 ? lerp(0.55, 1, pulse(ctx.t, 1)) : 1;
    LAMPS.forEach((L, i) => {
      const lx = tx + (tw - lensW) / 2, ly = ty + u * 1.6 + i * (lensH + u * 0.4);
      const color = C[L.key];
      const on = L.state === st;
      const r = Math.min(lensW, lensH) * 0.32;
      const gid = k.id(`lens${i}`);
      if (on) {
        const a = arrive * breath;
        k.def(linearGradient(gid, [[0, mix(color, '#ffffff', k.dark ? 0.45 : 0.3)], [0.55, color], [1, mix(color, '#000000', 0.25)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
        k.add(rect({ x: n(lx - u * 1.6), y: n(ly - u * 1.2), width: n(lensW + u * 3.2), height: n(lensH + u * 2.4), rx: n(r * 1.4), fill: color, fillOpacity: n(0.16 * a * (k.dark ? 1 : 0.6), 3) }));
        k.add(rect({ x: n(lx), y: n(ly), width: n(lensW), height: n(lensH), rx: n(r), fill: url(gid), fillOpacity: a < 1 ? n(0.35 + 0.65 * a, 3) : undefined }));
        if (st === 'running' && !ctx.reduced) {
          // the turning beacon: a bright band sweeps the lens (and a faint one behind it)
          const p = phase(ctx.t, 1.2);
          const bxw = lensW * 0.34, bx = lx - bxw + (lensW + bxw) * p;
          const x0 = Math.max(lx, bx), x1 = Math.min(lx + lensW, bx + bxw);
          if (x1 - x0 > 0.5) k.add(rect({ x: n(x0), y: n(ly + u * 0.6), width: n(x1 - x0), height: n(lensH - u * 1.2), rx: n(Math.min(r, (x1 - x0) / 2)), fill: '#ffffff', fillOpacity: n(0.55 * Math.sin(Math.PI * p), 3) }));
        }
        // specular stripe
        k.add(rect({ x: n(lx + lensW * 0.18), y: n(ly + lensH * 0.16), width: n(lensW * 0.64), height: n(Math.max(1, lensH * 0.12)), rx: n(lensH * 0.06), fill: '#ffffff', fillOpacity: k.dark ? 0.55 : 0.6 }));
      } else {
        k.add(rect({ x: n(lx), y: n(ly), width: n(lensW), height: n(lensH), rx: n(r), fill: mix(body, color, k.dark ? 0.2 : 0.28), stroke: mix(body, color, 0.35), strokeWidth: n(Math.max(1, u * 0.6)) }));
      }
    });
    // the readout, right of the tower
    const x0 = tx + tw + u * (big ? 6 : 4), x1 = w - k.m.text, room = x1 - x0;
    const tone = st === 'passed' ? 'pos' : st === 'failed' ? 'neg' : 'warn';
    const ink = k.dark ? C[tone] : ctx.theme.spectral(st === 'passed' ? 150 : st === 'failed' ? 25 : 70, { tier: 'ink' });
    if (big) {
      text(k, ctx.params.pipeline, { x: x0, y: s + 9 * u, size: 8.5 * u, weight: 600, caps: true, tracking: 0.1, anchor: 'start', color: 'muted', maxWidth: room });
      text(k, `#${ctx.params.build}`, { x: x0, y: s + 22 * u, size: 12 * u, weight: 600, anchor: 'start', color: 'ink', tabular: true, maxWidth: room });
      text(k, WORD[st], { x: x0, y: h - s - 13 * u, size: 12 * u, weight: 700, anchor: 'start', color: ink, maxWidth: room, minSize: 8 * u });
      text(k, st === 'running' ? mmss(ctx.since) : ago(ctx.since), { x: x0, y: h - s - 2.5 * u, size: 8.5 * u, weight: 600, anchor: 'start', color: 'muted', tabular: st === 'running', maxWidth: room });
    } else {
      text(k, `#${ctx.params.build}`, { x: x0, y: s + 8 * u, size: 8.5 * u, weight: 600, anchor: 'start', color: 'muted', tabular: true, maxWidth: room });
      text(k, SHORT[st], { x: x0, cy: h / 2 + u, size: 14 * u, weight: 700, anchor: 'start', color: ink, maxWidth: room });
      text(k, st === 'running' ? mmss(ctx.since) : ctx.params.pipeline, { x: x0, y: h - s - 1.5 * u, size: 8.5 * u, weight: 600, anchor: 'start', color: 'muted', tabular: st === 'running', maxWidth: room });
    }
    void P; void path;
    return k.svg();
  },
};
