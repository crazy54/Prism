# Prism Control for Stream Deck: browser extension

A Chromium MV3 extension for Chrome and Edge. It is the browser half of Prism Control's `browser` module: live tabs on keys, media in any tab (art, progress, scrub, 0.25–4× speed, per-tab volume, picture-in-picture), page dials, downloads, meeting keys and a streamer-safe mode.

- It talks to Prism Control through the native messaging host **`com.jeremyfhall.prismcontrol.browser`** (`prism-relay.exe` → named pipe).
- The wire format is in **[PROTOCOL.md](PROTOCOL.md)**.
- It's plain modern JavaScript: ES modules, no bundler, no runtime dependencies.

## Extension id

**`ebbfhlgndibiinpfkhcacipfkoeokcgn`**

- The id is fixed by the RSA-2048 public key in `manifest.json` → `key`: SHA-256 of the DER SubjectPublicKeyInfo, first 16 bytes, hex digits mapped 0–f → a–p.
- It's verified in Chrome 155 and Edge 155: it stays the same from any folder.
- The native host manifest needs `"allowed_origins": ["chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/"]`.
- The private key is **not in the repo.** It lives in `aaa-prism-play/browser-ext/keys/prism-control-extension.pem`, and is needed only to sign a `.crx`. The id depends only on the public key.
- The **Edge Add-ons** store assigns a different id; add it to `allowed_origins` when we publish there.
- A **Chrome Web Store** listing gets its own key, so its id differs too, unless the manifest `key` is replaced by the store's public key ("Package → View public key") before release. Either way, list every id in `allowed_origins`.

## Install (sideload, today)

