// Prism originals — spinners with a bit of personality, generated from small
// formulas so every frame is exactly the same width.
import { spinnerFacet, braille, range } from './_kit.js';
import { mix, hsl } from '../../color.js';

const lerp = (a, b, k) => a + (b - a) * k;

// A ball under gravity bouncing across eight cells, with a two-dot motion trail.
const bounceFrames = (() => {
  const N = 40, out = [], pos = [];
  for (let k = 0; k < N; k++) {
    const u = k / N;                            // one lap: right then back
    const x = u < 0.5 ? u * 2 * 15 : (1 - u) * 2 * 15;
    const hop = (u * 6) % 1;                    // six hops per lap
    const y = 3 - 3 * 4 * hop * (1 - hop);      // parabola, floor at y=3
    pos.push([x, y]);
  }
  for (let k = 0; k < N; k++) out.push(braille(8, [pos[k], pos[(k - 1 + N) % N], pos[(k - 2 + N) % N]]));
  return out;
})();

// Five dots riding a traveling sine wave.
const dotWave = range(16, (k) => braille(5, range(5, (i) => [i * 2 + 0.5, 1.5 - 1.5 * Math.sin((k / 16) * Math.PI * 2 - i * 0.8)])));

// A nucleus with two electrons on tilted orbits.
const electrons = range(24, (k) => {
  const a = (k / 24) * Math.PI * 2;
  const dots = [[3, 1], [4, 1], [3, 2], [4, 2]];
  for (let j = 0; j < 3; j++) {
    const b = a - j * 0.35;
    dots.push([3.5 + 3.5 * Math.cos(b), 1.5 + 1.4 * Math.sin(b) * 0.9]);
    dots.push([3.5 + 2.6 * Math.cos(-b * 1.5 + 1.3), 1.5 + 1.5 * Math.sin(-b * 1.5 + 1.3)]);
  }
  return braille(4, dots);
});

// Concentric rings expanding from the center and fading.
const ripple = range(14, (k) => {
  const dots = [];
  for (const off of [0, 7]) {
    const r = ((k + off) % 14) / 14 * 3.2;
    if (r < 0.3) { dots.push([2.5, 1.5]); continue; }
    for (let s = 0; s < 24; s++) {
      const a = (s / 24) * Math.PI * 2;
      dots.push([2.5 + r * Math.cos(a), 1.5 + r * 0.55 * Math.sin(a)]);
    }
  }
  return braille(3, dots);
});

// A clock hand sweeping a two-cell dial, with a fixed hub.
const clockHand = range(12, (k) => {
  const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
  const dots = [[1.5, 1.5]];
  for (let s = 0.6; s <= 2; s += 0.45) dots.push([1.5 + s * Math.cos(a) * 1.15, 1.5 + s * Math.sin(a)]);
  return braille(2, dots);
});

// Morse "PRISM" on a scrolling tape, with a signal lamp.
const morse = (() => {
  const code = { P: '.--.', R: '.-.', I: '..', S: '...', M: '--' };
  const units = [];
  for (const ch of 'PRISM') {
    for (const [j, s] of [...code[ch]].entries()) {
      units.push(...Array(s === '.' ? 1 : 3).fill(1));
      if (j < code[ch].length - 1) units.push(0);
    }
    units.push(0, 0, 0);
  }
  units.push(0, 0, 0, 0);
  const T = 12;
  return range(units.length, (k) => {
    const lamp = units[k] ? '●' : '○';
    const tape = range(T, (i) => (units[(k + i) % units.length] ? '━' : ' ')).join('');
    return `${lamp} ${tape}`;
  });
})();

// White light entering a prism and fanning out as a spectrum.
const prismSweep = range(12, (k) => {
  const beam = range(3, (i) => (i === k % 3 ? '━' : '─')).join('');
  const fan = range(6, (j) => {
    const spread = (j + 1) * 0.28;
    return braille(1, [0, 1].flatMap((dx) => [1.5 - spread, 1.5 - spread / 3, 1.5 + spread / 3, 1.5 + spread].map((y) => [dx, y])));
  }).join('');
  return `${beam}◆${fan}`;
});

