namespace PrismControl.Browser.Protocol;

/// <summary>
/// Protocol v1 constants (extension/PROTOCOL.md is the source of truth; research/browser.md §9 is the draft it grew from).
/// Keep in step with extension/src/shared/protocol.js.
/// </summary>
public static class Wire
{
    public const int Proto = 1;

    /// <summary>
    /// The relay preamble version we speak, and the oldest we still accept: a Chrome native host started before a
    /// plugin update keeps running the previous relay image (RelayInstaller renames it aside), so its preamble may be
    /// one version behind (CONTRACT-platform.md §1.6).
    /// </summary>
    public const int RelayPreamble = 1;
    public const int RelayPreambleMin = 1;

    /// <summary>The native-messaging host name (registry key name and manifest "name").</summary>
    public const string HostName = "com.jeremyfhall.prismcontrol.browser";

    /// <summary>The unpacked/Chrome Web Store id fixed by the manifest "key" (extension engineer, keys/extension-id.txt).</summary>
    public const string ExtensionId = "ebbfhlgndibiinpfkhcacipfkoeokcgn";

    public static string OriginFor(string id) => $"chrome-extension://{id}/";

    /// <summary>The origins the relay may present (argv[1] from Chrome). Edge Add-ons ids are added here when they exist.</summary>
    public static IReadOnlyList<string> AllowedOrigins { get; } = [OriginFor(ExtensionId)];

    /// <summary>The pipe endpoint name (Desktop PipeEndpointOptions.Name) and the module's data folder name.</summary>
    public const string EndpointName = "browser";

    public static class T
    {
        // relay -> plugin (first frame of every pipe connection)
        public const string Relay = "relay";
        // extension -> plugin
        public const string Hello = "hello";
        public const string StateFull = "state.full";
        public const string TabsDelta = "tabs.delta";
        public const string MediaUpdate = "media.update";
        public const string DownloadsUpdate = "downloads.update";
        public const string Img = "img";
        public const string PreviewFrame = "preview.frame";
        public const string Event = "event";
        public const string Result = "result";
        public const string Ping = "ping";
        // plugin -> extension
        public const string Welcome = "welcome";
        public const string Cmd = "cmd";
        public const string Resync = "resync";
        public const string Streaming = "streaming";
    }

    public static class Err
    {
        public const string NoPermission = "no_permission";
        public const string NoHostPermission = "no_host_permission";
        public const string NotFound = "not_found";
        public const string GestureRequired = "gesture_required";
        public const string RateLimited = "rate_limited";
        public const string Busy = "busy";
        public const string BadArgs = "bad_args";
        public const string Unsupported = "unsupported";
        public const string PrivacyBlocked = "privacy_blocked";
        // plugin-local codes (never on the wire from the extension)
        public const string Timeout = "timeout";
        public const string Disconnected = "disconnected";
        public const string NoBrowser = "no_browser";
        public const string SafeMode = "safe_mode";
    }

    /// <summary>Command ops (research/browser.md §9.2).</summary>
    public static class Op
    {
        public const string TabFocus = "tab.focus";
        public const string TabClose = "tab.close";
        public const string TabCreate = "tab.create";
        public const string TabReload = "tab.reload";
        public const string TabBack = "tab.back";
        public const string TabForward = "tab.forward";
        public const string TabMute = "tab.mute";
        public const string TabPin = "tab.pin";
        public const string TabMove = "tab.move";
        public const string TabDiscardable = "tab.discardable";
        public const string WindowFocus = "window.focus";
        public const string WindowState = "window.state";
        public const string SessionRestore = "session.restore";
        public const string SessionRecent = "session.recent";
        public const string GroupUpdate = "group.update";
        public const string TabGroup = "tab.group";
        public const string TabUngroup = "tab.ungroup";
        public const string SplitCreate = "split.create";
        public const string SplitRemove = "split.remove";
        public const string PageScroll = "page.scroll";
        public const string PageZoom = "page.zoom";
        public const string MediaToggle = "media.toggle";
        public const string MediaPlay = "media.play";
        public const string MediaPause = "media.pause";
        public const string MediaSeek = "media.seek";
        public const string MediaRate = "media.rate";
        public const string MediaVolume = "media.volume";
        public const string MediaMute = "media.mute";
        public const string MediaAction = "media.action";
        public const string MediaPip = "media.pip";
        public const string DownloadShow = "download.show";
        public const string DownloadPause = "download.pause";
        public const string DownloadResume = "download.resume";
        public const string DownloadCancel = "download.cancel";
        public const string DownloadPath = "download.path";
        public const string PermHostRequest = "perm.hostRequest";
        public const string PermOpenOptions = "perm.openOptions";
        public const string PreviewSubscribe = "preview.subscribe";
        public const string PrivacySet = "privacy.set";
        public const string Panic = "panic";
        /// <summary>Re-send images by id (the plugin's LRU evicted them).</summary>
        public const string ImgGet = "img.get";
    }

    /// <summary>perm.openOptions sections (the extension's options page anchors).</summary>
    public static class OptionsSection
    {
        public const string General = "general";
        public const string Grant = "grant";
        public const string Sites = "sites";
        /// <summary>Optional features: downloads, tab groups, reopen closed tabs, the live preview ("all sites").</summary>
        public const string Features = "features";
        public const string Privacy = "privacy";
        public const string Profile = "profile";
    }

