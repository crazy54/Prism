// Containers & clusters: docker pull, docker stats, kubectl get pods -w, rollout status, and a k9s-style console.
import { G, C, ATTR, writer, walk, hash, typed, bashPrompt, pad, lpad, fixed, uni } from './_kit.js';

/** docker's units.HumanSize: SI units, up to 4 significant digits. */
const hs = (b) => { const u = ['B', 'kB', 'MB', 'GB']; let i = 0; while (b >= 1000 && i < 3) { b /= 1000; i++; } return `${Number(b.toPrecision(4))}${u[i]}`; };
const mb = (b) => (b >= 1e9 ? `${fixed(b / 1e9, 2)}GB` : b >= 1e6 ? `${fixed(b / 1e6, 1)}MB` : `${fixed(b / 1e3, 1)}kB`);

const pull = {
  id: 'ops-docker-pull',
  title: 'docker pull',
  category: 'Containers & Clusters',
  description: 'docker pull with parallel layers going Waiting, Downloading (byte counters, ETA; bars past 110 cols), Verifying, Extracting, Pull complete, then the digest.',
  tags: ['docker', 'pull', 'layers', 'image', 'progress', 'registry'],
  kind: 'progress',
  size: { w: 80, h: 13 },
  minSize: { w: 60, h: 6 },
  loop: 22,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const LAYERS = [['a2318d6c47ec', 29.1e6, 0.0], ['3f1a2b0c9d88', 43.7e6, 0.4], ['7c0e5d4b2a19', 4.2e6, 0.8], ['e81f9a0b3c47', 118.6e6, 1.1], ['0bd4c8e7f611', 1.3e6, 2.0], ['52a9e0d1c3f8', 0.31e6, 2.2], ['c6e2b7a40d95', 12.9e6, 2.6]];
    const RATE = 12e6;
    return (t) => {
      const T = t % 22;
      const cmd = 'docker pull registry.example/shop/api:2.14.1';
      const ty = typed(cmd, T, 0.2, 26);
      const out = [];
      let x = bashPrompt(w, ctx, 0, 0);
      w.put(x, 0, ty.text, c.fg);
      if (!ty.done) { w.put(x + ty.text.length, 0, ' ', c.bg, c.fg); return; }
      const t0 = ty.at + 0.4;
      if (T < t0) return;
      const s = T - t0;
      out.push([['2.14.1: Pulling from shop/api', c.fg]]);
      let allDone = true;
      // Like docker's own progress: the [===>  ] bar only appears on terminals wider than 110
      // columns; narrower ones get the byte counters and an ETA, which is what 80 columns shows.
      const bar = (f) => (W > 110 ? `[${'='.repeat(Math.floor(f * 50))}>${' '.repeat(50 - Math.floor(f * 50))}] ` : '');
      const prog = (cur, size, rate) => `${bar(cur / size)}${lpad(hs(cur), 8)}/${hs(size)}${W > 50 && cur < size ? ` ${Math.max(0, Math.ceil((size - cur) / rate))}s` : ''}`;
      for (const [id, size, delay] of LAYERS) {
        const start = delay * 1.4, dl = size / RATE, ex = size / 160e6 + 0.3;
        let status;
        if (s < start) { status = [['Waiting', c.muted]]; allDone = false; }
        else if (s < start + dl) { status = [['Downloading ', c.yellow], [prog(size * (s - start) / dl, size, RATE), c.fg]]; allDone = false; }
        else if (s < start + dl + 0.3) { status = [['Verifying Checksum', c.cyan]]; allDone = false; }
        else if (s < start + dl + 0.6) { status = [['Download complete', c.cyan]]; allDone = false; }
        else if (s < start + dl + 0.6 + ex) { status = [['Extracting ', c.blue], [prog(size * (s - start - dl - 0.6) / ex, size, size / ex), c.fg]]; allDone = false; }
        else status = [['Pull complete', c.green]];
        out.push([[`${id}: `, c.fg], ...status]);
      }
      if (allDone) {
        out.push([['Digest: sha256:9b1f0c2e7d4a5f63b8e1c09d2a7f4e6b0c3d8a1f5e2b7c4d9a0e6f1b3c8d5a2e', c.muted]]);
        out.push([['Status: ', c.fg], ['Downloaded newer image for registry.example/shop/api:2.14.1', c.fg, ATTR.BOLD]]);
        out.push([['registry.example/shop/api:2.14.1', c.fg]]);
      }
      out.slice(0, H - 1).forEach((parts, i) => w.seg(0, 1 + i, parts));
    };
  },
};

