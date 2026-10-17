using PrismControl.TokensGen;

// Usage: dotnet run --project tools/PrismControl.TokensGen [-- --tokens <tokens.json>] [--out <file>] [--check]
// --check exits 1 if the checked-in file is out of date (no write).
var repo = FindRepoRoot(AppContext.BaseDirectory) ?? FindRepoRoot(Directory.GetCurrentDirectory())
    ?? throw new InvalidOperationException("Run from inside prism-control/ (PrismControl.sln not found).");
string Arg(string name, string fallback)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : fallback;
}
var tokensPath = Path.GetFullPath(Arg("--tokens", Environment.GetEnvironmentVariable("PRISM_TOKENS_JSON") ?? Path.Combine(repo, TokensGenerator.DefaultTokensPath)));
var outPath = Path.GetFullPath(Arg("--out", Path.Combine(repo, TokensGenerator.OutputPath)));
if (!File.Exists(tokensPath))
{
    Console.Error.WriteLine($"tokens.json not found: {tokensPath} (set PRISM_TOKENS_JSON or pass --tokens)");
    return 2;
}
var generated = TokensGenerator.Generate(File.ReadAllText(tokensPath));
if (args.Contains("--check"))
{
    var current = File.Exists(outPath) ? File.ReadAllText(outPath).Replace("\r\n", "\n") : "";
    if (current == generated) { Console.WriteLine("tokens: in sync"); return 0; }
    Console.Error.WriteLine($"tokens: {outPath} is out of date with {tokensPath}; run dotnet run --project tools/PrismControl.TokensGen");
    return 1;
}
Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
File.WriteAllText(outPath, generated);
Console.WriteLine($"wrote {outPath} from {tokensPath}");
return 0;

static string? FindRepoRoot(string start)
{
    for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
        if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
    return null;
}
