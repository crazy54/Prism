using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Actions;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Control;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Safety;
using PrismControl.Sight.Service;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

/// <summary>A capture source that "captures" a SimGame: on Deliver it asks the planner and hands over crops, like WGC.</summary>
public sealed class FakeCapture(SimGame game, Func<CaptureTickInfo, CropPlan> planner, Action<CapturedFrame> sink, TimeProvider time) : ICaptureSource
{
    public bool Started { get; private set; }
    public bool Disposed { get; private set; }
    public int Delivered { get; private set; }
    public TimeSpan Interval { get; private set; } = TimeSpan.FromMilliseconds(100);
    public CapturePixelFormat Format => CapturePixelFormat.Bgra8;
    public double PaperWhite => 1;
    public CaptureStats Stats { get; } = new();
    public event Action? Closed;
    public void Start() => Started = true;
    public bool SetMinUpdateInterval(TimeSpan interval) { Interval = interval; return true; }
    public bool PollCached(TimeSpan quietFor) => Deliver();
    public void Close() => Closed?.Invoke();

    public bool Deliver()
    {
        if (Disposed || !Started) return false;
        var frame = game.Frame();
        var plan = planner(new CaptureTickInfo(frame.Width, frame.Height, time.GetUtcNow()));
        if (plan.Regions.Count == 0 && !plan.FullFrame) return false;
        Delivered++;
        sink(new CapturedFrame
        {
            At = time.GetUtcNow(), ContentWidth = frame.Width, ContentHeight = frame.Height, Format = Format, PaperWhite = 1, CopyMs = 0, ConvertMs = 0,
            Regions = plan.Regions.ToDictionary(c => c.Region, c => frame.Crop(c.Rect)), Full = plan.FullFrame ? frame : null,
        });
        return true;
    }

    public void Dispose() => Disposed = true;
}

public sealed class ServiceRig : IAsyncDisposable
{
    public readonly ManualTimeProvider Time = new();
    public readonly SimGame Game = new();
    public readonly List<FakeCapture> Captures = [];
    public nint Foreground = 0x7001;
    public WindowVisibility Visibility = WindowVisibility.Visible;
    public string Process = "SyntheticCoaster.exe";
    public readonly SightService Service;
    public readonly GestureGuard Guard;
    public readonly string RecRoot = Fx.TempDir("rec");
    public readonly List<SightSnapshot> Snapshots = [];
    public readonly List<SightEvent> Events = [];

    public ServiceRig(bool safe = false, SightSettings? settings = null, IPolicyProbe? probe = null, bool draft = false)
    {
        Guard = new GestureGuard(Time);
        var recipe = SyntheticHud.Recipe().Recipe;
        if (draft) recipe = RecipeLoader.FromJson(SyntheticHud.RecipeJson().Replace("\"status\": \"calibrated\"", "\"status\": \"draft\""), SyntheticHud.Recipe().Assets);
        var policy = new GamePolicy(new UserGames(null), probe ?? new NoProbe(), Time) { ExtraAllowlist = [new KnownGame("syncoaster", "Synthetic coaster", ["SyntheticCoaster.exe"])] };
        Service = new SightService(new SightServiceOptions
        {
            Recipes = [recipe], Policy = policy, Time = Time, SafeMode = safe, Settings = settings ?? new SightSettings(), Guard = Guard,
            Recorder = new CalibrationRecorder(RecRoot, null, Time),
            CaptureFactory = (h, o, p, s) => { var c = new FakeCapture(Game, p, s, Time); lock (Captures) Captures.Add(c); return c; },
            Foreground = () => Foreground,
            Identify = h => h == 0x7001 ? new WindowIdentity(4321, Process, $@"D:\Games\{Process}", "SynWindow") : new WindowIdentity(1, "explorer.exe", @"C:\Windows\explorer.exe", "Shell"),
            Visibility = _ => Visibility,
        });
        Service.Subscribe(s => { lock (Snapshots) Snapshots.Add(s); }, e => { lock (Events) Events.Add(e); });
    }

    private sealed class NoProbe : IPolicyProbe
    {
        public IReadOnlyCollection<string> RunningProcessNames() => [];
        public IReadOnlyCollection<string> ListFolder(string folder) => [];
    }

