using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

/// <summary>
/// The thumbnail budget (spec principle 8): keys at ≤ 2 fps idle (the "windows.thumbnailFps" setting, 0.5–2), the ONE
/// focused widget at ≤ 10 fps, everything calmer while a game runs (keys 0.25 fps, widget 1 fps), and nothing at all when
/// "liveThumbnails" is off. Frames still go through the update scheduler, whose Background tier caps keys at 2 Hz anyway.
/// </summary>
public sealed class ThumbnailService : IDisposable
{
    /// <summary>Key thumbnails: 136×88 px fits the 132×86-unit well of a 144-unit key at full resolution.</summary>
    public const int KeyWidth = 136, KeyHeight = 88;
    /// <summary>The browser widget: a 124×88-unit well on the 200×100 canvas shown at 360×180 on the Galleon (1.8×).</summary>
    public const int WidgetWidth = 224, WidgetHeight = 160;

    public static readonly TimeSpan FocusedInterval = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan WidgetIdleInterval = TimeSpan.FromMilliseconds(500);
    public static readonly TimeSpan GamingKeyInterval = TimeSpan.FromSeconds(4);
    public static readonly TimeSpan GamingWidgetInterval = TimeSpan.FromSeconds(1);

    private readonly IThumbnailSource _source;
    private readonly WinShellOptions _options;
    private readonly GameModeService? _game;
    private readonly object _gate = new();
    private readonly List<Handle> _handles = [];
    private Handle? _focused;

    public ThumbnailService(IThumbnailSource source, WinShellOptions options, GameModeService? game)
    {
        _source = source;
        _options = options;
        _game = game;
        _options.Changed += Reapply;
        if (_game is not null) _game.Changed += Reapply;
    }

    public IThumbnailSource Source => _source;
    public ThumbnailStats Stats => _source.Stats;
    public bool Enabled => _options.LiveThumbnails;

    /// <summary>A key thumbnail lease for <paramref name="hwnd"/>.</summary>
    public IThumbnailLease ForKey(nint hwnd) => Create(hwnd, widget: false);

    /// <summary>A widget lease (the browser). Call <see cref="Focus"/> while the user interacts with it.</summary>
    public IThumbnailLease ForWidget(nint hwnd) => Create(hwnd, widget: true);

    /// <summary>Makes <paramref name="lease"/> the one focused widget (≤ 10 fps); every other widget drops to its idle rate.</summary>
    public void Focus(IThumbnailLease? lease)
    {
        lock (_gate) _focused = lease as Handle;
        Reapply();
    }

    public bool IsFocused(IThumbnailLease lease)
    {
        lock (_gate) return ReferenceEquals(_focused, lease);
    }

    private IThumbnailLease Create(nint hwnd, bool widget)
    {
        if (!_options.LiveThumbnails || hwnd == 0) return new OffLease(hwnd, new ThumbnailRequest(0, 0, TimeSpan.Zero));
        var h = new Handle(this, hwnd, widget);
        lock (_gate) _handles.Add(h);
        // Calm down during games even when no Game Mode key is placed: the 2 s poll is one shell call.
        _game?.Start();
        h.Inner = _source.Subscribe(hwnd, RequestFor(h));
        return h;
    }

    internal ThumbnailRequest RequestFor(Handle h)
    {
        var gaming = _game?.Current().IsGaming == true;
        if (!h.Widget) return new ThumbnailRequest(KeyWidth, KeyHeight, gaming ? GamingKeyInterval : _options.KeyThumbnailInterval);
        bool focused;
        lock (_gate) focused = ReferenceEquals(_focused, h);
        var interval = gaming ? GamingWidgetInterval : focused ? FocusedInterval : WidgetIdleInterval;
        return new ThumbnailRequest(WidgetWidth, WidgetHeight, interval);
    }

    private void Reapply()
    {
        Handle[] all;
        lock (_gate) all = [.. _handles];
        foreach (var h in all) if (h.Inner is { } i) i.Request = RequestFor(h);
    }

    internal void Release(Handle h)
    {
        lock (_gate)
        {
            _handles.Remove(h);
            if (ReferenceEquals(_focused, h)) _focused = null;
        }
    }

    public void Dispose()
    {
        _options.Changed -= Reapply;
        if (_game is not null) _game.Changed -= Reapply;
        _source.Dispose();
    }

    /// <summary>A policy-managed lease (forwards to the source's lease).</summary>
    internal sealed class Handle(ThumbnailService owner, nint hwnd, bool widget) : IThumbnailLease
    {
        public IThumbnailLease? Inner;
        public bool Widget { get; } = widget;
        public nint Hwnd { get; } = hwnd;
        public ThumbnailFrame? Latest => Inner?.Latest;
        public CaptureState State => Inner?.State ?? CaptureState.Starting;

        public ThumbnailRequest Request
        {
            get => Inner?.Request ?? owner.RequestFor(this);
            set { if (Inner is not null) Inner.Request = value; }
        }

        public event Action? Updated
        {
            add { if (Inner is not null) Inner.Updated += value; }
            remove { if (Inner is not null) Inner.Updated -= value; }
        }

        public void Dispose()
        {
            owner.Release(this);
            Inner?.Dispose();
            Inner = null;
        }
    }
}
