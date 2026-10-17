using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Sessions;

/// <summary>
/// Keys bind to slots, not session ids, so a profile works every day (research/ai-apps.md §5.3):
/// <list type="bullet">
/// <item>a pinned session always gets its pinned slot;</item>
/// <item>new sessions take the lowest free slot (a first batch is ordered by start time);</item>
/// <item>a session keeps its slot until it has been offline for 10 minutes, so a resumed session comes back to the same key.</item>
/// </list>
/// Not thread-safe on its own: <see cref="SessionTracker"/> calls it under its lock.
/// </summary>
public sealed class SlotTable
{
    public const int MaxSlots = 24;
    public static readonly TimeSpan ReleaseAfterOffline = TimeSpan.FromMinutes(10);

    private readonly Dictionary<SessionKey, int> _assigned = new();
    private readonly Dictionary<SessionKey, DateTimeOffset> _offlineSince = new();
    private readonly Dictionary<SessionKey, int> _pins = new();
    private readonly IPinStore _store;

    public SlotTable(IPinStore? store = null)
    {
        _store = store ?? new MemoryPinStore();
        foreach (var (k, s) in _store.Load()) if (s is >= 1 and <= MaxSlots) _pins[k] = s;
    }

    public IReadOnlyDictionary<SessionKey, int> Pins => _pins;

    public int? SlotOf(SessionKey key) => _assigned.TryGetValue(key, out var s) ? s : null;

    public bool IsPinned(SessionKey key) => _pins.ContainsKey(key);

    public SessionKey? KeyIn(int slot)
    {
        foreach (var (k, s) in _assigned) if (s == slot) return k;
        return null;
    }

    /// <summary>Gives every session in <paramref name="byStart"/> (already ordered by start time) a slot if it has none.</summary>
    public void Assign(IEnumerable<SessionKey> byStart)
    {
        foreach (var key in byStart)
        {
            _offlineSince.Remove(key);
            if (_pins.TryGetValue(key, out var pinned))
            {
                if (_assigned.TryGetValue(key, out var cur) && cur == pinned) continue;
                // Evict an unpinned holder of the pinned slot to the lowest free slot.
                if (KeyIn(pinned) is { } holder && !holder.Equals(key)) _assigned.Remove(holder);
                _assigned[key] = pinned;
                continue;
            }
            if (_assigned.ContainsKey(key)) continue;
            var free = LowestFree();
            if (free is { } f) _assigned[key] = f;
        }
        // Re-seat anyone evicted above.
        foreach (var key in byStart)
            if (!_assigned.ContainsKey(key) && LowestFree() is { } f) _assigned[key] = f;
    }

    /// <summary>The session went offline (ended, crashed, removed). Its slot is held for 10 minutes.</summary>
    public void MarkOffline(SessionKey key, DateTimeOffset at)
    {
        if (_assigned.ContainsKey(key) && !_offlineSince.ContainsKey(key)) _offlineSince[key] = at;
    }

    public void MarkOnline(SessionKey key) => _offlineSince.Remove(key);

    /// <summary>Releases slots offline for 10 minutes (pinned slots stay reserved for their session).</summary>
    public void Release(DateTimeOffset now, Func<SessionKey, bool> exists)
    {
        foreach (var (k, since) in _offlineSince.ToList())
        {
            if (now - since < ReleaseAfterOffline) continue;
            _offlineSince.Remove(k);
            if (!_pins.ContainsKey(k)) _assigned.Remove(k);
        }
        // Sessions removed from the table without an offline mark (should not happen) lose unpinned slots too.
        foreach (var k in _assigned.Keys.ToList())
            if (!exists(k) && !_offlineSince.ContainsKey(k) && !_pins.ContainsKey(k)) _offlineSince[k] = now;
    }

    /// <summary>Pins <paramref name="key"/> to <paramref name="slot"/> (the key it is shown on). Returns false if out of range.</summary>
    public bool Pin(SessionKey key, int slot)
    {
        if (slot is < 1 or > MaxSlots) return false;
        foreach (var (k, s) in _pins.ToList()) if (s == slot && !k.Equals(key)) _pins.Remove(k);
        _pins[key] = slot;
        if (KeyIn(slot) is { } holder && !holder.Equals(key)) _assigned.Remove(holder);
        _assigned[key] = slot;
        _store.Save(_pins);
        return true;
    }

    public bool Unpin(SessionKey key)
    {
        if (!_pins.Remove(key)) return false;
        _store.Save(_pins);
        return true;
    }

    private int? LowestFree()
    {
        var used = new HashSet<int>(_assigned.Values);
        foreach (var s in _pins.Values) used.Add(s);   // a pinned slot stays reserved for its session
        for (var i = 1; i <= MaxSlots; i++) if (!used.Contains(i)) return i;
        return null;
    }
}

/// <summary>Where slot pins live (module data: session id → slot, nothing else).</summary>
public interface IPinStore
{
    IReadOnlyDictionary<SessionKey, int> Load();
    void Save(IReadOnlyDictionary<SessionKey, int> pins);
}

public sealed class MemoryPinStore : IPinStore
{
    private Dictionary<SessionKey, int> _pins = new();
    public IReadOnlyDictionary<SessionKey, int> Load() => new Dictionary<SessionKey, int>(_pins);
    public void Save(IReadOnlyDictionary<SessionKey, int> pins) => _pins = new Dictionary<SessionKey, int>(pins);
}

/// <summary>
/// <c>pins.json</c> in the module's data folder, written atomically. In safe mode the module uses <see cref="MemoryPinStore"/>
/// (a fake host pressing at random must not pin anything for later).
/// </summary>
public sealed class FilePinStore(string directory, ILog log) : IPinStore
{
    private string FilePath => Path.Combine(directory, "pins.json");

    public IReadOnlyDictionary<SessionKey, int> Load()
    {
        var result = new Dictionary<SessionKey, int>();
        try
        {
            if (!File.Exists(FilePath)) return result;
            if (JsonNode.Parse(File.ReadAllText(FilePath)) is not JsonObject o || o["pins"] is not JsonArray arr) return result;
            foreach (var item in arr)
            {
                if (item is not JsonObject p) continue;
                var agent = SessionStates.ParseAgent(p["agent"]?.GetValue<string>());
                var id = p["id"]?.GetValue<string>();
                var slot = p["slot"]?.GetValue<int>() ?? 0;
                if (agent != AgentKind.Unknown && !string.IsNullOrEmpty(id) && id.Length <= 128) result[new SessionKey(agent, id)] = slot;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException or FormatException)
        {
            log.Warn("pins.json is unreadable; starting without pins");
        }
        return result;
    }

    public void Save(IReadOnlyDictionary<SessionKey, int> pins)
    {
        try
        {
            Directory.CreateDirectory(directory);
            var arr = new JsonArray();
            foreach (var (k, s) in pins) arr.Add(new JsonObject { ["agent"] = k.Agent.ToString().ToLowerInvariant(), ["id"] = k.Id, ["slot"] = s });
            var tmp = FilePath + ".tmp";
            File.WriteAllText(tmp, new JsonObject { ["v"] = 1, ["pins"] = arr }.ToJsonString());
            File.Move(tmp, FilePath, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            log.Warn("could not save pins.json");
        }
    }
}
