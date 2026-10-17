var previews = Array.IndexOf(args, "--render-previews");
if (previews >= 0)
    return PrismControl.Macros.Tests.MacroPreviews.Write(previews + 1 < args.Length ? args[previews + 1] : "previews");
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Macros.Tests.SampleTests).Assembly);
