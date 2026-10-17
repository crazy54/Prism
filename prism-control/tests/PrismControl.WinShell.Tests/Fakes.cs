using System.Collections.Concurrent;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

// Fakes for every reader and writer. Sample data is fictional ("Example" monitors, ".example" apps). Nothing here
// touches the PC.

public static class Samples
{
    /// <summary>A small synthetic JPEG (blue/violet bands), made once with the real encoder.</summary>
    public static readonly byte[] Jpeg = MakeJpeg(136, 85);
    public static readonly byte[] WideJpeg = MakeJpeg(224, 94);
    public static readonly byte[] IconPng = MakeIcon(64, (0x52, 0xac, 0xee));
    public static readonly byte[] IconPng2 = MakeIcon(64, (0xf8, 0xa7, 0x5f));

    public static byte[] MakeJpeg(int w, int h, int seed = 0) => ImageCodec.EncodeJpegAsync(Synthetic(w, h, seed)).GetAwaiter().GetResult();

    /// <summary>A fictional "app window": a title bar, a sidebar, text lines and an accent block.</summary>
    public static BgraImage Synthetic(int w, int h, int seed = 0)
    {
        var img = BgraImage.Create(w, h);
        var p = img.Pixels;
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var i = (y * w + x) * 4;
                (byte r, byte g, byte b) c = y < h / 10 ? ((byte)0x23, (byte)0x26, (byte)0x33)
                    : x < w / 5 ? ((byte)0x16, (byte)0x19, (byte)0x24)
                    : ((byte)0x0e, (byte)0x10, (byte)0x18);
                var row = (y - h / 6) / Math.Max(1, h / 12);
                if (x > w / 4 && y > h / 6 && (y - h / 6) % Math.Max(2, h / 12) < Math.Max(1, h / 30) && x < w / 4 + (w / 2) * ((row * 37 + seed * 11) % 7 + 3) / 9)
                    c = ((byte)0xa2, (byte)0xa4, (byte)0xb4);
                if (x > w * 3 / 5 && x < w * 9 / 10 && y > h / 2 && y < h * 4 / 5)
                    c = seed % 2 == 0 ? ((byte)0x83, (byte)0x9e, (byte)0xf4) : ((byte)0xec, (byte)0x83, (byte)0x98);
                p[i] = c.b; p[i + 1] = c.g; p[i + 2] = c.r; p[i + 3] = 255;
            }
        return img;
    }

    public static byte[] MakeIcon(int size, (byte R, byte G, byte B) color)
    {
        var img = BgraImage.Create(size, size);
        var c = size / 2.0;
        for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var i = (y * size + x) * 4;
                var inside = Math.Abs(x - c) < size * 0.4 && Math.Abs(y - c) < size * 0.4;
                var core = Math.Abs(x - c) < size * 0.18 && Math.Abs(y - c) < size * 0.18;
                img.Pixels[i] = core ? (byte)255 : color.B; img.Pixels[i + 1] = core ? (byte)255 : color.G; img.Pixels[i + 2] = core ? (byte)255 : color.R;
                img.Pixels[i + 3] = inside ? (byte)255 : (byte)0;
            }
        return ImageCodec.EncodePng(img);
    }

    public static WindowInfo Window(nint h, string exe, string title, bool minimized = false, bool elevated = false, bool cloaked = false, int pid = 0) =>
        new(h, pid == 0 ? (int)h + 1000 : pid, exe, $@"C:\Program Files\Example\{exe}", title, null, minimized, false, cloaked, elevated, 1, new RectI(0, 0, 1280, 800));

    public static readonly string UwId = @"\\?\DISPLAY#EXA3401#5&1&UID1#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}";
    public static readonly string Qh32Id = @"\\?\DISPLAY#EXA3202#5&1&UID2#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}";
    public static readonly string Qh27Id = @"\\?\DISPLAY#EXA2703#5&1&UID3#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}";

    /// <summary>Three fictional monitors laid out like a real triple setup (a primary ultrawide, one left, one above).</summary>
    public static List<MonitorInfo> Monitors() =>
    [
        new(Qh32Id, "Example QH32", @"\\.\DISPLAY3", 3, new(-2560, 0, 0, 1440), new(-2560, 0, 0, 1392), false, 96, new DisplayTarget(1, 0, 3), new HdrState(true, true), new DisplayMode(2560, 1440, 165)),
        new(UwId, "Example Ultra UW34", @"\\.\DISPLAY2", 2, new(0, 0, 3440, 1440), new(0, 0, 3440, 1388), true, 96, new DisplayTarget(1, 0, 2), new HdrState(true, false), new DisplayMode(3440, 1440, 240)),
        new(Qh27Id, "Example QH27", @"\\.\DISPLAY1", 1, new(188, -1440, 2748, 0), new(188, -1440, 2748, 0), false, 96, new DisplayTarget(1, 0, 1), new HdrState(false, false), new DisplayMode(2560, 1440, 165)),
    ];
}

