// Prism Kaleidoscope × AWS — the demo on /aws/. A plain ES module, no dependencies, nothing here talks to AWS.
//
// Every deck frame is the REAL Smart engine's render (assets/frames/*.svg, from PrismControl.Aws.Tests --render-demo:
// the shipped packs and the real aws provider over a fictional config). This script only picks which frame sits where
// for the state you put the demo in, and plays the mock console and terminal around the decks. The typed lines are the
// module's own (assets/demo.json → lines). Account 000000000000, profiles dev / staging / prod: all made up.
//
// QA: ?mode=terminal  ?stop=ec2  ?tour=off  ?safe=1  ·  window.__aws = { S, press(dev, verb), turn(dev, ctl, n),
//     push(dev, ctl), mode(m), stop(id), enter(), ready }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const qs = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const D = await fetch('assets/demo.json').then((r) => r.json());
const FR = (h) => `assets/frames/${h}.svg`;
const DEVS = ['galleon', 'plus'];
const STOPS = ['home', 'ec2', 's3', 'lambda', 'cloudwatch', 'billing'];
const PROFILES = Object.keys(D.groups);
const HOLD_MS = 700;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const notify = (m) => window.PrismSite?.notify ? window.PrismSite.notify(m) : null;

// ── state ────────────────────────────────────────────────────────────────────
const S = {
  mode: qs.get('mode') === 'terminal' ? 'terminal' : 'console',
  stop: STOPS.includes(qs.get('stop')) ? qs.get('stop') : 'home',
  section: null,
  aws: false,
  safe: qs.get('safe') === '1',
  profile: null,       // the deck's profile (Prism-side, set by a PROFILE push)
  region: null,        // the deck's Region (a REGION push)
  logs: false,         // the log groups for the deck's profile are loaded
  cost: {},            // profile → MONTH $ pressed
  page: { galleon: 0, plus: 0 },
  cur: { galleon: { profile: 0, region: 0, logs: 0 }, plus: { profile: 0, region: 0, logs: 0 } },   // per-device cursors, like the engine
  sel: { galleon: -1, plus: -1 },   // the selected dial face (-1: none yet, so a first click selects instead of pushing)
  flash: { galleon: {}, plus: {} },
  keyOver: { galleon: {}, plus: {} },
  env: { AWS_PROFILE: null, AWS_REGION: null },   // the mock shell's own variables (set when YOU press Enter)
  insp: null,
};
const M = () => (S.safe ? D.safe : D.open);

// ── the devices (server-rendered by build-page.mjs) ──────────────────────────
const dev = {};
for (const d of DEVS) {
  const root = $(`#dev-${d}`);
  const keys = $$('.pdk-key', root).sort((a, b) => +a.dataset.slot.split(':')[1] - +b.dataset.slot.split(':')[1]);
  const wid = $$(d === 'galleon' ? '.aw-w' : '.aw-seg', root).sort((a, b) => +a.dataset.wi - +b.dataset.wi);
  const knobs = $$('.pdk-dial', root).sort((a, b) => +a.dataset.slot.split(':')[1] - +b.dataset.slot.split(':')[1]);
  dev[d] = { root, keys, keyImg: keys.map((k) => $('img', k)), wid, widImg: wid.map((w) => $('img', w)), knobs, rot: knobs.map(() => 0) };
}
const cols = { galleon: 3, plus: 4 };
const layerOf = (sel) => (sel >= 2 ? 1 : 0);   // the Galleon layer of a selected face (TL/TR = 1, BL/BR = 2)

function snap(d) {
  if (S.mode === 'console') { const list = D.console[S.stop][d]; return list[S.page[d] % list.length]; }
  if (!S.aws) return M().term[d];
  const m = M();
  const set = S.profile ? (S.cost[S.profile] ? m.costPages[S.profile] : m.pages[S.profile]) : m.pages.none;
  const list = set[d];
  return list[S.page[d] % list.length];
}
const regionsFor = () => D.regions[S.profile ?? 'none'];
const groupsFor = () => (S.profile ? D.groups[S.profile] : []);

function dialHash(d, i, sp) {
  const f = S.flash[d][i];
  if (f && f.until > now()) return f.h;
  if (S.mode !== 'terminal' || !S.aws) return sp.d[i];
  const m = M(), cur = S.cur[d], ctl = sp.c[i];
  if (ctl === 'aws.profiles.pwsh') return m.dials.profile[S.profile ?? 'none'][d][cur.profile];
  if (ctl === 'aws.regions.pwsh') return S.profile ? m.dials.region[S.profile].free[d][cur.region] : m.dials.region.none[d][cur.region];
  if (ctl === 'aws.logGroups.pwsh') return S.profile && S.logs ? m.dials.logs[S.profile][d][cur.logs] : m.dials.logs.none[d];
  if (ctl === 'aws.page') return m.dials.page[d];
  return sp.d[i];
}

// ── frames: swap, with the redraw wave (a flip from the middle; a crossfade under reduced motion) ──
const animOK = () => !document.hidden;
function setImg(img, h, delay = -1) {
  if (!img || !h || img.dataset.h === h) return;
  img.dataset.h = h;
  const url = FR(h), tok = (img._tok = (img._tok || 0) + 1);
  if (delay < 0 || !animOK() || !img.animate) { img.src = url; return; }
  const pre = new Image();
  pre.src = url;
  const go = () => {
    if (tok !== img._tok) return;
    const calm = reduce.matches;
    const out = img.animate(calm ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'perspective(500px) rotateY(0)', filter: 'none' }, { transform: 'perspective(500px) rotateY(88deg)', filter: 'brightness(1.7) saturate(1.3)' }],
      { duration: calm ? 90 : 150, delay, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
    out.onfinish = () => {
      if (tok !== img._tok) { out.cancel(); return; }
      img.src = url;
      out.cancel();
      img.animate(calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'perspective(500px) rotateY(-88deg)', filter: 'brightness(1.7)' }, { transform: 'perspective(500px) rotateY(0)', filter: 'none' }],
        { duration: calm ? 140 : 230, easing: 'cubic-bezier(.2,.7,.25,1)' });
    };
  };
  (pre.decode ? pre.decode() : Promise.resolve()).then(go, go);
}
function waveDelay(d, kind, i) {
  if (reduce.matches) return 0;
  const c = cols[d], rows = dev[d].keys.length / c;
  if (kind === 'w') return 30 + (d === 'galleon' ? Math.floor(i / 2) * 40 : Math.abs(i - 1.5) * 35);
  const x = i % c, y = Math.floor(i / c);
  return Math.round(Math.hypot(x - (c - 1) / 2, y - (rows - 1) / 2) * 55) + (d === 'galleon' ? 120 : 0);
}

const meta = (id) => D.meta[id] || {};
const label = (id) => (id === 'more' ? 'MORE' : meta(id).label || id || '');
function keyAria(v) {
  if (!v) return 'Empty key';
  if (v === 'more') return 'MORE: the next page';
  const m = meta(v);
  return `${m.label}${m.long ? ': ' + m.long : ''}. ${tierOf(v).l}`;
}
function ctlName(ctl) { return meta(ctl).label || { tabs: 'TABS', scroll: 'SCROLL', paneFocus: 'PANES', fontSize: 'FONT', zoom: 'ZOOM' }[ctl] || ctl; }

function render({ wave = false } = {}) {
  for (const d of DEVS) {
    const sp = snap(d), R = dev[d];
    sp.k.forEach((h, i) => {
      setImg(R.keyImg[i], S.keyOver[d][i] ?? h, wave ? waveDelay(d, 'k', i) : -1);
      R.keys[i].setAttribute('aria-label', keyAria(sp.v[i]));
      R.keys[i].classList.toggle('is-flag', S.mode === 'terminal' && !S.aws && sp.v[i] === 'aws.mode');
    });
    R.widImg.forEach((img, i) => setImg(img, dialHash(d, i, sp), wave ? waveDelay(d, 'w', i) : -1));
    R.wid.forEach((w, i) => {
      w.setAttribute('aria-label', `${d === 'galleon' ? `Dial ${(i % 2) + 1}, layer ${Math.floor(i / 2) + 1}` : `Dial ${i + 1}`}: ${ctlName(sp.c[i])}. Arrow keys turn, Enter pushes.`);
      w.classList.toggle('is-sel', i === S.sel[d]);
      if (d === 'galleon') w.classList.toggle('is-layer', Math.floor(i / 2) === layerOf(S.sel[d]));
    });
    $(`.aw-page[data-page="${d}"]`).textContent = `page ${sp.page + 1}/${sp.pages}`;
  }
  front();
  if (S.insp) inspect(S.insp.d, S.insp.kind, S.insp.i, true);
}

// ── the "in front" line under the monitor ─────────────────────────────────────
const STOP_NAME = { home: 'Home', ec2: 'EC2', s3: 'S3', lambda: 'Lambda', cloudwatch: 'CloudWatch', billing: 'Billing' };
function front() {
  $('#aw-front-app').textContent = S.mode === 'console' ? 'chrome.exe' : 'WindowsTerminal.exe';
  $('#aw-front-ctx').textContent = S.mode === 'console' ? `AWS Console · ${STOP_NAME[S.stop]}` : S.aws ? 'AWS CLI · PowerShell' : 'Windows Terminal · terminal';
}

