// Shared drawing for track-curve-left / track-curve-right: a 90° turn seen from above.
import { enter, press, mirrorX } from '../_tools.js';
import { topTrack, curveLeft } from './_track.js';

const C = curveLeft({ cx: 34, yb: 40, ya: 30, rc: 14, xe: 7.5 });

/** dir = -1 for left (as drawn), 1 for right (mirrored). */
export function drawCurve(g, s, dir) {
  const k = enter(s, 0.55), p = press(s, 0.5);
  topTrack(g, C.at, C.length, { gauge: 11, pitch: 8, over: 2, run: (1 - k) + p, m: dir > 0 ? mirrorX() : null, opacity: 0.35 + 0.65 * k });
}
