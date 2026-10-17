// Spotify tests. `-- --render-previews <dir>` writes the key/dial preview pages instead of running tests.
var previews = Array.IndexOf(args, "--render-previews");
if (previews >= 0) return await PrismControl.Spotify.Tests.Previews.WriteAsync(previews + 1 < args.Length ? args[previews + 1] : "spotify-previews");
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Spotify.Tests.SampleTests).Assembly);
