using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Ai.Ingress;

/// <summary>
/// The <c>ai</c> pipe on PrismControl.Desktop's <see cref="PipeEndpoint"/> (current user only, NETWORK denied, remote clients
/// rejected, first-instance, 128-bit name and 256-bit token per start, the discovery file
/// <c>%APPDATA%\Prism\control\modules\ai\ingress.json</c> written after listening and removed on a clean exit).
/// Options per ai-apps.md §5.5: 16 instances, 64 KB frames, a 1 s read timeout.
/// </summary>
public sealed class DesktopIngressEndpoint : IIngressEndpoint
{
    public const int MaxInstances = 16;
    public const int MaxFrameBytes = 64 * 1024;
    public static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(1);

    private readonly PipeEndpoint _endpoint;

    public DesktopIngressEndpoint(string? discoveryFile, ILog? log = null)
    {
        _endpoint = new PipeEndpoint(new PipeEndpointOptions
        {
            Name = "ai",
            MaxInstances = MaxInstances,
            MaxFrameBytes = MaxFrameBytes,
            ReadTimeout = ReadTimeout,
            DiscoveryFile = discoveryFile,
        }, log);
        _endpoint.SessionOpened += async session =>
        {
            var handler = ConnectionOpened;
            if (handler is null) return;
            await using var c = new Connection(session);
            await handler(c).ConfigureAwait(false);
        };
    }

    public string PipeName => _endpoint.PipeName;

    public int RejectedClients => _endpoint.RejectedClients;

    public event Func<IIngressConnection, Task>? ConnectionOpened;

    public Task StartAsync(CancellationToken ct) => _endpoint.StartAsync(ct);

    public ValueTask DisposeAsync() => _endpoint.DisposeAsync();

    private sealed class Connection(PipeSession session) : IIngressConnection
    {
        public JsonNode? Hello => session.Hello;
        public int? ClientPid => session.ClientPid;
        public string? ClientImagePath => session.ClientImagePath;
        public Task<JsonNode?> ReadAsync(CancellationToken ct) => session.ReadAsync(ct);
        public Task WriteAsync(JsonNode frame, CancellationToken ct) => session.WriteAsync(frame, ct);
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;   // the endpoint closes the session when the handler returns
    }
}
