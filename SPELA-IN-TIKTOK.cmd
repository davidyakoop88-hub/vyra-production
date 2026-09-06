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
REM STANDARDVARDENA SATTS HAR, for de gamla motarbetade skriptets eget syfte.
REM
REM Utan VYRA_INSPELNING_TYPER spelas bara elva av TikToks 67 handelsetyper in - och det ar de
REM ovriga man behover nar man felsoker. Utan VYRA_INSPELNING_MAX_MB slutar filen vaxa vid 50 MB.
REM Bada var dokumenterade i docs/lansering.md som nagot man skulle satta FORE start, och bada
REM glomdes: tre inspelningar i rad (2026-09-02 och 2026-09-04) slog i 50 MB-taket och kapades
REM mitt i, och en av dem saknade de typer matningen gallde.
REM
REM 2026-09-05 med `alla` och 400 MB blev filerna 44 MB och 19 MB - alltsa ohuggna, och de bar
REM guardian_entrance och LINK_MIC_ARMIES som gav grundorsaken till fyra buggar samma kvall.
REM
REM Ett varde satt i miljon VINNER over det har: `set VYRA_INSPELNING_MAX_MB=100` fore anropet
REM galler fortfarande. Det har ar en standard, inte ett tvang.
if not defined VYRA_INSPELNING_TYPER set VYRA_INSPELNING_TYPER=alla
if not defined VYRA_INSPELNING_MAX_MB set VYRA_INSPELNING_MAX_MB=400
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
REM VISA INSTALLNINGARNA. Att de STAR ratt maste ga att se INNAN sandningen, inte kontrolleras
REM efterat i en fil som redan ar kapad. Tre inspelningar gick forlorade pa just det.
echo === INSPELNING PA ===  filerna hamnar i tiktok-bridge\inspelningar\
echo     typer: %VYRA_INSPELNING_TYPER%    tak: %VYRA_INSPELNING_MAX_MB% MB
echo.
node bridge.js %TIKTOK_USER%
pause
