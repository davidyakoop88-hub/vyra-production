@echo off
cd /d "%~dp0"
if exist "%~dp0electron-app\dist\VYRA-Setup.exe" copy /y "%~dp0electron-app\dist\VYRA-Setup.exe" "%~dp0VYRA-Setup.exe" >nul
start "TikStreamer Server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173/"
