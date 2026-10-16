// Prism website — the landing page. Shared chrome (Night/Day + relight, First Light, copy,
// toast) lives in assets/site.js as window.PrismSite; this file wires the page itself.
(() => {
  'use strict';
  const root = document.documentElement;
  const byId = (id) => document.getElementById(id);
  const site = window.PrismSite;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const frames = [...document.querySelectorAll('.facet iframe')];
  let paused = reducedMotion.matches;
  let showcasePromise;
  const engines = { term: null, deck: null };

  // ── live previews take the page's own theme tokens ───────────────────────
  // Facets read the theme contract (--bg, --ink, --accent …). The previews were generated with the
  // catalog's default tokens; paint each frame with the Prism Night / Day values this page is using,
  // exactly as the app's theme switch does (a pure :root token swap).
  const CONTRACT = ['--bg', '--panel', '--panel2', '--card', '--line', '--ink', '--muted', '--dim', '--accent', '--accent-rgb', '--accent2', '--info', '--info-rgb', '--pos', '--pos-rgb', '--warn', '--warn-rgb', '--neg', '--neg-rgb', '--crit', '--crit-rgb', '--cardgrad', '--r-sm', '--r-md', '--r-lg', '--r-xl', '--elev-1', '--elev-2', '--dur', '--ease', '--bd', '--head-w', '--dens'];
  let tokenCss = '';
  function readTokens() {
    const cs = getComputedStyle(root);
    tokenCss = `:root{color-scheme:${site?.mode() === 'day' ? 'light' : 'dark'};${CONTRACT.map((k) => `${k}:${cs.getPropertyValue(k).trim()}`).join(';')};--preview-bg:${cs.getPropertyValue('--bg').trim()}}`;
  }
  function updateFrame(frame) {
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc || !doc.head) return;
    let style = doc.getElementById('preview-theme');
    if (!style) { style = doc.createElement('style'); style.id = 'preview-theme'; doc.head.append(style); }
    if (style.textContent !== tokenCss) style.textContent = tokenCss;
    for (const a of doc.getAnimations()) { if (paused || frame.__offscreen) a.pause(); else a.play(); }
  }
  const allFrames = () => [...frames, ...document.querySelectorAll('.mini-tile iframe[src]')];
  const refreshFrames = () => allFrames().forEach(updateFrame);

  // Previews hold still while they're off-screen.
  const frameObserver = new IntersectionObserver((entries) => {
    for (const e of entries) { e.target.__offscreen = !e.isIntersecting; updateFrame(e.target); }
  }, { rootMargin: '80px' });
  function watchFrame(frame) {
    frame.addEventListener('load', () => updateFrame(frame));
    frameObserver.observe(frame);
    updateFrame(frame);
  }
  readTokens();
  frames.forEach(watchFrame);

  // ── motion ───────────────────────────────────────────────────────────────
  function setMotion(value) {
    paused = value;
    root.dataset.motion = paused ? 'paused' : 'playing';
    // the paused rules key on these regions (a root-level [data-motion] … * rule restyled the whole page)
    document.querySelectorAll('.hero-fx, .hero-art, .brand .prism-mark').forEach((el) => el.classList.toggle('is-paused', paused));
    const b = byId('motion-toggle');
    b.innerHTML = paused
      ? '<svg class="ic" aria-hidden="true"><use href="#i-play"/></svg><span>Resume motion</span>'
      : '<svg class="ic" aria-hidden="true"><use href="#i-pause"/></svg><span>Pause motion</span>';
    document.querySelectorAll('.live-dot').forEach((badge) => { badge.textContent = paused ? 'PAUSED' : 'LIVE'; });
    refreshFrames();
    engines.term?.web.setGlobalMotion(paused);
    engines.deck?.setGlobalMotion(paused);
  }
  byId('motion-toggle').addEventListener('click', () => setMotion(!paused));
  reducedMotion.addEventListener('change', (e) => setMotion(e.matches));

  // The hero art (CSS) and the header mark rest while they're scrolled away.
  const art = document.querySelector('.hero-art');
  new IntersectionObserver(([e]) => art.classList.toggle('is-offscreen', !e.isIntersecting)).observe(art);

  // ── copy + replay ────────────────────────────────────────────────────────
  function loadShowcase() {
    showcasePromise ||= fetch('assets/showcase.json').then((r) => { if (!r.ok) throw new Error('snippets'); return r.json(); }).catch((err) => { showcasePromise = null; throw err; });
    return showcasePromise;
  }
  // F1 (Copy that works): the same shape as every Copy in the library — a "Prism · name" comment, one <style>
  // (the theme tokens + the facet's CSS), the markup in a .prism-snippet wrapper that carries font and colour.
  function asSnippet(effect) {
    const s = effect.snippet, end = s.indexOf('</style>'), name = String(effect.name).replace(/--/g, '-');
    if (end < 0 || s.includes('class="prism-snippet"')) return `<!-- Prism · ${name} -->\n${s}`;
    const wrap = '.prism-snippet{font-family:var(--font);color:var(--ink);font-size:14px;line-height:1.5;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;min-height:160px;padding:16px;position:relative}:where(.prism-snippet) *,:where(.prism-snippet) ::before,:where(.prism-snippet) ::after{box-sizing:border-box}';
    return `<!-- Prism · ${name} -->\n${s.slice(0, end).trimEnd()}\n${wrap}\n</style>\n<div class="prism-snippet">\n${s.slice(end + 8).trim()}\n</div>`;
  }
  document.querySelectorAll('[data-copy-facet]').forEach((button) => {
    // Busy, not disabled: disabling the focused button would drop keyboard focus to <body>.
    button.addEventListener('click', async () => {
      if (button.getAttribute('aria-busy') === 'true') return;
      button.setAttribute('aria-busy', 'true');
      try {
        const effect = (await loadShowcase()).find((item) => item.id === button.dataset.copyFacet);
        if (!effect) throw new Error('Facet unavailable');
        await site.copy(asSnippet(effect), button);
      } catch { site.notify('Could not load the snippet. Open the library to copy this facet.'); }
      finally { button.removeAttribute('aria-busy'); }
    });
  });
  document.querySelectorAll('[data-replay]').forEach((button) => {
    button.addEventListener('click', () => {
      if (paused) setMotion(false);
      const frame = frames.find((item) => item.getAttribute('src').includes(button.dataset.replay));
      for (const a of frame?.contentDocument?.getAnimations() || []) { a.currentTime = 0; a.play(); }
      site.notify('Animation replayed.');
    });
  });

  // ── galleries: search + the spectral ruler ───────────────────────────────
  const galleries = [...document.querySelectorAll('[data-gallery]')];
  const ruler = byId('gallery-ruler');
  ruler.innerHTML = galleries.map((g, i) => `<i style="left:${(i / (galleries.length - 1)) * 100}%" data-rf-gallery="${g.dataset.rfGallery}"></i>`).join('');
  const ticks = [...ruler.children];
  galleries.forEach((g, i) => {
    const on = () => ticks.forEach((t, j) => t.classList.toggle('is-on', j === i));
    const off = () => ticks[i].classList.remove('is-on');
    g.addEventListener('pointerenter', on); g.addEventListener('focus', on);
    g.addEventListener('pointerleave', off); g.addEventListener('blur', off);
  });
  byId('gallery-search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    let count = 0;
    galleries.forEach((g, i) => {
      const visible = g.dataset.gallery.toLowerCase().includes(query);
      g.hidden = !visible;
      ticks[i].classList.toggle('is-on', !!query && visible);
      if (visible) count++;
    });
    byId('empty-state').hidden = count !== 0;
    byId('gallery-status').textContent = `${count} ${count === 1 ? 'gallery' : 'galleries'} found.`;
  });

  // ── quick starts ─────────────────────────────────────────────────────────
  const quickstarts = {
    'browser-tab': { label: 'GET THE LIBRARY', footer: 'Your browser is the only dependency.',
      code: 'git clone https://github.com/crazy54/Prism.git\ncd Prism\n\n# Open Prism.html in your browser.\n# Or double-click the downloaded file.' },
    'mcp-tab': { label: 'CONNECT THE CATALOG', footer: 'Node.js 18+. No npm install needed.',
      code: 'git clone https://github.com/crazy54/Prism.git\ncd Prism/prism-mcp-server\n\n# Verify the catalogs (web + terminal)\nnode cli.js info --catalog ../Prism.html\n\n# Start the local MCP server\nnode cli.js start --catalog ../Prism.html' },
    'terminal-tab': { label: 'BROWSE FROM YOUR TERMINAL', footer: () => (site?.shell() === 'windows' ? 'Windows: curl.exe works in PowerShell 5.1 and 7, Command Prompt and Git Bash.' : 'Windows PowerShell 5.1: turn on Windows above — plain curl is an alias there.'), shell: true,
      code: '# Browse the terminal site. Nothing to install.\ncurl -sL https://prism.jeremyfhall.com/tty\n\n# Run the live player (Node.js 18+)\nnpx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term' },
    'deck-tab': { label: 'PUT PRISM ON YOUR STREAM DECK', footer: 'Stream Deck 7.6+ on Windows and macOS · OpenDeck on Linux.',
      code: '# 1. The plugin: live, animated keys, dials and strips\n#    Double-click com.jeremyfhall.prism.streamDeckPlugin\n\n# 2. Or an icon pack, for any action (11 themes)\n#    Double-click com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack\n\n# 3. Or a ready-made profile for your device\n#    Double-click "Prism - <device>.streamDeckProfile"' },
  };
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      byId(item.getAttribute('aria-controls')).hidden = !selected;
    });
    const q = quickstarts[tab.id] || quickstarts['browser-tab'];
    byId('quickstart-code').textContent = site ? site.curl(q.code) : q.code;
    byId('code-label').textContent = q.label;
    byId('code-footer').textContent = typeof q.footer === 'function' ? q.footer() : q.footer;
    byId('qs-shell').hidden = !q.shell;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });
  site?.onShell?.(() => selectTab(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]));
  byId('copy-command').addEventListener('click', (e) => site.copy(byId('quickstart-code').textContent, e.currentTarget));

  // ── three surfaces ───────────────────────────────────────────────────────
  // Web: a miniature of the app, its rail lit as a spectrum, with one live tile.
  const rail = byId('mini-rail');
  rail.innerHTML = galleries.map((g, i) => `<span data-rf-gallery="${g.dataset.rfGallery}"${i === 0 ? ' class="is-on"' : ''}><i></i><b style="max-width:${58 + ((i * 37) % 40)}%"></b></span>`).join('');
  const surfaces = byId('surfaces');
  let surfacesStarted = false;
  new IntersectionObserver((entries, obs) => {
    if (!entries.some((e) => e.isIntersecting) || surfacesStarted) return;
    surfacesStarted = true;
    obs.disconnect();
    const mini = document.querySelector('.mini-tile iframe[data-src]');
    if (mini) { mini.src = mini.dataset.src; mini.removeAttribute('data-src'); watchFrame(mini); }
    startTerminal();
    startDeck();
  }, { rootMargin: '300px' }).observe(surfaces);
  let railStep = 0;
  setInterval(() => {
    if (paused || document.hidden || !surfacesStarted) return;
    const items = rail.children;
    items[railStep % items.length].classList.remove('is-on');
    railStep++;
    items[railStep % items.length].classList.add('is-on');
  }, 1600);

  // Terminal: the real prism-term engine playing its own Prism mark. In the repository the engine
  // sits at ../prism-term/; the built site serves it from terminal/engine/.
  const termEngine = /\/website\/(?:index\.html)?$/.test(location.pathname) ? '../prism-term/' : 'terminal/engine/';
  const termTheme = () => (site?.mode() === 'day' ? 'prism-light' : 'prism-dark');
  async function startTerminal() {
    const screen = byId('term-preview');
    try {
      const base = new URL(termEngine, location.href);
      const [web, palettes, mod] = await Promise.all([
        import(new URL('src/web/index.js', base).href),
        import(new URL('src/palettes.js', base).href),
        import(new URL('src/facets/objects/prism-logo.js', base).href),
      ]);
      const ids = new Set(palettes.listThemes().map((t) => t.id));
      const theme = () => (ids.has(termTheme()) ? termTheme() : undefined);
      const fit = () => ({ width: Math.max(160, screen.clientWidth - 20), height: Math.max(90, screen.clientHeight - 16) });
      screen.replaceChildren();
      const player = web.mountFacet(screen, { id: 'prism-logo', ...mod.default }, { cols: 96, rows: 30, params: { label: 'off' }, fit: fit(), fps: 20, theme: theme(), label: 'Prism’s mark, rendered live by prism-term' });
      engines.term = { web, player };
      web.setGlobalMotion(paused);
      new ResizeObserver(() => player.set({ fit: fit() })).observe(screen);
      site?.onMode(() => player.set({ theme: theme() }));
    } catch (err) {
      console.warn('[prism] terminal preview: engine unavailable, showing the braille stand-in.', err?.message || err);
      brailleDemo(screen);
    }
  }
  // Stand-in when the engine can't load: a braille spinner and an eighth-block meter, the way prism-term draws them.
  function brailleDemo(screen) {
    const demo = screen.querySelector('.term-demo');
    if (!demo) return;
    const spin = demo.querySelector('.term-spin'), name = demo.querySelector('.term-demo-facet'), meter = demo.querySelector('.term-meter'), pct = demo.querySelector('.term-pct');
    const spinFrames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏', eighths = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'], names = ['plasma', 'donut', 'matrix', 'globe', 'fire', 'synthwave'];
    let tick = 0;
    const draw = (p, n, f) => {
      const cells = p * 16, full = Math.floor(cells), part = eighths[Math.floor((cells - full) * 8)] || '';
      meter.textContent = `▕${'█'.repeat(full)}${part}${' '.repeat(Math.max(0, 16 - full - (part ? 1 : 0)))}▏`;
      pct.textContent = `${Math.round(p * 100)}%`; name.textContent = names[n]; spin.textContent = p >= 1 ? '✓' : spinFrames[f % spinFrames.length];
    };
    draw(0.62, 0, 0);
    setInterval(() => { if (paused || document.hidden) return; tick++; const step = tick % 42; draw(Math.min(1, step / 34), Math.floor(tick / 42) % names.length, tick); }, 80);
  }

  // Stream Deck: prism-deck's own runtime dressing a virtual Stream Deck + in the Prism theme
  // (../prism-deck/ in the repository, deck/engine/ in the built site).
  const deckEngine = /\/website\/(?:index\.html)?$/.test(location.pathname) ? '../prism-deck/' : 'deck/engine/';
  async function startDeck() {
    // #deck-preview holds a static poster of the device (index.html) until the engine has
    // mounted; CSS sizes the mount to fit the stage, and fit:true keeps the device at that width.
    const mount = byId('deck-preview'), stage = mount.parentElement, poster = mount.innerHTML;
    try {
      const { loadDeck } = await import('./assets/deck/adapter.js');
      // only the facet this preview plays: the built site's deck/engine/core.bundle.js carries it (no facets bundle here)
      const deck = await loadDeck({ engine: deckEngine, catalog: { facets: [], galleries: [], devices: [] }, only: ['src/facets/themes/prism.js'] });
      engines.deck = deck;
      if (deck.source === 'prism-deck') deck.mountDevice(mount, { model: 'plus', facet: 'theme-prism', interactive: false, fit: true });
      else deck.mountDevice(mount, { model: 'plus', interactive: false, keys: ['status-api-health', 'meter-cpu-ring', 'time-clock', 'toggle-mic', 'media-levels', 'devops-build', 'stream-on-air', 'prod-weather'], dials: ['dial-volume', 'dial-brightness', 'dial-temp', 'dial-scrub'] });
      deck.setGlobalMotion(paused);
      site?.onMode(() => deck.refreshMode());
      stage.classList.add('is-live');
    } catch (err) {
      // the poster stays; say so, and point at the page that has the full catalog
      console.warn('[prism] deck preview unavailable', err?.message || err);
      if (!mount.querySelector('.deck-poster')) mount.innerHTML = poster;
      stage.classList.add('is-poster');
      stage.insertAdjacentHTML('beforeend', '<p class="sc-deck-note">Live preview unavailable · <a href="deck/">open the Stream Deck page</a></p>');
    }
  }

  site?.onMode(() => { readTokens(); refreshFrames(); });
  setMotion(paused);
})();
