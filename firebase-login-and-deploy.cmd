@echo off
setlocal
cd /d "E:\ALL DESKTOP DATA\Documents\Inventory Management App"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
set "XDG_CONFIG_HOME=E:\ALL DESKTOP DATA\Documents\Inventory Management App\.firebase-cli-config"

echo.
echo Firebase login for Fedora Inventory
echo A browser page may open. Choose the Firebase Google account and allow access.
echo After login succeeds, this window will deploy hosting automatically.
echo.

call firebase.cmd login --reauth
if errorlevel 1 (
  echo.
  echo Login failed or was cancelled. Keep this window open and tell Codex.
  pause
  exit /b 1
)

echo.
echo Login completed. Deploying production hosting...
call firebase.cmd deploy --only hosting --project fedora-inventory-management

echo.
echo Finished. If the deploy line says "Deploy complete", production is updated.
pause
