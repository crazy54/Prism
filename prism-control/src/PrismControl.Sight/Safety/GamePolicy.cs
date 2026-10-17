using System.Diagnostics;
using System.Text.Json;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Sight;

namespace PrismControl.Sight.Safety;

public enum GameVerdict
{
    /// <summary>On the built-in safe-offline allowlist: read and (gesture-driven) input allowed.</summary>
    Allowlisted,
    /// <summary>Unknown game the user explicitly enabled after a warning: read only, never input.</summary>
    UserEnabled,
    /// <summary>Unknown game, not enabled: off.</summary>
    Unknown,
    /// <summary>An allowlisted game the user switched off.</summary>
    UserDisabled,
    /// <summary>Online-competitive: hard-denied, can never be enabled.</summary>
    Denied,
    /// <summary>Kernel/anti-cheat protection detected for this game or running now: hard-denied.</summary>
    AntiCheat,
}

/// <summary>
/// An allowlisted game. <paramref name="ProductNames"/>: what the exe's version resource calls the product (read-only
/// FileVersionInfo, verified on this PC for PC2 and NMS). When given and the exe's ProductName differs, the exe was
/// renamed: it is not that game, and Sight neither reads nor drives it.
/// </summary>
public sealed record KnownGame(string Id, string Title, IReadOnlyList<string> Executables, IReadOnlyList<string>? ProductNames = null);

/// <summary>The names in an exe's version resource (all may be empty).</summary>
public sealed record ExeVersionInfo(string? ProductName, string? OriginalFilename, string? InternalName, string? FileDescription, string? CompanyName);

public sealed record DeniedGame(string Title, IReadOnlyList<string> Executables, IReadOnlyList<string> PathMarkers);

/// <summary>
/// The built-in lists. The allowlist is small on purpose (DECISIONS.md, Games scope): offline/co-op games without
/// anti-cheat. The denylist is hard: online-competitive titles (Overwatch, Battlefield 6, …) and Riot titles under
/// Vanguard can never be enabled, whatever the user or a recipe says.
/// </summary>
public static class GameLists
{
    public static readonly IReadOnlyList<KnownGame> Allowlist =
    [
        new("pc2", "Planet Coaster 2", ["PlanetCoaster2.exe"], ["Planet Coaster 2"]),
        new("pc1", "Planet Coaster", ["PlanetCoaster.exe"], ["Planet Coaster"]),
        new("nms", "No Man's Sky", ["NMS.exe"], ["No Man's Sky"]),
        new("factorio", "Factorio", ["factorio.exe"]),
        new("satisfactory", "Satisfactory", ["FactoryGame-Win64-Shipping.exe", "FactoryGameSteam-Win64-Shipping.exe", "FactoryGameEGS-Win64-Shipping.exe", "FactoryGame.exe"]),
    ];

