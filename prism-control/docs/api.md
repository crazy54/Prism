# Prism Control data API, v1

**Status:** v1, 2026-10-16. Implemented in `src/PrismControl/DataApi/` (server) and `src/PrismControl.Core/Data/` (payload types and provider registry).
**Audience:** the sibling plugin `com.jeremyfhall.prism` (session prism-27), and anything else on this PC that wants Prism Control's live data.
**Copies:** `prism-control/docs/api.md` (source of truth) and `aaa-prism-ds/prism-control/API.md`. Both files are identical.

Prism Control (`com.jeremyfhall.prismcontrol`) runs a **read-only HTTP/1.1 API on the loopback interface**. It serves system stats, now playing (including album art), audio levels, an audio spectrum, audio devices and microphone state. The API never changes anything on the PC.

Contents:

1. Discovery: `control.json`
2. Auth handshake and transport rules
3. Response envelope, caching and errors
4. Endpoints: `/v1`, `/v1/health`, `/v1/system`, `/v1/now-playing`, `/v1/now-playing/art`, `/v1/audio/levels`, `/v1/audio/devices`, `/v1/mic`, `/v1/cooling`, `/v1/audio/spectrum`
5. Units and conventions
6. Update cadence and recommended polling, and in-process readers (6.1)
7. Availability today, and demo mode
8. Versioning policy
9. A minimal Node client
10. Changelog

---

## 1. Discovery: `control.json`

| | |
|---|---|
| Path | `%APPDATA%\Prism\control\control.json` (per Windows user). For example `C:\Users\<you>\AppData\Roaming\Prism\control\control.json`. |
| Override | The environment variable `PRISM_CONTROL_DIR` replaces the folder `%APPDATA%\Prism\control`. Tests and the fake host use it. |
| Written | At every plugin start, **after** the server is listening. The write is atomic: a temp file is renamed over the old one. |
| Rotated | The port and the token are new on every start. |
| Deleted | On a clean exit, by the instance that wrote it. An instance never deletes a file that describes a newer instance. |
| Stale | After a crash or a kill, the file can describe a dead process. The Stream Deck app's job object kills plugins without a graceful shutdown when the app exits. See "Stale files" below. |

**Contents** (example values):

```json
{
  "v": 1,
  "api": 1,
  "plugin": "com.jeremyfhall.prismcontrol",
  "version": "0.1.0.0",
  "port": 56436,
  "token": "0f3c…64 lowercase hex characters…9a1e",
  "pid": 89304,
  "baseUrl": "http://127.0.0.1:56436",
  "startedAt": "2026-10-16T19:22:43.513Z"
}
```

| Field | Type | Meaning |
|---|---|---|
| `v` | int | Format of this file. It is `1` and only changes if fields are removed or renamed. |
| `api` | int | The API major version served. It is `1`, so the endpoints live under `/v1/`. |
| `plugin` | string | Always `com.jeremyfhall.prismcontrol`. |
| `version` | string | The plugin version, in four parts. |
| `port` | int | The TCP port on `127.0.0.1`. It is random on every start. |
| `token` | string | The bearer token: 32 random bytes as 64 lowercase hex characters. **Secret:** never log it, display it, or put it in an exported file. |
| `pid` | int | The plugin process id. |
| `baseUrl` | string | `http://127.0.0.1:<port>`. Use it as given. |
| `startedAt` | string | UTC start time, ISO 8601 with milliseconds. |

**Stale files.** Treat these as "Prism Control is not running right now, retry later": connection refused, `401` with a token you just read, or a `pid` that no longer exists. Re-read the file on every reconnect attempt, because it changes when the plugin restarts. A backoff of 1–5 s is plenty.

---

## 2. Auth handshake and transport rules

1. Read `control.json`.
2. Send every request to `baseUrl` with `Authorization: Bearer <token>`.
3. On `401` or a connection error, re-read `control.json` (the plugin may have restarted) and retry with backoff.

Every request must satisfy these rules. The server checks them in this order and rejects the request at the first failure.

| Rule | If violated |
|---|---|
| No request body (`Content-Length` > 0 or `Transfer-Encoding` present) | `400 body_not_allowed`, connection closed |
| `Host` header is **exactly** `127.0.0.1:<port>`. Use the IP, not `localhost` (this is the DNS-rebinding defense; `localhost` can also cost about 2 s on this PC) | `421 bad_host`, connection closed |
| **No `Origin` header.** Browsers always send one on cross-site requests; Node's `fetch` does not | `403 origin_refused`, connection closed |
| Method is `GET` or `HEAD` | `405 method_not_allowed` with `Allow: GET, HEAD` |
| `Authorization: Bearer <token>`, compared in constant time | `401 unauthorized` with `WWW-Authenticate: Bearer` |
| At most 200 requests/s in total (burst 400) | `429 rate_limited` with `Retry-After: 1` and `error.data.retryAfterMs` |

More rules:

- **Loopback only.** The server binds `127.0.0.1` and never `0.0.0.0` or `::`. There is no remote access and no tunnel option.
- **No CORS.** No `Access-Control-*` headers are ever sent. A CORS preflight (`OPTIONS` with `Origin`) gets `403 origin_refused`. Web pages cannot use this API.
- **HTTP/1.1 keep-alive** is supported, up to 1000 requests per connection with a 10 s idle timeout. HTTP/1.0 works and closes after each response. Request headers are capped at 8 KB (`431`). At most 32 connections are open at once (`503 busy` beyond that).
- Node's built-in `fetch` (undici) sends `sec-fetch-mode: cors` but no `Origin`, so it is accepted. The E2E tests verify this with a real `node` process.

---

## 3. Response envelope, caching and errors

### 3.1 Envelope (all data endpoints except `/v1/now-playing/art`)

```json
{
  "api": 1,
  "path": "/v1/system",
  "seq": 7,
  "updatedAt": "2026-10-16T19:22:49.547Z",
  "ageMs": 212,
  "source": "systeminfo",
  "demo": false,
  "data": { "…endpoint payload…": "" }
}
```

