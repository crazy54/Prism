(() => {
  'use strict';
  const root = document.documentElement;
  const byId = (id) => document.getElementById(id);
  const frames = [...document.querySelectorAll('.facet iframe')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches;
  let toastTimer;
  let showcasePromise;

  function notify(message) {
    const toast = byId('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function updateFrame(frame) {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    // An iframe has its own canvas and color scheme; transparency can show white.
    // Paint the same background as the outer page, including after theme changes.
    doc.documentElement.style.colorScheme = root.dataset.theme;
    doc.documentElement.style.setProperty('--preview-bg', getComputedStyle(root).getPropertyValue('--bg').trim());
    let overrides = doc.getElementById('preview-theme');
    if (!overrides) {
      overrides = doc.createElement('style');
      overrides.id = 'preview-theme';
      doc.head.append(overrides);
    }
    overrides.textContent = root.dataset.theme === 'light'
      ? ':root{--bg:#f6f5f9;--panel:#fff;--panel2:#eeedf5;--card:#fff;--line:#dedce9;--ink:#20202e;--muted:#626274;--dim:#707081;--gray:#72869f;--cardgrad:linear-gradient(157deg,#7353bb08,transparent 55%)}'
      : '';
    for (const animation of doc.getAnimations()) {
      if (paused) animation.pause();
      else animation.play();
    }
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    byId('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0a0c12' : '#f6f5f9';
    try { localStorage.setItem('prism-site-theme', theme); } catch { /* Preferences remain usable without storage. */ }
    frames.forEach(updateFrame);
  }

  function setMotion(value) {
    paused = value;
    root.dataset.motion = paused ? 'paused' : 'playing';
    const button = byId('motion-toggle');
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? '▶ Resume motion' : 'Ⅱ Pause motion';
    document.querySelectorAll('.live-dot').forEach((badge) => { badge.textContent = paused ? 'PAUSED' : 'LIVE'; });
    frames.forEach(updateFrame);
  }

  async function copy(text, button) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      notify('Copied. Go make something.');
      if (button) {
        const previous = button.textContent;
        button.textContent = 'Copied ✓';
        setTimeout(() => { button.textContent = previous; }, 2000);
      }
    } catch {
      const field = byId('copy-fallback');
      field.value = text;
      const dialog = byId('copy-dialog');
      if (!dialog.open) dialog.showModal();
      field.focus();
      field.select();
    }
  }

  function loadShowcase() {
    if (!showcasePromise) {
      showcasePromise = fetch('assets/showcase.json').then((response) => {
        if (!response.ok) throw new Error('Could not load snippets');
        return response.json();
      }).catch((error) => { showcasePromise = null; throw error; });
    }
    return showcasePromise;
  }

  document.querySelectorAll('[data-copy-facet]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const effects = await loadShowcase();
        const effect = effects.find((item) => item.id === button.dataset.copyFacet);
        if (!effect) throw new Error('Facet unavailable');
        await copy(effect.snippet, button);
      } catch { notify('Could not load the snippet. Open the library to copy this facet.'); }
      finally { button.disabled = false; }
    });
  });
  document.querySelectorAll('[data-replay]').forEach((button) => {
    button.addEventListener('click', () => {
      setMotion(false);
      const frame = frames.find((item) => item.getAttribute('src').includes(button.dataset.replay));
      for (const animation of frame?.contentDocument?.getAnimations() || []) {
        animation.currentTime = 0;
        animation.play();
      }
      notify('Animation replayed.');
    });
  });

  const galleries = [...document.querySelectorAll('[data-gallery]')];
  byId('gallery-search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    let count = 0;
    galleries.forEach((gallery) => {
      const visible = gallery.dataset.gallery.toLowerCase().includes(query);
      gallery.hidden = !visible;
      if (visible) count++;
    });
    byId('empty-state').hidden = count !== 0;
    byId('gallery-status').textContent = `${count} ${count === 1 ? 'gallery' : 'galleries'} found.`;
  });

  const commands = {
    browser: 'git clone https://github.com/crazy54/Prism.git\ncd Prism\n\n# Open Prism.html in your browser.\n# Or double-click the downloaded file.',
    mcp: 'git clone https://github.com/crazy54/Prism.git\ncd Prism/prism-mcp-server\n\n# Verify your catalog\nnode cli.js info --catalog ../Prism.html\n\n# Start the local MCP server\nnode cli.js start --catalog ../Prism.html'
  };
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      byId(item.getAttribute('aria-controls')).hidden = !selected;
    });
    const agent = tab.id === 'mcp-tab';
    byId('quickstart-code').textContent = commands[agent ? 'mcp' : 'browser'];
    byId('code-label').textContent = agent ? 'CONNECT THE CATALOG' : 'GET THE LIBRARY';
    byId('code-footer').textContent = agent ? 'Node.js 18+. No npm install needed.' : 'Your browser is the only dependency.';
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
  byId('copy-command').addEventListener('click', (event) => copy(byId('quickstart-code').textContent, event.currentTarget));
  byId('close-copy-dialog').addEventListener('click', () => byId('copy-dialog').close());
  byId('theme-toggle').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  byId('motion-toggle').addEventListener('click', () => setMotion(!paused));
  frames.forEach((frame) => frame.addEventListener('load', () => updateFrame(frame)));
  reducedMotion.addEventListener('change', (event) => setMotion(event.matches));
  let theme = 'dark';
  try { if (localStorage.getItem('prism-site-theme') === 'light') theme = 'light'; } catch { /* Use the default theme. */ }
  setTheme(theme);
  setMotion(paused);
})();
