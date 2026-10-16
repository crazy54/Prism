// Builds design/first-light/first-light.html — the standalone First Light prototype over a
// static mock of the new Prism app (top bar · rail with spectral index · tile grid).
//   node design/first-light/src/build-proto.mjs
// URL params: ?mode=auto|full|echo|fade|none  ?theme=day  ?t=<ms> (freeze)  ?ui=0 (hide QA panel)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), FL = join(HERE, '..'), DESIGN = join(FL, '..');
const sprite = readFileSync(join(DESIGN, 'icons/icons.svg'), 'utf8');
const TOK = JSON.parse(readFileSync(join(DESIGN, 'tokens.json'), 'utf8'));
const COUNTS = { charts: 209, fx: 146, lab: 217, ai: 118, objects: 91, input: 101, text: 100, shapes: 53, maps: 50, notify: 50, arch: 50, callouts: 50, obsidian: 130, menus: 37, spectrums: 1266, idea: 12, mobile: 36, desktop: 34 };
const ic = (n, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const FACE = '<span class="pm-face"><i class="pm-rim"></i><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 100 50 0M0 100h100"/></svg></span>';
const MARK = (sz, extra = '') => `<span class="prism-mark ${extra}" style="--pm:${sz}px" aria-hidden="true"><span class="pm-rotor">${FACE.repeat(4)}<i class="pm-apex"></i></span></span>`;

const app = TOK.galleries.app.map(g => ({ ...g, icon: g.id, count: { facets: 24, search: '', variants: '', showcase: '', collections: 3 }[g.id] }));
const web = TOK.galleries.web;
const navMain = web.filter(g => !['mobile', 'desktop'].includes(g.id));
const navPlat = web.filter(g => ['mobile', 'desktop'].includes(g.id));
const link = (g, i, current) => `<a class="nv" href="#${g.id}" data-fl="index" data-rf-gallery="${g.id}"${current ? ' aria-current="page"' : ''}><i class="ix${g.kind === 'app' ? ' white' : ''}"></i>${ic(g.id)}<span class="lb">${g.label}</span><em class="lam">${g.lambda}</em><span class="ct">${g.count ?? COUNTS[g.id] ?? ''}</span></a>`;

const tiles = [
  ['KPI + Sparkline', 'CHT·001', `<div class="kpi"><small>ON-DEMAND SPEND</small><b>$48.2K</b><svg viewBox="0 0 120 30" class="spark"><path d="M0 22 12 18 24 21 36 12 48 15 60 8 72 11 84 6 96 9 108 3 120 5"/><path class="area" d="M0 22 12 18 24 21 36 12 48 15 60 8 72 11 84 6 96 9 108 3 120 5V30H0Z"/></svg></div>`, ['KPI', 'Trend']],
  ['Ring Gauge', 'CHT·014', `<svg viewBox="0 0 100 100" class="ring"><circle cx="50" cy="50" r="38"/><circle class="on" cx="50" cy="50" r="38" pathLength="100" stroke-dasharray="72 100"/><text x="50" y="56">72%</text></svg>`, ['Gauge']],
  ['Comparison Bars', 'CHT·027', `<div class="bars">${[68, 92, 54, 80, 38, 74].map((h, i) => `<i style="height:${h}%;--o:${0.45 + i * 0.09}"></i>`).join('')}</div>`, ['Compare']],
  ['Delta Chips', 'CHT·033', `<div class="chips"><span class="up">▲ 12.4%</span><span class="dn">▼ 3.1%</span><span class="fl">● 0.0%</span></div>`, ['Status']],
  ['Area Trend', 'CHT·041', `<svg viewBox="0 0 160 70" class="areaT"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="M0 52C20 50 26 30 44 34s28 18 46 6 30-30 46-26 18 8 24 6V70H0Z" fill="url(#ag)"/><path d="M0 52C20 50 26 30 44 34s28 18 46 6 30-30 46-26 18 8 24 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`, ['Trend']],
  ['Bullet Chart', 'CHT·052', `<div class="bullet"><div><span>Revenue</span><i style="--w:78%"></i><b style="--x:86%"></b></div><div><span>Margin</span><i style="--w:54%"></i><b style="--x:60%"></b></div><div><span>Seats</span><i style="--w:91%"></i><b style="--x:80%"></b></div></div>`, ['Target']],
  ['Spectral Heat Strip', 'CHT·066', `<div class="heat">${Array.from({ length: 28 }, (_, i) => `<i style="--a:${(0.18 + 0.82 * Math.abs(Math.sin(i * 1.7))).toFixed(2)}"></i>`).join('')}</div>`, ['Density']],
  ['Donut Split', 'CHT·071', `<svg viewBox="0 0 100 100" class="donut"><circle r="34" cx="50" cy="50" pathLength="100" stroke-dasharray="46 100" style="--c:var(--rf-s-violet-v)"/><circle r="34" cx="50" cy="50" pathLength="100" stroke-dasharray="30 100" stroke-dashoffset="-47" style="--c:var(--rf-s-azure-v)"/><circle r="34" cx="50" cy="50" pathLength="100" stroke-dasharray="21 100" stroke-dashoffset="-78" style="--c:var(--rf-s-mint-v)"/></svg>`, ['Share']],
  ['Count-up Stat', 'CHT·088', `<div class="kpi c"><small>P95 LATENCY</small><b>128<i>ms</i></b><span class="up">▼ 18ms vs last week</span></div>`, ['KPI']],
  ['Status Timeline', 'CHT·094', `<div class="tl">${['ok', 'ok', 'ok', 'warn', 'ok', 'ok', 'neg', 'ok', 'ok', 'ok', 'ok', 'ok'].map(s => `<i class="${s}"></i>`).join('')}</div>`, ['Status']],
  ['Progress Steps', 'CHT·103', `<div class="steps"><i class="d"></i><i class="d"></i><i class="a"></i><i></i><i></i></div>`, ['Progress']],
  ['Sparkline Table', 'CHT·117', `<div class="tbl">${['api.example', 'edge.example', 'jobs.example'].map((n, i) => `<p><span>${n}</span><svg viewBox="0 0 60 14"><path d="M0 ${9 - i} 10 ${6 + i} 20 ${8 - i} 30 4 40 ${7 + i} 50 3 60 ${5 + i}"/></svg><b>${['99.98', '99.91', '98.70'][i]}%</b></p>`).join('')}</div>`, ['Table']],
];
const tile = ([t, code, body, tags]) => `<article class="tile" data-fl="tile"><header><h3>${t}</h3><span class="code">${code}</span></header><div class="pv">${body}</div><footer>${tags.map(x => `<span class="tag">${x}</span>`).join('')}<button class="copy" type="button">${ic('copy', 's14')}Copy</button></footer></article>`;

const html = `<!doctype html>
<html lang="en" data-theme="prism-dark" data-rf-mode="night">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prism · First Light — prototype</title>
<link rel="icon" href="../brand/favicon.svg" type="image/svg+xml">
<script>
/* 1 · arm before first paint (the snippet the shell inlines in <head>, plus prototype params) */
(function(){var q=new URLSearchParams(location.search),r=document.documentElement;
if(q.get('theme')==='day'){r.setAttribute('data-theme','prism-light');r.setAttribute('data-rf-mode','day');}
try{var m=q.get('mode')||'auto';if(m!=='none'&&!(m==='auto'&&matchMedia('(prefers-reduced-motion: reduce)').matches))r.classList.add('pfl-armed')}catch(e){}})();
</script>
<link rel="stylesheet" href="../prism.css">
<link rel="stylesheet" href="../brand/prism-mark.css">
<link rel="stylesheet" href="first-light.css">
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:400 var(--rf-fs-body)/var(--rf-lh-body) var(--font);-webkit-font-smoothing:antialiased;overflow:hidden}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}a{color:inherit;text-decoration:none}
.icon{width:18px;height:18px;display:block;flex:none}.s14{width:14px;height:14px}.s16{width:16px;height:16px}.s20{width:20px;height:20px}
/* top bar */
.tb{position:fixed;inset:0 0 auto 0;height:var(--rf-topbar-h);display:flex;align-items:center;gap:14px;padding:0 18px 0 20px;
  background:var(--cs-topnav-bg);border-bottom:1px solid var(--cs-topnav-line);box-shadow:var(--cs-topnav-elev);backdrop-filter:blur(18px) saturate(140%);z-index:5}
.brand{display:flex;align-items:center;gap:9px;margin-right:8px}
.brand b{font-size:21px;font-weight:600;letter-spacing:-.045em;line-height:1}.brand b i{font-style:normal;color:var(--accent)}
.seg{display:flex;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.seg button{display:flex;align-items:center;gap:7px;height:28px;padding:0 11px;border-radius:7px;font-size:12.5px;color:var(--muted)}
.seg button[aria-selected=true]{background:var(--panel2);color:var(--ink);box-shadow:var(--elev-1)}
.seg button[aria-selected=true] .icon{color:var(--rf-hue);--icon-fill:rgba(var(--rf-hue-rgb),.24);--icon-accent:var(--rf-beam-core);--icon-glint:1;--icon-glint-color:var(--rf-beam-core)}
.search{display:flex;align-items:center;gap:9px;width:300px;height:34px;padding:0 8px 0 11px;margin-left:10px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--dim);font-size:12.5px}
.search kbd{margin-left:auto;display:flex;align-items:center;gap:3px;height:20px;padding:0 6px;border:1px solid var(--line);border-radius:5px;font:10px var(--rf-mono);color:var(--muted)}
.sp{flex:1}
.chip{display:flex;align-items:center;gap:7px;font:550 10px var(--rf-mono);letter-spacing:.12em;color:var(--muted)}.chip i{width:6px;height:6px;border-radius:50%;background:var(--pos);box-shadow:0 0 9px rgba(var(--pos-rgb),.5)}
.ds{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px 0 12px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-size:12.5px}
.ds .icon{color:var(--muted)}
.ib{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--muted)}
.ib:hover{color:var(--ink)}
/* rail */
.rail{position:fixed;left:0;top:var(--rf-topbar-h);bottom:0;width:var(--rf-rail-w);padding:14px 12px 20px;overflow:hidden;background:var(--panel);border-right:1px solid var(--line);z-index:4}
.rh{display:flex;justify-content:space-between;margin:16px 10px 7px;font:600 var(--rf-fs-eyebrow)/1 var(--rf-mono);letter-spacing:var(--rf-ls-eyebrow);color:var(--dim)}
.rh:first-child{margin-top:4px}
.nv{position:relative;display:flex;align-items:center;gap:11px;height:31px;padding:0 10px 0 12px;border-radius:8px;font-size:13px;color:var(--muted)}
.nv .icon{color:color-mix(in srgb,var(--rf-hue) 72%,var(--muted))}
.nv .lb{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nv .ct{font:var(--rf-fs-count)/1 var(--rf-mono);color:var(--dim)}
.nv .lam{display:none;font:10px/1 var(--rf-mono);font-style:normal;color:var(--rf-hue)}
.nv .ix{position:absolute;left:-12px;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:var(--rf-hue-v);opacity:.62}
.nv .ix.white{background:var(--rf-white);opacity:.45}
.nv:hover{background:var(--rf-hover);color:var(--ink)}
.nv[aria-current=page]{color:var(--ink);background:linear-gradient(90deg,rgba(var(--rf-hue-rgb),.16),rgba(var(--rf-hue-rgb),.03) 70%,transparent)}
.nv[aria-current=page] .ix{opacity:1;top:6px;bottom:6px;box-shadow:0 0 12px rgba(var(--rf-hue-rgb),.85)}
.nv[aria-current=page] .icon{color:var(--rf-hue);--icon-fill:rgba(var(--rf-hue-rgb),.26);--icon-accent:var(--rf-beam-core);--icon-glint:1;--icon-glint-color:var(--rf-beam-core)}
.nv[aria-current=page] .lam{display:block}.nv[aria-current=page] .ct{display:none}
/* stage */
.stage{position:fixed;left:var(--rf-rail-w);top:var(--rf-topbar-h);right:0;bottom:0;overflow:hidden;padding:30px 32px 40px}
.stage:before{content:"";position:absolute;inset:0 0 auto 0;height:300px;pointer-events:none;background-image:linear-gradient(var(--rf-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--rf-grid-line) 1px,transparent 1px);background-size:34px 34px;-webkit-mask-image:radial-gradient(ellipse 60% 100% at 20% 0,#000,transparent 75%);mask-image:radial-gradient(ellipse 60% 100% at 20% 0,#000,transparent 75%)}
.ph{position:relative;max-width:1100px}
.ph .eyebrow{display:flex;gap:12px;align-items:center;margin:0;font:600 var(--rf-fs-eyebrow)/1 var(--rf-mono);letter-spacing:var(--rf-ls-eyebrow);color:var(--rf-hue)}
.eyebrow span{color:var(--dim)}
.ph h1{margin:14px 0 8px;font-size:var(--rf-fs-h1);line-height:var(--rf-lh-h1);letter-spacing:var(--rf-ls-h1);font-weight:600}
.ph p{margin:0;max-width:680px;color:var(--muted);font-size:14px;line-height:1.7}
.ruler{position:relative;height:1px;margin:20px 0 16px;background:var(--line)}
.ruler:before{content:"";position:absolute;left:0;width:min(560px,60%);top:0;height:1px;background:var(--rf-spectrum);opacity:.85}
.ruler:after{content:"";position:absolute;left:0;top:-3px;width:7px;height:7px;border-radius:50%;background:var(--rf-hue-v);box-shadow:0 0 10px rgba(var(--rf-hue-rgb),.9)}
.filters{display:flex;gap:8px;flex-wrap:wrap}
.filters button{height:30px;padding:0 12px;border:1px solid var(--line);border-radius:999px;font-size:12px;color:var(--muted);background:var(--panel)}
.filters button[aria-pressed=true]{color:var(--ink);border-color:rgba(var(--rf-hue-rgb),.55);background:rgba(var(--rf-hue-rgb),.12)}
.filters button b{font:500 10.5px var(--rf-mono);color:var(--dim);margin-left:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--rf-tile-min),1fr));gap:var(--rf-gutter);margin-top:24px}
.tile{position:relative;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--card);background-image:var(--cardgrad);box-shadow:var(--elev-1);overflow:hidden}
.tile>header{display:flex;justify-content:space-between;align-items:baseline;padding:13px 15px 0}
.tile h3{margin:0;font-size:13px;font-weight:600;letter-spacing:-.01em}
.code{font:10px var(--rf-mono);letter-spacing:.08em;color:var(--dim)}
.pv{height:150px;display:grid;place-items:center;color:var(--rf-hue-v);padding:10px 18px}
.tile footer{display:flex;align-items:center;gap:6px;padding:10px 12px 11px 15px;border-top:1px solid var(--rf-line-soft)}
.tag{font:10px var(--rf-mono);letter-spacing:.06em;padding:3px 7px;border-radius:5px;border:1px solid var(--line);color:var(--muted)}
.copy{margin-left:auto;display:flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:7px;font-size:11.5px;color:var(--muted)}
.copy:hover{color:var(--ink);background:var(--rf-hover)}
/* previews */
.kpi{width:100%}.kpi small{display:block;font:600 9.5px var(--rf-mono);letter-spacing:.14em;color:var(--dim)}
.kpi b{display:block;font-size:34px;font-weight:600;letter-spacing:-.04em;color:var(--ink);margin:4px 0 6px}.kpi b i{font-size:16px;font-style:normal;color:var(--muted);margin-left:3px}
.spark{width:100%;height:34px;overflow:visible}.spark path{fill:none;stroke:currentColor;stroke-width:1.6}.spark .area{fill:currentColor;stroke:none;opacity:.12}
.kpi .up{font-size:12px;color:var(--pos)}
.ring{width:108px;height:108px}.ring circle{fill:none;stroke:var(--line);stroke-width:7}.ring .on{stroke:currentColor;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;filter:drop-shadow(0 0 6px rgba(var(--rf-hue-rgb),.45))}
.ring text{fill:var(--ink);font:600 19px var(--font);text-anchor:middle;letter-spacing:-.03em}
.bars{display:flex;align-items:flex-end;gap:10px;height:100px;width:100%}.bars i{flex:1;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,currentColor,rgba(var(--rf-hue-rgb),.25));opacity:var(--o)}
.chips{display:flex;flex-direction:column;gap:9px}.chips span{font:600 13px var(--rf-mono);padding:6px 12px;border-radius:999px}
.up{color:var(--pos)}.chips .up{background:rgba(var(--pos-rgb),.12)}.chips .dn{color:var(--neg);background:rgba(var(--neg-rgb),.12)}.chips .fl{color:var(--muted);background:var(--rf-hover)}
.areaT{width:100%;height:96px}
.bullet{width:100%;display:grid;gap:13px}.bullet div{position:relative;height:10px;border-radius:3px;background:var(--rf-line-soft)}
.bullet span{position:absolute;top:-15px;font-size:10.5px;color:var(--dim)}.bullet i{position:absolute;inset:0 auto 0 0;width:var(--w);border-radius:3px;background:currentColor;opacity:.85}
.bullet b{position:absolute;top:-3px;bottom:-3px;left:var(--x);width:2px;background:var(--ink)}
.heat{display:grid;grid-template-columns:repeat(14,1fr);gap:4px;width:100%}.heat i{aspect-ratio:1;border-radius:3px;background:currentColor;opacity:var(--a)}
.donut{width:108px;height:108px;transform:rotate(-90deg)}.donut circle{fill:none;stroke:var(--c);stroke-width:12}
.tl{display:flex;gap:4px;width:100%}.tl i{flex:1;height:34px;border-radius:3px;background:rgba(var(--pos-rgb),.65)}.tl .warn{background:rgba(var(--warn-rgb),.8)}.tl .neg{background:rgba(var(--neg-rgb),.8)}
.steps{display:flex;align-items:center;width:100%}.steps i{flex:1;height:2px;background:var(--line);position:relative}.steps i:before{content:"";position:absolute;left:0;top:-6px;width:14px;height:14px;border-radius:50%;border:2px solid var(--line);background:var(--card)}
.steps .d{background:currentColor}.steps .d:before{border-color:currentColor;background:currentColor}.steps .a:before{border-color:currentColor;box-shadow:0 0 0 4px rgba(var(--rf-hue-rgb),.2)}
.tbl{width:100%;font-size:11.5px}.tbl p{display:flex;align-items:center;gap:10px;margin:0;padding:7px 0;border-bottom:1px solid var(--rf-line-soft)}.tbl span{flex:1;color:var(--muted)}.tbl svg{width:60px;height:14px}.tbl path{fill:none;stroke:currentColor;stroke-width:1.4}.tbl b{font:500 11px var(--rf-mono);color:var(--ink)}
/* QA panel (prototype only) */
.qa{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:6px;padding:6px;border:1px solid var(--line);border-radius:12px;background:var(--rf-glass-strong);backdrop-filter:blur(12px);box-shadow:var(--rf-shadow-2)}
.qa button{height:28px;padding:0 10px;border-radius:8px;font:550 10px var(--rf-mono);letter-spacing:.1em;color:var(--muted)}.qa button:hover{color:var(--ink);background:var(--rf-hover)}
.qa b{align-self:center;font:550 10px var(--rf-mono);letter-spacing:.1em;color:var(--dim);padding:0 6px}
</style>
</head>
<body>
${sprite}
<header class="tb" data-fl="surface">
  <a class="brand" href="#" aria-label="Prism home"><span data-fl="mark">${MARK(26, 'is-small')}</span><b>prism<i>.</i></b></a>
  <div class="seg" role="tablist" aria-label="Surface">${TOK.galleries.surfaces.map((s, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-rf-surface="${s.id}">${ic(s.id, 's16')}${s.label}</button>`).join('')}</div>
  <label class="search">${ic('search', 's16')}<span>Search 2,668 facets</span><kbd>${ic('command', 's14')}K</kbd></label>
  <span class="sp"></span>
  <span class="chip"><i></i>OFFLINE</span>
  <button class="ds" type="button">${ic('palette', 's16')}Prism${ic('chevron-down', 's14')}</button>
  <button class="ib" id="mode" type="button" aria-label="Switch to Day">${ic('sun', 's18')}</button>
  <a class="ib" href="#" aria-label="Prism on GitHub">${ic('github', 's18')}</a>
