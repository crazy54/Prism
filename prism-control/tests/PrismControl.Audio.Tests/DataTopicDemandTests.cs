using PrismControl.Core.Data;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>
/// <see cref="DataTopic.Demand"/>: how in-process readers (actions reading <c>Current</c>) keep demand-driven producers
/// running, on a <see cref="ManualTimeProvider"/>. The spectrum's own case is in <see cref="SpectrumProviderTests"/>.
/// </summary>
public class DataTopicDemandTests
{
    /// <summary>
    /// A demand-driven producer like Spotify's remote-Connect polling: it starts on <see cref="DataTopic.DemandStarted"/>,
    /// polls and publishes once a second while the topic is demanded, and stops when demand lapses.
    /// </summary>
    private sealed class Poller
    {
        private readonly DataPublisher<NowPlayingSnapshot> _pub;
        private readonly TimeProvider _time;
        private ITimer? _timer;

        public Poller(DataTopic<NowPlayingSnapshot> topic, TimeProvider time)
        {
            _time = time;
            _pub = topic.Claim("test", TimeSpan.FromSeconds(1)) ?? throw new InvalidOperationException("claimed");
            _pub.DemandStarted += (_, _) => Start();
        }

        public int Starts, Polls;
        public bool Running => _timer is not null;

        private void Start()
        {
            if (_timer is not null) return;
            Starts++;
            _timer = _time.CreateTimer(_ => Poll(), null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
        }

        private void Poll()
        {
            if (!_pub.IsDemanded)
            {
                _timer?.Dispose();
                _timer = null;
                return;
            }
            Polls++;
            _pub.Publish(new NowPlayingSnapshot { State = "playing", Track = new TrackInfo { Title = $"Example Song {Polls}" } });
        }
    }

    [Test]
    public void Demand_starts_and_keeps_a_now_playing_producer_alive_then_it_lapses()
    {
        var clock = new ManualTimeProvider();
        var registry = new DataRegistry(clock);
        var topic = registry.NowPlaying;
        var poller = new Poller(topic, clock);
        for (var i = 0; i < 10; i++)
        {
            Assert.Null(topic.Current, "reading Current creates no demand");
            clock.Advance(TimeSpan.FromSeconds(1));
        }
        Assert.False(poller.Running);
        Assert.False(topic.IsDemanded);

        topic.Demand();
        Assert.True(poller.Running, "DemandStarted is raised on the calling thread");
        clock.Advance(TimeSpan.Zero);
        Assert.Equal("Example Song 1", topic.Current!.Track!.Title);

        for (var i = 0; i < 20; i++) // a key showing it calls Demand() once a second
        {
            clock.Advance(TimeSpan.FromSeconds(1));
            topic.Demand();
        }
        Assert.True(poller.Running);
        Assert.Equal(1, poller.Starts, "one start: demand never lapsed");
        Assert.Equal(21, poller.Polls);

        clock.Advance(TimeSpan.FromSeconds(4.5));
        Assert.True(poller.Running, "still inside the 5 s window");
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.False(poller.Running, "the window lapsed: the producer stopped");
        var polls = poller.Polls;
        clock.Advance(TimeSpan.FromSeconds(30));
        Assert.Equal(polls, poller.Polls, "no work while idle");

        topic.Demand();
        Assert.Equal(2, poller.Starts, "idle → demanded starts it again");
    }

    [Test]
    public void Demand_serializes_nothing_and_never_calls_a_pull_provider()
    {
        var clock = new ManualTimeProvider();
        var registry = new DataRegistry(clock);
        var pulls = 0;
        Assert.True(registry.AudioDevices.ClaimPull("test", _ => { pulls++; return ValueTask.FromResult<AudioDevicesSnapshot?>(new AudioDevicesSnapshot()); }, TimeSpan.Zero));
        registry.AudioDevices.Demand();
        registry.AudioDevices.Demand();
        Assert.Equal(0, pulls, "Demand() never pulls");
        Assert.True(registry.AudioDevices.IsDemanded);

        var pub = Assert.NotNull(registry.Mic.Claim("test", TimeSpan.Zero));
        pub.Publish(new MicSnapshot { Muted = true });
        var seq = registry.Mic.Seq;
        var current = registry.Mic.Current;
        registry.Mic.Demand();
        Assert.Equal(seq, registry.Mic.Seq);
        Assert.True(ReferenceEquals(current, registry.Mic.Current), "the same snapshot: nothing copied");

        registry.NowPlayingArt.Demand(); // binary topics too
        Assert.True(registry.NowPlayingArt.IsDemanded);
    }

    [Test]
    public void Concurrent_first_demands_raise_DemandStarted_once()
    {
        var clock = new ManualTimeProvider();
        var registry = new DataRegistry(clock);
        var started = 0;
        registry.AudioSpectrum.DemandStarted += (_, _) => Interlocked.Increment(ref started);
        Parallel.For(0, 256, _ => registry.AudioSpectrum.Demand());
        Assert.Equal(1, started);
        clock.Advance(TimeSpan.FromSeconds(4));
        registry.AudioSpectrum.Demand();
        Assert.Equal(1, started, "inside the window it only extends demand");
        clock.Advance(TimeSpan.FromSeconds(6));
        Assert.False(registry.AudioSpectrum.IsDemanded);
        Parallel.For(0, 256, _ => registry.AudioSpectrum.Demand());
        Assert.Equal(2, started, "after the window lapsed: one more start");
    }
}
