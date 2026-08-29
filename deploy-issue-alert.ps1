$ErrorActionPreference = "Stop"

Set-Location -LiteralPath "E:\ALL DESKTOP DATA\Documents\Inventory Management App"

Write-Host ""
Write-Host "Fedora Inventory - Supabase issue alert deploy" -ForegroundColor Cyan
Write-Host "Paste the Supabase access token when asked. It will not be shown on screen." -ForegroundColor Yellow
Write-Host ""

$secureToken = Read-Host "Paste Supabase access token" -AsSecureString
$plainToken = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
)

if ([string]::IsNullOrWhiteSpace($plainToken)) {
  throw "No token entered. Please run this again and paste the token."
}

$env:SUPABASE_ACCESS_TOKEN = $plainToken

Write-Host ""
Write-Host "Deploying Supabase email alert function..." -ForegroundColor Cyan
npx.cmd supabase functions deploy send-issue-alert --project-ref tbbfbobxmqvlwapqhmin

Write-Host ""
Write-Host "Done. If the line above says deployed, issue email alerts are ready." -ForegroundColor Green
Write-Host "Important: revoke this Supabase deploy token after this is finished, because it was visible in a screenshot earlier." -ForegroundColor Yellow
Read-Host "Press Enter to close"
