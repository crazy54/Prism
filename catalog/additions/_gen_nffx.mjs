/* Temp generator for additions/fx.json — nffx-* card FX set.
   Produces valid JSON via JSON.stringify. Deleted after run. */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------------- CSS ---------------- */
const css = [
"/* ===== NFFX — NEW card / element FX (color-aware via --c / --c-rgb) ===== */",
"/* Set --c + --c-rgb via a c-* class (c-crit/neg/warn/pos/info/accent), then add an nffx-* class. */",

"/* ---------- Borders & Edges ---------- */",
"@keyframes nffxSnake{to{transform:rotate(1turn)}}",
".nffx-snake-border{position:relative;border-radius:13px}",
".nffx-snake-border::before{content:'';position:absolute;inset:-2px;border-radius:inherit;background:conic-gradient(from 0deg,transparent 0 76%,var(--c) 86%,#fff 91%,var(--c) 96%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:2px;animation:nffxSnake 3.2s linear infinite;pointer-events:none}",

"@keyframes nffxHue{to{filter:hue-rotate(360deg)}}",
".nffx-gradient-frame{position:relative;border-radius:13px}",
".nffx-gradient-frame::before{content:'';position:absolute;inset:-2px;border-radius:inherit;background:linear-gradient(120deg,var(--c),#fff,var(--c),#fff,var(--c));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:2px;animation:nffxHue 6s linear infinite;pointer-events:none}",

"@keyframes nffxDashO{to{stroke-dashoffset:0}}",
".nffx-dash-orbit{position:relative}",
".nffx-dash-orbit svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}",
".nffx-dash-orbit rect{fill:none;stroke:var(--c);stroke-width:2;stroke-dasharray:40 22;stroke-dashoffset:248;animation:nffxDashO 4s linear infinite}",

"@keyframes nffxEdgeRun{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}",
".nffx-scan-frame{position:relative;overflow:hidden;border-radius:12px}",
".nffx-scan-frame::before,.nffx-scan-frame::after{content:'';position:absolute;left:0;height:2px;width:70%;background:linear-gradient(90deg,transparent,var(--c),transparent);animation:nffxEdgeRun 2.6s linear infinite;pointer-events:none}",
".nffx-scan-frame::before{top:0}",
".nffx-scan-frame::after{bottom:0;animation-delay:1.3s}",

"@keyframes nffxFocus{0%,100%{outline-offset:2px;outline-color:rgba(var(--c-rgb),.9)}50%{outline-offset:7px;outline-color:rgba(var(--c-rgb),.2)}}",
".nffx-focus-ring{border-radius:12px;outline:2px solid var(--c);animation:nffxFocus 1.9s ease-in-out infinite}",

"@keyframes nffxUnder{0%,100%{transform:scaleX(.18)}50%{transform:scaleX(1)}}",
".nffx-underbar{position:relative;overflow:hidden;border-radius:12px}",
".nffx-underbar::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--c);transform:scaleX(.18);transform-origin:center;animation:nffxUnder 2.6s ease-in-out infinite;box-shadow:0 0 8px rgba(var(--c-rgb),.6)}",

"@keyframes nffxSplit{0%,100%{transform:scaleY(.14)}50%{transform:scaleY(1)}}",
".nffx-split-edge{position:relative;border-radius:12px}",
".nffx-split-edge::before,.nffx-split-edge::after{content:'';position:absolute;top:0;bottom:0;width:3px;background:var(--c);transform:scaleY(.14);transform-origin:center;animation:nffxSplit 2.4s ease-in-out infinite;box-shadow:0 0 8px rgba(var(--c-rgb),.6);pointer-events:none}",
".nffx-split-edge::before{left:0}",
".nffx-split-edge::after{right:0}",

"@keyframes nffxBrk{0%,100%{opacity:.4}50%{opacity:1}}",
".nffx-corner-brackets{position:relative}",
".nffx-corner-brackets::before{content:'';position:absolute;inset:-4px;background:linear-gradient(var(--c),var(--c)) top left/16px 2px no-repeat,linear-gradient(var(--c),var(--c)) top left/2px 16px no-repeat,linear-gradient(var(--c),var(--c)) top right/16px 2px no-repeat,linear-gradient(var(--c),var(--c)) top right/2px 16px no-repeat,linear-gradient(var(--c),var(--c)) bottom left/16px 2px no-repeat,linear-gradient(var(--c),var(--c)) bottom left/2px 16px no-repeat,linear-gradient(var(--c),var(--c)) bottom right/16px 2px no-repeat,linear-gradient(var(--c),var(--c)) bottom right/2px 16px no-repeat;animation:nffxBrk 1.8s ease-in-out infinite;pointer-events:none}",

"/* ---------- Glow & Light ---------- */",
"@keyframes nffxHalo{0%,100%{box-shadow:0 0 6px rgba(var(--c-rgb),.25)}50%{box-shadow:0 0 26px 4px rgba(var(--c-rgb),.6)}}",
".nffx-halo-breathe{animation:nffxHalo 3.2s ease-in-out infinite;border-radius:12px}",

"@keyframes nffxNeonS{0%,19%,21%,55%,57%,100%{box-shadow:0 0 4px var(--c),0 0 13px rgba(var(--c-rgb),.7),inset 0 0 8px rgba(var(--c-rgb),.35)}20%,56%{box-shadow:none}}",
".nffx-neon-sign{border:1px solid var(--c);border-radius:12px;animation:nffxNeonS 3.4s linear infinite}",

"@keyframes nffxCandle{0%,100%{box-shadow:0 0 10px rgba(var(--c-rgb),.4);transform:translateY(0)}20%{box-shadow:0 0 16px rgba(var(--c-rgb),.6);transform:translateY(-.5px)}40%{box-shadow:0 0 8px rgba(var(--c-rgb),.35)}55%{box-shadow:0 0 18px rgba(var(--c-rgb),.65);transform:translateY(.5px)}75%{box-shadow:0 0 9px rgba(var(--c-rgb),.4)}}",
".nffx-candle{animation:nffxCandle 2.6s ease-in-out infinite;border-radius:12px}",

"@keyframes nffxRoam{0%{background-position:0% 0%}25%{background-position:100% 0%}50%{background-position:100% 100%}75%{background-position:0% 100%}100%{background-position:0% 0%}}",
".nffx-spot-roam{position:relative;overflow:hidden;border-radius:12px}",
".nffx-spot-roam::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(var(--c-rgb),.5),transparent 42%);background-size:180% 180%;animation:nffxRoam 6s ease-in-out infinite;pointer-events:none}",

"@keyframes nffxTintP{0%,100%{background-color:rgba(var(--c-rgb),.04)}50%{background-color:rgba(var(--c-rgb),.22)}}",
".nffx-tint-pulse{animation:nffxTintP 2.8s ease-in-out infinite;border-radius:12px}",

"@keyframes nffxAura{to{transform:rotate(1turn)}}",
".nffx-aura-spin{position:relative;overflow:hidden;border-radius:13px}",
".nffx-aura-spin::before{content:'';position:absolute;inset:-60%;background:conic-gradient(from 0deg,transparent,rgba(var(--c-rgb),.5),transparent 42%,rgba(var(--c-rgb),.3) 70%,transparent);filter:blur(6px);animation:nffxAura 5s linear infinite;pointer-events:none}",

"@keyframes nffxPing{0%{box-shadow:0 0 0 0 rgba(var(--c-rgb),.5)}100%{box-shadow:0 0 0 18px rgba(var(--c-rgb),0)}}",
".nffx-ping-dual{position:relative;border-radius:12px;animation:nffxPing 2s ease-out infinite}",
".nffx-ping-dual::after{content:'';position:absolute;inset:0;border-radius:inherit;animation:nffxPing 2s ease-out infinite 1s;pointer-events:none}",

"/* ---------- Sweeps & Sheens ---------- */",
"@keyframes nffxSheen{0%,72%,100%{background-position:-160% 0}20%{background-position:260% 0}}",
".nffx-sheen{position:relative;overflow:hidden}",
".nffx-sheen::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 42%,rgba(255,255,255,.45) 50%,transparent 58%);background-size:250% 100%;animation:nffxSheen 4s ease-in-out infinite;pointer-events:none}",

"@keyframes nffxShim{0%{background-position:-200% 0}100%{background-position:200% 0}}",
".nffx-shimmer-loop{position:relative;overflow:hidden}",
".nffx-shimmer-loop::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(var(--c-rgb),.22) 50%,transparent 70%);background-size:200% 100%;animation:nffxShim 2s linear infinite;pointer-events:none}",

"@keyframes nffxLBar{0%{left:-20%}100%{left:120%}}",
".nffx-lightbar{position:relative;overflow:hidden;border-radius:12px}",
".nffx-lightbar::after{content:'';position:absolute;top:0;bottom:0;width:16%;left:-20%;background:linear-gradient(90deg,transparent,rgba(var(--c-rgb),.5),transparent);animation:nffxLBar 2.8s linear infinite;pointer-events:none}",

"@keyframes nffxWash{0%{transform:translateX(-100%)}60%{transform:translateX(0)}100%{transform:translateX(100%)}}",
".nffx-wash{position:relative;overflow:hidden;border-radius:12px}",
".nffx-wash::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(var(--c-rgb),.3));animation:nffxWash 3s ease-in-out infinite;pointer-events:none}",

"@keyframes nffxHolo{0%,100%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(42deg)}}",
".nffx-holo{background:linear-gradient(135deg,rgba(var(--c-rgb),.16),rgba(255,255,255,.05),rgba(var(--c-rgb),.16))!important;animation:nffxHolo 4s ease-in-out infinite;border-radius:12px}",

"@keyframes nffxPrism{0%{background-position:-150% 0}100%{background-position:250% 0}}",
".nffx-prism-sweep{position:relative;overflow:hidden;border-radius:12px}",
".nffx-prism-sweep::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 34%,rgba(200,121,255,.35),rgba(68,147,248,.35),rgba(63,185,80,.35),rgba(255,153,0,.35),transparent 66%);background-size:250% 100%;mix-blend-mode:screen;animation:nffxPrism 3.2s linear infinite;pointer-events:none}",

"/* ---------- Glass & Material ---------- */",
".nffx-glass{backdrop-filter:blur(9px) saturate(1.5);-webkit-backdrop-filter:blur(9px) saturate(1.5);background:rgba(var(--c-rgb),.1)!important;border:1px solid rgba(var(--c-rgb),.28)!important;border-radius:13px}",

"@keyframes nffxGlassEdge{0%,100%{box-shadow:inset 0 0 0 1px rgba(var(--c-rgb),.25),0 0 10px rgba(var(--c-rgb),.15)}50%{box-shadow:inset 0 0 0 1px rgba(var(--c-rgb),.7),0 0 22px rgba(var(--c-rgb),.4)}}",
".nffx-glass-glow{backdrop-filter:blur(9px) saturate(1.4);-webkit-backdrop-filter:blur(9px) saturate(1.4);background:rgba(var(--c-rgb),.08)!important;border:1px solid transparent!important;border-radius:13px;animation:nffxGlassEdge 3s ease-in-out infinite}",

".nffx-frost-noise{position:relative;overflow:hidden;backdrop-filter:blur(11px) brightness(1.08);-webkit-backdrop-filter:blur(11px) brightness(1.08);background:rgba(255,255,255,.05)!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:13px}",
".nffx-frost-noise::after{content:'';position:absolute;inset:0;opacity:.08;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='nf'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23nf)'/%3E%3C/svg%3E\");pointer-events:none}",

"/* ---------- Noise & Texture ---------- */",
"@keyframes nffxGrain{0%,100%{transform:translate(0,0)}25%{transform:translate(-4%,3%)}50%{transform:translate(3%,-4%)}75%{transform:translate(-3%,-2%)}}",
".nffx-grain{position:relative;overflow:hidden;border-radius:12px}",
".nffx-grain::after{content:'';position:absolute;inset:-12%;width:124%;height:124%;opacity:.09;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='ng'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23ng)'/%3E%3C/svg%3E\");animation:nffxGrain 1.2s steps(4) infinite;pointer-events:none}",

"@keyframes nffxScanF{0%,95%,100%{opacity:.5}96%{opacity:.28}98%{opacity:.62}}",
".nffx-scanlines{position:relative;overflow:hidden;border-radius:12px}",
".nffx-scanlines::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px);animation:nffxScanF 4s linear infinite;pointer-events:none}",

"@keyframes nffxDotMove{to{background-position:14px 14px}}",
".nffx-dotfield{background-image:radial-gradient(circle,rgba(var(--c-rgb),.35) 1.2px,transparent 1.5px)!important;background-size:14px 14px!important;animation:nffxDotMove 3s linear infinite;border-radius:12px}",

"@keyframes nffxHatch{to{background-position:28px 0,28px 0}}",
".nffx-hatch{background-image:repeating-linear-gradient(45deg,rgba(var(--c-rgb),.12) 0 6px,transparent 6px 14px),repeating-linear-gradient(-45deg,rgba(var(--c-rgb),.12) 0 6px,transparent 6px 14px)!important;animation:nffxHatch 1.6s linear infinite;border-radius:12px}",

"/* ---------- Gradient Shifts ---------- */",
"@keyframes nffxPan{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}",
".nffx-gradient-pan{background:linear-gradient(90deg,rgba(var(--c-rgb),.05),rgba(var(--c-rgb),.28),rgba(var(--c-rgb),.05))!important;background-size:200% 100%;animation:nffxPan 5s ease infinite;border-radius:12px}",

"@keyframes nffxDuo{0%,100%{background-color:rgba(var(--c-rgb),.2)}50%{background-color:rgba(255,255,255,.06)}}",
".nffx-duotone{animation:nffxDuo 3.4s ease-in-out infinite;border-radius:12px}",

"@keyframes nffxMesh{0%,100%{background-position:0% 0%,100% 100%}50%{background-position:100% 50%,0% 50%}}",
".nffx-mesh{background-image:radial-gradient(circle at 20% 30%,rgba(var(--c-rgb),.3),transparent 40%),radial-gradient(circle at 80% 70%,rgba(var(--c-rgb),.22),transparent 45%)!important;background-size:180% 180%,180% 180%;animation:nffxMesh 7s ease-in-out infinite;border-radius:12px}",

"/* ---------- Hover: depth & parallax (pure CSS) ---------- */",
".nffx-parallax-hover{position:relative;overflow:hidden;border-radius:12px;transition:transform .3s ease}",
".nffx-parallax-hover::before{content:'';position:absolute;inset:-20%;background:radial-gradient(circle at 30% 30%,rgba(var(--c-rgb),.25),transparent 55%);transition:transform .4s ease;pointer-events:none}",
".nffx-parallax-hover:hover{transform:scale(1.02)}",
".nffx-parallax-hover:hover::before{transform:translate(8%,6%)}",

".nffx-tilt-shine-hover{position:relative;overflow:hidden;border-radius:12px;transition:transform .3s ease}",
".nffx-tilt-shine-hover::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.28) 50%,transparent 60%);background-size:250% 100%;background-position:-160% 0;transition:background-position .6s ease;pointer-events:none}",
".nffx-tilt-shine-hover:hover{transform:perspective(600px) rotateX(6deg) rotateY(-6deg)}",
".nffx-tilt-shine-hover:hover::after{background-position:260% 0}",

".nffx-lift-hover{transition:transform .25s ease,box-shadow .25s ease;border-radius:12px}",
".nffx-lift-hover:hover{transform:translateY(-6px);box-shadow:0 16px 32px rgba(0,0,0,.45),0 0 20px rgba(var(--c-rgb),.4)}",

".nffx-draw-hover{position:relative;border-radius:12px}",
".nffx-draw-hover::before{content:'';position:absolute;inset:0;border:2px solid var(--c);border-radius:inherit;clip-path:inset(0 100% 100% 0);transition:clip-path .5s ease;pointer-events:none}",
".nffx-draw-hover:hover::before{clip-path:inset(0 0 0 0)}",

".nffx-zoom-hover{overflow:hidden;border-radius:12px;transition:transform .3s ease,filter .3s ease}",
".nffx-zoom-hover:hover{transform:scale(1.05);filter:brightness(1.12) saturate(1.15)}",

"/* ---------- Particle-ish (pure CSS) ---------- */",
"@keyframes nffxOrbit{from{transform:rotate(0) translateX(52px) rotate(0)}to{transform:rotate(360deg) translateX(52px) rotate(-360deg)}}",
".nffx-orbit{position:relative;border-radius:12px}",
".nffx-orbit::after{content:'';position:absolute;top:50%;left:50%;width:8px;height:8px;margin:-4px;border-radius:50%;background:var(--c);box-shadow:0 0 10px 2px rgba(var(--c-rgb),.8);animation:nffxOrbit 3.4s linear infinite;pointer-events:none}",

"@keyframes nffxRise{0%{transform:translateY(0);opacity:0}18%{opacity:1}100%{transform:translateY(-42px);opacity:0}}",
".nffx-bubbles{position:relative;overflow:hidden;border-radius:12px}",
".nffx-bubbles::before,.nffx-bubbles::after{content:'';position:absolute;bottom:6px;width:6px;height:6px;border-radius:50%;background:rgba(var(--c-rgb),.7);box-shadow:0 0 8px rgba(var(--c-rgb),.6);animation:nffxRise 3s ease-in infinite;pointer-events:none}",
".nffx-bubbles::before{left:30%}",
".nffx-bubbles::after{left:64%;animation-delay:1.5s}",

"@keyframes nffxMotes{0%{transform:translateY(0)}100%{transform:translateY(-16px)}}",
".nffx-motes{position:relative;overflow:hidden;border-radius:12px}",
".nffx-motes::after{content:'';position:absolute;top:20%;left:10%;width:2px;height:2px;border-radius:50%;box-shadow:10px 4px rgba(var(--c-rgb),.7),40px 18px rgba(var(--c-rgb),.5),80px 6px rgba(var(--c-rgb),.6),120px 22px rgba(var(--c-rgb),.4),160px 10px rgba(var(--c-rgb),.6),200px 16px rgba(var(--c-rgb),.5),60px 30px rgba(var(--c-rgb),.4),140px 2px rgba(var(--c-rgb),.5);animation:nffxMotes 4s ease-in-out infinite alternate;pointer-events:none}",

"@keyframes nffxTarget{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(.9)}}",
".nffx-target{position:relative}",
".nffx-target::before{content:'';position:absolute;inset:-4px;background:linear-gradient(var(--c),var(--c)) center top/2px 10px no-repeat,linear-gradient(var(--c),var(--c)) center bottom/2px 10px no-repeat,linear-gradient(var(--c),var(--c)) left center/10px 2px no-repeat,linear-gradient(var(--c),var(--c)) right center/10px 2px no-repeat;animation:nffxTarget 1.8s ease-in-out infinite;pointer-events:none}",

"@media(prefers-reduced-motion:reduce){[class*=\"nffx-\"]{animation:none!important}[class*=\"nffx-\"]::before,[class*=\"nffx-\"]::after{animation:none!important}}",
].join("\n");

