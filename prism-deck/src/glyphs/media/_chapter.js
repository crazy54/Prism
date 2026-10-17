// Shared drawing for chapter-next / chapter-prev: a chaptered timeline (three segments) under a small
// skip mark (solid triangle + bar), the target chapter lit. Arriving, the skip mark slides toward its
// bar; a press shoves it and the lit chapter flashes.
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export function drawChapter(g, s, dir) {
  const k = enter(s, 0.45), p = press(s, 0.4);
  const X = (x) => (dir > 0 ? x : 48 - x);
  const dx = lerp(-3, 0, k) + 1.5 * p;
  g.polygon([[X(15 + dx), 11], [X(27 + dx), 19.5], [X(15 + dx), 28]], { role: 'fill', join: 'round', opacity: lerp(0.4, 1, k) });
  g.rect(Math.min(X(29.5), X(33.5)), 11, 4, 17, { r: 1.5, role: 'fill' });
  // the timeline: [from, to] per chapter, the next one (in the skip direction) lit
  [[8, 18], [21.5, 28.5], [32, 40]].forEach(([a, b], i) => {
    const lit = dir > 0 ? i === 2 : i === 0;
    g.line(X(a), 36.5, X(b), 36.5, { role: lit ? 'accent' : 'dim', weight: lit ? 1.1 : 1, opacity: lit ? lerp(0.6, 1, p) : 1 });
  });
}
