using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;
using PrismControl.Smart.Runtime;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>Fake foreground: set the app in front; nothing real is read or focused.</summary>
public sealed class FakeForeground : IForegroundSource
{
    private ForegroundApp? _app;
    public ForegroundApp? Current => _app;
    /// <summary>Whether the context's app is really in front (false = the user clicked the Stream Deck app, say).</summary>
    public bool InFront { get; set; } = true;
    public bool Elevated { get; set; }
    public bool IsInFront(ForegroundApp app) => InFront && _app is not null && _app.Hwnd == app.Hwnd;
    public bool IsElevated(ForegroundApp app) => Elevated;
    /// <summary>A made-up handle for "something else is in front" (the Stream Deck app, a pop-up).</summary>
    public const nint OtherWindow = 0x0F0F;
    /// <summary>The window in front: the app's when <see cref="InFront"/>, else <see cref="OtherWindow"/>.</summary>
    public nint ForegroundWindow => InFront && _app is not null ? _app.Hwnd : OtherWindow;
    public event Action? Changed;

    public void Set(ForegroundApp? app)
    {
        _app = app;
        Changed?.Invoke();
    }
}

/// <summary>
/// Fake Prism Sight: both halves of Desktop's contract. Readings are set by the test; the act side records every call,
/// enforces the token rules (≤ 1 s, one-shot, fitting kind) like the real one, and simulates the game's values.
/// </summary>
public sealed class FakeSight : ISightService, ISightControl
{
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly List<Action<SightSnapshot>> _subs = [];
    private readonly HashSet<Guid> _used = [];
    private SightSnapshot _snap;
    private long _seq;

    public FakeSight(TimeProvider time)
    {
        _time = time;
        _snap = SightSnapshot.Empty with { State = SightRunState.Running, ProcessName = "PlanetCoaster2.exe", GameId = "pc2" };
    }

    public Dictionary<string, double> Values { get; } = new(StringComparer.Ordinal);
    public HashSet<string> Visible { get; } = new(StringComparer.Ordinal);
    public HashSet<string> Located { get; } = new(StringComparer.Ordinal);
    /// <summary>Clicks on these act but can't be confirmed by a re-read (SightActStatus.NotVerified).</summary>
    public HashSet<string> Unverified { get; } = new(StringComparer.Ordinal);
    /// <summary>Control region → the value region it moves, and how much one control step changes it (the simulation).</summary>
    public Dictionary<string, (string Value, double PerStep)> Moves { get; } = new(StringComparer.Ordinal);
    public SightRunState State { get; set; } = SightRunState.Running;
    public List<string> Calls { get; } = [];
    public List<GestureToken> Tokens { get; } = [];

    public SightSnapshot Current { get { lock (_gate) return _snap; } }

    public IDisposable Subscribe(Action<SightSnapshot> onSnapshot, Action<SightEvent>? onEvent = null)
    {
        lock (_gate) _subs.Add(onSnapshot);
        onSnapshot(Current);
        return new Unsub(() => { lock (_gate) _subs.Remove(onSnapshot); });
    }

    public SightGameAccess Access(string processName) => new(processName, "pc2", true, true, "allowed", "fake");

    /// <summary>Publishes a snapshot from Values / Visible / Located.</summary>
    public void Publish()
    {
        Action<SightSnapshot>[] subs;
        SightSnapshot snap;
        lock (_gate)
        {
            var now = _time.GetUtcNow();
            var readouts = new Dictionary<string, SightReadout>(StringComparer.Ordinal);
            foreach (var (k, v) in Values) readouts[k] = new SightReadout(k, k, SightValueKind.Number, v, null, null, null, SightConfidence.Observed, 0.99, now, now, k);
            foreach (var k in Visible) readouts[k] = new SightReadout(k, k, SightValueKind.Bool, null, null, true, null, SightConfidence.Observed, 0.99, now, now, k);
            var controls = Located.ToDictionary(k => k, k => new SightControlState(k, true, 0.95, now), StringComparer.Ordinal);
            snap = new SightSnapshot(++_seq, now, State, "pc2", "pc2-default", "PlanetCoaster2.exe",
                new SightContext(null, null, SightConfidence.Observed, now, [.. Visible]), readouts, controls, false, null);
            _snap = snap;
            subs = [.. _subs];
        }
        foreach (var s in subs) s(snap);
    }

