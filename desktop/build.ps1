# ============================================================
#  build.ps1 - builds Ritm.exe (WebView2 host)
#  App files and the WebView2 loader are embedded into the .exe.
#
#  Requires: .NET Framework 4.x (csc.exe) + WebView2 SDK
#  (lib\net462 and runtimes\win-x64\native\WebView2Loader.dll).
#  ASCII-only source on purpose (PowerShell 5 encoding).
# ============================================================
param(
  [string]$Sdk   = (Join-Path $env:TEMP 'wv2sdk'),
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'

$desktop = $PSScriptRoot
$root    = Split-Path -Parent $desktop
if (-not $OutDir) { $OutDir = Join-Path $root 'dist' }

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe not found: $csc" }

$core = Join-Path $Sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$wf   = Join-Path $Sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$ldr  = Join-Path $Sdk 'runtimes\win-x64\native\WebView2Loader.dll'
foreach ($p in @($core, $wf, $ldr)) {
  if (-not (Test-Path $p)) { throw "SDK file not found: $p" }
}

# ---------- icon ----------
$ico = Join-Path $desktop 'app.ico'
if (-not (Test-Path $ico)) {
  & (Join-Path $desktop 'make-icon.ps1') -Out $ico
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$exe = Join-Path $OutDir 'Ritm.exe'

# ---------- app resources ----------
# resource name: APP_<relative path with '\' -> '__'>
$files = @(
  'index.html', 'widget.html', 'manifest.json', 'sw.js', 'icon.svg',
  'css\styles.css', 'css\widget.css',
  'css\chess.css', 'css\training.css', 'css\recipes.css', 'css\music.css', 'css\nutrition.css', 'css\blackjack.css',
  'js\utils.js', 'js\storage.js', 'js\model.js', 'js\stats.js',
  'js\charts.js', 'js\notifications.js', 'js\ui.js',
  'js\chess.js', 'js\training.js', 'js\recipes.js', 'js\music.js', 'js\nutrition.js', 'js\blackjack.js', 'js\modules.js',
  'js\app.js', 'js\widget.js'
)

$resArgs = @()
foreach ($rel in $files) {
  $full = Join-Path $root $rel
  if (-not (Test-Path $full)) { throw "App file not found: $full" }
  $name = 'APP_' + ($rel -replace '\\', '__')
  $resArgs += ('/resource:{0},{1}' -f $full, $name)
}
$resArgs += ('/resource:{0},LOADER_x64.dll' -f $ldr)
# managed WebView2 assemblies embedded and resolved at runtime via AssemblyResolve
$resArgs += ('/resource:{0},WV2_Core.dll' -f $core)
$resArgs += ('/resource:{0},WV2_WinForms.dll' -f $wf)

# ---------- compile ----------
$compilerArgs = @(
  '/nologo', '/target:winexe', '/platform:x64', '/optimize+',
  ('/out:{0}' -f $exe),
  ('/win32icon:{0}' -f $ico),
  ('/win32manifest:{0}' -f (Join-Path $desktop 'app.manifest')),
  ('/r:{0}' -f $core),
  ('/r:{0}' -f $wf),
  '/r:System.Windows.Forms.dll',
  '/r:System.Drawing.dll'
) + $resArgs + @((Join-Path $desktop 'Ritm.cs'))

Write-Host 'Building Ritm.exe ...' -ForegroundColor Cyan
& $csc @compilerArgs
if ($LASTEXITCODE -ne 0) { throw "csc exited with code $LASTEXITCODE" }

$size = [math]::Round((Get-Item $exe).Length / 1KB)
Write-Host ("Done: {0} ({1} KB)" -f $exe, $size) -ForegroundColor Green
