namespace PrismControl.WinShell.Display;

/// <summary>Shared monitor choices for property inspectors and dial cycling.</summary>
public static class MonitorPicker
{
    public const string All = "all";

    /// <summary>PI options: "Primary monitor" (empty value), then every monitor by model name (+ "All monitors" when allowed).</summary>
    public static IReadOnlyList<object> Options(DisplayService? display, bool includeAll)
    {
        var list = new List<object> { new { value = "", label = "Primary monitor" } };
        if (display is not null)
        {
            foreach (var m in display.Monitors())
                list.Add(new { value = m.Id, label = $"{m.ShortName}{(m.IsPrimary ? " (primary)" : "")} · {m.Bounds.Width}×{m.Bounds.Height}" });
        }
        if (includeAll) list.Add(new { value = All, label = "All monitors (sync)" });
        return list;
    }

    /// <summary>The next monitor id after <paramref name="current"/> (left to right, then "all" if allowed, wrapping).</summary>
    public static string Next(IReadOnlyList<MonitorInfo> monitors, string? current, bool includeAll, DisplayService? display = null)
    {
        var ids = monitors.Select(m => m.Id).ToList();
        if (includeAll && ids.Count > 1) ids.Add(All);
        if (ids.Count == 0) return "";
        var resolved = current == All ? All : (display?.Find(current)?.Id ?? (string.IsNullOrEmpty(current) ? monitors.FirstOrDefault(m => m.IsPrimary)?.Id : current));
        var i = ids.FindIndex(x => string.Equals(x, resolved, StringComparison.OrdinalIgnoreCase));
        return ids[(i + 1 + ids.Count) % ids.Count];
    }
}
