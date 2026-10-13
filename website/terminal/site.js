// Site chrome shared by the terminal pages — same behaviour as the landing page
// (../app.js): theme toggle stored as 'prism-site-theme', copy with a dialog
// fallback, and the "Copied." toast.

const root = document.documentElement;
const byId = (id) => document.getElementById(id);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let toastTimer;
export function notify(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

export async function copy(text, button) {
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

function setTheme(theme) {
  root.dataset.theme = theme;
  byId('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0a0c12' : '#f6f5f9';
  try { localStorage.setItem('prism-site-theme', theme); } catch { /* Preferences remain usable without storage. */ }
}

/** Wire the header theme toggle, [data-copy] buttons and the copy dialog. */
export function initChrome() {
  setTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
  byId('theme-toggle').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  byId('close-copy-dialog').addEventListener('click', () => byId('copy-dialog').close());
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.dataset.copy, b);
  });
}

/** The prism-term engine base (<meta name="prism-engine">; the site build points it at ./engine/). */
export const engineBase = new URL(document.querySelector('meta[name="prism-engine"]')?.content || './engine/', location.href);
export const engineUrl = (rel) => new URL(rel, engineBase).href;
