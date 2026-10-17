using PrismControl.Sight.Imaging;

namespace PrismControl.Sight.Recipes;

public enum Anchor { TopLeft, Top, TopRight, Left, Center, Right, BottomLeft, Bottom, BottomRight }

/// <summary>
/// Where the HUD lives in a frame, and how big one HUD unit is. One unit = (HUD box height / referenceHeight) × HUD
/// scale pixels, so a recipe authored at 1080p works at 1440p, at 2160p, on 16:9 and on 21:9 (3440×1440) alike:
/// edge-anchored regions follow their edge, centered ones stay centered, and everything scales with the height.
/// </summary>
public readonly record struct HudGeometry(int FrameWidth, int FrameHeight, double BoxX, double BoxY, double BoxW, double BoxH, double Unit, double HudScale)
{
    /// <summary>The HUD box and unit for a frame of <paramref name="width"/>×<paramref name="height"/> content pixels.</summary>
    public static HudGeometry For(int width, int height, HudDto hud, double? hudScaleOverride = null)
    {
        double bx = 0, by = 0, bw = width, bh = height;
        var aspect = (double)width / Math.Max(1, height);
        if (hud.MaxAspect is { } max && max > 0 && aspect > max)
        {
            bw = height * max;
            bx = (width - bw) / 2;
        }
        else if (hud.MinAspect is { } min && min > 0 && aspect < min)
        {
            bh = width / min;
            by = (height - bh) / 2;
        }
        var scale = Math.Clamp(hudScaleOverride ?? hud.Scale, hud.MinScale, hud.MaxScale);
        var unit = bh / Math.Max(1, hud.ReferenceHeight) * scale;
        return new HudGeometry(width, height, bx, by, bw, bh, unit, scale);
    }

    public (double X, double Y) AnchorPoint(Anchor a) => a switch
    {
        Anchor.TopLeft => (BoxX, BoxY),
        Anchor.Top => (BoxX + BoxW / 2, BoxY),
        Anchor.TopRight => (BoxX + BoxW, BoxY),
        Anchor.Left => (BoxX, BoxY + BoxH / 2),
        Anchor.Center => (BoxX + BoxW / 2, BoxY + BoxH / 2),
        Anchor.Right => (BoxX + BoxW, BoxY + BoxH / 2),
        Anchor.BottomLeft => (BoxX, BoxY + BoxH),
        Anchor.Bottom => (BoxX + BoxW / 2, BoxY + BoxH),
        _ => (BoxX + BoxW, BoxY + BoxH),
    };

    /// <summary>The pixel rectangle of a region (not clamped; callers clamp to the frame).</summary>
    public PixelRect Resolve(Anchor anchor, double x, double y, double w, double h, bool scaleWithHud = true)
    {
        var u = scaleWithHud ? Unit : Unit / Math.Max(1e-6, HudScale);
        var (ax, ay) = AnchorPoint(anchor);
        var x0 = ax + x * u;
        var y0 = ay + y * u;
        var x1 = x0 + w * u;
        var y1 = y0 + h * u;
        var rx = (int)Math.Floor(x0);
        var ry = (int)Math.Floor(y0);
        return new PixelRect(rx, ry, Math.Max(1, (int)Math.Ceiling(x1) - rx), Math.Max(1, (int)Math.Ceiling(y1) - ry));
    }

    /// <summary>The inverse: a pixel rectangle → offsets in HUD units from an anchor (the inspector and calibration use it).</summary>
    public (double X, double Y, double W, double H) ToHudUnits(Anchor anchor, PixelRect r)
    {
        var (ax, ay) = AnchorPoint(anchor);
        return ((r.X - ax) / Unit, (r.Y - ay) / Unit, r.W / Unit, r.H / Unit);
    }

    public static bool TryParseAnchor(string? s, out Anchor a)
    {
        a = Anchor.TopLeft;
        switch (s?.Trim().ToLowerInvariant())
        {
            case "top-left": a = Anchor.TopLeft; return true;
            case "top": a = Anchor.Top; return true;
            case "top-right": a = Anchor.TopRight; return true;
            case "left": a = Anchor.Left; return true;
            case "center": a = Anchor.Center; return true;
            case "right": a = Anchor.Right; return true;
            case "bottom-left": a = Anchor.BottomLeft; return true;
            case "bottom": a = Anchor.Bottom; return true;
            case "bottom-right": a = Anchor.BottomRight; return true;
            default: return false;
        }
    }

    public static string AnchorName(Anchor a) => a switch
    {
        Anchor.TopLeft => "top-left", Anchor.Top => "top", Anchor.TopRight => "top-right", Anchor.Left => "left",
        Anchor.Center => "center", Anchor.Right => "right", Anchor.BottomLeft => "bottom-left", Anchor.Bottom => "bottom",
        _ => "bottom-right",
    };
}
