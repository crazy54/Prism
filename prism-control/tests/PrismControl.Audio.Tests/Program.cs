// Runs the Audio tests on the in-repo runner. Extra mode:
//   --render-previews <dir>   writes every audio key/dial state (Night + Day) as SVG plus index.html at real sizes.
if (args.Length >= 2 && args[0] == "--render-previews") return PrismControl.Audio.Tests.AudioPreviews.Write(args[1]);
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Audio.Tests.SampleTests).Assembly);
