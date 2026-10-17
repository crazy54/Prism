using PrismControl.Ai.Approvals;
using PrismControl.Ai.Hooks;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Sessions.Jump;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

[assembly: PrismModule(typeof(PrismControl.Ai.AiModule))]

namespace PrismControl.Ai;

/// <summary>
/// The <c>ai</c> module: terminal-agnostic AI agent sessions, the fleet board, deck approvals (Tier 1) and the hook
/// installer; AI2's Apps + Services plug in through <see cref="ServicesFeatures.Register"/>.
/// <list type="bullet">
/// <item>Sessions merge <c>claude agents --json</c> (adaptive polling, only while an AI action is visible), Prism hook events
/// from prism-relay over the per-user <c>ai</c> pipe, Codex rollout tails (keys and state only), process exits with a
/// pid + creation-time guard, and optional Orca enrichment. Orca is never the source.</item>
/// <item>Private by default: no prompts, paths, commands or titles on the deck unless the user picks Reveal.</item>
/// <item>Safe mode: no holds (approvals fall through to the agent's own prompt), no focus, no link opening, no CLI UI commands,
/// no hook-file writes, no pins saved. Reads (pollers, the pipe) stay real.</item>
/// </list>
/// </summary>
public sealed class AiModule : IPrismModule, IAsyncDisposable
{
    private readonly List<IAsyncDisposable> _async = [];
    private readonly List<IDisposable> _sync = [];
    private ITimer? _tick;

    public string Name => "ai";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log;
        var safe = context.SafeMode;
        var time = context.Time;
        var settings = new AiSettingsService(context.GlobalSettings);
        var desktop = DesktopServices.GetOrCreate(context);
        var tree = new Win32ProcessTree();
        var watcher = new ProcessExitWatcher(time, log);
        _sync.Add(watcher);
        IPinStore pins = safe ? new MemoryPinStore() : new FilePinStore(context.DataDirectory, log);
        var tracker = new SessionTracker(time, log, new SlotTable(pins), watcher, tree) { RetainTitles = !settings.Current.IsPrivate };
        settings.Changed += s => tracker.RetainTitles = !s.IsPrivate;

        var presence = new DeckPresence(context.Devices.All);
        presence.Attach(context.Events);
        // Review M5: no deck hold while the PC is locked or nobody is there (read-only WTS + GetLastInputInfo).
        var broker = new ApprovalBroker(time, log, presence, settings, tracker, safe, new Win32UserPresence());
        _sync.Add(broker);

        var runner = new CliRunner(log);
        var hub = new AiStatusHub(tracker, () => settings.Current.Mode, time);
        AiServices? services = null;
        var poller = new AgentListPoller(tracker, runner, time, log, () => services?.Demanded ?? false, () => !settings.Current.IsPrivate,
            () => [null, .. settings.Current.ExtraClaudeConfigDirs.Where(d => !string.IsNullOrWhiteSpace(d)).Take(4)]);
        var orca = new OrcaEnricher(tracker, runner, time, log, () => (services?.Demanded ?? false) && settings.Current.OrcaEnrichment);
        var rollout = new RolloutTailer(RolloutTailer.DefaultRoot(), tracker, time, log, hub.ReportCodexLimits);
        _async.Add(poller);
        _async.Add(orca);
        _sync.Add(rollout);

        var relay = new DesktopRelayProvider(RelayInstaller.ForModule(context));
        var ingress = new AiIngress(tracker, broker, tree, time, log, relay.IsOurCommand);
        var endpoint = new DesktopIngressEndpoint(DesktopPaths.IngressFile("ai"), log);
        endpoint.ConnectionOpened += c => ingress.HandleAsync(c, context.ShutdownToken);
        _async.Add(endpoint);

        var windows = new DesktopWindowHost(desktop.Foreground, desktop.Windows, safe, log);
        var jumper = new Jumper(windows, new UiaTabSelector(log, safe), new AppUriOpener(context.OpenUrl, safe, log), runner, tree,
            () => settings.Current, () => orca.OrcaPath, (key, ct) => TitleFor(runner, key, ct), log, safe);
        var hooks = new HookInstaller(HookHome.ForCurrentUser(), relay, relay.IsOurCommand, log, safe, time);

