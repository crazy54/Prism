// Inline helpers: plain-text degradation off-TTY, live frames + clean restore on a TTY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { spinner, progress, tasks, thinking, typewrite, isInteractive } from '../src/inline.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pipe() {
  const chunks = [];
  const s = new Writable({ write(c, _e, cb) { chunks.push(String(c)); cb(); } });
  s.text = () => chunks.join('');
  return s;
}

function tty(columns = 80, rows = 24) {
  const chunks = [];
  return {
    isTTY: true, columns, rows,
    write(s, cb) { chunks.push(String(s)); if (typeof cb === 'function') cb(); return true; },
    on() { return this; }, off() { return this; }, once() { return this; },
    text: () => chunks.join(''),
    chunks,
  };
}

/**
 * Replay terminal output into a virtual scrollback (enough VT for inline mode:
 * CR/LF, CUU/CUD/CHA, EL, SGR and private modes) and return the visible lines.
 */
function screenText(out, cols = 80) {
  const lines = [[]];
  let row = 0, col = 0;
  const re = /\x1b\[([?0-9;]*)([A-Za-z])|\x1b\][^\x07]*\x07|\x1b[78]|([\s\S])/gu;
  for (const m of out.matchAll(re)) {
    if (m[3] !== undefined) {
      const ch = m[3];
      if (ch === '\r') col = 0;
      else if (ch === '\n') { row++; if (!lines[row]) lines[row] = []; }
      else { lines[row][col] = ch; col = Math.min(cols - 1, col + 1); }
      continue;
    }
    if (!m[2]) continue;
    const n = m[1] === '' ? 1 : parseInt(m[1], 10);
    if (m[2] === 'A') row = Math.max(0, row - n);
    else if (m[2] === 'B') { row += n; while (lines.length <= row) lines.push([]); }
    else if (m[2] === 'G') col = n - 1;
    else if (m[2] === 'K') { if (m[1] === '2') lines[row] = []; else lines[row].length = col; }
  }
  return lines.map((l) => Array.from(l, (c) => c ?? ' ').join('').trimEnd()).join('\n').replace(/\n+$/, '');
}

const noEsc = (s) => assert.ok(!s.includes('\x1b'), `unexpected escape in ${JSON.stringify(s)}`);

test('isInteractive follows isTTY and honors overrides', () => {
  assert.equal(isInteractive(pipe()), false);
  assert.equal(isInteractive(tty()), true);
  assert.equal(isInteractive(tty(), { interactive: false }), false);
});

test('spinner off-TTY: plain start + final lines, no escapes', async () => {
  const out = pipe();
  const s = spinner('Loading metrics', { stream: out });
  s.update('still loading');
  s.log('a log line');
  s.succeed('Loaded 42 series');
  s.fail('ignored after finish');
  const t = out.text();
  noEsc(t);
  const lines = t.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^- Loading metrics$/);
  assert.equal(lines[1], 'a log line');
  assert.match(lines[2], /Loaded 42 series$/);
});

test('spinner.wrap resolves → succeed, rejects → fail + rethrow', async () => {
  const out = pipe();
  const v = await spinner('work', { stream: out }).wrap(Promise.resolve(7), { success: (x) => `got ${x}` });
  assert.equal(v, 7);
  await assert.rejects(spinner('boom', { stream: out }).wrap(() => Promise.reject(new Error('nope'))), /nope/);
  const t = out.text();
  noEsc(t);
  assert.match(t, /got 7/);
  assert.match(t, /boom — nope/);
});

test('progress off-TTY: quarter milestones then a done line', () => {
  const out = pipe();
  const p = progress({ total: 200, label: 'Ingest', stream: out });
  for (let i = 0; i < 200; i += 10) p.tick(10);
  p.done();
  const t = out.text();
  noEsc(t);
  const lines = t.trim().split('\n');
  assert.deepEqual(lines.slice(0, 3).map((l) => l.match(/(\d+)%/)[1]), ['25', '50', '75']);
  assert.match(lines.at(-1), /Ingest 100% \(200\) in/);
});

