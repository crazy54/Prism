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
//     shell() · setShell(m) · curl(text) · applyShell(scope?) · onShell(fn)   curl vs curl.exe (Windows)
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

  const pressed = (next) => { for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === next)); };
  function apply(next) {
    root.dataset.theme = next === 'day' ? 'prism-light' : 'prism-dark';
    root.dataset.rfMode = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'day' ? '#f6f5f9' : '#0a0c12';
    pressed(next);
    for (const fn of listeners) { try { fn(next); } catch (err) { console.error('[prism-site] theme listener', err); } }
  }

  // Perf (INP): the toggle shows its new state in the click's own frame; the relight starts after that
  // frame is painted (the sweep's snapshots and the token switch restyle the whole page, ~0.5 s at 4× CPU,
  // which would otherwise hold the click's next paint). Re-picking the current mode re-themes nothing.
  let target = null;
  const afterPaint = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
  // The View Transition sweep only on capable devices (first-light.js vtCapable: ≥ 8 cores, ≥ 8 GB when reported,
  // no reduced motion, no Save-Data); elsewhere the veil-and-beam fallback. QA: ?vt=1 / ?vt=0 force either path.
  const vtFlag = new URLSearchParams(location.search).get('vt');
  const viewTransition = vtFlag === '1' ? true : vtFlag === '0' ? false : 'auto';
  function setMode(next, origin, { persist = true } = {}) {
    if (next !== 'day' && next !== 'night') return;
    if (persist) { try { localStorage.setItem(KEY, next === 'day' ? 'light' : 'dark'); } catch { /* storage is optional */ } }
    pressed(next);
    if (next === (target || mode())) return;
    const queued = target;
    target = next;
    if (queued) return;   // a relight is already scheduled; it picks up the latest choice
    afterPaint(() => {
      const to = target;
      target = null;
      if (to === mode()) return;
      const FL = window.PrismFirstLight;
      if (FL && FL.relight) FL.relight(() => apply(to), origin, { viewTransition }).catch(() => apply(to));
      else apply(to);
    });
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
    text = curl(text);
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

  // ── curl on Windows ──────────────────────────────────────────────────────
  // In Windows PowerShell 5.1 `curl` is an alias for Invoke-WebRequest, so `curl -sL …` fails
  // ("A parameter cannot be found that matches parameter name 'sL'"). `curl.exe` is the real curl
  // that ships with Windows 10+, and it works in PowerShell 5.1/7, Command Prompt and Git Bash.
  // A [data-shell-toggle] button switches every curl command on the page (shown in [data-curl]
  // spans, copied through copy()) to curl.exe; [data-shell-note] lines explain it. The choice
  // persists as localStorage 'prism-site-shell' ('windows' | 'posix'); a first visit from
  // Windows starts on 'windows'.
  const SHELL_KEY = 'prism-site-shell';
  const onWindows = /win/i.test(navigator.userAgentData?.platform || navigator.platform || '');
  let shellMode = (() => { try { const v = localStorage.getItem(SHELL_KEY); if (v === 'windows' || v === 'posix') return v; } catch { /* optional */ } return onWindows ? 'windows' : 'posix'; })();
  const shellListeners = new Set();
  function curl(text) {
    if (shellMode !== 'windows' || typeof text !== 'string') return text;
    return text.replace(/(^|[\n;|&(]\s*|\$ )curl(?= -)/g, '$1curl.exe');
  }
  const NOTE = {
    posix: 'On Windows PowerShell 5.1? Turn on <b>Windows</b> — plain <code>curl</code> is an alias there and fails.',
    windows: 'Copies <code>curl.exe</code>, the curl built into Windows 10+ — works in PowerShell 5.1 and 7, Command Prompt and Git Bash.',
  };
  function applyShell(scope = document) {
    for (const s of scope.querySelectorAll('[data-curl]')) s.textContent = shellMode === 'windows' ? 'curl.exe' : 'curl';
    for (const b of scope.querySelectorAll('[data-shell-toggle]')) {
      b.setAttribute('aria-pressed', String(shellMode === 'windows'));
      b.title = shellMode === 'windows' ? 'Showing curl.exe for Windows — press for macOS / Linux' : 'Show and copy curl.exe for Windows PowerShell';
    }
    for (const n of scope.querySelectorAll('[data-shell-note]')) n.innerHTML = NOTE[shellMode];
  }
  function setShell(next) {
    if (next !== 'windows' && next !== 'posix') return;
    shellMode = next;
    try { localStorage.setItem(SHELL_KEY, next); } catch { /* optional */ }
    applyShell();
    for (const fn of shellListeners) { try { fn(next); } catch (err) { console.error('[prism-site] shell listener', err); } }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-shell-toggle]');
    if (!b) return;
    setShell(shellMode === 'windows' ? 'posix' : 'windows');
    notify(shellMode === 'windows' ? 'Windows on: commands use curl.exe.' : 'Windows off: commands use curl.');
  });
  applyShell();

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
  // The full play runs once per visitor, not once per session: a later visit gets the ~300ms echo
  // (localStorage 'prism-site-fl-seen'; the inline <head> snippet makes the same call before paint).
  // In the full play the page text doesn't wait for First Light's 940ms blur-in: it rises out of
  // the veil as it lifts and is settled by ~1.1s (Tom: "at 1 s the hero was still blurred"). The rise is transform + blur
  // only: the veil hides the text until it lifts, and text held at opacity 0 isn't painted, which held LCP ~1.5 s.
  const SEEN_KEY = 'prism-site-fl-seen';
  const seenBefore = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };

  // ── the top-bar mark rests (site.css) and turns when asked ───────────────
  // turnMark(turns, ms): its paused CSS animations play `turns` whole turns in `ms`, then rest exactly where they
  // started (the 3/4 lit view). Nothing to turn under reduced motion (the mark has no animation) or paused motion.
  const markEl = document.querySelector('.site-header .prism-mark');
  let markTurning = false;
  function turnMark(turns, ms) {
    if (!markEl || markTurning || root.dataset.motion === 'paused') return;
    const anims = markEl.getAnimations({ subtree: true });
    const period = Number(anims[0]?.effect?.getTiming().duration) || 0;
    if (!period) return;
    markTurning = true;
    const rest = anims.map((a) => a.currentTime);
    for (const a of anims) { a.playbackRate = (turns * period) / ms; a.play(); }
    setTimeout(() => { anims.forEach((a, i) => { a.pause(); a.playbackRate = 1; a.currentTime = rest[i]; }); markTurning = false; }, ms);
  }
  const brandLink = markEl?.closest('a');
  brandLink?.addEventListener('pointerenter', () => turnMark(2, 3200));
  brandLink?.addEventListener('focus', () => { if (brandLink.matches(':focus-visible')) turnMark(2, 3200); });
  try { if (navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4 || navigator.connection?.saveData) root.classList.add('rf-lowpower'); } catch { /* optional */ }

  if (FL && qa !== 'off') {
    const opts = { tiles: staticTiles(), onDone: () => { root.dataset.fl = 'done'; } };
    // A page hero prism ([data-fl-hero] = "entryX entryY exitX exitY fanTop fanBottom", fractions of the art box)
    // turns the full play into one continuous shot: the intro prism morphs into it instead of the top-bar mark.
    const heroArt = document.querySelector('[data-fl-hero]');
    if (heroArt && heroArt.querySelector('.prism-mark')) {
      const g = heroArt.dataset.flHero.trim().split(/\s+/).map(Number);
      opts.hero = { mark: heroArt.querySelector('.prism-mark'), reveal: heroArt, entry: [g[0], g[1]], exit: [g[2], g[3]], fan: g.length > 5 ? [g[4], g[5]] : undefined,
        inPlace: matchMedia('(max-width: 860px)').matches };   // one column: play where the hero is, never across the copy
    }
    if (root.hasAttribute('data-fl-late')) {
      opts.tiles = new Promise((res) => { lateResolve = res; setTimeout(() => res(staticTiles()), 1400); });
    }
    const freeze = qa && /^(?:(full|echo):)?(\d+)$/.exec(qa);
    if (freeze) { opts.mode = freeze[1] || 'full'; opts.freezeAt = Number(freeze[2]); }
    else if (FL.decide(opts) === 'full' && seenBefore()) opts.mode = 'echo';
    const m = opts.mode || FL.decide(opts);
    root.dataset.fl = m;
    const text = m === 'full' ? [...document.querySelectorAll('[data-fl="text"]')] : null;
    if (text) opts.text = [];
    try { firstLight = FL.play(opts); } catch (err) { console.error('[prism-site] First Light', err); root.classList.remove('pfl-armed'); }
    if (m === 'full' && !freeze) { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* optional */ } }
    // the beam docks into the top-bar mark (pages without a hero prism): one turn over the play, then rest
    if (m === 'full' && !freeze && !opts.hero) turnMark(1, (FL.timeline?.end || 1600));
    if (text && text.length) {
      const vh = innerHeight;
      const anims = text.filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh; }).map((el, i) => el.animate(
        [{ transform: 'translateY(6px)', filter: 'blur(3px)' }, { transform: 'none', filter: 'blur(0px)' }],
        { delay: 700 + Math.min(i, 8) * 24, duration: 380, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      if (freeze) anims.forEach((a) => { a.pause(); a.currentTime = Number(freeze[2]); });
      else if (firstLight?.begun) { anims.forEach((a) => a.pause()); firstLight.begun.then(() => anims.forEach((a) => a.play())); }   // ride First Light's steady start
      else firstLight?.finished?.then((info) => { if (info?.skipped) anims.forEach((a) => { try { a.finish(); } catch { /* done */ } }); });
    }
  } else {
    root.classList.remove('pfl-armed');
    root.dataset.fl = 'none';
  }

  apply(mode());
  const tilesReady = (els = []) => { if (lateResolve) { lateResolve([...staticTiles(), ...els]); lateResolve = null; } };
  window.PrismSite = { mode, setMode, onMode: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, firstLight, tilesReady, copy, notify,
    shell: () => shellMode, setShell, curl, applyShell, onShell: (fn) => { shellListeners.add(fn); return () => shellListeners.delete(fn); } };
})();