</header>
<nav class="rail" data-fl="surface" aria-label="Galleries">
  <p class="rh">LIBRARY</p>
  ${app.map((g, i) => link(g, i)).join('\n  ')}
  <p class="rh"><span>GALLERIES · ${navMain.length}</span></p>
  ${navMain.map((g, i) => link(g, i, i === 0)).join('\n  ')}
  <p class="rh">BY PLATFORM</p>
  ${navPlat.map((g, i) => link(g, i)).join('\n  ')}
</nav>
<main class="stage" data-rf-gallery="charts">
  <header class="ph" data-fl="text">
    <p class="eyebrow">01 / GALLERIES<span>·</span>CHARTS &amp; METRICS<span>·</span>209 FACETS<span>·</span>λ 436</p>
    <h1>Charts &amp; Metrics</h1>
    <p>KPIs, gauges, progress, trends, comparisons and status — hand-authored inline SVG and CSS. Every one of them offline, themeable, and yours to copy.</p>
    <div class="ruler"></div>
    <div class="filters">${[['All', 209], ['KPI &amp; stats', 48], ['Gauges', 31], ['Trends', 44], ['Comparisons', 39], ['Status', 47]].map(([f, n], i) => `<button type="button" aria-pressed="${i === 0}">${f}<b>${n}</b></button>`).join('')}</div>
  </header>
  <section class="grid">${tiles.map(tile).join('')}</section>
