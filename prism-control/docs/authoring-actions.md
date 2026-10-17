# Authoring actions: the contract for domain engineers

This is how you add features to Prism Control: write an action, render a key, drive a dial on the Galleon and on the Stream Deck +, register a data provider, test it, and stay out of trouble. Read [architecture.md](architecture.md) once for the big picture. Every sample action in `src/PrismControl.<Domain>/Sample*.cs` is a working example of the patterns below.

**Ground rules:**

- You own `src/PrismControl.<Domain>/**` and `tests/PrismControl.<Domain>.Tests/**`.
- You build only your project: `dotnet build src/PrismControl.<Domain>`.
- Set `DOTNET_GENERATE_ASPNET_CERTIFICATE=false` and `DOTNET_CLI_TELEMETRY_OPTOUT=1` before every `dotnet` command.
- No NuGet packages. The BCL, WinRT (via the TFM), COM and P/Invoke cover everything.
- Do not touch the user's audio, EQ or playback while developing, unless your task says so. Read-only probes are fine. Any test that changes state must restore it immediately.

---

## Safe mode (read this first)

**The contract, in one sentence: while `SafeMode` is true, every write path that would change this PC must be a no-op or a fake; reads stay real.**

The fake host and the E2E suite place actions and press them at random. With the real modules loaded, that would change the volume, default devices, mic mute, Sonar or APO EQ, Spotify playback and fans, type keys and launch apps. So they always start the plugin with `PRISM_CONTROL_SAFE_MODE=1` (and `PRISM_CONTROL_MACROS_DRY_RUN=1`), and the plugin passes the switch to you as one property:

| Where | Read it as |
|---|---|
| Your module | `IModuleContext.SafeMode` (`context.SafeMode` in `Initialize`) |
| An action | `SafeMode` (a property on every action, the same value) |
| A test | `ActionHarness<T>.AppearAsync(..., safeMode: true)`; a test `IModuleContext` that does not implement it reads the environment |

How to adopt it (wave 3):

- **Gate at the lowest layer that touches the OS or the network**, not in every action: swap the writer once in `Initialize`, and reads keep using the real thing.

  For example (the type names are illustrative):

  ```csharp
  public void Initialize(IModuleContext context)
  {
      IVolumeWriter writer = context.SafeMode ? new LoggingVolumeWriter(context.Log) : new CoreAudioVolumeWriter();
      _engine = new AudioEngine(reader: new CoreAudioReader(), writer, context.Log);   // reads stay real
      if (context.SafeMode) context.Log.Info("Safe mode: volume, device and mute changes are logged, not applied.");
  }
  ```

- A fake write should **update your in-memory model** as if it worked (so keys and dials still respond under the fake host) and **log one line** (`[safe mode] would set volume to 42%`), never the user's data.
- "Write" means anything with an effect outside the plugin: Core Audio setters and default-device changes, Sonar/APO writes, Spotify Web API PUT/POST/DELETE and SMTC transport calls, `SendInput`, process launches, `SetForegroundWindow`, iCUE/QtRO calls other than reads. HTTP GETs to loopback services and COM/WinRT getters are reads. `OpenUrl`/`SwitchToProfile` go through the app, which the fake host only records, and `ProcessLauncher.Start` already starts nothing in safe mode (it returns null).
- Macros already has its own switch (`PRISM_CONTROL_MACROS_DRY_RUN`); the host forces it on in safe mode, so Macros sends no input and launches nothing today.
- Since wave 3 every shipped module honors safe mode, and its actions are listed in `FakeHostSafety.GatedActions` (add a new action there only when your module safe-mode tests cover its writes). The fake host places them with `--action <uuid>` or `--gated` without `--allow-real-actions`; a plain run still places only the five samples and Diagnostics (`FakeHostSafety.SafeActions`). Any action in neither set needs `--allow-real-actions` and prints a warning.

### Trust on first use (Macros launch steps)

Action settings travel with exported profiles, so a launch step in a shared profile is untrusted data. Macros runs a launch step only if its exact target + arguments + start folder is trusted **on this PC**: steps authored or edited in this PC property inspector are trusted when saved, and imported ones show **Review in settings** until the user presses **Trust** in the PI. Trust is a list of SHA-256 hashes in the module data folder (`launch-trust.json`), never in settings. Shells, PowerShell, mshta, script hosts, `.hta/.lnk/.url/.scr/.bat` files and UNC paths always need a second press within 3 s, even when trusted. Any module that runs commands from settings should follow the same rule.
- `/v1/health` reports `safeMode` and `macrosDryRun`; the start-up log says `**** SAFE MODE ON ****`.

---

## 1. Write an action

