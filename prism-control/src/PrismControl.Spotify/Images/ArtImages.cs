using System.Runtime.InteropServices.WindowsRuntime;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Spotify.Smtc;
using PrismControl.Spotify.Web;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace PrismControl.Spotify.Images;

/// <summary>Downscales art with WinRT imaging (decode → Fant scale → JPEG). Resizing only: the aspect ratio is kept, nothing is cropped.</summary>
public static class ArtScaler
{
    /// <summary>A JPEG whose longer side is at most <paramref name="maxPx"/> (null if decoding failed).</summary>
    public static async Task<byte[]?> ToJpegAsync(byte[] source, int maxPx)
    {
        try
        {
            using var input = new InMemoryRandomAccessStream();
            await input.WriteAsync(source.AsBuffer());
            input.Seek(0);
            var decoder = await BitmapDecoder.CreateAsync(input);
            var w = decoder.OrientedPixelWidth;
            var h = decoder.OrientedPixelHeight;
            if (w == 0 || h == 0) return null;
            var scale = Math.Min(1.0, (double)maxPx / Math.Max(w, h));
            var sw = (uint)Math.Max(1, Math.Round(w * scale));
            var sh = (uint)Math.Max(1, Math.Round(h * scale));
            using var bitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore,
                new BitmapTransform { ScaledWidth = sw, ScaledHeight = sh, InterpolationMode = BitmapInterpolationMode.Fant },
                ExifOrientationMode.RespectExifOrientation, ColorManagementMode.DoNotColorManage);
            using var output = new InMemoryRandomAccessStream();
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, output);
            encoder.SetSoftwareBitmap(bitmap);
            await encoder.FlushAsync();
            var bytes = new byte[output.Size];
            output.Seek(0);
            using (var s = output.AsStreamForRead()) await s.ReadExactlyAsync(bytes);
            return bytes;
        }
        catch (Exception) { return null; }
    }
}

/// <summary>
/// In-memory art cache (Spotify: "temporary caching only"; nothing touches the disk): source bytes by URL
/// (≤ 200 entries / 24 MB) and derived display images by (key, px), 24 h TTL, at most 4 downloads at once, in-flight
/// de-duplication. CDN downloads carry no Authorization header. <see cref="Clear"/> runs on Disconnect.
/// </summary>
public sealed class ImageCache
{
    private const int MaxSources = 200;
    private const long MaxSourceBytes = 24L * 1024 * 1024;
    private const int MaxDerived = 400;
    private const int MaxDownloadBytes = 4 * 1024 * 1024;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private readonly HttpClient _http;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly SemaphoreSlim _downloads = new(4, 4);
    private readonly object _lock = new();
    private readonly Lru<string, (byte[] Bytes, DateTimeOffset At)> _sources = new(MaxSources);
    private readonly Lru<string, (ArtImage Art, DateTimeOffset At)> _derived = new(MaxDerived);
    private readonly Dictionary<string, Task<ArtImage?>> _inflight = new(StringComparer.Ordinal);
    private long _sourceBytes;

    public ImageCache(HttpClient http, TimeProvider time, ILog log)
    {
        _http = http;
        _time = time;
        _log = log;
    }

    /// <summary>Raised (any thread) when a requested image finished loading.</summary>
    public event EventHandler<string>? Loaded;

    /// <summary>Picks the smallest image at least <paramref name="targetPx"/> wide (images with no size: the first one).</summary>
    public static ImageDto? Pick(IReadOnlyList<ImageDto>? images, int targetPx)
    {
        if (images is null || images.Count == 0) return null;
        var sized = images.Where(i => i.Url is not null && i.Width is > 0).OrderBy(i => i.Width).ToList();
        if (sized.Count == 0) return images.FirstOrDefault(i => i.Url is not null);
        return sized.FirstOrDefault(i => i.Width >= targetPx) ?? sized[^1];
    }

    /// <summary>The cached display image for (url, px), or null (no download is started).</summary>
    public ArtImage? TryGet(string url, int displayPx)
    {
        lock (_lock)
        {
            if (_derived.TryGet(Key(url, displayPx), out var v) && _time.GetUtcNow() - v.At < Ttl) return v.Art;
            return null;
        }
    }

    /// <summary>Downloads (or reuses) <paramref name="url"/> and returns it with a display copy scaled to <paramref name="displayPx"/>.</summary>
    public Task<ArtImage?> GetAsync(string url, int displayPx)
    {
        if (TryGet(url, displayPx) is { } hit) return Task.FromResult<ArtImage?>(hit);
        var key = Key(url, displayPx);
        lock (_lock)
        {
            if (_inflight.TryGetValue(key, out var running)) return running;
            var task = LoadAsync(url, displayPx, key);
            _inflight[key] = task;
            return task;
        }
    }

