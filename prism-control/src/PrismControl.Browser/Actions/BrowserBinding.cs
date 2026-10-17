using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Install;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Render;
using PrismControl.Browser.State;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Actions;

/// <summary>What every browser action shares (settings base, PI page).</summary>
public abstract class BrowserSettingsBase
{
    /// <summary>auto (most recently focused), chrome, edge, … or an exact browser key.</summary>
    public string Browser { get; set; } = "auto";
}

/// <summary>Why a key cannot show its normal face.</summary>
public sealed record Problem(IconGlyph Glyph, string KeyLine1, string? KeyLine2, string DialLine1, string? DialLine2, Tone Tone);

/// <summary>
/// What every browser action shares: the hub subscription (store changes coalesced into one mailbox render via
/// <c>Post</c>, so a burst of deltas costs one frame), the "no browser / safe mode" faces, flashes, and the PI messages
/// (status, Connect / Disconnect browsers with the consent step, the extension folder). Composition, because key and
/// dial actions have different base classes.
/// </summary>
public sealed class BrowserBinding : IDisposable
{
    public const string PiPage = "pi/browser.html";

    private readonly ActionBase _action;
    private readonly EventHandler<BrowserChangedEventArgs>? _onChanged;
    private readonly BrowserChange _mask;
    private string? _lastPiState;
    private int _queued;

    private BrowserBinding(ActionBase action, BrowserHub? hub, HostInstaller? installer, BrowserChange mask, Action render)
    {
        _action = action;
        Hub = hub;
        Installer = installer;
        _mask = mask;
        if (hub is null) return;
        _onChanged = (_, e) =>
        {
            if ((e.Change & _mask) == 0) return;
            if (Interlocked.Exchange(ref _queued, 1) == 1) return;
            _action.Post(() =>
            {
                Volatile.Write(ref _queued, 0);
                render();
                PushPiState();
            });
        };
        hub.Store.Changed += _onChanged;
    }

    public BrowserHub? Hub { get; }
    public HostInstaller? Installer { get; }
    public BrowserSnapshot Snapshot => Hub?.Store.Current ?? BrowserSnapshot.Empty;
    public bool SafeMode => Hub?.SafeMode ?? _action.SafeMode;

    public static BrowserBinding Attach(ActionBase action, IServiceRegistry services, BrowserChange mask, Action render)
    {
        services.TryGet<BrowserHub>(out var hub);
        services.TryGet<HostInstaller>(out var installer);
        return new BrowserBinding(action, hub, installer, mask | BrowserChange.Browsers | BrowserChange.Privacy, render);
    }

    public BrowserInstance? Target(string? selector) => Snapshot.Target(selector);

    /// <summary>The face to show instead of the normal one, or null when the target browser is connected.</summary>
    public Problem? ProblemFor(BrowserInstance? b)
    {
        if (Hub is null)
            return new Problem(BrowserGlyphs.Plug, "UNAVAILABLE", "SEE PLUGIN LOG", "Browser control is off", "The browser module failed to start: see the plugin log", Tone.Error);
        if (b is { Connected: true }) return null;
        if (b is { Connected: false })
            return new Problem(BrowserGlyphs.Plug, "RECONNECTING", b.Brand.ToUpperInvariant(), $"{b.Brand} disconnected", "Reconnecting…", Tone.Warn);
        if (!Hub.PlatformAvailable)
            return new Problem(BrowserGlyphs.Plug, "NO BROWSER", "UPDATE PRISM", "No browser connected", "This Prism Control build has no browser bridge", Tone.Warn);
        return new Problem(BrowserGlyphs.Plug, "NO BROWSER", "OPEN SETTINGS", "No browser connected", "Fix: Connect browsers in settings", Tone.Warn);
    }

