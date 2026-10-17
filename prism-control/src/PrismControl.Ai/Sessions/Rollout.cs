using System.Buffers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Sessions;

/// <summary>One Codex rate-limit window (label by window minutes: 300 = 5 h, 10080 = weekly), for AI2's usage dials.</summary>
public sealed record CodexLimitWindow(double UsedPercent, int WindowMinutes, DateTimeOffset? ResetsAt);

public sealed record CodexRateLimits(string ThreadId, IReadOnlyList<CodexLimitWindow> Windows, DateTimeOffset At);

/// <summary>
/// Reads one rollout line (<c>{timestamp, type, payload}</c>) with a streaming reader that only materializes allow-listed
/// keys: <c>session_meta</c> (id, session_id, cwd → hash + basename, originator) and <c>event_msg</c> payload types
/// <c>task_started</c>, <c>task_complete</c> (whether <c>error</c> is non-null), <c>turn_aborted</c> and <c>token_count</c>
/// (rate limits only). Every other value (<c>response_item</c>, <c>last_agent_message</c>, instructions, …) is skipped
/// without being decoded. The format "isn't a stable interface" ([H]): anything unexpected is ignored.
/// </summary>
public static partial class RolloutLineReader
{
    private static ReadOnlySpan<byte> TypeKey => "type"u8;
    private static ReadOnlySpan<byte> PayloadKey => "payload"u8;
    private static ReadOnlySpan<byte> TimestampKey => "timestamp"u8;

