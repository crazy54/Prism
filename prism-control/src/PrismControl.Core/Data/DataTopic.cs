using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace PrismControl.Core.Data;

/// <summary>A pull provider: called on demand by the data API, at most once per <see cref="CacheFor"/>.</summary>
public interface IDataProvider<T> where T : class
{
    /// <summary>Short module name shown as the "source" of the payload, e.g. "audio".</summary>
    string Source { get; }
    TimeSpan CacheFor { get; }
    ValueTask<T?> GetAsync(CancellationToken cancellationToken);
}

/// <summary>What the HTTP server reads from a topic.</summary>
public sealed record TopicValue(byte[] Body, string ContentType, long Seq, DateTimeOffset UpdatedAt, string Etag, string? Source);

/// <summary>A binary topic's current value for in-process readers. <see cref="Etag"/> changes whenever the bytes do.</summary>
public sealed record BinaryValue(ReadOnlyMemory<byte> Data, string Mime, string Etag, int? Width, int? Height);

/// <summary>One data API endpoint. Domain modules claim it and publish into it.</summary>
public abstract class DataTopic
{
    private readonly TimeProvider _time;
    private long _lastRequestedTicks;
    private readonly object _claimGate = new();
    private object? _owner;
    private bool _ownerIsDemo;

    protected DataTopic(string path, TimeSpan defaultCadence, TimeProvider time)
    {
        Path = path;
        Cadence = defaultCadence;
        _time = time;
        Generation = Convert.ToHexString(RandomNumberGenerator.GetBytes(3)).ToLowerInvariant();
    }

