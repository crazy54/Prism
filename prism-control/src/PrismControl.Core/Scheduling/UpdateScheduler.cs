using System.Text.Json.Nodes;

namespace PrismControl.Core.Scheduling;

public enum UpdateKind { Image, Title, Feedback, FeedbackLayout }

/// <summary>How urgently a context's pending update should be drawn.</summary>
public enum UpdatePriority
{
    /// <summary>Stats and idle polling: at most <see cref="SchedulerOptions.BackgroundMaxHz"/> per context, served last.</summary>
    Background = 0,
    /// <summary>Default: at most <see cref="SchedulerOptions.NormalMaxHz"/> per context.</summary>
    Normal = 1,
    /// <summary>The user is pressing/turning this control: up to <see cref="SchedulerOptions.InteractiveMaxHz"/>, served first.</summary>
    Interactive = 2,
}

/// <summary>
/// Scheduler settings. The Stream Deck app queues (never drops) above ~230-300 updates/s in total and its watchdog
/// kills plugins that flood it; the Prism plugin shares that ceiling, so Prism Control defaults to 60/s in total.
/// </summary>
public sealed record SchedulerOptions
{
    /// <summary>Global budget for setImage + setFeedback + setFeedbackLayout + setTitle, across all devices.</summary>
    public double UpdatesPerSecond { get; init; } = 60;
    /// <summary>Token-bucket depth (0 = automatic: max(4, budget / 4)). Lets a profile switch draw every key at once.</summary>
    public double Burst { get; init; }
    public double InteractiveMaxHz { get; init; } = 30;
    public double NormalMaxHz { get; init; } = 10;
    public double BackgroundMaxHz { get; init; } = 2;
    /// <summary>How long after a key/dial/touch event a context counts as interactive.</summary>
    public TimeSpan InteractiveWindow { get; init; } = TimeSpan.FromMilliseconds(1500);
    /// <summary>After willAppear, the first frame is served as interactive for this long (fast first draw).</summary>
    public TimeSpan AppearBoost { get; init; } = TimeSpan.FromMilliseconds(500);

    public const double MinBudget = 5;
    public const double MaxBudget = 240;

    public double EffectiveBurst => Burst > 0 ? Burst : Math.Max(4, UpdatesPerSecond / 4);

    public SchedulerOptions Normalize() => this with
    {
        UpdatesPerSecond = Math.Clamp(UpdatesPerSecond, MinBudget, MaxBudget),
        InteractiveMaxHz = Math.Clamp(InteractiveMaxHz, 1, 60),
        NormalMaxHz = Math.Clamp(NormalMaxHz, 0.5, 60),
        BackgroundMaxHz = Math.Clamp(BackgroundMaxHz, 0.1, 60),
    };
}

/// <summary>One protocol command produced by the scheduler.</summary>
public sealed record ScheduledUpdate(string Context, UpdateKind Kind, JsonObject Payload)
{
    public string Event => Kind switch
    {
        UpdateKind.Image => "setImage",
        UpdateKind.Title => "setTitle",
        UpdateKind.Feedback => "setFeedback",
        _ => "setFeedbackLayout",
    };
}

public readonly record struct PumpResult(IReadOnlyList<ScheduledUpdate> Updates, TimeSpan? NextWake);

public sealed record SchedulerStats
{
    public long Enqueued { get; init; }
    public long Sent { get; init; }
    public long Coalesced { get; init; }
    public long SkippedUnchanged { get; init; }
    public int SentLastSecond { get; init; }
    public int PendingContexts { get; init; }
    public double BudgetPerSecond { get; init; }
    public double MaxLatencyMs { get; init; }
    public double AvgLatencyMs { get; init; }
}