        services = new AiServices
        {
            Sessions = tracker,
            Approvals = broker,
            Presence = presence,
            Settings = settings,
            Jumper = jumper,
            Hooks = hooks,
            Status = hub,
            Time = time,
            Log = log,
            SafeMode = safe,
            Ingress = ingress,
            AgentList = poller,
            Orca = orca,
            Rollout = rollout,
        };
        context.Services.Add(services);
        context.Services.Add<IAiStatus>(hub);
        context.Services.Add<IAiStatusSink>(hub);

        // Background start-up (Initialize stays fast).
        _ = Task.Run(async () =>
        {
            try { await endpoint.StartAsync(context.ShutdownToken).ConfigureAwait(false); }
            catch (Exception ex) { log.Warn("the ai pipe could not start; approvals and instant states are off", ex); }
            await CheckHooksAtStartAsync(hooks, relay, safe, log, context.ShutdownToken).ConfigureAwait(false);
        });
        poller.Start(SessionDirs(settings.Current));
        orca.Start();
        rollout.Start();
        _tick = time.CreateTimer(_ => tracker.Tick(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
        if (safe) log.Info("Safe mode: AI approvals fall through, nothing is focused or opened, hook files are never written.");
        log.Info($"AI module ready ({(settings.Current.IsPrivate ? "private" : "reveal")} mode)");

        ServicesFeatures.Register(context, hub, hub);
    }

    /// <summary>
    /// Start-up: report drift (never repaired silently) and, review M6, refresh the stable relay copy our entries point at when
    /// our entries exist (a no-op when its hash matches the plugin's), so a plugin update reaches the relay without a re-install.
    /// Never in safe mode (no writes). Returns whether the relay was refreshed (tests).
    /// </summary>
    internal static async Task<bool> CheckHooksAtStartAsync(HookInstaller hooks, IRelayProvider relay, bool safe, ILog log, CancellationToken ct)
    {
        try
        {
            var drift = hooks.CheckDrift();
            if (drift.Drifted) log.Warn("Prism hook entries are missing from a hook file (another tool rewrote it?). Open an AI action's settings to review.");
            if (!drift.Installed || safe) return false;
            if (await relay.EnsureAsync(ct).ConfigureAwait(false))
            {
                log.Debug("hook relay checked/refreshed");
                return true;
            }
            log.Warn("the hook relay could not be refreshed; approvals stay locked for an old relay protocol until it is");
        }
        catch (Exception ex) { log.Debug($"drift check / relay refresh failed: {ex.GetType().Name}"); }
        return false;
    }

    private static IEnumerable<string> SessionDirs(AiSettings s)
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var main = Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR") is { Length: > 0 } c ? c : Path.Combine(profile, ".claude");
        yield return Path.Combine(main, "sessions");
        foreach (var d in s.ExtraClaudeConfigDirs.Where(d => !string.IsNullOrWhiteSpace(d)).Take(4)) yield return Path.Combine(d, "sessions");
    }

    /// <summary>The session's name for the WT tab match only: fetched fresh, used in memory, never stored or logged.</summary>
    private static async Task<string?> TitleFor(ICommandRunner runner, SessionKey key, CancellationToken ct)
    {
        if (key.Agent != AgentKind.Claude || runner.Find("claude.exe") is not { } claude) return null;
        var r = await runner.RunAsync(new CommandSpec(claude, ["agents", "--json"], TimeSpan.FromSeconds(2), 4 << 20), ct).ConfigureAwait(false);
        if (!r.Ok) return null;
        return AgentListParser.TryParse(r.StdOut, keepTitles: true)?.FirstOrDefault(e => e.KeyId == key.Id)?.Title;
    }

    public async ValueTask DisposeAsync()
    {
        _tick?.Dispose();
        foreach (var d in _sync) { try { d.Dispose(); } catch (Exception) { } }
        foreach (var d in _async) { try { await d.DisposeAsync().ConfigureAwait(false); } catch (Exception) { } }
    }
}
