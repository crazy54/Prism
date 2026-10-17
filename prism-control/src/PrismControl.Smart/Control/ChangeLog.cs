using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Smart.Prefs;

namespace PrismControl.Smart.Control;

/// <summary>
/// One undoable change made through the AI channel: the fields it touched, each with its value before and the value it
/// set (field-level inverse patches, review B4: undo puts back only these fields, on the current state).
/// </summary>
public abstract record UndoEntry(string Kind, string Summary, DateTimeOffset At, IReadOnlyList<FieldChange> Changes);

/// <summary>A preferences change (prefs.set, pin).</summary>
public sealed record PrefsUndo(string Kind, string Summary, DateTimeOffset At, IReadOnlyList<FieldChange> Changes) : UndoEntry(Kind, Summary, At, Changes);

/// <summary>A change of one pack's AI override file (<c>&lt;pack&gt;.ai.json</c>).</summary>
public sealed record FileUndo(string Kind, string Summary, DateTimeOffset At, string Path, string PackId, IReadOnlyList<FieldChange> Changes) : UndoEntry(Kind, Summary, At, Changes);

/// <summary>
/// Undo (50 steps) and the audit trail of the AI preferences channel. Audit lines go to
/// <c>%APPDATA%\Prism\control\modules\smart\audit.jsonl</c> (rolled at 1 MB) and a 200-entry memory ring for the PI: what
/// happened, when, which client, and a small detail object. Never tokens, pipe names, file contents or window titles.
/// Thread-safe.
/// </summary>
public sealed class ChangeLog(string? auditFile, TimeProvider time)
{
    public const int Depth = 50;
    public const int AuditMemory = 200;
    public const long AuditMaxBytes = 1024 * 1024;

    private static readonly JsonSerializerOptions Compact = new() { WriteIndented = false, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private readonly object _gate = new();
    private readonly List<UndoEntry> _stack = [];
    private readonly LinkedList<JsonObject> _audit = new();

    public string? AuditFile => auditFile;

    public int UndoDepth { get { lock (_gate) return _stack.Count; } }

    public IReadOnlyList<UndoEntry> Entries { get { lock (_gate) return [.. _stack]; } }

    public void Push(UndoEntry e)
    {
        lock (_gate)
        {
            _stack.Add(e);
            if (_stack.Count > Depth) _stack.RemoveAt(0);
        }
    }

    /// <summary>The newest entry (not removed).</summary>
    public UndoEntry? Peek() { lock (_gate) return _stack.Count == 0 ? null : _stack[^1]; }

    /// <summary>Removes the newest entry if it is still <paramref name="e"/>.</summary>
    public bool Pop(UndoEntry e)
    {
        lock (_gate)
        {
            if (_stack.Count == 0 || !ReferenceEquals(_stack[^1], e)) return false;
            _stack.RemoveAt(_stack.Count - 1);
            return true;
        }
    }

    public void Clear() { lock (_gate) _stack.Clear(); }

    /// <summary>Appends an audit line. <paramref name="detail"/> must hold no secrets (ids, counts, setting names and values only).</summary>
    public JsonObject Record(string kind, string? client, JsonObject? detail = null)
    {
        var e = new JsonObject { ["at"] = time.GetUtcNow().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture), ["kind"] = kind };
        if (client is not null) e["client"] = client;
        if (detail is not null) e["detail"] = detail;
        lock (_gate)
        {
            _audit.AddLast(e);
            while (_audit.Count > AuditMemory) _audit.RemoveFirst();
            Append(e);
        }
        return e;
    }

    public IReadOnlyList<JsonObject> RecentAudit(int n) { lock (_gate) return [.. _audit.Reverse().Take(n).Select(x => (JsonObject)x.DeepClone())]; }

    private void Append(JsonObject e)
    {
        if (auditFile is null) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(auditFile)!);
            var fi = new FileInfo(auditFile);
            if (fi.Exists && fi.Length > AuditMaxBytes) File.Move(auditFile, auditFile + ".1", overwrite: true);
            File.AppendAllText(auditFile, e.ToJsonString(Compact) + "\n");
        }
        catch (IOException) { /* the memory ring still has it */ }
        catch (UnauthorizedAccessException) { }
    }
}
