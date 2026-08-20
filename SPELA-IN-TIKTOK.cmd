@echo off
REM Samma som ANSLUT-TIKTOK-LIVE.cmd, men spelar ocksa in de raa payloads TikTok skickar.
REM
REM Inspelningen ar ett FELSOKNINGSVERKTYG, inte ett normallage. Den finns for att roadmapens
REM battle-arbete (LINK_MIC_ARMIES) annars vantar pa att nagon ska hinna lasa loggen mitt i en
REM femminuters match. Med filer pa disk gar varje falt att utveckla offline i lugn och ro.
REM
REM Filerna hamnar i tiktok-bridge\inspelningar\ och ar MASKERADE: anvandar-id, smeknamn,
REM avatar-lankar och kommentarer ersatts av hashar och platshallare. Tal och faltnamn ar ororda.
REM Mappen ar gitignorerad. Titta i filerna innan du delar dem vidare.
REM
REM Slutar skriva vid 50 MB (andra med VYRA_INSPELNING_MAX_MB). Sandningen paverkas inte.
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
set VYRA_INSPELNING=1
echo.
echo === INSPELNING PA ===  filerna hamnar i tiktok-bridge\inspelningar\
echo.
node bridge.js %TIKTOK_USER%
pause
