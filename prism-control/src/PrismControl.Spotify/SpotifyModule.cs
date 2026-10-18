using PrismControl.Core.Hosting;
using PrismControl.Core.Security;
using PrismControl.Spotify.Actions;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Smtc;

[assembly: PrismModule(typeof(PrismControl.Spotify.SpotifyModule), MonitorApplications = ["Spotify.exe"])]

namespace PrismControl.Spotify;

/// <summary>
/// The Spotify module: one <see cref="SpotifyService"/> (Windows media session + Web API after Connect) shared by every
/// Spotify action, tokens in DPAPI under the module's data folder, and the /v1/now-playing (+ art) data topics.
/// Initialize is quick; SMTC and the saved sign-in load in the background.
/// </summary>
public sealed class SpotifyModule : IPrismModule, IAsyncDisposable
{
    private SpotifyService? _service;
    private Task? _start;

    public string Name => "spotify";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log.For("spotify");
        var safeMode = context.SafeMode;
        if (safeMode) log.Info("Safe mode: Spotify playback, volume, library and launch writes are faked, and the saved sign-in is never changed or refreshed.");
        var vault = new DpapiVault(new SecretStore(context.DataDirectory, "prismcontrol/spotify"));
        var smtc = new SmtcSource(log, context.Time);
        // In safe mode the service wraps SMTC and the vault (reads real, writes fake) and fakes Web API writes and the launch.
        var service = new SpotifyService(smtc, vault, context.Time, log, options: new SpotifyServiceOptions
        {
            SafeMode = safeMode,
            LaunchUri = uri =>
            {
                try
                {
                    ProcessLauncher.Start(uri);   // "spotify:" works for the Win32 and Store installs
                    return true;
                }
                catch (Exception ex)
                {
                    log.Warn("Could not start Spotify", ex);
                    return false;
                }
            },
        });
        _service = service;
        context.Services.Add(service);

        // Data API: now playing + the art bytes exactly as returned (Spotify's JPEG, or the SMTC PNG).
        var nowPlaying = context.Data.NowPlaying.Claim("spotify", TimeSpan.Zero);
        var art = context.Data.NowPlayingArt.Claim("spotify");
        if (nowPlaying is null || art is null) log.Warn("Another provider owns /v1/now-playing; Spotify will not publish it.");
        service.AttachPublishers(nowPlaying, art);
        // Other modules' dials (Kaleidoscope's volume/seek) drive playback through Core's contract, only while we own now-playing.
        if (nowPlaying is not null) context.Services.Add<PrismControl.Core.Data.INowPlayingControl>(new SpotifyNowPlayingControl(service));

        void ApplyGlobals()
        {
            try { service.FollowAnyApp = context.GlobalSettings.GetSection<SpotifyGlobalSettings>(SpotifyGlobalSettings.Section).AnyMediaApp; }
            catch (Exception ex) { log.Debug("spotify global settings unreadable: " + ex.Message); }
        }
        context.GlobalSettings.Changed += (_, _) => ApplyGlobals();
        context.Events.ApplicationLaunched += (_, app) => { if (SmtcSource.IsSpotifyApp(app)) smtc.Rebind(); };
        context.Events.ApplicationTerminated += (_, app) => { if (SmtcSource.IsSpotifyApp(app)) smtc.Rebind(); };
        context.Events.SystemWokeUp += (_, _) => { smtc.Rebind(); service.RequestRefresh(TimeSpan.FromSeconds(2)); };

        _start = Task.Run(async () =>
        {
            try
            {
                await context.GlobalSettings.WaitForLoadAsync(TimeSpan.FromSeconds(3)).ConfigureAwait(false);
                ApplyGlobals();
                await service.StartAsync(context.ShutdownToken).ConfigureAwait(false);
                log.Info($"Spotify module ready ({(service.IsConnected ? "connected" : "not connected; media session only")}).");
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { log.Error("Spotify module failed to start", ex); }
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_start is { } s)
        {
            try { await s.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); } catch (Exception) { }
        }
        if (_service is { } svc) await svc.DisposeAsync().ConfigureAwait(false);
    }
}
