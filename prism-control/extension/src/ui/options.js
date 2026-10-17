import { HELP, LEVEL_LABEL, REASON_LABEL, getStatus, retry, $, hostOfPattern, BROAD } from './common.js';

const flash = (id) => { const el = $(id); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1200); };

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { privacyBase: 'full', whileStreaming: 'domain', alwaysHidden: [], mediaAllow: [], profileLabel: '', ...(settings || {}) };
}
async function saveSettings(patch, savedId) {
  const cur = await loadSettings();
  await chrome.storage.local.set({ settings: { ...cur, ...patch } });
  if (savedId) flash(savedId);
}

async function renderStatus(s) {
  s = s || await getStatus();
  if (!s) return;
  $('status').dataset.state = s.status;
  $('line').textContent = s.line;
  $('help').textContent = HELP[s.status] || '';
  $('extId').textContent = s.extId;
  $('hostName').textContent = s.hostName;
  const why = REASON_LABEL[s.privacy.reason];
  $('levelNow').textContent = `Now: ${LEVEL_LABEL[s.privacy.level]}${why ? ` (${why})` : ''}`;
}

async function renderSettings() {
  const s = await loadSettings();
  $('profileLabel').value = s.profileLabel;
  for (const r of document.querySelectorAll('input[name=level]')) r.checked = r.value === s.privacyBase;
  $('whileStreaming').value = s.whileStreaming === 'hidden' || s.whileStreaming === 'full' ? s.whileStreaming : 'domain';
  $('alwaysHidden').value = (s.alwaysHidden || []).join('\n');
  $('mediaAllow').value = (s.mediaAllow || []).join('\n');
}

async function renderSites() {
  const all = await chrome.permissions.getAll();
  const list = $('siteList');
  list.textContent = '';
  const origins = (all.origins || []).filter((o) => o !== '<all_urls>');
  if (!origins.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No sites yet. Press the media key on your deck, or add one here.';
    list.append(li);
  }
  for (const o of origins) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'mono';
    name.textContent = BROAD.has(o) ? `${o} (all sites)` : hostOfPattern(o);
    const b = document.createElement('button');
    b.className = 'ghost';
    b.textContent = 'Remove';
    b.onclick = async () => { await chrome.permissions.remove({ origins: [o] }).catch(() => {}); renderSites(); };
    li.append(name, b);
    list.append(li);
  }
  for (const btn of document.querySelectorAll('[data-perm]')) {
    const has = (all.permissions || []).includes(btn.dataset.perm);
    btn.textContent = has ? 'Remove' : 'Grant';
    btn.className = has ? 'ghost' : '';
  }
  for (const btn of document.querySelectorAll('[data-origin]')) {
    const has = (all.origins || []).includes(btn.dataset.origin);
    btn.textContent = has ? 'Remove' : 'Grant';
    btn.className = has ? 'ghost' : '';
  }
}

function patternFor(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  if (!s.includes('://')) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch { return null; }
}

// ---- wiring (every grant runs inside the click: permissions.request needs the gesture) ----
$('retry').onclick = async () => renderStatus(await retry());

let labelTimer = null;
$('profileLabel').oninput = () => {
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => saveSettings({ profileLabel: $('profileLabel').value }, 'profileSaved'), 400);
};
for (const r of document.querySelectorAll('input[name=level]')) r.onchange = () => saveSettings({ privacyBase: r.value }, 'privacySaved');
$('whileStreaming').onchange = () => saveSettings({ whileStreaming: $('whileStreaming').value }, 'privacySaved');
$('alwaysHidden').onchange = () => saveSettings({ alwaysHidden: $('alwaysHidden').value.split(/[\s,]+/).filter(Boolean) }, 'privacySaved');
$('mediaAllow').onchange = () => saveSettings({ mediaAllow: $('mediaAllow').value.split(/[\s,]+/).filter(Boolean) }, 'privacySaved');

$('addSiteBtn').onclick = async () => {
  const p = patternFor($('addSite').value);
  if (!p) { $('addSite').focus(); return; }
  if (await chrome.permissions.request({ origins: [p] }).catch(() => false)) $('addSite').value = '';
  renderSites();
};
$('allSites').onclick = async () => {
  await chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] }).catch(() => false);
  renderSites();
};
for (const btn of document.querySelectorAll('[data-perm]')) {
  btn.onclick = async () => {
    const perm = btn.dataset.perm;
    const has = btn.textContent === 'Remove';   // decided synchronously: request() needs the live gesture
    if (has) await chrome.permissions.remove({ permissions: [perm] }).catch(() => {});
    else await chrome.permissions.request({ permissions: [perm] }).catch(() => false);
    renderSites();
  };
}
for (const btn of document.querySelectorAll('[data-origin]')) {
  btn.onclick = async () => {
    const origins = [btn.dataset.origin];
    const has = btn.textContent === 'Remove';
    if (has) await chrome.permissions.remove({ origins }).catch(() => {});
    else await chrome.permissions.request({ origins }).catch(() => false);
    renderSites();
  };
}

// options.html#grant=<pattern>: the fallback for browsers without permissions.addHostAccessRequest.
function handleHash() {
  const m = /^#grant=(.+)$/.exec(location.hash);
  const banner = $('grantBanner');
  if (!m) { banner.hidden = true; return; }
  const p = patternFor(decodeURIComponent(m[1]).replace(/\/\*$/, '/'));
  if (!p) { banner.hidden = true; return; }
  banner.hidden = false;
  $('grantHost').textContent = hostOfPattern(p);
  $('grantBtn').onclick = async () => {
    if (await chrome.permissions.request({ origins: [p] }).catch(() => false)) { flash('grantSaved'); renderSites(); }
  };
}
window.addEventListener('hashchange', handleHash);

chrome.permissions.onAdded.addListener(renderSites);
chrome.permissions.onRemoved.addListener(renderSites);

handleHash();
renderStatus();
renderSettings();
renderSites();
setInterval(renderStatus, 1500);
