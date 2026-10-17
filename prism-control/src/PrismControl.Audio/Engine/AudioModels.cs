using System.Globalization;
using System.Text.RegularExpressions;

namespace PrismControl.Audio;

/// <summary>Render (output) or capture (input).</summary>
public enum AudioFlow { Render, Capture }

/// <summary>Windows device roles. "Default Device" = Console + Multimedia; "Default Communication Device" = Communications.</summary>
public enum AudioRole { Console, Multimedia, Communications }

[Flags]
public enum DefaultRoles
{
    None = 0,
    Console = 1,
    Multimedia = 2,
    Communications = 4,
    /// <summary>What Windows calls the "Default Device".</summary>
    Default = Console | Multimedia,
    All = Console | Multimedia | Communications,
}

/// <summary>An active audio endpoint as cached by the engine (volume and mute follow Windows live).</summary>
public sealed record AudioDevice(string Id, AudioFlow Flow, string FriendlyName)
{
    /// <summary>The name to show first, e.g. "Elgato Wave:3" for "Headphones (Elgato Wave:3)" (see <see cref="DeviceNames"/>).</summary>
    public string Title { get; init; } = FriendlyName;
    /// <summary>The second line, e.g. "Headphones". Null when there is nothing to add.</summary>
    public string? Subtitle { get; init; }
    /// <summary>Endpoint master volume, scalar 0..1.</summary>
    public float Volume { get; init; }
    public bool Muted { get; init; }
    /// <summary>False when the endpoint has a fixed range (for example 0..0 dB) and ignores volume changes.</summary>
    public bool HasVolume { get; init; } = true;
    /// <summary>Heuristic: the adapter calls itself virtual (Sonar, Wave Link, RTX Voice, ...).</summary>
    public bool IsVirtual { get; init; }

    public int VolumePct => (int)Math.Round(Volume * 100, MidpointRounding.AwayFromZero);
}

/// <summary>One app in the mixer: every non-expired session of one executable, grouped (System Sounds is its own app).</summary>
public sealed record AudioApp(string Key, string Name)
{
    /// <summary>Volume of the primary session (active first, then the one on the default output), scalar 0..1.</summary>
    public float Volume { get; init; } = 1;
    public bool Muted { get; init; }
    /// <summary>At least one session is playing right now.</summary>
    public bool IsActive { get; init; }
    public bool IsSystemSounds { get; init; }
    /// <summary>The endpoints this app has sessions on.</summary>
    public IReadOnlyList<string> DeviceIds { get; init; } = [];
    public int SessionCount { get; init; } = 1;

    public int VolumePct => (int)Math.Round(Volume * 100, MidpointRounding.AwayFromZero);
}

/// <summary>A peak reading: linear 0..1 overall and per channel (L, R, ...).</summary>
public readonly record struct MeterReading(float Peak, float[] Channels)
{
    public static MeterReading Silent { get; } = new(0, []);

    /// <summary>dBFS of the peak (null when silent).</summary>
    public double? PeakDb => Peak > 0 ? Math.Round(20 * Math.Log10(Peak), 1) : null;
}

public enum AudioChangeKind
{
    /// <summary>The engine became (un)available.</summary>
    Availability,
    /// <summary>Endpoints were added, removed or renamed.</summary>
    Devices,
    /// <summary>A default device changed (<see cref="AudioChange.Flow"/> says which).</summary>
    Defaults,
    /// <summary>Volume or mute of <see cref="AudioChange.DeviceId"/> changed.</summary>
    Endpoint,
    /// <summary>Sessions (apps) were added, removed, or changed volume/mute/state.</summary>
    Sessions,
}

public sealed record AudioChange(AudioChangeKind Kind, string? DeviceId = null, AudioFlow? Flow = null);

/// <summary>A peak-meter lease. The engine meters a device (≤ 30 Hz) only while at least one lease is open.</summary>
public interface IAudioMeter : IDisposable
{
    string DeviceId { get; }
    /// <summary>The highest peak since the previous call (or the latest sample if none arrived since).</summary>
    MeterReading Take();
}

/// <summary>
/// The audio service actions depend on (the real one is <see cref="AudioEngine"/>; tests use a fake).
/// Reads come from a live cache and are cheap; writes return tasks. <see cref="Changed"/> fires on an engine thread:
/// actions must <c>Post</c> back to their mailbox.
/// </summary>
public interface IAudioEngine
{
    bool IsAvailable { get; }
    /// <summary>Default-device switching (IPolicyConfig) is available on this Windows build.</summary>
    bool CanSetDefault { get; }
    event Action<AudioChange>? Changed;

