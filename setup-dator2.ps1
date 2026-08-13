<#
    VYRA — uppsättning av andra datorn

    Kontrollerar verktyg, fixar Git-PATH, klonar repot och installerar
    ECC-paketet (skills + subagenter) för Claude Code.

    Körs i PowerShell som vanlig användare:
        powershell -ExecutionPolicy Bypass -File .\setup-dator2.ps1

    Skriptet installerar inget i tysthet — det rapporterar vad som saknas
    och installerar bara det du godkänner.
#>

$ErrorActionPreference = 'Stop'

$ProjectRoot = Join-Path $env:USERPROFILE 'Documents\hemsidan'
$RepoUrl     = 'https://github.com/davidyakoop88-hub/vyra-production.git'
$EccRepoUrl  = 'https://github.com/affaan-m/ECC.git'
$ClaudeHome  = Join-Path $env:USERPROFILE '.claude'

function Write-Step   ($Message) { Write-Host "`n=== $Message ===" -ForegroundColor Magenta }
function Write-Ok     ($Message) { Write-Host "  OK    $Message" -ForegroundColor Green }
function Write-Warn   ($Message) { Write-Host "  VARN  $Message" -ForegroundColor Yellow }
function Write-Fail   ($Message) { Write-Host "  SAKNAS $Message" -ForegroundColor Red }

function Test-Command ($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Confirm-Action ($Question) {
    $answer = Read-Host "$Question [j/n]"
    return $answer -match '^[jJyY]'
}

# ---------------------------------------------------------------
Write-Step 'Kontrollerar verktyg'

$gitInstallPath = 'C:\Program Files\Git'

if (Test-Command 'git') {
    Write-Ok "Git: $((git --version))"
}
elseif (Test-Path (Join-Path $gitInstallPath 'bin\git.exe')) {
    Write-Warn 'Git är installerat men saknas i PATH — samma fälla som förra gången.'

    if (Confirm-Action 'Lagga till Git i din anvandar-PATH nu?') {
        $currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $gitPaths    = @((Join-Path $gitInstallPath 'bin'), (Join-Path $gitInstallPath 'cmd'))
        $missing     = $gitPaths | Where-Object { $currentPath -notlike "*$_*" }

        if ($missing.Count -gt 0) {
            $newPath = ($currentPath.TrimEnd(';'), ($missing -join ';')) -join ';'
            [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
            $env:Path = "$env:Path;$($missing -join ';')"
            Write-Ok 'Git tillagt i PATH. Starta om terminalen efter skriptet.'
        }
    }
}
else {
    Write-Fail 'Git — ladda ner: https://git-scm.com/download/win'
}

if (Test-Command 'py') {
    $pythonVersion = (py -3.13 --version 2>&1)
    if ($LASTEXITCODE -eq 0) { Write-Ok "Python: $pythonVersion" }
    else { Write-Warn 'Python 3.13 saknas. Anvand 3.13 — inte 3.15 beta.' }
}
else {
    Write-Fail 'Python — ladda ner 3.13 fran https://www.python.org/downloads/'
}

if (Test-Command 'ffmpeg') { Write-Ok 'FFmpeg hittad' }
else { Write-Fail 'FFmpeg — https://www.gyan.dev/ffmpeg/builds/ (lagg bin-mappen i PATH)' }

if (Test-Command 'node') { Write-Ok "Node: $((node --version))" }
else { Write-Warn 'Node saknas — behovs bara om du kor Electron-appen lokalt.' }

if (Test-Command 'claude') { Write-Ok 'Claude Code installerat' }
else { Write-Fail 'Claude Code — installera via https://claude.com/product/claude-code' }

# ---------------------------------------------------------------
Write-Step 'Projektmapp'

if (Test-Path $ProjectRoot) {
    Write-Ok "Finns redan: $ProjectRoot"
    Write-Warn 'Kor "git pull" dar innan du borjar jobba.'
}
elseif (Test-Command 'git') {
    if (Confirm-Action "Klona repot till $ProjectRoot ?") {
        $parentFolder = Split-Path $ProjectRoot -Parent
        if (-not (Test-Path $parentFolder)) { New-Item -ItemType Directory -Path $parentFolder | Out-Null }

        git clone $RepoUrl $ProjectRoot
        if ($LASTEXITCODE -eq 0) { Write-Ok 'Repot klonat.' }
        else { Write-Warn 'Kloningen misslyckades — repot ar privat, logga in med "gh auth login" eller en PAT.' }
    }
}
else {
    Write-Warn 'Hoppar over kloning — Git maste fungera forst.'
}

# ---------------------------------------------------------------
Write-Step 'ECC — skills och subagenter for Claude Code'

$skillsTarget = Join-Path $ClaudeHome 'skills'
$agentsTarget = Join-Path $ClaudeHome 'agents'

if (-not (Test-Command 'git')) {
    Write-Warn 'Hoppar over ECC — Git maste fungera forst.'
}
elseif (Confirm-Action 'Installera ECC-skills och subagenter?') {
    $tempFolder = Join-Path $env:TEMP ("ecc-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))

    try {
        git clone --depth 1 --filter=blob:none --sparse $EccRepoUrl $tempFolder
        Push-Location $tempFolder
        git sparse-checkout set .agents/skills agents
        Pop-Location

        foreach ($pair in @(
            @{ Source = Join-Path $tempFolder '.agents\skills'; Target = $skillsTarget; Label = 'skills' },
            @{ Source = Join-Path $tempFolder 'agents';         Target = $agentsTarget; Label = 'subagenter' }
        )) {
            if (-not (Test-Path $pair.Source)) {
                Write-Warn "Hittade inte $($pair.Label) i repot — strukturen kan ha andrats."
                continue
            }

            if (-not (Test-Path $pair.Target)) { New-Item -ItemType Directory -Path $pair.Target -Force | Out-Null }

            Get-ChildItem $pair.Source | ForEach-Object {
                $destination = Join-Path $pair.Target $_.Name
                if (Test-Path $destination) {
                    Copy-Item $destination "$destination.bak" -Recurse -Force
                }
                Copy-Item $_.FullName $pair.Target -Recurse -Force
            }

            $installedCount = (Get-ChildItem $pair.Target | Measure-Object).Count
            Write-Ok "$($pair.Label): $installedCount poster i $($pair.Target)"
        }
    }
    catch {
        Write-Warn "ECC-installationen misslyckades: $($_.Exception.Message)"
    }
    finally {
        if (Test-Path $tempFolder) { Remove-Item $tempFolder -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# ---------------------------------------------------------------
Write-Step 'Kvar att gora manuellt'

Write-Host @'
  1. Assets foljer med klonen. assets\gifts\ och assets\videos\ ar spardade
     i git, sa du behover INTE kopiera dem for hand. Bara ravideor och
     renderade sekvenser (renders\, out\) ligger utanfor git.

  2. Exportera state pa datorn dar dina scener finns, importera har.
     Knapparna sitter under Installningar i Studio (vyra-state-sync.js laddas
     redan av studio.html — inget att kopiera in for hand).

  3. Rutin varje gang: git pull innan du borjar, git push innan du slutar.
'@ -ForegroundColor Gray

Write-Host ''
