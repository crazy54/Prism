using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Smart.Profiles;

namespace PrismControl.Smart.Control;

/// <summary>
/// SD2's property-inspector messages, shared by the Smart Key and Smart Dial PIs:
/// <list type="bullet">
/// <item><c>smart.setup.info</c> / <c>smart.setup.create {device, pins}</c> / <c>smart.setup.reveal</c>: the one-profile wizard
/// (writes a file the user double-clicks; never installs it);</item>
/// <item><c>smart.ai.status</c> / <c>smart.ai.deny</c> / <c>smart.ai.revoke</c>: the AI preferences channel ("Allow AI
/// preferences" itself is the global field <c>global:smartai.allowAi</c>);</item>
/// <item><c>smart.review.list</c> / <c>smart.review.approve {pack, id}</c> / <c>smart.review.reject {pack, id}</c>: the AI
/// binding proposals waiting for the user (REVIEW). Only the PI (the Stream Deck app) can send these; the AI pipe has no
/// operation for them.</item>
/// </list>
/// </summary>
public sealed class SmartPiExtras(ProfileWizard wizard, PairingService pairing, ChangeLog log, SmartControlChannel channel, Func<bool> allowAi, bool safeMode, SmartOps? ops = null)
{
    private string? _lastCreated;

    public ProfileWizard Wizard => wizard;

    /// <summary>Handles an SD2 message (null = not one of ours). <paramref name="device"/> is the deck the PI belongs to.</summary>
    public Task<object?>? Handle(string type, JsonNode? data, DeviceInfo device) => type switch
    {
        "smart.setup.info" => Task.FromResult<object?>(wizard.Describe(ProfileDevices.For(device)?.Kind)),
        "smart.setup.create" => Task.FromResult<object?>(Create(data)),
        "smart.setup.reveal" => Task.FromResult<object?>(new { ok = Reveal() }),
        "smart.ai.status" => Task.FromResult<object?>(Status()),
        "smart.ai.deny" => Task.FromResult<object?>(new { ok = pairing.Deny(), status = Status() }),
        "smart.ai.revoke" => Task.FromResult<object?>(new { ok = pairing.Revoke("revoked in the property inspector"), status = Status() }),
        "smart.review.list" => Task.FromResult<object?>(Reviews()),
        "smart.review.approve" => Task.FromResult<object?>(Review(data, approve: true)),
        "smart.review.reject" => Task.FromResult<object?>(Review(data, approve: false)),
        _ => null,
    };

    private object Reviews() => (ops?.PendingReviews() ?? Array.Empty<SmartOps.PendingReview>()).Select(r => new { pack = r.Pack, id = r.Verb, label = r.Label, current = r.Current, chord = r.Chord, client = r.Client, at = r.At }).ToArray();

    private object Review(JsonNode? data, bool approve)
    {
        var pack = data?["pack"] is JsonValue pv && pv.TryGetValue<string>(out var ps) ? ps : null;
        var id = data?["id"] is JsonValue iv && iv.TryGetValue<string>(out var ids) ? ids : null;
        if (ops is null || pack is null || id is null) return new { ok = false, error = "pack and id are required", reviews = Reviews() };
        var error = approve ? ops.ApproveReview(pack, id, "property inspector") : ops.RejectReview(pack, id, "property inspector");
        return new { ok = error is null, error, reviews = Reviews() };
    }

    private object Create(JsonNode? data)
    {
        var r = wizard.Create(data);
        if (r.Written) _lastCreated = r.Path;
        return new
        {
            ok = r.Ok, written = r.Written, file = r.DisplayPath, message = r.Message, problems = r.Problems,
            name = r.Profile?.Name, smartKeys = r.Profile?.SmartKeys, smartDials = r.Profile?.SmartDials,
        };
    }

    /// <summary>Shows the last created file in Explorer (selected). Only that file, never a path from the PI; nothing in safe mode.</summary>
    private bool Reveal()
    {
        var path = _lastCreated;
        if (safeMode || path is null || !File.Exists(path)) return false;
        return ProcessLauncher.Start("explorer.exe", $"/select,\"{path}\"", useShellExecute: false) is not null;
    }

    /// <summary>"14:03:05 prefs.set · Example Assistant · changed: labelSize, dialCategories" (UTC time of day).</summary>
    public static string Line(JsonObject e)
    {
        var at = (string?)e["at"] is { Length: >= 19 } a ? a[11..19] : "";
        var parts = new List<string> { $"{at} {(string?)e["kind"]}".Trim() };
        if ((string?)e["client"] is { } c) parts.Add(c);
        if (e["detail"] is JsonObject d)
            foreach (var (k, v) in d)
            {
                var value = v switch
                {
                    JsonArray arr => string.Join(", ", arr.Select(x => x is JsonValue xv ? xv.ToString() : x?.ToJsonString())),
                    JsonValue jv => jv.ToString(),
                    null => "",
                    _ => v.ToJsonString(),
                };
                if (value.Length > 0) parts.Add($"{k}: {value}");
            }
        return string.Join(" · ", parts);
    }

    public object Status()
    {
        var p = pairing.Pending;
        return new
        {
            allowAi = allowAi(),
            running = channel.Running,
            paired = pairing.IsPaired,
            client = pairing.PairedClient,
            pending = p is null ? null : new { code = p.Code, client = p.Client, expiresAt = p.ExpiresAt.ToString("HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture) },
            undoDepth = log.UndoDepth,
            audit = log.RecentAudit(8).Select(Line).ToArray(),
            reviews = Reviews(),
            safeMode,
        };
    }
}