    public static (RolloutEvent? Event, CodexRateLimits? Limits) TryRead(ReadOnlySpan<byte> line, string threadId, DateTimeOffset now)
    {
        try
        {
            var reader = new Utf8JsonReader(line, new JsonReaderOptions { MaxDepth = 64 });
            if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject) return (null, null);
            string? type = null;
            DateTimeOffset? at = null;
            int payloadStart = -1, payloadEnd = -1;
            while (reader.Read() && reader.TokenType == JsonTokenType.PropertyName)
            {
                if (reader.ValueTextEquals(TypeKey))
                {
                    reader.Read();
                    type = reader.TokenType == JsonTokenType.String && reader.ValueSpan.Length <= 32 ? reader.GetString() : null;
                    if (type is not ("event_msg" or "session_meta")) return (null, null);   // response_item etc.: stop reading
                }
                else if (reader.ValueTextEquals(TimestampKey))
                {
                    reader.Read();
                    if (reader.TokenType == JsonTokenType.String && reader.ValueSpan.Length <= 40 && reader.TryGetDateTimeOffset(out var t)) at = t;
                    else reader.Skip();
                }
                else if (reader.ValueTextEquals(PayloadKey))
                {
                    reader.Read();
                    if (reader.TokenType != JsonTokenType.StartObject) { reader.Skip(); continue; }
                    payloadStart = (int)reader.TokenStartIndex;
                    reader.Skip();
                    payloadEnd = (int)reader.BytesConsumed;
                }
                else
                {
                    reader.Read();
                    reader.Skip();
                }
            }
            if (type is null || payloadStart < 0) return (null, null);
            var when = at is { } a && a <= now ? a : now;
            var payload = line[payloadStart..payloadEnd];
            return type == "session_meta" ? (ReadMeta(payload, threadId, when), null) : ReadEventMsg(payload, threadId, when);
        }
        catch (JsonException)
        {
            return (null, null);
        }
    }

    private static RolloutEvent? ReadMeta(ReadOnlySpan<byte> payload, string threadId, DateTimeOffset at)
    {
        var r = new Utf8JsonReader(payload);
        r.Read();
        string? id = null, sid = null, cwd = null, originator = null;
        while (r.Read() && r.TokenType == JsonTokenType.PropertyName)
        {
            if (r.ValueTextEquals("id"u8)) id = ReadShortString(ref r, 128);
            else if (r.ValueTextEquals("session_id"u8)) sid = ReadShortString(ref r, 128);
            else if (r.ValueTextEquals("cwd"u8)) cwd = ReadShortString(ref r, 1024);
            else if (r.ValueTextEquals("originator"u8)) originator = ReadShortString(ref r, 64);
            else { r.Read(); r.Skip(); }
        }
        return new RolloutEvent(sid ?? id ?? threadId, RolloutKind.SessionMeta, at, originator, Privacy.CwdHash(cwd), Privacy.CwdName(cwd));
    }

    private static (RolloutEvent?, CodexRateLimits?) ReadEventMsg(ReadOnlySpan<byte> payload, string threadId, DateTimeOffset at)
    {
        // Pass 1: the payload type (it may follow other keys).
        var r = new Utf8JsonReader(payload);
        r.Read();
        string? kind = null;
        while (r.Read() && r.TokenType == JsonTokenType.PropertyName)
        {
            if (r.ValueTextEquals(TypeKey)) { kind = ReadShortString(ref r, 32); break; }
            r.Read();
            r.Skip();
        }
        switch (kind)
        {
            case "task_started":
                return (new RolloutEvent(threadId, RolloutKind.TaskStarted, at), null);
            case "turn_aborted":
                return (new RolloutEvent(threadId, RolloutKind.TurnAborted, at), null);
            case "task_complete":
            {
                var p = new Utf8JsonReader(payload);
                p.Read();
                var hasError = false;
                while (p.Read() && p.TokenType == JsonTokenType.PropertyName)
                {
                    var isError = p.ValueTextEquals("error"u8);
                    p.Read();
                    if (isError) hasError = p.TokenType != JsonTokenType.Null && !(p.TokenType == JsonTokenType.String && p.ValueSpan.Length == 0);
                    p.Skip();   // last_agent_message and everything else: never decoded
                }
                return (new RolloutEvent(threadId, RolloutKind.TaskComplete, at, HasError: hasError), null);
            }
            case "token_count":
                return (null, ReadRateLimits(payload, threadId, at));
            default:
                return (null, null);
        }
    }

    private static CodexRateLimits? ReadRateLimits(ReadOnlySpan<byte> payload, string threadId, DateTimeOffset at)
    {
        var r = new Utf8JsonReader(payload);
        r.Read();
        var windows = new List<CodexLimitWindow>();
        while (r.Read() && r.TokenType == JsonTokenType.PropertyName)
        {
            if (!r.ValueTextEquals("rate_limits"u8)) { r.Read(); r.Skip(); continue; }
            r.Read();
            if (r.TokenType != JsonTokenType.StartObject) { r.Skip(); continue; }
            while (r.Read() && r.TokenType == JsonTokenType.PropertyName)
            {
                var isWindow = r.ValueTextEquals("primary"u8) || r.ValueTextEquals("secondary"u8);
                r.Read();
                if (!isWindow || r.TokenType != JsonTokenType.StartObject) { r.Skip(); continue; }
                double? used = null;
                int? minutes = null;
                DateTimeOffset? resets = null;
                long? resetsIn = null;
                while (r.Read() && r.TokenType == JsonTokenType.PropertyName)
                {
                    if (r.ValueTextEquals("used_percent"u8)) { r.Read(); if (r.TokenType == JsonTokenType.Number) used = r.GetDouble(); }
                    else if (r.ValueTextEquals("window_minutes"u8)) { r.Read(); if (r.TokenType == JsonTokenType.Number && r.TryGetInt32(out var m)) minutes = m; }
                    else if (r.ValueTextEquals("resets_at"u8)) { r.Read(); if (r.TokenType == JsonTokenType.Number && r.TryGetInt64(out var s)) resets = DateTimeOffset.FromUnixTimeSeconds(s); }
                    else if (r.ValueTextEquals("resets_in_seconds"u8)) { r.Read(); if (r.TokenType == JsonTokenType.Number && r.TryGetInt64(out var s)) resetsIn = s; }
                    else { r.Read(); r.Skip(); }
                }
                if (used is { } u && minutes is { } w)
                    windows.Add(new CodexLimitWindow(u, w, resets ?? (resetsIn is { } ri ? at + TimeSpan.FromSeconds(ri) : null)));
            }
        }
        return windows.Count == 0 ? null : new CodexRateLimits(threadId, windows, at);
    }

    private static string? ReadShortString(ref Utf8JsonReader r, int max)
    {
        r.Read();
        if (r.TokenType != JsonTokenType.String) { r.Skip(); return null; }
        if (r.ValueSpan.Length > max * 4) return null;   // over the cap: not decoded at all
        return Privacy.Clean(r.GetString(), max);
    }

    [GeneratedRegex(@"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$")]
    private static partial Regex ThreadIdInName();

    /// <summary><c>rollout-&lt;local time&gt;-&lt;threadId&gt;.jsonl</c> → the thread id (null if the name doesn't end in a UUID).</summary>
    public static string? ThreadIdFromFileName(string path)
    {
        var m = ThreadIdInName().Match(Path.GetFileName(path));
        return m.Success ? m.Groups[1].Value.ToLowerInvariant() : null;
    }
}

