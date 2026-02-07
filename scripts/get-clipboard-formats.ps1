Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ClipboardFormats
{
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool OpenClipboard(IntPtr hWndNewOwner);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool CloseClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint EnumClipboardFormats(uint format);

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern int GetClipboardFormatName(uint format, StringBuilder lpszFormatName, int cchMaxCount);

  private static string KnownName(uint f)
  {
    switch (f)
    {
      case 1: return "CF_TEXT";
      case 2: return "CF_BITMAP";
      case 3: return "CF_METAFILEPICT";
      case 4: return "CF_SYLK";
      case 5: return "CF_DIF";
      case 6: return "CF_TIFF";
      case 7: return "CF_OEMTEXT";
      case 8: return "CF_DIB";
      case 9: return "CF_PALETTE";
      case 10: return "CF_PENDATA";
      case 11: return "CF_RIFF";
      case 12: return "CF_WAVE";
      case 13: return "CF_UNICODETEXT";
      case 14: return "CF_ENHMETAFILE";
      case 15: return "CF_HDROP";
      case 16: return "CF_LOCALE";
      case 17: return "CF_DIBV5";
      case 0x0080: return "CF_OWNERDISPLAY";
      case 0x0081: return "CF_DSPTEXT";
      case 0x0082: return "CF_DSPBITMAP";
      case 0x0083: return "CF_DSPMETAFILEPICT";
      case 0x008E: return "CF_DSPENHMETAFILE";
      default: return null;
    }
  }

  private static string GetFormatName(uint f)
  {
    var sb = new StringBuilder(256);
    int len = GetClipboardFormatName(f, sb, sb.Capacity);
    if (len > 0) return sb.ToString();
    return KnownName(f) ?? ("FORMAT_" + f);
  }

  public static object[] ListFormats()
  {
    bool opened = false;
    for (int i = 0; i < 30; i++)
    {
      if (OpenClipboard(IntPtr.Zero)) { opened = true; break; }
      System.Threading.Thread.Sleep(25);
    }
    if (!opened) throw new Exception("OpenClipboard failed: " + Marshal.GetLastWin32Error());

    try
    {
      var list = new List<object>();
      uint cur = 0;
      while (true)
      {
        cur = EnumClipboardFormats(cur);
        if (cur == 0) break;
        list.Add(new { id = (int)cur, name = GetFormatName(cur) });
      }
      return list.ToArray();
    }
    finally
    {
      CloseClipboard();
    }
  }
}
"@

$formats = [ClipboardFormats]::ListFormats()
$formats | ConvertTo-Json -Depth 4 -Compress

