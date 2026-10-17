using PrismControl.Core.Hosting;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Detectors;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Engine;

/// <summary>One processed capture: the due regions' images (sRGB8, already HDR-normalized) at one instant.</summary>
public sealed class RegionFrame
{
    public required DateTimeOffset At { get; init; }
    /// <summary>The game's client area size in pixels (what region geometry is computed for).</summary>
    public required int ContentWidth { get; init; }
    public required int ContentHeight { get; init; }
    /// <summary>Region index → image. Regions not in the plan are simply absent.</summary>
    public required IReadOnlyDictionary<int, SightImage> Regions { get; init; }
}

/// <summary>A region the capture should crop now.</summary>
public readonly record struct RegionCrop(int Region, PixelRect Rect);

public sealed class SightEngineOptions
{
    public ITextRecognizer? Ocr { get; init; }
    public ILog Log { get; init; } = NullLog.Instance;
    /// <summary>The user's HUD scale for this game (null = the recipe's).</summary>
    public double? HudScale { get; init; }
    /// <summary>Skip detectors on regions whose pixels did not change (the results stay valid, re-stamped).</summary>
    public bool ChangeGating { get; init; } = true;
    /// <summary>Detector scores below this never produce a value.</summary>
    public double MinScore { get; init; } = 0.5;
}

/// <summary>The latest result of one detector, with where its region was and when it ran.</summary>
public sealed record DetectorSample(DetectorResult Result, DateTimeOffset At, PixelRect RegionRect, bool Reused)
{
    /// <summary>The result's box in content (client-area) pixels.</summary>
    public PixelRect? ContentBox => Result.Box is { } b ? b.Offset(RegionRect.X, RegionRect.Y) : null;
}

/// <summary>
/// Runs one recipe: decides which regions are due (per-region rates, change gating, forced reads), runs their detectors,
/// evaluates contexts with hysteresis and turns detector results into readouts with a confidence (observed / inferred /
/// stale / unknown). Deterministic: time comes only from the frames and the explicit <c>now</c> arguments.
/// </summary>
public sealed class SightEngine : IDetectorFacts
{
    private readonly object _gate = new();
    private readonly SightEngineOptions _o;
    private readonly DateTimeOffset?[] _nextDue;
    private readonly bool[] _forced;
    private readonly int[] _strict;
    private readonly SightImage?[] _lastImage;
    private readonly DateTimeOffset?[] _processedAt;
    private readonly float[]?[] _lastSig;
    private readonly DetectorSample?[] _samples;
    private readonly long[] _runs;
    private readonly double[] _ms;
    private readonly ContextState[] _contexts;
    private readonly ReadoutState[] _readouts;
    private readonly List<TaskCompletionSource> _waiters = [];
    private (int W, int H) _size;
    private bool _paused = true;
    private string? _pauseReason = "not started";
    private DateTimeOffset _now = DateTimeOffset.UnixEpoch;
    private string? _mainContext;
    private DateTimeOffset? _mainSince;
    private long _processed, _skipped;

    public SightEngine(CompiledRecipe recipe, SightEngineOptions? options = null)
    {
        Recipe = recipe;
        _o = options ?? new SightEngineOptions();
        _nextDue = new DateTimeOffset?[recipe.Regions.Count];
        _forced = new bool[recipe.Regions.Count];
        _strict = new int[recipe.Regions.Count];
        _lastImage = new SightImage?[recipe.Regions.Count];
        _processedAt = new DateTimeOffset?[recipe.Regions.Count];
        _lastSig = new float[]?[recipe.Regions.Count];
        _samples = new DetectorSample?[recipe.Detectors.Count];
        _runs = new long[recipe.Detectors.Count];
        _ms = new double[recipe.Detectors.Count];
        _contexts = recipe.Contexts.Select(c => new ContextState(c)).ToArray();
        _readouts = recipe.Readouts.Select(r => new ReadoutState(r)).ToArray();
    }

    public CompiledRecipe Recipe { get; }

    /// <summary>Raised (synchronously, inside ProcessAsync) when a context becomes active or inactive.</summary>
    public event Action<SightEvent>? EventRaised;

    public long FramesProcessed => Interlocked.Read(ref _processed);
    /// <summary>Region evaluations skipped because the pixels did not change.</summary>
    public long RegionsSkipped => Interlocked.Read(ref _skipped);

    public HudGeometry Geometry(int width, int height) => HudGeometry.For(width, height, Recipe.Hud, _o.HudScale);

