using System.Globalization;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;

namespace PrismControl.Sight.Calibration;

/// <summary>
/// The ONLY code that saves frames, and only while the user has explicitly started a calibration capture (a deck key
/// press or the PI button; never automatically, never in safe mode). It writes, once a second, a full frame plus every
/// declared region as PNG and a draft <c>expected.json</c> (the labeled-frame format, prefilled with what Sight read,
/// <c>verified: false</c>) into a visible folder: <c>%USERPROFILE%\Pictures\Prism Sight\&lt;game&gt;\&lt;yyyy-MM-dd&gt;\&lt;HHmmss&gt;\</c>.
/// It stops by itself after 10 minutes or 600 moments. While it records, the deck shows REC (snapshot.Recording,
/// the Game Link "rec" field and the recStart/recStop events). Nothing is ever uploaded.
/// </summary>
public sealed class CalibrationRecorder
{
    private readonly string _root;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private DateTimeOffset _lastMoment = DateTimeOffset.MinValue;
    private string? _game, _recipe;

    public CalibrationRecorder(string? root = null, ILog? log = null, TimeProvider? time = null)
    {
        _root = root ?? DefaultRoot;
        _log = log ?? NullLog.Instance;
        _time = time ?? TimeProvider.System;
    }

    /// <summary>%USERPROFILE%\Pictures\Prism Sight (the user's Pictures folder, wherever it is redirected).</summary>
    public static string DefaultRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "Prism Sight");

    public TimeSpan Interval { get; init; } = TimeSpan.FromSeconds(1);
    public TimeSpan MaxDuration { get; init; } = TimeSpan.FromMinutes(10);
    public int MaxMoments { get; init; } = 600;

    public bool IsRecording { get; private set; }
    public string? Folder { get; private set; }
    public int Moments { get; private set; }
    public DateTimeOffset? StartedAt { get; private set; }

    /// <summary>(recording, reason) on start and stop.</summary>
    public event Action<bool, string>? Changed;

    /// <summary>Starts recording into a new dated folder. Callers check the user's gesture and safe mode first.</summary>
    internal bool Start(string game, string recipeId, out string reason)
    {
        lock (_gate)
        {
            if (IsRecording) { reason = "already recording"; return false; }
            var now = _time.GetLocalNow();
            var folder = Path.Combine(_root, Safe(game), now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            try { Directory.CreateDirectory(folder); }
            catch (Exception ex) { reason = "cannot create " + folder + ": " + ex.GetType().Name; return false; }
            Folder = folder;
            _game = game;
            _recipe = recipeId;
            Moments = 0;
            StartedAt = _time.GetUtcNow();
            _lastMoment = DateTimeOffset.MinValue;
            IsRecording = true;
            reason = folder;
        }
        _log.Info($"sight: REC calibration capture started → {Folder}");
        Changed?.Invoke(true, reason);
        return true;
    }

    public void Stop(string reason)
    {
        lock (_gate)
        {
            if (!IsRecording) return;
            IsRecording = false;
        }
        _log.Info($"sight: REC stopped ({reason}), {Moments} moment(s) in {Folder}");
        Changed?.Invoke(false, reason);
    }

    /// <summary>Whether this frame should be saved (and so needs the full-frame readback). Applies the limits.</summary>
    public bool Due(DateTimeOffset now)
    {
        lock (_gate)
        {
            if (!IsRecording) return false;
            if (StartedAt is { } s && now - s > MaxDuration) { _ = Task.Run(() => Stop("10-minute limit")); return false; }
            if (Moments >= MaxMoments) { _ = Task.Run(() => Stop($"{MaxMoments}-moment limit")); return false; }
            return now - _lastMoment >= Interval;
        }
    }

    /// <summary>Writes one moment: frame.png, one PNG per region, and a draft expected.json.</summary>
    public void Write(CapturedFrame frame, CompiledRecipe recipe, SightSnapshot snapshot, double hudScale)
    {
        string dir;
        lock (_gate)
        {
            if (!IsRecording || frame.Full is null || Folder is null) return;
            _lastMoment = frame.At;
            Moments++;
            dir = Path.Combine(Folder, frame.At.ToLocalTime().ToString("HHmmss-fff", CultureInfo.InvariantCulture));
        }
        // Each moment is written into "<time>.partial" and renamed when complete: a reader never sees half a moment.
        var final = dir;
        dir += ".partial";
        try
        {
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, "frame.png"), PngCodec.Encode(frame.Full));
            var g = HudGeometry.For(frame.ContentWidth, frame.ContentHeight, recipe.Hud, hudScale);
            foreach (var r in recipe.Regions)
            {
                var rect = r.Resolve(g).ClampTo(frame.Full.Width, frame.Full.Height);
                if (rect.IsEmpty) continue;
                File.WriteAllBytes(Path.Combine(dir, Safe(r.Id) + ".png"), PngCodec.Encode(frame.Full.Crop(rect)));
            }
            var expected = new ExpectedFrame
            {
                Recipe = recipe.Id, Game = _game, HudScale = hudScale, Context = snapshot.Context.Id ?? "", Verified = false,
                CapturedAt = frame.At.ToString("O", CultureInfo.InvariantCulture),
                Capture = new CaptureInfo { Format = frame.Format.ToString(), PaperWhite = Math.Round(frame.PaperWhite, 4), Width = frame.ContentWidth, Height = frame.ContentHeight },
                Notes = "Draft written by the calibration recorder with what Sight read. Correct the values, then set verified: true.",
            };
            foreach (var (id, ro) in snapshot.Readouts)
            {
                object? v = ro.Confidence is SightConfidence.Observed or SightConfidence.Inferred ? ro.Number ?? (object?)ro.Flag ?? ro.Text : null;
                expected.Readouts[id] = new ExpectedReadout
                {
                    Value = LabeledFrames.Value(v), Tolerance = ro.Number is null ? null : 0, Observed = ro.Confidence.ToString().ToLowerInvariant(),
                };
            }
            File.WriteAllText(Path.Combine(dir, "expected.json"), LabeledFrames.Serialize(expected));
            Directory.Move(dir, final);
        }
        catch (Exception ex)
        {
            _log.Warn($"sight: REC write failed ({ex.GetType().Name}); stopping");
            Stop("write failed");
        }
    }

    private static string Safe(string s) => string.Concat(s.Select(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_' ? c : '_'));
}
