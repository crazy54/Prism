using System.Collections.Immutable;
using System.Text.Json.Nodes;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Hub;

/// <summary>
/// Where browser commands go. The real sink writes <c>cmd</c> frames to the browser's session; in safe mode the
/// <see cref="SafeModeCommandSink"/> logs one line per command (ids only: never titles, URLs or paths) and applies the
/// expected effect to the in-memory state, so keys and dials still respond under the fake host.
/// </summary>
public interface IBrowserCommandSink
{
    bool IsSafeMode { get; }
    Task<CommandResult> SendAsync(string browserKey, string op, JsonObject args, CancellationToken ct = default);
}

/// <summary>The real sink: the browser's live session.</summary>
internal sealed class SessionCommandSink(Func<string, BrowserSession?> sessionFor) : IBrowserCommandSink
{
    public bool IsSafeMode => false;

    public Task<CommandResult> SendAsync(string browserKey, string op, JsonObject args, CancellationToken ct = default) =>
        sessionFor(browserKey) is { IsOpen: true } s
            ? s.SendCommandAsync(op, args, ct: ct)
            : Task.FromResult(CommandResult.Fail(Wire.Err.NoBrowser, "No browser is connected."));
}

/// <summary>One command the safe-mode sink did not send.</summary>
public sealed record SuppressedCommand(string BrowserKey, string Op, string Summary);

/// <summary>Safe mode: nothing reaches a browser. Each command is logged and simulated on the store.</summary>
public sealed class SafeModeCommandSink : IBrowserCommandSink
{
    private readonly BrowserStore _store;
    private readonly ILog _log;
    private readonly List<SuppressedCommand> _suppressed = [];
    private readonly Stack<(string Browser, BrowserTab Tab)> _closed = new();

    public SafeModeCommandSink(BrowserStore store, ILog log)
    {
        _store = store;
        _log = log;
    }

    public bool IsSafeMode => true;

    public IReadOnlyList<SuppressedCommand> Suppressed { get { lock (_suppressed) return [.. _suppressed]; } }

    public int Count(string op) { lock (_suppressed) return _suppressed.Count(s => s.Op == op); }

    public Task<CommandResult> SendAsync(string browserKey, string op, JsonObject args, CancellationToken ct = default)
    {
        var summary = Summarize(op, args);
        lock (_suppressed) _suppressed.Add(new SuppressedCommand(browserKey, op, summary));
        _log.Info($"[safe mode] would send {summary}");
        JsonObject? data = null;
        try { data = Simulate(browserKey, op, args); }
        catch (Exception ex) { _log.Debug("safe-mode simulation failed: " + ex.GetType().Name); }
        data ??= new JsonObject();
        data["safeMode"] = true;
        return Task.FromResult(new CommandResult(true, data));
    }

