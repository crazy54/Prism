using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Platform;

/// <summary>
/// The tab-title match rule (pure, tested): a tab matches when its name equals the session title, ignoring case, surrounding
/// spaces and one leading status glyph (Claude Code prefixes a spinner or sparkle). Exactly one match is required;
/// duplicates are ambiguous and nothing is selected.
/// </summary>
public static class TabTitleMatcher
{
    public const int NoMatch = -1, Ambiguous = -2;

    public static int Pick(IReadOnlyList<string?> tabNames, string title)
    {
        var want = Normalize(title);
        if (want.Length == 0) return NoMatch;
        var hit = NoMatch;
        for (var i = 0; i < tabNames.Count; i++)
        {
            if (Normalize(tabNames[i]) != want) continue;
            if (hit != NoMatch) return Ambiguous;
            hit = i;
        }
        return hit;
    }

    internal static string Normalize(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var t = s.Trim();
        // One leading non-letter/digit glyph (✳, ⠂, •, ◆, ●, ★ …) followed by a space.
        if (t.Length > 2 && !char.IsLetterOrDigit(t, 0))
        {
            var cut = char.IsSurrogatePair(t, 0) ? 2 : 1;
            if (t.Length > cut && t[cut] == ' ') t = t[(cut + 1)..].TrimStart();
        }
        return t.ToLowerInvariant();
    }
}

/// <summary>
/// Best effort, labeled (research/ai-status.md §1.7, R20): Windows Terminal has no supported "focus this tab" API
/// (microsoft/terminal #19783 closed "not planned"). Each WT tab is a UIA TabItem named with its title that implements
/// SelectionItemPattern; we select the single tab whose title matches. Runs on its own MTA thread with a 1.5 s cap (UIA can
/// stall on a busy window); elevated terminals are unreachable from medium IL and fail quietly. Lab test L10 (needs the
/// user's OK) confirms it on hardware; until then the key says "FIND THE TAB" whenever this does not report Selected.
/// </summary>
public sealed class UiaTabSelector(ILog log, bool safeMode) : ITerminalTabSelector
{
    private const int TreeScopeDescendants = 4;
    private const int TabItemControlType = 50019;
    private const int SelectionItemPattern = 10010;

