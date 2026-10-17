using System.Text.Json.Nodes;

namespace PrismControl.Ai.Ingress;

/// <summary>
/// One relay connection on the <c>ai</c> pipe, after the endpoint checked and stripped the token (the shape of
/// PrismControl.Desktop's PipeSession: <c>Hello</c> = the first frame, then length-prefixed JSON frames both ways).
/// </summary>
public interface IIngressConnection : IAsyncDisposable
{
    /// <summary>Frame 1 without its token: <c>{ "v":1, "event":{…} }</c>.</summary>
    JsonNode? Hello { get; }
    /// <summary>GetNamedPipeClientProcessId: the relay's pid (null when unavailable).</summary>
    int? ClientPid { get; }
    /// <summary>The client process's image path (production: must be our installed prism-relay.exe), or null.</summary>
    string? ClientImagePath { get; }
    /// <summary>The next frame; null on EOF. Throws on an oversize or malformed frame (the connection is then closed).</summary>
    Task<JsonNode?> ReadAsync(CancellationToken ct);
    Task WriteAsync(JsonNode frame, CancellationToken ct);
}

/// <summary>
/// The per-user named-pipe endpoint for hook relays (\\.\pipe\prism-control-ai-&lt;128-bit hex&gt;, current user only, NETWORK
/// denied, 256-bit token per start in <c>modules\ai\ingress.json</c>). Desktop's PipeEndpoint:
/// <see cref="DesktopIngressEndpoint"/>. It does not interpret messages: <see cref="AiIngress"/> does.
/// </summary>
public interface IIngressEndpoint : IAsyncDisposable
{
    string PipeName { get; }
    /// <summary>One call per accepted, token-checked connection. The endpoint disposes the connection when the task ends.</summary>
    event Func<IIngressConnection, Task>? ConnectionOpened;
    Task StartAsync(CancellationToken ct);
}