    /// <summary>A short key notice for a focus attempt that did not simply work (null = it worked).</summary>
    public static Notice? NoticeFor(FocusOutcome o) => o switch
    {
        FocusOutcome.SafeMode => new Notice("SAFE MODE", Tone.Warn, "NOT SENT"),
        FocusOutcome.NoBrowser => new Notice("NO BROWSER", Tone.Warn),
        FocusOutcome.NotFound => new Notice("TAB GONE", Tone.Warn),
        FocusOutcome.Elevated => new Notice("ADMIN APP", Tone.Warn, "IN FRONT"),
        FocusOutcome.Refused => new Notice("CAN'T RAISE", Tone.Warn, "WINDOWS SAID NO"),
        FocusOutcome.Failed => new Notice("FAILED", Tone.Error),
        _ => null,
    };

    /// <summary>The same as a dial line.</summary>
    public static Notice? DialNoticeFor(FocusOutcome o) => o switch
    {
        FocusOutcome.SafeMode => new Notice("Safe mode: nothing was sent", Tone.Warn),
        FocusOutcome.NoBrowser => new Notice("No browser connected", Tone.Warn),
        FocusOutcome.NotFound => new Notice("That tab is gone", Tone.Warn),
        FocusOutcome.Elevated => new Notice("Admin app in front: can't raise", Tone.Warn),
        FocusOutcome.Refused => new Notice("Windows refused to raise it", Tone.Warn),
        FocusOutcome.Failed => new Notice("Couldn't switch to that tab", Tone.Error),
        _ => null,
    };

    /// <summary>A command failure as a key notice.</summary>
    public static Notice NoticeFor(CommandResult r, bool safeMode) =>
        safeMode ? new Notice("SAFE MODE", Tone.Warn, "NOT SENT") : r.Code switch
        {
            Wire.Err.NoHostPermission => new Notice("ALLOW SITE", Tone.Warn, "PRESS TO ALLOW"),
            Wire.Err.NoPermission => new Notice("ALLOW IT", Tone.Warn, "IN EXTENSION"),
            Wire.Err.PrivacyBlocked => new Notice("STREAMER SAFE", Tone.Warn, "BLOCKED"),
            Wire.Err.RateLimited => new Notice("SLOW DOWN", Tone.Warn),
            Wire.Err.Unsupported => new Notice("UNSUPPORTED", Tone.Warn),
            Wire.Err.NotFound => new Notice("GONE", Tone.Warn),
            Wire.Err.NoBrowser or Wire.Err.Disconnected => new Notice("NO BROWSER", Tone.Warn),
            Wire.Err.Timeout => new Notice("NO ANSWER", Tone.Error),
            _ => new Notice("FAILED", Tone.Error),
        };

    public static Notice DialNoticeFor(CommandResult r, bool safeMode) =>
        safeMode ? new Notice("Safe mode: nothing was sent", Tone.Warn) : r.Code switch
        {
            Wire.Err.NoHostPermission => new Notice("Push to allow this site", Tone.Warn),
            Wire.Err.NoPermission => new Notice("Allow it in the extension", Tone.Warn),
            Wire.Err.PrivacyBlocked => new Notice("Blocked by streamer-safe", Tone.Warn),
            Wire.Err.RateLimited => new Notice("Too fast: slow down", Tone.Warn),
            Wire.Err.Unsupported => new Notice("This browser can't do that", Tone.Warn),
            Wire.Err.NotFound => new Notice("It's gone", Tone.Warn),
            Wire.Err.NoBrowser or Wire.Err.Disconnected => new Notice("No browser connected", Tone.Warn),
            Wire.Err.Timeout => new Notice("The browser didn't answer", Tone.Error),
            _ => new Notice(r.Message is { Length: > 0 and < 60 } m ? m : "That didn't work", Tone.Error),
        };

    // ------------------------------------------------------------------ PI

    public sealed record PiStatus(string Status, string? Detail, bool SafeMode, bool Installed, bool Connected, string? InstallProblem,
        string ExtensionFolder, string ExtensionId, string LoadSteps, IReadOnlyList<string> Browsers, string Privacy, bool Lite, string? UpdateNote = null);

    /// <summary>Compares "x.y.z" versions; null when either is not a version.</summary>
    internal static int? CompareVersions(string? a, string? b) =>
        Version.TryParse(a, out var va) && Version.TryParse(b, out var vb) ? va.CompareTo(vb) : null;