// ── captions + the inspector ─────────────────────────────────────────────────
function caption(k, html) { $('#aw-caption-k').textContent = k; $('#aw-caption-t').innerHTML = html; }
function tierOf(v) {
  if (!v || v === 'more') return { t: 'press', l: 'PRESS · NEXT PAGE' };
  const m = meta(v), run = D.lines.run[v];
  if (m.control) return { t: 'press', l: 'TURN TO BROWSE · PUSH TO USE' };
  if (v.startsWith('aws.deck.')) return { t: 'module', l: 'ONE DELIBERATE PRESS · ONE READ-ONLY CALL' };
  if (m.safety === 'Confirm') return run && !run.enter && run.text ? { t: 'type', l: 'HOLD 0.7 S · TYPED, YOU PRESS ENTER' } : { t: 'hold', l: 'HOLD 0.7 S TO RUN · READ-ONLY' };
  if (m.safety === 'NeverAuto') return { t: 'type', l: 'DELIBERATE PRESS · TYPED, YOU PRESS ENTER' };
  return { t: 'safe', l: 'PRESS' };
}
function doesOf(v) {
  const m = meta(v), run = D.lines.run[v];
  if (v === 'more') return 'Shows the next page of this layout.';
  if (run && run.text) return `Types <code>${esc(run.text.length > 120 ? run.text.slice(0, 117) + '…' : run.text)}</code>${run.enter ? ', then Enter' : ' and stops: no Enter'}.`;
  if (m.kind === 'chord' || m.kind === 'sequence') return `Sends <code>${esc(m.does)}</code> to the app in front.`;
  if (m.kind === 'module') return `${esc(m.long || m.label)}.`;
  return esc(m.long || '');
}
const DIAL_DOES = {
  'aws.profiles.pwsh': 'Your profiles, from the <code>[profile …]</code> headers of your config. Push types <code>$env:AWS_PROFILE=\'…\'</code>, no Enter.',
  'aws.regions.pwsh': 'AWS Regions, the profile\'s own first. Push types <code>$env:AWS_REGION=\'…\'</code>, no Enter.',
  'aws.logGroups.pwsh': 'The log groups LOAD LOGS (or a PROFILE push) listed. Push types <code>aws logs tail \'…\' --follow --since 15m</code>, no Enter.',
  'aws.page': 'Scrolls the terminal (PgUp / PgDn); push jumps to the bottom.',
  'aws.console.regions': 'Browses Regions (the aws module). Applying one to the tab needs the browser module (planned): AWS has no Region shortcut.',
};
function inspect(d, kind, i, quiet) {
  S.insp = { d, kind, i };
  const sp = snap(d), box = $('#aw-inspect'), img = $('#aw-inspect-img');
  box.classList.toggle('is-dial', kind === 'w');
  const h = kind === 'k' ? (S.keyOver[d][i] ?? sp.k[i]) : dialHash(d, i, sp);
  if (h) { img.src = FR(h); img.hidden = false; }
  const tierEl = $('#aw-tier');
  if (kind === 'k') {
    const v = sp.v[i];
    $('#aw-inspect-k').textContent = `${d === 'galleon' ? 'GALLEON' : 'STREAM DECK +'} · KEY ${i + 1}`;
    $('#aw-inspect-l').textContent = v ? `${label(v)}${meta(v).long ? ' · ' + meta(v).long : ''}` : 'An empty key';
    $('#aw-inspect-d').innerHTML = v ? doesOf(v) : '';
    const t = tierOf(v);
    tierEl.hidden = !v;
    tierEl.dataset.tier = t.t;
    tierEl.textContent = t.l;
    $('#aw-dialbar').hidden = true;
  } else {
    const ctl = sp.c[i];
    $('#aw-inspect-k').textContent = `${d === 'galleon' ? `GALLEON · DIAL ${(i % 2) + 1}, LAYER ${Math.floor(i / 2) + 1}` : `STREAM DECK + · DIAL ${i + 1}`}`;
    $('#aw-inspect-l').textContent = ctlName(ctl);
    $('#aw-inspect-d').innerHTML = DIAL_DOES[ctl] || (meta(ctl).push ? `Turn, and push for ${esc(label(meta(ctl).push))}.` : 'Turn and push.');
    tierEl.hidden = false;
    tierEl.dataset.tier = ctl?.startsWith('aws.') && S.aws ? 'type' : 'press';
    tierEl.textContent = ctl?.startsWith('aws.') && S.aws && ctl !== 'aws.page' ? 'TURN TO BROWSE · PUSH TYPES THE LINE, NO ENTER' : 'TURN · PUSH';
    $('#aw-dialbar').hidden = false;
  }
  if (!quiet) box.classList.remove('aw-flash');
}

