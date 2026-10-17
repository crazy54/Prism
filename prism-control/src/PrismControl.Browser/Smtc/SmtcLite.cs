using System.Security.Cryptography;
using PrismControl.Core.Hosting;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace PrismControl.Browser.Smtc;

/// <summary>A browser's Windows media session (SMTC): one per browser app, the active tab only, no tab identity.</summary>
public sealed record SmtcBrowserSession
{
    public required string AppId { get; init; }
    public required string Brand { get; init; }
    public string? Title { get; init; }
    public string? Artist { get; init; }
    public string? Album { get; init; }
    /// <summary>playing, paused or none.</summary>
    public string State { get; init; } = "none";
    public long? DurationMs { get; init; }
    public long? PositionMs { get; init; }
    public DateTimeOffset? PositionAt { get; init; }
    public double Rate { get; init; } = 1;
    public byte[]? Thumbnail { get; init; }
    public string? ThumbnailHash { get; init; }
}

/// <summary>The zero-extension "lite tier": reads the browser media session Windows shows. Read-only by design.</summary>
public interface ISmtcReader : IAsyncDisposable
{
    SmtcBrowserSession? Current { get; }
    event EventHandler? Changed;
    Task StartAsync(CancellationToken ct);
}

public sealed class NoSmtc : ISmtcReader
{
    public static readonly NoSmtc Instance = new();
    public SmtcBrowserSession? Current => null;
    public event EventHandler? Changed { add { } remove { } }
    public Task StartAsync(CancellationToken ct) => Task.CompletedTask;
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

/// <summary>
/// <see cref="ISmtcReader"/> over <c>GlobalSystemMediaTransportControlsSessionManager</c>: follows the first Chromium
/// browser session (Chrome's app id is "Chrome", Edge's "MSEdge"; matched loosely), preferring the current session.
/// It never calls a Try* transport method: there is no write path here at all.
/// </summary>
public sealed class SmtcLiteReader : ISmtcReader
{
    private const int MaxThumbnailBytes = 2 * 1024 * 1024;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _sync = new();
    private GlobalSystemMediaTransportControlsSessionManager? _manager;
    private GlobalSystemMediaTransportControlsSession? _session;
    private ITimer? _debounce;
    private volatile SmtcBrowserSession? _current;
    private bool _disposed;
    private CancellationToken _ct;

    public SmtcLiteReader(ILog log, TimeProvider? time = null)
    {
        _log = log;
        _time = time ?? TimeProvider.System;
    }

    public SmtcBrowserSession? Current => _current;
    public event EventHandler? Changed;

    public static string? BrandFor(string? appId)
    {
        if (string.IsNullOrEmpty(appId)) return null;
        var a = appId.ToLowerInvariant();
        if (a.Contains("msedge") || a == "microsoftedge" || a.StartsWith("microsoft.microsoftedge", StringComparison.Ordinal)) return "Edge";
        if (a.Contains("chrome")) return "Chrome";
        if (a.Contains("brave")) return "Brave";
        if (a.Contains("vivaldi")) return "Vivaldi";
        if (a.Contains("opera")) return "Opera";
        return null;
    }

    public async Task StartAsync(CancellationToken ct)
    {
        _ct = ct;
        var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        lock (_sync)
        {
            if (_disposed) return;
            _manager = manager;
            manager.SessionsChanged += (_, _) => Schedule(TimeSpan.Zero);
            manager.CurrentSessionChanged += (_, _) => Schedule(TimeSpan.Zero);
        }
        await RefreshAsync().ConfigureAwait(false);
    }

