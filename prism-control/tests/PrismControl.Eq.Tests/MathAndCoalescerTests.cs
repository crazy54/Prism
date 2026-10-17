using PrismControl.Eq.Infrastructure;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

public class EqMathTests
{
    [Test]
    public void Peaking_filter_hits_its_gain_at_the_center_and_is_flat_far_away()
    {
        Assert.Near(6, EqMath.ResponseDb(EqFilterType.Peaking, 1000, 6, 1.41, 1000), 0.05);
        Assert.Near(-4, EqMath.ResponseDb(EqFilterType.Peaking, 250, -4, 0.7, 250), 0.05);
        Assert.Near(0, EqMath.ResponseDb(EqFilterType.Peaking, 1000, 6, 4, 20), 0.1);
    }

    [Test]
    public void Shelves_reach_their_gain_on_the_shelf_side()
    {
        Assert.Near(5, EqMath.ResponseDb(EqFilterType.LowShelf, 100, 5, 0.71, 20), 0.3);
        Assert.Near(0, EqMath.ResponseDb(EqFilterType.LowShelf, 100, 5, 0.71, 10000), 0.1);
        Assert.Near(-3, EqMath.ResponseDb(EqFilterType.HighShelf, 8000, -3, 0.71, 20000), 0.4);
        Assert.True(EqMath.ResponseDb(EqFilterType.HighPass, 100, 0, 0.71, 20) < -15);
    }

    [Test]
    public void Gain_steps_cap_galleon_flicks_and_stop_at_zero()
    {
        Assert.Equal(1.0, EqMath.StepGain(0.5, 1, 0.5, -12, 12));
        Assert.Equal(3.0, EqMath.StepGain(0, 12, 0.5, -12, 12));           // ±12 ticks count as at most ±6
        Assert.Equal(0.0, EqMath.StepGain(1.0, -6, 0.5, -12, 12));         // crossing zero stops at 0 dB
        Assert.Equal(-3.0, EqMath.StepGain(0, -6, 0.5, -12, 12));          // and the next turn continues
        Assert.Equal(12.0, EqMath.StepGain(11.5, 4, 0.5, -12, 12));        // clamped
        Assert.Equal(0.1, EqMath.StepGain(0.2, -1, 0.1, -12, 12));         // small steps near 0 are fine
        Assert.Equal(0.0, EqMath.StepGain(0.2, -3, 0.1, -12, 12));         // crossing still stops at 0
        Assert.Equal(0.1, EqMath.StepGain(0, 1, 0.1, -12, 12));            // and 0 is easy to leave
        Assert.Equal(-0.25, EqMath.StepGain(0, -1, 0.25, -12, 12));        // quarter steps stay exact
        Assert.Equal(12.0, EqMath.StepGain(12, 1, 1, 0, 12));
    }

    [Test]
    public void Browse_steps_move_one_per_plus_tick_and_up_to_three_per_galleon_flick()
    {
        Assert.Equal(1, EqMath.BrowseSteps(1));
        Assert.Equal(-1, EqMath.BrowseSteps(-2));
        Assert.Equal(2, EqMath.BrowseSteps(5));
        Assert.Equal(-3, EqMath.BrowseSteps(-12));
        Assert.Equal(0, EqMath.BrowseSteps(0));
    }

    [Test]
    public void Labels_use_hz_khz_and_signed_db()
    {
        Assert.Equal("31 Hz", EqMath.FormatHz(31.25));
        Assert.Equal("1 kHz", EqMath.FormatHz(1000));
        Assert.Equal("2.5 kHz", EqMath.FormatHz(2500));
        Assert.Equal("16 kHz", EqMath.FormatHz(16000));
        Assert.Equal("+4.5 dB", EqMath.FormatDb(4.5));
        Assert.Equal("−3.0 dB", EqMath.FormatDb(-3));
        Assert.Equal("0.0 dB", EqMath.FormatDb(0.001));
        Assert.Equal("−0.25 dB", EqMath.FormatDb(-0.25));
    }

    [Test]
    public void Targets_parse_from_settings_and_round_trip()
    {
        Assert.Equal(EqTarget.ForBand(3), EqTarget.Parse("3", EqTarget.ForBand(1)));
        Assert.Equal(EqTarget.ForKnob(EqKnob.BassBoost), EqTarget.Parse("bass", EqTarget.ForBand(1)));
        Assert.Equal(EqTarget.ForBand(1), EqTarget.Parse("nonsense", EqTarget.ForBand(1)));
        Assert.Equal("treble", EqTarget.ForKnob(EqKnob.TrebleBoost).SettingValue);
    }
}

public class CoalescerTests
{
    [Test]
    public async Task A_fast_spin_becomes_a_few_writes_under_three_per_half_second()
    {
        var time = new ManualTimeProvider();
        var starts = new List<TimeSpan>();
        var value = 0;
        var written = new List<int>();
        await using var w = new WriteCoalescer<string>(time, (_, _) => { starts.Add(time.Elapsed); written.Add(value); return Task.CompletedTask; },
            debounce: TimeSpan.FromMilliseconds(100), maxWait: TimeSpan.FromMilliseconds(250), minGap: TimeSpan.FromMilliseconds(180));
        // 2 s of edits at 30 Hz (a dial spun the whole time).
        for (var i = 0; i < 60; i++)
        {
            value = i;
            w.Schedule("game");
            time.Advance(TimeSpan.FromMilliseconds(33));
        }
        time.Advance(TimeSpan.FromSeconds(1));
        await w.WhenIdleAsync();
        Assert.InRange(starts.Count, 6, 9);
        for (var i = 0; i < starts.Count; i++)
        {
            var inWindow = starts.Count(s => s >= starts[i] && s < starts[i] + TimeSpan.FromMilliseconds(500));
            Assert.True(inWindow <= 3, $"{inWindow} writes within 500 ms of {starts[i].TotalMilliseconds} ms");
        }
        Assert.Equal(59, written[^1]); // the trailing write carries the latest value
    }

    [Test]
    public async Task One_edit_waits_for_the_debounce_then_writes_once()
    {
        var time = new ManualTimeProvider();
        var count = 0;
        await using var w = new WriteCoalescer<string>(time, (_, _) => { count++; return Task.CompletedTask; });
        w.Schedule("chat");
        time.Advance(TimeSpan.FromMilliseconds(90));
        Assert.Equal(0, count);
        time.Advance(TimeSpan.FromMilliseconds(20));
        await w.WhenIdleAsync();
        Assert.Equal(1, count);
        time.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(1, count); // nothing changed: nothing written
    }

    [Test]
    public async Task Writes_never_overlap_and_flush_sends_pending_now()
    {
        var time = new ManualTimeProvider();
        var inFlight = 0;
        var maxInFlight = 0;
        var gate = new TaskCompletionSource();
        var calls = new List<string>();
        await using var w = new WriteCoalescer<string>(time, async (k, _) =>
        {
            calls.Add(k);
            maxInFlight = Math.Max(maxInFlight, Interlocked.Increment(ref inFlight));
            if (calls.Count == 1) await gate.Task;
            Interlocked.Decrement(ref inFlight);
        });
        w.Schedule("game");
        w.Schedule("chat");
        time.Advance(TimeSpan.FromMilliseconds(150)); // game starts and blocks
        Assert.Equal(1, calls.Count);
        w.Schedule("game");                          // edited again while in flight
        var flush = w.FlushAsync();
        gate.SetResult();
        await flush;
        Assert.Equal(1, maxInFlight);
        Assert.Equal(3, calls.Count);
        Assert.True(w.IsIdle);
    }
}
