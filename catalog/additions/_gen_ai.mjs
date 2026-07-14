import { writeFileSync } from "node:fs";

// ---- CSS rules (namespaced nfa-) ----
const css = [];
// ---- tiles ----
const fx = [];
function add(id, name, color, body, cap, wide = false) {
  fx.push({ id, name, color, body, cap, wide });
}

/* =========================================================
   1. TOKEN STREAM (staggered fade-in tokens)
   ========================================================= */
css.push(
`.nfa-tstream{display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start;width:100%;max-width:250px;min-height:64px}`,
`.nfa-tstream .tk{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:5px;background:rgba(var(--info-rgb),.12);border:1px solid rgba(var(--info-rgb),.4);color:var(--info);opacity:0;transform:translateY(4px);animation:nfaTok 3.2s ease-in-out infinite}`,
`@keyframes nfaTok{0%,100%{opacity:0;transform:translateY(4px)}8%,85%{opacity:1;transform:translateY(0)}}`
);
add("ai-token-stream-live","Token Stream","info",
`<div class="nfa-tstream">${["The","model","emits","one","token","per","step","→","streamed","to","the","client"].map((t,i)=>`<span class="tk" style="animation-delay:${(i*0.18).toFixed(2)}s">${t}</span>`).join("")}</div>`,
"Decoded tokens fade in one at a time, left to right, the way a streamed completion fills the viewport.");

/* =========================================================
   2. TYPEWRITER CARET
   ========================================================= */
css.push(
`.nfa-typwrap{width:100%;max-width:250px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--ink)}`,
`.nfa-typ{display:inline-block;overflow:hidden;white-space:nowrap;border-right:2px solid var(--pos);width:0;vertical-align:bottom;animation:nfaType 4s steps(34) infinite,nfaCaret .7s step-end infinite}`,
`@keyframes nfaType{0%{width:0}60%,100%{width:22ch}}`,
`@keyframes nfaCaret{0%,100%{border-color:var(--pos)}50%{border-color:transparent}}`
);
add("ai-typewriter-caret","Typewriter","pos",
`<div class="nfa-typwrap"><span class="nfa-typ">Generating response…</span></div>`,
"A blinking caret reveals characters left-to-right — the classic single-line completion tell.");

/* =========================================================
   3. THINKING DOTS (bounce)
   ========================================================= */
css.push(
`.nfa-think{display:flex;align-items:center;gap:11px;font-size:13px;font-weight:600;color:var(--muted)}`,
`.nfa-think .d{display:inline-flex;gap:6px}`,
`.nfa-think .d i{width:9px;height:9px;border-radius:50%;background:var(--crit);box-shadow:0 0 8px rgba(var(--crit-rgb),.6);animation:nfaBob 1.3s ease-in-out infinite}`,
`.nfa-think .d i:nth-child(2){animation-delay:.16s}.nfa-think .d i:nth-child(3){animation-delay:.32s}`,
`@keyframes nfaBob{0%,70%,100%{transform:translateY(0);opacity:.4}35%{transform:translateY(-8px);opacity:1}}`
);
add("ai-thinking-dots","Thinking","crit",
`<div class="nfa-think"><span>Thinking</span><span class="d"><i></i><i></i><i></i></span></div>`,
"Three dots bob in sequence beside a label — the universal “assistant is composing” cue.");

/* =========================================================
   4. REASONING TRACE (rolling highlighted steps)
   ========================================================= */
css.push(
`.nfa-rtrace{width:100%;display:flex;flex-direction:column;gap:6px;font-size:12px}`,
`.nfa-rtrace .r{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);animation:nfaTraceHi 6s ease-in-out infinite}`,
`.nfa-rtrace .r:nth-child(2){animation-delay:1.5s}.nfa-rtrace .r:nth-child(3){animation-delay:3s}.nfa-rtrace .r:nth-child(4){animation-delay:4.5s}`,
`.nfa-rtrace .r .n{width:16px;height:16px;flex:0 0 auto;border-radius:5px;background:rgba(var(--crit-rgb),.2);border:1px solid rgba(var(--crit-rgb),.5);color:var(--crit);font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center}`,
`@keyframes nfaTraceHi{0%,100%{border-color:var(--line);color:var(--muted);background:var(--panel2)}12%,20%{border-color:var(--crit);color:var(--ink);background:rgba(var(--crit-rgb),.1)}}`
);
add("ai-reasoning-trace","Reasoning Trace","crit",
`<div class="nfa-rtrace"><div class="r"><span class="n">1</span>Decompose the question</div><div class="r"><span class="n">2</span>Recall relevant facts</div><div class="r"><span class="n">3</span>Weigh candidate answers</div><div class="r"><span class="n">4</span>Commit to a response</div></div>`,
"Each hidden reasoning step lights up in turn — a peek at extended chain-of-thought.", true);

/* =========================================================
   5. TOOL-CALL FAN
   ========================================================= */
css.push(
`.nfa-fan{position:relative;width:220px;height:120px;display:flex;align-items:center;justify-content:center}`,
`.nfa-fan .hub{position:absolute;width:44px;height:44px;border-radius:12px;background:rgba(var(--accent-rgb),.15);border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;z-index:3;box-shadow:0 0 14px rgba(var(--accent-rgb),.4)}`,
`.nfa-fan .tc{position:absolute;left:50%;top:50%;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;font-weight:700;padding:4px 8px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);transform:translate(-50%,-50%);opacity:0;animation:nfaFan 3.6s ease-in-out infinite}`,
`.nfa-fan .tc:nth-child(2){--tx:-92px;--ty:-34px;animation-delay:.1s}`,
`.nfa-fan .tc:nth-child(3){--tx:92px;--ty:-34px;animation-delay:.35s}`,
`.nfa-fan .tc:nth-child(4){--tx:-92px;--ty:34px;animation-delay:.6s}`,
`.nfa-fan .tc:nth-child(5){--tx:92px;--ty:34px;animation-delay:.85s}`,
`@keyframes nfaFan{0%,100%{opacity:0;transform:translate(-50%,-50%)}18%,80%{opacity:1;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty)))}}`
);
add("ai-tool-call-fan","Tool-Call Fan","accent",
`<div class="nfa-fan"><span class="tc">search()</span><span class="tc">read_file()</span><span class="tc">run_sql()</span><span class="tc">fetch()</span><span class="hub">🛠</span></div>`,
"The agent fans out parallel tool invocations from a central hub before gathering results.", true);

/* =========================================================
   6. FUNCTION ARGS STREAM (JSON typing)
   ========================================================= */
css.push(
`.nfa-args{width:100%;font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.8;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--ink)}`,
`.nfa-args .k{color:var(--info)}.nfa-args .s{color:var(--pos)}.nfa-args .p{color:var(--muted)}`,
`.nfa-args .ln{overflow:hidden;white-space:nowrap;width:0;animation:nfaArgLn .5s ease-out forwards}`,
`.nfa-args .ln:nth-child(2){animation-delay:.5s}.nfa-args .ln:nth-child(3){animation-delay:1s}.nfa-args .ln:nth-child(4){animation-delay:1.5s}.nfa-args .ln:nth-child(5){animation-delay:2s}`,
`@keyframes nfaArgLn{to{width:100%}}`
);
add("ai-function-args","Function Args","info",
`<div class="nfa-args"><div class="ln"><span class="p">{</span></div><div class="ln">&nbsp;&nbsp;<span class="k">"tool"</span>: <span class="s">"get_weather"</span>,</div><div class="ln">&nbsp;&nbsp;<span class="k">"city"</span>: <span class="s">"Seattle"</span>,</div><div class="ln">&nbsp;&nbsp;<span class="k">"unit"</span>: <span class="s">"celsius"</span></div><div class="ln"><span class="p">}</span></div></div>`,
"A structured function call assembles line by line as the model emits valid argument JSON.");

/* =========================================================
   7. AGENT SWARM (orbiting workers)
   ========================================================= */
css.push(
`.nfa-swarm{position:relative;width:180px;height:140px}`,
`.nfa-swarm .core{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,var(--crit) 55%);box-shadow:0 0 18px rgba(var(--crit-rgb),.6);z-index:3}`,
`.nfa-swarm .w{position:absolute;top:50%;left:50%;width:11px;height:11px;margin:-5.5px;border-radius:50%;background:var(--wc,var(--accent));box-shadow:0 0 9px var(--wc,var(--accent));transform-origin:0 0;animation:nfaSwarm linear infinite}`,
`.nfa-swarm .w1{--wc:var(--info);animation-duration:3.4s;transform:rotate(0deg) translateX(48px)}`,
`.nfa-swarm .w2{--wc:var(--pos);animation-duration:4.6s;transform:rotate(120deg) translateX(58px)}`,
`.nfa-swarm .w3{--wc:var(--accent);animation-duration:5.5s;transform:rotate(240deg) translateX(66px)}`,
`.nfa-swarm .w4{--wc:var(--warn);animation-duration:6.4s;transform:rotate(60deg) translateX(52px)}`,
`@keyframes nfaSwarm{to{transform:rotate(1turn) translateX(var(--r,56px))}}`
);
add("ai-agent-swarm","Agent Swarm","crit",
`<div class="nfa-swarm"><span class="core"></span><span class="w w1" style="--r:48px"></span><span class="w w2" style="--r:58px"></span><span class="w w3" style="--r:66px"></span><span class="w w4" style="--r:52px"></span></div>`,
"A coordinator holds the center while worker agents orbit, each on its own cadence.");

/* =========================================================
   8. AGENT HANDOFF
   ========================================================= */
css.push(
`.nfa-hoff{position:relative;width:240px;height:70px;display:flex;align-items:center;justify-content:space-between}`,
`.nfa-hoff .ag{width:58px;height:58px;border-radius:14px;background:var(--panel2);border:2px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:18px;z-index:2}`,
`.nfa-hoff .ag .l{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}`,
`.nfa-hoff .ag.a1{animation:nfaHoffA 3s ease-in-out infinite}`,
`.nfa-hoff .ag.a2{animation:nfaHoffB 3s ease-in-out infinite}`,
`.nfa-hoff .wire{position:absolute;left:58px;right:58px;top:50%;height:2px;background:var(--line);transform:translateY(-50%)}`,
`.nfa-hoff .wire .pk{position:absolute;top:-4px;left:0;width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 9px var(--accent);animation:nfaHoffPk 3s ease-in-out infinite}`,
`@keyframes nfaHoffPk{0%,100%{left:0;opacity:0}12%{opacity:1}50%{left:calc(100% - 10px);opacity:1}62%,100%{left:calc(100% - 10px);opacity:0}}`,
`@keyframes nfaHoffA{0%,45%{border-color:var(--accent);box-shadow:0 0 14px rgba(var(--accent-rgb),.4)}55%,100%{border-color:var(--line);box-shadow:none}}`,
`@keyframes nfaHoffB{0%,50%{border-color:var(--line);box-shadow:none}62%,100%{border-color:var(--accent);box-shadow:0 0 14px rgba(var(--accent-rgb),.4)}}`
);
add("ai-agent-handoff","Agent Handoff","accent",
`<div class="nfa-hoff"><div class="ag a1">🧭<span class="l">Planner</span></div><div class="wire"><span class="pk"></span></div><div class="ag a2">⚙️<span class="l">Executor</span></div></div>`,
"Control passes from planner to executor — a context packet slides across the wire on handoff.", true);

