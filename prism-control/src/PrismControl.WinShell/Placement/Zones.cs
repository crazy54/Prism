using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Placement;

/// <summary>Where a window can be thrown on a monitor's work area.</summary>
public enum ZoneId
{
    Maximize,
    LeftHalf, RightHalf, TopHalf, BottomHalf,
    LeftThird, CenterThird, RightThird, LeftTwoThirds, RightTwoThirds,
    TopLeft, TopRight, BottomLeft, BottomRight,
    Center,
}

/// <summary>Zone geometry (pure math, unit-tested) and names for keys.</summary>
public static class Zones
{
    /// <summary>The zone as fractions of the work area: x, y, width, height in 0..1.</summary>
    public static (double X, double Y, double W, double H) Fraction(ZoneId z) => z switch
    {
        ZoneId.Maximize => (0, 0, 1, 1),
        ZoneId.LeftHalf => (0, 0, 0.5, 1),
        ZoneId.RightHalf => (0.5, 0, 0.5, 1),
        ZoneId.TopHalf => (0, 0, 1, 0.5),
        ZoneId.BottomHalf => (0, 0.5, 1, 0.5),
        ZoneId.LeftThird => (0, 0, 1 / 3.0, 1),
        ZoneId.CenterThird => (1 / 3.0, 0, 1 / 3.0, 1),
        ZoneId.RightThird => (2 / 3.0, 0, 1 / 3.0, 1),
        ZoneId.LeftTwoThirds => (0, 0, 2 / 3.0, 1),
        ZoneId.RightTwoThirds => (1 / 3.0, 0, 2 / 3.0, 1),
        ZoneId.TopLeft => (0, 0, 0.5, 0.5),
        ZoneId.TopRight => (0.5, 0, 0.5, 0.5),
        ZoneId.BottomLeft => (0, 0.5, 0.5, 0.5),
        ZoneId.BottomRight => (0.5, 0.5, 0.5, 0.5),
        ZoneId.Center => (1 / 6.0, 1 / 8.0, 2 / 3.0, 3 / 4.0),
        _ => (0, 0, 1, 1),
    };

    /// <summary>
    /// The zone's visible-frame rectangle inside <paramref name="work"/> (physical pixels). Edges are computed from the
    /// fractions independently and rounded, so adjacent zones share an edge exactly and cover the work area with no gap.
    /// </summary>
    public static PixelRect Rect(ZoneId z, PixelRect work)
    {
        var (fx, fy, fw, fh) = Fraction(z);
        int L(double f) => work.Left + (int)Math.Round(work.Width * f);
        int T(double f) => work.Top + (int)Math.Round(work.Height * f);
        return new PixelRect(L(fx), T(fy), L(fx + fw), T(fy + fh));
    }

    public static string Name(ZoneId z) => z switch
    {
        ZoneId.Maximize => "Maximize",
        ZoneId.LeftHalf => "Left half",
        ZoneId.RightHalf => "Right half",
        ZoneId.TopHalf => "Top half",
        ZoneId.BottomHalf => "Bottom half",
        ZoneId.LeftThird => "Left third",
        ZoneId.CenterThird => "Center third",
        ZoneId.RightThird => "Right third",
        ZoneId.LeftTwoThirds => "Left ⅔",
        ZoneId.RightTwoThirds => "Right ⅔",
        ZoneId.TopLeft => "Top left",
        ZoneId.TopRight => "Top right",
        ZoneId.BottomLeft => "Bottom left",
        ZoneId.BottomRight => "Bottom right",
        ZoneId.Center => "Center",
        _ => z.ToString(),
    };

    /// <summary>Settings value (kebab-case) of a zone.</summary>
    public static string Key(ZoneId z) => z switch
    {
        ZoneId.LeftHalf => "left-half",
        ZoneId.RightHalf => "right-half",
        ZoneId.TopHalf => "top-half",
        ZoneId.BottomHalf => "bottom-half",
        ZoneId.LeftThird => "left-third",
        ZoneId.CenterThird => "center-third",
        ZoneId.RightThird => "right-third",
        ZoneId.LeftTwoThirds => "left-two-thirds",
        ZoneId.RightTwoThirds => "right-two-thirds",
        ZoneId.TopLeft => "top-left",
        ZoneId.TopRight => "top-right",
        ZoneId.BottomLeft => "bottom-left",
        ZoneId.BottomRight => "bottom-right",
        ZoneId.Center => "center",
        _ => "maximize",
    };

    public static ZoneId Parse(string? key) =>
        All.FirstOrDefault(z => string.Equals(Key(z), key?.Trim(), StringComparison.OrdinalIgnoreCase), ZoneId.LeftHalf);

    public static IReadOnlyList<ZoneId> All { get; } = Enum.GetValues<ZoneId>();