const stats = {
  id: 'ops-docker-stats',
  title: 'docker stats',
  category: 'Containers & Clusters',
  description: 'docker stats refreshing every half second per container: name, CPU %, memory usage against its limit, MEM %, network I/O and PIDs.',
  tags: ['docker', 'stats', 'containers', 'cpu', 'memory', 'monitor'],
  kind: 'tui',
  size: { w: 80, h: 10 },
  minSize: { w: 64, h: 4 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const CS = [['shop-api-1', 0.35, 412e6, 2147e6], ['shop-api-2', 0.32, 398e6, 2147e6], ['shop-worker-1', 0.6, 820e6, 1073e6], ['shop-db-1', 0.22, 1.32e9, 4294e6],
      ['shop-redis-1', 0.04, 61e6, 512e6], ['shop-nginx-1', 0.03, 14e6, 256e6], ['otel-collector', 0.05, 88e6, 512e6], ['node-exporter', 0.01, 18e6, 128e6]];
    const mib = (b) => (b >= 1073741824 ? `${fixed(b / 1073741824, 2)}GiB` : `${fixed(b / 1048576, 1)}MiB`);
    return (t) => {
      const T = Math.floor(t * 2) / 2;
      w.put(0, 0, `${pad('NAME', 16)}${pad('CPU %', 9)}${pad('MEM USAGE / LIMIT', 21)}${pad('MEM %', 8)}${pad('NET I/O', 19)}PIDS`, c.fg, undefined, ATTR.BOLD);
      CS.slice(0, ctx.height - 1).forEach(([name, cpu, mem, lim], i) => {
        const cp = cpu * 100 * (0.55 + walk(ctx, i, T, 0.6) * 0.9);
        const m = mem * (0.96 + walk(ctx, i + 20, T, 0.1) * 0.08);
        const rx = 1.2e9 * (i + 1) * 0.3 + T * 2.1e6 * cpu * 3, tx = rx * 0.81;
        const pct = m / lim * 100;
        w.seg(0, 1 + i, [[pad(name, 16), c.cyan], [pad(`${fixed(cp, 2)}%`, 9), cp > 80 ? c.red : c.fg], [pad(`${mib(m)} / ${mib(lim)}`, 21), c.fg], [pad(`${fixed(pct, 2)}%`, 8), pct > 75 ? c.yellow : c.fg], [pad(`${mb(rx)} / ${mb(tx)}`, 19), c.fg], [String(4 + ((i * 7) % 30)), c.fg]]);
      });
    };
  },
};

const STC = (c, s) => (s === 'Running' ? c.green : /Creating|Pending|Init/.test(s) ? c.yellow : s === 'Terminating' ? c.magenta : s === 'Completed' ? c.blue : c.red);

const pods = {
  id: 'ops-kubectl-pods',
  title: 'kubectl get pods -w',
  category: 'Containers & Clusters',
  description: 'kubectl get pods -w during a rolling update: new pods go Pending → ContainerCreating → Running while old ones go Terminating, appended live.',
  tags: ['kubernetes', 'kubectl', 'pods', 'rollout', 'watch', 'k8s'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 60, h: 6 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const old = ['api-6c8f7d9b5c-4tq2m', 'api-6c8f7d9b5c-7mzxk', 'api-6c8f7d9b5c-r9b8n'];
    const neu = ['api-7d9c6b5f8d-2xk4p', 'api-7d9c6b5f8d-9qwlz', 'api-7d9c6b5f8d-hv6s1'];
    const events = [[0, 'worker-5f4b9c7d6f-q8l2c', '1/1', 'Running', 0, '6d2h'], [0, 'redis-0', '1/1', 'Running', 0, '19d'], ...old.map((n) => [0, n, '1/1', 'Running', 0, '3d4h'])];
    let at = 2;
    neu.forEach((n, i) => {
      events.push([at, n, '0/1', 'Pending', 0, '0s'], [at + 0.2, n, '0/1', 'ContainerCreating', 0, '0s'], [at + 2.4, n, '1/1', 'Running', 0, '3s']);
      events.push([at + 3.2, old[i], '1/1', 'Terminating', 0, '3d4h'], [at + 4.4, old[i], '0/1', 'Terminating', 0, '3d4h']);
      at += 5.5;
    });
    return (t) => {
      const T = t % 30;
      const ty = typed('kubectl get pods -n shop -w', T, 0.1, 30);
      let x = bashPrompt(w, ctx, 0, 0, { dir: '~/deploy' });
      w.put(x, 0, ty.text, c.fg);
      if (!ty.done) return;
      const visible = events.filter((e) => T >= ty.at + 0.3 + e[0]);
      const lines = [[[`${pad('NAME', 28)}${pad('READY', 8)}${pad('STATUS', 20)}${pad('RESTARTS', 11)}AGE`, c.fg, ATTR.BOLD]],
        ...visible.map(([, n, r, s, rs, age]) => [[pad(n, 28), c.fg], [pad(r, 8), c.fg], [pad(s, 20), STC(c, s)], [pad(rs, 11), c.fg], [age, c.fg]])];
      const room = ctx.height - 1;
      const head = lines[0];
      const body = lines.slice(1).slice(-(room - 1));
      [head, ...body].forEach((parts, i) => w.seg(0, 1 + i, parts));
    };
  },
};

