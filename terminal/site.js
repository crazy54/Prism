// Site chrome for the terminal pages. Night/Day (with the relight), First Light, copy and the
// toast live in ../assets/site.js (window.PrismSite, loaded first); this module re-exports them
// for terminal.js / tty.js, plus the engine paths and the terminal theme that follows the page.

const site = window.PrismSite;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const notify = (message) => site?.notify(message);
export const copy = (text, button) => site?.copy(text, button);
/** 'night' | 'day' — the page's mode. onMode(fn) runs fn(mode) after every relight. */
export const mode = () => site?.mode() || (document.documentElement.dataset.rfMode === 'day' ? 'day' : 'night');
export const onMode = (fn) => site?.onMode(fn);

/** Kept for the page scripts: copy buttons ([data-copy]) and the theme switch are wired by assets/site.js. */
export function initChrome() {}

/** The prism-term engine base (<meta name="prism-engine">; the site build points it at ./engine/). */
export const engineBase = new URL(document.querySelector('meta[name="prism-engine"]')?.content || './engine/', location.href);
export const engineUrl = (rel) => new URL(rel, engineBase).href;

/**
 * The terminal theme that matches the page: prism-dark at Night, prism-light by Day — whichever of
 * those ids the engine's palettes provide (prism-term/src/themes.js), else the engine default.
 */
export function pageTheme(themes) {
  const want = mode() === 'day' ? 'prism-light' : 'prism-dark';
  return themes.some((t) => t.id === want) ? want : undefined;
}

/** Copy button markup with the icon family. */
export const copyButton = (text, label) => `<button type="button" class="chip-btn" data-copy="${esc(text)}" aria-label="${esc(label)}"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg><span data-label>Copy</span></button>`;
