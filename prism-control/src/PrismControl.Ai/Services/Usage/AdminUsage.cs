using System.Globalization;
using System.Runtime.Versioning;
using System.Text.Json;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;
using PrismControl.Core.Security;

namespace PrismControl.Ai.Services.Usage;

/// <summary>Where admin keys live: Core's <see cref="SecretStore"/> (DPAPI, current user) in production, memory in tests.</summary>
public interface ISecretVault
{
    string? Load(string name);
    void Save(string name, string secret);
    void Delete(string name);
}

[SupportedOSPlatform("windows")]
public sealed class SecretStoreVault(SecretStore store) : ISecretVault
{
    public string? Load(string name) => store.Load(name);
    public void Save(string name, string secret) => store.Save(name, secret);
    public void Delete(string name) => store.Delete(name);
}

public enum AdminProvider { Anthropic, OpenAi }

public enum AdminState { Off, SafeMode, NoKey, Waiting, Ok, Unauthorized, Error }

/// <summary>What a key save or removal really did (the PI reports exactly this).</summary>
public enum KeyChange { Done, SafeMode, NotAnAdminKey, StoreFailed }

/// <summary>Month-to-date cost and the last 24 hours of tokens. Daily data, NOT real-time: the faces say so.</summary>
public sealed record AdminSnapshot(AdminProvider Provider, AdminState State, Fact<CostSummary> MonthCost, Fact<double> Tokens24h,
    DateTimeOffset? LastAttempt, string? KeyHint);

/// <summary>
/// The Anthropic and OpenAI organization usage/cost APIs, OPT-IN per provider (ai-status.md §3.2). Admin keys are full-power and
/// unscoped, so: they are pasted from the clipboard on a PI click (never typed into a settings field), stored with DPAPI in
/// <see cref="ISecretVault"/>, never logged, never sent anywhere but the provider's own API host, and shown only as their last 4
/// characters. Two GETs per refresh, every 15 minutes while a surface is visible (pushes: at most every 5 minutes). Off in safe mode.
/// <para>Anthropic: <c>GET /v1/organizations/cost_report</c> (daily; <c>amount</c> is a decimal string in cents) and
/// <c>/v1/organizations/usage_report/messages</c> (hourly buckets). Its admin API doesn't cover Bedrock (this user's Claude Code).
/// OpenAI: <c>GET /v1/organization/costs</c> (daily; <c>amount.value</c> in dollars) and <c>/v1/organization/usage/completions</c>.</para>
/// </summary>
public sealed class AdminUsageService
{
    public static readonly TimeSpan Cadence = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan Floor = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan Ttl = TimeSpan.FromHours(1);
    /// <summary>One refresh (both GETs) may take at most this long on this service's clock; then it counts as an error.</summary>
    public static readonly TimeSpan RefreshDeadline = TimeSpan.FromSeconds(45);

    private sealed class State
    {
        public AdminState Status = AdminState.Waiting;
        public Fact<CostSummary> Cost = Fact<CostSummary>.Unknown;
        public Fact<double> Tokens = Fact<double>.Unknown;
        public DateTimeOffset? LastAttempt;
        public int Leases;
        public bool Forced;
        public int Running;
        /// <summary>The cached "••••abcd" hint: the vault (DPAPI) is read once, not on every frame.</summary>
        public string? Hint;
        public bool HintLoaded;
    }

    private readonly IHttpFetcher _http;
    private readonly ISecretVault _vault;
    private readonly Func<Ai2Settings> _settings;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly bool _safeMode;
    private readonly object _gate = new();
    private readonly Dictionary<AdminProvider, State> _state = new() { [AdminProvider.Anthropic] = new(), [AdminProvider.OpenAi] = new() };

    public AdminUsageService(IHttpFetcher http, ISecretVault vault, Func<Ai2Settings> settings, TimeProvider time, ILog log, bool safeMode)
    {
        _http = http;
        _vault = vault;
        _settings = settings;
        _time = time;
        _log = log;
        _safeMode = safeMode;
    }

    public event Action? Changed;

    public Action<Func<Task>> Kicker { get; set; } = work => _ = work();

    public static string SecretName(AdminProvider p) => p == AdminProvider.Anthropic ? "anthropic-admin" : "openai-admin";

    public static string ProviderName(AdminProvider p) => p == AdminProvider.Anthropic ? "Anthropic" : "OpenAI";

