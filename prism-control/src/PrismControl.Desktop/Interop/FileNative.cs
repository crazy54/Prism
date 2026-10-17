using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace PrismControl.Desktop.Interop;

/// <summary>File operations .NET does not expose: POSIX-semantics rename-replace and hard links (RelayInstaller).</summary>
internal static unsafe partial class FileNative
{
    public const int ERROR_ACCESS_DENIED = 5, ERROR_SHARING_VIOLATION = 32, ERROR_ALREADY_EXISTS = 183;
    private const uint DELETE = 0x00010000, SYNCHRONIZE = 0x00100000;
    private const uint FILE_SHARE_READ = 1, FILE_SHARE_WRITE = 2, FILE_SHARE_DELETE = 4, OPEN_EXISTING = 3;
    private const int FileRenameInfoEx = 22;
    private const uint FILE_RENAME_FLAG_REPLACE_IF_EXISTS = 0x1, FILE_RENAME_FLAG_POSIX_SEMANTICS = 0x2;

    [LibraryImport("kernel32.dll", EntryPoint = "CreateFileW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial SafeFileHandle CreateFile(string name, uint access, uint share, nint sa, uint disposition, uint flags, nint template);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial int SetFileInformationByHandle(SafeFileHandle h, int cls, void* info, uint size);

    [LibraryImport("kernel32.dll", EntryPoint = "CreateHardLinkW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial int CreateHardLink(string newLink, string existing, nint sa);

    /// <summary>
    /// Renames <paramref name="source"/> over <paramref name="target"/> in ONE operation with POSIX semantics
    /// (FileRenameInfoEx, REPLACE_IF_EXISTS | POSIX_SEMANTICS; Windows 10 1709+ on NTFS): the target name never stops
    /// existing. Returns 0 on success, else the Win32 error.
    /// </summary>
    public static int PosixReplace(string source, string target)
    {
        using var h = CreateFile(source, DELETE | SYNCHRONIZE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, 0, OPEN_EXISTING, 0, 0);
        if (h.IsInvalid) return Marshal.GetLastPInvokeError();
        var full = Path.GetFullPath(target);
        var nameBytes = full.Length * sizeof(char);
        // FILE_RENAME_INFO: { DWORD Flags (union with BOOLEAN); HANDLE RootDirectory; DWORD FileNameLength; WCHAR FileName[] }.
        var headerSize = (int)Marshal.OffsetOf<RenameInfo>(nameof(RenameInfo.FileName));
        var size = headerSize + nameBytes + sizeof(char);
        var buffer = stackalloc byte[size];
        new Span<byte>(buffer, size).Clear();
        var info = (RenameInfo*)buffer;
        info->Flags = FILE_RENAME_FLAG_REPLACE_IF_EXISTS | FILE_RENAME_FLAG_POSIX_SEMANTICS;
        info->RootDirectory = 0;
        info->FileNameLength = (uint)nameBytes;
        full.AsSpan().CopyTo(new Span<char>(buffer + headerSize, full.Length));
        return SetFileInformationByHandle(h, FileRenameInfoEx, buffer, (uint)size) != 0 ? 0 : Marshal.GetLastPInvokeError();
    }

    /// <summary>Creates <paramref name="newLink"/> as another name of <paramref name="existing"/>. 0 on success, else the Win32 error.</summary>
    public static int HardLink(string newLink, string existing) => CreateHardLink(newLink, existing, 0) != 0 ? 0 : Marshal.GetLastPInvokeError();

    [StructLayout(LayoutKind.Sequential)]
    private struct RenameInfo
    {
        public uint Flags;
        public nint RootDirectory;
        public uint FileNameLength;
        public char FileName;
    }
}