    public PiStatus PiState()
    {
        var hub = Hub;
        var installed = false;
        string? problem = null;
        var folder = Installer?.ExtensionFolder ?? "";
        try
        {
            if (Installer is { } inst)
            {
                var state = inst.Inspect();
                installed = state.Connected;
                problem = state.Problem;
            }
        }
        catch (Exception) { problem = "The browser connection state could not be read."; }
        var snap = Snapshot;
        var connected = snap.Browsers.Where(b => b.Connected).ToList();
        string status;
        string? detail = null;
        if (hub is null) status = "Browser control is unavailable (see the plugin log).";
        else if (connected.Count > 0)
        {
            status = "Connected: " + string.Join(" · ", connected.Select(b => b.DisplayName));
            var effective = hub.EffectivePrivacy(snap);
            if (effective != Wire.Privacy.Full)
                detail = snap.Panic ? "Panic is on: titles are hidden and tabs muted."
                    : snap.RequestedPrivacy == Wire.Privacy.Full ? $"Streamer-safe is on in the extension ({effective})." : $"Streamer-safe is on ({effective}).";
        }
        else if (!installed)
        {
            status = "No browser connected.";
            detail = "Fix: press Connect browsers below, then load the extension.";
        }
        else
        {
            status = "No browser connected.";
            detail = "Browsers are set up. Load the extension (steps below), or open Chrome / Edge.";
        }
        if (connected.Count >= Wire.Limits.MaxConnections - 1)
            detail = $"{connected.Count} browser profiles are connected; Prism Control takes up to {Wire.Limits.MaxConnections} at once, more can't connect.";
        if (SafeMode) detail = "Prism Control safe mode: browser commands, focus changes and installs are logged, not applied.";
        // MED 7: the extension copy is refreshed at start-up, but a running extension only picks it up after a Reload.
        string? update = null;
        var packaged = Installer?.PackagedExtensionVersion;
        var stale = connected.Where(b => CompareVersions(b.ExtVersion, packaged) < 0).Select(b => b.DisplayName).ToList();
        if (stale.Count > 0)
            update = $"Extension update ready ({packaged}): in {string.Join(" and ", stale)}, open the extensions page and click Reload on the Prism Control card.";
        var steps = $"Open chrome://extensions (or edge://extensions), turn on Developer mode, choose Load unpacked and select {folder}. The extension's id must be {Wire.ExtensionId}.";
        return new PiStatus(status, detail, SafeMode, installed, connected.Count > 0, problem, folder, Wire.ExtensionId, steps,
            [.. connected.Select(b => $"{b.DisplayName} · extension {b.ExtVersion}")], hub?.EffectivePrivacy(snap) ?? snap.RequestedPrivacy, snap.LiteTierActive, update);
    }

    public void PushPiState(bool force = false)
    {
        if (!_action.IsPropertyInspectorVisible) return;
        var state = PiState();
        var json = JsonSerializer.Serialize(state, ActionJson.Options);
        if (!force && json == _lastPiState) return;
        _lastPiState = json;
        _action.SendToPropertyInspector("pi.state", state);
    }

    /// <summary>Options for the "browser" select: automatic, the families, and each connected profile.</summary>
    public object BrowserOptions()
    {
        var list = new List<object>
        {
            new { value = "auto", label = "The browser I used last" },
            new { value = "chrome", label = "Chrome" },
            new { value = "edge", label = "Edge" },
        };
        foreach (var b in Snapshot.Browsers.Where(b => b.Connected))
            list.Add(new { value = b.Key, label = $"{b.DisplayName} only" });
        return list;
    }