    /// <summary>Ids, numbers and enum-like words only; anything that could be a URL or text becomes a hash.</summary>
    public static string Summarize(string op, JsonObject args)
    {
        var parts = new List<string>();
        foreach (var (k, v) in args)
        {
            var text = v switch
            {
                JsonValue jv when jv.TryGetValue<bool>(out var b) => b ? "true" : "false",
                JsonValue jv when jv.TryGetValue<int>(out var i) => i.ToString(System.Globalization.CultureInfo.InvariantCulture),
                JsonValue jv when jv.TryGetValue<long>(out var l) => l.ToString(System.Globalization.CultureInfo.InvariantCulture),
                JsonValue jv when jv.TryGetValue<double>(out var d) => d.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture),
                JsonValue jv when jv.TryGetValue<string>(out var s) => k is "url" ? WireParser.Redact(s) : s.Length <= 24 && s.All(c => char.IsAsciiLetterOrDigit(c) || c is ':' or '-' or '_' or '.') ? s : WireParser.Redact(s),
                JsonArray a => "[" + string.Join(",", a.Take(32).Select(x => x is JsonValue xv && (xv.TryGetValue<int>(out var xi) ? (long?)xi : xv.TryGetValue<long>(out var xl) ? xl : null) is { } n ? n.ToString(System.Globalization.CultureInfo.InvariantCulture) : "…")) + "]",
                _ => "…",
            };
            parts.Add($"{k}={text}");
        }
        return parts.Count == 0 ? op : $"{op} ({string.Join(", ", parts)})";
    }

    private JsonObject? Simulate(string key, string op, JsonObject a)
    {
        int? I(string n) => WireParser.Int(a, n);
        double? D(string n, double min, double max) => WireParser.Double(a, n, min, max);
        bool? B(string n) => WireParser.Bool(a, n);
        string? S(string n) => WireParser.Str(a, n, 64, clean: false);

        switch (op)
        {
            case Wire.Op.TabFocus when I("tabId") is { } tabId:
                _store.UpdateBrowser(key, b =>
                {
                    if (!b.Tabs.TryGetValue(tabId, out var t)) return b;
                    var tabs = b.Tabs.ToImmutableDictionary(kv => kv.Key, kv => kv.Value.WindowId == t.WindowId ? kv.Value with { Active = kv.Key == tabId } : kv.Value);
                    return b with { Tabs = tabs, FocusedWindowId = t.WindowId, LastFocusedWindowId = t.WindowId, FocusedAt = _store.NowMs };
                }, BrowserChange.Tabs | BrowserChange.Windows);
                return new JsonObject { ["focused"] = true };
            case Wire.Op.TabClose when I("tabId") is { } closeId:
                _store.UpdateBrowser(key, b =>
                {
                    if (!b.Tabs.TryGetValue(closeId, out var t)) return b;
                    lock (_closed) _closed.Push((key, t));
                    var tabs = b.Tabs.Remove(closeId);
                    if (t.Active)
                    {
                        // Like the browser: the neighbor at the same position (or the one before it) becomes active.
                        var next = tabs.Values.Where(x => x.WindowId == t.WindowId).OrderBy(x => x.Index).FirstOrDefault(x => x.Index > t.Index)
                            ?? tabs.Values.Where(x => x.WindowId == t.WindowId).OrderByDescending(x => x.Index).FirstOrDefault();
                        if (next is not null) tabs = tabs.SetItem(next.Id, next with { Active = true });
                    }
                    return b with { Tabs = tabs, Media = b.Media.RemoveRange(b.Media.Values.Where(m => m.TabId == closeId).Select(m => m.Key)) };
                }, BrowserChange.Tabs | BrowserChange.Media);
                return null;
            case Wire.Op.SessionRestore:
            {
                (string Browser, BrowserTab Tab)? last = null;
                lock (_closed) if (_closed.Count > 0) last = _closed.Pop();
                if (last is { } l) _store.UpdateBrowser(l.Browser, b => b with { Tabs = b.Tabs.SetItem(l.Tab.Id, l.Tab) }, BrowserChange.Tabs);
                return null;
            }
            case Wire.Op.TabMute when I("tabId") is { } muteId:
                _store.UpdateBrowser(key, b => b.Tabs.TryGetValue(muteId, out var t) ? b with { Tabs = b.Tabs.SetItem(muteId, t with { Muted = B("muted") ?? !t.Muted }) } : b, BrowserChange.Tabs);
                return null;
            case Wire.Op.MediaToggle or Wire.Op.MediaPlay or Wire.Op.MediaPause:
                return Media(key, a, m => m with
                {
                    State = op == Wire.Op.MediaPlay ? "playing" : op == Wire.Op.MediaPause ? "paused" : m.IsPlaying ? "paused" : "playing",
                    PositionMs = m.PositionNow(_store.WallMs) ?? m.PositionMs,
                    PositionAt = _store.WallMs,
                });
            case Wire.Op.MediaSeek:
                return Media(key, a, m =>
                {
                    var now = m.PositionNow(_store.WallMs) ?? 0;
                    var target = I("positionMs") is { } p ? p : now + (WireParser.Long(a, "deltaMs") ?? 0);
                    target = Math.Clamp(target, 0, m.DurationMs ?? long.MaxValue);
                    return m with { PositionMs = target, PositionAt = _store.WallMs };
                });
            case Wire.Op.MediaRate when D("rate", 0.0625, 16) is { } rate:
                return Media(key, a, m => m with { Rate = rate, PositionMs = m.PositionNow(_store.WallMs) ?? m.PositionMs, PositionAt = _store.WallMs });
            case Wire.Op.MediaVolume when D("volume", 0, 1) is { } vol:
                return Media(key, a, m => m with { Volume = vol });
            case Wire.Op.MediaMute:
                return Media(key, a, m => m with { ElementMuted = B("muted") ?? !(m.ElementMuted ?? false) });
            case Wire.Op.MediaPip:
                return Media(key, a, m => m with { Pip = S("mode") switch { "enter" => true, "exit" => false, _ => !m.Pip } }, new JsonObject { ["pip"] = true });
            case Wire.Op.MediaAction:
                return Media(key, a, m => S("action") switch
                {
                    "togglemicrophone" => m with { Mic = !(m.Mic ?? false) },
                    "togglecamera" => m with { Camera = !(m.Camera ?? false) },
                    _ => m,
                });
            case Wire.Op.PageZoom when I("tabId") is { } zoomTab:
                _store.UpdateBrowser(key, b =>
                {
                    if (!b.Tabs.TryGetValue(zoomTab, out var t)) return b;
                    var factor = B("reset") == true ? 1 : D("factor", 0.25, 5) ?? ZoomStep(t.Zoom ?? 1, I("step") ?? 0);
                    return b with { Tabs = b.Tabs.SetItem(zoomTab, t with { Zoom = factor }) };
                }, BrowserChange.Tabs);
                return null;
            case Wire.Op.GroupUpdate when I("groupId") is { } gid:
                _store.UpdateBrowser(key, b => b.Groups.TryGetValue(gid, out var g) ? b with { Groups = b.Groups.SetItem(gid, g with { Collapsed = B("collapsed") ?? g.Collapsed }) } : b, BrowserChange.Groups);
                return null;
            case Wire.Op.SplitCreate when a["tabIds"] is JsonArray ids && ids.Count == 2:
            {
                var x = ids[0] is JsonValue v0 && v0.TryGetValue<int>(out var i0) ? i0 : -1;
                var y = ids[1] is JsonValue v1 && v1.TryGetValue<int>(out var i1) ? i1 : -1;
                _store.UpdateBrowser(key, b =>
                {
                    if (!b.Tabs.TryGetValue(x, out var tx) || !b.Tabs.TryGetValue(y, out var ty)) return b;
                    return b with { Tabs = b.Tabs.SetItem(x, tx with { Split = 9000 + x }).SetItem(y, ty with { Split = 9000 + x }) };
                }, BrowserChange.Tabs);
                return null;
            }
            case Wire.Op.SplitRemove when I("splitViewId") is { } sid:
                _store.UpdateBrowser(key, b => b with { Tabs = b.Tabs.ToImmutableDictionary(kv => kv.Key, kv => kv.Value.Split == sid ? kv.Value with { Split = -1 } : kv.Value) }, BrowserChange.Tabs);
                return null;
            case Wire.Op.PrivacySet when Wire.Privacy.IsValid(S("level")):
                _store.UpdateBrowser(key, b => PrivacyFilter.Apply(b, S("level")!), BrowserChange.Privacy | BrowserChange.All);
                return new JsonObject { ["level"] = S("level") };
            case Wire.Op.Panic:
                _store.UpdateBrowser(key, b => PrivacyFilter.Apply(b with { Tabs = b.Tabs.ToImmutableDictionary(kv => kv.Key, kv => kv.Value.Audible || kv.Value.Muted ? kv.Value with { Muted = true } : kv.Value) }, Wire.Privacy.Hidden), BrowserChange.All);
                return null;
            case Wire.Op.DownloadPause or Wire.Op.DownloadResume when I("id") is { } did:
                _store.UpdateBrowser(key, b => b.Downloads.TryGetValue(did, out var d) ? b with { Downloads = b.Downloads.SetItem(did, d with { Paused = op == Wire.Op.DownloadPause }) } : b, BrowserChange.Downloads);
                return null;
            case Wire.Op.DownloadCancel when I("id") is { } cid:
                _store.UpdateBrowser(key, b => b.Downloads.TryGetValue(cid, out var d) ? b with { Downloads = b.Downloads.SetItem(cid, d with { State = "interrupted", Error = "USER_CANCELED" }) } : b, BrowserChange.Downloads);
                return null;
        }
        return null;
    }

    private JsonObject? Media(string key, JsonObject a, Func<MediaItem, MediaItem> f, JsonObject? data = null)
    {
        var mk = WireParser.Str(a, "key", 40, clean: false);
        if (mk is null) return data;
        _store.UpdateBrowser(key, b => b.Media.TryGetValue(mk, out var m) ? b with { Media = b.Media.SetItem(mk, f(m)) } : b, BrowserChange.Media);
        return data;
    }

    private static double ZoomStep(double current, int step)
    {
        var ladder = Wire.ZoomLadder;
        var i = Array.FindIndex(ladder, z => z >= current - 0.001);
        if (i < 0) i = ladder.Length - 1;
        return ladder[Math.Clamp(i + step, 0, ladder.Length - 1)];
    }
}
