// Timer state for one key → ctx.data.timer { elapsed s, running, laps s[], target? s, remaining? s }.
// Browser-safe and pure given a clock: the plugin keeps one per key context (stopwatch /
// countdown facets) and passes its snapshot as that key's data, so a paused stopwatch still
// shows its time (ctx.since alone resets on every state change).
//
//   const t = createTimer({ now, target: 300 });   // target (s) → countdown; omit → stopwatch
//   t.press()   start ↔ pause      t.reset()      t.lap()      t.snapshot() → { timer }

export function createTimer({ now = () => Date.now(), target = null, maxLaps = 8 } = {}) {
  let acc = 0, startedAt = null;
  const laps = [];
  const elapsed = () => acc + (startedAt === null ? 0 : (now() - startedAt) / 1000);
  return {
    get running() { return startedAt !== null; },
    press() { if (startedAt === null) startedAt = now(); else { acc = elapsed(); startedAt = null; } return this; },
    start() { if (startedAt === null) startedAt = now(); return this; },
    pause() { if (startedAt !== null) { acc = elapsed(); startedAt = null; } return this; },
    reset() { acc = 0; startedAt = null; laps.length = 0; return this; },
    lap() { if (startedAt !== null) { laps.push(elapsed()); if (laps.length > maxLaps) laps.shift(); } return this; },
    setTarget(s) { target = Number.isFinite(s) && s > 0 ? s : null; return this; },
    snapshot() {
      const e = Math.round(elapsed() * 100) / 100;
      return { timer: { elapsed: e, running: startedAt !== null, laps: laps.map((x) => Math.round(x * 100) / 100), ...(target ? { target, remaining: Math.round((target - e) * 100) / 100 } : {}) } };
    },
  };
}
