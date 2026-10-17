using PrismControl.WinShell.Tests;

if (args.Length >= 2 && args[0] == "--render-previews") return await Previews.WriteAsync(args[1]);
if (args.Length >= 2 && args[0] == "--write-icons") return IconWriter.Write(args[1]);
if (args.Length >= 1 && args[0] == "--bench-thumbnails") return await Bench.RunAsync(args.Length >= 2 ? int.Parse(args[1]) : 30);
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(OwnWindow).Assembly);