    /// <summary>Active endpoints of one flow, sorted by title.</summary>
    IReadOnlyList<AudioDevice> GetDevices(AudioFlow flow);
    AudioDevice? GetDevice(string id);
    string? GetDefaultId(AudioFlow flow, AudioRole role);

    /// <summary>Sets the endpoint master volume (scalar 0..1). The cache updates immediately; Windows follows.</summary>
    Task SetVolumeAsync(string deviceId, float volume);
    Task SetMuteAsync(string deviceId, bool muted);
    /// <summary>Makes <paramref name="deviceId"/> the default for <paramref name="roles"/>. Throws if switching is unavailable or fails.</summary>
    Task SetDefaultAsync(string deviceId, DefaultRoles roles);

    /// <summary>Session tracking costs callbacks on every output endpoint, so it runs only while someone watches.</summary>
    IDisposable WatchSessions();
    /// <summary>Apps with sessions on <paramref name="deviceId"/> (null = any output endpoint), sorted by name. Empty unless watched.</summary>
    IReadOnlyList<AudioApp> GetApps(string? deviceId = null);
    /// <summary>Sets the volume of every session of the app (on <paramref name="deviceId"/>, or on every output when null).</summary>
    Task SetAppVolumeAsync(string appKey, string? deviceId, float volume);
    Task SetAppMuteAsync(string appKey, string? deviceId, bool muted);

    IAudioMeter OpenMeter(string deviceId);
    /// <summary>Whether any app has a capture stream open on the endpoint (null if unknown).</summary>
    Task<bool?> IsCaptureInUseAsync(string deviceId);
}

/// <summary>Device references stored in action settings: an endpoint id or one of the "follow the default" tokens.</summary>
public static class DeviceRef
{
    public const string DefaultOutput = "@default-output";
    public const string DefaultInput = "@default-input";
    public const string CommsOutput = "@comms-output";
    public const string CommsInput = "@comms-input";

    public static bool FollowsDefault(string? reference) => string.IsNullOrWhiteSpace(reference) || reference.StartsWith('@');

    /// <summary>Resolves a reference (empty = <paramref name="fallback"/>) to an endpoint id, or null when there is none.</summary>
    public static string? Resolve(IAudioEngine engine, string? reference, string fallback = DefaultOutput)
    {
        var r = string.IsNullOrWhiteSpace(reference) ? fallback : reference.Trim();
        return r switch
        {
            DefaultOutput => engine.GetDefaultId(AudioFlow.Render, AudioRole.Console),
            DefaultInput => engine.GetDefaultId(AudioFlow.Capture, AudioRole.Console),
            CommsOutput => engine.GetDefaultId(AudioFlow.Render, AudioRole.Communications),
            CommsInput => engine.GetDefaultId(AudioFlow.Capture, AudioRole.Communications),
            _ when r.StartsWith('@') => null,
            _ => r,
        };
    }

    /// <summary>The flow a reference implies (null for a plain endpoint id).</summary>
    public static AudioFlow? FlowOf(string? reference) => reference switch
    {
        DefaultOutput or CommsOutput => AudioFlow.Render,
        DefaultInput or CommsInput => AudioFlow.Capture,
        _ => null,
    };

    public static string Describe(string reference) => reference switch
    {
        DefaultOutput => "Default output",
        DefaultInput => "Default input",
        CommsOutput => "Default communications output",
        CommsInput => "Default communications input",
        _ => reference,
    };
}

/// <summary>Turns Windows endpoint names into a short title plus a subtitle that tells similar devices apart.</summary>
public static partial class DeviceNames
{
    /// <summary>
    /// "Headphones (Example USB)": the description is generic, so the adapter becomes the title ("Example USB" / "Headphones").
    /// "Example Mixer - Chat (Example Mixer Virtual Audio Device)": the description is specific; a "Vendor Product - Channel"
    /// description drops the vendor ("Mixer - Chat" / "Example Mixer Virtual Audio Device").
    /// </summary>
    public static (string Title, string? Subtitle) Make(string friendlyName, string? description, string? adapter)
    {
        description = Clean(description);
        adapter = Clean(adapter);
        if (description is null && adapter is null)
        {
            // Fall back to parsing "Desc (Adapter)" out of the friendly name.
            var m = FriendlyRe().Match(friendlyName);
            if (m.Success) { description = Clean(m.Groups[1].Value); adapter = Clean(m.Groups[2].Value); }
            else return (friendlyName.Trim(), null);
        }
        string title, sub;
        if (description is not null && (adapter is null || !IsGeneric(description)))
        {
            title = DropVendor(description);
            sub = adapter ?? "";
        }
        else
        {
            title = adapter!;
            sub = description ?? "";
        }
        return (title, string.IsNullOrWhiteSpace(sub) || string.Equals(sub, title, StringComparison.OrdinalIgnoreCase) ? null : sub);
    }

