# Prism Control browser protocol, v1

The single source of truth for the wire between the **Prism Control for Stream Deck** extension (Chrome, Edge) and the Prism Control `browser` module (C#). It implements the draft in `aaa-prism-play/research/browser.md` §9. The additions and clarifications are listed in §12. The extension code that implements it is in `src/background/` (see `connection.js`, `publisher.js`, `privacy.js`, `commands.js`).

All sample data is fictional.

## 0. Identity

| What | Value |
|---|---|
| Native messaging host name | `com.jeremyfhall.prismcontrol.browser` |
| Extension id (unpacked, from the manifest `key`) | **`ebbfhlgndibiinpfkhcacipfkoeokcgn`** (verified in Chrome 155 and Edge 155) |
| Caller origin passed to the relay (`argv[1]`) | `chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/` |
| Store ids (later) | The Chrome Web Store keeps this id if the listing uses the same key. Edge Add-ons assigns its own id, which must be added to `allowed_origins`. |

The host manifest written by `HostInstaller` (Chrome and Edge both read it; Edge reads only the first manifest it finds, so list every id):

```json
{
  "name": "com.jeremyfhall.prismcontrol.browser",
  "description": "Prism Control bridge for Stream Deck",
  "path": "prism-relay.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/"]
}
```

## 1. Transport and framing

- **Native messaging:** each frame is a 4-byte little-endian length, then that many bytes of UTF-8 JSON. The relay pumps frames verbatim between stdio and the named pipe (contract §2).
- **Size caps (enforced by the extension):**
  - extension → plugin: at most **512 KB** per frame. Bigger snapshots are split (§4.2).
  - plugin → extension: at most **64 KB** per frame. The extension drops bigger frames. If such a frame was a `cmd` with a valid `id`, it answers `bad_args` ("frame too large"). Chrome's own limit host→browser is 1 MB, which the relay enforces.
- **No pings.** The open native port keeps the extension's service worker alive. The plugin must not expect keep-alive traffic.
- **One connection per browser profile.** Each profile with the extension runs its own relay process, so it is a separate pipe session. Identify a session by `hello.profile.uid`.

## 2. Envelope

Every frame is a JSON object:

```json
{ "v": 1, "t": "tabs.delta", "seq": 1042, "at": 1792212345678, "data": { } }
```

| Field | Meaning |
|---|---|
| `v` | Protocol major version, always `1`. The extension ignores frames from the plugin with any other `v` (relay frames carry no `v`, §3.3). |
| `t` | Message type. Unknown types are ignored by both sides. |
| `seq` | Increases by 1 per frame sent, starting at 1 on each new native connection. The plugin may send its own `seq`; the extension ignores it. |
| `at` | Sender's clock, UTC epoch milliseconds. Both ends are on the same PC. |
| `data` | The payload. Unknown fields are ignored by both sides. |

**Commands** (plugin → extension) and **results** (extension → plugin):

```json
{ "v": 1, "t": "cmd", "id": 17, "op": "media.rate", "args": { "key": "812:0", "rate": 1.5 } }
{ "v": 1, "t": "result", "seq": 88, "at": 1792212345680, "id": 17, "ok": true, "data": { "rate": 1.5, "state": "playing" } }
{ "v": 1, "t": "result", "seq": 89, "at": 1792212345690, "id": 18, "ok": false, "error": { "code": "no_host_permission", "message": "site not granted; use perm.hostRequest" } }
```

- `id` is an integer ≥ 1, chosen by the plugin and unique per session. A `cmd` without a valid `id` is ignored and never answered.
- Every valid `cmd` gets **exactly one** `result`. Results can arrive out of order.
- `id`, `ok` and `error` sit at the envelope level. `data` is present only when `ok` is true.
- Error codes: §9.

## 3. Session lifecycle

### 3.1 Normal start

```
extension                         relay                          plugin
   | connectNative --------------> (Chrome starts relay)
   |                                 | connect pipe, send preamble ----> {t:"relay", v:1, token, origin, browserPid, browserExe, relayVersion}
   | hello ------------------------> | ---------------------------------> hello
   |                                 | <--------------------------------- welcome
   | <------------------------------ welcome
   | img (each image referenced below, once)
   | state.full
   | tabs.delta / media.update / downloads.update / img / event ... (as things change)
   | <------------------------------ cmd ... ; result ------------------>
```

- The extension sends `hello` as soon as its port opens. The relay may not have the pipe yet. It may drop frames that arrive while the pipe is down; see §3.3.
- **Until `welcome` arrives, the extension sends nothing but `hello`.** It retries `hello` after 5, 10 and 20 s, then every 30 s.
- **A `hello` on an established session means the extension restarted its session.** For example, its service worker restarted, or `relay.up` arrived. The plugin answers with a fresh `welcome` and treats what it holds for that profile as stale: it keeps showing it (re-filtered at the new `privacy`, so nothing hidden comes back) only until the new `state.full` replaces all of it, so keys don't go blank in between. The same applies when a lost profile reconnects within its 5 s grace.
- **A second `welcome` restarts the session on the extension side too.** The extension sends the images and a new `state.full`.
- If `welcome.v` or `welcome.data.proto` is not 1, the extension shows "Update needed" and sends nothing more.

### 3.2 Messages from the plugin besides `cmd`

| `t` | `data` | Effect |
|---|---|---|
| `welcome` | §5.1 | Starts the session. |
| `resync` | `{}` | The extension re-sends every image it references and a full `state.full`. Use it after the plugin's image cache dropped something, or on any doubt. To fetch only specific images, use the `img.get` command instead. |
| `streaming` | `{ "active": true, "app": "obs64.exe" }` | **New.** A streaming app runs (or stopped, with `active:false`). While it's active, the extension applies the user's "while streaming" level (default `domain`; `full` = "Don't change"). The plugin sends `active: true` only while OBS runs **and** the deck's own "auto streamer-safe" setting is on; turning that setting off while OBS runs sends `active: false`. Send it whenever that value changes; `welcome.streaming` carries the initial value. |

### 3.3 Relay frames (no `v`)

The relay is not a protocol peer, but it injects two frames toward the extension:

| `t` | When | Extension behavior |
|---|---|---|
| `relay.down` | The pipe to Prism Control is lost or can't be opened (also at start-up when Prism Control isn't running). | It ends the session and stops all traffic. The popup shows "Prism Control not running". It sends one `hello` at once, then retries every 30 s. |
| `relay.up` | **New.** The relay has (re)connected the pipe and sent its preamble. | It sends `hello` immediately, and the plugin answers `welcome`. **The relay sends this after every successful pipe (re)connect** (agreed with the lead and the Platform engineer). If it were ever missing, reconnection would still happen through the `hello` retries, only up to 30 s later. |