/* =========================================================
   9. CONTEXT WINDOW METER
   ========================================================= */
css.push(
`.nfa-ctx{width:100%;display:flex;flex-direction:column;gap:9px}`,
`.nfa-ctx .bar{height:24px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);display:flex;overflow:hidden}`,
`.nfa-ctx .bar span{height:100%;animation:nfaCtxGrow 3s ease-out forwards}`,
`.nfa-ctx .lg{display:flex;gap:14px;font-size:10px;color:var(--muted);flex-wrap:wrap}`,
`.nfa-ctx .lg b{display:inline-flex;align-items:center;gap:5px;font-weight:600}`,
`.nfa-ctx .lg i{width:9px;height:9px;border-radius:2px}`,
`@keyframes nfaCtxGrow{from{width:0}to{width:var(--w)}}`
);
add("ai-context-window","Context Window","info",
`<div class="nfa-ctx"><div class="bar"><span style="--w:34%;background:var(--info);animation-delay:0s"></span><span style="--w:26%;background:var(--crit);animation-delay:.4s"></span><span style="--w:18%;background:var(--accent);animation-delay:.8s"></span></div><div class="lg"><b><i style="background:var(--info)"></i>System</b><b><i style="background:var(--crit)"></i>History</b><b><i style="background:var(--accent)"></i>Query</b><b><i style="background:var(--panel2)"></i>Free</b></div></div>`,
"Segments grow to show how the prompt, history, and system tokens fill the finite context window.", true);

/* =========================================================
   10. LATENCY PULSE (ping + ms)
   ========================================================= */
css.push(
`.nfa-lat{display:flex;flex-direction:column;align-items:center;gap:12px}`,
`.nfa-lat .ring{position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center}`,
`.nfa-lat .ring::before,.nfa-lat .ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--warn);animation:nfaLatPing 1.8s ease-out infinite}`,
`.nfa-lat .ring::after{animation-delay:.9s}`,
`.nfa-lat .ring b{font-size:13px;font-weight:800;color:var(--warn)}`,
`.nfa-lat .ms{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted)}`,
`.nfa-lat .ms b{color:var(--ink)}`,
`@keyframes nfaLatPing{0%{transform:scale(.55);opacity:1}100%{transform:scale(1.35);opacity:0}}`
);
add("ai-latency-pulse","Latency","warn",
`<div class="nfa-lat"><div class="ring"><b>⚡</b></div><div class="ms">first token · <b>412ms</b></div></div>`,
"Expanding rings measure the wait — time-to-first-token pinging outward from the request.");

/* =========================================================
   11. THROUGHPUT BARS (tok/s equalizer)
   ========================================================= */
css.push(
`.nfa-thru{display:flex;flex-direction:column;align-items:center;gap:12px}`,
`.nfa-thru .eq{display:flex;align-items:flex-end;gap:4px;height:48px}`,
`.nfa-thru .eq i{width:7px;border-radius:3px;background:linear-gradient(180deg,var(--pos),rgba(var(--pos-rgb),.3));animation:nfaThru 1.1s ease-in-out infinite}`,
`.nfa-thru .eq i:nth-child(2){animation-delay:.1s}.nfa-thru .eq i:nth-child(3){animation-delay:.2s}.nfa-thru .eq i:nth-child(4){animation-delay:.3s}.nfa-thru .eq i:nth-child(5){animation-delay:.4s}.nfa-thru .eq i:nth-child(6){animation-delay:.5s}`,
`.nfa-thru .rd{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--pos)}`,
`@keyframes nfaThru{0%,100%{height:10px}50%{height:48px}}`
);
add("ai-throughput","Throughput","pos",
`<div class="nfa-thru"><div class="eq"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="rd">147 tok/s</div></div>`,
"A live meter of decode speed — bars dance in proportion to tokens flowing per second.");

/* =========================================================
   12. GUARDRAIL SHIELD (scan + checks)
   ========================================================= */
css.push(
`.nfa-guard{position:relative;width:88px;height:96px;display:flex;align-items:center;justify-content:center}`,
`.nfa-guard svg{width:88px;height:96px}`,
`.nfa-guard .sh{fill:rgba(var(--pos-rgb),.1);stroke:var(--pos);stroke-width:2}`,
`.nfa-guard .beam{position:absolute;left:8px;right:8px;height:14px;background:linear-gradient(180deg,transparent,rgba(var(--pos-rgb),.55),transparent);border-radius:4px;animation:nfaGuardScan 2.2s ease-in-out infinite}`,
`.nfa-guard .ck{position:absolute;font-size:26px;color:var(--pos);text-shadow:0 0 10px rgba(var(--pos-rgb),.7);animation:nfaGuardCk 2.2s ease-in-out infinite}`,
`@keyframes nfaGuardScan{0%,100%{top:8px;opacity:.3}50%{top:70px;opacity:1}}`,
`@keyframes nfaGuardCk{0%,55%{opacity:0;transform:scale(.5)}70%,100%{opacity:1;transform:scale(1)}}`
);
add("ai-guardrail-shield","Guardrail","pos",
`<div class="nfa-guard"><svg viewBox="0 0 88 96"><path class="sh" d="M44 4 L82 18 V50 C82 74 64 88 44 92 C24 88 6 74 6 50 V18 Z"/></svg><span class="beam"></span><span class="ck">✓</span></div>`,
"A safety shield sweeps the response top to bottom, then clears it — output passed the guardrail.");

/* =========================================================
   13. SAFETY GATE (rows pass/block)
   ========================================================= */
css.push(
`.nfa-gate{width:100%;display:flex;flex-direction:column;gap:6px}`,
`.nfa-gate .g{display:flex;align-items:center;gap:9px;font-size:11.5px;padding:7px 10px;border-radius:8px;background:var(--panel2);border:1px solid var(--line)}`,
`.nfa-gate .g .i{width:16px;height:16px;flex:0 0 auto;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}`,
`.nfa-gate .g.ok{color:#bff0c8}.nfa-gate .g.ok .i{background:var(--pos);color:#06210c}`,
`.nfa-gate .g.blk{color:#ffb3ae}.nfa-gate .g.blk .i{background:var(--neg);color:#2a0806}`,
`.nfa-gate .g.scan .i{border:1px solid var(--warn);animation:nfaGateBl .8s ease-in-out infinite}`,
`.nfa-gate .g .t{margin-left:auto;font-size:9px;color:var(--dim)}`,
`@keyframes nfaGateBl{0%,100%{opacity:1}50%{opacity:.25}}`
);
add("ai-safety-gate","Safety Gate","neg",
`<div class="nfa-gate"><div class="g ok"><span class="i">✓</span>Toxicity filter<span class="t">pass</span></div><div class="g ok"><span class="i">✓</span>PII detection<span class="t">pass</span></div><div class="g scan"><span class="i">•</span>Jailbreak probe<span class="t">scanning</span></div><div class="g blk"><span class="i">×</span>Unsafe code<span class="t">blocked</span></div></div>`,
"Layered safety classifiers report verdicts — some pass, one flags and blocks the output.", true);

/* =========================================================
   14. VOICE WAVEFORM
   ========================================================= */
css.push(
`.nfa-voice{display:flex;align-items:center;gap:3px;height:52px}`,
`.nfa-voice i{width:4px;border-radius:3px;background:var(--info);animation:nfaVoice 1.1s ease-in-out infinite alternate}`,
`.nfa-voice i:nth-child(odd){background:var(--crit)}`,
`@keyframes nfaVoice{from{height:6px;opacity:.4}to{height:48px;opacity:1}}`
);
add("ai-voice-waveform","Voice Waveform","info",
`<div class="nfa-voice">${Array.from({length:15}).map((_,i)=>`<i style="animation-delay:${(i*0.07).toFixed(2)}s"></i>`).join("")}</div>`,
"A symmetric waveform reacts to speech — live audio in or synthesized voice out.");

/* =========================================================
   15. PLAN RUNNER (checklist ticking)
   ========================================================= */
css.push(
`.nfa-plan{width:100%;display:flex;flex-direction:column;gap:7px;font-size:12px}`,
`.nfa-plan .p{display:flex;align-items:center;gap:9px;color:var(--muted)}`,
`.nfa-plan .p .bx{width:16px;height:16px;flex:0 0 auto;border-radius:5px;border:2px solid var(--line);position:relative}`,
`.nfa-plan .p .bx::after{content:"✓";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#06210c;opacity:0}`,
`.nfa-plan .p:nth-child(1){animation:nfaPlanTxt 5s infinite}.nfa-plan .p:nth-child(2){animation:nfaPlanTxt 5s infinite 1.2s}.nfa-plan .p:nth-child(3){animation:nfaPlanTxt 5s infinite 2.4s}.nfa-plan .p:nth-child(4){animation:nfaPlanTxt 5s infinite 3.6s}`,
`@keyframes nfaPlanTxt{0%,18%{color:var(--muted)}24%,100%{color:var(--ink)}}`,
`.nfa-plan .p:nth-child(1) .bx{animation:nfaPlanBox 5s infinite}`,
`.nfa-plan .p:nth-child(2) .bx{animation:nfaPlanBox 5s infinite 1.2s}`,
`.nfa-plan .p:nth-child(3) .bx{animation:nfaPlanBox 5s infinite 2.4s}`,
`.nfa-plan .p:nth-child(4) .bx{animation:nfaPlanBox 5s infinite 3.6s}`,
`.nfa-plan .p:nth-child(1) .bx::after,.nfa-plan .p:nth-child(2) .bx::after,.nfa-plan .p:nth-child(3) .bx::after,.nfa-plan .p:nth-child(4) .bx::after{animation:nfaPlanCk 5s infinite}`,
`.nfa-plan .p:nth-child(2) .bx::after{animation-delay:1.2s}.nfa-plan .p:nth-child(3) .bx::after{animation-delay:2.4s}.nfa-plan .p:nth-child(4) .bx::after{animation-delay:3.6s}`,
`@keyframes nfaPlanBox{0%,15%{background:transparent;border-color:var(--line)}22%,100%{background:var(--accent);border-color:var(--accent)}}`,
`@keyframes nfaPlanCk{0%,15%{opacity:0}22%,100%{opacity:1}}`
);
add("ai-plan-runner","Plan Runner","accent",
`<div class="nfa-plan"><div class="p"><span class="bx"></span>Read the ticket</div><div class="p"><span class="bx"></span>Locate the module</div><div class="p"><span class="bx"></span>Apply the patch</div><div class="p"><span class="bx"></span>Run the tests</div></div>`,
"An agent works a checklist top to bottom, ticking each subtask as it completes.", true);

/* ---- MORE EFFECTS APPENDED BELOW ---- */

