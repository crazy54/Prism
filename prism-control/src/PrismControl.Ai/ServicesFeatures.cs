using PrismControl.Ai.Apps;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Services.Verbs;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;
using PrismControl.Core.Security;
using PrismControl.Desktop;

namespace PrismControl.Ai;

/// <summary>
/// AI2's half of the <c>ai</c> module (Apps + Services), started by <see cref="AiModule.Initialize"/> after the sessions half.
/// <list type="bullet">
/// <item><b>Apps</b>: Claude Desktop, ChatGPT (package OpenAI.Codex), Copilot, VS Code, Cursor, Gemini: running / in front /
/// voice (inferred from an open microphone session) / generating = unknown; focus-or-launch; Ask AI (pre-fill, never send);
/// dictation (Win+H, VS Code Ctrl+I hold).</item>
/// <item><b>Services</b>: provider health from public status pages (demand-driven polling with ETag / If-Modified-Since, jitter,
/// backoff, a 60 s floor); Codex 5 h / weekly limits from Codex's own logs (limit keys only); opt-in Bedrock usage via the user's
/// AWS CLI (CloudWatch get-metric-data, at most every 5 min); opt-in Anthropic / OpenAI admin usage (keys in SecretStore).</item>
/// <item>Everything is published into the unified model through <see cref="IAiStatusSink"/> and to the Smart Deck through the
/// composite <c>ai</c> <see cref="IVerbProvider"/>.</item>
/// </list>
/// Nothing polls before a surface (or a Smart readout) asks. Safe mode: no launches, no input, no clipboard, no links, no AWS CLI,
/// no admin API calls; public status pages are reads and stay real. Settings: AI2's own global section <c>aiservices</c>.
/// </summary>
public static class ServicesFeatures
{
    public static void Register(IModuleContext context, IAiStatusSink status, IAiStatus read) => Build(context, status, read);

    /// <summary>Builds and registers AI2's services (returned for tests and tools).</summary>
    internal static Ai2Services Build(IModuleContext context, IAiStatusSink status, IAiStatus read)
    {
        var log = context.Log;
        var safe = context.SafeMode;
        var time = context.Time;
        var shutdown = context.ShutdownToken;
        var settings = new Ai2SettingsService(context.GlobalSettings);
        context.Services.TryGet<DesktopServices>(out var desk);
        context.Services.TryGet<AiServices>(out var ai1);

        var http = new HttpClientFetcher();
        void Background(Func<Task> work) => _ = Task.Run(async () =>
        {
            try { await work().ConfigureAwait(false); }
            catch (Exception ex) when (ex is not OperationCanceledException) { log.Warn("an AI services task failed", ex); }
        });

        var health = new HealthService(http, time, log, () => settings.Current) { Kicker = Background };
        var codex = new CodexLimitsService(RolloutTailer.DefaultRoot(), time, log, status) { Runner = w => Task.Run(w) };
        var aws = new AwsCliRunner();
        var bedrock = new BedrockUsageService(aws, () => settings.Current, time, log, safe) { Kicker = Background };
        ISecretVault vault = string.IsNullOrEmpty(context.DataDirectory)
            ? new MemoryVault()
            : new SecretStoreVault(new SecretStore(context.DataDirectory, "prismcontrol/ai"));
        var admin = new AdminUsageService(http, vault, () => settings.Current, time, log, safe) { Kicker = Background };

        var probe = new Win32AppProbe();
        var foregroundProbe = new Win32ForegroundProbe();
        var apps = new AppMonitor(new Win32ProcessScanner(), foregroundProbe, new CoreAudioVoiceProbe(), probe, time, log, () => read.Snapshot().Sessions)
        {
            Kicker = Background,
        };
        var clipboard = desk is null ? null : new Win32Clipboard(desk.Shell);
        var launcher = new DesktopAppLauncher(desk?.Foreground, desk?.Windows, context.OpenUrl, safe, log);
        var ask = new AskService(desk?.Foreground, desk?.Input, clipboard, probe, context.OpenUrl,
            () => new Ai2SettingsView(ai1?.Settings.Current.OnAir ?? false, settings.Current.WebTargetsOnAir, settings.Current.RestoreClipboard), log, safe,
            terminals: new Win32TerminalProbe(log));
        var dictation = new DictationService(desk?.Input, foregroundProbe, log, safe);

        var services = new Ai2Services
        {
            Settings = settings,
            Health = health,
            Codex = codex,
            Bedrock = bedrock,
            Admin = admin,
            Apps = apps,
            Launcher = launcher,
            Ask = ask,
            Dictation = dictation,
            Time = time,
            Log = log,
            SafeMode = safe,
            AwsCli = aws,
            Clipboard = clipboard,
            OnAir = () => ai1?.Settings.Current.OnAir ?? false,
            OpenUrl = context.OpenUrl,
        };
        context.Services.Add(services);
        _ = new StatusPublisher(services, status);

        // Schedulers: each tick only does what is opted in, demanded and due.
        health.Start(shutdown);
        apps.Start(shutdown);
        var usageTick = time.CreateTimer(_ =>
        {
            Background(() => bedrock.TickAsync(shutdown));
            Background(() => admin.TickAsync(AdminProvider.Anthropic, shutdown));
            Background(() => admin.TickAsync(AdminProvider.OpenAi, shutdown));
        }, null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
        shutdown.Register(() =>
        {
            usageTick.Dispose();
            http.Dispose();
        });

        // Smart Deck: the composite "ai" provider in SD1's registry.
        try
        {
            var registry = VerbRegistry.GetOrCreate(context.Services);
            AiVerbProvider.GetOrRegister(registry, time).Add(new Ai2VerbPart(services));
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            log.Warn("AI verbs could not be registered for the Smart Deck", ex);
        }

        if (safe) log.Info("Safe mode: AI apps are never launched or typed into, Ask AI and dictation do nothing, the AWS CLI and admin APIs never run.");
        log.Info("AI apps + services ready (status pages poll only while shown; Bedrock and admin usage are opt-in)");
        return services;
    }
}

/// <summary>A vault that keeps nothing on disk (contexts without a data folder).</summary>
internal sealed class MemoryVault : ISecretVault
{
    private readonly Dictionary<string, string> _items = new(StringComparer.Ordinal);
    public string? Load(string name) { lock (_items) return _items.TryGetValue(name, out var v) ? v : null; }
    public void Save(string name, string secret) { lock (_items) _items[name] = secret; }
    public void Delete(string name) { lock (_items) _items.Remove(name); }
}
