using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Browser.Platform;

// Thin adapters from the module's ports to PrismControl.Desktop (CONTRACT-platform.md §1). Desktop picks its real or
// safe-mode implementations itself (DesktopServices.GetOrCreate reads ctx.SafeMode); the module additionally swaps
// in its own safe-mode ports, so a write can never slip through either layer.

public sealed class DesktopForeground(IForegroundService inner) : IForegroundPort
{
    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) => inner.GrantForegroundAsync(pid, ct);

    public async Task<RaiseResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) =>
        await inner.BringToFrontAsync(hwnd, ct).ConfigureAwait(false) switch
        {
            ForegroundResult.Focused => RaiseResult.Focused,
            ForegroundResult.AlreadyFocused => RaiseResult.AlreadyFocused,
            ForegroundResult.Restored => RaiseResult.Restored,
            ForegroundResult.NoWindow => RaiseResult.NoWindow,
            ForegroundResult.Elevated => RaiseResult.Elevated,
            ForegroundResult.SafeMode => RaiseResult.SafeMode,
            _ => RaiseResult.Refused,
        };

    public nint GetForeground() => inner.GetForeground();
    public nint LastExternalForeground => inner.LastExternalForeground;
}

public sealed class DesktopInput(IInputSender inner, IHotkeyProbe? hotkeys = null) : IInputPort
{
    public Task<bool> SendKeyAsync(ushort virtualKey, CancellationToken ct = default) => inner.SendKeyAsync((VirtualKey)virtualKey, ct);
    public bool TargetIsElevated(nint hwnd) => inner.TargetIsElevated(hwnd);
    public Task<bool?> IsGlobalKeyFreeAsync(ushort virtualKey, CancellationToken ct = default) =>
        hotkeys is null ? Task.FromResult<bool?>(null) : hotkeys.IsFreeAsync((VirtualKey)virtualKey, ct);
}

/// <summary>Browser frames of a process from the alt-tab catalog (DWM bounds). Read-only.</summary>
public sealed class DesktopWindows(IWindowCatalog catalog) : IWindowPort
{
    public IReadOnlyList<TopWindow> WindowsOf(int pid)
    {
        if (pid <= 0) return [];
        return [.. catalog.AltTabWindows().Where(w => w.Pid == pid && !w.IsCloaked)
            .Select(w => new TopWindow(w.Hwnd, w.Pid, w.Bounds.Left, w.Bounds.Top, w.Bounds.Width, w.Bounds.Height, w.IsMinimized, w.IsElevated, w.Title))];
    }

    public int? ProcessIdOf(nint hwnd) => hwnd == 0 ? null : catalog.Get(hwnd)?.Pid;
}

public sealed class DesktopRelay(RelayInstaller installer) : IRelayPort
{
    public string ExpectedPath => installer.StablePath;
    public Task<string> EnsureAsync(CancellationToken ct = default) => installer.EnsureAsync(ct);
}

/// <summary>Keeps small PNG/JPEG as they are; re-encodes anything else (or anything large) to a JPEG ≤ 288 px, ≤ 96 KB.</summary>
public sealed class DesktopScaler : IImageScaler
{
    public static readonly DesktopScaler Instance = new();

    public async Task<byte[]?> ScaleAsync(byte[] bytes, int maxPx, CancellationToken ct = default)
    {
        var info = PrismControl.Core.Render.ImageInfo.Probe(bytes);
        if (info is { Mime: "image/png" or "image/jpeg" } && info.Width <= maxPx && info.Height <= maxPx && bytes.Length <= Protocol.Wire.Limits.ArtMaxBytes)
            return bytes;
        return await ArtScaler.ToJpegAsync(bytes, maxPx, Protocol.Wire.Limits.ArtMaxBytes, ct).ConfigureAwait(false);
    }
}

