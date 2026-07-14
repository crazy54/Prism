/* Temporary generator for charts.html draft — 34 new Charts & Metrics tiles.
   Run: node _gen_charts_new.mjs   (writes ./charts.html, then delete this script) */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'charts.html');

const f = (n) => Math.round(n * 100) / 100;
const P = (cx, cy, r, deg) => { const a = (deg * Math.PI) / 180; return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))]; };
const arcPath = (cx, cy, r, startDeg, sweepDeg) => {
  const [x1, y1] = P(cx, cy, r, startDeg);
  const [x2, y2] = P(cx, cy, r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
};

const tiles = [];
const tile = (c, stage, name, ref, desc) => tiles.push(
`<div class="tile is-new" data-c="${c}"><div class="stage">
  ${stage}
</div><div class="meta"><div class="nm">${name}</div><span class="ref">${ref}</span><div class="desc">${desc}</div><button class="copy" onclick="copyViz(this)">Copy</button></div></div>`);

/* 1. NPS Gauge */
{
  const d = arcPath(75, 80, 58, 180, 180);
  const val = 42; // -100..100 -> 0..100 pct
  const pct = f((val + 100) / 2);
  const stage = `<div class="nfc-nps"><svg width="150" height="100" viewBox="0 0 150 100">
    <path class="seg det" d="${arcPath(75,80,58,180,60)}" stroke-width="12"/>
    <path class="seg pas" d="${arcPath(75,80,58,240,60)}" stroke-width="12"/>
    <path class="seg pro" d="${arcPath(75,80,58,300,60)}" stroke-width="12"/>
    <line class="ndl" x1="75" y1="80" x2="75" y2="30" style="--rot:${f(pct*1.8)}deg"/>
    <circle class="hub" cx="75" cy="80" r="4"/>
  </svg><b>+${val}</b><span class="nfc-cap2">Net Promoter Score</span></div>`;
  tile("pos", stage, "NPS Gauge", ".nfc-nps",
    "A three-band detractor/passive/promoter dial with a needle resting at the net score. Use for survey and satisfaction rollups.");
}

/* 2. Error Budget Burndown */
{
  const total = 100, used = 63, days = [8,14,19,24,31,37,44,49,55,60,63];
  const W = 240, H = 70, mx = total;
  const X = (i) => f((i/(days.length-1))*W);
  const Y = (v) => f(H - (v/mx)*H);
  let ln = ""; days.forEach((v,i)=>{ln += `${i?"L":"M"}${X(i)} ${Y(v)} `;});
  const stage = `<div class="nfc-errbudget"><div class="hd"><span>Error budget burned</span><b>${used}<small>/${total}</small></b></div>
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line class="lim" x1="0" y1="0" x2="${W}" y2="0"/>
      <path class="burn" d="${ln}" pathLength="100" style="--len:100"/>
    </svg><div class="sc"><span>Day 1</span><span>Day 30 (reset)</span></div></div>`;
  tile("warn", stage, "Error Budget Burndown", ".nfc-errbudget",
    "Cumulative budget consumed against a hard ceiling over the rolling window. The line trending toward the top signals an impending breach.");
}

/* 3. SLA Compliance Tick Ring */
{
  const n = 30; const breaches = new Set([4,11,12,22]);
  let ticks = "";
  for (let i=0;i<n;i++){
    const a = -90 + i*(360/n);
    const [x1,y1] = P(80,80,58,a), [x2,y2] = P(80,80,68,a);
    ticks += `<line class="tk ${breaches.has(i)?"bad":"ok"}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="animation-delay:${f(i*0.02)}s"/>`;
  }
  const stage = `<div class="nfc-slaring"><svg width="160" height="160" viewBox="0 0 160 160">${ticks}<circle class="face" cx="80" cy="80" r="50"/></svg>
    <div class="ctr"><b>${f(((n-breaches.size)/n)*100)}%</b><span class="nfc-cap2">30-day SLA</span></div></div>`;
  tile("pos", stage, "SLA Compliance Tick Ring", ".nfc-slaring",
    "One tick per day around the dial — green for compliant, red for a breach — so a month of SLA history reads at a glance.");
}

/* 4. Percentile Distribution Curve */
{
  const W=250,H=110;
  const pts=[]; for(let x=0;x<=W;x+=4){ const t=(x-W*0.42)/40; pts.push([x, f(H-8-Math.exp(-t*t/2)*(H-24))]); }
  let ln = pts.map((p,i)=>`${i?"L":"M"}${p[0]} ${p[1]}`).join(" ");
  let area = `M0 ${H} ` + pts.map(p=>`L${p[0]} ${p[1]}`).join(" ") + ` L${W} ${H} Z`;
  const marks = [[0.5,"p50"],[0.75,"p90"],[0.92,"p99"]];
  let mk = marks.map(m=>{const x=f(W*m[0]);return `<line class="mk" x1="${x}" y1="8" x2="${x}" y2="${H-8}"/><text x="${x}" y="8" text-anchor="middle">${m[1]}</text>`;}).join("");
  const stage = `<div class="nfc-pctcurve"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="ar" d="${area}"/><path class="ln" d="${ln}" pathLength="100" style="--len:100"/>${mk}
  </svg><div class="sc"><span>fast</span><span>response time</span><span>slow</span></div></div>`;
  tile("info", stage, "Percentile Distribution Curve", ".nfc-pctcurve",
    "A smoothed density curve of response times with p50/p90/p99 markers dropped through the peak — shows shape, not just cutoffs.");
}

/* 5. Cumulative Flow Diagram */
{
  const W=250,H=120,n=10;
  const done=[2,4,6,9,13,18,23,29,34,40];
  const doing=[3,5,6,7,8,8,9,10,9,10];
  const todo=[20,18,16,14,12,10,8,6,5,3];
  const X=(i)=>f((i/(n-1))*W);
  const stack = (arr,base)=>{let s=`M0 ${H} `;arr.forEach((v,i)=>s+=`L${X(i)} ${f(H-(base(i)+v)/60*H)} `);s+=`L${W} ${H} Z`;return s;};
  const top1=(i)=>done[i]; const top2=(i)=>done[i]+doing[i]; const top3=(i)=>done[i]+doing[i]+todo[i];
  const layer1 = (()=>{let s=`M0 ${f(H-top1(0)/60*H)} `;for(let i=1;i<n;i++)s+=`L${X(i)} ${f(H-top1(i)/60*H)} `;s+=`L${W} ${H} L0 ${H} Z`;return s;})();
  const layer2 = (()=>{let s=`M0 ${f(H-top2(0)/60*H)} `;for(let i=1;i<n;i++)s+=`L${X(i)} ${f(H-top2(i)/60*H)} `;for(let i=n-1;i>=0;i--)s+=`L${X(i)} ${f(H-top1(i)/60*H)} `;s+="Z";return s;})();
  const layer3 = (()=>{let s=`M0 ${f(H-top3(0)/60*H)} `;for(let i=1;i<n;i++)s+=`L${X(i)} ${f(H-top3(i)/60*H)} `;for(let i=n-1;i>=0;i--)s+=`L${X(i)} ${f(H-top2(i)/60*H)} `;s+="Z";return s;})();
  const stage = `<div class="nfc-cfd"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="l3" d="${layer3}"/><path class="l2" d="${layer2}"/><path class="l1" d="${layer1}"/>
  </svg><div class="lg"><span><i class="d1"></i>Done</span><span><i class="d2"></i>In progress</span><span><i class="d3"></i>To do</span></div></div>`;
  tile("info", stage, "Cumulative Flow Diagram", ".nfc-cfd",
    "Stacked to-do / in-progress / done bands over sprint days. A widening in-progress band flags a bottleneck before standup does.");
}

/* 6. Pareto Chart */
{
  const rows = [["Timeouts",38],["Bad input",24],["Auth",16],["Rate limit",10],["5xx",7],["Other",5]];
  const total = rows.reduce((a,r)=>a+r[1],0);
  let cum=0; const W=250,H=130,n=rows.length,bw=W/n*0.6,step=W/n;
  const mx = rows[0][1];
  let bars="",line="";
  rows.forEach((r,i)=>{
    const h=f((r[1]/mx)*(H-30));
    const x=f(i*step+(step-bw)/2);
    bars+=`<rect class="bar" x="${x}" y="${f(H-h)}" width="${bw}" height="${h}" rx="2" style="animation-delay:${f(i*0.06)}s"/>`;
    cum+=r[1];
    const cx=f(i*step+step/2), cy=f(H-(cum/total)*(H-10));
    line+=`${i?"L":"M"}${cx} ${cy} `;
  });
  const stage = `<div class="nfc-pareto"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line class="ref80" x1="0" y1="${f(H-0.8*(H-10))}" x2="${W}" y2="${f(H-0.8*(H-10))}"/>
    ${bars}<path class="cum" d="${line}" pathLength="100" style="--len:100"/>
  </svg><div class="cap"><span>Support ticket causes, ranked</span><span class="nfc-cap2">line = cumulative %</span></div></div>`;
  tile("warn", stage, "Pareto Chart", ".nfc-pareto",
    "Descending-frequency bars with a cumulative-percentage line overlaid — spot the 20% of causes driving 80% of tickets.");
}

/* 7. Histogram */
{
  const bins = [2,5,11,19,27,24,15,8,4,1];
  const W=240,H=110,n=bins.length,bw=W/n-3;
  const mx = Math.max(...bins);
  let bars="";
  bins.forEach((v,i)=>{
    const h=f((v/mx)*(H-14));
    bars+=`<rect class="bar" x="${f(i*(W/n)+1.5)}" y="${f(H-h)}" width="${bw}" height="${h}" rx="2" style="animation-delay:${f(i*0.04)}s"/>`;
  });
  const stage = `<div class="nfc-histo"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bars}</svg>
    <div class="sc"><span>$0</span><span>order value</span><span>$200</span></div></div>`;
  tile("info", stage, "Histogram", ".nfc-histo",
    "Binned frequency bars over a continuous range — reveals the shape (and skew) of a distribution, unlike a single summary stat.");
}

/* 8. Moving Average Crossover */
{
  const W=250,H=110,n=20;
  const price=[]; let p=40; for(let i=0;i<n;i++){p+=Math.sin(i*0.6)*3+ (i>12?1.2:-0.4); price.push(p);}
  const ma=(arr,w)=>arr.map((_,i)=>{const s=Math.max(0,i-w+1);const slice=arr.slice(s,i+1);return slice.reduce((a,b)=>a+b,0)/slice.length;});
  const fast=ma(price,3), slow=ma(price,7);
  const mn=Math.min(...price)-2, mx=Math.max(...price)+2;
  const X=(i)=>f((i/(n-1))*W);
  const Y=(v)=>f(H-8-((v-mn)/(mx-mn))*(H-16));
  let lf="",ls=""; price.forEach((_,i)=>{lf+=`${i?"L":"M"}${X(i)} ${Y(fast[i])} `; ls+=`${i?"L":"M"}${X(i)} ${Y(slow[i])} `;});
  let cross=14;
  const [cx,cy]=[X(cross),Y(fast[cross])];
  const stage = `<div class="nfc-macross"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="slow" d="${ls}" pathLength="100" style="--len:100"/>
    <path class="fast" d="${lf}" pathLength="100" style="--len:100"/>
    <circle class="pt" cx="${cx}" cy="${cy}" r="4"/>
  </svg><div class="lg"><span><i class="fast"></i>7-day</span><span><i class="slow"></i>21-day</span><span class="tag">golden cross</span></div></div>`;
  tile("pos", stage, "Moving Average Crossover", ".nfc-macross",
    "Fast and slow moving averages drawn over the same window; the marked crossover point flags a momentum shift up or down.");
}

/* 9. Anomaly-Flagged Timeline */
{
  const W=250,H=100,n=24;
  const vals=[]; for(let i=0;i<n;i++){let v=30+Math.sin(i*0.5)*8+ (i%7===0?0:0);vals.push(v);}
  vals[9]=72; vals[17]=8;
  const mx=80,mn=0;
  const X=(i)=>f((i/(n-1))*W);
  const Y=(v)=>f(H-6-((v-mn)/(mx-mn))*(H-12));
  let ln=""; vals.forEach((v,i)=>{ln+=`${i?"L":"M"}${X(i)} ${Y(v)} `;});
  const anomalies=[9,17];
  let flags = anomalies.map(i=>`<circle class="anom" cx="${X(i)}" cy="${Y(vals[i])}" r="5"/><line class="drop" x1="${X(i)}" y1="${Y(vals[i])}" x2="${X(i)}" y2="${H-2}"/>`).join("");
  const stage = `<div class="nfc-anomaly"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="ln" d="${ln}" pathLength="100" style="--len:100"/>${flags}
  </svg><div class="sc">2 anomalies flagged in last 24h</div></div>`;
  tile("crit", stage, "Anomaly-Flagged Timeline", ".nfc-anomaly",
    "A normal-range metric line with statistically flagged spikes and dips called out by dropped markers, ready for annotation.");
}

/* 10. Geo Density Grid (abstract, no real map) */
{
  const cols=12, rows=6; let cells="";
  for(let r=0;r<rows;r++){for(let c=0;c<cols;c++){
    const shape = Math.sin(c*0.5)+Math.cos(r*0.8);
    const on = shape > -0.6;
    const v = on ? f(0.15+((shape+2)/4)*0.85) : 0;
    cells += `<i style="opacity:${v};animation-delay:${f((r*cols+c)*0.01)}s"></i>`;
  }}
  const stage = `<div class="nfc-geogrid"><div class="grid" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div>
    <div class="sc"><span>low</span><span>request density by region cell</span><span>high</span></div></div>`;
  tile("info", stage, "Geo Density Grid", ".nfc-geogrid",
    "An abstract cell grid standing in for a map — opacity encodes traffic density per region without any real geography or imagery.");
}

/* 11. Token Cost Meter */
{
  const used=842000, cap=1000000, cost=12.63;
  const pct=f((used/cap)*100);
  const segs=[["Prompt",0.38,"var(--info)"],["Completion",0.47,"var(--accent)"],["Cached",0.15,"var(--pos)"]];
  let bar=""; let acc=0;
  segs.forEach((s,i)=>{ bar+=`<i style="left:${f(acc*100)}%;width:${f(s[1]*100)}%;background:${s[2]};animation-delay:${f(i*0.08)}s"></i>`; acc+=s[1]; });
  const stage = `<div class="nfc-tokcost"><div class="hd"><span>Token spend this session</span><b>$${cost.toFixed(2)}</b></div>
    <div class="track">${bar}<div class="cap" style="left:${pct}%"></div></div>
    <div class="lg"><span><i style="background:var(--info)"></i>Prompt</span><span><i style="background:var(--accent)"></i>Completion</span><span><i style="background:var(--pos)"></i>Cached</span></div></div>`;
  tile("accent", stage, "Token Cost Meter", ".nfc-tokcost",
    "LLM token usage split into prompt / completion / cached-hit segments against a budget cap, with running dollar cost.");
}

/* 12. Latency Percentile Histogram */
{
  const bins=[3,6,14,26,34,22,12,6,3,1];
  const W=240,H=110,n=bins.length,bw=W/n-3,mx=Math.max(...bins);
  const zones=(i)=> i<6 ? "var(--pos)" : i<8 ? "var(--warn)" : "var(--crit)";
  let bars="";
  bins.forEach((v,i)=>{
    const h=f((v/mx)*(H-24));
    bars+=`<rect class="bar" x="${f(i*(W/n)+1.5)}" y="${f(H-h-14)}" width="${bw}" height="${h}" rx="2" fill="${zones(i)}" style="animation-delay:${f(i*0.04)}s"/>`;
  });
  const stage = `<div class="nfc-lathisto"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line class="p95" x1="${f(7*(W/n))}" y1="0" x2="${f(7*(W/n))}" y2="${H-14}"/>
    <text class="p95t" x="${f(7*(W/n))}" y="10">p95</text>${bars}
  </svg><div class="sc"><span>0ms</span><span>request latency</span><span>500ms</span></div></div>`;
  tile("warn", stage, "Latency Percentile Histogram", ".nfc-lathisto",
    "Response-time bins colored by SLA zone (green/amber/red) with the p95 cutoff marked — spot the tail, not just the average.");
}

/* 13. Uptime Calendar (month grid) */
{
  const days=30; const down=new Set([6,19]);
  const partial=new Set([13]);
  let cells="";
  for(let i=0;i<days;i++){
    const cls = down.has(i) ? "down" : partial.has(i) ? "part" : "up";
    cells += `<i class="${cls}" style="animation-delay:${f(i*0.015)}s">${i+1}</i>`;
  }
  const stage = `<div class="nfc-uptimecal"><div class="hd"><span>March</span><b>99.2%</b></div>
    <div class="grid">${cells}</div>
    <div class="lg"><span><i class="up"></i>Up</span><span><i class="part"></i>Degraded</span><span><i class="down"></i>Outage</span></div></div>`;
  tile("pos", stage, "Uptime Calendar", ".nfc-uptimecal",
    "One full month as a day-numbered grid, each cell colored by service state — outages and degradations jump out immediately.");
}

/* 14. Capacity Forecast Cone */
{
  const W=250,H=110,nh=8,nf=6;
  const hist=[20,24,23,28,31,30,35,39];
  const X=(i)=>f((i/(nh+nf-1))*W);
  const Y=(v)=>f(H-6-(v/70)*(H-12));
  let hln=""; hist.forEach((v,i)=>{hln+=`${i?"L":"M"}${X(i)} ${Y(v)} `;});
  const last=hist[hist.length-1];
  let mid=`M${X(nh-1)} ${Y(last)} `, hi=`M${X(nh-1)} ${Y(last)} `, lo=`M${X(nh-1)} ${Y(last)} `;
  for(let i=0;i<nf;i++){
    const idx=nh+i;
    const proj=last + i*3.4;
    const spread = 3 + i*2.6;
    mid+=`L${X(idx)} ${Y(proj)} `;
    hi+=`L${X(idx)} ${Y(proj+spread)} `;
    lo+=`L${X(idx)} ${Y(proj-spread)} `;
  }
  const band = mid.replace("M","M") + hi.split("M")[1] ? "" : "";
  // build filled cone path: forward along hi, back along lo
  let coneHi=[],coneLo=[];
  for(let i=0;i<nf;i++){const idx=nh+i;const proj=last+i*3.4;const spread=3+i*2.6;coneHi.push([X(idx),Y(proj+spread)]);coneLo.push([X(idx),Y(proj-spread)]);}
  let cone = `M${X(nh-1)} ${Y(last)} `+coneHi.map(p=>`L${p[0]} ${p[1]}`).join(" ")+" "+coneLo.slice().reverse().map(p=>`L${p[0]} ${p[1]}`).join(" ")+" Z";
  const stage = `<div class="nfc-forecast"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="cone" d="${cone}"/>
    <path class="hist" d="${hln}" pathLength="100" style="--len:100"/>
    <line class="now" x1="${X(nh-1)}" y1="4" x2="${X(nh-1)}" y2="${H-4}"/>
  </svg><div class="sc"><span>past 8 weeks</span><span>forecast ± confidence</span></div></div>`;
  tile("info", stage, "Capacity Forecast Cone", ".nfc-forecast",
    "Historical usage feeds a projected trend line with a widening confidence cone — the further out, the less certain the estimate.");
}

/* 15. Budget vs Actual Variance Bars */
{
  const rows=[["Infra",42,38],["Headcount",120,131],["Tools",18,15],["Travel",9,14],["Marketing",30,27]];
  let out="";
  rows.forEach((r,i)=>{
    const [k,budget,actual]=r; const mx=140;
    const bw=f((budget/mx)*100), aw=f((actual/mx)*100);
    const over = actual>budget;
    out+=`<div class="row"><span class="k">${k}</span><div class="bars"><i class="bud" style="width:${bw}%;animation-delay:${f(i*0.06)}s"></i><i class="act ${over?"over":"under"}" style="width:${aw}%;animation-delay:${f(0.15+i*0.06)}s"></i></div><span class="v ${over?"over":"under"}">${over?"+":""}${actual-budget}k</span></div>`;
  });
  const stage = `<div class="nfc-variance">${out}<div class="lg"><span><i class="bud"></i>Budget</span><span><i class="act under"></i>Under</span><span><i class="act over"></i>Over</span></div></div>`;
  tile("warn", stage, "Budget vs Actual Variance", ".nfc-variance",
    "Paired budget/actual bars per line item with a signed variance readout — over-spend rows tint red, under-spend stays green.");
}

/* 16. Churn Risk Scorecard */
{
  const score=72;
  const factors=[["Login frequency",-18],["Support tickets",22],["Feature adoption",-8],["Contract age",4]];
  let rows = factors.map((r,i)=>{
    const neg=r[1]<0; const w=f(Math.abs(r[1]));
    return `<div class="frow"><span class="k">${r[0]}</span><div class="fbar"><i class="${neg?"good":"bad"}" style="width:${w*2}%;animation-delay:${f(i*0.06)}s"></i></div><span class="fv ${neg?"good":"bad"}">${neg?"":"+"}${r[1]}</span></div>`;
  }).join("");
  const d = arcPath(45,50,34,180,180);
  const stage = `<div class="nfc-churn"><div class="top"><svg width="90" height="60" viewBox="0 0 90 60"><path class="trk" d="${d}" stroke-width="8"/><path class="val" d="${d}" stroke-width="8" pathLength="100" style="--len:100;--off:${f(100-score)}"/></svg><div class="sc-lbl"><b>${score}</b><span class="nfc-cap2">risk score</span></div></div><div class="factors">${rows}</div></div>`;
  tile("crit", stage, "Churn Risk Scorecard", ".nfc-churn",
    "A composite risk dial paired with the signed factors driving it — negative (protective) and positive (risky) contributions side by side.");
}

/* 17. Step Conversion Staircase */
{
  const steps=[["Landed",100],["Viewed pricing",64],["Started trial",37],["Converted",19]];
  const n=steps.length, W=250, H=120, sw=W/n;
  let bars="";
  steps.forEach((s,i)=>{
    const h=f((s[1]/100)*(H-24));
    bars+=`<div class="step" style="height:${h}px;animation-delay:${f(i*0.1)}s"><b>${s[1]}%</b><span>${s[0]}</span></div>`;
  });
  const stage = `<div class="nfc-staircase" style="width:${W}px">${bars}</div>`;
  tile("accent", stage, "Step Conversion Staircase", ".nfc-staircase",
    "Each stage of a journey rendered as a descending step, height proportional to the share still remaining — drop-off reads as the ledge height.");
}

/* 18. Service Dependency Mini-Graph */
{
  const nodes=[["API",75,20,"var(--accent)"],["Auth",25,70,"var(--pos)"],["DB",125,70,"var(--crit)"],["Cache",75,120,"var(--info)"]];
  const edges=[[0,1],[0,2],[0,3],[2,3]];
  let lines = edges.map((e,i)=>{const a=nodes[e[0]],b=nodes[e[1]];return `<line class="ed" x1="${a[1]}" y1="${a[2]}" x2="${b[1]}" y2="${b[2]}" style="animation-delay:${f(i*0.1)}s"/>`;}).join("");
  let dots = nodes.map((n,i)=>`<g style="animation-delay:${f(0.3+i*0.08)}s" class="nd"><circle cx="${n[1]}" cy="${n[2]}" r="12" fill="${n[3]}"/><text x="${n[1]}" y="${n[2]+26}" text-anchor="middle">${n[0]}</text></g>`).join("");
  const stage = `<div class="nfc-depgraph"><svg width="150" height="150" viewBox="0 0 150 150">${lines}${dots}</svg></div>`;
  tile("info", stage, "Service Dependency Mini-Graph", ".nfc-depgraph",
    "A handful of nodes and edges showing which services call which — color the node red on an incident to trace blast radius fast.");
}

/* 19. Weighted Tag Cloud */
{
  const words=[["timeout",30],["latency",26],["auth",15],["cache",22],["retry",12],["429",18],["ssl",9],["dns",11],["oom",16],["cold-start",13]];
  let out = words.map((w,i)=>{
    const size=f(11+ (w[1]/30)*16);
    const cols=["var(--accent)","var(--info)","var(--pos)","var(--warn)","var(--crit)"];
    return `<span style="font-size:${size}px;color:${cols[i%cols.length]};animation-delay:${f(i*0.05)}s">${w[0]}</span>`;
  }).join("");
  const stage = `<div class="nfc-tagcloud">${out}</div>`;
  tile("accent", stage, "Weighted Tag Cloud", ".nfc-tagcloud",
    "Error keywords or support tags sized by frequency in a wrapped cloud — quick qualitative read of what's dominating the noise.");
}

/* 20. 100% Stacked Survey Bar */
{
  const segs=[["Very satisfied",34,"var(--pos)"],["Satisfied",28,"var(--info)"],["Neutral",21,"var(--warn)"],["Dissatisfied",11,"var(--crit)"],["Very dissatisfied",6,"var(--neg)"]];
  let acc=0; let bar="";
  segs.forEach((s,i)=>{
    bar+=`<i style="left:${f(acc)}%;width:${s[1]}%;background:${s[2]};animation-delay:${f(i*0.07)}s"></i>`;
    acc+=s[1];
  });
  let lg = segs.map(s=>`<span><i style="background:${s[2]}"></i>${s[0]} ${s[1]}%</span>`).join("");
  const stage = `<div class="nfc-stack100"><div class="bar">${bar}</div><div class="lg">${lg}</div></div>`;
  tile("pos", stage, "100% Stacked Survey Bar", ".nfc-stack100",
    "A single full-width bar split into response-share segments that always sum to 100% — compact alternative to a pie for one question.");
}

/* 21. Small Multiples Sparkline Grid */
{
  const metrics=[["Signups",[3,5,4,7,6,9]],["Revenue",[10,9,11,13,12,15]],["Errors",[8,6,7,5,4,3]],["Latency",[5,6,5,7,8,7]],["Churn",[2,3,2,2,1,1]],["NPS",[6,7,7,8,9,10]]];
  let cells = metrics.map((m,mi)=>{
    const [label,data]=m; const W=64,H=26,mx=Math.max(...data),mn=Math.min(...data);
    const X=(i)=>f((i/(data.length-1))*W); const Y=(v)=>f(H-3-((v-mn)/((mx-mn)||1))*(H-6));
    let ln=""; data.forEach((v,i)=>{ln+=`${i?"L":"M"}${X(i)} ${Y(v)} `;});
    return `<div class="cell" style="animation-delay:${f(mi*0.06)}s"><span class="k">${label}</span><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${ln}" pathLength="100" style="--len:100"/></svg></div>`;
  }).join("");
  const stage = `<div class="nfc-multispark">${cells}</div>`;
  tile("info", stage, "Small Multiples Sparkline Grid", ".nfc-multispark",
    "A grid of tiny identically-scaled trend lines, one per metric — scan many KPIs' shapes at once without six separate cards.");
}

/* 22. Hourly Heat Strip */
{
  const hours=24; let cells="";
  for(let h=0;h<hours;h++){
    const v = Math.max(0.05, Math.sin((h-6)/24*Math.PI*2)*0.5+0.5);
    cells += `<i style="opacity:${f(0.1+v*0.9)}" title="${h}:00" style="animation-delay:${f(h*0.02)}s"></i>`;
  }
  const stage = `<div class="nfc-heatstrip"><div class="strip">${cells}</div><div class="sc"><span>12am</span><span>noon</span><span>12am</span></div></div>`;
  tile("warn", stage, "Hourly Heat Strip", ".nfc-heatstrip",
    "One row, 24 cells — load intensity by hour of day. Stack several days of these to spot a recurring peak window instantly.");
}

/* 23. Live Log Tail Viewer */
{
  const lines=[
    ["12:04:01","INFO","ok","request completed 200 in 84ms"],
    ["12:04:02","WARN","warn","connection pool at 82% capacity"],
    ["12:04:02","INFO","ok","cache hit ratio 0.94"],
    ["12:04:03","ERR","err","upstream timeout after 3000ms"],
    ["12:04:04","INFO","ok","retry succeeded on attempt 2"],
  ];
  let rows = lines.map((l,i)=>`<div class="ln" style="animation-delay:${f(i*0.08)}s"><span class="t">${l[0]}</span><span class="lvl ${l[2]}">${l[1]}</span><span class="m">${l[3]}</span></div>`).join("");
  const stage = `<div class="nfc-logtail">${rows}<div class="cursor">▌</div></div>`;
  tile("crit", stage, "Live Log Tail Viewer", ".nfc-logtail",
    "A monospace log stream with severity-colored level tags and a blinking cursor, mimicking a live-tailing terminal pane.");
}

/* 24. Service Status Matrix */
{
  const services=["api","auth","billing","search"];
  const regions=["us-e","us-w","eu","apac"];
  const state=[[0,0,0,1],[0,0,0,0],[0,1,2,0],[0,0,0,0]];
  const cls=["ok","warn","down"];
  let head=`<span class="cell hd"></span>`+regions.map(r=>`<span class="cell hd">${r}</span>`).join("");
  let body = services.map((s,ri)=>`<span class="cell hd row">${s}</span>`+state[ri].map((v,ci)=>`<span class="cell dot ${cls[v]}" style="animation-delay:${f((ri*4+ci)*0.03)}s"></span>`).join("")).join("");
  const stage = `<div class="nfc-statusmatrix" style="grid-template-columns:56px repeat(${regions.length},1fr)">${head}${body}</div>`;
  tile("pos", stage, "Service Status Matrix", ".nfc-statusmatrix",
    "Services down the side, regions across the top, a status dot at each intersection — the classic health-grid dashboard component.");
}

/* 25. Dual-Axis Rate Combo */
{
  const W=250,H=110,n=12;
  const reqs=[20,24,22,30,34,32,40,44,41,48,52,50];
  const errs=[1,1.2,0.9,2.1,3.4,2.8,1.9,4.2,3.1,2.4,1.6,1.1];
  const mxr=Math.max(...reqs), mxe=Math.max(...errs);
  const X=(i)=>f((i/(n-1))*W);
  const bw=W/n-4;
  let bars=""; reqs.forEach((v,i)=>{const h=f((v/mxr)*(H-16));bars+=`<rect class="bar" x="${f(i*(W/n)+2)}" y="${f(H-h)}" width="${bw}" height="${h}" rx="1" style="animation-delay:${f(i*0.04)}s"/>`;});
  let ln=""; errs.forEach((v,i)=>{ln+=`${i?"L":"M"}${X(i)} ${f(H-8-(v/mxe)*(H-20))} `;});
  const stage = `<div class="nfc-dualaxis"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bars}<path class="errln" d="${ln}" pathLength="100" style="--len:100"/></svg>
    <div class="lg"><span><i class="bar"></i>Requests/min</span><span><i class="errln"></i>Error % (right axis)</span></div></div>`;
  tile("info", stage, "Dual-Axis Rate Combo", ".nfc-dualaxis",
    "Request volume as bars with error rate overlaid as an independently-scaled line — see if error spikes track or diverge from traffic.");
}

/* 26. Deploy Frequency Trail */
{
  const days=21; let dots="";
  for(let i=0;i<days;i++){
    const n = Math.max(0, Math.round(2+Math.sin(i*0.7)*2+ (i%6===0?2:0)));
    let stackDots="";
    for(let k=0;k<n;k++) stackDots+=`<i style="animation-delay:${f((i*0.03)+k*0.05)}s"></i>`;
    dots += `<div class="day">${stackDots}</div>`;
  }
  const stage = `<div class="nfc-deploytrail"><div class="trail">${dots}</div><div class="sc"><span>3 weeks ago</span><span>deploys per day</span><span>today</span></div></div>`;
  tile("accent", stage, "Deploy Frequency Trail", ".nfc-deploytrail",
    "Each day is a column of stacked dots, one per deploy — a lightweight way to see release cadence and spot dry spells.");
}

/* 27. Queue Depth Area + SLA Line */
{
  const W=250,H=110,n=16;
  const q=[]; let v=20; for(let i=0;i<n;i++){v+=Math.sin(i*0.7)*6+(i>10?2:0); q.push(Math.max(2,v));}
  const mx=70;
  const X=(i)=>f((i/(n-1))*W); const Y=(val)=>f(H-6-(val/mx)*(H-12));
  let ln="",ar=`M0 ${H} `; q.forEach((val,i)=>{ln+=`${i?"L":"M"}${X(i)} ${Y(val)} `;ar+=`L${X(i)} ${Y(val)} `;}); ar+=`L${W} ${H} Z`;
  const sla=45;
  const stage = `<div class="nfc-queuearea"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="ar" d="${ar}"/><line class="sla" x1="0" y1="${Y(sla)}" x2="${W}" y2="${Y(sla)}"/>
    <path class="ln" d="${ln}" pathLength="100" style="--len:100"/>
  </svg><div class="sc"><span>queue depth</span><span class="tag">SLA ceiling ${sla}</span></div></div>`;
  tile("warn", stage, "Queue Depth + SLA Line", ".nfc-queuearea",
    "A filled area tracking backlog size against a fixed SLA ceiling line — the moment the fill crosses the dashed line, you're breaching.");
}

/* 28. Circular (Polar) Sparkline */
{
  const cx=75,cy=75,base=30,amp=26,n=48;
  let pts=[]; for(let i=0;i<=n;i++){const t=i/n; const v=base+amp*(0.5+0.5*Math.sin(t*Math.PI*2*2)+0.15*Math.sin(t*Math.PI*2*5)); const a=-90+t*360; pts.push(P(cx,cy,v,a));}
  let d = pts.map((p,i)=>`${i?"L":"M"}${p[0]} ${p[1]}`).join(" ")+" Z";
  const stage = `<div class="nfc-polarspark"><svg width="150" height="150" viewBox="0 0 150 150">
    <circle class="ref" cx="${cx}" cy="${cy}" r="${base}"/>
    <path class="ln" d="${d}" pathLength="100" style="--len:100"/>
  </svg><span class="nfc-cap2">24h load, wrapped around the clock</span></div>`;
  tile("accent", stage, "Circular (Polar) Sparkline", ".nfc-polarspark",
    "A day's metric bent around a clock face instead of a straight line — radius is value, angle is time-of-day, so cyclical rhythm pops out.");
}

/* 29. Signal Strength Meter */
{
  const bars=[1,1,1,1,0].map((v,i)=>i); // 4 of 5 filled
  const active=4;
  let out="";
  for(let i=0;i<5;i++) out+=`<i class="${i<active?"on":""}" style="height:${f(20+i*8)}px;animation-delay:${f(i*0.06)}s"></i>`;
  const stage = `<div class="nfc-signalbars"><div class="bars">${out}</div><span class="nfc-cap2">Connection quality — good</span></div>`;
  tile("pos", stage, "Signal Strength Meter", ".nfc-signalbars",
    "Discrete stepped bars (like a phone signal icon) for coarse quality readouts where a precise number would be noise.");
}

/* 30. Heartbeat Pulse Monitor */
{
  const d = "M0 20 L20 20 L26 4 L32 36 L38 20 L44 20 L50 12 L56 28 L62 20 L250 20";
  const stage = `<div class="nfc-heartbeat"><svg width="250" height="40" viewBox="0 0 250 40" preserveAspectRatio="none">
    <path class="beat" d="${d}" pathLength="100" style="--len:100"/>
  </svg><span class="nfc-cap2">Heartbeat · last check 2s ago</span></div>`;
  tile("pos", stage, "Heartbeat Pulse Monitor", ".nfc-heartbeat",
    "An ECG-style waveform that continuously redraws — a liveliness indicator that reads as 'still beating' at a glance.");
}

/* 31. Freshness Countdown Ring */
{
  const d = arcPath(45,45,34,-90,360);
  const pct=68; // remaining
  const stage = `<div class="nfc-freshring"><svg width="90" height="90" viewBox="0 0 90 90">
    <circle class="trk" cx="45" cy="45" r="34" stroke-width="7"/>
    <circle class="val" cx="45" cy="45" r="34" stroke-width="7" pathLength="100" style="--len:100;--off:${f(100-pct)}" transform="rotate(-90 45 45)"/>
  </svg><div class="ctr"><b>18s</b><span class="nfc-cap2">next refresh</span></div></div>`;
  tile("info", stage, "Data Freshness Countdown Ring", ".nfc-freshring",
    "A shrinking ring counting down to the next auto-refresh — tells viewers exactly how stale the numbers on screen might be.");
}

/* 32. Notched Level Dial */
{
  const notches=10, filled=7;
  let segs="";
  for(let i=0;i<notches;i++){
    const a0=180+i*(180/notches), a1=a0+(180/notches)-4;
    const path=arcPath(75,80,55,a0,(180/notches)-4);
    segs+=`<path class="seg ${i<filled?"on":""}" d="${path}" stroke-width="10" style="animation-delay:${f(i*0.05)}s"/>`;
  }
  const stage = `<div class="nfc-notchdial"><svg width="150" height="95" viewBox="0 0 150 95">${segs}</svg><div class="ctr"><b>Level ${filled}</b><span class="nfc-cap2">of ${notches}</span></div></div>`;
  tile("accent", stage, "Notched Level Dial", ".nfc-notchdial",
    "A gauge broken into discrete notches rather than a smooth sweep — suits tiered levels, ratings, or maturity stages better than a % arc.");
}

/* 33. Alert Severity Ladder */
{
  const rows=[["Sev-1",1,"var(--crit)"],["Sev-2",3,"var(--neg)"],["Sev-3",9,"var(--warn)"],["Sev-4",14,"var(--info)"],["Sev-5",22,"var(--pos)"]];
  const mx=Math.max(...rows.map(r=>r[1]));
  let out = rows.map((r,i)=>{
    const w=f((r[1]/mx)*100);
    return `<div class="rung"><span class="k" style="color:${r[2]}">${r[0]}</span><div class="bar"><i style="width:${w}%;background:${r[2]};animation-delay:${f(i*0.06)}s"></i></div><span class="v">${r[1]}</span></div>`;
  }).join("");
  const stage = `<div class="nfc-sevladder">${out}</div>`;
  tile("crit", stage, "Alert Severity Ladder", ".nfc-sevladder",
    "Open alerts grouped by severity rung, widest bar wins attention first — a triage-ordered alternative to a flat bar chart.");
}

/* 34. Version Adoption Bars */
{
  const rows=[["v4.2",48,"var(--pos)"],["v4.1",31,"var(--info)"],["v4.0",14,"var(--warn)"],["v3.x",7,"var(--crit)"]];
  let acc=0; let bar="";
  rows.forEach((r,i)=>{ bar+=`<i style="left:${f(acc)}%;width:${r[1]}%;background:${r[2]};animation-delay:${f(i*0.07)}s"></i>`; acc+=r[1]; });
  let lg = rows.map(r=>`<span><i style="background:${r[2]}"></i>${r[0]} ${r[1]}%</span>`).join("");
  const stage = `<div class="nfc-versionbars"><div class="bar">${bar}</div><div class="lg">${lg}</div></div>`;
  tile("info", stage, "Version Adoption Bars", ".nfc-versionbars",
    "A single stacked bar showing what share of the fleet runs each app or client version — spot a lagging cohort still on 3.x.");
}

/* ================= CSS ================= */
const css = `
<style>
/* ===== NFC — New Facets: Charts & Metrics (self-contained, token-driven) ===== */
@keyframes nfc-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes nfc-pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes nfc-grow{from{width:0 !important}}
@keyframes nfc-riseY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes nfc-dash{to{stroke-dashoffset:0}}
@keyframes nfc-dashto{to{stroke-dashoffset:var(--off)}}
@keyframes nfc-blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes nfc-beat{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.04)}}
@keyframes nfc-needlesw{from{transform:rotate(0deg)}to{transform:rotate(var(--rot))}}
.nfc-cap2{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);display:block;margin-top:4px}

/* 1 nps gauge */
.nfc-nps{position:relative;width:150px;text-align:center}
.nfc-nps svg{display:block;margin:0 auto}
.nfc-nps .seg{fill:none}
.nfc-nps .det{stroke:var(--neg)} .nfc-nps .pas{stroke:var(--warn)} .nfc-nps .pro{stroke:var(--pos)}
.nfc-nps .ndl{stroke:var(--ink);stroke-width:3;stroke-linecap:round;transform-origin:75px 80px;transform:rotate(var(--rot,0deg));animation:nfc-needlesw 1.2s cubic-bezier(.34,1.56,.64,1) forwards}
.nfc-nps .hub{fill:var(--ink)}
.nfc-nps b{display:block;font-size:24px;font-weight:800;margin-top:-6px;color:var(--pos)}

/* 2 error budget burndown */
.nfc-errbudget{width:240px}
.nfc-errbudget .hd{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px}
.nfc-errbudget .hd b{color:var(--ink);font-variant-numeric:tabular-nums}
.nfc-errbudget .hd b small{color:var(--dim);font-weight:600}
.nfc-errbudget .lim{stroke:var(--line);stroke-width:1;stroke-dasharray:3 3}
.nfc-errbudget .burn{fill:none;stroke:var(--warn);stroke-width:2.4;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.4s ease-out forwards}
.nfc-errbudget .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px}

/* 3 sla tick ring */
.nfc-slaring{position:relative;width:160px;height:160px}
.nfc-slaring .tk{stroke-width:3;stroke-linecap:round;opacity:0;animation:nfc-fade .4s ease-out forwards}
.nfc-slaring .tk.ok{stroke:var(--pos)}
.nfc-slaring .tk.bad{stroke:var(--crit)}
.nfc-slaring .face{fill:none;stroke:var(--line);stroke-width:1}
.nfc-slaring .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.nfc-slaring .ctr b{font-size:24px;font-weight:800;color:var(--pos)}

/* 4 percentile distribution curve */
.nfc-pctcurve{width:250px}
.nfc-pctcurve .ar{fill:rgba(var(--info-rgb),.18);animation:nfc-fade .8s ease-out}
.nfc-pctcurve .ln{fill:none;stroke:var(--info);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.3s ease-out forwards}
.nfc-pctcurve .mk{stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3}
.nfc-pctcurve text{fill:var(--muted);font-size:8px;font-weight:700;text-anchor:middle}
.nfc-pctcurve .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:2px}

/* 5 cumulative flow diagram */
.nfc-cfd{width:250px}
.nfc-cfd path{animation:nfc-fade .9s ease-out backwards}
.nfc-cfd .l3{fill:rgba(var(--info-rgb),.35)}
.nfc-cfd .l2{fill:rgba(var(--warn-rgb),.5)}
.nfc-cfd .l1{fill:var(--pos)}
.nfc-cfd .lg{display:flex;gap:12px;font-size:9px;color:var(--muted);margin-top:6px}
.nfc-cfd .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.nfc-cfd .d1{background:var(--pos)} .nfc-cfd .d2{background:rgba(var(--warn-rgb),.7)} .nfc-cfd .d3{background:rgba(var(--info-rgb),.4)}

/* 6 pareto */
.nfc-pareto{width:250px}
.nfc-pareto .bar{fill:var(--warn);animation:nfc-riseY .6s ease-out backwards;transform-box:fill-box;transform-origin:bottom}
.nfc-pareto .ref80{stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3}
.nfc-pareto .cum{fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.4s ease-out forwards}
.nfc-pareto .cap{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px}

/* 7 histogram */
.nfc-histo{width:240px}
.nfc-histo .bar{fill:var(--info);animation:nfc-riseY .5s ease-out backwards;transform-box:fill-box;transform-origin:bottom}
.nfc-histo .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px}

/* 8 moving average crossover */
.nfc-macross{width:250px}
.nfc-macross .fast{fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.2s ease-out forwards}
.nfc-macross .slow{fill:none;stroke:var(--info);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.2s ease-out forwards}
.nfc-macross .pt{fill:var(--pos);animation:nfc-pop .5s ease-out 1s backwards}
.nfc-macross .lg{display:flex;gap:10px;align-items:center;font-size:9px;color:var(--muted);margin-top:6px}
.nfc-macross .lg i{display:inline-block;width:14px;height:2px;margin-right:4px;vertical-align:2px}
.nfc-macross .lg i.fast{background:var(--accent)} .nfc-macross .lg i.slow{background:var(--info)}
.nfc-macross .tag{margin-left:auto;color:var(--pos);font-weight:700}

/* 9 anomaly timeline */
.nfc-anomaly{width:250px}
.nfc-anomaly .ln{fill:none;stroke:var(--muted);stroke-width:1.8;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.3s ease-out forwards}
.nfc-anomaly .anom{fill:var(--crit);animation:nfc-pop .5s ease-out 1s backwards}
.nfc-anomaly .drop{stroke:var(--crit);stroke-width:1;stroke-dasharray:2 3;opacity:.6}
.nfc-anomaly .sc{font-size:9px;color:var(--muted);margin-top:4px}

/* 10 geo density grid */
.nfc-geogrid{width:250px}
.nfc-geogrid .grid{display:grid;gap:3px}
.nfc-geogrid .grid i{aspect-ratio:1;border-radius:2px;background:var(--info);animation:nfc-pop .4s ease-out backwards}
.nfc-geogrid .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:6px}

/* 11 token cost meter */
.nfc-tokcost{width:240px}
.nfc-tokcost .hd{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px}
.nfc-tokcost .hd b{color:var(--ink);font-size:15px;font-weight:800}
.nfc-tokcost .track{position:relative;height:12px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);overflow:visible}
.nfc-tokcost .track i{position:absolute;top:0;bottom:0;animation:nfc-grow .9s ease-out}
.nfc-tokcost .track i:first-child{border-radius:6px 0 0 6px}
.nfc-tokcost .cap{position:absolute;top:-4px;width:2px;height:20px;background:var(--ink)}
.nfc-tokcost .lg{display:flex;gap:10px;font-size:9px;color:var(--muted);margin-top:8px}
.nfc-tokcost .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}

/* 12 latency percentile histogram */
.nfc-lathisto{width:240px}
.nfc-lathisto .bar{animation:nfc-riseY .5s ease-out backwards;transform-box:fill-box;transform-origin:bottom}
.nfc-lathisto .p95{stroke:var(--ink);stroke-width:1;stroke-dasharray:2 3}
.nfc-lathisto .p95t{fill:var(--muted);font-size:8px;font-weight:700;text-anchor:middle}
.nfc-lathisto .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px}

/* 13 uptime calendar */
.nfc-uptimecal{width:230px}
.nfc-uptimecal .hd{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px}
.nfc-uptimecal .hd b{color:var(--pos);font-weight:800}
.nfc-uptimecal .grid{display:grid;grid-template-columns:repeat(10,1fr);gap:3px}
.nfc-uptimecal .grid i{aspect-ratio:1;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:#08131f;animation:nfc-pop .4s ease-out backwards}
.nfc-uptimecal .up{background:var(--pos)} .nfc-uptimecal .part{background:var(--warn)} .nfc-uptimecal .down{background:var(--crit);color:#fff}
.nfc-uptimecal .lg{display:flex;gap:10px;font-size:9px;color:var(--muted);margin-top:7px}
.nfc-uptimecal .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}

/* 14 capacity forecast cone */
.nfc-forecast{width:250px}
.nfc-forecast .cone{fill:rgba(var(--info-rgb),.16);animation:nfc-fade 1s ease-out}
.nfc-forecast .hist{fill:none;stroke:var(--ink);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.1s ease-out forwards}
.nfc-forecast .now{stroke:var(--dim);stroke-width:1;stroke-dasharray:2 3}
.nfc-forecast .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px}

/* 15 budget vs actual variance */
.nfc-variance{width:250px;display:flex;flex-direction:column;gap:8px}
.nfc-variance .row{display:flex;align-items:center;gap:8px;font-size:10.5px}
.nfc-variance .k{width:70px;color:var(--muted);flex:none}
.nfc-variance .bars{position:relative;flex:1;height:14px}
.nfc-variance .bars i{position:absolute;left:0;height:5px;border-radius:3px;animation:nfc-grow .8s ease-out backwards}
.nfc-variance .bars .bud{top:0;background:var(--line)}
.nfc-variance .bars .act{top:7px}
.nfc-variance .bars .act.under{background:var(--pos)}
.nfc-variance .bars .act.over{background:var(--neg)}
.nfc-variance .v{width:40px;text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
.nfc-variance .v.over{color:var(--neg)} .nfc-variance .v.under{color:var(--pos)}
.nfc-variance .lg{display:flex;gap:10px;font-size:9px;color:var(--muted)}
.nfc-variance .lg i{display:inline-block;width:12px;height:4px;border-radius:2px;margin-right:4px;vertical-align:1px}
.nfc-variance .lg i.bud{background:var(--line)} .nfc-variance .lg i.act.under{background:var(--pos)} .nfc-variance .lg i.act.over{background:var(--neg)}

/* 16 churn risk scorecard */
.nfc-churn{width:250px}
.nfc-churn .top{display:flex;align-items:center;gap:10px}
.nfc-churn svg .trk{fill:none;stroke:var(--panel2)}
.nfc-churn svg .val{fill:none;stroke:var(--crit);stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.2s ease-out forwards}
.nfc-churn .sc-lbl b{font-size:26px;font-weight:800;color:var(--crit);display:block;line-height:1}
.nfc-churn .factors{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.nfc-churn .frow{display:flex;align-items:center;gap:6px;font-size:10px}
.nfc-churn .frow .k{width:100px;color:var(--muted);flex:none}
.nfc-churn .fbar{flex:1;height:6px;background:var(--panel2);border-radius:3px;overflow:hidden}
.nfc-churn .fbar i{display:block;height:100%;border-radius:3px;animation:nfc-grow .7s ease-out backwards}
.nfc-churn .fbar i.good{background:var(--pos)} .nfc-churn .fbar i.bad{background:var(--crit)}
.nfc-churn .fv{width:28px;text-align:right;font-weight:800}
.nfc-churn .fv.good{color:var(--pos)} .nfc-churn .fv.bad{color:var(--crit)}

/* 17 step conversion staircase */
.nfc-staircase{display:flex;align-items:flex-end;gap:6px}
.nfc-staircase .step{flex:1;background:linear-gradient(180deg,var(--accent),rgba(var(--accent-rgb),.4));border-radius:6px 6px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:6px;color:#08131f;animation:nfc-riseY .7s cubic-bezier(.22,1,.36,1) backwards;transform-origin:bottom}
.nfc-staircase .step b{font-size:14px;font-weight:800}
.nfc-staircase .step span{font-size:8px;font-weight:700;opacity:.8;text-align:center;padding:0 4px}

/* 18 service dependency mini-graph */
.nfc-depgraph .ed{stroke:var(--line);stroke-width:1.6;opacity:0;animation:nfc-fade .5s ease-out forwards}
.nfc-depgraph .nd{opacity:0;animation:nfc-pop .5s ease-out forwards}
.nfc-depgraph text{fill:var(--muted);font-size:8px;font-weight:700}

/* 19 weighted tag cloud */
.nfc-tagcloud{width:240px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline}
.nfc-tagcloud span{font-weight:800;animation:nfc-fade .5s ease-out backwards}

/* 20 100% stacked survey bar */
.nfc-stack100{width:250px}
.nfc-stack100 .bar{position:relative;height:22px;border-radius:6px;overflow:hidden;background:var(--panel2)}
.nfc-stack100 .bar i{position:absolute;top:0;bottom:0;animation:nfc-grow .9s ease-out backwards}
.nfc-stack100 .lg{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:9px;color:var(--muted);margin-top:8px}
.nfc-stack100 .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}

/* 21 small multiples sparkline grid */
.nfc-multispark{width:250px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px}
.nfc-multispark .cell{display:flex;flex-direction:column;gap:3px;animation:nfc-fade .5s ease-out backwards}
.nfc-multispark .k{font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px}
.nfc-multispark svg path{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1s ease-out forwards}

/* 22 hourly heat strip */
.nfc-heatstrip{width:250px}
.nfc-heatstrip .strip{display:flex;gap:2px;height:30px}
.nfc-heatstrip .strip i{flex:1;border-radius:2px;background:var(--warn);animation:nfc-pop .4s ease-out backwards}
.nfc-heatstrip .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px}

/* 23 live log tail viewer */
.nfc-logtail{width:260px;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;line-height:1.7}
.nfc-logtail .ln{display:flex;gap:7px;white-space:nowrap;opacity:0;animation:nfc-fade .35s ease-out forwards}
.nfc-logtail .t{color:var(--dim)}
.nfc-logtail .lvl{font-weight:800;width:32px;flex:none}
.nfc-logtail .lvl.ok{color:var(--pos)} .nfc-logtail .lvl.warn{color:var(--warn)} .nfc-logtail .lvl.err{color:var(--crit)}
.nfc-logtail .m{color:var(--ink);overflow:hidden;text-overflow:ellipsis}
.nfc-logtail .cursor{color:var(--accent);animation:nfc-blink 1s step-end infinite}

/* 24 service status matrix */
.nfc-statusmatrix{display:grid;gap:5px;font-size:9px;align-items:center}
.nfc-statusmatrix .cell{text-align:center;color:var(--muted)}
.nfc-statusmatrix .cell.hd{font-weight:700;color:var(--dim)}
.nfc-statusmatrix .cell.hd.row{text-align:right;padding-right:6px}
.nfc-statusmatrix .dot{width:16px;height:16px;border-radius:50%;margin:0 auto;animation:nfc-pop .4s ease-out backwards}
.nfc-statusmatrix .dot.ok{background:var(--pos)} .nfc-statusmatrix .dot.warn{background:var(--warn)} .nfc-statusmatrix .dot.down{background:var(--crit)}

/* 25 dual-axis rate combo */
.nfc-dualaxis{width:250px}
.nfc-dualaxis .bar{fill:rgba(var(--info-rgb),.55);animation:nfc-riseY .5s ease-out backwards;transform-box:fill-box;transform-origin:bottom}
.nfc-dualaxis .errln{fill:none;stroke:var(--crit);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.3s ease-out forwards}
.nfc-dualaxis .lg{display:flex;gap:12px;font-size:9px;color:var(--muted);margin-top:6px}
.nfc-dualaxis .lg i{display:inline-block;width:12px;height:3px;margin-right:4px;vertical-align:1px;border-radius:2px}
.nfc-dualaxis .lg i.bar{background:var(--info)} .nfc-dualaxis .lg i.errln{background:var(--crit)}

/* 26 deploy frequency trail */
.nfc-deploytrail{width:250px}
.nfc-deploytrail .trail{display:flex;gap:4px;align-items:flex-end;height:60px}
.nfc-deploytrail .day{flex:1;display:flex;flex-direction:column-reverse;gap:2px;align-items:center}
.nfc-deploytrail .day i{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:nfc-pop .35s ease-out backwards}
.nfc-deploytrail .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:6px}

/* 27 queue depth area + sla line */
.nfc-queuearea{width:250px}
.nfc-queuearea .ar{fill:rgba(var(--warn-rgb),.22);animation:nfc-fade .9s ease-out}
.nfc-queuearea .ln{fill:none;stroke:var(--warn);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.3s ease-out forwards}
.nfc-queuearea .sla{stroke:var(--crit);stroke-width:1.4;stroke-dasharray:4 3}
.nfc-queuearea .sc{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:4px}
.nfc-queuearea .tag{color:var(--crit);font-weight:700}

/* 28 circular polar sparkline */
.nfc-polarspark{width:150px;text-align:center}
.nfc-polarspark .ref{fill:none;stroke:var(--line);stroke-width:1;stroke-dasharray:2 3}
.nfc-polarspark .ln{fill:rgba(var(--accent-rgb),.16);stroke:var(--accent);stroke-width:2;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.6s ease-out forwards}

/* 29 signal strength meter */
.nfc-signalbars{text-align:center}
.nfc-signalbars .bars{display:flex;align-items:flex-end;gap:4px;height:60px;justify-content:center}
.nfc-signalbars .bars i{width:10px;border-radius:2px;background:var(--line);animation:nfc-riseY .5s ease-out backwards;transform-origin:bottom}
.nfc-signalbars .bars i.on{background:var(--pos)}

/* 30 heartbeat pulse monitor */
.nfc-heartbeat{width:250px;text-align:center}
.nfc-heartbeat svg{transform-origin:center;animation:nfc-beat 1.1s ease-in-out infinite}
.nfc-heartbeat .beat{fill:none;stroke:var(--pos);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dash 1.6s ease-out forwards}

/* 31 freshness countdown ring */
.nfc-freshring{position:relative;width:90px;height:90px}
.nfc-freshring .trk{fill:none;stroke:var(--panel2)}
.nfc-freshring .val{fill:none;stroke:var(--info);stroke-linecap:round;stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:nfc-dashto 1.2s ease-out forwards}
.nfc-freshring .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.nfc-freshring .ctr b{font-size:18px;font-weight:800}

/* 32 notched level dial */
.nfc-notchdial{position:relative;width:150px;text-align:center}
.nfc-notchdial svg{display:block;margin:0 auto}
.nfc-notchdial .seg{fill:none;stroke:var(--panel2);opacity:0;animation:nfc-fade .4s ease-out forwards}
.nfc-notchdial .seg.on{stroke:var(--accent)}
.nfc-notchdial .ctr{margin-top:-30px}
.nfc-notchdial .ctr b{font-size:16px;font-weight:800;display:block}

/* 33 alert severity ladder */
.nfc-sevladder{width:230px;display:flex;flex-direction:column;gap:7px}
.nfc-sevladder .rung{display:flex;align-items:center;gap:8px;font-size:10.5px}
.nfc-sevladder .k{width:40px;flex:none;font-weight:800}
.nfc-sevladder .bar{flex:1;height:10px;background:var(--panel2);border-radius:4px;overflow:hidden}
.nfc-sevladder .bar i{display:block;height:100%;border-radius:4px;animation:nfc-grow .7s ease-out backwards}
.nfc-sevladder .v{width:20px;text-align:right;font-weight:800;color:var(--ink)}

/* 34 version adoption bars */
.nfc-versionbars{width:250px}
.nfc-versionbars .bar{position:relative;height:22px;border-radius:6px;overflow:hidden;background:var(--panel2)}
.nfc-versionbars .bar i{position:absolute;top:0;bottom:0;animation:nfc-grow .9s ease-out backwards}
.nfc-versionbars .lg{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:9px;color:var(--muted);margin-top:8px}
.nfc-versionbars .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}

@media(prefers-reduced-motion:reduce){
  [class*="nfc-"],[class*="nfc-"] *{animation:none !important}
  [class*="nfc-"] .ln,[class*="nfc-"] .burn,[class*="nfc-"] .cum,[class*="nfc-"] .hist,[class*="nfc-"] .fast,[class*="nfc-"] .slow,[class*="nfc-"] .errln,[class*="nfc-"] .beat{stroke-dashoffset:0 !important}
  [class*="nfc-"] .val,[class*="nfc-"] .seg{stroke-dashoffset:var(--off) !important}
}
</style>`;

const body = `<!-- CHARTS \u00b7 NEW EFFECTS DRAFT (count: ${tiles.length}) -->\n` + tiles.join("\n") + "\n" + css + "\n";
writeFileSync(OUT, body);
console.log("Wrote " + tiles.length + " tiles to " + OUT);
