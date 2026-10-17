// URL, domain and match-pattern helpers. Pure functions (unit-tested in Node).

/**
 * Multi-label public suffixes we know about. This is a deliberately small built-in list, used when the
 * browser offers no public-suffix API. Missing entries only make the "domain" label one level too short
 * (e.g. `example.co.zz` shows as `co.zz`), which never leaks more than the real registrable domain would.
 */
const MULTI_SUFFIXES = new Set(`
co.uk org.uk ac.uk gov.uk me.uk ltd.uk plc.uk net.uk sch.uk nhs.uk police.uk
com.au net.au org.au edu.au gov.au asn.au id.au co.nz org.nz net.nz ac.nz govt.nz
co.jp ne.jp or.jp ac.jp go.jp gr.jp ed.jp lg.jp co.kr or.kr ne.kr go.kr ac.kr
com.br net.br org.br gov.br com.cn net.cn org.cn gov.cn edu.cn com.hk org.hk net.hk edu.hk gov.hk
com.tw org.tw net.tw edu.tw gov.tw com.sg org.sg net.sg edu.sg gov.sg com.my org.my net.my
co.in net.in org.in gov.in ac.in firm.in gen.in ind.in co.za org.za net.za gov.za ac.za
com.mx org.mx gob.mx com.ar org.ar gob.ar com.tr org.tr gov.tr edu.tr co.il org.il ac.il gov.il
com.ph org.ph co.id or.id ac.id go.id com.vn com.ua com.pl net.pl org.pl com.es org.es com.pt
co.th or.th ac.th go.th com.sa com.eg com.pk com.ng com.co com.pe com.ve com.ec com.uy
github.io gitlab.io pages.dev workers.dev netlify.app vercel.app herokuapp.com blogspot.com
appspot.com web.app firebaseapp.com azurewebsites.net cloudfront.net s3.amazonaws.com fly.dev
onrender.com glitch.me ngrok.io ngrok-free.app myshopify.com wordpress.com substack.com
`.trim().split(/\s+/));

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Parses a URL; returns null for anything unparsable. */
export function parseUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  try { return new URL(url); } catch { return null; }
}

/** Lowercased hostname without a trailing dot, or null. */
export function hostOf(url) {
  const u = typeof url === 'string' ? parseUrl(url) : url;
  if (!u || !u.hostname) return null;
  return u.hostname.toLowerCase().replace(/\.$/, '');
}

/**
 * The registrable domain (eTLD+1) of a host: `www.news.example.co.uk` -> `example.co.uk`.
 * IP literals, `localhost` and single labels are returned as they are.
 * `native` is an optional browser-provided function (host) => registrable domain | null.
 */
export function registrableDomain(host, native) {
  if (!host) return null;
  host = host.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || IPV4.test(host) || !host.includes('.')) return host;
  if (typeof native === 'function') {
    try {
      const r = native(host);
      if (typeof r === 'string' && r.length > 0) return r.toLowerCase();
    } catch { /* fall through to the built-in list */ }
  }
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const last2 = labels.slice(-2).join('.');
  if (MULTI_SUFFIXES.has(last2)) return labels.slice(-3).join('.');
  const last3 = labels.slice(-3).join('.');
  if (labels.length >= 4 && MULTI_SUFFIXES.has(last3)) return labels.slice(-4).join('.');
  return last2;
}

/** Registrable domain of a URL, or null for non-network URLs. */
export function domainOfUrl(url, native) {
  const u = parseUrl(url);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  return registrableDomain(hostOf(u), native);
}

/** The origin match pattern for a URL (`https://video.example/*`), or null if it can't be granted. */
export function originPattern(url) {
  const u = parseUrl(url);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null;
  return `${u.protocol}//${u.hostname}/*`;
}

/**
 * Chrome match-pattern test (scheme://host/path). Supports `<all_urls>`, `*` scheme (http/https),
 * `*.` host prefixes, `*` host and path globs. Ports in patterns are not used by Chrome for hosts.
 */
export function matchesPattern(pattern, url) {
  const u = typeof url === 'string' ? parseUrl(url) : url;
  if (!u) return false;
  if (pattern === '<all_urls>') return ['http:', 'https:', 'file:', 'ftp:', 'ws:', 'wss:'].includes(u.protocol);
  const p = compiledPattern(pattern);
  if (!p) return false;
  const proto = u.protocol.slice(0, -1);
  if (p.scheme === '*') { if (proto !== 'http' && proto !== 'https') return false; }
  else if (p.scheme !== proto) return false;
  const h = (u.hostname || '').toLowerCase();
  if (p.host !== '*') {
    if (p.base !== null) {
      if (h !== p.base && !h.endsWith('.' + p.base)) return false;
    } else if (p.host !== h) return false;
  }
  return p.path.test(u.pathname + u.search);
}

// Parsed patterns, so thousands of tabs x granted sites don't compile a RegExp per test (review MED 9).
const PATTERN_CACHE = new Map();
function compiledPattern(pattern) {
  let p = PATTERN_CACHE.get(pattern);
  if (p !== undefined) return p;
  const m = /^(\*|https?|wss?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m) p = null;
  else {
    const [, scheme, host, path] = m;
    p = {
      scheme,
      host: host === '*' ? '*' : host.toLowerCase().split(':')[0],
      base: host.startsWith('*.') ? host.slice(2).toLowerCase() : null,
      path: new RegExp('^' + path.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'),
    };
  }
  if (PATTERN_CACHE.size > 512) PATTERN_CACHE.clear();
  PATTERN_CACHE.set(pattern, p);
  return p;
}

/** Schemes and hosts where extensions can never run scripts. */
const BLOCKED_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com']);

/**
 * Whether the extension can script this tab's page: `granted`, `none` (could be granted) or
 * `blocked` (browser pages, the stores, file: without access, etc.).
 */
export function accessFor(url, grantedPatterns) {
  const u = url instanceof URL ? url : parseUrl(url);
  if (!u) return 'blocked';
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'blocked';
  const h = hostOf(u);
  if (BLOCKED_HOSTS.has(h)) return 'blocked';
  for (const p of grantedPatterns) if (matchesPattern(p, u)) return 'granted';
  return 'none';
}

/** True when `host` equals or is a subdomain of any entry in `list` (entries are bare domains). */
export function hostInList(host, list) {
  if (!host || !list) return false;
  for (const raw of list) {
    const d = String(raw).trim().toLowerCase().replace(/^\*\./, '').replace(/^\.+|\.+$/g, '');
    if (!d) continue;
    if (host === d || host.endsWith('.' + d)) return true;
  }
  return false;
}

/** Normalizes user-entered domain lists (one per line or comma separated). */
export function parseDomainList(text) {
  if (Array.isArray(text)) text = text.join('\n');
  if (typeof text !== 'string') return [];
  const out = [];
  for (let s of text.split(/[\s,]+/)) {
    s = s.trim().toLowerCase();
    if (!s) continue;
    const u = parseUrl(s.includes('://') ? s : `https://${s}`);
    const h = u && hostOf(u);
    if (h && !out.includes(h)) out.push(h.replace(/^\*\./, ''));
  }
  return out.slice(0, 200);
}

/** File extension of a download name (".zip"), or null. */
export function extensionOf(name) {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop();
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return null;
  const ext = base.slice(i).toLowerCase();
  return ext.length <= 12 ? ext : null;
}

/** File name without its folder. */
export function basename(path) {
  if (typeof path !== 'string' || !path) return null;
  return path.split(/[\\/]/).pop() || null;
}
