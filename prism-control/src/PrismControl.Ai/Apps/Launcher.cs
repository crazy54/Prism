using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Ai.Apps;

public enum LaunchResult { Focused, AlreadyFocused, Launched, OpenedNewChat, NotInstalled, Elevated, Refused, SafeMode, Failed }

/// <summary>Focus-or-launch for app keys. The only writer of the Apps layer besides Ask AI and dictation.</summary>
public interface IAppLauncher
{
    Task<LaunchResult> FocusOrLaunchAsync(AppView app, CancellationToken ct);
    /// <summary>The app's documented "new chat" deep link (falls back to focus-or-launch when it has none).</summary>
    Task<LaunchResult> NewChatAsync(AppView app, CancellationToken ct);
}

/// <summary>
/// A running app's window is brought to the front with Desktop's <see cref="IForegroundService"/> (the F22 trick ladder); otherwise
/// the app is started with <c>explorer.exe shell:AppsFolder\&lt;AUMID&gt;</c> (packaged apps) or its per-user exe, through Core's
/// <see cref="ProcessLauncher"/> (which also starts nothing in safe mode). Deep links go through the Stream Deck app's openUrl.
/// Safe mode: nothing is focused, started or opened (a log line instead).
/// </summary>
public sealed class DesktopAppLauncher(IForegroundService? foreground, IWindowCatalog? windows, Action<string> openUrl, bool safeMode, ILog log,
    Func<string, string?, bool>? start = null) : IAppLauncher
{
    private readonly Func<string, string?, bool> _start = start ?? ((target, args) => ProcessLauncher.Start(target, args) is not null);

    public async Task<LaunchResult> FocusOrLaunchAsync(AppView app, CancellationToken ct)
    {
        if (safeMode)
        {
            log.Info($"[safe mode] would focus or launch {app.Def.Id}");
            return LaunchResult.SafeMode;
        }
        if (app.IsRunning && foreground is not null && windows is not null)
        {
            var win = windows.AltTabWindows().FirstOrDefault(w => !w.IsCloaked && (app.Pids.Contains(w.Pid) || app.Def.MatchesImage(w.ProcessName, w.ExePath)));
            if (win is not null)
            {
                var r = await foreground.BringToFrontAsync(win.Hwnd, ct).ConfigureAwait(false);
                return r switch
                {
                    ForegroundResult.Focused or ForegroundResult.Restored => LaunchResult.Focused,
                    ForegroundResult.AlreadyFocused => LaunchResult.AlreadyFocused,
                    ForegroundResult.Elevated => LaunchResult.Elevated,
                    ForegroundResult.SafeMode => LaunchResult.SafeMode,
                    _ => LaunchResult.Refused,
                };
            }
            // Running with no window (tray apps such as Copilot): activating the app brings its window back.
        }
        return Launch(app);
    }

    public async Task<LaunchResult> NewChatAsync(AppView app, CancellationToken ct)
    {
        if (safeMode)
        {
            log.Info($"[safe mode] would open a new {app.Def.Id} chat");
            return LaunchResult.SafeMode;
        }
        if (app.Def.NewChatUri is not { } uri || !app.Installed) return await FocusOrLaunchAsync(app, ct).ConfigureAwait(false);
        openUrl(uri);
        return LaunchResult.OpenedNewChat;
    }

    private LaunchResult Launch(AppView app)
    {
        if (!app.Installed) return LaunchResult.NotInstalled;
        try
        {
            if (app.Def.Aumid is { } aumid && _start("explorer.exe", @"shell:AppsFolder\" + aumid)) return LaunchResult.Launched;
            if (app.Def.ExpandedExePath is { } exe && File.Exists(exe) && _start(exe, null)) return LaunchResult.Launched;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            log.Info($"could not launch {app.Def.Id}: {ex.GetType().Name}");
        }
        return LaunchResult.Failed;
    }
}