    private async Task<ArtImage?> LoadAsync(string url, int displayPx, string key)
    {
        try
        {
            await Task.Yield();
            var source = await GetSourceAsync(url).ConfigureAwait(false);
            if (source is null) return null;
            var art = await FromBytesAsync(source, displayPx, url).ConfigureAwait(false);
            if (art is null) return null;
            lock (_lock) _derived.Set(key, (art, _time.GetUtcNow()));
            Loaded?.Invoke(this, url);
            return art;
        }
        catch (Exception ex)
        {
            _log.Debug("Art download failed: " + ex.GetType().Name);
            return null;
        }
        finally
        {
            lock (_lock) _inflight.Remove(key);
        }
    }

    private async Task<byte[]?> GetSourceAsync(string url)
    {
        lock (_lock)
        {
            if (_sources.TryGet(url, out var s) && _time.GetUtcNow() - s.At < Ttl) return s.Bytes;
        }
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return null;
        await _downloads.WaitAsync().ConfigureAwait(false);
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, uri);   // no Authorization: the image CDN is public
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cts.Token).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return null;
            if (resp.Content.Headers.ContentLength is > MaxDownloadBytes) return null;
            var bytes = await resp.Content.ReadAsByteArrayAsync(cts.Token).ConfigureAwait(false);
            if (bytes.Length > MaxDownloadBytes || ImageInfo.Probe(bytes) is null) return null;
            lock (_lock)
            {
                foreach (var old in _sources.Set(url, (bytes, _time.GetUtcNow()))) _sourceBytes -= old.Bytes.Length;
                _sourceBytes += bytes.Length;
                while (_sourceBytes > MaxSourceBytes && _sources.RemoveOldest(out var evicted)) _sourceBytes -= evicted.Bytes.Length;
            }
            return bytes;
        }
        finally { _downloads.Release(); }
    }

    /// <summary>Wraps raw art bytes (SMTC thumbnail or a download) with a display copy, cached by content hash.</summary>
    public async Task<ArtImage?> FromBytesAsync(byte[] bytes, int displayPx, string? sourceUrl = null)
    {
        var info = ImageInfo.Probe(bytes);
        if (info is null) return null;
        var hash = SmtcSource.Hash(bytes);
        var key = "hash:" + hash + "@" + displayPx;
        lock (_lock)
        {
            if (_derived.TryGet(key, out var hit)) return hit.Art;
        }
        byte[] display = bytes;
        if (Math.Max(info.Width, info.Height) > displayPx || info.Mime is not ("image/jpeg" or "image/png"))
            display = await ArtScaler.ToJpegAsync(bytes, displayPx).ConfigureAwait(false) ?? bytes;
        var art = new ArtImage
        {
            Original = bytes, Mime = info.Mime, Hash = hash, Width = info.Width, Height = info.Height, Display = display, SourceUrl = sourceUrl,
        };
        lock (_lock) _derived.Set(key, (art, _time.GetUtcNow()));
        return art;
    }

    public void Clear()
    {
        lock (_lock)
        {
            _sources.Clear();
            _derived.Clear();
            _sourceBytes = 0;
        }
    }

    public int Count { get { lock (_lock) return _derived.Count; } }

    private static string Key(string url, int px) => url + "@" + px.ToString(System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>A small LRU map (not thread-safe; callers lock).</summary>
    private sealed class Lru<TKey, TValue>(int capacity) where TKey : notnull
    {
        private readonly Dictionary<TKey, LinkedListNode<(TKey Key, TValue Value)>> _map = new();
        private readonly LinkedList<(TKey Key, TValue Value)> _order = new();

        public int Count => _map.Count;

        public bool TryGet(TKey key, out TValue value)
        {
            if (_map.TryGetValue(key, out var node))
            {
                _order.Remove(node);
                _order.AddFirst(node);
                value = node.Value.Value;
                return true;
            }
            value = default!;
            return false;
        }

        /// <summary>Adds or replaces; returns the values that left the map (the replaced one and evictions).</summary>
        public List<TValue> Set(TKey key, TValue value)
        {
            var gone = new List<TValue>();
            if (_map.TryGetValue(key, out var existing))
            {
                _order.Remove(existing);
                gone.Add(existing.Value.Value);
            }
            var node = new LinkedListNode<(TKey, TValue)>((key, value));
            _order.AddFirst(node);
            _map[key] = node;
            while (_map.Count > capacity && RemoveOldest(out var evicted)) gone.Add(evicted);
            return gone;
        }

        public bool RemoveOldest(out TValue value)
        {
            var last = _order.Last;
            if (last is null) { value = default!; return false; }
            _order.RemoveLast();
            _map.Remove(last.Value.Key);
            value = last.Value.Value;
            return true;
        }

        public void Clear()
        {
            _map.Clear();
            _order.Clear();
        }
    }
}
