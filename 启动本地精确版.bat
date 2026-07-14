@echo off
cd /d "%~dp0"
title WB Gray Tool - Local Raw Pixel Backend
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Cannot start] Python was not found.
  echo Install Python 3.11 or newer and enable "Add Python to PATH".
  echo.
  pause
  exit /b 1
)
echo Starting WB Gray Tool...
powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort 18765 -State Listen -ErrorAction SilentlyContinue; if($c){Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue}"
python server.py
if errorlevel 1 (
  echo.
  echo The service stopped unexpectedly. Please capture the error above.
  pause
)
