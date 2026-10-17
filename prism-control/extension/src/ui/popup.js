import { HELP, LEVEL_LABEL, REASON_LABEL, getStatus, retry, $, originPattern } from './common.js';

async function render(s) {
  s = s || await getStatus();
  const box = $('status');
  if (!s) { box.dataset.state = 'host_error'; $('line').textContent = 'Extension starting...'; return; }
  box.dataset.state = s.status;
  $('line').textContent = s.line;
  $('help').textContent = HELP[s.status] || '';
  $('safe').hidden = s.privacy.level === 'full';
  const parts = [];
  parts.push(`${s.browser.brand}${s.browser.major ? ' ' + s.browser.major : ''}${s.profile.label ? ' · ' + s.profile.label : ''}`);
  const why = REASON_LABEL[s.privacy.reason];
  parts.push(`Streamer-safe: ${LEVEL_LABEL[s.privacy.level]}${why ? ` (${why})` : ''}`);
  if (s.status === 'connected') parts.push(`${s.counts.tabs} tabs · ${s.counts.media} media`);
  if (s.status !== 'connected' && s.nextAt > Date.now()) parts.push(`Next try in ${Math.ceil((s.nextAt - Date.now()) / 1000)} s`);
  const meta = $('meta');
  meta.textContent = '';
  for (const p of parts) { const d = document.createElement('div'); d.textContent = p; meta.append(d); }
  const id = document.createElement('div');
  id.className = 'mono';
  id.textContent = `id ${s.extId}`;
  meta.append(id);
}

async function renderSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pattern = tab && originPattern(tab.url || '');
  if (!pattern) return;
  const host = new URL(tab.url).hostname;
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  $('site').hidden = false;
  $('siteName').textContent = host;
  const btn = $('siteBtn');
  btn.textContent = granted ? 'On' : 'Enable';
  btn.disabled = granted;
  btn.onclick = async () => {
    // The click is the user gesture permissions.request() needs.
    const ok = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
    if (ok) { btn.textContent = 'On'; btn.disabled = true; }
  };
}

$('retry').onclick = async () => render(await retry());
$('options').onclick = () => chrome.runtime.openOptionsPage();

render();
renderSite();
setInterval(render, 1000);
