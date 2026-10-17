// Protocol v1 constants shared by the service worker, the UI pages and the tests.
// PROTOCOL.md is the human-readable source of truth; keep the two in step.

export const PROTO = 1;
export const HOST_NAME = 'com.jeremyfhall.prismcontrol.browser';

/** Message types (`t`). */
export const T = Object.freeze({
  // extension -> plugin
  HELLO: 'hello',
  STATE_FULL: 'state.full',
  TABS_DELTA: 'tabs.delta',
  MEDIA_UPDATE: 'media.update',
  DOWNLOADS_UPDATE: 'downloads.update',
  IMG: 'img',
  PREVIEW_FRAME: 'preview.frame',
  EVENT: 'event',
  RESULT: 'result',
  // plugin -> extension
  WELCOME: 'welcome',
  CMD: 'cmd',
  RESYNC: 'resync',
  STREAMING: 'streaming',
  // relay -> extension (no `v`; the relay is not a protocol peer)
  RELAY_DOWN: 'relay.down',
  RELAY_UP: 'relay.up',
});

/** Error codes in `result.error.code`. */
export const ERR = Object.freeze({
  NO_PERMISSION: 'no_permission',
  NO_HOST_PERMISSION: 'no_host_permission',
  NOT_FOUND: 'not_found',
  GESTURE_REQUIRED: 'gesture_required',
  RATE_LIMITED: 'rate_limited',
  BUSY: 'busy',
  BAD_ARGS: 'bad_args',
  UNSUPPORTED: 'unsupported',
  PRIVACY_BLOCKED: 'privacy_blocked',
});

/** Privacy levels, least to most strict. */
export const LEVELS = Object.freeze(['full', 'domain', 'hidden']);

export const LIMITS = Object.freeze({
  outMaxBytes: 512 * 1024,      // any extension -> plugin message
  inMaxBytes: 64 * 1024,        // any plugin -> extension message
  deltaIntervalMs: 100,         // tabs/windows/groups/downloads coalescing: <= 10 Hz
  mediaIntervalMs: 250,         // per media key: <= 4 Hz, urgent changes go out on the next tick
  mediaUrgentPerSec: 20,        // ceiling on urgent media sends (hostile pages can toggle fast)
  downloadsPollMs: 1000,        // bytesReceived does not fire onChanged; poll while active
  cmdPerSec: 60,                // plugin commands overall
  title: 512, url: 2048, domain: 253, artist: 256, album: 256,
  chapters: 64, chapterTitle: 128, actions: 16, actionName: 32,
  downloadName: 260, groupTitle: 128, profileLabel: 48,
  favDefaultPx: 32, favMinPx: 16, favMaxPx: 64, favMaxBytes: 16 * 1024,
  artDefaultPx: 288, artMinPx: 64, artMaxPx: 288, artMaxBytes: 96 * 1024,
  previewMaxW: 360, previewMaxH: 180, previewMaxBytes: 40 * 1024, previewMaxFps: 2, previewTtlMs: 30_000,
  contentMsgPerSec: 40,         // per content-script port, beyond which messages are dropped
  contentCmdTimeoutMs: 1500,
  cmdBudgetMs: 1700,            // a media/page command's whole budget here (injection, port wait, page answer); the plugin waits 2 s
  portWaitMs: 300,              // how long to wait for a content script to open its port after asking it to
  focusWaitMs: 300,
  sessionRecentMax: 25,
});

/** Speed ladder (§5.1). One tick is one step. */
export const SPEED_LADDER = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]);
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;

/** Chrome's preset zoom ladder; factors are clamped to 0.25..5. */
export const ZOOM_LADDER = Object.freeze([0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]);
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;

export const GROUP_COLORS = Object.freeze(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);

/** Media Session actions the plugin may invoke through `media.action` (seeking goes through media.seek). */
export const MEDIA_ACTIONS = Object.freeze([
  'play', 'pause', 'stop', 'nexttrack', 'previoustrack', 'seekbackward', 'seekforward', 'skipad',
  'togglemicrophone', 'togglecamera', 'hangup', 'previousslide', 'nextslide', 'enterpictureinpicture',
  'voiceactivity',
]);
/** Actions a page may report as registered (`Media.actions`): the invokable ones plus seekto. */
export const REPORTED_ACTIONS = Object.freeze([...MEDIA_ACTIONS, 'seekto']);

/** Keys the plugin may press for the picture-in-picture gesture (`media.pip {via:"gesture", pipKey}`), default F24. */
export const PIP_KEYS = Object.freeze(['F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24']);
export const PIP_DEFAULT_KEY = 'F24';

/** "While streaming" choices: `full` = a streaming app does not change this browser's level. */
export const WHILE_STREAMING = Object.freeze(['domain', 'hidden', 'full']);

/** Connection status values the popup and options page render. */
export const STATUS = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',            // port open, waiting for welcome
  CONNECTED: 'connected',              // welcome received
  PLUGIN_DOWN: 'plugin_down',          // relay up, Prism Control not running (relay.down)
  HOST_MISSING: 'host_missing',        // "Specified native messaging host not found."
  HOST_FORBIDDEN: 'host_forbidden',    // "Access to the specified native messaging host is forbidden."
  HOST_ERROR: 'host_error',            // the host exited or failed to start
  PROTO_MISMATCH: 'proto_mismatch',    // welcome.proto !== 1
});
