using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;

namespace PrismControl.Core.Security;

/// <summary>
/// DPAPI (CurrentUser scope) via crypt32. System.Security.Cryptography.ProtectedData is not in the base runtime
/// (only in WindowsDesktop or as a NuGet package), so this is the zero-dependency way to protect tokens at rest.
/// </summary>
[SupportedOSPlatform("windows")]
public static class Dpapi
{
    private const int CRYPTPROTECT_UI_FORBIDDEN = 0x1;

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int cbData;
        public IntPtr pbData;
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptProtectData(ref DataBlob pDataIn, string? szDataDescr, IntPtr pOptionalEntropy,
        IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DataBlob pDataOut);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(ref DataBlob pDataIn, IntPtr ppszDataDescr, IntPtr pOptionalEntropy,
        IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DataBlob pDataOut);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr hMem);

    /// <summary>Encrypts for the current Windows user. <paramref name="entropy"/> binds the blob to a purpose (e.g. "prismcontrol/spotify").</summary>
    public static byte[] Protect(ReadOnlySpan<byte> data, ReadOnlySpan<byte> entropy = default) => Run(data, entropy, protect: true);

    /// <summary>Decrypts; throws <see cref="CryptographicException"/> for another user's blob or wrong entropy.</summary>
    public static byte[] Unprotect(ReadOnlySpan<byte> data, ReadOnlySpan<byte> entropy = default) => Run(data, entropy, protect: false);

    public static byte[] ProtectString(string text, string purpose) => Protect(Encoding.UTF8.GetBytes(text), Encoding.UTF8.GetBytes(purpose));
    public static string UnprotectString(byte[] blob, string purpose) => Encoding.UTF8.GetString(Unprotect(blob, Encoding.UTF8.GetBytes(purpose)));

    private static unsafe byte[] Run(ReadOnlySpan<byte> data, ReadOnlySpan<byte> entropy, bool protect)
    {
        // Pin both inputs for the duration of the call; an empty span still needs a valid pointer for cbData = 0.
        var dataCopy = data.Length == 0 ? new byte[1] : data.ToArray();
        fixed (byte* pData = dataCopy)
        fixed (byte* pEnt = entropy)
        {
            var inBlob = new DataBlob { cbData = data.Length, pbData = (IntPtr)pData };
            var entBlob = new DataBlob { cbData = entropy.Length, pbData = (IntPtr)pEnt };
            var pEntBlob = entropy.Length == 0 ? IntPtr.Zero : (IntPtr)(&entBlob);
            bool ok = protect
                ? CryptProtectData(ref inBlob, "PrismControl", pEntBlob, IntPtr.Zero, IntPtr.Zero, CRYPTPROTECT_UI_FORBIDDEN, out var outBlob)
                : CryptUnprotectData(ref inBlob, IntPtr.Zero, pEntBlob, IntPtr.Zero, IntPtr.Zero, CRYPTPROTECT_UI_FORBIDDEN, out outBlob);
            if (!ok) throw new CryptographicException(Marshal.GetLastPInvokeError());
            try
            {
                var result = new byte[outBlob.cbData];
                Marshal.Copy(outBlob.pbData, result, 0, result.Length);
                return result;
            }
            finally { LocalFree(outBlob.pbData); }
        }
    }
}

/// <summary>A DPAPI-protected file per secret (e.g. Spotify tokens) under a module's DataDirectory. Writes are atomic.</summary>
[SupportedOSPlatform("windows")]
public sealed class SecretStore(string directory, string purpose)
{
    public string Directory { get; } = directory;

    public void Save(string name, string secret)
    {
        System.IO.Directory.CreateDirectory(Directory);
        var path = PathFor(name);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, Dpapi.ProtectString(secret, purpose + "/" + name));
        File.Move(tmp, path, overwrite: true);
    }

    public string? Load(string name)
    {
        var path = PathFor(name);
        if (!File.Exists(path)) return null;
        try { return Dpapi.UnprotectString(File.ReadAllBytes(path), purpose + "/" + name); }
        catch (CryptographicException) { return null; }
    }

    public void Delete(string name)
    {
        var path = PathFor(name);
        if (File.Exists(path)) File.Delete(path);
    }

    private string PathFor(string name)
    {
        if (name.IndexOfAny(System.IO.Path.GetInvalidFileNameChars()) >= 0 || name.Contains("..", StringComparison.Ordinal))
            throw new ArgumentException("Invalid secret name.", nameof(name));
        return System.IO.Path.Combine(Directory, name + ".dpapi");
    }
}
