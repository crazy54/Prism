/* Generator for charts.json — authored with template literals to avoid
   hand-escaping JSON. Produces catalog/additions/charts.json then can be deleted.
   Run: node catalog/additions/_build_charts.mjs */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'charts.json');

const css = `
/* ===== NFC — New Charts & Metrics (self-contained, token-driven) ===== */
@keyframes nfc-grow{from{width:0 !important}}
@keyframes nfc-riseY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes nfc-dash{to{stroke-dashoffset:0}}
@keyframes nfc-dashto{to{stroke-dashoffset:var(--off)}}
@keyframes nfc-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes nfc-pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes nfc-bloom{from{transform:scale(0)}to{transform:scale(1)}}
.nfc-cap{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.nfc-num{font-variant-numeric:tabular-nums}

/* --- multi-gauge cluster (concentric arcs) --- */
.nfc-multigauge{position:relative;width:150px;height:150px}
.nfc-multigauge svg{transform:rotate(-90deg)}
.nfc-multigauge .arc{fill:none;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.4s cubic-bezier(.22,1,.36,1) forwards}
.nfc-multigauge .trk{fill:none;stroke:var(--panel2)}
.nfc-multigauge .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
.nfc-multigauge .ctr b{font-size:26px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}

/* --- candlestick / OHLC --- */
.nfc-candles .wick{stroke:var(--muted);stroke-width:1.4}
.nfc-candles .body{animation:nfc-riseY .7s cubic-bezier(.22,1,.36,1) backwards;transform-box:fill-box;transform-origin:center}
.nfc-candles .up{fill:var(--pos);stroke:var(--pos)}
.nfc-candles .dn{fill:var(--neg);stroke:var(--neg)}
.nfc-candles .ma{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.6s ease-out forwards}

/* --- funnel (stacked trapezoids) --- */
.nfc-funnel{display:flex;flex-direction:column;gap:4px;width:230px;align-items:center}
.nfc-funnel .fr{position:relative;height:28px;display:flex;align-items:center;justify-content:center;color:#08131f;font-weight:800;font-size:12px;border-radius:3px;animation:nfc-fade .6s ease-out backwards;font-variant-numeric:tabular-nums}
.nfc-funnel .fr small{position:absolute;right:8px;color:rgba(0,0,0,.55);font-size:10px}

/* --- sankey-ish flow --- */
.nfc-sankey .lk{fill:none;stroke-linecap:butt;opacity:.5;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.5s ease-out forwards}
.nfc-sankey .nd{animation:nfc-fade .6s ease-out backwards}
.nfc-sankey text{fill:var(--ink);font-size:9px;font-weight:700}

/* --- calendar heatmap year strip --- */
.nfc-calheat{width:100%}
.nfc-calheat .grid{display:grid;grid-template-columns:repeat(26,1fr);grid-auto-rows:1fr;gap:2px}
.nfc-calheat .grid i{aspect-ratio:1;border-radius:2px;background:var(--pos);animation:nfc-pop .5s ease-out backwards}
.nfc-calheat .mo{display:flex;justify-content:space-between;font-size:8px;color:var(--dim);margin-bottom:5px;letter-spacing:.03em}

/* --- sparkbar cluster --- */
.nfc-sparkbars{display:flex;gap:12px}
.nfc-sparkbars .col{display:flex;flex-direction:column;align-items:flex-start;gap:5px}
.nfc-sparkbars .bars{display:flex;align-items:flex-end;gap:2px;height:44px}
.nfc-sparkbars .bars i{width:5px;border-radius:2px;background:linear-gradient(180deg,var(--accent),rgba(var(--accent-rgb),.35));animation:nfc-riseY .7s cubic-bezier(.22,1,.36,1) backwards;transform-origin:bottom}
.nfc-sparkbars .col.pos .bars i{background:linear-gradient(180deg,var(--pos),rgba(var(--pos-rgb),.35))}
.nfc-sparkbars .col.info .bars i{background:linear-gradient(180deg,var(--info),rgba(var(--info-rgb),.35))}
.nfc-sparkbars .v{font-size:17px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}

/* --- semicircle gauge cluster --- */
.nfc-gaugeclus{display:flex;gap:16px}
.nfc-gaugeclus .g{display:flex;flex-direction:column;align-items:center;gap:3px}
.nfc-gaugeclus svg .trk{fill:none;stroke:var(--panel2);stroke-linecap:round}
.nfc-gaugeclus svg .val{fill:none;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.3s cubic-bezier(.22,1,.36,1) forwards}
.nfc-gaugeclus .g b{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:-14px}

/* --- delta chip stack --- */
.nfc-deltachips{display:flex;flex-direction:column;gap:7px;width:210px}
.nfc-deltachips .chip{display:flex;align-items:center;justify-content:space-between;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:8px 11px;animation:nfc-fade .5s ease-out backwards}
.nfc-deltachips .chip .k{font-size:11.5px;color:var(--muted)}
.nfc-deltachips .chip .r{display:flex;align-items:center;gap:8px}
.nfc-deltachips .chip .val{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.nfc-deltachips .d{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;padding:2px 7px;border-radius:20px}
.nfc-deltachips .d.up{color:var(--pos);background:rgba(var(--pos-rgb),.14)}
.nfc-deltachips .d.dn{color:var(--neg);background:rgba(var(--neg-rgb),.14)}
.nfc-deltachips .d.fl{color:var(--muted);background:rgba(255,255,255,.06)}

/* --- cohort retention grid --- */
.nfc-cohort{font-size:9px;font-variant-numeric:tabular-nums}
.nfc-cohort table{border-collapse:separate;border-spacing:3px}
.nfc-cohort td{width:26px;height:20px;text-align:center;border-radius:3px;color:#08131f;font-weight:700;animation:nfc-pop .5s ease-out backwards}
.nfc-cohort td.lbl{background:none;color:var(--muted);font-weight:600;text-align:right;width:auto;padding-right:2px}
.nfc-cohort td.hd{background:none;color:var(--dim);font-weight:700}
.nfc-cohort td.empty{background:none}

/* --- percentile band chart --- */
.nfc-pctband .band99{fill:rgba(var(--info-rgb),.12)}
.nfc-pctband .band90{fill:rgba(var(--info-rgb),.22)}
.nfc-pctband .p50{fill:none;stroke:var(--info);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.5s ease-out forwards}
.nfc-pctband .slo{fill:none;stroke:var(--neg);stroke-width:1.2;stroke-dasharray:4 4;opacity:.8}

/* --- streamgraph --- */
.nfc-stream path{animation:nfc-fade .9s ease-out backwards}

/* --- bump / rank chart --- */
.nfc-bump path{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.5s ease-out forwards}
.nfc-bump circle{animation:nfc-pop .5s ease-out backwards}
.nfc-bump text{fill:var(--muted);font-size:8px;font-weight:700}

/* --- radar / spider --- */
.nfc-radar .web{fill:none;stroke:var(--line);stroke-width:1}
.nfc-radar .axis{stroke:var(--line);stroke-width:1}
.nfc-radar .area{fill:rgba(var(--accent-rgb),.16);stroke:var(--accent);stroke-width:2;transform-box:view-box;transform-origin:center;animation:nfc-bloom 1s cubic-bezier(.22,1,.36,1) backwards}
.nfc-radar .area2{fill:rgba(var(--info-rgb),.14);stroke:var(--info);stroke-width:1.6;transform-box:view-box;transform-origin:center;animation:nfc-bloom 1.1s cubic-bezier(.22,1,.36,1) backwards}
.nfc-radar text{fill:var(--muted);font-size:8px;font-weight:700}

/* --- treemap --- */
.nfc-treemap{display:grid;gap:3px;width:250px;height:150px;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(4,1fr)}
.nfc-treemap .t{border-radius:5px;padding:6px 8px;color:#08131f;font-weight:800;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;animation:nfc-pop .55s ease-out backwards}
.nfc-treemap .t span{font-size:9px;opacity:.7;font-weight:700}
.nfc-treemap .t b{font-size:14px;line-height:1;font-variant-numeric:tabular-nums}

/* --- vertical bullet columns --- */
.nfc-bulletv{display:flex;gap:16px;align-items:flex-end}
.nfc-bulletv .col{display:flex;flex-direction:column;align-items:center;gap:6px}
.nfc-bulletv .track{position:relative;width:30px;height:120px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;overflow:hidden;display:flex;flex-direction:column-reverse}
.nfc-bulletv .qual{width:100%}
.nfc-bulletv .meas{position:absolute;left:9px;right:9px;bottom:0;border-radius:3px 3px 0 0;background:var(--ink);animation:nfc-riseY 1s cubic-bezier(.22,1,.36,1);transform-origin:bottom}
.nfc-bulletv .tgt{position:absolute;left:2px;right:2px;height:3px;background:var(--accent);border-radius:2px;box-shadow:0 0 6px var(--accent)}
.nfc-bulletv .lb{font-size:10px;color:var(--muted)}

/* --- ticker tape --- */
.nfc-ticker{width:100%;overflow:hidden;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:8px 0;-webkit-mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.nfc-ticker .track{display:inline-flex;gap:26px;white-space:nowrap;animation:nfc-tickmove 16s linear infinite;font-family:ui-monospace,Menlo,monospace;font-size:12px;font-variant-numeric:tabular-nums}
.nfc-ticker .q{display:inline-flex;align-items:center;gap:6px}
.nfc-ticker .q b{color:var(--ink)}
.nfc-ticker .q .up{color:var(--pos)} .nfc-ticker .q .dn{color:var(--neg)}
@keyframes nfc-tickmove{to{transform:translateX(-50%)}}

/* --- donut gauge with needle --- */
.nfc-donutneedle{position:relative;width:150px;height:150px}
.nfc-donutneedle svg .trk{fill:none;stroke:var(--panel2)}
.nfc-donutneedle svg .zone{fill:none;stroke-linecap:butt;opacity:.9}
.nfc-donutneedle .nd{transform-box:view-box;transform-origin:center;animation:nfc-needle 1.4s cubic-bezier(.34,1.56,.64,1) forwards}
.nfc-donutneedle .hub{fill:var(--ink)}
.nfc-donutneedle .ctr{position:absolute;left:0;right:0;bottom:26px;text-align:center}
.nfc-donutneedle .ctr b{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
@keyframes nfc-needle{from{transform:rotate(-90deg)}}

/* --- waterfall bridge --- */
.nfc-waterfall rect{animation:nfc-riseY .6s ease-out backwards;transform-box:fill-box;transform-origin:center}
.nfc-waterfall .con{stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3}
.nfc-waterfall .up{fill:var(--pos)} .nfc-waterfall .dn{fill:var(--neg)} .nfc-waterfall .tot{fill:var(--info)}
.nfc-waterfall text{fill:var(--muted);font-size:8px;font-weight:700}

/* --- correlation matrix --- */
.nfc-corr{font-size:9px}
.nfc-corr table{border-collapse:separate;border-spacing:2px}
.nfc-corr td{width:24px;height:22px;text-align:center;border-radius:3px;font-weight:700;color:#eaf1f9;font-variant-numeric:tabular-nums;animation:nfc-pop .5s ease-out backwards}
.nfc-corr td.h{background:none;color:var(--dim);font-weight:700}

/* --- box & whisker --- */
.nfc-box .whk{stroke:var(--muted);stroke-width:1.4}
.nfc-box .bx{fill:rgba(var(--info-rgb),.28);stroke:var(--info);stroke-width:1.6;animation:nfc-riseY .7s ease-out backwards;transform-box:fill-box;transform-origin:center}
.nfc-box .med{stroke:var(--accent);stroke-width:2.4}
.nfc-box .out{fill:var(--neg)}
.nfc-box text{fill:var(--muted);font-size:8px;font-weight:700}

/* --- 270 arc gauge --- */
.nfc-arc270{position:relative;width:150px;height:130px}
.nfc-arc270 svg .trk{fill:none;stroke:var(--panel2);stroke-linecap:round}
.nfc-arc270 svg .val{fill:none;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.5s cubic-bezier(.22,1,.36,1) forwards}
.nfc-arc270 .tick{stroke:var(--dim);stroke-width:1.4}
.nfc-arc270 .ctr{position:absolute;left:0;right:0;top:52px;text-align:center}
.nfc-arc270 .ctr b{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}

/* --- dumbbell comparison --- */
.nfc-dumbbell{width:240px;display:flex;flex-direction:column;gap:12px}
.nfc-dumbbell .row .k{font-size:10.5px;color:var(--muted);margin-bottom:4px;display:flex;justify-content:space-between}
.nfc-dumbbell .bar{position:relative;height:10px}
.nfc-dumbbell .bar .line{position:absolute;top:4px;height:2px;background:var(--line);animation:nfc-grow 1s ease-out}
.nfc-dumbbell .bar .d{position:absolute;top:0;width:10px;height:10px;border-radius:50%;transform:translateX(-50%);animation:nfc-pop .5s ease-out .5s backwards}
.nfc-dumbbell .bar .a{background:var(--info)} .nfc-dumbbell .bar .b{background:var(--accent)}

/* --- ridgeline joy plot --- */
.nfc-ridge path{animation:nfc-fade .8s ease-out backwards}
.nfc-ridge .base{stroke:var(--line);stroke-width:.6}

/* --- concentric progress rings --- */
.nfc-ringstack{position:relative;width:140px;height:140px}
.nfc-ringstack svg{transform:rotate(-90deg)}
.nfc-ringstack .trk{fill:none;stroke:var(--panel2)}
.nfc-ringstack .val{fill:none;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.4s cubic-bezier(.22,1,.36,1) forwards}
.nfc-ringstack .lg{margin-top:10px}

/* --- mini gantt --- */
.nfc-gantt{width:250px;display:flex;flex-direction:column;gap:6px;font-size:10px}
.nfc-gantt .row{display:flex;align-items:center;gap:8px}
.nfc-gantt .row .k{width:52px;color:var(--muted);text-align:right;flex:none}
.nfc-gantt .lane{position:relative;flex:1;height:14px;background:var(--panel2);border-radius:4px;border:1px solid var(--line)}
.nfc-gantt .lane i{position:absolute;top:1px;bottom:1px;border-radius:3px;background:linear-gradient(90deg,var(--accent),#ffd277);animation:nfc-grow 1s cubic-bezier(.22,1,.36,1)}
.nfc-gantt .lane i.info{background:linear-gradient(90deg,var(--info),#89bbfb)}
.nfc-gantt .lane i.pos{background:linear-gradient(90deg,var(--pos),#86efac)}
.nfc-gantt .lane i.done{opacity:.55}

/* --- sparkline area --- */
.nfc-sparkarea{width:100%}
.nfc-sparkarea .fill{animation:nfc-fade .9s ease-out}
.nfc-sparkarea .ln{fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.5s ease-out forwards}
.nfc-sparkarea .hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.nfc-sparkarea .hd b{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}

/* --- polar area / rose --- */
.nfc-polar path{transform-box:view-box;transform-origin:center;animation:nfc-bloom 1s cubic-bezier(.22,1,.36,1) backwards}
.nfc-polar .ring{fill:none;stroke:var(--line);stroke-width:.6}

/* --- marimekko / mosaic --- */
.nfc-mekko{display:flex;gap:3px;width:250px;height:130px}
.nfc-mekko .col{display:flex;flex-direction:column;gap:3px}
.nfc-mekko .col>i{border-radius:3px;animation:nfc-riseY .7s ease-out backwards;transform-origin:top;position:relative}
.nfc-mekko .lb{font-size:8px;color:var(--dim);text-align:center;margin-top:4px}

/* --- lollipop --- */
.nfc-lollipop{width:240px;display:flex;flex-direction:column;gap:11px}
.nfc-lollipop .row{display:flex;align-items:center;gap:8px;font-size:10.5px}
.nfc-lollipop .row .k{width:44px;color:var(--muted);flex:none;text-align:right}
.nfc-lollipop .stem{position:relative;flex:1;height:12px;display:flex;align-items:center}
.nfc-lollipop .stem .st{height:2px;background:var(--line);border-radius:2px;animation:nfc-grow .9s ease-out}
.nfc-lollipop .stem .pop{width:12px;height:12px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px rgba(var(--accent-rgb),.5);flex:none;animation:nfc-pop .5s ease-out .4s backwards}
.nfc-lollipop .v{font-size:10.5px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}

/* --- win / loss bars --- */
.nfc-winloss{width:100%}
.nfc-winloss .row{display:flex;align-items:center;gap:2px;height:40px}
.nfc-winloss .row i{flex:1;height:14px;border-radius:2px;animation:nfc-pop .4s ease-out backwards}
.nfc-winloss .row i.w{background:var(--pos);align-self:flex-start}
.nfc-winloss .row i.l{background:var(--neg);align-self:flex-end}
.nfc-winloss .row i.t{background:var(--dim);align-self:center;height:8px}
.nfc-winloss .mid{height:1px;background:var(--line);margin:2px 0}

/* --- density dot strip --- */
.nfc-density{width:250px}
.nfc-density .strip{position:relative;height:56px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.nfc-density .strip i{position:absolute;width:7px;height:7px;border-radius:50%;background:rgba(var(--info-rgb),.7);transform:translate(-50%,-50%);animation:nfc-pop .5s ease-out backwards}
.nfc-density .strip .mean{position:absolute;top:0;bottom:0;width:2px;background:var(--accent)}
.nfc-density .sc{display:flex;justify-content:space-between;font-size:8px;color:var(--dim);margin-top:5px}

/* --- KPI + inline trend --- */
.nfc-kpitrend{width:220px;background:var(--card);background-image:var(--cardgrad);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.nfc-kpitrend .top{display:flex;justify-content:space-between;align-items:flex-start}
.nfc-kpitrend .n{font-size:34px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.nfc-kpitrend .d{font-size:12px;font-weight:800;color:var(--pos)}
.nfc-kpitrend svg{margin-top:10px;display:block}
.nfc-kpitrend .fill{animation:nfc-fade 1s ease-out}
.nfc-kpitrend .ln{fill:none;stroke:var(--pos);stroke-width:2;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.4s ease-out forwards}

/* --- linear gauge w/ threshold ticks --- */
.nfc-gaugebar{width:240px}
.nfc-gaugebar .hd{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:7px}
.nfc-gaugebar .hd b{color:var(--ink);font-variant-numeric:tabular-nums}
.nfc-gaugebar .track{position:relative;height:14px;border-radius:8px;background:linear-gradient(90deg,var(--pos),var(--warn) 62%,var(--neg));overflow:visible}
.nfc-gaugebar .track .mk{position:absolute;top:-5px;width:4px;height:24px;background:var(--ink);border-radius:2px;box-shadow:0 0 0 2px rgba(0,0,0,.5)}
.nfc-gaugebar .track .fillw{position:absolute;left:0;top:0;bottom:0;border-radius:8px 0 0 8px;background:rgba(0,0,0,.28);animation:nfc-grow 1.2s cubic-bezier(.22,1,.36,1)}
.nfc-gaugebar .tk{position:absolute;top:16px;width:1px;height:5px;background:var(--dim)}
.nfc-gaugebar .sc{position:relative;height:16px;font-size:8px;color:var(--dim)}
.nfc-gaugebar .sc span{position:absolute;transform:translateX(-50%)}

/* --- radial stacked bars --- */
.nfc-radialbars svg{transform:rotate(-90deg)}
.nfc-radialbars .seg{fill:none;stroke-linecap:butt;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.4s ease-out forwards}
.nfc-radialbars .trk{fill:none;stroke:var(--panel2)}

/* --- flow-rate meter --- */
.nfc-flowmeter{width:240px}
.nfc-flowmeter .pipe{position:relative;height:26px;border-radius:13px;background:var(--panel2);border:1px solid var(--line);overflow:hidden}
.nfc-flowmeter .fill{position:absolute;left:0;top:0;bottom:0;width:70%;border-radius:13px;background:repeating-linear-gradient(115deg,rgba(var(--info-rgb),.85) 0 12px,rgba(var(--info-rgb),.5) 12px 24px);background-size:34px 100%;animation:nfc-flow 1s linear infinite}
.nfc-flowmeter .cap{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--muted)}
.nfc-flowmeter .cap b{color:var(--info);font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
@keyframes nfc-flow{to{background-position:34px 0}}

/* --- diverging back-to-back bars --- */
.nfc-diverge{width:250px;display:flex;flex-direction:column;gap:8px;font-size:10px}
.nfc-diverge .row{display:flex;align-items:center;gap:6px}
.nfc-diverge .k{width:40px;color:var(--muted);flex:none;text-align:right}
.nfc-diverge .lh,.nfc-diverge .rh{flex:1;display:flex;height:15px}
.nfc-diverge .lh{justify-content:flex-end}
.nfc-diverge .lh i{background:var(--neg);border-radius:3px 0 0 3px;animation:nfc-grow .9s cubic-bezier(.22,1,.36,1)}
.nfc-diverge .rh i{background:var(--pos);border-radius:0 3px 3px 0;animation:nfc-grow .9s cubic-bezier(.22,1,.36,1)}
.nfc-diverge .ax{width:1px;background:var(--line);align-self:stretch}

@media(prefers-reduced-motion:reduce){
  [class*="nfc-"],[class*="nfc-"] *{animation:none !important}
  [class*="nfc-"] .p50,[class*="nfc-"] .ln,[class*="nfc-"] .ma,[class*="nfc-"] .lk{stroke-dashoffset:0 !important}
  [class*="nfc-"] .arc,[class*="nfc-"] .val,[class*="nfc-"] .seg{stroke-dashoffset:var(--off) !important}
}`;

