// Deterministic, plausible log traffic for the status gallery: line i is a pure
// function of (seed, i), so a scrolling log is reproducible and seekable.

import { rng } from '../../easing.js';

const HOSTS = ['web-01', 'web-02', 'api-gw-01', 'auth-01', 'checkout-01', 'checkout-02', 'payments-01', 'pg-orders-01'];
const SVCS = ['nginx', 'envoy', 'auth', 'checkout', 'payments', 'orders', 'postgres', 'systemd', 'kernel', 'sshd', 'cron'];

const TEMPLATES = [
  ['info', 'nginx', (r) => `GET /api/v2/catalog?page=${r.int(1, 40)} 200 ${r.int(8, 90)}ms`],
  ['info', 'envoy', (r) => `upstream checkout → 10.20.2.${r.int(30, 32)}:8085 ok rtt=${r.int(2, 14)}ms`],
  ['info', 'auth', (r) => `session issued user=u${r.int(1000, 9999)} mfa=${r.pick(['totp', 'webauthn', 'push'])}`],
  ['info', 'checkout', (r) => `order ord-${r.int(800000, 899999)} placed total=$${(r() * 180 + 12).toFixed(2)}`],
  ['debug', 'orders', (r) => `kafka produce topic=orders.v1 partition=${r.int(0, 11)} offset=${r.int(100000, 999999)}`],
  ['info', 'postgres', (r) => `checkpoint complete: wrote ${r.int(200, 4000)} buffers (${(r() * 4).toFixed(1)}%)`],
  ['info', 'systemd', () => 'Started Daily apt download activities.'],
  ['info', 'sshd', (r) => `Accepted publickey for deploy from 192.0.2.${r.int(10, 200)} port ${r.int(40000, 60000)} ssh2`],
  ['info', 'cron', () => '(root) CMD (/usr/local/bin/backup --incremental)'],
  ['warn', 'checkout', (r) => `pool at ${r.int(82, 96)}% (${r.int(16, 19)}/20 connections), ${r.int(1, 12)} waiting`],
  ['warn', 'nginx', (r) => `upstream response time ${(r() * 2 + 1).toFixed(2)}s exceeds 1s for /checkout`],
  ['warn', 'kernel', (r) => `TCP: request_sock_TCP: Possible SYN flooding on port 443. Sending cookies.`],
  ['warn', 'payments', () => 'retrying authorize (attempt 2/3): upstream timeout'],
  ['error', 'checkout', () => 'pool exhausted: 20/20 connections in use — timed out after 2000ms'],
  ['error', 'payments', () => 'TLS handshake with payproc.example.net:443 failed: certificate expired'],
  ['error', 'auth', () => "TypeError: Cannot read properties of undefined (reading 'tenantId')"],
  ['crit', 'postgres', () => 'PANIC: could not write to file "pg_wal/xlogtemp.2241": No space left on device'],
];

const WEIGHTS = TEMPLATES.map(([lvl]) => ({ debug: 4, info: 10, warn: 3, error: 1.4, crit: 0.4 })[lvl]);
const TOTAL = WEIGHTS.reduce((a, b) => a + b, 0);

/** The i-th log event: { i, ts (seconds), level, svc, host, pid, msg, fields }. */
export function logLine(seed, i) {
  const r = rng(((seed * 2654435761) ^ (i * 40503)) >>> 0);
  let pick = r() * TOTAL, k = 0;
  while (pick > WEIGHTS[k]) { pick -= WEIGHTS[k]; k++; }
  const [level, svc, msgFn] = TEMPLATES[k];
  const host = svc === 'postgres' ? 'pg-orders-01' : r.pick(HOSTS);
  return { i, level, svc, host, pid: 1000 + ((i * 37) % 8000), msg: msgFn(r), fields: { latency_ms: r.int(2, 900), trace: (r() * 0xffffffff >>> 0).toString(16).padStart(8, '0') } };
}

/** Lines visible at time t at `rate` lines/s: the last n, newest last. */
export function tail(seed, t, rate, n) {
  const last = Math.floor(t * rate) + n;
  const out = [];
  for (let i = Math.max(0, last - n + 1); i <= last; i++) out.push(logLine(seed, i));
  return out;
}

/** Wall-clock style timestamp for a line index (fictional fixed day). */
export function stamp(i, rate, fmt = 'syslog') {
  const secs = 14 * 3600 + 2 * 60 + Math.floor(i / rate);
  const hh = String(Math.floor(secs / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(secs / 60) % 60).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
  const ms = String(Math.floor(((i % rate) / rate) * 1000)).padStart(3, '0');
  if (fmt === 'iso') return `2026-10-13T${hh}:${mm}:${ss}.${ms}Z`;
  return `Oct 13 ${hh}:${mm}:${ss}`;
}

export const LEVEL_KEYS = ['debug', 'info', 'warn', 'error', 'crit'];
export const levelColor = (th, l) => ({ debug: th.dim, info: th.info, warn: th.warn, error: th.neg, crit: th.crit })[l] ?? th.ink;
