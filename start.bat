@echo off
title TGM Dashboard Launcher

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found - please install Node.js from https://nodejs.org
  pause
  exit /b 1
)

if not exist "%~dp0server\package.json" (
  echo [ERROR] server folder not found at %~dp0server
  pause
  exit /b 1
)

echo Starting TGM API...
start "TGM API - DO NOT CLOSE" cmd /k "cd /d "%~dp0server" && npm run dev"

echo Starting TGM Web...
timeout /t 4 /nobreak >nul
start "TGM Web - DO NOT CLOSE" cmd /k "cd /d "%~dp0web" && npm run dev"

echo Opening browser...
timeout /t 6 /nobreak >nul
start http://localhost:5173

echo.
echo Done! Keep the two black windows open while using the system.
echo If the browser shows an error, wait 10 seconds and reload.
pause