/* 16. MEMORY WRITE (cells writing) */
css.push(
`.nfa-mem{display:flex;flex-direction:column;gap:8px;align-items:center}`,
`.nfa-mem .lbl{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`.nfa-mem .cells{display:grid;grid-template-columns:repeat(8,15px);gap:5px}`,
`.nfa-mem .cells i{width:15px;height:15px;border-radius:3px;background:var(--panel2);border:1px solid var(--line);animation:nfaMemW 3.4s ease-in-out infinite}`,
`@keyframes nfaMemW{0%,100%{background:var(--panel2);border-color:var(--line);box-shadow:none}45%,60%{background:rgba(var(--crit-rgb),.5);border-color:var(--crit);box-shadow:0 0 8px rgba(var(--crit-rgb),.5)}}`
);
add("ai-memory-write","Memory Write","crit",
`<div class="nfa-mem"><div class="lbl">writing → long-term store</div><div class="cells">${Array.from({length:16}).map((_,i)=>`<i style="animation-delay:${(i*0.12).toFixed(2)}s"></i>`).join("")}</div></div>`,
"Facts commit to memory — cells light in sequence as the agent persists what it learned.");

/* 17. EMBEDDING SCATTER */
css.push(
`.nfa-emb{position:relative;width:180px;height:120px;border:1px solid var(--line);border-radius:10px;background:radial-gradient(circle at 50% 50%,rgba(var(--info-rgb),.06),transparent 70%);overflow:hidden}`,
`.nfa-emb i{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--info);box-shadow:0 0 7px rgba(var(--info-rgb),.7);animation:nfaEmb 3s ease-in-out infinite}`,
`@keyframes nfaEmb{0%,100%{opacity:.3;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}`
);
{
  const pts=[[18,22],[40,60],[62,30],[80,72],[30,88],[55,45],[72,55],[88,28],[24,52],[46,20],[68,84],[15,74],[84,50],[36,38],[58,72]];
  add("ai-embedding-scatter","Embedding Space","info",
  `<div class="nfa-emb">${pts.map((p,i)=>`<i style="left:${p[0]}%;top:${p[1]}%;animation-delay:${(i*0.18).toFixed(2)}s"></i>`).join("")}</div>`,
  "Text mapped to vectors — points twinkle across a projected embedding plane.");
}

/* 18. VECTOR SEARCH (query links to neighbors) */
css.push(
`.nfa-vsearch{position:relative;width:190px;height:120px;border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden}`,
`.nfa-vsearch .q{position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent);z-index:3}`,
`.nfa-vsearch .n{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--dim);animation:nfaVn 2.6s ease-in-out infinite}`,
`.nfa-vsearch .n.hit{background:var(--info);box-shadow:0 0 9px var(--info)}`,
`.nfa-vsearch .ln{position:absolute;left:50%;top:50%;height:1px;background:linear-gradient(90deg,rgba(var(--info-rgb),.8),transparent);transform-origin:left center;animation:nfaVln 2.6s ease-in-out infinite}`,
`@keyframes nfaVn{0%,100%{opacity:.35}50%{opacity:1}}`,
`@keyframes nfaVln{0%,100%{opacity:0}40%,65%{opacity:.9}}`
);
add("ai-vector-search","Vector Search","info",
`<div class="nfa-vsearch"><span class="ln" style="width:52px;transform:rotate(200deg)"></span><span class="ln" style="width:64px;transform:rotate(-40deg);animation-delay:.3s"></span><span class="ln" style="width:44px;transform:rotate(110deg);animation-delay:.6s"></span><span class="n hit" style="left:26%;top:30%"></span><span class="n hit" style="left:78%;top:38%;animation-delay:.3s"></span><span class="n hit" style="left:60%;top:80%;animation-delay:.6s"></span><span class="n" style="left:16%;top:70%"></span><span class="n" style="left:88%;top:74%"></span><span class="q"></span></div>`,
"A query vector reaches out to its nearest neighbors — approximate search lighting up matches.");

/* 19. MoE ROUTING */
css.push(
`.nfa-moe{position:relative;width:230px;height:120px}`,
`.nfa-moe .tok{position:absolute;left:6px;top:50%;transform:translateY(-50%);font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:4px 8px;border-radius:6px;background:var(--panel2);border:1px solid var(--accent);color:var(--ink)}`,
`.nfa-moe .ex{position:absolute;right:6px;width:60px;height:22px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);font-size:9.5px;display:flex;align-items:center;justify-content:center;color:var(--muted)}`,
`.nfa-moe .ex.e1{top:6px}.nfa-moe .ex.e2{top:40px;animation:nfaMoeLit 3s ease-in-out infinite}.nfa-moe .ex.e3{top:74px}.nfa-moe .ex.e4{top:98px;animation:nfaMoeLit 3s ease-in-out infinite 1.5s}`,
`.nfa-moe .rt{position:absolute;left:70px;top:50%;height:2px;transform-origin:left center;background:linear-gradient(90deg,var(--accent),transparent);opacity:0;animation:nfaMoeRt 3s ease-in-out infinite}`,
`@keyframes nfaMoeLit{0%,100%{border-color:var(--line);color:var(--muted);box-shadow:none}30%,55%{border-color:var(--accent);color:var(--ink);box-shadow:0 0 12px rgba(var(--accent-rgb),.4)}}`,
`@keyframes nfaMoeRt{0%,100%{opacity:0}25%,55%{opacity:.9}}`
);
add("ai-moe-routing","MoE Router","crit",
`<div class="nfa-moe"><span class="tok">token</span><span class="rt" style="width:96px;transform:rotate(-14deg)"></span><span class="rt" style="width:96px;transform:rotate(14deg);animation-delay:1.5s"></span><span class="ex e1">expert 1</span><span class="ex e2">expert 2</span><span class="ex e3">expert 3</span><span class="ex e4">expert 4</span></div>`,
"A gating network routes each token to its top experts — only the chosen few activate.", true);

/* 20. SPECULATIVE DECODING */
css.push(
`.nfa-spec{width:100%;display:flex;flex-direction:column;gap:9px}`,
`.nfa-spec .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}`,
`.nfa-spec .row .rl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);width:52px;flex:0 0 auto}`,
`.nfa-spec .t{font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:3px 7px;border-radius:5px;border:1px solid var(--line);background:var(--panel2)}`,
`.nfa-spec .t.draft{color:var(--muted);animation:nfaSpecD 3s ease-in-out infinite}`,
`.nfa-spec .t.acc{border-color:rgba(var(--pos-rgb),.6);color:#bff0c8;background:rgba(var(--pos-rgb),.12)}`,
`.nfa-spec .t.rej{border-color:rgba(var(--neg-rgb),.6);color:#ffb3ae;background:rgba(var(--neg-rgb),.12);text-decoration:line-through}`,
`@keyframes nfaSpecD{0%,100%{opacity:.4}50%{opacity:1}}`
);
add("ai-speculative-decode","Speculative Decoding","accent",
`<div class="nfa-spec"><div class="row"><span class="rl">draft</span><span class="t draft">the</span><span class="t draft">cat</span><span class="t draft">sat</span><span class="t draft">on</span><span class="t draft">mat</span></div><div class="row"><span class="rl">verify</span><span class="t acc">the</span><span class="t acc">cat</span><span class="t acc">sat</span><span class="t rej">on</span><span class="t acc">the</span></div></div>`,
"A small draft model proposes tokens; the target model verifies, accepting a run and rejecting the rest.", true);

/* 21. RAG CITATIONS */
css.push(
`.nfa-rag{width:100%;display:flex;flex-direction:column;gap:9px}`,
`.nfa-rag .ans{font-size:12px;line-height:1.6;color:var(--ink)}`,
`.nfa-rag .c{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:5px;font-size:9.5px;font-weight:800;background:rgba(var(--info-rgb),.18);border:1px solid rgba(var(--info-rgb),.55);color:var(--info);vertical-align:baseline;transform:scale(.3);opacity:0;animation:nfaCite .6s cubic-bezier(.3,1.6,.5,1) forwards}`,
`.nfa-rag .src{display:flex;flex-direction:column;gap:4px;border-top:1px dashed var(--line);padding-top:8px}`,
`.nfa-rag .src .s{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--muted);opacity:0;animation:nfaCiteRow .5s ease-out forwards}`,
`.nfa-rag .src .s b{font-size:8.5px;font-weight:800;background:rgba(var(--info-rgb),.18);border:1px solid rgba(var(--info-rgb),.5);color:var(--info);border-radius:4px;padding:1px 5px}`,
`@keyframes nfaCite{to{opacity:1;transform:scale(1)}}`,
`@keyframes nfaCiteRow{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}`
);
add("ai-rag-citations","RAG Citations","info",
`<div class="nfa-rag"><div class="ans">Prism ships as a single HTML file<span class="c" style="animation-delay:1s">1</span> and renders fully offline<span class="c" style="animation-delay:1.6s">2</span>.</div><div class="src"><div class="s" style="animation-delay:2s"><b>1</b>docs/overview.md · §2</div><div class="s" style="animation-delay:2.4s"><b>2</b>README.md · line 40</div></div></div>`,
"Grounded generation — inline citations pop in and resolve to the retrieved source passages.", true);

/* 22. RETRIEVAL SHARDS (doc cards sliding in) */
css.push(
`.nfa-shard{width:100%;display:flex;flex-direction:column;gap:7px}`,
`.nfa-shard .d{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);font-size:11px;opacity:0;transform:translateX(-14px);animation:nfaShard .6s ease-out forwards}`,
`.nfa-shard .d .ic{width:22px;height:22px;flex:0 0 auto;border-radius:6px;background:rgba(var(--info-rgb),.15);border:1px solid rgba(var(--info-rgb),.4);display:flex;align-items:center;justify-content:center;font-size:12px}`,
`.nfa-shard .d .sc{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--info)}`,
`@keyframes nfaShard{to{opacity:1;transform:translateX(0)}}`
);
add("ai-retrieval-shards","Retrieval","info",
`<div class="nfa-shard"><div class="d" style="animation-delay:.1s"><span class="ic">📄</span>chunk_0041.txt<span class="sc">0.94</span></div><div class="d" style="animation-delay:.5s"><span class="ic">📄</span>chunk_0117.txt<span class="sc">0.89</span></div><div class="d" style="animation-delay:.9s"><span class="ic">📄</span>chunk_0088.txt<span class="sc">0.83</span></div></div>`,
"Top-k document shards slide in ranked by similarity — the context the model will read.", true);

/* 23. ATTENTION HEADS (heatmap) */
css.push(
`.nfa-attn{display:flex;flex-direction:column;gap:8px;align-items:center}`,
`.nfa-attn .grid{display:grid;grid-template-columns:repeat(8,15px);grid-template-rows:repeat(8,15px);gap:3px}`,
`.nfa-attn .grid i{width:15px;height:15px;border-radius:3px;background:rgba(var(--crit-rgb),.15);animation:nfaAttn 3s ease-in-out infinite}`,
`.nfa-attn .cap2{font-size:9.5px;color:var(--muted)}`,
`@keyframes nfaAttn{0%,100%{background:rgba(var(--crit-rgb),.08)}50%{background:rgba(var(--crit-rgb),.85)}}`
);
{
  let cells="";
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const causal=c<=r;const d=(Math.abs(r-c)*0.12+r*0.05).toFixed(2);cells+=`<i style="${causal?`animation-delay:${d}s`:`opacity:.12;animation:none`}"></i>`;}
  add("ai-attention-heads","Self-Attention","crit",
  `<div class="nfa-attn"><div class="grid">${cells}</div><div class="cap2">causal mask · 8 tokens</div></div>`,
  "An attention head’s weight matrix pulses — the lower triangle each token is allowed to see.");
}

