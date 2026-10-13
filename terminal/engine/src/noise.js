// Seeded gradient noise (Ken Perlin's improved noise, 2002) plus fractal
// Brownian motion. Output is roughly in [-1, 1].

import { rng } from './easing.js';

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function createNoise(seed = 1337) {
  const rand = rng(seed);
  const p = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const g = (h, x, y, z) => {
    const v = GRAD3[h % 12];
    return v[0] * x + v[1] * y + v[2] * z;
  };

  function noise3(x, y, z = 0) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    const l1 = (a, b, t) => a + t * (b - a);
    return l1(
      l1(l1(g(perm[AA], x, y, z), g(perm[BA], x - 1, y, z), u), l1(g(perm[AB], x, y - 1, z), g(perm[BB], x - 1, y - 1, z), u), v),
      l1(l1(g(perm[AA + 1], x, y, z - 1), g(perm[BA + 1], x - 1, y, z - 1), u), l1(g(perm[AB + 1], x, y - 1, z - 1), g(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    );
  }

  /** Fractal Brownian motion: `octaves` layers of noise3, each at double frequency. */
  function fbm(x, y, z = 0, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  return { noise3, noise2: (x, y) => noise3(x, y, 0), fbm };
}

const shared = createNoise();
export const noise3 = shared.noise3;
export const noise2 = shared.noise2;
export const fbm = shared.fbm;