    /// <summary>True for descriptions that say what kind of jack it is, not which device ("Speakers", "Mic In", ...).</summary>
    public static bool IsGeneric(string description) => GenericRe().IsMatch(description.Trim());

    private static string? Clean(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = s.Trim();
        // Windows prefixes duplicate devices with "2- ", "3- " ...
        s = DuplicatePrefixRe().Replace(s, "");
        return s.Length == 0 ? null : s;
    }

    private static string DropVendor(string description)
    {
        var i = description.LastIndexOf(" - ", StringComparison.Ordinal);
        if (i <= 0) return description;
        var left = description[..i].Trim();
        var words = left.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return words.Length >= 2 ? string.Join(' ', words[1..]) + description[i..] : description;
    }

    [GeneratedRegex(@"^(.*)\s+\((.+)\)\s*$")]
    private static partial Regex FriendlyRe();

    [GeneratedRegex(@"^\d+\s*-\s+")]
    private static partial Regex DuplicatePrefixRe();

    [GeneratedRegex(@"^(speakers?|headphones?|headset( earphone| microphone)?|earphones?|microphones?( array)?|mic( in)?|line( in| out)?|digital (output|audio.*)|s/?pdif.*|stereo mix|output|input|monitor|communications headphones|speakers/headphones)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex GenericRe();
}

/// <summary>App names for the mixer.</summary>
public static class AppNames
{
    public const string SystemSoundsKey = "#system";

    /// <summary>A grouping key from an executable path or name: "C:\…\Spotify.exe" → "spotify.exe".</summary>
    public static string KeyFor(string exeOrPath)
    {
        var name = exeOrPath;
        var slash = Math.Max(name.LastIndexOf('\\'), name.LastIndexOf('/'));
        if (slash >= 0) name = name[(slash + 1)..];
        return name.Trim().ToLowerInvariant();
    }

    /// <summary>A readable fallback name from a key: "spotify.exe" → "Spotify", "my-app.exe" → "My-app".</summary>
    public static string FromKey(string key)
    {
        if (key == SystemSoundsKey) return "System Sounds";
        var n = key.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? key[..^4] : key;
        if (n.Length == 0) return key;
        return char.ToUpper(n[0], CultureInfo.InvariantCulture) + n[1..];
    }

    /// <summary>The executable path inside a session identifier ("…|\Device\HarddiskVolume3\…\App.exe%b{…}"), or "#" for System Sounds.</summary>
    public static string? PathFromSessionIdentifier(string? sessionIdentifier)
    {
        if (string.IsNullOrEmpty(sessionIdentifier)) return null;
        var bar = sessionIdentifier.IndexOf('|');
        if (bar < 0) return null;
        var rest = sessionIdentifier[(bar + 1)..];
        var pct = rest.IndexOf("%b", StringComparison.Ordinal);
        if (pct >= 0) rest = rest[..pct];
        return rest.Length == 0 ? null : rest;
    }
}

/// <summary>
/// Audio routing and processing tools that show up as apps in the mixer. They carry other apps' sound (a virtual mixer,
/// a noise filter), so turning one down turns down everything behind it; the mixer hides them unless asked not to.
/// </summary>
public static class RoutingApps
{
    private static readonly HashSet<string> Keys = new(StringComparer.OrdinalIgnoreCase)
    {
        // SteelSeries GG / Sonar
        "steelseriessonar.exe", "steelseriesgg.exe", "steelseriesggclient.exe", "steelseriesengine.exe", "audiosync.exe",
        // Elgato Wave Link
        "elgato.wavelink.exe", "wavelink.exe", "wavelinkse.exe",
        // NVIDIA RTX Voice / Broadcast
        "nvidia rtx voice.exe", "nvidia broadcast.exe",
        // Noise filters and system-wide effects
        "krisp.exe", "fxsound.exe",
    };

    /// <summary>True for a known routing tool's app key (see <see cref="AppNames.KeyFor"/>); every Voicemeeter build counts.</summary>
    public static bool IsRouting(string appKey) =>
        Keys.Contains(appKey) || appKey.StartsWith("voicemeeter", StringComparison.OrdinalIgnoreCase);
}
