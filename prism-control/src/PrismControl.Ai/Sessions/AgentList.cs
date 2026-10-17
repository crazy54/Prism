using System.Text.Json;
using PrismControl.Ai.Platform;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Sessions;

/// <summary>
/// Parses <c>claude agents --json</c> (the supported read-out of every live session for one config dir; [H] agent-view docs).
/// Shape verified on this PC: a top-level array of { pid, cwd, kind, startedAt (epoch ms), sessionId, name, status,
/// waitingFor }. The cwd is turned into a hash + basename right here; the name (a title) is only read when
/// <paramref name="keepTitles"/> is true (Reveal mode). Unknown fields are never read. Lenient: a bad row is skipped.
/// </summary>
public static class AgentListParser
{
    public static IReadOnlyList<AgentListEntry>? TryParse(string json, bool keepTitles)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 16 });
            var root = doc.RootElement;
            // Accept a bare array (seen) or { "sessions": [...] } / { "agents": [...] } in case the shape grows a wrapper.
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (root.TryGetProperty("sessions", out var s) && s.ValueKind == JsonValueKind.Array) root = s;
                else if (root.TryGetProperty("agents", out var a) && a.ValueKind == JsonValueKind.Array) root = a;
            }
            if (root.ValueKind != JsonValueKind.Array) return null;
            var list = new List<AgentListEntry>();
            foreach (var row in root.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object) continue;
                var cwd = Str(row, "cwd", 1024);
                var entry = new AgentListEntry
                {
                    Pid = Int(row, "pid"),
                    SessionId = Str(row, "sessionId", 128),
                    Id = Str(row, "id", 128),
                    Status = Str(row, "status", 32)?.ToLowerInvariant(),
                    WaitingFor = Str(row, "waitingFor", 48)?.ToLowerInvariant(),
                    Kind = Str(row, "kind", 32)?.ToLowerInvariant(),
                    BackgroundState = Str(row, "state", 32)?.ToLowerInvariant(),
                    StartedAtMs = Long(row, "startedAt"),
                    CwdHash = Privacy.CwdHash(cwd),
                    CwdName = Privacy.CwdName(cwd),
                    Title = keepTitles ? Str(row, "name", 80) : null,
                };
                if (entry.KeyId is null) continue;
                list.Add(entry);
            }
            return list;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? Str(JsonElement o, string name, int max) =>
        o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? Privacy.Clean(v.GetString(), max) is { Length: > 0 } s ? s : null : null;

    private static int? Int(JsonElement o, string name) =>
        o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) && i > 0 ? i : null;

    private static long? Long(JsonElement o, string name)
    {
        if (!o.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var l)) return l;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d)) return (long)d;
        if (v.ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(v.GetString(), System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal, out var dt)) return dt.ToUnixTimeMilliseconds();
        return null;
    }
}

/// <summary>
/// Polls <c>claude agents --json</c> off the mailbox, adaptively (research/ai-apps.md §5.2, R8):
/// <list type="bullet">
/// <item>every 2 s while any session works or waits and hooks are not active (the agent list is the only fast source);</item>
/// <item>every 4 s while active with hooks (hooks are instant; the list only closes their blind spots);</item>
/// <item>every 10 s while everything is idle;</item>
/// <item>not at all while no AI action is visible (<c>demanded</c> false).</item>
/// </list>
/// A FileSystemWatcher on <c>&lt;config&gt;\sessions</c> (file names only; the files are never opened, and the <c>*.key</c>
/// files are secrets) nudges an early poll. Each config dir in <c>ai.extraClaudeConfigDirs</c> is polled with its own
/// <c>CLAUDE_CONFIG_DIR</c>.
/// </summary>
public sealed class AgentListPoller : IAsyncDisposable
{
    public static readonly TimeSpan Fast = TimeSpan.FromSeconds(2);
    public static readonly TimeSpan ActiveWithHooks = TimeSpan.FromSeconds(4);
    public static readonly TimeSpan Slow = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan CommandTimeout = TimeSpan.FromSeconds(3);

    private readonly SessionTracker _tracker;
    private readonly ICommandRunner _runner;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly Func<bool> _demanded;
    private readonly Func<bool> _keepTitles;
    private readonly Func<IReadOnlyList<string?>> _configDirs;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim _nudge = new(0, 1);
    private readonly List<FileSystemWatcher> _watchers = [];
    private Task? _loop;
    private string? _claude;
    private bool _resolved;
    private int _failures;