    /// <summary>Admin keys only: Anthropic <c>sk-ant-admin…</c>, OpenAI <c>sk-admin-…</c>. Ordinary API keys are refused.</summary>
    public static bool LooksLikeAdminKey(AdminProvider p, string? key)
    {
        if (key is null) return false;
        var k = key.Trim();
        if (k.Length is < 24 or > 400 || k.Any(char.IsWhiteSpace) || k.Any(char.IsControl)) return false;
        return p == AdminProvider.Anthropic ? k.StartsWith("sk-ant-admin", StringComparison.Ordinal) : k.StartsWith("sk-admin-", StringComparison.Ordinal);
    }

    public bool Enabled(AdminProvider p) => p == AdminProvider.Anthropic ? _settings().AnthropicAdminEnabled : _settings().OpenAiAdminEnabled;

    /// <summary>Stores a key (validated). Returns the last-4 hint, or null when refused. The key is never logged.</summary>
    public string? SaveKey(AdminProvider p, string? key) => TrySaveKey(p, key, out var hint) == KeyChange.Done ? hint : null;

    /// <summary>Stores a key (validated). <paramref name="hint"/> is the last-4 hint when saved. The key is never logged.</summary>
    public KeyChange TrySaveKey(AdminProvider p, string? key, out string? hint)
    {
        hint = null;
        if (_safeMode) return KeyChange.SafeMode;
        if (!LooksLikeAdminKey(p, key)) return KeyChange.NotAnAdminKey;
        var k = key!.Trim();
        try { _vault.Save(SecretName(p), k); }
        catch (Exception ex)
        {
            _log.Warn($"{ProviderName(p)} admin key could not be saved ({ex.GetType().Name})");
            return KeyChange.StoreFailed;
        }
        _log.Info($"{ProviderName(p)} admin key saved (DPAPI)");
        hint = Hint(k);
        lock (_gate)
        {
            Reset(_state[p]);
            _state[p].Hint = hint;
            _state[p].HintLoaded = true;
        }
        Changed?.Invoke();
        return KeyChange.Done;
    }

    /// <summary>
    /// Deletes the stored key. Safe mode never writes, so it reports <see cref="KeyChange.SafeMode"/> (the key stays) instead of
    /// pretending; a vault failure reports <see cref="KeyChange.StoreFailed"/>.
    /// </summary>
    public KeyChange ForgetKey(AdminProvider p)
    {
        if (_safeMode)
        {
            _log.Info($"[safe mode] would remove the {ProviderName(p)} admin key; nothing removed");
            return KeyChange.SafeMode;
        }
        try { _vault.Delete(SecretName(p)); }
        catch (Exception ex)
        {
            _log.Warn($"{ProviderName(p)} admin key could not be removed ({ex.GetType().Name})");
            lock (_gate) _state[p].HintLoaded = false;   // read it again: it may still be there
            return KeyChange.StoreFailed;
        }
        lock (_gate)
        {
            Reset(_state[p]);
            _state[p].Hint = null;
            _state[p].HintLoaded = true;
        }
        _log.Info($"{ProviderName(p)} admin key removed");
        Changed?.Invoke();
        return KeyChange.Done;
    }

    /// <summary>
    /// "••••abcd", or null when no key is stored. Cached: the vault (a DPAPI decrypt) is read once, then only after a save or a
    /// removal. A vault that throws (an unreadable file, a profile without DPAPI) counts as "no key" and never reaches a face.
    /// </summary>
    public string? KeyHint(AdminProvider p)
    {
        lock (_gate)
        {
            var st = _state[p];
            if (st.HintLoaded) return st.Hint;
        }
        string? hint = null;
        try { hint = _vault.Load(SecretName(p)) is { Length: > 4 } k ? Hint(k) : null; }
        catch (Exception ex) { _log.Warn($"{ProviderName(p)} admin key could not be read ({ex.GetType().Name})"); }
        lock (_gate)
        {
            _state[p].Hint = hint;
            _state[p].HintLoaded = true;
        }
        return hint;
    }

    /// <summary>The key itself, for the request only. Null on any vault problem.</summary>
    private string? LoadKey(AdminProvider p)
    {
        try { return _vault.Load(SecretName(p)); }
        catch (Exception ex)
        {
            _log.Warn($"{ProviderName(p)} admin key could not be read ({ex.GetType().Name})");
            return null;
        }
    }

    private static string Hint(string key) => "••••" + key[^4..];

