// Cooling tests on the in-repo runner. Extra: --render-previews <dir> writes key/dial previews (see Previews.cs).
var i = Array.IndexOf(args, "--render-previews");
if (i >= 0) return PrismControl.Cooling.Tests.Previews.Write(i + 1 < args.Length ? args[i + 1] : "previews");
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Cooling.Tests.ModuleTests).Assembly);
