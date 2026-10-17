using System.Text.Json.Nodes;
using PrismControl.Core.Devices;

namespace PrismControl.Core.Actions;

/// <summary>An event for one action instance (context). Settings are the raw JSON the app sent.</summary>
public abstract record ActionEvent(string Context, string ActionUuid, string DeviceId)
{
    public JsonObject? RawSettings { get; init; }
}

public sealed record WillAppearEvent(string Context, string ActionUuid, string DeviceId, Controller Controller, Coordinates? Coordinates,
    int? State, bool IsInMultiAction) : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record WillDisappearEvent(string Context, string ActionUuid, string DeviceId, Controller Controller, Coordinates? Coordinates)
    : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record KeyDownEvent(string Context, string ActionUuid, string DeviceId, Coordinates? Coordinates, int? State,
    int? UserDesiredState, bool IsInMultiAction) : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record KeyUpEvent(string Context, string ActionUuid, string DeviceId, Coordinates? Coordinates, int? State,
    int? UserDesiredState, bool IsInMultiAction) : ActionEvent(Context, ActionUuid, DeviceId);

/// <summary>A dial turn. Galleon aggregates fast spins (|Ticks| up to 12); Stream Deck + sends ±1.</summary>
public sealed record DialRotateEvent(string Context, string ActionUuid, string DeviceId, Coordinates Coordinates, int Ticks, bool Pressed)
    : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record DialDownEvent(string Context, string ActionUuid, string DeviceId, Coordinates Coordinates)
    : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record DialUpEvent(string Context, string ActionUuid, string DeviceId, Coordinates Coordinates)
    : ActionEvent(Context, ActionUuid, DeviceId);

/// <summary>Stream Deck + touch strip: tap position in segment-local 200×100 units; Hold = long touch.</summary>
public sealed record TouchTapEvent(string Context, string ActionUuid, string DeviceId, Coordinates Coordinates, int X, int Y, bool Hold)
    : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record DidReceiveSettingsEvent(string Context, string ActionUuid, string DeviceId, Coordinates? Coordinates, int? State,
    bool IsInMultiAction) : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record PropertyInspectorDidAppearEvent(string Context, string ActionUuid, string DeviceId) : ActionEvent(Context, ActionUuid, DeviceId);

public sealed record PropertyInspectorDidDisappearEvent(string Context, string ActionUuid, string DeviceId) : ActionEvent(Context, ActionUuid, DeviceId);

/// <summary>A message from the property inspector (sendToPlugin).</summary>
public sealed record SendToPluginEvent(string Context, string ActionUuid, JsonNode? Payload) : ActionEvent(Context, ActionUuid, "");

public sealed record TitleParametersDidChangeEvent(string Context, string ActionUuid, string DeviceId, string? Title, JsonObject? TitleParameters, int? State)
    : ActionEvent(Context, ActionUuid, DeviceId);