```csharp
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Layouts;

namespace PrismControl.Audio;

public sealed class VolumeSettings          // per-key settings: plain class, public get/set, defaults in initializers
{
    public string? DeviceId { get; set; }   // null = default device
    public int Step { get; set; } = 2;
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.volume",
    Name = "Volume",                                          // ≤ 30 characters
    Controllers = Controllers.Encoder | Controllers.Keypad,   // Encoder ⇒ derive DialAction<T>
    Tooltip = "Turn to change the volume, press to mute.",
    Icon = "imgs/actions/volume/icon",                        // action list icon, NO extension
    KeyImage = "imgs/actions/volume/key",                     // default key image, NO extension
    Layout = Layouts.Value.Path,                              // "$B1"-style built-in or "layouts/<file>.json"
    TriggerRotate = "Volume", TriggerPush = "Mute", TriggerTouch = "Mute")]
public sealed class VolumeAction : DialAction<VolumeSettings>
{
    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (IsDial) SetFeedbackLayout(Layouts.Value.Path);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e) { /* e.Ticks: Galleon ±12, Plus ±1 */ Render(); return Task.CompletedTask; }
    protected override Task OnDialPressAsync(DialUpEvent e) { /* toggle mute */ Render(); return Task.CompletedTask; }
    protected override Task OnKeyPressAsync(KeyUpEvent e) { /* same on a key */ Render(); return Task.CompletedTask; }

    private void Render()
    {
        if (IsDial) SetFeedback(new Feedback().Text(Layouts.Value.Label, "VOLUME").Text(Layouts.Value.ValueText, "42%").Bar(Layouts.Value.Bar, 42));
        else SetImage(KeyArt.Value(Theme, "VOLUME", "42%", Hues.For(Theme, "audio"), 0.42));
    }
}
```

That's all. **No registry to edit:** the attribute is discovered at start-up, and the manifest is generated from it at pack time. `dotnet run --project src/PrismControl -- --list-actions` prints what was found; discovery errors print as `error:` lines. The rules live in Core (`ActionValidator`), so your tests run exactly what the host runs (§8).

### 1.1 Attribute reference

| Property | Default | Notes |
|---|---|---|
| `uuid` (constructor) | — | `com.jeremyfhall.prismcontrol.<domain>.<id>`: lowercase, digits, `-`. **Never change it after release** (profiles reference it). |
| `Name` | required | Shown in the actions list. |
| `Controllers` | `Keypad` | `Keypad`, `Encoder` or both. Encoder means Stream Deck + dials/strip **and** Galleon dials/screen widgets. |
| `Icon` | `imgs/actions/default/icon` | 20×20 (+40 @2x) white-on-transparent SVG/PNG, without extension. The designer provides the art. |
| `KeyImage` / `KeyImageAlt` | `imgs/actions/default/key` | 72×72 (+144). Setting `KeyImageAlt` gives the action two states. |
| `Layout` | `$X1` | Built-in `$A0 $A1 $B1 $B2 $C1 $X1`, or `layouts/<file>.json`. |
| `EncoderIcon`, `EncoderBackground`, `StackColor` | — | The dial icon in the app, the strip background (200×100), and `#RRGGBB`. |
| `TriggerRotate/Push/Touch/LongTouch` | — | Text shown in the app. Touch and LongTouch only exist on Stream Deck +. |
| `PropertyInspector` | `pi/default.html` | The default page renders your `DescribeForm()` (§6). |
| `VisibleInActionsList`, `SupportedInMultiActions`, `UserTitleEnabled`, `DisableAutomaticStates`, `ShowTitle` | `true`, `true`, `true`, `true`, `true` | `DisableAutomaticStates = true` means you own the state with `SetState`. The five `Sample*` actions set `VisibleInActionsList = false`: users never see them, but the fake host and E2E keep them as safe fixtures. |

### 1.2 Base classes

- `KeyAction<TSettings>` for key-only actions. `KeyAction` has no settings.
- `DialAction<TSettings>` for anything with `Encoder`. It can also live on keys when `Controllers` includes `Keypad`; branch on `IsKey`/`IsDial`.
- Constructors must be public and parameterless, and must do **no work**. The instance is not bound yet, and the manifest generator constructs nothing but still loads your types. Start everything in `OnWillAppearAsync`.

### 1.3 Handlers (override what you need)