    private string? Check(GestureToken g, params GestureKind[] kinds)
    {
        if (_time.GetUtcNow() - g.At > TimeSpan.FromSeconds(1)) return "stale token";
        if (!kinds.Contains(g.Kind)) return "wrong gesture kind " + g.Kind;
        lock (_gate) if (!_used.Add(g.Nonce)) return "token already used";
        return null;
    }

    public Task<SightActResult> ClickAsync(string controlId, GestureToken gesture, CancellationToken ct = default)
    {
        lock (_gate) { Calls.Add("click " + controlId); Tokens.Add(gesture); }
        if (Check(gesture, GestureKind.KeyDown, GestureKind.KeyUp, GestureKind.DialDown, GestureKind.DialUp, GestureKind.TouchTap) is { } why) return Task.FromResult(new SightActResult(SightActStatus.Refused, why));
        if (!Located.Contains(controlId)) return Task.FromResult(new SightActResult(SightActStatus.NotFound, "not on screen"));
        return Task.FromResult(new SightActResult(Unverified.Contains(controlId) ? SightActStatus.NotVerified : SightActStatus.Verified, Steps: 1));
    }

    public Task<SightActResult> AdjustAsync(string controlId, SightAdjustDirection direction, int steps, SightAdjustMethod method, GestureToken gesture, CancellationToken ct = default)
    {
        var sign = direction == SightAdjustDirection.Increase ? +1 : -1;
        lock (_gate) { Calls.Add($"adjust {controlId} {(sign > 0 ? "+" : "-")}{steps}"); Tokens.Add(gesture); }
        if (Check(gesture, GestureKind.DialRotate, GestureKind.KeyDown, GestureKind.KeyUp, GestureKind.TouchTap) is { } why) return Task.FromResult(new SightActResult(SightActStatus.Refused, why));
        if (!Located.Contains(controlId)) return Task.FromResult(new SightActResult(SightActStatus.NotFound, "not on screen"));
        double? before = null, after = null;
        if (Moves.TryGetValue(controlId, out var mv))
        {
            before = Values.GetValueOrDefault(mv.Value);
            Values[mv.Value] = before.Value + sign * steps * mv.PerStep;
            after = Values[mv.Value];
            Publish();
        }
        return Task.FromResult(new SightActResult(SightActStatus.Verified, Steps: steps, Before: before, After: after));
    }

    public Task<SightActResult> StepAsync(SightChordSteps chords, SightAdjustDirection direction, int steps, GestureToken gesture, CancellationToken ct = default)
    {
        lock (_gate) { Calls.Add($"step {direction} {steps}"); Tokens.Add(gesture); }
        if (Check(gesture, GestureKind.DialRotate, GestureKind.KeyDown, GestureKind.KeyUp, GestureKind.TouchTap) is { } why) return Task.FromResult(new SightActResult(SightActStatus.Refused, why));
        return Task.FromResult(new SightActResult(SightActStatus.Done, Steps: steps));
    }

    public Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightStepVia stepVia, SightDriveOptions options, GestureToken gesture, CancellationToken ct = default)
    {
        var via = stepVia switch { SightControlSteps c => "control " + c.ControlId, SightChordSteps s => $"chords {string.Join("+", s.Increase)}/{string.Join("+", s.Decrease)} {s.Mode}", _ => "?" };
        lock (_gate) { Calls.Add($"drive {readoutId} -> {target} via {via}"); Tokens.Add(gesture); }
        if (Check(gesture, GestureKind.KeyDown, GestureKind.KeyUp, GestureKind.DialDown, GestureKind.DialUp, GestureKind.TouchTap) is { } why)
            return Task.FromResult(new SightDriveResult(SightDriveStatus.Refused, null, null, 0, why, TimeSpan.Zero));
        if (!Values.TryGetValue(readoutId, out var start))
            return Task.FromResult(new SightDriveResult(options.Fallback == SightDriveFallback.Counted ? SightDriveStatus.CountedFallback : SightDriveStatus.NoReading, null, null, 0, "no reading", TimeSpan.Zero));
        if (Math.Abs(start - target) <= options.Tolerance) return Task.FromResult(new SightDriveResult(SightDriveStatus.AlreadyThere, start, start, 0, null, TimeSpan.Zero));
        var perStep = stepVia is SightControlSteps cs && Moves.TryGetValue(cs.ControlId, out var mv) ? mv.PerStep : options.StepSize ?? 1;
        var steps = (int)Math.Round(Math.Abs(start - target) / perStep);
        Values[readoutId] = target;
        Publish();
        return Task.FromResult(new SightDriveResult(SightDriveStatus.Converged, start, target, steps, null, TimeSpan.FromMilliseconds(steps * 40)));
    }

    public void ResetLedger(string? controlId = null) { lock (_gate) Calls.Add("reset " + (controlId ?? "*")); }

    private sealed class Unsub(Action a) : IDisposable { public void Dispose() => a(); }
}