// An ECG trace scrolling left: baseline, P wave, QRS spike, T wave.
const ecg = (() => {
  const beat = [2, 2, 2, 1.6, 2, 2, 3, 0, 3, 2, 2, 1.4, 1.2, 1.6, 2, 2, 2, 2, 2, 2];
  return range(beat.length, (k) => {
    const dots = [];
    let prev = null;
    for (let x = 0; x < 16; x++) {
      const y = beat[(k + x) % beat.length];
      if (prev !== null) for (let s = 0; s <= 1; s += 0.5) dots.push([x - 1 + s, lerp(prev, y, s)]);
      dots.push([x, y]);
      prev = y;
    }
    return braille(8, dots);
  });
})();

// Two paddles rallying a ball across an eight-cell court.
const pong = range(32, (k) => {
  const u = k / 32;
  const bx = 1 + (u < 0.5 ? u * 2 : 2 - u * 2) * 13;
  const by = 1.5 + 1.5 * Math.sin(u * Math.PI * 4);
  const pl = Math.max(0, Math.min(2, by - 0.5)), pr = Math.max(0, Math.min(2, 1.5 + 1.5 * Math.sin((u + 0.04) * Math.PI * 4) - 0.5));
  return braille(8, [[0, pl], [0, pl + 1], [15, pr], [15, pr + 1], [bx, by]]);
});

// A snake on a serpentine path through a 8×4 dot field, eating and growing.
const snakeGame = (() => {
  const path = [];
  for (let y = 0; y < 4; y++) for (let i = 0; i < 8; i++) path.push([y % 2 ? 7 - i : i, y]);
  const N = path.length;
  return range(N, (k) => {
    const len = 2 + Math.floor((k / N) * 5);
    const body = range(len, (j) => path[(k - j + N) % N]);
    const food = path[(k + 6) % N];
    return braille(4, [...body, food]);
  });
})();

// A rotating two-arm spiral.
const spiral = range(16, (k) => {
  const dots = [];
  for (let arm = 0; arm < 2; arm++) for (let s = 0; s < 6; s++) {
    const r = 0.3 + s * 0.3, a = (k / 16) * Math.PI * 2 + s * 0.7 + arm * Math.PI;
    dots.push([1.5 + r * Math.cos(a) * 1.2, 1.5 + r * Math.sin(a)]);
  }
  return braille(2, dots);
});

// A chomping mouth working through a row of pellets.
const pacman = range(8, (k) => {
  const open = [0.9, 0.6, 0.25, 0.05, 0.25, 0.6, 0.9, 1][k];
  const head = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const dx = x - 1.5, dy = y - 1.5;
    if (dx * dx + dy * dy > 4.2) continue;
    const ang = Math.abs(Math.atan2(dy, dx));
    if (dx > 0 && ang < open) continue;
    head.push([x, y]);
  }
  // Pellets every other dot, sliding one dot left per frame into the mouth.
  const pellets = range(5, (p) => [1 + p * 2 - (k % 2), 1.5]);
  return braille(2, head) + braille(5, pellets);
});

// Three dots breathing in sequence.
const dotsSizes = ['∙', '•', '●', '•'];
const gradientDots = range(12, (k) => range(3, (i) => dotsSizes[Math.floor((k / 3 + 4 - i) % 4)]).join(' '));

// A real 8-bit counter (binary increments), not random noise.
const bits = range(64, (k) => ((k + 176) & 255).toString(2).padStart(8, '0'));

// Embers rising out of three cells of flame.
const ember = (() => {
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return range(20, () => {
    const dots = [];
    for (let x = 0; x < 6; x++) {
      const hgt = 1 + Math.floor(rnd() * 3.2);
      for (let y = 3; y > 3 - hgt; y--) dots.push([x, y]);
      if (rnd() < 0.35) dots.push([x, Math.floor(rnd() * 2)]);
    }
    return braille(3, dots);
  });
})();