    private void Schedule(TimeSpan delay)
    {
        lock (_sync)
        {
            if (_disposed) return;
            _debounce ??= _time.CreateTimer(_ => _ = RefreshAsync(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
            _debounce.Change(delay, Timeout.InfiniteTimeSpan);
        }
    }

    private void OnSessionEvent(GlobalSystemMediaTransportControlsSession s, object e) => Schedule(TimeSpan.FromMilliseconds(120));

    private async Task RefreshAsync()
    {
        try
        {
            await _gate.WaitAsync(_ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { return; }
        try
        {
            Bind();
            var next = _session is { } s ? await ReadAsync(s).ConfigureAwait(false) : null;
            var before = _current;
            _current = next;
            if (!Same(before, next)) Changed?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex) { _log.Debug("SMTC lite refresh failed: " + ex.GetType().Name); }
        finally { _gate.Release(); }
    }

    private void Bind()
    {
        var manager = _manager;
        if (manager is null) return;
        GlobalSystemMediaTransportControlsSession? next = null;
        try
        {
            var current = manager.GetCurrentSession();
            if (current is not null && BrandFor(SafeId(current)) is not null) next = current;
            else next = manager.GetSessions().FirstOrDefault(x => BrandFor(SafeId(x)) is not null);
        }
        catch (Exception ex) { _log.Debug("SMTC lite enumeration failed: " + ex.GetType().Name); }
        if (ReferenceEquals(next, _session)) return;
        if (_session is { } old)
        {
            try
            {
                old.MediaPropertiesChanged -= OnSessionEvent;
                old.PlaybackInfoChanged -= OnSessionEvent;
                old.TimelinePropertiesChanged -= OnSessionEvent;
            }
            catch (Exception) { }
        }
        _session = next;
        if (next is not null)
        {
            next.MediaPropertiesChanged += OnSessionEvent;
            next.PlaybackInfoChanged += OnSessionEvent;
            next.TimelinePropertiesChanged += OnSessionEvent;
        }
    }

    private async Task<SmtcBrowserSession?> ReadAsync(GlobalSystemMediaTransportControlsSession s)
    {
        var appId = SafeId(s);
        var brand = BrandFor(appId);
        if (brand is null) return null;
        var p = await s.TryGetMediaPropertiesAsync();
        var info = s.GetPlaybackInfo();
        var t = s.GetTimelineProperties();
        byte[]? thumb = null;
        if (p.Thumbnail is { } reference)
        {
            try { thumb = await ReadThumbnailAsync(reference).ConfigureAwait(false); }
            catch (Exception ex) { _log.Debug("SMTC lite thumbnail failed: " + ex.GetType().Name); }
        }
        var duration = t.EndTime - t.StartTime;
        return new SmtcBrowserSession
        {
            AppId = appId,
            Brand = brand,
            Title = Clean(p.Title),
            Artist = Clean(p.Artist) ?? Clean(p.AlbumArtist),
            Album = Clean(p.AlbumTitle),
            State = info.PlaybackStatus switch
            {
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => "playing",
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => "paused",
                _ => "none",
            },
            DurationMs = duration > TimeSpan.Zero ? (long)duration.TotalMilliseconds : null,
            PositionMs = (long)Math.Max(0, (t.Position - t.StartTime).TotalMilliseconds),
            PositionAt = t.LastUpdatedTime.Year > 2000 ? t.LastUpdatedTime : _time.GetUtcNow(),
            Rate = info.PlaybackRate is { } r && double.IsFinite(r) && r > 0 ? Math.Min(r, 16) : 1,
            Thumbnail = thumb,
            ThumbnailHash = thumb is null ? null : Convert.ToHexString(SHA256.HashData(thumb), 0, 8).ToLowerInvariant(),
        };
    }

    private static async Task<byte[]> ReadThumbnailAsync(IRandomAccessStreamReference reference)
    {
        using var stream = await reference.OpenReadAsync();
        using var ms = new MemoryStream();
        using (var s = stream.AsStreamForRead())
        {
            var buffer = new byte[32 * 1024];
            int n;
            while ((n = await s.ReadAsync(buffer).ConfigureAwait(false)) > 0)
            {
                ms.Write(buffer, 0, n);
                if (ms.Length > MaxThumbnailBytes) throw new InvalidDataException("thumbnail too large");
            }
        }
        return ms.ToArray();
    }

    private static bool Same(SmtcBrowserSession? a, SmtcBrowserSession? b) =>
        a is null ? b is null : b is not null && a with { Thumbnail = null } == b with { Thumbnail = null };

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : Protocol.WireParser.Truncate(Protocol.WireParser.Clean(s), Protocol.Wire.Limits.Title);

    private static string SafeId(GlobalSystemMediaTransportControlsSession s)
    {
        try { return s.SourceAppUserModelId ?? ""; }
        catch { return ""; }
    }

    public ValueTask DisposeAsync()
    {
        lock (_sync)
        {
            if (_disposed) return ValueTask.CompletedTask;
            _disposed = true;
            _debounce?.Dispose();
            _debounce = null;
        }
        if (_session is { } s)
        {
            try
            {
                s.MediaPropertiesChanged -= OnSessionEvent;
                s.PlaybackInfoChanged -= OnSessionEvent;
                s.TimelinePropertiesChanged -= OnSessionEvent;
            }
            catch (Exception) { }
        }
        _session = null;
        _manager = null;
        return ValueTask.CompletedTask;
    }
}
