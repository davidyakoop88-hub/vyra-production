Add-Type -AssemblyName System.Drawing
# Arket ligger i tools/frames/ och foljer varken med i webbimagen eller installern.
# Skriptet pekade fram till 2026-08-14 pa assets/images/profile-frames/frames-source.png,
# en sokvag som aldrig funnits - filen lag i repotroten. Bygget kunde alltsa inte koras.
$source = Join-Path $PSScriptRoot 'tools\frames\frames-source.png'
$output = Join-Path $PSScriptRoot 'assets\images\profile-frames'
$names = @('neon-purple','cyber-blue','pink-angel','golden-king','ice-crystal','galaxy','emerald','samurai','minimal-glow')
$image = [System.Drawing.Bitmap]::FromFile($source)
$cellWidth = [int]($image.Width / 3)
$cellHeight = [int]($image.Height / 3)
for ($index = 0; $index -lt 9; $index++) {
    $column = $index % 3
    $row = [math]::Floor($index / 3)
    $frame = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($frame)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sourceRect = New-Object System.Drawing.Rectangle ($column * $cellWidth), ($row * $cellHeight), $cellWidth, $cellHeight
    $graphics.DrawImage($image, (New-Object System.Drawing.Rectangle 0,0,512,512), $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()
    for ($y = 0; $y -lt 512; $y++) {
        for ($x = 0; $x -lt 512; $x++) {
            $pixel = $frame.GetPixel($x,$y)
            if ($pixel.G -gt 110 -and $pixel.G -gt ($pixel.R * 1.35) -and $pixel.G -gt ($pixel.B * 1.25)) {
                $strength = [math]::Min(255, [math]::Max(0, (($pixel.G - [math]::Max($pixel.R,$pixel.B)) * 4)))
                $alpha = 255 - $strength
                $frame.SetPixel($x,$y,[System.Drawing.Color]::FromArgb($alpha,$pixel.R,[math]::Min($pixel.G,[math]::Max($pixel.R,$pixel.B)),$pixel.B))
            }
        }
    }
    $minX=512; $minY=512; $maxX=0; $maxY=0
    for ($y = 0; $y -lt 512; $y++) {
        for ($x = 0; $x -lt 512; $x++) {
            if ($frame.GetPixel($x,$y).A -gt 18) {
                if ($x -lt $minX) {$minX=$x}; if ($x -gt $maxX) {$maxX=$x}
                if ($y -lt $minY) {$minY=$y}; if ($y -gt $maxY) {$maxY=$y}
            }
        }
    }
    $cropWidth=[math]::Max(1,$maxX-$minX+1); $cropHeight=[math]::Max(1,$maxY-$minY+1)
    $fitted = New-Object System.Drawing.Bitmap 512,512,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $fitGraphics=[System.Drawing.Graphics]::FromImage($fitted)
    $fitGraphics.Clear([System.Drawing.Color]::Transparent)
    $fitGraphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $scale=[math]::Min(472/$cropWidth,472/$cropHeight)
    $drawWidth=[int]($cropWidth*$scale); $drawHeight=[int]($cropHeight*$scale)
    $drawX=[int]((512-$drawWidth)/2); $drawY=[int]((512-$drawHeight)/2)
    $fitGraphics.DrawImage($frame,(New-Object System.Drawing.Rectangle $drawX,$drawY,$drawWidth,$drawHeight),(New-Object System.Drawing.Rectangle $minX,$minY,$cropWidth,$cropHeight),[System.Drawing.GraphicsUnit]::Pixel)
    $fitGraphics.Dispose()
    $path = Join-Path $output ($names[$index] + '.png')
    $fitted.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
    $fitted.Dispose()
    $frame.Dispose()
}
$image.Dispose()