| Field | Type | Meaning |
|---|---|---|
| `api` | int | `1` |
| `path` | string | The endpoint path, without the query string. |
| `seq` | int | Increases each time the payload changes. It restarts at 1 when the plugin restarts. |
| `updatedAt` | string | When this snapshot was produced (UTC, ms). |
| `ageMs` | int | `now - updatedAt` when the response was written. Use it to detect stalls. |
| `source` | string or null | The module that provides the data: `systeminfo`, `audio`, `spotify`, `smtc` or `demo`. |
| `demo` | bool | `true` when the data is fictional demo data (§7). |
| `data` | object | The payload, described per endpoint below. |

`/v1` and `/v1/health` return their object directly, without the envelope.

### 3.2 Caching: ETag and 304

- Every `200` from a data endpoint carries an `ETag`. Send it back as `If-None-Match`. If nothing changed, the answer is **`304 Not Modified` with no body**, which makes polling cheap.
- ETags are opaque, quoted strings, and they change on every plugin restart. On `/v1/now-playing` the ETag also changes when the art changes.
- `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` are sent on every response.

### 3.3 Errors

The body of every error is:

```json
{ "error": { "code": "unavailable", "message": "No data yet.", "data": { "retryAfterMs": 1000 } } }
```

`data` is optional.

| Status | `code` | Meaning | What the client does |
|---|---|---|---|
| 400 | `bad_request` | Malformed request line or headers | Fix the client |
| 400 | `body_not_allowed` | The request had a body | Send no body |
| 401 | `unauthorized` | Missing or wrong token | Re-read `control.json`, then retry |
| 403 | `origin_refused` | An `Origin` header was present | Do not call from a browser context |
| 404 | `not_found` | Unknown path | Check `GET /v1` for the list |
| 404 | `no_art` | `/v1/now-playing/art` when there is no image | Draw your own placeholder |
| 405 | `method_not_allowed` | Not `GET` or `HEAD` | Only read |
| 421 | `bad_host` | `Host` is not `127.0.0.1:<port>` | Use `baseUrl` exactly |
| 429 | `rate_limited` | Over 200 requests/s | Wait `retryAfterMs` |
| 431 | `headers_too_large` | Request headers over 8 KB | Fix the client |
| 503 | `unavailable` | No provider for this endpoint is running, or it has not produced data yet | Retry after `retryAfterMs` (1000). Show "no data" in the meantime |
| 503 | `busy` | More than 32 open connections | Reuse one keep-alive connection |

---

## 4. Endpoints

| Path | Content | Cadence (when available) |
|---|---|---|
| `GET /v1` | Index: endpoints, availability, source, cadence | On request |
| `GET /v1/health` | Plugin and Stream Deck status, update budget, provider freshness | On request |
| `GET /v1/system` | CPU, GPU, RAM, disks, network | 1 Hz |
| `GET /v1/now-playing` | Track, state, position, shuffle/repeat/like, art metadata (`?art=dataUrl` inlines the image) | On change |
| `GET /v1/now-playing/art` | The album art bytes (`image/jpeg` or `image/png`) | On track change |
| `GET /v1/audio/levels` | Output and input peak meters | ≈30 Hz, **only while polled** |
| `GET /v1/audio/spectrum` | 24-band spectrum (EQ bars) of the default output, peak, RMS, silence | ≈30 Hz, **only while polled** |
| `GET /v1/audio/devices` | Output and input endpoints, defaults, volume, mute | On change (cached ≤ 0.5 s) |
| `GET /v1/mic` | Default mic: mute, volume, peak, in use | Mute on change; peak 10 Hz while polled |
| `GET /v1/cooling` | Fans, AIO pump, coolant and CPU package temperature (iCUE, LibreHardwareMonitor fallback) | 1 Hz, **only while polled or shown** |

Every field listed below is **always present** in v1 payloads. A field that is unknown or unsupported on this PC is `null` (or `[]` for lists). Clients must handle `null` everywhere it is allowed.

### 4.1 `GET /v1`

```json
{
  "api": 1, "plugin": "com.jeremyfhall.prismcontrol", "version": "0.1.0.0",
  "endpoints": [
    { "path": "/v1/health", "available": true },
    { "path": "/v1/system", "available": true, "source": "systeminfo", "demo": false, "cadenceMs": 1000, "contentType": "application/json" },
    { "path": "/v1/now-playing", "available": true, "source": "spotify", "demo": false, "cadenceMs": 0, "contentType": "application/json" },
    { "path": "/v1/now-playing/art", "available": true, "source": "spotify", "demo": false, "cadenceMs": 0, "contentType": "image/*" },
    { "path": "/v1/audio/levels", "available": false, "source": "audio", "demo": false, "cadenceMs": 33, "contentType": "application/json" },
    { "path": "/v1/audio/spectrum", "available": false, "source": "audio", "demo": false, "cadenceMs": 33, "contentType": "application/json" },
    { "path": "/v1/audio/devices", "available": true, "source": "audio", "demo": false, "cadenceMs": 500, "contentType": "application/json" },
    { "path": "/v1/mic", "available": true, "source": "audio", "demo": false, "cadenceMs": 0, "contentType": "application/json" }
  ]
}
```

- `available` means data can be served right now.
- `cadenceMs: 0` means the endpoint is event-driven (it updates on change).
- For a pull provider, `cadenceMs` is its cache time.
- `/v1/audio/levels` and `/v1/audio/spectrum` show `available: false` until someone polls them, because metering and analysis only run on demand.

### 4.2 `GET /v1/health`

```json
{
  "status": "ok",
  "api": 1, "plugin": "com.jeremyfhall.prismcontrol", "version": "0.1.0.0",
  "pid": 89304, "uptimeSec": 6.3,
  "safeMode": false, "macrosDryRun": false,
  "streamDeck": {
    "connected": true, "appVersion": "7.6.0.23012",
    "devices": [
      { "id": "f00dbabe…", "name": "Galleon 100 SD", "type": 12, "columns": 3, "rows": 4 },
      { "id": "f00dbabe…", "name": "Stream Deck +", "type": 7, "columns": 4, "rows": 2 }
    ]
  },
  "updates": { "budgetPerSec": 60, "sentLastSec": 51, "sent": 251, "coalesced": 58, "skippedUnchanged": 22, "pendingContexts": 2, "avgLatencyMs": 34.6 },
  "actions": { "registered": 6, "instances": 28 },
  "providers": {
    "/v1/system": { "available": true, "source": "systeminfo", "demo": false, "seq": 7, "ageMs": 77, "cadenceMs": 1000, "demanded": false }
  }
}
```

