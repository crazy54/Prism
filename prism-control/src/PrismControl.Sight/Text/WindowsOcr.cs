using PrismControl.Sight.Imaging;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Security.Cryptography;

namespace PrismControl.Sight.Text;

/// <summary>Recognizes one prepared line of text (dark ink on a light background).</summary>
public interface ITextRecognizer
{
    string Name { get; }
    bool IsAvailable { get; }
    /// <summary>The recognized text (lines joined by spaces), "" when nothing was found, null when the engine failed.</summary>
    ValueTask<string?> RecognizeAsync(GrayImage darkOnLight, CancellationToken ct = default);
}

/// <summary>
/// Windows.Media.Ocr (built into Windows; works unpackaged: verified on this PC, en-US, ~14 ms per small line).
/// One engine per process, calls serialized. It is weak on 1–3 character tokens and reads "°" as "0", which is why
/// the OCR detector removes trailing superscripts first and cross-checks with the glyph reader.
/// </summary>
public sealed class WindowsOcrRecognizer : ITextRecognizer, IDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Lazy<OcrEngine?> _engine;

    public WindowsOcrRecognizer(string languageTag = "en-US")
    {
        _engine = new Lazy<OcrEngine?>(() =>
        {
            try
            {
                var lang = new Language(languageTag);
                return OcrEngine.IsLanguageSupported(lang) ? OcrEngine.TryCreateFromLanguage(lang) : OcrEngine.TryCreateFromUserProfileLanguages();
            }
            catch (Exception) { return null; }
        });
    }

    public string Name => "windows";

    public bool IsAvailable => _engine.Value is not null;

    public string? Language => _engine.Value?.RecognizerLanguage?.LanguageTag;

    public async ValueTask<string?> RecognizeAsync(GrayImage img, CancellationToken ct = default)
    {
        var engine = _engine.Value;
        if (engine is null) return null;
        var w = Math.Min(img.Width, (int)OcrEngine.MaxImageDimension);
        var h = Math.Min(img.Height, (int)OcrEngine.MaxImageDimension);
        var bgra = new byte[w * h * 4];
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var v = (byte)Math.Clamp(Math.Round(img.Data[y * img.Width + x] * 255), 0, 255);
                var o = (y * w + x) * 4;
                bgra[o] = v; bgra[o + 1] = v; bgra[o + 2] = v; bgra[o + 3] = 255;
            }
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            using var bitmap = SoftwareBitmap.CreateCopyFromBuffer(CryptographicBuffer.CreateFromByteArray(bgra), BitmapPixelFormat.Bgra8, w, h, BitmapAlphaMode.Premultiplied);
            var result = await engine.RecognizeAsync(bitmap);
            return string.Join(' ', result.Lines.Select(l => l.Text));
        }
        catch (Exception) { return null; }
        finally { _gate.Release(); }
    }

    public void Dispose() => _gate.Dispose();
}
