using PrismControl.FakeHost;
using PrismControl.Tools;

// prismctl — Prism Control build/dev tool.
//   validate  --plugin <dir.sdPlugin>                    manifest + layouts against the Elgato schemas, files, cross-refs
//   validate-layout <file.json>...                       one or more layout files
//   pack      --exe <PrismControl.exe> [--out dist] [--version x.y.z.w]
//   fake-host --exe <PrismControl.exe> [--device galleon|plus|both] [--action <uuid>]... [--gated] [--allow-real-actions] [--seconds 5] [--demo] [--user-dir <dir>]
//             Always runs the plugin in safe mode (PRISM_CONTROL_SAFE_MODE=1, PRISM_CONTROL_MACROS_DRY_RUN=1). Without --action it
//             places only the sample and diagnostics actions; any other --action also needs --allow-real-actions.
var repo = FindRepoRoot(Directory.GetCurrentDirectory()) ?? FindRepoRoot(AppContext.BaseDirectory);
if (args.Length == 0) return Usage();
switch (args[0])
{
    case "validate":
    {
        var dir = Opt("--plugin") ?? (repo is null ? null : Path.Combine(repo, "dist", Packer.PluginUuid + ".sdPlugin"));
        if (dir is null || !Directory.Exists(dir)) { Console.Error.WriteLine("plugin folder not found; pass --plugin <dir>"); return 2; }
        var problems = PluginValidator.ValidatePlugin(dir);
        foreach (var p in problems) Console.Error.WriteLine("  " + p);
        Console.WriteLine(problems.Count == 0 ? $"valid: {dir}" : $"{problems.Count} problem(s) in {dir}");
        return problems.Count == 0 ? 0 : 1;
    }
    case "validate-layout":
    {
        var failed = 0;
        foreach (var f in args.Skip(1))
        {
            var problems = PluginValidator.ValidateLayoutFile(f);
            Console.WriteLine(problems.Count == 0 ? $"valid: {f}" : $"{f}:\n  " + string.Join("\n  ", problems));
            if (problems.Count > 0) failed++;
        }
        return failed == 0 ? 0 : 1;
    }
    case "pack":
    {
        if (repo is null) { Console.Error.WriteLine("run inside prism-control/"); return 2; }
        var exe = Opt("--exe") ?? Path.Combine(repo, "artifacts", "publish", "PrismControl.exe");
        if (!File.Exists(exe)) { Console.Error.WriteLine($"exe not found: {exe} (publish first: tools/build.ps1)"); return 2; }
        var outDir = Path.GetFullPath(Opt("--out") ?? Path.Combine(repo, "dist"));
        Directory.CreateDirectory(outDir);
        var r = Packer.Pack(repo, exe, outDir, Opt("--version"), Console.Out);
        foreach (var p in r.Problems) Console.Error.WriteLine("  " + p);
        Console.WriteLine($"plugin: {r.PluginDir}");
        Console.WriteLine($"bundle: {r.BundlePath} ({r.BundleBytes / 1048576.0:0.0} MB; exe {r.ExeBytes / 1048576.0:0.0} MB)");
        Console.WriteLine(r.Problems.Count == 0 ? "manifest and layouts: valid" : $"{r.Problems.Count} problem(s)");
        return r.Problems.Count == 0 ? 0 : 1;
    }
    case "fake-host":
    {
        var result = await FakeHostCli.RunAsync(new FakeHostCliOptions
        {
            Exe = Opt("--exe") ?? (repo is null ? "" : Path.Combine(repo, "dist", Packer.PluginUuid + ".sdPlugin", "bin", "PrismControl.exe")),
            Device = Opt("--device") ?? "both",
            Actions = Opts("--action"),
            AllowRealActions = args.Contains("--allow-real-actions"),
            Gated = args.Contains("--gated"),
            Seconds = double.TryParse(Opt("--seconds"), System.Globalization.CultureInfo.InvariantCulture, out var s) ? s : 5,
            Demo = args.Contains("--demo"),
            UserDir = Opt("--user-dir"),
        }, Console.Out, Console.Error);
        return result.ExitCode;
    }
    default:
        return Usage();
}

string? Opt(string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

// Every value of a repeatable option; "a,b" counts as two.
List<string> Opts(string name)
{
    var list = new List<string>();
    for (var i = 0; i + 1 < args.Length; i++)
        if (args[i] == name) list.AddRange(args[i + 1].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    return list;
}

static int Usage()
{
    Console.Error.WriteLine("""
        prismctl validate [--plugin <dir.sdPlugin>]
        prismctl validate-layout <layout.json>...
        prismctl pack [--exe <PrismControl.exe>] [--out dist] [--version x.y.z.w]
        prismctl fake-host [--exe <PrismControl.exe>] [--device galleon|plus|both] [--action <uuid>]... [--gated] [--allow-real-actions] [--seconds 5] [--demo] [--user-dir <dir>]
          safe mode always; default placement = sample + diagnostics actions; --gated adds every real action whose module gates
          its writes on safe mode; any other --action UUID needs --allow-real-actions
        """);
    return 2;
}

static string? FindRepoRoot(string start)
{
    for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
        if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
    return null;
}
