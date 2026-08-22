@echo off
setlocal
REM ==============================================================================================
REM  MAT-ROOMID.cmd - TILLFALLIG MATNING, inte ett produktionslage.
REM
REM  Svarar pa EN fraga: ar TikToks roomId stabilt genom en ateranslutning, och byts det mellan
REM  tva sandningar? Hela sessionsmodellen vilar pa det svaret, och det gar inte att lasa sig till.
REM
REM  Filen ska tas bort igen nar matningen ar klar.
REM ==============================================================================================
cd /d "%~dp0"

REM ---- 1. KOR VI VERKLIGEN DEN ANDRADE KALLKODEN? ----------------------------------------------
REM  Den installerade appen (C:\Program Files\VYRA\resources\app\tiktok-bridge\bridge.js) har en
REM  EGEN kopia av bryggan. Startas matningen darifran spelas ingen livscykel in, och felet skulle
REM  synas forst nar loggen ar tom - efter sandningen. Darfor vagrar vi starta fel kopia.
findstr /C:"livscykel" "%~dp0tiktok-bridge\bridge.js" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  FEL: %~dp0tiktok-bridge\bridge.js saknar diagnostiken.
  echo.
  echo  Du kor en checkout utan matgrenen. Hamta den forst:
  echo      git fetch origin
  echo      git checkout diagnostik/roomid-matning
  echo.
  pause
  exit /b 1
)

REM ---- 2. INSPELNINGEN PA, MED EGEN KATALOG ------------------------------------------------------
set "VYRA_INSPELNING_TYPER=alla"
set "VYRA_INSPELNING_KATALOG=%~dp0inspelningar-roomid"
if not exist "%VYRA_INSPELNING_KATALOG%" mkdir "%VYRA_INSPELNING_KATALOG%"

REM ---- 3. SAMMA NODE SOM DEN VANLIGA STARTFILEN --------------------------------------------------
set "PATH=%~dp0.tools\node-v22.23.1-win-x64;%PATH%"
cd /d "%~dp0tiktok-bridge"
if not exist node_modules (
  echo Forsta gangen installerar vi anslutningsbiblioteket...
  call npm install
)

if "%~1"=="" (
  set /p TIKTOK_USER=TikTok-anvandarnamn utan @:
) else (
  set "TIKTOK_USER=%~1"
)

echo.
echo  ---------------------------------------------------------------
echo   Kallkod  : %CD%\bridge.js
echo   Loggar   : %VYRA_INSPELNING_KATALOG%
echo   Avsluta  : Ctrl+C, eller stang fonstret
echo  ---------------------------------------------------------------
echo.
node bridge.js %TIKTOK_USER%
pause
