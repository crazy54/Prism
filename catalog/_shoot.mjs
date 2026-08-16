/* Screenshot each gallery's rendered content for visual review (CDP, no deps).
   Loads the shell, drives in-app nav to the page, extracts the mounted iframe's full
   HTML, writes it to a temp file, loads THAT directly, and captures a full-page PNG
   (captureBeyondViewport) so every tile is visible. Output: catalog/shots/<page>.png

   Usage: node catalog/_shoot.mjs [page1 page2 ...]   (default: charts fx ai desktop) */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveChrome } from './_chrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(HERE, '../Prism.html');
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const CHROME = resolveChrome();
const PAGES = process.argv.slice(2);
if (!PAGES.length) PAGES.push('charts', 'fx', 'ai', 'desktop');
const PORT = 9355;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = mkdtempSync(tmpdir() + '/prism-');

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
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

  // 1) Load the shell, drive nav to each page, and harvest the mounted iframe HTML.
  await send('Page.navigate', { url: FILE });
  await sleep(2600);
  const html = {};
  for (const page of PAGES) {
    await send('Runtime.evaluate', { expression:
      `(function(){var a=document.querySelector('a[data-page="${page}"]');if(a)a.click();})()` });
    await sleep(3000);
    // Harvest the FULL mounted document (keeps body <style> + <script> intact so
    // effects render exactly as on the page). We only *hide* non-new tiles with an
    // injected stylesheet so the shot stays focused on is-new / is-fixed items.
    const r = await send('Runtime.evaluate', { expression:
      `(function(){
        var f=document.getElementById('gv');var d=f&&f.contentDocument;if(!d)return '';
        var html='<!DOCTYPE html>'+d.documentElement.outerHTML;
        var hide='<style id="shoot-focus">'+
          '.tile:not(.is-new):not(.is-fixed),.panel:not(.is-new):not(.is-fixed){display:none!important}'+
          '.wrap>h3.sec,.wrap>h2,.head{display:none!important}'+
          'body{padding-bottom:0!important}</style>';
        return html.replace('</head>', hide+'</head>');
      })()`,
      returnByValue: true });
    html[page] = r.result.value || '';
    const file = resolve(tmp, page + '.html');
    writeFileSync(file, html[page]);
  }

  // 2) Load each harvested page directly & full-page screenshot.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const page of PAGES) {
    if (!html[page]) { console.log(page, '-> EMPTY, skipped'); continue; }
    await send('Page.navigate', { url: 'file://' + resolve(tmp, page + '.html') });
    await sleep(1800);
    // Measure full content height.
    const m = await send('Runtime.evaluate', { expression:
      'Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)', returnByValue: true });
    const h = Math.min(m.result.value || 900, 30000);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(resolve(SHOTS, page + '.png'), Buffer.from(shot.data, 'base64'));
    console.log(page, '-> shot', h + 'px tall');
  }
} catch (e) {
  console.error('SHOOT FAILED:', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  proc.kill('SIGKILL');
}