// ---------------------------------------------------------------- Desktop interfaces

public sealed class FakeCatalog : IWindowCatalog
{
    public readonly List<WindowInfo> Windows = [];
    public event Action<WindowEvent>? Changed;
    public IReadOnlyList<WindowInfo> AltTabWindows() { lock (Windows) return [.. Windows]; }
    public WindowInfo? Get(nint hwnd) { lock (Windows) return Windows.FirstOrDefault(w => w.Hwnd == hwnd); }
    public void Raise(WindowEventKind kind = WindowEventKind.TitleChanged, nint hwnd = 0) => Changed?.Invoke(new WindowEvent(kind, hwnd));

    public void Set(params WindowInfo[] windows)
    {
        lock (Windows) { Windows.Clear(); Windows.AddRange(windows); }
    }

    public void Update(nint hwnd, Func<WindowInfo, WindowInfo> f)
    {
        lock (Windows)
        {
            var i = Windows.FindIndex(w => w.Hwnd == hwnd);
            if (i >= 0) Windows[i] = f(Windows[i]);
        }
    }
}

public sealed class FakeForeground : IForegroundService
{
    public nint Foreground;
    public nint LastExternal;
    public readonly List<nint> Calls = [];
    public readonly Dictionary<nint, ForegroundResult> Results = [];
    public nint GetForeground() => Foreground;
    public nint LastExternalForeground => LastExternal;

    public Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default)
    {
        lock (Calls) Calls.Add(hwnd);
        var r = Results.TryGetValue(hwnd, out var x) ? x : ForegroundResult.Focused;
        if (r is ForegroundResult.Focused or ForegroundResult.Restored) Foreground = LastExternal = hwnd;
        return Task.FromResult(r);
    }

    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) { lock (Calls) Calls.Add(-pid); return Task.FromResult(true); }
}

/// <summary>Records chords; when linked to <see cref="FakeDesktops"/> it moves the current desktop like Explorer would.</summary>
public sealed class FakeInput : IInputSender
{
    public readonly List<string> Chords = [];
    public FakeDesktops? Desktops;
    public bool Accept = true;

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default)
    {
        var s = string.Join("+", keys.Select(k => ((ushort)k).ToString("X2")));
        lock (Chords) Chords.Add(s);
        if (Accept && Desktops is { } d && keys.Count == 3 && (ushort)keys[0] == 0x5B && (ushort)keys[1] == 0x11)
        {
            if ((ushort)keys[2] == 0x27) d.Current = Math.Min(d.Count - 1, d.Current + 1);
            if ((ushort)keys[2] == 0x25) d.Current = Math.Max(0, d.Current - 1);
        }
        return Task.FromResult(Accept);
    }

    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => SendChordAsync([key], ct);
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) { lock (Chords) Chords.Add("text"); return Task.FromResult(true); }
    public bool TargetIsElevated(nint hwnd) => false;
}

public sealed class FakeIcons : IIconProvider
{
    public int Calls;
    public Task<byte[]?> GetAppIconPngAsync(WindowInfo w, int sizePx, CancellationToken ct = default)
    {
        Interlocked.Increment(ref Calls);
        return Task.FromResult<byte[]?>(w.ProcessName.StartsWith('b') ? Samples.IconPng2 : Samples.IconPng);
    }
}

// ---------------------------------------------------------------- thumbnails

public sealed class FakeThumbs : IThumbnailSource
{
    public readonly List<FakeLease> Leases = [];
    public bool Available = true;
    public ThumbnailStats Stats { get; } = new();
    public bool IsAvailable => Available;
    public Task<bool> EnsureAvailableAsync() => Task.FromResult(Available);

    public IThumbnailLease Subscribe(nint hwnd, ThumbnailRequest request)
    {
        var l = new FakeLease(this, hwnd, request);
        lock (Leases) Leases.Add(l);
        return l;
    }

    public IReadOnlyList<FakeLease> Live { get { lock (Leases) return Leases.Where(l => !l.Disposed).ToList(); } }

