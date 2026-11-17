// Containers & Clusters: `docker build` in BuildKit's live TTY view (moby/buildkit progressui). A cold
// build runs pip for nine seconds under the six-line log tail; a version bump then rebuilds warm and the
// layer cache turns steps 2-4 into CACHED. Every screen is a pure function of t % loop.
import { C, writer, wrapParts } from './_kit.js';
import { phase } from './_watch.js';
import { shellPrompt, typedLine } from './_shell.js';

const shared = { glyphs: 'ascii', color: '16' };
const LOOP = 24;
const HOST = { host: 'build01', dir: '~/api' };
const DESC = 'docker:default'; // buildx shows driver:builder on the header's right
const BASE = 'docker.io/library/python:3.12-slim@sha256:2be8daddbb82756f7d1f2c09c1a4c0d6f8e93b5a7c4e1d2f3a4b5c6d7e8f9a0b';
const CMD_A = 'docker build -t api:1.4.2 .';
const CMD_B = 'sed -i s/1.4.2/1.4.3/ app/version.py && docker build -t api:1.4.3 .'; // COPY is content-hashed
const A_AT = 0.2, A0 = 1.4, B_AT = 15.6, B0 = 17.95, CLEAR_TYPE = 22.6, CLEAR_AT = 23.1;

// pip's output under `RUN pip install` (seconds from the step's start); BuildKit tails it six rows deep.
const PIP = [
  [0.55, 'Collecting fastapi==0.110.3 (from -r requirements.txt (line 1))'],
  [0.78, '  Downloading fastapi-0.110.3-py3-none-any.whl.metadata (24 kB)'],
  [1.02, 'Collecting uvicorn==0.29.0 (from -r requirements.txt (line 2))'],
  [1.19, '  Downloading uvicorn-0.29.0-py3-none-any.whl.metadata (6.3 kB)'],
  [1.46, 'Collecting sqlalchemy==2.0.30 (from -r requirements.txt (line 3))'],
  [1.70, '  Downloading SQLAlchemy-2.0.30-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (9.6 kB)'],
  [1.97, 'Collecting psycopg==3.1.19 (from psycopg[binary]==3.1.19->-r requirements.txt (line 4))'],
  [2.14, '  Downloading psycopg-3.1.19-py3-none-any.whl.metadata (4.2 kB)'],
  [2.40, 'Collecting redis==5.0.4 (from -r requirements.txt (line 5))'],
  [2.55, '  Downloading redis-5.0.4-py3-none-any.whl.metadata (9.3 kB)'],
  [2.83, 'Collecting starlette<0.38.0,>=0.37.2 (from fastapi==0.110.3->-r requirements.txt (line 1))'],
  [3.01, '  Downloading starlette-0.37.2-py3-none-any.whl.metadata (5.9 kB)'],
  [3.30, 'Collecting pydantic!=1.8,!=1.8.1,!=2.0.0,!=2.0.1,!=2.1.0,<3.0.0,>=1.7.4 (from fastapi==0.110.3->-r requirements.txt (line 1))'],
  [3.49, '  Downloading pydantic-2.7.4-py3-none-any.whl.metadata (109 kB)'],
  [3.75, 'Collecting typing-extensions>=4.8.0 (from fastapi==0.110.3->-r requirements.txt (line 1))'],
  [3.90, '  Downloading typing_extensions-4.12.2-py3-none-any.whl.metadata (3.0 kB)'],
  [4.18, 'Collecting psycopg-binary==3.1.19 (from psycopg[binary]==3.1.19->-r requirements.txt (line 4))'],
  [4.36, '  Downloading psycopg_binary-3.1.19-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (2.8 kB)'],
  [4.70, 'Downloading fastapi-0.110.3-py3-none-any.whl (91 kB)'],
  [4.92, 'Downloading uvicorn-0.29.0-py3-none-any.whl (60 kB)'],
  [5.31, 'Downloading SQLAlchemy-2.0.30-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.2 MB)'],
  [5.88, 'Downloading psycopg_binary-3.1.19-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.4 MB)'],
  [6.33, 'Downloading pydantic_core-2.18.4-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (2.0 MB)'],
  [6.71, 'Installing collected packages: typing-extensions, sniffio, idna, h11, greenlet, click, annotated-types, uvicorn, sqlalchemy, redis, pydantic-core, psycopg-binary, anyio, starlette, pydantic, psycopg, fastapi'],
  [8.12, 'Successfully installed annotated-types-0.7.0 anyio-4.4.0 click-8.1.7 fastapi-0.110.3 greenlet-3.0.3 h11-0.14.0 idna-3.7 psycopg-3.1.19 psycopg-binary-3.1.19 pydantic-2.7.4 pydantic-core-2.18.4 redis-5.0.4 sniffio-1.3.1 sqlalchemy-2.0.30 starlette-0.37.2 typing-extensions-4.12.2 uvicorn-0.29.0'],
  [8.19, "WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager. It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv"],
  [8.45, '[notice] A new release of pip is available: 24.0 -> 24.1'],
  [8.46, '[notice] To update, run: pip install --upgrade pip'],
];

