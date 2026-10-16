// screen-galleon-meeting — the Galleon 100 SD screen for calls. Left dial: the agenda (top: the meeting
// you are in or the next one, with a countdown; bottom: today as a timeline with a now line). Right dial:
// your devices (top: the microphone — a press toggles mute, muted lights the widget in the alarm state;
// bottom: the camera).
//
// ctx.data (all optional — the fictional working day of src/facets/apps/_sim.js is simulated otherwise):
//   calendar  { next: { title, at, end }, current?: { title, at, end }, events?: [{ title, at, end }] }   (epoch ms)
//   audio     { level: 0–1, levels: number[] } — the microphone's input level
//   mic       { muted: bool }      (extension: overrides the facet state)
//   camera    { on: bool }         (extension: overrides params.camera)

import { surface, rect, path, n, roundRectPath } from '../../scene/index.js';
import { wrapText, capHeight } from '../../scene/text.js';
import { calendarOf, audioOf } from '../apps/_data.js';
import { AGENDA } from '../apps/_sim.js';
import { mutedPlate, strike } from '../apps/_muted.js';
import { galleon, header, stat, meter, segmented, hhmm, localParts, HUE, GALLEON_PARAMS, clamp } from './_d5-kit.js';

const MIN = 60000;

/** Today's events: the source's list, or the simulated agenda. */
function eventsOf(ctx, cal) {
  if (Array.isArray(cal.events)) return cal.events.filter((e) => e && Number.isFinite(e.at));
  const day = 86400000, tz = (ctx.clock?.tzOffset ?? 0) * 60000;
  const midnight = Math.floor((ctx.now + tz) / day) * day - tz;
  return AGENDA.map((e) => ({ title: e.title, at: midnight + e.at * MIN, end: midnight + (e.at + e.dur) * MIN }));
}
const minutesText = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim() : `${mins} min`);

