using System.Diagnostics;
using System.Reflection;
using System.Runtime.ExceptionServices;

namespace PrismControl.Testing;

/// <summary>Marks a test: a public instance or static method, void or Task, no parameters.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class TestAttribute : Attribute
{
    /// <summary>"unit" (default), "integration" or "e2e". Select with --category / --exclude.</summary>
    public string Category { get; set; } = "unit";
    public int TimeoutMs { get; set; } = 30_000;
    /// <summary>Non-null skips the test with this reason.</summary>
    public string? Skip { get; set; }
}

public sealed class SkipException(string reason) : Exception(reason);

public sealed class AssertException(string message) : Exception(message);

/// <summary>Plain assertions. Failures throw <see cref="AssertException"/>.</summary>
public static class Assert
{
    public static void True(bool condition, string? message = null) { if (!condition) throw new AssertException(message ?? "expected true"); }
    public static void False(bool condition, string? message = null) { if (condition) throw new AssertException(message ?? "expected false"); }

    public static void Equal<T>(T expected, T actual, string? message = null)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            throw new AssertException($"{(message is null ? "" : message + ": ")}expected <{expected}> but got <{actual}>");
    }

    public static void NotEqual<T>(T notExpected, T actual, string? message = null)
    {
        if (EqualityComparer<T>.Default.Equals(notExpected, actual))
            throw new AssertException($"{(message is null ? "" : message + ": ")}did not expect <{actual}>");
    }

    public static void Near(double expected, double actual, double tolerance, string? message = null)
    {
        if (Math.Abs(expected - actual) > tolerance)
            throw new AssertException($"{(message is null ? "" : message + ": ")}expected {expected} ± {tolerance} but got {actual}");
    }

    public static void InRange(double value, double min, double max, string? message = null)
    {
        if (value < min || value > max) throw new AssertException($"{(message is null ? "" : message + ": ")}{value} is not in [{min}, {max}]");
    }

    public static T NotNull<T>(T? value, string? message = null) where T : class =>
        value ?? throw new AssertException(message ?? "expected a value, got null");

    public static void Null(object? value, string? message = null) { if (value is not null) throw new AssertException(message ?? $"expected null, got {value}"); }

    public static void Contains(string expectedSubstring, string? actual, string? message = null)
    {
        if (actual is null || !actual.Contains(expectedSubstring, StringComparison.Ordinal))
            throw new AssertException($"{(message is null ? "" : message + ": ")}expected to contain \"{expectedSubstring}\" in \"{Trim(actual)}\"");
    }

    public static void DoesNotContain(string unexpected, string? actual, string? message = null)
    {
        if (actual is not null && actual.Contains(unexpected, StringComparison.Ordinal))
            throw new AssertException($"{(message is null ? "" : message + ": ")}did not expect \"{unexpected}\" in \"{Trim(actual)}\"");
    }

    public static void Empty<T>(IEnumerable<T> items, string? message = null)
    {
        var list = items.ToList();
        if (list.Count > 0) throw new AssertException($"{(message is null ? "" : message + ": ")}expected empty, got {list.Count}: {string.Join(" | ", list.Take(5))}");
    }

    public static T Single<T>(IEnumerable<T> items, string? message = null)
    {
        var list = items.ToList();
        if (list.Count != 1) throw new AssertException($"{(message is null ? "" : message + ": ")}expected exactly one item, got {list.Count}");
        return list[0];
    }

    public static TException Throws<TException>(Action action) where TException : Exception
    {
        try { action(); }
        catch (TException ex) { return ex; }
        catch (Exception ex) { throw new AssertException($"expected {typeof(TException).Name}, got {ex.GetType().Name}: {ex.Message}"); }
        throw new AssertException($"expected {typeof(TException).Name}, nothing was thrown");
    }

    public static async Task<TException> ThrowsAsync<TException>(Func<Task> action) where TException : Exception
    {
        try { await action(); }
        catch (TException ex) { return ex; }
        catch (Exception ex) { throw new AssertException($"expected {typeof(TException).Name}, got {ex.GetType().Name}: {ex.Message}"); }
        throw new AssertException($"expected {typeof(TException).Name}, nothing was thrown");
    }

    public static void Fail(string message) => throw new AssertException(message);
    public static void Skip(string reason) => throw new SkipException(reason);

    private static string Trim(string? s) => s is null ? "null" : s.Length > 300 ? s[..300] + "…" : s;
}