/* 24. KV CACHE FILL */
css.push(
`.nfa-kv{width:100%;display:flex;flex-direction:column;gap:9px}`,
`.nfa-kv .lab{display:flex;justify-content:space-between;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`.nfa-kv .cells{display:grid;grid-template-columns:repeat(12,1fr);gap:4px}`,
`.nfa-kv .cells i{height:14px;border-radius:3px;background:var(--panel2);border:1px solid var(--line);animation:nfaKv 4s ease-in-out infinite}`,
`@keyframes nfaKv{0%,100%{background:var(--panel2);border-color:var(--line)}50%{background:rgba(var(--warn-rgb),.55);border-color:var(--warn)}}`
);
add("ai-kv-cache","KV Cache","warn",
`<div class="nfa-kv"><div class="lab"><span>kv-cache</span><span>ctx 24/32</span></div><div class="cells">${Array.from({length:24}).map((_,i)=>`<i style="animation-delay:${(i*0.14).toFixed(2)}s"></i>`).join("")}</div></div>`,
"Key/value slots fill as generation proceeds — the cache that lets each new token skip recompute.", true);

/* 25. BEAM SEARCH */
css.push(
`.nfa-beam{position:relative;width:230px;height:120px}`,
`.nfa-beam .nd{position:absolute;width:13px;height:13px;border-radius:50%;background:var(--panel2);border:2px solid var(--line);transform:translate(-50%,-50%)}`,
`.nfa-beam .nd.on{border-color:var(--accent);background:var(--accent);box-shadow:0 0 10px rgba(var(--accent-rgb),.6);animation:nfaBeamN 3s ease-in-out infinite}`,
`.nfa-beam .ed{position:absolute;height:2px;transform-origin:left center;background:var(--line)}`,
`.nfa-beam .ed.on{background:linear-gradient(90deg,var(--accent),rgba(var(--accent-rgb),.2));animation:nfaBeamE 3s ease-in-out infinite}`,
`@keyframes nfaBeamN{0%,100%{opacity:.5}50%{opacity:1}}`,
`@keyframes nfaBeamE{0%,100%{opacity:.25}50%{opacity:1}}`
);
add("ai-beam-search","Beam Search","accent",
`<div class="nfa-beam"><span class="ed on" style="left:20px;top:60px;width:70px;transform:rotate(-24deg)"></span><span class="ed" style="left:20px;top:60px;width:70px;transform:rotate(24deg)"></span><span class="ed on" style="left:90px;top:32px;width:70px;transform:rotate(-8deg)"></span><span class="ed" style="left:90px;top:32px;width:70px;transform:rotate(30deg)"></span><span class="ed" style="left:90px;top:88px;width:70px;transform:rotate(-14deg)"></span><span class="nd on" style="left:20px;top:60px"></span><span class="nd on" style="left:90px;top:32px"></span><span class="nd" style="left:90px;top:88px"></span><span class="nd on" style="left:160px;top:24px"></span><span class="nd" style="left:160px;top:48px"></span><span class="nd" style="left:160px;top:96px"></span></div>`,
"Candidate sequences branch and prune — the highest-probability beam stays lit to the end.", true);

/* 26. TEMPERATURE DIAL */
css.push(
`.nfa-temp{position:relative;width:110px;height:70px}`,
`.nfa-temp svg{width:110px;height:70px}`,
`.nfa-temp .arc{fill:none;stroke:var(--panel2);stroke-width:9;stroke-linecap:round}`,
`.nfa-temp .arcf{fill:none;stroke:var(--warn);stroke-width:9;stroke-linecap:round;stroke-dasharray:126;stroke-dashoffset:126;animation:nfaTempF 3.5s ease-in-out infinite}`,
`.nfa-temp .nd{position:absolute;left:50%;bottom:6px;width:3px;height:40px;background:var(--warn);transform-origin:bottom center;border-radius:2px;box-shadow:0 0 8px rgba(var(--warn-rgb),.6);animation:nfaTempN 3.5s ease-in-out infinite}`,
`.nfa-temp .v{position:absolute;left:0;right:0;bottom:-4px;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--warn)}`,
`@keyframes nfaTempF{0%,100%{stroke-dashoffset:110}50%{stroke-dashoffset:44}}`,
`@keyframes nfaTempN{0%,100%{transform:rotate(-58deg)}50%{transform:rotate(34deg)}}`
);
add("ai-temperature-dial","Temperature","warn",
`<div class="nfa-temp"><svg viewBox="0 0 110 70"><path class="arc" d="M12 62 A45 45 0 0 1 98 62"/><path class="arcf" d="M12 62 A45 45 0 0 1 98 62"/></svg><span class="nd"></span><span class="v">0.7</span></div>`,
"The sampling temperature dial sweeps between focused and creative decoding.");

/* 27. LOGIT SAMPLER (bars re-ranking) */
css.push(
`.nfa-logit{width:100%;display:flex;flex-direction:column;gap:6px}`,
`.nfa-logit .b{display:flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:10px}`,
`.nfa-logit .b .w{width:44px;color:var(--muted)}`,
`.nfa-logit .b .tr{flex:1;height:11px;border-radius:4px;background:var(--panel2);overflow:hidden}`,
`.nfa-logit .b .fl{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--info),rgba(var(--info-rgb),.4))}`,
`.nfa-logit .b:nth-child(1) .fl{animation:nfaLog1 3s ease-in-out infinite}`,
`.nfa-logit .b:nth-child(2) .fl{animation:nfaLog2 3s ease-in-out infinite}`,
`.nfa-logit .b:nth-child(3) .fl{animation:nfaLog3 3s ease-in-out infinite}`,
`.nfa-logit .b:nth-child(4) .fl{animation:nfaLog4 3s ease-in-out infinite}`,
`@keyframes nfaLog1{0%,100%{width:82%}50%{width:64%}}`,
`@keyframes nfaLog2{0%,100%{width:48%}50%{width:71%}}`,
`@keyframes nfaLog3{0%,100%{width:35%}50%{width:22%}}`,
`@keyframes nfaLog4{0%,100%{width:20%}50%{width:40%}}`
);
add("ai-logit-sampler","Logit Sampler","info",
`<div class="nfa-logit"><div class="b"><span class="w">" the"</span><span class="tr"><span class="fl"></span></span></div><div class="b"><span class="w">" a"</span><span class="tr"><span class="fl"></span></span></div><div class="b"><span class="w">" one"</span><span class="tr"><span class="fl"></span></span></div><div class="b"><span class="w">" some"</span><span class="tr"><span class="fl"></span></span></div></div>`,
"Next-token probabilities jostle for rank each step before one candidate is sampled.", true);

/* 28. GENERATING (indeterminate bar + pct) */
css.push(
`.nfa-gen{display:flex;align-items:center;gap:13px;width:100%}`,
`.nfa-gen .bar{flex:1;height:9px;border-radius:6px;background:var(--panel2);overflow:hidden;position:relative}`,
`.nfa-gen .bar::before{content:"";position:absolute;top:0;bottom:0;width:38%;border-radius:6px;background:linear-gradient(90deg,var(--crit),var(--accent));box-shadow:0 0 12px rgba(var(--accent-rgb),.5);animation:nfaGenBar 1.8s cubic-bezier(.65,0,.35,1) infinite}`,
`.nfa-gen .p{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--accent);min-width:34px;text-align:right}`,
`@keyframes nfaGenBar{0%{left:-40%}100%{left:100%}}`
);
add("ai-generating","Generating","accent",
`<div class="nfa-gen"><div class="bar"></div><span class="p">…</span></div>`,
"An indeterminate progress sweep for work with no known ETA — the model is on it.");

/* 29. CODE DIFF STREAM */
css.push(
`.nfa-diff{width:100%;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;background:#080b12;border:1px solid var(--line);border-radius:8px;overflow:hidden}`,
`.nfa-diff .l{padding:2px 10px;white-space:nowrap;opacity:0;animation:nfaDiff .45s ease-out forwards}`,
`.nfa-diff .l.add{background:rgba(var(--pos-rgb),.12);color:#9be8a8;border-left:3px solid var(--pos)}`,
`.nfa-diff .l.del{background:rgba(var(--neg-rgb),.12);color:#ffb3ae;border-left:3px solid var(--neg)}`,
`.nfa-diff .l.ctx{color:var(--muted);border-left:3px solid transparent}`,
`@keyframes nfaDiff{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}`
);
add("ai-code-diff","Code Diff","pos",
`<div class="nfa-diff"><div class="l ctx" style="animation-delay:.1s">  function greet(name) {</div><div class="l del" style="animation-delay:.5s">-   return "hi " + name</div><div class="l add" style="animation-delay:.9s">+   return \`Hello, \${name}!\`</div><div class="l ctx" style="animation-delay:1.3s">  }</div></div>`,
"The agent writes a patch — context, removed, and added lines stream in with diff gutters.", true);

/* 30. TOOL: SHELL (terminal) */
css.push(
`.nfa-term{width:100%;font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#05080e;border:1px solid var(--line);border-radius:8px;overflow:hidden}`,
`.nfa-term .bar{display:flex;gap:6px;padding:7px 10px;border-bottom:1px solid var(--line)}`,
`.nfa-term .bar i{width:9px;height:9px;border-radius:50%;background:var(--dim)}`,
`.nfa-term .bar i:nth-child(1){background:var(--neg)}.nfa-term .bar i:nth-child(2){background:var(--warn)}.nfa-term .bar i:nth-child(3){background:var(--pos)}`,
`.nfa-term .body{padding:9px 11px;line-height:1.7}`,
`.nfa-term .pr{color:var(--pos)}.nfa-term .cmd{color:var(--ink)}.nfa-term .out{color:var(--muted)}`,
`.nfa-term .cur{display:inline-block;width:7px;height:12px;background:var(--pos);vertical-align:middle;animation:nfaBlink .7s step-end infinite}`,
`@keyframes nfaBlink{0%,100%{opacity:1}50%{opacity:0}}`
);
add("ai-tool-shell","Tool · Shell","pos",
`<div class="nfa-term"><div class="bar"><i></i><i></i><i></i></div><div class="body"><div><span class="pr">$</span> <span class="cmd">npm test --silent</span></div><div class="out">running 42 tests…</div><div><span class="pr">$</span> <span class="cur"></span></div></div></div>`,
"An agent executes a shell tool call — command runs, output returns, prompt awaits the next.", true);

/* 31. WEB SEARCH CRAWL */
css.push(
`.nfa-web{width:100%;display:flex;flex-direction:column;gap:7px}`,
`.nfa-web .q{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);padding-bottom:3px}`,
`.nfa-web .q .sp{width:12px;height:12px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--info);animation:nfaSpin .7s linear infinite}`,
`.nfa-web .r{display:flex;flex-direction:column;gap:2px;padding:6px 9px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);opacity:0;animation:nfaWeb .5s ease-out forwards}`,
`.nfa-web .r .t{font-size:11px;color:var(--info);font-weight:600}`,
`.nfa-web .r .u{font-size:9px;color:var(--dim);font-family:ui-monospace,Menlo,monospace}`,
`@keyframes nfaSpin{to{transform:rotate(1turn)}}`,
`@keyframes nfaWeb{to{opacity:1}}`
);
add("ai-web-search","Web Search","info",
`<div class="nfa-web"><div class="q"><span class="sp"></span>searching “offline html gallery”…</div><div class="r" style="animation-delay:.6s"><span class="t">Single-file apps guide</span><span class="u">example.dev/single-file</span></div><div class="r" style="animation-delay:1.1s"><span class="t">Inlining assets 101</span><span class="u">example.dev/inline</span></div></div>`,
"A search tool fires, spins, then lists ranked results the agent will read next.", true);