    public static readonly IReadOnlyList<DeniedGame> Denylist =
    [
        new("Overwatch", ["Overwatch.exe"], [@"\Overwatch\"]),
        new("Battlefield 6", ["bf6.exe", "bf6event.exe", "BF6.exe"], [@"\Battlefield 6\", @"\Battlefield™ 6\"]),
        new("Battlefield 2042", ["BF2042.exe"], [@"\Battlefield 2042\"]),
        new("Battlefield V", ["bfv.exe"], []),
        new("Battlefield 1", ["bf1.exe"], []),
        new("VALORANT", ["VALORANT.exe", "VALORANT-Win64-Shipping.exe"], [@"\Riot Games\"]),
        new("League of Legends", ["League of Legends.exe", "LeagueClient.exe", "LeagueClientUx.exe"], [@"\Riot Games\"]),
        new("Counter-Strike 2", ["cs2.exe"], [@"\Counter-Strike Global Offensive\"]),
        new("Apex Legends", ["r5apex.exe", "r5apex_dx12.exe"], [@"\Apex Legends\"]),
        new("Fortnite", ["FortniteClient-Win64-Shipping.exe", "FortniteClient-Win64-Shipping_EAC.exe", "FortniteClient-Win64-Shipping_BE.exe"], [@"\Fortnite\"]),
        new("PUBG", ["TslGame.exe", "TslGame_BE.exe"], [@"\PUBG\"]),
        new("Rainbow Six Siege", ["RainbowSix.exe", "RainbowSix_Vulkan.exe", "RainbowSix_BE.exe"], [@"\Tom Clancy's Rainbow Six Siege\"]),
        new("Call of Duty", ["cod.exe", "ModernWarfare.exe", "BlackOps6.exe", "cod24-cod.exe", "BlackOpsColdWar.exe", "Warzone.exe"], [@"\Call of Duty\"]),
        new("Destiny 2", ["destiny2.exe"], [@"\Destiny 2\"]),
        new("Rust", ["RustClient.exe"], []),
        new("Dota 2", ["dota2.exe"], [@"\dota 2 beta\"]),
        new("Escape from Tarkov", ["EscapeFromTarkov.exe"], []),
        new("Marvel Rivals", ["Marvel-Win64-Shipping.exe", "MarvelRivals_Launcher.exe"], [@"\MarvelRivals\"]),
        new("THE FINALS", ["Discovery.exe"], [@"\THE FINALS\"]),
        new("Deadlock", ["project8.exe", "deadlock.exe"], [@"\Deadlock\"]),
        new("Rocket League", ["RocketLeague.exe"], []),
        new("GTA V", ["GTA5.exe", "GTA5_Enhanced.exe", "PlayGTAV.exe"], [@"\Grand Theft Auto V\"]),
        new("Halo Infinite", ["HaloInfinite.exe"], [@"\Halo Infinite\"]),
        new("Hunt: Showdown", ["HuntGame.exe"], []),
        new("Delta Force", ["DeltaForceClient-Win64-Shipping.exe", "DeltaForce.exe"], [@"\Delta Force\"]),
        new("FragPunk", ["FragPunk.exe", "FragPunk-Win64-Shipping.exe"], [@"\FragPunk\"]),
        new("Blood Strike", ["BloodStrike.exe"], [@"\BLOODSTRIKE\"]),
        new("The First Descendant", ["M1-Win64-Shipping.exe"], [@"\The First Descendant\"]),
        new("Naraka: Bladepoint", ["NarakaBladepoint.exe"], []),
        new("XDefiant", ["XDefiant.exe"], []),
        new("World of Warcraft", ["Wow.exe", "WowClassic.exe"], []),
        new("Lost Ark", ["LOSTARK.exe"], []),
    ];

    /// <summary>Files or folders next to (or above) a game's exe that mean it ships an anti-cheat.</summary>
    public static readonly IReadOnlyList<string> AntiCheatMarkers =
    [
        "EasyAntiCheat", "EasyAntiCheat_EOS", "EasyAntiCheat_x64.dll", "start_protected_game.exe", "BattlEye", "BEClient_x64.dll", "BEService.exe",
        "AntiCheatExpert", "EAAntiCheat.GameServiceLauncher.exe", "EAAntiCheat.Installer.exe", "GameGuard", "XIGNCODE", "nProtect",
        "mhypbase.dll", "HoYoKProtect.sys", "PnkBstrA.exe", "vgk.sys", "Vanguard",
    ];

    /// <summary>
    /// Anti-cheat services that run only while a protected game runs: while one is up, Sight reads nothing. Riot Vanguard's
    /// user-mode service is vgc.exe (vgk.sys is its driver; the tray app vgtray.exe may run without a game, so it is not
    /// listed); EA Javelin's launcher service; ACE (Tencent) SGuard; nProtect GameMon; PunkBuster; FACEIT; BattlEye; EAC.
    /// </summary>
    public static readonly IReadOnlyList<string> RunningAntiCheat =
    [
        "EasyAntiCheat.exe", "EasyAntiCheat_EOS.exe", "BEService.exe", "BEService_x64.exe", "EAAntiCheat.GameService.exe",
        "EAAntiCheat.GameServiceLauncher.exe", "vgc.exe", "FACEITService.exe", "faceit_ac.exe", "GameMon.exe", "GameMon64.exe",
        "SGuard64.exe", "SGuardSvc64.exe", "PnkBstrA.exe", "PnkBstrB.exe",
    ];

    public static KnownGame? Allowed(string exe) => Allowlist.FirstOrDefault(g => g.Executables.Any(e => e.Equals(exe, StringComparison.OrdinalIgnoreCase)));
}

/// <summary>The reads the policy needs (real by default; tests fake them).</summary>
public interface IPolicyProbe
{
    /// <summary>Names of running processes (exe file names). Uses the process list only: no process is opened.</summary>
    IReadOnlyCollection<string> RunningProcessNames();
    /// <summary>File and folder names in a folder (empty when unreadable).</summary>
    IReadOnlyCollection<string> ListFolder(string folder);
    /// <summary>The exe's version-resource names (reads the file, never the process); null when unreadable.</summary>
    ExeVersionInfo? VersionInfo(string exePath) => null;
}

public sealed class SystemPolicyProbe : IPolicyProbe
{
    public IReadOnlyCollection<string> RunningProcessNames()
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in Process.GetProcesses())
        {
            try { names.Add(p.ProcessName + ".exe"); }
            catch (Exception) { /* exited */ }
            finally { p.Dispose(); }
        }
        return names;
    }

    public IReadOnlyCollection<string> ListFolder(string folder)
    {
        try { return Directory.EnumerateFileSystemEntries(folder).Select(Path.GetFileName).OfType<string>().ToList(); }
        catch (Exception) { return []; }
    }

    public ExeVersionInfo? VersionInfo(string exePath)
    {
        try
        {
            var v = FileVersionInfo.GetVersionInfo(exePath);
            return new ExeVersionInfo(v.ProductName, v.OriginalFilename, v.InternalName, v.FileDescription, v.CompanyName);
        }
        catch (Exception) { return null; }
    }
}

/// <summary>
/// Decides, per game process, whether Sight may read it and whether gesture-driven input may go to it:
/// denylist (hard) → anti-cheat markers near the exe or a running anti-cheat service (hard) → the user's switch →
/// allowlist (read + input) → user-enabled unknown games (read only, after a warning) → everything else off.
/// </summary>
public sealed class GamePolicy
{
    private readonly IPolicyProbe _probe;
    private readonly UserGames _user;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly Dictionary<string, (DateTimeOffset At, string? Marker)> _markerCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, (DateTimeOffset At, ExeVersionInfo? Info)> _versionCache = new(StringComparer.OrdinalIgnoreCase);
    private (DateTimeOffset At, string? Running) _runningCache = (DateTimeOffset.MinValue, null);

    public GamePolicy(UserGames user, IPolicyProbe? probe = null, TimeProvider? time = null)
    {
        _user = user;
        _probe = probe ?? new SystemPolicyProbe();
        _time = time ?? TimeProvider.System;
    }

    public UserGames User => _user;

    /// <summary>Tests only (internal): extra allowlisted games, e.g. the synthetic coaster. Production has no way to set it.</summary>
    internal IReadOnlyList<KnownGame> ExtraAllowlist { get; init; } = [];

    private static readonly HashSet<string> LibraryRoots = new(StringComparer.OrdinalIgnoreCase)
    {
        "common", "steamapps", "SteamLibrary", "Steam", "Program Files", "Program Files (x86)", "Games", "Epic Games", "GOG Galaxy", "GOG Games",
        "XboxGames", "WindowsApps", "Ubisoft Game Launcher", "EA Games", "Origin Games",
    };

    public SightGameAccess Evaluate(string processName, string? exePath = null)
    {
        var exe = Path.GetFileName(processName ?? "");
        var (verdict, reason, gameId) = Decide(exe, exePath);
        var read = verdict is GameVerdict.Allowlisted or GameVerdict.UserEnabled;
        var input = verdict == GameVerdict.Allowlisted;
        return new SightGameAccess(exe, gameId, read, input, verdict.ToString(), reason);
    }

    public GameVerdict Verdict(string processName, string? exePath = null) => Enum.Parse<GameVerdict>(Evaluate(processName, exePath).Verdict);

    private (GameVerdict, string, string?) Decide(string exe, string? path)
    {
        if (string.IsNullOrEmpty(exe)) return (GameVerdict.Unknown, "no process", null);
        if (IsDenied(exe, path, out var title)) return (GameVerdict.Denied, $"{title} is online-competitive: Sight never reads it", null);
        // The exe's own version resource survives a rename: a denylisted game under another name is still denied.
        var info = path is null ? null : Version(path);
        if (info is not null && DeniedByVersion(info) is { } renamed) return (GameVerdict.Denied, $"{renamed} is online-competitive (renamed exe): Sight never reads it", null);
        if (path is not null && AntiCheatMarker(path) is { } marker) return (GameVerdict.AntiCheat, $"anti-cheat files next to the game ({marker}): Sight never reads it", null);
        if (RunningAntiCheat() is { } running) return (GameVerdict.AntiCheat, $"an anti-cheat service is running ({running}): Sight is paused", null);
        var known = GameLists.Allowed(exe) ?? ExtraAllowlist.FirstOrDefault(g => g.Executables.Any(e => e.Equals(exe, StringComparison.OrdinalIgnoreCase)));
        if (known is not null)
        {
            if (known.ProductNames is { Count: > 0 } names && info is { ProductName: { Length: > 0 } product } && !names.Any(n => Same(n, product)))
                return (GameVerdict.Unknown, $"{exe} says it is \"{product}\", not {known.Title} (renamed exe): not read", null);
            if (_user.IsDisabled(exe)) return (GameVerdict.UserDisabled, $"{known.Title}: switched off by you", known.Id);
            return (GameVerdict.Allowlisted, $"{known.Title}: safe-offline allowlist", known.Id);
        }
        if (_user.IsEnabled(exe)) return (GameVerdict.UserEnabled, "enabled by you (reading only; no input is ever sent to unlisted games)", null);
        return (GameVerdict.Unknown, "not a supported game (Sight reads only the built-in offline games)", null);
    }

    private static bool Same(string a, string b) => Norm(a) == Norm(b);

    private static string Norm(string s) => string.Concat(s.Where(char.IsLetterOrDigit)).ToUpperInvariant();

    /// <summary>A denylisted title or exe named by the version resource (product, original file name, internal name).</summary>
    private static string? DeniedByVersion(ExeVersionInfo v)
    {
        foreach (var name in new[] { v.OriginalFilename, v.InternalName })
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            var file = Path.GetFileName(name.Trim());
            if (IsDenied(file, null, out var t) || IsDenied(file + ".exe", null, out t)) return t;
        }
        if (!string.IsNullOrWhiteSpace(v.ProductName))
            foreach (var d in GameLists.Denylist)
                if (Same(d.Title, v.ProductName)) return d.Title;
        return null;
    }

    /// <summary>The exe's version resource (cached 60 s per path).</summary>
    private ExeVersionInfo? Version(string exePath)
    {
        var now = _time.GetUtcNow();
        lock (_gate)
            if (_versionCache.TryGetValue(exePath, out var c) && now - c.At < TimeSpan.FromSeconds(60)) return c.Info;
        var info = _probe.VersionInfo(exePath);
        lock (_gate) _versionCache[exePath] = (now, info);
        return info;
    }

    public static bool IsDenied(string exe, string? path, out string title)
    {
        foreach (var d in GameLists.Denylist)
        {
            if (d.Executables.Any(e => e.Equals(exe, StringComparison.OrdinalIgnoreCase)) ||
                (path is not null && d.PathMarkers.Any(m => path.Contains(m, StringComparison.OrdinalIgnoreCase))))
            {
                title = d.Title;
                return true;
            }
        }
        title = "";
        return false;
    }

    /// <summary>An anti-cheat marker in the exe's folder or up to three folders above it (cached 60 s).</summary>
    public string? AntiCheatMarker(string exePath)
    {
        var now = _time.GetUtcNow();
        lock (_gate)
            if (_markerCache.TryGetValue(exePath, out var c) && now - c.At < TimeSpan.FromSeconds(60)) return c.Marker;
        string? found = null;
        var dir = Path.GetDirectoryName(exePath);
        for (var level = 0; level < 4 && dir is not null && found is null; level++)
        {
            // Never scan a library root (it lists OTHER games, or a shared EasyAntiCheat install) or a drive.
            var name = Path.GetFileName(dir);
            if (string.IsNullOrEmpty(name) || LibraryRoots.Contains(name)) break;
            var entries = _probe.ListFolder(dir);
            found = GameLists.AntiCheatMarkers.FirstOrDefault(m => entries.Any(e => e.Equals(m, StringComparison.OrdinalIgnoreCase)));
            dir = Path.GetDirectoryName(dir);
        }
        lock (_gate) _markerCache[exePath] = (now, found);
        return found;
    }

    /// <summary>A running anti-cheat service (cached 3 s: the service checks every tick, so a start pauses Sight within ~3 s).</summary>
    public string? RunningAntiCheat()
    {
        var now = _time.GetUtcNow();
        lock (_gate)
            if (now - _runningCache.At < TimeSpan.FromSeconds(3)) return _runningCache.Running;
        var names = _probe.RunningProcessNames();
        var found = GameLists.RunningAntiCheat.FirstOrDefault(n => names.Contains(n, StringComparer.OrdinalIgnoreCase));
        lock (_gate) _runningCache = (now, found);
        return found;
    }

    public void ClearCaches()
    {
        lock (_gate) { _markerCache.Clear(); _versionCache.Clear(); _runningCache = (DateTimeOffset.MinValue, null); }
    }
}

/// <summary>
/// The user's choices: unknown games enabled after the warning (read only) and allowlisted games switched off.
/// Stored in the module data folder (games.json, written atomically); in memory only in safe mode.
/// Denied and anti-cheat games cannot be enabled: <see cref="TryEnable"/> refuses them.
/// </summary>
public sealed class UserGames
{
    private readonly string? _file;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly HashSet<string> _enabled = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _disabled = new(StringComparer.OrdinalIgnoreCase);

    public UserGames(string? file, ILog? log = null)
    {
        _file = file;
        _log = log ?? NullLog.Instance;
        Load();
    }

    public const string Warning = "Prism Sight will read this game's screen (in memory only, never saved or uploaded). Only enable games that are offline or co-op and have no anti-cheat: reading the screen of an online-competitive game can break its rules and risk your account. Input is never sent to games outside the built-in allowlist.";

    public bool IsEnabled(string exe) { lock (_gate) return _enabled.Contains(exe); }
    public bool IsDisabled(string exe) { lock (_gate) return _disabled.Contains(exe); }

    /// <summary>Enables an unknown game for reading. Requires the acknowledged warning; refuses denied and anti-cheat games.</summary>
    public bool TryEnable(string exe, bool warningAcknowledged, GamePolicy policy, string? exePath, out string reason)
    {
        exe = Path.GetFileName(exe);
        if (!warningAcknowledged) { reason = "the warning must be acknowledged first"; return false; }
        if (GamePolicy.IsDenied(exe, exePath, out var title)) { reason = $"{title} can never be enabled"; return false; }
        if (exePath is not null && policy.AntiCheatMarker(exePath) is { } m) { reason = $"anti-cheat detected ({m}): it can never be enabled"; return false; }
        lock (_gate)
        {
            if (GameLists.Allowed(exe) is not null) _disabled.Remove(exe);
            else _enabled.Add(exe);
        }
        Save();
        reason = "enabled";
        return true;
    }

    /// <summary>Switches a game off (allowlisted or user-enabled).</summary>
    public void Disable(string exe)
    {
        exe = Path.GetFileName(exe);
        lock (_gate)
        {
            _enabled.Remove(exe);
            if (GameLists.Allowed(exe) is not null) _disabled.Add(exe);
        }
        Save();
    }

    private sealed class Dto
    {
        public int V { get; set; } = 1;
        public List<string> Enabled { get; set; } = [];
        public List<string> Disabled { get; set; } = [];
    }

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    private void Load()
    {
        if (_file is null || !File.Exists(_file)) return;
        try
        {
            var dto = JsonSerializer.Deserialize<Dto>(File.ReadAllText(_file), Json);
            if (dto is null) return;
            lock (_gate)
            {
                foreach (var e in dto.Enabled) if (!GamePolicy.IsDenied(e, null, out _)) _enabled.Add(e);
                foreach (var d in dto.Disabled) _disabled.Add(d);
            }
        }
        catch (Exception ex) { _log.Warn("sight: games.json unreadable, using defaults: " + ex.GetType().Name); }
    }

    private void Save()
    {
        if (_file is null) return;
        Dto dto;
        lock (_gate) dto = new Dto { Enabled = [.. _enabled.Order()], Disabled = [.. _disabled.Order()] };
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_file)!);
            var tmp = _file + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(dto, Json));
            File.Move(tmp, _file, overwrite: true);
        }
        catch (Exception ex) { _log.Warn("sight: could not save games.json: " + ex.GetType().Name); }
    }
}
