if (args.Length >= 2 && args[0] == "--render-previews") return PrismControl.SystemInfo.Tests.Previews.Write(args[1]);
if (args.Length >= 2 && args[0] == "--render-live") return await PrismControl.SystemInfo.Tests.Previews.WriteLiveAsync(args[1]);
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.SystemInfo.Tests.SampleTests).Assembly);