### 3.4 Ends

- **The browser closes, the profile closes, or the extension is disabled:** the native port closes. Chrome closes the relay's stdin, the relay exits, and the plugin sees the pipe close. It drops the session.
- **The relay dies** (crash, killed): the extension retries `connectNative` with a backoff of 1 s, doubling to a 30 s cap. The backoff resets once the host has sent any frame.
- **The host isn't installed** (`Specified native messaging host not found.`) or **forbids the id** (`Access ... is forbidden.`): the extension retries every 5 minutes, or at once when the user presses "Retry now". The next attempt time survives service-worker restarts.
- **The service worker restarts:** a new native connection opens, so it's a new relay process and a new session. The extension rebuilds its state from `tabs.query()` and friends, and asks open media pages to re-report. Verified in Chrome and Edge.

## 4. Extension → plugin messages

| `t` | When | `data` |
|---|---|---|
| `hello` | On connect, and as retries | §4.1 |
| `state.full` | After `welcome`, on `resync`, and **immediately** when the effective privacy level or a privacy list changes | §4.2 |
| `tabs.delta` | Coalesced, ≤ 10 Hz (at least 100 ms apart) | §4.3 |
| `media.update` | ≤ 4 Hz per media key. State changes (play/pause/ended, PiP, mic/camera, title, rate, mute, actions, new or removed entries) go out on the next tick, capped at 20 urgent sends/s | `{ "upsert": [Media partial], "remove": ["key", ...] }` |
| `downloads.update` | On `downloads.onChanged`, plus a 1 Hz poll while any download is active, coalesced ≤ 10 Hz | `{ "upsert": [Download partial], "remove": [id, ...] }` |
| `img` | Once per image per session, **before** the first frame that references it | §7 |
| `preview.frame` | ≤ 2 fps while subscribed (§6.9) | `{ "windowId", "tabId", "mime": "image/jpeg", "w", "h", "b64" }` |
| `event` | Discrete happenings | §4.4 |
| `result` | One per `cmd` | §2 |

### 4.1 `hello`

```json
{
  "proto": 1,
  "ext": { "id": "ebbfhlgndibiinpfkhcacipfkoeokcgn", "version": "0.1.0" },
  "browser": { "brand": "Chrome", "major": 155 },
  "profile": { "uid": "66d8deed2e50ff4364bf3dcafad75efa", "label": "Work" },
  "caps": {
    "tabs": true, "favicon": true, "downloads": false, "tabGroups": false, "sessions": false,
    "scripting": true, "allUrls": false, "hostAccessRequest": true, "split": true,
    "grantedOrigins": ["https://video.example/*"], "grantedCount": 1
  },
  "privacy": "full",
  "privacySettings": { "base": "full", "whileStreaming": "domain", "alwaysHidden": 2 }
}
```

- **The extension never sends `hello` before it has loaded the profile uid and the user's privacy settings** (the service worker's start-up reads them from storage first). The plugin ignores a `hello` without a valid `profile.uid`.
- **`browser.brand`** is one of `Chrome`, `Edge`, `Brave`, `Opera`, `Vivaldi`, `Chromium`, taken from `navigator.userAgentData`. The relay's parent exe is authoritative.
- **`profile.uid`** is random per browser profile (32 hex characters, kept in `storage.local`). It's stable across restarts, so use it to tell profiles and browsers apart. `label` is user-set in the options page, at most 48 characters, and may be empty.
- **`caps`** says which optional permissions are granted, and whether this browser has `permissions.addHostAccessRequest` (`hostAccessRequest`) and split view (`split`).
  - `grantedOrigins` is privacy-filtered: full patterns at `full`, registrable domains at `domain`, `[]` at `hidden`.
  - `grantedCount` is always the true count.
