// Braille spinners — eight dots per cell, the npm/ora generation of loaders.
import { spinnerFacet } from './_kit.js';

const C = 'Braille Spinners';

export default [
  spinnerFacet({ id: 'loaders-dots', spin: 'dots', title: 'Dots', category: C, order: 10,
    description: 'The braille dot rotation npm, ora and half of all modern CLIs use — the default for a reason.',
    tags: ['braille', 'npm', 'ora', 'default'], labels: ['Resolving dependencies…', 'Fetching 214 packages…', 'Linking binaries…'] }),
  spinnerFacet({ id: 'loaders-dots-fill', spin: 'dots2', name: 'dots2', title: 'Dots Filled', category: C, order: 20,
    description: 'A full braille cell with one dot missing, the gap orbiting round — bold enough for dark themes.',
    tags: ['braille', 'bold'], labels: ['Installing toolchain…', 'Downloading rustc 1.82.0…'] }),
  spinnerFacet({ id: 'loaders-dot-orbit', spin: 'dots3', name: 'dots3', title: 'Single Dot', category: C, order: 30,
    description: 'One braille dot tracing the edge of its cell — the quietest loader in the catalog.',
    tags: ['braille', 'minimal', 'quiet'], labels: ['Waiting for input…', 'Idle — polling every 5s…'] }),
  spinnerFacet({ id: 'loaders-dot-bounce', spin: 'bounce', name: 'bounce', title: 'Dot Bounce', category: C, order: 40,
    description: 'A single dot bouncing up and down the left column of a braille cell.',
    tags: ['braille', 'bounce'], labels: ['Pinging 10.20.2.31…', 'Waiting for ack…'] }),
  spinnerFacet({ id: 'loaders-dot-stack', spin: 'loadingBlocks', name: 'loadingBlocks', title: 'Dot Stack', category: C, order: 50,
    description: 'Braille rows filling the cell from the bottom and draining again — a tiny level meter.',
    tags: ['braille', 'fill', 'level'], labels: ['Buffering stream…', 'Filling cache…'] }),
  spinnerFacet({ id: 'loaders-snake', spin: 'snake', title: 'Snake', category: C, order: 60,
    description: 'A four-dot snake chasing its tail round a two-cell perimeter — busy without being loud.',
    tags: ['braille', 'snake', 'perimeter'], labels: ['Crawling sitemap…', 'Walking the tree…'] }),
  spinnerFacet({ id: 'loaders-dot-fill', spin: 'fill', title: 'Cell Fill', category: C, order: 70,
    description: 'One braille cell filling dot by dot from the bottom, then draining — progress without a number.',
    tags: ['braille', 'fill'], labels: ['Charging…', 'Warming up the JIT…'] }),
];