/// <summary>
/// Tails <c>%CODEX_HOME%\sessions\**\rollout-*.jsonl</c> (FileSystemWatcher + offsets; a 30 s rescan as a fallback).
/// On start it catches up on files written in the last <see cref="InitialWindow"/>, reading only their first line (the
/// session_meta) and their last <see cref="TailWindow"/> bytes. Lines are parsed by <see cref="RolloutLineReader"/> only.
/// </summary>
public sealed class RolloutTailer : IDisposable
{
    public static readonly TimeSpan InitialWindow = TimeSpan.FromHours(6);
    public const int TailWindow = 256 * 1024;
    public const int MaxFirstLine = 2 * 1024 * 1024;
    public const int MaxTrackedFiles = 32;

    private readonly string _root;
    private readonly SessionTracker _tracker;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly Action<CodexRateLimits>? _onLimits;
    private readonly Dictionary<string, FileState> _files = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();
    private FileSystemWatcher? _watcher;
    private ITimer? _rescan;

    public RolloutTailer(string sessionsRoot, SessionTracker tracker, TimeProvider time, ILog log, Action<CodexRateLimits>? onLimits = null)
    {
        _root = sessionsRoot;
        _tracker = tracker;
        _time = time;
        _log = log;
        _onLimits = onLimits;
    }

    /// <summary>%CODEX_HOME%\sessions, or ~/.codex/sessions.</summary>
    public static string DefaultRoot()
    {
        var home = Environment.GetEnvironmentVariable("CODEX_HOME");
        if (string.IsNullOrWhiteSpace(home)) home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex");
        return Path.Combine(home, "sessions");
    }

    public bool Active => _watcher is not null;