    /// <summary>The zones a placer dial cycles through on each monitor ("halves", "thirds", "quadrants" or "all").</summary>
    public static IReadOnlyList<ZoneId> Set(string? name) => name?.Trim().ToLowerInvariant() switch
    {
        "thirds" => [ZoneId.Maximize, ZoneId.LeftThird, ZoneId.CenterThird, ZoneId.RightThird, ZoneId.LeftTwoThirds, ZoneId.RightTwoThirds],
        "quadrants" => [ZoneId.Maximize, ZoneId.TopLeft, ZoneId.TopRight, ZoneId.BottomLeft, ZoneId.BottomRight],
        "all" => [ZoneId.Maximize, ZoneId.LeftHalf, ZoneId.RightHalf, ZoneId.LeftThird, ZoneId.CenterThird, ZoneId.RightThird,
            ZoneId.LeftTwoThirds, ZoneId.RightTwoThirds, ZoneId.TopLeft, ZoneId.TopRight, ZoneId.BottomLeft, ZoneId.BottomRight, ZoneId.Center],
        _ => [ZoneId.Maximize, ZoneId.LeftHalf, ZoneId.RightHalf, ZoneId.Center],
    };
}

/// <summary>Frame compensation and cross-monitor moves (pure, unit-tested).</summary>
public static class PlacementMath
{
    /// <summary>
    /// SetWindowPos takes the window rect, which includes the invisible resize borders (7/0/7/7 px on Win32/Electron windows
    /// here, 0 on some apps). Expand the wanted visible frame by the borders measured from GetWindowRect vs DWM's frame.
    /// </summary>
    public static PixelRect WindowRectForFrame(PixelRect wantedFrame, PixelRect windowRect, PixelRect frame)
    {
        int bl = Math.Max(0, frame.Left - windowRect.Left), bt = Math.Max(0, frame.Top - windowRect.Top);
        int br = Math.Max(0, windowRect.Right - frame.Right), bb = Math.Max(0, windowRect.Bottom - frame.Bottom);
        // Borders larger than a resize frame mean the two rects disagree (mid-animation): ignore them.
        if (bl > 32 || bt > 32 || br > 32 || bb > 32) bl = bt = br = bb = 0;
        return new PixelRect(wantedFrame.Left - bl, wantedFrame.Top - bt, wantedFrame.Right + br, wantedFrame.Bottom + bb);
    }

    /// <summary>Moves a frame to another work area keeping its relative position and size (clamped to fit).</summary>
    public static PixelRect MapToWorkArea(PixelRect frame, PixelRect from, PixelRect to)
    {
        if (from.IsEmpty || to.IsEmpty) return frame;
        double sx = (double)to.Width / from.Width, sy = (double)to.Height / from.Height;
        var w = Math.Min(to.Width, (int)Math.Round(frame.Width * sx));
        var h = Math.Min(to.Height, (int)Math.Round(frame.Height * sy));
        var x = to.Left + (int)Math.Round((frame.Left - from.Left) * sx);
        var y = to.Top + (int)Math.Round((frame.Top - from.Top) * sy);
        x = Math.Clamp(x, to.Left, to.Right - w);
        y = Math.Clamp(y, to.Top, to.Bottom - h);
        return PixelRect.FromSize(x, y, w, h);
    }

    /// <summary>The monitor whose rectangle holds most of <paramref name="frame"/> (index into <paramref name="monitors"/>; -1 if none).</summary>
    public static int MonitorIndexOf(PixelRect frame, IReadOnlyList<PixelRect> monitors)
    {
        var best = -1;
        long bestArea = 0;
        for (var i = 0; i < monitors.Count; i++)
        {
            var a = frame.Intersect(monitors[i]).Area;
            if (a > bestArea) { bestArea = a; best = i; }
        }
        if (best >= 0) return best;
        // Off-screen: the nearest by center distance.
        var cx = frame.CenterX; var cy = frame.CenterY;
        double bestD = double.MaxValue;
        for (var i = 0; i < monitors.Count; i++)
        {
            var dx = Math.Max(0, Math.Max(monitors[i].Left - cx, cx - monitors[i].Right));
            var dy = Math.Max(0, Math.Max(monitors[i].Top - cy, cy - monitors[i].Bottom));
            var d = (double)dx * dx + (double)dy * dy;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    /// <summary>Within <paramref name="tolerance"/> px on every edge.</summary>
    public static bool Near(PixelRect a, PixelRect b, int tolerance = 8) =>
        Math.Abs(a.Left - b.Left) <= tolerance && Math.Abs(a.Top - b.Top) <= tolerance &&
        Math.Abs(a.Right - b.Right) <= tolerance && Math.Abs(a.Bottom - b.Bottom) <= tolerance;
}
