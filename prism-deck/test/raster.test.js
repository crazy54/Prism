// Raster backend: the deck SVG subset rasterizer (against Chrome goldens), the PNG / GIF /
// JPEG / BMP encoders (round trips), device transforms, and per-key speed.
//
//   node --test test/raster.test.js
//   node scripts/raster-goldens.mjs     regenerate test/goldens/ (needs headless Chrome; tests don't)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  rasterize, RasterError, SUBSET_ELEMENTS, SUBSET_ATTRIBUTES,
  encodePNG, decodePNG, encodeGIF, decodeGIF, encodeJPEG, decodeJPEG, encodeBMP, decodeBMP, encodeKeyImage,
  transformImage, flattenImage, diffImages, TRANSFORMS,
} from '../src/raster/index.js';
import { zlibStored } from '../src/raster/png.js';
import { allFacets, findFacet } from '../src/facets/index.js';
import { renderTargets } from '../src/facets/schema.js';
import { render, stillTime } from '../src/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLD = path.join(ROOT, 'test', 'goldens');
const S = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>`;
const px = (img, x, y) => [...img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)];
const near = (a, b, tol, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${msg}: [${a}] vs [${b}]`));

// ── the subset ────────────────────────────────────────────────────────────────

test('raster subset mirrors src/scene/validate.js exactly', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'scene', 'validate.js'), 'utf8');
  const set = (name) => new Set([...src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...SUBSET_ELEMENTS].sort(), [...set('SVG_ALLOWED')].sort());
  assert.deepEqual([...SUBSET_ATTRIBUTES].sort(), [...set('ATTR_ALLOWED')].sort());
});

test('anything outside the subset throws a RasterError naming it', () => {
  const bad = [
    [S(10, 10, '<text x="1" y="5">hi</text>'), /<text>/],
    [S(10, 10, '<filter id="f"/>'), /<filter>/],
    [S(10, 10, '<rect width="5" height="5" style="fill:red"/>'), /attribute style/],
    [S(10, 10, '<rect width="5" height="5" fill="rgba(0,0,0,0.5)"/>'), /fill=/],
    [S(10, 10, '<rect width="5" height="5" fill="#ff000080"/>'), /fill=/],
    [S(10, 10, '<rect width="5" height="5" transform="perspective(3)"/>'), /transform/],
    [S(10, 10, '<path d="M0 0A5 5 0 0110 10"/>'), /arc flags/],
    [S(10, 10, '<path d="M0 0A5 5 0 0110 10 5 5 0 0 1 2 2"/>'), /arc flags/],
    [S(10, 10, '<rect width="5" height="5" stroke-linecap="pointy"/>'), /stroke-linecap/],
    ['<svg', /malformed/],
  ];
  for (const [svg, re] of bad) assert.throws(() => rasterize(svg), (e) => e instanceof RasterError && re.test(e.message), svg);
});

// ── semantics (exact, no Chrome needed) ─────────────────────────────────────────

test('coverage is exact for axis-aligned edges and fill rules are honored', () => {
  const img = rasterize(S(8, 8, '<rect x="1.25" y="2.5" width="3.5" height="2" fill="#ffffff"/>'));
  near(px(img, 1, 2), [255, 255, 255, Math.round(255 * 0.75 * 0.5)], 1, 'corner pixel');
  near(px(img, 2, 3), [255, 255, 255, 255], 0, 'interior');
  assert.equal(px(img, 0, 3)[3], 0);
  const ring = 'M0 0H20V20H0ZM5 5H15V15H5Z';
  const nz = rasterize(S(20, 20, `<path d="${ring}" fill="#ffffff"/>`)), eo = rasterize(S(20, 20, `<path d="${ring}" fill="#ffffff" fill-rule="evenodd"/>`));
  assert.equal(px(nz, 10, 10)[3], 255);
  assert.equal(px(eo, 10, 10)[3], 0);
  assert.equal(px(eo, 2, 2)[3], 255);
});

