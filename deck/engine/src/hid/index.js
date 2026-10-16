// prism-deck/hid — zero-dependency direct drive for Stream Decks and the Corsair
// Galleon 100 SD on Linux (/dev/hidrawN through node:fs; feature reports through
// linux/prism-deck-hidfeature.py). Opt-in: refuses decks another app is using.
// See docs/linux.md.

export { MODELS, MODEL_BY_USB, MODEL_BY_ID, USB_IDS, VENDOR, OUTPUT_COMMANDS, modelForUsb, modelForDevice, hidKey, usbKey } from './models.js';
export { listDecks, selectDeck, parseUevent, parseHidId, interfaceOf, parseInterfaceNumber, matchUevent } from './discover.js';
export { packets, chunk, reportCount, REPORT, checkOutputReport } from './packets.js';
export { features, checkFeature, ALLOWED_SET, ALLOWED_GET, GETTERS, decodeGet, galleonRingIndex, featureLen } from './features.js';
export { createInputParser } from './input.js';
export { HidError, claimDeck, findHolders, findDeckApps, acquireLock, DECK_APPS } from './claim.js';
export { openHidraw, memoryTransport, explainErrno } from './transport.js';
export { startFeatureHelper, HELPER_PATH } from './helper.js';
export { HidDeck } from './deck.js';
export { resolveLayout, defaultLayout, parseSpanArg } from './layout.js';
export { createRunner } from './runner.js';
export { sniffReports } from './sniff.js';
export { udevRules, UDEV_RULES_NAME } from './udev.js';
export { main as hidMain } from './cli.js';
