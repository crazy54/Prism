// Truecolor spinners — multi-cell loaders with a palette sweeping through them.
import { spinnerFacet } from './_kit.js';

const C = 'Truecolor Spinners';

export default [
  spinnerFacet({ id: 'loaders-orbit', spin: 'orbit', title: 'Orbit', category: C, order: 10,
    description: 'A planet with a short tail circling a lit sun in braille, shaded ice-blue — elegant for network waits.',
    tags: ['braille', 'orbit', 'planet'], labels: ['Establishing tunnel…', 'Handshaking with 10.20.4.11…'] }),
  spinnerFacet({ id: 'loaders-thinking', spin: 'thinking', title: 'Thinking', category: C, order: 20,
    description: 'Three blobs bobbing on a phase-shifted wave in aurora colors — the AI typing indicator.',
    tags: ['braille', 'ai', 'typing'], labels: ['Thinking…', 'Reading the logs…', 'Forming a hypothesis…'] }),
  spinnerFacet({ id: 'loaders-wave', spin: 'wave', title: 'Wave', category: C, order: 30,
    description: 'A sine wave of eighth blocks rolling across eight cells in ocean blues.',
    tags: ['blocks', 'wave', 'sine'], labels: ['Streaming audio…', 'Tuning in…'] }),
  spinnerFacet({ id: 'loaders-equalizer', spin: 'equalizer', title: 'Equalizer', category: C, order: 40,
    description: 'A five-band audio equalizer bouncing to an unheard beat, in synthwave colors.',
    tags: ['blocks', 'equalizer', 'audio', 'music'], labels: ['Analyzing spectrum…', 'Normalizing loudness…'] }),
  spinnerFacet({ id: 'loaders-dna', spin: 'dna', title: 'DNA', category: C, order: 50,
    description: 'Two braille helix strands twisting round each other with base-pair rungs, candy-colored.',
    tags: ['braille', 'dna', 'helix'], labels: ['Sequencing…', 'Aligning reads…'] }),
  spinnerFacet({ id: 'loaders-radar', spin: 'radar', title: 'Scanner Beam', category: C, order: 60,
    description: 'A block beam sweeping back and forth with a fading afterglow — scanning for something.',
    tags: ['blocks', 'scan', 'beam'], labels: ['Indexing archive…', 'Sweeping caches…'] }),
  spinnerFacet({ id: 'loaders-prism', spin: 'prism', title: 'Prism Facets', category: C, order: 70,
    description: 'Faceted diamonds catching a rainbow as they turn — Prism\'s own loader.',
    tags: ['diamond', 'rainbow', 'prism'], labels: ['Composing facets…', 'Refracting…'] }),
  spinnerFacet({ id: 'loaders-binary', spin: 'binary', title: 'Binary', category: C, order: 80,
    description: 'A six-digit register of bits flickering in matrix green — for encodes, hashes and checksums.',
    tags: ['binary', 'bits', 'ascii digits'], labels: ['Computing SHA-256…', 'Verifying checksum…'] }),
  spinnerFacet({ id: 'loaders-katakana', spin: 'matrix', name: 'matrix', title: 'Digital Rain', category: C, order: 90,
    description: 'Half-width katakana and digits flickering in green — a six-cell slice of digital rain.',
    tags: ['katakana', 'matrix', 'rain'], labels: ['Decrypting…', 'Following the white rabbit…'] }),
];