const rollout = {
  id: 'ops-kubectl-rollout',
  title: 'kubectl rollout status',
  category: 'Containers & Clusters',
  description: 'kubectl rollout status counting up "N out of 5 new replicas have been updated…" to "successfully rolled out", with a replica strip below.',
  tags: ['kubernetes', 'kubectl', 'rollout', 'deployment', 'replicas'],
  kind: 'progress',
  size: { w: 80, h: 12 },
  minSize: { w: 60, h: 5 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    return (t) => {
      const T = t % 20;
      const ty = typed('kubectl rollout status deployment/api -n shop', T, 0.1, 30);
      let x = bashPrompt(w, ctx, 0, 0, { dir: '~/deploy' });
      w.put(x, 0, ty.text, c.fg);
      if (!ty.done) return;
      const s = T - ty.at - 0.3;
      const updated = Math.max(0, Math.min(5, Math.floor(s / 2) + 1));
      const msg = [];
      const wait = 'Waiting for deployment "api" rollout to finish: ';
      for (let k = 1; k <= updated; k++) msg.push([`${wait}${k} out of 5 new replicas have been updated...`, c.fg]);
      if (s > 10.5) msg.push([`${wait}1 old replicas are pending termination...`, c.fg]);
      if (s > 11.5) msg.push([`${wait}4 of 5 updated replicas are available...`, c.fg]);
      const done = s > 12.5;
      if (done) msg.push(['deployment "api" successfully rolled out', c.green, ATTR.BOLD]);
      const W = ctx.width, H = ctx.height;
      const rows = [];
      for (const [text, fg, attr] of msg) for (let i = 0; i < text.length; i += W) rows.push([text.slice(i, i + W), fg, attr]); // wraps, as a real tty would
      const strip = H >= 6 ? 2 : 0;
      rows.slice(-(H - 1 - strip)).forEach(([text, fg, attr], i) => w.put(0, 1 + i, text, fg, undefined, attr));
      if (strip) {
        const y = H - 1;
        let cx = w.put(0, y, 'replicas ', c.muted);
        for (let i = 0; i < 5; i++) {
          const isNew = i < updated, ready = isNew && s > i * 2 + 1.6;
          cx = w.put(cx, y, `${g.full}${g.full}`, isNew ? (ready ? c.green : c.yellow) : c.dim);
          cx = w.put(cx, y, ' ', c.fg);
        }
        w.put(cx + 1, y, done ? '5/5 ready · revision 42' : `${Math.min(5, updated)}/5 updated · revision 42`, done ? c.green : c.muted);
      }
    };
  },
};

