using PrismControl.Core.Hosting;

namespace PrismControl.Macros.Engine;

/// <summary>
/// The dry run: what the engine uses instead of SendInput, ShellExecute, the browser and SetForegroundWindow when the
/// plugin runs in safe mode (the fake host, E2E) or with <c>PRISM_CONTROL_MACROS_DRY_RUN</c> set, and for any run an action
/// starts while its own <c>SafeMode</c> is on. Nothing here touches the PC: it counts what would have happened (tests assert
/// the counters) and logs one line per kind of effect at Info, the rest at Debug. Logs never carry typed text, full paths
/// or URL paths and queries: file names, schemes and hosts only.
/// </summary>
public sealed class DryRunEffects
{
    // Once per process, per kind of effect (send, launch, url, focus): the first suppressed write is logged at Info.
    private static int s_loggedSend, s_loggedLaunch, s_loggedUrl, s_loggedFocus;

    private int _sendCalls, _keyEvents, _launches, _urls, _focus;

    public DryRunEffects(ILog? log = null)
    {
        var l = log ?? NullLog.Instance;
        Input = new DryRunInputSink(this, l);
        Launcher = new DryRunLauncher(this, l);
    }

    /// <summary>Accepts every event and sends none.</summary>
    public IInputSink Input { get; }
    /// <summary>Starts, opens and focuses nothing.</summary>
    public IAppLauncher Launcher { get; }

    /// <summary>SendInput calls that would have been made.</summary>
    public int SendCalls => Volatile.Read(ref _sendCalls);
    /// <summary>Key events that would have been sent.</summary>
    public int KeyEvents => Volatile.Read(ref _keyEvents);
    /// <summary>Programs, files or app links that would have been started.</summary>
    public int Launches => Volatile.Read(ref _launches);
    /// <summary>URLs that would have been opened in the browser.</summary>
    public int UrlsOpened => Volatile.Read(ref _urls);
    /// <summary>Running windows that would have been brought to the front.</summary>
    public int FocusRequests => Volatile.Read(ref _focus);
    /// <summary>All of the above.</summary>
    public int Total => SendCalls + Launches + UrlsOpened + FocusRequests;

    internal static void Note(ILog log, ref int once, string message)
    {
        if (Interlocked.Exchange(ref once, 1) == 0)
            SafeLog.Info(log, message + " (dry run: safe mode or PRISM_CONTROL_MACROS_DRY_RUN; further suppressed effects are logged at debug)");
        else SafeLog.Debug(log, message);
    }

    private sealed class DryRunInputSink(DryRunEffects owner, ILog log) : IInputSink
    {
        public int Send(ReadOnlySpan<KeyInput> inputs)
        {
            Interlocked.Increment(ref owner._sendCalls);
            Interlocked.Add(ref owner._keyEvents, inputs.Length);
            Note(log, ref s_loggedSend, $"[dry run] would send {inputs.Length} key events");
            return inputs.Length;
        }
    }

    private sealed class DryRunLauncher(DryRunEffects owner, ILog log) : IAppLauncher
    {
        public void Launch(LaunchSpec spec)
        {
            Interlocked.Increment(ref owner._launches);
            Note(log, ref s_loggedLaunch, $"[dry run] would start {spec.DisplayName}");
        }

        public void OpenUrl(Uri url)
        {
            Interlocked.Increment(ref owner._urls);
            Note(log, ref s_loggedUrl, $"[dry run] would open {url.Scheme}://{url.IdnHost}");
        }

        public bool TryFocusRunning(LaunchSpec spec)
        {
            Interlocked.Increment(ref owner._focus);
            Note(log, ref s_loggedFocus, $"[dry run] would bring {spec.DisplayName} to the front if it runs");
            return false;
        }
    }
}

/// <summary>Reading the dry-run switch. It fails closed: a typo or an unexpected value means dry run, never live.</summary>
public static class DryRun
{
    /// <summary>
    /// True unless <paramref name="value"/> is unset, empty or an explicit "0"/"false" (any case, trimmed):
    /// "1", "True", "yes", "no", "2" and " " all mean dry run.
    /// </summary>
    public static bool Requested(string? value)
    {
        if (string.IsNullOrEmpty(value)) return false;
        var v = value.Trim();
        return !(v == "0" || v.Equals("false", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Safe mode always means dry run; otherwise the variable decides (see <see cref="Requested"/>).</summary>
    public static bool IsOn(bool safeMode, string? variableValue) => safeMode || Requested(variableValue);
}

/// <summary>Logging that never throws: a broken log sink must not break a macro run or leave a key on its running face.</summary>
internal static class SafeLog
{
    public static void Info(ILog log, string message) => Try(() => log.Info(message));
    public static void Debug(ILog log, string message) => Try(() => log.Debug(message));
    public static void Warn(ILog log, string message) => Try(() => log.Warn(message));
    public static void Error(ILog log, string message) => Try(() => log.Error(message));

    private static void Try(Action write)
    {
        try { write(); }
        catch (Exception) { /* the log is broken; the macro result still reaches the key and the PI */ }
    }
}