- **`privacy`** is the effective level (§8).
- **`privacySettings`** are the user's own choices in the extension: `base` (the "Streamer-safe" level), `whileStreaming` (`domain`, `hidden` or `full` = "Don't change") and `alwaysHidden`, the **count** of always-hidden domains (never the list). The plugin uses them for what it shows without the extension (the Windows media session "lite" tier while no browser is connected): it must be at least as strict as the user asked for in the browser.

### 4.2 `state.full`

```json
{
  "privacy": "full",
  "privacySettings": { "base": "full", "whileStreaming": "domain", "alwaysHidden": 2 },
  "windows": [Window], "tabs": [Tab], "groups": [Group], "media": [Media], "downloads": [Download],
  "activeByWindow": { "1": 11 },
  "focusedWindow": 1
}
```

- It **replaces everything** the plugin holds for this session.
- `privacySettings` is as in `hello` (§4.1). A `state.full` also goes out at once when one of them changes, so the plugin always holds the current choices.
- `focusedWindow` is `-1` when no browser window has focus.
- **Split snapshots:** if the snapshot would exceed the 512 KB cap, `state.full` carries `"more": true` and only the first tabs. The remaining tabs follow as `tabs.delta` frames whose `upsert` holds them; the last of these has `"more": false`. Treat the continuation as part of the snapshot.

### 4.3 `tabs.delta`

```json
{
  "upsert": [ { "id": 12, "title": "(4) Inbox", "unread": 4 } ],
  "remove": [ 13 ],
  "windows": { "upsert": [ { "id": 1, "focused": false } ], "remove": [] },
  "groups": { "upsert": [], "remove": [ 3 ] },
  "activeByWindow": { "1": 12 },
  "focusedWindow": -1
}
```

**Merge rules (the same for `media.update` keyed by `key`, and `downloads.update`):**

- `upsert` entries always carry the id field.
- An id the plugin doesn't know arrives **whole**.
- For known ids, only the **changed fields** are sent. Merge them field by field.
- A field explicitly set to `null` means "now empty". For example, a title disappears when privacy tightens; a `state.full` usually covers that case anyway.
- `remove` lists ids that are gone. A removed window's tabs are also listed in `remove`.
- `upsert` and `remove` are always present, possibly empty. `windows`, `groups`, `activeByWindow` and `focusedWindow` appear only when something in them changed. `activeByWindow` lists only the windows whose active tab changed; `-1` means "none".

### 4.4 `event`

| `kind` | Fields | Notes |
|---|---|---|
| `focusChanged` | `windowId` (−1: the browser lost focus) | Use it for the §3.1 focus fallback in browser.md. |
| `zoom` | `tabId`, `factor` | From `tabs.onZoomChange`. |
| `permissionAdded` / `permissionRemoved` | `caps` (as in hello) | Tabs' `access` fields follow in a `tabs.delta`. |
| `pipChanged` | `key` (`tab:frame`), `ok: true`, `code: null` | The gesture-key (F24 or the chosen `pipKey`) picture-in-picture succeeded (§10.4). |
| `gesture.needed` | `key`, `ok: false`, `code` (`gesture_required`, `expired`, `unsupported`, `busy`) | The gesture-key attempt failed. |
| `profile` | `profile: {uid, label}` | The user changed the label. |

## 5. Plugin → extension

### 5.1 `welcome`

```json
{
  "proto": 1,
  "plugin": { "version": "0.4.0" },
  "privacy": "full",
  "streaming": false,
  "want": { "tabs": true, "media": true, "downloads": true, "groups": true, "faviconPx": 32, "artMaxPx": 288 }
}
```

- **`privacy`** is the level the deck asks for, default `full`. The extension enforces the **stricter** of this, its own setting, and the streaming level (§8).
- **`want`** lets the plugin turn slices off; every flag defaults to `true`.
  - `faviconPx` is clamped to 16–64, default 32. Favicons arrive re-encoded to exactly that square.
  - `artMaxPx` is clamped to 64–288, default 288.
  - `previewFps` from the draft is ignored; use `preview.subscribe`.

### 5.2 `cmd`: §6. `resync` and `streaming`: §3.2.

## 6. Objects

### 6.1 Window

| Field | Type | Notes |
|---|---|---|
| `id` | int | `windows.Window.id` |
| `focused` | bool | |
| `state` | `normal` \| `minimized` \| `maximized` \| `fullscreen` \| `locked-fullscreen` | |
| `type` | `normal` \| `popup` \| `app` \| `panel` | Devtools windows are never sent. |
| `left`, `top`, `width`, `height` | int \| null | Screen pixels as Chrome reports them. Use them to match the HWND. |

### 6.2 Tab

