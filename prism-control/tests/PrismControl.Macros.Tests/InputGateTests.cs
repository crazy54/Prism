using PrismControl.Core.Hosting;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

/// <summary>Macros sends every batch inside the plugin-wide input gate (Core IInputGate), so no other module's keys interleave.</summary>
public class InputGateTests
{
    private sealed class RecordingGate : IInputGate
    {
        private int _inside;
        public List<string> Owners { get; } = [];
        public bool Inside => Volatile.Read(ref _inside) == 1;

        public ValueTask<IAsyncDisposable> AcquireAsync(string owner, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Exchange(ref _inside, 1) == 1) throw new InvalidOperationException("the gate is not re-entrant");
            Owners.Add(owner);
            return ValueTask.FromResult<IAsyncDisposable>(new Release(this));
        }

        private sealed class Release(RecordingGate gate) : IAsyncDisposable
        {
            public ValueTask DisposeAsync() { Volatile.Write(ref gate._inside, 0); return ValueTask.CompletedTask; }
        }
    }

    /// <summary>Records, for every SendInput batch, whether the gate was held at that moment.</summary>
    private sealed class GateCheckingSink(Func<bool> inside) : IInputSink
    {
        public List<bool> HeldAtSend { get; } = [];
        public int Send(ReadOnlySpan<KeyInput> inputs) { HeldAtSend.Add(inside()); return inputs.Length; }
    }

    [Test]
    public async Task Every_batch_goes_out_while_the_gate_is_held_and_it_is_released_between_steps()
    {
        var gate = new RecordingGate();
        var sink = new GateCheckingSink(() => gate.Inside);
        var engine = new MacroEngine(sink, new FakeForeground(), new FakeLauncher()) { InputGate = () => gate };
        var r = await engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+C"), new TextStep("ok"), new ChordStep("Ctrl+V")));
        Assert.True(r.Succeeded, r.Describe());
        Assert.True(sink.HeldAtSend.Count >= 3);
        Assert.True(sink.HeldAtSend.All(h => h), "every SendInput batch ran inside the gate");
        Assert.True(gate.Owners.All(o => o == "macros"), "the owner is the module name only");
        Assert.False(gate.Inside, "released after the last batch");
    }

    [Test]
    public async Task A_dry_run_never_takes_the_gate()
    {
        var gate = new RecordingGate();
        var engine = new MacroEngine(new RecordingSink(), new FakeForeground(), new FakeLauncher(), dryRun: true) { InputGate = () => gate };
        await engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+C")));
        Assert.Empty(gate.Owners);
    }

    [Test]
    public async Task Without_a_gate_provider_macros_send_as_before()
    {
        var rig = new TestRig();
        rig.Engine.InputGate = () => null;
        var r = await rig.Engine.RunAsync(MacroScript.Of(new ChordStep("A")));
        Assert.True(r.Succeeded, r.Describe());
        Assert.Single(rig.Sink.Batches);
    }
}