test('group opacity composites through a layer; element opacity folds', () => {
  const two = '<rect x="0" y="0" width="6" height="4" fill="#ffffff"/><rect x="2" y="0" width="6" height="4" fill="#ffffff"/>';
  const g = rasterize(S(8, 4, `<g opacity="0.5">${two}</g>`), undefined, undefined, { background: '#000000' });
  near(px(g, 3, 1), [128, 128, 128, 255], 1, 'overlap inside a layer is not double-counted');
  const sep = rasterize(S(8, 4, two.replace(/fill="#ffffff"/g, 'fill="#ffffff" fill-opacity="0.5"')), undefined, undefined, { background: '#000000' });
  near(px(sep, 3, 1), [191, 191, 191, 255], 1, 'separate 50% fills stack');
  const both = rasterize(S(10, 10, '<rect x="2" y="2" width="6" height="6" fill="#ff0000" stroke="#0000ff" stroke-width="2" opacity="0.5"/>'), undefined, undefined, { background: '#000000' });
  near(px(both, 2, 5), [0, 0, 128, 255], 1, 'stroke over fill, then opacity');
});

test('transforms, viewBox fitting, clips and gradients', () => {
  const t = rasterize(S(20, 20, '<g transform="translate(10 0) rotate(90)"><rect x="2" y="2" width="4" height="4" fill="#ffffff"/></g>'));
  assert.equal(px(t, 5, 3)[3], 255, 'rotate(90) maps (3,4) → (6,3)');
  const vb = rasterize('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ffffff"/></svg>');
  assert.equal(px(vb, 5, 10)[3], 0, 'xMidYMid meet letterboxes');
  assert.equal(px(vb, 20, 10)[3], 255);
  const scaled = rasterize(S(10, 10, '<rect x="5" y="0" width="5" height="10" fill="#ffffff"/>'), 40, 40);
  assert.equal(scaled.w, 40);
  assert.equal(px(scaled, 19, 5)[3], 0);
  assert.equal(px(scaled, 21, 5)[3], 255);
  const clip = rasterize(S(20, 20, '<defs><clipPath id="c"><rect x="0" y="0" width="10" height="20"/></clipPath></defs><rect width="20" height="20" fill="#ffffff" clip-path="url(#c)"/>'));
  assert.equal(px(clip, 5, 5)[3], 255);
  assert.equal(px(clip, 15, 5)[3], 0);
  const lg = rasterize(S(101, 1, '<defs><linearGradient id="g"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="101" height="1" fill="url(#g)"/>'));
  near(px(lg, 50, 0), [128, 128, 128, 255], 2, 'linear midpoint');
  const empty = rasterize(S(10, 10, '<defs><linearGradient id="g"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient></defs><path d="M0 5H10" stroke="url(#g)" stroke-width="2"/>'));
  assert.equal(px(empty, 5, 5)[3], 0, 'objectBoundingBox gradient on a zero-height bbox paints nothing (SVG rule)');
});

test('strokes: caps, joins, dashes, sub-pixel hairlines', () => {
  const butt = rasterize(S(20, 10, '<path d="M5 5H15" stroke="#ffffff" stroke-width="4"/>'));
  const sq = rasterize(S(20, 10, '<path d="M5 5H15" stroke="#ffffff" stroke-width="4" stroke-linecap="square"/>'));
  assert.equal(px(butt, 4, 5)[3], 0);
  assert.equal(px(sq, 4, 5)[3], 255);
  const dot = rasterize(S(10, 10, '<path d="M5 5Z" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>'));
  assert.equal(px(dot, 5, 5)[3], 255, 'zero-length subpath + round cap = dot');
  const dash = rasterize(S(40, 4, '<path d="M0 2H40" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 5"/>'));
  assert.deepEqual([2, 7, 12, 17].map((x) => px(dash, x, 2)[3]), [255, 0, 255, 0]);
  const hair = rasterize(S(10, 10, '<path d="M0 5.5H10" stroke="#ffffff" stroke-width="0.5"/>'));
  near([px(hair, 5, 5)[3]], [128], 2, 'a 0.5 px stroke draws 1 px at 50% coverage (Chrome/Skia hairline rule)');
});

test('deterministic, and pixel-identical between calls (buffers are reused)', () => {
  const f = findFacet('icon-mic');
  const svg = render(f, { size: 144, theme: 'prism' }).svg;
  const a = rasterize(svg), other = rasterize(render(f, { size: 144, theme: 'neon' }).svg), b = rasterize(svg);
  assert.deepEqual(a.data, b.data);
  assert.notDeepEqual(a.data, other.data);
});