    public AgentListPoller(SessionTracker tracker, ICommandRunner runner, TimeProvider time, ILog log, Func<bool> demanded,
        Func<bool> keepTitles, Func<IReadOnlyList<string?>>? configDirs = null)
    {
        _tracker = tracker;
        _runner = runner;
        _time = time;
        _log = log;
        _demanded = demanded;
        _keepTitles = keepTitles;
        _configDirs = configDirs ?? (() => [null]);
    }

    /// <summary>"claude not found" etc., for the PI.</summary>
    public string Status { get; private set; } = "starting";
    public DateTimeOffset? LastPoll { get; private set; }

    public TimeSpan CurrentInterval =>
        _tracker.AnyActive ? (_tracker.AnyHooksActive ? ActiveWithHooks : Fast) : Slow;

    public void Start(IEnumerable<string>? sessionDirs = null)
    {
        foreach (var dir in sessionDirs ?? [])
        {
            try
            {
                if (!Directory.Exists(dir)) continue;
                var w = new FileSystemWatcher(dir, "*.json") { NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite, IncludeSubdirectories = false };
                w.Changed += (_, _) => Nudge();
                w.Created += (_, _) => Nudge();
                w.Deleted += (_, _) => Nudge();
                w.EnableRaisingEvents = true;
                _watchers.Add(w);
            }
            catch (Exception ex) when (ex is IOException or ArgumentException or UnauthorizedAccessException)
            {
                _log.Debug("sessions folder watcher unavailable");
            }
        }
        _loop = Task.Run(() => LoopAsync(_cts.Token));
    }

    /// <summary>Asks for an early poll (debounced by the loop).</summary>
    public void Nudge()
    {
        try { if (_nudge.CurrentCount == 0) _nudge.Release(); } catch (SemaphoreFullException) { }
    }

    private async Task LoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (_demanded()) await PollOnceAsync(ct).ConfigureAwait(false);
                var wait = _demanded() ? CurrentInterval : TimeSpan.FromSeconds(1);
                if (_failures > 3) wait = TimeSpan.FromSeconds(Math.Min(60, 10 * _failures));
                using var delay = CancellationTokenSource.CreateLinkedTokenSource(ct);
                var nudged = _nudge.WaitAsync(delay.Token);
                var timer = Task.Delay(wait, _time, delay.Token);
                await Task.WhenAny(nudged, timer).ConfigureAwait(false);
                delay.Cancel();
                // Debounce a burst of file events.
                if (nudged.IsCompletedSuccessfully) await Task.Delay(TimeSpan.FromMilliseconds(250), _time, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                _log.Warn("agent list poll failed", ex);
                await Task.Delay(TimeSpan.FromSeconds(5), _time, ct).ConfigureAwait(false);
            }
        }
    }

    /// <summary>One poll of every configured config dir. Public for tests and for "jump" (a fresh list before focusing).</summary>
    public async Task PollOnceAsync(CancellationToken ct)
    {
        if (!_resolved)
        {
            _claude = _runner.Find("claude.exe") ?? _runner.Find("claude");
            _resolved = true;
            if (_claude is null) Status = "Claude Code CLI not found";
        }
        if (_claude is null) return;
        var ttl = TimeSpan.FromTicks(Math.Max(TimeSpan.FromSeconds(6).Ticks, CurrentInterval.Ticks * 3));
        foreach (var dir in _configDirs())
        {
            var env = dir is null ? null : new Dictionary<string, string?> { ["CLAUDE_CONFIG_DIR"] = dir };
            var started = _time.GetUtcNow();
            var result = await _runner.RunAsync(new CommandSpec(_claude, ["agents", "--json"], CommandTimeout, 4 << 20, env), ct).ConfigureAwait(false);
            var entries = result.Ok ? AgentListParser.TryParse(result.StdOut, _keepTitles()) : null;
            if (entries is null)
            {
                _failures++;
                Status = result.TimedOut ? "claude agents timed out" : result.Started ? "claude agents returned no list" : "claude agents could not start";
                _log.Debug($"agent list unavailable ({Status})");
                _tracker.ApplyAgentList(new AgentListSnapshot([], started, ttl, dir ?? "", Ok: false));
                continue;
            }
            _failures = 0;
            Status = "ok";
            LastPoll = started;
            _tracker.ApplyAgentList(new AgentListSnapshot(entries, started, ttl, dir ?? "", Ok: true));
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        foreach (var w in _watchers) w.Dispose();
        if (_loop is not null) { try { await _loop.ConfigureAwait(false); } catch (OperationCanceledException) { } }
        _cts.Dispose();
    }
}
