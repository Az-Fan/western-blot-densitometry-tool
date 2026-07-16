param(
  [string]$PythonExe = "python"
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

& $PythonExe -m PyInstaller `
  --noconfirm `
  --clean `
  --windowed `
  --onedir `
  --name "WB-Densitometry" `
  --hidden-import tifffile `
  --hidden-import webview.platforms.edgechromium `
  --hidden-import scipy.ndimage `
  --hidden-import scipy.signal `
  --exclude-module scipy.tests `
  --exclude-module numpy.tests `
  --exclude-module webview.platforms.android `
  --exclude-module webview.platforms.gtk `
  --exclude-module webview.platforms.qt `
  --add-data "index.html;." `
  --add-data "app.js;." `
  --add-data "matrix.js;." `
  --add-data "studio.js;." `
  --add-data "style.css;." `
  --add-data "dashboard.css;." `
  --add-data "interaction.css;." `
  --add-data "matrix.css;." `
  --add-data "modal.css;." `
  --add-data "panel.css;." `
  --add-data "simplify.css;." `
  --add-data "polish.css;." `
  --add-data "studio.css;." `
  --add-data "welcome.css;." `
  --add-data "vendor;vendor" `
  desktop/desktop.py

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller build failed with exit code $LASTEXITCODE"
}

Write-Host "Desktop build created at: $ProjectRoot\dist\WB-Densitometry\WB-Densitometry.exe"
