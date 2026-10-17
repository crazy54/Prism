using System.Text.Json.Nodes;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;

namespace PrismControl.Tests;

public class SchedulerTests
{
    private static TimeSpan Ms(double ms) => TimeSpan.FromMilliseconds(ms);

    /// <summary>Simulates the pump: every 5 ms, pump and record what was sent.</summary>
    private static List<(TimeSpan At, ScheduledUpdate U)> Run(UpdateScheduler s, TimeSpan duration, Action<TimeSpan>? each = null, double stepMs = 5)
    {
        var sent = new List<(TimeSpan, ScheduledUpdate)>();
        for (var t = TimeSpan.Zero; t <= duration; t += Ms(stepMs))
        {
            each?.Invoke(t);
            foreach (var u in s.Pump(t).Updates) sent.Add((t, u));
        }
        return sent;
    }

    private static int WorstWindow(List<(TimeSpan At, ScheduledUpdate U)> sent, TimeSpan from)
    {
        var times = sent.Where(x => x.At >= from).Select(x => x.At.TotalMilliseconds).ToList();
        var max = 0;
        for (int i = 0, j = 0; i < times.Count; i++)
        {
            while (times[i] - times[j] >= 1000) j++;
            max = Math.Max(max, i - j + 1);
        }
        return max;
    }