// ── golden images (rendered by headless Chrome; see scripts/raster-goldens.mjs) ──

const manifest = JSON.parse(readFileSync(path.join(GOLD, 'manifest.json'), 'utf8'));
for (const c of manifest.cases) {
  test(`golden ${c.name}: matches Chrome within tolerance`, () => {
    const svg = gunzipSync(readFileSync(path.join(GOLD, `${c.name}.svg.gz`))).toString('utf8');
    const ref = decodePNG(readFileSync(path.join(GOLD, `${c.name}.png`)));
    const img = rasterize(svg, c.w, c.h);
    const d = diffImages(img, ref);
    const info = `${c.name}: mean ${d.mean.toFixed(3)} p99 ${d.p99} max ${d.max} >48 ${(d.over48 * 100).toFixed(2)}% (at generation: mean ${c.stats.mean} p99 ${c.stats.p99})`;
    // absolute bounds: mean error under 1.5/255, 99% of pixels within 48/255, < 1% of pixels beyond 48
    assert.ok(d.mean < 1.5 && d.p99 <= 48 && d.over48 < 0.01, info);
    // and no regression from the rasterizer that generated the goldens
    assert.ok(d.mean <= c.stats.mean * 1.25 + 0.1 && d.p99 <= c.stats.p99 + 6, `regressed — ${info}`);
  });
}

test('every facet rasterizes at its first target in several themes', () => {
  let n = 0;
  for (const f of allFacets()) {
    const tg = renderTargets(f)[0];
    for (const [theme, mode] of [['prism', 'dark'], ['porcelain', 'light'], ['pixel', 'dark']]) {
      const r = render(f, { ...tg, theme, mode, t: stillTime(f) + 0.5, since: 0.2 });
      for (const svg of [r.svg, ...(r.keys || []).slice(0, 1).map((k) => k.svg), ...(r.segments || []).slice(0, 1)]) {
        const img = rasterize(svg);
        let lit = 0;
        for (let i = 3; i < img.data.length; i += 4) if (img.data[i]) lit++;
        assert.ok(lit > 0, `${f.id} ${theme}: nothing drawn`);
        n++;
      }
    }
  }
  assert.ok(n > 100);
});

// ── encoders ──────────────────────────────────────────────────────────────────

const keyImg = () => rasterize(render(findFacet('icon-mic'), { size: 144, theme: 'prism' }).svg);
const psnr = (a, b) => { let se = 0; for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) se += (a.data[i + c] - b.data[i + c]) ** 2; return 10 * Math.log10((255 * 255) / (se / (a.w * a.h * 3))); };

test('PNG round-trips RGB and RGBA; the stored-deflate fallback is a valid zlib stream', () => {
  const img = keyImg();
  const png = encodePNG(img);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png[25], 2, 'opaque image → color type 2 (RGB)');
  assert.deepEqual(decodePNG(png).data, img.data);
  const t = rasterize(S(30, 20, '<circle cx="15" cy="10" r="8" fill="#b8a2f2" fill-opacity="0.6"/>'));
  const tp = encodePNG(t);
  assert.equal(tp[25], 6);
  assert.deepEqual(decodePNG(tp).data, t.data);
  const raw = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) & 255);
  assert.deepEqual(new Uint8Array(gunzipLike(zlibStored(raw))), raw);
});
function gunzipLike(z) { return Buffer.from(globalThis.process.getBuiltinModule('node:zlib').inflateSync(z)); }

