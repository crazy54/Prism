using System.Runtime.Versioning;
using Microsoft.Win32;

namespace PrismControl.Eq.Apo;

/// <summary>Where Equalizer APO is installed and reads its config (HKLM\SOFTWARE\EqualizerAPO).</summary>
public sealed record ApoInstall(string InstallPath, string ConfigPath, string? Version);

/// <summary>An audio endpoint that has Equalizer APO installed (a <c>Child APOs\{guid}</c> key).</summary>
public sealed record ApoDevice(string Guid, string Name, EqChannelKind Kind, bool IsActive)
{
    /// <summary>The Core Audio endpoint id ({0.0.0.00000000}.{guid} for playback, {0.0.1.00000000}.{guid} for capture).</summary>
    public string EndpointId => (Kind == EqChannelKind.Capture ? "{0.0.1.00000000}." : "{0.0.0.00000000}.") + Guid;
}

/// <summary>Read-only facts about the APO install. Tests use a fake with a temp config folder.</summary>
public interface IApoEnvironment
{
    /// <summary>Null when Equalizer APO is not installed.</summary>
    ApoInstall? FindInstall();
    /// <summary>Endpoints with APO installed (any state; <see cref="ApoDevice.IsActive"/> marks the present ones).</summary>
    IReadOnlyList<ApoDevice> ListDevices();
}

/// <summary>
/// The real environment, from the registry only (research eq.md §6.1): <c>HKLM\SOFTWARE\EqualizerAPO</c>
/// (64-bit view) for InstallPath/ConfigPath, the uninstall key for the version, <c>Child APOs\{guid}</c> for the
/// devices that have APO, and the MMDevices property store for their names and state. Read-only.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class RegistryApoEnvironment : IApoEnvironment
{
    private const string ApoKey = @"SOFTWARE\EqualizerAPO";
    private const string UninstallKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\EqualizerAPO";
    private const string MmDevices = @"SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio";
    private const string PkeyDeviceDesc = "{a45c254e-df1c-4efd-8020-67d146a850e0},2";
    private const string PkeyInterfaceName = "{b3f8fa53-0004-438e-9003-51a46e139bfc},6";

    public ApoInstall? FindInstall()
    {
        try
        {
            using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            using var key = hklm.OpenSubKey(ApoKey);
            if (key is null) return null;
            var install = key.GetValue("InstallPath") as string;
            var config = key.GetValue("ConfigPath") as string;
            if (string.IsNullOrWhiteSpace(install) && string.IsNullOrWhiteSpace(config)) return null;
            install ??= Path.GetDirectoryName(config!) ?? "";
            config ??= Path.Combine(install, "config");
            string? version = null;
            using (var un = hklm.OpenSubKey(UninstallKey)) version = un?.GetValue("DisplayVersion") as string;
            return new ApoInstall(install, config, version);
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            return null;
        }
    }

    public IReadOnlyList<ApoDevice> ListDevices()
    {
        var list = new List<ApoDevice>();
        try
        {
            using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            using var children = hklm.OpenSubKey(ApoKey + @"\Child APOs");
            if (children is null) return list;
            foreach (var name in children.GetSubKeyNames())
            {
                var guid = name.Trim().ToLowerInvariant();
                if (!guid.StartsWith('{')) guid = "{" + guid + "}";
                foreach (var (flow, kind) in new[] { ("Render", EqChannelKind.Playback), ("Capture", EqChannelKind.Capture) })
                {
                    using var dev = hklm.OpenSubKey($@"{MmDevices}\{flow}\{guid}");
                    if (dev is null) continue;
                    var state = dev.GetValue("DeviceState") is int s ? s : 0;
                    using var props = dev.OpenSubKey("Properties");
                    var desc = props?.GetValue(PkeyDeviceDesc) as string;
                    var iface = props?.GetValue(PkeyInterfaceName) as string;
                    var display = desc is null ? iface ?? guid : iface is null ? desc : $"{desc} ({iface})";
                    list.Add(new ApoDevice(guid, display, kind, (state & 0xF) == 1)); // DEVICE_STATE_ACTIVE
                    break;
                }
            }
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            // Treat as "no devices"; the availability line explains.
        }
        return list;
    }
}
