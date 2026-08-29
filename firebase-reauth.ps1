$ErrorActionPreference = "Stop"

Set-Location -LiteralPath "E:\ALL DESKTOP DATA\Documents\Inventory Management App"
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path

Write-Host ""
Write-Host "Firebase re-login for Fedora Inventory" -ForegroundColor Cyan
Write-Host "A browser window should open. Please choose your Google account." -ForegroundColor Yellow
Write-Host ""

& "$env:APPDATA\npm\firebase.cmd" login --reauth

Write-Host ""
Write-Host "If Firebase says login successful, tell Codex: done." -ForegroundColor Green
Read-Host "Press Enter to close"
