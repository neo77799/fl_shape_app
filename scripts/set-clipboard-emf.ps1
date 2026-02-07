param(
  [Parameter(Mandatory = $true)]
  [string]$EmfPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $EmfPath)) {
  throw "EMF file not found: $EmfPath"
}

$emfBytes = [System.IO.File]::ReadAllBytes($EmfPath)

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class EmfClipboard
{
  private const uint CF_ENHMETAFILE = 14;

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool OpenClipboard(IntPtr hWndNewOwner);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool CloseClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool EmptyClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr SetClipboardData(uint uFormat, IntPtr hMem);

  [DllImport("gdi32.dll", SetLastError = true)]
  private static extern IntPtr SetEnhMetaFileBits(uint cbBuffer, byte[] lpData);

  [DllImport("gdi32.dll", SetLastError = true)]
  private static extern bool DeleteEnhMetaFile(IntPtr hemf);

  public static void SetEmf(byte[] emfBytes)
  {
    if (emfBytes == null || emfBytes.Length == 0) throw new ArgumentException("Empty EMF bytes");

    IntPtr hemf = SetEnhMetaFileBits((uint)emfBytes.Length, emfBytes);
    if (hemf == IntPtr.Zero)
      throw new Exception("SetEnhMetaFileBits failed: " + Marshal.GetLastWin32Error());

    // OpenClipboard can fail if another process holds it.
    bool opened = false;
    for (int i = 0; i < 20; i++)
    {
      if (OpenClipboard(IntPtr.Zero)) { opened = true; break; }
      System.Threading.Thread.Sleep(25);
    }
    if (!opened)
    {
      DeleteEnhMetaFile(hemf);
      throw new Exception("OpenClipboard failed: " + Marshal.GetLastWin32Error());
    }

    try
    {
      if (!EmptyClipboard())
      {
        DeleteEnhMetaFile(hemf);
        throw new Exception("EmptyClipboard failed: " + Marshal.GetLastWin32Error());
      }

      // On success, the system owns the handle; do not delete it.
      IntPtr res = SetClipboardData(CF_ENHMETAFILE, hemf);
      if (res == IntPtr.Zero)
      {
        DeleteEnhMetaFile(hemf);
        throw new Exception("SetClipboardData(CF_ENHMETAFILE) failed: " + Marshal.GetLastWin32Error());
      }
    }
    finally
    {
      CloseClipboard();
    }
  }
}
"@

[EmfClipboard]::SetEmf($emfBytes)