// ── the console (drawn by Prism; fictional data) ─────────────────────────────
const G = (n) => `<svg class="aw-g" aria-hidden="true"><use href="#g-${n}"/></svg>`;
const tbl = (cols2, rows) => `<table class="aw-tbl"><thead><tr>${cols2.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, j) => `<td${j === 0 ? ' class="ln"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const cont = (title, count, acts, body, filter = true) => `<section class="aw-cont"><div class="aw-cont-h"><h3>${title}${count != null ? ` <small>(${count})</small>` : ''}</h3><div class="aw-acts">${acts}</div></div>${filter ? `<div class="aw-filter"><span>Find resources</span></div>` : ''}${body}</section>`;
const st = (t, cls = '') => `<span class="aw-state ${cls}">${t}</span>`;
const btn = (t, pri) => `<button type="button" class="aw-btn${pri ? ' pri' : ''}" tabindex="-1">${t}</button>`;
const spark = (pts) => { const w = 300, h = 60, max = Math.max(...pts); const p = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - (v / max) * (h - 6) - 2}`).join(' L'); return `<svg class="aw-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="fill" d="M0,${h} L${p} L${w},${h} Z"/><path d="M${p}"/></svg>`; };
const COST_ROWS = [['Amazon EC2', 18.40], ['Amazon RDS', 9.85], ['AWS Lambda', 4.12], ['Amazon S3', 3.30], ['Amazon CloudWatch', 2.95], ['Other services', 3.15]];
const LOG_GROUPS_PROD = D.groups.prod;

const CONSOLE = {
  home: {
    url: 'us-east-1.console.aws.amazon.com/console/home?region=us-east-1', tab: 'Console Home', region: 'N. Virginia', side: null,
    sections: { home: () => `<h2 class="aw-h">Console Home <small>Info</small></h2>
      <div class="aw-cards">
        ${cont('Recently visited', null, '', `<div class="aw-recent">${[['ec2', 'cpu', 'EC2'], ['s3', 'bucket', 'S3'], ['lambda', 'function', 'Lambda'], ['cloudwatch', 'waveform', 'CloudWatch'], ['billing', 'dollar', 'Billing and Cost Management']].map(([s, g, n]) => `<a href="#demo" data-go="${s}">${G(g)}${n}</a>`).join('')}</div>`, false)}
        ${cont('Cost and usage', null, '', `<div class="aw-kv"><b>$41.77</b><span>Month-to-date cost (fictional)</span></div><div class="aw-kv"><b>$96.10</b><span>Forecast for the month</span></div>`, false)}
        ${cont('AWS Health', null, '', `<div class="aw-kv"><b>0</b><span>Open issues · past 7 days</span></div><div class="aw-kv"><b>0</b><span>Scheduled changes</span></div>`, false)}
      </div>` },
    captions: { home: 'Console Home. <b>SEARCH</b> is the console\'s own Alt+S; the jump keys open EC2, S3, Lambda, CloudWatch, IAM and Billing; the <b>REGION</b> dial browses Regions.' },
  },
  ec2: {
    url: 'us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances:', tab: 'Instances | EC2 | us-east-1', region: 'N. Virginia',
    side: ['EC2 Dashboard', '#Instances', 'Instances:instances', 'Instance Types', 'Launch Templates', '#Elastic Block Store', 'Volumes:volumes', 'Snapshots', '#Network & Security', 'Security Groups:securityGroups', 'Key Pairs', '#Load Balancing', 'Load Balancers:loadBalancers', 'Target Groups'],
    sections: {
      instances: () => cont('Instances', 4, btn('Connect') + btn('Instance state ▾') + btn('Actions ▾') + btn('Launch instances', true), tbl(['Name', 'Instance ID', 'Instance state', 'Instance type', 'Status check', 'Availability Zone'], [
        ['web-example-1', 'i-0a1b2c3d4e5f60001', st('Running'), 't3.small', '2/2 checks passed', 'us-east-1a'],
        ['web-example-2', 'i-0a1b2c3d4e5f60002', st('Running'), 't3.small', '2/2 checks passed', 'us-east-1b'],
        ['worker-example', 'i-0a1b2c3d4e5f60003', st('Stopped', 'off'), 't3.micro', '–', 'us-east-1a'],
        ['bastion-example', 'i-0a1b2c3d4e5f60004', st('Running'), 't3.nano', '2/2 checks passed', 'us-east-1c']])),
      securityGroups: () => cont('Security Groups', 3, btn('Actions ▾') + btn('Create security group', true), tbl(['Name', 'Security group ID', 'VPC ID', 'Description'], [
        ['web-example-sg', 'sg-0example00000001', 'vpc-0example0001', 'HTTPS from the load balancer'], ['worker-example-sg', 'sg-0example00000002', 'vpc-0example0001', 'Outbound only'], ['bastion-example-sg', 'sg-0example00000003', 'vpc-0example0001', 'SSH from the office range']])),
      volumes: () => cont('Volumes', 4, btn('Actions ▾') + btn('Create volume', true), tbl(['Volume ID', 'Type', 'Size', 'Volume state', 'Attached to'], [
        ['vol-0example00000001', 'gp3', '20 GiB', st('In-use'), 'web-example-1'], ['vol-0example00000002', 'gp3', '20 GiB', st('In-use'), 'web-example-2'], ['vol-0example00000003', 'gp3', '8 GiB', st('In-use'), 'worker-example'], ['vol-0example00000004', 'gp3', '8 GiB', st('Available', 'warn'), '–']])),
      loadBalancers: () => cont('Load balancers', 1, btn('Actions ▾') + btn('Create load balancer', true), tbl(['Name', 'State', 'Type', 'Scheme', 'DNS name'], [
        ['web-example-alb', st('Active'), 'application', 'internet-facing', 'web-example-alb-0000.us-east-1.elb.example']])),
    },
    def: 'instances',
    captions: { instances: 'EC2. <b>INSTANCES</b>, <b>SEC GROUPS</b>, <b>VOLUMES</b> and <b>LOAD BAL</b> jump inside EC2; <b>CLOUDSHELL</b> opens a shell in the console. The page is known from the URL path only.' },
  },
  s3: {
    url: 's3.console.aws.amazon.com/s3/buckets?region=us-east-1', tab: 'S3 buckets | S3 | Global', region: 'Global',
    side: ['General purpose buckets:buckets', 'Directory buckets', 'Table buckets', '#Storage Lens', 'Dashboards', 'Access Grants'],
    sections: { buckets: () => cont('General purpose buckets', 4, btn('Copy ARN') + btn('Empty') + btn('Delete') + btn('Create bucket', true), tbl(['Name', 'AWS Region', 'Creation date'], [
      ['example-app-assets', 'US East (N. Virginia) us-east-1', 'October 2, 2026, 09:12:40 (UTC)'], ['example-logs-archive', 'US East (N. Virginia) us-east-1', 'September 18, 2026, 14:03:11 (UTC)'],
      ['example-static-site', 'US West (Oregon) us-west-2', 'August 30, 2026, 08:44:02 (UTC)'], ['example-backups', 'Europe (Ireland) eu-west-1', 'July 7, 2026, 22:15:56 (UTC)']])) },
    def: 'buckets',
    captions: { buckets: 'S3. <b>BUCKETS</b> is a key; so are EC2, Lambda, CloudWatch, IAM and Cost Explorer. Deleting a bucket is never on the deck.' },
  },
  lambda: {
    url: 'us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions', tab: 'Functions | Lambda | us-east-1', region: 'N. Virginia',
    side: ['Dashboard', 'Applications', 'Functions:functions', '#Additional resources', 'Code signing configurations', 'Layers:layers', 'Replicas'],
    sections: {
      functions: () => cont('Functions', 4, btn('Actions ▾') + btn('Create function', true), tbl(['Function name', 'Package type', 'Runtime', 'Memory', 'Last modified'], [
        ['orders-api', 'Zip', 'Node.js 20.x', '512 MB', '2 hours ago'], ['checkout', 'Zip', 'Node.js 20.x', '512 MB', '1 day ago'], ['thumbnail-maker', 'Image', '–', '1024 MB', '6 days ago'], ['nightly-report', 'Zip', 'Python 3.12', '256 MB', '3 weeks ago']])),
      layers: () => cont('Layers', 1, btn('Create layer', true), tbl(['Name', 'Version', 'Compatible runtimes', 'Created'], [['shared-utils-example', '7', 'nodejs20.x', 'October 1, 2026']])),
    },
    def: 'functions',
    captions: { functions: 'Lambda. <b>FUNCTIONS</b> and <b>LAYERS</b> on keys. Invoking a function is not bound: it can change things.' },
  },
  cloudwatch: {
    url: 'us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups', tab: 'Log groups | CloudWatch | us-east-1', region: 'N. Virginia',
    side: ['Dashboards', 'Alarms:alarms', '#Logs', 'Log groups:logGroups', 'Logs Insights:insights', 'Live Tail:liveTail', '#Metrics', 'All metrics'],
    sections: {
      logGroups: () => cont('Log groups', LOG_GROUPS_PROD.length, btn('Actions ▾') + btn('Create log group', true), tbl(['Log group', 'Retention', 'Stored bytes'], LOG_GROUPS_PROD.map((g, i) => [g, i < 2 ? '1 month' : 'Never expire', ['412.4 MB', '96.1 MB', '1.2 GB', '2.6 GB', '318.0 MB'][i]]))),
      insights: () => cont('Logs Insights', null, btn('Run query', true), `<div class="aw-live"><p><b>fields</b> @timestamp, @message</p><p>| <b>filter</b> @message like /ERROR/</p><p>| <b>sort</b> @timestamp desc | <b>limit</b> 20</p></div>${spark([2, 3, 2, 6, 4, 3, 9, 5, 3, 2, 4, 3])}`, false),
      liveTail: () => cont('Live Tail', null, btn('Stop'), `<div class="aw-live" id="aw-livetail"></div>`, false),
      alarms: () => cont('Alarms', 3, btn('Create alarm', true), tbl(['Name', 'State', 'Conditions'], [['orders-api-errors', st('OK'), 'Errors > 5 for 1 datapoint'], ['checkout-latency', st('In alarm', 'off'), 'p99 Duration > 800 ms for 3 datapoints'], ['web-5xx', st('OK'), '5XX count > 10 for 2 datapoints']])),
    },
    def: 'logGroups',
    captions: { logGroups: 'CloudWatch. <b>LOG GROUPS</b>, <b>LOGS INSIGHTS</b>, <b>LIVE TAIL</b> and <b>ALARMS</b>. The CLI page has the same groups on its LOG GROUP dial.' },
  },
  billing: {
    url: 'us-east-1.console.aws.amazon.com/costmanagement/home#/home', tab: 'Cost Management | Global', region: 'Global',
    side: ['Home:home', 'Bills:bills', '#Cost analysis', 'Cost Explorer:costExplorer', '#Budgets and planning', 'Budgets:budgets', '#Free Tier', 'Free Tier:freeTier'],
    sections: {
      home: () => `<h2 class="aw-h">Cost Management <small>Info</small></h2><div class="aw-cards">${cont('Month-to-date cost', null, '', `<div class="aw-kv"><b>$41.77</b><span>October 2026 (fictional)</span></div>`, false)}${cont('Forecast', null, '', `<div class="aw-kv"><b>$96.10</b><span>End of month</span></div>`, false)}</div>${cont('Cost by service', null, '', `<div class="aw-bars">${COST_ROWS.map(([n, v]) => `<div><span>${n}</span><i style="width:${(v / 18.4) * 100}%"></i><b>$${v.toFixed(2)}</b></div>`).join('')}</div>`, false)}`,
      bills: () => cont('Bills', null, btn('Download'), tbl(['Month', 'Status', 'Total'], [['October 2026', st('Pending', 'warn'), '$41.77 so far'], ['September 2026', st('Issued'), '$88.42'], ['August 2026', st('Issued'), '$79.05']])),
      costExplorer: () => cont('Cost Explorer', null, btn('Download as CSV'), `${spark([61, 66, 70, 74, 79, 88, 42])}<div class="aw-bars">${COST_ROWS.slice(0, 4).map(([n, v]) => `<div><span>${n}</span><i style="width:${(v / 18.4) * 100}%"></i><b>$${v.toFixed(2)}</b></div>`).join('')}</div>`, false),
      budgets: () => cont('Budgets', 1, btn('Create budget', true), tbl(['Name', 'Budgeted', 'Current', 'Forecasted'], [['monthly-example', '$100.00', '$41.77 (42%)', '$96.10 (96%)']])),
      freeTier: () => cont('Free Tier', null, '', tbl(['Service', 'Usage', 'Limit'], [['AWS Lambda requests', '412,880', '1,000,000 / month'], ['Amazon S3 storage', '3.1 GB', '5 GB'], ['Amazon CloudWatch logs', '3.8 GB', '5 GB']])),
    },
    def: 'home',
    captions: { home: 'Billing and Cost Management. <b>BILLS</b>, <b>COST EXPLORER</b>, <b>BUDGETS</b>, <b>FREE TIER</b>. The deck never shows the account id: the console pack reads only the URL path.' },
  },
};
const SECTION_OF = { 'aws.ec2.instances': 'instances', 'aws.ec2.securityGroups': 'securityGroups', 'aws.ec2.volumes': 'volumes', 'aws.ec2.loadBalancers': 'loadBalancers', 'aws.s3.buckets': 'buckets',
  'aws.lambda.functions': 'functions', 'aws.lambda.layers': 'layers', 'aws.cloudwatch.logGroups': 'logGroups', 'aws.cloudwatch.insights': 'insights', 'aws.cloudwatch.liveTail': 'liveTail', 'aws.cloudwatch.alarms': 'alarms',
  'aws.billing.bills': 'bills', 'aws.billing.costExplorer': 'costExplorer', 'aws.billing.budgets': 'budgets', 'aws.billing.freeTier': 'freeTier' };
const GO_STOP = { 'aws.go.ec2': 'ec2', 'aws.go.s3': 's3', 'aws.go.lambda': 'lambda', 'aws.go.cloudwatch': 'cloudwatch', 'aws.go.billing': 'billing', 'aws.go.home': 'home', 'aws.go.costExplorer': ['billing', 'costExplorer'] };

let liveTimer = 0;
function drawConsole() {
  const C = CONSOLE[S.stop];
  const sec = S.section && C.sections[S.section] ? S.section : C.def || Object.keys(C.sections)[0];
  $('#aw-urltext').textContent = C.url;
  $('#aw-tabtitle').textContent = C.tab;
  $('#aw-region').firstChild.textContent = C.region + ' ';
  const side = $('#aw-side');
  side.hidden = !C.side;
  if (C.side) side.innerHTML = `<h4>${{ ec2: 'EC2', s3: 'Amazon S3', lambda: 'Lambda', cloudwatch: 'CloudWatch', billing: 'Billing and Cost Management' }[S.stop]}</h4>` + C.side.map((x) => {
    if (x.startsWith('#')) return `<small>${x.slice(1)}</small>`;
    const [n, s] = x.split(':');
    return `<a href="#demo" data-sec="${s || ''}" class="${s === sec ? 'on' : ''}" tabindex="-1">${n}</a>`;
  }).join('');
  const crumbs = S.stop === 'home' ? '' : `<p class="aw-crumbs">${{ ec2: 'EC2', s3: 'Amazon S3', lambda: 'Lambda', cloudwatch: 'CloudWatch', billing: 'Billing and Cost Management' }[S.stop]} <span>›</span> ${(C.side || []).map((x) => x.split(':')).find((p) => p[1] === sec)?.[0] || ''}</p>`;
  const main = $('#aw-main');
  main.innerHTML = crumbs + C.sections[sec]();
  clearInterval(liveTimer);
  if (sec === 'liveTail') {
    const box = $('#aw-livetail'), gen = logGen('/aws/lambda/orders-api');
    const add = () => { const p = document.createElement('p'); p.innerHTML = gen().replace(/^(\S+)/, '<b>$1</b>'); box.prepend(p); while (box.children.length > 12) box.lastChild.remove(); };
    for (let i = 0; i < 6; i++) add();
    if (!reduce.matches) liveTimer = setInterval(add, 1100);
  }
}
function setSection(sec) { S.section = sec; drawConsole(); const m = $('#aw-main'); m.classList.remove('aw-flash'); void m.offsetWidth; m.classList.add('aw-flash'); }

// ── the console tour ─────────────────────────────────────────────────────────
const tour = { on: qs.get('tour') !== 'off' && !reduce.matches, paused: false, holdUntil: 0, t0: now(), dwell: 5200, hover: false, visible: true };
function goStop(stop, { section = null, by = 'tour' } = {}) {
  S.stop = stop;
  S.section = section;
  S.page = { galleon: 0, plus: 0 };
  for (const b of $$('#aw-stops button')) { b.setAttribute('aria-pressed', String(b.dataset.stop === stop)); b.style.setProperty('--fill', b.dataset.stop === stop ? '0' : '0'); }
  drawConsole();
  render({ wave: true });
  const C = CONSOLE[stop];
  caption(STOP_NAME[stop].toUpperCase(), C.captions[section] || C.captions[C.def || 'home'] || '');
  tour.t0 = now();
  if (by !== 'tour') tour.holdUntil = now() + 12000;
}
function tourTick() {
  const b = $(`#aw-stops button[data-stop="${S.stop}"]`);
  const active = tour.on && !tour.paused && S.mode === 'console' && !tour.hover && tour.visible && !document.hidden && now() > tour.holdUntil;
  if (!active) { tour.t0 = now() - (Number(b?.style.getPropertyValue('--fill')) || 0) * tour.dwell; }
  else {
    const f = Math.min(1, (now() - tour.t0) / tour.dwell);
    b?.style.setProperty('--fill', f.toFixed(3));
    if (f >= 1) { b?.style.setProperty('--fill', '0'); goStop(STOPS[(STOPS.indexOf(S.stop) + 1) % STOPS.length]); }
  }
  requestAnimationFrame(tourTick);
}

// ── the terminal (a tiny line editor + the fictional AWS CLI) ────────────────
const term = {
  body: $('#aw-term'), out: $('#aw-out'), inEl: $('#aw-in'),
  buf: '', pos: 0, queue: Promise.resolve(), stream: null, why: '',
  print(text, cls = '') {
    for (const line of String(text).split('\n')) { const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = line; this.out.append(p); }
    while (this.out.children.length > 400) this.out.firstChild.remove();
    this.scrollBottom();
  },
  printHTML(html) { const p = document.createElement('p'); p.innerHTML = html; this.out.append(p); this.scrollBottom(); },
  scrollBottom() { this.body.scrollTop = this.body.scrollHeight; },
  draw() {
    const c = this.buf[this.pos] ?? ' ';
    this.inEl.innerHTML = `${esc(this.buf.slice(0, this.pos))}<span class="aw-cur">${esc(c)}</span>${esc(this.buf.slice(this.pos + 1))}`;
    const pend = this.buf.trim().length > 0 && !this.stream;
    $('#aw-pending').hidden = !pend;
    if (pend) $('#aw-pending-why').textContent = this.why || 'You press Enter.';
    this.scrollBottom();
  },
  insert(s) { this.buf = this.buf.slice(0, this.pos) + s + this.buf.slice(this.pos); this.pos += s.length; this.draw(); },
  type(text, { left = 0, enter = false, why = '' } = {}) {
    this.queue = this.queue.then(() => new Promise((res) => {
      if (this.stream) { caption('BUSY', 'A command is still running: press <b>STOP</b> (Ctrl+C) first. In a real terminal the typing would go to the running command.'); res(); return; }
      this.why = why;
      if (reduce.matches || text.length > 160) { this.insert(text); done(); return; }
      let i = 0;
      const step = () => { const n = Math.min(text.length - i, 3); this.insert(text.slice(i, i + n)); i += n; if (i < text.length) setTimeout(step, 14); else done(); };
      const done = () => { this.pos = Math.max(0, this.pos - left); this.draw(); if (enter) setTimeout(() => { this.run(); res(); }, reduce.matches ? 0 : 140); else res(); };
      step();
    }));
    return this.queue;
  },
  run() {
    const line = this.buf;
    this.print(`PS C:\\Users\\example> ${line}`);
    this.buf = ''; this.pos = 0; this.why = '';
    this.draw();
    exec(line.trim());
  },
  interrupt() {
    if (this.stream) { clearTimeout(this.stream.t); this.stream = null; this.print('^C', 'c-dim'); this.draw(); caption('STOP', '<b>STOP</b> sent Ctrl+C: the tail ended.'); return; }
    if (this.buf) { this.print(`PS C:\\Users\\example> ${this.buf}^C`); this.buf = ''; this.pos = 0; this.draw(); }
  },
  clear() { this.out.innerHTML = ''; this.draw(); },
};
term.body.addEventListener('keydown', (e) => {
  if (e.target !== term.body) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') { if (term.stream || term.buf) { e.preventDefault(); term.interrupt(); } return; }
  if (e.ctrlKey && k.toLowerCase() === 'l') { e.preventDefault(); term.clear(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'Enter') { e.preventDefault(); if (!term.stream) term.run(); return; }
  if (k === 'Backspace') { e.preventDefault(); if (term.pos > 0) { term.buf = term.buf.slice(0, term.pos - 1) + term.buf.slice(term.pos); term.pos--; term.draw(); } return; }
  if (k === 'Delete') { e.preventDefault(); term.buf = term.buf.slice(0, term.pos) + term.buf.slice(term.pos + 1); term.draw(); return; }
  if (k === 'ArrowLeft') { e.preventDefault(); term.pos = Math.max(0, term.pos - 1); term.draw(); return; }
  if (k === 'ArrowRight') { e.preventDefault(); term.pos = Math.min(term.buf.length, term.pos + 1); term.draw(); return; }
  if (k === 'Home') { e.preventDefault(); term.pos = 0; term.draw(); return; }
  if (k === 'End') { e.preventDefault(); term.pos = term.buf.length; term.draw(); return; }
  if (k === 'Escape') { e.preventDefault(); term.buf = ''; term.pos = 0; term.draw(); return; }
  if (k.length === 1) { e.preventDefault(); term.insert(k); }
});
term.body.addEventListener('click', () => term.body.focus({ preventScroll: true }));
$('#aw-enter').addEventListener('click', () => { if (!term.stream) term.run(); term.body.focus({ preventScroll: true }); });
$('#aw-clear').addEventListener('click', () => { term.buf = ''; term.pos = 0; term.draw(); term.body.focus({ preventScroll: true }); });

// aws --output table, roughly
function awsTable(title, head, rows) {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)) + 2);
  const total = w.reduce((a, b) => a + b, 0) + w.length - 1;
  const line = (ch = '-') => '+' + w.map((x) => ch.repeat(x)).join('+') + '+';
  const cell = (s, x) => { s = String(s); const l = Math.floor((x - s.length) / 2); return ' '.repeat(l) + s + ' '.repeat(x - s.length - l); };
  const t = Math.max(total, title.length + 2);
  return ['-'.repeat(t + 2), '|' + cell(title, t) + '|', line(), '|' + head.map((h, i) => cell(h, w[i])).join('|') + '|', line(), ...rows.map((r) => '|' + r.map((c, i) => ' ' + String(c).padEnd(w[i] - 1)).join('|') + '|'), line()].join('\n');
}
const DATA = {
  buckets: { dev: ['example-dev-assets', 'example-dev-scratch'], staging: ['example-staging-assets', 'example-staging-logs'], prod: ['example-app-assets', 'example-logs-archive', 'example-static-site', 'example-backups'] },
  ec2: { dev: [['i-0d1e2f3a4b5c60001', 'web-dev', 'running', 't3.micro']], staging: [['i-0c1d2e3f4a5b60001', 'web-staging', 'running', 't3.small'], ['i-0c1d2e3f4a5b60002', 'worker-staging', 'stopped', 't3.micro']], prod: [['i-0a1b2c3d4e5f60001', 'web-example-1', 'running', 't3.small'], ['i-0a1b2c3d4e5f60002', 'web-example-2', 'running', 't3.small'], ['i-0a1b2c3d4e5f60003', 'worker-example', 'stopped', 't3.micro'], ['i-0a1b2c3d4e5f60004', 'bastion-example', 'running', 't3.nano']] },
  lambda: { dev: [['orders-api-dev', 'nodejs20.x', '512'], ['checkout-dev', 'nodejs20.x', '512']], staging: [['orders-api-staging', 'nodejs20.x', '512'], ['checkout-staging', 'nodejs20.x', '512']], prod: [['orders-api', 'nodejs20.x', '512'], ['checkout', 'nodejs20.x', '512'], ['thumbnail-maker', 'python3.12', '1024'], ['nightly-report', 'python3.12', '256']] },
};
const flag = (line, f) => line.match(new RegExp(`--${f}\\s+(\\S+)`))?.[1];
function profileFor(line) { return flag(line, 'profile') || S.env.AWS_PROFILE; }
function noCreds() {
  term.print('\nUnable to locate credentials. You can configure credentials by running "aws configure".', 'c-err');
  term.print('# demo: no profile is set in this shell yet. Push PROFILE on the deck, then press Enter.', 'c-dim');
}
function exec(line) {
  if (!line) return;
  let m;
  if ((m = line.match(/^\$env:AWS_PROFILE\s*=\s*'([^']*)'$/))) { S.env.AWS_PROFILE = m[1] || null; if (m[1] && !PROFILES.includes(m[1])) term.print(`# demo: "${m[1]}" isn't a profile in this demo's config (dev, staging, prod).`, 'c-dim'); return caption('SHELL', `This shell now uses <code>AWS_PROFILE=${esc(m[1] || '(empty)')}</code>. You ran it: the deck only typed it.`); }
  if ((m = line.match(/^\$env:AWS_REGION\s*=\s*'([^']*)'$/))) { S.env.AWS_REGION = m[1] || null; return caption('SHELL', `This shell now uses <code>AWS_REGION=${esc(m[1] || '(empty)')}</code>.`); }
  if (/^\$env:AWS_PROFILE=\$null; \$env:AWS_REGION=\$null$/.test(line)) { S.env.AWS_PROFILE = S.env.AWS_REGION = null; return; }
  if (/^(cls|clear)$/i.test(line)) return term.clear();
  if ((m = line.match(/^start (https:\/\/console\.aws\.amazon\.com\/(\w+)\/home)$/))) {
    term.print(`# demo: Windows opens ${m[1]} in your browser.`, 'c-dim');
    if (m[2] === 'console') setTimeout(() => setMode('console', { stop: 'home' }), reduce.matches ? 0 : 700);
    return;
  }
  if (!/^aws(\s|$)/.test(line)) return term.print(`# demo: only the AWS CLI is simulated in this terminal.`, 'c-dim');
  if (/^aws --version$/.test(line)) return term.print('aws-cli/2.x.x Python/3.x Windows/11 exe/AMD64 prompt/off\n# demo: your own aws.exe prints its version here.', '');
  if (/^aws configure list-profiles$/.test(line)) return term.print(PROFILES.join('\n'));
  if (/^aws sso logout$/.test(line)) return term.print('# demo: signed out of every SSO session in this shell (nothing really happened).', 'c-dim');
  if ((m = line.match(/^aws ec2 (start|stop)-instances --instance-ids\s*(\S*)/))) {
    if (!m[2]) return term.print('\nusage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\nTo see help text, you can run:\n\n  aws help\n  aws <command> help\n  aws <command> <subcommand> help\n\naws: error: argument --instance-ids: expected at least one argument', 'c-err');
    return term.print(`# demo: nothing was ${m[1] === 'stop' ? 'stopped' : 'started'}. In your terminal this line would change a real instance, which is why the deck left the Enter to you.`, 'c-or');
  }
  if (/^aws s3 cp\s*$/.test(line)) return term.print('\nusage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\naws: error: the following arguments are required: paths', 'c-err');
  if (/^aws s3 cp\s+\S/.test(line)) return term.print('# demo: nothing was copied: this page never talks to AWS.', 'c-or');
  if (/^aws ecs update-service .*--cluster\s*$/.test(line)) return term.print('\naws: error: argument --cluster: expected one argument', 'c-err');
  if (/^aws ecs update-service/.test(line)) return term.print('# demo: nothing was redeployed: this page never talks to AWS.', 'c-or');
  if (/^aws logs tail --follow/.test(line) || /^aws logs tail\s*$/.test(line)) return term.print('\nusage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\naws: error: the following arguments are required: group_name\n# demo: the LOG GROUP dial types the whole line, group included.', 'c-err');
  const p = profileFor(line);
  if (/^aws sso login/.test(line)) {
    if (!p && !flag(line, 'profile')) return noCreds();
    return term.print(`Attempting to automatically open the SSO authorization page in your default browser.\nIf the browser does not open or you wish to use a different device to authorize this request, open the following URL:\n\nhttps://example.awsapps.com/start/#/device\n\nSuccessfully logged into Start URL: https://example.awsapps.com/start\n# demo: no browser opened.`);
  }
  if (!p) return noCreds();
  if (!PROFILES.includes(p)) return term.print(`\nThe config profile (${p}) could not be found`, 'c-err');
  const region = flag(line, 'region') || S.env.AWS_REGION || { dev: 'us-west-2', staging: 'eu-west-1', prod: 'us-east-1' }[p];
  if (/^aws sts get-caller-identity$/.test(line)) return term.print(`{\n    "UserId": "AROAEXAMPLEDEMO00000:demo",\n    "Account": "000000000000",\n    "Arn": "arn:aws:sts::000000000000:assumed-role/ExampleDeveloper/demo"\n}`, 'c-str');
  if (/^aws configure list$/.test(line)) return term.print(`      Name                    Value             Type    Location\n      ----                    -----             ----    --------\n   profile                      ${p.padEnd(16)}   env    ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE']\naccess_key     ****************DEMO              sso\nsecret_key     ****************DEMO              sso\n    region                ${region.padEnd(16)}   ${S.env.AWS_REGION ? 'env' : 'config-file'}    ~/.aws/config`);
  if ((m = line.match(/^aws s3 ls s3:\/\/(\S*)$/))) return term.print(m[1] ? `                           PRE images/\n                           PRE reports/\n2026-10-12 08:14:03     184213 index.html` : '\naws: error: argument path: Invalid argument type', m[1] ? '' : 'c-err');
  if (/^aws s3 ls$/.test(line)) return term.print(DATA.buckets[p].map((b, i) => `2026-${String(10 - i).padStart(2, '0')}-0${(i * 3) % 9 + 1} 0${i + 7}:1${i}:0${i} ${b}`).join('\n'));
  if (/^aws ec2 describe-instances/.test(line)) return term.print(awsTable('DescribeInstances', ['ID', 'Name', 'State', 'Type'], DATA.ec2[p]));
  if (/^aws lambda list-functions/.test(line)) return term.print(awsTable('ListFunctions', ['Name', 'Runtime', 'Memory'], DATA.lambda[p]));
  if (/^aws logs describe-log-groups/.test(line)) return term.print(awsTable('DescribeLogGroups', ['Name'], D.groups[p].map((g) => [g])));
  if (/^aws ecs list-clusters/.test(line)) return term.print(awsTable('ListClusters', ['clusterArns'], [[`arn:aws:ecs:${region}:000000000000:cluster/web-${p}`]]));
  if (/^aws eks list-clusters/.test(line)) return term.print(awsTable('ListClusters', ['clusters'], [[`apps-${p}`]]));
  if (/^aws cloudformation describe-stacks/.test(line)) return term.print(awsTable('DescribeStacks', ['Name', 'Status', 'Updated'], [[`network-${p}`, 'UPDATE_COMPLETE', '2026-10-03T11:20:41Z'], [`app-${p}`, 'UPDATE_COMPLETE', '2026-10-16T08:02:19Z']]));
  if (/^aws rds describe-db-instances/.test(line)) return term.print(awsTable('DescribeDBInstances', ['ID', 'Engine', 'Class', 'Status'], [[`orders-db-${p}`.replace('-prod', ''), 'postgres', p === 'prod' ? 'db.t4g.medium' : 'db.t4g.micro', 'available']]));
  if (/^aws dynamodb list-tables/.test(line)) return term.print(awsTable('ListTables', ['TableNames'], [[`sessions-${p}`], [`carts-${p}`]]));
  if (/^aws ce get-cost-and-usage/.test(line)) {
    term.print(awsTable('GetCostAndUsage', ['Service', 'Amount'], COST_ROWS.map(([n, v]) => [n, v.toFixed(4)])));
    return term.print('# demo: AWS charges $0.01 for each Cost Explorer request, so the deck never asks on a timer.', 'c-dim');
  }
  if ((m = line.match(/^aws logs tail '([^']+)' --follow --since 15m/))) return tailStream(m[1], p, region);
  return term.print("# demo: this command's output isn't simulated here.", 'c-dim');
}

// fictional log lines, by kind of group (documentation IP ranges, made-up ids)
function logGen(group) {
  let n = 0;
  const hex = (k) => Array.from({ length: k }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const ts = () => new Date(Date.now() - Math.max(0, 40 - n) * 21000).toISOString().replace('Z', '+00:00');
  const stream = `2026/10/18/[$LATEST]${hex(12)}`;
  let req = '';
  return () => {
    n++;
    if (group.startsWith('/aws/lambda/')) {
      const k = n % 4;
      if (k === 1) req = `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
      return [`${ts()} ${stream} START RequestId: ${req} Version: $LATEST`,
        `${ts()} ${stream} INFO  ${['order accepted', 'cart priced', 'payment authorized (test mode)', 'order queued'][n % 4]} {"orderId":"ord-${1000 + n}","items":${(n % 5) + 1}}`,
        `${ts()} ${stream} END RequestId: ${req}`,
        `${ts()} ${stream} REPORT RequestId: ${req}  Duration: ${(30 + (n * 7) % 40).toFixed(2)} ms  Billed Duration: ${31 + (n * 7) % 40} ms  Memory Size: 512 MB  Max Memory Used: ${80 + (n % 9)} MB`][k];
    }
    if (group.startsWith('/ecs/')) return `${ts()} ecs/web/${hex(10)} 198.51.100.${10 + (n % 40)} - - "${['GET /api/orders/' + (1040 + n), 'GET /health', 'POST /api/cart', 'GET /'][n % 4]} HTTP/1.1" ${n % 11 === 0 ? 404 : 200} ${400 + (n * 37) % 900} ${2 + (n * 3) % 30}ms`;
    if (group.includes('apigateway')) return `${ts()} ${hex(8)} {"requestId":"${hex(8)}-${hex(4)}","ip":"203.0.113.${20 + (n % 60)}","httpMethod":"${n % 3 ? 'GET' : 'POST'}","resourcePath":"/orders","status":"${n % 3 ? 200 : 201}","responseLatency":"${20 + (n * 11) % 60}"}`;
    return `${ts()} orders-db.0001 2026-10-18 UTC::@:[${400 + (n % 30)}]:LOG:  ${n % 3 ? `duration: ${(0.4 + (n % 9) / 7).toFixed(3)} ms  statement: SELECT id, status FROM orders WHERE id = ${1000 + n}` : `checkpoint complete: wrote ${10 + (n % 20)} buffers (0.1%)`}`;
  };
}
function tailStream(group, profile, region) {
  const gen = logGen(group);
  for (let i = 0; i < 6; i++) term.print(gen());
  const s = { t: 0, n: 0 };
  term.stream = s;
  term.draw();
  caption('TAIL', `Following <code>${esc(group)}</code> as <b>${esc(S.safe ? 'PROFILE ' + (PROFILES.indexOf(profile) + 1) : profile)}</b> in <b>${esc(region)}</b>. Fictional lines. <b>STOP</b> on the deck (Ctrl+C) ends it.`);
  const tick = () => {
    if (term.stream !== s) return;
    term.print(gen());
    if (++s.n >= 60) { term.print('# demo: the stream pauses here. STOP (Ctrl+C) ends it.', 'c-dim'); term.stream = null; term.draw(); return; }
    s.t = setTimeout(tick, reduce.matches ? 1600 : 700 + Math.random() * 900);
  };
  s.t = setTimeout(tick, 800);
}

// ── deck behavior ────────────────────────────────────────────────────────────
let hold = null, pendingPress = null;
function keyDown(d, i) {
  const sp = snap(d), v = sp.v[i];
  dev[d].keys[i].classList.add('pdk-down');
  inspect(d, 'k', i);
  interacted();
  if (!v) return;
  const m = meta(v);
  if (m.safety === 'Confirm') return holdStart(d, i, v);
  if (m.safety === 'NeverAuto') { pendingPress = { d, i, v }; return; }   // a deliberate press: acts on release
  act(d, i, v);   // safe keys act on key down, like the engine
}
function keyUp(d, i) {
  dev[d].keys[i].classList.remove('pdk-down');
  if (hold && hold.d === d && hold.i === i) holdEnd();
  if (pendingPress && pendingPress.d === d && pendingPress.i === i) { const p = pendingPress; pendingPress = null; act(p.d, p.i, p.v); }
}
function holdStart(d, i, v) {
  const fr = D.open.hold[v];
  hold = { d, i, v, timers: [], fired: false };
  [175, 350, 525].forEach((ms, k) => hold.timers.push(setTimeout(() => { if (fr?.[d]) { S.keyOver[d][i] = fr[d][k]; render(); } }, ms)));
  hold.timers.push(setTimeout(() => {
    if (!hold) return;
    hold.fired = true;
    if (fr?.[d + 'Done']) { S.keyOver[d][i] = fr[d + 'Done']; render(); }
    setTimeout(() => { delete S.keyOver[d][i]; render(); }, 1300);
    act(d, i, v, { held: true });
  }, HOLD_MS));
}
function holdEnd() {
  const h = hold;
  hold = null;
  if (!h || h.fired) return;
  h.timers.forEach(clearTimeout);
  delete S.keyOver[h.d][h.i];
  render();
  caption('TAP', `A tap of <b>${esc(label(h.v))}</b> sends nothing: hold it for 0.7 s. ${D.lines.run[h.v]?.enter ? 'Read-only commands run only at the end of a hold.' : 'It types the command and leaves the Enter to you.'}`);
}

function act(d, i, v, { held = false } = {}) {
  const m = meta(v);
  if (v === 'more') {
    const n = S.mode === 'console' ? D.console[S.stop][d].length : S.aws ? snap(d).pages : 1;
    if (n <= 1) { notify('More terminal pages live in the plugin; this demo has page 1.'); return; }
    S.page[d] = (S.page[d] + 1) % n;
    render({ wave: true });
    caption('MORE', `Page ${S.page[d] + 1} of ${n} on the ${d === 'galleon' ? 'Galleon' : 'Stream Deck +'}. The most-used keys sit on page 1; MORE always takes the last slot.`);
    return;
  }
  if (S.mode === 'console') return consoleKey(v, m);
  if (!S.aws) return termKey(v, m);
  return awsKey(d, i, v, m, held);
}
function consoleKey(v, m) {
  const go = GO_STOP[v];
  if (go) { const [stop, section] = Array.isArray(go) ? go : [go, null]; goStop(stop, { section, by: 'key' }); return; }
  if (SECTION_OF[v] && CONSOLE[S.stop].sections[SECTION_OF[v]]) { setSection(SECTION_OF[v]); tour.holdUntil = now() + 12000; caption(label(v), `${esc(m.long || m.label)}. In the plugin the key opens it in a new tab; here the page just changes.`); return; }
  if (v === 'aws.console.search') { const s = $('.aw-nav-search'); s.classList.add('is-hot'); setTimeout(() => s.classList.remove('is-hot'), 1600); caption('SEARCH', 'SEARCH sends <code>Alt+S</code>: the console\'s own search box. Type, and Enter opens the top result.'); return; }
  if (v.startsWith('aws.go.')) { caption(label(v), `${esc(m.long || m.label)}: not part of this tour.`); return; }
  caption(label(v), `${esc(m.long || m.label)}${m.does && !/planned|inprogress|in-progress/.test(m.does) ? ` · <code>${esc(m.does)}</code>` : ''}. The browser does the rest.`);
}
function termKey(v, m) {
  if (v === 'aws.mode') { S.aws = true; S.page = { galleon: 0, plus: 0 }; render({ wave: true }); caption('AWS', 'The <b>AWS</b> key turned this terminal into the AWS CLI page: PowerShell syntax, because the tab says Windows PowerShell. Turn <b>PROFILE</b> and push it.'); return; }
  if (v === 'docker.mode') { caption('DOCKER', '<b>DOCKER</b> opens the Docker pages, from Prism\'s Docker module. Not part of this demo: press <b>AWS</b>.'); return; }
  caption(label(v), `${esc(m.long || m.label)}${m.does ? ` · sends <code>${esc(m.does)}</code> to Windows Terminal` : ''}. Press the flashing <b>AWS</b> key for the AWS pages.`);
}
function awsKey(d, i, v, m, held) {
  if (v === 'aws.modeToggle') { S.aws = false; S.page = { galleon: 0, plus: 0 }; render({ wave: true }); caption('AWS OFF', 'Back on the plain terminal page. The AWS key stays where it was.'); return; }
  if (v === 'aws.stop') { if (term.stream || term.buf) term.interrupt(); else caption('STOP', '<b>STOP</b> sends Ctrl+C: nothing is running.'); return; }
  if (v === 'aws.deck.account') {
    if (!S.profile) { caption('ACCOUNT', '<b>ACCOUNT</b> asks <code>sts get-caller-identity</code> for the deck\'s profile: choose one on the <b>PROFILE</b> dial first.'); return; }
    caption('ACCOUNT', S.safe ? 'ACCOUNT checked. Streamer-safe keeps the account off the deck.' : 'ACCOUNT: <b>•••• 0000</b>, ROLE. Masked at the source: only the last four digits ever reach the deck.');
    return;
  }
  if (v === 'aws.deck.loadLogs') {
    if (!S.profile) { caption('LOAD LOGS', '<b>LOAD LOGS</b> lists the log groups for the deck\'s profile: choose one on the <b>PROFILE</b> dial first.'); return; }
    S.logs = true; render();
    caption('LOAD LOGS', `${D.groups[S.profile].length} log groups on the <b>LOG GROUP</b> dial (one <code>logs describe-log-groups</code> call, the first 200 names).`);
    return;
  }
  if (v === 'aws.deck.cost') {
    if (!S.profile) { caption('MONTH $', '<b>MONTH $</b> asks Cost Explorer for the deck\'s profile: choose one on the <b>PROFILE</b> dial first.'); return; }
    const again = S.cost[S.profile];
    S.cost[S.profile] = true; render();
    caption('MONTH $', S.safe ? 'Cost updated. Streamer-safe keeps the amount off the deck.' : `This month: <b>${D.cost[S.profile]}</b> (fictional). ${again ? 'A second press within a minute reuses the answer.' : 'That press made one Cost Explorer request: AWS charges $0.01 each, so the deck never asks on a timer.'}`);
    return;
  }
  const run = D.lines.run[v];
  if (run && run.text) {
    const why = run.enter ? '' : /(start|stop)-instances|s3 cp|update-service|sso logout/.test(run.text) ? 'This one changes resources: finish it, then you press Enter.' : 'Finish the line, then you press Enter.';
    term.type(run.text, { left: run.left || 0, enter: run.enter, why });
    caption(label(v), run.enter ? `${held ? 'Held 0.7 s: ' : ''}typed <code>${esc(run.text.length > 90 ? run.text.slice(0, 87) + '…' : run.text)}</code> and pressed Enter. Read-only.` : `Typed <code>${esc(run.text)}</code>${run.left ? ' with the cursor between the quotes' : ''}. <b>Not run:</b> you press Enter.`);
    return;
  }
  caption(label(v), `${esc(m.long || m.label)}${m.does ? ` · sends <code>${esc(m.does)}</code>` : ''}.`);
}

// dials
let toastAt = 0;
function quietNote(html) { if (now() - toastAt > 2500) { toastAt = now(); caption('DIAL', html); } }
function turn(d, i, delta) {
  interacted();
  S.sel[d] = i;
  const R = dev[d], knob = d === 'galleon' ? i % 2 : i;
  R.rot[knob] += delta * 18;
  R.knobs[knob]?.style.setProperty('--rot', `${R.rot[knob]}deg`);
  const sp = snap(d), ctl = sp.c[i], cur = S.cur[d];
  if (S.mode !== 'terminal' || !S.aws) {
    render();
    inspect(d, 'w', i, true);
    quietNote(ctl === 'aws.console.regions' ? 'The <b>REGION</b> dial browses Regions in the plugin. Applying one to the tab needs the browser module (planned), so this demo keeps the page in N. Virginia.' : `<b>${esc(ctlName(ctl))}</b> turns in the app; this demo plays the AWS CLI dials.`);
    return;
  }
  if (ctl === 'aws.profiles.pwsh') cur.profile = clamp(cur.profile + delta, 0, PROFILES.length - 1);
  else if (ctl === 'aws.regions.pwsh') cur.region = clamp(cur.region + delta, 0, regionsFor().length - 1);
  else if (ctl === 'aws.logGroups.pwsh') { if (!(S.profile && S.logs)) quietNote('The <b>LOG GROUP</b> dial is empty until <b>LOAD LOGS</b>, or a <b>PROFILE</b> push, lists the groups.'); else cur.logs = clamp(cur.logs + delta, 0, groupsFor().length - 1); }
  else if (ctl === 'aws.page') { term.body.scrollTop += delta * 120; }
  render();
  inspect(d, 'w', i, true);
}
function flashDial(d, i, h) { if (!h) return; S.flash[d][i] = { h, until: now() + 1300 }; setTimeout(() => render(), 1350); }
function push(d, i) {
  interacted();
  S.sel[d] = i;
  const sp = snap(d), ctl = sp.c[i], cur = S.cur[d], m = M();
  if (S.mode !== 'terminal' || !S.aws) { render(); inspect(d, 'w', i, true); quietNote(ctl === 'aws.console.regions' ? 'Pushing <b>REGION</b> would switch the tab\'s Region: planned (the browser module).' : `<b>${esc(ctlName(ctl))}</b>: push for ${esc(label(meta(ctl).push) || 'its action')} in the app.`); return; }
  if (ctl === 'aws.profiles.pwsh') {
    const p = PROFILES[cur.profile];
    S.profile = p; S.logs = false;
    for (const dd of DEVS) S.cur[dd].logs = 0;
    flashDial(d, i, m.flash.profile[p]?.galleon);   // the dial art is the same on both decks
    term.type(D.lines.profile[p], { why: 'You press Enter to set it in this shell. The deck already works as this profile.' });
    caption('PROFILE', `Typed <code>${esc(D.lines.profile[p])}</code>, no Enter. ${S.safe ? 'Streamer-safe: the deck says PROFILE ' + (cur.profile + 1) + '.' : ''} Two read-only calls follow the push: <b>ACCOUNT</b> and the log groups…`);
    setTimeout(() => { if (S.profile !== p) return; S.logs = true; render(); caption('PROFILE', `${S.safe ? 'PROFILE ' + (PROFILES.indexOf(p) + 1) : '<b>' + esc(p) + '</b>'} is the deck's profile: <b>ACCOUNT</b> shows ${S.safe ? 'nothing on stream' : '•••• 0000'}, and <b>LOG GROUP</b> lists ${D.groups[p].length} groups. Press Enter in the terminal to use it there too.`); }, 700);
  } else if (ctl === 'aws.regions.pwsh') {
    const code = regionsFor()[cur.region];
    const line = S.profile ? D.lines.region[S.profile][cur.region] : D.lines.region.none[cur.region];
    S.region = code;
    flashDial(d, i, m.flash.region[S.profile ?? 'none']?.galleon?.[cur.region]);
    term.type(line, { why: 'You press Enter to set it in this shell.' });
    caption('REGION', `Typed <code>${esc(line)}</code>, no Enter. The deck's tail lines now say <code>--region ${esc(code)}</code>.`);
  } else if (ctl === 'aws.logGroups.pwsh') {
    if (!(S.profile && S.logs)) { quietNote('Nothing to tail yet: push <b>PROFILE</b> or press <b>LOAD LOGS</b>.'); return; }
    let line = D.lines.tail[S.profile][cur.logs];
    if (S.region) line = line.replace(/--region \S+$/, `--region ${S.region}`);
    flashDial(d, i, m.flash.tail[S.profile]?.galleon?.[cur.logs]);
    term.type(line, { why: 'You press Enter: the tail follows until STOP (Ctrl+C).' });
    caption('LOG GROUP', `Typed <code>${esc(line)}</code>. <b>Not run:</b> you press Enter, and fictional log lines follow.`);
  } else if (ctl === 'aws.page') term.scrollBottom();
  render();
  inspect(d, 'w', i, true);
}

// input wiring: pointer + keyboard on keys, widgets, segments and knobs
function wire() {
  for (const d of DEVS) {
    const R = dev[d];
    R.keys.forEach((k, i) => {
      k.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); k.setPointerCapture?.(e.pointerId); keyDown(d, i); });
      k.addEventListener('pointerup', () => keyUp(d, i));
      k.addEventListener('pointercancel', () => keyUp(d, i));
      k.addEventListener('lostpointercapture', () => { if (hold?.d === d && hold.i === i) keyUp(d, i); });
      k.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); keyDown(d, i); } else if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
      k.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); keyUp(d, i); } });
      k.addEventListener('click', (e) => e.preventDefault());
      k.addEventListener('pointerenter', () => inspect(d, 'k', i, true));
      k.addEventListener('focus', () => inspect(d, 'k', i, true));
    });
    R.wid.forEach((w, i) => {
      w.addEventListener('click', () => { if (d === 'plus') { push(d, i); return; }   // the + strip is touch: a tap is a push
        if (S.sel[d] !== i) { S.sel[d] = i; render(); inspect(d, 'w', i); quietNote('Selected. Turn it with the wheel, the arrow keys or ◀ ▶; push with a second click, Enter or PUSH.'); } else push(d, i); });
      w.addEventListener('wheel', (e) => { e.preventDefault(); wheelTurn(d, i, e.deltaY || e.deltaX); }, { passive: false });
      w.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); turn(d, i, 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); turn(d, i, -1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); push(d, i); }
      });
      w.addEventListener('pointerenter', () => inspect(d, 'w', i, true));
      w.addEventListener('pointerdown', () => { w._ptr = true; });
      w.addEventListener('focus', () => { if (w._ptr) return; S.sel[d] = i; render(); inspect(d, 'w', i, true); });   // keyboard focus selects; a click selects in its own handler
      w.addEventListener('blur', () => { w._ptr = false; });
    });
    R.knobs.forEach((kn, k) => {
      const target = () => (d === 'galleon' ? layerOf(S.sel[d]) * 2 + k : k);
      kn.setAttribute('aria-label', d === 'galleon' ? `Dial ${k + 1} (turns the selected layer's dial ${k + 1})` : `Dial ${k + 1}`);
      let drag = null;
      kn.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = { x: e.clientX, acc: 0, moved: false }; kn.setPointerCapture?.(e.pointerId); });
      kn.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; drag.acc += dx; while (Math.abs(drag.acc) >= 22) { const s = Math.sign(drag.acc); drag.acc -= s * 22; drag.moved = true; turn(d, target(), s); } });
      kn.addEventListener('pointerup', () => { if (drag && !drag.moved) push(d, target()); drag = null; });
      kn.addEventListener('pointercancel', () => { drag = null; });
      kn.addEventListener('wheel', (e) => { e.preventDefault(); wheelTurn(d, target(), e.deltaY || e.deltaX); }, { passive: false });
      kn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); turn(d, target(), 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); turn(d, target(), -1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); push(d, target()); }
      });
      kn.addEventListener('click', (e) => e.preventDefault());
    });
  }
  $('#aw-dialbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !S.insp || S.insp.kind !== 'w') return;
    if (b.dataset.turn) turn(S.insp.d, S.insp.i, +b.dataset.turn); else push(S.insp.d, S.insp.i);
  });
}
const wheelAcc = {};
function wheelTurn(d, i, dy) {
  const k = d + i;
  wheelAcc[k] = (wheelAcc[k] || 0) + dy;
  if (Math.abs(wheelAcc[k]) < 40 && Math.abs(dy) < 40) return;
  const s = Math.sign(wheelAcc[k]);
  wheelAcc[k] = 0;
  turn(d, i, s);
}

