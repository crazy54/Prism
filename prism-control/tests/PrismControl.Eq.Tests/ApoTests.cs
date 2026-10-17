using System.Text;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Apo;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>A fake Equalizer APO install in a temp folder (never the real Program Files config).</summary>
public sealed class FakeApoEnvironment : IApoEnvironment, IDisposable
{
    public string Root { get; } = Path.Combine(Path.GetTempPath(), "prism-eq-tests", "apo-" + Guid.NewGuid().ToString("N")[..10]);
    public string ConfigDir => Path.Combine(Root, "config");
    public string DataDir => Path.Combine(Root, "data");
    public bool Installed = true;
    public List<ApoDevice> Devices = [new("{11111111-2222-3333-4444-555555555555}", "Speakers (Example Audio)", EqChannelKind.Playback, true),
                                      new("{66666666-7777-8888-9999-000000000000}", "Headset (Example Ensemble)", EqChannelKind.Playback, true)];

    public FakeApoEnvironment(string? configTxt = null, Encoding? encoding = null)
    {
        Directory.CreateDirectory(ConfigDir);
        if (configTxt is not null) File.WriteAllBytes(MainPath, (encoding ?? new UTF8Encoding(false)).GetPreamble().Concat((encoding ?? new UTF8Encoding(false)).GetBytes(configTxt)).ToArray());
    }

    public string MainPath => Path.Combine(ConfigDir, "config.txt");
    public string IncludePath => Path.Combine(ConfigDir, "prism-control.txt");

    public ApoInstall? FindInstall() => Installed ? new ApoInstall(Root, ConfigDir, "1.4.2") : null;
    public IReadOnlyList<ApoDevice> ListDevices() => Devices;

