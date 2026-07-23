Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'assets\images\battle\slices'
New-Item -ItemType Directory -Force $out | Out-Null

$sources = @{
  x2 = Join-Path $root 'assets\images\battle\28343f58-5a4a-4c24-bafb-9db38a805c86.png'
  x3 = Join-Path $root 'assets\images\battle\0b2191c5-1297-49bc-94be-573cdf575f1d.png'
}

$rows = @(
  @{ y = 64; h = 205 }, @{ y = 283; h = 205 },
  @{ y = 558; h = 194 }, @{ y = 778; h = 194 }
)
$cellW = 296

foreach ($kind in $sources.Keys) {
  $src = [System.Drawing.Bitmap]::FromFile($sources[$kind])
  for ($i = 0; $i -lt 20; $i++) {
    $col = $i % 5
    $row = [math]::Floor($i / 5)
    $x = 20 + ($col * 303)
    $y = $rows[$row].y
    $w = [math]::Min($cellW, $src.Width - $x - 8)
    $h = $rows[$row].h
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $crop = $src.Clone($rect, $src.PixelFormat)
    if ($kind -eq 'x2') {
      $swap = New-Object System.Drawing.Bitmap($w, $h)
      $g = [System.Drawing.Graphics]::FromImage($swap)
      $half = [math]::Floor($w / 2)
      $right = $w - $half
      $g.DrawImage($crop, [System.Drawing.Rectangle]::new(0,0,$right,$h), [System.Drawing.Rectangle]::new($half,0,$right,$h), [System.Drawing.GraphicsUnit]::Pixel)
      $g.DrawImage($crop, [System.Drawing.Rectangle]::new($right,0,$half,$h), [System.Drawing.Rectangle]::new(0,0,$half,$h), [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose(); $crop.Dispose(); $crop = $swap
    }
    $name = '{0}-{1:d2}.png' -f $kind, $i
    $crop.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
  }
  $src.Dispose()
}
