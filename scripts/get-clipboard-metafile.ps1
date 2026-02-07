param(
  [Parameter(Mandatory = $true)]
  [string]$OutDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

public static class ClipboardMetafile
{
  private const uint CF_METAFILEPICT = 3;
  private const uint CF_ENHMETAFILE = 14;

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool OpenClipboard(IntPtr hWndNewOwner);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool CloseClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool IsClipboardFormatAvailable(uint format);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr GetClipboardData(uint uFormat);

  [DllImport("gdi32.dll", SetLastError = true)]
  private static extern uint GetEnhMetaFileBits(IntPtr hemf, uint cbBuffer, byte[] lpbBuffer);

  [DllImport("gdi32.dll", SetLastError = true)]
  private static extern uint GetMetaFileBitsEx(IntPtr hmf, uint cbBuffer, byte[] lpbBuffer);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalLock(IntPtr hMem);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GlobalUnlock(IntPtr hMem);

  [StructLayout(LayoutKind.Sequential)]
  private struct METAFILEPICT
  {
    public int mm;
    public int xExt;
    public int yExt;
    public IntPtr hMF;
  }

  private static void EnsureOpened()
  {
    bool opened = false;
    for (int i = 0; i < 30; i++)
    {
      if (OpenClipboard(IntPtr.Zero)) { opened = true; break; }
      System.Threading.Thread.Sleep(25);
    }
    if (!opened) throw new Exception("OpenClipboard failed: " + Marshal.GetLastWin32Error());
  }

  private static byte[] ReadEmfBits()
  {
    IntPtr hemf = GetClipboardData(CF_ENHMETAFILE);
    if (hemf == IntPtr.Zero) throw new Exception("GetClipboardData(CF_ENHMETAFILE) failed: " + Marshal.GetLastWin32Error());

    uint size = GetEnhMetaFileBits(hemf, 0, null);
    if (size == 0) throw new Exception("GetEnhMetaFileBits(size) failed: " + Marshal.GetLastWin32Error());

    byte[] buf = new byte[size];
    uint got = GetEnhMetaFileBits(hemf, size, buf);
    if (got == 0) throw new Exception("GetEnhMetaFileBits(data) failed: " + Marshal.GetLastWin32Error());
    if (got != size && got < size)
    {
      // Rare, but keep only what we got.
      Array.Resize(ref buf, (int)got);
    }
    return buf;
  }

  private static byte[] ReadWmfBits()
  {
    IntPtr hMem = GetClipboardData(CF_METAFILEPICT);
    if (hMem == IntPtr.Zero) throw new Exception("GetClipboardData(CF_METAFILEPICT) failed: " + Marshal.GetLastWin32Error());

    IntPtr p = GlobalLock(hMem);
    if (p == IntPtr.Zero) throw new Exception("GlobalLock failed: " + Marshal.GetLastWin32Error());
    try
    {
      METAFILEPICT mfp = Marshal.PtrToStructure<METAFILEPICT>(p);
      if (mfp.hMF == IntPtr.Zero) throw new Exception("METAFILEPICT.hMF is null");

      uint size = GetMetaFileBitsEx(mfp.hMF, 0, null);
      if (size == 0) throw new Exception("GetMetaFileBitsEx(size) failed: " + Marshal.GetLastWin32Error());

      byte[] buf = new byte[size];
      uint got = GetMetaFileBitsEx(mfp.hMF, size, buf);
      if (got == 0) throw new Exception("GetMetaFileBitsEx(data) failed: " + Marshal.GetLastWin32Error());
      if (got != size && got < size)
      {
        Array.Resize(ref buf, (int)got);
      }
      return buf;
    }
    finally
    {
      GlobalUnlock(hMem);
    }
  }

  public static object ExtractToDir(string outDir)
  {
    EnsureOpened();
    try
    {
      var items = new List<object>();

      if (IsClipboardFormatAvailable(CF_ENHMETAFILE))
      {
        var bytes = ReadEmfBits();
        string p = Path.Combine(outDir, "clipboard.emf");
        File.WriteAllBytes(p, bytes);
        items.Add(new { kind = "emf", path = p });
      }

      if (IsClipboardFormatAvailable(CF_METAFILEPICT))
      {
        var bytes = ReadWmfBits();
        string p = Path.Combine(outDir, "clipboard.wmf");
        File.WriteAllBytes(p, bytes);
        items.Add(new { kind = "wmf", path = p });
      }

      if (items.Count == 0)
        return new { ok = false, reason = "no_metafile", message = "Clipboard has no EMF/WMF metafile." };

      return new { ok = true, items = items.ToArray() };
    }
    finally
    {
      CloseClipboard();
    }
  }
}
"@

$res = [ClipboardMetafile]::ExtractToDir($OutDir)
$res | ConvertTo-Json -Depth 6 -Compress