// Vertices: [t0, t1] in seconds from the build's start, statuses [id, t0, t1, bytes?], CACHED ones instant.
const step = (name, t0, t1, more = {}) => ({ name, t0, t1, ...more });
const tail = (tag, t0) => [['exporting layers', t0, t0 + 0.22 + (tag === '1.4.2' ? 0.17 : 0)],
  [`writing image sha256:${tag === '1.4.2' ? '7d2a91c4e0b35f8a6c1d9e2b7f4a3c5d8e6b0a1f2c3d4e5f6a7b8c9d0e1f2a3b' : 'c3f81e07a9d24b6f5e8c1a3d7b9e2f4a6c8d0e1b3a5c7d9e1f2a4b6c8d0e2f4a'}`, t0 + 0.4, t0 + 0.43],
  [`naming to docker.io/library/api:${tag}`, t0 + 0.43, t0 + 0.46]];
const COLD = [
  step('[internal] load build definition from Dockerfile', 0, 0.03, { st: [['transferring dockerfile:', 0, 0.02, '412B']] }),
  step('[internal] load metadata for docker.io/library/python:3.12-slim', 0.04, 1.12),
  step('[internal] load .dockerignore', 1.13, 1.15, { st: [['transferring context:', 1.13, 1.14, '2B']] }),
  step(`[1/7] FROM ${BASE}`, 1.16, 1.18, { st: [[`resolve ${BASE}`, 1.16, 1.18]] }),
  step('[internal] load build context', 1.16, 1.26, { st: [['transferring context:', 1.17, 1.25, '48.21kB']] }),
  step('[2/7] WORKDIR /app', 1.27, 1.34),
  step('[3/7] COPY requirements.txt .', 1.35, 1.42),
  step('[4/7] RUN pip install --no-cache-dir -r requirements.txt', 1.43, 10.38, { logs: PIP }),
  step('[5/7] COPY . .', 10.39, 10.48),
  step('[6/7] RUN python -m compileall -q .', 10.49, 11.12),
  step('[7/7] RUN useradd --system --no-create-home app', 11.13, 11.53),
  step('exporting to image', 11.54, 12.02, { st: tail('1.4.2', 11.54) }),
];
const WARM = [
  step('[internal] load build definition from Dockerfile', 0, 0.02, { st: [['transferring dockerfile:', 0, 0.01, '412B']] }),
  step('[internal] load metadata for docker.io/library/python:3.12-slim', 0.03, 0.51),
  step('[internal] load .dockerignore', 0.52, 0.54, { st: [['transferring context:', 0.52, 0.53, '2B']] }),
  step(`[1/7] FROM ${BASE}`, 0.55, 0.56),
  step('[internal] load build context', 0.55, 0.61, { st: [['transferring context:', 0.56, 0.6, '1.07kB']] }),
  step('[2/7] WORKDIR /app', 0.62, 0.62, { cached: true }),
  step('[3/7] COPY requirements.txt .', 0.72, 0.72, { cached: true }),
  step('[4/7] RUN pip install --no-cache-dir -r requirements.txt', 0.82, 0.82, { cached: true }),
  step('[5/7] COPY . .', 0.85, 0.94),
  step('[6/7] RUN python -m compileall -q .', 0.95, 1.57),
  step('[7/7] RUN useradd --system --no-create-home app', 1.58, 1.97),
  step('exporting to image', 1.98, 2.29, { st: tail('1.4.3', 1.98) }),
];
const BUILDS = [{ v: COLD, at: A0, end: 12.1 }, { v: WARM, at: B0, end: 2.35 }];