/// <summary>Desktop's authenticated pipe session as an <see cref="IFrameConnection"/>.</summary>
public sealed class PipeConnection(PipeSession session) : IFrameConnection
{
    public JsonObject? Preamble => session.Hello;
    public Task<JsonNode?> ReadAsync(CancellationToken ct) => session.ReadAsync(ct);
    public Task WriteAsync(JsonNode frame, CancellationToken ct) => session.WriteAsync(frame, ct);
    public int? ClientPid => session.ClientPid;
    public string? ClientImagePath => session.ClientImagePath;
    public ValueTask DisposeAsync() => session.DisposeAsync();
}

/// <summary>
/// The "browser" pipe endpoint: \\.\pipe\prism-control-browser-&lt;random&gt;, user-only ACL, NETWORK denied, remote
/// clients rejected, discovery file %APPDATA%\Prism\control\modules\browser\ingress.json. Frames are capped at 512 KB
/// inbound (the extension's own cap); an oversize frame closes the session and the relay reconnects.
/// </summary>
public sealed class DesktopFrameEndpoint : IFrameEndpoint
{
    private readonly PipeEndpoint _endpoint;

    private DesktopFrameEndpoint(PipeEndpoint endpoint, int max)
    {
        _endpoint = endpoint;
        MaxSessions = max;
    }

    public static PipeEndpointOptions Options(string discoveryFile) => new()
    {
        Name = Protocol.Wire.EndpointName,
        MaxInstances = Protocol.Wire.Limits.MaxConnections,
        MaxFrameBytes = Protocol.Wire.Limits.InboundMaxBytes,
        ReadTimeout = TimeSpan.FromSeconds(1),
        DiscoveryFile = discoveryFile,
    };

    /// <summary>
    /// Creates the endpoint WITHOUT listening yet. Subscribe (hub.Start) first, then <see cref="StartAsync(CancellationToken)"/>
    /// publishes ingress.json: a relay that connects at once is never dropped for want of a handler (LOW 20).
    /// </summary>
    public static DesktopFrameEndpoint Create(PipeEndpointOptions options, ILog log)
    {
        var ep = new PipeEndpoint(options, log);
        var wrapper = new DesktopFrameEndpoint(ep, options.MaxInstances);
        ep.SessionOpened += wrapper.OnSession;
        return wrapper;
    }

    /// <summary>Listens, then writes the discovery file.</summary>
    public Task StartAsync(CancellationToken ct = default) => _endpoint.StartAsync(ct);

    /// <summary>Creates and starts the endpoint (listening, then the discovery file). Subscribe through <see cref="ConnectionOpened"/>.</summary>
    public static async Task<DesktopFrameEndpoint> StartAsync(PipeEndpointOptions options, ILog log, CancellationToken ct = default)
    {
        var wrapper = Create(options, log);
        await wrapper.StartAsync(ct).ConfigureAwait(false);
        return wrapper;
    }

    public string PipeName => _endpoint.PipeName;
    public string? Token => null;   // PipeEndpoint authenticates the first frame itself
    public int RejectedClients => _endpoint.RejectedClients;
    public int ActiveSessions => _endpoint.ActiveSessions;
    public int MaxSessions { get; }
    public event Func<IFrameConnection, Task>? ConnectionOpened;

    private Task OnSession(PipeSession s)
    {
        var handler = ConnectionOpened;
        return handler is null ? Task.CompletedTask : handler(new PipeConnection(s));
    }

    public ValueTask DisposeAsync() => _endpoint.DisposeAsync();
}

/// <summary>Real shell opens: ShellExecute through Core's ProcessLauncher (starts nothing in safe mode).</summary>
public sealed class ShellPort : IShellPort
{
    public bool Open(string path) => ProcessLauncher.Start(path) is not null;
    public bool ShowInFolder(string path) => ProcessLauncher.Start("explorer.exe", "/select,\"" + path + "\"") is not null;
    public bool OpenFolder(string path) => ProcessLauncher.Start("explorer.exe", "\"" + path + "\"") is not null;
}