/// <summary>
/// Discovers [Test] methods and runs them sequentially (deterministic, and the E2E tests own processes and ports).
/// Arguments: --filter &lt;substring&gt;, --category &lt;a,b&gt;, --exclude &lt;a,b&gt;, --list, --verbose.
/// Exit code 0 = all selected tests passed (skips do not fail).
/// </summary>
public static class TestRunner
{
    public static async Task<int> RunAsync(string[] args, params Assembly[] assemblies)
    {
        string? Opt(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
        var filter = Opt("--filter");
        var include = Opt("--category")?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var exclude = Opt("--exclude")?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
        var verbose = args.Contains("--verbose");

        var tests = assemblies.SelectMany(a => a.GetTypes())
            .Where(t => t.IsPublic && t.IsClass)
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
                .Select(m => (Type: t, Method: m, Attr: m.GetCustomAttribute<TestAttribute>())))
            .Where(x => x.Attr is not null)
            .Select(x => (x.Type, x.Method, Attr: x.Attr!, Name: $"{x.Type.Name}.{x.Method.Name}"))
            .Where(x => filter is null || x.Name.Contains(filter, StringComparison.OrdinalIgnoreCase))
            .Where(x => (include is null || include.Contains(x.Attr.Category)) && !exclude.Contains(x.Attr.Category))
            .OrderBy(x => x.Name, StringComparer.Ordinal)
            .ToList();

        if (args.Contains("--list"))
        {
            foreach (var t in tests) Console.WriteLine($"{t.Attr.Category,-12} {t.Name}");
            return 0;
        }

        int passed = 0, failed = 0, skipped = 0;
        var failures = new List<string>();
        var total = Stopwatch.StartNew();
        foreach (var t in tests)
        {
            if (t.Attr.Skip is { } why)
            {
                skipped++;
                Console.WriteLine($"SKIP {t.Name} ({why})");
                continue;
            }
            var sw = Stopwatch.StartNew();
            try
            {
                await RunOneAsync(t.Type, t.Method, t.Attr.TimeoutMs);
                passed++;
                Console.WriteLine($"PASS {t.Name} ({sw.ElapsedMilliseconds} ms)");
            }
            catch (SkipException ex)
            {
                skipped++;
                Console.WriteLine($"SKIP {t.Name} ({ex.Message})");
            }
            catch (Exception ex)
            {
                failed++;
                var msg = ex is AssertException or TimeoutException ? ex.Message : ex.ToString();
                failures.Add($"{t.Name}: {msg}");
                Console.WriteLine($"FAIL {t.Name} ({sw.ElapsedMilliseconds} ms)\n     {msg.Replace("\n", "\n     ")}");
                if (verbose && ex is AssertException) Console.WriteLine("     " + ex.StackTrace?.Replace("\n", "\n     "));
            }
        }
        Console.WriteLine();
        Console.WriteLine($"{passed} passed, {failed} failed, {skipped} skipped ({total.Elapsed.TotalSeconds:0.0} s)");
        foreach (var f in failures) Console.WriteLine("  FAILED " + f.Split('\n')[0]);
        return failed == 0 ? 0 : 1;
    }

    private static async Task RunOneAsync(Type type, MethodInfo method, int timeoutMs)
    {
        var instance = method.IsStatic ? null : Activator.CreateInstance(type);
        try
        {
            var run = Task.Run(async () =>
            {
                try
                {
                    var result = method.Invoke(instance, null);
                    if (result is Task task) await task;
                }
                catch (TargetInvocationException tie) when (tie.InnerException is not null)
                {
                    ExceptionDispatchInfo.Capture(tie.InnerException).Throw();
                }
            });
            if (await Task.WhenAny(run, Task.Delay(timeoutMs)) != run) throw new TimeoutException($"timed out after {timeoutMs} ms");
            await run;
        }
        finally
        {
            if (instance is IAsyncDisposable ad) await ad.DisposeAsync();
            else if (instance is IDisposable d) d.Dispose();
        }
    }
}