/* 32. REASONING ORB */
css.push(
`.nfa-orb{position:relative;width:96px;height:96px;display:flex;align-items:center;justify-content:center}`,
`.nfa-orb .glow{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(var(--crit-rgb),.5),transparent 65%);animation:nfaOrbG 3s ease-in-out infinite}`,
`.nfa-orb .ball{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,var(--crit) 48%,#4a2270);box-shadow:0 0 22px rgba(var(--crit-rgb),.7),inset 0 0 12px rgba(0,0,0,.3);animation:nfaOrbB 3s ease-in-out infinite}`,
`.nfa-orb .arc{position:absolute;inset:8px;border-radius:50%;border:1px solid rgba(var(--crit-rgb),.35);border-top-color:var(--crit);animation:nfaSpin2 2.4s linear infinite}`,
`@keyframes nfaOrbG{0%,100%{transform:scale(.9);opacity:.5}50%{transform:scale(1.12);opacity:.9}}`,
`@keyframes nfaOrbB{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-5px) scale(1.05)}}`,
`@keyframes nfaSpin2{to{transform:rotate(1turn)}}`
);
add("ai-reasoning-orb","Reasoning Orb","crit",
`<div class="nfa-orb"><span class="glow"></span><span class="arc"></span><span class="ball"></span></div>`,
"A breathing orb with an orbiting arc — the model deliberating before it commits.");

/* 33. NEURAL PULSE */
css.push(
`.nfa-net{position:relative;width:170px;height:120px}`,
`.nfa-net .nn{position:absolute;width:12px;height:12px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px rgba(var(--accent-rgb),.6);animation:nfaNet 2.2s ease-in-out infinite}`,
`.nfa-net .ne{position:absolute;height:1.5px;background:linear-gradient(90deg,rgba(var(--accent-rgb),.7),transparent);transform-origin:left center;animation:nfaNetE 2.6s linear infinite}`,
`@keyframes nfaNet{0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.35);opacity:1}}`,
`@keyframes nfaNetE{0%{opacity:0}50%{opacity:1}100%{opacity:0}}`
);
add("ai-neural-pulse","Neural Pulse","accent",
`<div class="nfa-net"><span class="ne" style="left:22px;top:20px;width:64px;transform:rotate(24deg)"></span><span class="ne" style="left:22px;top:60px;width:66px;transform:rotate(-18deg);animation-delay:.4s"></span><span class="ne" style="left:22px;top:98px;width:64px;transform:rotate(-40deg);animation-delay:.8s"></span><span class="ne" style="left:96px;top:36px;width:52px;transform:rotate(18deg);animation-delay:.6s"></span><span class="ne" style="left:96px;top:72px;width:52px;transform:rotate(-16deg);animation-delay:1s"></span><span class="nn" style="left:16px;top:14px"></span><span class="nn" style="left:16px;top:54px;animation-delay:.3s"></span><span class="nn" style="left:16px;top:92px;animation-delay:.6s"></span><span class="nn" style="left:90px;top:30px;animation-delay:.4s"></span><span class="nn" style="left:90px;top:66px;animation-delay:.7s"></span><span class="nn" style="left:150px;top:48px;animation-delay:1s"></span></div>`,
"Signals propagate layer to layer — a small feed-forward network firing.");

/* 34. PIPELINE STAGES */
css.push(
`.nfa-pipe{display:flex;align-items:center;gap:0}`,
`.nfa-pipe .st{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid var(--line);background:var(--panel2);position:relative;z-index:2;animation:nfaPipeS 4s ease-in-out infinite}`,
`.nfa-pipe .st:nth-child(3){animation-delay:1s}.nfa-pipe .st:nth-child(5){animation-delay:2s}.nfa-pipe .st:nth-child(7){animation-delay:3s}`,
`.nfa-pipe .wr{width:20px;height:2px;background:var(--line);position:relative;overflow:hidden}`,
`.nfa-pipe .wr::after{content:"";position:absolute;inset:0;width:40%;background:var(--info);animation:nfaPipeW 4s linear infinite}`,
`.nfa-pipe .wr:nth-child(4)::after{animation-delay:1s}.nfa-pipe .wr:nth-child(6)::after{animation-delay:2s}`,
`@keyframes nfaPipeS{0%,100%{border-color:var(--line);box-shadow:none}20%,35%{border-color:var(--info);box-shadow:0 0 12px rgba(var(--info-rgb),.5)}}`,
`@keyframes nfaPipeW{0%{left:-40%}100%{left:100%}}`
);
add("ai-pipeline-stages","Pipeline","info",
`<div class="nfa-pipe"><span class="st">📥</span><span class="wr"></span><span class="st">🧩</span><span class="wr"></span><span class="st">🧠</span><span class="wr"></span><span class="st">📤</span></div>`,
"Work flows through ingest → parse → infer → emit, each stage lighting as the packet passes.", true);

/* 35. CONFIDENCE METER */
css.push(
`.nfa-conf{width:100%;display:flex;flex-direction:column;gap:10px}`,
`.nfa-conf .c{display:flex;align-items:center;gap:9px;font-size:10.5px}`,
`.nfa-conf .c .l{width:70px;color:var(--muted)}`,
`.nfa-conf .c .tr{flex:1;height:9px;border-radius:5px;background:var(--panel2);overflow:hidden}`,
`.nfa-conf .c .fl{height:100%;border-radius:5px;width:0;animation:nfaConf 2.6s cubic-bezier(.2,.7,.2,1) forwards}`,
`.nfa-conf .c .v{width:34px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:700}`,
`@keyframes nfaConf{to{width:var(--w)}}`
);
add("ai-confidence-meter","Confidence","pos",
`<div class="nfa-conf"><div class="c"><span class="l">Answer A</span><span class="tr"><span class="fl" style="--w:88%;background:var(--pos)"></span></span><span class="v" style="color:var(--pos)">88%</span></div><div class="c"><span class="l">Answer B</span><span class="tr"><span class="fl" style="--w:47%;background:var(--warn);animation-delay:.3s"></span></span><span class="v" style="color:var(--warn)">47%</span></div><div class="c"><span class="l">Answer C</span><span class="tr"><span class="fl" style="--w:19%;background:var(--neg);animation-delay:.6s"></span></span><span class="v" style="color:var(--neg)">19%</span></div></div>`,
"Calibrated confidence fills across candidate answers so the top choice is clear.", true);

/* 36. FACT CHECK */
css.push(
`.nfa-fact{width:100%;display:flex;flex-direction:column;gap:7px}`,
`.nfa-fact .f{display:flex;align-items:center;gap:9px;font-size:11.5px;color:var(--muted);padding:6px 9px;border-radius:8px;background:var(--panel2);border:1px solid var(--line)}`,
`.nfa-fact .f .m{width:18px;height:18px;flex:0 0 auto;border-radius:50%;border:2px solid var(--warn);display:flex;align-items:center;justify-content:center;font-size:10px;animation:nfaFactSc 2s ease-in-out infinite}`,
`.nfa-fact .f.ok .m{border-color:var(--pos);color:var(--pos);animation:none}`,
`.nfa-fact .f.no .m{border-color:var(--neg);color:var(--neg);animation:none}`,
`@keyframes nfaFactSc{0%,100%{opacity:1;transform:rotate(0)}50%{opacity:.4;transform:rotate(180deg)}}`
);
add("ai-fact-check","Fact Check","warn",
`<div class="nfa-fact"><div class="f ok"><span class="m">✓</span>Claim verified against source</div><div class="f"><span class="m">↻</span>Cross-checking second claim…</div><div class="f no"><span class="m">✕</span>Unsupported — flagged for revision</div></div>`,
"Each generated claim is checked against evidence — verified, pending, or flagged.", true);

/* 37. TOKEN BUDGET (donut) */
css.push(
`.nfa-budget{position:relative;width:100px;height:100px}`,
`.nfa-budget svg{transform:rotate(-90deg)}`,
`.nfa-budget .tk{fill:none;stroke:var(--panel2);stroke-width:9}`,
`.nfa-budget .fl{fill:none;stroke:var(--info);stroke-width:9;stroke-linecap:round;stroke-dasharray:264;animation:nfaBud 3.5s ease-in-out infinite}`,
`.nfa-budget .lb{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9.5px;color:var(--muted)}`,
`.nfa-budget .lb b{font-size:18px;color:var(--ink)}`,
`@keyframes nfaBud{0%{stroke-dashoffset:264}55%,100%{stroke-dashoffset:74}}`
);
add("ai-token-budget","Token Budget","info",
`<div class="nfa-budget"><svg width="100" height="100"><circle class="tk" cx="50" cy="50" r="42"/><circle class="fl" cx="50" cy="50" r="42"/></svg><span class="lb"><b>72%</b>of budget</span></div>`,
"A donut fills toward the token budget for the request — headroom before truncation.");

/* 38. TRAINING LOSS (descending sparkline) */
css.push(
`.nfa-loss{display:flex;flex-direction:column;gap:8px;align-items:center;width:100%}`,
`.nfa-loss svg{width:210px;height:70px}`,
`.nfa-loss .grid{stroke:var(--line);stroke-width:1;opacity:.4}`,
`.nfa-loss .path{fill:none;stroke:var(--pos);stroke-width:2.5;stroke-linecap:round;stroke-dasharray:340;stroke-dashoffset:340;animation:nfaLoss 4s ease-out infinite}`,
`.nfa-loss .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaLoss{0%{stroke-dashoffset:340}70%,100%{stroke-dashoffset:0}}`
);
add("ai-training-loss","Training Loss","pos",
`<div class="nfa-loss"><svg viewBox="0 0 210 70"><line class="grid" x1="0" y1="35" x2="210" y2="35"/><path class="path" d="M4 8 C40 14 44 40 74 46 C104 52 120 56 150 60 C176 63 190 64 206 65"/></svg><span class="lb">loss ↓ 0.042 · step 9k</span></div>`,
"A fine-tuning loss curve descends toward convergence as steps accumulate.", true);

/* 39. GPU LOAD */
css.push(
`.nfa-gpu{display:flex;gap:12px;align-items:flex-end}`,
`.nfa-gpu .u{display:flex;flex-direction:column;align-items:center;gap:6px}`,
`.nfa-gpu .u .m{width:20px;height:56px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);position:relative;overflow:hidden}`,
`.nfa-gpu .u .m span{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(180deg,var(--warn),rgba(var(--warn-rgb),.4));animation:nfaGpu 2.4s ease-in-out infinite}`,
`.nfa-gpu .u .l{font-family:ui-monospace,Menlo,monospace;font-size:9px;color:var(--muted)}`,
`@keyframes nfaGpu{0%,100%{height:30%}50%{height:92%}}`
);
add("ai-gpu-load","GPU Load","warn",
`<div class="nfa-gpu"><div class="u"><div class="m"><span style="animation-delay:0s"></span></div><span class="l">g0</span></div><div class="u"><div class="m"><span style="animation-delay:.3s"></span></div><span class="l">g1</span></div><div class="u"><div class="m"><span style="animation-delay:.6s"></span></div><span class="l">g2</span></div><div class="u"><div class="m"><span style="animation-delay:.9s"></span></div><span class="l">g3</span></div></div>`,
"Per-device utilization meters breathe as the batch spreads across the accelerators.");

