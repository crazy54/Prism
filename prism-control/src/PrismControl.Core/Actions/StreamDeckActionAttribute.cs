namespace PrismControl.Core.Actions;

[Flags]
public enum Controllers
{
    None = 0,
    Keypad = 1,
    /// <summary>Stream Deck + dials/strip and the Galleon 100 SD dials/screen widgets.</summary>
    Encoder = 2,
}

/// <summary>setImage / setTitle target (0 both, 1 hardware only, 2 software only).</summary>
public enum Target { Both = 0, Hardware = 1, Software = 2 }

/// <summary>
/// Declares a Stream Deck action. The manifest is generated from these attributes; nobody edits a registry.
/// <code>
/// [StreamDeckAction("com.jeremyfhall.prismcontrol.audio.volume", Name = "Volume",
///     Controllers = Controllers.Keypad | Controllers.Encoder, Icon = "imgs/actions/volume/icon", Layout = "layouts/prism-value.json")]
/// public sealed class VolumeAction : DialAction&lt;VolumeSettings&gt; { ... }
/// </code>
/// Image paths omit the file extension (the app picks .svg/.png and @2x); layout/PI paths include it.
/// </summary>
[AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
public sealed class StreamDeckActionAttribute(string uuid) : Attribute
{
    public const string PluginUuid = "com.jeremyfhall.prismcontrol";
    public const string DefaultIcon = "imgs/actions/default/icon";
    public const string DefaultKeyImage = "imgs/actions/default/key";
    public const string DefaultEncoderIcon = "imgs/actions/default/dial";
    public const string DefaultPropertyInspector = "pi/default.html";

    /// <summary>"com.jeremyfhall.prismcontrol.&lt;domain&gt;.&lt;id&gt;". Never change it after release.</summary>
    public string Uuid { get; } = uuid;
    /// <summary>Shown in the actions list (about 30 characters or less).</summary>
    public string Name { get; set; } = "";
    public Controllers Controllers { get; set; } = Controllers.Keypad;
    /// <summary>Action-list icon: 20×20 (+40×40 @2x) monochrome white SVG/PNG, path without extension.</summary>
    public string? Icon { get; set; }
    public string? Tooltip { get; set; }
    /// <summary>Default key image (state 0), 72×72 (+144 @2x) SVG/PNG/GIF without extension.</summary>
    public string? KeyImage { get; set; }
    /// <summary>Optional state-1 image. Setting it gives the action two states.</summary>
    public string? KeyImageAlt { get; set; }
    /// <summary>Encoder layout: a built-in id ("$A0", "$A1", "$B1", "$B2", "$C1", "$X1") or "layouts/&lt;file&gt;.json".</summary>
    public string? Layout { get; set; }
    /// <summary>Dial icon shown in the app (72×72 SVG/PNG without extension).</summary>
    public string? EncoderIcon { get; set; }
    /// <summary>Strip segment background (200×100 SVG/PNG without extension).</summary>
    public string? EncoderBackground { get; set; }
    /// <summary>#RRGGBB used for the dial stack in the app.</summary>
    public string? StackColor { get; set; }
    public string? TriggerRotate { get; set; }
    public string? TriggerPush { get; set; }
    /// <summary>Stream Deck + only (Galleon has no touch).</summary>
    public string? TriggerTouch { get; set; }
    /// <summary>Stream Deck + only.</summary>
    public string? TriggerLongTouch { get; set; }
    /// <summary>Property inspector page, e.g. "pi/audio-volume.html". Default: "pi/default.html" (auto form).</summary>
    public string? PropertyInspector { get; set; }
    public bool VisibleInActionsList { get; set; } = true;
    public bool SupportedInMultiActions { get; set; } = true;
    public bool UserTitleEnabled { get; set; } = true;
    /// <summary>True (default): the plugin owns the state; the app does not auto-toggle 2-state actions.</summary>
    public bool DisableAutomaticStates { get; set; } = true;
    public bool ShowTitle { get; set; } = true;
}