| Handler | When |
|---|---|
| `OnWillAppearAsync` / `OnWillDisappearAsync` | The instance became visible / is going away. Render loops stop automatically. |
| `OnKeyDownAsync`, `OnKeyUpAsync` | Raw key events. |
| `OnKeyPressAsync(KeyUpEvent)` | A completed press. If you also override `OnKeyLongPressAsync`, only presses shorter than `LongPressThreshold` (500 ms). |
| `OnKeyLongPressAsync(KeyDownEvent)` | Fires **while still held**, at the threshold. Works on every device. |
| `OnDialRotateAsync(DialRotateEvent)` | `e.Ticks` (signed), `e.Pressed`. |
| `OnDialDownAsync`, `OnDialUpAsync`, `OnDialPressAsync(DialUpEvent)` | Dial push. A short push works on Galleon too. |
| `OnDialLongPressAsync` | **Stream Deck + only.** Never raised on Galleon (§4). |
| `OnTouchTapAsync(TouchTapEvent)` | **Stream Deck + only**: `X`, `Y` in the 200×100 segment, `Hold`. |
| `OnSettingsChangedAsync(TSettings)` | The property inspector changed settings. |
| `OnPiMessageAsync(type, data)` → `object?` | PI messages; the return value answers `PrismPI.request`. |
| `OnPropertyInspectorAppearedAsync` / `Disappeared` | The PI opened or closed. |
| `OnTitleParametersChangedAsync` | The user changed title font or settings. |

### 1.4 Commands (call from handlers)

| Command | Notes |
|---|---|
| `SetImage(SvgDocument)` / `SetImage(string?)` | Keys. Data URLs, plugin-relative paths, or null (the manifest image). Raw SVG markup is converted to a data URL for you. **Scheduled.** |
| `SetTitle(string?)` | **Scheduled.** |
| `SetFeedback(Feedback)` / `SetFeedbackLayout(path)` | Dials. **Scheduled**, with the layout always before the feedback that follows it. |
| `SetState(int)`, `ShowOk()`, `ShowAlert()`, `SetTriggerDescription(...)` | Direct. |
| `SetSettings(s)` / `SaveSettings()` / `RequestSettings()` | Settings are stored by the app and **travel with exported profiles**. |
| `SendToPropertyInspector(type, data)` | Only delivered while the PI is open. |
| `OpenUrl(url)`, `SwitchToProfile(name, page)` | `switchToProfile` only works for profiles bundled in our manifest. |
| `StartRenderLoop(render, idle, active)` | §3.3. |
| `Post(work)` | Runs `work` in this instance's mailbox, from any thread (§2). |

---

## 2. Threading: the mailbox

Each instance has a **mailbox**. Every handler, render-loop tick, long-press timer and `Post`ed delegate for that instance runs there: one at a time, in order. You never need locks for your own action state.

- **Events from other threads go through `Post`.** SMTC events, Core Audio notifications, timers and HTTP callbacks arrive on thread-pool threads:

  ```csharp
  session.MediaPropertiesChanged += (_, _) => action.Post(() => RefreshAsync());   // never touch action state directly here
  ```

- **Never block the mailbox.** No `.Result`, no `.Wait()`, no `Thread.Sleep`, no synchronous I/O. Await asynchronous APIs; push CPU-heavy work to `Task.Run` and come back with `Post`. A handler that runs over 2 s is logged as a warning.
- Shared state across instances (one Spotify client, one audio engine) lives in a **service** your module registers (§7). Make services thread-safe.
- Exceptions in handlers are logged with the action and context, and the mailbox keeps going. Show `ShowAlert()` yourself if the user should know.

---

## 3. Rendering

### 3.1 Keys

```csharp
var d = SvgDocument.Key();                          // 144×144 square viewBox (the app stretches it to the key)
var t = Theme;                                      // Refraction.Night or .Day (global "core.theme")
d.Rect(0, 0, 144, 144, t.Bg);
d.Text("CPU", 72, 38, 22, t.KeyMuted, TextAlign.Middle);                         // one stroked path
d.Text("42%", 72, 80, 44, t.KeyInk, TextAlign.Middle, baseline: TextBaseline.Middle);
SetImage(d);
```

Or start from the designer's helpers: `KeyArt.Base/Value/Glyph`, `DialArt.Base/Meter`, `Glyphs.*`, `Hues.For(theme, "audio")`.

**The renderer is not Chrome.** `SvgDocument` only emits what the Stream Deck app's Qt renderer draws correctly. Keep to it:

- **Colors:** hex only; translucency goes through `Paint` opacity. `"rgba(…)"` strings are converted automatically, and `hsl()` throws. **Never hand-write `rgba()`, `hsl()` or `#rrggbbaa`: they render black.**
- **Clipping:** `d.Mask(...)`, `d.MaskRoundedRect(...)`, `d.MaskCircle(...)` (luminance masks). **There is no clipPath; the app ignores it.**
- **Glows:** `d.Glow(stdDev)` / `d.Blur(stdDev)`. Drop shadows, turbulence, morphology, blend modes and CSS transforms are dropped by the app.
- **Text:** `d.Text(...)` uses the built-in stroke font (CSS-like sizes: capital height = 0.72 × size; tokens: value 44, label 22, micro 16; nothing below 16 at @144). Lowercase renders as small caps. Use `StrokeFont.FitSize`/`Ellipsize`/`Measure` to fit. **There is no `<text>`.**
  - **Coverage** (measured in wave 2 on this PC's device names plus about 300 real app and track names): Latin with every common diacritic (Polish, Czech, Turkish, Romanian, Nordic, Vietnamese with stacked marks), Ł Đ Þ Ħ ı ß, **Greek and Cyrillic** (as capitals and small caps), all ASCII punctuation including `@` `` ` `` `{` `}`, typographic quotes and guillemets, ¡ ¿ † §, € £ ¥ ¢, © ® ™, ± ÷ ≈ ≠ ≤ ≥ ∞ ½ ¼ ¾, super/subscript digits, №, ♥ ♪ ♫ ♭ ♯ ★ ✓ ✗, simple shapes and arrows. Fullwidth forms, ligatures and circled or Roman numerals draw as their plain letters.
  - **Not drawn:** CJK, kana, Hangul, Arabic, Hebrew, Indic, Thai and emoji. **Nothing is ever dropped:** each such grapheme (an emoji sequence counts as one) becomes one visible replacement box the width of a letter; an unknown combining mark turns its whole letter into a box. Invisible characters (zero-width joiners, direction marks, variation selectors, soft hyphens) are skipped. `StrokeFont.Supports(text)` is false for such text and `StrokeFont.Unsupported(text)` lists the graphemes, so you can choose another presentation (for example a native text item on a dial layout, which the app draws with system fonts; unverified for CJK on hardware). Do not strip or remap characters yourself: that silently changes names.
- **Budget:** ≤ 300 elements per frame (an exception above that). Render cost scales with element count, not bytes, so merge shapes into one `PathBuilder`.
- **Images:** `d.Image(bytes, x, y, w, h, ImageFit.Contain)` for PNG/JPEG/GIF/WebP.
  - **Spotify album art must be `ImageFit.Contain`, with no corner radius, no mask, no overlay and no tint.** Show it whole, as Spotify returns it. Resizing is allowed. Put text, progress and focus rings **outside** the art.
  - Prefer Spotify's 300 px image for keys, and the 64 px one for lists.
- **Payload:** always `d.ToDataUri()` (or pass the `SvgDocument`). A raw SVG string is rejected by the app and the key reverts to its manifest image.

Check frames with `SvgLint.Check(svg, SvgCanvas.Key)`. Debug builds lint every frame you build and throw on errors, and the test harness lints everything (§8).

### 3.2 Only changed frames, and the budget

All `SetImage`/`SetFeedback`/`SetTitle`/`SetFeedbackLayout` calls go through the **update scheduler**:

- 60 updates/s in total for the whole plugin (configurable);
- latest-wins per key;
- frames identical to the last one sent are dropped;
- per-key caps: 30 Hz while the user interacts, 10 Hz normally, 2 Hz for `UpdatePriority.Background`.

So:

- Rendering the same picture again costs nothing; it is deduplicated. Rendering a new picture every 10 ms only burns CPU, because the scheduler drops the intermediate frames.
- Stats keys: set `DefaultPriority = UpdatePriority.Background` in `OnWillAppearAsync`. They then never compete with a dial being turned.
- Input automatically makes a context interactive for 1.5 s (served first, up to 30 Hz).

### 3.3 Render loops

```csharp
protected override Task OnWillAppearAsync(WillAppearEvent e)
{
    DefaultPriority = UpdatePriority.Background;
    StartRenderLoop(Render, idleInterval: TimeSpan.FromSeconds(1));                  // stats: 1 Hz
    // a dial: StartRenderLoop(Render, TimeSpan.FromSeconds(1), activeInterval: TimeSpan.FromMilliseconds(33));
    return Task.CompletedTask;
}
```

The loop runs in the mailbox, skips ticks while the previous one is still running, switches to `activeInterval` for 2 s after any input, and stops on `willDisappear`. Use `loop.Invalidate()` to redraw now, for example after a data change. Event-driven actions, which re-render in their handlers, need no loop at all.

---

## 4. Dials: Galleon 100 SD vs Stream Deck +

Both are `Controllers.Encoder` and both draw a **200×100 layout per encoder slot**. Author for both from the start: same action, same layout.

| | Stream Deck + (type 7) | Galleon 100 SD (type 12) |
|---|---|---|
| Keys | 4×2, ~120 px | 3 wide × 4 tall, `column,row` (x 0..2, y 0..3) |
| Encoder slots | 4 dials, `column` = 0..3, `row` = 0 | 2 dials × 2 layers: `column` = dial (0 left, 1 right), `row` = layer (0 top, 1 bottom) |
| Where it shows | Its own 200×100 strip segment | One of four widgets on the 720×384 screen, all visible at once: `0,0` TL, `0,1` BL, `1,0` TR, `1,1` BR. Each shows the whole 200×100 canvas scaled to ~360×180 (author at 2:1). |
| Ticks per `dialRotate` | ±1 | **Up to ±12** (fast spins are aggregated). Treat `Ticks` as a magnitude, not a count of events. |
| Dial push | dialDown/dialUp, holds arrive | dialDown/dialUp for short pushes. **The ~4 s hold switches layers and never reaches us.** |
| `OnDialLongPressAsync` | Raised | **Never raised** |
| Touch (`touchTap`) | Yes, segment-local `X`/`Y` + `Hold` (long touch). Swipes never arrive. | **None** |
| Encoder action in a layer you cannot see | — | The widget is always visible, but the user turns only the active layer (white border in the app) |

Use it in code:

```csharp
if (Device.IsGalleon) { … }                    // DeviceInfo
var caps = Device.Capabilities;                // HasTouchStrip, SupportsDialLongPress, MaxTicksPerEvent, EncoderDisplayPixels, KeyPixels
var where = Encoder;                           // EncoderPlacement: Dial, Layer, Quadrant (Galleon) / StripSegment (Plus)
```

**Design rule:** every function must be reachable with **rotate plus a short push**. Touch and long-press are Stream Deck + extras. For example, the Spotify dial browser: turn to scroll, push to open or play, and "back" as a list item or a key. Never as a Galleon long-press.

**Layouts.** Use a shared one (`Layouts.Canvas`, `Value`, `Media`, `Dual`), or add your own as `src/PrismControl.<Domain>/plugin/layouts/<domain>-<name>.json`. It is packed into `layouts/`; file names must be unique. Your layout must:

- stay inside 200×100;
- have unique keys;
- not overlap within the same `zOrder`;
- use opacity in 0.1 steps;
- use hex colors only;
- avoid the keys `title` and `icon`, which the user can override.

`prismctl validate-layout <file>` and the tests check all of this.

**Two dial styles:**

1. **Full canvas (recommended for the Refraction look):** `Layouts.Canvas` plus one pixmap frame drawn with `SvgDocument.Dial()`. Everything is path-drawn and identical on both devices. See `SampleBandDial`.
2. **Native items:** `Layouts.Value`/`Media`/`Dual` plus `Feedback().Text(...).Bar(...)`. This is cheaper to update; text uses the app's fallback sans face. See `SampleLevelDial`.

`Feedback` merges per key and unchanged keys are not resent. Send only what changed.

---

## 5. Settings

- **Per action:** your `TSettings` class (camelCase on the wire). It is read leniently: `"5"` reads as 5, and `"on"`/`"true"` read as true. Nullable annotations are enforced: a JSON `null` (or a wrong type) for a non-nullable property, as in an imported profile, is dropped so that property keeps its initializer default and a warning is logged; settings that cannot be repaired that way fall back to `new TSettings()`. So a non-nullable `string` is never null in your handlers. Declare `string?` where null is a real value. `ActionJson.ReadOrDefault<T>(node)` gives you the same reader for your own JSON. Mutate `Settings` and call `SaveSettings()`, or call `SetSettings(new …)`. Settings are **plain text, exported with profiles**: no tokens, passwords or personal data.
- **Plugin-wide:** `GlobalSettings.GetSection<MySection>("audio")` / `SetSection("audio", value)`. Each domain owns one section (`audio`, `systeminfo`, `spotify`, `eq`, `macros`, `cooling`). `core` is the architect's (`updateBudget`, `theme`, `reducedMotion`). Subscribe to `GlobalSettings.Changed` (`FromStreamDeck` is true when a PI edited it). A PI field can edit a section key directly (§6).
- **Secrets:** `new SecretStore(context.DataDirectory, "prismcontrol/spotify").Save("tokens", json)`. This is DPAPI for the current Windows user, with per-name entropy, written atomically to `%APPDATA%\Prism\control\modules\<module>\`. Never log secrets. The Spotify Client ID may be logged by its last 4 characters only.

---

## 6. Property inspector

- **Zero HTML** (the default page): override `DescribeForm()`:

  ```csharp
  protected override PiForm? DescribeForm() => new PiForm()
      .Heading("Device")
      .Select("deviceId", "Output", optionsFrom: "devices.list")   // the PI requests the options from you
      .Range("step", "Step per tick", 1, 10, 1)
      .Checkbox("showPercent", "Show %")
      .Button("test", "Test sound")
      .Info("Status", stateKey: "status");

  protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) => type switch
  {
      "devices.list" => (await _audio.ListAsync()).Select(d => new { value = d.Id, label = d.Name }),
      "test" => null,
      _ => null,
  };
  protected override object? DescribeState() => new { status = "Connected" };   // shown by .Info(stateKey)
  ```

  Fields bind to top-level settings properties by camelCase name. Push live status with `SendToPropertyInspector("pi.state", new { status = "…" })`.

  | Field | Setting type | Notes |
  |---|---|---|
  | `Text`, `TextArea(setting, label, placeholder, rows)` | `string` | Saved 300 ms after typing stops; a text area keeps newlines. |
  | `Number`, `Range` | number | An emptied number field sends null, which keeps your default. |
  | `Checkbox` | `bool` | |
  | `Select(setting, label, options, optionsFrom)` | `string` | A saved value missing from the list (an unplugged device) is shown as "… (unavailable)", never silently replaced. |
  | `MultiSelect(setting, label, options, optionsFrom, ordered, max)` | `string[]` / `List<string>` | A checklist. `ordered: true` adds up/down buttons and keeps the order (e.g. the devices a switcher cycles through); `max` caps the count. Missing values stay checked and are marked unavailable. |
  | `Button(command, label)`, `Info(label, text, stateKey)`, `Heading` | — | |

- **Global settings in the form:** name the setting `PiForm.Global("eq", "backend")` (that is, `"global:eq.backend"`) and the field reads and writes that key of the global `eq` section instead of the action's settings. Every action sees the same value, your module gets `GlobalSettings.Changed`, and the PI waits for the global settings to load before it writes (so it never wipes another module's section). Do not mirror global values into each action's settings any more.
- **Refreshing lists:** the PI requests every `optionsFrom` list when the form renders. When a list changes while the PI is open, call `RefreshPropertyInspectorOptions("devices.list")` (no arguments = every list); the selection is kept. `RefreshPropertyInspectorForm()` re-sends the hello so the PI rebuilds the whole form (fields that depend on a setting). Both do nothing while the PI is closed. Custom pages get the same as a `pi.refresh` message (`PrismPI.on('pi.refresh', …)`) and can call `PrismPI.refreshOptions()`.
- **Custom page:** copy `pi/template.html` to `src/PrismControl.<Domain>/plugin/pi/<domain>-<name>.html` and point the attribute at it (`PropertyInspector = "pi/<domain>-<name>.html"`). Use `data-setting`, `data-state`, `PrismPI.request(...)` and `PrismPI.send(...)`. No external scripts, fonts or images: PIs must work offline. Styling belongs to the designer (`pi/lib/prism-pi.css`).

---

## 7. Your module, services and data providers

```csharp
[assembly: PrismModule(typeof(PrismControl.Audio.AudioModule), MonitorApplications = [])]

