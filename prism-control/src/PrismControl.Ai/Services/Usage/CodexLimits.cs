using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Services.Usage;

/// <summary>One Codex plan window as the deck shows it. Labeled by its length in minutes (300 = 5H, 10080 = WEEK), never by primary/secondary.</summary>
public sealed record CodexWindowView(int WindowMinutes, string Label, Fact<double> UsedPercent, DateTimeOffset? ResetsAt, bool ResetPassed)
{
    /// <summary>"RESETS 2H 14M" (or "RESET" once the reset time passed, "NO RESET TIME" when the record had none).</summary>
    public string ResetText(DateTimeOffset now) => ResetPassed ? "RESET" : ResetsAt is { } r ? "RESETS " + CodexLimitsService.Countdown(r - now) : "NO RESET TIME";
}

/// <summary>
/// The Codex 5-hour and weekly plan limits, from the Codex session logs only (ai-apps.md §4.2, research [PC]):
/// <c>token_count.rate_limits.{primary,secondary}.{used_percent, window_minutes, resets_at}</c> (old builds:
/// <c>resets_in_seconds</c>). Lines are read with AI1's <see cref="RolloutLineReader"/>, which materializes only those keys and
/// skips every other value without decoding it (no message content, ever).
/// <list type="bullet">
/// <item>Live: AI1's rollout tail reports through <see cref="IAiStatusSink.CodexLimitsObserved"/>.</item>
/// <item>Seed: on the first demand (and on a dial push) the newest rollout files of the last 8 days are read from their tails
/// (last 256 KB each, at most 3 files), because the live tail only catches up on the last 6 hours.</item>
/// <item>Account-wide: the newest record wins per window length, whatever thread wrote it.</item>
/// <item>Confidence: reported (the agent recorded it), valid until <c>resets_at</c>; after the reset passes the value is shown as
/// an inferred <c>~0%</c> ("RESET"), because the window restarted and nothing newer was recorded.</item>
/// </list>
/// </summary>
public sealed class CodexLimitsService
{
    public static readonly TimeSpan SeedWindow = TimeSpan.FromDays(8);
    public const int SeedFiles = 3;
    public const int SeedTailBytes = 256 * 1024;
    public static readonly TimeSpan NoResetTtl = TimeSpan.FromHours(6);

    private readonly string _root;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly Dictionary<int, (CodexLimitWindow Window, DateTimeOffset At)> _windows = [];
    private int _leases;
    private int _seeding;
    private bool _seeded;

    public CodexLimitsService(string sessionsRoot, TimeProvider time, ILog log, IAiStatusSink? sink = null)
    {
        _root = sessionsRoot;
        _time = time;
        _log = log;
        if (sink is not null) sink.CodexLimitsObserved += Observe;
    }

    public event Action? Changed;

    /// <summary>When the newest record was written (null: none seen).</summary>
    public DateTimeOffset? LastRecordAt { get { lock (_gate) return _windows.Count == 0 ? null : _windows.Values.Max(w => w.At); } }

    public bool Seeded { get { lock (_gate) return _seeded; } }

    /// <summary>How seeding runs: inline by default (tests); production uses the thread pool.</summary>
    public Func<Func<Task>, Task> Runner { get; set; } = work => work();

    /// <summary>A visible Codex surface. The first one seeds from the logs (once per run).</summary>
    public IDisposable Demand()
    {
        var first = Interlocked.Increment(ref _leases) == 1;
        if (first && !Seeded) _ = Runner(() => SeedAsync(CancellationToken.None));
        return new Lease(this);
    }

    public bool Demanded => Volatile.Read(ref _leases) > 0;

    /// <summary>A Smart Deck readout read: seeds from the logs once per run (no lease).</summary>
    public void Touch()
    {
        if (!Seeded) _ = Runner(() => SeedAsync(CancellationToken.None));
    }

    public void Observe(CodexRateLimits limits)
    {
        var changed = false;
        lock (_gate)
        {
            foreach (var w in limits.Windows)
            {
                if (w.WindowMinutes <= 0 || !double.IsFinite(w.UsedPercent)) continue;
                if (_windows.TryGetValue(w.WindowMinutes, out var cur) && cur.At > limits.At) continue;   // older than what we have
                _windows[w.WindowMinutes] = (w with { UsedPercent = Math.Clamp(w.UsedPercent, 0, 100) }, limits.At);
                changed = true;
            }
        }
        if (changed) Changed?.Invoke();
    }

    /// <summary>The windows, shortest first (5H, then WEEK).</summary>
    public IReadOnlyList<CodexWindowView> Windows(DateTimeOffset now)
    {
        lock (_gate)
        {
            return _windows.OrderBy(kv => kv.Key).Select(kv =>
            {
                var (w, at) = kv.Value;
                var passed = w.ResetsAt is { } r && r <= now;
                Fact<double> used = passed
                    ? Fact<double>.Inferred(0, FactSource.Rollout, w.ResetsAt!.Value, TimeSpan.Zero)
                    : Fact<double>.Reported(w.UsedPercent, FactSource.Rollout, at, w.ResetsAt is { } rr && rr > at ? rr - at : NoResetTtl);
                return new CodexWindowView(kv.Key, Label(kv.Key), used, w.ResetsAt, passed);
            }).ToList();
        }
    }