/// <summary>A fake module that publishes verbs and readouts through IVerbRegistry.</summary>
public sealed class FakeVerbProvider(string module) : IVerbProvider
{
    public string Module => module;
    public List<VerbDescriptor> VerbList { get; } = [];
    public Dictionary<string, ReadoutValue> Values { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, VerbStatus> Statuses { get; } = new(StringComparer.Ordinal);
    public List<VerbInvocation> Invocations { get; } = [];
    public IReadOnlyList<VerbDescriptor> Verbs => VerbList;
    public IReadOnlyList<ReadoutDescriptor> Readouts => [.. Values.Keys.Select(k => new ReadoutDescriptor { Id = k, Label = k })];
    public event Action? Changed;
    public VerbStatus GetStatus(string verbId) => Statuses.GetValueOrDefault(verbId, VerbStatus.Ready);
    public bool TryReadReadout(string readoutId, out ReadoutValue value) => Values.TryGetValue(readoutId, out value!);
    public Task<VerbResult> InvokeAsync(VerbInvocation invocation, CancellationToken ct = default)
    {
        lock (Invocations) Invocations.Add(invocation);
        return Task.FromResult(VerbResult.Done);
    }
    public void Set(string id, ReadoutValue v) { Values[id] = v; Changed?.Invoke(); }
    public void Raise() => Changed?.Invoke();
}

/// <summary>Desktop's recording sender plus the manual-clock time of every call (to check tap hold times).</summary>
public sealed class StampedInput(RecordingInputSender inner, TimeProvider time) : IInputSender
{
    public List<(DateTimeOffset At, string What)> Stamps { get; } = [];
    private void Stamp(string what) { lock (Stamps) Stamps.Add((time.GetUtcNow(), what)); }
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) { Stamp("chord"); return inner.SendChordAsync(keys, ct); }
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default) { Stamp("chord"); return inner.SendChordAsync(keys, mode, ct); }
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) { Stamp("key"); return inner.SendKeyAsync(key, ct); }
    public Task<bool> SendKeyAsync(VirtualKey key, KeyMode mode, CancellationToken ct = default) { Stamp("key"); return inner.SendKeyAsync(key, mode, ct); }
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) { Stamp("text"); return inner.SendTextAsync(text, ct); }
    public bool TargetIsElevated(nint hwnd) => inner.TargetIsElevated(hwnd);
    public Task<bool> SendKeysDownAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) { Stamp("down"); return inner.SendKeysDownAsync(keys, mode, ct); }
    public Task<bool> SendKeysUpAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) { Stamp("up"); return inner.SendKeysUpAsync(keys, ct); }
    public IReadOnlyList<VirtualKey> HeldKeys => inner.HeldKeys;
    public Task ReleaseAllAsync() => inner.ReleaseAllAsync();
    // Decision 4 + E16: the window-checked chord and the per-owner holds (the recording sender checks the fake foreground).
    public Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) { Stamp("chord"); return inner.SendChordToAsync(expectedHwnd, keys, mode, ct); }
    public Task<bool> HoldKeysAsync(object owner, nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) { Stamp("down"); return inner.HoldKeysAsync(owner, expectedHwnd, keys, mode, ct); }
    public Task<bool> ReleaseKeysAsync(object owner, IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) { Stamp("up"); return inner.ReleaseKeysAsync(owner, keys, ct); }
    public Task ReleaseOwnerAsync(object owner) => inner.ReleaseOwnerAsync(owner);
}

