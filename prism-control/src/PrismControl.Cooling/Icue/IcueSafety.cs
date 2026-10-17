using System.Text.RegularExpressions;

namespace PrismControl.Cooling.Icue;

/// <summary>
/// SAFETY: the only iCUE methods Prism Control may ever invoke. Everything here is a read; nothing sets, activates,
/// deactivates, releases, notifies or changes a device, profile, fan curve, pump mode or lighting.
/// <list type="bullet">
/// <item>The client checks every invoke against this list by exact (replica type, signature) BEFORE it writes a byte.</item>
/// <item>A second, independent pattern check refuses any name that looks like a write even if someone adds it here.</item>
/// <item>Besides allowlisted InvokePackets the client only ever sends AddObject (acquire a dynamic replica, which is how
/// QtRO delivers the class definition and signals). It never sends RemoveObject, property writes or pings: it just
/// closes the pipe when it is done.</item>
/// </list>
/// </summary>
internal static partial class IcueSafety
{
    public const string SensorProviderType = "SensorProvider";
    public const string AutomationType = "AutomationSdkIpc";

    private static readonly Dictionary<string, HashSet<string>> Allowed = new(StringComparer.Ordinal)
    {
        // Corsair_WB_Plugin_Sensors_<hash> (iCUE's widget sensor provider): getters only.
        [SensorProviderType] = new(StringComparer.Ordinal)
        {
            "getAllSensorIds()",
            "getSensorValue(QString)",
            "getSensorUnits(QString)",
            "getSensorName(QString)",
            "getSensorDeviceName(QString)",
            "getSensorType(QString)",
            "getSensorKind(QString)",
            "sensorIsConnected(QString)",
        },
        // corsair_automation_sdk (what Corsair's own Stream Deck plugin uses): the two sensor reads only.
        [AutomationType] = new(StringComparer.Ordinal)
        {
            "GetSensors()",
            "GetSensor(QString)",
        },
    };

    /// <summary>Every allowlisted (type, signature) pair, for tests and documentation.</summary>
    public static IEnumerable<(string Type, string Signature)> All =>
        Allowed.SelectMany(kv => kv.Value.Select(s => (kv.Key, s))).OrderBy(x => x.Key, StringComparer.Ordinal).ThenBy(x => x.s, StringComparer.Ordinal);

    public static bool IsAllowed(string replicaType, string signature) =>
        Allowed.TryGetValue(replicaType, out var set) && set.Contains(signature) && !LooksLikeWrite(signature);

    /// <summary>Throws <see cref="IcueSafetyException"/> unless the call is on the allowlist.</summary>
    public static void EnsureAllowed(string replicaType, string signature)
    {
        if (!IsAllowed(replicaType, signature))
            throw new IcueSafetyException($"Refusing to call {replicaType}::{signature}: Prism Control only reads iCUE sensors.");
    }

    /// <summary>Belt and braces: method names that could change anything are refused regardless of the allowlist.</summary>
    public static bool LooksLikeWrite(string signature) => WriteNameRe().IsMatch(signature);

    [GeneratedRegex(@"^(set|activate|deactivate|release|notify|connect|disconnect|reconnect|send|update|apply|write|start|stop|enable|disable|reset|request|create|delete|remove|add)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex WriteNameRe();
}

public sealed class IcueSafetyException(string message) : InvalidOperationException(message);
