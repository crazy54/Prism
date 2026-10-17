using System.Text.Json;
using PrismControl.Ai.Platform;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Sessions;

/// <summary>
/// Parses Orca's public CLI output into DTOs that have no prompt, lastAssistantMessage, toolInput, preview or title
/// properties: those strings are never read (research/ai-apps.md §7.2). Paths become hashes immediately.
/// </summary>
public static class OrcaParser
{
    public static IReadOnlyList<OrcaAgent>? ParseWorktrees(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!Result(doc.RootElement).TryGetProperty("worktrees", out var wts) || wts.ValueKind != JsonValueKind.Array) return null;
            var list = new List<OrcaAgent>();
            foreach (var wt in wts.EnumerateArray())
            {
                if (wt.ValueKind != JsonValueKind.Object) continue;
                var wid = Str(wt, "worktreeId", 128);
                var pathHash = Privacy.CwdHash(Str(wt, "path", 1024));
                if (!wt.TryGetProperty("agents", out var agents) || agents.ValueKind != JsonValueKind.Array) continue;
                foreach (var a in agents.EnumerateArray())
                {
                    if (a.ValueKind != JsonValueKind.Object || Str(a, "paneKey", 128) is not { } pane) continue;
                    DateTimeOffset? started = a.TryGetProperty("stateStartedAt", out var s) ? s.ValueKind switch
                    {
                        JsonValueKind.Number when s.TryGetInt64(out var ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms),
                        JsonValueKind.String when DateTimeOffset.TryParse(s.GetString(), out var d) => d,
                        _ => null,
                    } : null;
                    list.Add(new OrcaAgent(pane, Str(a, "state", 32), started, Str(a, "agentType", 32), Str(a, "toolName", 64), wid, pathHash));
                }
            }
            return list;
        }
        catch (JsonException) { return null; }
    }

    public static IReadOnlyList<OrcaTerminal>? ParseTerminals(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!Result(doc.RootElement).TryGetProperty("terminals", out var ts) || ts.ValueKind != JsonValueKind.Array) return null;
            var list = new List<OrcaTerminal>();
            foreach (var t in ts.EnumerateArray())
            {
                if (t.ValueKind != JsonValueKind.Object || Str(t, "handle", 128) is not { } handle) continue;
                list.Add(new OrcaTerminal(handle, Str(t, "tabId", 128), Str(t, "leafId", 128), Str(t, "worktreeId", 128)));
            }
            return list;
        }
        catch (JsonException) { return null; }
    }

    private static JsonElement Result(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.Object ? r : root;

    private static string? Str(JsonElement o, string name, int max) =>
        o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? Privacy.Clean(v.GetString(), max) is { Length: > 0 } s ? s : null : null;
}

/// <summary>
/// Optional Orca enrichment: polls <c>orca worktree ps --json</c> + <c>orca terminal list --json</c> every 10 s while an AI
/// action is visible and Orca is installed. Orca is never the source of a session or a state (lead decision); without
/// Orca everything still works.
/// </summary>
public sealed class OrcaEnricher : IAsyncDisposable
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private readonly SessionTracker _tracker;
    private readonly ICommandRunner _runner;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly Func<bool> _enabled;
    private readonly CancellationTokenSource _cts = new();
    private Task? _loop;
    private string? _orca;

    public OrcaEnricher(SessionTracker tracker, ICommandRunner runner, TimeProvider time, ILog log, Func<bool> enabled)
    {
        _tracker = tracker;
        _runner = runner;
        _time = time;
        _log = log;
        _enabled = enabled;
    }

    public bool Present => _orca is not null;
    public string? OrcaPath => _orca;

    public void Start()
    {
        _orca = _runner.Find("orca.exe");
        if (_orca is null) { _log.Debug("Orca not installed: no enrichment"); return; }
        _loop = Task.Run(() => LoopAsync(_cts.Token));
    }

    private async Task LoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (_enabled()) await PollOnceAsync(ct).ConfigureAwait(false);
                await Task.Delay(Interval, _time, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                _log.Debug($"Orca poll failed: {ex.GetType().Name}");
                await Task.Delay(TimeSpan.FromSeconds(30), _time, ct).ConfigureAwait(false);
            }
        }
    }

    public async Task PollOnceAsync(CancellationToken ct)
    {
        if (_orca is null) return;
        var ps = await _runner.RunAsync(new CommandSpec(_orca, ["worktree", "ps", "--json"], TimeSpan.FromSeconds(3), 8 << 20), ct).ConfigureAwait(false);
        var terms = await _runner.RunAsync(new CommandSpec(_orca, ["terminal", "list", "--json"], TimeSpan.FromSeconds(3), 8 << 20), ct).ConfigureAwait(false);
        var agents = ps.Ok ? OrcaParser.ParseWorktrees(ps.StdOut) : null;
        var terminals = terms.Ok ? OrcaParser.ParseTerminals(terms.StdOut) : null;
        if (agents is null && terminals is null) return;
        _tracker.ApplyOrca(new OrcaSnapshot(agents ?? [], terminals ?? [], _time.GetUtcNow()));
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_loop is not null) { try { await _loop.ConfigureAwait(false); } catch (OperationCanceledException) { } }
        _cts.Dispose();
    }
}
