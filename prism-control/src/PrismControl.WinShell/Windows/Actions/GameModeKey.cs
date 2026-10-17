using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

/// <summary>
/// Feature 13: game-mode detection. Lit while a game runs: Direct3D exclusive fullscreen (SHQueryUserNotificationState 3),
/// Windows Game Mode (EFFECTIVE_POWER_MODE 5) or a borderless app covering its monitor. While it is lit, live window keys
/// calm down (0.25 fps). Press opens Windows' Game Mode settings.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.game-mode",
    Name = "Game Mode",
    Controllers = Controllers.Keypad,
    Tooltip = "Lights up while a game runs. Press to open Game Mode settings.",
    Icon = "imgs/actions/windows/game-mode/icon",
    KeyImage = "imgs/actions/windows/game-mode/key")]
public sealed class GameModeKey : KeyAction
{
    private GameModeService? _game;
    private Action? _onChanged;

    internal bool LastOn { get; private set; }

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _game = Services.Find<GameModeService>();
        _game?.Start();
        _onChanged = () => Post(Render);
        if (_game is not null) _game.Changed += _onChanged;
        StartRenderLoop(Render, GameModeService.Poll);
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_game is not null && _onChanged is not null) _game.Changed -= _onChanged;
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        OpenUrl("ms-settings:gaming-gamemode");
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var s = _game?.Current() ?? GameState.Idle;
        LastOn = s.IsGaming;
        SetImage(PagerArt.GameKey(Theme, s));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Game mode")
        .Info("Detects", "Exclusive-fullscreen games, Windows Game Mode, and borderless apps covering a monitor. Live window keys slow down while it is lit.");
}