| Field | Type | Notes |
|---|---|---|
| `id`, `win`, `idx` | int | Tab id (changes on every browser restart), window id, index in the window. |
| `active`, `pinned`, `audible`, `muted` | bool | `muted` is the tab mute (the speaker icon). |
| `title` | string ≤ 512 \| null | `null` unless the level is `full`. |
| `url` | string ≤ 2048 \| null | `null` unless the level is `full`. |
| `domain` | string ≤ 253 \| null | The registrable domain (eTLD+1), e.g. `example.co.uk` for `mail.example.co.uk`. **Not the host.** `null` at `hidden` and for non-web pages. |
| `host` | string ≤ 253 \| null | **New.** The page's full host name, lower case, no trailing dot (`app.chat.example`). `null` unless the level is `full` (like `url`), and `null` for non-web pages. Match sites on `host`; fall back to `domain` when it is `null`. |
| `unread` | int ≥ 1 \| −1 \| null | Parsed from the title: "(3) Inbox" → 3, a leading `•`/`*` → −1 (a dot). Kept at **every** level, **except for always-hidden sites**, which send `null` (a number from "Lab results (127)" is part of what the user hid). |
| `status` | `loading` \| `complete` \| `unloaded` | `unloaded` = discarded. |
| `discarded`, `frozen` | bool | Frozen/discarded tabs don't update titles or run media scripts. |
| `group` | int | Tab group id, **−1** for none. |
| `split` | int | Split-view id, **−1** for none. |
| `lastAccessed` | int \| null | Epoch ms. |
| `access` | `granted` \| `none` \| `blocked` | **New.** Whether media/page scripts can run here. Show **ENABLE** for `none` + `audible` (§10.3). `blocked` covers browser pages and the web stores. |
| `icon` | `fav:<16hex>` \| `glyph:globe` \| `glyph:tab` \| `glyph:browser` | A `fav:` image (sent as `img` first), or a glyph: `globe` = no favicon yet, `tab` = hidden by privacy, `browser` = an internal page. |
| `hidden` | `null` \| `domain` \| `all` | What privacy removed: `domain` = title and URL; `all` = also domain and favicon. |

### 6.3 Group (optional `tabGroups`)

`{ "id", "win", "color": "grey|blue|red|yellow|green|pink|purple|cyan|orange", "collapsed", "title", "hidden" }`. Group titles are user-chosen, so `title` is `null` unless the level is `full`.

### 6.4 Media

One entry per frame that has media: the frame's Media Session plus its primary element. Other elements that are playing audibly in the same frame get their own entries (rare).

| Field | Type | Notes |
|---|---|---|
| `key` | `"tabId:frameId"` or `"tabId:frameId:n"` | `n` ≥ 1 identifies an extra element in that frame. Keys are what media commands take. |
| `tabId`, `frameId` | int | `frameId` 0 = top frame. Same-origin and granted iframes report their own keys. |
| `kind` | `video` \| `audio` \| `session-only` | `session-only` = a Media Session without an element (meetings, Web Audio). |
| `state` | `playing` \| `paused` \| `none` | |
| `title`, `artist`, `album` | string \| null | From `navigator.mediaSession.metadata`. Privacy: §8. |
| `art` | `{ "url", "img", "type" }` \| null | `url` = an `https` artwork URL the **plugin fetches itself** (SSRF-guarded, browser.md §9.4); `img` = `art:<hash>` re-encoded by the extension (from `blob:`, `data:` or host-permitted `http:` sources). Exactly one of them is set. `type` is a mime hint. |
| `chapters` | `[{ "title", "startMs" }]` ≤ 64 | |
| `durationMs` | int \| null | `null` when unknown or live. |
| `live` | bool | True for duration `Infinity`, `MediaStream` sources, and MSE players reporting ≥ 7 days (2^30 s on some live sites). Show **LIVE** with no ring. |
| `positionMs`, `positionAt` | int \| null | Position at `positionAt` (epoch ms). **Extrapolate:** `positionMs + (now − positionAt) × rate` while `state = playing`, clamped to `durationMs`. The extension only resends when the drift exceeds 750 ms, or when state or rate changes. |
| `rate` | number | Playback rate. |
| `volume` | number 0..1 \| null | Element volume (per tab, not the OS mixer). |
| `elementMuted` | bool \| null | The element's own mute (separate from the tab mute). |
| `pip` | bool | This element is in picture-in-picture. |
| `actions` | string[] ≤ 16 | Media Session handlers the page registered: `play`, `pause`, `stop`, `seekto`, `seekbackward`, `seekforward`, `nexttrack`, `previoustrack`, `skipad`, `togglemicrophone`, `togglecamera`, `hangup`, `previousslide`, `nextslide`, `enterpictureinpicture`, `voiceactivity`. |
| `mic`, `camera` | bool \| null | From `setMicrophoneActive` / `setCameraActive`; `null` = the page never said. |
| `source` | `mediasession` \| `element` \| `mediasession+element` | |
| `domain` | string \| null | **New.** The tab's registrable domain, for "Playing on video.example". `null` at `hidden`. |
| `hidden` | `null` \| `domain` \| `all` | **New.** What privacy removed. |

### 6.5 Download (optional `downloads`)

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `state` | `in_progress` \| `interrupted` \| `complete` | |
| `name` | string \| null | The file name only, **never the folder**. At `domain` only the extension (`.zip`); at `hidden`, null. |
| `bytes`, `total` | int, int \| null | |
| `etaAt` | int \| null | Epoch ms. |
| `paused`, `canResume`, `exists` | bool | |
| `danger` | string | Chrome's `DangerType` (`safe`, `file`, `url`, `content`, `uncommon`, `host`, `unwanted`, `accepted`, …). |
| `error` | string \| null | Chrome's `InterruptReason`. |
| `icon` | `file:<16hex>` \| null | The OS file icon (32 px), at `full` only. |
| `hidden` | `null` \| `domain` \| `all` | |