    public CodexWindowView? Window(int minutes, DateTimeOffset now) => Windows(now).FirstOrDefault(w => w.WindowMinutes == minutes);

    /// <summary>
    /// Reads the tails of the newest rollout files (keys only) and keeps the newest limits found. Never throws; returns
    /// whether any limits were found. Concurrent calls collapse into one.
    /// </summary>
    public async Task<bool> SeedAsync(CancellationToken ct)
    {
        if (Interlocked.Exchange(ref _seeding, 1) == 1) return false;
        try
        {
            var found = await Task.Run(() => ScanNewest(ct), ct).ConfigureAwait(false);
            lock (_gate) _seeded = true;
            if (found is not null) Observe(found);
            else Changed?.Invoke();
            return found is not null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or OperationCanceledException)
        {
            _log.Debug($"Codex limits seed skipped: {ex.GetType().Name}");
            return false;
        }
        finally { Volatile.Write(ref _seeding, 0); }
    }

    private CodexRateLimits? ScanNewest(CancellationToken ct)
    {
        if (!Directory.Exists(_root)) return null;
        var now = _time.GetUtcNow();
        var files = new List<FileInfo>();
        // Only the date folders of the last 8 days (sessions/YYYY/MM/DD): never a walk of the whole history.
        for (var d = 0; d <= SeedWindow.Days; d++)
        {
            var day = now.ToLocalTime().Date.AddDays(-d);
            var dir = Path.Combine(_root, day.ToString("yyyy"), day.ToString("MM"), day.ToString("dd"));
            if (!Directory.Exists(dir)) continue;
            foreach (var f in Directory.EnumerateFiles(dir, "rollout-*.jsonl")) files.Add(new FileInfo(f));
        }
        CodexRateLimits? best = null;
        foreach (var f in files.OrderByDescending(f => f.LastWriteTimeUtc).Take(SeedFiles))
        {
            ct.ThrowIfCancellationRequested();
            var threadId = RolloutLineReader.ThreadIdFromFileName(f.FullName) ?? "seed";
            var hit = LastLimitsIn(f.FullName, threadId, now);
            if (hit is not null && (best is null || hit.At > best.At)) best = hit;
        }
        return best;
    }

    /// <summary>The newest token_count limits in the last <see cref="SeedTailBytes"/> of one file (lines read newest first).</summary>
    public static CodexRateLimits? LastLimitsIn(string path, string threadId, DateTimeOffset now)
    {
        byte[] buf;
        long start;
        using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            start = Math.Max(0, fs.Length - SeedTailBytes);
            fs.Seek(start, SeekOrigin.Begin);
            buf = new byte[fs.Length - start];
            var read = 0;
            while (read < buf.Length)
            {
                var n = fs.Read(buf, read, buf.Length - read);
                if (n <= 0) break;
                read += n;
            }
            if (read < buf.Length) Array.Resize(ref buf, read);
        }
        var span = buf.AsSpan();
        var end = span.Length;
        while (end > 0)
        {
            var nl = span[..end].LastIndexOf((byte)'\n');
            var lineStart = nl + 1;
            // The first line of a mid-file window is a fragment: skip it.
            if (nl < 0 && start > 0) break;
            var line = span[lineStart..end].TrimEnd((byte)'\r');
            if (line.Length > 0)
            {
                var (_, limits) = RolloutLineReader.TryRead(line, threadId, now);
                if (limits is not null) return limits;
            }
            if (nl < 0) break;
            end = nl;
        }
        return null;
    }

    public static string Label(int minutes) => minutes switch
    {
        300 => "5H",
        10080 => "WEEK",
        < 60 => $"{minutes}M",
        < 1440 when minutes % 60 == 0 => $"{minutes / 60}H",
        _ when minutes % 1440 == 0 => $"{minutes / 1440}D",
        _ => $"{minutes / 60}H",
    };

    /// <summary>"2H 14M", "45M", "3D 4H", "<1M".</summary>
    public static string Countdown(TimeSpan t)
    {
        if (t <= TimeSpan.Zero) return "NOW";
        if (t.TotalMinutes < 1) return "<1M";
        if (t.TotalHours < 1) return $"{(int)t.TotalMinutes}M";
        if (t.TotalDays < 1) return $"{(int)t.TotalHours}H {t.Minutes}M";
        return $"{(int)t.TotalDays}D {t.Hours}H";
    }

    private void Release() => Interlocked.Decrement(ref _leases);

    private sealed class Lease(CodexLimitsService owner) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) owner.Release(); }
    }
}