    private static void Reset(State s)
    {
        s.Cost = Fact<CostSummary>.Unknown;
        s.Tokens = Fact<double>.Unknown;
        s.Status = AdminState.Waiting;
        s.LastAttempt = null;
    }

    public IDisposable Demand(AdminProvider p)
    {
        lock (_gate) _state[p].Leases++;
        Kicker(() => TickAsync(p, CancellationToken.None));
        return new Lease(this, p);
    }

    public bool RequestRefresh(AdminProvider p)
    {
        lock (_gate)
        {
            var s = _state[p];
            if (s.LastAttempt is { } l && _time.GetUtcNow() - l < Floor) return false;
            s.Forced = true;
        }
        Kicker(() => TickAsync(p, CancellationToken.None));
        return true;
    }

    public AdminSnapshot Snapshot(AdminProvider p)
    {
        var hint = KeyHint(p);
        lock (_gate)
        {
            var s = _state[p];
            var status = !Enabled(p) ? AdminState.Off : _safeMode ? AdminState.SafeMode : hint is null ? AdminState.NoKey : s.Status;
            return new AdminSnapshot(p, status, s.Cost, s.Tokens, s.LastAttempt, hint);
        }
    }

    public async Task TickAsync(AdminProvider p, CancellationToken ct)
    {
        if (_safeMode || !Enabled(p)) return;
        var now = _time.GetUtcNow();
        State s;
        lock (_gate)
        {
            s = _state[p];
            if (!s.Forced && s.Leases <= 0) return;
            if (s.LastAttempt is { } l && now - l < (s.Forced ? Floor : Cadence)) return;
            if (s.Running == 1) return;
            s.Running = 1;
            s.Forced = false;
            s.LastAttempt = now;
        }
        try
        {
            if (LoadKey(p) is not { } key)
            {
                lock (_gate) s.Status = AdminState.NoKey;
                return;
            }
            var (costReq, usageReq) = Requests(p, key, now);
            // One deadline on this service's clock for both GETs: a stalled answer ends as an error, never a hang.
            using var deadline = new CancellationTokenSource(RefreshDeadline, _time);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, deadline.Token);
            HttpFetchResult cost, usage;
            try
            {
                cost = await _http.GetAsync(costReq, linked.Token).WaitAsync(linked.Token).ConfigureAwait(false);
                usage = await _http.GetAsync(usageReq, linked.Token).WaitAsync(linked.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                cost = usage = HttpFetchResult.Failed;
            }
            lock (_gate)
            {
                if (cost.Status is 401 or 403 || usage.Status is 401 or 403) s.Status = AdminState.Unauthorized;
                else if (!cost.Ok || !usage.Ok) s.Status = AdminState.Error;
                else
                {
                    var c = p == AdminProvider.Anthropic ? ParseAnthropicCost(cost.Body) : ParseOpenAiCost(cost.Body);
                    var t = p == AdminProvider.Anthropic ? ParseAnthropicTokens(usage.Body) : ParseOpenAiTokens(usage.Body);
                    if (c is null || t is null) s.Status = AdminState.Error;
                    else
                    {
                        s.Status = AdminState.Ok;
                        s.Cost = Fact<CostSummary>.Reported(c, FactSource.AdminApi, now, Ttl);
                        s.Tokens = Fact<double>.Reported(t.Value, FactSource.AdminApi, now, Ttl);
                    }
                }
            }
            if (Snapshot(p).State != AdminState.Ok) _log.Info($"{ProviderName(p)} usage API: {Snapshot(p).State} (HTTP {cost.Status}/{usage.Status})");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            lock (_gate) s.Status = AdminState.Error;
            _log.Info($"{ProviderName(p)} usage API failed: {ex.GetType().Name}");
        }
        finally
        {
            lock (_gate) s.Running = 0;
            try { Changed?.Invoke(); } catch (Exception) { }
        }
    }

