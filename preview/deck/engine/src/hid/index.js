// prism-deck/hid — zero-dependency direct drive for Stream Decks and the Corsair
// Galleon 100 SD on Linux (/dev/hidrawN through node:fs; feature reports through
// linux/prism-deck-hidfeature.py). Opt-in: refuses decks another app is using.
// See docs/linux.md.

export { MODELS, MODEL_BY_USB, MODEL_BY_ID, USB_IDS, VENDOR, OUTPUT_COMMANDS, modelForUsb, modelForDevice, hidKey, usbKey } from './models.js?v=a917677388';
export { listDecks, selectDeck, parseUevent, parseHidId, interfaceOf, parseInterfaceNumber, matchUevent } from './discover.js?v=a917677388';
export { packets, chunk, reportCount, REPORT, checkOutputReport } from './packets.js?v=a917677388';
export { features, checkFeature, ALLOWED_SET, ALLOWED_GET, GETTERS, decodeGet, galleonRingIndex, featureLen } from './features.js?v=a917677388';
export { createInputParser } from './input.js?v=a917677388';
export { HidError, claimDeck, findHolders, findDeckApps, acquireLock, DECK_APPS } from './claim.js?v=a917677388';
export { openHidraw, memoryTransport, explainErrno } from './transport.js?v=a917677388';
export { startFeatureHelper, HELPER_PATH } from './helper.js?v=a917677388';
export { HidDeck } from './deck.js?v=a917677388';
export { resolveLayout, defaultLayout, parseSpanArg } from './layout.js?v=a917677388';
export { createRunner } from './runner.js?v=a917677388';
export { sniffReports } from './sniff.js?v=a917677388';
export { udevRules, UDEV_RULES_NAME } from './udev.js?v=a917677388';
export { main as hidMain } from './cli.js?v=a917677388';
