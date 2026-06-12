@echo off
echo ==========================================
echo Restarting ClipForge...
echo ==========================================

echo Stopping existing ClipForge processes...
powershell -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
powershell -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

timeout /t 2 /nobreak >nul

echo Starting ClipForge in Background...
wscript.exe "%~dp0start_hidden.vbs"

echo.
echo ClipForge restarted successfully!
echo Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3001
