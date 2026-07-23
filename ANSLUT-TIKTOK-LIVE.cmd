@echo off
cd /d "%~dp0tiktok-bridge"
set PATH=%~dp0.tools\node-v22.23.1-win-x64;%PATH%
if not exist node_modules (
  echo Forsta gangen installerar vi anslutningsbiblioteket...
  call npm install
)
if "%~1"=="" (
  set /p TIKTOK_USER=TikTok-anvandarnamn utan @:
) else (
  set TIKTOK_USER=%~1
)
node bridge.js %TIKTOK_USER%
pause
