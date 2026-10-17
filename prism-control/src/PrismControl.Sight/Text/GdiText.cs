using System.Runtime.InteropServices;

namespace PrismControl.Sight.Text;

/// <summary>
/// Renders text with GDI into an in-memory DIB (grayscale anti-aliasing, white on black) and returns its coverage.
/// Used to build the default glyph templates from Windows' own fonts, and by the tests' synthetic HUD frames.
/// Nothing is drawn on screen; no window is involved.
/// </summary>
internal static unsafe partial class GdiText
{
    public sealed record Mask(int Width, int Height, float[] Coverage, int Baseline, int Ascent, int CapTop);

    private static readonly object Gate = new();

    /// <summary>Renders <paramref name="text"/> at <paramref name="emPx"/> (character height, px). Thread-safe (serialized).</summary>
    public static Mask Render(string text, string face, int emPx, int weight = 400, bool italic = false)
    {
        lock (Gate)
        {
            var dc = CreateCompatibleDC(0);
            if (dc == 0) throw new InvalidOperationException("CreateCompatibleDC failed");
            var font = CreateFontW(-emPx, 0, 0, 0, weight, italic ? 1u : 0u, 0, 0, 1 /* DEFAULT_CHARSET */, 0, 0, 4 /* ANTIALIASED_QUALITY */, 0, face);
            var oldFont = SelectObject(dc, font);
            try
            {
                SIZE size;
                fixed (char* p = text) GetTextExtentPoint32W(dc, p, text.Length, &size);
                TEXTMETRICW tm;
                GetTextMetricsW(dc, &tm);
                var pad = Math.Max(2, emPx / 4);
                int w = Math.Max(1, size.cx + 2 * pad + (italic ? emPx / 3 : 0)), h = Math.Max(1, tm.tmHeight + 2 * pad);
                var bmi = stackalloc byte[40];
                new Span<byte>(bmi, 40).Clear();
                *(int*)bmi = 40; *(int*)(bmi + 4) = w; *(int*)(bmi + 8) = -h; *(short*)(bmi + 12) = 1; *(short*)(bmi + 14) = 32;
                var dib = CreateDIBSection(dc, bmi, 0, out var bits, 0, 0);
                if (dib == 0) throw new InvalidOperationException("CreateDIBSection failed");
                var oldBmp = SelectObject(dc, dib);
                try
                {
                    new Span<byte>((void*)bits, w * h * 4).Clear();
                    SetBkMode(dc, 1);
                    SetTextColor(dc, 0x00FFFFFF);
                    fixed (char* p = text) TextOutW(dc, pad, pad, p, text.Length);
                    GdiFlush();
                    var cov = new float[w * h];
                    var src = (byte*)bits;
                    for (var i = 0; i < w * h; i++) cov[i] = Math.Max(src[i * 4], Math.Max(src[i * 4 + 1], src[i * 4 + 2])) / 255f;
                    var capTop = pad + tm.tmAscent - tm.tmAscent * 72 / 100;
                    return new Mask(w, h, cov, pad + tm.tmAscent, tm.tmAscent, capTop);
                }
                finally
                {
                    SelectObject(dc, oldBmp);
                    DeleteObject(dib);
                }
            }
            finally
            {
                SelectObject(dc, oldFont);
                DeleteObject(font);
                DeleteDC(dc);
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)] private struct SIZE { public int cx, cy; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct TEXTMETRICW
    {
        public int tmHeight, tmAscent, tmDescent, tmInternalLeading, tmExternalLeading, tmAveCharWidth, tmMaxCharWidth, tmWeight, tmOverhang,
            tmDigitizedAspectX, tmDigitizedAspectY;
        public char tmFirstChar, tmLastChar, tmDefaultChar, tmBreakChar;
        public byte tmItalic, tmUnderlined, tmStruckOut, tmPitchAndFamily, tmCharSet;
    }

    [LibraryImport("gdi32.dll")] private static partial nint CreateCompatibleDC(nint dc);
    [LibraryImport("gdi32.dll")] private static partial nint CreateDIBSection(nint dc, byte* bmi, uint usage, out nint bits, nint section, uint offset);
    [LibraryImport("gdi32.dll")] private static partial nint SelectObject(nint dc, nint obj);
    [LibraryImport("gdi32.dll", StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint CreateFontW(int h, int w, int esc, int orient, int weight, uint italic, uint underline, uint strike, uint charset, uint outPrec, uint clipPrec, uint quality, uint pitch, string face);
    [LibraryImport("gdi32.dll")] private static partial uint SetTextColor(nint dc, uint color);
    [LibraryImport("gdi32.dll")] private static partial int SetBkMode(nint dc, int mode);
    [LibraryImport("gdi32.dll")] private static partial int TextOutW(nint dc, int x, int y, char* s, int n);
    [LibraryImport("gdi32.dll")] private static partial int GetTextExtentPoint32W(nint dc, char* s, int n, SIZE* size);
    [LibraryImport("gdi32.dll")] private static partial int GetTextMetricsW(nint dc, TEXTMETRICW* tm);
    [LibraryImport("gdi32.dll")] private static partial int DeleteObject(nint obj);
    [LibraryImport("gdi32.dll")] private static partial int DeleteDC(nint dc);
    [LibraryImport("gdi32.dll")] private static partial int GdiFlush();
}