The extension keeps every active download plus the 5 most recent. The absolute path is available only through `download.path` (§6.8).

## 7. Images

```json
{ "v": 1, "t": "img", "data": { "id": "fav:4c95b4c3d3d7a83e", "mime": "image/png", "w": 32, "h": 32, "b64": "iVBORw0K..." } }
```

- **Ids** are content hashes: SHA-1 of the bytes, truncated to 16 hex characters, with the prefix `fav:` (favicons), `art:` (artwork) or `file:` (download icons).
- **Each image travels once per session,** always before the first frame that references it. A new session (`welcome`) or a `resync` sends every referenced image again. The plugin keeps an LRU (8 MB suggested). For an evicted image, call `img.get {ids}` rather than a full `resync`.
- **Favicons:** PNG, exactly `faviconPx` square, ≤ 16 KB.
  - The source is Chrome's favicon database (`_favicon`, which works for discarded tabs).
  - It falls back to a `data:` favicon, or to fetching the page's favicon URL where host permission is held.
  - Upscaling is nearest-neighbor, because the deck smooths anyway.
  - The browser's default globe is detected and reported as `glyph:globe` instead.
- **Artwork:** JPEG (or PNG), ≤ `artMaxPx` on the long side, ≤ 96 KB.
- **Download icons:** PNG 32×32.
- **Live preview:** JPEG ≤ 360×180, ≤ 40 KB.
- Favicons and artwork are third-party content, shown as they are (lead decision). Never put real ones in fixtures.
- **Privacy:** an image is only ever sent while some visible object references it. At `hidden` no favicon, artwork or file icon is sent at all. `img.get` refuses ids that aren't currently referenced.

## 8. Privacy (streamer-safe), enforced in the extension

**Effective level** = the strictest of:

- the extension's own setting (options page: Off / Domain only / Hidden);
- the deck's level (`welcome.privacy`, `privacy.set`, `panic`);
- the "while streaming" level (Domain only, Hidden, or "Don't change" = `full`) while `streaming.active`.

The order is `full` < `domain` < `hidden`. **The plugin can raise the level but never lower it below the user's own setting.**

| Level | Tabs | Media | Downloads | Groups | Preview / paths |
|---|---|---|---|---|---|
| `full` | title, URL, host, domain, favicon | everything | file name | title | allowed |
| `domain` | domain + favicon; title, URL and host `null` | title/artist/album/art/chapters only for the user's "media sites" allow-list, else `null` (`domain` is kept) | extension only (`.zip`) | title `null` | `privacy_blocked` |
| `hidden` | `glyph:tab`, no domain; `unread` kept | state, progress, rate, volume, actions, mic/camera only | `null` (progress kept) | title `null` | `privacy_blocked` |

- **Always-hidden sites** (a user list in the options page) are `hidden` even at `full`, and their tabs send no `unread` either. Downloads from those sites can't be resolved with `download.path`. The list itself never leaves the browser; `privacySettings.alwaysHidden` carries only its length.
- **When the level changes,** the extension sends a new `state.full` at once, carrying the new `privacy`, without waiting for the 100 ms cadence. It does the same when a privacy list or a privacy choice (`privacySettings`) changes.
- **Revoked sites:** when the user removes a site's access, its open pages keep the old content script until they reload. The extension closes their ports at once, removes their media entries (`media.update` `remove`), refuses their reconnects and snapshots, and answers commands for them with `no_host_permission`. The check runs on every permission change, every snapshot, every port connect and every media or page command.
- **Preview frames** are checked against the window's real active tab (`tabs.query`) right before and right after `captureVisibleTab`: if the tab changed, is always-hidden, or the level is no longer `full`, the frame is dropped.
- **Command results that come from pages** carry only whitelisted numeric and enum fields. Errors from pages carry canned messages. A page can't smuggle a title through a result.
- **The plugin must still never log titles, URLs or paths** (browser.md §10). Log tab ids and hashed domains.
- The toolbar badge shows **SAFE** while the level is not `full`.
- `incognito: "not_allowed"`: private windows are never seen.

## 9. Error codes

| Code | Meaning |
|---|---|
| `no_permission` | An optional permission is missing (`downloads`, `tabGroups`, `sessions`). Send `perm.openOptions {section:"features"}`; the user grants it with a click. |
| `no_host_permission` | The site isn't granted (media, scroll), or the preview lacks the all-sites grant. Use `perm.hostRequest`. |
| `not_found` | No such tab, window, download or media frame (it navigated away or was discarded). |
| `gesture_required` | The browser needs a user gesture (PiP without `via`). |
| `rate_limited` | Over the limits in §11. |
| `busy` | Chrome refused for now (a tab is being dragged), or a page didn't answer within 1.5 s (frozen or busy). |
| `bad_args` | Validation failed, or the frame is too large. |
| `unsupported` | Unknown op, an API missing in this browser, a page without that handler, a live stream for seek or speed, PiP disabled by the site. |
| `privacy_blocked` | Not allowed at the current level (paths, preview). |

## 10. Commands

The args are JSON in `args`. "Media state" in the result means a subset of `{ state, positionMs, durationMs, live, rate, volume, muted, pip }`.

### 10.1 Tabs and windows (no extra permission)