    public static class Limits
    {
        /// <summary>page.scroll accepts |dy| up to this.</summary>
        public const int ScrollMax = 20_000;
        /// <summary>Any extension → plugin frame (Chrome allows 64 MiB; we cap lower).</summary>
        public const int InboundMaxBytes = 512 * 1024;
        /// <summary>Any plugin → extension frame (Chrome's host → browser cap is 1 MB).</summary>
        public const int OutboundMaxBytes = 64 * 1024;
        public const int MaxDepth = 16;
        public const int Title = 512;
        public const int Url = 2048;
        public const int Domain = 253;
        public const int Artist = 256;
        public const int Album = 256;
        public const int Chapters = 64;
        public const int ChapterTitle = 128;
        public const int Actions = 16;
        public const int ActionName = 32;
        public const int DownloadName = 260;
        public const int GroupTitle = 128;
        public const int ProfileLabel = 48;
        /// <summary>
        /// Tabs held per browser. Large on purpose (MED 9): the extension splits big snapshots, and dropping tabs silently
        /// would make slot keys point at the wrong tab. Beyond it the session logs one warning per session.
        /// </summary>
        public const int MaxTabs = 10_000;
        public const int MaxWindows = 200;
        public const int MaxMedia = 64;
        public const int MaxDownloads = 64;
        public const int MaxGroups = 200;
        public const int FavMaxBytes = 16 * 1024;
        public const int ArtMaxBytes = 96 * 1024;
        public const int PreviewMaxBytes = 40 * 1024;
        public const int ImageMaxPx = 512;
        /// <summary>Plugin commands per second, overall per browser (excess answered rate_limited locally).</summary>
        public const int CommandsPerSecond = 60;
        public static readonly TimeSpan CommandTimeout = TimeSpan.FromSeconds(2);
        /// <summary>Hello must arrive this soon after the relay preamble.</summary>
        public static readonly TimeSpan HelloTimeout = TimeSpan.FromSeconds(10);
        /// <summary>Dial streams (seek, zoom, volume, rate) are latest-wins coalesced at 20 Hz.</summary>
        public static readonly TimeSpan DialStreamInterval = TimeSpan.FromMilliseconds(50);
        /// <summary>page.zoom {step} accepts ±16.</summary>
        public const int ZoomStepMax = 16;
        /// <summary>Concurrent browser profiles on the pipe (Desktop allows 1–64). LOW 25: 8 was reachable.</summary>
        public const int MaxConnections = 32;
    }

    /// <summary>
    /// The key the picture-in-picture flow presses (PROTOCOL.md §10.4 <c>media.pip {via:"gesture", key}</c>). It is a real,
    /// global keystroke: F13–F24 only, F24 by default, configurable (global setting <c>browser.pipKey</c>) because other
    /// apps (OBS, Discord, AutoHotkey) may bind these keys.
    /// </summary>
    public static class PipKeys
    {
        public const string Default = "F24";

        /// <summary>The virtual key for "F13".."F24" (0x7C..0x87), else null.</summary>
        public static ushort? Vk(string? name)
        {
            if (name is null || name.Length is < 3 or > 3 || name[0] is not ('F' or 'f')) return null;
            if (!int.TryParse(name.AsSpan(1), System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var n) || n is < 13 or > 24) return null;
            return (ushort)(0x70 + n - 1);
        }

        public static string Normalize(string? name) => Vk(name) is not null ? name!.ToUpperInvariant() : Default;

        public static readonly string[] All = ["F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24"];
    }

    /// <summary>Privacy levels, least to most strict.</summary>
    public static class Privacy
    {
        public const string Full = "full";
        public const string Domain = "domain";
        public const string Hidden = "hidden";

        public static int Rank(string? level) => level switch { Hidden => 2, Domain => 1, Full => 0, _ => 2 };   // unknown = strictest
        public static string Stricter(string? a, string? b) => Rank(a) >= Rank(b) ? Normalize(a) : Normalize(b);
        public static string Normalize(string? level) => level switch { Full => Full, Domain => Domain, _ => Hidden };
        public static bool IsValid(string? level) => level is Full or Domain or Hidden;
    }

    /// <summary>The speed ladder (research §5.1): one tick is one step.</summary>
    public static readonly double[] SpeedLadder = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

    /// <summary>Chrome's preset zoom ladder; factors are clamped to 0.25..5.</summary>
    public static readonly double[] ZoomLadder = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

    public static readonly string[] GroupColors = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

    /// <summary>Media Session actions the plugin may invoke through media.action.</summary>
    public static readonly string[] MediaActions =
    [
        "play", "pause", "stop", "nexttrack", "previoustrack", "seekbackward", "seekforward", "skipad",
        "togglemicrophone", "togglecamera", "hangup", "previousslide", "nextslide", "enterpictureinpicture", "voiceactivity",
    ];

    /// <summary>Actions a page may report as registered (Media.actions): the invokable ones plus seekto.</summary>
    public static readonly string[] ReportedActions = [.. MediaActions, "seekto"];
}
