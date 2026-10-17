// dotnet run --project tests/PrismControl.Eq.Tests [-- --filter Name | --category integration | --render-previews <dir>]
var i = Array.IndexOf(args, "--render-previews");
if (i >= 0 && i + 1 < args.Length) return PrismControl.Eq.Tests.EqPreviews.Write(args[i + 1]);
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Eq.Tests.SampleTests).Assembly);