    public void Dispose() { try { Directory.Delete(Root, true); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
}

public class ApoConfigTests
{
    private const string UserConfig = "Preamp: -3 dB\r\nDevice: Speakers Example\r\nFilter: ON PK Fc 1000 Hz Gain -2.0 dB Q 1.00\r\n# café ünïcode comment\r\nInclude: my-room.txt\r\n";

    [Test]
    public void Attach_prepends_two_lines_and_keeps_every_user_byte_and_the_bom()
    {
        using var env = new FakeApoEnvironment(UserConfig, new UTF8Encoding(true));
        var before = File.ReadAllBytes(env.MainPath);
        Assert.True(ApoConfigFiles.Attach(env.ConfigDir));
        var after = File.ReadAllBytes(env.MainPath);
        Assert.True(after.Take(3).SequenceEqual(new byte[] { 0xEF, 0xBB, 0xBF }), "BOM kept");
        var prefix = Encoding.ASCII.GetBytes(ApoConfigFiles.MarkerLine + "\r\n" + ApoConfigFiles.IncludeLine + "\r\n");
        Assert.True(after.Skip(3).Take(prefix.Length).SequenceEqual(prefix), "our block is first, with the file's CRLF");
        Assert.True(after.Skip(3 + prefix.Length).SequenceEqual(before.Skip(3)), "the user's bytes are untouched");
        Assert.False(ApoConfigFiles.Attach(env.ConfigDir), "attaching twice changes nothing");
        Assert.True(ApoConfigFiles.IsAttached(env.ConfigDir));
        Assert.Empty(Directory.GetFiles(env.ConfigDir, "*.tmp"));
    }

    [Test]
    public void Detach_removes_only_our_lines_and_keeps_lf_endings()
    {
        var lf = UserConfig.Replace("\r\n", "\n");
        using var env = new FakeApoEnvironment(lf);
        ApoConfigFiles.Attach(env.ConfigDir);
        Assert.Contains(ApoConfigFiles.IncludeLine + "\nPreamp", File.ReadAllText(env.MainPath)); // LF file: LF block
        Assert.True(ApoConfigFiles.Detach(env.ConfigDir));
        Assert.Equal(lf, File.ReadAllText(env.MainPath));
        Assert.False(ApoConfigFiles.Detach(env.ConfigDir));
        Assert.False(ApoConfigFiles.IsAttached(env.ConfigDir));
    }

    [Test]
    public void The_include_is_valid_apo_syntax_per_device_and_skips_disabled_bands()
    {
        var bands = new List<EqBand>
        {
            new(1, true, EqFilterType.LowShelf, 105, 4, 0.71),
            new(2, true, EqFilterType.Peaking, 1000, -1.5, 1.41),
            new(3, false, EqFilterType.Peaking, 3000, 6, 1),
            new(4, true, EqFilterType.HighShelf, 8000, 2, 0.71),
            new(5, true, EqFilterType.HighPass, 30, 0, 0.71),
        };
        var text = ApoConfigFiles.Generate([new("{11111111-2222-3333-4444-555555555555}", "Speakers (Example Audio)", true, -4, bands),
                                            new("{66666666-7777-8888-9999-000000000000}", "Headset", false, 0, bands)]);
        Assert.Contains("Device: {11111111-2222-3333-4444-555555555555}\r\nPreamp: -4.0 dB\r\n", text);
        Assert.Contains("Filter 1: ON LSC Fc 105 Hz Gain 4.0 dB Q 0.71\r\n", text);
        Assert.Contains("Filter 2: ON PK Fc 1000 Hz Gain -1.5 dB Q 1.41\r\n", text);
        Assert.Contains("Filter 3: ON HSC Fc 8000 Hz Gain 2.0 dB Q 0.71\r\n", text);
        Assert.Contains("Filter 4: ON HPQ Fc 30 Hz Q 0.71\r\n", text);
        Assert.DoesNotContain("3000 Hz", text);
        Assert.DoesNotContain("Device: {66666666", text); // EQ off: the block is omitted
    }

    [Test]
    public void Parses_autoeq_parametric_files()
    {
        const string autoeq = "Preamp: -6.4 dB\nFilter 1: ON LSC Fc 105 Hz Gain 5.6 dB Q 0.70\nFilter 2: ON PK Fc 2463 Hz Gain -2.1 dB Q 2.37\nFilter 3: OFF PK Fc 5000 Hz Gain 1 dB Q 1\nnonsense line\nFilter 4: ON HSC Fc 10000 Hz Gain -3.4 dB Q 0.70\n";
        var (bands, preamp) = ApoPresets.ParseParametric(autoeq);
        Assert.Equal(-6.4, preamp);
        Assert.Equal(4, bands.Count);
        Assert.Equal(EqFilterType.LowShelf, bands[0].Type);
        Assert.Equal(2463.0, bands[1].FrequencyHz);
        Assert.False(bands[2].Enabled);
        Assert.Equal(-3.4, bands[3].GainDb);
    }
}

public class ApoBackendTests
{
    private static ApoEqBackend Backend(FakeApoEnvironment env, ManualTimeProvider time) => new(env, env.DataDir, NullLog.Instance, time);

    [Test]
    public async Task Reports_not_installed_no_devices_and_not_attached()
    {
        using var env = new FakeApoEnvironment(UserCfg);
        var time = new ManualTimeProvider();
        env.Installed = false;
        await using (var b = Backend(env, time)) Assert.Equal(EqAvailabilityCode.NotInstalled, (await b.ProbeAsync(CancellationToken.None)).Code);
        env.Installed = true;
        var devices = env.Devices;
        env.Devices = [];
        await using (var b = Backend(env, time)) Assert.Equal(EqAvailabilityCode.NoDevices, (await b.ProbeAsync(CancellationToken.None)).Code);
        env.Devices = devices;
        await using (var b = Backend(env, time))
        {
            Assert.Equal(EqAvailabilityCode.NotAttached, (await b.ProbeAsync(CancellationToken.None)).Code);
            await Assert.ThrowsAsync<EqUnavailableException>(() => b.GetStateAsync(devices[0].Guid, TimeSpan.Zero, CancellationToken.None));
        }
        Assert.Equal(UserCfg, File.ReadAllText(env.MainPath)); // probing never writes
        Assert.False(File.Exists(env.IncludePath));
    }

    private const string UserCfg = "Preamp: -2 dB\r\n";

    [Test]
    public async Task Attach_then_edits_regenerate_only_our_file_debounced()
    {
        using var env = new FakeApoEnvironment(UserCfg);
        var time = new ManualTimeProvider();
        await using var b = Backend(env, time);
        await b.AttachAsync(CancellationToken.None);
        Assert.True(b.Availability.Available, b.Availability.Reason);
        var cfgAfterAttach = File.ReadAllText(env.MainPath);
        var dev = env.Devices[0].Guid;
        var s = await b.GetStateAsync(dev, TimeSpan.Zero, CancellationToken.None);
        Assert.Equal(10, s.Bands.Count);
        Assert.Equal("Flat", s.ActivePreset?.Name);

        var writesBefore = b.WritesStarted;
        for (var i = 0; i < 30; i++)
        {
            s = b.SetGain(dev, EqTarget.ForBand(1), EqMath.StepGain(s.Band(1)!.GainDb, 1, 0.5, -30, 30));
            time.Advance(TimeSpan.FromMilliseconds(33));
            await Task.Delay(1);
        }
        time.Advance(TimeSpan.FromMilliseconds(300));
        await b.WhenWritesIdleAsync();
        var writes = b.WritesStarted - writesBefore;
        Assert.InRange(writes, 2, 6);  // ~1 s of spinning: a handful of file writes, not 30
        var include = File.ReadAllText(env.IncludePath);
        Assert.Contains($"Device: {dev}", include);
        Assert.Contains("Filter 1: ON LSC Fc 31 Hz Gain 15.0 dB Q 0.71", include); // 30 ticks x 0.5 dB (APO allows +-30)
        Assert.Contains("Preamp: -", include);         // automatic headroom
        Assert.Equal(cfgAfterAttach, File.ReadAllText(env.MainPath)); // config.txt untouched by edits
        Assert.True(s.ModifiedFromDefault);

        var stamp = File.GetLastWriteTimeUtc(env.IncludePath);
        b.SetGain(dev, EqTarget.ForBand(1), 15); // same value
        time.Advance(TimeSpan.FromMilliseconds(300));
        await b.WhenWritesIdleAsync();
        Assert.Equal(stamp, File.GetLastWriteTimeUtc(env.IncludePath)); // unchanged content: not rewritten
    }

    [Test]
    public async Task Presets_reset_toggle_and_state_survive_a_restart()
    {
        using var env = new FakeApoEnvironment(UserCfg);
        var time = new ManualTimeProvider();
        var dev = env.Devices[1].Guid;
        await using (var b = Backend(env, time))
        {
            await b.AttachAsync(CancellationToken.None);
            await b.GetStateAsync(dev, TimeSpan.Zero, CancellationToken.None);
            var s = await b.SelectPresetAsync(dev, "builtin:bass", CancellationToken.None);
            Assert.Equal("Bass boost", s.ActivePreset?.Name);
            Assert.False(s.ModifiedFromDefault);
            s = b.SetGain(dev, EqTarget.ForBand(1), -3);
            Assert.True(s.ModifiedFromDefault);
            s = b.Reset(dev, EqResetScope.Gain, EqTarget.ForBand(1));
            Assert.Equal(5.0, s.Band(1)!.GainDb); // the preset's value
            s = b.SetEnabled(dev, EqToggleScope.Eq, false);
            Assert.False(s.Enabled);
            await Assert.ThrowsAsync<EqPresetMissingException>(() => b.SelectPresetAsync(dev, "user:gone", CancellationToken.None));
            await b.FlushAsync(CancellationToken.None);
            Assert.DoesNotContain($"Device: {dev}", File.ReadAllText(env.IncludePath)); // off: its block is gone
        }
        await using (var b2 = Backend(env, time))
        {
            await b2.ProbeAsync(CancellationToken.None);
            var s = await b2.GetStateAsync(dev, TimeSpan.Zero, CancellationToken.None);
            Assert.False(s.Enabled);
            Assert.Equal("Bass boost", s.ActivePreset?.Name);
            Assert.True(b2.AttachRequested);
        }
    }

    [Test]
    public async Task Another_app_dropping_our_include_shows_detached_and_we_do_not_reinsert_it()
    {
        using var env = new FakeApoEnvironment(UserCfg);
        var time = new ManualTimeProvider();
        await using var b = Backend(env, time);
        await b.AttachAsync(CancellationToken.None);
        File.WriteAllText(env.MainPath, "Preamp: -1 dB\r\n"); // e.g. a GUI rewrote config.txt
        await b.PollAsync(CancellationToken.None);
        Assert.Equal(EqAvailabilityCode.Detached, b.Availability.Code);
        Assert.Equal("Preamp: -1 dB\r\n", File.ReadAllText(env.MainPath));
        await b.AttachAsync(CancellationToken.None); // the user presses Attach again
        Assert.True(b.Availability.Available);
        Assert.True(File.ReadAllText(env.MainPath).EndsWith("Preamp: -1 dB\r\n", StringComparison.Ordinal));
        await b.DetachAsync(CancellationToken.None);
        Assert.Equal("Preamp: -1 dB\r\n", File.ReadAllText(env.MainPath));
        Assert.Equal(EqAvailabilityCode.NotAttached, b.Availability.Code);
    }

    [Test]
    public async Task User_presets_can_be_saved_and_imported()
    {
        using var env = new FakeApoEnvironment(UserCfg);
        var time = new ManualTimeProvider();
        await using var b = Backend(env, time);
        await b.AttachAsync(CancellationToken.None);
        var dev = env.Devices[0].Guid;
        await b.GetStateAsync(dev, TimeSpan.Zero, CancellationToken.None);
        b.SetGain(dev, EqTarget.ForBand(6), 3);
        var saved = b.SaveUserPreset(dev, "Desk tweak");
        var imported = b.ImportPreset("Example Headphone (AutoEQ)", "Filter 1: ON PK Fc 100 Hz Gain 2 dB Q 1\nFilter 2: ON HSC Fc 9000 Hz Gain -2 dB Q 0.7");
        Assert.NotNull(imported);
        var presets = await b.GetPresetsAsync(dev, TimeSpan.Zero, CancellationToken.None);
        Assert.True(presets.Any(p => p.Id == saved.Id && p.Name == "Desk tweak"));
        var s = await b.SelectPresetAsync(dev, imported!.Id, CancellationToken.None);
        Assert.Equal(2, s.Bands.Count);
        Assert.Null(b.ImportPreset("nothing", "no filters here"));
    }
}
