using PrismControl.Core.Hosting;
using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Rebinds;

/// <summary>What the rebind reader found for one pack (for the PI; paths are shown with %ENV% placeholders, never the user name).</summary>
public sealed record RebindStatus(string PackId, string? DisplayPath, string? Format, int Entries, int Applied, string? Error)
{
    public bool Found => DisplayPath is not null;
}

/// <summary>
/// Expands pack location templates (<c>%APPDATA%\Code\User\keybindings.json</c>,
/// <c>%USERPROFILE%\Saved Games\…\&lt;steam-id&gt;\Config\Controls_remote.config.xml</c>) to existing files. A
/// <c>&lt;placeholder&gt;</c> segment matches any sub-folder (the newest file wins). Reads only directory listings.
/// </summary>
public sealed class RebindPaths(Func<string, string?>? env = null)
{
    private readonly Func<string, string?> _env = env ?? Environment.GetEnvironmentVariable;

    public string Expand(string template)
    {
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < template.Length; i++)
        {
            if (template[i] == '%')
            {
                var end = template.IndexOf('%', i + 1);
                if (end > i + 1)
                {
                    var name = template[(i + 1)..end];
                    var v = _env(name);
                    if (v is null) return "";
                    sb.Append(v);
                    i = end;
                    continue;
                }
            }
            sb.Append(template[i]);
        }
        return sb.ToString();
    }

    /// <summary>Existing files for a template, newest first. A template whose first segment is a placeholder (portable installs) resolves to nothing.</summary>
    public IReadOnlyList<string> Resolve(string template)
    {
        var expanded = Expand(template);
        if (expanded.Length == 0 || expanded.StartsWith('<')) return [];
        var parts = expanded.Replace('/', '\\').Split('\\');
        IEnumerable<string> cands = [parts[0] + (parts[0].EndsWith(':') ? "\\" : "")];
        for (var i = 1; i < parts.Length; i++)
        {
            var seg = parts[i];
            var last = i == parts.Length - 1;
            var next = new List<string>();
            foreach (var c in cands)
            {
                try
                {
                    if (seg.StartsWith('<') && seg.EndsWith('>'))
                    {
                        if (Directory.Exists(c)) next.AddRange(Directory.GetDirectories(c));
                    }
                    else
                    {
                        var p = Path.Combine(c, seg);
                        if (last ? File.Exists(p) : Directory.Exists(p)) next.Add(p);
                    }
                }
                catch (Exception) { /* unreadable folder: skip */ }
            }
            cands = next;
            if (next.Count == 0) return [];
        }
        return [.. cands.OrderByDescending(f => { try { return File.GetLastWriteTimeUtc(f); } catch { return DateTime.MinValue; } }).ThenBy(f => f, StringComparer.OrdinalIgnoreCase)];
    }

    /// <summary>The path with the user's folders replaced by their %VAR% names (for logs and the PI).</summary>
    public string Display(string path)
    {
        foreach (var name in new[] { "LOCALAPPDATA", "APPDATA", "USERPROFILE", "ProgramFiles" })
        {
            var v = _env(name);
            if (!string.IsNullOrEmpty(v) && path.StartsWith(v, StringComparison.OrdinalIgnoreCase)) return "%" + name + "%" + path[v.Length..];
        }
        return Path.GetFileName(path);
    }
}

/// <summary>
/// Reads each pack's user rebind file (read-only), applies it to the pack, and watches the file (debounced) so the deck
/// presses the user's real keys. A file that can't be parsed keeps the pack defaults and is reported in the status.
/// </summary>
public sealed class RebindService : IDisposable
{
    private readonly RebindPaths _paths;
    private readonly ILog _log;
    private readonly bool _watch;
    private readonly object _gate = new();
    private readonly Dictionary<string, FileSystemWatcher> _watchers = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, RebindStatus> _status = new(StringComparer.Ordinal);
    private Timer? _debounce;
    private bool _disposed;

    public RebindService(RebindPaths? paths = null, ILog? log = null, bool watch = true)
    {
        _paths = paths ?? new RebindPaths();
        _log = (log ?? NullLog.Instance).For("rebinds");
        _watch = watch;
    }