/// <summary>The fictional apps the tests put in front (made-up handles, pids and paths).</summary>
public static class Apps
{
    public static readonly ForegroundApp PlanetCoaster2 = new(0x1001, 4101, "PlanetCoaster2.exe", @"E:\Games\Example\Planet Coaster 2\PlanetCoaster2.exe", "Planet Coaster 2", null, "Cobra", false);
    public static readonly ForegroundApp Chrome = new(0x2001, 4201, "chrome.exe", @"C:\Program Files\Google\Chrome\Application\chrome.exe", "Example Domain - Google Chrome", "Chrome", "Chrome_WidgetWin_1", false);
    public static readonly ForegroundApp VsCode = new(0x3001, 4301, "Code.exe", @"C:\Users\Example\AppData\Local\Programs\Microsoft VS Code\Code.exe", "main.example.ts - demo - Visual Studio Code", null, "Chrome_WidgetWin_1", false);
    public static readonly ForegroundApp Terminal = new(0x4001, 4401, "WindowsTerminal.exe", @"C:\Program Files\WindowsApps\Example\WindowsTerminal.exe", "pwsh in ~/src/example", "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App", "CASCADIA_HOSTING_WINDOW_CLASS", false);
    public static readonly ForegroundApp Notepad = new(0x5001, 4501, "notepad.exe", @"C:\Windows\System32\notepad.exe", "notes.txt - Notepad", null, "Notepad", false);
    public static readonly ForegroundApp Explorer = new(0x6001, 4601, "explorer.exe", @"C:\Windows\explorer.exe", "Documents", null, "CabinetWClass", false);
}

/// <summary>Packs for tests: the shipped ones (embedded) and fixtures built from JSON text.</summary>
public static class TestPacks
{
    private static readonly Lazy<PackLibrary> Shipped = new(() =>
    {
        var lib = new PackLibrary(PackLibrary.Embedded);
        lib.Reload();
        return lib;
    });

    public static PackLibrary Library => Shipped.Value;
    public static IReadOnlyList<ContextPack> All => Shipped.Value.Packs;
    public static ContextPack Get(string id) => Shipped.Value.Find(id) ?? throw new AssertException($"pack {id} did not load");

    /// <summary>Loads packs from JSON texts (each a full pack or an override), returning the library.</summary>
    public static PackLibrary FromJson(params (string Name, PackOrigin Origin, string Json)[] files)
    {
        var lib = new PackLibrary(() => files.Select(f => new PackSourceFile(f.Name, f.Origin, f.Json)));
        lib.Reload();
        return lib;
    }