const O = 'Orbits & Shapes', B = 'Braille Spinners', P = 'Bars & Pulses', T = 'Truecolor Spinners', CL = 'Classic Spinners';

export default [
  spinnerFacet({ id: 'loaders-gravity-bounce', name: 'gravity-bounce', title: 'Gravity Bounce', category: O, order: 70,
    spin: { frames: bounceFrames, interval: 45, colorAt: (t, i, k, th) => mix(th.info, th.ink, 0.35) },
    description: 'A braille ball hopping across eight cells under real parabolic gravity, trailing two dots of motion blur.',
    tags: ['physics', 'ball', 'gravity', 'original'], labels: ['Rebalancing load…', 'Bouncing requests…'] }),
  spinnerFacet({ id: 'loaders-dot-wave', name: 'dot-wave', title: 'Dot Wave', category: B, order: 80,
    spin: { frames: dotWave, interval: 60 },
    description: 'Five braille dots riding a traveling sine wave — a calm, readable loader for long tasks.',
    tags: ['braille', 'wave', 'original'], labels: ['Syncing…', 'Applying migrations…'] }),
  spinnerFacet({ id: 'loaders-electrons', name: 'electrons', title: 'Electron Orbits', category: O, order: 80,
    spin: { frames: electrons, interval: 55, colorAt: (t, i, k, th) => (i === 1 || i === 2 ? mix(th.warn, th.ink, 0.2) : th.info) },
    description: 'Two electrons circling a warm nucleus on tilted orbits, drawn in four braille cells.',
    tags: ['braille', 'atom', 'orbit', 'original'], labels: ['Splitting workloads…', 'Charging capacitors…'] }),
  spinnerFacet({ id: 'loaders-ripple', name: 'ripple', title: 'Ripple', category: P, order: 140,
    spin: { frames: ripple, interval: 70, colorAt: (t, i, k, th) => mix(th.accent, th.info, 0.5 + 0.5 * Math.sin(t * 3 + i)) },
    description: 'Concentric braille rings expanding from a point and fading out — a sonar ping with depth.',
    tags: ['braille', 'ripple', 'sonar', 'original'], labels: ['Discovering services…', 'Waiting for gossip…'] }),
  spinnerFacet({ id: 'loaders-clock-hand', name: 'clock-hand', title: 'Clock Hand', category: O, order: 90,
    spin: { frames: clockHand, interval: 110 },
    description: 'A braille clock hand sweeping a two-cell dial round a fixed hub — Unicode-only, no emoji needed.',
    tags: ['braille', 'clock', 'time', 'original'], labels: ['Waiting for maintenance window…', 'Sleeping 30s…'] }),
  spinnerFacet({ id: 'loaders-morse', name: 'morse', title: 'Morse Lamp', category: P, order: 150,
    spin: { frames: morse, interval: 90, colorAt: (t, i, k, th) => (i === 0 ? (morse[k][0] === '●' ? th.warn : th.dim) : th.accent) },
    description: 'A signal lamp flashing PRISM in real Morse timing while the code scrolls past on a tape.',
    tags: ['morse', 'signal', 'lamp', 'original'], labels: ['Transmitting…', 'Signalling peers…'] }),
  spinnerFacet({ id: 'loaders-prism-sweep', name: 'prism-sweep', title: 'Prism Refraction', category: T, order: 100,
    spin: { frames: prismSweep, interval: 80, colorAt: (t, i, k, th) => (i < 3 ? (i === k % 3 ? 0xffffff : th.muted) : i === 3 ? th.ink : hsl((i - 4) * 52 - t * 90, 0.85, 0.62)) },
    description: 'A pulse of white light hitting a prism and fanning into a turning rainbow — Prism\'s signature loader.',
    tags: ['prism', 'rainbow', 'light', 'original'], labels: ['Refracting facets…', 'Splitting the spectrum…'] }),
  spinnerFacet({ id: 'loaders-ecg', name: 'ecg', title: 'ECG', category: T, order: 110,
    spin: { frames: ecg, interval: 55, colorAt: (t, i, k, th) => mix(th.dim, th.neg, 0.35 + i / 10) },
    description: 'An ECG trace scrolling across eight braille cells — P wave, QRS spike, T wave. A heartbeat for health checks.',
    tags: ['braille', 'ecg', 'heartbeat', 'health', 'original'], labels: ['Health check passing…', 'Monitoring vitals…'] }),
  spinnerFacet({ id: 'loaders-pong', name: 'pong', title: 'Pong', category: O, order: 100,
    spin: { frames: pong, interval: 50 },
    description: 'Two braille paddles rallying a ball across an eight-cell court, forever.',
    tags: ['braille', 'pong', 'game', 'original'], labels: ['Negotiating protocol…', 'Exchanging keys…'] }),
  spinnerFacet({ id: 'loaders-snake-game', name: 'snake-game', title: 'Snake Game', category: B, order: 90,
    spin: { frames: snakeGame, interval: 75 },
    description: 'A braille snake slithering a serpentine path, eating the dot ahead of it and growing longer.',
    tags: ['braille', 'snake', 'game', 'original'], labels: ['Consuming queue…', 'Eating backlog…'] }),
  spinnerFacet({ id: 'loaders-spiral', name: 'spiral', title: 'Spiral', category: B, order: 100,
    spin: { frames: spiral, interval: 60 },
    description: 'A two-armed braille spiral turning on the spot — hypnotic in a single pair of cells.',
    tags: ['braille', 'spiral', 'original'], labels: ['Compiling shaders…', 'Hashing…'] }),
  spinnerFacet({ id: 'loaders-chomp', name: 'chomp', title: 'Chomp', category: O, order: 110,
    spin: { frames: pacman, interval: 90, colorAt: (t, i, k, th) => (i < 2 ? th.warn : th.ink) },
    description: 'A round braille mouth chomping its way through a row of pellets — a cheerful queue-drain loader.',
    tags: ['braille', 'chomp', 'game', 'original'], labels: ['Draining queue…', 'Processing 1,204 items…'] }),
  spinnerFacet({ id: 'loaders-breathing-dots', name: 'breathing-dots', title: 'Breathing Dots', category: T, order: 120,
    spin: { frames: gradientDots, interval: 110, colorAt: (t, i, k, th) => mix(th.accent, th.crit, 0.5 + 0.5 * Math.sin(t * 2.4 - i * 1.2)) },
    description: 'Three dots swelling in sequence while their color drifts between accent and violet — a chat-style wait.',
    tags: ['dots', 'typing', 'chat', 'original'], labels: ['Assistant is typing…', 'Composing reply…'] }),
  spinnerFacet({ id: 'loaders-bit-counter', name: 'bit-counter', title: 'Bit Counter', category: CL, order: 150,
    spin: { frames: bits, interval: 120 },
    description: 'An eight-bit register counting up in real binary, one increment per tick — low bits flicker, high bits creep. Pure ASCII.',
    tags: ['ascii', 'binary', 'counter', 'original'], labels: ['Counting blocks...', 'Walking the bitmap...'] }),
  spinnerFacet({ id: 'loaders-ember', name: 'ember', title: 'Ember', category: T, order: 130,
    spin: { frames: ember, interval: 90, colorAt: (t, i, k, th) => [0xff4f1f, 0xff9a2e, 0xffd25e][(i + k) % 3] },
    description: 'Three cells of braille flame flickering with embers breaking loose — for burn-in, soak and stress tests.',
    tags: ['braille', 'fire', 'flame', 'original'], labels: ['Burning in…', 'Stress testing 8 cores…'] }),
];
