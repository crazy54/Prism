// Browser module tests. `-- --render-previews <dir>` writes the key/dial preview pages; `-- --write-icons <dir>` writes
// the action icons (icon/key/dial SVGs) generated from BrowserGlyphs.
var previews = Array.IndexOf(args, "--render-previews");
if (previews >= 0) return await PrismControl.Browser.Tests.Previews.WriteAsync(previews + 1 < args.Length ? args[previews + 1] : "browser-previews");
var icons = Array.IndexOf(args, "--write-icons");
if (icons >= 0) return PrismControl.Browser.Tests.IconWriter.Write(icons + 1 < args.Length ? args[icons + 1] : "imgs");
return await PrismControl.Testing.TestRunner.RunAsync(args, typeof(PrismControl.Browser.Tests.Fx).Assembly);
