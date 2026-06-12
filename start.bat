@echo off
echo ==========================================
echo Starting ClipForge in Background...
echo ==========================================
wscript.exe "%~dp0start_hidden.vbs"
echo ClipForge has been started in the background (no windows).
echo Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3001