</main>
<div class="qa" id="qa"><b>FIRST LIGHT</b><button data-m="full">REPLAY</button><button data-m="echo">ECHO</button><button data-m="fade">FADE</button><button data-m="relight">RELIGHT</button></div>
<script src="first-light.js"></script>
<script>
(function(){
  var q=new URLSearchParams(location.search), r=document.documentElement, btn=document.getElementById('mode');
  if(q.get('ui')==='0') document.getElementById('qa').remove();
  function setMode(day){ r.setAttribute('data-theme',day?'prism-light':'prism-dark'); r.setAttribute('data-rf-mode',day?'day':'night');
    btn.setAttribute('aria-label',day?'Switch to Night':'Switch to Day'); btn.innerHTML='<svg class="icon s18" aria-hidden="true"><use href="#i-'+(day?'moon':'sun')+'"/></svg>'; }
  setMode(r.getAttribute('data-rf-mode')==='day');
  btn.addEventListener('click',function(){ PrismFirstLight.relight(function(){ setMode(r.getAttribute('data-rf-mode')!=='day'); }, btn); });
  var t=q.get('t'), opts={ mode:q.get('mode')||'auto', mark:'[data-fl="mark"]', onDone:function(i){ document.title='Prism · First Light — '+i.mode+' '+i.ms+'ms'+(i.skipped?' (skipped)':''); } };
  if(t!==null) opts.freezeAt=+t;
  window.__fl=PrismFirstLight.play(opts);
  var qa=document.getElementById('qa');
  qa&&qa.addEventListener('click',function(e){ var m=e.target.closest('button'); if(!m) return; m=m.dataset.m;
    if(m==='relight'){ btn.click(); return; }
    setTimeout(function(){ PrismFirstLight.play({mode:m}); }, 30); });
})();
</script>
</body>
</html>
`;
writeFileSync(join(FL, 'first-light.html'), html);
console.log('first-light.html written', (html.length / 1024).toFixed(0) + 'KB');