    public string Path { get; }
    /// <summary>The documented update cadence (reported by /v1/health).</summary>
    public TimeSpan Cadence { get; protected set; }
    public string? Source { get; private set; }
    public bool IsDemo => _ownerIsDemo;
    public bool IsClaimed { get { lock (_claimGate) return _owner is not null; } }
    /// <summary>Per-process random prefix for ETags, so a restart never reuses one.</summary>
    protected string Generation { get; }
    /// <summary>Clients stop being "demand" after this long without a request.</summary>
    public TimeSpan DemandWindow { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>True while a client polled within <see cref="DemandWindow"/>. Expensive producers (metering) should idle otherwise.</summary>
    public bool IsDemanded
    {
        get
        {
            var t = Interlocked.Read(ref _lastRequestedTicks);
            return t != 0 && _time.GetElapsedTime(t) < DemandWindow;
        }
    }

    /// <summary>Raised (on the request thread) when the first request arrives after an idle period. Start metering here.</summary>
    public event EventHandler? DemandStarted;

    public abstract bool HasData { get; }
    public abstract long Seq { get; }
    public abstract DateTimeOffset? UpdatedAt { get; }

    /// <summary>After demand starts, a request without data waits this long for the producer's first publish.</summary>
    public TimeSpan FirstDataWait { get; set; } = TimeSpan.FromMilliseconds(250);

    /// <summary>Records a request; returns true if this request started demand (the producer may only now be starting).</summary>
    internal bool NoteRequest()
    {
        var wasDemanded = IsDemanded;
        Interlocked.Exchange(ref _lastRequestedTicks, _time.GetTimestamp());
        if (wasDemanded) return false;
        DemandStarted?.Invoke(this, EventArgs.Empty);
        return true;
    }

    private TaskCompletionSource _published = new(TaskCreationOptions.RunContinuationsAsynchronously);

    protected void SignalPublished()
    {
        var old = Interlocked.Exchange(ref _published, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        old.TrySetResult();
    }

    protected async Task WaitForFirstPublishAsync(CancellationToken ct)
    {
        try { await Volatile.Read(ref _published).Task.WaitAsync(FirstDataWait, ct).ConfigureAwait(false); }
        catch (TimeoutException) { }
    }

    /// <summary>Called by the data API server.</summary>
    public abstract ValueTask<TopicValue?> ReadAsync(CancellationToken cancellationToken);

    protected DateTimeOffset Now => _time.GetUtcNow();

    /// <summary>Takes ownership. Returns false if a real (non-demo) provider already owns it. A real claim replaces a demo claim.</summary>
    protected bool TryClaim(object owner, string source, bool demo)
    {
        lock (_claimGate)
        {
            if (_owner is not null && !_ownerIsDemo) return false;
            if (_owner is not null && demo) return false;
            _owner = owner;
            _ownerIsDemo = demo;
            Source = source;
            OnClaimChanged();
            return true;
        }
    }

    protected bool Owns(object owner)
    {
        lock (_claimGate) return ReferenceEquals(_owner, owner);
    }

    protected virtual void OnClaimChanged() { }
}

/// <summary>A JSON endpoint carrying <typeparamref name="T"/>.</summary>
public sealed class DataTopic<T> : DataTopic where T : class
{
    private readonly JsonTypeInfo<T> _typeInfo;
    private readonly object _gate = new();
    private Snapshot? _current;
    private Func<CancellationToken, ValueTask<T?>>? _pull;
    private TimeSpan _pullCache;
    private readonly SemaphoreSlim _pullGate = new(1, 1);
    private long _seq;

    private sealed record Snapshot(T Value, byte[] Json, long Seq, DateTimeOffset At);

    public DataTopic(string path, JsonTypeInfo<T> typeInfo, TimeSpan defaultCadence, TimeProvider time) : base(path, defaultCadence, time)
    {
        _typeInfo = typeInfo;
    }

    public override bool HasData { get { lock (_gate) return _current is not null || _pull is not null; } }
    public override long Seq { get { lock (_gate) return _current?.Seq ?? 0; } }
    public override DateTimeOffset? UpdatedAt { get { lock (_gate) return _current?.At; } }

    /// <summary>The last published value (null if none).</summary>
    public T? Current { get { lock (_gate) return _current?.Value; } }

    /// <summary>
    /// Claims the endpoint for push publishing. Returns null if another real provider owns it.
    /// <paramref name="cadence"/> is what /v1/health reports (e.g. 1 s for system stats).
    /// </summary>
    public DataPublisher<T>? Claim(string source, TimeSpan cadence, bool demo = false)
    {
        var pub = new DataPublisher<T>(this);
        if (!TryClaim(pub, source, demo)) return null;
        Cadence = cadence;
        return pub;
    }

    /// <summary>Claims the endpoint with a pull function, called at most once per <paramref name="cacheFor"/> while clients poll.</summary>
    public bool ClaimPull(string source, Func<CancellationToken, ValueTask<T?>> pull, TimeSpan cacheFor, bool demo = false)
    {
        var owner = new object();
        if (!TryClaim(owner, source, demo)) return false;
        lock (_gate)
        {
            _pull = pull;
            _pullCache = cacheFor;
            _current = null;
        }
        Cadence = cacheFor;
        return true;
    }

    public bool ClaimProvider(IDataProvider<T> provider, bool demo = false) =>
        ClaimPull(provider.Source, provider.GetAsync, provider.CacheFor, demo);

    protected override void OnClaimChanged()
    {
        lock (_gate)
        {
            _pull = null;
            _current = null;
        }
    }

    internal void PublishFrom(DataPublisher<T> publisher, T value)
    {
        if (!Owns(publisher)) return;
        var json = JsonSerializer.SerializeToUtf8Bytes(value, _typeInfo);
        lock (_gate) _current = new Snapshot(value, json, ++_seq, Now);
        SignalPublished();
    }

    internal void ClearFrom(DataPublisher<T> publisher)
    {
        if (!Owns(publisher)) return;
        lock (_gate) _current = null;
    }

    public override async ValueTask<TopicValue?> ReadAsync(CancellationToken cancellationToken)
    {
        var started = NoteRequest();
        Func<CancellationToken, ValueTask<T?>>? pull;
        Snapshot? snap;
        lock (_gate)
        {
            pull = _pull;
            snap = _current;
        }
        if (snap is null && pull is null && started && IsClaimed)
        {
            // Demand just started (e.g. metering): give the producer a moment to publish its first frame.
            await WaitForFirstPublishAsync(cancellationToken).ConfigureAwait(false);
            lock (_gate) snap = _current;
        }
        if (pull is not null && (snap is null || Now - snap.At >= _pullCache))
        {
            await _pullGate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                lock (_gate) snap = _current;
                if (snap is null || Now - snap.At >= _pullCache)
                {
                    var value = await pull(cancellationToken).ConfigureAwait(false);
                    if (value is not null)
                    {
                        var json = JsonSerializer.SerializeToUtf8Bytes(value, _typeInfo);
                        lock (_gate)
                        {
                            // Only bump seq when the content changed, so ETags stay valid across identical polls.
                            var same = _current is not null && _current.Json.AsSpan().SequenceEqual(json);
                            _current = new Snapshot(value, json, same ? _current!.Seq : ++_seq, Now);
                        }
                    }
                    lock (_gate) snap = _current;
                }
            }
            finally { _pullGate.Release(); }
        }
        if (snap is null) return null;
        return new TopicValue(snap.Json, "application/json", snap.Seq, snap.At, $"\"{Generation}-{snap.Seq}\"", Source);
    }
}

/// <summary>The handle a module publishes through after claiming a topic.</summary>
public sealed class DataPublisher<T> where T : class
{
    private readonly DataTopic<T> _topic;
    internal DataPublisher(DataTopic<T> topic) => _topic = topic;