    /// <summary>One HUD unit in pixels at the current content size (1 before the first frame).</summary>
    public double CurrentUnit { get { lock (_gate) return _size.W > 0 ? Geometry(_size.W, _size.H).Unit : 1; } }

    /// <summary>The content size of the last processed frame.</summary>
    public (int Width, int Height) ContentSize { get { lock (_gate) return _size; } }

    /// <summary>The pixel rectangle of every region for a content size (clamped to the frame; empty when off-frame).</summary>
    public IReadOnlyList<RegionCrop> AllRegions(int width, int height)
    {
        var g = Geometry(width, height);
        return Recipe.Regions.Select(r => new RegionCrop(r.Index, r.Resolve(g).ClampTo(width, height))).ToList();
    }

    /// <summary>The regions due at <paramref name="now"/> (their rate elapsed, or a read was forced), with their rectangles.</summary>
    public IReadOnlyList<RegionCrop> Plan(int width, int height, DateTimeOffset now)
    {
        lock (_gate)
        {
            if (_size != (width, height)) ResetGeometry(width, height);
            var g = Geometry(width, height);
            var list = new List<RegionCrop>();
            foreach (var r in Recipe.Regions)
            {
                var hasWork = r.Detectors.Count > 0 || Recipe.WhiteReferenceRegion == r.Index;
                if (!hasWork) continue;
                if (!_forced[r.Index] && _nextDue[r.Index] is { } due && now < due) continue;
                var rect = r.Resolve(g).ClampTo(width, height);
                if (rect.IsEmpty) continue;
                list.Add(new RegionCrop(r.Index, rect));
            }
            return list;
        }
    }

    /// <summary>Forces these regions to be read on the next frame (closed loops and control lookups).</summary>
    public void RequestNow(IEnumerable<int> regions)
    {
        lock (_gate) foreach (var r in regions) if (r >= 0 && r < _forced.Length) _forced[r] = true;
    }

    public void RequestNow(params string[] regionIds) =>
        RequestNow(regionIds.Select(id => Recipe.Region(id)?.Index ?? -1));

    /// <summary>
    /// While the scope is open, every read of these regions is held to full confidence: OCR skips its "earned trust"
    /// shortcut, and an unchanged region whose last verdict was not full confidence is read again instead of reused.
    /// Closed loops open it around their reads (lead decision 3).
    /// </summary>
    public IDisposable Strict(IEnumerable<int> regions)
    {
        var list = regions.Where(r => r >= 0 && r < _strict.Length).Distinct().ToArray();
        lock (_gate) foreach (var r in list) _strict[r]++;
        return new StrictScope(this, list);
    }

