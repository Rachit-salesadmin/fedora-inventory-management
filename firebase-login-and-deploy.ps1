$ErrorActionPreference = "Stop"

Set-Location -LiteralPath "E:\ALL DESKTOP DATA\Documents\Inventory Management App"
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path

$logPath = Join-Path (Get-Location) "firebase-deploy-run.log"

function Log-Step($message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
  Write-Host $line -ForegroundColor Cyan
  Add-Content -Path $logPath -Value $line
}

Log-Step "Starting Firebase re-login for Fedora Inventory."
Write-Host ""
Write-Host "A browser window may open. If it asks, choose the Firebase Google account and allow access." -ForegroundColor Yellow
Write-Host "After Firebase says login successful, this same window will deploy production hosting automatically." -ForegroundColor Yellow
Write-Host ""

& "$env:APPDATA\npm\firebase.cmd" login --reauth

Log-Step "Firebase login completed. Deploying hosting to production."
& "$env:APPDATA\npm\firebase.cmd" deploy --only hosting --project fedora-inventory-management

Log-Step "Deploy command finished."
Write-Host ""
Write-Host "If the line above says Deploy complete, production is updated." -ForegroundColor Green
Read-Host "Press Enter to close"
