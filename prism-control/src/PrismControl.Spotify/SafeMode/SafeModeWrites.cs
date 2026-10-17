using PrismControl.Core.Hosting;

namespace PrismControl.Spotify.SafeMode;

/// <summary>
/// The writes safe mode suppressed (docs/authoring-actions.md § Safe mode), counted by kind so tests can prove that
/// presses and turns changed nothing real. Kinds name the operation only ("PUT /me/player/pause", "smtc next",
/// "launch", "vault save tokens"): never track URIs, tokens or other user data. The first suppression in the process
/// is logged at Info; later ones at Debug. Thread-safe.
/// </summary>
public sealed class SafeModeWrites
{
    private static int s_loggedOnce;
    private readonly ILog _log;
    private readonly Dictionary<string, int> _counts = new(StringComparer.Ordinal);

    public SafeModeWrites(ILog log, bool enabled)
    {
        _log = log;
        Enabled = enabled;
    }

    /// <summary>True in safe mode (PRISM_CONTROL_SAFE_MODE=1): writes become fakes.</summary>
    public bool Enabled { get; }

    /// <summary>Every suppressed write so far.</summary>
    public int Total { get { lock (_counts) return _counts.Values.Sum(); } }

    /// <summary>How often a kind of write was suppressed.</summary>
    public int Count(string kind) { lock (_counts) return _counts.GetValueOrDefault(kind); }

    /// <summary>Counts of suppressed writes by kind.</summary>
    public IReadOnlyDictionary<string, int> ByKind { get { lock (_counts) return new Dictionary<string, int>(_counts, StringComparer.Ordinal); } }

    /// <summary>Records that <paramref name="kind"/> would have been written.</summary>
    public void Suppressed(string kind)
    {
        lock (_counts) _counts[kind] = _counts.GetValueOrDefault(kind) + 1;
        if (Interlocked.Exchange(ref s_loggedOnce, 1) == 0)
            _log.Info($"[safe mode] Spotify writes are suppressed (first: {kind}); keys and dials update local fake state only.");
        else _log.Debug($"[safe mode] would {kind}");
    }
}
