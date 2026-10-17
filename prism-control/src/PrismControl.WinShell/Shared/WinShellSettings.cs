using PrismControl.Core.Hosting;

namespace PrismControl.WinShell.Shared;

/// <summary>Plugin-wide settings of the windows module (global settings section "windows"). No secrets, no titles.</summary>
public sealed class WinShellGlobalSettings
{
    /// <summary>Streamer-safe: window titles show only the app name; clipboard text previews are hidden (W2).</summary>
    public bool StreamerSafe { get; set; }
    /// <summary>False = keys show app icons only and nothing is captured (Windows.Graphics.Capture stays off).</summary>
    public bool LiveThumbnails { get; set; } = true;
    /// <summary>Idle thumbnail rate per key, clamped to 0.5–2 fps (the budget: ≤ 2 fps per key).</summary>
    public double ThumbnailFps { get; set; } = 2;
}

/// <summary>The live view of the "windows" global section (thread-safe; raises <see cref="Changed"/> on the caller's thread).</summary>
public sealed class WinShellOptions
{
    public const string Section = "windows";
    private volatile WinShellGlobalSettings _current = new();

    public WinShellGlobalSettings Current => _current;
    public bool StreamerSafe => _current.StreamerSafe;
    public bool LiveThumbnails => _current.LiveThumbnails;
    public TimeSpan KeyThumbnailInterval => TimeSpan.FromSeconds(1 / Math.Clamp(_current.ThumbnailFps, 0.5, 2));

    public event Action? Changed;

    public void Apply(WinShellGlobalSettings s)
    {
        var old = _current;
        _current = s;
        if (old.StreamerSafe != s.StreamerSafe || old.LiveThumbnails != s.LiveThumbnails || !old.ThumbnailFps.Equals(s.ThumbnailFps)) Changed?.Invoke();
    }

    /// <summary>Reads the section now and on every change (a PI edit or another module's SetSection).</summary>
    public IDisposable Bind(IGlobalSettings globals)
    {
        Apply(globals.GetSection<WinShellGlobalSettings>(Section));
        EventHandler<GlobalSettingsChangedEventArgs> h = (_, _) => Apply(globals.GetSection<WinShellGlobalSettings>(Section));
        globals.Changed += h;
        return new Unbind(() => globals.Changed -= h);
    }

    /// <summary>The services an action reads options from; a fresh default instance when the module is not loaded (tests).</summary>
    public static WinShellOptions From(IServiceRegistry services) => services.TryGet<WinShellOptions>(out var o) ? o : new WinShellOptions();

    private sealed class Unbind(Action a) : IDisposable { public void Dispose() => a(); }
}
