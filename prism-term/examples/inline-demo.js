// `prism-term demo` — a tour of the inline helpers, shaped like a PROTEUS
// troubleshooting session: banner, task list, progress, AI "thinking", and a
// streamed answer. Everything animates in place and leaves clean scrollback.
//
//   node examples/inline-demo.js

import { banner, gradientText, animateText } from '../src/text/index.js';
import { spinner, progress, tasks, thinking, typewrite } from '../src/inline.js';
import { getTheme } from '../src/palettes.js';
import { sleep } from '../src/loop.js';
import { fileURLToPath } from 'node:url';

export async function runDemo(opts = {}) {
  const theme = getTheme(opts.theme);
  const out = process.stdout;
  const say = (s = '') => out.write(s + '\n');

  say(banner('PROTEUS', { fill: 'prism', theme }));
  say(gradientText('  metrics · troubleshooting · learning — powered by prism-term', ['#7a5cff', '#2ec5ff', '#3ddc84']));
  say();

  const sp = spinner('Connecting to telemetry sources', { theme });
  await sleep(900);
  sp.update('Connecting to telemetry sources · prometheus ✓ · loki …');
  await sleep(700);
  sp.succeed('Connected: prometheus, loki, tempo (3 sources)');

  await tasks([
    { title: 'Collect metrics (last 30m)', run: async (t) => { for (const s of ['cpu', 'latency', 'errors', 'saturation']) { t.update(s); await sleep(260); } } },
    { title: 'Index logs', run: async (t) => { for (let i = 1; i <= 4; i++) { t.update(`${i * 25}k lines`); await sleep(220); } } },
    { title: 'Sample traces', run: async () => sleep(700) },
    { title: 'Diff recent deploys', run: async () => sleep(500) },
  ], { concurrent: true, theme });

  const bar = progress({ total: 120, label: 'Building baseline', gradient: 'aurora', theme });
  for (let i = 0; i < 120; i++) { bar.tick(1); await sleep(12); }
  bar.done();

  const think = thinking('Correlating anomalies across 7 services', { theme });
  await sleep(2600);
  think.succeed?.('Found 1 incident: checkout p95 latency ×4.5, 5xx 6.1%');
  think.stop?.();

  say();
  await animateText('Diagnosis: connection pool exhaustion on checkout', { effect: 'decrypt', duration: 1.2, theme });
  await typewrite(
    'The DB is idle while checkout waits — so the bottleneck sits in front of it. v2.14.1 raised workers 8 → 32 but the pool is still 20.\n' +
    'Fix: roll back, or size the pool ≥ workers. Lesson: latency↑ + errors↑ + dependency idle ⇒ look for a queue (pool, lock, semaphore).\n',
    { cps: 90 },
  );
  say();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runDemo().catch((e) => { console.error(e); process.exit(1); });