/* 40. BATCH QUEUE */
css.push(
`.nfa-bq{width:100%;display:flex;flex-direction:column;gap:8px}`,
`.nfa-bq .row{display:flex;gap:6px;align-items:center}`,
`.nfa-bq .c{flex:1;height:22px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:var(--muted);animation:nfaBq 3.2s ease-in-out infinite}`,
`.nfa-bq .c:nth-child(2){animation-delay:.4s}.nfa-bq .c:nth-child(3){animation-delay:.8s}.nfa-bq .c:nth-child(4){animation-delay:1.2s}`,
`@keyframes nfaBq{0%,100%{border-color:var(--line);color:var(--muted);background:var(--panel2)}25%,45%{border-color:var(--accent);color:var(--ink);background:rgba(var(--accent-rgb),.1)}}`
);
add("ai-batch-queue","Batch Queue","accent",
`<div class="nfa-bq"><div class="row"><span class="c">req#1</span><span class="c">req#2</span><span class="c">req#3</span><span class="c">req#4</span></div></div>`,
"Requests advance through the inference batch, each highlighting as it’s scheduled.", true);

/* 41. SCRATCHPAD */
css.push(
`.nfa-scratch{width:100%;background:#0a0e17;border:1px dashed var(--line);border-radius:8px;padding:11px 13px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted);line-height:1.8;min-height:74px}`,
`.nfa-scratch .l{overflow:hidden;white-space:nowrap;width:0;animation:nfaScr .8s steps(30) forwards}`,
`.nfa-scratch .l:nth-child(2){animation-delay:.9s}.nfa-scratch .l:nth-child(3){animation-delay:1.9s}`,
`.nfa-scratch .h{color:var(--crit)}`,
`@keyframes nfaScr{to{width:100%}}`
);
add("ai-scratchpad","Scratchpad","crit",
`<div class="nfa-scratch"><div class="l"><span class="h"># goal:</span> summarize the report</div><div class="l"><span class="h"># given:</span> 3 sections, 800 words</div><div class="l"><span class="h"># plan:</span> extract → compress → verify</div></div>`,
"The model jots working notes to itself — a private scratchpad before the real answer.", true);

/* 42. CHAIN OF THOUGHT (linked bubbles) */
css.push(
`.nfa-cot{display:flex;align-items:center;gap:0}`,
`.nfa-cot .th{max-width:70px;padding:8px 10px;border-radius:12px;background:rgba(var(--crit-rgb),.12);border:1px solid rgba(var(--crit-rgb),.5);font-size:10px;color:#e9d4ff;text-align:center;animation:nfaCot 3s ease-in-out infinite}`,
`.nfa-cot .th:nth-child(3){animation-delay:1s}.nfa-cot .th:nth-child(5){animation-delay:2s}`,
`.nfa-cot .ar{color:var(--crit);font-size:14px;padding:0 6px;opacity:.6}`,
`@keyframes nfaCot{0%,100%{opacity:.45;transform:scale(.96)}30%,50%{opacity:1;transform:scale(1)}}`
);
add("ai-chain-of-thought","Chain of Thought","crit",
`<div class="nfa-cot"><span class="th">premise</span><span class="ar">→</span><span class="th">infer</span><span class="ar">→</span><span class="th">conclude</span></div>`,
"Thoughts link in a chain — each intermediate step lights before feeding the next.", true);

/* 43. SELF-CRITIQUE (draft ↔ review loop) */
css.push(
`.nfa-crit{position:relative;width:150px;height:110px}`,
`.nfa-crit .box{position:absolute;width:64px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--panel2);border:1px solid var(--line)}`,
`.nfa-crit .b1{left:0;top:12px;color:var(--info);border-color:rgba(var(--info-rgb),.5);animation:nfaCr1 3s ease-in-out infinite}`,
`.nfa-crit .b2{right:0;bottom:12px;color:var(--warn);border-color:rgba(var(--warn-rgb),.5);animation:nfaCr2 3s ease-in-out infinite}`,
`.nfa-crit svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}`,
`.nfa-crit svg path{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:4 4;opacity:.5}`,
`@keyframes nfaCr1{0%,100%{box-shadow:none}20%,45%{box-shadow:0 0 12px rgba(var(--info-rgb),.5)}}`,
`@keyframes nfaCr2{0%,100%{box-shadow:none}60%,85%{box-shadow:0 0 12px rgba(var(--warn-rgb),.5)}}`
);
add("ai-self-critique","Self-Critique","warn",
`<div class="nfa-crit"><svg viewBox="0 0 150 110"><path d="M64 30 C110 20 120 60 90 78"/><path d="M86 80 C40 92 30 52 60 34"/></svg><span class="box b1">DRAFT</span><span class="box b2">REVIEW</span></div>`,
"The model drafts, critiques its own output, and revises — a reflection loop before finalizing.");

/* 44. STRUCTURED OUTPUT (JSON build) */
css.push(
`.nfa-json{width:100%;font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:11px 13px;line-height:1.8}`,
`.nfa-json .p{color:var(--muted)}.nfa-json .k{color:var(--crit)}.nfa-json .s{color:var(--pos)}.nfa-json .n{color:var(--info)}`,
`.nfa-json .l{opacity:0;animation:nfaJs .5s ease-out forwards}`,
`.nfa-json .l:nth-child(2){animation-delay:.4s}.nfa-json .l:nth-child(3){animation-delay:.8s}.nfa-json .l:nth-child(4){animation-delay:1.2s}.nfa-json .l:nth-child(5){animation-delay:1.6s}`,
`@keyframes nfaJs{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`
);
add("ai-structured-output","Structured Output","info",
`<div class="nfa-json"><div class="l"><span class="p">{</span></div><div class="l">&nbsp;&nbsp;<span class="k">"intent"</span>: <span class="s">"book_flight"</span>,</div><div class="l">&nbsp;&nbsp;<span class="k">"pax"</span>: <span class="n">2</span>,</div><div class="l">&nbsp;&nbsp;<span class="k">"nonstop"</span>: <span class="n">true</span></div><div class="l"><span class="p">}</span></div></div>`,
"Constrained decoding emits schema-valid JSON, key by key, guaranteed to parse.");

/* 45. MARKDOWN STREAM */
css.push(
`.nfa-md{width:100%;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:12px 14px;font-size:11.5px;line-height:1.7;color:var(--ink);min-height:76px}`,
`.nfa-md h5{margin:0 0 6px;font-size:12.5px;color:var(--accent)}`,
`.nfa-md code{background:var(--panel2);border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--info);font-family:ui-monospace,Menlo,monospace}`,
`.nfa-md .li{display:flex;gap:7px;opacity:0;animation:nfaMdLi .5s ease-out forwards}`,
`.nfa-md .li::before{content:"▹";color:var(--pos)}`,
`.nfa-md h5{opacity:0;animation:nfaMdLi .5s ease-out forwards}`,
`.nfa-md .li:nth-of-type(1){animation-delay:.7s}.nfa-md .li:nth-of-type(2){animation-delay:1.2s}.nfa-md .li:nth-of-type(3){animation-delay:1.7s}`,
`.nfa-md .cur{display:inline-block;width:7px;height:12px;background:var(--accent);vertical-align:text-bottom;animation:nfaBlink .7s step-end infinite}`,
`@keyframes nfaMdLi{to{opacity:1}}`
);
add("ai-markdown-stream","Markdown Stream","accent",
`<div class="nfa-md"><h5>Setup steps</h5><div class="li">Clone the <code>repo</code></div><div class="li">Run <code>make build</code></div><div class="li">Open the file<span class="cur"></span></div></div>`,
"Formatted markdown renders as it streams — heading first, then list items materialize.", true);

/* 46. SEMANTIC CACHE HIT */
css.push(
`.nfa-cache{display:flex;flex-direction:column;align-items:center;gap:11px}`,
`.nfa-cache .box{position:relative;width:96px;height:52px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);display:flex;align-items:center;justify-content:center;overflow:hidden}`,
`.nfa-cache .box .sw{position:absolute;top:0;bottom:0;width:30%;background:linear-gradient(90deg,transparent,rgba(var(--pos-rgb),.4),transparent);animation:nfaCacheSw 2.6s ease-in-out infinite}`,
`.nfa-cache .box b{font-size:12px;font-weight:800;color:var(--pos);opacity:0;animation:nfaCacheHit 2.6s ease-in-out infinite}`,
`.nfa-cache .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaCacheSw{0%{left:-30%}55%{left:100%}100%{left:100%}}`,
`@keyframes nfaCacheHit{0%,55%{opacity:0;transform:scale(.6)}70%,100%{opacity:1;transform:scale(1)}}`
);
add("ai-cache-hit","Semantic Cache","pos",
`<div class="nfa-cache"><div class="box"><span class="sw"></span><b>CACHE HIT</b></div><div class="lb">skipped inference · 3ms</div></div>`,
"A semantic-cache lookup sweeps the store and lands a hit — the answer returns instantly.");

/* 47. RATE LIMIT (token bucket) */
css.push(
`.nfa-rl{display:flex;flex-direction:column;align-items:center;gap:10px}`,
`.nfa-rl .bucket{position:relative;width:60px;height:64px;border:2px solid var(--warn);border-top:none;border-radius:0 0 12px 12px;overflow:hidden;background:rgba(var(--warn-rgb),.05)}`,
`.nfa-rl .bucket .fill{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(180deg,var(--warn),rgba(var(--warn-rgb),.5));animation:nfaRl 4s ease-in-out infinite}`,
`.nfa-rl .drop{position:absolute;left:50%;top:-10px;width:6px;height:10px;margin-left:-3px;border-radius:0 0 50% 50%;background:var(--warn);animation:nfaRlDrop 4s ease-in-out infinite}`,
`.nfa-rl .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaRl{0%{height:20%}45%{height:85%}55%{height:70%}100%{height:20%}}`,
`@keyframes nfaRlDrop{0%,100%{opacity:0;transform:translateY(0)}10%{opacity:1}40%{opacity:1;transform:translateY(20px)}42%{opacity:0}}`
);
add("ai-rate-limit","Rate Limit","warn",
`<div class="nfa-rl"><div class="bucket"><span class="drop"></span><span class="fill"></span></div><div class="lb">tokens · 4.2k / 10k rpm</div></div>`,
"A token bucket refills against the request rate — throttling keeps calls under the limit.");

/* 48. EMBEDDING HEATMAP */
css.push(
`.nfa-hm{display:flex;flex-direction:column;gap:8px;align-items:center}`,
`.nfa-hm .grid{display:grid;grid-template-columns:repeat(12,12px);gap:3px}`,
`.nfa-hm .grid i{width:12px;height:12px;border-radius:2px;animation:nfaHm 3s ease-in-out infinite}`,
`.nfa-hm .lb{font-size:9.5px;color:var(--muted)}`,
`@keyframes nfaHm{0%,100%{background:rgba(var(--info-rgb),.12)}50%{background:rgba(var(--info-rgb),.9)}}`
);
{
  let cells="";
  for(let i=0;i<48;i++){const d=((i%12)*0.07+Math.floor(i/12)*0.15).toFixed(2);cells+=`<i style="animation-delay:${d}s"></i>`;}
  add("ai-embedding-heatmap","Embedding Heatmap","info",
  `<div class="nfa-hm"><div class="grid">${cells}</div><div class="lb">384-dim vector · normalized</div></div>`,
  "The activation values of an embedding shimmer across a dense dimension grid.", true);
}

