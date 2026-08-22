# ================================================================================================
#  VISA-LIVSCYKEL.ps1 - laser ut matningen ur inspelningen.
#
#  Visar BARA _livscykel-raderna, i tidsordning, och avslutar med rumsfoljden - som ar sjalva
#  svaret: samma roomId genom en ateranslutning betyder att det ar stabilt, ett nytt roomId efter
#  en ny LIVE betyder att det byts.
#
#  Ingen grep: raderna ar JSON, och att lasa dem som text hade brutit sa fort ett falt saknades.
#  Get-Content + ConvertFrom-Json ger riktiga falt att sortera och rakna pa.
#
#  Korning:  powershell -ExecutionPolicy Bypass -File .\VISA-LIVSCYKEL.ps1
# ================================================================================================
param(
  [string]$Katalog = (Join-Path $PSScriptRoot 'inspelningar-roomid')
)

if (-not (Test-Path $Katalog)) {
  Write-Host "Ingen inspelningskatalog an: $Katalog" -ForegroundColor Yellow
  Write-Host "Kor MAT-ROOMID.cmd forst." -ForegroundColor Yellow
  exit 1
}

$filer = @(Get-ChildItem -Path $Katalog -Filter *.jsonl -ErrorAction SilentlyContinue)
if ($filer.Count -eq 0) {
  Write-Host "Inga .jsonl-filer i $Katalog" -ForegroundColor Yellow
  Write-Host "Anslot bryggan verkligen? En inspelning skapas forst vid forsta raden." -ForegroundColor Yellow
  exit 1
}

$rader = foreach ($fil in $filer) {
  foreach ($rad in (Get-Content -Path $fil.FullName)) {
    if ([string]::IsNullOrWhiteSpace($rad)) { continue }
    # En trasig sista rad ar normalt om inspelningen avbrots mitt i en skrivning - hoppa den,
    # fall inte pa den.
    try { $post = $rad | ConvertFrom-Json } catch { continue }
    if ($post.typ -ne '_livscykel') { continue }
    [pscustomobject]@{
      Tid       = $post.vid
      Handelse  = $post.handelse
      RoomId    = $post.roomId
      Anvandare = $post.username
      Moln      = $post.moln
      Forsok    = $(if ($null -ne $post.forsok) { $post.forsok } else { $post.forsokInnan })
      Orsak     = $post.orsak
      Action    = $post.action
      Lage      = $post.lage
      Fil       = $fil.Name
    }
  }
}

$rader = @($rader | Sort-Object Tid)

if ($rader.Count -eq 0) {
  Write-Host "Inspelningen finns men innehaller inga _livscykel-rader." -ForegroundColor Yellow
  Write-Host "Da kordes en brygga UTAN diagnostiken - troligen appens egen kopia i" -ForegroundColor Yellow
  Write-Host "C:\Program Files\VYRA\resources\app\tiktok-bridge\. Starta om via MAT-ROOMID.cmd." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "LIVSCYKEL - $($rader.Count) rader i tidsordning" -ForegroundColor Cyan
$rader | Format-Table Tid, Handelse, RoomId, Forsok, Orsak, Action, Lage -AutoSize

# ---- SVARET ------------------------------------------------------------------------------------
$anslutningar = @($rader | Where-Object { $_.Handelse -eq 'ansluten' -or $_.Handelse -eq 'sond-roomid' })
if ($anslutningar.Count -eq 0) {
  # Inga lyckade anslutningar ar ett giltigt matresultat, inte ett skriptfel. Utan den har grenen
  # slutade skriptet med kod 255 och sag ut att ha kraschat.
  Write-Host "INGA LYCKADE ANSLUTNINGAR i materialet." -ForegroundColor Yellow
  Write-Host "Se raderna ovan - en sond-fel-rad bar felet i klartext." -ForegroundColor Yellow
  Write-Host ""
  exit 0
}
Write-Host "ANSLUTNINGAR OCH DERAS RUM (i ordning)" -ForegroundColor Cyan
$i = 0
foreach ($a in $anslutningar) {
  $i++
  Write-Host ("  {0}. {1}  roomId={2}" -f $i, $a.Tid, $a.RoomId)
}

$unika = @($anslutningar | Select-Object -ExpandProperty RoomId -Unique)
Write-Host ""
Write-Host ("ANTAL ANSLUTNINGAR : {0}" -f $anslutningar.Count) -ForegroundColor Green
Write-Host ("UNIKA roomId       : {0}  ({1})" -f $unika.Count, ($unika -join ', ')) -ForegroundColor Green
Write-Host ""
Write-Host "Tolkning: flera anslutningar med SAMMA roomId => stabilt genom ateranslutning." -ForegroundColor Gray
Write-Host "          ett NYTT roomId efter att en ny LIVE startats => det byts mellan sandningar." -ForegroundColor Gray
Write-Host ""