    /// <summary>The shared PI messages. Returns (true, reply) when handled; throws with a user-facing message on errors.</summary>
    public async Task<(bool Handled, object? Reply)> HandlePiAsync(string type, JsonNode? data)
    {
        switch (type)
        {
            case "browser.status":
                return (true, PiState());
            case "browser.list":
                return (true, BrowserOptions());
            case "browser.connect.plan":
            case "browser.disconnect.plan":
            {
                if (Installer is not { } inst) throw new InvalidOperationException("Browser setup is unavailable in this build.");
                var plan = type == "browser.connect.plan" ? inst.PlanConnect() : inst.PlanDisconnect();
                return (true, new { planId = plan.Id, connect = plan.Connect, steps = plan.Steps.Select(s => s.Detail).ToList(), notes = plan.Notes, safeMode = plan.SafeMode });
            }
            case "browser.connect.apply":
            case "browser.disconnect.apply":
            {
                if (Installer is not { } inst) throw new InvalidOperationException("Browser setup is unavailable in this build.");
                var planId = (data?["planId"] as JsonValue)?.TryGetValue<string>(out var p) == true ? p : "";
                var consent = data?["consent"] is JsonValue cv && cv.TryGetValue<bool>(out var c) && c;
                if (!consent || planId.Length == 0) throw new InvalidOperationException("Review the steps and confirm first.");
                var r = await inst.ApplyAsync(type == "browser.connect.apply", planId);
                PushPiState(force: true);
                return (true, new { ok = r.Ok, message = r.Message, done = r.Done, state = PiState() });
            }
            case "browser.openExtensionFolder":
            {
                if (Installer is not { } inst) return (true, null);
                if (SafeMode) return (true, new { ok = false, message = "Safe mode: nothing was opened." });
                if (!Directory.Exists(inst.ExtensionFolder)) return (true, new { ok = false, message = "Press Connect browsers first: it copies the extension there." });
                var opened = ProcessLauncher.Start("explorer.exe", "\"" + inst.ExtensionFolder + "\"") is not null;
                return (true, new { ok = opened, message = opened ? "Opened the extension folder." : "Couldn't open the folder." });
            }
        }
        return (false, null);
    }

    public void Dispose()
    {
        if (Hub is { } h && _onChanged is not null) h.Store.Changed -= _onChanged;
    }
}

/// <summary>A short-lived notice on a key or dial (command failures, "safe mode", "press to allow").</summary>
internal struct Flash
{
    private Notice? _notice;
    private long _until;

    public void Set(TimeProvider time, Notice notice, TimeSpan? duration = null)
    {
        _notice = notice;
        _until = time.GetTimestamp() + (long)((duration ?? TimeSpan.FromSeconds(2.5)).TotalSeconds * time.TimestampFrequency);
    }

    public void Clear() => _notice = null;

    public readonly Notice? Get(TimeProvider time) => _notice is not null && time.GetTimestamp() < _until ? _notice : null;
}

/// <summary>
/// Dial magnitude with acceleration: Galleon aggregates fast spins (|ticks| up to 12) so a fast event (|ticks| ≥ 4) is
/// doubled; the Stream Deck + sends ±1 per event, so more than 4 events within 250 ms triple the step.
/// </summary>
internal sealed class TurnAccel
{
    private readonly Queue<long> _recent = new();

    public int Rows(int ticks, ActionBase a, TimeProvider time)
    {
        if (ticks == 0) return 0;
        var mag = Math.Min(Math.Abs(ticks), 12);
        return Math.Sign(ticks) * mag * Multiplier(ticks, a, time);
    }

    /// <summary>Ladders (speed, zoom): one event is one step; a fast spin jumps two.</summary>
    public int Steps(int ticks, ActionBase a, TimeProvider time)
    {
        if (ticks == 0) return 0;
        var fast = a.Device.Capabilities.MaxTicksPerEvent > 1 ? Math.Abs(ticks) >= 4 : Multiplier(ticks, a, time) > 1;
        return Math.Sign(ticks) * (fast ? 2 : 1);
    }

    private int Multiplier(int ticks, ActionBase a, TimeProvider time)
    {
        if (a.Device.Capabilities.MaxTicksPerEvent > 1) return Math.Abs(ticks) >= 4 ? 2 : 1;
        var now = time.GetTimestamp();
        _recent.Enqueue(now);
        while (_recent.Count > 0 && time.GetElapsedTime(_recent.Peek(), now) > TimeSpan.FromMilliseconds(250)) _recent.Dequeue();
        return _recent.Count > 4 ? 3 : 1;
    }
}
