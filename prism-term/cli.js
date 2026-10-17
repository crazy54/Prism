#!/usr/bin/env node
// prism-term CLI.
//
//   prism-term                         interactive catalog browser (galleries → facets → live preview)
//   prism-term play <id…>              play facets fullscreen in the live player (playlist if several)
//   prism-term play --gallery fx       play a whole gallery (or --category "Fields")
//   prism-term showcase [--gallery g]  auto-advancing tour
//   prism-term list [--gallery g]      facets grouped by gallery and category (--json for scripts)
//   prism-term galleries               the galleries with counts
//   prism-term info <id>               everything about one facet (--json)
//   prism-term banner <text…>          big text into scrollback
//   prism-term spin -- <command…>      run a command under a spinner
//   prism-term spinners                preview every spinner
//   prism-term dashboard               PROTEUS-style live metrics + AI triage demo (needs 100×34)
//   prism-term demo                    tour of the inline helpers (spinner, progress, tasks, thinking)
//   prism-term snapshot <id>           render a frame (ANSI to stdout, or -o file.html/.txt)
//   prism-term caps                    detected capabilities + test patterns
//   prism-term themes | palettes       list Prism themes / gradient palettes
//
// Run `prism-term help` for options.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));

const BOOLEAN = new Set(['json', 'transparent', 'ascii', 'no-hud', 'hud', 'loop', 'no-loop', 'help', 'version', 'sextant', 'no-sextant', 'unicode', 'no-unicode', 'shadow', 'quiet']);

export function parseArgs(argv) {
  const args = { _: [], set: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args.rest = argv.slice(i + 1); break; }
    if (a === '-h') { args.help = true; continue; }
    if (a === '-v') { args.version = true; continue; }
    if (a === '-o') { args.out = argv[++i]; continue; }
    if (a.startsWith('--')) {
      let key = a.slice(2), val;
      const eq = key.indexOf('=');
      if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      if (val === undefined && !BOOLEAN.has(key)) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) { val = next; i++; }
      }
      if (key === 'set') {
        const [k, ...v] = String(val ?? '').split('=');
        if (k) args.set[k] = v.join('=');
      } else if (key.startsWith('no-')) args[key.slice(3)] = false;
      else args[key] = val ?? true;
    } else args._.push(a);
  }
  if (args.palette) args.set.palette = args.palette;
  if (args.text && !args.set.text) args.set.text = args.text;
  return args;
}

function parseSize(s) {
  if (!s) return {};
  const m = String(s).match(/^(\d+)\s*[x×,]\s*(\d+)$/i);
  if (!m) throw new Error(`--size expects WxH, got "${s}"`);
  return { width: +m[1], height: +m[2] };
}

