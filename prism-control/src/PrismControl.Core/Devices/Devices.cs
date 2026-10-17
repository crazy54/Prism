namespace PrismControl.Core.Devices;

/// <summary>Stream Deck DeviceType values (SDK enum 0-13; 14 = "MCP Deck", seen locally but undocumented).</summary>
public enum DeviceType
{
    Unknown = -1,
    StreamDeck = 0,
    Mini = 1,
    XL = 2,
    Mobile = 3,
    CorsairGKeys = 4,
    Pedal = 5,
    CorsairVoyager = 6,
    Plus = 7,
    ScufController = 8,
    Neo = 9,
    Studio = 10,
    Virtual = 11,
    Galleon100SD = 12,
    PlusXL = 13,
    McpDeck = 14,
}

/// <summary>Which controller an action instance lives on.</summary>
public enum Controller
{
    Keypad,
    /// <summary>A dial (Stream Deck +) or a screen widget + dial layer (Galleon 100 SD).</summary>
    Encoder,
}

public readonly record struct Coordinates(int Column, int Row)
{
    public override string ToString() => $"{Column},{Row}";
}

/// <summary>Where an Encoder instance shows on the Galleon 100 SD's 720×384 screen (2×2 widgets, all visible at once).</summary>
public enum ScreenQuadrant { TopLeft, BottomLeft, TopRight, BottomRight }

/// <summary>
/// Hardware facts per device type, from the hardware lab (RESULTS.md) and the SDK docs.
/// Use these instead of hard-coding device checks in actions.
/// </summary>
public sealed record DeviceCapabilities
{
    /// <summary>Encoder action slots (Stream Deck + = 4 dials; Galleon = 2 dials × 2 layers = 4 widgets).</summary>
    public int EncoderSlots { get; init; }
    public int PhysicalDials { get; init; }
    /// <summary>Galleon: 2 (the ~4 s dial hold switches layers and never reaches plugins). Others: 1.</summary>
    public int DialLayers { get; init; } = 1;
    /// <summary>touchTap events exist (Stream Deck + / + XL only; swipes never reach plugins).</summary>
    public bool HasTouchStrip { get; init; }
    /// <summary>Whether a dial long-press can be a gesture. FALSE on Galleon: its hold is consumed by the device.</summary>
    public bool SupportsDialLongPress { get; init; }
    /// <summary>Largest |ticks| seen per dialRotate (Galleon aggregates fast spins up to ±12; Stream Deck + sends ±1).</summary>
    public int MaxTicksPerEvent { get; init; } = 1;
    /// <summary>Native key raster in px (approximate where unverified; Galleon is reported as 160).</summary>
    public int KeyPixels { get; init; } = 72;
    /// <summary>Encoder pixmap canvas (layouts are 200×100 on every encoder device; Galleon scales it uniformly to ~360×180).</summary>
    public int EncoderCanvasWidth { get; init; } = 200;
    public int EncoderCanvasHeight { get; init; } = 100;
    /// <summary>On-device display size of one encoder canvas in px (strip segment or Galleon widget), for preview scaling.</summary>
    public (int Width, int Height) EncoderDisplayPixels { get; init; } = (200, 100);
    public bool HasKeys { get; init; } = true;

    public static DeviceCapabilities For(DeviceType type) => type switch
    {
        DeviceType.Plus => new() { EncoderSlots = 4, PhysicalDials = 4, HasTouchStrip = true, SupportsDialLongPress = true, MaxTicksPerEvent = 1, KeyPixels = 120 },
        DeviceType.PlusXL => new() { EncoderSlots = 6, PhysicalDials = 6, HasTouchStrip = true, SupportsDialLongPress = true, MaxTicksPerEvent = 1, KeyPixels = 112 },
        DeviceType.Galleon100SD => new()
        {
            EncoderSlots = 4, PhysicalDials = 2, DialLayers = 2, HasTouchStrip = false, SupportsDialLongPress = false,
            MaxTicksPerEvent = 12, KeyPixels = 160, EncoderDisplayPixels = (360, 180),
        },
        DeviceType.Mini => new() { KeyPixels = 80 },
        DeviceType.XL => new() { KeyPixels = 96 },
        DeviceType.Neo => new() { KeyPixels = 96 },
        DeviceType.Mobile or DeviceType.Virtual or DeviceType.McpDeck => new() { KeyPixels = 144 },
        DeviceType.Pedal => new() { KeyPixels = 0, HasKeys = true },
        _ => new() { KeyPixels = 72 },
    };
}

/// <summary>A connected (or registered) device, from the -info registration payload or deviceDidConnect.</summary>
public sealed record DeviceInfo(string Id, string Name, DeviceType Type, int Columns, int Rows)
{
    public DeviceCapabilities Capabilities => DeviceCapabilities.For(Type);
    public bool IsGalleon => Type == DeviceType.Galleon100SD;
    /// <summary>Stream Deck + or + XL (touch strip with 200×100 segments).</summary>
    public bool IsPlus => Type is DeviceType.Plus or DeviceType.PlusXL;
    public bool HasEncoders => Capabilities.EncoderSlots > 0;
    public int KeyCount => Columns * Rows;

    public static DeviceInfo Unknown(string id) => new(id, "Unknown device", DeviceType.Unknown, 0, 0);

    public static DeviceType ParseType(int raw) => Enum.IsDefined(typeof(DeviceType), raw) ? (DeviceType)raw : DeviceType.Unknown;
}

/// <summary>
/// Where an Encoder instance sits, decoded from its coordinates:
/// Stream Deck +: column = dial index (0-3), row 0, own 200×100 strip segment.
/// Galleon 100 SD: column = dial (0 left, 1 right), row = layer (0 top widget, 1 bottom widget);
/// "0,0" TL, "0,1" BL, "1,0" TR, "1,1" BR. All four widgets are visible at once.
/// </summary>
public sealed record EncoderPlacement(int Dial, int Layer, ScreenQuadrant? Quadrant, int? StripSegment)
{
    public static EncoderPlacement For(DeviceInfo device, Coordinates c)
    {
        if (device.IsGalleon)
        {
            var q = (c.Column, c.Row) switch
            {
                (0, 0) => ScreenQuadrant.TopLeft,
                (0, _) => ScreenQuadrant.BottomLeft,
                (_, 0) => ScreenQuadrant.TopRight,
                _ => ScreenQuadrant.BottomRight,
            };
            return new EncoderPlacement(c.Column, c.Row, q, null);
        }
        return new EncoderPlacement(c.Column, 0, null, device.IsPlus ? c.Column : null);
    }

    public override string ToString() => Quadrant is { } q ? $"dial {Dial} layer {Layer} ({q})" : StripSegment is { } s ? $"dial {Dial} (strip segment {s})" : $"dial {Dial}";
}
