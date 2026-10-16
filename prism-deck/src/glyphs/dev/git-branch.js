// git-branch — a generic branch graph (no vendor mark): a trunk with two commits and a
// branch that curves back into it. active: the branch tip lights and commits flow along
// the branch and merge into the trunk, one after another, seamlessly.
import { defineGlyph } from '../_glyph.js';
import { arrive, smoothstep } from '../../scene/easing.js';

const T = [14.5, 11.5], B = [14.5, 36.5], BR = [33.5, 15.5], NR = 3.6;  // trunk top, trunk bottom, branch tip
// the branch: from the tip down, curving into the trunk just above the bottom commit
const C = [[BR[0], BR[1] + NR], [BR[0], 27.5], [B[0], 24], [B[0], B[1] - NR]];
const LOOP = 1.8;
const bez = (u) => {
  const v = 1 - u;
  return [0, 1].map((k) => v * v * v * C[0][k] + 3 * v * v * u * C[1][k] + 3 * v * u * u * C[2][k] + u * u * u * C[3][k]);
};

export default defineGlyph({
  id: 'git-branch',
  title: 'Branch',
  category: 'dev',
  tags: ['branch', 'git', 'version control', 'merge', 'commit', 'source control'],
  states: { idle: 'idle', active: 'active' },
  loop: LOOP,
  draw(g, s) {
    const on = s.state === 'active';
    const f = (p) => `${p[0]} ${p[1]}`;
    g.line(T[0], T[1] + NR, B[0], B[1] - NR);
    g.path(`M${f(C[0])}C${f(C[1])} ${f(C[2])} ${f(C[3])}`, { role: on ? 'accent' : 'dim' });
    g.circle(T[0], T[1], NR);
    g.circle(B[0], B[1], NR);
    const k = arrive(s.since, 0.35);
    g.circle(BR[0], BR[1], NR, { role: on ? 'accent' : 'line' });
    if (!on) return;
    g.circle(BR[0], BR[1], 1.6, { role: 'spark', opacity: k });
    // two commits in flight along the branch, half a loop apart
    for (const off of [0, 0.5]) {
      const u = (s.phase(LOOP) + off) % 1;
      const fade = smoothstep(0, 0.15, u) * (1 - smoothstep(0.85, 1, u));
      const [x, y] = bez(u);
      if (fade > 0.02) g.dot(x, y, 1.9, { opacity: fade * k });
    }
  },
});
