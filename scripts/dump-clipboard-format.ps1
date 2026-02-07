param(
  [Parameter(Mandatory = $true)]
  [string]$OutDir,

  [Parameter(Mandatory = $true)]
  [string]$FormatName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class ClipboardRaw
{
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool OpenClipboard(IntPtr hWndNewOwner);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool CloseClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint EnumClipboardFormats(uint format);

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern int GetClipboardFormatName(uint format, StringBuilder lpszFormatName, int cchMaxCount);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr GetClipboardData(uint uFormat);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalLock(IntPtr hMem);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GlobalUnlock(IntPtr hMem);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern UIntPtr GlobalSize(IntPtr hMem);

  private static string GetName(uint f)
  {
    var sb = new StringBuilder(256);
    int len = GetClipboardFormatName(f, sb, sb.Capacity);
    if (len > 0) return sb.ToString();
    return "FORMAT_" + f;
  }

  private static uint FindFormatByName(string name)
  {
    // Allow numeric input as an ID (e.g. "50612")
    uint byId;
    if (UInt32.TryParse(name, out byId) && byId != 0) return byId;

    uint cur = 0;
    while (true)
    {
      cur = EnumClipboardFormats(cur);
      if (cur == 0) break;
      string n = GetName(cur);
      if (string.Equals(n, name, StringComparison.OrdinalIgnoreCase)) return cur;
    }

    // Fallback: substring match (e.g. if clipboard appends a suffix/prefix)
    cur = 0;
    while (true)
    {
      cur = EnumClipboardFormats(cur);
      if (cur == 0) break;
      string n = GetName(cur);
      if (n != null && n.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0) return cur;
    }
    return 0;
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

  public static object DumpByName(string outDir, string formatName)
  {
    EnsureOpened();
    try
    {
      uint fmt = FindFormatByName(formatName);
      if (fmt == 0)
        return new { ok = false, reason = "not_found", message = "Clipboard format not found: " + formatName };

      IntPtr h = GetClipboardData(fmt);
      if (h == IntPtr.Zero)
        return new { ok = false, reason = "get_failed", message = "GetClipboardData failed: " + Marshal.GetLastWin32Error() };

      UIntPtr szp = GlobalSize(h);
      long size = (long)szp.ToUInt64();
      if (size <= 0)
        return new { ok = false, reason = "empty", message = "GlobalSize returned 0" };

      IntPtr p = GlobalLock(h);
      if (p == IntPtr.Zero)
        return new { ok = false, reason = "lock_failed", message = "GlobalLock failed: " + Marshal.GetLastWin32Error() };

      try
      {
        byte[] bytes = new byte[size];
        Marshal.Copy(p, bytes, 0, (int)size);

        string safe = formatName;
        foreach (char c in Path.GetInvalidFileNameChars()) safe = safe.Replace(c, '_');
        string outPath = Path.Combine(outDir, safe + ".bin");
        File.WriteAllBytes(outPath, bytes);

        int headN = (int)Math.Min(64, size);
        var sb = new StringBuilder(headN * 2);
        for (int i = 0; i < headN; i++) sb.Append(bytes[i].ToString("X2"));

        return new { ok = true, id = (int)fmt, name = GetName(fmt), path = outPath, size = size, headHex = sb.ToString() };
      }
      finally
      {
        GlobalUnlock(h);
      }
    }
    finally
    {
      CloseClipboard();
    }
  }
}
"@

$res = [ClipboardRaw]::DumpByName($OutDir, $FormatName)
$res | ConvertTo-Json -Depth 6 -Compress