    public Task<TabSelectResult> TrySelectAsync(nint terminalWindow, string title, CancellationToken ct)
    {
        if (safeMode) return Task.FromResult(TabSelectResult.SafeMode);
        if (terminalWindow == 0 || string.IsNullOrWhiteSpace(title)) return Task.FromResult(TabSelectResult.NoMatch);
        var tcs = new TaskCompletionSource<TabSelectResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try { tcs.TrySetResult(Select(terminalWindow, title)); }
            catch (Exception ex)
            {
                log.Debug($"tab select failed: {ex.GetType().Name}");
                tcs.TrySetResult(TabSelectResult.Failed);
            }
        }) { IsBackground = true, Name = "ai-uia-tab" };
        thread.SetApartmentState(ApartmentState.MTA);
        thread.Start();
        return WithTimeout(tcs.Task, TimeSpan.FromMilliseconds(1500), ct);
    }

    private static async Task<TabSelectResult> WithTimeout(Task<TabSelectResult> t, TimeSpan timeout, CancellationToken ct)
    {
        var done = await Task.WhenAny(t, Task.Delay(timeout, ct)).ConfigureAwait(false);
        return done == t ? await t.ConfigureAwait(false) : TabSelectResult.Failed;
    }

    private static TabSelectResult Select(nint hwnd, string title)
    {
        var uia = (IUIAutomation)new CUIAutomation();
        IUIAutomationElement? root = null;
        IUIAutomationCondition? all = null;
        IUIAutomationElementArray? found = null;
        var tabs = new List<IUIAutomationElement>();
        try
        {
            if (uia.ElementFromHandle(hwnd, out root) != 0 || root is null) return TabSelectResult.Unsupported;
            if (uia.CreateTrueCondition(out all) != 0 || all is null) return TabSelectResult.Failed;
            if (root.FindAll(TreeScopeDescendants, all, out found) != 0 || found is null) return TabSelectResult.Failed;
            found.get_Length(out var n);
            var names = new List<string?>();
            for (var i = 0; i < Math.Min(n, 4000); i++)
            {
                if (found.GetElement(i, out var el) != 0 || el is null) continue;
                if (el.get_CurrentControlType(out var type) == 0 && type == TabItemControlType)
                {
                    el.get_CurrentName(out var name);
                    names.Add(name);
                    tabs.Add(el);
                }
                else Marshal.ReleaseComObject(el);
            }
            var pick = TabTitleMatcher.Pick(names, title);
            if (pick == TabTitleMatcher.Ambiguous) return TabSelectResult.Ambiguous;
            if (pick < 0) return TabSelectResult.NoMatch;
            if (tabs[pick].GetCurrentPattern(SelectionItemPattern, out var patternObj) != 0 || patternObj is not IUIAutomationSelectionItemPattern pattern)
                return TabSelectResult.Unsupported;
            try
            {
                if (pattern.get_CurrentIsSelected(out var selected) == 0 && selected != 0) return TabSelectResult.AlreadySelected;
                return pattern.Select() == 0 ? TabSelectResult.Selected : TabSelectResult.Failed;
            }
            finally { Marshal.ReleaseComObject(pattern); }
        }
        finally
        {
            foreach (var t in tabs) Marshal.ReleaseComObject(t);
            if (found is not null) Marshal.ReleaseComObject(found);
            if (all is not null) Marshal.ReleaseComObject(all);
            if (root is not null) Marshal.ReleaseComObject(root);
            Marshal.ReleaseComObject(uia);
        }
    }

    // ---- minimal UIAutomationClient interop (vtable order from UIAutomationClient.h; unused slots are placeholders)

    [ComImport, Guid("ff48dba4-60ef-4201-aa87-54103eef594e")]
    private class CUIAutomation;

    [ComImport, Guid("30cbe57d-d9d0-452a-ab13-7ac5ac4825ee"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomation
    {
        void CompareElements();
        void CompareRuntimeIds();
        void GetRootElement();
        [PreserveSig] int ElementFromHandle(nint hwnd, out IUIAutomationElement element);
        void ElementFromPoint();
        void GetFocusedElement();
        void GetRootElementBuildCache();
        void ElementFromHandleBuildCache();
        void ElementFromPointBuildCache();
        void GetFocusedElementBuildCache();
        void CreateTreeWalker();
        void get_ControlViewWalker();
        void get_ContentViewWalker();
        void get_RawViewWalker();
        void get_RawViewCondition();
        void get_ControlViewCondition();
        void get_ContentViewCondition();
        void CreateCacheRequest();
        [PreserveSig] int CreateTrueCondition(out IUIAutomationCondition condition);
    }

    [ComImport, Guid("352ffba8-0973-437c-a61f-f64cafd81df9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomationCondition;

    [ComImport, Guid("d22108aa-8ac5-49a5-837b-37bbb3d7591e"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomationElement
    {
        void SetFocus();
        void GetRuntimeId();
        void FindFirst();
        [PreserveSig] int FindAll(int scope, IUIAutomationCondition condition, out IUIAutomationElementArray found);
        void FindFirstBuildCache();
        void FindAllBuildCache();
        void BuildUpdatedCache();
        void GetCurrentPropertyValue();
        void GetCurrentPropertyValueEx();
        void GetCachedPropertyValue();
        void GetCachedPropertyValueEx();
        void GetCurrentPatternAs();
        void GetCachedPatternAs();
        [PreserveSig] int GetCurrentPattern(int patternId, [MarshalAs(UnmanagedType.IUnknown)] out object? pattern);
        void GetCachedPattern();
        void GetCachedParent();
        void GetCachedChildren();
        void get_CurrentProcessId();
        [PreserveSig] int get_CurrentControlType(out int type);
        void get_CurrentLocalizedControlType();
        [PreserveSig] int get_CurrentName([MarshalAs(UnmanagedType.BStr)] out string? name);
    }

    [ComImport, Guid("14314595-b4bc-4055-95f2-58f2e42c9855"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomationElementArray
    {
        [PreserveSig] int get_Length(out int length);
        [PreserveSig] int GetElement(int index, out IUIAutomationElement element);
    }

    [ComImport, Guid("a8efa66a-0fda-421a-9194-38021f3578ea"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomationSelectionItemPattern
    {
        [PreserveSig] int Select();
        void AddToSelection();
        void RemoveFromSelection();
        [PreserveSig] int get_CurrentIsSelected(out int selected);
    }
}
