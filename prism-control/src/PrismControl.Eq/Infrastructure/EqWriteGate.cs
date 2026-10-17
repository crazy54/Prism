using PrismControl.Core.Hosting;

namespace PrismControl.Eq.Infrastructure;

/// <summary>
/// Safe mode for every EQ write (docs/authoring-actions.md § Safe mode): Sonar PUTs (EQ config, preset select, session
/// revert, volume, mute, ChatMix), the Equalizer APO files (config.txt attach/detach, prism-control.txt) and
/// apo-state.json. <see cref="EqModule"/> makes one from <c>IModuleContext.SafeMode</c> (so one per process) and hands it
/// to the Sonar client and the APO backend, the lowest layers that touch the PC. In safe mode <see cref="Allow"/> returns
/// false: the caller skips the write and keeps its in-memory model as if it had worked (keys and dials still respond),
/// and the gate counts what would have been written. Reads stay real. Thread-safe.
/// </summary>
public sealed class EqWriteGate
{
    private const int RecentMax = 64;

    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly Queue<string> _recent = new();
    private int _suppressed;
    private int _announced;

    public EqWriteGate(bool safeMode, ILog log)
    {
        SafeMode = safeMode;
        _log = log;
    }

    /// <summary>For code built without a module context: safe exactly when PRISM_CONTROL_SAFE_MODE is on in this process.</summary>
    public static EqWriteGate FromEnvironment(ILog log) => new(SafeModeEnvironment.FromEnvironment(), log);

    public bool SafeMode { get; }

    /// <summary>How many writes safe mode has suppressed ("would have written").</summary>
    public int Suppressed => Volatile.Read(ref _suppressed);

    /// <summary>The last suppressed writes, oldest first ("PUT /configs", "write prism-control.txt"). Never paths or user data.</summary>
    public IReadOnlyList<string> Recent { get { lock (_gate) return [.. _recent]; } }

    /// <summary>
    /// True: go ahead and write. False (safe mode): skip the write and update only the in-memory model. The first
    /// suppressed write is logged once per process; the rest at debug level.
    /// </summary>
    /// <param name="what">A short, data-free description: "PUT /configs", "attach config.txt".</param>
    public bool Allow(string what)
    {
        if (!SafeMode) return true;
        Interlocked.Increment(ref _suppressed);
        lock (_gate)
        {
            _recent.Enqueue(what);
            while (_recent.Count > RecentMax) _recent.Dequeue();
        }
        if (Interlocked.Exchange(ref _announced, 1) == 0)
            _log.Info($"[safe mode] EQ writes are simulated in memory: nothing is sent to Sonar or written for Equalizer APO (first: {what}; the rest at debug level).");
        else _log.Debug($"[safe mode] would {what}");
        return false;
    }
}