/* 49. TASK DECOMPOSITION TREE */
css.push(
`.nfa-tree{width:100%;display:flex;flex-direction:column;gap:5px;font-size:11.5px}`,
`.nfa-tree .n{display:flex;align-items:center;gap:8px;color:var(--muted);opacity:0;animation:nfaTree .5s ease-out forwards}`,
`.nfa-tree .n .b{width:7px;height:7px;border-radius:2px;background:var(--accent);flex:0 0 auto}`,
`.nfa-tree .n.c1{padding-left:0}.nfa-tree .n.c2{padding-left:22px}.nfa-tree .n.c2 .b{background:var(--info)}`,
`.nfa-tree .n:nth-child(1){animation-delay:.1s}.nfa-tree .n:nth-child(2){animation-delay:.5s}.nfa-tree .n:nth-child(3){animation-delay:.9s}.nfa-tree .n:nth-child(4){animation-delay:1.3s}.nfa-tree .n:nth-child(5){animation-delay:1.7s}`,
`@keyframes nfaTree{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}`
);
add("ai-task-tree","Task Decomposition","accent",
`<div class="nfa-tree"><div class="n c1"><span class="b"></span>Build the report</div><div class="n c2"><span class="b"></span>Gather metrics</div><div class="n c2"><span class="b"></span>Draft summary</div><div class="n c2"><span class="b"></span>Render charts</div><div class="n c1"><span class="b"></span>Deliver PDF</div></div>`,
"A goal expands into an ordered subtask tree the agent will work through.", true);

/* 50. RERANKER (list reordering bars) */
css.push(
`.nfa-rr{width:100%;display:flex;flex-direction:column;gap:6px}`,
`.nfa-rr .i{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);font-size:11px;color:var(--muted)}`,
`.nfa-rr .i .r{width:16px;height:16px;flex:0 0 auto;border-radius:5px;background:rgba(var(--info-rgb),.2);border:1px solid rgba(var(--info-rgb),.5);color:var(--info);font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center}`,
`.nfa-rr .i:nth-child(1){animation:nfaRrUp 4s ease-in-out infinite}`,
`.nfa-rr .i:nth-child(2){animation:nfaRrDn 4s ease-in-out infinite}`,
`@keyframes nfaRrUp{0%,100%{transform:translateY(0)}30%,60%{transform:translateY(30px)}}`,
`@keyframes nfaRrDn{0%,100%{transform:translateY(0)}30%,60%{transform:translateY(-30px)}}`
);
add("ai-reranker","Reranker","info",
`<div class="nfa-rr"><div class="i"><span class="r">2</span>candidate · score 0.71</div><div class="i"><span class="r">1</span>candidate · score 0.86</div><div class="i"><span class="r">3</span>candidate · score 0.44</div></div>`,
"A cross-encoder reorders retrieved candidates — the better match swaps into the top slot.", true);

/* 51. PII REDACTION */
css.push(
`.nfa-pii{width:100%;font-size:12px;line-height:1.9;color:var(--ink)}`,
`.nfa-pii .r{display:inline-block;position:relative;color:transparent;border-radius:3px;background:var(--panel2);padding:0 4px}`,
`.nfa-pii .r::after{content:"";position:absolute;inset:0;border-radius:3px;background:var(--neg);animation:nfaPii 3s ease-in-out infinite}`,
`.nfa-pii .r.r2::after{animation-delay:.8s}.nfa-pii .r.r3::after{animation-delay:1.6s}`,
`@keyframes nfaPii{0%,20%{transform:scaleX(0);transform-origin:left}45%,100%{transform:scaleX(1)}}`
);
add("ai-pii-redaction","PII Redaction","neg",
`<div class="nfa-pii">Contact <span class="r">Jane Doe</span> at <span class="r r2">j@ex.com</span> or call <span class="r r3">555-0100</span> today.</div>`,
"Sensitive spans get masked as the safety layer redacts names, emails, and numbers in place.", true);

/* 52. TOKENIZER SPLIT */
css.push(
`.nfa-tkz{display:flex;flex-direction:column;gap:12px;align-items:center}`,
`.nfa-tkz .word{font-family:ui-monospace,Menlo,monospace;font-size:15px;color:var(--muted);animation:nfaTkzW 3s ease-in-out infinite}`,
`.nfa-tkz .toks{display:flex;gap:5px}`,
`.nfa-tkz .toks span{font-family:ui-monospace,Menlo,monospace;font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(var(--info-rgb),.14);border:1px solid rgba(var(--info-rgb),.45);color:var(--info);opacity:0;transform:translateY(-8px);animation:nfaTkzS 3s ease-in-out infinite}`,
`.nfa-tkz .toks span:nth-child(2){animation-delay:.15s}.nfa-tkz .toks span:nth-child(3){animation-delay:.3s}.nfa-tkz .toks span:nth-child(4){animation-delay:.45s}`,
`@keyframes nfaTkzW{0%,100%{opacity:1}45%,70%{opacity:.25}}`,
`@keyframes nfaTkzS{0%,35%{opacity:0;transform:translateY(-8px)}55%,90%{opacity:1;transform:translateY(0)}}`
);
add("ai-tokenizer","Tokenizer","info",
`<div class="nfa-tkz"><div class="word">tokenization</div><div class="toks"><span>token</span><span>iz</span><span>ation</span></div></div>`,
"A word splits into subword tokens — the byte-pair pieces the model actually consumes.");

/* 53. CONTEXT COMPACTION */
css.push(
`.nfa-comp{width:100%;display:flex;flex-direction:column;gap:9px;align-items:center}`,
`.nfa-comp .bars{display:flex;gap:4px;align-items:center;height:40px}`,
`.nfa-comp .bars i{width:8px;height:36px;border-radius:3px;background:var(--crit);animation:nfaComp 3.4s ease-in-out infinite}`,
`.nfa-comp .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaComp{0%,20%{transform:scaleX(1);opacity:1}55%,100%{transform:scaleX(.25);opacity:.55}}`
);
add("ai-context-compaction","Context Compaction","crit",
`<div class="nfa-comp"><div class="bars">${Array.from({length:12}).map((_,i)=>`<i style="animation-delay:${(i*0.06).toFixed(2)}s"></i>`).join("")}</div><div class="lb">18k → 4k tokens · summarized</div></div>`,
"When the window fills, older turns compress into a summary — the history is compacted.", true);

/* 54. MULTIMODAL FUSION */
css.push(
`.nfa-mm{position:relative;width:200px;height:110px}`,
`.nfa-mm .core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:12px;background:radial-gradient(circle at 35% 30%,#fff,var(--crit) 60%);box-shadow:0 0 16px rgba(var(--crit-rgb),.6);z-index:3}`,
`.nfa-mm .m{position:absolute;width:40px;height:40px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:18px}`,
`.nfa-mm .m1{left:0;top:6px}.nfa-mm .m2{left:0;bottom:6px}.nfa-mm .m3{right:0;top:34px}`,
`.nfa-mm .fl{position:absolute;top:50%;height:2px;transform-origin:left center;background:linear-gradient(90deg,var(--crit),transparent);animation:nfaMm 2.6s ease-in-out infinite}`,
`@keyframes nfaMm{0%,100%{opacity:.2}50%{opacity:1}}`
);
add("ai-multimodal-fusion","Multimodal","crit",
`<div class="nfa-mm"><span class="fl" style="left:40px;width:60px;transform:rotate(18deg)"></span><span class="fl" style="left:40px;width:60px;transform:rotate(-18deg);animation-delay:.3s"></span><span class="fl" style="right:40px;width:60px;transform:rotate(0deg);animation-delay:.6s"></span><span class="m m1">🖼️</span><span class="m m2">🔊</span><span class="m m3">📝</span><span class="core"></span></div>`,
"Image, audio, and text stream into a shared representation — modalities fusing into one core.", true);

/* 55. DIM REDUCTION (points converging) */
css.push(
`.nfa-dr{position:relative;width:170px;height:110px;border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden}`,
`.nfa-dr i{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--info);box-shadow:0 0 7px rgba(var(--info-rgb),.6);animation:nfaDr 4s ease-in-out infinite}`,
`@keyframes nfaDr{0%,100%{transform:translate(0,0);opacity:.5}50%{transform:translate(var(--dx),var(--dy));opacity:1}}`
);
{
  const pts=[[20,20,40,30],[80,15,-20,35],[140,30,-70,10],[30,80,35,-25],[120,85,-45,-30],[70,50,5,-5],[150,70,-60,-15],[45,45,20,0],[100,25,-25,20],[60,90,10,-40]];
  add("ai-dim-reduction","Dim Reduction","info",
  `<div class="nfa-dr">${pts.map((p,i)=>`<i style="left:${p[0]}px;top:${p[1]}px;--dx:${p[2]}px;--dy:${p[3]}px;animation-delay:${(i*0.12).toFixed(2)}s"></i>`).join("")}</div>`,
  "High-dimensional vectors project down to 2-D — points drift toward their clusters.");
}

/* 56. CONTENT CLASSIFIER */
css.push(
`.nfa-cls{width:100%;display:flex;flex-direction:column;gap:7px}`,
`.nfa-cls .c{display:flex;align-items:center;gap:9px;font-size:11px;color:var(--muted)}`,
`.nfa-cls .c .n{width:64px;flex:0 0 auto}`,
`.nfa-cls .c .tr{flex:1;height:8px;border-radius:5px;background:var(--panel2);overflow:hidden}`,
`.nfa-cls .c .fl{height:100%;border-radius:5px;width:0;animation:nfaCls 3s ease-in-out infinite}`,
`@keyframes nfaCls{0%{width:0}50%{width:var(--w)}100%{width:0}}`
);
add("ai-content-classifier","Classifier","warn",
`<div class="nfa-cls"><div class="c"><span class="n">safe</span><span class="tr"><span class="fl" style="--w:92%;background:var(--pos)"></span></span></div><div class="c"><span class="n">spam</span><span class="tr"><span class="fl" style="--w:12%;background:var(--warn);animation-delay:.3s"></span></span></div><div class="c"><span class="n">toxic</span><span class="tr"><span class="fl" style="--w:5%;background:var(--neg);animation-delay:.6s"></span></span></div></div>`,
"A moderation classifier scores the input across categories before it reaches the model.", true);

/* 57. TOOL RESULT RETURN */
css.push(
`.nfa-tres{position:relative;width:230px;height:64px;display:flex;align-items:center;justify-content:space-between}`,
`.nfa-tres .end{width:52px;height:52px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:18px;z-index:2}`,
`.nfa-tres .end.t{border-color:rgba(var(--pos-rgb),.5)}`,
`.nfa-tres .wire{position:absolute;left:52px;right:52px;top:50%;height:2px;background:var(--line);transform:translateY(-50%)}`,
`.nfa-tres .pk{position:absolute;top:-8px;right:0;font-family:ui-monospace,Menlo,monospace;font-size:9px;padding:2px 6px;border-radius:5px;background:rgba(var(--pos-rgb),.15);border:1px solid rgba(var(--pos-rgb),.5);color:#bff0c8;animation:nfaTres 2.8s ease-in-out infinite}`,
`@keyframes nfaTres{0%,100%{right:0;opacity:0}12%{opacity:1}55%{right:calc(100% - 52px);opacity:1}70%,100%{right:calc(100% - 52px);opacity:0}}`
);
add("ai-tool-result","Tool Result","pos",
`<div class="nfa-tres"><div class="end">🧠</div><div class="wire"><span class="pk">{ ok:true }</span></div><div class="end t">🛠</div></div>`,
"A tool finishes and its JSON result travels back to the model to continue reasoning.", true);

