// Pack prism-term for the live player:  npx -y --package=<site>/dl/prism-term.tgz prism-term
//
//   node scripts/pack.mjs <out-dir> [--verify]
//
// Writes <out-dir>/prism-term-<version>.tgz (pin this one), prism-term.tgz (the same
// bytes: an alias that always points at the latest release) and SHA256SUMS for both,
// in sha256sum format:  curl -sL <site>/dl/SHA256SUMS | sha256sum -c --ignore-missing
// --verify installs the tarball through npx in a temp directory and runs
// `prism-term list` and `prism-term snapshot plasma` from it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// npm/npx are .cmd shims on Windows, which need a shell; pass one quoted command
// line there (passing an args array with shell:true is deprecated and unsafe).
const q = (s) => (process.platform === 'win32' && /[\s"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const run = (cmd, args, opts = {}) => (process.platform === 'win32'
  ? execFileSync([cmd, ...args].join(' '), { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  : execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }));

/** npm pack into outDir; returns { stable, versioned, sums, sha256, files, size }. */
export function pack(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-term-pack-'));
  try {
    const [info] = JSON.parse(run(NPM, ['pack', '--json', '--pack-destination', q(tmp)], { cwd: ROOT }));
    const src = path.join(tmp, info.filename);
    const versioned = path.join(outDir, `prism-term-${info.version}.tgz`);
    const stable = path.join(outDir, 'prism-term.tgz');
    fs.copyFileSync(src, versioned);
    fs.copyFileSync(src, stable);
    const sha256 = createHash('sha256').update(fs.readFileSync(src)).digest('hex');
    const sums = path.join(outDir, 'SHA256SUMS');
    fs.writeFileSync(sums, `${sha256}  ${path.basename(versioned)}\n${sha256}  ${path.basename(stable)}\n`);
    return { stable, versioned, sums, sha256, version: info.version, files: info.files.map((f) => f.path), size: info.size };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Install the tarball with npx in a scratch dir and run two commands from it. */
export function verify(tgz) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-term-npx-'));
  try {
    const env = { ...process.env, NO_COLOR: '1', npm_config_yes: 'true', npm_config_cache: path.join(tmp, '.npm') };
    const list = run(NPX, ['-y', `--package=${q(tgz)}`, 'prism-term', 'list'], { cwd: tmp, env });
    const snap = run(NPX, ['-y', `--package=${q(tgz)}`, 'prism-term', 'snapshot', 'plasma', '--size', '40x8', '-o', q(path.join(tmp, 'plasma.txt'))], { cwd: tmp, env });
    const frame = fs.readFileSync(path.join(tmp, 'plasma.txt'), 'utf8');
    return { list, snap, frame };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!out) { console.error('usage: node scripts/pack.mjs <out-dir> [--verify]'); process.exit(1); }
  const r = pack(path.resolve(out));
  const facets = r.files.filter((f) => /^src\/facets\/[^/]+\/[^_][^/]*\.js$/.test(f)).length;
  console.log(`packed prism-term ${r.version}: ${(fs.statSync(r.stable).size / 1024).toFixed(0)} KB, ${r.files.length} files (${facets} facet modules) → ${r.stable}`);
  if (process.argv.includes('--verify')) {
    const v = verify(r.stable);
    const lines = v.list.trim().split('\n');
    console.log(`npx prism-term list → ${lines.length} lines; last: ${lines.at(-1)}`);
    console.log(`npx prism-term snapshot plasma → ${v.frame.split('\n').length} rows`);
  }
}
