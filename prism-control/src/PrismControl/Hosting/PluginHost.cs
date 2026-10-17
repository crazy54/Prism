using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Core.Scheduling;
using PrismControl.DataApi;
using PrismControl.Protocol;

namespace PrismControl.Hosting;

/// <summary>
/// Wires the plugin together: log → devices → scheduler/pump → connection → global settings → data API + control.json
/// → modules → actions. Runs until the app closes the socket (or reconnecting gives up), then shuts down cleanly:
/// every action gets willDisappear, modules are disposed, control.json is deleted, the socket is closed.
/// </summary>
internal static class PluginHost
{
    public const string LogLevelEnv = "PRISM_CONTROL_LOG_LEVEL";
    public const string ReconnectEnv = "PRISM_CONTROL_RECONNECT_SECONDS";

    public static async Task<int> RunAsync(LaunchArgs args, CancellationToken cancellationToken)
    {
        var started = DateTimeOffset.UtcNow;
        await using var log = new FileLog(PluginPaths.LogDirectory, ParseLevel(Environment.GetEnvironmentVariable(LogLevelEnv)));
        log.Info($"Prism Control {PluginInfo.ManifestVersion} starting: pid {Environment.ProcessId}, Stream Deck {args.Info.Application.Version}, " +
                 $"{args.Info.Devices.Count} device(s): {string.Join("; ", args.Info.Devices.Select(d => $"{d.Name} type {(int)d.Type} {d.Columns}x{d.Rows}"))}");

        // Safe mode: the fake host and E2E press every action at random, so module writes must be no-ops or fakes.
        var safeMode = SafeModeEnvironment.FromEnvironment();
        if (safeMode)
        {
            // Second layer for the one module with its own switch: no keystrokes and no launches, whatever Macros reads.
            Environment.SetEnvironmentVariable(SafeModeEnvironment.MacrosDryRunVariable, "1");
            log.Warn("**** SAFE MODE ON (" + SafeModeEnvironment.Variable + "=1) **** Modules must not change volume, default devices, mic mute, " +
                     "EQ, playback or fans, send input or launch apps; writes are no-ops or fakes. Macros dry run forced on.");
        }
        else log.Info("Safe mode off: actions act on this PC.");

        var scrubbed = ProcessLauncher.ScrubInheritedEnvironment();
        if (scrubbed.Count > 0) log.Info($"Removed {scrubbed.Count} inherited Qt variable(s) from the environment so launched apps scale normally.");

        var time = TimeProvider.System;
        var devices = new DeviceDirectory(args.Info.Devices);
        var scheduler = new UpdateScheduler(new SchedulerOptions());
        var reconnect = double.TryParse(Environment.GetEnvironmentVariable(ReconnectEnv), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var rs) ? rs : 10;
        await using var connection = new StreamDeckConnection(args, log.For("ws"), new ConnectionOptions { ReconnectWindow = TimeSpan.FromSeconds(reconnect) });
        log.RemoteSink = msg => connection.TrySend(Outbound.LogMessage("Prism Control: " + msg), isLog: true);
        var pump = new UpdatePump(scheduler, connection, time, log.For("pump"));
        var globals = new GlobalSettingsStore(s => connection.TrySend(Outbound.SetGlobalSettings(args.PluginUuid, s)), log.For("settings"));
        globals.Changed += (_, _) =>
        {
            var budget = globals.Core.UpdateBudget;
            if (Math.Abs(scheduler.Options.UpdatesPerSecond - Math.Clamp(budget, SchedulerOptions.MinBudget, SchedulerOptions.MaxBudget)) > 0.01)
            {
                scheduler.UpdateOptions(scheduler.Options with { UpdatesPerSecond = budget });
                log.Info($"Update budget set to {scheduler.Options.UpdatesPerSecond:0.#}/s (global settings core.updateBudget).");
            }
        };
        var services = new ServiceRegistry();
        var data = new DataRegistry(time);
        var events = new PluginEvents { Log = log.For("events") };
        using var shutdown = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        // ---- modules and actions
        var errors = new List<string>();
        var warnings = new List<string>();
        var modules = ModuleLoader.Load(log, errors);
        var registry = ActionRegistry.Discover(modules.Select(m => m.Assembly).Append(typeof(PluginHost).Assembly), errors, warnings);
        foreach (var e in errors) log.Error("Action discovery: " + e);
        foreach (var w in warnings) log.Warn("Action discovery: " + w);
        log.Info($"{registry.Actions.Count} action(s) from {modules.Count} module assembly(ies).");
        var actions = new ActionHost(registry, scheduler, pump, connection, devices, log, services, globals, time, args.PluginUuid, safeMode);
        var diagnostics = new PluginDiagnostics(scheduler, pump, connection, actions, started, safeMode);
        services.Add<IPluginDiagnostics>(diagnostics);

        // ---- data API (+ discovery file)
        DataApiServer? api = null;
        try
        {
            api = new DataApiServer(data, () => Health(args, devices, scheduler, pump, connection, data, actions, registry, started, safeMode), log.For("api"));
            api.Start();
            ControlFile.Write(PluginPaths.ControlFile, api.Port, api.Token);
        }
        catch (Exception ex)
        {
            log.Error("The data API could not start; the sibling plugin will not get data.", ex);
        }
        var demo = DemoProviders.Enabled ? new DemoProviders() : null;
        demo?.Start(data, log);

        var moduleInstances = new List<IPrismModule>();
        foreach (var m in modules)
        {
            if (m.ModuleType is null) continue;
            try
            {
                var instance = (IPrismModule)Activator.CreateInstance(m.ModuleType)!;
                instance.Initialize(new ModuleContext(instance.Name, log.For(instance.Name), data, services, globals, events, devices, time, shutdown.Token,
                    url => connection.TrySend(Outbound.OpenUrl(url)), safeMode));
                moduleInstances.Add(instance);
                log.Info($"Module {instance.Name} initialized.");
            }
            catch (Exception ex)
            {
                log.Error($"Module {m.ModuleType.FullName} failed to initialize; its actions may not work.", ex);
            }
        }

        // ---- connection wiring
        connection.MessageReceived += text => OnMessage(text, actions, globals, devices, events, log);
        connection.Registered += () =>
        {
            connection.TrySend(Outbound.GetGlobalSettings(args.PluginUuid));
            events.RaiseConnected();
        };
        connection.Disconnected += reason =>
        {
            _ = actions.ClearAsync();
            events.RaiseDisconnected();
        };

        var pumpTask = Task.Run(() => pump.RunAsync(shutdown.Token));
        var outcome = await connection.RunAsync(shutdown.Token).ConfigureAwait(false);

        // ---- shutdown
        log.Info($"Shutting down ({outcome}).");
        await actions.ClearAsync().ConfigureAwait(false);
        foreach (var m in moduleInstances)
        {
            if (m is not IAsyncDisposable d) continue;
            try { await d.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); }
            catch (Exception ex) { log.Warn($"Module {m.Name} did not shut down cleanly", ex); }
        }
        shutdown.Cancel();
        if (demo is not null) await demo.DisposeAsync().ConfigureAwait(false);
        if (api is not null)
        {
            ControlFile.DeleteIfOurs(PluginPaths.ControlFile, api.Token);
            await api.DisposeAsync().ConfigureAwait(false);
        }
        await connection.CloseAsync().ConfigureAwait(false);
        try { await pumpTask.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); } catch { }
        log.Info("Stopped.");
        return outcome == DisconnectReason.GaveUp ? 1 : 0;
    }

    private static void OnMessage(string text, ActionHost actions, GlobalSettingsStore globals, DeviceDirectory devices, PluginEvents events, ILog log)
    {
        switch (InboundParser.Parse(text))
        {
            case ActionEvent e:
                actions.Dispatch(e);
                break;
            case GlobalSettingsMessage g:
                globals.OnReceived(g.Settings);
                break;
            case DeviceConnectedMessage c:
                devices.Upsert(c.Device);
                actions.OnDeviceChanged(c.Device);
                events.RaiseDeviceConnected(c.Device);
                break;
            case DeviceChangedMessage c:
                devices.Upsert(c.Device);
                actions.OnDeviceChanged(c.Device);
                break;
            case DeviceDisconnectedMessage d:
                events.RaiseDeviceDisconnected(d.DeviceId);
                break;
            case SystemWokeMessage:
                events.RaiseSystemWokeUp();
                break;
            case ApplicationMessage a:
                events.RaiseApplication(a.Application, a.Launched);
                break;
            case DeepLinkMessage l:
                events.RaiseDeepLink(l.Url);
                break;
            case UnknownMessage u:
                log.Debug($"Unhandled event {u.Name}");
                break;
            case null:
                log.Warn("Unparseable message from the app.");
                break;
        }
    }

    private static JsonObject Health(LaunchArgs args, DeviceDirectory devices, UpdateScheduler scheduler, UpdatePump pump, StreamDeckConnection connection,
        DataRegistry data, ActionHost actions, ActionRegistry registry, DateTimeOffset started, bool safeMode)
    {
        var stats = scheduler.GetStats(pump.Now);
        var providers = new JsonObject();
        foreach (var t in data.Topics)
        {
            providers[t.Path] = new JsonObject
            {
                ["available"] = t.HasData,
                ["source"] = t.Source,
                ["demo"] = t.IsDemo,
                ["seq"] = t.Seq,
                ["ageMs"] = t.UpdatedAt is { } at ? (long)(DateTimeOffset.UtcNow - at).TotalMilliseconds : null,
                ["cadenceMs"] = (long)t.Cadence.TotalMilliseconds,
                ["demanded"] = t.IsDemanded,
            };
        }
        return new JsonObject
        {
            ["status"] = connection.IsConnected ? "ok" : "degraded",
            ["api"] = PluginInfo.ApiVersion,
            ["plugin"] = PluginInfo.Uuid,
            ["version"] = PluginInfo.ManifestVersion,
            ["pid"] = Environment.ProcessId,
            ["uptimeSec"] = Math.Round((DateTimeOffset.UtcNow - started).TotalSeconds, 1),
            // Safe mode (fake host / E2E): module writes are no-ops or fakes. macrosDryRun: Macros sends no input and launches nothing.
            ["safeMode"] = safeMode,
            ["macrosDryRun"] = SafeModeEnvironment.MacrosDryRunFromEnvironment(),
            ["streamDeck"] = new JsonObject
            {
                ["connected"] = connection.IsConnected,
                ["appVersion"] = args.Info.Application.Version,
                ["devices"] = new JsonArray(devices.All.Select(d => (JsonNode)new JsonObject
                {
                    ["id"] = d.Id,
                    ["name"] = d.Name,
                    ["type"] = (int)d.Type,
                    ["columns"] = d.Columns,
                    ["rows"] = d.Rows,
                }).ToArray()),
            },
            ["updates"] = new JsonObject
            {
                ["budgetPerSec"] = stats.BudgetPerSecond,
                ["sentLastSec"] = stats.SentLastSecond,
                ["sent"] = stats.Sent,
                ["coalesced"] = stats.Coalesced,
                ["skippedUnchanged"] = stats.SkippedUnchanged,
                ["pendingContexts"] = stats.PendingContexts,
                ["avgLatencyMs"] = stats.AvgLatencyMs,
            },
            ["actions"] = new JsonObject { ["registered"] = registry.Actions.Count, ["instances"] = actions.Count },
            ["providers"] = providers,
        };
    }

    private static LogLevel ParseLevel(string? s) => s?.ToLowerInvariant() switch
    {
        "debug" => LogLevel.Debug,
        "warn" or "warning" => LogLevel.Warn,
        "error" => LogLevel.Error,
        _ => LogLevel.Info,
    };

    private sealed class PluginDiagnostics(UpdateScheduler scheduler, UpdatePump pump, StreamDeckConnection connection, ActionHost actions, DateTimeOffset started, bool safeMode) : IPluginDiagnostics
    {
        public bool SafeMode => safeMode;
        public SchedulerStats Scheduler => scheduler.GetStats(pump.Now);
        public long FramesSent => connection.FramesSent;
        public long FramesReceived => connection.FramesReceived;
        public long Dropped => connection.Dropped;
        public long Reconnects => connection.Reconnects;
        public bool Connected => connection.IsConnected;
        public int ActionInstances => actions.Count;
        public TimeSpan Uptime => DateTimeOffset.UtcNow - started;
    }
}
