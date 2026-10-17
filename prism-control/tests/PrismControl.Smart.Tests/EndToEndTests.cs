using PrismControl.Smart.Context;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Runtime;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>Sight region names taken from the shipped pack, so the demo follows the pack as it evolves.</summary>
internal static class Pc2
{
    public static ContextPack Pack => TestPacks.Get("planet-coaster-2");
    public static string ReadoutRegion(string readout) => Pack.FindReadout(readout)!.Source.Region!;
    public static string ControlRegion(string control) => ((SightAdjustBinding)Pack.FindControl(control)!.Turn.Right).Sight;
    public static IEnumerable<string> ClickRegions(string verb) => PackValidator.SightRegionsOf(Pack.FindVerb(verb)!.Binding);
    public static string Panel(string context) => Pack.FindContext(context)!.Detect.Detectors.First(d => d.Type == DetectorType.Sight).Region!;

    /// <summary>The track editor is open: every declared region is on screen, with plausible values.</summary>
    public static void Builder(Rig rig, double bank)
    {
        var s = rig.SightFake;
        s.Visible.Clear();
        s.Visible.Add(Panel("trackBuilder"));
        foreach (var r in Pack.SightRegions) if (r.ValueType is not "presence") s.Located.Add(r.Id);
        s.Moves[ControlRegion("bank")] = (ReadoutRegion("bankAngle"), 5);
        s.Values[ReadoutRegion("bankAngle")] = bank;
        s.Values[ReadoutRegion("slopeAngle")] = 12;
        s.Values[ReadoutRegion("curveAngle")] = 0;
        var efn = ReadoutRegion("rideRatings");
        s.Values[efn + ".excitement"] = 7.2;
        s.Values[efn + ".fear"] = 5.1;
        s.Values[efn + ".nausea"] = 3.4;
        s.Publish();
    }
}

