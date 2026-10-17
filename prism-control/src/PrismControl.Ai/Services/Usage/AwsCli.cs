using System.Diagnostics;
using System.Text;

namespace PrismControl.Ai.Services.Usage;

/// <summary>Why an AWS CLI call failed, from its error text (classified at once; the text itself is never kept or logged).</summary>
public enum AwsCliProblem { None, SignInNeeded, ProfileNotFound, AccessDenied, Throttled, Other }

public sealed record AwsCliResult(bool Started, int? ExitCode, string StdOut, AwsCliProblem Problem, bool TimedOut)
{
    public bool Ok => Started && !TimedOut && ExitCode == 0;
    public static AwsCliResult NotStarted { get; } = new(false, null, "", AwsCliProblem.None, false);
}

/// <summary>
/// The user's own AWS CLI (it does the SSO refresh; Prism never reads ~/.aws/credentials, the SSO cache or any key).
/// Tests use a fake: no AWS CLI ever runs in tests.
/// </summary>
public interface IAwsCli
{
    /// <summary>The aws.exe path, or null when the CLI isn't installed. No process is started.</summary>
    string? Locate();
    Task<AwsCliResult> RunAsync(IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct);
}

/// <summary>
/// Runs <c>aws.exe</c> with an argument list (no shell), no window, stdin closed, the pager and auto-prompt off, so it can
/// never prompt. stdout is capped; stderr is read only to classify the failure (sign-in needed, no such profile, access denied,
/// throttled) and then dropped.
/// </summary>
public sealed class AwsCliRunner : IAwsCli
{
    public const int MaxStdOut = 1 << 20;
    public const int MaxStdErr = 16 * 1024;

    public string? Locate()
    {
        var candidates = new List<string>();
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try { candidates.Add(Path.Combine(dir.Trim().Trim('"'), "aws.exe")); } catch (ArgumentException) { }
        }
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Amazon", "AWSCLIV2", "aws.exe"));
        return candidates.FirstOrDefault(File.Exists);
    }

    public async Task<AwsCliResult> RunAsync(IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct)
    {
        if (Locate() is not { } aws) return AwsCliResult.NotStarted;
        var psi = new ProcessStartInfo(aws)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetTempPath(),
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        psi.Environment["AWS_PAGER"] = "";
        psi.Environment["AWS_CLI_AUTO_PROMPT"] = "off";
        foreach (var key in psi.Environment.Keys.Where(k => k.StartsWith("QT_", StringComparison.OrdinalIgnoreCase)).ToList()) psi.Environment.Remove(key);
        Process? p = null;
        try
        {
            p = Process.Start(psi);
            if (p is null) return AwsCliResult.NotStarted;
            p.StandardInput.Close();
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeout);
            var stdout = ReadCappedAsync(p.StandardOutput, MaxStdOut, cts.Token);
            var stderr = ReadCappedAsync(p.StandardError, MaxStdErr, cts.Token);
            try
            {
                await p.WaitForExitAsync(cts.Token).ConfigureAwait(false);
                var output = await stdout.ConfigureAwait(false);
                var error = await stderr.ConfigureAwait(false);
                var problem = p.ExitCode == 0 ? AwsCliProblem.None : Classify(error, p.ExitCode);
                return new AwsCliResult(true, p.ExitCode, output, problem, false);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                try { p.Kill(entireProcessTree: true); } catch (Exception) { }
                return new AwsCliResult(true, null, "", AwsCliProblem.Other, true);
            }
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            return AwsCliResult.NotStarted;
        }
        finally
        {
            if (p is not null && !p.HasExited) { try { p.Kill(entireProcessTree: true); } catch (Exception) { } }
            p?.Dispose();
        }
    }

    /// <summary>Maps the CLI's error text to a problem. Public for tests; the text never leaves this method.</summary>
    public static AwsCliProblem Classify(string? stderr, int exitCode)
    {
        var e = stderr ?? "";
        bool Has(string s) => e.Contains(s, StringComparison.OrdinalIgnoreCase);
        if (Has("could not be found") && Has("profile")) return AwsCliProblem.ProfileNotFound;
        if (Has("sso") && (Has("expired") || Has("login") || Has("invalid") || Has("refresh"))) return AwsCliProblem.SignInNeeded;
        if (Has("Unable to locate credentials") || Has("NoCredentials") || Has("ExpiredToken") || Has("token has expired") || Has("UnauthorizedSSOToken"))
            return AwsCliProblem.SignInNeeded;
        if (Has("AccessDenied") || Has("not authorized to perform") || Has("UnauthorizedOperation")) return AwsCliProblem.AccessDenied;
        if (Has("Throttling") || Has("Rate exceeded") || Has("TooManyRequests")) return AwsCliProblem.Throttled;
        return exitCode == 253 ? AwsCliProblem.ProfileNotFound : AwsCliProblem.Other;
    }

    private static async Task<string> ReadCappedAsync(StreamReader reader, int cap, CancellationToken ct)
    {
        var sb = new StringBuilder();
        var buf = new char[8192];
        int n;
        while ((n = await reader.ReadAsync(buf.AsMemory(), ct).ConfigureAwait(false)) > 0)
        {
            if (sb.Length < cap) sb.Append(buf, 0, Math.Min(n, cap - sb.Length));
        }
        return sb.ToString();
    }
}
