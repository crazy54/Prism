#!/usr/bin/env node
// Regenerate the raster golden images: render a representative set of facets (and
// synthetic subset-feature sheets) to SVG, rasterize each in headless Chrome, store
// both under test/goldens/ (<name>.svg.gz + <name>.png + manifest.json). test/raster.test.js then compares src/raster against them
// without needing Chrome.
//
//   node scripts/raster-goldens.mjs                 regenerate everything
//   node scripts/raster-goldens.mjs --only=key-     only cases whose name starts with key-
//   node scripts/raster-goldens.mjs --compare       just print rasterizer-vs-Chrome stats (writes nothing)
//   node scripts/raster-goldens.mjs --encoders      decode our PNG/GIF/JPEG/BMP output in Chrome and compare
//   CHROME_PATH=… overrides the browser.
//
// Chrome is a goldens-time tool only (never a runtime dependency). One headless instance,
// driven over --remote-debugging-pipe (no port, no WebSocket), killed on exit.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findFacet } from '../src/facets/index.js';
import { render, stillTime } from '../src/render.js';
import { rasterize, encodePNG, decodePNG, encodeGIF, encodeJPEG, encodeBMP, diffImages } from '../src/raster/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test', 'goldens');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ── headless Chrome over a pipe ──────────────────────────────────────────────