/* ---------------- Tiles ---------------- */
// [slug, cKey, el, inner, name, desc]
const D = [
  // Borders & Edges
  ["snake-border","accent","el-card",'<div class="n">LIVE</div><div class="l">Perimeter run</div>',"Snake Border","A single bright segment (white-hot tip) chases around the border loop. Techy, continuous frame for hero cards."],
  ["gradient-frame","info","el-card",'<div class="n">88%</div><div class="l">Coverage</div>',"Gradient Frame","A multi-hue border cycles its colors by rotating through the spectrum. Rich, premium framing that never sweeps or moves."],
  ["dash-orbit","crit","el-card",'<svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx="12"></rect></svg><div class="n">\u2620\ufe0f 1</div><div class="l">Incident open</div>',"Dash Orbit","Inline-SVG rounded rect with an even marching-dash stroke that travels the whole perimeter. Crisp at any size."],
  ["scan-frame","pos","el-card",'<div class="n">OK</div><div class="l">Systems green</div>',"Scan Frame","Thin light bars glide across the top and bottom edges, offset in time. Calm HUD-style framing."],
  ["focus-ring","info","el-kpi",'<div class="n">75%</div><div class="l">SLA met</div>',"Focus Ring","An outline pushes out and fades, then snaps back tight. Reads as a repeating \u201cfocus me\u201d cue without leaving the box."],
  ["underbar","accent","el-card",'<div class="n">Details</div><div class="l">Accent bar</div>',"Underbar Grow","A glowing accent bar at the bottom stretches out from center and contracts. Understated emphasis for cards and tabs."],
  ["split-edge","warn","el-card",'<div class="n">4</div><div class="l">Pending</div>',"Split Edges","Left and right side rails grow from the middle outward and back. Symmetric \u201cbracketing\u201d without covering content."],
  ["corner-brackets","info","el-kpi",'<div class="n">90%</div><div class="l">Locked on</div>',"Corner Brackets","Four L-shaped corner marks pulse together as a viewfinder frame. \u201cTargeting / selected\u201d feel; give it a little padding."],

  // Glow & Light
  ["halo-breathe","crit","el-card",'<div class="n">\u2620\ufe0f 1</div><div class="l">Critical</div>',"Halo Breathe","A soft outer glow expands and relaxes on a slow breath. The gentle default glow for critical cards and KPIs."],
  ["neon-sign","crit","el-badge",'\u2620\ufe0f CRITICAL',"Neon Sign","The whole box flickers like a buzzing neon sign, cutting out briefly. Retro-bar energy for badges and small cards."],
  ["candle","warn","el-card",'<div class="n">3</div><div class="l">Smoldering</div>',"Candle Flicker","An irregular warm flicker with a tiny drift, like a candle flame. Warmer and more organic than a mechanical pulse."],
  ["spot-roam","info","el-card",'<div class="n">21</div><div class="l">Cases open</div>',"Spot Roam","A soft radial hotspot wanders around the four corners. Feels like a light source moving behind the surface."],
  ["tint-pulse","pos","el-card",'<div class="n">GO</div><div class="l">Healthy</div>',"Tint Pulse","The fill color deepens and lightens on a steady beat. Low-alarm \u201cstill alive\u201d ambiance for panels."],
  ["aura-spin","crit","el-card",'<div class="n">LIVE</div><div class="l">Aura</div>',"Aura Spin","A soft, blurred colored aura rotates behind the content. Dreamy sci-fi energy; needs a solid background."],
  ["ping-dual","neg","el-card",'<div class="n">!</div><div class="l">Broadcast</div>',"Ping (dual)","Two expanding rings fire from the edge, offset by half a beat. Signals an event fanning out. One hero element only."],

  // Sweeps & Sheens
  ["sheen","accent","el-card",'<div class="n">PRO</div><div class="l">Premium</div>',"Gloss Sheen","A single white gloss streak crosses the surface, then a long rest. Polished, high-end product feel."],
  ["shimmer-loop","info","el-card",'<div class="n">\u2026</div><div class="l">Loading</div>',"Shimmer Loop","A continuous tinted shimmer band slides across \u2014 the classic loading / placeholder cue."],
  ["lightbar","info","el-card",'<div class="n">SCAN</div><div class="l">Sweeping</div>',"Light Bar","A vertical band of light sweeps left to right on repeat. Simple, readable \u201cprocessing / scanning\u201d motion."],
  ["wash","pos","el-card",'<div class="n">DONE</div><div class="l">Sync complete</div>',"Color Wash","A tint sweeps in from the left, settles, then continues off the far edge. A pass of progress across the card."],
  ["holo","crit","el-card",'<div class="n">HOLO</div><div class="l">Shifting</div>',"Holo Shift","A layered gradient gently rotates its hue back and forth. Iridescent, futuristic sheen for feature cards."],
  ["prism-sweep","accent","el-card",'<div class="n">NEW</div><div class="l">Spectrum</div>',"Prism Sweep","A soft rainbow band glides across in screen-blend. Celebratory, decorative \u2014 launches and highlights (fixed multi-color)."],

  // Glass & Material
  ["glass","crit","el-card",'Frosted glass tint',"Glass Tint","Frosted glass with blur, saturation, and a color-tinted pane. Modern and premium; needs texture behind it to shine."],
  ["glass-glow","info","el-card",'Glass with edge glow',"Glass Edge-Glow","Frosted glass whose inner edge brightens and dims on a slow pulse. A living, lit-rim glass surface."],
  ["frost-noise","info","el-card",'Frosted + grain',"Frost + Grain","Heavy frosted blur with a fine static SVG grain overlay. Cold, physical, tactile \u2014 overlays and modals."],

  // Noise & Texture
  ["grain","warn","el-card",'<div class="n">FILM</div><div class="l">Grain</div>',"Film Grain","An animated fractal-noise overlay jitters for a film / analog texture. Adds physical life to flat panels."],
  ["scanlines","pos","el-card",'<div class="n">&gt;_</div><div class="l">Terminal</div>',"CRT Scanlines","Fine horizontal scanlines with an occasional flicker. Retro terminal / hacker aesthetic on any solid card."],
  ["dotfield","crit","el-card",'<div class="n">GRID</div><div class="l">Dot field</div>',"Dot Field","A dotted grid pattern slowly drifts diagonally. Subtle moving texture for backgrounds and panels."],
  ["hatch","accent","el-card",'<div class="n">WIP</div><div class="l">Cross-hatch</div>',"Cross-Hatch","A moving cross-hatch weave of diagonal lines. \u201cWork in progress / hazard zone\u201d texture with motion."],

  // Gradient Shifts
  ["gradient-pan","info","el-card",'<div class="n">$2.4M</div><div class="l">Pipeline</div>',"Gradient Pan","A horizontal color gradient slides side to side. Low-urgency ambient wash for large cards."],
  ["duotone","warn","el-card",'<div class="n">2</div><div class="l">Duotone</div>',"Duotone Breathe","The fill crossfades between a color tint and a neutral wash. A two-tone breathing shift, distinct from a single-color pulse."],
  ["mesh","crit","el-card",'<div class="n">MESH</div><div class="l">Drifting</div>',"Gradient Mesh","Two soft radial color blobs drift and cross like a gradient mesh. Organic, moody backdrop for hero cards."],

  // Hover: depth & parallax
  ["parallax-hover","info","el-card",'<div class="n">\u2194</div><div class="l">Hover: parallax</div>',"Parallax (hover)","On hover the card scales up while its inner light layer shifts \u2014 a subtle depth / parallax offset. Pure CSS."],
  ["tilt-shine-hover","accent","el-card",'<div class="n">3D</div><div class="l">Hover: tilt+shine</div>',"Tilt + Shine (hover)","On hover the card tips in 3D perspective and a gloss streak sweeps across at the same time."],
  ["lift-hover","pos","el-card",'<div class="n">\u2191</div><div class="l">Hover: lift</div>',"Lift (hover)","On hover the card rises with a deep shadow plus a colored glow. Interactive list / grid affordance."],
  ["draw-hover","neg","el-card",'<div class="n">!</div><div class="l">Hover: draw</div>',"Border Draw (hover)","On hover a border draws itself in from the top-left corner around the whole card. Crisp reveal on interaction."],
  ["zoom-hover","warn","el-card",'<div class="n">+</div><div class="l">Hover: zoom</div>',"Zoom (hover)","On hover the card scales up and gains brightness + saturation. Gallery / thumbnail emphasis."],

  // Particle-ish
  ["orbit","accent","el-kpi",'<div class="n">99.9%</div><div class="l">Uptime</div>',"Orbit Dot","A glowing dot circles the element on a fixed orbit. Alive, satellite-like \u2014 great for \u201chealthy / live\u201d status."],
  ["bubbles","info","el-card",'<div class="n">O2</div><div class="l">Rising</div>',"Rising Bubbles","Small glowing dots rise and fade from the base, staggered. Fluid, effervescent motion for status cards."],
  ["motes","pos","el-card",'<div class="n">\u2727</div><div class="l">Dust motes</div>',"Drift Motes","A field of tiny dust motes drifts slowly upward. Soft, atmospheric sparkle without any emoji glyphs."],
  ["target","crit","el-kpi",'<div class="n">LOCK</div><div class="l">Acquired</div>',"Target Ticks","Crosshair ticks at the mid-points of each edge pulse in and out. \u201cLocked on / watch this\u201d without corner brackets."],
];

const esc = (s) => s; // content already safe for single-quote data-snip
const tiles = D.map(([slug,cKey,el,inner,name,desc]) => {
  const cls = `${el} c-${cKey} nffx-${slug}`;
  const minh = (el === "el-card" || el === "el-kpi") ? ' style="min-height:64px"' : "";
  const snip = `class="${cls}"`;
  return `<div class="tile is-new" data-fx-id="fx-${slug}" data-c="${cKey}"><div class="stage"><div class="${cls}"${minh}>${inner}</div></div><div class="meta"><div class="nm">${name}</div><span class="ref">.nffx-${slug}</span><div class="desc">${desc}</div><div class="row"><button class="copy" data-snip='${snip}'>Copy snippet</button></div></div></div>`;
});

const out = {
  gallery: "fx",
  sectionLabel: "\u2726 New \u2014 FX Store",
  containerClass: "gallery",
  css,
  tiles,
};

writeFileSync(resolve(HERE, "fx.json"), JSON.stringify(out, null, 2));
console.log("wrote fx.json:", tiles.length, "tiles");
