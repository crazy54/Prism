// Prism website — shared behavior for every page: Night/Day (with the relight sweep),
// First Light, copy + toast, and links to pages the build doesn't ship yet.
//
// Load order (all deferred): assets/rf/first-light.js → assets/site.js → the page's own script.
// The inline <head> snippet has already set data-theme / data-rf-mode and armed First Light.
//
//   window.PrismSite = {
//     mode()                 'night' | 'day'
//     setMode(mode, origin?) relight to a mode (persists as localStorage 'prism-site-theme' = 'dark' | 'light')
//     onMode(fn)             fn(mode) after every change (iframes, terminal tiles, deck keys re-theme here)
//     firstLight             the controller of this page load's First Light (or null)
//     copy(text, button?)    clipboard with a dialog fallback; notify(message) shows the toast
//   }
// QA: ?fl=<ms> (or ?fl=echo:<ms>) plays First Light and freezes it at that moment (key frames); ?fl=off skips it.
(() => {
  'use strict';
  const root = document.documentElement;
  const KEY = 'prism-site-theme';
  const byId = (id) => document.getElementById(id);
  const listeners = new Set();
  const lightQuery = matchMedia('(prefers-color-scheme: light)');

  const stored = () => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'day' ? 'day' : v === 'dark' || v === 'night' ? 'night' : null; } catch { return null; } };
  const mode = () => (root.dataset.rfMode === 'day' ? 'day' : 'night');

  function apply(next) {
    root.dataset.theme = next === 'day' ? 'prism-light' : 'prism-dark';
    root.dataset.rfMode = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'day' ? '#f6f5f9' : '#0a0c12';
    for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === next));
    for (const fn of listeners) { try { fn(next); } catch (err) { console.error('[prism-site] theme listener', err); } }
  }

  function setMode(next, origin, { persist = true } = {}) {
    if (next !== 'day' && next !== 'night') return;
    if (persist) { try { localStorage.setItem(KEY, next === 'day' ? 'light' : 'dark'); } catch { /* storage is optional */ } }
    if (next === mode()) { apply(next); return; }
    const FL = window.PrismFirstLight;
    if (FL && FL.relight) FL.relight(() => apply(next), origin).catch(() => apply(next));
    else apply(next);
  }

  // First visit follows the OS; once someone picks, their choice sticks.
  lightQuery.addEventListener('change', (e) => { if (!stored()) setMode(e.matches ? 'day' : 'night', null, { persist: false }); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (b) setMode(b.dataset.themeSet, b);
  });

  // ── toast + copy ─────────────────────────────────────────────────────────
  let toastTimer;
  function notify(message) {
    const toast = byId('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('visible');
    void toast.offsetWidth; // restart the timer beam
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  async function copy(text, button) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      notify('Copied. Go make something.');
      if (button) {
        const label = button.querySelector('[data-label]');
        const before = label ? label.textContent : null;
        button.classList.add('is-done');
        if (label) label.textContent = 'Copied';
        clearTimeout(button.__copyTimer);
        button.__copyTimer = setTimeout(() => { button.classList.remove('is-done'); if (label) label.textContent = before; }, 1600);
      }
    } catch {
      const field = byId('copy-fallback');
      const dialog = byId('copy-dialog');
      if (!field || !dialog) return;
      field.value = text;
      if (!dialog.open) dialog.showModal();
      field.focus();
      field.select();
    }
  }
  byId('close-copy-dialog')?.addEventListener('click', () => byId('copy-dialog').close());
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.dataset.copy, b);
  });

  // Pages website/build.mjs doesn't copy yet (/deck/) are linked from script, so the build's
  // strict link check stays green until it does. Swap data-deck-href → href once it ships deck/.
  for (const a of document.querySelectorAll('a[data-deck-href]')) a.href = a.dataset.deckHref;

  // ── First Light ──────────────────────────────────────────────────────────
  // Pages whose tiles arrive later (the terminal and deck catalogs) mark <html data-fl-late> and call
  // PrismSite.tilesReady(elements) once they're in the DOM; late tiles join the same timeline.
  const qa = new URLSearchParams(location.search).get('fl');
  let firstLight = null;
  let lateResolve = null;
  const staticTiles = () => [...document.querySelectorAll('[data-fl="tile"]')];
  const FL = window.PrismFirstLight;
  if (FL && qa !== 'off') {
    const opts = { tiles: staticTiles(), onDone: () => { root.dataset.fl = 'done'; } };
    if (root.hasAttribute('data-fl-late')) {
      opts.tiles = new Promise((res) => { lateResolve = res; setTimeout(() => res(staticTiles()), 1400); });
    }
    const freeze = qa && /^(?:(full|echo):)?(\d+)$/.exec(qa);
    if (freeze) { opts.mode = freeze[1] || 'full'; opts.freezeAt = Number(freeze[2]); }
    const m = opts.mode || FL.decide(opts);
    root.dataset.fl = m;
    try { firstLight = FL.play(opts); } catch (err) { console.error('[prism-site] First Light', err); root.classList.remove('pfl-armed'); }
  } else {
    root.classList.remove('pfl-armed');
    root.dataset.fl = 'none';
  }

  apply(mode());
  const tilesReady = (els = []) => { if (lateResolve) { lateResolve([...staticTiles(), ...els]); lateResolve = null; } };
  window.PrismSite = { mode, setMode, onMode: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, firstLight, tilesReady, copy, notify };
})();