    /// <summary>A new frame for every live lease of <paramref name="hwnd"/>.</summary>
    public void Emit(nint hwnd, byte[]? jpeg = null, int w = 136, int h = 85)
    {
        foreach (var l in Live.Where(x => x.Hwnd == hwnd)) l.Push(new ThumbnailFrame(jpeg ?? Samples.Jpeg, w, h, Interlocked.Increment(ref _seq)));
    }

    private long _seq;
    public void Dispose() { }

    public sealed class FakeLease(FakeThumbs owner, nint hwnd, ThumbnailRequest request) : IThumbnailLease
    {
        public bool Disposed;
        public nint Hwnd { get; } = hwnd;
        public ThumbnailFrame? Latest { get; private set; }
        public CaptureState State { get; private set; } = CaptureState.Starting;
        public ThumbnailRequest Request { get; set; } = request;
        public event Action? Updated;
        public void Push(ThumbnailFrame f) { Latest = f; State = CaptureState.Live; Updated?.Invoke(); }
        public void Dispose() { Disposed = true; _ = owner; }
    }
}

// ---------------------------------------------------------------- display

public sealed class FakeDisplayReader : IDisplayReader
{
    public List<MonitorInfo> List = Samples.Monitors();
    public readonly Dictionary<string, List<DisplayMode>> ModeLists = new(StringComparer.OrdinalIgnoreCase)
    {
        [@"\\.\DISPLAY2"] = [.. new[] { 240, 180, 144, 120, 100, 60 }.Select(hz => new DisplayMode(3440, 1440, hz)), new DisplayMode(2560, 1440, 240), new DisplayMode(1920, 1080, 60)],
        [@"\\.\DISPLAY3"] = [.. new[] { 165, 144, 120, 100, 60 }.Select(hz => new DisplayMode(2560, 1440, hz))],
        [@"\\.\DISPLAY1"] = [.. new[] { 165, 144, 120, 60 }.Select(hz => new DisplayMode(2560, 1440, hz))],
    };
    public int MonitorReads, ModeReads;
    public bool HasHdrStateApi { get; set; } = true;

    public IReadOnlyList<MonitorInfo> Monitors() { Interlocked.Increment(ref MonitorReads); lock (List) return [.. List.OrderBy(m => m.Bounds.Left)]; }
    public IReadOnlyList<DisplayMode> Modes(string gdiName) { Interlocked.Increment(ref ModeReads); return ModeLists.TryGetValue(gdiName, out var l) ? l : []; }
    public DisplayMode? CurrentMode(string gdiName) { lock (List) return List.FirstOrDefault(m => m.GdiName == gdiName)?.Mode; }
    public HdrState ReadHdr(DisplayTarget target) { lock (List) return List.FirstOrDefault(m => m.Target == target)?.Hdr ?? HdrState.Unknown; }

    public void Update(string id, Func<MonitorInfo, MonitorInfo> f)
    {
        lock (List)
        {
            var i = List.FindIndex(m => m.Id == id);
            if (i >= 0) List[i] = f(List[i]);
        }
    }
}

/// <summary>Behaves like the driver: HDR and modes change the reader's state (unless told to ignore), every call recorded.</summary>
public sealed class RecordingDisplayWriter(FakeDisplayReader reader) : IDisplayWriter
{
    public readonly List<string> Calls = [];
    public int HdrStatus16, HdrStatus10;
    public bool IgnoreHdr;
    public ModeChangeResult TestResult = ModeChangeResult.Successful;
    /// <summary>Runs inside ApplyMode once the mode has changed: what other threads see while a real (slow) write would still be running.</summary>
    public Action<DisplayMode, bool>? DuringApply;

    public int SetHdr(DisplayTarget target, bool on, bool useHdrStateApi)
    {
        lock (Calls) Calls.Add($"hdr {(on ? "on" : "off")} type {(useHdrStateApi ? 16 : 10)}");
        var status = useHdrStateApi ? HdrStatus16 : HdrStatus10;
        if (status == 0 && !IgnoreHdr)
            foreach (var m in reader.List.Where(m => m.Target == target).ToList()) reader.Update(m.Id, x => x with { Hdr = x.Hdr with { On = on } });
        return status;
    }

    public ModeChangeResult TestMode(string gdiName, DisplayMode mode) { lock (Calls) Calls.Add($"test {mode}"); return TestResult; }