/// <summary>
/// The demo: Planet Coaster 2 in front (fake), Prism Sight reading the track builder (fake), a full Galleon deck of real
/// Smart Key / Smart Dial instances. The deck becomes the Coaster Console; the bank dial steps the bank control through
/// Sight; a push levels it to 0 by closed loop; terrain re-draws the slots, and coming back is the same console.
/// </summary>
public class CoasterConsoleEndToEnd
{
    [Test(TimeoutMs = 60_000)]
    public async Task Galleon_becomes_the_coaster_console_and_drives_bank_through_sight()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon);
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key);

        // 1. The builder opens: after the 400 ms hysteresis the deck is the Coaster Console.
        Pc2.Builder(rig, bank: 30);
        await rig.AdvanceAsync(500);
        Assert.Equal("planet-coaster-2/trackBuilder", rig.Engine.Context.Current.Key);
        await deck.SettleAsync();
        var proposal = Pc2.Pack.Layouts.Single(l => l.Device == "galleon-100-sd" && l.Context == "trackBuilder");
        // The MORE key owns the last slot: exactly one proposal verb, the lowest-priority one, moves to page 2.
        var onDeck = deck.Keys.Keys.Select(k => deck.View(k).ItemId).ToHashSet();
        var missing = proposal.Keys.Select(k => k.Verb).Where(v => !onDeck.Contains(v)).ToList();
        Assert.Single(missing);
        Assert.Equal(proposal.Keys.Select(k => Pc2.Pack.FindVerb(k.Verb)!).OrderBy(v => v.Priority).First().Id, missing[0]);
        Assert.Equal("builder.build", deck.View(new KeySlot(0, 0)).ItemId);
        Assert.Equal("builder.chainLift", deck.View(new KeySlot(0, 1)).ItemId);
        Assert.Equal(SlotKind.More, deck.View(new KeySlot(2, 3)).Kind);
        Assert.True(deck.Keys.Keys.All(k => deck.View(k).Availability.Ready), "every console key can run: " + string.Join(", ", deck.Keys.Keys.Where(k => !deck.View(k).Availability.Ready).Select(k => k + " " + deck.View(k).Availability.Hint)));
        var bank = deck.View(new DialSlot(0, 0));
        Assert.Equal("BANK", bank.Label);
        Assert.Equal("LEVEL", bank.PushLabel);
        Assert.Equal("30°", bank.Readout!.Text);
        Assert.True(bank.Availability.Ready, bank.Availability.Hint ?? "");
        Assert.Equal("PITCH", deck.View(new DialSlot(1, 0)).Label);
        Assert.Equal("LENGTH", deck.View(new DialSlot(1, 1)).Readout!.Readout.Label);
        var ratings = deck.Keys.Keys.Select(k => deck.View(k)).Single(v => v.ItemId == "builder.ratings");
        Assert.Equal(SlotKind.Readout, ratings.Kind);
        Assert.Equal("RATINGS", ratings.Label);
        Assert.Equal("E 7.2 · F 5.1 · N 3.4", ratings.Readout!.Text);
        var console = rig.Engine.LayoutFor(TestDevices.Galleon.Id).Describe();

        // 2. Turn the bank dial: Sight steps the on-screen bank control (no keyboard input at all).
        var bankDial = deck.Dials[new DialSlot(0, 0)];
        var slider = Pc2.ControlRegion("bank");
        await bankDial.RotateAsync(+3);
        await rig.IdleAsync();
        await bankDial.RotateAsync(-5);       // a faster spin: 5 ticks × 2 presses per tick
        await rig.IdleAsync();
        AssertExtra.Equal([$"adjust {slider} +3", $"adjust {slider} -10"], rig.SightFake.Calls);
        Assert.Equal(-5, rig.SightFake.Values[Pc2.ReadoutRegion("bankAngle")]);
        Assert.True(rig.SightFake.Tokens.All(t => t.Kind == PrismControl.Desktop.Sight.GestureKind.DialRotate), "turns carry dial-rotate tokens");
        await rig.AdvanceAsync(150);
        Assert.Equal("−5°", deck.View(new DialSlot(0, 0)).Readout!.Text);

        // 3. Push = LEVEL: a closed loop drives the bank to 0 and verifies it.
        await bankDial.DialPressAsync();
        await rig.IdleAsync();
        Assert.Equal($"drive {Pc2.ReadoutRegion("bankAngle")} -> 0 via control {slider}", rig.SightFake.Calls[^1]);
        Assert.Equal(0, rig.SightFake.Values[Pc2.ReadoutRegion("bankAngle")]);
        await rig.AdvanceAsync(150);
        Assert.Equal("0°", deck.View(new DialSlot(0, 0)).Readout!.Text);

        // 4. A piece-palette key: the macro opens the tab, then clicks the piece (one fresh token per click).
        var before = rig.SightFake.Calls.Count;
        await deck.Keys[new KeySlot(0, 1)].PressAsync();
        await rig.IdleAsync();
        AssertExtra.Equal(Pc2.ClickRegions("builder.chainLift").Select(r => "click " + r), rig.SightFake.Calls.Skip(before));
        Assert.Equal(rig.SightFake.Tokens.Count, rig.SightFake.Tokens.Select(t => t.Nonce).Distinct().Count(), "every Sight call has its own one-shot token");
        Assert.Empty(rig.Input.Records);

        // 4b. A step Sight can't find stops the macro with NOT FOUND on the key (never continues blind).
        var second = Pc2.ClickRegions("builder.testRide").Last();
        rig.SightFake.Located.Remove(second);
        rig.SightFake.Publish();
        before = rig.SightFake.Calls.Count;
        var testKey = deck.Keys.Single(k => deck.View(k.Key).ItemId == "builder.testRide");
        await testKey.Value.PressAsync();
        await rig.IdleAsync();
        Assert.Equal(2, rig.SightFake.Calls.Count - before);
        Assert.Equal("NOT FOUND", deck.View(testKey.Key).Flash);
        rig.SightFake.Located.Add(second);
        rig.SightFake.Publish();

        // 5. Terrain: the slots re-draw from the terrain layout...
        rig.SightFake.Visible.Clear();
        rig.SightFake.Visible.Add(Pc2.Panel("terrain"));
        rig.SightFake.Values[Pc2.ReadoutRegion("brushSize")] = 40;
        rig.SightFake.Publish();
        await rig.AdvanceAsync(500);
        Assert.Equal("planet-coaster-2/terrain", rig.Engine.Context.Current.Key);
        await deck.SettleAsync();
        Assert.Equal("terrain.apply", deck.View(new KeySlot(0, 0)).ItemId);
        Assert.Equal("BRUSH SIZE", deck.View(new DialSlot(0, 0)).Label);
        Assert.Equal("edit.undo", deck.View(new KeySlot(2, 0)).ItemId);
        // ...the terrain dials are real keyboard steps (scancode mode)...
        await deck.Dials[new DialSlot(0, 0)].RotateAsync(+2);
        await rig.IdleAsync();
        AssertExtra.Equal(["down:Shift+OemPlus/sc", "up:Shift+OemPlus", "down:Shift+OemPlus/sc", "up:Shift+OemPlus"], rig.KeysSent());

        // ...and the builder comes back exactly as it was (muscle memory).
        Pc2.Builder(rig, bank: 0);
        await rig.AdvanceAsync(500);
        Assert.Equal(console, rig.Engine.LayoutFor(TestDevices.Galleon.Id).Describe());

        deck.AssertDeckSafe();
        Assert.True(rig.Events.Where(e => e.Kind == ContextEventKind.Switched).Select(e => e.To).SequenceEqual(
            ["planet-coaster-2/park", "planet-coaster-2/trackBuilder", "planet-coaster-2/terrain", "planet-coaster-2/trackBuilder"]));
    }
}