public sealed class AudioModule : IPrismModule, IAsyncDisposable
{
    private AudioEngine? engine;
    public string Name => "audio";
    public void Initialize(IModuleContext ctx)
    {
        engine = new AudioEngine(ctx.Log);               // keep Initialize fast; start background work as tasks
        ctx.Services.Add(engine);                        // actions: Services.Get<AudioEngine>()

        // Push: publish when something changes.
        var mic = ctx.Data.Mic.Claim("audio", cadence: TimeSpan.Zero);
        engine.MicChanged += s => mic?.Publish(new MicSnapshot { DeviceId = s.Id, Name = s.Name, Muted = s.Muted, VolumePct = s.Volume });

        // Demand-driven: only meter while the sibling plugin polls.
        var levels = ctx.Data.AudioLevels.Claim("audio", TimeSpan.FromMilliseconds(33));
        if (levels is not null) levels.DemandStarted += (_, _) => engine.StartMetering(levels, ctx.ShutdownToken); // stop when !levels.IsDemanded

        // Pull: computed on request, cached.
        ctx.Data.AudioDevices.ClaimPull("audio", ct => engine.SnapshotAsync(ct), cacheFor: TimeSpan.FromMilliseconds(500));
    }
    public ValueTask DisposeAsync() => engine?.DisposeAsync() ?? ValueTask.CompletedTask;
}
```

- **Contexts:** `ctx.Events` raises device connect/disconnect, system wake, app launch/terminate (for `MonitorApplications`), deep links (`streamdeck://plugins/message/com.jeremyfhall.prismcontrol/...`) and connect/disconnect. `ctx.ShutdownToken` is cancelled on shutdown; every loop must observe it. `ctx.DataDirectory` is your writable folder. `ctx.OpenUrl` opens a URL through the app.
- **Data topics** and who fills them:

  | Endpoint | Owner |
  |---|---|
  | `ctx.Data.System` | SystemInfo |
  | `NowPlaying` + `NowPlayingArt` | Spotify (image bytes **exactly as returned**: `art.Publish(bytes, "image/jpeg")`) |
  | `AudioLevels`, `AudioDevices`, `Mic` | Audio |

  The payload classes are in `Core/Data/Contracts.cs`, and **they are the public API** (docs/api.md). Fill every field you can and leave unknown ones `null`. Never invent values: a CPU temperature with no source stays `null`.
