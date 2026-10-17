#!/usr/bin/env node
// prism-deck — command line: browse the deck catalog and render frames to SVG.
//
//   prism-deck list [--gallery icons] [--surface key] [--json]
//   prism-deck search <terms…>
//   prism-deck info <facet-id>
//   prism-deck render <facet-id> [--device plus] [--theme prism] [--mode dark|light] [--t 1.5] [--state 1]
//                                [--size 144 | 144x112] [--out frame.svg | --out dir/ (also writes per-key / per-dial slices)]
//   prism-deck devices [--json]      every model: grid, native key px, dials, strip, screen
//   prism-deck themes | glyphs [--json]
//   prism-deck export opendeck | streamcontroller | linux-paths [options]   Linux exports (src/export/linux-cli.js, docs/linux.md)
//   prism-deck hid list | doctor | run | bench [options]                   Linux hidraw driver (never touches a device another app holds)
//   prism-deck audio detect | meter [options]                               audio sources (probes only; never installs)

import fs from 'node:fs';
import path from 'node:path';
import { allFacets, findFacet, searchFacets, render, stillTime, DATA, keySize, allThemes, allGlyphs, API_VERSION } from './index.js';

const argv = process.argv.slice(2);
const cmd = argv[0];
const pos = [], opt = {};
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1]; if (v !== undefined && !v.startsWith('--')) { opt[k] = v; i++; } else opt[k] = true; }
  else pos.push(argv[i]);
}
const out = (s) => process.stdout.write(`${s}\n`);
const pad = (s, w) => String(s).padEnd(w);
const fail = (msg) => { process.stderr.write(`prism-deck: ${msg}\n`); process.exit(1); };

function table(facets) {
  if (opt.json) return out(JSON.stringify(facets.map(({ render: _r, ...f }) => f), null, 2));
  for (const f of facets) out(`${pad(f.id, 28)} ${pad(f.surface, 7)} ${pad(`${f.gallery}/${f.category}`, 34)} ${f.title}`);
  out(`\n${facets.length} facets`);
}

switch (cmd) {
  case 'list': {
    let fs_ = allFacets();
    if (opt.gallery) fs_ = fs_.filter((f) => f.gallery === opt.gallery);
    if (opt.surface) fs_ = fs_.filter((f) => f.surface === opt.surface);
    table(fs_);
    break;
  }
  case 'search': table(searchFacets(pos.join(' '))); break;
  case 'info': {
    const f = findFacet(pos[0] || '') || fail(`no facet "${pos[0]}"`);
    const { render: _r, ...rest } = f;
    out(JSON.stringify(rest, null, 2));
    break;
  }
  case 'render': {
    const f = findFacet(pos[0] || '') || fail(`no facet "${pos[0]}" (try: prism-deck list)`);
    const size = opt.size ? (() => { const [w, h] = String(opt.size).split('x').map(Number); return { w, h: h || w }; })() : undefined;
    const t = opt.t !== undefined ? Number(opt.t) : stillTime(f);
    const r = render(f, { device: opt.device, theme: opt.theme, mode: opt.mode, t, since: t, state: Number(opt.state || 0), size, seed: opt.seed ? Number(opt.seed) : undefined });
    if (!opt.out) { out(r.svg); break; }
    const dest = path.resolve(String(opt.out));
    if (dest.endsWith('.svg')) { fs.writeFileSync(dest, r.svg); out(dest); break; }
    fs.mkdirSync(dest, { recursive: true });
    const files = [[`${f.id}.svg`, r.svg]];
    for (const k of r.keys || []) files.push([`${f.id}.key-${k.i}.svg`, k.svg]);
    (r.segments || []).forEach((s, i) => files.push([`${f.id}.dial-${i}.svg`, s]));
    for (const w of r.widgets || []) files.push([`${f.id}.widget-${w.dial}-${w.layer}.svg`, w.svg]);
    if (r.screen) files.push([`${f.id}.screen.svg`, r.screen]);
    for (const [name, svg] of files) fs.writeFileSync(path.join(dest, name), svg);
    out(`${files.length} file(s) in ${dest}`);
    break;
  }
  case 'devices': {
    const list = DATA.filter((d) => !d.hidden);
    if (opt.json) { out(JSON.stringify(list, null, 2)); break; }
    for (const d of list) {
      const k = d.display === 'none' ? '—' : `${keySize(d).w}×${keySize(d).h}`;
      const extra = [d.dials.count ? `${d.dials.count} dials` : '', d.strip ? `strip ${d.strip.w}×${d.strip.h}` : '', d.screen ? `${d.screen.kind} ${d.screen.w}×${d.screen.h}` : ''].filter(Boolean).join(', ');
      out(`${pad(d.id, 18)} ${pad(d.type ?? '—', 3)} ${pad(d.cols && d.rows ? `${d.cols}×${d.rows}` : 'app', 6)} ${pad(k, 8)} ${pad(d.display, 9)} ${pad(d.name, 34)} ${extra}`);
    }
    break;
  }
  case 'themes': {
    const list = allThemes().map((t) => ({ id: t.id, title: t.title, modes: t.modes, description: t.description }));
    if (opt.json) out(JSON.stringify(list, null, 2)); else for (const t of list) out(`${pad(t.id, 14)} ${pad(t.modes.join('/'), 11)} ${t.description}`);
    break;
  }
  case 'glyphs': {
    const list = allGlyphs().map((g) => ({ id: g.id, category: g.category, states: g.stateNames, title: g.title }));
    if (opt.json) out(JSON.stringify(list, null, 2)); else for (const g of list) out(`${pad(g.id, 16)} ${pad(g.category, 14)} ${pad(g.states.join('/'), 22)} ${g.title}`);
    break;
  }
  case 'export': {
    if (['opendeck', 'streamcontroller', 'linux-paths'].includes(pos[0])) {
      const { runLinuxExport } = await import('./src/export/linux-cli.js');
      process.exitCode = await runLinuxExport(pos[0], opt, { log: out });
      break;
    }
    process.stderr.write(`prism-deck: unknown export target "${pos[0] ?? ''}" (opendeck | streamcontroller | linux-paths)\n`);
    process.exitCode = 2; // usage error (runtime failures exit 1)
    break;
  }
  case 'hid': { const { main } = await import('./src/hid/cli.js'); process.exitCode = await main(argv.slice(1)); break; }
  case 'audio': {
    const { runAudioCommand } = await import('./src/export/linux-cli.js');
    process.exitCode = await runAudioCommand(pos[0], opt, { log: out });
    break;
  }
  default:
    out(`prism-deck ${API_VERSION} — Stream Deck facets from Prism\n\n  prism-deck list [--gallery g] [--surface s] [--json]\n  prism-deck search <terms…>\n  prism-deck info <facet-id>\n  prism-deck render <facet-id> [--device d] [--theme t] [--mode dark|light] [--t s] [--state n] [--size 144|144x112] [--out file.svg|dir]\n  prism-deck devices | themes | glyphs [--json]\n  prism-deck export opendeck | streamcontroller | linux-paths [options]   (Linux — docs/linux.md)\n  prism-deck audio detect | meter [options]
  prism-deck hid list | doctor | run | bench [options]   (Linux hidraw — docs/linux.md)`);
    if (cmd && cmd !== 'help' && cmd !== '--help') { process.stderr.write(`prism-deck: unknown command "${cmd}"\n`); process.exitCode = 2; } // usage error
}
