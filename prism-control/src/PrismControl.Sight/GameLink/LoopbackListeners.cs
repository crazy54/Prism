using System.Runtime.InteropServices;

namespace PrismControl.Sight.GameLink;

/// <summary>
/// Who listens on a loopback TCP port (GetExtendedTcpTable, TCP_TABLE_OWNER_PID_LISTENER, IPv4): a read of the OS
/// connection table, nothing is opened or connected. The forwarder sends its token only when the port is held by the
/// process gamelink.json names (Prism Deck), never to whoever grabbed the port while Prism Deck was down.
/// </summary>
public static partial class LoopbackListeners
{
    private const int AF_INET = 2;
    private const int TCP_TABLE_OWNER_PID_LISTENER = 3;
    private const uint Loopback = 0x0100007F;   // 127.0.0.1 in network byte order, read as a little-endian uint
    private const uint Any = 0;

    [LibraryImport("iphlpapi.dll")]
    private static partial uint GetExtendedTcpTable(nint table, ref int size, [MarshalAs(UnmanagedType.Bool)] bool sort, int af, int tableClass, uint reserved);

    /// <summary>The PIDs of every IPv4 listener on 127.0.0.1:<paramref name="port"/> or 0.0.0.0:<paramref name="port"/> (empty when none or unreadable).</summary>
    public static IReadOnlyCollection<int> OwnersOf(int port)
    {
        var owners = new HashSet<int>();
        var size = 0;
        _ = GetExtendedTcpTable(0, ref size, false, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
        for (var attempt = 0; attempt < 3 && size > 0; attempt++)
        {
            var buf = Marshal.AllocHGlobal(size);
            try
            {
                var need = size;
                var rc = GetExtendedTcpTable(buf, ref need, false, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
                if (rc == 122 /* ERROR_INSUFFICIENT_BUFFER */) { size = need; continue; }
                if (rc != 0) return owners;
                var rows = Marshal.ReadInt32(buf);
                // MIB_TCPROW_OWNER_PID: state, localAddr, localPort, remoteAddr, remotePort, owningPid (6 × DWORD).
                for (var i = 0; i < rows; i++)
                {
                    var row = buf + 4 + i * 24;
                    var addr = (uint)Marshal.ReadInt32(row + 4);
                    var rawPort = (uint)Marshal.ReadInt32(row + 8);
                    var p = (int)(((rawPort & 0xFF) << 8) | ((rawPort >> 8) & 0xFF));
                    if (p == port && (addr == Loopback || addr == Any)) owners.Add(Marshal.ReadInt32(row + 20));
                }
                return owners;
            }
            finally { Marshal.FreeHGlobal(buf); }
        }
        return owners;
    }
}