/// <summary>
/// The render-update scheduler: every setImage / setFeedback / setFeedbackLayout / setTitle goes through it.
/// <list type="bullet">
/// <item>A global token bucket (default 60 updates/s).</item>
/// <item>Latest-wins per context (and per image state/target); feedback keys merge, newest value per key.</item>
/// <item>Only changed payloads are sent (compared with what was last sent to that context).</item>
/// <item>Contexts with recent input jump the queue and may update faster; idle/background contexts are polled slowly.</item>
/// <item>setFeedbackLayout is ordered before the feedback that follows it.</item>
/// </list>
/// Pure and thread-safe: the host calls <see cref="Pump"/> with the current time and sends what it returns.
/// </summary>
public sealed class UpdateScheduler
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Slot> _slots = new(StringComparer.Ordinal);
    private readonly Queue<TimeSpan> _recentSends = new();
    private SchedulerOptions _options;
    private double _tokens;
    private TimeSpan _lastRefill;
    private bool _started;
    private long _enqueued, _sent, _coalesced, _skipped;
    private double _maxLatencyMs, _avgLatencyMs;

    public UpdateScheduler(SchedulerOptions? options = null)
    {
        _options = (options ?? new SchedulerOptions()).Normalize();
        _tokens = _options.EffectiveBurst;
    }

    public SchedulerOptions Options { get { lock (_gate) return _options; } }

    public void UpdateOptions(SchedulerOptions options)
    {
        lock (_gate)
        {
            _options = options.Normalize();
            _tokens = Math.Min(_tokens, _options.EffectiveBurst);
        }
    }

    // ------------------------------------------------------------------ enqueue

    public void EnqueueImage(string context, string? image, int? state, int target, UpdatePriority priority, TimeSpan now)
    {
        lock (_gate)
        {
            _enqueued++;
            var slot = GetSlot(context);
            var key = (state ?? -1, target);
            var known = slot.SentImages.TryGetValue(key, out var sent);
            if (known && sent == image)
            {
                if (slot.PendingImages.Remove(key)) _coalesced++;
                slot.Settle();
                _skipped++;
                return;
            }
            if (slot.PendingImages.ContainsKey(key)) _coalesced++;
            slot.PendingImages[key] = image;
            slot.Touch(priority, now);
        }
    }

    public void EnqueueTitle(string context, string? title, int? state, int target, UpdatePriority priority, TimeSpan now)
    {
        lock (_gate)
        {
            _enqueued++;
            var slot = GetSlot(context);
            var key = (state ?? -1, target);
            if (slot.SentTitles.TryGetValue(key, out var sent) && sent == title)
            {
                if (slot.PendingTitles.Remove(key)) _coalesced++;
                slot.Settle();
                _skipped++;
                return;
            }
            if (slot.PendingTitles.ContainsKey(key)) _coalesced++;
            slot.PendingTitles[key] = title;
            slot.Touch(priority, now);
        }
    }

    /// <summary>Merges feedback keys into the pending payload; keys whose value equals what was last sent are dropped.</summary>
    public void EnqueueFeedback(string context, JsonObject payload, UpdatePriority priority, TimeSpan now)
    {
        lock (_gate)
        {
            _enqueued++;
            var slot = GetSlot(context);
            var any = false;
            foreach (var (key, value) in payload)
            {
                var json = value?.ToJsonString() ?? "null";
                if (slot.SentFeedback.TryGetValue(key, out var sent) && sent == json)
                {
                    if (slot.PendingFeedback.Remove(key)) _coalesced++;
                    continue;
                }
                if (slot.PendingFeedback.ContainsKey(key)) _coalesced++;
                slot.PendingFeedback[key] = (json, value?.DeepClone());
                any = true;
            }
            if (!any) { slot.Settle(); _skipped++; return; }
            slot.Touch(priority, now);
        }
    }

    /// <summary>Queues a layout change. Feedback queued earlier (for the old layout) is discarded.</summary>
    public void EnqueueLayout(string context, string layout, UpdatePriority priority, TimeSpan now)
    {
        lock (_gate)
        {
            _enqueued++;
            var slot = GetSlot(context);
            if (slot.PendingLayout is null && slot.SentLayout == layout)
            {
                _skipped++;
                return;
            }
            if (slot.PendingFeedback.Count > 0) { _coalesced += slot.PendingFeedback.Count; slot.PendingFeedback.Clear(); }
            if (slot.PendingLayout is not null) _coalesced++;
            slot.PendingLayout = layout == slot.SentLayout ? null : layout;
            if (slot.PendingLayout is null) { slot.Settle(); _skipped++; return; }
            slot.Touch(priority, now);
        }
    }

    // ------------------------------------------------------------------ lifecycle

    /// <summary>Input arrived on this context: serve it first and faster for <see cref="SchedulerOptions.InteractiveWindow"/>.</summary>
    public void MarkInteractive(string context, TimeSpan now)
    {
        lock (_gate) GetSlot(context).InteractiveUntil = now + _options.InteractiveWindow;
    }

    /// <summary>willAppear: forget what was sent (the app shows the manifest default again) and boost the first draw.</summary>
    public void Invalidate(string context, TimeSpan now)
    {
        lock (_gate)
        {
            var slot = GetSlot(context);
            slot.SentImages.Clear();
            slot.SentTitles.Clear();
            slot.SentFeedback.Clear();
            slot.SentLayout = null;
            slot.LastSentAt = TimeSpan.MinValue;
            var boost = now + _options.AppearBoost;
            if (boost > slot.InteractiveUntil) slot.InteractiveUntil = boost;
        }
    }

    /// <summary>willDisappear: drop everything for the context.</summary>
    public void Forget(string context)
    {
        lock (_gate) _slots.Remove(context);
    }

    /// <summary>Connection lost: drop all state (contexts reappear after re-registration).</summary>
    public void Reset()
    {
        lock (_gate) _slots.Clear();
    }

    public bool HasPending(string context)
    {
        lock (_gate) return _slots.TryGetValue(context, out var s) && s.HasPending;
    }

    // ------------------------------------------------------------------ pump

    public PumpResult Pump(TimeSpan now, int maxUpdates = 64)
    {
        lock (_gate)
        {
            Refill(now);
            TrimRecent(now);
            var output = new List<ScheduledUpdate>();
            if (_slots.Count == 0) return new PumpResult(output, null);

            var ready = new List<Slot>();
            foreach (var s in _slots.Values)
                if (s.HasPending && now >= NextAllowed(s, now)) ready.Add(s);
            ready.Sort((a, b) =>
            {
                var pa = Effective(a, now);
                var pb = Effective(b, now);
                if (pa != pb) return pb.CompareTo(pa);
                return a.FirstPendingAt.CompareTo(b.FirstPendingAt);
            });

            foreach (var slot in ready)
            {
                if (_tokens < 1 || output.Count >= maxUpdates) break;
                var sentAny = false;
                var latency = (now - slot.FirstPendingAt).TotalMilliseconds;
                while (_tokens >= 1 && output.Count < maxUpdates && TakeNext(slot, out var update))
                {
                    output.Add(update);
                    _tokens -= 1;
                    _sent++;
                    _recentSends.Enqueue(now);
                    sentAny = true;
                }
                if (sentAny)
                {
                    slot.LastSentAt = now;
                    _maxLatencyMs = Math.Max(_maxLatencyMs, latency);
                    _avgLatencyMs = _avgLatencyMs == 0 ? latency : _avgLatencyMs * 0.95 + latency * 0.05;
                    if (slot.HasPending) slot.PendingSince = now;
                    else slot.Settle();
                }
            }
            return new PumpResult(output, ComputeNextWake(now));
        }
    }

    public SchedulerStats GetStats(TimeSpan now)
    {
        lock (_gate)
        {
            TrimRecent(now);
            return new SchedulerStats
            {
                Enqueued = _enqueued,
                Sent = _sent,
                Coalesced = _coalesced,
                SkippedUnchanged = _skipped,
                SentLastSecond = _recentSends.Count,
                PendingContexts = _slots.Values.Count(s => s.HasPending),
                BudgetPerSecond = _options.UpdatesPerSecond,
                MaxLatencyMs = Math.Round(_maxLatencyMs, 1),
                AvgLatencyMs = Math.Round(_avgLatencyMs, 1),
            };
        }
    }

    // ------------------------------------------------------------------ internals

    private void Refill(TimeSpan now)
    {
        if (!_started) { _started = true; _lastRefill = now; return; }
        var dt = (now - _lastRefill).TotalSeconds;
        if (dt > 0)
        {
            _tokens = Math.Min(_options.EffectiveBurst, _tokens + dt * _options.UpdatesPerSecond);
            _lastRefill = now;
        }
    }

    private void TrimRecent(TimeSpan now)
    {
        var cutoff = now - TimeSpan.FromSeconds(1);
        while (_recentSends.Count > 0 && _recentSends.Peek() <= cutoff) _recentSends.Dequeue();
    }

    private UpdatePriority Effective(Slot s, TimeSpan now) =>
        now < s.InteractiveUntil ? UpdatePriority.Interactive : s.PendingPriority;

    private TimeSpan MinInterval(UpdatePriority p) => TimeSpan.FromSeconds(1.0 / (p switch
    {
        UpdatePriority.Interactive => _options.InteractiveMaxHz,
        UpdatePriority.Normal => _options.NormalMaxHz,
        _ => _options.BackgroundMaxHz,
    }));

    private TimeSpan NextAllowed(Slot s, TimeSpan now) =>
        s.LastSentAt == TimeSpan.MinValue ? TimeSpan.MinValue : s.LastSentAt + MinInterval(Effective(s, now));

    private TimeSpan? ComputeNextWake(TimeSpan now)
    {
        TimeSpan? best = null;
        foreach (var s in _slots.Values)
        {
            if (!s.HasPending) continue;
            var t = NextAllowed(s, now);
            if (t < now) t = now;
            if (best is null || t < best) best = t;
        }
        if (best is null) return null;
        if (_tokens < 1)
        {
            var tokenAt = now + TimeSpan.FromSeconds((1 - _tokens) / _options.UpdatesPerSecond);
            if (tokenAt > best) best = tokenAt;
        }
        // Interactive windows expiring can change ordering but never make work available sooner; no extra wake needed.
        return best;
    }

    private static bool TakeNext(Slot s, out ScheduledUpdate update)
    {
        if (s.PendingLayout is { } layout)
        {
            s.PendingLayout = null;
            s.SentLayout = layout;
            s.SentFeedback.Clear(); // a new layout starts from its own defaults
            update = new ScheduledUpdate(s.Context, UpdateKind.FeedbackLayout, new JsonObject { ["layout"] = layout });
            return true;
        }
        if (s.PendingFeedback.Count > 0)
        {
            var payload = new JsonObject();
            foreach (var (key, (json, node)) in s.PendingFeedback)
            {
                payload[key] = node?.DeepClone();
                s.SentFeedback[key] = json;
            }
            s.PendingFeedback.Clear();
            update = new ScheduledUpdate(s.Context, UpdateKind.Feedback, payload);
            return true;
        }
        if (s.PendingImages.Count > 0)
        {
            var (key, image) = s.PendingImages.First();
            s.PendingImages.Remove(key);
            s.SentImages[key] = image;
            var payload = new JsonObject();
            if (image is not null) payload["image"] = image;
            if (key.Item1 >= 0) payload["state"] = key.Item1;
            if (key.Item2 != 0) payload["target"] = key.Item2;
            update = new ScheduledUpdate(s.Context, UpdateKind.Image, payload);
            return true;
        }
        if (s.PendingTitles.Count > 0)
        {
            var (key, title) = s.PendingTitles.First();
            s.PendingTitles.Remove(key);
            s.SentTitles[key] = title;
            var payload = new JsonObject();
            if (title is not null) payload["title"] = title;
            if (key.Item1 >= 0) payload["state"] = key.Item1;
            if (key.Item2 != 0) payload["target"] = key.Item2;
            update = new ScheduledUpdate(s.Context, UpdateKind.Title, payload);
            return true;
        }
        update = null!;
        return false;
    }

    private Slot GetSlot(string context)
    {
        if (!_slots.TryGetValue(context, out var s))
        {
            s = new Slot(context);
            _slots[context] = s;
        }
        return s;
    }

    private sealed class Slot(string context)
    {
        public string Context { get; } = context;
        public readonly Dictionary<(int, int), string?> PendingImages = new();
        public readonly Dictionary<(int, int), string?> SentImages = new();
        public readonly Dictionary<(int, int), string?> PendingTitles = new();
        public readonly Dictionary<(int, int), string?> SentTitles = new();
        public readonly Dictionary<string, (string Json, JsonNode? Node)> PendingFeedback = new(StringComparer.Ordinal);
        public readonly Dictionary<string, string> SentFeedback = new(StringComparer.Ordinal);
        public string? PendingLayout;
        public string? SentLayout;
        public UpdatePriority PendingPriority = UpdatePriority.Background;
        /// <summary>When the oldest unsent change was queued (null = nothing pending). Used for FIFO fairness and latency.</summary>
        public TimeSpan? PendingSince;
        public TimeSpan LastSentAt = TimeSpan.MinValue;
        public TimeSpan InteractiveUntil = TimeSpan.MinValue;

        public bool HasPending => PendingLayout is not null || PendingFeedback.Count > 0 || PendingImages.Count > 0 || PendingTitles.Count > 0;
        public TimeSpan FirstPendingAt => PendingSince ?? TimeSpan.MaxValue;

        public void Touch(UpdatePriority priority, TimeSpan now)
        {
            PendingSince ??= now;
            if (priority > PendingPriority) PendingPriority = priority;
        }

        /// <summary>Call after anything was removed from the pending sets.</summary>
        public void Settle()
        {
            if (HasPending) return;
            PendingSince = null;
            PendingPriority = UpdatePriority.Background;
        }
    }
}