    /// <summary>A minimal valid pack (fictional app) to mutate in policy/validator tests.</summary>
    public static JsonObject Minimal(string id = "example-app", string policyClass = "desktop-app", bool sight = false, bool closedLoop = false, string input = "allowed") => new()
    {
        ["schemaVersion"] = 1,
        ["id"] = id,
        ["name"] = "Example App",
        ["kind"] = "app",
        ["packVersion"] = "0.1.0",
        ["verifiedAgainst"] = new JsonObject { ["version"] = "1.0", ["date"] = "2026-10-16", ["method"] = "official-docs" },
        ["policy"] = new JsonObject { ["class"] = policyClass, ["input"] = input, ["sight"] = sight ? "allowed" : "forbidden", ["closedLoop"] = closedLoop ? "allowed" : "forbidden" },
        ["keyMode"] = "vk",
        ["match"] = new JsonObject { ["any"] = new JsonArray(new JsonObject { ["process"] = "ExampleApp.exe" }) },
        ["contexts"] = new JsonArray(new JsonObject { ["id"] = "main", ["label"] = "Main", ["default"] = true, ["detect"] = new JsonObject { ["all"] = new JsonArray(new JsonObject { ["type"] = "always" }) }, ["confidence"] = "official" }),
        ["verbs"] = new JsonArray(
            Verb("app.save", "SAVE", "primary", 90, new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+S" }),
            Verb("app.undo", "UNDO", "primary", 80, new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+Z" })),
        ["userBindings"] = new JsonObject { ["storage"] = "none", ["summary"] = "none", ["confidence"] = "official" },
        ["sources"] = new JsonArray(new JsonObject { ["id"] = "S1", ["title"] = "Example docs", ["url"] = "https://docs.example.com/keys", ["kind"] = "official", ["accessed"] = "2026-10-16" }),
        ["confidence"] = "high",
    };

    public static JsonObject Verb(string id, string label, string category, int priority, JsonObject binding, string safety = "safe", string contexts = "*") => new()
    {
        ["id"] = id, ["label"] = label, ["glyph"] = "check", ["category"] = category, ["priority"] = priority,
        ["contexts"] = new JsonArray(contexts), ["binding"] = binding, ["safety"] = safety,
        ["unavailable"] = new JsonObject { ["label"] = label, ["hint"] = "Example App isn't in front.", ["when"] = new JsonArray("notForeground"), ["style"] = "dim" },
        ["confidence"] = "official", ["sources"] = new JsonArray("S1"),
    };

    public static ContextPack Parse(JsonObject json, List<PackProblem>? problems = null)
    {
        problems ??= [];
        var p = PackParser.Parse(json, problems) ?? throw new AssertException("parse failed: " + string.Join("; ", problems));
        return PackValidator.Validate(p, problems) ?? throw new AssertException("validation rejected the pack: " + string.Join("; ", problems));
    }
}

/// <summary>
/// One Smart Deck engine wired to fakes: a manual clock, a fake foreground, a fake Prism Sight (through the real
/// SightBridge), a verb registry, and Desktop's recording input/mouse senders (nothing reaches the PC).
/// </summary>
public sealed class Rig : IDisposable
{
    public ManualTimeProvider Time { get; } = new();
    public FakeForeground Foreground { get; } = new();
    public FakeSight SightFake { get; }
    public ServiceRegistry Services { get; } = new();
    public SightBridge Sight { get; }
    public VerbRegistry Verbs { get; } = new();
    public RecordingInputSender Input { get; }
    public StampedInput Stamped { get; }
    public RecordingMouseSender Mouse { get; } = new();
    public SmartEngine Engine { get; }
    public List<ContextEvent> Events { get; } = [];
    public SmartPreferences? Saved { get; private set; }
    private IReadOnlyList<ContextPack> _packs;

    public Rig(IReadOnlyList<ContextPack>? packs = null, SmartPreferences? prefs = null, bool withSight = true, SmartEngineOptions? options = null)
    {
        _packs = packs ?? TestPacks.All;
        Input = new RecordingInputSender(null, _ => false, () => Foreground.ForegroundWindow);
        SightFake = new FakeSight(Time);
        if (withSight)
        {
            Services.Add<ISightService>(SightFake);
            Services.Add<ISightControl>(SightFake);
        }
        Sight = new SightBridge(Services);
        Stamped = new StampedInput(Input, Time);
        Engine = new SmartEngine(new SmartEngineParts
        {
            Packs = () => _packs,
            Foreground = Foreground,
            Sight = Sight,
            Verbs = Verbs,
            Input = Stamped,
            Mouse = Mouse,
            Time = Time,
            Preferences = prefs,
            SavePreferences = p => Saved = p,
            Options = options ?? new SmartEngineOptions(),
        });
        Engine.Context.Changed += e => { lock (Events) Events.Add(e); };
        Services.Add(Engine);
    }

    public void SetPacks(IReadOnlyList<ContextPack> packs)
    {
        _packs = packs;
        Engine.PacksChanged();
    }

    /// <summary>Puts an app in front and lets the context settle (debounce + hysteresis).</summary>
    public async Task FrontAsync(ForegroundApp app, int settleMs = 600)
    {
        Foreground.Set(app);
        await AdvanceAsync(settleMs);
    }

    /// <summary>Moves the clock in 10 ms steps, letting queued engine work run between steps.</summary>
    public async Task AdvanceAsync(int ms)
    {
        for (var t = 0; t < ms; t += 10)
        {
            Time.Advance(TimeSpan.FromMilliseconds(Math.Min(10, ms - t)));
            if (Engine.IsBusy) await Task.Delay(1);
            else await Task.Yield();
        }
        await IdleAsync(0);
    }

    /// <summary>Waits for queued presses/turns to finish, advancing the clock through their inter-press gaps.</summary>
    public async Task IdleAsync(int maxAdvanceMs = 5000)
    {
        var advanced = 0;
        for (var i = 0; i < 4000; i++)
        {
            await Task.Delay(1);
            if (!Engine.IsBusy)
            {
                await Engine.WhenIdleAsync();
                if (!Engine.IsBusy) return;
            }
            if (advanced < maxAdvanceMs)
            {
                Time.Advance(TimeSpan.FromMilliseconds(5));
                advanced += 5;
            }
        }
        throw new AssertException("the engine never went idle");
    }

    public IReadOnlyList<string> KeysSent() => [.. Input.Records.Select(r => r.Kind switch
    {
        InputRecordKind.Text => "text:" + r.Text,
        InputRecordKind.KeysDown => "down:" + string.Join("+", r.Keys) + (r.Mode == KeyMode.Scancode ? "/sc" : ""),
        InputRecordKind.KeysUp => "up:" + string.Join("+", r.Keys),
        _ => string.Join("+", r.Keys) + (r.Mode == KeyMode.Scancode ? "/sc" : ""),
    })];

    public void Dispose()
    {
        Engine.Dispose();
        Sight.Dispose();
    }
}