    /// <summary>A watched file changed (raised on the thread pool, debounced ~500 ms). Re-run <see cref="Apply"/>.</summary>
    public event Action? Changed;

    public IReadOnlyCollection<RebindStatus> Status { get { lock (_gate) return [.. _status.Values.OrderBy(s => s.PackId, StringComparer.Ordinal)]; } }

    /// <summary>Returns the packs with the user's rebinds applied.</summary>
    public IReadOnlyList<ContextPack> Apply(IReadOnlyList<ContextPack> packs)
    {
        var result = new List<ContextPack>(packs.Count);
        var status = new Dictionary<string, RebindStatus>(StringComparer.Ordinal);
        foreach (var pack in packs)
        {
            var (applied, st) = ApplyOne(pack);
            result.Add(applied);
            status[pack.Id] = st;
        }
        lock (_gate) _status = status;
        return result;
    }

    private (ContextPack, RebindStatus) ApplyOne(ContextPack pack)
    {
        if (pack.UserBindings.Storage != "file" || pack.UserBindings.Locations.Count == 0)
            return (pack, new RebindStatus(pack.Id, null, null, 0, 0, null));
        // The file also holds secrets (Discord keeps its login token next to the keybinds): never open it.
        if (pack.UserBindings.NeverRead)
            return (pack, new RebindStatus(pack.Id, null, null, 0, 0, "not read on purpose (the file also holds secrets)"));
        foreach (var loc in pack.UserBindings.Locations)
        {
            if (Path.GetFileName(loc.Path).Equals("defaults.json", StringComparison.OrdinalIgnoreCase)) continue;   // shipped defaults, not rebinds
            foreach (var file in _paths.Resolve(loc.Path))
            {
                var adapter = RebindAdapters.For(pack, file);
                if (adapter is null) continue;
                Watch(file);
                string text;
                try
                {
                    var info = new FileInfo(file);
                    if (info.Length > 4 * 1024 * 1024) return (pack, new RebindStatus(pack.Id, _paths.Display(file), adapter.Format, 0, 0, "file is larger than 4 MB"));
                    using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                    using var r = new StreamReader(fs);
                    text = r.ReadToEnd();
                }
                catch (Exception ex)
                {
                    return (pack, new RebindStatus(pack.Id, _paths.Display(file), adapter.Format, 0, 0, "cannot read: " + ex.GetType().Name));
                }
                var set = adapter.Parse(text, out var error);
                if (set is null)
                {
                    _log.Warn($"{pack.Id}: {_paths.Display(file)} could not be parsed ({error}); using the pack defaults.");
                    return (pack, new RebindStatus(pack.Id, _paths.Display(file), adapter.Format, 0, 0, error));
                }
                var applied = RebindAdapters.Apply(pack, set, out var n);
                if (n > 0) _log.Info($"{pack.Id}: {n} verb(s) follow your own binds from {_paths.Display(file)}.");
                return (applied, new RebindStatus(pack.Id, _paths.Display(file), adapter.Format, set.Count, n, null));
            }
        }
        return (pack, new RebindStatus(pack.Id, null, null, 0, 0, null));
    }

    private void Watch(string file)
    {
        if (!_watch) return;
        lock (_gate)
        {
            if (_disposed || _watchers.ContainsKey(file)) return;
            try
            {
                var w = new FileSystemWatcher(Path.GetDirectoryName(file)!, Path.GetFileName(file))
                {
                    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
                    IncludeSubdirectories = false,
                };
                w.Changed += (_, _) => Kick();
                w.Created += (_, _) => Kick();
                w.Renamed += (_, _) => Kick();
                w.EnableRaisingEvents = true;
                _watchers[file] = w;
            }
            catch (Exception ex) { _log.Debug($"Cannot watch {_paths.Display(file)}: {ex.GetType().Name}"); }
        }
    }

    private void Kick()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _debounce?.Dispose();
            _debounce = new Timer(_ => Changed?.Invoke(), null, 500, Timeout.Infinite);
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _disposed = true;
            _debounce?.Dispose();
            foreach (var w in _watchers.Values) w.Dispose();
            _watchers.Clear();
        }
    }
}