- **A new endpoint** needs `ctx.Data.Custom<T>("/v1/<name>", MyJsonContext.Default.T, cadence)` and a documented entry in `docs/api.md` **and** `aaa-prism-ds/prism-control/API.md` (ask the architect). Never change or remove existing fields in v1.
- **Claims:** the first real claim wins (a second claim returns `null`); a real claim always replaces the demo provider.
- **Shared CPU temperature** (`Core/Data/CpuTemperature.cs`). Windows has no non-admin CPU sensor, so a module that can read one shares it:
  - **Provide** (Cooling, from iCUE's CPU package sensor): implement `ICpuTemperatureSource { CpuTemperatureReading? Latest { get; } }` and call `context.Services.Add<ICpuTemperatureSource>(service)` in `Initialize`. `Latest` is one snapshot `(TempC, Source, At)`: cheap, thread-safe, no I/O, null when you have no reading. Publish only what you measured yourself, never a value you got from another source.
  - **Consume** (SystemInfo, for `/v1/system` `cpu.tempC`): call `CpuTemperature.ReadShared(services, time.GetUtcNow())` at read time, not in `Initialize` (module order is not defined). It returns null when there is no source, the reading is older than 10 s (`CpuTemperature.MaxAge`), stamped in the future, not finite, or the provider throws.
  - **Order of preference:** LibreHardwareMonitor (`lhm`), then HWiNFO shared memory (`hwinfo`), then the shared source (`icue` today), then null. Never fake a value.

**Launching programs** (macros): use `ProcessLauncher.Start(target, args)`. It returns null and starts nothing in safe mode. It sets the working directory away from the plugin folder; the host already removed the app's `QT_*` variables from our environment. Children break away from the plugin's job, so they keep running when the plugin stops. A Medium-IL plugin cannot `SendInput` into elevated windows (it fails silently), so detect that up front (research/windows.md §3.3).

**COM / WinRT:** both work in the published single-file exe; `--selftest` proves classic `[ComImport]`, source-generated `[GeneratedComInterface]`, WinRT activation and SMTC. Prefer `[GeneratedComInterface]` + `StrategyBasedComWrappers` for new COM code, because it stays correct if we turn trimming on. `await` WinRT async operations; never use `.GetResults()`/`.Result`.

---

## 8. Testing

Your test project, `tests/PrismControl.<Domain>.Tests`, is a console exe on the in-repo runner. Run it with `dotnet run --project tests/PrismControl.<Domain>.Tests [-- --filter Name]`.

```csharp
using PrismControl.Testing;

public class VolumeTests
{
    [Test]
    public async Task Galleon_spin_moves_by_ticks_times_step()
    {
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder,
            settings: new VolumeSettings { Step = 2 },
            configureServices: s => s.Add<IAudioEngine>(new FakeAudioEngine()));   // fake your engine: no real audio changes
        await h.RotateAsync(12);
        Assert.Equal("24%", h.FeedbackText(Layouts.Value.ValueText));
        await h.DialPressAsync(TimeSpan.FromSeconds(5));     // a Galleon "hold" is still just a press for us
        h.AssertFramesAreDeckSafe();                         // lints every key image and pixmap the action produced
    }

    [Test(Category = "integration")]                         // e.g. a read-only probe against real Core Audio
    public void Enumerates_endpoints_read_only() { … }
}
```

**Harness:**

| Kind | Members |
|---|---|
| Devices | `TestDevices.Galleon / Plus / StreamDeck / Mini / XL` |
| Input | `PressAsync(hold)`, `KeyDownAsync`, `KeyUpAsync`, `RotateAsync`, `DialPressAsync`, `TapAsync` (throws on Galleon, like the hardware), `SettingsFromPropertyInspectorAsync`, `PiMessageAsync(type, data, requestId)`, `DisappearAsync` |
| Time | `AdvanceAsync(TimeSpan)` drives a `ManualTimeProvider`: long-presses and render loops fire deterministically, with no sleeping. Pass `time: clock` to `AppearAsync` to share one clock with your fake services. Timestamps start at one day (`ManualTimeProvider.StartTimestamp`), not 0, like a real PC; `Elapsed` starts at 0 |
| Setup | `AppearAsync(device, coordinates, controller, settings, configureServices, globalSettings, inMultiAction, time, safeMode, globals, context)`; `TestGlobalSettings.ReceiveFromStreamDeck(json)` simulates a PI editing a `global:` field |
| Inspect | `LastImage`, `LastSvg`, `Feedback` (merged), `FeedbackText(key)`, `FeedbackSvg(key)`, `LastLayout`, `LastSettingsAs<T>()`, `Count("showOk")`, `CallsOf("setImage")` (with priority) |
| Asserts | `Assert.True/False/Equal/Near/InRange/Contains/DoesNotContain/Empty/Single/NotNull/Throws/ThrowsAsync/Skip` |
| Discovery rules | `ActionValidator.Scan(typeof(MyModule).Assembly)` returns `Errors`, `Warnings` and `Actions`, exactly what the host checks; `ActionValidator.IsValidUuid/IsValidLayout` for single values. Do not copy the rules into your tests. |

**Run the whole plugin without hardware:**

```
pwsh tools/build.ps1 -SkipTests
dotnet run --project tools/PrismControl.Tools -c Release -- fake-host --device galleon --seconds 10
dotnet run --project tools/PrismControl.Tools -c Release -- fake-host --device galleon --action com.jeremyfhall.prismcontrol.audio.volume --allow-real-actions --seconds 10
```

This launches the packed exe against the fake Stream Deck app **in safe mode** (always), places actions on every slot, drives random input and prints the traffic plus the update rate. Without `--action` it places only the samples and Diagnostics. A real action needs `--action <uuid>` (repeatable) **and** `--allow-real-actions`, prints a warning, and is refused if the plugin does not report safe mode. Only do that once your module gates its writes (§ Safe mode). The core E2E suite (`tests/PrismControl.Tests`, category `e2e`) does the same with assertions, under the same rules (`FakeHostOptions.AllowRealActions`).

**Previews:** render frames to SVG, then look at them at real size: 72/96/120/144 px keys, 200×100 and 360×180 dials. Put a page next to them (see `tests/PrismControl.Tests/Previews.cs`) and run `node "E:/Development Workspaces/aaa-prism-deck-team/lead/tools/snap.mjs" index.html out.png`.

---

## 9. Do NOT

- ❌ Write `rgba()`, `hsl()`, `#rrggbbaa`, `<clipPath>`, `<text>`, `feDropShadow`, `mix-blend-mode`, nested `<svg>`, or CSS `transform` into SVG. Use `SvgDocument`.
- ❌ Send raw SVG strings, or bypass `SetImage`/`SetFeedback`: no hand-built `setImage` JSON and no direct WebSocket access. The scheduler is what keeps the app's watchdog from killing the plugin.
- ❌ Animate by re-rendering in a tight loop. Use `StartRenderLoop` with sensible intervals: stats at 1 Hz, dials at ≤ 30 Hz while turning, idle is cheap.
- ❌ Design anything around a **Galleon dial long-press** or **touch on Galleon**. ❌ Rely on swipes (they never reach plugins).
- ❌ Block the mailbox (`.Result`, `.Wait()`, `Thread.Sleep`, sync I/O), or touch action state from another thread without `Post`.
- ❌ Do work in action constructors or static constructors (the manifest generator loads your types).
- ❌ Put secrets or personal data in action settings, global settings, logs or tests. Use `SecretStore`. Use fictional sample data (`.example` domains, RFC 5737 IPs, "The Example Ensemble").
- ❌ Read `manifest.json` at runtime (Marketplace DRM forbids it), or write inside the `.sdPlugin` folder (it is immutable after install). Use `ctx.DataDirectory`.
- ❌ Launch programs with the plugin folder as the working directory, or with `localhost` URLs to the app (always `127.0.0.1`).
- ❌ Draw trademarked logos (no Spotify logo; use `Glyphs.MusicNote`). ❌ Crop, mask, tint or overlay album art.
- ❌ Change the user's audio devices, volumes, EQ or Spotify playback in tests or probes without explicit approval. If you must, restore the state immediately and say so.
- ❌ Write to the PC while `SafeMode` is on (§ Safe mode), or run the fake host with `--allow-real-actions` before your writes are gated.
- ❌ Add NuGet packages or edit another engineer's project, `Core` or the exe. Ask the architect for framework changes.
- ❌ Change an action UUID or a v1 data-API field after it ships.

## 10. Hand-off checklist

- [ ] `dotnet build src/PrismControl.<Domain>` has no warnings.
- [ ] `dotnet run --project tests/PrismControl.<Domain>.Tests` passes, with `AssertFramesAreDeckSafe()` on every rendering test, on Galleon **and** Plus placements.
- [ ] Every function is reachable with rotate plus a short push; touch and long-press are extras only.
- [ ] Stats actions use `UpdatePriority.Background`, and dials only render fast while interacting.
- [ ] Settings classes hold no secrets; tokens go through `SecretStore`.
- [ ] Every write path is a no-op or a fake while `SafeMode` is on, and a test proves it (`safeMode: true`).
- [ ] Data topics are claimed with real values (nulls where unknown), and new fields or endpoints are agreed with the architect and documented in api.md.
- [ ] Icons are requested from the designer (`imgs/actions/<id>/icon`, `key`, `dial`), with the paths set in the attribute.
- [ ] `pwsh tools/build.ps1` passes end to end (the lead runs this before every commit).