export default {
  id: 'screen-galleon-meeting',
  title: 'Galleon Meeting Console',
  category: 'Galleon Dashboards',
  description: 'The Galleon 100 SD screen for calls: the next meeting with a countdown, a mute you can feel on the right dial, the camera, and today as a timeline.',
  tags: ['galleon', 'corsair', 'screen', 'meeting', 'calendar', 'mute', 'mic', 'camera', 'agenda', 'dashboard'],
  surface: 'screen',
  screens: ['galleon'],
  data: ['calendar', 'audio', 'clock', 'mic', 'camera'],
  dataShape: {
    calendar: '{ next: { title, at, end }, current?: { title, at, end }, events?: [{ title, at, end }] } epoch ms',
    audio: '{ level 0–1, levels: number[] } microphone input',
    mic: '{ muted } (extension)',
    camera: '{ on } (extension)',
  },
  states: ['live', 'muted'],
  tones: { muted: 'neg' },
  press: 'toggle',
  link: { 'mic.muted': { live: false, muted: true } },   // linked state (scene/link.js): mutes with every mic key
  fps: 6,
  loop: 60,
  params: {
    ...GALLEON_PARAMS,
    camera: { type: 'bool', default: true, label: 'Camera on (when no source says)' },
    hour12: { type: 'bool', default: false, label: '12-hour times' },
    dayStart: { type: 'number', default: 8, min: 0, max: 12, step: 1, label: 'Timeline starts (hour)' },
    dayEnd: { type: 'number', default: 18, min: 13, max: 24, step: 1, label: 'Timeline ends (hour)' },
  },
  order: 21,
  render(ctx) {
    const scr = surface(ctx);
    const P = ctx.params, now = ctx.now;
    const cal = calendarOf(ctx);
    const muted = typeof ctx.data?.mic?.muted === 'boolean' ? ctx.data.mic.muted : ctx.stateName === 'muted';
    const camOn = typeof ctx.data?.camera?.on === 'boolean' ? ctx.data.camera.on : P.camera;
    const time = (ms) => { const t = localParts(ctx, ms); return hhmm(t.h, t.m, P.hour12); };
    const cur = cal.current && cal.current.end > now ? cal.current : null;
    const next = cal.next;
    const untilNext = next ? Math.max(0, Math.ceil((next.at - now) / MIN)) : Infinity;
    const soon = !cur && untilNext <= 5;

    const agenda = (p, W) => {
      const ev = cur || next;
      if (!ev) { header(p, W, 'Next', 'Nothing scheduled'); p.value('Free', { align: 'left', x: W.x0, cy: p.h * 0.58 }); return; }
      header(p, W, cur ? 'Now' : 'Next', cur ? `until ${time(cur.end)}` : `${time(ev.at)}–${time(ev.end)}`, { metaColor: soon ? 'ink' : 'dim' });
      const lab = p.typeStyle('label'), v = p.typeStyle('value');
      const wr = wrapText(ev.title, { maxWidth: W.w, size: lab.size, minSize: lab.size * 0.82, maxLines: 2, weight: lab.weight, tracking: lab.tracking, caps: lab.caps });
      let y = W.eyebrowY + Math.round(W.pad * 0.75) + capHeight(wr.size, lab.weight);
      for (const line of wr.lines) { p.label(line, { align: 'left', x: W.x0, y, size: wr.size, maxWidth: W.w }); y += wr.lineHeight; }
      if (cur) {
        const left = Math.max(0, Math.ceil((cur.end - now) / MIN)), total = Math.max(1, (cur.end - cur.at) / MIN);
        const bh = Math.max(6, Math.round(W.u * 2.4));
        stat(p, { role: 'value', value: left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left, unit: left >= 60 ? 'h left' : 'min left', xl: W.x0, base: W.footY - bh - Math.round(W.u * 3.5), size: v.size * 0.9 });
        meter(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: 1 - left / total });
        return;
      }
      const base = W.footY;
      if (untilNext >= 600) { p.caption(`Tomorrow · ${time(next.at)}`, { align: 'left', x: W.x0, y: base, color: 'muted' }); return; }
      p.caption('in', { align: 'left', x: W.x0, y: base, color: 'muted' });
      const inW = Math.round(p.typeStyle('caption').size * 1.05);
      stat(p, { role: 'value', value: untilNext >= 60 ? `${Math.floor(untilNext / 60)}:${String(untilNext % 60).padStart(2, '0')}` : untilNext, unit: untilNext >= 60 ? 'h' : 'min', xl: W.x0 + inW, base });
    };

    const mic = (p, W) => {
      if (muted) mutedPlate(p, { since: ctx.since, radius: p.m.radius });   // unmissable: red widget, struck mic, MUTED
      header(p, W, muted ? 'Mic · muted' : 'Mic', muted ? '' : 'live', { metaColor: muted ? 'ink' : 'dim' });
      const gs = Math.round(p.h * 0.5);
      const gbox = { x: W.x0 - gs * 0.12, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.5, size: gs };
      p.glyph('mic', { state: muted ? 'off' : 'on', box: gbox });
      if (muted) strike(p, gbox, { since: ctx.since });
      const v = p.typeStyle('value');
      const base = Math.round(p.h * 0.6);
      p.value(muted ? 'MUTED' : 'Live', { align: 'right', x: W.x1, cy: base - capHeight(v.size, v.weight) / 2, maxWidth: W.w - gs, color: 'ink' });
      const a = audioOf(ctx);
      const mh = Math.max(6, Math.round(W.u * 3));
      const mx = W.x0 + gs * 0.95;
      if (muted) p.caption('push dial to unmute', { align: 'right', x: W.x1, y: W.footY, color: 'ink', maxWidth: W.x1 - mx });
      else segmented(p, { x: mx, y: W.footY - mh, w: W.x1 - mx, h: mh, value: clamp(a.level * 1.1), count: 14 });
    };

    const today = (p, W) => {
      const evs = eventsOf(ctx, cal).sort((a, b) => a.at - b.at);
      const busy = evs.find((e) => e.at <= now && e.end > now), upcoming = evs.filter((e) => e.at > now);
      header(p, W, 'Today', busy ? `until ${time(busy.end)}` : upcoming.length ? `next ${time(upcoming[0].at)}` : 'free');
      const day = 86400000, tz = (ctx.clock?.tzOffset ?? 0) * 60000, midnight = Math.floor((now + tz) / day) * day - tz;
      const h0 = Math.min(P.dayStart, P.dayEnd - 4), h1 = P.dayEnd, t0 = midnight + h0 * 3600000, t1 = midnight + h1 * 3600000;
      const X = (ms) => W.x0 + clamp((ms - t0) / (t1 - t0)) * W.w;
      const cs = p.typeStyle('caption');
      const labelBase = W.footY, barH = Math.max(14, Math.round(p.h * 0.13)), barY = labelBase - capHeight(cs.size, cs.weight) - Math.round(W.u * 4.5) - barH;
      // the day's track and hour ticks
      p.add(rect({ x: W.x0, y: barY + barH / 2 - 1, width: W.w, height: 2, fill: p.colors.line }));
      let ticks = '';
      for (let hr = h0; hr <= h1; hr++) { const x = X(midnight + hr * 3600000); ticks += `M${n(x)} ${n(barY + barH + 3)}v${n(W.u * (hr % 2 ? 1.6 : 2.6))}`; }
      p.add(path(ticks, { stroke: p.colors.dim, strokeWidth: n(Math.max(1, W.u * 0.5)), strokeLinecap: 'round' }));
      for (let hr = h0; hr <= h1; hr += 2) {
        const lab = P.hour12 ? `${((hr + 11) % 12) + 1}` : `${hr}`;
        const x = X(midnight + hr * 3600000);
        p.caption(lab, { align: hr === h0 ? 'left' : hr >= h1 - 0.5 ? 'right' : 'center', x: hr === h0 ? x : hr >= h1 - 0.5 ? x : x, y: labelBase, color: 'dim' });
      }
      // meetings: past = quiet, current = lit, upcoming = tinted
      const nextEv = upcoming[0];
      for (const e of evs) {
        if (e.end < t0 || e.at > t1) continue;
        const x0 = X(e.at), x1 = Math.max(x0 + 4, X(e.end) - 2);
        const past = e.end <= now, lit = (e.at <= now && e.end > now) || (!busy && e === nextEv);
        p.add(path(roundRectPath(x0, barY, x1 - x0, barH, Math.min(barH * 0.3, (x1 - x0) / 2)), { fill: past ? p.colors.line : p.ctx.tint, fillOpacity: past || lit ? null : 0.42 }));
      }
      // the now line
      if (now >= t0 && now <= t1) {
        const x = X(now), lw = Math.max(2, Math.round(W.u * 0.9));
        p.add(rect({ x: x - lw / 2, y: barY - W.u * 4, width: lw, height: barH + W.u * 8, rx: lw / 2, fill: p.colors.ink }));
        p.add(`<circle cx="${n(x)}" cy="${n(barY - W.u * 4)}" r="${n(lw * 1.9)}" fill="${p.colors.ink}"/>`);
      }
    };

    const camera = (p, W) => {
      header(p, W, 'Camera', camOn ? 'video on' : 'video off');
      const gs = Math.round(p.h * 0.5);
      p.glyph('camera', { state: camOn ? 'on' : 'off', box: { x: W.x0 - gs * 0.08, y: W.eyebrowY + (W.footY - W.eyebrowY - gs) * 0.5, size: gs } });
      const v = p.typeStyle('value');
      const base = Math.round(p.h * 0.6);
      p.value(camOn ? 'On' : 'Off', { align: 'right', x: W.x1, cy: base - capHeight(v.size, v.weight) / 2, color: camOn ? undefined : 'muted' });
      p.caption(camOn ? 'Others can see you' : 'Video paused', { align: 'right', x: W.x1, y: W.footY, color: 'muted', maxWidth: W.w - gs });
    };

    return galleon(ctx, scr, [[agenda, mic], [today, camera]], {
      hues: [[HUE.periwinkle, muted ? HUE.coral : HUE.mint], [HUE.azure, HUE.cyan]],
      tones: [[soon ? 'warn' : 'idle', muted ? 'neg' : 'idle'], ['idle', camOn ? 'idle' : 'idle']],
    });
  },
};
