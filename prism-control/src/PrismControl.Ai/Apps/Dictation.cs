using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Ai.Apps;

public enum DictateMode
{
    /// <summary>VS Code in front → hold Ctrl+I (push-to-talk in its chat); anything else → Win+H (Windows voice typing, a toggle).</summary>
    Auto,
    /// <summary>Always Win+H.</summary>
    Windows,
    /// <summary>Only into VS Code (Ctrl+I); refused when VS Code isn't in front (Ctrl+I means italic or other things elsewhere).</summary>
    VsCode,
}

public enum DictateResult { Toggled, Holding, Released, Nothing, NotVsCode, Elevated, SafeMode, Failed }

/// <summary>
/// The dictation key (ai-apps.md §2.1 #6). Win+H is universal (Windows voice typing toggles on and off). VS Code's chat has true
/// hold-to-talk on Ctrl+I: key down holds Ctrl+I, key up releases it (Desktop's sender releases any held key after 10 s at most).
/// Claude Code's own voice mode is unavailable on Bedrock, and Claude Desktop has no voice hotkey on Windows, so they are not targets.
/// Safe mode: no input at all. Elevated foreground windows are refused (UIPI would drop the keys silently).
/// </summary>
public sealed class DictationService(IInputSender? input, IForegroundProbe foreground, ILog log, bool safeMode)
{
    private static readonly VirtualKey[] VsCodeTalk = [VirtualKey.Control, VirtualKey.I];
    private static readonly VirtualKey[] WinH = [VirtualKey.LeftWindows, VirtualKey.H];
    private int _holding;

    public bool VsCodeInFront() => string.Equals(foreground.Foreground().Exe, "Code.exe", StringComparison.OrdinalIgnoreCase);

    /// <summary>What a press would do now ("WIN+H" or "HOLD CTRL+I"), for the face.</summary>
    public string Hint(DictateMode mode) => mode switch
    {
        DictateMode.Windows => "WIN+H",
        DictateMode.VsCode => "HOLD CTRL+I",
        _ => VsCodeInFront() ? "HOLD CTRL+I" : "WIN+H",
    };

    public bool Holding => Volatile.Read(ref _holding) == 1;

    /// <summary>Key down: start holding Ctrl+I (VS Code) or toggle Win+H.</summary>
    public async Task<DictateResult> KeyDownAsync(DictateMode mode, CancellationToken ct)
    {
        if (Guard() is { } blocked) return blocked;
        var vs = VsCodeInFront();
        if (mode == DictateMode.VsCode && !vs) return DictateResult.NotVsCode;
        if (mode != DictateMode.Windows && vs)
        {
            if (Interlocked.Exchange(ref _holding, 1) == 1) return DictateResult.Holding;
            if (await input!.SendKeysDownAsync(VsCodeTalk, KeyMode.VirtualKey, ct).ConfigureAwait(false)) return DictateResult.Holding;
            Volatile.Write(ref _holding, 0);
            return DictateResult.Failed;
        }
        return await input!.SendChordAsync(WinH, ct).ConfigureAwait(false) ? DictateResult.Toggled : DictateResult.Failed;
    }

    /// <summary>Key up: release Ctrl+I if we hold it (a Win+H toggle needs nothing).</summary>
    public async Task<DictateResult> KeyUpAsync(CancellationToken ct)
    {
        if (Interlocked.Exchange(ref _holding, 0) == 0 || input is null || safeMode) return DictateResult.Nothing;
        return await input.SendKeysUpAsync(VsCodeTalk, ct).ConfigureAwait(false) ? DictateResult.Released : DictateResult.Failed;
    }

    /// <summary>A dial push (no hold on a dial: the Galleon's 4 s hold switches layers): VS Code → a Ctrl+I tap (toggles dictation), else Win+H.</summary>
    public async Task<DictateResult> ToggleAsync(DictateMode mode, CancellationToken ct)
    {
        if (Guard() is { } blocked) return blocked;
        var vs = VsCodeInFront();
        if (mode == DictateMode.VsCode && !vs) return DictateResult.NotVsCode;
        var keys = mode != DictateMode.Windows && vs ? VsCodeTalk : WinH;
        return await input!.SendChordAsync(keys, ct).ConfigureAwait(false) ? DictateResult.Toggled : DictateResult.Failed;
    }

    private DictateResult? Guard()
    {
        if (safeMode)
        {
            log.Info("[safe mode] would start dictation");
            return DictateResult.SafeMode;
        }
        if (input is null) return DictateResult.Failed;
        if (input.TargetIsElevated(0)) return DictateResult.Elevated;
        return null;
    }
}