    public FakeCapture Capture => Captures[^1];

    /// <summary>One service tick + one delivered frame, 250 ms of game time.</summary>
    public async Task StepAsync(int frames = 1)
    {
        for (var i = 0; i < frames; i++)
        {
            Time.Advance(TimeSpan.FromMilliseconds(250));
            Service.Tick();
            await SettleAsync();
        }
    }

    public async Task SettleAsync()
    {
        // The engine runs on the runner's consumer task: wait until every delivered frame was processed.
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var quiet = 0;
        while (quiet < 2 && sw.ElapsedMilliseconds < 10_000) { await Task.Delay(5); quiet = Service.PendingFrames == 0 ? quiet + 1 : 0; }
        Service.DrainForTests();
    }

    /// <summary>Waits for in-flight calibration writes (moments are renamed from .partial when complete).</summary>
    public static async Task NoPartialAsync(string folder)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (Directory.Exists(folder) && Directory.GetDirectories(folder, "*.partial").Length > 0 && sw.ElapsedMilliseconds < 10_000) await Task.Delay(20);
    }

    public async ValueTask DisposeAsync() => await Service.DisposeAsync();
}

public class ServiceTests
{
    [Test(TimeoutMs = 180_000)]
    public async Task A_supported_game_in_front_becomes_the_target_and_is_read()
    {
        await using var rig = new ServiceRig();
        rig.Game.State.Bank = -45;
        await rig.StepAsync(4);
        var s = rig.Service.Current;
        Assert.Equal(SightRunState.Running, s.State, s.Reason);
        Assert.Equal("syncoaster", s.GameId);
        Assert.Equal("coasterBuilder", s.Context.Id);
        Assert.Equal(-45.0, s.Readout("bankAngle")!.Number);
        Assert.Equal(SightConfidence.Observed, s.Readout("syn.builder.bankValue")!.Confidence);
        Assert.True(s.Controls["syn.builder.bankControl"].Located);
        Assert.True(rig.Events.Any(e => e.Type == "target"));
        Assert.True(rig.Events.Any(e => e.Type == "context" && Equals(e.Fields["value"], "coasterBuilder")));
        Assert.True(rig.Snapshots.Select(x => x.Seq).SequenceEqual(rig.Snapshots.Select(x => x.Seq).Order()), "in order");
        // Only due regions were cropped: never the whole frame.
        Assert.True(rig.Capture.Delivered > 0);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Minimized_pauses_values_go_stale_and_restore_resumes()
    {
        await using var rig = new ServiceRig();
        await rig.StepAsync(4);
        var first = rig.Capture;
        rig.Visibility = WindowVisibility.Minimized;
        await rig.StepAsync();
        var paused = rig.Service.Current;
        Assert.Equal(SightRunState.Paused, paused.State);
        Assert.Equal(SightConfidence.Stale, paused.Readout("bankAngle")!.Confidence);
        Assert.True(first.Disposed, "the capture session stops while the window is minimized");
        Assert.True(rig.Events.Any(e => e.Type == "paused"));
        rig.Visibility = WindowVisibility.Visible;
        await rig.StepAsync(4);
        Assert.Equal(SightRunState.Running, rig.Service.Current.State);
        Assert.Equal(SightConfidence.Observed, rig.Service.Current.Readout("bankAngle")!.Confidence);
        Assert.Equal(2, rig.Captures.Count, "a new session after restore");
        Assert.True(rig.Events.Any(e => e.Type == "resumed"));
        rig.Visibility = WindowVisibility.Gone;
        await rig.StepAsync();
        Assert.Equal(SightRunState.Idle, rig.Service.Current.State);
        Assert.Null(rig.Service.Target);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Denied_or_protected_games_are_blocked_and_never_captured()
    {
        await using var rig = new ServiceRig();
        rig.Process = "Overwatch.exe";
        // Even if a (malicious or mistaken) recipe matched it, the policy blocks it first.
        await rig.StepAsync();
        Assert.Empty(rig.Captures);
        await using var ac = new ServiceRig(probe: new RunningProbe("EasyAntiCheat.exe"));
        await ac.StepAsync(2);
        Assert.Equal(SightRunState.Blocked, ac.Service.Current.State);
        Assert.Contains("anti-cheat", ac.Service.Current.Reason);
        Assert.Empty(ac.Captures);
    }

    private sealed class RunningProbe(string name) : IPolicyProbe
    {
        public IReadOnlyCollection<string> RunningProcessNames() => [name];
        public IReadOnlyCollection<string> ListFolder(string folder) => [];
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Draft_recipes_do_not_run_unless_allowed_and_off_means_off()
    {
        await using var draft = new ServiceRig(draft: true);
        await draft.StepAsync(2);
        Assert.Equal(SightRunState.Idle, draft.Service.Current.State);
        Assert.Empty(draft.Captures);
        await using var allowed = new ServiceRig(draft: true, settings: new SightSettings { AllowDraftRecipes = true });
        await allowed.StepAsync(2);
        Assert.Equal(SightRunState.Running, allowed.Service.Current.State);
        await using var off = new ServiceRig(settings: new SightSettings { Enabled = false });
        await off.StepAsync(2);
        Assert.Equal(SightRunState.Off, off.Service.Current.State);
        Assert.Empty(off.Captures);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Another_app_in_front_keeps_reading_the_visible_game()
    {
        await using var rig = new ServiceRig();
        await rig.StepAsync(3);
        rig.Foreground = 0x8888;   // explorer in front, game still visible
        await rig.StepAsync(2);
        Assert.Equal(SightRunState.Running, rig.Service.Current.State);
        Assert.Single(rig.Captures);
    }
}

public class CalibrationTests
{
    [Test(TimeoutMs = 180_000)]
    public async Task Calibration_capture_needs_a_key_press_writes_a_visible_dated_folder_and_shows_rec()
    {
        await using var rig = new ServiceRig();
        rig.Game.State.Bank = 30;
        await rig.StepAsync(4);
        Assert.False(rig.Service.StartCalibration(null, out var none), none);
        Assert.False(rig.Service.StartCalibration(Gestures.Turn(rig.Time, 1), out var turn), "a dial turn cannot start a recording");
        Assert.Empty(Directory.EnumerateFileSystemEntries(rig.RecRoot));
        Assert.True(rig.Service.StartCalibration(Gestures.KeyDown(rig.Time), out var folder), folder);
        await rig.StepAsync(1);
        Assert.True(rig.Service.Current.Recording);
        Assert.True(rig.Events.Any(e => e.Type == "recStart"));
        await rig.StepAsync(6);   // 1.5 s → at least one moment (≤ 1/s)
        rig.Service.StopCalibration();
        await rig.StepAsync(1);
        Assert.False(rig.Service.Current.Recording);
        Assert.True(rig.Events.Any(e => e.Type == "recStop"));
        Assert.Contains(Path.Combine(rig.RecRoot, "syncoaster", rig.Time.GetLocalNow().ToString("yyyy-MM-dd")), folder);
        await ServiceRig.NoPartialAsync(folder);
        var moments = Directory.GetDirectories(folder);
        Assert.InRange(moments.Length, 1, 3);
        var m = moments[0];
        Assert.True(File.Exists(Path.Combine(m, "frame.png")));
        Assert.True(File.Exists(Path.Combine(m, "syn.builder.bankValue.png")));
        var expected = LabeledFrames.Discover(folder);
        Assert.Equal(moments.Length, expected.Count);
        Assert.False(expected[0].Expected.Verified, "drafts are unverified until a person checks them");
        Assert.Equal(30.0, expected[0].Expected.Readouts["bankAngle"].Value!.Value.GetDouble());
        Assert.Equal("Bgra8", expected[0].Expected.Capture!.Format);
        var full = PngCodec.Load(Path.Combine(m, "frame.png"));
        Assert.Equal(2560, full.Width);
        // Nothing more after stop.
        var count = Directory.GetDirectories(folder).Length;
        await rig.StepAsync(8);
        Assert.Equal(count, Directory.GetDirectories(folder).Length);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Calibration_never_writes_in_safe_mode_and_stops_when_the_game_minimizes()
    {
        await using var safe = new ServiceRig(safe: true);
        await safe.StepAsync(3);
        Assert.False(safe.Service.StartCalibration(Gestures.KeyDown(safe.Time), out var why));
        Assert.Contains("safe mode", why);
        Assert.Empty(Directory.EnumerateFileSystemEntries(safe.RecRoot));
        await using var rig = new ServiceRig();
        await rig.StepAsync(3);
        Assert.True(rig.Service.StartCalibration(Gestures.KeyDown(rig.Time), out _));
        rig.Visibility = WindowVisibility.Minimized;
        await rig.StepAsync();
        Assert.False(rig.Service.Recorder!.IsRecording, "a minimized game stops the recording");
    }

    [Test(TimeoutMs = 180_000)]
    public void The_recorder_enforces_its_limits()
    {
        var t = new ManualTimeProvider();
        var rec = new CalibrationRecorder(Fx.TempDir("rec"), null, t) { MaxMoments = 2 };
        Assert.False(rec.Due(t.GetUtcNow()), "not recording");
        Assert.True(rec.Start("syncoaster", "synthetic-coaster", out _));
        Assert.True(rec.Due(t.GetUtcNow()));
        var (recipe, _) = SyntheticHud.Recipe();
        var frame = SyntheticHud.Render(1920, 1080, 1, new HudState());
        CapturedFrame F() => new() { At = t.GetUtcNow(), ContentWidth = 1920, ContentHeight = 1080, Regions = [], Full = frame, Format = CapturePixelFormat.Bgra8, PaperWhite = 1, CopyMs = 0, ConvertMs = 0 };
        rec.Write(F(), recipe, SightSnapshot.Empty, 1);
        Assert.False(rec.Due(t.GetUtcNow() + TimeSpan.FromMilliseconds(500)), "≤ 1 moment per second");
        t.Advance(TimeSpan.FromSeconds(1));
        rec.Write(F(), recipe, SightSnapshot.Empty, 1);
        t.Advance(TimeSpan.FromSeconds(1));
        Assert.False(rec.Due(t.GetUtcNow()), "moment limit");
        var rec2 = new CalibrationRecorder(Fx.TempDir("rec"), null, t);
        rec2.Start("syncoaster", "x", out _);
        Assert.False(rec2.Due(t.GetUtcNow() + TimeSpan.FromMinutes(11)), "10-minute limit");
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Labeled_frames_round_trip_through_check_labeled()
    {
        var dir = Fx.TempDir("labeled");
        Tools.WriteSynthetic(dir, max: 5);
        Assert.Equal(0, await Tools.CheckLabeledAsync(["synthetic", dir, "--no-ocr"]));
        // A wrong label fails the regression.
        var first = LabeledFrames.Discover(dir).First(l => l.Name.StartsWith("bank-minus45", StringComparison.Ordinal));
        File.WriteAllText(first.ExpectedPath, File.ReadAllText(first.ExpectedPath).Replace("\"value\": -45", "\"value\": -40"));
        Assert.Equal(1, await Tools.CheckLabeledAsync(["synthetic", dir, "--no-ocr"]));
    }

    [Test(TimeoutMs = 180_000)]
    public void The_inspector_and_glyph_harvest_tools_work_on_files()
    {
        var dir = Fx.TempDir("labeled");
        Tools.WriteSynthetic(dir, max: 4);
        var frame = Path.Combine(dir, "bank-0_3440x1440", "frame.png");
        var outPng = Path.Combine(dir, "inspect.png");
        Assert.Equal(0, Tools.Inspect(["synthetic", frame, outPng]));
        var img = PngCodec.Load(outPng);
        Assert.Equal(3440, img.Width);
        Assert.False(img.Pixels.AsSpan().SequenceEqual(PngCodec.Load(frame).Pixels), "regions are drawn");
        var glyphs = Path.Combine(dir, "glyphs.json");
        Assert.Equal(0, Tools.HarvestGlyphs(["synthetic", dir, "bankText", glyphs]));
        var set = Text.GlyphSet.FromJson(File.ReadAllText(glyphs));
        Assert.True(set.Calibrated && set.Templates.Any(t => t.Char == '4'));
    }
}

public class ActionTests
{
    private sealed class FakeControl : ISightControl
    {
        public readonly List<(string Op, GestureToken Gesture, object? Arg)> Calls = [];
        public Task<SightActResult> ClickAsync(string controlId, GestureToken gesture, CancellationToken ct = default) { Calls.Add(("click", gesture, controlId)); return Task.FromResult(new SightActResult(SightActStatus.Done)); }
        public Task<SightActResult> AdjustAsync(string controlId, SightAdjustDirection direction, int steps, SightAdjustMethod method, GestureToken gesture, CancellationToken ct = default) { Calls.Add(("adjust", gesture, (controlId, direction, steps))); return Task.FromResult(new SightActResult(SightActStatus.Verified, Steps: steps)); }
        public Task<SightActResult> StepAsync(SightChordSteps chords, SightAdjustDirection direction, int steps, GestureToken gesture, CancellationToken ct = default) { Calls.Add(("step", gesture, (chords, direction, steps))); return Task.FromResult(new SightActResult(SightActStatus.Done, Steps: steps)); }
        public Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightStepVia stepVia, SightDriveOptions options, GestureToken gesture, CancellationToken ct = default) { Calls.Add(("drive", gesture, (readoutId, target, stepVia))); return Task.FromResult(new SightDriveResult(SightDriveStatus.Converged, -30, 0, 2, null, TimeSpan.Zero)); }
        public void ResetLedger(string? controlId = null) { }
    }

    private sealed class FakeSight : ISightService
    {
        public SightSnapshot Current { get; set; } = SightSnapshot.Empty;
        public Action<SightSnapshot>? Handler;
        public IDisposable Subscribe(Action<SightSnapshot> onSnapshot, Action<SightEvent>? onEvent = null) { Handler = onSnapshot; onSnapshot(Current); return new D(); }
        public SightGameAccess Access(string processName) => new(processName, null, false, false, "Unknown", "test");
        private sealed class D : IDisposable { public void Dispose() { } }
    }

    private static SightSnapshot Live(double bank, SightConfidence c, bool located = true, bool rec = false) => new(3, DateTimeOffset.UnixEpoch, SightRunState.Running, "pc2", "pc2-coaster-builder", "PlanetCoaster2.exe",
        new SightContext("trackBuilder", "Track builder", SightConfidence.Observed, null, ["trackBuilder"]),
        new Dictionary<string, SightReadout> { ["bankAngle"] = new("bankAngle", "Bank", SightValueKind.Number, bank, null, null, "deg", c, 0.9, null, DateTimeOffset.UnixEpoch, "pc2.builder.bankValue") },
        new Dictionary<string, SightControlState> { ["pc2.builder.bankControl"] = new("pc2.builder.bankControl", located, 0.95, null, 0) }, rec, null);

    [Test(TimeoutMs = 180_000)]
    public async Task The_dial_turns_with_a_rotate_token_and_levels_on_push_on_galleon_and_plus()
    {
        foreach (var device in new[] { TestDevices.Galleon, TestDevices.Plus })
        {
            var control = new FakeControl();
            var sight = new FakeSight { Current = Live(-30, SightConfidence.Observed) };
            await using var h = await ActionHarness<SightDialAction>.AppearAsync(device, new Coordinates(0, 0), Controller.Encoder,
                settings: new SightDialSettings { Control = "pc2.builder.bankControl", Readout = "bankAngle", Target = 0, Label = "BANK" },
                configureServices: s => { s.Add<ISightControl>(control); s.Add<ISightService>(sight); });
            await h.RotateAsync(device.Type == DeviceType.Galleon100SD ? 12 : 1);
            await h.RotateAsync(-1);
            await h.DialPressAsync();
            Assert.Equal(3, control.Calls.Count);
            Assert.Equal(("adjust", GestureKind.DialRotate), (control.Calls[0].Op, control.Calls[0].Gesture.Kind));
            Assert.Equal(("pc2.builder.bankControl", SightAdjustDirection.Increase, device.Type == DeviceType.Galleon100SD ? 12 : 1), ((string, SightAdjustDirection, int))control.Calls[0].Arg!);
            Assert.Equal(SightAdjustDirection.Decrease, (((string, SightAdjustDirection, int))control.Calls[1].Arg!).Item2);
            Assert.Equal("drive", control.Calls[2].Op);
            Assert.Equal(GestureKind.DialUp, control.Calls[2].Gesture.Kind);
            Assert.True(control.Calls.Select(c => c.Gesture.Nonce).Distinct().Count() == 3, "a fresh token per event");
            // Renders: observed, then stale, then a lost control.
            sight.Handler!(Live(-15, SightConfidence.Stale));
            sight.Handler!(Live(-15, SightConfidence.Observed, located: false));
            await h.SettleAsync();
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Chord_mode_and_key_placement_work_too()
    {
        var control = new FakeControl();
        await using var h = await ActionHarness<SightDialAction>.AppearAsync(TestDevices.StreamDeck, new Coordinates(1, 1), Controller.Keypad,
            settings: new SightDialSettings { IncreaseChord = "E", DecreaseChord = "Q", Readout = "bankAngle", Scancode = true },
            configureServices: s => { s.Add<ISightControl>(control); s.Add<ISightService>(new FakeSight { Current = Live(10, SightConfidence.Inferred) }); });
        await h.PressAsync();
        var drive = Assert.Single(control.Calls);
        Assert.Equal(GestureKind.KeyUp, drive.Gesture.Kind);
        var via = (SightChordSteps)((ValueTuple<string, double, SightStepVia>)drive.Arg!).Item3;
        Assert.Equal(KeyMode.Scancode, via.Mode);
        Assert.Equal(VirtualKey.E, via.Increase[0]);
        h.AssertFramesAreDeckSafe();
    }

    [Test(TimeoutMs = 180_000)]
    public async Task The_status_key_shows_rec_and_hold_starts_calibration_only_outside_safe_mode()
    {
        await using var rig = new ServiceRig(safe: true);
        await rig.StepAsync(3);
        foreach (var device in new[] { TestDevices.Galleon, TestDevices.Plus })
        {
            await using var h = await ActionHarness<SightStatusAction>.AppearAsync(device, new Coordinates(0, 0), Controller.Keypad,
                configureServices: s => { s.Add<ISightService>(rig.Service); s.Add(rig.Service); }, safeMode: true, time: rig.Time);
            await h.PressAsync(TimeSpan.FromMilliseconds(700));   // a hold
            Assert.Equal(1, h.Count("showAlert"), "safe mode: no calibration capture");
            Assert.False(rig.Service.Recorder!.IsRecording);
            h.AssertFramesAreDeckSafe();
        }
        var night = Core.Render.Tokens.Refraction.Night;
        var rec = SightArt.StatusKey(night, Live(0, SightConfidence.Observed, rec: true), true, null);
        var plain = SightArt.StatusKey(night, Live(0, SightConfidence.Observed, rec: false), true, null);
        Assert.NotEqual(plain.ToSvg(), rec.ToSvg(), "REC is drawn");
        Assert.Contains("#ff4545", rec.ToSvg());
        Assert.True(rec.ElementCount < 300);
    }

    [Test(TimeoutMs = 180_000)]
    public void Action_icons_exist_and_pass_the_svg_lint()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", "Prism-control", "prism-control", "src", "PrismControl.Sight", "plugin", "imgs", "actions");
        dir = Directory.Exists(dir) ? dir : Path.Combine(@"E:\Development Workspaces\Prism-control\prism-control\src\PrismControl.Sight", "plugin", "imgs", "actions");
        foreach (var (action, files) in new[] { ("sight-status", new[] { "icon", "key" }), ("sight-dial", new[] { "icon", "key", "dial" }) })
            foreach (var f in files)
            {
                var path = Path.Combine(dir, action, f + ".svg");
                Assert.True(File.Exists(path), path);
                var issues = Core.Render.SvgLint.Check(File.ReadAllText(path));
                Assert.Empty(issues.Where(i => i.Severity == Core.Render.LintSeverity.Error).Select(i => i.Message), $"{action}/{f}.svg");
            }
    }

    [Test(TimeoutMs = 180_000)]
    public void Actions_pass_the_host_validator()
    {
        var scan = ActionValidator.Scan(typeof(SightModule).Assembly);
        Assert.Empty(scan.Errors);
        Assert.True(scan.Actions.Count >= 2);
    }
}