    public DataTopic<T> Topic => _topic;
    public bool IsDemanded => _topic.IsDemanded;

    public event EventHandler? DemandStarted
    {
        add => _topic.DemandStarted += value;
        remove => _topic.DemandStarted -= value;
    }

    /// <summary>Publishes a new snapshot (serialized once; requests read the cached bytes).</summary>
    public void Publish(T snapshot) => _topic.PublishFrom(this, snapshot);

    /// <summary>Marks the data unavailable (the endpoint answers 503 until the next Publish).</summary>
    public void Clear() => _topic.ClearFrom(this);
}

/// <summary>A binary endpoint (album art).</summary>
public sealed class BinaryTopic : DataTopic
{
    private readonly object _gate = new();
    private (byte[] Data, string Mime, long Seq, DateTimeOffset At, string Etag, int? W, int? H)? _current;
    private long _seq;

    public BinaryTopic(string path, TimeSpan cadence, TimeProvider time) : base(path, cadence, time) { }

    public override bool HasData { get { lock (_gate) return _current is not null; } }
    public override long Seq { get { lock (_gate) return _current?.Seq ?? 0; } }
    public override DateTimeOffset? UpdatedAt { get { lock (_gate) return _current?.At; } }

    public BinaryPublisher? Claim(string source, bool demo = false)
    {
        var pub = new BinaryPublisher(this);
        return TryClaim(pub, source, demo) ? pub : null;
    }

    protected override void OnClaimChanged()
    {
        lock (_gate) _current = null;
    }

    /// <summary>The current image's ETag (quoted), or null.</summary>
    public string? CurrentEtag { get { lock (_gate) return _current?.Etag; } }
    public (string Mime, int? Width, int? Height)? CurrentInfo { get { lock (_gate) return _current is { } c ? (c.Mime, c.W, c.H) : null; } }

    /// <summary>
    /// The current image for in-process readers (e.g. a Kaleidoscope key): the bytes exactly as published (read-only),
    /// its MIME type, ETag (the change key) and pixel size, or null. Album art must be shown whole: no crop, mask or overlay.
    /// </summary>
    public BinaryValue? Current { get { lock (_gate) return _current is { } c ? new BinaryValue(c.Data, c.Mime, c.Etag, c.W, c.H) : null; } }

    internal void PublishFrom(BinaryPublisher pub, byte[] data, string mime)
    {
        if (!Owns(pub)) return;
        var hash = Convert.ToHexString(SHA256.HashData(data))[..16].ToLowerInvariant();
        var info = Render.ImageInfo.Probe(data);
        lock (_gate)
        {
            var etag = $"\"{hash}\"";
            if (_current is { } c && c.Etag == etag) return;
            _current = (data, mime, ++_seq, Now, etag, info?.Width, info?.Height);
        }
    }

    internal void ClearFrom(BinaryPublisher pub)
    {
        if (!Owns(pub)) return;
        lock (_gate) _current = null;
    }

    public override ValueTask<TopicValue?> ReadAsync(CancellationToken cancellationToken)
    {
        NoteRequest();
        lock (_gate)
        {
            if (_current is not { } c) return ValueTask.FromResult<TopicValue?>(null);
            return ValueTask.FromResult<TopicValue?>(new TopicValue(c.Data, c.Mime, c.Seq, c.At, c.Etag, Source));
        }
    }

    /// <summary>The current image as a data: URL (for ?art=dataUrl).</summary>
    public string? CurrentDataUrl()
    {
        lock (_gate) return _current is { } c ? Render.DataUri.Image(c.Data, c.Mime) : null;
    }
}

public sealed class BinaryPublisher
{
    private readonly BinaryTopic _topic;
    internal BinaryPublisher(BinaryTopic topic) => _topic = topic;
    public BinaryTopic Topic => _topic;
    public bool IsDemanded => _topic.IsDemanded;
    /// <summary>Publishes image bytes (deduplicated by hash). Use the image exactly as the source returned it (Spotify rules).</summary>
    public void Publish(byte[] data, string mime) => _topic.PublishFrom(this, data, mime);
    public void Clear() => _topic.ClearFrom(this);
}