/* 58. HEARTBEAT (ECG) */
css.push(
`.nfa-ecg{width:100%;display:flex;flex-direction:column;gap:6px;align-items:center}`,
`.nfa-ecg svg{width:220px;height:56px}`,
`.nfa-ecg .ln{fill:none;stroke:var(--neg);stroke-width:2;filter:drop-shadow(0 0 4px rgba(var(--neg-rgb),.6));stroke-dasharray:420;stroke-dashoffset:420;animation:nfaEcg 2.2s linear infinite}`,
`.nfa-ecg .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaEcg{to{stroke-dashoffset:0}}`
);
add("ai-heartbeat","Service Heartbeat","neg",
`<div class="nfa-ecg"><svg viewBox="0 0 220 56"><path class="ln" d="M0 28 H60 l8 -18 l10 36 l8 -18 H130 l6 -10 l6 10 H220"/></svg><span class="lb">endpoint healthy · 200 OK</span></div>`,
"An ECG trace draws across to signal the inference endpoint is alive and responding.", true);

/* 59. MODEL ROUTER */
css.push(
`.nfa-mr{position:relative;width:230px;height:110px}`,
`.nfa-mr .req{position:absolute;left:4px;top:50%;transform:translateY(-50%);font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:5px 9px;border-radius:7px;background:var(--panel2);border:1px solid var(--accent);color:var(--ink)}`,
`.nfa-mr .m{position:absolute;right:4px;width:78px;height:26px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);font-size:9.5px;display:flex;align-items:center;justify-content:center;color:var(--muted)}`,
`.nfa-mr .m1{top:8px}.nfa-mr .m2{top:42px;animation:nfaMrLit 3.2s ease-in-out infinite}.nfa-mr .m3{top:76px}`,
`.nfa-mr .rt{position:absolute;left:78px;top:50%;height:2px;transform-origin:left center;background:linear-gradient(90deg,var(--accent),transparent);opacity:0;animation:nfaMrRt 3.2s ease-in-out infinite}`,
`@keyframes nfaMrLit{0%,100%{border-color:var(--line);color:var(--muted);box-shadow:none}30%,60%{border-color:var(--accent);color:var(--ink);box-shadow:0 0 12px rgba(var(--accent-rgb),.4)}}`,
`@keyframes nfaMrRt{0%,100%{opacity:0}30%,60%{opacity:.9}}`
);
add("ai-model-router","Model Router","accent",
`<div class="nfa-mr"><span class="req">prompt</span><span class="rt" style="width:80px;transform:rotate(0deg);animation-delay:0s"></span><span class="m m1">nano</span><span class="m m2">standard</span><span class="m m3">pro</span></div>`,
"A router weighs cost and difficulty, then dispatches the prompt to the right model tier.", true);

/* 60. TOKEN WAVE */
css.push(
`.nfa-wave{display:flex;gap:3px;align-items:center;height:44px}`,
`.nfa-wave span{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--info);display:inline-block;animation:nfaWave 1.4s ease-in-out infinite}`,
`@keyframes nfaWave{0%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-9px);opacity:1}}`
);
add("ai-token-wave","Token Wave","info",
`<div class="nfa-wave">${"streaming…".split("").map((ch,i)=>`<span style="animation-delay:${(i*0.08).toFixed(2)}s">${ch}</span>`).join("")}</div>`,
"Characters ripple in a travelling wave — a playful streaming-in-progress signature.");

/* 61. WORKING RING (conic spinner + label) */
css.push(
`.nfa-ring{display:flex;flex-direction:column;align-items:center;gap:12px}`,
`.nfa-ring .sp{width:52px;height:52px;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 20%,var(--accent));-webkit-mask:radial-gradient(closest-side,transparent 62%,#000 64%);mask:radial-gradient(closest-side,transparent 62%,#000 64%);animation:nfaSpin 1s linear infinite}`,
`.nfa-ring .lb{font-size:12px;color:var(--muted);font-weight:600}`
);
add("ai-working-ring","Working","accent",
`<div class="nfa-ring"><span class="sp"></span><span class="lb">Working…</span></div>`,
"A clean conic ring spins beside a status label — the minimal all-purpose busy state.");

/* 62. DIFFUSION DENOISE */
css.push(
`.nfa-dif{display:flex;flex-direction:column;gap:8px;align-items:center}`,
`.nfa-dif .grid{display:grid;grid-template-columns:repeat(10,11px);grid-template-rows:repeat(6,11px);gap:2px;border-radius:6px;overflow:hidden}`,
`.nfa-dif .grid i{width:11px;height:11px;background:var(--crit);animation:nfaDif 3.6s ease-in-out infinite}`,
`.nfa-dif .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaDif{0%{opacity:.9;background:var(--dim)}100%{opacity:.15;background:var(--crit)}}`
);
{
  let cells="";
  for(let i=0;i<60;i++){cells+=`<i style="animation-delay:${(Math.random()*1.6).toFixed(2)}s"></i>`;}
  add("ai-diffusion","Diffusion Denoise","crit",
  `<div class="nfa-dif"><div class="grid">${cells}</div><div class="lb">t = 50 → 0 · denoising</div></div>`,
  "A noisy latent grid resolves toward a clean image as the diffusion steps count down.");
}

/* 63. QUANTIZATION (bit depth stepping) */
css.push(
`.nfa-qz{display:flex;flex-direction:column;gap:10px;align-items:center}`,
`.nfa-qz .steps{display:flex;gap:5px;align-items:flex-end;height:44px}`,
`.nfa-qz .steps i{width:12px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,var(--warn),rgba(var(--warn-rgb),.3));animation:nfaQz 3s ease-in-out infinite}`,
`.nfa-qz .lb{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--muted)}`,
`@keyframes nfaQz{0%,100%{height:44px}50%{height:14px}}`
);
add("ai-quantization","Quantization","warn",
`<div class="nfa-qz"><div class="steps"><i style="animation-delay:0s"></i><i style="animation-delay:.15s"></i><i style="animation-delay:.3s"></i><i style="animation-delay:.45s"></i><i style="animation-delay:.6s"></i><i style="animation-delay:.75s"></i></div><div class="lb">fp16 → int4 · weights</div></div>`,
"Weight precision steps down in bit depth — the model quantizing for cheaper inference.");

/* 64. CONSENSUS VOTE */
css.push(
`.nfa-vote{width:100%;display:flex;flex-direction:column;gap:9px}`,
`.nfa-vote .row{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)}`,
`.nfa-vote .row .ag{width:22px;height:22px;flex:0 0 auto;border-radius:7px;background:var(--panel2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:12px}`,
`.nfa-vote .row .tr{flex:1;height:9px;border-radius:5px;background:var(--panel2);overflow:hidden}`,
`.nfa-vote .row .fl{height:100%;border-radius:5px;width:0;background:var(--pos);animation:nfaVote 2.6s ease-out forwards}`,
`.nfa-vote .row .bad{width:30px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--pos)}`,
`@keyframes nfaVote{to{width:var(--w)}}`
);
add("ai-consensus-vote","Consensus","pos",
`<div class="nfa-vote"><div class="row"><span class="ag">🤖</span><span class="tr"><span class="fl" style="--w:100%"></span></span><span class="bad">A</span></div><div class="row"><span class="ag">🤖</span><span class="tr"><span class="fl" style="--w:100%;animation-delay:.2s"></span></span><span class="bad">A</span></div><div class="row"><span class="ag">🤖</span><span class="tr"><span class="fl" style="--w:64%;background:var(--warn);animation-delay:.4s"></span></span><span class="bad" style="color:var(--warn)">B</span></div></div>`,
"Self-consistency sampling — several runs vote and the majority answer wins.", true);

/* 65. SANDBOX RUN */
css.push(
`.nfa-sbx{width:100%;background:#080b12;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-family:ui-monospace,Menlo,monospace;font-size:10.5px}`,
`.nfa-sbx .hd{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);color:var(--muted)}`,
`.nfa-sbx .hd .sp{width:11px;height:11px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--info);animation:nfaSpin .7s linear infinite}`,
`.nfa-sbx .bd{padding:9px 11px;line-height:1.7;color:var(--muted)}`,
`.nfa-sbx .bd .ok{color:var(--pos)}`,
`.nfa-sbx .bd .l{opacity:0;animation:nfaJs .5s ease-out forwards}`,
`.nfa-sbx .bd .l:nth-child(2){animation-delay:.6s}.nfa-sbx .bd .l:nth-child(3){animation-delay:1.2s}`
);
add("ai-sandbox-run","Code Sandbox","info",
`<div class="nfa-sbx"><div class="hd"><span class="sp"></span>python · sandbox</div><div class="bd"><div class="l">&gt;&gt;&gt; solve(n=42)</div><div class="l">computing…</div><div class="l"><span class="ok">✓ result = 7</span></div></div></div>`,
"Generated code executes in an isolated sandbox and the agent reads back the result.", true);

/* 66. KNOWLEDGE GRAPH TRAVERSAL */
css.push(
`.nfa-kg{position:relative;width:200px;height:120px}`,
`.nfa-kg .nd{position:absolute;width:14px;height:14px;border-radius:50%;background:var(--panel2);border:2px solid var(--line);transform:translate(-50%,-50%)}`,
`.nfa-kg .nd.on{border-color:var(--crit);background:var(--crit);box-shadow:0 0 10px rgba(var(--crit-rgb),.6);animation:nfaKgN 3.2s ease-in-out infinite}`,
`.nfa-kg .nd.on.d2{animation-delay:.8s}.nfa-kg .nd.on.d3{animation-delay:1.6s}`,
`.nfa-kg .ed{position:absolute;height:2px;transform-origin:left center;background:var(--line)}`,
`.nfa-kg .ed.on{background:linear-gradient(90deg,var(--crit),rgba(var(--crit-rgb),.2));animation:nfaKgE 3.2s ease-in-out infinite}`,
`.nfa-kg .ed.on.d2{animation-delay:.8s}`,
`@keyframes nfaKgN{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.25)}}`,
`@keyframes nfaKgE{0%,100%{opacity:.3}50%{opacity:1}}`
);
add("ai-knowledge-graph","Knowledge Graph","crit",
`<div class="nfa-kg"><span class="ed on" style="left:36px;top:30px;width:70px;transform:rotate(20deg)"></span><span class="ed on d2" style="left:104px;top:56px;width:60px;transform:rotate(-30deg)"></span><span class="ed" style="left:36px;top:30px;width:56px;transform:rotate(70deg)"></span><span class="nd on" style="left:36px;top:30px"></span><span class="nd on d2" style="left:104px;top:56px"></span><span class="nd on d3" style="left:158px;top:30px"></span><span class="nd" style="left:60px;top:96px"></span><span class="nd" style="left:150px;top:96px"></span></div>`,
"The agent walks a knowledge graph, hopping node to node along the relevant relation path.", true);

/* ================= FINAL WRITE ================= */
const tiles = fx.map(f => {
  const wide = f.wide ? " w2" : "";
  return `<div class="panel is-new${wide}" style="--c:var(--${f.color})" data-fx-id="${f.id}"><div class="ptitle"><span class="tdot"></span>${f.name}</div><div class="pbody">${f.body}</div><div class="cap">${f.cap}</div></div>`;
});

const out = {
  gallery: "ai",
  sectionLabel: "✦ New — AI Working",
  css: css.join("\n"),
  tiles
};

writeFileSync(new URL("./ai.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote ai.json with", tiles.length, "tiles");