// ── modes, toolbar ───────────────────────────────────────────────────────────
function setMode(mode, { stop, by = 'key' } = {}) {
  S.mode = mode;
  S.page = { galleon: 0, plus: 0 };
  $('#stage').dataset.mode = mode;
  for (const t of $$('.aw-modes [role="tab"]')) { const on = t.dataset.mode === mode; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
  $('#aw-screen').setAttribute('aria-labelledby', `tab-${mode}`);
  $('[data-win="console"]').hidden = mode !== 'console';
  $('[data-win="terminal"]').hidden = mode !== 'terminal';
  $('#aw-pause').hidden = mode !== 'console';
  if (mode === 'console') { if (stop) S.stop = stop; goStop(S.stop, { by }); return; }
  clearInterval(liveTimer);
  render({ wave: true });
  caption(S.aws ? 'AWS CLI' : 'TERMINAL', S.aws ? 'Windows Terminal is in front, in AWS mode.' : 'Windows Terminal is in front: the deck shows the terminal page. Press the flashing <b>AWS</b> key for the AWS CLI pages.');
  preload();
}
$$('.aw-modes [role="tab"]').forEach((t) => {
  t.addEventListener('click', () => setMode(t.dataset.mode));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const tabs = $$('.aw-modes [role="tab"]'), n = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); setMode(n.dataset.mode);
  });
});
$$('#aw-stops button').forEach((b) => b.addEventListener('click', () => goStop(b.dataset.stop, { by: 'user' })));
$('#aw-main').addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); goStop(a.dataset.go, { by: 'user' }); } });
$('#aw-side').addEventListener('click', (e) => { const a = e.target.closest('[data-sec]'); if (a) { e.preventDefault(); if (a.dataset.sec) { setSection(a.dataset.sec); tour.holdUntil = now() + 12000; } } });
$('#aw-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = e.target.value.toLowerCase(); const hit = STOPS.find((s) => q && (s.includes(q) || STOP_NAME[s].toLowerCase().includes(q))); if (hit) goStop(hit, { by: 'user' }); e.target.value = ''; } });
document.addEventListener('keydown', (e) => { if (e.altKey && (e.key === 's' || e.key === 'S') && S.mode === 'console') { e.preventDefault(); $('#aw-search').focus(); } });
const safeBtn = $('#aw-safe');
safeBtn.addEventListener('click', () => {
  S.safe = !S.safe;
  safeBtn.setAttribute('aria-checked', String(S.safe));
  render({ wave: true });
  caption('STREAMER-SAFE', S.safe ? 'On: the deck shows PROFILE 1, 2, 3 and LOG GROUP n, and the account and the cost leave it. Your terminal and the AWS page stay yours: Prism can only hide what it draws.' : 'Off: names, the masked account and the cost are back on the deck.');
});
const pauseBtn = $('#aw-pause');
pauseBtn.addEventListener('click', () => {
  tour.paused = !tour.paused;
  pauseBtn.setAttribute('aria-pressed', String(tour.paused));
  pauseBtn.querySelector('span').textContent = tour.paused ? 'Play the tour' : 'Pause the tour';
  pauseBtn.querySelector('use').setAttribute('href', tour.paused ? '#i-play' : '#i-pause');
});
$$('.aw-picker button').forEach((b) => b.addEventListener('click', () => {
  $('.aw-grid').dataset.show = b.dataset.show;
  for (const x of $$('.aw-picker button')) x.setAttribute('aria-pressed', String(x === b));
}));
const stage = $('#stage');
stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tour.hover = true; });
stage.addEventListener('pointerleave', () => { tour.hover = false; });
stage.addEventListener('focusin', () => { tour.hover = true; });
stage.addEventListener('focusout', (e) => { if (!stage.contains(e.relatedTarget)) tour.hover = false; });
new IntersectionObserver(([e]) => { tour.visible = e.isIntersecting; }, { threshold: 0.25 }).observe(stage);
function interacted() { tour.holdUntil = now() + 12000; }

