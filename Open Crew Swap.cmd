@echo off
cd /d "%~dp0"
set PORT=43730
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install it, then run this again.
  pause
  exit /b 1
)
start "Crew Swap" /min cmd /c "node server.cjs"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%"