    /// <summary>The two GETs (public for tests). The key travels only in its header, never in the URL.</summary>
    public static (HttpFetchRequest Cost, HttpFetchRequest Usage) Requests(AdminProvider p, string key, DateTimeOffset now)
    {
        var month = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var day = now.UtcDateTime.AddHours(-24);
        var since = new DateTimeOffset(day.Year, day.Month, day.Day, day.Hour, 0, 0, TimeSpan.Zero);
        if (p == AdminProvider.Anthropic)
        {
            var h = new Dictionary<string, string> { ["x-api-key"] = key, ["anthropic-version"] = "2023-06-01" };
            return (new HttpFetchRequest(new Uri($"https://api.anthropic.com/v1/organizations/cost_report?starting_at={Iso(month)}&bucket_width=1d&limit=31"), Headers: h),
                new HttpFetchRequest(new Uri($"https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at={Iso(since)}&bucket_width=1h&limit=25"), Headers: h));
        }
        var oh = new Dictionary<string, string> { ["Authorization"] = "Bearer " + key };
        return (new HttpFetchRequest(new Uri($"https://api.openai.com/v1/organization/costs?start_time={month.ToUnixTimeSeconds()}&bucket_width=1d&limit=31"), Headers: oh),
            new HttpFetchRequest(new Uri($"https://api.openai.com/v1/organization/usage/completions?start_time={since.ToUnixTimeSeconds()}&bucket_width=1h&limit=25"), Headers: oh));
    }

    private static string Iso(DateTimeOffset t) => Uri.EscapeDataString(t.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));

    /// <summary>Anthropic cost_report: data[].results[].amount = a decimal string in cents.</summary>
    public static CostSummary? ParseAnthropicCost(byte[] body) => Each(body, r =>
    {
        var cents = r.TryGetProperty("amount", out var a) ? Decimal(a) : null;
        var cur = r.TryGetProperty("currency", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        return (cents / 100m, cur);
    }) is { } t ? new CostSummary(t.Sum, t.Currency ?? "USD", "month to date", "org · daily · not real-time") : null;

    /// <summary>OpenAI costs: data[].results[].amount.{value (dollars), currency}.</summary>
    public static CostSummary? ParseOpenAiCost(byte[] body) => Each(body, r =>
    {
        if (!r.TryGetProperty("amount", out var a) || a.ValueKind != JsonValueKind.Object) return (null, null);
        var v = a.TryGetProperty("value", out var val) ? Decimal(val) : null;
        var cur = a.TryGetProperty("currency", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString()?.ToUpperInvariant() : null;
        return (v, cur);
    }) is { } t ? new CostSummary(t.Sum, t.Currency ?? "USD", "month to date", "org · daily · not real-time") : null;

    /// <summary>Anthropic usage_report/messages: uncached + cache read + cache creation (5m, 1h) + output tokens.</summary>
    public static double? ParseAnthropicTokens(byte[] body) => (double?)Each(body, r =>
    {
        decimal sum = 0;
        foreach (var f in new[] { "uncached_input_tokens", "cache_read_input_tokens", "output_tokens" })
            if (r.TryGetProperty(f, out var v) && Decimal(v) is { } d) sum += d;
        if (r.TryGetProperty("cache_creation", out var cc) && cc.ValueKind == JsonValueKind.Object)
            foreach (var p in cc.EnumerateObject())
                if (Decimal(p.Value) is { } d) sum += d;
        return (sum, null);
    })?.Sum;

    /// <summary>OpenAI usage/completions: input + output tokens (cached input is part of input).</summary>
    public static double? ParseOpenAiTokens(byte[] body) => (double?)Each(body, r =>
    {
        decimal sum = 0;
        foreach (var f in new[] { "input_tokens", "output_tokens" })
            if (r.TryGetProperty(f, out var v) && Decimal(v) is { } d) sum += d;
        return (sum, null);
    })?.Sum;

    /// <summary>Sums a value over data[].results[]. Null when the body isn't that shape.</summary>
    private static (decimal Sum, string? Currency)? Each(byte[] body, Func<JsonElement, (decimal? Value, string? Currency)> pick)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array) return null;
            decimal sum = 0;
            string? currency = null;
            foreach (var bucket in data.EnumerateArray())
            {
                if (!bucket.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array) continue;
                foreach (var r in results.EnumerateArray())
                {
                    if (r.ValueKind != JsonValueKind.Object) continue;
                    var (v, c) = pick(r);
                    if (v is { } x) sum += x;
                    currency ??= c;
                }
            }
            return (sum, currency);
        }
        catch (JsonException) { return null; }
    }

    private static decimal? Decimal(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Number when e.TryGetDecimal(out var d) => d,
        JsonValueKind.String when decimal.TryParse(e.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
        _ => null,
    };

    private void Release(AdminProvider p)
    {
        lock (_gate) _state[p].Leases = Math.Max(0, _state[p].Leases - 1);
    }

    private sealed class Lease(AdminUsageService owner, AdminProvider p) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) owner.Release(p); }
    }
}