test('JPEG: baseline 4:4:4 by default, 4:2:0 option, quality ladder, odd sizes, alpha flattened', () => {
  const img = keyImg();
  const j90 = encodeJPEG(img, 90);
  assert.deepEqual([...j90.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...j90.subarray(-2)], [0xff, 0xd9]);
  const sof = j90.findIndex((b, i) => b === 0xff && j90[i + 1] === 0xc0);
  assert.ok(sof > 0, 'baseline SOF0');
  assert.equal(j90[sof + 11], 0x11, '4:4:4 luma sampling');
  const s420 = encodeJPEG(img, 90, { subsampling: '420' });
  assert.equal(s420[s420.findIndex((b, i) => b === 0xff && s420[i + 1] === 0xc0) + 11], 0x22, '4:2:0 luma sampling');
  const d90 = decodeJPEG(j90);
  assert.ok(psnr(img, d90) > 36, `q90 PSNR ${psnr(img, d90).toFixed(1)} dB`);
  const j50 = encodeJPEG(img, 50), j420 = encodeJPEG(img, 90, { subsampling: '420' });
  assert.ok(j50.length < j90.length && j420.length < j90.length);
  assert.ok(psnr(img, decodeJPEG(j420)) > 30);
  assert.ok(psnr(img, decodeJPEG(encodeJPEG(img, 100))) > 45);
  const odd = rasterize(S(75, 37, '<rect width="75" height="37" fill="#7353bb"/><circle cx="30" cy="18" r="12" fill="#f2a65a"/>'));
  for (const sub of ['444', '420']) { const d = decodeJPEG(encodeJPEG(odd, 92, { subsampling: sub })); assert.equal(d.w, 75); assert.equal(d.h, 37); assert.ok(psnr(odd, d) > 30, sub); }
  const clear = { data: new Uint8ClampedArray(8 * 8 * 4), w: 8, h: 8 };
  near(px(decodeJPEG(encodeJPEG(clear, 90)), 3, 3).slice(0, 3), [0, 0, 0], 2, 'transparent → black');
});

test('GIF: global palette, exact when ≤ 256 colors, delta frames, delays with carry, loop, transparency, LZW resets', () => {
  const f = findFacet('idle-orbit');
  const frames = [0, 0.25, 0.5, 0.5, 0.75].map((t) => rasterize(render(f, { size: 144, theme: 'aurora', t }).svg));
  const gif = encodeGIF(frames, { delay: 1000 / 15 });
  assert.equal(String.fromCharCode(...gif.subarray(0, 6)), 'GIF89a');
  const dec = decodeGIF(gif);
  assert.equal(dec.loop, 0, 'loops forever');
  assert.equal(dec.frames.length, 4, 'the repeated frame merged into its predecessor');
  assert.deepEqual(dec.frames.map((x) => x.delay), [70, 60, 140, 60], '15 fps: 7/6 cs carry, merged frame doubles');
  for (const [i, src] of [[0, 0], [1, 1], [2, 2], [3, 4]]) {
    const d = diffImages(dec.frames[i], frames[src]);
    assert.ok(d.mean < 2 && d.p99 < 24, `frame ${i}: mean ${d.mean.toFixed(2)} p99 ${d.p99}`);
  }
  // ≤ 256 colors is lossless; 256 colors × 40 000 px forces LZW table resets
  const noise = { data: new Uint8ClampedArray(200 * 200 * 4), w: 200, h: 200 };
  let seed = 7;
  for (let i = 0; i < 200 * 200; i++) { seed = (seed * 1103515245 + 12345) >>> 0; const k = (seed >>> 16) & 255; noise.data.set([k, 255 - k, (k * 3) & 255, 255], i * 4); }
  assert.deepEqual(decodeGIF(encodeGIF([noise])).frames[0].data, noise.data);
  const flat = rasterize(S(20, 20, '<rect width="20" height="20" fill="#10131c"/><rect x="4" y="4" width="8" height="8" fill="#b8a2f2"/>'));
  assert.deepEqual(decodeGIF(encodeGIF([flat, flat])).frames[0].data, flat.data);
  // transparency: disposal 2, transparent pixels decode as alpha 0
  const a = rasterize(S(20, 20, '<circle cx="10" cy="10" r="6" fill="#7dd3c0"/>'));
  const da = decodeGIF(encodeGIF([a, a], { loop: 3 }));
  assert.equal(da.loop, 3);
  assert.equal(px(da.frames[1], 0, 0)[3], 0);
  assert.equal(px(da.frames[1], 10, 10)[3], 255);
  const dith = decodeGIF(encodeGIF(frames.slice(0, 2), { dither: true, colors: 64 }));
  assert.ok(diffImages(dith.frames[0], frames[0]).mean < 6, 'dithered 64-color frame');
});

