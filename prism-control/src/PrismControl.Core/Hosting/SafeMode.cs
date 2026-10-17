namespace PrismControl.Core.Hosting;

/// <summary>
/// Safe mode: the process-wide switch for runs that drive the plugin with fake or random input (the fake host and the
/// E2E suite set <c>PRISM_CONTROL_SAFE_MODE=1</c>). While it is on, every write path that would change this PC (volume,
/// default devices, mic mute, Sonar/APO EQ, Spotify playback, fans, keystrokes, launching apps) must be a no-op or a
/// fake; reads stay real. Modules read <see cref="IModuleContext.SafeMode"/>, actions read <c>ActionBase.SafeMode</c>.
/// See docs/authoring-actions.md § Safe mode.
/// </summary>
public static class SafeModeEnvironment
{
    /// <summary>The variable that turns safe mode on ("1", "true", "yes" or "on").</summary>
    public const string Variable = "PRISM_CONTROL_SAFE_MODE";

    /// <summary>The Macros module's own dry-run switch (log instead of typing or launching). The host forces it on in safe mode.</summary>
    public const string MacrosDryRunVariable = "PRISM_CONTROL_MACROS_DRY_RUN";

    /// <summary>What every launcher that drives the plugin with fake or random input must set (fake host, E2E).</summary>
    public static IReadOnlyDictionary<string, string> LaunchVariables { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [Variable] = "1",
        [MacrosDryRunVariable] = "1",
    };

    /// <summary>True when <see cref="Variable"/> is set to an on value in this process's environment.</summary>
    public static bool FromEnvironment() => IsOn(Environment.GetEnvironmentVariable(Variable));

    /// <summary>True when the Macros dry-run variable asks for a dry run in this process's environment (see <see cref="DryRunRequested"/>).</summary>
    public static bool MacrosDryRunFromEnvironment() => DryRunRequested(Environment.GetEnvironmentVariable(MacrosDryRunVariable));

    /// <summary>
    /// The dry-run switch fails closed, exactly as the Macros module reads it: anything but unset, empty, "0" or "false"
    /// (any case, trimmed) means dry run, so a typo never means live input.
    /// </summary>
    public static bool DryRunRequested(string? value)
    {
        if (string.IsNullOrEmpty(value)) return false;
        var v = value.Trim();
        return !(v == "0" || v.Equals("false", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>"1", "true", "yes" and "on" (any case, trimmed) are on; anything else, including unset, is off.</summary>
    public static bool IsOn(string? value) => value is not null && value.Trim().ToLowerInvariant() is "1" or "true" or "yes" or "on";
}
