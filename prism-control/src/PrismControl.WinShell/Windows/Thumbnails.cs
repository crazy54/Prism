namespace PrismControl.WinShell.Switcher;

/// <summary>One encoded thumbnail (JPEG, in memory only: other apps' pixels are never written to disk or logged).</summary>
public sealed record ThumbnailFrame(byte[] Jpeg, int Width, int Height, long Sequence);

/// <summary>What a consumer wants: a size box and the minimum time between frames.</summary>
public sealed record ThumbnailRequest(int MaxWidth, int MaxHeight, TimeSpan Interval);

public enum CaptureState
{
    Starting,
    Live,
    /// <summary>The capture item exists but no frames come (minimized windows give 0 frames).</summary>
    NoFrames,
    /// <summary>Windows.Graphics.Capture refused this window.</summary>
    Failed,
    /// <summary>The window closed.</summary>
    Closed,
    /// <summary>Thumbnails are off (setting, unsupported OS, or borderless capture not allowed).</summary>
    Off,
}

public interface IThumbnailLease : IDisposable
{
    nint Hwnd { get; }
    ThumbnailFrame? Latest { get; }
    CaptureState State { get; }
    ThumbnailRequest Request { get; set; }
    /// <summary>A new frame or a state change (raised on a worker thread: Post to your mailbox).</summary>
    event Action? Updated;
}

/// <summary>Cumulative capture counters (for the budget/CPU report and diagnostics).</summary>
public sealed class ThumbnailStats
{
    private long _arrived, _processed, _delivered, _bytes, _gpuTicks, _encodeTicks;
    public long FramesArrived => Interlocked.Read(ref _arrived);
    public long FramesProcessed => Interlocked.Read(ref _processed);
    public long FramesDelivered => Interlocked.Read(ref _delivered);
    public long BytesDelivered => Interlocked.Read(ref _bytes);
    public TimeSpan ReadbackTime => TimeSpan.FromTicks(Interlocked.Read(ref _gpuTicks));
    public TimeSpan EncodeTime => TimeSpan.FromTicks(Interlocked.Read(ref _encodeTicks));
    public int Sessions;

    internal void Arrived() => Interlocked.Increment(ref _arrived);
    internal void Processed(TimeSpan readback) { Interlocked.Increment(ref _processed); Interlocked.Add(ref _gpuTicks, readback.Ticks); }
    internal void Delivered(int bytes, TimeSpan encode) { Interlocked.Increment(ref _delivered); Interlocked.Add(ref _bytes, bytes); Interlocked.Add(ref _encodeTicks, encode.Ticks); }
}

/// <summary>Raw window capture (Windows.Graphics.Capture in production, synthetic frames in tests).</summary>
public interface IThumbnailSource : IDisposable
{
    /// <summary>WGC is supported and borderless capture is allowed (checked once; no prompt on this PC).</summary>
    Task<bool> EnsureAvailableAsync();
    bool IsAvailable { get; }
    IThumbnailLease Subscribe(nint hwnd, ThumbnailRequest request);
    ThumbnailStats Stats { get; }
}

/// <summary>A lease that never captures (thumbnails off): consumers fall back to the app icon.</summary>
public sealed class OffLease(nint hwnd, ThumbnailRequest request) : IThumbnailLease
{
    public nint Hwnd { get; } = hwnd;
    public ThumbnailFrame? Latest => null;
    public CaptureState State => CaptureState.Off;
    public ThumbnailRequest Request { get; set; } = request;
    public event Action? Updated { add { } remove { } }
    public void Dispose() { }
}
