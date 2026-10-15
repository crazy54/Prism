// Calendar source → ctx.data.calendar { next: { title, at, end }, current?, events? } (epoch ms).
//
// Simulated by default (a fictional working day). Optional real integration with no network and
// no credentials: a local iCalendar file (.ics — what every calendar app exports or syncs to disk),
// re-read every 60 s. Only SUMMARY / DTSTART / DTEND of timed events are read.

import { simulatedCalendar } from './simulated.js';

const DAY = 86400000;

/** iCalendar DATE-TIME → epoch ms. UTC ("…Z") exact; floating / TZID times are taken as local (tzOffset min). */
export function icsTime(value, tzOffset = 0) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return null; // all-day: not a meeting
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  return z ? utc : utc - tzOffset * 60000;
}

/** Parse VEVENTs → [{ title, at, end }] sorted by start (unfolds folded lines; ignores all-day events). */
export function parseIcs(text = '', tzOffset = 0) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT') { if (ev && Number.isFinite(ev.at)) out.push({ title: ev.title || 'Event', at: ev.at, end: Number.isFinite(ev.end) ? ev.end : ev.at + 30 * 60000 }); ev = null; }
    else if (ev) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const name = line.slice(0, i).split(';')[0].toUpperCase(), val = line.slice(i + 1);
      if (name === 'SUMMARY') ev.title = val.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').slice(0, 80);
      else if (name === 'DTSTART') ev.at = icsTime(val, tzOffset);
      else if (name === 'DTEND') ev.end = icsTime(val, tzOffset);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Events → { next, current?, events (today) } at `now`. */
export function agendaOf(events, now, tzOffset = 0) {
  const local = now + tzOffset * 60000, midnight = Math.floor(local / DAY) * DAY - tzOffset * 60000;
  const today = events.filter((e) => e.end > midnight && e.at < midnight + DAY);
  const current = events.find((e) => e.at <= now && e.end > now);
  const next = events.find((e) => e.at > now);
  return { ...(next ? { next } : {}), ...(current ? { current } : {}), events: today };
}

/** A calendar source over a local .ics file. fs: { readFile(path) → text }. */
export function createIcsCalendarSource({ file, fs, now = () => Date.now(), tzOffset = 0, every = 60, setTimer, clearTimer }) {
  let events = [], running = false, timer = null, ok = false;
  const load = async () => {
    try { events = parseIcs(await fs.readFile(file), tzOffset); ok = true; } catch { ok = false; }
    if (running) timer = setTimer(load, every * 1000);
  };
  return {
    id: 'calendar', provides: ['calendar'], rate: 1 / 15, mode: 'live',
    get running() { return running; },
    start() { if (!running) { running = true; load(); } return this; },
    stop() { running = false; if (timer !== null) clearTimer(timer); timer = null; return this; },
    snapshot(nowMs = now()) { return ok ? { calendar: agendaOf(events, nowMs, tzOffset) } : {}; },
    status() { return { id: 'calendar', mode: 'live', running, file, events: events.length, ok }; },
  };
}

export { simulatedCalendar };