    [Test]
    public void Global_budget_caps_a_12_key_60fps_flood()
    {
        // The lab: 12 keys × 60 fps (707 sends/s) made the app's watchdog kill the probe. We must emit ≤ 60/s.
        var s = new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 60 });
        var frame = 0;
        var sent = Run(s, TimeSpan.FromSeconds(5), t =>
        {
            if (t.TotalMilliseconds % 15 < 5)
            {
                frame++;
                for (var k = 0; k < 12; k++) s.EnqueueImage("k" + k, $"img{k}-{frame}", null, 0, UpdatePriority.Interactive, t);
            }
        });
        var steady = WorstWindow(sent, TimeSpan.FromSeconds(1));
        Assert.True(steady <= 61, $"worst 1 s window after warm-up was {steady}");
        Assert.True(sent.Count >= 4 * 60, $"budget should be used, sent {sent.Count}");
        // Fairness: every key got updates.
        Assert.Equal(12, sent.Select(x => x.U.Context).Distinct().Count());
    }

    [Test]
    public void Latest_frame_wins_per_context()
    {
        var s = new UpdateScheduler();
        s.EnqueueImage("a", "one", null, 0, UpdatePriority.Normal, TimeSpan.Zero);
        s.EnqueueImage("a", "two", null, 0, UpdatePriority.Normal, TimeSpan.Zero);
        s.EnqueueImage("a", "three", null, 0, UpdatePriority.Normal, TimeSpan.Zero);
        var r = s.Pump(TimeSpan.Zero);
        var u = Assert.Single(r.Updates);
        Assert.Equal("three", u.Payload["image"]!.GetValue<string>());
        Assert.Equal(2L, s.GetStats(TimeSpan.Zero).Coalesced);
    }

    [Test]
    public void Unchanged_payloads_are_not_resent_until_willAppear()
    {
        var s = new UpdateScheduler();
        s.EnqueueImage("a", "same", null, 0, UpdatePriority.Normal, TimeSpan.Zero);
        Assert.Equal(1, s.Pump(TimeSpan.Zero).Updates.Count);
        s.EnqueueImage("a", "same", null, 0, UpdatePriority.Normal, Ms(500));
        Assert.Equal(0, s.Pump(Ms(500)).Updates.Count);
        s.Invalidate("a", Ms(600)); // willAppear again: the app shows the manifest image, so resend
        s.EnqueueImage("a", "same", null, 0, UpdatePriority.Normal, Ms(600));
        Assert.Equal(1, s.Pump(Ms(600)).Updates.Count);
    }

    [Test]
    public void Feedback_keys_merge_and_only_changed_keys_go_out()
    {
        var s = new UpdateScheduler();
        s.EnqueueFeedback("d", new JsonObject { ["value"] = "1", ["bar"] = 10 }, UpdatePriority.Normal, TimeSpan.Zero);
        s.EnqueueFeedback("d", new JsonObject { ["value"] = "2" }, UpdatePriority.Normal, TimeSpan.Zero);
        var first = Assert.Single(s.Pump(TimeSpan.Zero).Updates);
        Assert.Equal("2", first.Payload["value"]!.GetValue<string>());
        Assert.Equal(10, first.Payload["bar"]!.GetValue<int>());
        s.EnqueueFeedback("d", new JsonObject { ["value"] = "2", ["bar"] = 11 }, UpdatePriority.Normal, Ms(200));
        var second = Assert.Single(s.Pump(Ms(200)).Updates);
        Assert.False(second.Payload.ContainsKey("value"), "unchanged key resent");
        Assert.Equal(11, second.Payload["bar"]!.GetValue<int>());
    }

    [Test]
    public void Layout_goes_before_its_feedback_and_drops_stale_feedback()
    {
        var s = new UpdateScheduler();
        s.EnqueueFeedback("d", new JsonObject { ["old"] = "x" }, UpdatePriority.Normal, TimeSpan.Zero);
        s.EnqueueLayout("d", "layouts/prism-canvas.json", UpdatePriority.Normal, TimeSpan.Zero);
        s.EnqueueFeedback("d", new JsonObject { ["canvas"] = "data:image/svg+xml,a" }, UpdatePriority.Normal, TimeSpan.Zero);
        var r = s.Pump(TimeSpan.Zero).Updates;
        Assert.Equal(2, r.Count);
        Assert.Equal(UpdateKind.FeedbackLayout, r[0].Kind);
        Assert.Equal(UpdateKind.Feedback, r[1].Kind);
        Assert.False(r[1].Payload.ContainsKey("old"));
        // Same layout again: skipped.
        s.EnqueueLayout("d", "layouts/prism-canvas.json", UpdatePriority.Normal, Ms(300));
        Assert.Equal(0, s.Pump(Ms(300)).Updates.Count);
    }

    [Test]
    public void Interactive_context_jumps_the_queue_when_budget_is_short()
    {
        var s = new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 10, Burst = 1 });
        for (var k = 0; k < 10; k++) s.EnqueueImage("bg" + k, "x", null, 0, UpdatePriority.Background, TimeSpan.Zero);
        s.MarkInteractive("dial", TimeSpan.Zero);
        s.EnqueueFeedback("dial", new JsonObject { ["v"] = 1 }, UpdatePriority.Normal, Ms(1));
        var first = s.Pump(Ms(1)).Updates;
        Assert.Equal("dial", Assert.Single(first).Context);
    }

    [Test]
    public void Per_context_rate_tiers_apply()
    {
        // One context, updated every 5 ms for 2 s: interactive ≤ 30/s, normal ≤ 10/s, background ≤ 2/s.
        foreach (var (prio, max) in new[] { (UpdatePriority.Interactive, 31), (UpdatePriority.Normal, 11), (UpdatePriority.Background, 3) })
        {
            var s = new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 240, InteractiveWindow = TimeSpan.Zero });
            var n = 0;
            var sent = Run(s, TimeSpan.FromSeconds(2), t => s.EnqueueImage("a", "f" + n++, null, 0, prio, t));
            var worst = WorstWindow(sent, TimeSpan.FromMilliseconds(500));
            Assert.True(worst <= max, $"{prio}: worst window {worst} > {max}");
            Assert.True(worst >= max - 3, $"{prio}: rate too low ({worst})");
        }
    }

    [Test]
    public void Input_makes_a_context_interactive_for_the_window()
    {
        var s = new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 240 });
        var n = 0;
        var sent = Run(s, TimeSpan.FromSeconds(3), t =>
        {
            if (t < TimeSpan.FromSeconds(1)) s.MarkInteractive("dial", t);
            s.EnqueueFeedback("dial", new JsonObject { ["v"] = n++ }, UpdatePriority.Background, t);
        });
        var during = sent.Count(x => x.At < TimeSpan.FromSeconds(1));
        var after = sent.Count(x => x.At > TimeSpan.FromSeconds(2.6));
        Assert.True(during >= 27, $"interactive second only sent {during}");
        Assert.True(after <= 1, $"idle tail sent {after} in 0.4 s (background tier is 2/s)");
    }

    [Test]
    public void Forget_drops_pending_work()
    {
        var s = new UpdateScheduler();
        s.EnqueueImage("gone", "x", null, 0, UpdatePriority.Normal, TimeSpan.Zero);
        s.Forget("gone");
        Assert.Equal(0, s.Pump(TimeSpan.Zero).Updates.Count);
        Assert.Null(s.Pump(TimeSpan.Zero).NextWake);
    }

    [Test]
    public void Next_wake_is_reported_when_work_is_deferred()
    {
        var s = new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 60 });
        s.EnqueueImage("a", "1", null, 0, UpdatePriority.Normal, TimeSpan.Zero);
        s.Pump(TimeSpan.Zero);
        s.EnqueueImage("a", "2", null, 0, UpdatePriority.Normal, Ms(10));
        var r = s.Pump(Ms(10));
        Assert.Equal(0, r.Updates.Count);
        Assert.True(r.NextWake is { } w && w >= Ms(99) && w <= Ms(101), $"next wake {r.NextWake}");
    }

    [Test]
    public void Budget_change_takes_effect()
    {
        var s = new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 60 });
        s.UpdateOptions(s.Options with { UpdatesPerSecond = 20 });
        var frame = 0;
        var sent = Run(s, TimeSpan.FromSeconds(3), t =>
        {
            frame++;
            for (var k = 0; k < 8; k++) s.EnqueueImage("k" + k, $"{k}-{frame}", null, 0, UpdatePriority.Interactive, t);
        });
        Assert.True(WorstWindow(sent, TimeSpan.FromSeconds(1)) <= 21);
        Assert.Equal(20.0, s.GetStats(TimeSpan.Zero).BudgetPerSecond);
    }

    [Test]
    public void Budget_is_clamped_to_safe_limits()
    {
        Assert.Equal(SchedulerOptions.MaxBudget, new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 10_000 }).Options.UpdatesPerSecond);
        Assert.Equal(SchedulerOptions.MinBudget, new UpdateScheduler(new SchedulerOptions { UpdatesPerSecond = 0 }).Options.UpdatesPerSecond);
    }
}
