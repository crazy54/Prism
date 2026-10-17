using System.Text;

namespace PrismControl.Core.Render;

/// <summary>
/// Builds SVG path data with absolute commands. Merge many shapes into one path to keep the
/// element count low (render cost scales with element count, not bytes).
/// </summary>
public sealed class PathBuilder
{
    private readonly StringBuilder _d = new();

    public bool IsEmpty => _d.Length == 0;

    public PathBuilder MoveTo(double x, double y) => Cmd('M', x, y);
    public PathBuilder LineTo(double x, double y) => Cmd('L', x, y);
    public PathBuilder HorizontalTo(double x) => Cmd('H', x);
    public PathBuilder VerticalTo(double y) => Cmd('V', y);
    public PathBuilder CubicTo(double c1x, double c1y, double c2x, double c2y, double x, double y) => Cmd('C', c1x, c1y, c2x, c2y, x, y);
    public PathBuilder QuadTo(double cx, double cy, double x, double y) => Cmd('Q', cx, cy, x, y);

    public PathBuilder ArcTo(double rx, double ry, double rotation, bool largeArc, bool sweep, double x, double y)
    {
        Sep();
        _d.Append('A').Append(SvgFormat.N(rx)).Append(' ').Append(SvgFormat.N(ry)).Append(' ')
          .Append(SvgFormat.N(rotation)).Append(' ').Append(largeArc ? '1' : '0').Append(' ').Append(sweep ? '1' : '0').Append(' ')
          .Append(SvgFormat.N(x)).Append(' ').Append(SvgFormat.N(y));
        return this;
    }

    public PathBuilder Close()
    {
        _d.Append('Z');
        return this;
    }

    /// <summary>Appends raw, already-absolute path data.</summary>
    public PathBuilder Append(string d)
    {
        Sep();
        _d.Append(d);
        return this;
    }

    public PathBuilder Rect(double x, double y, double w, double h) =>
        MoveTo(x, y).HorizontalTo(x + w).VerticalTo(y + h).HorizontalTo(x).Close();

    public PathBuilder RoundedRect(double x, double y, double w, double h, double r)
    {
        r = Math.Max(0, Math.Min(r, Math.Min(w, h) / 2));
        if (r == 0) return Rect(x, y, w, h);
        return MoveTo(x + r, y).HorizontalTo(x + w - r).ArcTo(r, r, 0, false, true, x + w, y + r)
            .VerticalTo(y + h - r).ArcTo(r, r, 0, false, true, x + w - r, y + h)
            .HorizontalTo(x + r).ArcTo(r, r, 0, false, true, x, y + h - r)
            .VerticalTo(y + r).ArcTo(r, r, 0, false, true, x + r, y).Close();
    }

    public PathBuilder Circle(double cx, double cy, double r) =>
        MoveTo(cx - r, cy).ArcTo(r, r, 0, true, true, cx + r, cy).ArcTo(r, r, 0, true, true, cx - r, cy).Close();

    /// <summary>
    /// A circular arc from <paramref name="startDeg"/> to <paramref name="endDeg"/> (0° = 3 o'clock, increasing clockwise on screen).
    /// Use it with a round-capped stroke for gauges and rings.
    /// </summary>
    public PathBuilder Arc(double cx, double cy, double r, double startDeg, double endDeg, bool moveToStart = true)
    {
        var sweepDeg = endDeg - startDeg;
        if (Math.Abs(sweepDeg) >= 360)
        {
            // A full circle cannot be one arc command; split in two.
            var mid = startDeg + Math.Sign(sweepDeg) * 180;
            Arc(cx, cy, r, startDeg, mid, moveToStart);
            return Arc(cx, cy, r, mid, startDeg + Math.Sign(sweepDeg) * 359.99, false);
        }
        var (sx, sy) = Polar(cx, cy, r, startDeg);
        var (ex, ey) = Polar(cx, cy, r, endDeg);
        if (moveToStart) MoveTo(sx, sy); else LineTo(sx, sy);
        return ArcTo(r, r, 0, Math.Abs(sweepDeg) > 180, sweepDeg > 0, ex, ey);
    }

    public PathBuilder Polyline(IEnumerable<(double X, double Y)> points, bool close = false)
    {
        var first = true;
        foreach (var (x, y) in points)
        {
            if (first) { MoveTo(x, y); first = false; }
            else LineTo(x, y);
        }
        if (close && !first) Close();
        return this;
    }

    public static (double X, double Y) Polar(double cx, double cy, double r, double deg)
    {
        var a = deg * Math.PI / 180;
        return (cx + r * Math.Cos(a), cy + r * Math.Sin(a));
    }

    private PathBuilder Cmd(char c, params double[] args)
    {
        Sep();
        _d.Append(c);
        for (var i = 0; i < args.Length; i++)
        {
            if (i > 0) _d.Append(' ');
            _d.Append(SvgFormat.N(args[i]));
        }
        return this;
    }

    private void Sep()
    {
        // Commands are self-delimiting; no separator needed.
    }

    public override string ToString() => _d.ToString();
}
