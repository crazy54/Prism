// Prism Control for Stream Deck: MV3 service worker entry.
// All listeners are registered synchronously (app.listen) before any await, so events wake the worker.
import { createApp } from './src/background/app.js';

const DEBUG = false;
const log = (...a) => { if (DEBUG) console.debug('[prism]', ...a); };

const app = createApp({ chrome, log });
app.listen();
app.init();

// Inspect from chrome://extensions -> "service worker": `prism.uiStatus()`, `prism.store`.
// The service worker global is not reachable from web pages.
globalThis.prism = app;
