namespace PrismControl.Browser.Hub;

/// <summary>An image ready to embed: validated PNG/JPEG bytes with their pixel size.</summary>
public sealed record StoredImage(string Id, string Mime, int Width, int Height, byte[] Bytes)
{
    public string DataUri => PrismControl.Core.Render.DataUri.Image(Bytes, Mime);
}

/// <summary>
/// Images by id ("fav:&lt;hash&gt;", "art:&lt;hash&gt;", "url:&lt;hash&gt;" for fetched artwork), LRU-evicted at a byte budget
/// (8 MB by default). Images travel once: the extension sends an id only for hashes it has not sent this session, and a
/// resync asks again. Thread-safe.
/// </summary>
public sealed class ImageStore
{
    public const long DefaultBudgetBytes = 8L * 1024 * 1024;

    private readonly object _gate = new();
    private readonly LinkedList<StoredImage> _lru = new();
    private readonly Dictionary<string, LinkedListNode<StoredImage>> _byId = new(StringComparer.Ordinal);
    private long _bytes;

    public ImageStore(long budgetBytes = DefaultBudgetBytes) => BudgetBytes = Math.Max(64 * 1024, budgetBytes);

    public long BudgetBytes { get; }
    public long Bytes { get { lock (_gate) return _bytes; } }
    public int Count { get { lock (_gate) return _byId.Count; } }

    /// <summary>Fired with the id after an image is added (the hub turns it into a store change).</summary>
    public event Action<string>? Added;

    public void Put(StoredImage image)
    {
        if (image.Bytes.Length > BudgetBytes / 4) return;   // one image never takes more than a quarter of the cache
        lock (_gate)
        {
            if (_byId.TryGetValue(image.Id, out var existing))
            {
                _lru.Remove(existing);
                _bytes -= existing.Value.Bytes.Length;
            }
            var node = _lru.AddFirst(image);
            _byId[image.Id] = node;
            _bytes += image.Bytes.Length;
            while (_bytes > BudgetBytes && _lru.Last is { } last)
            {
                _lru.RemoveLast();
                _byId.Remove(last.Value.Id);
                _bytes -= last.Value.Bytes.Length;
            }
        }
        Added?.Invoke(image.Id);
    }

    public StoredImage? Get(string? id)
    {
        if (id is null) return null;
        lock (_gate)
        {
            if (!_byId.TryGetValue(id, out var node)) return null;
            _lru.Remove(node);
            _lru.AddFirst(node);
            return node.Value;
        }
    }

    public bool Contains(string? id)
    {
        if (id is null) return false;
        lock (_gate) return _byId.ContainsKey(id);
    }

    public void Clear()
    {
        lock (_gate)
        {
            _lru.Clear();
            _byId.Clear();
            _bytes = 0;
        }
    }
}

/// <summary>The latest live-preview frame per browser window (≤ 2 fps, JPEG ≤ 360×180, ≤ 40 KB).</summary>
public sealed class PreviewStore
{
    private readonly object _gate = new();
    private readonly Dictionary<(string Browser, int Window), (StoredImage Frame, long At)> _frames = new();

    public void Put(string browserKey, int windowId, StoredImage frame, long atMs)
    {
        lock (_gate) _frames[(browserKey, windowId)] = (frame, atMs);
    }

    public (StoredImage Frame, long At)? Get(string browserKey, int windowId)
    {
        lock (_gate) return _frames.TryGetValue((browserKey, windowId), out var f) ? f : null;
    }

    /// <summary>Drops a browser's frames (it disconnected, or privacy turned the preview off).</summary>
    public void Clear(string? browserKey = null)
    {
        lock (_gate)
        {
            if (browserKey is null) _frames.Clear();
            else foreach (var k in _frames.Keys.Where(k => k.Browser == browserKey).ToList()) _frames.Remove(k);
        }
    }
}
