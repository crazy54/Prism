// The apps data hub: hosts sources and serves ctx.data. Browser-safe.
//
// Drop-in for the plugin runtime's data hub (src/plugin/data.js — same interface), so
// `new PrismRuntime({ data: await createNodeHub() })` feeds every facet live data:
//
//   const hub = createHub({ sources: [simulatedSystem(), createAudioSource()] });
//   const release = hub.need(facet.data);         // reference-counted: sources start on first need
//   hub.pick(facet.data)  → ctx.data subset         // cheap: reads each source's latest snapshot
//   release();                                      // the last release stops the source (kills its processes)
//   hub.register('weather', () => ({ temp: 21, code: 1 }))   // ad-hoc getters (plugin compatibility)
//
// Priority per key: registered getter → live sources (in the order added) → simulated ones; a source
// that has no value right now (a capture still starting, a probe that failed) falls through to the
// next, so e.g. the audio facets switch to real capture the moment it goes live and back to the
// simulated groove if it drops. A source's extension keys (sys, series) ride along with any key it serves.
// Every provider of a needed key runs (simulated sources cost nothing; live ones are usually alone).

const EXTENSION_KEYS = new Set(['sys', 'series']);

export function createHub({ sources = [], now = () => Date.now() } = {}) {
  const list = [];
  const refs = new Map();          // key → count
  const custom = new Map();        // key → getter
  const using = new Map();         // source → count of needed keys it serves

  // mode is read on every call: capture sources flip between 'live' and 'simulated' at run time
  const providers = (key) => list.filter((s) => s.provides.includes(key)).sort((a, b) => (a.mode === 'live' ? 0 : 1) - (b.mode === 'live' ? 0 : 1));
  const providerOf = (key) => providers(key)[0] || null;
  const servedBy = (key) => list.filter((s) => s.provides.includes(key));

  function retain(src, d) {
    const n = (using.get(src) || 0) + d;
    if (n <= 0) { using.delete(src); try { src.stop(); } catch { /* best effort */ } }
    else { using.set(src, n); if (!src.running) try { src.start(); } catch { /* falls back to absent keys */ } }
  }

  const hub = {
    /** Add a source (live sources win over simulated ones for the keys they share). */
    add(src) { if (src && !list.includes(src)) list.push(src); return src; },
    remove(src) { const i = list.indexOf(src); if (i >= 0) { list.splice(i, 1); if (using.has(src)) { using.delete(src); src.stop(); } } },
    get sources() { return list.slice(); },
    /** Reference-count data keys for one consumer; returns release(). */
    need(keys = []) {
      const ks = [...new Set(keys)].filter((k) => k !== 'clock' && k !== 'timer');
      for (const k of ks) {
        const n = (refs.get(k) || 0) + 1;
        refs.set(k, n);
        if (n === 1 && !custom.has(k)) for (const s of servedBy(k)) retain(s, 1);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        for (const k of ks) {
          const n = (refs.get(k) || 1) - 1;
          if (n > 0) { refs.set(k, n); continue; }
          refs.delete(k);
          if (!custom.has(k)) for (const s of servedBy(k)) if (using.has(s)) retain(s, -1);
        }
      };
    },
    /** ctx.data for these keys: measured values (null = unavailable), absent until a source has one. */
    pick(keys = [], nowMs = now()) {
      const out = {};
      const snaps = new Map();
      // one snapshot per source per pick; a stopped live source is stale, a failing one is absent
      const snap = (s) => { if (!snaps.has(s)) { let v = {}; try { v = (s.mode === 'live' && s.running === false ? null : s.snapshot(nowMs)) || {}; } catch { v = {}; } snaps.set(s, v); } return snaps.get(s); };
      for (const k of new Set(keys)) {
        if (custom.has(k)) { try { const v = custom.get(k)(); if (v !== undefined) out[k] = v; } catch { /* absent */ } continue; }
        for (const s of providers(k)) {
          const v = snap(s);
          if (v[k] === undefined) continue;
          out[k] = v[k];
          for (const x of s.provides) if (EXTENSION_KEYS.has(x) && v[x] !== undefined && out[x] === undefined) out[x] = v[x];
          break;
        }
      }
      return out;
    },
    /**
     * Where each key's value comes from right now (the same choice pick() makes): 'live' | 'simulated' |
     * 'custom', or null when no source has one (the facet then simulates its own). The plugin badges keys
     * whose data is not live with DEMO.
     */
    sourceOf(keys = [], nowMs = now()) {
      const out = {};
      for (const k of new Set(keys)) {
        if (custom.has(k)) { out[k] = 'custom'; continue; }
        out[k] = null;
        for (const s of providers(k)) {
          let v = {};
          try { v = (s.mode === 'live' && s.running === false ? null : s.snapshot(nowMs)) || {}; } catch { v = {}; }
          if (v[k] === undefined) continue;
          out[k] = s.mode === 'live' ? 'live' : 'simulated';
          break;
        }
      }
      return out;
    },
    /** Replace a source (e.g. a new .ics file): the old one stops, the new one starts if its keys are needed. */
    replace(oldSrc, newSrc) {
      if (oldSrc) hub.remove(oldSrc);
      if (!newSrc) return null;
      hub.add(newSrc);
      const n = newSrc.provides.filter((k) => refs.has(k) && !custom.has(k)).length;
      if (n) { using.set(newSrc, n); try { newSrc.start(); } catch { /* falls back to the next provider */ } }
      return newSrc;
    },
    /** Everything every source provides right now (diagnostics, MCP, web previews). */
    snapshot(nowMs = now()) { return hub.pick([...new Set([...list.flatMap((s) => s.provides), ...custom.keys()])], nowMs); },
    register(key, fn) { custom.set(key, fn); return hub; },
    supported: () => [...new Set([...list.flatMap((s) => s.provides), ...custom.keys()])],
    /** Which source serves each key, and how. */
    status() { return { keys: Object.fromEntries(hub.supported().map((k) => [k, custom.has(k) ? 'custom' : providers(k).map((s) => `${s.id}:${s.mode}`).join(' > ')])), sources: list.map((s) => ({ ...(s.status?.() || { id: s.id, mode: s.mode }), used: using.get(s) || 0 })) }; },
    stop() { for (const s of using.keys()) { try { s.stop(); } catch { /* best effort */ } } using.clear(); refs.clear(); },
    get active() { return using.size > 0; },
  };
  for (const s of sources) hub.add(s);
  return hub;
}

/** A consumer's view: { data() → ctx.data, release() }. */
export function lease(hub, keys) {
  const release = hub.need(keys);
  return { data: (nowMs) => hub.pick(keys, nowMs), release };
}
