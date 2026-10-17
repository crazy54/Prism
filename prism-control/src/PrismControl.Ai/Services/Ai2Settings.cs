using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Services;

/// <summary>
/// AI2's global settings section <c>aiservices</c> (lead-approved: AI1's <c>ai</c> section is rewritten whole by its own
/// service, so AI2 keeps its keys apart). Preferences only: never secrets (admin keys live in SecretStore), never prompts or
/// titles. Every paid or account-touching feature is OFF by default and switched on only from a PI button.
/// </summary>
public sealed partial class Ai2Settings
{
    public const string Section = "aiservices";
    public const string DefaultRegion = "us-east-1";

    // ---- provider health (public status pages; reads)

    /// <summary>Status-page poll while a health surface is visible, seconds (clamped 60–900; default 120).</summary>
    public int HealthPollSeconds { get; set; } = 120;
    /// <summary>After a health surface was shown in this run, keep a slow 10-minute background poll (Smart Deck readouts).</summary>
    public bool BackgroundHealth { get; set; } = true;
    /// <summary>The AWS region for Bedrock health and usage. Empty = AWS_REGION / AWS_DEFAULT_REGION, else us-east-1.</summary>
    public string AwsRegion { get; set; } = "";
    /// <summary>US cross-region inference profiles (us.anthropic.*) can run in us-east-1, us-east-2 and us-west-2: watch all three.</summary>
    public bool WatchUsCrossRegion { get; set; } = true;

    // ---- Bedrock usage via CloudWatch (opt-in; the AWS CLI runs it)

    /// <summary>OFF by default. Only the PI's "Turn on Bedrock usage" button sets it.</summary>
    public bool BedrockUsageEnabled { get; set; }
    /// <summary>The AWS CLI profile (a read-only one; this PC uses IAM Identity Center / SSO). A name, never a credential.</summary>
    public string AwsProfile { get; set; } = "";
    /// <summary>Minutes between CloudWatch reads while a Bedrock surface is visible (clamped 5–60; default 5).</summary>
    public int BedrockPollMinutes { get; set; } = 5;

    // ---- admin usage/cost APIs (opt-in; keys in SecretStore)

    public bool AnthropicAdminEnabled { get; set; }
    public bool OpenAiAdminEnabled { get; set; }

    // ---- Ask AI

    /// <summary>Put the user's clipboard back after copying the selection (default on).</summary>
    public bool RestoreClipboard { get; set; } = true;
    /// <summary>While ON AIR, web prefill links (which land in the browser's address bar and history) are blocked unless this is on.</summary>
    public bool WebTargetsOnAir { get; set; }

    [JsonIgnore] public TimeSpan HealthCadence => TimeSpan.FromSeconds(Math.Clamp(HealthPollSeconds, 60, 900));
    [JsonIgnore] public TimeSpan BedrockCadence => TimeSpan.FromMinutes(Math.Clamp(BedrockPollMinutes, 5, 60));

    /// <summary>The region actually used (validated; a malformed value falls back to the default).</summary>
    [JsonIgnore]
    public string Region
    {
        get
        {
            foreach (var candidate in new[] { AwsRegion, Environment.GetEnvironmentVariable("AWS_REGION"), Environment.GetEnvironmentVariable("AWS_DEFAULT_REGION") })
                if (IsRegion(candidate)) return candidate!.Trim().ToLowerInvariant();
            return DefaultRegion;
        }
    }

    /// <summary>The regions whose Bedrock health matters (the user's, plus the US cross-region set when it applies).</summary>
    [JsonIgnore]
    public IReadOnlyList<string> BedrockRegions
    {
        get
        {
            var r = Region;
            if (!WatchUsCrossRegion || !r.StartsWith("us-", StringComparison.Ordinal) || r.StartsWith("us-gov", StringComparison.Ordinal)) return [r];
            return new[] { r, "us-east-1", "us-east-2", "us-west-2" }.Distinct(StringComparer.Ordinal).ToList();
        }
    }

    [JsonIgnore] public string? Profile => IsProfile(AwsProfile) ? AwsProfile.Trim() : null;

    public static bool IsRegion(string? s) => s is not null && RegionPattern().IsMatch(s.Trim());
    public static bool IsProfile(string? s) => s is not null && ProfilePattern().IsMatch(s.Trim());

    [GeneratedRegex(@"^[a-zA-Z]{2}(-gov|-iso[a-z]?)?-[a-zA-Z]+-\d{1,2}$")]
    private static partial Regex RegionPattern();

    [GeneratedRegex(@"^[A-Za-z0-9_.@+\-]{1,64}$")]
    private static partial Regex ProfilePattern();

    public Ai2Settings Clone() => (Ai2Settings)MemberwiseClone();
}

/// <summary>Reads <c>aiservices</c> once per change and hands out an immutable snapshot. Thread-safe.</summary>
public sealed class Ai2SettingsService
{
    private readonly IGlobalSettings? _globals;
    private Ai2Settings _current;

    public Ai2SettingsService(IGlobalSettings? globals)
    {
        _globals = globals;
        _current = Read();
        if (_globals is not null) _globals.Changed += (_, _) => Reload();
    }

    public Ai2SettingsService(Ai2Settings fixedSettings) => _current = fixedSettings;

    public Ai2Settings Current => Volatile.Read(ref _current);

    public event Action<Ai2Settings>? Changed;

    public void Reload()
    {
        var next = Read();
        Volatile.Write(ref _current, next);
        Changed?.Invoke(next);
    }

    /// <summary>Changes the section (PI buttons). Raises <see cref="Changed"/>.</summary>
    public void Update(Action<Ai2Settings> change)
    {
        var next = Current.Clone();
        change(next);
        Volatile.Write(ref _current, next);
        _globals?.SetSection(Ai2Settings.Section, next);
        Changed?.Invoke(next);
    }

    private Ai2Settings Read() => _globals?.GetSection<Ai2Settings>(Ai2Settings.Section) ?? _current ?? new Ai2Settings();
}
