/* Screenshot the Prism SHELL (chrome + mounted gallery) at a given theme, for visual
   review of the Cloudscape re-skin. Windows/Chrome. No deps.

   Usage: node catalog/_shell-shot.mjs [theme] [page] [width] [height]
   e.g.   node catalog/_shell-shot.mjs cloudscape-dark charts 1440 900
   Output: catalog/shots/shell-<theme>-<page>.png */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(HERE, '../Prism.html').replace(/\\/g, '/');
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const THEME = process.argv[2] || 'cloudscape-dark';
const PAGE = process.argv[3] || 'charts';
const W = parseInt(process.argv[4] || '1440', 10);
const H = parseInt(process.argv[5] || '900', 10);
const PORT = 9366;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = resolve(HERE, '.chrome-shell-' + PORT);
const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  `--window-size=${W},${H}`,
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => { const m = ++id; ws.send(JSON.stringify({ id: m, method, params })); return new Promise(r => pending.set(m, r)); };

try {
  let target;
  for (let i = 0; i < 40; i++) {
    try { const j = await (await fetch(`http://localhost:${PORT}/json`)).json();
      target = j.find(t => t.type === 'page'); if (target) break; } catch {}
    await sleep(150);
  }
  if (!target) throw new Error('no devtools target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // Seed theme + dismissal in localStorage BEFORE load so the shell paints the
  // right mode from first frame (applyTheme lives inside the IIFE, not on window).
  await send('Runtime.addScriptToEvaluateOnNewDocument', { source: `
    try{ localStorage.setItem('prismTheme', ${JSON.stringify(THEME)}); }catch(e){}
    try{ localStorage.setItem('prismRevealSeen','1'); }catch(e){}
  ` });
  await send('Page.navigate', { url: FILE });
  await sleep(2800);
  // Route to the requested page, switch mode by clicking the real toggle (applyTheme
  // lives inside the IIFE, not on window), and clear any reveal/veil covering the shot.
  await send('Runtime.evaluate', { expression: `
    (function(){
      var m=document.getElementById('prReveal'); if(m) m.classList.remove('open');
      if(window.PrismShell && PrismShell.go){ PrismShell.go('${PAGE}'); } else { location.hash='#${PAGE}'; }
      var v=document.getElementById('veil'); if(v){ v.classList.add('gone'); }
      var btn=document.querySelector('.cs-mode button[data-mode=${JSON.stringify(THEME)}]');
      if(btn) btn.click();
    })();
  `, awaitPromise: false });
  await sleep(2600);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const out = resolve(SHOTS, `shell-${THEME}-${PAGE}.png`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('WROTE', out);
} catch (e) {
  console.error('ERR', e && e.message || e);
  process.exitCode = 1;
} finally {
  try { proc.kill(); } catch {}
}