1. In Stream Deck, place any Browser key. In its settings, press **Connect browsers**. This copies the relay and writes the HKCU host keys, with your consent and an undo.
2. **Chrome:** open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick this `extension` folder (or the copy Prism Control placed in `%APPDATA%\Prism\control\modules\browser\extension\`).
   **Edge:** the same, from `edge://extensions` (Developer mode is in the left pane).
3. Check that the card shows the id above. Pin the toolbar icon if you like. The popup should say **Connected**.
4. Play a video. If the media key shows **ENABLE**, press it, then click the request in the browser's extensions menu, or the **Grant** button in the options page that opens.
5. Optional features (Downloads, Tab groups, Reopen closed tabs, Live preview) are granted with one click each in **Options → Optional features**.

**Updating:** once you have pressed **Connect browsers**, Prism Control refreshes its copy of the relay and of this extension (the folder you loaded) every time it starts, so a plugin update brings the new files along. The Browser key's settings then say when the extension running in a browser is older than the packaged one: click **Reload** on the extension card. Open tabs pick up the new scripts automatically. (If you loaded the extension from another folder, update that folder yourself.)

**Ship only these files:** `manifest.json`, `sw.js`, `media-main.js`, `media-isolated.js`, `popup.html`, `options.html`, `src/`, `img/`. `tests/`, `tools/`, `package.json` and the `.md` files are dev-only.

## What it asks for

| Permission | Why | Install warning |
|---|---|---|
| `tabs` | Titles, URLs, audible/muted state for tab keys | "Read your browsing history" |
| `favicon` | Favicons from Chrome's cache (`_favicon`), even for sleeping tabs | none extra |
| `nativeMessaging` | The connection to Prism Control | "Communicate with cooperating native applications" |
| `storage`, `alarms` | Settings; the 30 s reconnect/reconcile tick | none |
| `scripting` | Registers the media scripts on sites you allow | none |
| optional `downloads`, `tabGroups`, `sessions` | Download ring; group keys; reopen closed tab | asked on first use |
| optional host access, per site | Media details and controls, page scroll. Requested with `permissions.addHostAccessRequest` (Chrome 133+, also present in Edge 155), or a Grant button in the options page as the fallback | asked per site |
| optional `<all_urls>` | Only for the live tab preview: Chrome's `captureVisibleTab` requires all-sites access. Requested only by an explicit click in Options, next to text explaining why (approved by the lead) | asked on click |

`incognito` is `not_allowed`: private windows are never seen. Mute, unmute and "is playing" work on every site without host access.

## Layout

```
manifest.json            MV3 manifest (key -> fixed id; minimum Chrome 134)
sw.js                    service worker entry (registers every listener synchronously, then init)
media-main.js            MAIN world, document_start: hooks navigator.mediaSession + HTMLMediaElement
media-isolated.js        ISOLATED world: relay to the worker, art re-encoding, F24 (or F13-F24) -> PiP, scrolling
popup.html / options.html
src/shared/              protocol constants, URL/domain/match-pattern helpers, unread parsing, utils
src/background/
  app.js                 wiring: chrome events -> store -> publisher; commands; UI status
  connection.js          connectNative, hello/welcome, relay.down/up, reconnect backoff
  store.js               raw state (windows, tabs, groups, media, downloads); never on the wire
  privacy.js             streamer-safe filter: the only code that builds wire objects
  publisher.js           state.full / coalesced deltas (<= 10 Hz) / media (<= 4 Hz per key) / images once
  diff.js                field-level diffs, media position tolerance
  commands.js            command handlers + dispatcher (validation, rate limits, error mapping)
  ratelimit.js           token buckets (60/s overall + per-op)
  media.js               content-script ports, sanitizing page data, media command routing
  grants.js              host grants, content-script registration, addHostAccessRequest + fallback
  images.js              favicons, artwork, file icons: hash ids, size caps, OffscreenCanvas
  downloads.js           downloads + 1 Hz progress poll
  preview.js             captureVisibleTab preview frames (<= 2 fps, renewable subscription)
  settings.js            options (privacy, lists, profile label) and the per-profile uid
src/ui/                  popup.js, options.js, common.js, ui.css (the Refraction look)
img/                     icon.svg / icon-small.svg (sources) and 16/32/48/128 PNGs (tools/render-icons.mjs)
tests/unit/              node --test suites (fake chrome.* + fake native port)
tests/e2e/               real-browser tests: CDP-over-pipe launcher, fixture server and pages
```

## Robustness notes

- **Service-worker restarts:**
  - every listener is registered on the first turn;
  - state is rebuilt from `windows.getAll` / `tabs.query` / `tabGroups.query` / `downloads.search`;
  - media pages are pinged (`prism.reconnect`) and re-report;
  - the reconnect backoff lives in `storage.session`.

  The 30 s alarm reconnects and reconciles. Verified in Chrome and Edge by stopping the worker through CDP.
- **Extension reload or update:** the already-open pages keep orphaned copies of the scripts. The new isolated script detects the dead one (`chrome.runtime.id` gone) and takes over. The MAIN hook is versioned, so it isn't installed twice. Verified: commands reach the page exactly once afterwards.
- **Discarded and frozen tabs:**
  - discarded tabs drop their media entries;
  - commands to frozen pages time out after 1.5 s with `busy`;
  - `tab.discardable` keeps watched tabs loaded.
- **Several windows and profiles:**
  - per-window active tabs and the focused window are tracked;
  - each profile is its own connection, with a random `profile.uid`;
  - the user names profiles in Options (`profile.label`).
- **Hostile pages:**
  - MAIN-world data is capped and validated;
  - each port is limited to 40 messages/s;
  - `javascript:` and raw `data:` artwork URLs are refused;
  - page strings never reach the plugin through results or errors.

## Per-site notes

The fixture pages under `tests/e2e/pages/` reproduce each pattern below, and those are verified in Chrome and Edge. Behavior on the live sites is from research and is marked: **[M]** = likely, needs a lab check; **[L]** = unverified.

**YouTube** (`www.youtube.com`, `music.youtube.com`):

- One `<video>` is reused across SPA navigations and ads. Media Session metadata (title, channel, https thumbnails that the plugin fetches) and play/pause/next/previous handlers are registered [M].
- **Speed resets per video** to the user's YouTube setting. The extension holds a custom rate and re-applies it on the next video; using YouTube's own speed menu releases the hold. YouTube's menu won't show rates above 2× [M].
- The player may restore its own saved volume on the next video; the held volume is re-applied the same way [M].
- Ads use the same element, so holds apply to ads too. `skipad` is usually not registered, so it returns `unsupported` [L].
- Embeds on other sites are cross-origin iframes (`youtube.com`, `youtube-nocookie.com`). They need those origins granted, and they report their own frame keys.

**Twitch:**

- Live streams are MSE with `duration` = `Infinity` or 2^30 s, so they report `live: true`, and **seek and speed are refused**. The player itself nudges `playbackRate` to catch up on latency, so a held rate would fight it [M].
- VODs behave like normal video.
- Channel switches are SPA navigations, so the element can be replaced while the key stays `tab:0`.
- Media Session metadata may be absent [L]; then the deck shows the domain.

**SoundCloud:**

- The player is `new Audio()`, **never attached to the DOM**. The `play()` hook finds it, but only once the hook is in place. On a tab that was already open when access was granted, media appears at the next play or track change [M].
- Streams are HLS/MSE, so the site's `play`/`pause`/`next`/`previous` handlers are preferred [M].
- The site persists its own volume per track; the held volume re-applies [M].

**Generic `<video>` / `<audio>`:**

- The element is controlled directly.
- Same-origin iframes report their own keys.
- Closed shadow roots are found through the `attachShadow` hook, but only for roots created after it. Tabs opened before the grant see open roots only.

**Web meetings** (Meet and similar): mic, camera and hang-up keys work only if the site registers `togglemicrophone`/`togglecamera`/`hangup` and calls `setMicrophoneActive`/`setCameraActive` [M].

**DRM and anti-tamper players** (streaming services, web music apps):

- Direct `currentTime` writes may break playback, so site handlers are used first.
- The wrapped prototypes keep their `name` and `length`, but `Function.prototype.toString` reveals them, so detection-heavy sites may refuse to play [L].

**Background tabs** throttle timers, so position reports thin out; the plugin extrapolates.

**Live preview** captures the active tab only. It needs `<all_urls>`, is limited to 2 captures/s by Chrome, fails on minimized windows, and is off whenever streamer-safe is on.

## Edge differences

- **Verified in Edge 155 (temp profile):**
  - the same id;
  - `Extensions.loadUnpacked`;
  - `_favicon` from the worker (its default globe differs from Chrome's; it's detected at runtime);
  - brand `Microsoft Edge`;
  - `permissions.addHostAccessRequest`, `tabs.createSplit` and `tabs.unsplit` all exist;
  - every media, PiP, privacy and restart check passes.

  Unlike branded Chrome 137+, **Edge still honors `--load-extension`**.
- **Not verified:**
  - Edge's UI for the host access request;
  - how `createSplit` interacts with Edge's own split screen;
  - how aggressive sleeping tabs are (expect more `discarded`/`frozen`);
  - auto-PiP parity.

## Tests

```sh
node --test tests/unit/                                    # 85 tests, fake chrome.* + fake native port
node tests/e2e/run.mjs --scratch <scratch-dir> --browser both   # 71 checks in Chrome 155, 70 in Edge 155
node tools/render-icons.mjs <scratch-dir>                  # regenerate img/*.png from the SVGs
```

The browser test:

- copies the extension into `<scratch-dir>`, adding one required host permission (`http://127.0.0.1/*`) so the media scripts register without a permission prompt;
- starts a fixture server on a free port;
- launches Chrome and/or Edge with a throwaway `--user-data-dir`, `--remote-debugging-pipe` and `--enable-unsafe-extension-debugging`, and loads the extension with CDP `Extensions.loadUnpacked` (branded Chrome ignores `--load-extension`, which the test checks);
- simulates the native port **inside the real service worker**.

Every browser and server it starts is closed, and every profile deleted.

**Not tested here** (each needs the user's OK):

- the real `connectNative` → relay → pipe round trip (it needs the HKCU host key);
- real `SendInput` F24 for PiP (CDP-injected F24 and F21 work);
- the F22 foreground trick;
- live YouTube, Twitch and SoundCloud;
- WebP artwork on the device.

The tests already confirm that, with no host key, Chrome reports "Specified native messaging host not found." and the popup shows **Host not installed**.