    public void Start()
    {
        if (!Directory.Exists(_root)) { _log.Debug("no Codex sessions folder"); return; }
        try
        {
            _watcher = new FileSystemWatcher(_root, "rollout-*.jsonl")
            {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                InternalBufferSize = 64 * 1024,
            };
            _watcher.Changed += (_, e) => SafeProcess(e.FullPath);
            _watcher.Created += (_, e) => SafeProcess(e.FullPath);
            _watcher.EnableRaisingEvents = true;
        }
        catch (Exception ex) when (ex is IOException or ArgumentException or UnauthorizedAccessException)
        {
            _log.Debug("Codex sessions watcher unavailable");
        }
        Rescan();
        _rescan = _time.CreateTimer(_ => Rescan(), null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
    }

    /// <summary>Finds recent rollout files and processes new bytes in each.</summary>
    public void Rescan()
    {
        try
        {
            var cutoff = _time.GetUtcNow() - InitialWindow;
            var recent = new DirectoryInfo(_root).EnumerateFiles("rollout-*.jsonl", SearchOption.AllDirectories)
                .Where(f => f.LastWriteTimeUtc >= cutoff.UtcDateTime)
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Take(MaxTrackedFiles)
                .OrderBy(f => f.LastWriteTimeUtc)
                .ToList();
            foreach (var f in recent) SafeProcess(f.FullName);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or DirectoryNotFoundException)
        {
            _log.Debug("Codex sessions rescan failed");
        }
    }

    private void SafeProcess(string path)
    {
        try { Process(path); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The file is being written or rotated: the next change or rescan picks it up.
        }
        catch (Exception ex)
        {
            _log.Warn("Codex rollout tail failed", ex);
        }
    }

    /// <summary>Reads the new complete lines of one file (public for tests).</summary>
    public void Process(string path)
    {
        lock (_gate)
        {
            var threadId = RolloutLineReader.ThreadIdFromFileName(path);
            if (threadId is null) return;
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 16 * 1024);
            var len = fs.Length;
            if (!_files.TryGetValue(path, out var st))
            {
                if (_files.Count >= MaxTrackedFiles)
                {
                    var oldest = _files.OrderBy(kv => kv.Value.LastRead).First().Key;
                    _files.Remove(oldest);
                }
                st = new FileState { ThreadId = threadId };
                _files[path] = st;
                // The first line is session_meta: read it alone (bounded), then catch up from the tail only.
                var meta = ReadFirstLine(fs);
                if (meta is not null) Emit(meta, st);
                st.Offset = Math.Max(len > TailWindow ? len - TailWindow : 0, st.Offset);
                st.SkipPartial = st.Offset > 0;
            }
            if (len < st.Offset) { st.Offset = 0; st.Pending.Clear(); st.SkipPartial = false; }   // truncated or replaced
            if (len == st.Offset) return;
            fs.Seek(st.Offset, SeekOrigin.Begin);
            var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
            try
            {
                int n;
                while ((n = fs.Read(buffer, 0, buffer.Length)) > 0)
                {
                    st.Offset += n;
                    var span = buffer.AsSpan(0, n);
                    while (span.Length > 0)
                    {
                        var nl = span.IndexOf((byte)'\n');
                        if (nl < 0)
                        {
                            if (st.Pending.Count + span.Length <= MaxFirstLine) st.Pending.AddRange(span.ToArray());
                            else { st.Pending.Clear(); st.SkipPartial = true; }   // an oversized line: drop it
                            break;
                        }
                        var part = span[..nl];
                        span = span[(nl + 1)..];
                        if (st.SkipPartial) { st.SkipPartial = false; st.Pending.Clear(); continue; }
                        if (st.Pending.Count > 0)
                        {
                            st.Pending.AddRange(part.ToArray());
                            Emit(st.Pending.ToArray(), st);
                            st.Pending.Clear();
                        }
                        else Emit(part, st);
                    }
                }
            }
            finally { ArrayPool<byte>.Shared.Return(buffer); }
            st.LastRead = _time.GetUtcNow();
        }
    }

    private byte[]? ReadFirstLine(FileStream fs)
    {
        fs.Seek(0, SeekOrigin.Begin);
        var acc = new List<byte>();
        var buf = new byte[16 * 1024];
        int n;
        while ((n = fs.Read(buf, 0, buf.Length)) > 0)
        {
            var nl = Array.IndexOf(buf, (byte)'\n', 0, n);
            if (nl >= 0) { acc.AddRange(buf.AsSpan(0, nl).ToArray()); return acc.ToArray(); }
            acc.AddRange(buf.AsSpan(0, n).ToArray());
            if (acc.Count > MaxFirstLine) return null;
        }
        return null;   // no complete first line yet
    }

    private void Emit(ReadOnlySpan<byte> line, FileState st)
    {
        // Cheap prefix check before any JSON work: only event_msg / session_meta lines can matter.
        if (line.IndexOf("\"event_msg\""u8) < 0 && line.IndexOf("\"session_meta\""u8) < 0) return;
        var (e, limits) = RolloutLineReader.TryRead(line, st.ThreadId, _time.GetUtcNow());
        if (e is not null)
        {
            if (e.Kind == RolloutKind.SessionMeta && e.ThreadId != st.ThreadId) st.ThreadId = e.ThreadId;
            _tracker.ApplyRollout(e with { ThreadId = st.ThreadId });
        }
        if (limits is not null) _onLimits?.Invoke(limits with { ThreadId = st.ThreadId });
    }

    public void Dispose()
    {
        _watcher?.Dispose();
        _rescan?.Dispose();
    }

    private sealed class FileState
    {
        public string ThreadId = "";
        public long Offset;
        public bool SkipPartial;
        public readonly List<byte> Pending = [];
        public DateTimeOffset LastRead;
    }
}