const k9s = {
  id: 'ops-k9s',
  title: 'k9s-style Pod Console',
  category: 'Containers & Clusters',
  description: 'A k9s-style cluster console: context/cluster header with CPU/MEM, key hints, a titled pod table colored by status, a moving selection and a crumb bar.',
  tags: ['k9s', 'kubernetes', 'pods', 'console', 'tui', 'k8s'],
  kind: 'tui',
  size: { w: 80, h: 20 },
  minSize: { w: 60, h: 10 },
  loop: 24,
  glyphs: 'ascii',
  color: '256',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    const PODS = [['api-7d9c6b5f8d-2xk4p', 'Running', '10.42.1.18', 'node-a'], ['api-7d9c6b5f8d-9qwlz', 'Running', '10.42.2.7', 'node-b'], ['api-7d9c6b5f8d-hv6s1', 'Running', '10.42.3.22', 'node-c'],
      ['worker-5f4b9c7d6f-q8l2c', 'Running', '10.42.1.31', 'node-a'], ['worker-5f4b9c7d6f-x7d9p', 'CrashLoopBackOff', '10.42.2.12', 'node-b'], ['reindex-28817640-k2j4f', 'Completed', '10.42.3.9', 'node-c'],
      ['redis-0', 'Running', '10.42.1.4', 'node-a'], ['postgres-0', 'Running', '10.42.2.3', 'node-b'], ['migrate-2-14-1-vb7hs', 'ContainerCreating', '', 'node-c']];
    return (t) => {
      const cpu = Math.round(28 + walk(ctx, 1, t, 0.2) * 14), mem = Math.round(58 + walk(ctx, 2, t, 0.1) * 6);
      const info = [['Context:', 'prod-east'], ['Cluster:', 'prod-east'], ['User:', 'ops'], ['K9s Rev:', 'v0.32.5'], ['K8s Rev:', 'v1.31.2'], ['CPU:', `${cpu}%`], ['MEM:', `${mem}%`]];
      const keys = [['<0>', 'all'], ['<1>', 'shop'], ['<2>', 'default'], ['<a>', 'Attach'], ['<d>', 'Describe'], ['<l>', 'Logs'], ['<s>', 'Shell']];
      const top = Math.min(info.length, H - 6);
      for (let i = 0; i < top; i++) {
        w.seg(1, i, [[pad(info[i][0], 9), c.orange, ATTR.BOLD], [info[i][1], c.fg, ATTR.BOLD]]);
        if (keys[i] && W >= 64) w.seg(34, i, [[pad(keys[i][0], 5), c.blue, ATTR.BOLD], [keys[i][1], c.muted]]);
      }
      const y0 = top;
      const title = ` Pods(shop)[${PODS.length}] `;
      const boxH = H - y0 - 1;
      const side = Math.max(0, Math.floor((W - 2 - title.length) / 2));
      w.seg(0, y0, [[g.tl + g.h.repeat(side), c.cyan], [title, c.cyan, ATTR.BOLD], [g.h.repeat(Math.max(0, W - 2 - side - title.length)) + g.tr, c.cyan]]);
      for (let y = y0 + 1; y < y0 + boxH - 1; y++) { w.put(0, y, g.v, c.cyan); w.put(W - 1, y, g.v, c.cyan); }
      w.put(0, y0 + boxH - 1, g.bl + g.h.repeat(W - 2) + g.br, c.cyan);
      const cols = (a) => ` ${pad(a[0], 26)}${pad(a[1], 6)}${pad(a[2], 18)}${pad(a[3], 9)}${pad(a[4], 11)}${a[5]}`;
      w.put(1, y0 + 1, cols(['NAME' + (uni(ctx) ? '↑' : '^'), 'READY', 'STATUS', 'RESTARTS', 'IP', 'NODE']).slice(0, W - 2), c.fg, undefined, ATTR.BOLD);
      const sel = Math.floor(t / 2.5) % PODS.length;
      PODS.slice(0, Math.max(0, boxH - 3)).forEach(([n, s, ip, node], i) => {
        const restarts = s === 'CrashLoopBackOff' ? String(7 + Math.floor(t / 8)) : '0';
        const ready = s === 'Running' ? '1/1' : s === 'Completed' ? '0/1' : '0/1';
        const y = y0 + 2 + i;
        const text = cols([n, ready, s, restarts, ip || '<none>', node]).slice(0, W - 2);
        const col = s === 'Running' ? c.cyan : s === 'Completed' ? c.muted : s === 'CrashLoopBackOff' ? c.red : c.yellow;
        if (i === sel) { w.fill(1, y, W - 2, 1, ' ', c.bg, col); w.put(1, y, text, c.bg, col); }
        else w.put(1, y, text, col);
      });
      w.seg(0, H - 1, [[' <pod> ', c.bg, ATTR.BOLD, c.orange], [' shop ', c.bg, 0, c.cyan]]);
    };
  },
};

export default [pull, stats, pods, rollout, k9s];