| Field | Meaning |
|---|---|
| `status` | `ok` when connected to the Stream Deck app. `degraded` while it is reconnecting (the data endpoints keep working). |
| `safeMode` | `true` when the plugin runs with `PRISM_CONTROL_SAFE_MODE=1` (the fake host and E2E tests set it): module writes are no-ops or fakes, so volumes, devices, EQ, playback and fans are never changed. Real installs report `false`. |
| `macrosDryRun` | `true` when Macros sends no input and launches nothing (forced on by safe mode). |
| `streamDeck.devices[].type` | Stream Deck DeviceType: 0 Stream Deck, 1 Mini, 2 XL, 3 Mobile, 7 Stream Deck +, 9 Neo, 11 Virtual, 12 Galleon 100 SD, 13 Stream Deck + XL, 14 MCP Deck. |
| `updates` | Prism Control's own key/dial update scheduler: its budget (default 60/s), what it actually sent in the last second, and the totals. The Prism plugin can read this to see the share of the app's ~230–300 updates/s that Prism Control is using. |
| `providers[path]` | Freshness of each endpoint. `demanded` is `true` while some client polled within the last 5 s. |

### 4.3 `GET /v1/system`

Recommended poll: **1 Hz** with `If-None-Match`.

```json
{
  "api": 1, "path": "/v1/system", "seq": 42, "updatedAt": "2026-10-16T19:22:49.547Z", "ageMs": 212, "source": "systeminfo", "demo": false,
  "data": {
    "cpu": { "name": "Example CPU 16-Core", "usagePct": 23.5, "perCorePct": [12.0, 40.5], "clockMhz": 4200, "tempC": 61.9, "tempSource": "icue", "cores": 16, "threads": 32 },
    "gpus": [
      { "index": 0, "name": "Example GPU 24GB", "vendor": "nvidia", "usagePct": 41, "tempC": 62, "powerW": 180.5, "powerLimitW": 450,
        "vramUsedMiB": 8123, "vramTotalMiB": 24564, "clockMhz": 2520, "memClockMhz": 10501, "fanPct": 35 }
    ],
    "memory": { "usedMiB": 20480, "totalMiB": 65536, "usagePct": 31.3, "commitUsedMiB": 24000, "commitLimitMiB": 75000 },
    "disks": [ { "name": "C:", "label": "System", "usedGiB": 512, "totalGiB": 1863, "usagePct": 27.5, "readBps": 1200000, "writeBps": 350000, "activePct": 3 } ],
    "network": { "rxBps": 1500000, "txBps": 120000, "adapters": [ { "name": "Ethernet", "rxBps": 1500000, "txBps": 120000, "linkMbps": 1000, "up": true } ] },
    "uptimeSec": 253734
  }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `cpu` | object or null | Null if CPU stats are not available yet. |
| `cpu.usagePct` | number or null | 0–100, total over all logical processors. |
| `cpu.perCorePct` | number[] or null | 0–100 per logical processor. **Null unless a per-core view is visible** on the deck (it costs an extra PDH array read). |
| `cpu.clockMhz` | number or null | MHz. |
| `cpu.tempC` | number or null | °C. Windows has no non-admin CPU temperature source, so this comes from an external provider: LibreHardwareMonitor web server, then HWiNFO shared memory, then Corsair iCUE (CPU package, through the Cooling module). Null when none runs. Never faked, and never the iGPU sensor. |
| `cpu.tempSource` | string or null | Where `tempC` came from: `lhm`, `hwinfo` or `icue` (an open set; tolerate others). Null when `tempC` is null. |
| `cpu.cores`, `cpu.threads` | int or null | |
| `gpus[]` | array | Empty if there are no GPU stats. `index` is 0-based. `vendor` is `nvidia`, `amd`, `intel` or `other`. Integrated GPUs are included (read through D3DKMT); their `powerW` and `fanPct` are null. |
| `gpus[].usagePct`, `fanPct` | number or null | 0–100. |
| `gpus[].tempC` | number or null | °C. |
| `gpus[].powerW`, `powerLimitW` | number or null | Watts. |
| `gpus[].vramUsedMiB`, `vramTotalMiB` | number or null | MiB (1 MiB = 1,048,576 bytes). |
| `gpus[].clockMhz`, `memClockMhz` | number or null | MHz. |
| `memory.usedMiB`, `totalMiB` | number or null | MiB of physical RAM. |
| `memory.usagePct` | number or null | 0–100. |
| `memory.commitUsedMiB`, `commitLimitMiB` | number or null | MiB of commit charge. |
| `disks[]` | array | One entry per fixed volume. `name` is like `C:`. |
| `disks[].usedGiB`, `totalGiB` | number or null | GiB. |
| `disks[].readBps`, `writeBps` | number or null | **Bytes** per second. |
| `disks[].activePct` | number or null | 0–100, disk busy time. |
| `network.rxBps`, `txBps` | number or null | **Bytes** per second (not bits), summed over **hardware** adapters that are up (virtual switches and VPN adapters would double-count). |
| `network.adapters[]` | array | `name`, `rxBps`, `txBps`, `linkMbps` (link speed in **megabits** per second, or null), `up` (bool). |
| `uptimeSec` | number or null | System uptime in seconds. |

### 4.4 `GET /v1/now-playing`

Recommended poll: **1 Hz** with `If-None-Match`. Between polls, extrapolate the position while `state` is `playing`: `positionMs + (now - positionAt)`, capped at `durationMs`.

Query: **`?art=dataUrl`** adds `data.art.dataUrl` (the image as a `data:` URL). Without it, `dataUrl` is `null`. Fetch the bytes from `/v1/now-playing/art` only when `art.etag` changes.

```json
{
  "api": 1, "path": "/v1/now-playing", "seq": 7, "updatedAt": "2026-10-16T19:22:49.516Z", "ageMs": 402, "source": "spotify", "demo": false,
  "data": {
    "source": "spotify",
    "app": "Spotify",
    "state": "playing",
    "track": {
      "title": "Example Song",
      "artists": ["The Example Ensemble"],
      "album": "Demo Album",
      "durationMs": 215000,
      "uri": "spotify:track:0exampletrack000000000",
      "url": "https://open.spotify.com/track/0exampletrack000000000"
    },
    "positionMs": 5985,
    "positionAt": "2026-10-16T19:22:49.516Z",
    "shuffle": false,
    "repeat": "off",
    "liked": true,
    "volumePct": 42,
    "contextName": "Demo Playlist",
    "art": { "url": "/v1/now-playing/art", "etag": "\"c5b87d9817d5e24b\"", "mime": "image/jpeg", "width": 300, "height": 300, "dataUrl": null }
  }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `source` | string | `spotify` (Web API, any device), `smtc` (the Windows media session: local players, no login), or `demo`. Since 2026-10-18 the module follows the session that is playing (setting `spotify.media.follow`, default `spotifyFirst`: Spotify while it plays, else the most recently playing app), so `smtc` with a non-Spotify `app` (e.g. `Chrome`, YouTube in a tab) is a normal value. Spotify-only fields (`liked`, `contextName`, `volumePct`) are then null. |
| `app` | string or null | Player display name. |
| `state` | string | `playing`, `paused`, `stopped`, or `none` (nothing is loaded; `track` is null). |
| `track.title` | string | Empty (`""`) when streamer-safe mode hides another app's track (title, artist, album and art are withheld); Spotify's own track stays visible. |
| `track.artists` | string[] | In order. |
| `track.album` | string or null | |
| `track.durationMs` | int or null | Milliseconds. |
| `track.uri` | string or null | `spotify:track:…` from the Web API. Null for SMTC. |
| `track.url` | string or null | A link back to the item. Spotify's terms require one near album art. |
| `positionMs` | int or null | Milliseconds at `positionAt`. |
| `positionAt` | string or null | UTC, ms. |
| `shuffle`, `liked` | bool or null | Null if the source does not know (SMTC has no "liked"). |
| `repeat` | string or null | `off`, `context` or `track`. |
| `volumePct` | number or null | 0–100, the player volume (Spotify Connect device), **not** the Windows mixer. |
| `contextName` | string or null | The playlist or album name being played. |
| `art` | object or null | Null when there is no image. Its fields always describe what `/v1/now-playing/art` serves right now. `etag` is the exact ETag header value **including the quotes**. `width`/`height` are pixels (null if unknown). |

**Album art rules (Spotify Developer Terms, binding on every client):** show the image exactly as served: whole, uncropped, unmasked (no rounded corners or circles), not tinted, and with nothing drawn over it. Resizing is fine. Keep a link back to the track (`track.url`). Cache art only in memory, and only briefly.

### 4.5 `GET /v1/now-playing/art`

- `200` with the raw image bytes. `Content-Type` is `image/jpeg` or `image/png`, as the source provided it (Spotify serves 300×300 JPEG; SMTC thumbnails are usually PNG). An `ETag` is included.
- `304` for `If-None-Match` with the current ETag.
- `404 no_art` when nothing is playing, or the item has no image.
- `HEAD` is supported.

### 4.6 `GET /v1/audio/levels`

Demand-driven. Metering starts on the first request and stops 5 s after the last one. The first request after an idle period waits up to 250 ms for the first frame. If that passes, it may still answer `503 unavailable`; retry. While a level meter is on screen, poll at up to **30 Hz** (every 33 ms) and reuse one keep-alive connection. Stop polling when the meter is hidden.

```json
{
  "api": 1, "path": "/v1/audio/levels", "seq": 4, "updatedAt": "2026-10-16T19:22:50.200Z", "ageMs": 6, "source": "audio", "demo": false,
  "data": {
    "output": { "deviceId": "{0.0.0.00000000}.{…}", "deviceName": "Speakers (Example Audio)", "peak": 0.337, "peakDb": -9.4, "channels": [0.06, 0.337] },
    "input": { "deviceId": "{0.0.1.00000000}.{…}", "deviceName": "Microphone (Example USB)", "peak": 0.094, "peakDb": -20.6, "channels": [0.094] },
    "intervalMs": 33
  }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `output`, `input` | object or null | The default render and capture endpoints (console role). Null if there is no such device. |
| `deviceId` | string or null | The Windows endpoint id. It matches `/v1/audio/devices`. |
| `peak` | number | Linear 0..1, the peak over the last interval. |
| `peakDb` | number or null | dBFS of `peak` (≤ 0). Null when silent. |
| `channels` | number[] or null | Linear 0..1 per channel (L, R, …). |
| `intervalMs` | int | The metering interval. |

For a frequency spectrum (EQ bars) of the default output, see `/v1/audio/spectrum` (§4.10).

### 4.7 `GET /v1/audio/devices`

Recommended poll: every **2–5 s**, or after a user action, with `If-None-Match`.

```json
{
  "api": 1, "path": "/v1/audio/devices", "seq": 1, "updatedAt": "2026-10-16T19:22:43.531Z", "ageMs": 6842, "source": "audio", "demo": false,
  "data": {
    "output": {
      "defaultId": "demo-out-1", "defaultCommunicationsId": "demo-out-1",
      "devices": [
        { "id": "demo-out-1", "name": "Speakers (Example Audio)", "isDefault": true, "isDefaultCommunications": true, "volumePct": 42, "muted": false, "state": "active" },
        { "id": "demo-out-2", "name": "Headphones (Example USB)", "isDefault": false, "isDefaultCommunications": false, "volumePct": 60, "muted": false, "state": "active" }
      ]
    },
    "input": {
      "defaultId": "demo-in-1", "defaultCommunicationsId": "demo-in-1",
      "devices": [ { "id": "demo-in-1", "name": "Microphone (Example USB)", "isDefault": true, "isDefaultCommunications": true, "volumePct": 80, "muted": false, "state": "active" } ]
    }
  }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `output` / `input` | object | Render and capture endpoints. |
| `defaultId` | string or null | The default device for the console/multimedia role. |
| `defaultCommunicationsId` | string or null | The default device for the communications role. |
| `devices[].id` | string | The Windows endpoint id. Stable across restarts. |
| `devices[].name` | string | Friendly name. |
| `devices[].volumePct` | number or null | 0–100, the endpoint master volume (scalar). |
| `devices[].muted` | bool or null | |
| `devices[].state` | string | `active`, `disabled`, `unplugged` or `notpresent`. v1 lists active devices. |

### 4.8 `GET /v1/mic`

Recommended poll: **2–4 Hz** for a mute indicator. Mute changes are published immediately. `peak` is metered at 10 Hz only while the endpoint is being polled; otherwise it is `null`.

```json
{
  "api": 1, "path": "/v1/mic", "seq": 8, "updatedAt": "2026-10-16T19:22:50.495Z", "ageMs": 28, "source": "audio", "demo": false,
  "data": { "deviceId": "demo-in-1", "name": "Microphone (Example USB)", "muted": false, "volumePct": 80, "peak": null, "inUse": false }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `deviceId`, `name` | string or null | The default capture device (console role). Null if there is none. |
| `muted` | bool | Endpoint mute. |
| `volumePct` | number or null | 0–100. |
| `peak` | number or null | Linear 0..1 (null unless metering is running). |
| `inUse` | bool or null | Whether any app is capturing from the mic. Null if unknown. |

### 4.9 `GET /v1/cooling`

Fans, AIO pump, coolant and CPU package temperature, read-only from Corsair **iCUE** (its local sensor pipes) with **LibreHardwareMonitor**'s web server as the fallback and as an optional CPU-temperature source. The envelope's `source` is `cooling`. Recommended poll: **1 Hz** with `If-None-Match`.

**Demand-driven.** Nothing is sampled while nobody looks. The first request starts sampling: it waits up to 250 ms for the first sample and otherwise answers `503 unavailable`; the first samples may say `status: "connecting"` until iCUE answers (about 0.1 s). Sampling stops 15 s after the last request and the last visible cooling key or dial. Values are sampled at 1 Hz; iCUE itself refreshes fans and the pump about once a second and the CPU package about every 1.6 s.

```json
{
  "api": 1, "path": "/v1/cooling", "seq": 31, "updatedAt": "2026-10-16T19:22:49.547Z", "ageMs": 212, "source": "cooling", "demo": false,
  "data": {
    "status": "ok",
    "statusText": "iCUE connected · 21 sensors",
    "sampledAt": "2026-10-16T19:22:49.547Z",
    "cpu": { "tempC": 62.75, "source": "icue", "sensorId": "icue-3f9a1c2b7d", "name": "CPU package" },
    "coolant": { "tempC": 39.8, "source": "icue", "sensorId": "icue-8b20e4d119", "name": "TITAN 360 LCD" },
    "groups": [
      { "group": "radiator", "count": 3, "avgRpm": 1455.7, "minRpm": 1451, "maxRpm": 1460, "sensorIds": ["icue-0c41d2aa90", "icue-51e7b9c3f2", "icue-a9d00e6b14"] },
      { "group": "case", "count": 0, "avgRpm": null, "minRpm": null, "maxRpm": null, "sensorIds": [] },
      { "group": "unassigned", "count": 9, "avgRpm": 1620.4, "minRpm": 1453, "maxRpm": 2360, "sensorIds": ["…"] },
      { "group": "allFans", "count": 12, "avgRpm": 1579.2, "minRpm": 1451, "maxRpm": 2360, "sensorIds": ["…"] },
      { "group": "pump", "count": 1, "avgRpm": 2383, "minRpm": 2383, "maxRpm": 2383, "sensorIds": ["icue-77c3a5e021"] },
      { "group": "gpu", "count": 2, "avgRpm": 842, "minRpm": 0, "maxRpm": 1684, "sensorIds": ["…"] }
    ],
    "sensors": [
      { "id": "icue-0c41d2aa90", "kind": "fan", "role": "radiator", "roleSource": "user", "name": "Rad top", "originalName": "iCUE LINK RX RGB #1: Fan",
        "customName": "Rad top", "device": "iCUE LINK System Hub", "source": "icue", "rpm": 1451, "pct": null, "tempC": null, "connected": true,
        "updatedAt": "2026-10-16T19:22:49.390Z" },
      { "id": "icue-77c3a5e021", "kind": "pump", "role": "pump", "roleSource": "auto", "name": "TITAN 360 LCD", "originalName": "iCUE LINK TITAN 360 LCD: Pump",
        "customName": null, "device": "iCUE LINK System Hub", "source": "icue", "rpm": 2383, "pct": null, "tempC": null, "connected": true,
        "updatedAt": "2026-10-16T19:22:49.391Z" }
    ],
    "providers": [
      { "name": "icue", "state": "connected", "detail": "iCUE connected (sensor provider)", "sensorCount": 21 },
      { "name": "lhm", "state": "standby", "detail": "Standby (iCUE provides fans and CPU temperature)", "sensorCount": 0 }
    ]
  }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `status` | string | `ok` (fans/pump and a CPU temperature, or CPU temperature turned off), `partial` (some data, e.g. no CPU temperature), `connecting`, `unavailable` (no source delivers anything), `idle` (not sampling). |
| `statusText` | string | Human-readable: `iCUE connected · 21 sensors`, `iCUE not running · LibreHardwareMonitor web server off`, `… · CPU via LHM`. |
| `sampledAt` | string | When this sample was taken (UTC, ms). |
| `cpu` | object or null | The CPU package temperature chosen by the user's "CPU temperature" setting: `auto` (iCUE's CPU package sensor, else LHM's `Core (Tctl/Tdie)` / `CPU Package`), `icue`, `lhm` or `off`. Null when there is none. **Never faked.** |
| `coolant` | object or null | The AIO coolant (liquid) temperature. Null when no cooler reports one. |
| `cpu.tempC`, `coolant.tempC` | number or null | °C (iCUE set to °F is converted). |
| `cpu.source`, `coolant.source` | string | `icue` or `lhm`. Label the value with it. |
| `cpu.sensorId`, `coolant.sensorId`, `.name` | string | The sensor in `sensors[]` it came from, and its display name. |
| `groups[]` | array | Always six entries, in this order: `radiator` (CPU radiator / cooler fans), `case`, `unassigned` (fans whose placement is unknown), `allFans` (radiator + case + unassigned; never GPU or ignored), `pump`, `gpu`. |
| `groups[].count` | int | Members that currently have a value. |
| `groups[].avgRpm`, `minRpm`, `maxRpm` | number or null | RPM over the members; null when `count` is 0. |
| `groups[].sensorIds` | string[] | The members' ids. |
| `sensors[]` | array | Every cooling sensor, ordered: CPU, coolant, pumps, radiator fans, case fans, unassigned fans, GPU fans, air probes. Only fans, pumps, coolant, CPU package and fan air probes are listed (no voltages, loads or board temperatures). |
| `sensors[].id` | string | Stable across restarts. `icue-` + 10 hex characters (a hash of device name, sensor name and type: **no serial numbers, no iCUE runtime ids**), or `lhm/…` (LibreHardwareMonitor's sensor path, e.g. `lhm/lpc/nct6701d/0/fan/6`). An iCUE LINK sensor keeps its id whichever iCUE pipe is used. Renaming a device in iCUE changes its id. |
| `sensors[].kind` | string | `fan`, `pump`, `coolant`, `cpu`, `air` (the temperature probe on an iCUE LINK QX fan). |
| `sensors[].role` | string | `radiator`, `case`, `pump`, `gpu`, `unassigned` or `ignore`. iCUE LINK fans all report the same hub, so their placement cannot be inferred: they stay `unassigned` until the user assigns them in a Cooling property inspector. |
| `sensors[].roleSource` | string | `auto` (classified from device and sensor names) or `user`. |
| `sensors[].name` | string | The user's name if set, else a compact source name (`iCUE LINK RX RGB #1: Fan` → `RX RGB #1`). |
| `sensors[].originalName`, `customName`, `device` | string / string or null / string | As the source reports them; `customName` is null unless the user renamed it. |
| `sensors[].source` | string | `icue` or `lhm`. LHM's fans and pump appear only while iCUE delivers none (fallback); its CPU temperature can appear alongside iCUE. |
| `sensors[].rpm` | number or null | Fans and pumps; null for temperatures or when not connected. |
| `sensors[].pct` | number or null | Fan duty 0–100 when the source knows it (LHM "Control" sensors). iCUE does not expose it, so it is null for iCUE fans. |
| `sensors[].tempC` | number or null | Temperatures (°C); null for fans and pumps. |
| `sensors[].connected` | bool | False when the source has no reading. An LHM motherboard fan header that has not spun since sampling started counts as not connected (LHM cannot tell "unplugged" from "stopped"). |
| `sensors[].updatedAt` | string or null | When the source last updated this sensor (UTC, ms). |
| `providers[]` | array | `{ name: "icue" \| "lhm", state, detail, sensorCount }`. `state` is `off`, `standby` (LHM while iCUE has everything), `connecting`, `connected`, `notRunning`, `error` or `disabled` (turned off by the user). |

**Read-only.** Prism Control only calls iCUE's sensor getters (`getAllSensorIds`, `getSensorValue/Units/Name/DeviceName/Type/Kind`, `sensorIsConnected`; `GetSensors`/`GetSensor` on the fallback pipe). It never sets, activates or releases anything, and never changes fans, pumps, lighting or profiles.

### 4.10 `GET /v1/audio/spectrum`

A live **24-band spectrum** (EQ bars) of what the default output is playing, from loopback analysis. The envelope's `source` is `audio`.

**Demand-driven.** Nothing is captured while nobody looks.
- The first request starts loopback capture of the default output. It waits up to 250 ms for the first frame and may still answer `503 unavailable`; retry.
- While demanded, a frame is analyzed and published every ~33 ms (≈30 Hz).
- 5 s after the last request, capture stops, every capture object is released, and the endpoint answers `503` again until the next request.
- While a spectrum is on screen, poll at up to **30 Hz** with `If-None-Match` on one keep-alive connection. Stop polling when it is hidden.

```json
{
  "api": 1, "path": "/v1/audio/spectrum", "seq": 212, "updatedAt": "2026-10-18T12:00:01.033Z", "ageMs": 9, "source": "audio", "demo": false,
  "data": {
    "deviceId": "{0.0.0.00000000}.{…}",
    "deviceName": "Speakers (Example Audio)",
    "bands": [0.612, 0.724, 0.803, 0.771, 0.694, 0.642, 0.583, 0.551, 0.574, 0.522, 0.491, 0.468, 0.452, 0.421, 0.403, 0.384, 0.362, 0.331, 0.307, 0.282, 0.241, 0.193, 0.121, 0.052],
    "bandHz": [40, 51.9, 67.3, 87.4, 113.4, 147.1, 190.9, 247.7, 321.5, 417.1, 541.2, 702.3, 911.3, 1182.5, 1534.3, 1990.9, 2583.4, 3352.1, 4349.7, 5644, 7323.5, 9502.9, 12330.7, 16000],
    "peak": 0.5124, "rms": 0.1371, "silent": false, "sampleRate": 48000
  }
}
```

| Field | Type | Unit / values |
|---|---|---|
| `deviceId` | string or null | The default render endpoint (console role) being analyzed. It matches `/v1/audio/devices` `output.defaultId`. Null when there is no output device or Core Audio is unavailable. |
| `deviceName` | string or null | Its friendly name. |
| `bands` | number[] | Always 24 band levels, **low to high**, 0–1 on a dB scale: −60 dBFS and below = 0, 0 dBFS = 1, linear in dB between (0.5 = −30 dBFS). Rounded to 3 decimals. Smoothed with a fast attack (10 ms time constant) and a **300 ms release** time constant: a bar falls 63% of the way in 300 ms, and to 0 in about 2 s. |
| `bandHz` | number[] | Band centers in Hz, in the same order: log-spaced from 40 Hz to 16 kHz (each ×1.2976, ~0.38 octave), rounded to 0.1 Hz. Constant, so cache it. |
| `peak` | number | Linear 0–1: the sample peak of the last frame (~33 ms) over every channel. Unsmoothed. Rounded to 4 decimals. |
| `rms` | number | Linear 0–1: the RMS of the last frame over every channel. Unsmoothed. |
| `silent` | bool | Nothing audible is playing: every band is below 0.01 and the last frame peaked below −60 dBFS (0.001). It turns `true` at once when nothing was playing, and about 1.5 s after the sound stops (once the bars have fallen). |
| `sampleRate` | int or null | The output's mix rate in Hz, e.g. `48000`. Null while no capture stream is open: no device, or the stream failed to open (capture retries with backoff). |

**How the bands are computed:**
1. Loopback audio is what the endpoint plays (the Windows mix). It is mixed to mono: the sum of the channels ÷ min(channels, 2), so stereo is (L+R)/2 and stereo content on a 7.1 output keeps its level.
2. A periodic Hann window and an FFT run once per frame: 2048 samples at 44.1/48 kHz, 4096 at 88.2/96 kHz (~43 ms of audio).
3. Each band reads its **loudest FFT bin**, calibrated so a full-scale sine reads 0 dBFS in its band. The lowest bands are narrower than one bin at 48 kHz, so they are interpolated at their center.
   - A pure tone shows its true level.
   - Broadband noise reads a few dB higher in the wide treble bands than in the narrow bass bands.

**Silence and repeated frames:**
- While nothing plays, Windows' loopback delivers no audio at all. After 150 ms without any, the input counts as silence.
- Identical frames (silence, or a steady tone) are republished at most once a second. So `If-None-Match` polls get `304`, and `ageMs` stays under ~1.1 s.

**Follows the default output:**
- A default-device change switches the capture within a frame.
- If the device goes away, its format changes or the audio service restarts, capture reopens with backoff (250 ms, doubling up to 10 s).
- Meanwhile the payload carries `sampleRate: null` and falling bands.

**Privacy and side effects:**
- **Analysis only.** Prism Control never stores, records, writes or sends audio. The samples stay in memory for one ~43 ms analysis window, and only the numbers above leave the audio module.
- It captures in shared loopback mode, so nothing changes for the device or other apps: no volume, mute, format or default-device change.
- Its own stream opts out of Windows' communications ducking, so "reduce the volume of other sounds" never triggers.
- Capture is a read, so it also runs in safe mode.
- Loopback of an output is not microphone capture: Windows shows no microphone-in-use indicator for it.
- While a spectrum is shown, the capture stream may appear under Prism Control in the Windows volume mixer. Prism Control's own mixer hides it.

**In-process readers.** Prism Control actions, such as Kaleidoscope EQ keys or the Galleon screen, read `IDataRegistry.AudioSpectrum` (a `DataTopic<AudioSpectrumSnapshot>`) directly (§6.1):
- `AudioSpectrum.Current` returns the latest snapshot, or null while idle. **Reading `Current` does not create demand.**
- While the bars are on screen, call `AudioSpectrum.Demand()` about once a second, and read `Current` on each render tick.
  - `Demand()` starts capture when it is idle and keeps it running. It reads, serializes and copies nothing.
  - The first frame appears in `Current` 33–150 ms after the first `Demand()`. Until then `Current` is null: draw empty bars.
- Stop calling `Demand()` when the bars are hidden: capture stops 5 s after the last call.

---

## 5. Units and conventions

- Property names carry their unit:
  - `Pct` = 0–100
  - `C` = °C
  - `W` = watts
  - `MiB`/`GiB` = binary megabytes and gigabytes
  - `Bps` = **bytes** per second
  - `Mbps` = megabits per second (link speed only)
  - `Mhz` = MHz
  - `Ms` = milliseconds
  - `Sec` = seconds
  - `peak`, `rms` = linear 0..1
  - `Db` = dBFS
  - `Hz` = hertz (`bandHz`)
- Numbers are JSON numbers. Integers may arrive as `42` or `42.0`.
- Timestamps are ISO 8601 UTC with milliseconds: `2026-10-16T19:22:49.547Z`.
- JSON is UTF-8, without a BOM, with no HTML escaping (`+`, `<`, `'` appear literally).
- Clients must ignore unknown properties (§8).

---

## 6. Update cadence and recommended polling

| Endpoint | Producer cadence | Recommended client poll | Notes |
|---|---|---|---|
| `/v1/health` | On request | At connect, then every 10–30 s | Use `status` and `providers[*].ageMs` to show staleness. |
| `/v1/system` | 1 Hz | 1 Hz + ETag | Faster polling only returns 304s. |
| `/v1/now-playing` | On change | 1 Hz + ETag | Extrapolate the position locally. |
| `/v1/now-playing/art` | On track change | Only when `art.etag` changes | Or use `?art=dataUrl` once per change. |
| `/v1/audio/levels` | ≈30 Hz while demanded | ≤ 30 Hz, only while visible | Metering stops 5 s after the last request. |
| `/v1/audio/spectrum` | ≈30 Hz while demanded; identical frames (silence) once a second | ≤ 30 Hz + ETag, only while visible | Capture stops 5 s after the last request; the first request after idle waits up to 250 ms and may answer `503`. |
| `/v1/audio/devices` | On change (≤ 0.5 s cache) | Every 2–5 s + ETag | |
| `/v1/mic` | Mute on change; peak 10 Hz while demanded | 2–4 Hz + ETag | |
| `/v1/cooling` | 1 Hz while demanded | 1 Hz + ETag | Sampling stops 15 s after the last request; the first request after idle may answer `503` or `status: "connecting"`. |

Data API traffic does **not** count against Prism Control's Stream Deck update budget. Your own `setImage`/`setFeedback` calls count against the Stream Deck app's shared ceiling of about 230–300 updates/s; `/v1/health` → `updates.sentLastSec` shows Prism Control's share.

### 6.1 In-process readers

Prism Control's own actions, such as Kaleidoscope keys or the Galleon screen, read the topics directly through `IDataRegistry` instead of over HTTP:
- `topic.Current` is the latest snapshot, or null when there is none. Reading it **never creates demand**. Demand-driven producers stay idle while only `Current` is read: for example audio levels, the spectrum, the mic peak, cooling, and Spotify's remote polling behind now playing.
- While a key or screen shows the data, call `topic.Demand()` at most about once a second, then read `Current`.
  - `Demand()` counts as a request: it extends the 5 s demand window and starts an idle producer.
  - It reads, serializes and copies nothing, and never calls a pull provider.
- Stop calling it when the data is hidden; the producer stops when the window lapses.
- `await topic.ReadAsync(ct)` also counts as a request and returns the JSON bytes, but `Demand()` is the cheap way.
- Snapshots are shared between readers: treat them as read-only.

---

## 7. Availability today, and demo mode

The server, auth, envelope and every endpoint are live and covered by tests. As of wave 1 (2026-10-16) every domain module is real; the table records what each one fills.

| Endpoint | Today (v0.1.0) | When the domain module ships |
|---|---|---|
| `/v1/health`, `/v1` | Live | — |
| `/v1/system` | Live, **full**: CPU, GPU (NVML; D3DKMT for AMD/Intel and iGPUs), RAM, disks, network. `cpu.tempC` needs LibreHardwareMonitor’s web server or HWiNFO shared memory | — |
| `/v1/now-playing` (+ `/art`) | Live from the Windows media session (SMTC) without sign-in; the Spotify Web API adds like/shuffle/repeat/volume/context after Connect | — |
| `/v1/audio/levels`, `/v1/audio/devices`, `/v1/mic` | Live (Core Audio). `/v1/mic` follows the console default capture device | — |
| `/v1/audio/spectrum` | Live (WASAPI loopback of the console default output). It has no demo provider: in demo mode it still analyzes the real output, read-only | — |
| `/v1/cooling` | Live (iCUE; LibreHardwareMonitor fallback) | — |

**Demo mode** gives you fictional, moving data on every endpoint now, except `/v1/audio/spectrum` (always real; see the table above). Every payload is marked `"demo": true` with source `demo`. Real providers always win: a real claim replaces the demo, so `/v1/system` shows the partial real data even in demo mode.

The Stream Deck app does not pass custom environment variables to plugins, so run the plugin against the fake host instead. This writes `control.json` where your client looks for it:

```
cd prism-control
pwsh tools/build.ps1 -SkipTests
dotnet run --project tools/PrismControl.Tools -c Release -- fake-host --demo --seconds 600 --user-dir "%APPDATA%\Prism\control"
```

(`fake-host` launches the packed exe with `PRISM_CONTROL_DEMO_DATA=1`, places every action on a fake Galleon and Stream Deck +, and stops after `--seconds`.)

> **Warning (2026-10-16):** the domain modules are now real, and fake-host presses every action at random. Until fake-host gains a safe mode, running it without `--action <a sample or diagnostics uuid>` can change the real volume, default devices, Sonar EQ and Spotify playback on the PC running it.

---

## 8. Versioning policy

- The path prefix `/v1/` is the major version. Inside v1, changes are **additive only**: new endpoints, new properties, new enum values in documented open sets (`source`, `vendor`, `state` of a device). Clients must ignore unknown properties and tolerate unknown enum values.
- Never in v1: removing or renaming a property, changing a unit or type, or making a non-null property nullable. Those require `/v2/`. If that ever happens, v1 stays served alongside v2 for at least one release, and `control.json` `api` reports the highest major version.
- `control.json` `v` changes only if its existing fields change meaning.
- Every change is listed in the changelog below, in both copies of this file.

---

## 9. A minimal Node client (no dependencies)

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.join(process.env.PRISM_CONTROL_DIR ?? path.join(process.env.APPDATA, 'Prism', 'control'), 'control.json');
let conn = null;
const etags = new Map();
const cache = new Map();

async function get(p) {
  conn ??= JSON.parse(await readFile(file, 'utf8'));            // re-read after every failure: port/token rotate
  const headers = { authorization: `Bearer ${conn.token}` };   // never send Origin; Host is set from baseUrl
  if (etags.has(p)) headers['if-none-match'] = etags.get(p);
  let res;
  try { res = await fetch(conn.baseUrl + p, { headers }); }
  catch { conn = null; return null; }                           // not running (or restarting): retry later
  if (res.status === 304) return cache.get(p);
  if (res.status === 401) { conn = null; return null; }
  if (!res.ok) return null;                                     // 503 unavailable: no data yet
  etags.set(p, res.headers.get('etag'));
  const body = await res.json();
  cache.set(p, body);
  return body;
}

setInterval(async () => {
  const sys = await get('/v1/system');
  if (sys?.data.memory) console.log(`RAM ${sys.data.memory.usagePct}%${sys.demo ? ' (demo)' : ''}`);
}, 1000);
```

---

## 10. Changelog

| Date | Version | Change |
|---|---|---|
| 2026-10-18 | v1 | Added `/v1/audio/spectrum` (§4.10): a 24-band loopback spectrum of the default output with peak, RMS and silence, demand-driven at ≈30 Hz. `/v1` lists it and `/v1/health` reports it. In-process readers create demand with `DataTopic.Demand()` (§6.1). Additive only. |
| 2026-10-18 | v1 | `/v1/now-playing` follows the playing session (`source: "smtc"` with another `app` is normal); streamer-safe sends an empty `track.title`. Additive. |
| 2026-10-16 | v1 | `/v1/system` gains `cpu.tempSource`, and `cpu.tempC` can now come from iCUE through the Cooling module. `/v1/health` gains `safeMode` and `macrosDryRun`. Additive only. |
| 2026-10-16 | v1 | Added `/v1/cooling` (§4.9). `/v1/system` is now full (§7); documented that `perCorePct` is null unless a per-core view is visible, integrated GPUs appear in `gpus[]` with null power/fan, and network totals count hardware adapters only. Additive only. |
| 2026-10-16 | v1 | First release: discovery file, bearer auth with Host/Origin rules, envelope, ETag/304, and the endpoints `/v1`, `/v1/health`, `/v1/system`, `/v1/now-playing` (+ `?art=dataUrl`), `/v1/now-playing/art`, `/v1/audio/levels`, `/v1/audio/devices`, `/v1/mic`. Demo mode. |