| `op` | Args | Result |
|---|---|---|
| `tab.focus` | `tabId`, `raise?` (default true) | `{ tabId, windowId, bounds:{left,top,width,height}, state, focused }`. `focused` is read after waiting ≤ 300 ms for `windows.onFocusChanged`. **If `false`, Windows refused the foreground:** raise the HWND yourself (contract §1.1). |
| `tab.close` | `tabId` | `{ closed: true, undo: "session.restore" }` |
| `tab.create` | `url?` (http/https only), `windowId?`, `index?` (0–10000; past the end = last), `splitWith?` (tab id) | `{ tabId, windowId, splitViewId? }`. `index` lets an undo without the `sessions` permission put a closed tab back where it was. |
| `tab.reload` | `tabId`, `bypassCache?` | `{}` |
| `tab.back`, `tab.forward` | `tabId` | `{}` |
| `tab.mute` | `tabId`, `muted?` (omitted = toggle) | `{ muted }` |
| `tab.pin` | `tabId`, `pinned?` (omitted = toggle) | `{ pinned }` |
| `tab.move` | `tabId`, `index` (−1 = end), `windowId?` | `{ index, windowId }` |
| `tab.discardable` | `tabId`, `autoDiscardable` | `{ autoDiscardable }`. Use it for watched tabs. |
| `window.focus` | `windowId` | Like `tab.focus`, without `tabId`. |
| `window.state` | `windowId`, `state` (`normal`/`minimized`/`maximized`/`fullscreen`) | `{ windowId, state }` |

### 10.2 Sessions, groups and split view

| `op` | Args | Result | Needs |
|---|---|---|---|
| `session.restore` | `sessionId?` (omitted = the most recent) | `{ kind:"tab", tabId, windowId }` or `{ kind:"window", windowId }` | `sessions` |
| `session.recent` | `max?` 1–25 (default 10) | `{ items:[{ sessionId, kind, lastModified, tabCount, title, url, domain }] }`, privacy-filtered like tabs | `sessions` |
| `group.update` | `groupId`, `collapsed?`, `title?`, `color?`, `toggle?` (flip collapsed) | `{ groupId, collapsed, color }` | `tabGroups` |
| `tab.group` | `tabIds` (1–64), `groupId?` | `{ groupId }` | — |
| `tab.ungroup` | `tabIds` | `{}` | — |
| `split.create` | `tabIds: [a, b]` | `{ splitViewId }`. The extension moves `b` next to `a` first. Both must share window, pinned state and group (else `bad_args`). | `caps.split` (Chrome 155 and Edge 155 both have it) |
| `split.remove` | `splitViewId` | `{}` | `caps.split` |

### 10.3 Page and permissions

