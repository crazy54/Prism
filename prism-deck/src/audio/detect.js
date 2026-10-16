// Auto-detection — which capture backends can run here, best first. Never hangs:
// every probe is raced against a timeout and the whole pass against a deadline; a
// probe that throws or stalls just marks its backend unavailable.
//
//   const d = await detectBackends(sys, { input: 'monitor', bridge: 'auto' });
//   d.candidates → [{ id, ok, reason?, probe, plan? }]   (ordered; ok ones carry the plan they would run)
//   d.best       → the first ok live candidate id, or 'synthetic'
//
// Platform order (backends.js AUTO_ORDER): linux parec → pw-record → arecord → ffmpeg;
// win32 / darwin ffmpeg → browser bridge. Detection follows process.platform (inside
// OpenDeck the -info platform says "windows" even on Linux — never trust it for this).

import { BACKENDS, autoOrder } from './backends.js';

const withTimeout = (p, ms, onTimeout) => new Promise((resolve) => {
  let done = false;
  const t = setTimeout(() => { if (!done) { done = true; resolve(onTimeout()); } }, ms);
  t?.unref?.();
  Promise.resolve(p).then((v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } }, (e) => { if (!done) { done = true; clearTimeout(t); resolve({ ok: false, reason: `probe failed: ${e?.message || e}` }); } });
});

/**
 * The backend ids to try for a request.
 * backend: 'auto' | id | id[]; bridge: 'auto' (win32/darwin only) | true | false
 */
export function backendList(platform, { backend = 'auto', bridge = 'auto' } = {}) {
  let ids;
  if (Array.isArray(backend)) ids = backend.slice();
  else if (backend && backend !== 'auto') ids = [backend];
  else ids = autoOrder(platform).slice();
  if (bridge === false) ids = ids.filter((id) => id !== 'bridge');
  if (bridge === true && !ids.includes('bridge')) ids.push('bridge');
  return ids.filter((id) => BACKENDS[id] && id !== 'synthetic');
}

/** opts: { backend, bridge, input, device, rate, probeTimeoutMs = 3000, deadlineMs = 5000 } */
export async function detectBackends(sys, opts = {}) {
  const ids = backendList(sys.platform, opts);
  const probeTimeoutMs = opts.probeTimeoutMs ?? 3000;
  const deadline = opts.deadlineMs ?? 5000;
  const t0 = Date.now();
  const probes = ids.map((id) => {
    const b = BACKENDS[id];
    if (b.platforms[0] !== '*' && !b.platforms.includes(sys.platform) && (opts.backend === 'auto' || !opts.backend)) {
      return Promise.resolve({ id, probe: { ok: false, reason: `not available on ${sys.platform}` } });
    }
    return withTimeout(b.probe(sys, opts), Math.min(probeTimeoutMs, deadline), () => ({ ok: false, reason: `probe timed out after ${probeTimeoutMs} ms` }))
      .then((probe) => ({ id, probe }));
  });
  const results = await withTimeout(Promise.all(probes), deadline, () => ids.map((id) => ({ id, probe: { ok: false, reason: 'detection deadline passed' } })));
  const candidates = results.map(({ id, probe }) => {
    const b = BACKENDS[id];
    let plan = null;
    if (probe?.ok) { try { plan = b.plan(opts, probe, sys); } catch (e) { return { id, ok: false, reason: `plan failed: ${e.message}`, probe }; } }
    return { id, title: b.title, kind: b.kind, ok: !!probe?.ok, reason: probe?.reason, probe, plan };
  });
  const best = candidates.find((c) => c.ok)?.id || 'synthetic';
  return { platform: sys.platform, candidates, best, ms: Date.now() - t0 };
}
