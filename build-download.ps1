# Builds VYRA-Download.zip — the package a visitor gets from the "Ladda ner" button on index.html.
# Includes the full Python + Blender asset-creation toolchain (scripts, .blend source files, and the
# reference footage/sheets those scripts operate on) so downloaders can build their own themes, not just
# run the app. Excludes only pure repo/dev-environment plumbing (git history, local Node runtime, npm
# packages) and internal review/handoff pages that aren't part of the product either way.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$staging = Join-Path $root '.download-staging'
$zipPath = Join-Path $root 'VYRA-Download.zip'

if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null

$excludeDirs = @('.git', '.tools', 'node_modules', '.download-staging', '.claude')
$excludeFiles = @(
  'build-download.ps1',
  'CLAUDE-HANDOFF.md', 'CLAUDE.md', '.gitignore', 'vyra-state-backup.json', 'VYRA-Download.zip'
)

Get-ChildItem -LiteralPath $root -Force | ForEach-Object {
  if ($_.PSIsContainer) {
    if ($excludeDirs -contains $_.Name) { return }
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging $_.Name) -Recurse -Force
  } else {
    $skip = $false
    foreach ($pattern in $excludeFiles) { if ($_.Name -like $pattern) { $skip = $true; break } }
    if ($skip) { return }
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging $_.Name) -Force
  }
}

# The per-top-level-item filter above doesn't catch excluded dir names nested deeper (e.g.
# tiktok-bridge/node_modules) since those get pulled in wholesale by -Recurse on their parent folder.
# Sweep the staging area for those at any depth and remove them too.
foreach ($dirName in $excludeDirs) {
  Get-ChildItem -LiteralPath $staging -Recurse -Directory -Filter $dirName -ErrorAction SilentlyContinue |
    ForEach-Object { if (Test-Path $_.FullName) { Remove-Item -Recurse -Force $_.FullName } }
}

if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -Recurse -Force $staging

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "VYRA-Download.zip byggd ($size MB) -> $zipPath"