// preload the terminal frames when the terminal is first shown (so the AWS key redraws at once)
let preloaded = false;
function preload() {
  if (preloaded) return;
  preloaded = true;
  const hs = new Set();
  (function walk(x) { if (typeof x === 'string') { if (/^[0-9a-f]{10}$/.test(x)) hs.add(x); } else if (x && typeof x === 'object') Object.values(x).forEach(walk); })([D.open.term, D.open.pages.none, D.open.dials.profile.none, D.open.dials.logs.none, D.open.dials.region.none, D.open.dials.page]);
  const list = [...hs];
  const step = () => { for (const h of list.splice(0, 12)) { const im = new Image(); im.src = FR(h); } if (list.length) (window.requestIdleCallback || setTimeout)(step); };
  step();
}

// ── start ────────────────────────────────────────────────────────────────────
wire();
term.draw();
term.print('PowerShell 7 (demo)', 'c-dim');
term.print('# A mock terminal: the deck types here, you press Enter. Nothing talks to AWS.', 'c-dim');
if (S.safe) safeBtn.setAttribute('aria-checked', 'true');
setMode(S.mode, { by: 'tour' });
if (S.mode === 'console' && qs.get('stop')) tour.holdUntil = now() + 12000;
requestAnimationFrame(tourTick);
window.__aws = { S, D, press: (d, v) => { const i = snap(d).v.indexOf(v); if (i < 0) return false; keyDown(d, i); setTimeout(() => keyUp(d, i), meta(v).safety === 'Confirm' ? HOLD_MS + 60 : 30); return true; },
  turn: (d, ctl, n) => { const i = snap(d).c.indexOf(ctl); if (i >= 0) turn(d, i, n); return i >= 0; }, push: (d, ctl) => { const i = snap(d).c.indexOf(ctl); if (i >= 0) push(d, i); return i >= 0; },
  mode: setMode, stop: (s) => goStop(s, { by: 'user' }), enter: () => { if (!term.stream) term.run(); }, term, ready: true };