| `op` | Args | Result |
|---|---|---|
| `page.scroll` | `tabId?` (default: the active tab of the focused window), `dy` (±20000 px), `dx?`, `smooth?` (default true) | `{ scrolled, atTop, atBottom }`. It needs host access (`no_host_permission` otherwise; fall back to keystrokes). It works on **any granted page, with or without media**: if the page's content script has no port open yet, the extension asks it to open one (`prism.reconnect {open:true}` to the top frame), injecting it first if needed, all within the command budget (§11). `not_found` means the script could not start in time (fall back to keystrokes too). **Accumulate dial ticks** and send the sum; don't drop ticks. |
| `page.zoom` | `tabId` and one of `factor` (0.25–5), `step` (±n along Chrome's ladder 25…500 %), `reset: true` | `{ factor }`. Chrome zooms per origin by default. |
| `perm.hostRequest` | `tabId` | `{ via }`: `toolbar` (Chrome 133+ / Edge: the request shows in the extensions menu; the user clicks once), `options` (the options page opened with a **Grant** button, which is the gesture), `granted` (already), or `none` (`reason:"blocked"`). |
| `perm.openOptions` | `section?` (`general`, `grant`, `sites`, `features`, `privacy`, `profile`) | `{}` |

**The ENABLE flow:**

1. A tab is `audible`, its `access` is `none`, and it has no media entry. The deck shows **ENABLE**.
2. The user presses it. Send `perm.hostRequest {tabId}`.
3. The user accepts in the browser. `event permissionAdded` arrives, then the tab's `access` becomes `granted`, then a media entry appears within about a second. The extension injects into open tabs of that site at once.

### 10.4 Media (host access to the frame's site)

Every media op takes `key` (§6.4).

| `op` | Extra args | Notes |
|---|---|---|
| `media.toggle`, `media.play`, `media.pause` | — | The page's Media Session `play`/`pause` handler if registered (primary entry), else the element. A blocked `play()` → `gesture_required`. |
| `media.seek` | `positionMs` or `deltaMs` | Clamped to [0, duration]. The site's `seekto` handler is used if registered, else `currentTime`. Live → `unsupported`. |
| `media.rate` | `rate` (clamped 0.25–4) or `step` (±n on 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4) | The rate is **held**: it's re-applied when the site resets it on the next item (YouTube resets it per video), and released if the user changes the speed in the site's own menu. Live → `unsupported`. |
| `media.volume` | `volume` (0–1) or `delta` | Applies to the frame's playing elements; it unmutes the element when raised. It's held the same way as the rate. |
| `media.mute` | `muted?` (omitted = toggle) | Element mute. The tab mute is `tab.mute`. |
| `media.action` | `action` (any invokable action in §6.4 except `seekto`) | Calls the page's handler. `unsupported` if it isn't registered. This covers next/previous, skip ad, **meeting mic/camera/hang-up**, and slides. |
| `media.pip` | `mode`: `toggle` (default) / `enter` / `exit`; `via?`: `gesture` / `auto`; `pipKey?`: `F13`…`F24` (default `F24`, only with `via:"gesture"`) | See below. `key` is the media key as for every media op; the keyboard key is `pipKey`. Any other `pipKey` → `bad_args`. |

**Picture-in-picture.** Chrome allows it only with transient user activation, an existing PiP window, or a Media Session token (browser.md §3.6).

- **No `via`:** a direct attempt. It works only if this document already has a PiP window; otherwise `gesture_required`. `exit` never needs a gesture.
- **`via: "gesture"` (recommended).** It arms a one-shot listener for `pipKey` and returns `{ armed: true, key: "F24", expiresInMs: 3000 }`, where `key` is the keyboard key it armed (the `pipKey` sent, else `F24`). Then Prism Control:
  1. calls `GrantForegroundAsync(browserPid)` and sends `tab.focus {tabId, raise:true}`;
  2. sends a real press of that key (F24 = VK `0x87`; F13–F24 = VK `0x7C`–`0x87`; down and up) with `SendInput` within 3 s, while the browser is in the foreground. The trusted keydown grants activation, and the extension swallows the key. Other keys, and untrusted events, are ignored. **A global key press can also reach other apps' F13–F24 hotkeys (OBS, Discord, AutoHotkey):** the plugin checks that no app registered the key (`RegisterHotKey`) before pressing it, and lets the user pick another one;
  3. waits ≤ 2 s for `event pipChanged` (success; the media entry also turns `pip: true`) or `event gesture.needed` (`code` says why).

  The keydown must reach the frame that holds the video: the top frame for most sites. This is verified with CDP-injected F24 and F21 in Chrome and Edge (headless). The real `SendInput` path is a lab step (§13).
- **`via: "auto"`** (auto-PiP, Chrome 134+). If the site has no `enterpictureinpicture` handler, the extension registers one, then switches the tab's window to the previously active tab. Chrome then opens PiP on its own, if its auto-PiP conditions hold (browser.md §3.6). The result is `{ auto: true, siteHandler, switchedTo }`.

### 10.5 Downloads (optional `downloads`)

| `op` | Args | Result |
|---|---|---|
| `download.show` | `id` | `{}` (Explorer may open behind; use the foreground trick) |
| `download.pause`, `download.resume`, `download.cancel` | `id` | `{}` |
| `download.path` | `id` | `{ id, path, state, exists, danger, mime }`. **Level `full` only** (else `privacy_blocked`), and never for always-hidden sites. **Prism Control opens the file itself:** only if `state = complete`, `exists`, and `danger` ∈ {`safe`, `accepted`}; with the Macros double-press rule for executables; through ShellExecute (Mark-of-the-Web applies). |

### 10.6 Preview, privacy, panic, images

| `op` | Args | Result |
|---|---|---|
| `preview.subscribe` | `windowId?` (default: the focused window), `fps` 0–2 (0 = stop), `w` 16–360, `h` 16–180 | `{ fps, w, h, expiresInMs: 30000 }`. **Renew every ≤ 20 s;** the subscription ends after 30 s otherwise. It needs the all-sites grant (`no_host_permission`) and level `full` (`privacy_blocked`). It stops at once when the level tightens. |
| `privacy.set` | `level` | `{ level, deck }`: the effective level and the deck level now in force. |
| `panic` | — | First it forces the deck level to `hidden` and re-sends `state.full`; this frame goes out **before** the result. Then it mutes every audible or playing tab and minimizes every browser window. Result: `{ privacy: "hidden", muted, minimized, failed }`. `privacy.set` lifts it. |
| `img.get` | `ids` (≤ 32) | `{ sent, missing }`. It re-sends referenced images only. |

## 11. Rates and timing

| What | Limit |
|---|---|
| Commands, overall | **60/s** (token bucket, burst 60). Excess → `rate_limited`. |
| Per op | `tab.close` 4/s (burst 8) · `tab.create`, `session.restore`, `session.recent`, `download.path`, `download.cancel`, `preview.subscribe` 2/s (burst 4) · `tab.move` 10/s · `window.state` 4/s · `img.get` 4/s · `panic` 1/s (burst 2) · `perm.*` 1 per 2 s (burst 2). |
| Plugin side (recommended) | Coalesce dial streams (seek, zoom, volume, rate) latest-wins at 20 Hz. Accumulate scroll ticks. |
| `tabs.delta`, `downloads.update` | ≥ 100 ms apart (≤ 10 Hz), changed fields only. |
| `media.update` | ≤ 4 Hz per key; urgent changes on the next tick (≤ 20/s overall). |
| Downloads poll | 1 Hz while any download is active and not paused. |
| Content-script commands | A 1.5 s timeout → `busy`. |
| Media and page commands, end to end | **≤ 1.7 s** in the extension, including any wait for the content script's port and any injection; the page gets what is left (at least 200 ms, at most 1.5 s). The plugin's own timeout is 2 s, measured from before it writes the command, so it always gets the extension's answer. |
| Hello retries | 5, 10, 20, then 30 s until `welcome`. |
| Reconnect backoff | 1 s ×2 up to 30 s; 5 min while the host is missing or forbidden. |

## 12. Changes from the browser.md §9 draft

All of these are additive or clarifying; nothing in the draft was removed.

1. **`relay.up`** (relay → extension) after each pipe (re)connect; agreed, and the relay implements it. The extension then sends `hello`. It also retries `hello` on its own, as a safety net.
2. **`streaming {active, app?}`** (plugin → extension) and **`welcome.streaming`**: the OBS auto-switch. The level applied while streaming is the user's choice in the extension (default `domain`).
3. **Session rules:** nothing but `hello` before `welcome`; a repeated `hello` restarts the session; a repeated `welcome` restarts it on the extension side.
4. **`state.full`** adds `privacy`, `activeByWindow`, `focusedWindow`, and `more` (split snapshots). **`tabs.delta`** adds `focusedWindow` and `more`. Merge rules are spelled out (§4.3).
5. **Tab:** new `access`; `group` and `split` use −1 for none; the glyph names are fixed (`glyph:globe|tab|browser`).
6. **Media:** new `domain` and `hidden`, plus `art.type`. `live` also covers `MediaStream` and huge MSE durations. `actions` also reports `seekto`.
7. **Group** and **Download:** add `hidden`; Download adds `exists`, and `icon` is `file:<hash>`.
8. **`hello`:** adds `caps.hostAccessRequest`, `caps.split`, `caps.grantedCount` and `privacySettings`. `grantedOrigins` is privacy-filtered.
9. **Commands:**
   - new `img.get`;
   - `media.rate {step}`, `media.volume {delta}`, `group.update {toggle}`, `page.scroll {dx}`;
   - `tab.mute`, `tab.pin` and `media.mute` toggle when the value is omitted;
   - `tab.focus` returns `tabId` and `focused`;
   - `preview.subscribe` has a 30 s TTL, and `preview.frame` adds `tabId`;
   - `perm.hostRequest` returns `via`;
   - `panic` returns counts;
   - live streams refuse seek and speed.
10. **Events:** adds `permissionRemoved` and `profile`. `pipChanged` and `gesture.needed` have fixed shapes.
11. **Privacy hardening:** page results are whitelisted and page errors canned; `download.path` is refused for always-hidden sites; `img.get` refuses unreferenced ids.
12. **The extension id** is fixed: `ebbfhlgndibiinpfkhcacipfkoeokcgn`.

Added after the browser-stack review (2026-10-17, `aaa-prism-play/review-browser/REPORT.md`); all additive, the plugin and the extension change together:

13. **Tab `host`** (§6.2): the full host name at `full` only, so Site Watch matches sub-domain sites (`mail.example` under `example`). `domain` stays the registrable domain.
14. **`privacySettings.alwaysHidden`** (a count) in `hello`, and **`privacySettings` in every `state.full`** (§4.1, §4.2), for the plugin's fallbacks without the extension.
15. **`whileStreaming: "full"`** ("Don't change"), and the plugin sends `streaming {active:true}` only while OBS runs and its own auto streamer-safe is on (§3.2).
16. **`media.pip {pipKey}`** (F13–F24, default F24) for the gesture key (§10.4); the result's `key` names the armed key.
17. **`tab.create {index}`** (§10.1).
18. **`page.scroll` on pages without media:** the content script opens its port on request (§10.3).
19. **Privacy hardening:** always-hidden sites send no `unread`; revoked sites stop reporting and refuse commands; preview frames are re-checked around the capture (§8).
20. **Timing:** a media or page command answers within 1.7 s in the extension (§11).
21. **Start-up:** no `hello` before the profile uid and the privacy settings are loaded; the plugin ignores a `hello` without a valid `profile.uid` (§4.1).
22. **Plugin side, no wire change:**
    - a repeated `hello` keeps the held state (stale, re-filtered) until the new `state.full` (§3.1);
    - the zoom dial sends `page.zoom {step}`, never a `factor` computed from a zoom it doesn't know;
    - `preview.frame` is kept only when its `tabId` is the window's active tab and that tab has `hidden: null`;
    - the Windows media session (lite tier) is used only while no profile is connected or reconnecting, filtered at the strictest of the deck's level and every profile's `privacySettings`;
    - up to 10,000 tabs and 32 profiles per plugin.

## 13. What is verified, and how

- **Unit tests** (`node --test tests/unit/`): fake `chrome.*` and a fake native port. They cover the store, coalescing and caps, the privacy filter (with a control test), command dispatch, rate limits, backoff, handshake, restarts and downloads, plus one regression test per review finding fixed in the extension (`review-fixes.test.mjs`).
- **Real browser** (`node tests/e2e/run.mjs --scratch <dir> --browser both`): Chrome 155 and Edge 155 in throwaway profiles, the extension loaded with CDP `Extensions.loadUnpacked`, local fixture pages, and the native port **simulated inside the real service worker**.
- **Not verified yet** (each needs the user's OK, because it writes HKCU keys or drives real input):
  - the real relay round trip through `connectNative`;
  - `SendInput` F24 (or the chosen F13–F24 key) → PiP;
  - the F22 foreground trick;
  - live YouTube, Twitch and SoundCloud;
  - WebP inside SVG on the device.