/** Options shared by every animated command. */
function runOpts(args) {
  return {
    theme: args.theme,
    mode: args.mode,
    fps: args.fps ? Number(args.fps) : undefined,
    duration: args.duration ? Number(args.duration) : undefined,
    loop: args.loop !== false,
    hud: args.hud !== false,
    transparent: !!args.transparent,
    params: args.set,
    seed: args.seed !== undefined ? Number(args.seed) : undefined,
    depth: args.depth,
    ascii: !!args.ascii,
    sextant: args.sextant,
    unicode: args.unicode,
    ...parseSize(args.size),
  };
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const SITE = 'https://prism.jeremyfhall.com';

/** "1 facet", "6 facets", "1 gallery", "2 galleries". */
export const countOf = (n, word) => `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`;

async function registry() {
  return import('./src/facets/index.js');
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Up to six facet ids that look like what the user meant. */
function suggestFacets(q, facets, searchFacets) {
  const s = String(q).toLowerCase();
  const hits = new Set(searchFacets(s).map((f) => f.id));
  const words = s.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const score = (f) => {
    const d = editDistance(s, f.id);
    const vocab = `${f.title} ${(f.tags || []).join(' ')}`.toLowerCase().split(/[^a-z0-9]+/);
    const word = words.some((w) => f.id.includes(w) || vocab.some((v) => v.includes(w) || (w.length >= 4 && editDistance(w, v) <= 1)));
    return hits.has(f.id) ? -1 : word ? d / 4 : d <= Math.max(2, s.length / 3) ? d : Infinity;
  };
  return facets.map((f) => [f, score(f)]).filter(([, d]) => d < Infinity).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([f]) => f.id);
}

/** Resolve facet ids (or every facet when none are given); unknown ids fail with suggestions. */
async function scenesOrDie(ids) {
  const { allFacets, findFacet, searchFacets } = await registry();
  if (!ids.length) return allFacets();
  const out = [];
  for (const id of ids) {
    const f = findFacet(id);
    if (!f) {
      const near = suggestFacets(id, allFacets(), searchFacets);
      throw new Error(`unknown facet "${id}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ''} See: prism-term list`);
    }
    out.push(f);
  }
  return out;
}

/** Facets selected by ids, --gallery, --category and --kind (in catalog order). */
export async function selectFacets(args) {
  const { allFacets, GALLERIES } = await registry();
  let list = args._.length ? await scenesOrDie(args._) : allFacets();
  if (args.gallery !== undefined) {
    const q = String(args.gallery).toLowerCase();
    const g = GALLERIES.find((x) => x.id === q || x.title.toLowerCase() === q);
    if (!g) throw new Error(`unknown gallery "${args.gallery}". Galleries: ${GALLERIES.map((x) => x.id).join(', ')}`);
    list = list.filter((f) => f.gallery === g.id);
  }
  if (args.category !== undefined) {
    const q = String(args.category).toLowerCase();
    list = list.filter((f) => f.category.toLowerCase() === q);
    if (!list.length) throw new Error(`no facets in category "${args.category}"${args.gallery ? ` of ${args.gallery}` : ''} — see: prism-term galleries`);
  }
  if (args.kind !== undefined) list = list.filter((f) => f.kind === String(args.kind).toLowerCase());
  return list;
}

/** A facet as plain data (no functions) for --json output. */
export function facetRecord(f) {
  const { setup, ...rest } = f;
  return {
    ...rest,
    usage: {
      cli: `prism-term play ${f.id}`,
      snapshot: `prism-term snapshot ${f.id} --size ${f.size.w}x${f.size.h}`,
      npx: `npx -y --package=${SITE}/dl/prism-term.tgz prism-term play ${f.id}`,
      curl: `curl -sL ${SITE}/f/${f.id}`,
    },
  };
}

const COMMANDS = {
  async gallery(args) {
    const facets = await scenesOrDie([]);
    if (!process.stdout.isTTY) return COMMANDS.list(args);
    const { gallery } = await import('./src/gallery.js');
    await gallery(facets, clean({ ...runOpts(args), gallery: args.gallery }));
  },

  async play(args) {
    if (!args._.length && args.gallery === undefined && args.category === undefined && args.kind === undefined) {
      throw new Error('usage: prism-term play <id…> | --gallery <g> | --category "<name>"   (see: prism-term list)');
    }
    const facets = await selectFacets(args);
    if (!facets.length) throw new Error('nothing matched — see: prism-term list');
    if (!process.stdout.isTTY) throw new Error('play needs an interactive terminal — try: prism-term snapshot ' + facets[0].id);
    const { play } = await import('./src/player.js');
    const o = clean(runOpts(args));
    if (facets.length > 1 && o.duration === undefined) o.duration = 'auto';
    await play(facets, o);
  },

  async showcase(args) {
    const facets = await selectFacets(args);
    if (!facets.length) throw new Error('nothing matched — see: prism-term list');
    if (!process.stdout.isTTY) throw new Error('showcase needs an interactive terminal');
    const { play } = await import('./src/player.js');
    await play(facets, clean({ duration: 'auto', ...runOpts(args) }));
  },

  async list(args) {
    const facets = await selectFacets(args);
    if (args.json) {
      process.stdout.write(JSON.stringify(facets.map(facetRecord), null, 2) + '\n');
      return;
    }
    const { GALLERIES } = await registry();
    const tty = !!process.stdout.isTTY;
    const cols = tty ? process.stdout.columns || 100 : Infinity;
    const { gradientText } = await importText();
    const { truncate } = await import('./src/width.js');
    const fit = (line) => (Number.isFinite(cols) ? truncate(line, cols - 1) : line);
    const idW = Math.min(28, Math.max(12, ...facets.map((f) => f.id.length)) + 2);
    const out = [];
    for (const g of GALLERIES) {
      const inG = facets.filter((f) => f.gallery === g.id);
      if (!inG.length) continue;
      const head = `${g.title.toUpperCase()} · ${inG.length}`;
      const blurb = fit(`${head}  ${g.blurb}`).slice(head.length);
      out.push('', `${tty && gradientText ? gradientText(head, 'prism') : head}${blurb}`);
      for (const cat of g.categories) {
        const inC = inG.filter((f) => f.category === cat);
        if (!inC.length) continue;
        out.push(`  ${cat} (${inC.length})`);
        for (const f of inC) out.push(fit(`    ${f.id.padEnd(idW)}${f.title} — ${f.description}`));
      }
    }
    const galleries = new Set(facets.map((f) => f.gallery)).size;
    out.push('', `${countOf(facets.length, 'facet')} in ${countOf(galleries, 'gallery')} · prism-term info <id> · prism-term play <id> · prism-term (catalog browser)`);
    process.stdout.write(out.join('\n') + '\n');
  },

  async galleries(args) {
    const { catalogTree, allFacets } = await registry();
    const tree = catalogTree();
    if (args.json) {
      process.stdout.write(JSON.stringify(tree.map((g) => ({ id: g.id, title: g.title, icon: g.icon, blurb: g.blurb, count: g.count, categories: g.categories.map((c) => ({ name: c.name, count: c.facets.length })) })), null, 2) + '\n');
      return;
    }
    const out = [];
    for (const g of tree) {
      out.push(`${g.id.padEnd(10)} ${g.title.padEnd(26)} ${String(g.count).padStart(4)}  ${g.blurb}`);
      out.push(`${' '.repeat(11)}${g.categories.map((c) => `${c.name} ${c.facets.length}`).join(' · ')}`);
    }
    out.push('', `${countOf(allFacets().length, 'facet')} in ${countOf(tree.length, 'gallery')} · prism-term list --gallery <id>`);
    process.stdout.write(out.join('\n') + '\n');
  },

  async info(args) {
    const [id] = args._;
    if (!id) throw new Error('usage: prism-term info <id> [--json]');
    const [f] = await scenesOrDie([id]);
    const r = facetRecord(f);
    if (args.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }
    const { getGallery } = await registry();
    const params = Object.entries(f.params || {}).map(([k, p]) => `${k} = ${p.default ?? '—'}${p.min !== undefined ? ` (${p.min}–${p.max})` : p.options ? ` (${p.options.join(' | ')})` : ''}`);
    const lines = [
      `${f.title}  (${f.id})`,
      `${getGallery(f.gallery)?.title || f.gallery} · ${f.category} · ${f.kind}`,
      f.description,
      '',
      `  size      ${f.size.w}×${f.size.h} (min ${f.minSize.w}×${f.minSize.h})`,
      `  motion    ${f.animated ? `animated · ${f.loop} s loop` : 'still'}`,
      `  needs     ${f.glyphs} glyphs · ${f.color === 'truecolor' || f.color === 'mono' ? f.color : `${f.color} colors`}`,
      f.tags?.length ? `  tags      ${f.tags.join(', ')}` : null,
      params.length ? `  params    ${params.join(' · ')}   (--set key=value)` : null,
      `  file      prism-term/src/facets/${f.file}`,
      '',
      `  play      ${r.usage.cli}`,
      `  snapshot  ${r.usage.snapshot}`,
      `  npx       ${r.usage.npx}`,
      `  curl      ${r.usage.curl}`,
    ].filter((l) => l !== null);
    process.stdout.write(lines.join('\n') + '\n');
  },

  async snapshot(args) {
    const [id] = args._;
    if (!id) throw new Error('usage: prism-term snapshot <scene> [--at 2.5] [--size 100x30] [-o out.html|out.txt] [--frames 60]');
    const [scene] = await scenesOrDie([id]);
    const { renderScene, renderFrames } = await import('./src/render.js');
    const { detect, withOverrides } = await import('./src/caps.js');
    const o = runOpts(args);
    const caps = withOverrides(detect(), o);
    const size = parseSize(args.size);
    const width = size.width || (args.out ? 100 : Math.min(process.stdout.columns || 100, 160));
    const height = size.height || (args.out ? 30 : Math.max(8, Math.min((process.stdout.rows || 32) - 2, 50)));
    const common = clean({ width, height, theme: o.theme, mode: o.mode, params: o.params, seed: o.seed, transparent: o.transparent, caps: { unicode: caps.unicode, sextant: caps.sextant } });
    const out = args.out;
    if (out && /\.html?$/i.test(out) && args.frames) {
      const { toAnimatedHtml } = await import('./src/export.js');
      const fps = Number(args.fps) || 20;
      const frames = renderFrames(scene, { ...common, frames: Number(args.frames), fps, start: Number(args.at || 0) });
      fs.writeFileSync(out, toAnimatedHtml(frames, { title: scene.title, fps, theme: o.theme }));
    } else {
      const buf = renderScene(scene, { ...common, t: Number(args.at ?? 2.5) });
      if (out && /\.html?$/i.test(out)) {
        const { toHtml } = await import('./src/export.js');
        fs.writeFileSync(out, toHtml(buf, { title: scene.title, theme: o.theme }));
      } else if (out) fs.writeFileSync(out, buf.toString() + '\n');
      else {
        const depth = o.depth || (caps.depth === 'mono' && !process.env.NO_COLOR ? 'truecolor' : caps.depth);
        process.stdout.write(buf.toAnsi(depth) + '\n');
        return;
      }
    }
    process.stderr.write(`wrote ${out}\n`);
  },

  async banner(args) {
    const text = args._.join(' ') || 'PRISM';
    const t = await importText();
    if (!t.banner) throw new Error('text module not available');
    process.stdout.write(t.banner(text, clean({ font: args.font, mode: args.mode, fill: args.palette || args.fill || args.color, shadow: args.shadow, theme: args.theme, depth: args.depth })) + '\n');
  },

  async spinners(args) {
    const { SPINNERS } = await import('./src/spinners.js');
    const { Screen } = await import('./src/screen.js');
    const { getTheme, palette } = await import('./src/palettes.js');
    const names = Object.keys(SPINNERS);
    if (!process.stdout.isTTY) {
      for (const n of names) process.stdout.write(`${n.padEnd(14)} ${SPINNERS[n].frames.join(' ')}\n`);
      return;
    }
    const th = getTheme(args.theme);
    const pal = palette('prism');
    const cols = Math.max(1, Math.floor((process.stdout.columns || 80) / 26));
    const rowsN = Math.ceil(names.length / cols);
    const screen = new Screen({ mode: 'inline', height: rowsN + 1, keys: true, exitOnCtrlC: true });
    const duration = Number(args.duration || 6);
    screen.on('key', (k) => { if (k.name === 'q' || k.name === 'escape' || k.name === 'return') screen.stop(); });
    await screen.run((t) => {
      const b = screen.buffer;
      b.clear();
      names.forEach((n, i) => {
        const x = (i % cols) * 26, y = Math.floor(i / cols);
        const sp = SPINNERS[n];
        const f = sp.frames[Math.floor((t * 1000) / sp.interval) % sp.frames.length];
        const c = pal(i / names.length);
        const end = b.text(x, y, f, c);
        b.text(end + 1, y, n, th.muted);
      });
      b.text(0, rowsN, `${names.length} spinners · q to stop`, th.dim);
    }, { fps: 30, duration });
  },

  async spin(args) {
    const cmd = args.rest.length ? args.rest : args._;
    if (!cmd.length) throw new Error('usage: prism-term spin [--text "Building"] [--style dots] -- <command…>');
    const { spinner } = await import('./src/inline.js');
    const label = args.text || cmd.join(' ');
    const sp = spinner(label, clean({ style: args.style, theme: args.theme }));
    const t0 = Date.now();
    const chunks = [];
    const child = spawnCommand(cmd);
    const onData = (d) => {
      chunks.push(d);
      const last = d.toString().split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
      if (last && !args.quiet) sp.update(`${label}  ${last.slice(0, 80)}`);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const code = await new Promise((r) => { child.on('close', r); child.on('error', (e) => { chunks.push(Buffer.from(String(e.message))); r(127); }); });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (code === 0) sp.succeed(`${label} (${secs}s)`);
    else {
      sp.fail(`${label} — exit ${code} (${secs}s)`);
      process.stderr.write(Buffer.concat(chunks).toString());
    }
    process.exitCode = code ?? 1;
  },

  async dashboard(args) {
    if (!process.stdout.isTTY) throw new Error('dashboard needs an interactive terminal');
    const { runDashboard } = await import('./examples/proteus-dashboard.js');
    await runDashboard(clean(runOpts(args)));
  },

  async demo(args) {
    const { runDemo } = await import('./examples/inline-demo.js');
    await runDemo(clean(runOpts(args)));
  },

  async caps(args) {
    const { detect, withOverrides } = await import('./src/caps.js');
    const { CellBuffer } = await import('./src/buffer.js');
    const { Canvas } = await import('./src/canvas.js');
    const { palette, getTheme } = await import('./src/palettes.js');
    const caps = withOverrides(detect(), runOpts(args));
    if (args.json) { process.stdout.write(JSON.stringify(caps, null, 2) + '\n'); return; }
    const th = getTheme(args.theme);
    const depth = caps.depth === 'mono' ? 'truecolor' : caps.depth;
    const W = Math.min(process.stdout.columns || 80, 100) - 2;
    const out = (s) => process.stdout.write(s + '\n');
    out(`prism-term ${pkg.version} · ${caps.program} · ${caps.platform}`);
    out(`  color depth  ${caps.depth}${caps.isTTY ? '' : '  (not a TTY)'}`);
    out(`  unicode      ${caps.unicode ? 'yes' : 'no'}   braille ${caps.braille ? 'yes' : 'no'}   sextant ${caps.sextant ? 'yes' : 'no (override: --sextant)'}`);
    out(`  size         ${caps.width}×${caps.height}\n`);

    const b = new CellBuffer(W, 9);
    const spec = palette('prism'), heat = palette('magma');
    const half = new Canvas(W, 2, { mode: 'half' });
    half.shade((x, y) => (y < 2 ? spec(x / W) : heat(x / W)));
    half.paint(b, 0, 0);
    b.text(0, 3, 'braille ', th.muted);
    const br = new Canvas(W - 9, 1, { mode: 'braille' });
    for (let x = 0; x < br.width; x++) br.set(x, Math.round(1.5 + Math.sin(x / 3) * 1.5), spec(x / br.width));
    br.paint(b, 9, 3);
    b.text(0, 4, 'sextant ', th.muted);
    b.text(9, 4, '🬀🬁🬂🬃🬄🬅🬆🬇🬈🬉🬊🬋🬌🬍🬎🬏🬐🬑🬒🬓🬔🬕🬖🬗🬘🬙🬚🬛🬜🬝🬞🬟', th.accent);
    b.text(0, 5, 'quadrant', th.muted);
    b.text(9, 5, '▘▝▀▖▌▞▛▗▚▐▜▄▙▟█  eighths ▏▎▍▌▋▊▉█ ▁▂▃▄▅▆▇█', th.info);
    b.text(0, 6, 'box     ', th.muted);
    b.text(9, 6, '╭─┬─╮ ┏━┳━┓ ╔═╦═╗ ┌┄┐  ●○◆◇▲▼◀▶ ✔✖⚠ℹ', th.pos);
    b.text(0, 7, 'wide    ', th.muted);
    b.text(9, 7, '漢字 カナ ｱｲｳ 🚀  ← should align: |', th.warn);
    b.text(0, 8, '256/16  ', th.muted);
    out(b.toAnsi(depth));
    let line = '         ';
    for (let i = 0; i < 16; i++) line += `\x1b[48;5;${i}m  `;
    out(line + '\x1b[0m\n');
    out('If the sextant row shows boxes or "?", your font lacks Legacy Computing glyphs — prism-term falls back to quadrants automatically.');
  },

  async themes(args) {
    const { listThemes } = await import('./src/palettes.js');
    const { parse } = await import('./src/color.js');
    for (const t of listThemes()) {
      const c = parse(t.accent);
      const sw = process.stdout.isTTY ? `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m   \x1b[0m ` : '';
      process.stdout.write(`${sw}${t.id.padEnd(24)} ${t.name}\n`);
    }
  },

  async palettes() {
    const { PALETTE_NAMES, palette } = await import('./src/palettes.js');
    for (const n of PALETTE_NAMES) {
      const p = palette(n);
      let bar = '';
      if (process.stdout.isTTY) for (let i = 0; i < 32; i++) { const c = p(i / 31); bar += `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m `; }
      process.stdout.write(`${n.padEnd(12)} ${bar}${bar ? '\x1b[0m' : ''}\n`);
    }
  },

  help() {
    process.stdout.write(`prism-term ${pkg.version} — Prism's terminal catalog: animated facets for any terminal

Browse
  prism-term                        catalog browser: galleries → facets → live preview
  prism-term --gallery <g>          open the catalog browser at a gallery
  prism-term galleries              the galleries with counts and categories
  prism-term list [--gallery g] [--category c] [--kind k] [--json]
  prism-term info <id> [--json]     size, needs, params and the commands for one facet

Play
  prism-term play <id…>             play facets fullscreen in the live player (several = playlist)
  prism-term play --gallery <g>     play a gallery (or --category "<name>", --kind <k>)
  prism-term showcase [--gallery g] auto-advancing tour (--duration secs per facet)
  prism-term <id>                   shorthand for play <id>

Make things
  prism-term snapshot <id>          still frame → stdout (ANSI), -o x.html|x.txt, --frames N for animated html
  prism-term banner <text…>         big text (--font standard|tiny|bold --palette prism --mode half|braille|… --shadow)
  prism-term spin -- <command…>     run a command under a spinner (--text, --style)
  prism-term spinners               preview every spinner
  prism-term dashboard              PROTEUS-style live metrics + AI triage demo (needs 100×34)
  prism-term demo                   inline helpers tour
  prism-term caps [--json]          capabilities + glyph test patterns
  prism-term themes | palettes      list themes / palettes

Options
  --theme <id>        Prism theme (cloudscape-dark, primer-dark, material3-light, …)
  --mode <m>          braille | sextant | quad | half | ascii   (default: best for the facet)
  --palette <name>    gradient palette for facets that use one (prism, fire, ocean, aurora, …)
  --set key=value     facet parameter (repeatable), e.g. --set text=PROTEUS --set speed=2
  --fps <n>           target frame rate (default 30)
  --duration <s>      seconds per facet in playlists / showcase (default: each facet's loop)
  --size <WxH>        fixed size in cells
  --seed <n>          deterministic seed
  --transparent       keep the terminal's own background
  --no-hud            hide the status bar
  --depth <d>         force color depth: truecolor | 256 | 16 | mono
  --ascii             no Unicode at all;  --sextant / --no-sextant to force sextant glyphs

Keys in the catalog browser
  ↑↓ jk move · ←→ hl / Tab pane · Enter play · s showcase · / search · g gallery · f kind · t theme · m mode · ? help · q quit
  (under 110 columns: ←→ hl / Tab change gallery, g opens a gallery picker)
Keys in the live player
  ←/→ facet · space pause · m mode · t theme · r restart · h HUD · q back

Live player without installing:  npx -y --package=${SITE}/dl/prism-term.tgz prism-term [play <id>]
Browse with curl:                 curl -sL ${SITE.replace('https://', '')}/tty
`);
  },
};

// cmd.exe quoting: bare words pass through, anything else is double-quoted with
// embedded quotes doubled.
const winQuote = (a) => (/^[\w\-.\/:=@\+,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);

/**
 * Spawn `prism-term spin` targets. A single argument is a shell command line;
 * several arguments are an argv. Windows needs a shell to resolve .cmd shims
 * (npm, npx), so argv is quoted into one command line there instead of being
 * passed as shell args (which Node rejects as unsafe).
 */
function spawnCommand(cmd) {
  const stdio = ['inherit', 'pipe', 'pipe'];
  if (cmd.length === 1) return spawn(cmd[0], { stdio, shell: true });
  if (process.platform === 'win32') return spawn(cmd.map(winQuote).join(' '), { stdio, shell: true });
  return spawn(cmd[0], cmd.slice(1), { stdio });
}

async function importText() {
  try { return await import('./src/text/index.js'); } catch { return {}; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) { process.stdout.write(pkg.version + '\n'); return; }
  const cmd = args._.length ? args._.shift() : 'gallery';
  if (args.help || cmd === 'help') return COMMANDS.help();
  const fn = COMMANDS[cmd];
  if (!fn) {
    // `prism-term plasma` is shorthand for `prism-term play plasma`.
    args._.unshift(cmd);
    return COMMANDS.play(args);
  }
  await fn(args);
}

function isMain() {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMain()) {
  // Pipe-safe: `prism-term list | head` closes stdout early; that's a normal exit, not a crash.
  process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); throw err; });
  main().catch((err) => {
    if (err.code === 'EPIPE') process.exit(0);
    process.stderr.write(`prism-term: ${err.message}\n`);
    if (process.env.PRISM_TERM_DEBUG) process.stderr.write(err.stack + '\n');
    process.exit(1);
  });
}