test('tasks sequential: a failure skips the rest; concurrent: others still run', async () => {
  const out = pipe();
  const seq = await tasks([
    { title: 'fetch', run: async (t) => { t.update('page 1'); return 1; } },
    { title: 'parse', run: async () => { throw new Error('bad json'); } },
    { title: 'store', run: async () => 3 },
  ], { stream: out });
  assert.deepEqual(seq.map((r) => r.status), ['success', 'failed', 'skipped']);
  assert.equal(seq[0].value, 1);
  assert.equal(seq[1].error.message, 'bad json');

  const conc = await tasks([
    { title: 'a', run: async () => { await sleep(5); return 'A'; } },
    { title: 'b', run: async () => { throw new Error('x'); } },
    { title: 'c', run: async (t) => t.skip('not needed') },
    { title: 'd', skip: () => 'disabled', run: async () => 'never' },
  ], { stream: out, concurrent: true });
  assert.deepEqual(conc.map((r) => r.status), ['success', 'failed', 'skipped', 'skipped']);
  const t = out.text();
  noEsc(t);
  assert.match(t, /parse — bad json/);
});

test('thinking + typewrite off-TTY are instant and plain', async () => {
  const out = pipe();
  const th = thinking('Correlating spikes', { stream: out });
  th.succeed('Found root cause');
  await typewrite('The pool is exhausted.', { stream: out, color: 'accent' });
  async function* tokens() { yield 'Check '; yield 'max_connections'; }
  const all = await typewrite(tokens(), { stream: out });
  assert.equal(all, 'Check max_connections');
  const t = out.text();
  noEsc(t);
  assert.match(t, /Found root cause/);
  assert.match(t, /The pool is exhausted\.\n/);
  assert.match(t, /Check max_connections\n$/);
});

test('spinner on a TTY animates frames and restores the cursor', async () => {
  const out = tty();
  const s = spinner('Analyzing logs', { stream: out, style: 'dots' });
  await sleep(220);
  s.log('found 3 anomalies');
  await sleep(60);
  s.succeed('Analysis complete');
  const t = out.text();
  assert.ok(t.startsWith('\x1b[?25l'), 'hides cursor first');
  assert.ok(t.endsWith('\x1b[?25h'), 'restores cursor last');
  const frames = new Set([...t].filter((ch) => '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'.includes(ch)));
  assert.ok(frames.size >= 2, `animated (${[...frames].join('')})`);
  assert.match(t, /\x1b\[\?2026h/, 'synchronized output');
  const visible = screenText(t).split('\n');
  assert.equal(visible.length, 2, JSON.stringify(visible));
  assert.equal(visible[0], 'found 3 anomalies');
  assert.match(visible[1], /^\S Analysis complete$/);
  assert.equal((t.match(/\x1b\[\?25h/g) || []).length, (t.match(/\x1b\[\?25l/g) || []).length, 'balanced hide/show');
});

test('progress, tasks, thinking on a TTY end clean', async () => {
  const out = tty(100, 30);
  const p = progress({ total: 10, label: 'Scan', stream: out });
  for (let i = 0; i < 10; i++) { p.tick(); await sleep(8); }
  p.done();
  await tasks([
    { title: 'Collect metrics', run: async (t) => { t.update('cpu'); await sleep(30); } },
    { title: 'Ask the model', run: async () => { await sleep(30); throw new Error('rate limited'); } },
  ], { stream: out, concurrent: true });
  const th = thinking('Reasoning about the outage', { stream: out });
  await sleep(120);
  th.stop();
  const t = out.text();
  assert.ok(t.endsWith('\x1b[?25h'));
  const visible = screenText(t, 100).split('\n');
  assert.match(visible[0], /^\S Scan .*100% {2}10\/10 +\d+\.\ds$/);
  assert.match(visible[1], /^\S Collect metrics \d+\.\ds$/);
  assert.match(visible[2], /^\S Ask the model — rate limited$/);
  // thinking.stop() erased its own line: nothing remains after the task list.
  assert.equal(visible.length, 3, JSON.stringify(visible));
});

test('typewrite on a TTY streams in chunks with color and resets', async () => {
  const out = tty();
  // ~0.4 s of typing: at 600 cps it finished in ~3 Windows timer ticks (31 ms), so the chunk count was a coin flip.
  await typewrite('Root cause: connection pool exhaustion on db-primary.', { stream: out, cps: 135, color: 'accent' });
  assert.ok(out.chunks.length > 3, `streamed in ${out.chunks.length} chunks`);
  const t = out.text();
  assert.match(t, /^\x1b\[[0-9;]+m/);
  assert.ok(t.endsWith('\x1b[0m\n'));
  assert.equal(t.replace(/\x1b\[[0-9;]*m/g, ''), 'Root cause: connection pool exhaustion on db-primary.\n');
});
