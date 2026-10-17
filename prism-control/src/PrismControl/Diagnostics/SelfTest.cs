using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Core.Security;
using PrismControl.Hosting;

namespace PrismControl;

/// <summary>
/// <c>PrismControl.exe --selftest</c>: proves the published exe's interop works (classic [ComImport] COM, CsWinRT
/// projections, DPAPI P/Invoke) and that modules and actions load. Read-only: it changes nothing on the PC.
/// Run against every publish flavor (the E2E tests do), especially after enabling trimming.
/// </summary>
internal static partial class SelfTest
{
    public static async Task<JsonObject> RunAsync()
    {
        var checks = new JsonArray();
        var ok = true;

        void Add(string name, Func<string> check)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var detail = check();
                checks.Add((JsonNode)new JsonObject { ["name"] = name, ["ok"] = true, ["detail"] = detail, ["ms"] = sw.ElapsedMilliseconds });
            }
            catch (Exception ex)
            {
                ok = false;
                checks.Add((JsonNode)new JsonObject { ["name"] = name, ["ok"] = false, ["error"] = $"{ex.GetType().Name}: {ex.Message}", ["ms"] = sw.ElapsedMilliseconds });
            }
        }

        async Task AddAsync(string name, Func<Task<string>> check)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var detail = await check().WaitAsync(TimeSpan.FromSeconds(10));
                checks.Add((JsonNode)new JsonObject { ["name"] = name, ["ok"] = true, ["detail"] = detail, ["ms"] = sw.ElapsedMilliseconds });
            }
            catch (Exception ex)
            {
                ok = false;
                checks.Add((JsonNode)new JsonObject { ["name"] = name, ["ok"] = false, ["error"] = $"{ex.GetType().Name}: {ex.Message}", ["ms"] = sw.ElapsedMilliseconds });
            }
        }

        Add("com.mmdevice-enumerator", () =>
        {
            // CoCreateInstance(MMDeviceEnumerator) + EnumAudioEndpoints(eAll, ACTIVE) + GetCount. Read-only.
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            try
            {
                Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(2 /* eAll */, 1 /* DEVICE_STATE_ACTIVE */, out var collection));
                try
                {
                    Marshal.ThrowExceptionForHR(collection.GetCount(out var count));
                    return $"{count} active audio endpoint(s)";
                }
                finally { Marshal.ReleaseComObject(collection); }
            }
            finally { Marshal.ReleaseComObject(enumerator); }
        });

        Add("com.source-generated", () =>
        {
            // The same enumerator through [GeneratedComInterface] + StrategyBasedComWrappers (trim/AOT-safe COM).
            var clsid = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
            var iid = typeof(IMMDeviceEnumeratorGen).GUID;
            Marshal.ThrowExceptionForHR(CoCreateInstance(clsid, IntPtr.Zero, 0x17 /* CLSCTX_ALL */, iid, out var ptr));
            var wrappers = new StrategyBasedComWrappers();
            var enumerator = (IMMDeviceEnumeratorGen)wrappers.GetOrCreateObjectForComInstance(ptr, CreateObjectFlags.None);
            Marshal.Release(ptr);
            Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(2, 1, out var collection));
            Marshal.ThrowExceptionForHR(collection.GetCount(out var count));
            return $"{count} active audio endpoint(s)";
        });

        Add("winrt.activation", () =>
        {
            // Windows.Data.Json is a plain WinRT runtime class (activation + method calls through the projection).
            var json = Windows.Data.Json.JsonObject.Parse("{\"prism\": 42}");
            return $"Windows.Data.Json.JsonObject prism={json.GetNamedNumber("prism")}";
        });

        await AddAsync("winrt.smtc", async () =>
        {
            var manager = await Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            return $"{manager.GetSessions().Count} media session(s)";
        });

        Add("dpapi.roundtrip", () =>
        {
            var blob = Dpapi.ProtectString("prism-selftest", "prismcontrol/selftest");
            var back = Dpapi.UnprotectString(blob, "prismcontrol/selftest");
            if (back != "prism-selftest") throw new InvalidOperationException("round-trip mismatch");
            try
            {
                Dpapi.UnprotectString(blob, "wrong-purpose");
                throw new InvalidOperationException("wrong entropy was accepted");
            }
            catch (System.Security.Cryptography.CryptographicException) { }
            return $"{blob.Length}-byte blob, wrong entropy rejected";
        });

        Add("userdir.writable", () =>
        {
            var dir = PluginPaths.UserDirectory;
            Directory.CreateDirectory(dir);
            var probe = Path.Combine(dir, $".selftest-{Environment.ProcessId}.tmp");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return dir;
        });

        Add("modules.actions", () =>
        {
            var errors = new List<string>();
            var warnings = new List<string>();
            var modules = ModuleLoader.Load(NullLog.Instance, errors);
            var registry = ActionRegistry.Discover(modules.Select(m => m.Assembly).Append(typeof(PluginInfo).Assembly), errors, warnings);
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("; ", errors));
            return $"{modules.Count} module(s), {registry.Actions.Count} action(s)";
        });

        return new JsonObject
        {
            ["ok"] = ok,
            ["version"] = PluginInfo.ManifestVersion,
            ["runtime"] = RuntimeInformation.FrameworkDescription,
            ["os"] = RuntimeInformation.OSDescription,
            // In the single-file publish the managed assemblies are bundled into the exe, so none sits beside it.
            ["singleFile"] = !File.Exists(Path.Combine(AppContext.BaseDirectory, "PrismControl.dll")),
            ["checks"] = checks,
        };
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject;

    [LibraryImport("ole32.dll")]
    private static partial int CoCreateInstance(in Guid clsid, IntPtr outer, uint context, in Guid iid, out IntPtr instance);

    [GeneratedComInterface, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    internal partial interface IMMDeviceEnumeratorGen
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollectionGen devices);
    }

    [GeneratedComInterface, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
    internal partial interface IMMDeviceCollectionGen
    {
        [PreserveSig] int GetCount(out uint count);
    }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
    }
}