    public ModeChangeResult ApplyMode(string gdiName, DisplayMode mode, bool persist)
    {
        lock (Calls) Calls.Add($"apply {mode}{(persist ? " persist" : "")}");
        foreach (var m in reader.List.Where(m => m.GdiName == gdiName).ToList()) reader.Update(m.Id, x => x with { Mode = mode });
        DuringApply?.Invoke(mode, persist);
        return ModeChangeResult.Successful;
    }
}

/// <summary>An in-memory DDC/CI bus: values per monitor and code; "locked" codes ignore writes (like brightness in HDR).</summary>
public sealed class FakeDdcBus : IDdcBus
{
    public readonly ConcurrentDictionary<(string, byte), (uint Cur, uint Max)> Values = new();
    public readonly HashSet<(string, byte)> Locked = [];
    public readonly HashSet<string> NoDdc = [];
    public string? CapsString = "(prot(monitor)type(LCD)model(EXUW34)cmds(01 02 03 07 0C E3 F3)vcp(02 04 05 08 10 12 14(05 08 0B) 16 18 1A 52 60(0F 11 12 1A) 62 6C 6E 70 86(02 0B) 87 8D(01 02) AC AE B6 C6 C8 CA(01 02) CC(02 03 04 05 07 08 0A 0D 14 1E) D6(01 04 05) DC(01 02 03 04 05) DF E9 FF)mccs_ver(2.0))";
    public int Gets, CapsReads;
    public bool InputStopsAnswering;

    public DdcHandle? Open(MonitorInfo monitor) => NoDdc.Contains(monitor.Id) ? null : new DdcHandle(monitor.Id, monitor.Handle, monitor.Handle + 100, "Generic PnP Monitor");
    public void Close(DdcHandle handle) => handle.GetType();

    public VcpReading? Get(DdcHandle handle, byte code, out int error)
    {
        Interlocked.Increment(ref Gets);
        error = 0;
        if (code == Vcp.InputSource && InputStopsAnswering && Values.TryGetValue((handle.MonitorId, code), out var iv) && iv.Cur != 0x0F) { error = 31; return null; }
        if (Values.TryGetValue((handle.MonitorId, code), out var v)) return new VcpReading(v.Cur, v.Max);
        error = unchecked((int)0xC0262582);
        return null;
    }

    public string? Capabilities(DdcHandle handle, out int error) { Interlocked.Increment(ref CapsReads); error = 0; return CapsString; }

    public void Seed(string monitorId, byte code, uint cur, uint max = 100) => Values[(monitorId, code)] = (cur, max);
}

public sealed class RecordingDdcWriter(FakeDdcBus bus, TimeProvider time) : IDdcWriter
{
    public readonly List<(string Monitor, byte Code, uint Value, long At)> Writes = [];

    public bool Set(DdcHandle handle, byte code, uint value, out int error)
    {
        error = 0;
        lock (Writes) Writes.Add((handle.MonitorId, code, value, time.GetTimestamp()));
        lock (bus.Locked) if (bus.Locked.Contains((handle.MonitorId, code))) return true; // accepted, ignored
        if (bus.Values.TryGetValue((handle.MonitorId, code), out var v)) bus.Values[(handle.MonitorId, code)] = (value, v.Max);
        else bus.Values[(handle.MonitorId, code)] = (value, 100);
        return true;
    }

    public IReadOnlyList<(string Monitor, byte Code, uint Value, long At)> Snapshot() { lock (Writes) return [.. Writes]; }
}

// ---------------------------------------------------------------- placement

public sealed class FakeGeometry : IWindowGeometryReader
{
    public readonly ConcurrentDictionary<nint, WindowGeometry> Windows = new();
    public readonly HashSet<nint> Fullscreen = [];
    public WindowGeometry? Read(nint hwnd) => Windows.TryGetValue(hwnd, out var g) ? g : null;
    public bool IsExclusiveFullscreen(nint hwnd) => Fullscreen.Contains(hwnd);

    /// <summary>A normal window with 7/0/7/7 invisible borders (Win32/Electron here).</summary>
    public WindowGeometry Add(nint hwnd, PixelRect frame, string exe = "editor.exe", bool maximized = false, bool elevated = false, bool hung = false, bool topmost = false)
    {
        var g = new WindowGeometry(hwnd, new PixelRect(frame.Left - 7, frame.Top, frame.Right + 7, frame.Bottom + 7), frame, maximized, false, topmost, elevated, hung, false, exe);
        Windows[hwnd] = g;
        return g;
    }
}