    private sealed class StrictScope(SightEngine engine, int[] regions) : IDisposable
    {
        private int _done;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _done, 1) != 0) return;
            lock (engine._gate) foreach (var r in regions) engine._strict[r] = Math.Max(0, engine._strict[r] - 1);
        }
    }

    /// <summary>True when one of the readout's contexts is active now (a readout without contexts always is).</summary>
    public bool InContext(CompiledReadout readout)
    {
        if (readout.Contexts.Count == 0) return true;
        lock (_gate) return _contexts.Any(c => c.Active && readout.Contexts.Contains(c.Spec.Id));
    }

    /// <summary>The main (highest-priority active) context and since when it is the main one.</summary>
    public (string? Id, DateTimeOffset? Since) MainContext()
    {
        lock (_gate) return (_mainContext, _mainSince);
    }

    /// <summary>When a region was last processed (null = never since the last reset).</summary>
    public DateTimeOffset? RegionProcessedAt(int region)
    {
        lock (_gate) return region >= 0 && region < _processedAt.Length ? _processedAt[region] : null;
    }

    /// <summary>How often each detector actually ran (not skipped) and its total time, for diagnostics and perf reports.</summary>
    public IReadOnlyList<(string Detector, long Runs, double TotalMs)> DetectorCosts()
    {
        lock (_gate) return Recipe.Detectors.Select(d => (d.Id, _runs[d.Index], _ms[d.Index])).ToList();
    }

    /// <summary>The latest sample of a detector (null = never ran).</summary>
    public DetectorSample? Latest(int detector)
    {
        lock (_gate) return detector >= 0 && detector < _samples.Length ? _samples[detector] : null;
    }

    /// <summary>Completes when the next frame has been processed (or after <paramref name="timeout"/>: false).</summary>
    public async Task<bool> WaitForFrameAsync(TimeSpan timeout, CancellationToken ct)
    {
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_gate) _waiters.Add(tcs);
        using var reg = ct.Register(() => tcs.TrySetCanceled(ct));
        var done = await Task.WhenAny(tcs.Task, Task.Delay(timeout, ct)).ConfigureAwait(false);
        lock (_gate) _waiters.Remove(tcs);
        ct.ThrowIfCancellationRequested();
        return done == tcs.Task;
    }

    /// <summary>Pauses (window minimized/hidden): every value goes stale, contexts too.</summary>
    public void SetPaused(bool paused, string? reason, DateTimeOffset now)
    {
        lock (_gate)
        {
            if (_paused == paused) { _pauseReason = reason; return; }
            _paused = paused;
            _pauseReason = reason;
            _now = now;
            if (paused) foreach (var r in _readouts) r.MakeStale(now);
            else Array.Fill(_nextDue, null);
        }
    }

    public bool IsPaused { get { lock (_gate) return _paused; } }

    /// <summary>Runs the detectors of the regions in <paramref name="frame"/> and updates contexts and readouts.</summary>
    public async Task ProcessAsync(RegionFrame frame, CancellationToken ct = default)
    {
        int[] regions;
        HudGeometry g;
        lock (_gate)
        {
            if (_size != (frame.ContentWidth, frame.ContentHeight)) ResetGeometry(frame.ContentWidth, frame.ContentHeight);
            _paused = false;
            _pauseReason = null;
            regions = frame.Regions.Keys.Order().ToArray();
            g = Geometry(frame.ContentWidth, frame.ContentHeight);
        }
        var unit = g.Unit;
        foreach (var ri in regions)
        {
            ct.ThrowIfCancellationRequested();
            var region = Recipe.Regions[ri];
            var img = frame.Regions[ri];
            var rect = region.Resolve(g).ClampTo(frame.ContentWidth, frame.ContentHeight);
            SightImage? prev;
            bool unchanged, strict;
            lock (_gate)
            {
                strict = _strict[ri] > 0;
                prev = _lastImage[ri];
                var sig = RegionSignature.Of(img);
                var old = _lastSig[ri];
                unchanged = _o.ChangeGating && old is not null && prev is not null && prev.Width == img.Width && prev.Height == img.Height
                            && RegionSignature.MaxDifference(old, sig) < 1.5 / 255 && RegionSignature.Difference(old, sig) < 0.4 / 255;
                _lastSig[ri] = sig;
                _forced[ri] = false;
                _nextDue[ri] = frame.At + TimeSpan.FromSeconds(1 / Math.Max(0.1, region.RateHz));
            }
            foreach (var di in region.Detectors)
            {
                var det = Recipe.Detectors[di];
                DetectorSample sample;
                DetectorSample? last;
                lock (_gate) last = _samples[di];
                // A change detector must always compare; others may reuse their verdict on identical pixels (in a strict
                // scope only a full-confidence verdict: anything else is read again).
                if (unchanged && det.Kind != DetectorKind.Change && last is not null && last.RegionRect == rect && !(strict && !last.Result.FullConfidence))
                {
                    sample = last with { At = frame.At, Reused = true };
                    Interlocked.Increment(ref _skipped);
                }
                else
                {
                    DetectorResult result;
                    var t0 = System.Diagnostics.Stopwatch.GetTimestamp();
                    try
                    {
                        result = await det.RunAsync(img, new DetectContext { Unit = unit, Ocr = _o.Ocr, Previous = prev, Cancellation = ct, Strict = strict }).ConfigureAwait(false);
                        lock (_gate) { _runs[di]++; _ms[di] += System.Diagnostics.Stopwatch.GetElapsedTime(t0).TotalMilliseconds; }
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        _o.Log.Warn($"sight: detector '{det.Id}' failed: {ex.GetType().Name}");
                        result = DetectorResult.Absent(0, "error");
                    }
                    sample = new DetectorSample(result, frame.At, rect, false);
                }
                lock (_gate) _samples[di] = sample;
            }
            lock (_gate) { _lastImage[ri] = img; _processedAt[ri] = frame.At; }
        }

        List<SightEvent> events;
        List<TaskCompletionSource> waiters;
        lock (_gate)
        {
            _now = frame.At;
            events = EvaluateContexts(frame.At);
            var active = ActiveContexts();
            foreach (var r in _readouts) r.Update(this, frame.At, active, _o.MinScore);
            Interlocked.Increment(ref _processed);
            waiters = [.. _waiters];
            _waiters.Clear();
        }
        foreach (var e in events) EventRaised?.Invoke(e);
        foreach (var w in waiters) w.TrySetResult();
    }

    /// <summary>Re-evaluates staleness at <paramref name="now"/> without a frame (a quiet capture).</summary>
    public void Tick(DateTimeOffset now)
    {
        lock (_gate)
        {
            _now = now;
            var active = ActiveContexts();
            foreach (var r in _readouts) r.Age(now, active);
        }
    }

    private void ResetGeometry(int w, int h)
    {
        // A new resolution invalidates every region crop: start over (values become unknown, not wrong).
        _size = (w, h);
        Array.Fill(_nextDue, null);
        Array.Fill(_lastImage, null);
        Array.Fill(_processedAt, null);
        Array.Fill(_lastSig, null);
        Array.Fill(_samples, null);
        foreach (var c in _contexts) c.Reset();
        foreach (var r in _readouts) r.Reset();
        _mainContext = null;
        _mainSince = null;
    }

    private HashSet<string> ActiveContexts() => _contexts.Where(c => c.Active).Select(c => c.Spec.Id).ToHashSet(StringComparer.Ordinal);

    private List<SightEvent> EvaluateContexts(DateTimeOffset now)
    {
        var events = new List<SightEvent>();
        foreach (var c in _contexts) c.Evaluate(this, now);
        var main = _contexts.Where(c => c.Active).OrderByDescending(c => c.Spec.Priority).ThenBy(c => Array.IndexOf(_contexts, c)).FirstOrDefault();
        var id = main?.Spec.Id;
        if (id != _mainContext)
        {
            events.Add(new SightEvent("context", now, new Dictionary<string, object?> { ["value"] = id, ["from"] = _mainContext }));
            _mainContext = id;
            _mainSince = now;
        }
        return events;
    }

    // IDetectorFacts (called under _gate from the context and readout evaluation)
    public bool TryGet(string detectorId, out bool present, out string? label, out double? number, out double score)
    {
        present = false; label = null; number = null; score = 0;
        var d = Recipe.DetectorById(detectorId);
        if (d is null) return false;
        var s = _samples[d.Index];
        if (s is null) return false;
        present = s.Result.Present;
        label = s.Result.Label;
        number = s.Result.Number;
        // An old verdict counts for less (2 s to fade).
        var age = (_now - s.At).TotalMilliseconds;
        score = s.Result.Score * Math.Clamp(1 - Math.Max(0, age - 500) / 2000, 0, 1);
        return true;
    }

    /// <summary>The engine's state as contract DTOs (controls included; counted steps are added by the control layer).</summary>
    public (SightContext Context, IReadOnlyDictionary<string, SightReadout> Readouts, IReadOnlyDictionary<string, SightControlState> Controls, string? PauseReason) State()
    {
        lock (_gate)
        {
            var active = _contexts.Where(c => c.Active).OrderByDescending(c => c.Spec.Priority).Select(c => c.Spec.Id).ToList();
            SightContext ctx;
            if (_mainContext is null) ctx = new SightContext(null, null, _paused ? SightConfidence.Stale : SightConfidence.Observed, _mainSince, active);
            else
            {
                var c = _contexts.First(x => x.Spec.Id == _mainContext);
                var conf = _paused ? SightConfidence.Stale : c.Confidence >= 0.6 ? SightConfidence.Observed : SightConfidence.Inferred;
                ctx = new SightContext(_mainContext, c.Spec.Label, conf, _mainSince, active);
            }
            if (_processed == 0) ctx = SightContext.None;
            var readouts = _readouts.ToDictionary(r => r.Spec.Id, r => r.ToDto(), StringComparer.Ordinal);
            var controls = new Dictionary<string, SightControlState>(StringComparer.Ordinal);
            foreach (var c in Recipe.Controls)
            {
                var s = _samples[c.LocateDetector];
                var fresh = s is not null && !_paused && (_now - s.At).TotalMilliseconds < 1500;
                var score = s?.Result.Number ?? 0;
                controls[c.Id] = new SightControlState(c.Id, fresh && score >= c.MinScore, score, s?.At);
            }
            return (ctx, readouts, controls, _paused ? _pauseReason : null);
        }
    }

    // ------------------------------------------------------------------ contexts

    private sealed class ContextState(CompiledContext spec)
    {
        public CompiledContext Spec { get; } = spec;
        public bool Active { get; private set; }
        public double Confidence { get; private set; }
        private DateTimeOffset? _pendingSince;

        public void Reset() { Active = false; Confidence = 0; _pendingSince = null; }

        public void Evaluate(IDetectorFacts facts, DateTimeOffset now)
        {
            var (v, c) = Spec.When.Evaluate(facts);
            Confidence = c;
            if (v == Active) { _pendingSince = null; return; }
            _pendingSince ??= now;
            var need = v ? Spec.EnterMs : Spec.ExitMs;
            if ((now - _pendingSince.Value).TotalMilliseconds >= need)
            {
                Active = v;
                _pendingSince = null;
            }
        }
    }

    // ------------------------------------------------------------------ readouts

    private sealed class ReadoutState(CompiledReadout spec)
    {
        public CompiledReadout Spec { get; } = spec;
        private object? _value;
        private SightConfidence _conf = SightConfidence.Unknown;
        private double _score;
        private DateTimeOffset? _observedAt;
        private DateTimeOffset _updatedAt = DateTimeOffset.UnixEpoch;
        private object? _candidate;
        private int _candidateCount;
        private DateTimeOffset? _lastSampleAt;
        private DateTimeOffset? _lastValidAt;

        public void Reset()
        {
            _value = null; _conf = SightConfidence.Unknown; _score = 0; _observedAt = null; _candidate = null; _candidateCount = 0;
            _lastSampleAt = null; _lastValidAt = null;
        }

        public void MakeStale(DateTimeOffset now)
        {
            if (_conf is SightConfidence.Observed or SightConfidence.Inferred) { _conf = SightConfidence.Stale; _updatedAt = now; }
        }

        private bool InContext(HashSet<string> active) => Spec.Contexts.Count == 0 || Spec.Contexts.Any(active.Contains);

        public void Age(DateTimeOffset now, HashSet<string> active)
        {
            if (_conf is SightConfidence.Unknown or SightConfidence.Stale) return;
            if (!InContext(active) || _lastValidAt is null || (now - _lastValidAt.Value).TotalMilliseconds > Spec.StaleAfterMs) MakeStale(now);
        }

        public void Update(SightEngine e, DateTimeOffset now, HashSet<string> active, double minScore)
        {
            var s = e._samples[Spec.Detector];
            if (s is null || s.At == _lastSampleAt) { Age(now, active); return; }
            // Out of context: keep the sample for when the context starts (it is read then, not lost).
            if (!InContext(active)) { Age(now, active); return; }
            _lastSampleAt = s.At;
            var r = s.Result;
            object? v = Spec.Kind switch
            {
                ReadoutKind.Bool => r.Present,
                ReadoutKind.Label => r.Present ? r.Label : null,
                ReadoutKind.Text => r.Present ? r.Text : null,
                _ => r.Present ? r.Number : null,
            };
            if (v is double d)
            {
                if (Spec.Precision is { } p) d = Math.Round(d, p, MidpointRounding.AwayFromZero);
                if ((Spec.Min is { } mn && d < mn) || (Spec.Max is { } mx && d > mx)) v = null;   // out of range: never shown
                else v = d;
            }
            var valid = v is not null && r.Score >= minScore;
            if (!valid) { Age(now, active); return; }
            _score = r.Score;
            _updatedAt = now;
            _lastValidAt = s.At;
            if (_conf != SightConfidence.Unknown && Equals(v, _value))
            {
                if (_candidate is not null)
                {
                    // A new value waiting for confirmation: one more identical read.
                    if (++_candidateCount >= Spec.ConfirmReads) Confirm(s.At);
                }
                else
                {
                    // The same value as before (possibly after a stale spell): observed again.
                    _conf = SightConfidence.Observed;
                    _observedAt = s.At;
                }
                return;
            }
            // A different value: shown at once, but only "inferred" until confirmed by ConfirmReads identical reads.
            _value = v;
            _candidate = v;
            _candidateCount = 1;
            if (_candidateCount >= Spec.ConfirmReads) Confirm(s.At);
            else _conf = SightConfidence.Inferred;
        }

        private void Confirm(DateTimeOffset at)
        {
            _conf = SightConfidence.Observed;
            _observedAt = at;
            _candidate = null;
            _candidateCount = 0;
        }

        public SightReadout ToDto()
        {
            var kind = Spec.Kind switch
            {
                ReadoutKind.Percent => SightValueKind.Percent, ReadoutKind.Bool => SightValueKind.Bool, ReadoutKind.Label => SightValueKind.Label,
                ReadoutKind.Text => SightValueKind.Text, _ => SightValueKind.Number,
            };
            return new SightReadout(Spec.Id, Spec.Label, kind, _value as double?, _value as string, _value as bool?, Spec.Unit, _conf,
                Math.Round(_score, 3), _observedAt, _updatedAt, Spec.RegionId);
        }
    }
}
