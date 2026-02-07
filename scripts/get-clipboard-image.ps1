param(
  [Parameter(Mandatory = $true)]
  [string]$OutDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $img) {
  @{ ok = $false; reason = "no_image"; message = "Clipboard has no image." } | ConvertTo-Json -Compress
  exit 0
}

$p = Join-Path $OutDir "clipboard.png"
$img.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)

@{
  ok = $true
  path = $p
  width = $img.Width
  height = $img.Height
} | ConvertTo-Json -Compress