// ---- helpers ----
const P = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const f = (n) => Math.round(n * 100) / 100;
const arcPath = (cx, cy, r, startDeg, sweepDeg) => {
  const [x1, y1] = P(cx, cy, r, startDeg);
  const [x2, y2] = P(cx, cy, r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M${f(x1)} ${f(y1)} A${r} ${r} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
};

const tiles = [];
const tile = (id, name, ref, desc, snip, stage) =>
  tiles.push(
    `<div class="tile is-new" data-fx-id="charts-${id}"><div class="stage">${stage}</div>` +
    `<div class="meta"><div class="nm">${name}</div><span class="ref">${ref}</span>` +
    `<div class="desc">${desc}</div><div class="row">` +
    `<button class="copy" data-snip='${snip}'>Copy snippet</button></div></div></div>`
  );

// 1) multi-gauge cluster
{
  const rings = [
    { r: 62, w: 10, c: "var(--accent)", p: 0.78 },
    { r: 48, w: 10, c: "var(--info)", p: 0.62 },
    { r: 34, w: 10, c: "var(--pos)", p: 0.9 },
  ];
  let s = `<svg width="150" height="150" viewBox="0 0 150 150">`;
  rings.forEach((k) => {
    s += `<circle class="trk" cx="75" cy="75" r="${k.r}" stroke-width="${k.w}"/>`;
    s += `<circle class="arc" cx="75" cy="75" r="${k.r}" stroke="${k.c}" stroke-width="${k.w}" pathLength="100" style="--len:100;--off:${f(100 - k.p * 100)}"/>`;
  });
  s += `</svg>`;
  tile("multigauge", "Radial Multi-Gauge", ".nfc-multigauge",
    "Three concentric progress arcs (CPU / mem / net) sweep to their values on load. Pure inline-SVG, token-colored.",
    'class="nfc-multigauge"',
    `<div class="nfc-multigauge">${s}<div class="ctr"><b>78%</b><span class="nfc-cap">load</span></div></div>`);
}

// 2) candlestick / OHLC
{
  const data = [
    [40, 30, 44, 26, 1], [30, 38, 42, 27, 1], [38, 24, 40, 22, 0], [24, 20, 28, 16, 0],
    [20, 32, 34, 18, 1], [32, 36, 40, 30, 1], [36, 28, 38, 24, 0], [28, 34, 37, 26, 1],
    [34, 30, 36, 27, 0], [30, 42, 46, 29, 1], [42, 39, 44, 36, 0], [39, 48, 52, 37, 1],
  ];
  const W = 250, H = 130, n = data.length, step = W / n, bw = 9;
  const y = (v) => f(H - 8 - (v / 56) * (H - 20));
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  let ma = "";
  data.forEach((d, i) => {
    const cx = f(i * step + step / 2);
    const [o, c, hi, lo, up] = d;
    s += `<line class="wick" x1="${cx}" y1="${y(hi)}" x2="${cx}" y2="${y(lo)}"/>`;
    const top = Math.min(y(o), y(c)), h = Math.max(2, Math.abs(y(o) - y(c)));
    s += `<rect class="body ${up ? "up" : "dn"}" x="${f(cx - bw / 2)}" y="${f(top)}" width="${bw}" height="${f(h)}" rx="1" style="animation-delay:${f(i * 0.05)}s"/>`;
    ma += `${i ? "L" : "M"}${cx} ${y((o + c) / 2)} `;
  });
  s += `<path class="ma" d="${ma}" pathLength="100" style="--len:100"/></svg>`;
  tile("candles", "Candlestick + MA", ".nfc-candles",
    "OHLC candlesticks with green up / red down bodies, high-low wicks, and a dashed moving-average overlay that draws in.",
    'class="nfc-candles"',
    `<div class="nfc-candles">${s}</div>`);
}

// 3) funnel
{
  const rows = [
    ["Visitors", 100, "var(--info)"], ["Signups", 68, "var(--accent)"],
    ["Activated", 41, "var(--warn)"], ["Paid", 23, "var(--pos)"], ["Retained", 12, "var(--crit)"],
  ];
  let s = "";
  rows.forEach((r, i) => {
    const w = f(46 + (r[1] / 100) * 54);
    s += `<div class="fr" style="width:${w}%;background:${r[2]};animation-delay:${f(i * 0.09)}s">${r[0]}<small>${r[1]}%</small></div>`;
  });
  tile("funnel", "Conversion Funnel", ".nfc-funnel",
    "Stacked tapering stages from visitors down to retained, each labeled with its conversion percentage. Bars stagger in.",
    'class="nfc-funnel"',
    `<div class="nfc-funnel">${s}</div>`);
}

// 4) sankey-ish flow
{
  const W = 250, H = 150;
  const src = [["Direct", 12, 60, "var(--info)"], ["Search", 70, 52, "var(--accent)"], ["Social", 122, 40, "var(--crit)"]];
  const dst = [["Convert", 20, 66, "var(--pos)"], ["Browse", 96, 55, "var(--warn)"], ["Bounce", 155, 40, "var(--neg)"]];
  const links = [[0, 0, "var(--info)"], [0, 1, "var(--info)"], [1, 0, "var(--accent)"], [1, 1, "var(--accent)"], [1, 2, "var(--accent)"], [2, 1, "var(--crit)"], [2, 2, "var(--crit)"]];
  const lx = 26, rx = 224;
  const sy = (i) => 22 + i * 46, dy = (i) => 22 + i * 46;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  links.forEach((l, i) => {
    const y1 = sy(l[0]) + 12, y2 = dy(l[1]) + 12;
    s += `<path class="lk" d="M${lx + 10} ${y1} C${W / 2} ${y1}, ${W / 2} ${y2}, ${rx - 10} ${y2}" stroke="${l[2]}" stroke-width="7" pathLength="100" style="--len:100;animation-delay:${f(i * 0.08)}s"/>`;
  });
  src.forEach((v, i) => { s += `<rect class="nd" x="${lx - 8}" y="${sy(i)}" width="8" height="24" rx="2" fill="${v[3]}" style="animation-delay:${f(i * 0.1)}s"/><text x="${lx + 2}" y="${sy(i) - 3}">${v[0]}</text>`; });
  dst.forEach((v, i) => { s += `<rect class="nd" x="${rx}" y="${dy(i)}" width="8" height="24" rx="2" fill="${v[3]}" style="animation-delay:${f(i * 0.1)}s"/><text x="${rx - 4}" y="${dy(i) - 3}" text-anchor="end">${v[0]}</text>`; });
  s += `</svg>`;
  tile("sankey", "Sankey Flow", ".nfc-sankey",
    "Curved weighted ribbons route traffic sources into outcomes. Link thickness reads as volume; strokes draw left-to-right.",
    'class="nfc-sankey"',
    `<div class="nfc-sankey">${s}</div>`);
}

// 5) calendar heatmap year strip
{
  const cells = 26 * 7;
  let g = "";
  for (let i = 0; i < cells; i++) {
    const lv = (Math.sin(i * 0.7) + Math.cos(i * 0.31) + 2) / 4; // 0..1 pseudo
    const op = f(0.12 + lv * 0.85);
    g += `<i style="opacity:${op};animation-delay:${f((i % 26) * 0.02)}s"></i>`;
  }
  tile("calheat", "Calendar Heatmap", ".nfc-calheat",
    "Half-year contribution grid — 7 rows (weekdays) by 26 columns (weeks). Cell opacity encodes daily activity; columns fade in.",
    'class="nfc-calheat"',
    `<div class="nfc-calheat"><div class="mo"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></div><div class="grid">${g}</div></div>`);
}

// 6) sparkbar cluster
{
  const cols = [
    ["Sessions", "8.2k", "", [4, 7, 5, 9, 6, 8, 11, 9, 12, 14]],
    ["Errors", "37", "pos", [9, 7, 8, 6, 5, 6, 4, 3, 4, 2]],
    ["Latency", "112ms", "info", [6, 8, 7, 9, 8, 10, 9, 11, 10, 12]],
  ];
  let s = "";
  cols.forEach((c) => {
    const [label, value, variant, data] = c;
    const mx = Math.max(...data);
    let bars = "";
    data.forEach((v, i) => { bars += `<i style="height:${f((v / mx) * 100)}%;animation-delay:${f(i * 0.04)}s"></i>`; });
    s += `<div class="col ${variant}"><div class="v">${value}</div><div class="bars">${bars}</div><span class="nfc-cap">${label}</span></div>`;
  });
  tile("sparkbars", "Sparkbar Cluster", ".nfc-sparkbars",
    "A row of compact metric columns, each with a big value and its own micro bar-chart trend. Bars rise with a stagger.",
    'class="nfc-sparkbars"',
    `<div class="nfc-sparkbars">${s}</div>`);
}

// 7) semicircle gauge cluster
{
  const gs = [["SLA", 0.94, "var(--pos)"], ["Errors", 0.31, "var(--warn)"], ["Sat", 0.72, "var(--info)"]];
  let s = "";
  const cx = 37, cy = 38, r = 28;
  const d = arcPath(cx, cy, r, 180, 180);
  gs.forEach((g) => {
    s += `<div class="g"><svg width="74" height="46" viewBox="0 0 74 46"><path class="trk" d="${d}" stroke-width="8"/><path class="val" d="${d}" stroke="${g[2]}" stroke-width="8" pathLength="100" style="--len:100;--off:${f(100 - g[1] * 100)}"/></svg><b>${Math.round(g[1] * 100)}</b><span class="nfc-cap">${g[0]}</span></div>`;
  });
  tile("gaugeclus", "Gauge Cluster", ".nfc-gaugeclus",
    "Three half-moon gauges sit side by side for at-a-glance SLA / error / satisfaction. Each arc animates to its reading.",
    'class="nfc-gaugeclus"',
    `<div class="nfc-gaugeclus">${s}</div>`);
}

// 8) delta chips
{
  const rows = [
    ["MRR", "$48.2k", "up", "▲", "6.4%"], ["Churn", "2.1%", "dn", "▼", "0.3%"],
    ["NPS", "62", "up", "▲", "4"], ["CAC", "$310", "fl", "▬", "0.0%"],
  ];
  let s = "";
  rows.forEach((r, i) => {
    s += `<div class="chip" style="animation-delay:${f(i * 0.07)}s"><span class="k">${r[0]}</span><span class="r"><span class="val">${r[1]}</span><span class="d ${r[2]}">${r[3]} ${r[4]}</span></span></div>`;
  });
  tile("deltachips", "Delta Chip Stack", ".nfc-deltachips",
    "Compact metric rows pairing a value with a color-coded up / down / flat delta pill. Ideal for a KPI sidebar.",
    'class="nfc-deltachips"',
    `<div class="nfc-deltachips">${s}</div>`);
}

// 9) cohort retention grid
{
  const weeks = ["W0", "W1", "W2", "W3", "W4", "W5"];
  const cohorts = [
    ["Jan", [100, 62, 48, 40, 35, 31]], ["Feb", [100, 66, 52, 44, 38, null]],
    ["Mar", [100, 58, 45, 38, null, null]], ["Apr", [100, 70, 55, null, null, null]],
    ["May", [100, 64, null, null, null, null]], ["Jun", [100, null, null, null, null, null]],
  ];
  let head = `<tr><td class="hd"></td>`;
  weeks.forEach((w) => (head += `<td class="hd">${w}</td>`));
  head += `</tr>`;
  let body = "";
  cohorts.forEach((c, ci) => {
    body += `<tr><td class="lbl">${c[0]}</td>`;
    c[1].forEach((v, i) => {
      if (v === null) { body += `<td class="empty"></td>`; return; }
      const op = f(0.16 + (v / 100) * 0.84);
      body += `<td style="background:rgba(var(--pos-rgb),${op});animation-delay:${f((ci + i) * 0.04)}s">${v}</td>`;
    });
    body += `</tr>`;
  });
  tile("cohort", "Cohort Retention Grid", ".nfc-cohort",
    "Classic retention triangle — monthly cohorts down, weeks-since-signup across, cell shade encodes % still active.",
    'class="nfc-cohort"',
    `<div class="nfc-cohort"><table>${head}${body}</table></div>`);
}

// 10) percentile band chart
{
  const W = 250, H = 130, n = 12;
  const p50 = [], p90hi = [], p90lo = [], p99hi = [], p99lo = [];
  for (let i = 0; i < n; i++) {
    const b = 60 + 12 * Math.sin(i * 0.6);
    p50.push(b); p90hi.push(b + 14 + 3 * Math.cos(i)); p90lo.push(b - 12);
    p99hi.push(b + 30 + 4 * Math.sin(i * 1.3)); p99lo.push(b - 22);
  }
  const X = (i) => f((i / (n - 1)) * (W - 10) + 5);
  const Y = (v) => f(H - 6 - (v / 120) * (H - 16));
  const area = (hi, lo) => {
    let d = "";
    hi.forEach((v, i) => (d += `${i ? "L" : "M"}${X(i)} ${Y(v)} `));
    for (let i = n - 1; i >= 0; i--) d += `L${X(i)} ${Y(lo[i])} `;
    return d + "Z";
  };
  let line = "";
  p50.forEach((v, i) => (line += `${i ? "L" : "M"}${X(i)} ${Y(v)} `));
  const s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path class="band99" d="${area(p99hi, p99lo)}"/><path class="band90" d="${area(p90hi, p90lo)}"/><line class="slo" x1="5" y1="${Y(96)}" x2="${W - 5}" y2="${Y(96)}"/><path class="p50" d="${line}" pathLength="100" style="--len:100"/></svg>`;
  tile("pctband", "Percentile Bands", ".nfc-pctband",
    "Latency distribution as nested p90 / p99 shaded bands around a drawn p50 line, with a dashed SLO threshold marker.",
    'class="nfc-pctband"',
    `<div class="nfc-pctband">${s}</div>`);
}

// 11) streamgraph
{
  const W = 250, H = 140, n = 12, layers = 4;
  const cols = ["var(--info)", "var(--accent)", "var(--crit)", "var(--pos)"];
  const X = (i) => f((i / (n - 1)) * W);
  const series = [];
  for (let l = 0; l < layers; l++) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(10 + 8 * Math.sin(i * 0.5 + l * 1.4) + 6 + l);
    series.push(arr);
  }
  // stack centered
  const tot = [];
  for (let i = 0; i < n; i++) { let t = 0; series.forEach((s) => (t += s[i])); tot.push(t); }
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  const base = [];
  for (let i = 0; i < n; i++) base.push((H - (tot[i] / Math.max(...tot)) * (H - 20)) / 2 + (tot[i] / Math.max(...tot)) * (H - 20));
  let acc = base.slice();
  const scale = (H - 24) / Math.max(...tot);
  for (let l = 0; l < layers; l++) {
    let top = "", bot = "";
    const lo = acc.slice();
    for (let i = 0; i < n; i++) acc[i] -= series[l][i] * scale;
    for (let i = 0; i < n; i++) top += `${i ? "L" : "M"}${X(i)} ${f(acc[i])} `;
    for (let i = n - 1; i >= 0; i--) bot += `L${X(i)} ${f(lo[i])} `;
    s += `<path d="${top}${bot}Z" fill="${cols[l]}" opacity="0.82" style="animation-delay:${f(l * 0.12)}s"/>`;
  }
  s += `</svg>`;
  tile("stream", "Streamgraph", ".nfc-stream",
    "Four traffic categories stacked as a flowing, center-baseline streamgraph. Layers fade in from the bottom up.",
    'class="nfc-stream"',
    `<div class="nfc-stream">${s}</div>`);
}

// 12) bump / rank chart
{
  const W = 250, H = 130, cols = 6, rows = 5;
  const series = [
    { c: "var(--accent)", r: [1, 1, 2, 2, 1, 1] },
    { c: "var(--info)", r: [2, 3, 1, 1, 2, 3] },
    { c: "var(--pos)", r: [3, 2, 3, 4, 4, 2] },
    { c: "var(--crit)", r: [4, 5, 5, 3, 3, 4] },
    { c: "var(--warn)", r: [5, 4, 4, 5, 5, 5] },
  ];
  const X = (i) => f(20 + (i / (cols - 1)) * (W - 40));
  const Y = (rk) => f(14 + ((rk - 1) / (rows - 1)) * (H - 28));
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  series.forEach((se, si) => {
    let d = "";
    se.r.forEach((rk, i) => (d += `${i ? "L" : "M"}${X(i)} ${Y(rk)} `));
    s += `<path d="${d}" stroke="${se.c}" pathLength="100" style="--len:100;animation-delay:${f(si * 0.1)}s"/>`;
    se.r.forEach((rk, i) => (s += `<circle cx="${X(i)}" cy="${Y(rk)}" r="3.4" fill="${se.c}" style="animation-delay:${f(0.5 + i * 0.05)}s"/>`));
  });
  for (let r = 1; r <= rows; r++) s += `<text x="6" y="${Y(r) + 3}">#${r}</text>`;
  s += `</svg>`;
  tile("bump", "Bump / Rank Chart", ".nfc-bump",
    "Five products swap positions over six periods. Ranked lines draw in and nodes pop, tracing who overtook whom.",
    'class="nfc-bump"',
    `<div class="nfc-bump">${s}</div>`);
}

// 13) radar / spider
{
  const cx = 75, cy = 78, r = 56, axes = 6;
  const labels = ["Speed", "Cost", "Scale", "UX", "Sec", "Docs"];
  const A = (i) => -90 + i * (360 / axes);
  const poly = (vals, r0) => vals.map((v, i) => { const [x, y] = P(cx, cy, r0 * v, A(i)); return `${f(x)},${f(y)}`; }).join(" ");
  let web = "";
  [0.33, 0.66, 1].forEach((s) => {
    const pts = new Array(axes).fill(1).map((_, i) => { const [x, y] = P(cx, cy, r * s, A(i)); return `${f(x)},${f(y)}`; }).join(" ");
    web += `<polygon class="web" points="${pts}"/>`;
  });
  let axL = "";
  for (let i = 0; i < axes; i++) { const [x, y] = P(cx, cy, r, A(i)); axL += `<line class="axis" x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}"/>`; const [lx, ly] = P(cx, cy, r + 11, A(i)); axL += `<text x="${f(lx)}" y="${f(ly + 3)}" text-anchor="middle">${labels[i]}</text>`; }
  const s = `<svg width="150" height="150" viewBox="0 0 150 150">${web}${axL}<polygon class="area2" points="${poly([0.5, 0.7, 0.6, 0.55, 0.8, 0.5], r)}"/><polygon class="area" points="${poly([0.9, 0.5, 0.75, 0.85, 0.6, 0.7], r)}"/></svg>`;
  tile("radar", "Radar / Spider", ".nfc-radar",
    "Two profiles overlaid across six labeled axes — compare a candidate vs. baseline. Polygons bloom out from center.",
    'class="nfc-radar"',
    `<div class="nfc-radar">${s}</div>`);
}

// 14) treemap
{
  const blk = [
    ["S3", "42%", "var(--accent)", "1/4", "1/3"], ["EC2", "24%", "var(--info)", "4/7", "1/2"],
    ["Lambda", "9%", "var(--warn)", "4/6", "2/3"], ["SQS", "5%", "var(--crit)", "6/7", "2/3"],
    ["RDS", "12%", "var(--pos)", "1/3", "3/5"], ["EBS", "10%", "var(--info)", "3/5", "3/5"],
    ["CW", "4%", "var(--warn)", "5/7", "3/4"], ["KMS", "3%", "var(--crit)", "5/7", "4/5"],
  ];
  let s = "";
  blk.forEach((b, i) => {
    s += `<div class="t" style="grid-column:${b[3]};grid-row:${b[4]};background:${b[2]};animation-delay:${f(i * 0.06)}s"><b>${b[1]}</b><span>${b[0]}</span></div>`;
  });
  tile("treemap", "Cost Treemap", ".nfc-treemap",
    "Spend broken down by service as area-proportional tiles. Larger blocks dominate cost; each pops in on load.",
    'class="nfc-treemap"',
    `<div class="nfc-treemap">${s}</div>`);
}

// 15) vertical bullet columns
{
  const cols = [
    ["Q1", 82, 75, "var(--pos)"], ["Q2", 61, 80, "var(--warn)"], ["Q3", 93, 85, "var(--info)"],
  ];
  const bands = [[40, "rgba(255,255,255,.04)"], [30, "rgba(255,255,255,.07)"], [30, "rgba(255,255,255,.11)"]];
  let s = "";
  cols.forEach((c) => {
    let qual = "";
    bands.forEach((b) => (qual += `<span class="qual" style="height:${b[0]}%;background:${b[1]}"></span>`));
    s += `<div class="col"><div class="track">${qual}<i class="meas" style="height:${c[1]}%;background:${c[3]}"></i><i class="tgt" style="bottom:${c[2]}%"></i></div><span class="lb">${c[0]}</span></div>`;
  });
  tile("bulletv", "Vertical Bullet Bars", ".nfc-bulletv",
    "Columnar bullet graphs: a measure fill against qualitative bands with a target tick. Great for quarterly goal tracking.",
    'class="nfc-bulletv"',
    `<div class="nfc-bulletv">${s}</div>`);
}

// 16) ticker tape
{
  const q = [
    ["AWS", "182.4", "up", "+1.2%"], ["MSFT", "418.9", "up", "+0.6%"], ["GOOG", "174.3", "dn", "-0.9%"],
    ["NVDA", "126.7", "up", "+3.4%"], ["META", "563.1", "dn", "-0.4%"], ["TSLA", "241.8", "up", "+2.1%"],
  ];
  const one = q.map((x) => `<span class="q"><b>${x[0]}</b> ${x[1]} <span class="${x[2]}">${x[3]}</span></span>`).join("");
  tile("ticker", "Ticker Tape", ".nfc-ticker",
    "A seamless scrolling marquee of symbols with green / red change flags. Content is duplicated for a gapless CSS loop.",
    'class="nfc-ticker"',
    `<div class="nfc-ticker"><div class="track">${one}${one}</div></div>`);
}

// 17) donut gauge with needle
{
  const cx = 75, cy = 75, r = 56, val = 0.73;
  const zone = (a0, a1, col) => `<path class="zone" d="${arcPath(cx, cy, r, a0, a1 - a0)}" stroke="${col}" stroke-width="13"/>`;
  const ang = 180 + val * 180;
  const [nx, ny] = P(cx, cy, r - 12, ang);
  const s = `<svg width="150" height="150" viewBox="0 0 150 150"><path class="trk" d="${arcPath(cx, cy, r, 180, 180)}" stroke-width="13"/>${zone(180, 240, "var(--pos)")}${zone(240, 300, "var(--warn)")}${zone(300, 360, "var(--neg)")}<line class="nd" x1="${cx}" y1="${cy}" x2="${f(nx)}" y2="${f(ny)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle class="hub" cx="${cx}" cy="${cy}" r="5"/></svg>`;
  tile("donutneedle", "Needle Gauge", ".nfc-donutneedle",
    "Speedometer-style gauge with green / amber / red zones and a needle that swings up to the current value on load.",
    'class="nfc-donutneedle"',
    `<div class="nfc-donutneedle">${s}<div class="ctr"><b>73</b><div class="nfc-cap">health index</div></div></div>`);
}

// 18) waterfall bridge
{
  const W = 250, H = 130;
  const steps = [["Start", 100, "tot"], ["New", 34, "up"], ["Expand", 18, "up"], ["Churn", -22, "dn"], ["Contract", -13, "dn"], ["End", null, "tot"]];
  let cum = 0; const bars = [];
  steps.forEach((st) => {
    if (st[2] === "tot" && st[1] === null) { bars.push({ base: 0, val: cum, cls: "tot", lab: st[0], amt: cum }); }
    else if (st[2] === "tot") { bars.push({ base: 0, val: st[1], cls: "tot", lab: st[0], amt: st[1] }); cum = st[1]; }
    else { const b = st[1] >= 0 ? cum : cum + st[1]; bars.push({ base: b, val: Math.abs(st[1]), cls: st[2], lab: st[0], amt: st[1] }); cum += st[1]; }
  });
  const mx = 130;
  const Y = (v) => f(H - 16 - (v / mx) * (H - 30));
  const bw = W / bars.length - 8;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  bars.forEach((b, i) => {
    const x = f(i * (W / bars.length) + 4);
    const yTop = Y(b.base + b.val), h = f((b.val / mx) * (H - 30));
    s += `<rect class="${b.cls}" x="${x}" y="${yTop}" width="${f(bw)}" height="${Math.max(2, h)}" rx="1" style="animation-delay:${f(i * 0.08)}s"/>`;
    if (i < bars.length - 1) { const yc = Y(b.cls === "dn" ? b.base : b.base + b.val); s += `<line class="con" x1="${f(x + bw)}" y1="${yc}" x2="${f(x + W / bars.length)}" y2="${yc}"/>`; }
    s += `<text x="${f(x + bw / 2)}" y="${H - 4}" text-anchor="middle">${b.lab}</text>`;
  });
  s += `</svg>`;
  tile("waterfall", "Waterfall Bridge", ".nfc-waterfall",
    "Revenue bridge from start to end, with green increases and red decreases connected by dotted step lines. Bars rise in sequence.",
    'class="nfc-waterfall"',
    `<div class="nfc-waterfall">${s}</div>`);
}

// 19) correlation matrix
{
  const labels = ["CPU", "Mem", "Net", "Disk", "Lat"];
  const m = [
    [1, .72, .34, .58, -.21], [.72, 1, .41, .49, -.15], [.34, .41, 1, .22, .63],
    [.58, .49, .22, 1, -.38], [-.21, -.15, .63, -.38, 1],
  ];
  let head = `<tr><td class="h"></td>`;
  labels.forEach((l) => (head += `<td class="h">${l}</td>`));
  head += `</tr>`;
  let body = "";
  m.forEach((row, r) => {
    body += `<tr><td class="h">${labels[r]}</td>`;
    row.forEach((v, c) => {
      const col = v >= 0 ? `var(--info-rgb)` : `var(--neg-rgb)`;
      const op = f(0.12 + Math.abs(v) * 0.8);
      body += `<td style="background:rgba(${col},${op});animation-delay:${f((r + c) * 0.03)}s">${v === 1 ? "1" : v.toFixed(2).replace("0.", ".")}</td>`;
    });
    body += `</tr>`;
  });
  tile("corrmatrix", "Correlation Matrix", ".nfc-corr",
    "Symmetric 5×5 heat matrix — blue for positive, red for negative correlation, intensity by magnitude. Cells cascade in.",
    'class="nfc-corr"',
    `<div class="nfc-corr"><table>${head}${body}</table></div>`);
}

// 20) box & whisker
{
  const W = 250, H = 130;
  const groups = [
    ["API", 18, 34, 46, 58, 78, "var(--info)"], ["DB", 24, 40, 52, 66, 88, "var(--accent)"], ["Cache", 8, 16, 22, 30, 44, "var(--pos)"],
  ];
  const Y = (v) => f(H - 14 - (v / 100) * (H - 26));
  const bw = 40;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  groups.forEach((g, i) => {
    const cx = 50 + i * 75;
    const [nm, mn, q1, md, q3, mx, col] = g;
    s += `<line class="whk" x1="${cx}" y1="${Y(mn)}" x2="${cx}" y2="${Y(mx)}"/>`;
    s += `<line class="whk" x1="${cx - 10}" y1="${Y(mn)}" x2="${cx + 10}" y2="${Y(mn)}"/><line class="whk" x1="${cx - 10}" y1="${Y(mx)}" x2="${cx + 10}" y2="${Y(mx)}"/>`;
    s += `<rect class="bx" x="${cx - bw / 2}" y="${Y(q3)}" width="${bw}" height="${f(Y(q1) - Y(q3))}" rx="2" style="stroke:${col};animation-delay:${f(i * 0.12)}s"/>`;
    s += `<line class="med" x1="${cx - bw / 2}" y1="${Y(md)}" x2="${cx + bw / 2}" y2="${Y(md)}"/>`;
    s += `<circle class="out" cx="${cx}" cy="${Y(mx + 8)}" r="2.4"/>`;
    s += `<text x="${cx}" y="${H - 3}" text-anchor="middle">${nm}</text>`;
  });
  s += `</svg>`;
  tile("boxplot", "Box & Whisker", ".nfc-box",
    "Latency spread per service — quartile boxes, median bar, min/max whiskers and an outlier dot. Boxes grow from their center.",
    'class="nfc-box"',
    `<div class="nfc-box">${s}</div>`);
}

// 21) 270-degree arc gauge
{
  const cx = 75, cy = 70, r = 52, val = 0.68;
  const d = arcPath(cx, cy, r, 135, 270);
  let ticks = "";
  for (let t = 0; t <= 10; t++) { const a = 135 + (t / 10) * 270; const [x1, y1] = P(cx, cy, r + 4, a); const [x2, y2] = P(cx, cy, r + 9, a); ticks += `<line class="tick" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`; }
  const s = `<svg width="150" height="130" viewBox="0 0 150 130"><path class="trk" d="${d}" stroke-width="11"/><path class="val" d="${d}" stroke="var(--accent)" stroke-width="11" pathLength="100" style="--len:100;--off:${f(100 - val * 100)}"/>${ticks}</svg>`;
  tile("arc270", "270° Arc Gauge", ".nfc-arc270",
    "Three-quarter dial with graduated ticks and a bottom gap. The value arc sweeps clockwise to its reading on load.",
    'class="nfc-arc270"',
    `<div class="nfc-arc270">${s}<div class="ctr"><b>68</b><div class="nfc-cap">score</div></div></div>`);
}

// 22) dumbbell comparison
{
  const rows = [["North", 32, 68], ["South", 45, 52], ["East", 28, 81], ["West", 60, 44]];
  let s = "";
  rows.forEach((r, i) => {
    const a = r[1], b = r[2], lo = Math.min(a, b), hi = Math.max(a, b);
    s += `<div class="row"><div class="k"><span>${r[0]}</span><span class="nfc-num" style="color:var(--muted)">${a}% → ${b}%</span></div><div class="bar"><div class="line" style="left:${lo}%;width:${f(hi - lo)}%"></div><div class="d a" style="left:${a}%;animation-delay:${f(0.5 + i * 0.05)}s"></div><div class="d b" style="left:${b}%;animation-delay:${f(0.55 + i * 0.05)}s"></div></div></div>`;
  });
  tile("dumbbell", "Dumbbell Compare", ".nfc-dumbbell",
    "Before vs. after per region — two dots joined by a bar showing the gap and direction of change. Endpoints pop after the line draws.",
    'class="nfc-dumbbell"',
    `<div class="nfc-dumbbell">${s}</div>`);
}

// 23) ridgeline joy plot
{
  const W = 250, H = 140, n = 40, ridges = 4;
  const cols = ["var(--crit)", "var(--info)", "var(--accent)", "var(--pos)"];
  const conf = [[14, 6], [22, 7], [28, 5], [18, 9]];
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for (let j = ridges - 1; j >= 0; j--) {
    const y0 = 34 + j * 26, amp = 46, [ctr, sig] = conf[j];
    let d = `M0 ${y0} `;
    for (let i = 0; i <= n; i++) { const x = f((i / n) * W); const g = Math.exp(-((i - ctr) ** 2) / (2 * sig * sig)); d += `L${x} ${f(y0 - g * amp)} `; }
    d += `L${W} ${y0} Z`;
    s += `<line class="base" x1="0" y1="${y0}" x2="${W}" y2="${y0}"/><path d="${d}" fill="${cols[j]}" fill-opacity="0.5" stroke="${cols[j]}" stroke-width="1.5" style="animation-delay:${f((ridges - j) * 0.12)}s"/>`;
  }
  s += `</svg>`;
  tile("ridgeline", "Ridgeline Plot", ".nfc-ridge",
    "Stacked, overlapping density curves (a joy plot) comparing distributions across four cohorts. Ridges fade up in sequence.",
    'class="nfc-ridge"',
    `<div class="nfc-ridge">${s}</div>`);
}

// 24) concentric progress rings + legend
{
  const rings = [[64, "var(--accent)", 0.86, "Storage"], [50, "var(--info)", 0.64, "Compute"], [36, "var(--pos)", 0.42, "Network"]];
  let sv = `<svg width="140" height="140" viewBox="0 0 140 140">`;
  rings.forEach((k) => {
    sv += `<circle class="trk" cx="70" cy="70" r="${k[0]}" stroke-width="8"/><circle class="val" cx="70" cy="70" r="${k[0]}" stroke="${k[1]}" stroke-width="8" pathLength="100" style="--len:100;--off:${f(100 - k[2] * 100)}"/>`;
  });
  sv += `</svg>`;
  let lg = `<div class="legend nfc-ringlg">`;
  rings.forEach((k) => (lg += `<span><i style="background:${k[1]};width:11px;height:11px;border-radius:3px;display:inline-block"></i> ${k[3]} ${Math.round(k[2] * 100)}%</span>`));
  lg += `</div>`;
  tile("ringstack", "Progress Ring Stack", ".nfc-ringstack",
    "Three quota rings (storage / compute / network) fill to their utilization, paired with a labeled legend below.",
    'class="nfc-ringstack"',
    `<div style="display:flex;flex-direction:column;align-items:center"><div class="nfc-ringstack">${sv}</div>${lg}</div>`);
}

// 25) mini gantt
{
  const rows = [
    ["Design", 0, 28, "info", true], ["Build", 20, 45, "", false], ["Test", 55, 25, "pos", false], ["Ship", 78, 18, "", false],
  ];
  let s = "";
  rows.forEach((r, i) => {
    s += `<div class="row"><span class="k">${r[0]}</span><div class="lane"><i class="${r[1] ? r[3] : r[3]} ${r[4] ? "done" : ""}" style="left:${r[1]}%;width:${r[2]}%;animation-delay:${f(i * 0.1)}s"></i></div></div>`;
  });
  tile("gantt", "Mini Gantt", ".nfc-gantt",
    "A four-phase project schedule with offset, colored task bars on their own lanes. Bars grow to length on load.",
    'class="nfc-gantt"',
    `<div class="nfc-gantt">${s}</div>`);
}

// 26) sparkline area
{
  const W = 220, H = 60, data = [12, 18, 15, 22, 19, 28, 24, 33, 30, 38, 44, 41];
  const mx = Math.max(...data), mn = Math.min(...data);
  const X = (i) => f((i / (data.length - 1)) * W);
  const Y = (v) => f(H - 4 - ((v - mn) / (mx - mn)) * (H - 10));
  let ln = "", ar = `M0 ${H} `;
  data.forEach((v, i) => { ln += `${i ? "L" : "M"}${X(i)} ${Y(v)} `; ar += `L${X(i)} ${Y(v)} `; });
  ar += `L${W} ${H} Z`;
  const s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="nfcSA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path class="fill" d="${ar}" fill="url(#nfcSA)"/><path class="ln" d="${ln}" pathLength="100" style="--len:100"/></svg>`;
  tile("sparkarea", "Sparkline Area", ".nfc-sparkarea",
    "A big headline metric over a gradient-filled sparkline. The stroke draws left-to-right while the fill fades in beneath it.",
    'class="nfc-sparkarea"',
    `<div class="nfc-sparkarea"><div class="hd"><b>1,284</b><span class="delta up" style="color:var(--pos);font-weight:800">▲ 18%</span></div>${s}</div>`);
}

// 27) polar area / rose
{
  const cx = 75, cy = 75, n = 8, maxR = 62;
  const vals = [0.9, 0.6, 0.75, 0.5, 0.85, 0.45, 0.7, 0.55];
  const cols = ["var(--accent)", "var(--info)", "var(--pos)", "var(--warn)", "var(--crit)", "var(--info)", "var(--accent)", "var(--pos)"];
  let rings = "";
  [0.5, 1].forEach((s) => (rings += `<circle class="ring" cx="${cx}" cy="${cy}" r="${maxR * s}"/>`));
  let wedges = "";
  const step = 360 / n;
  vals.forEach((v, i) => {
    const r = maxR * v, a0 = -90 + i * step, a1 = a0 + step;
    const [x0, y0] = P(cx, cy, r, a0), [x1, y1] = P(cx, cy, r, a1);
    wedges += `<path d="M${cx} ${cy} L${f(x0)} ${f(y0)} A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)} Z" fill="${cols[i]}" fill-opacity="0.72" style="animation-delay:${f(i * 0.06)}s"/>`;
  });
  const s = `<svg width="150" height="150" viewBox="0 0 150 150">${rings}${wedges}</svg>`;
  tile("polar", "Polar Area (Rose)", ".nfc-polar",
    "A Nightingale rose — eight wedges of equal angle but radius scaled by value, over faint reference rings. Wedges bloom from center.",
    'class="nfc-polar"',
    `<div class="nfc-polar">${s}</div>`);
}

// 28) marimekko / mosaic
{
  const cols = [
    ["Ent", 3, [[52, "var(--accent)"], [30, "var(--info)"], [18, "var(--pos)"]]],
    ["Mid", 2, [[40, "var(--accent)"], [45, "var(--info)"], [15, "var(--pos)"]]],
    ["SMB", 1.4, [[28, "var(--accent)"], [34, "var(--info)"], [38, "var(--pos)"]]],
    ["Self", 1, [[20, "var(--accent)"], [25, "var(--info)"], [55, "var(--pos)"]]],
  ];
  let s = "";
  cols.forEach((c, ci) => {
    let segs = "";
    c[2].forEach((seg, si) => (segs += `<i style="height:${seg[0]}%;background:${seg[1]};animation-delay:${f((ci + si) * 0.06)}s"></i>`));
    s += `<div class="col" style="flex:${c[1]}"><div style="flex:1;display:flex;flex-direction:column;gap:3px">${segs}</div><span class="lb">${c[0]}</span></div>`;
  });
  tile("mekko", "Marimekko / Mosaic", ".nfc-mekko",
    "A mekko chart — column widths encode segment size, stacked heights encode product mix within each segment. Bars grow from the top.",
    'class="nfc-mekko"',
    `<div class="nfc-mekko">${s}</div>`);
}

// 29) lollipop
{
  const rows = [["us-east", 92], ["eu-west", 74], ["ap-south", 58], ["sa-east", 41], ["af-north", 23]];
  let s = "";
  rows.forEach((r, i) => {
    s += `<div class="row"><span class="k">${r[0]}</span><div class="stem"><span class="st" style="width:${r[1]}%;animation-delay:${f(i * 0.06)}s"></span><span class="pop" style="animation-delay:${f(0.4 + i * 0.06)}s"></span></div><span class="v">${r[1]}</span></div>`;
  });
  tile("lollipop", "Lollipop Chart", ".nfc-lollipop",
    "Ranked regions as stems tipped with glowing dots — a cleaner, lower-ink alternative to bars. Stems extend, then dots pop.",
    'class="nfc-lollipop"',
    `<div class="nfc-lollipop">${s}</div>`);
}

// 30) win / loss
{
  const seq = "wwlwwtwlwwwlwtwwlwwwtwlww".split("");
  let bars = "";
  seq.forEach((c, i) => (bars += `<i class="${c}" style="animation-delay:${f(i * 0.03)}s"></i>`));
  tile("winloss", "Win / Loss Streak", ".nfc-winloss",
    "A binary sparkbar of outcomes — wins rise above the midline, losses drop below, ties sit centered. Reads streaks at a glance.",
    'class="nfc-winloss"',
    `<div class="nfc-winloss"><div class="row">${bars}</div><div class="nfc-cap" style="text-align:center">last 24 deploys · 16W · 6L · 2T</div></div>`);
}

// 31) density dot strip
{
  const pts = [];
  for (let i = 0; i < 36; i++) {
    const base = 58 + 20 * Math.sin(i * 1.3) * Math.cos(i * 0.7);
    const x = Math.max(4, Math.min(96, base + (i % 5) * 2 - 4));
    const y = 20 + ((i * 37) % 60);
    pts.push([f(x), f(y)]);
  }
  let dots = "";
  pts.forEach((p, i) => (dots += `<i style="left:${p[0]}%;top:${p[1]}%;animation-delay:${f(i * 0.02)}s"></i>`));
  tile("density", "Dot Density Strip", ".nfc-density",
    "A jittered one-dimensional strip plot — every request a dot, clustered where values concentrate, with a mean marker.",
    'class="nfc-density"',
    `<div class="nfc-density"><div class="strip">${dots}<span class="mean" style="left:60%"></span></div><div class="sc"><span>0ms</span><span>mean 148ms</span><span>400ms</span></div></div>`);
}

// 32) KPI + inline trend
{
  const W = 188, H = 44, data = [20, 24, 22, 28, 26, 32, 30, 36, 34, 41];
  const mx = Math.max(...data), mn = Math.min(...data);
  const X = (i) => f((i / (data.length - 1)) * W);
  const Y = (v) => f(H - 3 - ((v - mn) / (mx - mn)) * (H - 8));
  let ln = "", ar = `M0 ${H} `;
  data.forEach((v, i) => { ln += `${i ? "L" : "M"}${X(i)} ${Y(v)} `; ar += `L${X(i)} ${Y(v)} `; });
  ar += `L${W} ${H} Z`;
  const s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="nfcKT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pos)" stop-opacity="0.4"/><stop offset="1" stop-color="var(--pos)" stop-opacity="0"/></linearGradient></defs><path class="fill" d="${ar}" fill="url(#nfcKT)"/><path class="ln" d="${ln}" pathLength="100" style="--len:100"/></svg>`;
  tile("kpitrend", "KPI + Trend Card", ".nfc-kpitrend",
    "A metric card that pairs a headline number and delta with an embedded gradient trend line. Drop-in dashboard summary tile.",
    'class="nfc-kpitrend"',
    `<div class="nfc-kpitrend"><div class="top"><div><div class="nfc-cap">Active users</div><div class="n">12.4k</div></div><div class="d">▲ 9.6%</div></div>${s}</div>`);
}

// 33) linear gauge w/ threshold ticks
{
  const val = 72, thresholds = [30, 60, 85];
  let tks = "", sc = "";
  thresholds.forEach((t) => (tks += `<span class="tk" style="left:${t}%"></span>`));
  [0, 25, 50, 75, 100].forEach((t) => (sc += `<span style="left:${t}%">${t}</span>`));
  tile("gaugebar", "Linear Threshold Gauge", ".nfc-gaugebar",
    "A horizontal gradient meter (green→amber→red) with threshold ticks, a value marker, and a numeric scale below.",
    'class="nfc-gaugebar"',
    `<div class="nfc-gaugebar"><div class="hd"><span>Disk usage</span><b>${val}%</b></div><div class="track"><div class="fillw" style="width:${val}%"></div>${tks}<div class="mk" style="left:${val}%"></div></div><div class="sc">${sc}</div></div>`);
}

// 34) radial column chart
{
  const cx = 75, cy = 75, n = 12, r0 = 16, maxLen = 50;
  const vals = [0.9, 0.7, 0.55, 0.8, 0.4, 0.65, 1, 0.5, 0.75, 0.6, 0.85, 0.45];
  const cols = ["var(--accent)", "var(--info)", "var(--pos)", "var(--crit)"];
  let bars = "";
  vals.forEach((v, i) => {
    const len = f(maxLen * v), deg = i * (360 / n);
    bars += `<rect x="${cx - 4}" y="${f(cy - r0 - len)}" width="8" height="${len}" rx="2" fill="${cols[i % 4]}" transform="rotate(${deg} ${cx} ${cy})" style="animation:nfc-fade .6s ease-out backwards;animation-delay:${f(i * 0.05)}s"/>`;
  });
  const s = `<svg width="150" height="150" viewBox="0 0 150 150"><circle cx="${cx}" cy="${cy}" r="${r0 - 3}" fill="none" stroke="var(--line)" stroke-width="1"/>${bars}</svg>`;
  tile("radialbars", "Radial Column Chart", ".nfc-radialbars",
    "Twelve columns radiate from a central hub, length scaled by value — a circular bar chart for cyclical / hourly data. Columns fade in.",
    'class="nfc-radialbars"',
    `<div class="nfc-radialbars">${s}</div>`);
}

// 35) flow-rate meter
{
  tile("flowmeter", "Flow-Rate Meter", ".nfc-flowmeter",
    "A pipe fills to the current throughput with animated diagonal stripes conveying live flow. Reads as a real-time rate gauge.",
    'class="nfc-flowmeter"',
    `<div class="nfc-flowmeter"><div class="pipe"><div class="fill" style="width:70%"></div></div><div class="cap"><span>Ingest throughput</span><b>7.0 GB/s</b></div></div>`);
}

// 36) diverging bars
{
  const rows = [["Docs", 62, 12], ["UX", 48, 26], ["Perf", 30, 40], ["Price", 18, 55], ["Support", 71, 8]];
  let s = "";
  rows.forEach((r, i) => {
    s += `<div class="row"><span class="k">${r[0]}</span><div class="lh"><i style="width:${r[2]}%;animation-delay:${f(i * 0.06)}s"></i></div><div class="ax"></div><div class="rh"><i style="width:${r[1]}%;animation-delay:${f(i * 0.06)}s"></i></div></div>`;
  });
  tile("diverge", "Diverging Sentiment", ".nfc-diverge",
    "Back-to-back bars around a center axis — positive sentiment right (green), negative left (red) — per topic. Bars grow outward.",
    'class="nfc-diverge"',
    `<div class="nfc-diverge">${s}</div>`);
}

// ---- write ----
const out = {
  gallery: "charts",
  sectionLabel: "✦ New — Charts & Metrics",
  containerClass: "gallery",
  css,
  tiles,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
const names = tiles.map((t) => (t.match(/<div class="nm">(.*?)<\/div>/) || [])[1]);
console.log("Wrote " + tiles.length + " tiles:");
names.forEach((n, i) => console.log("  " + (i + 1) + ". " + n));
