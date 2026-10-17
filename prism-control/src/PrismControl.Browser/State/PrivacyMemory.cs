using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Browser.Protocol;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.State;

/// <summary>
/// What each browser profile's own streamer-safe choices were the last time its extension spoke (hello / state.full
/// <c>privacySettings</c>): the base level, the "while streaming" level and whether always-hidden sites are listed.
/// <para>
/// The SMTC lite tier (HIGH 1) needs it: Windows' media session says nothing about the site or profile, so while no
/// extension is connected the plugin cannot tell an always-hidden site's video from any other. The lite tier therefore
/// never shows more than the strictest profile allows: its base level, "domain" when that profile hides sites, and its
/// "while streaming" level while streaming. Kept in <c>privacy-memory.json</c> in the module data folder so it already
/// applies in the seconds after Prism Control starts, before the extension reconnects. Profile keys are stored hashed.
/// </para>
/// </summary>
public sealed class PrivacyMemory
{
    public const string FileName = "privacy-memory.json";

    private readonly object _gate = new();
    private readonly string? _path;
    private readonly bool _readOnly;
    private readonly ILog _log;
    private readonly Dictionary<string, PrivacySettings> _profiles = new(StringComparer.Ordinal);
    private bool _unreadable;

    /// <param name="path">The file, or null to keep it in memory only (tests).</param>
    /// <param name="readOnly">Safe mode: read the file, never write it.</param>
    public PrivacyMemory(string? path = null, ILog? log = null, bool readOnly = false)
    {
        _path = path;
        _readOnly = readOnly;
        _log = log ?? NullLog.Instance;
        Load();
    }

    /// <summary>Records a profile's settings. True when the floor may have changed.</summary>
    public bool Remember(string profileKey, PrivacySettings settings)
    {
        var id = WireParser.Redact(profileKey);
        lock (_gate)
        {
            if (_profiles.TryGetValue(id, out var prev) && prev == settings && !_unreadable) return false;
            _profiles[id] = settings;
            _unreadable = false;
            Save();
            return true;
        }
    }

    /// <summary>
    /// The strictest level any remembered profile asks for: its base level; <c>domain</c> when it lists always-hidden sites
    /// (their media can't be told apart in Windows' session); and, while <paramref name="streaming"/>, its "while streaming"
    /// level. An unreadable memory file counts as <c>domain</c> until an extension reports again.
    /// </summary>
    public string Floor(bool streaming)
    {
        lock (_gate)
        {
            var level = _unreadable ? Wire.Privacy.Domain : Wire.Privacy.Full;
            foreach (var p in _profiles.Values)
            {
                level = Wire.Privacy.Stricter(level, p.Base);
                if (p.AlwaysHidden > 0) level = Wire.Privacy.Stricter(level, Wire.Privacy.Domain);
                if (streaming) level = Wire.Privacy.Stricter(level, p.WhileStreaming);
            }
            return level;
        }
    }

    private void Load()
    {
        if (_path is null || !File.Exists(_path)) return;
        try
        {
            var root = JsonNode.Parse(File.ReadAllText(_path)) as JsonObject;
            if (root?["profiles"] is not JsonObject profiles) throw new JsonException("no profiles");
            foreach (var (id, node) in profiles.Take(64))
                if (node is JsonObject o && WireParser.ParsePrivacySettings(o) is { } s) _profiles[id] = s;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException)
        {
            _unreadable = true;
            _log.Warn("browser privacy memory unreadable: the SMTC lite tier shows no titles until an extension connects");
        }
    }

    private void Save()
    {
        if (_path is null || _readOnly) return;
        try
        {
            var profiles = new JsonObject();
            foreach (var (id, s) in _profiles)
                profiles[id] = new JsonObject { ["base"] = s.Base, ["whileStreaming"] = s.WhileStreaming, ["alwaysHidden"] = s.AlwaysHidden };
            var text = new JsonObject { ["v"] = 1, ["profiles"] = profiles }.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(_path))!);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, text);
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Debug("browser privacy memory not saved: " + ex.GetType().Name);
        }
    }
}
