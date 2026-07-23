@echo off
setlocal
title VYRA - Bygg och installera
cd /d "%~dp0electron-app"

echo.
echo ==========================================
echo   VYRA - BYGG WINDOWS-INSTALLATION
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo FEL: Node.js saknas.
  echo Installera Node.js LTS fran https://nodejs.org och kor filen igen.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo FEL: npm saknas. Installera Node.js LTS och forsok igen.
  pause
  exit /b 1
)

echo [1/3] Installerar verifierade byggberoenden...
call npm ci
if errorlevel 1 goto :failed

echo.
echo [2/3] Bygger VYRA-Setup.exe...
call npm run build -- --win nsis --publish never
if errorlevel 1 goto :failed

if not exist "dist2\VYRA-Setup.exe" (
  echo FEL: Installationsfilen skapades inte.
  goto :failed
)

echo.
echo [3/3] Installationsfilen ar klar.
echo Oppnar VYRA-installationen...
start "" "dist2\VYRA-Setup.exe"
exit /b 0

:failed
echo.
echo Bygget misslyckades. Kopiera texten ovan och skicka den till supporten.
pause
exit /b 1
