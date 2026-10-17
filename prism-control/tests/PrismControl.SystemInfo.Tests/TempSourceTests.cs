using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

public class TempSourceTests
{
    [Test]
    public void Cpu_temp_source_maps_provider_names_to_stable_api_ids()
    {
        Assert.Equal("lhm", TelemetryFrame.ApiTempSource("LibreHardwareMonitor"));
        Assert.Equal("hwinfo", TelemetryFrame.ApiTempSource("HWiNFO"));
        Assert.Equal("icue", TelemetryFrame.ApiTempSource("iCUE"));
        Assert.Equal("icue", TelemetryFrame.ApiTempSource(" iCUE (Cooling) "));
        Assert.True(TelemetryFrame.ApiTempSource(null) is null);
        Assert.True(TelemetryFrame.ApiTempSource("") is null);
    }

    [Test]
    public void Snapshot_reports_the_source_only_with_a_reading()
    {
        var withTemp = new TelemetryFrame { Cpu = new CpuFrame { TempC = 61.94, TempSource = "iCUE" } }.ToSnapshot();
        Assert.Equal(61.9, withTemp.Cpu!.TempC);
        Assert.Equal("icue", withTemp.Cpu.TempSource);

        var without = new TelemetryFrame { Cpu = new CpuFrame { TempC = null, TempSource = "iCUE" } }.ToSnapshot();
        Assert.True(without.Cpu!.TempSource is null);
    }
}
