// Live data for facets that declare `data` (authoring.md §7). Only what the OS
// gives cheaply and portably with node:os is measured here: cpu (0–1, from
// os.cpus() time deltas), mem (0–1 used), uptime (s). Everything else (audio,
// spectrum, net, media …) is left out, and facets simulate their own fallback.
// Sampling runs only while some visible unit needs a key (reference counted).
//
// Hook for platform sources (Linux audio from src/audio/**, etc.): register(key, fn)
// where fn() returns the value in the shape of authoring.md §7.

import os from 'node:os';

export function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { const t = c.times; idle += t.idle; total += t.user + t.nice + t.sys + t.irq + t.idle; }
  return { idle, total };
}

export function createDataHub({ intervalMs = 1000, setTimer = (fn, ms) => setInterval(fn, ms), clearTimer = (h) => clearInterval(h) } = {}) {
  const refs = new Map();
  const values = {};
  const sources = new Map();
  let prev = null, timer = null;

  const builtin = {
    cpu: () => {
      const now = cpuTimes();
      const v = prev && now.total > prev.total ? 1 - (now.idle - prev.idle) / (now.total - prev.total) : values.cpu ?? 0;
      prev = now;
      return Math.min(1, Math.max(0, v));
    },
    mem: () => { const t = os.totalmem(); return t ? Math.min(1, Math.max(0, 1 - os.freemem() / t)) : 0; },
    uptime: () => os.uptime(),
  };

  function sample() {
    for (const key of refs.keys()) {
      const fn = sources.get(key) || builtin[key];
      if (!fn) continue;
      try { const v = fn(); if (v !== undefined) values[key] = v; } catch { /* a source failed: facets fall back to simulation */ }
    }
  }

  function retime() {
    const want = [...refs.keys()].some((k) => sources.has(k) || builtin[k]);
    if (want && !timer) { sample(); timer = setTimer(sample, intervalMs); timer?.unref?.(); }
    else if (!want && timer) { clearTimer(timer); timer = null; }
  }

  return {
    /** Reference-count data keys for a unit. Returns a release function. */
    need(keys = []) {
      const ks = [...new Set(keys)];
      for (const k of ks) refs.set(k, (refs.get(k) || 0) + 1);
      retime();
      let released = false;
      return () => { if (released) return; released = true; for (const k of ks) { const n = (refs.get(k) || 1) - 1; if (n <= 0) { refs.delete(k); delete values[k]; } else refs.set(k, n); } retime(); };
    },
    /** Current values for a facet's data keys ({} entries are omitted until measured). */
    pick(keys = []) { const o = {}; for (const k of keys) if (values[k] !== undefined) o[k] = values[k]; return o; },
    register(key, fn) { sources.set(key, fn); retime(); },
    /** 'live' (measured here) | 'custom' (a registered getter) | null (not measured: the facet simulates). */
    sourceOf(keys = []) { const o = {}; for (const k of keys) o[k] = values[k] === undefined ? null : sources.has(k) ? 'custom' : 'live'; return o; },
    supported: () => [...new Set([...Object.keys(builtin), ...sources.keys()])],
    stop() { if (timer) clearTimer(timer); timer = null; refs.clear(); },
    get active() { return timer !== null; },
  };
}
