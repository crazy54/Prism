using PrismControl.Browser.Hub;
using PrismControl.Browser.Install;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Smtc;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

[assembly: PrismModule(typeof(PrismControl.Browser.BrowserModule),
    MonitorApplications = ["chrome.exe", "msedge.exe", "brave.exe", "vivaldi.exe", "opera.exe", "obs64.exe", "obs32.exe"])]

namespace PrismControl.Browser;

/// <summary>
/// The browser module: one <see cref="BrowserHub"/> (the "browser" pipe the Chrome/Edge extension reaches through
/// prism-relay, the merged state, commands, images, the SMTC lite tier) and the <see cref="HostInstaller"/> behind the
/// PI's "Connect browsers". Initialize is quick: the pipe starts in the background. Nothing is installed or registered
/// here: HostInstaller only runs from the PI, after the user reviewed and confirmed the exact steps, and never in safe mode.
/// Safe mode swaps every write port (commands, foreground, keystrokes, file opens, the relay copy, HostInstaller).
/// </summary>
public sealed class BrowserModule : IPrismModule, IAsyncDisposable
{
    public static readonly string[] StreamingApps = ["obs64.exe", "obs32.exe"];

    private BrowserHub? _hub;
    private DesktopFrameEndpoint? _endpoint;
    private Task? _start;
    private int _streamingApps;

    public string Name => "browser";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log.For("browser");
        var safe = context.SafeMode;
        DesktopServices? desktop = null;
        try { desktop = DesktopServices.GetOrCreate(context); }
        catch (Exception ex) { log.Error("Desktop services unavailable; focus, keystrokes and the pipe are off", ex); }

        IForegroundPort foreground = safe ? new SafeModeForeground() : desktop is null ? UnavailableForeground.Instance : new DesktopForeground(desktop.Foreground);
        IInputPort input = safe ? new SafeModeInput() : desktop is null ? UnavailableInput.Instance : new DesktopInput(desktop.Input, desktop.Hotkeys);
        IWindowPort windows = desktop is null ? NoWindows.Instance : new DesktopWindows(desktop.Windows);   // read-only
        IShellPort shell = safe ? new SafeModeShell() : new ShellPort();
        var relay = RelayInstaller.ForModule(context);
        IRelayPort relayPort = safe ? new SafeModeRelay(relay.StablePath) : new DesktopRelay(relay);

        var installer = new HostInstaller(new HostInstallerOptions
        {
            Registry = new CurrentUserRegistry(),
            Relay = relayPort,
            DataDirectory = context.DataDirectory,
            ExtensionSource = Path.Combine(context.PluginDirectory, "extension"),
            SafeMode = safe,
            Log = log,
            Time = context.Time,
        });
        context.Services.Add(installer);

        var hub = new BrowserHub(new BrowserHubOptions
        {
            Log = log,
            Time = context.Time,
            SafeMode = safe,
            Foreground = foreground,
            Input = input,
            Windows = windows,
            Shell = shell,
            Scaler = DesktopScaler.Instance,
            ArtFetcher = new ArtFetcher(log, time: context.Time),
            Smtc = new SmtcLiteReader(log, context.Time),
            Verifier = new RelayImageVerifier(log),
            PluginVersion = typeof(BrowserModule).Assembly.GetName().Version?.ToString(3) ?? "0.1.0",
            PrivacyMemory = new State.PrivacyMemory(Path.Combine(context.DataDirectory, State.PrivacyMemory.FileName), log, readOnly: safe),
        });
        _hub = hub;
        context.Services.Add(hub);

        void ApplyGlobals()
        {
            try { hub.ApplySettings(context.GlobalSettings.GetSection<BrowserGlobalSettings>(BrowserGlobalSettings.Section)); }
            catch (Exception ex) { log.Debug("browser global settings unreadable: " + ex.Message); }
        }
        context.GlobalSettings.Changed += (_, _) => ApplyGlobals();
        context.Events.ApplicationLaunched += (_, app) =>
        {
            if (StreamingApps.Contains(app, StringComparer.OrdinalIgnoreCase) && Interlocked.Increment(ref _streamingApps) > 0) hub.SetStreamingDetected(true, app);
        };
        context.Events.ApplicationTerminated += (_, app) =>
        {
            if (!StreamingApps.Contains(app, StringComparer.OrdinalIgnoreCase)) return;
            if (Interlocked.Decrement(ref _streamingApps) <= 0)
            {
                Interlocked.Exchange(ref _streamingApps, 0);
                hub.SetStreamingDetected(false);
            }
        };

        _start = Task.Run(async () =>
        {
            try
            {
                await context.GlobalSettings.WaitForLoadAsync(TimeSpan.FromSeconds(3)).ConfigureAwait(false);
                ApplyGlobals();
                // LOW 20: subscribe first, THEN listen and publish ingress.json, so a relay that connects at once is served.
                DesktopFrameEndpoint? created = null;
                if (desktop is not null)
                {
                    try { created = DesktopFrameEndpoint.Create(DesktopFrameEndpoint.Options(Path.Combine(context.DataDirectory, "ingress.json")), log); }
                    catch (Exception ex) when (ex is not OperationCanceledException) { log.Error("The browser pipe could not be created", ex); }
                }
                hub.Start(created);
                IFrameEndpoint? endpoint = null;
                if (created is not null)
                {
                    try
                    {
                        await created.StartAsync(context.ShutdownToken).ConfigureAwait(false);
                        _endpoint = created;
                        endpoint = created;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        log.Error("The browser pipe could not start", ex);
                        hub.MarkPlatformUnavailable();
                        await created.DisposeAsync().ConfigureAwait(false);
                    }
                }
                log.Info($"Browser module ready ({(endpoint is null ? "no pipe" : "pipe listening")}{(safe ? ", safe mode" : "")}).");
                // MED 7: after a plugin update, refresh the relay and extension copies Connect made earlier (that consent
                // covers them); the PI then says when the running extension is older than the packaged one.
                try
                {
                    var refreshed = await installer.RefreshAsync(context.ShutdownToken).ConfigureAwait(false);
                    if (refreshed.Count > 0) log.Info($"Browser connection copies checked: {string.Join(", ", refreshed.Select(r => r.Split(' ')[0]))}.");
                }
                catch (Exception ex) when (ex is not OperationCanceledException) { log.Warn("The browser connection copies could not be refreshed", ex); }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { log.Error("Browser module failed to start", ex); }
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_start is { } s)
        {
            try { await s.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); } catch (Exception) { }
        }
        if (_hub is { } hub) await hub.DisposeAsync().ConfigureAwait(false);
        if (_endpoint is { } ep) await ep.DisposeAsync().ConfigureAwait(false);
    }
}