/// <summary>Applies writes to the fake geometry. <see cref="DpiJolt"/>: the first move lands 10% too big (a DPI change), like real apps do.</summary>
public sealed class RecordingWindowWriter(FakeGeometry geometry) : IWindowWriter
{
    public readonly List<string> Calls = [];
    public bool DpiJolt;
    public bool IgnoreTopmost;
    private bool _jolted;

    public bool Restore(nint hwnd) { Log("restore"); Mutate(hwnd, g => g with { Maximized = false, Minimized = false }); return true; }
    public bool Maximize(nint hwnd) { Log("maximize"); Mutate(hwnd, g => g with { Maximized = true }); return true; }

    public bool SetBounds(nint hwnd, PixelRect r)
    {
        Log($"bounds {r.Left},{r.Top},{r.Width}x{r.Height}");
        Mutate(hwnd, g =>
        {
            var frame = new PixelRect(r.Left + 7, r.Top, r.Right - 7, r.Bottom - 7);
            if (DpiJolt && !_jolted)
            {
                _jolted = true;
                frame = PixelRect.FromSize(frame.Left, frame.Top, (int)(frame.Width * 1.1), (int)(frame.Height * 1.1));
            }
            return g with { WindowRect = new PixelRect(frame.Left - 7, frame.Top, frame.Right + 7, frame.Bottom + 7), Frame = frame };
        });
        return true;
    }

    public bool SetTopmost(nint hwnd, bool on) { Log($"topmost {on}"); if (!IgnoreTopmost) Mutate(hwnd, g => g with { Topmost = on }); return true; }

    private void Log(string s) { lock (Calls) Calls.Add(s); }
    private void Mutate(nint h, Func<WindowGeometry, WindowGeometry> f) { if (geometry.Windows.TryGetValue(h, out var g)) geometry.Windows[h] = f(g); }
}

// ---------------------------------------------------------------- desktops, game

public sealed class FakeDesktops : IVirtualDesktopReader
{
    public int Count = 3;
    public int Current;
    public List<string> Names = ["Desktop 1", "Studio", "Desktop 3"];
    public int Reads;
    public DesktopsState Read() { Interlocked.Increment(ref Reads); return new DesktopsState(Count, Current, Names.Take(Count).ToList()); }
}

public sealed class FakeGame : IGameStateReader
{
    public GameState State = GameState.Idle;
    public GameState Read() => State;
    public void Dispose() { }
}

// ---------------------------------------------------------------- tripwires (safe mode must never reach these)

public sealed class TripwireException : Exception
{
    /// <summary>Every trip, even when a handler or a background task swallowed the exception.</summary>
    public static int Trips;
    public static readonly List<string> What = [];

    public TripwireException(string what) : base($"safe mode reached a real writer: {what}")
    {
        Interlocked.Increment(ref Trips);
        lock (What) What.Add(what);
    }
}

public sealed class TripwireDisplayWriter : IDisplayWriter
{
    public int SetHdr(DisplayTarget target, bool on, bool useHdrStateApi) => throw new TripwireException("SetHdr");
    public ModeChangeResult TestMode(string gdiName, DisplayMode mode) => throw new TripwireException("TestMode");
    public ModeChangeResult ApplyMode(string gdiName, DisplayMode mode, bool persist) => throw new TripwireException("ApplyMode");
}

public sealed class TripwireDdcWriter : IDdcWriter
{
    public bool Set(DdcHandle handle, byte code, uint value, out int error) => throw new TripwireException("SetVCPFeature");
}

public sealed class TripwireWindowWriter : IWindowWriter
{
    public bool Restore(nint hwnd) => throw new TripwireException("Restore");
    public bool Maximize(nint hwnd) => throw new TripwireException("Maximize");
    public bool SetBounds(nint hwnd, PixelRect windowRect) => throw new TripwireException("SetWindowPos");
    public bool SetTopmost(nint hwnd, bool on) => throw new TripwireException("SetTopmost");
}

public sealed class TripwireForeground(IForegroundService reads) : IForegroundService
{
    public nint GetForeground() => reads.GetForeground();
    public nint LastExternalForeground => reads.LastExternalForeground;
    public Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) => throw new TripwireException("BringToFront");
    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) => throw new TripwireException("GrantForeground");
}

public sealed class TripwireInput : IInputSender
{
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => throw new TripwireException("SendInput chord");
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => throw new TripwireException("SendInput key");
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => throw new TripwireException("SendInput text");
    public bool TargetIsElevated(nint hwnd) => false;
}