test('BMP: 54-byte header, BGR rows in device order, linux.md §2.6 transforms and presets', () => {
  // asymmetric 3×2 test image: every pixel distinct
  const img = { data: new Uint8ClampedArray(3 * 2 * 4), w: 3, h: 2 };
  for (let i = 0; i < 6; i++) img.data.set([i * 40, 255 - i * 40, i * 10, 255], i * 4);
  const at = (im, x, y) => px(im, x, y)[0] / 40;
  const exp = { // target (x, y) → source index (sy * 3 + sx), per the research mapping table
    none: [[0, 1, 2], [3, 4, 5]], rot180: [[5, 4, 3], [2, 1, 0]], mirrorX: [[2, 1, 0], [5, 4, 3]], mirrorY: [[3, 4, 5], [0, 1, 2]],
    ccw90: [[2, 5], [1, 4], [0, 3]], cw90: [[3, 0], [4, 1], [5, 2]],
  };
  for (const xf of TRANSFORMS) {
    const t = transformImage(img, xf);
    exp[xf].forEach((row, y) => row.forEach((s, x) => assert.equal(at(t, x, y), s, `${xf} (${x},${y})`)));
    const bmp = encodeBMP(img, xf);
    const v = new DataView(bmp.buffer);
    assert.equal(v.getUint32(10, true), 54);
    assert.equal(v.getUint16(28, true), 24);
    assert.ok(v.getInt32(22, true) > 0, 'positive height');
    assert.deepEqual(decodeBMP(bmp, { rowOrder: 'device' }).data, t.data, `${xf} rows are top-down in device order`);
  }
  const key = keyImg();
  const mini = encodeBMP(rasterize(render(findFacet('icon-mic'), { size: 80, theme: 'prism' }).svg), 'mini');
  assert.equal(mini.length, 54 + 80 * 80 * 3, 'no row padding at 80 px');
  assert.equal(new DataView(mini.buffer).getInt32(38, true), 2835);
  const orig = encodeBMP(rasterize(render(findFacet('icon-mic'), { size: 72, theme: 'prism' }).svg), 'original');
  assert.equal(orig.length, 54 + 72 * 72 * 3);
  assert.equal(new DataView(orig.buffer).getInt32(38, true), 3780);
  assert.deepEqual(decodeBMP(encodeBMP(key, 'none', { rowOrder: 'bottom-up' })).data, flattenImage(key).data, 'standard bottom-up BMP round-trips');
});

test('encodeKeyImage follows a hidraw model entry (fmt, xf, ppm, quality)', () => {
  const img = keyImg();
  assert.deepEqual(encodeKeyImage(img, { fmt: 'jpeg', xf: 'rot180' }), encodeJPEG(transformImage(img, 'rot180'), 90));
  assert.deepEqual(encodeKeyImage(img, { fmt: 'jpeg', xf: 'none', quality: 80 }), encodeJPEG(img, 80));
  assert.deepEqual(encodeKeyImage(img, { fmt: 'bmp', xf: 'mirrorX', ppm: 3780 }), encodeBMP(img, 'mirrorX', { ppm: 3780 }));
});

// ── speed ─────────────────────────────────────────────────────────────────────

test('a 144 px key rasterizes far inside a 10 fps budget', (t) => {
  const svgs = [];
  for (const [id, theme] of [['icon-mic', 'prism'], ['icon-cpu', 'neon'], ['press-ripple', 'aurora'], ['icon-cpu', 'phosphor'], ['app-cpu-ring', 'porcelain']]) {
    const f = findFacet(id);
    for (let i = 0; i < 4; i++) svgs.push(render(f, { size: 144, theme, t: stillTime(f) + i * 0.2, since: 0.1 + i * 0.2 }).svg);
  }
  for (const s of svgs) rasterize(s);
  const t0 = performance.now();
  for (let k = 0; k < 3; k++) for (const s of svgs) rasterize(s);
  const ms = (performance.now() - t0) / (svgs.length * 3);
  const img = rasterize(svgs[0]);
  const t1 = performance.now();
  for (let k = 0; k < 20; k++) encodeJPEG(img, 90);
  const jms = (performance.now() - t1) / 20;
  t.diagnostic(`144 px key: rasterize ${ms.toFixed(2)} ms, JPEG q90 ${jms.toFixed(2)} ms (budget at 10 fps: 100 ms)`);
  assert.ok(ms < 40, `${ms.toFixed(1)} ms per 144 px key`);
});