export async function withChrome(fn, { chrome = CHROME } = {}) {
  const prof = mkdtempSync(path.join(tmpdir(), 'raster-goldens-'));
  // a file: page is a secure context (ImageDecoder needs one); about:blank is not
  const blank = path.join(prof, 'blank.html');
  writeFileSync(blank, '<!doctype html><title>raster goldens</title>');
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--remote-debugging-pipe', `--user-data-dir=${prof}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-extensions', pathToFileURL(blank).href],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const toChrome = child.stdio[3], fromChrome = child.stdio[4];
  let id = 0, buf = '';
  const pending = new Map();
  fromChrome.on('data', (d) => {
    buf += d.toString('utf8');
    let z;
    while ((z = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, z));
      buf = buf.slice(z + 1);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    toChrome.write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  try {
    let page;
    for (let k = 0; k < 50 && !page; k++) {
      const { targetInfos } = await send('Target.getTargets');
      page = targetInfos.find((t) => t.type === 'page' && t.url.startsWith('file:'));
      if (!page) await new Promise((r) => setTimeout(r, 100));
    }
    if (!page) throw new Error('no page target');
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    return await fn(evaluate);
  } finally {
    // close politely (renderers exit with the browser), then make sure
    const exited = new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    send('Browser.close').catch(() => {});
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null) { child.kill(); await exited; }
    try { rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  }
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

/** Decode an image (data URL) in Chrome and read back RGBA at w×h. */
async function chromePixels(evaluate, src, w, h) {
  const out = await evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, ${w}, ${h});
    const d = g.getImageData(0, 0, ${w}, ${h}).data;
    let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  return { data: new Uint8ClampedArray(Buffer.from(out, 'base64')), w, h };
}

/** Same SVG at w×h: rewrite the root width/height so Chrome rasterizes at that size (never a bitmap rescale). */
export function sized(svg, w, h) {
  return svg.replace(/^<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\swidth="[^"]*"/, ` width="${w}"`).replace(/\sheight="[^"]*"/, ` height="${h}"`)}>`);
}

export const chromeRaster = (evaluate, svg, w, h) => chromePixels(evaluate, `data:image/svg+xml;base64,${b64(sized(svg, w, h))}`, w, h);

// ── the cases ────────────────────────────────────────────────────────────────

const facet = (name, id, opts, pick, size) => ({ name, id, opts, pick, size });
export const FACET_CASES = [
  facet('key-prism-mic-144', 'icon-mic', { size: 144, theme: 'prism' }),
  facet('key-prism-day-volume-72', 'icon-volume', { size: 72, theme: 'prism', mode: 'light' }),
  facet('key-pixel-wifi-160', 'icon-wifi', { size: 160, theme: 'pixel' }),
  facet('key-pixel-day-battery-72', 'icon-battery', { size: 72, theme: 'pixel', mode: 'light' }),
  facet('key-phosphor-cpu-144', 'icon-cpu', { size: 144, theme: 'phosphor' }),
  facet('key-phosphor-terminal-96', 'icon-terminal', { size: 96, theme: 'phosphor' }),
  facet('key-neon-rocket-120', 'icon-rocket', { size: 120, theme: 'neon' }),
  facet('key-neon-record-on-144', 'icon-record', { size: 144, theme: 'neon', state: 1 }),
  facet('key-ember-bulb-96', 'icon-bulb', { size: 96, theme: 'ember' }),
  facet('key-ember-day-alarm-112', 'icon-alarm', { size: 112, theme: 'ember', mode: 'light' }),
  facet('key-porcelain-calendar-144', 'icon-calendar', { size: 144, theme: 'porcelain' }),
  facet('key-paper-mail-80', 'icon-mail', { size: 80, theme: 'paper' }),
  facet('key-aurora-headphones-160', 'icon-headphones', { size: 160, theme: 'aurora' }),
  facet('key-blueprint-git-branch-144', 'icon-git-branch', { size: 144, theme: 'blueprint' }),
  facet('key-chrome-power-studio', 'icon-power', { device: 'studio', theme: 'chrome' }),
  facet('key-mono-search-72', 'icon-search', { size: 72, theme: 'mono' }),
  facet('motion-press-ripple-144', 'press-ripple', { size: 144, theme: 'prism', pressAge: 0.12 }),
  facet('motion-alert-countdown-120', 'alert-countdown', { size: 120, theme: 'neon' }),
  facet('motion-idle-orbit-160', 'idle-orbit', { size: 160, theme: 'aurora' }),
  facet('app-cpu-ring-144', 'app-cpu-ring', { size: 144, theme: 'prism' }),
  facet('app-focus-timer-day-80', 'app-focus-timer', { size: 80, theme: 'porcelain' }),
  facet('span-waveform-galleon-k1', 'span-waveform', { device: 'galleon', theme: 'neon' }, { key: 1 }),
  facet('span-first-light-mk2-k7', 'span-first-light', { device: 'mk2', theme: 'prism' }, { key: 7 }),
  facet('strip-dial-volume-200', 'dial-volume', { device: 'plus', segments: 1, theme: 'ember', value: 0.62 }),
  facet('strip-refraction-800', 'strip-refraction', { device: 'plus', theme: 'prism' }),
  facet('strip-refraction-seg2', 'strip-refraction', { device: 'plus', theme: 'blueprint' }, { segment: 2 }),
  facet('screen-galleon-dashboard', 'screen-galleon-dashboard', { screen: 'galleon', device: 'galleon', theme: 'prism' }),
  facet('screen-galleon-widget-day', 'screen-galleon-dashboard', { screen: 'galleon', device: 'galleon', theme: 'paper' }, { widget: 1 }),
  facet('screen-neo-clock', 'screen-neo-clock', { screen: 'infobar', device: 'neo', theme: 'phosphor' }),
  facet('scaled-mic-144-to-72', 'icon-mic', { size: 144, theme: 'prism' }, null, [72, 72]),
  facet('scaled-cpu-72-to-200', 'icon-cpu', { size: 72, theme: 'ember' }, null, [200, 200]),
];

const S = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
/** Synthetic sheets exercising every corner of the subset the facets don't (yet) use. */
export const SYNTHETIC_CASES = [
  { name: 'synth-fill-rules', svg: S(160, 160, '<rect width="160" height="160" fill="#10131c"/>'
    + '<path d="M40 8L58 70L6 30H74L22 70Z" fill="#b8a2f2" fill-rule="evenodd"/>'
    + '<path d="M120 8L138 70L86 30H154L102 70Z" fill="#7dd3c0"/>'
    + '<path d="M10 90H70V150H10ZM25 105V135H55V105Z" fill="#f2a65a" fill-rule="evenodd"/>'
    + '<path d="M90 90H150V150H90ZM105 105H135V135H105Z" fill="#f25a7a"/>'
    + '<polygon points="80,84 84,96 76,96" fill="#ffffff"/><polyline points="60,80 100,80 100,88" fill="#839ef4" stroke="none"/>') },
  { name: 'synth-joins-caps', svg: S(160, 160, '<rect width="160" height="160" fill="#f6f5f9"/>'
    + '<polyline points="12,40 40,12 68,40" fill="none" stroke="#7353bb" stroke-width="10" stroke-linejoin="miter"/>'
    + '<polyline points="92,40 120,12 148,40" fill="none" stroke="#7353bb" stroke-width="10" stroke-linejoin="round"/>'
    + '<polyline points="12,80 40,52 68,80" fill="none" stroke="#7353bb" stroke-width="10" stroke-linejoin="bevel"/>'
    + '<polyline points="92,80 120,62 148,80" fill="none" stroke="#2b7a5f" stroke-width="8" stroke-linejoin="miter" stroke-miterlimit="1.2"/>'
    + '<line x1="20" y1="100" x2="60" y2="100" stroke="#c0392b" stroke-width="10" stroke-linecap="butt"/>'
    + '<line x1="20" y1="122" x2="60" y2="122" stroke="#c0392b" stroke-width="10" stroke-linecap="round"/>'
    + '<line x1="20" y1="144" x2="60" y2="144" stroke="#c0392b" stroke-width="10" stroke-linecap="square"/>'
    + '<path d="M100 100L140 140M140 100L100 140" stroke="#1f2a44" stroke-width="3.5" stroke-linecap="round"/>'
    + '<path d="M80 120Z" stroke="#1f2a44" stroke-width="9" stroke-linecap="round"/><path d="M80 140L80 140" stroke="#1f2a44" stroke-width="7" stroke-linecap="square"/>'
    + '<rect x="70.5" y="92.5" width="19" height="13" rx="4" fill="none" stroke="#1f2a44" stroke-width="1"/>') },
  { name: 'synth-dashes', svg: S(160, 160, '<rect width="160" height="160" fill="#0a0c12"/>'
    + '<circle cx="42" cy="42" r="30" fill="none" stroke="#b8a2f2" stroke-width="6" stroke-dasharray="12 6 2 6" stroke-dashoffset="5"/>'
    + '<circle cx="118" cy="42" r="30" fill="none" stroke="#7dd3c0" stroke-width="7" stroke-linecap="round" stroke-dasharray="0 11"/>'
    + '<rect x="12" y="86" width="60" height="60" rx="10" fill="none" stroke="#f2a65a" stroke-width="4" stroke-dasharray="9,5" stroke-dashoffset="-3"/>'
    + '<path d="M90 146C90 90 150 146 150 90" fill="none" stroke="#f25a7a" stroke-width="5" stroke-dasharray="14 4 1" stroke-linecap="square"/>'
    + '<polyline points="88,100 104,88 120,108 136,92" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 2" stroke-linejoin="round"/>') },
  { name: 'synth-gradients', svg: S(200, 160, '<defs>'
    + '<linearGradient id="g1" x1="0" y1="0" x2="0.3" y2="0" spreadMethod="reflect"><stop offset="0" stop-color="#b8a2f2"/><stop offset="1" stop-color="#10131c"/></linearGradient>'
    + '<linearGradient id="g2" x1="0" y1="0" x2="0.25" y2="0" spreadMethod="repeat" gradientTransform="rotate(30 0.5 0.5)"><stop offset="0" stop-color="#7dd3c0"/><stop offset="0.5" stop-color="#f2a65a" stop-opacity="0.4"/><stop offset="1" stop-color="#7dd3c0"/></linearGradient>'
    + '<radialGradient id="g3" cx="0.5" cy="0.5" r="0.5" fx="0.25" fy="0.3"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#839ef4"/><stop offset="1" stop-color="#1f2a44"/></radialGradient>'
    + '<radialGradient id="g4" gradientUnits="userSpaceOnUse" cx="150" cy="120" r="34" spreadMethod="repeat"><stop offset="0.2" stop-color="#f25a7a"/><stop offset="0.8" stop-color="#10131c"/></radialGradient>'
    + '<linearGradient id="g5" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="190" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="0.5" stop-color="#00ff00" stop-opacity="0"/><stop offset="1" stop-color="#0000ff"/></linearGradient>'
    + '<radialGradient id="g6" cx="0.5" cy="1.05" r="0.9" gradientTransform="translate(0.5 0.5) scale(1 0.6) translate(-0.5 -0.5)"><stop offset="0" stop-color="#7353bb" stop-opacity="0.9"/><stop offset="1" stop-color="#7353bb" stop-opacity="0"/></radialGradient>'
    + '</defs><rect width="200" height="160" fill="#202430"/>'
    + '<rect x="8" y="8" width="88" height="60" fill="url(#g1)"/><rect x="104" y="8" width="88" height="60" fill="url(#g2)"/>'
    + '<circle cx="50" cy="114" r="38" fill="url(#g3)"/><rect x="104" y="80" width="88" height="72" fill="url(#g4)"/>'
    + '<rect x="10" y="72" width="180" height="6" fill="url(#g5)"/><rect x="104" y="80" width="88" height="72" fill="url(#g6)"/>'
    + '<path d="M14 150H90" stroke="url(#g5)" stroke-width="5"/>') },
  { name: 'synth-clips', svg: S(160, 160, '<defs>'
    + '<clipPath id="c1"><circle cx="40" cy="40" r="30"/></clipPath>'
    + '<clipPath id="c2" clipPathUnits="objectBoundingBox" transform="rotate(10 0.5 0.5)"><rect x="0.1" y="0.1" width="0.8" height="0.35"/><rect x="0.1" y="0.55" width="0.8" height="0.35"/></clipPath>'
    + '<clipPath id="c3"><path d="M90 90H150V150H90ZM105 105V135H135V105Z" clip-rule="evenodd"/></clipPath>'
    + '<clipPath id="c4" clip-path="url(#c5)"><rect x="10" y="90" width="60" height="60" rx="12" transform="rotate(8 40 120)"/></clipPath>'
    + '<clipPath id="c5"><circle cx="40" cy="120" r="34"/></clipPath>'
    + '</defs><rect width="160" height="160" fill="#f6f5f9"/>'
    + '<g clip-path="url(#c1)"><rect width="80" height="80" fill="#7353bb"/><path d="M0 0L80 80" stroke="#ffffff" stroke-width="6"/></g>'
    + '<rect x="90" y="10" width="60" height="60" fill="#2b7a5f" clip-path="url(#c2)"/>'
    + '<rect x="80" y="80" width="80" height="80" fill="#c0392b" clip-path="url(#c3)"/>'
    + '<g clip-path="url(#c4)"><rect x="0" y="80" width="80" height="80" fill="#1f2a44"/><circle cx="40" cy="120" r="12" fill="#f2a65a" clip-path="url(#c1)"/></g>') },
  { name: 'synth-opacity-transforms', svg: S(160, 160, '<rect width="160" height="160" fill="#10131c"/>'
    + '<g opacity="0.5"><circle cx="40" cy="40" r="26" fill="#b8a2f2"/><circle cx="62" cy="40" r="26" fill="#7dd3c0"/></g>'
    + '<rect x="96" y="14" width="50" height="50" fill="#f2a65a" stroke="#ffffff" stroke-width="8" opacity="0.6"/>'
    + '<g transform="translate(40 116) skewX(-20) rotate(15)"><rect x="-24" y="-24" width="48" height="48" fill="#f25a7a" fill-opacity="0.8"/></g>'
    + '<g transform="matrix(0.8 0.3 -0.2 0.9 92 84)"><ellipse cx="30" cy="30" rx="28" ry="14" fill="#839ef4" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/></g>'
    + '<svg x="96" y="110" width="50" height="40" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid slice"><circle cx="10" cy="10" r="9" fill="#7dd3c0"/><rect x="0" y="0" width="20" height="20" fill="none" stroke="#ffffff" stroke-width="2"/></svg>'
    + '<rect x="2%" y="92%" width="40%" height="5%" fill="white" opacity="0.3"/><circle cx="150" cy="150" r="3" fill="#fff"/>') },
];

export function caseSvg(c) {
  if (c.svg) return { svg: c.svg, w: +/width="(\d+)"/.exec(c.svg)[1], h: +/height="(\d+)"/.exec(c.svg)[1] };
  const f = findFacet(c.id);
  if (!f) throw new Error(`no facet ${c.id}`);
  const r = render(f, { t: stillTime(f) + 0.5, since: 0.2, now: Date.UTC(2026, 9, 15, 14, 30), idPrefix: 'pdg', ...c.opts });
  let svg = r.svg, w = r.w, h = r.h;
  if (c.pick?.key !== undefined) { svg = r.keys[c.pick.key].svg; }
  else if (c.pick?.segment !== undefined) svg = r.segments[c.pick.segment];
  else if (c.pick?.widget !== undefined) svg = r.widgets[c.pick.widget].svg;
  if (c.pick) { w = +/width="([\d.]+)"/.exec(svg)[1]; h = +/height="([\d.]+)"/.exec(svg)[1]; }
  if (c.size) [w, h] = c.size;
  return { svg, w, h };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  const cases = [...FACET_CASES, ...SYNTHETIC_CASES].filter((c) => !opt.only || c.name.startsWith(opt.only));
  if (opt.encoders) return encoderCheck();
  mkdirSync(OUT, { recursive: true });
  if (!opt.only && !opt.compare) for (const f of readdirSync(OUT)) rmSync(path.join(OUT, f));
  const manifest = [];
  await withChrome(async (evaluate) => {
    for (const c of cases) {
      const { svg, w, h } = caseSvg(c);
      const ref = await chromeRaster(evaluate, svg, w, h);
      const ours = rasterize(svg, w, h);
      const d = diffImages(ours, ref);
      console.log(`${c.name.padEnd(34)} ${String(w).padStart(4)}×${String(h).padEnd(4)} mean ${d.mean.toFixed(3)}  p99 ${String(d.p99).padStart(3)}  max ${String(d.max).padStart(3)}  >16 ${(d.over16 * 100).toFixed(2)}%  >48 ${(d.over48 * 100).toFixed(2)}%`);
      if (opt.compare) { if (opt.dump) { writeFileSync(path.join(opt.dump, `${c.name}.chrome.png`), encodePNG(ref)); writeFileSync(path.join(opt.dump, `${c.name}.ours.png`), encodePNG(ours)); } continue; }
      writeFileSync(path.join(OUT, `${c.name}.svg.gz`), gzipSync(svg, { level: 9 }));
      writeFileSync(path.join(OUT, `${c.name}.png`), encodePNG(ref));
      manifest.push({ name: c.name, w, h, source: c.id ? { facet: c.id, ...c.opts, ...(c.pick || {}) } : 'synthetic', chrome: d });
    }
  });
  if (!opt.compare) {
    const file = path.join(OUT, 'manifest.json');
    const prev = opt.only && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).cases.filter((c) => !manifest.some((m) => m.name === c.name)) : [];
    const all = [...prev, ...manifest].sort((a, b) => a.name.localeCompare(b.name));
    writeFileSync(file, JSON.stringify({ note: 'Chrome-rendered references for test/raster.test.js — regenerate with node scripts/raster-goldens.mjs', chrome: 'headless, <img> → canvas', cases: all.map(({ chrome, ...c }) => ({ ...c, stats: { mean: +chrome.mean.toFixed(3), p99: chrome.p99, max: chrome.max } })) }, null, 1) + '\n');
    console.log(`wrote ${manifest.length} goldens to ${path.relative(ROOT, OUT)}`);
  }
}

/** Our encoders' files decoded by Chrome must match what we encoded. */
async function encoderCheck() {
  const { svg } = caseSvg(FACET_CASES[0]);
  const img = rasterize(svg, 144, 144);
  const frames = [0, 0.3, 0.6].map((t) => rasterize(render(findFacet('idle-orbit'), { size: 144, theme: 'aurora', t }).svg));
  await withChrome(async (evaluate) => {
    const show = (label, d) => console.log(`${label.padEnd(26)} mean ${d.mean.toFixed(3)}  p99 ${d.p99}  max ${d.max}`);
    show('png', diffImages(img, await chromePixels(evaluate, `data:image/png;base64,${b64(encodePNG(img))}`, 144, 144)));
    show('jpeg q90 444', diffImages(img, await chromePixels(evaluate, `data:image/jpeg;base64,${b64(encodeJPEG(img, 90))}`, 144, 144)));
    show('jpeg q75 420', diffImages(img, await chromePixels(evaluate, `data:image/jpeg;base64,${b64(encodeJPEG(img, 75, { subsampling: '420' }))}`, 144, 144)));
    show('bmp standard', diffImages(img, await chromePixels(evaluate, `data:image/bmp;base64,${b64(encodeBMP(img, 'none', { rowOrder: 'bottom-up' }))}`, 144, 144)));
    for (const dither of [false, true]) {
      const gif = encodeGIF(frames, { delay: 1000 / 15, dither });
      const all = await evaluate(`(async () => {
        const bin = atob(${JSON.stringify(b64(gif))}), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const dec = new ImageDecoder({ data: bytes, type: 'image/gif' });
        await dec.tracks.ready;
        const out = [], n = dec.tracks.selectedTrack.frameCount;
        for (let i = 0; i < n; i++) {
          const { image } = await dec.decode({ frameIndex: i });
          const c = new OffscreenCanvas(144, 144), g = c.getContext('2d');
          g.drawImage(image, 0, 0);
          const d = g.getImageData(0, 0, 144, 144).data;
          let s = ''; for (let k = 0; k < d.length; k += 0x8000) s += String.fromCharCode.apply(null, d.subarray(k, k + 0x8000));
          out.push({ px: btoa(s), ms: image.duration / 1000 });
          image.close();
        }
        return out;
      })()`);
      all.forEach((f, i) => show(`gif${dither ? ' dither' : ''} frame ${i} (${f.ms} ms)`, diffImages(frames[i], { data: new Uint8ClampedArray(Buffer.from(f.px, 'base64')), w: 144, h: 144 })));
      console.log(`  gif${dither ? ' dither' : ''}: ${gif.length} bytes for ${frames.length} frames`);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