const dockerBuild = {
  ...shared,
  id: 'ops-docker-build',
  since: '0.3.0',
  title: 'docker build',
  category: 'Containers & Clusters',
  order: 200,
  description: "docker build in BuildKit's live view: a cold build runs pip under a six-line log tail, then a version bump rebuilds warm and the layer cache turns steps 2 to 4 into CACHED.",
  tags: ['docker', 'build', 'buildkit', 'dockerfile', 'cache', 'layers', 'pip', 'image'],
  kind: 'progress',
  size: { w: 80, h: 22 },
  minSize: { w: 56, h: 6 },
  loop: LOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    // One BuildKit print (display.go: setupTerminals + print) at e seconds into a build.
    const block = ({ v: verts, end }, e) => {
      const all = e >= end, jobs = [];
      let done = 0;
      for (const v of verts) {
        if (v.t1 <= e) done++;
        if (e < v.t0) continue;
        jobs.push({ name: (v.cached ? 'CACHED ' : '') + v.name, dt: Math.min(e, v.t1) - v.t0, run: e < v.t1, v });
        for (const [id, s0, s1, bytes] of v.st ?? []) if (e >= s0) jobs.push({ name: `=> ${id}`, status: bytes, dt: Math.min(e, s1) - s0, run: e < s1 });
      }
      let shown = jobs, logRows = [];
      if (!all) {
        const running = jobs.filter((j) => j.run).length, logger = jobs.find((j) => j.run && j.v?.logs);
        if (logger && H - 2 - running > 9) { // the vt100 tail is 6 rows of width W-10, empty rows skipped
          const rows = [];
          for (const [at, text] of logger.v.logs) if (at <= e - logger.v.t0) for (const r of wrapParts([[text]], W - 10)) rows.push(r.map((p) => p[0]).join(''));
          logRows = rows.slice(-6);
        }
        const limit = H - 2 - logRows.length;
        if (shown.length > limit) { // wrapHeight: keep the newest, then swap hidden running jobs back in
          const hidden = jobs.slice(0, jobs.length - limit).filter((j) => j.run);
          let kept = jobs.slice(jobs.length - Math.max(0, limit));
          if (hidden.length) {
            let n = hidden.length;
            const re = kept.filter((j) => { const keep = j.run || n <= 0; n--; return keep; });
            kept = [...hidden.slice(hidden.length - (kept.length - re.length)), ...re];
          }
          shown = limit > 0 ? kept : [];
        }
      }
      const head = `[+] Building ${(all ? end : e).toFixed(1)}s (${done}/${verts.length}) ${all ? 'FINISHED' : ''}`;
      const lines = [[[`${head.padEnd(W - DESC.length - 2)} ${DESC}`.slice(0, W), c.fg]]];
      const logger = logRows.length ? shown.find((x) => x.run && x.v?.logs) : null;
      for (const j of shown) {
        const timer = ` ${(j.dt < 0.05 ? 0 : j.dt).toFixed(1).padStart(3)}s`;
        let left = W - 4 - (timer.length + 1) - 1, status = '';
        if (j.status && left + j.status.length > 20) { status = ` ${j.status}`; left -= status.length; }
        if (left < 12) continue;
        const text = ` => ${j.name.slice(0, left)}${status}`.padEnd(W - timer.length - 2);
        lines.push([[`${text} ${timer}`, j.run ? c.fg : c.blue]]);
        if (j === logger) for (const r of logRows.filter((x) => x.trim())) lines.push([[` => => # ${r}`, c.dim]]);
      }
      return lines;
    };
    const transcript = (T) => {
      if (T >= CLEAR_AT) return [shellPrompt(c, HOST, '', true)];
      const lines = [typedLine(c, HOST, CMD_A, T, A_AT, 24).parts];
      let busy = false;
      [[BUILDS[0], B_AT, CMD_B, 30], [BUILDS[1], CLEAR_TYPE, 'clear', 14]].forEach(([b, nextAt, next, cps], i) => {
        if (busy || T < b.at) { busy = true; return; }
        lines.push(...block(b, T - b.at));
        if (T < b.at + b.end) { lines.push([]); busy = true; return; } // the cursor sits on the line below the block
        lines.push(typedLine(c, HOST, next, T, nextAt, cps).parts);
        if (i === 0 && T < BUILDS[1].at) busy = true;
      });
      return lines;
    };
    const rowsAt = (T) => transcript(T).flatMap((l) => wrapParts(l.length ? l : [['']], W));
    // The terminal scrolls but never scrolls back: when BuildKit's block shrinks, blank rows stay below it.
    const STEP = 0.1, runMax = [];
    for (let k = 0, m = 0; k * STEP < LOOP; k++) { const t = k * STEP; m = t >= CLEAR_AT ? 1 : Math.max(m, rowsAt(t).length); runMax.push(m); }
    return (t) => {
      const T = phase(t, LOOP), rows = rowsAt(T);
      const top = Math.max(0, Math.max(rows.length, T >= CLEAR_AT ? 0 : runMax[Math.floor(T / STEP)] ?? 0) - H);
      rows.slice(top, top + H).forEach((parts, y) => w.seg(0, y, parts));
    };
  },
};

export default [dockerBuild];
