// Frame ticker. Calls fn(t, dt, n) at a target fps with drift correction:
// frames are scheduled against absolute deadlines (start + n/fps), and if the
// work falls more than two frames behind we resynchronize instead of bursting
// to catch up. `t` is seconds of *unpaused* time, so pausing freezes scenes.
//
// Timer granularity: on Windows, Node's timers fire on the system tick
// (~15.6 ms), so setTimeout(16) really waits ~31 ms and a naive loop caps at
// ~32 fps. We therefore sleep only until within half a tick of the deadline
// and fire on the tick nearest to it (via setImmediate, which isn't quantized).
// Deadlines stay absolute, so the average rate still matches the target.

// globalThis.performance exists in Node ≥ 16 and every browser.
const performance = globalThis.performance;
const SLACK_MS = globalThis.process?.platform === 'win32' ? 8 : 1;

export function ticker(fn, { fps = 30 } = {}) {
  let interval = 1000 / fps;
  const start = performance.now();
  let paused = false, pausedAt = 0, pausedTotal = 0;
  let last = start, deadline = start, n = 0, timer = null, immediate = null, stopped = false;

  const schedule = () => {
    timer = null;
    if (stopped) return;
    const wait = deadline - performance.now();
    if (wait <= SLACK_MS) immediate = setImmediate(tick);
    else timer = setTimeout(schedule, Math.max(1, wait - SLACK_MS));
  };

  const tick = () => {
    immediate = null;
    if (stopped) return;
    const now = performance.now();
    if (!paused) {
      const t = (now - start - pausedTotal) / 1000;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      fn(t, dt, n++);
    } else last = now;
    if (stopped) return;
    deadline += interval;
    const after = performance.now();
    if (after - deadline > interval * 2) deadline = after;
    schedule();
  };
  immediate = setImmediate(tick);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (immediate) clearImmediate(immediate);
      timer = immediate = null;
    },
    pause() { if (!paused) { paused = true; pausedAt = performance.now(); } },
    resume() { if (paused) { paused = false; pausedTotal += performance.now() - pausedAt; } },
    toggle() { if (paused) this.resume(); else this.pause(); return paused; },
    get paused() { return paused; },
    get fps() { return 1000 / interval; },
    set fps(v) { interval = 1000 / Math.max(1, v); },
    get frame() { return n; },
  };
}

/** Promise-based sleep. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
